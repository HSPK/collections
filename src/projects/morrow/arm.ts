import { Euler, Quaternion, Vector3 } from 'three';

export type Joints = [number, number, number, number, number, number];
export interface Pose { position: Vector3; orientation: Quaternion }
export interface Joint {
  name: string;
  axis: Vector3;
  offset: Vector3;
  min: number;
  max: number;
  speed: number;
}
export const RAD = Math.PI / 180;
export const JOINTS: readonly Joint[] = [
  { name: 'Base', axis: new Vector3(0, 1, 0), offset: new Vector3(0, .24, 0), min: -165 * RAD, max: 165 * RAD, speed: 45 * RAD },
  { name: 'Shoulder', axis: new Vector3(0, 0, 1), offset: new Vector3(0, .18, 0), min: -65 * RAD, max: 145 * RAD, speed: 35 * RAD },
  { name: 'Elbow', axis: new Vector3(0, 0, 1), offset: new Vector3(.42, 0, 0), min: -150 * RAD, max: 145 * RAD, speed: 45 * RAD },
  { name: 'Forearm roll', axis: new Vector3(1, 0, 0), offset: new Vector3(.36, 0, 0), min: -175 * RAD, max: 175 * RAD, speed: 70 * RAD },
  { name: 'Wrist pitch', axis: new Vector3(0, 0, 1), offset: new Vector3(.12, 0, 0), min: -105 * RAD, max: 105 * RAD, speed: 60 * RAD },
  { name: 'Tool roll', axis: new Vector3(1, 0, 0), offset: new Vector3(.12, 0, 0), min: -175 * RAD, max: 175 * RAD, speed: 90 * RAD },
];
export const TOOL_OFFSET = new Vector3(.14, 0, 0);
export const HOME = degrees([-22, 57, -92, 18, 52, -18]);
export const POSITION_TOLERANCE = .0015;
export const ANGLE_TOLERANCE = .012;

export class MorrowError extends Error {}
export function degrees(values: Joints): Joints { return values.map(v => v * RAD) as Joints; }
export function copyJoints(values: Joints): Joints { return [...values]; }
export function validJoints(values: number[]): values is Joints {
  return values.length === 6 && values.every((v, i) =>
    Number.isFinite(v) && v >= JOINTS[i].min - 1e-10 && v <= JOINTS[i].max + 1e-10);
}
export function assertJoints(q: Joints): void {
  if (!validJoints(q)) throw new MorrowError('Six finite joint angles inside the mechanical limits are required.');
}
export function clonePose(pose: Pose): Pose {
  return { position: pose.position.clone(), orientation: pose.orientation.clone() };
}
export function validPose(pose: Pose): boolean {
  return [...pose.position.toArray(), ...pose.orientation.toArray()].every(Number.isFinite) &&
    pose.position.length() <= 5 && Math.abs(pose.orientation.length() - 1) < 1e-6;
}
export function poseFromEuler(x: number, y: number, z: number, rx: number, ry: number, rz: number): Pose {
  const pose = { position: new Vector3(x, y, z),
    orientation: new Quaternion().setFromEuler(new Euler(rx * RAD, ry * RAD, rz * RAD, 'XYZ')) };
  if (!validPose(pose)) throw new MorrowError('Use finite coordinates within 5 m and finite XYZ angles.');
  return pose;
}
export function eulerDegrees(pose: Pose): number[] {
  const e = new Euler().setFromQuaternion(pose.orientation, 'XYZ');
  return [e.x / RAD, e.y / RAD, e.z / RAD];
}

export interface Kinematics { frames: Pose[]; origins: Vector3[]; axes: Vector3[]; tool: Pose }
export function forward(q: Joints): Kinematics {
  assertJoints(q);
  const position = new Vector3();
  const orientation = new Quaternion();
  const frames: Pose[] = [], origins: Vector3[] = [], axes: Vector3[] = [];
  JOINTS.forEach((joint, i) => {
    position.add(joint.offset.clone().applyQuaternion(orientation));
    origins.push(position.clone());
    axes.push(joint.axis.clone().applyQuaternion(orientation));
    orientation.multiply(new Quaternion().setFromAxisAngle(joint.axis, q[i])).normalize();
    frames.push({ position: position.clone(), orientation: orientation.clone() });
  });
  return { frames, origins, axes, tool: {
    position: position.clone().add(TOOL_OFFSET.clone().applyQuaternion(orientation)),
    orientation: orientation.clone(),
  } };
}

// World-frame SO(3) logarithm: q and -q represent the same rotation.
export function rotationError(target: Quaternion, current: Quaternion): Vector3 {
  const delta = target.clone().multiply(current.clone().conjugate()).normalize();
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const v = new Vector3(delta.x, delta.y, delta.z);
  const sine = v.length();
  return sine < 1e-10 ? v.multiplyScalar(2) : v.multiplyScalar(2 * Math.atan2(sine, delta.w) / sine);
}
export function residual(target: Pose, current: Pose) {
  const position = target.position.clone().sub(current.position);
  const orientation = rotationError(target.orientation, current.orientation);
  return { position, orientation, positionError: position.length(), angleError: orientation.length() };
}
export function jacobian(q: Joints): number[][] {
  const fk = forward(q);
  const rows = Array.from({ length: 6 }, () => Array<number>(6).fill(0));
  fk.axes.forEach((axis, i) => {
    const linear = axis.clone().cross(fk.tool.position.clone().sub(fk.origins[i]));
    [linear.x, linear.y, linear.z, axis.x, axis.y, axis.z].forEach((v, r) => { rows[r][i] = v; });
  });
  return rows;
}
export function interpolate(a: Joints, b: Joints, fraction: number): Joints {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new MorrowError('Interpolation must be inside [0, 1].');
  assertJoints(a); assertJoints(b);
  return a.map((v, i) => v + (b[i] - v) * fraction) as Joints;
}
export function jointDistance(a: Joints, b: Joints): number {
  return Math.hypot(...a.map((v, i) => v - b[i]));
}
export function randomSource(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function linearSolve(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let i = 0; i < 6; i++) {
    let pivot = i;
    for (let j = i + 1; j < 6; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    if (Math.abs(rows[i][i]) < 1e-14) throw new MorrowError('Damped system lost numerical rank.');
    const divisor = rows[i][i];
    for (let j = i; j <= 6; j++) rows[i][j] /= divisor;
    for (let k = 0; k < 6; k++) {
      if (k === i) continue;
      const factor = rows[k][i];
      for (let j = i; j <= 6; j++) rows[k][j] -= factor * rows[i][j];
    }
  }
  return rows.map(row => row[6]);
}
export interface IKResult {
  joints: Joints;
  converged: boolean;
  positionError: number;
  angleError: number;
  iterations: number;
  reason: string;
}
export interface IKOptions { iterations?: number; restarts?: number; seed?: number }

export function* inverseSteps(target: Pose, initial: Joints, options: IKOptions = {}): Generator<void, IKResult> {
  assertJoints(initial);
  if (!validPose(target)) throw new MorrowError('Invalid target pose.');
  const maxIterations = Math.max(1, Math.min(240, Math.floor(options.iterations ?? 160)));
  const restarts = Math.max(1, Math.min(6, Math.floor(options.restarts ?? 4)));
  const random = randomSource(options.seed ?? 68);
  let best = copyJoints(initial), bestScore = Infinity, iterations = 0;
  const weight = .35;
  const score = (q: Joints) => {
    const r = residual(target, forward(q).tool);
    return r.positionError ** 2 + (weight * r.angleError) ** 2;
  };
  for (let restart = 0; restart < restarts; restart++) {
    let q: Joints = restart === 0 ? copyJoints(initial) :
      JOINTS.map(j => j.min + random() * (j.max - j.min)) as Joints;
    for (let n = 0; n < maxIterations; n++) {
      iterations++;
      const r = residual(target, forward(q).tool);
      const currentScore = r.positionError ** 2 + (r.angleError * weight) ** 2;
      if (currentScore < bestScore) { best = copyJoints(q); bestScore = currentScore; }
      if (r.positionError <= POSITION_TOLERANCE && r.angleError <= ANGLE_TOLERANCE) {
        return { joints: q, converged: true, positionError: r.positionError, angleError: r.angleError,
          iterations, reason: 'Position and orientation tolerances met. Collision and motion still require validation.' };
      }
      const j = jacobian(q).map((row, index) => row.map(v => v * (index >= 3 ? weight : 1)));
      const error = [...r.position.toArray(), ...r.orientation.multiplyScalar(weight).toArray()];
      const damping = .025 + Math.min(.08, Math.sqrt(currentScore) * .06);
      const normal = j.map((row, a) => j.map((other, b) =>
        row.reduce((sum, v, k) => sum + v * other[k], 0) + (a === b ? damping ** 2 : 0)));
      const solved = linearSolve(normal, error);
      const delta = q.map((_, k) => j.reduce((sum, row, i) => sum + row[k] * solved[i], 0));
      const scale = Math.min(1, .18 / Math.max(...delta.map(Math.abs), 1e-10));
      let improved = false;
      for (let step = 0; step < 7; step++) {
        const candidate = q.map((v, i) => Math.max(JOINTS[i].min, Math.min(JOINTS[i].max,
          v + delta[i] * scale * 2 ** -step))) as Joints;
        if (score(candidate) < currentScore - 1e-14) { q = candidate; improved = true; break; }
      }
      yield;
      if (!improved) break;
    }
  }
  const r = residual(target, forward(best).tool);
  return { joints: best, converged: false, positionError: r.positionError, angleError: r.angleError, iterations,
    reason: 'No converged IK solution within the iteration/restart budget. Adjust the pose or try another seed posture.' };
}
export function inverse(target: Pose, initial: Joints, options: IKOptions = {}): IKResult {
  const steps = inverseSteps(target, initial, options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export async function consume<T>(steps: Generator<void, T>, signal: AbortSignal, chunk = 8): Promise<T> {
  while (true) {
    signal.throwIfAborted();
    const start = performance.now();
    for (let i = 0; i < chunk; i++) {
      const result = steps.next();
      if (result.done) { signal.throwIfAborted(); return result.value; }
      if (performance.now() - start > 10) break;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}
