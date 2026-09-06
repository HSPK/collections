export const PALETTE = {
  paper: '#f4efe3',
  ink: '#294638',
  forest: '#427353',
  leaf: '#79a064',
  mint: '#b4bc80',
  salmon: '#d68b72',
  clay: '#b96249',
  mustard: '#d7b65b',
  wheat: '#ecd292',
  sea: '#6e9fa9',
  deepSea: '#538895',
  foam: '#c8ddd8',
  snow: '#fff6df',
  stone: '#a8b7ad',
} as const;

export interface AtlasPoint {
  latitude: number;
  longitude: number;
}

export const LANDMARKS = [
  {
    id: 'mossfold',
    number: '01',
    name: 'Mossfold Orchard',
    biome: 'The green folds',
    latitude: 24,
    longitude: -42,
    color: PALETTE.forest,
    note: 'Every tree here was planted for a future picnic. The orchard keeper leaves one red apple on each branch for the paper birds.',
    find: 'Look for the little ladder, the red fruit, and a path that refuses to go in a straight line.',
    specimen: 'Pressed leaf · a generous sort of green',
  },
  {
    id: 'windmill',
    number: '02',
    name: 'Saffron Windmill',
    biome: 'The patchwork fields',
    latitude: -14,
    longitude: -26,
    color: PALETTE.mustard,
    note: 'The sails turn leftover breezes into flour. Nobody has quite explained the recipe, but the village bread is exceptionally light.',
    find: 'Four linen sails, striped wheat plots, and a tiny footbridge over the blue seam.',
    specimen: 'Wheat stem · collected on a breezy afternoon',
  },
  {
    id: 'quay',
    number: '03',
    name: 'Marmalade Quay',
    biome: 'The folded coast',
    latitude: -28,
    longitude: 22,
    color: PALETTE.salmon,
    note: 'Five crooked roofs keep the harbor company. At dusk, the windows glow and the last little boat brings home nothing but stories.',
    find: 'Salmon rooftops, a timber jetty, and a cream sail waiting just beyond the shore.',
    specimen: 'A postcard · no forwarding address',
  },
  {
    id: 'lighthouse',
    number: '04',
    name: 'Little Wick Light',
    biome: 'The blue margins',
    latitude: 2,
    longitude: 64,
    color: PALETTE.deepSea,
    note: 'A striped lighthouse stands on a scrap of island. Its light is for the clouds, who are forever misplacing the way home.',
    find: 'Three red bands, a mustard lantern, and stepping-stones almost lost to the sea.',
    specimen: 'Sea glass · the color of a quiet morning',
  },
  {
    id: 'peaks',
    number: '05',
    name: 'Ruffleback Peaks',
    biome: 'The cream-paper highlands',
    latitude: 60,
    longitude: 2,
    color: PALETTE.stone,
    note: 'The mountains are the creases the maker forgot to flatten. Snow gathers in their pleats, softening every sharp opinion.',
    find: 'Three folded summits, a blue tarn, and a solitary hut with a warm red roof.',
    specimen: 'A snowflake · carefully imagined, never measured',
  },
  {
    id: 'observatory',
    number: '06',
    name: 'Folded Sky Observatory',
    biome: 'The terracotta canyons',
    latitude: 27,
    longitude: 30,
    color: PALETTE.clay,
    note: 'Above the cinnamon cliffs, a brass telescope studies the undersides of passing clouds. The astronomer calls this a very local universe.',
    find: 'A green dome, a tilted telescope, and layer-cake cliffs beside a narrow canyon.',
    specimen: 'Ochre dust · from the edge of the notebook',
  },
] as const;

export type Landmark = (typeof LANDMARKS)[number];
export type LandmarkId = Landmark['id'];
export const BREEZE_SECONDS = 24;
export const INITIAL_PHASE = 18;

/** Local +Y is always outward; longitude zero faces +Z. All coordinates are invented. */
export function radialDirection(point: AtlasPoint): [number, number, number] {
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;
  return [
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ];
}

export function getLandmark(id: LandmarkId): Landmark {
  const landmark = LANDMARKS.find((item) => item.id === id);
  if (!landmark) throw new Error(`Unknown paper landmark: ${id}`);
  return landmark;
}
