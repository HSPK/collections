import { clamp, lerp } from '../../core/math';
import type { Landscape, Tree } from './data';

const TAU = Math.PI * 2;

export function yearTime(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('The year position must be finite.');
  return (Math.round((value - Math.floor(value)) * 1e9) / 1e9) % 1;
}

export function smooth(start: number, end: number, value: number): number {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mixColor(from: string, to: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => Math.round(lerp(
    Number.parseInt(from.slice(offset, offset + 2), 16),
    Number.parseInt(to.slice(offset, offset + 2), 16),
    clamp(amount, 0, 1),
  )).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
}

export const phases = [
  { at: 0, season: 'Winter', name: 'Snowlight', note: 'The crown is bare. Snow rests on the same branches that will carry the next green canopy.' },
  { at: 0.1, season: 'Spring', name: 'The slow thaw', note: 'Snow recedes from the hills and branch tops before the first leaves begin to unfold.' },
  { at: 0.175, season: 'Spring', name: 'First green', note: 'Small leaves grow in place along a fixed crown. Flowers arrive as the last snow disappears.' },
  { at: 0.235, season: 'Spring', name: 'Blossom days', note: 'Flowers overlap the young leaves, then fade as the green canopy fills out. Nothing is replaced all at once.' },
  { at: 0.34, season: 'Summer', name: 'A green hush', note: 'The full crown holds its shape. Light, river ripples, and leaf flutter all follow this one year position.' },
  { at: 0.6, season: 'Autumn', name: 'Turning gold', note: 'Leaves warm from green to gold at slightly different moments. The branches underneath never change shape.' },
  { at: 0.7, season: 'Autumn', name: 'Letting go', note: 'Each leaf has its own release time and curved journey to the ground. Scrub backward and it retraces that journey.' },
  { at: 0.86, season: 'Winter', name: 'The first snow', note: 'The last leaves settle and fade under returning snow. The open crown makes the tree’s structure visible again.' },
  { at: 0.96, season: 'Winter', name: 'Snowlight', note: 'The crown is bare. Snow rests on the same branches that will carry the next green canopy.' },
] as const;

export function windAt(time: number, exposure = 1, offset = 0): number {
  const t = yearTime(time);
  return exposure * (
    Math.sin(TAU * (t * 11 + offset)) * 0.62
    + Math.sin(TAU * (t * 23 + offset * 2)) * 0.26
    + Math.sin(TAU * (t * 3 + 0.17)) * 0.12
  );
}

export function sampleYear(time: number, landscape: Landscape) {
  const t = yearTime(time);
  const phase = [...phases].reverse().find((item) => t >= item.at)!;
  const snow = 1 - smooth(0.09, 0.23, t) + smooth(0.85, 0.97, t);
  const growth = smooth(landscape.leafOut, landscape.leafOut + 0.09, t);
  const canopy = growth * (1 - smooth(landscape.fallStart, landscape.fallStart + landscape.fallSpread, t));
  const blossom = smooth(landscape.flowerAt - 0.025, landscape.flowerAt + 0.025, t)
    * (1 - smooth(landscape.flowerAt + 0.065, landscape.flowerAt + 0.12, t));
  const gold = smooth(0.56, 0.78, t);
  const summer = smooth(0.28, 0.46, t);
  const warmth = (1 - Math.cos(TAU * t)) / 2;
  const seasonalColor = (spring: string, full: string, autumn: string, winter: string) =>
    mixColor(mixColor(mixColor(spring, full, summer), autumn, gold), winter, snow);
  return {
    time: t,
    phase,
    snow,
    growth,
    canopy,
    blossom,
    gold,
    warmth,
    fruit: landscape.terrain === 'orchard'
      ? smooth(0.44, 0.53, t) * (1 - smooth(0.65, 0.73, t))
      : 0,
    wind: windAt(t, landscape.wind),
    sky: seasonalColor('#e5efda', '#dcebd6', '#eee4d1', '#dce7e7'),
    horizon: seasonalColor('#f4eed0', '#f2edce', '#f4ddba', '#edf0e6'),
    distant: seasonalColor('#b8d1b6', '#a4c4ab', '#ccbe93', '#b5c9c9'),
    middle: seasonalColor('#93b78f', '#85aa80', '#b5ad77', '#ccd9cc'),
    ground: seasonalColor('#c1cf8e', '#aec77d', '#d8bd82', '#e8ecdd'),
    grass: seasonalColor('#6e9563', '#618958', '#9a854a', '#869c8e'),
    water: seasonalColor('#a9cfcb', '#91beba', '#b9c8b8', '#c4dbda'),
    leaf: mixColor(mixColor(landscape.colors.young, landscape.colors.leaf, summer), landscape.colors.gold, gold),
    sunX: 216 + Math.sin(TAU * t) * 46,
    sunY: 161 - warmth * 50,
    sunRadius: 35 + warmth * 10,
    shadow: 0.12 + warmth * 0.12,
  };
}

export type YearFrame = ReturnType<typeof sampleYear>;

export interface Leaf {
  readonly id: number;
  readonly treeIndex: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly angle: number;
  readonly phase: number;
  readonly shade: number;
  readonly birth: number;
  readonly release: number;
  readonly duration: number;
  readonly drift: number;
  readonly ground: number;
}

function fraction(seed: number): number {
  let value = Math.imul(seed ^ 0x45d9f3b, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function makeLeaves(landscape: Landscape, tree: Tree, treeIndex: number): readonly Leaf[] {
  return tree.crowns.flatMap((crown, crownIndex) => Array.from({ length: tree.leavesPerCrown }, (_, index) => {
    const id = treeIndex * 1000 + crownIndex * tree.leavesPerCrown + index;
    const seed = landscape.seed + id * 37;
    const angle = index * 2.399963 + fraction(seed) * 0.5;
    const radius = Math.sqrt((index + 0.6) / tree.leavesPerCrown);
    return {
      id,
      treeIndex,
      x: crown.x + Math.cos(angle) * crown.rx * radius,
      y: crown.y + Math.sin(angle) * crown.ry * radius,
      size: 7 + fraction(seed + 1) * 6,
      angle: landscape.leafShape === 'lance' ? 64 + fraction(seed + 2) * 62 : angle * 180 / Math.PI,
      phase: fraction(seed + 3),
      shade: fraction(seed + 4),
      birth: landscape.leafOut + fraction(seed + 5) * 0.045,
      release: landscape.fallStart + fraction(seed + 6) * landscape.fallSpread,
      duration: 0.045 + fraction(seed + 7) * 0.045,
      drift: 25 + fraction(seed + 8) * 115,
      ground: 4 + fraction(seed + 9) * 32,
    };
  }));
}

export function branchAngle(time: number, landscape: Landscape, treeIndex: number): number {
  return windAt(time, landscape.wind, treeIndex * 0.17) * 0.85;
}

function attachedPose(leaf: Leaf, time: number, landscape: Landscape) {
  const sway = branchAngle(time, landscape, leaf.treeIndex);
  const radians = sway * Math.PI / 180;
  const flutter = Math.sin(TAU * (yearTime(time) * 29 + leaf.phase));
  return {
    x: leaf.x * Math.cos(radians) - leaf.y * Math.sin(radians) + flutter * landscape.wind * 1.6,
    y: leaf.x * Math.sin(radians) + leaf.y * Math.cos(radians),
    angle: leaf.angle + sway + flutter * 12 * landscape.wind,
  };
}

export function sampleLeaf(leaf: Leaf, time: number, landscape: Landscape) {
  const t = yearTime(time);
  const growth = smooth(leaf.birth, leaf.birth + 0.065, t);
  const release = yearTime(leaf.release);
  const landing = yearTime(leaf.release + leaf.duration);
  const fall = t >= landing ? 1 : clamp((t - release) / (landing - release), 0, 1);
  const attached = t < release;
  const origin = attachedPose(leaf, attached ? t : leaf.release, landscape);
  // Release is evaluated at its own time, not at the previous rendered frame.
  const x = origin.x + leaf.drift * fall
    + Math.sin(fall * Math.PI) * Math.sin(fall * Math.PI * 4 + leaf.phase * TAU) * 22;
  const y = fall === 1 ? leaf.ground : lerp(origin.y, leaf.ground, fall * fall);
  const angle = origin.angle + fall * (210 + leaf.phase * 220) + Math.sin(fall * Math.PI * 4) * 18;
  return {
    x, y, angle,
    scale: growth,
    opacity: growth * (1 - smooth(0.9, 0.97, t)),
    attached,
    falling: !attached && fall < 1,
    grounded: !attached && fall === 1,
    fall,
    gold: smooth(0.56 + leaf.phase * 0.05, 0.75 + leaf.phase * 0.03, t),
  };
}
