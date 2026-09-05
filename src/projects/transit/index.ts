import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import {
  addRoute, addStation, analyzeNetwork, appendStop, createHistory, GRID_SIZE, LABEL_SIDES, LIMITS,
  MAP_BOUNDS, MAP_HEIGHT, MAP_WIDTH, moveStation, NetworkError, parseProject, recordChange,
  redo, removeRoute, removeStation, removeStop, renameCity, reorderStop, routesAtStation,
  serializeProject, suggestStationPosition, undo, updateRoute, updateStation,
} from './engine';
import type { LabelSide, Network, Station } from './engine';
import { createDefaultNetwork, DEFAULT_STATION_ID, ROUTE_COLORS } from './data';
import { mapContents, routeNumber, serializeSvg } from './svg';

type Mode = 'select' | 'move' | 'add';
type Desk = 'station' | 'route';
interface Drag {
  pointerId: number;
  station: Station;
  start: { x: number; y: number };
  before: Network;
}

const icon = (symbol: string) => `<span aria-hidden="true">${symbol}</span>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'transit');
  const { root, signal } = page;
  let history = createHistory(createDefaultNetwork());
  let network = history.present;
  let selectedStation = DEFAULT_STATION_ID;
  let selectedRoute = network.routes[0].id;
  let activeRoute = selectedRoute;
  let desk: Desk = 'station';
  let mode: Mode = 'select';
  let snap = true;
  let drag: Drag | undefined;
  let ignoreMapClick = false;
  let importRequest = 0;

  root.innerHTML = `
    <header class="tw-masthead">
      <div class="tw-brand"><span class="tw-brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><div><h1>Transit <span>Weaver.</span></h1><p>Imaginary transport department</p></div></div>
      <a href="#transit-guide">Field guide ${icon('↗')}</a>
    </header>
    <section class="tw-studio" aria-labelledby="transit-studio-title">
      <header class="tw-studio-heading">
        <h2 id="transit-studio-title" data-city-heading></h2>
        <div class="tw-history" aria-label="Edit history, last ${LIMITS.history} edits">
          <button type="button" data-action="undo" title="Undo · Ctrl or Command Z">${icon('↶')} Undo</button>
          <button type="button" data-action="redo" title="Redo · Ctrl or Command Shift Z">${icon('↷')} Redo</button>
        </div>
      </header>
      <div class="tw-toolbar">
        <div class="tw-modes" role="group" aria-label="Map tools">
          <button type="button" data-mode-button="select" aria-pressed="true" title="Select a station circle or a route">${icon('↖')} Select</button>
          <button type="button" data-mode-button="move" aria-pressed="false" title="Drag a station, or focus it and use arrow keys">${icon('✥')} Move</button>
          <button type="button" data-mode-button="add" aria-pressed="false" title="Place the next station on empty map paper">${icon('+')} Add station</button>
        </div>
        <label class="tw-extend-label">Extend route<select data-active-route aria-label="Route for new stations"></select></label>
        <label class="tw-snap"><input type="checkbox" data-snap checked> Snap to grid</label>
      </div>
      <div class="tw-workspace" data-project-preview>
        <div class="tw-map-column">
          <div class="tw-map-scroll" data-map-scroll data-mode="select" tabindex="0" role="region" aria-label="Map paper, horizontally scrollable on smaller screens" aria-describedby="transit-map-help">
            <svg data-map viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Editable fictional transit map"></svg>
          </div>
          <p class="tw-status" data-mode-hint data-status id="transit-map-help" role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="tw-map-caption"><span>Fictional geography. Real connections.<span class="tw-scroll-hint"> Scroll the paper sideways ${icon('↔')}</span></span><button type="button" class="tw-editor-link" data-action="show-editor">Edit selection ${icon('↘')}</button></div>
          <div class="tw-legend" data-legend aria-label="Route legend"></div>
          <div class="tw-health" data-health></div>
        </div>
        <aside class="tw-inspector" id="transit-inspector" tabindex="-1" aria-label="Network workbench">
          <p class="tw-eyebrow">01 / The workbench</p>
          <div class="tw-desk-switch" role="group" aria-label="Choose editing panel">
            <button type="button" data-desk="station" aria-pressed="true">Stations</button>
            <button type="button" data-desk="route" aria-pressed="false">Routes</button>
          </div>
          <p class="tw-local-status" data-local-status hidden></p>
          <div data-inspector></div>
          <button type="button" class="tw-add-station-button" data-action="add-station">${icon('+')} Add without pointing</button>
          <p class="tw-small">New stations append to the “Extend route” selection. Choose “No route” to place an unserved station.</p>
        </aside>
      </div>
    </section>
    <div class="tw-bottom">
      <section class="tw-takeaway" aria-labelledby="transit-export-title">
        <p class="tw-eyebrow">02 / Keep your city</p>
        <h2 id="transit-export-title">Made to leave<br>the screen.</h2>
        <p>A crisp, self-contained SVG poster, legend included. Or save a project file to pick up your pencil another day.</p>
        <form data-form="city" class="tw-city-form" novalidate>
          <label for="transit-city-name">Name your imaginary city</label>
          <div><input id="transit-city-name" name="city" maxlength="${LIMITS.city}" required autocomplete="off"><button type="submit">Rename</button></div>
        </form>
        <button type="button" class="tw-primary tw-download" data-action="export-svg">${icon('↓')} Download SVG poster ${icon('↗')}</button>
        <div class="tw-file-actions">
          <button type="button" data-action="export-json">Save project</button>
          <button type="button" data-action="import-json">Open project</button>
          <input type="file" data-file-input accept=".json,application/json" hidden aria-label="Open a Transit Weaver JSON project">
        </div>
        <p class="tw-local-status" data-file-status hidden></p>
        <p class="tw-small">Open the SVG to print just your map and legend, without the workbench. Files stay on your device. Changes are not stored after closing this page; save a project to keep editing later.</p>
        <button type="button" class="tw-text-button" data-action="restore">Restore original Brindleport ${icon('↶')}</button>
        <span class="tw-small">Reversible with Undo, just like every edit.</span>
      </section>
      <section class="tw-guide" id="transit-guide" aria-labelledby="transit-guide-title">
        <p class="tw-eyebrow">03 / A short field guide</p>
        <h2 id="transit-guide-title">A few stops<br>along the way.</h2>
        <ol class="tw-guide-steps">
          <li><span>01</span><div><h3>Start somewhere.</h3><p>Brindleport is entirely invented. Select a circle on the map, or choose a station in the workbench. Its name, position, and route memberships are yours to change.</p></div></li>
          <li><span>02</span><div><h3>Give the line a reason.</h3><p>A route connects its stops in list order. Append stations, then use the up and down buttons to change the journey. Lines only connect at a shared station, not where strokes happen to cross.</p></div></li>
          <li><span>03</span><div><h3>Leave room for a detour.</h3><p>Switch to Move before dragging a station. On touchscreens, the rest of the paper still scrolls normally. Every completed move is one undoable edit.</p></div></li>
        </ol>
        <details>
          <summary>Keyboard, touch &amp; small-screen notes</summary>
          <dl class="tw-shortcuts">
            <div><dt>Tab, then Enter / Space</dt><dd>Focus a station circle and select it. The station picker offers the same access.</dd></div>
            <div><dt>Arrow keys on a station</dt><dd>Move by ${GRID_SIZE} units with snapping, or 10 without. Hold Shift for a larger step. Position fields also accept exact coordinates.</dd></div>
            <div><dt>Ctrl / ⌘ Z · Shift Z</dt><dd>Undo and redo when not typing in a field. Text fields keep their normal text-editing shortcuts.</dd></div>
            <div><dt>Escape</dt><dd>Cancel an unfinished drag or leave Add / Move mode.</dd></div>
            <div><dt>A smaller screen</dt><dd>Swipe the paper sideways; it stays large enough to read. “Edit selection” takes you to the workbench. “Add without pointing” finds a position for you.</dd></div>
          </dl>
        </details>
      </section>
    </div>
    <footer class="tw-footer"><strong>A map of nowhere.<br>A way to somewhere.</strong><span>Transit Weaver<br>Fictional city. Original names. Your next connection.</span></footer>`;

  const svg = query<SVGSVGElement>(root, '[data-map]');
  const mapScroll = query<HTMLDivElement>(root, '[data-map-scroll]');
  const inspector = query<HTMLDivElement>(root, '[data-inspector]');
  const workbench = query<HTMLElement>(root, '.tw-inspector');
  const status = query<HTMLParagraphElement>(root, '[data-status]');
  const activeRouteSelect = query<HTMLSelectElement>(root, '[data-active-route]');
  const cityInput = query<HTMLInputElement>(root, '#transit-city-name');
  const fileInput = query<HTMLInputElement>(root, '[data-file-input]');

  function announce(message: string, error = false) {
    if (signal.aborted) return;
    status.textContent = message;
    status.dataset.tone = error ? 'error' : 'info';
    const local = root.querySelector<HTMLElement>(document.activeElement?.closest('.tw-takeaway') ? '[data-file-status]' : '[data-local-status]');
    if (local) {
      local.hidden = false;
      local.textContent = message;
      local.dataset.tone = error ? 'error' : 'info';
    }
    page.report(message);
  }

  function run(operation: () => void) {
    try {
      operation();
    } catch (error) {
      if (!(error instanceof NetworkError) && !(error instanceof DOMException)) throw error;
      if (drag) cancelDrag(false);
      announce(error.message, true);
    }
  }

  function stationById(id: string) {
    return network.stations.find((station) => station.id === id);
  }

  function routeById(id: string) {
    return network.routes.find((route) => route.id === id);
  }

  function repairSelection() {
    if (!stationById(selectedStation)) selectedStation = network.stations[0]?.id ?? '';
    if (!routeById(selectedRoute)) selectedRoute = network.routes[0]?.id ?? '';
    if (activeRoute && !routeById(activeRoute)) activeRoute = network.routes[0]?.id ?? '';
  }

  function renderMap() {
    const focusedStation = document.activeElement instanceof SVGElement
      ? document.activeElement.closest<SVGElement>('[data-station]')?.dataset.station
      : undefined;
    svg.innerHTML = mapContents(network, {
      selectedStation: desk === 'station' ? selectedStation : undefined,
      selectedRoute: desk === 'route' ? selectedRoute : undefined,
      grid: snap,
      interactive: true,
    });
    svg.setAttribute('aria-label', `Editable fictional transit map of ${network.city}`);
    if (focusedStation) svg.querySelector<SVGGElement>(`[data-station="${focusedStation}"]`)?.focus({ preventScroll: true });
  }

  function renderTools() {
    mapScroll.dataset.mode = mode;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode-button]')) {
      button.setAttribute('aria-pressed', String(button.dataset.modeButton === mode));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-desk]')) {
      button.setAttribute('aria-pressed', String(button.dataset.desk === desk));
    }
    const route = routeById(activeRoute);
    const hint = mode === 'select'
      ? 'Select a station circle or a route in the legend. The workbench is ready for your next edit.'
      : mode === 'move'
        ? 'Drag a station circle to move it. The paper around it still scrolls. Or focus a circle and use the arrow keys.'
        : `Click empty map paper to place a station${route ? ` at the end of ${route.name}` : ' without a route'}. Escape cancels. “Add without pointing” works from the keyboard.`;
    query<HTMLElement>(root, '[data-mode-hint]').textContent = hint;
    activeRouteSelect.innerHTML = `<option value="">No route · unserved</option>${network.routes.map((item, index) =>
      `<option value="${item.id}">${routeNumber(index)} · ${escapeMarkup(item.name)}</option>`).join('')}`;
    activeRouteSelect.value = activeRoute;
    query<HTMLButtonElement>(root, '[data-action="undo"]').disabled = history.past.length === 0;
    query<HTMLButtonElement>(root, '[data-action="redo"]').disabled = history.future.length === 0;
  }

  function stationInspector(): string {
    const station = stationById(selectedStation);
    if (!station) return `<div class="tw-empty"><h3>Your first stop.</h3><p>Add a station to start this city. You can place it on the paper or use the button below.</p><button type="button" data-action="add-route">Add a route</button></div>`;
    const memberships = routesAtStation(network, station.id);
    return `
      <label class="tw-field-label" for="transit-station-picker">Choose a station</label>
      <select id="transit-station-picker" data-station-picker data-focus-key="station-picker">${network.stations.map((item) =>
        `<option value="${item.id}" ${item.id === station.id ? 'selected' : ''}>${escapeMarkup(item.name)}</option>`).join('')}</select>
      <div class="tw-selection-heading"><h3>${escapeMarkup(station.name)}</h3><span>${memberships.length > 1 ? `${memberships.length}-route interchange` : memberships.length ? 'Local station' : 'Not on a route'}</span></div>
      <form data-form="station" novalidate>
        <label for="transit-station-name">Station name</label>
        <input id="transit-station-name" data-focus-key="station-name" name="name" value="${escapeMarkup(station.name)}" maxlength="${LIMITS.name}" required autocomplete="off">
        <div class="tw-coordinate-fields">
          <label>X position<input name="x" data-focus-key="station-x" type="number" min="${MAP_BOUNDS.minX}" max="${MAP_BOUNDS.maxX}" step="any" value="${station.x}" required></label>
          <label>Y position<input name="y" data-focus-key="station-y" type="number" min="${MAP_BOUNDS.minY}" max="${MAP_BOUNDS.maxY}" step="any" value="${station.y}" required></label>
        </div>
        <label for="transit-label-side">Label position</label>
        <select id="transit-label-side" name="label" data-focus-key="label-side">${LABEL_SIDES.map((side) =>
          `<option value="${side}" ${side === station.label ? 'selected' : ''}>${side[0].toUpperCase()}${side.slice(1).replace('-', ' ')}</option>`).join('')}</select>
        <button type="submit" class="tw-save" data-focus-key="save-station">Save station</button>
      </form>
      <fieldset class="tw-memberships"><legend>Routes calling here</legend>
        ${network.routes.length ? network.routes.map((route, index) => {
          const stopIndex = route.stops.indexOf(station.id);
          return `<label><input type="checkbox" data-membership="${route.id}" data-focus-key="membership:${route.id}" ${stopIndex >= 0 ? 'checked' : ''}><span class="tw-route-dot" style="--route-color:${route.color}" aria-hidden="true">${routeNumber(index)}</span><span>${escapeMarkup(route.name)}<small>${stopIndex >= 0 ? `Stop ${stopIndex + 1} of ${route.stops.length}` : 'Appends as the last stop'}</small></span></label>`;
        }).join('') : '<p class="tw-small">No routes yet. Open Routes to add the first one.</p>'}
      </fieldset>
      <button type="button" class="tw-danger" data-action="remove-station" data-focus-key="remove-station">${icon('−')} Remove station</button>
      <p class="tw-small">Removal reconnects its neighbors on every route. Undo brings the station and its route memberships back.</p>`;
  }

  function routeInspector(): string {
    const route = routeById(selectedRoute);
    if (!route) return `<div class="tw-empty"><h3>A line to somewhere.</h3><p>Add a route, choose its color, then append existing stations in the order you want to connect them.</p></div><button type="button" class="tw-save" data-action="add-route">${icon('+')} Add route</button>`;
    const available = network.stations.filter((station) => !route.stops.includes(station.id));
    return `
      <label class="tw-field-label" for="transit-route-picker">Choose a route</label>
      <select id="transit-route-picker" data-route-picker data-focus-key="route-picker">${network.routes.map((item, index) =>
        `<option value="${item.id}" ${item.id === route.id ? 'selected' : ''}>${routeNumber(index)} · ${escapeMarkup(item.name)}</option>`).join('')}</select>
      <div class="tw-selection-heading"><h3>${escapeMarkup(route.name)}</h3><span>${route.stops.length} ${route.stops.length === 1 ? 'stop' : 'stops'} · connected in list order</span></div>
      <form data-form="route" novalidate>
        <label for="transit-route-name">Route name</label>
        <input id="transit-route-name" data-focus-key="route-name" name="name" value="${escapeMarkup(route.name)}" maxlength="${LIMITS.name}" required autocomplete="off">
        <label for="transit-route-color">Route color · six-digit hex</label>
        <div class="tw-color-fields"><input type="color" data-color-picker data-focus-key="route-color-picker" aria-label="Choose route color" value="${route.color}"><input id="transit-route-color" name="color" data-focus-key="route-color" value="${route.color}" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="transit-color-help"></div>
        <p id="transit-color-help" class="tw-small">For example, #326ad3. Apply both fields with Save route.</p>
        <button type="submit" class="tw-save" data-focus-key="save-route">Save route</button>
      </form>
      <div class="tw-stop-heading"><h4>Stop order</h4><span>First → last</span></div>
      ${route.stops.length ? `<ol class="tw-stop-list" aria-label="Route stop order">${route.stops.map((id, index) => {
        const station = stationById(id)!;
        return `<li>
          <button type="button" class="tw-stop-name" data-action="select-station" data-id="${id}" data-focus-key="stop-select:${id}" aria-label="Edit ${escapeMarkup(station.name)}"><span>${index + 1}</span>${escapeMarkup(station.name)}</button>
          <div class="tw-stop-buttons">
            <button type="button" data-action="stop-up" data-id="${id}" data-focus-key="stop-up:${id}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeMarkup(station.name)} earlier">${icon('↑')}</button>
            <button type="button" data-action="stop-down" data-id="${id}" data-focus-key="stop-down:${id}" ${index === route.stops.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeMarkup(station.name)} later">${icon('↓')}</button>
            <button type="button" data-action="remove-stop" data-id="${id}" data-focus-key="remove-stop:${id}" aria-label="Remove ${escapeMarkup(station.name)} from this route">${icon('×')}</button>
          </div>
        </li>`;
      }).join('')}</ol>` : '<p class="tw-empty-note">No stops yet. Append a station below, or use Add station to extend this route on the paper.</p>'}
      <form data-form="append" class="tw-append-form">
        <label for="transit-append-station">Append an existing station</label>
        <select id="transit-append-station" name="station" data-focus-key="append-station" ${available.length ? '' : 'disabled'}>${available.length
          ? available.map((station) => `<option value="${station.id}">${escapeMarkup(station.name)}</option>`).join('')
          : '<option>No unlisted stations</option>'}</select>
        <button type="submit" data-focus-key="append-stop" ${available.length ? '' : 'disabled'}>${icon('+')} Append stop</button>
      </form>
      <div class="tw-route-management">
        <button type="button" data-action="add-route">${icon('+')} Add route</button>
        <button type="button" class="tw-danger" data-action="remove-route" data-focus-key="remove-route">Remove route</button>
      </div>
      <p class="tw-small">Removing a route keeps all its stations. New edits, including stop order, can be undone.</p>`;
  }

  function renderLegend() {
    query<HTMLElement>(root, '[data-legend]').innerHTML = network.routes.length
      ? network.routes.map((route, index) => `<button type="button" data-action="select-route" data-id="${route.id}" data-focus-key="legend:${route.id}" class="tw-legend-route" aria-pressed="${desk === 'route' && selectedRoute === route.id}" aria-label="Edit route ${escapeMarkup(route.name)}">
        <span class="tw-route-dot" style="--route-color:${route.color}" aria-hidden="true">${routeNumber(index)}</span><span><strong>${escapeMarkup(route.name)}</strong><small>${route.stops.length} ${route.stops.length === 1 ? 'stop' : 'stops'}${route.stops.length < 2 ? ' · in progress' : ''}</small></span><span aria-hidden="true">↗</span>
      </button>`).join('')
      : '<p class="tw-empty-note">No routes yet. Add a route in the workbench to start connecting stations.</p>';
  }

  function renderHealth() {
    const health = analyzeNetwork(network, selectedStation);
    const station = stationById(selectedStation);
    const connected = network.stations.length > 1 && health.components === 1;
    const headline = !network.stations.length ? 'A city waiting to happen'
      : connected ? 'Every station connected'
        : network.stations.length === 1 ? 'One station. A beginning.'
          : `${health.components} separate station groups`;
    query<HTMLElement>(root, '[data-health]').innerHTML = `
      <div><strong class="${connected ? 'tw-is-connected' : ''}">${icon(connected ? '●' : '○')} ${headline}</strong>
      <span>${network.stations.length} stations · ${network.routes.length} routes · ${health.interchanges} interchanges</span></div>
      <p>${station ? `From ${escapeMarkup(station.name)}: ${health.reachable} of ${network.stations.length} stations reachable, including this stop. ` : ''}${health.connections} distinct station connections${health.unserved ? ` · ${health.unserved} unserved ${health.unserved === 1 ? 'station' : 'stations'}` : ''}.</p>`;
  }

  function renderAll() {
    repairSelection();
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && root.contains(focused) ? focused.getAttribute('data-focus-key') : null;
    const selection = focused instanceof HTMLInputElement && focused.type === 'text'
      ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
    const stopListScroll = inspector.querySelector('.tw-stop-list')?.scrollTop ?? 0;
    renderMap();
    renderTools();
    renderLegend();
    renderHealth();
    inspector.innerHTML = desk === 'station' ? stationInspector() : routeInspector();
    const stopList = inspector.querySelector('.tw-stop-list');
    if (stopList) stopList.scrollTop = stopListScroll;
    query<HTMLElement>(root, '[data-city-heading]').textContent = network.city;
    if (document.activeElement !== cityInput) cityInput.value = network.city;
    if (focusKey && focused && !focused.isConnected) {
      const replacement = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-focus-key]')]
        .find((element) => element.dataset.focusKey === focusKey);
      if (replacement && !(replacement instanceof HTMLButtonElement && replacement.disabled)) {
        replacement.focus({ preventScroll: true });
        if (selection && replacement instanceof HTMLInputElement) replacement.setSelectionRange(selection.start, selection.end);
      } else workbench.focus({ preventScroll: true });
    }
  }

  function commit(next: Network, message: string) {
    const previous = history;
    history = recordChange(history, next);
    network = history.present;
    renderAll();
    announce(history === previous ? 'No changes to save.' : message);
  }

  function selectStation(id: string, focusMap = false) {
    if (!stationById(id)) return;
    selectedStation = id;
    desk = 'station';
    renderAll();
    if (focusMap) svg.querySelector<SVGGElement>(`[data-station="${id}"]`)?.focus({ preventScroll: true });
    announce(`${stationById(id)!.name} selected. Edit its name, position, and routes in the workbench.`);
  }

  function selectRoute(id: string) {
    if (!routeById(id)) return;
    selectedRoute = id;
    activeRoute = id;
    desk = 'route';
    renderAll();
    announce(`${routeById(id)!.name} selected. Its stations connect from first to last in the stop list.`);
  }

  function cancelDrag(message = true) {
    if (!drag) return;
    const previous = drag;
    drag = undefined;
    ignoreMapClick = true;
    network = previous.before;
    mapScroll.classList.remove('tw-is-dragging');
    if (svg.hasPointerCapture(previous.pointerId)) svg.releasePointerCapture(previous.pointerId);
    renderAll();
    if (message) announce('Move cancelled. The station is back at its previous position.');
  }

  function setMode(next: Mode) {
    cancelDrag(false);
    mode = next;
    ignoreMapClick = false;
    renderTools();
  }

  function addAt(point: { x: number; y: number }) {
    const position = snap
      ? { x: Math.round(point.x / GRID_SIZE) * GRID_SIZE, y: Math.round(point.y / GRID_SIZE) * GRID_SIZE }
      : { x: Math.round(point.x), y: Math.round(point.y) };
    const next = addStation(network, position, activeRoute);
    const station = next.stations.at(-1)!;
    selectedStation = station.id;
    desk = 'station';
    mode = 'select';
    const route = next.routes.find((item) => item.id === activeRoute);
    commit(next, `${station.name} added${route ? ` as stop ${route.stops.length} on ${route.name}` : ' without a route'}. Rename it in the workbench. Undo is available.`);
  }

  function addNewRoute() {
    const next = addRoute(network, `New route ${network.routes.length + 1}`, ROUTE_COLORS[network.routes.length % ROUTE_COLORS.length]);
    selectedRoute = next.routes.at(-1)!.id;
    activeRoute = selectedRoute;
    desk = 'route';
    commit(next, 'New route added. Name it, choose a color, and append its first station. Undo is available.');
    query<HTMLInputElement>(root, '#transit-route-name').focus({ preventScroll: true });
  }

  function applyHistory(direction: 'undo' | 'redo') {
    cancelDrag(false);
    const previous = history;
    history = direction === 'undo' ? undo(history) : redo(history);
    network = history.present;
    renderAll();
    announce(history === previous ? `Nothing to ${direction}.` : `${direction === 'undo' ? 'Undid' : 'Redid'} the last edit. Your map and route connections are updated.`);
  }

  function mapPoint(event: PointerEvent | MouseEvent) {
    const matrix = svg.getScreenCTM();
    if (!matrix) throw new NetworkError('The map is not ready for a pointer edit yet. Try the position fields.');
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }

  function filename() {
    return network.city.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'imaginary-city';
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    run(() => {
      if (button.dataset.modeButton) {
        setMode(button.dataset.modeButton as Mode);
        announce(query<HTMLElement>(root, '[data-mode-hint]').textContent ?? '');
        return;
      }
      if (button.dataset.desk) {
        desk = button.dataset.desk as Desk;
        renderAll();
        return;
      }
      const action = button.dataset.action;
      const id = button.dataset.id ?? '';
      if (action && drag) cancelDrag(false);
      switch (action) {
        case 'undo': applyHistory('undo'); break;
        case 'redo': applyHistory('redo'); break;
        case 'show-editor':
          workbench.scrollIntoView({ behavior: context.reducedMotion ? 'auto' : 'smooth', block: 'start' });
          workbench.focus({ preventScroll: true });
          break;
        case 'select-station': selectStation(id); break;
        case 'select-route': selectRoute(id); break;
        case 'add-station': addAt(suggestStationPosition(network, activeRoute)); break;
        case 'add-route': addNewRoute(); break;
        case 'remove-station': {
          const station = stationById(selectedStation)!;
          commit(removeStation(network, station.id), `${station.name} removed from the map and every route. Neighboring stops are reconnected. Undo restores it.`);
          break;
        }
        case 'remove-route': {
          const route = routeById(selectedRoute)!;
          commit(removeRoute(network, route.id), `${route.name} removed. All stations were kept; the health readout shows any disconnected groups. Undo restores the route.`);
          break;
        }
        case 'stop-up':
        case 'stop-down':
          commit(reorderStop(network, selectedRoute, id, action === 'stop-up' ? -1 : 1), `${stationById(id)!.name} moved ${action === 'stop-up' ? 'earlier' : 'later'} in the route. Connections now follow the new order.`);
          break;
        case 'remove-stop':
          commit(removeStop(network, selectedRoute, id), `${stationById(id)!.name} removed from this route, but kept on the map. Undo restores the connection.`);
          break;
        case 'export-svg':
          downloadText(`${filename()}-transit.svg`, serializeSvg(network), 'image/svg+xml;charset=utf-8');
          announce('SVG poster prepared for download, including every station and the route legend.');
          break;
        case 'export-json':
          downloadText(`${filename()}-transit.json`, serializeProject(network), 'application/json;charset=utf-8');
          announce('Project file prepared for download. Open it here later to continue editing.');
          break;
        case 'import-json': fileInput.click(); break;
        case 'restore':
          selectedStation = DEFAULT_STATION_ID;
          selectedRoute = 'emberway';
          activeRoute = selectedRoute;
          desk = 'station';
          mode = 'select';
          commit(createDefaultNetwork(), 'Original Brindleport restored. Undo returns to your previous city.');
          break;
      }
    });
  }, { signal });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    run(() => {
      const values = new FormData(form);
      const text = (key: string) => String(values.get(key) ?? '');
      if (form.dataset.form === 'station') {
        if (!text('x').trim() || !text('y').trim()) throw new NetworkError('Enter both X and Y positions before saving.');
        commit(updateStation(network, selectedStation, {
          name: text('name'), x: Number(text('x')), y: Number(text('y')), label: text('label') as LabelSide,
        }), 'Station saved. Its name, label position, and connections are reflected on the map.');
      } else if (form.dataset.form === 'route') {
        commit(updateRoute(network, selectedRoute, { name: text('name'), color: text('color') }), 'Route name and color saved on the map and in the legend.');
      } else if (form.dataset.form === 'append') {
        const id = text('station');
        commit(appendStop(network, selectedRoute, id), `${stationById(id)!.name} appended as the last stop. Use the arrows to change its order.`);
      } else if (form.dataset.form === 'city') {
        commit(renameCity(network, text('city')), 'Your imaginary city has a new name. Both download formats will use it.');
        cityInput.value = network.city;
      }
    });
  }, { signal });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    run(() => {
      if (target.hasAttribute('data-active-route')) {
        activeRoute = target.value;
        if (activeRoute) selectedRoute = activeRoute;
        if (desk === 'route') renderAll();
        else renderTools();
        announce(activeRoute ? `New stations will append to ${routeById(activeRoute)!.name}.` : 'New stations will be unserved until you link them to a route.');
      } else if (target.hasAttribute('data-station-picker')) selectStation(target.value);
      else if (target.hasAttribute('data-route-picker')) selectRoute(target.value);
      else if (target instanceof HTMLInputElement && target.hasAttribute('data-snap')) {
        snap = target.checked;
        renderMap();
        announce(`Grid snapping ${snap ? 'on' : 'off'}. Existing stations stay where they are.`);
      } else if (target instanceof HTMLInputElement && target.dataset.membership) {
        const route = routeById(target.dataset.membership)!;
        commit(target.checked ? appendStop(network, route.id, selectedStation) : removeStop(network, route.id, selectedStation),
          target.checked ? `Station appended to ${route.name}. Edit its stop order in Routes.` : `Station removed from ${route.name}; all other memberships are unchanged.`);
      } else if (target.hasAttribute('data-color-picker')) {
        const colorText = query<HTMLInputElement>(root, '#transit-route-color');
        colorText.value = target.value;
        colorText.setAttribute('aria-invalid', 'false');
      }
    });
  }, { signal });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'transit-route-color') return;
    const valid = /^#[0-9a-f]{6}$/i.test(target.value);
    target.setAttribute('aria-invalid', String(!valid));
    if (valid) query<HTMLInputElement>(root, '[data-color-picker]').value = target.value;
  }, { signal });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const request = ++importRequest;
    try {
      if (file.size > 200_000) throw new NetworkError('This project is too large. Choose a JSON file under 200 KB.');
      const text = await file.text();
      if (signal.aborted || request !== importRequest) return;
      const imported = parseProject(text);
      cancelDrag(false);
      selectedStation = imported.stations[0]?.id ?? '';
      selectedRoute = imported.routes[0]?.id ?? '';
      activeRoute = selectedRoute;
      desk = 'station';
      mode = 'select';
      commit(imported, `Opened ${imported.city}. Your previous map is available with Undo.`);
      cityInput.value = network.city;
    } catch (error) {
      if (!(error instanceof NetworkError) && !(error instanceof DOMException)) throw error;
      if (!signal.aborted && request === importRequest) {
        announce(`${error.message} Your current map is unchanged.`, true);
      }
    } finally {
      if (!signal.aborted && request === importRequest) fileInput.value = '';
    }
  }, { signal });

  svg.addEventListener('click', (event) => {
    if (ignoreMapClick) { ignoreMapClick = false; return; }
    const target = event.target;
    if (!(target instanceof Element)) return;
    run(() => {
      const station = target.closest<SVGGElement>('[data-station]');
      if (station?.dataset.station) {
        if (mode === 'add') mode = 'select';
        selectStation(station.dataset.station, true);
        return;
      }
      if (mode === 'add') {
        const point = mapPoint(event);
        if (point.x < MAP_BOUNDS.minX || point.x > MAP_BOUNDS.maxX || point.y < MAP_BOUNDS.minY || point.y > MAP_BOUNDS.maxY) {
          announce('Place the station inside the dotted map area, away from the paper’s title and key.', true);
          return;
        }
        addAt(point);
        return;
      }
      const routeId = target.closest<SVGElement>('[data-map-route]')?.dataset.mapRoute;
      if (routeId) selectRoute(routeId);
    });
  }, { signal });

  svg.addEventListener('pointerdown', (event) => {
    ignoreMapClick = false;
    if (mode !== 'move' || drag || !event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const id = target.closest<SVGElement>('[data-station]')?.dataset.station;
    const station = id ? stationById(id) : undefined;
    if (!station) return;
    run(() => {
      const point = mapPoint(event);
      event.preventDefault();
      ignoreMapClick = false;
      selectedStation = station.id;
      desk = 'station';
      svg.setPointerCapture(event.pointerId);
      drag = { pointerId: event.pointerId, station, start: point, before: network };
      mapScroll.classList.add('tw-is-dragging');
      renderAll();
      svg.querySelector<SVGGElement>(`[data-station="${station.id}"]`)?.focus({ preventScroll: true });
    });
  }, { signal });

  svg.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    run(() => {
      const point = mapPoint(event);
      network = moveStation(drag!.before, drag!.station.id,
        drag!.station.x + point.x - drag!.start.x, drag!.station.y + point.y - drag!.start.y, snap);
      renderMap();
      const station = stationById(drag!.station.id)!;
      const x = inspector.querySelector<HTMLInputElement>('[name="x"]');
      const y = inspector.querySelector<HTMLInputElement>('[name="y"]');
      if (x) x.value = String(station.x);
      if (y) y.value = String(station.y);
    });
  }, { signal });

  svg.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const previous = drag;
    run(() => {
      const point = mapPoint(event);
      const next = moveStation(previous.before, previous.station.id,
        previous.station.x + point.x - previous.start.x, previous.station.y + point.y - previous.start.y, snap);
      drag = undefined;
      ignoreMapClick = true;
      mapScroll.classList.remove('tw-is-dragging');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      network = previous.before;
      commit(next, `${previous.station.name} moved. The whole drag is one edit; Undo returns it to its previous position.`);
      svg.querySelector<SVGGElement>(`[data-station="${previous.station.id}"]`)?.focus({ preventScroll: true });
    });
  }, { signal });

  const interrupted = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      mapScroll.classList.remove('tw-is-dragging');
      cancelDrag();
    }
  };
  svg.addEventListener('pointercancel', interrupted, { signal });
  svg.addEventListener('lostpointercapture', interrupted, { signal });
  window.addEventListener('blur', () => cancelDrag(), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelDrag();
  }, { signal });

  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const stationId = target.closest<SVGElement>('[data-station]')?.dataset.station;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (drag) {
        cancelDrag();
        mapScroll.classList.remove('tw-is-dragging');
      } else {
        setMode('select');
        announce('Select mode. The map is ready for your next edit.');
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (!stationId || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectStation(stationId, true);
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    run(() => {
      cancelDrag(false);
      const station = stationById(stationId)!;
      selectedStation = stationId;
      desk = 'station';
      const distance = (snap ? GRID_SIZE : 10) * (event.shiftKey ? 3 : 1);
      commit(moveStation(network, stationId, station.x + direction[0] * distance, station.y + direction[1] * distance, snap),
        `${station.name} moved ${event.key.slice(5).toLowerCase()}. Undo is available.`);
    });
  }, { signal });

  page.onCleanup(() => {
    importRequest += 1;
    const previous = drag;
    drag = undefined;
    if (previous && svg.hasPointerCapture(previous.pointerId)) svg.releasePointerCapture(previous.pointerId);
  });
  renderAll();
  return { destroy: page.destroy };
}
