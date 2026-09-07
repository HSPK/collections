import './style.css';
import { canvas2D, pointerPosition } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import { arrangements } from './data';
import { alignment, boundedLamp, LAMP_LIMITS, tablePoint } from './engine';
import type { Lamp } from './engine';
import { drawTable } from './renderer';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'shadow-play');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let arrangement = arrangements[0];
  let lamp: Lamp = { ...arrangement.start };
  let tracing = true;
  let rays = false;
  let station = false;
  let drifting = false;
  let driftTime = 0;
  let activePointer: number | undefined;
  let wasFound = false;
  const discoveries = new Set<string>();

  root.innerHTML = `
    <div class="shadow-site">
      <header class="shadow-header">
        <div><p class="shadow-kicker">A small study in light / No. 31</p><h1>Shadow Play<span aria-hidden="true">.</span></h1></div>
        <p>Move one light.<br> Find what the paper leaves behind.</p>
      </header>
      <div class="shadow-workbench" data-project-preview>
        <section class="shadow-table-section" aria-label="Interactive light table">
          <div class="shadow-table-heading">
            <span><i aria-hidden="true"></i> The light table</span>
            <button type="button" data-drift aria-pressed="false">Drift light</button>
          </div>
          <div class="shadow-table" data-table></div>
          <div class="shadow-table-footer">
            <p><span class="shadow-dot shadow-dot-lamp" aria-hidden="true"></span>Drag anywhere to move the lamp.</p>
            <p><kbd>Arrows</kbd> move <span class="shadow-fine">/ <kbd>Shift</kbd> for fine steps</span></p>
          </div>
        </section>
        <aside class="shadow-inspector" aria-label="Arrangements and lamp controls">
          <div data-shadow-tabs></div>
          <div class="shadow-dock-body">
          <div data-shadow-studies tabindex="0">
          <div class="shadow-inspector-title"><span>Paper studies</span><span data-discoveries>0 / 3 found</span></div>
          <div class="shadow-arrangements" role="group" aria-label="Choose an arrangement">
            ${arrangements.map((item, index) => `<button type="button" data-arrangement="${item.id}" aria-pressed="${index === 0}">
              <span>${item.number}</span>${item.name}<span class="shadow-discovered" data-found="${item.id}" aria-hidden="true"></span>
            </button>`).join('')}
          </div>
          <section class="shadow-discovery" aria-labelledby="shadow-invitation">
            <p class="shadow-kicker">The discovery</p>
            <h2 id="shadow-invitation" data-invitation></h2>
            <p data-clue></p>
            <div class="shadow-match"><span data-match>Shadows apart</span><output data-percent aria-live="off">0%</output></div>
            <meter data-alignment min="0" max="100" value="0" aria-label="Shadow alignment">0%</meter>
            <p class="shadow-message" data-message>Follow the dotted silhouettes, or explore without them.</p>
          </section>
          </div>
          <div data-shadow-lamp>
          <fieldset class="shadow-lamp-controls">
            <legend>Lamp position</legend>
            <div class="shadow-axis-label"><label for="shadow-x">Left / right</label><output data-x-value aria-live="off" aria-hidden="true"></output></div>
            <input id="shadow-x" data-axis="x" type="range" min="${LAMP_LIMITS.left}" max="${LAMP_LIMITS.right}" step="1" value="${lamp.x}">
            <div class="shadow-axis-label"><label for="shadow-y">Back / front</label><output data-y-value aria-live="off" aria-hidden="true"></output></div>
            <input id="shadow-y" data-axis="y" type="range" min="${LAMP_LIMITS.top}" max="${LAMP_LIMITS.bottom}" step="1" value="${lamp.y}">
            <div class="shadow-axis-label"><label for="shadow-z">Height above table</label><output data-z-value aria-live="off" aria-hidden="true"></output></div>
            <input id="shadow-z" data-axis="z" type="range" min="${LAMP_LIMITS.low}" max="${LAMP_LIMITS.high}" step="1" value="${lamp.z}">
          </fieldset>
          <div class="shadow-switches">
            <label><input type="checkbox" data-tracing checked> Dotted tracing</label>
            <label><input type="checkbox" data-rays> Light rays</label>
          </div>
          <div class="shadow-tools">
            <button type="button" data-hint aria-pressed="false">Show lamp guide</button>
            <button type="button" data-reset>Reset lamp</button>
          </div>
          </div>
          </div>
        </aside>
      </div>
      <section class="shadow-notes" aria-label="How the light table works">
        <div class="shadow-note-lead"><p class="shadow-kicker">Not a drop shadow</p><h2>A little geometry.<br> A lot of possibility.</h2></div>
        <div><h3>Paper suspended in space</h3><p>The pale shapes sit at different heights. Each charcoal outline is projected from the amber point light onto the table. Lift the lamp and shadows shrink; lower it and they stretch.</p></div>
        <div><h3>Three things to discover</h3><p>A boat, a bird, and an empty diamond. Alignment measures the actual projected outlines against their design, not a mouse hotspot. Everything runs locally; nothing here uses AI.</p><p class="shadow-object-list" data-pieces></p></div>
      </section>
      <footer class="shadow-footer"><span>Original paper constructions / an interactive light study</span><span>Ivory is paper. Charcoal is its absence of light.</span></footer>
      <div class="shadow-workspace-footer"><button type="button" data-notes>Table notes</button><span>Paper, light, and a little geometry.</span></div>
      <p class="shadow-announcement" role="status" aria-live="polite" aria-atomic="true" data-announcement></p>
    </div>`;

  query(root, '[data-shadow-studies]').append(query(root, '.shadow-switches'));
  createWorkspaceTabs(page, {
    id: 'shadow-dock', label: 'Light table controls', host: query(root, '[data-shadow-tabs]'),
    panes: [
      { id: 'lamp', label: 'Lamp', panel: query(root, '[data-shadow-lamp]') },
      { id: 'studies', label: 'Studies', panel: query(root, '[data-shadow-studies]') },
    ],
  });
  createWorkspaceDialog(page, {
    id: 'shadow-notes', title: 'Table notes',
    content: [query(root, '.shadow-notes'), query(root, '.shadow-footer')],
    triggers: [query(root, '[data-notes]')],
  });

  const surface = query<HTMLDivElement>(root, '[data-table]');
  const stage = canvas2D(surface, 'Light table. Pale raised paper, charcoal projected shadows, and a movable amber lamp.');
  page.onCleanup(stage.dispose);
  stage.canvas.tabIndex = 0;
  stage.canvas.setAttribute('aria-label', 'Move the lamp with arrow keys, or drag anywhere on this light table. Hold Shift for smaller steps.');
  stage.canvas.setAttribute('aria-describedby', 'shadow-invitation');
  const xInput = query<HTMLInputElement>(root, '[data-axis="x"]');
  const yInput = query<HTMLInputElement>(root, '[data-axis="y"]');
  const zInput = query<HTMLInputElement>(root, '[data-axis="z"]');
  const xValue = query<HTMLOutputElement>(root, '[data-x-value]');
  const yValue = query<HTMLOutputElement>(root, '[data-y-value]');
  const zValue = query<HTMLOutputElement>(root, '[data-z-value]');
  const meter = query<HTMLMeterElement>(root, '[data-alignment]');
  const percent = query<HTMLOutputElement>(root, '[data-percent]');
  const match = query<HTMLElement>(root, '[data-match]');
  const message = query<HTMLElement>(root, '[data-message]');
  const announcement = query<HTMLElement>(root, '[data-announcement]');
  const driftButton = query<HTMLButtonElement>(root, '[data-drift]');
  const hintButton = query<HTMLButtonElement>(root, '[data-hint]');
  const foundCount = query<HTMLElement>(root, '[data-discoveries]');

  function announce(text: string): void {
    message.textContent = text;
    announcement.textContent = text;
  }

  function render(): void {
    drawTable(stage.context, stage.size.width, stage.size.height, {
      arrangement, lamp, tracing, rays, station, found: wasFound,
    });
  }

  const loop = createLoop((_elapsed, delta) => {
    if (drifting && delta > 0) {
      driftTime += delta;
      lamp = boundedLamp({
        x: arrangement.lamp.x + Math.sin(driftTime * 0.38) * 150,
        y: arrangement.lamp.y + Math.cos(driftTime * 0.29) * 100,
        z: lamp.z,
      });
      updateReadout();
    }
    render();
  }, { paused: true });
  page.onCleanup(loop.destroy);

  function setDrifting(value: boolean): void {
    drifting = value;
    driftButton.textContent = value ? 'Pause light' : 'Drift light';
    driftButton.setAttribute('aria-pressed', String(value));
    loop.setPaused(!value);
  }

  function updateReadout(): void {
    const result = alignment(arrangement.objects, lamp);
    xInput.value = String(Math.round(lamp.x));
    yInput.value = String(Math.round(lamp.y));
    zInput.value = String(Math.round(lamp.z));
    xValue.value = `${Math.round(lamp.x)} mm`;
    yValue.value = `${Math.round(lamp.y)} mm`;
    zValue.value = `${Math.round(lamp.z)} mm`;
    xInput.setAttribute('aria-valuetext', xValue.value);
    yInput.setAttribute('aria-valuetext', yValue.value);
    zInput.setAttribute('aria-valuetext', zValue.value);
    meter.value = result.percent;
    meter.textContent = `${result.percent}%`;
    meter.dataset.error = result.error.toFixed(3);
    meter.dataset.found = String(result.found);
    percent.value = `${result.percent}%`;
    match.textContent = result.found ? 'Composition found' : result.percent > 75 ? 'Almost in place' : 'Shadows apart';
    surface.dataset.aligned = String(result.found);
    if (result.found && !wasFound) {
      discoveries.add(arrangement.id);
      announce(arrangement.revealed);
      foundCount.textContent = `${discoveries.size} / ${arrangements.length} found`;
      query<HTMLElement>(root, `[data-found="${arrangement.id}"]`).textContent = '+';
    } else if (!result.found && wasFound) {
      announce('The composition comes apart again. Your discovery is kept for this visit.');
    }
    wasFound = result.found;
  }

  function changeLamp(next: Lamp): void {
    setDrifting(false);
    lamp = boundedLamp(next);
    updateReadout();
    loop.requestRender();
  }

  function describeArrangement(): void {
    query<HTMLElement>(root, '[data-invitation]').textContent = arrangement.invitation;
    query<HTMLElement>(root, '[data-clue]').textContent = arrangement.hint;
    query<HTMLElement>(root, '[data-pieces]').textContent =
      `${arrangement.objects.length} pieces, suspended ${Math.min(...arrangement.objects.map((object) => object.height))}-${Math.max(...arrangement.objects.map((object) => object.height))} mm above the table.`;
    root.querySelectorAll<HTMLButtonElement>('[data-arrangement]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.arrangement === arrangement.id));
    });
  }

  function resetLamp(): void {
    station = false;
    hintButton.setAttribute('aria-pressed', 'false');
    hintButton.textContent = 'Show lamp guide';
    wasFound = false;
    announce('Follow the dotted silhouettes, or explore without them.');
    changeLamp({ ...arrangement.start });
  }

  root.querySelectorAll<HTMLButtonElement>('[data-arrangement]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = arrangements.find((item) => item.id === button.dataset.arrangement);
      if (!selected) throw new Error('This paper arrangement is not available.');
      arrangement = selected;
      describeArrangement();
      resetLamp();
    }, { signal });
  });
  for (const input of [xInput, yInput, zInput]) {
    input.addEventListener('input', () => {
      changeLamp({ x: xInput.valueAsNumber, y: yInput.valueAsNumber, z: zInput.valueAsNumber });
    }, { signal });
  }

  function movePointer(event: PointerEvent): void {
    const point = tablePoint(pointerPosition(event, stage.canvas), stage.size.width, stage.size.height);
    changeLamp({ ...lamp, ...point });
  }
  stage.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || activePointer !== undefined) return;
    event.preventDefault();
    activePointer = event.pointerId;
    stage.canvas.setPointerCapture(event.pointerId);
    stage.canvas.focus({ preventScroll: true });
    movePointer(event);
  }, { signal });
  stage.canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) movePointer(event);
  }, { signal });
  const endPointer = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    if (stage.canvas.hasPointerCapture(event.pointerId)) stage.canvas.releasePointerCapture(event.pointerId);
  };
  stage.canvas.addEventListener('pointerup', endPointer, { signal });
  stage.canvas.addEventListener('pointercancel', endPointer, { signal });
  stage.canvas.addEventListener('lostpointercapture', endPointer, { signal });
  stage.canvas.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 2 : 12;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    changeLamp({ ...lamp, x: lamp.x + offset[0], y: lamp.y + offset[1] });
  }, { signal });
  stage.canvas.addEventListener('canvasresize', () => loop.requestRender(), { signal });
  const tracingInput = query<HTMLInputElement>(root, '[data-tracing]');
  const raysInput = query<HTMLInputElement>(root, '[data-rays]');
  tracingInput.addEventListener('change', () => {
    tracing = tracingInput.checked;
    loop.requestRender();
  }, { signal });
  raysInput.addEventListener('change', () => {
    rays = raysInput.checked;
    loop.requestRender();
  }, { signal });
  hintButton.addEventListener('click', () => {
    station = !station;
    hintButton.setAttribute('aria-pressed', String(station));
    hintButton.textContent = station ? 'Hide lamp guide' : 'Show lamp guide';
    announce(station
      ? 'Set the lamp height to 360 mm, then drag the amber light into the small dashed circle. The shadows, not the circle, decide the match.'
      : arrangement.hint);
    loop.requestRender();
  }, { signal });
  driftButton.addEventListener('click', () => {
    setDrifting(!drifting);
    announce(drifting
      ? 'The lamp is drifting. Drag it, use a slider, or pause to take over.'
      : 'Light paused. All lamp controls still work.');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', resetLamp, { signal });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (event.matches) setDrifting(false);
  }, { signal });
  const cancelPointer = () => {
    const pointer = activePointer;
    activePointer = undefined;
    if (pointer !== undefined && stage.canvas.hasPointerCapture(pointer)) {
      stage.canvas.releasePointerCapture(pointer);
    }
  };
  window.addEventListener('blur', cancelPointer, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPointer(); }, { signal });
  page.onCleanup(cancelPointer);
  describeArrangement();
  updateReadout();
  render();

  return { destroy: page.destroy, setPaused: (paused) => setDrifting(!paused), reset: resetLamp };
}
