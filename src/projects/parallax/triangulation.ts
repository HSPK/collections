import { cameraPoint, project, projectionJacobian, unproject } from './camera';
import type { Camera } from './camera';
import { add, dot, eigenSymmetric, inverse, mul, mv, norm, sub } from './math';
import type { M3, V2, V3 } from './math';

export interface Estimate {
  status: 'ok' | 'unstable' | 'unavailable' | 'behind';
  reason: string;
  point: V3 | null;
  angle: number;
  gap: number | null;
}
export interface Residuals { a: V2; b: V2; rms: number; squared: number }

// The solver only accepts pixels and calibration. Landmark/world data cannot enter here.
export function triangulate(a: Camera, b: Camera, pa: V2, pb: V2): Estimate {
  const delta = sub(a.center, b.center);
  const baseline = norm(delta);
  const empty = (status: Estimate['status'], reason: string, angle = 0): Estimate => ({ status, reason, point: null, angle, gap: null });
  if (baseline < 1e-6) return empty('unavailable', 'Camera centers coincide: depth is not observable.');
  const da = unproject(a, pa), db = unproject(b, pb);
  const cosine = dot(da, db), denominator = 1 - cosine * cosine;
  const angle = Math.acos(Math.min(1, Math.abs(cosine))) * 180 / Math.PI;
  if (denominator < Math.sin(0.1 * Math.PI / 180) ** 2) return empty('unstable', 'Ray angle below 0.1 degrees: depth is unstable.', angle);
  const d = dot(da, delta), e = dot(db, delta);
  const sa = (cosine * e - d) / denominator, sb = (e - cosine * d) / denominator;
  if (sa <= 0 || sb <= 0) return empty('behind', 'The rays meet behind a camera (failed cheirality).', angle);
  const qa = add(a.center, mul(da, sa)), qb = add(b.center, mul(db, sb));
  const point = mul(add(qa, qb), 0.5);
  if (cameraPoint(a, point)[2] <= 0 || cameraPoint(b, point)[2] <= 0) return empty('behind', 'Nonpositive camera depth.', angle);
  return { status: 'ok', reason: 'Closest-ray midpoint', point, angle, gap: norm(sub(qa, qb)) };
}
export function residuals(a: Camera, b: Camera, pa: V2, pb: V2, point: V3): Residuals | null {
  const qa = project(a, point), qb = project(b, point);
  if (!qa || !qb) return null;
  const ra: V2 = [qa[0] - pa[0], qa[1] - pa[1]], rb: V2 = [qb[0] - pb[0], qb[1] - pb[1]];
  const squared = ra[0] ** 2 + ra[1] ** 2 + rb[0] ** 2 + rb[1] ** 2;
  return { a: ra, b: rb, squared, rms: Math.sqrt(squared / 4) };
}
function normalSystem(a: Camera, b: Camera, point: V3): { hessian: M3; jacobian: V3[] } | null {
  const ja = projectionJacobian(a, point), jb = projectionJacobian(b, point);
  if (!ja || !jb) return null;
  const jacobian = [...ja, ...jb];
  const hessian: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const row of jacobian) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) hessian[i][j] += row[i] * row[j];
  return { hessian, jacobian };
}
export function refine(a: Camera, b: Camera, pa: V2, pb: V2, start: V3): { point: V3; iterations: number; converged: boolean } {
  let point: V3 = [...start];
  for (let iteration = 0; iteration < 24; iteration++) {
    const current = residuals(a, b, pa, pb, point), system = normalSystem(a, b, point);
    if (!current || !system) return { point, iterations: iteration, converged: false };
    const inv = inverse(system.hessian);
    if (!inv) return { point, iterations: iteration, converged: false };
    const errors = [...current.a, ...current.b];
    let gradient: V3 = [0, 0, 0];
    system.jacobian.forEach((row, i) => { gradient = add(gradient, mul(row, errors[i])); });
    const step = mv(inv, gradient);
    if (norm(step) < 1e-9 * Math.max(1, norm(point))) return { point, iterations: iteration, converged: true };
    let accepted = false;
    for (let lineSearch = 0; lineSearch < 14; lineSearch++) {
      const candidate = sub(point, mul(step, 2 ** -lineSearch));
      const next = residuals(a, b, pa, pb, candidate);
      if (next && next.squared < current.squared) { point = candidate; accepted = true; break; }
    }
    if (!accepted) return { point, iterations: iteration + 1, converged: norm(gradient) < 1e-6 };
  }
  return { point, iterations: 24, converged: false };
}
export interface Uncertainty { covariance: M3; axes: M3; radii: V3; depthSigma: number; condition: number }
export function uncertainty(a: Camera, b: Camera, point: V3, sigma: number): Uncertainty | null {
  const system = normalSystem(a, b, point);
  if (!system) return null;
  const eigen = eigenSymmetric(system.hessian);
  const condition = eigen.values[2] / eigen.values[0];
  const inv = inverse(system.hessian);
  if (!inv || !eigen.converged || eigen.values[0] <= 0 || condition > 1e12) return null;
  const covariance = inv.map((row) => mul(row, sigma * sigma)) as M3;
  const axes = eigen.vectors as M3;
  const radii = eigen.values.map((value) => sigma / Math.sqrt(value)) as V3;
  const forward = a.rotation[2];
  return { covariance, axes, radii, depthSigma: Math.sqrt(Math.max(0, dot(forward, mv(covariance, forward)))), condition };
}
