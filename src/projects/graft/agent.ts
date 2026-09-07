import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { COLONY_IDS, SEASONS } from './data';
import { definition, mineralBalance, observation, parsePlan, patches } from './engine';
import type { Command, Edit, Plan, State } from './engine';

export type { Plan } from './engine';
export const system = `You voice three distinct fictional organism colonies in Graft, a finite ecology strategy game.
Velvet moss values expansion; Lantern lichen values mutual aid; Paper coral values conservation.
Make a genuine bounded decision for EACH colony, reconciling those objectives with survival of all three.
Use only the legal action IDs in each colony's catalog. Each colony has at most 3 effort, not 3 per action.
Return exactly one decision per colony, 1-3 unique allocations per colony, and one short public intention each.
Read soil nutrients, water, reserves, spatial targets and the forecast. Forage before reserves empty.
Every spread bid costs 2 reserve; all owned patches then need 1 reserve and 1 water each.
Target and effort matter: defend protects one patch, sharing supplies another colony, spread competes spatially.
The tool cannot change weather, biology, score, resources, or any world state directly.
This is an invented model, not a scientific claim. Do not explain private reasoning or invent actions.`;

export const tool = defineTool<Plan>({
  name: 'coordinate_graft_colonies',
  description: 'Choose bounded forage, spread, share, or defend allocations for three distinct colonies for one Graft season.',
  parameters: schema.object({
    season: schema.integer(1, SEASONS.length),
    colonies: schema.array(schema.object({
      colony: schema.enum(COLONY_IDS), intention: schema.string(),
      actions: schema.array(schema.object({ id: schema.string(), effort: schema.integer(1, 3) }), 1, 3),
    }), 3, 3),
  }),
  parse: parsePlan,
  summarize: plan => plan.colonies.map(colony => `${colony.colony}: ${colony.intention} [${colony.actions.map(action => `${action.id} x${action.effort}`).join(', ')}]`).join(' / '),
});

export function requestFor(session: GameSession<State, Command>, edits: Edit[]): AgentRequest<Plan> {
  return {
    system, observation: observation(session.state, edits), tool,
    validate: plan => { session.preview({ type: 'season', edits, plan }); },
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 76);
  const edits: Edit[] = patches(session.state).map(tile => ({ kind: 'shelter', tile: tile.id, to: '' }));
  const request = requestFor(session, edits);
  return {
    request,
    verify(plan) {
      request.validate(plan);
      const before = session.state;
      const after = session.dispatch({ type: 'season', edits, plan });
      requireRule(after.season === 1 && after.stock.tools === 4, 'The first season and its three shelters must commit together.');
      requireRule(after.events.some(event => event.kind !== 'climate'), 'The colonies must actually act.');
      requireRule(after.colonies.some((colony, i) => colony.reserve !== before.colonies[i].reserve) ||
        after.tiles.some((tile, i) => tile.owner !== before.tiles[i].owner || tile.water !== before.tiles[i].water),
      'The accepted targets and allocations must affect the biome.');
      requireRule(mineralBalance(after) === before.mineralTotal, 'Nutrients must be conserved.');
    },
  };
}
