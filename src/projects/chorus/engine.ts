import { AgentValidationError, requireRule } from '../../core/agents/errors';
import { array, choice, integer, isRecord, object } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import {
  answer, decode, describe, encode, equalMeaning, INTENTS, MAX_BANDWIDTH, MAX_TRUST, MODES,
  NODE_IDS, NODES, nodeFor, PROFILES, SHAPES, TARGET, transfer,
} from './data';
import type { Meaning, NodeId, Plan, Shape, Signal } from './data';

export type Phase = 'calibration' | 'translation' | 'negotiation' | 'won' | 'lost';
export interface Evidence { signal: Signal; meaning: Meaning; kind: string }
export interface State {
  seed: number;
  phase: Phase;
  trust: number;
  bandwidth: number;
  calibrated: number;
  translated: number;
  repairs: number;
  stock: Record<NodeId, number>;
  active: Plan | null;
  evidence: Evidence[];
  lexicon: Partial<Record<Shape, NodeId>>;
  hypotheses: Partial<Record<Shape, { guess: NodeId; correct: boolean }>>;
  feedback: string;
  history: string[];
  ending: 'chorus' | 'fragile' | 'silence' | 'rift' | null;
}
export type TurnInput = { type: 'contact' } | { type: 'study' } | { type: 'transmit'; signal: Signal };
export type Command =
  | { type: 'turn'; input: TurnInput; plan: Plan }
  | { type: 'hypothesis'; shape: Shape; node: NodeId };

export function parsePlan(value: unknown): Plan {
  const item = object(value, ['intent', 'from', 'to', 'amount', 'mode'], 'Counterpart intention');
  return {
    intent: choice(item.intent, INTENTS, 'Intention'),
    from: choice(item.from, NODE_IDS, 'First resonator'),
    to: choice(item.to, NODE_IDS, 'Second resonator'),
    amount: integer(item.amount, 'Pulse length', 1, 3),
    mode: choice(item.mode, MODES, 'Phase'),
  };
}

export function parseSignal(value: unknown): Signal {
  const item = object(value, ['glyphs', 'duration', 'phase'], 'Signal');
  const glyphs = array(item.glyphs, entry => choice(entry, SHAPES, 'Glyph'), 'Glyphs', 2, 2);
  return { glyphs: [glyphs[0], glyphs[1]], duration: integer(item.duration, 'Duration', 1, 3), phase: choice(item.phase, MODES, 'Phase') };
}

export function parseInput(value: unknown): TurnInput {
  requireRule(isRecord(value), 'A turn needs an input.');
  const type = choice(value.type, ['contact', 'study', 'transmit'] as const, 'Turn');
  if (type === 'transmit') {
    const item = object(value, ['type', 'signal']);
    return { type, signal: parseSignal(item.signal) };
  }
  object(value, ['type']);
  return { type };
}

export function parseCommand(value: unknown): Command {
  requireRule(isRecord(value), 'A command must be an object.');
  if (value.type === 'hypothesis') {
    const item = object(value, ['type', 'shape', 'node']);
    return { type: 'hypothesis', shape: choice(item.shape, SHAPES, 'Glyph'), node: choice(item.node, NODE_IDS, 'Referent') };
  }
  const item = object(value, ['type', 'input', 'plan']);
  requireRule(item.type === 'turn', 'Unknown Chorus command.');
  return { type: 'turn', input: parseInput(item.input), plan: parsePlan(item.plan) };
}

export function create(seed: number): State {
  const profile = PROFILES[seed % PROFILES.length];
  return {
    seed, phase: 'calibration', trust: 4, bandwidth: MAX_BANDWIDTH, calibrated: 0, translated: 0, repairs: 0,
    stock: { well: profile.stock[0], reed: profile.stock[1], crown: profile.stock[2] },
    active: null, evidence: [], lexicon: {}, hypotheses: {},
    feedback: 'Three bodies. No shared words. Open contact to receive a living demonstration.',
    history: [], ending: null,
  };
}

export function terminal(state: State): boolean { return state.phase === 'won' || state.phase === 'lost'; }

export function feasible(state: State, meaning: Meaning): boolean {
  const { source, target, amount } = transfer(meaning);
  return source !== target && amount <= 2 && state.stock[source] - amount >= TARGET && state.stock[target] + amount <= TARGET;
}

function finish(state: State): State {
  if (state.phase === 'negotiation' && NODE_IDS.every(id => state.stock[id] === TARGET)) {
    state.phase = 'won';
    state.ending = state.trust >= 4 ? 'chorus' : 'fragile';
    state.feedback = state.ending === 'chorus'
      ? 'A common sky. All three resonators hold four pulses. Two strangers have made one beacon.'
      : 'A fragile accord. The beacon holds, even where understanding is still tender.';
  } else if (state.trust <= 0 || state.bandwidth <= 0) {
    state.phase = 'lost';
    state.ending = state.trust <= 0 ? 'rift' : 'silence';
    state.feedback = state.ending === 'rift'
      ? 'The field closes. Too many mismatched signals broke trust. Your replay keeps what you learned.'
      : 'The last interval fades. Bandwidth is spent before the beacon is balanced. Your replay keeps what you learned.';
  }
  if (terminal(state)) state.active = null;
  return state;
}

function moved(state: State, meaning: Meaning): State {
  const { source, target, amount } = transfer(meaning);
  return {
    ...state, stock: { ...state.stock, [source]: state.stock[source] - amount, [target]: state.stock[target] + amount },
    repairs: state.repairs + 1, trust: Math.min(MAX_TRUST, state.trust + 1),
    feedback: `${amount} pulse${amount === 1 ? '' : 's'} crossed from ${NODES[source].name} to ${NODES[target].name}. The beacon is closer to balance.`,
  };
}

function mismatch(signal: Signal, expected: Meaning): string {
  const target = encode(expected);
  if (signal.glyphs[0] === signal.glyphs[1]) return 'A body cannot address itself. Use two different glyphs.';
  const differences: string[] = [];
  if (signal.glyphs.some((shape, i) => shape !== target.glyphs[i])) differences.push('noun identity or order');
  if (signal.duration !== target.duration) differences.push('pulse length');
  if (signal.phase !== target.phase) differences.push('relative phase');
  return `Not yet understood: ${differences.join(', ')}. Trust -1. Study the field or try a new hypothesis.`;
}

interface Preparation { state: State; proposal: Meaning | null; polite: boolean }

// This draft is never published until a parsed, legal model intention completes the exchange.
export function prepare(state: State, input: TurnInput): Preparation {
  requireRule(!terminal(state), 'This encounter has ended. Restart to open another contact.');
  requireRule(state.bandwidth > 0, 'No bandwidth remains.');
  let next: State = { ...state, bandwidth: state.bandwidth - 1 };
  let proposal: Meaning | null = null;
  let polite = false;
  if (input.type === 'contact') {
    requireRule(state.active === null, 'A signal is already waiting. Reply or ask for a demonstration.');
  } else if (input.type === 'study') {
    requireRule(state.active !== null, 'Open contact before asking for a demonstration.');
    next.feedback = 'A new demonstration. Watch which body sends light, and which receives it. Bandwidth -1; trust unchanged.';
  } else {
    requireRule(state.active !== null, 'Receive a counterpart signal before transmitting.');
    const meaning = decode(input.signal);
    if (state.phase === 'negotiation' && meaning?.mode === 'ask') {
      polite = true;
      next.feedback = 'You ask for another arrangement. No energy moves; the counterpart will renegotiate. Bandwidth -1.';
    } else if (state.phase === 'negotiation' && meaning?.mode === 'offer' && feasible(state, meaning)) {
      if (equalMeaning(meaning, answer(state.active))) next = moved(next, meaning);
      else {
        proposal = meaning;
        next.feedback = 'A different, feasible offer. The counterpart may accept it or request another arrangement.';
      }
    } else {
      const expected = state.phase === 'calibration' ? state.active : answer(state.active);
      if (meaning && equalMeaning(meaning, expected) && state.phase !== 'negotiation') {
        next.trust = Math.min(MAX_TRUST, state.trust + 1);
        if (state.phase === 'calibration') {
          next.calibrated++;
          next.feedback = 'An exact echo. Identity, order, duration and phase are shared.';
          if (next.calibrated === 2) {
            next.phase = 'translation';
            next.feedback = 'Calibration complete. Alternating phase means asks FROM. Reply by reversing the nouns and joining their phase.';
          }
        } else {
          next.translated++;
          next.feedback = 'A true translation. The same energy path, spoken from the other end.';
          if (next.translated === 2) {
            next.phase = 'negotiation';
            next.feedback = 'A language in common. Balance every body at four pulses. Answer a request, offer another legal transfer, or ask to renegotiate.';
          }
        }
      } else {
        next.trust--;
        next.feedback = state.phase === 'negotiation' && meaning?.mode === 'offer' && !feasible(state, meaning)
          ? 'That offer would drain a body below four, overfill another, or exceed two pulses. Trust -1. No energy moved.'
          : mismatch(input.signal, expected);
      }
    }
  }
  // A last-bandwidth counteroffer must still be allowed to complete before deciding the ending.
  if (!proposal) next = finish(next);
  return { state: next, proposal, polite };
}

const witness: Plan = { intent: 'witness', from: 'well', to: 'crown', amount: 1, mode: 'offer' };

function requests(state: State, intent: Plan['intent']): Plan[] {
  const result: Plan[] = [];
  for (const from of NODE_IDS) for (const to of NODE_IDS) for (const amount of [1, 2]) {
    const plan: Plan = { intent, from, to, amount, mode: 'ask' };
    if (feasible(state, plan) && (state.trust > 2 || amount === 1)) result.push(plan);
  }
  return result;
}

export function legalPlans(state: State, input: TurnInput): Plan[] {
  const prepared = prepare(state, input);
  const next = prepared.state;
  if (terminal(next)) return [{ ...witness }];
  if (prepared.proposal) {
    return [{ ...prepared.proposal, intent: 'accept' }, ...requests(next, 'counter')];
  }
  if (next.phase === 'negotiation') {
    const intent = prepared.polite ? 'counter' : input.type === 'study' ? 'demonstrate' : 'request';
    return requests(next, intent);
  }
  const result: Plan[] = [];
  const mode = next.phase === 'translation' || next.calibrated > 0 ? 'ask' : 'offer';
  const intents: Plan['intent'][] = next.phase === 'translation' && input.type !== 'study'
    ? ['challenge'] : next.active ? ['demonstrate', 'contrast'] : ['demonstrate'];
  for (const intent of intents) for (const from of NODE_IDS) for (const to of NODE_IDS) for (const amount of [1, 2, 3]) {
    if (from === to || (next.phase === 'calibration' && amount === 3)) continue;
    // The second lesson must introduce the body absent from the first lesson.
    const seen = new Set(next.evidence.flatMap(entry => [entry.meaning.from, entry.meaning.to]));
    if (next.phase === 'calibration' && seen.size === 2 && seen.has(from) && seen.has(to)) continue;
    result.push({ intent, from, to, amount, mode });
  }
  return result;
}

export function reduce(state: State, command: Command): State {
  if (command.type === 'hypothesis') {
    requireRule(!terminal(state), 'This encounter has ended.');
    requireRule(state.evidence.some(entry => entry.signal.glyphs.includes(command.shape)), 'Observe this glyph in a demonstration before testing its meaning.');
    const correct = nodeFor(command.shape) === command.node;
    return {
      ...state,
      lexicon: correct ? { ...state.lexicon, [command.shape]: command.node } : { ...state.lexicon },
      hypotheses: { ...state.hypotheses, [command.shape]: { guess: command.node, correct } },
      feedback: correct ? `Hypothesis confirmed: ${command.shape} names the ${NODES[command.node].name}.`
        : `Hypothesis contradicted: ${command.shape} does not name the ${NODES[command.node].name}. Compare the demonstrated energy path.`,
    };
  }
  const { input, plan } = command;
  requireRule(legalPlans(state, input).some(candidate => candidate.intent === plan.intent && equalMeaning(candidate, plan)),
    'Choose exactly one of the supplied legalPlans. This intention is not legal for the current phase, knowledge or reserves.');
  const prepared = prepare(state, input);
  let next = prepared.state;
  if (prepared.proposal) {
    if (plan.intent === 'accept') next = moved(next, prepared.proposal);
    else next = { ...next, feedback: 'The counterpart declines that allocation and offers a different request. No energy moved.' };
    next = finish(next);
  }
  if (!terminal(next)) {
    next.active = plan.intent === 'accept' ? null : { ...plan };
    if (plan.intent === 'demonstrate' || plan.intent === 'contrast') {
      next.evidence = [...next.evidence, { signal: encode(plan), meaning: { from: plan.from, to: plan.to, amount: plan.amount, mode: plan.mode }, kind: plan.intent }].slice(-18);
    }
    if (input.type === 'contact') next.feedback = next.phase === 'calibration'
      ? 'Watch the lit path. Copy both glyphs, pulse length and phase, then transmit an echo.'
      : 'A new allocation arrives. Reply with an offer to make the energy cross.';
  }
  const sent = input.type === 'transmit' ? decode(input.signal) : null;
  next.history = [...state.history, `${input.type === 'transmit' ? `You: ${sent ? describe(sent) : 'self-addressed signal'}. ` : ''}Counterpart: ${plan.intent} / ${describe(plan)}. ${next.feedback}`].slice(-36);
  return next;
}

export const definition: GameDefinition<State, Command> = { id: 'chorus', create, reduce, parseCommand };

export function previewTurn(state: State, input: TurnInput, plan: Plan): State {
  return reduce(state, parseCommand({ type: 'turn', input, plan }));
}

export function ruleMessage(error: unknown): string {
  if (!(error instanceof AgentValidationError)) throw error;
  return error.message;
}
