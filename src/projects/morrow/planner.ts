import { JOINTS, MorrowError, copyJoints, interpolate, jointDistance, randomSource } from './arm';
import type { Joints } from './arm';
import { checkEdge, clearance } from './collision';
import type { CollisionWorld } from './collision';

export interface PlanResult {
  found: boolean;
  path: Joints[];
  iterations: number;
  nodes: number;
  edgeChecks: number;
  reason: string;
}
export interface PlanOptions { seed?: number; iterations?: number; nodes?: number }
interface Node { q: Joints; parent: number }
export const PLAN_LIMITS = { iterations: 900, nodes: 1800, extension: .28, edges: 6000 };

export function* planSteps(start: Joints, goal: Joints, world: CollisionWorld, options: PlanOptions = {}): Generator<void, PlanResult> {
  const maxIterations = Math.max(1, Math.min(PLAN_LIMITS.iterations, Math.floor(options.iterations ?? PLAN_LIMITS.iterations)));
  const maxNodes = Math.max(2, Math.min(PLAN_LIMITS.nodes, Math.floor(options.nodes ?? PLAN_LIMITS.nodes)));
  let iterations = 0, nodes = 2, edgeChecks = 0;
  const finish = (path: Joints[], reason: string): PlanResult => ({ found: path.length > 0, path, iterations, nodes, edgeChecks, reason });
  for (const [label, q] of [['Start', start], ['Goal', goal]] as const) {
    const result = clearance(q, world);
    if (!result.safe) return finish([], `${label} violates the 12 mm collision margin: ${result.pair}.`);
  }
  const edge = (a: Joints, b: Joints) => { edgeChecks++; return checkEdge(a, b, world).certified; };
  if (edge(start, goal)) return finish([copyJoints(start), copyJoints(goal)], 'Direct joint-space edge certified with swept bounds.');
  yield;
  const random = randomSource(options.seed ?? 68);
  let a: Node[] = [{ q: copyJoints(start), parent: -1 }], b: Node[] = [{ q: copyJoints(goal), parent: -1 }];
  let swapped = false;
  function extend(tree: Node[], target: Joints): number {
    let nearest = 0, distance = Infinity;
    tree.forEach((node, i) => {
      const d = jointDistance(node.q, target);
      if (d < distance) { nearest = i; distance = d; }
    });
    if (distance < 1e-8) return nearest;
    const q = interpolate(tree[nearest].q, target, Math.min(1, PLAN_LIMITS.extension / distance));
    if (!edge(tree[nearest].q, q)) return -1;
    tree.push({ q, parent: nearest }); nodes++;
    return tree.length - 1;
  }
  function trace(tree: Node[], index: number): Joints[] {
    const path: Joints[] = [];
    while (index >= 0) { path.push(copyJoints(tree[index].q)); index = tree[index].parent; }
    return path.reverse();
  }
  for (; iterations < maxIterations && nodes < maxNodes && edgeChecks < PLAN_LIMITS.edges; iterations++) {
    const target = random() < .18 ? b[0].q : JOINTS.map(j => j.min + random() * (j.max - j.min)) as Joints;
    const next = extend(a, target);
    yield;
    if (next >= 0) {
      for (let connect = 0; connect < 32 && nodes < maxNodes && edgeChecks < PLAN_LIMITS.edges; connect++) {
        const other = extend(b, a[next].q);
        yield;
        if (other < 0) break;
        if (jointDistance(b[other].q, a[next].q) < 1e-8) {
          let path = [...trace(a, next), ...trace(b, other).reverse().slice(1)];
          if (swapped) path.reverse();
          // Deterministic shortcuts are subjected to the same swept certification.
          for (let pass = 0; pass < 28 && path.length > 2 && edgeChecks < PLAN_LIMITS.edges; pass++) {
            const first = Math.floor(random() * (path.length - 2));
            const last = first + 2 + Math.floor(random() * (path.length - first - 2));
            if (edge(path[first], path[last])) path = [...path.slice(0, first + 1), ...path.slice(last)];
            yield;
          }
          return finish(path, 'Seeded RRT-connect path found; every retained edge has a swept-clearance certificate.');
        }
      }
    }
    [a, b] = [b, a]; swapped = !swapped;
  }
  return finish([], 'No path found within the bounded search budget. This is not proof of impossibility. Try a waypoint or another seed.');
}
export function plan(start: Joints, goal: Joints, world: CollisionWorld, options: PlanOptions = {}): PlanResult {
  const generator = planSteps(start, goal, world, options);
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}

export interface Trajectory { path: Joints[]; times: number[]; duration: number }
export function timePath(path: Joints[]): Trajectory {
  if (path.length < 2 || path.length > 1800) throw new MorrowError('A trajectory needs 2 to 1,800 certified joint states.');
  const times = [0];
  for (let i = 1; i < path.length; i++) {
    // Cubic smoothstep reaches 1.5 times the mean speed and stops at each node.
    const duration = Math.max(.12, ...path[i].map((v, j) => 1.5 * Math.abs(v - path[i - 1][j]) / JOINTS[j].speed));
    interpolate(path[i - 1], path[i], .5);
    times.push(times[i - 1] + duration);
  }
  return { path: path.map(copyJoints), times, duration: times[times.length - 1] };
}
export function sampleTrajectory(trajectory: Trajectory, time: number): Joints {
  if (!Number.isFinite(time)) throw new MorrowError('Timeline time must be finite.');
  const t = Math.max(0, Math.min(trajectory.duration, time));
  let index = 1;
  while (index < trajectory.times.length - 1 && trajectory.times[index] < t) index++;
  const u = (t - trajectory.times[index - 1]) / (trajectory.times[index] - trajectory.times[index - 1]);
  return interpolate(trajectory.path[index - 1], trajectory.path[index], u * u * (3 - 2 * u));
}
