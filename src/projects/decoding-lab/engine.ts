import { contextFor, END, logitsFor, MAX_VOCABULARY, tokenize } from './model';
import type { CountModel, LogitSource } from './model';

export const MAX_STEPS = 24;
export const MAX_BATCH = 5;
export const MAX_SEED = 0xffffffff;

export interface DecoderSettings {
  readonly mode: 'sample' | 'greedy';
  readonly temperature: number;
  readonly topK: number;
  readonly topP: number;
}

export type FilterReason = 'kept' | 'top-k' | 'top-p' | 'greedy' | 'zero';

export interface Distribution {
  readonly base: readonly number[];
  readonly tempered: readonly number[];
  readonly afterTopK: readonly number[];
  readonly final: readonly number[];
  readonly order: readonly number[];
  readonly kept: readonly number[];
  readonly reasons: readonly FilterReason[];
  readonly baseEntropy: number;
  readonly entropy: number;
  readonly topKMass: number;
  readonly topPMass: number;
  readonly greedy: boolean;
}

export interface GenerationStep {
  readonly number: number;
  readonly token: string;
  readonly index: number;
  readonly source: LogitSource;
  readonly distribution: Distribution;
  readonly probability: number;
  readonly baseProbability: number;
  readonly logProbability: number;
  readonly uniform: number | null;
  readonly interval: readonly [number, number];
  readonly rngBefore: number;
  readonly rngAfter: number;
}

export interface GenerationSession {
  readonly model: CountModel;
  readonly start: string;
  readonly settings: DecoderSettings;
  readonly seed: number;
  readonly rngState: number;
  readonly context: string;
  readonly history: readonly GenerationStep[];
  readonly end: 'end-token' | 'token-limit' | null;
}

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError('The seed must be a whole number from 0 to 4294967295.');
  }
}

function validateSettings(settings: DecoderSettings): void {
  if (settings.mode !== 'sample' && settings.mode !== 'greedy') throw new RangeError('Unknown selection policy.');
  if (!Number.isFinite(settings.temperature) || settings.temperature < 0 || settings.temperature > 4) {
    throw new RangeError('Temperature must be finite and between 0 and 4.');
  }
  if (!Number.isInteger(settings.topK) || settings.topK < 0 || settings.topK > MAX_VOCABULARY) {
    throw new RangeError('Top-k must be a whole number from 0 to 64; 0 means all.');
  }
  if (!Number.isFinite(settings.topP) || settings.topP < 0 || settings.topP > 1) {
    throw new RangeError('Top-p must be finite and between 0 and 1.');
  }
}

export function entropy(probabilities: readonly number[]): number {
  return probabilities.reduce((sum, probability) => probability > 0 ? sum - probability * Math.log(probability) : sum, 0);
}

function softmax(logits: readonly number[], temperature: number): number[] {
  const maximum = Math.max(...logits);
  // Subtract before dividing: even a subnormal positive temperature cannot overflow the winning logit.
  const weights = logits.map((logit) => Math.exp((logit - maximum) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

function retain(probabilities: readonly number[], indices: readonly number[]): { probabilities: number[]; mass: number } {
  const mass = indices.reduce((sum, index) => sum + probabilities[index], 0);
  const kept = new Set(indices);
  return { probabilities: probabilities.map((probability, index) => kept.has(index) ? probability / mass : 0), mass };
}

export function decode(logits: readonly number[], settings: DecoderSettings): Distribution {
  validateSettings(settings);
  if (logits.length === 0 || logits.length > MAX_VOCABULARY
    || logits.some((logit) => Number.isNaN(logit) || logit === Infinity)
    || !logits.some(Number.isFinite)) {
    throw new RangeError('Use 1–64 logits, with at least one finite value; NaN and positive infinity are invalid.');
  }
  const order = logits.map((_, index) => index).sort((a, b) =>
    logits[a] === logits[b] ? a - b : logits[a] > logits[b] ? -1 : 1);
  const base = softmax(logits, 1);
  const greedy = settings.mode === 'greedy' || settings.temperature === 0;
  if (greedy) {
    const final = logits.map((_, index) => index === order[0] ? 1 : 0);
    return {
      base, tempered: final, afterTopK: final, final, order, kept: [order[0]],
      reasons: final.map((probability) => probability > 0 ? 'kept' : 'greedy'),
      baseEntropy: entropy(base), entropy: 0, topKMass: 1, topPMass: 1, greedy,
    };
  }
  const tempered = softmax(logits, settings.temperature);
  const positive = order.filter((index) => tempered[index] > 0);
  const kIndices = settings.topK === 0 ? positive : positive.slice(0, settings.topK);
  const afterK = retain(tempered, kIndices);
  const kept: number[] = [];
  let cumulative = 0;
  for (const index of kIndices) {
    kept.push(index);
    cumulative += afterK.probabilities[index];
    // At p = 1 retain every positive candidate, even if rounding reaches 1 early.
    if (settings.topP < 1 && cumulative >= settings.topP) break;
  }
  const afterP = retain(afterK.probabilities, kept);
  const reasons: FilterReason[] = logits.map((_, index) => {
    if (tempered[index] === 0) return 'zero';
    if (afterK.probabilities[index] === 0) return 'top-k';
    if (afterP.probabilities[index] === 0) return 'top-p';
    return 'kept';
  });
  return {
    base, tempered, afterTopK: afterK.probabilities, final: afterP.probabilities,
    order, kept, reasons, baseEntropy: entropy(base), entropy: entropy(afterP.probabilities),
    topKMass: afterK.mass, topPMass: afterP.mass, greedy,
  };
}

export function nextRandom(state: number): { state: number; value: number } {
  validateSeed(state);
  const next = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(next ^ (next >>> 15), 1 | next);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return { state: next, value: ((value ^ (value >>> 14)) >>> 0) / 4294967296 };
}

export function choose(distribution: Distribution, uniform: number): { index: number; interval: [number, number] } {
  if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1) throw new RangeError('A draw must be in [0, 1).');
  let lower = 0;
  for (const [position, index] of distribution.kept.entries()) {
    const upper = position === distribution.kept.length - 1 ? 1 : Math.min(1, lower + distribution.final[index]);
    if (uniform < upper) return { index, interval: [lower, upper] };
    lower = upper;
  }
  throw new RangeError('The distribution has no positive candidate.');
}

export function createSession(model: CountModel, start: string, settings: DecoderSettings, seed: number): GenerationSession {
  validateSettings(settings);
  validateSeed(seed);
  if (start.length > 160 || tokenize(start).length > 32) throw new RangeError('The starting context is too long.');
  return {
    model, start, settings: { ...settings }, seed, rngState: seed, context: contextFor(start),
    history: [], end: null,
  };
}

export function stepSession(session: GenerationSession): GenerationSession {
  if (session.end) return session;
  const source = logitsFor(session.model, session.context);
  const distribution = decode(source.logits, session.settings);
  const random = distribution.greedy ? null : nextRandom(session.rngState);
  const choice = choose(distribution, random?.value ?? 0);
  const token = session.model.vocabulary[choice.index];
  const probability = distribution.final[choice.index];
  const step: GenerationStep = {
    number: session.history.length + 1, token, index: choice.index, source, distribution,
    probability, baseProbability: distribution.base[choice.index], logProbability: Math.log(probability),
    uniform: random?.value ?? null, interval: choice.interval,
    rngBefore: session.rngState, rngAfter: random?.state ?? session.rngState,
  };
  const history = [...session.history, step];
  return {
    ...session, context: token, rngState: step.rngAfter, history,
    end: token === END ? 'end-token' : history.length >= MAX_STEPS ? 'token-limit' : null,
  };
}

export function runBatch(session: GenerationSession, count = MAX_BATCH): GenerationSession {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) throw new RangeError('Print between 1 and 5 tokens at a time.');
  let next = session;
  for (let index = 0; index < count && !next.end; index += 1) next = stepSession(next);
  return next;
}

export function rewindTo(session: GenerationSession, length: number): GenerationSession {
  if (!Number.isInteger(length) || length < 0 || length > session.history.length) throw new RangeError('Invalid rewind position.');
  if (length === session.history.length) return session;
  return {
    ...session,
    history: session.history.slice(0, length),
    context: length === 0 ? contextFor(session.start) : session.history[length - 1].token,
    rngState: session.history[length].rngBefore,
    end: null,
  };
}

export function resetSession(session: GenerationSession): GenerationSession {
  return createSession(session.model, session.start, session.settings, session.seed);
}
