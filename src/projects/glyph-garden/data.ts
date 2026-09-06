import type { GestureId, GestureTemplate, Point } from './engine';

export const GESTURES: readonly {
  id: GestureId;
  glyph: string;
  name: string;
  action: string;
  description: string;
  instruction: string;
  shortcut: string;
  path: string;
  start: Point;
  color: string;
}[] = [
  {
    id: 'flower', glyph: 'Circle', name: 'Starbells', action: 'Plant a flower',
    description: 'A little color, rooted in your chosen patch.',
    instruction: 'One round, closed loop. Start anywhere.',
    shortcut: 'F', path: 'M 72 44 C 72 9 22 8 20 42 C 17 76 70 80 72 44',
    start: { x: 72, y: 44 }, color: '#a85864',
  },
  {
    id: 'tree', glyph: 'Chevron', name: 'Ribbonwood', action: 'Grow a tree',
    description: 'An upward wish becomes a leafy little tree.',
    instruction: 'Up to a point, then down. Either direction.',
    shortcut: 'T', path: 'M 17 71 L 46 14 L 77 71',
    start: { x: 17, y: 71 }, color: '#426e50',
  },
  {
    id: 'wind', glyph: 'Zigzag', name: 'A wandering breeze', action: 'Call a breeze',
    description: 'Turn the air: still, gentle, lively, then still.',
    instruction: 'Down, up, down. Three connected strokes.',
    shortcut: 'W', path: 'M 9 18 L 34 69 L 59 18 L 84 69',
    start: { x: 9, y: 18 }, color: '#486f80',
  },
];

const circle = (rx: number, ry: number): Point[] => Array.from({ length: 65 }, (_, index) => ({
  x: 50 + Math.cos(index / 64 * Math.PI * 2) * rx,
  y: 50 + Math.sin(index / 64 * Math.PI * 2) * ry,
}));

export const GESTURE_TEMPLATES: readonly GestureTemplate[] = [
  { id: 'flower', closed: true, points: circle(45, 45) },
  { id: 'flower', closed: true, points: circle(39, 47) },
  { id: 'flower', closed: true, points: circle(47, 39) },
  { id: 'tree', points: [{ x: 17, y: 71 }, { x: 46, y: 14 }, { x: 77, y: 71 }] },
  { id: 'tree', points: [{ x: 8, y: 70 }, { x: 48, y: 20 }, { x: 88, y: 70 }] },
  { id: 'wind', points: [{ x: 9, y: 18 }, { x: 34, y: 69 }, { x: 59, y: 18 }, { x: 84, y: 69 }] },
  { id: 'wind', points: [{ x: 5, y: 28 }, { x: 35, y: 67 }, { x: 65, y: 28 }, { x: 95, y: 67 }] },
];

export const BEDS = [
  { id: 'fern', name: 'Fern corner', x: 0.20, y: 0.82, color: '#426e50' },
  { id: 'sun', name: 'Sun pocket', x: 0.47, y: 0.90, color: '#a06c2d' },
  { id: 'pond', name: 'Pond bank', x: 0.81, y: 0.87, color: '#486f80' },
] as const;

export type BedId = typeof BEDS[number]['id'];
export type PlantKind = 'flower' | 'tree';
export interface Plant {
  id: number;
  kind: PlantKind;
  bed: BedId;
  slot: number;
  variant: number;
}
export interface GardenState {
  plants: Plant[];
  breeze: number;
  nextId: number;
}

export const BED_CAPACITY = 10;
export const HISTORY_LIMIT = 32;
export const BREEZES = ['Still air', 'Gentle breeze', 'Lively breeze'] as const;
export const PLANT_OFFSETS: readonly Point[] = [
  { x: -0.055, y: -0.020 }, { x: 0.008, y: 0.005 },
  { x: 0.062, y: -0.025 }, { x: -0.025, y: -0.085 },
  { x: 0.038, y: -0.073 }, { x: -0.076, y: -0.075 },
  { x: 0.080, y: -0.085 }, { x: -0.045, y: 0.020 },
  { x: 0.055, y: 0.012 }, { x: -0.005, y: -0.040 },
];

export function initialGarden(): GardenState {
  return {
    breeze: 1,
    nextId: 10,
    plants: BEDS.flatMap((bed, bedIndex) => [0, 1, 2].map((slot) => ({
      id: bedIndex * 3 + slot + 1,
      kind: slot === 0 && bedIndex !== 1 ? 'tree' as const : 'flower' as const,
      bed: bed.id,
      slot,
      variant: bedIndex * 3 + slot,
    }))),
  };
}

export function copyGarden(state: GardenState): GardenState {
  return { ...state, plants: state.plants.map((plant) => ({ ...plant })) };
}
