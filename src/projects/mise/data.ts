export const STAFF_IDS = ['nell', 'sol', 'ivo'] as const;
export type StaffId = typeof STAFF_IDS[number];
export const STAFF = [
  { id: 'nell', name: 'Nell', role: 'Prep lead', objective: 'Keep the next tickets supplied. Prep takes one beat.', color: '#697448' },
  { id: 'sol', name: 'Sol', role: 'Stove lead', objective: 'Load the hobs without burning food. Cooking earns +4 quality.', color: '#bb4338' },
  { id: 'ivo', name: 'Ivo', role: 'Pass lead', objective: 'Plate and serve before deadlines. Plating takes one beat.', color: '#42666b' },
] as const;
export const INGREDIENTS = ['root', 'leek', 'grain', 'pear', 'cream', 'herb'] as const;
export type Ingredient = typeof INGREDIENTS[number];
export const MODES = ['balanced', 'rush', 'craft'] as const;
export type Mode = typeof MODES[number];
export const LAYOUTS = ['prep', 'pass'] as const;
export type Layout = typeof LAYOUTS[number];
export const STATIONS = ['prep-a', 'prep-b', 'hob-a', 'hob-b', 'pass-a', 'pass-b', 'none'] as const;
export type Station = typeof STATIONS[number];
export const HOBS = ['hob-a', 'hob-b'] as const;
export type Hob = typeof HOBS[number];

export interface ComponentRecipe {
  id: string;
  name: string;
  stock: Partial<Record<Ingredient, number>>;
  heat: number;
  color: string;
}
export interface Recipe {
  id: string;
  name: string;
  short: string;
  components: ComponentRecipe[];
}
export const RECIPES: Record<string, Recipe> = {
  root: {
    id: 'root', name: 'Copper-root & green ribbons', short: 'Copper root',
    components: [
      { id: 'roast', name: 'Copper-root pan', stock: { root: 1, cream: 1 }, heat: 4, color: '#c16c37' },
      { id: 'ribbon', name: 'Green ribbons', stock: { herb: 1 }, heat: 0, color: '#69834b' },
    ],
  },
  leek: {
    id: 'leek', name: 'Velvet leek & grain crumble', short: 'Velvet leek',
    components: [
      { id: 'velvet', name: 'Velvet leek', stock: { leek: 1, cream: 1 }, heat: 4, color: '#9aaa5e' },
      { id: 'crumble', name: 'Grain crumble', stock: { grain: 1 }, heat: 0, color: '#bc924c' },
    ],
  },
  duet: {
    id: 'duet', name: 'Two-pan harvest duet', short: 'Harvest duet',
    components: [
      { id: 'root', name: 'Root coins', stock: { root: 1, herb: 1 }, heat: 4, color: '#d07942' },
      { id: 'grain', name: 'Golden grains', stock: { grain: 1, leek: 1 }, heat: 6, color: '#b9a052' },
    ],
  },
  pear: {
    id: 'pear', name: 'Orchard moon & cream clouds', short: 'Orchard moon',
    components: [
      { id: 'moon', name: 'Orchard moon', stock: { pear: 1 }, heat: 4, color: '#dda958' },
      { id: 'cloud', name: 'Cream clouds', stock: { cream: 1, herb: 1 }, heat: 0, color: '#eee3bc' },
    ],
  },
};

export const SHIFTS = [
  { title: 'The first sitting', course: 'I / Roots & ribbons', recipes: ['root', 'leek', 'root'], arrivals: [0, 3, 6], deadlines: [13, 18, 23], clock: 24, goal: 3, note: 'One hot component, one cold. Reserve the pass before the pans finish.' },
  { title: 'The long table', course: 'II / The harvest', recipes: ['leek', 'duet', 'root', 'duet'], arrivals: [0, 3, 6, 9], deadlines: [14, 20, 25, 30], clock: 31, goal: 3, note: 'The harvest duet needs both pans. Prep ahead; plate the two hot components together.' },
  { title: 'Last light', course: 'III / Orchard supper', recipes: ['pear', 'duet', 'pear', 'root', 'pear'], arrivals: [0, 3, 6, 9, 12], deadlines: [14, 20, 25, 30, 35], clock: 36, goal: 4, note: 'Five tickets, two burners. Protect the late orchard orders with advance prep.' },
] as const;
