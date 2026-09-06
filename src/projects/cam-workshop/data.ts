export type LawId = 'harmonic' | 'cycloidal' | 'polynomial';
export type SegmentId = 'rise' | 'high' | 'return' | 'low';

export interface TimingInput {
  rise: number;
  high: number;
  return: number;
}

export interface CamSettings extends TimingInput {
  law: LawId;
  base: number;
  lift: number;
}

export const DEFAULT_SETTINGS: Readonly<CamSettings> = {
  law: 'cycloidal', rise: 100, high: 60, return: 140, base: 1.2, lift: 0.8,
};
export const OPENING_ANGLE = 42;
export const DEFAULT_SPEED = 8;
export const LIMITS = { base: [0.8, 1.8], lift: [0.2, 1.2] } as const;

export const LAWS = [
  {
    id: 'harmonic' as const,
    name: 'Simple harmonic',
    shortName: 'Harmonic',
    color: '#825472',
    formula: '½ [1 − cos(πu)]',
    first: '(π/2) sin(πu)',
    second: '(π²/2) cos(πu)',
    peakFirst: Math.PI / 2,
    peakSecond: Math.PI ** 2 / 2,
    headline: 'A gentle-looking curve can hide a hard edge.',
    description: 'The displacement is half a cosine. Its lower peak angular velocity comes with nonzero acceleration at each end of a moving segment.',
    boundary: 'Acceleration jumps at dwell edges. The idealized jerk contains impulses there; the displacement curve alone does not reveal them.',
    experiment: 'Scrub to the end of the rise. Displacement is smooth, but the acceleration trace has two different one-sided values.',
  },
  {
    id: 'cycloidal' as const,
    name: 'Cycloidal',
    shortName: 'Cycloidal',
    color: '#b9533d',
    formula: 'u − sin(2πu)/(2π)',
    first: '1 − cos(2πu)',
    second: '2π sin(2πu)',
    peakFirst: 2,
    peakSecond: Math.PI * 2,
    headline: 'Meet the dwell with zero acceleration.',
    description: 'A sine correction makes both angular velocity and acceleration vanish at the endpoints. For the same lift and timing, its velocity peak is the highest of these three laws.',
    boundary: 'Endpoint acceleration is zero, but jerk has finite steps into and out of dwells. This is not a zero-jerk law.',
    experiment: 'Compare all three curves, then shorten the rise. Watch the cycloidal velocity peak climb without changing the lift.',
  },
  {
    id: 'polynomial' as const,
    name: '3–4–5 polynomial',
    shortName: '3–4–5',
    color: '#47776a',
    formula: '10u³ − 15u⁴ + 6u⁵',
    first: '30u² − 60u³ + 30u⁴',
    second: '60u − 180u² + 120u³',
    peakFirst: 15 / 8,
    peakSecond: 10 / Math.sqrt(3),
    headline: 'Six endpoint conditions, one polynomial.',
    description: 'Position, angular velocity, and acceleration are prescribed at both ends. A fifth-degree polynomial is just enough to satisfy all six conditions.',
    boundary: 'Like the cycloidal law, acceleration is zero at the endpoints. Jerk still has finite steps at dwell edges, not zero jerk everywhere.',
    experiment: 'Compare the green curve with the cycloidal one. Both reach the same endpoints, but their derivative peaks are different.',
  },
];

export const SEGMENTS = [
  { id: 'rise' as const, name: 'Rise', number: '01', color: '#bc644e', note: 'The knife edge travels outward as the cam’s radius under it increases.' },
  { id: 'high' as const, name: 'High dwell', number: '02', color: '#8b657b', note: 'The follower stays at full lift. The cam continues turning beneath a circular portion of the profile.' },
  { id: 'return' as const, name: 'Return', number: '03', color: '#52796f', note: 'The knife edge travels inward. This is the chosen rise law reversed in displacement, not in the direction of rotation.' },
  { id: 'low' as const, name: 'Low dwell', number: '04', color: '#81736a', note: 'The follower rests on the base circle until the next rise. This is the part of the 360° budget left over.' },
];

export const PRESETS: ReadonlyArray<TimingInput & { id: string; name: string; note: string }> = [
  { id: 'balanced', name: 'Balanced', rise: 100, high: 60, return: 140, note: 'A longer return spreads the inward travel over more angle, reducing its derivative peaks.' },
  { id: 'long-hold', name: 'Long top dwell', rise: 60, high: 120, return: 120, note: 'More time at the top leaves a short rise. Its velocity grows as 1/β and acceleration as 1/β².' },
  { id: 'no-dwells', name: 'No dwells', rise: 180, high: 0, return: 180, note: 'Rise meets return directly. There is no dwell to compare at the join; harmonic acceleration is continuous here when both moving intervals are equal.' },
];

export const LIMITATIONS = [
  'This is a radial, translating knife-edge follower: an ideal point contact on the centerline. There is no roller, roller-radius offset, or flat-faced envelope.',
  'Contact is imposed kinematically. The drawing does not simulate a spring, follower mass, friction, contact force, wear, pressure angle, or loss of contact.',
  'Length is in normalized length units (lu), not a specified material or manufactured size. Curvature, undercutting, stresses, tolerances, and manufacturability are not evaluated.',
  'Use the workshop to understand motion laws, not to size a real mechanism or make safety-critical or manufacturing decisions.',
];
