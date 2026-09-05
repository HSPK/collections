import { expect, test } from '@playwright/test';
import { DICTIONARY, PUZZLES, WORDS } from '../../src/projects/word-circuit/data';
import {
  backtrack, buildGraph, changedLetterIndex, createGame, currentWord, findShortestPath,
  isSolved, legalNextWords, moveCount, playMove, remainingPath, requestHint, resetGame, validateMove,
} from '../../src/projects/word-circuit/engine';

const graph = buildGraph(WORDS);

test.describe('word-circuit engine', () => {
  test('every curated entry is unique, defined, four-letter, and connected', () => {
    expect(WORDS.length).toBeGreaterThan(100);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const entry of DICTIONARY) {
      expect(entry.word).toMatch(/^[A-Z]{4}$/);
      expect(entry.meaning.trim().length, entry.word).toBeGreaterThan(5);
    }
    const unreachable = WORDS.filter((word) => findShortestPath(graph, 'COLD', word) === null);
    expect(unreachable, 'Every listed word should be usable in the connected word graph').toEqual([]);
  });

  test('the graph contains exactly the symmetric one-position changes', () => {
    for (const word of WORDS) {
      const expected = WORDS.filter((other) => changedLetterIndex(word, other) !== null).sort();
      expect(graph.get(word), word).toEqual(expected);
      expect(graph.get(word)).not.toContain(word);
    }
    expect(changedLetterIndex('COLD', 'CORD')).toBe(2);
    expect(changedLetterIndex('COLD', 'CLOD')).toBeNull();
    expect(changedLetterIndex('COLD', 'COLD')).toBeNull();
    expect(changedLetterIndex('CAT', 'CATS')).toBeNull();
    expect(changedLetterIndex('cold', 'cord')).toBeNull();
    expect(() => buildGraph(['COLD', 'COLD'])).toThrow('Duplicate');
    expect(() => buildGraph(['CAT'])).toThrow('four uppercase');
  });

  test('BFS returns genuine shortest paths, unknown endpoints, and blocked routes', () => {
    const small = buildGraph(['COLD', 'CORD', 'CARD', 'WARD', 'WARM', 'BOLD', 'BOLT']);
    expect(findShortestPath(small, 'COLD', 'WARM')).toEqual(['COLD', 'CORD', 'CARD', 'WARD', 'WARM']);
    expect(findShortestPath(small, 'COLD', 'COLD')).toEqual(['COLD']);
    expect(findShortestPath(small, 'COLD', 'TREE')).toBeNull();
    expect(findShortestPath(small, 'TREE', 'COLD')).toBeNull();
    expect(findShortestPath(small, 'COLD', 'WARM', new Set(['CORD']))).toBeNull();
    expect(findShortestPath(small, 'COLD', 'WARM', new Set(['WARM']))).toBeNull();
    expect(findShortestPath(small, 'COLD', 'WARM', new Set(['COLD']))).toHaveLength(5);
    expect(findShortestPath(buildGraph(['COLD', 'WARM']), 'COLD', 'WARM')).toBeNull();
  });

  test('every authored puzzle can be solved through valid moves and current-word hints', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.id)).size).toBe(PUZZLES.length);
    const lengths: Record<string, number> = {};
    for (const puzzle of PUZZLES) {
      expect(puzzle.start).not.toBe(puzzle.goal);
      const shortest = findShortestPath(graph, puzzle.start, puzzle.goal);
      expect(shortest, puzzle.id).not.toBeNull();
      expect(shortest![0]).toBe(puzzle.start);
      expect(shortest!.at(-1)).toBe(puzzle.goal);
      expect(new Set(shortest).size).toBe(shortest!.length);
      let state = createGame(puzzle);
      for (const next of shortest!.slice(1)) {
        const hint = requestHint(state, graph);
        expect(hint.status).toBe('hint');
        if (hint.status !== 'hint') throw new Error(`Missing hint for ${puzzle.id}`);
        expect(hint.word).toBe(next);
        expect(hint.remainingMoves).toBe(shortest!.length - state.path.length);
        const result = playMove(hint.state, next, graph);
        expect(result.validation.ok, `${currentWord(state)} → ${next}`).toBe(true);
        state = result.state;
      }
      expect(isSolved(state)).toBe(true);
      expect(moveCount(state)).toBe(shortest!.length - 1);
      expect(state.hintsUsed).toBe(moveCount(state));
      expect(requestHint(state, graph).status).toBe('solved');
      expect(playMove(state, puzzle.start, graph).validation).toMatchObject({ ok: false, code: 'solved' });
      lengths[puzzle.id] = moveCount(state);
    }
    expect(lengths['cold-front']).toBe(4);
    expect(new Set(Object.values(lengths)).size).toBeGreaterThanOrEqual(3);
    console.log('Verified shortest move counts:', lengths);
  });

  test('validation accepts case and surrounding whitespace, not malformed or unlisted words', () => {
    expect(validateMove(' cord ', ['COLD'], graph)).toEqual({ ok: true, word: 'CORD', changedIndex: 2 });
    for (const raw of ['', 'CAT', 'COLDER', '1234', 'C0LD', 'C LD', 'CAFÉ', 'CO-L', 'cold\ncard', 'ſold', 'ßold']) {
      expect(validateMove(raw, ['COLD'], graph), raw).toMatchObject({ ok: false, code: 'format' });
    }
    for (const raw of ['ZZZZ', 'TREE']) {
      const result = validateMove(raw, ['COLD'], graph);
      expect(result).toMatchObject({ ok: false, code: 'unknown' });
      if (!result.ok) expect(result.message).toContain('curated dictionary');
    }
    expect(validateMove('cold', ['COLD'], graph)).toMatchObject({ ok: false, code: 'unchanged' });
    expect(validateMove('WARM', ['COLD'], graph)).toMatchObject({ ok: false, code: 'distance' });
    expect(validateMove('CORD', ['COLD', 'CORD', 'CARD'], graph)).toMatchObject({ ok: false, code: 'repeated' });
  });

  test('move count, invalid attempts, rewind, freed words, and reset are immutable and exact', () => {
    const original = createGame(PUZZLES[0]);
    expect(moveCount(original)).toBe(0);
    expect(backtrack(original)).toBe(original);
    const invalid = playMove(original, 'WARM', graph);
    expect(invalid.state).toBe(original);
    let state = playMove(original, 'CORD', graph).state;
    state = playMove(state, 'CARD', graph).state;
    expect(moveCount(state)).toBe(2);
    expect(original.path).toEqual(['COLD']);
    expect(legalNextWords(state, graph)).not.toContain('CORD');
    state = backtrack(state);
    expect(moveCount(state)).toBe(1);
    expect(legalNextWords(state, graph)).toContain('CARD');
    expect(playMove(state, 'CARD', graph).validation.ok).toBe(true);
    expect(backtrack(state, -1)).toBe(state);
    expect(backtrack(state, 1.5)).toBe(state);
    expect(backtrack(state, 99)).toBe(state);
    expect(backtrack(state, 0).path).toEqual(['COLD']);
    expect(resetGame(state)).toEqual(original);
  });

  test('hints avoid previously used words even when the unblocked shortest route goes back', () => {
    const detourGraph = buildGraph(['COLD', 'CORD', 'CORN', 'CARD', 'WARD', 'WARM', 'BORN', 'BARN', 'BARD']);
    let state = createGame(PUZZLES[0]);
    state = playMove(state, 'CORD', detourGraph).state;
    state = playMove(state, 'CORN', detourGraph).state;
    expect(findShortestPath(detourGraph, 'CORN', 'WARM')?.[1]).toBe('CORD');
    const remaining = remainingPath(state, detourGraph)!;
    expect(remaining).not.toContain('CORD');
    expect(remaining).not.toContain('COLD');
    const hint = requestHint(state, detourGraph);
    expect(hint).toMatchObject({ status: 'hint', word: 'BORN', remainingMoves: 5 });
    for (const next of remaining.slice(1)) {
      const result = playMove(state, next, detourGraph);
      expect(result.validation.ok).toBe(true);
      state = result.state;
    }
    expect(isSolved(state)).toBe(true);
  });

  test('blocked detours give no fake hint, and rewinding restores the connection', () => {
    const trap = buildGraph(['COLD', 'CORD', 'CARD', 'WARD', 'WARM', 'BOLD', 'BOLT']);
    let state = createGame(PUZZLES[0]);
    state = playMove(state, 'BOLD', trap).state;
    state = playMove(state, 'BOLT', trap).state;
    expect(remainingPath(state, trap)).toBeNull();
    expect(legalNextWords(state, trap)).toEqual([]);
    expect(requestHint(state, trap)).toEqual({ status: 'stuck', state });
    state = backtrack(state, 0);
    expect(requestHint(state, trap)).toMatchObject({ status: 'hint', word: 'CORD' });
  });

  test('only new hint reveals count, rewinding does not refund them, and resetting starts fresh', () => {
    const initial = createGame(PUZZLES[0]);
    const first = requestHint(initial, graph);
    expect(first.status).toBe('hint');
    if (first.status !== 'hint') throw new Error('Expected a hint');
    expect(first.state.path).toEqual(['COLD']);
    expect(first.state.hintsUsed).toBe(1);
    const repeat = requestHint(first.state, graph);
    expect(repeat).toMatchObject({ status: 'hint', alreadyRevealed: true });
    expect(repeat.state.hintsUsed).toBe(1);
    const moved = playMove(first.state, first.word, graph).state;
    const second = requestHint(moved, graph);
    expect(second.state.hintsUsed).toBe(2);
    const rewound = backtrack(second.state, 0);
    expect(requestHint(rewound, graph).state.hintsUsed).toBe(2);
    expect(resetGame(rewound)).toEqual(initial);
  });
});

test('word-circuit browser: laptop entry, route controls, and circuit share the first workbench', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./projects/word-circuit/');
  const root = page.locator('.project-word-circuit');
  const preview = root.locator('[data-project-preview]');
  await expect(preview).toHaveCount(1);
  for (const selector of ['.wc-circuit', '.wc-entry-row', '.wc-utility-row', '.wc-hint-area']) {
    const bounds = await preview.locator(selector).boundingBox();
    if (!bounds) throw new Error(`Missing laptop gameplay region: ${selector}`);
    expect(bounds.y).toBeGreaterThan(40);
    expect(bounds.y + bounds.height, `${selector} fits without scrolling`).toBeLessThanOrEqual(760);
  }
  await expect(preview.getByLabel('Next word', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(preview.locator('[data-route-log]')).toBeInViewport({ ratio: 1 });
  await preview.getByLabel('Next word', { exact: true }).fill('CORD');
  await preview.getByRole('button', { name: 'Connect word', exact: true }).click();
  await expect(preview.locator('[data-moves]')).toHaveText('01');
});

test('word-circuit browser: complete a real route with stable input, honest feedback, and phone layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./projects/word-circuit/');
  const root = page.locator('.project-word-circuit');
  await expect(root.getByRole('heading', { name: 'Word Circuit', exact: true })).toBeVisible();
  const input = root.getByLabel('Next word', { exact: true });
  await input.fill('WARM');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(root.locator('[data-feedback]')).toContainText('more than one letter');
  await expect(root.locator('[data-moves]')).toHaveText('00');
  for (const word of ['CORD', 'CARD', 'WARD', 'WARM']) {
    await input.fill(word);
    await input.press('Enter');
    if (word !== 'WARM') await expect(input).toBeFocused();
  }
  await expect(root.locator('[data-completion]')).toBeVisible();
  await expect(root.locator('[data-completion]')).toContainText('shortest possible');
  await expect(root.locator('[data-moves]')).toHaveText('04');
  await expect(root.locator('[data-route-log] > li')).toHaveCount(5);
  await root.getByRole('button', { name: 'Backtrack', exact: true }).click();
  await expect(root.locator('[data-completion]')).toBeHidden();
  await expect(root.locator('[data-moves]')).toHaveText('03');
  await root.getByRole('button', { name: 'Reset route', exact: true }).click();
  await expect(root.locator('[data-moves]')).toHaveText('00');
  await root.getByRole('button', { name: 'Next puzzle', exact: true }).click();
  await expect(root.locator('[data-puzzle-name]')).toHaveText('Change of heart');
  await root.getByRole('button', { name: 'Browse dictionary', exact: true }).click();
  await root.getByLabel('Search words or meanings').fill('sine');
  await expect(root.locator('[data-dictionary-list]')).toContainText('SINE');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
