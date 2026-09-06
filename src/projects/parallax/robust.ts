import { random } from '../../core/math';
import { sampsonDistance } from './camera';
import { eigenSymmetric, mm, mv, transpose } from './math';
import type { M3, V2 } from './math';

export interface PixelPair { a: V2; b: V2 }
function normalize(points: V2[]): { points: V2[]; transform: M3 } | null {
  const mean: V2 = [0, 0];
  for (const p of points) { mean[0] += p[0] / points.length; mean[1] += p[1] / points.length; }
  const distance = points.reduce((s, p) => s + Math.hypot(p[0] - mean[0], p[1] - mean[1]), 0) / points.length;
  if (distance < 1e-8) return null;
  const scale = Math.SQRT2 / distance;
  const transform: M3 = [[scale, 0, -scale * mean[0]], [0, scale, -scale * mean[1]], [0, 0, 1]];
  return { points: points.map((p) => [scale * (p[0] - mean[0]), scale * (p[1] - mean[1])]), transform };
}

/** Hartley normalization, rank-eight design test, then a rank-two projection of F. */
export function eightPoint(pairs: PixelPair[]): M3 | null {
  if (pairs.length < 8) return null;
  const a = normalize(pairs.map((p) => p.a)), b = normalize(pairs.map((p) => p.b));
  if (!a || !b) return null;
  const ata = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
  for (let k = 0; k < pairs.length; k++) {
    const [x, y] = a.points[k], [u, v] = b.points[k];
    const row = [u * x, u * y, u, v * x, v * y, v, x, y, 1];
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) ata[i][j] += row[i] * row[j];
  }
  const eigen = eigenSymmetric(ata);
  if (!eigen.converged || eigen.values[1] < eigen.values[8] * 1e-9) return null;
  const vector = eigen.vectors.map((row) => row[0]);
  const f: M3 = [[vector[0], vector[1], vector[2]], [vector[3], vector[4], vector[5]], [vector[6], vector[7], vector[8]]];
  const singular = eigenSymmetric(mm(transpose(f), f));
  if (!singular.converged || singular.values[1] < singular.values[2] * 1e-12) return null;
  const smallest = [singular.vectors[0][0], singular.vectors[1][0], singular.vectors[2][0]] as const;
  const component = mv(f, [...smallest]);
  const rankTwo = f.map((row, i) => row.map((value, j) => value - component[i] * smallest[j])) as M3;
  const result = mm(mm(transpose(b.transform), rankTwo), a.transform);
  const magnitude = Math.hypot(...result.flat());
  return magnitude > 1e-20 ? result.map((row) => row.map((value) => value / magnitude)) as M3 : null;
}
export interface RobustFit {
  f: M3 | null;
  inliers: number[];
  iterations: number;
  reason: string;
  median: number | null;
}
export function estimateFundamental(pairs: PixelPair[], threshold = 2, seed = 42, iterations = 240): RobustFit {
  const failed = (reason: string): RobustFit => ({ f: null, inliers: [], iterations, reason, median: null });
  if (pairs.length < 12) return failed('At least 12 enabled, paired observations are required for this bounded fit.');
  const rng = random(seed);
  let best: M3 | null = null, bestInliers: number[] = [], bestCost = Infinity;
  const score = (f: M3) => {
    const distances = pairs.map((p) => sampsonDistance(f, p.a, p.b));
    return { inliers: distances.flatMap((distance, i) => distance <= threshold ? [i] : []), cost: distances.reduce((s, d) => s + Math.min(d * d, threshold * threshold), 0) };
  };
  for (let iteration = 0; iteration < iterations; iteration++) {
    const indices = new Set<number>();
    while (indices.size < 8) indices.add(Math.floor(rng() * pairs.length));
    const f = eightPoint([...indices].map((i) => pairs[i]));
    if (!f) continue;
    const result = score(f);
    if (result.inliers.length > bestInliers.length || (result.inliers.length === bestInliers.length && result.cost < bestCost)) {
      best = f; bestInliers = result.inliers; bestCost = result.cost;
    }
  }
  if (!best || bestInliers.length < Math.max(12, Math.ceil(pairs.length * 0.45))) return failed('No nondegenerate consensus found within 240 hypotheses. Try more spatially distributed matches.');
  for (let i = 0; i < 3; i++) {
    const f = eightPoint(bestInliers.map((index) => pairs[index]));
    if (!f) break;
    const result = score(f);
    if (result.inliers.length < bestInliers.length || (result.inliers.length === bestInliers.length && result.cost > bestCost)) break;
    best = f; bestInliers = result.inliers; bestCost = result.cost;
  }
  const distances = bestInliers.map((i) => sampsonDistance(best!, pairs[i].a, pairs[i].b)).sort((a, b) => a - b);
  return { f: best, inliers: bestInliers, iterations, median: distances[Math.floor(distances.length / 2)], reason: 'Pixel-estimated F only; no pose, scale or 3D is recovered by this fit.' };
}
