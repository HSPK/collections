import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { CASES, CIRCUIT_IDS, GUARD_IDS } from './data';
import { create, parsePlan, reduce, turnTarget } from './engine';
import type { Intent, Plan, State } from './engine';

export type { Plan } from './engine';
export const patrolTool = defineTool<Plan>({
  name: 'assign_clockwork_patrol',
  description: 'Assign both wardens to distinct named legal circuits in the target district. Offset is a circuit index. The local engine executes every patrol beat.',
  parameters: schema.object({
    assignments: schema.array(schema.object({
      guard: schema.enum(GUARD_IDS),
      circuit: schema.enum(CIRCUIT_IDS),
      offset: schema.integer(0, 2),
    }), 2, 2),
    bulletin: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => `${plan.assignments.map(a => `${a.guard}: ${a.circuit} @${a.offset}`).join(' / ')}. ${plan.bulletin}`,
});

export const ROLE = `You are the Brass Warden of an original clockwork city, opposing a time-loop courier.
Choose the next patrol, not narration. Assign needle and rivet once each to TWO DIFFERENT legal circuits from this observation; offset 0..2.
Use recorded courier routes to adapt: cover their repeated approaches and choose offsets that intercept at the same beat.
On the opening turn, cover plausible vault approaches. On rewinds, the old route becomes an echo: it can hold switches and lure each guard once, pausing that guard for a beat.
The courier starts at dock. Each local move, wait or delivery advances all guards by one circuit index. Same-node and edge-swap collisions add 2 alarm per guard.
Circuits, clock budgets, edges and scoring cannot be changed. Do not invent nodes, guards or routes. Your bulletin is a public tactical warning of at most 180 characters.
Plans are immutable until the next rewind or heist. Choose a challenging lawful plan; never claim to move the player.`;

export function observation(state: State, intent: Intent) {
  const index = turnTarget(state, intent);
  const heist = CASES[index];
  return {
    intent, district: heist.id, heist: index + 1,
    loop: intent === 'rewind' ? state.loop + 1 : 1,
    limits: { ...state.settings[index], assignments: 2, distinctCircuits: true, offset: [0, 2], bulletinCharacters: 180 },
    guards: GUARD_IDS,
    objective: { start: 'dock', parcel: 'vault', delivery: 'drop' },
    edges: heist.edges.map(e => [e.a, e.b, ...(e.switch ? [`held:${e.switch}`] : [])]),
    legalCircuits: heist.circuits.map(c => ({ id: c.id, nodes: c.nodes })),
    recordedRoutes: [
      ...state.archives.filter(r => r.heist === index),
      ...(intent === 'rewind' ? [{ heist: state.heist, loop: state.loop, path: state.trace, outcome: state.phase }] : []),
    ].map(r => ({ loop: r.loop, path: r.path, outcome: r.outcome })),
    echoRule: 'Recorded position at each beat; final address held until loop ends. Latest two recordings survive. A guard pauses once if its next node has an echo at the next beat.',
    previousPatrol: intent === 'rewind' ? state.guards.map(g => ({ guard: g.guard, circuit: g.circuit, offset: g.offset })) : [],
  };
}

export function requestFor(state: State, intent: Intent): AgentRequest<Plan> {
  return {
    system: ROLE, observation: observation(state, intent), tool: patrolTool,
    validate: plan => { reduce(state, { type: 'plan', intent, plan }); },
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = create(72);
  return {
    request: requestFor(state, 'start'),
    verify(plan) {
      const next = reduce(state, { type: 'plan', intent: 'start', plan });
      requireRule(next.phase === 'running' && next.loop === 1 && next.guards.length === 2 && next.tick === 0,
        'A patrol must open a real playable loop without charging a move.');
      const stepped = reduce(next, { type: 'wait' });
      requireRule(stepped.tick === 1 && stepped.guards.every((g, i) => g.index !== next.guards[i].index),
        'The selected patrol must mechanically advance on the first local beat.');
    },
  };
}
