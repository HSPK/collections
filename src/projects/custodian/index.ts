import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { arrivalRequest, bargainRequest } from './agent';
import { CAMPAIGN, REGULATIONS, TRAVELLERS } from './data';
import type { Verdict } from './data';
import { canInspect, canStamp, createSession, totalScore, won } from './engine';
import type { Channel, Command, Question } from './engine';
import { HELP, PANES, deskMarkup, paneMarkup, rulesMarkup, updateScan } from './render';
import type { Pane } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'custodian');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  const session = createSession();
  let selected: Pane = 'dossier';
  let busy = false;
  let sweep = 0;
  let sceneRevision = -1;
  let lastCase = 0;
  root.innerHTML = `<div class="cu-shell">
    <header class="cu-header"><div><p class="cu-kicker">INTERDIMENSIONAL CUSTOMS / PORT 73</p><h1>Nothing to Declare<span>.</span></h1></div>
      <nav aria-label="Desk utilities"><button type="button" data-action="file">File</button><button type="button" data-action="rules">Rules</button><button type="button" data-action="help">Help</button><button type="button" data-notebook>Notebook</button><button type="button" data-action="restart">Restart</button></nav></header>
    <div class="cu-connection" data-connection></div>
    <section class="cu-ledger" aria-label="Shift resources">
      <div><span>Time</span><strong data-resource="minutes"></strong></div>
      <div><span>Credits</span><strong data-resource="credits"></strong></div>
      <div><span>Scans</span><strong data-resource="scans"></strong></div>
      <div><span>Trust</span><strong data-resource="trust"></strong></div>
      <div><span>Score</span><strong data-resource="score"></strong></div>
    </section>
    <main class="cu-main">
      <section class="cu-station" aria-label="Customs inspection desk">
        <div class="cu-casebar"><div><span class="cu-kicker" data-case-number></span><h2 data-case-name></h2></div><button type="button" class="cu-call" data-action="call">Call traveller</button></div>
        <div class="cu-scene" data-project-preview data-scene></div>
        <div class="cu-sweep" data-sweep-panel hidden><div class="cu-sweep-controls"><label for="cu-sweep">Spectral sweep</label><input id="cu-sweep" type="range" min="0" max="100" value="0" step="1" aria-label="Spectral sweep"><button type="button" data-action="sweep">Full sweep</button></div><p data-cu-scan-readout aria-live="polite"></p></div>
        <div class="cu-instruments" aria-label="Inspection instruments">
          <button type="button" data-inspect="weigh" title="Weigh parcel (W). One minute."><strong>Scale</strong><span>1 min</span></button>
          <button type="button" data-inspect="thermal" title="Thermal reading (T). One minute."><strong>Thermal</strong><span>1 min</span></button>
          <button type="button" data-inspect="registry" title="Official licence registry (L). One minute."><strong>Registry</strong><span>1 min</span></button>
          <button type="button" data-inspect="seal" title="Magnify container seal (M). One minute."><strong>Seal</strong><span>1 min</span></button>
          <button type="button" data-inspect="scan" title="Spectral scan (X). Two minutes and one charge."><strong>Scan</strong><span>2m / 1ch</span></button>
          <button type="button" data-action="refill" title="Buy one scanner charge. Four credits and one minute."><strong>Refill</strong><span>4cr / 1m</span></button>
        </div>
        <div class="cu-stamps" aria-label="Final ruling">
          <button type="button" data-verdict="admit">Admit<span>Entry</span></button>
          <button type="button" data-verdict="quarantine">Quarantine<span>2 credits</span></button>
          <button type="button" data-verdict="return">Return<span>Refuse</span></button>
        </div>
      </section>
      <aside class="cu-sidebar" aria-label="Case documents"><nav class="cu-tabs" aria-label="Select document">${PANES.map(pane => `<button type="button" data-pane="${pane}" aria-pressed="${pane === selected}">${pane === 'dossier' ? 'Paper' : pane === 'parley' ? 'Parley' : pane === 'audit' ? 'Audit' : 'Evidence'}</button>`).join('')}</nav><section class="cu-file-body" data-file-body tabindex="0" aria-label="Current document"></section></aside>
    </main>
    <footer class="cu-footer"><p data-notice role="status" aria-live="polite">Model required. Read the unsigned brief, then call the first traveller.</p><span aria-hidden="true">KEEP THE BORDER HUMAN.</span></footer>
  </div>`;

  const scene = query<HTMLElement>(root, '[data-scene]');
  const fileBody = query<HTMLElement>(root, '[data-file-body]');
  const notice = query<HTMLElement>(root, '[data-notice]');
  const call = query<HTMLButtonElement>(root, '[data-action="call"]');
  const slider = query<HTMLInputElement>(root, '#cu-sweep');
  const sweepPanel = query<HTMLElement>(root, '[data-sweep-panel]');
  const fileContent = document.createElement('section');
  fileContent.className = 'cu-file-modal';
  fileContent.innerHTML = `<nav class="cu-tabs" aria-label="Select enlarged document">${PANES.map(pane => `<button type="button" data-pane="${pane}">${pane === 'dossier' ? 'Paper' : pane === 'parley' ? 'Parley' : pane === 'audit' ? 'Audit' : 'Evidence'}</button>`).join('')}</nav><div data-modal-body></div>`;
  const modalBody = query<HTMLElement>(fileContent, '[data-modal-body]');
  const fileDialog = createWorkspaceDialog(page, { id: 'cu-file', title: 'Case file', content: [fileContent], className: 'cu-dialog' });
  const ruleContent = document.createElement('section');
  const ruleDialog = createWorkspaceDialog(page, { id: 'cu-rules', title: 'Port regulations & cargo catalogue', content: [ruleContent], className: 'cu-dialog' });
  const guide = document.createElement('section');
  guide.innerHTML = HELP;
  const helpDialog = createWorkspaceDialog(page, { id: 'cu-help', title: 'Officer’s guide', content: [guide], className: 'cu-dialog' });
  const resetContent = document.createElement('section');
  resetContent.innerHTML = '<p>Discard this shift and clear its saved moves? Export from Notebook first if you want to keep the record. Your model connection is unchanged.</p><button type="button" data-action="confirm-restart">Discard shift and restart</button>';
  const restartDialog = createWorkspaceDialog(page, { id: 'cu-restart', title: 'Restart shift', content: [resetContent], className: 'cu-dialog' });
  const compact = window.matchMedia('(max-width: 960px)');
  const agent = createAgentConsole(page, {
    gameId: 'custodian', host: query(root, '[data-connection]'),
    onBusyChange(value) { busy = value; render(); },
  });

  function report(message: string) { notice.textContent = message; }

  function fitDesk() {
    const drawing = scene.querySelector('svg');
    if (!drawing) return;
    const wide = scene.clientWidth / Math.max(1, scene.clientHeight);
    drawing.setAttribute('viewBox', wide > 2.8 ? '0 260 720 210' : wide > 1.95 ? '0 50 720 420' : '0 0 720 470');
    drawing.setAttribute('preserveAspectRatio', 'none');
  }
  const sceneObserver = new ResizeObserver(fitDesk);
  sceneObserver.observe(scene);
  page.onCleanup(() => sceneObserver.disconnect());

  function renderDocuments() {
    const markup = paneMarkup(selected, session.state, busy);
    const active = document.activeElement;
    const focusKey = active instanceof HTMLButtonElement && (fileBody.contains(active) || modalBody.contains(active))
      ? active.dataset.question ? `[data-question="${active.dataset.question}"]` :
        active.dataset.settle ? `[data-settle="${active.dataset.settle}"]` : null : null;
    const focusHost = active && modalBody.contains(active) ? modalBody : fileBody;
    const scroll = fileBody.scrollTop;
    fileBody.innerHTML = markup;
    modalBody.innerHTML = markup;
    fileBody.scrollTop = scroll;
    for (const button of root.querySelectorAll<HTMLButtonElement>('.cu-tabs [data-pane]')) button.setAttribute('aria-pressed', String(button.dataset.pane === selected));
    if (focusKey) focusHost.querySelector<HTMLButtonElement>(focusKey)?.focus({ preventScroll: true });
  }

  function render() {
    const state = session.state;
    root.dataset.phase = state.phase;
    root.dataset.case = String(state.active?.number ?? 0);
    const number = state.active?.number ?? 0;
    if (number !== lastCase) {
      lastCase = number;
      sweep = 0;
      slider.value = '0';
      selected = 'dossier';
    }
    if (state.phase === 'finished' || state.phase === 'review') selected = 'audit';
    query(root, '[data-resource="minutes"]').textContent = `${state.minutes} m`;
    query(root, '[data-resource="credits"]').textContent = `${state.credits} cr`;
    query(root, '[data-resource="scans"]').textContent = `${state.scans} / 3`;
    query(root, '[data-resource="trust"]').textContent = `${state.trust} / 6`;
    query(root, '[data-resource="score"]').textContent = String(totalScore(state));
    query(root, '[data-case-number]').textContent = state.phase === 'finished' ? `SHIFT CLOSED / ${won(state) ? 'COMMISSION GRANTED' : 'COMMISSION WITHHELD'}` :
      number ? `TRAVELLER ${number} OF 6 / ${state.phase === 'review' ? 'RULING FILED' : 'INSPECTION OPEN'}` : 'EVENING SHIFT / SIX EXPECTED';
    query(root, '[data-case-name]').textContent = state.phase === 'finished' ? won(state) ? 'The worlds may sleep.' : 'The gate remembers.' :
      number ? TRAVELLERS[number - 1].name : 'The other side is waiting.';
    call.hidden = state.phase === 'inspection' || state.phase === 'finished';
    call.disabled = busy;
    call.textContent = state.phase === 'ready' ? 'Call traveller' : 'Call next traveller';
    if (sceneRevision !== session.revision) {
      scene.innerHTML = deskMarkup(state);
      sceneRevision = session.revision;
      fitDesk();
    }
    sweepPanel.hidden = !state.active?.inspected.includes('scan');
    updateScan(root, state, sweep);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-inspect]')) {
      const channel = button.dataset.inspect as Channel;
      const recorded = state.active?.inspected.includes(channel) ?? false;
      button.disabled = busy || !canInspect(state, channel);
      button.classList.toggle('is-recorded', recorded);
      button.querySelector('span')!.textContent = recorded ? 'Recorded' : channel === 'scan' ? '2m / 1ch' : '1 min';
    }
    const refill = query<HTMLButtonElement>(root, '[data-action="refill"]');
    refill.disabled = busy || state.phase !== 'inspection' || state.scans >= CAMPAIGN.scans || state.credits < CAMPAIGN.scanPrice || state.minutes < 1;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-verdict]')) button.disabled = busy || !canStamp(state, button.dataset.verdict as Verdict);
    renderDocuments();
    ruleContent.innerHTML = rulesMarkup(state);
  }

  function selectPane(pane: Pane, enlarge = false) {
    selected = pane;
    fileBody.scrollTop = 0;
    renderDocuments();
    if (enlarge || compact.matches) fileDialog.open();
  }

  function dispatch(command: Command) {
    try {
      session.dispatch(command);
      if (command.type === 'inspect') {
        selectPane('evidence', false);
        // A reading stays on the desk on narrow screens; the File button opens its full record.
        if (compact.matches) fileDialog.close();
        const facts = session.state.active;
        report(command.channel === 'scan' ? 'Scan recorded. Move the spectral sweep to reveal authenticated signatures.' :
          `${command.channel === 'weigh' ? 'Gross mass' : command.channel === 'thermal' ? 'Temperature range' : command.channel === 'registry' ? 'Official licence' : 'Container seal'} recorded. Open Evidence to compare with the declaration.`);
        if (facts?.inspected.includes('scan')) updateScan(root, session.state, sweep);
      } else if (command.type === 'verdict') {
        const audit = session.state.audits.at(-1)!;
        report(`${audit.correct ? 'Correct ruling.' : `Citation: required ${audit.required}.`} ${audit.reasons.join(' ')}${session.state.phase === 'finished' ? ` ${won(session.state) ? 'Victory: commission granted.' : 'Shift lost: commission withheld.'}` : ' Audit filed; call the next traveller when ready.'}`);
        if (compact.matches) selectPane('audit', true);
      } else if (command.type === 'refill') report('One scanner charge purchased for four credits and one minute.');
      else if (command.type === 'settle') report(command.accept ? 'Terms accepted and recorded. Check the evidence or apply your stamp.' : 'Offer declined. No credits changed hands.');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      report(error.message);
    }
  }

  async function arrive() {
    const accepted = await agent.turn({
      label: TRAVELLERS[session.state.audits.length]?.name ?? 'Traveller',
      ...arrivalRequest(session.state, plan => { session.preview({ type: 'arrival', plan }); }),
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'arrival', plan }); },
    });
    if (!accepted || signal.aborted) return;
    const number = session.state.active!.number;
    const directives = REGULATIONS.filter(item => item.from === number && item.from > 1);
    report(directives.length ? `New directives: ${directives.map(item => item.title).join(' and ')}. Read Rules before stamping.` : 'Declaration received. It may be false. The instruments and registry are authoritative.');
  }

  async function negotiate(question: Question) {
    const accepted = await agent.turn({
      label: `${TRAVELLERS[session.state.active!.number - 1].name}: ${question}`,
      ...bargainRequest(session.state, question, plan => { session.preview({ type: 'bargain', question, plan }); }),
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'bargain', question, plan }); },
    });
    if (accepted && !signal.aborted) report('Negotiation recorded. Review the terms before accepting; testimony is still an unverified claim.');
  }

  function reset() {
    agent.cancel();
    fileDialog.close();
    ruleDialog.close();
    restartDialog.close();
    selected = 'dossier';
    sweep = 0;
    slider.value = '0';
    session.reset();
    report('A fresh shift. No model called and no cargo chosen. Call a traveller when ready.');
    call.focus({ preventScroll: true });
  }

  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (target.dataset.pane) { selectPane(target.dataset.pane as Pane); return; }
    if (target.dataset.inspect && !busy) { dispatch({ type: 'inspect', channel: target.dataset.inspect as Channel }); return; }
    if (target.dataset.verdict && !busy) { dispatch({ type: 'verdict', verdict: target.dataset.verdict as Verdict }); return; }
    if (target.dataset.question && !busy) { void negotiate(target.dataset.question as Question); return; }
    if (target.dataset.settle && !busy) { dispatch({ type: 'settle', accept: target.dataset.settle === 'yes' }); return; }
    if (action === 'call' && !busy) void arrive();
    else if (action === 'refill' && !busy) dispatch({ type: 'refill' });
    else if (action === 'file') selectPane(selected, true);
    else if (action === 'rules') { fileDialog.close(); ruleContent.innerHTML = rulesMarkup(session.state); ruleDialog.open(); }
    else if (action === 'help') { fileDialog.close(); helpDialog.open(); }
    else if (action === 'restart') { agent.cancel(); fileDialog.close(); restartDialog.open(); }
    else if (action === 'confirm-restart') reset();
    else if (action === 'sweep') { sweep = 100; slider.value = '100'; updateScan(root, session.state, sweep); }
  }, { signal });
  slider.addEventListener('input', () => { sweep = Number(slider.value); updateScan(root, session.state, sweep); }, { signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog:modal') ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable="true"]'))) return;
    const shortcuts: Record<string, Channel> = { w: 'weigh', t: 'thermal', l: 'registry', m: 'seal', x: 'scan' };
    const channel = shortcuts[event.key.toLowerCase()];
    if (channel && !busy && canInspect(session.state, channel)) { event.preventDefault(); dispatch({ type: 'inspect', channel }); }
    else if (event.key.toLowerCase() === 'd') { event.preventDefault(); selectPane('dossier', true); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); ruleDialog.open(); }
  }, { signal });
  page.onCleanup(session.subscribe(render));
  render();
  createGameNotebook(page, {
    gameId: 'custodian', session, trigger: query(root, '[data-notebook]'),
    beforeRestore: () => { agent.cancel(); sweep = 0; slider.value = '0'; },
    afterRestore: render,
    onNotice: report,
  });
  return { destroy: page.destroy, reset };
}
