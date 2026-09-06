import { dot, multiply, shape, softmaxTrace } from './tensor';
import type { Matrix, SoftmaxTrace } from './tensor';

export interface ProjectionWeights {
  q: Matrix;
  k: Matrix;
  v: Matrix;
}

export interface AttentionResult {
  queries: Matrix;
  keys: Matrix;
  values: Matrix;
  keyDimensions: number;
  valueDimensions: number;
  causal: boolean;
  dotProducts: number[][];
  scores: number[][];
  maskedScores: number[][];
  softmax: SoftmaxTrace[];
  weights: number[][];
  outputs: number[][];
}

export interface ProjectedAttention extends AttentionResult {
  embeddings: Matrix;
  projections: ProjectionWeights;
  modelDimensions: number;
}

export function attentionFromQKV(
  queries: Matrix,
  keys: Matrix,
  values: Matrix,
  causal = false,
): AttentionResult {
  const q = shape(queries, 'Q');
  const k = shape(keys, 'K');
  const v = shape(values, 'V');
  if (q.rows !== k.rows || q.rows !== v.rows) {
    throw new RangeError('This self-attention head requires the same token count in Q, K, and V.');
  }
  if (q.columns !== k.columns) {
    throw new RangeError('Queries and keys must have the same dimension d_k.');
  }
  const dotProducts = queries.map((query) => keys.map((key) => dot(query, key)));
  const scale = Math.sqrt(q.columns);
  const scores = dotProducts.map((row) => row.map((value) => value / scale));
  const maskedScores = scores.map((row, query) => row.map((value, key) => causal && key > query ? -Infinity : value));
  const softmax = scores.map((row, query) => softmaxTrace(row, row.map((_, key) => !causal || key <= query)));
  const weights = softmax.map((row) => row.weights);
  const outputs = multiply(weights, values);
  return {
    queries, keys, values, keyDimensions: q.columns, valueDimensions: v.columns,
    causal, dotProducts, scores, maskedScores, softmax, weights, outputs,
  };
}

export function runAttention(
  embeddings: Matrix,
  projections: ProjectionWeights,
  causal = false,
): ProjectedAttention {
  const { columns: modelDimensions } = shape(embeddings, 'X');
  const queries = multiply(embeddings, projections.q);
  const keys = multiply(embeddings, projections.k);
  const values = multiply(embeddings, projections.v);
  return { ...attentionFromQKV(queries, keys, values, causal), embeddings, projections, modelDimensions };
}

export function weightedContributions(result: AttentionResult, query: number): number[][] {
  if (!Number.isInteger(query) || query < 0 || query >= result.queries.length) {
    throw new RangeError('Choose an existing query row.');
  }
  return result.values.map((value, key) => value.map((coordinate) => result.weights[query][key] * coordinate));
}
