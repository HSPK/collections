import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseManifest } from '../../src/core/manifest';
import type { ProjectInstance } from '../../src/core/types';
import { presetBoard, presetById, presets, ruleById } from '../../src/projects/rules/data';
import {
  createBoard, equalBoards, linePoints, livingPoints, neighborCount, nextCell,
  paintCells, parseRule, patternPoints, population, ruleNotation, serializeBoard, stepBoard,
} from '../../src/projects/rules/engine';
import type { Board, Point, Rule } from '../../src/projects/rules/engine';
import manifest from '../../src/projects/rules/manifest.json' with { type: 'json' };

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

function after(board: Board, rule: Rule, steps: number): Board {
  let current = board;
  for (let generation = 0; generation < steps; generation += 1) current = stepBoard(current, rule).board;
  return current;
}

test.describe('Garden of Rules pure engine', () => {
  test('manifest and seed catalogue describe a complete page with a composed Life opening', () => {
    expect(parseManifest(manifest)).toMatchObject({ id: 'rules', order: 23, title: 'Garden of Rules', category: 'learn', format: 'page' });
    expect(presets.length).toBeGreaterThanOrEqual(6);
    expect(population(presetBoard(presets[0]))).toBe(23);
    for (const preset of presets) {
      const board = presetBoard(preset);
      expect(board.cells).toHaveLength(24 * 18);
      expect(population(board)).toBeGreaterThan(0);
      expect(Object.isFrozen(board)).toBe(true);
      expect(Object.isFrozen(board.cells)).toBe(true);
      expect(parseRule(ruleNotation(ruleById(preset.ruleId))).valid).toBe(true);
    }
  });

  test('Life blinker alternates orientations and records exact births and deaths without mutation', () => {
    const horizontal = createBoard(5, 5, [[1, 2], [2, 2], [3, 2]]);
    const first = stepBoard(horizontal, ruleById('life'));
    expect(livingPoints(first.board)).toEqual([[2, 1], [2, 2], [2, 3]]);
    expect(first).toMatchObject({ population: 3, births: 2, deaths: 2 });
    expect(equalBoards(stepBoard(first.board, ruleById('life')).board, horizontal)).toBe(true);
    expect(livingPoints(horizontal)).toEqual([[1, 2], [2, 2], [3, 2]]);
    expect(first.board).not.toBe(horizontal);
  });

  test('Life glider returns to its phase after four steps, translated one row and column', () => {
    const glider = presetBoard(presetById('glider'));
    const shifted = createBoard(glider.width, glider.height, livingPoints(glider).map(([x, y]): Point => [x + 1, y + 1]));
    expect(after(glider, ruleById('life'), 4)).toEqual(shifted);
    expect(population(after(glider, ruleById('life'), 4))).toBe(5);
  });

  test('Life still lifes, toad and pulsar have the advertised behavior', () => {
    const block = createBoard(8, 8, patternPoints(['OO', 'OO'], 3, 3));
    const still = stepBoard(block, ruleById('life'));
    expect(still).toMatchObject({ population: 4, births: 0, deaths: 0 });
    expect(still.board).toEqual(block);
    const toad = presetBoard(presetById('toad'));
    expect(stepBoard(toad, ruleById('life')).board).not.toEqual(toad);
    expect(after(toad, ruleById('life'), 2)).toEqual(toad);
    const pulsar = presetBoard(presetById('pulsar'));
    expect(population(pulsar)).toBe(48);
    expect(after(pulsar, ruleById('life'), 1)).not.toEqual(pulsar);
    expect(after(pulsar, ruleById('life'), 2)).not.toEqual(pulsar);
    expect(after(pulsar, ruleById('life'), 3)).toEqual(pulsar);
  });

  test('bounded edges die outside the board while wrapping edges meet their opposite side', () => {
    const edge = createBoard(5, 5, [[0, 1], [0, 2], [0, 3]]);
    const bounded = stepBoard(edge, ruleById('life'), 'bounded');
    const wrapped = stepBoard(edge, ruleById('life'), 'wrap');
    expect(livingPoints(bounded.board)).toEqual([[0, 2], [1, 2]]);
    expect(livingPoints(wrapped.board)).toEqual([[0, 2], [1, 2], [4, 2]]);
    expect(stepBoard(wrapped.board, ruleById('life'), 'wrap').board).toEqual(edge);
    expect(neighborCount(edge, [4, 2], 'bounded')).toBe(0);
    expect(neighborCount(edge, [4, 2], 'wrap')).toBe(3);
    const corner = createBoard(5, 5, [[4, 4], [0, 4], [4, 0]]);
    expect(neighborCount(corner, [0, 0], 'wrap')).toBe(3);
    expect(neighborCount(corner, [0, 0], 'bounded')).toBe(0);
  });

  test('the Moore neighborhood includes all eight neighbors but never the center', () => {
    const full = createBoard(3, 3, patternPoints(['OOO', 'OOO', 'OOO']));
    expect(neighborCount(full, [1, 1], 'bounded')).toBe(8);
    expect(neighborCount(full, [0, 0], 'bounded')).toBe(3);
    expect(neighborCount(full, [0, 0], 'wrap')).toBe(8);
    expect(neighborCount(createBoard(3, 3, [[1, 1]]), [1, 1], 'bounded')).toBe(0);
  });

  test('HighLife really births at six and its seed makes two copies after twelve generations', () => {
    expect(nextCell(0, 6, ruleById('life'))).toBe(0);
    expect(nextCell(0, 6, ruleById('highlife'))).toBe(1);
    expect(nextCell(1, 6, ruleById('highlife'))).toBe(0);
    const replicator = presetBoard(presetById('replicator'));
    const copied = after(replicator, ruleById('highlife'), 12);
    const expectedPoints = livingPoints(replicator).flatMap(([x, y]): Point[] => [[x - 2, y - 2], [x + 2, y + 2]]);
    expect(population(replicator)).toBe(12);
    expect(copied).toEqual(createBoard(replicator.width, replicator.height, expectedPoints));
    expect(population(copied)).toBe(24);
    expect(after(replicator, ruleById('life'), 12)).not.toEqual(copied);
  });

  test('Seeds has no survivors; a four-cell square is replaced by eight births', () => {
    const square = presetBoard(presetById('seeds-square'));
    const result = stepBoard(square, ruleById('seeds'));
    expect(result).toMatchObject({ population: 8, births: 8, deaths: 4 });
    for (let index = 0; index < square.cells.length; index += 1) {
      if (square.cells[index]) expect(result.board.cells[index]).toBe(0);
    }
    for (let neighbors = 0; neighbors <= 8; neighbors += 1) {
      expect(nextCell(1, neighbors, ruleById('seeds'))).toBe(0);
      expect(nextCell(0, neighbors, ruleById('seeds'))).toBe(neighbors === 2 ? 1 : 0);
    }
  });

  test('rule parsing normalizes counts, permits empty halves, and rejects malformed rules explicitly', () => {
    const sorted = parseRule(' b63/s32 ');
    expect(sorted.valid).toBe(true);
    if (sorted.valid) {
      expect(ruleNotation(sorted.rule)).toBe('B36/S23');
      expect(Object.isFrozen(sorted.rule.birth)).toBe(true);
    }
    for (const text of ['B/S', 'B0/S', 'B012345678/S012345678']) expect(parseRule(text).valid).toBe(true);
    for (const text of ['', 'B9/S23', 'S23/B3', 'B33/S23', 'B3/S22', 'B3S23', 'B3/S2.3', '<script>']) {
      const result = parseRule(text);
      expect(result.valid, text).toBe(false);
      if (!result.valid) expect(result.error.length).toBeGreaterThan(20);
    }
    const birthZero = parseRule('B0/S');
    if (!birthZero.valid) throw new Error('Valid test rule failed to parse.');
    const empty = createBoard(5, 5);
    expect(stepBoard(empty, birthZero.rule)).toMatchObject({ population: 25, births: 25, deaths: 0 });
    expect(stepBoard(stepBoard(empty, birthZero.rule).board, birthZero.rule)).toMatchObject({ population: 0, births: 0, deaths: 25 });
  });

  test('painting is immutable and a continuous stroke fills every intervening cell', () => {
    const source: Point[] = [[1, 1]];
    const board = createBoard(6, 6, source);
    source.push([2, 2]);
    expect(population(board)).toBe(1);
    expect(linePoints([1, 1], [4, 4])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(linePoints([4, 1], [1, 1])).toEqual([[4, 1], [3, 1], [2, 1], [1, 1]]);
    const painted = paintCells(board, linePoints([1, 1], [4, 4]), 1);
    expect(population(painted)).toBe(4);
    expect(population(board)).toBe(1);
    expect(paintCells(painted, [[2, 2]], 1)).toBe(painted);
    expect(population(paintCells(painted, [[2, 2]], 0))).toBe(3);
    expect(() => createBoard(2, 5)).toThrow('3 to 128');
    expect(() => createBoard(5, 5, [[5, 0]])).toThrow('inside');
    expect(() => paintCells(board, [[0.5, 1]], 1)).toThrow('whole-number');
    expect(() => patternPoints(['OO', 'O'])).toThrow('equally wide');
    expect(() => patternPoints(['XX'])).toThrow('only');
  });

  test('every step conserves the population accounting identity and snapshots record real state', () => {
    for (const preset of presets) {
      const board = presetBoard(preset);
      const rule = ruleById(preset.ruleId);
      const result = stepBoard(board, rule);
      expect(result.population).toBe(population(board) + result.births - result.deaths);
      expect(result.population).toBe(population(result.board));
      const snapshot = JSON.parse(serializeBoard(result.board, rule, 'wrap', 1));
      expect(snapshot).toMatchObject({
        format: 'garden-of-rules', version: 1, generation: 1,
        population: result.population, rule: ruleNotation(rule), boundary: 'wrap',
      });
      expect(createBoard(snapshot.width, snapshot.height, snapshot.living)).toEqual(result.board);
    }
    expect(() => serializeBoard(createBoard(5, 5), ruleById('life'), 'bounded', -1)).toThrow('nonnegative');
  });
});

interface RulesHarness {
  controller: AbortController;
  instance: ProjectInstance;
  frames: Set<number>;
  reports: string[];
}

declare global {
  interface Window {
    __rulesHarness?: RulesHarness;
  }
}

async function mountRules(page: Page) {
  await page.route('**/projects/rules/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Garden of Rules isolated mount</title><style>body{margin:0}</style></head>
      <body><main id="rules-host"></main><script type="module">
        import { mount } from '/src/projects/rules/index.ts';
        const frames = new Set();
        const request = window.requestAnimationFrame.bind(window);
        const cancel = window.cancelAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) => {
          const id = request((time) => { frames.delete(id); callback(time); });
          frames.add(id);
          return id;
        };
        window.cancelAnimationFrame = (id) => { frames.delete(id); cancel(id); };
        const controller = new AbortController();
        const reports = [];
        const instance = mount({
          container: document.querySelector('#rules-host'), controls: document.createElement('div'),
          signal: controller.signal, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          report: (message) => reports.push(message),
        });
        window.__rulesHarness = { controller, instance, frames, reports };
      </script></body></html>`,
  }));
  await page.goto('./projects/rules/');
  await expect(page.locator('.project-rules')).toBeVisible();
}

test.describe('Garden of Rules isolated browser', () => {
  test('opens still, advances the real board, plays only explicitly, and resets its cells', async ({ page }) => {
    await mountRules(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Garden of Rules', exact: true })).toBeVisible();
    await expect(page.locator('[data-population]')).toHaveText('23');
    await page.waitForTimeout(450);
    await expect(page.locator('[data-generation]')).toHaveText('0');
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    const next = stepBoard(presetBoard(presets[0]), ruleById('life'));
    await expect(page.locator('[data-generation]')).toHaveText('1');
    await expect(page.locator('[data-population]')).toHaveText(String(next.population));
    await expect(page.locator('[data-births]')).toHaveText(String(next.births));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.locator('[data-generation]').textContent()).not.toBe('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const stopped = await page.locator('[data-generation]').textContent();
    await page.waitForTimeout(450);
    await expect(page.locator('[data-generation]')).toHaveText(stopped!);
    await page.getByRole('button', { name: 'Reset pattern', exact: true }).click();
    await expect(page.locator('[data-generation]')).toHaveText('0');
    await expect(page.locator('[data-population]')).toHaveText('23');
  });

  test('presets, keyboard painting, coordinates, and undo operate on the displayed state', async ({ page }) => {
    await mountRules(page);
    await page.locator('[data-preset]').selectOption('blinker');
    await expect(page.locator('[data-population]')).toHaveText('23');
    await page.getByRole('button', { name: 'Load pattern + its rule', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('3');
    const board = page.getByRole('grid');
    await board.focus();
    await board.press('Control+Home');
    await expect(board).toHaveAttribute('aria-activedescendant', 'rules-cell-0');
    await board.press(' ');
    await expect(page.locator('#rules-cell-0')).toHaveAttribute('aria-label', 'Row 1, column 1, alive');
    await expect(page.locator('[data-population]')).toHaveText('4');
    await board.press('Delete');
    await expect(page.locator('[data-population]')).toHaveText('3');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('4');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Plant', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Row', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'Column', exact: true }).fill('2');
    await page.getByRole('button', { name: 'Apply brush', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('5');
    await expect(page.locator('[data-inspector]')).toContainText('Row 2, column 2: alive.');
    await page.getByRole('button', { name: 'Clear grid', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('5');
  });

  test('custom rules report errors without changing state and Seeds really removes survivors', async ({ page }) => {
    await mountRules(page);
    await page.getByRole('tab', { name: 'Rules', exact: true }).click();
    await page.getByText('Write a custom B/S rule', { exact: true }).click();
    const custom = page.locator('[data-custom-input]');
    await custom.fill('B9/S23');
    await page.getByRole('button', { name: 'Apply rule', exact: true }).click();
    await expect(custom).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-rule-error]')).toBeVisible();
    await expect(page.locator('[data-rule]')).toHaveValue('life');
    await expect(page.locator('[data-population]')).toHaveText('23');
    await custom.fill('B0/S');
    await page.getByRole('button', { name: 'Apply rule', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveValue('custom');
    await expect(page.locator('[data-rule-description]')).toContainText('exactly 0 living neighbors');
    await page.getByRole('tab', { name: 'Plant', exact: true }).click();
    await page.locator('[data-preset]').selectOption('seeds-square');
    await page.getByRole('button', { name: 'Load pattern + its rule', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveValue('seeds');
    await expect(page.locator('[data-population]')).toHaveText('4');
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('8');
    await expect(page.locator('[data-births]')).toHaveText('8');
    await expect(page.locator('[data-deaths]')).toHaveText('4');
    await page.getByRole('tab', { name: 'Rules', exact: true }).click();
    await page.locator('[data-boundary]').selectOption('wrap');
    await expect(page.locator('[data-generation]')).toHaveText('0');
    await expect(page.locator('[data-population]')).toHaveText('8');
  });

  test('pointer strokes paint continuous cells and undo as one edit', async ({ page }) => {
    await mountRules(page);
    await page.getByRole('button', { name: 'Clear grid', exact: true }).click();
    const board = page.getByRole('grid');
    await board.scrollIntoViewIfNeeded();
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error('Expected a visible garden grid.');
    const y = bounds.y + bounds.height * 4.5 / 18;
    await page.mouse.move(bounds.x + bounds.width * 4.5 / 24, y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 7.5 / 24, y);
    await page.mouse.up();
    await expect(page.locator('[data-population]')).toHaveText('4');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('0');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Pan view instead of painting').check();
    await board.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await expect(page.locator('[data-population]')).toHaveText('0');
  });

  test('reset points and local JSON preserve the chosen state, not a canned template', async ({ page }) => {
    await mountRules(page);
    await page.getByRole('button', { name: 'Clear grid', exact: true }).click();
    const board = page.getByRole('grid');
    await board.focus();
    await board.press('Control+Home');
    await board.press(' ');
    await page.getByRole('tab', { name: 'Keep', exact: true }).click();
    await page.getByRole('button', { name: 'Set as start', exact: true }).click();
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('0');
    await page.getByRole('button', { name: 'Reset pattern', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('1');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('garden-of-rules-generation-0.json');
    const path = await download.path();
    if (!path) throw new Error('Expected a local JSON download.');
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      population: 1, generation: 0, living: [[0, 0]], rule: 'B3/S23', boundary: 'bounded',
    });
    await expect(page.locator('[data-status]')).toContainText('JSON snapshot downloaded');
  });

  test('narrow-screen controls remain readable and board zoom is local', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mountRules(page);
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Generations per second')).toHaveValue('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Board zoom').selectOption('300');
    expect(await page.locator('.rules-board-scroll').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('button', { name: 'Apply brush', exact: true }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const smallest = await page.locator('button, label, .rules-help, .rules-eyebrow, dt').evaluateAll((elements) =>
      Math.min(...elements.filter((element) => element.getBoundingClientRect().height).map((element) => parseFloat(getComputedStyle(element).fontSize))),
    );
    expect(smallest).toBeGreaterThanOrEqual(14);
  });

  test('route exit releases playback and event listeners', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mountRules(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__rulesHarness?.frames.size ?? 0)).toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const harness = window.__rulesHarness;
      const play = document.querySelector<HTMLButtonElement>('[data-play]');
      if (!harness || !play) throw new Error('Missing rules harness.');
      const reports = harness.reports.length;
      harness.controller.abort();
      harness.instance.destroy();
      play.click();
      return { frames: harness.frames.size, sameReports: reports === harness.reports.length };
    });
    expect(result).toEqual({ frames: 0, sameReports: true });
    await expect(page.locator('.project-rules')).toHaveCount(0);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__rulesHarness?.frames.size)).toBe(0);
    expect(errors).toEqual([]);
  });
});
