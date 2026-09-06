import { clamp } from '../../core/math';

export const CYCLE_SECONDS = 12;
export const OPENING_PHASE = 0.68;

export function seekPhase(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Choose a finite cycle position.');
  return clamp(value, 0, 1);
}

export function advancePhase(phase: number, delta: number, speed: number): number {
  const position = seekPhase(phase);
  if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(speed) || speed <= 0) {
    throw new RangeError('Playback needs a nonnegative time step and a positive, finite speed.');
  }
  return delta === 0 ? position : (position + delta * speed / CYCLE_SECONDS) % 1;
}
