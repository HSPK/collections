import { clamp, lerp } from '../../core/math';
import {
  BRUSH_DIAMETER, CORE_RATIO, DISCOVERIES, FIELD_MAX, FIELD_MIN, MAX_PATCHES,
  MODE_BY_ID, OBJECTS,
} from './data';
import type { ObjectSpec, TimeMode } from './data';

export interface Point { x: number; y: number }
export interface TimePatch extends Point {
  id: number;
  stroke: number;
  radius: number;
  mode: TimeMode;
}
export interface LocalClock { spec: ObjectSpec; time: number }
export interface Motion { position: Point; angle: number }
export interface SceneLayout {
  aspect: number;
  compact: boolean;
  sx: number;
  sy: number;
  orbit: Point;
  orbitRadii: readonly number[];
  waveLeft: number;
  waveRight: number;
  waveRows: readonly number[];
  waveAmplitude: number;
  railLeft: number;
  railRight: number;
  railY: number;
  railRadius: number;
}

const TAU = Math.PI * 2;
export const wrap = (value: number, period = TAU) => ((value % period) + period) % period;

export function sceneLayout(aspect: number): SceneLayout {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? clamp(aspect, 0.4, 4) : 1.55;
  const compact = safeAspect < 1.2;
  const sx = Math.max(1, safeAspect);
  const sy = Math.max(1, 1 / safeAspect);
  return {
    aspect: safeAspect, compact, sx, sy,
    orbit: compact ? { x: 0.48, y: 0.238 } : { x: 0.285, y: 0.348 },
    orbitRadii: compact ? [0.105, 0.171, 0.238] : [0.145, 0.218, 0.29],
    waveLeft: compact ? 0.14 : 0.57,
    waveRight: compact ? 0.9 : 0.93,
    waveRows: compact ? [0.535, 0.655] : [0.25, 0.445],
    waveAmplitude: compact ? 0.045 : 0.06,
    railLeft: compact ? 0.2 : 0.17,
    railRight: compact ? 0.8 : 0.83,
    railY: compact ? 0.858 : 0.797,
    railRadius: compact ? 0.085 : 0.103,
  };
}

export function fieldDistance(a: Point, b: Point, aspect: number): number {
  const { sx, sy } = sceneLayout(aspect);
  return Math.hypot((a.x - b.x) * sx, (a.y - b.y) * sy);
}

export function patchWeight(distance: number, radius: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 0;
  const edge = clamp((distance / radius - CORE_RATIO) / (1 - CORE_RATIO), 0, 1);
  return 1 - edge * edge * (3 - 2 * edge);
}

export function sampleField(patches: readonly TimePatch[], point: Point, aspect = 1.55): number {
  const sx = Math.max(1, aspect);
  const sy = Math.max(1, 1 / aspect);
  let rate = 1;
  for (const patch of patches) {
    const dx = (point.x - patch.x) * sx;
    const dy = (point.y - patch.y) * sy;
    if (Math.abs(dx) >= patch.radius || Math.abs(dy) >= patch.radius) continue;
    const weight = patchWeight(Math.hypot(dx, dy), patch.radius);
    rate = lerp(rate, MODE_BY_ID[patch.mode].rate, weight);
  }
  return clamp(rate, FIELD_MIN, FIELD_MAX);
}

export function railMotion(phase: number, layout: SceneLayout): Motion {
  const left = layout.railLeft * layout.sx;
  const right = layout.railRight * layout.sx;
  const y = layout.railY * layout.sy;
  const r = layout.railRadius;
  const straight = right - left;
  const arc = Math.PI * r;
  const distance = wrap(phase / TAU, 1) * (2 * straight + 2 * arc);
  let x: number;
  let py: number;
  let angle: number;
  if (distance < straight) {
    x = left + distance;
    py = y - r;
    angle = 0;
  } else if (distance < straight + arc) {
    const turn = -Math.PI / 2 + (distance - straight) / r;
    x = right + Math.cos(turn) * r;
    py = y + Math.sin(turn) * r;
    angle = turn + Math.PI / 2;
  } else if (distance < straight * 2 + arc) {
    x = right - (distance - straight - arc);
    py = y + r;
    angle = Math.PI;
  } else {
    const turn = Math.PI / 2 + (distance - straight * 2 - arc) / r;
    x = left + Math.cos(turn) * r;
    py = y + Math.sin(turn) * r;
    angle = turn + Math.PI / 2;
  }
  return { position: { x: x / layout.sx, y: py / layout.sy }, angle };
}

export function motionAt(spec: ObjectSpec, time: number, aspect = 1.55): Motion {
  const layout = sceneLayout(aspect);
  const phase = wrap(spec.phase + time * spec.speed);
  if (spec.family === 'orbit') {
    const radius = spec.track < 0 ? 0 : layout.orbitRadii[spec.track];
    return {
      position: {
        x: layout.orbit.x + Math.cos(phase) * radius / layout.sx,
        y: layout.orbit.y + Math.sin(phase) * radius / layout.sy,
      },
      angle: phase + Math.PI / 2,
    };
  }
  if (spec.family === 'train') return railMotion(phase, layout);
  return {
    position: {
      x: lerp(layout.waveLeft, layout.waveRight, spec.index / 11)
        + Math.cos(phase) * 0.008 / layout.sx,
      y: layout.waveRows[spec.track] + Math.sin(phase) * layout.waveAmplitude / layout.sy,
    },
    angle: phase * 0.5,
  };
}

export function rateName(rate: number): string {
  if (Math.abs(rate) < 0.00001) return 'Frozen';
  if (rate < 0) return 'Reversing';
  if (Math.abs(rate - 1) < 0.00001) return 'Normal time';
  return rate < 1 ? 'Slowing' : 'Accelerating';
}

export function formatRate(rate: number): string {
  return `${rate < -0.00001 ? '−' : ''}${Math.abs(rate).toFixed(2)}×`;
}

export class TimeScene {
  readonly clocks: LocalClock[] = OBJECTS.map((spec) => ({ spec, time: 0 }));
  private field: TimePatch[] = [];
  private sequence = 0;
  private strokeSequence = 0;
  aspect: number;
  revision = 0;

  constructor(aspect = 1.55) {
    this.aspect = sceneLayout(aspect).aspect;
    this.reset();
  }

  get patches(): readonly TimePatch[] { return this.field; }

  setAspect(aspect: number): void {
    const next = sceneLayout(aspect).aspect;
    if (next === this.aspect) return;
    this.aspect = next;
    this.revision++;
  }

  beginStroke(): number { return ++this.strokeSequence; }

  stamp(point: Point, mode: TimeMode, radius: number, stroke = this.beginStroke()): TimePatch {
    if (![point.x, point.y, radius].every(Number.isFinite) || !Object.hasOwn(MODE_BY_ID, mode)) {
      throw new RangeError('A time patch needs finite coordinates, a radius, and a known mode.');
    }
    const patch: TimePatch = {
      id: ++this.sequence, stroke, x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1),
      radius: clamp(radius, BRUSH_DIAMETER.min / 200, BRUSH_DIAMETER.max / 200), mode,
    };
    this.field.push(patch);
    if (this.field.length > MAX_PATCHES) this.field.splice(0, this.field.length - MAX_PATCHES);
    this.revision++;
    return patch;
  }

  undoStroke(): number {
    const stroke = this.field.at(-1)?.stroke;
    if (stroke === undefined) return 0;
    const before = this.field.length;
    this.field = this.field.filter((patch) => patch.stroke !== stroke);
    this.revision++;
    return before - this.field.length;
  }

  clearPatches(): void {
    this.field = [];
    this.revision++;
  }

  reset(): void {
    this.clocks.forEach((clock) => { clock.time = 0; });
    this.field = [];
    this.sequence = 0;
    this.strokeSequence = 0;
    for (const discovery of DISCOVERIES) {
      this.stamp(this.inspect(discovery.target).position, discovery.mode, discovery.radius);
    }
    this.revision++;
  }

  rateAt(point: Point): number { return sampleField(this.field, point, this.aspect); }

  inspect(id: string) {
    const clock = this.clocks.find((item) => item.spec.id === id);
    if (!clock) throw new RangeError(`Unknown local clock: ${id}`);
    const motion = motionAt(clock.spec, clock.time, this.aspect);
    return { ...clock, ...motion, rate: this.rateAt(motion.position) };
  }

  nearest(point: Point): { id: string; distance: number } {
    let nearest = { id: this.clocks[0].spec.id, distance: Infinity };
    for (const clock of this.clocks) {
      const position = motionAt(clock.spec, clock.time, this.aspect).position;
      const distance = fieldDistance(position, point, this.aspect);
      if (distance < nearest.distance) nearest = { id: clock.spec.id, distance };
    }
    return nearest;
  }

  advance(delta: number, paused = false): void {
    if (paused || !Number.isFinite(delta) || delta <= 0) return;
    const boundedDelta = Math.min(delta, 0.05);
    const steps = Math.ceil(boundedDelta / (1 / 120));
    const step = boundedDelta / steps;
    for (let i = 0; i < steps; i++) {
      for (const clock of this.clocks) {
        // Only time is integrated; every position, heading, and carriage is analytic in that time.
        const position = motionAt(clock.spec, clock.time, this.aspect).position;
        clock.time += step * this.rateAt(position);
      }
    }
  }
}
