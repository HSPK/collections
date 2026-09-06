import { random } from '../../core/math';
import { fundamental, sampsonDistance } from './camera';
import type { V2, V3 } from './math';
import { refine, residuals, triangulate, uncertainty } from './triangulation';
import type { Estimate, Residuals, Uncertainty } from './triangulation';
import { cameras, STUDIES, visiblePixel, WORLD } from './world';
import type { Rig, StudyId } from './world';

export interface Observation { id: string; a: V2 | null; b: V2 | null; enabled: boolean }
export type Method = 'raw' | 'refined' | 'robust';
export interface Experiment {
  version: 1;
  study: StudyId;
  calibration: Rig;
  exposure: Rig;
  sigma: number;
  outliers: number;
  seed: number;
  observations: Observation[];
  selected: string;
  method: Method;
  reveal: boolean;
}
export interface Reconstruction {
  id: string;
  estimate: Estimate;
  point: V3 | null;
  raw: V3 | null;
  residual: Residuals | null;
  rawResidual: Residuals | null;
  uncertainty: Uncertainty | null;
  epipolar: number;
  rejected: boolean;
  refinement: string;
}
const clone = (value: Experiment): Experiment => structuredClone(value);

// This is the ONLY ground-truth -> observation boundary. Reconstruction never receives world positions.
export function capture(study: StudyId, rig: Rig, sigma: number, outliers: number, seed: number): Observation[] {
  const [a, b] = cameras(study, rig);
  const rng = random(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
  return WORLD.landmarks.map((landmark) => {
    const pa = visiblePixel(a, landmark.position), pb = visiblePixel(b, landmark.position);
    const noise: [V2, V2] = [[gaussian() * sigma, gaussian() * sigma], [gaussian() * sigma, gaussian() * sigma]];
    const corrupt = rng() < outliers;
    if (corrupt) { noise[1][0] += (rng() - 0.5) * 140; noise[1][1] += (rng() < 0.5 ? -1 : 1) * (25 + rng() * 70); }
    const observed = (p: V2 | null, n: V2): V2 | null => {
      if (!p) return null;
      const q: V2 = [p[0] + n[0], p[1] + n[1]];
      return q[0] >= 0 && q[0] <= 960 && q[1] >= 0 && q[1] <= 640 ? q : null;
    };
    return { id: landmark.id, a: observed(pa, noise[0]), b: observed(pb, noise[1]), enabled: true };
  });
}
export function createExperiment(study: StudyId = 'signal'): Experiment {
  const preset = STUDIES.find((value) => value.id === study);
  if (!preset) throw new Error('Unknown study.');
  const observations = capture(study, preset.rig, 0.7, 0, 117);
  const roofId = WORLD.landmarks.find((p) => p.label === 'Signal ridge')!.id;
  const roof = observations.find((o) => o.id === roofId);
  const selected = roof?.a && roof.b ? roof.id : observations.find((p) => p.a && p.b)?.id ?? observations[0].id;
  return { version: 1, study, calibration: { ...preset.rig }, exposure: { ...preset.rig }, sigma: 0.7, outliers: 0, seed: 117, observations, selected, method: 'refined', reveal: false };
}
export function reconstruct(experiment: Experiment): Reconstruction[] {
  const [a, b] = cameras(experiment.study, experiment.calibration);
  const f = fundamental(a, b), threshold = Math.max(2, 3 * experiment.sigma);
  return experiment.observations.map((observation) => {
    const { id, a: pa, b: pb } = observation;
    const empty: Reconstruction = {
      id, estimate: { status: 'unavailable', reason: !observation.enabled ? 'Observation excluded by the operator.' : 'This landmark is not observed in both exposures (occluded or outside the image).', point: null, angle: 0, gap: null },
      point: null, raw: null, residual: null, rawResidual: null, uncertainty: null, epipolar: Infinity, rejected: false, refinement: 'Not run',
    };
    if (!pa || !pb || !observation.enabled) return empty;
    const estimate = triangulate(a, b, pa, pb);
    const epipolar = sampsonDistance(f, pa, pb);
    const rejected = experiment.method === 'robust' && epipolar > threshold;
    if (!estimate.point) return { ...empty, estimate, epipolar };
    const raw = estimate.point, rawResidual = residuals(a, b, pa, pb, raw);
    const refined = experiment.method === 'raw' || rejected ? null : refine(a, b, pa, pb, raw);
    const point = rejected ? null : refined?.point ?? raw;
    return {
      id, estimate, point, raw, rawResidual, epipolar, rejected,
      residual: point ? residuals(a, b, pa, pb, point) : null,
      uncertainty: point ? uncertainty(a, b, point, experiment.sigma) : null,
      refinement: refined ? `${refined.converged ? 'Converged' : 'Local / bounded stop'} · ${refined.iterations} iterations` : rejected ? 'Rejected by calibrated epipolar gate' : 'Raw midpoint',
    };
  });
}

export interface History { current: Experiment; past: Experiment[]; future: Experiment[] }
export function createHistory(experiment = createExperiment()): History { return { current: clone(experiment), past: [], future: [] }; }
export function commit(history: History, next: Experiment): boolean {
  if (JSON.stringify(history.current) === JSON.stringify(next)) return false;
  history.past.push(clone(history.current));
  if (history.past.length > 50) history.past.shift();
  history.current = clone(next);
  history.future = [];
  return true;
}
export function undo(history: History): boolean {
  const previous = history.past.pop();
  if (!previous) return false;
  history.future.push(clone(history.current)); history.current = previous;
  return true;
}
export function redo(history: History): boolean {
  const next = history.future.pop();
  if (!next) return false;
  history.past.push(clone(history.current)); history.current = next;
  return true;
}
export const serialize = (experiment: Experiment): string => JSON.stringify(experiment, null, 2);
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, names: string[]): boolean { return Object.keys(value).length === names.length && names.every((key) => Object.hasOwn(value, key)); }
function bounded(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function validRig(value: unknown): value is Rig {
  return record(value) && keys(value, ['baseline', 'focal', 'yaw']) && bounded(value.baseline, 0, 8) && bounded(value.focal, 300, 1600) && bounded(value.yaw, -25, 25);
}
function validPixel(value: unknown): value is V2 | null {
  return value === null || (Array.isArray(value) && value.length === 2 && bounded(value[0], 0, 960) && bounded(value[1], 0, 640));
}
export function validateExperiment(value: unknown): value is Experiment {
  if (!record(value) || !keys(value, ['version', 'study', 'calibration', 'exposure', 'sigma', 'outliers', 'seed', 'observations', 'selected', 'method', 'reveal'])) return false;
  if (value.version !== 1 || !STUDIES.some((p) => p.id === value.study) || !validRig(value.calibration) || !validRig(value.exposure)) return false;
  if (!bounded(value.sigma, 0, 8) || !bounded(value.outliers, 0, 0.4) || !bounded(value.seed, 0, 2147483647) || !Number.isInteger(value.seed)) return false;
  if (typeof value.method !== 'string' || !['raw', 'refined', 'robust'].includes(value.method) || typeof value.reveal !== 'boolean') return false;
  if (!Array.isArray(value.observations) || value.observations.length !== WORLD.landmarks.length) return false;
  const ids = new Set(WORLD.landmarks.map((p) => p.id));
  for (const observation of value.observations) {
    if (!record(observation) || !keys(observation, ['id', 'a', 'b', 'enabled']) || typeof observation.id !== 'string' || !ids.delete(observation.id)) return false;
    if (!validPixel(observation.a) || !validPixel(observation.b) || typeof observation.enabled !== 'boolean') return false;
  }
  return ids.size === 0 && WORLD.landmarks.some((p) => p.id === value.selected);
}
export function parseExperiment(text: string): { ok: true; value: Experiment } | { ok: false; error: string } {
  if (text.length > 250_000) return { ok: false, error: 'Experiment exceeds the 250 kB limit. The current study is unchanged.' };
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, error: 'Invalid JSON. The current study is unchanged.' };
  }
  if (!validateExperiment(value)) return { ok: false, error: 'Invalid experiment: expected version 1, bounded calibration and one unique observation per known landmark. The current study is unchanged.' };
  return { ok: true, value };
}
export function exportPly(results: Reconstruction[]): string {
  const points = results.flatMap((result) => result.point ? [result.point] : []);
  return ['ply', 'format ascii 1.0', 'comment PARALLAX calibrated reconstruction; metres; X right Y up', `element vertex ${points.length}`, 'property float x', 'property float y', 'property float z', 'end_header', ...points.map((p) => p.map((v) => v.toPrecision(9)).join(' ')), ''].join('\n');
}
