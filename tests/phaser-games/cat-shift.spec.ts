import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture } from '../helpers/agent-fixtures';
import { LEGAL_PLANS, ROOMS } from '../../src/projects/cat-shift/data';
import type { Plan } from '../../src/projects/cat-shift/data';
import { createSession, exitOpen, forecast, reduce, solve } from '../../src/projects/cat-shift/engine';
import type { Action } from '../../src/projects/cat-shift/engine';
import { smokeCase } from '../../src/projects/cat-shift/agent';
import { cellPoint } from '../../src/projects/cat-shift/scene';

const rootSelector = '.project-cat-shift';
const game = (page: Page) => page.locator(rootSelector);
async function open(page: Page) {
  await page.goto('./projects/cat-shift/');
  await expect(page.getByRole('heading', { name: '猫咪借位', exact: true })).toBeVisible();
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-ready', 'true');
}
async function clickCell(page: Page, cell: number) {
  const box = await page.locator('[data-stage] canvas').boundingBox();
  expect(box).not.toBeNull();
  const point = cellPoint(cell);
  await page.mouse.click(box!.x + point.x / 960 * box!.width, box!.y + point.y / 640 * box!.height);
}
async function perform(page: Page, action: Action) {
  const turn = Number(await game(page).getAttribute('data-turn'));
  if (action.type === 'wait') await page.locator('[data-wait]').click();
  else {
    const mode = await page.locator('[data-swap]').getAttribute('aria-pressed');
    if ((mode === 'true') !== (action.type === 'swap')) await page.locator('[data-swap]').click();
    await clickCell(page, action.cell);
  }
  await expect(game(page)).toHaveAttribute('data-turn', String(turn + 1));
}
async function restart(page: Page) {
  await page.locator('[data-new]').click();
  await page.locator('[data-confirm-new]').click();
  await expect(game(page)).toHaveAttribute('data-phase', 'briefing');
}

test('all legal patrols have bounded full-campaign witnesses and single-earned stars', () => {
  expect(new Set(ROOMS.map(room => room.floors.join(','))).size).toBe(5);
  for (const plan of LEGAL_PLANS) {
    const session = createSession(2031);
    for (let room = 0; room < ROOMS.length; room++) {
      const before = session.serialize();
      session.preview({ type: 'guard', plan });
      expect(session.serialize()).toBe(before);
      session.dispatch({ type: 'guard', plan });
      const witness = solve(session.state);
      expect(witness, `${ROOMS[room]!.id}/${plan.lane}/${plan.offset}`).not.toBeNull();
      expect(witness!.expanded).toBeLessThan(60_000);
      for (const action of witness!.actions) session.dispatch(action);
      expect(session.state.stars).toHaveLength(room + 1);
      expect(() => session.dispatch({ type: 'wait' })).toThrow();
      expect(() => session.dispatch({ type: 'retry' })).toThrow();
      if (room < ROOMS.length - 1) session.dispatch({ type: 'next' });
    }
    expect(session.state.phase).toBe('won');
    expect(session.moveCount).toBeLessThan(250);
    const copy = createSession(1);
    copy.restore(session.serialize());
    expect(copy.state).toEqual(session.state);
    expect(() => session.dispatch({ type: 'next' })).toThrow();
  }
});

test('guard choices, strict phases, swap, alarms, retries and atomic replay are authoritative', () => {
  const a = createSession(), b = createSession();
  expect(() => a.dispatch({ type: 'next' })).toThrow();
  expect(() => a.dispatch({ type: 'step', cell: 23 })).toThrow();
  a.dispatch({ type: 'guard', plan: LEGAL_PLANS[0]! });
  b.dispatch({ type: 'guard', plan: LEGAL_PLANS[2]! });
  expect(forecast(a.state).lit).not.toEqual(forecast(b.state).lit);
  const frozen = JSON.stringify(a.state);
  expect(() => a.dispatch({ type: 'step', cell: 23 })).toThrow();
  const next = reduce(a.state, { type: 'swap', cell: 23 });
  expect(JSON.stringify(a.state)).toBe(frozen);
  expect(next.cat).toBe(23);
  expect(next.exhibits[0]!.cell).toBe(22);
  a.dispatch({ type: 'swap', cell: 23 });
  b.dispatch({ type: 'swap', cell: 23 });
  expect(a.state.alarm).not.toBe(b.state.alarm);
  expect(() => a.dispatch({ type: 'guard', plan: LEGAL_PLANS[1]! })).toThrow();
  while (a.state.phase === 'playing') a.dispatch({ type: 'wait' });
  expect(a.state.phase).toBe('lost');
  a.dispatch({ type: 'retry' });
  expect(a.state.retries).toBe(1);
  expect(a.state.turn).toBe(0);
  expect(a.state.plan).toEqual(LEGAL_PLANS[0]);
  const before = a.serialize();
  const forged = JSON.parse(before);
  forged.commands.push({ type: 'next' });
  expect(() => a.restore(JSON.stringify(forged))).toThrow();
  expect(a.serialize()).toBe(before);
  expect(() => a.dispatch({ type: 'guard', plan: { ...LEGAL_PLANS[0]!, offset: 9 } })).toThrow();
  const smoke = smokeCase();
  smoke.request.validate(LEGAL_PLANS[1]!);
  smoke.verify(LEGAL_PLANS[1]!);
});

test('plates, single-use paper cats, squeaks and forged reward rejection use real transitions', () => {
  const session = createSession();
  for (let i = 0; i < 5; i++) {
    session.dispatch({ type: 'guard', plan: LEGAL_PLANS[3]! });
    if (i === 1) {
      expect(forecast(session.state).blocker?.kind).toBe('bust');
      expect(forecast(session.state).lit).not.toContain(session.state.cat);
    }
    if (i === 2 || i === 4) {
      expect(exitOpen(session.state)).toBe(false);
      session.dispatch({ type: 'swap', cell: 23 });
      expect(exitOpen(session.state)).toBe(true);
    }
    if (i === 3) {
      expect(forecast(session.state).blocker?.kind).toBe('decoy');
      session.dispatch({ type: 'wait' });
      expect(session.state.exhibits.filter(item => item.kind === 'decoy')).toHaveLength(0);
      expect(session.state.alarm).toBe(0);
    }
    const witness = solve(session.state);
    expect(witness).not.toBeNull();
    let heardSqueak = false;
    for (const action of witness!.actions) {
      const before = session.state;
      session.dispatch(action);
      if (action.type !== 'wait' && ROOMS[i]!.squeaks.includes(action.cell)) {
        heardSqueak = true;
        expect(session.state.alarm).toBeGreaterThan(before.alarm);
      }
    }
    if (i === 4) expect(heardSqueak).toBe(true);
    if (i < 4) session.dispatch({ type: 'next' });
  }
  const encoded = session.serialize();
  const forged = JSON.parse(encoded);
  forged.stars = [3, 3, 3, 3, 3];
  expect(() => session.restore(JSON.stringify(forged))).toThrow();
  expect(session.serialize()).toBe(encoded);
});

test('real canvas campaign wins through legitimate steps, unlocks, public history and local replay', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await installAgentFixture(page, turn => ({ ...LEGAL_PLANS[turn.index % 4]!, intention: '沿刚才的猫爪印巡查。' }));
  await open(page);
  expect(calls).toHaveLength(0);
  const mirror = createSession();
  for (let room = 0; room < 5; room++) {
    await page.locator('[data-primary]').click();
    await expect(game(page)).toHaveAttribute('data-phase', 'playing');
    const plan = { ...LEGAL_PLANS[room % 4]!, intention: '沿刚才的猫爪印巡查。' };
    mirror.dispatch({ type: 'guard', plan });
    const witness = solve(mirror.state)!;
    expect(witness).not.toBeNull();
    for (const action of witness.actions) {
      await perform(page, action);
      mirror.dispatch(action);
      await expect(game(page)).toHaveAttribute('data-cat', String(mirror.state.cat));
      await expect(game(page)).toHaveAttribute('data-alarm', String(mirror.state.alarm));
    }
    await expect(game(page)).toHaveAttribute('data-phase', room === 4 ? 'won' : 'cleared');
    await expect(game(page)).toHaveAttribute('data-stars', mirror.state.stars.join(','));
    if (room < 4) {
      await page.locator('[data-primary]').click();
      mirror.dispatch({ type: 'next' });
      await expect(game(page)).toHaveAttribute('data-room', String(room + 1));
      await expect(game(page)).toHaveAttribute('data-phase', 'briefing');
    }
  }
  expect(calls).toHaveLength(5);
  expect(calls[4]!.observation.publicRouteHistory).toHaveLength(4);
  expect(calls.every(call => call.tool === 'commit_night_patrol')).toBe(true);
  await expect(page.locator('[data-goal]')).toContainText('五室通关');
  expect(mirror.moveCount).toBeLessThan(250);
  await page.screenshot({ path: info.outputPath('cat-shift-campaign.png') });
  await page.reload();
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-ready', 'true');
  await expect(game(page)).toHaveAttribute('data-phase', 'won');
  await expect(game(page)).toHaveAttribute('data-stars', mirror.state.stars.join(','));
  expect(calls).toHaveLength(5);
  await expect(page.locator('[data-wait]')).toBeDisabled();
});

test('keyboard, real pointer, loss and limited retry have no extra model turns', async ({ page }) => {
  const calls = await installAgentFixture(page, () => LEGAL_PLANS[3]!);
  await open(page);
  await page.locator('[data-primary]').click();
  await expect(game(page)).toHaveAttribute('data-phase', 'playing');
  await clickCell(page, 23);
  await expect(game(page)).toHaveAttribute('data-turn', '0');
  await expect(page.locator('[data-notice]')).toContainText('借位');
  await page.keyboard.press('Shift');
  await page.keyboard.press('ArrowRight');
  await expect(game(page)).toHaveAttribute('data-cat', '23');
  await expect(game(page)).toHaveAttribute('data-turn', '1');
  for (let attempt = 0; attempt < 3; attempt++) {
    while (await game(page).getAttribute('data-phase') === 'playing') await page.keyboard.press('Space');
    await expect(game(page)).toHaveAttribute('data-phase', 'lost');
    await expect(game(page)).toHaveAttribute('data-alarm', '4');
    if (attempt < 2) {
      await page.locator('[data-retry]').click();
      await expect(game(page)).toHaveAttribute('data-retries', String(1 - attempt));
      await expect(game(page)).toHaveAttribute('data-turn', '0');
      await expect(game(page)).toHaveAttribute('data-phase', 'playing');
      await perform(page, { type: 'swap', cell: 23 });
      await page.locator('[data-stage] canvas').focus();
    }
  }
  await expect(page.locator('[data-retry]')).toBeDisabled();
  expect(calls).toHaveLength(1);
  await restart(page);
  await expect(game(page)).toHaveAttribute('data-retries', '2');
  await expect(game(page)).toHaveAttribute('data-stars', '');
});

test('pause, Chinese dialogs, form and collection-menu focus suppress game input', async ({ page }, info) => {
  await installAgentFixture(page, () => LEGAL_PLANS[0]!);
  await open(page);
  await page.locator('[data-primary]').click();
  await expect(game(page)).toHaveAttribute('data-phase', 'playing');
  await page.locator('[data-pause]').click();
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  await clickCell(page, 23);
  await page.keyboard.press('Shift');
  await page.keyboard.press('ArrowRight');
  await expect(game(page)).toHaveAttribute('data-turn', '0');
  await expect(page.locator('[data-swap]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-help]').click();
  await expect(page.getByRole('dialog')).toContainText('三条猫规矩');
  await page.keyboard.press('Escape');
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  await page.locator('[data-pause]').click();
  await page.locator('[data-pause]').press('Space');
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  await page.locator('[data-pause]').click();
  await page.locator('[data-agent-connect]').click();
  await page.locator('[data-agent-model]').fill('键盘不走猫');
  await page.locator('[data-agent-model]').press('ArrowRight');
  await page.keyboard.press('Shift');
  await expect(game(page)).toHaveAttribute('data-turn', '0');
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  await page.keyboard.press('Escape');
  await page.locator('[data-menu-toggle]').focus();
  await page.keyboard.press('Shift');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-swap]')).toHaveAttribute('aria-pressed', 'false');
  await expect(game(page)).toHaveAttribute('data-turn', '0');
  await page.locator('[data-stage] canvas').focus();
  await page.keyboard.press('Shift');
  await page.keyboard.press('d');
  await expect(game(page)).toHaveAttribute('data-cat', '23');
  await expect(game(page)).toHaveAttribute('data-turn', '1');
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('[data-stage] canvas')).toBeVisible();
    const layout = await page.evaluate(() => {
      const root = document.querySelector('.project-cat-shift')!;
      const selectors = ['h1', '[data-stage] canvas', '[data-pause]', '[data-retry]', '[data-swap]', '[data-primary]'];
      return { scroll: document.documentElement.scrollWidth, height: root.scrollHeight, boxes: selectors.map(selector => {
        const box = root.querySelector(selector)!.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      }) };
    });
    expect(layout.scroll).toBeLessThanOrEqual(size.width);
    expect(layout.height).toBeLessThanOrEqual(size.height + 1);
    for (const box of layout.boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(size.width);
      expect(box.bottom).toBeLessThanOrEqual(size.height);
    }
    if (size.width === 1440) await page.screenshot({ path: info.outputPath('cat-shift-playing.png') });
  }
});

test('invalid and HTTP-failed model calls spend nothing and never invent patrols', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => turn.index < 2 ?
    { lane: 'diagonal', offset: 0, intention: '非法斜巡' } : LEGAL_PLANS[0]!);
  await open(page);
  await page.locator('[data-primary]').click();
  await expect(page.locator('[data-connection]')).toHaveAttribute('data-agent-error', 'true');
  expect(calls).toHaveLength(2);
  await expect(game(page)).toHaveAttribute('data-commands', '0');
  await expect(game(page)).toHaveAttribute('data-retries', '2');
  await expect(game(page)).toHaveAttribute('data-phase', 'briefing');
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: 'Unavailable' }), { times: 1 });
  await page.locator('[data-primary]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('503');
  await expect(game(page)).toHaveAttribute('data-commands', '0');
  await page.locator('[data-primary]').click();
  await expect(game(page)).toHaveAttribute('data-phase', 'playing');
  await expect(game(page)).toHaveAttribute('data-commands', '1');
});

test('cancel, new night and replay import invalidate pending ownership without spending resources', async ({ page }) => {
  let release: (() => void) | undefined;
  const calls = await installAgentFixture(page, async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { ...LEGAL_PLANS[0]!, intention: '旧脚印不能覆盖新夜。' };
  });
  await open(page);
  await page.locator('[data-primary]').click();
  await expect.poll(() => calls.length).toBe(1);
  await page.locator('[data-retry]').click();
  release!();
  await expect(game(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(game(page)).toHaveAttribute('data-commands', '0');
  await expect(game(page)).toHaveAttribute('data-phase', 'briefing');
  await page.locator('[data-primary]').click();
  await expect.poll(() => calls.length).toBe(2);
  await restart(page);
  release!();
  await expect(game(page)).toHaveAttribute('data-commands', '0');
  await expect(game(page)).toHaveAttribute('data-agent-busy', 'false');
  await page.locator('[data-primary]').click();
  await expect.poll(() => calls.length).toBe(3);
  const replay = createSession();
  const plan: Plan = { ...LEGAL_PLANS[2]!, intention: '手账中的横向脚印。' };
  replay.dispatch({ type: 'guard', plan });
  replay.dispatch({ type: 'swap', cell: 23 });
  await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({
    name: 'cat-shift-replay.json', mimeType: 'application/json', buffer: Buffer.from(replay.serialize()),
  });
  await expect(game(page)).toHaveAttribute('data-turn', '1');
  release!();
  await page.keyboard.press('Escape');
  await expect(game(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-intention]')).toContainText('手账中的横向脚印');
  await expect(game(page)).toHaveAttribute('data-commands', '2');
  await page.reload();
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-ready', 'true');
  await expect(game(page)).toHaveAttribute('data-turn', '1');
  expect(calls).toHaveLength(3);
  const forged = JSON.parse(replay.serialize());
  forged.commands.push({ type: 'next' });
  await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({
    name: 'forged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)),
  });
  await expect(page.locator('[data-game-save-status]')).toContainText('拒绝');
  await expect(game(page)).toHaveAttribute('data-turn', '1');
});

test('Phaser resources remain bounded through repeated actual resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await installAgentFixture(page, () => LEGAL_PLANS[0]!);
  await open(page);
  await expect(game(page).locator('[data-stage]')).toHaveAttribute('data-phaser-version', '4.2.1');
  let baseline: number | undefined;
  let textureCount = 0, maximumTweens = 0;
  for (let iteration = 0; iteration < 8; iteration++) {
    await page.locator('[data-primary]').click();
    await expect(game(page)).toHaveAttribute('data-phase', 'playing');
    await perform(page, { type: 'swap', cell: 23 });
    await restart(page);
    await page.locator('[data-help]').click();
    const metrics = page.locator('[data-metrics]');
    const objects = Number(await metrics.getAttribute('data-objects'));
    baseline ??= objects;
    expect(objects).toBe(baseline);
    expect(objects).toBeLessThanOrEqual(200);
    textureCount = Number(await metrics.getAttribute('data-textures'));
    maximumTweens = Math.max(maximumTweens, Number(await metrics.getAttribute('data-tweens')));
    expect(textureCount).toBeLessThanOrEqual(64);
    expect(maximumTweens).toBeLessThanOrEqual(32);
    await expect(page.locator('[data-stage] canvas')).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  console.info(`Cat-shift measured after eight resets: ${baseline} objects, ${textureCount} textures, ${maximumTweens} concurrent tweens.`);
  expect(errors).toEqual([]);
});
