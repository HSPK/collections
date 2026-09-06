import { escapeMarkup, query } from '../../core/page';
import { extrema, forceColor, forceDiagram, structuralSVG } from './diagrams';
import type { SceneOptions } from './scene';
import { AXES, currentCase, length } from './schema';
import type { Selection, Structure, Vector3 } from './schema';
import type { Analysis, Solved } from './solver';
import { STUDIES } from './presets';

export interface Reference { model: Structure; result: Solved }
const escape = escapeMarkup;
export const format = (value: number, decimals = 2): string => new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value);
const signed = (value: number, decimals = 2): string => `${value > 0 ? '+' : ''}${format(value, decimals)}`;
const vector = (v: Vector3, unit: number, decimals = 3): string => v.map((n) => format(n / unit, decimals)).join(' / ');
const option = (id: string, label: string, selected: string): string => `<option value="${escape(id)}"${id === selected ? ' selected' : ''}>${escape(label)}</option>`;
function numberField(label: string, field: string, value: number, min: number, max: number, step = 'any'): string {
  return `<label class="lp-field">${label}<input type="number" data-lp-field="${field}" value="${Number(value.toPrecision(10))}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;
}
function action(name: string, label: string, className = ''): string {
  return `<button type="button" data-lp-action="${name}" class="${className}">${label}</button>`;
}
export function workbenchMarkup(): string {
  return `
  <header class="lp-header">
    <div class="lp-brand"><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M4 36L22 5L40 36ZM4 36L30 20M22 5L22 36M40 36L14 20" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="22" cy="5" r="3" fill="currentColor"/></svg><h1>LOADPATH<span>The forces inside a space.</span></h1></div>
    <p class="lp-edition">A structural form studio<span>SPATIAL STUDY / 070</span></p>
  </header>
  <div class="lp-controls">
    <label class="lp-field lp-study-field">Structural study<select data-lp-study aria-label="Structural study">${STUDIES.map((s) => option(s.id, s.name, 'canopy')).join('')}</select></label>
    <label class="lp-field lp-case-field">Load case<select data-lp-case aria-label="Load case"></select></label>
    <label class="lp-check lp-weight"><input type="checkbox" data-lp-weight aria-label="Member self-weight"> Self-weight</label>
    <div class="lp-history">${action('undo', 'Undo')}${action('redo', 'Redo')}${action('reset', 'Reset')}</div>
  </div>
  <nav class="lp-mobile-tabs" aria-label="Workbench panes">${['structure', 'edit', 'results'].map((pane) => `<button type="button" data-lp-pane="${pane}" aria-pressed="${pane === 'structure'}">${pane[0].toUpperCase() + pane.slice(1)}</button>`).join('')}</nav>
  <div class="lp-workspace" data-project-preview="loadpath-workbench">
    <section class="lp-structure-pane" aria-label="Structure">
      <div class="lp-stage-heading"><div><p class="lp-eyebrow" data-lp-study-number>01 / THE SPACE FRAME</p><h2 data-lp-design-name>Aster / space canopy</h2></div><span class="lp-state" data-lp-state>Solving</span></div>
      <div class="lp-stage" data-lp-scene></div>
      <div class="lp-stage-note"><span data-lp-counts></span><span class="lp-up">Y up / gravity −Y</span></div>
      <div class="lp-view-tools">
        <div class="lp-segment" aria-label="Camera view">${['orbit', 'plan', 'front'].map((v) => `<button type="button" data-lp-view="${v}" aria-pressed="${v === 'orbit'}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
        <div class="lp-camera-tools">${action('zoom-out', '<span aria-hidden="true">−</span><span class="lp-sr-only">Zoom out</span>')}${action('home', 'Fit')}${action('zoom-in', '<span aria-hidden="true">+</span><span class="lp-sr-only">Zoom in</span>')}</div>
        <label class="lp-check"><input type="checkbox" data-lp-deformed> Deformed</label>
        <label class="lp-amplification">×<input type="number" aria-label="Displacement amplification" data-lp-amplification min="1" max="2000" value="400" step="1"></label>
      </div>
      <div class="lp-legend-tools"><label class="lp-field"><span class="lp-sr-only">Color members by</span><select data-lp-color aria-label="Color members by"><option value="force">Axial force / kN</option><option value="stress">Axial stress / MPa</option></select></label><div class="lp-legend" data-lp-legend></div></div>
      <div class="lp-stage-help"><p data-lp-gesture>Pick a joint or bar. Drag to orbit; use the Edit pane for exact coordinates.</p><label class="lp-check"><input type="checkbox" data-lp-reactions> Reactions</label></div>
      <div class="lp-invalid-banner" data-lp-invalid hidden></div>
    </section>
    <aside class="lp-edit-pane" aria-label="Edit">
      <div class="lp-panel-heading"><span class="lp-eyebrow">THE WORKING MODEL</span><span data-lp-revision>REV 001</span></div>
      <div class="lp-selection-tabs"><button type="button" data-lp-select-kind="node" aria-pressed="true">Joints & loads</button><button type="button" data-lp-select-kind="member" aria-pressed="false">Members</button></div>
      <div data-lp-editor></div>
      <details class="lp-builder"><summary>Build the frame <span>+</span></summary><div data-lp-builder></div></details>
    </aside>
    <section class="lp-results-pane" aria-label="Results">
      <div class="lp-results-heading"><div><p class="lp-eyebrow">READING THE STRUCTURE</p><h2>Equilibrium, made visible.</h2></div>${action('pin', 'Pin this design', 'lp-primary')}</div>
      <div class="lp-metrics" data-lp-metrics></div>
      <div class="lp-result-columns">
        <section class="lp-result-card"><div class="lp-card-heading"><h3>Member force ledger</h3><span data-lp-chart-unit>kN</span></div><p>Eight largest magnitudes. Select a row to inspect.</p><div data-lp-force-chart></div></section>
        <section class="lp-result-card"><div class="lp-card-heading"><h3>The balance sheet</h3><span>X / Y / Z</span></div><div data-lp-equilibrium></div></section>
        <section class="lp-result-card lp-reference"><div class="lp-card-heading"><h3>Before & after</h3><span>PINNED STUDY</span></div><div data-lp-comparison></div></section>
      </div>
      <div data-lp-warnings></div>
      <details class="lp-detail" data-lp-support-details><summary>Support reactions <span>Global X / Y / Z</span></summary><div data-lp-supports></div></details>
      <details class="lp-detail"><summary>Front elevation <span>Actual model / X–Y projection</span></summary><div class="lp-elevation" data-lp-elevation></div></details>
    </section>
  </div>
  <section class="lp-files" aria-label="Design files">
    <div><h3>A study worth keeping.</h3><p>Editable SI model, full numerical results, or a vector drawing.</p></div>
    <div class="lp-file-actions">${action('export-json', 'Save JSON')}${action('export-csv', 'Results CSV')}${action('export-svg', 'Drawing SVG')}<label class="lp-file-button">Import JSON<input type="file" accept=".json,application/json" data-lp-import></label></div>
    <details class="lp-paste"><summary>Paste a model document</summary><label class="lp-field">LOADPATH / version 1 / SI<textarea data-lp-import-text aria-label="JSON model document" rows="5" spellcheck="false"></textarea></label>${action('import-text', 'Import document')}</details>
  </section>
  <p class="lp-status" data-lp-status role="status" aria-live="polite">Preparing the structural study.</p>
  <footer class="lp-footer"><p><strong>Fictional structures. Real equilibrium.</strong> Educational exploration, not construction or structural-certification software.</p><details><summary>Model assumptions & numerical limits</summary><p>3D pin-jointed bars carry axial tension and compression only. Linear elastic, small-displacement analysis; no bending moments, beam action, contact, yielding, nonlinear collapse, or dynamic wind simulation. Point loads are in global X/Y/Z. Self-weight uses actual member masses, split equally between each member's ends, with gravity −Y = 9.80665 m/s².</p><p>Sections are solid circular rods: I = A²/(4π). Euler load π²EI/L² assumes an ideal straight pin-ended member (effective length factor 1); it is only a secondary elastic buckling indicator, not a design-code check or safety factor.</p><p>Up to 60 nodes / 240 members / 180 total DOFs / 8 load cases. Coordinates ±100 m; length ≥10 mm; area 1–100,000 mm²; E 0.001–500 GPa; density 0–25,000 kg/m³; load components ±1,000 kN. Dense, diagonally scaled Cholesky; scaled Schur pivot ≤10⁻¹⁰ withholds the solution. A pivot is not a condition number. Results are synchronous and correspond to the displayed revision.</p><p>Original and deformed bars are straight between their respective nodes. Amplification affects only the drawing, never the solved displacements. Very thin members are drawn thicker for visibility; the section area controls the real stiffness. Arrow lengths are schematic and normalized separately for loads and reactions; numeric vectors are authoritative.</p></details></footer>`;
}

export function renderEditor(root: HTMLElement, model: Structure, result: Analysis, selection: Selection, options: SceneOptions): void {
  root.querySelectorAll<HTMLButtonElement>('[data-lp-select-kind]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lpSelectKind === selection.kind)));
  const list = selection.kind === 'node' ? model.nodes.map((n) => ({ id: n.id, label: `${n.id} / ${n.restraints.some(Boolean) ? 'restrained' : 'free joint'}` })) : model.members.map((m) => ({ id: m.id, label: `${m.id} / ${m.a} → ${m.b}` }));
  let html = `<label class="lp-field lp-picker">${selection.kind === 'node' ? 'Selected joint' : 'Selected member'}<select data-lp-selection aria-label="${selection.kind === 'node' ? 'Selected joint' : 'Selected member'}">${list.map((item) => option(item.id, item.label, selection.id)).join('')}</select></label>`;
  if (selection.kind === 'node') {
    const node = model.nodes.find((n) => n.id === selection.id)!;
    const load = currentCase(model).loads.find((l) => l.node === node.id)?.force ?? [0, 0, 0];
    const r = result.status === 'stable' ? result.nodes.find((n) => n.id === node.id) : undefined;
    html += `<section class="lp-editor-section"><h3>Position <span>m</span></h3><div class="lp-coordinate-grid">${AXES.map((axis, i) => numberField(axis, `position-${i}`, node.position[i], -100, 100)).join('')}</div>
      <label class="lp-field lp-plane-field">Pointer tool<select data-lp-plane><option value="inspect">Inspect / orbit</option>${['XZ', 'XY', 'YZ'].map((plane) => option(plane, `Move joint in ${plane} plane`, options.plane)).join('')}</select></label>
      <p class="lp-note">${options.plane === 'inspect' ? 'Coordinates are global. Y is height.' : options.deformed ? 'Turn off Deformed to move joints in the original geometry.' : `${options.plane} is the moving plane; the third coordinate stays fixed. Drag a joint or type its coordinates.`}</p>
      <details class="lp-nudge"><summary>Precise incremental moves</summary>${numberField('Step / m', 'nudge-step', 0.25, 0.001, 10)}<div class="lp-nudge-buttons">${AXES.map((axis, i) => `<button type="button" data-lp-nudge="${i}" data-direction="-1">−${axis}</button><button type="button" data-lp-nudge="${i}" data-direction="1">+${axis}</button>`).join('')}</div></details></section>
      <section class="lp-editor-section"><h3>Restraints <span>translation locked</span></h3><div class="lp-restraints">${AXES.map((axis, i) => `<label class="lp-check"><input type="checkbox" data-lp-restraint="${i}"${node.restraints[i] ? ' checked' : ''}> ${axis}</label>`).join('')}</div><p class="lp-note">A pin locks X, Y, Z; a Y roller locks Y only. Rotations are not DOFs.</p></section>
      <section class="lp-editor-section"><h3>Point load <span>kN / this case</span></h3><div class="lp-coordinate-grid">${AXES.map((axis, i) => numberField(`F${axis}`, `load-${i}`, load[i] / 1000, -1000, 1000)).join('')}</div></section>
      <div class="lp-inspector-result"><span>Joint displacement / mm</span><strong data-lp-node-displacement>${r ? vector(r.displacement, 0.001) : 'Unavailable'}</strong><span>${node.restraints.some(Boolean) ? 'K·u − F / kN (free axes are residuals)' : 'Applied load incl. self-weight / kN'}</span><strong>${r ? vector(node.restraints.some(Boolean) ? r.reaction : r.applied, 1000) : 'Unavailable'}</strong></div>
      ${action('remove-node', `Remove ${escape(node.id)} & incident members`, 'lp-danger lp-remove')}`;
  } else {
    const bar = model.members.find((m) => m.id === selection.id)!;
    const section = model.sections.find((s) => s.id === bar.section)!;
    const material = model.materials.find((m) => m.id === bar.material)!;
    const r = result.status === 'stable' ? result.members.find((m) => m.id === bar.id) : undefined;
    html += `<section class="lp-editor-section"><h3>Cross section <span>solid circular rod</span></h3><label class="lp-field">Section family<select data-lp-field="section">${model.sections.map((s) => option(s.id, `${s.name} / ${format(Math.sqrt(s.area * 4 / Math.PI) * 1000, 1)} mm`, bar.section)).join('')}</select></label>${numberField('Area / mm²', 'area', section.area * 1e6, 1, 100000)}<p class="lp-note">Equivalent diameter ${format(Math.sqrt(section.area * 4 / Math.PI) * 1000, 1)} mm. Area edits affect all ${model.members.filter((m) => m.section === bar.section).length} members using this section.</p></section>
      <section class="lp-editor-section"><h3>Material <span>linear elastic</span></h3><label class="lp-field">Material family<select data-lp-field="material">${model.materials.map((m) => option(m.id, `${m.name} / E ${format(m.elasticModulus / 1e9, 1)} GPa`, bar.material)).join('')}</select></label><div class="lp-two-fields">${numberField('E / GPa', 'modulus', material.elasticModulus / 1e9, 0.001, 500)}${numberField('Density / kg/m³', 'density', material.density, 0, 25000)}</div><p class="lp-note">Property edits affect all members using this material.</p></section>
      <div class="lp-inspector-result"><span>Axial force / kN <small>+ tension / − compression</small></span><strong data-lp-member-force>${r ? signed(r.force / 1000) : 'Unavailable'}</strong><span>Axial stress / MPa</span><strong>${r ? signed(r.stress / 1e6) : 'Unavailable'}</strong><span>Length / extension</span><strong>${r ? `${format(r.length, 3)} m / ${signed(r.extension * 1000, 3)} mm` : 'Unavailable'}</strong><span>Ideal pin-ended Euler / compression ratio</span><strong>${r ? `${format(r.eulerLoad / 1000, 1)} kN / ${format(r.eulerRatio, 3)}` : 'Unavailable'}</strong><p class="lp-note">Ideal elastic buckling only. Not a safety or code check.</p></div>${action('remove-member', `Remove ${escape(bar.id)}`, 'lp-danger lp-remove')}`;
  }
  query(root, '[data-lp-editor]').innerHTML = html;
  const start = selection.kind === 'node' ? selection.id : model.members.find((m) => m.id === selection.id)!.a;
  const end = model.nodes.find((n) => n.id !== start)?.id ?? start;
  query(root, '[data-lp-builder]').innerHTML = `<p class="lp-note">New joints are free until you restrain or brace them. Every connection is a real axial member.</p><div class="lp-two-fields"><label class="lp-field">From<select data-lp-connect-from>${model.nodes.map((n) => option(n.id, n.id, start)).join('')}</select></label><label class="lp-field">To<select data-lp-connect-to>${model.nodes.map((n) => option(n.id, n.id, end)).join('')}</select></label></div>${action('connect', 'Connect joints', 'lp-primary')}<h3>Add a joint <span>m</span></h3><div class="lp-coordinate-grid">${numberField('X', 'new-0', 0, -100, 100)}${numberField('Y', 'new-1', 6, -100, 100)}${numberField('Z', 'new-2', 0, -100, 100)}</div>${action('add-node', 'Add free joint')}`;
}

export function renderResults(root: HTMLElement, model: Structure, result: Analysis, reference: Reference | null, options: SceneOptions): void {
  const good = result.status === 'stable';
  root.dataset.analysis = result.status;
  query(root, '[data-lp-state]').textContent = good ? 'Equilibrium solved' : result.status === 'unstable' ? 'Mechanism detected' : result.status === 'invalid' ? 'Invalid model' : 'Ill-conditioned';
  const invalid = query<HTMLElement>(root, '[data-lp-invalid]');
  invalid.hidden = good;
  invalid.textContent = good ? '' : `${result.message} Displacements, forces, and reactions are unavailable.`;
  query(root, '[data-lp-counts]').textContent = `${model.nodes.length} joints · ${model.members.length} straight members · ${result.freeDofs} free DOFs`;
  const [min, max] = extrema(result, options.color);
  const unit = options.color === 'force' ? 'kN' : 'MPa';
  const maxAbs = Math.max(-min, max);
  const zero = max === min ? 50 : -min / (max - min) * 100;
  const samples = [...Array.from({ length: 17 }, (_, i) => i / 16), zero / 100].sort((a, b) => a - b);
  const stops = samples.map((t) => `${forceColor(min + (max - min) * t, maxAbs)} ${t * 100}%`).join(', ');
  query(root, '[data-lp-legend]').innerHTML = good ? `<div class="lp-legend-labels"><span>${signed(min, 1)} ${unit}<b>Compression</b></span>${zero > 10 && zero < 90 ? `<span class="lp-legend-zero" style="left:${zero}%">0</span>` : ''}<span>${signed(max, 1)} ${unit}<b>Tension</b></span></div><div class="lp-legend-scale" style="background:linear-gradient(90deg,${stops})"></div>` : '<p>No force colors / solution unavailable</p>';
  const metrics = [
    ['Maximum displacement', good ? format(result.maxDisplacement * 1000, 3) : '—', 'mm', 'max-displacement'],
    ['Peak tension', good ? signed(result.maxTension / 1000) : '—', 'kN', 'peak-tension'],
    ['Peak compression', good ? signed(result.maxCompression / 1000) : '—', 'kN', 'peak-compression'],
    ['Strain energy', good ? format(result.energy, 2) : '—', 'J', 'energy'],
    ['Member mass', good ? format(result.mass, 1) : '—', 'kg', 'mass'],
  ];
  query(root, '[data-lp-metrics]').innerHTML = metrics.map(([label, value, unit, key]) => `<div class="lp-metric"><span>${label}</span><strong data-lp-metric="${key}">${value}</strong><small>${good ? unit : 'unavailable'}</small></div>`).join('');
  query(root, '[data-lp-force-chart]').innerHTML = forceDiagram(result, options.color);
  query(root, '[data-lp-chart-unit]').textContent = unit;
  query(root, '[data-lp-equilibrium]').innerHTML = good ? `
    <dl class="lp-ledger"><div><dt>Applied / kN</dt><dd>${vector(result.applied, 1000, 2)}</dd></div><div><dt>Support reactions / kN</dt><dd>${vector(result.reaction, 1000, 2)}</dd></div><div><dt>Force imbalance / N</dt><dd data-lp-balance>${length(result.balance).toExponential(2)}</dd></div><div><dt>Moment imbalance / N·m</dt><dd>${length(result.momentBalance).toExponential(2)}</dd></div><div><dt>Free DOF residual / N</dt><dd>${result.freeResidual.toExponential(2)}</dd></div><div><dt>½ F·u = strain energy / J</dt><dd>${format(result.externalWork / 2, 4)} = ${format(result.energy, 4)}</dd></div></dl>
    <details class="lp-numerics"><summary>Numerical diagnostics</summary><p>Minimum scaled Cholesky Schur pivot: <strong>${result.minScaledPivot === null ? 'No free DOFs' : result.minScaledPivot.toExponential(3)}</strong>. Not a condition number; values ≤10⁻¹⁰ are rejected.</p><p>Free residual ∞-norm divided by max(1 N, ‖K‖∞‖u‖∞ + ‖F‖∞): ${result.relativeResidual.toExponential(3)}. Force and moment imbalances above are vector magnitudes, about the global origin. Self-weight: ${format(result.weight / 1000, 3)} kN.</p></details>` : `<p class="lp-empty">No equilibrium solution.</p><p>${escape(result.message)}</p>`;
  query(root, '[data-lp-comparison]').innerHTML = reference ? `<p class="lp-reference-name">${escape(reference.model.name)}</p><p>${escape(currentCase(reference.model).name)} · ${reference.model.nodes.length} joints</p><div class="lp-compare-head"><span></span><span>Pinned</span><span>Current</span></div>${[
    ['Displacement / mm', reference.result.maxDisplacement * 1000, good ? result.maxDisplacement * 1000 : null],
    ['Mass / kg', reference.result.mass, good ? result.mass : null],
    ['Energy / J', reference.result.energy, good ? result.energy : null],
  ].map(([label, before, after]) => `<div class="lp-compare-row"><span>${label}</span><strong>${format(Number(before), 2)}</strong><strong>${after === null ? '—' : format(Number(after), 2)}</strong></div>`).join('')}<p class="lp-note" data-lp-comparison-delta>${good ? `Displacement change: ${signed((result.maxDisplacement - reference.result.maxDisplacement) * 1000, 3)} mm. Same units; the geometry or load case may differ.` : 'The current design is unsolved. Pinned values are a reference, not current results.'}</p><div class="lp-compare-actions">${action('restore-pin', 'Restore pinned')}${action('clear-pin', 'Unpin')}</div>` : `<div class="lp-pin-empty"><svg viewBox="0 0 120 74" aria-hidden="true"><path d="M5 63L30 12L62 63L88 12L114 63M5 63H114M30 12H88M30 12L88 63M62 63L88 12" fill="none" stroke="currentColor" stroke-width="1.3"/></svg><p>Keep a reference.<br>Then change one thing.</p><span>Pin a solved design to compare its displacement, mass, and stored energy.</span></div>`;
  query(root, '[data-lp-warnings]').innerHTML = good && result.warnings.length ? `<div class="lp-warnings"><strong>Interpret with care</strong>${result.warnings.map((warning) => `<p>${escape(warning)}</p>`).join('')}</div>` : '';
  query(root, '[data-lp-supports]').innerHTML = good ? `<div class="lp-table-wrap"><table><thead><tr><th>Joint</th><th>Locked axes</th><th>RX / kN</th><th>RY / kN</th><th>RZ / kN</th></tr></thead><tbody>${model.nodes.filter((n) => n.restraints.some(Boolean)).map((n) => {
    const r = result.nodes.find((node) => node.id === n.id)!;
    return `<tr><th><button type="button" data-lp-inspect-node="${n.id}">${n.id}</button></th><td>${AXES.filter((_, i) => n.restraints[i]).join(' ')}</td>${r.reaction.map((v, i) => `<td>${n.restraints[i] ? format(v / 1000, 3) : 'free'}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>` : '<p class="lp-empty">Support reactions unavailable.</p>';
  query(root, '[data-lp-elevation]').innerHTML = structuralSVG(model, result, options);
  for (const name of ['pin', 'export-csv']) query<HTMLButtonElement>(root, `[data-lp-action="${name}"]`).disabled = !good;
}
