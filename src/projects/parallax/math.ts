export type V2 = [number, number];
export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): number => Math.hypot(...a);
export function unit(a: V3): V3 {
  const length = norm(a);
  if (length < 1e-14) throw new Error('A direction must be nonzero.');
  return mul(a, 1 / length);
}
export const mv = (a: M3, b: V3): V3 => [dot(a[0], b), dot(a[1], b), dot(a[2], b)];
export const transpose = (a: M3): M3 => [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]];
export const mm = (a: M3, b: M3): M3 => {
  const t = transpose(b);
  return a.map((row) => t.map((column) => dot(row, column))) as M3;
};
export const identity = (): M3 => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export function inverse(a: M3): M3 | null {
  const cofactors: M3 = [cross(a[1], a[2]), cross(a[2], a[0]), cross(a[0], a[1])];
  const det = dot(a[0], cofactors[0]);
  const scale = Math.max(...a.flat().map(Math.abs));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14 * scale ** 3 || scale === 0) return null;
  return transpose(cofactors.map((row) => mul(row, 1 / det)) as M3);
}

/** Jacobi rotations for small symmetric systems. Eigenvectors are returned as columns. */
export function eigenSymmetric(input: number[][]): { values: number[]; vectors: number[][]; converged: boolean } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const vectors = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Number(i === j)));
  let converged = false;
  for (let iteration = 0; iteration < n * n * 80; iteration++) {
    let p = 0, q = 1, largest = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(a[i][j]) > largest) { p = i; q = j; largest = Math.abs(a[i][j]); }
    }
    const scale = Math.max(1e-30, ...a.map((row, i) => Math.abs(row[i])));
    if (largest < scale * 1e-13) { converged = true; break; }
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    for (let i = 0; i < n; i++) if (i !== p && i !== q) {
      const ip = a[i][p], iq = a[i][q];
      a[i][p] = a[p][i] = c * ip - s * iq;
      a[i][q] = a[q][i] = s * ip + c * iq;
    }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    for (let i = 0; i < n; i++) {
      const ip = vectors[i][p], iq = vectors[i][q];
      vectors[i][p] = c * ip - s * iq;
      vectors[i][q] = s * ip + c * iq;
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  return { values: order.map((i) => a[i][i]), vectors: vectors.map((row) => order.map((i) => row[i])), converged };
}
