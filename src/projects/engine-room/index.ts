import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs, mirrorWorkspaceStatus } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { geometryStudies, strokes } from './data';
import { DEFAULT_ANGLE, DEFAULT_GEOMETRY, advanceCycle, seekAngle, stateAt } from './engine';
import { createDrawing, travelPath, valvePath } from './scene';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'engine-room');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = context.reducedMotion || preference.matches;
  let paused = reducedMotion;
  let angle = DEFAULT_ANGLE;
  let geometry = { ...DEFAULT_GEOMETRY };
  let speed = 1;
  let loop: ReturnType<typeof createLoop> | undefined;
  let previousStroke = -1;
  page.root.setAttribute('aria-labelledby', 'er-title');
  page.root.dataset.workspace = 'true';

  page.root.innerHTML = `
    <div class="er-shell">
      <header class="er-header">
        <div class="er-identity">
          <div class="er-monogram" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 6H33V16H15Z"/><path d="M24 16 33 32 24 36"/><circle cx="24" cy="36" r="9"/><circle cx="33" cy="32" r="3"/></svg></div>
          <div><p class="er-kicker">The engine room / study 056</p><h1 id="er-title">Four-Stroke Studio</h1></div>
        </div>
        <p class="er-deck">Two turns of a crank.<br> One beautifully connected cycle.</p>
      </header>
      <nav class="er-workspace-tools" aria-label="Workbench panels">
        <button type="button" data-er-parameters>Parameters</button>
        <button type="button" data-er-readout>Readout</button>
        <button type="button" data-er-notebook>Notebook</button>
      </nav>

      <section class="er-workbench" aria-label="Four-stroke engine workbench" data-project-preview>
        <div class="er-main">
          <div class="er-engine-card">
            <div class="er-stage-heading"><span class="er-section-label">Single cylinder / cutaway</span><span class="er-live-stroke"><i aria-hidden="true"></i><span data-stroke-name>Intake</span></span></div>
            <div class="er-drawing" data-drawing></div>
            <ol class="er-parts" aria-label="Numbered parts in the cutaway"><li><b>1</b> Piston</li><li><b>2</b> Connecting rod</li><li><b>3</b> Crank</li></ol>
            <div class="er-port-legend"><span><i class="er-intake-dot" aria-hidden="true"></i>Intake / left port</span><span><i class="er-exhaust-dot" aria-hidden="true"></i>Exhaust / right port</span></div>
            <dl class="er-measures">
              <div><dt>Crank position</dt><dd><output data-angle-output></output><small> / 720&deg;</small></dd></div>
              <div><dt>Piston travel</dt><dd><output data-travel></output><small> of stroke</small></dd></div>
              <div><dt>Rod tilt</dt><dd><output data-tilt></output><small> from axis</small></dd></div>
            </dl>
            <div class="er-transport">
              <div class="er-buttons">
                <button type="button" class="er-play" data-play>Pause cycle</button>
                <button type="button" data-step="-15" aria-label="Step back 15 degrees">&minus;15&deg;</button>
                <button type="button" data-step="15" aria-label="Step forward 15 degrees">+15&deg;</button>
                <button type="button" data-reset>Reset</button>
              </div>
              <label class="er-range-label" for="er-cycle"><span>Cycle angle</span><output data-cycle-output></output></label>
              <input id="er-cycle" type="range" min="0" max="720" step="0.5" value="${angle}" aria-label="Cycle angle">
              <div class="er-cycle-scale" aria-hidden="true"><span>0&deg; / start</span><span>360&deg; / one turn</span><span>720&deg; / two turns</span></div>
              <p id="er-keyboard" class="er-help">Scrubbing pauses. Focus the cutaway: Space plays, arrows step 5&deg;, Home / End seek the ends.</p>
            </div>
          </div>

          <section class="er-timeline" aria-labelledby="er-cycle-title">
            <div class="er-chart-title"><h2 id="er-cycle-title">Follow all four strokes.</h2><span>Click a stroke to inspect</span></div>
            <div class="er-strokes" aria-label="Inspect a stroke">${strokes.map((stroke, index) => `
              <button type="button" data-stroke="${stroke.id}" data-seek="${stroke.seek}" style="--er-phase-color:${stroke.color}" aria-label="Inspect ${stroke.name.toLowerCase()}">
                <span class="er-stroke-number">0${index + 1}</span><strong>${stroke.shortName}</strong><small>${index * 180}&ndash;${(index + 1) * 180}&deg;</small>
              </button>`).join('')}
            </div>
            <div class="er-chart" aria-label="Piston travel and ideal valve timing">
              <div class="er-chart-axis"><span>Top</span><span>Bottom</span></div>
              <svg viewBox="0 0 720 128" preserveAspectRatio="none" role="img" aria-label="Exact piston travel in gold, with schematic intake and exhaust valve lift">
                ${strokes.map((stroke, index) => `<rect x="${index * 180}" y="8" width="180" height="108" fill="${stroke.color}" fill-opacity=".12"/>`).join('')}
                <path d="M0 20H720M0 106H720M180 8V116M360 8V116M540 8V116" fill="none" stroke="#c9c7bb" stroke-width="1"/>
                <path data-chart-intake d="${valvePath(0)}" fill="none" stroke="#287887" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
                <path data-chart-exhaust d="${valvePath(540)}" fill="none" stroke="#96623a" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
                <path data-chart-travel fill="none" stroke="#9c641e" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
                <line data-cursor y1="6" y2="120" stroke="#152f3b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
                <circle data-chart-dot r="4" fill="#152f3b"/>
              </svg>
            </div>
            <div class="er-chart-key"><span><i class="er-travel-key" aria-hidden="true"></i>Piston travel (exact)</span><span><i class="er-valve-key" aria-hidden="true"></i>Valve lift (schematic; up = open)</span></div>
          </section>
        </div>

        <aside class="er-inspector" aria-label="Engine controls and current stroke">
          <section class="er-now">
            <p class="er-kicker">Now inside the cylinder</p>
            <div class="er-stroke-heading"><span data-stroke-count>01</span><h2 data-stroke-title>Intake</h2></div>
            <p class="er-action" data-action></p>
            <p class="er-explanation" data-explanation></p>
            <div class="er-valves">
              <div><span>Intake valve</span><strong data-intake-state></strong><div class="er-lift-track"><i data-intake-meter></i></div></div>
              <div><span>Exhaust valve</span><strong data-exhaust-state></strong><div class="er-lift-track er-exhaust-track"><i data-exhaust-meter></i></div></div>
            </div>
            <p class="er-note">Ideal valve schedule: no overlap. Bars show relative lift, not airflow.</p>
            <p class="er-direction" data-direction></p>
          </section>

          <section class="er-settings" aria-labelledby="er-geometry-title">
            <p class="er-kicker">Change the geometry</p><h2 id="er-geometry-title">Longer rod. Same stroke.</h2>
            <label class="er-range-label" for="er-ratio"><span>Rod / crank ratio</span><output data-ratio-output>3.40 : 1</output></label>
            <input id="er-ratio" type="range" min="2" max="5" step="0.05" value="${geometry.rod}" aria-label="Rod / crank ratio">
            <div class="er-ratio-options">${geometryStudies.map((study) => `<button type="button" data-ratio="${study.ratio}">${study.label}</button>`).join('')}</div>
            <p class="er-note">Crank radius <strong>r = 1 unit</strong>. The rod stays longer than r. The cylinder stays put; the crank center moves to fit the new rod.</p>
            <dl class="er-geometry-readout"><div><dt>Rod length</dt><dd data-rod-length>3.40 r</dd></div><div><dt>Full piston stroke</dt><dd>2.00 r</dd></div></dl>
            <div class="er-speed-label"><label for="er-speed">Playback speed</label><select id="er-speed"><option value="0.25">0.25x / slow study</option><option value="0.5">0.5x</option><option value="1" selected>1x / 12-second cycle</option><option value="2">2x</option></select></div>
            <div class="er-toggles"><label><input type="checkbox" data-construction checked> Construction lines</label><label><input type="checkbox" data-flows checked> Gas-flow cues</label></div>
            <p class="er-motion-note" data-motion-note${reducedMotion ? '' : ' hidden'}>Reduced motion is on. Start playback only when you want it.</p>
          </section>
        </aside>
      </section>

      <div class="er-feedback"><p role="status" data-feedback>${reducedMotion ? 'A still at 72 degrees. Scrub the cycle or choose a stroke.' : 'Watch the intake, then follow the same piston through two full crank turns.'}</p><span>Original geometry / calculated here</span></div>

      <section class="er-notebook" aria-labelledby="er-notes-title">
        <div class="er-notebook-heading"><p class="er-kicker">Read the mechanism</p><h2 id="er-notes-title">A simple rhythm.<br>A precise constraint.</h2></div>
        <div class="er-notes">
          <article><span class="er-note-index">A / Geometry</span><h3>The rod never changes length.</h3><p>The crank pin runs around a circle. The wrist pin can only move on the cylinder axis. Their separation is always l, so the piston cannot simply follow a sine wave.</p><p class="er-equation"><code>d(&theta;) = r + l &minus; r cos &theta;<br>&minus; &radic;(l&sup2; &minus; r&sup2; sin&sup2; &theta;)</code></p><p>d is distance down from top dead center. &theta; is measured clockwise from the top. The drawing and gold curve use this relation directly.</p></article>
          <article><span class="er-note-index">B / Timing</span><h3>A turn is only half the story.</h3><p>The piston makes the same trip twice, but the valves do different work. Intake and power move down; compression and exhaust move up. A valve-timing shaft would turn once per two crank revolutions.</p><p>In this teaching schedule, intake opens only during 0&ndash;180&deg;; exhaust only during 540&ndash;720&deg;. Their lift follows sin&sup2; of the local stroke angle. Both are shut exactly at the boundaries.</p></article>
          <article><span class="er-note-index">C / Model limits</span><h3>Color is not pressure.</h3><p>Warmth, flow arrows, and the heat cue explain the sequence. They do not calculate combustion, thermodynamics, pressure, friction, torque, or valve-train dynamics.</p><p>This is a normalized educational model, not a production engine specification, manufacturing guide, fuel-tuning recommendation, or safety-critical design tool.</p></article>
        </div>
      </section>
      <footer class="er-footer"><span>FOUR-STROKE STUDIO / EVERY PART CONNECTED</span><a href="#er-title">Back to the cutaway</a></footer>
    </div>`;

  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const inspector = get<HTMLElement>('.er-inspector');
  const settings = get<HTMLElement>('.er-settings');
  const readout = document.createElement('div');
  readout.className = 'er-readout';
  const tabsHost = document.createElement('div');
  const panels = document.createElement('div');
  panels.className = 'er-dock-panels';
  const settingsPanel = document.createElement('div');
  settingsPanel.append(settings);
  get('.er-engine-card').insertBefore(get('.er-strokes'), get('.er-transport'));
  readout.append(get('.er-now'), get('.er-parts'), get('.er-port-legend'), get('.er-measures'), get('.er-timeline'), get('.er-feedback'));
  panels.append(settingsPanel, readout);
  inspector.append(tabsHost, panels);
  const tabs = createWorkspaceTabs(page, {
    id: 'er-instruments', label: 'Engine instruments', host: tabsHost,
    panes: [
      { id: 'parameters', label: 'Parameters', panel: settingsPanel },
      { id: 'readout', label: 'Readout', panel: readout },
    ],
  });
  const notebook = get<HTMLElement>('.er-notebook');
  const notes = document.createElement('div');
  notes.className = 'er-operating-notes';
  notes.append(get('.er-deck'), get('.er-help'), get('.er-cycle-scale'));
  for (const note of settings.querySelectorAll('.er-note, .er-geometry-readout')) notes.append(note);
  createWorkspaceDialog(page, {
    id: 'er-notebook-dialog', title: 'Engine notebook',
    content: [notes, notebook, get('.er-footer')], triggers: [get('[data-er-notebook]')],
  });
  const dock = createWorkspaceDialog(page, {
    id: 'er-instruments-dialog', title: 'Engine instruments', content: [inspector],
  });
  const compact = window.matchMedia('(max-width: 700px), (max-height: 540px)');
  const triggers = [get<HTMLButtonElement>('[data-er-parameters]'), get<HTMLButtonElement>('[data-er-readout]')];
  function placeInspector() {
    const focused = inspector.contains(document.activeElement);
    dock.close();
    (compact.matches ? query(dock.dialog, '.workspace-dialog-content') : get('.er-workbench')).append(inspector);
    for (const trigger of triggers) {
      trigger.setAttribute('aria-controls', compact.matches ? dock.dialog.id : panels.id);
      if (compact.matches) trigger.setAttribute('aria-haspopup', 'dialog');
      else trigger.removeAttribute('aria-haspopup');
    }
    if (focused) triggers[0].focus({ preventScroll: true });
  }
  panels.id = 'er-instrument-panels';
  triggers.forEach((trigger, index) => trigger.addEventListener('click', () => {
    tabs.select(index === 0 ? 'parameters' : 'readout');
    if (compact.matches) dock.open();
    else tabsHost.querySelector<HTMLButtonElement>('[aria-selected="true"]')!.focus({ preventScroll: true });
  }, { signal: page.signal }));
  compact.addEventListener('change', placeInspector, { signal: page.signal });
  placeInspector();
  mirrorWorkspaceStatus(page, get('[data-feedback]'));
  get('.er-footer a').addEventListener('click', () => {
    get<HTMLDialogElement>('#er-notebook-dialog').close();
    get<SVGSVGElement>('.er-scene').focus();
  }, { signal: page.signal });

  page.root.querySelectorAll('output').forEach((output) => output.setAttribute('aria-live', 'off'));
  const drawing = createDrawing(query<HTMLElement>(page.root, '[data-drawing]'));
  page.onCleanup(drawing.destroy);
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const scrubber = query<HTMLInputElement>(page.root, '#er-cycle');
  const ratio = query<HTMLInputElement>(page.root, '#er-ratio');
  const speedControl = query<HTMLSelectElement>(page.root, '#er-speed');
  const construction = query<HTMLInputElement>(page.root, 'input[data-construction]');
  const flows = query<HTMLInputElement>(page.root, '[data-flows]');
  const chartTravel = query<SVGPathElement>(page.root, '[data-chart-travel]');
  const cursor = query<SVGLineElement>(page.root, '[data-cursor]');
  const chartDot = query<SVGCircleElement>(page.root, '[data-chart-dot]');
  const outputs = {
    angle: query<HTMLOutputElement>(page.root, '[data-angle-output]'),
    cycle: query<HTMLOutputElement>(page.root, '[data-cycle-output]'),
    travel: query<HTMLOutputElement>(page.root, '[data-travel]'),
    tilt: query<HTMLOutputElement>(page.root, '[data-tilt]'),
    ratio: query<HTMLOutputElement>(page.root, '[data-ratio-output]'),
  };
  const strokeButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-seek]'));
  const ratioButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-ratio]'));
  const elements = {
    strokeName: query<HTMLElement>(page.root, '[data-stroke-name]'),
    strokeTitle: query<HTMLElement>(page.root, '[data-stroke-title]'),
    strokeCount: query<HTMLElement>(page.root, '[data-stroke-count]'),
    action: query<HTMLElement>(page.root, '[data-action]'),
    explanation: query<HTMLElement>(page.root, '[data-explanation]'),
    intakeState: query<HTMLElement>(page.root, '[data-intake-state]'),
    exhaustState: query<HTMLElement>(page.root, '[data-exhaust-state]'),
    intakeMeter: query<HTMLElement>(page.root, '[data-intake-meter]'),
    exhaustMeter: query<HTMLElement>(page.root, '[data-exhaust-meter]'),
    direction: query<HTMLElement>(page.root, '[data-direction]'),
    feedback: query<HTMLElement>(page.root, '[data-feedback]'),
    rodLength: query<HTMLElement>(page.root, '[data-rod-length]'),
    motionNote: query<HTMLElement>(page.root, '[data-motion-note]'),
  };

  function render() {
    if (page.signal.aborted) return;
    const state = stateAt(angle, geometry);
    page.root.dataset.angle = angle.toFixed(3);
    page.root.dataset.stroke = state.stroke;
    page.root.dataset.ratio = geometry.rod.toFixed(2);
    page.root.dataset.speed = String(speed);
    page.root.dataset.reducedMotion = String(reducedMotion);
    scrubber.value = String(angle);
    scrubber.setAttribute('aria-valuetext', `${angle.toFixed(1)} degrees, ${strokes[state.strokeIndex].name}`);
    outputs.angle.value = `${angle.toFixed(1)}\u00b0`;
    outputs.cycle.value = `${angle.toFixed(1)}\u00b0`;
    outputs.travel.value = `${(state.pose.strokeFraction * 100).toFixed(1)}%`;
    outputs.tilt.value = `${state.pose.rodAngle.toFixed(1)}\u00b0`;
    elements.intakeState.textContent = state.intakeLift > 0 ? 'Open' : 'Closed';
    elements.exhaustState.textContent = state.exhaustLift > 0 ? 'Open' : 'Closed';
    elements.intakeMeter.style.width = `${state.intakeLift * 100}%`;
    elements.exhaustMeter.style.width = `${state.exhaustLift * 100}%`;
    elements.direction.textContent = state.complete ? 'Back at the top. One cycle complete.' :
      Math.abs(state.pose.travelPerRadian) < 1e-9 ? 'Dead center: the piston is changing direction.' :
      state.pose.travelPerRadian > 0 ? 'Piston moving down / cylinder volume grows' : 'Piston moving up / cylinder volume shrinks';
    if (state.strokeIndex !== previousStroke) {
      const stroke = strokes[state.strokeIndex];
      previousStroke = state.strokeIndex;
      page.root.style.setProperty('--er-stroke', stroke.color);
      elements.strokeName.textContent = stroke.name;
      elements.strokeTitle.textContent = stroke.name;
      elements.strokeCount.textContent = `0${state.strokeIndex + 1}`;
      elements.action.textContent = stroke.action;
      elements.explanation.textContent = stroke.detail;
      for (const button of strokeButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.stroke === state.stroke));
      }
    }
    cursor.setAttribute('x1', String(angle));
    cursor.setAttribute('x2', String(angle));
    chartDot.setAttribute('cx', String(angle));
    chartDot.setAttribute('cy', String(20 + state.pose.strokeFraction * 86));
    drawing.draw(state, geometry, construction.checked, flows.checked);
  }

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value;
    if (!paused && angle === 720) angle = 0;
    play.textContent = paused ? 'Play cycle' : 'Pause cycle';
    play.setAttribute('aria-pressed', String(!paused));
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    loop?.setPaused(paused);
    render();
  }

  function seek(value: number) {
    if (page.signal.aborted) return;
    setPaused(true);
    angle = seekAngle(value);
    render();
  }

  function updateGeometry() {
    ratio.value = String(geometry.rod);
    outputs.ratio.value = `${geometry.rod.toFixed(2)} : 1`;
    elements.rodLength.textContent = `${geometry.rod.toFixed(2)} r`;
    for (const button of ratioButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.ratio) === geometry.rod));
    chartTravel.setAttribute('d', travelPath(geometry));
    render();
  }

  function reset() {
    if (page.signal.aborted) return;
    setPaused(true);
    angle = 0;
    geometry = { ...DEFAULT_GEOMETRY };
    speed = 1;
    speedControl.value = '1';
    construction.checked = true;
    flows.checked = true;
    updateGeometry();
    elements.feedback.textContent = 'Reset to top dead center: 0 degrees, middle-length rod, playback paused.';
  }

  const eventOptions = { signal: page.signal };
  play.addEventListener('click', () => setPaused(!paused), eventOptions);
  query<HTMLButtonElement>(page.root, '[data-reset]').addEventListener('click', reset, eventOptions);
  scrubber.addEventListener('input', () => seek(Number(scrubber.value)), eventOptions);
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    button.addEventListener('click', () => seek(angle + Number(button.dataset.step)), eventOptions);
  }
  for (const button of strokeButtons) {
    button.addEventListener('click', () => {
      seek(Number(button.dataset.seek));
      elements.feedback.textContent = `${strokes[Math.floor(angle / 180)].name}: inspect the valve state and the piston direction.`;
    }, eventOptions);
  }
  ratio.addEventListener('input', () => {
    setPaused(true);
    geometry = { radius: 1, rod: Number(ratio.value) };
    updateGeometry();
    elements.feedback.textContent = 'Rod length changed. The stroke remains exactly twice the crank radius.';
  }, eventOptions);
  for (const button of ratioButtons) {
    button.addEventListener('click', () => {
      setPaused(true);
      geometry = { radius: 1, rod: Number(button.dataset.ratio) };
      updateGeometry();
      elements.feedback.textContent = geometryStudies.find((study) => study.ratio === geometry.rod)!.note;
    }, eventOptions);
  }
  speedControl.addEventListener('change', () => {
    speed = Number(speedControl.value);
    render();
    elements.feedback.textContent = `Playback set to ${speed}x. This is an inspection clock, not an engine operating speed.`;
  }, eventOptions);
  construction.addEventListener('change', render, eventOptions);
  flows.addEventListener('change', render, eventOptions);
  drawing.svg.addEventListener('keydown', (event) => {
    if (event.target !== drawing.svg || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      setPaused(!paused);
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 15 : 5;
      seek(event.key === 'Home' ? 0 : event.key === 'End' ? 720 : angle + (event.key === 'ArrowRight' ? step : -step));
    }
  }, eventOptions);
  preference.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    elements.motionNote.hidden = !reducedMotion;
    if (reducedMotion) {
      setPaused(true);
      elements.feedback.textContent = 'Reduced motion enabled. The mechanism is paused; all controls still work.';
    } else render();
  }, eventOptions);

  updateGeometry();
  setPaused(paused);
  loop = createLoop((_elapsed, delta) => {
    if (!paused) angle = advanceCycle(angle, delta, speed);
    render();
  }, { paused });
  page.onCleanup(loop.destroy);
  return { destroy: page.destroy, setPaused, reset };
}
