import { clamp, lerp } from '../../core/math';
import { CALIBRATION_SECONDS, plants } from './data';

export interface GardenState {
  opened: number[];
  wind: number;
  phase: number;
  wheel: number;
}

export function createGarden(): GardenState {
  return { opened: plants.map((plant) => plant.opened), wind: 0, phase: 0, wheel: 0 };
}

export function rootMeanSquare(samples: Float32Array): number {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new RangeError('Loudness samples must be finite.');
    total += sample * sample;
  }
  return clamp(Math.sqrt(total / samples.length), 0, 1);
}

export class LoudnessEnvelope {
  private elapsed = 0;
  private calibration: number[] = [];
  private floor = 0.004;
  private level = 0;

  get calibrating(): boolean { return this.elapsed < CALIBRATION_SECONDS; }
  get noiseFloor(): number { return this.floor; }

  reset(): void {
    this.elapsed = 0;
    this.calibration = [];
    this.floor = 0.004;
    this.level = 0;
  }

  sample(rms: number, delta: number): number {
    if (!Number.isFinite(rms) || !Number.isFinite(delta) || rms < 0 || delta < 0) {
      throw new RangeError('Loudness and elapsed time must be finite and non-negative.');
    }
    const dt = clamp(delta, 0, 0.05);
    if (this.calibrating) {
      this.elapsed += dt;
      if (this.calibration.length < 96) this.calibration.push(clamp(rms, 0, 1));
      if (!this.calibrating) {
        const ordered = [...this.calibration].sort((a, b) => a - b);
        this.floor = clamp(ordered[Math.floor((ordered.length - 1) * 0.2)], 0.001, 0.08);
        this.calibration = [];
      }
      return 0;
    }
    const target = clamp((rms - this.floor * 1.65 - 0.006) * 8, 0, 1);
    const response = target > this.level ? 0.12 : 0.6;
    this.level = lerp(this.level, target, 1 - Math.exp(-dt / response));
    if (this.level < 0.0001) this.level = 0;
    return this.level;
  }
}

export function unfoldStep(state: GardenState, strength: number): void {
  const wind = clamp(strength, 0, 1);
  state.opened = state.opened.map((opened, index) => clamp(opened + wind * (0.14 + index % 3 * 0.018), 0, 1));
  state.wind = wind;
}

export function advanceGarden(state: GardenState, target: number, delta: number, direction: -1 | 1): void {
  const dt = clamp(delta, 0, 0.05);
  state.wind = lerp(state.wind, clamp(target, 0, 1), 1 - Math.exp(-dt / (target > state.wind ? 0.15 : 0.65)));
  state.phase = (state.phase + dt * 0.72) % (Math.PI * 2);
  state.wheel = (state.wheel + dt * state.wind * direction * 1.3) % (Math.PI * 2);
  state.opened = state.opened.map((opened, index) =>
    clamp(opened + dt * state.wind * (0.06 + index % 3 * 0.012), 0, 1));
}

export function paperOpened(state: GardenState): number {
  return Math.round(state.opened.reduce((sum, amount) => sum + amount, 0) / state.opened.length * 100);
}

export function fullyOpened(state: GardenState): number {
  return state.opened.filter((amount) => amount >= 0.98).length;
}
