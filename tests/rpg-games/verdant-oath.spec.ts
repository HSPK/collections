import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GameSession } from '../../src/core/games/session';
import { exchangeInventory, createInventory } from '../../src/core/rpg/inventory';
import { gainExperience } from '../../src/core/rpg/progression';
import { AgentValidationError } from '../../src/core/agents/errors';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { smokeCase } from '../../src/projects/verdant-oath/agent';
import {
  COMPANIONS, CURVE, ITEMS, LIMITS, LOCATIONS, PLACES, SPIRITS,
} from '../../src/projects/verdant-oath/data';
import type { Command, CompanionId, Layout, LocationId, Plan, State } from '../../src/projects/verdant-oath/data';
import {
  create, definition, endingReason, inspectLayout, legalHelp, parseCommand, reduce, travelReason,
} from '../../src/projects/verdant-oath/engine';
import { CHARACTERS, QUEST_STORY, PLACE_STORY, ACTS, PROLOGUE, ENDING_STORY } from '../../src/projects/verdant-oath/story';

const root = '.project-verdant-oath';
const opening: Plan = { wild: '靠近', intention: '我愿先听听这条给幼灵留路的句子。', companions: [] };
function layoutFor(s: State): Layout {
  return {
    runes: PLACES[s.location].trail.map((cell, i) => ({ cell, element: i === 0 || i === 2 ? 'wood' : i === 1 ? 'ember' : 'water' })),
    formation: s.party.map(p => ({ id: p.id, cell: PLACES[s.location].trail[p.id === 'bud' ? 2 : p.id === 'tide' ? 3 : 1] })),
    stance: 'echo',
  };
}
function planFor(s: State): Plan {
  return { ...opening, companions: s.party.map(p => {
    const legal = legalHelp(s, p.id);
    return { id: p.id, move: legal.includes('接引') ? '接引' : legal.includes('护持') ? '护持' : '观望', intention: '我选择在自己的界限内陪你接过这一段。' };
  }) };
}
function fixturePlan(turn: FixtureTurn): Plan {
  const party = turn.observation['同行者'] as { id: CompanionId; 合法动作: Plan['companions'][number]['move'][] }[];
  return {
    ...opening, companions: party.map(p => ({
      id: p.id, move: p.合法动作.includes('接引') ? '接引' : p.合法动作.includes('护持') ? '护持' : '观望',
      intention: '我愿在这里接引自己的元素，也保留休息的权利。',
    })),
  };
}
function openingSession() {
  const session = new GameSession(definition, 84);
  session.dispatch({ type: 'travel', location: 'wood' });
  session.dispatch({ type: 'begin' });
  session.dispatch({ type: 'layout', layout: layoutFor(session.state) });
  return session;
}

test('满额合法回放不会再发起付费灵应答，错误以中文呈现', async ({ page }) => {
  const session = openingSession();
  while (session.moveCount < 600) session.dispatch({ type: 'layout', layout: layoutFor(session.state) });
  const replay = session.serialize();
  const calls = await installAgentFixture(page, fixturePlan);
  await page.addInitScript(encoded => {
    localStorage.setItem('odd-index:game:verdant-oath:v1', JSON.stringify(encoded));
  }, replay);
  await page.goto('./projects/verdant-oath/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await page.locator(`${root} [data-action="answer"]`).click();
  await expect(page.locator(`${root} [data-agent-status]`)).toContainText('游戏回放空间或行动条数不足');
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
  expect(calls).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('odd-index:game:verdant-oath:v1')!))).toBe(replay);
});
function resolve(session: GameSession<State, Command>) {
  session.dispatch({ type: 'begin' });
  session.dispatch({ type: 'layout', layout: layoutFor(session.state) });
  let count = 0;
  while (session.state.phase === 'ritual') {
    expect(count++).toBeLessThan(12);
    session.dispatch({ type: 'agent', plan: planFor(session.state) });
  }
  expect(session.state.phase).toBe('travel');
}
function prepare(session: GameSession<State, Command>, id: LocationId) {
  session.dispatch({ type: 'travel', location: id });
  if (!session.state.gathered.includes(id)) session.dispatch({ type: 'gather' });
  if (session.state.focus < 12 || session.state.strain) session.dispatch({ type: 'rest' });
}
function earnedCampaign() {
  const session = new GameSession(definition, 84);
  session.dispatch({ type: 'gather' });
  session.dispatch({ type: 'craft', charm: 'ash-charm' });
  session.dispatch({ type: 'equip', charm: 'ash-charm' });
  for (const location of LOCATIONS.slice(1)) {
    prepare(session, location);
    resolve(session);
    if (location === 'wood') session.dispatch({ type: 'learn', skill: 'listen' });
    for (const id of COMPANIONS.filter(id => SPIRITS[id].home === location)) {
      session.dispatch({ type: 'recruit', id });
      if (session.state.focus < 2) session.dispatch({ type: 'rest' });
      session.dispatch({ type: 'train', id });
      session.dispatch({ type: 'quest', id: SPIRITS[id].quest });
      session.dispatch({ type: 'evolve', id });
    }
    if (location === 'wood') {
      prepare(session, 'village');
      session.dispatch({ type: 'quest', id: 'sleeve' });
      session.dispatch({ type: 'choose', id: 'ledger', option: 'truth' });
    }
    if (location === 'river') session.dispatch({ type: 'quest', id: 'ferry' });
    if (location === 'ruins') session.dispatch({ type: 'choose', id: 'roots', option: 'release' });
    if (location === 'frost') {
      session.dispatch({ type: 'choose', id: 'winter', option: 'cede' });
      prepare(session, 'ruins');
      session.dispatch({ type: 'quest', id: 'witness' });
    }
  }
  return session;
}

test('原创内容、完整三幕、七位人物与十三项约定', async () => {
  expect(LOCATIONS).toHaveLength(8);
  expect(new Set(Object.values(PLACES).map(p => p.kind)).size).toBe(8);
  expect(CHARACTERS).toHaveLength(7);
  expect(Object.keys(QUEST_STORY)).toHaveLength(13);
  const narrative = JSON.stringify({ CHARACTERS, QUEST_STORY, PLACE_STORY, ACTS, PROLOGUE, ENDING_STORY });
  expect((narrative.match(/\p{Script=Han}/gu) ?? []).length).toBeGreaterThan(2500);
  for (const c of CHARACTERS) for (const key of ['design', 'biography', 'goal', 'flaw', 'bond', 'mechanic'] as const) expect(c[key].length).toBeGreaterThan(12);
});

test('空间、元素语法、阵位、成本与纯函数边界', async () => {
  const session = openingSession(), before = session.serialize(), snapshot = JSON.stringify(session.state);
  const layout = layoutFor(session.state);
  expect(inspectLayout(session.state, layout).cost).toBe(1);
  const malformed: Layout[] = [
    { ...layout, runes: layout.runes.map((r, i) => i === 2 ? { ...r, element: 'water' } : r) },
    { ...layout, runes: layout.runes.map((r, i) => i === 2 ? { ...r, cell: 2 } : r) },
    { ...layout, runes: layout.runes.map((r, i) => i === 2 ? { ...r, cell: 11 } : r) },
    { ...layout, runes: layout.runes.map((r, i) => i === 0 ? { ...r, element: 'ember' } : r) },
    { ...layout, formation: [{ id: 'bud', cell: 12 }] },
    { ...layout, stance: 'guard' },
  ];
  for (const bad of malformed) expect(() => session.dispatch({ type: 'layout', layout: bad })).toThrow(AgentValidationError);
  expect(() => parseCommand({ type: 'travel', location: 'moon' })).toThrow();
  expect(() => parseCommand({ type: 'agent', plan: { ...opening, win: true } })).toThrow();
  expect(() => parseCommand({ type: 'agent', plan: { ...opening, intention: '<script>中文</script>' } })).toThrow();
  expect(session.serialize()).toBe(before);
  expect(JSON.stringify(session.state)).toBe(snapshot);
  const preview = session.preview({ type: 'agent', plan: opening });
  expect(preview.harmony).toBe(3);
  expect(preview.focus).toBe(11);
  expect(JSON.stringify(session.state)).toBe(snapshot);
  const resistant = reduce(session.state, { type: 'agent', plan: { ...opening, wild: '筑障' } });
  expect(resistant.harmony).toBe(1);
  expect(resistant.strain).toBe(2);
  expect(resistant.focus).toBe(11);
  const broke = { ...session.state, focus: 0 };
  expect(() => reduce(broke, { type: 'agent', plan: opening })).toThrow();
  expect(broke.harmony).toBe(0);
  const offering = { ...session.state, layout: { ...layout, stance: 'offer' as const } };
  expect(() => reduce(offering, { type: 'agent', plan: opening })).toThrow();
  expect(offering.focus).toBe(12);
  const bag = createInventory(ITEMS, [], LIMITS);
  expect(() => exchangeInventory(bag, { spend: [{ item: 'twig', amount: 1 }], gain: [{ item: 'twig', amount: 1 }] }, LIMITS)).toThrow();
  expect(() => exchangeInventory(bag, { gain: [{ item: 'twig', amount: 25 }] }, LIMITS)).toThrow();
  expect(gainExperience(0, 16, CURVE).earnedLevels).toBe(3);
});

test('完整规则旅程、物资守恒、一次性奖励、三结局与原生回放', async () => {
  const session = earnedCampaign();
  expect(session.state.quests).toHaveLength(13);
  expect(session.state.party.every(p => p.evolved && p.bond >= 3)).toBe(true);
  expect(session.moveCount).toBeLessThan(160);
  expect(endingReason(session.state, 'renew')).toBeNull();
  expect(endingReason(session.state, 'anchor')).toBeNull();
  expect(endingReason(session.state, 'roam')).not.toBeNull();
  const before = session.serialize();
  expect(() => session.dispatch({ type: 'gather' })).toThrow();
  expect(() => session.dispatch({ type: 'begin' })).toThrow();
  expect(() => session.dispatch({ type: 'craft', charm: 'ash-charm' })).toThrow();
  expect(() => session.dispatch({ type: 'quest', id: 'coal-vow' })).toThrow();
  expect(session.serialize()).toBe(before);
  const replay = new GameSession(definition);
  replay.restore(before);
  expect(replay.state).toEqual(session.state);
  const illegal = JSON.parse(before);
  illegal.commands.push({ type: 'quest', id: 'witness' });
  const revision = replay.revision;
  expect(() => replay.restore(JSON.stringify(illegal))).toThrow();
  expect(replay.revision).toBe(revision);
  expect(replay.serialize()).toBe(before);
  session.dispatch({ type: 'finish', ending: 'renew' });
  expect(session.state.ending).toBe('renew');
  expect(() => session.dispatch({ type: 'rest' })).toThrow();
  replay.dispatch({ type: 'finish', ending: 'anchor' });
  expect(replay.state.ending).toBe('anchor');
  const alternate = JSON.parse(before);
  const winter = alternate.commands.find((c: Command) => c.type === 'choose' && c.id === 'winter');
  winter.option = 'follow';
  const wander = new GameSession(definition);
  wander.restore(JSON.stringify(alternate));
  wander.dispatch({ type: 'finish', ending: 'roam' });
  expect(wander.state.ending).toBe('roam');
});

test('真实地形费用、伙伴接引护持差异与蜕变距离', async () => {
  const river = { ...openingSession().state, location: 'river' as const };
  river.layout = layoutFor(river);
  expect(inspectLayout(river).cost).toBe(2);
  expect(inspectLayout({ ...river, equipped: 'rain-charm' }).cost).toBe(1);
  const wood = openingSession().state;
  const thorn: Layout = {
    runes: [{ cell: 10, element: 'wood' }, { cell: 5, element: 'wood' }, { cell: 6, element: 'water' },
      { cell: 11, element: 'wood' }, { cell: 12, element: 'ember' }, { cell: 13, element: 'wood' }, { cell: 14, element: 'water' }],
    formation: [], stance: 'echo',
  };
  expect(inspectLayout(wood, thorn).cost).toBe(2);
  expect(inspectLayout({ ...wood, equipped: 'root-charm' }, thorn).cost).toBe(1);
  expect(inspectLayout({ ...wood, skills: ['path'] }, thorn).cost).toBe(1);
  const earned = earnedCampaign();
  const replay = JSON.parse(earned.serialize()) as { commands: Command[] };
  const lastLayout = replay.commands.length - 1 - [...replay.commands].reverse().findIndex(c => c.type === 'layout');
  replay.commands = replay.commands.slice(0, lastLayout + 1);
  const ritual = new GameSession(definition);
  ritual.restore(JSON.stringify(replay));
  const s = ritual.state;
  const waiting: Plan = { ...opening, companions: s.party.map(p => ({ id: p.id, move: '观望', intention: '我暂时留在原地，等到能承担的时候。' })) };
  const helping = reduce(s, { type: 'agent', plan: planFor(s) });
  const watching = reduce(s, { type: 'agent', plan: waiting });
  expect(helping.harmony).toBeGreaterThan(watching.harmony);
  expect(helping.focus).toBe(watching.focus);
  const guarding: Plan = { ...waiting, wild: '筑障', companions: waiting.companions.map(p => ({ ...p, move: '护持' })) };
  expect(reduce(s, { type: 'agent', plan: guarding }).strain).toBe(0);
  expect(reduce(s, { type: 'agent', plan: { ...waiting, wild: '筑障' } }).strain).toBe(2);
  const illegal: Plan = { ...waiting, companions: waiting.companions.map(p => ({ ...p, move: '抗拒' })) };
  expect(() => reduce(s, { type: 'agent', plan: illegal })).toThrow();
  const duplicate = { ...waiting, companions: [waiting.companions[0], waiting.companions[0], waiting.companions[2]] };
  expect(() => reduce(s, { type: 'agent', plan: duplicate })).toThrow();
  const expanded = { ...river, party: [{ id: 'tide' as const, bond: 3, trained: true, evolved: false, memory: [] }],
    layout: { ...river.layout, formation: [{ id: 'tide' as const, cell: 18 }] } };
  expect(legalHelp(expanded, 'tide')).not.toContain('接引');
  expanded.party[0].evolved = true;
  expect(legalHelp(expanded, 'tide')).toContain('接引');
});

test('拒绝是真实机制；可撤阵恢复，露珠耗尽不堵死成长路线', async () => {
  const session = openingSession();
  const refusal = { ...opening, wild: '筑障' as const };
  for (let i = 0; i < 3; i++) session.dispatch({ type: 'agent', plan: refusal });
  expect(session.state.strain).toBe(6);
  session.dispatch({ type: 'retreat' });
  session.dispatch({ type: 'rest' });
  expect(session.state.focus).toBe(12);
  expect(session.state.harmony).toBe(0);
  session.dispatch({ type: 'begin' });
  session.dispatch({ type: 'layout', layout: layoutFor(session.state) });
  for (let i = 0; i < 4; i++) session.dispatch({ type: 'agent', plan: refusal });
  expect(session.state.phase).toBe('lost');
  expect(session.state.quests).toEqual([]);
  session.reset();
  expect(session.state.phase).toBe('travel');
  expect(session.moveCount).toBe(0);
  const campaign = earnedCampaign();
  const bud = campaign.state.party.find(p => p.id === 'bud')!;
  expect(legalHelp({ ...campaign.state, layout: layoutFor(campaign.state) }, 'bud')).not.toContain('抗拒');
  expect(bud.memory.length).toBeLessThanOrEqual(3);
  const base = create(84);
  expect(travelReason(base, 'canopy')).not.toBeNull();
  const training = {
    ...base, inventory: createInventory(ITEMS, [{ item: 'twig', amount: 1 }], LIMITS),
    party: [{ id: 'bud' as const, bond: 1, trained: false, evolved: false, memory: [] }],
  };
  const trained = reduce(training, { type: 'train', id: 'bud' });
  expect(trained.party[0].bond).toBe(2);
  expect(trained.inventory.dew).toBe(0);
  expect(trained.focus).toBe(10);
  const far = { ...campaign.state, layout: { ...layoutFor({ ...campaign.state, location: 'river' }), formation: [{ id: 'coal' as const, cell: 20 }] } };
  expect(legalHelp(far, 'coal')).toEqual(['观望']);
  for (const wild of ['靠近', '试探', '筑障'] as const) smokeCase().verify({ ...opening, wild });
});

async function close(page: Page) {
  await page.locator('dialog[open] .workspace-dialog-heading button').click();
}
async function panel(page: Page, id: string) {
  await page.locator(`${root} [data-panel="${id}"]`).first().click();
}
async function travel(page: Page, location: LocationId) {
  await panel(page, 'map');
  await page.locator(`[data-travel="${location}"]`).click();
  await expect(page.locator(root)).toHaveAttribute('data-location', location);
}
async function supplies(page: Page) {
  const gather = page.locator('[data-action="gather"]');
  if (await gather.isEnabled()) await gather.click();
  const rest = page.locator('[data-action="rest"]');
  if (await rest.isEnabled()) await rest.click();
}
async function bagActions(page: Page, selectors: string[]) {
  await panel(page, 'bag');
  for (const selector of selectors) await page.locator(`#verdant-oath-bag ${selector}`).click();
  await close(page);
}
async function quest(page: Page, id: string) {
  await panel(page, 'journal');
  await page.locator(`[data-quest="${id}"]`).click();
  await close(page);
}
async function choose(page: Page, id: string, option: string) {
  await panel(page, 'journal');
  await page.locator(`[data-choice="${id}"][data-option="${option}"]`).click();
  await close(page);
}
async function writeRitual(page: Page, location: LocationId, party: CompanionId[] = []) {
  await page.locator('[data-action="begin"]').click();
  const trail = PLACES[location].trail;
  for (let i = 0; i < trail.length; i++) {
    const element = i === 0 || i === 2 ? 'wood' : i === 1 ? 'ember' : 'water';
    await page.locator(`[data-element="${element}"]`).click();
    await page.locator(`[data-cell="${trail[i]}"]`).click();
  }
  for (const id of party) {
    await page.locator('[data-actor]').selectOption(id);
    await page.locator(`[data-cell="${trail[id === 'bud' ? 2 : id === 'tide' ? 3 : 1]}"]`).click();
  }
  await page.locator('[data-action="layout"]').click();
}
async function solveUI(page: Page, location: LocationId, party: CompanionId[]) {
  await writeRitual(page, location, party);
  let count = 0;
  while (await page.locator(root).getAttribute('data-phase') === 'ritual') {
    expect(count++).toBeLessThan(10);
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
    await expect(page.locator('[data-agent-status]')).toContainText('靠近');
  }
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'travel');
}
async function exportReplay(page: Page) {
  await page.locator('[data-notebook]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-game-export]').click();
  const download = await downloadPromise;
  const contents = await readFile((await download.path())!, 'utf8');
  await close(page);
  return contents;
}
async function importReplay(page: Page, encoded: string) {
  await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: '季候回放.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('已导入');
  await close(page);
}

test('真实界面完整十三任务、三灵蜕变、成长制作、三种挣得的结局与导入', async ({ page }) => {
  test.setTimeout(240_000);
  const calls = await installAgentFixture(page, fixturePlan);
  await page.goto('/projects/verdant-oath/');
  await expect(page.getByRole('heading', { name: '森语契约', exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await supplies(page);
  await bagActions(page, ['[data-craft="ash-charm"]', '[data-equip="ash-charm"]']);
  const party: CompanionId[] = [];
  let winterReplay = '';
  for (const location of LOCATIONS.slice(1)) {
    await travel(page, location);
    await supplies(page);
    await solveUI(page, location, party);
    if (location === 'wood') await bagActions(page, ['[data-learn="listen"]']);
    for (const id of COMPANIONS.filter(id => SPIRITS[id].home === location)) {
      if (await page.locator('[data-action="rest"]').isEnabled()) await page.locator('[data-action="rest"]').click();
      await bagActions(page, [`[data-recruit="${id}"]`, `[data-train="${id}"]`]);
      party.push(id);
      await quest(page, SPIRITS[id].quest);
      await bagActions(page, [`[data-evolve="${id}"]`]);
    }
    if (location === 'wood') {
      await travel(page, 'village');
      await quest(page, 'sleeve');
      await choose(page, 'ledger', 'truth');
    }
    if (location === 'river') {
      await quest(page, 'ferry');
      await bagActions(page, ['[data-learn="shelter"]']);
    }
    if (location === 'ruins') await choose(page, 'roots', 'release');
    if (location === 'frost') {
      winterReplay = await exportReplay(page);
      await choose(page, 'winter', 'cede');
      await travel(page, 'ruins');
      await quest(page, 'witness');
    }
  }
  await panel(page, 'journal');
  await expect(page.locator('#verdant-oath-journal')).toContainText('十三项约定 · 13已履行');
  await page.locator('[data-finish="renew"]').click();
  await expect(page.locator('[data-ending] h2')).toHaveText('轮守之约 · 每个人的一季');
  const winning = await exportReplay(page);
  const parsed = JSON.parse(winning);
  expect(parsed.commands.length).toBeLessThan(180);
  expect(parsed).not.toHaveProperty('state');
  const requestCount = calls.length;
  await page.reload();
  await expect(page.locator('[data-ending] h2')).toHaveText('轮守之约 · 每个人的一季');
  expect(calls).toHaveLength(requestCount);
  for (const [option, ending, title] of [['follow', 'roam', '迁徙同行 · 家在脚步之间'], ['cede', 'anchor', '以名作桥 · 留下的人']]) {
    await importReplay(page, winterReplay);
    expect(calls).toHaveLength(requestCount + (ending === 'anchor' ? 2 : 0));
    await choose(page, 'winter', option);
    await travel(page, 'crown');
    await supplies(page);
    await solveUI(page, 'crown', party);
    await panel(page, 'journal');
    await page.locator(`[data-finish="${ending}"]`).click();
    await expect(page.locator('[data-ending] h2')).toHaveText(title);
  }
  expect(calls.every(c => c.tool === 'answer_ritual')).toBe(true);
  expect(calls.some(c => (c.observation['同行者'] as unknown[]).length === 3)).toBe(true);
});

test('无效模型与服务错误不消耗；真实拒绝断契，重启无请求', async ({ page }) => {
  let mode: 'invalid' | 'resist' = 'invalid';
  const calls = await installAgentFixture(page, turn => mode === 'invalid' ? { ...fixturePlan(turn), wild: '直接胜利' } : { ...fixturePlan(turn), wild: '筑障' });
  await page.goto('/projects/verdant-oath/');
  await travel(page, 'wood');
  await writeRitual(page, 'wood');
  const before = await exportReplay(page);
  await page.locator('[data-action="answer"]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('未');
  await expect.poll(() => calls.length).toBe(2);
  expect(await exportReplay(page)).toBe(before);
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '{}' }));
  await page.locator('[data-action="answer"]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('503');
  expect(await exportReplay(page)).toBe(before);
  await page.unroute('**/api/openai/v1/chat/completions');
  mode = 'resist';
  const refusals = await installAgentFixture(page, turn => ({ ...fixturePlan(turn), wild: '筑障' }));
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
    await expect(page.locator('[data-agent-status]')).toContainText('筑障');
  }
  expect(refusals).toHaveLength(4);
  await expect(page.locator('[data-ending] h2')).toHaveText('断契之夜 · 把手松开');
  await panel(page, 'new');
  await page.locator('[data-action="restart"]').click();
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'travel');
  await expect(page.locator(root)).toHaveAttribute('data-location', 'village');
  expect(refusals).toHaveLength(4);
});

test('选择不废弃应答；取消、重置、导入拥有修订权，非法回放原子拒绝', async ({ page }) => {
  let release: (() => void) | undefined;
  let block = true;
  const calls = await installAgentFixture(page, async turn => {
    if (block) await new Promise<void>(resolve => { release = resolve; });
    return fixturePlan(turn);
  });
  await page.goto('/projects/verdant-oath/');
  await travel(page, 'wood');
  await writeRitual(page, 'wood');
  const before = await exportReplay(page);
  await page.locator('[data-action="answer"]').click();
  await expect.poll(() => calls.length).toBe(1);
  await page.locator('[data-element="water"]').click();
  release!();
  await expect(page.locator('[data-agent-status]')).toContainText('靠近');
  await expect(page.locator('[data-focus]')).toContainText('11/12');
  await page.locator('[data-action="answer"]').click();
  await expect.poll(() => calls.length).toBe(2);
  await panel(page, 'new');
  await page.locator('[data-action="restart"]').click();
  release!();
  block = false;
  await expect(page.locator(root)).toHaveAttribute('data-location', 'village');
  await importReplay(page, before);
  await expect(page.locator('[data-focus]')).toContainText('12/12');
  expect(calls).toHaveLength(2);
  block = true;
  await page.locator('[data-action="answer"]').click();
  await expect.poll(() => calls.length).toBe(3);
  await importReplay(page, before);
  release!();
  block = false;
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-focus]')).toContainText('12/12');
  const forged = JSON.parse(before);
  forged.commands.push({ type: 'finish', ending: 'renew' });
  await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: '非法回放.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) });
  await expect(page.locator('[data-game-save-status]')).toContainText('拒绝');
  await close(page);
  expect(await exportReplay(page)).toBe(before);
  const session = new GameSession(definition);
  const oldRevision = session.revision;
  session.restore(before);
  expect(session.revision).toBeGreaterThan(oldRevision);
  session.reset();
  expect(session.revision).toBeGreaterThan(oldRevision + 1);
});

test('中文小屏、短横屏、键盘阵格、弹窗快捷键保护与动态偏好', async ({ page }, testInfo) => {
  await installAgentFixture(page, fixturePlan);
  await page.goto('/projects/verdant-oath/');
  await travel(page, 'wood');
  await page.locator('[data-action="begin"]').click();
  for (const [width, height] of [[1440, 900], [1280, 800], [375, 812], [320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: '森语契约', exact: true })).toBeVisible();
    await expect(page.locator('[data-action="layout"]')).toBeVisible();
    await expect(page.locator('[data-action="answer"]')).toBeVisible();
    await expect(page.locator('[data-agent-status]')).toBeVisible();
    const dimensions = await page.locator(root).evaluate(el => ({
      width: el.scrollWidth, height: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight,
      bodyWidth: document.documentElement.scrollWidth, innerWidth,
    }));
    if (width === 1440 || width === 320) await page.screenshot({ path: testInfo.outputPath(`ritual-${width}.png`) });
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.clientHeight + 1);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1);
    expect(await page.locator('.vo-cell:enabled').evaluateAll(cells => cells.every(cell => {
      const rect = cell.getBoundingClientRect();
      return cell.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }))).toBe(true);
    for (const selector of ['[data-cell="10"]', '[data-cell="14"]', '[data-action="answer"]', '[data-agent-status]']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.locator('[data-action="answer"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-cell="10"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('3');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-action="layout"]')).toBeEnabled();
  await page.locator('[data-action="layout"]').click();
  await panel(page, 'help');
  await page.keyboard.press('Backspace');
  await close(page);
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator(root)).toHaveAttribute('data-reduced-motion', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator(root)).toHaveAttribute('data-reduced-motion', 'false');
  await page.locator('[data-action="answer"]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('靠近');
});
