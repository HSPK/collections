import type { Gearset, Member } from './engine';

export interface GearsetModel extends Gearset {
  readonly id: string;
  readonly name: string;
  readonly note: string;
}

export const GEARSETS: readonly GearsetModel[] = [
  {
    id: 'notebook-a', name: 'A · 24 / 18 / 60', sun: 24, planet: 18, ring: 60, planets: 3,
    note: 'The balanced study. A held ring gives 3.5 input turns for one carrier turn.',
  },
  {
    id: 'notebook-b', name: 'B · 24 / 12 / 48', sun: 24, planet: 12, ring: 48, planets: 3,
    note: 'Smaller planets, a different ratio. The same held-ring experiment now reduces 3:1.',
  },
  {
    id: 'notebook-c', name: 'C · 21 / 15 / 51', sun: 21, planet: 15, ring: 51, planets: 3,
    note: 'An odd-tooth study. The ring starts half a tooth pitch from zero to meet the planets correctly.',
  },
];

export interface Experiment {
  readonly id: string;
  readonly name: string;
  readonly grounded: Member;
  readonly driven: Member;
  readonly explanation: string;
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'reduction', name: 'Reduction', grounded: 'ring', driven: 'sun',
    explanation: 'Hold the ring and turn the sun. The planets walk around the stationary ring, carrying a slower output in the same direction.',
  },
  {
    id: 'overdrive', name: 'Overdrive', grounded: 'ring', driven: 'carrier',
    explanation: 'Keep the ring held, but drive the carrier. The sun is now the output: it turns faster, in the same direction.',
  },
  {
    id: 'reverse', name: 'Reverse', grounded: 'carrier', driven: 'sun',
    explanation: 'Hold the carrier so the planet pins cannot orbit. Drive the sun, and the ring turns the other way.',
  },
];

export const MEMBER_LABELS: Readonly<Record<Member, string>> = {
  sun: 'Sun', ring: 'Ring', carrier: 'Carrier',
};

export const SYMBOLS: Readonly<Record<Member, string>> = {
  sun: 'ωₛ', ring: 'ωᵣ', carrier: 'ω꜀',
};

export const DEFAULT_SPEED = 0.15;
export const DURATION = 20;
export const STEP = 0.1;

export const NOTES = [
  {
    number: '01',
    title: 'One member stays put.',
    text: 'A simple planetary set has two independent motions. Grounding one member removes a degree of freedom; choosing an input then determines the third member. “Ground” means held at zero angular speed.',
  },
  {
    number: '02',
    title: 'The carrier is a moving reference.',
    text: 'The arms are not another toothed gear. They locate the three planet pins. Subtract carrier speed from sun and ring speed, and the familiar fixed-axis gear relationship reappears.',
  },
  {
    number: '03',
    title: 'Orbit is not spin.',
    text: 'A planet travels around the sun with the carrier while rotating about its own pin. Its orange index mark tracks absolute spin; the green arms track orbit. These can turn in opposite directions.',
  },
] as const;
