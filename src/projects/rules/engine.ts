export type Cell = 0 | 1;
export type Point = readonly [x: number, y: number];
export type Boundary = 'bounded' | 'wrap';

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Cell[];
}

export interface Rule {
  readonly birth: readonly number[];
  readonly survive: readonly number[];
}

export interface GenerationResult {
  readonly board: Board;
  readonly population: number;
  readonly births: number;
  readonly deaths: number;
}

export type RuleResult =
  | { readonly valid: true; readonly rule: Rule }
  | { readonly valid: false; readonly error: string };

function assertPoint(board: Pick<Board, 'width' | 'height'>, [x, y]: Point): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= board.width || y >= board.height) {
    throw new RangeError('Choose a whole-number coordinate inside the board.');
  }
}

function freezeBoard(width: number, height: number, cells: Cell[]): Board {
  return Object.freeze({ width, height, cells: Object.freeze(cells) });
}

export function createBoard(width: number, height: number, living: readonly Point[] = []): Board {
  if (![width, height].every((size) => Number.isInteger(size) && size >= 3 && size <= 128)) {
    throw new RangeError('Board dimensions must be whole numbers from 3 to 128.');
  }
  const cells = Array<Cell>(width * height).fill(0);
  for (const point of living) {
    assertPoint({ width, height }, point);
    cells[point[1] * width + point[0]] = 1;
  }
  return freezeBoard(width, height, cells);
}

export function patternPoints(pattern: readonly string[], offsetX = 0, offsetY = 0): Point[] {
  const width = pattern[0]?.length ?? 0;
  if (!width || !pattern.length || !pattern.every((row) => row.length === width && /^[.O]+$/.test(row))) {
    throw new Error('A pattern needs equally wide rows containing only "." and "O".');
  }
  if (!Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
    throw new RangeError('Pattern offsets must be whole numbers.');
  }
  return pattern.flatMap((row, y) => [...row].flatMap((cell, x): Point[] =>
    cell === 'O' ? [[x + offsetX, y + offsetY]] : [],
  ));
}

export function paintCells(board: Board, points: readonly Point[], value: Cell): Board {
  if (value !== 0 && value !== 1) throw new Error('A cell is either dead (0) or alive (1).');
  for (const point of points) assertPoint(board, point);
  if (points.every(([x, y]) => board.cells[y * board.width + x] === value)) return board;
  const cells = [...board.cells];
  for (const [x, y] of points) cells[y * board.width + x] = value;
  return freezeBoard(board.width, board.height, cells);
}

export function linePoints(from: Point, to: Point): Point[] {
  if (![...from, ...to].every(Number.isInteger)) throw new RangeError('Brush coordinates must be whole numbers.');
  let [x, y] = from;
  const [targetX, targetY] = to;
  const dx = Math.abs(targetX - x);
  const dy = -Math.abs(targetY - y);
  const sx = x < targetX ? 1 : -1;
  const sy = y < targetY ? 1 : -1;
  let error = dx + dy;
  const points: Point[] = [];
  // Bresenham fills cells between pointer samples so a fast stroke has no gaps.
  while (true) {
    points.push([x, y]);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
  return points;
}

export function parseRule(text: string): RuleResult {
  const match = /^B([0-8]*)\/S([0-8]*)$/i.exec(text.trim());
  if (!match) {
    return { valid: false, error: 'Use B/S notation with neighbor counts 0-8, for example B3/S23 or B2/S. An empty half is allowed.' };
  }
  const birth = [...match[1]].map(Number);
  const survive = [...match[2]].map(Number);
  if (new Set(birth).size !== birth.length || new Set(survive).size !== survive.length) {
    return { valid: false, error: 'List each neighbor count only once in each half of the rule.' };
  }
  return {
    valid: true,
    rule: Object.freeze({
      birth: Object.freeze(birth.sort((a, b) => a - b)),
      survive: Object.freeze(survive.sort((a, b) => a - b)),
    }),
  };
}

export function ruleNotation(rule: Rule): string {
  return `B${[...rule.birth].sort((a, b) => a - b).join('')}/S${[...rule.survive].sort((a, b) => a - b).join('')}`;
}

function neighbors(board: Board, x: number, y: number, boundary: Boundary): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      let nx = x + dx;
      let ny = y + dy;
      if (boundary === 'wrap') {
        nx = (nx + board.width) % board.width;
        ny = (ny + board.height) % board.height;
      } else if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height) {
        continue;
      }
      count += board.cells[ny * board.width + nx];
    }
  }
  return count;
}

export function neighborCount(board: Board, point: Point, boundary: Boundary): number {
  assertPoint(board, point);
  return neighbors(board, point[0], point[1], boundary);
}

export function nextCell(cell: Cell, count: number, rule: Rule): Cell {
  if (!Number.isInteger(count) || count < 0 || count > 8) {
    throw new RangeError('A cell has between zero and eight living neighbors.');
  }
  return (cell ? rule.survive : rule.birth).includes(count) ? 1 : 0;
}

export function stepBoard(board: Board, rule: Rule, boundary: Boundary = 'bounded'): GenerationResult {
  const cells = Array<Cell>(board.cells.length).fill(0);
  let population = 0;
  let births = 0;
  let deaths = 0;
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const index = y * board.width + x;
      const before = board.cells[index];
      const after = nextCell(before, neighbors(board, x, y, boundary), rule);
      cells[index] = after;
      population += after;
      if (!before && after) births += 1;
      if (before && !after) deaths += 1;
    }
  }
  return { board: freezeBoard(board.width, board.height, cells), population, births, deaths };
}

export function population(board: Board): number {
  return board.cells.reduce<number>((total, cell) => total + cell, 0);
}

export function livingPoints(board: Board): Point[] {
  return board.cells.flatMap((cell, index): Point[] =>
    cell ? [[index % board.width, Math.floor(index / board.width)]] : [],
  );
}

export function equalBoards(left: Board, right: Board): boolean {
  return left.width === right.width && left.height === right.height
    && left.cells.every((cell, index) => cell === right.cells[index]);
}

export function serializeBoard(board: Board, rule: Rule, boundary: Boundary, generation: number): string {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RangeError('Generation must be a nonnegative whole number.');
  return JSON.stringify({
    format: 'garden-of-rules',
    version: 1,
    width: board.width,
    height: board.height,
    rule: ruleNotation(rule),
    boundary,
    generation,
    population: population(board),
    living: livingPoints(board),
    coordinates: 'Zero-based [column, row], from the top left. The on-page editor uses one-based labels.',
    neighborhood: 'Eight surrounding cells, including diagonals; every cell updates simultaneously.',
  }, null, 2);
}
