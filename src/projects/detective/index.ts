import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CASES } from './data';
import type { CaseFile, Evidence, Person } from './data';
import { assessConclusion, possibleHypotheses, setTimelineNote } from './engine';
import type { Conclusion } from './engine';

interface Investigation {
  inspected: Set<string>;
  expanded: Set<string>;
  pinned: Set<string>;
  eliminated: Set<string>;
  personId: string | null;
  notes: string;
  timelineNotes: string[];
  theories: number;
  result: Conclusion | null;
  solved: boolean;
  confirmRestart: boolean;
}

function newInvestigation(file: CaseFile): Investigation {
  return {
    inspected: new Set(),
    expanded: new Set(),
    pinned: new Set(),
    eliminated: new Set(),
    personId: null,
    notes: '',
    timelineNotes: file.logic.kind === 'order' ? file.logic.slots.map(() => '') : [],
    theories: 0,
    result: null,
    solved: false,
    confirmRestart: false,
  };
}

function caseIllustration(kind: CaseFile['illustration']): string {
  const drawings = {
    cake: `<path d="M34 145h172M47 136h145l-13 9H61z" fill="#514438"/>
      <path d="M68 114V81h100v33" fill="#b9784d" stroke="#493243" stroke-width="3"/>
      <path d="M68 95h100M68 109h100" stroke="#f7e8c9" stroke-width="7"/>
      <path d="M66 81c0-16 23-24 53-24s51 8 51 24c-4 11-10 3-15 10-7 9-13-5-20 0-9 8-12-6-20-1-8 6-13-7-22-1-10 5-14-7-19-3z" fill="#fff8e8" stroke="#493243" stroke-width="3"/>
      <ellipse cx="119" cy="63" rx="14" ry="5" fill="#ddad39" transform="rotate(-18 119 63)"/>
      <path d="M45 134V86a74 74 0 0 1 148 0v48" fill="none" stroke="#756d65" stroke-width="3"/>
      <path d="M62 74q7-29 32-38" fill="none" stroke="#fff8e8" stroke-width="6" stroke-linecap="round"/>
      <path d="M112 13v-6h14v6M35 134h168" stroke="#493243" stroke-width="4" fill="none"/>
      <path d="M191 71q-4-25 18-29c2 17-4 25-18 29m0 0q-15-13-23-3c7 13 16 12 23 3" fill="#78896a"/>
      <path d="M191 69q-6 16 3 25" fill="none" stroke="#4f674d" stroke-width="2"/>`,
    parcel: `<path d="m48 58 99-22 56 33-100 24z" fill="#d9b58d" stroke="#493243" stroke-width="3"/>
      <path d="m48 58 55 35v69l-55-36z" fill="#b98558" stroke="#493243" stroke-width="3"/>
      <path d="m103 93 100-24v70l-100 23z" fill="#ead4ae" stroke="#493243" stroke-width="3"/>
      <path d="m66 70 97-25M88 83l96-25M122 89v68M144 83v69M166 78v69M187 73v69" stroke="#557377" stroke-width="5" opacity=".7"/>
      <path d="m80 77 98-23M155 81v69M48 96l55 33 100-26" fill="none" stroke="#fff6df" stroke-width="5"/>
      <circle cx="155" cy="114" r="17" fill="#fff9e8" stroke="#493243" stroke-width="2"/>
      <path d="M153 122v-13m0 7q-11-1-9-9 9-1 9 9m1-6q0-10 10-10 0 10-10 10" fill="#81906c" stroke="#4f674d" stroke-width="2"/>
      <path d="M69 33q-13-6-19 5m143 117 8 7m-9-4 10-9" stroke="#b45a40" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    label: `<path d="M47 123h114v14H47zM56 137h96v26H56z" fill="#d3ba93" stroke="#493243" stroke-width="3"/>
      <path d="M103 65v44q0 15-12 15t-12-12" fill="none" stroke="#493243" stroke-width="4"/>
      <path d="M59 65q44-68 88 0c-14-10-20-10-29 0-11-11-20-11-31 0-11-10-17-10-28 0z" fill="#728886" stroke="#493243" stroke-width="3"/>
      <path d="M103 19v7m0 0Q82 41 87 64m16-38q21 15 15 38" stroke="#493243" stroke-width="2" fill="none"/>
      <path d="M63 144h62v12H63z" fill="none" stroke="#927963" stroke-width="2" stroke-dasharray="4 4"/>
      <path d="m159 73 47 16-15 70-47-16z" fill="#71816c" stroke="#493243" stroke-width="3"/>
      <path d="m165 75-15 69" stroke="#f7e8c9" stroke-width="3"/>
      <path d="m166 106 35 9-6 22-35-9z" fill="#fff8e8" stroke="#493243" stroke-width="2"/>
      <path d="m169 115 21 6m-23 0 15 5" stroke="#ad7652" stroke-width="2"/>
      <path d="M166 47q12-19 27-12m-7-7 10 9-12 6" fill="none" stroke="#b45a40" stroke-width="3" stroke-linecap="round"/>`,
  };
  return `<svg class="td-case-drawing" viewBox="0 0 240 184" aria-hidden="true" focusable="false">${drawings[kind]}</svg>`;
}

function portrait(person: Person): string {
  const hairstyles = [
    '<path d="M25 41q-8-28 23-27 28-1 22 30l-9-18q-11 14-29 5z" fill="#675048"/><path d="M30 64q-15 1-9-19m44 18q15 1 10-20" fill="#675048"/>',
    '<path d="M23 30h51v10H23z" fill="#8b6651"/><path d="m33 16 30-2 6 17H28z" fill="#c4a266"/><path d="M30 21h37" stroke="#493243" stroke-width="3"/>',
    '<path d="M25 38c-13-13 3-20 11-17 1-16 21-15 24-3 16-4 23 14 9 21l-10-11-12 6-12-6z" fill="#514438"/>',
    '<path d="M23 33q4-26 28-23 23 1 22 24H23z" fill="#738783"/><path d="M20 33h60l-9 8H23z" fill="#4c6768"/><path d="M48 12v20" stroke="#d4d9bb" stroke-width="2"/>',
  ];
  return `<svg class="td-portrait" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
    <circle cx="48" cy="48" r="45" fill="#e7d7b8"/>
    <path d="M17 96q1-26 30-26t32 26" fill="${person.avatar % 2 ? '#ad7356' : '#71816c'}"/>
    <path d="M40 64v14l8 7 9-7V64" fill="#d5ab87" stroke="#493243" stroke-width="2"/>
    <ellipse cx="48" cy="46" rx="22" ry="26" fill="#e8bf96" stroke="#493243" stroke-width="2"/>
    ${hairstyles[person.avatar]}
    <path d="M37 43h2m19 0h2" stroke="#493243" stroke-width="3" stroke-linecap="round"/>
    <path d="m49 44-3 9h5m-10 7q7 5 14-1" fill="none" stroke="#493243" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function exhibitIcon(kind: Evidence['kind']): string {
  const drawings = {
    log: '<path d="m17 13 39 3-3 49-39-3z" fill="#fff8e8" stroke="currentColor" stroke-width="2"/><path d="m23 26 24 2m-25 8 24 2m-25 8 16 1m-17 9 21 1" stroke="currentColor" stroke-width="2"/><path d="m44 8 9 1-1 14-9-1z" fill="#b96b51"/>',
    trace: '<circle cx="32" cy="31" r="20" fill="#fff8e8" stroke="currentColor" stroke-width="3"/><path d="m46 46 18 19" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="m21 38 21-14m-19 6 10-8m0 18 12-9" stroke="#b96b51" stroke-width="3" stroke-linecap="round"/>',
    route: '<path d="m9 21 19-6 21 7 18-6v42l-18 7-21-7-19 6z" fill="#fff8e8" stroke="currentColor" stroke-width="2"/><path d="M28 15v43m21-36v43" stroke="#c6ad8b" stroke-width="2"/><path d="m17 50 21-17 19 10" fill="none" stroke="#b96b51" stroke-width="3" stroke-dasharray="5 3"/><circle cx="57" cy="43" r="4" fill="#b96b51"/>',
    note: '<path d="m14 17 47-4 4 49-47 4z" fill="#fff8e8" stroke="currentColor" stroke-width="2"/><path d="m22 31 29-2m-28 12 23-2m-22 12 15-1" stroke="currentColor" stroke-width="2"/><path d="m27 9 18-1 1 14-18 1z" fill="#9dac90" opacity=".8"/>',
  };
  return `<svg class="td-exhibit-icon" viewBox="0 0 76 76" aria-hidden="true" focusable="false">${drawings[kind]}</svg>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'detective');
  const { root, signal } = page;
  const investigations = CASES.map(newInvestigation);
  let activeCase = 0;

  root.innerHTML = `
    <div class="td-shell">
      <header class="td-masthead">
        <div class="td-masthead-top"><span class="td-wordmark">The tiny casework bureau</span><span class="td-edition">A casebook of everyday curiosities</span></div>
        <div class="td-title-row">
          <div><p class="td-eyebrow">Small mysteries. Excellent questions.</p><h1>The Tiny<br><em>Detective.</em></h1>
            <p class="td-intro">A missing cake. A wayward parcel. A label on the loose. Three little mysteries for a very observant mind.</p></div>
          <div class="td-bureau-seal" aria-hidden="true">
            <svg viewBox="0 0 190 200" focusable="false"><path d="m103 112 45 57" stroke="#ddaf79" stroke-width="19" stroke-linecap="round"/><path d="m101 116 42 53" stroke="#493243" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="78" r="52" fill="#f5e8ce" stroke="#ddaf79" stroke-width="8"/><circle cx="80" cy="78" r="42" fill="none" stroke="#493243" stroke-width="2"/><path d="m63 85 12 12 24-36" fill="none" stroke="#647b69" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M134 39h18m-9-9v18M29 145h12m-6-6v12" stroke="#ddaf79" stroke-width="3"/><path d="M36 118q-8 23 17 32" fill="none" stroke="#ddaf79" stroke-width="2" stroke-dasharray="4 5"/></svg>
            <span>Notice.<br>Connect.<br>Explain.</span>
          </div>
        </div>
        <div class="td-masthead-bottom"><span>Three original, nonviolent cases</span><a href="#td-case-files">Open the case files <span aria-hidden="true">&darr;</span></a></div>
      </header>

      <nav id="td-case-files" class="td-case-library" aria-label="Choose a mystery"></nav>

      <details class="td-how-to">
        <summary>New to the bureau? How to investigate <span aria-hidden="true">+</span></summary>
        <ol><li><strong>Read the scene.</strong> The case rules tell you which records can be trusted.</li><li><strong>Inspect the exhibits.</strong> Pin the clues that identify someone; not every detail does.</li><li><strong>Compare the people.</strong> Rule out possibilities in pencil, or write your own notes.</li><li><strong>Present a reasoned accusation.</strong> Choose a person and enough evidence to leave no alternative. You can revise your theory as often as you like.</li></ol>
        <p>No clock, no score penalty, and no villains required. Every person and event in this casebook is fictional.</p>
      </details>

      <p class="td-live" data-live role="status" aria-live="polite" aria-atomic="true">Your desk is ready. Choose a case, or begin with the cake.</p>
      <div data-case-view></div>
      <footer class="td-footer"><span>The Tiny Casework Bureau &middot; Original fiction, made for curious people.</span><span>Notes stay on this desk while you switch cases. Refreshing clears the visit. Nothing is sent anywhere.</span></footer>
    </div>`;

  const library = query<HTMLElement>(root, '.td-case-library');
  const caseView = query<HTMLElement>(root, '[data-case-view]');
  const live = query<HTMLElement>(root, '[data-live]');

  function announce(message: string) {
    live.textContent = message;
  }

  function renderLibrary() {
    library.innerHTML = CASES.map((file, index) => `
      <button class="td-case-tab ${index === activeCase ? 'is-active' : ''}" type="button"
        data-action="choose-case" data-id="${file.id}" data-focus="case-${file.id}" aria-pressed="${index === activeCase}">
        <span class="td-tab-number">File ${file.number}</span>${caseIllustration(file.illustration)}
        <span class="td-tab-title">${escapeMarkup(file.title)}</span>
        <span class="td-tab-status">${investigations[index].solved ? 'Case closed' : index === activeCase ? 'On your desk' : 'Open this file'} <span aria-hidden="true">&rarr;</span></span>
      </button>`).join('');
  }

  function renderEvidence(file: CaseFile, state: Investigation): string {
    return file.evidence.map((evidence) => {
      const expanded = state.expanded.has(evidence.id);
      return `<article class="td-exhibit ${expanded ? 'is-open' : ''} ${state.pinned.has(evidence.id) ? 'is-pinned' : ''}">
        <h4><button type="button" class="td-exhibit-toggle" data-action="evidence" data-id="${evidence.id}" data-focus="exhibit-${evidence.id}" aria-expanded="${expanded}" aria-controls="td-evidence-${evidence.id}">
          ${exhibitIcon(evidence.kind)}<span><span class="td-exhibit-label">Exhibit ${evidence.letter} <span>${state.inspected.has(evidence.id) ? 'Read' : 'Unread'}</span></span><span class="td-exhibit-title">${escapeMarkup(evidence.title)}</span><span class="td-exhibit-teaser">${escapeMarkup(evidence.teaser)}</span></span><span class="td-open-mark" aria-hidden="true">${expanded ? '&minus;' : '+'}</span>
        </button></h4>
        <div class="td-exhibit-detail" id="td-evidence-${evidence.id}" ${expanded ? '' : 'hidden'}>
          ${evidence.paragraphs.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}
          <label class="td-pin-control"><input type="checkbox" data-pin="${evidence.id}" data-focus="pin-${evidence.id}" ${state.pinned.has(evidence.id) ? 'checked' : ''} ${state.solved ? 'disabled' : ''}><span>Pin exhibit ${evidence.letter} to my reasoning</span></label>
        </div>
      </article>`;
    }).join('');
  }

  function renderPeople(file: CaseFile, state: Investigation): string {
    return file.people.map((person) => {
      const eliminated = state.eliminated.has(person.id);
      const chosen = state.personId === person.id;
      return `<article class="td-person ${eliminated ? 'is-eliminated' : ''} ${chosen ? 'is-chosen' : ''}" data-person="${person.id}" data-ruled-out="${eliminated}">
        <div class="td-person-heading">${portrait(person)}<div><h4>${escapeMarkup(person.name)}</h4><p>${escapeMarkup(person.role)}</p>${eliminated ? '<span class="td-pencil-tag">Ruled out in pencil</span>' : ''}</div></div>
        <blockquote>${escapeMarkup(person.statement)}</blockquote>
        <dl>${file.columns.map((column) => `<div><dt>${escapeMarkup(column.label)}</dt><dd>${escapeMarkup(person.facts[column.key])}</dd></div>`).join('')}</dl>
        <div class="td-person-actions"><label class="td-nominate"><input type="radio" name="td-person" value="${person.id}" data-nominee data-focus="nominee-${person.id}" ${chosen ? 'checked' : ''} ${eliminated || state.solved ? 'disabled' : ''}><span>Choose ${escapeMarkup(person.name.split(' ')[0])}</span></label>
          <button type="button" class="td-pencil-button" data-action="eliminate" data-id="${person.id}" data-focus="eliminate-${person.id}" aria-pressed="${eliminated}" aria-label="${eliminated ? 'Restore' : 'Rule out'} ${escapeMarkup(person.name)}" ${state.solved ? 'disabled' : ''}>${eliminated ? 'Restore' : 'Rule out'}</button></div>
      </article>`;
    }).join('');
  }

  function renderVerdict(file: CaseFile, state: Investigation): string {
    const result = state.result;
    if (!result) return '';
    const resolvedOrder = result.kind === 'solved' && file.logic.kind === 'order'
      ? possibleHypotheses(file)[0].order : [];
    return `<section class="td-verdict ${result.kind === 'solved' ? 'is-solved' : ''}" tabindex="-1" data-focus="verdict" aria-labelledby="td-verdict-title">
      <span class="td-section-label">${result.kind === 'solved' ? 'Filed under: solved' : 'Keep the file open'}</span>
      <h3 id="td-verdict-title">${escapeMarkup(result.headline)}</h3><p>${escapeMarkup(result.message)}</p>
      ${result.evidenceIds.filter(() => result.kind === 'contradiction').map((id) => {
        const evidence = file.evidence.find((item) => item.id === id);
        return evidence ? `<p class="td-conflict"><strong>Exhibit ${evidence.letter}:</strong> ${escapeMarkup(evidence.deduction)}</p>` : '';
      }).join('')}
      ${result.kind === 'solved' ? `
        <h4>${escapeMarkup(file.solution.headline)}</h4>
        ${resolvedOrder.length && file.logic.kind === 'order' ? `<ol class="td-resolved-order">${resolvedOrder.map((personId, index) => {
          const name = file.people.find((person) => person.id === personId)?.name;
          return `<li><span>${file.logic.kind === 'order' ? file.logic.slots[index] : ''}</span><strong>${escapeMarkup(name ?? personId)}</strong></li>`;
        }).join('')}</ol>` : ''}
        ${file.solution.explanation.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}
        <div class="td-recovery"><strong>Found, safe and sound</strong><p>${escapeMarkup(file.solution.recovery)}</p></div>
        <button class="td-primary" type="button" data-action="next" data-focus="next">${activeCase === CASES.length - 1 ? 'Back to the first case' : 'Open the next case'} <span aria-hidden="true">&rarr;</span></button>
      ` : '<p class="td-small">Change your choice or pinned exhibits, then present your case again. Your notes and evidence stay on the desk.</p>'}
    </section>`;
  }

  function renderNotebook(file: CaseFile, state: Investigation): string {
    const logic = file.logic;
    return `<aside class="td-sidebar" aria-label="Case timeline and notebook">
      <section class="td-chronology"><span class="td-section-label">The confirmed timeline</span><h3>What we know so far</h3>
        <ol>${file.timeline.map((entry) => `<li><time>${escapeMarkup(entry.time)}</time><p>${escapeMarkup(entry.event)}</p></li>`).join('')}</ol>
      </section>
      <section class="td-notebook"><div class="td-notebook-heading"><span class="td-section-label">Your notebook</span><span aria-hidden="true">&#9998;</span></div>
        <h3>Think on paper.</h3>
        <p>${state.eliminated.size} of ${file.people.length} people ruled out in pencil. These are your deductions, not confirmed alibis.</p>
        ${logic.kind === 'order' ? `<div class="td-timeline-notes"><h4>Reconstruct the visits</h4><p class="td-small">Optional pencil notes. Each person appears once; choosing them again moves that note.</p>
          ${logic.slots.map((slot, index) => `<label class="td-slot"><span>${slot}${index === logic.affectedSlot ? '<small>Label carried out</small>' : ''}</span><select data-timeline-slot="${index}" data-focus="slot-${index}" aria-label="Visitor at ${slot}">
            <option value="">Not decided</option>${file.people.map((person) => `<option value="${person.id}" ${state.timelineNotes[index] === person.id ? 'selected' : ''}>${escapeMarkup(person.name)}</option>`).join('')}</select></label>`).join('')}
        </div>` : ''}
        <label class="td-notes-label" for="td-notes">My working theory</label>
        <textarea id="td-notes" data-notes data-focus="notes" rows="6" maxlength="4000" placeholder="Which clue rules someone out? What still needs to fit?">${escapeMarkup(state.notes)}</textarea>
        <p class="td-small">Private, visit-only notes. They never change the evidence or decide your result.</p>
      </section>
      <details class="td-nudge"><summary>A nudge, not the answer <span aria-hidden="true">+</span></summary><p>${escapeMarkup(file.nudge)}</p></details>
    </aside>`;
  }

  function renderCase(focusKey?: string, scroll = false) {
    const file = CASES[activeCase];
    const state = investigations[activeCase];
    const pinned = file.evidence.filter((evidence) => state.pinned.has(evidence.id));
    caseView.innerHTML = `<article class="td-case" aria-labelledby="td-case-title">
      <header class="td-case-heading">
        <div><p class="td-eyebrow">Case ${file.number} <span aria-hidden="true">/</span> ${escapeMarkup(file.location)}</p>
          <h2 id="td-case-title" tabindex="-1" data-focus="case-title">${escapeMarkup(file.title)}</h2>
          <p class="td-case-summary">${escapeMarkup(file.summary)}</p>
          <div class="td-case-meta"><span>${escapeMarkup(file.difficulty)}</span><span>${state.solved ? 'Case closed' : `${state.inspected.size} / ${file.evidence.length} exhibits read`}</span></div>
        </div>
        <div class="td-illustration-card">${caseIllustration(file.illustration)}<span>Evidence, not guesswork.</span></div>
      </header>
      <section class="td-briefing" aria-label="The scene"><span class="td-section-label">The scene</span><div>${file.briefing.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}</div>
        <details><summary>The rules of this case</summary><p>${escapeMarkup(file.groundRules)}</p></details>
      </section>
      <div class="td-investigation-layout">
        <div class="td-main-column">
          <section class="td-exhibits" data-project-preview aria-labelledby="td-exhibits-title"><div class="td-section-heading"><div><span class="td-section-label">01 / Inspect the evidence</span><h3 id="td-exhibits-title">A few telling details.</h3></div><span class="td-count">${state.inspected.size}/${file.evidence.length} read</span></div>
            <p>Open each exhibit. Pin the ones that help identify a person; some details only explain the story.</p>
            <div class="td-evidence-grid">${renderEvidence(file, state)}</div>
          </section>
          <form class="td-conclusion-form" data-conclusion>
            <fieldset class="td-people"><legend><span class="td-section-label">02 / Compare the people</span><span>${escapeMarkup(file.question)}</span></legend>
              <p>Read the records, choose your current theory, or rule someone out in pencil. A ruled-out person can always be restored.</p>
              <div class="td-people-grid">${renderPeople(file, state)}</div>
            </fieldset>
            <section class="td-conclusion" aria-labelledby="td-conclusion-title"><span class="td-section-label">03 / Connect the clues</span><h3 id="td-conclusion-title">Present your case.</h3>
              <p>Choose a person and pin enough identifying exhibits to leave only one possible answer. Pencil eliminations are not evidence.</p>
              <div class="td-pinned-list" aria-label="Evidence in your reasoning">${pinned.length ? pinned.map((evidence) => `<span><strong>${evidence.letter}</strong> ${escapeMarkup(evidence.title)}</span>`).join('') : '<p>No exhibits pinned yet. Open one above to add it.</p>'}</div>
              <div class="td-submit-row"><button class="td-primary" type="submit" ${state.solved ? 'disabled' : ''}>${state.solved ? 'Case closed' : 'File my conclusion'} <span aria-hidden="true">${state.solved ? '&#10003;' : '&rarr;'}</span></button><span class="td-small">${state.theories ? `${state.theories} ${state.theories === 1 ? 'theory' : 'theories'} presented. ` : ''}No penalty for thinking again.</span></div>
            </section>
          </form>
          ${renderVerdict(file, state)}
        </div>
        ${renderNotebook(file, state)}
      </div>
      <footer class="td-case-footer"><div><strong>${investigations.filter((item) => item.solved).length} / ${CASES.length} cases closed this visit</strong><span>Every file is available from the start.</span></div>
        <div class="td-footer-actions"><button type="button" class="td-secondary" data-action="case-desk">Choose another case</button><button type="button" class="td-text-button" data-action="restart" data-focus="restart">Restart this case</button></div>
      </footer>
      ${state.confirmRestart ? `<section class="td-restart-confirm" aria-labelledby="td-restart-title"><h3 id="td-restart-title">A fresh sheet for this case?</h3><p>This clears this case's notes, evidence pins, eliminations, and conclusion. Your other case files stay as they are.</p><div><button type="button" class="td-primary" data-action="confirm-restart" data-focus="confirm-restart">Yes, restart this case</button><button type="button" class="td-secondary" data-action="cancel-restart">Keep investigating</button></div></section>` : ''}
    </article>`;
    if (focusKey) {
      root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: !scroll });
    }
  }

  function chooseCase(index: number) {
    if (!CASES[index]) throw new Error(`Unknown case index: ${index}`);
    activeCase = index;
    renderLibrary();
    renderCase('case-title', true);
    announce(`Case ${CASES[index].number}: ${CASES[index].title}. Your other case files stay on the desk.`);
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    const file = CASES[activeCase];
    const state = investigations[activeCase];
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'choose-case') {
      chooseCase(CASES.findIndex((item) => item.id === id));
    } else if (action === 'evidence') {
      const evidence = file.evidence.find((item) => item.id === id);
      if (!evidence) throw new Error('The selected exhibit is not in this case.');
      if (state.expanded.has(evidence.id)) state.expanded.delete(evidence.id);
      else {
        state.expanded.add(evidence.id);
        state.inspected.add(evidence.id);
      }
      renderCase(`exhibit-${evidence.id}`);
    } else if (action === 'eliminate') {
      const person = file.people.find((item) => item.id === id);
      if (!person) throw new Error('The selected person is not in this case.');
      const restoring = state.eliminated.has(person.id);
      if (restoring) state.eliminated.delete(person.id);
      else {
        state.eliminated.add(person.id);
        if (state.personId === person.id) state.personId = null;
      }
      state.result = null;
      renderCase(`eliminate-${person.id}`);
      announce(`${person.name} ${restoring ? 'is back among your possibilities' : 'is ruled out in your pencil notes'}. This is your deduction, not a confirmed alibi.`);
    } else if (action === 'restart') {
      state.confirmRestart = true;
      renderCase('confirm-restart', true);
    } else if (action === 'cancel-restart') {
      state.confirmRestart = false;
      renderCase('restart');
    } else if (action === 'confirm-restart') {
      investigations[activeCase] = newInvestigation(file);
      renderLibrary();
      renderCase('case-title', true);
      announce(`${file.title} has a fresh sheet. The other case files are unchanged.`);
    } else if (action === 'next') {
      chooseCase((activeCase + 1) % CASES.length);
    } else if (action === 'case-desk') {
      query<HTMLButtonElement>(library, `[data-id="${file.id}"]`).focus();
      library.scrollIntoView({ block: 'start' });
    }
  }, { signal });

  root.addEventListener('change', (event) => {
    const input = event.target;
    const file = CASES[activeCase];
    const state = investigations[activeCase];
    if (input instanceof HTMLInputElement && input.hasAttribute('data-pin')) {
      const evidence = file.evidence.find((item) => item.id === input.dataset.pin);
      if (!evidence || !state.inspected.has(evidence.id)) throw new Error('Read an exhibit before pinning it.');
      if (input.checked) state.pinned.add(evidence.id);
      else state.pinned.delete(evidence.id);
      state.result = null;
      renderCase(`pin-${evidence.id}`);
      announce(`${state.pinned.size} ${state.pinned.size === 1 ? 'exhibit is' : 'exhibits are'} pinned to your reasoning.`);
    } else if (input instanceof HTMLInputElement && input.hasAttribute('data-nominee')) {
      const person = file.people.find((item) => item.id === input.value);
      if (!person || state.eliminated.has(person.id)) throw new Error('Restore this person before choosing them.');
      state.personId = person.id;
      state.result = null;
      renderCase(`nominee-${person.id}`);
    } else if (input instanceof HTMLSelectElement && input.hasAttribute('data-timeline-slot')) {
      const slot = Number(input.dataset.timelineSlot);
      const moved = input.value !== '' && state.timelineNotes.some((value, index) => value === input.value && index !== slot);
      state.timelineNotes = setTimelineNote(state.timelineNotes, slot, input.value, file);
      renderCase(`slot-${slot}`);
      announce(moved ? 'That visitor moved to this slot; their earlier pencil note was cleared.' : 'Your pencil timeline is updated. It does not change the official evidence.');
    }
  }, { signal });

  root.addEventListener('input', (event) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.hasAttribute('data-notes')) {
      investigations[activeCase].notes = event.target.value;
    }
  }, { signal });

  root.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-conclusion')) return;
    event.preventDefault();
    const state = investigations[activeCase];
    if (state.solved) {
      announce('This case is closed. Restart the case to make a fresh investigation.');
      return;
    }
    state.result = assessConclusion(CASES[activeCase], state.personId, [...state.pinned]);
    if (state.personId && state.pinned.size) state.theories += 1;
    state.solved = state.result.kind === 'solved';
    renderLibrary();
    renderCase('verdict', true);
    announce(state.result.headline);
  }, { signal });

  renderLibrary();
  renderCase();
  return { destroy: page.destroy };
}
