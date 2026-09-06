import { clamp, lerp } from '../../core/math';
import { CHAPTERS, PARTS } from './data';
import type { CameraPart, PartId, Vector3Tuple } from './data';

export interface PartPose {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  settled: number;
}

export function normaliseProgress(progress: number): number {
  if (!Number.isFinite(progress)) throw new RangeError('Assembly progress must be finite.');
  return clamp(progress, 0, 1);
}

export function easeBetween(progress: number, start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError('An assembly interval must have a finite, increasing range.');
  }
  const t = clamp((normaliseProgress(progress) - start) / (end - start), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function partPose(part: CameraPart, progress: number): PartPose {
  const settled = easeBetween(progress, part.start, part.end);
  if (settled === 0) return { position: [...part.exploded], rotation: [...part.rotation], settled };
  if (settled === 1) return { position: [...part.assembled], rotation: [0, 0, 0], settled };
  const blend = (axis: number) => lerp(part.exploded[axis], part.assembled[axis], settled);
  return {
    position: [blend(0), blend(1), blend(2)],
    rotation: [
      part.rotation[0] * (1 - settled),
      part.rotation[1] * (1 - settled),
      part.rotation[2] * (1 - settled),
    ],
    settled,
  };
}

export function chapterAt(progress: number): number {
  const t = normaliseProgress(progress);
  return CHAPTERS.findIndex((chapter, index) => t < chapter.end || index === CHAPTERS.length - 1);
}

export function assemblyFrame(progress: number) {
  const t = normaliseProgress(progress);
  const print = easeBetween(t, 0.91, 1);
  const parts = Object.fromEntries(PARTS.map((part) => [part.id, partPose(part, t)])) as Record<PartId, PartPose>;
  return {
    progress: t,
    chapter: chapterAt(t),
    parts,
    shutterAngle: lerp(-0.2, 0.06, easeBetween(t, 0.61, 0.77)),
    print: {
      visible: t > 0.91,
      position: [0, lerp(0.08, -2.03, print), lerp(0.68, 1.25, print)] as Vector3Tuple,
      rotation: [-0.33 * print, 0, 0] as Vector3Tuple,
      revealed: print,
    },
  };
}
