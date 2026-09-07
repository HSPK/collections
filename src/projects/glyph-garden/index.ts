import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import { createGardenPainter } from './art';
import type { InkStroke } from './art';
import {
  BED_CAPACITY, BEDS, BREEZES, copyGarden, GESTURES, GESTURE_TEMPLATES,
  HISTORY_LIMIT, initialGarden,
} from './data';
import type { BedId, GardenState } from './data';
import { createRecognizer, MATCH_THRESHOLD, MAX_STROKE_POINTS } from './engine';
import type { GestureId, Point, Recognition } from './engine';

interface Drawing {
  pointerId: number;
  points: Point[];
  travel: number;
  outside: boolean;
  tooLong: boolean;
}

const sprout = `<svg viewBox="0 0 48 52" fill="none" aria-hidden="true">
  <path d="M24 45V22M24 32C8 35 4 20 7 12C20 12 27 18 24 32Z" fill="#93a776" stroke="#3e6049" stroke-width="1.8"/>
  <path d="M24 24C21 9 35 3 43 6C44 18 35 27 24 24Z" fill="#d7b56d" stroke="#3e6049" stroke-width="1.8"/>
  <path d="m12 18 12 14M24 24 37 12M15 46h18" stroke="#3e6049" stroke-width="1.5"/>
</svg>`;
const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <path d="M4 12h15m-5-5 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const glyphSvg = (id: GestureId, compact = false) => {
  const glyph = GESTURES.find((item) => item.id === id)!;
  return `<svg viewBox="0 0 94 86" fill="none" aria-hidden="true" ${compact ? 'class="gg-mini-glyph"' : ''}>
    <path d="${glyph.path}" stroke="currentColor" stroke-width="${compact ? 5 : 3}" stroke-linecap="round" stroke-linejoin="round"/>
    ${compact ? '' : `<circle cx="${glyph.start.x}" cy="${glyph.start.y}" r="4.5" fill="#edc16f" stroke="#806a3f" stroke-width="1.5"/>`}
  </svg>`;
};

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'glyph-garden');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <div class="gg-shell">
      <header class="gg-masthead">
        <div class="gg-identity">
          <span class="gg-brand-sprout">${sprout}</span>
          <div>
            <p class="gg-eyebrow">A small growing language</p>
            <h1>Glyph <em>Garden</em></h1>
          </div>
        </div>
        <p class="gg-introduction">A circle, a leaf, a little possibility.<br>
          <span>Draw a mark. See what takes root.</span></p>
        <span class="gg-edition" aria-label="Garden number 32">Nº 032<br><span>est. this moment</span></span>
      </header>

      <div class="gg-workbench" data-project-preview>
        <section class="gg-garden-panel" aria-labelledby="gg-garden-title">
          <div class="gg-stage-top">
            <div>
              <h2 id="gg-garden-title">The listening garden</h2>
              <p>Draw a mark. Lift to grow.</p>
            </div>
            <button type="button" class="gg-motion" data-pause>
              <span data-motion-symbol aria-hidden="true">Ⅱ</span><span data-motion-label>Pause motion</span>
            </button>
          </div>
          <figure class="gg-figure">
            <div class="gg-draw-key" id="gg-drawing-help">
              <span>${glyphSvg('flower', true)} Circle → flower</span>
              <span>${glyphSvg('tree', true)} Chevron → tree</span>
              <span>${glyphSvg('wind', true)} Zigzag → wind</span>
            </div>
            <div class="gg-canvas-wrap" data-garden></div>
          </figure>
          <div class="gg-patch-picker" role="group" aria-label="Choose a planting patch">
            <span class="gg-patch-label">Planting<br>patch</span>
            ${BEDS.map((bed, index) => `<button type="button" data-bed="${bed.id}"
              aria-label="Plant in ${escapeMarkup(bed.name)}" aria-pressed="${bed.id === 'sun'}">
              <span class="gg-patch-number">${index + 1}</span><span>${escapeMarkup(bed.name)}</span>
            </button>`).join('')}
          </div>
        </section>

        <aside class="gg-dock" aria-label="Garden commands and field guide">
          <div data-garden-tabs></div>
          <div class="gg-dock-body">
          <div class="gg-grow" data-grow-panel>
          <div class="gg-commands" role="group" aria-label="Grow with buttons">
            ${GESTURES.map((glyph) => `<button type="button" data-command="${glyph.id}" style="--gg-glyph-ink:${glyph.color}"><span>${escapeMarkup(glyph.action)}</span>${arrow}</button>`).join('')}
          </div>
          <div class="gg-garden-bottom">
            <div class="gg-history" role="group" aria-label="Garden history">
              <button type="button" data-undo disabled aria-keyshortcuts="Control+Z Meta+Z"><span aria-hidden="true">↶</span> Undo</button>
              <button type="button" data-reset disabled>Reset garden</button>
            </div>
          </div>
          <div class="gg-grow-readout" tabindex="0" aria-label="Garden feedback and census">
            <p class="gg-census" aria-live="off">
              <span><strong data-plant-count>9</strong> bed plants</span>
              <span data-breeze>Gentle breeze</span>
              <span data-capacity>3 / 10 in this patch</span>
            </p>
          <div class="gg-feedback" data-feedback data-tone="waiting" role="status" aria-live="polite" aria-atomic="true">
            <span class="gg-feedback-flower" aria-hidden="true">✳</span>
            <div class="gg-feedback-copy">
              <strong data-feedback-title>The garden is listening.</strong>
              <p data-feedback-detail>Try a generous circle. A tap simply chooses the nearest patch.</p>
              <span class="gg-score" data-score>No mark yet · three shapes to discover</span>
            </div>
          </div>
          </div>
          </div>

        <div data-guide-panel tabindex="0">
        <section class="gg-guide" aria-labelledby="gg-guide-title">
          <div class="gg-guide-heading">
            <p class="gg-eyebrow">Your pocket field guide</p>
            <h2 id="gg-guide-title">Three little <em>spells</em></h2>
            <p>One unbroken line. Or one button.<br> Both grow the very same garden.</p>
          </div>
          <div class="gg-spells">
            ${GESTURES.map((glyph, index) => `<article class="gg-spell" style="--gg-glyph-ink:${glyph.color}">
              <div class="gg-spell-top">
                <div class="gg-glyph-example">${glyphSvg(glyph.id)}</div>
                <div>
                  <p class="gg-spell-number">0${index + 1} / ${escapeMarkup(glyph.glyph)}</p>
                  <h3>${escapeMarkup(glyph.name)}</h3>
                </div>
              </div>
              <p class="gg-spell-instruction">${escapeMarkup(glyph.instruction)}</p>
              <p class="gg-spell-description">${escapeMarkup(glyph.description)}</p>
            </article>`).join('')}
          </div>
          <p class="gg-guide-note"><span aria-hidden="true">●</span> The gold dot suggests a starting point.</p>
          <button type="button" data-mechanics>Behind the little magic</button>
          <details class="gg-mechanics" open>
            <summary>Behind the little magic <span aria-hidden="true">+</span></summary>
            <div>
              <p><strong>Geometry, not guesswork.</strong> Your browser compares 64 evenly spaced
                points against a few drawn templates. A match needs at least ${Math.round(MATCH_THRESHOLD * 100)}%
                similarity and a clear lead. A circle also needs to be round and almost closed.</p>
              <p>The percentage is <strong>shape similarity, not a probability</strong>.
                Unrecognized marks do nothing. Try a larger, simpler mark. No AI model,
                uploads, or remote processing are involved.</p>
              <p><strong>Without a pencil:</strong> Tab to any button and use Enter or Space.
                With the garden focused, use <kbd>←</kbd> <kbd>→</kbd> or <kbd>1</kbd>–<kbd>3</kbd>
                to choose a patch; <kbd>F</kbd> plants a flower, <kbd>T</kbd> grows a tree,
                and <kbd>W</kbd> changes the wind. <kbd>Esc</kbd> cancels a mark.
                <kbd>Ctrl/⌘ Z</kbd> undoes a world change.</p>
              <p>Each patch has ten spots. Undo remembers 32 changes, including resets.
                Pause only rests the animation: every command still works.</p>
            </div>
          </details>
          <div class="gg-local-note"><span aria-hidden="true">✧</span>
            <p>Grown on your device.<br><span>Stays for this visit. Refresh to begin anew.</span></p>
          </div>
        </section>
        </div>
        </div>
        </aside>
      </div>
      <footer class="gg-footer">
        <button type="button" data-mechanics>Garden notes</button>
        <p data-motion-note>Let the garden move, or let it rest.</p>
      </footer>
    </div>`;

  query(root, '.gg-guide-heading').after(query(root, '.gg-draw-key'));
  const gardenTabs = createWorkspaceTabs(page, {
    id: 'garden-dock', label: 'Garden tools', host: query(root, '[data-garden-tabs]'),
    panes: [
      { id: 'grow', label: 'Grow', panel: query(root, '[data-grow-panel]') },
      { id: 'guide', label: 'Field guide', panel: query(root, '[data-guide-panel]') },
    ],
  });
  createWorkspaceDialog(page, {
    id: 'garden-notes', title: 'Garden notes',
    content: [query(root, '.gg-mechanics'), query(root, '.gg-local-note')],
    triggers: [...root.querySelectorAll<HTMLElement>('[data-mechanics]')],
  });

  const surface = canvas2D(query(root, '[data-garden]'), 'Living illustrated garden');
  page.onCleanup(surface.dispose);
  const { canvas, size } = surface;
  canvas.classList.add('gg-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-describedby', 'gg-drawing-help');
  canvas.setAttribute('aria-keyshortcuts', 'F T W ArrowLeft ArrowRight 1 2 3 Escape');
  canvas.textContent = 'Draw one circle, chevron, or zigzag. All actions are also available as buttons in the Grow pane.';
  const paint = createGardenPainter(surface.context);
  const recognizer = createRecognizer(GESTURE_TEMPLATES);
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const title = query<HTMLElement>(root, '[data-feedback-title]');
  const detail = query<HTMLElement>(root, '[data-feedback-detail]');
  const scoreLabel = query<HTMLElement>(root, '[data-score]');
  const undoButton = query<HTMLButtonElement>(root, '[data-undo]');
  const resetButton = query<HTMLButtonElement>(root, '[data-reset]');
  const pauseButton = query<HTMLButtonElement>(root, '[data-pause]');
  const count = query<HTMLElement>(root, '[data-plant-count]');
  const breeze = query<HTMLElement>(root, '[data-breeze]');
  const capacity = query<HTMLElement>(root, '[data-capacity]');
  const history: { state: GardenState; label: string }[] = [];
  let state = initialGarden();
  const initialState = JSON.stringify(state);
  let selected: BedId = 'sun';
  let paused = context.reducedMotion;
  let drawing: Drawing | null = null;
  let trail: { points: Point[]; kind: 'matched' | 'rejected'; until: number } | null = null;
  let elapsed = 0;

  const loop = createLoop((time) => {
    elapsed = time;
    let ink: InkStroke | null = null;
    if (drawing) ink = { points: drawing.points, kind: 'drawing', opacity: 1 };
    else if (trail && time < trail.until && !paused) {
      ink = { points: trail.points, kind: trail.kind, opacity: clamp((trail.until - time) / 0.7, 0, 1) };
    } else trail = null;
    paint(size, state, selected, time, ink);
  }, { paused });
  page.onCleanup(loop.destroy);

  function setFeedback(heading: string, text: string, tone = 'waiting', score = 'Button command · no shape matching used') {
    gardenTabs.select('grow');
    title.textContent = heading;
    detail.textContent = text;
    scoreLabel.textContent = score;
    feedback.dataset.tone = tone;
  }

  function selectedBed() { return BEDS.find((bed) => bed.id === selected)!; }

  function syncWorld() {
    const planted = state.plants.filter((plant) => plant.bed === selected).length;
    count.textContent = String(state.plants.length);
    breeze.textContent = BREEZES[state.breeze];
    capacity.textContent = `${planted} / ${BED_CAPACITY} in this patch`;
    undoButton.disabled = history.length === 0;
    resetButton.disabled = JSON.stringify(state) === initialState;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-bed]')) {
      button.setAttribute('aria-pressed', String(button.dataset.bed === selected));
    }
    const flowers = state.plants.filter((plant) => plant.kind === 'flower').length;
    canvas.setAttribute('aria-label', `Living garden: ${flowers} starbell flowers and ${state.plants.length - flowers} ribbonwood trees. ${BREEZES[state.breeze]}. Selected patch: ${selectedBed().name}, ${planted} of ${BED_CAPACITY} spots. Draw a circle, chevron, or zigzag; equivalent buttons follow.`);
    loop.requestRender();
  }

  function remember(label: string) {
    history.push({ state: copyGarden(state), label });
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  function releaseDrawing() {
    if (!drawing) return;
    const id = drawing.pointerId;
    drawing = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function cancelDrawing(message?: string) {
    if (!drawing) return;
    releaseDrawing();
    trail = null;
    if (message) setFeedback('Mark canceled.', message, 'waiting', 'Nothing changed');
    loop.requestRender();
  }

  function chooseBed(id: BedId, announce = true) {
    cancelDrawing();
    selected = id;
    trail = null;
    syncWorld();
    if (announce) setFeedback(`${selectedBed().name} is ready.`,
      'Draw anywhere in the picture. New flowers and trees will grow in this patch.',
      'waiting', 'Patch selected · no plants changed');
  }

  function command(id: GestureId, match?: Recognition) {
    cancelDrawing();
    trail = null;
    const glyph = GESTURES.find((item) => item.id === id)!;
    const similarity = match ? `${(match.score * 100).toFixed(1)}% shape match · ${glyph.glyph.toLowerCase()}` : undefined;
    const bed = selectedBed();
    if (id !== 'wind') {
      const usedSlots = new Set(state.plants.filter((plant) => plant.bed === selected).map((plant) => plant.slot));
      if (usedSlots.size >= BED_CAPACITY) {
        setFeedback('This patch is wonderfully full.',
          `All ${BED_CAPACITY} spots in ${bed.name} are planted. Choose another patch, or Undo to make room.`,
          'waiting', similarity ?? 'Button command · patch capacity reached');
        return;
      }
      let slot = 0;
      while (usedSlots.has(slot)) slot += 1;
      remember(`${id === 'flower' ? 'planting a starbell' : 'growing a ribbonwood'} in ${bed.name}`);
      state.plants.push({
        id: state.nextId, kind: id, bed: selected, slot, variant: state.nextId % 12,
      });
      state.nextId += 1;
      setFeedback(match ? `${glyph.glyph} understood.` : `${id === 'flower' ? 'A starbell' : 'A ribbonwood'} takes root.`,
        `${id === 'flower' ? 'A new starbell flower' : 'A new ribbonwood tree'} in ${bed.name}. ${usedSlots.size + 1} of ${BED_CAPACITY} spots are planted.`,
        'matched', similarity);
    } else {
      remember('changing the breeze');
      state.breeze = (state.breeze + 1) % BREEZES.length;
      setFeedback(match ? 'Zigzag understood.' : 'A little change in the air.',
        `${BREEZES[state.breeze]}. ${paused ? 'Motion is paused; the new wind setting is ready.' : state.breeze ? 'Leaves, pollen, and pond ripples follow the breeze.' : 'The drifting pollen settles; the garden takes a breath.'}`,
        'matched', similarity);
    }
    syncWorld();
  }

  function undo() {
    cancelDrawing();
    const previous = history.pop();
    if (!previous) return;
    state = previous.state;
    trail = null;
    syncWorld();
    setFeedback('One little step back.', `Undid ${previous.label}.`, 'waiting', `${history.length} earlier changes available`);
  }

  function reset() {
    cancelDrawing();
    if (JSON.stringify(state) === initialState) return;
    remember('resetting the garden');
    state = initialGarden();
    trail = null;
    syncWorld();
    setFeedback('Back to the first morning.', 'The original nine plants and gentle breeze are back. You can Undo this reset.',
      'waiting', 'The starting garden · reset is undoable');
  }

  function setPaused(value: boolean) {
    paused = value;
    trail = null;
    root.dataset.paused = String(value);
    query(root, '[data-motion-label]').textContent = value ? 'Resume motion' : 'Pause motion';
    query(root, '[data-motion-symbol]').textContent = value ? '▷' : 'Ⅱ';
    query(root, '[data-motion-note]').textContent = value
      ? 'Motion is resting. Your gestures still grow things.'
      : 'Let the garden move, or let it rest.';
    loop.setPaused(value);
  }

  function appendPoint(event: PointerEvent) {
    if (!drawing) return;
    const raw = pointerPosition(event, canvas);
    if (raw.x < -1 || raw.y < -1 || raw.x > size.width + 1 || raw.y > size.height + 1) drawing.outside = true;
    const point = { x: clamp(raw.x, 0, size.width), y: clamp(raw.y, 0, size.height) };
    const last = drawing.points[drawing.points.length - 1];
    const travel = Math.hypot(point.x - last.x, point.y - last.y);
    if (travel < 1.2) return;
    drawing.travel += travel;
    if (drawing.points.length >= MAX_STROKE_POINTS) {
      drawing.tooLong = true;
      return;
    }
    drawing.points.push(point);
  }

  function rejectMark(result: Recognition) {
    const nearest = GESTURES.find((glyph) => glyph.id === result.nearest);
    const score = nearest ? `Closest: ${nearest.glyph.toLowerCase()} · ${(result.score * 100).toFixed(1)}% shape match` : 'No usable shape score';
    const text = result.reason === 'too-small'
      ? 'Make the mark a little larger, with one unbroken line. A tiny mark is not enough to compare.'
      : result.reason === 'too-long'
        ? 'That mark has too many turns or points. Try one simple circle, chevron, or three-stroke zigzag.'
        : result.reason === 'ambiguous'
          ? 'That mark is between two shapes. Try a clearer circle, upright chevron, or zigzag.'
          : result.reason === 'loop-shape'
            ? 'A circle needs a round, nearly closed loop. Corners and crossing lines are not a match.'
            : 'No clear match. Try a round closed circle, an upright chevron, or a three-stroke zigzag.';
    setFeedback('Not quite a garden glyph.', `${text} Nothing was changed.`, 'rejected', score);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (drawing || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = pointerPosition(event, canvas);
    drawing = { pointerId: event.pointerId, points: [point], travel: 0, outside: false, tooLong: false };
    trail = null;
    canvas.setPointerCapture(event.pointerId);
    loop.requestRender();
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    event.preventDefault();
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const point of coalesced.length ? coalesced : [event]) appendPoint(point);
    loop.requestRender();
  }, { signal });
  canvas.addEventListener('pointerup', (event) => {
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    appendPoint(event);
    const completed = drawing;
    releaseDrawing();
    if (completed.outside) {
      setFeedback('Keep your mark inside the garden.', 'That line crossed the picture’s edge. Nothing was changed.',
        'rejected', 'Mark canceled at the boundary');
    } else if (completed.tooLong) {
      rejectMark({ accepted: false, command: null, nearest: null, score: 0, distance: null, reason: 'too-long' });
    } else if (completed.travel < 8) {
      const point = completed.points[0];
      const nearest = [...BEDS].sort((a, b) =>
        Math.hypot(point.x / size.width - a.x, point.y / size.height - a.y)
        - Math.hypot(point.x / size.width - b.x, point.y / size.height - b.y))[0];
      chooseBed(nearest.id);
    } else {
      const result = recognizer.recognize(completed.points);
      if (result.accepted && result.command) command(result.command, result);
      else rejectMark(result);
      if (!paused) trail = { points: completed.points, kind: result.accepted ? 'matched' : 'rejected', until: elapsed + 0.9 };
    }
    loop.requestRender();
  }, { signal });
  canvas.addEventListener('pointercancel', () => cancelDrawing('The pointer was interrupted. Start a fresh mark when you’re ready.'), { signal });
  canvas.addEventListener('lostpointercapture', () => cancelDrawing('The pointer left the drawing session. Nothing was changed.'), { signal });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  canvas.addEventListener('canvasresize', () => {
    cancelDrawing('The picture changed size. Draw a fresh mark in the resized garden.');
    trail = null;
    loop.requestRender();
  }, { signal });
  window.addEventListener('blur', () => cancelDrawing('The window lost focus. Nothing was changed.'), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelDrawing('The page was put away. Nothing was changed.');
  }, { signal });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-bed]')) {
    button.addEventListener('click', () => chooseBed(button.dataset.bed as BedId), { signal });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-command]')) {
    button.addEventListener('click', () => command(button.dataset.command as GestureId), { signal });
  }
  undoButton.addEventListener('click', undo, { signal });
  resetButton.addEventListener('click', reset, { signal });
  pauseButton.addEventListener('click', () => setPaused(!paused), { signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) setPaused(true);
  }, { signal });
  root.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    if (event.key === 'Escape') {
      if (drawing) event.preventDefault();
      cancelDrawing('Escape put the pencil down. Nothing was changed.');
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (!event.repeat) undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target !== canvas) return;
    const key = event.key.toLowerCase();
    const gesture = GESTURES.find((item) => item.shortcut.toLowerCase() === key);
    if (gesture) {
      event.preventDefault();
      command(gesture.id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const index = BEDS.findIndex((bed) => bed.id === selected);
      chooseBed(BEDS[(index + (event.key === 'ArrowRight' ? 1 : BEDS.length - 1)) % BEDS.length].id);
    } else if (['1', '2', '3'].includes(key)) {
      event.preventDefault();
      chooseBed(BEDS[Number(key) - 1].id);
    }
  }, { signal });
  page.onCleanup(() => {
    releaseDrawing();
    trail = null;
    history.length = 0;
  });
  syncWorld();
  setPaused(paused);
  paint(size, state, selected, 0, null);
  return { destroy: page.destroy, setPaused, reset };
}
