import type { ProjectionWeights } from './attention';
import type { Matrix } from './tensor';

export const TOKENS: readonly string[] = ['ink', 'moss', 'sun', 'echo'];
export const EMBEDDING_LIMIT = 1000;

export interface Preset {
  id: string;
  title: string;
  description: string;
  observation: string;
  embeddings: Matrix;
  projections: ProjectionWeights;
  causal: boolean;
  query: number;
  key: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'similarity',
    title: '01 · Similarity pairs',
    description: 'Ink and moss point in similar directions. Sun points away. Echo carries a different value.',
    observation: 'Here e₁ and e₂ become queries and keys. e₃ changes values only: edit it to move the output without changing the attention map. Dot similarity depends on length as well as direction; it is not cosine similarity.',
    embeddings: [[2, 0, 1], [1.5, 0.5, -1], [-1, 1.5, 0.5], [0, -1, 2]],
    projections: {
      q: [[1, 0], [0, 1], [0, 0]],
      k: [[1, 0], [0, 1], [0, 0]],
      v: [[1, 0], [0, 1], [0.5, -0.5]],
    },
    causal: false,
    query: 0,
    key: 1,
  },
  {
    id: 'rotation',
    title: '02 · Position routing',
    description: 'Four hand-written positions on a circle. A quarter-turn query favors the next position.',
    observation: 'These are invented circular position codes, not standard positional encodings. Wq turns (e₁, e₂) into (−2e₂, 2e₁); Wk scales it by 2. Ink favors moss, moss favors sun, sun favors echo, and echo wraps to ink. A causal mask can forbid that preferred route.',
    embeddings: [[1, 0, 1], [0, 1, -1], [-1, 0, 0.5], [0, -1, -0.5]],
    projections: {
      q: [[0, 2], [-2, 0], [0, 0]],
      k: [[2, 0], [0, 2], [0, 0]],
      v: [[0, 1], [0, 0], [1, 0]],
    },
    causal: false,
    query: 1,
    key: 2,
  },
  {
    id: 'prefix',
    title: '03 · Causal averages',
    description: 'Zero queries, equal scores. The causal mask turns this head into a running prefix average.',
    observation: 'Wq is zero, so every dot product is zero. Without a mask, all four weights are ¼. With the mask, query i averages only positions 0 through i, including itself. Changing embeddings changes the values, but cannot change these equal allowed weights while Wq stays zero.',
    embeddings: [[1, 0, 2], [0, 1, -1], [-1, 0, 1], [0, -1, -2]],
    projections: {
      q: [[0, 0], [0, 0], [0, 0]],
      k: [[1, 0], [0, 1], [0, 0]],
      v: [[1, 0], [0, 1], [0, 1]],
    },
    causal: true,
    query: 2,
    key: 3,
  },
];

export type StageId = 'embed' | 'project' | 'score' | 'mask' | 'softmax' | 'mix';

export interface Stage {
  id: StageId;
  label: string;
  symbol: string;
}

export const STAGES: readonly Stage[] = [
  { id: 'embed', label: 'Embed', symbol: 'X' },
  { id: 'project', label: 'Project', symbol: 'Q K V' },
  { id: 'score', label: 'Score', symbol: 'QKᵀ / √2' },
  { id: 'mask', label: 'Mask', symbol: 'j ≤ i' },
  { id: 'softmax', label: 'Normalize', symbol: 'softmax' },
  { id: 'mix', label: 'Mix values', symbol: 'AV' },
];
