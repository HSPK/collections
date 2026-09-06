import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, downloadBlob, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { PIGMENTS, STENCILS } from './data';
import type { SandTool, Stencil } from './data';
import { SandGrid } from './engine';
import type { SandSnapshot } from './engine';
import { SandRenderer, trayBounds } from './render';

interface Edit { snapshot: SandSnapshot; stencil: Stencil }
interface Stroke { before: Edit; changed: boolean }
interface PointerStroke extends Stroke { pointerId: number; x: number; y: number }

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'sand-script');
  try {
    return createSandSite(page, context);
  } catch (error) {
    page.destroy();
    throw error;
  }
}

function createSandSite(page: ReturnType<typeof createProjectPage>, context: ProjectContext): ProjectInstance {
  page.root.innerHTML = `
    <div class="ss-page">
      <header class="ss-header">
        <div><p class="ss-eyebrow">The cabinet of small landscapes</p><h1>Sand <em>Script</em><span aria-hidden="true">.</span></h1></div>
        <p>Pour a line.<br>Let gravity finish the sentence.</p>
      </header>
      <div class="ss-workbench">
        <section class="ss-editor" aria-label="Granular sand editor">
          <div class="ss-tools" role="group" aria-label="Sand tools">
            <button type="button" data-tool="sand" aria-pressed="true" aria-label="Pour sand (B)"><span aria-hidden="true">::: </span>Pour sand <kbd>B</kbd></button>
            <button type="button" data-tool="wall" aria-pressed="false" aria-label="Build wall (W)"><span aria-hidden="true">&#9637;</span>Wall <kbd>W</kbd></button>
            <button type="button" data-tool="erase" aria-pressed="false" aria-label="Erase (E)"><span aria-hidden="true">/</span>Erase <kbd>E</kbd></button>
          </div>
          <div class="ss-tray" data-project-preview data-tray></div>
          <div class="ss-transport">
            <button type="button" data-play aria-label="Pause animation">Pause falling</button>
            <button type="button" data-undo disabled aria-keyshortcuts="Control+Z Meta+Z">Undo edit</button>
            <div class="ss-count"><output data-count aria-live="off">0</output><span>grains in the tray</span></div>
          </div>
          <p id="ss-help" class="ss-help">Drag to pour, build, or erase. Hold still for a steady stream.
            Keyboard: arrows move, Space draws, B/W/E select tools, P pauses. Shift + arrows move farther.</p>
          <p class="ss-status" data-report role="status">A little landscape is waiting. Pour over its edges or draw a new wall.</p>
        </section>
        <aside class="ss-materials" aria-label="Materials and stencils">
          <p class="ss-eyebrow">01 / The pigment shelf</p>
          <h2>Layers tell stories.</h2>
          <div class="ss-pigments" role="group" aria-label="Sand pigments">
            ${PIGMENTS.map((pigment) => `<button type="button" data-pigment="${pigment.cell}"
              aria-pressed="${pigment.cell === 4}" aria-label="${pigment.name} sand" style="--sand:${pigment.color}">
              <span class="ss-swatch" aria-hidden="true"></span><span>${pigment.name}</span><span class="ss-picked" aria-hidden="true">+</span>
            </button>`).join('')}
          </div>
          <div class="ss-field"><label for="ss-brush">Brush width <output data-brush-value>5 cells</output></label>
            <input id="ss-brush" type="range" data-brush min="1" max="8" value="2">
          </div>
          <div class="ss-field"><label for="ss-speed">Falling pace <output data-speed-value>1x</output></label>
            <input id="ss-speed" type="range" data-speed min="15" max="90" value="60" step="15">
            <div class="ss-range-labels"><span>Patient</span><span>Playful</span></div>
          </div>
          <div class="ss-stencil"><label for="ss-stencil">Start with a structure</label>
            <select id="ss-stencil" data-stencil>${STENCILS.map((stencil) =>
              `<option value="${stencil.id}">${stencil.name}</option>`).join('')}</select>
            <p data-stencil-note>${STENCILS[0].note}</p>
          </div>
          <div class="ss-actions"><button type="button" data-clear>Clear grains</button><button type="button" data-empty>Empty tray</button>
            <button type="button" data-reset>Reload stencil</button><button type="button" data-print>Save a sand print</button></div>
          <p class="ss-undo-note">Every stroke, clear, and stencil change can be undone. Undo pauses at the restored moment.</p>
        </aside>
      </div>
      <footer class="ss-footer"><span>02 / What the grains know</span><p>A grain falls into an empty cell, or slips diagonally around a neighbor.
        Walls hold; layers settle. This is an illustrative cellular material, not a physical sand model.</p>
        <span>No two pours need to be alike.</span></footer>
    </div>`;

  const host = query<HTMLElement>(page.root, '[data-tray]');
  const surface = canvas2D(host, 'A layered sand landscape inside an editable granular tray');
  page.onCleanup(surface.dispose);
  const grid = new SandGrid();
  grid.load('vessel');
  const renderer = new SandRenderer(grid);
  page.onCleanup(() => renderer.dispose());
  const { canvas, size } = surface;
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const undo = query<HTMLButtonElement>(page.root, '[data-undo]');
  const report = query<HTMLElement>(page.root, '[data-report]');
  const count = query<HTMLOutputElement>(page.root, '[data-count]');
  const stencilSelect = query<HTMLSelectElement>(page.root, '[data-stencil]');
  let paused = context.reducedMotion;
  let stencil: Stencil = 'vessel';
  let tool: SandTool = 'sand';
  let pigment = 4;
  let radius = 2;
  let rate = 60;
  let dirty = true;
  let accumulator = 0;
  let cursor = { x: Math.round(grid.width * 0.5), y: Math.round(grid.height * 0.2) };
  let cursorVisible = false;
  let pointerStroke: PointerStroke | null = null;
  let keyboardStroke: Stroke | null = null;
  const history: Edit[] = [];
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Sand tray. Arrow keys move, Space draws, B pours, W builds, E erases, P pauses.');
  canvas.setAttribute('aria-describedby', 'ss-help');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Space B W E P');

  function paint(showCursor = true): void {
    renderer.draw(surface.context, size.width, size.height);
    const grains = grid.countGrains();
    count.value = grains.toLocaleString();
    host.dataset.grains = String(grains);
    if (showCursor && cursorVisible) {
      const bounds = trayBounds(size.width, size.height, grid);
      const ctx = surface.context;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = tool === 'erase' ? '#a0443a' : '#fff9ed';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(bounds.x + (cursor.x + 0.5) * bounds.scale, bounds.y + (cursor.y + 0.5) * bounds.scale,
        (radius + 0.5) * bounds.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#6e3438';
      ctx.stroke();
      ctx.restore();
    }
  }

  const loop = createLoop((_elapsed, delta) => {
    accumulator += delta;
    let changed = false;
    for (let n = 0; !paused && accumulator >= 1 / rate && n < 6; n++) {
      changed = grid.step() > 0 || changed;
      if (tool === 'sand' && (pointerStroke || keyboardStroke)) {
        changed = applyBrush(cursor.x, cursor.y, cursor.x, cursor.y) || changed;
      }
      accumulator -= 1 / rate;
    }
    if (dirty || changed) {
      paint();
      dirty = false;
    }
  }, { paused });
  page.onCleanup(loop.destroy);
  const invalidate = () => { dirty = true; loop.requestRender(); };
  const snapshot = (): Edit => ({ snapshot: grid.snapshot(), stencil });
  const remember = (edit: Edit) => {
    history.push(edit);
    if (history.length > 16) history.shift();
    undo.disabled = false;
  };

  function applyBrush(x0: number, y0: number, x1: number, y1: number): boolean {
    const changed = grid.brush(x0, y0, x1, y1, radius, tool, pigment) > 0;
    if (pointerStroke) pointerStroke.changed ||= changed;
    if (keyboardStroke) keyboardStroke.changed ||= changed;
    if (changed) dirty = true;
    return changed;
  }

  function finishPointer(): void {
    const stroke = pointerStroke;
    pointerStroke = null;
    if (!stroke) return;
    if (stroke.changed) remember(stroke.before);
    if (canvas.hasPointerCapture(stroke.pointerId)) canvas.releasePointerCapture(stroke.pointerId);
  }

  function finishKeyboard(): void {
    const stroke = keyboardStroke;
    keyboardStroke = null;
    if (stroke?.changed) remember(stroke.before);
  }

  function finishEdit(): void {
    finishPointer();
    finishKeyboard();
  }

  function setPaused(value: boolean): void {
    paused = value;
    accumulator = 0;
    play.textContent = value ? 'Let it fall' : 'Pause falling';
    play.setAttribute('aria-label', value ? 'Play animation' : 'Pause animation');
    page.root.dataset.motion = value ? 'paused' : 'playing';
    loop.setPaused(value);
    invalidate();
  }

  function undoEdit(): void {
    finishEdit();
    const previous = history.pop();
    if (!previous) {
      report.textContent = 'There are no edits to undo yet.';
      return;
    }
    grid.restore(previous.snapshot);
    stencil = previous.stencil;
    stencilSelect.value = stencil;
    query<HTMLElement>(page.root, '[data-stencil-note]').textContent =
      STENCILS.find((item) => item.id === stencil)!.note;
    undo.disabled = history.length === 0;
    setPaused(true);
    report.textContent = 'Restored the moment before your last edit. Motion is paused.';
    invalidate();
  }

  function reset(): void {
    finishEdit();
    remember(snapshot());
    grid.load(stencil);
    report.textContent = 'The selected structure and its original layers are back. This change is in Undo.';
    invalidate();
  }

  function selectTool(next: SandTool): void {
    finishEdit();
    tool = next;
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === next));
    }
    report.textContent = next === 'sand' ? 'Pour into empty space. Existing grains and walls stay in place.'
      : next === 'wall' ? 'Draw a solid wall. It replaces any grains beneath the brush.'
        : 'Erase grains or walls. The outside of the tray always stays sealed.';
    invalidate();
  }

  const pointerCell = (event: PointerEvent) => {
    const point = pointerPosition(event, canvas);
    const bounds = trayBounds(size.width, size.height, grid);
    return { x: clamp(Math.floor((point.x - bounds.x) / bounds.scale), 1, grid.width - 2),
      y: clamp(Math.floor((point.y - bounds.y) / bounds.scale), 1, grid.height - 2) };
  };
  canvas.addEventListener('canvasresize', invalidate, { signal: page.signal });
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    finishEdit();
    cursor = pointerCell(event);
    pointerStroke = { ...cursor, pointerId: event.pointerId, before: snapshot(), changed: false };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    cursorVisible = true;
    applyBrush(cursor.x, cursor.y, cursor.x, cursor.y);
    invalidate();
    event.preventDefault();
  }, { signal: page.signal });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerStroke && pointerStroke.pointerId !== event.pointerId) return;
    cursor = pointerCell(event);
    cursorVisible = true;
    if (pointerStroke) {
      applyBrush(pointerStroke.x, pointerStroke.y, cursor.x, cursor.y);
      pointerStroke.x = cursor.x;
      pointerStroke.y = cursor.y;
    }
    invalidate();
  }, { signal: page.signal });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, finishPointer, { signal: page.signal });
  }
  canvas.addEventListener('pointerleave', () => {
    if (!pointerStroke) { cursorVisible = false; invalidate(); }
  }, { signal: page.signal });
  canvas.addEventListener('focus', () => { cursorVisible = true; invalidate(); }, { signal: page.signal });
  canvas.addEventListener('blur', () => {
    finishEdit();
    cursorVisible = false;
    invalidate();
  }, { signal: page.signal });
  canvas.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (!event.repeat) undoEdit();
      return;
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const previous = { ...cursor };
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowLeft') cursor.x -= step;
      if (event.key === 'ArrowRight') cursor.x += step;
      if (event.key === 'ArrowUp') cursor.y -= step;
      if (event.key === 'ArrowDown') cursor.y += step;
      cursor.x = clamp(cursor.x, 1, grid.width - 2);
      cursor.y = clamp(cursor.y, 1, grid.height - 2);
      if (keyboardStroke) applyBrush(previous.x, previous.y, cursor.x, cursor.y);
      invalidate();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!keyboardStroke) keyboardStroke = { before: snapshot(), changed: false };
      applyBrush(cursor.x, cursor.y, cursor.x, cursor.y);
      if (event.key === 'Enter') finishKeyboard();
      invalidate();
    } else {
      const key = event.key.toLowerCase();
      if (!['b', 'w', 'e', 'p'].includes(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'p') setPaused(!paused);
      else selectTool(key === 'b' ? 'sand' : key === 'w' ? 'wall' : 'erase');
    }
  }, { signal: page.signal });
  canvas.addEventListener('keyup', (event) => {
    if (event.key === ' ') { event.preventDefault(); finishKeyboard(); }
  }, { signal: page.signal });
  window.addEventListener('blur', finishEdit, { signal: page.signal });
  play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
  undo.addEventListener('click', undoEdit, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    button.addEventListener('click', () => {
      const next = button.dataset.tool;
      if (next !== 'sand' && next !== 'wall' && next !== 'erase') throw new Error('Unknown sand tool.');
      selectTool(next);
    }, { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-pigment]')) {
    button.addEventListener('click', () => {
      finishEdit();
      const selected = PIGMENTS.find((item) => String(item.cell) === button.dataset.pigment);
      if (!selected) throw new Error('The selected sand pigment is missing.');
      pigment = selected.cell;
      for (const option of page.root.querySelectorAll('[data-pigment]')) {
        option.setAttribute('aria-pressed', String(option === button));
      }
      selectTool('sand');
      report.textContent = `${selected.name} sand is ready to pour.`;
    }, { signal: page.signal });
  }
  const brush = query<HTMLInputElement>(page.root, '[data-brush]');
  brush.addEventListener('input', () => {
    radius = brush.valueAsNumber;
    query<HTMLOutputElement>(page.root, '[data-brush-value]').value = `${radius * 2 + 1} cells`;
    invalidate();
  }, { signal: page.signal });
  const speed = query<HTMLInputElement>(page.root, '[data-speed]');
  speed.addEventListener('input', () => {
    rate = speed.valueAsNumber;
    query<HTMLOutputElement>(page.root, '[data-speed-value]').value = `${rate / 60}x`;
  }, { signal: page.signal });
  stencilSelect.addEventListener('change', () => {
    finishEdit();
    const selected = STENCILS.find((item) => item.id === stencilSelect.value);
    if (!selected) throw new Error('The selected sand structure is missing.');
    remember(snapshot());
    stencil = selected.id;
    grid.load(stencil);
    query<HTMLElement>(page.root, '[data-stencil-note]').textContent = selected.note;
    report.textContent = `${selected.name} loaded. Your previous tray is kept in Undo.`;
    invalidate();
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-reset]').addEventListener('click', reset, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-clear]').addEventListener('click', () => {
    finishEdit();
    if (grid.countGrains() === 0) {
      report.textContent = 'There are no grains to clear. The walls are ready for a new pour.';
      return;
    }
    remember(snapshot());
    grid.clearGrains();
    report.textContent = 'All grains cleared; the walls remain. Your layers are safe in Undo.';
    invalidate();
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-empty]').addEventListener('click', () => {
    finishEdit();
    remember(snapshot());
    grid.empty();
    report.textContent = 'An empty tray, ready for your own architecture. Undo restores the previous landscape.';
    invalidate();
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-print]').addEventListener('click', () => {
    paint(false);
    canvas.toBlob((blob) => {
      if (page.signal.aborted) return;
      if (!blob) {
        report.textContent = 'The browser could not make a sand print. Please try again.';
        return;
      }
      downloadBlob('sand-script.png', blob);
      report.textContent = 'Your sand landscape has been saved as a local PNG.';
    }, 'image/png');
    invalidate();
  }, { signal: page.signal });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });
  page.onCleanup(finishEdit);
  setPaused(paused);
  return { destroy: page.destroy, setPaused, reset };
}
