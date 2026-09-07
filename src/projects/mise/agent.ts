import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { GameSession } from '../../core/games/session';
import { RECIPES, SHIFTS, STAFF, STAFF_IDS } from './data';
import { definition, parsePlan, tasksFor } from './engine';
import type { Plan, State } from './engine';

export type { Plan } from './engine';
export const crewTool = defineTool<Plan>({
  name: 'coordinate_mise',
  description: 'Assign exactly one catalog task to each of Nell, Sol and Ivo for one kitchen beat. Station and ingredient reservations are validated together.',
  parameters: schema.object({
    assignments: schema.array(schema.object({ staff: schema.enum(STAFF_IDS), taskId: schema.string() }), 3, 3),
    intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => plan.intention,
});
export const SYSTEM = `You coordinate three autonomous fictional staff at The Little Copper, a miniature bistro.
Return a complete plan for ONE beat, with each staff ID exactly once, using ONLY their legal catalog taskIds.
Prioritize serving plated tickets, then plating ready dishes (especially hot pans), then cooking prepared components, then prep.
All assignments start together from the observation. Never assign two staff the same target or station. Shared pantry stock cannot be overspent.
Busy staff must continue. Free staff may wait when no useful nonconflicting task remains. Choose useful work rather than all waiting.
Nell specializes in prep, Sol earns cooking quality, Ivo specializes in plating and serving. Respect the player's pinned ticket and mode.
Prep consumes real ingredients; cold components become ready after prep, hot ones must cook.
Cooking is unattended after loading. Every accepted beat adds the player's heat setting (0/1/2/3).
Ready hot components BURN at required heat + 4 unless plated or the player turns down the hob.
Plating reserves the pass and removes ALL components from their hobs; it needs every component ready before this beat.
Serving is a separate action on a plated ticket and must finish no later than its deadline. No dish-ready or scoring declarations exist.
Forecast tickets may be prepped and cooked early, but cannot be plated before arrival.
The local reducer alone advances jobs, heat, stock, deadlines, quality and score. Keep the public intention short.`;

export function observation(state: State) {
  return {
    game: 'Mise', restaurant: 'The Little Copper', phase: state.phase, shift: state.shift + 1,
    beat: state.tick, beatsLeft: SHIFTS[state.shift].clock - state.tick,
    objective: { minimumServed: SHIFTS[state.shift].goal, minimumAverageQuality: 62, maximumCampaignMisses: 1, satisfactionFloor: 45 },
    player: { layout: state.layout, priority: state.mode, pinnedTicket: state.pin, hobs: state.hobs },
    budgets: { assignments: 3, perStaff: 1, perStation: 1, perTarget: 1, stock: state.stock },
    rules: { simultaneousStart: true, arrivalAllowsPlating: true, burnMargin: 4, clockAdvances: 1 },
    recipes: Object.fromEntries([...new Set(state.orders.map(order => order.recipe))].map(id => [id, RECIPES[id]])),
    orders: state.orders, jobs: state.jobs,
    crew: STAFF.map(staff => ({ ...staff, activity: state.activity[staff.id], legalTasks: tasksFor(state, staff.id) })),
    result: { served: state.served, missed: state.missed, satisfaction: state.satisfaction },
  };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 79);
  session.dispatch({ type: 'open' });
  const before = JSON.stringify(session.state.stock);
  return {
    request: {
      system: SYSTEM, observation: observation(session.state), tool: crewTool,
      validate: plan => { session.preview({ type: 'plan', plan }); },
    },
    verify(plan) {
      session.dispatch({ type: 'plan', plan });
      requireRule(session.state.tick === 1, 'The real service clock must advance exactly one beat.');
      requireRule(JSON.stringify(session.state.stock) !== before, 'The staff must start real prep, consuming reserved ingredients.');
      requireRule(session.state.orders.some(order => order.parts.some(part => part.stage !== 'raw')), 'The plan must actually advance the recipe dependency graph.');
    },
  };
}
