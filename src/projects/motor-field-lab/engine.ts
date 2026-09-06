import { ELECTRICAL_SPEED, PHASES, POLE_PAIRS } from './data';

export type PhaseMask = readonly [boolean, boolean, boolean];
export type RotorMode = 'follow' | 'hold';
export interface MotorInput {
  electricalAngle: number;
  enabled: PhaseMask;
  commandLag: number;
  rotorMode: RotorMode;
  rotorAngle: number;
}

export interface Vector {
  x: number;
  y: number;
}

export interface MotorFrame {
  electricalAngle: number;
  enabled: PhaseMask;
  currents: readonly [number, number, number];
  contributions: readonly [Vector, Vector, Vector];
  currentSum: number;
  field: Vector & { magnitude: number; angle: number | null };
  rotor: Vector;
  rotorMechanicalAngle: number;
  rotorElectricalAngle: number;
  actualLoadAngle: number | null;
  torque: number;
}

const EPSILON = 1e-12;
const radians = (degrees: number) => degrees * Math.PI / 180;
const clean = (value: number) => Math.abs(value) < EPSILON ? 0 : value;

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Motor angles and time must be finite.');
  return value;
}

export function normalizeDegrees(degrees: number): number {
  return ((finite(degrees) % 360) + 360) % 360;
}

export function signedDegrees(degrees: number): number {
  const value = normalizeDegrees(degrees);
  return value > 180 ? value - 360 : value;
}

export function currentAt(electricalAngle: number, axis: number, enabled = true): number {
  const angle = radians(normalizeDegrees(electricalAngle) - finite(axis));
  return enabled ? clean(Math.cos(angle)) : 0;
}

export function advanceElectricalAngle(angle: number, seconds: number, speed: number): number {
  return normalizeDegrees(finite(angle) + finite(seconds) * finite(speed) * ELECTRICAL_SPEED);
}

export function sampleMotor(input: MotorInput): MotorFrame {
  finite(input.electricalAngle);
  finite(input.commandLag);
  finite(input.rotorAngle);
  const currents = PHASES.map((phase, index) =>
    currentAt(input.electricalAngle, phase.axis, input.enabled[index]),
  ) as [number, number, number];
  const contributions = PHASES.map((phase, index) => ({
    x: clean((2 / 3) * currents[index] * Math.cos(radians(phase.axis))),
    y: clean((2 / 3) * currents[index] * Math.sin(radians(phase.axis))),
  })) as [Vector, Vector, Vector];
  const x = clean(contributions.reduce((sum, vector) => sum + vector.x, 0));
  const y = clean(contributions.reduce((sum, vector) => sum + vector.y, 0));
  const magnitude = clean(Math.hypot(x, y));
  const field = {
    x: magnitude === 0 ? 0 : x,
    y: magnitude === 0 ? 0 : y,
    magnitude,
    angle: magnitude === 0 ? null : normalizeDegrees(Math.atan2(y, x) * 180 / Math.PI),
  };
  const rotorMechanicalAngle = normalizeDegrees(input.rotorMode === 'follow'
    ? (input.electricalAngle - input.commandLag) / POLE_PAIRS
    : input.rotorAngle);
  const rotorElectricalAngle = normalizeDegrees(rotorMechanicalAngle * POLE_PAIRS);
  const rotor = {
    x: clean(Math.cos(radians(rotorElectricalAngle))),
    y: clean(Math.sin(radians(rotorElectricalAngle))),
  };

  return {
    electricalAngle: input.electricalAngle,
    enabled: [...input.enabled],
    currents,
    contributions,
    currentSum: clean(currents.reduce((sum, current) => sum + current, 0)),
    field,
    rotor,
    rotorMechanicalAngle,
    rotorElectricalAngle,
    actualLoadAngle: field.angle === null ? null : signedDegrees(field.angle - rotorElectricalAngle),
    // Compute from the actual field, including missing phases and its magnitude.
    torque: clean(rotor.x * field.y - rotor.y * field.x),
  };
}
