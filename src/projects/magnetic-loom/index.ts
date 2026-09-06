import './style.css';
import { canvas2D } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { FILING_COUNT, NOTES, PALETTE } from './data';
import { LoomEngine } from './engine';
import { createLoomRenderer, projectionFor } from './renderer';

const mark = `<svg viewBox="0 0 42 48" fill="none" aria-hidden="true"><path d="M8 37C-3 17 11 2 21 5c10-3 24 12 13 32M13 34C4 17 15 9 21 12c6-3 17 5 8 22M18 31c-6-10 0-14 3-13 3-1 9 3 3 13" stroke="currentColor" stroke-width="1.1"/><path d="M12 34h9v10h-9z" fill="#426f77"/><path d="M21 34h9v10h-9z" fill="#b64e42"/></svg>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'magnetic-loom');
  page.root.setAttribute('aria-labelledby', 'ml-title');
  page.root.innerHTML = `
    <header class="ml-header">
      <div class="ml-brand">
        <div class="ml-mark">${mark}</div>
        <div><p class="ml-kicker">No. 045 / Particle study</p><h1 id="ml-title">Magnetic Loom</h1></div>
      </div>
      <p class="ml-deck">Iron filings. Invisible forces.<br>Make a small change. Follow the field.</p>
    </header>
    <div class="ml-workspace" data-project-preview>
      <section class="ml-plate" aria-label="Magnetic filing workspace">
        <div class="ml-bed-heading">
          <span><span class="ml-section-number">01</span> The field bed</span>
          <span class="ml-material">Fe <span aria-hidden="true">/</span> ${FILING_COUNT.toLocaleString('en-US')} filings</span>
        </div>
        <div class="ml-bed" data-loom-bed>
          <button class="ml-magnet" type="button" data-magnet-handle="0" aria-label="Magnet A, drag to move" aria-pressed="true">
            <span data-negative-pole>S</span><span class="ml-magnet-id">A</span><span data-positive-pole>N</span>
          </button>
          <button class="ml-magnet" type="button" data-magnet-handle="1" aria-label="Magnet B, drag to move" aria-pressed="false">
            <span data-negative-pole>S</span><span class="ml-magnet-id">B</span><span data-positive-pole>N</span>
          </button>
        </div>
        <div class="ml-bed-footer">
          <p>Drag to move <span aria-hidden="true">·</span> Shift-drag to turn</p>
          <div class="ml-pole-key"><span><i class="ml-north"></i>N <span class="ml-key-word">north</span></span><span><i class="ml-south"></i>S <span class="ml-key-word">south</span></span></div>
        </div>
      </section>
      <aside class="ml-tools" aria-label="Magnetic Loom controls">
        <section class="ml-magnet-tools" aria-labelledby="ml-tools-heading">
          <div class="ml-tool-heading"><p class="ml-kicker">02 / Field tools</p><span class="ml-motion" data-motion-label>Live</span></div>
          <h2 id="ml-tools-heading">Shape the field</h2>
          <div class="ml-selectors" aria-label="Choose a magnet">
            <button class="ml-selector" type="button" data-select-magnet="0" aria-label="Select magnet A" aria-pressed="true">
              <span>Magnet A</span><span class="ml-mini-poles" data-mini-poles="0"><i>S</i><i>N</i></span>
            </button>
            <button class="ml-selector" type="button" data-select-magnet="1" aria-label="Select magnet B" aria-pressed="false">
              <span>Magnet B</span><span class="ml-mini-poles" data-mini-poles="1"><i>S</i><i>N</i></span>
            </button>
          </div>
          <output class="ml-position" data-position aria-label="Selected magnet coordinates"></output>
          <div class="ml-label-row"><label for="ml-angle">Angle</label><output for="ml-angle" data-angle-output></output></div>
          <div class="ml-angle-control">
            <button class="ml-square" type="button" data-turn="-15" aria-label="Rotate left 15 degrees">↶</button>
            <input id="ml-angle" type="range" min="-180" max="180" step="1" value="-28" aria-label="Magnet angle">
            <button class="ml-square" type="button" data-turn="15" aria-label="Rotate right 15 degrees">↷</button>
          </div>
          <div class="ml-label-row"><span>Nudge</span><span class="ml-small-note">Shift + arrows: ×3</span></div>
          <div class="ml-nudges">
            <button class="ml-square" type="button" data-move="-10,0" aria-label="Move magnet left">←</button>
            <button class="ml-square" type="button" data-move="0,-10" aria-label="Move magnet up">↑</button>
            <button class="ml-square" type="button" data-move="0,10" aria-label="Move magnet down">↓</button>
            <button class="ml-square" type="button" data-move="10,0" aria-label="Move magnet right">→</button>
          </div>
          <button class="ml-control ml-flip" type="button" data-flip aria-label="Flip pole"><span aria-hidden="true">⇄</span> Flip pole <span class="ml-flip-hint" aria-hidden="true">N ↔ S</span></button>
          <p class="ml-keyboard-note" id="ml-keyboard-help">Focus the bed or select a magnet, then use arrow keys to move it. Space on the bed pauses. [ and ] turn; F flips.</p>
        </section>
        <section class="ml-bed-tools" aria-label="Filing bed controls">
          <p class="ml-kicker">03 / The filings</p>
          <label class="ml-traces"><input type="checkbox" data-traces checked><span>Show field traces</span><span class="ml-trace-line" aria-hidden="true"></span></label>
          <div class="ml-transport">
            <button class="ml-control ml-play" type="button" data-play aria-label="Pause animation"><span data-play-icon aria-hidden="true">Ⅱ</span><span data-play-text>Pause</span></button>
            <button class="ml-control" type="button" data-shake><span aria-hidden="true">∿</span> Shake bed</button>
          </div>
          <button class="ml-reset" type="button" data-reset><span aria-hidden="true">↺</span> Reset arrangement</button>
          <p class="ml-status" role="status" aria-live="polite" data-report>A bridge between unlike poles. Move a magnet to loosen the weave.</p>
        </section>
      </aside>
    </div>
    <section class="ml-notes" aria-label="Field notes">
      ${NOTES.map((note) => `<article><span class="ml-note-number">${note.number}</span><div><h2>${escapeMarkup(note.title)}</h2><p>${escapeMarkup(note.text)}</p></div></article>`).join('')}
    </section>
    <footer class="ml-colophon"><span>Soft-pole approximation / locally rendered</span><span>Magnetic Loom — 045</span></footer>`;

  try {
    const bed = query<HTMLElement>(page.root, '[data-loom-bed]');
    const status = query<HTMLElement>(page.root, '[data-report]');
    const play = query<HTMLButtonElement>(page.root, '[data-play]');
    const playIcon = query<HTMLElement>(page.root, '[data-play-icon]');
    const playText = query<HTMLElement>(page.root, '[data-play-text]');
    const motionLabel = query<HTMLElement>(page.root, '[data-motion-label]');
    const angle = query<HTMLInputElement>(page.root, '#ml-angle');
    const angleOutput = query<HTMLOutputElement>(page.root, '[data-angle-output]');
    const position = query<HTMLOutputElement>(page.root, '[data-position]');
    const traces = query<HTMLInputElement>(page.root, '[data-traces]');
    const handles = [...page.root.querySelectorAll<HTMLButtonElement>('[data-magnet-handle]')];
    const selectors = [...page.root.querySelectorAll<HTMLButtonElement>('[data-select-magnet]')];
    const miniPoles = [...page.root.querySelectorAll<HTMLElement>('[data-mini-poles]')];
    const engine = new LoomEngine();
    const surface = canvas2D(bed, 'Iron filings following the field of two movable magnets');
    page.onCleanup(surface.dispose);
    surface.canvas.tabIndex = 0;
    surface.canvas.setAttribute('aria-describedby', 'ml-keyboard-help');
    surface.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Space [ ] f');
    const renderer = createLoomRenderer(surface, engine);
    page.onCleanup(renderer.dispose);
    let selected = 0;
    let paused = context.reducedMotion;
    let accumulated = 0;
    let dirty = true;
    let drag: {
      pointerId: number;
      index: number;
      offsetX: number;
      offsetY: number;
      initialPolar: number;
      initialAngle: number;
      rotating: boolean;
    } | undefined;

    const loop = createLoop((_elapsed, delta) => {
      if (delta > 0) {
        accumulated += delta;
        if (accumulated < 1 / 30 && !dirty) return;
        engine.step(accumulated);
      }
      accumulated = 0;
      renderer.draw(traces.checked);
      dirty = false;
    }, { paused });
    page.onCleanup(loop.destroy);
    page.onCleanup(() => {
      if (drag && bed.hasPointerCapture(drag.pointerId)) bed.releasePointerCapture(drag.pointerId);
      drag = undefined;
    });

    function renderSoon(): void {
      dirty = true;
      loop.requestRender();
    }

    function updateControls(): void {
      const active = engine.magnets[selected];
      const degrees = Math.round(active.angle * 180 / Math.PI);
      angle.value = String(degrees);
      angleOutput.value = `${degrees}°`;
      position.value = `${active.id}  /  x ${Math.round(active.x)}  ·  y ${Math.round(active.y)}`;
      const view = projectionFor(surface.size.width, surface.size.height);
      engine.magnets.forEach((magnet, index) => {
        const northOnRight = magnet.polarity === 1;
        const handle = handles[index];
        handle.style.left = `${view.x + magnet.x * view.scale}px`;
        handle.style.top = `${view.y + magnet.y * view.scale}px`;
        handle.style.width = `${Math.max(76, 128 * view.scale)}px`;
        handle.style.transform = `translate(-50%, -50%) rotate(${magnet.angle}rad)`;
        handle.style.setProperty('--ml-negative', northOnRight ? PALETTE.south : PALETTE.north);
        handle.style.setProperty('--ml-positive', northOnRight ? PALETTE.north : PALETTE.south);
        handle.dataset.polarity = String(magnet.polarity);
        handle.setAttribute('aria-pressed', String(index === selected));
        handle.setAttribute('aria-label', `Magnet ${magnet.id}, ${northOnRight ? 'south to north' : 'north to south'}. Drag to move.`);
        query<HTMLElement>(handle, '[data-negative-pole]').textContent = northOnRight ? 'S' : 'N';
        query<HTMLElement>(handle, '[data-positive-pole]').textContent = northOnRight ? 'N' : 'S';
        selectors[index].setAttribute('aria-pressed', String(index === selected));
        miniPoles[index].dataset.reversed = String(!northOnRight);
        miniPoles[index].children[0].textContent = northOnRight ? 'S' : 'N';
        miniPoles[index].children[1].textContent = northOnRight ? 'N' : 'S';
      });
    }

    function updatePlayback(): void {
      play.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
      playIcon.textContent = paused ? '▶' : 'Ⅱ';
      playText.textContent = paused ? 'Play' : 'Pause';
      motionLabel.textContent = paused ? 'Paused' : 'Live';
      page.root.dataset.motion = paused ? 'paused' : 'playing';
    }

    function setPaused(value: boolean): void {
      paused = value;
      accumulated = 0;
      loop.setPaused(value);
      updatePlayback();
      renderSoon();
      status.textContent = paused
        ? 'Paused. Filings and settling are still; you can continue editing the field.'
        : 'Live. Move a magnet, or shake the bed and watch the filings find their way.';
    }

    function selectMagnet(index: number): void {
      selected = index;
      updateControls();
      status.textContent = `Magnet ${engine.magnets[index].id} selected. Drag it, use the arrow keys, or turn the angle control.`;
    }

    function moveMagnet(dx: number, dy: number): void {
      const magnet = engine.magnets[selected];
      engine.setMagnet(selected, { x: magnet.x + dx, y: magnet.y + dy }, paused);
      updateControls();
      renderSoon();
      status.textContent = `Magnet ${magnet.id}: x ${Math.round(magnet.x)}, y ${Math.round(magnet.y)}.`;
    }

    function turnMagnet(degrees: number): void {
      engine.setMagnet(selected, { angle: degrees * Math.PI / 180 }, paused);
      updateControls();
      renderSoon();
      status.textContent = `Magnet ${engine.magnets[selected].id} turned to ${angleOutput.value}.`;
    }

    function flipMagnet(): void {
      const magnet = engine.magnets[selected];
      engine.setMagnet(selected, { polarity: magnet.polarity === 1 ? -1 : 1 }, paused);
      updateControls();
      renderSoon();
      status.textContent = `Magnet ${magnet.id} flipped. North and south trade places; the combined field changes.`;
    }

    function reset(): void {
      engine.reset();
      selected = 0;
      updateControls();
      renderSoon();
      status.textContent = 'The original bridge is restored, with every filing settled on the paper.';
    }

    function worldPoint(event: PointerEvent) {
      const bounds = bed.getBoundingClientRect();
      const view = projectionFor(surface.size.width, surface.size.height);
      return {
        x: (event.clientX - bounds.left - view.x) / view.scale,
        y: (event.clientY - bounds.top - view.y) / view.scale,
      };
    }

    selectors.forEach((button, index) => {
      button.addEventListener('click', () => selectMagnet(index), { signal: page.signal });
    });
    handles.forEach((button, index) => {
      button.addEventListener('click', () => selectMagnet(index), { signal: page.signal });
    });
    angle.addEventListener('input', () => turnMagnet(Number(angle.value)), { signal: page.signal });
    page.root.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach((button) => {
      button.addEventListener('click', () => {
        turnMagnet(engine.magnets[selected].angle * 180 / Math.PI + Number(button.dataset.turn));
      }, { signal: page.signal });
    });
    page.root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      button.addEventListener('click', () => {
        const [dx, dy] = button.dataset.move!.split(',').map(Number);
        moveMagnet(dx, dy);
      }, { signal: page.signal });
    });
    query<HTMLButtonElement>(page.root, '[data-flip]').addEventListener('click', flipMagnet, { signal: page.signal });
    query<HTMLButtonElement>(page.root, '[data-reset]').addEventListener('click', reset, { signal: page.signal });
    query<HTMLButtonElement>(page.root, '[data-shake]').addEventListener('click', () => {
      engine.shake();
      renderSoon();
      status.textContent = paused
        ? 'The bed is shaken and held still. Press Play to let the filings settle.'
        : 'A little disorder. Watch the filings settle back along the field.';
    }, { signal: page.signal });
    play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
    traces.addEventListener('change', renderSoon, { signal: page.signal });

    bed.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-magnet-handle]') : null;
      if (!target) {
        surface.canvas.focus({ preventScroll: true });
        return;
      }
      event.preventDefault();
      const index = Number(target.dataset.magnetHandle);
      selectMagnet(index);
      target.focus({ preventScroll: true });
      const point = worldPoint(event);
      const magnet = engine.magnets[index];
      drag = {
        pointerId: event.pointerId,
        index,
        offsetX: point.x - magnet.x,
        offsetY: point.y - magnet.y,
        initialPolar: Math.atan2(point.y - magnet.y, point.x - magnet.x),
        initialAngle: magnet.angle,
        rotating: event.shiftKey,
      };
      bed.setPointerCapture(event.pointerId);
      bed.classList.add('ml-is-dragging');
    }, { signal: page.signal });
    bed.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const point = worldPoint(event);
      const magnet = engine.magnets[drag.index];
      if (drag.rotating) {
        const polar = Math.atan2(point.y - magnet.y, point.x - magnet.x);
        engine.setMagnet(drag.index, { angle: drag.initialAngle + polar - drag.initialPolar }, paused);
      } else {
        engine.setMagnet(drag.index, { x: point.x - drag.offsetX, y: point.y - drag.offsetY }, paused);
      }
      updateControls();
      renderSoon();
    }, { signal: page.signal });
    const endDrag = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const magnet = engine.magnets[drag.index];
      status.textContent = `Magnet ${magnet.id} placed. ${paused ? 'Field alignment updated; settling stays paused.' : 'The filings are finding their new alignment.'}`;
      drag = undefined;
      bed.classList.remove('ml-is-dragging');
      if (bed.hasPointerCapture(event.pointerId)) bed.releasePointerCapture(event.pointerId);
    };
    bed.addEventListener('pointerup', endDrag, { signal: page.signal });
    bed.addEventListener('pointercancel', endDrag, { signal: page.signal });
    bed.addEventListener('lostpointercapture', () => {
      drag = undefined;
      bed.classList.remove('ml-is-dragging');
    }, { signal: page.signal });

    page.root.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || event.altKey || event.metaKey || event.ctrlKey) return;
      const handle = target.closest<HTMLButtonElement>('[data-magnet-handle], [data-select-magnet]');
      if (target !== surface.canvas && !handle) return;
      if (handle) selected = Number(handle.dataset.magnetHandle ?? handle.dataset.selectMagnet);
      const distance = event.shiftKey ? 30 : 10;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-distance, 0],
        ArrowRight: [distance, 0],
        ArrowUp: [0, -distance],
        ArrowDown: [0, distance],
      };
      if (moves[event.key]) {
        event.preventDefault();
        moveMagnet(...moves[event.key]);
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        turnMagnet(engine.magnets[selected].angle * 180 / Math.PI + (event.key === '[' ? -15 : 15));
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        flipMagnet();
      } else if (event.code === 'Space' && target === surface.canvas) {
        event.preventDefault();
        setPaused(!paused);
      }
    }, { signal: page.signal });
    surface.canvas.addEventListener('canvasresize', () => {
      updateControls();
      renderSoon();
    }, { signal: page.signal });
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });

    updateControls();
    updatePlayback();
    if (paused) status.textContent = 'A settled, still field for reduced motion. Edit freely, or press Play to let filings move.';
    renderer.draw(traces.checked);
    return { destroy: page.destroy, setPaused, reset };
  } catch (error) {
    page.destroy();
    throw error;
  }
}
