import { escapeMarkup, query } from '../../core/page';
import type { WorkspaceLifecycle } from '../../core/workspace';
import { createWorkspaceDialog } from '../../core/workspace';
import { CHALLENGES, CHAPTERS, GLYPHS, GLYPH_IDS, challengeById } from './data';
import type { Beam, Glyph } from './data';
import { legalHints } from './engine';
import type { Command, State } from './engine';
import { describeBeam, equalBeam, execute, programCost, syntaxError } from './interpreter';
import { limits, specimens } from './solver';
import type { Specimen } from './solver';

const e = escapeMarkup;
const COLORS = ['#a16b1c', '#286b61', '#b63f2b'];

export function glyphArtwork(glyph: Glyph): string {
  return `<svg class="sg-glyph" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="${GLYPHS[glyph].mark}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function beamArtwork(beam: Beam, large = false): string {
  const path = beam?.shape === 0 ? '<circle cx="24" cy="24" r="11"/>' :
    beam?.shape === 1 ? '<path d="M24 10 38 24 24 38 10 24Z"/>' : '<path d="M24 10 39 36H9Z"/>';
  return `<svg class="sg-beam ${large ? 'sg-beam-large' : ''}" viewBox="0 0 48 48" role="img" aria-label="${describeBeam(beam)}">
    ${beam ? `<g fill="${beam.light === 2 ? COLORS[beam.hue] : 'none'}" stroke="${COLORS[beam.hue]}" stroke-width="2.5">${path}</g>
      <g fill="${COLORS[beam.hue]}">${Array.from({ length: beam.hue + 1 }, (_, i) => `<circle cx="${20 + i * 4 - beam.hue * 2}" cy="43" r="1.5"/>`).join('')}</g>` :
      '<path d="M17 24H31" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-dasharray="2 4" opacity=".3"/>'}
  </svg>`;
}
function dialArtwork(beam: Beam, tick: number, tone: string): string {
  return `<div class="sg-dial" data-tone="${tone}">
    <svg class="sg-graduations" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle cx="80" cy="80" r="74"/><circle cx="80" cy="80" r="69"/><circle cx="80" cy="80" r="54"/>
      ${Array.from({ length: 60 }, (_, i) => `<path d="M80 6V${i % 5 === 0 ? 17 : 11}" transform="rotate(${i * 6} 80 80)" />`).join('')}
      <path class="sg-needle" d="M80 22 84 29H76Z" transform="rotate(${tick * 60} 80 80)" fill="currentColor"/>
      <path d="M32 32 41 41 M119 119 128 128 M32 128 41 119 M119 41 128 32" />
    </svg>${beamArtwork(beam, true)}</div>`;
}
function streamMarkup(beams: readonly Beam[]): string {
  return beams.map((beam, index) => `<span class="sg-stream-beam" title="Tick ${index + 1}: ${describeBeam(beam)}">${beamArtwork(beam)}</span>`).join('');
}

interface RendererOptions {
  state(): State;
  busy(): boolean;
  command(command: Command): boolean;
  architect(action: 'commission' | 'hint'): void;
  restart(newEdition: boolean): void;
  reducedMotion: boolean;
}

export function createRenderer(page: WorkspaceLifecycle, options: RendererOptions) {
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <header class="sg-masthead">
      <div class="sg-wordmark"><span class="sg-printer-mark" aria-hidden="true">S</span><h1>Sigil</h1><span class="sg-subtitle">Atelier of executable light</span></div>
      <nav aria-label="Workshop tools"><button data-brief>Brief</button><button data-rules>Rules</button><button data-notebook>Save</button><button data-restart>Restart</button></nav>
      <ol class="sg-seals" aria-label="Campaign seals">${CHAPTERS.map((chapter, index) => `<li data-seal="${index}" title="${chapter.name}"><span>${chapter.numeral}</span><span class="sg-seal-label">${chapter.lesson}</span></li>`).join('')}</ol>
      <p class="sg-resources"><span data-mana>14 mana</span><span data-hints>3 hints</span></p>
    </header>
    <main class="sg-layout">
      <aside class="sg-drawer" aria-label="Glyph drawer">
        <div class="sg-panel-title"><h2>Type drawer</h2><span>Pick to append</span></div>
        <div class="sg-palette" data-palette>${GLYPH_IDS.map(glyph => `<button class="sg-type" data-glyph="${glyph}" aria-label="Add ${GLYPHS[glyph].name}" title="${e(GLYPHS[glyph].rule)}">
          ${glyphArtwork(glyph)}<span><strong>${GLYPHS[glyph].name}</strong><span class="sg-type-cost">${GLYPHS[glyph].cost} brass</span></span><kbd data-key-for="${glyph}"></kbd>
        </button>`).join('')}</div>
        <p class="sg-drawer-foot">Each tile is a function.<br>Each light is a value.</p>
      </aside>
      <section class="sg-bench" data-project-preview aria-label="Executable glyph workbench">
        <div class="sg-plate-heading"><div><p data-chapter>PLATE I / ORDERING</p><h2 data-challenge>Awaiting a commission</h2></div><button class="sg-plate-stamp" data-proof aria-label="Inspect proof and counterexamples"><span data-proof-count>0 / 5</span><span>SEALS</span></button></div>
        <div class="sg-instrument" data-instrument aria-label="Evaluation instruments"></div>
        <div class="sg-timebar">
          <label class="sg-specimen-label"><span class="sg-sr">Inspect specimen</span><select data-specimen aria-label="Inspect specimen"><option value="0">Specimen 1</option><option value="1">Specimen 2</option><option value="2">Specimen 3</option></select></label>
          <div class="sg-ticks" role="group" aria-label="Time tick">${Array.from({ length: 6 }, (_, tick) => `<button data-tick="${tick}" aria-label="Tick ${tick + 1}" aria-pressed="${tick === 0}">${tick + 1}</button>`).join('')}</div>
          <button data-play aria-label="Replay evaluation trace">Trace</button>
        </div>
        <div class="sg-composing-stick">
          <div class="sg-stick-caption"><span>INPUT <span aria-hidden="true">&gt;</span> COMPOSE LEFT TO RIGHT</span><span data-capacity>0 / 3 sockets</span></div>
          <div class="sg-program" data-program role="group" aria-label="Glyph program"></div>
        </div>
        <div class="sg-editing" role="group" aria-label="Edit selected glyph">
          <span data-selection>No tile selected</span><button data-left aria-label="Move selected glyph left">Left</button><button data-right aria-label="Move selected glyph right">Right</button><button data-remove aria-label="Remove selected glyph">Lift</button><button data-clear>Clear</button>
        </div>
        <div class="sg-actions">
          <button class="sg-primary" data-compile>Fire spell <span>1 mana</span></button>
          <button class="sg-primary" data-architect>Invite architect</button>
          <button data-hint>Ask hint</button><span class="sg-firings" data-firings>Model required</span>
        </div>
        <p class="sg-bench-status" data-notice role="status" aria-live="polite">Invite the architect to commission the first plate. Nothing is sent until you ask.</p>
      </section>
      <aside class="sg-folio" aria-label="Commission notes"><div data-folio></div></aside>
    </main>
    <footer class="sg-footer"><div data-agent-host></div><span class="sg-imprint">No. 077 / INK &amp; INSTRUCTION</span></footer>
  `;
  const body = query<HTMLElement>(root, '[data-folio]');
  const ruleContent = document.createElement('section');
  ruleContent.className = 'sg-rulebook';
  ruleContent.innerHTML = `
    <p class="sg-eyebrow">THE PRINTER'S COMPANION / FIVE SEALS</p>
    <h3>A spell is not a sentence. It runs.</h3>
    <p>Invite the architect to choose a commission and its restrictions. Read the Brief, then pick tiles from the drawer. They execute <b>left to right</b>, once per tick, for a six-tick input stream. The instruments show input, your result, and the required result.</p>
    <h3>One small, exact alphabet</h3>
    <p>Colors have indices: <b>amber 0, jade 1, vermilion 2</b>. Shapes: <b>ring 0, lozenge 1, triangle 2</b>. Outlined shapes are dim; filled shapes are bright. Color also has one, two or three dots beneath it. A dash means darkness, not a missing tick.</p>
    <div class="sg-rule-list">${GLYPH_IDS.map(glyph => `<article>${glyphArtwork(glyph)}<div><h4>${GLYPHS[glyph].name} / ${GLYPHS[glyph].cost} brass</h4><p>${e(GLYPHS[glyph].rule)}</p></div></article>`).join('')}</div>
    <h3>Read the instrument, not a guess</h3>
    <p>Choose a specimen and a numbered tick. Beneath each tile is the light leaving it at that tick. Select the tile and open <b>Inspect proof</b> to read its input, output, memory and branch register. Trace animates each tile across all six ticks; with reduced motion, it steps one tick instead.</p>
    <p>Examples: two Turn tiles advance amber to vermilion. Two Delay tiles move a light two ticks later. A Fork followed by Flare and Weave keeps the untouched and altered threads separate until addition. A Fork must have exactly one matching Weave; nesting is not permitted.</p>
    <p>Every specimen starts with empty memory. A Delay at socket 2 remembers what entered socket 2, not the original source. Echo remembers input, including darkness, so two consecutive dark inputs do not cause an endless echo. There is no extra tail tick after tick 6.</p>
    <h3>Spend carefully; experiment freely</h3>
    <p>Editing and tracing the three open specimens are free. <b>Fire spell</b> spends 1 of 14 campaign mana and one local firing. It executes all 45 specimens, including 42 sealed ones. A mismatch gives an inspectable counterexample, never a model verdict. A syntax error also spends a firing.</p>
    <p>The architect chooses a roomy bench (one spare socket, two spare brass units, five firings) or a precise one (tighter capacity, four firings). Every offered configuration is exhaustively solved before acceptance. Equivalent programs are welcome; matching only the three open examples is not enough.</p>
    <p>Earn all five seals to win. Exhaust a plate's firings, spend your last mana before finishing the campaign, or surrender an unfinished plate to lose. Editing cannot recover spent mana. Three hint slips serve the entire campaign; a successful model hint selects one bounded local insight. Failed or cancelled requests spend nothing.</p>
    <h3>Hands, keys &amp; keeping your work</h3>
    <p>Tap a drawer tile to append it. Tap an inscribed tile to select it, then Left, Right or Lift. Desktop dragging reorders occupied sockets. Keyboard: <b>1-9</b> append the numbered available glyph; <b>Left/Right</b> select a neighbor; <b>Alt+Left/Right</b> reorder; <b>Delete</b> lifts; <b>C</b> fires; <b>?</b> opens these rules. Tab and Enter work everywhere. Shortcuts do not run in dialogs or text fields.</p>
    <p>Save opens the shared notebook: automatic local persistence, native replay export and atomic import. A replay re-executes validated moves, not a trusted state snapshot, and never calls a model. Restart the same edition to retry its specimens, or choose a new edition for different sealed streams. Both cancel pending requests. Selection and instrument inspection do not cancel a turn.</p>
    <h3>The honest architect</h3>
    <p>New commissions and hints require your configured OpenAI-compatible function-tool model. No request runs on page load. The architect sees recent failed programs, counterexamples, budgets and legal choices; it adapts the next variant and restriction. It cannot invent executable code, change scores or declare victory. Model failures are visible in Model / Log. This workshop has no offline substitute architect, and makes no audio.</p>
  `;
  const rules = createWorkspaceDialog(page, { id: 'sigil-rules', title: 'Rulebook', content: [ruleContent], triggers: [query(root, '[data-rules]')], className: 'sg-dialog' });
  const briefContent = document.createElement('section');
  const brief = createWorkspaceDialog(page, { id: 'sigil-brief', title: 'Commission & ledger', content: [briefContent], triggers: [query(root, '[data-brief]')], className: 'sg-dialog' });
  const proofContent = document.createElement('section');
  const proof = createWorkspaceDialog(page, { id: 'sigil-proof', title: 'Proof instrument', content: [proofContent], className: 'sg-dialog' });
  const restartContent = document.createElement('section');
  restartContent.innerHTML = `<p>Restart replaces this browser's current campaign and cancels a pending architect turn. Export it from Save first if you want to keep it.</p><div class="sg-dialog-actions"><button data-same-edition>Restart same edition</button><button data-new-edition>New edition</button></div>`;
  const restart = createWorkspaceDialog(page, { id: 'sigil-restart', title: 'Re-ink the press', content: [restartContent], triggers: [query(root, '[data-restart]')], className: 'sg-dialog' });
  const surrenderContent = document.createElement('section');
  surrenderContent.innerHTML = '<p>Surrender ends this campaign as an unfinished work. Your earned seals and attempts remain inspectable and exportable.</p><button data-confirm-surrender>Surrender this plate</button>';
  const surrender = createWorkspaceDialog(page, { id: 'sigil-surrender', title: 'Leave the seal unfinished?', content: [surrenderContent], className: 'sg-dialog' });

  let selected = -1, tick = 0, sample = 0, activeStage = -1, playing = false;
  let reducedMotion = options.reducedMotion, paused = false, lastStep = 0, frame = 0;
  let dragged = -1, lastProgram = '', notice = '', lastState: State | undefined;
  let cases: Specimen[] = [];
  let caseKey = '';

  function currentCase(): Specimen | null {
    const state = options.state();
    if (!state.config) return null;
    const key = `${state.seed}:${state.config.challengeId}`;
    if (key !== caseKey) { caseKey = key; cases = specimens(state.config.challengeId, state.seed); }
    if (sample === 3 && state.result?.witness) {
      const witness = state.result.witness;
      return { id: witness.caseId, heldOut: witness.heldOut, input: witness.input, expected: witness.expected };
    }
    return cases[Math.min(sample, 2)];
  }
  function text(selector: string, value: string) { query<HTMLElement>(root, selector).textContent = value; }
  function disabled(selector: string, value: boolean) { query<HTMLButtonElement>(root, selector).disabled = value; }
  function announce(message: string) { notice = message; text('[data-notice]', message); }
  function stop() {
    playing = false; activeStage = -1;
    cancelAnimationFrame(frame);
    root.dataset.tracing = 'false';
    text('[data-play]', 'Trace');
  }
  function traceFrame(time: number) {
    if (!playing || paused || signal.aborted) return;
    if (time - lastStep >= 520) {
      lastStep = time;
      activeStage++;
      if (activeStage >= options.state().program.length) { activeStage = -1; tick++; }
      if (tick >= 6) { tick = 5; stop(); }
      paintTrace();
    }
    if (playing) frame = requestAnimationFrame(traceFrame);
  }
  function play() {
    if (!currentCase()) { announce('A model commission is needed before tracing specimens.'); return; }
    if (syntaxError(options.state().program)) { announce('Close the branch grammar before tracing. Inspect proof for the exact rule.'); return; }
    if (playing) { stop(); paintTrace(); return; }
    if (reducedMotion || paused) { tick = (tick + 1) % 6; activeStage = -1; paintTrace(); return; }
    tick = 0; activeStage = -1; playing = true; lastStep = 0;
    root.dataset.tracing = 'true';
    text('[data-play]', 'Stop');
    frame = requestAnimationFrame(traceFrame);
  }
  function paintTrace() {
    const state = options.state(), item = currentCase(), error = syntaxError(state.program);
    const source: Beam = item ? item.input[tick] : { hue: 0, shape: 0, light: 1 };
    const run = item && !error ? execute(state.program, item.input) : null;
    const output = run?.output[tick] ?? null;
    const expected = item?.expected[tick] ?? null;
    const match = item && run && equalBeam(output, expected);
    const lenses = [
      { label: 'Source', beam: source, tone: 'source' },
      { label: error ? 'Open grammar' : 'Your spell', beam: output, tone: match ? 'match' : 'actual' },
      { label: item ? 'Required' : 'Uncommissioned', beam: expected, tone: 'expected' },
    ];
    query(root, '[data-instrument]').innerHTML = lenses.map(lens => `<figure><figcaption>${lens.label}</figcaption>${dialArtwork(lens.beam, tick, lens.tone)}<span class="sg-lens-reading">${item ? describeBeam(lens.beam) : lens.tone === 'source' ? 'light, awaiting grammar' : 'model commission needed'}</span></figure>`).join('');
    for (const button of root.querySelectorAll<HTMLElement>('[data-tick]')) button.setAttribute('aria-pressed', String(Number(button.dataset.tick) === tick));
    for (const socket of root.querySelectorAll<HTMLElement>('[data-socket]')) {
      const at = Number(socket.dataset.socket);
      socket.dataset.active = String(playing && at === activeStage);
      const out = run?.trace[tick]?.[at]?.output ?? null;
      query(socket, '[data-tile-beam]').innerHTML = beamArtwork(out);
      socket.setAttribute('aria-pressed', String(at === selected));
    }
    if (proof.dialog.open) paintProof();
  }
  function notesMarkup(): string {
    const state = options.state();
    const challenge = state.config ? challengeById(state.config.challengeId) : null;
    const chapter = CHAPTERS[challenge?.chapter ?? state.chapter];
    const budget = state.config ? limits(state.config) : null;
    return `<p class="sg-eyebrow">COMMISSION / ${chapter.numeral}</p>
      <h3>${challenge ? e(challenge.name) : 'The uncut plate'}</h3>
      <p class="sg-goal" data-goal>${challenge ? e(challenge.goal) : 'Five seals of increasing complexity. An API-backed architect chooses the exercise and restrictions. You make the executable spell.'}</p>
      <div class="sg-annotation"><span class="sg-eyebrow">ARCHITECT'S MARGIN</span><p>${e(state.intention || 'The architect has not been called. Model settings are in the lower margin; Invite architect begins the first turn.')}</p></div>
      ${state.hint ? `<div class="sg-hint"><h4>Hint slip</h4><p data-hint-text>${e(state.hint)}</p></div>` : ''}
      <dl class="sg-constraints"><div><dt>Discipline</dt><dd>${state.config?.discipline ?? 'Not commissioned'}</dd></div><div><dt>Sockets / brass</dt><dd>${budget ? `${budget.slots} / ${budget.capacity}` : 'Chosen by architect'}</dd></div><div><dt>Proof suite</dt><dd>3 open + 42 sealed</dd></div><div><dt>Edition</dt><dd>${state.seed}</dd></div></dl>
      <p class="sg-lesson">${e(chapter.text)}</p>
      ${state.phase === 'won' || state.phase === 'lost' ? `<section class="sg-ending" data-ending><h3>${state.phase === 'won' ? 'Master of the press' : 'An unfinished work'}</h3><p>${e(state.ending)}</p></section>` : ''}
      <h4 class="sg-ledger-heading">Seals in the ledger / ${state.seals.length} of 5</h4>
      <ol class="sg-ledger">${state.seals.length ? state.seals.map(seal => `<li><b>${e(challengeById(seal.config.challengeId).name)}</b><span>${seal.program.map(glyph => GLYPHS[glyph].name).join(' / ')}</span><span>${seal.firings} firing${seal.firings === 1 ? '' : 's'}; ${seal.config.discipline}</span></li>`).join('') : '<li>No earned seals yet.</li>'}</ol>
      ${state.phase === 'working' ? '<button data-surrender>Leave unfinished</button>' : ''}`;
  }
  function paintProof() {
    const state = options.state(), item = currentCase(), error = syntaxError(state.program);
    const run = item && !error ? execute(state.program, item.input) : null;
    const cell = selected >= 0 ? run?.trace[tick]?.[selected] : null;
    const result = state.result, witness = result?.witness;
    proofContent.innerHTML = `
      <p class="sg-eyebrow">LOCAL EXECUTION / TICK ${tick + 1}</p>
      <p>${error ? e(error) : result ? `${result.matched} of ${result.total} complete streams match. ${result.passed ? 'The seal is earned by execution.' : 'The seal is not earned.'}` : 'Fire spell to judge the complete suite. Tracing the three open specimens is free.'}</p>
      ${item ? `<h3>${e(item.id)} ${item.heldOut ? '/ formerly sealed' : '/ open specimen'}</h3><div class="sg-proof-streams"><label>Input</label><div>${streamMarkup(item.input)}</div><label>Required</label><div>${streamMarkup(item.expected)}</div><label>Your spell</label><div>${run ? streamMarkup(run.output) : 'Invalid branch grammar'}</div></div>` : '<p>No commission has been accepted yet.</p>'}
      ${cell ? `<h3>Socket ${selected + 1} / ${GLYPHS[cell.glyph].name}</h3><dl class="sg-constraints"><div><dt>Input</dt><dd>${describeBeam(cell.input)}</dd></div><div><dt>Output</dt><dd>${describeBeam(cell.output)}</dd></div><div><dt>Memory before</dt><dd>${describeBeam(cell.memoryBefore)}</dd></div><div><dt>Memory after</dt><dd>${describeBeam(cell.memoryAfter)}</dd></div><div><dt>Branch register</dt><dd>${cell.branchOpen ? describeBeam(cell.branch) : 'closed'}</dd></div></dl><p>${e(GLYPHS[cell.glyph].rule)}</p>` : '<p>Select a tile on the bench to inspect its memory and branch register here.</p>'}
      ${witness ? `<section class="sg-counterexample" data-counterexample><h3>Counterexample / ${e(witness.caseId)}</h3><p>Tick ${witness.tick + 1}: expected <b>${describeBeam(witness.expected[witness.tick])}</b>; received <b>${describeBeam(witness.actual[witness.tick])}</b>.</p><p>${witness.heldOut ? 'This sealed specimen is now inspectable because your spell failed it.' : 'This failure is from an open specimen.'}</p><button data-inspect-witness>Load counterexample on bench</button></section>` : ''}
      <h3>Firing history</h3><ol class="sg-ledger">${state.attempts.slice(-14).map(attempt => `<li><b>${e(challengeById(attempt.challengeId).name)} / ${attempt.matched} of ${attempt.total}</b><span>${attempt.program.length ? attempt.program.map(glyph => GLYPHS[glyph].name).join(' / ') : 'Empty program'}</span><span>${attempt.mistake === 'none' ? 'A sound inscription' : `Observed mismatch: ${attempt.mistake}`}</span></li>`).join('') || '<li>No mana spent.</li>'}</ol>`;
  }
  function paint() {
    const state = options.state(), busy = options.busy(), working = state.phase === 'working';
    const challenge = state.config ? challengeById(state.config.challengeId) : null;
    const budget = state.config ? limits(state.config) : null;
    if (lastState !== state) {
      stop();
      if (lastState?.config?.challengeId !== state.config?.challengeId || state.config === null) { sample = 0; tick = 0; selected = -1; }
      if (selected >= state.program.length) selected = state.program.length - 1;
      lastState = state;
    }
    root.dataset.phase = state.phase;
    root.dataset.challengeId = state.config?.challengeId ?? '';
    text('[data-mana]', `${state.mana} mana`);
    text('[data-hints]', `${state.hints} hints`);
    text('[data-proof-count]', `${state.seals.length} / 5`);
    const chapterIndex = challenge?.chapter ?? state.chapter;
    text('[data-chapter]', `PLATE ${CHAPTERS[chapterIndex].numeral} / ${CHAPTERS[chapterIndex].lesson.toUpperCase()}`);
    text('[data-challenge]', state.phase === 'won' ? 'Master of the press' : state.phase === 'lost' ? 'An unfinished work' : challenge?.name ?? 'Awaiting a commission');
    for (const seal of root.querySelectorAll<HTMLElement>('[data-seal]')) {
      const index = Number(seal.dataset.seal);
      seal.dataset.earned = String(index < state.seals.length);
      seal.dataset.current = String(index === state.chapter);
      seal.setAttribute('aria-label', `${CHAPTERS[index].name}: ${index < state.seals.length ? 'earned' : index === state.chapter ? 'current' : 'not yet earned'}`);
    }
    const palette = challenge?.palette ?? CHALLENGES[0].palette;
    for (const glyph of GLYPH_IDS) {
      const button = query<HTMLButtonElement>(root, `[data-glyph="${glyph}"]`);
      button.hidden = !palette.includes(glyph);
      button.disabled = busy || !working || !budget || state.program.length >= budget.slots || programCost(state.program) + GLYPHS[glyph].cost > budget.capacity;
      query(button, '[data-key-for]').textContent = String(palette.indexOf(glyph) + 1);
    }
    const programKey = `${state.program.join(',')}:${budget?.slots ?? 3}`;
    if (programKey !== lastProgram) {
      query(root, '[data-program]').innerHTML = Array.from({ length: budget?.slots ?? 3 }, (_, index) => {
        const glyph = state.program[index];
        return glyph ? `<button class="sg-tile" data-socket="${index}" draggable="true" aria-label="Socket ${index + 1}: ${GLYPHS[glyph].name}" aria-pressed="${index === selected}">
          <span class="sg-socket-number">${index + 1}</span>${glyphArtwork(glyph)}<strong>${GLYPHS[glyph].name}</strong><span class="sg-tile-output" data-tile-beam></span></button>` :
          `<div class="sg-empty-socket" aria-label="Empty socket ${index + 1}"><span>${index + 1}</span><span class="sg-registration" aria-hidden="true">+</span></div>`;
      }).join('');
      lastProgram = programKey;
    }
    text('[data-capacity]', `${state.program.length}/${budget?.slots ?? 3} sockets${budget ? ` / ${programCost(state.program)}/${budget.capacity} brass` : ''}`);
    text('[data-selection]', selected >= 0 ? `Tile ${selected + 1}: ${GLYPHS[state.program[selected]].name}` : 'Select a tile');
    disabled('[data-left]', !working || busy || selected <= 0);
    disabled('[data-right]', !working || busy || selected < 0 || selected >= state.program.length - 1);
    disabled('[data-remove]', !working || busy || selected < 0);
    disabled('[data-clear]', !working || busy || !state.program.length);
    disabled('[data-compile]', !working || busy);
    disabled('[data-hint]', busy || legalHints(state).length === 0);
    query<HTMLElement>(root, '[data-compile]').hidden = state.phase !== 'working';
    const next = query<HTMLButtonElement>(root, '[data-architect]');
    next.hidden = state.phase === 'working';
    next.disabled = busy || state.phase === 'won' || state.phase === 'lost';
    next.textContent = state.phase === 'won' ? 'Five seals earned' : state.phase === 'lost' ? 'Campaign ended' : state.seals.length ? 'Next commission' : 'Invite architect';
    text('[data-firings]', budget ? `${Math.max(0, budget.firings - state.firings)} firings left` : 'Model required');
    const selector = query<HTMLSelectElement>(root, '[data-specimen]');
    const witnessOption = selector.querySelector('[value="3"]');
    if (state.result?.witness && !witnessOption) {
      const option = document.createElement('option'); option.value = '3'; option.textContent = 'Counterexample'; selector.append(option);
    } else if (!state.result?.witness && witnessOption) { witnessOption.remove(); if (sample === 3) sample = 0; }
    selector.value = String(sample);
    const notes = notesMarkup(); body.innerHTML = notes; briefContent.innerHTML = notes;
    if (state.phase === 'won' || state.phase === 'lost') announce(state.ending);
    else if (state.result?.passed) announce(`Seal earned: ${state.result.total} of ${state.result.total} streams match. Ask for the next commission.`);
    else if (state.result) announce(state.result.syntax ?? `${state.result.matched} of ${state.result.total} streams match. Inspect the counterexample before another firing.`);
    else if (state.hint) announce(state.hint);
    else if (state.phase === 'working') announce('Compose left to right. Open specimens are free; Fire spell judges all 45 and spends 1 mana.');
    else if (notice) text('[data-notice]', notice);
    paintTrace();
  }
  function select(at: number, focus = false) {
    selected = at;
    paint();
    if (focus) root.querySelector<HTMLElement>(`[data-socket="${selected}"]`)?.focus({ preventScroll: true });
  }
  function edit(command: Command, focusAt?: number) {
    if (options.busy()) { announce('The architect is considering this plate. Cancel its turn before editing.'); return; }
    if (options.command(command) && focusAt !== undefined) select(Math.min(focusAt, options.state().program.length - 1), true);
  }
  function loadWitness() {
    const witness = options.state().result?.witness;
    if (!witness) { announce('Fire a failing spell to obtain a counterexample.'); return; }
    stop(); sample = 3; tick = witness.tick;
    proof.close(); paint();
    announce(`Inspecting ${witness.caseId}, tick ${tick + 1}. Select a tile, then Inspect proof for its internal values.`);
  }
  function click(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target || !root.contains(target) || target.matches(':disabled')) return;
    const state = options.state();
    if (target.dataset.glyph) {
      const glyph = GLYPH_IDS.find(id => id === target.dataset.glyph);
      if (glyph) edit({ type: 'inscribe', glyph, at: state.program.length });
    } else if (target.dataset.socket !== undefined) select(Number(target.dataset.socket));
    else if (target.dataset.tick !== undefined) { stop(); tick = Number(target.dataset.tick); paintTrace(); }
    else if (target.hasAttribute('data-left')) edit({ type: 'move', from: selected, to: selected - 1 }, selected - 1);
    else if (target.hasAttribute('data-right')) edit({ type: 'move', from: selected, to: selected + 1 }, selected + 1);
    else if (target.hasAttribute('data-remove')) edit({ type: 'remove', at: selected }, selected);
    else if (target.hasAttribute('data-clear')) edit({ type: 'clear' });
    else if (target.hasAttribute('data-compile')) edit({ type: 'compile' });
    else if (target.hasAttribute('data-architect')) options.architect('commission');
    else if (target.hasAttribute('data-hint')) options.architect('hint');
    else if (target.hasAttribute('data-play')) play();
    else if (target.hasAttribute('data-proof')) { paintProof(); proof.open(); }
    else if (target.hasAttribute('data-inspect-witness')) loadWitness();
    else if (target.hasAttribute('data-surrender')) surrender.open();
    else if (target.hasAttribute('data-confirm-surrender')) { edit({ type: 'surrender' }); surrender.close(); brief.close(); }
    else if (target.hasAttribute('data-same-edition') || target.hasAttribute('data-new-edition')) {
      stop(); restart.close(); options.restart(target.hasAttribute('data-new-edition')); announce('A fresh plate. Invite the architect when ready.'); paint();
    }
  }
  root.addEventListener('click', click, { signal });
  query(root, '[data-specimen]').addEventListener('change', event => {
    stop(); sample = Number((event.target as HTMLSelectElement).value); tick = 0; paintTrace();
  }, { signal });
  root.addEventListener('dragstart', event => {
    const socket = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-socket]') : null;
    if (!socket || options.busy() || options.state().phase !== 'working') { event.preventDefault(); return; }
    dragged = Number(socket.dataset.socket);
    event.dataTransfer?.setData('text/plain', String(dragged));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }, { signal });
  root.addEventListener('dragover', event => {
    if (dragged >= 0 && event.target instanceof Element && event.target.closest('[data-socket]')) event.preventDefault();
  }, { signal });
  root.addEventListener('drop', event => {
    const socket = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-socket]') : null;
    if (socket && dragged >= 0) {
      event.preventDefault(); const to = Number(socket.dataset.socket);
      if (to !== dragged) edit({ type: 'move', from: dragged, to }, to);
    }
    dragged = -1;
  }, { signal });
  root.addEventListener('dragend', () => { dragged = -1; }, { signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || document.querySelector('dialog:modal') ||
      (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"],[role="textbox"]')) ||
      event.ctrlKey || event.metaKey || !root.contains(document.activeElement)) return;
    const state = options.state(), palette = state.config ? challengeById(state.config.challengeId).palette : [];
    if (event.key === '?') { event.preventDefault(); rules.open(); return; }
    if (state.phase !== 'working' || options.busy()) return;
    const digit = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (digit >= 0 && palette[digit] && !event.altKey) {
      event.preventDefault(); edit({ type: 'inscribe', glyph: palette[digit], at: state.program.length });
    } else if (event.key === 'c' && !event.altKey) { event.preventDefault(); edit({ type: 'compile' }); }
    else if (event.key === 'Delete' && selected >= 0) { event.preventDefault(); edit({ type: 'remove', at: selected }, selected); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const to = Math.max(0, Math.min(state.program.length - 1, selected + (event.key === 'ArrowLeft' ? -1 : 1)));
      if (!state.program.length) return;
      event.preventDefault();
      if (event.altKey && to !== selected && selected >= 0) edit({ type: 'move', from: selected, to }, to);
      else select(to, true);
    }
  }, { signal });
  page.onCleanup(stop);
  paint();
  return {
    paint, announce, agentHost: query<HTMLElement>(root, '[data-agent-host]'), notebookTrigger: query<HTMLElement>(root, '[data-notebook]'),
    setReducedMotion(value: boolean) { reducedMotion = value; if (value) { stop(); paintTrace(); } },
    setPaused(value: boolean) { paused = value; if (value) { stop(); paintTrace(); } },
  };
}
