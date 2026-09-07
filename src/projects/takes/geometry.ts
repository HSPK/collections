import type { Actor, Camera, Vec3, World } from './data';

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => { const d = Math.hypot(a.x, a.y, a.z); return { x: a.x / d, y: a.y / d, z: a.z / d }; };
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export interface Part { shape: 'box' | 'sphere' | 'cylinder'; at: Vec3; size: Vec3; color: string; tilt?: number }
const part = (shape: Part['shape'], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt = 0): Part =>
  ({ shape, at: { x, y, z }, size: { x: sx, y: sy, z: sz }, color, tilt });

// These same primitive dimensions drive the handmade meshes and their conservative bounds.
export function actorParts(actor: Actor): Part[] {
  const coat = actor.id === 'mica' ? '#d8a54e' : '#7eaaa0';
  const arm = actor.pose === 'cheer' ? 2.5 : actor.pose === 'point' ? 1.35 : actor.pose === 'present' ? 0.9 : 0.12;
  return [
    part('box', -.2, .10, .13, .27, .18, .48, '#211e25'), part('box', .2, .10, .13, .27, .18, .48, '#211e25'),
    part('cylinder', -.19, .46, 0, .19, .68, .19, '#34323b'), part('cylinder', .19, .46, 0, .19, .68, .19, '#34323b'),
    part('cylinder', 0, 1.13, 0, .69, .94, .49, coat),
    part('box', 0, 1.45, .27, .16, .28, .045, '#efe0bb'),
    part('sphere', 0, 1.85, 0, .58, .62, .54, '#e8c49d'),
    part('sphere', 0, 1.8, .29, .12, .13, .14, '#c98f70'),
    part('sphere', -.12, 1.93, .249, .055, .065, .045, '#201f29'),
    part('sphere', .12, 1.93, .249, .055, .065, .045, '#201f29'),
    part('cylinder', 0, 2.14, 0, actor.id === 'mica' ? .76 : .61, .12, .61, actor.id === 'mica' ? '#68232e' : '#e9d9b6'),
    part('sphere', actor.id === 'mica' ? -.1 : 0, 2.24, 0, .42, .19, .42, actor.id === 'mica' ? '#68232e' : '#e9d9b6'),
    part('cylinder', -.47, actor.pose === 'cheer' ? 1.65 : 1.24, 0, .17, .72, .17, coat, -arm),
    part('cylinder', .47, actor.pose === 'cheer' ? 1.65 : 1.24, 0, .17, .72, .17, coat, arm),
    part('sphere', -.47 - Math.sin(arm) * .35, (actor.pose === 'cheer' ? 1.65 : 1.24) - Math.cos(arm) * .35, .01, .20, .20, .20, '#e8c49d'),
    part('sphere', .47 + Math.sin(arm) * .35, (actor.pose === 'cheer' ? 1.65 : 1.24) - Math.cos(arm) * .35, .01, .20, .20, .20, '#e8c49d'),
  ];
}
export function actorYaw(actor: Actor, world: World): number {
  if (actor.attention === 'audience') return 0;
  const here = world.marks[actor.mark];
  const other = world.actors.find(item => item.id !== actor.id)!;
  const there = actor.attention === 'prop' ? world.prop : world.marks[other.mark];
  // Three-quarter staging keeps expressive faces visible while turning toward the attention target.
  return Math.atan2(there.x - here.x, there.z - here.z) * .55;
}
export function actorPoints(actor: Actor, world: World): Vec3[] {
  const yaw = actorYaw(actor, world), c = Math.cos(yaw), s = Math.sin(yaw);
  const origin = world.marks[actor.mark];
  return actorParts(actor).flatMap(p => {
    const points: Vec3[] = [], t = p.tilt ?? 0;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      const px = p.at.x + x * p.size.x * Math.cos(t) - y * p.size.y * Math.sin(t);
      const py = p.at.y + x * p.size.x * Math.sin(t) + y * p.size.y * Math.cos(t);
      const pz = p.at.z + z * p.size.z;
      points.push(add(origin, { x: px * c + pz * s, y: py, z: -px * s + pz * c }));
    }
    return points;
  });
}
export function cameraFrame(camera: Camera, world: World) {
  const points = world.actors.filter(a => camera.focus === 'both' || a.id === camera.focus).map(a => world.marks[a.mark]);
  const target = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: camera.height, z: points.reduce((sum, p) => sum + p.z, 0) / points.length };
  const position = {
    x: camera.rail + (camera.rig === 'left' ? -7 : camera.rig === 'right' ? 7 : 0),
    y: 2.5,
    z: camera.rig === 'reverse' ? -camera.distance : camera.distance,
  };
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  return { position, target, forward, right, up: cross(right, forward), tangent: 12 / camera.lens };
}
export interface Projection { x: number; y: number; depth: number }
export function project(point: Vec3, camera: Camera, world: World): Projection {
  const f = cameraFrame(camera, world), v = sub(point, f.position), depth = dot(v, f.forward);
  return { x: .5 + dot(v, f.right) / (2 * depth * f.tangent * 16 / 9), y: .5 - dot(v, f.up) / (2 * depth * f.tangent), depth };
}
export interface Bounds { min: Vec3; max: Vec3 }
export function propBounds(world: World): Bounds {
  return { min: add(world.prop, { x: -.64, y: .16, z: -.38 }), max: add(world.prop, { x: .64, y: 2.6, z: .53 }) };
}
export const stageObstacles: Bounds[] = [
  { min: { x: -5.95, y: 0, z: -4.1 }, max: { x: 5.95, y: 3.95, z: -3.55 } },
  { min: { x: -5.95, y: 0, z: -4 }, max: { x: -5.4, y: 4.4, z: 4 } },
  { min: { x: 5.4, y: 0, z: -4 }, max: { x: 5.95, y: 4.4, z: 4 } },
];
export function actorBounds(actor: Actor, world: World): Bounds {
  const points = actorPoints(actor, world);
  return {
    min: { x: Math.min(...points.map(p => p.x)), y: 0, z: Math.min(...points.map(p => p.z)) },
    max: { x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)), z: Math.max(...points.map(p => p.z)) },
  };
}
export function intersectsSegment(from: Vec3, to: Vec3, box: Bounds): boolean {
  let near = .001, far = .999;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = to[axis] - from[axis];
    if (Math.abs(d) < 1e-8) { if (from[axis] < box.min[axis] || from[axis] > box.max[axis]) return false; }
    else {
      const a = (box.min[axis] - from[axis]) / d, b = (box.max[axis] - from[axis]) / d;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}
export function coverage(actor: Actor, camera: Camera, world: World) {
  const points = actorPoints(actor, world).map(p => project(p, camera, world));
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  const origin = world.marks[actor.mark], f = cameraFrame(camera, world);
  const obstacles = [...stageObstacles, propBounds(world), ...world.actors.filter(a => a.id !== actor.id).map(a => actorBounds(a, world))];
  let visible = 0;
  for (const x of [-.2, 0, .2]) for (const y of [.6, 1.3, 1.95]) {
    const sample = add(origin, { x, y, z: 0 });
    if (!obstacles.some(box => intersectsSegment(f.position, sample, box))) visible++;
  }
  return { left, right, top, bottom, height: bottom - top, visible, samples: 9,
    inside: points.every(p => p.depth > .1) && left >= .04 && right <= .96 && top >= .04 && bottom <= .96 };
}
export function screenDirection(camera: Camera, world: World): number {
  const [a, b] = world.actors.map(actor => project(add(world.marks[actor.mark], { x: 0, y: 1.2, z: 0 }), camera, world));
  return Math.sign(b.x - a.x);
}
