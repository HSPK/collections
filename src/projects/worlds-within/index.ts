import './style.css';
import { canvas2D } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import { portals, worlds } from './data';
import {
  interpolateCamera, leaveFrame, MAX_DEPTH, overview, panBy, portalCamera,
  settleJourney, worldPoint, zoomAt,
} from './engine';
import type { Camera, Journey, Point } from './engine';
import { drawAtlas } from './illustrations';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'worlds-within');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let smooth = !context.reducedMotion;
  let journey: Journey = { camera: { x: 500, y: 350, zoom: 0.96 }, depth: 0 };
  let travel: { from: Camera; to: Camera; elapsed: number } | undefined;
  let describedDepth = -1;
  let tapStart: Point | undefined;
  let tapAllowed = false;
  const pointers = new Map<number, Point>();

  root.innerHTML = `
    <div class="ww-site">
      <header class="ww-header">
        <div class="ww-identity">
          <svg class="ww-mark" viewBox="0 0 58 58" aria-hidden="true"><path d="M3 3h48v48H3z" fill="#e8aa67"/><path d="M15 14h39v39H15z" fill="#c8766c"/><path d="M25 25h29v29H25z" fill="#799daa"/><path d="M34 34h20v20H34z" fill="#f2ddb4"/></svg>
          <div><p class="ww-eyebrow">An atlas without an outside</p><h1>Worlds Within</h1></div>
        </div>
        <p class="ww-header-note">Every picture<br>is another place.</p>
      </header>
      <div class="ww-workspace" data-project-preview>
      <section class="ww-atlas" aria-label="Recursive illustrated atlas">
        <div class="ww-toolbar">
          <div class="ww-current"><span class="ww-eyebrow" data-depth-label>Layer 0 / the beginning</span><h2 data-world-name>The afternoon desk</h2></div>
          <div class="ww-navigation" role="group" aria-label="Atlas navigation">
            <button type="button" data-back disabled aria-label="Back one world">Back</button>
            <button type="button" class="ww-zoom-button" data-out aria-label="Zoom out">-</button>
            <button type="button" class="ww-zoom-button" data-in aria-label="Zoom in">+</button>
            <button type="button" data-reset aria-label="Return to the first desk">Desk</button>
          </div>
        </div>
        <div class="ww-stage" data-stage></div>
        <div class="ww-entry">
          <button type="button" class="ww-enter" data-enter>Enter the postcard <span aria-hidden="true">&rarr;</span></button>
        </div>
      </section>
      <aside class="ww-dock" aria-label="Atlas stories and field notes">
        <div data-atlas-tabs></div>
        <div class="ww-dock-body">
        <div class="ww-story" data-story-panel tabindex="0">
          <p class="ww-eyebrow" data-address></p><p data-story></p>
          <div class="ww-readout">
            <p data-status></p>
            <div><output data-zoom aria-live="off">Scene scale 0.96x</output><button type="button" data-motion aria-pressed="${smooth}">Smooth travel: ${smooth ? 'on' : 'off'}</button></div>
          </div>
        </div>
        <div data-fieldnotes-panel tabindex="0"></div>
        </div>
      </aside>
      </div>
        <div class="ww-instructions" id="ww-controls-help">
          <p>Scroll or pinch to zoom. Drag to wander. Tap the framed picture to enter.</p>
          <p>Keyboard: <kbd>+</kbd> <kbd>-</kbd> zoom, <kbd>Arrows</kbd> pan, <kbd>Enter</kbd> go in, <kbd>Esc</kbd> back.</p>
        </div>
      <section class="ww-fieldnotes" aria-labelledby="ww-note-title">
        <div class="ww-fieldnotes-heading"><p class="ww-eyebrow">Four places / one impossible loop</p><h2 id="ww-note-title">Small is a point of view.</h2></div>
        <ol class="ww-world-list">
          ${worlds.map((world, index) => `<li data-world-card="${world.id}"><span class="ww-world-number">0${index + 1}</span><span class="ww-world-swatch" style="--ww-swatch:${world.color}" aria-hidden="true"></span><h3>${world.name}</h3><p>${['A postcard on a working desk.', 'A room beyond a rose window.', 'An archipelago inside a book.', 'A familiar desk on an island.'][index]}</p></li>`).join('')}
        </ol>
        <details class="ww-mechanics"><summary>A drawn loop, not an infinite universe</summary><p>These four original vector scenes repeat. Each next scene is actually drawn inside its parent's frame, not swapped in by a slideshow. Zoom keeps the point under your cursor in place; crossing a frame only changes the coordinates used to describe the same view. The journey is capped at ${MAX_DEPTH} layers to keep navigation bounded. Everything is local and deterministic, with no generative AI or external imagery.</p><p>Switch smooth travel off for immediate jumps. Wheel zoom, touch, panning, and every navigation control keep working with motion off.</p></details>
      </section>
      <footer class="ww-footer"><span>Drawn from nowhere. Addressed to you.</span><span>A local, repeating atlas / No. 33</span></footer>
      <div class="ww-workspace-footer"><button type="button" data-help>Atlas guide</button><span>Drag to wander. Zoom to discover.</span></div>
      <p class="ww-announcement" role="status" aria-live="polite" aria-atomic="true" data-announcement></p>
    </div>`;

  query(root, '[data-fieldnotes-panel]').append(query(root, '.ww-fieldnotes'));
  createWorkspaceTabs(page, {
    id: 'atlas-dock', label: 'Atlas reading', host: query(root, '[data-atlas-tabs]'),
    panes: [
      { id: 'story', label: 'Story', panel: query(root, '[data-story-panel]') },
      { id: 'notes', label: 'Field notes', panel: query(root, '[data-fieldnotes-panel]') },
    ],
  });
  createWorkspaceDialog(page, {
    id: 'atlas-guide', title: 'Atlas guide',
    content: [query(root, '.ww-instructions'), query(root, '.ww-footer')],
    triggers: [query(root, '[data-help]')],
  });

  const stage = canvas2D(query<HTMLDivElement>(root, '[data-stage]'), 'A desk containing a postcard city, with more illustrated worlds inside.');
  page.onCleanup(stage.dispose);
  stage.canvas.setAttribute('role', 'application');
  stage.canvas.setAttribute('aria-label', 'Recursive world explorer');
  stage.canvas.setAttribute('aria-describedby', 'ww-controls-help');
  stage.canvas.tabIndex = 0;
  const name = query<HTMLElement>(root, '[data-world-name]');
  const depthLabel = query<HTMLElement>(root, '[data-depth-label]');
  const story = query<HTMLElement>(root, '[data-story]');
  const address = query<HTMLElement>(root, '[data-address]');
  const status = query<HTMLElement>(root, '[data-status]');
  const announcement = query<HTMLElement>(root, '[data-announcement]');
  const zoomOutput = query<HTMLOutputElement>(root, '[data-zoom]');
  const enterButton = query<HTMLButtonElement>(root, '[data-enter]');
  const backButton = query<HTMLButtonElement>(root, '[data-back]');
  const motionButton = query<HTMLButtonElement>(root, '[data-motion]');

  function syncView(message?: string): void {
    const world = worlds[journey.depth % worlds.length];
    root.dataset.depth = String(journey.depth);
    root.dataset.world = world.id;
    root.dataset.motion = String(smooth);
    stage.canvas.dataset.cameraX = String(journey.camera.x);
    stage.canvas.dataset.cameraY = String(journey.camera.y);
    stage.canvas.dataset.zoom = String(journey.camera.zoom);
    zoomOutput.value = `Scene scale ${journey.camera.zoom.toFixed(2)}x`;
    backButton.disabled = journey.depth === 0;
    enterButton.disabled = journey.depth === MAX_DEPTH;
    if (journey.depth !== describedDepth) {
      name.textContent = world.name;
      depthLabel.textContent = `Layer ${journey.depth} / ${journey.depth === 0 ? 'the beginning' : journey.depth >= 4 ? 'the loop continues' : 'a little further in'}`;
      story.textContent = world.story;
      address.textContent = world.address;
      enterButton.textContent = journey.depth === MAX_DEPTH ? 'Travel limit reached' : `Enter ${world.object}`;
      root.querySelectorAll<HTMLElement>('[data-world-card]').forEach((card) => {
        card.dataset.current = String(card.dataset.worldCard === world.id);
      });
      status.textContent = journey.depth === MAX_DEPTH
        ? 'You reached the 24-layer travel limit. Go back or return to the first desk.'
        : `You are in ${world.name.toLowerCase()}. The next world is inside ${world.object}.`;
      describedDepth = journey.depth;
    }
    if (message) status.textContent = message;
    if (announcement.textContent !== status.textContent) announcement.textContent = status.textContent;
  }

  const loop = createLoop((_elapsed, delta) => {
    if (travel) {
      travel.elapsed += delta;
      journey.camera = interpolateCamera(travel.from, travel.to, travel.elapsed / 0.75);
      if (travel.elapsed >= 0.75) {
        travel = undefined;
        journey = settleJourney(journey, portals, stage.size);
        loop.setPaused(true);
      }
      syncView();
    }
    drawAtlas(stage.context, stage.size, journey.camera, journey.depth);
  }, { paused: true });
  page.onCleanup(loop.destroy);

  function cancelTravel(): void {
    travel = undefined;
    loop.setPaused(true);
  }

  function finishInput(message?: string): void {
    journey = settleJourney(journey, portals, stage.size);
    syncView(message);
    loop.requestRender();
  }

  function moveTo(camera: Camera): void {
    cancelTravel();
    if (smooth) {
      travel = { from: { ...journey.camera }, to: camera, elapsed: 0 };
      loop.setPaused(false);
    } else {
      journey.camera = camera;
      finishInput();
    }
  }

  function enter(): void {
    cancelTravel();
    if (journey.depth >= MAX_DEPTH) {
      syncView('You reached the 24-layer travel limit. Go back or return to the first desk.');
      return;
    }
    moveTo(portalCamera(portals[journey.depth % portals.length], stage.size));
  }

  function back(): void {
    cancelTravel();
    if (journey.depth === 0) {
      moveTo(overview(stage.size));
      syncView('This is the outermost desk. Zoom into the blue postcard to begin.');
      return;
    }
    journey.depth -= 1;
    journey.camera = leaveFrame(journey.camera, portals[journey.depth % portals.length]);
    syncView();
    moveTo(overview(stage.size, journey.depth > 0));
  }

  function reset(): void {
    cancelTravel();
    journey = { depth: 0, camera: overview(stage.size) };
    finishInput('Back at the first desk. The entire journey happens locally, inside four repeating drawings.');
  }

  function setSmooth(value: boolean): void {
    smooth = value;
    if (!value && travel) {
      journey.camera = travel.to;
      cancelTravel();
      finishInput();
    }
    motionButton.textContent = `Smooth travel: ${value ? 'on' : 'off'}`;
    motionButton.setAttribute('aria-pressed', String(value));
    syncView(value ? 'Button journeys glide. Direct zoom and dragging stay under your control.' : 'Motion off. Navigation now jumps directly; zoom, pan, and pinch still work.');
  }

  function zoom(factor: number, anchor = { x: stage.size.width / 2, y: stage.size.height / 2 }): void {
    cancelTravel();
    journey.camera = zoomAt(journey.camera, factor, anchor, stage.size, journey.depth === 0 ? 0.62 : 0.04);
    finishInput();
  }

  function localPoint(event: { clientX: number; clientY: number }): Point {
    const bounds = stage.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  stage.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.size.height : 1;
    zoom(Math.exp(-clamp(event.deltaY * unit, -170, 170) * 0.004), localPoint(event));
  }, { signal, passive: false });
  stage.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointers.size >= 2) return;
    event.preventDefault();
    cancelTravel();
    if (pointers.size === 0) {
      tapStart = localPoint(event);
      tapAllowed = true;
    } else {
      tapAllowed = false;
    }
    pointers.set(event.pointerId, localPoint(event));
    stage.canvas.setPointerCapture(event.pointerId);
    stage.canvas.focus({ preventScroll: true });
    stage.canvas.classList.add('ww-dragging');
  }, { signal });
  stage.canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const point = localPoint(event);
    if (tapStart && Math.hypot(point.x - tapStart.x, point.y - tapStart.y) > 6) tapAllowed = false;
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    pointers.set(event.pointerId, point);
    if (other) {
      const previousCentre = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const nextCentre = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
      journey.camera = panBy(journey.camera, { x: nextCentre.x - previousCentre.x, y: nextCentre.y - previousCentre.y }, stage.size);
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      const previousDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      if (distance > 4 && previousDistance > 4) {
        journey.camera = zoomAt(journey.camera, distance / previousDistance, nextCentre, stage.size, journey.depth === 0 ? 0.62 : 0.04);
      }
    } else {
      journey.camera = panBy(journey.camera, { x: point.x - previous.x, y: point.y - previous.y }, stage.size);
    }
    finishInput();
  }, { signal });

  function releasePointer(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    const tap = tapAllowed && pointers.size === 1 && event.type === 'pointerup';
    pointers.delete(event.pointerId);
    if (stage.canvas.hasPointerCapture(event.pointerId)) stage.canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) {
      stage.canvas.classList.remove('ww-dragging');
      tapStart = undefined;
      tapAllowed = false;
    }
    if (tap) {
      const point = worldPoint(journey.camera, localPoint(event), stage.size);
      const portal = portals[journey.depth % portals.length];
      if (point.x >= portal.x && point.x <= portal.x + portal.width && point.y >= portal.y && point.y <= portal.y + portal.height) enter();
    }
  }
  stage.canvas.addEventListener('pointerup', releasePointer, { signal });
  stage.canvas.addEventListener('pointercancel', releasePointer, { signal });
  stage.canvas.addEventListener('lostpointercapture', releasePointer, { signal });

  function clearPointers(): void {
    const captured = [...pointers.keys()];
    pointers.clear();
    tapStart = undefined;
    tapAllowed = false;
    stage.canvas.classList.remove('ww-dragging');
    for (const id of captured) if (stage.canvas.hasPointerCapture(id)) stage.canvas.releasePointerCapture(id);
  }
  page.onCleanup(clearPointers);
  window.addEventListener('blur', clearPointers, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPointers(); }, { signal });
  stage.canvas.addEventListener('canvasresize', () => {
    cancelTravel();
    finishInput();
  }, { signal });
  stage.canvas.addEventListener('keydown', (event) => {
    const moves: Record<string, Point> = {
      ArrowLeft: { x: 55, y: 0 }, ArrowRight: { x: -55, y: 0 },
      ArrowUp: { x: 0, y: 55 }, ArrowDown: { x: 0, y: -55 },
    };
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.45); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoom(1 / 1.45); }
    else if (event.key === 'Enter') { event.preventDefault(); enter(); }
    else if (event.key === 'Escape' || event.key === 'Backspace') { event.preventDefault(); back(); }
    else if (event.key === 'Home') { event.preventDefault(); reset(); }
    else if (moves[event.key]) {
      event.preventDefault();
      cancelTravel();
      journey.camera = panBy(journey.camera, moves[event.key], stage.size);
      finishInput();
    }
  }, { signal });
  enterButton.addEventListener('click', enter, { signal });
  backButton.addEventListener('click', back, { signal });
  query<HTMLButtonElement>(root, '[data-in]').addEventListener('click', () => zoom(1.5), { signal });
  query<HTMLButtonElement>(root, '[data-out]').addEventListener('click', () => zoom(1 / 1.5), { signal });
  query<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', reset, { signal });
  motionButton.addEventListener('click', () => setSmooth(!smooth), { signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) setSmooth(false);
  }, { signal });

  journey.camera = overview(stage.size);
  syncView();
  drawAtlas(stage.context, stage.size, journey.camera, journey.depth);
  return { destroy: page.destroy, setPaused: (paused) => setSmooth(!paused), reset };
}
