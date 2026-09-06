import type { Bounds, Document, Primitive, SlicePlane, Vec3 } from './model';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(...a);
  return length > 1e-14 ? scale(a, 1 / length) : [0, 0, 1];
}

// Column basis for Rz * Ry * Rx: local X, then Y, then Z; translation is last.
export function basis(rotation: Vec3): [Vec3, Vec3, Vec3] {
  const [x, y, z] = rotation.map((angle) => angle * Math.PI / 180);
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  return [
    [cz * cy, sz * cy, -sy],
    [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx],
    [cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx],
  ];
}

export function worldPoint(local: Vec3, position: Vec3, rotation: Vec3): Vec3 {
  const [u, v, n] = basis(rotation);
  return add(position, add(scale(u, local[0]), add(scale(v, local[1]), scale(n, local[2]))));
}

export function planeBasis(plane: SlicePlane) {
  const [u, v, normal] = basis(plane.rotation);
  return { u, v, normal, origin: scale(normal, plane.offset) };
}

export function planePoint(plane: SlicePlane, u: number, v: number): Vec3 {
  const frame = planeBasis(plane);
  return add(frame.origin, add(scale(frame.u, u), scale(frame.v, v)));
}

export function compilePrimitive(item: Primitive): (point: Vec3) => number {
  const [u, v, n] = basis(item.rotation);
  return (point) => {
    const p = sub(point, item.position);
    const x = dot(p, u), y = dot(p, v), z = dot(p, n);
    if (item.kind === 'sphere') return Math.hypot(x, y, z) - item.radius;
    if (item.kind === 'torus') return Math.hypot(Math.hypot(x, y) - item.radius, z) - item.tube;
    if (item.kind === 'cylinder') {
      const a = Math.hypot(x, y) - item.radius, b = Math.abs(z) - item.size[2] / 2;
      return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0);
    }
    const a = Math.abs(x) - item.size[0] / 2, b = Math.abs(y) - item.size[1] / 2, c = Math.abs(z) - item.size[2] / 2;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)) + Math.min(Math.max(a, b, c), 0);
  };
}

export function compileField(document: Pick<Document, 'primitives'>): (point: Vec3) => number {
  const fields = document.primitives.map((item) => ({ operation: item.operation, field: compilePrimitive(item) }));
  return (point) => {
    let distance = Infinity;
    for (const { operation, field } of fields) {
      const next = field(point);
      distance = operation === 'union' ? Math.min(distance, next)
        : operation === 'difference' ? Math.max(distance, -next) : Math.max(distance, next);
    }
    return distance;
  };
}

export function primitiveBounds(item: Primitive): Bounds {
  const half: Vec3 = item.kind === 'box' ? scale(item.size, 0.5)
    : item.kind === 'sphere' ? [item.radius, item.radius, item.radius]
      : item.kind === 'cylinder' ? [item.radius, item.radius, item.size[2] / 2]
        : [item.radius + item.tube, item.radius + item.tube, item.tube];
  const [u, v, n] = basis(item.rotation);
  const extent: Vec3 = [0, 1, 2].map((i) => Math.abs(u[i]) * half[0] + Math.abs(v[i]) * half[1] + Math.abs(n[i]) * half[2]) as Vec3;
  return { min: sub(item.position, extent), max: add(item.position, extent) };
}

export function modelBounds(document: Pick<Document, 'primitives'>): Bounds | null {
  let bounds: Bounds | null = null;
  for (const item of document.primitives) {
    const next = primitiveBounds(item);
    if (item.operation === 'union') {
      bounds = bounds ? {
        min: [Math.min(bounds.min[0], next.min[0]), Math.min(bounds.min[1], next.min[1]), Math.min(bounds.min[2], next.min[2])],
        max: [Math.max(bounds.max[0], next.max[0]), Math.max(bounds.max[1], next.max[1]), Math.max(bounds.max[2], next.max[2])],
      } : next;
    } else if (item.operation === 'intersection' && bounds) {
      bounds = {
        min: [Math.max(bounds.min[0], next.min[0]), Math.max(bounds.min[1], next.min[1]), Math.max(bounds.min[2], next.min[2])],
        max: [Math.min(bounds.max[0], next.max[0]), Math.min(bounds.max[1], next.max[1]), Math.min(bounds.max[2], next.max[2])],
      };
      if (bounds.min.some((value, i) => value >= bounds!.max[i])) bounds = null;
    }
  }
  return bounds;
}

export function corners(bounds: Bounds): Vec3[] {
  return Array.from({ length: 8 }, (_, i) => [bounds[i & 1 ? 'max' : 'min'][0], bounds[i & 2 ? 'max' : 'min'][1], bounds[i & 4 ? 'max' : 'min'][2]]);
}
