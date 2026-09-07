import './style.css';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CREW, CREW_IDS, DOORS, ROOMS, ROOM_IDS, initialOrders, roomInfo } from './data';
import type { Command, Conditions, CrewId, Orders, RoomId, State } from './data';
import { catalog, definition, forecast, prepare, powered } from './engine';
import { crewTool, observation, SYSTEM } from './agent';
import { createShipRenderer } from './render';
import type { ShipSelection, ViewMode } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'afterlight');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'afterlight-title');
  page.root.innerHTML = `
    <header class="al-header">
      <div class="al-brand"><span class="al-emblem" aria-hidden="true"></span><div><h1 id="afterlight-title">Afterlight</h1><p>DEEP-SPACE RECOVERY / 078</p></div></div>
      <div class="al-header-note">THE QUIET AFTER THE SIGNAL</div>
      <nav aria-label="Mission utilities"><button type="button" data-al-mission>Mission</button><button type="button" data-al-notebook>Notebook</button></nav>
    </header>
    <section class="al-telemetry" aria-label="Ship telemetry">
      <div><span>Window</span><strong data-al-tick>00 / 28</strong></div>
      <div><span>Oxygen</span><strong data-al-oxygen>200</strong><span class="al-unit"> units</span></div>
      <div><span>Hull</span><strong data-al-hull>92%</strong></div>
      <div><span>Recovered</span><strong data-al-recovered>0 / 3</strong></div>
      <div class="al-pause-mark"><i></i> TACTICAL PAUSE</div>
    </section>
    <div class="al-main">
      <section class="al-stage" aria-label="Ship operations">
        <div class="al-scene" data-al-scene data-project-preview></div>
        <div class="al-view-controls" role="group" aria-label="Ship camera">
          <button type="button" data-al-view="iso" aria-pressed="true">Isometric</button>
          <button type="button" data-al-view="upper" aria-pressed="false">Deck A</button>
          <button type="button" data-al-view="lower" aria-pressed="false">Deck B</button>
          <button type="button" data-al-view="plan" aria-pressed="false">2D plan</button>
          <button type="button" data-al-plan-deck hidden>Plan: A</button>
        </div>
        <div class="al-coordinate" aria-hidden="true">N / 04.78<br>VESSEL / EURYDICE</div>
        <div class="al-scene-caption"><span data-al-room-caption>A1 / DOCK</span><button type="button" data-al-inspect-room>Inspect room</button></div>
        <div class="al-scene-legend"><span>Solid: accepted paths</span><span>Dashed: evacuation</span></div>
        <div class="al-crew-strip" aria-label="Crew selection">
          ${CREW.map((crew, index) => `<button type="button" data-al-crew="${crew.id}" style="--crew-color:${crew.color}" aria-label="Inspect ${crew.name}">
            <span class="al-crew-name"><i></i>${crew.name}<span class="al-key">${index + 1}</span></span><span data-al-crew-location="${crew.id}">Dock</span>
            <span class="al-energy-track"><span data-al-energy="${crew.id}"></span></span>
          </button>`).join('')}
        </div>
        <section class="al-ending" data-al-ending hidden aria-live="polite">
          <p class="al-eyebrow" data-al-ending-kicker></p><h2 data-al-ending-title></h2><p data-al-ending-text></p>
          <button type="button" data-al-restart>New mission</button>
        </section>
      </section>
      <aside class="al-sidebar">
        <div class="al-sidebar-heading"><span class="al-eyebrow">CAPTAIN'S STATION</span><span class="al-live-dot"></span></div>
        <h2>Bring them home.</h2><p class="al-intro">Three specialists. Two life signs.<br>One narrow way out.</p>
        <ol class="al-objectives" aria-label="Mission objectives">
          <li data-al-objective="survey"><span>01</span><div><strong>Find a way through</strong><small data-al-survey>6 / 12 rooms charted</small></div></li>
          <li data-al-objective="systems"><span>02</span><div><strong>Stabilize the ship</strong><small data-al-systems>Reactor + scrubber offline</small></div></li>
          <li data-al-objective="pods"><span>03</span><div><strong>Recover the living</strong><small data-al-pods>LARK + WREN waiting</small></div></li>
          <li data-al-objective="core"><span>04</span><div><strong>Keep its memory</strong><small data-al-core>Flight core in archive</small></div></li>
          <li data-al-objective="extract"><span>05</span><div><strong>Leave together</strong><small>All crew at dock, then extract</small></div></li>
        </ol>
        <div class="al-forecast-card"><span class="al-eyebrow">NEXT-TURN FORECAST</span><strong data-al-forecast>O2 -4 / hull -2</strong><p data-al-forecast-detail></p><button type="button" data-al-open-orders>Route &amp; isolate</button></div>
        <div class="al-latest"><span class="al-eyebrow">ACCEPTED OPERATIONS</span><p data-al-latest>No crew dispatched. Set your orders, then request a crew turn.</p></div>
      </aside>
    </div>
    <footer class="al-command-bar">
      <div class="al-command-copy"><span data-al-command-label>CAPTAIN'S ORDERS</span><strong data-al-draft-summary>Rescue / salvage power</strong></div>
      <button type="button" class="al-orders-button" data-al-open-orders>Orders <span data-al-draft-dot></span></button>
      <button type="button" data-al-open-crew>Crew &amp; paths</button>
      <button type="button" class="al-advance" data-al-advance>Advance crew <span aria-hidden="true">&#8599;</span></button>
    </footer>
    <div class="al-status-row"><p data-al-notice role="status" aria-live="polite">No time passes until a valid crew turn. Model connection required.</p><button type="button" data-al-open-journal aria-label="Ship operations journal">Journal</button></div>
    <div class="al-agent-host" data-al-agent></div>`;

  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const text = (selector: string, value: string) => {
    const element = get<HTMLElement>(selector);
    if (element.textContent !== value) element.textContent = value;
  };
  const session = new GameSession<State, Command>(definition, 78);
  let orders: Orders = structuredClone(session.state.orders);
  let conditions: Conditions = { ...session.state.conditions };
  const selection: ShipSelection = { room: 'dock', crew: 'vale', mode: 'iso', planDeck: 0 };
  let busy = false;
  let ready = false;
  function notice(message: string) { text('[data-al-notice]', message); }

  const orderContent = document.createElement('section');
  orderContent.className = 'al-order-content';
  orderContent.innerHTML = `
    <p class="al-dialog-intro">These are <strong>staged orders</strong>, not world changes. Routing, bulkheads and crew jobs apply together only when a model turn passes the rules. Rooms in the scene show the accepted ship.</p>
    <div class="al-field-grid">
      <label>Mission priority<select aria-label="Mission priority" data-al-order="priority" data-al-edit><option value="rescue">Rescue survivors</option><option value="stabilize">Stabilize systems</option><option value="core">Retrieve flight core</option><option value="explore">Survey the ship</option><option value="extract">Return &amp; extract</option></select></label>
      <label>Power bus<select aria-label="Power bus" data-al-order="power" data-al-edit><option value="salvage">Salvage: reactor + archive</option><option value="rescue">Rescue: both pods + scrubber</option><option value="balanced">Balanced: all / needs reactor</option></select></label>
      <label>Oxygen inlet<select aria-label="Oxygen inlet" data-al-order="oxygen" data-al-edit><option value="all">Both decks / dock + life support</option><option value="upper">Upper inlet / dock only</option><option value="lower">Lower inlet / life support only</option></select></label>
      <label>Risk authorization<select aria-label="Risk authorization" data-al-order="risk" data-al-edit><option value="safe">Safe / no vacuum crossings</option><option value="eva">Permit EVA / spend suit air</option></select></label>
    </div>
    <p class="al-warning" data-al-power-warning></p>
    <div class="al-dialog-section"><h3>Bulkhead control</h3>
      <label>Selected compartment<select aria-label="Selected compartment" data-al-room-select>${ROOMS.map(room => `<option value="${room.id}">${room.code} / ${room.name}</option>`).join('')}</select></label>
      <p data-al-room-detail></p>
      <div class="al-bulkheads">${DOORS.map(door => `<button type="button" data-al-door="${door.id}" data-al-edit aria-pressed="false"></button>`).join('')}</div>
      <p>Only open bulkheads transmit oxygen or permit movement. The three ballast gates isolate the breach. Lifts connect the decks; the lower service spine links life support to the reactor.</p>
    </div>
    <div class="al-dialog-section"><h3>Evacuation forecast</h3><p data-al-detailed-forecast></p><ul data-al-evacuation></ul><p class="al-muted">This forecast uses your staged doors and oxygen inlet, without assuming successful repairs. White dashed paths in the scene use accepted bulkheads. Air replenishes in rooms at 35% pressure or above; ending below that threshold spends 2 suit air.</p></div>`;
  const ordersDialog = createWorkspaceDialog(page, {
    id: 'afterlight-orders', title: 'Captain orders', content: [orderContent],
    triggers: [...page.root.querySelectorAll<HTMLElement>('[data-al-open-orders]'), get('[data-al-inspect-room]')], className: 'al-dialog',
  });

  const crewContent = document.createElement('section');
  crewContent.className = 'al-crew-content';
  crewContent.innerHTML = `
    <div class="al-crew-tabs">${CREW.map(crew => `<button type="button" data-al-choose-crew="${crew.id}">${crew.name}</button>`).join('')}</div>
    <h3 data-al-crew-title></h3><p data-al-crew-equipment></p>
    <div class="al-crew-readout" data-al-crew-readout></div>
    <label>Captain's destination<select aria-label="Captain's destination" data-al-target data-al-edit><option value="auto">Agent chooses / mission priority</option>${ROOMS.map(room => `<option value="${room.id}">${room.code} / ${room.name}</option>`).join('')}</select></label>
    <p>Assignments guide the crew; they never bypass a closed door, missing item or survival constraint. Everyone has one job per turn, with a shared budget of 5 action points.</p>
    <h3>Latest accepted job</h3><p data-al-crew-job></p><p data-al-crew-intention></p>
    <h3>Current legal action catalog</h3><p class="al-muted">The model chooses from exactly these IDs under your staged routing. Handoffs use starting locations and cannot unlock another action until the next turn.</p>
    <ul class="al-catalog" data-al-catalog></ul>`;
  const crewDialog = createWorkspaceDialog(page, {
    id: 'afterlight-crew', title: 'Crew & evacuation paths', content: [crewContent],
    triggers: [get('[data-al-open-crew]')], className: 'al-dialog',
  });
  const missionContent = document.createElement('section');
  missionContent.className = 'al-mission-content';
  missionContent.innerHTML = `
    <p class="al-eyebrow">RECOVERY BRIEF / EURYDICE</p><h3>The ship is dying. Its people are not.</h3>
    <p>Return <strong>both survivor pods and the flight core</strong> to the dock. Repair the reactor and scrubber, bring all three crew home, then order extraction. A rescue is not complete until the shuttle detaches.</p>
    <div class="al-field-grid">
      <label>Oxygen reserve<select aria-label="Oxygen reserve" data-al-condition="reserve"><option value="200">200 / standard</option><option value="120">120 / lean</option><option value="80">80 / critical</option><option value="240">240 / extended</option></select></label>
      <label>Extraction window<select aria-label="Extraction window" data-al-condition="deadline"><option value="28">28 turns / standard</option><option value="18">18 turns / urgent</option><option value="12">12 turns / severe</option><option value="36">36 turns / extended</option></select></label>
      <label>Hull damage<select aria-label="Hull damage" data-al-condition="damage"><option value="2">2 / fractured</option><option value="1">1 / stable drift</option><option value="3">3 / severe</option></select></label>
      <label>Initial bulkheads<select aria-label="Initial bulkheads" data-al-condition="layout"><option value="sealed">Ballast isolated</option><option value="open">Ballast gates ruptured open</option></select></label>
    </div>
    <p data-al-condition-note>Conditions are staged until the first accepted crew turn.</p>
    <button type="button" data-al-restart>Restart mission</button>
    <h3>First steps</h3><ol><li>Moth has two cells; Vale needs one for the reactor. Hand it over while they share a room.</li><li>Keep salvage power on until the reactor is repaired, then choose balanced power in Orders. Rescue power is an alternative for pod work.</li><li>Scan to chart unknown rooms. Iona releases and carries one pod at a time. Moth recovers the core. Deliver each cargo at the dock.</li><li>Repair life support to halve baseline oxygen use. Isolate ballast to stop reserve leakage; authorize EVA if Vale needs to patch the breach.</li><li>Rest restores energy but still spends a turn. Follow the evacuation paths and leave time for delivery and extraction.</li></ol>
    <h3>Rules that matter</h3><p>One job per specialist, 5 shared AP. Moves follow up to two open graph edges and cost energy per edge. Inventory holds 6 consumables. Vale alone has the repair tool, Iona the pod harness, and Moth the core interface. A transfer is resolved at starting locations; it cannot unlock a job in the same turn.</p>
    <p>Oxygen follows every open bulkhead from the selected inlet, including across decks. Unfed rooms lose 20 pressure per turn, fed rooms gain 15; the active breach always depressurizes. A fed breach leaks 3 oxygen per damage level. Hull falls by its damage level every tick until patched. At 0 reserve, 0 hull, a depleted crew suit, or the closed extraction window, the mission is lost.</p>
    <h3>Controls &amp; connection</h3><p>Drag the 3D ship to orbit; scroll to zoom. The canvas also supports arrow keys and +/-. Use [ and ] to select rooms, 1/2/3 to select crew, D to cycle decks, and Space to request one turn. Shortcuts stop in dialogs and text controls. Orders includes a keyboard-accessible room selector; 2D plan is an explicitly labelled, playable alternative.</p>
    <p>No model is called on load, camera changes or replay. Each requested turn allows at most two requests of 1,536 output tokens within 60 seconds, including one correction for an illegal plan. Unavailable or invalid models produce an error, never simulated success. Notebook saves accepted replay commands, not secrets. There is no audio.</p>`;
  const missionDialog = createWorkspaceDialog(page, {
    id: 'afterlight-mission', title: 'Mission briefing', content: [missionContent], triggers: [get('[data-al-mission]')], className: 'al-dialog',
  });
  const journalContent = document.createElement('section');
  const journalList = document.createElement('ol');
  journalList.className = 'al-journal';
  journalContent.append(journalList);
  createWorkspaceDialog(page, { id: 'afterlight-journal', title: 'Ship operations journal', content: [journalContent], triggers: [get('[data-al-open-journal]')], className: 'al-dialog' });

  const ship = createShipRenderer({ ...context, signal: page.signal, report: notice }, get('[data-al-scene]'), session.state, room => {
    selection.room = room; render();
  });
  page.onCleanup(() => ship.destroy());
  const agent = createAgentConsole(page, {
    gameId: 'afterlight', host: get('[data-al-agent]'),
    onBusyChange(value) { busy = value; if (ready) render(); },
  });

  function staged() { return session.state.status === 'active' ? prepare(session.state, orders, conditions) : session.state; }
  function render() {
    const state = session.state;
    const preview = staged();
    const next = forecast(preview);
    const pending = JSON.stringify(orders) !== JSON.stringify(state.orders) || JSON.stringify(conditions) !== JSON.stringify(state.conditions);
    page.root.dataset.tick = String(state.tick);
    page.root.dataset.missionStatus = state.status;
    page.root.dataset.pendingOrders = String(pending);
    text('[data-al-tick]', `${String(state.tick).padStart(2, '0')} / ${state.conditions.deadline}`);
    text('[data-al-oxygen]', String(state.oxygen));
    text('[data-al-hull]', `${state.hull}%`);
    const savedPods = Object.values(state.pods).filter(value => value === 'saved').length;
    text('[data-al-recovered]', `${savedPods + Number(state.core === 'saved')} / 3`);
    text('[data-al-survey]', `${state.rooms.filter(room => room.known).length} / 12 rooms charted`);
    text('[data-al-systems]', `Reactor ${state.repaired.reactor ? 'online' : 'offline'} / scrubber ${state.repaired.life ? 'online' : 'offline'}`);
    text('[data-al-pods]', `LARK ${state.pods.lark} / WREN ${state.pods.wren}`);
    text('[data-al-core]', `Flight core ${state.core}`);
    for (const [id, complete] of Object.entries({
      survey: state.rooms.find(room => room.id === 'medbay')!.known && state.rooms.find(room => room.id === 'archive')!.known && state.rooms.find(room => room.id === 'cryo')!.known,
      systems: state.repaired.reactor && state.repaired.life, pods: savedPods === 2, core: state.core === 'saved', extract: state.status === 'won',
    })) get<HTMLElement>(`[data-al-objective="${id}"]`).dataset.complete = String(complete);
    text('[data-al-forecast]', `O2 -${next.burn} / hull -${next.hullLoss}`);
    text('[data-al-forecast-detail]', `${next.remaining} turns at this rate. ${next.leak ? `Open breach leaking ${next.leak}/turn.` : 'Breach isolated from oxygen flow.'}${pending ? ' Staged routing.' : ''}`);
    text('[data-al-detailed-forecast]', `Next reserve ${next.oxygenNext} (${next.burn} used); hull ${next.hullNext}%. Maximum ${next.remaining} ticks at this rate, before accounting for rescue travel. ${next.note}`);
    text('[data-al-latest]', state.jobs.length ? state.jobs.map(job => `${job.crew.toUpperCase()} / ${job.label}`).join('\n') : 'No crew dispatched. Set your orders, then request a crew turn.');
    text('[data-al-draft-summary]', `${orders.priority} / ${orders.power} power${pending ? ' / staged' : ''}`);
    text('[data-al-command-label]', state.status === 'active' ? busy ? 'AWAITING VALIDATED PLAN' : pending ? 'ORDERS STAGED / NOT COMMITTED' : 'CAPTAIN\'S ORDERS' : 'MISSION CLOSED');
    text('[data-al-draft-dot]', pending ? '*' : '');
    text('[data-al-room-caption]', `${roomInfo(selection.room).code} / ${roomInfo(selection.room).name.toUpperCase()}`);
    get<HTMLButtonElement>('[data-al-advance]').disabled = busy || state.status !== 'active';
    get<HTMLButtonElement>('[data-al-advance]').firstChild!.textContent = busy ? 'Crew planning ' : state.status !== 'active' ? 'Mission ended ' : 'Advance crew ';
    for (const control of page.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('[data-al-edit]')) control.disabled = busy || state.status !== 'active';
    for (const field of ['priority', 'power', 'oxygen', 'risk'] as const) get<HTMLSelectElement>(`[data-al-order="${field}"]`).value = orders[field];
    for (const field of ['reserve', 'deadline', 'damage', 'layout'] as const) {
      const select = get<HTMLSelectElement>(`[data-al-condition="${field}"]`);
      select.value = String(conditions[field]);
      select.disabled = busy || state.tick > 0;
    }
    text('[data-al-condition-note]', state.tick > 0 ? 'Conditions are locked. Restart first to edit a new mission.' : 'Conditions are staged until the first accepted crew turn.');
    text('[data-al-power-warning]', orders.power === 'balanced' && !state.repaired.reactor ? 'Balanced power is offline. Vale needs salvage power, 1 patch and 1 cell to restore the reactor.' :
      orders.power === 'salvage' ? 'Salvage powers the archive and reactor, not the pods. Switch to balanced after the reactor repair.' :
        orders.power === 'rescue' ? 'Rescue powers both pods, not the flight core. Route power for each phase.' : 'Balanced bus online. All job stations powered.');
    get<HTMLSelectElement>('[data-al-room-select]').value = selection.room;
    const room = state.rooms.find(room => room.id === selection.room)!;
    const fed = next.supplied.includes(room.id);
    text('[data-al-room-detail]', `${room.known ? roomInfo(room.id).function : 'Uncharted interior. Survey from a connected room before entering.'} ${room.known ? `Pressure ${room.pressure}%.` : ''} Staged: ${fed ? 'oxygen connected' : 'oxygen isolated'}, ${powered(preview, room.id) ? 'station powered' : 'station unpowered'}.`);
    for (const door of DOORS) {
      const button = get<HTMLButtonElement>(`[data-al-door="${door.id}"]`);
      const open = orders.doors.find(entry => entry.id === door.id)!.open;
      const changed = state.orders.doors.find(entry => entry.id === door.id)!.open !== open;
      button.hidden = door.a !== selection.room && door.b !== selection.room;
      button.setAttribute('aria-pressed', String(open));
      button.textContent = `${open ? 'Open' : 'Sealed'} / ${roomInfo(door.a === selection.room ? door.b : door.a).name}${changed ? ' (staged)' : ''}`;
      button.setAttribute('aria-label', `${open ? 'Seal' : 'Open'} bulkhead ${door.id} to ${roomInfo(door.a === selection.room ? door.b : door.a).name}`);
    }
    get('[data-al-evacuation]').replaceChildren(...next.evacuation.map(exit => {
      const item = document.createElement('li');
      item.textContent = `${exit.crew.toUpperCase()}: ${exit.path.length ? exit.path.map(id => roomInfo(id).code).join(' > ') : 'NO OPEN RETURN PATH'} / ${exit.minimumMoveTurns ?? 'blocked'} minimum move turns / suit ${exit.suitAir}, vacuum crossings ${exit.vacuumSteps}.`;
      return item;
    }));
    for (const member of CREW) {
      const crew = state.crew.find(crew => crew.id === member.id)!;
      text(`[data-al-crew-location="${member.id}"]`, `${roomInfo(crew.room).code} / E${crew.energy} / O2 ${crew.air}`);
      get<HTMLElement>(`[data-al-energy="${member.id}"]`).style.width = `${crew.energy / member.maxEnergy * 100}%`;
      get(`[data-al-crew="${member.id}"]`).setAttribute('aria-pressed', String(selection.crew === member.id));
      get(`[data-al-choose-crew="${member.id}"]`).setAttribute('aria-pressed', String(selection.crew === member.id));
    }
    const selected = state.crew.find(crew => crew.id === selection.crew)!;
    const member = CREW.find(crew => crew.id === selection.crew)!;
    text('[data-al-crew-title]', `${member.name} / ${member.role}`);
    text('[data-al-crew-equipment]', `${member.equipment}. ${roomInfo(selected.room).name}. Cargo: ${selected.cargo}.`);
    text('[data-al-crew-readout]', `Energy ${selected.energy}/${member.maxEnergy} / suit air ${selected.air}/8 / ${selected.inventory.patch} patches / ${selected.inventory.medkit} medkits / ${selected.inventory.cell} cells`);
    get<HTMLSelectElement>('[data-al-target]').value = orders.targets.find(target => target.crew === selection.crew)!.room;
    const job = state.jobs.find(job => job.crew === selection.crew);
    text('[data-al-crew-job]', job ? `${job.label}. Accepted path: ${job.path.map(id => roomInfo(id).name).join(' > ')}.` : 'No job accepted yet.');
    text('[data-al-crew-intention]', job?.intention ?? 'Only short public intentions are shown here.');
    get('[data-al-catalog]').replaceChildren(...catalog(preview, selected).map(action => {
      const item = document.createElement('li');
      item.textContent = `${action.label} / ${action.ap} AP, ${action.energy} energy${action.path.length > 1 ? ` / ${action.path.map(id => roomInfo(id).code).join(' > ')}` : ''}`;
      item.dataset.actionId = action.id;
      return item;
    }));
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-al-view]')) button.setAttribute('aria-pressed', String(button.dataset.alView === selection.mode));
    get<HTMLButtonElement>('[data-al-plan-deck]').hidden = selection.mode !== 'plan';
    text('[data-al-plan-deck]', `Plan: ${selection.planDeck === 0 ? 'A' : 'B'}`);
    const ending = get<HTMLElement>('[data-al-ending]');
    ending.hidden = state.status === 'active';
    ending.dataset.outcome = state.status;
    text('[data-al-ending-kicker]', state.status === 'won' ? 'SHUTTLE CLEAR / ALL SOULS ACCOUNTED FOR' : 'EXTRACTION FAILED');
    text('[data-al-ending-title]', state.status === 'won' ? 'Rescue complete' : 'Mission lost');
    text('[data-al-ending-text]', state.ending);
    journalList.replaceChildren(...state.log.map(entry => {
      const item = document.createElement('li'); item.textContent = entry; return item;
    }));
    ship.set(state, selection);
  }

  async function advance() {
    if (busy || session.state.status !== 'active') return;
    const acceptedOrders = structuredClone(orders);
    const acceptedConditions = { ...conditions };
    const snapshot = prepare(session.state, acceptedOrders, acceptedConditions);
    const command = (plan: Command['plan']): Command => ({ type: 'turn', conditions: acceptedConditions, orders: acceptedOrders, plan });
    const committed = await agent.turn({
      label: `Crew / turn ${snapshot.tick + 1}`, system: SYSTEM, observation: observation(snapshot), tool: crewTool,
      validate: plan => { session.preview(command(plan)); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch(command(plan)); },
    });
    if (page.signal.aborted) return;
    if (committed) notice(session.state.status === 'active' ? `Turn ${session.state.tick} accepted. ${session.state.jobs.map(job => `${job.crew}: ${job.label}`).join(' / ')}` : session.state.ending);
  }

  function restart() {
    const nextConditions = { ...conditions };
    agent.cancel();
    session.reset(session.seed + 1);
    conditions = nextConditions;
    orders = initialOrders(nextConditions);
    missionDialog.close(); ordersDialog.close(); crewDialog.close();
    selection.room = 'dock'; selection.crew = 'vale';
    render();
    notice('New mission staged. No model called. Edit conditions in Mission, then advance the crew.');
  }
  function edit(run: () => void) {
    if (busy || session.state.status !== 'active') return;
    try { run(); render(); notice('Orders staged. The ship changes only after a validated crew turn.'); }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(error.message);
    }
  }
  page.root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const select = event.target;
    if (select.matches('[data-al-room-select]')) {
      const room = ROOM_IDS.find(id => id === select.value);
      if (room) { selection.room = room; render(); }
      return;
    }
    edit(() => {
      const field = select.dataset.alOrder;
      if (field === 'priority' || field === 'power' || field === 'oxygen' || field === 'risk') {
        const candidate = { ...orders, [field]: select.value };
        orders = prepare(session.state, candidate, conditions).orders;
      } else if (select.matches('[data-al-target]')) {
        const room = ['auto', ...ROOM_IDS].find(id => id === select.value);
        if (room) orders = prepare(session.state, {
          ...orders, targets: orders.targets.map(target => target.crew === selection.crew ? { ...target, room: room as RoomId | 'auto' } : target),
        }, conditions).orders;
      } else {
        const condition = select.dataset.alCondition;
        if (session.state.tick !== 0) return;
        if (condition === 'layout' || condition === 'reserve' || condition === 'deadline' || condition === 'damage') {
          conditions = prepare(session.state, orders, { ...conditions, [condition]: condition === 'layout' ? select.value : Number(select.value) }).conditions;
          if (condition === 'layout') orders.doors = initialOrders(conditions).doors;
        }
      }
    });
  }, { signal: page.signal });
  page.root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.matches('[data-al-advance]')) void advance();
    else if (button.matches('[data-al-restart]')) restart();
    else if (button.dataset.alDoor) edit(() => {
      orders = { ...orders, doors: orders.doors.map(door => door.id === button.dataset.alDoor ? { ...door, open: !door.open } : door) };
    });
    else if (button.dataset.alView) {
      selection.mode = button.dataset.alView as ViewMode;
      if (selection.mode === 'lower') selection.planDeck = 1;
      else if (selection.mode === 'upper') selection.planDeck = 0;
      render();
    } else if (button.matches('[data-al-plan-deck]')) { selection.planDeck = selection.planDeck === 0 ? 1 : 0; render(); }
    else if (button.dataset.alCrew || button.dataset.alChooseCrew) {
      selection.crew = (button.dataset.alCrew ?? button.dataset.alChooseCrew) as CrewId;
      render();
      if (button.dataset.alCrew) crewDialog.open();
    }
  }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog:modal') ||
        (event.target instanceof Element && event.target.closest('input,select,textarea,button,a,[contenteditable="true"]'))) return;
    if (['1', '2', '3'].includes(event.key)) {
      selection.crew = CREW_IDS[Number(event.key) - 1]; render();
    } else if (event.key === '[' || event.key === ']') {
      selection.room = ROOM_IDS[(ROOM_IDS.indexOf(selection.room) + (event.key === '[' ? 11 : 1)) % 12]; render();
    } else if (event.key.toLowerCase() === 'd') {
      selection.mode = selection.mode === 'iso' ? 'upper' : selection.mode === 'upper' ? 'lower' : 'iso'; render();
    } else if (event.code === 'Space') { event.preventDefault(); void advance(); }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(() => {
    orders = structuredClone(session.state.orders);
    conditions = { ...session.state.conditions };
    render();
  }));
  ready = true;
  render();
  createGameNotebook(page, {
    gameId: 'afterlight', session, trigger: get('[data-al-notebook]'), beforeRestore: () => agent.cancel(),
    afterRestore: render, onNotice: notice,
  });
  return { destroy: page.destroy, reset: restart, setPaused: paused => ship.setPaused(paused) };
}
