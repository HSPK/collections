import { clamp, lerp } from '../../core/math';
import type { LessonId } from './data';

export type EasingId = 'smooth' | 'out' | 'in' | 'linear';
export type MotionPhase = 'ready' | 'prepare' | 'travel' | 'settle' | 'hold' | 'complete';

export interface MotionParameters {
  duration: number;
  amplitude: number;
  easing: EasingId;
}

export interface FollowerPose {
  x: number;
}

export interface MotionPose {
  x: number;
  lift: number;
  scaleX: number;
  scaleY: number;
  followers: FollowerPose[];
}

export interface MotionFrame {
  seconds: number;
  progress: number;
  phase: MotionPhase;
  plain: MotionPose;
  expressive: MotionPose;
}

export const DEFAULT_PARAMETERS: Readonly<MotionParameters> = Object.freeze({
  duration: 2.8,
  amplitude: 0.75,
  easing: 'smooth',
});

export function ease(progress: number, curve: EasingId): number {
  const t = clamp(progress, 0, 1);
  switch (curve) {
    case 'linear': return t;
    case 'in': return t ** 3;
    case 'out': return 1 - (1 - t) ** 3;
    case 'smooth': return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

function smoothstep(progress: number): number {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
}

function settling(progress: number): number {
  const t = clamp(progress, 0, 1);
  return Math.cos(3 * Math.PI * t) * (1 - smoothstep(t));
}

function pose(x: number): MotionPose {
  return { x, lift: 0, scaleX: 1, scaleY: 1, followers: [] };
}

function follower(time: number, delay: number, excess: number, curve: EasingId): FollowerPose {
  const arrival = 0.46 + delay;
  if (time <= arrival) {
    return { x: (1 + excess) * ease((time - delay) / 0.46, curve) };
  }
  return { x: 1 + excess * settling((time - arrival) / (1 - arrival)) };
}

/** Time is in seconds. No accumulated integration, randomness, or playback state is used. */
export function sampleMotion(
  lesson: LessonId,
  seconds: number,
  parameters: MotionParameters = DEFAULT_PARAMETERS,
): MotionFrame {
  if (!Number.isFinite(seconds) || !Number.isFinite(parameters.duration) || parameters.duration <= 0 ||
      !Number.isFinite(parameters.amplitude)) {
    throw new RangeError('Motion samples need finite time and amplitude, and a positive finite duration.');
  }
  const t = clamp(seconds / parameters.duration, 0, 1);
  const a = clamp(parameters.amplitude, 0, 1);
  const curve = parameters.easing;
  const plain = pose(ease(t, curve));
  const expressive = pose(plain.x);
  let phase: MotionPhase = 'travel';

  switch (lesson) {
    case 'timing':
      plain.x = t;
      expressive.x = lerp(t, ease(t, curve), a);
      break;
    case 'anticipation': {
      const preparation = 0.22 * a;
      const distance = 0.16 * a;
      if (t < preparation) {
        expressive.x = t === 0 ? 0 : -distance * smoothstep(t / preparation);
        phase = 'prepare';
      } else {
        expressive.x = lerp(-distance, 1, ease((t - preparation) / (1 - preparation), curve));
      }
      break;
    }
    case 'squash-stretch': {
      const flight = clamp((t - 0.18) / 0.54, 0, 1);
      plain.x = expressive.x = ease(flight, curve);
      plain.lift = expressive.lift = 86 * 4 * flight * (1 - flight);
      let height = 1;
      if (t < 0.18) {
        height -= 0.28 * a * Math.sin(Math.PI * t / 0.18) ** 2;
        phase = 'prepare';
      } else if (t < 0.72) {
        height += 0.42 * a * Math.sin(2 * Math.PI * flight) ** 2;
      } else if (t < 0.94) {
        height -= 0.42 * a * Math.sin(Math.PI * (t - 0.72) / 0.22) ** 2;
        phase = 'settle';
      } else {
        phase = 'hold';
      }
      expressive.scaleY = height;
      expressive.scaleX = 1 / height;
      break;
    }
    case 'arcs':
      expressive.lift = 105 * a * 4 * expressive.x * (1 - expressive.x);
      break;
    case 'overshoot': {
      plain.x = ease(t / 0.6, curve);
      expressive.x = t <= 0.6
        ? (1 + 0.2 * a) * plain.x
        : 1 + 0.2 * a * settling((t - 0.6) / 0.4);
      if (t >= 0.6) phase = 'settle';
      break;
    }
    case 'follow-through':
      plain.x = expressive.x = ease(t / 0.46, curve);
      plain.followers = [{ x: plain.x }, { x: plain.x }];
      expressive.followers = [
        follower(t, 0.16 * a, 0.06 * a, curve),
        follower(t, 0.32 * a, 0.1 * a, curve),
      ];
      if (t >= 0.46) phase = 'settle';
      break;
  }

  if (t === 0) phase = 'ready';
  if (t === 1) phase = 'complete';
  return { seconds: t * parameters.duration, progress: t, phase, plain, expressive };
}
