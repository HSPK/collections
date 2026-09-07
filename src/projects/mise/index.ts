import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { HOBS, INGREDIENTS, RECIPES, SHIFTS, STAFF } from './data';
import { definition, finalScore, recipePart } from './engine';
import type { Command, Order } from './engine';
import { crewTool, observation, SYSTEM } from './agent';
import { createKitchen } from './render';

const heatNames = ['Off', 'Low', 'Steady', 'High'];
export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'mise');
  page.root.dataset.workspace = 'true';
  page.root.innerHTML = `
    <header class="mise-header">
      <div class="mise-brand"><h1>Mise<span aria-hidden="true">.</span></h1><span>THE LITTLE COPPER</span></div>
      <nav aria-label="Kitchen utilities"><button data-help>Guide</button><button data-notebook>Notebook</button><button data-restart>Restart</button></nav>
    </header>
    <div class="mise-metrics" aria-label="Service progress">
      <strong data-course></strong><span data-clock></span><span data-room></span><span data-total></span>
    </div>
    <main class="mise-workbench">
      <section class="mise-scene" aria-label="Live kitchen">
        <div class="mise-kitchen" data-project-preview></div>
        <div class="mise-caption"><span data-phase-label></span><button data-motion aria-pressed="false">Still life</button></div>
        <div class="mise-crew" aria-label="Staff jobs">${STAFF.map(staff => `<div><strong style="--staff:${staff.color}">${staff.name}</strong><span data-crew="${staff.id}"></span></div>`).join('')}</div>
      </section>
      <aside class="mise-orders" aria-label="Live tickets and forecast">
        <header><h2>On the rail</h2><span data-target></span></header>
        <div class="mise-ticket-list" data-tickets></div>
      </aside>
    </main>
    <section class="mise-dock" aria-label="Kitchen controls">
      <div class="mise-strategy">
        <button data-kitchen>Kitchen / prep</button>
        <label>Priority<select data-mode aria-label="Service priority"><option value="balanced">Balanced</option><option value="rush">Rush</option><option value="craft">Craft</option></select></label>
        ${HOBS.map((hob, i) => `<label><span>Hob ${i + 1} <small data-hob-status="${hob}"></small></span><select data-heat="${hob}" aria-label="Hob ${i + 1} heat">${heatNames.map((name, value) => `<option value="${value}">${name}</option>`).join('')}</select></label>`).join('')}
      </div>
      <div class="mise-service"><button class="mise-primary" data-pulse>Open service</button><button data-hold>Hold crew +1</button><p data-notice role="status" aria-live="polite"></p></div>
    </section>
    <footer class="mise-footer"><div data-agent-host></div></footer>`;
  const session = new GameSession(definition, 79);
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  let busy = false, selected = session.state.orders[0].id, motionPaused = context.reducedMotion;
  const kitchen = createKitchen(query(page.root, '.mise-kitchen'), session.state, motionPaused);
  page.onCleanup(kitchen.destroy);
  const pulseButton = query<HTMLButtonElement>(page.root, '[data-pulse]');
  const holdButton = query<HTMLButtonElement>(page.root, '[data-hold]');
  const mode = query<HTMLSelectElement>(page.root, '[data-mode]');
  const tickets = query<HTMLElement>(page.root, '[data-tickets]');
  const prepContent = document.createElement('section');
  prepContent.className = 'mise-prep-dialog';
  prepContent.innerHTML = `
    <p>Before each sitting, move the island and prepare <strong>three components</strong> from real stock. You may prep any forecast ticket. Nothing cooks until a service pulse.</p>
    <fieldset><legend>Island arrangement</legend><button data-layout="prep">Prep island: 2 boards / 1 pass</button><button data-layout="pass">Wide pass: 1 board / 2 pass</button></fieldset>
    <p data-prep-left></p><div data-prep-options></div>
    <h3>Pantry / remaining portions</h3><p data-pantry></p>
    <h3>Between pulses</h3><p>Balanced uses staff specialties. Rush makes all prep and plating one beat, but costs quality. Craft takes two beats and adds quality. Hobs add 0 / 1 / 2 / 3 heat every beat. High heat also costs quality. Turn a ready hob off to buy plating time.</p>`;
  const prepDialog = createWorkspaceDialog(page, { id: 'mise-kitchen-tools', title: 'Kitchen & advance prep', content: [prepContent], triggers: [query(page.root, '[data-kitchen]')] });
  const recipeContent = document.createElement('section');
  const recipeDialog = createWorkspaceDialog(page, { id: 'mise-recipe', title: 'Ticket & recipe', content: [recipeContent] });
  const guideContent = document.createElement('section');
  guideContent.innerHTML = `
    <h3>A small kitchen, a real service</h3>
    <p>You are the proprietor. Nell, Sol and Ivo are fictional autonomous staff coordinated by your connected model. You choose the kitchen arrangement, advance prep, priorities, pinned ticket and heat. The model assigns their jobs; the local kitchen decides what actually happens.</p>
    <ol><li>Open <strong>Kitchen / prep</strong>. Choose two prep boards or two pass slots. Spend up to three advance-prep portions.</li><li>Read the ticket rail: arrival and deadline are visible for every order. Click a ticket for its compact dependency inspector, then pin your priority.</li><li>Open service, then choose <strong>Call crew / 1 beat</strong>. One bounded model plan assigns all three staff. There is no live wall-clock pressure.</li><li>Inspect the jobs and hobs. Adjust heat or service priority while tactically paused. Call the next pulse only when ready.</li></ol>
    <h3>From pantry to table</h3>
    <p>Raw &rarr; prep &rarr; ready (cold), or prepared &rarr; hob &rarr; ready (hot). All components must be ready before plating. Plating takes a pass slot. Serving is a separate action. Staff, components and stations can each have only one reservation. New results cannot be reused within the same pulse.</p>
    <p>Nell preps in one beat; Ivo plates in one. Other staff need two beats in Balanced. Sol adds cooking quality. Cooking is unattended after loading, so staff can do another job while their pan heats. Ready food stays on its hob until plated and <strong>burns at target +4 heat</strong>. Burnt components need fresh stock; each ingredient has one spare portion.</p>
    <h3>Three sittings</h3>
    <p>Serve at least 3 / 3 / 4 dishes across the three sittings, with average quality at least 62 each. Two missed tables across the entire campaign, or satisfaction below 45, closes the house. Deadlines include the serving beat. Score rewards quality and early service, penalizing waste and missed tables.</p>
    <p><strong>Hold crew +1</strong> is an intentional local clock advance, not an AI substitute: no new assignments, but existing prep, plating and hobs continue. Network failures, invalid plans and cancellation consume nothing.</p>
    <h3>Controls & privacy</h3><p>Space calls the crew (or opens service); K opens the kitchen; ? opens this guide. Shortcuts stop in dialogs and form controls. Every action also has a touch/keyboard button. Still life stops decorative motion; it does not alter the clock. No sound is used.</p>
    <p>Model settings are shared connection preferences. No API call occurs on load, restore, configuration, or animation. Notebook saves validated replay moves, never keys. Restart cancels pending work. This restaurant, dishes and timing system are fiction, not food-safety guidance.</p>`;
  const guide = createWorkspaceDialog(page, { id: 'mise-guide', title: 'The service book', content: [guideContent], triggers: [query(page.root, '[data-help]')] });
  const wrapContent = document.createElement('section');
  const wrap = createWorkspaceDialog(page, { id: 'mise-wrap', title: 'Service ledger', content: [wrapContent] });
  const agent = createAgentConsole(page, {
    gameId: 'mise', host: query(page.root, '[data-agent-host]'),
    onBusyChange(value) { busy = value; render(); },
  });
  function say(message: string) { notice.textContent = message; }
  function dispatch(command: Command) {
    try { session.dispatch(command); }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message); page.report(error.message);
    }
  }
  function renderRecipe(order: Order) {
    recipeContent.innerHTML = `<h3>${escapeMarkup(order.id)} / ${escapeMarkup(RECIPES[order.recipe].name)}</h3>
      <p>Arrives beat ${order.arrival}. Serve by ${order.deadline}. Current beat ${session.state.tick}. Status: <strong>${order.status}</strong>.</p>
      <ol class="mise-dependencies">${order.parts.map(part => {
        const recipe = recipePart(order, part);
        return `<li><strong>${recipe.name}</strong><span>${Object.entries(recipe.stock).map(([id, n]) => `${n} ${id}`).join(' + ')}</span>
          <span data-part="${part.id}">${part.stage} ${recipe.heat ? `/ heat ${part.heat} of ${recipe.heat}; burns at ${recipe.heat + 4}${part.hob ? ` on ${part.hob}` : ''}` : '/ cold component'}</span></li>`;
      }).join('')}</ol>
      <p>Every component ready &rarr; plate at a free pass &rarr; serve on a later beat.</p>
      <button data-pin-ticket="${order.id}" ${busy || order.status !== 'open' ? 'disabled' : ''}>${session.state.pin === order.id ? 'Pinned priority' : 'Pin this ticket'}</button>`;
  }
  function render() {
    const state = session.state, shift = SHIFTS[state.shift];
    page.root.dataset.phase = state.phase; page.root.dataset.beat = String(state.tick);
    query(page.root, '[data-course]').textContent = shift.course;
    query(page.root, '[data-clock]').textContent = `Beat ${state.tick} / ${shift.clock}`;
    query(page.root, '[data-room]').textContent = `Room ${state.satisfaction}`;
    query(page.root, '[data-total]').textContent = `${state.served} served / ${state.missed} missed`;
    query(page.root, '[data-target]').textContent = `Goal ${shift.goal} / quality 62+`;
    query(page.root, '[data-phase-label]').textContent = state.phase === 'setup' ? 'Before doors / arrange & prep' : state.phase === 'service' ? 'Tactical pause / your kitchen, your pace' : state.phase === 'won' ? 'Three sittings / a full house' : state.phase === 'lost' ? 'Service closed' : 'Between sittings';
    for (const staff of STAFF) query(page.root, `[data-crew="${staff.id}"]`).textContent = state.last[staff.id];
    const signature = JSON.stringify([state.orders, state.tick, state.pin, selected]);
    if (tickets.dataset.signature !== signature) {
      const focus = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.ticket : undefined;
      tickets.innerHTML = state.orders.map(order => {
        const waiting = state.tick < order.arrival;
        const ready = order.parts.filter(part => part.stage === 'ready').length;
        return `<button class="mise-ticket" data-ticket="${order.id}" data-status="${order.status}" aria-label="Inspect ${order.id} ${RECIPES[order.recipe].short}" aria-pressed="${order.id === selected}">
          <span class="mise-ticket-top"><strong>${order.id}</strong><span>${state.pin === order.id ? 'PINNED' : waiting ? 'FORECAST' : order.status.toUpperCase()}</span></span>
          <span class="mise-dish-name">${RECIPES[order.recipe].short}</span>
          <span class="mise-ticket-time">In ${order.arrival} / due ${order.deadline}${order.status === 'open' ? ` / ${order.deadline - state.tick} left` : ''}</span>
          <span class="mise-ticket-progress">${order.parts.map(part => `<i data-stage="${part.stage}" title="${part.stage}"></i>`).join('')}<span>${order.status === 'served' ? `Served / Q${order.quality}` : order.status === 'missed' ? 'Table left' : order.status === 'plated' ? 'Ready to serve' : `${ready}/${order.parts.length} ready`}</span></span>
        </button>`;
      }).join('');
      tickets.dataset.signature = signature;
      if (focus) tickets.querySelector<HTMLElement>(`[data-ticket="${focus}"]`)?.focus({ preventScroll: true });
    }
    const active = state.phase === 'setup' || state.phase === 'service';
    mode.value = state.mode; mode.disabled = busy || !active;
    for (const hob of HOBS) {
      const input = query<HTMLSelectElement>(page.root, `[data-heat="${hob}"]`);
      input.value = String(state.hobs[hob]); input.disabled = busy || !active;
      const part = state.orders.flatMap(order => order.parts).find(item => item.hob === hob);
      const order = state.orders.find(item => item.parts.includes(part!));
      const status = query<HTMLElement>(page.root, `[data-hob-status="${hob}"]`);
      status.dataset.ready = String(part?.stage === 'ready');
      status.textContent = part && order ? `${part.heat}/${recipePart(order, part).heat}${part.stage === 'ready' ? '!' : ''}` : '-';
      status.title = part && order ? `${part.id}: ${part.stage}. Burns at ${recipePart(order, part).heat + 4}.` : 'Empty hob';
    }
    pulseButton.disabled = busy;
    pulseButton.textContent = busy ? 'Coordinating crew...' : state.phase === 'setup' ? 'Open service' : state.phase === 'service' ? 'Call crew / 1 beat' : state.phase === 'intermission' ? 'Next sitting' : 'View service ledger';
    holdButton.disabled = busy || state.phase !== 'service';
    query(prepContent, '[data-prep-left]').textContent = `${state.prepTokens} advance-prep portions left. ${shift.note}`;
    for (const button of prepContent.querySelectorAll<HTMLButtonElement>('[data-layout]')) {
      button.disabled = busy || state.phase !== 'setup';
      button.setAttribute('aria-pressed', String(button.dataset.layout === state.layout));
    }
    query(prepContent, '[data-pantry]').textContent = INGREDIENTS.map(id => `${id}: ${state.stock[id]}`).join(' / ');
    const prepSignature = JSON.stringify([state.orders.map(order => order.parts.map(part => part.stage)), state.phase, state.prepTokens, busy]);
    const prepOptions = query<HTMLElement>(prepContent, '[data-prep-options]');
    if (prepOptions.dataset.signature !== prepSignature) {
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.prestock : undefined;
      prepOptions.innerHTML = state.orders.map(order => `<div class="mise-prep-row"><strong>${order.id} / ${RECIPES[order.recipe].short}</strong>${order.parts.map(part => `<button data-prestock="${part.id}" ${busy || state.phase !== 'setup' || state.prepTokens === 0 || part.stage !== 'raw' ? 'disabled' : ''}>${recipePart(order, part).name} / ${part.stage === 'raw' ? 'Prep' : part.stage}</button>`).join('')}</div>`).join('');
      prepOptions.dataset.signature = prepSignature;
      if (focused) prepOptions.querySelector<HTMLElement>(`[data-prestock="${focused}"]`)?.focus({ preventScroll: true });
    }
    if (recipeDialog.dialog.open) renderRecipe(state.orders.find(order => order.id === selected) ?? state.orders[0]);
    kitchen.update(state);
  }
  function showWrap() {
    const state = session.state;
    wrapContent.innerHTML = `<h3>${state.phase === 'won' ? 'A full house' : state.phase === 'lost' ? 'The empty table' : 'Sitting complete'}</h3>
      <p>${escapeMarkup(state.outcome)}</p><p class="mise-score">${finalScore(state)} <span>service points</span></p>
      <p>${state.served} served / ${state.missed} missed / ${state.waste} wasted components / room ${state.satisfaction}</p>
      <p>${state.orders.filter(order => order.status === 'served').map(order => `${order.id}: quality ${order.quality}, beat ${order.servedAt}`).join(' / ') || 'No dishes reached a table this sitting.'}</p>
      <button data-wrap-next>${state.phase === 'intermission' ? 'Prepare next sitting' : 'Restart campaign'}</button>
      <h3>Kitchen ledger</h3><ol>${state.log.map(line => `<li>${escapeMarkup(line)}</li>`).join('')}</ol>`;
    wrap.open();
  }
  function restart() {
    agent.cancel(); wrap.close(); prepDialog.close(); recipeDialog.close(); session.reset(79);
    selected = session.state.orders[0].id;
    say('A fresh kitchen. Choose advance prep, then open service.'); render();
  }
  function next() {
    agent.cancel(); wrap.close(); recipeDialog.close(); prepDialog.close();
    dispatch({ type: 'next' }); selected = session.state.orders[0].id;
    say('A new delivery is in. Arrange and prep before opening.'); render();
  }
  async function pulse() {
    if (busy) return;
    if (session.state.phase === 'setup') { dispatch({ type: 'open' }); say('Service is open. Check the forecast, then call the crew.'); return; }
    if (session.state.phase === 'intermission') { next(); return; }
    if (session.state.phase !== 'service') { showWrap(); return; }
    const accepted = await agent.turn({
      label: 'The Little Copper crew', system: SYSTEM, observation: observation(session.state), tool: crewTool,
      validate: plan => { session.preview({ type: 'plan', plan }); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'plan', plan }); },
    });
    if (accepted) {
      say(session.state.phase === 'service' ? 'Pulse complete. Check ready pans, adjust heat, then call again.' : session.state.outcome);
      if (session.state.phase !== 'service') showWrap();
    }
  }
  pulseButton.addEventListener('click', () => { void pulse(); }, { signal: page.signal });
  holdButton.addEventListener('click', () => {
    if (busy) return;
    dispatch({ type: 'hold' }); say('One intentional hold. Existing jobs and heat advanced; no new staff assignments.');
    if (session.state.phase !== 'service') showWrap();
  }, { signal: page.signal });
  query(page.root, '[data-restart]').addEventListener('click', restart, { signal: page.signal });
  mode.addEventListener('change', () => { dispatch(definition.parseCommand({ type: 'mode', value: mode.value })); }, { signal: page.signal });
  for (const hob of HOBS) query<HTMLSelectElement>(page.root, `[data-heat="${hob}"]`).addEventListener('change', event => {
    dispatch({ type: 'heat', hob, value: Number((event.target as HTMLSelectElement).value) });
  }, { signal: page.signal });
  prepContent.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || button.disabled || busy) return;
    if (button.dataset.layout) dispatch(definition.parseCommand({ type: 'layout', value: button.dataset.layout }));
    if (button.dataset.prestock) dispatch({ type: 'prestock', target: button.dataset.prestock });
  }, { signal: page.signal });
  tickets.addEventListener('click', event => {
    const ticket = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ticket]') : null;
    if (!ticket?.dataset.ticket) return;
    selected = ticket.dataset.ticket;
    const order = session.state.orders.find(item => item.id === selected)!;
    for (const button of tickets.querySelectorAll('[data-ticket]')) button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.ticket === selected));
    renderRecipe(order); recipeDialog.open();
  }, { signal: page.signal });
  recipeContent.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pin-ticket]') : null;
    if (button?.dataset.pinTicket && !busy) { dispatch({ type: 'pin', order: button.dataset.pinTicket }); recipeDialog.close(); }
  }, { signal: page.signal });
  wrapContent.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-wrap-next]')) return;
    if (session.state.phase === 'intermission') next(); else restart();
  }, { signal: page.signal });
  const motionButton = query<HTMLButtonElement>(page.root, '[data-motion]');
  function setPaused(value: boolean) {
    motionPaused = value; kitchen.setPaused(value); motionButton.setAttribute('aria-pressed', String(value));
    motionButton.textContent = value ? 'Animate' : 'Still life';
  }
  motionButton.addEventListener('click', () => setPaused(!motionPaused), { signal: page.signal });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });
  page.root.addEventListener('keydown', event => {
    const target = event.target;
    if (event.defaultPrevented || page.root.querySelector('dialog:modal') || !(target instanceof HTMLElement) ||
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); void pulse(); }
    else if (event.key.toLowerCase() === 'k') { event.preventDefault(); prepDialog.open(); }
    else if (event.key === '?') { event.preventDefault(); guide.open(); }
  }, { signal: page.signal });
  page.root.tabIndex = 0;
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, {
    gameId: 'mise', session, trigger: query(page.root, '[data-notebook]'),
    beforeRestore: () => { agent.cancel(); wrap.close(); recipeDialog.close(); prepDialog.close(); },
    afterRestore: render, onNotice: say,
  });
  setPaused(motionPaused); render();
  if (!notice.textContent) say('Arrange the island and prepare three components in Kitchen / prep.');
  return { destroy: page.destroy, setPaused, reset: restart };
}
