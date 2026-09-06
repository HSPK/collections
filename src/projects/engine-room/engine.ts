export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  radius: number;
  rod: number;
}

export interface SliderCrankPose {
  crank: Point;
  wrist: Point;
  displacement: number;
  strokeFraction: number;
  rodAngle: number;
  travelPerRadian: number;
}

export type Stroke = 'intake' | 'compression' | 'power' | 'exhaust';

export interface EngineState {
  angle: number;
  stroke: Stroke;
  strokeIndex: number;
  localAngle: number;
  intakeLift: number;
  exhaustLift: number;
  complete: boolean;
  pose: SliderCrankPose;
}

export const CYCLE_DEGREES = 720;
export const DEGREES_PER_SECOND = 60;
export const DEFAULT_ANGLE = 72;
export const DEFAULT_GEOMETRY: Geometry = { radius: 1, rod: 3.4 };
const RAD = Math.PI / 180;

export function validateGeometry({ radius, rod }: Geometry): void {
  if (!Number.isFinite(radius) || !Number.isFinite(rod) || radius <= 0 || rod <= radius) {
    throw new RangeError('Use a positive crank radius and a connecting rod longer than the crank radius.');
  }
}

export function seekAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('The cycle angle must be finite.');
  return Math.min(CYCLE_DEGREES, Math.max(0, angle));
}

/** Coordinates are relative to the crank center: x right, y up, zero at TDC. */
export function sliderCrank(angle: number, geometry: Geometry = DEFAULT_GEOMETRY): SliderCrankPose {
  validateGeometry(geometry);
  if (!Number.isFinite(angle)) throw new RangeError('The crank angle must be finite.');
  const { radius: r, rod: l } = geometry;
  const theta = (((angle % 360) + 360) % 360) * RAD;
  const sine = Math.sin(theta);
  const cosine = Math.cos(theta);
  const rise = Math.sqrt(l * l - r * r * sine * sine);
  const crank = { x: r * sine, y: r * cosine };
  const wrist = { x: 0, y: r * cosine + rise };
  const displacement = l + r - wrist.y;
  return {
    crank,
    wrist,
    displacement,
    strokeFraction: displacement / (2 * r),
    rodAngle: Math.asin(r * sine / l) / RAD,
    travelPerRadian: r * sine + r * r * sine * cosine / rise,
  };
}

/** This lift schedule is schematic, not a solved cam/valve train. */
export function valveLift(localAngle: number): number {
  if (!Number.isFinite(localAngle) || localAngle < 0 || localAngle > 180) {
    throw new RangeError('A valve event runs from 0 to 180 crank degrees.');
  }
  if (localAngle === 0 || localAngle === 180) return 0;
  return Math.sin(localAngle * RAD) ** 2;
}

export function stateAt(angle: number, geometry: Geometry = DEFAULT_GEOMETRY): EngineState {
  const position = seekAngle(angle);
  // Preserve the scrubber's final endpoint as the end of exhaust, not a new intake.
  const strokeIndex = position === CYCLE_DEGREES ? 3 : Math.floor(position / 180);
  const stroke = (['intake', 'compression', 'power', 'exhaust'] as const)[strokeIndex];
  const localAngle = position - strokeIndex * 180;
  return {
    angle: position,
    stroke,
    strokeIndex,
    localAngle,
    intakeLift: stroke === 'intake' ? valveLift(localAngle) : 0,
    exhaustLift: stroke === 'exhaust' ? valveLift(localAngle) : 0,
    complete: position === CYCLE_DEGREES,
    pose: sliderCrank(position, geometry),
  };
}

export function advanceCycle(angle: number, delta: number, speed = 1): number {
  if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(speed) || speed <= 0) {
    throw new RangeError('Playback needs a nonnegative time step and a positive finite speed.');
  }
  const position = seekAngle(angle);
  if (delta === 0) return position;
  return (position + delta * speed * DEGREES_PER_SECOND) % CYCLE_DEGREES;
}
