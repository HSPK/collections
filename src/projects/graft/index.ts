import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { choice } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { COLONIES, COLONY_IDS, EDITS, EDIT_LABELS, GOAL, SEASONS, distance } from './data';
import { definition, getTile, patches, stageEdits, totalSpores } from './engine';
import type { Edit, State } from './engine';
import { requestFor } from './agent';
import { createRenderer } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'graft');
  page.root.dataset.workspace = 'true';
  page.root.dataset.reducedMotion = String(context.reducedMotion);
  page.root.innerHTML = `
    <header class="graft-mast">
      <div class="graft-wordmark"><h1>Graft<span>.</span></h1><p>A small world, negotiated.</p></div>
      <nav aria-label="Graft tools"><button type="button" data-guide>Field guide</button><button type="button" data-notebook>Notebook</button><button type="button" data-restart>Restart</button></nav>
    </header>
    <div class="graft-season-strip">
      <div><span class="graft-eyebrow" data-chapter></span><strong data-season></strong></div>
      <p data-forecast></p>
      <p class="graft-goal" data-goal></p>
    </div>
    <main class="graft-workbench">
      <section class="graft-world" aria-label="Biome specimen">
        <div class="graft-annotations"><span>SPECIMEN / 076</span><button type="button" data-zoom aria-pressed="false">Lens +</button></div>
        <div class="graft-scene" data-project-preview data-scene tabindex="0" aria-label="Biome map. Arrow keys select adjacent sites."></div>
        <div class="graft-ending" data-ending hidden><span data-ending-label></span><h2 data-ending-title></h2><p data-ending-copy></p><button type="button" data-again>Grow another world</button></div>
        <div class="graft-legend" aria-label="Colony populations">${COLONY_IDS.map(id => `<button type="button" data-colony="${id}"><i class="graft-mark graft-mark-${id}"></i><span>${COLONIES[id].short}<small data-population="${id}"></small></span></button>`).join('')}</div>
      </section>
      <section class="graft-tending" aria-label="Season interventions">
        <div class="graft-tend-heading"><span class="graft-eyebrow">THE GARDENER'S HAND</span><h2>Tend. Then listen.</h2><p data-hint></p></div>
        <div class="graft-stock" aria-label="Intervention resources"><span><b data-water></b> water</span><span><b data-compost></b> compost</span><span><b data-tools></b> tools</span></div>
        <div class="graft-site-line"><label>Site <select data-tile aria-label="Site"></select></label><button type="button" data-inspect>Inspect</button></div>
        <p class="graft-tile-detail" data-tile-detail></p>
        <div class="graft-edit-line"><label class="graft-operation"><span class="graft-sr">Intervention</span><select data-edit aria-label="Intervention">${EDITS.map(kind => `<option value="${kind}">${EDIT_LABELS[kind]}</option>`).join('')}</select></label>
          <label data-destination-label hidden><span class="graft-sr">Destination</span><select data-destination aria-label="Destination"></select></label>
          <button type="button" data-stage>Stage</button></div>
        <div class="graft-draft-line"><p data-draft>0/3 staged · nothing spent</p><button type="button" data-undo disabled>Undo</button></div>
        <button type="button" class="graft-commit" data-commit>Ask colonies · season 1 <span aria-hidden="true">↗</span></button>
        <p class="graft-local-status" data-status role="status" aria-live="polite">First: shelter a founder, then let the colonies choose.</p>
      </section>
    </main>
    <footer class="graft-footer"><div data-agent-host></div><span class="graft-fiction">An invented ecology. Not biological advice.</span></footer>`;
  const get = <T extends Element>(selector: string) => query<T>(page.root, selector);
  const button = (selector: string) => get<HTMLButtonElement>(selector);
  const set = (selector: string, value: string) => { get<HTMLElement>(selector).textContent = value; };
  const session = new GameSession(definition, 76);
  let selected = patches(session.state, 'moss')[0].id;
  let edits: Edit[] = [];
  let draftRevision = session.revision;
  let busy = false;
  let zoom = false;
  let status = 'First: shelter a founder, then let the colonies choose.';
  const select = get<HTMLSelectElement>('[data-tile]');
  const operation = get<HTMLSelectElement>('[data-edit]');
  const destination = get<HTMLSelectElement>('[data-destination]');
  const scene = get<HTMLElement>('[data-scene]');
  function notice(message: string) {
    status = message;
    set('[data-status]', message);
  }
  function guarded(run: () => void) {
    try { run(); }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(error.message);
      page.report(error.message);
    }
  }
  function pick(id: string) {
    selected = getTile(session.state, id).id;
    render();
  }
  const renderer = createRenderer(scene, page.signal, pick);
  page.onCleanup(renderer.destroy);
  const agent = createAgentConsole(page, { gameId: 'graft', host: get('[data-agent-host]'),
    onBusyChange(value) { busy = value; render(); } });
  const guide = document.createElement('section');
  guide.className = 'graft-guide';
  guide.innerHTML = `<p class="graft-guide-intro">A field guide to living together.</p>
    <p>You are the gardener. Three model-driven colonies decide how to live in the soil you leave them. Six seasons pass through the Dew nursery, Glass drought, and Ember bloom. Nothing calls a model until you press <strong>Ask colonies</strong>.</p>
    <h3>Your first season</h3><p>Choose a founder with the Moss, Lichen, or Coral button. Select Shelter, then Stage. Repeat for the other founders. You have 10 tools, not an unlimited garden. Ask the colonies to forage and find new ground. Their choices are their own.</p>
    <h3>The archive</h3><p>After season six: keep <strong>all 3 lineages, 6 living patches, 18 total spores, and at least 3 spores per lineage</strong>. Any extinct lineage ends the campaign immediately. A smaller surviving garden still fails the final archive.</p>
    <h3>What the soil remembers</h3><p>Gold beads in a tile's cut edge are soil nutrients; blue pools are water. Fronds, rosettes, and branching fans identify the three colonies. Inspect a site or use Lens + to see its cells and cross-section.</p>
    <p>Each colony has 3 effort per season. Forage transfers up to 2 nutrients per effort from a nearby tile. Share gives 1 reserve per effort to a reachable neighbor. Spread always spends 2 reserve to bid for an adjacent patch. The strongest bid wins; occupied ground resists with biomass plus defense. Ties rotate Moss, Lichen, Coral each season. Defend prevents 1 dryness per effort on one owned patch.</p>
    <h3>Local resolution, not model magic</h3><p>Forage, share, then competing spread bids resolve first. Rain follows, then channels, drought, and upkeep. Every living patch consumes 1 reserve and 1 water after drought: it grows by 1 biomass, up to 3, and produces 1 spore. If either is missing, it instead loses 1 biomass. At zero it dies. A seedbank prevents one death, then disappears.</p>
    <p>A shelter prevents 2 dryness each season. Water or compost adds 3 units for 3 stock. A channel costs 2 tools and routes up to 2 water above the source's floor of 2, plus 1 nutrient when water flows, each season in placement order. Channels join adjacent soil tiles. A bridge costs 2 tools and enables sharing between two different colonies up to two hexes apart. A tile holds at most 12 water or soil nutrients and one structure.</p>
    <h3>Drafts &amp; controls</h3><p>Stage up to 3 interventions. Rust-dashed tiles and reserved stock are a draft, not an accepted move. Undo removes the last edit. Only a valid API season commits the whole draft. Failed, cancelled, or stale responses spend nothing. There is no offline colony substitute.</p>
    <p>Tap the map, use the Site selector, or focus the map and use arrow keys (Home selects Moss). Colony buttons jump to a living patch. Lens + magnifies the selected site. All other controls work with Tab and Enter. Shortcuts never run behind a modal.</p>
    <p>Notebook auto-saves accepted seasons and imports or exports validated replays without connection keys. Drafts are not saved. Restart cancels any request and returns to the same initial specimen. All organisms and rules here are fictional, not scientific claims.</p>`;
  createWorkspaceDialog(page, { id: 'graft-guide', title: 'Graft field guide', content: [guide], triggers: [button('[data-guide]')] });
  const inspection = document.createElement('section');
  inspection.className = 'graft-inspection';
  const inspector = createWorkspaceDialog(page, { id: 'graft-inspection', title: 'Under the lens', content: [inspection], triggers: [button('[data-inspect]')] });
  function fillInspector(state: State) {
    const tile = getTile(state, selected);
    inspection.replaceChildren();
    const paragraph = (value: string, heading = false) => {
      const node = document.createElement(heading ? 'h3' : 'p');
      node.textContent = value; inspection.append(node);
    };
    paragraph(`${tile.label} / ${tile.owner ? COLONIES[tile.owner].name : tile.rock ? 'Basalt' : 'Unclaimed soil'}`, true);
    paragraph(`Water ${tile.water}/12. Soil nutrients ${tile.nutrients}/12. Biomass ${tile.biomass}/3. Structure: ${tile.structure}.`);
    if (edits.length) paragraph('Showing your uncommitted intervention draft. A failed request leaves the accepted world unchanged.');
    for (const colony of state.colonies) {
      paragraph(`${COLONIES[colony.id].name} / ${patches(state, colony.id).length} patches / ${colony.reserve} reserve / ${colony.spores} spores`, true);
      paragraph(COLONIES[colony.id].objective);
      const intention = session.state.intentions.find(item => item.colony === colony.id);
      if (intention) paragraph(`Last public intention: ${intention.text}`);
    }
    paragraph('Last season, as resolved', true);
    if (!session.state.events.length) paragraph('No colony actions yet. The soil is waiting.');
    for (const event of session.state.events) paragraph(event.text);
    paragraph(`Nutrient ledger: ${state.mineralTotal} total, including ${state.spent} metabolized. Foraging, sharing and channels transfer, never create, nutrients.`);
  }
  function render() {
    if (draftRevision !== session.revision) {
      edits = [];
      draftRevision = session.revision;
    }
    const state = session.state;
    const live = state.phase === 'active';
    const draft = live ? stageEdits(state, edits) : state;
    const tile = getTile(draft, selected);
    const weather = SEASONS[Math.min(state.season, SEASONS.length - 1)];
    page.root.dataset.phase = state.phase;
    page.root.dataset.season = String(state.season);
    page.root.dataset.revision = String(session.revision);
    set('[data-chapter]', `${weather.chapter}. ${weather.biome}`);
    set('[data-season]', live ? `${weather.name} / ${state.season + 1} of 6` : `${state.season} seasons observed`);
    set('[data-forecast]', live ? `Rain +${weather.rain} / Dryness ${weather.drought}` : state.phase === 'won' ? 'Archive sealed' : 'Campaign ended');
    set('[data-goal]', `${COLONY_IDS.filter(id => patches(state, id).length).length}/3 lineages · ${patches(state).length}/${GOAL.patches} patches · ${totalSpores(state)}/${GOAL.spores} spores`);
    set('[data-hint]', weather.hint);
    set('[data-water]', String(draft.stock.water));
    set('[data-compost]', String(draft.stock.compost));
    set('[data-tools]', String(draft.stock.tools));
    get('[data-water]').parentElement!.title = `${state.stock.water} committed stock; ${state.stock.water - draft.stock.water} reserved in draft.`;
    get('[data-compost]').parentElement!.title = `${state.stock.compost} committed stock; ${state.stock.compost - draft.stock.compost} reserved in draft.`;
    get('[data-tools]').parentElement!.title = `${state.stock.tools} committed stock; ${state.stock.tools - draft.stock.tools} reserved in draft.`;
    if (!select.options.length) {
      for (const tile of state.tiles) {
        const option = document.createElement('option');
        option.value = tile.id; select.append(option);
      }
    }
    for (const option of select.options) {
      const cell = getTile(draft, option.value);
      option.textContent = `${cell.label} / ${cell.owner ? COLONIES[cell.owner].short : cell.rock ? 'Basalt' : 'Soil'}`;
    }
    select.value = selected;
    set('[data-tile-detail]', tile.rock ? 'Basalt / no interventions' :
      `${tile.water} water · ${tile.nutrients} soil · ${tile.biomass} growth · ${tile.structure}`);
    const route = operation.value === 'channel' || operation.value === 'bridge';
    get<HTMLElement>('[data-destination-label]').hidden = !route;
    const previous = destination.value;
    destination.replaceChildren();
    for (const other of draft.tiles.filter(other => !other.rock && other.id !== selected &&
      distance(tile, other) <= (operation.value === 'bridge' ? 2 : 1))) {
      const option = document.createElement('option');
      option.value = other.id; option.textContent = `To ${other.label}`; destination.append(option);
    }
    if ([...destination.options].some(option => option.value === previous)) destination.value = previous;
    set('[data-draft]', `${edits.length}/3 staged · ${edits.length ? 'stock reserved only' : 'nothing spent'}`);
    button('[data-stage]').disabled = busy || !live || edits.length >= 3;
    button('[data-undo]').disabled = busy || !live || edits.length === 0;
    operation.disabled = busy || !live;
    destination.disabled = busy || !live;
    button('[data-commit]').disabled = busy || !live;
    button('[data-commit]').textContent = busy ? 'Colonies are deciding…' : live ? `Ask colonies · season ${state.season + 1} ↗` : state.phase === 'won' ? 'Archive complete' : 'Campaign ended';
    for (const id of COLONY_IDS) {
      set(`[data-population="${id}"]`, `${patches(state, id).length} patches`);
    }
    get<HTMLElement>('[data-ending]').hidden = live;
    if (!live) {
      set('[data-ending-label]', state.phase === 'won' ? 'THE SEED ARCHIVE / COMPLETE' : 'FIELD NOTE / A FRAGILE BALANCE');
      set('[data-ending-title]', state.phase === 'won' ? 'A world worth carrying.' : 'Even small worlds can end.');
      set('[data-ending-copy]', state.ending);
    }
    set('[data-status]', status);
    renderer.draw(draft, selected, edits, zoom);
    fillInspector(draft);
  }
  function restart() {
    agent.cancel();
    edits = []; zoom = false;
    selected = patches(definition.create(session.seed), 'moss')[0].id;
    button('[data-zoom]').textContent = 'Lens +';
    button('[data-zoom]').setAttribute('aria-pressed', 'false');
    notice('Fresh specimen. No model called; all reservoirs restored.');
    session.reset();
  }
  select.addEventListener('change', () => pick(select.value), { signal: page.signal });
  operation.addEventListener('change', render, { signal: page.signal });
  button('[data-stage]').addEventListener('click', () => guarded(() => {
    if (busy) throw new AgentValidationError('Wait for the colonies or cancel their request before editing.');
    const kind = choice(operation.value, EDITS, 'Intervention');
    const edit: Edit = { kind, tile: selected, to: kind === 'channel' || kind === 'bridge' ? destination.value : '' };
    stageEdits(session.state, [...edits, edit]);
    edits = [...edits, edit];
    notice(`${kind} at ${getTile(session.state, selected).label} staged. Nothing is spent until a season commits.`);
    render();
  }), { signal: page.signal });
  button('[data-undo]').addEventListener('click', () => {
    if (busy) { notice('Cancel the pending plan before changing its draft.'); return; }
    edits = edits.slice(0, -1); notice('Last draft edit removed. Accepted world unchanged.'); render();
  }, { signal: page.signal });
  button('[data-commit]').addEventListener('click', async () => {
    if (busy || session.state.phase !== 'active') return;
    const captured = edits.map(edit => ({ ...edit }));
    const accepted = await agent.turn({
      ...requestFor(session, captured), label: `Graft / season ${session.state.season + 1}`,
      getRevision: () => session.revision,
      commit(plan) {
        // Clear only after preview succeeds; dispatch and the draft clear are synchronous.
        session.preview({ type: 'season', edits: captured, plan });
        edits = [];
        session.dispatch({ type: 'season', edits: captured, plan });
      },
    });
    if (page.signal.aborted) return;
    if (accepted) notice(session.state.phase === 'active' ? `Season ${session.state.season} committed. Inspect the colonies' intentions and local outcomes.` : session.state.ending);
    render();
  }, { signal: page.signal });
  button('[data-restart]').addEventListener('click', restart, { signal: page.signal });
  button('[data-again]').addEventListener('click', restart, { signal: page.signal });
  button('[data-zoom]').addEventListener('click', () => {
    zoom = !zoom;
    button('[data-zoom]').setAttribute('aria-pressed', String(zoom));
    button('[data-zoom]').textContent = zoom ? 'Whole biome' : 'Lens +';
    render();
  }, { signal: page.signal });
  for (const id of COLONY_IDS) {
    button(`[data-colony="${id}"]`).addEventListener('click', () => {
      const tile = patches(session.state, id)[0];
      if (tile) pick(tile.id);
      else { notice(`${COLONIES[id].name} has no surviving patches.`); inspector.open(); }
    }, { signal: page.signal });
  }
  scene.addEventListener('keydown', event => {
    if (page.root.querySelector('dialog[open]') || event.target !== scene || event.altKey || event.ctrlKey || event.metaKey) return;
    const tile = getTile(session.state, selected);
    const direction = event.key === 'ArrowLeft' ? [-1, 0] : event.key === 'ArrowRight' ? [1, 0] :
      event.key === 'ArrowUp' ? [0, -1] : event.key === 'ArrowDown' ? [0, 1] : null;
    if (direction) {
      event.preventDefault();
      const next = session.state.tiles.find(other => other.q === tile.q + direction[0] && other.r === tile.r + direction[1]);
      if (next) pick(next.id);
    } else if (event.key === 'Home') {
      event.preventDefault(); pick(patches(session.state, 'moss')[0]?.id ?? 't0');
    }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, { gameId: 'graft', session, trigger: button('[data-notebook]'),
    beforeRestore() { agent.cancel(); },
    afterRestore: render, onNotice: notice });
  render();
  return { destroy: page.destroy, reset: restart };
}
