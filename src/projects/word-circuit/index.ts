import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DICTIONARY, PUZZLES, WORDS } from './data';
import {
  backtrack, buildGraph, changedLetterIndex, createGame, currentWord, findShortestPath,
  isSolved, legalNextWords, moveCount, playMove, remainingPath, requestHint, resetGame,
} from './engine';

const graph = buildGraph(WORDS);
const routes = PUZZLES.map((puzzle) => {
  const path = findShortestPath(graph, puzzle.start, puzzle.goal);
  if (!path) throw new Error(`Word Circuit puzzle "${puzzle.id}" has no solution.`);
  return { ...puzzle, minimum: path.length - 1 };
});
const pad = (value: number) => String(value).padStart(2, '0');
const movesLabel = (value: number) => `${value} ${value === 1 ? 'move' : 'moves'}`;
const hintsLabel = (value: number) => `${value} next-word ${value === 1 ? 'hint' : 'hints'}`;
const difficulty = (minimum: number) => minimum <= 4 ? 'Short circuit' : minimum <= 6 ? 'A few turns' : 'Long connection';

const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const rewindIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5-5 5 5 5M4 10h10a5 5 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const sparkIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 3-8 11h6l-1 7 9-12h-6l1-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

function tileMarkup(word: string, goal: string): string {
  return [...word].map((letter, index) => `<span class="wc-tile${letter === goal[index] ? ' is-matched' : ''}" aria-hidden="true">${letter}</span>`).join('');
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'word-circuit');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let selectedIndex = 0;
  let state = createGame(routes[selectedIndex]);

  root.innerHTML = `
    <div class="wc-shell">
      <header class="wc-header">
        <div class="wc-title-group">
          <p class="wc-eyebrow">
            <svg class="wc-brand-mark" viewBox="0 0 44 30" fill="none" aria-hidden="true">
              <path d="M6 6h15v18h17M6 24h7V6h25" stroke="currentColor" stroke-width="2"/>
              <circle cx="6" cy="6" r="4"/><circle cx="6" cy="24" r="4"/><circle cx="38" cy="6" r="4"/><circle cx="38" cy="24" r="4"/>
            </svg>
            A small laboratory for language <span class="wc-edition">/ 021</span>
          </p>
          <h1>Word Circuit<span class="wc-title-dot" aria-hidden="true">.</span></h1>
          <p class="wc-intro">Four letters. One change at a time. Find the words that make the connection.</p>
        </div>
        <nav class="wc-nav" aria-label="Word Circuit sections">
          <button type="button" data-open-routes>Choose a route ${arrow}</button>
          <button type="button" data-open-guide>How to play <span aria-hidden="true">?</span></button>
          <button type="button" data-action="dictionary">Browse dictionary <span aria-hidden="true">A–Z</span></button>
          <button type="button" data-action="log" class="wc-log-toggle">Route log</button>
        </nav>
      </header>

      <div class="wc-workbench" data-project-preview>
        <section class="wc-console" aria-labelledby="wc-puzzle-name">
          <div class="wc-panel-heading">
            <div>
              <p class="wc-eyebrow"><span data-route-number>Connection 01 / 08</span></p>
              <h2 id="wc-puzzle-name" data-puzzle-name></h2>
              <p class="wc-description" data-puzzle-description></p>
            </div>
            <span class="wc-paper-tag">One letter<br>per move</span>
          </div>

          <figure class="wc-circuit">
            <div class="wc-circuit-topline">
              <span class="wc-live-label"><i aria-hidden="true"></i><span data-circuit-state>Circuit open</span></span>
              <span data-matched>0 / 4 in place</span>
            </div>
            <div class="wc-schematic">
              <div class="wc-terminal-label"><span>Current</span><strong data-current-step>Move 00</strong></div>
              <div class="wc-tiles wc-current-tiles" data-current-tiles role="img" aria-label="Current word: COLD"></div>
              <span aria-hidden="true"></span>
              <svg class="wc-wires" viewBox="0 0 480 80" preserveAspectRatio="none" aria-hidden="true">
                <g data-wire="0"><path d="M60 0v18h60v44H60v18"/><circle cx="60" cy="3" r="3"/><circle cx="60" cy="77" r="3"/></g>
                <g data-wire="1"><path d="M180 0v80"/><circle cx="180" cy="3" r="3"/><circle cx="180" cy="77" r="3"/></g>
                <g data-wire="2"><path d="M300 0v80"/><circle cx="300" cy="3" r="3"/><circle cx="300" cy="77" r="3"/></g>
                <g data-wire="3"><path d="M420 0v18h-60v44h60v18"/><circle cx="420" cy="3" r="3"/><circle cx="420" cy="77" r="3"/></g>
              </svg>
              <div class="wc-terminal-label"><span>Destination</span><strong>Make contact</strong></div>
              <div class="wc-tiles wc-goal-tiles" data-goal-tiles role="img" aria-label="Destination: WARM"></div>
            </div>
            <figcaption><span class="wc-wire-key" aria-hidden="true"></span>Lit wire = a letter in its destination position.</figcaption>
          </figure>

          <dl class="wc-counters" aria-label="Current attempt">
            <div><dt>Your moves</dt><dd data-moves>00</dd></div>
            <div><dt>Shortest route</dt><dd><span data-minimum>04</span><small>moves</small></dd></div>
            <div><dt>Hints shown</dt><dd data-hints>00</dd></div>
          </dl>

          <section class="wc-completion" data-completion hidden aria-labelledby="wc-complete-title">
            <div class="wc-completion-heading">
              <span class="wc-completion-icon" aria-hidden="true">✓</span>
              <div><p class="wc-eyebrow">Destination reached</p><h3 id="wc-complete-title" tabindex="-1">Connection complete.</h3></div>
            </div>
            <p data-complete-summary></p>
            <p class="wc-comparison" data-comparison></p>
            <p class="wc-small" data-complete-hints></p>
            <p class="wc-small">Your completed route is in the log. Try another connection, or reset to find a different way.</p>
          </section>

          <form class="wc-move-form" data-move-form novalidate>
            <div class="wc-entry-label">
              <label for="wc-next-word">Next word</label>
              <span>4 letters · 1 change</span>
            </div>
            <div class="wc-entry-row">
              <input id="wc-next-word" name="word" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="4 letters" aria-describedby="wc-word-help wc-feedback">
              <button class="wc-connect-button" type="submit">Connect word ${arrow}</button>
            </div>
            <p id="wc-word-help" class="wc-small" data-word-help></p>
          </form>
          <p id="wc-feedback" class="wc-feedback" data-feedback role="status" aria-live="polite" aria-atomic="true"></p>

          <div class="wc-hint-area" data-hint-area>
            <button type="button" class="wc-hint-button" data-action="hint">${sparkIcon}Show a next-word hint</button>
            <span class="wc-small">A clue, not an automatic move.</span>
            <p class="wc-hint-reveal" data-hint-reveal hidden></p>
          </div>
          <div class="wc-utility-row" aria-label="Route controls">
            <button type="button" data-action="backtrack">${rewindIcon}Backtrack</button>
            <button type="button" data-action="reset">Reset route</button>
            <button type="button" data-action="next">Next puzzle ${arrow}</button>
          </div>
        </section>

        <aside class="wc-route-panel" aria-labelledby="wc-log-heading">
          <div class="wc-log-heading">
            <p class="wc-eyebrow">The route log</p>
            <h2 id="wc-log-heading">Every word<br>is a way through.</h2>
            <p class="wc-log-instruction">Select an earlier stop to rewind. Removed words become available again.</p>
          </div>
          <div class="wc-route-scroll" data-route-scroll>
            <ol class="wc-route-log" data-route-log aria-label="Your word ladder"></ol>
          </div>
          <div class="wc-route-bottom">
            <p class="wc-eyebrow">Connection check</p>
            <p class="wc-route-health" data-route-health></p>
            <button type="button" class="wc-neighbour-button" data-action="neighbours">Browse valid next words <span data-neighbour-count></span>${arrow}</button>
            <p class="wc-small">Detours are welcome. There’s no timer, and backtracking is always allowed.</p>
          </div>
        </aside>
      </div>

      <section id="word-circuit-routes" class="wc-routes-section" aria-labelledby="wc-routes-heading">
        <div class="wc-section-heading">
          <div><p class="wc-eyebrow">The connection library</p><h2 id="wc-routes-heading">Choose a different current.</h2></div>
          <p>Eight hand-picked pairs. Every minimum is calculated from the dictionary below. Switching routes starts a fresh attempt.</p>
        </div>
        <div class="wc-route-grid">
          ${routes.map((route, index) => `
            <button type="button" class="wc-route-card" data-puzzle-id="${route.id}" aria-pressed="${index === 0}">
              <span class="wc-card-top"><span>${pad(index + 1)} / ${difficulty(route.minimum)}</span><span class="wc-card-dot" aria-hidden="true"></span></span>
              <strong class="wc-card-words">${route.start}<span aria-hidden="true">→</span>${route.goal}</strong>
              <span class="wc-card-title">${escapeMarkup(route.title)}</span>
              <span class="wc-card-description">${escapeMarkup(route.description)}</span>
              <span class="wc-card-bottom"><strong>${movesLabel(route.minimum)} minimum</strong><span data-card-state>${index === 0 ? 'Selected' : 'Start route'}</span></span>
            </button>
          `).join('')}
        </div>
      </section>

      <section id="word-circuit-guide" class="wc-guide" aria-labelledby="wc-guide-heading">
        <div class="wc-guide-title"><p class="wc-eyebrow">A little field guide</p><h2 id="wc-guide-heading">Small changes.<br>Real connections.</h2><span class="wc-guide-example" aria-label="Example: MINT to MIND">MIN<span>T</span> <i aria-hidden="true">→</i> MIN<span>D</span></span></div>
        <div class="wc-guide-rules">
          <article><span class="wc-rule-number">01</span><div><h3>Keep three letters in place.</h3><p>Start with the current word. Change exactly one letter, then press Enter or Connect word. No adding, removing, or rearranging letters.</p></div></article>
          <article><span class="wc-rule-number">02</span><div><h3>Stay inside this dictionary.</h3><p>Only the ${WORDS.length} listed English words count. It’s a curated collection, not every English word. Some inflected forms are included; names and abbreviations are not. Search the meanings below if a word is unfamiliar.</p></div></article>
          <article><span class="wc-rule-number">03</span><div><h3>Explore, then make contact.</h3><p>Reach the destination to finish. Lit wires are not locked: matching letters can change again. Don’t repeat a word on your current route. Backtrack removes steps, but keeps your hint count. Reset starts a new attempt with zero moves and hints.</p></div></article>
          <article><span class="wc-rule-number">04</span><div><h3>A hint follows your actual route.</h3><p>Hints use a local breadth-first search from your current word, avoiding every earlier stop. One new next-word reveal counts as one hint; showing the same hint for the same route again is free. Browsing the dictionary is not counted as a hint.</p></div></article>
        </div>
      </section>

      <section id="word-circuit-dictionary" class="wc-dictionary-section" aria-labelledby="wc-dictionary-heading">
        <div class="wc-section-heading">
          <div><p class="wc-eyebrow">No mysterious rejections</p><h2 id="wc-dictionary-heading">The allowed-word dictionary.</h2></div>
          <p>${WORDS.length} hand-selected words, with short meanings. Always open to inspection. No network, generated answers, or hidden vocabulary.</p>
        </div>
        <details class="wc-dictionary" data-dictionary>
          <summary><span>Browse all ${WORDS.length} words</span><span class="wc-dictionary-summary-note">Search · meanings · next moves</span><span class="wc-expand-icon" aria-hidden="true">+</span></summary>
          <div class="wc-dictionary-content">
            <div class="wc-dictionary-tools">
              <label class="wc-search-label" for="wc-dictionary-search">Search words or meanings<input id="wc-dictionary-search" type="search" placeholder="Try “bird” or “a tree”" autocomplete="off" spellcheck="false"></label>
              <label class="wc-next-filter"><input type="checkbox" data-next-filter>Only legal next words</label>
            </div>
            <p class="wc-dictionary-count" data-dictionary-count role="status" aria-live="polite" aria-atomic="true"></p>
            <p class="wc-small">“Use word” fills the next-word field; it never submits a move. Only available one-letter changes have this button. Browsing does not increase Hints shown.</p>
            <ul class="wc-dictionary-list" data-dictionary-list aria-label="Allowed words and meanings"></ul>
          </div>
        </details>
      </section>
      <footer class="wc-footer"><span>Four terminals. Many ways through.</span><span>Curated words · local rules · no clock</span></footer>
    </div>
  `;

  const input = query<HTMLInputElement>(root, '#wc-next-word');
  const form = query<HTMLFormElement>(root, '[data-move-form]');
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const currentTiles = query<HTMLElement>(root, '[data-current-tiles]');
  const goalTiles = query<HTMLElement>(root, '[data-goal-tiles]');
  const routeLog = query<HTMLOListElement>(root, '[data-route-log]');
  const routeScroll = query<HTMLElement>(root, '[data-route-scroll]');
  const hintReveal = query<HTMLElement>(root, '[data-hint-reveal]');
  const completion = query<HTMLElement>(root, '[data-completion]');
  const dictionary = query<HTMLDetailsElement>(root, '[data-dictionary]');
  const search = query<HTMLInputElement>(root, '#wc-dictionary-search');
  const nextFilter = query<HTMLInputElement>(root, '[data-next-filter]');
  const dictionaryList = query<HTMLUListElement>(root, '[data-dictionary-list]');
  const cards = [...root.querySelectorAll<HTMLButtonElement>('[data-puzzle-id]')];
  const guide = query<HTMLElement>(root, '.wc-guide');
  const introduction = document.createElement('div');
  introduction.className = 'wc-play-notes';
  introduction.append(query(root, '.wc-title-group > .wc-eyebrow'), query(root, '.wc-intro'),
    query(root, '.wc-paper-tag'), query(root, '.wc-description'), query(root, '.wc-circuit figcaption'),
    query(root, '[data-word-help]'), query(root, '.wc-hint-area > .wc-small'),
    ...root.querySelectorAll<HTMLElement>('.wc-terminal-label > strong'));
  const routesDialog = createWorkspaceDialog(page, {
    id: 'wc-routes-pane', title: 'Choose a route', content: [query(root, '.wc-routes-section')],
    triggers: [query(root, '[data-open-routes]')],
  });
  createWorkspaceDialog(page, {
    id: 'wc-guide-pane', title: 'How to play', content: [introduction, guide, query(root, '.wc-footer')],
    triggers: [query(root, '[data-open-guide]')],
  });
  const dictionaryDialog = createWorkspaceDialog(page, {
    id: 'wc-dictionary-pane', title: 'Browse dictionary', content: [query(root, '.wc-dictionary-section')],
  });
  const resultActions = document.createElement('div');
  resultActions.className = 'wc-result-actions';
  resultActions.innerHTML = '<button type="button" data-action="log">Review route log</button><button type="button" data-action="reset">Start again</button><button type="button" data-action="next">Try next connection</button>';
  completion.append(resultActions);
  const completionDialog = createWorkspaceDialog(page, {
    id: 'wc-completion-pane', title: 'Connection complete', content: [completion],
  });
  const hintDialog = createWorkspaceDialog(page, {
    id: 'wc-hint-pane', title: 'Next-word hint', content: [hintReveal],
  });
  const errorMessage = document.createElement('p');
  errorMessage.className = 'wc-error-detail';
  const errorDialog = createWorkspaceDialog(page, {
    id: 'wc-error-pane', title: 'Check your connection', content: [errorMessage],
  });
  const routePanel = query<HTMLElement>(root, '.wc-route-panel');
  const workbench = query<HTMLElement>(root, '.wc-workbench');
  const logDialog = createWorkspaceDialog(page, {
    id: 'wc-log-pane', title: 'Your route log', content: [routePanel],
  });
  const wideScreen = matchMedia('(min-width: 1121px)');
  function placeLog() {
    const focused = routePanel.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    if (wideScreen.matches) {
      logDialog.close();
      workbench.append(routePanel);
    } else {
      query(logDialog.dialog, '.workspace-dialog-content').append(routePanel);
      if (focused) logDialog.open();
    }
    focused?.focus({ preventScroll: true });
  }
  wideScreen.addEventListener('change', placeLog, { signal });
  placeLog();

  function text(selector: string, value: string) {
    query<HTMLElement>(root, selector).textContent = value;
  }

  function announce(message: string, kind: 'neutral' | 'error' | 'success' = 'neutral') {
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.scrollTop = 0;
    if (kind === 'error') {
      errorMessage.textContent = message;
      errorDialog.open();
    }
  }

  function clearHint() {
    hintReveal.hidden = true;
    hintReveal.textContent = '';
  }

  function renderDictionary() {
    const term = search.value.trim().toLocaleLowerCase('en');
    const available = new Set(legalNextWords(state, graph));
    const used = new Set(state.path);
    const entries = DICTIONARY.filter((entry) => (
      (!nextFilter.checked || available.has(entry.word))
      && (!term || entry.word.toLowerCase().includes(term) || entry.meaning.toLocaleLowerCase('en').includes(term))
    ));
    const scope = nextFilter.checked ? `legal next ${entries.length === 1 ? 'word' : 'words'} from ${currentWord(state)}` : `of ${WORDS.length} allowed words`;
    text('[data-dictionary-count]', `${entries.length} ${scope}${term ? ' matching your search' : ''}.`);
    dictionaryList.innerHTML = entries.length ? entries.map((entry) => `
      <li class="wc-dictionary-entry">
        <div><strong>${entry.word}</strong><p>${escapeMarkup(entry.meaning)}</p></div>
        ${available.has(entry.word)
          ? `<button type="button" data-use-word="${entry.word}" aria-label="Use ${entry.word} in the next-word field">Use word ${arrow}</button>`
          : used.has(entry.word) ? '<span class="wc-word-used">On route</span>' : ''}
      </li>
    `).join('') : `<li class="wc-dictionary-empty">${nextFilter.checked && available.size === 0
      ? isSolved(state) ? 'This circuit is complete. Choose another puzzle or backtrack to keep exploring.' : 'No unused one-letter neighbours here. Backtrack to an earlier stop.'
      : 'No matching entries. Try fewer letters, a different meaning, or turn off the next-word filter.'}</li>`;
  }

  function render(followRoute = false) {
    const route = routes[selectedIndex];
    const current = currentWord(state);
    const count = moveCount(state);
    const solved = isSolved(state);
    const remaining = remainingPath(state, graph);
    const matches = [...current].filter((letter, index) => letter === state.goal[index]).length;
    root.dataset.solved = String(solved);
    text('[data-route-number]', `Connection ${pad(selectedIndex + 1)} / ${pad(routes.length)}`);
    text('[data-puzzle-name]', route.title);
    text('[data-puzzle-description]', route.description);
    text('[data-circuit-state]', solved ? 'Circuit connected' : 'Circuit open');
    text('[data-current-step]', `Move ${pad(count)}`);
    text('[data-matched]', `${matches} / 4 in place`);
    text('[data-moves]', pad(count));
    text('[data-minimum]', pad(route.minimum));
    text('[data-hints]', pad(state.hintsUsed));
    text('[data-word-help]', `From ${current}, keep three letters in place. Press Enter to connect.`);
    currentTiles.innerHTML = tileMarkup(current, state.goal);
    currentTiles.setAttribute('aria-label', `Current word: ${current}`);
    goalTiles.innerHTML = tileMarkup(state.goal, current);
    goalTiles.setAttribute('aria-label', `Destination: ${state.goal}`);
    root.querySelectorAll<SVGGElement>('[data-wire]').forEach((wire) => {
      const index = Number(wire.dataset.wire);
      wire.classList.toggle('is-matched', current[index] === state.goal[index]);
    });

    routeLog.innerHTML = state.path.map((word, index) => {
      const active = index === count;
      const change = index > 0 ? changedLetterIndex(state.path[index - 1], word) : null;
      const detail = index === 0 ? 'Source word' : `Letter ${change! + 1}: ${state.path[index - 1][change!]} → ${word[change!]}`;
      const content = `<span class="wc-stop-number">${pad(index)}</span><span class="wc-stop-copy"><strong class="wc-stop-word">${[...word].map((letter, letterIndex) => `<span${letterIndex === change ? ' class="wc-changed-letter"' : ''}>${letter}</span>`).join('')}</strong><span class="wc-stop-detail">${detail}</span></span>${active ? `<span class="wc-stop-current">${solved ? 'Arrived' : 'You are here'}</span>` : '<span class="wc-stop-rewind" aria-hidden="true">↶</span>'}`;
      return `<li class="wc-stop${active ? ' is-current' : ''}">${active
        ? `<div class="wc-stop-body" aria-current="step">${content}</div>`
        : `<button type="button" class="wc-stop-body" data-backtrack="${index}" aria-label="Backtrack to ${word}, move ${index}">${content}</button>`}</li>`;
    }).join('');
    if (followRoute) routeScroll.scrollTop = routeScroll.scrollHeight;
    query<HTMLButtonElement>(root, '[data-action="backtrack"]').disabled = count === 0;
    query<HTMLButtonElement>(root, '[data-action="hint"]').disabled = solved;
    form.hidden = solved;
    query<HTMLElement>(root, '[data-hint-area]').hidden = solved;
    completion.hidden = !solved;
    if (solved) {
      text('[data-complete-summary]', `${state.start} → ${state.goal}, connected in ${movesLabel(count)}.`);
      text('[data-comparison]', count === route.minimum
        ? 'You found a shortest possible route.'
        : `${movesLabel(count - route.minimum)} longer than the ${route.minimum}-move minimum. A detour still makes a connection.`);
      text('[data-complete-hints]', `${hintsLabel(state.hintsUsed)} shown in this attempt.`);
    }
    const health = query<HTMLElement>(root, '[data-route-health]');
    health.dataset.blocked = String(remaining === null);
    health.textContent = solved ? `All the way to ${state.goal}. Nicely connected.`
      : remaining ? `From ${current}: ${movesLabel(remaining.length - 1)} minimum to reach ${state.goal} without repeating a word.`
        : 'This detour is boxed in. Select an earlier stop or Backtrack to reopen a way to the destination.';
    text('[data-neighbour-count]', String(legalNextWords(state, graph).length));
    for (const card of cards) {
      const selected = card.dataset.puzzleId === state.puzzleId;
      card.setAttribute('aria-pressed', String(selected));
      query<HTMLElement>(card, '[data-card-state]').textContent = selected ? solved ? 'Connected ✓' : 'Selected' : 'Start route';
    }
    renderDictionary();
  }

  function focusEntry() {
    dictionaryDialog.close();
    routesDialog.close();
    logDialog.close();
    completionDialog.close();
    if (isSolved(state)) query<HTMLElement>(root, '[data-action="reset"]').focus({ preventScroll: true });
    else input.focus({ preventScroll: true });
  }

  function openDictionary(onlyNext: boolean) {
    nextFilter.checked = onlyNext;
    search.value = '';
    dictionary.open = true;
    renderDictionary();
    logDialog.close();
    dictionaryDialog.open();
    search.focus({ preventScroll: true });
  }

  function choosePuzzle(index: number) {
    if (index === selectedIndex) {
      focusEntry();
      announce('This route is already selected. Reset route to start it again.');
      return;
    }
    selectedIndex = index;
    state = createGame(routes[selectedIndex]);
    input.value = '';
    input.removeAttribute('aria-invalid');
    clearHint();
    render(true);
    focusEntry();
    announce(`${routes[index].title}. Start at ${state.start} and make your way to ${state.goal}.`);
  }

  function rewind(toIndex?: number) {
    state = backtrack(state, toIndex);
    input.value = '';
    input.removeAttribute('aria-invalid');
    clearHint();
    render(true);
    focusEntry();
    announce(`Back at ${currentWord(state)}. ${movesLabel(moveCount(state))} on this route; shown hints are kept.`);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const before = currentWord(state);
    const result = playMove(state, input.value, graph);
    if (!result.validation.ok) {
      input.setAttribute('aria-invalid', 'true');
      announce(result.validation.message, 'error');
      input.select();
      return;
    }
    state = result.state;
    input.value = '';
    input.removeAttribute('aria-invalid');
    clearHint();
    render(true);
    if (isSolved(state)) {
      announce(`Circuit connected! ${state.start} to ${state.goal} in ${movesLabel(moveCount(state))}, with ${hintsLabel(state.hintsUsed)} shown.`, 'success');
      completionDialog.open();
      query<HTMLElement>(root, '#wc-complete-title').focus({ preventScroll: true });
    } else {
      const slot = result.validation.changedIndex;
      announce(`${currentWord(state)} connected. Letter ${slot + 1}: ${before[slot]} → ${currentWord(state)[slot]}.`, 'success');
      input.focus({ preventScroll: true });
    }
  }, { signal });

  input.addEventListener('input', () => input.removeAttribute('aria-invalid'), { signal });
  search.addEventListener('input', renderDictionary, { signal });
  nextFilter.addEventListener('change', renderDictionary, { signal });
  dictionary.addEventListener('toggle', () => {
    if (dictionary.open) renderDictionary();
  }, { signal });

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action], button[data-puzzle-id], button[data-backtrack], button[data-use-word]') : null;
    if (!target || !root.contains(target) || target.disabled) return;
    if (target.dataset.puzzleId) {
      const index = routes.findIndex((route) => route.id === target.dataset.puzzleId);
      if (index >= 0) choosePuzzle(index);
      return;
    }
    if (target.dataset.backtrack !== undefined) {
      rewind(Number(target.dataset.backtrack));
      return;
    }
    if (target.dataset.useWord) {
      input.value = target.dataset.useWord;
      input.removeAttribute('aria-invalid');
      focusEntry();
      input.select();
      announce(`${input.value} is in the next-word field. Press Enter or Connect word to use it.`);
      return;
    }
    switch (target.dataset.action) {
      case 'log':
        completionDialog.close();
        if (wideScreen.matches) {
          routePanel.tabIndex = -1;
          routePanel.focus({ preventScroll: true });
        } else logDialog.open();
        break;
      case 'dictionary': openDictionary(false); break;
      case 'neighbours': openDictionary(true); break;
      case 'backtrack': rewind(); break;
      case 'reset':
        state = resetGame(state);
        input.value = '';
        input.removeAttribute('aria-invalid');
        clearHint();
        render(true);
        focusEntry();
        announce(`Fresh route: ${state.start} → ${state.goal}. Moves and hints are back to zero.`);
        break;
      case 'next': choosePuzzle((selectedIndex + 1) % routes.length); break;
      case 'hint': {
        const hint = requestHint(state, graph);
        if (hint.status === 'solved') {
          announce('This circuit is already complete. Try the next puzzle.');
        } else if (hint.status === 'stuck') {
          const message = 'No hint available without reusing an earlier word. Backtrack to reopen a route. No hint was counted.';
          hintReveal.hidden = false;
          hintReveal.textContent = message;
          announce(message, 'error');
        } else {
          state = hint.state;
          render();
          const slot = hint.changedIndex;
          const explanation = `Try ${hint.word}: change letter ${slot + 1} from ${currentWord(state)[slot]} to ${hint.word[slot]}. ${movesLabel(hint.remainingMoves)} ${hint.remainingMoves === 1 ? 'remains' : 'remain'} from ${currentWord(state)}, including this move.`;
          hintReveal.hidden = false;
          hintReveal.textContent = explanation;
          announce(`${explanation} ${hint.alreadyRevealed ? 'This hint was already counted.' : 'One next-word hint counted.'}`);
          hintDialog.open();
        }
        break;
      }
    }
  }, { signal });

  render();
  announce(`Start at ${state.start}. Change one letter to connect your next word.`);
  return { destroy: page.destroy };
}
