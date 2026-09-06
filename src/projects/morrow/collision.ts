import { Vector3 } from 'three';
import { forward, interpolate } from './arm';
import type { Joints, Pose } from './arm';

export interface BoxObstacle { id: string; center: Vector3; half: Vector3 }
export interface Part { pose: Pose; radius: number }
export interface CollisionWorld { obstacles: BoxObstacle[]; part: Part; attachment: Pose | null }
export interface Capsule { a: Vector3; b: Vector3; radius: number; name: string }
export interface Clearance { safe: boolean; clearance: number; pair: string }
export const MARGIN = .012;
export const LINK_RADII = [.095, .067, .055, .046, .042, .039];
const PEDESTAL: Capsule = { a: new Vector3(0, .08, 0), b: new Vector3(0, .16, 0), radius: .14, name: 'Pedestal' };
// Upper bounds for the displacement radius of every affected point, including payload.
export const SWEEP_RADII = [1.6, 1.4, .98, .62, .5, .3];

export function capsules(q: Joints): Capsule[] {
  const fk = forward(q);
  const points = [...fk.origins, fk.tool.position];
  return LINK_RADII.map((radius, i) => ({ a: points[i], b: points[i + 1], radius, name: `Link ${i + 1}` }));
}
export function attachedPose(tool: Pose, local: Pose): Pose {
  return { position: local.position.clone().applyQuaternion(tool.orientation).add(tool.position),
    orientation: tool.orientation.clone().multiply(local.orientation).normalize() };
}
export function partPose(q: Joints, world: CollisionWorld): Pose {
  return world.attachment ? attachedPose(forward(q).tool, world.attachment) : world.part.pose;
}

export function segmentDistance(a: Vector3, b: Vector3, c: Vector3, d: Vector3): number {
  const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
  const aa = u.dot(u), bb = u.dot(v), cc = v.dot(v), dd = u.dot(w), ee = v.dot(w);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (aa < 1e-16 && cc < 1e-16) return a.distanceTo(c);
  let s = aa < 1e-16 ? 0 : cc < 1e-16 ? clamp(-dd / aa) :
    clamp((aa * cc - bb * bb) > 1e-16 ? (bb * ee - cc * dd) / (aa * cc - bb * bb) : 0);
  let t = cc < 1e-16 ? 0 : (bb * s + ee) / cc;
  if (t < 0) { t = 0; s = aa < 1e-16 ? 0 : clamp(-dd / aa); }
  else if (t > 1) { t = 1; s = aa < 1e-16 ? 0 : clamp((bb - dd) / aa); }
  return w.addScaledVector(u, s).addScaledVector(v, -t).length();
}

// Squared point-to-box distance is piecewise quadratic along a segment.
export function segmentBoxDistance(a: Vector3, b: Vector3, box: BoxObstacle): number {
  const start = a.clone().sub(box.center).toArray();
  const direction = b.clone().sub(a).toArray(), half = box.half.toArray();
  const cuts = [0, 1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-14) continue;
    for (const face of [-half[i], half[i]]) {
      const t = (face - start[i]) / direction[i];
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  const at = (t: number) => start.reduce((sum, value, i) =>
    sum + Math.max(0, Math.abs(value + direction[i] * t) - half[i]) ** 2, 0);
  let best = Math.min(at(0), at(1));
  for (let k = 1; k < cuts.length; k++) {
    const low = cuts[k - 1], high = cuts[k], mid = (low + high) / 2;
    let aa = 0, bb = 0;
    for (let i = 0; i < 3; i++) {
      const value = start[i] + direction[i] * mid;
      if (Math.abs(value) <= half[i]) continue;
      const offset = start[i] - Math.sign(value) * half[i];
      aa += direction[i] ** 2; bb += offset * direction[i];
    }
    best = Math.min(best, at(low), at(high), at(aa > 0 ? Math.max(low, Math.min(high, -bb / aa)) : mid));
  }
  return Math.sqrt(best);
}

export function staticPartClearance(part: Part, obstacles: readonly BoxObstacle[], label: 'Part' | 'Payload' = 'Part'): Clearance {
  const position = part.pose.position;
  let minimum = position.y - part.radius - MARGIN, pair = `${label} / work surface`;
  const check = (gap: number, name: string) => {
    if (gap - MARGIN < minimum) { minimum = gap - MARGIN; pair = name; }
  };
  check(segmentDistance(PEDESTAL.a, PEDESTAL.b, position, position) - PEDESTAL.radius - part.radius, `${label} / pedestal`);
  for (const obstacle of obstacles)
    check(segmentBoxDistance(position, position, obstacle) - part.radius, `${label} / ${obstacle.id}`);
  return { safe: minimum > 0, clearance: minimum, pair };
}

function movingClearance(q: Joints, world: CollisionWorld): Clearance {
  const links = capsules(q);
  let minimum = Infinity, pair = 'Clear';
  const check = (gap: number, label: string) => {
    if (gap - MARGIN < minimum) { minimum = gap - MARGIN; pair = label; }
  };
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    check(Math.min(link.a.y, link.b.y) - link.radius, `${link.name} / work surface`);
    for (const obstacle of world.obstacles)
      check(segmentBoxDistance(link.a, link.b, obstacle) - link.radius, `${link.name} / ${obstacle.id}`);
    if (i >= 2) check(segmentDistance(link.a, link.b, PEDESTAL.a, PEDESTAL.b) - link.radius - PEDESTAL.radius, `${link.name} / pedestal`);
    for (let j = i + 2; j < links.length; j++) {
      const other = links[j];
      check(segmentDistance(link.a, link.b, other.a, other.b) - link.radius - other.radius, `${link.name} / ${other.name}`);
    }
  }
  const part = partPose(q, world);
  // The open gripper is the only intentional contact pair with a loose part.
  for (let i = 0; i < links.length - 1; i++)
    check(segmentDistance(links[i].a, links[i].b, part.position, part.position) - links[i].radius - world.part.radius,
      `${world.attachment ? 'Payload' : 'Part'} / ${links[i].name}`);
  if (world.attachment) {
    const payload = staticPartClearance({ pose: part, radius: world.part.radius }, world.obstacles, 'Payload');
    if (payload.clearance < minimum) return payload;
  }
  return { safe: minimum > 0, clearance: minimum, pair };
}

export function clearance(q: Joints, world: CollisionWorld): Clearance {
  const moving = movingClearance(q, world);
  if (world.attachment) return moving;
  const stationary = staticPartClearance(world.part, world.obstacles);
  return stationary.clearance < moving.clearance ? stationary : moving;
}

export interface EdgeResult extends Clearance { samples: number; certified: boolean }
export function checkEdge(a: Joints, b: Joints, world: CollisionWorld, maxSamples = 2048): EdgeResult {
  // A loose part is stationary: validate it once, without spending moving-body sweep bounds on its gap.
  const stationary = world.attachment ? null : staticPartClearance(world.part, world.obstacles);
  if (stationary && !stationary.safe) return { ...stationary, samples: 0, certified: false };
  const stack: { a: Joints; b: Joints; depth: number }[] = [{ a, b, depth: 0 }];
  let samples = 0, minimum = stationary?.clearance ?? Infinity, pair = stationary?.pair ?? 'Clear';
  while (stack.length && samples < Math.min(2048, maxSamples)) {
    const interval = stack.pop()!;
    const mid = interpolate(interval.a, interval.b, .5);
    const result = movingClearance(mid, world);
    samples++;
    if (result.clearance < minimum) { minimum = result.clearance; pair = result.pair; }
    if (!result.safe) return { ...result, samples, certified: false };
    // Twice the maximum single-body displacement also bounds self-collision distance changes.
    const bound = interval.a.reduce((sum, v, i) => sum + SWEEP_RADII[i] * Math.abs(v - interval.b[i]), 0);
    if (result.clearance > bound + 1e-9) continue;
    if (interval.depth >= 12) return { safe: false, certified: false, clearance: minimum, pair: 'Swept-clearance resolution budget', samples };
    stack.push({ a: mid, b: interval.b, depth: interval.depth + 1 },
      { a: interval.a, b: mid, depth: interval.depth + 1 });
  }
  const certified = stack.length === 0;
  return { safe: certified, certified, clearance: minimum, pair: certified ? pair : 'Swept-clearance sample budget', samples };
}
