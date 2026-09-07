import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp, lerp } from '../../core/math';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceTabs } from '../../core/workspace';
import {
  BRUSH_DIAMETER, BRUSH_MODES, DEFAULT_WATCH, DISCOVERIES, FAMILY_NAMES,
  MAX_PATCHES, MODE_BY_ID, OBJECTS,
} from './data';
import type { MotionFamily, TimeMode } from './data';
import { fieldDistance, formatRate, rateName, sceneLayout, TimeScene } from './engine';
import type { Point } from './engine';
import { TimeRenderer } from './renderer';

const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const playIcon = icon('<path d="m8 5 11 7-11 7Z"/>');
const pauseIcon = icon('<path d="M8 5v14M16 5v14"/>');
const targetIcon = icon('<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>');

interface PointerStroke {
  pointerId: number;
  group: number;
  mode: TimeMode;
  radius: number;
  last: Point;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'time-brush');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <div class="tb-shell">
      <header class="tb-masthead">
        <div class="tb-overline">
          <span class="tb-brand">${icon('<circle cx="12" cy="12" r="9"/><path d="M12 6v6l-5 3m10 1 4 4"/>')} A small rebellion against the clock</span>
          <span class="tb-edition">No. 34 / Local-time painting</span>
        </div>
        <div class="tb-title-row">
          <h1>Time <em>Brush</em><span aria-hidden="true">↶</span></h1>
          <p>Paint a pocket of different time. Freeze an orbiter, rewind a train, or let the waves race ahead.</p>
        </div>
      </header>

      <section class="tb-workbench" data-project-preview aria-label="Local-time painting workbench">
        <div class="tb-modebar">
          <span class="tb-mode-label">Choose your<br><strong>kind of time.</strong></span>
          <div class="tb-modes" role="group" aria-label="Time brush modes">
            ${BRUSH_MODES.map((mode) => `<button type="button" class="tb-mode" data-mode="${mode.id}"
              aria-pressed="${mode.id === 'freeze'}" aria-label="${mode.name} brush"
              style="--mode-color:${mode.color}">
              <span class="tb-mode-symbol" aria-hidden="true">${mode.symbol}</span>
              <span><strong>${mode.name}</strong><small>${formatRate(mode.rate)}</small></span>
            </button>`).join('')}
          </div>
          <span class="tb-mode-note">Same world.<br>Different seconds.</span>
        </div>

        <div class="tb-screen">
          <div class="tb-screen-bar">
            <span class="tb-run-state" data-run-state><i aria-hidden="true"></i><span data-run-text>Playing</span></span>
            <span class="tb-clock-total">${OBJECTS.length} independent clocks</span>
            <button type="button" class="tb-play" data-action="play" aria-label="Pause scene">${pauseIcon} Pause</button>
          </div>
          <div class="tb-stage" data-time-stage></div>
          <div class="tb-stage-caption">
            <span><i class="tb-normal-dot" aria-hidden="true"></i>Unpainted space runs at 1×</span>
            <output data-region-count aria-live="off">3 / ${MAX_PATCHES} patches</output>
          </div>
          <div class="tb-scene-actions" role="group" aria-label="Scene actions">
            <button type="button" data-action="undo">${icon('<path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12"/>')} Undo stroke</button>
            <button type="button" data-action="clear">${icon('<path d="m4 14 9-10 7 7-9 10H9l-5-7Zm5-5 7 7m-5 5h10"/>')} Clear patches</button>
            <button type="button" data-action="reset">${icon('<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>')} Reset scene</button>
          </div>
        </div>

        <aside class="tb-console" aria-label="Brush and local clock controls">
          <section class="tb-brush-panel">
            <div class="tb-panel-heading"><h2>Your brush</h2><span class="tb-brush-chip" data-brush-chip>Ⅱ Freeze</span></div>
            <p class="tb-brush-description" data-brush-description>${MODE_BY_ID.freeze.description}</p>
            <div class="tb-size-label"><label for="tb-brush-size">Brush diameter</label><output data-brush-size aria-live="off">26%</output></div>
            <input id="tb-brush-size" data-brush-size-input type="range" min="${BRUSH_DIAMETER.min}" max="${BRUSH_DIAMETER.max}"
              value="${BRUSH_DIAMETER.initial}" step="2" aria-describedby="tb-size-help">
            <p id="tb-size-help" class="tb-small">Percentage of the field’s shorter side.</p>
            <div class="tb-aim-readout" id="tb-aim-readout">
              <div><span>At your brush</span><output data-aim-rate aria-live="off">0.00×</output></div>
              <output data-aim-position aria-live="off">Aim 50 / 50</output>
            </div>
            <button type="button" class="tb-stamp" data-action="stamp">${targetIcon}<span data-stamp-label>Stamp Freeze patch</span></button>
            <div class="tb-nudges" role="group" aria-label="Move the brush without painting">
              <button type="button" data-nudge="left" aria-label="Move brush left">←</button>
              <button type="button" data-nudge="up" aria-label="Move brush up">↑</button>
              <button type="button" data-nudge="down" aria-label="Move brush down">↓</button>
              <button type="button" data-nudge="right" aria-label="Move brush right">→</button>
            </div>
            <p class="tb-keyboard-note" id="tb-field-help">Drag to paint, or focus the field: <kbd>↑↓←→</kbd> moves the brush.
              <kbd>Space</kbd> stamps. <kbd>Tab</kbd> leaves.</p>
          </section>
          <section class="tb-watch-panel" aria-labelledby="tb-watch-heading">
            <h2 id="tb-watch-heading">One clock, up close</h2>
            <label class="tb-small" for="tb-watch">Watch an object</label>
            <select id="tb-watch" data-watch>
              ${(Object.keys(FAMILY_NAMES) as MotionFamily[]).map((family) => `<optgroup label="${FAMILY_NAMES[family]}">
                ${OBJECTS.filter((object) => object.family === family).map((object) =>
                  `<option value="${object.id}" ${object.id === DEFAULT_WATCH ? 'selected' : ''}>${escapeMarkup(object.name)}</option>`).join('')}
              </optgroup>`).join('')}
            </select>
            <div class="tb-clock-readings">
              <div><span>Local clock</span><output data-watch-time aria-live="off">+0.00 s</output></div>
              <div><span>Field rate</span><output data-watch-rate aria-live="off">0.00×</output></div>
            </div>
            <div class="tb-watch-state"><span data-watch-state>Frozen</span><span data-scene-state>Scene playing</span></div>
            <button type="button" class="tb-aim-object" data-action="aim">${targetIcon} Aim at this object</button>
            <p class="tb-small tb-clock-note">The field rate belongs to this object’s current position, not the whole scene.</p>
          </section>
        </aside>

        <p class="tb-feedback" data-feedback role="status" aria-live="polite" aria-atomic="true"></p>
      </section>

      <section class="tb-discoveries" aria-labelledby="tb-discover-heading">
        <div class="tb-section-heading"><h2 id="tb-discover-heading">Try a little time mischief.</h2><span>Small experiments, real consequences.</span></div>
        <div class="tb-discovery-grid">
          ${DISCOVERIES.map((discovery, index) => `<button type="button" class="tb-discovery" data-discovery="${discovery.id}"
            style="--discovery-color:${MODE_BY_ID[discovery.mode].color}">
            <span class="tb-discovery-number">0${index + 1}<span aria-hidden="true">${MODE_BY_ID[discovery.mode].symbol}</span></span>
            <span class="tb-discovery-copy"><strong>${discovery.title}</strong><span>${discovery.description}</span></span>
            <span class="tb-discovery-arrow" aria-hidden="true">↗</span>
          </button>`).join('')}
        </div>
      </section>

      <footer class="tb-footer">
        <p><strong>Not a speed slider.</strong> Every shape carries its own clock. Your paint changes the time where it stands.</p>
        <details>
          <summary>How this little universe works</summary>
          <div class="tb-explanation">
            <p>New paint replaces older paint in its solid centre and blends at its soft rim. Empty space is 1×;
              the field always stays between −1× and 3×. At most ${MAX_PATCHES} patches are kept, with the oldest giving way.</p>
            <p>Freeze holds an object’s exact phase. Reverse counts its clock backward, even past zero.
              A reversing object can settle at the zero-speed part of a soft rim: paint over it again to keep rewinding.</p>
            <p>A train’s engine samples the field for all four carriages. Each satellite and each wave bead has a separate clock.
              Clear removes paint without rewinding anything. Reset restores the three starting patches and sets every clock to zero.</p>
            <p>Painting, sizing, aiming, and reset all work while paused. Keyboard: arrows move the aim;
              Shift + arrows moves farther; Space or Enter stamps; 1–4 chooses a mode; [ and ] changes diameter;
              Home centres the aim. Reduced-motion visitors start paused. Nothing is recorded or uploaded.</p>
          </div>
        </details>
      </footer>
    </div>`;

  const consolePanel = query<HTMLElement>(root, '.tb-console');
  const brushPanel = query<HTMLElement>(root, '.tb-brush-panel');
  const watchPanel = query<HTMLElement>(root, '.tb-watch-panel');
  const discoveries = query<HTMLElement>(root, '.tb-discoveries');
  const reference = document.createElement('section');
  reference.className = 'tb-reference';
  reference.setAttribute('aria-label', 'Brush instructions');
  for (const selector of ['.tb-panel-heading', '.tb-brush-description', '#tb-size-help', '.tb-keyboard-note']) {
    reference.append(query<HTMLElement>(brushPanel, selector));
  }
  watchPanel.append(query<HTMLElement>(brushPanel, '.tb-aim-readout'));
  const tabsHost = document.createElement('div');
  const panes = [
    { id: 'brush', label: 'Brush', content: [brushPanel] },
    { id: 'clock', label: 'Clock', content: [watchPanel] },
    { id: 'discover', label: 'Discover', content: [discoveries, reference, query<HTMLElement>(root, '.tb-footer')] },
  ].map(({ id, label, content }) => {
    const panel = document.createElement('div');
    panel.className = 'tb-dock-pane';
    panel.append(...content);
    return { id, label, panel };
  });
  consolePanel.replaceChildren(tabsHost, ...panes.map(pane => pane.panel));
  const workspaceTabs = createWorkspaceTabs(page, {
    id: 'tb-tools', label: 'Time painting tools', host: tabsHost, panes,
    onSelect: () => { finishStroke(false); invalidate(); },
  });

  const stage = query<HTMLElement>(root, '[data-time-stage]');
  const surface = canvas2D(stage, 'Time field painting canvas');
  const { canvas, size } = surface;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-describedby', 'tb-field-help tb-aim-readout');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter');
  canvas.textContent = 'An orbital array, two waves, and four trains. Move the brush with arrow keys and stamp with Space.';
  const scene = new TimeScene(size.width / size.height);
  const renderer = new TimeRenderer(surface.context, size);
  const playButton = query<HTMLButtonElement>(root, '[data-action="play"]');
  const undoButton = query<HTMLButtonElement>(root, '[data-action="undo"]');
  const clearButton = query<HTMLButtonElement>(root, '[data-action="clear"]');
  const sizeInput = query<HTMLInputElement>(root, '[data-brush-size-input]');
  const sizeOutput = query<HTMLOutputElement>(root, '[data-brush-size]');
  const watchSelect = query<HTMLSelectElement>(root, '[data-watch]');
  const watchTime = query<HTMLOutputElement>(root, '[data-watch-time]');
  const watchRate = query<HTMLOutputElement>(root, '[data-watch-rate]');
  const watchState = query<HTMLElement>(root, '[data-watch-state]');
  const sceneState = query<HTMLElement>(root, '[data-scene-state]');
  const aimRate = query<HTMLOutputElement>(root, '[data-aim-rate]');
  const aimPosition = query<HTMLOutputElement>(root, '[data-aim-position]');
  const regionCount = query<HTMLOutputElement>(root, '[data-region-count]');
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const modeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  let mode: TimeMode = 'freeze';
  let radius: number = BRUSH_DIAMETER.initial / 200;
  let watch = DEFAULT_WATCH;
  let aim = { ...scene.inspect(watch).position };
  let showAim = true;
  let paused = context.reducedMotion;
  let stroke: PointerStroke | undefined;
  let loop: ReturnType<typeof createLoop> | undefined;
  let lastReadout = 0;

  const announce = (message: string) => { feedback.textContent = message; };

  function updateReadouts(): void {
    const inspected = scene.inspect(watch);
    const fieldRate = scene.rateAt(aim);
    watchTime.value = `${inspected.time < -0.000001 ? '−' : '+'}${Math.abs(inspected.time).toFixed(2)} s`;
    watchTime.dataset.value = String(inspected.time);
    watchRate.value = formatRate(inspected.rate);
    watchRate.dataset.value = String(inspected.rate);
    watchState.textContent = rateName(inspected.rate);
    sceneState.textContent = paused ? 'Scene paused' : 'Scene playing';
    aimRate.value = formatRate(fieldRate);
    aimRate.dataset.value = String(fieldRate);
    aimPosition.value = `Aim ${Math.round(aim.x * 100)} / ${Math.round(aim.y * 100)}`;
    aimPosition.dataset.x = String(aim.x);
    aimPosition.dataset.y = String(aim.y);
    regionCount.value = `${scene.patches.length} / ${MAX_PATCHES} patches`;
    regionCount.dataset.count = String(scene.patches.length);
    undoButton.disabled = scene.patches.length === 0;
    clearButton.disabled = scene.patches.length === 0;
    root.dataset.paused = String(paused);
    root.dataset.watch = watch;
    lastReadout = performance.now();
  }

  function invalidate(): void {
    updateReadouts();
    loop?.requestRender();
  }

  function selectMode(next: TimeMode): void {
    mode = next;
    const selected = MODE_BY_ID[mode];
    root.style.setProperty('--tb-brush', selected.color);
    root.dataset.mode = mode;
    modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    query<HTMLElement>(root, '[data-brush-chip]').textContent = `${selected.symbol} ${selected.name}`;
    query<HTMLElement>(root, '[data-brush-description]').textContent = selected.description;
    query<HTMLElement>(root, '[data-stamp-label]').textContent = `Stamp ${selected.name} patch`;
    showAim = true;
    invalidate();
  }

  function watchNearest(): void {
    const nearest = scene.nearest(aim);
    if (nearest.distance <= radius) {
      watch = nearest.id;
      watchSelect.value = watch;
    }
  }

  function stampAim(): void {
    finishStroke(false);
    watchNearest();
    scene.stamp(aim, mode, radius);
    showAim = true;
    invalidate();
    announce(`${MODE_BY_ID[mode].name} patch placed at ${Math.round(aim.x * 100)}%, ${Math.round(aim.y * 100)}%. ${paused ? 'Still paused; the field is updated.' : 'Only local clocks are affected.'}`);
  }

  function finishStroke(report = true): void {
    if (!stroke) return;
    const completed = stroke;
    stroke = undefined;
    if (canvas.hasPointerCapture(completed.pointerId)) canvas.releasePointerCapture(completed.pointerId);
    root.classList.remove('tb-painting');
    if (report) announce(`${MODE_BY_ID[completed.mode].name} stroke painted. ${scene.patches.length} of ${MAX_PATCHES} patches in the field.${paused ? ' The scene is still paused.' : ''}`);
  }

  function setPaused(value: boolean): void {
    finishStroke(false);
    paused = value;
    playButton.innerHTML = `${paused ? playIcon : pauseIcon} ${paused ? 'Play' : 'Pause'}`;
    playButton.setAttribute('aria-label', paused ? 'Play scene' : 'Pause scene');
    query<HTMLElement>(root, '[data-run-text]').textContent = paused ? 'Paused' : 'Playing';
    query<HTMLElement>(root, '[data-run-state]').classList.toggle('is-paused', paused);
    loop?.setPaused(paused);
    invalidate();
  }

  function setBrushDiameter(value: number): void {
    const diameter = clamp(value, BRUSH_DIAMETER.min, BRUSH_DIAMETER.max);
    radius = diameter / 200;
    sizeInput.value = String(diameter);
    sizeInput.setAttribute('aria-valuetext', `${diameter} percent of the shorter side`);
    sizeOutput.value = `${diameter}%`;
    invalidate();
  }

  function reset(): void {
    finishStroke(false);
    scene.reset();
    watch = DEFAULT_WATCH;
    watchSelect.value = watch;
    aim = { ...scene.inspect(watch).position };
    setBrushDiameter(BRUSH_DIAMETER.initial);
    selectMode('freeze');
    invalidate();
    announce(`Scene reset. All ${OBJECTS.length} clocks are at zero, with three starter patches. ${paused ? 'Still paused.' : 'Time is playing.'}`);
  }

  function moveAim(dx: number, dy: number, step = 0.025): void {
    const { sx, sy } = sceneLayout(scene.aspect);
    aim = { x: clamp(aim.x + dx * step / sx, 0, 1), y: clamp(aim.y + dy * step / sy, 0, 1) };
    showAim = true;
    invalidate();
  }

  function eventPoint(event: PointerEvent): Point {
    const point = pointerPosition(event, canvas);
    return { x: clamp(point.x / size.width, 0, 1), y: clamp(point.y / size.height, 0, 1) };
  }

  function paintTo(point: Point, endpoint = false): void {
    aim = point;
    if (!stroke) return;
    const distance = fieldDistance(stroke.last, point, scene.aspect);
    const spacing = stroke.radius * 0.38;
    const count = Math.min(192, Math.floor(distance / spacing));
    const start = stroke.last;
    for (let index = 1; index <= count; index++) {
      const t = index * spacing / distance;
      const next = { x: lerp(start.x, point.x, t), y: lerp(start.y, point.y, t) };
      scene.stamp(next, stroke.mode, stroke.radius, stroke.group);
      stroke.last = next;
    }
    if (endpoint && fieldDistance(stroke.last, point, scene.aspect) > spacing * 0.25) {
      scene.stamp(point, stroke.mode, stroke.radius, stroke.group);
      stroke.last = point;
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || stroke) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    aim = eventPoint(event);
    watchNearest();
    stroke = { pointerId: event.pointerId, group: scene.beginStroke(), mode, radius, last: aim };
    canvas.setPointerCapture(event.pointerId);
    scene.stamp(aim, mode, radius, stroke.group);
    showAim = true;
    root.classList.add('tb-painting');
    invalidate();
  }, { signal });

  canvas.addEventListener('pointermove', (event) => {
    if (!event.isPrimary || (stroke && event.pointerId !== stroke.pointerId)) return;
    if (stroke) paintTo(eventPoint(event));
    else aim = eventPoint(event);
    showAim = true;
    invalidate();
  }, { signal });

  canvas.addEventListener('pointerup', (event) => {
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    paintTo(eventPoint(event), true);
    finishStroke();
    invalidate();
  }, { signal });

  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (event) => {
      if (stroke?.pointerId !== event.pointerId) return;
      finishStroke(false);
      invalidate();
    }, { signal });
  }
  canvas.addEventListener('focus', () => { showAim = true; invalidate(); }, { signal });
  canvas.addEventListener('canvasresize', () => {
    finishStroke(false);
    scene.setAspect(size.width / size.height);
    invalidate();
  }, { signal });
  window.addEventListener('blur', () => finishStroke(false), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishStroke(false);
  }, { signal });

  canvas.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const directions: Record<string, readonly number[]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      moveAim(direction[0], direction[1], event.shiftKey ? 0.09 : 0.025);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) stampAim();
    } else if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      selectMode(BRUSH_MODES[Number(event.key) - 1].id);
      announce(`${MODE_BY_ID[mode].name} brush selected.`);
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      setBrushDiameter(Number(sizeInput.value) + (event.key === '[' ? -2 : 2));
    } else if (event.key === 'Home') {
      event.preventDefault();
      aim = { x: 0.5, y: 0.5 };
      showAim = true;
      invalidate();
    } else if (event.key === 'Escape') {
      finishStroke(false);
      showAim = false;
      invalidate();
    }
  }, { signal });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    const nextMode = BRUSH_MODES.find((item) => item.id === button.dataset.mode);
    if (nextMode) {
      selectMode(nextMode.id);
      announce(`${nextMode.name} brush selected. ${nextMode.description}`);
      return;
    }
    const discovery = DISCOVERIES.find((item) => item.id === button.dataset.discovery);
    if (discovery) {
      finishStroke(false);
      watch = discovery.target;
      watchSelect.value = watch;
      aim = { ...scene.inspect(watch).position };
      setBrushDiameter(discovery.radius * 200);
      selectMode(discovery.mode);
      scene.stamp(aim, discovery.mode, discovery.radius);
      workspaceTabs.select('clock');
      invalidate();
      announce(`${discovery.title}: ${scene.inspect(watch).spec.name} now has a ${formatRate(scene.inspect(watch).rate)} field rate.${paused ? ' Press Play to see it move.' : ''}`);
      return;
    }
    if (button.dataset.nudge) {
      const directions: Record<string, readonly number[]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      const direction = directions[button.dataset.nudge];
      if (direction) {
        moveAim(direction[0], direction[1]);
        announce(`Brush aim ${Math.round(aim.x * 100)}%, ${Math.round(aim.y * 100)}%. ${formatRate(scene.rateAt(aim))} at this point.`);
      }
      return;
    }
    switch (button.dataset.action) {
      case 'play':
        setPaused(!paused);
        announce(paused ? 'Scene paused. All brush controls still work.' : 'Scene playing. Each object follows its own local clock.');
        break;
      case 'stamp': stampAim(); break;
      case 'aim':
        aim = { ...scene.inspect(watch).position };
        showAim = true;
        invalidate();
        announce(`Brush aimed at ${scene.inspect(watch).spec.name}. Stamp to apply ${MODE_BY_ID[mode].name.toLowerCase()} time here.`);
        break;
      case 'undo': {
        finishStroke(false);
        const removed = scene.undoStroke();
        invalidate();
        announce(`Removed the last stroke (${removed} ${removed === 1 ? 'patch' : 'patches'}). Local clocks were not reset.`);
        break;
      }
      case 'clear':
        finishStroke(false);
        scene.clearPatches();
        invalidate();
        announce('All patches cleared. Every field rate is 1×; local clocks keep their current values.');
        break;
      case 'reset': reset(); break;
    }
  }, { signal });

  sizeInput.addEventListener('input', () => setBrushDiameter(Number(sizeInput.value)), { signal });
  watchSelect.addEventListener('change', () => {
    watch = watchSelect.value;
    invalidate();
    announce(`Watching ${scene.inspect(watch).spec.name}. Aim at this object to paint its current position.`);
  }, { signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (!event.matches) return;
    setPaused(true);
    announce('Reduced motion is on. The scene is paused; you can still paint.');
  }, { signal });

  page.onCleanup(surface.dispose);
  page.onCleanup(() => renderer.destroy());
  loop = createLoop((_elapsed, delta) => {
    scene.advance(delta, paused);
    renderer.render(scene, { aim, mode, radius, watch, showAim });
    if (performance.now() - lastReadout > 120) updateReadouts();
  }, { paused });
  page.onCleanup(loop.destroy);
  page.onCleanup(() => {
    if (stroke && canvas.hasPointerCapture(stroke.pointerId)) canvas.releasePointerCapture(stroke.pointerId);
    stroke = undefined;
  });
  selectMode(mode);
  setBrushDiameter(BRUSH_DIAMETER.initial);
  setPaused(paused);
  announce(paused
    ? 'Started paused for reduced motion. Paint a little time, then press Play whenever you like.'
    : 'Three little exceptions are already painted. Paint directly over a moving shape to add your own.');

  return { destroy: page.destroy, setPaused, reset };
}
