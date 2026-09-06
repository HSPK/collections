import './style.css';
import { createLoop } from '../../core/loop';
import { observeSize } from '../../core/canvas';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { OrbitError, burnCost, elements } from './mechanics';
import type { Burn } from './mechanics';
import {
  advanceFlight, createFlight, executeNext, exportFlight, inspectPrediction, installPlan, missionPlan,
  nextManeuver, predict, predictionPositions, queueBurn, removeBurn, reservedBudget,
} from './flight';
import type { Flight, Plan } from './flight';
import { MISSIONS, missionGoal, targetState } from './missions';
import { createOrbitalScene } from './scene';
import { chartMarkup, clock, deskMarkup, duration, number, timelineMarkup } from './ui';

let nextId = 0;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'apsis');
  const id = `apsis-${++nextId}`;
  page.root.setAttribute('aria-labelledby', `${id}-title`);
  page.root.innerHTML = deskMarkup(id);
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const text = (selector: string, value: string) => { get<HTMLElement>(selector).textContent = value; };
  const on = (selector: string, action: () => void) =>
    get<HTMLElement>(selector).addEventListener('click', action, { signal: page.signal });
  const runButton = get<HTMLButtonElement>('[data-apsis-run]');
  const executeButton = get<HTMLButtonElement>('[data-apsis-execute]');
  const buildButton = get<HTMLButtonElement>('[data-apsis-build]');
  const undoButton = get<HTMLButtonElement>('[data-apsis-undo]');
  const stepButton = get<HTMLButtonElement>('[data-apsis-step]');
  const targetInput = get<HTMLInputElement>('[data-apsis-plan-altitude]');
  const missionSelect = get<HTMLSelectElement>('[data-apsis-mission]');
  const warpSelect = get<HTMLSelectElement>('[data-apsis-warp]');
  const slider = get<HTMLInputElement>('[data-apsis-inspect]');
  const chart = get<HTMLElement>('[data-apsis-chart]');
  const inputs = {
    delay: get<HTMLInputElement>('[data-apsis-delay]'),
    prograde: get<HTMLInputElement>('[data-apsis-prograde]'),
    radial: get<HTMLInputElement>('[data-apsis-radial]'),
    normal: get<HTMLInputElement>('[data-apsis-normal]'),
  };
  let mission = MISSIONS[0];
  let flight = createFlight(mission);
  let prediction = predict(flight);
  let proposedPlan: Plan | undefined;
  const history: Flight[] = [];
  let paused = true;
  let warp = 300;
  let accumulator = 0;
  let inspectOffset = 0;
  let editing: number | undefined;
  let previousGoal = false;
  let lastPaint = 0;
  let loop: ReturnType<typeof createLoop> | undefined;
  const announce = (message: string, error = false) => {
    text('[data-apsis-status]', message);
    page.root.classList.toggle('apsis-has-error', error);
    if (error) page.report(message);
  };
  const scene = createOrbitalScene(get<HTMLElement>('[data-apsis-scene]'), page.signal, (message) => {
    setPaused(true);
    announce(message, true);
  });
  page.onCleanup(scene.destroy);

  function setPaused(value: boolean) {
    const wasRunning = !paused;
    paused = value || flight.state.status !== 'flying';
    accumulator = 0;
    loop?.setPaused(paused);
    runButton.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    text('[data-apsis-run-text]', paused ? 'Run' : 'Pause');
    text('[data-apsis-run-icon]', paused ? '▶' : 'Ⅱ');
    text('[data-apsis-flight-state]', flight.state.status !== 'flying' ? flight.state.status.toUpperCase() : paused ? 'PAUSED' : 'SIMULATING');
    page.root.classList.toggle('apsis-running', !paused);
    if (paused && wasRunning) refresh();
  }

  function remember() {
    history.push(flight);
    if (history.length > 50) history.shift();
  }

  function clearEditor() {
    editing = undefined;
    inputs.delay.value = '120';
    inputs.prograde.value = '0.050';
    inputs.radial.value = '0';
    inputs.normal.value = '0';
    text('[data-apsis-editor-title]', 'Write an impulse.');
    text('[data-apsis-queue]', 'Queue impulse +');
    get<HTMLElement>('[data-apsis-cancel-edit]').hidden = true;
    get<HTMLElement>('[data-apsis-editor-error]').hidden = true;
    for (const input of Object.values(inputs)) input.removeAttribute('aria-invalid');
    updateDraft();
  }

  function perform(change: () => Flight, message: string) {
    setPaused(true);
    try {
      const next = change();
      remember();
      flight = next;
      inspectOffset = 0;
      clearEditor();
      refresh();
      if (!missionGoal(mission, flight.state).complete) announce(message);
    } catch (error) {
      if (!(error instanceof OrbitError)) throw error;
      announce(error.message, true);
    }
  }

  function refreshPlanner() {
    proposedPlan = undefined;
    let reason = '';
    try {
      proposedPlan = missionPlan(flight, mission, targetInput.valueAsNumber);
    } catch (error) {
      if (!(error instanceof OrbitError)) throw error;
      reason = error.message;
    }
    const pending = flight.maneuvers.filter((maneuver) => maneuver.status === 'queued');
    const cost = pending.length ? reservedBudget(flight) : proposedPlan?.cost;
    const wait = pending.length ? pending[pending.length - 1].time - flight.state.time : proposedPlan?.duration;
    text('[data-apsis-plan-cost]', cost === undefined ? '—' : number(cost, 4));
    text('[data-apsis-plan-duration]', wait === undefined ? '—' : duration(wait));
    buildButton.disabled = proposedPlan === undefined || flight.state.status !== 'flying';
    const label = mission.planner === 'hohmann' ? 'transfer' : mission.planner === 'plane' ? 'plane change' : 'periapsis trim';
    buildButton.innerHTML = `${pending.length ? 'Rebuild' : 'Build'} ${label} <span aria-hidden="true">↗</span>`;
    text('[data-apsis-plan-hint]', pending.length ?
      'Sequence queued. Inspect the coral path, then execute. Rebuilding replaces unflown impulses.' :
      proposedPlan?.explanation ?? reason);
    text('[data-apsis-planner-type]', mission.planner === 'hohmann' ? 'HOHMANN' : mission.planner === 'plane' ? 'PLANE ROTATION' : 'SHAPE MATCH');
  }

  function refreshInspector() {
    const offset = Math.max(0, Math.min(prediction.duration, inspectOffset));
    const future = offset === 0 ? flight : inspectPrediction(flight, offset);
    const values = elements(future.state);
    slider.max = String(Math.floor(prediction.duration));
    slider.value = String(offset);
    slider.setAttribute('aria-valuetext', offset === 0 ? 'Live spacecraft' :
      `${clock(future.state.time)} simulation time, ${number(values.altitude)} kilometers altitude`);
    text('[data-apsis-inspect-time]', offset === 0 ? 'LIVE STATE' : `${future.state.status === 'flying' ? 'PREVIEW' : future.state.status.toUpperCase()} · T+${clock(future.state.time)}`);
    text('[data-apsis-inspect-altitude]', number(values.altitude));
    text('[data-apsis-inspect-speed]', number(values.speed, 4));
    text('[data-apsis-inspect-budget]', number(future.remaining, 4));
    scene.inspect(offset === 0 ? null : future.state);
    const svg = get<SVGSVGElement>('[data-apsis-chart] svg');
    const maximum = Number(svg.dataset.apsisChartMax);
    const x = 57 + (future.state.time - flight.state.time) / prediction.duration * (svg.viewBox.baseVal.width - 75);
    const y = 18 + (1 - values.altitude / maximum) * 138;
    const cursor = get<SVGLineElement>('[data-apsis-chart-cursor]');
    cursor.setAttribute('x1', String(x));
    cursor.setAttribute('x2', String(x));
    const dot = get<SVGCircleElement>('[data-apsis-chart-dot]');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
  }

  function refresh(refit = false) {
    const values = elements(flight.state);
    const goal = missionGoal(mission, flight.state);
    prediction = predict(flight);
    const hasPlan = flight.maneuvers.some((maneuver) => maneuver.status === 'queued');
    scene.update({
      live: flight.state, target: targetState(mission),
      projected: predictionPositions(prediction), hasPlan, inspected: null,
      burns: flight.maneuvers.filter((maneuver) => maneuver.status === 'queued').flatMap((maneuver) => {
        const point = prediction.points.find((entry) => Math.abs(entry.time - maneuver.time) < 1e-6);
        return point ? [{ position: point.state.position, label: maneuver.label }] : [];
      }),
    }, refit);
    text('[data-apsis-altitude]', number(values.altitude));
    text('[data-apsis-speed]', number(values.speed, 4));
    text('[data-apsis-clock]', `T+${clock(flight.state.time)}`);
    get<HTMLElement>('[data-apsis-clock]').dataset.seconds = String(flight.state.time);
    const display = (value: number | null, suffix: string, fallback: string, digits = 1) => value === null ? fallback : `${number(value, digits)} ${suffix}`;
    text('[data-apsis-metric="periapsis"]', display(values.periapsis, 'km', 'Undefined · radial'));
    text('[data-apsis-metric="apoapsis"]', display(values.apoapsis, 'km', values.kind === 'radial' ? 'Undefined · radial' : 'Unbound · no apoapsis'));
    text('[data-apsis-metric="inclination"]', display(values.inclination, '°', 'Undefined · radial', 2));
    text('[data-apsis-metric="period"]', values.period === null ? 'Not periodic' : duration(values.period));
    text('[data-apsis-metric="eccentricity"]', number(values.eccentricity, 5));
    text('[data-apsis-metric="energy"]', `${number(values.energy, 4)} km²/s²`);
    text('[data-apsis-budget]', number(flight.remaining, 4));
    text('[data-apsis-reserved]', number(reservedBudget(flight), 4));
    const meter = get<HTMLMeterElement>('[data-apsis-budget-meter]');
    meter.max = mission.budget;
    meter.value = flight.remaining;
    text('[data-apsis-state-vectors]',
      `r [km]    ${number(flight.state.position.x, 3)}, ${number(flight.state.position.y, 3)}, ${number(flight.state.position.z, 3)}\n` +
      `v [km/s]  ${number(flight.state.velocity.x, 6)}, ${number(flight.state.velocity.y, 6)}, ${number(flight.state.velocity.z, 6)}\n` +
      `a [km]    ${values.semiMajorAxis === null ? 'Undefined · parabolic' : number(values.semiMajorAxis, 3)}\n` +
      `RAAN      ${display(values.raan, '°', 'Undefined · equatorial/radial', 3)}\n` +
      `Arg. Pe   ${display(values.argumentOfPeriapsis, '°', 'Undefined · circular/equatorial/radial', 3)}\n` +
      `Anomaly   ${display(values.trueAnomaly, '°', 'Undefined · circular/radial', 3)}\n` +
      `Conic     ${values.kind}`);
    text('[data-apsis-goal-text]', goal.text);
    text('[data-apsis-goal-error]', goal.altitudeError === null || goal.planeError === null ? 'A bound, nonradial target orbit is required.' :
      `Apsis error ${number(goal.altitudeError)} km · plane error ${number(goal.planeError, 2)}°` +
      (goal.apsidalError === null ? '' : ` · apsis direction ${number(goal.apsidalError, 2)}°`));
    get<HTMLElement>('[data-apsis-goal]').classList.toggle('apsis-goal-complete', goal.complete);
    text('.apsis-goal-mark', goal.complete ? '✓' : '○');
    page.root.dataset.missionComplete = String(goal.complete);
    if (goal.complete && !previousGoal) {
      announce('Target orbit acquired. Both apsides and the full orbital plane match the mission goal.' +
        (goal.apsidalError === null ? '' : ' The ellipse also matches the reference apsis direction.'));
      get<HTMLElement>('.apsis-director').scrollTop = 0;
    }
    previousGoal = goal.complete;
    text('[data-apsis-burn-count]', `${String(flight.maneuvers.filter((maneuver) => maneuver.status === 'queued').length).padStart(2, '0')} QUEUED`);
    get<HTMLElement>('[data-apsis-timeline]').innerHTML = timelineMarkup(flight);
    chart.innerHTML = chartMarkup(prediction, mission, hasPlan, flight.state.time, chart.clientWidth);
    const next = nextManeuver(flight);
    executeButton.disabled = !next || flight.state.status !== 'flying';
    executeButton.innerHTML = `${next ? `Execute burn ${flight.maneuvers.indexOf(next) + 1}` : 'Execute next burn'} <span aria-hidden="true">→</span>`;
    undoButton.disabled = history.length === 0;
    runButton.disabled = stepButton.disabled = flight.state.status !== 'flying';
    get<HTMLButtonElement>('[data-apsis-queue]').disabled = flight.state.status !== 'flying';
    if (flight.state.status !== 'flying') {
      setPaused(true);
      announce(goal.text + '. Undo an action or reset to launch.', true);
    }
    refreshPlanner();
    refreshInspector();
    text('[data-apsis-log-count]', `${flight.log.length} ${flight.log.length === 1 ? 'event' : 'events'}`);
    get<HTMLElement>('[data-apsis-log]').innerHTML = flight.log.map((entry) =>
      `<div class="apsis-log-entry"><time>T+${clock(entry.time)}</time><strong>${escapeMarkup(entry.event)}</strong><span>${entry.deltaV === undefined ? '—' : `Δv ${number(entry.deltaV, 5)} km/s`} · h ${number(elements(entry.state).altitude)} km</span></div>`).join('');
  }

  function loadMission(missionId: string) {
    const selected = MISSIONS.find((entry) => entry.id === missionId);
    if (!selected) throw new OrbitError('That flight program is unavailable.');
    setPaused(true);
    mission = selected;
    flight = createFlight(mission);
    history.length = 0;
    previousGoal = false;
    inspectOffset = 0;
    missionSelect.value = mission.id;
    targetInput.value = String(mission.targetApoapsis);
    get<HTMLElement>('[data-apsis-target-field]').hidden = mission.planner !== 'hohmann';
    text('[data-apsis-program-description]', mission.subtitle);
    text('[data-apsis-code]', mission.code);
    text('[data-apsis-mission-title]', mission.title);
    text('[data-apsis-mission-description]', mission.description);
    text('[data-apsis-target-pe]', `${number(mission.targetPeriapsis, 0)} km`);
    text('[data-apsis-target-ap]', `${number(mission.targetApoapsis, 0)} km`);
    text('[data-apsis-target-inc]', `${number(mission.targetInclination)}°`);
    page.root.querySelectorAll<HTMLButtonElement>('[data-apsis-load]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.apsisLoad === mission.id));
    });
    clearEditor();
    refresh(true);
    reflectView('oblique');
    get<HTMLElement>('.apsis-director').scrollTop = 0;
    announce(`${mission.title} is paused at launch. ${mission.instruction}`);
  }

  const readBurn = (): Burn => ({ prograde: inputs.prograde.valueAsNumber, radial: inputs.radial.valueAsNumber, normal: inputs.normal.valueAsNumber });
  function updateDraft() {
    const cost = burnCost(readBurn());
    text('[data-apsis-draft-cost]', Number.isFinite(cost) ? `${number(cost, 4)} km/s` : 'Enter valid numbers');
  }

  on('[data-apsis-run]', () => {
    if (paused) {
      remember();
      inspectOffset = 0;
      clearEditor();
      refreshInspector();
      setPaused(false);
      announce(`Running at up to ${warp} simulation seconds per real second.`);
    } else {
      setPaused(true);
      refresh();
      announce('Clock paused. Live state and remaining delta-v are held.');
    }
  });
  on('[data-apsis-step]', () => perform(() => advanceFlight(flight, 60), 'Advanced 60 simulation seconds, including any scheduled impulses.'));
  on('[data-apsis-execute]', () => perform(() => executeNext(flight), 'Impulse executed at its exact scheduled time. Flight paused for inspection.'));
  on('[data-apsis-build]', () => {
    perform(() => {
      const plan = missionPlan(flight, mission, targetInput.valueAsNumber);
      return installPlan(flight, plan);
    }, 'Solution queued. Scrub the coral trajectory, then execute each burn or run the clock.');
    if (flight.maneuvers.some((maneuver) => maneuver.status === 'queued')) {
      const director = get<HTMLElement>('.apsis-director');
      const timeline = get<HTMLElement>('.apsis-timeline');
      director.scrollTop += timeline.getBoundingClientRect().top - director.getBoundingClientRect().top;
    }
  });
  on('[data-apsis-undo]', () => {
    const previous = history.pop();
    if (!previous) return;
    setPaused(true);
    flight = previous;
    inspectOffset = 0;
    clearEditor();
    refresh();
    announce('Restored the previous action, including its time, state vectors, and delta-v budget.');
  });
  on('[data-apsis-reset]', () => loadMission(mission.id));
  on('[data-apsis-cancel-edit]', () => { clearEditor(); announce('Edit cancelled. The queued impulse is unchanged.'); });
  on('[data-apsis-live]', () => { inspectOffset = 0; refreshInspector(); });
  on('[data-apsis-export]', () => {
    downloadText(`apsis-${mission.id}-flight.json`, exportFlight(flight, mission), 'application/json');
    announce('Flight log exported with full-precision state, units, budget, and maneuver history.');
  });
  on('[data-apsis-notes]', () => {
    const notes = get<HTMLDetailsElement>('[data-apsis-model-notes]');
    notes.open = true;
    notes.scrollIntoView({ block: 'start' });
    notes.querySelector('summary')?.focus({ preventScroll: true });
  });
  const reflectView = (view: string) => page.root.querySelectorAll<HTMLButtonElement>('[data-apsis-view]')
    .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.apsisView === view)));
  on('[data-apsis-fit]', () => { scene.fit(); reflectView('oblique'); });
  on('[data-apsis-zoom="in"]', () => scene.zoom(0.84));
  on('[data-apsis-zoom="out"]', () => scene.zoom(1.19));
  page.root.querySelectorAll<HTMLButtonElement>('[data-apsis-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.apsisView;
      if (view !== 'oblique' && view !== 'north' && view !== 'edge') return;
      scene.fit(view);
      reflectView(view);
    }, { signal: page.signal });
  });
  scene.canvas.addEventListener('pointerdown', () => reflectView('custom'), { signal: page.signal });
  scene.canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Home') reflectView('oblique');
    else if (event.key.startsWith('Arrow')) reflectView('custom');
  }, { signal: page.signal });
  page.root.querySelectorAll<HTMLButtonElement>('[data-apsis-load]').forEach((button) => {
    button.addEventListener('click', () => {
      loadMission(button.dataset.apsisLoad ?? '');
      get<HTMLElement>('.apsis-program-bar').scrollIntoView({ block: 'start' });
    }, { signal: page.signal });
  });
  missionSelect.addEventListener('change', () => loadMission(missionSelect.value), { signal: page.signal });
  warpSelect.addEventListener('change', () => {
    warp = Number(warpSelect.value);
    text('[data-apsis-time-note]', `${warp} simulation seconds per real second, at most. Slows under load; hidden tabs do not advance.`);
  }, { signal: page.signal });
  targetInput.addEventListener('input', () => { setPaused(true); refreshPlanner(); }, { signal: page.signal });
  slider.addEventListener('input', () => {
    setPaused(true);
    inspectOffset = slider.valueAsNumber;
    refreshInspector();
  }, { signal: page.signal });
  for (const input of Object.values(inputs)) input.addEventListener('input', () => { setPaused(true); updateDraft(); }, { signal: page.signal });
  get<HTMLFormElement>('[data-apsis-burn-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    setPaused(true);
    const errorElement = get<HTMLElement>('[data-apsis-editor-error]');
    errorElement.hidden = true;
    try {
      const label = flight.maneuvers.find((maneuver) => maneuver.id === editing)?.label ?? 'Manual impulse';
      const next = queueBurn(flight, flight.state.time + inputs.delay.valueAsNumber, readBurn(), label, editing);
      remember();
      flight = next;
      inspectOffset = 0;
      clearEditor();
      refresh();
      announce('Impulse saved to the timeline. The projected trajectory and reserved budget now include it.');
    } catch (error) {
      if (!(error instanceof OrbitError)) throw error;
      errorElement.textContent = error.message;
      errorElement.hidden = false;
      announce(error.message, true);
    }
  }, { signal: page.signal });
  get<HTMLElement>('[data-apsis-timeline]').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const editButton = event.target.closest<HTMLButtonElement>('[data-apsis-edit]');
    const removeButton = event.target.closest<HTMLButtonElement>('[data-apsis-remove]');
    if (removeButton) perform(() => removeBurn(flight, Number(removeButton.dataset.apsisRemove)), 'Impulse removed. The prediction and reserved budget have been recalculated.');
    if (editButton) {
      const maneuver = flight.maneuvers.find((entry) => entry.id === Number(editButton.dataset.apsisEdit));
      if (!maneuver) return;
      setPaused(true);
      editing = maneuver.id;
      inputs.delay.value = String(maneuver.time - flight.state.time);
      inputs.prograde.value = String(maneuver.burn.prograde);
      inputs.radial.value = String(maneuver.burn.radial);
      inputs.normal.value = String(maneuver.burn.normal);
      text('[data-apsis-editor-title]', `Edit ${maneuver.label.toLowerCase()}.`);
      text('[data-apsis-queue]', 'Save impulse');
      get<HTMLElement>('[data-apsis-cancel-edit]').hidden = false;
      updateDraft();
      get<HTMLElement>('.apsis-burn-editor').scrollIntoView({ block: 'center' });
      inputs.delay.focus({ preventScroll: true });
      announce('Editing a queued impulse. Save applies the change; cancel leaves the flight plan untouched.');
    }
  }, { signal: page.signal });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reflectMotion = () => {
    get<HTMLElement>('[data-apsis-reduced]').hidden = !motion.matches;
    if (motion.matches) {
      setPaused(true);
      announce('Reduced motion enabled. Flight paused; start it explicitly or execute one impulse at a time.');
    }
  };
  motion.addEventListener('change', reflectMotion, { signal: page.signal });
  loadMission(mission.id);
  reflectMotion();
  let chartWidth = chart.clientWidth;
  page.onCleanup(observeSize(chart, (size) => {
    if (Math.abs(size.width - chartWidth) < 1) return;
    chartWidth = size.width;
    chart.innerHTML = chartMarkup(prediction, mission, flight.maneuvers.some((maneuver) => maneuver.status === 'queued'),
      flight.state.time, size.width);
    refreshInspector();
  }));
  loop = createLoop((elapsed, delta) => {
    if (paused || delta === 0) return;
    accumulator += delta * warp;
    const seconds = Math.floor(accumulator);
    if (!seconds) return;
    accumulator -= seconds;
    try {
      flight = advanceFlight(flight, seconds);
    } catch (error) {
      if (!(error instanceof OrbitError)) throw error;
      setPaused(true);
      announce(error.message, true);
      return;
    }
    if (elapsed - lastPaint >= 0.2 || flight.state.status !== 'flying') {
      lastPaint = elapsed;
      inspectOffset = 0;
      refresh();
    }
  }, { paused: true });
  page.onCleanup(loop.destroy);
  return { destroy: page.destroy, setPaused, reset: () => loadMission(mission.id) };
}
