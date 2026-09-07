import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADDRESSES, LEVELS } from '../../src/projects/parcel/data';
import {
  bagCount,
  compileLevel,
  createInitialState,
  createSession,
  deliveredCount,
  getPhase,
  move,
  remainingMoves,
  solve,
  takeTurn,
  undoTurn,
} from '../../src/projects/parcel/engine';
import type { Direction, GameSession, LevelDefinition } from '../../src/projects/parcel/engine';

function fixture(map: string[], capacity = 1, moveBudget = 30): LevelDefinition {
  return {
    ...LEVELS[0],
    id: 'test-route',
    map,
    capacity,
    moveBudget,
    parcels: map.join('').includes('b') ? [ADDRESSES.A, ADDRESSES.B] : [ADDRESSES.A],
  };
}

test.describe('parcel engine', () => {
  for (const definition of LEVELS) {
    test(`${definition.title}: the authored route is solvable within its budget`, () => {
      const level = compileLevel(definition);
      const solution = solve(level);
      expect(solution.status).toBe('solved');
      expect(solution.moves.length).toBeLessThanOrEqual(definition.moveBudget);
      expect(solution.moves.length).toBeGreaterThan(0);
      let session = createSession(level);
      const snapshots: GameSession[] = [session];
      for (const direction of solution.moves) {
        const result = takeTurn(level, session, direction);
        expect(result.move.moved).toBe(true);
        session = result.session;
        expect(bagCount(session.current)).toBeLessThanOrEqual(definition.capacity);
        expect(remainingMoves(level, session.current)).toBeGreaterThanOrEqual(0);
        snapshots.push(session);
      }
      expect(getPhase(level, session.current)).toBe('complete');
      expect(deliveredCount(session.current)).toBe(level.parcels.length);
      expect(session.current.parcelLocations.every((location) => location === 'delivered')).toBe(true);
      expect(session.current.steps).toBe(solution.moves.length);
      for (let index = snapshots.length - 2; index >= 0; index -= 1) {
        session = undoTurn(session);
        expect(session).toEqual(snapshots[index]);
      }
      expect(session).toEqual(createSession(level));
      console.log(`${definition.title}: ${solution.moves.length}/${definition.moveBudget} moves; ${solution.visited} solver states.`);
    });
  }

  test('movement is one orthogonal step; walls and edges are free and do not wrap', () => {
    const level = compileLevel(fixture(['@#a', '..A']));
    const start = createInitialState(level);
    for (const direction of ['up', 'left', 'right'] as Direction[]) {
      const result = move(level, start, direction);
      expect(result.moved).toBe(false);
      expect(result.state).toBe(start);
      expect(result.blocked).toBe(direction === 'right' ? 'wall' : 'edge');
    }
    const result = move(level, start, 'down');
    expect(result.state.position).toBe(3);
    expect(result.state.steps).toBe(1);
    expect(result.state.facing).toBe('down');
    expect(move(level, result.state, 'left').blocked).toBe('edge');
  });

  test('automatic pickup, full-bag crossing, matching delivery, and collection on return', () => {
    const level = compileLevel(fixture(['@abA.B']));
    let state = move(level, createInitialState(level), 'right').state;
    expect(state.parcelLocations).toEqual(['bag', 2]);
    const full = move(level, state, 'right');
    expect(full.moved).toBe(true);
    expect(full.events).toEqual([{ type: 'full', parcelId: 'B' }]);
    expect(full.state.parcelLocations).toEqual(['bag', 2]);
    expect(full.state.steps).toBe(2);
    state = move(level, full.state, 'right').state;
    expect(state.parcelLocations).toEqual(['delivered', 2]);
    expect(bagCount(state)).toBe(0);
    state = move(level, state, 'left').state;
    expect(state.parcelLocations).toEqual(['delivered', 'bag']);
    state = move(level, state, 'right').state;
    expect(state.parcelLocations).toEqual(['delivered', 'bag']);
    state = move(level, move(level, state, 'right').state, 'right').state;
    expect(getPhase(level, state)).toBe('complete');
    expect(state.parcelLocations).toEqual(['delivered', 'delivered']);
  });

  test('a parcel is not delivered to another letter and two-slot capacity really carries two', () => {
    const level = compileLevel(fixture(['@aBAb'], 2));
    let state = move(level, createInitialState(level), 'right').state;
    state = move(level, state, 'right').state;
    expect(state.parcelLocations[0]).toBe('bag');
    expect(deliveredCount(state)).toBe(0);
    const pair = compileLevel(fixture(['@abAB'], 2));
    state = move(pair, move(pair, createInitialState(pair), 'right').state, 'right').state;
    expect(bagCount(state)).toBe(2);
  });

  test('one-way tiles constrain exit, not entry, and invalid turns do not cost moves', () => {
    const level = compileLevel(fixture(['@→aA', '....']));
    const onArrow = move(level, createInitialState(level), 'right').state;
    for (const direction of ['up', 'down', 'left'] as Direction[]) {
      const result = move(level, onArrow, direction);
      expect(result.blocked).toBe('one-way');
      expect(result.state).toBe(onArrow);
    }
    const fromRight = move(level, move(level, onArrow, 'right').state, 'left');
    expect(fromRight.moved).toBe(true);
    expect(fromRight.state.position).toBe(1);
    expect(move(level, fromRight.state, 'right').moved).toBe(true);
  });

  test('undo restores every snapshot, including completion, pickup locations, bag, steps and facing', () => {
    const level = compileLevel(fixture(['@abA.B']));
    const directions: Direction[] = ['right', 'right', 'right', 'left', 'right', 'right', 'right'];
    let session = createSession(level);
    const snapshots: GameSession[] = [session];
    for (const direction of directions) {
      Object.freeze(session.current.parcelLocations);
      Object.freeze(session.current);
      Object.freeze(session.history);
      session = takeTurn(level, session, direction).session;
      snapshots.push(session);
    }
    expect(getPhase(level, session.current)).toBe('complete');
    expect(takeTurn(level, session, 'left').session).toBe(session);
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      session = undoTurn(session);
      expect(session).toEqual(snapshots[index]);
      expect(remainingMoves(level, session.current)).toBe(level.definition.moveBudget - session.current.steps);
    }
    expect(session.current).toEqual(createInitialState(level));
    expect(undoTurn(session)).toBe(session);
    expect(createSession(level)).toEqual(session);
  });

  test('the final budgeted move may win; exhaustion is undoable and prevents more movement', () => {
    const exact = compileLevel(fixture(['@aA'], 1, 2));
    let session = createSession(exact);
    session = takeTurn(exact, takeTurn(exact, session, 'right').session, 'right').session;
    expect(getPhase(exact, session.current)).toBe('complete');
    expect(remainingMoves(exact, session.current)).toBe(0);

    const short = compileLevel(fixture(['@a.A'], 1, 2));
    session = takeTurn(short, takeTurn(short, createSession(short), 'right').session, 'right').session;
    expect(getPhase(short, session.current)).toBe('exhausted');
    expect(move(short, session.current, 'right').blocked).toBe('budget');
    const restored = undoTurn(session);
    expect(getPhase(short, restored.current)).toBe('playing');
    expect(restored.current.position).toBe(1);
    expect(restored.current.parcelLocations).toEqual(['bag']);
    expect(remainingMoves(short, restored.current)).toBe(1);
    expect(createSession(short).current).toEqual(createInitialState(short));
  });

  test('solver hints solve from the actual state and report impossible or search-limited routes honestly', () => {
    const level = compileLevel(LEVELS[2]);
    let state = createInitialState(level);
    for (const direction of ['right', 'right', 'right'] as Direction[]) {
      state = move(level, state, direction).state;
    }
    expect(state.parcelLocations[1]).toBe(level.parcels[1].pickup);
    const hint = solve(level, state);
    expect(hint.status).toBe('solved');
    for (const direction of hint.moves) state = move(level, state, direction).state;
    expect(getPhase(level, state)).toBe('complete');
    expect(solve(level, state)).toMatchObject({ status: 'solved', moves: [] });
    expect(solve(compileLevel(fixture(['@a.A'], 1, 2)))).toMatchObject({ status: 'unsolvable', moves: [] });
    expect(solve(compileLevel(fixture(['@#aA']))).status).toBe('unsolvable');
    expect(solve(level, createInitialState(level), 1)).toMatchObject({ status: 'limit', moves: [] });
  });

  test('invalid moves do not create undo entries; malformed map definitions fail early', () => {
    const level = compileLevel(fixture(['@#aA']));
    const session = createSession(level);
    expect(takeTurn(level, session, 'right').session).toBe(session);
    expect(() => compileLevel(fixture(['@a', 'A']))).toThrow('rectangle');
    expect(() => compileLevel(fixture(['@a.']))).toThrow('one pickup and one address');
    expect(() => compileLevel(fixture(['@@aA']))).toThrow('exactly one @');
    expect(() => compileLevel(fixture(['@aA'], 0))).toThrow('capacity');
    expect(() => compileLevel(fixture(['@aA'], 1, 0))).toThrow('budget');
    expect(() => compileLevel(fixture(['@aA?']))).toThrow('unknown map symbol');
  });
});

async function openDesk(page: Page) {
  // Other sites share this Vite server; their reloads must not clear the route.
  await page.routeWebSocket(url => url.searchParams.has('token'), () => {});
  await page.goto('./projects/parcel/');
}

test('parcel page: every laptop map shares the first view with its driving controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openDesk(page);
  const site = page.locator('.project-parcel');
  const preview = site.locator('[data-project-preview]');
  await expect(preview).toHaveCount(1);
  for (let index = 0; index < LEVELS.length; index += 1) {
    await site.locator('[data-level]').selectOption(String(index));
    for (const selector of ['[data-map]', '.parcel-dpad', '.parcel-actions', '.parcel-dashboard']) {
      const bounds = await preview.locator(selector).boundingBox();
      if (!bounds) throw new Error(`Missing laptop gameplay region: ${selector}`);
      expect(bounds.y).toBeGreaterThan(40);
      expect(bounds.y + bounds.height, `Route ${index + 1}: ${selector} fits without scrolling`).toBeLessThanOrEqual(720);
    }
  }
  await preview.locator('[data-direction="right"]').click();
  await expect(preview.locator('[data-moves]')).toHaveText('1 / 38');
  await preview.locator('[data-undo]').click();
  await expect(preview.locator('[data-moves]')).toHaveText('0 / 38');
});

test('parcel page: every solved route earns a real stamp; undo and replay remove it', async ({ page }) => {
  await openDesk(page);
  const site = page.locator('.project-parcel');
  const keys: Record<Direction, string> = {
    up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft',
  };
  await expect(site.getByRole('heading', { level: 1 })).toHaveText('Parcel Panic!');
  for (const [index, definition] of LEVELS.entries()) {
    await site.locator('[data-level]').selectOption(String(index));
    const board = site.locator('[data-map]');
    await board.focus();
    const solution = solve(compileLevel(definition));
    expect(solution.status).toBe('solved');
    for (const direction of solution.moves) await board.press(keys[direction]);
    await expect(site).toHaveAttribute('data-phase', 'complete');
    await expect(site.locator('[data-delivered]')).toHaveText(`${definition.parcels.length} / ${definition.parcels.length}`);
    await expect(site.locator('[data-progress]')).toHaveText(`${index + 1} of 5`);
    await expect(site.locator('[data-result]')).toBeVisible();
    await site.getByRole('button', { name: 'Close Round result', exact: true }).click();
  }
  await expect(site.locator('[data-result-title]')).toHaveText('All five, first class!');
  await site.locator('[data-undo]').click();
  await expect(site).toHaveAttribute('data-phase', 'playing');
  await expect(site.locator('[data-progress]')).toHaveText('4 of 5');
  await expect(site.locator('[data-result]')).toBeHidden();
  await site.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(site.locator('[data-moves]')).toHaveText('0 / 38');
  await expect(site.locator('[data-delivered]')).toHaveText('0 / 4');
  await expect(site.locator('[data-bag-count]')).toHaveText('0 / 2 slots');
});

test('parcel page: phone controls fit, hints do not autoplay, and form keys do not move the van', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDesk(page);
  const site = page.locator('.project-parcel');
  const selector = site.locator('[data-level]');
  await selector.focus();
  await selector.press('ArrowRight');
  await expect(site.locator('[data-moves]')).toHaveText(/^0 \/ \d+$/);
  await selector.selectOption('4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const boardBox = await site.locator('[data-map]').boundingBox();
  expect(boardBox!.width).toBeLessThanOrEqual(375);
  for (const button of await site.locator('[data-direction]').all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await site.locator('[data-hint-button]').click();
  await expect(site.locator('[data-feedback]')).toContainText('Verified hint:');
  await expect(site.locator('[data-moves]')).toHaveText('0 / 38');
  await expect(site.locator('[data-direction][data-suggested="true"]')).toHaveCount(1);
  await site.getByRole('button', { name: 'Close Dispatch feedback', exact: true }).click();
  await site.locator('[data-direction="right"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(site.locator('[data-moves]')).toHaveText('0 / 38');
  await site.locator('[data-direction="right"]').click();
  await expect(site.locator('[data-moves]')).toHaveText('1 / 38');
  await site.locator('[data-undo]').click();
  await expect(site.locator('[data-moves]')).toHaveText('0 / 38');
  await page.setViewportSize({ width: 320, height: 640 });
  await site.locator('[data-map]').click();
  await expect(site.locator('[data-map]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(site.locator('[data-moves]')).toHaveText('1 / 38');
  await expect(site.locator('#parcel-map-desc')).toContainText('row 1, column 2');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('z');
  await expect(site.locator('[data-moves]')).toHaveText('0 / 38');
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`parcel workspace: ${viewport.width}×${viewport.height} routes, dispatch, finish and reset`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openDesk(page);
    const site = page.locator('.project-parcel');
    const board = site.locator('[data-map]');
    const assertDesk = async () => {
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ width: viewport.width, height: viewport.height, x: 0, y: 0 });
      for (const control of [board, ...await site.locator('[data-direction], [data-action="restart"], [data-hint-button], [data-details]').all()]) {
        if (!await control.isVisible()) continue;
        const box = await control.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        expect(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
        expect(await control.evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })).toBe(true);
      }
    };
    await expect(site).toHaveAttribute('data-workspace', 'true');
    await site.locator('[data-level]').selectOption('4');
    await page.screenshot({ path: testInfo.outputPath(`parcel-${viewport.width}x${viewport.height}.png`) });
    await assertDesk();
    expect(await board.evaluate(element => [...element.querySelectorAll('text')].every(text => {
      const transform = text.getScreenCTM();
      return transform && parseFloat(getComputedStyle(text).fontSize) * Math.hypot(transform.a, transform.b) >= 13.99;
    }))).toBe(true);
    await site.getByRole('button', { name: 'Enlarge route map', exact: true }).click();
    await expect(site.getByRole('dialog', { name: 'Route map in detail', exact: true })).toBeVisible();
    await expect(site.locator('#parcel-map-detail-art-desc')).toContainText('7 rows and 7 columns');
    await page.keyboard.press('Escape');
    await expect(site.getByRole('button', { name: 'Enlarge route map', exact: true })).toBeFocused();
    await site.locator('[data-direction="right"]').click();
    await site.getByRole('button', { name: 'Mailbag & manifest', exact: true }).click();
    await expect(site.getByRole('dialog', { name: 'Dispatch and mailbag', exact: true })).toBeVisible();
    await expect(site.locator('[data-deliveries] li')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await site.getByRole('button', { name: 'Routes', exact: true }).click();
    await site.locator('[data-route="0"]').click();
    await site.locator('[data-level]').selectOption('4');
    await expect(site.locator('[data-moves]')).toHaveText('1 / 38');
    await site.locator('[data-level]').selectOption('0');
    await site.getByRole('button', { name: 'Field guide', exact: true }).click();
    await expect(site.getByRole('heading', { name: 'A first-class plan.' })).toBeVisible();
    await page.keyboard.press('Escape');
    await board.focus();
    await board.press('ArrowUp');
    await expect(site.getByRole('dialog', { name: 'Dispatch feedback' })).toBeVisible();
    await expect(site.locator('[data-feedback]')).toContainText('No move spent');
    await page.keyboard.press('Escape');
    const keys: Record<Direction, string> = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
    for (const direction of solve(compileLevel(LEVELS[0])).moves) await board.press(keys[direction]);
    const result = site.getByRole('dialog', { name: 'Round result', exact: true });
    await expect(result).toBeVisible();
    await expect(site).toHaveAttribute('data-phase', 'complete');
    const heading = await site.locator('[data-result-title]').boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(0);
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`parcel-finish-${viewport.width}x${viewport.height}.png`) });
    await result.getByRole('button', { name: 'Undo last move', exact: true }).click();
    await expect(result).toBeHidden();
    await expect(site).toHaveAttribute('data-phase', 'playing');
    await expect(board).toBeFocused();
    await site.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(site.locator('[data-moves]')).toHaveText('0 / 12');
    await assertDesk();
    await board.focus();
    for (let turn = 0; turn < 6; turn += 1) {
      await board.press('ArrowRight');
      await board.press('ArrowLeft');
    }
    await expect(site).toHaveAttribute('data-phase', 'exhausted');
    await expect(result).toBeVisible();
    await expect(result.getByRole('heading', { name: 'The meter says zero.' })).toBeVisible();
    await result.getByRole('button', { name: 'Undo last move', exact: true }).click();
    await expect(site).toHaveAttribute('data-phase', 'playing');
    await expect(site.locator('[data-remaining]')).toHaveText('1');
  });
}
