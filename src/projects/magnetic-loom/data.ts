import type { Magnet } from './field';

export const BED = { width: 1_000, height: 760, inset: 28 } as const;
export const FILING_COUNT = 4_500;
export const SEED = 45_071;
export const MAGNET_MARGIN = 126;

export const DEFAULT_MAGNETS: readonly Magnet[] = [
  { id: 'A', x: 325, y: 407, angle: -28 * Math.PI / 180, polarity: 1 },
  { id: 'B', x: 675, y: 345, angle: 24 * Math.PI / 180, polarity: 1 },
];

export const PALETTE = {
  paper: '#f1efe5',
  grid: '#b9beae',
  north: '#b64e42',
  south: '#426f77',
  filings: ['#39443e', '#535d52', '#737c6d', '#989d8c'],
} as const;

export const NOTES = [
  {
    number: '01',
    title: 'A field, made visible.',
    text: 'Each little sliver turns along the combined field of both magnets. Move one, and the entire pattern is quietly redrawn.',
  },
  {
    number: '02',
    title: 'Two poles. Many possibilities.',
    text: 'Red is north; blue is south. Flip one magnet to turn a bridge into a divide. A filing has no painted end, so flipping both magnets would preserve its alignment.',
  },
  {
    number: '03',
    title: 'An illustration, not a lab.',
    text: 'The field is a softened north–south pole approximation. Gentle springs and seeded micro-chains suggest dry iron filings; they are not a laboratory simulation or a magnetic-force measurement.',
  },
] as const;
