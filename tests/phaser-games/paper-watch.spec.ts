import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture, configureFixtureConnection } from '../helpers/agent-fixtures';
import { ARCHETYPES, FORMATIONS, CHAPTERS, WAVE_TICKS, schedule } from '../../src/projects/paper-watch/data';
import type { Lane, Plan } from '../../src/projects/paper-watch/data';
import { create, definition, medal, parseCommand, parsePlan, reduce } from '../../src/projects/paper-watch/engine';
import { createRound, replay, step, winningTrace } from '../../src/projects/paper-watch/simulation';
import { smokeCase } from '../../src/projects/paper-watch/agent';
import { GameSession } from '../../src/core/games/session';

const opening: Plan = { formation: 'procession', focus: 0, spacing: 36, archetype: 'moth', feint: false, intention: '沿三巷轮流展开，留心金边。' };
const rootSelector = '.project-paper-watch';
const saveKey = 'odd-index:game:paper-watch:v1';
function planFor(wave: number): Plan {
  return { ...opening, formation: FORMATIONS[(wave - 1) % 3], focus: ((wave - 1) % 3) as Lane, spacing: wave % 2 ? 36 : 32, archetype: ARCHETYPES[(wave - 1) % 3], feint: wave === 3, intention: `第${wave}更沿公开巷道展开，照亮后再闪光。` };
}
test('全部540种合法更次编排有不失城折的构造解，含双阶段墨冠', () => {
  let cases = 0;
  for (const formation of FORMATIONS) for (const focus of [0, 1, 2] as const) for (const spacing of [32, 36] as const)
    for (const archetype of ARCHETYPES) for (const feint of [false, true]) for (let wave = 0; wave < 5; wave++) {
      const plan = parsePlan({ formation, focus, spacing, archetype, feint, intention: '公开换巷，固定节奏。' });
      const events = schedule(plan, wave);
      expect(events.at(-1)!.tick + 60).toBeLessThanOrEqual(WAVE_TICKS);
      expect(events.every((e, i) => i === 0 || e.tick - events[i - 1].tick >= 32)).toBe(true);
      const r = replay(plan, wave, 3, [], winningTrace(plan, wave), WAVE_TICKS);
      expect(r.lives).toBe(3); expect(r.stats.cleared).toBe(CHAPTERS[wave].count);
      expect(r.lamps.every(l => l.energy >= 0 && l.energy <= 100 && l.heat >= 0 && l.heat <= 100)).toBe(true);
      cases++;
    }
  expect(cases).toBe(540);
  const smoke = smokeCase(); smoke.request.tool.parse(opening); smoke.verify(opening);
  expect(schedule(opening, 0)).not.toEqual(schedule({ ...opening, formation: 'gather', focus: 2 }, 0));
});
test('闪光、热度、能量、得分、死亡刻与结束刻由固定步引擎决定', () => {
  const r = createRound(opening, 0);
  for (let tick = 1; tick <= 80; tick++) step(r, tick === 80 ? { tick, lane: 0, pulse: true } : undefined);
  expect(r.shadows[0].status).toBe('star'); expect(r.lives).toBe(3); expect(r.score).toBe(110);
  const tooEarly = createRound(opening, 0);
  for (let tick = 1; tick <= 44; tick++) step(tooEarly, [43, 44].includes(tick) ? { tick, lane: 0, pulse: true } : undefined);
  expect(tooEarly.stats.misses).toBe(1); expect(tooEarly.stats.cleared).toBe(0); expect(tooEarly.stats.pulses).toBe(1);
  const bonus = createRound(opening, 0);
  for (let tick = 1; tick <= 64; tick++) step(bonus, tick === 64 ? { tick, lane: 0, pulse: true } : undefined);
  expect(bonus.score).toBe(130);
  const held = createRound(opening, 0);
  for (let tick = 1; tick <= 72; tick++) step(held, { tick, lane: 1, pulse: true });
  expect(held.stats.pulses).toBeLessThan(10); expect(held.lamps[1].heat).toBeGreaterThan(68);
  expect(held.lamps[0].energy).toBe(100);
  const lost = replay(opening, 0, 3, [], [], 152);
  expect(lost.lives).toBe(0); expect(lost.score).toBe(0);
  expect(() => step(lost, { tick: 153, lane: 0, pulse: true })).toThrow();
  expect(() => replay(opening, 0, 3, [], [{ tick: 153, lane: 0, pulse: true }], 153)).toThrow();
  expect(() => replay(opening, 0, 3, [], [], 151)).toThrow();
});
test('输入排序、数量、字段、阶段、回放原子性与本地奖灯', () => {
  const session = new GameSession(definition, 91);
  const initial = session.serialize();
  expect(() => session.dispatch({ type: 'upgrade', upgrade: 'reserve' })).toThrow();
  expect(() => session.dispatch({ type: 'finish', trace: [], endTick: 480 })).toThrow();
  expect(() => parsePlan({ ...opening, spacing: 33 })).toThrow();
  expect(() => parsePlan({ ...opening, reward: 999 })).toThrow();
  expect(() => parsePlan({ ...opening, intention: 'https://example.org' })).toThrow();
  expect(() => parseCommand({ type: 'finish', trace: [], endTick: 480, score: 9999 })).toThrow();
  expect(() => parseCommand({ type: 'finish', trace: Array.from({ length: 481 }, () => ({ tick: 1, lane: 0, pulse: true })), endTick: 480 })).toThrow();
  session.preview({ type: 'plan', plan: opening }); expect(session.serialize()).toBe(initial);
  session.dispatch({ type: 'plan', plan: opening });
  const prepared = session.serialize(), revision = session.revision;
  expect(() => session.dispatch({ type: 'plan', plan: opening })).toThrow();
  expect(() => session.dispatch({ type: 'finish', trace: [{ tick: 2, lane: 0, pulse: true }, { tick: 2, lane: 0, pulse: false }], endTick: 480 })).toThrow();
  expect(() => session.restore(JSON.stringify({ ...JSON.parse(prepared), commands: [{ type: 'upgrade', upgrade: 'reserve' }] }))).toThrow();
  expect(session.serialize()).toBe(prepared); expect(session.revision).toBe(revision);
  session.dispatch({ type: 'finish', trace: winningTrace(opening, 0), endTick: 480 });
  expect(session.state.phase).toBe('upgrade');
  const restored = new GameSession(definition);
  restored.restore(session.serialize()); expect(restored.state).toEqual(session.state);
  const completedScore = restored.state.score;
  restored.dispatch({ type: 'upgrade', upgrade: 'reserve' }); restored.dispatch({ type: 'plan', plan: opening });
  const unfinished = new GameSession(definition);
  unfinished.restore(restored.serialize());
  expect(unfinished.state.phase).toBe('prepared'); expect(unfinished.state.score).toBe(completedScore);
  expect(createRound(opening, 1, unfinished.state.lives, unfinished.state.upgrades).tick).toBe(0);
  let state = create(91);
  for (let wave = 0; wave < 5; wave++) {
    state = reduce(state, { type: 'plan', plan: opening });
    state = reduce(state, { type: 'finish', trace: winningTrace(opening, wave), endTick: 480 });
    if (wave < 4) state = reduce(state, { type: 'upgrade', upgrade: wave % 2 ? 'breeze' : 'reserve' });
  }
  expect(state.phase).toBe('won'); expect(medal(state)).toContain('金灯');
  expect(() => reduce(state, { type: 'plan', plan: opening })).toThrow();
  expect(() => reduce(state, { type: 'finish', trace: [], endTick: 1 })).toThrow();
});

async function open(page: Page) {
  await page.clock.install();
  await page.goto('./projects/paper-watch/');
  await expect(page.locator('[data-phaser-ready]')).toHaveAttribute('data-phaser-ready', 'true');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
async function advanceTo(page: Page, target: number) {
  const root = page.locator(rootSelector);
  for (let tries = 0; tries < 5; tries++) {
    const current = Number(await root.getAttribute('data-tick'));
    if (current >= target) return current;
    await page.clock.runFor((target - current) * 50);
  }
  throw new Error(`逻辑时钟未到达 ${target}`);
}
async function flash(page: Page, tick: number, lane: Lane, pointer = false) {
  await advanceTo(page, tick - 1);
  if (pointer) {
    const canvas = page.getByRole('img', { name: '纸城三巷折灯舞台' });
    const b = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: b.width * [330, 720, 1110][lane] / 1440, y: b.height * 350 / 640 } });
    await page.clock.runFor(50);
  } else {
    await page.keyboard.press(String(lane + 1)); await page.keyboard.press('Space');
    await page.clock.runFor(50);
  }
}
test('真实客户端与合法键鼠完成五更金灯通关，导出回放重算并保留资源上限', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const calls = await installAgentFixture(page, turn => planFor(Number(turn.observation.wave)));
  await open(page);
  const root = page.locator(rootSelector);
  expect(calls).toHaveLength(0);
  for (let wave = 0; wave < 5; wave++) {
    await root.locator('[data-main]').click();
    await expect(root).toHaveAttribute('data-phase', 'prepared');
    await expect(root.locator('[data-preview]')).toContainText('西街');
    await page.clock.runFor(2000); await expect(root).toHaveAttribute('data-tick', '0');
    await root.getByRole('button', { name: '准备好了 · 开更', exact: true }).click();
    for (const spawn of schedule(planFor(wave + 1), wave)) {
      await flash(page, spawn.tick + 36, spawn.lane, spawn.id % 3 === 0);
      if (spawn.kind === 'crown') await flash(page, spawn.tick + 46, spawn.lane);
    }
    await advanceTo(page, 480);
    await expect(root).toHaveAttribute('data-phase', wave === 4 ? 'won' : 'upgrade');
    const metrics = JSON.parse((await root.getAttribute('data-metrics'))!);
    expect(metrics.objects).toBe(164); expect(metrics.textures).toBeLessThanOrEqual(32); expect(metrics.tweens).toBeLessThanOrEqual(16);
    if (wave < 4) await root.locator(`[data-upgrade="${wave % 2 ? 'breeze' : 'reserve'}"]`).click();
  }
  await expect(root.locator('[data-kicker]')).toContainText('金灯');
  expect(calls).toHaveLength(5);
  expect(calls[1].observation.previousWave).toMatchObject({ cleared: 8, misses: 0 });
  const encoded = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), saveKey);
  const restored = new GameSession(definition); restored.restore(encoded);
  expect(restored.state.phase).toBe('won');
  expect(String(restored.state.score)).toBe(await root.getAttribute('data-score'));
  for (const command of JSON.parse(encoded).commands) if (command.type === 'finish') {
    expect(command.trace.length).toBeGreaterThan(0); expect(command).not.toHaveProperty('score');
  }
  await root.getByRole('button', { name: '夜巡手记', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.locator('[data-game-export]').click();
  expect((await download).suggestedFilename()).toBe('paper-watch-replay.json');
  await page.keyboard.press('Escape');
  await root.getByRole('button', { name: '再守一夜', exact: true }).click();
  await expect(root).toHaveAttribute('data-phase', 'awaiting');
  await root.getByRole('button', { name: '夜巡手记', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'paper-watch.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(root).toHaveAttribute('data-phase', 'won');
  expect(calls).toHaveLength(5);
  expect(errors).toEqual([]);
});
test('原生弹窗、手动暂停、隐藏页面清空长按；减弱动画不禁玩法；失城重开', async ({ page }) => {
  test.setTimeout(90_000);
  await installAgentFixture(page, () => opening);
  await open(page);
  const root = page.locator(rootSelector);
  await root.locator('[data-main]').click(); await expect(root).toHaveAttribute('data-phase', 'prepared');
  await root.locator('[data-main]').click();
  await advanceTo(page, 10);
  await page.keyboard.down('Space'); await page.clock.runFor(50);
  await root.locator('[data-pause]').click();
  const tick = await root.getAttribute('data-tick'), pulses = await root.getAttribute('data-pulses');
  await page.clock.runFor(4000); await expect(root).toHaveAttribute('data-tick', tick!);
  await root.locator('[data-help]').click(); await page.keyboard.press('1'); await page.keyboard.press('Space');
  await page.keyboard.press('Escape'); await expect(root).toHaveAttribute('data-paused', 'true');
  await root.locator('[data-pause]').click(); await page.clock.runFor(500);
  await expect(root).toHaveAttribute('data-pulses', pulses!); await page.keyboard.up('Space');
  await root.locator('[data-help]').click(); const modalTick = await root.getAttribute('data-tick');
  await page.clock.runFor(4000); await expect(root).toHaveAttribute('data-tick', modalTick!);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenTick = await root.getAttribute('data-tick');
  await page.clock.runFor(4000); await expect(root).toHaveAttribute('data-tick', hiddenTick!);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(500);
  expect(Number(await root.getAttribute('data-tick')) - Number(hiddenTick)).toBeLessThanOrEqual(12);
  await advanceTo(page, 152);
  await expect(root).toHaveAttribute('data-phase', 'lost');
  const lostTick = await root.getAttribute('data-tick');
  await page.getByRole('img', { name: '纸城三巷折灯舞台' }).focus();
  await page.keyboard.press('Space'); await page.clock.runFor(1000); await expect(root).toHaveAttribute('data-tick', lostTick!);
  await root.locator('[data-reset]').click(); await expect(root).toHaveAttribute('data-phase', 'awaiting');
  await expect(root.locator('[data-lives]')).toHaveText('◆ ◆ ◆');
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await expect(root.getByRole('heading', { name: '纸上守夜', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect.poll(async () => {
      const canvas = (await page.getByRole('img', { name: '纸城三巷折灯舞台' }).boundingBox())!;
      const host = (await root.locator('[data-stage]').boundingBox())!;
      return canvas.x >= host.x - 1 && canvas.y >= host.y - 1 && canvas.x + canvas.width <= host.x + host.width + 1 && canvas.y + canvas.height <= host.y + host.height + 1;
    }).toBe(true);
  }
});
test('非法编排仅纠正一次，网络失败与取消、重置后的迟到答复不启动一更', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await installAgentFixture(page, () => ({ ...opening, spacing: 33 }));
  await page.goto('./projects/paper-watch/');
  const root = page.locator(rootSelector);
  await expect(page.locator('[data-phaser-ready]')).toHaveAttribute('data-phaser-ready', 'true');
  await root.locator('[data-main]').click();
  await expect.poll(() => calls.length).toBe(2);
  await expect(root.locator('[data-main]')).toBeEnabled(); await expect(root).toHaveAttribute('data-phase', 'awaiting');
  await expect(root).toHaveAttribute('data-score', '0');
  await page.unroute('**/api/openai/v1/chat/completions');
  await page.route('**/api/openai/v1/chat/completions', route => route.abort('failed'));
  await root.locator('[data-main]').click(); await expect(root.locator('[data-main]')).toBeEnabled();
  await expect(root).toHaveAttribute('data-phase', 'awaiting');
  await page.unroute('**/api/openai/v1/chat/completions');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const delayed = await installAgentFixture(page, async () => { await gate; return opening; });
  await root.locator('[data-main]').click(); await expect.poll(() => delayed.length).toBe(1);
  await root.locator('[data-reset]').click(); release();
  await expect(root).toHaveAttribute('data-phase', 'awaiting'); await expect(root).toHaveAttribute('data-tick', '0');
  await root.locator('[data-main]').click(); await expect(root).toHaveAttribute('data-phase', 'prepared');
  await root.locator('[data-save]').click();
  const before = await page.evaluate(key => localStorage.getItem(key), saveKey);
  await page.locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"score":999999}') });
  await expect(page.locator('[data-game-save-status]')).toContainText('拒绝');
  expect(await page.evaluate(key => localStorage.getItem(key), saveKey)).toBe(before);
  await page.keyboard.press('Escape');
  await page.reload(); await expect(root).toHaveAttribute('data-phase', 'prepared');
  await expect(root).toHaveAttribute('data-tick', '0');
});
test('连接设置文本输入不触发灯道快捷键，未连接不会自动开局', async ({ page }) => {
  await configureFixtureConnection(page);
  await page.goto('./projects/paper-watch/');
  const root = page.locator(rootSelector);
  await root.locator('[data-agent-connect]').click();
  const model = page.locator('[data-agent-model]');
  await model.fill(''); await model.pressSequentially('123 p');
  await expect(model).toHaveValue('123 p'); await expect(root).toHaveAttribute('data-phase', 'awaiting');
  await expect(root).toHaveAttribute('data-selected', '1');
});
