import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, downloadBlob, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { INKS, viscosityFromControl } from './data';
import type { Pigment } from './data';
import { InkWater } from './engine';
import { WaterRenderer } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'ink-water');
  try {
    return createWaterSite(page, context);
  } catch (error) {
    page.destroy();
    throw error;
  }
}

function createWaterSite(page: ReturnType<typeof createProjectPage>, context: ProjectContext): ProjectInstance {
  page.root.innerHTML = `
    <div class="iw-page">
      <header class="iw-header">
        <div class="iw-identity"><span class="iw-mark" aria-hidden="true"></span><div>
          <p class="iw-eyebrow">An experiment in suspension</p>
          <h1>Ink <em>in Water</em></h1>
        </div></div>
        <p class="iw-intro">A drop becomes a world.<br>Leave a little room for the unexpected.</p>
      </header>
      <div class="iw-workbench">
        <section class="iw-exhibit" aria-label="Pigment in water">
          <div class="iw-exhibit-heading"><span>THE WATER VESSEL</span><span data-water-state>In motion</span></div>
          <div class="iw-tank" data-project-preview data-water-canvas></div>
          <div class="iw-transport">
            <button type="button" class="iw-play" data-play aria-label="Pause animation">Pause</button>
            <button type="button" data-pour>Pour a ribbon <span aria-hidden="true">+</span></button>
            <span class="iw-tracers"><output data-tracers aria-live="off">0</output> ink tracers</span>
          </div>
          <p class="iw-hint" id="iw-canvas-help">Drag slowly to release pigment; move quickly to stir.
            Keyboard: focus the water, arrows move the pipette, Enter pours, P pauses.</p>
        </section>
        <aside class="iw-desk" aria-label="The mixing desk">
          <p class="iw-eyebrow">01 / The mixing desk</p>
          <h2>Let it unfold.</h2>
          <fieldset class="iw-inks"><legend>Choose your pigment</legend>
            ${INKS.map((ink) => `<button type="button" data-ink="${ink.id}" aria-pressed="${ink.id === 0}"
              style="--pigment:${ink.color}" aria-label="${ink.name} pigment">
              <span class="iw-swatch" aria-hidden="true"></span><span>${ink.name}</span>
            </button>`).join('')}
          </fieldset>
          <div class="iw-viscosity">
            <label for="iw-viscosity">Viscosity <output data-viscosity-value>30</output></label>
            <input id="iw-viscosity" data-viscosity type="range" min="0" max="100" value="30">
            <div class="iw-range-labels"><span>Feathery</span><span>Velvety</span></div>
            <p>Thicker water softens small eddies. Stir again to feel the difference.</p>
          </div>
          <div class="iw-actions">
            <button type="button" data-clear>Clear the water</button>
            <button type="button" data-restore>Restore this study</button>
            <button type="button" data-print>Keep a print <span aria-hidden="true">&nearr;</span></button>
          </div>
          <p class="iw-status" role="status" data-report>Two pigments, one quiet current. Add a drop of your own.</p>
          <div class="iw-model-note"><span class="iw-note-line" aria-hidden="true"></span>
            <p><strong>Water, interpreted.</strong> An illustrative fluid grid carries soft pigment and fine tracers.
              It is a small generative painting, not a laboratory simulation.</p>
          </div>
        </aside>
      </div>
      <footer class="iw-footer"><span>02 / A little field guide</span><p>Momentum curls the drop.
        Pressure projection steadies the flow. Pigments share the same water, but keep their colors.</p>
        <span>Made locally. Kept locally.</span></footer>
    </div>`;

  const host = query<HTMLElement>(page.root, '[data-water-canvas]');
  const surface = canvas2D(host, 'Soft indigo and madder plumes suspended in pale water');
  page.onCleanup(surface.dispose);
  const engine = new InkWater();
  engine.viscosity = viscosityFromControl(30);
  engine.seedScene();
  const renderer = new WaterRenderer(engine);
  page.onCleanup(() => renderer.dispose());
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const state = query<HTMLElement>(page.root, '[data-water-state]');
  const report = query<HTMLElement>(page.root, '[data-report]');
  const count = query<HTMLOutputElement>(page.root, '[data-tracers]');
  let pigment: Pigment = 0;
  let paused = context.reducedMotion;
  let dirty = true;
  let accumulator = 0;
  let pointerId: number | null = null;
  let pipette = { x: 0.46, y: 0.14 };
  let cursorVisible = false;
  const { canvas, size } = surface;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Ink pipette. Arrow keys move; Enter pours; P pauses.');
  canvas.setAttribute('aria-describedby', 'iw-canvas-help');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter P');

  const paint = (showCursor = true) => {
    renderer.draw(surface.context, size.width, size.height);
    if (cursorVisible && showCursor) {
      const ctx = surface.context;
      ctx.save();
      ctx.strokeStyle = INKS[pigment].color;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(pipette.x * size.width, pipette.y * size.height, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    count.value = engine.count.toLocaleString();
    host.dataset.tracers = String(engine.count);
  };
  const loop = createLoop((_elapsed, delta) => {
    accumulator += delta;
    let stepped = false;
    if (!paused && accumulator >= 1 / 35) {
      if (pointerId !== null) {
        engine.inject({ ...pipette, vx: 0, vy: 0.15, pigment, amount: 0.12, tracers: 22 });
      }
      engine.step(Math.min(accumulator, 0.04));
      accumulator = 0;
      stepped = true;
    }
    if (dirty || stepped) {
      paint();
      dirty = false;
    }
  }, { paused });
  page.onCleanup(loop.destroy);
  const invalidate = () => { dirty = true; loop.requestRender(); };

  function setPaused(value: boolean): void {
    paused = value;
    accumulator = 0;
    play.textContent = value ? 'Play' : 'Pause';
    play.setAttribute('aria-label', value ? 'Play animation' : 'Pause animation');
    state.textContent = value ? 'A still moment' : 'In motion';
    page.root.dataset.motion = value ? 'paused' : 'playing';
    loop.setPaused(value);
    invalidate();
  }

  function endPointer(): void {
    const id = pointerId;
    pointerId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  const inject = (vx = 0.04, vy = 0.35, amount = 0.7) => {
    engine.inject({ ...pipette, vx, vy, amount, pigment, tracers: 110 });
    invalidate();
  };

  function pourRibbon(): void {
    for (let n = 0; n < 7; n++) {
      engine.inject({ x: clamp(pipette.x + Math.sin(n * 0.6) * 0.035, 0.03, 0.97),
        y: clamp(pipette.y + n * 0.014, 0.03, 0.97), vx: Math.cos(n * 0.6) * 0.12,
        vy: 0.38, pigment, amount: 0.65, tracers: 150, radius: 0.026 });
    }
    report.textContent = `${INKS[pigment].name} released.${paused ? ' Play to let the current carry it.' : ' Watch the edges fold into the water.'}`;
    invalidate();
  }

  function reset(): void {
    endPointer();
    engine.seedScene();
    report.textContent = 'The original indigo and madder study is back in the vessel.';
    invalidate();
  }

  canvas.addEventListener('canvasresize', invalidate, { signal: page.signal });
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    endPointer();
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    const point = pointerPosition(event, canvas);
    pipette = { x: clamp(point.x / size.width, 0.03, 0.97), y: clamp(point.y / size.height, 0.03, 0.97) };
    cursorVisible = true;
    inject();
    event.preventDefault();
  }, { signal: page.signal });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerId !== null && pointerId !== event.pointerId) return;
    const point = pointerPosition(event, canvas);
    const next = { x: clamp(point.x / size.width, 0.03, 0.97), y: clamp(point.y / size.height, 0.03, 0.97) };
    const dx = next.x - pipette.x;
    const dy = next.y - pipette.y;
    pipette = next;
    cursorVisible = true;
    if (pointerId !== null) inject(dx * 9, dy * 9 + 0.08, 0.42);
    else invalidate();
  }, { signal: page.signal });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, endPointer, { signal: page.signal });
  }
  canvas.addEventListener('pointerleave', () => {
    if (pointerId === null) { cursorVisible = false; invalidate(); }
  }, { signal: page.signal });
  canvas.addEventListener('focus', () => { cursorVisible = true; invalidate(); }, { signal: page.signal });
  canvas.addEventListener('blur', () => {
    endPointer();
    cursorVisible = false;
    invalidate();
  }, { signal: page.signal });
  canvas.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.06 : 0.02;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (event.key === 'ArrowLeft') pipette.x -= step;
      if (event.key === 'ArrowRight') pipette.x += step;
      if (event.key === 'ArrowUp') pipette.y -= step;
      if (event.key === 'ArrowDown') pipette.y += step;
      pipette.x = clamp(pipette.x, 0.03, 0.97);
      pipette.y = clamp(pipette.y, 0.03, 0.97);
      invalidate();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) pourRibbon();
    } else if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      if (!event.repeat) setPaused(!paused);
    }
  }, { signal: page.signal });
  play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-pour]').addEventListener('click', pourRibbon, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-restore]').addEventListener('click', reset, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-clear]').addEventListener('click', () => {
    endPointer();
    engine.clear();
    report.textContent = 'Clear water. Choose a pigment and pour a fresh ribbon.';
    invalidate();
  }, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-ink]')) {
    button.addEventListener('click', () => {
      const selected = INKS.find((ink) => String(ink.id) === button.dataset.ink);
      if (!selected) throw new Error('The selected pigment is missing.');
      pigment = selected.id;
      for (const option of page.root.querySelectorAll('[data-ink]')) {
        option.setAttribute('aria-pressed', String(option === button));
      }
      report.textContent = `${selected.name} is in the pipette. Existing pigment stays in the water.`;
      invalidate();
    }, { signal: page.signal });
  }
  const viscosity = query<HTMLInputElement>(page.root, '[data-viscosity]');
  viscosity.addEventListener('input', () => {
    const value = viscosity.valueAsNumber;
    engine.viscosity = viscosityFromControl(value);
    query<HTMLOutputElement>(page.root, '[data-viscosity-value]').value = String(value);
    report.textContent = `Viscosity set to ${value} on the artwork's relative scale. New currents will ${value > 55 ? 'settle more softly' : 'keep finer eddies'}.`;
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-print]').addEventListener('click', () => {
    paint(false);
    canvas.toBlob((blob) => {
      if (page.signal.aborted) return;
      if (!blob) {
        report.textContent = 'This browser could not create the print. Please try again.';
        return;
      }
      downloadBlob('ink-in-water.png', blob);
      report.textContent = 'A PNG of this water study has been saved locally.';
    }, 'image/png');
    invalidate();
  }, { signal: page.signal });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });
  page.onCleanup(endPointer);
  setPaused(paused);
  return { destroy: page.destroy, setPaused, reset };
}
