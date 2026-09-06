import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { History, deserialize, resultsCSV, serialize } from './document';
import type { ResetOrigin } from './document';
import { structuralSVG } from './diagrams';
import { STUDIES } from './presets';
import { AXES, LIMITS, ModelError, cloneModel, currentCase, nextId, parseModel } from './schema';
import type { Selection, Structure, Vector3 } from './schema';
import { createStructureScene } from './scene';
import type { SceneOptions } from './scene';
import { analyze } from './solver';
import { renderEditor, renderResults, workbenchMarkup } from './ui';
import type { Reference } from './ui';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'loadpath');
  const { root, signal } = page;
  root.innerHTML = workbenchMarkup();
  root.dataset.mobilePane = 'structure';
  root.dataset.motion = 'on-demand';
  const history = new History(STUDIES[0].model, { baseline: STUDIES[0].model, presetId: STUDIES[0].id });
  let model = history.model;
  let result = analyze(model);
  let reference: (Reference & { origin: ResetOrigin }) | null = null;
  let selected: Selection = { kind: 'node', id: 'N13' };
  let revision = 1;
  let importRequest = 0;
  let active = true;
  const downloads = new Map<string, number>();
  const options: SceneOptions = { color: 'force', deformed: false, amplification: 400, reactions: false, plane: 'inspect', selection: selected };

  function report(message: string, error = false): void {
    if (!active) return;
    const status = query<HTMLElement>(root, '[data-lp-status]');
    status.textContent = message;
    status.dataset.error = String(error);
  }
  const scene = createStructureScene(
    query(root, '[data-lp-scene]'),
    (selection) => {
      selected = selection;
      refresh();
      report(`Selected ${selection.kind === 'node' ? 'joint' : 'member'} ${selection.id}. Open Edit for coordinates, properties, and its live result.`);
    },
    (id, position) => change((next) => {
      const node = next.nodes.find((n) => n.id === id);
      if (!node) throw new ModelError('The dragged joint no longer exists. No edit was applied.');
      node.position = position;
    }, `${id} moved in the ${options.plane} plane. All results recomputed.`),
    report,
    (mode) => root.querySelectorAll<HTMLButtonElement>('[data-lp-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lpView === mode))),
  );
  function focusKey(): string | null {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !root.contains(focused)) return null;
    for (const attr of ['data-lp-field', 'data-lp-restraint', 'data-lp-selection', 'data-lp-plane']) {
      if (focused.hasAttribute(attr)) return `[${attr}="${focused.getAttribute(attr)}"]`;
    }
    return null;
  }
  function refresh(): void {
    const focus = focusKey();
    const nudgeDraft = root.querySelector<HTMLInputElement>('[data-lp-field="nudge-step"]')?.value;
    const nudgeOpen = root.querySelector<HTMLDetailsElement>('.lp-nudge')?.open ?? false;
    if (selected.kind === 'node' && !model.nodes.some((n) => n.id === selected.id)) selected = { kind: 'node', id: model.nodes[0].id };
    if (selected.kind === 'member' && !model.members.some((m) => m.id === selected.id)) selected = model.members.length ? { kind: 'member', id: model.members[0].id } : { kind: 'node', id: model.nodes[0].id };
    options.selection = selected;
    const presetId = history.origin.presetId;
    const study = STUDIES.find((s) => s.id === presetId);
    const studySelect = query<HTMLSelectElement>(root, '[data-lp-study]');
    const customOption = studySelect.querySelector('option[value="custom"]');
    if (!study && !customOption) {
      const option = document.createElement('option');
      option.value = 'custom'; option.textContent = 'Imported / custom study'; studySelect.append(option);
    }
    if (study && customOption) customOption.remove();
    studySelect.value = study?.id ?? 'custom';
    const cases = query<HTMLSelectElement>(root, '[data-lp-case]');
    cases.replaceChildren(...model.loadCases.map((load) => {
      const option = document.createElement('option');
      option.value = load.id; option.textContent = load.name;
      return option;
    }));
    cases.value = model.activeCase;
    query<HTMLInputElement>(root, '[data-lp-weight]').checked = currentCase(model).selfWeight;
    query(root, '[data-lp-design-name]').textContent = model.name;
    query(root, '[data-lp-study-number]').textContent = study ? `${String(STUDIES.indexOf(study) + 1).padStart(2, '0')} / FICTIONAL STRUCTURAL STUDY` : 'CUSTOM / FICTIONAL STRUCTURAL STUDY';
    query(root, '[data-lp-revision]').textContent = `REV ${String(revision).padStart(3, '0')}`;
    root.dataset.revision = String(revision);
    root.dataset.selected = `${selected.kind}:${selected.id}`;
    query<HTMLButtonElement>(root, '[data-lp-action="undo"]').disabled = !history.canUndo;
    query<HTMLButtonElement>(root, '[data-lp-action="redo"]').disabled = !history.canRedo;
    query<HTMLButtonElement>(root, '[data-lp-select-kind="member"]').disabled = !model.members.length;
    query<HTMLInputElement>(root, '[data-lp-deformed]').checked = options.deformed;
    query<HTMLInputElement>(root, '[data-lp-deformed]').disabled = result.status !== 'stable';
    query<HTMLInputElement>(root, '[data-lp-reactions]').checked = options.reactions;
    query<HTMLInputElement>(root, '[data-lp-reactions]').disabled = result.status !== 'stable';
    query<HTMLSelectElement>(root, '[data-lp-color]').value = options.color;
    query(root, '[data-lp-gesture]').textContent = result.status !== 'stable' ? 'Unsolved: original geometry only, without force colors or deformed results.'
      : options.deformed
      ? `Original: dashed. Deformed: solid, x${options.amplification}. Loads stay at original joints. Plane moves disabled.`
      : options.plane === 'inspect' ? 'Pick a joint or bar. Drag to orbit; use the Edit pane for exact coordinates.'
        : `Drag a joint in ${options.plane}; the other coordinate stays fixed. Gold cross = moving axes. Escape cancels.`;
    renderEditor(root, model, result, selected, options);
    const nudge = root.querySelector<HTMLInputElement>('[data-lp-field="nudge-step"]');
    if (nudge && nudgeDraft !== undefined) nudge.value = nudgeDraft;
    const nudgeDetails = root.querySelector<HTMLDetailsElement>('.lp-nudge');
    if (nudgeDetails) nudgeDetails.open = nudgeOpen;
    renderResults(root, model, result, reference, options);
    scene.update(model, result, options);
    if (focus) root.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }
  function commit(next: Structure, message: string, origin?: ResetOrigin): void {
    history.commit(next, origin);
    model = history.model;
    result = analyze(model);
    revision++;
    importRequest++;
    refresh();
    report(result.status === 'stable' ? message : `${message} ${result.message}`, result.status !== 'stable');
  }
  function change(edit: (next: Structure) => void, message: string): void {
    const next = cloneModel(model);
    try { edit(next); commit(next, message); }
    catch (error) {
      if (!(error instanceof ModelError)) throw error;
      report(`Edit rejected. ${error.message} The previous model and results are unchanged.`, true);
    }
  }
  function reset(): void {
    commit(history.origin.baseline, 'Study reset. The reset is undoable; your pinned reference is unchanged.');
    scene.camera('home');
  }
  function numberFrom(input: HTMLInputElement, label: string): number {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || (input.min !== '' && value < Number(input.min)) || (input.max !== '' && value > Number(input.max))) {
      input.setAttribute('aria-invalid', 'true');
      throw new ModelError(`${label}: enter a finite value from ${input.min} to ${input.max}.`);
    }
    input.removeAttribute('aria-invalid');
    return value;
  }
  function selectedNode(next: Structure) {
    const node = next.nodes.find((n) => n.id === selected.id);
    if (selected.kind !== 'node' || !node) throw new ModelError('Select a joint first.');
    return node;
  }
  function selectedMember(next: Structure) {
    const member = next.members.find((m) => m.id === selected.id);
    if (selected.kind !== 'member' || !member) throw new ModelError('Select a member first.');
    return member;
  }
  function numericChange(input: HTMLInputElement): void {
    const field = input.dataset.lpField;
    if (!field || field.startsWith('new-') || field === 'nudge-step') return;
    let value: number;
    try { value = numberFrom(input, field); }
    catch (error) {
      if (!(error instanceof ModelError)) throw error;
      report(`${error.message} The last committed model remains active.`, true); return;
    }
    change((next) => {
      if (field.startsWith('position-')) {
        const axis = Number(field.slice(-1));
        if (![0, 1, 2].includes(axis)) throw new ModelError('Unknown coordinate axis.');
        selectedNode(next).position[axis] = value;
      } else if (field.startsWith('load-')) {
        const node = selectedNode(next);
        const axis = Number(field.slice(-1));
        if (![0, 1, 2].includes(axis)) throw new ModelError('Unknown load axis.');
        const c = currentCase(next);
        let load = c.loads.find((l) => l.node === node.id);
        if (!load) { load = { node: node.id, force: [0, 0, 0] }; c.loads.push(load); }
        load.force[axis] = value * 1000;
      } else {
        const bar = selectedMember(next);
        if (field === 'area') next.sections.find((s) => s.id === bar.section)!.area = value / 1e6;
        else if (field === 'modulus') next.materials.find((m) => m.id === bar.material)!.elasticModulus = value * 1e9;
        else if (field === 'density') next.materials.find((m) => m.id === bar.material)!.density = value;
        else throw new ModelError('Unknown property.');
      }
    }, 'Model edited. The solver, spatial drawing, and exports now use this revision.');
  }
  function download(filename: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    root.append(link); link.click(); link.remove();
    const timer = window.setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 1000);
    downloads.set(url, timer);
    report(`${filename} exported from revision ${revision}.`);
  }
  function exportCurrent(format: 'json' | 'csv' | 'svg'): void {
    try {
      if (format === 'json') download('loadpath-design.json', serialize(model), 'application/json');
      else if (format === 'csv') download('loadpath-results.csv', resultsCSV(model, result), 'text/csv;charset=utf-8');
      else download('loadpath-elevation.svg', structuralSVG(model, result, options), 'image/svg+xml');
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      report(`Export rejected. ${error.message} No file was created; the current model is unchanged.`, true);
    }
  }
  function importText(source: string): void {
    try {
      const next = deserialize(source);
      commit(next, 'JSON model imported. Valid geometry may still contain a mechanism; no automatic bracing is added.', { baseline: next, presetId: null });
      scene.camera('home');
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      report(`Import rejected. ${error.message} Your current design is unchanged.`, true);
    }
  }
  async function importFile(file: File): Promise<void> {
    if (file.size > LIMITS.importBytes) { report('Import rejected: the 150 kB size limit was exceeded. Your current design is unchanged.', true); return; }
    const request = ++importRequest;
    const startRevision = revision;
    let text: string;
    try { text = await file.text(); }
    catch (error) {
      if (!(error instanceof DOMException)) throw error;
      report(`The file could not be read: ${error.message}. Your current design is unchanged.`, true); return;
    }
    if (!active) return;
    if (request !== importRequest || startRevision !== revision) {
      report('Import cancelled because the design changed while the file was being read. Your newer edits were preserved.', true);
      return;
    }
    importText(text);
  }
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.matches('[data-lp-study]')) {
      const study = STUDIES.find((s) => s.id === target.value);
      if (!study) { report('This is the imported study. Choose a named study to replace it.'); return; }
      selected = { kind: 'node', id: study.id === 'mechanism' ? 'N04' : study.model.nodes.find((n) => !n.restraints.some(Boolean))!.id };
      commit(cloneModel(study.model), study.note, { baseline: study.model, presetId: study.id });
      scene.camera('home');
    } else if (target.matches('[data-lp-case]')) change((next) => { next.activeCase = target.value; }, 'Load case changed. Equilibrium is recalculated for this case only.');
    else if (target.matches('[data-lp-weight]') && target instanceof HTMLInputElement) change((next) => { currentCase(next).selfWeight = target.checked; }, 'Self-weight updated from real member masses, with gravity in global -Y.');
    else if (target.matches('[data-lp-selection]')) { selected = { kind: selected.kind, id: target.value }; refresh(); }
    else if (target.matches('[data-lp-plane]')) {
      if (target.value === 'inspect' || target.value === 'XY' || target.value === 'XZ' || target.value === 'YZ') { options.plane = target.value; refresh(); }
    } else if (target.matches('[data-lp-restraint]') && target instanceof HTMLInputElement) {
      const axis = Number(target.dataset.lpRestraint);
      change((next) => { selectedNode(next).restraints[axis] = target.checked; }, `${AXES[axis]} restraint changed explicitly. No other constraints were added.`);
    } else if (target.matches('[data-lp-deformed]') && target instanceof HTMLInputElement) { options.deformed = target.checked; refresh(); }
    else if (target.matches('[data-lp-reactions]') && target instanceof HTMLInputElement) { options.reactions = target.checked; refresh(); report('Load and reaction arrow lengths are normalized separately. Exact vectors are in the joint inspector and reaction table.'); }
    else if (target.matches('[data-lp-color]') && (target.value === 'force' || target.value === 'stress')) { options.color = target.value; refresh(); }
    else if (target.matches('[data-lp-amplification]') && target instanceof HTMLInputElement) {
      try { options.amplification = numberFrom(target, 'Amplification'); refresh(); }
      catch (error) { if (!(error instanceof ModelError)) throw error; report(error.message, true); }
    } else if (target.matches('[data-lp-import]') && target instanceof HTMLInputElement) {
      const file = target.files?.[0];
      if (file) void importFile(file);
      target.value = '';
    } else if (target.matches('[data-lp-field="section"], [data-lp-field="material"]')) {
      change((next) => {
        const member = selectedMember(next);
        if (target.dataset.lpField === 'section') member.section = target.value;
        else member.material = target.value;
      }, 'Member assignment changed. Stiffness, self-weight, and results have been recalculated.');
    } else if (target instanceof HTMLInputElement && target.hasAttribute('data-lp-field')) numericChange(target);
  }, { signal });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const pane = button.dataset.lpPane;
    if (pane) {
      root.dataset.mobilePane = pane;
      root.querySelectorAll<HTMLButtonElement>('[data-lp-pane]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.lpPane === pane)));
      return;
    }
    const view = button.dataset.lpView;
    if (view === 'orbit' || view === 'plan' || view === 'front') {
      scene.view(view);
      return;
    }
    const kind = button.dataset.lpSelectKind;
    if (kind === 'node' || kind === 'member') {
      if (kind !== selected.kind) selected = { kind, id: kind === 'node' ? model.nodes[0].id : model.members[0].id };
      refresh(); return;
    }
    if (button.dataset.lpInspectMember || button.dataset.lpInspectNode) {
      selected = button.dataset.lpInspectMember ? { kind: 'member', id: button.dataset.lpInspectMember } : { kind: 'node', id: button.dataset.lpInspectNode! };
      refresh();
      if (window.matchMedia('(max-width: 760px)').matches) query<HTMLButtonElement>(root, '[data-lp-pane="edit"]').click();
      query<HTMLElement>(root, '[data-lp-selection]').focus({ preventScroll: true });
      return;
    }
    if (button.dataset.lpNudge !== undefined) {
      try {
        const step = numberFrom(query<HTMLInputElement>(root, '[data-lp-field="nudge-step"]'), 'Nudge step');
        const axis = Number(button.dataset.lpNudge);
        change((next) => { selectedNode(next).position[axis] += step * Number(button.dataset.direction); }, `Moved ${selected.id} by ${step} m along ${AXES[axis]}.`);
      } catch (error) { if (!(error instanceof ModelError)) throw error; report(error.message, true); }
      return;
    }
    const name = button.dataset.lpAction;
    if (!name) return;
    if (name === 'undo' || name === 'redo') {
      history[name]();
      model = history.model; result = analyze(model); revision++; importRequest++; refresh();
      report(`${name === 'undo' ? 'Undo' : 'Redo'} applied. ${result.message}`, result.status !== 'stable');
    } else if (name === 'reset') reset();
    else if (name === 'home' || name === 'zoom-in' || name === 'zoom-out') scene.camera(name === 'home' ? 'home' : name === 'zoom-in' ? 'in' : 'out');
    else if (name === 'pin' && result.status === 'stable') {
      reference = { model: cloneModel(model), result, origin: history.origin };
      refresh(); report('This solved design and load case are pinned. Later edits do not change the reference.');
    } else if (name === 'clear-pin') { reference = null; refresh(); report('Pinned reference cleared.'); }
    else if (name === 'restore-pin' && reference) { commit(cloneModel(reference.model), 'Pinned geometry, properties, supports, and all load cases restored.', reference.origin); scene.camera('home'); }
    else if (name === 'connect') {
      const from = query<HTMLSelectElement>(root, '[data-lp-connect-from]').value;
      const to = query<HTMLSelectElement>(root, '[data-lp-connect-to]').value;
      change((next) => {
        const id = nextId('M', next.members);
        next.members.push({ id, a: from, b: to, section: next.sections[0].id, material: next.materials[0].id });
        parseModel(next);
        selected = { kind: 'member', id };
      }, `${from} connected to ${to} using the first section and material families.`);
    } else if (name === 'add-node') {
      try {
        const position: Vector3 = [
          numberFrom(query(root, '[data-lp-field="new-0"]'), 'New X'),
          numberFrom(query(root, '[data-lp-field="new-1"]'), 'New Y'),
          numberFrom(query(root, '[data-lp-field="new-2"]'), 'New Z'),
        ];
        change((next) => {
          const id = nextId('N', next.nodes);
          next.nodes.push({ id, position, restraints: [false, false, false] });
          parseModel(next);
          selected = { kind: 'node', id };
        }, 'A free joint was added. Brace or restrain its three translations to remove the new mechanism.');
      } catch (error) { if (!(error instanceof ModelError)) throw error; report(error.message, true); }
    } else if (name === 'remove-member') change((next) => { const member = selectedMember(next); next.members = next.members.filter((m) => m.id !== member.id); }, 'Member removed. Stability is recalculated without hidden replacement stiffness.');
    else if (name === 'remove-node') change((next) => {
      const node = selectedNode(next);
      if (next.nodes.length === 1) throw new ModelError('Keep at least one joint in the model.');
      next.nodes = next.nodes.filter((n) => n.id !== node.id);
      next.members = next.members.filter((m) => m.a !== node.id && m.b !== node.id);
      for (const c of next.loadCases) c.loads = c.loads.filter((l) => l.node !== node.id);
    }, 'Joint removed together with its incident members and point loads in every case.');
    else if (name === 'export-json') exportCurrent('json');
    else if (name === 'export-csv') exportCurrent('csv');
    else if (name === 'export-svg') exportCurrent('svg');
    else if (name === 'import-text') importText(query<HTMLTextAreaElement>(root, '[data-lp-import-text]').value);
  }, { signal });
  root.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    query<HTMLButtonElement>(root, `[data-lp-action="${event.shiftKey ? 'redo' : 'undo'}"]`).click();
  }, { signal });
  page.onCleanup(() => {
    active = false; importRequest++;
    scene.destroy();
    for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.clear();
  });
  refresh();
  report(STUDIES[0].note);
  await scene.ready;
  signal.throwIfAborted();
  root.dataset.ready = 'true';
  return { destroy: page.destroy, reset };
}
