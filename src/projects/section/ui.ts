import { clamp } from '../../core/math';
import { createProjectPage, downloadBlob, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import { ComputeClient } from './compute';
import { exportSTL, sectionDrawing } from './exports';
import { planeBasis } from './fields';
import { clone, KINDS, LIMITS, OPERATIONS, primitive } from './model';
import type { Document, Primitive } from './model';
import type { MeshResult } from './mesh';
import { STUDIES } from './presets';
import { createSolidView } from './renderer';
import type { SliceResult } from './slice';
import { History, parseDocument, serializeDocument, ValidationError } from './state';

const icons: Record<string, string> = {
  box: '<path d="m6 8 10-5 10 5v13l-10 6-10-6Z M6 8l10 6 10-6M16 14v13"/>',
  sphere: '<circle cx="16" cy="15" r="11"/><ellipse cx="16" cy="15" rx="5" ry="11"/><path d="M5 15h22"/>',
  cylinder: '<ellipse cx="16" cy="7" rx="10" ry="4"/><path d="M6 7v16c0 6 20 6 20 0V7"/><path d="M6 23c0-6 20-6 20 0"/>',
  torus: '<ellipse cx="16" cy="16" rx="13" ry="9"/><ellipse cx="16" cy="14" rx="6" ry="3"/>',
};
const icon = (kind: string) => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2">${icons[kind] ?? ''}</svg>`;
const opLabel = (operation: string) => operation === 'difference' ? 'Subtract' : operation === 'intersection' ? 'Intersect' : 'Union';
const opSymbol = (operation: string) => operation === 'difference' ? '&#8722;' : operation === 'intersection' ? '&#8745;' : '+';
const numeric = (label: string, field: string, value: number, min: number, max: number, step = 1) => `<label>${label}<input type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const keyOf = (document: Document) => JSON.stringify([document.primitives, document.resolution]);

function shell() {
  return `<div class="section-wrap">
    <header class="section-masthead"><div class="section-wordmark"><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M5 12 25 3l14 10v20l-20 9L5 32Z M5 12l14 10 20-9M19 22v20" fill="none" stroke="currentColor"/><path d="m0 25 27-12 17 11-27 13Z" fill="#2453c7" fill-opacity=".2" stroke="#2453c7"/></svg><h1>SECTION<span>A cut tells the whole story.</span></h1></div>
      <div class="section-file-actions" aria-label="Study files"><button type="button" data-action="open">Open JSON</button><button type="button" data-action="save">Save JSON</button><button type="button" data-action="stl" class="section-export">STL &#8599;</button><button type="button" data-action="svg" class="section-export">SVG &#8599;</button><input data-file type="file" accept=".json,application/json" hidden aria-label="Import SECTION document"></div>
    </header>
    <nav class="section-studies" aria-label="Construction studies">${STUDIES.map((study, i) => `<button type="button" data-study="${study.id}" aria-pressed="${i === 0}"><span>0${i + 1}</span>${study.name}<small>${study.type.split(' / ')[1]}</small></button>`).join('')}</nav>
    <div class="section-error" role="alert" data-error hidden></div>
    <section class="section-workbench" data-project-preview aria-label="Linked solid and cross-section workbench">
      <div class="section-work-heading"><div><p class="section-eyebrow">Constructive geometry / Study in millimeters</p><h2 data-title>Tender monument</h2></div><div class="section-history"><button type="button" data-action="undo" aria-label="Undo last edit" title="Undo (Ctrl/Cmd Z)">&#8630;</button><button type="button" data-action="redo" aria-label="Redo last edit" title="Redo (Ctrl/Cmd Shift Z)">&#8631;</button><button type="button" data-action="reset">Reset study</button></div></div>
      <div class="section-main">
        <div class="section-drafting">
          <div class="section-mobile-tabs" role="group" aria-label="Geometry views"><button type="button" data-view-tab="solid" aria-pressed="true">01 Solid</button><button type="button" data-view-tab="slice" aria-pressed="false">02 Section A&#8211;A</button></div>
          <div class="section-views" data-mobile-view="solid">
            <section class="section-solid-pane" aria-label="Three-dimensional solid">
              <div class="section-pane-heading"><h3><span>01</span> Constructed solid</h3><span class="section-unit">XYZ / mm</span></div>
              <div class="section-solid" data-solid><div class="section-rebuild" data-rebuild><span class="section-computing-mark"></span>Resolving the first surface&#8230;</div><div class="section-empty-solid" data-empty-solid hidden></div><span class="section-view-stamp" aria-hidden="true">S / 066<br>IMPLICIT SOLID</span></div>
              <div class="section-view-tools"><div class="section-mode" role="group" aria-label="Manipulation mode"><button type="button" data-mode="view" aria-pressed="true">Orbit view</button><button type="button" data-mode="plane" aria-pressed="false">Move cut</button></div><div class="section-camera-tools"><button type="button" data-action="zoom-out" aria-label="Zoom out">&#8722;</button><button type="button" data-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="fit">Fit</button></div></div>
              <div class="section-view-foot"><label><input type="checkbox" data-clip> Reveal cutaway</label><span data-mode-help>Drag to orbit. Click a surface to inspect.</span></div>
            </section>
            <section class="section-slice-pane" aria-label="Measured two-dimensional section">
              <div class="section-pane-heading"><h3><span>02</span> Section A&#8211;A</h3><span class="section-unit">u,v / mm</span></div>
              <div class="section-drawing" data-drawing></div>
              <div class="section-topology" data-topology><span>Sampling the section</span></div>
              <div class="section-slice-foot"><span data-slice-grid>Direct field section</span><button type="button" data-action="cut-inspector">Rotate plane &#8599;</button></div>
            </section>
          </div>
          <div class="section-cut-rail"><label for="section-offset">Cut position <span>Along its normal</span></label><button type="button" data-action="cut-back" aria-label="Move cut back 5 millimeters">&#8722;</button><input id="section-offset" type="range" min="-80" max="80" step=".5" value="8" aria-label="Section offset"><button type="button" data-action="cut-forward" aria-label="Move cut forward 5 millimeters">+</button><label class="section-offset-number"><input type="number" data-offset-number min="-240" max="240" step=".5" value="8" aria-label="Exact section offset">mm</label></div>
          <section class="section-metrics" aria-label="Numerical approximations"><div><span>Solid volume &#8776;</span><strong data-volume>&#8212;</strong><small>mm&#179; / surface integral</small></div><div><span>Cut area &#8776;</span><strong data-area>&#8212;</strong><small>mm&#178; / sampled field</small></div><div class="section-bounds-metric"><span>Solid bounds &#8776; <small>X &#215; Y &#215; Z</small></span><strong data-bounds>&#8212;</strong><small>mm / meshed extents</small></div></section>
          <p class="section-study-note" data-study-note>${STUDIES[0].note}</p>
        </div>
        <aside class="section-inspector" aria-label="Construction inspector"><div class="section-inspector-tabs" role="group" aria-label="Inspector panels"><button type="button" data-panel="construction" aria-pressed="true">Construction</button><button type="button" data-panel="plane" aria-pressed="false">Cut plane</button></div>
          <section data-construction><div class="section-stack-heading"><h3>Operation stack</h3><span data-count></span></div><p class="section-stack-explain">From empty space, top to bottom.</p><ol class="section-stack" data-stack aria-label="Ordered Boolean operations"></ol>
            <div class="section-add"><label class="section-sr" for="section-kind">Primitive to add</label><select id="section-kind" data-kind>${KINDS.map((kind) => `<option value="${kind}">${kind[0].toUpperCase() + kind.slice(1)}</option>`).join('')}</select><button type="button" data-action="add">+ Add primitive</button></div>
            <div class="section-object-inspector" data-object-inspector></div>
          </section>
          <section class="section-plane-inspector" data-plane-inspector hidden><p class="section-eyebrow">An infinite geometric plane</p><h3>Turn the question.</h3><p>A different cut reveals a different solid. The blue outline is the same contour in both views.</p><div class="section-plane-presets" role="group" aria-label="Plane orientation"><button type="button" data-plane-preset="XY">XY</button><button type="button" data-plane-preset="XZ">XZ</button><button type="button" data-plane-preset="YZ">YZ</button></div><div class="section-fields" data-plane-fields></div><div class="section-basis" data-basis></div><p>Offset is measured from the world origin along the rotated normal. Local u &#215; v = normal.</p><button type="button" data-action="center-cut">Center cut at origin</button><p class="section-inspector-note">Move cut mode: drag vertically or use arrow keys on the solid view. One gesture is one undo step. Escape cancels a drag.</p></section>
          <div class="section-resolution"><label for="section-resolution">Surface resolution</label><select id="section-resolution" data-resolution><option value="28">Draft / 28 cells</option><option value="44" selected>Studio / 44 cells</option><option value="64">Fine / 64 cells</option></select><p data-resolution-note>Longest axis. Section sampled at 3&#215;.</p></div>
        </aside>
      </div>
    </section>
    <div class="section-status-row"><p data-status role="status">Preparing the first solid and section.</p><span class="section-local">LOCAL MODEL / NO UPLOADS</span></div>
    <details class="section-method"><summary>Inside the instrument <span>Methods, limits &amp; keyboard</span></summary><div class="section-method-columns"><section><h3>A field, not a facade.</h3><p>Box, sphere, capped cylinder and torus fields are combined with min/max Boolean operations. Every operation acts on the accumulated result. Subtracting from an empty stack stays empty. Cylinders and tori use local Z as their axis.</p><p>Translation follows local X, then Y, then Z rotations: world = Rz &#183; Ry &#183; Rx &#183; local + translation. All distances and exports use millimeters; angles use degrees.</p></section><section><h3>Measured, not exact.</h3><p>The surface uses marching tetrahedra. Volume is a signed triangle integral. A separate triangulated plane grid measures area and connects section contours, including holes. Both sample the same field, but at different resolutions; edges may differ slightly.</p><p>Bounds, area, volume and topology are numerical approximations. Very thin walls, tangencies and gaps may disappear. Compare Studio and Fine. No watertightness, fabrication suitability or manufacturing tolerance is certified.</p></section><section><h3>Keep the construction.</h3><p>Save JSON keeps the versioned model and plane, not a screenshot. Open validates the complete file before replacing anything. STL keeps the current full world-space surface, even in cutaway view. SVG is a self-contained section drawing with embedded model metadata.</p><p>Use Tab to reach every control. Arrow keys orbit the focused solid; +/&#8722; zoom. Move cut mode uses arrows for 1 mm (Shift: 5 mm). Ctrl/Cmd Z undoes; Shift Z or Y redoes outside text fields. Limits: 16 operations, 64 KB JSON, 60 undo steps.</p></section></div></details>
    <footer class="section-footer"><span>SECTION / A constructive atelier</span><span>Make something. Then look inside.</span></footer>
  </div>`;
}

function objectInspector(item: Primitive | undefined) {
  if (!item) return `<div class="section-no-selection"><h3>Empty space is a beginning.</h3><p>Add a primitive to construct a new solid.</p></div>`;
  const shapeFields = item.kind === 'box' ? item.size.map((size, i) => numeric(['Width', 'Depth', 'Height'][i] + ' / mm', `size-${i}`, size, 0.4, 160, 0.5)).join('')
    : `${numeric(item.kind === 'torus' ? 'Major radius / mm' : 'Radius / mm', 'radius', item.radius, 0.4, 80, 0.5)}${item.kind === 'cylinder' ? numeric('Height / mm', 'size-2', item.size[2], 0.4, 160, 0.5) : item.kind === 'torus' ? numeric('Tube radius / mm', 'tube', item.tube, 0.4, 40, 0.5) : ''}`;
  return `<div class="section-selected-heading">${icon(item.kind)}<div><p class="section-eyebrow">Selected primitive</p><h3>${escapeMarkup(item.name)}</h3></div></div>
    <label class="section-name-label">Name<input type="text" data-field="name" maxlength="48" value="${escapeMarkup(item.name)}"></label>
    <label class="section-operation-label">Boolean operation<select data-field="operation">${OPERATIONS.map((operation) => `<option value="${operation}"${operation === item.operation ? ' selected' : ''}>${opLabel(operation)}</option>`).join('')}</select></label>
    <fieldset><legend>Shape / ${item.kind}</legend><div class="section-fields">${shapeFields}</div></fieldset>
    <fieldset><legend>Translate / mm</legend><div class="section-fields section-triple">${item.position.map((value, i) => numeric(['X', 'Y', 'Z'][i], `position-${i}`, value, -120, 120, 0.5)).join('')}</div></fieldset>
    <fieldset><legend>Rotate / degrees</legend><div class="section-fields section-triple">${item.rotation.map((value, i) => numeric(['X', 'Y', 'Z'][i], `rotation-${i}`, value, -180, 180)).join('')}</div></fieldset>
    <div class="section-operation-actions"><button type="button" data-action="up" aria-label="Move selected operation earlier">&#8593; Earlier</button><button type="button" data-action="down" aria-label="Move selected operation later">&#8595; Later</button><button type="button" data-action="remove">Remove</button></div>
    <p class="section-inspector-note">Dashed bounds identify the selected operand, including removed material. Ordering changes the result.</p>`;
}

export async function mountSection(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'section');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = shell();
  const get = <T extends Element>(selector: string) => query<T>(root, selector);
  const files = document.createElement('button');
  files.type = 'button'; files.textContent = 'Files & guide'; files.dataset.workspaceFiles = '';
  get('.section-masthead').append(files);
  const method = get<HTMLDetailsElement>('.section-method');
  method.open = true;
  method.append(get('[data-mode-help]'));
  const fileDialog = createWorkspaceDialog(page, {
    id: 'section-files', title: 'Construction files & guide', triggers: [files],
    content: [get('.section-file-actions'), method, get('.section-footer')],
  });
  const inspector = get<HTMLElement>('.section-inspector');
  const dock = document.createElement('div');
  dock.className = 'section-inspector-scroll';
  const results = document.createElement('div');
  results.append(get('.section-metrics'), get('.section-resolution'));
  const studies = document.createElement('div');
  studies.append(get('.section-studies'), get('.section-study-note'));
  const panels = [
    { id: 'construction', label: 'Construction', panel: get<HTMLElement>('[data-construction]') },
    { id: 'plane', label: 'Cut plane', panel: get<HTMLElement>('[data-plane-inspector]') },
    { id: 'results', label: 'Results', panel: results },
    { id: 'studies', label: 'Studies', panel: studies },
  ];
  dock.append(...panels.map(pane => pane.panel));
  inspector.append(dock);
  const inspectorTabs = createWorkspaceTabs(page, {
    id: 'section-inspector', label: 'Inspector panels', host: get('.section-inspector-tabs'), panes: panels,
    onSelect(id) {
      dock.scrollTop = 0;
      root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.panel === id)));
    },
  });
  root.querySelectorAll<HTMLButtonElement>('.section-inspector-tabs button').forEach(button => {
    button.dataset.panel = button.dataset.workspaceTab;
    button.setAttribute('aria-pressed', String(button.dataset.panel === inspectorTabs.selected));
  });
  get('.section-status-row').prepend(get('[data-error]'));
  const viewTabs = get<HTMLElement>('.section-mobile-tabs');
  viewTabs.setAttribute('role', 'tablist');
  root.querySelectorAll<HTMLButtonElement>('[data-view-tab]').forEach(button => {
    const id = button.dataset.viewTab!;
    const pane = get<HTMLElement>(`.section-${id}-pane`);
    const panel = document.createElement('div');
    panel.className = 'section-view-panel';
    panel.id = `section-view-${id}`;
    pane.before(panel); panel.append(pane);
    button.id = `section-view-tab-${id}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
  });
  const narrow = window.matchMedia('(max-width: 600px)');
  let selectedView = 'solid';
  function selectView(id: string) {
    selectedView = id;
    get<HTMLElement>('[data-mobile-view]').dataset.mobileView = id;
    root.querySelectorAll<HTMLButtonElement>('[data-view-tab]').forEach(button => {
      const selected = button.dataset.viewTab === id;
      button.tabIndex = selected ? 0 : -1;
      button.setAttribute('aria-selected', String(selected)); button.setAttribute('aria-pressed', String(selected));
      const pane = get<HTMLElement>(`#section-view-${button.dataset.viewTab}`);
      pane.inert = narrow.matches && !selected;
      if (narrow.matches) {
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', button.id);
        pane.setAttribute('aria-hidden', String(!selected));
      } else {
        pane.removeAttribute('role'); pane.removeAttribute('aria-labelledby'); pane.removeAttribute('aria-hidden');
      }
    });
  }
  selectView(selectedView);
  narrow.addEventListener('change', () => selectView(selectedView), { signal });
  viewTabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectView(event.key === 'Home' ? 'solid' : event.key === 'End' ? 'slice' : selectedView === 'solid' ? 'slice' : 'solid');
    get<HTMLButtonElement>(`[data-view-tab="${selectedView}"]`).focus({ preventScroll: true });
  }, { signal });
  const history = new History(STUDIES[0].create(), STUDIES[0].id);
  let selectedId = history.current.primitives[0].id, nextId = 1;
  let solid: MeshResult | null = null, section: SliceResult | null = null;
  let resolvedKey = '', pending = true, fitNext = true, planeStart = 0;
  let rangePointer: number | null = null, previousTopology = '', latestImport = 0;
  let resolveReady: () => void = () => {}, rejectReady: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const report = (message: string) => { get<HTMLElement>('[data-status]').textContent = message; };
  function error(message: string) {
    const element = get<HTMLElement>('[data-error]');
    element.textContent = message; element.hidden = !message;
  }
  let view: ReturnType<typeof createSolidView>;
  try {
    view = createSolidView(get('[data-solid]'), {
      select(id) { selectedId = id; renderInspector(); inspectorTabs.select('construction'); dock.scrollTop = get<HTMLElement>('[data-object-inspector]').offsetTop; },
      beginPlane() { history.begin(); planeStart = history.current.plane.offset; },
      movePlane(delta) { const next = clone(history.current); next.plane.offset = Number(clamp(planeStart + delta, -240, 240).toFixed(2)); edit(next, false); },
      endPlane(cancel) { if (cancel) { history.cancel(); syncControls(); calculate(); } else history.finish(); updateHistory(); },
      report,
    });
  } catch (cause) { page.destroy(); throw cause; }
  page.onCleanup(view.destroy);
  const compute = new ComputeClient((response) => {
    if (!response.ok) {
      pending = false; root.dataset.computing = 'error';
      get<HTMLElement>('[data-rebuild]').hidden = true;
      error(response.error); report('Calculation stopped. Change the model or choose a coarser grid; JSON still saves your construction.');
      rejectReady(new Error(response.error));
      return;
    }
    if (response.mesh) { solid = response.mesh; resolvedKey = keyOf(history.current); }
    section = response.slice;
    pending = false; root.dataset.computing = 'false'; root.dataset.revision = String(response.revision);
    get<HTMLElement>('[data-rebuild]').hidden = true;
    view.busy(false); view.update(history.current, response.mesh, section, fitNext); fitNext = false;
    const empty = get<HTMLElement>('[data-empty-solid]');
    empty.hidden = solid?.state === 'resolved';
    empty.textContent = solid?.state === 'empty' ? 'Empty construction. Add a union, or change the intersecting fields.' : 'No resolved surface. The model is empty or smaller than this grid.';
    renderResults(); updateExports(); error('');
    if (solid) report(`${solid.triangles.toLocaleString('en-US')} triangles · ${solid.step.toFixed(2)} mm surface grid. ${solid.state === 'resolved' ? 'Solid and section are synchronized.' : solid.warnings[0]}`);
    root.dataset.ready = 'true'; resolveReady();
  });
  page.onCleanup(() => { compute.destroy(); rejectReady(new DOMException('SECTION was closed.', 'AbortError')); });

  function updateHistory() {
    get<HTMLButtonElement>('[data-action="undo"]').disabled = !history.canUndo;
    get<HTMLButtonElement>('[data-action="redo"]').disabled = !history.canRedo;
  }
  function updateExports() {
    get<HTMLButtonElement>('[data-action="stl"]').disabled = pending || solid?.state !== 'resolved' || root.dataset.computing === 'error';
    get<HTMLButtonElement>('[data-action="svg"]').disabled = pending || !section || root.dataset.computing === 'error';
  }
  function syncControls() {
    const document = history.current;
    const studyId = history.origin.studyId;
    const study = STUDIES.find((entry) => entry.id === studyId);
    get<HTMLElement>('[data-study-note]').textContent = study?.note ?? 'Your imported construction. Every operation, transform and section setting is editable.';
    get<HTMLElement>('[data-title]').textContent = document.title;
    const range = get<HTMLInputElement>('#section-offset');
    const limit = Math.max(80, Math.ceil(Math.abs(document.plane.offset) / 10) * 10);
    range.min = String(-limit); range.max = String(limit); range.value = String(document.plane.offset);
    get<HTMLInputElement>('[data-offset-number]').value = String(document.plane.offset);
    get<HTMLSelectElement>('[data-resolution]').value = String(document.resolution);
    const planeFields = get<HTMLElement>('[data-plane-fields]');
    if (!planeFields.children.length) planeFields.innerHTML = document.plane.rotation.map((value, i) => numeric(['Tilt X / deg', 'Tilt Y / deg', 'Twist Z / deg'][i], `plane-${i}`, value, -180, 180)).join('');
    else document.plane.rotation.forEach((value, i) => { get<HTMLInputElement>(`[data-field="plane-${i}"]`).value = String(value); });
    const frame = planeBasis(document.plane);
    get<HTMLElement>('[data-basis]').innerHTML = `<span>World normal n</span><strong>${frame.normal.map((value) => value.toFixed(3)).join(' / ')}</strong><span>Plane origin / mm</span><strong>${frame.origin.map((value) => value.toFixed(1)).join(' / ')}</strong>`;
    root.querySelectorAll<HTMLButtonElement>('[data-study]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.study === study?.id)));
    updateHistory();
  }
  function renderStack() {
    const document = history.current;
    get<HTMLElement>('[data-stack]').innerHTML = document.primitives.map((item, i) => `<li><button type="button" data-select="${item.id}" aria-pressed="${item.id === selectedId}" aria-label="${i + 1}. ${opLabel(item.operation)} ${escapeMarkup(item.name)}"><span class="section-stack-index">${String(i + 1).padStart(2, '0')}</span>${icon(item.kind)}<span class="section-stack-name">${escapeMarkup(item.name)}<small>${opLabel(item.operation)} / ${item.kind}</small></span><span class="section-stack-op">${opSymbol(item.operation)}</span></button></li>`).join('');
    get<HTMLElement>('[data-count]').textContent = `${document.primitives.length} / ${LIMITS.primitives}`;
  }
  function renderInspector() {
    const document = history.current;
    const focused = window.document.activeElement;
    const action = focused instanceof HTMLElement && focused.closest('[data-object-inspector]') ? focused.dataset.action : undefined;
    if (!document.primitives.some((item) => item.id === selectedId)) selectedId = document.primitives[0]?.id ?? '';
    renderStack();
    const selected = document.primitives.find((item) => item.id === selectedId);
    get<HTMLElement>('[data-object-inspector]').innerHTML = objectInspector(selected);
    get<HTMLButtonElement>('[data-action="add"]').disabled = document.primitives.length >= LIMITS.primitives;
    const index = document.primitives.findIndex((item) => item.id === selectedId);
    const up = root.querySelector<HTMLButtonElement>('[data-action="up"]'), down = root.querySelector<HTMLButtonElement>('[data-action="down"]');
    if (up) up.disabled = index <= 0;
    if (down) down.disabled = index < 0 || index >= document.primitives.length - 1;
    view.highlight(selected);
    if (action) {
      const replacement = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
      else root.querySelector<HTMLButtonElement>(`[data-select="${selectedId}"]`)?.focus({ preventScroll: true });
    }
  }
  function renderResults() {
    if (!solid || !section) return;
    const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
    get<HTMLElement>('[data-volume]').textContent = format(solid.volume);
    get<HTMLElement>('[data-area]').textContent = format(section.area);
    get<HTMLElement>('[data-bounds]').textContent = solid.bounds ? solid.bounds.max.map((value, i) => (value - solid!.bounds!.min[i]).toFixed(1)).join(' × ') : 'No bounds';
    get<HTMLElement>('[data-drawing]').innerHTML = sectionDrawing(history.current, section);
    const topology = `${section.islands} island${section.islands === 1 ? '' : 's'} / ${section.holes} hole${section.holes === 1 ? '' : 's'}`;
    get<HTMLElement>('[data-topology]').innerHTML = `<strong>${topology}</strong><span>${section.open ? 'Unjoined contours: topology uncertain' : previousTopology && topology !== previousTopology ? `Previously ${previousTopology}` : section.area > 0 ? 'Material / void · sampled topology' : 'Empty cut or sub-grid material'}</span>`;
    previousTopology = topology;
    get<HTMLElement>('[data-slice-grid]').textContent = `${section.step.toFixed(2)} mm section sampling`;
    get<HTMLElement>('[data-resolution-note]').textContent = `${solid.step.toFixed(2)} mm surface / ${section.step.toFixed(2)} mm section. ${solid.warnings.join(' ')}`;
  }
  function calculate(immediate = false) {
    pending = true; root.dataset.computing = 'true'; updateExports();
    const needsMesh = keyOf(history.current) !== resolvedKey;
    view.busy(needsMesh); view.previewPlane(history.current);
    const rebuild = get<HTMLElement>('[data-rebuild]');
    rebuild.hidden = !needsMesh; rebuild.textContent = 'Rebuilding the actual solid…';
    get<HTMLElement>('[data-empty-solid]').hidden = true;
    get<HTMLElement>('[data-drawing]').innerHTML = '<div class="section-slice-pending">Tracing this cut…<span>Measurements update together.</span></div>';
    get<HTMLElement>('[data-topology]').innerHTML = '<span>Recomputing material and void</span>';
    if (needsMesh) { get<HTMLElement>('[data-volume]').textContent = '…'; get<HTMLElement>('[data-bounds]').textContent = '…'; }
    get<HTMLElement>('[data-area]').textContent = '…';
    report(needsMesh ? 'Rebuilding the field. Superseded calculations are cancelled.' : 'Tracing the new section plane.');
    compute.request(clone(history.current), needsMesh, immediate);
  }
  function edit(next: Document, inspector = true) {
    try {
      if (history.change(next)) { error(''); syncControls(); if (inspector) renderInspector(); calculate(); }
    } catch (cause) {
      if (!(cause instanceof ValidationError)) throw cause;
      error(`${cause.message} The last valid model is unchanged.`);
    }
  }
  function loadConstruction(document: Document, studyId: string | null) {
    history.load(document, studyId);
    selectedId = history.current.primitives[0]?.id ?? ''; fitNext = true; previousTopology = '';
    error(''); syncControls(); renderInspector(); calculate();
  }
  function setPanel(panel: 'construction' | 'plane') {
    inspectorTabs.select(panel);
  }
  function stepCut(delta: number) {
    const next = clone(history.current); next.plane.offset = clamp(next.plane.offset + delta, -240, 240); edit(next, false);
  }
  function reset() {
    history.finish();
    const baseline = history.origin.baseline;
    selectedId = baseline.primitives[0]?.id ?? ''; previousTopology = '';
    if (serializeDocument(history.current) === serializeDocument(baseline)) { renderInspector(); view.frameModel(solid?.bounds ?? null); }
    else { fitNext = true; edit(baseline); }
  }
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.study) {
      const study = STUDIES.find((entry) => entry.id === button.dataset.study);
      if (!study) return;
      loadConstruction(study.create(), study.id); return;
    }
    if (button.dataset.select) {
      selectedId = button.dataset.select; renderInspector();
      root.querySelector<HTMLButtonElement>(`[data-select="${selectedId}"]`)?.focus({ preventScroll: true }); return;
    }
    if (button.dataset.panel === 'construction' || button.dataset.panel === 'plane') { setPanel(button.dataset.panel); return; }
    if (button.dataset.viewTab) {
      selectView(button.dataset.viewTab); return;
    }
    if (button.dataset.mode === 'view' || button.dataset.mode === 'plane') {
      view.mode(button.dataset.mode);
      root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
      get<HTMLElement>('[data-mode-help]').textContent = button.dataset.mode === 'plane' ? 'Drag vertically or use arrow keys. Esc cancels.' : 'Drag to orbit. Click a surface to inspect.'; return;
    }
    if (button.dataset.planePreset) {
      const next = clone(history.current);
      next.plane.rotation = button.dataset.planePreset === 'XY' ? [0, 0, 0] : button.dataset.planePreset === 'XZ' ? [90, 0, 0] : [0, 90, 0];
      edit(next, false); return;
    }
    switch (button.dataset.action) {
      case 'add': {
        const kind = KINDS.find((entry) => entry === get<HTMLSelectElement>('[data-kind]').value);
        if (!kind || history.current.primitives.length >= LIMITS.primitives) break;
        const next = clone(history.current);
        while (next.primitives.some((item) => item.id === `primitive-${nextId}`)) nextId++;
        const item = primitive(kind, `primitive-${nextId++}`);
        selectedId = item.id; next.primitives.push(item); edit(next); break;
      }
      case 'remove': {
        const next = clone(history.current); next.primitives = next.primitives.filter((item) => item.id !== selectedId); edit(next); break;
      }
      case 'up': case 'down': {
        const next = clone(history.current), index = next.primitives.findIndex((item) => item.id === selectedId), destination = index + (button.dataset.action === 'up' ? -1 : 1);
        if (index >= 0 && destination >= 0 && destination < next.primitives.length) { [next.primitives[index], next.primitives[destination]] = [next.primitives[destination], next.primitives[index]]; edit(next); }
        break;
      }
      case 'undo': case 'redo': if (button.dataset.action === 'undo' ? history.undo() : history.redo()) { syncControls(); renderInspector(); calculate(); } break;
      case 'reset': reset(); break;
      case 'fit': view.frameModel(solid?.bounds ?? null); break;
      case 'zoom-in': view.zoom(1.2); break;
      case 'zoom-out': view.zoom(1 / 1.2); break;
      case 'cut-inspector': setPanel('plane'); get<HTMLButtonElement>('[data-panel="plane"]').focus({ preventScroll: true }); break;
      case 'cut-back': stepCut(-5); break;
      case 'cut-forward': stepCut(5); break;
      case 'center-cut': { const next = clone(history.current); next.plane.offset = 0; edit(next, false); break; }
      case 'open': get<HTMLInputElement>('[data-file]').click(); break;
      case 'save': downloadText('section-study.json', serializeDocument(history.current), 'application/json'); report('Saved the editable model and plane as version 1 JSON.'); break;
      case 'stl': if (solid && !pending) { downloadBlob('section-solid-mm.stl', new Blob([exportSTL(solid)], { type: 'model/stl' })); report('Exported the full sampled solid in millimeters. Manufacturing suitability is not certified.'); } break;
      case 'svg': if (section && !pending) { downloadText('section-cut.svg', sectionDrawing(history.current, section, true), 'image/svg+xml'); report('Exported the section with measured dimensions and embedded model metadata.'); } break;
    }
  }, { signal });
  root.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
    if (input.matches('[data-file]')) return;
    if (input.matches('[data-clip]') && input instanceof HTMLInputElement) { view.clipping(input.checked); return; }
    if (input.matches('#section-offset')) { history.finish(); updateHistory(); return; }
    const next = clone(history.current);
    if (input.matches('[data-offset-number]')) {
      if (!input.value) { error('Enter a finite plane offset. The last valid model is unchanged.'); return; }
      next.plane.offset = Number(input.value); edit(next, false); return;
    }
    if (input.matches('[data-resolution]')) {
      const resolution = Number(input.value);
      if (resolution === 28 || resolution === 44 || resolution === 64) { next.resolution = resolution; edit(next, false); }
      return;
    }
    const field = input.dataset.field;
    if (!field) return;
    if (input.value === '') { error('Enter a value. The last valid model is unchanged.'); return; }
    if (field.startsWith('plane-')) { next.plane.rotation[Number(field.split('-')[1])] = Number(input.value); edit(next, false); return; }
    const item = next.primitives.find((entry) => entry.id === selectedId);
    if (!item) return;
    if (field === 'name') item.name = input.value;
    else if (field === 'operation') {
      const operation = OPERATIONS.find((entry) => entry === input.value); if (operation) item.operation = operation;
    } else if (field === 'radius' || field === 'tube') item[field] = Number(input.value);
    else {
      const [property, axis] = field.split('-');
      if (property === 'position' || property === 'rotation' || property === 'size') item[property][Number(axis)] = Number(input.value);
    }
    edit(next, false);
    if (field === 'name' || field === 'operation') {
      renderStack();
      get<HTMLElement>('.section-selected-heading h3').textContent = history.current.primitives.find((entry) => entry.id === selectedId)?.name ?? '';
    }
  }, { signal });
  const range = get<HTMLInputElement>('#section-offset');
  range.addEventListener('pointerdown', (event) => {
    if (rangePointer !== null || !event.isPrimary) { event.preventDefault(); return; }
    rangePointer = event.pointerId; range.setPointerCapture(event.pointerId); history.begin();
  }, { signal });
  range.addEventListener('input', () => { history.begin(); const next = clone(history.current); next.plane.offset = Number(range.value); edit(next, false); }, { signal });
  range.addEventListener('pointerup', (event) => { if (rangePointer !== event.pointerId) return; rangePointer = null; history.finish(); updateHistory(); }, { signal });
  range.addEventListener('pointercancel', (event) => { if (rangePointer !== event.pointerId) return; rangePointer = null; history.cancel(); syncControls(); calculate(); }, { signal });
  range.addEventListener('keydown', (event) => { if (event.key === 'Escape') { history.cancel(); syncControls(); calculate(); } }, { signal });
  root.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLElement) || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      const redo = event.shiftKey || event.key.toLowerCase() === 'y';
      if (redo ? history.redo() : history.undo()) { syncControls(); renderInspector(); calculate(); }
    }
  }, { signal });
  get<HTMLInputElement>('[data-file]').addEventListener('change', async (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    fileDialog.close();
    const importId = ++latestImport;
    if (file.size > LIMITS.fileBytes) { error('The file exceeds 64 KB. Your current study has not changed.'); return; }
    try {
      const imported = parseDocument(await file.text());
      if (signal.aborted || importId !== latestImport) return;
      loadConstruction(imported, null); report('Opened the validated construction. Rebuilding its geometry.');
    } catch (cause) {
      if (signal.aborted) return;
      if (!(cause instanceof ValidationError || cause instanceof DOMException)) throw cause;
      error(`${cause.message} Your current study has not changed.`);
    }
  }, { signal });
  syncControls(); renderInspector(); calculate(true);
  try { await ready; }
  catch (cause) { page.destroy(); throw cause; }
  return { destroy: page.destroy, reset };
}
