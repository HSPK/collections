import type { Harmony, RecipeSettings, Role } from './engine';

export interface Recipe {
  id: string;
  name: string;
  note: string;
  settings: RecipeSettings;
}

export const ROLE_INFO: Record<Role, { short: string; name: string; note: string }> = {
  base: { short: 'Base', name: 'Base ingredient', note: 'The starting pigment. Change it to cook a new mix.' },
  companion: { short: 'Side', name: 'Companion color', note: 'A lighter companion for illustrations, borders and supporting moments.' },
  accent: { short: 'Spark', name: 'Accent color', note: 'A concentrated color for the moments that deserve a little attention.' },
  paper: { short: 'Paper', name: 'Paper color', note: 'A pale ground, lightly tinted with the base and your chosen warmth.' },
  ink: { short: 'Ink', name: 'Ink color', note: 'A deep shade of the base. Taste it against your paper before you use it.' },
};

export const HARMONY_INFO: Record<Harmony, { name: string; note: string }> = {
  analogous: { name: 'Next-door neighbors', note: 'Side and spark sit 32 and 68 degrees from the base: close, but not identical.' },
  complementary: { name: 'Opposites attract', note: 'Side crosses the color wheel by 180 degrees; spark steps back to 150 degrees.' },
  split: { name: 'A split complement', note: 'Two colors at 150 and 210 degrees flank the base color\'s opposite.' },
  triad: { name: 'Three-way conversation', note: 'Three evenly spaced hues, 120 degrees apart. A lively recipe for a small palette.' },
  monochrome: { name: 'One pigment, many tones', note: 'One hue, different lightness and saturation. Quiet does not have to mean flat.' },
};

export const RECIPES: Recipe[] = [
  {
    id: 'market-tomato',
    name: 'Market tomato',
    note: 'Tomato skin, mustard seed, a little olive.',
    settings: { base: '#b74732', harmony: 'analogous', spice: 58, warmth: 22 },
  },
  {
    id: 'cobalt-crockery',
    name: 'Cobalt crockery',
    note: 'Glazed blue with a warm terracotta side.',
    settings: { base: '#245c99', harmony: 'complementary', spice: 64, warmth: 8 },
  },
  {
    id: 'plum-preserve',
    name: 'Plum preserve',
    note: 'Purple fruit, leaf green and peach flesh.',
    settings: { base: '#793e68', harmony: 'split', spice: 42, warmth: 16 },
  },
  {
    id: 'sunlit-linen',
    name: 'Sunlit linen',
    note: 'One honey pigment, folded into soft tones.',
    settings: { base: '#a06c29', harmony: 'monochrome', spice: 36, warmth: 30 },
  },
  {
    id: 'orchard-ink',
    name: 'Orchard ink',
    note: 'Deep leaf, dusty lilac and earthy red.',
    settings: { base: '#37634d', harmony: 'triad', spice: 36, warmth: -8 },
  },
  {
    id: 'night-citrus',
    name: 'Night citrus',
    note: 'Electric peel against cool violet and blue.',
    settings: { base: '#d3b531', harmony: 'split', spice: 78, warmth: -24 },
  },
];
