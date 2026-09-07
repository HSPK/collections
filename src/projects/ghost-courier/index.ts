import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CASES, NODE_IDS } from './data';
import { choice } from '../../core/agents/schema';
import type { NodeId } from './data';
import { definition, echoAt, exits, forecast, heistOf, nodeName } from './engine';
import type { Command, Intent } from './engine';
import { requestFor } from './agent';
import { createScene } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'ghost-courier');
  page.root.dataset.workspace = 'true';
  const session = new GameSession(definition, 72);
  let selected: NodeId = 'dock';
  let survey = 0;
  let notice = '';
  let busy = false;
  let showLabels = false;
  page.root.innerHTML = `
    <header class="gc-header">
      <div class="gc-wordmark"><span class="gc-seal" aria-hidden="true">GC</span><h1>Ghost Courier</h1><span class="gc-edition">DEAD-LETTER SERVICE / 72</span></div>
      <nav aria-label="Game tools"><button data-help>Help</button><button data-cases>Cases</button><button data-save>Save</button><button data-reset>Restart</button></nav>
    </header>
    <main class="gc-workbench" data-project-preview>
      <section class="gc-world" aria-label="Clockwork city">
        <div class="gc-scene" data-scene></div>
        <div class="gc-world-heading"><div><span class="gc-kicker" data-district></span><h2 data-title></h2></div><button data-labels aria-pressed="false">Labels</button></div>
        <section class="gc-ending" data-ending hidden aria-label="Heist outcome"><span class="gc-kicker" data-ending-label></span><h2 data-ending-title></h2><p data-ending-message></p></section>
        <p class="gc-map-forecast" data-map-forecast></p>
        <div class="gc-world-foot"><span data-selection>Dock</span><button data-picked hidden>Move here</button><span class="gc-legend">YOU / ACID &nbsp; ECHO / MINT &nbsp; WARDEN / RUST</span></div>
      </section>
      <aside class="gc-controls" aria-label="Courier controls">
        <div class="gc-meters" aria-label="Campaign resources">
          <div><span>Heist</span><strong data-heist>1 / 3</strong></div>
          <div><span>Loop</span><strong data-loop>0 / 3</strong></div>
          <div><span>Beat</span><strong data-beat>0 / 18</strong></div>
          <div><span>Alarm</span><strong data-alarm>0 / 6</strong></div>
        </div>
        <div class="gc-objective"><span class="gc-kicker" data-phase>AWAITING WARDEN</span><h2 data-objective>The borrowed minute</h2><p data-brief></p></div>
        <div class="gc-decision"><button class="gc-primary" data-turn>Begin campaign</button><button data-rewind>Rewind</button></div>
        <div class="gc-route">
          <div class="gc-route-heading"><span data-position>At Dock</span><span data-parcel>No parcel</span></div>
          <div class="gc-exits" data-exits aria-label="Adjacent addresses"></div>
          <div class="gc-local-actions"><button data-wait>Wait <span>W</span></button><button data-deliver>Deliver <span>D</span></button></div>
        </div>
        <div class="gc-forecast"><div class="gc-route-heading"><strong>Next beat</strong><button data-intel>Intel</button></div><p data-forecast></p></div>
        <p class="gc-status" data-status role="status" aria-live="polite"></p>
        <div class="gc-echoes"><span class="gc-kicker">RESIDUAL OCCUPANTS</span><p data-echoes>No recordings yet. Your last address becomes an anchor.</p></div>
      </aside>
    </main>
    <footer class="gc-footer"><div data-agent-host></div><span class="gc-footer-note">THE CITY REMEMBERS YOUR ROUTE.</span></footer>`;

  const el = <T extends HTMLElement = HTMLElement>(selector: string) => query<T>(page.root, selector);
  const turnButton = el<HTMLButtonElement>('[data-turn]');
  const rewindButton = el<HTMLButtonElement>('[data-rewind]');
  const status = el('[data-status]');
  const helpContent = document.createElement('section');
  helpContent.innerHTML = `
    <p class="gc-dialog-lead">Borrow a route from your past self.</p>
    <p>The city steals time. You steal it back, in three heists. This is an API-agent campaign: a real connected model assigns Needle and Rivet to legal patrol circuits at the start of every loop. There is no offline opponent. Surveying and editing case files is free; playing requires your connection.</p>
    <h3>Your first delivery</h3>
    <ol><li>Choose Begin campaign. Nothing moves until the warden returns a valid patrol.</li><li>Use the named address buttons: Steps, Fork, Relay. Every move takes one beat.</li><li>Choose Rewind. Only a successful new patrol spends a loop. Your echo repeats those three moves, then stays on Relay.</li><li>Take Steps, Fork, Bridge. At beat 3 the relay is held. Cross to Vault, then Gantry and Dead letter. Choose Deliver.</li></ol>
    <h3>A city with exact rules</h3>
    <p>Only connected addresses are reachable. Shutters check switch occupancy at the <strong>departure beat</strong>. An echo replays one recorded position per beat and holds its final position indefinitely. Your latest two recordings survive a rewind; both are needed in the last heist. A rewind resets your position, parcel, beat and alarm, not the warden's knowledge of your route.</p>
    <p>Each guard advances one circuit step after your action. Sharing its destination or swapping places adds 2 alarm. If a guard's next address contains an echo at the next beat, it pauses once instead: each guard falls for this only once per loop. The forecast already includes this diversion. Guards never stop for shutters.</p>
    <p>Wait and Deliver also take one beat. Alarm is checked before delivery; a safe delivery on the last beat counts. Running out of time or alarm seals a loop. Rewind if your budget permits; otherwise the campaign is lost. Completing all three deliveries wins.</p>
    <h3>Hands on the clock</h3>
    <p><strong>Touch / mouse:</strong> tap a named exit to move, or select a map address and use Move here. <strong>Keyboard:</strong> arrows move toward a connected screen direction; 1-5 select the corresponding exit; W waits; D delivers; R requests a rewind. These shortcuts are inactive in dialogs and text controls. Tab reaches every control. The clock never advances on its own.</p>
    <p><strong>Save:</strong> accepted actions are saved automatically. Export or import the validated command replay from Save. Replay restoration never calls a model. Restart clears the campaign; export first to keep it.</p>`;
  createWorkspaceDialog(page, { id: 'ghost-courier-help', title: 'Courier field manual', content: [helpContent], triggers: [el('[data-help]')] });

  const intelContent = document.createElement('section');
  createWorkspaceDialog(page, { id: 'ghost-courier-intel', title: 'Warden forecast & echoes', content: [intelContent], triggers: [el('[data-intel]')] });
  const caseContent = document.createElement('section');
  caseContent.innerHTML = `<p>Three authored districts. Survey without a model; edit budgets before starting. These changes are recorded in your replay. Campaign order remains I, II, III.</p>
    <label class="gc-case-picker">Survey district <select data-survey>${CASES.map((c, i) => `<option value="${i}">${c.district}</option>`).join('')}</select></label>
    <p data-case-description></p><p data-case-hint></p>
    <form data-case-form>${CASES.map((c, i) => `<fieldset><legend>${c.district}</legend>
      <label>Beat budget <input type="number" name="beats-${i}" min="16" max="32" required value="${c.settings.beats}"></label>
      <label>Alarm limit <input type="number" name="alarm-${i}" min="4" max="8" required value="${c.settings.alarm}"></label>
      <label>Loop budget <input type="number" name="loops-${i}" min="3" max="4" required value="${c.settings.loops}"></label>
    </fieldset>`).join('')}<button type="submit" data-apply-cases>Apply case budgets</button></form><p data-case-status role="status"></p>`;
  createWorkspaceDialog(page, { id: 'ghost-courier-cases', title: 'Editable case files', content: [caseContent], triggers: [el('[data-cases]')] });
  const scene = createScene(el('[data-scene]'), session.state, {
    signal: page.signal, reducedMotion: context.reducedMotion,
    onPick(id) { selected = id; render(); },
  });
  page.onCleanup(scene.destroy);
  const agent = createAgentConsole({ ...page, report: message => { page.report(message); report(message); } }, {
    gameId: 'ghost-courier', host: el('[data-agent-host]'),
    onBusyChange(value) { busy = value; render(); },
  });

  function report(message: string) {
    notice = message;
    const active = page.root.querySelector('dialog[open]');
    render();
    if (active) {
      let modalStatus = active.querySelector<HTMLElement>('[data-gc-modal-status]');
      if (!modalStatus) {
        modalStatus = document.createElement('p');
        modalStatus.dataset.gcModalStatus = '';
        modalStatus.setAttribute('role', 'status');
        query(active, '.workspace-dialog-content').prepend(modalStatus);
      }
      modalStatus.textContent = message;
    }
  }
  function act(command: Command) {
    if (busy) { report('Wait for the warden, or cancel its request before moving.'); return; }
    try { notice = ''; session.dispatch(command); }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      report(error.message);
    }
  }
  function reset() {
    agent.cancel();
    selected = 'dock'; survey = 0; notice = '';
    session.reset();
    syncCaseInputs();
  }
  async function plan(intent: Intent) {
    if (busy) return;
    notice = '';
    const request = requestFor(session.state, intent);
    await agent.turn({
      ...request, label: intent === 'rewind' ? 'Warden studies your recording' : 'Warden assigns patrols',
      validate: p => { session.preview({ type: 'plan', intent, plan: p }); },
      getRevision: () => session.revision,
      commit: p => { selected = 'dock'; survey = 0; session.dispatch({ type: 'plan', intent, plan: p }); },
    });
    render();
  }
  function syncCaseInputs() {
    session.state.settings.forEach((s, i) => {
      for (const key of ['beats', 'alarm', 'loops'] as const) query<HTMLInputElement>(caseContent, `[name="${key}-${i}"]`).value = String(s[key]);
    });
  }
  function render() {
    const s = session.state, heist = heistOf(s), settings = s.settings[s.heist];
    const viewing = s.phase === 'ready' ? { ...s, heist: survey } : s;
    scene.update(viewing, selected);
    page.root.dataset.phase = s.phase;
    page.root.dataset.beat = String(s.tick);
    el('[data-district]').textContent = heistOf(viewing).district;
    el('[data-title]').textContent = heistOf(viewing).title;
    el('[data-heist]').textContent = `${s.heist + 1} / 3`;
    el('[data-loop]').textContent = `${s.loop} / ${settings.loops}`;
    el('[data-beat]').textContent = `${s.tick} / ${settings.beats}`;
    el('[data-alarm]').textContent = `${s.suspicion} / ${settings.alarm}`;
    el('[data-alarm]').dataset.hot = String(s.suspicion >= settings.alarm - 2);
    const phaseTitles = { ready: 'AWAITING WARDEN', running: 'CLOCK RUNNING / LOCAL MOVES', caught: 'LOOP SEALED', delivered: 'PARCEL DELIVERED', won: 'CAMPAIGN COMPLETE', lost: 'CAMPAIGN LOST' };
    el('[data-phase]').textContent = phaseTitles[s.phase];
    el('[data-ending]').hidden = !['caught', 'delivered', 'won', 'lost'].includes(s.phase);
    el('[data-ending-label]').textContent = phaseTitles[s.phase];
    el('[data-ending-title]').textContent = s.phase === 'won' ? 'Tomorrow, returned.' : s.phase === 'lost' ? 'The city keeps its time.' : s.phase === 'delivered' ? 'Signed. Sealed. Delivered.' : 'A minute out of time.';
    el('[data-ending-message]').textContent = s.message;
    el('[data-objective]').textContent = s.phase === 'won' ? 'Tomorrow, returned.' : s.phase === 'lost' ? 'The city keeps its time.' : heist.title;
    el('[data-brief]').textContent = s.phase === 'ready' ? 'Model required to play. Survey the city; record a relay route, then rewind to leave an echo holding the shutter.' : heist.brief;
    el('[data-position]').textContent = `At ${nodeName(s.position, heist)}`;
    el('[data-parcel]').textContent = s.carrying ? 'Parcel aboard' : 'No parcel';
    const running = s.phase === 'running' && !busy;
    const canRewind = (s.phase === 'running' || s.phase === 'caught') && s.tick > 0 && s.loop < settings.loops;
    turnButton.textContent = busy ? 'Warden is planning...' : s.phase === 'ready' ? 'Begin campaign' :
      s.phase === 'delivered' ? 'Open next heist' : s.phase === 'won' || s.phase === 'lost' ? 'Restart campaign' :
        s.phase === 'caught' ? 'Rewind sealed loop' : 'Patrol is live';
    turnButton.disabled = busy || s.phase === 'running';
    rewindButton.disabled = busy || !canRewind;
    rewindButton.textContent = `Rewind (${Math.max(0, settings.loops - s.loop)})`;
    const exitHost = el('[data-exits]');
    const route = exits(s);
    // Restore route focus after the adjacency list changes.
    const focusId = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.exit : undefined;
    exitHost.replaceChildren(...route.map((exit, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.exit = exit.to;
      button.textContent = `${index + 1} ${nodeName(exit.to, heist)}${exit.open ? '' : ' / locked'}`;
      button.setAttribute('aria-label', `Move to ${nodeName(exit.to, heist)}${exit.open ? '' : `; requires ${exit.switch}`}`);
      button.disabled = !running;
      button.dataset.locked = String(!exit.open);
      return button;
    }));
    if (focusId) (exitHost.querySelector<HTMLButtonElement>(`[data-exit="${focusId}"]`) ?? exitHost.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
    el<HTMLButtonElement>('[data-wait]').disabled = !running;
    el<HTMLButtonElement>('[data-deliver]').disabled = !running || !s.carrying || s.position !== 'drop';
    const picked = el<HTMLButtonElement>('[data-picked]');
    picked.hidden = s.phase !== 'running' || !route.some(e => e.to === selected);
    picked.disabled = !running;
    el('[data-selection]').textContent = `Selected / ${nodeName(selected, heistOf(viewing))}`;
    const next = forecast(s);
    el('[data-map-forecast]').textContent = next.length ? `Next / ${next.map(g => `${g.guard === 'needle' ? 'Needle' : 'Rivet'}: ${nodeName(g.to, heist)}${g.decoy ? ' (pause)' : ''}`).join(' / ')}` : 'API warden required. No patrol is running.';
    el('[data-forecast]').textContent = next.length ? next.map(g => `${g.guard === 'needle' ? 'N' : 'R'}: ${nodeName(g.from, heist)} > ${nodeName(g.to, heist)}${g.decoy ? ' (echo pause)' : ''}`).join(' | ') : 'No patrol until a model plan succeeds.';
    status.textContent = notice || s.message;
    el('[data-echoes]').textContent = s.echoes.length ? s.echoes.map((e, i) => `Echo ${i + 1}: ${nodeName(echoAt(e, s.tick), heist)} / anchor ${nodeName(e[e.length - 1], heist)}`).join(' · ') : 'No recordings yet. Your last address becomes an anchor.';
    intelContent.replaceChildren();
    for (const text of [
      `Stolen parcel: ${heist.parcel}. ${heist.brief}`,
      s.bulletin ? `Warden bulletin: ${s.bulletin}` : 'The warden has not spoken. No API request is made until you begin.',
      ...s.guards.map(g => `${g.guard}: ${g.circuit}, starting offset ${g.offset}. ${g.distracted ? 'Already distracted this loop.' : 'Can still be distracted once.'}`),
      ...next.map(g => `${g.guard}: ${nodeName(g.from, heist)} to ${nodeName(g.to, heist)}${g.decoy ? '. Echo diversion: stays here this beat.' : '.'}`),
      el('[data-echoes]').textContent ?? '', `Field hint: ${heist.hint}`, `Latest event: ${notice || s.message}`,
    ]) {
      const p = document.createElement('p'); p.textContent = text; intelContent.append(p);
    }
    query<HTMLElement>(caseContent, '[data-case-description]').textContent = CASES[survey].brief;
    query<HTMLElement>(caseContent, '[data-case-hint]').textContent = CASES[survey].hint;
    query<HTMLButtonElement>(caseContent, '[data-apply-cases]').disabled = s.phase !== 'ready';
  }

  el('[data-reset]').addEventListener('click', reset, { signal: page.signal });
  el('[data-exits]').addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-exit]') : null;
    if (button && !button.disabled) act({ type: 'move', to: choice(button.dataset.exit, NODE_IDS, 'Address') });
  }, { signal: page.signal });
  turnButton.addEventListener('click', () => {
    const phase = session.state.phase;
    if (phase === 'won' || phase === 'lost') reset();
    else void plan(phase === 'ready' ? 'start' : phase === 'delivered' ? 'next' : 'rewind');
  }, { signal: page.signal });
  rewindButton.addEventListener('click', () => { void plan('rewind'); }, { signal: page.signal });
  el('[data-wait]').addEventListener('click', () => act({ type: 'wait' }), { signal: page.signal });
  el('[data-deliver]').addEventListener('click', () => act({ type: 'deliver' }), { signal: page.signal });
  el('[data-picked]').addEventListener('click', () => act({ type: 'move', to: selected }), { signal: page.signal });
  el('[data-labels]').addEventListener('click', () => {
    showLabels = !showLabels;
    el('[data-labels]').setAttribute('aria-pressed', String(showLabels));
    scene.setLabels(showLabels);
  }, { signal: page.signal });
  query<HTMLSelectElement>(caseContent, '[data-survey]').addEventListener('change', event => {
    survey = Number((event.target as HTMLSelectElement).value); selected = 'dock'; render();
  }, { signal: page.signal });
  query<HTMLFormElement>(caseContent, '[data-case-form]').addEventListener('submit', event => {
    event.preventDefault();
    agent.cancel();
    const cases = CASES.map((_, i) => ({
      beats: Number(query<HTMLInputElement>(caseContent, `[name="beats-${i}"]`).value),
      alarm: Number(query<HTMLInputElement>(caseContent, `[name="alarm-${i}"]`).value),
      loops: Number(query<HTMLInputElement>(caseContent, `[name="loops-${i}"]`).value),
    }));
    act({ type: 'setup', cases });
    query<HTMLElement>(caseContent, '[data-case-status]').textContent = notice || session.state.message;
  }, { signal: page.signal });
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
        document.querySelector('dialog:modal') || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (busy) return;
    if (event.key.toLowerCase() === 'r' && (session.state.phase === 'running' || session.state.phase === 'caught')) {
      event.preventDefault();
      if (!rewindButton.disabled) void plan('rewind'); else report('Record a beat and keep a loop in reserve before rewinding.');
      return;
    }
    if (session.state.phase !== 'running') return;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const to = scene.direction(event.key);
      if (to) act({ type: 'move', to }); else report('No adjacent address in that screen direction.');
    } else if (/^[1-5]$/.test(event.key)) {
      const exit = exits(session.state)[Number(event.key) - 1];
      if (exit) { event.preventDefault(); act({ type: 'move', to: exit.to }); }
    } else if (event.key.toLowerCase() === 'w') { event.preventDefault(); act({ type: 'wait' }); }
    else if (event.key.toLowerCase() === 'd') { event.preventDefault(); act({ type: 'deliver' }); }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, {
    gameId: 'ghost-courier', session, trigger: el('[data-save]'), beforeRestore: () => agent.cancel(),
    afterRestore: () => { selected = 'dock'; survey = 0; notice = ''; syncCaseInputs(); render(); },
    onNotice: report,
  });
  render();
  return { destroy: page.destroy, reset, setPaused: scene.setPaused };
}
