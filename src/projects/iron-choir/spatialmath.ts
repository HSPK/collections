import type { LocationId, MissionId } from './data';

export interface Point { x: number; z: number }
export interface Vec3 extends Point { y: number }
export interface Solid { id: string; min: Vec3; max: Vec3; kind: 'terrain' | 'low' | 'wall' }
export interface Field { width: number; depth: number; heights: number[]; solids: Solid[]; terminal: Point }
export const equalPoint = (a: Point, b: Point) => a.x === b.x && a.z === b.z;
export const pointKey = (p: Point) => `${p.x}:${p.z}`;
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function heightAt(field: Field, p: Point): number { return field.heights[p.z * field.width + p.x] ?? 0; }
export function center(field: Field, p: Point, lift = 0.95): Vec3 { return { ...p, y: heightAt(field, p) + lift }; }

const LAYOUTS: Record<MissionId, { walls: Point[]; low: Point[]; terrace: 'east' | 'banks' | 'north' }> = {
  rain: { walls: [{ x: 3, z: 1 }, { x: 5, z: 5 }], low: [{ x: 4, z: 2 }, { x: 4, z: 4 }], terrace: 'east' },
  mirror: { walls: [{ x: 3, z: 5 }, { x: 6, z: 0 }], low: [{ x: 3, z: 2 }, { x: 5, z: 4 }], terrace: 'banks' },
  water: { walls: [{ x: 4, z: 0 }, { x: 5, z: 6 }], low: [{ x: 4, z: 2 }, { x: 4, z: 4 }], terrace: 'north' },
  bridge: { walls: [{ x: 4, z: 1 }, { x: 5, z: 5 }], low: [{ x: 3, z: 2 }, { x: 6, z: 4 }], terrace: 'banks' },
  names: { walls: [{ x: 3, z: 1 }, { x: 5, z: 5 }, { x: 7, z: 0 }], low: [{ x: 4, z: 4 }, { x: 6, z: 3 }], terrace: 'north' },
  crown: { walls: [{ x: 4, z: 1 }, { x: 6, z: 5 }], low: [{ x: 3, z: 4 }, { x: 5, z: 2 }], terrace: 'east' },
};
const LOCATION_MISSION: Partial<Record<LocationId, MissionId>> = { gate: 'rain', salt: 'mirror', cistern: 'water', spine: 'bridge', garden: 'names', crown: 'crown' };

export function makeField(id: MissionId | LocationId, seed = 1): Field {
  const mission = Object.hasOwn(LAYOUTS, id) ? id as MissionId : LOCATION_MISSION[id as LocationId] ?? 'rain';
  const layout = LAYOUTS[mission];
  const field: Field = { width: 9, depth: 7, heights: [], solids: [], terminal: { x: 4, z: 3 } };
  for (let z = 0; z < field.depth; z++) {
    for (let x = 0; x < field.width; x++) {
      const step = layout.terrace === 'east' ? Math.max(0, x - 3) :
        layout.terrace === 'north' ? Math.max(0, 3 - z) : Math.max(0, Math.abs(z - 3) - 1);
      const y = step * 0.28 + (seed % 2 === 0 && x === 8 ? 0.08 : 0);
      field.heights.push(y);
      field.solids.push({ id: `ground-${x}-${z}`, min: { x: x - 0.5, y: -0.55, z: z - 0.5 }, max: { x: x + 0.5, y, z: z + 0.5 }, kind: 'terrain' });
    }
  }
  for (const [kind, points] of [['wall', layout.walls], ['low', layout.low]] as const) {
    points.forEach((p, index) => {
      const y = heightAt(field, p);
      field.solids.push({ id: `${kind}-${index}`, min: { x: p.x - 0.46, y, z: p.z - 0.46 }, max: { x: p.x + 0.46, y: y + (kind === 'wall' ? 2.1 : 0.72), z: p.z + 0.46 }, kind });
    });
  }
  return field;
}

// The same closed boxes are drawn by the renderer and intersected by every shot.
export function segmentIntersectsBox(a: Vec3, b: Vec3, solid: Solid): boolean {
  let near = 0.0001, far = 0.9999;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < solid.min[axis] || a[axis] > solid.max[axis]) return false;
    } else {
      const first = (solid.min[axis] - a[axis]) / delta, second = (solid.max[axis] - a[axis]) / delta;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
      if (near > far) return false;
    }
  }
  return true;
}
export function shotGeometry(field: Field, from: Point, to: Point, range: number) {
  const a = center(field, from), b = center(field, to);
  const length = distance(a, b);
  const blocker = field.solids.find(solid => segmentIntersectsBox(a, b, solid));
  const cover = !blocker && field.solids.some(solid => solid.kind === 'low' &&
    segmentIntersectsBox(center(field, from, 0.55), center(field, to, 0.55), solid));
  return { distance: length, inRange: length <= range + 1e-8, visible: !blocker, cover: Boolean(cover), blocker: blocker?.id ?? null };
}
export function walkable(field: Field, p: Point): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= 0 && p.z >= 0 && p.x < field.width && p.z < field.depth &&
    !field.solids.some(solid => solid.kind !== 'terrain' && p.x > solid.min.x && p.x < solid.max.x && p.z > solid.min.z && p.z < solid.max.z);
}
export function pathsFrom(field: Field, start: Point, budget: number, occupied: Point[]): Map<string, Point[]> {
  const paths = new Map<string, Point[]>([[pointKey(start), []]]);
  const queue: Point[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i], path = paths.get(pointKey(at))!;
    if (path.length >= budget) continue;
    for (const p of [{ x: at.x + 1, z: at.z }, { x: at.x, z: at.z + 1 }, { x: at.x - 1, z: at.z }, { x: at.x, z: at.z - 1 }]) {
      if (paths.has(pointKey(p)) || !walkable(field, p) || occupied.some(unit => equalPoint(unit, p)) ||
          Math.abs(heightAt(field, at) - heightAt(field, p)) > 0.36) continue;
      paths.set(pointKey(p), [...path, p]);
      queue.push(p);
    }
  }
  paths.delete(pointKey(start));
  return paths;
}
