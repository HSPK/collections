import type { Portal } from './engine';

export type WorldId = 'desk' | 'city' | 'room' | 'sea';
export interface IllustratedWorld {
  id: WorldId;
  name: string;
  object: string;
  address: string;
  story: string;
  color: string;
  frame: string;
  portal: Portal;
}

export const worlds: IllustratedWorld[] = [
  {
    id: 'desk', name: 'The afternoon desk', object: 'the blue postcard',
    address: 'Somewhere on a quiet afternoon',
    story: 'A half-finished cup. An uncapped pencil. A postcard from a city that only exists on this desk.',
    color: '#e5b47e', frame: '#365e91',
    portal: { x: 462, y: 164, width: 330, height: 231 },
  },
  {
    id: 'city', name: 'Postcard city', object: 'the rose building',
    address: 'Across the canal, third window',
    story: 'The canal folds around a row of small houses. In the rose building, someone has left a book open.',
    color: '#bee0d8', frame: '#ac4d51',
    portal: { x: 583, y: 280, width: 190, height: 133 },
  },
  {
    id: 'room', name: 'The reading room', object: 'the open book',
    address: 'One room inside one window',
    story: 'The shelves hold weather, maps, and unhurried days. The open book is not about an island. It is an island.',
    color: '#eadbe7', frame: '#4d4d87',
    portal: { x: 420, y: 362, width: 250, height: 175 },
  },
  {
    id: 'sea', name: 'The Margin Sea', object: 'the island studio',
    address: 'An archipelago between the lines',
    story: 'Past the red lighthouse is a studio with a familiar desk. Four drawings, folded into a repeating world.',
    color: '#97c7dc', frame: '#d56b54',
    portal: { x: 559, y: 299, width: 205, height: 143.5 },
  },
];

export const portals = worlds.map((world) => world.portal);
