import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseManifest } from '../../src/core/manifest';
import { puzzles } from '../../src/projects/nonogram/data';
import {
  checkPuzzle, createGrid, createState, enumerateLine, getMistakes, isComplete,
  lineMatches, paintCell, runClues, solveClues, summarize, takeHint,
} from '../../src/projects/nonogram/engine';
import type { CellState, GameState } from '../../src/projects/nonogram/engine';

const independentRuns = (line: string) => (line.match(/#+/g) ?? []).map((run) => run.length);
const solutionState = (index = 0): GameState => ({
  ...createState(puzzles[index]),
  cells: puzzles[index].solution.flat().map((filled) => filled ? 'filled' : 'empty'),
});

test.describe('nonogram engine', () => {
  test('metadata registers the complete standalone puzzle page', () => {
    const manifest = parseManifest(JSON.parse(readFileSync(
      new URL('../../src/projects/nonogram/manifest.json', import.meta.url), 'utf8',
    )));
    expect(manifest).toMatchObject({
      id: 'nonogram', order: 19, title: 'Nonogram Club', category: 'play', format: 'page',
    });
  });

  test('the edition has four valid, distinct original picture grids', () => {
    expect(puzzles).toHaveLength(4);
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(4);
    expect(new Set(puzzles.map((puzzle) => puzzle.pattern.join(''))).size).toBe(4);
    for (const puzzle of puzzles) {
      expect(puzzle.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect([8, 10]).toContain(puzzle.width);
      expect(puzzle.height).toBe(puzzle.width);
      expect(puzzle.title.length).toBeGreaterThan(5);
      expect(puzzle.pattern.every((row) => /^[.#]+$/.test(row) && row.length === puzzle.width)).toBe(true);
      expect(puzzle.totalFilled).toBeGreaterThan(0);
      expect(puzzle.totalFilled).toBeLessThan(puzzle.width * puzzle.height);
    }
  });

  for (const puzzle of puzzles) {
    test(`${puzzle.id}: every clue independently reconstructs its solution line`, () => {
      puzzle.pattern.forEach((row, index) => {
        expect(puzzle.clues.rows[index]).toEqual(independentRuns(row));
        expect(enumerateLine(puzzle.width, puzzle.clues.rows[index])).toContainEqual(puzzle.solution[index]);
      });
      for (let column = 0; column < puzzle.width; column += 1) {
        const line = puzzle.pattern.map((row) => row[column]).join('');
        expect(puzzle.clues.columns[column]).toEqual(independentRuns(line));
        expect(enumerateLine(puzzle.height, puzzle.clues.columns[column]))
          .toContainEqual(puzzle.solution.map((row) => row[column]));
      }
      expect(puzzle.clues.rows.flat().reduce((sum, run) => sum + run, 0)).toBe(puzzle.totalFilled);
      expect(puzzle.clues.columns.flat().reduce((sum, run) => sum + run, 0)).toBe(puzzle.totalFilled);
    });

    test(`${puzzle.id}: clues have exactly the intended solution, with no guessing`, () => {
      const solved = solveClues(puzzle.clues, 2);
      expect(solved.solutions).toEqual([puzzle.solution]);
      expect(solved.branches).toBe(0);
    });

    test(`${puzzle.id}: hints make one honest change and eventually complete the picture`, () => {
      let state = createState(puzzle);
      for (let count = 0; count < puzzle.width * puzzle.height && !isComplete(puzzle, state); count += 1) {
        const hint = takeHint(puzzle, state);
        expect(hint.index).not.toBeNull();
        expect(hint.state.hints).toBe(state.hints + 1);
        expect(hint.state.moves).toBe(0);
        expect(hint.state.cells.filter((cell, index) => cell !== state.cells[index])).toHaveLength(1);
        expect(hint.kind).toBe('deduction');
        expect(getMistakes(puzzle, hint.state)).toEqual([]);
        state = hint.state;
      }
      expect(isComplete(puzzle, state)).toBe(true);
      expect(takeHint(puzzle, state).state).toBe(state);
    });
  }

  test('run generation handles no ink, a full line, gaps, and trailing runs', () => {
    expect(runClues([false, false])).toEqual([]);
    expect(runClues([true, true, true])).toEqual([3]);
    expect(runClues([false, true, true, false, true, false, true, true])).toEqual([2, 1, 2]);
    expect(() => createGrid([])).toThrow();
    expect(() => createGrid(['##', '#'])).toThrow();
    expect(() => createGrid(['#x'])).toThrow();
    expect(() => createGrid(['#'.repeat(16)])).toThrow();
  });

  test('line candidates obey runs, mandatory gaps, and known filled or X squares', () => {
    const candidates = enumerateLine(8, [2, 3]);
    expect(candidates).toHaveLength(6);
    for (const candidate of candidates) {
      expect(independentRuns(candidate.map((cell) => cell ? '#' : '.').join(''))).toEqual([2, 3]);
    }
    expect(enumerateLine(3, [1, 1])).toEqual([[true, false, true]]);
    expect(enumerateLine(3, [])).toEqual([[false, false, false]]);
    expect(enumerateLine(3, [1, 1], [false, null, null])).toEqual([]);
    expect(enumerateLine(3, [1], [null, true, null])).toEqual([[false, true, false]]);
    expect(enumerateLine(3, [2, 2])).toEqual([]);
    expect(enumerateLine(3, [0])).toEqual([]);
    expect(enumerateLine(-1, [])).toEqual([]);
    expect(enumerateLine(2.5, [])).toEqual([]);
    expect(enumerateLine(16, [])).toEqual([]);
    expect(enumerateLine(3, [1], [null])).toEqual([]);
  });

  test('the solver detects ambiguity and impossible clues rather than assuming uniqueness', () => {
    const ambiguous = solveClues({ rows: [[1], [1]], columns: [[1], [1]] });
    expect(ambiguous.solutions).toHaveLength(2);
    expect(ambiguous.branches).toBeGreaterThan(0);
    expect(solveClues({ rows: [[1], [1]], columns: [[1], [1]] }, 1).solutions).toHaveLength(1);
    expect(solveClues({ rows: [[2], []], columns: [[], []] }).solutions).toEqual([]);
    expect(() => solveClues({ rows: [], columns: [] })).toThrow();
  });

  test('solver results agree with a brute-force oracle for every 3×3 picture', () => {
    const groups = new Map<string, Set<string>>();
    for (let bits = 0; bits < 512; bits += 1) {
      const pattern = Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 3 }, (_, column) => bits & (1 << (row * 3 + column)) ? '#' : '.').join(''));
      const clues = {
        rows: pattern.map(independentRuns),
        columns: Array.from({ length: 3 }, (_, column) => independentRuns(pattern.map((row) => row[column]).join(''))),
      };
      const key = JSON.stringify(clues);
      const group = groups.get(key) ?? new Set<string>();
      group.add(pattern.join(''));
      groups.set(key, group);
    }
    for (const [key, possible] of groups) {
      const { solutions } = solveClues(JSON.parse(key));
      expect(solutions).toHaveLength(Math.min(2, possible.size));
      const pictures = solutions.map((solution) => solution.flat().map((filled) => filled ? '#' : '.').join(''));
      expect(new Set(pictures).size).toBe(pictures.length);
      expect(pictures.every((picture) => possible.has(picture))).toBe(true);
    }
  });

  test('completion never requires X marks in empty solution squares', () => {
    for (let index = 0; index < puzzles.length; index += 1) {
      const puzzle = puzzles[index];
      const solved = solutionState(index);
      expect(solved.cells).toContain('empty');
      expect(isComplete(puzzle, solved)).toBe(true);
      expect(isComplete(puzzle, {
        ...solved, cells: solved.cells.map((cell) => cell === 'empty' ? 'crossed' : cell),
      })).toBe(true);
      const required = puzzle.solution.flat().findIndex(Boolean);
      const empty = puzzle.solution.flat().findIndex((cell) => !cell);
      for (const [position, value] of [[required, 'empty'], [required, 'crossed'], [empty, 'filled']] as const) {
        const cells = [...solved.cells];
        cells[position] = value;
        expect(isComplete(puzzle, { ...solved, cells })).toBe(false);
      }
    }
  });

  test('fill and X toggle, replace each other, erase, and do not mutate the prior state', () => {
    const puzzle = puzzles[0];
    const original = createState(puzzle);
    let state = paintCell(puzzle, original, 9, 'fill');
    expect(state.cells[9]).toBe('filled');
    expect(state.moves).toBe(1);
    expect(original.cells[9]).toBe('empty');
    state = paintCell(puzzle, state, 9, 'fill');
    expect(state.cells[9]).toBe('empty');
    state = paintCell(puzzle, state, 9, 'cross');
    expect(state.cells[9]).toBe('crossed');
    state = paintCell(puzzle, state, 9, 'cross');
    expect(state.cells[9]).toBe('empty');
    state = paintCell(puzzle, state, 9, 'cross');
    state = paintCell(puzzle, state, 9, 'fill');
    expect(state.cells[9]).toBe('filled');
    state = paintCell(puzzle, state, 9, 'cross');
    expect(state.cells[9]).toBe('crossed');
    state = paintCell(puzzle, state, 9, 'erase');
    expect(state.cells[9]).toBe('empty');
    expect(state.moves).toBe(8);
    expect(paintCell(puzzle, state, 9, 'erase')).toBe(state);
    expect(paintCell(puzzle, state, -1, 'fill')).toBe(state);
    expect(paintCell(puzzle, state, 100, 'fill')).toBe(state);
    expect(paintCell(puzzle, state, 1.2, 'fill')).toBe(state);
    const solved = solutionState();
    expect(paintCell(puzzle, solved, 9, 'erase')).toBe(solved);
  });

  test('checking counts only explicit contradictions, not missing required ink', () => {
    const puzzle = puzzles[0];
    const original = createState(puzzle);
    const blankCheck = checkPuzzle(puzzle, original);
    expect(blankCheck.mistakes).toEqual([]);
    expect(blankCheck.remaining).toBe(puzzle.totalFilled);
    expect(blankCheck.state.checks).toBe(1);
    expect(original.checks).toBe(0);
    let state = paintCell(puzzle, blankCheck.state, 0, 'fill');
    state = paintCell(puzzle, state, 9, 'cross');
    const checked = checkPuzzle(puzzle, state);
    expect(checked.mistakes).toEqual([{ index: 0, kind: 'extra-fill' }, { index: 9, kind: 'crossed-fill' }]);
    expect(checked.state.cells).toBe(state.cells);
    expect(checked.state.checks).toBe(2);
    expect(checked.state.hints).toBe(0);
    expect(checked.complete).toBe(false);
    expect(checkPuzzle(puzzle, solutionState()).state.checks).toBe(0);
  });

  test('hints correct one wrong mark first and never count as manual moves', () => {
    const puzzle = puzzles[0];
    let state = paintCell(puzzle, createState(puzzle), 0, 'fill');
    state = paintCell(puzzle, state, 9, 'cross');
    const first = takeHint(puzzle, state);
    expect(first.kind).toBe('correction');
    expect(first.index).toBe(0);
    expect(first.state.cells[0]).toBe('crossed');
    expect(first.state.cells[9]).toBe('crossed');
    expect(first.state.moves).toBe(2);
    expect(first.state.hints).toBe(1);
    const second = takeHint(puzzle, first.state);
    expect(second.kind).toBe('correction');
    expect(second.index).toBe(9);
    expect(second.state.cells[9]).toBe('filled');
    expect(second.state.hints).toBe(2);
    expect(getMistakes(puzzle, second.state)).toEqual([]);
  });

  test('a non-deducible hint is honestly called a one-square reveal', () => {
    const ambiguous = createGrid(['#.', '.#']);
    const hint = takeHint(ambiguous, createState(ambiguous));
    expect(hint.kind).toBe('reveal');
    expect(hint.message).toContain('one-square reveal');
    expect(hint.state.cells.filter((cell) => cell === 'filled')).toHaveLength(1);
  });

  test('matching runs is not falsely treated as a correct placement check', () => {
    const grid = createGrid(['.#', '#.']);
    const cells: CellState[] = ['filled', 'empty', 'empty', 'filled'];
    const state = { ...createState(grid), cells };
    expect(lineMatches(cells.slice(0, 2), [1])).toBe(true);
    expect(summarize(grid, state).matchedLines).toBe(4);
    expect(isComplete(grid, state)).toBe(false);
    expect(getMistakes(grid, state)).toHaveLength(2);
  });

  test('new attempts and different puzzle states do not share cells or counters', () => {
    const first = paintCell(puzzles[0], createState(puzzles[0]), 9, 'fill');
    const second = takeHint(puzzles[1], createState(puzzles[1])).state;
    const resetFirst = createState(puzzles[0]);
    expect(first.cells[9]).toBe('filled');
    expect(resetFirst.cells.every((cell) => cell === 'empty')).toBe(true);
    expect(resetFirst.moves + resetFirst.hints + resetFirst.checks).toBe(0);
    expect(second.hints).toBe(1);
    expect(second.cells.some((cell) => cell !== 'empty')).toBe(true);
  });
});

test.describe('nonogram browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./projects/nonogram/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nonogram Club.' })).toBeVisible();
  });

  test('the laptop paper keeps every board and its primary controls in view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const site = page.locator('.project-nonogram');
    const preview = site.locator('[data-project-preview]');
    await expect(preview).toHaveCount(1);
    for (const puzzle of puzzles) {
      await site.locator(`[data-puzzle="${puzzle.id}"]`).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const selector of ['[data-board]', '.nc-paint-tools', '.nc-game-actions']) {
        const region = preview.locator(selector);
        const bounds = await region.boundingBox();
        if (!bounds) throw new Error(`Missing laptop gameplay region: ${selector}`);
        expect(bounds.y, `${puzzle.id}: ${selector} is below the return bar`).toBeGreaterThan(40);
        expect(bounds.y + bounds.height, `${puzzle.id}: ${selector} fits without scrolling`).toBeLessThanOrEqual(760);
      }
      const cell = await preview.locator('[data-cell="0"]').boundingBox();
      if (!cell) throw new Error('The laptop board is missing its first cell.');
      expect(cell.width).toBeGreaterThanOrEqual(28);
      expect(cell.height).toBeGreaterThanOrEqual(28);
    }
  });

  test('touch tools, right-click, keyboard painting, and one roving tab stop', async ({ page }) => {
    const board = page.getByRole('grid');
    const first = board.locator('[data-cell="0"]');
    const second = board.locator('[data-cell="1"]');
    await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(board.locator('button')).toHaveCount(64);
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await page.keyboard.press('x');
    await expect(second).toHaveAttribute('data-state', 'crossed');
    await page.keyboard.press('Space');
    await expect(second).toHaveAttribute('data-state', 'filled');
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('data-state', 'empty');
    await page.keyboard.press('End');
    await expect(board.locator('[data-cell="7"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(board.locator('[data-cell="7"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await first.click({ button: 'right' });
    await expect(first).toHaveAttribute('aria-label', /Row 1, column 1: marked X/);
    await page.getByRole('button', { name: 'Mark X', exact: true }).click();
    await second.click();
    await expect(second).toHaveAttribute('data-state', 'crossed');
    await second.click();
    await expect(second).toHaveAttribute('data-state', 'empty');
    await page.keyboard.press('f');
    await expect(second).toHaveAttribute('data-state', 'filled');
    await page.keyboard.press('Backspace');
    await expect(second).toHaveAttribute('data-state', 'empty');
    await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
  });

  test('checks and hints are accurate, and selection and reset preserve other puzzles', async ({ page }) => {
    await page.locator('[data-cell="0"]').click();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.locator('[data-cell][aria-invalid="true"]')).toHaveCount(1);
    await expect(page.locator('.project-nonogram [data-feedback]')).toContainText('Unfilled squares are not counted as mistakes');
    await page.getByRole('button', { name: 'One hint', exact: true }).click();
    await expect(page.locator('[data-cell="0"]')).toHaveAttribute('data-state', 'crossed');
    await expect(page.locator('[data-hints]')).toHaveText('1');
    await expect(page.locator('[data-cell][aria-invalid="true"]')).toHaveCount(0);
    await page.locator('[data-cell="9"]').click();
    await page.getByRole('button', { name: /Puzzle 02: A little growth/ }).click();
    await page.locator('[data-cell="3"]').click();
    await page.getByRole('button', { name: /Puzzle 01: Morning ritual/ }).click();
    await expect(page.locator('[data-cell="9"]')).toHaveAttribute('data-state', 'filled');
    await expect(page.locator('[data-cell="0"]')).toHaveAttribute('data-state', 'crossed');
    await expect(page.locator('[data-hints]')).toHaveText('1');
    await expect(page.locator('[data-checks]')).toHaveText('1');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Keep going' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Clear this puzzle', exact: true }).click();
    await expect(page.locator('[data-cell][data-state="empty"]')).toHaveCount(64);
    await expect(page.locator('[data-moves]')).toHaveText('0');
    await expect(page.locator('[data-hints]')).toHaveText('0');
    await expect(page.locator('[data-checks]')).toHaveText('0');
    await page.getByRole('button', { name: /Puzzle 02: A little growth/ }).click();
    await expect(page.locator('[data-cell="3"]')).toHaveAttribute('data-state', 'filled');
    await expect(page.locator('[data-moves]')).toHaveText('1');
  });

  test('genuine completion reveals the picture without any X marks and permits replay', async ({ page }) => {
    for (const [index, filled] of puzzles[0].solution.flat().entries()) {
      if (filled) await page.locator(`[data-cell="${index}"]`).click();
    }
    await expect(page.locator('[data-result]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The Sunday cup', exact: true })).toBeFocused();
    await expect(page.locator('[data-collected-count]')).toHaveText('1');
    await expect(page.locator('[data-cell][data-state="crossed"]')).toHaveCount(0);
    await expect(page.locator('[data-result-counts]')).toContainText('0 hints');
    await expect(page.getByRole('button', { name: 'One hint', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Play this one again', exact: true }).click();
    await expect(page.locator('[data-result]')).toBeHidden();
    await expect(page.locator('[data-cell][data-state="empty"]')).toHaveCount(64);
    await expect(page.locator('[data-collected-count]')).toHaveText('1');
    await page.getByRole('button', { name: 'Next puzzle', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'A little growth' })).toBeVisible();
  });

  test('the 10×10 board fits a 375px phone with usable cell buttons', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: /Puzzle 03: Out of office/ }).click();
    await expect(page.getByRole('grid').locator('button')).toHaveCount(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cell = await page.locator('[data-cell="0"]').boundingBox();
    expect(cell!.width).toBeGreaterThanOrEqual(24);
    expect(cell!.height).toBeGreaterThanOrEqual(24);
    await page.getByRole('button', { name: 'Mark X', exact: true }).click();
    await page.locator('[data-cell="0"]').click();
    await expect(page.locator('[data-cell="0"]')).toHaveAttribute('data-state', 'crossed');
  });
});
