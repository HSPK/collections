import { add, compileField, cross, dot, modelBounds, normalize, scale, sub } from './fields';
import { LIMITS } from './model';
import type { Bounds, Document, Vec3 } from './model';

export interface MeshResult {
  positions: Float32Array;
  normals: Float32Array;
  volume: number;
  bounds: Bounds | null;
  domain: Bounds;
  step: number;
  triangles: number;
  state: 'resolved' | 'empty' | 'unresolved';
  warnings: string[];
}
const TETRAHEDRA = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export class GeometryLimitError extends Error {}

export function meshSolid(document: Document): MeshResult {
  const envelope = modelBounds(document);
  const domain = envelope ?? { min: [-30, -30, -30] as Vec3, max: [30, 30, 30] as Vec3 };
  const span = sub(domain.max, domain.min);
  const step = Math.max(...span) / document.resolution;
  if (!Number.isFinite(step) || step <= 0 || document.resolution > 64 || document.resolution < 8) throw new GeometryLimitError('Invalid meshing grid.');
  const positions: number[] = [], normals: number[] = [];
  const result: MeshResult = { positions: new Float32Array(), normals: new Float32Array(), volume: 0, bounds: null, domain, step, triangles: 0, state: envelope ? 'unresolved' : 'empty', warnings: [] };
  if (!envelope) {
    result.warnings.push('The operation envelope is empty. There is no positive-volume solid to sample.');
    return result;
  }
  const field = compileField(document);
  const origin = sub(domain.min, [1.5 * step, 1.5 * step, 1.5 * step]);
  const nx = Math.ceil(span[0] / step) + 3, ny = Math.ceil(span[1] / step) + 3, nz = Math.ceil(span[2] / step) + 3;
  if ((nx + 1) * (ny + 1) * (nz + 1) > 330_000) throw new GeometryLimitError('The sampling grid exceeds its memory budget.');
  const index = (x: number, y: number, z: number) => (z * (ny + 1) + y) * (nx + 1) + x;
  const samples = new Float64Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let z = 0; z <= nz; z++) for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const value = field([origin[0] + x * step, origin[1] + y * step, origin[2] + z * step]);
    samples[index(x, y, z)] = Math.abs(value) < step * 1e-10 ? step * 1e-10 : value;
  }
  const epsilon = step * 0.01;
  function shadingNormal(p: Vec3, faceNormal: Vec3): Vec3 {
    const gradient: Vec3 = [
      field([p[0] + epsilon, p[1], p[2]]) - field([p[0] - epsilon, p[1], p[2]]),
      field([p[0], p[1] + epsilon, p[2]]) - field([p[0], p[1] - epsilon, p[2]]),
      field([p[0], p[1], p[2] + epsilon]) - field([p[0], p[1], p[2] - epsilon]),
    ];
    const length = Math.hypot(...gradient);
    if (!Number.isFinite(length)) throw new GeometryLimitError('The surface gradient is not finite.');
    return length > 0 ? scale(gradient, 1 / length) : faceNormal;
  }
  let volume = 0, compensation = 0, collapsed = 0;
  const reference = scale(add(domain.min, domain.max), 0.5);
  const stored = (p: Vec3): Vec3 => [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2])];
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  function triangle(a: Vec3, b: Vec3, c: Vec3, outward: Vec3) {
    if (dot(cross(sub(b, a), sub(c, a)), outward) < 0) [b, c] = [c, b];
    a = stored(a); b = stored(b); c = stored(c);
    const geometric = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...geometric);
    if (!Number.isFinite(length)) throw new GeometryLimitError('A stored surface triangle is not finite.');
    if (length === 0) { collapsed++; return; }
    if (positions.length / 9 >= LIMITS.triangles) throw new GeometryLimitError('Triangle budget exceeded. Use a coarser resolution or fewer operations.');
    // Measure only retained Float32 geometry, rebased near the model to avoid cancellation.
    const term = dot(sub(a, reference), geometric) / 6 - compensation;
    const sum = volume + term;
    compensation = (sum - volume) - term; volume = sum;
    const faceNormal = scale(geometric, 1 / length);
    for (const point of [a, b, c]) {
      positions.push(...point); normals.push(...shadingNormal(point, faceNormal));
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const ids = Array.from({ length: 8 }, (_, i) => index(x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1)));
    const values = ids.map((id) => samples[id]);
    if (values.every((v) => v >= 0) || values.every((v) => v < 0)) continue;
    const points: Vec3[] = Array.from({ length: 8 }, (_, i) => [origin[0] + (x + (i & 1)) * step, origin[1] + (y + ((i >> 1) & 1)) * step, origin[2] + (z + ((i >> 2) & 1)) * step]);
    for (const tetrahedron of TETRAHEDRA) {
      const crossings: Vec3[] = [];
      for (const [ia, ib] of EDGES) {
        let a = tetrahedron[ia], b = tetrahedron[ib];
        if ((values[a] < 0) === (values[b] < 0)) continue;
        if (ids[a] > ids[b]) [a, b] = [b, a];
        const t = values[a] / (values[a] - values[b]);
        crossings.push(add(points[a], scale(sub(points[b], points[a]), t)));
      }
      if (crossings.length < 3) continue;
      const [a, b, c, d] = tetrahedron;
      const e1 = sub(points[b], points[a]), e2 = sub(points[c], points[a]), e3 = sub(points[d], points[a]);
      const determinant = dot(e1, cross(e2, e3));
      // Winding and quad ordering belong to this tetrahedron's affine field, not nonlinear CSG.
      const outward = scale(add(
        scale(cross(e2, e3), values[b] - values[a]),
        add(scale(cross(e3, e1), values[c] - values[a]), scale(cross(e1, e2), values[d] - values[a])),
      ), 1 / determinant);
      if (crossings.length === 3) triangle(crossings[0], crossings[1], crossings[2], outward);
      if (crossings.length === 4) {
        const center = scale(crossings.reduce(add, [0, 0, 0]), 0.25);
        const normal = normalize(outward), offset = sub(crossings[0], center);
        const u = normalize(sub(offset, scale(normal, dot(offset, normal)))), v = cross(normal, u);
        crossings.sort((a, b) => Math.atan2(dot(sub(a, center), v), dot(sub(a, center), u)) - Math.atan2(dot(sub(b, center), v), dot(sub(b, center), u)));
        triangle(crossings[0], crossings[1], crossings[2], outward); triangle(crossings[0], crossings[2], crossings[3], outward);
      }
    }
  }
  result.positions = new Float32Array(positions); result.normals = new Float32Array(normals);
  result.triangles = positions.length / 9;
  result.bounds = positions.length ? { min, max } : null;
  result.volume = volume;
  if (!Number.isFinite(volume) || volume < 0) throw new GeometryLimitError('The surface orientation failed its volume check. No export was produced.');
  result.state = positions.length ? 'resolved' : 'unresolved';
  if (!positions.length) result.warnings.push('No surface resolved: the solid is empty, or its features fall between grid samples. Increase resolution to investigate.');
  if (collapsed) result.warnings.push(`${collapsed.toLocaleString('en-US')} zero-area facets removed at Float32 precision; topology is not certified.`);
  const thin = document.primitives.some((item) => {
    const feature = item.kind === 'box' ? Math.min(...item.size) : item.kind === 'torus' ? 2 * item.tube : item.kind === 'cylinder' ? Math.min(item.radius * 2, item.size[2]) : item.radius * 2;
    return feature < step * 3;
  });
  if (thin) result.warnings.push('At least one primitive is thinner than three grid cells; it may be distorted or absent.');
  result.warnings.push('Boolean gaps and shell walls below two grid cells may disappear. Refine to compare; manifoldness is not certified.');
  return result;
}
