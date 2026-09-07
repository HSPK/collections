import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { describe, INTENTS, MODES, NODE_IDS, PROFILES } from './data';
import type { Plan } from './data';
import { definition, legalPlans, parsePlan, prepare, previewTurn } from './engine';
import type { State, TurnInput } from './engine';

export const tool = defineTool<Plan>({
  name: 'shape_contact',
  description: 'Choose one bounded public intention from legalPlans. The chamber encodes it into the same visual grammar used by the human.',
  parameters: schema.object({
    intent: schema.enum(INTENTS), from: schema.enum(NODE_IDS), to: schema.enum(NODE_IDS),
    amount: schema.integer(1, 3), mode: schema.enum(MODES),
  }),
  parse: parsePlan,
  summarize: plan => `${plan.intent}: ${describe(plan)}.`,
});

export const system = `You are the other intelligence in Chorus, a first-contact game without chat.
You communicate only by choosing one exact object from observation.legalPlans through shape_contact.
The local engine, not you, encodes glyph geometry, color, rhythm and phase and verifies every outcome.
Ring = Well; fork = Reed; knot = Crown. A joined wave [A,B,n] means A offers n pulses TO B.
An alternating wave [A,B,n] means A asks n pulses FROM B. A reply reverses nouns and joins phase.
Calibration teaches by physical demonstrations; choose examples that help the human's observed vocabulary.
Contrast presents the previous and new example side by side. Translation asks for an equivalent offer.
In negotiation, the goal is four pulses in every body. Choose feasible requests from legalPlans.
For a human counteroffer, accept moves the offered energy; counter declines and encodes a new request.
Adapt your next demonstration, challenge or allocation to their partial lexicon, mistakes, trust and remaining bandwidth.
Be curious and fair. Do not merely repeat examples if a different example would teach more.
Never invent IDs, fields, outcomes, prose, URLs, code or scores. witness is only a locally determined ending acknowledgment.
Only public bounded intentions are wanted, never private reasoning.`;

export function observation(state: State, input: TurnInput) {
  const draft = prepare(state, input);
  return {
    encounter: PROFILES[state.seed % PROFILES.length],
    phase: state.phase,
    input,
    currentSignal: state.active,
    sharedKnowledge: { confirmedLexicon: state.lexicon, testedHypotheses: state.hypotheses, demonstrations: state.evidence.slice(-3) },
    progress: { echoes: state.calibrated, translations: state.translated, transfers: state.repairs },
    budget: { bandwidth: state.bandwidth, afterValidTurn: state.bandwidth - 1, trust: state.trust, stock: state.stock, targetEach: 4 },
    localAssessment: { phase: draft.state.phase, feedback: draft.state.feedback, proposal: draft.proposal, trust: draft.state.trust },
    recentEvents: state.history.slice(-3),
    legalPlans: legalPlans(state, input),
    instruction: 'Return exactly one legalPlans object. All costs and effects wait for a valid model turn.',
  };
}

export function request(state: State, input: TurnInput): AgentRequest<Plan> {
  return { system, observation: observation(state, input), tool, validate: plan => { previewTurn(state, input, plan); } };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 0);
  const input: TurnInput = { type: 'contact' };
  return {
    request: request(session.state, input),
    verify(plan) {
      const before = session.revision;
      session.dispatch({ type: 'turn', input, plan });
      requireRule(session.revision === before + 1 && session.state.active?.intent === 'demonstrate'
        && session.state.evidence.length === 1 && session.state.bandwidth === 17,
      'The real opening counterpart plan must create a demonstrated signal and debit exactly one interval.');
    },
  };
}
