import './style.css';
import { canvas2D } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { DEFAULT_STRENGTH, plants } from './data';
import { advanceGarden, createGarden, fullyOpened, LoudnessEnvelope, paperOpened, unfoldStep } from './engine';
import { drawGarden } from './illustration';
import { LocalMicrophone } from './microphone';
import type { MicrophoneState, MicrophoneStatus } from './microphone';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'breath-garden');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let garden = createGarden();
  let paused = context.reducedMotion;
  let direction: -1 | 1 = 1;
  let strength = DEFAULT_STRENGTH;
  let microphoneState: MicrophoneState = 'off';
  let microphoneLevel = 0;
  let soundGate = false;
  let wasCalibrating = false;
  const envelope = new LoudnessEnvelope();
  const holding = new Set<string>();
  const captures = new Map<number, HTMLElement>();

  root.innerHTML = `
    <div class="bg-site">
      <header class="bg-header">
        <div><p class="bg-eyebrow">Paper, air, a little attention</p><h1>Breath <em>Garden</em></h1></div>
        <p>A little wind unfolds a world.<br>No microphone needed.</p>
      </header>
      <section class="bg-workbench" aria-label="Interactive paper garden" data-project-preview>
        <div class="bg-workbench-top">
          <div><p class="bg-eyebrow">The paper coast</p><p class="bg-season">Nine folds waiting for the wind.</p></div>
          <button type="button" class="bg-breeze" data-breeze aria-label="Send a breeze" aria-pressed="false" aria-describedby="bg-wind-help">
            <svg viewBox="0 0 40 32" aria-hidden="true"><path d="M3 9h21c10 0 10-11 3-11M3 17h29c8 0 8 11 0 11M9 25h10"/><path d="M4 3h9"/></svg>
            <span><strong>Send a breeze</strong><small data-hold-help>Hold the button or Space</small></span>
          </button>
        </div>
        <div class="bg-stage" data-stage></div>
        <div class="bg-garden-bar">
          <div class="bg-opened"><span class="bg-flower-mark" aria-hidden="true">+</span><div><output data-opened aria-live="off">67% unfolded</output><p data-blooms>0 / 9 fully open</p></div></div>
          <div class="bg-garden-actions"><button type="button" data-pause>${paused ? 'Resume motion' : 'Pause motion'}</button><button type="button" data-reset>Fold back</button></div>
        </div>
      </section>
      <div class="bg-wind-controls">
        <div class="bg-strength">
          <div><label for="bg-strength">Breeze strength</label><output data-strength-value aria-live="off" aria-hidden="true">70%</output></div>
          <input id="bg-strength" data-strength type="range" min="20" max="100" step="1" value="70">
        </div>
        <div class="bg-direction"><span>Wind direction</span><div role="group" aria-label="Wind direction"><button type="button" data-direction="-1" aria-label="Wind to the left" aria-pressed="false">&larr;</button><button type="button" data-direction="1" aria-label="Wind to the right" aria-pressed="true">&rarr;</button></div></div>
        <div class="bg-wind-reading"><span data-source>Button / Space</span><output data-wind aria-live="off">Still air</output><meter data-wind-meter min="0" max="1" value="0" aria-label="Wind in the paper garden">0%</meter></div>
      </div>
      <p class="bg-wind-help" id="bg-wind-help" data-wind-help></p>
      <p class="bg-local-feedback" role="status" aria-live="polite" aria-atomic="true" data-feedback>Press and hold anywhere in the garden, or use the blue wind button.</p>
      <section class="bg-microphone" aria-labelledby="bg-microphone-title">
        <div class="bg-microphone-copy">
          <p class="bg-eyebrow">An optional way to play</p><h2 id="bg-microphone-title">Let the room make the weather.</h2>
          <p>Enable your microphone only if you want nearby sound to become wind. A hum, a word, or a rustle will do. You do not need to blow into the microphone.</p>
          <p class="bg-privacy"><svg viewBox="0 0 20 22" aria-hidden="true"><rect x="3" y="9" width="14" height="11" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3"/></svg><span>Loudness stays on this device. No recording, storage, uploads, speech recognition, or health inference.</span></p>
        </div>
        <div class="bg-microphone-controls">
          <div class="bg-mic-state"><span class="bg-mic-dot" aria-hidden="true"></span><strong data-mic-label>Microphone off</strong></div>
          <button type="button" data-mic>Enable microphone</button>
          <p role="status" aria-live="polite" aria-atomic="true" data-mic-message>Microphone off. The garden already works with the wind button or Space.</p>
          <button type="button" class="bg-recalibrate" data-calibrate disabled>Recalibrate room level</button>
          <p class="bg-shutdown-note">Hiding or leaving this page turns it off. Coming back never turns it on.</p>
        </div>
      </section>
      <section class="bg-paper-notes" aria-labelledby="bg-about-title">
        <div><p class="bg-eyebrow">A paper world, not a breathing exercise</p><h2 id="bg-about-title">Make a little weather.<br> Leave a little colour.</h2></div>
        <div><h3>Wind opens the folds</h3><p>Air bends the stems and turns the paper wheels. The petals keep the shape you have opened. &ldquo;Fold back&rdquo; returns the garden to its first arrangement.</p></div>
        <div><h3>A small, local mechanism</h3><p>The microphone, when enabled, measures a short loudness window after calibrating the room level. A bounded, smoothed value drives these handmade shapes. It is not AI and it does not interpret what you say.</p></div>
      </section>
      <details class="bg-specimens"><summary>Meet the nine paper specimens</summary><p>${plants.map((plant) => plant.name).join(' / ')}. These are names for original paper constructions, not botanical species. Everything resets when you leave.</p></details>
      <footer class="bg-footer"><span>A garden that listens only when invited.</span><span>Original folds / No. 35</span></footer>
      <nav class="bg-workspace-actions" aria-label="Garden information">
        <button type="button" data-open-microphone>Microphone · off</button>
        <button type="button" data-open-notes>Field notes</button>
      </nav>
    </div>`;

  createWorkspaceDialog(page, {
    id: 'bg-microphone-dialog', title: 'Optional microphone',
    content: [query<HTMLElement>(root, '.bg-microphone')],
    triggers: [query<HTMLElement>(root, '[data-open-microphone]')],
  });
  createWorkspaceDialog(page, {
    id: 'bg-notes-dialog', title: 'Field notes',
    content: ['.bg-wind-help', '.bg-paper-notes', '.bg-specimens', '.bg-footer'].map(selector => query<HTMLElement>(root, selector)),
    triggers: [query<HTMLElement>(root, '[data-open-notes]')],
  });

  const stage = canvas2D(query<HTMLDivElement>(root, '[data-stage]'), 'A coastal paper garden of coral cups, blue fans, and folded pinwheel flowers.');
  page.onCleanup(stage.dispose);
  stage.canvas.setAttribute('role', 'application');
  stage.canvas.setAttribute('aria-label', 'Paper garden: hold to send wind');
  stage.canvas.setAttribute('aria-describedby', 'bg-wind-help');
  stage.canvas.tabIndex = 0;
  const breezeButton = query<HTMLButtonElement>(root, '[data-breeze]');
  const pauseButton = query<HTMLButtonElement>(root, '[data-pause]');
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const windHelp = query<HTMLElement>(root, '[data-wind-help]');
  const windOutput = query<HTMLOutputElement>(root, '[data-wind]');
  const windMeter = query<HTMLMeterElement>(root, '[data-wind-meter]');
  const openedOutput = query<HTMLOutputElement>(root, '[data-opened]');
  const blooms = query<HTMLElement>(root, '[data-blooms]');
  const micButton = query<HTMLButtonElement>(root, '[data-mic]');
  const micLabel = query<HTMLElement>(root, '[data-mic-label]');
  const micMessage = query<HTMLElement>(root, '[data-mic-message]');
  const calibrateButton = query<HTMLButtonElement>(root, '[data-calibrate]');
  const source = query<HTMLElement>(root, '[data-source]');
  const strengthInput = query<HTMLInputElement>(root, '[data-strength]');
  const strengthValue = query<HTMLOutputElement>(root, '[data-strength-value]');

  function render(): void {
    drawGarden(stage.context, stage.size.width, stage.size.height, garden, direction);
  }

  function readout(): void {
    const amount = Math.round(garden.wind * 100);
    root.dataset.holding = String(holding.size > 0);
    root.dataset.paused = String(paused);
    root.dataset.direction = String(direction);
    root.dataset.wind = String(amount);
    root.dataset.opened = String(paperOpened(garden));
    windOutput.value = amount < 3 ? 'Still air' : amount < 32 ? 'Light air' : amount < 65 ? 'A gentle breeze' : 'A bright breeze';
    windMeter.value = garden.wind;
    windMeter.textContent = `${amount}%`;
    windMeter.setAttribute('aria-valuetext', `${amount}% wind`);
    openedOutput.value = `${paperOpened(garden)}% unfolded`;
    blooms.textContent = `${fullyOpened(garden)} / ${plants.length} fully open`;
    source.textContent = holding.size ? 'Button / Space' : microphoneState === 'live' ? 'Local microphone' : 'Button / Space';
    breezeButton.setAttribute('aria-pressed', String(holding.size > 0));
  }

  const loop = createLoop((_elapsed, delta) => {
    if (microphoneState === 'live') {
      microphoneLevel = envelope.sample(microphone.readLoudness(), delta);
      root.dataset.micCalibrating = String(envelope.calibrating);
      if (wasCalibrating && !envelope.calibrating) {
        micMessage.textContent = 'Live, locally. Room level set. Any nearby sound can make wind; only its loudness is used.';
      }
      wasCalibrating = envelope.calibrating;
    } else {
      microphoneLevel = 0;
    }
    const target = Math.max(holding.size ? strength : 0, microphoneLevel * strength);
    if (paused) {
      if (microphoneLevel > 0.22 && !soundGate) {
        unfoldStep(garden, microphoneLevel * strength);
        soundGate = true;
      } else if (microphoneLevel < 0.1) {
        soundGate = false;
      }
      garden.wind = Math.round(target * 4) / 4;
    } else {
      advanceGarden(garden, target, delta, direction);
    }
    readout();
    render();
  }, { paused });
  page.onCleanup(loop.destroy);

  function updateLoop(): void {
    loop.setPaused(paused && microphoneState !== 'live');
  }

  function microphoneChanged(status: MicrophoneStatus): void {
    microphoneState = status.state;
    root.dataset.micState = status.state;
    const labels: Record<MicrophoneState, string> = {
      off: 'Microphone off', requesting: 'Permission pending', live: 'Live / local only',
      denied: 'Permission not granted', unavailable: 'Microphone unavailable', error: 'Microphone stopped',
    };
    micLabel.textContent = labels[status.state];
    query<HTMLElement>(root, '[data-open-microphone]').textContent = `Microphone · ${status.state === 'requesting' ? 'pending' : status.state}`;
    micMessage.textContent = status.message;
    micButton.textContent = status.state === 'requesting' ? 'Cancel request' : status.state === 'live' ? 'Disable microphone' : 'Enable microphone';
    calibrateButton.disabled = status.state !== 'live';
    if (status.state === 'live') {
      envelope.reset();
      wasCalibrating = true;
      soundGate = false;
      root.dataset.micCalibrating = 'true';
    } else {
      envelope.reset();
      microphoneLevel = 0;
      wasCalibrating = false;
      soundGate = false;
      root.dataset.micCalibrating = 'false';
      if (paused && !holding.size) garden.wind = 0;
    }
    updateLoop();
    readout();
    loop.requestRender();
  }

  const microphone = new LocalMicrophone(microphoneChanged, page.report);
  page.onCleanup(() => microphone.destroy());

  function describeMotion(): void {
    pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    query<HTMLElement>(root, '[data-hold-help]').textContent = paused ? 'Press for one unfolding step' : 'Hold the button or Space';
    windHelp.textContent = paused
      ? 'Motion is off: each press or new sound unfolds one step. Space works too. Left / right arrow keys change the wind while the garden is focused.'
      : 'Hold the button, hold Space, or press the garden itself. Left / right arrow keys change the wind while the garden is focused.';
  }

  function beginBreeze(key: string): void {
    if (document.hidden || holding.has(key)) return;
    if (!holding.size) unfoldStep(garden, strength);
    holding.add(key);
    readout();
    loop.requestRender();
  }

  function endBreeze(key: string): void {
    holding.delete(key);
    if (paused) garden.wind = microphoneLevel * strength;
    readout();
    loop.requestRender();
  }

  function clearHolds(): void {
    holding.clear();
    const captured = [...captures.entries()];
    captures.clear();
    for (const [id, element] of captured) if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    if (paused) garden.wind = 0;
    readout();
    loop.requestRender();
  }

  function setPaused(value: boolean): void {
    paused = value;
    describeMotion();
    updateLoop();
    readout();
    loop.requestRender();
    feedback.textContent = paused
      ? 'Motion paused. Your wind button, Space, direction controls, and optional local sound still work in steps.'
      : 'Motion resumed. Hold for a continuous breeze; the petals keep the shapes you open.';
  }

  function setDirection(value: -1 | 1): void {
    direction = value;
    root.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.direction === String(direction)));
    });
    feedback.textContent = `Wind now travels to the ${direction === 1 ? 'right' : 'left'}.`;
    readout();
    loop.requestRender();
  }

  function reset(): void {
    clearHolds();
    garden = createGarden();
    readout();
    loop.requestRender();
    feedback.textContent = 'The paper has been folded back to its starting shapes. Microphone consent and motion settings are unchanged.';
  }

  function bindHold(element: HTMLElement): void {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || captures.size > 0) return;
      event.preventDefault();
      captures.set(event.pointerId, element);
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
      beginBreeze(`pointer-${event.pointerId}`);
    }, { signal });
    const release = (event: PointerEvent) => {
      if (captures.get(event.pointerId) !== element) return;
      captures.delete(event.pointerId);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      endBreeze(`pointer-${event.pointerId}`);
    };
    element.addEventListener('pointerup', release, { signal });
    element.addEventListener('pointercancel', release, { signal });
    element.addEventListener('lostpointercapture', release, { signal });
  }
  bindHold(stage.canvas);
  bindHold(breezeButton);
  breezeButton.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) beginBreeze(`button-${event.code}`);
  }, { signal });
  breezeButton.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' && event.key !== 'Enter') return;
    event.preventDefault();
    endBreeze(`button-${event.code}`);
  }, { signal });
  breezeButton.addEventListener('blur', () => {
    endBreeze('button-Space');
    endBreeze('button-Enter');
    endBreeze('button-NumpadEnter');
  }, { signal });
  breezeButton.addEventListener('click', (event) => {
    if (event.detail === 0 && !holding.size) {
      unfoldStep(garden, strength);
      if (paused) garden.wind = 0;
      readout();
      loop.requestRender();
    }
  }, { signal });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, select, textarea, a, summary, dialog, [contenteditable="true"], [role="dialog"]')) return;
    event.preventDefault();
    if (!event.repeat) beginBreeze('keyboard');
  }, { signal });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && holding.has('keyboard')) {
      event.preventDefault();
      endBreeze('keyboard');
    }
  }, { signal });
  stage.canvas.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setDirection(event.key === 'ArrowLeft' ? -1 : 1);
  }, { signal });
  window.addEventListener('blur', clearHolds, { signal });
  function hideInput(): void {
    clearHolds();
    if (microphoneState === 'live' || microphoneState === 'requesting') {
      microphone.disable('Microphone off because the page was hidden or left. Enable it again yourself if you want to listen.');
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideInput(); }, { signal });
  window.addEventListener('pagehide', hideInput, { signal });
  page.onCleanup(clearHolds);
  stage.canvas.addEventListener('canvasresize', () => loop.requestRender(), { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => {
    button.addEventListener('click', () => setDirection(button.dataset.direction === '-1' ? -1 : 1), { signal });
  });
  strengthInput.addEventListener('input', () => {
    strength = clamp(strengthInput.valueAsNumber / 100, 0.2, 1);
    strengthValue.value = `${Math.round(strength * 100)}%`;
    strengthInput.setAttribute('aria-valuetext', strengthValue.value);
    if (paused && holding.size) garden.wind = strength;
    readout();
    loop.requestRender();
  }, { signal });
  pauseButton.addEventListener('click', () => setPaused(!paused), { signal });
  query<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', reset, { signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) setPaused(true);
  }, { signal });
  micButton.addEventListener('click', () => {
    if (microphoneState === 'live' || microphoneState === 'requesting') {
      microphone.disable(microphoneState === 'requesting'
        ? 'Request canceled. Nothing is listening. If browser permission arrives later, those tracks will be stopped immediately.'
        : undefined);
    } else {
      void microphone.enable();
    }
  }, { signal });
  calibrateButton.addEventListener('click', () => {
    envelope.reset();
    wasCalibrating = true;
    soundGate = false;
    microphoneLevel = 0;
    root.dataset.micCalibrating = 'true';
    micMessage.textContent = 'Live, locally. Stay quiet for about one second to recalibrate the room level.';
    loop.requestRender();
  }, { signal });

  strengthInput.setAttribute('aria-valuetext', '70%');
  describeMotion();
  microphoneChanged(microphone.status);
  render();
  return { destroy: page.destroy, setPaused, reset };
}
