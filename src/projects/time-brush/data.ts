export type TimeMode = 'slow' | 'freeze' | 'fast' | 'reverse';
export type MotionFamily = 'orbit' | 'train' | 'wave';

export interface BrushMode {
  id: TimeMode;
  name: string;
  rate: number;
  color: string;
  symbol: string;
  description: string;
}

export const BRUSH_MODES: readonly BrushMode[] = [
  { id: 'slow', name: 'Slow', rate: 0.25, color: '#ffc589', symbol: '¼', description: 'A little more time to notice things.' },
  { id: 'freeze', name: 'Freeze', rate: 0, color: '#9ae8ff', symbol: 'Ⅱ', description: 'Hold a moving thing exactly where it is.' },
  { id: 'fast', name: 'Fast', rate: 3, color: '#e5fc83', symbol: '»', description: 'Give this small corner three times the time.' },
  { id: 'reverse', name: 'Reverse', rate: -1, color: '#f9afe4', symbol: '↶', description: 'Let a local clock count backward.' },
];

export const MODE_BY_ID = Object.fromEntries(BRUSH_MODES.map((mode) => [mode.id, mode])) as Record<TimeMode, BrushMode>;
export const MAX_PATCHES = 64;
export const FIELD_MIN = -1;
export const FIELD_MAX = 3;
export const CORE_RATIO = 0.78;
export const BRUSH_DIAMETER = { min: 12, max: 48, initial: 26 } as const;

export interface ObjectSpec {
  id: string;
  name: string;
  family: MotionFamily;
  track: number;
  index: number;
  phase: number;
  speed: number;
  color: string;
}

const colors = ['#fff8df', '#e5fc83', '#aecbff', '#ffdab8'];
const objects: ObjectSpec[] = [{
  id: 'spindle', name: 'Central spindle', family: 'orbit', track: -1,
  index: 0, phase: 0, speed: 0.6, color: '#e5fc83',
}];

for (let track = 0; track < 3; track++) {
  for (let index = 0; index < 4; index++) {
    const number = track * 4 + index + 1;
    objects.push({
      id: `orbit-${number}`, name: `Orbiter ${String(number).padStart(2, '0')}`,
      family: 'orbit', track, index, phase: index * Math.PI / 2 + track * 0.38 + 0.2,
      speed: [0.64, 0.43, 0.29][track], color: colors[index],
    });
  }
}

for (let index = 0; index < 4; index++) {
  objects.push({
    id: `train-${index + 1}`, name: `Train ${String(index + 1).padStart(2, '0')}`,
    family: 'train', track: 0, index, phase: (0.14 + index * 0.25) * Math.PI * 2,
    speed: 0.34 + index * 0.018, color: colors[index],
  });
}

for (let track = 0; track < 2; track++) {
  for (let index = 0; index < 12; index++) {
    const number = track * 12 + index + 1;
    objects.push({
      id: `wave-${number}`, name: `Wave bead ${String(number).padStart(2, '0')}`,
      family: 'wave', track, index, phase: index * 0.64 + track * 1.7,
      speed: 1.8, color: track === 0 ? '#fff8df' : '#aecbff',
    });
  }
}

export const OBJECTS: readonly ObjectSpec[] = objects;
export const FAMILY_NAMES: Record<MotionFamily, string> = {
  orbit: 'Orbital array', train: 'The circular line', wave: 'Harmonic tides',
};

export interface Discovery {
  id: string;
  title: string;
  description: string;
  target: string;
  mode: TimeMode;
  radius: number;
}

export const DISCOVERIES: readonly Discovery[] = [
  {
    id: 'catch', title: 'Catch an orbiter',
    description: 'Pin one satellite in place. Its neighbours still make their rounds.',
    target: 'orbit-10', mode: 'freeze', radius: 0.13,
  },
  {
    id: 'rewind', title: 'Send a train backward',
    description: 'A small detour into yesterday, with every carriage along for the ride.',
    target: 'train-1', mode: 'reverse', radius: 0.13,
  },
  {
    id: 'rush', title: 'Let the waves race',
    description: 'Hurry a few beads. The once-orderly wave begins to improvise.',
    target: 'wave-17', mode: 'fast', radius: 0.15,
  },
];

export const DEFAULT_WATCH = 'orbit-10';
