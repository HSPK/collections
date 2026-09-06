import type { Stroke } from './engine';

export interface StrokeNote {
  id: Stroke;
  name: string;
  shortName: string;
  action: string;
  detail: string;
  color: string;
  seek: number;
}

export const strokes: StrokeNote[] = [
  {
    id: 'intake', name: 'Intake', shortName: 'Intake',
    action: 'Make room for the next charge.',
    detail: 'The piston descends with the intake valve open. Blue arrows indicate incoming gas, not a calculated flow rate. The exhaust valve stays seated.',
    color: '#62c9db', seek: 90,
  },
  {
    id: 'compression', name: 'Compression', shortName: 'Compress',
    action: 'Same path. A smaller space.',
    detail: 'Both valves are closed as the piston rises. The trapped volume shrinks. There is no pressure or temperature simulation behind the chamber color.',
    color: '#dec78d', seek: 270,
  },
  {
    id: 'power', name: 'Power', shortName: 'Power',
    action: 'Expansion takes its turn.',
    detail: 'An idealized heat-addition cue appears at 360 degrees. Both valves remain closed on the downward stroke. Here the clock prescribes motion; gas forces do not drive the animation.',
    color: '#ff9067', seek: 450,
  },
  {
    id: 'exhaust', name: 'Exhaust', shortName: 'Exhaust',
    action: 'Clear the cylinder. Begin again.',
    detail: 'The piston rises with the exhaust valve open. Amber arrows indicate outgoing gas. At 720 degrees it reaches the top again: two crank turns, one complete cycle.',
    color: '#e5ae72', seek: 630,
  },
];

export const geometryStudies = [
  { ratio: 2.2, label: 'Short rod', note: 'More rod tilt; more departure from a sinusoidal piston path.' },
  { ratio: 3.4, label: 'Middle ground', note: 'A clear view of the offset between crank rotation and piston travel.' },
  { ratio: 5, label: 'Long rod', note: 'Less rod tilt; the displacement curve approaches a cosine, but is not exactly one.' },
];
