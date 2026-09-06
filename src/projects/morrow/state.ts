import { Quaternion, Vector3 } from 'three';
import { HOME, MorrowError, clonePose, copyJoints, degrees, forward, rotationError, validJoints } from './arm';
import type { Joints, Pose } from './arm';
import { clearance, partPose, staticPartClearance } from './collision';
import type { BoxObstacle, CollisionWorld, Part } from './collision';
import type { Trajectory } from './planner';

export const PICK = degrees([-35, 28, -75, 0, 47, 0]);
export const PLACE = degrees([35, 43, -80, 0, 37, 0]);
const box = (id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number): BoxObstacle =>
  ({ id, center: new Vector3(x, y, z), half: new Vector3(hx, hy, hz) });
export interface Preset {
  id: string; name: string; title: string; description: string;
  start: Joints; target: Joints; obstacles: BoxObstacle[];
}
export const PRESETS: readonly Preset[] = [
  { id: 'transfer', name: '01 / Transfer a coupon', title: 'A small part. A considered path.',
    description: 'Reach the source, grip the coupon, then carry it to the receiver. Nothing attaches at a distance.',
    start: HOME, target: PICK, obstacles: [box('Central baffle', .73, .18, 0, .07, .18, .17)] },
  { id: 'inspection', name: '02 / Orient for inspection', title: 'Position is only half the pose.',
    description: 'Present the tool to an oblique inspection frame. All three orientation components matter.',
    start: HOME, target: degrees([48, 63, -88, 55, 64, -65]),
    obstacles: [box('Inspection column', -.42, .35, -.48, .11, .35, .11)] },
  { id: 'detour', name: '03 / Around the partition', title: 'The shortest move is not always clear.',
    description: 'A tall divider interrupts the direct sweep. Search joint space, or add a high waypoint.',
    start: PICK, target: PLACE, obstacles: [box('Tall partition', .84, .34, 0, .09, .34, .16)] },
];
export interface ProjectState {
  preset: string;
  joints: Joints;
  target: Pose;
  waypoints: Pose[];
  part: Part;
  attachment: Pose | null;
  seed: number;
}
export const destination = forward(PLACE).tool;
export const source = forward(PICK).tool;
export function presetById(id: string): Preset {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) throw new MorrowError('Unknown workcell preset.');
  return preset;
}
export function createState(id = 'transfer'): ProjectState {
  const preset = presetById(id);
  return { preset: id, joints: copyJoints(preset.start), target: clonePose(forward(preset.target).tool),
    waypoints: [], part: { pose: clonePose(source), radius: .046 }, attachment: null, seed: 68 };
}
export function worldFor(state: ProjectState): CollisionWorld {
  const fixture = (id: string, p: Vector3) => box(id, p.x, (p.y - .072) / 2, p.z, .082, (p.y - .072) / 2, .082);
  return { obstacles: [...presetById(state.preset).obstacles,
    fixture('Source fixture', source.position), fixture('Receiver fixture', destination.position)],
    part: state.part, attachment: state.attachment };
}
export function cloneState(state: ProjectState): ProjectState {
  return { ...state, joints: copyJoints(state.joints), target: clonePose(state.target),
    waypoints: state.waypoints.map(clonePose), part: { radius: state.part.radius, pose: clonePose(state.part.pose) },
    attachment: state.attachment && clonePose(state.attachment) };
}
export function inDestination(pose: Pose): boolean {
  const delta = pose.position.clone().sub(destination.position).applyQuaternion(destination.orientation.clone().invert());
  return Math.abs(delta.x) <= .06 && Math.abs(delta.y) <= .045 && Math.abs(delta.z) <= .06 &&
    rotationError(destination.orientation, pose.orientation).length() <= .2;
}
export function taskComplete(state: ProjectState): boolean {
  return state.attachment === null && inDestination(state.part.pose) &&
    staticPartClearance(state.part, worldFor(state).obstacles).safe;
}
export function grip(state: ProjectState): ProjectState {
  if (state.attachment) throw new MorrowError('The gripper already holds the coupon.');
  if (!clearance(state.joints, worldFor(state)).safe) throw new MorrowError('Gripping is blocked in a colliding state.');
  const tool = forward(state.joints).tool;
  if (tool.position.distanceTo(state.part.pose.position) > .025)
    throw new MorrowError('Move the tool within 25 mm of the coupon before gripping. No remote grasp.');
  if (rotationError(tool.orientation, state.part.pose.orientation).length() > .2)
    throw new MorrowError('Align the gripper within 11.5 degrees of the coupon frame before gripping.');
  const inverse = tool.orientation.clone().conjugate();
  const result = cloneState(state);
  result.attachment = { position: state.part.pose.position.clone().sub(tool.position).applyQuaternion(inverse),
    orientation: inverse.clone().multiply(state.part.pose.orientation) };
  const c = clearance(result.joints, worldFor(result));
  if (!c.safe) throw new MorrowError(`Payload would violate the collision margin: ${c.pair}.`);
  return result;
}
export function release(state: ProjectState): ProjectState {
  if (!state.attachment) throw new MorrowError('There is no payload to release.');
  const world = worldFor(state), pose = partPose(state.joints, world);
  if (!inDestination(pose)) throw new MorrowError('Release only inside the receiver frame, with the coupon aligned. Carry it there first.');
  const c = staticPartClearance({ pose, radius: state.part.radius }, world.obstacles);
  if (!c.safe) throw new MorrowError(`Release would violate the collision margin: ${c.pair}.`);
  return { ...cloneState(state), part: { pose: clonePose(pose), radius: state.part.radius }, attachment: null };
}

export class History {
  private past: ProjectState[] = [];
  private future: ProjectState[] = [];
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  remember(state: ProjectState) {
    this.past.push(cloneState(state));
    if (this.past.length > 24) this.past.shift();
    this.future = [];
  }
  undo(current: ProjectState): ProjectState {
    const previous = this.past.pop();
    if (!previous) throw new MorrowError('No earlier edit to restore.');
    this.future.push(cloneState(current));
    return previous;
  }
  redo(current: ProjectState): ProjectState {
    const next = this.future.pop();
    if (!next) throw new MorrowError('No later edit to restore.');
    this.past.push(cloneState(current));
    return next;
  }
}
export class Generation {
  private controller = new AbortController();
  private serial = 0;
  next() {
    this.controller.abort();
    this.controller = new AbortController();
    this.serial++;
    return { id: this.serial, signal: this.controller.signal };
  }
  current(id: number) { return id === this.serial && !this.controller.signal.aborted; }
  stop() { this.controller.abort(); this.serial++; }
}

interface StoredPose { position: [number, number, number]; orientation: [number, number, number, number] }
interface StoredProject {
  kind: 'morrow-project'; version: 1; preset: string; joints: Joints;
  target: StoredPose; waypoints: StoredPose[]; part: StoredPose; attachment: StoredPose | null; seed: number;
}
const storePose = (pose: Pose): StoredPose => ({
  position: [pose.position.x, pose.position.y, pose.position.z],
  orientation: [pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w],
});
const restorePose = (pose: StoredPose): Pose => ({
  position: new Vector3(...pose.position), orientation: new Quaternion(...pose.orientation).normalize(),
});
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function numbers(value: unknown, count: number): value is number[] {
  return Array.isArray(value) && value.length === count && value.every(v => typeof v === 'number' && Number.isFinite(v));
}
function storedPose(value: unknown): value is StoredPose {
  return record(value) && numbers(value.position, 3) && Math.hypot(...value.position) <= 5 &&
    numbers(value.orientation, 4) && Math.abs(Math.hypot(...value.orientation) - 1) < .00001;
}
function storedProject(value: unknown): value is StoredProject {
  return record(value) && value.kind === 'morrow-project' && value.version === 1 &&
    typeof value.preset === 'string' && PRESETS.some(p => p.id === value.preset) &&
    numbers(value.joints, 6) && validJoints(value.joints) && storedPose(value.target) &&
    Array.isArray(value.waypoints) && value.waypoints.length <= 6 && value.waypoints.every(storedPose) &&
    storedPose(value.part) && (value.attachment === null || storedPose(value.attachment)) &&
    typeof value.seed === 'number' && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 999999;
}
export function serialize(state: ProjectState): string {
  const project: StoredProject = { kind: 'morrow-project', version: 1, preset: state.preset,
    joints: copyJoints(state.joints), target: storePose(state.target), waypoints: state.waypoints.map(storePose),
    part: storePose(partPose(state.joints, worldFor(state))), attachment: state.attachment && storePose(state.attachment), seed: state.seed };
  return JSON.stringify(project, null, 2);
}
export function deserialize(text: string): ProjectState {
  if (text.length > 32000) throw new MorrowError('Project exceeds the 32 KB import limit.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new MorrowError('This file is not valid JSON.');
  }
  if (!storedProject(value)) throw new MorrowError('Invalid project: use version 1, six limited joints, unit quaternions and at most six waypoints.');
  const state: ProjectState = { preset: value.preset, joints: copyJoints(value.joints), target: restorePose(value.target),
    waypoints: value.waypoints.map(restorePose), part: { pose: restorePose(value.part), radius: .046 },
    attachment: value.attachment && restorePose(value.attachment), seed: value.seed };
  if (state.attachment && (state.attachment.position.length() > .025 ||
    rotationError(state.attachment.orientation, new Quaternion()).length() > .2))
    throw new MorrowError('Imported payload attachment is outside the gripper contact envelope.');
  const c = clearance(state.joints, worldFor(state));
  if (!c.safe) throw new MorrowError(`Imported workcell state violates the collision margin: ${c.pair}.`);
  return state;
}
export function exportProgram(trajectory: Trajectory, state: ProjectState): string {
  return JSON.stringify({ kind: 'morrow-inspection-program', version: 1,
    warning: 'SIMULATION ONLY. Not commands for physical hardware. No hardware interface.',
    units: { position: 'metres', joints: 'radians', time: 'seconds' }, world: 'right-handed Y-up',
    interpolation: 'per-edge cubic smoothstep; zero velocity at nodes; speed limited, not acceleration certified',
    marginMetres: .012, payload: Boolean(state.attachment), seed: state.seed,
    scene: JSON.parse(serialize(state)),
    nodes: trajectory.path.map((q, i) => ({ seconds: trajectory.times[i], joints: q, tool: storePose(forward(q).tool) })),
  }, null, 2);
}
