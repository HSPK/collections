import type { AssemblyBranch, CouplerLocation, LinkLengths } from './engine';

export interface LinkagePreset {
  id: string;
  number: string;
  name: string;
  family: string;
  lengths: LinkLengths;
  coupler: CouplerLocation;
  branch: AssemblyBranch;
  angle: number;
  observation: string;
  experiment: string;
  highlight?: { start: number; end: number };
}

export const presets: readonly LinkagePreset[] = [
  {
    id: 'crank-rocker', number: '01', name: 'The wandering loop', family: 'Crank–rocker',
    lengths: { a: 1.2, b: 3.6, c: 2.6, d: 4 },
    coupler: { fraction: 0.55, offset: 0.85 }, branch: 'plus', angle: 55,
    observation: 'One link keeps turning; another changes its mind. The short input crank makes a full revolution while the output rocks between two limits. P belongs to the moving coupler, so its path is neither of those circles.',
    experiment: 'Move P away from the coupler with the offset control. The links keep exactly the same motion, but the orange curve changes character.',
  },
  {
    id: 'double-crank', number: '02', name: 'Two continuous turns', family: 'Double crank',
    lengths: { a: 2.8, b: 3.4, c: 2.7, d: 1.8 },
    coupler: { fraction: 0.55, offset: 0.55 }, branch: 'plus', angle: 115,
    observation: 'Here the shortest link is the fixed ground. Both links attached to it can turn all the way around. This Grashof inversion is also called a drag-link mechanism; the output does not turn at a uniform angular speed.',
    experiment: 'Compare the − assembly, then make ground d longer. Watch the live classification rather than assuming every Grashof linkage is a crank–rocker.',
  },
  {
    id: 'chebyshev', number: '03', name: 'Almost a straight line', family: 'Chebyshev study',
    lengths: { a: 2.5, b: 1, c: 2.5, d: 2 },
    coupler: { fraction: 0.5, offset: 0 }, branch: 'plus', angle: 78,
    observation: 'The classic Chebyshev proportions are ground 2, equal side links 2.5, and coupler 1. Its midpoint traces a curve with a useful, approximately straight portion. The bold orange segment is solved geometry—not a line substituted for the path.',
    experiment: 'Scrub from 65° to 95°. The point appears to travel almost horizontally, but its deviation is measurable. These are rocking input arcs: a complete input revolution is impossible.',
    highlight: { start: 65, end: 95 },
  },
  {
    id: 'double-rocker', number: '04', name: 'A turn out of reach', family: 'Non-Grashof rockers',
    lengths: { a: 2.8, b: 2.8, c: 2.4, d: 4 },
    coupler: { fraction: 0.5, offset: 0.7 }, branch: 'plus', angle: 45,
    observation: 'The longest and shortest links now outweigh the other pair. Neither grounded link can revolve fully. At the end of an allowed arc, the closure circles touch; past that dead center, a pose simply does not exist.',
    experiment: 'Press Play and let the linkage reach its boundary. It stops instead of jumping to another arc. Scrub into the blank region to inspect an explicitly unreachable input.',
  },
  {
    id: 'change-point', number: '05', name: 'On the dividing line', family: 'Change-point equality',
    lengths: { a: 1, b: 3, c: 1, d: 3 },
    coupler: { fraction: 0.5, offset: 0.5 }, branch: 'plus', angle: 45,
    observation: 'At the Grashof equality, s + l = p + q, the mechanism can become collinear. Two assembly solutions then meet. A geometric drawing cannot tell you which continuation a physical linkage will take without extra constraints.',
    experiment: 'Inspect 0° and 180°, then compare the assemblies. The signed circle-intersection rule stays fixed; it never guesses a branch from the preceding frame.',
  },
];

export const linkFields = [
  { key: 'd', name: 'Ground', joints: 'A–D', hint: 'The fixed spacing' },
  { key: 'a', name: 'Input', joints: 'A–B', hint: 'The driven link' },
  { key: 'b', name: 'Coupler', joints: 'B–C', hint: 'Carries point P' },
  { key: 'c', name: 'Output', joints: 'C–D', hint: 'The following link' },
] as const;

export const methodNotes = [
  {
    number: '01', title: 'Fix two pins.',
    text: 'Place A at (0, 0) and D at (d, 0). The input pin is B = (a cos θ, a sin θ). All lengths use the same arbitrary unit; the vertical axis points up.',
  },
  {
    number: '02', title: 'Intersect two circles.',
    text: 'C lies on the circle centered at B with radius b, and the circle centered at D with radius c. The + assembly is left of the directed line B → D; the − assembly is right of it. These signs do not mean “above” and “below” the page.',
  },
  {
    number: '03', title: 'Carry a point along.',
    text: 'P = B + f(C − B) + o n, where n is the left unit normal to B → C. Fraction f = 0 is B and f = 1 is C. Offset o is measured in model units, not as a fraction of the link length.',
  },
  {
    number: '04', title: 'Keep the missing pieces.',
    text: 'A pose exists when |b − c| ≤ |BD| ≤ b + c. Each reachable angular interval is sampled separately, including its exact endpoints. No line is drawn across an unreachable arc or a nonunique coincident-circle pose.',
  },
] as const;
