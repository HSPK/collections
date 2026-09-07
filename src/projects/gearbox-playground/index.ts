import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DEFAULT_SPEED, DURATION, EXPERIMENTS, GEARSETS, MEMBER_LABELS, NOTES, STEP, SYMBOLS } from './data';
import { frameAt, MEMBERS, solveGearbox } from './engine';
import type { Member } from './engine';
import { createScene } from './scene';

function signed(value: number): string {
  return value === 0 ? '0.000' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
}

function concise(value: number): string {
  return String(Number(value.toPrecision(4)));
}

function direction(value: number): string {
  return value === 0 ? 'Stopped' : value > 0 ? '↺ Counterclockwise' : '↻ Clockwise';
}

function ratioName(ratio: number): string {
  if (ratio < 0) return `Reverse · ${concise(Math.abs(ratio))}×`;
  return ratio < 1 ? `${concise(1 / ratio)} : 1 reduction` : `${concise(ratio)}× overdrive`;
}

const options = MEMBERS.map((member) => `<option value="${member}">${MEMBER_LABELS[member]}</option>`).join('');
const brandMark = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="7"/><circle cx="24" cy="10" r="7"/><circle cx="11.88" cy="31" r="7"/><circle cx="36.12" cy="31" r="7"/><path d="M24 10V24L11.88 31M24 24L36.12 31"/></svg>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'gearbox-playground');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'gb-title');
  page.root.innerHTML = `
    <div class="gb-shell">
      <header class="gb-header">
        <div>
          <p class="gb-eyebrow">${brandMark}<span>Mechanism studies <span aria-hidden="true">/</span> No. 058</span></p>
          <h1 id="gb-title">Gearbox Playground</h1>
        </div>
        <p class="gb-deck">One sun. Three planets. A world of ratios.<br> Hold one part still. See what moves.</p>
      </header>
      <nav class="gb-workspace-tools" aria-label="Workbench panels">
        <button type="button" data-controls-open>Parameters</button>
        <button type="button" data-experiments-open>Experiments</button>
        <button type="button" data-notebook-open>Notebook</button>
      </nav>

      <div class="gb-workbench" data-project-preview>
        <section class="gb-drawing-panel" aria-labelledby="gb-drawing-title">
          <div class="gb-panel-heading">
            <h2 id="gb-drawing-title"><span>01</span> The planetary set</h2>
            <span class="gb-motion" data-motion-label>Running</span>
          </div>
          <div class="gb-stage" data-scene-host></div>
          <div class="gb-drawing-caption">
            <span data-model-state>Live model · A</span>
            <span>Flat view <span aria-hidden="true">/</span> + = counterclockwise</span>
          </div>
          <div class="gb-legend" aria-label="Mechanism color key">
            <div><i class="gb-swatch gb-sun-color"></i><span><strong>Sun</strong><span data-sun-count>24 teeth</span></span></div>
            <div><i class="gb-swatch gb-ring-color"></i><span><strong>Ring</strong><span data-ring-count>60 teeth</span></span></div>
            <div><i class="gb-swatch gb-planet-color"></i><span><strong>Planets</strong><span data-planet-count>3 × 18 teeth</span></span></div>
            <div><i class="gb-swatch gb-carrier-color"></i><span><strong>Carrier</strong><span>3 connected pins</span></span></div>
          </div>
          <section class="gb-transport" aria-label="Mechanism playback">
            <div class="gb-timeline-heading">
              <label for="gb-time">Timeline</label>
              <output id="gb-clock" for="gb-time" aria-live="off" data-clock>0.00 / 20.00 s</output>
            </div>
            <input id="gb-time" type="range" min="0" max="${DURATION}" step="0.01" value="0"
              aria-label="Timeline in seconds" aria-describedby="gb-timeline-help">
            <div class="gb-transport-buttons">
              <button type="button" class="gb-primary" data-play aria-label="Pause mechanism"><span data-play-text>Ⅱ Pause</span></button>
              <button type="button" data-step="-1" aria-label="Step back 0.1 seconds">−0.1 s</button>
              <button type="button" data-step="1" aria-label="Step forward 0.1 seconds">+0.1 s</button>
              <button type="button" data-reset>↺ Reset lab</button>
            </div>
            <p id="gb-timeline-help" class="gb-small">Scrub or step to pause. Setup changes restart at zero. Playback stops at 20 s.</p>
            <div class="gb-drawing-options">
              <label class="gb-check"><input type="checkbox" data-pitch><span>Show pitch circles &amp; orbit</span></label>
              <span class="gb-small">Dashed circles = ideal rolling contact</span>
            </div>
            <p class="gb-small">Tooth silhouettes are illustrative, not involute or manufacturing geometry.</p>
          </section>
        </section>

        <aside class="gb-controls" aria-labelledby="gb-controls-title">
          <div class="gb-panel-heading"><h2 id="gb-controls-title"><span>02</span> Set the relationship</h2></div>
          <div class="gb-control-body">
            <div class="gb-experiments" aria-label="Experiment presets">
              ${EXPERIMENTS.map((experiment) => `<button type="button" data-experiment="${experiment.id}" aria-pressed="${experiment.id === 'reduction'}">${experiment.name}</button>`).join('')}
            </div>
            <p class="gb-experiment-note" data-explanation></p>
            <div class="gb-field">
              <label for="gb-gearset">Tooth family <span>sun / planet / ring</span></label>
              <select id="gb-gearset" aria-describedby="gb-model-note gb-error">
                ${GEARSETS.map((model) => `<option value="${model.id}">${escapeMarkup(model.name)}</option>`).join('')}
              </select>
            </div>
            <div class="gb-paired">
              <div class="gb-field"><label for="gb-grounded">Grounded member</label><select id="gb-grounded" aria-describedby="gb-error">${options}</select></div>
              <div class="gb-field"><label for="gb-driven">Driven member</label><select id="gb-driven" aria-describedby="gb-error">${options}</select></div>
            </div>
            <div class="gb-field">
              <label for="gb-direction">Input direction</label>
              <select id="gb-direction" aria-describedby="gb-error"><option value="1">↺ Counterclockwise (+)</option><option value="-1">↻ Clockwise (−)</option></select>
            </div>
            <div class="gb-field gb-speed-field">
              <div class="gb-label-row"><label for="gb-speed">Input speed</label><output for="gb-speed" data-input-speed aria-live="off">${DEFAULT_SPEED.toFixed(2)} rev/s</output></div>
              <input id="gb-speed" type="range" min="0" max="1" step="0.05" value="${DEFAULT_SPEED}" aria-describedby="gb-speed-help gb-error">
              <p id="gb-speed-help" class="gb-small">0–1 normalized rev/s. A study speed, not a production specification.</p>
            </div>
            <p id="gb-error" class="gb-error" role="alert" hidden></p>
          </div>

          <section class="gb-result" aria-labelledby="gb-output-title">
            <div class="gb-result-label"><h3 id="gb-output-title">Output <span data-output-member>Carrier</span></h3><span data-grounded-label>Ring held</span></div>
            <p class="gb-output-speed"><span data-output-speed>+0.043</span><span>rev/s</span></p>
            <p class="gb-ratio" data-ratio>3.5 : 1 reduction</p>
            <p class="gb-output-direction" data-output-direction></p>
            <p class="gb-ratio-value">ω<sub>out</sub> / ω<sub>in</sub> = <strong data-ratio-value></strong></p>
            <div class="gb-rate-list" aria-label="Absolute member speeds, revolutions per second">
              ${MEMBERS.map((member) => `<div class="gb-rate-row" data-rate-row="${member}">
                <span><i class="gb-swatch gb-${member}-color"></i>${MEMBER_LABELS[member]}<small data-role-label="${member}"></small></span>
                <strong data-member-speed="${member}"></strong>
                <div class="gb-rate-track" aria-hidden="true"><i data-rate-bar="${member}"></i></div>
                <span class="gb-rate-direction" data-member-direction="${member}"></span>
              </div>`).join('')}
            </div>
          </section>
          <p class="gb-local-status" role="status" data-status>Start with reduction, then try driving the carrier.</p>
        </aside>
      </div>

      <section class="gb-equation-panel" aria-labelledby="gb-equation-title">
        <div class="gb-equation-intro"><p class="gb-kicker">03 / The rule underneath</p><h2 id="gb-equation-title">Different roles.<br>The same equation.</h2></div>
        <div class="gb-equation-body">
          <p class="gb-willis" aria-label="Sun teeth times sun speed minus carrier speed, plus ring teeth times ring speed minus carrier speed, equals zero">
            <span class="gb-sun-text">N<sub>s</sub>(ω<sub>s</sub> − ω<sub>c</sub>)</span>
            <span>+</span> <span class="gb-ring-text">N<sub>r</sub>(ω<sub>r</sub> − ω<sub>c</sub>)</span> <span>= 0</span>
          </p>
          <p class="gb-substitution" data-equation></p>
          <p class="gb-small">Willis relation · N = tooth count; ω = absolute angular speed. All rates use the same signed rev/s unit.</p>
        </div>
      </section>

      <section class="gb-geometry-notes" aria-label="Geometry and mesh checks">
        <article><p class="gb-kicker">Pitch geometry</p><h3 data-pitch-equation></h3><p data-pitch-note></p></article>
        <article><p class="gb-kicker">Three-planet assembly</p><h3 data-assembly-equation></h3><p>Equal 120° spacing is compatible only when (Nₛ + Nᵣ) / 3 is an integer. Each planet starts tooth-to-gap at both contacts.</p></article>
        <article><p class="gb-kicker">Planet spin, not orbit</p><h3><span data-planet-speed></span> <span>rev/s</span></h3><p class="gb-spin-equation">ωₚ = ω꜀ − (Nₛ / Nₚ)(ωₛ − ω꜀)</p><p data-planet-note></p></article>
      </section>
      <p class="gb-model-note" id="gb-model-note" data-model-note></p>

      <section class="gb-notes" aria-label="Field notes">
        ${NOTES.map((note) => `<article><span class="gb-note-number">${note.number}</span><h2>${escapeMarkup(note.title)}</h2><p>${escapeMarkup(note.text)}</p></article>`).join('')}
      </section>
      <footer class="gb-footer">
        <p><strong>A kinematics notebook, not a fabrication model.</strong> Tooth silhouettes are illustrative, not involute or manufacturing geometry. Ideal rigid gears; no force, strength, friction, or load simulation.</p>
        <span>Gearbox Playground<br>Drawn &amp; calculated in your browser</span>
      </footer>
    </div>`;

  try {
    const root = page.root;
    const controls = query<HTMLElement>(root, '.gb-controls');
    const controlBody = query<HTMLElement>(root, '.gb-control-body');
    const experiments = document.createElement('section');
    experiments.setAttribute('aria-label', 'Experiment presets');
    experiments.append(query(root, '.gb-experiments'), query(root, '.gb-experiment-note'));
    createWorkspaceDialog(page, {
      id: 'gb-experiments', title: 'Gearbox experiments', content: [experiments],
      triggers: [query(root, '[data-experiments-open]')],
    });
    controlBody.append(query(root, '.gb-drawing-options'));
    const notebookIntro = document.createElement('div');
    notebookIntro.className = 'gb-notebook-intro';
    notebookIntro.append(query(root, '.gb-deck'));
    notebookIntro.append(...root.querySelectorAll('.gb-transport > .gb-small'));
    createWorkspaceDialog(page, {
      id: 'gb-notebook', title: 'Gearbox notebook & equations',
      content: [
        notebookIntro, query(root, '.gb-equation-panel'), query(root, '.gb-geometry-notes'),
        query(root, '.gb-model-note'), query(root, '.gb-notes'), query(root, '.gb-footer'),
      ],
      triggers: [query(root, '[data-notebook-open]')],
    });
    const tabsHost = document.createElement('div');
    const dockBody = document.createElement('div');
    dockBody.className = 'gb-dock-body';
    const parameters = document.createElement('div');
    parameters.append(query(controls, '.gb-panel-heading'), controlBody);
    const readout = document.createElement('div');
    readout.append(query(root, '.gb-result'), query(root, '.gb-legend'));
    dockBody.append(parameters, readout);
    query(root, '.gb-shell').append(query(root, '.gb-local-status'));
    controls.append(tabsHost, dockBody);
    const tabs = createWorkspaceTabs(page, {
      id: 'gb-instruments', label: 'Gearbox instruments', host: tabsHost,
      panes: [
        { id: 'parameters', label: 'Parameters', panel: parameters },
        { id: 'readout', label: 'Readout', panel: readout },
      ],
    });
    const controlsDialog = createWorkspaceDialog(page, {
      id: 'gb-parameters', title: 'Gearbox parameters & readout', content: [controls],
      className: 'gb-controls-dialog',
    });
    const controlsTrigger = query<HTMLButtonElement>(root, '[data-controls-open]');
    const compact = window.matchMedia('(max-width: 700px), (max-height: 540px)');
    function placeControls() {
      const focused = controls.contains(document.activeElement);
      controlsDialog.close();
      if (compact.matches) {
        query(controlsDialog.dialog, '.workspace-dialog-content').append(controls);
        controlsTrigger.setAttribute('aria-haspopup', 'dialog');
        controlsTrigger.setAttribute('aria-controls', controlsDialog.dialog.id);
      } else {
        query(root, '.gb-workbench').append(controls);
        controlsTrigger.removeAttribute('aria-haspopup');
        controlsTrigger.removeAttribute('aria-controls');
      }
      if (focused) controlsTrigger.focus({ preventScroll: true });
    }
    controlsTrigger.addEventListener('click', () => {
      tabs.select('parameters');
      if (compact.matches) controlsDialog.open();
      else query<HTMLButtonElement>(tabsHost, 'button').focus({ preventScroll: true });
    }, { signal: page.signal });
    compact.addEventListener('change', placeControls, { signal: page.signal });
    placeControls();
    const scene = createScene(query(root, '[data-scene-host]'));
    page.onCleanup(scene.destroy);
    const gearsetInput = query<HTMLSelectElement>(root, '#gb-gearset');
    const groundedInput = query<HTMLSelectElement>(root, '#gb-grounded');
    const drivenInput = query<HTMLSelectElement>(root, '#gb-driven');
    const directionInput = query<HTMLSelectElement>(root, '#gb-direction');
    const speedInput = query<HTMLInputElement>(root, '#gb-speed');
    const timeline = query<HTMLInputElement>(root, '#gb-time');
    const pitchInput = query<HTMLInputElement>(root, '[data-pitch]');
    const playButton = query<HTMLButtonElement>(root, '[data-play]');
    const playText = query<HTMLElement>(root, '[data-play-text]');
    const stepButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-step]')];
    const experimentButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-experiment]')];
    const errorBox = query<HTMLElement>(root, '#gb-error');
    const clock = query<HTMLOutputElement>(root, '[data-clock]');
    const status = query<HTMLElement>(root, '[data-status]');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = context.reducedMotion || media.matches;
    let valid = true;
    let time = 0;
    let model = GEARSETS[0];
    let solution = solveGearbox({ gearset: model, grounded: 'ring', driven: 'sun', speed: DEFAULT_SPEED });
    groundedInput.value = 'ring';
    drivenInput.value = 'sun';

    function text(selector: string, value: string): void {
      query<HTMLElement>(root, selector).textContent = value;
    }

    function announce(message: string, report = false): void {
      status.textContent = message;
      if (report) context.report(message);
    }

    function draw(): void {
      if (page.signal.aborted) return;
      scene.draw(frameAt(solution, time), pitchInput.checked);
      root.dataset.time = time.toFixed(6);
      timeline.value = String(time);
      timeline.setAttribute('aria-valuetext', `${time.toFixed(2)} of ${DURATION} seconds`);
      clock.value = `${time.toFixed(2)} / ${DURATION.toFixed(2)} s`;
      stepButtons[0].disabled = !valid || time <= 0;
      stepButtons[1].disabled = !valid || time >= DURATION;
    }

    const loop = createLoop((_elapsed, delta) => {
      if (page.signal.aborted) return;
      if (!paused && valid && delta > 0) {
        time = Math.min(DURATION, time + delta);
        if (time >= DURATION) {
          setPaused(true);
          announce('The 20-second study is complete. Press Play to replay, or scrub to inspect a contact.');
        }
      }
      draw();
    }, { paused });
    page.onCleanup(loop.destroy);

    function updatePlayback(): void {
      root.dataset.motion = paused ? 'paused' : 'playing';
      playButton.setAttribute('aria-label', paused ? 'Play mechanism' : 'Pause mechanism');
      playText.textContent = paused ? (time >= DURATION ? '▶ Replay' : '▶ Play') : 'Ⅱ Pause';
      text('[data-motion-label]', !valid ? 'Check inputs' : paused ? 'Paused' : 'Running');
      playButton.disabled = !valid;
      timeline.disabled = !valid;
    }

    function setPaused(value: boolean): void {
      if (page.signal.aborted) return;
      if (!valid && !value) return;
      paused = value;
      if (!paused && time >= DURATION) time = 0;
      loop.setPaused(paused);
      updatePlayback();
      draw();
    }

    function updateModel(): void {
      const { gearset, output, grounded, driven, speeds, ratio } = solution;
      root.dataset.gearset = model.id;
      root.dataset.grounded = grounded;
      root.dataset.driven = driven;
      root.dataset.output = output;
      root.dataset.ratio = String(ratio);
      const experiment = EXPERIMENTS.find((preset) => preset.grounded === grounded && preset.driven === driven);
      text('[data-explanation]', experiment?.explanation ??
        `Hold the ${grounded} at zero and drive the ${driven}. The ${output} is the remaining member, so its speed follows from the Willis relation.`);
      for (const button of experimentButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.experiment === experiment?.id));
      }
      text('[data-output-member]', MEMBER_LABELS[output]);
      text('[data-grounded-label]', `${MEMBER_LABELS[grounded]} held · 0 rev/s`);
      text('[data-output-speed]', signed(speeds[output]));
      text('[data-ratio]', ratioName(ratio));
      text('[data-ratio-value]', `${ratio > 0 ? '+' : '−'}${Math.abs(ratio).toFixed(6)}`);
      text('[data-output-direction]', speeds[driven] === 0
        ? 'All members stopped. The geometric ratio still applies.'
        : `${direction(speeds[output])} · ${ratio > 0 ? 'same direction as input' : 'opposite to input'}`);
      const maximum = Math.max(...MEMBERS.map((member) => Math.abs(speeds[member])));
      for (const member of MEMBERS) {
        const rate = query<HTMLElement>(root, `[data-member-speed="${member}"]`);
        rate.textContent = signed(speeds[member]);
        rate.dataset.rate = String(speeds[member]);
        text(`[data-role-label="${member}"]`, member === grounded ? 'held' : member === driven ? 'input' : 'output');
        text(`[data-member-direction="${member}"]`, direction(speeds[member]));
        const bar = query<HTMLElement>(root, `[data-rate-bar="${member}"]`);
        const width = maximum === 0 ? 0 : 50 * Math.abs(speeds[member]) / maximum;
        bar.style.width = `${width}%`;
        bar.style.left = `${speeds[member] < 0 ? 50 - width : 50}%`;
      }
      text('[data-sun-count]', `${gearset.sun} teeth`);
      text('[data-ring-count]', `${gearset.ring} teeth`);
      text('[data-planet-count]', `3 × ${gearset.planet} teeth`);
      const coefficients = { sun: gearset.sun, ring: gearset.ring, carrier: -(gearset.sun + gearset.ring) };
      const numerator = -coefficients[driven] * Math.sign(coefficients[output]);
      const denominator = Math.abs(coefficients[output]);
      text('[data-equation]', `${gearset.sun}(ωₛ − ω꜀) + ${gearset.ring}(ωᵣ − ω꜀) = 0   ·   ${SYMBOLS[grounded]} = 0   →   ${SYMBOLS[output]} = (${numerator} / ${denominator}) ${SYMBOLS[driven]}`);
      text('[data-pitch-equation]', `${gearset.ring} = ${gearset.sun} + 2 × ${gearset.planet}`);
      text('[data-pitch-note]', `One common module. Pitch radii: sun ${gearset.sun / 2}, planet ${gearset.planet / 2}, ring ${gearset.ring / 2}. Pin orbit radius: ${solution.geometry.orbitRadius}. Values are normalized, not dimensions.`);
      text('[data-assembly-equation]', `(${gearset.sun} + ${gearset.ring}) / 3 = ${(gearset.sun + gearset.ring) / 3}`);
      text('[data-planet-speed]', signed(solution.planetSpeed));
      text('[data-planet-note]', `${direction(solution.planetSpeed)} about each pin. The pins orbit with the carrier at ${signed(speeds.carrier)} rev/s.`);
      text('[data-model-note]', `${model.note} All three families satisfy the pitch, spacing, and starting-phase constraints.`);
      text('[data-model-state]', `Valid model · ${model.name.split(' · ')[0]}`);
    }

    function applyConfiguration(): void {
      if (page.signal.aborted) return;
      paused = true;
      loop.setPaused(true);
      const magnitude = speedInput.valueAsNumber;
      query<HTMLOutputElement>(root, '[data-input-speed]').value =
        Number.isFinite(magnitude) ? `${magnitude.toFixed(2)} rev/s` : 'Invalid speed';
      try {
        const nextModel = GEARSETS.find((candidate) => candidate.id === gearsetInput.value);
        if (!nextModel) throw new RangeError('Choose one of the three validated tooth families.');
        if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > 1) {
          throw new RangeError('The study input speed must be from 0 to 1 normalized rev/s.');
        }
        if (!['1', '-1'].includes(directionInput.value)) throw new RangeError('Choose a clockwise or counterclockwise input direction.');
        const next = solveGearbox({
          gearset: nextModel,
          grounded: groundedInput.value as Member,
          driven: drivenInput.value as Member,
          speed: magnitude * Number(directionInput.value),
        });
        model = nextModel;
        solution = next;
        valid = true;
        time = 0;
        errorBox.hidden = true;
        errorBox.textContent = '';
        scene.configure(solution);
        updateModel();
        announce(`${MEMBER_LABELS[solution.grounded]} grounded; ${MEMBER_LABELS[solution.driven]} driven; ${MEMBER_LABELS[solution.output]} output. Clock reset. Press Play or use the timeline.`);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        valid = false;
        const message = `${error.message} The last valid setup remains shown. Correct the inputs or reset the lab to continue.`;
        errorBox.textContent = message;
        errorBox.hidden = false;
        text('[data-model-state]', 'Last valid setup · inputs need correction');
        announce(message, true);
      }
      root.dataset.valid = String(valid);
      for (const control of [gearsetInput, groundedInput, drivenInput, directionInput, speedInput]) {
        control.setAttribute('aria-invalid', String(!valid));
      }
      updatePlayback();
      draw();
    }

    function reset(): void {
      if (page.signal.aborted) return;
      gearsetInput.value = GEARSETS[0].id;
      groundedInput.value = 'ring';
      drivenInput.value = 'sun';
      directionInput.value = '1';
      speedInput.value = String(DEFAULT_SPEED);
      pitchInput.checked = false;
      applyConfiguration();
      announce('Lab reset: Model A, ring grounded, sun driven at +0.15 rev/s. Paused at zero; press Play when ready.');
    }

    for (const control of [gearsetInput, groundedInput, drivenInput, directionInput]) {
      control.addEventListener('change', applyConfiguration, { signal: page.signal });
    }
    speedInput.addEventListener('input', applyConfiguration, { signal: page.signal });
    for (const button of experimentButtons) {
      button.addEventListener('click', () => {
        const experiment = EXPERIMENTS.find((preset) => preset.id === button.dataset.experiment)!;
        groundedInput.value = experiment.grounded;
        drivenInput.value = experiment.driven;
        applyConfiguration();
      }, { signal: page.signal });
    }
    playButton.addEventListener('click', () => {
      setPaused(!paused);
      announce(paused ? 'Mechanism paused. Scrub or step to inspect the mesh.' : 'Mechanism running. Positive angular speed is counterclockwise.');
    }, { signal: page.signal });
    for (const button of stepButtons) {
      button.addEventListener('click', () => {
        if (!valid) return;
        setPaused(true);
        time = Math.min(DURATION, Math.max(0, Math.round((time + Number(button.dataset.step) * STEP) * 1000) / 1000));
        draw();
        updatePlayback();
        announce(`Paused at ${time.toFixed(2)} seconds.`);
      }, { signal: page.signal });
    }
    timeline.addEventListener('input', () => {
      if (!valid) return;
      const requested = timeline.valueAsNumber;
      if (!Number.isFinite(requested) || requested < 0 || requested > DURATION) {
        announce(`Timeline must be between 0 and ${DURATION} seconds.`, true);
        draw();
        return;
      }
      setPaused(true);
      time = requested;
      draw();
      updatePlayback();
    }, { signal: page.signal });
    pitchInput.addEventListener('change', draw, { signal: page.signal });
    query<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', reset, { signal: page.signal });
    media.addEventListener('change', () => {
      setPaused(true);
      announce(media.matches
        ? 'Reduced motion is enabled. The mechanism is paused; use the timeline, or explicitly press Play.'
        : 'Motion preference changed. The mechanism stays paused until you press Play.');
    }, { signal: page.signal });

    root.dataset.valid = 'true';
    scene.configure(solution);
    updateModel();
    updatePlayback();
    draw();
    if (paused) announce('Reduced motion: the mechanism starts paused. Scrub, step, or explicitly press Play to explore.');
    return { destroy: page.destroy, reset, setPaused };
  } catch (error) {
    page.destroy();
    context.report('Gearbox Playground could not initialize its mechanism. Reload the page to try again.');
    throw error;
  }
}
