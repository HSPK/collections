import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { COLONIES, COLONY_IDS, EDITS, ENERGY, GOAL, MAX_EDITS, SEASONS, distance } from './data';
import type { ActionKind, ColonyId, EditKind } from './data';

export interface Tile {
  id: string; label: string; q: number; r: number;
  rock: boolean; water: number; nutrients: number;
  owner: ColonyId | null; biomass: number;
  structure: 'none' | 'shelter' | 'seedbank';
}
export interface Colony { id: ColonyId; reserve: number; spores: number }
export interface Link { kind: 'channel' | 'bridge'; from: string; to: string }
export interface Edit { kind: EditKind; tile: string; to: string }
export interface Allocation { id: string; effort: number }
export interface ColonyPlan { colony: ColonyId; intention: string; actions: Allocation[] }
export interface Plan { season: number; colonies: ColonyPlan[] }
export interface Command { type: 'season'; edits: Edit[]; plan: Plan }
export interface Event { colony: ColonyId | null; tile: string; text: string; kind: ActionKind | 'climate' }
export interface State {
  seed: number; season: number; phase: 'active' | 'won' | 'lost';
  tiles: Tile[]; colonies: Colony[]; links: Link[];
  stock: { water: number; compost: number; tools: number };
  spent: number; mineralTotal: number;
  events: Event[]; intentions: { colony: ColonyId; text: string }[];
  ending: string;
}
export interface LegalAction { id: string; kind: ActionKind; tile: string; target: string; effect: string }

function copy(state: State): State {
  return { ...state, tiles: state.tiles.map(tile => ({ ...tile })), colonies: state.colonies.map(colony => ({ ...colony })),
    links: state.links.map(link => ({ ...link })), stock: { ...state.stock }, events: [], intentions: [] };
}

export function create(seed: number): State {
  integer(seed, 'Seed', 0, 0xffffffff);
  const tiles: Tile[] = [];
  for (let r = -2; r <= 2; r++) {
    let column = 0;
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) > 2) continue;
      const owner = COLONY_IDS.find(id => COLONIES[id].q === q && COLONIES[id].r === r) ?? null;
      const rock = (q === -2 && r === 2) || (q === 2 && r === -2);
      tiles.push({
        id: `t${tiles.length}`, label: `${String.fromCharCode(65 + r + 2)}${++column}`, q, r, rock,
        water: rock ? 0 : q === 0 && r === 0 ? 7 : 4,
        nutrients: rock ? 0 : 5 + ((seed + tiles.length * 7) % 3), owner, biomass: owner ? 2 : 0, structure: 'none',
      });
    }
  }
  const colonies = COLONY_IDS.map(id => ({ id, reserve: 3, spores: 0 }));
  const state: State = { seed, season: 0, phase: 'active', tiles, colonies, links: [],
    stock: { water: 12, compost: 9, tools: 10 }, spent: 0, mineralTotal: 0, events: [], intentions: [], ending: '' };
  state.mineralTotal = mineralBalance(state);
  return state;
}

export function mineralBalance(state: State): number {
  return state.tiles.reduce((sum, tile) => sum + tile.nutrients, 0) +
    state.colonies.reduce((sum, colony) => sum + colony.reserve, 0) + state.stock.compost + state.spent;
}
export function patches(state: State, colony?: ColonyId): Tile[] {
  return state.tiles.filter(tile => tile.owner !== null && (colony === undefined || tile.owner === colony));
}
export function totalSpores(state: State): number {
  return state.colonies.reduce((sum, colony) => sum + colony.spores, 0);
}
export function getTile(state: State, id: string): Tile {
  const tile = state.tiles.find(item => item.id === id);
  requireRule(tile, `Unknown biome tile: ${id}.`);
  return tile;
}
function getColony(state: State, id: ColonyId): Colony {
  const colony = state.colonies.find(item => item.id === id);
  requireRule(colony, 'Unknown colony.');
  return colony;
}
function active(state: State): void {
  requireRule(state.phase === 'active' && state.season < SEASONS.length, 'This campaign has ended. Restart to tend another biome.');
}
function spendTools(state: State): void {
  requireRule(state.stock.tools >= 2, 'Not enough tools. Each structure or route costs 2 tools.');
  state.stock.tools -= 2;
}

export function stageEdits(state: State, edits: readonly Edit[]): State {
  active(state);
  requireRule(edits.length <= MAX_EDITS, `Stage at most ${MAX_EDITS} interventions in one season.`);
  const draft = copy(state);
  for (const edit of edits) {
    const tile = getTile(draft, edit.tile);
    requireRule(!tile.rock, 'Basalt cannot be watered, planted, or built on.');
    if (edit.kind !== 'channel' && edit.kind !== 'bridge') requireRule(edit.to === '', 'Only routes have a destination.');
    if (edit.kind === 'water' || edit.kind === 'compost') {
      const resource = edit.kind === 'water' ? 'water' : 'compost';
      requireRule(draft.stock[resource] >= 3, `Not enough ${resource}; this intervention costs 3.`);
      requireRule((edit.kind === 'water' ? tile.water : tile.nutrients) <= 9, 'This tile can hold at most 12 units. Choose a less full tile.');
      draft.stock[resource] -= 3;
      if (edit.kind === 'water') tile.water += 3;
      else tile.nutrients += 3;
    } else if (edit.kind === 'shelter' || edit.kind === 'seedbank') {
      requireRule(tile.structure === 'none', 'This tile already has a structure.');
      spendTools(draft);
      tile.structure = edit.kind;
    } else {
      const to = getTile(draft, edit.to);
      requireRule(!to.rock && tile.id !== to.id, 'Routes need two different soil tiles.');
      requireRule(distance(tile, to) <= (edit.kind === 'channel' ? 1 : 2), 'That destination is out of route range.');
      requireRule(!draft.links.some(link => link.kind === edit.kind &&
        ((link.from === tile.id && link.to === to.id) || (link.to === tile.id && link.from === to.id))), 'These tiles already have that route.');
      if (edit.kind === 'bridge') {
        requireRule(tile.owner !== null && to.owner !== null && tile.owner !== to.owner, 'A symbiosis bridge must join two different living colonies.');
      }
      spendTools(draft);
      draft.links.push({ kind: edit.kind, from: tile.id, to: to.id });
    }
  }
  requireRule(mineralBalance(draft) === state.mineralTotal, 'The nutrient ledger did not balance.');
  return draft;
}

export function catalog(state: State, colony: ColonyId): LegalAction[] {
  if (state.phase !== 'active') return [];
  const owned = patches(state, colony);
  const result: LegalAction[] = [];
  const add = (kind: ActionKind, tile: Tile, effect: string) => {
    result.push({ id: `${colony}.${kind}.${tile.id}`, kind, tile: tile.id, target: tile.label, effect });
  };
  for (const tile of state.tiles) {
    if (tile.rock) continue;
    const near = owned.some(root => distance(root, tile) <= 1);
    if (near && tile.nutrients > 0) add('forage', tile, 'Transfer up to 2 soil nutrients per effort into your reserve; shared soil uses seasonal priority.');
    if (tile.owner === colony) add('defend', tile, 'Prevent 1 dryness per effort on this patch; also resist rival spread.');
    if (near && tile.owner !== colony) add('spread', tile, 'Spend 2 reserve to bid for one patch. Higher effort wins; occupied targets also resist with biomass + defense.');
    const connected = owned.some(root => state.links.some(link => link.kind === 'bridge' &&
      ((link.from === root.id && link.to === tile.id) || (link.to === root.id && link.from === tile.id))));
    if (tile.owner !== null && tile.owner !== colony && (near || connected)) {
      add('share', tile, `Give exactly 1 reserve per effort to ${tile.owner}.`);
    }
  }
  return result;
}

export function parsePlan(value: unknown): Plan {
  const plan = object(value, ['season', 'colonies'], 'Colony plan');
  return {
    season: integer(plan.season, 'Season', 1, SEASONS.length),
    colonies: array(plan.colonies, entry => {
      const colony = object(entry, ['colony', 'intention', 'actions'], 'Colony decision');
      return {
        colony: choice(colony.colony, COLONY_IDS, 'Colony'),
        intention: text(colony.intention, 'Public intention', 140),
        actions: array(colony.actions, value => {
          const action = object(value, ['id', 'effort'], 'Allocation');
          return { id: text(action.id, 'Action ID', 60), effort: integer(action.effort, 'Effort', 1, ENERGY) };
        }, 'Allocations', 1, ENERGY),
      };
    }, 'Colonies', 3, 3),
  };
}
export function parseEdit(value: unknown): Edit {
  const edit = object(value, ['kind', 'tile', 'to'], 'Intervention');
  return { kind: choice(edit.kind, EDITS, 'Intervention'), tile: text(edit.tile, 'Tile', 8), to: text(edit.to, 'Destination', 8, 0) };
}
export function parseCommand(value: unknown): Command {
  const command = object(value, ['type', 'edits', 'plan'], 'Season command');
  requireRule(command.type === 'season', 'Only a coordinated season can advance this game.');
  return { type: 'season', edits: array(command.edits, parseEdit, 'Interventions', 0, MAX_EDITS), plan: parsePlan(command.plan) };
}

export function reduce(state: State, command: Command): State {
  active(state);
  requireRule(command.type === 'season', 'Unknown campaign command.');
  requireRule(command.plan.season === state.season + 1, 'The colony plan is for a different season.');
  const next = stageEdits(state, command.edits);
  const plan = command.plan;
  requireRule(plan.colonies.length === 3 && new Set(plan.colonies.map(item => item.colony)).size === 3, 'Each of the three colonies must decide exactly once.');
  const ordered = [...COLONY_IDS.slice(state.season % 3), ...COLONY_IDS.slice(0, state.season % 3)];
  const resolved: { colony: ColonyId; action: LegalAction; effort: number }[] = [];
  for (const id of ordered) {
    const decision = plan.colonies.find(item => item.colony === id);
    requireRule(decision, 'Every colony needs a decision.');
    requireRule(decision.actions.length >= 1 && decision.actions.length <= ENERGY, 'Each colony needs 1-3 allocations.');
    requireRule(new Set(decision.actions.map(item => item.id)).size === decision.actions.length, 'Do not repeat an action ID.');
    requireRule(decision.actions.reduce((sum, item) => sum + item.effort, 0) <= ENERGY, 'Each colony has only 3 effort per season.');
    const legal = catalog(next, id);
    for (const allocation of [...decision.actions].sort((a, b) => a.id.localeCompare(b.id))) {
      integer(allocation.effort, 'Effort', 1, ENERGY);
      const action = legal.find(item => item.id === allocation.id);
      requireRule(action, `Illegal action ID for ${id}: ${allocation.id}. Choose from its current catalog.`);
      resolved.push({ colony: id, action, effort: allocation.effort });
    }
  }
  const log = (colony: ColonyId | null, tile: string, kind: Event['kind'], message: string) => next.events.push({ colony, tile, kind, text: message });
  const shields = new Map<string, number>();
  for (const { colony, action, effort } of resolved) {
    if (action.kind === 'defend') {
      shields.set(action.tile, effort);
      log(colony, action.tile, 'defend', `${COLONIES[colony].short} defended ${action.target} against ${effort} dryness.`);
    }
    if (action.kind !== 'forage') continue;
    const tile = getTile(next, action.tile);
    const amount = Math.min(tile.nutrients, effort * 2);
    tile.nutrients -= amount;
    getColony(next, colony).reserve += amount;
    log(colony, tile.id, 'forage', `${COLONIES[colony].short} foraged ${amount} nutrients at ${tile.label}.`);
  }
  for (const { colony, action, effort } of resolved.filter(item => item.action.kind === 'share')) {
    const donor = getColony(next, colony);
    const target = getTile(next, action.tile);
    requireRule(target.owner !== null && target.owner !== colony, 'Sharing needs a different living colony.');
    requireRule(donor.reserve >= effort, `${COLONIES[colony].short} cannot afford its donation after foraging.`);
    donor.reserve -= effort;
    getColony(next, target.owner).reserve += effort;
    log(colony, target.id, 'share', `${COLONIES[colony].short} shared ${effort} nutrients with ${COLONIES[target.owner].short} at ${target.label}.`);
  }
  const bids = new Map<string, { colony: ColonyId; effort: number }[]>();
  for (const { colony, action, effort } of resolved.filter(item => item.action.kind === 'spread')) {
    const actor = getColony(next, colony);
    requireRule(actor.reserve >= 2, `${COLONIES[colony].short} needs 2 reserve per spread after foraging and sharing.`);
    actor.reserve -= 2;
    next.spent += 2;
    const entries = bids.get(action.tile) ?? [];
    entries.push({ colony, effort });
    bids.set(action.tile, entries);
  }
  for (const [id, entries] of bids) {
    const tile = getTile(next, id);
    // Stable sorting preserves the published rotating priority for equal bids.
    entries.sort((a, b) => b.effort - a.effort);
    const winner = entries[0];
    const resistance = tile.owner ? tile.biomass + (shields.get(id) ?? 0) : 0;
    for (const entry of entries) {
      const wins = entry === winner && entry.effort > resistance;
      log(entry.colony, id, 'spread', `${COLONIES[entry.colony].short} ${wins ? 'rooted in' : 'failed to claim'} ${tile.label}; 2 nutrients metabolized.`);
    }
    if (winner.effort > resistance) {
      tile.owner = winner.colony;
      tile.biomass = 1;
      shields.delete(id);
    }
  }
  const weather = SEASONS[state.season];
  for (const tile of next.tiles) if (!tile.rock) tile.water = Math.min(12, tile.water + weather.rain);
  for (const link of next.links.filter(item => item.kind === 'channel')) {
    const from = getTile(next, link.from), to = getTile(next, link.to);
    const flow = Math.min(2, Math.max(0, from.water - 2), 12 - to.water);
    from.water -= flow; to.water += flow;
    const minerals = flow > 0 && from.nutrients > 0 && to.nutrients < 12 ? 1 : 0;
    from.nutrients -= minerals; to.nutrients += minerals;
    log(null, to.id, 'climate', `${from.label} routed ${flow} water and ${minerals} nutrient to ${to.label}.`);
  }
  for (const tile of next.tiles) {
    if (tile.rock) continue;
    const protection = (tile.structure === 'shelter' ? 2 : 0) + (shields.get(tile.id) ?? 0);
    tile.water = Math.max(0, tile.water - Math.max(0, weather.drought - protection));
    if (!tile.owner) continue;
    const colony = getColony(next, tile.owner);
    if (tile.water >= 1 && colony.reserve >= 1) {
      colony.reserve--; next.spent++; tile.water--;
      tile.biomass = Math.min(3, tile.biomass + 1);
      colony.spores++;
    } else {
      tile.biomass--;
      log(tile.owner, tile.id, 'climate', `${COLONIES[tile.owner].short} at ${tile.label} withered: ${tile.water < 1 ? 'dry soil' : 'empty reserve'}.`);
      if (tile.biomass <= 0 && tile.structure === 'seedbank') {
        tile.biomass = 1; tile.structure = 'none';
        log(tile.owner, tile.id, 'climate', `The one-use seedbank preserved ${tile.label}. It still needs water and food next season.`);
      } else if (tile.biomass <= 0) {
        log(tile.owner, tile.id, 'climate', `${COLONIES[tile.owner].short} lost ${tile.label}.`);
        tile.owner = null; tile.biomass = 0;
      }
    }
  }
  next.intentions = plan.colonies.map(item => ({ colony: item.colony, text: item.intention }));
  next.season++;
  const extinct = COLONY_IDS.filter(id => patches(next, id).length === 0);
  if (extinct.length) {
    next.phase = 'lost';
    next.ending = `Ecology collapsed. ${extinct.map(id => COLONIES[id].short).join(' and ')} left no living patch. Every lineage matters.`;
  } else if (next.season === SEASONS.length) {
    const enough = totalSpores(next) >= GOAL.spores && next.colonies.every(colony => colony.spores >= GOAL.each) && patches(next).length >= GOAL.patches;
    next.phase = enough ? 'won' : 'lost';
    next.ending = enough ? 'A world worth carrying. Three lineages survived, and the spore archive can seed another biome.' :
      'The archive is incomplete. All lineages must survive with 6 patches, 18 spores in total, and at least 3 spores each.';
  }
  requireRule(mineralBalance(next) === next.mineralTotal, 'The nutrient ledger did not balance.');
  return next;
}

export const definition: GameDefinition<State, Command> = { id: 'graft', create, reduce, parseCommand };

export function observation(state: State, edits: readonly Edit[]) {
  const draft = stageEdits(state, edits);
  return {
    game: 'Graft / fictional ecology', season: state.season + 1, campaignLength: SEASONS.length,
    forecast: SEASONS[state.season], nextForecast: SEASONS[state.season + 1] ?? null,
    goal: { ...GOAL, allLineagesMustSurvive: true }, stagedInterventions: edits,
    priority: [...COLONY_IDS.slice(state.season % 3), ...COLONY_IDS.slice(0, state.season % 3)],
    rules: {
      effortPerColony: ENERGY, allocationRange: [1, 3], totalEffortAtMost: ENERGY,
      order: 'forage, share, simultaneous spread bids, rain, channels in placement order, drought, tile upkeep in tile order',
      forage: '2 nutrients per effort, limited by soil. Shared deposits use priority. No nutrients are created.',
      spread: 'Every bid costs 2 reserve, even if it fails. Highest effort wins, ties use priority. Must beat incumbent biomass + defense. New biomass is 1.',
      share: 'Donate exactly effort nutrients to the owner of the catalog target. Must afford all actions after forage.',
      upkeep: 'Each owned patch needs 1 reserve and 1 water AFTER drought; consumes both, gains 1 biomass (max 3) and 1 spore. Otherwise loses 1 biomass. Zero biomass dies.',
      protection: 'Shelter prevents 2 drought; defend prevents effort drought at one tile. Seedbank prevents one death at biomass 1, then disappears.',
      channels: 'After rain, move up to 2 water above a source floor of 2, and 1 soil nutrient if any water flows. Tile capacity 12.',
      loss: 'Immediate loss if any colony has no living patches. Final quotas checked only after season 6.',
    },
    stockAfterDraft: draft.stock, links: draft.links, tiles: draft.tiles,
    colonies: draft.colonies.map(colony => ({
      ...colony, objective: COLONIES[colony.id].objective, effortBudget: ENERGY,
      patches: patches(draft, colony.id).map(tile => tile.id), legalActions: catalog(draft, colony.id),
    })),
  };
}
