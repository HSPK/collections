export type PresetId = 'cradle' | 'binary' | 'shell';
export type Point3 = readonly [number, number, number];

export interface NurseryPreset {
  id: PresetId;
  number: string;
  name: string;
  shape: string;
  title: string;
  caption: string;
  note: string;
  formation: number;
  wind: number;
  anchors: readonly Point3[];
  palette: readonly [string, string, string];
}

export const DEFAULT_SEED = 41073;

export const PRESETS: readonly NurseryPreset[] = [
  {
    id: 'cradle',
    number: '01',
    name: 'Cradle cloud',
    shape: 'A branching molecular cloud',
    title: 'The quiet before the light.',
    caption: 'Two banks of luminous dust gather around a dark, winding seam.',
    note: 'A long, folded cloud with several embedded knots. Raise formation to draw the loose material toward these separate stellar seeds.',
    formation: 0.34,
    wind: 0.18,
    anchors: [
      [-2.65, -1.05, -0.2],
      [-1.55, -0.15, 0.48],
      [-0.42, -0.48, 0.12],
      [0.48, 0.67, -0.32],
      [1.64, 0.69, 0.38],
      [2.55, 1.39, -0.18],
    ],
    palette: ['#617e9c', '#ba8869', '#b1a0c1'],
  },
  {
    id: 'binary',
    number: '02',
    name: 'Twin seeds',
    shape: 'Two clouds, one delicate bridge',
    title: 'A conversation in dust.',
    caption: 'Two deep reservoirs face one another across a filament of suspended matter.',
    note: 'Two rounded, offset reservoirs share a narrow bridge. Their depth and separate centers become clearer as you orbit the view.',
    formation: 0.42,
    wind: 0.24,
    anchors: [
      [-1.65, -0.34, 0.55],
      [1.65, 0.34, -0.55],
      [-2.02, 0.32, -0.12],
      [1.94, -0.29, 0.05],
    ],
    palette: ['#6989a1', '#c49970', '#a091b4'],
  },
  {
    id: 'shell',
    number: '03',
    name: 'Open shell',
    shape: 'A hollow, wind-stretched envelope',
    title: 'Light makes room.',
    caption: 'A hollow envelope opens into space; its far wall glimmers through the near one.',
    note: 'Material begins on a three-dimensional, uneven shell rather than a flat ring. Stellar wind opens the envelope; formation gathers it into new knots.',
    formation: 0.12,
    wind: 0.54,
    anchors: [
      [-1.98, 0.62, 0.18],
      [1.75, -0.54, 0.6],
      [0.52, 1.43, -0.72],
      [-0.47, -1.45, -0.46],
      [0.08, 0.12, 0.14],
    ],
    palette: ['#678b9c', '#c69c78', '#9a8aac'],
  },
];

export function getPreset(id: PresetId): NurseryPreset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]!;
}

export function formationLabel(value: number): string {
  if (value < 0.3) return 'Suspended';
  if (value < 0.7) return 'Gathering';
  return 'Condensing';
}

export function windLabel(value: number): string {
  if (value < 0.3) return 'Still air';
  if (value < 0.7) return 'Outward breath';
  return 'Wide dispersal';
}
