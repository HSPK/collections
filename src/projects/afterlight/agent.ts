import type { AgentRequest } from '../../core/agents/client';
import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import { CREW, CREW_IDS, DOORS, ROOMS } from './data';
import type { Plan, State } from './data';
import { catalog, create, forecast, parsePlan, powered, reduce } from './engine';

export type { Plan } from './data';
export const crewTool = defineTool<Plan>({
  name: 'coordinate_afterlight_crew',
  description: 'Commit one coordinated tactical turn. Copy one current legal action ID per crew. The authoritative game, not the model, resolves movement, pressure, resources, rescue and extraction.',
  parameters: schema.object({
    tick: schema.integer(0, 36),
    actions: schema.array(schema.object({
      crew: schema.enum(CREW_IDS), action: schema.string(), intention: schema.string(),
    }), 3, 3),
  }),
  parse: parsePlan,
  summarize: plan => plan.actions.map(action => `${action.crew}: ${action.intention}`).join(' / '),
});

export const SYSTEM = `You are the three-person salvage crew of AFTERLIGHT, a fictional derelict ring ship.
Vale is the systems engineer with an arc spanner and 3 patches. Iona is the medic with a one-pod harness and 2 medkits. Moth is a pathfinder with a depth-2 scanner and 2 cells.
Return the single coordinated tool call: the observed tick and exactly one action for each crew. Copy action IDs from their current legal catalogs; use at most 5 total AP. Rest costs 0 AP and restores energy, but every accepted turn consumes oxygen and the orbital deadline. Catalogs are a starting-state snapshot: handoffs happen at starting locations, and cannot unlock a repair in the same turn. Never invent an action, resource, path or success.
Mission: explore enough to reach both pods and archive; Vale must repair reactor (patch+cell) and life support (patch); Iona must release and deliver each pod to dock separately; Moth must recover and deliver the core; all three return to dock and Vale uses extract. Cargo is not saved until deliver. Never spend Moth's last cell except on the core unless the workshop cache can replace it.
A good opening is Moth handing a cell to Vale, Vale moving toward reactor via life, and Iona moving toward medbay. Scan unknown rooms before entering. Balanced power needs a repaired reactor; rescue routing powers pods, salvage powers the core and reactor. Only the captain can change routing, bulkheads and EVA permits. Work within these settings and explain any blocker in a short public intention.
Captain priority and individual targets guide you, but survival, inventory handoffs and prerequisites take precedence. Plan real graph paths and efficient parallel jobs; do not idle everyone if progress is legal. Carrying a pod/core means heading to dock to deliver it, not seeking more cargo. Watch energy, EVA suit air, closed bulkheads and the evacuation forecast. Release the whole team to extraction once all objectives are secured.
Public intentions are <=140 characters, concise operational statements, not private reasoning. No code, external calls, scoring or world-state claims.`;

export function observation(state: State) {
  return {
    mission: 'AFTERLIGHT / rescue two pods, stabilize reactor + scrubber, retrieve core, bring all three crew to dock, explicitly extract',
    tick: state.tick, status: state.status, actionPointBudget: 5, inventoryCapacity: 6, maximumStepsPerMove: 2,
    orders: state.orders, conditions: state.conditions, oxygenReserve: state.oxygen, hull: state.hull,
    objectives: { repaired: state.repaired, pods: state.pods, core: state.core, workshopCacheAvailable: state.supplies },
    rooms: state.rooms.map(room => ({
      id: room.id, name: ROOMS.find(entry => entry.id === room.id)!.name,
      deck: ROOMS.find(entry => entry.id === room.id)!.deck,
      surveyed: room.known, pressure: room.known ? room.pressure : 'unknown',
      powered: powered(state, room.id),
      purpose: room.known ? ROOMS.find(entry => entry.id === room.id)!.function : 'Survey required before entering',
    })),
    graph: DOORS.map(door => ({ ...door, open: state.orders.doors.find(entry => entry.id === door.id)!.open })),
    crew: state.crew.map(crew => ({
      ...crew, role: CREW.find(entry => entry.id === crew.id)!.role,
      equipment: CREW.find(entry => entry.id === crew.id)!.equipment,
      legalActions: catalog(state, crew),
    })),
    forecast: forecast(state),
    lastAcceptedJobs: state.jobs,
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = create(78);
  const command = (plan: Plan) => ({ type: 'turn' as const, conditions: state.conditions, orders: state.orders, plan });
  return {
    request: { system: SYSTEM, observation: observation(state), tool: crewTool, validate: plan => { reduce(state, command(plan)); } },
    verify(plan) {
      const next = reduce(state, command(plan));
      requireRule(next.tick === 1 && next.oxygen < state.oxygen && next.hull < state.hull, 'The opening must advance real ship hazards.');
      requireRule(next.jobs.length === 3 && plan.actions.some(action => action.action !== 'rest'), 'The opening must coordinate three crew and do useful work.');
      requireRule(next.crew.some((crew, index) => crew.room !== state.crew[index].room ||
        crew.inventory.cell !== state.crew[index].inventory.cell) ||
        next.rooms.filter(room => room.known).length > state.rooms.filter(room => room.known).length,
      'The opening must produce actual movement, equipment transfer or exploration.');
    },
  };
}
