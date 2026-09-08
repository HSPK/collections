import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { inventorySize } from '../../src/core/rpg/inventory';
import { agendaTool, smokeCase } from '../../src/projects/tidebound-house/agent';
import { definition, effectiveSkill, guestCost, powers, tide } from '../../src/projects/tidebound-house/engine';
import type { Command, Plan } from '../../src/projects/tidebound-house/engine';
import { GUEST_IDS, QUEST_IDS } from '../../src/projects/tidebound-house/data';
import type { EndingId, GuestId } from '../../src/projects/tidebound-house/data';
import { installAgentFixture } from '../helpers/agent-fixtures';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';

const ROOT = '.project-tidebound-house';
const URL = './projects/tidebound-house/';
const SAVE = 'odd-index:game:tidebound-house:v1';
function tablePlan(slot: number): Plan {
  return {
    slot, choices: GUEST_IDS.map(guest => ({ guest, task: 'table', intention: '到长桌与同伴亲自交谈，听完对方的那句话。' })),
    intention: '五位旅客在长桌相遇，让旧信与灯塔的两端真正互通。',
  };
}

function campaign(ending: EndingId = 'bridge') {
  const session = new GameSession(definition, 86), commands: Command[] = [];
  function raw(command: Command) { session.dispatch(command); commands.push(command); }
  function plan() {
    if (session.state.quests.includes('hearth') && session.state.plannedSlots.length < 3 && !session.state.plannedSlots.includes(session.state.slot)) {
      raw({ type: 'plan', plan: tablePlan(session.state.slot) });
    }
  }
  function advance() { raw({ type: 'advance' }); plan(); }
  function doIt(command: Command) {
    let cost = 1;
    if (command.type === 'start' || command.type === 'train') cost = 0;
    if (command.type === 'guest') cost = guestCost(session.state, command.guest, command.action);
    if (command.type === 'explore') cost = effectiveSkill(session.state, 'lore') >= 2 ? 1 : 2;
    if (command.type === 'craft') cost = effectiveSkill(session.state, 'craft') >= 2 ? 1 : 2;
    if (session.state.ap < cost) advance();
    raw(command);
  }
  const travel = (scene: Extract<Command, { type: 'travel' }>['scene']) => doIt({ type: 'travel', scene });
  const quest = (quest: Extract<Command, { type: 'quest' }>['quest']) => doIt({ type: 'quest', quest });
  doIt({ type: 'start', build: 'maker' }); quest('hearth'); plan();
  for (const guest of GUEST_IDS) {
    doIt({ type: 'guest', guest, action: 'listen' });
    if (session.state.points > 0 && session.state.skills.empathy === 1) doIt({ type: 'train', skill: 'empathy' });
  }
  quest('letters');
  travel('shore'); doIt({ type: 'explore' }); doIt({ type: 'gather' }); doIt({ type: 'gather' });
  travel('archive'); doIt({ type: 'explore' });
  doIt({ type: 'train', skill: 'lore' }); quest('chart');
  travel('workshop');
  for (const recipe of ['lens', 'brace', 'knot', 'knot', 'tea', 'lens'] as const) doIt({ type: 'craft', recipe });
  travel('harbor'); doIt({ type: 'gather' }); doIt({ type: 'trade', item: 'salt' });
  travel('lighthouse'); quest('beacon');
  travel('cliff'); doIt({ type: 'explore' }); quest('marks'); doIt({ type: 'gather' });
  travel('ruins'); doIt({ type: 'explore' });
  travel('loft'); quest('heart'); travel('hall');
  doIt({ type: 'guest', guest: 'shen', action: 'gift' });
  const carries: GuestId[] = ending === 'shore' ? [] : ending === 'voyage' ? ['shen', 'lin', 'he', 'yu', 'tang'] : ['lin', 'yu'];
  for (const guest of GUEST_IDS) {
    doIt({ type: 'guest', guest, action: carries.includes(guest) ? 'carry' : 'release' });
    doIt({ type: 'guest', guest, action: 'fulfill' });
  }
  doIt({ type: 'equip', item: 'bell' });
  if (session.state.points > 0) doIt({ type: 'train', skill: 'empathy' });
  while (tide(session.state) < 5) advance();
  quest('council');
  while (tide(session.state) < 7) advance();
  travel('loft');
  doIt({ type: 'ritual', ending });
  return { session, commands };
}

function commandSelector(command: Command) {
  return `[data-command="${JSON.stringify(command).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}
async function closeDialogs(page: Page) {
  while (await page.locator(`${ROOT} dialog:modal`).count()) await page.keyboard.press('Escape');
}
async function uiCommand(page: Page, command: Command) {
  await closeDialogs(page);
  const root = page.locator(ROOT);
  if (command.type === 'start') {
    await root.locator('[data-start]').click();
    await root.locator(`[data-build="${command.build}"]`).click();
  } else if (command.type === 'plan') {
    const moves = Number(await root.getAttribute('data-moves'));
    await root.locator('[data-plan]').click();
    await expect(root).toHaveAttribute('data-moves', String(moves + 1));
    await expect(root.locator('[data-agent-cancel]')).toBeHidden();
  } else if (command.type === 'travel') {
    await root.locator('[data-location]').selectOption(command.scene);
    await root.locator('[data-travel]').click();
  } else {
    if (command.type === 'guest') {
      await root.locator('[data-guests]').click();
      await root.locator(`#tidebound-guests [data-person="${command.guest}"]`).click();
    } else if (command.type === 'equip' || command.type === 'train') await root.locator('[data-bag]').click();
    else if (command.type === 'advance') await root.locator('[data-next]').click();
    else await root.locator('[data-inspect]').click();
    const control = root.locator(commandSelector(command));
    await expect(control).toBeEnabled();
    await control.click();
  }
}
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.locator(ROOT)).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
}
async function opening(page: Page) {
  await open(page);
  await uiCommand(page, { type: 'start', build: 'maker' });
  await uiCommand(page, { type: 'quest', quest: 'hearth' });
  await closeDialogs(page);
}

test('原创内容、三种真实构筑、三条可达结局和有限合法回放', () => {
  const story = readFileSync('src/projects/tidebound-house/story.ts', 'utf8');
  expect((story.match(/[\u3400-\u9fff]/gu) ?? []).length).toBeGreaterThanOrEqual(2500);
  for (const ending of ['shore', 'voyage', 'bridge'] as const) {
    const { session, commands } = campaign(ending);
    expect(session.state.phase).toBe('won');
    expect(session.state.ending).toBe(ending);
    expect(session.state.quests).toHaveLength(QUEST_IDS.length);
    expect(session.state.xp).toBeGreaterThanOrEqual(68);
    expect(session.state.guests.shen.gifted).toBe(true);
    expect(session.state.equipped).toBe('bell');
    expect(commands.length).toBeLessThan(300);
    expect(inventorySize(session.state.inventory)).toBeLessThanOrEqual(80);
    expect(powers(session.state).support).toBe(5);
    const restored = new GameSession(definition);
    restored.restore(session.serialize());
    expect(restored.state).toEqual(session.state);
    expect(() => restored.dispatch({ type: 'gather' })).toThrow(AgentValidationError);
  }
  for (const build of ['reader', 'maker', 'listener'] as const) {
    const session = new GameSession(definition);
    session.dispatch({ type: 'start', build });
    expect(effectiveSkill(session.state, build === 'reader' ? 'lore' : build === 'maker' ? 'craft' : 'empathy')).toBe(3);
    expect(() => session.dispatch({ type: 'start', build })).toThrow();
  }
});

test('真实开篇议程、局部知识、同桌连结、有限援助与日程上限', () => {
  const smoke = smokeCase();
  const plan = agendaTool.parse(tablePlan(0));
  smoke.request.validate(plan);
  smoke.verify(plan);
  const session = new GameSession(definition);
  session.dispatch({ type: 'start', build: 'reader' });
  session.dispatch({ type: 'quest', quest: 'hearth' });
  expect(session.state.guests.shen.knowledge).not.toContain('stone');
  session.preview({ type: 'plan', plan });
  expect(session.state.guests.shen.location).toBe('harbor');
  session.dispatch({ type: 'plan', plan });
  expect(session.state.guests.shen.location).toBe('hall');
  expect(session.state.guests.shen.knowledge).toContain('stone');
  expect(powers(session.state).links).toBe(3);
  expect(session.state.clues).toEqual([]);
  const before = session.serialize(), revision = session.revision;
  expect(() => session.dispatch({ type: 'plan', plan })).toThrow('每个时段');
  expect(session.serialize()).toBe(before); expect(session.revision).toBe(revision);
  session.dispatch({ type: 'advance' });
  const helping = (slot: number): Plan => ({ ...tablePlan(slot), choices: GUEST_IDS.map(guest => ({ guest, task: 'help', intention: '从自己的行李中拿出一份材料，交给补帆工房。' })) });
  const glass = session.state.inventory.glass;
  session.dispatch({ type: 'plan', plan: helping(1) });
  expect(session.state.inventory.glass).toBe(glass + 1);
  expect(session.state.guests.shen.supply).toBe(1);
  expect(session.state.guests.shen.location).toBe('workshop');
  session.dispatch({ type: 'advance' }); session.dispatch({ type: 'plan', plan: helping(2) });
  session.dispatch({ type: 'advance' });
  expect(() => session.dispatch({ type: 'plan', plan: helping(3) })).toThrow('目录之外');
  expect(() => session.dispatch({ type: 'plan', plan: tablePlan(2) })).toThrow('过去');
  expect(() => agendaTool.parse({ ...tablePlan(3), score: 100 })).toThrow();
  expect(() => agendaTool.parse({ ...tablePlan(3), intention: 'https://untrusted.example' })).toThrow();
  expect(() => session.preview({ type: 'plan', plan: { ...tablePlan(3), choices: Array.from({ length: 5 }, () => tablePlan(3).choices[0]) } })).toThrow('各有且只有');
});

test('单人长桌不是实际会面，不扣行动也不累积议约进度', () => {
  const session = new GameSession(definition);
  session.dispatch({ type: 'start', build: 'reader' });
  session.dispatch({ type: 'quest', quest: 'hearth' });
  const emptyMeeting: Plan = {
    ...tablePlan(session.state.slot),
    choices: GUEST_IDS.map(guest => ({
      guest, task: guest === 'he' ? 'table' : 'rest', intention: '在原地等待，没有其他旅客到来。',
    })),
  };
  const before = session.serialize(), state = structuredClone(session.state);
  expect(() => session.preview({ type: 'plan', plan: emptyMeeting })).toThrow('至少需要两位');
  expect(() => session.dispatch({ type: 'plan', plan: emptyMeeting })).toThrow('至少需要两位');
  expect(session.serialize()).toBe(before);
  expect(session.state).toEqual(state);
  expect(session.state.plannedSlots).toEqual([]);
  session.dispatch({ type: 'plan', plan: tablePlan(session.state.slot) });
  expect(session.state.plannedSlots).toHaveLength(1);
  expect(powers(session.state).links).toBeGreaterThan(0);
});

test('承诺门槛、失约损失、昂贵但有限的补信以及人心失败', () => {
  const session = new GameSession(definition);
  session.dispatch({ type: 'start', build: 'listener' }); session.dispatch({ type: 'quest', quest: 'hearth' });
  expect(() => session.dispatch({ type: 'quest', quest: 'council' })).toThrow();
  expect(() => session.dispatch({ type: 'guest', guest: 'shen', action: 'release' })).toThrow('羁绊');
  session.dispatch({ type: 'plan', plan: tablePlan(0) });
  session.dispatch({ type: 'guest', guest: 'shen', action: 'listen' });
  session.dispatch({ type: 'guest', guest: 'shen', action: 'release' });
  expect(() => session.dispatch({ type: 'guest', guest: 'shen', action: 'fulfill' })).toThrow('证据');
  expect(() => session.dispatch({ type: 'guest', guest: 'shen', action: 'carry' })).toThrow('不能来回');
  while (session.state.slot < 6) session.dispatch({ type: 'advance' });
  expect(session.state.guests.shen.promise).toBe('broken');
  expect(session.state.guests.shen.bond).toBe(1); expect(session.state.favor).toBe(5);
  const ap = session.state.ap, shell = session.state.inventory.shell;
  session.dispatch({ type: 'guest', guest: 'shen', action: 'renew' });
  expect(session.state.ap).toBe(ap - 2); expect(session.state.inventory.shell).toBe(shell - 1);
  expect(session.state.guests.shen.due).toBe(7);
  expect(() => session.dispatch({ type: 'guest', guest: 'shen', action: 'renew' })).toThrow();

  const loss = new GameSession(definition);
  loss.dispatch({ type: 'start', build: 'listener' }); loss.dispatch({ type: 'quest', quest: 'hearth' });
  loss.dispatch({ type: 'plan', plan: tablePlan(0) });
  for (const id of GUEST_IDS) loss.dispatch({ type: 'guest', guest: id, action: 'listen' });
  loss.dispatch({ type: 'advance' });
  for (const id of GUEST_IDS) loss.dispatch({ type: 'guest', guest: id, action: 'release' });
  while (loss.state.phase === 'play') loss.dispatch({ type: 'advance' });
  expect(loss.state.slot).toBe(5); expect(loss.state.favor).toBe(1); expect(loss.state.phase).toBe('lost');
});

test('经济无刷取、一次奖励、装备无叠加、回放原子拒绝和重置修订', () => {
  const { commands } = campaign('bridge');
  const session = new GameSession(definition, 86);
  for (const command of commands) {
    if (command.type === 'ritual') break;
    session.dispatch(command);
  }
  const snapshot = session.serialize(), revision = session.revision;
  for (const command of [
    { type: 'guest', guest: 'shen', action: 'fulfill' },
    { type: 'guest', guest: 'shen', action: 'gift' },
    { type: 'quest', quest: 'heart' },
    { type: 'equip', item: 'bell' },
  ] as const) expect(() => session.dispatch(command)).toThrow(AgentValidationError);
  expect(session.serialize()).toBe(snapshot);
  expect(session.revision).toBe(revision);
  const replay: { commands: Command[] } = JSON.parse(snapshot);
  replay.commands.push({ type: 'ritual', ending: 'voyage' });
  expect(() => session.restore(JSON.stringify(replay))).toThrow('远航力量');
  expect(session.serialize()).toBe(snapshot);
  session.reset(86);
  expect(session.state.phase).toBe('setup'); expect(session.moveCount).toBe(0); expect(session.revision).toBeGreaterThan(revision);

  const economy = new GameSession(definition);
  economy.dispatch({ type: 'start', build: 'maker' }); economy.dispatch({ type: 'quest', quest: 'hearth' });
  economy.dispatch({ type: 'travel', scene: 'workshop' });
  economy.dispatch({ type: 'craft', recipe: 'brace' });
  expect(economy.state.inventory.wood).toBe(2);
  expect(() => economy.dispatch({ type: 'craft', recipe: 'brace' })).toThrow('最多');
  economy.dispatch({ type: 'travel', scene: 'shore' });
  while (economy.state.stock.shore > 0) {
    if (economy.state.ap === 0) economy.dispatch({ type: 'advance' });
    economy.dispatch({ type: 'gather' });
  }
  const xp = economy.state.xp;
  expect(() => economy.dispatch({ type: 'gather' })).toThrow('存量');
  economy.dispatch({ type: 'advance' });
  expect(economy.state.stock.shore).toBe(0); expect(economy.state.xp).toBe(xp);
});

for (const ending of ['bridge', 'shore'] as const) {
  test(`全程合法中文界面完成${ending === 'bridge' ? '双岸' : '留岸'}结局：成长、制作、交易、人物弧与真实议程`, async ({ page }) => {
    test.setTimeout(180_000);
    const calls = await installAgentFixture(page, turn => tablePlan(Number(turn.observation.slot)));
    const { commands, session } = campaign(ending);
    await open(page);
    expect(calls).toHaveLength(0);
    for (const command of commands) await uiCommand(page, command);
    await expect(page.locator(ROOT)).toHaveAttribute('data-phase', 'won');
    await expect(page.locator(ROOT)).toHaveAttribute('data-ending', ending);
    await expect(page.locator(ROOT)).toHaveAttribute('data-moves', String(commands.length));
    await expect(page.locator('#tidebound-ending')).toContainText(session.state.outcome);
    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.tool === 'tidebound_guest_agendas')).toBe(true);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as string, SAVE);
    const restored = new GameSession(definition);
    restored.restore(saved);
    expect(restored.state).toEqual(session.state);
    expect(restored.state.quests).toHaveLength(12);
    await page.reload();
    await expect(page.locator(ROOT)).toHaveAttribute('data-ending', ending);
    expect(calls).toHaveLength(3);
  });
}

test('模型纠错不预支行动，失败、取消和重来不执行迟到议程', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => turn.index === 0 ?
    { ...tablePlan(Number(turn.observation.slot)), choices: [] } : tablePlan(Number(turn.observation.slot)));
  await opening(page);
  const root = page.locator(ROOT);
  await uiCommand(page, { type: 'plan', plan: tablePlan(0) });
  expect(calls).toHaveLength(2);
  await expect(root).toHaveAttribute('data-ap', '5');
  await expect(root).toHaveAttribute('data-moves', '3');
  await uiCommand(page, { type: 'advance' });
  await page.route('**/api/openai/v1/chat/completions', route => route.abort('failed'));
  await root.locator('[data-plan]').click();
  await expect(root.locator('[data-agent-host]')).toHaveAttribute('data-agent-error', 'true');
  await expect(root).toHaveAttribute('data-ap', '7');
  await expect(root).toHaveAttribute('data-moves', '4');
  await page.unroute('**/api/openai/v1/chat/completions');
  let release: () => void = () => { throw new Error('The delayed request has not started.'); };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const late = await installAgentFixture(page, async turn => { await gate; return tablePlan(Number(turn.observation.slot)); });
  await root.locator('[data-plan]').click();
  await expect.poll(() => late.length).toBe(1);
  await expect(root.locator('[data-agent-cancel]')).toBeVisible();
  await root.locator('[data-camera]').click();
  await root.locator('[data-agent-cancel]').click();
  await expect(root).toHaveAttribute('data-ap', '7');
  await root.locator('[data-restart]').click();
  await root.locator('#tidebound-restart [data-fresh]').click();
  release();
  await expect(root).toHaveAttribute('data-phase', 'setup');
  await expect(root).toHaveAttribute('data-moves', '0');
  await expect(root.locator('[data-agent-cancel]')).toBeHidden();
});

test('界面失约、人心失败、期限失败与原生回放拒绝', async ({ page }) => {
  test.setTimeout(90_000);
  await installAgentFixture(page, turn => tablePlan(Number(turn.observation.slot)));
  await open(page);
  await uiCommand(page, { type: 'start', build: 'listener' });
  await uiCommand(page, { type: 'quest', quest: 'hearth' });
  await uiCommand(page, { type: 'plan', plan: tablePlan(0) });
  for (const guest of GUEST_IDS) await uiCommand(page, { type: 'guest', guest, action: 'listen' });
  await uiCommand(page, { type: 'advance' });
  for (const guest of GUEST_IDS) await uiCommand(page, { type: 'guest', guest, action: 'release' });
  for (let i = 0; i < 5; i++) await uiCommand(page, { type: 'advance' });
  const root = page.locator(ROOT);
  await expect(root).toHaveAttribute('data-phase', 'lost');
  await expect(root.locator('[data-favor]')).toHaveText('人心 1');
  await root.locator('[data-ending]').click();
  await expect(root.locator('#tidebound-ending')).toContainText('人心散去');
  await closeDialogs(page);
  await root.locator('[data-notebook]').click();
  const invalid = JSON.stringify({ format: 'odd-index-game', version: 1, game: 'tidebound-house', seed: 86, commands: [{ type: 'start', build: 'reader' }, { type: 'ritual', ending: 'bridge' }] });
  await root.locator('[data-game-import]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(invalid) });
  await expect(root.locator('[data-game-save-status]')).toContainText('拒绝');
  await expect(root).toHaveAttribute('data-phase', 'lost');
  await closeDialogs(page);
  await root.locator('[data-restart]').click(); await root.locator('#tidebound-restart [data-fresh]').click();
  await uiCommand(page, { type: 'start', build: 'reader' });
  for (let i = 0; i < 14; i++) await uiCommand(page, { type: 'advance' });
  await expect(root).toHaveAttribute('data-phase', 'lost');
  await expect(root.locator('[data-objective]')).toContainText('第七潮已过');
});

test('原生导入取消旧议程，镜头与阅读保持免费，新请求独立提交', async ({ page }) => {
  let release: () => void = () => { throw new Error('Request gate not initialized.'); };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async turn => {
    if (turn.index === 0) await gate;
    return tablePlan(Number(turn.observation.slot));
  });
  await opening(page);
  const root = page.locator(ROOT);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as string, SAVE);
  await root.locator('[data-plan]').click();
  await expect.poll(() => calls.length).toBe(1);
  await root.locator('[data-camera]').click();
  await root.locator('[data-location]').selectOption('shore');
  await expect(root.locator('[data-agent-cancel]')).toBeVisible();
  await expect(root).toHaveAttribute('data-moves', '2');
  await root.locator('[data-notebook]').click();
  await root.locator('[data-game-import]').setInputFiles({ name: 'my-opening.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(root.locator('[data-game-save-status]')).toContainText('导入');
  await expect(root.locator('[data-agent-cancel]')).toBeHidden();
  release();
  await closeDialogs(page);
  await expect(root).toHaveAttribute('data-ap', '6');
  await expect(root).toHaveAttribute('data-moves', '2');
  await uiCommand(page, { type: 'plan', plan: tablePlan(0) });
  await expect(root).toHaveAttribute('data-moves', '3');
  await expect(root).toHaveAttribute('data-ap', '5');
  expect(calls).toHaveLength(2);
});

test('中文、五种视口、触控替代、键盘模态隔离与模型文本转义', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /<path>|<svg>|<linearGradient>/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await installAgentFixture(page, turn => ({
    ...tablePlan(Number(turn.observation.slot)),
    choices: GUEST_IDS.map(guest => ({ guest, task: 'table', intention: '<img src=x onerror="alert(1)">只是中文公开文本。' })),
  }));
  await opening(page);
  const root = page.locator(ROOT);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(root.locator('h1')).toHaveText('潮汐归客');
  await expect(root).toHaveAttribute('data-workspace', 'true');
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 }]) {
    await page.setViewportSize(size);
    await root.locator('[data-location]').selectOption('hall');
    await expectWorkspaceViewport(page, size.width, size.height);
    expect(await visibleControlProblems(root)).toEqual([]);
    const scene = await root.locator('[data-project-preview]').boundingBox();
    expect(scene!.height).toBeGreaterThan(160);
    await expect(root.locator('[data-plan]')).toBeInViewport();
    await expect(root.locator('[data-agent-connect]')).toBeInViewport();
    await expect(root.locator('[data-agent-status]')).toBeVisible();
    if (size.width === 1440 || size.width === 320) {
      const path = test.info().outputPath(`tidebound-${size.width}.png`);
      await page.screenshot({ path });
      await test.info().attach(`海屋-${size.width}`, { path, contentType: 'image/png' });
    }
    await root.locator('[data-location]').selectOption('shore');
    await root.locator('[data-inspect]').click();
    await expect(root.locator('#tidebound-scene')).toContainText('拾光滩');
    const before = await root.getAttribute('data-moves');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await expect(root).toHaveAttribute('data-moves', before!);
    await page.keyboard.press('Escape');
    await root.locator('[data-help]').click();
    await expect(root.locator('#tidebound-help')).toContainText('每次退潮与灯时各有七行动');
    await page.keyboard.press('Escape');
  }
  expect(calls).toHaveLength(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  const before = await root.getAttribute('data-moves');
  await root.locator('[data-scene="archive"]').focus();
  await page.keyboard.press('Enter');
  await expect(root.locator('[data-location]')).toHaveValue('archive');
  await expect(root).toHaveAttribute('data-moves', before!);
  await root.locator('[data-plan]').click();
  await expect(root.locator('[data-agent-cancel]')).toBeHidden();
  await expect.poll(() => calls.length).toBe(1);
  await root.locator('[data-guests]').click();
  await root.locator('#tidebound-guests [data-person="shen"]').click();
  await expect(root.locator('.tb-public-intention')).toContainText('<img src=x');
  expect(await root.locator('.tb-public-intention img').count()).toBe(0);
  await closeDialogs(page);
  await root.locator('[data-agent-connect]').click();
  await expect(root.locator('dialog:modal')).toContainText('模型');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
