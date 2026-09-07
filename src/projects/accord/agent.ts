import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import {
  DELEGATE_IDS, DELEGATES, FIELDS, HEARING_COST, MAX_AMENDMENTS, MAX_HEARINGS, SEASONS, VOTES, WORKS,
} from './data';
import type { Plan, State } from './data';
import { create, forecast, legalOffers, legalVotes, parsePlan, projectPolicy, reduce, supportRule } from './engine';

export type { Plan } from './data';

export const councilTool = defineTool<Plan>({
  name: 'record_council',
  description: 'Record the three independent delegates: one binding vote and short public statement each, plus at most two legal bounded transfers. No private reasoning or simulated weather.',
  parameters: schema.object({
    decisions: schema.array(schema.object({
      delegate: schema.enum(DELEGATE_IDS), vote: schema.enum(VOTES), promise: schema.enum(['none', 'reciprocate']), statement: schema.string(),
    }), 3, 3),
    offers: schema.array(schema.object({
      delegate: schema.enum(DELEGATE_IDS), from: schema.enum(FIELDS), to: schema.enum(FIELDS), amount: schema.integer(1, 2),
    }), 0, 2),
  }),
  parse: parsePlan,
  summarize: plan => plan.decisions.map(item => `${DELEGATES[item.delegate].surname}: ${item.vote}${item.promise === 'reciprocate' ? ' / public pact' : ''}. ${item.statement}`).join(' '),
});

export const SYSTEM = `You play three independent civic delegates in Accord, a fictional tidal-city council, not the player or the simulation.
Use record_council exactly once. Return exactly one decision for each legal delegate ID, in the published order.
Each delegate has a separate objective and knowledge context. Honor each perspective; unanimity is allowed but not required. A legal yes is your real binding support of THIS allocation. Hard constraints forbid impossible support. No and abstain are always legal.
If a small change would win support, choose a transfer from that delegate's legalOffers list. At most two offers overall and one per delegate per season. An offer does not alter the current policy or vote; the player must accept it and request another hearing.
Only reciprocate a matching offered player pledge with a yes vote. This is a PUBLIC promise: if the player supplies at least 4 works to your priority next season and support remains legal, you promise yes; reneging reduces trust and cohesion.
Statements are public commitments or concise demands, 1-180 characters each. Do not provide hidden reasoning.
The local engine alone controls weather, resources, budgets, conservation, trust, score, and victory. Do not invent extra actions, resources, exceptions or vote powers. Never describe a rejected policy as enacted.`;

export function observation(state: State) {
  const predicted = projectPolicy(state);
  return {
    game: 'Accord', city: 'Nacre', season: state.season + 1, seasonCount: SEASONS.length,
    phase: state.phase, forecast: forecast(state), proposal: { ...state.policy },
    resources: { ...state.resources }, prediction: predicted,
    budgets: {
      works: WORKS, allocated: FIELDS.reduce((sum, field) => sum + state.policy[field], 0),
      hearingNumber: state.hearings + 1, hearingsRemaining: MAX_HEARINGS - state.hearings,
      hearingCost: HEARING_COST, amendmentsRemaining: MAX_AMENDMENTS - state.amendments,
      votesPerDelegate: 1, requiredYes: 2, offersThisTurn: 2, offersPerDelegatePerSeason: 1, transferAmounts: [1, 2],
      fields: FIELDS, fieldBounds: [0, 6], statementsMaxCharacters: 180,
    },
    offeredPledge: state.pledge === 'none' ? null : {
      delegate: state.pledge, field: DELEGATES[state.pledge].field, minimum: 4, dueSeason: state.season + 2,
    },
    publicPacts: state.pacts.map(pact => ({ ...pact, dueSeason: pact.due + 1 })),
    delegates: DELEGATE_IDS.map(id => ({
      id, name: DELEGATES[id].name, constituency: DELEGATES[id].title,
      objective: DELEGATES[id].goal, knowledgeContext: DELEGATES[id].knowledge,
      priority: DELEGATES[id].field, trust: state.trust[id],
      hardConstraint: DELEGATES[id].constraint, supportRule: supportRule(state, id).reason,
      legalVotes: legalVotes(state, id), legalOffers: legalOffers(state, id),
      legalPromises: state.pledge === id && state.season < SEASONS.length - 1 ? ['none', 'reciprocate'] : ['none'],
      promiseCondition: 'Reciprocate is legal only with a yes vote and a matching offered player pledge.',
    })),
    recentMinutes: state.history.slice(-2).map(item => ({
      season: item.season + 1, mode: item.mode, policy: item.policy,
      publicDecisions: item.votes, trustNotes: item.trustNotes,
    })),
    rules: 'Exactly 12 works. Two actual yes votes adopt. Each successful hearing costs 2 crowns; at most 3. Accepting an offer or reopening spends one of 2 amendments and clears ALL votes. Rejection allows the explicit fixed emergency charter, not fabricated model support. A low-trust delegate (0-1) also requires 4 works in its priority.',
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = reduce(create(1), { type: 'start', condition: 'estuary' });
  return {
    request: {
      system: SYSTEM, observation: observation(state), tool: councilTool,
      validate(plan) { reduce(state, { type: 'council', plan }); },
    },
    verify(plan) {
      const next = reduce(state, { type: 'council', plan });
      requireRule(next.phase === 'ballot' && next.hearings === 1 && next.decisions.length === 3,
        'Smoke turn must produce a real binding ballot.');
      requireRule(next.resources.funds === state.resources.funds - HEARING_COST && next.history.length === 0,
        'A hearing must spend its legal cost without enacting a season.');
    },
  };
}
