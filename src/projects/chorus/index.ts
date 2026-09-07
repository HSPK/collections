import './style.css';
import { holdGainAtTime } from '../../core/audio';
import { createAgentConsole } from '../../core/agents';
import { createGameNotebook } from '../../core/games/notebook';
import { GameSession } from '../../core/games/session';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { request } from './agent';
import { describe, NODES, NODE_IDS, PROFILES, SHAPES } from './data';
import type { Mode, Shape, Signal } from './data';
import { definition, ruleMessage, terminal } from './engine';
import type { TurnInput } from './engine';
import { createField, draftReading, fieldMarkup, glyph } from './render';

interface Draft { slots: [Shape | null, Shape | null]; duration: number; phase: Mode; selected: number }

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'chorus');
  const root = page.root;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <header class="chorus-header"><div class="chorus-wordmark"><h1>Chorus</h1><span>AN EXERCISE IN FIRST CONTACT</span></div>
      <nav aria-label="Chorus resources"><button data-open-lexicon>Lexicon</button><button data-open-guide>Guide</button><button data-open-notebook>Save</button></nav></header>
    <div class="chorus-campaign"><p data-stage>01 / Calibration</p><div class="chorus-resources"><span data-trust>Trust 4/6</span><span data-bandwidth>Band 18/18</span></div></div>
    <div class="chorus-field" data-project-preview data-field>${fieldMarkup()}</div>
    <section class="chorus-composer" aria-label="Signal composer">
      <div class="chorus-draft-heading"><span>YOUR SIGNAL</span><output data-draft-reading>Choose two glyphs. Order matters.</output></div>
      <div class="chorus-instrument">
        <div class="chorus-slots" aria-label="Ordered glyphs">
          <button data-slot="0" aria-label="Select first glyph slot" aria-pressed="true"><span>1</span><i data-slot-glyph="0"></i></button>
          <span class="chorus-order-arrow" aria-hidden="true">&rarr;</span>
          <button data-slot="1" aria-label="Select second glyph slot" aria-pressed="false"><span>2</span><i data-slot-glyph="1"></i></button>
        </div>
        <div class="chorus-palette" aria-label="Glyph palette">${SHAPES.map((shape, i) => `<button data-glyph="${shape}" aria-label="Add ${shape} glyph" title="${i + 1}: ${shape}">${glyph(shape, 34)}<span>${shape}</span></button>`).join('')}</div>
        <fieldset class="chorus-duration"><legend>Pulse length</legend><div>${[1, 2, 3].map(value => `<button data-duration="${value}" aria-label="${value} ${value === 1 ? 'pulse' : 'pulses'}" aria-pressed="${value === 1}">${value}</button>`).join('')}</div></fieldset>
        <fieldset class="chorus-phase"><legend>Relative phase</legend><div><button data-phase="offer" aria-pressed="true"><span aria-hidden="true">=</span> Joined</button><button data-phase="ask" aria-pressed="false"><span aria-hidden="true">~</span> Alternating</button></div></fieldset>
        <div class="chorus-edit"><button data-swap title="X: swap nouns">Swap</button><button data-undo title="Ctrl+Z: undo draft edit">Undo</button><button data-clear title="Backspace: erase selected slot">Clear</button></div>
        <button class="chorus-transmit" data-transmit>Open contact <span aria-hidden="true">&nearr;</span></button>
      </div>
    </section>
    <div class="chorus-feedback"><p data-feedback role="status" aria-live="polite"></p><button data-study>Show again</button></div>
    <footer class="chorus-footer"><div data-agent-host></div><div class="chorus-footer-actions"><button data-sound aria-pressed="false">Sound off</button><button data-restart>Restart</button><button data-encounter>New tide</button></div></footer>
    <section data-lexicon-content class="chorus-notes"><p>Test a name against a witnessed energy path. Hypotheses are free; the world does not move. Confirmed words make your draft readable.</p><div data-lexicon-entries></div>
      <h3>Observed grammar</h3><p><strong>Identity:</strong> shape names a body; color repeats identity, never changes meaning.</p>
      <p><strong>Order:</strong> first body speaks to the second. <strong>Length:</strong> each held interval means one pulse.</p>
      <p><strong>Phase:</strong> joined means offers TO; alternating means asks FROM. Answer an ask with the same length, reversed nouns, joined phase.</p>
      <h3>Demonstrations</h3><div data-evidence></div><h3>Contact record</h3><ol data-history></ol>
    </section>
    <section data-guide-content class="chorus-guide">
      <p class="chorus-guide-lede">Do not find the right words.<br>Find a way to mean the same thing.</p>
      <h3>01 / Calibration</h3><p>Open contact. A real model chooses a demonstration, and light shows its physical meaning. Rebuild the two glyphs, their length and their phase. Send two exact echoes. The second lesson introduces the third body.</p>
      <h3>02 / Translation</h3><p>An alternating signal is a request: its first body asks FROM its second. Reply with an OFFER: reverse the two glyphs, preserve pulse length, choose Joined. Translate two requests. The counterpart chooses which relations and quantities to test.</p>
      <h3>03 / A common beacon</h3><p>Every body needs exactly four pulses. Only surplus can move into a deficit, at most two pulses at once. Answer the incoming request to transfer energy. A different feasible offer is a counteroffer: the counterpart can accept it or negotiate another request. Send an alternating signal to ask for a new arrangement without losing trust.</p>
      <p><strong>Eighteen intervals, six trust.</strong> Each accepted model turn uses one interval. An incorrect echo, translation or impossible offer costs one trust. Show again spends one interval, not trust. Hypotheses, draft edits and undo are free. Nothing is spent on a cancelled, invalid or failed model turn. The last interval may still complete the beacon.</p>
      <h3>Use the instrument</h3><p>Choose a slot, then pick a glyph from the rail or a body in the field. The rail advances after a pick. Set pulse length and phase. Swap reverses the nouns; Undo restores a draft edit. You can edit while waiting, but only the sent snapshot is evaluated.</p>
      <p><strong>Keyboard:</strong> 1/2/3 pick ring/fork/knot; left/right select a slot; +/minus change length; Space flips phase; X swaps; Backspace clears a slot; Ctrl/Cmd+Z undoes; Enter transmits when not focused on a button. Shortcuts pause inside dialogs and text fields. Every control is also reachable with Tab.</p>
      <p>Sound is optional and starts only with consent. Color is redundant: glyph shape, static phase markers, labels and pulse bars carry the full language, including with reduced motion.</p>
      <p>Restart repeats this tide. New tide rotates three authored starting reserves and counterpart temperaments. Save opens automatic replay storage, native export and import. An ending is local arithmetic, never a model's claim.</p>
      <h3>Connection &amp; privacy</h3><p>This is an actual AI counterpart, not a scripted offline substitute. Configure a tool-capable OpenAI-compatible model with Model. The model sees only this fictional encounter, tested vocabulary, bounded signals and legal actions. There are no automatic requests. A turn permits one correction, at most two requests of 1,536 completion tokens within 60 seconds. Provider costs may apply.</p>
    </section>`;
  const get = <T extends Element>(selector: string) => query<T>(root, selector);
  const session = new GameSession(definition, 0);
  let draft: Draft = { slots: [null, null], duration: 1, phase: 'offer', selected: 0 };
  const undo: Draft[] = [];
  let busy = false;
  let sound: AudioContext | undefined;
  let soundOn = false;
  const voices = new Set<OscillatorNode>();
  const feedback = get<HTMLElement>('[data-feedback]');
  const announce = (message: string) => { feedback.textContent = message; };

  function signalDraft(): Signal | null {
    const [first, second] = draft.slots;
    return first && second ? { glyphs: [first, second], duration: draft.duration, phase: draft.phase } : null;
  }
  function edit(change: () => void) {
    undo.push({ ...draft, slots: [...draft.slots] });
    if (undo.length > 80) undo.shift();
    change();
    renderDraft();
  }
  function pick(shape: Shape) {
    edit(() => { draft.slots[draft.selected] = shape; draft.selected = 1 - draft.selected; });
  }
  const field = createField(get('[data-field]'), context, pick, page.signal);
  page.onCleanup(field.destroy);

  function renderDraft() {
    for (const index of [0, 1]) {
      const shape = draft.slots[index];
      get(`[data-slot-glyph="${index}"]`).innerHTML = shape ? glyph(shape, 36) : '<span class="chorus-empty">+</span>';
      get(`[data-slot="${index}"]`).setAttribute('aria-pressed', String(draft.selected === index));
      get(`[data-slot="${index}"]`).setAttribute('aria-label', `Select ${index === 0 ? 'first' : 'second'} glyph slot${shape ? `: ${shape}` : ': empty'}`);
    }
    for (const length of [1, 2, 3]) get(`[data-duration="${length}"]`).setAttribute('aria-pressed', String(draft.duration === length));
    for (const phase of ['offer', 'ask']) get(`[data-phase="${phase}"]`).setAttribute('aria-pressed', String(draft.phase === phase));
    get('[data-draft-reading]').textContent = draftReading(signalDraft(), session.state);
    get<HTMLButtonElement>('[data-undo]').disabled = !undo.length;
    renderControls();
  }
  function renderControls() {
    const state = session.state;
    const send = get<HTMLButtonElement>('[data-transmit]');
    send.disabled = busy || terminal(state) || (state.active !== null && signalDraft() === null);
    send.textContent = busy ? 'Listening...' : terminal(state) ? state.phase === 'won' ? 'Beacon restored' : 'Contact ended'
      : state.active ? 'Transmit' : state.phase === 'calibration' ? 'Open contact' : 'Listen again';
    get<HTMLButtonElement>('[data-study]').disabled = busy || !state.active || terminal(state);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-test-hypothesis]')) {
      const shape = button.dataset.testHypothesis as Shape;
      button.disabled = busy || terminal(state) || !state.evidence.some(entry => entry.signal.glyphs.includes(shape));
    }
  }
  function render() {
    const state = session.state;
    field.render(state);
    get('[data-stage]').textContent = state.phase === 'calibration' ? `01 / Calibration ${state.calibrated}/2`
      : state.phase === 'translation' ? `02 / Translation ${state.translated}/2`
        : state.phase === 'negotiation' ? `03 / Cooperation ${state.repairs}` : state.phase === 'won' ? '04 / A common sky' : '04 / Silence';
    root.dataset.phase = state.phase;
    get('[data-trust]').textContent = `Trust ${state.trust}/6`;
    get('[data-bandwidth]').textContent = `Band ${state.bandwidth}/18`;
    get('[data-bandwidth]').setAttribute('aria-label', `Bandwidth ${state.bandwidth} of 18 intervals`);
    announce(state.feedback);
    get('[data-lexicon-entries]').innerHTML = SHAPES.map(shape => {
      const hypothesis = state.hypotheses[shape];
      const available = state.evidence.some(entry => entry.signal.glyphs.includes(shape));
      return `<div class="chorus-lexicon-entry">${glyph(shape, 46)}<label>${shape}<select aria-label="Meaning of ${shape}" data-guess="${shape}">${NODE_IDS.map(id => `<option value="${id}"${(hypothesis?.guess ?? 'well') === id ? ' selected' : ''}>${NODES[id].name}</option>`).join('')}</select></label>
        <button data-test-hypothesis="${shape}">Test</button><p role="status" aria-live="polite">${state.lexicon[shape] ? `Confirmed: ${NODES[state.lexicon[shape]!].name}` : hypothesis ? 'Contradicted. Try another name.' : available ? 'Observed; not yet named.' : 'Await a demonstration.'}</p></div>`;
    }).join('');
    get('[data-evidence]').innerHTML = state.evidence.length ? [...state.evidence].reverse().map(entry => `<div class="chorus-evidence">${entry.signal.glyphs.map(shape => glyph(shape, 30)).join('')}<span>${escapeMarkup(describe(entry.meaning))}. ${entry.signal.duration} pulses, ${entry.signal.phase === 'ask' ? 'alternating' : 'joined'}.</span></div>`).join('') : '<p>No witnessed signals yet.</p>';
    get('[data-history]').innerHTML = state.history.map(entry => `<li>${escapeMarkup(entry)}</li>`).join('');
    if (state.active?.intent === 'contrast' && state.evidence.length > 1) {
      const previous = state.evidence[state.evidence.length - 2];
      get('[data-field-caption]').textContent = `Before: ${describe(previous.meaning)}. Now: ${describe(state.active)}.`;
    }
    get<HTMLButtonElement>('[data-encounter]').title = `Current tide: ${PROFILES[state.seed % PROFILES.length].name}. Rotate to the next encounter.`;
    renderDraft();
  }
  const agent = createAgentConsole(page, {
    gameId: 'chorus', host: get('[data-agent-host]'),
    onBusyChange(value) { busy = value; renderControls(); },
  });
  createWorkspaceDialog(page, {
    id: 'chorus-lexicon', title: 'Field lexicon', content: [get('[data-lexicon-content]')],
    triggers: [get('[data-open-lexicon]')], className: 'chorus-dialog',
  });
  createWorkspaceDialog(page, {
    id: 'chorus-guide', title: 'A way to mean', content: [get('[data-guide-content]')],
    triggers: [get('[data-open-guide]')], className: 'chorus-dialog',
  });

  function playSignal() {
    if (!soundOn || !sound || sound.state !== 'running' || !session.state.active) return;
    const active = session.state.active;
    const start = sound.currentTime + .03;
    [active.from, active.to].forEach((id, index) => {
      const oscillator = sound!.createOscillator();
      const gain = sound!.createGain();
      const at = start + index * .24;
      oscillator.type = 'sine';
      oscillator.frequency.value = [220, 293.66, 440][NODE_IDS.indexOf(id)];
      oscillator.connect(gain).connect(sound!.destination);
      holdGainAtTime(gain.gain, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.045, at + .035);
      gain.gain.linearRampToValueAtTime(0, at + active.amount * .18);
      oscillator.start(at);
      oscillator.stop(at + active.amount * .18 + .05);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    });
  }
  async function turn(input: TurnInput) {
    if (busy) return;
    try {
      const accepted = await agent.turn({
        ...request(session.state, input), label: input.type === 'study' ? 'A teaching gesture' : 'The other intelligence',
        validate: plan => { session.preview({ type: 'turn', input, plan }); },
        getRevision: () => session.revision,
        commit: plan => { session.dispatch({ type: 'turn', input, plan }); },
      });
      if (accepted) playSignal();
    } catch (error) { announce(ruleMessage(error)); }
  }
  function transmit() {
    if (busy || terminal(session.state)) return;
    if (!session.state.active) { void turn({ type: 'contact' }); return; }
    const signal = signalDraft();
    if (!signal) { announce('Choose two glyphs before transmitting.'); return; }
    void turn({ type: 'transmit', signal });
  }
  function reset(next = false) {
    agent.cancel();
    for (const voice of voices) voice.stop();
    draft = { slots: [null, null], duration: 1, phase: 'offer', selected: 0 };
    undo.length = 0;
    session.reset(next ? (session.seed + 1) % PROFILES.length : session.seed);
    render();
  }
  function undoDraft() {
    const previous = undo.pop();
    if (previous) { draft = previous; renderDraft(); }
    else announce('No draft edits to undo.');
  }
  for (const shape of SHAPES) get(`[data-glyph="${shape}"]`).addEventListener('click', () => pick(shape), { signal: page.signal });
  for (const index of [0, 1]) get(`[data-slot="${index}"]`).addEventListener('click', () => { draft.selected = index; renderDraft(); }, { signal: page.signal });
  for (const duration of [1, 2, 3]) get(`[data-duration="${duration}"]`).addEventListener('click', () => edit(() => { draft.duration = duration; }), { signal: page.signal });
  for (const phase of ['offer', 'ask'] as const) get(`[data-phase="${phase}"]`).addEventListener('click', () => edit(() => { draft.phase = phase; }), { signal: page.signal });
  get('[data-swap]').addEventListener('click', () => edit(() => { draft.slots.reverse(); }), { signal: page.signal });
  get('[data-undo]').addEventListener('click', undoDraft, { signal: page.signal });
  get('[data-clear]').addEventListener('click', () => edit(() => { draft.slots = [null, null]; draft.selected = 0; }), { signal: page.signal });
  get('[data-transmit]').addEventListener('click', transmit, { signal: page.signal });
  get('[data-study]').addEventListener('click', () => { void turn({ type: 'study' }); }, { signal: page.signal });
  get('[data-restart]').addEventListener('click', () => reset(), { signal: page.signal });
  get('[data-encounter]').addEventListener('click', () => reset(true), { signal: page.signal });
  get('[data-lexicon-entries]').addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-test-hypothesis]') : null;
    if (!button || busy) return;
    const shape = SHAPES.find(item => item === button.dataset.testHypothesis);
    if (!shape) return;
    const select = get<HTMLSelectElement>(`[data-guess="${shape}"]`);
    const node = NODE_IDS.find(id => id === select.value);
    if (!node) return;
    try {
      session.dispatch({ type: 'hypothesis', shape, node });
      get<HTMLButtonElement>(`[data-test-hypothesis="${shape}"]`).focus();
    } catch (error) { announce(ruleMessage(error)); }
  }, { signal: page.signal });
  get('[data-sound]').addEventListener('click', async () => {
    try {
      if (!sound) sound = new AudioContext();
      soundOn = !soundOn;
      if (soundOn) await sound.resume();
      else {
        for (const voice of voices) voice.stop();
        await sound.suspend();
      }
      if (page.signal.aborted) return;
      get('[data-sound]').textContent = soundOn ? 'Sound on' : 'Sound off';
      get('[data-sound]').setAttribute('aria-pressed', String(soundOn));
      if (soundOn) playSignal();
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      soundOn = false;
      announce(`Sound could not start (${error.name}). The full language remains visible.`);
    }
  }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog:modal') || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); undoDraft(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['1', '2', '3'].includes(key)) { event.preventDefault(); pick(SHAPES[Number(key) - 1]); }
    else if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); draft.selected = key === 'arrowleft' ? 0 : 1; renderDraft(); }
    else if (key === '+' || key === '=' || key === '-') { event.preventDefault(); edit(() => { draft.duration = Math.max(1, Math.min(3, draft.duration + (key === '-' ? -1 : 1))); }); }
    else if (key === 'x') { event.preventDefault(); edit(() => { draft.slots.reverse(); }); }
    else if (key === 'backspace') { event.preventDefault(); edit(() => { draft.slots[draft.selected] = null; }); }
    else if (!(event.target instanceof Element && event.target.closest('button,[role="button"],a'))) {
      if (key === ' ') { event.preventDefault(); edit(() => { draft.phase = draft.phase === 'offer' ? 'ask' : 'offer'; }); }
      else if (key === 'enter') { event.preventDefault(); transmit(); }
    }
  }, { signal: page.signal });

  page.onCleanup(session.subscribe(render));
  render();
  createGameNotebook(page, {
    gameId: 'chorus', session, trigger: get('[data-open-notebook]'),
    beforeRestore: () => {
      agent.cancel();
      undo.length = 0;
      draft = { slots: [null, null], duration: 1, phase: 'offer', selected: 0 };
    },
    afterRestore: render, onNotice: announce,
  });
  page.onCleanup(() => {
    for (const voice of voices) { voice.onended = null; voice.stop(); voice.disconnect(); }
    voices.clear();
    if (sound && sound.state !== 'closed') void sound.close();
  });
  return { destroy: page.destroy, reset: () => reset(), setPaused: field.setPaused };
}
