import { gridFromPattern } from './engine';
import type { PixelGrid } from './engine';

export interface ThreadColor { name: string; color: string }
export interface Palette { id: string; name: string; colors: readonly ThreadColor[] }
export interface Starter {
  id: string;
  name: string;
  description: string;
  palette: string;
  pixels: PixelGrid;
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'garden',
    name: 'Garden linen',
    colors: [
      { name: 'Forest', color: '#24473b' },
      { name: 'Moss', color: '#598564' },
      { name: 'Sage', color: '#abc28a' },
      { name: 'Oat', color: '#f8edcf' },
      { name: 'Honey', color: '#e9bd73' },
      { name: 'Terracotta', color: '#ad5846' },
      { name: 'Peach', color: '#f0a995' },
      { name: 'Petal', color: '#d97d77' },
      { name: 'Pond', color: '#83a7ae' },
      { name: 'Milk', color: '#ffffff' },
    ],
  },
  {
    id: 'twilight',
    name: 'Twilight yarn',
    colors: [
      { name: 'Midnight', color: '#293c50' },
      { name: 'Blue hour', color: '#516783' },
      { name: 'Periwinkle', color: '#a994cf' },
      { name: 'Lavender', color: '#d5c1e9' },
      { name: 'Moon', color: '#f4d58e' },
      { name: 'Dusk rose', color: '#e4a7bc' },
      { name: 'Tidal', color: '#7bafb1' },
      { name: 'Sea glass', color: '#b9d4c2' },
      { name: 'Clay', color: '#be8071' },
      { name: 'Starlight', color: '#fff6df' },
    ],
  },
  {
    id: 'market',
    name: 'Market day',
    colors: [
      { name: 'Leaf', color: '#315b3a' },
      { name: 'Pea shoot', color: '#95b970' },
      { name: 'Berry', color: '#d3525a' },
      { name: 'Jam', color: '#a5354b' },
      { name: 'Guava', color: '#f28e86' },
      { name: 'Butter', color: '#ffe8ba' },
      { name: 'Marigold', color: '#e5ad43' },
      { name: 'Blue bowl', color: '#7396b5' },
      { name: 'Plum', color: '#71506f' },
      { name: 'Flour', color: '#fff8eb' },
    ],
  },
];

export const STARTERS: readonly Starter[] = [
  {
    id: 'pocket-garden',
    name: 'Pocket garden',
    description: 'A happy sprout in its Sunday pot.',
    palette: 'garden',
    pixels: gridFromPattern([
      '................',
      '..........ss....',
      '.........sggs...',
      '...ss...sgGgs...',
      '..sggs..gGgs....',
      '..sgGgsgGg......',
      '...sgGgGg.......',
      '....sgggs.......',
      '...dddddddddd...',
      '..drrrrrrrrrrd..',
      '...dppphppppd...',
      '...dpphhhpppd...',
      '....dpphpppd....',
      '....dppppppd....',
      '.....dddddd.....',
      '................',
    ], {
      g: '#24473b', G: '#598564', s: '#abc28a',
      d: '#ad5846', r: '#f0a995', p: '#d97d77', h: '#f8edcf',
    }),
  },
  {
    id: 'moon-moth',
    name: 'Moon moth',
    description: 'A little night visitor, dressed in lilac.',
    palette: 'twilight',
    pixels: gridFromPattern([
      '................',
      '..h..........h..',
      '......g..g......',
      '...gg..gg..gg...',
      '..gvvgghhggvvg..',
      '.gvllvghhgvllvg.',
      '.gvlhlvggvlhlvg.',
      '.gvlllvggvlllvg.',
      '..gvvvghhgvvvg..',
      '...gggghhgggg...',
      '..gtctghhgtctg..',
      '..gtttgttgtttg..',
      '...gttgttgttg...',
      '....gg.gg.gg....',
      '.......gg.......',
      '................',
    ], {
      g: '#293c50', v: '#a994cf', l: '#d5c1e9',
      h: '#f4d58e', t: '#7bafb1', c: '#e4a7bc',
    }),
  },
  {
    id: 'little-berry',
    name: 'Little berry',
    description: 'A sun-warm strawberry, seeds and all.',
    palette: 'market',
    pixels: gridFromPattern([
      '................',
      '.....g....g.....',
      '....gsg..gsg....',
      '.....gsggsg.....',
      '...gggsggsggg...',
      '..grrrgssgrrrg..',
      '..grhrrggrrhrg..',
      '.grrrrrrrrrrrrg.',
      '.grhrrhrrhrrhrg.',
      '..gqrrrrrrrrrg..',
      '..gqrhrrhrrhrg..',
      '...gqrrrrrrrg...',
      '....gqrhrrrg....',
      '.....gqrrrg.....',
      '......gggg......',
      '................',
    ], {
      g: '#315b3a', s: '#95b970', r: '#d3525a', q: '#a5354b', h: '#ffe8ba',
    }),
  },
];

export const EXPORT_SIZES = [
  { scale: 1, label: '16 × 16 · native' },
  { scale: 4, label: '64 × 64 · 4×' },
  { scale: 8, label: '128 × 128 · 8×' },
  { scale: 16, label: '256 × 256 · 16×' },
  { scale: 32, label: '512 × 512 · 32×' },
] as const;

export const BACKGROUNDS = [
  { id: 'transparent', name: 'Transparent', color: null },
  { id: 'cream', name: 'Warm cream', color: '#f5efdf' },
  { id: 'white', name: 'Paper white', color: '#ffffff' },
  { id: 'forest', name: 'Forest green', color: '#24473b' },
] as const;
