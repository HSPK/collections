import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { ELECTRICAL_SPEED, FIELD_NOTES, PHASES, PRESETS, SPEEDS } from './data';
import { advanceElectricalAngle, normalizeDegrees, sampleMotor, signedDegrees } from './engine';
import type { MotorFrame, MotorInput } from './engine';
import { createMotorScene, createWaveformScene } from './scene';

let mountNumber = 0;
const signed = (value: number, decimals = 3) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(decimals)}`;

function presetInput(preset: typeof PRESETS[number]): MotorInput {
  return {
    electricalAngle: preset.electricalAngle,
    enabled: [...preset.enabled],
    commandLag: preset.commandLag,
    rotorMode: preset.rotorMode,
    rotorAngle: preset.rotorAngle,
  };
}

function observation(frame: MotorFrame, settings: MotorInput): string {
  if (frame.field.angle === null) {
    return 'Zero field has no direction. Every contribution is zero at this instant, so electromagnetic torque is zero too. The prescribed rotor can still move during playback; it is not being driven by calculated torque.';
  }
  const enabled = settings.enabled.filter(Boolean).length;
  if (enabled === 1) {
    return 'One phase produces a field along a fixed line, not a circular rotating field. It shrinks to zero twice per cycle and reverses. At those zero crossings, field direction is undefined.';
  }
  if (enabled === 2) {
    return 'Two remaining sources trace an elliptical field. Its magnitude and direction no longer track the balanced command. Torque uses the actual resultant and the rotor moment, not the commanded load angle alone.';
  }
  if (settings.rotorMode === 'hold') {
    return 'The three-phase field still has unit magnitude, but the rotor is held at a fixed mechanical angle. As the field passes the rotor, torque crosses zero and reverses. The holding constraint is not a simulated load.';
  }
  return 'The balanced resultant keeps unit magnitude as the command rotates. The prescribed rotor follows at the chosen load angle. A lagging rotor has positive torque; a leading rotor has negative torque.';
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'motor-field-lab');
  const { root } = page;
  const id = `motor-field-${++mountNumber}`;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let paused = context.reducedMotion || preference.matches;
  let settings = presetInput(PRESETS[0]);
  let speed = 1;
  let selectedPreset: string | null = PRESETS[0].id;

  root.innerHTML = `
    <div class="mfl-shell">
      <header class="mfl-header">
        <div class="mfl-identity"><span class="mfl-emblem" aria-hidden="true">⌁</span> FIELD STUDIES <span class="mfl-edition">/ 01</span></div>
        <div class="mfl-heading-row">
          <div><h1>Motor Field Lab<span aria-hidden="true">.</span></h1><p>Three stationary coils. One rotating field. See what makes the rotor turn.</p></div>
          <p class="mfl-model-stamp">PERMANENT MAGNET<br><strong>1 pole pair · normalized</strong></p>
        </div>
      </header>

      <section class="mfl-workbench" aria-label="Interactive motor field workbench" data-project-preview>
        <div class="mfl-visual">
          <div class="mfl-viewbar">
            <h2 class="mfl-panel-title"><span>01</span> Air-gap view</h2>
            <button class="mfl-play" data-mfl-play type="button">
              <span data-mfl-play-symbol aria-hidden="true">Ⅱ</span><span data-mfl-play-label>Pause</span>
            </button>
          </div>
          <figure class="mfl-motor-figure">
            <div class="mfl-motor-holder" data-mfl-motor></div>
            <figcaption>
              <ul class="mfl-legend">
                <li><span class="mfl-key mfl-key-field" aria-hidden="true"></span>Resultant B</li>
                <li><span class="mfl-key mfl-key-rotor" aria-hidden="true"></span>PM rotor · S → N</li>
                <li><span class="mfl-key mfl-key-phase" aria-hidden="true"></span>Phase vectors</li>
              </ul>
              <p>0° points right · positive angles ↺<br>Letters pair opposite coils; N / S mark their air-gap faces.</p>
            </figcaption>
          </figure>
          <div class="mfl-drive-controls">
            <label class="mfl-control-label" for="${id}-angle">Electrical command θₑ <output data-mfl-angle-output aria-live="off">30.0°</output></label>
            <input id="${id}-angle" data-mfl-angle type="range" min="0" max="360" step="0.1" value="30" aria-label="Electrical angle" aria-describedby="${id}-scrub-note">
            <div class="mfl-range-ends"><span>0°</span><span id="${id}-scrub-note">Scrub to pause & inspect</span><span>360°</span></div>
            <div class="mfl-transport">
              <button data-mfl-step type="button" aria-label="Step forward 15 degrees">+15° step</button>
              <button data-mfl-reset type="button" aria-label="Reset lab">Reset</button>
              <label class="mfl-speed-label">Speed
                <select data-mfl-speed aria-label="Playback speed">
                  ${SPEEDS.map((item) => `<option value="${item.value}" ${item.value === 1 ? 'selected' : ''}>${item.label}</option>`).join('')}
                </select>
              </label>
            </div>
            <p class="mfl-motion-note" data-mfl-reduced hidden>Reduced motion: paused initially. Play is always an explicit option.</p>
          </div>
        </div>

        <aside class="mfl-instruments" aria-label="Motor measurements and controls">
          <section class="mfl-readout">
            <h2 class="mfl-panel-title"><span>02</span> Vector readout</h2>
            <div class="mfl-field-readings">
              <div><span class="mfl-reading-label">Field magnitude |B|</span><strong data-mfl-magnitude>1.000</strong><span class="mfl-reading-unit">normalized</span></div>
              <div><span class="mfl-reading-label">Field direction β</span><strong class="mfl-direction" data-mfl-direction>30.0°</strong><span class="mfl-reading-unit">from the +x axis</span></div>
            </div>
            <p class="mfl-components">Bₓ <span data-mfl-bx></span><span class="mfl-component-divider">/</span>Bᵧ <span data-mfl-by></span></p>
            <div class="mfl-torque-heading"><span class="mfl-reading-label">Ideal torque τ*</span><strong data-mfl-torque>+0.574</strong></div>
            <div class="mfl-torque-track" aria-hidden="true"><span data-mfl-torque-fill></span></div>
            <div class="mfl-torque-scale" aria-hidden="true"><span>−1</span><span>0</span><span>+1</span></div>
            <p class="mfl-torque-direction" data-mfl-torque-direction>↺ Counterclockwise</p>
            <dl class="mfl-angle-readings">
              <div><dt>Rotor mechanical φₘ</dt><dd data-mfl-mechanical></dd></div>
              <div><dt>Actual field–rotor angle δ</dt><dd data-mfl-actual-lag></dd></div>
              <div><dt>Current sum Σiₖ</dt><dd data-mfl-current-sum></dd></div>
            </dl>
          </section>

          <section class="mfl-channels" aria-labelledby="${id}-channels-title">
            <div class="mfl-section-heading"><h2 id="${id}-channels-title">Phase sources</h2><span>ON / OFF</span></div>
            <p class="mfl-small-note">Switch a phase off to zero its current.</p>
            ${PHASES.map((phase) => `
              <div class="mfl-channel" style="--mfl-phase:${phase.color}">
                <button class="mfl-phase-switch" data-mfl-phase="${phase.id}" type="button" aria-label="Phase ${phase.name}" aria-pressed="true">
                  <strong>${phase.name}</strong><span data-mfl-switch-label="${phase.id}">ON</span>
                </button>
                <div class="mfl-channel-data">
                  <div class="mfl-current-line"><span>i${phase.name.toLowerCase()} <span class="mfl-axis">${phase.axis}° axis</span></span><strong data-mfl-current="${phase.id}"></strong></div>
                  <div class="mfl-current-track" aria-hidden="true"><span data-mfl-current-fill="${phase.id}"></span></div>
                  <span class="mfl-pole-reading">${phase.name} / ${phase.name}′ faces <span data-mfl-polarities="${phase.id}"></span></span>
                </div>
              </div>
            `).join('')}
          </section>

          <section class="mfl-rotor-controls">
            <label class="mfl-control-label" for="${id}-rotor-mode">Rotor constraint <span>p = 1</span></label>
            <select id="${id}-rotor-mode" data-mfl-rotor-mode aria-label="Rotor constraint">
              <option value="follow">Follow command at set lag</option>
              <option value="hold">Hold mechanical angle</option>
            </select>
            <div data-mfl-load-control class="mfl-rotor-range">
              <label class="mfl-control-label" for="${id}-load">Commanded load angle δcmd <output data-mfl-load-output aria-live="off"></output></label>
              <input id="${id}-load" data-mfl-load type="range" min="-180" max="180" step="0.1" value="35" aria-label="Commanded load angle" aria-describedby="${id}-load-note">
              <div class="mfl-range-ends"><span>−180° · leads</span><span>lags · +180°</span></div>
              <p class="mfl-small-note" id="${id}-load-note">φₘ = θₑ − δcmd. Prescribed motion, not a solved mechanical load.</p>
            </div>
            <div data-mfl-hold-control class="mfl-rotor-range" hidden>
              <label class="mfl-control-label" for="${id}-rotor-angle">Mechanical rotor angle φₘ <output data-mfl-rotor-output aria-live="off"></output></label>
              <input id="${id}-rotor-angle" data-mfl-rotor-angle type="range" min="0" max="360" step="0.1" value="0" aria-label="Mechanical rotor angle" aria-describedby="${id}-hold-note">
              <div class="mfl-range-ends"><span>0°</span><span>360°</span></div>
              <p class="mfl-small-note" id="${id}-hold-note">The rotor is held while the field turns. Rotor electrical angle φₑ = pφₘ = φₘ.</p>
            </div>
          </section>
        </aside>

        <section class="mfl-scope" aria-labelledby="${id}-scope-title">
          <div class="mfl-scope-heading">
            <h2 class="mfl-panel-title" id="${id}-scope-title"><span>03</span> Current traces</h2>
            <p>One electrical cycle <span>· 120° apart</span></p>
          </div>
          <div class="mfl-trace-legend">
            ${PHASES.map((phase) => `<span style="--mfl-phase:${phase.color}"><i class="mfl-trace-key mfl-trace-key-${phase.id}" aria-hidden="true"></i>${phase.name} <span data-mfl-trace-label="${phase.id}"></span></span>`).join('')}
          </div>
          <figure class="mfl-wave-figure">
            <div class="mfl-scope-y" aria-hidden="true"><span>+1</span><span>0</span><span>−1</span></div>
            <div class="mfl-wave-area"><div data-mfl-waveform></div><div class="mfl-scope-x" aria-hidden="true"><span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span></div></div>
            <figcaption>Normalized current versus θₑ. The cursor is now; muted flat traces are disabled sources.</figcaption>
          </figure>
        </section>

        <section class="mfl-experiments" aria-labelledby="${id}-experiments-title">
          <h2 class="mfl-panel-title" id="${id}-experiments-title"><span>04</span> Bench experiments</h2>
          <div class="mfl-preset-strip" role="group" aria-label="Bench experiments">
            ${PRESETS.map((preset, index) => `<button type="button" data-mfl-preset="${preset.id}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${escapeMarkup(preset.short)}</button>`).join('')}
          </div>
          <div class="mfl-observation"><span class="mfl-observation-mark" aria-hidden="true">↳</span><div><h3 data-mfl-observation-title>Balanced drive</h3><p data-mfl-observation></p></div></div>
        </section>
      </section>
      <div class="mfl-status-strip"><span class="mfl-status-light" aria-hidden="true"></span><p data-mfl-status role="status" aria-live="polite" aria-atomic="true"></p></div>

      <section class="mfl-notebook" aria-labelledby="${id}-notebook-title">
        <div class="mfl-notes">
          <p class="mfl-kicker">THE FIELD NOTEBOOK</p>
          <h2 id="${id}-notebook-title">What the machine<br>is telling you.</h2>
          <ol class="mfl-note-list">${FIELD_NOTES.map((note) => `<li><span>${note.number}</span><div><h3>${escapeMarkup(note.title)}</h3><p>${escapeMarkup(note.text)}</p></div></li>`).join('')}</ol>
        </div>
        <div class="mfl-equations">
          <p class="mfl-kicker">MODEL / OPEN FORM</p>
          <section><h3>Exact current & field geometry</h3>
            <p class="mfl-formula">αₖ ∈ {0°, 120°, 240°}<br>sₖ ∈ {0, 1}<br>iₖ = sₖ cos(θₑ − αₖ)<br>B = ⅔ Σₖ iₖ (cos αₖ, sin αₖ)</p>
            <p>With all sources enabled: Σiₖ = 0 and B = (cos θₑ, sin θₑ), so |B| = 1. The ⅔ factor sets that normalization.</p>
          </section>
          <section><h3>Ideal permanent-magnet torque</h3>
            <p class="mfl-formula">m = (cos φₑ, sin φₑ)<br>τ* = mₓBᵧ − mᵧBₓ<br>τ* = |B| sin(β − φₑ)</p>
            <p>m is a unit rotor moment. β = atan2(Bᵧ, Bₓ) only when |B| &gt; 0. At zero field, β and δ are undefined; the cross product still gives τ* = 0. Torque is normalized, not N·m.</p>
          </section>
          <section><h3>Prescribed kinematics</h3>
            <p class="mfl-formula">p = 1; φₑ = pφₘ<br>dθₑ/dt = 36°/s × viewing speed<br>Follow: φₘ = (θₑ − δcmd) / p<br>Hold: φₘ = chosen angle</p>
            <p>δ = β − φₑ is the actual field–rotor angle, wrapped to (−180°, 180°]. It can differ from δcmd when a phase is disabled. Speed is fixed by playback, never by τ*.</p>
          </section>
        </div>
      </section>
      <footer class="mfl-boundary"><span>MODEL BOUNDARY</span><p>A schematic teaching instrument, not a motor design or wiring guide. Enabled phases are independent ideal current sources; switching one off does not redistribute the others. No circuit connections, voltages, losses, saturation, back EMF, inertia, or load dynamics are modeled.</p><span class="mfl-footer-code">MFL—01 / END OF NOTES</span></footer>
    </div>
  `;

  const motor = createMotorScene(query(root, '[data-mfl-motor]'), id);
  const waveforms = createWaveformScene(query(root, '[data-mfl-waveform]'), id);
  const angleInput = query<HTMLInputElement>(root, '[data-mfl-angle]');
  const loadInput = query<HTMLInputElement>(root, '[data-mfl-load]');
  const rotorInput = query<HTMLInputElement>(root, '[data-mfl-rotor-angle]');
  const modeInput = query<HTMLSelectElement>(root, '[data-mfl-rotor-mode]');
  const speedInput = query<HTMLSelectElement>(root, '[data-mfl-speed]');
  const playButton = query<HTMLButtonElement>(root, '[data-mfl-play]');
  const status = query<HTMLElement>(root, '[data-mfl-status]');
  const reducedNote = query<HTMLElement>(root, '[data-mfl-reduced]');
  const loadControl = query<HTMLElement>(root, '[data-mfl-load-control]');
  const holdControl = query<HTMLElement>(root, '[data-mfl-hold-control]');
  const torqueFill = query<HTMLElement>(root, '[data-mfl-torque-fill]');
  const values = Object.fromEntries([
    'angle-output', 'magnitude', 'direction', 'bx', 'by', 'torque', 'torque-direction',
    'mechanical', 'actual-lag', 'current-sum', 'load-output', 'rotor-output',
    'play-label', 'play-symbol', 'observation-title', 'observation',
  ].map((name) => [name, query<HTMLElement>(root, `[data-mfl-${name}]`)]));
  const channels = PHASES.map((phase) => ({
    button: query<HTMLButtonElement>(root, `[data-mfl-phase="${phase.id}"]`),
    label: query<HTMLElement>(root, `[data-mfl-switch-label="${phase.id}"]`),
    current: query<HTMLElement>(root, `[data-mfl-current="${phase.id}"]`),
    fill: query<HTMLElement>(root, `[data-mfl-current-fill="${phase.id}"]`),
    poles: query<HTMLElement>(root, `[data-mfl-polarities="${phase.id}"]`),
    traceLabel: query<HTMLElement>(root, `[data-mfl-trace-label="${phase.id}"]`),
  }));
  const presetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mfl-preset]'));
  const inactive = () => disposed || page.signal.aborted;
  const text = (name: string, value: string) => {
    if (values[name].textContent !== value) values[name].textContent = value;
  };
  const announce = (message: string) => { if (!inactive()) status.textContent = message; };

  function draw() {
    if (inactive()) return;
    const frame = sampleMotor(settings);
    motor.render(frame);
    waveforms.render(frame);
    root.dataset.motion = paused ? 'paused' : 'playing';
    root.dataset.electricalAngle = settings.electricalAngle.toFixed(6);
    root.dataset.rotorAngle = frame.rotorMechanicalAngle.toFixed(6);
    root.dataset.fieldMagnitude = frame.field.magnitude.toFixed(6);
    root.dataset.torque = frame.torque.toFixed(6);
    root.dataset.preset = selectedPreset ?? 'custom';
    angleInput.value = settings.electricalAngle.toFixed(1);
    angleInput.setAttribute('aria-valuetext', `${settings.electricalAngle.toFixed(1)} electrical degrees`);
    loadInput.value = settings.commandLag.toFixed(1);
    rotorInput.value = settings.rotorAngle.toFixed(1);
    modeInput.value = settings.rotorMode;
    speedInput.value = String(speed);
    loadControl.hidden = settings.rotorMode !== 'follow';
    holdControl.hidden = settings.rotorMode !== 'hold';
    text('angle-output', `${settings.electricalAngle.toFixed(1)}°`);
    text('magnitude', frame.field.magnitude.toFixed(3));
    text('direction', frame.field.angle === null ? 'Undefined' : `${frame.field.angle.toFixed(1)}°`);
    values.direction.dataset.zero = String(frame.field.angle === null);
    text('bx', signed(frame.field.x));
    text('by', signed(frame.field.y));
    text('torque', signed(frame.torque));
    text('torque-direction', frame.torque > 0 ? '↺ Counterclockwise torque' : frame.torque < 0 ? '↻ Clockwise torque' : 'No turning torque');
    text('mechanical', `${frame.rotorMechanicalAngle.toFixed(1)}°`);
    text('actual-lag', frame.actualLoadAngle === null ? 'Undefined' : `${signed(frame.actualLoadAngle, 1)}°`);
    text('current-sum', signed(frame.currentSum));
    text('load-output', `${signed(settings.commandLag, 1)}°`);
    text('rotor-output', `${settings.rotorAngle.toFixed(1)}°`);
    text('play-label', paused ? 'Play' : 'Pause');
    text('play-symbol', paused ? '▶' : 'Ⅱ');
    playButton.setAttribute('aria-label', paused ? 'Play playback' : 'Pause playback');
    torqueFill.style.left = `${frame.torque < 0 ? 50 + frame.torque * 50 : 50}%`;
    torqueFill.style.width = `${Math.abs(frame.torque) * 50}%`;
    torqueFill.dataset.negative = String(frame.torque < 0);
    channels.forEach((channel, index) => {
      const current = frame.currents[index];
      channel.button.setAttribute('aria-pressed', String(settings.enabled[index]));
      channel.label.textContent = settings.enabled[index] ? 'ON' : 'OFF';
      channel.current.textContent = signed(current);
      channel.traceLabel.textContent = settings.enabled[index] ? signed(current) : 'off · 0.000';
      channel.fill.style.left = `${current < 0 ? 50 + current * 50 : 50}%`;
      channel.fill.style.width = `${Math.abs(current) * 50}%`;
      channel.poles.textContent = current > 0 ? 'S / N' : current < 0 ? 'N / S' : '— / —';
    });
    presetButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mflPreset === selectedPreset)));
    const preset = PRESETS.find((item) => item.id === selectedPreset);
    text('observation-title', preset?.name ?? 'Manual probe');
    text('observation', preset?.observation ?? observation(frame, settings));
  }

  draw();
  const loop = createLoop((_elapsed, delta) => {
    if (inactive()) return;
    if (!paused && delta > 0) settings.electricalAngle = advanceElectricalAngle(settings.electricalAngle, delta, speed);
    draw();
  }, { paused });

  function setPaused(value: boolean) {
    if (inactive()) return;
    paused = value;
    loop.setPaused(value);
    draw();
    announce(value
      ? 'Paused. Scrub the electrical angle or step forward to inspect a precise state.'
      : `Playing at a prescribed ${ELECTRICAL_SPEED * speed} electrical degrees per second. Torque does not set this speed.`);
  }

  function reset() {
    if (inactive()) return;
    settings = presetInput(PRESETS[0]);
    speed = 1;
    selectedPreset = PRESETS[0].id;
    paused = true;
    loop.setPaused(true);
    draw();
    announce('Reset and paused: 30° electrical command, all phases on, 35° commanded load angle, 1× speed.');
  }

  const events = { signal: page.signal };
  playButton.addEventListener('click', () => setPaused(!paused), events);
  query(root, '[data-mfl-reset]').addEventListener('click', reset, events);
  query(root, '[data-mfl-step]').addEventListener('click', () => {
    setPaused(true);
    settings.electricalAngle = normalizeDegrees(settings.electricalAngle + 15);
    draw();
    announce(`Stepped to ${settings.electricalAngle.toFixed(1)} electrical degrees. Playback remains paused.`);
  }, events);
  angleInput.addEventListener('input', () => {
    const value = Number(angleInput.value);
    setPaused(true);
    settings.electricalAngle = value;
    draw();
  }, events);
  loadInput.addEventListener('input', () => {
    const value = Number(loadInput.value);
    setPaused(true);
    settings.commandLag = value;
    selectedPreset = null;
    draw();
  }, events);
  rotorInput.addEventListener('input', () => {
    const value = Number(rotorInput.value);
    setPaused(true);
    settings.rotorAngle = value;
    selectedPreset = null;
    draw();
  }, events);
  modeInput.addEventListener('change', () => {
    const next = modeInput.value === 'hold' ? 'hold' : 'follow';
    const frame = sampleMotor(settings);
    setPaused(true);
    if (next === 'hold') settings.rotorAngle = frame.rotorMechanicalAngle;
    else settings.commandLag = signedDegrees(settings.electricalAngle - frame.rotorElectricalAngle);
    settings.rotorMode = next;
    selectedPreset = null;
    draw();
    announce(next === 'hold' ? 'Rotor held at its current mechanical angle. Turn the field to change torque.' : 'Rotor now follows the electrical command at the displayed lag.');
  }, events);
  speedInput.addEventListener('change', () => {
    speed = Number(speedInput.value);
    draw();
    announce(`Viewing speed ${speed}×: ${ELECTRICAL_SPEED * speed} electrical degrees per second when playing.`);
  }, events);
  channels.forEach((channel, index) => channel.button.addEventListener('click', () => {
    const next: [boolean, boolean, boolean] = [...settings.enabled];
    next[index] = !next[index];
    settings.enabled = next;
    selectedPreset = null;
    draw();
    announce(`Phase ${PHASES[index].name} ${next[index] ? 'enabled' : 'disabled; its current is zero'}. ${settings.enabled.some(Boolean) ? 'Field and torque have been recomputed.' : 'All currents, field, and torque are zero. Field direction is undefined.'}`);
  }, events));
  presetButtons.forEach((button) => button.addEventListener('click', () => {
    const preset = PRESETS.find((item) => item.id === button.dataset.mflPreset);
    if (!preset) {
      announce('Choose one of the available bench experiments. The motor settings are unchanged.');
      return;
    }
    setPaused(true);
    settings = presetInput(preset);
    selectedPreset = preset.id;
    draw();
    announce(`${preset.name} loaded and paused. ${preset.observation}`);
  }, events));
  preference.addEventListener('change', () => {
    if (inactive()) return;
    reducedNote.hidden = !preference.matches;
    setPaused(true);
    announce(preference.matches
      ? 'Reduced motion enabled. Playback is paused; you can still scrub, step, or explicitly press Play.'
      : 'Motion preference changed. Playback stays paused until you press Play.');
  }, events);
  reducedNote.hidden = !(context.reducedMotion || preference.matches);
  announce(paused
    ? 'Ready and paused. Scrub the electrical angle, step 15°, or press Play.'
    : 'Running the balanced experiment at 36 electrical degrees per second. Pause to inspect the field.');
  page.onCleanup(() => {
    disposed = true;
    loop.destroy();
    motor.destroy();
    waveforms.destroy();
  });

  return { destroy: page.destroy, reset, setPaused };
}
