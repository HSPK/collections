import type { Lens, OpticalElement, Refractor, Vec } from './model';

export const EPSILON = 1e-7;
export const OFFSET = 1e-5;
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, factor: number): Vec => ({ x: a.x * factor, y: a.y * factor });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const degrees = (radiansValue: number): number => radiansValue * 180 / Math.PI;
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function normalize(vector: Vec): Vec {
  const magnitude = length(vector);
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) throw new RangeError('A ray direction must be finite and nonzero.');
  return scale(vector, 1 / magnitude);
}

export function rotate(vector: Vec, angle: number): Vec {
  const theta = radians(angle);
  return { x: vector.x * Math.cos(theta) - vector.y * Math.sin(theta), y: vector.x * Math.sin(theta) + vector.y * Math.cos(theta) };
}

export function toWorld(point: Vec, element: OpticalElement): Vec {
  return add(rotate(point, element.rotation), element);
}

export function toLocal(point: Vec, element: OpticalElement): Vec {
  return rotate(sub(point, element), -element.rotation);
}

export interface Intersection {
  distance: number;
  point: Vec;
  normal: Vec;
}

// Parallel and collinear rays do not cross a zero-thickness surface.
export function raySegment(origin: Vec, direction: Vec, a: Vec, b: Vec): Intersection | null {
  const edge = sub(b, a);
  const denominator = cross(direction, edge);
  if (Math.abs(denominator) <= EPSILON * Math.max(1, length(edge) * length(direction))) return null;
  const offset = sub(a, origin);
  const distance = cross(offset, edge) / denominator;
  const position = cross(offset, direction) / denominator;
  if (distance <= EPSILON || position < -EPSILON || position > 1 + EPSILON) return null;
  return { distance, point: add(origin, scale(direction, distance)), normal: normalize({ x: edge.y, y: -edge.x }) };
}

export function rayCircle(origin: Vec, direction: Vec, center: Vec, radius: number): Intersection[] {
  const offset = sub(origin, center);
  const a = dot(direction, direction);
  if (a <= EPSILON || radius <= 0) return [];
  const b = dot(offset, direction);
  const c = dot(offset, offset) - radius * radius;
  let discriminant = b * b - a * c;
  const tolerance = Number.EPSILON * 16 * Math.max(b * b, Math.abs(a * c), 1);
  if (discriminant < -tolerance) return [];
  discriminant = Math.max(0, discriminant);
  const root = Math.sqrt(discriminant);
  // The q formulation avoids cancellation at nearly tangent or distant surfaces.
  const q = -b - (b < 0 ? -root : root);
  const distances = discriminant === 0 ? [-b / a] : q === 0 ? [(-b - root) / a, (-b + root) / a] : [q / a, c / q];
  return distances.filter((distance) => distance > EPSILON).sort((left, right) => left - right).map((distance) => {
    const point = add(origin, scale(direction, distance));
    return { distance, point, normal: normalize(sub(point, center)) };
  });
}

function winding(points: Vec[]): number {
  return Math.sign(points.reduce((area, point, index) => area + cross(point, points[(index + 1) % points.length]), 0)) || 1;
}

export function pointInConvex(point: Vec, points: Vec[], tolerance = EPSILON): boolean {
  const orientation = winding(points);
  return points.length >= 3 && points.every((a, index) => {
    const edge = sub(points[(index + 1) % points.length], a);
    return orientation * cross(edge, sub(point, a)) >= -tolerance * Math.max(1, length(edge));
  });
}

export function rayPolygon(origin: Vec, direction: Vec, points: Vec[]): Intersection | null {
  let nearest: Intersection | null = null;
  const orientation = winding(points);
  for (let index = 0; index < points.length; index += 1) {
    const hit = raySegment(origin, direction, points[index], points[(index + 1) % points.length]);
    if (!hit) continue;
    hit.normal = scale(hit.normal, orientation);
    if (!nearest || hit.distance < nearest.distance - EPSILON ||
      (Math.abs(hit.distance - nearest.distance) <= EPSILON && Math.abs(dot(direction, hit.normal)) > Math.abs(dot(direction, nearest.normal)))) {
      nearest = hit;
    }
  }
  return nearest;
}

export function polygonPoints(element: Exclude<Refractor, Lens>): Vec[] {
  const points = element.kind === 'prism'
    ? [{ x: 0, y: -element.size / Math.sqrt(3) }, { x: element.size / 2, y: element.size / (2 * Math.sqrt(3)) }, { x: -element.size / 2, y: element.size / (2 * Math.sqrt(3)) }]
    : [{ x: -element.width / 2, y: -element.height / 2 }, { x: element.width / 2, y: -element.height / 2 }, { x: element.width / 2, y: element.height / 2 }, { x: -element.width / 2, y: element.height / 2 }];
  return points.map((point) => toWorld(point, element));
}

export function lensCircles(lens: Lens): { radius: number; centers: Vec[] } {
  const radius = (lens.diameter * lens.diameter + lens.thickness * lens.thickness) / (4 * lens.thickness);
  const displacement = radius - lens.thickness / 2;
  return { radius, centers: [toWorld({ x: -displacement, y: 0 }, lens), toWorld({ x: displacement, y: 0 }, lens)] };
}

export function contains(element: Refractor, point: Vec): boolean {
  if (element.kind !== 'lens') return pointInConvex(point, polygonPoints(element));
  const { radius, centers } = lensCircles(element);
  return centers.every((center) => length(sub(point, center)) <= radius + EPSILON);
}

export function segmentEnds(element: OpticalElement & { length: number }): [Vec, Vec] {
  return [toWorld({ x: -element.length / 2, y: 0 }, element), toWorld({ x: element.length / 2, y: 0 }, element)];
}

export function intersectElement(origin: Vec, direction: Vec, element: OpticalElement): Intersection | null {
  if (element.kind === 'emitter') return null;
  if (element.kind === 'mirror' || element.kind === 'detector') {
    const [a, b] = segmentEnds(element);
    return raySegment(origin, direction, a, b);
  }
  if (element.kind !== 'lens') return rayPolygon(origin, direction, polygonPoints(element));
  const { radius, centers } = lensCircles(element);
  const hits = centers.flatMap((center, index) => rayCircle(origin, direction, center, radius)
    .filter((hit) => length(sub(hit.point, centers[1 - index])) <= radius + OFFSET && Math.abs(dot(hit.normal, direction)) > EPSILON));
  return hits.sort((a, b) => a.distance - b.distance)[0] ?? null;
}
