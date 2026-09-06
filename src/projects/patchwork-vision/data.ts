import type { ColorId, Patch, RGB, Scene, ShapeId } from './types';

export const GRID_SIDE = 4;
export const PATCH_COUNT = GRID_SIDE * GRID_SIDE;
export const TILE_SIZE = 28;
export const BACKGROUND: RGB = [250, 246, 235];

export const COLORS: readonly { id: ColorId; label: string; rgb: RGB; hex: string }[] = [
  { id: 'red', label: 'Red', rgb: [220, 73, 67], hex: '#dc4943' },
  { id: 'blue', label: 'Blue', rgb: [53, 100, 201], hex: '#3564c9' },
  { id: 'gold', label: 'Gold', rgb: [221, 164, 43], hex: '#dda42b' },
  { id: 'teal', label: 'Teal', rgb: [28, 137, 121], hex: '#1c8979' },
];

export const SHAPES: readonly { id: ShapeId; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
];

export const FEATURE_LABELS = ['Red', 'Blue', 'Gold', 'Teal', 'Circle', 'Square', 'Triangle'] as const;

const patch = (color: ColorId, shape: ShapeId | 'empty'): Patch => ({ color, shape });
const empty = (): Patch => patch('red', 'empty');

export const SCENES: readonly Scene[] = [
  {
    id: 'signal-garden',
    name: 'Signal garden',
    description: 'Red circles threaded through a mixed-color patchwork.',
    patches: [
      patch('red', 'circle'), empty(), patch('blue', 'square'), patch('gold', 'triangle'),
      patch('teal', 'square'), patch('red', 'circle'), empty(), patch('blue', 'triangle'),
      empty(), patch('gold', 'square'), patch('red', 'circle'), empty(),
      patch('blue', 'square'), empty(), patch('teal', 'triangle'), patch('red', 'circle'),
    ],
  },
  {
    id: 'blue-workshop',
    name: 'Blue workshop',
    description: 'Mostly blue squares, with two blue circles.',
    patches: [
      patch('blue', 'square'), patch('blue', 'square'), empty(), patch('blue', 'circle'),
      empty(), patch('blue', 'square'), patch('blue', 'square'), empty(),
      patch('blue', 'square'), empty(), patch('blue', 'circle'), patch('blue', 'square'),
      empty(), patch('blue', 'square'), empty(), patch('blue', 'square'),
    ],
  },
  {
    id: 'golden-pennants',
    name: 'Golden pennants',
    description: 'Gold triangles, interrupted by two teal squares.',
    patches: [
      patch('gold', 'triangle'), empty(), patch('gold', 'triangle'), empty(),
      empty(), patch('teal', 'square'), empty(), patch('gold', 'triangle'),
      patch('gold', 'triangle'), empty(), patch('teal', 'square'), empty(),
      empty(), patch('gold', 'triangle'), empty(), patch('gold', 'triangle'),
    ],
  },
];

export const DESCRIPTORS = [
  { text: 'red circle', note: 'A color and a silhouette' },
  { text: 'blue square', note: 'Try the blue workshop' },
  { text: 'gold triangle', note: 'Find the pennants' },
  { text: 'circle', note: 'Ignore color' },
];

export const DEFAULT_DESCRIPTOR = 'red circle';
export const DEFAULT_TEMPERATURE = 0.16;
