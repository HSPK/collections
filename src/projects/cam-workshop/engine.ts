import { LAWS, LIMITS } from './data';
import type { CamSettings, LawId, SegmentId, TimingInput } from './data';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export interface Timing extends TimingInput {
  low: number;
}

export type TimingValidation =
  | { ok: true; timing: Timing }
  | { ok: false; errors: string[]; fields: (keyof TimingInput)[] };

export interface LawSample {
  f: number;
  df: number;
  ddf: number;
}

export interface MotionSample {
  s: number;
  velocity: number;
  acceleration: number;
  segment: SegmentId;
}

export interface Segment {
  id: SegmentId;
  start: number;
  duration: number;
}

export interface MotionPoint extends MotionSample {
  angle: number;
}

export interface ProfilePoint {
  angle: number;
  x: number;
  y: number;
}

export function validateTiming(input: TimingInput): TimingValidation {
  const errors: string[] = [];
  const fields: (keyof TimingInput)[] = [];
  for (const [key, name, min, max] of [
    ['rise', 'Rise', 1, 359], ['high', 'High dwell', 0, 358], ['return', 'Return', 1, 359],
  ] as const) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      errors.push(`${name} must be a whole number from ${min}° to ${max}°.`);
      fields.push(key);
    }
  }
  const total = input.rise + input.high + input.return;
  if (fields.length === 0 && total > 360) {
    errors.push(`These intervals total ${total}° — ${total - 360}° too many. Reduce an interval; none have been changed for you.`);
    fields.push('rise', 'high', 'return');
  }
  return errors.length
    ? { ok: false, errors, fields }
    : { ok: true, timing: { ...input, low: 360 - total } };
}

export function assertSettings(settings: CamSettings): void {
  const validation = validateTiming(settings);
  if (!validation.ok) throw new RangeError(validation.errors.join(' '));
  if (!LAWS.some((law) => law.id === settings.law)) throw new RangeError('Unknown motion law.');
  for (const key of ['base', 'lift'] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] < LIMITS[key][0] || settings[key] > LIMITS[key][1]) {
      throw new RangeError(`${key} must be between ${LIMITS[key][0]} and ${LIMITS[key][1]} length units.`);
    }
  }
}

export function wrapDegrees(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('Angle must be finite.');
  return ((angle % 360) + 360) % 360;
}

export function normalizedLaw(law: LawId, u: number): LawSample {
  if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError('Ramp coordinate u must be in [0, 1].');
  const endpoint = u === 0 || u === 1;
  switch (law) {
    case 'harmonic':
      return {
        f: endpoint ? u : (1 - Math.cos(Math.PI * u)) / 2,
        df: endpoint ? 0 : Math.PI / 2 * Math.sin(Math.PI * u),
        ddf: Math.PI ** 2 / 2 * Math.cos(Math.PI * u),
      };
    case 'cycloidal':
      return {
        f: endpoint ? u : u - Math.sin(TAU * u) / TAU,
        df: endpoint ? 0 : 1 - Math.cos(TAU * u),
        ddf: endpoint ? 0 : TAU * Math.sin(TAU * u),
      };
    case 'polynomial':
      return {
        f: endpoint ? u : u ** 3 * (10 + u * (-15 + 6 * u)),
        df: endpoint ? 0 : 30 * u ** 2 * (1 - u) ** 2,
        ddf: endpoint ? 0 : 60 * u * (1 - u) * (1 - 2 * u),
      };
    default:
      throw new RangeError('Unknown motion law.');
  }
}

export function motionSegments(settings: CamSettings): Segment[] {
  assertSettings(settings);
  return [
    { id: 'rise', start: 0, duration: settings.rise },
    { id: 'high', start: settings.rise, duration: settings.high },
    { id: 'return', start: settings.rise + settings.high, duration: settings.return },
    { id: 'low', start: settings.rise + settings.high + settings.return, duration: 360 - settings.rise - settings.high - settings.return },
  ];
}

function withinSegment(settings: CamSettings, segment: Segment, u: number): MotionSample {
  if (segment.id === 'high' || segment.id === 'low') {
    return { s: segment.id === 'high' ? settings.lift : 0, velocity: 0, acceleration: 0, segment: segment.id };
  }
  const { f, df, ddf } = normalizedLaw(settings.law, u);
  const beta = segment.duration * DEG;
  const direction = segment.id === 'rise' ? 1 : -1;
  return {
    s: settings.lift * (direction === 1 ? f : 1 - f),
    velocity: direction * settings.lift / beta * df,
    acceleration: direction * settings.lift / beta ** 2 * ddf,
    segment: segment.id,
  };
}

export function sampleMotion(settings: CamSettings, angle: number): MotionSample {
  const theta = wrapDegrees(angle);
  const segments = motionSegments(settings);
  // Half-open intervals give a deliberate right-hand value at every join.
  const segment = segments.find((part) => part.duration > 0 && theta >= part.start && theta < part.start + part.duration)!;
  return withinSegment(settings, segment, (theta - segment.start) / segment.duration);
}

export function boundaryValues(settings: CamSettings, angle: number): {
  left: MotionSample; right: MotionSample; accelerationJump: boolean;
} | undefined {
  const theta = wrapDegrees(angle);
  const segments = motionSegments(settings).filter((part) => part.duration > 0);
  const index = segments.findIndex((part) => part.start === theta);
  if (index < 0) return undefined;
  const left = withinSegment(settings, segments[(index + segments.length - 1) % segments.length], 1);
  const right = withinSegment(settings, segments[index], 0);
  return { left, right, accelerationJump: Math.abs(left.acceleration - right.acceleration) > 1e-10 };
}

export function sampleCurves(settings: CamSettings, steps = 128): MotionPoint[][] {
  if (!Number.isInteger(steps) || steps < 2 || steps > 4096) throw new RangeError('Curve samples must be an integer from 2 to 4096.');
  return motionSegments(settings).filter((part) => part.duration > 0).map((part) => {
    const count = part.id === 'rise' || part.id === 'return' ? steps : 1;
    return Array.from({ length: count + 1 }, (_, i) => ({
      ...withinSegment(settings, part, i / count),
      angle: part.start + part.duration * i / count,
    }));
  });
}

export function derivativePeaks(settings: CamSettings, law: LawId = settings.law) {
  assertSettings(settings);
  const definition = LAWS.find((entry) => entry.id === law);
  if (!definition) throw new RangeError('Unknown motion law.');
  const beta = Math.min(settings.rise, settings.return) * DEG;
  return {
    velocity: settings.lift / beta * definition.peakFirst,
    acceleration: settings.lift / beta ** 2 * definition.peakSecond,
  };
}

// Screen-space body coordinates: phi = pi/2 - theta. Positive physical rotation
// is CCW, so SVG rotates this body by -theta, not by +theta.
export function profilePoint(settings: CamSettings, phase: number): ProfilePoint {
  const angle = wrapDegrees(phase);
  const radius = settings.base + sampleMotion(settings, angle).s;
  return { angle: phase, x: radius * Math.sin(angle * DEG), y: -radius * Math.cos(angle * DEG) };
}

export function rotateCamPoint(point: { x: number; y: number }, angle: number) {
  if (!Number.isFinite(angle)) throw new RangeError('Angle must be finite.');
  const cosine = Math.cos(angle * DEG);
  const sine = Math.sin(angle * DEG);
  return { x: cosine * point.x + sine * point.y, y: -sine * point.x + cosine * point.y };
}

export function sampleProfile(settings: CamSettings): ProfilePoint[] {
  const phases = new Set(Array.from({ length: 721 }, (_, i) => i / 2));
  for (const part of motionSegments(settings)) {
    phases.add(part.start);
    phases.add(part.start + part.duration);
    if (part.id === 'rise' || part.id === 'return') {
      for (let i = 1; i < 96; i++) phases.add(part.start + part.duration * i / 96);
    }
  }
  return [...phases].sort((a, b) => a - b).map((phase) => profilePoint(settings, phase));
}

export function advanceAngle(angle: number, deltaSeconds: number, rpm: number): number {
  if (!Number.isFinite(angle) || angle < 0 || angle > 360) throw new RangeError('Playback angle must be in [0, 360].');
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Elapsed time must be nonnegative.');
  if (!Number.isFinite(rpm) || rpm <= 0) throw new RangeError('Rotation speed must be positive.');
  return deltaSeconds === 0 ? angle : wrapDegrees(angle + deltaSeconds * rpm * 6);
}
