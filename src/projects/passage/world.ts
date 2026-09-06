import { clamp, lerp } from '../../core/math';

export const RESOLUTION = 0.5;
export const MAX_EXPANSIONS = 20_000;
export const EPS = 1e-7;
export class LayoutError extends Error {}
export interface Point { x: number; y: number; z: number }
export interface Rect { x: number; z: number; w: number; d: number }
export interface Floor { id: string; name: string; elevation: number; color: string; voids: Rect[] }
export interface Wall {
  id: string; floor: string; x: number; z: number; length: number; thickness: number; axis: 'x' | 'z';
}
export interface Door { id: string; wall: string; name: string; offset: number; width: number; open: boolean }
export interface Obstacle extends Rect { id: string; floor: string; name: string; height: number }
export interface Room extends Rect { id: string; floor: string; name: string; short: string; point: Endpoint }
export interface Portal extends Rect {
  id: string; name: string; kind: 'stairs' | 'lift'; from: string; to: string;
  width: number; open: boolean; wait: number;
}
export interface World {
  name: string; width: number; depth: number; floors: Floor[];
  walls: Wall[]; doors: Door[]; obstacles: Obstacle[]; rooms: Room[]; portals: Portal[];
}
export interface Endpoint { floor: string; x: number; z: number }
export interface Profile {
  id: string; name: string; radius: number; margin: number; stepFree: boolean;
  speed: number; stairSpeed: number; stairPenalty: number;
}
export type Objective = 'comfort' | 'distance';
export interface Layout { world: World; start: Endpoint; end: Endpoint; profile: Profile; objective: Objective }
export interface Solid extends Rect { id: string; kind: 'wall' | 'door' | 'obstacle' | 'void' | 'shaft'; height: number }

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const interpolate = (a: Point, b: Point, t: number): Point =>
  ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
export const radiusOf = (profile: Profile) => profile.radius + profile.margin;
export function floorOf(world: World, id: string): Floor {
  const floor = world.floors.find((candidate) => candidate.id === id);
  if (!floor) throw new LayoutError(`Unknown floor "${id}".`);
  return floor;
}
export const snap = (value: number) => Math.floor(value / RESOLUTION) * RESOLUTION + RESOLUTION / 2;
export function canonicalEndpoint(endpoint: Endpoint): Endpoint | null {
  if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.z)) return null;
  const x = snap(endpoint.x), z = snap(endpoint.z);
  if (Math.abs(x - endpoint.x) > EPS || Math.abs(z - endpoint.z) > EPS) return null;
  return { floor: endpoint.floor, x, z };
}
export function pointOf(world: World, endpoint: Endpoint): Point {
  const center = canonicalEndpoint(endpoint);
  if (!center) throw new LayoutError('Endpoint coordinates must be 0.5 m grid centers.');
  return { x: center.x, y: floorOf(world, center.floor).elevation, z: center.z };
}
export function wallRect(wall: Wall, offset = 0, length = wall.length): Rect {
  return { x: wall.x + (wall.axis === 'x' ? offset : 0), z: wall.z + (wall.axis === 'z' ? offset : 0),
    w: wall.axis === 'x' ? length : wall.thickness, d: wall.axis === 'z' ? length : wall.thickness };
}
export const doorRect = (wall: Wall, door: Door) => wallRect(wall, door.offset - door.width / 2, door.width);
export function structuralSolids(world: World, floor: string): Solid[] {
  const result: Solid[] = [];
  for (const wall of world.walls.filter((item) => item.floor === floor)) {
    let cursor = 0;
    for (const door of world.doors.filter((item) => item.wall === wall.id).sort((a, b) => a.offset - b.offset)) {
      const start = door.offset - door.width / 2;
      if (start > cursor + EPS) result.push({ ...wallRect(wall, cursor, start - cursor), id: wall.id, kind: 'wall', height: 2.6 });
      if (!door.open) result.push({ ...doorRect(wall, door), id: door.id, kind: 'door', height: 2.2 });
      cursor = door.offset + door.width / 2;
    }
    if (cursor < wall.length - EPS) result.push({ ...wallRect(wall, cursor, wall.length - cursor),
      id: wall.id, kind: 'wall', height: 2.6 });
  }
  result.push(...world.obstacles.filter((item) => item.floor === floor).map((item): Solid => ({ ...item, kind: 'obstacle' })));
  return result;
}
export const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d;
export function solidsOn(world: World, floor: string): Solid[] {
  const result = structuralSolids(world, floor);
  result.push(...floorOf(world, floor).voids.map((rect, i): Solid => ({ ...rect, id: `void-${floor}-${i}`, kind: 'void', height: 0 })));
  for (const portal of world.portals.filter((item) => item.from === floor || item.to === floor)) {
    if (!result.some((item) => item.kind === 'shaft' && sameRect(item, portal))) {
      result.push({ x: portal.x, z: portal.z, w: portal.w, d: portal.d, id: portal.id, kind: 'shaft', height: 0 });
    }
  }
  return result;
}

function pointRectDistance(x: number, z: number, rect: Rect) {
  return Math.hypot(Math.max(rect.x - x, 0, x - rect.x - rect.w), Math.max(rect.z - z, 0, z - rect.z - rect.d));
}
function pointSegmentDistance(x: number, z: number, a: Pick<Point, 'x' | 'z'>, b: Pick<Point, 'x' | 'z'>) {
  const dx = b.x - a.x, dz = b.z - a.z, denominator = dx * dx + dz * dz;
  const t = denominator === 0 ? 0 : clamp(((x - a.x) * dx + (z - a.z) * dz) / denominator, 0, 1);
  return Math.hypot(x - lerp(a.x, b.x, t), z - lerp(a.z, b.z, t));
}
export function segmentRectEntry(a: Pick<Point, 'x' | 'z'>, b: Pick<Point, 'x' | 'z'>, rect: Rect): number | null {
  let near = 0, far = 1;
  for (const [origin, delta, low, high] of [[a.x, b.x - a.x, rect.x, rect.x + rect.w], [a.z, b.z - a.z, rect.z, rect.z + rect.d]]) {
    if (Math.abs(delta) < EPS) {
      if (origin < low || origin > high) return null;
    } else {
      const first = (low - origin) / delta, second = (high - origin) / delta;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
      if (near > far) return null;
    }
  }
  return near;
}
export function intersectsRect(a: Pick<Point, 'x' | 'z'>, b: Pick<Point, 'x' | 'z'>, rect: Rect): boolean {
  return segmentRectEntry(a, b, rect) !== null;
}
export function segmentRectDistance(a: Pick<Point, 'x' | 'z'>, b: Pick<Point, 'x' | 'z'>, rect: Rect): number {
  if (intersectsRect(a, b, rect)) return 0;
  return Math.min(pointRectDistance(a.x, a.z, rect), pointRectDistance(b.x, b.z, rect),
    ...[[rect.x, rect.z], [rect.x + rect.w, rect.z], [rect.x, rect.z + rect.d], [rect.x + rect.w, rect.z + rect.d]]
      .map(([x, z]) => pointSegmentDistance(x, z, a, b)));
}
export function segmentClear(world: World, solids: Rect[], a: Pick<Point, 'x' | 'z'>, b: Pick<Point, 'x' | 'z'>, radius: number) {
  for (const point of [a, b]) {
    if (point.x < radius - EPS || point.z < radius - EPS || point.x > world.width - radius + EPS || point.z > world.depth - radius + EPS) return false;
  }
  return solids.every((rect) => segmentRectDistance(a, b, rect) > radius + EPS);
}
export function endpointIssue(world: World, endpoint: Endpoint, profile: Profile): string | null {
  if (!world.floors.some((floor) => floor.id === endpoint.floor)) return 'The endpoint references a missing floor.';
  if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.z) || endpoint.x < 0 || endpoint.z < 0 ||
    endpoint.x >= world.width || endpoint.z >= world.depth) return 'The endpoint is outside the building.';
  const center = canonicalEndpoint(endpoint);
  if (!center) return 'The endpoint must be at a 0.5 m grid-cell center.';
  if (!segmentClear(world, solidsOn(world, center.floor), center, center, radiusOf(profile))) {
    return 'The endpoint is occupied or has insufficient body clearance. Move it to open floor space or undo the edit.';
  }
  return null;
}
export function pickEndpoint(world: World, floor: string, x: number, z: number, profile: Profile): Endpoint {
  const result = { floor, x: snap(x), z: snap(z) };
  const issue = endpointIssue(world, result, profile);
  if (issue) throw new LayoutError(issue);
  if (!segmentClear(world, solidsOn(world, floor), { x, z }, result, radiusOf(profile))) {
    throw new LayoutError('That point is too close to a wall, object, or floor opening. Pick inside a clear passage.');
  }
  return result;
}

// Shafts are reserved from horizontal navigation. These canonical, Y-up paths
// are also the centerlines used to construct the visible stair flights and lift.
export function portalPath(world: World, portal: Portal): Point[] {
  const low = floorOf(world, portal.from).elevation, high = floorOf(world, portal.to).elevation;
  let path: Point[];
  if (portal.kind === 'lift') {
    const x = portal.x + portal.w / 2, z = portal.z + portal.d / 2, entry = portal.x - 1;
    path = [{ x: entry, y: low, z }, { x, y: low, z }, { x, y: high, z }, { x: entry, y: high, z }];
  } else {
    const x1 = portal.x + portal.w / 4, x2 = portal.x + 3 * portal.w / 4;
    const front = portal.z + portal.d + 1, bottom = portal.z + portal.d - 0.5, back = portal.z + 0.75, mid = (low + high) / 2;
    path = [{ x: x1, y: low, z: front }, { x: x1, y: low, z: bottom }, { x: x1, y: mid, z: back },
      { x: x2, y: mid, z: back }, { x: x2, y: high, z: bottom }, { x: x2, y: high, z: front }];
  }
  for (const index of [0, path.length - 1]) {
    const center = canonicalEndpoint({ ...path[index], floor: index === 0 ? portal.from : portal.to });
    if (!center) throw new LayoutError('Connector terminals must be at 0.5 m grid centers.');
    path[index] = { x: center.x, y: path[index].y, z: center.z };
  }
  return path;
}
export function portalIssue(world: World, portal: Portal, profile: Profile): string | null {
  if (!portal.open) return `${portal.name} is closed.`;
  if (profile.stepFree && portal.kind === 'stairs') return `${portal.name} is excluded by step-free travel.`;
  if (portal.width <= 2 * radiusOf(profile) + EPS) return `${portal.name} is too narrow for the selected body and margin.`;
  const path = portalPath(world, portal);
  for (const floor of [portal.from, portal.to]) {
    const solids = solidsOn(world, floor).filter((item) => !(item.kind === 'shaft' && sameRect(item, portal)));
    for (let i = 1; i < path.length; i++) {
      if (!segmentClear(world, solids, path[i - 1], path[i], radiusOf(profile))) return `${portal.name} has an obstructed landing or connector envelope.`;
    }
  }
  return null;
}
