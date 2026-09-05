export type CellState = 'empty' | 'filled' | 'crossed';
export type PaintTool = 'fill' | 'cross' | 'erase';
type KnownCell = boolean | null;

export interface Clues {
  readonly rows: readonly (readonly number[])[];
  readonly columns: readonly (readonly number[])[];
}

export interface PuzzleGrid {
  readonly width: number;
  readonly height: number;
  readonly solution: readonly (readonly boolean[])[];
  readonly clues: Clues;
  readonly totalFilled: number;
}

export interface GameState {
  readonly cells: readonly CellState[];
  readonly moves: number;
  readonly hints: number;
  readonly checks: number;
}

export interface Mistake {
  readonly index: number;
  readonly kind: 'extra-fill' | 'crossed-fill';
}

export interface HintResult {
  readonly state: GameState;
  readonly index: number | null;
  readonly kind: 'correction' | 'deduction' | 'reveal' | 'complete';
  readonly message: string;
}

export function runClues(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) {
      run += 1;
    } else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
}

export function createGrid(pattern: readonly string[]): PuzzleGrid {
  const width = pattern[0]?.length ?? 0;
  if (!width || !pattern.length || width > 15 || pattern.length > 15) {
    throw new Error('A grid must have between 1 and 15 rows and columns.');
  }
  if (pattern.some((row) => row.length !== width || !/^[.#]+$/.test(row))) {
    throw new Error('Every grid row must have the same width and contain only . or #.');
  }
  const solution = pattern.map((row) => [...row].map((cell) => cell === '#'));
  return {
    width,
    height: solution.length,
    solution,
    totalFilled: solution.flat().filter(Boolean).length,
    clues: {
      rows: solution.map(runClues),
      columns: Array.from({ length: width }, (_, column) => runClues(solution.map((row) => row[column]))),
    },
  };
}

export function createState(grid: PuzzleGrid): GameState {
  return {
    cells: Array<CellState>(grid.width * grid.height).fill('empty'),
    moves: 0,
    hints: 0,
    checks: 0,
  };
}

export function isComplete(grid: PuzzleGrid, state: GameState): boolean {
  return state.cells.length === grid.width * grid.height
    && state.cells.every((cell, index) =>
      (cell === 'filled') === grid.solution[Math.floor(index / grid.width)][index % grid.width]);
}

export function paintCell(grid: PuzzleGrid, state: GameState, index: number, tool: PaintTool): GameState {
  if (!Number.isInteger(index) || index < 0 || index >= state.cells.length || isComplete(grid, state)) {
    return state;
  }
  const target: CellState = tool === 'fill' ? 'filled' : tool === 'cross' ? 'crossed' : 'empty';
  const next: CellState = state.cells[index] === target ? 'empty' : target;
  if (state.cells[index] === next) return state;
  const cells = [...state.cells];
  cells[index] = next;
  return { ...state, cells, moves: state.moves + 1 };
}

export function getMistakes(grid: PuzzleGrid, state: GameState): Mistake[] {
  const mistakes: Mistake[] = [];
  state.cells.forEach((cell, index) => {
    const required = grid.solution[Math.floor(index / grid.width)][index % grid.width];
    if (cell === 'filled' && !required) mistakes.push({ index, kind: 'extra-fill' });
    if (cell === 'crossed' && required) mistakes.push({ index, kind: 'crossed-fill' });
  });
  return mistakes;
}

export function lineMatches(line: readonly CellState[], clues: readonly number[]): boolean {
  const runs = runClues(line.map((cell) => cell === 'filled'));
  return runs.length === clues.length && runs.every((run, index) => run === clues[index]);
}

export function summarize(grid: PuzzleGrid, state: GameState) {
  const rowsMatched = grid.clues.rows.map((clues, row) =>
    lineMatches(state.cells.slice(row * grid.width, (row + 1) * grid.width), clues));
  const columnsMatched = grid.clues.columns.map((clues, column) =>
    lineMatches(Array.from({ length: grid.height }, (_, row) => state.cells[row * grid.width + column]), clues));
  return {
    rowsMatched,
    columnsMatched,
    matchedLines: [...rowsMatched, ...columnsMatched].filter(Boolean).length,
    totalLines: grid.width + grid.height,
    remaining: state.cells.reduce((count, cell, index) => count
      + Number(grid.solution[Math.floor(index / grid.width)][index % grid.width] && cell !== 'filled'), 0),
  };
}

export function checkPuzzle(grid: PuzzleGrid, state: GameState) {
  return {
    state: isComplete(grid, state) ? state : { ...state, checks: state.checks + 1 },
    mistakes: getMistakes(grid, state),
    remaining: summarize(grid, state).remaining,
    complete: isComplete(grid, state),
  };
}

/** All placements of these runs, with at least one empty square between runs. */
export function enumerateLine(
  length: number,
  clues: readonly number[],
  known?: readonly KnownCell[],
): boolean[][] {
  if (!Number.isInteger(length) || length < 1 || length > 15 || (known && known.length !== length)
    || clues.some((run) => !Number.isInteger(run) || run < 1)
    || clues.reduce((sum, run) => sum + run, 0) + Math.max(0, clues.length - 1) > length) {
    return [];
  }
  const results: boolean[][] = [];
  const accept = (line: boolean[]) => {
    if (line.every((cell, index) => !known || known[index] === null || known[index] === cell)) results.push(line);
  };
  const place = (block: number, start: number, line: boolean[]) => {
    if (block === clues.length) {
      accept(line);
      return;
    }
    const needed = clues.slice(block).reduce((sum, run) => sum + run, 0) + clues.length - block - 1;
    for (let position = start; position <= length - needed; position += 1) {
      const next = [...line];
      next.fill(true, position, position + clues[block]);
      place(block + 1, position + clues[block] + 1, next);
    }
  };
  place(0, 0, Array<boolean>(length).fill(false));
  return results;
}

/**
 * Intersect line candidates until stable, then branch on the smallest line.
 * A limit of two proves uniqueness; zero branches means line logic alone suffices.
 */
export function solveClues(clues: Clues, limit = 2): { solutions: boolean[][][]; branches: number } {
  const height = clues.rows.length;
  const width = clues.columns.length;
  if (!height || !width || height > 15 || width > 15 || !Number.isInteger(limit) || limit < 1) {
    throw new Error('Provide a 1–15 square-wide grid and a positive solution limit.');
  }
  const rowCandidates = clues.rows.map((line) => enumerateLine(width, line));
  const columnCandidates = clues.columns.map((line) => enumerateLine(height, line));
  const solutions: boolean[][][] = [];
  let branches = 0;

  const search = (board: KnownCell[][]) => {
    if (solutions.length >= limit) return;
    let rows = rowCandidates;
    let columns = columnCandidates;
    let changed: boolean;
    do {
      changed = false;
      for (let row = 0; row < height; row += 1) {
        const candidates = rows[row].filter((line) => line.every((cell, column) =>
          board[row][column] === null || board[row][column] === cell));
        if (!candidates.length) return;
        rows = rows.map((line, index) => index === row ? candidates : line);
        for (let column = 0; column < width; column += 1) {
          if (board[row][column] === null && candidates.every((line) => line[column] === candidates[0][column])) {
            board[row][column] = candidates[0][column];
            changed = true;
          }
        }
      }
      for (let column = 0; column < width; column += 1) {
        const candidates = columns[column].filter((line) => line.every((cell, row) =>
          board[row][column] === null || board[row][column] === cell));
        if (!candidates.length) return;
        columns = columns.map((line, index) => index === column ? candidates : line);
        for (let row = 0; row < height; row += 1) {
          if (board[row][column] === null && candidates.every((line) => line[row] === candidates[0][row])) {
            board[row][column] = candidates[0][row];
            changed = true;
          }
        }
      }
    } while (changed);

    if (board.every((row) => row.every((cell) => cell !== null))) {
      solutions.push(board.map((row) => row.map((cell) => cell === true)));
      return;
    }

    const choices = [
      ...rows.map((options, index) => ({ options, index, axis: 'row' as const })),
      ...columns.map((options, index) => ({ options, index, axis: 'column' as const })),
    ].filter((choice) => choice.options.length > 1).sort((a, b) => a.options.length - b.options.length);
    const choice = choices[0];
    if (!choice) return;
    for (const line of choice.options) {
      if (solutions.length >= limit) break;
      branches += 1;
      const next = board.map((row) => [...row]);
      line.forEach((cell, index) => {
        if (choice.axis === 'row') next[choice.index][index] = cell;
        else next[index][choice.index] = cell;
      });
      search(next);
    }
  };

  search(Array.from({ length: height }, () => Array<KnownCell>(width).fill(null)));
  return { solutions, branches };
}

export function takeHint(grid: PuzzleGrid, state: GameState): HintResult {
  if (isComplete(grid, state)) {
    return { state, index: null, kind: 'complete', message: 'The picture is already complete. No hint used.' };
  }
  const setHint = (index: number, filled: boolean, kind: HintResult['kind'], message: string): HintResult => {
    const cells = [...state.cells];
    cells[index] = filled ? 'filled' : 'crossed';
    return { state: { ...state, cells, hints: state.hints + 1 }, index, kind, message };
  };
  const mistake = getMistakes(grid, state)[0];
  if (mistake) {
    const row = Math.floor(mistake.index / grid.width);
    const column = mistake.index % grid.width;
    const required = grid.solution[row][column];
    return setHint(mistake.index, required, 'correction',
      `One correction: row ${row + 1}, column ${column + 1} ${required ? 'needs ink; its X is now filled' : 'must stay empty; its fill is now an X'}. One hint used.`);
  }

  const deductions: { index: number; filled: boolean; axis: string; line: number; clues: readonly number[] }[] = [];
  const findDeductions = (indices: number[], clues: readonly number[], axis: string, line: number) => {
    const known = indices.map((index) => state.cells[index] === 'empty' ? null : state.cells[index] === 'filled');
    const candidates = enumerateLine(indices.length, clues, known);
    if (!candidates.length) return;
    indices.forEach((index, position) => {
      if (state.cells[index] !== 'empty') return;
      const filled = candidates[0][position];
      if (candidates.every((candidate) => candidate[position] === filled)) {
        deductions.push({ index, filled, axis, line, clues });
      }
    });
  };
  grid.clues.rows.forEach((clues, row) =>
    findDeductions(Array.from({ length: grid.width }, (_, column) => row * grid.width + column), clues, 'Row', row + 1));
  grid.clues.columns.forEach((clues, column) =>
    findDeductions(Array.from({ length: grid.height }, (_, row) => row * grid.width + column), clues, 'Column', column + 1));
  const deduction = deductions.find((item) => item.filled) ?? deductions[0];
  if (deduction) {
    const row = Math.floor(deduction.index / grid.width) + 1;
    const column = deduction.index % grid.width + 1;
    return setHint(deduction.index, deduction.filled, 'deduction',
      `${deduction.axis} ${deduction.line} (${deduction.clues.join(', ') || '0'}): every possible arrangement ${deduction.filled ? 'fills' : 'leaves empty'} row ${row}, column ${column}. ${deduction.filled ? 'Filled' : 'Marked X'} for you. One hint used.`);
  }

  // A reveal is explicitly named, rather than presenting a solution lookup as a deduction.
  const index = state.cells.findIndex((cell, position) => cell !== 'filled'
    && grid.solution[Math.floor(position / grid.width)][position % grid.width]);
  return setHint(index, true, 'reveal',
    `A one-square reveal: row ${Math.floor(index / grid.width) + 1}, column ${index % grid.width + 1} needs ink. Filled for you. One hint used.`);
}
