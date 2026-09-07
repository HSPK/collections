export const NODE_IDS = ['well', 'reed', 'crown'] as const;
export const SHAPES = ['ring', 'fork', 'knot'] as const;
export const MODES = ['offer', 'ask'] as const;
export const INTENTS = ['demonstrate', 'contrast', 'challenge', 'request', 'accept', 'counter', 'witness'] as const;
export type NodeId = typeof NODE_IDS[number];
export type Shape = typeof SHAPES[number];
export type Mode = typeof MODES[number];
export type Intent = typeof INTENTS[number];

export const NODES: Record<NodeId, { name: string; shape: Shape; color: string; x: number }> = {
  well: { name: 'Well', shape: 'ring', color: '#244bce', x: 170 },
  reed: { name: 'Reed', shape: 'fork', color: '#d65e49', x: 450 },
  crown: { name: 'Crown', shape: 'knot', color: '#aa761c', x: 730 },
};

export interface Meaning {
  from: NodeId;
  to: NodeId;
  amount: number;
  mode: Mode;
}
export interface Signal {
  glyphs: [Shape, Shape];
  duration: number;
  phase: Mode;
}
export interface Plan extends Meaning { intent: Intent }

export const PROFILES = [
  { name: 'The patient tide', temperament: 'Teach with clear contrasts. Prefer generous two-pulse exchanges when trust is strong.', stock: [8, 3, 1] },
  { name: 'The careful reed', temperament: 'Attend to uncertain vocabulary. Prefer small exchanges, but consider efficient counteroffers.', stock: [1, 8, 3] },
  { name: 'The bright interval', temperament: 'Vary the examples. Negotiate playfully without stranding the visitor.', stock: [3, 1, 8] },
] as const;

export const MAX_BANDWIDTH = 18;
export const MAX_TRUST = 6;
export const TARGET = 4;

export function encode(meaning: Meaning): Signal {
  return { glyphs: [NODES[meaning.from].shape, NODES[meaning.to].shape], duration: meaning.amount, phase: meaning.mode };
}

export function nodeFor(shape: Shape): NodeId {
  return NODE_IDS.find(id => NODES[id].shape === shape)!;
}

export function decode(signal: Signal): Meaning | null {
  if (signal.glyphs[0] === signal.glyphs[1]) return null;
  return { from: nodeFor(signal.glyphs[0]), to: nodeFor(signal.glyphs[1]), amount: signal.duration, mode: signal.phase };
}

export function transfer(meaning: Meaning): { source: NodeId; target: NodeId; amount: number } {
  return {
    source: meaning.mode === 'offer' ? meaning.from : meaning.to,
    target: meaning.mode === 'offer' ? meaning.to : meaning.from,
    amount: meaning.amount,
  };
}

export function answer(meaning: Meaning): Meaning {
  return meaning.mode === 'ask'
    ? { from: meaning.to, to: meaning.from, amount: meaning.amount, mode: 'offer' }
    : { from: meaning.from, to: meaning.to, amount: meaning.amount, mode: 'offer' };
}

export function equalMeaning(a: Meaning, b: Meaning): boolean {
  return a.from === b.from && a.to === b.to && a.amount === b.amount && a.mode === b.mode;
}

export function describe(meaning: Meaning): string {
  return `${NODES[meaning.from].name} ${meaning.mode === 'ask' ? 'asks' : 'offers'} ${meaning.amount} pulse${meaning.amount === 1 ? '' : 's'} ${meaning.mode === 'ask' ? 'from' : 'to'} ${NODES[meaning.to].name}`;
}
