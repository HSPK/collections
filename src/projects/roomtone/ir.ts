import { BANDS, LIMITS } from './data';
import type { BandValues } from './data';
import type { ReflectionPath } from './engine';

export const SAMPLE_RATE = 44_100;
export const FIR_LENGTH = 513;
export const FILTER_LATENCY = (FIR_LENGTH - 1) / 2 / SAMPLE_RATE;
export const IR_WORK_BUDGET = LIMITS.paths * FIR_LENGTH * BANDS.length;
export interface ImpulseResponse {
  samples: Float32Array<ArrayBuffer>;
  sampleRate: number;
  energy: number;
  peak: number;
  duration: number;
  filterLatency: number;
}
export interface DecayPoint { time: number; db: number }
export interface Decay {
  points: DecayPoint[];
  totalEnergy: number;
  interval5to25: number | null;
  lastArrival: number;
}
function lowpass(cutoff: number): Float64Array {
  const result = new Float64Array(FIR_LENGTH);
  const mid = (FIR_LENGTH - 1) / 2;
  let sum = 0;
  for (let i = 0; i < FIR_LENGTH; i++) {
    const x = i - mid;
    const sinc = x === 0 ? 2 * cutoff / SAMPLE_RATE : Math.sin(2 * Math.PI * cutoff * x / SAMPLE_RATE) / (Math.PI * x);
    const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (FIR_LENGTH - 1)) +
      0.08 * Math.cos(4 * Math.PI * i / (FIR_LENGTH - 1));
    result[i] = sinc * window;
    sum += result[i];
  }
  for (let i = 0; i < result.length; i++) result[i] /= sum;
  return result;
}
// Complementary windowed-sinc bands telescope to a delayed unit impulse.
const LOWPASSES = BANDS.slice(0, -1).map((band, i) => lowpass(Math.sqrt(band * BANDS[i + 1])));
const KERNELS = BANDS.map((_, band) => Float64Array.from({ length: FIR_LENGTH }, (_v, i) => {
  const upper = band === BANDS.length - 1 ? Number(i === (FIR_LENGTH - 1) / 2) : LOWPASSES[band][i];
  return upper - (band === 0 ? 0 : LOWPASSES[band - 1][i]);
}));

/** Mono, no peak normalization: preserve physically relative changes between designs. */
export function buildImpulse(paths: readonly ReflectionPath[], selectedBand?: number): ImpulseResponse {
  if (paths.length < 1 || paths.length > LIMITS.paths) throw new RangeError('Impulse path count is outside the work budget.');
  if (selectedBand !== undefined && (!Number.isInteger(selectedBand) || selectedBand < 0 || selectedBand >= BANDS.length)) {
    throw new RangeError('Unknown octave band.');
  }
  let last = 0;
  for (const path of paths) {
    if (!Number.isFinite(path.delay) || path.delay < 0 || path.delay > 2 ||
        path.amplitudes.length !== BANDS.length ||
        !path.amplitudes.every((amplitude) => Number.isFinite(amplitude) && amplitude >= 0 && amplitude <= 1)) {
      throw new RangeError('An impulse path has invalid timing or amplitude.');
    }
    last = Math.max(last, path.delay);
  }
  const samples = new Float32Array(Math.ceil(last * SAMPLE_RATE) + FIR_LENGTH + 2);
  for (const path of paths) {
    const time = path.delay * SAMPLE_RATE;
    const start = Math.floor(time);
    const fraction = time - start;
    for (let tap = 0; tap < FIR_LENGTH; tap++) {
      let value = 0;
      if (selectedBand !== undefined) {
        value = path.amplitudes[selectedBand] * KERNELS[selectedBand][tap];
      } else {
        for (let band = 0; band < BANDS.length; band++) value += path.amplitudes[band] * KERNELS[band][tap];
      }
      samples[start + tap] += value * (1 - fraction);
      samples[start + tap + 1] += value * fraction;
    }
  }
  let energy = 0;
  let peak = 0;
  for (const sample of samples) {
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { samples, sampleRate: SAMPLE_RATE, energy, peak, duration: samples.length / SAMPLE_RATE, filterLatency: FILTER_LATENCY };
}
export function energyDecay(ir: ImpulseResponse, pointCount = 250): Decay {
  if (!Number.isInteger(pointCount) || pointCount < 2 || pointCount > 2000) throw new RangeError('Invalid decay resolution.');
  const energy = new Float64Array(ir.samples.length);
  let sum = 0;
  let lastArrival = 0;
  for (let i = ir.samples.length - 1; i >= 0; i--) {
    const sample = ir.samples[i];
    if (!Number.isFinite(sample)) throw new RangeError('Non-finite impulse response.');
    sum += sample * sample;
    energy[i] = sum;
    if (!lastArrival && Math.abs(sample) > 1e-9) lastArrival = i / ir.sampleRate;
  }
  const dbAt = (i: number) => sum > 0 ? Math.max(-80, 10 * Math.log10(Math.max(1e-12, energy[i] / sum))) : -80;
  let time5: number | null = null;
  let time25: number | null = null;
  for (let i = 0; i < energy.length; i++) {
    if (time5 === null && dbAt(i) <= -5) time5 = i / ir.sampleRate;
    if (time25 === null && dbAt(i) <= -25) time25 = i / ir.sampleRate;
  }
  const points = Array.from({ length: pointCount }, (_, i) => {
    const sample = Math.round(i / (pointCount - 1) * (energy.length - 1));
    return { time: sample / ir.sampleRate, db: dbAt(sample) };
  });
  return {
    points, totalEnergy: sum, lastArrival,
    interval5to25: sum > 0 && time5 !== null && time25 !== null && time25 > time5 ? time25 - time5 : null,
  };
}
export function reflectedEnergy(paths: readonly ReflectionPath[]): BandValues {
  const at = (band: number) => paths.filter((path) => path.order > 0).reduce((sum, path) => sum + path.amplitudes[band] ** 2, 0);
  return [at(0), at(1), at(2), at(3), at(4), at(5)];
}
