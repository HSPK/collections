import './style.css';
import { observeSize } from '../../core/canvas';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { linkFields, methodNotes, presets } from './data';
import {
  TAU, advanceInput, chordDeviation, classifyLinkage, degrees, lengthIssue,
  radians, sampleTrace, sampleWindow, solveFourBar,
} from './engine';
import type { AssemblyBranch, CouplerTrace, LinkId, TraceSample } from './engine';
import { createScene } from './scene';

const format = (value: number, precision = 2): string => !Number.isFinite(value) ? '—'
  : Math.abs(value) >= 1e5 ? value.toExponential(2)
    : (Math.abs(value) < 10 ** -precision / 2 ? 0 : value).toFixed(precision);

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'linkage-atlas');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = context.reducedMotion || preference.matches;
  let preset = presets[0];
  let lengths = { ...preset.lengths };
  let coupler = { ...preset.coupler };
  let branch: AssemblyBranch = preset.branch;
  let angle = radians(preset.angle);
  let speed = 1;
  let paused = reduced;
  let disposed = false;
  let frame = 0;
  let previousTime: number | null = null;
  let activePointer: number | null = null;
  let width = 0;
  let height = 0;
  let playbackNotice = '';
  let showConstruction = false;
  let showOther = false;
  let trace = sampleTrace(lengths, branch, coupler);
  let alternate: CouplerTrace | null = null;
  let highlight: TraceSample[] = [];
  let solution = solveFourBar(lengths, angle, branch, coupler);
  let stopObserving = () => {};

  page.root.setAttribute('aria-labelledby', 'linkage-title');
  page.root.dataset.workspace = 'true';
  page.root.innerHTML = `
    <div class="la-sheet">
      <header class="la-header">
        <div>
          <p class="la-kicker"><span class="la-brand-mark" aria-hidden="true">⌁</span> Field notes on moving things</p>
          <h1 id="linkage-title">Linkage <em>Atlas</em></h1>
          <p class="la-deck">Four bars. One wandering point. A little geometry in motion.</p>
        </div>
        <div class="la-edition" aria-label="Study 059, kinematics">
          <span>MECHANICAL STUDIES</span><strong>059<span> / ∞</span></strong><span>POSITION, NOT FORCE</span>
        </div>
      </header>
      <nav class="la-workspace-tools" aria-label="Workbench panels">
        <button type="button" data-la-parameters>Parameters</button>
        <button type="button" data-la-observations>Observations</button>
        <button type="button" data-la-method>Method</button>
      </nav>

      <section class="la-workbench" data-project-preview aria-label="Four-bar coupler-path workbench">
        <div class="la-drawing">
          <div class="la-drawing-heading">
            <div><span class="la-figure">FIG. <span data-figure>01</span></span><strong data-drawing-name>The wandering loop</strong></div>
            <span class="la-branch-stamp" data-branch-stamp>+ ASSEMBLY</span>
          </div>
          <div class="la-plot" data-plot>
            <div class="la-plot-message" data-plot-message hidden>
              <strong>No current C or P</strong><p data-plot-explanation></p>
            </div>
            <span class="la-plot-note" data-plot-note>FULL REACHABLE TRACE</span>
          </div>
          <div class="la-legend" aria-label="Link and path legend">
            <span><i class="la-key la-key-ground" aria-hidden="true"></i>d · ground</span>
            <span><i class="la-key la-key-input" aria-hidden="true"></i>a · input</span>
            <span><i class="la-key la-key-coupler" aria-hidden="true"></i>b · coupler</span>
            <span><i class="la-key la-key-output" aria-hidden="true"></i>c · output</span>
            <span class="la-path-legend"><i class="la-key la-key-path" aria-hidden="true"></i>P · path</span>
            <span data-other-legend hidden><i class="la-key la-key-other" aria-hidden="true"></i>other branch</span>
          </div>
          <div class="la-state" data-state>
            <span class="la-status" role="status"><i aria-hidden="true"></i><strong data-status>Closed chain</strong></span>
            <span data-status-detail></span>
          </div>
          <div class="la-transport">
            <div class="la-play-buttons">
              <button class="la-primary" type="button" data-play aria-label="Play mechanism">Play</button>
              <button type="button" data-back aria-label="Step back 1 degree">−1°</button>
              <button type="button" data-forward aria-label="Step forward 1 degree">+1°</button>
              <button class="la-reset" type="button" data-reset>Reset study</button>
            </div>
            <label class="la-range-heading" for="linkage-angle"><span>Input angle <b>θ</b></span><output data-angle-output>55.0°</output></label>
            <div class="la-reach-map" data-reach-map aria-hidden="true"></div>
            <input id="linkage-angle" type="range" min="0" max="360" step="0.1" value="55" aria-label="Input angle">
            <div class="la-range-ends" aria-hidden="true"><span>0°</span><span>180°</span><span>360°</span></div>
            <div class="la-transport-bottom">
              <div class="la-speed"><label for="linkage-speed">Speed</label>
                <select id="linkage-speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
              </div>
              <p data-playback-note>One input turn in 12 seconds at 1×.</p>
            </div>
            <p class="la-help" id="linkage-drag-help">Drag pin B, or use the angle slider. Scrubbing pauses. The ±1° buttons step in either direction.</p>
            <p class="la-motion-note" data-motion-note hidden>Reduced motion is on. The study starts still; Play is always your choice.</p>
          </div>
          <dl class="la-readings">
            <div><dt>Tracer P · x, y</dt><dd data-point>—</dd></div>
            <div><dt>Separation |BD|</dt><dd data-distance>—</dd></div>
            <div><dt>Output angle φ</dt><dd data-output-angle>—</dd></div>
            <div><dt>Closure residual</dt><dd data-residual>—</dd></div>
          </dl>
        </div>

        <aside class="la-inspector" aria-label="Linkage controls">
          <div class="la-inspector-heading"><span class="la-kicker">The study set</span><span>01—05</span></div>
          <div class="la-field"><label for="linkage-preset">Choose a study</label>
            <select id="linkage-preset">${presets.map((item) => `<option value="${item.id}">${item.number} / ${escapeMarkup(item.name)}</option>`).join('')}</select>
          </div>
          <p class="la-family-tag" data-family-tag>CRANK–ROCKER</p>
          <div class="la-section-heading"><span>01</span><h2>Link geometry</h2><small>units</small></div>
          <div class="la-lengths">
            ${linkFields.map((field) => `
              <label class="la-length-field" for="linkage-${field.key}">
                <span class="la-link-symbol la-symbol-${field.key}">${field.key}</span>
                <span>${field.name}<small>${field.joints} · ${field.hint}</small></span>
                <input id="linkage-${field.key}" data-length="${field.key}" type="number" min="0" step="0.1"
                  value="${lengths[field.key]}" inputmode="decimal" aria-label="${field.name} length ${field.key}">
              </label>`).join('')}
          </div>
          <p class="la-help">Positive lengths only. Invalid entries clear the current pose.</p>
          <div class="la-field la-branch-field"><label for="linkage-branch">Assembly branch</label>
            <select id="linkage-branch"><option value="plus">+ · left of B → D</option><option value="minus">− · right of B → D</option></select>
          </div>
          <div class="la-classification">
            <p class="la-kicker" data-criterion>Grashof</p>
            <h3 data-classification>Crank–rocker</h3>
            <p class="la-formula" data-grashof-sums></p>
            <p data-classification-note></p>
          </div>
          <section class="la-coupler-controls" aria-labelledby="linkage-tracer-title">
            <div class="la-section-heading"><span>02</span><h2 id="linkage-tracer-title">Place the tracer</h2><small>P</small></div>
            <label class="la-range-heading" for="linkage-fraction"><span>Coupler fraction <b>f</b></span><output data-fraction-output>0.55</output></label>
            <input id="linkage-fraction" type="range" min="-0.5" max="1.5" step="0.01" value="0.55" aria-label="Coupler fraction">
            <div class="la-range-ends"><span>f = 0 at B</span><span>f = 1 at C</span></div>
            <label class="la-range-heading la-offset-heading" for="linkage-offset"><span>Normal offset <b>o</b></span><output data-offset-output>+0.85</output></label>
            <input id="linkage-offset" type="range" min="-3" max="3" step="0.01" value="0.85" aria-label="Normal offset">
            <p class="la-help">Offset in model units, to the left (+) or right (−) of B → C.</p>
          </section>
          <div class="la-toggles">
            <label><input type="checkbox" data-circles> Closure circles</label>
            <label><input type="checkbox" data-other> Other assembly trace</label>
          </div>
        </aside>
      </section>

      <section class="la-notebook" aria-label="Study observations">
        <article class="la-observation">
          <p class="la-kicker">From the field notebook</p>
          <h2 data-study-heading>The wandering loop</h2>
          <p data-observation></p>
          <p class="la-try"><strong>TRY THIS ↗</strong><span data-experiment></span></p>
          <p class="la-highlight-note" data-highlight-note hidden></p>
          <p class="la-custom-note" data-custom-note hidden>Edited study: these notes describe the original proportions. The live classification and trace use your values. Reset study restores the original.</p>
        </article>
        <aside class="la-reach-note">
          <p class="la-kicker">The allowed angles</p>
          <h2 data-reach-title>360° of closure</h2>
          <p class="la-intervals" data-reach-ranges></p>
          <p>The sage strip above the angle slider marks reachable arcs. Blank regions are genuinely missing poses, not missing ink.</p>
          <p class="la-closure-rule">|b − c| ≤ |BD| ≤ b + c</p>
          <p class="la-help">Touching circles give a dead center. Equal circles with the same center give infinitely many solutions, not a unique C.</p>
        </aside>
      </section>

      <section class="la-method" aria-labelledby="linkage-method-title">
        <header>
          <p class="la-kicker">Construction, not simulation</p>
          <h2 id="linkage-method-title">How four bars write a curve.</h2>
          <p>This is pure planar kinematics: ideal pins, rigid links, and no thickness or collisions. It solves positions—not forces, torque, friction, inertia, or the safety of a real machine.</p>
        </header>
        <div class="la-method-grid">
          ${methodNotes.map((note) => `<article><span class="la-method-number">${note.number}</span><h3>${escapeMarkup(note.title)}</h3><p>${escapeMarkup(note.text)}</p></article>`).join('')}
        </div>
        <details class="la-grashof-notes">
          <summary>Reading Grashof without forgetting the ground link</summary>
          <p>Sort the lengths: s is shortest, l longest, and p and q are the middle pair. When s + l &lt; p + q, the shortest link can rotate relative to its neighbors. Which link is fixed determines the mechanism below.</p>
          <table>
            <caption>Strict Grashof inversions, with A–D fixed</caption>
            <thead><tr><th>Shortest link</th><th>Input a</th><th>Output c</th></tr></thead>
            <tbody>
              <tr><th>d · ground</th><td>Full turn</td><td>Full turn</td></tr>
              <tr><th>a · input</th><td>Full turn</td><td>Rocks</td></tr>
              <tr><th>c · output</th><td>Rocks</td><td>Full turn</td></tr>
              <tr><th>b · coupler</th><td>Rocks</td><td>Rocks</td></tr>
            </tbody>
          </table>
          <p>For s + l &gt; p + q, both grounded links rock. Equality is a separate change-point case: branches meet at collinear configurations. A longest link equal to the other three combined is more degenerate still—only isolated collinear closure is possible.</p>
        </details>
      </section>
      <footer class="la-footer"><span>LINKAGE ATLAS / 059</span><span>A notebook of possibilities. Not a machine specification.</span></footer>
    </div>`;

  page.root.querySelectorAll('output').forEach((output) => output.setAttribute('aria-live', 'off'));
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const inspector = get<HTMLElement>('.la-inspector');
  const geometryPanel = document.createElement('div');
  const tracerPanel = document.createElement('div');
  const readoutPanel = document.createElement('div');
  tracerPanel.append(get('.la-coupler-controls'), get('.la-toggles'));
  readoutPanel.append(get('.la-classification'), get('.la-readings'), get('.la-legend'), get('[data-status-detail]'));
  geometryPanel.append(...inspector.childNodes);
  const tabsHost = document.createElement('div');
  const panels = document.createElement('div');
  panels.id = 'la-instrument-panels';
  panels.className = 'la-dock-panels';
  panels.append(geometryPanel, tracerPanel, readoutPanel);
  inspector.append(tabsHost, panels);
  const tabs = createWorkspaceTabs(page, {
    id: 'la-instruments', label: 'Linkage instruments', host: tabsHost,
    panes: [
      { id: 'geometry', label: 'Geometry', panel: geometryPanel },
      { id: 'tracer', label: 'Tracer', panel: tracerPanel },
      { id: 'readout', label: 'Readout', panel: readoutPanel },
    ],
  });
  const guide = document.createElement('div');
  guide.className = 'la-operating-notes';
  guide.append(get('.la-deck'), get('.la-edition'), get('.la-transport > .la-help'), get('.la-transport > .la-range-ends'));
  createWorkspaceDialog(page, {
    id: 'la-observations-dialog', title: 'Study observations',
    content: [get('.la-notebook')], triggers: [get('[data-la-observations]')],
  });
  createWorkspaceDialog(page, {
    id: 'la-method-dialog', title: 'Construction and method',
    content: [guide, get('.la-method'), get('.la-footer')], triggers: [get('[data-la-method]')],
  });
  const dock = createWorkspaceDialog(page, {
    id: 'la-instruments-dialog', title: 'Linkage instruments', content: [inspector],
  });
  const compact = window.matchMedia('(max-width: 700px), (max-height: 540px)');
  const parametersTrigger = get<HTMLButtonElement>('[data-la-parameters]');
  function placeInspector() {
    const focused = inspector.contains(document.activeElement);
    dock.close();
    (compact.matches ? query(dock.dialog, '.workspace-dialog-content') : get('.la-workbench')).append(inspector);
    parametersTrigger.setAttribute('aria-controls', compact.matches ? dock.dialog.id : panels.id);
    if (compact.matches) parametersTrigger.setAttribute('aria-haspopup', 'dialog');
    else parametersTrigger.removeAttribute('aria-haspopup');
    if (focused) parametersTrigger.focus({ preventScroll: true });
  }
  parametersTrigger.addEventListener('click', () => {
    tabs.select('geometry');
    if (compact.matches) dock.open();
    else tabsHost.querySelector<HTMLButtonElement>('[aria-selected="true"]')!.focus({ preventScroll: true });
  }, { signal: page.signal });
  compact.addEventListener('change', placeInspector, { signal: page.signal });
  placeInspector();
  const plot = get<HTMLElement>('[data-plot]');
  const scene = createScene(plot);
  const play = get<HTMLButtonElement>('[data-play]');
  const presetInput = get<HTMLSelectElement>('#linkage-preset');
  const branchInput = get<HTMLSelectElement>('#linkage-branch');
  const angleInput = get<HTMLInputElement>('#linkage-angle');
  const fractionInput = get<HTMLInputElement>('#linkage-fraction');
  const offsetInput = get<HTMLInputElement>('#linkage-offset');
  const speedInput = get<HTMLSelectElement>('#linkage-speed');
  const circlesInput = get<HTMLInputElement>('[data-circles]');
  const otherInput = get<HTMLInputElement>('[data-other]');
  const lengthInputs = new Map<LinkId, HTMLInputElement>(
    linkFields.map(({ key }) => [key, get<HTMLInputElement>(`[data-length="${key}"]`)]),
  );
  const status = get<HTMLElement>('[data-status]');
  const statusDetail = get<HTMLElement>('[data-status-detail]');
  const plotMessage = get<HTMLElement>('[data-plot-message]');
  const pointOutput = get<HTMLElement>('[data-point]');
  const distanceOutput = get<HTMLElement>('[data-distance]');
  const outputAngle = get<HTMLElement>('[data-output-angle]');
  const residualOutput = get<HTMLElement>('[data-residual]');
  const angleOutput = get<HTMLOutputElement>('[data-angle-output]');
  const playbackNote = get<HTMLElement>('[data-playback-note]');
  const events = { signal: page.signal };

  function text(element: Element, value: string) {
    if (element.textContent !== value) element.textContent = value;
  }

  function draw() {
    scene.draw({ lengths, coupler, trace, alternate, highlight, angle, solution, construction: showConstruction }, width, height);
  }

  function pauseClock() {
    paused = true;
    previousTime = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function refresh() {
    if (disposed) return;
    solution = solveFourBar(lengths, angle, branch, coupler);
    if (!solution.pose) pauseClock();
    page.root.dataset.angle = degrees(angle).toFixed(6);
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    page.root.dataset.branch = branch;
    page.root.dataset.status = solution.status;
    page.root.dataset.speed = String(speed);
    page.root.dataset.preset = preset.id;
    play.disabled = solution.pose === null;
    text(play, paused ? 'Play' : 'Pause');
    play.setAttribute('aria-label', paused ? 'Play mechanism' : 'Pause mechanism');
    play.setAttribute('aria-pressed', String(!paused));
    angleInput.value = String(degrees(angle));
    text(angleOutput, `${format(degrees(angle), 1)}°`);
    text(status, {
      closed: 'Closed chain', tangent: 'Dead center', unreachable: 'Unreachable angle',
      coincident: 'Nonunique closure', impossible: 'No possible closure', invalid: 'Invalid geometry',
    }[solution.status]);
    text(statusDetail, solution.status === 'closed'
      ? `${branch === 'plus' ? '+' : '−'} assembly · two distinct circle intersections`
      : solution.status === 'tangent' ? 'One intersection · the two assemblies meet' : solution.message);
    get<HTMLElement>('[data-state]').dataset.status = solution.status;
    text(get('[data-branch-stamp]'), `${branch === 'plus' ? '+' : '−'} ASSEMBLY`);
    plotMessage.hidden = solution.pose !== null;
    text(get('[data-plot-explanation]'), solution.message);
    const pose = solution.pose;
    text(pointOutput, pose ? `${format(pose.P.x)}, ${format(pose.P.y)}` : '—, —');
    const separation = !lengthIssue(lengths)
      ? Math.hypot(lengths.d - lengths.a * Math.cos(angle), lengths.a * Math.sin(angle)) : NaN;
    text(distanceOutput, format(separation, 3));
    text(outputAngle, pose ? `${format(degrees(pose.outputAngle), 1)}°` : '—');
    text(residualOutput, pose ? pose.closureError < 1e-12 ? '< 10⁻¹²' : pose.closureError.toExponential(1) : '—');
    text(playbackNote, playbackNotice || 'One input turn in 12 seconds at 1×.');
    get<HTMLElement>('[data-motion-note]').hidden = !reduced;
    draw();
  }

  function isOriginal() {
    return linkFields.every(({ key }) => lengths[key] === preset.lengths[key])
      && coupler.fraction === preset.coupler.fraction && coupler.offset === preset.coupler.offset
      && branch === preset.branch;
  }

  function rebuild() {
    if (disposed) return;
    trace = sampleTrace(lengths, branch, coupler);
    alternate = showOther ? sampleTrace(lengths, branch === 'plus' ? 'minus' : 'plus', coupler) : null;
    const original = isOriginal();
    highlight = original && preset.highlight
      ? sampleWindow(lengths, branch, coupler, radians(preset.highlight.start), radians(preset.highlight.end)) : [];
    const classification = classifyLinkage(lengths);
    const issue = lengthIssue(lengths);
    for (const [key, input] of lengthInputs) {
      input.setAttribute('aria-invalid', String(!Number.isFinite(lengths[key]) || lengths[key] <= 0
        || (issue !== null && linkFields.every((field) => lengths[field.key] > 0))));
    }
    page.root.dataset.custom = String(!original);
    text(get('[data-drawing-name]'), `${preset.name}${original ? '' : ' / edited'}`);
    text(get('[data-family-tag]'), original ? preset.family : 'Edited proportions · see classification below');
    text(get('[data-figure]'), preset.number);
    text(get('[data-classification]'), classification.title);
    text(get('[data-criterion]'), {
      grashof: 'Strict Grashof', 'non-grashof': 'Non-Grashof', equality: 'Grashof equality',
      degenerate: 'A limiting case', invalid: 'Closure check',
    }[classification.criterion]);
    const relation = classification.criterion === 'grashof' ? '<'
      : classification.criterion === 'equality' ? '=' : classification.criterion === 'non-grashof' ? '>' : '·';
    text(get('[data-grashof-sums]'), classification.shortLong === null || classification.middleSum === null ? 's + l  /  p + q'
      : `s + l = ${format(classification.shortLong)} ${relation} ${format(classification.middleSum)} = p + q`);
    text(get('[data-classification-note]'), classification.explanation);
    text(get('[data-fraction-output]'), format(coupler.fraction));
    text(get('[data-offset-output]'), `${coupler.offset >= 0 ? '+' : ''}${format(coupler.offset)}`);
    text(get('[data-study-heading]'), preset.name);
    text(get('[data-observation]'), preset.observation);
    text(get('[data-experiment]'), preset.experiment);
    get<HTMLElement>('[data-custom-note]').hidden = original;
    get<HTMLElement>('[data-other-legend]').hidden = !showOther;
    const measure = chordDeviation(highlight);
    const highlightNote = get<HTMLElement>('[data-highlight-note]');
    highlightNote.hidden = measure === null;
    if (measure && preset.highlight) {
      text(highlightNote, `BOLD SEGMENT / ${preset.highlight.start}°–${preset.highlight.end}°. Maximum departure from its endpoint chord: ${format(measure.deviation, 3)} units over a ${format(measure.span, 3)}-unit span (${format(measure.deviation / measure.span * 100, 1)}%). Approximate, not exact.`);
    }
    text(get('[data-plot-note]'), highlight.length ? 'BOLD = APPROXIMATE STRAIGHT SEGMENT' : 'FULL REACHABLE TRACE · NOT A TRAIL');
    const reachable = trace.reachableFraction * 360;
    text(get('[data-reach-title]'), trace.segments.length ? `${format(reachable, reachable >= 359.99 ? 0 : 1)}° of closure` : 'No closed poses');
    text(get('[data-reach-ranges]'), trace.intervals.length
      ? trace.intervals.map((interval) => `${format(degrees(interval.start), 1)}°–${format(degrees(interval.end), 1)}°`).join('  /  ')
        + (classification.kind === 'change-point' ? ' · includes singular positions' : '')
      : 'Change the link lengths to recover a reachable arc.');
    get<HTMLElement>('[data-reach-map]').innerHTML = trace.intervals.map((interval) =>
      `<span style="left:${interval.start / TAU * 100}%;width:${(interval.end - interval.start) / TAU * 100}%"></span>`).join('');
    refresh();
  }

  function tick(now: number) {
    frame = 0;
    if (disposed || paused) return;
    const delta = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const next = advanceInput(lengths, angle, delta * speed * TAU / 12);
    angle = next.angle;
    if (next.stopped) {
      pauseClock();
      playbackNotice = 'Boundary reached. Step back or scrub into a reachable arc; the assembly has not changed.';
      page.report('Playback stopped at the closure boundary. Step backward or choose another reachable angle.');
    }
    refresh();
    if (!paused && !disposed) frame = requestAnimationFrame(tick);
  }

  function setPaused(value: boolean) {
    if (disposed) return;
    if (value || !solution.pose || document.hidden) {
      pauseClock();
    } else {
      paused = false;
      previousTime = null;
      playbackNotice = '';
      if (!frame) frame = requestAnimationFrame(tick);
    }
    refresh();
  }

  function finishDrag() {
    const pointer = activePointer;
    activePointer = null;
    page.root.dataset.dragging = 'false';
    scene.handle.classList.remove('la-dragging');
    if (pointer !== null && scene.handle.hasPointerCapture(pointer)) scene.handle.releasePointerCapture(pointer);
  }

  function seek(next: number) {
    if (disposed) return;
    if (!Number.isFinite(next)) {
      page.report('The input angle must be a finite number from 0 to 360 degrees.');
      return;
    }
    pauseClock();
    playbackNotice = '';
    angle = radians(Math.max(0, Math.min(360, next)));
    refresh();
  }

  function step(amount: number) {
    let next = degrees(angle) + amount;
    if (next < 0) next += 360;
    if (next > 360) next -= 360;
    seek(next);
  }

  function reset() {
    if (disposed) return;
    pauseClock();
    finishDrag();
    lengths = { ...preset.lengths };
    coupler = { ...preset.coupler };
    branch = preset.branch;
    angle = radians(preset.angle);
    speed = 1;
    showConstruction = false;
    showOther = false;
    playbackNotice = '';
    for (const [key, input] of lengthInputs) input.value = String(lengths[key]);
    fractionInput.value = String(coupler.fraction);
    offsetInput.value = String(coupler.offset);
    branchInput.value = branch;
    speedInput.value = '1';
    circlesInput.checked = false;
    otherInput.checked = false;
    rebuild();
  }

  for (const [key, input] of lengthInputs) {
    input.addEventListener('input', () => {
      pauseClock();
      finishDrag();
      playbackNotice = '';
      lengths = { ...lengths, [key]: input.valueAsNumber };
      rebuild();
    }, events);
  }
  presetInput.addEventListener('change', () => {
    const next = presets.find((item) => item.id === presetInput.value);
    if (!next) {
      presetInput.value = preset.id;
      page.report('Choose one of the available linkage studies. The current geometry is unchanged.');
      return;
    }
    preset = next;
    reset();
    page.report(`Study ${preset.number}: ${preset.name}. Settings restored and playback paused.`);
  }, events);
  branchInput.addEventListener('change', () => {
    if (branchInput.value !== 'plus' && branchInput.value !== 'minus') {
      branchInput.value = branch;
      page.report('Choose the plus or minus assembly. The current branch is unchanged.');
      return;
    }
    pauseClock();
    finishDrag();
    branch = branchInput.value;
    playbackNotice = '';
    rebuild();
  }, events);
  fractionInput.addEventListener('input', () => {
    pauseClock();
    coupler = { ...coupler, fraction: fractionInput.valueAsNumber };
    playbackNotice = '';
    rebuild();
  }, events);
  offsetInput.addEventListener('input', () => {
    pauseClock();
    coupler = { ...coupler, offset: offsetInput.valueAsNumber };
    playbackNotice = '';
    rebuild();
  }, events);
  angleInput.addEventListener('input', () => seek(angleInput.valueAsNumber), events);
  speedInput.addEventListener('change', () => {
    const next = Number(speedInput.value);
    if (![0.25, 0.5, 1, 2].includes(next)) {
      speedInput.value = String(speed);
      page.report('Choose one of the available playback speeds. The current speed is unchanged.');
      return;
    }
    speed = next;
    refresh();
  }, events);
  circlesInput.addEventListener('change', () => { showConstruction = circlesInput.checked; refresh(); }, events);
  otherInput.addEventListener('change', () => { showOther = otherInput.checked; rebuild(); }, events);
  play.addEventListener('click', () => setPaused(!paused), events);
  get('[data-reset]').addEventListener('click', reset, events);
  get('[data-back]').addEventListener('click', () => step(-1), events);
  get('[data-forward]').addEventListener('click', () => step(1), events);

  scene.handle.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || lengthIssue(lengths)) return;
    event.preventDefault();
    pauseClock();
    finishDrag();
    activePointer = event.pointerId;
    scene.handle.setPointerCapture(event.pointerId);
    scene.handle.classList.add('la-dragging');
    page.root.dataset.dragging = 'true';
    const next = scene.angleAt(event.clientX, event.clientY);
    if (next !== null) seek(degrees(next));
  }, events);
  scene.handle.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    const next = scene.angleAt(event.clientX, event.clientY);
    if (next !== null) seek(degrees(next));
  }, events);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    scene.handle.addEventListener(name, (event) => {
      if (event.pointerId === activePointer) finishDrag();
    }, events);
  }
  scene.handle.addEventListener('keydown', (event) => {
    const amount = event.shiftKey ? 10 : 1;
    if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') seek(0);
      else if (event.key === 'End') seek(360);
      else step(event.key === 'ArrowRight' || event.key === 'ArrowUp' ? amount : -amount);
    }
  }, events);
  preference.addEventListener('change', () => {
    reduced = preference.matches;
    finishDrag();
    setPaused(true);
  }, events);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      finishDrag();
      setPaused(true);
    }
  }, events);
  window.addEventListener('blur', () => {
    finishDrag();
    setPaused(true);
  }, events);
  page.onCleanup(() => {
    disposed = true;
    pauseClock();
    finishDrag();
    stopObserving();
    scene.destroy();
  });

  rebuild();
  stopObserving = observeSize(plot, (size) => {
    width = size.width;
    height = size.height;
    draw();
  });
  setPaused(reduced);
  return { destroy: page.destroy, setPaused, reset };
}
