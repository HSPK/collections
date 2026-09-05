import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { puzzles } from './data';
import type { ClubPuzzle } from './data';
import { checkPuzzle, createState, isComplete, paintCell, summarize, takeHint } from './engine';
import type { GameState, Mistake, PaintTool } from './engine';

interface PuzzleSession {
  game: GameState;
  focus: number;
  errors: Map<number, Mistake['kind']>;
  hint: number | null;
  message: string;
  tone: 'neutral' | 'good' | 'warning' | 'hint';
}

const arrow = '<svg class="nc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="square"/></svg>';
const check = '<svg class="nc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.8"/></svg>';
const sparkle = '<svg class="nc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" stroke="currentColor" stroke-width="1.6"/></svg>';
const resetIcon = '<svg class="nc-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9a8 8 0 1 1 .8 8M4 3v6h6" stroke="currentColor" stroke-width="1.6"/></svg>';

function pictureMarkup(puzzle: ClubPuzzle): string {
  const squares = puzzle.solution.flatMap((row, y) =>
    row.flatMap((filled, x) => filled ? [`<rect x="${x}" y="${y}" width="1" height="1"/>`] : [])).join('');
  return `<svg viewBox="-1 -1 ${puzzle.width + 2} ${puzzle.height + 2}" role="img" aria-label="${escapeMarkup(puzzle.title)}" shape-rendering="crispEdges"><g fill="currentColor">${squares}</g></svg>`;
}

const demoLine = (cells: readonly number[], label: string) => `<div class="nc-demo-line" role="img" aria-label="${label}">${cells.map((cell) => `<span class="${cell ? 'nc-demo-ink' : ''}"></span>`).join('')}</div>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'nonogram');
  const { root, signal } = page;
  const sessions = new Map<string, PuzzleSession>(puzzles.map((puzzle) => [puzzle.id, {
    game: createState(puzzle),
    focus: 0,
    errors: new Map(),
    hint: null,
    message: 'A fresh sheet. Start with a long run, or ask for one little hint.',
    tone: 'neutral',
  }]));
  const collected = new Set<string>();
  let selected = 0;
  let tool: 'fill' | 'cross' = 'fill';
  let cells: HTMLButtonElement[] = [];
  let rowHeaders: HTMLTableCellElement[] = [];
  let columnHeaders: HTMLTableCellElement[] = [];
  const currentPuzzle = () => puzzles[selected];
  const currentSession = () => sessions.get(currentPuzzle().id)!;

  root.innerHTML = `
    <div class="nc-shell">
      <header class="nc-masthead">
        <div class="nc-wordmark">
          <svg class="nc-mark" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M0 0h9v9H0zm11 0h9v9h-9zm12 0h9v9h-9zM0 11h9v9H0zm23 0h9v9h-9zM0 23h9v9H0zm11 0h9v9h-9zm12 0h9v9h-9z"/></svg>
          <span>SMALL PUZZLES.<br>GOOD COMPANY.</span>
        </div>
        <p class="nc-edition">THE LITTLE THINGS <span>VOL. 01</span></p>
        <a class="nc-handbook-link" href="#nonogram-handbook">How to play <span aria-hidden="true">↗</span></a>
      </header>

      <section class="nc-hero" aria-labelledby="nonogram-heading">
        <div class="nc-hero-copy">
          <p class="nc-eyebrow"><span class="nc-tiny-square" aria-hidden="true"></span> A QUIET PLACE TO FIGURE THINGS OUT</p>
          <h1 id="nonogram-heading">Nonogram <em>Club.</em></h1>
          <p>Four pictures hiding between the numbers. No clock to beat.</p>
        </div>
        <div class="nc-club-card" aria-hidden="true">
          <span>CLUB RULE No. 01</span>
          <div class="nc-card-art">
            <svg viewBox="0 0 90 90" shape-rendering="crispEdges"><g fill="currentColor"><path d="M30 0h30v15H30zM15 15h60v15H15zM0 30h90v30H0zM15 60h60v15H15zM30 75h30v15H30z"/><path d="M30 30h30v30H30z" fill="#f4eedf"/></g></svg>
          </div>
          <strong>One square<br>at a time.</strong>
          <span>LOGIC, NOT LUCK.</span>
        </div>
      </section>

      <div class="nc-workspace" id="nonogram-puzzles">
        <aside class="nc-shelf" aria-labelledby="nonogram-shelf-heading">
          <div class="nc-shelf-heading">
            <p class="nc-eyebrow">THE FIRST EDITION</p>
            <h2 id="nonogram-shelf-heading">Pick a little puzzle.</h2>
            <p>Four everyday discoveries.<br>All yours to figure out.</p>
          </div>
          <nav aria-label="Puzzle selection">
            <ol class="nc-puzzle-list">
              ${puzzles.map((puzzle, index) => `
                <li>
                  <button type="button" class="nc-puzzle-choice" data-puzzle="${puzzle.id}" aria-pressed="${index === 0}">
                    <span class="nc-puzzle-number" aria-hidden="true">${puzzle.number}</span>
                    <span class="nc-choice-copy">
                      <strong>${escapeMarkup(puzzle.label)}</strong>
                      <span>${puzzle.width} × ${puzzle.height} <span aria-hidden="true">·</span> ${escapeMarkup(puzzle.level)}</span>
                      <span class="nc-choice-status" data-choice-status="${puzzle.id}">Unopened</span>
                    </span>
                    <span class="nc-choice-indicator" aria-hidden="true">${arrow}</span>
                  </button>
                </li>`).join('')}
            </ol>
          </nav>
          <div class="nc-collection">
            <div class="nc-collection-heading">
              <span class="nc-eyebrow">YOUR LITTLE COLLECTION</span>
              <strong><span data-collected-count>0</span><span class="nc-count-total"> / 4</span></strong>
            </div>
            <div class="nc-stamps">
              ${puzzles.map((puzzle) => `<span data-stamp="${puzzle.id}" role="img" aria-label="Picture ${puzzle.number}, not yet collected">${puzzle.number}</span>`).join('')}
            </div>
            <p>Kept while this page is open.<br>Replays won’t lose your collected pictures.</p>
          </div>
          <p class="nc-shelf-note"><span aria-hidden="true">✳</span> A little patience goes a long way.</p>
        </aside>

        <section class="nc-desk" aria-labelledby="nonogram-puzzle-title">
          <div class="nc-paper" data-paper data-project-preview>
            <header class="nc-puzzle-heading">
              <div>
                <p class="nc-eyebrow">PUZZLE <span data-puzzle-number>01</span> <span aria-hidden="true">/</span> <span data-puzzle-size>8 × 8</span> <span class="nc-level" data-puzzle-level>Gentle</span></p>
                <h2 id="nonogram-puzzle-title" data-puzzle-title></h2>
                <p class="nc-invitation" data-invitation></p>
              </div>
              <div class="nc-line-progress">
                <span data-progress-label></span>
                <progress data-progress max="16" value="0" aria-label="Lines with matching filled runs"></progress>
              </div>
            </header>

            <div class="nc-paint-tools">
              <div class="nc-tool-switch" role="group" aria-label="Painting tool">
                <button type="button" data-tool="fill" aria-pressed="true"><span class="nc-fill-symbol" aria-hidden="true"></span> Fill <kbd aria-hidden="true">F</kbd></button>
                <button type="button" data-tool="cross" aria-pressed="false"><span class="nc-cross-symbol" aria-hidden="true">×</span> Mark X <kbd aria-hidden="true">X</kbd></button>
              </div>
              <p>Tap once to mark; tap again to erase.</p>
            </div>

            <figure class="nc-board-figure">
              <div class="nc-board-wrap" data-board></div>
              <figcaption id="nonogram-board-note">Faded clues = matching runs, not checked positions.</figcaption>
            </figure>
            <p class="nc-sr-only" id="nonogram-input-help">Arrow keys move between squares. Space or Enter uses the selected tool. X marks a square empty; F fills it. Backspace or Delete erases it. Right-click also marks X. Empty background squares do not need X marks to finish.</p>

            <div class="nc-feedback" data-feedback-box data-tone="neutral">
              <span class="nc-feedback-mark" aria-hidden="true" data-feedback-mark>i</span>
              <p data-feedback role="status" aria-live="polite" aria-atomic="true"></p>
            </div>

            <div class="nc-game-actions" role="group" aria-label="Puzzle help">
              <button type="button" class="nc-button nc-button-ink" data-action="check">${check} Check</button>
              <button type="button" class="nc-button" data-action="hint">${sparkle} One hint</button>
              <button type="button" class="nc-button nc-button-reset" data-action="reset">${resetIcon} Reset</button>
            </div>
            <div class="nc-reset-confirm" data-reset-confirm role="group" aria-label="Confirm puzzle reset" aria-describedby="nonogram-reset-message" hidden>
              <p id="nonogram-reset-message"><strong>A fresh sheet?</strong> This clears this puzzle’s marks and attempt counters. Your other puzzles and collected pictures stay.</p>
              <div>
                <button type="button" class="nc-button nc-button-ink" data-action="confirm-reset">Clear this puzzle</button>
                <button type="button" class="nc-button" data-action="cancel-reset">Keep going</button>
              </div>
            </div>
            <dl class="nc-attempt-stats" aria-label="Current attempt counters">
              <div><dt>Moves</dt><dd data-moves>0</dd></div>
              <div><dt>Hints</dt><dd data-hints>0</dd></div>
              <div><dt>Checks</dt><dd data-checks>0</dd></div>
              <div class="nc-attempt-note"><dt class="nc-sr-only">Club reminder</dt><dd>Your pace. Your puzzle.</dd></div>
            </dl>

            <section class="nc-result" data-result aria-labelledby="nonogram-result-title" hidden>
              <div class="nc-reveal-art" data-reveal></div>
              <div class="nc-result-copy">
                <p class="nc-eyebrow">${check} PICTURE FOUND</p>
                <h3 id="nonogram-result-title" tabindex="-1" data-result-title></h3>
                <p data-result-story></p>
                <p class="nc-result-counts" data-result-counts></p>
                <div class="nc-result-actions">
                  <button type="button" class="nc-button nc-button-ink" data-action="result-next"><span data-result-next-label>Another little puzzle</span>${arrow}</button>
                  <button type="button" class="nc-replay" data-action="replay">Play this one again</button>
                </div>
              </div>
            </section>
          </div>

          <nav class="nc-page-turn" aria-label="Puzzle navigation">
            <button type="button" data-action="previous"><span class="nc-arrow-back">${arrow}</span> Previous</button>
            <span>PAGE <span data-page-number>01</span> OF 04</span>
            <button type="button" data-action="next">Next puzzle ${arrow}</button>
          </nav>
        </section>
      </div>

      <section class="nc-handbook" id="nonogram-handbook" aria-labelledby="nonogram-handbook-heading">
        <header>
          <p class="nc-eyebrow">THE CLUB HANDBOOK</p>
          <h2 id="nonogram-handbook-heading">A picture made of rules.</h2>
          <p>No guessing necessary. Just let the numbers do the talking.</p>
        </header>
        <div class="nc-lessons">
          <article>
            <span class="nc-lesson-number">01 / READ</span>
            <h3>The numbers are runs.</h3>
            <p>A clue of <strong>2, 3</strong> means a run of two filled squares, then a run of three. Rows read left to right; columns read top to bottom.</p>
            <div class="nc-demo"><span class="nc-demo-clues" aria-hidden="true">2&nbsp; 3</span>${demoLine([1, 1, 0, 1, 1, 1, 0, 0], 'Two filled squares, a gap, three filled squares, and two empty squares.')}</div>
          </article>
          <article>
            <span class="nc-lesson-number">02 / LEAVE ROOM</span>
            <h3>A little space matters.</h3>
            <p>Leave <strong>at least one empty square</strong> between runs. Use X to keep track of empty space. A clue of 0 means the whole line stays empty.</p>
            <div class="nc-gap-demo" aria-hidden="true"><span></span><span></span><b>×</b><span></span><span></span><span></span><b>×</b><b>×</b></div>
          </article>
          <article>
            <span class="nc-lesson-number">03 / CONNECT</span>
            <h3>Find what must be true.</h3>
            <p>In an eight-square line, a run of <strong>6</strong> must cover the middle four squares. Fill those, then see what they tell the crossing lines.</p>
            <div class="nc-demo"><span class="nc-demo-clues" aria-hidden="true">6</span>${demoLine([0, 0, 1, 1, 1, 1, 0, 0], 'The middle four squares of eight are guaranteed filled by a run of six; the outer squares are undecided.')}</div>
          </article>
        </div>
        <details class="nc-extra-help">
          <summary>Keyboard, checking & a little honest help <span aria-hidden="true">+</span></summary>
          <div class="nc-help-columns">
            <div>
              <h3>Make yourself comfortable.</h3>
              <p><kbd>Tab</kbd> enters or leaves the board. <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> move between squares; <kbd>Home</kbd> and <kbd>End</kbd> go to a row’s ends.</p>
              <p><kbd>Space</kbd> or <kbd>Enter</kbd> paints with the selected tool. <kbd>F</kbd> fills the current square; <kbd>X</kbd> marks it empty, regardless of the selected tool. <kbd>Delete</kbd> or <kbd>Backspace</kbd> erases. Repeat Fill or X to erase that mark.</p>
              <p>On a mouse, right-click to mark X. On touch, choose <strong>Fill</strong> or <strong>Mark X</strong> above the board. There is no drag gesture to get in the way of scrolling.</p>
            </div>
            <div>
              <h3>Help that means what it says.</h3>
              <p><strong>Check</strong> highlights filled squares that should be empty, and X marks where ink belongs. Untouched squares are <em>unfinished</em>, not mistakes. Faded clues only show that the filled run lengths match.</p>
              <p><strong>One hint</strong> corrects one mistaken mark first. Otherwise it explains a forced square from the clues, or explicitly calls itself a one-square reveal. Each changed square counts as one hint, never as one of your manual moves.</p>
              <p><strong>Finish</strong> by placing all the right filled squares and no extras. Background squares can be blank or marked X. These four original pictures each have one solution, reachable with line logic alone.</p>
            </div>
          </div>
        </details>
      </section>

      <footer class="nc-footer"><span>NONOGRAM CLUB <span aria-hidden="true">/</span> THE LITTLE THINGS</span><p>Made for the pleasure of figuring it out.</p><a href="#nonogram-puzzles">Back to your puzzle ↑</a></footer>
    </div>`;

  const board = query<HTMLElement>(root, '[data-board]');
  const paper = query<HTMLElement>(root, '[data-paper]');
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const feedbackBox = query<HTMLElement>(root, '[data-feedback-box]');
  const resetConfirm = query<HTMLElement>(root, '[data-reset-confirm]');
  const result = query<HTMLElement>(root, '[data-result]');
  const resultTitle = query<HTMLElement>(root, '[data-result-title]');
  const progress = query<HTMLProgressElement>(root, '[data-progress]');
  const selectorButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-puzzle]')];

  function setText(selector: string, value: string | number) {
    query<HTMLElement>(root, selector).textContent = String(value);
  }

  function updateFocus() {
    const session = currentSession();
    const puzzle = currentPuzzle();
    const inside = board.contains(root.ownerDocument.activeElement);
    cells.forEach((cell, index) => { cell.tabIndex = index === session.focus ? 0 : -1; });
    rowHeaders.forEach((header, row) => {
      header.classList.toggle('nc-active-line', inside && row === Math.floor(session.focus / puzzle.width));
    });
    columnHeaders.forEach((header, column) => {
      header.classList.toggle('nc-active-line', inside && column === session.focus % puzzle.width);
    });
  }

  function makeBoard() {
    const puzzle = currentPuzzle();
    const clues = (runs: readonly number[]) => (runs.length ? runs : [0]).map((run) => `<span>${run}</span>`).join('');
    board.innerHTML = `
      <table class="nc-grid" role="grid" aria-labelledby="nonogram-puzzle-title" aria-describedby="nonogram-input-help nonogram-board-note">
        <colgroup><col class="nc-clue-col">${'<col>'.repeat(puzzle.width)}</colgroup>
        <thead><tr>
          <td class="nc-grid-corner"><span aria-hidden="true">${puzzle.width}<span>×</span>${puzzle.height}</span></td>
          ${puzzle.clues.columns.map((runs, column) => `<th scope="col" data-column="${column}"><div class="nc-column-clues" aria-hidden="true">${clues(runs)}</div></th>`).join('')}
        </tr></thead>
        <tbody>
          ${puzzle.clues.rows.map((runs, row) => `<tr>
            <th scope="row" data-row="${row}"><div class="nc-row-clues" aria-hidden="true">${clues(runs)}</div></th>
            ${Array.from({ length: puzzle.width }, (_, column) => `<td role="gridcell"><button type="button" class="nc-cell" data-cell="${row * puzzle.width + column}" tabindex="-1"><span aria-hidden="true"></span></button></td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>`;
    cells = [...board.querySelectorAll<HTMLButtonElement>('[data-cell]')];
    rowHeaders = [...board.querySelectorAll<HTMLTableCellElement>('[data-row]')];
    columnHeaders = [...board.querySelectorAll<HTMLTableCellElement>('[data-column]')];
    setText('[data-puzzle-number]', puzzle.number);
    setText('[data-page-number]', puzzle.number);
    setText('[data-puzzle-size]', `${puzzle.width} × ${puzzle.height}`);
    setText('[data-puzzle-level]', puzzle.level);
    setText('[data-puzzle-title]', puzzle.label);
    setText('[data-invitation]', puzzle.invitation);
  }

  function renderShelf() {
    puzzles.forEach((puzzle, index) => {
      const session = sessions.get(puzzle.id)!;
      const solved = isComplete(puzzle, session.game);
      const started = session.game.moves + session.game.hints + session.game.checks > 0;
      const status = solved ? 'Collected'
        : collected.has(puzzle.id) ? (started ? 'Replaying' : 'Ready to replay')
          : started ? 'In progress' : selected === index ? 'On your desk' : 'Unopened';
      const button = selectorButtons[index];
      button.setAttribute('aria-pressed', String(index === selected));
      button.setAttribute('aria-label', `Puzzle ${puzzle.number}: ${puzzle.label}, ${puzzle.width} by ${puzzle.height}, ${puzzle.level}. ${status}.`);
      button.dataset.collected = String(collected.has(puzzle.id));
      setText(`[data-choice-status="${puzzle.id}"]`, status);
      const stamp = query<HTMLElement>(root, `[data-stamp="${puzzle.id}"]`);
      stamp.dataset.collected = String(collected.has(puzzle.id));
      stamp.setAttribute('aria-label', collected.has(puzzle.id)
        ? `Picture ${puzzle.number}, collected: ${puzzle.title}`
        : `Picture ${puzzle.number}, not yet collected`);
    });
    setText('[data-collected-count]', collected.size);
  }

  function renderGame() {
    const puzzle = currentPuzzle();
    const session = currentSession();
    const complete = isComplete(puzzle, session.game);
    const summary = summarize(puzzle, session.game);
    cells.forEach((cell, index) => {
      const value = session.game.cells[index];
      const row = Math.floor(index / puzzle.width);
      const column = index % puzzle.width;
      const error = session.errors.get(index);
      const valueLabel = value === 'crossed' ? 'marked X' : value;
      const errorLabel = error === 'extra-fill' ? ' Check: this square must be empty.'
        : error === 'crossed-fill' ? ' Check: this square needs ink.' : '';
      cell.dataset.state = value;
      cell.dataset.error = String(Boolean(error));
      cell.dataset.hint = String(!complete && index === session.hint);
      cell.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1}: ${valueLabel}. Row clues: ${puzzle.clues.rows[row].join(', ') || '0'}. Column clues: ${puzzle.clues.columns[column].join(', ') || '0'}.${errorLabel}${index === session.hint ? ' Hinted square.' : ''}`);
      cell.setAttribute('aria-disabled', String(complete));
      if (error) cell.setAttribute('aria-invalid', 'true');
      else cell.removeAttribute('aria-invalid');
      cell.firstElementChild!.textContent = value === 'crossed' ? '×' : '';
    });
    rowHeaders.forEach((header, row) => {
      header.classList.toggle('nc-matched-line', summary.rowsMatched[row]);
      header.setAttribute('aria-label', `Row ${row + 1} clues: ${puzzle.clues.rows[row].join(', ') || '0'}.${summary.rowsMatched[row] ? ' Filled runs match.' : ''}`);
    });
    columnHeaders.forEach((header, column) => {
      header.classList.toggle('nc-matched-line', summary.columnsMatched[column]);
      header.setAttribute('aria-label', `Column ${column + 1} clues: ${puzzle.clues.columns[column].join(', ') || '0'}.${summary.columnsMatched[column] ? ' Filled runs match.' : ''}`);
    });
    progress.max = summary.totalLines;
    progress.value = summary.matchedLines;
    setText('[data-progress-label]', `${summary.matchedLines} / ${summary.totalLines} lines matched`);
    setText('[data-moves]', session.game.moves);
    setText('[data-hints]', session.game.hints);
    setText('[data-checks]', session.game.checks);
    feedbackBox.dataset.tone = session.tone;
    if (feedback.textContent !== session.message) feedback.textContent = session.message;
    setText('[data-feedback-mark]', session.tone === 'good' ? '✓' : session.tone === 'warning' ? '!' : session.tone === 'hint' ? '✦' : 'i');
    query<HTMLButtonElement>(root, '[data-action="check"]').disabled = complete;
    query<HTMLButtonElement>(root, '[data-action="hint"]').disabled = complete;
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => { button.disabled = complete; });
    paper.dataset.complete = String(complete);
    result.hidden = !complete;
    if (complete) {
      query<HTMLElement>(root, '[data-reveal]').innerHTML = pictureMarkup(puzzle);
      resultTitle.textContent = puzzle.title;
      setText('[data-result-story]', puzzle.reveal);
      setText('[data-result-counts]', `${session.game.moves} moves · ${session.game.hints} ${session.game.hints === 1 ? 'hint' : 'hints'} · ${session.game.checks} ${session.game.checks === 1 ? 'check' : 'checks'}. ${collected.size} of ${puzzles.length} pictures collected.`);
      setText('[data-result-next-label]', selected === puzzles.length - 1 ? 'Back to the first' : 'Another little puzzle');
    }
    renderShelf();
    updateFocus();
  }

  function finishAction(message: string, tone: PuzzleSession['tone'] = 'neutral') {
    const session = currentSession();
    session.message = message;
    session.tone = tone;
    if (isComplete(currentPuzzle(), session.game)) {
      const puzzle = currentPuzzle();
      collected.add(puzzle.id);
      session.errors.clear();
      session.tone = 'good';
      session.message = `Picture found: ${puzzle.title}! ${collected.size === puzzles.length ? 'The whole little edition is yours.' : `${collected.size} of ${puzzles.length} pictures collected.`}${tone === 'hint' ? ` ${message}` : ''} Blank background squares never needed X marks.`;
      resetConfirm.hidden = true;
    }
    renderGame();
    if (isComplete(currentPuzzle(), session.game)) {
      resultTitle.focus({ preventScroll: true });
      result.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  function paint(index: number, paintingTool: PaintTool) {
    const session = currentSession();
    const next = paintCell(currentPuzzle(), session.game, index, paintingTool);
    if (next === session.game) return;
    session.game = next;
    session.focus = index;
    session.errors.delete(index);
    session.hint = null;
    resetConfirm.hidden = true;
    const row = Math.floor(index / currentPuzzle().width) + 1;
    const column = index % currentPuzzle().width + 1;
    const action = next.cells[index] === 'empty' ? 'erased' : next.cells[index] === 'filled' ? 'filled' : 'marked X';
    finishAction(`Row ${row}, column ${column} ${action}. Keep following the clues.`);
  }

  function focusBoard() {
    cells[currentSession().focus]?.focus({ preventScroll: true });
    board.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  function selectPuzzle(index: number) {
    selected = (index + puzzles.length) % puzzles.length;
    resetConfirm.hidden = true;
    makeBoard();
    renderGame();
    focusBoard();
  }

  function resetCurrent() {
    const session = currentSession();
    session.game = createState(currentPuzzle());
    session.focus = 0;
    session.errors.clear();
    session.hint = null;
    session.message = 'A fresh sheet, just for this puzzle. All attempt counters are back to zero.';
    session.tone = 'neutral';
    resetConfirm.hidden = true;
    renderGame();
    focusBoard();
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || !root.contains(target) || target.disabled) return;
    if (target.dataset.cell !== undefined) {
      paint(Number(target.dataset.cell), tool);
      return;
    }
    if (target.dataset.puzzle) {
      selectPuzzle(puzzles.findIndex((puzzle) => puzzle.id === target.dataset.puzzle));
      return;
    }
    if (target.dataset.tool) {
      tool = target.dataset.tool === 'cross' ? 'cross' : 'fill';
      root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      });
      const session = currentSession();
      session.message = `${tool === 'fill' ? 'Fill' : 'Mark X'} selected. Tap a square to ${tool === 'fill' ? 'fill it' : 'mark it empty'}; repeat to erase.`;
      session.tone = 'neutral';
      renderGame();
      return;
    }
    const session = currentSession();
    switch (target.dataset.action) {
      case 'check': {
        const checked = checkPuzzle(currentPuzzle(), session.game);
        session.game = checked.state;
        session.errors = new Map(checked.mistakes.map((mistake) => [mistake.index, mistake.kind]));
        session.hint = null;
        resetConfirm.hidden = true;
        const extra = checked.mistakes.filter((mistake) => mistake.kind === 'extra-fill').length;
        const crossed = checked.mistakes.filter((mistake) => mistake.kind === 'crossed-fill').length;
        const problems = [
          ...(extra ? [`${extra} filled ${extra === 1 ? 'square should' : 'squares should'} be empty`] : []),
          ...(crossed ? [`${crossed} X ${crossed === 1 ? 'mark needs' : 'marks need'} ink`] : []),
        ];
        finishAction(problems.length
          ? `Check: ${problems.join('; ')}. Highlighted with a dashed border. Unfilled squares are not counted as mistakes.`
          : `No contradictions in your marked squares. ${checked.remaining} picture ${checked.remaining === 1 ? 'square still needs' : 'squares still need'} ink; untouched squares are unfinished, not wrong.`,
        problems.length ? 'warning' : 'good');
        break;
      }
      case 'hint': {
        const hint = takeHint(currentPuzzle(), session.game);
        session.game = hint.state;
        session.hint = hint.index;
        if (hint.index !== null) session.errors.delete(hint.index);
        resetConfirm.hidden = true;
        finishAction(hint.message, 'hint');
        break;
      }
      case 'reset':
        if (session.game.moves + session.game.hints + session.game.checks === 0) {
          session.message = 'This is already a fresh sheet. Nothing to clear.';
          session.tone = 'neutral';
          renderGame();
        } else {
          resetConfirm.hidden = false;
          query<HTMLButtonElement>(root, '[data-action="cancel-reset"]').focus();
        }
        break;
      case 'confirm-reset':
      case 'replay':
        resetCurrent();
        break;
      case 'cancel-reset':
        resetConfirm.hidden = true;
        query<HTMLButtonElement>(root, '[data-action="reset"]').focus();
        break;
      case 'previous':
        selectPuzzle(selected - 1);
        break;
      case 'next':
      case 'result-next':
        selectPuzzle(selected + 1);
        break;
    }
  }, { signal });

  board.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-cell]') : null;
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    paint(Number(target.dataset.cell), 'cross');
  }, { signal });

  board.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-cell]') : null;
    if (target) currentSession().focus = Number(target.dataset.cell);
    updateFocus();
  }, { signal });
  board.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !board.contains(event.relatedTarget)) {
      rowHeaders.forEach((header) => header.classList.remove('nc-active-line'));
      columnHeaders.forEach((header) => header.classList.remove('nc-active-line'));
    }
  }, { signal });

  board.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-cell]') : null;
    if (!target || event.altKey || event.ctrlKey || event.metaKey) return;
    const puzzle = currentPuzzle();
    const index = Number(target.dataset.cell);
    const row = Math.floor(index / puzzle.width);
    const column = index % puzzle.width;
    const destinations: Record<string, number> = {
      ArrowLeft: row * puzzle.width + Math.max(0, column - 1),
      ArrowRight: row * puzzle.width + Math.min(puzzle.width - 1, column + 1),
      ArrowUp: Math.max(0, row - 1) * puzzle.width + column,
      ArrowDown: Math.min(puzzle.height - 1, row + 1) * puzzle.width + column,
      Home: row * puzzle.width,
      End: (row + 1) * puzzle.width - 1,
    };
    if (event.key in destinations) {
      event.preventDefault();
      currentSession().focus = destinations[event.key];
      cells[currentSession().focus].focus();
      return;
    }
    const key = event.key.toLowerCase();
    const paintingTool = key === 'x' ? 'cross' : key === 'f' ? 'fill'
      : key === 'delete' || key === 'backspace' ? 'erase'
        : key === ' ' || key === 'enter' ? tool : null;
    if (paintingTool) {
      event.preventDefault();
      if (!event.repeat) paint(index, paintingTool);
    }
  }, { signal });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !resetConfirm.hidden) {
      event.preventDefault();
      resetConfirm.hidden = true;
      query<HTMLButtonElement>(root, '[data-action="reset"]').focus();
    }
  }, { signal });

  page.onCleanup(() => {
    sessions.clear();
    collected.clear();
    cells = [];
    rowHeaders = [];
    columnHeaders = [];
  });
  makeBoard();
  renderGame();
  return { destroy: page.destroy };
}
