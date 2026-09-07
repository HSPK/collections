import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query, writeLocalData } from '../../core/page';
import type { ProjectContext } from '../../core/types';
import {
  artifactText, branchDiff, choose, commit, current, deserialize, evaluate, FolioError,
  getRule, hintFor, HISTORY_LIMIT, isSave, locationStates, newHistory, serialize, travel, unmet, validateWorld,
} from './engine';
import type { Save } from './engine';
import { mountMap } from './map';
import { createFolioWorkspace } from './workspace';
import { ARTIFACTS, DECISIONS, ENDINGS, ERAS, PLACES, RULES } from './world';
import type { Artifact, Era, PlaceId } from './world';

const STORAGE_KEY = 'palinode.folio.v1';
const e = escapeMarkup;

function documentMarkup(artifact: Artifact, id: string): string {
  return `<button type="button" class="palinode-record-link" data-record="${artifact.id}" id="${id}-${artifact.id}">
    <span>${e(artifact.kind)}</span>${e(artifact.title)}</button>`;
}

export function mount(context: ProjectContext) {
  const issues = validateWorld();
  if (issues.length) throw new Error(`Invalid Palinode world: ${issues.join(' ')}`);
  const page = createProjectPage(context, 'palinode');
  const { root, signal } = page;
  let state: Save = { version: 1, history: newHistory(), pinned: null, era: 3, document: 'commission' };
  let selectedPlace: PlaceId = 'archive';
  let protectedSave = false;
  let preservedData: string | null = null;
  let initialNotice = '';
  let stagedImport: Save | null = null;
  let hintTarget = 'return';
  let hintVisible = false;
  let compareSide = 'current';
  let futureDocument = 'future-quay';
  let renderedDocument = '';

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      try {
        state = deserialize(stored);
        selectedPlace = ARTIFACTS.find((artifact) => artifact.id === state.document)!.place;
        initialNotice = 'Your saved folio is open. All branches and annotations are intact.';
      } catch (error) {
        if (!(error instanceof FolioError)) throw error;
        protectedSave = true;
        preservedData = stored;
        initialNotice = 'The saved folio is invalid or from another version. Its original data has been preserved; automatic saving is paused.';
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    protectedSave = true;
    initialNotice = 'Local storage is unavailable. You can still play and export this folio.';
  }

  root.innerHTML = `
    <header class="palinode-masthead">
      <a class="palinode-wordmark" href="#palinode-workspace" aria-label="Palinode, go to the folio">PALINODE<span> a civic palimpsest</span></a>
      <span class="palinode-volume">AVEN MUNICIPAL ARCHIVE <i>Vol. 01</i></span>
    </header>
    <div class="palinode-introduction">
      <div><p class="palinode-eyebrow">An original temporal mystery</p><h1>A city that remembers<br><em>differently.</em></h1></div>
      <div class="palinode-opening-note"><span class="palinode-note-number">135</span><span>years, held in the margin.</span><p>A civic score ends in silence.<br>Change what the city keeps.<br>Discover whom the blank is for.</p></div>
    </div>
    <div class="palinode-toolbar" aria-label="Folio tools">
      <div class="palinode-history-controls"><button type="button" data-action="undo" aria-label="Undo last decision">← Undo</button><button type="button" data-action="redo" aria-label="Redo decision">Redo →</button><span data-history-count></span></div>
      <div><button type="button" data-action="pin">Pin this future</button><button type="button" data-action="export">Export folio</button><button type="button" data-action="import">Import</button><button type="button" data-action="reset">Reset</button></div>
    </div>
    <p class="palinode-status" role="status" aria-live="polite" data-status>${e(initialNotice || 'Begin with the letter on the facing page. Your decisions are saved on this device.')}</p>
    <aside class="palinode-storage-warning" data-storage-warning role="alert" hidden>
      <p>Automatic saving is paused. Existing saved data will not be overwritten without your permission.</p>
      <button type="button" data-action="recover">Export preserved data</button><button type="button" data-action="replace-save">Save this city instead</button>
    </aside>
    <nav class="palinode-era-rail" aria-label="Historical era">
      ${ERAS.map((era, index) => `<button type="button" data-era="${index}" aria-label="${era.year}: ${e(era.name)}" title="${e(era.name)}" aria-pressed="false"><span class="palinode-era-dot"></span><strong>${era.year}</strong><span>${e(era.name)}</span><small>${index + 1} / 4</small></button>`).join('')}
    </nav>
    <div class="palinode-workspace" id="palinode-workspace" data-project-preview>
      <section class="palinode-map-sheet" aria-labelledby="palinode-city-title">
        <div class="palinode-sheet-heading"><div><span class="palinode-eyebrow">The city, in this telling</span><h2 id="palinode-city-title">Aven, <span data-current-year>2026</span></h2></div><span class="palinode-survey-stamp">SURVEY<br><b data-current-year>2026</b></span></div>
        <div class="palinode-main-map" data-main-map></div>
        <p class="palinode-map-caption"><span class="palinode-legend-line"></span> Enacted city <span class="palinode-legend-line palinode-legend-ghost"></span> Earlier footprints <span class="palinode-map-instruction">Select a numbered place to read its traces.</span></p>
        <div class="palinode-place-rail" aria-label="Places in Aven">${PLACES.map((place) => `<button type="button" data-place-link="${place.id}" aria-pressed="false"><span>${place.number}</span>${e(place.name)}</button>`).join('')}</div>
        <div class="palinode-place-caption"><span data-place-name></span><strong data-place-state></strong></div>
      </section>
      <section class="palinode-folio" aria-labelledby="palinode-document-title">
        <div class="palinode-folio-tab"><span>FROM THE RECORD</span><span data-doc-count></span></div>
        <label class="palinode-select-label" for="palinode-document-select">Open a document <select id="palinode-document-select" aria-label="Open a document">${ERAS.map((era, index) => `<optgroup label="${era.year} · ${e(era.name)}">${ARTIFACTS.filter((artifact) => artifact.era === index).map((artifact) => `<option value="${artifact.id}">${e(artifact.title)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <article class="palinode-document">
          <p class="palinode-document-kind" data-doc-kind></p>
          <h2 id="palinode-document-title" tabindex="-1"></h2>
          <p class="palinode-document-by" data-doc-by></p>
          <div class="palinode-document-text" data-doc-text></div>
          <aside class="palinode-marginalia"><span>In the margin</span><p data-doc-annotation></p></aside>
        </article>
        <div class="palinode-document-footer"><span data-doc-place></span><button type="button" data-action="next-document">Next document →</button></div>
      </section>
    </div>
    <div class="palinode-editor-layout">
      <section class="palinode-causes" aria-labelledby="palinode-causes-title">
        <div class="palinode-section-heading"><span class="palinode-section-number">I.</span><div><p class="palinode-eyebrow">Edit a cause, not its consequences</p><h2 id="palinode-causes-title"><span data-current-year></span> · <span data-era-title></span></h2></div></div>
        <p class="palinode-era-line" data-era-line></p>
        <p class="palinode-suspension" data-suspended hidden></p>
        ${DECISIONS.map((decision) => `<fieldset class="palinode-decision" data-decision="${decision.id}" data-decision-era="${decision.era}">
          <legend>${e(decision.title)}</legend><p class="palinode-decision-author">${e(decision.author)}</p><p class="palinode-decision-prompt">${e(decision.prompt)}</p>
          <div class="palinode-options">${decision.options.map((option) => `<button type="button" data-choice="${decision.id}:${option.id}" aria-pressed="false" aria-describedby="palinode-require-${option.rule}">
            <span class="palinode-choice-mark" aria-hidden="true"></span><span><strong>${e(option.label)}</strong><span class="palinode-option-detail">${e(option.detail)}</span><span class="palinode-option-require" id="palinode-require-${option.rule}"></span></span></button>`).join('')}</div>
        </fieldset>`).join('')}
        <div class="palinode-era-navigation"><button type="button" data-action="previous-era">← Earlier era</button><button type="button" data-action="next-era">Later era →</button></div>
      </section>
      <section class="palinode-future" aria-labelledby="palinode-future-title">
        <div class="palinode-future-sticky">
          <div class="palinode-section-heading"><span class="palinode-section-number">II.</span><div><p class="palinode-eyebrow">The facing future / always 2026</p><h2 id="palinode-future-title">Hold one city still.</h2></div></div>
          <div class="palinode-pin-empty" data-pin-empty><span class="palinode-pin-glyph" aria-hidden="true">⌖</span><p>Pin a future. Then go back and change a cause.<br>The city you kept will remain beside the city you make.</p><button type="button" data-action="pin">Pin this future</button><p class="palinode-small-note">A pin is a separate copy. Undo and redo will not move it.</p></div>
          <div class="palinode-comparison" data-comparison hidden>
            <div class="palinode-comparison-tools"><p><b data-diff-count>0</b> changes from the pinned branch</p><button type="button" data-action="unpin">Unpin</button></div>
            <div class="palinode-compare-tabs" role="group" aria-label="Future comparison panel"><button type="button" data-compare-side="pinned" aria-pressed="false">Pinned future</button><button type="button" data-compare-side="current" aria-pressed="true">Revised future</button></div>
            <div class="palinode-future-maps">
              <div class="palinode-future-pane" data-future-pane="pinned"><h3>Before <span>the pinned future</span></h3><div data-pinned-map></div><p data-pinned-location></p></div>
              <div class="palinode-future-pane" data-future-pane="current"><h3>After <span>your revised future</span></h3><div data-revised-map></div><p data-revised-location></p></div>
            </div>
            <label class="palinode-select-label" for="palinode-future-document">Compare a future record <select id="palinode-future-document">${ARTIFACTS.filter((artifact) => artifact.era === 3).map((artifact) => `<option value="${artifact.id}">${e(artifact.title)}</option>`).join('')}</select></label>
            <div class="palinode-future-records">
              <article data-future-pane="pinned"><h3>Pinned wording</h3><div class="palinode-compare-text" data-pinned-text></div></article>
              <article data-future-pane="current"><h3>Revised wording</h3><div class="palinode-compare-text" data-revised-text></div></article>
            </div>
            <details class="palinode-details"><summary>See the branch difference</summary><ol class="palinode-diff-list" data-diff-list></ol></details>
          </div>
        </div>
      </section>
    </div>
    <section class="palinode-objective" aria-labelledby="palinode-objective-title">
      <div><p class="palinode-eyebrow">The work left to do</p><h2 id="palinode-objective-title">Make an honest ending.</h2><p>Understand the empty measure, give the surviving work a home, and invite the people who can complete it. A city cannot keep everything.</p></div>
      <div class="palinode-goals">
        ${ENDINGS.map((ending) => `<div class="palinode-goal" data-goal="${ending.id}"><h3>${e(ending.subtitle)}</h3><strong>${e(ending.title)}</strong><ul>${getRule(ending.ready).all!.map((id) => `<li data-goal-rule="${id}"><span aria-hidden="true"></span>${e(getRule(id).label)}</li>`).join('')}</ul></div>`).join('')}
      </div>
      <div class="palinode-hints"><label for="palinode-hint-target">A hint toward <select id="palinode-hint-target">${ENDINGS.map((ending) => `<option value="${ending.id}">${e(ending.title)}</option>`).join('')}</select></label><button type="button" data-action="hint">Find an unmet cause</button><p data-hint role="status" hidden></p></div>
    </section>
    <section class="palinode-ending" data-ending-panel hidden aria-labelledby="palinode-ending-title"><p class="palinode-eyebrow" data-ending-subtitle></p><h2 id="palinode-ending-title" tabindex="-1"></h2><div data-ending-text></div><p class="palinode-ending-postscript">This telling is complete. The folio is not closed.</p><button type="button" data-action="pin-ending">Keep this ending on the facing page</button><button type="button" data-action="explore">Return to the foundations</button></section>
    <section class="palinode-ledger-area">
      <details class="palinode-details palinode-ledger"><summary><span>III. The causal ledger</span><small>Every fact has a reason</small></summary><p>These are the enacted facts in 2026, not predictions. A later selection whose prerequisite disappears is retained as a <em>suspended intention</em>; it is never replaced with another choice.</p><ol>${RULES.map((rule) => `<li data-ledger-rule="${rule.id}"><div><strong>${e(rule.label)}</strong><span data-rule-truth></span></div><p>${e(rule.because)}</p><p class="palinode-rule-deps" data-rule-deps></p></li>`).join('')}</ol></details>
      <details class="palinode-details"><summary><span>IV. Your editorial history</span><small>Undo is not forgetting</small></summary><label class="palinode-select-label" for="palinode-history">Revisit a revision <select id="palinode-history"></select></label><p>Editing after an undo starts a new branch and replaces its redo path. Pin or export the old branch first if you want to keep it.</p></details>
      <details class="palinode-details"><summary><span>V. The document index</span><small>28 authored records / 4 eras</small></summary><div class="palinode-record-index">${ERAS.map((era, index) => `<section><h3>${era.year}</h3>${ARTIFACTS.filter((artifact) => artifact.era === index).map((artifact) => documentMarkup(artifact, 'palinode-index')).join('')}</section>`).join('')}</div></details>
      <details class="palinode-details"><summary><span>How to read a city</span><small>A short guide</small></summary><div class="palinode-guide"><p><b>1. Read the map.</b> Each numbered place has records in every era. The era rail takes you between four periods; click or use Tab and Enter. No dragging is required.</p><p><b>2. Pin the future.</b> A pinned branch is a still copy of 2026. While you edit 1891, 1932, or 1976, the facing page compares the same future record and map in both branches. On narrow screens, use the Pinned / Revised buttons.</p><p><b>3. Edit institutions.</b> Each grant or instruction permits one choice. Missing prerequisites are named below the choice. When a past edit invalidates a later choice, its intention stays in your history but its effects stop.</p><p><b>4. Finish honestly.</b> The three goal lists and hint button read the very same rules as the maps and documents. The hint points to one unmet cause; it never changes the city. Select an available ending in 2026.</p><p><b>5. Keep your folio.</b> Decisions, undo/redo history, era, open document, and pinned branch save locally. Export a versioned JSON file for a durable copy. Import and reset require confirmation. A reset can itself be undone.</p><p>Aven, its people, institutions, documents, and performances are original fiction. This is not a simulation of a real city. Its trade-offs are deliberately finite so their consequences can be read.</p></div></details>
    </section>
    <footer class="palinode-colophon"><span>PALINODE <i>n.</i> a poem that revises an earlier poem.</span><span>Nothing missing is automatically forgotten.</span></footer>
    <input type="file" accept=".json,application/json" data-import-file hidden>
    <dialog class="palinode-dialog" data-dialog aria-labelledby="palinode-dialog-title"><h2 id="palinode-dialog-title"></h2><p data-dialog-text></p><div><button type="button" data-action="dialog-cancel">Keep this folio</button><button type="button" data-action="dialog-confirm"></button></div></dialog>
  `;

  const workspace = createFolioWorkspace(page);
  const status = query<HTMLElement>(root, '[data-status]');
  function report(message: string): void { status.textContent = message; }
  const mainMap = mountMap(query(root, '[data-main-map]'), 'palinode-main', selectPlace, signal);
  const pinnedMap = mountMap(query(root, '[data-pinned-map]'), 'palinode-pinned', selectPlace, signal);
  const revisedMap = mountMap(query(root, '[data-revised-map]'), 'palinode-revised', selectPlace, signal);
  const fullMap = mountMap(query(root, '[data-full-map]'), 'palinode-full', selectPlace, signal);
  const docSelect = query<HTMLSelectElement>(root, '#palinode-document-select');
  const futureSelect = query<HTMLSelectElement>(root, '#palinode-future-document');
  const historySelect = query<HTMLSelectElement>(root, '#palinode-history');
  const dialog = query<HTMLDialogElement>(root, '[data-dialog]');
  let dialogAction: 'reset' | 'import' | 'save' = 'reset';
  let returnFocus: HTMLElement | null = null;

  function save(): boolean {
    if (protectedSave) return false;
    if (!isSave(state)) { report('The folio cannot be saved: its history exceeds the supported limit. Export a shorter revision or reset.'); return false; }
    const written = writeLocalData(STORAGE_KEY, state, (message) => { report(message); context.report(message); });
    if (!written) {
      protectedSave = true;
      query<HTMLElement>(root, '[data-storage-warning]').hidden = false;
    }
    return written;
  }
  function setText(selector: string, text: string): void { query<HTMLElement>(root, selector).textContent = text; }
  function paragraphs(container: HTMLElement, lines: readonly string[]): void {
    const existing = Array.from(container.children);
    lines.forEach((line, index) => {
      const paragraph = existing[index] ?? container.appendChild(document.createElement('p'));
      if (paragraph.textContent !== line) paragraph.textContent = line;
    });
    for (const child of existing.slice(lines.length)) child.remove();
  }
  function selectPlace(place: PlaceId): void {
    selectedPlace = place;
    const candidate = ARTIFACTS.find((artifact) => artifact.era === state.era && artifact.place === place && artifactText(artifact, evaluate(current(state.history))));
    if (candidate) state.document = candidate.id;
    update();
    save();
    report(`${PLACES.find((item) => item.id === place)!.name}: ${candidate ? candidate.title : 'no surviving record in this era'}.`);
  }
  function selectEra(era: Era): void {
    state.era = era;
    const evaluation = evaluate(current(state.history));
    const candidate = ARTIFACTS.find((artifact) => artifact.era === era && artifact.place === selectedPlace && artifactText(artifact, evaluation)) ??
      ARTIFACTS.find((artifact) => artifact.era === era && artifactText(artifact, evaluation));
    if (candidate) { state.document = candidate.id; selectedPlace = candidate.place; }
    update();
    save();
    report(`${ERAS[era].year}: ${ERAS[era].name}. ${state.pinned ? 'The pinned future remains unchanged.' : 'Open Decide to edit the causes.'}`);
  }
  function openRecord(id: string): void {
    const artifact = ARTIFACTS.find((item) => item.id === id);
    if (!artifact) { report('That document is not part of this folio.'); return; }
    state.document = artifact.id;
    state.era = artifact.era;
    selectedPlace = artifact.place;
    update();
    save();
  }
  function update(): void {
    const choices = current(state.history);
    const evaluation = evaluate(choices);
    const historical = evaluate(choices, state.era);
    const pinned = state.pinned ? evaluate(state.pinned) : undefined;
    const places = locationStates(historical, state.era);
    mainMap.update(historical, state.era, selectedPlace);
    fullMap.update(historical, state.era, selectedPlace);
    workspace.place.value = selectedPlace;
    for (const text of root.querySelectorAll('[data-current-year]')) text.textContent = ERAS[state.era].year;
    setText('[data-era-title]', ERAS[state.era].name);
    setText('[data-era-line]', ERAS[state.era].line);
    setText('[data-place-name]', PLACES.find((place) => place.id === selectedPlace)!.name);
    setText('[data-place-state]', places[selectedPlace]);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-era]')) button.setAttribute('aria-pressed', String(Number(button.dataset.era) === state.era));
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-place-link]')) button.setAttribute('aria-pressed', String(button.dataset.placeLink === selectedPlace));
    for (const fieldset of root.querySelectorAll<HTMLFieldSetElement>('[data-decision-era]')) fieldset.hidden = Number(fieldset.dataset.decisionEra) !== state.era;
    for (const decision of DECISIONS) {
      for (const option of decision.options) {
        const button = query<HTMLButtonElement>(root, `[data-choice="${decision.id}:${option.id}"]`);
        const missing = unmet(option.rule, evaluation);
        const selected = choices[decision.id] === option.id;
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-disabled', String(missing.length > 0));
        button.classList.toggle('palinode-choice-suspended', selected && missing.length > 0);
        query<HTMLElement>(button, '.palinode-option-require').textContent = missing.length ?
          `${selected ? 'Suspended. ' : ''}Requires: ${missing.map((id) => getRule(id).label).join(' + ')}.` : selected ? 'Entered in the record' : 'Available in this city';
      }
    }
    query<HTMLButtonElement>(root, '[data-action="undo"]').disabled = state.history.cursor === 0;
    query<HTMLButtonElement>(root, '[data-action="redo"]').disabled = state.history.cursor === state.history.entries.length - 1;
    query<HTMLButtonElement>(root, '[data-action="previous-era"]').disabled = state.era === 0;
    query<HTMLButtonElement>(root, '[data-action="next-era"]').disabled = state.era === 3;
    setText('[data-history-count]', `${state.history.cursor} revisions`);
    const suspended = query<HTMLElement>(root, '[data-suspended]');
    suspended.hidden = evaluation.suspended.length === 0;
    suspended.textContent = `Suspended intentions: ${evaluation.suspended.map((id) => DECISIONS.find((item) => item.id === id)!.title).join('; ')}. Earlier changes removed their prerequisites. Restore the cause or choose a compatible option; no alternative has been chosen for you.`;

    const artifact = ARTIFACTS.find((item) => item.id === state.document)!;
    const variant = artifactText(artifact, evaluation);
    docSelect.value = artifact.id;
    setText('[data-doc-kind]', `${artifact.kind} / ${artifact.date}`);
    setText('#palinode-document-title', artifact.title);
    setText('[data-doc-by]', artifact.by);
    setText('[data-doc-count]', `${String(ARTIFACTS.indexOf(artifact) + 1).padStart(2, '0')} / 28`);
    setText('[data-doc-place]', `${ERAS[artifact.era].year} · ${PLACES.find((place) => place.id === artifact.place)!.name}`);
    paragraphs(query(root, '[data-doc-text]'), variant?.text ?? ['This document does not exist in the enacted branch. Its title remains here so you can see what changed; its evidence is not available.']);
    setText('[data-doc-annotation]', variant?.annotation ?? `Requires: ${getRule(artifact.visible!).label}. Restore that source to make this record visible again.`);
    if (renderedDocument !== artifact.id) {
      query<HTMLElement>(root, '.palinode-document').scrollTop = 0;
      renderedDocument = artifact.id;
    }
    for (const option of docSelect.options) {
      const record = ARTIFACTS.find((item) => item.id === option.value)!;
      option.textContent = `${record.title}${artifactText(record, evaluation) ? '' : ' [source absent]'}`;
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-record]')) {
      const record = ARTIFACTS.find((item) => item.id === button.dataset.record)!;
      button.classList.toggle('palinode-record-absent', !artifactText(record, evaluation));
    }

    query<HTMLElement>(root, '[data-pin-empty]').hidden = !!pinned;
    query<HTMLElement>(root, '[data-comparison]').hidden = !pinned;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action="pin"]')) button.textContent =
      button.closest('.palinode-toolbar') ? pinned ? 'Repin future' : 'Pin future' : pinned ? 'Repin current future' : 'Pin this future';
    if (pinned && state.pinned) {
      const diff = branchDiff(state.pinned, choices);
      const revised = evaluate(choices);
      pinnedMap.update(pinned, 3, selectedPlace);
      revisedMap.update(revised, 3, selectedPlace, pinned);
      setText('[data-diff-count]', String(diff.length));
      setText('[data-pinned-location]', locationStates(pinned, 3)[selectedPlace]);
      setText('[data-revised-location]', locationStates(revised, 3)[selectedPlace]);
      const future = ARTIFACTS.find((item) => item.id === futureDocument)!;
      futureSelect.value = futureDocument;
      paragraphs(query(root, '[data-pinned-text]'), artifactText(future, pinned)?.text ?? ['This record does not exist in the pinned branch.']);
      paragraphs(query(root, '[data-revised-text]'), artifactText(future, revised)?.text ?? ['This record does not exist in the revised branch.']);
      const diffList = query<HTMLOListElement>(root, '[data-diff-list]');
      diffList.replaceChildren(...diff.map((change) => {
        const li = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = `${change.kind} / ${change.label}`;
        const line = document.createElement('p');
        line.textContent = `${change.before} → ${change.after}. ${change.why}`;
        li.append(title, line);
        return li;
      }));
      if (!diff.length) {
        const li = document.createElement('li');
        li.textContent = 'The futures still agree. Visit an earlier era and edit a cause.';
        diffList.append(li);
      }
    }
    for (const pane of root.querySelectorAll<HTMLElement>('[data-future-pane]')) pane.classList.toggle('palinode-pane-mobile-hidden', pane.dataset.futurePane !== compareSide);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-compare-side]')) button.setAttribute('aria-pressed', String(button.dataset.compareSide === compareSide));
    for (const goal of root.querySelectorAll<HTMLElement>('[data-goal-rule]')) {
      const value = !!evaluation.facts[goal.dataset.goalRule!];
      goal.classList.toggle('palinode-goal-met', value);
      goal.querySelector('span')!.textContent = value ? '✓' : '○';
      goal.setAttribute('aria-label', `${value ? 'Met' : 'Unmet'}: ${getRule(goal.dataset.goalRule!).label}`);
    }
    for (const ending of ENDINGS) query<HTMLElement>(root, `[data-goal="${ending.id}"]`).classList.toggle('palinode-goal-ready', evaluation.facts[ending.ready]);
    for (const rule of RULES) {
      const row = query<HTMLElement>(root, `[data-ledger-rule="${rule.id}"]`);
      const value = evaluation.facts[rule.id];
      row.classList.toggle('palinode-rule-true', value);
      query(row, '[data-rule-truth]').textContent = value ? 'ENACTED' : 'NOT ENACTED';
      const missing = unmet(rule.id, evaluation);
      const own = rule.choice && choices[rule.choice.decision] !== rule.choice.value ? `Choice not entered: ${DECISIONS.find((item) => item.id === rule.choice?.decision)!.options.find((option) => option.id === rule.choice?.value)!.label}. ` : '';
      query(row, '[data-rule-deps]').textContent = `${own}${missing.length ? `Unmet causes: ${missing.map((id) => getRule(id).label).join('; ')}.` : value ? 'All required causes are present.' : 'Its prerequisites are available.'}`;
    }
    const endingPanel = query<HTMLElement>(root, '[data-ending-panel]');
    endingPanel.hidden = !evaluation.ending;
    query<HTMLElement>(root, '.palinode-no-ending').hidden = !!evaluation.ending;
    root.dataset.ending = evaluation.ending?.id ?? '';
    if (evaluation.ending) {
      setText('[data-ending-subtitle]', evaluation.ending.subtitle);
      setText('#palinode-ending-title', evaluation.ending.title);
      paragraphs(query(root, '[data-ending-text]'), evaluation.ending.text);
    }
    if (hintVisible) {
      const hint = query<HTMLElement>(root, '[data-hint]');
      hint.hidden = false;
      hint.textContent = hintFor(choices, hintTarget).text;
    }
    historySelect.replaceChildren(...state.history.labels.map((label, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index}. ${label}${index > state.history.cursor ? ' [redo path]' : ''}`;
      return option;
    }));
    historySelect.value = String(state.history.cursor);
    query<HTMLElement>(root, '[data-storage-warning]').hidden = !protectedSave;
    query<HTMLButtonElement>(root, '[data-action="recover"]').hidden = preservedData === null;
  }

  function showDialog(action: typeof dialogAction, trigger: HTMLElement): void {
    dialogAction = action;
    returnFocus = trigger;
    setText('#palinode-dialog-title', action === 'reset' ? 'Begin another telling?' : action === 'import' ? 'Open the imported folio?' : 'Replace the saved data?');
    setText('[data-dialog-text]', action === 'reset' ? 'This returns the city to its inherited decisions. Your pin stays, and reset is one undoable revision. Export first if you also want an independent copy.' : action === 'import' ? 'The imported folio will replace the current city, history, and pin. Export your current folio first if you want to retain it.' : 'This explicitly replaces the preserved saved data with the city now open. Export the preserved data first if you want to keep it.');
    setText('[data-action="dialog-confirm"]', action === 'reset' ? 'Reset the city' : action === 'import' ? 'Replace with imported folio' : 'Replace saved data');
    dialog.showModal();
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.era !== undefined) {
      const era = Number(button.dataset.era);
      if (era === 0 || era === 1 || era === 2 || era === 3) selectEra(era);
      return;
    }
    if (button.dataset.placeLink) {
      const place = PLACES.find((item) => item.id === button.dataset.placeLink);
      if (place) selectPlace(place.id);
      return;
    }
    if (button.dataset.record) {
      openRecord(button.dataset.record);
      workspace.archive.close();
      workspace.tabs.select('read');
      query<HTMLElement>(root, '#palinode-document-title').focus({ preventScroll: true });
      return;
    }
    if (button.dataset.compareSide) { compareSide = button.dataset.compareSide; update(); return; }
    if (button.dataset.choice) {
      const [decisionId, optionId] = button.dataset.choice.split(':');
      const decision = DECISIONS.find((item) => item.id === decisionId)!;
      const option = decision.options.find((item) => item.id === optionId)!;
      const missing = unmet(option.rule, evaluate(current(state.history)));
      if (missing.length) { report(`Not entered. Requires: ${missing.map((id) => getRule(id).label).join('; ')}.`); return; }
      if (state.history.cursor >= HISTORY_LIMIT - 1) { report('The 2,000-revision limit has been reached. Export this folio before starting a shorter branch from history.'); return; }
      state.history = commit(state.history, choose(current(state.history), decision.id, option.id), `${ERAS[decision.era].year}: ${option.label}`);
      update();
      save();
      const ending = evaluate(current(state.history)).ending;
      report(`${option.label} entered. ${state.pinned ? `${branchDiff(state.pinned, current(state.history)).filter((change) => change.kind === 'fact').length} causal facts differ from your pin.` : 'The downstream city has been recalculated.'}`);
      if (decision.id === 'performance' && ending) {
        workspace.tabs.select('ending');
        query<HTMLElement>(root, '#palinode-ending-title').focus({ preventScroll: true });
        report(`${ending.subtitle}. ${ending.title}. Your ending is recorded; you may continue exploring.`);
      }
      return;
    }
    switch (button.dataset.action) {
      case 'undo': case 'redo':
        state.history = travel(state.history, button.dataset.action === 'undo' ? -1 : 1);
        update(); save(); report(`Now at revision ${state.history.cursor}: ${state.history.labels[state.history.cursor]}.`); break;
      case 'pin': case 'pin-ending':
        state.pinned = { ...current(state.history) }; update(); save();
        if (button.dataset.action === 'pin-ending') workspace.tabs.select('future', true);
        report('The 2026 future is pinned. Visit an earlier era; Compare shows both future maps and the facing record.'); break;
      case 'unpin': state.pinned = null; update(); save(); report('Facing-page pin removed. Your current city and history are unchanged.'); break;
      case 'previous-era': if (state.era > 0) selectEra((state.era - 1) as Era); break;
      case 'next-era': if (state.era < 3) selectEra((state.era + 1) as Era); break;
      case 'next-document': {
        const available = ARTIFACTS.filter((artifact) => artifact.era === state.era && artifactText(artifact, evaluate(current(state.history))));
        const next = available[(available.findIndex((artifact) => artifact.id === state.document) + 1) % available.length];
        openRecord(next.id); break;
      }
      case 'hint': hintVisible = true; update(); break;
      case 'export': downloadText('palinode-folio-v1.json', serialize(state), 'application/json'); report('Folio exported, including the full undo history and pinned future.'); break;
      case 'import': query<HTMLInputElement>(root, '[data-import-file]').click(); break;
      case 'reset': showDialog('reset', button); break;
      case 'replace-save': showDialog('save', button); break;
      case 'recover': if (preservedData !== null) downloadText('palinode-preserved-data.txt', preservedData); break;
      case 'dialog-cancel': dialog.close(); stagedImport = null; returnFocus?.focus(); break;
      case 'dialog-confirm': {
        if (dialogAction === 'reset') {
          if (state.history.cursor >= HISTORY_LIMIT - 1) { report('History is full. Export, then revisit an earlier revision before resetting.'); dialog.close(); break; }
          state.history = commit(state.history, current(newHistory()), 'Reset to the inherited city');
          state.era = 3; state.document = 'commission'; selectedPlace = 'archive';
        } else if (dialogAction === 'import' && stagedImport) {
          state = stagedImport; stagedImport = null;
          selectedPlace = ARTIFACTS.find((artifact) => artifact.id === state.document)!.place;
        } else if (dialogAction === 'save') {
          protectedSave = false;
        }
        dialog.close(); update();
        const written = save();
        if (dialogAction === 'save' && written) preservedData = null;
        returnFocus?.focus();
        report(dialogAction === 'reset' ? 'The inherited city is restored. Undo can recover your previous decisions; the pin has not changed.' : dialogAction === 'import' ? 'Imported folio opened. Its history and pinned future are intact.' : written ? 'The current folio has replaced the preserved data.' : 'The browser could not write this folio. Saving remains paused; export to retain your work.');
        break;
      }
      case 'explore': selectEra(0); workspace.tabs.select('edit'); query<HTMLButtonElement>(root, '[data-era="0"]').focus(); break;
    }
  }, { signal });
  docSelect.addEventListener('change', () => openRecord(docSelect.value), { signal });
  workspace.place.addEventListener('change', () => {
    const place = PLACES.find(item => item.id === workspace.place.value);
    if (!place) throw new RangeError('Unknown place in Aven.');
    selectPlace(place.id);
  }, { signal });
  futureSelect.addEventListener('change', () => { futureDocument = futureSelect.value; update(); }, { signal });
  query<HTMLSelectElement>(root, '#palinode-hint-target').addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement) { hintTarget = event.target.value; if (hintVisible) update(); }
  }, { signal });
  historySelect.addEventListener('change', () => {
    const cursor = Number(historySelect.value);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor >= state.history.entries.length) { report('That revision is not available.'); return; }
    state.history = { ...state.history, cursor }; update(); save(); report(`Opened revision ${cursor}. Editing here replaces its redo path; pin or export first to preserve it.`);
  }, { signal });
  query<HTMLInputElement>(root, '[data-import-file]').addEventListener('change', async (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 4_000_000) { report('This file exceeds the 4 MB folio limit. Your current city has not changed.'); return; }
    try {
      const text = await file.text();
      if (signal.aborted) return;
      stagedImport = deserialize(text);
      showDialog('import', query(root, '[data-action="import"]'));
    } catch (error) {
      if (!(error instanceof FolioError) && !(error instanceof DOMException)) throw error;
      report(error instanceof FolioError ? error.message : 'This file could not be read. Your current city has not changed.');
    }
  }, { signal });
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    protectedSave = true;
    preservedData = event.newValue;
    update();
    report('Another tab changed the saved folio. Your open city is unchanged and automatic saving is paused. Export it before choosing which version to keep.');
  }, { signal });
  root.classList.toggle('palinode-reduced-motion', context.reducedMotion);
  update();
  return { destroy: page.destroy };
}
