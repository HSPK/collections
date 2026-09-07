import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { clamp, degrees, sub } from './geometry';
import { BENCH, createElement, ELEMENT_KINDS, isRefractor, KIND_NAMES, MATERIAL_IDS } from './model';
import type { Experiment, OpticalElement, Vec } from './model';
import { materialIndex, MATERIALS, measureDetector, TRACE_LIMITS, traceExperiment, wavelengthColor } from './optics';
import { PRESETS, presetScene } from './presets';
import { DEFAULT_RENDER_OPTIONS, exportSceneSvg, opticGlyph, sceneLayers } from './renderer';
import {
  beginEdit, cancelEdit, changeScene, createHistory, ExperimentValidationError, finishEdit,
  MAX_ELEMENTS, MAX_EMITTERS, MAX_FILE_BYTES, nextId, parseExperiment, redo, replaceElement, serializeExperiment, undo, validateElement,
} from './state';
import { arrangeWorkspace } from './workspace';

const icons = {
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -3)" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function shell(): string {
  return `<div class="lumen-wrap">
    <header class="lumen-header">
      <div class="lumen-brand"><svg viewBox="0 0 54 54" aria-hidden="true"><path d="m27 5 23 41H4Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M0 29h20l30 8M20 29l30 14M20 29l30 2" fill="none" stroke="#b88039" stroke-width="1.4"/><circle cx="27" cy="29" r="3" fill="#f6f3e8" stroke="currentColor"/></svg><h1>LUMEN<span>Spectral optical workbench</span></h1></div>
      <div class="lumen-file-actions"><button type="button" data-action="open">Open<span class="lumen-wide-label"> experiment</span></button><button type="button" data-action="save">Save<span class="lumen-wide-label"> experiment</span></button><button type="button" class="lumen-primary" data-action="svg">${icons.export}<span>Export SVG</span></button><input type="file" data-import accept=".json,application/json" hidden aria-label="Import Lumen experiment"></div>
    </header>
    <p class="lumen-file-error" data-file-error role="alert"></p>
    <nav class="lumen-presets" aria-label="Optical experiments"><span class="lumen-eyebrow">Start a study</span>${PRESETS.map((preset, index) => `<button type="button" data-preset="${preset.id}" aria-pressed="${index === 0}"><span class="lumen-preset-number">0${index + 1}</span>${preset.name}</button>`).join('')}</nav>
    <section class="lumen-workspace" data-project-preview aria-label="Lumen optical drafting instrument">
      <div class="lumen-instrument-heading"><div><span class="lumen-eyebrow" data-study-label>Experiment 01 / Dispersion</span><h2 data-scene-title></h2></div><span class="lumen-live"><i></i> Live ray trace</span></div>
      <div class="lumen-tools">
        <div class="lumen-add-tools"><label class="lumen-sr-only" for="lumen-add-kind">Element to add</label><select id="lumen-add-kind" data-add-kind>${ELEMENT_KINDS.map((kind) => `<option value="${kind}"${kind === 'prism' ? ' selected' : ''}>${KIND_NAMES[kind]}</option>`).join('')}</select><button type="button" data-action="add"><span aria-hidden="true">+</span> Add<span class="lumen-wide-label"> element</span></button></div>
        <div class="lumen-view-tools"><label><input type="checkbox" data-view="grid" checked> Grid</label><label><input type="checkbox" data-view="normals"> Normals</label><label><input type="checkbox" data-view="reflections" checked> Faint rays</label></div>
        <div class="lumen-history-tools"><button type="button" class="lumen-icon-button" data-action="undo" aria-label="Undo last edit" title="Undo (Ctrl/Cmd Z)">${icons.undo}</button><button type="button" class="lumen-icon-button" data-action="redo" aria-label="Redo last edit" title="Redo (Ctrl/Cmd Shift Z)">${icons.redo}</button><button type="button" data-action="reset">Reset study</button></div>
      </div>
      <div class="lumen-main">
        <div class="lumen-field-column">
          <div class="lumen-bench-wrap"><svg class="lumen-bench" data-bench viewBox="0 0 1000 600" role="group" aria-label="Interactive optical bench" aria-describedby="lumen-bench-help" tabindex="0"></svg></div>
          <div class="lumen-bench-caption"><span id="lumen-bench-help">Drag to move. Use the round handle to rotate.</span><div><span data-trace-count></span><label><span class="lumen-sr-only">Bench magnification</span><select data-zoom><option value="1">Fit bench</option><option value="2">2x detail</option></select></label><button type="button" class="lumen-mobile-jump" data-action="inspect">Inspect</button></div></div>
          <section class="lumen-readout" aria-labelledby="lumen-readout-title">
            <div class="lumen-readout-heading"><h3 id="lumen-readout-title"><span class="lumen-status-dot"></span> Detector readout</h3><label><span class="lumen-sr-only">Measured detector</span><select data-detector-select></select></label></div>
            <div data-measurement></div>
          </section>
          <details class="lumen-energy"><summary><span>Energy ledger</span><span data-energy-summary></span></summary><div data-energy></div></details>
        </div>
        <aside class="lumen-drawer" aria-label="Instrument drawer">
          <div class="lumen-drawer-switch" role="group" aria-label="Instrument panels"><button type="button" data-panel="inspector" aria-pressed="true">Inspector</button><button type="button" data-panel="notebook" aria-pressed="false">Notebook<span class="lumen-note-dot"></span></button><button type="button" class="lumen-mobile-jump" data-action="bench">Bench &#8593;</button></div>
          <section data-inspector aria-label="Element inspector"><div class="lumen-element-picker"><label for="lumen-selection">On the bench</label><select id="lumen-selection" data-selection></select></div><div data-inspector-content></div><p class="lumen-error" data-edit-error role="alert"></p></section>
          <section data-notebook aria-label="Optics notebook" hidden>
            <div data-guide></div>
            <details class="lumen-surface-log"><summary>Inspect the surface log</summary><p>Strongest incident sample at the selected optic. Angles are measured from the surface normal.</p><div data-surface-log></div></details>
            <div class="lumen-notebook-fields"><label for="lumen-title">Experiment name<input id="lumen-title" data-title maxlength="100"></label><label for="lumen-notes">Your observations<textarea id="lumen-notes" data-notes rows="5" maxlength="8000" placeholder="What changes when you turn the glass?"></textarea></label><button type="button" data-action="record">Record current reading</button><p>Geometry and notes travel together in your saved JSON experiment.</p></div>
          </section>
          <p class="lumen-key-hint">Keyboard: select an element, then use arrow keys to move 2 mm. Shift moves 10 mm. Use the inspector for exact values.</p>
        </aside>
      </div>
    </section>
    <div class="lumen-lower"><p class="lumen-status" data-status role="status">Ready to explore. Your working copy stays here until you download it.</p><details class="lumen-method"><summary>A note on the physics</summary><div><p>Lumen models <strong>2D geometric optics</strong>, not diffraction, polarization, interference or wave propagation. This is an exploratory instrument, not a calibrated optical-design package. Bench distances are millimeters; angles increase clockwise from the rightward axis.</p><p>Materials use a two-term Cauchy approximation, <strong>n = A + B / wavelength<sup>2</sup></strong>, with wavelength in micrometers. Crown: A = 1.5046, B = 0.0042; dense flint: A = 1.62, B = 0.015; water: A = 1.322, B = 0.003. These are illustrative fits. Air is n = 1.</p><p>At every refractive interface, unpolarized Fresnel reflectance divides the incident energy. Bulk transmission is exp(-absorption &#215; distance): crown 0.00008/mm, flint 0.00018/mm, water 0.00004/mm. The detector is an ideal, double-sided absorbing line. Its bars show collected power as a fraction of emitted power at that sampled wavelength, not a continuous measured spectrum.</p><p>At most ${TRACE_LIMITS.maxBranches.toLocaleString('en-US')} ray branches and ${TRACE_LIMITS.maxDepth} surface interactions per path; branches below 20 nW are stopped. The ledger reports all stopped energy separately. Faint rays are dashed; line opacity follows relative ray energy. Refractors may overlap: the last element in the list supplies the medium in an overlap. Edges and corners have no diffraction.</p></div></details></div>
    <footer class="lumen-footer"><span>LUMEN / An instrument for seeing why.</span><span>Local by design. No accounts. No uploads.</span></footer>
  </div>`;
}

function numberField(label: string, field: string, value: number, min: number, max: number, step = 1): string {
  return `<label>${label}<input type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}" aria-describedby="lumen-inspector-guidance"></label>`;
}

function inspectorMarkup(element: OpticalElement | undefined): string {
  if (!element) return '<div class="lumen-empty"><h3>A clear optical bench.</h3><p>Add an emitter and an optic to begin an experiment.</p></div>';
  let properties = '';
  switch (element.kind) {
    case 'prism': properties = numberField('Side length / mm', 'size', element.size, 40, 360); break;
    case 'lens': properties = `${numberField('Diameter / mm', 'diameter', element.diameter, 40, 360)}${numberField('Thickness / mm', 'thickness', element.thickness, 4, element.diameter * 0.8)}`; break;
    case 'block': properties = `${numberField('Width / mm', 'width', element.width, 15, 300)}${numberField('Height / mm', 'height', element.height, 30, 360)}`; break;
    case 'mirror': properties = `${numberField('Length / mm', 'length', element.length, 20, 420)}${numberField('Reflectivity / 0-1', 'reflectivity', element.reflectivity, 0, 1, 0.01)}`; break;
    case 'detector': properties = numberField('Active length / mm', 'length', element.length, 10, 480); break;
    case 'emitter': properties = `<label class="lumen-full-field">Spectral mode<select data-field="spectrum"><option value="white"${element.spectrum === 'white' ? ' selected' : ''}>White / 7 sampled bands</option><option value="mono"${element.spectrum === 'mono' ? ' selected' : ''}>Monochromatic</option></select></label>
      ${numberField('Wavelength / nm', 'wavelength', element.wavelength, 380, 750)}${numberField('Power / mW', 'power', element.power, 0.01, 10, 0.01)}
      ${numberField('Aperture / mm', 'aperture', element.aperture, 0, 180)}${numberField('Fan angle / deg', 'spread', element.spread, 0, 60)}
      ${numberField('Rays per band', 'rays', element.rays, 1, 15)}`; break;
  }
  const material = isRefractor(element) ? `<div class="lumen-inspector-section"><label>Optical material<select data-field="material">${MATERIAL_IDS.map((id) => `<option value="${id}"${element.material === id ? ' selected' : ''}>${MATERIALS[id].name}</option>`).join('')}</select></label><div class="lumen-index-card"><span>Index at 540 nm</span><strong data-material-index></strong></div><p class="lumen-field-note">Shorter wavelengths bend more. The index follows the Cauchy model.</p></div>` : '';
  const note = element.kind === 'lens' ? 'Spherical surfaces, not a thin-lens shortcut. Thickness must be at most 80% of diameter.'
    : element.kind === 'detector' ? 'An absorbing screen. Its readout uses real ray intersections; missed rays contribute nothing.'
      : element.kind === 'emitter' ? 'The fan spreads symmetrically around the aim angle. One ray uses the center of the aperture. White mode fixes seven wavelengths.'
        : element.kind === 'mirror' ? 'Double-sided reflection. Reflectivity is the fraction of incident power kept at each bounce.'
          : 'Drag the center to move. Drag the round handle to rotate, or enter exact values here.';
  return `<div class="lumen-selected-heading"><span class="lumen-selected-icon">${opticGlyph(element.kind)}</span><div><span class="lumen-eyebrow">Selected element</span><h3>${KIND_NAMES[element.kind]}</h3></div><span class="lumen-selected-badge">EDIT</span></div>
    <label class="lumen-label-field">Label<input type="text" data-field="label" maxlength="48" value="${escapeMarkup(element.label)}"></label>
    <div class="lumen-inspector-section"><h4>Position &amp; geometry</h4><div class="lumen-fields">
      ${numberField('X / mm', 'x', element.x, 20, 980)}${numberField('Y / mm', 'y', element.y, 20, 580)}
      ${numberField('Rotation / deg', 'rotation', element.rotation, -180, 180)}${properties}
    </div></div>${material}
    <p class="lumen-field-note" id="lumen-inspector-guidance">${note}</p>
    <button type="button" class="lumen-remove" data-action="remove">Remove element</button>`;
}

export function mountLumen(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'lumen');
  const { root, signal } = page;
  root.innerHTML = shell();
  const workspace = arrangeWorkspace(page);
  let activePreset = 'dispersion';
  let resetScene = presetScene(activePreset);
  let history = createHistory(resetScene);
  const studyByScene = new WeakMap<Experiment, { preset: string; baseline: Experiment }>([
    [history.present, { preset: activePreset, baseline: resetScene }],
  ]);
  let renderedPreset: string | undefined;
  let selectedId: string | null = 'prism-1';
  let detectorId = 'detector-1';
  let trace = traceExperiment(history.present);
  const options = { ...DEFAULT_RENDER_OPTIONS };
  const bench = query<SVGSVGElement>(root, '[data-bench]');
  const selection = query<HTMLSelectElement>(root, '[data-selection]');
  const inspector = query<HTMLElement>(root, '[data-inspector-content]');
  const measurement = query<HTMLElement>(root, '[data-measurement]');
  const detectorSelect = query<HTMLSelectElement>(root, '[data-detector-select]');
  const fileInput = query<HTMLInputElement>(root, '[data-import]');
  const fileError = query<HTMLElement>(root, '[data-file-error]');
  const editError = query<HTMLElement>(root, '[data-edit-error]');
  const titleInput = query<HTMLInputElement>(root, '[data-title]');
  const notesInput = query<HTMLTextAreaElement>(root, '[data-notes]');
  let importSequence = 0;
  let zoom = 1;
  let camera: Vec = { x: 0, y: 0 };
  let pan: { pointer: number; start: Vec; original: Vec; scale: number } | null = null;
  let drag: { id: string; mode: 'move' | 'rotate'; pointer: number; start: Vec; original: OpticalElement } | null = null;
  let renderedSelection: string | null | undefined;

  function announce(message: string): void {
    if (!signal.aborted) query<HTMLElement>(root, '[data-status]').textContent = message;
  }

  function selected(): OpticalElement | undefined {
    return history.present.elements.find((element) => element.id === selectedId);
  }

  function renderMeasurement(): void {
    const detectors = history.present.elements.filter((element) => element.kind === 'detector');
    if (!detectors.some((element) => element.id === detectorId)) detectorId = detectors[0]?.id ?? '';
    const newOptions = detectors.map((element) => `<option value="${element.id}">${escapeMarkup(element.label)}</option>`).join('');
    if (detectorSelect.innerHTML !== newOptions) detectorSelect.innerHTML = newOptions;
    detectorSelect.value = detectorId;
    detectorSelect.disabled = !detectors.length;
    if (!detectorId) {
      query<HTMLElement>(root, '[data-live-power]').textContent = 'No detector';
      measurement.innerHTML = '<p class="lumen-empty-reading">Add a detector to measure the beam. Rays leaving the bench are counted as escaped energy.</p>';
    } else {
      const reading = measureDetector(trace, { id: detectorId });
      query<HTMLElement>(root, '[data-live-power]').textContent = `${reading.power.toFixed(3)} mW collected`;
      measurement.innerHTML = `<div class="lumen-measure-grid"><div class="lumen-meter-values">
        <div><span>Collected power</span><strong data-power="${reading.power}">${reading.power.toFixed(3)}<small>mW</small></strong><span data-capture>${(reading.capture * 100).toFixed(1)}% of all input</span></div>
        <div><span>Band separation</span><strong data-separation="${reading.separation ?? ''}">${reading.separation === null ? '&mdash;' : reading.separation.toFixed(1)}<small>mm</small></strong><span>Outer captured bands</span></div>
      </div><div class="lumen-spectrum" aria-label="Measured spectral capture"><div class="lumen-spectrum-head"><span>Power by wavelength</span><span>0-100% / band</span></div>
      <div class="lumen-spectrum-bars">${reading.spectrum.map((band) => `<div class="lumen-band" data-band="${band.wavelength}" data-band-power="${band.power}" aria-label="${band.wavelength} nanometers: ${band.power.toFixed(4)} milliwatts, ${(band.capture * 100).toFixed(1)} percent captured"><div class="lumen-band-track"><span style="height:${clamp(band.capture * 100, 0, 100)}%;background:${wavelengthColor(band.wavelength)}"></span></div><span>${band.wavelength}</span></div>`).join('')}</div>
      <p>${reading.spectrum.length} discrete ${reading.spectrum.length === 1 ? 'wavelength' : 'wavelengths'} / nm</p></div></div>
      <div class="lumen-spot-reading"><span data-hit-count>${reading.count} ray hits</span><span data-centroid>Centroid ${reading.centroid === null ? '--' : `${reading.centroid >= 0 ? '+' : ''}${reading.centroid.toFixed(1)}`} mm</span><span data-rms>RMS spot ${reading.rmsWidth === null ? '--' : reading.rmsWidth.toFixed(1)} mm</span></div>
      ${reading.power === 0 ? '<p class="lumen-no-signal">No rays reach this detector. Move or lengthen the screen to intercept the beam.</p>' : ''}`;
    }
    const energy = trace.energy;
    query<HTMLElement>(root, '[data-energy-summary]').textContent = `${energy.emitted.toFixed(2)} mW in / ${(energy.detected + energy.absorbed + energy.escaped + energy.truncated).toFixed(2)} mW accounted`;
    const ledger = [
      { name: 'Detected', value: energy.detected, color: '#637b62' },
      { name: 'Absorbed', value: energy.absorbed, color: '#b98846' },
      { name: 'Escaped', value: energy.escaped, color: '#b8bbae' },
      { name: 'Below limits', value: energy.truncated, color: '#ad7770' },
    ];
    query<HTMLElement>(root, '[data-energy]').innerHTML = `<div class="lumen-energy-bar" aria-hidden="true">${ledger.map((entry) => `<span style="width:${energy.emitted ? entry.value / energy.emitted * 100 : 0}%;background:${entry.color}"></span>`).join('')}</div><dl>${ledger.map((entry) => `<div><dt>${entry.name}</dt><dd>${entry.value > 0 && entry.value < 0.001 ? `${(entry.value * 1e6).toFixed(0)} nW` : `${entry.value.toFixed(3)} mW`}</dd></div>`).join('')}</dl><p>Stopped energy is not relabeled as absorption. Limit: ${trace.limits.maxDepth} interactions, ${trace.limits.maxBranches} branches, 20 nW cutoff.</p>`;
  }

  function renderNotebook(): void {
    const preset = PRESETS.find((entry) => entry.id === activePreset);
    query<HTMLElement>(root, '[data-guide]').innerHTML = preset ? `<div class="lumen-guide-intro"><span class="lumen-eyebrow">Field notes / ${escapeMarkup(preset.topic)}</span><h3>${escapeMarkup(preset.title)}</h3><p>${escapeMarkup(preset.description)}</p></div><ol class="lumen-guide-steps">${preset.steps.map((step) => `<li><h4>${escapeMarkup(step.title)}</h4><p>${escapeMarkup(step.detail)}</p></li>`).join('')}</ol>` : '<div class="lumen-guide-intro"><span class="lumen-eyebrow">Your experiment</span><h3>Keep asking the light.</h3><p>Change one quantity, observe the detector, and record the result. Your imported notes are below.</p></div>';
  }

  function render(): void {
    if (signal.aborted) return;
    const study = studyByScene.get(history.present);
    if (study) {
      activePreset = study.preset;
      resetScene = study.baseline;
    }
    studyByScene.set(history.present, { preset: activePreset, baseline: resetScene });
    if (renderedPreset !== activePreset) {
      renderedPreset = activePreset;
      workspace.study.value = activePreset;
      const index = PRESETS.findIndex((preset) => preset.id === activePreset);
      query<HTMLElement>(root, '[data-study-label]').textContent = index < 0 ? 'Imported experiment / Working copy' : `Experiment 0${index + 1} / ${PRESETS[index].topic}`;
      root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry.dataset.preset === activePreset)));
      renderNotebook();
    }
    if (!history.present.elements.some((element) => element.id === selectedId)) selectedId = history.present.elements[0]?.id ?? null;
    const element = selected();
    trace = traceExperiment(history.present);
    const active = document.activeElement;
    const focusedId = active?.getAttribute('data-optic-id');
    const focusedRotation = active?.getAttribute('data-rotate');
    bench.innerHTML = sceneLayers(history.present, trace, selectedId, options);
    if (focusedId) bench.querySelector<SVGGElement>(`[data-optic-id="${focusedId}"]`)?.focus({ preventScroll: true });
    if (focusedRotation) bench.querySelector<SVGGElement>(`[data-rotate="${focusedRotation}"]`)?.focus({ preventScroll: true });
    query<HTMLElement>(root, '[data-scene-title]').textContent = history.present.title;
    query<HTMLElement>(root, '[data-trace-count]').textContent = `${trace.segments.length} traced segments`;
    query<HTMLButtonElement>(root, '[data-action="undo"]').disabled = history.past.length === 0 && !history.transaction;
    query<HTMLButtonElement>(root, '[data-action="redo"]').disabled = history.future.length === 0;
    selection.innerHTML = history.present.elements.map((item) => `<option value="${item.id}">${escapeMarkup(item.label)}</option>`).join('');
    selection.disabled = history.present.elements.length === 0;
    selection.value = selectedId ?? '';
    if (renderedSelection !== selectedId) {
      inspector.innerHTML = inspectorMarkup(element);
      renderedSelection = selectedId;
      editError.textContent = '';
    }
    if (element) {
      for (const input of inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')) {
        const field = input.dataset.field;
        if (!field) continue;
        const value = Object.entries(element).find(([key]) => key === field)?.[1];
        if (document.activeElement !== input && value !== undefined) input.value = String(value);
        if (field === 'wavelength' && element.kind === 'emitter') input.disabled = element.spectrum === 'white';
        if (field === 'thickness' && input instanceof HTMLInputElement && element.kind === 'lens') input.max = String(element.diameter * 0.8);
      }
      if (isRefractor(element)) query<HTMLElement>(inspector, '[data-material-index]').textContent = materialIndex(element.material, 540).toFixed(3);
    }
    if (document.activeElement !== titleInput) titleInput.value = history.present.title;
    if (document.activeElement !== notesInput) notesInput.value = history.present.notes;
    const relevant = trace.interactions.filter((hit) => hit.elementId === selectedId).sort((a, b) => b.power - a.power)[0];
    query<HTMLElement>(root, '[data-surface-log]').innerHTML = relevant ? `<dl><div><dt>Sample</dt><dd>${relevant.wavelength} nm</dd></div><div><dt>Index in / out</dt><dd>${relevant.n1.toFixed(3)} / ${relevant.n2.toFixed(3)}</dd></div><div><dt>Incidence</dt><dd>${relevant.incidentAngle.toFixed(1)} deg</dd></div><div><dt>Refraction</dt><dd>${relevant.transmittedAngle === null ? 'TIR / no transmitted ray' : `${relevant.transmittedAngle.toFixed(1)} deg`}</dd></div><div><dt>Fresnel reflected</dt><dd>${(relevant.reflectance * 100).toFixed(1)}%</dd></div></dl>` : '<p>Select a refractor that the light reaches to inspect an interface.</p>';
    renderMeasurement();
  }

  function choose(id: string): void {
    selectedId = id;
    centerView();
    render();
  }

  function setScene(scene: Experiment, message: string): void {
    studyByScene.set(scene, { preset: activePreset, baseline: resetScene });
    history = changeScene(history, scene);
    render();
    announce(message);
  }

  function cancelDrag(): void {
    if (pan) {
      const canceled = pan;
      pan = null;
      camera = canceled.original;
      applyCamera();
      if (bench.hasPointerCapture(canceled.pointer)) bench.releasePointerCapture(canceled.pointer);
    }
    if (!drag) return;
    const pointer = drag.pointer;
    drag = null;
    history = cancelEdit(history);
    if (bench.hasPointerCapture(pointer)) bench.releasePointerCapture(pointer);
    render();
    announce('Drag canceled. The element is back where it started.');
  }

  function applyCamera(): void {
    bench.setAttribute('viewBox', `${camera.x} ${camera.y} ${BENCH.width / zoom} ${BENCH.height / zoom}`);
    bench.dataset.magnification = String(zoom);
    query<HTMLElement>(root, '#lumen-bench-help').textContent = zoom === 1 ? 'Drag to move. Use the round handle to rotate.' : 'Drag paper to pan. Arrow keys pan when the bench is focused.';
  }

  function centerView(): void {
    const element = selected() ?? { x: BENCH.width / 2, y: BENCH.height / 2 };
    camera = {
      x: clamp(element.x - BENCH.width / (2 * zoom), 0, BENCH.width - BENCH.width / zoom),
      y: clamp(element.y - BENCH.height / (2 * zoom), 0, BENCH.height - BENCH.height / zoom),
    };
    applyCamera();
  }

  function changePanel(panel: string): void {
    workspace.navigation.select(panel);
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.panel) {
      changePanel(button.dataset.panel);
      return;
    }
    const presetId = button.dataset.preset;
    if (presetId) {
      cancelDrag();
      activePreset = presetId;
      resetScene = presetScene(presetId);
      selectedId = resetScene.elements.find(isRefractor)?.id ?? resetScene.elements.find((item) => item.kind === 'mirror')?.id ?? resetScene.elements[0]?.id ?? null;
      renderedSelection = undefined;
      const index = PRESETS.findIndex((preset) => preset.id === presetId);
      setScene(resetScene, `${PRESETS[index].name} loaded. Undo restores your previous experiment.`);
      centerView();
      workspace.files.close();
      return;
    }
    switch (button.dataset.action) {
      case 'add': {
        const kind = ELEMENT_KINDS.find((value) => value === query<HTMLSelectElement>(root, '[data-add-kind]').value);
        if (!kind) throw new Error('Unknown element selection.');
        if (history.present.elements.length >= MAX_ELEMENTS || (kind === 'emitter' && history.present.elements.filter((element) => element.kind === 'emitter').length >= MAX_EMITTERS)) {
          editError.textContent = `This bench supports ${MAX_ELEMENTS} elements and ${MAX_EMITTERS} emitters. Remove one before adding another.`;
          changePanel('inspector');
          return;
        }
        const element = createElement(kind, nextId(history.present, kind));
        if (kind !== 'emitter' && kind !== 'detector') {
          element.x = 610 + (history.present.elements.length % 3) * 50;
          element.y = 180 + (history.present.elements.length % 2) * 100;
        }
        selectedId = element.id;
        changePanel('inspector');
        setScene({ ...history.present, elements: [...history.present.elements, element] }, `${KIND_NAMES[kind]} added. Position it on the bench or in the inspector.`);
        break;
      }
      case 'remove': {
        const element = selected();
        if (element) setScene({ ...history.present, elements: history.present.elements.filter((item) => item.id !== element.id) }, `${element.label} removed. Undo brings it back.`);
        break;
      }
      case 'undo': cancelDrag(); history = undo(history); renderedSelection = undefined; render(); announce('Undid the last edit.'); break;
      case 'redo': cancelDrag(); history = redo(history); renderedSelection = undefined; render(); announce('Redid the last edit.'); break;
      case 'reset': cancelDrag(); renderedSelection = undefined; setScene(activePreset ? presetScene(activePreset) : resetScene, 'Study reset. This reset can be undone.'); centerView(); break;
      case 'open': fileInput.click(); break;
      case 'inspect': changePanel('inspector'); selection.focus({ preventScroll: true }); break;
      case 'bench': bench.focus({ preventScroll: true }); break;
      case 'save': downloadText('lumen-experiment.json', serializeExperiment(history.present), 'application/json'); announce('Experiment downloaded with its geometry and notebook.'); break;
      case 'svg': downloadText('lumen-optical-bench.svg', exportSceneSvg(history.present, trace, options), 'image/svg+xml'); announce('Optical bench exported as a self-contained SVG.'); break;
      case 'record': {
        const reading = detectorId ? measureDetector(trace, { id: detectorId }) : null;
        if (!reading) {
          announce('Add a detector before recording a measurement.');
          return;
        }
        const line = `${history.present.title} | ${detectorId}: ${reading.power.toFixed(3)} mW (${(reading.capture * 100).toFixed(1)}% captured); centroid ${reading.centroid?.toFixed(1) ?? '--'} mm; RMS spot ${reading.rmsWidth?.toFixed(1) ?? '--'} mm; outer-band separation ${reading.separation?.toFixed(1) ?? '--'} mm.`;
        const notes = `${history.present.notes}${history.present.notes ? '\n\n' : ''}${line}`;
        if (notes.length > 8000) {
          announce('The notebook is full (8,000 characters). Shorten a note before recording again.');
          return;
        }
        setScene({ ...history.present, notes }, 'Actual detector reading added to your notebook.');
        break;
      }
    }
  }, { signal });

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) return;
    if (input === workspace.study) query<HTMLButtonElement>(root, `[data-preset="${input.value}"]`).click();
    else if (input === selection) choose(selection.value);
    else if (input === detectorSelect) { detectorId = detectorSelect.value; renderMeasurement(); }
    else if (input.hasAttribute('data-zoom')) {
      zoom = input.value === '2' ? 2 : 1;
      centerView();
      announce(zoom === 1 ? 'Full bench view restored.' : 'Detail view centered on the selected element. Drag the paper to pan.');
    }
    else if (input.dataset.view && input instanceof HTMLInputElement) {
      switch (input.dataset.view) {
        case 'grid': options.grid = input.checked; break;
        case 'normals': options.normals = input.checked; break;
        case 'reflections': options.reflections = input.checked; break;
      }
      render();
    } else if (input.dataset.field) {
      const element = selected();
      if (!element) return;
      const value = input instanceof HTMLInputElement && input.type === 'number' ? input.valueAsNumber : input.value;
      try {
        const next = validateElement({ ...element, [input.dataset.field]: value });
        input.removeAttribute('aria-invalid');
        editError.textContent = '';
        setScene(replaceElement(history.present, next), `${next.label} updated.`);
      } catch (error) {
        if (!(error instanceof ExperimentValidationError)) throw error;
        input.setAttribute('aria-invalid', 'true');
        editError.textContent = `${error.message} The last valid geometry is unchanged.`;
      }
    } else if (input === titleInput || input === notesInput) {
      if (input === titleInput && !titleInput.value.trim()) {
        titleInput.setAttribute('aria-invalid', 'true');
        announce('Give your experiment a name. The previous name is unchanged.');
        return;
      }
      titleInput.removeAttribute('aria-invalid');
      setScene({ ...history.present, [input === titleInput ? 'title' : 'notes']: input.value }, 'Notebook updated. Save the experiment to keep it.');
    }
  }, { signal });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const sequence = ++importSequence;
    fileError.textContent = '';
    if (file.size > MAX_FILE_BYTES) {
      fileError.textContent = 'This file is too large. Use a Lumen experiment smaller than 200 kB. Your current work is unchanged.';
      fileInput.value = '';
      return;
    }
    let contents: string;
    try {
      contents = await file.text();
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      if (!signal.aborted) fileError.textContent = 'The browser could not read this file. Your current work is unchanged.';
      return;
    } finally {
      if (!signal.aborted && sequence === importSequence) fileInput.value = '';
    }
    if (signal.aborted || sequence !== importSequence) return;
    const imported = parseExperiment(contents);
    if (!imported.ok) {
      fileError.textContent = `${imported.error} Your current work is unchanged.`;
      return;
    }
    cancelDrag();
    history = changeScene(history, imported.scene);
    resetScene = history.present;
    activePreset = '';
    studyByScene.set(history.present, { preset: '', baseline: resetScene });
    selectedId = history.present.elements[0]?.id ?? null;
    renderedSelection = undefined;
    render();
    centerView();
    announce('Experiment imported. Geometry and notes restored; undo returns to your previous work.');
  }, { signal });

  function worldPoint(event: PointerEvent): Vec {
    const matrix = bench.getScreenCTM();
    if (!matrix) throw new Error('The optical bench has no screen transform.');
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  bench.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag || pan || !(event.target instanceof Element)) return;
    const target = event.target.closest('[data-optic-id], [data-rotate]');
    const id = target?.getAttribute('data-optic-id') ?? target?.getAttribute('data-rotate');
    if (!id) {
      if (zoom > 1) {
        event.preventDefault();
        const matrix = bench.getScreenCTM();
        if (!matrix) throw new Error('The optical bench has no screen transform.');
        pan = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, original: camera, scale: matrix.a };
        bench.setPointerCapture(event.pointerId);
        bench.focus({ preventScroll: true });
      }
      return;
    }
    const element = history.present.elements.find((item) => item.id === id);
    if (!element) return;
    event.preventDefault();
    selectedId = id;
    history = beginEdit(history);
    drag = { id, mode: target?.hasAttribute('data-rotate') ? 'rotate' : 'move', pointer: event.pointerId, start: worldPoint(event), original: element };
    bench.setPointerCapture(event.pointerId);
    bench.focus({ preventScroll: true });
    render();
  }, { signal });

  bench.addEventListener('pointermove', (event) => {
    if (pan && event.pointerId === pan.pointer) {
      camera = {
        x: clamp(pan.original.x - (event.clientX - pan.start.x) / pan.scale, 0, BENCH.width - BENCH.width / zoom),
        y: clamp(pan.original.y - (event.clientY - pan.start.y) / pan.scale, 0, BENCH.height - BENCH.height / zoom),
      };
      applyCamera();
      return;
    }
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = worldPoint(event);
    const delta = sub(point, drag.start);
    let element: OpticalElement;
    if (drag.mode === 'rotate') {
      const relative = sub(point, drag.original);
      const angle = degrees(Math.atan2(relative.y, relative.x)) + (drag.original.kind === 'emitter' ? 0 : 90);
      element = { ...drag.original, rotation: Math.round(((angle + 540) % 360) - 180) };
    } else element = { ...drag.original, x: clamp(Math.round(drag.original.x + delta.x), 20, BENCH.width - 20), y: clamp(Math.round(drag.original.y + delta.y), 20, BENCH.height - 20) };
    history = changeScene(history, replaceElement(history.present, element));
    render();
  }, { signal });

  bench.addEventListener('pointerup', (event) => {
    if (pan && event.pointerId === pan.pointer) {
      pan = null;
      if (bench.hasPointerCapture(event.pointerId)) bench.releasePointerCapture(event.pointerId);
      bench.focus({ preventScroll: true });
      return;
    }
    if (!drag || event.pointerId !== drag.pointer) return;
    const finished = drag;
    drag = null;
    history = finishEdit(history);
    if (bench.hasPointerCapture(event.pointerId)) bench.releasePointerCapture(event.pointerId);
    render();
    bench.querySelector<SVGGElement>(`[data-optic-id="${finished.id}"]`)?.focus({ preventScroll: true });
    announce(`${selected()?.label ?? 'Element'} positioned. Undo restores the entire drag.`);
  }, { signal });
  bench.addEventListener('pointercancel', cancelDrag, { signal });
  bench.addEventListener('lostpointercapture', () => { if (drag || pan) cancelDrag(); }, { signal });

  root.addEventListener('keydown', (event) => {
    if (root.querySelector('dialog[open]')) return;
    if (event.key === 'Escape' && (drag || pan)) { event.preventDefault(); cancelDrag(); return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      cancelDrag();
      history = event.shiftKey || event.key.toLowerCase() === 'y' ? redo(history) : undo(history);
      renderedSelection = undefined;
      render();
      announce('Experiment history updated.');
      return;
    }
    if (!(event.target instanceof Element)) return;
    if (event.target === bench && zoom > 1 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 80 : 20;
      camera = {
        x: clamp(camera.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), 0, BENCH.width - BENCH.width / zoom),
        y: clamp(camera.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), 0, BENCH.height - BENCH.height / zoom),
      };
      applyCamera();
      return;
    }
    const optic = event.target.closest('[data-optic-id], [data-rotate]');
    const id = optic?.getAttribute('data-optic-id') ?? optic?.getAttribute('data-rotate');
    if (!id) return;
    const element = history.present.elements.find((item) => item.id === id);
    if (!element) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(id);
      changePanel('inspector');
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      selectedId = id;
      const distance = event.shiftKey ? 10 : 2;
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const next = optic?.hasAttribute('data-rotate') ? { ...element, rotation: clamp(element.rotation + direction * (event.shiftKey ? 10 : 1), -180, 180) }
        : { ...element, x: clamp(element.x + (event.key.includes('Left') || event.key.includes('Right') ? distance * direction : 0), 20, 980), y: clamp(element.y + (event.key.includes('Up') || event.key.includes('Down') ? distance * direction : 0), 20, 580) };
      setScene(replaceElement(history.present, next), `${element.label} moved with the keyboard.`);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      setScene({ ...history.present, elements: history.present.elements.filter((item) => item.id !== id) }, `${element.label} removed.`);
      selection.focus({ preventScroll: true });
    }
  }, { signal });

  page.onCleanup(() => {
    importSequence += 1;
    if (drag && bench.hasPointerCapture(drag.pointer)) bench.releasePointerCapture(drag.pointer);
    if (pan && bench.hasPointerCapture(pan.pointer)) bench.releasePointerCapture(pan.pointer);
    drag = null;
    pan = null;
  });
  applyCamera();
  render();
  return { destroy: page.destroy, reset: () => { cancelDrag(); renderedSelection = undefined; setScene(activePreset ? presetScene(activePreset) : resetScene, 'Study reset.'); centerView(); } };
}
