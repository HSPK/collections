import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture, nativeToolResponse } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { create, definition, findSolution, legalWindChoices, parseCommand, playerChoices, reduce, slideBoard } from '../../src/projects/cloud-rescue/engine';
import type { PlayerCommand, State, WindChoice } from '../../src/projects/cloud-rescue/engine';
import { GOALS, ISLANDS } from '../../src/projects/cloud-rescue/data';
import { smokeCase } from '../../src/projects/cloud-rescue/agent';

function plan(s: State, action = legalWindChoices(s)[0]) {
  expect(action, `island ${s.island} must have a certified wind`).toBeTruthy();
  return { turn: s.turn, choices: [action.id], mood: '细心' as const, intention: '先把这朵云安顿好，再照顾缺水的花园。' };
}
function fixturePlan(turn: FixtureTurn, prefer = 'gust') {
  const choices = turn.observation.保苗目录 as WindChoice[];
  const action = choices.find(c => c.action === prefer) ?? choices[0];
  return { turn: turn.observation.turn, choices: [action.id], mood: '俏皮', intention: `我来${action.action === 'gust' ? '侧移云朵，让出口更顺畅' : action.action === 'rescue' ? '修剪老云，保住花园' : '播一朵两水云，陪你开工'}。` };
}
const root = (page: Page) => page.locator('.project-cloud-rescue');
async function open(page: Page) {
  await page.goto('./projects/cloud-rescue/');
  await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-phaser-ready', 'true');
}
async function saved(page: Page) {
  const encoded = await page.evaluate(() => JSON.parse(localStorage.getItem('odd-index:game:cloud-rescue:v1') || 'null') as string | null);
  const session = new GameSession(definition, 90);
  if (encoded) session.restore(encoded);
  return session;
}
async function cell(page: Page, id: number) {
  const canvas = root(page).locator('canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: (340 + id % 4 * 88 + 44) / 960 * box.width, y: (103 + Math.floor(id / 4) * 88 + 44) / 640 * box.height } });
}
async function command(page: Page, c: PlayerCommand, keyboard = false) {
  const before = await root(page).getAttribute('data-revision');
  if (c.type === 'slide') {
    if (keyboard) { await root(page).locator('canvas').focus(); await page.keyboard.press(`Arrow${c.direction[0].toUpperCase()}${c.direction.slice(1)}`); }
    else await root(page).locator(`[data-move="${c.direction}"]`).click();
  } else {
    await cell(page, c.cell);
    await root(page).locator(c.type === 'seed' ? `[data-seed="${c.water}"]` : '[data-prune]').click();
  }
  await expect(root(page)).not.toHaveAttribute('data-revision', before!);
}
async function wind(page: Page) {
  await root(page).locator('[data-wind]').click();
  await expect(root(page)).not.toHaveAttribute('data-agent-busy', 'true');
  await expect(root(page)).not.toHaveAttribute('data-phase', 'opening');
  await expect(root(page)).not.toHaveAttribute('data-phase', 'wind');
}

test('pure slide merges once, respects rocks and never chains a new merge', () => {
  const board = [1, 1, 2, 0, 2, 2, 2, 2, 8, 8, 0, 0, 0, 0, 0, 0];
  const result = slideBoard(board, [], 'left');
  expect(result.board.slice(0, 4)).toEqual([2, 2, 0, 0]);
  expect(result.board.slice(4, 8)).toEqual([4, 4, 0, 0]);
  expect(result.board.slice(8, 12)).toEqual([8, 8, 0, 0]);
  expect(board[1]).toBe(1);
  expect(slideBoard([1, 0, 1, 1, ...Array(12).fill(0)], [1], 'left').board.slice(0, 4)).toEqual([1, 0, 2, 0]);
});

test('all five seed/catalogs have constructive paths for every exposed legal wind variation', () => {
  test.setTimeout(120_000);
  let state = create(90), commands = 0, checked = 0, gusts = 0;
  while (state.phase !== 'festival' && commands++ < 200) {
    if (state.phase === 'opening' || state.phase === 'wind') {
      const choices = legalWindChoices(state);
      expect(choices.length, `island ${state.island}, board ${state.board}`).toBeGreaterThan(0);
      for (const action of choices) {
        const next = reduce(state, { type: 'wind', plan: plan(state, action), goal: GOALS[0] });
        expect(findSolution(next), JSON.stringify({ island: state.island, action })).not.toBeNull();
        expect(next.moves).toBe(state.moves);
        expect(next.windSpent).toBeLessThanOrEqual(3);
        expect(next.effects.some(effect => effect.kind === action.action)).toBe(true);
        if (action.action === 'gust') {
          expect(next.board[action.cell]).toBe(0);
          expect(next.effects).toContainEqual({ kind: 'gust', cell: action.to, from: action.cell, amount: action.water });
        }
        checked++; if (action.action === 'gust') gusts++;
      }
      state = reduce(state, { type: 'wind', plan: plan(state, choices.find(c => c.action === 'gust') ?? choices.at(-1)), goal: GOALS[0] });
    } else if (state.phase === 'won') state = reduce(state, { type: 'next' });
    else {
      expect(state.phase).toBe('play');
      const route = findSolution(state);
      expect(route, `no route at island ${state.island}`).not.toBeNull();
      state = reduce(state, route![0]);
    }
  }
  expect(state.phase).toBe('festival');
  expect(state.ratings).toHaveLength(5);
  expect(commands).toBeLessThan(250);
  expect(checked).toBeGreaterThan(8);
  expect(gusts).toBeGreaterThan(0);
  console.log(`cloud-rescue constructive: ${commands} commands, ${checked} certified alternatives, ${gusts} gusts`);
});

test('authority enforces seeds, harvest doses, budgets, overripe rescue, phases and replay atomically', () => {
  const session = new GameSession(definition, 90), before = session.serialize();
  expect(() => session.dispatch({ type: 'slide', direction: 'left' })).toThrow();
  const opening = { type: 'wind' as const, plan: plan(session.state), goal: GOALS[0] };
  session.preview(opening);
  expect(session.serialize()).toBe(before);
  session.dispatch(opening);
  expect(session.state.board.reduce((a, b) => a + b, 0)).toBe(8);
  const snapshot = structuredClone(session.state);
  expect(() => session.dispatch(opening)).toThrow();
  expect(() => parseCommand({ type: 'seed', cell: 3, water: 99 })).toThrow();
  expect(() => parseCommand({ type: 'next', reward: 100 })).toThrow();
  expect(() => reduce(session.state, { type: 'seed', cell: 15, water: 1 })).toThrow();
  expect(session.state).toEqual(snapshot);
  const wet: State = { ...create(90), phase: 'play', board: Array(16).fill(0), held: 0 };
  wet.board[8] = 4;
  const rained = reduce(wet, { type: 'slide', direction: 'down' });
  expect(rained.delivered).toEqual([2]);
  expect(rained.board[12]).toBe(0);
  expect(wet.delivered).toEqual([0]);
  const old = { ...wet, board: [...wet.board] }; old.board[8] = 8;
  const stuckRain = reduce(old, { type: 'slide', direction: 'down' });
  expect(stuckRain.delivered).toEqual([0]);
  const pruned = reduce(stuckRain, { type: 'prune', cell: 12 });
  expect(pruned.delivered).toEqual([1]); expect(pruned.coins).toBe(2); expect(pruned.prunes).toBe(0);
  expect(() => reduce(pruned, { type: 'prune', cell: 12 })).toThrow();
  const finalDrop = { ...wet, delivered: [2] };
  const won = reduce(finalDrop, { type: 'slide', direction: 'down' });
  expect(won.phase).toBe('won'); expect(won.delivered).toEqual([3]); expect(won.ratings).toHaveLength(1);
  expect(() => reduce(won, { type: 'slide', direction: 'down' })).toThrow();
  const encoded = session.serialize(), revision = session.revision;
  expect(() => session.restore(JSON.stringify({ ...JSON.parse(encoded), commands: [...JSON.parse(encoded).commands, { type: 'next' }] }))).toThrow();
  expect(session.serialize()).toBe(encoded); expect(session.revision).toBe(revision);
  session.restore(encoded); expect(session.state).toEqual(snapshot); expect(session.revision).toBeGreaterThan(revision);
  const smoke = smokeCase(); smoke.request.validate(opening.plan); smoke.verify(opening.plan);
});

test('storm, legal no-move detection, move exhaustion and invalid wind preserve authority', () => {
  const s = { ...create(90), island: 2, phase: 'play' as const, delivered: [0, 0], board: Array(16).fill(0) };
  s.board[9] = 4;
  // Right is stopped by column-three rock on row one, but row-two storm is crossed only on landing.
  s.board[11] = 8;
  expect(reduce(s, { type: 'slide', direction: 'right' }).board[10]).toBe(8);
  const full = { ...create(90), phase: 'play' as const, board: Array(16).fill(8), coins: 0, prunes: 0 };
  expect(playerChoices(full)).toEqual([]);
  expect(() => reduce(full, { type: 'slide', direction: 'left' })).toThrow();
  const nearlyFull = { ...full, board: [...full.board], coins: 2 };
  nearlyFull.board[0] = 0;
  expect(reduce(nearlyFull, { type: 'seed', cell: 0, water: 2 }).reason).toContain('风道全堵住');
  const recoverable = reduce({ ...nearlyFull, coins: 4, prunes: 1 }, { type: 'seed', cell: 0, water: 2 });
  expect(recoverable.phase).toBe('play');
  expect(playerChoices(recoverable).some(c => c.type === 'prune')).toBe(true);
  const last = { ...create(90), phase: 'play' as const, moves: 1 };
  expect(reduce(last, { type: 'slide', direction: 'right' }).phase).toBe('lost');
  const windState = create(90);
  expect(() => reduce(windState, { type: 'wind', plan: { ...plan(windState), turn: 3 }, goal: GOALS[0] })).toThrow();
  expect(() => reduce(windState, { type: 'wind', plan: { ...plan(windState), choices: [255] }, goal: GOALS[0] })).toThrow();
  const rescueState: State = { ...create(90), island: 3, board: [...ISLANDS[3].board], phase: 'wind', moves: 16, delivered: [0, 0] };
  const rescue = legalWindChoices(rescueState).find(action => action.action === 'rescue');
  expect(rescue).toBeTruthy();
  const rescued = reduce(rescueState, { type: 'wind', plan: plan(rescueState, rescue), goal: '请帮我解围' });
  expect(rescued.board[0]).toBe(2); expect(rescued.windSpent).toBe(3);
  expect(rescued.coins).toBe(4); expect(rescued.prunes).toBe(1);
});

test('legitimate keyboard/pointer UI completes all islands and festival, exports/imports native replay', async ({ page }) => {
  test.setTimeout(120_000);
  const calls = await installAgentFixture(page, turn => fixturePlan(turn));
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  expect(calls).toHaveLength(0);
  let actions = 0, sawMerge = false, sawRain = false, manuallyPruned = false, peakTweens = 0;
  while (actions++ < 150) {
    peakTweens = Math.max(peakTweens, Number(await root(page).locator('[data-project-preview]').getAttribute('data-tweens')));
    const session = await saved(page), state = session.state;
    sawMerge ||= state.merges > 0; sawRain ||= state.rain > 0;
    if (state.phase === 'festival') break;
    if (state.phase === 'opening' || state.phase === 'wind') {
      await root(page).locator('[data-goal]').selectOption('先浇缺水花园');
      await wind(page);
    } else if (state.phase === 'won') await root(page).locator('[data-next]').click();
    else {
      expect(state.phase).toBe('play');
      if (state.island === 3 && !manuallyPruned && state.board[0] === 8) {
        await command(page, { type: 'prune', cell: 0 }); manuallyPruned = true; continue;
      }
      const path = findSolution(state);
      expect(path).not.toBeNull();
      await command(page, path![0], actions % 2 === 0);
    }
  }
  await expect(root(page)).toHaveAttribute('data-phase', 'festival');
  await expect(root(page).locator('[data-result]')).toHaveText('百花开业祭 · 圆满！');
  expect(sawMerge && sawRain).toBe(true);
  expect(manuallyPruned).toBe(true);
  expect(peakTweens).toBeGreaterThan(0); expect(peakTweens).toBeLessThanOrEqual(32);
  console.log(`cloud-rescue observed campaign tween peak: ${peakTweens}`);
  expect(calls.length).toBeGreaterThanOrEqual(5);
  expect(calls.some(c => (c.observation.保苗目录 as WindChoice[]).some(action => action.action === 'gust'))).toBe(true);
  const finished = await saved(page);
  expect(finished.state.ratings).toHaveLength(5);
  await root(page).locator('[data-notebook]').click();
  const download = page.waitForEvent('download');
  await root(page).locator('[data-game-export]').click();
  expect((await download).suggestedFilename()).toBe('cloud-rescue-replay.json');
  await page.keyboard.press('Escape');
  await root(page).locator('[data-restart]').click();
  await root(page).locator('[data-notebook]').click();
  await root(page).locator('[data-game-import]').setInputFiles({ name: 'rain.json', mimeType: 'application/json', buffer: Buffer.from(finished.serialize()) });
  await expect(root(page)).toHaveAttribute('data-phase', 'festival');
  await page.keyboard.press('Escape');
  const count = calls.length;
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-phase', 'festival');
  expect(calls).toHaveLength(count);
});

test('desktop canvas input, native modal and manual pause, resource bounds across restarts', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    let created = 0;
    const Original = window.AudioContext;
    window.AudioContext = new Proxy(Original, { construct(target, args) { created++; return Reflect.construct(target, args); } });
    Object.defineProperty(window, 'cloudAudioContexts', { get: () => created });
  });
  await installAgentFixture(page, turn => fixturePlan(turn));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-phaser-version', '4.2.1');
  expect(await page.evaluate(() => Reflect.get(window, 'cloudAudioContexts'))).toBe(0);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const bounds = (await root(page).locator('canvas').boundingBox())!;
    expect(bounds.width).toBeGreaterThan(400);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await cell(page, 3);
    await expect(root(page).locator('[data-selected]')).toContainText('4 格');
    await testInfo.attach(`desktop-${viewport.width}`, { body: await page.screenshot({ path: testInfo.outputPath(`desktop-${viewport.width}.png`) }), contentType: 'image/png' });
  }
  await wind(page);
  const initial = await saved(page);
  await root(page).locator('[data-pause]').click();
  await page.keyboard.press('ArrowDown');
  expect((await saved(page)).serialize()).toBe(initial.serialize());
  await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-phaser-paused', 'true');
  await root(page).locator('[data-help]').click();
  await page.keyboard.press('ArrowLeft');
  expect((await saved(page)).serialize()).toBe(initial.serialize());
  await page.keyboard.press('Escape');
  await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-phaser-paused', 'true');
  await root(page).locator('[data-pause]').click();
  await root(page).locator('[data-notebook]').click();
  await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-phaser-paused', 'true');
  await page.keyboard.press('Escape');
  await root(page).locator('[data-agent-connect]').click();
  await root(page).locator('[data-agent-model]').fill('fixture-tool-model');
  await page.keyboard.press('ArrowLeft');
  expect((await saved(page)).serialize()).toBe(initial.serialize());
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await command(page, { type: 'slide', direction: 'left' }, true);
  const objects = await root(page).locator('[data-project-preview]').getAttribute('data-objects');
  for (let i = 0; i < 6; i++) {
    await root(page).locator('[data-restart]').click(); await wind(page);
    await command(page, { type: 'slide', direction: 'left' });
    await expect(root(page).locator('[data-project-preview]')).toHaveAttribute('data-objects', objects!);
  }
  const metrics = await root(page).locator('[data-project-preview]').evaluate(el => ({
    objects: Number((el as HTMLElement).dataset.objects), textures: Number((el as HTMLElement).dataset.textures), tweens: Number((el as HTMLElement).dataset.tweens),
  }));
  expect(metrics.objects).toBeLessThanOrEqual(200); expect(metrics.textures).toBeLessThanOrEqual(64); expect(metrics.tweens).toBeLessThanOrEqual(32);
  console.log('cloud-rescue resource metrics', metrics);
  expect(errors).toEqual([]);
});

test('invalid/corrected model, network failure, cancel/reset ownership and loss/retry', async ({ page }) => {
  test.setTimeout(90_000);
  let invalid = true;
  const calls = await installAgentFixture(page, turn => invalid ? { ...fixturePlan(turn), choices: [255] } : fixturePlan(turn));
  await open(page);
  const moves = await root(page).locator('[data-moves]').innerText();
  await root(page).locator('[data-wind]').click();
  await expect(root(page).locator('[data-console]')).toHaveAttribute('data-agent-error', 'true');
  expect(calls).toHaveLength(2);
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  await expect(root(page).locator('[data-moves]')).toHaveText(moves);
  invalid = false;
  await wind(page);
  await root(page).locator('[data-help]').click();
  await root(page).locator('[data-close-day]').click();
  await expect(root(page)).toHaveAttribute('data-phase', 'lost');
  await root(page).locator('[data-retry]').click();
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  await expect(root(page).locator('[data-moves]')).toHaveText(moves);
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '{}' }));
  await root(page).locator('[data-wind]').click();
  await expect(root(page).locator('[data-console]')).toHaveAttribute('data-agent-error', 'true');
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/openai/v1/chat/completions', async route => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nativeToolResponse('fold_company_wind', plan(create(90)))) }).catch(() => {});
  });
  await root(page).locator('[data-wind]').click();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
  await root(page).locator('[data-agent-cancel]').click();
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  await root(page).locator('[data-wind]').click();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
  await root(page).locator('[data-restart]').click();
  release();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  await expect(root(page).locator('[data-moves]')).toHaveText(moves);
  expect((await saved(page)).moveCount).toBe(0);
});

test('wasting legal moves really loses, retry needs new model; one invalid plan can repair', async ({ page }) => {
  test.setTimeout(90_000);
  const calls = await installAgentFixture(page, turn => turn.index === 0 ? { ...fixturePlan(turn), choices: [255] } : fixturePlan(turn));
  await open(page);
  await wind(page);
  expect(calls).toHaveLength(2);
  expect((await saved(page)).moveCount).toBe(1);
  let moves = 0;
  for (; moves < 25; moves++) {
    const state = (await saved(page)).state;
    if (state.phase === 'lost') break;
    if (state.phase === 'wind') { await wind(page); continue; }
    const alternatives = playerChoices(state).filter(c => c.type === 'slide' && c.direction !== 'down');
    const c = alternatives.find(c => c.type === 'slide' && c.direction === (moves % 2 ? 'left' : 'right')) ?? alternatives[0];
    expect(c).toBeTruthy();
    await command(page, c);
  }
  await expect(root(page)).toHaveAttribute('data-phase', 'lost');
  expect((await saved(page)).state.ratings).toEqual([]);
  expect((await saved(page)).state.used).toBeGreaterThan(3);
  await root(page).locator('[data-retry]').click();
  await expect(root(page)).toHaveAttribute('data-phase', 'opening');
  await expect(root(page).locator('[data-moves]')).toHaveText('12');
  const before = calls.length;
  await wind(page);
  expect(calls.length).toBe(before + 1);
});

test('three held moves survive model failure and native import invalidates a late valid wind', async ({ page }) => {
  let release: (() => void) | undefined, shouldHold = true;
  const calls = await installAgentFixture(page, async turn => {
    if (turn.observation.阶段 === 'wind' && shouldHold) await new Promise<void>(resolve => { release = resolve; });
    return fixturePlan(turn);
  });
  await open(page); await wind(page);
  for (const direction of ['left', 'right', 'left'] as const) await command(page, { type: 'slide', direction });
  await expect(root(page)).toHaveAttribute('data-phase', 'wind');
  const before = await saved(page);
  expect(before.state.held).toBe(3);
  expect(before.state.moves).toBe(9);
  const revision = await root(page).getAttribute('data-revision');
  await root(page).locator('[data-goal]').selectOption('请帮我解围');
  await expect(root(page)).toHaveAttribute('data-revision', revision!);
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '{}' }));
  await root(page).locator('[data-wind]').click();
  await expect(root(page).locator('[data-console]')).toHaveAttribute('data-agent-error', 'true');
  expect((await saved(page)).serialize()).toBe(before.serialize());
  await page.unroute('**/api/openai/v1/chat/completions');
  await installAgentFixture(page, async turn => {
    if (shouldHold) await new Promise<void>(resolve => { release = resolve; });
    return fixturePlan(turn);
  });
  await root(page).locator('[data-wind]').click();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
  await expect(root(page).locator('[data-goal]')).toBeDisabled();
  await expect.poll(() => typeof release).toBe('function');
  await page.keyboard.press('ArrowDown');
  expect((await saved(page)).serialize()).toBe(before.serialize());
  await root(page).locator('[data-notebook]').click();
  await root(page).locator('[data-game-import]').setInputFiles({ name: 'held.json', mimeType: 'application/json', buffer: Buffer.from(before.serialize()) });
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(root(page)).not.toHaveAttribute('data-revision', revision!);
  shouldHold = false; release!();
  const acceptedRevision = await root(page).getAttribute('data-revision');
  expect((await saved(page)).serialize()).toBe(before.serialize());
  await root(page).locator('[data-game-import]').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...JSON.parse(before.serialize()), commands: [...JSON.parse(before.serialize()).commands, { type: 'next' }] })),
  });
  await expect(root(page).locator('[data-game-save-status]')).toContainText('拒绝');
  await expect(root(page)).toHaveAttribute('data-revision', acceptedRevision!);
  await page.keyboard.press('Escape');
  await expect(root(page)).toHaveAttribute('data-phase', 'wind');
  await expect(root(page).locator('[data-moves]')).toHaveText('9');
  await wind(page);
  expect((await saved(page)).state.held).toBe(0);
  expect((await saved(page)).state.moves).toBe(9);
  expect(calls).toHaveLength(1);
});
