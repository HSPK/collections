import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { array, choice, integer, isRecord, object } from '../../src/core/agents/schema';
import { createInventory, exchangeInventory } from '../../src/core/rpg/inventory';
import { ACTORS, ACTIONS, TARGETS, definition, level, maxHp } from '../../src/projects/emberwake/engine';
import type { Plan, State } from '../../src/projects/emberwake/engine';
import { observation, planTool, smokeCase } from '../../src/projects/emberwake/agent';
import { PEOPLE, PLACE_NAMES, QUESTS, questById } from '../../src/projects/emberwake/data';
import type { QuestId } from '../../src/projects/emberwake/data';
import { CHARACTERS, PLACE_STORY, QUEST_STORY, ENDINGS, INTRO, ACTS } from '../../src/projects/emberwake/story';

type Mode = 'adventure' | 'loss';
function fixturePlan(obs: Record<string, unknown>, mode: Mode = 'adventure'): Plan {
  const roles = array(obs.roles, value => object(value, ['actor', 'side', 'knowledge', 'goal', 'catalog']), '角色', 0, 5);
  const battle = isRecord(obs.battle) ? obs.battle : null;
  const journey = object(obs.journey, ['completed', 'values', 'level', 'hp', 'maxHp', 'energy']);
  const hp = integer(journey.hp, '生命', 0, 200);
  return planTool.parse({
    kind: choice(obs.kind, ['parley', 'battle'] as const, '阶段'),
    speaker: choice(obs.speaker, PEOPLE, '角色'), stance: 'freedom',
    line: '路要有人接住，也要允许人离开。我会保留「<风>」的名字。',
    orders: roles.map(role => {
      const actor = choice(role.actor, ACTORS, '角色');
      const options = array(role.catalog, value => {
        const entry = object(value, ['action', 'lane', 'target']);
        return { action: choice(entry.action, ACTIONS, '动作'), lane: integer(entry.lane, '战线', 0, 2), target: choice(entry.target, TARGETS, '目标') };
      }, '可行战术', 1, 30);
      let selected;
      if (role.side === '敌方') {
        const aim = mode === 'loss' ? 1 : integer(battle!.heroLane, '公开站位', 0, 2);
        selected = options.find(o => o.action === (mode === 'loss' ? 'sweep' : 'strike') && o.lane === aim) ??
          options.find(o => o.action === 'strike' && o.lane === aim);
      } else if (mode === 'loss') selected = options.find(o => o.action === 'guard' && o.lane === 0) ?? options.find(o => o.action === 'guard');
      else {
        const enemies = array(battle!.enemies, value => {
          if (!isRecord(value)) throw new Error('缺少敌人。');
          return { id: value.id, lane: value.lane };
        }, '敌人', 1, 2);
        const target = enemies[0];
        selected = (hp < 35 ? options.find(o => o.action === 'mend') : undefined) ??
          options.find(o => o.action === 'burst' && o.target === target.id && o.lane === target.lane) ??
          options.find(o => o.action === 'strike' && o.target === target.id && o.lane === target.lane) ??
          options.find(o => o.action === 'strike' && o.target === target.id);
      }
      if (!selected) throw new Error('测试计划没有合法动作。');
      return { actor, ...selected, intention: role.side === '敌方' ? '封住目前的路口，下一步先让你看清。' : '守住同伴可以回来、也可以离开的路。' };
    }),
  });
}
function planFor(state: State, quest?: QuestId, mode: Mode = 'adventure') { return fixturePlan(observation(state, quest), mode); }
function pureBattle(session: GameSession<State, import('../../src/projects/emberwake/engine').Command>, mode: Mode = 'adventure') {
  for (let limit = 0; limit < 16 && session.state.phase === 'forecast'; limit++) {
    session.dispatch({ type: 'forecast', plan: planFor(session.state, undefined, mode) });
    const battle = session.state.battle!;
    session.dispatch({
      type: 'act', action: mode === 'loss' ? 'guard' : session.state.energy >= 2 ? 'flare' : 'strike',
      lane: mode === 'loss' ? 1 : battle.heroLane === 0 ? 1 : 0, target: battle.enemies.find(e => e.hp > 0)!.id,
    });
  }
  expect(['travel', 'finale', 'ended']).toContain(session.state.phase);
}
function pureQuest(session: GameSession<State, import('../../src/projects/emberwake/engine').Command>, id: QuestId, branch: 'a' | 'b', mode: Mode = 'adventure') {
  const quest = questById(id);
  if (session.state.location !== quest.location) session.dispatch({ type: 'travel', location: quest.location });
  session.dispatch({ type: 'parley', quest: id, plan: planFor(session.state, id) });
  session.dispatch({ type: 'choose', branch });
  if (session.state.phase === 'forecast') pureBattle(session, mode);
}
const route: [QuestId, 'a' | 'b'][] = [
  ['departure', 'b'], ['cable', 'b'], ['bells', 'a'], ['debts', 'b'], ['crossing', 'b'], ['mirror', 'b'],
  ['archive', 'a'], ['lanarc', 'a'], ['moarc', 'a'], ['qiaoarc', 'a'], ['council', 'a'],
];
async function travel(page: Page, id: QuestId) {
  const place = questById(id).location;
  if (await page.locator('[data-place]').innerText() === PLACE_NAMES[place]) return;
  await page.locator('.ew-toolbar [data-open="map"]').click();
  await page.locator(`[data-travel="${place}"]`).click();
}
async function prepare(page: Page) {
  const camp = page.locator('[data-camp]');
  if (await camp.count() && await camp.isEnabled()) await camp.click();
  await page.locator('.ew-toolbar [data-open="bag"]').click();
  for (const path of ['fire', 'shelter']) {
    const button = page.locator(`[data-build="${path}"]`);
    while (await button.isEnabled()) await button.click();
  }
  const lens = page.locator('[data-equip="lens"]');
  if (await lens.isEnabled()) await lens.click();
  await page.locator('#emberwake-bag .workspace-dialog-heading button').click();
}
async function uiBattle(page: Page, mode: Mode = 'adventure') {
  for (let limit = 0; limit < 16; limit++) {
    const forecast = page.locator('[data-forecast]');
    if (!await forecast.count()) return;
    await forecast.click();
    await expect(page.locator('[data-act-command="strike"]')).toBeVisible();
    if (mode === 'loss') {
      await page.locator('[data-lane]').selectOption('1');
      await page.locator('[data-act-command="guard"]').click();
    } else {
      const options = await page.locator('[data-lane] option').evaluateAll(nodes =>
        nodes.map(node => ({ value: (node as HTMLOptionElement).value, disabled: (node as HTMLOptionElement).disabled })));
      // Enemy fixtures aim only at the previously public hero lane. The player responds after disclosure.
      const caption = await page.locator('.ew-intents li').last().innerText();
      const aim = caption.includes('左舷') ? '0' : caption.includes('中桥') ? '1' : '2';
      const next = options.find(o => !o.disabled && o.value !== aim)!;
      await page.locator('[data-lane]').selectOption(next.value);
      const flare = page.locator('[data-act-command="flare"]');
      await (await flare.isEnabled() ? flare : page.locator('[data-act-command="strike"]')).click();
    }
  }
  throw new Error('战斗没有在限定轮数内结束。');
}
async function uiQuest(page: Page, id: QuestId, branch: 'a' | 'b', mode: Mode = 'adventure') {
  await travel(page, id);
  await prepare(page);
  await page.locator(`[data-parley="${id}"]`).click();
  await expect(page.locator('[data-choice="a"]')).toBeVisible();
  await page.locator(`[data-choice="${branch}"]`).click();
  await uiBattle(page, mode);
}
async function readSaved(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('odd-index:game:emberwake:v1');
    return raw ? JSON.parse(raw) as string : null;
  });
}

test('原创内容、开场代理与纯规则闭环', () => {
  expect(Object.keys(CHARACTERS)).toHaveLength(6);
  expect(Object.keys(PLACE_STORY)).toHaveLength(9);
  expect(QUESTS).toHaveLength(12);
  const characters = JSON.stringify({ CHARACTERS, PLACE_STORY, QUEST_STORY, ENDINGS, INTRO, ACTS }).match(/[\u3400-\u9fff]/g)!.length;
  expect(characters).toBeGreaterThan(2500);
  const smoke = smokeCase();
  const obs = smoke.request.observation;
  if (!isRecord(obs)) throw new Error('开场观察无效。');
  const plan = fixturePlan(obs);
  smoke.request.validate(plan);
  smoke.verify(plan);
});

test('纯经济：支出先于收入、任务只奖一次、库存与装备不复制', () => {
  const empty = createInventory(['coin'] as const);
  expect(() => exchangeInventory(empty, { spend: [{ item: 'coin', amount: 2 }], gain: [{ item: 'coin', amount: 3 }] })).toThrow();
  expect(() => exchangeInventory({ coin: 1 }, { spend: [{ item: 'coin', amount: 1 }, { item: 'coin', amount: 1 }] })).toThrow();
  const session = new GameSession(definition, 82);
  pureQuest(session, 'departure', 'b');
  const once = session.serialize();
  expect(() => session.dispatch({ type: 'parley', quest: 'departure', plan: planFor(session.state, 'departure') })).toThrow();
  expect(session.serialize()).toBe(once);
  pureQuest(session, 'cable', 'b');
  session.dispatch({ type: 'travel', location: 'market' });
  session.dispatch({ type: 'buy', item: 'coat' });
  expect(session.state.bag.coat).toBe(1);
  expect(session.state.stock.coat).toBe(0);
  expect(() => session.dispatch({ type: 'buy', item: 'coat' })).toThrow();
  const hp = session.state.hp;
  session.dispatch({ type: 'equip', item: 'coat' });
  const cap = maxHp(session.state);
  expect(session.state.hp).toBe(hp);
  expect(() => session.dispatch({ type: 'equip', item: 'coat' })).toThrow();
  session.dispatch({ type: 'equip', item: 'none' });
  session.dispatch({ type: 'equip', item: 'coat' });
  expect(maxHp(session.state)).toBe(cap);
  expect(session.state.hp).toBe(hp);
  expect(session.state.bag.coat).toBe(1);
  expect(level(session.state)).toBeGreaterThan(1);
  session.dispatch({ type: 'build', path: 'fire' });
  expect(session.state.build.fire).toBe(1);
  expect(() => session.dispatch({ type: 'build', path: 'fire' })).toThrow();
});

test('纯战斗：阶段、站位、心火、护持、灼伤与代理目录均受约束', () => {
  const session = new GameSession(definition, 82);
  pureQuest(session, 'departure', 'a');
  session.dispatch({ type: 'travel', location: 'span' });
  session.dispatch({ type: 'parley', quest: 'cable', plan: planFor(session.state, 'cable') });
  session.dispatch({ type: 'choose', branch: 'a' });
  const before = session.serialize();
  expect(() => session.dispatch({ type: 'act', action: 'strike', lane: 1, target: 'hook' })).toThrow();
  expect(() => session.dispatch({ type: 'camp' })).toThrow();
  expect(() => session.dispatch({ type: 'equip', item: 'none' })).toThrow();
  const plan = planFor(session.state);
  expect(() => session.dispatch({ type: 'forecast', plan: { ...plan, orders: [plan.orders[0], plan.orders[0]] } })).toThrow();
  expect(session.serialize()).toBe(before);
  session.dispatch({ type: 'forecast', plan });
  const locked = session.serialize();
  expect(() => session.dispatch({ type: 'forecast', plan })).toThrow();
  expect(() => session.dispatch({ type: 'act', action: 'flare', lane: 1, target: 'heart' })).toThrow();
  expect(session.serialize()).toBe(locked);
  session.dispatch({ type: 'act', action: 'flare', lane: 0, target: 'hook' });
  expect(session.state.energy).toBe(3);
  expect(session.state.battle!.enemies[0].burn).toBe(2);
  session.dispatch({ type: 'forecast', plan: planFor(session.state, undefined, 'loss') });
  expect(() => session.dispatch({ type: 'act', action: 'strike', lane: 2, target: 'hook' })).toThrow();
  session.dispatch({ type: 'act', action: 'guard', lane: 1, target: 'hook' });
  expect(session.state.energy).toBe(5);
  expect(() => definition.parseCommand({ type: 'camp', reward: 99 })).toThrow();
  expect(() => definition.parseCommand({ type: 'act', action: 'strike', lane: .5, target: 'hook' })).toThrow();
});

test('纯全旅程、三种挣得的终局与原子回放', () => {
  const session = new GameSession(definition, 82);
  expect(() => session.dispatch({ type: 'travel', location: 'heart' })).toThrow();
  for (const [id, branch] of route) {
    if (['kiln', 'bell', 'market', 'reservoir', 'observatory'].includes(session.state.location) && session.state.hp < maxHp(session.state)) session.dispatch({ type: 'camp' });
    pureQuest(session, id, branch);
    if (session.state.points) session.dispatch({ type: 'build', path: session.state.build.fire < 3 ? 'fire' : 'shelter' });
  }
  const beforeFinal = session.serialize();
  pureQuest(session, 'furnace', 'b');
  expect(session.state.ending).toBe('shared');
  const shared = session.serialize();
  const sharedState = structuredClone(session.state);
  session.restore(beforeFinal);
  pureQuest(session, 'furnace', 'a');
  const beforeEnding = session.serialize();
  session.dispatch({ type: 'ending', ending: 'unbound' });
  expect(session.state.ending).toBe('unbound');
  session.restore(beforeEnding);
  session.dispatch({ type: 'ending', ending: 'anchor' });
  expect(session.state.ending).toBe('anchor');
  expect(session.moveCount).toBeLessThan(150);
  const stable = session.serialize(), revision = session.revision;
  const invalid = JSON.parse(stable);
  invalid.commands.push({ type: 'camp' });
  expect(() => session.restore(JSON.stringify(invalid))).toThrow();
  expect(session.serialize()).toBe(stable);
  expect(session.revision).toBe(revision);
  session.restore(shared);
  expect(session.state).toEqual(sharedState);
  expect(session.revision).toBeGreaterThan(revision);
});

test('纯战斗：末位同伴破甲仍使玩家和所有友军当轮受益，且只扣一次心火', () => {
  const session = new GameSession(definition, 82);
  pureQuest(session, 'departure', 'a');
  session.dispatch({ type: 'travel', location: 'span' });
  session.dispatch({ type: 'parley', quest: 'cable', plan: planFor(session.state, 'cable') });
  session.dispatch({ type: 'choose', branch: 'a' });
  const state = structuredClone(session.state);
  state.party = ['lan', 'mo', 'qiao'];
  state.battle!.allies = state.party.map(id => ({ id, lane: 1, energy: 3 }));
  const enemy = state.battle!.enemies[0];
  enemy.hp = 100; enemy.maxHp = 100; enemy.lane = 1;
  state.battle!.enemies = [enemy];
  const before = structuredClone(state);
  function resolveGuard(guard: boolean) {
    const plan = planFor(state);
    plan.orders = plan.orders.map(order => ({
      ...order,
      action: order.actor === 'qiao' ? 'burst' : order.actor === enemy.id && guard ? 'guard' : 'strike',
      lane: 1,
      target: order.actor === enemy.id ? guard ? enemy.id : 'caravan' : enemy.id,
    }));
    const forecast = definition.reduce(state, { type: 'forecast', plan: planTool.parse(plan) });
    return definition.reduce(forecast, { type: 'act', action: 'strike', lane: 1, target: enemy.id });
  }
  const guarded = resolveGuard(true), unguarded = resolveGuard(false);
  expect(guarded.battle!.enemies[0].hp).toBe(unguarded.battle!.enemies[0].hp);
  expect(guarded.battle!.allies.find(ally => ally.id === 'qiao')!.energy).toBe(1);
  expect(state).toEqual(before);
});

test('纯失败没有奖励或复活漏洞；未经历支线不能获得替代结局', () => {
  const session = new GameSession(definition, 82);
  pureQuest(session, 'departure', 'a');
  const xp = session.state.xp, coins = session.state.bag.coin;
  pureQuest(session, 'cable', 'a', 'loss');
  expect(session.state.ending).toBe('lost');
  expect(session.state.completed.cable).toBeUndefined();
  expect(session.state.xp).toBe(xp);
  expect(session.state.bag.coin).toBe(coins);
  expect(() => session.dispatch({ type: 'camp' })).toThrow();
  expect(() => session.dispatch({ type: 'ending', ending: 'unbound' })).toThrow();
  session.reset();
  expect(session.moveCount).toBe(0);
  expect(session.state.hp).toBe(34);
});

test('心火不足的技能和敌方计划均不提交，未完成同伴弧线无法跳过最终战', () => {
  const session = new GameSession(definition, 82);
  pureQuest(session, 'departure', 'a');
  session.dispatch({ type: 'travel', location: 'span' });
  session.dispatch({ type: 'parley', quest: 'cable', plan: planFor(session.state, 'cable') });
  session.dispatch({ type: 'choose', branch: 'a' });
  for (let round = 0; round < 2; round++) {
    const plan = planFor(session.state, undefined, 'loss');
    plan.orders = plan.orders.map(o => o.actor === 'hook' ? { ...o, action: 'guard', lane: 1, target: 'hook' } : o);
    session.dispatch({ type: 'forecast', plan });
    session.dispatch({ type: 'act', action: 'flare', lane: 1, target: 'hook' });
  }
  expect(session.state.energy).toBe(1);
  session.dispatch({ type: 'forecast', plan: planFor(session.state, undefined, 'loss') });
  const stable = session.serialize();
  expect(() => session.dispatch({ type: 'act', action: 'flare', lane: 1, target: 'hook' })).toThrow();
  expect(() => session.dispatch({ type: 'act', action: 'tonic', lane: 1, target: 'hook' })).toThrow();
  expect(session.serialize()).toBe(stable);
  session.dispatch({ type: 'act', action: 'guard', lane: 1, target: 'hook' });
  expect(session.state.battle!.enemies[0].energy).toBe(1);
  const illegal = planFor(session.state, undefined, 'loss');
  illegal.orders = illegal.orders.map(o => o.actor === 'hook' ? { ...o, action: 'sweep', lane: 1, target: 'caravan' } : o);
  const beforeIllegal = session.serialize();
  expect(() => session.dispatch({ type: 'forecast', plan: illegal })).toThrow();
  expect(session.serialize()).toBe(beforeIllegal);

  session.reset();
  for (const [id, branch] of route.filter(([id]) => !questById(id).optional)) {
    pureQuest(session, id, branch);
    if (['kiln', 'bell', 'market', 'reservoir', 'observatory'].includes(session.state.location) &&
      (session.state.hp < maxHp(session.state) || session.state.energy < 5)) session.dispatch({ type: 'camp' });
  }
  session.dispatch({ type: 'travel', location: 'heart' });
  session.dispatch({ type: 'parley', quest: 'furnace', plan: planFor(session.state, 'furnace') });
  const beforeChoice = session.serialize();
  expect(() => session.dispatch({ type: 'choose', branch: 'b' })).toThrow();
  expect(session.serialize()).toBe(beforeChoice);
  session.dispatch({ type: 'choose', branch: 'a' });
  pureBattle(session);
  expect(session.state.phase).toBe('finale');
  expect(() => session.dispatch({ type: 'ending', ending: 'unbound' })).toThrow();
  session.dispatch({ type: 'ending', ending: 'anchor' });
  expect(session.state.ending).toBe('anchor');
});

for (const ending of ['unbound', 'shared'] as const) {
  test(`真实界面完整旅程：${ending === 'shared' ? '共担的晨风' : '无主的天空'}、成长、战利品与存档`, async ({ page }) => {
    test.setTimeout(180_000);
    const calls = await installAgentFixture(page, turn => fixturePlan(turn.observation));
    await page.goto('./projects/emberwake/');
    await expect(page.getByRole('heading', { name: '余烬行旅', exact: true })).toBeVisible();
    expect(calls).toHaveLength(0);
    for (const [id, branch] of route) await uiQuest(page, id, branch);
    await prepare(page);
    await uiQuest(page, 'furnace', ending === 'shared' ? 'b' : 'a');
    if (ending === 'unbound') await page.locator('[data-ending="unbound"]').click();
    await expect(page.locator('[data-ending-title]')).toHaveText(ending === 'shared' ? '共担的晨风' : '无主的天空');
    await expect(page.locator('[data-level]')).toContainText('5');
    const saved = await readSaved(page);
    expect(saved).not.toBeNull();
    const replay = JSON.parse(saved!);
    expect(replay.commands.length).toBeLessThan(150);
    expect(replay.commands.filter((c: { type: string }) => c.type === 'choose')).toHaveLength(12);
    expect(replay.commands.some((c: { type: string }) => c.type === 'build')).toBeTruthy();
    expect(replay.commands.some((c: { type: string }) => c.type === 'equip')).toBeTruthy();
    expect(calls.filter(c => c.observation.kind === 'battle').length).toBeGreaterThan(3);
    await page.locator('.ew-toolbar [data-open="journal"]').click();
    await expect(page.locator('#emberwake-journal')).toContainText('已完成 12');
    await page.locator('#emberwake-journal .workspace-dialog-heading button').click();
    await page.locator('[data-save]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-game-export]').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error('回放未能导出。');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const exported = Buffer.concat(chunks);
    expect(JSON.parse(exported.toString()).game).toBe('emberwake');
    await page.locator('#emberwake-notebook .workspace-dialog-heading button').click();
    const callCount = calls.length;
    await page.reload();
    await expect(page.locator('[data-ending-title]')).toBeVisible();
    expect(calls).toHaveLength(callCount);
    await page.locator('.ew-toolbar [data-open="restart"]').click();
    await page.locator('[data-restart-confirm]').click();
    await page.locator('[data-save]').click();
    await page.locator('[data-game-import]').setInputFiles({ name: '行旅回放.json', mimeType: 'application/json', buffer: exported });
    await expect(page.locator('[data-game-save-status]')).toContainText('回放已导入');
    await page.locator('#emberwake-notebook .workspace-dialog-heading button').click();
    await expect(page.locator('[data-ending-title]')).toBeVisible();
    expect(calls).toHaveLength(callCount);
    expect(await readSaved(page)).toBe(saved);
    const restored = await readSaved(page);
    await page.locator('[data-save]').click();
    const bad = JSON.parse(exported.toString());
    bad.commands.push({ type: 'camp' });
    await page.locator('[data-game-import]').setInputFiles({ name: '错误回放.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await expect(page.locator('[data-game-save-status]')).toContainText('回放被拒绝');
    expect(await readSaved(page)).toBe(restored);
  });
}

test('真实界面败北与重新启程，不注入隐藏状态', async ({ page }) => {
  test.setTimeout(90_000);
  await installAgentFixture(page, turn => fixturePlan(turn.observation, 'loss'));
  await page.goto('./projects/emberwake/');
  await uiQuest(page, 'departure', 'a');
  await uiQuest(page, 'cable', 'a', 'loss');
  await expect(page.locator('[data-ending-title]')).toHaveText('未送达的灯');
  await page.locator('.ew-toolbar [data-open="restart"]').click();
  await page.locator('[data-restart-confirm]').click();
  await expect(page.locator('[data-parley="departure"]')).toBeVisible();
  await expect(page.locator('[data-hp]')).toContainText('34/34');
  expect(JSON.parse((await readSaved(page))!).commands).toHaveLength(0);
});

test('非法代理只纠正一次，不扣资源或推进；公开文字转义', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => ({ ...fixturePlan(turn.observation), speaker: 'yan' }));
  await page.goto('./projects/emberwake/');
  const hp = await page.locator('[data-hp]').innerText();
  await page.locator('[data-parley="departure"]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('未通过游戏规则');
  expect(calls).toHaveLength(2);
  expect(await readSaved(page)).toBeNull();
  await expect(page.locator('[data-hp]')).toHaveText(hp);
  await page.unroute('**/api/openai/v1/chat/completions');
  await installAgentFixture(page, turn => fixturePlan(turn.observation));
  await page.locator('[data-parley="departure"]').click();
  await expect(page.locator('[data-panel] blockquote')).toContainText('「<风>」');
  expect(await page.locator('[data-panel] blockquote').innerHTML()).toContain('&lt;风&gt;');
});

test('服务错误无推进，取消后的过期响应不能覆盖新旅途', async ({ page }) => {
  let release: (() => void) | undefined;
  let delayed = false;
  const calls = await installAgentFixture(page, async turn => {
    if (delayed) await new Promise<void>(resolve => { release = resolve; });
    return fixturePlan(turn.observation);
  });
  const fail = async (route: import('@playwright/test').Route) => route.fulfill({ status: 503, body: '{"error":"unavailable"}' });
  await page.route('**/api/openai/v1/chat/completions', fail);
  await page.goto('./projects/emberwake/');
  await page.locator('[data-parley="departure"]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('模型服务拒绝');
  expect(await readSaved(page)).toBeNull();
  await page.unroute('**/api/openai/v1/chat/completions', fail);
  delayed = true;
  await page.locator('[data-parley="departure"]').click();
  await expect.poll(() => calls.length).toBe(1);
  await page.locator('.ew-toolbar [data-open="restart"]').click();
  await page.locator('[data-restart-confirm]').click();
  release!();
  await expect(page.locator('[data-parley="departure"]')).toBeEnabled();
  await expect(page.locator('[data-choice]')).toHaveCount(0);
  expect(JSON.parse((await readSaved(page))!).commands).toHaveLength(0);
  delayed = false;
  await page.locator('[data-parley="departure"]').click();
  await expect(page.locator('[data-choice="a"]')).toBeVisible();
  expect(JSON.parse((await readSaved(page))!).commands).toHaveLength(1);
});

test('中文、手机及短横屏：主操作同屏、键盘与对话框边界', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installAgentFixture(page, turn => fixturePlan(turn.observation));
  await page.goto('./projects/emberwake/');
  const sizes = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 }];
  async function layout(selector: string) {
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.vw + 1);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.vh + 1);
    for (const locator of [page.locator(selector).first(), page.locator('[data-agent-connect]'), page.locator('[data-agent-log]'), page.getByRole('heading', { name: '余烬行旅', exact: true })]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(dimensions.vh + 1);
    }
  }
  for (const size of sizes) { await page.setViewportSize(size); await layout('[data-parley]'); }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath('emberwake-phone.png') });
  await page.locator('[data-parley="departure"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-choice="a"]')).toBeVisible();
  for (const size of sizes) { await page.setViewportSize(size); await layout('[data-choice="b"]'); }
  await page.locator('[data-choice="a"]').click();
  await travel(page, 'cable');
  await page.locator('[data-parley="cable"]').click();
  await page.locator('[data-choice="a"]').click();
  await page.locator('[data-forecast]').click();
  await expect(page.locator('[data-act-command="strike"]')).toBeVisible();
  for (const size of sizes) { await page.setViewportSize(size); await layout('[data-act-command="tonic"]'); }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: testInfo.outputPath('emberwake-battle.png') });
  const saved = await readSaved(page);
  await page.locator('[data-lane]').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('[data-pick-lane="0"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await readSaved(page)).toBe(saved);
  await page.locator('.ew-toolbar [data-open="help"]').click();
  await expect(page.getByRole('dialog', { name: '领航手册' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  expect(await readSaved(page)).toBe(saved);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '领航手册' })).not.toBeVisible();
  await page.locator('[data-agent-connect]').click();
  await expect(page.getByRole('dialog', { name: '模型连接' })).toBeVisible();
  await expect(page.locator('[data-agent-settings-form]')).toContainText('服务地址');
});
