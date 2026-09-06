export type MineralId = 'opal' | 'cyan' | 'amber';
export type ViewId = 'pool' | 'passage' | 'grove';

export interface CavernView {
  id: ViewId;
  label: string;
  number: string;
  camera: [number, number, number];
  target: [number, number, number];
  caption: string;
}

export const VIEWS: CavernView[] = [
  {
    id: 'pool', label: "Pool’s edge", number: '01',
    camera: [0.8, 3.6, 13.5], target: [0, 2.7, -5.5],
    caption: 'The shallow basin gathers broken bands of mineral light. Follow the stones toward the far chamber.',
  },
  {
    id: 'passage', label: 'Upper passage', number: '02',
    camera: [-3.6, 6.7, 10.5], target: [0, 2.1, -5.5],
    caption: 'From the raised passage, the flooded floor becomes a map: islands of stone, veins of light.',
  },
  {
    id: 'grove', label: 'Crystal grove', number: '03',
    camera: [3.5, 3.0, 6.4], target: [0.3, 2.7, -8.5],
    caption: 'At the inner grove, six-sided columns taper into uneven crowns. No two silhouettes quite agree.',
  },
];

export const MINERALS: {
  id: MineralId;
  label: string;
  colors: [string, string, string];
  key: string;
  fill: string;
  note: string;
}[] = [
  {
    id: 'opal', label: 'Opal tide',
    colors: ['#69d8cf', '#d8edd0', '#e8aa62'],
    key: '#c8eee0', fill: '#e6b57c',
    note: 'Mint, opal and honey share the chamber. The stillest light reveals the most stone.',
  },
  {
    id: 'cyan', label: 'Glacial cyan',
    colors: ['#44cddf', '#afeee5', '#b8b99a'],
    key: '#9cdce9', fill: '#9dcbbd',
    note: 'A colder reading: blue-green facets and long silver traces across the water.',
  },
  {
    id: 'amber', label: 'Amber seam',
    colors: ['#a6d0b7', '#f0dcac', '#f2a154'],
    key: '#f0cf9b', fill: '#efa061',
    note: 'Warm seams rise out of the teal shadows. The cave stays legible as the minerals change.',
  },
];

export interface CrystalCluster {
  x: number;
  z: number;
  height: number;
  mineral: 0 | 1 | 2;
  count: number;
}

export const CLUSTERS: CrystalCluster[] = [
  { x: -3.5, z: -9.3, height: 5.4, mineral: 0, count: 11 },
  { x: 0.1, z: -12.2, height: 4.3, mineral: 1, count: 9 },
  { x: 4.1, z: -8.8, height: 3.8, mineral: 2, count: 10 },
  { x: -5.6, z: -5.5, height: 3.5, mineral: 1, count: 9 },
  { x: 5.5, z: -3.2, height: 3.2, mineral: 0, count: 9 },
  { x: -5.8, z: 0.1, height: 2.5, mineral: 0, count: 8 },
  { x: 4.9, z: 2.8, height: 2.2, mineral: 2, count: 8 },
  { x: -4.9, z: 5.5, height: 2.8, mineral: 2, count: 8 },
  { x: 6.7, z: -12.5, height: 3.1, mineral: 0, count: 7 },
  { x: -6.8, z: -14.1, height: 3.3, mineral: 2, count: 7 },
  { x: 2.7, z: -15.5, height: 2.2, mineral: 0, count: 6 },
  { x: -1.8, z: -16.8, height: 2.0, mineral: 1, count: 6 },
  { x: 6.9, z: 6.6, height: 2.5, mineral: 1, count: 7 },
  { x: -7.1, z: 8.2, height: 3.7, mineral: 0, count: 8 },
  { x: 3.0, z: -4.7, height: 1.0, mineral: 1, count: 5 },
  { x: -2.8, z: -2.0, height: 0.75, mineral: 0, count: 5 },
  { x: 1.8, z: 4.2, height: 0.7, mineral: 1, count: 5 },
  { x: -0.9, z: -7.1, height: 1.0, mineral: 2, count: 5 },
  { x: 5.9, z: -16.5, height: 1.6, mineral: 1, count: 5 },
  { x: -7.4, z: -9.3, height: 1.8, mineral: 0, count: 5 },
  { x: -6.9, z: 3.0, height: 1.2, mineral: 1, count: 5 },
  { x: 6.5, z: -0.7, height: 1.1, mineral: 2, count: 5 },
];

export const DEFAULT_INTENSITY = 85;
export const DEFAULT_MIST = 35;
export const CYCLE_SECONDS = 60;

export function getCavernView(id: string | undefined): CavernView {
  const view = VIEWS.find((item) => item.id === id);
  if (!view) throw new Error(`Unknown cavern viewpoint: ${id}`);
  return view;
}

export function getMineral(id: string) {
  const mineral = MINERALS.find((item) => item.id === id);
  if (!mineral) throw new Error(`Unknown cavern light palette: ${id}`);
  return mineral;
}
