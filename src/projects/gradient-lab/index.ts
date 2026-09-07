import './style.css';
import { pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { createProjectPage, downloadText } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CHALLENGES, getOptimizer, getSurface, SURFACES } from './data';
import { createLandscape, createLossHistory } from './diagram';
import {
  createComparison, inBounds, MAX_ITERATIONS, stepComparison, validateSettings,
} from './engine';
import type { Method, Point } from './engine';
import { createInterface, formatNumber } from './ui';
import { createGradientWorkspace } from './workspace';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'gradient-lab');
  const ui = createInterface(page.root);
  const workspace = createGradientWorkspace(page);
  const landscape = createLandscape(ui.mapHost, page.signal);
  const history = createLossHistory(ui.lossHost, page.signal);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = context.reducedMotion || preference.matches;
  let surface = SURFACES[0];
  let start = { ...surface.start };
  let learningRate = surface.learningRate;
  let runs = createComparison(surface, start, { learningRate });
  let selected: Method = 'gd';
  let round = 0;
  let runNumber = 1;
  let paused = true;
  let speed = 4;
  let accumulator = 0;
  let setupName = 'Bowl baseline';
  let challengeNote = 'Begin with a prediction: which path will move furthest on its first update? Step once, then inspect each method’s actual Δθ.';
  let pointerStart: { id: number; position: Point } | null = null;

  page.onCleanup(() => landscape.dispose());
  page.onCleanup(() => history.dispose());
  const loop = createLoop((_elapsed, delta) => {
    if (paused || page.signal.aborted) return;
    accumulator += delta;
    if (accumulator >= 1 / speed) {
      accumulator -= 1 / speed;
      advance();
    }
  }, { paused: true });
  page.onCleanup(() => loop.destroy());

  function notify(message: string) {
    if (page.signal.aborted) return;
    ui.feedback.textContent = message;
  }

  function refresh() {
    if (page.signal.aborted) return;
    ui.update({
      surface, start, runs, selected, learningRate, round, runNumber, paused,
      reducedMotion, setupName, challengeNote,
    });
    landscape.render({ surface, start, runs, selected, showGradients: ui.gradients.checked });
    history.render(runs, selected);
  }

  function setPaused(value: boolean, announce = true) {
    if (page.signal.aborted) return;
    if (!value && !runs.some((run) => run.status === 'active')) {
      notify('Every path has stopped. Reset or change the setup to start a fresh comparison.');
      return;
    }
    paused = value;
    accumulator = 0;
    loop.setPaused(value);
    refresh();
    if (announce) {
      notify(value
        ? `Paused at comparison round ${round}. Every displayed point is an actual computed sample.`
        : `Playing at ${speed} comparison rounds per second. Stopped methods will keep their final values.`);
    }
  }

  function advance() {
    if (page.signal.aborted || round >= MAX_ITERATIONS || !runs.some((run) => run.status === 'active')) return;
    runs = stepComparison(surface, runs, { learningRate });
    round++;
    if (!runs.some((run) => run.status === 'active')) {
      paused = true;
      accumulator = 0;
      loop.setPaused(true);
      notify('All three paths have stopped. Inspect their reasons; reset or change the setup to continue.');
    }
    refresh();
  }

  function resetRun(message = 'Reset to t = 0. Paths and optimizer memory cleared; the current start and learning rate are kept.') {
    if (page.signal.aborted) return;
    paused = true;
    accumulator = 0;
    loop.setPaused(true);
    runs = createComparison(surface, start, { learningRate });
    round = 0;
    runNumber++;
    ui.syncSetup(surface, start, learningRate);
    refresh();
    notify(message);
  }

  function clearChallenge() {
    ui.challengeButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
    setupName = 'Custom setup';
    challengeNote = 'Your own experiment. Change one variable at a time and compare the actual paths, not just the final loss.';
  }

  function applyRate(value: number) {
    try {
      validateSettings({ learningRate: value });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ui.exactRate.setAttribute('aria-invalid', 'true');
      notify(`Rate not applied. ${error.message} The current run and histories are unchanged.`);
      return;
    }
    ui.exactRate.removeAttribute('aria-invalid');
    if (value === learningRate) return;
    learningRate = value;
    clearChallenge();
    resetRun(`Learning rate changed to ${Number(learningRate.toPrecision(6))}. All three histories restart at t = 0.`);
  }

  function applyStart(point: Point) {
    ui.startX.removeAttribute('aria-invalid');
    ui.startY.removeAttribute('aria-invalid');
    if (!inBounds(point, surface.bounds)) {
      if (!Number.isFinite(point.x) || point.x < surface.bounds.xMin || point.x > surface.bounds.xMax) {
        ui.startX.setAttribute('aria-invalid', 'true');
      }
      if (!Number.isFinite(point.y) || point.y < surface.bounds.yMin || point.y > surface.bounds.yMax) {
        ui.startY.setAttribute('aria-invalid', 'true');
      }
      notify('Start not applied. Enter finite x and y values inside the visible bounds. The current run is unchanged.');
      return;
    }
    start = { ...point };
    clearChallenge();
    resetRun(`New shared start (${formatNumber(start.x)}, ${formatNumber(start.y)}). All histories and moments reset to t = 0.`);
  }

  const listenerOptions = { signal: page.signal };
  ui.step.addEventListener('click', () => {
    setPaused(true, false);
    advance();
    const inspected = runs.find((run) => run.method === selected)!;
    notify(`Round ${round}. ${getOptimizer(selected).name}: t = ${inspected.iteration}, loss ${formatNumber(inspected.loss)}. ${inspected.status === 'active' ? 'Paused for inspection.' : inspected.reason}`);
  }, listenerOptions);
  ui.play.addEventListener('click', () => setPaused(!paused), listenerOptions);
  ui.reset.addEventListener('click', () => resetRun(), listenerOptions);
  ui.speed.addEventListener('change', () => {
    speed = Number(ui.speed.value);
    accumulator = 0;
    notify(`Playback pace is ${speed} rounds per second. The numerical updates and histories are unchanged.`);
  }, listenerOptions);
  ui.surface.addEventListener('change', () => {
    surface = getSurface(ui.surface.value);
    start = { ...surface.start };
    learningRate = surface.learningRate;
    clearChallenge();
    setupName = `${surface.name} baseline`;
    challengeNote = surface.subtitle;
    resetRun(`${surface.name} loaded with its suggested rate and start. All histories begin again at t = 0.`);
  }, listenerOptions);
  ui.rate.addEventListener('input', () => applyRate(Number((10 ** Number(ui.rate.value)).toPrecision(12))), listenerOptions);
  ui.exactRate.addEventListener('change', () => applyRate(ui.exactRate.valueAsNumber), listenerOptions);
  ui.startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyStart({ x: ui.startX.valueAsNumber, y: ui.startY.valueAsNumber });
  }, listenerOptions);
  ui.gradients.addEventListener('change', refresh, listenerOptions);
  ui.methodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selected = button.dataset.method as Method;
      refresh();
      notify(`Inspecting ${getOptimizer(selected).name}. All three paths and their histories are retained.`);
    }, listenerOptions);
  });
  ui.challengeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const challenge = CHALLENGES.find((item) => item.id === button.dataset.challenge)!;
      surface = getSurface(challenge.surfaceId);
      start = { ...challenge.start };
      learningRate = challenge.learningRate;
      setupName = challenge.title;
      challengeNote = challenge.observation;
      ui.challengeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      resetRun(`${challenge.title} loaded, paused at t = 0. ${challenge.observation}`);
      workspace.closeExperiments();
    }, listenerOptions);
  });

  landscape.canvas.setAttribute('aria-describedby', 'gl-map-help');
  landscape.canvas.addEventListener('pointerdown', (event) => {
    pointerStart = null;
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart = { id: event.pointerId, position: pointerPosition(event, landscape.canvas) };
  }, listenerOptions);
  landscape.canvas.addEventListener('pointercancel', () => { pointerStart = null; }, listenerOptions);
  landscape.canvas.addEventListener('pointerleave', () => { pointerStart = null; }, listenerOptions);
  landscape.canvas.addEventListener('pointerup', (event) => {
    const previous = pointerStart;
    pointerStart = null;
    if (!previous || previous.id !== event.pointerId) return;
    const pixel = pointerPosition(event, landscape.canvas);
    if (Math.hypot(pixel.x - previous.position.x, pixel.y - previous.position.y) > 7) return;
    const point = landscape.pointAt(pixel);
    if (point) applyStart(point);
  }, listenerOptions);

  ui.export.addEventListener('click', () => {
    const rows = runs.flatMap((run) => run.history.map((sample) => [
      runNumber, surface.id, run.method, learningRate, sample.t,
      sample.position.x, sample.position.y, sample.loss,
      sample.gradient.x, sample.gradient.y, sample.delta.x, sample.delta.y,
    ].join(',')));
    const csv = [
      'run,surface,method,learning_rate,t,x,y,loss,current_gradient_x,current_gradient_y,step_x,step_y',
      ...rows,
    ].join('\n');
    downloadText(`gradient-lab-${surface.id}-run-${runNumber}.csv`, `${csv}\n`, 'text/csv;charset=utf-8');
    notify(`Exported ${rows.length} actual samples across all three methods, including their t = 0 starts.`);
  }, listenerOptions);
  preference.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    setPaused(true, false);
    notify('Motion preference changed. Playback is paused; Play is always an explicit choice.');
  }, listenerOptions);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused) setPaused(true);
  }, listenerOptions);

  ui.syncSetup(surface, start, learningRate);
  refresh();
  return {
    destroy: page.destroy,
    reset: () => resetRun(),
    setPaused: (value) => setPaused(value),
  };
}
