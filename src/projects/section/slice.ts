import { add, compileField, corners, dot, modelBounds, planeBasis, scale } from './fields';
import type { Document, Vec2 } from './model';

export interface Contour { points: Vec2[]; closed: boolean; hole: boolean; parent: number | null }
export interface SliceResult {
  contours: Contour[];
  area: number;
  islands: number;
  holes: number;
  open: number;
  step: number;
  extent: { min: Vec2; max: Vec2 };
  bounds: { min: Vec2; max: Vec2 } | null;
}
const interpolate = (a: Vec2, b: Vec2, da: number, db: number): Vec2 => {
  const t = da / (da - db); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
const polygonArea = (points: Vec2[]) => Math.abs(points.reduce((sum, point, i) => {
  const next = points[(i + 1) % points.length]; return sum + point[0] * next[1] - point[1] * next[0];
}, 0)) / 2;
function contains(points: Vec2[], point: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function sliceSolid(document: Document): SliceResult {
  const domain = modelBounds(document);
  const frame = planeBasis(document.plane), field = compileField(document);
  const projected = domain ? corners(domain).map((p): Vec2 => [dot(p, frame.u), dot(p, frame.v)]) : [[-30, -30], [30, 30]];
  const low: Vec2 = [Math.min(...projected.map((p) => p[0])), Math.min(...projected.map((p) => p[1]))];
  const high: Vec2 = [Math.max(...projected.map((p) => p[0])), Math.max(...projected.map((p) => p[1]))];
  const step = Math.max(high[0] - low[0], high[1] - low[1]) / (document.resolution * 3);
  if (!Number.isFinite(step) || step <= 0 || document.resolution > 64 || document.resolution < 8) throw new Error('Invalid section grid.');
  const min: Vec2 = [low[0] - step * 2, low[1] - step * 2];
  const nx = Math.ceil((high[0] - low[0]) / step) + 4, ny = Math.ceil((high[1] - low[1]) / step) + 4;
  const extent = { min, max: [min[0] + nx * step, min[1] + ny * step] as Vec2 };
  const result: SliceResult = { contours: [], area: 0, islands: 0, holes: 0, open: 0, step, extent, bounds: null };
  if (!domain) return result;
  const values = new Float64Array((nx + 1) * (ny + 1));
  const index = (x: number, y: number) => y * (nx + 1) + x;
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const value = field(add(frame.origin, add(scale(frame.u, min[0] + x * step), scale(frame.v, min[1] + y * step))));
    values[index(x, y)] = Math.abs(value) < step * 1e-10 ? step * 1e-10 : value;
  }
  interface Endpoint { point: Vec2; key: string }
  const segments: [Endpoint, Endpoint][] = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const p: Vec2[] = [[min[0] + x * step, min[1] + y * step], [min[0] + (x + 1) * step, min[1] + y * step], [min[0] + (x + 1) * step, min[1] + (y + 1) * step], [min[0] + x * step, min[1] + (y + 1) * step]];
    const d = [values[index(x, y)], values[index(x + 1, y)], values[index(x + 1, y + 1)], values[index(x, y + 1)]];
    const sampleIds = [index(x, y), index(x + 1, y), index(x + 1, y + 1), index(x, y + 1)];
    for (const ids of [[0, 1, 2], [0, 2, 3]]) {
      const clipped: Vec2[] = [], crossings: Endpoint[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = ids[edge], b = ids[(edge + 1) % 3];
        if (d[a] < 0) clipped.push(p[a]);
        if ((d[a] < 0) !== (d[b] < 0)) {
          const crossing = interpolate(p[a], p[b], d[a], d[b]);
          clipped.push(crossing);
          // Shared sampling-edge IDs join contours without rounding near-grid vertices.
          crossings.push({ point: crossing, key: `${Math.min(sampleIds[a], sampleIds[b])}:${Math.max(sampleIds[a], sampleIds[b])}` });
        }
      }
      if (clipped.length >= 3) result.area += polygonArea(clipped);
      if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
    }
  }
  const adjacency = new Map<string, number[]>();
  segments.forEach((segment, i) => segment.forEach((p) => {
    const list = adjacency.get(p.key) ?? []; list.push(i); adjacency.set(p.key, list);
  }));
  const visited = new Set<number>();
  segments.forEach((segment, start) => {
    if (visited.has(start)) return;
    visited.add(start);
    const points = segment.map((entry) => entry.point), first = segment[0].key;
    let current = segment[1].key, closed = current === first;
    while (!closed && points.length <= segments.length + 1) {
      const next = (adjacency.get(current) ?? []).find((id) => !visited.has(id));
      if (next === undefined) break;
      visited.add(next);
      const line = segments[next], endpoint = line[0].key === current ? line[1] : line[0];
      points.push(endpoint.point); current = endpoint.key; closed = current === first;
    }
    result.contours.push({ points, closed, hole: false, parent: null });
  });
  for (const contour of result.contours) {
    if (!contour.closed) { result.open++; continue; }
    const enclosing = result.contours.filter((other) => other !== contour && other.closed && contains(other.points, contour.points[0]));
    contour.hole = enclosing.length % 2 === 1;
    const parent = enclosing.sort((a, b) => polygonArea(a.points) - polygonArea(b.points))[0];
    contour.parent = parent ? result.contours.indexOf(parent) : null;
    if (contour.hole) result.holes++; else result.islands++;
  }
  if ([...adjacency.values()].some((list) => list.length !== 2)) result.open = Math.max(1, result.open);
  if (segments.length) {
    const min: Vec2 = [Infinity, Infinity], max: Vec2 = [-Infinity, -Infinity];
    for (const segment of segments) for (const { point } of segment) for (let axis = 0; axis < 2; axis++) {
      min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
    }
    result.bounds = { min, max };
  }
  return result;
}
