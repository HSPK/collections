export const COLONY_IDS = ['moss', 'lichen', 'coral'] as const;
export type ColonyId = typeof COLONY_IDS[number];
export const ACTIONS = ['forage', 'spread', 'share', 'defend'] as const;
export type ActionKind = typeof ACTIONS[number];
export const EDITS = ['water', 'compost', 'shelter', 'seedbank', 'channel', 'bridge'] as const;
export type EditKind = typeof EDITS[number];

export const COLONIES = {
  moss: { name: 'Velvet moss', short: 'Moss', color: '#526e3c', pale: '#abb979',
    objective: 'Expansion: seek new wet patches and win space, but do not extinguish a neighbor.',
    q: -1, r: 0 },
  lichen: { name: 'Lantern lichen', short: 'Lichen', color: '#a67b25', pale: '#e7c66b',
    objective: 'Cooperation: forage common soil and share surplus with the hungriest reachable neighbor.',
    q: 1, r: -1 },
  coral: { name: 'Paper coral', short: 'Coral', color: '#b95645', pale: '#e6a38a',
    objective: 'Conservation: defend established patches, preserve reserves, and expand only into viable soil.',
    q: 0, r: 1 },
} satisfies Record<ColonyId, { name: string; short: string; color: string; pale: string; objective: string; q: number; r: number }>;

export const SEASONS = [
  { chapter: 'I', biome: 'Dew nursery', name: 'First waking', rain: 1, drought: 1,
    hint: 'Shelter the founders. Forage replenishes stores; spread buys a new patch for 2 nutrients.' },
  { chapter: 'I', biome: 'Dew nursery', name: 'Rootward', rain: 1, drought: 1,
    hint: 'New patches need protection too. Six living patches are needed for the final seed archive.' },
  { chapter: 'II', biome: 'Glass drought', name: 'The thin water', rain: 0, drought: 2,
    hint: 'Shelters prevent 2 dryness. Defend prevents 1 dryness per effort, on one patch.' },
  { chapter: 'II', biome: 'Glass drought', name: 'Common ground', rain: 0, drought: 2,
    hint: 'Soil is finite. Channels move water and nutrients; bridges let distant neighbors share.' },
  { chapter: 'III', biome: 'Ember bloom', name: 'Red noon', rain: 0, drought: 3,
    hint: 'The harshest season. Water, seedbanks, and precise defense can save a fading colony.' },
  { chapter: 'III', biome: 'Ember bloom', name: 'The carrying rain', rain: 1, drought: 2,
    hint: 'One last rain. Keep all three lineages alive and fill the spore archive.' },
] as const;

export const GOAL = { spores: 18, each: 3, patches: 6 };
export const ENERGY = 3;
export const MAX_EDITS = 3;
export const EDIT_LABELS: Record<EditKind, string> = {
  water: 'Water +3 / 3 water',
  compost: 'Compost +3 / 3 compost',
  shelter: 'Shelter / 2 tools',
  seedbank: 'Seedbank / 2 tools',
  channel: 'Route to neighbor / 2 tools',
  bridge: 'Symbiosis bridge / 2 tools',
};

export interface Position { q: number; r: number }
export function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
}
