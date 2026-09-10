import { expect, test, type Download, type Page } from '@playwright/test';
import { installAgentFixture, configureFixtureConnection, nativeToolResponse, type FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { classify, RULE_IDS, RULES, type Direction, type Parcel, type Plan } from '../../src/projects/dream-sorter/data';
import { create, definition, parseCommand, reduce, startWave, type Command } from '../../src/projects/dream-sorter/engine';
import { makeBatch, replayWave, step, validateBatch, type Input, type Simulation } from '../../src/projects/dream-sorter/simulation';
import { smokeCase } from '../../src/projects/dream-sorter/agent';

const ROOT = '.project-dream-sorter';
const SAVE = 'odd-index:game:dream-sorter:v1';
const plans: Plan[] = [
  { rule: 'sun', rhythm: 'steady', pattern: 'alternate', first: 'day' },
  { rule: 'not-moon', rhythm: 'breathing', pattern: 'pairs', first: 'night' },
  { rule: 'exact-two', rhythm: 'quick', pattern: 'crossing', first: 'day' },
  { rule: 'two-plus', rhythm: 'steady', pattern: 'alternate', first: 'night' },
];
function fixture(turn: FixtureTurn): Plan { return plans[Number(turn.observation.wave) - 1]; }
function finishCorrect(initial: Simulation) {
  let sim = initial;
  const inputs: Input[] = [];
  while (sim.status === 'running') {
    const input: Input | undefined = sim.tick + 1 >= sim.arrival
      ? { tick: sim.tick + 1, action: classify(sim.batch[sim.index], sim.rule) } : undefined;
    sim = step(sim, input);
    if (input) inputs.push(input);
  }
  return { sim, inputs, endTick: sim.tick };
}
async function open(page: Page) {
  await page.goto('./projects/dream-sorter/');
  await expect(page.locator(`${ROOT} h1`)).toHaveText('梦境分拣局');
  await expect(page.locator('[data-scene]')).toHaveAttribute('data-phaser-ready', 'true');
  const now = new Date('2026-09-10T12:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
}
async function beginWave(page: Page) {
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'ready');
  const preview = await page.locator('[data-rule]').textContent();
  await page.clock.runFor(1100);
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await expect(page.locator('[data-primary]')).toHaveText('准备好了，开带');
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'running');
  return preview;
}
async function waitParcel(page: Page) {
  for (let n = 0; n < 30; n++) {
    if ((await page.locator('[data-current]').textContent())?.startsWith('正在分拣')) return;
    await page.clock.runFor(50);
  }
  throw new Error('The real fixed-step conveyor did not deliver a parcel.');
}
async function readDirection(page: Page): Promise<Direction> {
  const description = await page.locator('[data-current]').innerText();
  const rule = await page.locator('[data-rule]').innerText();
  const stamps = Number(description.match(/(\d) 枚邮票/)?.[1]);
  const day = rule === RULES.sun.title ? description.includes('太阳')
    : rule === RULES.orange.title ? description.includes('橙色')
      : rule === RULES['not-moon'].title ? !description.includes('月亮')
        : rule === RULES['exact-two'].title ? stamps === 2 : stamps >= 2;
  return day ? 'day' : 'night';
}
async function sort(page: Page, correct = true, method: 'key' | 'button' | 'canvas' = 'key') {
  await waitParcel(page);
  const expected = await readDirection(page);
  const direction = correct ? expected : expected === 'day' ? 'night' : 'day';
  if (method === 'key') {
    await page.locator('[data-scene] canvas').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press(direction === 'day' ? 'ArrowLeft' : 'd');
  }
  if (method === 'button') await page.locator(direction === 'day' ? '[data-day]' : '[data-night]').click();
  if (method === 'canvas') {
    const box = await page.locator('[data-scene] canvas').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * (direction === 'day' ? 175 : 785) / 960, box!.y + box!.height * 531 / 600);
  }
  await page.clock.runFor(100);
}
async function receipt(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('No exported replay.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
async function counts(page: Page) {
  return page.locator('[data-scene]').evaluate(element => ({
    objects: Number((element as HTMLElement).dataset.objects),
    textures: Number((element as HTMLElement).dataset.textures),
    tweens: Number((element as HTMLElement).dataset.tweens),
  }));
}
async function checkBudget(page: Page) {
  const m = await counts(page);
  expect(m.objects).toBeGreaterThan(40);
  expect(m.objects).toBeLessThanOrEqual(200);
  expect(m.textures).toBeLessThanOrEqual(64);
  expect(m.tweens).toBeLessThanOrEqual(32);
  return m;
}

test('every local rule, negation, equality and boundary; legal batches really change mechanics', () => {
  for (const symbol of ['sun', 'moon', 'star'] as const) {
    for (const color of ['orange', 'blue'] as const) {
      for (const stamps of [1, 2, 3] as const) {
        const parcel: Parcel = { id: 'probe', symbol, color, stamps, shape: 'bird', gap: 8, window: 50 };
        expect(classify(parcel, 'sun')).toBe(symbol === 'sun' ? 'day' : 'night');
        expect(classify(parcel, 'orange')).toBe(color === 'orange' ? 'day' : 'night');
        expect(classify(parcel, 'not-moon')).toBe(symbol !== 'moon' ? 'day' : 'night');
        expect(classify(parcel, 'exact-two')).toBe(stamps === 2 ? 'day' : 'night');
        expect(classify(parcel, 'two-plus')).toBe(stamps >= 2 ? 'day' : 'night');
      }
    }
  }
  for (const seed of [0, 89, 4294967295]) {
    for (const rule of RULE_IDS) {
      for (const rhythm of ['steady', 'quick', 'breathing'] as const) {
        const plan: Plan = { rule, rhythm, pattern: 'crossing', first: 'night' };
        for (const difficulty of ['calm', 'regular'] as const) {
          const batch = makeBatch(seed, 2, difficulty, plan);
          expect(batch.filter(p => classify(p, rule) === 'day')).toHaveLength(3);
          expect(new Set(batch.map(p => p.id)).size).toBe(6);
          expect(() => validateBatch(batch, plan)).not.toThrow();
          expect(batch).toEqual(makeBatch(seed, 2, difficulty, plan));
        }
      }
    }
  }
  const first = makeBatch(89, 2, 'regular', plans[0]);
  const second = makeBatch(89, 2, 'regular', plans[1]);
  expect(first.map(p => classify(p, plans[0].rule))).not.toEqual(second.map(p => classify(p, plans[1].rule)));
  expect(first.map(p => p.window)).not.toEqual(second.map(p => p.window));
  expect(() => validateBatch([first[0], first[0], ...first.slice(2)], plans[0])).toThrow(/独立/);
  smokeCase().verify(plans[0]);
});

test('fixed ticks, exclusive deadline, holds, terminal replay and untrusted fields are authoritative', () => {
  const session = new GameSession(definition, 89);
  session.dispatch({ type: 'plan', plan: plans[0] });
  const initial = startWave(session.state);
  expect(() => step(initial, { tick: 1, action: 'day' })).toThrow(/窗口/);
  expect(() => step(initial, { tick: 2, action: 'day' })).toThrow(/下一个/);
  let beforeDeadline = initial;
  while (beforeDeadline.tick < initial.deadline - 2) beforeDeadline = step(beforeDeadline);
  expect(step(beforeDeadline, { tick: initial.deadline - 1, action: 'day' }).score).toBe(110);
  const lastTick = step(beforeDeadline);
  expect(() => step(lastTick, { tick: initial.deadline, action: 'day' })).toThrow(/窗口/);
  expect(step(lastTick).outcomes[0]).toMatchObject({ actual: 'timeout', tick: initial.deadline, correct: false });
  let held = initial;
  while (held.tick < held.arrival - 1) held = step(held);
  held = step(held, { tick: held.tick + 1, action: 'hold' });
  expect(held.deadline).toBe(initial.deadline + 24);
  expect(held.holds).toBe(1);
  expect(() => step(held, { tick: held.tick + 1, action: 'hold' })).toThrow(/额度/);
  held = step(held, { tick: held.tick + 1, action: classify(held.batch[held.index], held.rule) });
  while (held.tick < held.arrival - 1) held = step(held);
  held = step(held, { tick: held.tick + 1, action: 'hold' });
  expect(held.holds).toBe(0);
  held = step(held, { tick: held.tick + 1, action: classify(held.batch[held.index], held.rule) });
  while (held.tick < held.arrival - 1) held = step(held);
  expect(() => step(held, { tick: held.tick + 1, action: 'hold' })).toThrow(/额度/);
  const finish = finishCorrect(initial);
  const command: Command = { type: 'finish', inputs: finish.inputs, endTick: finish.endTick };
  expect(replayWave(initial, finish.inputs, finish.endTick)).toEqual(finish.sim);
  expect(() => replayWave(initial, finish.inputs, finish.endTick + 1)).toThrow(/结束后/);
  expect(() => replayWave(initial, finish.inputs.slice(1), finish.endTick)).toThrow();
  expect(() => replayWave(initial, [finish.inputs[0], ...finish.inputs], finish.endTick)).toThrow(/严格递增/);
  expect(() => parseCommand({ ...command, score: 999999 })).toThrow(AgentValidationError);
  expect(() => parseCommand({ ...command, inputs: [{ tick: 8.5, action: 'day' }] })).toThrow();
  expect(() => parseCommand({ ...command, inputs: [{ tick: -1, action: 'day' }] })).toThrow();
  const before = session.serialize(), rev = session.revision;
  expect(() => session.dispatch({ ...command, endTick: 1 })).toThrow();
  expect(session.serialize()).toBe(before); expect(session.revision).toBe(rev);
  session.dispatch(command);
  expect(() => session.dispatch(command)).toThrow(/批次/);
  expect(() => session.dispatch({ type: 'plan', plan: plans[0] })).toThrow(/新规则/);
  expect(() => session.dispatch({ type: 'plan', plan: { ...plans[0], rule: 'orange' } })).toThrow(/编组/);
  for (const plan of plans.slice(1)) {
    session.dispatch({ type: 'plan', plan });
    const round = finishCorrect(startWave(session.state));
    session.dispatch({ type: 'finish', inputs: round.inputs, endTick: round.endTick });
  }
  expect(session.state.phase).toBe('won');
  expect(session.state.lives).toBe(3);
  expect(session.state.combo).toBe(24);
  expect(() => session.dispatch({ type: 'plan', plan: plans[0] })).toThrow(/之间/);
  const restored = new GameSession(definition, 0);
  restored.restore(session.serialize());
  expect(restored.state).toEqual(session.state);
  const malformed = JSON.parse(session.serialize());
  malformed.commands.at(-1).score = 123456;
  const stable = restored.serialize();
  expect(() => restored.restore(JSON.stringify(malformed))).toThrow();
  expect(restored.serialize()).toBe(stable);
  expect(() => reduce(create(89), { type: 'plan', plan: { ...plans[0], rule: 'exact-two' } })).toThrow(/允许/);
});

test('desktop UI wins four real-clock waves with native AI tools, mouse and keys; exports validated replay', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await installAgentFixture(page, fixture);
  await open(page);
  expect(calls).toHaveLength(0);
  await expect(page.locator('[data-scene]')).toHaveAttribute('data-phaser-version', '4.2.1');
  const baseline = await checkBudget(page);
  for (let wave = 0; wave < 4; wave++) {
    expect(await beginWave(page)).toBe(RULES[plans[wave].rule].title);
    for (let parcel = 0; parcel < 6; parcel++) await sort(page, true, parcel % 3 === 0 ? 'canvas' : parcel % 3 === 1 ? 'button' : 'key');
    await expect(page.locator(ROOT)).toHaveAttribute('data-phase', wave === 3 ? 'won' : 'between');
    const m = await checkBudget(page);
    expect(m.objects).toBe(baseline.objects); expect(m.textures).toBe(baseline.textures);
  }
  expect(calls).toHaveLength(4);
  expect(calls[1].observation.publicRecord).toEqual([{ wave: 1, rule: 'sun', correct: 6, mistakes: [] }]);
  await expect(page.locator('[data-rule]')).toHaveText('金印分拣员');
  await expect(page.locator('[data-combo]')).toHaveText('连签 24');
  await expect(page.locator('[data-lives]')).toHaveAttribute('aria-label', '剩余 3 次机会');
  await page.locator('[data-save]').click();
  const downloading = page.waitForEvent('download');
  await page.locator('[data-game-export]').click();
  const encoded = await receipt(await downloading);
  const restored = new GameSession(definition);
  restored.restore(encoded);
  expect(restored.state.phase).toBe('won');
  expect(restored.state.score).toBe(Number((await page.locator('[data-score]').innerText()).replace(' 分', '')));
  const malformed = JSON.parse(encoded); malformed.commands.at(-1).score = 9999;
  await page.locator('[data-game-import]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
  await expect(page.locator('[data-game-save-status]')).toContainText('回放被拒绝');
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'won');
  await page.getByRole('button', { name: '关闭 游戏手记', exact: true }).click();
  await page.locator('[data-reset]').click();
  await page.locator('[data-save]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'dreams.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'won');
  expect(calls).toHaveLength(4);
  await page.getByRole('button', { name: '关闭 游戏手记', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-reset]').click();
    expect(await checkBudget(page)).toMatchObject({ objects: baseline.objects, textures: baseline.textures });
  }
  expect(errors).toEqual([]);
});

for (const result of ['correct', 'wrong', 'timeout'] as const) {
  test(`the last parcel keeps its ${result} feedback after the completed wave is saved`, async ({ page }) => {
    await installAgentFixture(page, fixture);
    await open(page);
    await beginWave(page);
    for (let parcel = 0; parcel < 5; parcel++) await sort(page);
    await waitParcel(page);
    const expected = await readDirection(page);
    if (result === 'timeout') await page.clock.runFor(4000);
    else await sort(page, result === 'correct', 'button');
    await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'between');
    const status = page.locator('[data-status]');
    if (result === 'correct') await expect(status).toContainText('签收成功');
    else {
      await expect(status).toContainText(result === 'wrong' ? '误分' : '超时');
      await expect(status).toContainText(`应送${expected === 'day' ? '白昼' : '黑夜'}`);
    }
    await expect(status).toContainText('本班已完成');
    await expect(page.locator('[data-scene] canvas')).toHaveAttribute('aria-description',
      result === 'correct' ? /最后一件签收成功/ : result === 'wrong' ? /误分退件/ : /超时退件/);
  });
}

test('a third strike retains its last parcel correction instead of suggesting another parcel', async ({ page }) => {
  await installAgentFixture(page, fixture);
  await open(page);
  await beginWave(page);
  await sort(page, false);
  await sort(page, false);
  await waitParcel(page);
  const expected = await readDirection(page);
  await sort(page, false);
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-status]')).toContainText('误分');
  await expect(page.locator('[data-status]')).toContainText(`应送${expected === 'day' ? '白昼' : '黑夜'}`);
  await expect(page.locator('[data-status]')).toContainText('本次夜班结束');
  await expect(page.locator('[data-status]')).not.toContainText('下一件稳住');
  await expect(page.locator('[data-scene] canvas')).toHaveAttribute('aria-description', /误分退件/);
});

test('three strike loss, finite emergency hold and retry use real response windows', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => ({ ...fixture(turn), rule: 'orange' }));
  await open(page);
  await beginWave(page);
  await waitParcel(page);
  const before = Number(await page.locator(ROOT).getAttribute('data-tick'));
  await page.locator('[data-hold]').click();
  await page.clock.runFor(100);
  await expect(page.locator('[data-hold]')).toContainText('剩余 1 次');
  await expect(page.locator('[data-hold]')).toBeDisabled();
  expect(Number(await page.locator(ROOT).getAttribute('data-tick'))).toBeGreaterThan(before);
  await sort(page, false, 'button');
  await expect(page.locator('[data-lives]')).toHaveAttribute('aria-label', '剩余 2 次机会');
  await waitParcel(page);
  await page.locator('[data-hold]').click();
  await page.clock.runFor(100);
  await expect(page.locator('[data-hold]')).toContainText('剩余 0 次');
  await sort(page, false, 'key');
  await waitParcel(page);
  await expect(page.locator('[data-hold]')).toBeDisabled();
  await page.clock.runFor(4200);
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-rule]')).toHaveText('三次退件，先歇一歇');
  await expect(page.locator('[data-day]')).toBeDisabled();
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'briefing');
  expect(calls).toHaveLength(1);
  await beginWave(page);
  await sort(page, true);
  await expect(page.locator('[data-combo]')).toHaveText('连签 1');
  expect(calls).toHaveLength(2);
});

test('manual, modal and visibility pauses clear input debt; active reload returns to saved wave preview', async ({ page }) => {
  test.setTimeout(90_000);
  const calls = await installAgentFixture(page, fixture);
  await open(page);
  await beginWave(page);
  await waitParcel(page);
  await page.clock.runFor(350);
  const heldKey = await readDirection(page) === 'day' ? 'a' : 'ArrowRight';
  await page.keyboard.down(heldKey);
  await page.locator('[data-pause]').click();
  const stopped = await page.locator(ROOT).getAttribute('data-tick');
  await page.keyboard.press('ArrowLeft');
  await page.clock.runFor(9000);
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', stopped!);
  await expect(page.locator('.ds-paused')).toBeVisible();
  await page.getByRole('button', { name: '继续分拣', exact: true }).click();
  await page.clock.runFor(100);
  await page.keyboard.up(heldKey);
  await expect(page.locator('[data-score]')).toHaveText('0 分');
  expect(Number(await page.locator(ROOT).getAttribute('data-tick')) - Number(stopped)).toBeLessThanOrEqual(2);
  for (const control of ['[data-help]', '[data-settings]', '[data-save]', '[data-agent-connect]', '[data-agent-log]']) {
    await page.locator(control).click();
    await expect(page.locator(ROOT)).toHaveAttribute('data-paused', 'true');
    const tick = await page.locator(ROOT).getAttribute('data-tick');
    await page.keyboard.press('d');
    await page.clock.runFor(3000);
    await expect(page.locator(ROOT)).toHaveAttribute('data-tick', tick!);
    await page.keyboard.press('Escape');
    await expect(page.locator(ROOT)).toHaveAttribute('data-paused', 'false');
  }
  const menu = page.getByRole('button', { name: '项目导航', exact: true });
  await menu.click();
  await page.keyboard.press('d');
  await page.clock.runFor(100);
  await expect(page.locator('[data-score]')).toHaveText('0 分');
  await menu.click();
  const tick = await page.locator(ROOT).getAttribute('data-tick');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator(ROOT)).toHaveAttribute('data-paused', 'true');
  await page.clock.runFor(5000);
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', tick!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(100);
  expect(Number(await page.locator(ROOT).getAttribute('data-tick')) - Number(tick)).toBeLessThanOrEqual(2);
  await sort(page, true);
  await expect(page.locator('[data-score]')).toHaveText('110 分');
  for (let index = 1; index < 6; index++) await sort(page, true);
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'between');
  const completedScore = await page.locator('[data-score]').innerText();
  await beginWave(page);
  await sort(page, true);
  const stored = await page.evaluate(key => localStorage.getItem(key), SAVE);
  const copy = new GameSession(definition);
  copy.restore(JSON.parse(stored!));
  expect(copy.state.phase).toBe('ready');
  expect(copy.state.score).toBe(810);
  expect(copy.state.history).toHaveLength(1);
  await page.reload();
  await page.clock.runFor(300);
  await expect(page.locator('[data-scene]')).toHaveAttribute('data-phaser-ready', 'true');
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('[data-score]')).toHaveText(completedScore);
  await expect(page.locator(ROOT)).toHaveAttribute('data-wave', '2');
  await expect(page.locator('[data-primary]')).toHaveText('准备好了，开带');
  expect(calls).toHaveLength(2);
});

test('invalid model, reset cancellation and stale response never produce a playable fallback', async ({ page }) => {
  await configureFixtureConnection(page);
  let mode: 'invalid' | 'waiting' | 'valid' = 'invalid';
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/openai/v1/chat/completions', async route => {
    requests++;
    const body = route.request().postDataJSON();
    const tool = body.tools[0].function.name;
    if (mode === 'waiting') await new Promise<void>(resolve => { release = resolve; });
    const plan = mode === 'invalid' ? { ...plans[0], score: 9000 } : plans[0];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nativeToolResponse(tool, plan)) }).catch(() => {});
  });
  await open(page);
  expect(requests).toBe(0);
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'false');
  expect(requests).toBe(2);
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'briefing');
  await expect(page.locator('[data-agent-host]')).toHaveAttribute('data-agent-error', 'true');
  mode = 'waiting';
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'true');
  await expect.poll(() => requests).toBe(3);
  await page.clock.runFor(12000);
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await page.locator('[data-reset]').click();
  mode = 'valid'; release?.();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'briefing');
  await beginWave(page);
  expect(requests).toBe(4);
});

test('desktop canvases and primary controls fit the requested sizes without new resources', async ({ page }, testInfo) => {
  await installAgentFixture(page, fixture);
  await open(page);
  await page.locator('[data-primary]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'ready');
  const initial = await checkBudget(page);
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(150);
    for (const selector of ['h1', '[data-primary]', '[data-day]', '[data-night]', '[data-hold]', '[data-pause]', '[data-scene] canvas']) {
      const box = await page.locator(`${ROOT} ${selector}`).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.y, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height, selector).toBeLessThanOrEqual(height + 1);
    }
    expect(await page.locator(ROOT).evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await checkBudget(page)).toMatchObject({ objects: initial.objects, textures: initial.textures });
  }
  const image = testInfo.outputPath('dream-sorter-desktop.png');
  await page.screenshot({ path: image });
  await testInfo.attach('梦邮大厅-桌面', { path: image, contentType: 'image/png' });
  console.info(`梦境分拣局资源：${JSON.stringify(initial)}`);
});
