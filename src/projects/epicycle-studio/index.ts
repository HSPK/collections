import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { presets } from './data';
import { MAX_INPUT_POINTS, SAMPLE_COUNT, makeDrawing, reconstructionPath, relativeError, selectHarmonics } from './engine';
import type { FourierDrawing, Point } from './engine';
import { drawPlot, plotView, pointFromCanvas } from './scene';
import type { PlotModel } from './scene';
import { CYCLE_SECONDS, OPENING_PHASE, advancePhase, seekPhase } from './timeline';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'epicycle-studio');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const startsReduced = context.reducedMotion || preference.matches;
  page.root.tabIndex = 0;
  page.root.setAttribute('aria-labelledby', 'epicycle-title');
  let drawing = makeDrawing(presets[0].points);
  let customDrawing: FourierDrawing | undefined;
  let harmonicCount = 18;
  let model: PlotModel = {
    drawing,
    coefficients: selectHarmonics(drawing, harmonicCount),
    path: [],
  };
  let phase = OPENING_PHASE;
  let speed = 1;
  let paused = startsReduced;
  let sourceName = presets[0].name;
  let sourceId = presets[0].id;
  let sketching = false;
  let sketch: Point[] = [];
  let cursor: Point = { x: 0, y: 0 };
  let activePointer: number | null = null;
  let pointLimitReported = false;
  let loop: ReturnType<typeof createLoop> | undefined;

  page.root.innerHTML = `
    <div class="ep-shell">
      <header class="ep-header">
        <div class="ep-identity">
          <svg class="ep-mark" viewBox="0 0 56 56" aria-hidden="true"><circle cx="25" cy="28" r="20"/><circle cx="40" cy="18" r="10"/><path d="M25 28 40 18 46 10"/><circle class="ep-mark-pen" cx="46" cy="10" r="3"/></svg>
          <div><p class="ep-kicker">Field study 046 / a line in parts</p><h1 id="epicycle-title">Epicycle Studio</h1></div>
        </div>
        <p class="ep-deck">A drawing is a sum of turning circles.<br>Take it apart. Put the line back together.</p>
      </header>

      <section class="ep-workbench" aria-label="Fourier drawing workbench" data-project-preview>
        <div class="ep-paper">
          <div class="ep-plot-heading"><span><i aria-hidden="true"></i><strong data-source-name>Orbit flower</strong></span><span data-plot-mode>Complex plane / live sum</span></div>
          <div class="ep-plot" data-plot></div>
          <div class="ep-legend" aria-label="Drawing legend">
            <span><i class="ep-key ep-key-trace" aria-hidden="true"></i>Reconstructed trace</span>
            <span><i class="ep-key ep-key-circle" aria-hidden="true"></i>Rotating circles</span>
            <span><i class="ep-key ep-key-source" aria-hidden="true"></i>Input outline</span>
          </div>
          <div class="ep-sketch-tools" data-sketch-tools hidden>
            <p><strong>Your drawing desk</strong><br><span data-sketch-count>0 points. Add at least 3.</span></p>
            <div class="ep-button-row">
              <button class="ep-primary" type="button" data-use-sketch disabled>Trace sketch</button>
              <button type="button" data-undo-sketch disabled>Undo point</button>
              <button type="button" data-clear-sketch>Clear sketch</button>
              <button type="button" data-cancel-sketch>Cancel</button>
            </div>
          </div>
          <div class="ep-transport">
            <div class="ep-transport-row">
              <div class="ep-button-row">
                <button class="ep-primary ep-play" type="button" data-play>Pause</button>
                <button type="button" data-reset>Reset</button>
              </div>
              <div class="ep-speed"><label for="epicycle-speed">Speed</label>
                <select id="epicycle-speed"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select>
              </div>
            </div>
            <label class="ep-range-label" for="epicycle-time"><span>Cycle position <span class="ep-muted">/ ${CYCLE_SECONDS}s at 1x</span></span><output data-phase>68.0%</output></label>
            <input id="epicycle-time" type="range" min="0" max="1" step="0.001" value="${phase}" aria-label="Cycle position">
            <p class="ep-help" id="epicycle-keyboard-help">Scrubbing pauses. Focus the plot: Space plays; arrows step; Home / End show the ends.</p>
          </div>
        </div>

        <aside class="ep-inspector" aria-label="Signal controls">
          <div class="ep-inspector-title"><span class="ep-kicker">01 / The signal</span><span class="ep-sample-stamp">${SAMPLE_COUNT}<small>samples</small></span></div>
          <label class="ep-field" for="epicycle-source">Choose a closed path
            <select id="epicycle-source">${presets.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.name)}</option>`).join('')}<option value="custom" disabled>Your sketch</option></select>
          </label>
          <button type="button" class="ep-draw" data-draw>+ Draw a path</button>
          <p class="ep-note" data-source-note>${escapeMarkup(presets[0].note)}</p>

          <div class="ep-harmonics">
            <label class="ep-range-label" for="epicycle-harmonics"><span>Rotating harmonics</span><output data-count>18</output></label>
            <input id="epicycle-harmonics" type="range" min="0" max="${SAMPLE_COUNT - 1}" step="1" value="${harmonicCount}" aria-label="Rotating harmonics">
            <div class="ep-count-options" aria-label="Harmonic count shortcuts">
              <button type="button" data-count-choice="4" aria-label="Use 4 harmonics">4</button>
              <button type="button" data-count-choice="18" aria-label="Use 18 harmonics">18</button>
              <button type="button" data-count-choice="64" aria-label="Use 64 harmonics">64</button>
              <button type="button" data-count-choice="127" aria-label="Use all 127 harmonics">All 127</button>
            </div>
            <p class="ep-note">Largest circles first. The stationary mean is always included; it does not count as a turn.</p>
          </div>
          <dl class="ep-error"><div><dt>Sample RMS error</dt><dd><output data-error></output><span>%</span></dd></div><div><dt>Fixed mean / DC</dt><dd class="ep-mean" data-mean></dd></div></dl>
          <div class="ep-visibility">
            <label><input type="checkbox" data-show-circles checked> Show circles</label>
            <label><input type="checkbox" data-show-source checked> Show input</label>
          </div>
          <details class="ep-spectrum">
            <summary>The six largest turns</summary>
            <div class="ep-spectrum-heading"><span>Turns / cycle</span><span>Radius</span></div>
            <ol data-spectrum aria-label="Dominant Fourier coefficients"></ol>
            <p class="ep-note">+ turns counterclockwise; &minus; turns clockwise. Muted rows are currently omitted.</p>
          </details>
        </aside>
      </section>

      <div class="ep-feedback-row">
        <p data-feedback role="status">${startsReduced ? 'Reduced motion: a still at 68%. Press Play only when you want motion.' : 'A twelve-second cycle, already in progress. Try four circles, then all 127.'}</p>
        <span class="ep-local">Computed here. No uploads.</span>
      </div>
      <p class="ep-drawing-help" data-drawing-help hidden>Drag one continuous line, then choose <strong>Trace sketch</strong>. The dotted segment closes the path.
        Keyboard: focus the plot, move the red pen with arrows, Space adds a corner, Backspace undoes, Enter traces, Escape cancels. Shift + arrows takes bigger steps.</p>

      <section class="ep-reading" id="epicycle-notes" aria-labelledby="epicycle-notes-title">
        <div class="ep-reading-heading"><p class="ep-kicker">02 / What the circles know</p><h2 id="epicycle-notes-title">One outline. Many little turns.</h2></div>
        <div class="ep-note-grid">
          <article><span class="ep-note-number">a.</span><h3>Give the line a clock.</h3><p>We fit the outline to this plot, close it, and take ${SAMPLE_COUNT} equally spaced samples along its length. Each point becomes a complex number: horizontal <em>x</em> plus vertical <em>iy</em>.</p></article>
          <article><span class="ep-note-number">b.</span><h3>Measure each frequency.</h3><p>A discrete Fourier transform measures the radius and starting angle of each turn. Frequency <strong>k</strong> makes k revolutions per cycle. Negative k turns the other way; k = 0 is the fixed mean.</p></article>
          <article><span class="ep-note-number">c.</span><h3>Add, tip to tail.</h3><p>The pen sits at the end of the vector chain. Every circle here comes from the chosen input. Fewer terms simplify it; all ${SAMPLE_COUNT - 1}, plus the mean, reproduce every sample up to numerical precision.</p></article>
        </div>
        <div class="ep-equation"><code>z(t) = c<sub>0</sub> + &sum; c<sub>k</sub> e<sup>2&pi;ikt</sup></code><p>The error readout is RMS distance at the samples, as a percentage of the input's RMS radius about its mean. Between samples, the Fourier curve interpolates smoothly; a sharp corner can ring.</p></div>
      </section>
      <footer class="ep-footer"><span>EPICYCLE STUDIO / AN ORIGINAL LINE LAB</span><a href="#epicycle-title">Back to the drawing</a></footer>
    </div>`;

  const plot = query<HTMLElement>(page.root, '[data-plot]');
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const resetButton = query<HTMLButtonElement>(page.root, '[data-reset]');
  const time = query<HTMLInputElement>(page.root, '#epicycle-time');
  const speedControl = query<HTMLSelectElement>(page.root, '#epicycle-speed');
  const harmonicControl = query<HTMLInputElement>(page.root, '#epicycle-harmonics');
  const sourceControl = query<HTMLSelectElement>(page.root, '#epicycle-source');
  const showCircles = query<HTMLInputElement>(page.root, '[data-show-circles]');
  const showSource = query<HTMLInputElement>(page.root, '[data-show-source]');
  const drawButton = query<HTMLButtonElement>(page.root, '[data-draw]');
  const useSketch = query<HTMLButtonElement>(page.root, '[data-use-sketch]');
  const undoSketchButton = query<HTMLButtonElement>(page.root, '[data-undo-sketch]');
  const feedback = query<HTMLElement>(page.root, '[data-feedback]');
  const phaseOutput = query<HTMLOutputElement>(page.root, '[data-phase]');
  let surface: ReturnType<typeof canvas2D>;
  try {
    surface = canvas2D(plot, 'Fourier drawing of Orbit flower');
  } catch (error) {
    page.destroy();
    throw error;
  }
  const { canvas } = surface;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-describedby', 'epicycle-keyboard-help');
  page.onCleanup(surface.dispose);

  function report(message: string, notify = false) {
    feedback.textContent = message;
    if (notify) page.report(message);
  }

  function render() {
    if (page.signal.aborted) return;
    page.root.dataset.phase = phase.toFixed(6);
    time.value = phase.toFixed(3);
    time.setAttribute('aria-valuetext', `${(phase * 100).toFixed(1)} percent of one cycle`);
    phaseOutput.value = `${(phase * 100).toFixed(1)}%`;
    drawPlot(surface.context, surface.size.width, surface.size.height, model, {
      phase, circles: showCircles.checked, source: showSource.checked,
      sketch: sketching ? sketch : null, cursor,
    });
  }

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    if (sketching && !value) {
      report('Trace or cancel your sketch before starting playback.', true);
      return;
    }
    paused = value;
    if (!paused && phase === 1) phase = 0;
    play.textContent = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', paused ? 'Play drawing' : 'Pause drawing');
    play.setAttribute('aria-pressed', String(!paused));
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    loop?.setPaused(paused);
  }

  function rebuild() {
    const coefficients = selectHarmonics(drawing, harmonicCount);
    model = { drawing, coefficients, path: reconstructionPath(coefficients) };
    page.root.dataset.source = sourceId;
    page.root.dataset.harmonics = String(harmonicCount);
    harmonicControl.value = String(harmonicCount);
    query<HTMLOutputElement>(page.root, '[data-count]').value = String(harmonicCount);
    query<HTMLOutputElement>(page.root, '[data-error]').value = relativeError(drawing, harmonicCount).toFixed(2);
    const fixed = (value: number) => (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3);
    query<HTMLElement>(page.root, '[data-mean]').textContent = `${fixed(drawing.dc.re)}, ${fixed(drawing.dc.im)}`;
    query<HTMLElement>(page.root, '[data-source-name]').textContent = sourceName;
    canvas.setAttribute('aria-label', `Fourier drawing of ${sourceName}, ${harmonicCount} rotating circles plus the fixed mean`);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-count-choice]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.countChoice) === harmonicCount));
    }
    const largest = drawing.harmonics[0].amplitude;
    query<HTMLOListElement>(page.root, '[data-spectrum]').innerHTML = drawing.harmonics.slice(0, 6).map((term, index) => `
      <li data-included="${index < harmonicCount}"><code>${term.frequency > 0 ? '+' : ''}${term.frequency}</code><span class="ep-spectrum-bar" aria-hidden="true"><i style="width:${largest === 0 ? 0 : term.amplitude / largest * 100}%"></i></span><span>${term.amplitude.toFixed(3)}</span></li>`).join('');
    render();
  }

  function releasePointer() {
    if (activePointer !== null && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
    activePointer = null;
  }

  function sketchControls() {
    page.root.dataset.inputMode = sketching ? 'draw' : 'view';
    query<HTMLElement>(page.root, '[data-sketch-tools]').hidden = !sketching;
    query<HTMLElement>(page.root, '[data-drawing-help]').hidden = !sketching;
    query<HTMLElement>(page.root, '[data-plot-mode]').textContent = sketching ? 'Drawing desk / close the line' : 'Complex plane / live sum';
    query<HTMLElement>(page.root, '[data-sketch-count]').textContent = `${sketch.length} points. ${sketch.length < 3 ? 'Add at least 3.' : 'Ready to close and trace.'}`;
    useSketch.disabled = sketch.length < 3;
    undoSketchButton.disabled = sketch.length === 0;
    for (const control of [play, resetButton, time, speedControl, harmonicControl, showCircles, showSource, drawButton]) {
      control.disabled = sketching;
    }
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-count-choice]')) button.disabled = sketching;
    canvas.setAttribute('role', sketching ? 'application' : 'img');
    canvas.setAttribute('aria-describedby', sketching ? 'epicycle-sketch-help' : 'epicycle-keyboard-help');
    query<HTMLElement>(page.root, '[data-drawing-help]').id = 'epicycle-sketch-help';
    if (sketching) canvas.setAttribute('aria-label', 'Closed-path drawing desk. Arrows move the pen; Space adds a point; Enter traces.');
    render();
  }

  function beginSketch() {
    setPaused(true);
    sketching = true;
    sketch = [];
    cursor = { x: 0, y: 0 };
    pointLimitReported = false;
    sketchControls();
    report('Draw one line, or use arrows and Space to place corners. The last point will join the first.');
    canvas.focus({ preventScroll: true });
    plot.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function leaveSketch() {
    releasePointer();
    sketching = false;
    sketchControls();
    rebuild();
  }

  function applySketch() {
    if (sketch.length < 3) {
      report('Add at least three points before tracing the sketch.', true);
      return;
    }
    try {
      drawing = makeDrawing(sketch);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      report(error.message, true);
      return;
    }
    sourceId = 'custom';
    sourceName = 'Your sketch';
    customDrawing = drawing;
    query<HTMLOptionElement>(sourceControl, '[value="custom"]').disabled = false;
    sourceControl.value = 'custom';
    query<HTMLElement>(page.root, '[data-source-note]').textContent = 'Your own closed line, fitted to the plot and resampled at 128 equal-distance positions. It stays in this page only.';
    phase = 1;
    leaveSketch();
    report('Your sketch is now a Fourier drawing. The complete trace is paused; Play starts a new cycle.');
  }

  function addPoint(point: Point) {
    if (sketch.length === MAX_INPUT_POINTS) {
      if (!pointLimitReported) report(`The ${MAX_INPUT_POINTS}-point sketch limit is reached. Trace this line, undo, or clear it.`, true);
      pointLimitReported = true;
      return;
    }
    sketch.push({ ...point });
    sketchControls();
  }

  function undoPoint() {
    if (!sketch.length) {
      report('The drawing desk is already empty.', true);
      return;
    }
    sketch.pop();
    pointLimitReported = false;
    sketchControls();
  }

  function setTime(value: number) {
    setPaused(true);
    phase = seekPhase(value);
    render();
  }

  function reset() {
    if (page.signal.aborted) return;
    if (sketching) leaveSketch();
    setTime(0);
    report('Back to the first sample. Play to draw another cycle.');
  }

  play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
  resetButton.addEventListener('click', reset, { signal: page.signal });
  time.addEventListener('input', () => setTime(time.valueAsNumber), { signal: page.signal });
  speedControl.addEventListener('change', () => {
    speed = Number(speedControl.value);
    page.root.dataset.speed = String(speed);
    report(`Playback speed: ${speed}x. A cycle takes ${CYCLE_SECONDS / speed} seconds.`);
  }, { signal: page.signal });
  harmonicControl.addEventListener('input', () => {
    harmonicCount = harmonicControl.valueAsNumber;
    rebuild();
  }, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-count-choice]')) {
    button.addEventListener('click', () => {
      harmonicCount = Number(button.dataset.countChoice);
      rebuild();
    }, { signal: page.signal });
  }
  sourceControl.addEventListener('change', () => {
    if (sourceControl.value === 'custom') {
      if (!customDrawing) throw new Error('Draw a sketch before selecting it.');
      drawing = customDrawing;
      sourceId = 'custom';
      sourceName = 'Your sketch';
      query<HTMLElement>(page.root, '[data-source-note]').textContent = 'Your own closed line, fitted to the plot and resampled at 128 equal-distance positions. It stays in this page only.';
    } else {
      const preset = presets.find((item) => item.id === sourceControl.value);
      if (!preset) throw new Error('This drawing preset is not available.');
      drawing = makeDrawing(preset.points);
      sourceId = preset.id;
      sourceName = preset.name;
      query<HTMLElement>(page.root, '[data-source-note]').textContent = preset.note;
    }
    if (sketching) leaveSketch();
    else rebuild();
    report(`${sourceName}: its 128-point transform is on the plot. The cycle position is unchanged.`);
  }, { signal: page.signal });
  showCircles.addEventListener('change', render, { signal: page.signal });
  showSource.addEventListener('change', render, { signal: page.signal });
  drawButton.addEventListener('click', beginSketch, { signal: page.signal });
  useSketch.addEventListener('click', applySketch, { signal: page.signal });
  undoSketchButton.addEventListener('click', undoPoint, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-clear-sketch]').addEventListener('click', () => {
    releasePointer();
    sketch = [];
    pointLimitReported = false;
    sketchControls();
    report('Sketch cleared. Drag a new line, or use the keyboard pen.');
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-cancel-sketch]').addEventListener('click', () => {
    leaveSketch();
    report('Sketch cancelled. The previous drawing is unchanged.');
  }, { signal: page.signal });

  const eventPoint = (event: PointerEvent) => {
    const position = pointerPosition(event, canvas);
    return pointFromCanvas(
      clamp(position.x, 12, surface.size.width - 12),
      clamp(position.y, 12, surface.size.height - 12),
      plotView(surface.size.width, surface.size.height, model, true),
    );
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (!sketching || event.button !== 0 || activePointer !== null) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    sketch = [];
    pointLimitReported = false;
    cursor = eventPoint(event);
    addPoint(cursor);
  }, { signal: page.signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!sketching || event.pointerId !== activePointer) return;
    event.preventDefault();
    cursor = eventPoint(event);
    const previous = sketch[sketch.length - 1];
    if (!previous || Math.hypot(cursor.x - previous.x, cursor.y - previous.y) > 0.008) addPoint(cursor);
  }, { signal: page.signal });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    releasePointer();
    report(sketch.length < 3 ? 'That line is too short. Draw a longer stroke or add keyboard points.' : 'Line captured. Trace sketch closes the gap and computes its circles.');
  }, { signal: page.signal });
  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== activePointer) return;
    releasePointer();
    report('The stroke was interrupted. Its points are kept; trace, continue with the keyboard, or clear the sketch.');
  }, { signal: page.signal });
  canvas.addEventListener('keydown', (event) => {
    if (!sketching || event.altKey || event.ctrlKey || event.metaKey
      || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Backspace', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.2 : 0.05;
    const view = plotView(surface.size.width, surface.size.height, model, true);
    const xLimit = (surface.size.width / 2 - 14) / view.scale;
    const yLimit = (surface.size.height / 2 - 14) / view.scale;
    if (event.key === 'ArrowLeft') cursor.x = clamp(cursor.x - step, -xLimit, xLimit);
    if (event.key === 'ArrowRight') cursor.x = clamp(cursor.x + step, -xLimit, xLimit);
    if (event.key === 'ArrowUp') cursor.y = clamp(cursor.y + step, -yLimit, yLimit);
    if (event.key === 'ArrowDown') cursor.y = clamp(cursor.y - step, -yLimit, yLimit);
    if (event.key === ' ') {
      const previous = sketch[sketch.length - 1];
      if (previous && previous.x === cursor.x && previous.y === cursor.y) report('Move the pen before adding another point.');
      else addPoint(cursor);
    }
    if (event.key === 'Backspace') undoPoint();
    if (event.key === 'Enter') applySketch();
    if (event.key === 'Escape') { leaveSketch(); report('Sketch cancelled. The previous drawing is unchanged.'); }
    render();
  }, { signal: page.signal });
  page.root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.defaultPrevented || sketching || event.altKey || event.ctrlKey || event.metaKey
      || (event.repeat && event.key === ' ') || !(target instanceof HTMLElement)
      || target.isContentEditable || /^(INPUT|BUTTON|SELECT|TEXTAREA|A|SUMMARY)$/.test(target.tagName)) return;
    if (![' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === ' ') setPaused(!paused);
    if (event.key === 'ArrowLeft') setTime(phase - 0.01);
    if (event.key === 'ArrowRight') setTime(phase + 0.01);
    if (event.key === 'Home') setTime(0);
    if (event.key === 'End') setTime(1);
  }, { signal: page.signal });
  preference.addEventListener('change', () => {
    if (preference.matches) {
      setPaused(true);
      report('Reduced motion is on. The plot is paused; all controls still work.');
    }
  }, { signal: page.signal });
  canvas.addEventListener('canvasresize', render, { signal: page.signal });
  page.onCleanup(releasePointer);
  rebuild();
  sketchControls();
  setPaused(paused);
  loop = createLoop((_elapsed, delta) => {
    if (!paused && !sketching) phase = advancePhase(phase, delta, speed);
    render();
  }, { paused });
  page.onCleanup(loop.destroy);
  return { destroy: page.destroy, setPaused, reset };
}
