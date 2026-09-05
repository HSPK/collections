import { createBoard, parseRule, patternPoints } from './engine';
import type { Board, Rule } from './engine';

export const BOARD_WIDTH = 24;
export const BOARD_HEIGHT = 18;

export interface RuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly notation: string;
  readonly summary: string;
  readonly observation: string;
}

export const ruleDefinitions: readonly RuleDefinition[] = [
  {
    id: 'life',
    name: "Conway's Life",
    notation: 'B3/S23',
    summary: 'A dead cell is born with exactly 3 living neighbors. A living cell survives with 2 or 3; otherwise it dies.',
    observation: 'Look for still lifes, repeating oscillators, and moving patterns. The same rule can support all three.',
  },
  {
    id: 'highlife',
    name: 'HighLife',
    notation: 'B36/S23',
    summary: 'Like Life, but a dead cell is also born with exactly 6 living neighbors. Survival still requires 2 or 3.',
    observation: 'That one extra birth count allows the small replicator in the seed library to make copies of itself.',
  },
  {
    id: 'seeds',
    name: 'Seeds',
    notation: 'B2/S',
    summary: 'A dead cell is born with exactly 2 living neighbors. No living cell survives: every occupied cell dies on the next step.',
    observation: 'An empty survival list does not mean nothing happens. New cells can be born elsewhere while the old cells disappear.',
  },
];

export function ruleById(id: string): Rule {
  const definition = ruleDefinitions.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown garden rule: ${id}`);
  const parsed = parseRule(definition.notation);
  if (!parsed.valid) throw new Error(parsed.error);
  return parsed.rule;
}

export interface Stamp {
  readonly x: number;
  readonly y: number;
  readonly rows: readonly string[];
}

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly ruleId: string;
  readonly description: string;
  readonly invitation: string;
  readonly stamps: readonly Stamp[];
}

const block = ['OO', 'OO'];
const beehive = ['.OO.', 'O..O', '.OO.'];
const boat = ['OO.', 'O.O', '.O.'];
const glider = ['.O.', '..O', 'OOO'];

export const presets: readonly Preset[] = [
  {
    id: 'garden',
    name: 'Garden study',
    kind: 'A composed starting board',
    ruleId: 'life',
    description: 'A block, beehive and boat sit beside a blinker and a glider. Some arrangements rest; others repeat or travel.',
    invitation: 'Step once. Which of the five little plantings changed? The isolated still lifes begin exactly as they were.',
    stamps: [
      { x: 3, y: 3, rows: block },
      { x: 14, y: 3, rows: beehive },
      { x: 9, y: 6, rows: boat },
      { x: 4, y: 11, rows: ['OOO'] },
      { x: 16, y: 11, rows: glider },
    ],
  },
  {
    id: 'blinker',
    name: 'Blinker',
    kind: 'Oscillator / period 2',
    ruleId: 'life',
    description: 'Three cells trade a horizontal line for a vertical one, then return. Every decision comes from the same eight-neighbor count.',
    invitation: 'Before Step, predict the fate of each end cell. After two generations the complete board is back where it started.',
    stamps: [{ x: 11, y: 8, rows: ['OOO'] }],
  },
  {
    id: 'glider',
    name: 'Glider',
    kind: 'Spaceship / period 4',
    ruleId: 'life',
    description: 'Five cells cycle through four phases. After four generations this orientation has moved one row down and one column right.',
    invitation: 'Take four steps, then compare the shape and position. A glider is a moving pattern, not a set of cells physically sliding.',
    stamps: [{ x: 9, y: 7, rows: glider }],
  },
  {
    id: 'toad',
    name: 'Toad',
    kind: 'Oscillator / period 2',
    ruleId: 'life',
    description: 'Two offset rows of three cells open into a different six-cell arrangement, then close again.',
    invitation: 'Compare it with the blinker. Both have period 2, but the cells that survive or are born are different.',
    stamps: [{ x: 10, y: 8, rows: ['.OOO', 'OOO.'] }],
  },
  {
    id: 'pulsar',
    name: 'Pulsar',
    kind: 'Oscillator / period 3',
    ruleId: 'life',
    description: 'A larger, symmetric oscillator with three distinct phases. Its population need not stay constant as the shape repeats.',
    invitation: 'Step through three generations. Watch the birth and death counts instead of assuming symmetry means stillness.',
    stamps: [{ x: 5, y: 2, rows: [
      '..OOO...OOO..',
      '.............',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '..OOO...OOO..',
      '.............',
      '..OOO...OOO..',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '.............',
      '..OOO...OOO..',
    ] }],
  },
  {
    id: 'replicator',
    name: 'HighLife replicator',
    kind: 'Self-copying seed / HighLife',
    ruleId: 'highlife',
    description: 'This 12-cell seed produces two copies after 12 generations in HighLife, while it still has enough space around it.',
    invitation: 'Load the seed, take 12 steps, and count 24 living cells. Reset, choose Life, and see why the rule matters.',
    stamps: [{ x: 9, y: 6, rows: ['..OOO', '.O..O', 'O...O', 'O..O.', 'OOO..'] }],
  },
  {
    id: 'seeds-square',
    name: 'A square in Seeds',
    kind: 'Transient / no survivors',
    ruleId: 'seeds',
    description: 'The same four-cell block that rests in Life cannot survive under Seeds. The first step replaces it with eight newly born cells.',
    invitation: 'Select one of the original cells and check its next state. In Seeds, even a well-connected living cell must die.',
    stamps: [{ x: 11, y: 8, rows: block }],
  },
];

export function presetById(id: string): Preset {
  const preset = presets.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown garden planting: ${id}`);
  return preset;
}

export function presetBoard(preset: Preset): Board {
  return createBoard(BOARD_WIDTH, BOARD_HEIGHT, preset.stamps.flatMap((stamp) => patternPoints(stamp.rows, stamp.x, stamp.y)));
}

export const fieldNotes = [
  {
    number: '01',
    title: 'Look at the whole neighborhood.',
    text: 'Each cell has eight neighbors: above, below, left, right, and the four diagonals. The cell itself is not part of its neighbor count. Use the selected-cell inspector to make a prediction before stepping.',
  },
  {
    number: '02',
    title: 'Write the next board, not over this one.',
    text: 'Every cell reads the same old generation. Only after all decisions are made does the new board replace it. Updating cells one at a time in place would create a different system.',
  },
  {
    number: '03',
    title: 'The boundary is part of the experiment.',
    text: 'A bounded board treats everything beyond its edges as dead. A wrapping board connects opposite edges, like a torus. Neither option is an infinite plane; a traveling pattern eventually encounters the boundary.',
  },
] as const;

export const references = [
  { name: "Conway's Game of Life", url: 'https://conwaylife.com/wiki/Conway%27s_Game_of_Life', detail: 'Rule, neighborhood and pattern vocabulary.' },
  { name: 'HighLife', url: 'https://conwaylife.com/wiki/HighLife', detail: 'The extra birth condition and the replicator.' },
  { name: 'Seeds', url: 'https://conwaylife.com/wiki/Seeds', detail: 'Birth with two neighbors and no survival.' },
] as const;
