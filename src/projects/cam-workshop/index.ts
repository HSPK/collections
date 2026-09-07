import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DEFAULT_SETTINGS, DEFAULT_SPEED, LAWS, LIMITATIONS, LIMITS, OPENING_ANGLE, PRESETS, SEGMENTS } from './data';
import type { CamSettings, LawId, TimingInput } from './data';
import { advanceAngle, boundaryValues, derivativePeaks, motionSegments, sampleMotion, validateTiming } from './engine';
import { createScene, sceneMarkup } from './scene';

let nextId = 0;
const number = (value: number, places = 3) => {
  const clean = Math.abs(value) < 0.5 * 10 ** -places ? 0 : value;
  return Math.abs(clean) >= 1000 ? clean.toExponential(2) : clean.toFixed(places);
};

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'cam-workshop');
  const id = `cw-${++nextId}`;
  page.root.setAttribute('aria-labelledby', `${id}-title`);
  page.root.dataset.workspace = 'true';
  page.root.innerHTML = `
    <div class="cw-site">
      <header class="cw-masthead">
        <div class="cw-brand"><span class="cw-mark" aria-hidden="true">c/w</span><span>MECHANISMS, TAKEN APART</span></div>
        <span class="cw-edition">FIELD INSTRUMENT / 060</span>
        <h1 id="${id}-title">Cam <em>Workshop</em><span aria-hidden="true">.</span></h1>
        <p class="cw-intro">One turn. Four phases.<br> A shape that tells a follower where to go.</p>
      </header>
      <nav class="cw-workspace-tools" aria-label="Workbench panels">
        <button type="button" data-cw-parameters-open>Parameters</button>
        <button type="button" data-cw-traces-open>Traces</button>
        <button type="button" data-cw-notebook-open>Notebook</button>
      </nav>

      <section class="cw-workbench" data-project-preview aria-label="Interactive radial cam workbench" aria-describedby="${id}-keyboard" tabindex="0">
        <section class="cw-mechanism" aria-labelledby="${id}-mechanism">
          <header class="cw-panel-heading">
            <div><p class="cw-eyebrow">01 / THE MECHANISM</p><h2 id="${id}-mechanism">The shape is the program.</h2></div>
            <div class="cw-angle-display"><span>CAM ANGLE θ</span><output data-cw-angle>042.0°</output></div>
          </header>
          <div class="cw-machine">
            ${sceneMarkup(id)}
            <span class="cw-annotation cw-annotation-blade">Translating<br><strong>knife edge</strong></span>
            <span class="cw-annotation cw-annotation-guide">Fixed guide</span>
            <div class="cw-radius-tag"><span>BASE CIRCLE</span><strong>R<sub>b</sub> <output data-cw-base-readout>1.20</output> <small>lu</small></strong><span class="cw-dashed-key" aria-hidden="true"></span></div>
            <div class="cw-lift-tag"><span>CURRENT LIFT</span><strong><output data-cw-lift-readout>0.000</output> <small>lu</small></strong><span data-cw-fraction>0% of h</span></div>
          </div>
          <div class="cw-machine-caption"><span><b aria-hidden="true">↺</b> Positive rotation · CCW</span><span>Point contact. No roller.</span></div>
          <div class="cw-phase-buttons" aria-label="Inspect a phase">
            ${SEGMENTS.map((segment) => `<button type="button" data-cw-phase="${segment.id}" aria-label="Inspect ${segment.name.toLowerCase()}" style="--cw-phase-color:${segment.color}"><span>${segment.name}</span><strong data-cw-duration="${segment.id}">—</strong></button>`).join('')}
          </div>
        </section>

        <div class="cw-transport">
          <div class="cw-playback">
            <button class="cw-play" type="button" data-cw-play aria-label="Play cam"><span data-cw-play-icon aria-hidden="true">▶</span><span data-cw-play-text>Play</span></button>
            <button type="button" data-cw-back aria-label="Step back 5 degrees">−5°</button>
            <button type="button" data-cw-forward aria-label="Step forward 5 degrees">+5°</button>
            <button type="button" data-cw-reset aria-label="Reset workshop">Reset</button>
          </div>
          <div class="cw-scrub">
            <div class="cw-field-heading"><label for="${id}-angle">Scrub a revolution</label><output for="${id}-angle" data-cw-scrub-output>42.0° / 360°</output></div>
            <input id="${id}-angle" type="range" min="0" max="360" step="0.1" value="${OPENING_ANGLE}" data-cw-scrub>
          </div>
          <div class="cw-speed">
            <label for="${id}-speed">Rotation speed</label>
            <select id="${id}-speed" data-cw-speed>${[4, 8, 12, 20].map((speed) => `<option value="${speed}"${speed === DEFAULT_SPEED ? ' selected' : ''}>${speed} rpm</option>`).join('')}</select>
          </div>
          <p class="cw-transport-note">Scrubbing, stepping, or editing pauses the cam. Reset restores the opening setup at 0°.</p>
          <p class="cw-reduced-note" data-cw-reduced hidden>Reduced motion: start still. Play only when you choose.</p>
        </div>

        <section class="cw-traces" aria-labelledby="${id}-traces">
          <header><p class="cw-eyebrow">02 / THE MOTION TRACES</p><h2 id="${id}-traces">Same lift. Different journey.</h2></header>
          <div class="cw-law-controls">
            <div><label for="${id}-law">Motion law</label><select id="${id}-law" data-cw-law>${LAWS.map((law) => `<option value="${law.id}"${law.id === DEFAULT_SETTINGS.law ? ' selected' : ''}>${law.name}</option>`).join('')}</select></div>
            <label class="cw-compare"><input type="checkbox" checked data-cw-compare aria-label="Compare all three laws"><span>Compare <br>all three laws</span></label>
          </div>
          ${[
            ['s', 's', 'Displacement', 'lu'],
            ['velocity', 'ds/dθ', 'Velocity', 'lu/rad'],
            ['acceleration', 'd²s/dθ²', 'Acceleration', 'lu/rad²'],
          ].map(([metric, symbol, label, unit]) => `
            <div class="cw-chart">
              <div class="cw-chart-heading"><p><strong>${symbol}</strong><span>${label}</span></p><span><output data-cw-value="${metric}">0.000</output> <small>${unit}</small></span></div>
              <div class="cw-plot" data-cw-plot="${metric}"></div>
            </div>`).join('')}
          <div class="cw-legend" aria-label="Motion law line key">${LAWS.map((law) => `<span data-cw-legend="${law.id}" style="--cw-law-color:${law.color}"><i aria-hidden="true"></i>${law.shortName}</span>`).join('')}</div>
          <p class="cw-trace-note">θ → cam angle in degrees. Derivatives are per radian, not per second. Solid = selected; dashed = comparisons. All share timing, lift, and axes.</p>
          <p class="cw-boundary-note" data-cw-boundary-note>Derivatives are per radian, not per second.</p>
        </section>
      </section>
      <p class="cw-status" role="status" aria-live="polite" data-cw-status></p>

      <div class="cw-settings">
        <section class="cw-program" aria-labelledby="${id}-program">
          <p class="cw-eyebrow">03 / WRITE A REVOLUTION</p>
          <h2 id="${id}-program">A 360° budget.</h2>
          <p>Give each move room. Low dwell is whatever remains.</p>
          <div class="cw-presets" aria-label="Timing presets">${PRESETS.map((preset) => `<button type="button" data-cw-preset="${preset.id}" aria-pressed="${preset.id === 'balanced'}">${preset.name}</button>`).join('')}</div>
          <form class="cw-timing-form" novalidate data-cw-timing-form>
            <div class="cw-timing-fields">
              ${[
                ['rise', 'Rise', 1, 359, DEFAULT_SETTINGS.rise],
                ['high', 'High dwell', 0, 358, DEFAULT_SETTINGS.high],
                ['return', 'Return', 1, 359, DEFAULT_SETTINGS.return],
              ].map(([key, label, min, max, value]) => `<div><label for="${id}-${key}">${label} <span>°</span></label><input id="${id}-${key}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${value}" data-cw-timing="${key}" aria-describedby="${id}-timing-hint ${id}-timing-error"></div>`).join('')}
              <div class="cw-low-dwell"><label for="${id}-low">Low dwell</label><output id="${id}-low" data-cw-low>60°</output></div>
            </div>
            <p class="cw-hint" id="${id}-timing-hint">Whole degrees. Rise and return: 1–359°. Dwells may be zero. Total must not exceed 360°.</p>
            <p class="cw-error" id="${id}-timing-error" role="alert" data-cw-error hidden></p>
          </form>
          <div class="cw-timing-bar" aria-hidden="true">${SEGMENTS.map((segment) => `<span data-cw-bar="${segment.id}" style="--cw-phase-color:${segment.color}"></span>`).join('')}</div>
          <p class="cw-preset-note" data-cw-preset-note>${PRESETS[0].note}</p>
          <div class="cw-geometry">
            <div>
              <div class="cw-field-heading"><label for="${id}-lift">Lift h</label><output for="${id}-lift" data-cw-lift-setting>0.80 lu</output></div>
              <input id="${id}-lift" type="range" min="${LIMITS.lift[0]}" max="${LIMITS.lift[1]}" step="0.05" value="${DEFAULT_SETTINGS.lift}" data-cw-geometry="lift">
            </div>
            <div>
              <div class="cw-field-heading"><label for="${id}-base">Base radius R<sub>b</sub></label><output for="${id}-base" data-cw-base-setting>1.20 lu</output></div>
              <input id="${id}-base" type="range" min="${LIMITS.base[0]}" max="${LIMITS.base[1]}" step="0.05" value="${DEFAULT_SETTINGS.base}" data-cw-geometry="base">
            </div>
          </div>
          <p class="cw-hint">lu = normalized length unit. Base radius changes the body size, not s(θ). Lift scales displacement and both derivatives.</p>
        </section>

        <section class="cw-notebook" aria-labelledby="${id}-notebook">
          <p class="cw-eyebrow">04 / READ BETWEEN THE CURVES</p>
          <h2 id="${id}-notebook" data-cw-law-headline></h2>
          <p data-cw-law-description></p>
          <div class="cw-phase-note"><span data-cw-segment-number>01</span><div><h3 data-cw-segment-name>During the rise</h3><p data-cw-segment-note></p></div></div>
          <div class="cw-peak-table-wrap">
            <table class="cw-peak-table">
              <caption>Exact peak magnitudes · current lift &amp; timing</caption>
              <thead><tr><th scope="col">Law</th><th scope="col">|ds/dθ|<small>lu/rad</small></th><th scope="col">|d²s/dθ²|<small>lu/rad²</small></th></tr></thead>
              <tbody>${LAWS.map((law) => `<tr data-cw-peak-row="${law.id}"><th scope="row">${law.name}</th><td data-cw-peak="${law.id}-velocity"></td><td data-cw-peak="${law.id}-acceleration"></td></tr>`).join('')}</tbody>
            </table>
          </div>
          <p class="cw-hint">The shorter moving interval sets these largest absolute values. Shortening an interval β increases velocity as 1/β and acceleration as 1/β².</p>
          <p class="cw-try"><strong>Try this</strong><span data-cw-law-experiment></span></p>
        </section>
      </div>

      <section class="cw-law-library" aria-labelledby="${id}-library">
        <div class="cw-library-heading"><p class="cw-eyebrow">THE MOTION-LAW NOTEBOOK</p><h2 id="${id}-library">Smooth position is only the beginning.</h2><p>For a ramp coordinate u from 0 to 1, choose a normalized displacement f(u).</p></div>
        <div class="cw-law-cards">${LAWS.map((law, index) => `
          <article class="cw-law-card" data-cw-law-card="${law.id}" style="--cw-law-color:${law.color}">
            <header><span>0${index + 1}</span><h3>${law.name}</h3></header>
            <p class="cw-formula">f(u) = ${escapeMarkup(law.formula)}</p>
            <p>${escapeMarkup(law.boundary)}</p>
            <details><summary>Analytic derivatives</summary><p class="cw-equation">f′(u) = ${escapeMarkup(law.first)}</p><p class="cw-equation">f″(u) = ${escapeMarkup(law.second)}</p></details>
            <button type="button" data-cw-use-law="${law.id}">Inspect ${law.shortName} <span aria-hidden="true">↗</span></button>
          </article>`).join('')}</div>
      </section>

      <details class="cw-model">
        <summary><span>Under the cover</span><span>Coordinates, units &amp; limits <b aria-hidden="true">＋</b></span></summary>
        <div class="cw-model-content">
          <section><h3>Angle is not time.</h3><p>β is the moving interval in radians; u = (θ − θ₀)/β. The controls and horizontal axes display degrees, converted internally to radians.</p>
            <p class="cw-equation">Rise: s = h f(u)<br>ds/dθ = (h/β) f′(u)<br>d²s/dθ² = (h/β²) f″(u)</p>
            <p class="cw-equation">Return: s = h [1 − f(u)]<br>ds/dθ = −(h/β) f′(u)<br>d²s/dθ² = −(h/β²) f″(u)</p>
            <p>At a dwell, s is either h or 0 and both derivatives are zero. At a jump, acceleration is undefined at the exact edge; the numeric display uses its right-hand limit. Open/filled dots show left/right limits on the selected acceleration trace.</p>
            <p>For constant speed n in rpm, ω = 2πn/60 rad/s. Temporal velocity is ṡ = ω(ds/dθ) in lu/s; temporal acceleration is s̈ = ω²(d²s/dθ²) in lu/s². These are not the plotted angular derivatives.</p>
            <p class="cw-speed-note">Current ω: <output data-cw-omega></output> rad/s. Changing rpm does not change the angular curves.</p>
          </section>
          <section><h3>The profile must meet the point.</h3><p>The follower is fixed on the upward centerline. In mathematical coordinates, positive θ rotates the cam counterclockwise and the reference direction is π/2.</p>
            <p class="cw-equation">r(φ) = R<sub>b</sub> + s(π/2 − φ)</p>
            <p>At body angle φ = π/2 − θ, rotate the profile by θ. The contact is exactly (0, R<sub>b</sub> + s(θ)) in upward-positive coordinates, or (0, −[R<sub>b</sub> + s(θ)]) in SVG screen coordinates. The SVG rotation is therefore −θ.</p>
            <p>The outline is finely sampled and includes every timing boundary plus the exact current contact vertex. The pointed blade really meets that rendered outline; it is not a decorative roller over a different cam.</p>
            <h3>A kinematic study, not a design approval.</h3><ul>${LIMITATIONS.map((item) => `<li>${escapeMarkup(item)}</li>`).join('')}</ul>
          </section>
        </div>
      </details>
      <footer class="cw-footer"><strong>CAM WORKSHOP <span aria-hidden="true">/</span> A study in turning shape into motion.</strong><p id="${id}-keyboard">Keyboard: Tab to any control; arrows scrub the slider. Space on the workbench plays or pauses. Native controls keep their usual keys.</p><p>Ideal knife-edge geometry · normalized dimensions · no manufacturing or safety-critical guidance.</p></footer>
    </div>`;

  page.root.querySelectorAll('output').forEach((output) => output.setAttribute('aria-live', 'off'));
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const workbench = get<HTMLElement>('.cw-workbench');
  const program = get<HTMLElement>('.cw-program');
  program.prepend(get('.cw-law-controls'));
  const parametersPanel = document.createElement('div');
  const tracesPanel = document.createElement('div');
  parametersPanel.append(program);
  tracesPanel.append(get('.cw-traces'));
  const panels = document.createElement('div');
  panels.id = `${id}-instrument-panels`;
  panels.className = 'cw-dock-panels';
  panels.append(parametersPanel, tracesPanel);
  const tabsHost = document.createElement('div');
  const instruments = document.createElement('aside');
  instruments.className = 'cw-instruments';
  instruments.setAttribute('aria-label', 'Cam instruments');
  instruments.append(tabsHost, panels);
  const tabs = createWorkspaceTabs(page, {
    id: `${id}-instruments`, label: 'Cam instruments', host: tabsHost, preserveLayout: true,
    panes: [
      { id: 'parameters', label: 'Parameters', panel: parametersPanel },
      { id: 'traces', label: 'Traces', panel: tracesPanel },
    ],
  });
  const guide = document.createElement('div');
  guide.className = 'cw-operating-notes';
  guide.append(get('.cw-edition'), get('.cw-intro'), get('.cw-panel-heading > div:first-child'),
    get('.cw-machine-caption'), get('.cw-transport-note'), get('.cw-reduced-note'));
  const stageLabel = document.createElement('span');
  stageLabel.className = 'cw-stage-label';
  stageLabel.textContent = 'Knife-edge cam';
  get('.cw-panel-heading').prepend(stageLabel);
  createWorkspaceDialog(page, {
    id: `${id}-notebook-dialog`, title: 'Motion-law notebook',
    content: [guide, get('.cw-notebook'), get('.cw-law-library'), get('.cw-model'), get('.cw-footer')],
    triggers: [get('[data-cw-notebook-open]')],
  });
  get('.cw-settings').remove();
  const dock = createWorkspaceDialog(page, {
    id: `${id}-instruments-dialog`, title: 'Cam instruments', content: [instruments],
  });
  const compact = window.matchMedia('(max-width: 700px), (max-height: 540px)');
  const triggers = [get<HTMLButtonElement>('[data-cw-parameters-open]'), get<HTMLButtonElement>('[data-cw-traces-open]')];
  function placeInstruments() {
    const focused = instruments.contains(document.activeElement);
    dock.close();
    (compact.matches ? query(dock.dialog, '.workspace-dialog-content') : workbench).append(instruments);
    for (const trigger of triggers) {
      trigger.setAttribute('aria-controls', compact.matches ? dock.dialog.id : panels.id);
      if (compact.matches) trigger.setAttribute('aria-haspopup', 'dialog');
      else trigger.removeAttribute('aria-haspopup');
    }
    if (focused) triggers[0].focus({ preventScroll: true });
  }
  triggers.forEach((trigger, index) => trigger.addEventListener('click', () => {
    tabs.select(index === 0 ? 'parameters' : 'traces');
    if (compact.matches) dock.open();
    else tabsHost.querySelector<HTMLButtonElement>('[aria-selected="true"]')!.focus({ preventScroll: true });
  }, { signal: page.signal }));
  compact.addEventListener('change', placeInstruments, { signal: page.signal });
  placeInstruments();
  const playButton = get<HTMLButtonElement>('[data-cw-play]');
  const playText = get<HTMLElement>('[data-cw-play-text]');
  const playIcon = get<HTMLElement>('[data-cw-play-icon]');
  const scrub = get<HTMLInputElement>('[data-cw-scrub]');
  const lawInput = get<HTMLSelectElement>('[data-cw-law]');
  const compareInput = get<HTMLInputElement>('[data-cw-compare]');
  const speedInput = get<HTMLSelectElement>('[data-cw-speed]');
  const error = get<HTMLElement>('[data-cw-error]');
  const lowOutput = get<HTMLOutputElement>('[data-cw-low]');
  const status = get<HTMLElement>('[data-cw-status]');
  const reducedNote = get<HTMLElement>('[data-cw-reduced]');
  const timingInputs = Object.fromEntries((['rise', 'high', 'return'] as const).map((key) => [key, get<HTMLInputElement>(`[data-cw-timing="${key}"]`)])) as Record<keyof TimingInput, HTMLInputElement>;
  const geometryInputs = {
    lift: get<HTMLInputElement>('[data-cw-geometry="lift"]'),
    base: get<HTMLInputElement>('[data-cw-geometry="base"]'),
  };
  const values = {
    s: get<HTMLOutputElement>('[data-cw-value="s"]'),
    velocity: get<HTMLOutputElement>('[data-cw-value="velocity"]'),
    acceleration: get<HTMLOutputElement>('[data-cw-value="acceleration"]'),
  };
  const angleDisplay = get<HTMLOutputElement>('[data-cw-angle]');
  const scrubOutput = get<HTMLOutputElement>('[data-cw-scrub-output]');
  const currentLift = get<HTMLOutputElement>('[data-cw-lift-readout]');
  const fraction = get<HTMLElement>('[data-cw-fraction]');
  const boundaryNote = get<HTMLElement>('[data-cw-boundary-note]');
  const phaseButtons = [...page.root.querySelectorAll<HTMLButtonElement>('[data-cw-phase]')];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const startsReduced = context.reducedMotion || preference.matches;
  let settings: CamSettings = { ...DEFAULT_SETTINGS };
  let angle = OPENING_ANGLE;
  let speed = DEFAULT_SPEED;
  let comparison = true;
  let paused = startsReduced;
  let invalidTiming = false;
  let lastSegment = '';

  let scene: ReturnType<typeof createScene>;
  try {
    scene = createScene(page.root, page.signal);
  } catch (error) {
    page.destroy();
    context.report('Cam Workshop could not create its motion-trace canvases.');
    throw error;
  }
  page.onCleanup(scene.dispose);

  function announce(message: string) {
    if (page.signal.aborted) return;
    status.textContent = message;
  }

  function draw() {
    if (page.signal.aborted) return;
    const sample = sampleMotion(settings, angle);
    scene.draw(angle);
    page.root.dataset.angle = angle.toFixed(6);
    page.root.dataset.segment = sample.segment;
    page.root.dataset.displacement = String(sample.s);
    page.root.dataset.velocity = String(sample.velocity);
    page.root.dataset.acceleration = String(sample.acceleration);
    angleDisplay.textContent = `${angle.toFixed(1).padStart(5, '0')}°`;
    scrub.value = String(angle);
    scrub.style.setProperty('--cw-progress', `${angle / 3.6}%`);
    scrubOutput.textContent = `${angle.toFixed(1)}° / 360°`;
    scrub.setAttribute('aria-valuetext', `${angle.toFixed(1)} degrees, ${SEGMENTS.find((segment) => segment.id === sample.segment)!.name}`);
    for (const metric of ['s', 'velocity', 'acceleration'] as const) values[metric].textContent = number(sample[metric]);
    currentLift.textContent = number(sample.s);
    fraction.textContent = `${(sample.s / settings.lift * 100).toFixed(1)}% of h`;
    const edge = boundaryValues(settings, angle);
    boundaryNote.textContent = edge?.accelerationJump
      ? `Acceleration jumps here: left ${number(edge.left.acceleration)}, right ${number(edge.right.acceleration)} lu/rad². Readout = right limit; acceleration at the edge is undefined.`
      : settings.law === 'harmonic'
        ? 'Separate paths preserve jumps. Open / filled dots = left / right acceleration limits at the selected law’s edges.'
        : 'Zero endpoint acceleration, not zero jerk. The highlighted band follows the current phase.';
    if (sample.segment !== lastSegment) {
      const segment = SEGMENTS.find((item) => item.id === sample.segment)!;
      get<HTMLElement>('[data-cw-segment-number]').textContent = segment.number;
      get<HTMLElement>('[data-cw-segment-name]').textContent = segment.name;
      get<HTMLElement>('[data-cw-segment-note]').textContent = segment.note;
      for (const button of phaseButtons) button.setAttribute('aria-current', button.dataset.cwPhase === sample.segment ? 'step' : 'false');
      lastSegment = sample.segment;
    }
  }

  const loop = createLoop((_elapsed, delta) => {
    if (paused || page.signal.aborted) return;
    angle = advanceAngle(angle, delta, speed);
    draw();
  }, { paused });
  page.onCleanup(loop.destroy);

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value || invalidTiming;
    loop.setPaused(paused);
    playText.textContent = paused ? 'Play' : 'Pause';
    playIcon.textContent = paused ? '▶' : 'Ⅱ';
    playButton.setAttribute('aria-label', paused ? 'Play cam' : 'Pause cam');
    playButton.disabled = invalidTiming;
    page.root.dataset.motion = paused ? 'paused' : 'playing';
  }

  function updateSpeed() {
    speedInput.value = String(speed);
    page.root.dataset.speed = String(speed);
    get<HTMLOutputElement>('[data-cw-omega]').textContent = (Math.PI * 2 * speed / 60).toFixed(4);
  }

  function configure() {
    const law = LAWS.find((item) => item.id === settings.law)!;
    page.root.dataset.law = settings.law;
    page.root.dataset.timing = `${settings.rise},${settings.high},${settings.return}`;
    page.root.dataset.base = String(settings.base);
    page.root.dataset.lift = String(settings.lift);
    page.root.dataset.comparison = String(comparison);
    lawInput.value = settings.law;
    compareInput.checked = comparison;
    scene.configure(settings, comparison);
    get<HTMLOutputElement>('[data-cw-base-readout]').textContent = settings.base.toFixed(2);
    get<HTMLOutputElement>('[data-cw-lift-setting]').textContent = `${settings.lift.toFixed(2)} lu`;
    get<HTMLOutputElement>('[data-cw-base-setting]').textContent = `${settings.base.toFixed(2)} lu`;
    geometryInputs.base.setAttribute('aria-valuetext', `${settings.base.toFixed(2)} normalized length units`);
    geometryInputs.lift.setAttribute('aria-valuetext', `${settings.lift.toFixed(2)} normalized length units`);
    for (const key of ['base', 'lift'] as const) {
      geometryInputs[key].style.setProperty('--cw-progress', `${(settings[key] - LIMITS[key][0]) / (LIMITS[key][1] - LIMITS[key][0]) * 100}%`);
    }
    get<HTMLElement>('[data-cw-law-headline]').textContent = law.headline;
    get<HTMLElement>('[data-cw-law-description]').textContent = law.description;
    get<HTMLElement>('[data-cw-law-experiment]').textContent = law.experiment;
    for (const definition of LAWS) {
      const selected = definition.id === settings.law;
      get<HTMLElement>(`[data-cw-legend="${definition.id}"]`).dataset.selected = String(selected);
      get<HTMLElement>(`[data-cw-legend="${definition.id}"]`).hidden = !selected && !comparison;
      get<HTMLElement>(`[data-cw-law-card="${definition.id}"]`).dataset.selected = String(selected);
      get<HTMLElement>(`[data-cw-peak-row="${definition.id}"]`).dataset.selected = String(selected);
      const peaks = derivativePeaks(settings, definition.id);
      for (const metric of ['velocity', 'acceleration'] as const) get<HTMLElement>(`[data-cw-peak="${definition.id}-${metric}"]`).textContent = number(peaks[metric]);
    }
    for (const segment of motionSegments(settings)) {
      get<HTMLElement>(`[data-cw-duration="${segment.id}"]`).textContent = `${segment.duration}°`;
      get<HTMLElement>(`[data-cw-bar="${segment.id}"]`).style.width = `${segment.duration / 3.6}%`;
      get<HTMLButtonElement>(`[data-cw-phase="${segment.id}"]`).disabled = segment.duration === 0;
    }
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-cw-preset]')) {
      const preset = PRESETS.find((entry) => entry.id === button.dataset.cwPreset)!;
      button.setAttribute('aria-pressed', String(preset.rise === settings.rise && preset.high === settings.high && preset.return === settings.return));
    }
    draw();
  }

  function clearTimingError() {
    invalidTiming = false;
    error.hidden = true;
    error.textContent = '';
    for (const input of Object.values(timingInputs)) input.removeAttribute('aria-invalid');
    page.root.dataset.timingValid = 'true';
    lowOutput.textContent = `${360 - settings.rise - settings.high - settings.return}°`;
    playButton.disabled = false;
  }

  function syncInputs() {
    for (const key of ['rise', 'high', 'return'] as const) timingInputs[key].value = String(settings[key]);
    for (const key of ['base', 'lift'] as const) geometryInputs[key].value = String(settings[key]);
    updateSpeed();
  }

  function readTiming() {
    setPaused(true);
    const input: TimingInput = {
      rise: timingInputs.rise.valueAsNumber,
      high: timingInputs.high.valueAsNumber,
      return: timingInputs.return.valueAsNumber,
    };
    const validation = validateTiming(input);
    if (!validation.ok) {
      invalidTiming = true;
      error.hidden = false;
      error.textContent = `${validation.errors.join(' ')} The drawing and traces keep the last valid timing (${settings.rise}° / ${settings.high}° / ${settings.return}°).`;
      for (const key of ['rise', 'high', 'return'] as const) {
        timingInputs[key].setAttribute('aria-invalid', String(validation.fields.includes(key)));
      }
      const remaining = 360 - input.rise - input.high - input.return;
      lowOutput.textContent = Number.isFinite(remaining) ? `${remaining}° !` : '—';
      page.root.dataset.timingValid = 'false';
      setPaused(true);
      announce('Timing is not applied. Correct the marked fields; other controls are unchanged.');
      return;
    }
    settings = { ...settings, ...input };
    clearTimingError();
    get<HTMLElement>('[data-cw-preset-note]').textContent = 'Custom timing. All three comparison laws share these exact intervals; zero-duration dwells are omitted, not divided by.';
    configure();
    announce(`Timing applied. Low dwell is ${validation.timing.low}°. Paused at the same angle.`);
  }

  function chooseLaw(law: LawId) {
    if (!LAWS.some((entry) => entry.id === law)) {
      lawInput.value = settings.law;
      announce('Choose one of the three motion laws. The selected law has not changed.');
      return;
    }
    setPaused(true);
    settings = { ...settings, law };
    configure();
    announce(`${LAWS.find((entry) => entry.id === law)!.name} selected. The actual profile and all three selected traces now use this law.`);
  }

  function seek(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 360) {
      announce('The cam angle must be a finite number from 0 to 360 degrees.');
      return;
    }
    setPaused(true);
    angle = value;
    draw();
    announce(`Paused at ${angle.toFixed(1)}°. The blade and traces share this exact angle.`);
  }

  function reset() {
    if (page.signal.aborted) return;
    settings = { ...DEFAULT_SETTINGS };
    angle = 0;
    speed = DEFAULT_SPEED;
    comparison = true;
    clearTimingError();
    setPaused(true);
    syncInputs();
    get<HTMLElement>('[data-cw-preset-note]').textContent = PRESETS[0].note;
    configure();
    announce('Workshop reset: cycloidal law, original timing and dimensions, 8 rpm, paused at 0°.');
  }

  function togglePlayback() {
    setPaused(!paused);
    announce(paused ? 'Cam paused. Scrub to inspect any part of the revolution.' : `Cam turning counterclockwise at ${speed} rpm.`);
  }

  playButton.addEventListener('click', togglePlayback, { signal: page.signal });
  get<HTMLButtonElement>('[data-cw-reset]').addEventListener('click', reset, { signal: page.signal });
  scrub.addEventListener('input', () => seek(scrub.valueAsNumber), { signal: page.signal });
  get<HTMLButtonElement>('[data-cw-back]').addEventListener('click', () => seek(angle < 5 ? angle + 355 : angle - 5), { signal: page.signal });
  get<HTMLButtonElement>('[data-cw-forward]').addEventListener('click', () => seek(angle > 355 ? angle - 355 : angle + 5), { signal: page.signal });
  lawInput.addEventListener('change', () => chooseLaw(lawInput.value as LawId), { signal: page.signal });
  compareInput.addEventListener('change', () => {
    comparison = compareInput.checked;
    configure();
    announce(comparison ? 'Comparison on: all three analytic laws, with identical timing, lift, and scales.' : 'Comparison off: only the selected law is drawn. Axis scales are unchanged.');
  }, { signal: page.signal });
  speedInput.addEventListener('change', () => {
    const value = Number(speedInput.value);
    if (![4, 8, 12, 20].includes(value)) {
      speedInput.value = String(speed);
      announce('Choose one of the available rotation speeds. The current speed is unchanged.');
      return;
    }
    speed = value;
    updateSpeed();
    announce(`Rotation speed is ${speed} rpm. Angular curves do not change with speed.`);
  }, { signal: page.signal });
  for (const input of Object.values(timingInputs)) input.addEventListener('input', readTiming, { signal: page.signal });
  get<HTMLFormElement>('[data-cw-timing-form]').addEventListener('submit', (event) => event.preventDefault(), { signal: page.signal });
  for (const key of ['lift', 'base'] as const) {
    geometryInputs[key].addEventListener('input', () => {
      const value = geometryInputs[key].valueAsNumber;
      if (!Number.isFinite(value) || value < LIMITS[key][0] || value > LIMITS[key][1]) {
        geometryInputs[key].value = String(settings[key]);
        announce(`${key === 'base' ? 'Base radius' : 'Lift'} must be from ${LIMITS[key][0]} to ${LIMITS[key][1]} normalized length units. The geometry is unchanged.`);
        return;
      }
      setPaused(true);
      settings = { ...settings, [key]: value };
      configure();
      announce(key === 'base' ? 'Base radius changed. The profile grows or shrinks; displacement and its derivatives stay the same.' : 'Lift changed. The profile and angular traces are scaled to the new travel.');
    }, { signal: page.signal });
  }
  for (const button of phaseButtons) {
    button.addEventListener('click', () => {
      const segment = motionSegments(settings).find((entry) => entry.id === button.dataset.cwPhase)!;
      if (segment.duration) seek(segment.start + segment.duration / 2);
    }, { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-cw-preset]')) {
    button.addEventListener('click', () => {
      const preset = PRESETS.find((entry) => entry.id === button.dataset.cwPreset)!;
      settings = { ...settings, rise: preset.rise, high: preset.high, return: preset.return };
      clearTimingError();
      setPaused(true);
      syncInputs();
      configure();
      get<HTMLElement>('[data-cw-preset-note]').textContent = preset.note;
      announce(`${preset.name} timing applied. Law, lift, and base radius are unchanged.`);
    }, { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-cw-use-law]')) {
    button.addEventListener('click', () => chooseLaw(button.dataset.cwUseLaw as LawId), { signal: page.signal });
  }
  workbench.addEventListener('keydown', (event) => {
    if (event.target === workbench && event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
    }
  }, { signal: page.signal });
  preference.addEventListener('change', (event) => {
    reducedNote.hidden = !event.matches;
    if (event.matches) {
      setPaused(true);
      announce('Reduced motion enabled. The cam is paused; it will not restart automatically.');
    }
  }, { signal: page.signal });

  reducedNote.hidden = !startsReduced;
  syncInputs();
  clearTimingError();
  configure();
  setPaused(paused);
  announce(startsReduced ? 'Reduced motion: paused at a study angle. Scrub freely, or choose Play.' : 'The cam is turning. Pause it and see how one contour writes three different traces.');
  return { destroy: page.destroy, setPaused, reset };
}
