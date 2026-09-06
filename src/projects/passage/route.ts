import { clamp } from '../../core/math';
import { distance, doorRect, interpolate, LayoutError, segmentRectEntry } from './world';
import type { Layout, Point } from './world';
import { floorAt } from './search';
import type { SearchResult } from './search';

export interface Segment {
  from: Point; to: Point; kind: 'walk' | 'stairs' | 'lift' | 'wait'; portal?: string;
  distance: number; duration: number; startTime: number; startDistance: number;
}
export interface Instruction { text: string; floor: string; distance: number; time: number; point: Point; kind: Segment['kind'] | 'arrive' }
export interface Route {
  segments: Segment[]; points: Point[]; distance: number; duration: number; cost: number;
  instructions: Instruction[]; origin: Point; destination: Point;
}
export interface Pose { point: Point; direction: Point; time: number; distance: number; kind: Segment['kind'] | 'arrive'; segment: number }
const parallel = (a: Segment, b: Segment) => {
  const ax = a.to.x - a.from.x, az = a.to.z - a.from.z, bx = b.to.x - b.from.x, bz = b.to.z - b.from.z;
  return Math.abs(ax * bz - az * bx) < 1e-8 && ax * bx + az * bz > 0;
};
function landmark(layout: Layout, point: Point): string {
  const floor = floorAt(layout.world, point);
  const room = layout.world.rooms.find((room) => room.floor === floor && point.x >= room.x && point.x <= room.x + room.w &&
    point.z >= room.z && point.z <= room.z + room.d);
  if (room) return room.name;
  if (point.z < 8) return 'the north stair hall';
  if (point.z > 13) return 'the south lift lobby';
  return point.x < 13 ? 'the west atrium walk' : 'the east atrium walk';
}
export function buildRoute(layout: Layout, result: SearchResult): Route {
  if (result.status !== 'found') throw new LayoutError('A walk requires a completed, reachable route.');
  const segments: Segment[] = [];
  let totalDistance = 0, time = 0;
  const add = (from: Point, to: Point, kind: Segment['kind'], duration: number, portal?: string) => {
    const length = distance(from, to), previous = segments[segments.length - 1];
    const next: Segment = { from, to, kind, portal, distance: length, duration, startTime: time, startDistance: totalDistance };
    // Only merge collinear grid edges. No shortcut or unvalidated smoothing.
    if (kind === 'walk' && !portal && previous?.kind === 'walk' && !previous.portal && parallel(previous, next)) {
      previous.to = to;
      previous.distance += length;
      previous.duration += duration;
    } else segments.push(next);
    totalDistance += length;
    time += duration;
  };
  for (const edge of result.edges) {
    const portal = edge.portal;
    if (portal?.kind === 'lift' && portal.wait > 0) add(edge.path[0], edge.path[0], 'wait', portal.wait, portal.id);
    for (let i = 1; i < edge.path.length; i++) {
      const from = edge.path[i - 1], to = edge.path[i], length = distance(from, to);
      const kind = portal?.kind === 'stairs' ? 'stairs' : portal?.kind === 'lift' && Math.abs(to.y - from.y) > 0.01 ? 'lift' : 'walk';
      const speed = kind === 'stairs' ? layout.profile.stairSpeed : kind === 'lift' ? 1.1 : layout.profile.speed;
      add(from, to, kind, length / speed, portal?.id);
    }
  }
  const origin = result.nodes[0].point, destination = result.nodes[result.nodes.length - 1].point;
  const instructions: Instruction[] = [];
  segments.forEach((segment, i) => {
    const previous = segments[i - 1], floor = floorAt(layout.world, segment.from);
    if (segment.portal && previous?.portal === segment.portal) return;
    let text: string;
    if (segment.portal) {
      const portal = layout.world.portals.find((item) => item.id === segment.portal)!;
      const upward = segment.from.y < Math.max(...result.edges.find((edge) => edge.portal?.id === portal.id)!.path.map((point) => point.y));
      const target = upward ? portal.to : portal.from;
      text = portal.kind === 'lift' ? `Wait ${portal.wait} s, then take ${portal.name} to ${layout.world.floors.find((item) => item.id === target)!.name}.` :
        `Take ${portal.name} ${upward ? 'up' : 'down'} to ${layout.world.floors.find((item) => item.id === target)!.name}.`;
    } else {
      let turn = 'Continue';
      if (!previous) turn = 'Begin';
      else if (previous.kind === 'walk') {
        const ax = previous.to.x - previous.from.x, az = previous.to.z - previous.from.z;
        const bx = segment.to.x - segment.from.x, bz = segment.to.z - segment.from.z;
        const cross = ax * bz - az * bx;
        if (Math.abs(cross) > 0.001) turn = cross > 0 ? 'Turn right' : 'Turn left';
      }
      text = `${turn} near ${landmark(layout, segment.from)}; follow the marked passage for ${segment.distance.toFixed(1)} m.`;
      const doors = layout.world.doors.flatMap((door) => {
        const wall = layout.world.walls.find((wall) => wall.id === door.wall)!;
        if (wall.floor !== floor) return [];
        const position = segmentRectEntry(segment.from, segment.to, doorRect(wall, door));
        return position === null ? [] : [{ door, position }];
      }).sort((a, b) => a.position - b.position || a.door.id.localeCompare(b.door.id));
      if (doors.length) text += ` Pass through ${doors.map(({ door }) => door.name).join(', then ')}.`;
    }
    instructions.push({ text, floor, distance: segment.startDistance, time: segment.startTime, point: segment.from, kind: segment.kind });
  });
  instructions.push({ text: `Arrive at ${landmark(layout, destination)}.`, floor: floorAt(layout.world, destination), distance: totalDistance,
    time, point: destination, kind: 'arrive' });
  return { segments, points: [origin, ...segments.filter((segment) => segment.distance > 0).map((segment) => segment.to)],
    distance: totalDistance, duration: time, cost: result.cost, instructions, origin, destination };
}
export function poseAtTime(route: Route, value: number): Pose {
  if (!Number.isFinite(value)) throw new LayoutError('Walk time must be finite.');
  const time = clamp(value, 0, route.duration);
  const index = route.segments.findIndex((segment) => time < segment.startTime + segment.duration - 1e-9);
  if (index < 0) return { point: route.destination, direction: { x: 0, y: 0, z: -1 }, time, distance: route.distance, kind: 'arrive', segment: route.segments.length };
  const segment = route.segments[index], fraction = segment.duration ? (time - segment.startTime) / segment.duration : 1;
  const movement = segment.distance ? segment : route.segments.slice(index + 1).find((item) => item.distance > 0);
  const direction = movement ? { x: (movement.to.x - movement.from.x) / movement.distance,
    y: (movement.to.y - movement.from.y) / movement.distance, z: (movement.to.z - movement.from.z) / movement.distance } : { x: 0, y: 0, z: -1 };
  return { point: interpolate(segment.from, segment.to, fraction), direction, time,
    distance: segment.startDistance + fraction * segment.distance, kind: segment.kind, segment: index };
}
export function timeAtDistance(route: Route, value: number): number {
  if (!Number.isFinite(value)) throw new LayoutError('Walk distance must be finite.');
  const wanted = clamp(value, 0, route.distance);
  if (wanted === route.distance) return route.duration;
  for (const segment of route.segments) {
    if (segment.distance > 0 && wanted <= segment.startDistance + segment.distance) {
      return segment.startTime + (wanted - segment.startDistance) / segment.distance * segment.duration;
    }
  }
  return route.duration;
}
