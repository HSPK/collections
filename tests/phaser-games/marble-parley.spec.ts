import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GameSession, MAX_GAME_COMMANDS } from '../../src/core/games/session';
import { installAgentFixture } from '../helpers/agent-fixtures';
import { boardTool, smokeCase } from '../../src/projects/marble-parley/agent';
import { FORMATIONS, LAUNCH, makeBoard, PACTS } from '../../src/projects/marble-parley/data';
import type { Board, Plan, Shot } from '../../src/projects/marble-parley/data';
import { create, definition, parseCommand, parsePlan, reduce } from '../../src/projects/marble-parley/engine';
import { BALL_RADIUS, MAX_SPEED, MAX_STEPS, nearest, simulate, solve, startFlight, stepFlight } from '../../src/projects/marble-parley/physics';

const PLAN: Plan = { formation: 'fan', defend: 'night', intent: '守住夜空，让直线来客学会绕行。' };
const root = (page: Page) => page.locator('.project-marble-parley');
const canvas = (page: Page) => root(page).locator('canvas');
const primary = (page: Page) => root(page).locator('[data-primary]');
const nativeAgentFixture = installAgentFixture;

test('finite catalog: all 135 legal geometry combinations have an ordinary-shot solution', () => {
  test.setTimeout(120_000);
  for (let round = 0; round < 5; round++) for (let seed = 0; seed < 3; seed++) {
    for (const formation of FORMATIONS) for (const defend of PACTS) {
      const board = makeBoard(round, { formation, defend, intent: '守护契约' }, seed);
      const solution = solve(board);
      expect(solution, `${round}/${seed}/${formation}/${defend}`).not.toBeNull();
      expect(solution!.shots.length).toBeLessThanOrEqual(3);
      const hits = new Set(solution!.shots.flatMap(shot => simulate(board, shot).hits));
      expect(hits.size).toBeGreaterThanOrEqual(round === 4 ? 3 : 2);
      expect(solution!.shots.every(shot => !shot.special)).toBe(true);
    }
  }
});

test('fixed-step trajectory is authoritative, deterministic, bounded, pure and input-only in replay', () => {
  const state = reduce(create(1), { type: 'arrange', round: 0, plan: PLAN });
  const shot = solve(state.board!)!.shots[0], snapshot = JSON.stringify(state);
  const a = simulate(state.board!, shot), b = simulate(state.board!, shot);
  expect(a).toEqual(b); expect(a.frames.length).toBeLessThanOrEqual(MAX_STEPS + 1);
  expect(a.contacts.length).toBeLessThanOrEqual(96);
  expect(a.frames.every(frame => Math.hypot(frame.vx, frame.vy) <= MAX_SPEED + 0.00001)).toBe(true);
  const flight = startFlight(shot);
  for (const frame of a.frames.slice(1)) {
    stepFlight(flight, state.board!);
    expect([flight.x, flight.y, flight.vx, flight.vy, flight.score, flight.hits])
      .toEqual([frame.x, frame.y, frame.vx, frame.vy, frame.score, frame.hits]);
  }
  const next = reduce(state, { type: 'shot', shot });
  expect(next.last).toEqual(a); expect(JSON.stringify(state)).toBe(snapshot);
  expect(next.shots).toBe(2);
  const session = new GameSession(definition, 1);
  session.dispatch({ type: 'arrange', round: 0, plan: PLAN }); session.dispatch({ type: 'shot', shot });
  const encoded = session.serialize(), restored = new GameSession(definition, 99);
  restored.restore(encoded); expect(restored.state).toEqual(session.state);
  const commands = JSON.parse(encoded).commands;
  expect(commands[1]).toEqual({ type: 'shot', shot });
  expect(encoded).not.toContain('"score"'); expect(encoded).not.toContain('"frames"');
  expect(session.moveCount).toBeLessThan(MAX_GAME_COMMANDS);
});

test('corner and high-speed thin-segment collision cannot tunnel; targets count once and charge chains once', () => {
  const empty: Board = { round: 0, bumpers: [], targets: [],
    rails: [{ id: 'top', a: { x: 0, y: 100 }, b: { x: 500, y: 100 } },
      { id: 'side', a: { x: 100, y: 0 }, b: { x: 100, y: 500 } }],
    shield: { id: 'shield', a: { x: -100, y: -100 }, b: { x: -90, y: -100 } }, defend: 'night' };
  const ball = startFlight({ angle: 0, power: 100, special: false });
  Object.assign(ball, { x: 113, y: 113, vx: -660, vy: -660 });
  stepFlight(ball, empty);
  expect(ball.x).toBeGreaterThanOrEqual(100 + BALL_RADIUS); expect(ball.y).toBeGreaterThanOrEqual(100 + BALL_RADIUS);
  expect(ball.vx).toBeGreaterThan(0); expect(ball.vy).toBeGreaterThan(0);
  expect(ball.contacts.map(item => item.id)).toEqual(expect.arrayContaining(['top', 'side']));
  const tunnel = startFlight({ angle: 0, power: 100, special: false });
  Object.assign(tunnel, { x: 250, y: 114, vx: 0, vy: -MAX_SPEED });
  stepFlight(tunnel, empty); expect(tunnel.y).toBeGreaterThan(100); expect(tunnel.vy).toBeGreaterThan(0);
  expect(nearest({ x: 0, y: 0 }, { id: 'point', a: { x: 8, y: 9 }, b: { x: 8, y: 9 } })).toEqual({ x: 8, y: 9 });
  const goalBoard: Board = { ...empty, rails: [], targets: [
    { id: 'harbor', x: LAUNCH.x, y: LAUNCH.y, r: 100 },
    { id: 'garden', x: 900, y: 500, r: 20 }, { id: 'night', x: 400, y: 200, r: 20 },
  ] };
  const once = startFlight({ angle: 0, power: 60, special: true });
  once.banks = ['side'];
  for (let i = 0; i < 12; i++) stepFlight(once, goalBoard);
  expect(once.hits).toEqual(['harbor', 'garden']);
  expect(once.contacts.filter(item => item.kind === 'pact')).toHaveLength(1);
  expect(once.contacts.filter(item => item.kind === 'chain')).toHaveLength(1);
  expect(once.score).toBe(340);
});

test('strict plans, phase/revision legality, replay tampering, preview capacity and genuine model geometry', () => {
  for (const value of [{ ...PLAN, score: 9000 }, { ...PLAN, formation: 'custom' }, { ...PLAN, intent: 'x'.repeat(81) },
    { ...PLAN, defend: 'moon' }, { ...PLAN, intent: 'English only' }]) expect(() => parsePlan(value)).toThrow();
  expect(() => parseCommand({ type: 'shot', shot: { angle: 0, power: 85, special: false, score: 9000 } })).toThrow();
  expect(() => parseCommand({ type: 'shot', shot: { angle: 0.2, power: 85, special: false } })).toThrow();
  const session = new GameSession(definition, 1), original = session.serialize();
  expect(() => session.dispatch({ type: 'shot', shot: { angle: 0, power: 85, special: false } })).toThrow();
  expect(() => session.dispatch({ type: 'arrange', round: 1, plan: PLAN })).toThrow();
  expect(session.serialize()).toBe(original);
  session.dispatch({ type: 'arrange', round: 0, plan: PLAN });
  const before = session.serialize();
  expect(() => session.dispatch({ type: 'arrange', round: 0, plan: PLAN })).toThrow();
  const tampered = JSON.parse(before); tampered.commands.push({ type: 'shot', shot: { angle: 90, power: 85, special: false } });
  expect(() => session.restore(JSON.stringify(tampered))).toThrow(); expect(session.serialize()).toBe(before);
  expect(() => session.assertCanDispatch(512 * 1024)).toThrow();
  const revision = session.revision; session.reset(); expect(session.revision).toBeGreaterThan(revision);
  const left = makeBoard(0, PLAN, 1), right = makeBoard(0, { ...PLAN, formation: 'orbit', defend: 'harbor' }, 1);
  expect(left.bumpers).not.toEqual(right.bumpers); expect(left.shield).not.toEqual(right.shield);
  const shot = { angle: 0, power: 85, special: false };
  expect(simulate(left, shot).frames).not.toEqual(simulate(right, shot).frames);
  const smoke = smokeCase(); expect(smoke.request.tool).toBe(boardTool); smoke.verify(PLAN);
  for (const file of ['data', 'physics', 'engine', 'agent']) {
    const source = readFileSync(`src/projects/marble-parley/${file}.ts`, 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:phaser|\.css)['"]/);
    expect(source).not.toMatch(/\b(?:fetch|document|window|Math\.random)\b/);
  }
});

async function visit(page: Page) {
  await page.goto('./projects/marble-parley/');
  await expect(root(page).locator('[data-stage]')).toHaveAttribute('data-phaser-ready', 'true');
  await expect(root(page).getByRole('heading', { name: '弹珠外交', exact: true })).toBeVisible();
}
async function configureShot(page: Page, shot: Shot) {
  for (const [selector, desired, low, high] of [
    ['[data-angle-input]', shot.angle, -70, 70], ['[data-power-input]', shot.power, 60, 100],
  ] as const) {
    const input = root(page).locator(selector);
    const existing = Number(await input.inputValue());
    if (Math.abs(desired - existing) > Math.min(desired - low, high - desired)) {
      await input.press(desired - low < high - desired ? 'Home' : 'End');
    }
    const current = Number(await input.inputValue());
    for (let i = 0; i < Math.abs(desired - current); i++) await input.press(desired > current ? 'ArrowRight' : 'ArrowLeft');
    await expect(input).toHaveValue(String(desired));
  }
  const special = root(page).locator('[data-special]');
  if ((await special.getAttribute('aria-pressed') === 'true') !== shot.special) await special.click();
}
async function launch(page: Page, shot: Shot, keyboard = false) {
  await configureShot(page, shot);
  if (keyboard) { await canvas(page).focus(); await page.keyboard.press('Space'); }
  else await primary(page).click();
  await expect(root(page)).toHaveAttribute('data-animating', 'true');
  await expect(root(page)).toHaveAttribute('data-animating', 'false', { timeout: 15_000 });
}
async function measure(page: Page) {
  await root(page).getByRole('button', { name: '玩法 ?', exact: true }).click();
  await page.getByRole('button', { name: '测量画面资源', exact: true }).click();
  const metrics = JSON.parse((await root(page).getAttribute('data-metrics'))!);
  expect(metrics.objects).toBeLessThanOrEqual(200); expect(metrics.textures).toBeLessThanOrEqual(64); expect(metrics.tweens).toBeLessThanOrEqual(32);
  await page.keyboard.press('Escape');
  return metrics;
}
async function replay(page: Page) {
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('odd-index:game:marble-parley:v1')!)));
}

test('real Phaser UI completes five rounds legitimately, saves input replay and stays within budgets', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const calls = await nativeAgentFixture(page, turn => ({ ...PLAN, formation: FORMATIONS[Number(turn.observation.round) % 3] }));
  await page.setViewportSize({ width: 1440, height: 900 }); await visit(page);
  expect(calls).toHaveLength(0);
  const baseline = await measure(page);
  for (let round = 0; round < 5; round++) {
    await primary(page).click();
    await expect(root(page)).toHaveAttribute('data-phase', 'ready');
    if (round === 0) await test.info().attach('弹珠外交-公开板面', { body: await page.screenshot(), contentType: 'image/png' });
    const board = makeBoard(round, { ...PLAN, formation: FORMATIONS[round % 3] }, 1);
    const solution = solve(board)!;
    for (const shot of solution.shots) {
      if (await root(page).getAttribute('data-phase') !== 'ready') break;
      await launch(page, shot, round === 0);
    }
    await expect(root(page)).toHaveAttribute('data-phase', round === 4 ? 'victory' : 'round-win');
    if (round < 4) await primary(page).click();
  }
  expect(calls).toHaveLength(5);
  expect((calls[1].observation.publicShotStatistics as { shots: number }).shots).toBeGreaterThan(0);
  await expect(root(page).locator('[data-instruction]')).toContainText('五轮全部签署');
  const saved = await replay(page);
  expect(saved.commands.length).toBeLessThan(26);
  const checked = new GameSession(definition); checked.restore(JSON.stringify(saved));
  expect(checked.state.phase).toBe('victory');
  const measured = await measure(page);
  console.info(`marble-parley measured: ${measured.objects} objects, ${measured.textures} textures, ${measured.tweens} tweens; ${saved.commands.length} campaign commands`);
  expect(measured.objects).toBe(baseline.objects); expect(measured.textures).toBe(baseline.textures);
  await page.reload(); await expect(root(page)).toHaveAttribute('data-phase', 'victory'); expect(calls).toHaveLength(5);
  await root(page).getByRole('button', { name: '存档', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '游戏手记', exact: true })).toHaveCSS('background-color', 'rgb(16, 43, 58)');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出回放', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('marble-parley-replay.json');
  await page.keyboard.press('Escape');
  await root(page).getByRole('button', { name: '重开', exact: true }).click();
  await page.getByRole('button', { name: '新星图出发', exact: true }).click();
  await expect(root(page)).toHaveAttribute('data-phase', 'parley');
  await root(page).getByRole('button', { name: '存档', exact: true }).click();
  await root(page).locator('[data-game-import]').setInputFiles({
    name: 'earned-victory.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(root(page)).toHaveAttribute('data-phase', 'victory');
  expect(await replay(page)).toEqual(saved); expect(calls).toHaveLength(5);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('one charged shot chains real contacts; cancelled pulls and reduced motion cannot consume extra shots', async ({ page }) => {
  test.setTimeout(45_000);
  await nativeAgentFixture(page, () => PLAN); await visit(page);
  await primary(page).click(); await expect(root(page)).toHaveAttribute('data-phase', 'ready');
  const bounds = (await canvas(page).boundingBox())!;
  const x = bounds.x + LAUNCH.x / 1100 * bounds.width, y = bounds.y + LAUNCH.y / 680 * bounds.height;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 20, y + 15);
  await canvas(page).dispatchEvent('pointercancel'); await page.mouse.up();
  await expect(root(page)).toHaveAttribute('data-shots', '3');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const board = makeBoard(0, PLAN, 1);
  let charged: Shot | undefined;
  for (let angle = -68; angle <= 68 && !charged; angle += 2) {
    const shot = { angle, power: 85, special: true };
    if (simulate(board, shot).contacts.some(contact => contact.kind === 'chain')) charged = shot;
  }
  expect(charged).toBeDefined();
  await configureShot(page, charged!);
  await primary(page).click(); await expect(root(page)).toHaveAttribute('data-animating', 'true');
  await root(page).getByRole('button', { name: '暂停 P', exact: true }).click();
  await expect(root(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  const frozen = await canvas(page).screenshot();
  await expect.poll(async () => (await canvas(page).screenshot()).equals(frozen)).toBe(true);
  await root(page).getByRole('button', { name: '继续 P', exact: true }).click();
  await expect(root(page)).toHaveAttribute('data-animating', 'false', { timeout: 15_000 });
  const saved = await replay(page), session = new GameSession(definition);
  session.restore(JSON.stringify(saved));
  expect(session.state.last).toEqual(simulate(board, charged!));
  expect(session.state.specialUsed).toBe(true); expect(session.state.shots).toBe(2);
  await expect(root(page).locator('[data-special]')).toBeDisabled();
});

test('three actual misses lose; retry/new seed and repeated shots do not grow resources', async ({ page }) => {
  test.setTimeout(150_000);
  await nativeAgentFixture(page, () => PLAN); await visit(page);
  const baseline = await measure(page);
  const board = makeBoard(0, PLAN, 1);
  let miss: Shot | undefined;
  for (let angle = -70; angle <= 70 && !miss; angle += 2) {
    const shot = { angle, power: 60, special: false };
    if (simulate(board, shot).hits.length === 0) miss = shot;
  }
  expect(miss).toBeDefined();
  for (let run = 0; run < 3; run++) {
    await primary(page).click(); await expect(root(page)).toHaveAttribute('data-phase', 'ready');
    for (let count = 0; count < 3; count++) await launch(page, miss!);
    await expect(root(page)).toHaveAttribute('data-phase', 'lost');
    await expect(root(page)).toHaveAttribute('data-shots', '0');
    const metrics = await measure(page); expect(metrics.objects).toBe(baseline.objects); expect(metrics.textures).toBe(baseline.textures);
    await primary(page).click();
    await page.getByRole('button', { name: run === 2 ? '新星图出发' : '重试本星图', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-phase', 'parley'); await expect(root(page)).toHaveAttribute('data-shots', '3');
    expect((await replay(page)).seed).toBe(run === 2 ? 2 : 1);
  }
});

test('pointer pull, keyboard aim, pause/modal isolation and persisted aborted-flight charge', async ({ page }) => {
  await nativeAgentFixture(page, () => PLAN); await visit(page);
  await primary(page).click(); await expect(root(page)).toHaveAttribute('data-phase', 'ready');
  await canvas(page).focus(); await page.keyboard.press('ArrowRight');
  await expect(root(page).locator('[data-angle-input]')).toHaveValue('1');
  await page.keyboard.press('p'); await expect(root(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  await page.keyboard.press('Space'); await expect(root(page)).toHaveAttribute('data-shots', '3');
  await page.keyboard.press('p');
  const bounds = (await canvas(page).boundingBox())!;
  const x = bounds.x + LAUNCH.x / 1100 * bounds.width, y = bounds.y + LAUNCH.y / 680 * bounds.height;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - bounds.width * 0.024, y + bounds.height * 0.04, { steps: 5 }); await page.mouse.up();
  await expect(root(page)).toHaveAttribute('data-animating', 'true'); await expect(root(page)).toHaveAttribute('data-shots', '2');
  await root(page).getByRole('button', { name: '玩法 ?', exact: true }).click();
  await expect(root(page).locator('[data-stage]')).toHaveAttribute('data-phaser-paused', 'true');
  const saveBefore = await replay(page);
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('e');
  expect(await replay(page)).toEqual(saveBefore);
  await page.keyboard.press('Escape');
  await root(page).getByRole('button', { name: '存档', exact: true }).click();
  await root(page).locator('[data-game-import]').setInputFiles({
    name: 'invalid-flight.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saveBefore, commands: [{ type: 'advance' }] })),
  });
  await expect(root(page).locator('[data-game-save-status]')).toContainText('拒绝');
  await expect(root(page)).toHaveAttribute('data-animating', 'false');
  await expect(root(page)).toHaveAttribute('data-shots', '2');
  expect(await replay(page)).toEqual(saveBefore);
  await page.keyboard.press('Escape');
  await page.reload(); await expect(root(page).locator('[data-stage]')).toHaveAttribute('data-phaser-ready', 'true');
  await expect(root(page)).toHaveAttribute('data-animating', 'false');
  await expect(root(page)).toHaveAttribute('data-shots', '2'); expect(await replay(page)).toEqual(saveBefore);
});

test('invalid model correction/failure costs no shots; reset cancels stale model commitment', async ({ page }) => {
  const calls = await nativeAgentFixture(page, turn => turn.index < 2 ? { ...PLAN, formation: 'illegal' } : PLAN);
  await visit(page); await primary(page).click();
  await expect(primary(page)).toBeEnabled(); await expect(root(page)).toHaveAttribute('data-phase', 'parley');
  expect(calls).toHaveLength(2); await expect(root(page)).toHaveAttribute('data-shots', '3');
  await primary(page).click(); await expect(root(page)).toHaveAttribute('data-phase', 'ready');
  expect(calls).toHaveLength(3);
  await root(page).getByRole('button', { name: '重开', exact: true }).click();
  await page.getByRole('button', { name: '重试本星图', exact: true }).click();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.unroute('**/api/openai/v1/chat/completions');
  await nativeAgentFixture(page, async () => { await pending; return PLAN; });
  await primary(page).click(); await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
  await root(page).getByRole('button', { name: '重开', exact: true }).click();
  await page.getByRole('button', { name: '新星图出发', exact: true }).click(); release();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(root(page)).toHaveAttribute('data-phase', 'parley');
  await expect(root(page)).toHaveAttribute('data-shots', '3'); expect((await replay(page)).commands).toHaveLength(0);
});

test('transport failure, invalid replay import, form shortcuts, and desktop sizes remain safe', async ({ page }) => {
  await nativeAgentFixture(page, () => PLAN);
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试连接失败' } }),
  }));
  await visit(page); await primary(page).click();
  await expect(primary(page)).toBeEnabled(); await expect(root(page)).toHaveAttribute('data-shots', '3');
  await expect(root(page)).toHaveAttribute('data-phase', 'parley');
  await root(page).locator('[data-agent-connect]').click();
  const modelInput = root(page).locator('[data-agent-model]');
  await modelInput.fill('模型 test'); await modelInput.press('Space'); await modelInput.press('p');
  await expect(root(page)).toHaveAttribute('data-shots', '3');
  await page.keyboard.press('Escape');
  await root(page).getByRole('button', { name: '存档', exact: true }).click();
  await root(page).locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'odd-index-game', version: 1, game: 'marble-parley', seed: 1,
      commands: [{ type: 'shot', shot: { angle: 0, power: 85, special: false } }] })) });
  await expect(root(page).locator('[data-game-save-status]')).toContainText('拒绝');
  await expect(root(page)).toHaveAttribute('data-phase', 'parley'); await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({
      wide: document.documentElement.scrollWidth <= innerWidth, tall: document.documentElement.scrollHeight <= innerHeight,
    }))).toEqual({ wide: true, tall: true });
    await expect.poll(async () => {
      const box = (await canvas(page).boundingBox())!;
      return box.width * box.height / (size.width * size.height);
    }).toBeGreaterThan(0.5);
    const box = (await canvas(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    await expect(root(page).getByRole('button', { name: '暂停 P', exact: true })).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath('desktop-cabinet.png') });
});
