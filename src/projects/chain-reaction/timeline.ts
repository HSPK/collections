import { clamp, lerp } from '../../core/math';
import { DOMINO, DURATION, LEVER, MARBLE_RADIUS, STAGES, TIMING, WHEEL } from './data';
import type { MachineLayout, StageId } from './data';

const degrees = 180 / Math.PI;
const radians = Math.PI / 180;
const smooth = (value: number) => value * value * (3 - 2 * value);
const interval = (time: number, start: number, end: number) => clamp((time - start) / (end - start), 0, 1);

// The leading upper corner reaches the next upright face at this angle.
export const DOMINO_CONTACT_ANGLE = (
  Math.asin((DOMINO.gap - DOMINO.width / 2) / Math.hypot(DOMINO.height, DOMINO.width / 2))
  - Math.atan2(DOMINO.width / 2, DOMINO.height)
) * degrees;
export const DOMINO_REST_ANGLE = Math.acos(DOMINO.width / DOMINO.gap) * degrees;

export const LEVER_CONTACT_ANGLE = (
  Math.acos((LEVER.heightAboveRail + LEVER.paddleHalfHeight) / Math.hypot(DOMINO.height, DOMINO.width / 2))
  - Math.atan2(DOMINO.width / 2, DOMINO.height)
) * degrees;

export function dominoStart(index: number): number {
  return TIMING.firstContact + index * DOMINO.contactDelay;
}

function dominoAngle(time: number, index: number): number {
  const age = time - dominoStart(index);
  if (age <= 0) return 0;
  if (age >= DOMINO.fallDuration) return DOMINO_REST_ANGLE;
  if (age <= DOMINO.contactDelay) {
    return DOMINO_CONTACT_ANGLE * (age / DOMINO.contactDelay) ** 2;
  }
  const progress = interval(age, DOMINO.contactDelay, DOMINO.fallDuration);
  return lerp(DOMINO_CONTACT_ANGLE, DOMINO_REST_ANGLE, 1 - (1 - progress) ** 3);
}

function timeAtDominoAngle(angle: number, index: number): number {
  const fraction = (angle - DOMINO_CONTACT_ANGLE) / (DOMINO_REST_ANGLE - DOMINO_CONTACT_ANGLE);
  const afterContact = (DOMINO.fallDuration - DOMINO.contactDelay) * (1 - Math.cbrt(1 - fraction));
  return dominoStart(index) + DOMINO.contactDelay + afterContact;
}

export function dominoTip(angle: number): { x: number; y: number } {
  const theta = angle * radians;
  return {
    x: DOMINO.height * Math.sin(theta) + DOMINO.width / 2 * Math.cos(theta),
    y: -DOMINO.height * Math.cos(theta) + DOMINO.width / 2 * Math.sin(theta),
  };
}

function wheelPose(time: number) {
  const progress = smooth(interval(time, TIMING.wheelStart, TIMING.wheelStop));
  const angle = progress * Math.PI;
  const camX = -WHEEL.eccentricity * Math.sin(angle);
  const camY = WHEEL.eccentricity * Math.cos(angle);
  // A vertical roller follower remains tangent to the circular eccentric cam.
  const contactY = camY - Math.sqrt((WHEEL.camRadius + WHEEL.rollerRadius) ** 2 - camX ** 2);
  const restY = WHEEL.eccentricity - WHEEL.camRadius - WHEEL.rollerRadius;
  return {
    progress,
    angle: progress * 180,
    camX,
    camY,
    followerY: contactY,
    lift: restY - contactY,
    weightDrop: angle * WHEEL.drumRadius,
  };
}

function bloomStart(): number {
  let low: number = TIMING.wheelStart;
  let high: number = TIMING.wheelStop;
  for (let iteration = 0; iteration < 48; iteration++) {
    const middle = (low + high) / 2;
    if (wheelPose(middle).lift < WHEEL.bloomThreshold) low = middle;
    else high = middle;
  }
  return high;
}

export const STAGE_CUES: Readonly<Record<StageId, number>> = {
  roll: 0,
  cascade: TIMING.firstContact,
  release: timeAtDominoAngle(LEVER_CONTACT_ANGLE, DOMINO.count - 1),
  turn: TIMING.wheelStart,
  bloom: bloomStart(),
};

export interface ReactionState {
  time: number;
  stage: StageId;
  complete: boolean;
  marble: number;
  dominoes: readonly number[];
  lever: { angle: number; lift: number };
  wheel: ReturnType<typeof wheelPose>;
  flower: number;
}

/** An illustrative, hand-authored timeline. No simulation history is consulted. */
export function stateAt(input: number): ReactionState {
  if (!Number.isFinite(input)) throw new RangeError('Chain Reaction time must be finite.');
  const time = clamp(input, 0, DURATION);
  const dominoes = Array.from({ length: DOMINO.count }, (_, index) => dominoAngle(time, index));
  const tip = dominoTip(dominoes[DOMINO.count - 1]);
  const lift = Math.max(0, tip.y + LEVER.heightAboveRail + LEVER.paddleHalfHeight);
  const wheel = wheelPose(time);
  const flower = smooth(clamp(
    (wheel.lift - WHEEL.bloomThreshold) / (2 * WHEEL.eccentricity - WHEEL.bloomThreshold),
    0,
    1,
  ));
  let stage: StageId = 'roll';
  for (const candidate of STAGES) {
    if (time >= STAGE_CUES[candidate.id]) stage = candidate.id;
  }
  return {
    time,
    stage,
    complete: time === DURATION,
    marble: interval(time, TIMING.rollStart, TIMING.firstContact) ** 1.7,
    dominoes,
    lever: { angle: -Math.asin(lift / LEVER.halfLength) * degrees, lift },
    wheel,
    flower,
  };
}

export function marblePose(layout: MachineLayout, progress: number) {
  const radius = MARBLE_RADIUS;
  const endX = layout.firstDominoX - DOMINO.width / 2 - radius;
  const width = endX - layout.railStartX;
  const rise = layout.railRise;
  const slope = 2 * rise * (1 - progress) / width;
  const normal = Math.hypot(1, slope);
  const arcPrimitive = (value: number) => (
    value * Math.hypot(width, 2 * rise * value)
    + width ** 2 / (2 * rise) * Math.asinh(2 * rise * value / width)
  ) / 2;
  const distance = arcPrimitive(1) - arcPrimitive(1 - progress);
  return {
    x: lerp(layout.railStartX, endX, progress) - radius * slope / normal,
    y: layout.railY - rise * (1 - progress) ** 2 - radius / normal,
    angle: distance / radius * degrees,
  };
}

export function leverPose(layout: MachineLayout, state: ReactionState) {
  const pivotX = layout.firstDominoX + (DOMINO.count - 1) * DOMINO.gap + LEVER.pivotOffset;
  const pivotY = layout.railY - LEVER.heightAboveRail;
  const dx = LEVER.halfLength * Math.cos(state.lever.angle * radians);
  return {
    pivotX,
    pivotY,
    left: { x: pivotX - dx, y: pivotY + state.lever.lift },
    right: { x: pivotX + dx, y: pivotY - state.lever.lift },
  };
}
