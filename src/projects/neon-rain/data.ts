import { clamp, random } from '../../core/math';

export const DISTRICT = 'Vesper Ward';
export const RAIN_PERIOD = 12;
export const RAIN_HEIGHT = 17;
export const INITIAL_PHASE = 4.2;
export const INITIAL_RAIN = 55;
export const RAIN_SEED = 370219;
export const RAIN_BUDGET = { desktop: 1500, mobile: 640 } as const;

export type ViewId = 'street' | 'arcade' | 'rooftop';

interface ViewPreset {
  id: ViewId;
  label: string;
  number: string;
  location: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const VIEWS: readonly ViewPreset[] = [
  { id: 'street', label: 'Street', number: '01', location: 'Cinema crossing', position: [1.2, 3.8, 18], target: [-0.7, 2.8, -16] },
  { id: 'arcade', label: 'Arcade', number: '02', location: 'Under the Moth marquee', position: [2.1, 2.7, 5.8], target: [-5.2, 2.0, -3] },
  { id: 'rooftop', label: 'Rooftop', number: '03', location: 'Above the last tram', position: [1.6, 12, 10], target: [-0.2, 4, -23] },
];

export interface Shopfront {
  name: string;
  detail: string;
  blade: string[];
  side: -1 | 1;
  z: number;
  color: string;
  number: string;
  note: string;
}

export const SHOPS: readonly Shopfront[] = [
  { name: 'MOTH', detail: 'PICTURES · LAST SHOW 02:10', blade: ['M', 'O', 'T', 'H'], side: -1, z: 0, color: '#ffb871', number: '01', note: 'One more film before the first tram.' },
  { name: 'AFTER HOURS', detail: 'NOODLES / COUNTER OPEN', blade: ['AFTER', 'HOURS', '24'], side: 1, z: -5, color: '#ff5fa9', number: '02', note: 'Broth, steamed windows, nowhere to hurry.' },
  { name: 'LOOP', detail: 'LAUNDRY · WASH / WAIT / REPEAT', blade: ['L', 'O', 'O', 'P'], side: -1, z: -15, color: '#54eed7', number: '03', note: 'The dryers turn until the sky changes.' },
  { name: 'KITE RADIO', detail: 'LOCAL TRANSMISSIONS / 88.3', blade: ['KITE', '88.3'], side: 1, z: -21, color: '#a9bcff', number: '04', note: 'An imaginary frequency for night people.' },
  { name: 'SOFT PARTS', detail: 'REPAIRS FOR SMALL MACHINES', blade: ['SOFT', 'PARTS'], side: -1, z: -31, color: '#cbf27b', number: '05', note: 'Everything deserves another evening.' },
  { name: 'NIGHT JAR', detail: 'FLOWERS / NOT YET MORNING', blade: ['NIGHT', 'JAR'], side: 1, z: -37, color: '#ff927e', number: '06', note: 'Flowers for the long way home.' },
];

export interface RainDrop {
  x: number;
  z: number;
  height: number;
  cycles: number;
  length: number;
}

/** A fixed seed makes the first paused frame as populated as an animated one. */
export function createRainDrops(count: number): RainDrop[] {
  const next = random(RAIN_SEED);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => ({
    x: (next() - 0.5) * 10.5,
    z: 14 - next() * 64,
    height: next(),
    cycles: 3 + Math.floor(next() * 3),
    length: 0.65 + next() * 0.75,
  }));
}

export function rainPhase(phase: number): number {
  return ((phase % RAIN_PERIOD) + RAIN_PERIOD) % RAIN_PERIOD;
}

/** Integer fall cycles make phase 0 and phase 12 exactly the same volume. */
export function rainHeightAt(drop: RainDrop, phase: number): number {
  const fraction = drop.height - (rainPhase(phase) / RAIN_PERIOD) * drop.cycles;
  return 0.18 + (fraction - Math.floor(fraction)) * RAIN_HEIGHT;
}

export function rainCount(intensity: number, budget: number): number {
  return Math.round(clamp(intensity, 0, 100) / 100 * budget);
}
