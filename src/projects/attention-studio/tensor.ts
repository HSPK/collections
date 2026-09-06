export type Matrix = readonly (readonly number[])[];

export interface Shape {
  rows: number;
  columns: number;
}

export function shape(matrix: Matrix, name = 'Matrix'): Shape {
  const columns = matrix[0]?.length ?? 0;
  if (!matrix.length || !columns || matrix.some((row) => row.length !== columns)) {
    throw new RangeError(`${name} must be a nonempty rectangular matrix.`);
  }
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new RangeError(`${name} must contain only finite numbers.`);
  }
  return { rows: matrix.length, columns };
}

export function dot(left: readonly number[], right: readonly number[]): number {
  if (!left.length || left.length !== right.length) {
    throw new RangeError('Dot-product vectors must have the same nonzero dimension.');
  }
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) {
      throw new RangeError('Dot-product coordinates must be finite.');
    }
    sum += left[index] * right[index];
    if (!Number.isFinite(sum)) {
      throw new RangeError('Dot product overflowed Float64. Use smaller coordinates.');
    }
  }
  return sum === 0 ? 0 : sum;
}

export function transpose(matrix: Matrix): number[][] {
  const { columns } = shape(matrix);
  return Array.from({ length: columns }, (_, column) => matrix.map((row) => row[column]));
}

export function multiply(left: Matrix, right: Matrix): number[][] {
  const leftShape = shape(left, 'Left matrix');
  const rightShape = shape(right, 'Right matrix');
  if (leftShape.columns !== rightShape.rows) {
    throw new RangeError('Matrix multiplication requires matching inner dimensions.');
  }
  const columns = transpose(right);
  return left.map((row) => columns.map((column) => dot(row, column)));
}

export interface SoftmaxTrace {
  maximum: number;
  shifted: number[];
  exponentials: number[];
  denominator: number;
  weights: number[];
}

export function softmaxTrace(logits: readonly number[], allowed?: readonly boolean[]): SoftmaxTrace {
  if (!logits.length || logits.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Softmax requires a nonempty row of finite logits.');
  }
  if (allowed && allowed.length !== logits.length) {
    throw new RangeError('The softmax mask must match the logit row.');
  }
  let maximum = -Infinity;
  for (let index = 0; index < logits.length; index += 1) {
    if (allowed?.[index] !== false) maximum = Math.max(maximum, logits[index]);
  }
  if (maximum === -Infinity) {
    throw new RangeError('Softmax needs at least one unmasked key.');
  }

  // Subtraction may become -Infinity for opposite, near-limit finite logits.
  // exp(-Infinity) = 0 is the correct limiting weight; the maximum still gives exp(0) = 1.
  const shifted = logits.map((value, index) => allowed?.[index] === false ? -Infinity : value - maximum);
  const exponentials = shifted.map((value) => Math.exp(value));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);
  const weights = exponentials.map((value) => value / denominator);
  return { maximum, shifted, exponentials, denominator, weights };
}

export function stableSoftmax(logits: readonly number[], allowed?: readonly boolean[]): number[] {
  return softmaxTrace(logits, allowed).weights;
}
