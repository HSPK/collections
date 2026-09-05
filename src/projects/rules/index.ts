import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import { createLoop } from '../../core/loop';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import {
  BOARD_HEIGHT, BOARD_WIDTH, fieldNotes, presetBoard, presetById, presets, references,
  ruleById, ruleDefinitions,
} from './data';
import {
  createBoard, equalBoards, linePoints, livingPoints, neighborCount, nextCell, paintCells,
  parseRule, population, ruleNotation, serializeBoard, stepBoard,
} from './engine';
import type { Board, Boundary, Cell, Point, Rule } from './engine';
import type { Preset } from './data';

type Brush = 'toggle' | 'plant' | 'erase';

interface Study {
  readonly board: Board;
  readonly rule: Rule;
  readonly boundary: Boundary;
  readonly generation: number;
  readonly births: number | null;
  readonly deaths: number | null;
  readonly start: Board;
  readonly startName: string;
  readonly presetId: string;
}

function seedIllustration(preset: Preset): string {
  const points = livingPoints(presetBoard(preset));
  const minX = Math.min(...points.map(([x]) => x)) - 1;
  const minY = Math.min(...points.map(([, y]) => y)) - 1;
  const width = Math.max(...points.map(([x]) => x)) - minX + 2;
  const height = Math.max(...points.map(([, y]) => y)) - minY + 2;
  return `<svg class="rules-seed-illustration" viewBox="${minX} ${minY} ${width} ${height}" aria-hidden="true">
    ${points.map(([x, y]) => `<rect x="${x + 0.1}" y="${y + 0.1}" width=".8" height=".8" rx=".12"/>`).join('')}
  </svg>`;
}

function customDescription(rule: Rule): string {
  const counts = (values: readonly number[]) => values.join(' or ');
  const birth = rule.birth.length ? `A dead cell is born with exactly ${counts(rule.birth)} living neighbors.` : 'No dead cell is born.';
  const survival = rule.survive.length ? `A living cell survives with exactly ${counts(rule.survive)} living neighbors.` : 'No living cell survives.';
  return `${birth} ${survival} All other cells are dead in the next generation.`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'rules');
  const { root, signal } = page;
  const initial = presetById('garden');
  const opening = presetBoard(initial);
  let study: Study = {
    board: opening, rule: ruleById(initial.ruleId), boundary: 'bounded', generation: 0,
    births: null, deaths: null, start: opening, startName: initial.name, presetId: initial.id,
  };
  const history: Study[] = [];
  let brush: Brush = 'toggle';
  let cursor: Point = [12, 8];
  let playing = false;
  let rate = context.reducedMotion ? 1 : 3;
  let accumulated = 0;
  let stroke: { id: number; value: Cell; last: Point; saved: boolean } | null = null;

  root.innerHTML = `
    <div class="rules-wrap">
      <header class="rules-masthead">
        <a class="rules-wordmark" href="#rules-top"><span aria-hidden="true">✳</span> An artificial field guide</a>
        <nav aria-label="Garden navigation">
          <a href="#rules-lab">Planting table</a><a href="#rules-library">Seed library</a><a href="#rules-notes">Field notes</a>
        </nav>
      </header>
      <section class="rules-intro" id="rules-top" aria-labelledby="rules-title">
        <div>
          <p class="rules-eyebrow">Study no. 23 / cellular automata</p>
          <h1 id="rules-title">Garden of <em>Rules</em></h1>
        </div>
        <p class="rules-deck">Plant a cell. Step to see what changes.</p>
      </section>

      <section class="rules-lab" id="rules-lab" aria-labelledby="rules-lab-title">
        <div class="rules-section-heading">
          <div><p class="rules-eyebrow">01 / get your hands in</p><h2 id="rules-lab-title">The planting table</h2></div>
          <span class="rules-still-note"><span data-play-dot aria-hidden="true"></span><span data-play-label>Still, until you say so</span></span>
        </div>
        <div class="rules-lab-layout">
          <div class="rules-board-column" data-project-preview>
            <div class="rules-board-topline">
              <h3 id="rules-board-title" class="rules-sr-only">A ${BOARD_WIDTH} × ${BOARD_HEIGHT} cell garden</h3>
              <div class="rules-time-controls">
                <button type="button" class="rules-primary" data-step>Step <span aria-hidden="true">→</span></button>
                <button type="button" data-play aria-pressed="false">Play</button>
                <label>Tempo <select data-rate aria-label="Generations per second">
                  <option value="1">1 / second</option><option value="3">3 / second</option><option value="6">6 / second</option>
                </select></label>
              </div>
              <label>View <select data-zoom aria-label="Board zoom"><option value="100">Fit</option><option value="200">2×</option><option value="300">3×</option></select></label>
            </div>
            <div class="rules-board-scroll">
              <svg data-board class="rules-board" viewBox="0 0 ${BOARD_WIDTH * 20} ${BOARD_HEIGHT * 20}"
                role="grid" tabindex="0" aria-labelledby="rules-board-title" aria-describedby="rules-board-help"
                aria-rowcount="${BOARD_HEIGHT}" aria-colcount="${BOARD_WIDTH}" aria-multiselectable="false">
                ${Array.from({ length: BOARD_HEIGHT }, (_, y) => `<g role="row" aria-rowindex="${y + 1}">
                  ${Array.from({ length: BOARD_WIDTH }, (_, x) => `<rect id="rules-cell-${y * BOARD_WIDTH + x}" data-cell="${y * BOARD_WIDTH + x}"
                    role="gridcell" aria-colindex="${x + 1}" x="${x * 20 + 1.5}" y="${y * 20 + 1.5}"
                    width="17" height="17" rx="2"/>`).join('')}</g>`).join('')}
              </svg>
            </div>
            <div class="rules-board-legend"><span><i class="rules-live-swatch"></i>Living</span><span><i class="rules-dead-swatch"></i>Dead</span><span><i class="rules-focus-swatch"></i>Selected</span></div>
            <label class="rules-pan-mode"><input type="checkbox" data-pan>Pan view instead of painting</label>
            <p class="rules-help" id="rules-board-help">Click or drag to paint. Focus the board, then use arrow keys to choose a cell,
              Space or Enter to apply your brush, and Delete to erase. On a small screen, zoom in or use the row and column editor below.</p>
            <dl class="rules-counts" aria-label="Actual board counts" aria-live="off">
              <div><dt>Generation</dt><dd data-generation>0</dd></div>
              <div><dt>Living cells</dt><dd data-population>0</dd></div>
              <div><dt>Last births</dt><dd data-births>—</dd></div>
              <div><dt>Last deaths</dt><dd data-deaths>—</dd></div>
            </dl>
            <p class="rules-status" data-status role="status">A composed board, paused at generation 0. Try Step before Play.</p>
          </div>

          <aside class="rules-workbench" aria-label="Garden tools">
            <section class="rules-tool-section">
              <h3>Choose a planting</h3>
              <label class="rules-field">Seed pattern<select data-preset>
                ${presets.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.name)}</option>`).join('')}
              </select></label>
              <p data-preset-note class="rules-help">${escapeMarkup(initial.description)}</p>
              <button type="button" data-load>Load pattern + its rule</button>
            </section>
            <section class="rules-tool-section">
              <h3>Set the conditions</h3>
              <label class="rules-field">Cellular rule<select data-rule>
                ${ruleDefinitions.map((rule) => `<option value="${rule.id}">${escapeMarkup(rule.name)} · ${rule.notation}</option>`).join('')}
                <option value="custom" data-custom-option hidden>Custom rule</option>
              </select></label>
              <p data-rule-description class="rules-rule-description"></p>
              <label class="rules-field">At the edge<select data-boundary>
                <option value="bounded">Bounded / outside cells are dead</option>
                <option value="wrap">Wrap / opposite edges connect</option>
              </select></label>
              <details class="rules-custom"><summary>Write a custom B/S rule</summary>
                <form data-custom-form novalidate>
                  <label class="rules-field">Birth / survival<input data-custom-input value="B3/S23" maxlength="24" spellcheck="false" autocapitalize="characters" aria-describedby="rules-rule-help rules-rule-error"></label>
                  <p class="rules-help" id="rules-rule-help">Use neighbor counts 0–8. B3/S23 means birth at 3, survival at 2 or 3. An empty list is allowed.</p>
                  <button type="submit">Apply rule</button><p class="rules-error" id="rules-rule-error" data-rule-error role="alert" hidden></p>
                </form>
              </details>
            </section>
            <section class="rules-tool-section">
              <h3>Make a mark</h3>
              <div class="rules-brushes" role="group" aria-label="Painting brush">
                <button type="button" data-brush="toggle" aria-pressed="true">Toggle</button>
                <button type="button" data-brush="plant" aria-pressed="false">Plant</button>
                <button type="button" data-brush="erase" aria-pressed="false">Erase</button>
              </div>
              <form data-coordinate-form>
                <div class="rules-coordinates">
                  <label>Row<input data-row type="number" min="1" max="${BOARD_HEIGHT}" step="1" value="9" required></label>
                  <label>Column<input data-column type="number" min="1" max="${BOARD_WIDTH}" step="1" value="13" required></label>
                  <button type="submit">Apply brush</button>
                </div>
              </form>
              <p data-inspector class="rules-inspector"></p>
              <p class="rules-help">Toggle flips the first cell, then paints that same state along a drag. Edits pause time and begin a fresh generation count.</p>
            </section>
            <section class="rules-tool-section rules-keeping">
              <h3>Keep a useful beginning</h3>
              <p data-start-name class="rules-help"></p>
              <div class="rules-small-actions">
                <button type="button" data-keep-start>Set as start</button><button type="button" data-reset>Reset pattern</button>
                <button type="button" data-clear>Clear grid</button><button type="button" data-undo disabled>Undo</button>
                <button type="button" data-export>Download JSON</button>
              </div>
              <p class="rules-help">Reset restores your starting cells, keeping the current rule and edge. Undo keeps the last 40 steps or edits. JSON records the current board, rule and generation.</p>
            </section>
          </aside>
        </div>
        <p class="rules-motion-note">${context.reducedMotion
          ? 'Reduced motion is on: the garden begins paused, with the slowest tempo selected. Step works without playback.'
          : 'No automatic time here. Play is an explicit choice, and it rests while the tab is hidden.'}
          Playback also pauses when a generation makes no changes.</p>
      </section>

      <section class="rules-library" id="rules-library" aria-labelledby="rules-library-title">
        <div class="rules-section-heading">
          <div><p class="rules-eyebrow">02 / little arrangements, different lives</p><h2 id="rules-library-title">The seed library</h2></div>
          <p>Each seed loads its matching rule.<br>Then you can change the conditions.</p>
        </div>
        <div class="rules-seed-grid">
          ${presets.filter((preset) => preset.id !== 'garden').map((preset, index) => `<article class="rules-seed">
            <div class="rules-seed-top"><span class="rules-eyebrow">Specimen ${String(index + 1).padStart(2, '0')}</span>${seedIllustration(preset)}</div>
            <p class="rules-seed-kind">${escapeMarkup(preset.kind)}</p>
            <h3>${escapeMarkup(preset.name)}</h3><p>${escapeMarkup(preset.description)}</p>
            <p class="rules-invitation">${escapeMarkup(preset.invitation)}</p>
            <button type="button" data-plant="${preset.id}">Plant ${escapeMarkup(preset.name)}</button>
          </article>`).join('')}
        </div>
      </section>

      <section class="rules-notes" id="rules-notes" aria-labelledby="rules-notes-title">
        <div class="rules-section-heading"><div><p class="rules-eyebrow">03 / how to read a garden</p><h2 id="rules-notes-title">Small rules. No hidden gardener.</h2></div></div>
        <div class="rules-notes-lead">
          <div><p class="rules-deck">Nothing here knows the shape of a flower.<br>Each cell just counts its neighbors.</p>
            <p>Plant a few cells, choose a rule, and turn time one generation at a time.
              A little local instruction can make something still, rhythmic, or surprisingly restless.</p></div>
          <aside class="rules-intro-note" aria-label="Today's specimen">
            <div class="rules-specimen">${seedIllustration(presetById('glider'))}</div>
            <p class="rules-eyebrow">Specimen: the glider</p>
            <p>Five cells. Four phases.<br>One diagonal journey.</p>
            <a href="#rules-library">Meet the seeds <span aria-hidden="true">↗</span></a>
          </aside>
        </div>
        <div class="rules-note-grid">${fieldNotes.map((note) => `<article><span class="rules-note-number">${note.number}</span>
          <h3>${escapeMarkup(note.title)}</h3><p>${escapeMarkup(note.text)}</p></article>`).join('')}</div>
        <div class="rules-rulebook">
          <div><p class="rules-eyebrow">A compact language</p><h3>Read B3/S23 as a sentence.</h3>
            <p><strong>B</strong> lists the neighbor counts that cause a <strong>birth</strong>.
              <strong>S</strong> lists the counts that allow <strong>survival</strong>.
              The digits are separate counts, not the number twenty-three. Every unlisted case becomes dead.</p></div>
          <div class="rules-rule-table-wrap"><table>
            <caption>Three rule sets in this field guide</caption>
            <thead><tr><th scope="col">Rule</th><th scope="col">Born with</th><th scope="col">Survives with</th></tr></thead>
            <tbody><tr><th scope="row">Life</th><td>3</td><td>2 or 3</td></tr><tr><th scope="row">HighLife</th><td>3 or 6</td><td>2 or 3</td></tr><tr><th scope="row">Seeds</th><td>2</td><td>Never</td></tr></tbody>
          </table></div>
        </div>
        <aside class="rules-last-note"><h3>A model, not a miniature ecosystem.</h3>
          <p>“Living,” “dead,” and “garden” are metaphors here. These are deterministic mathematical systems, not simulations of cells or plants.
            Equal populations can hide very different patterns; a count alone cannot tell you what the garden is doing.</p></aside>
      </section>
      <footer class="rules-footer"><div><p class="rules-eyebrow">Continue the fieldwork</p><h2>Further reading</h2></div>
        <ul>${references.map((reference) => `<li><a href="${escapeMarkup(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeMarkup(reference.name)} <span aria-hidden="true">↗</span></a><span>${escapeMarkup(reference.detail)}</span></li>`).join('')}</ul>
        <p>Original drawings, local calculations, no remote data. Seeds and rules live in a small, extendable catalogue.</p>
      </footer>
    </div>`;

  const boardElement = query<SVGSVGElement>(root, '[data-board]');
  const cellElements = [...root.querySelectorAll<SVGRectElement>('[data-cell]')];
  const presetSelect = query<HTMLSelectElement>(root, '[data-preset]');
  const ruleSelect = query<HTMLSelectElement>(root, '[data-rule]');
  const customOption = query<HTMLOptionElement>(root, '[data-custom-option]');
  const boundarySelect = query<HTMLSelectElement>(root, '[data-boundary]');
  const rateSelect = query<HTMLSelectElement>(root, '[data-rate]');
  const panControl = query<HTMLInputElement>(root, '[data-pan]');
  const playButton = query<HTMLButtonElement>(root, '[data-play]');
  const rowInput = query<HTMLInputElement>(root, '[data-row]');
  const columnInput = query<HTMLInputElement>(root, '[data-column]');
  const status = query<HTMLElement>(root, '[data-status]');
  const inspector = query<HTMLElement>(root, '[data-inspector]');
  const ruleDescription = query<HTMLElement>(root, '[data-rule-description]');
  const generationCount = query<HTMLElement>(root, '[data-generation]');
  const populationCount = query<HTMLElement>(root, '[data-population]');
  const birthsCount = query<HTMLElement>(root, '[data-births]');
  const deathsCount = query<HTMLElement>(root, '[data-deaths]');
  const undoButton = query<HTMLButtonElement>(root, '[data-undo]');
  const startName = query<HTMLElement>(root, '[data-start-name]');
  const playLabel = query<HTMLElement>(root, '[data-play-label]');
  const playDot = query<HTMLElement>(root, '[data-play-dot]');
  rateSelect.value = String(rate);

  function report(message: string) {
    status.textContent = message;
    page.report(message);
  }

  function remember() {
    history.push(study);
    if (history.length > 40) history.shift();
  }

  function render() {
    const selected = cursor[1] * BOARD_WIDTH + cursor[0];
    cellElements.forEach((element, index) => {
      const alive = study.board.cells[index] === 1;
      element.classList.toggle('rules-cell-alive', alive);
      element.classList.toggle('rules-cell-selected', index === selected);
      element.setAttribute('aria-label', `Row ${Math.floor(index / BOARD_WIDTH) + 1}, column ${index % BOARD_WIDTH + 1}, ${alive ? 'alive' : 'dead'}`);
      element.setAttribute('aria-selected', String(index === selected));
    });
    boardElement.setAttribute('aria-activedescendant', `rules-cell-${selected}`);
    rowInput.value = String(cursor[1] + 1);
    columnInput.value = String(cursor[0] + 1);
    const count = neighborCount(study.board, cursor, study.boundary);
    const current = study.board.cells[selected];
    inspector.textContent = `Row ${cursor[1] + 1}, column ${cursor[0] + 1}: ${current ? 'alive' : 'dead'}. ${count} living ${count === 1 ? 'neighbor' : 'neighbors'}. Next step: ${nextCell(current, count, study.rule) ? 'alive' : 'dead'}.`;
    const notation = ruleNotation(study.rule);
    const definition = ruleDefinitions.find((entry) => entry.notation === notation);
    customOption.hidden = Boolean(definition);
    customOption.textContent = `Custom · ${notation}`;
    ruleSelect.value = definition?.id ?? 'custom';
    ruleDescription.textContent = definition ? `${definition.summary} ${definition.observation}` : customDescription(study.rule);
    boundarySelect.value = study.boundary;
    generationCount.textContent = String(study.generation);
    populationCount.textContent = String(population(study.board));
    birthsCount.textContent = study.births === null ? '—' : String(study.births);
    deathsCount.textContent = study.deaths === null ? '—' : String(study.deaths);
    undoButton.disabled = history.length === 0;
    startName.textContent = `Reset point: ${study.startName}. ${population(study.start)} starting cells.`;
    playButton.textContent = playing ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(playing));
    playLabel.textContent = playing ? 'Time is growing' : 'Still, until you say so';
    playDot.classList.toggle('rules-is-playing', playing);
  }

  const loop = createLoop((_elapsed, delta) => {
    if (!playing || !delta) return;
    accumulated += delta;
    if (accumulated >= 1 / rate) {
      accumulated %= 1 / rate;
      advance(false);
    }
  }, { paused: true });
  page.onCleanup(loop.destroy);

  function setPlaying(value: boolean) {
    playing = value;
    accumulated = 0;
    loop.setPaused(!value);
  }

  function advance(manual: boolean) {
    if (manual) setPlaying(false);
    remember();
    const next = stepBoard(study.board, study.rule, study.boundary);
    study = { ...study, board: next.board, generation: study.generation + 1, births: next.births, deaths: next.deaths };
    if (!next.births && !next.deaths) {
      setPlaying(false);
      report(`Generation ${study.generation}: no cells changed. This is a fixed point, so playback is paused.`);
    } else if (manual) {
      report(`Generation ${study.generation}: ${next.population} living cells, ${next.births} births and ${next.deaths} deaths.`);
    }
    render();
  }

  function freshBoard(board: Board) {
    study = { ...study, board, generation: 0, births: null, deaths: null };
  }

  function brushValue(point: Point): Cell {
    return brush === 'plant' ? 1 : brush === 'erase' ? 0 : study.board.cells[point[1] * BOARD_WIDTH + point[0]] ? 0 : 1;
  }

  function applyBrush(points: readonly Point[], value: Cell, save: boolean): boolean {
    const next = paintCells(study.board, points, value);
    if (next === study.board) return false;
    if (save) remember();
    freshBoard(next);
    return true;
  }

  function editSelected(value = brushValue(cursor)) {
    setPlaying(false);
    const changed = applyBrush([cursor], value, true);
    render();
    report(changed
      ? `Row ${cursor[1] + 1}, column ${cursor[0] + 1} is now ${value ? 'alive' : 'dead'}. Generation reset to 0.`
      : `That cell is already ${value ? 'alive' : 'dead'}. No change made.`);
  }

  function loadPreset(id: string) {
    const preset = presetById(id);
    const next = presetBoard(preset);
    setPlaying(false);
    remember();
    study = {
      board: next, start: next, startName: preset.name, presetId: id, rule: ruleById(preset.ruleId),
      boundary: study.boundary, generation: 0, births: null, deaths: null,
    };
    presetSelect.value = id;
    query(root, '[data-preset-note]').textContent = preset.description;
    query<HTMLInputElement>(root, '[data-custom-input]').value = ruleNotation(study.rule);
    render();
    report(`${preset.name} planted with ${ruleNotation(study.rule)}. ${preset.invitation}`);
  }

  function changeRule(rule: Rule) {
    setPlaying(false);
    if (ruleNotation(rule) === ruleNotation(study.rule)) {
      render();
      report(`${ruleNotation(rule)} is already the active rule. The board is unchanged.`);
      return;
    }
    remember();
    study = { ...study, rule, generation: 0, births: null, deaths: null };
    query<HTMLInputElement>(root, '[data-custom-input]').value = ruleNotation(rule);
    render();
    report(`Rule changed to ${ruleNotation(rule)}. Your cells are kept; the generation count starts at 0.`);
  }

  function reset() {
    setPlaying(false);
    if (!equalBoards(study.board, study.start) || study.generation !== 0) {
      remember();
      freshBoard(study.start);
    }
    render();
    report(`${study.startName} restored at generation 0. Rule and edge setting kept.`);
  }

  query(root, '[data-step]').addEventListener('click', () => advance(true), { signal });
  playButton.addEventListener('click', () => {
    setPlaying(!playing);
    render();
    report(playing ? `Playing at ${rate} ${rate === 1 ? 'generation' : 'generations'} per second. Pause to study a moment.` : `Paused at generation ${study.generation}.`);
  }, { signal });
  rateSelect.addEventListener('change', () => {
    rate = Number(rateSelect.value);
    accumulated = 0;
    report(`Tempo set to ${rate} ${rate === 1 ? 'generation' : 'generations'} per second${playing ? '.' : '; still paused.'}`);
  }, { signal });
  query<HTMLSelectElement>(root, '[data-zoom]').addEventListener('change', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    boardElement.style.width = `${target.value}%`;
    report(target.value === '100' ? 'The whole board fits the view.' : `${Number(target.value) / 100} times zoom. Enable Pan view to scroll or swipe around, then uncheck it to paint.`);
  }, { signal });
  panControl.addEventListener('change', () => {
    boardElement.classList.toggle('rules-pan-view', panControl.checked);
    report(panControl.checked ? 'View mode: scroll or swipe inside the board without painting. Keyboard and coordinate editing still work.' : 'Painting mode: click or drag to apply your brush.');
  }, { signal });
  presetSelect.addEventListener('change', () => {
    query(root, '[data-preset-note]').textContent = presetById(presetSelect.value).description;
  }, { signal });
  query(root, '[data-load]').addEventListener('click', () => loadPreset(presetSelect.value), { signal });
  ruleSelect.addEventListener('change', () => {
    if (ruleSelect.value !== 'custom') changeRule(ruleById(ruleSelect.value));
  }, { signal });
  boundarySelect.addEventListener('change', () => {
    const value = boundarySelect.value;
    if (value !== 'bounded' && value !== 'wrap') throw new Error('Unknown boundary setting.');
    setPlaying(false);
    remember();
    study = { ...study, boundary: value, generation: 0, births: null, deaths: null };
    render();
    report(`${value === 'wrap' ? 'Opposite edges now connect' : 'Outside the board is now always dead'}. Cells kept; generation count reset to 0.`);
  }, { signal });
  query<HTMLFormElement>(root, '[data-custom-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = query<HTMLInputElement>(root, '[data-custom-input]');
    const error = query<HTMLElement>(root, '[data-rule-error]');
    const parsed = parseRule(input.value);
    error.hidden = parsed.valid;
    input.setAttribute('aria-invalid', String(!parsed.valid));
    if (!parsed.valid) {
      error.textContent = parsed.error;
      report(parsed.error);
      return;
    }
    error.textContent = '';
    input.value = ruleNotation(parsed.rule);
    changeRule(parsed.rule);
  }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.brush;
      if (value !== 'toggle' && value !== 'plant' && value !== 'erase') throw new Error('Unknown painting brush.');
      brush = value;
      root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      report(`${button.textContent} brush selected. Apply it to the board or use row and column below.`);
    }, { signal });
  });
  query<HTMLFormElement>(root, '[data-coordinate-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const x = columnInput.valueAsNumber - 1;
    const y = rowInput.valueAsNumber - 1;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
      report(`Choose a row from 1 to ${BOARD_HEIGHT} and a column from 1 to ${BOARD_WIDTH}.`);
      return;
    }
    cursor = [x, y];
    editSelected();
  }, { signal });
  for (const input of [rowInput, columnInput]) {
    input.addEventListener('focus', () => {
      if (!playing) return;
      setPlaying(false);
      render();
      report('Playback paused so you can choose a cell.');
    }, { signal });
  }

  function pointerCell(event: PointerEvent): Point {
    const bounds = boardElement.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / bounds.width * BOARD_WIDTH);
    const y = Math.floor((event.clientY - bounds.top) / bounds.height * BOARD_HEIGHT);
    return [Math.max(0, Math.min(BOARD_WIDTH - 1, x)), Math.max(0, Math.min(BOARD_HEIGHT - 1, y))];
  }

  boardElement.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || panControl.checked) return;
    event.preventDefault();
    setPlaying(false);
    boardElement.focus({ preventScroll: true });
    cursor = pointerCell(event);
    stroke = { id: event.pointerId, value: brushValue(cursor), last: cursor, saved: false };
    boardElement.setPointerCapture(event.pointerId);
    stroke.saved = applyBrush([cursor], stroke.value, true);
    render();
  }, { signal });
  boardElement.addEventListener('pointermove', (event) => {
    if (!stroke || stroke.id !== event.pointerId) return;
    cursor = pointerCell(event);
    const changed = applyBrush(linePoints(stroke.last, cursor), stroke.value, !stroke.saved);
    stroke.saved ||= changed;
    stroke.last = cursor;
    render();
  }, { signal });
  function finishStroke(event: PointerEvent) {
    if (!stroke || event.pointerId !== stroke.id) return;
    const changed = stroke.saved;
    stroke = null;
    if (boardElement.hasPointerCapture(event.pointerId)) boardElement.releasePointerCapture(event.pointerId);
    report(changed ? `Planting edited. ${population(study.board)} living cells; generation reset to 0. Undo reverses the entire stroke.` : 'No cells changed with this brush stroke.');
  }
  boardElement.addEventListener('pointerup', finishStroke, { signal });
  boardElement.addEventListener('pointercancel', finishStroke, { signal });
  boardElement.addEventListener('lostpointercapture', (event) => {
    if (stroke?.id === event.pointerId) finishStroke(event);
  }, { signal });
  boardElement.addEventListener('keydown', (event) => {
    let [x, y] = cursor;
    if ([' ', 'Enter', 'Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      editSelected(event.key === 'Delete' || event.key === 'Backspace' ? 0 : brushValue(cursor));
      return;
    }
    switch (event.key) {
      case 'ArrowLeft': x -= 1; break;
      case 'ArrowRight': x += 1; break;
      case 'ArrowUp': y -= 1; break;
      case 'ArrowDown': y += 1; break;
      case 'Home': x = 0; if (event.ctrlKey || event.metaKey) y = 0; break;
      case 'End': x = BOARD_WIDTH - 1; if (event.ctrlKey || event.metaKey) y = BOARD_HEIGHT - 1; break;
      default: return;
    }
    event.preventDefault();
    setPlaying(false);
    cursor = [Math.max(0, Math.min(BOARD_WIDTH - 1, x)), Math.max(0, Math.min(BOARD_HEIGHT - 1, y))];
    render();
    cellElements[cursor[1] * BOARD_WIDTH + cursor[0]].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    report(inspector.textContent ?? 'Cell selected.');
  }, { signal });

  query(root, '[data-keep-start]').addEventListener('click', () => {
    setPlaying(false);
    remember();
    study = { ...study, start: study.board, startName: 'Your saved planting', generation: 0, births: null, deaths: null };
    render();
    report('These cells are now your reset point. Download JSON as well to keep a snapshot after leaving this page.');
  }, { signal });
  query(root, '[data-reset]').addEventListener('click', reset, { signal });
  query(root, '[data-clear]').addEventListener('click', () => {
    setPlaying(false);
    if (population(study.board) || study.generation) {
      remember();
      freshBoard(createBoard(BOARD_WIDTH, BOARD_HEIGHT));
    }
    render();
    report('Grid cleared. Your reset point is kept; Undo also restores the previous board.');
  }, { signal });
  undoButton.addEventListener('click', () => {
    setPlaying(false);
    const previous = history.pop();
    if (!previous) {
      report('There is no earlier step or edit to restore.');
      return;
    }
    study = previous;
    presetSelect.value = study.presetId;
    query(root, '[data-preset-note]').textContent = presetById(study.presetId).description;
    query<HTMLInputElement>(root, '[data-custom-input]').value = ruleNotation(study.rule);
    render();
    report(`Restored the previous study at generation ${study.generation}, with ${population(study.board)} living cells.`);
  }, { signal });
  query(root, '[data-export]').addEventListener('click', () => {
    downloadText(`garden-of-rules-generation-${study.generation}.json`, serializeBoard(study.board, study.rule, study.boundary, study.generation), 'application/json;charset=utf-8');
    report(`JSON snapshot downloaded: generation ${study.generation}, ${ruleNotation(study.rule)}, ${study.boundary} edges, ${population(study.board)} living cells.`);
  }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-plant]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.plant;
      if (!id) throw new Error('The seed button is missing its pattern id.');
      loadPreset(id);
      query<HTMLElement>(root, '#rules-lab').scrollIntoView({ block: 'start', behavior: 'instant' });
      query<HTMLButtonElement>(root, '[data-step]').focus({ preventScroll: true });
    }, { signal });
  });

  page.onCleanup(() => { stroke = null; });
  render();
  return { destroy: page.destroy, reset };
}
