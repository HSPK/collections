export const BANDS = [125, 250, 500, 1000, 2000, 4000] as const;
export type BandValues = [number, number, number, number, number, number];
export type Point = { x: number; y: number; z: number };
export const WALLS = ['west', 'east', 'south', 'north', 'floor', 'ceiling'] as const;
export type Wall = typeof WALLS[number];
export const WALL_LABELS: Record<Wall, string> = {
  west: 'West wall', east: 'East wall', south: 'South wall',
  north: 'North wall', floor: 'Floor', ceiling: 'Ceiling',
};

export const MATERIALS = {
  plaster: { name: 'Lime plaster', family: 'Mineral', color: '#dcd8c9', absorption: [0.04, 0.04, 0.05, 0.06, 0.07, 0.09] },
  timber: { name: 'Timber lining', family: 'Wood', color: '#bf9b70', absorption: [0.28, 0.22, 0.17, 0.10, 0.09, 0.08] },
  stone: { name: 'Dressed stone', family: 'Mineral', color: '#a6aaa0', absorption: [0.01, 0.01, 0.02, 0.02, 0.02, 0.03] },
  glass: { name: 'Heavy glazing', family: 'Glass', color: '#adc5c1', absorption: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02] },
  carpet: { name: 'Carpet on felt', family: 'Textile', color: '#7a8575', absorption: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] },
  curtain: { name: 'Pleated wool', family: 'Textile', color: '#bd7758', absorption: [0.08, 0.20, 0.45, 0.65, 0.70, 0.70] },
  absorber: { name: '100 mm absorber', family: 'Porous', color: '#466960', absorption: [0.30, 0.65, 0.90, 0.95, 0.95, 0.90] },
} satisfies Record<string, { name: string; family: string; color: string; absorption: BandValues }>;
export type MaterialId = keyof typeof MATERIALS;
export interface Room {
  width: number;
  depth: number;
  height: number;
  source: Point;
  listener: Point;
  materials: Record<Wall, MaterialId>;
  order: number;
}
export interface RoomPreset {
  id: string;
  name: string;
  note: string;
  room: Room;
}
export const PRESETS: RoomPreset[] = [
  {
    id: 'timber', name: 'Timber chamber',
    note: 'A warm-lined room for a small ensemble.',
    room: {
      width: 9.6, depth: 7.2, height: 3.8,
      source: { x: 2.2, y: 2.0, z: 1.25 }, listener: { x: 6.6, y: 4.7, z: 1.2 },
      materials: { west: 'timber', east: 'plaster', south: 'timber', north: 'timber', floor: 'timber', ceiling: 'plaster' }, order: 4,
    },
  },
  {
    id: 'studio', name: 'Dry listening studio',
    note: 'Close listening, porous walls, a soft floor.',
    room: {
      width: 5.4, depth: 4.2, height: 2.8,
      source: { x: 1.4, y: 1.2, z: 1.2 }, listener: { x: 3.6, y: 2.8, z: 1.2 },
      materials: { west: 'absorber', east: 'absorber', south: 'curtain', north: 'absorber', floor: 'carpet', ceiling: 'absorber' }, order: 4,
    },
  },
  {
    id: 'hall', name: 'Stone recital hall',
    note: 'Long travel, hard boundaries, audible early echoes.',
    room: {
      width: 18, depth: 12, height: 7.6,
      source: { x: 4.2, y: 3.1, z: 1.4 }, listener: { x: 12.4, y: 8.6, z: 1.2 },
      materials: { west: 'stone', east: 'stone', south: 'stone', north: 'stone', floor: 'stone', ceiling: 'plaster' }, order: 4,
    },
  },
  {
    id: 'gallery', name: 'Daylight gallery',
    note: 'Glazing meets plaster in a narrow, tall volume.',
    room: {
      width: 6.8, depth: 13.2, height: 5.2,
      source: { x: 1.6, y: 3.2, z: 1.5 }, listener: { x: 4.7, y: 9.1, z: 1.2 },
      materials: { west: 'glass', east: 'plaster', south: 'plaster', north: 'glass', floor: 'stone', ceiling: 'plaster' }, order: 4,
    },
  },
];
export const LIMITS = {
  width: [2, 24], depth: [2, 32], height: [2, 12],
  margin: 0.15, order: 6, paths: 377, candidates: 2197,
} as const;
export function cloneRoom(room: Room): Room {
  return { ...room, source: { ...room.source }, listener: { ...room.listener }, materials: { ...room.materials } };
}
export function isMaterial(value: string): value is MaterialId {
  return Object.hasOwn(MATERIALS, value);
}
export function isWall(value: string): value is Wall {
  return WALLS.some((wall) => wall === value);
}
