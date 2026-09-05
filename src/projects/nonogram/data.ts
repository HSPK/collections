import { createGrid } from './engine';
import type { PuzzleGrid } from './engine';

interface PuzzleContent {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly level: string;
  readonly invitation: string;
  readonly reveal: string;
  readonly pattern: readonly string[];
}

export interface ClubPuzzle extends PuzzleContent, PuzzleGrid {
  readonly number: string;
}

// Original pixel drawings for this edition. # is ink; . is untouched paper.
const drawings: readonly PuzzleContent[] = [
  {
    id: 'morning-ritual',
    label: 'Morning ritual',
    title: 'The Sunday cup',
    level: 'Gentle',
    invitation: 'A familiar little comfort. Start with the longer runs.',
    reveal: 'A cup with nowhere to be. Best enjoyed with a slow morning and something warm.',
    pattern: [
      '........',
      '.#####..',
      '.#######',
      '.#####.#',
      '.#####.#',
      '.#######',
      '..###...',
      '.#####..',
    ],
  },
  {
    id: 'little-growth',
    label: 'A little growth',
    title: 'The patient cactus',
    level: 'Gentle',
    invitation: 'Something good is growing. Let the rows and columns meet.',
    reveal: 'A very low-maintenance friend. A little light, a little space, and all the time in the world.',
    pattern: [
      '...##...',
      '.#.##.#.',
      '.######.',
      '...##...',
      '...##...',
      '.######.',
      '..####..',
      '..####..',
    ],
  },
  {
    id: 'out-of-office',
    label: 'Out of office',
    title: 'The slow sail',
    level: 'Steady',
    invitation: 'Take the scenic route. There is room for one more small discovery.',
    reveal: 'A little boat on an unhurried crossing. No destination required; the getting there is enough.',
    pattern: [
      '.....#....',
      '....##....',
      '...###....',
      '..####.#..',
      '.#####.##.',
      '######.###',
      '.....#....',
      '##########',
      '.########.',
      '..######..',
    ],
  },
  {
    id: 'somewhere-quiet',
    label: 'Somewhere quiet',
    title: 'Home before dark',
    level: 'Steady',
    invitation: 'The last page of this little edition. Make yourself at home.',
    reveal: 'A tiny house with a generous roof. A place to put your feet up after a good day of figuring things out.',
    pattern: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '##########',
      '.##....##.',
      '.##.##.##.',
      '.##.##.##.',
      '.##.##.##.',
      '.########.',
    ],
  },
];

export const puzzles: readonly ClubPuzzle[] = drawings.map((drawing, index) => ({
  ...drawing,
  ...createGrid(drawing.pattern),
  number: String(index + 1).padStart(2, '0'),
}));
