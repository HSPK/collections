import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { createInventory, exchangeInventory } from '../../src/core/rpg/inventory';
import { definition, die, hasFact, level, parsePlan, questReady } from '../../src/projects/borrowed-names/engine';
import type { Command, Plan, State } from '../../src/projects/borrowed-names/engine';
import { FACT_IDS, NPCS, QUEST_IDS, SCENES } from '../../src/projects/borrowed-names/data';
import type { Ending, NpcId, SceneId, Topic } from '../../src/projects/borrowed-names/data';
import { smokeCase } from '../../src/projects/borrowed-names/agent';
import { diorama, portrait } from '../../src/projects/borrowed-names/art';
import { ACTS, BIOGRAPHIES, ENDING_STORY, INTRO, QUEST_STORY, SCENE_STORY } from '../../src/projects/borrowed-names/story';

const URL = './projects/borrowed-names/';
const STORE = 'odd-index:game:borrowed-names:v1';
const root = (page: Page) => page.locator('.project-borrowed-names');
const dialog = (page: Page) => page.locator('.bn-dialog[open]');
const say = '我会指出自己保管的原物，至于它能证明什么，请你亲自核验。';

function fixturePlan(turn: FixtureTurn): Plan {
  const o = turn.observation;
  return {
    encounter: Number(o.encounter),
    action: o.topic === 'pact' ? 'ally' : 'testify',
    fact: o.topic === 'lead' ? NPCS[o.npc as NpcId].fact : 'none',
    price: 0, line: say,
  };
}

async function clickCommand(page: Page, command: Command) {
  // These are real rendered buttons, never calls into a mounted session.
  const selector = `[data-command=${JSON.stringify(JSON.stringify(command))}]:visible`;
  const button = root(page).locator(selector);
  await expect(button).toBeEnabled();
  await button.click();
}
async function pane(page: Page, id: string) {
  await root(page).locator(`.bn-tabs [data-pane="${id}"]`).click();
  await expect(dialog(page)).toBeVisible();
}
async function closePane(page: Page) { await dialog(page).getByRole('button', { name: '关闭案夹' }).click(); }
async function claimReady(page: Page) {
  await pane(page, 'quests');
  for (let i = 0; i < 12; i++) {
    const ready = dialog(page).locator('[data-cmd="claim"]');
    if (!await ready.count()) break;
    await ready.first().click();
  }
  await closePane(page);
}
async function move(page: Page, to: SceneId, mode: 'walk' | 'sneak' | 'bribe' = 'walk') {
  await clickCommand(page, { type: 'move', to, mode });
  await expect(root(page)).toHaveAttribute('data-location', to);
}
async function encounter(page: Page, npc: NpcId, topic: Topic = 'lead') {
  const button = root(page).locator(`.bn-controls [data-encounter="${topic}"][data-npc="${npc}"]`);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
}
async function investigate(page: Page, npc: NpcId) {
  await encounter(page, npc);
  await clickCommand(page, { type: 'search', fact: NPCS[npc].fact, method: 'listen', mode: 'steady' });
}
async function replayFromUI(page: Page): Promise<{ encoded: string; state: State; commands: Command[] }> {
  const encoded = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as string, STORE);
  expect(typeof encoded).toBe('string');
  const session = new GameSession(definition);
  session.restore(encoded);
  return { encoded, state: session.state, commands: JSON.parse(encoded).commands };
}

async function uiCampaign(page: Page, ending: 'commons' | 'charter') {
  await page.goto(URL);
  await expect(root(page).getByRole('heading', { name: '借名之城', exact: true })).toBeVisible();
  await clickCommand(page, { type: 'start', role: 'listener' });
  await pane(page, 'wallet');
  await clickCommand(page, { type: 'learn', skill: 'echo' });
  await closePane(page);
  await investigate(page, 'lan');
  await claimReady(page);
  await move(page, 'alley');
  await pane(page, 'wallet');
  await clickCommand(page, { type: 'buy', item: 'clerk-pass' });
  await clickCommand(page, { type: 'buy', item: 'worker-pass' });
  await clickCommand(page, { type: 'buy', item: 'coat' });
  await clickCommand(page, { type: 'equip', item: 'coat' });
  await clickCommand(page, { type: 'equip', item: 'lens' });
  await closePane(page);
  await move(page, 'theater');
  await investigate(page, 'mei');
  await claimReady(page);
  if (ending === 'commons') {
    await encounter(page, 'mei', 'pact');
    await claimReady(page);
  }
  await pane(page, 'wallet');
  await clickCommand(page, { type: 'learn', skill: 'mercy' });
  await clickCommand(page, { type: 'wear', disguise: 'stage' });
  await clickCommand(page, { type: 'wear', disguise: 'clerk' });
  await closePane(page);
  await claimReady(page);
  await move(page, 'alley');
  await clickCommand(page, { type: 'rest' });
  await move(page, 'registry');
  await investigate(page, 'he');
  await claimReady(page);
  if (ending === 'charter') {
    await encounter(page, 'he', 'pact');
    await claimReady(page);
  }
  await move(page, 'alley');
  await move(page, 'clinic');
  await clickCommand(page, { type: 'aid' });
  await investigate(page, 'qiao');
  await clickCommand(page, { type: 'identity', decision: ending === 'commons' ? 'protect' : 'expose' });
  await claimReady(page);
  await clickCommand(page, { type: 'rest' });
  await pane(page, 'wallet');
  await clickCommand(page, { type: 'wear', disguise: 'worker' });
  await closePane(page);
  await move(page, 'pump');
  await investigate(page, 'lu');
  await claimReady(page);
  await pane(page, 'wallet');
  await clickCommand(page, { type: 'wear', disguise: 'clerk' });
  await closePane(page);
  await move(page, 'tower');
  await investigate(page, 'yan');
  await claimReady(page);
  await root(page).getByRole('button', { name: '整理并提交六证案卷' }).click();
  await dialog(page).locator('select[name="stamp"]').selectOption('double');
  await dialog(page).getByRole('button', { name: '提交案卷 · １精力' }).click();
  await closePane(page);
  await claimReady(page);
  await move(page, 'court');
  await encounter(page, 'yan', 'hearing');
  await clickCommand(page, { type: 'finish', ending });
  await expect(root(page)).toHaveAttribute('data-phase', 'won');
}

function localPlan(s: State, npc: NpcId, topic: Topic, action: Plan['action'] = topic === 'pact' ? 'ally' : 'testify'): Plan {
  return {
    encounter: s.agentTurns, action,
    fact: topic === 'lead' && ['testify', 'bargain'].includes(action) ? NPCS[npc].fact : 'none',
    price: action === 'bargain' ? 4 : 0, line: say,
  };
}
function start(seed = 83, role: 'listener' | 'actor' | 'watcher' = 'listener') {
  const session = new GameSession(definition, seed);
  session.dispatch({ type: 'start', role });
  return session;
}
function localEncounter(session: GameSession<State, Command>, npc: NpcId, topic: Topic = 'lead', action?: Plan['action']) {
  session.dispatch({ type: 'agent', npc, topic, method: 'listen', plan: localPlan(session.state, npc, topic, action) });
}
function claimAll(session: GameSession<State, Command>) {
  for (const quest of QUEST_IDS) if (questReady(session.state, quest)) session.dispatch({ type: 'claim', quest });
}
function localSearch(session: GameSession<State, Command>, npc: NpcId, refuses = false) {
  localEncounter(session, npc, 'lead', refuses ? 'withhold' : 'testify');
  if (refuses) session.dispatch({ type: 'petition', npc, topic: 'lead' });
  session.dispatch({ type: 'search', fact: NPCS[npc].fact, method: 'listen', mode: 'steady' });
  if (!hasFact(session.state, NPCS[npc].fact)) session.dispatch({ type: 'search', fact: NPCS[npc].fact, method: 'listen', mode: 'recover' });
  claimAll(session);
}
function localActTwo(seed = 83, role: 'listener' | 'watcher' = 'listener') {
  const s = start(seed, role);
  s.dispatch({ type: 'learn', skill: 'echo' });
  localSearch(s, 'lan');
  s.dispatch({ type: 'move', to: 'alley', mode: 'walk' });
  s.dispatch({ type: 'move', to: 'theater', mode: 'walk' });
  localSearch(s, 'mei');
  return s;
}

function localCampaign(ending: Ending, refuses = false) {
  const s = start();
  const doIt = (c: Command) => s.dispatch(c);
  const go = (to: SceneId) => doIt({ type: 'move', to, mode: 'walk' });
  const rest = () => doIt({ type: 'rest' });
  doIt({ type: 'learn', skill: 'echo' });
  localSearch(s, 'lan', refuses);
  go('alley');
  doIt({ type: 'buy', item: 'clerk-pass' }); doIt({ type: 'buy', item: 'worker-pass' });
  if (ending === 'bridge') doIt({ type: 'pawn' });
  rest();
  go('theater'); localSearch(s, 'mei', refuses);
  if (ending === 'commons') { localEncounter(s, 'mei', 'pact'); claimAll(s); }
  doIt({ type: 'learn', skill: 'mercy' });
  doIt({ type: 'wear', disguise: 'clerk' }); claimAll(s);
  go('alley'); rest(); go('registry'); localSearch(s, 'he', refuses);
  if (ending === 'charter') { localEncounter(s, 'he', 'pact'); claimAll(s); }
  go('alley'); rest(); go('clinic'); doIt({ type: 'aid' }); localSearch(s, 'qiao', refuses);
  doIt({ type: 'identity', decision: ending === 'charter' ? 'expose' : 'protect' }); claimAll(s); rest();
  doIt({ type: 'wear', disguise: 'worker' });
  go('pump'); localSearch(s, 'lu', refuses);
  go('clinic'); rest(); go('pump');
  doIt({ type: 'wear', disguise: 'clerk' });
  go('tower'); localSearch(s, 'yan', refuses);
  doIt({ type: 'file', motive: 'mortgage', stamp: 'double', timing: 'before' }); claimAll(s);
  go('court'); localEncounter(s, 'yan', 'hearing', refuses ? 'withhold' : 'testify');
  if (refuses) doIt({ type: 'petition', npc: 'yan', topic: 'hearing' });
  doIt({ type: 'finish', ending });
  return s;
}

test.describe('借名之城 · 真实界面与原生客户端', () => {
  test('原创场景与版画、实质剧情字数、直接键盘启动及桌面构图', async ({ page }, testInfo) => {
    const calls = await installAgentFixture(page, fixturePlan);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(URL);
    await expect(root(page)).toBeVisible();
    await page.keyboard.press('h');
    await expect(dialog(page).getByRole('heading', { name: '行事须知', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(root(page)).toHaveAttribute('data-turn', '0');
    expect(calls).toHaveLength(0);
    const story = [
      ...INTRO, ...ACTS.map(a => a.text), ...Object.values(SCENE_STORY).flat(),
      ...Object.values(BIOGRAPHIES).flat(), ...Object.values(QUEST_STORY),
      ...Object.values(ENDING_STORY).flatMap(e => e.text),
    ].join('');
    const hanCount = (story.match(/\p{Script=Han}/gu) ?? []).length;
    expect(hanCount).toBeGreaterThanOrEqual(2500);
    expect(new Set(Object.keys(SCENES).map(id => diorama(id as SceneId, false))).size).toBe(8);
    expect(new Set(Object.keys(NPCS).map(id => portrait(id as NpcId))).size).toBe(6);
    testInfo.annotations.push({ type: '实质故事汉字数', description: String(hanCount) });
    await page.screenshot({ path: testInfo.outputPath('borrowed-names-desktop.png') });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: testInfo.outputPath('borrowed-names-phone.png') });
  });

  test('完整共名街：成长、装备、十二项委托、六份来源与存档重载', async ({ page }) => {
    test.setTimeout(120_000);
    const calls = await installAgentFixture(page, fixturePlan);
    await uiCampaign(page, 'commons');
    await expect(dialog(page)).toContainText('共名街 · 没有人独自作抵');
    const { encoded, state, commands } = await replayFromUI(page);
    expect(state.claimed).toHaveLength(12);
    expect(state.evidence).toHaveLength(6);
    expect(state.visits).toHaveLength(8);
    expect(level(state).level).toBe(6);
    expect(state.bag.coat).toBe(1);
    expect(state.worn).toEqual(expect.arrayContaining(['stage', 'clerk', 'worker']));
    expect(state.skills).toEqual(['echo', 'mercy']);
    expect(state.ending).toBe('commons');
    expect(commands.length).toBeLessThan(100);
    expect(calls).toHaveLength(8);
    expect(calls.every(c => c.tool === 'choose_city_intent')).toBe(true);
    expect(calls[0].observation.确知范围).toHaveLength(1);
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-phase', 'won');
    expect((await replayFromUI(page)).encoded).toBe(encoded);
    expect(calls).toHaveLength(8);
  });

  test('另一条完整界面路线：公开名单与署方担保达成有名之约', async ({ page }) => {
    test.setTimeout(120_000);
    await installAgentFixture(page, fixturePlan);
    await uiCampaign(page, 'charter');
    const { state } = await replayFromUI(page);
    expect(state.ending).toBe('charter');
    expect(state.identity).toBe('expose');
    expect(state.allies).toContain('he');
    expect(state.allies).not.toContain('mei');
    expect(state.claimed).toHaveLength(12);
    await expect(dialog(page)).toContainText('一部分人的秘密交到了旧制度手中');
  });

  test('物理路线耗尽精力会失败，重开不调用模型', async ({ page }) => {
    const calls = await installAgentFixture(page, fixturePlan);
    await page.goto(URL);
    await clickCommand(page, { type: 'start', role: 'watcher' });
    for (let i = 0; i < 24; i++) await move(page, i % 2 === 0 ? 'alley' : 'ferry');
    await expect(root(page)).toHaveAttribute('data-phase', 'lost');
    await expect(dialog(page)).toContainText('精力耗尽');
    await closePane(page);
    await root(page).locator('.bn-header [data-pane="restart"]').click();
    await dialog(page).getByRole('button', { name: '同一世界重新开始' }).click();
    await expect(root(page)).toHaveAttribute('data-phase', 'choosing');
    await expect(root(page)).toHaveAttribute('data-turn', '0');
    expect(calls).toHaveLength(0);
  });

  test('非法回复最多纠正一次且不收费；原生客户端纠正成功只提交一次', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => ({
      ...fixturePlan(turn), fact: turn.index === 0 ? 'order' : 'receipt',
    }));
    await page.goto(URL);
    expect(calls).toHaveLength(0);
    await clickCommand(page, { type: 'start', role: 'listener' });
    await encounter(page, 'lan');
    const { state } = await replayFromUI(page);
    expect(calls).toHaveLength(2);
    expect(state.agentTurns).toBe(1);
    expect(state.vigor).toBe(23);
    expect(state.silver).toBe(20);
    expect(state.leads.receipt).toBe('agent');
    expect(state.evidence).toHaveLength(0);
  });

  test('取消、导入与迟到回复无成本，地图与键盘阅读不使交涉过期', async ({ page }) => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const calls = await installAgentFixture(page, async turn => { await waiting; return fixturePlan(turn); });
    await page.goto(URL);
    await clickCommand(page, { type: 'start', role: 'listener' });
    const before = (await replayFromUI(page)).encoded;
    await root(page).locator('[data-encounter="lead"]').click();
    await expect.poll(() => calls.length).toBe(1);
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
    await pane(page, 'map');
    await expect(root(page)).toHaveAttribute('data-turn', '1');
    await closePane(page);
    await root(page).locator('[data-notebook]').click();
    const notebook = page.locator('dialog.game-notebook[open]');
    await notebook.locator('[data-game-import]').setInputFiles({ name: '借名案卷.json', mimeType: 'application/json', buffer: Buffer.from(before) });
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    release!();
    await expect(notebook.locator('[data-game-save-status]')).toContainText('导入');
    expect((await replayFromUI(page)).encoded).toBe(before);
    await page.keyboard.press('Escape');
    await root(page).locator('.bn-header [data-pane="restart"]').click();
    await dialog(page).getByRole('button', { name: '生成新的雾津' }).click();
    await expect(root(page)).toHaveAttribute('data-turn', '0');
    expect(calls).toHaveLength(1);
  });

  test('浏览地图不会取消合法交涉，公开台词作为文本呈现', async ({ page }) => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const calls = await installAgentFixture(page, async turn => {
      await waiting;
      return { ...fixturePlan(turn), line: '我会指出封套的夹层。<雨灯>仍然为失名者亮着。' };
    });
    await page.goto(URL);
    await clickCommand(page, { type: 'start', role: 'listener' });
    await root(page).locator('[data-encounter="lead"]').click();
    await expect.poll(() => calls.length).toBe(1);
    await pane(page, 'map');
    release!();
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    expect((await replayFromUI(page)).state.agentTurns).toBe(1);
    await closePane(page);
    await pane(page, 'story');
    await expect(dialog(page)).toContainText('<雨灯>');
    expect(await root(page).locator('雨灯').count()).toBe(0);
  });

  test('中文手机、短横屏、键盘模态隔离与可见模型错误', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => ({ ...fixturePlan(turn), fact: 'order' }));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(URL);
    await clickCommand(page, { type: 'start', role: 'actor' });
    const before = (await replayFromUI(page)).encoded;
    await encounter(page, 'lan');
    expect(calls).toHaveLength(2);
    expect((await replayFromUI(page)).encoded).toBe(before);
    await expect(root(page).locator('[data-agent-status]')).toContainText(/规则|无效|校验/);
    await root(page).locator('.bn-tabs [data-pane="wallet"]').focus();
    await page.keyboard.press('j');
    await expect(dialog(page).getByRole('heading', { name: '委托与任务分支' })).toBeVisible();
    await page.keyboard.press('m');
    await expect(dialog(page).getByRole('heading', { name: '委托与任务分支' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await replayFromUI(page)).encoded).toBe(before);
    await page.unroute('**/api/openai/v1/chat/completions');
    await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '服务暂不可用' }));
    await encounter(page, 'lan');
    await expect(root(page).locator('[data-agent-status]')).toContainText('503');
    expect((await replayFromUI(page)).encoded).toBe(before);
    for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 768, height: 480 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const app = document.querySelector<HTMLElement>('.project-borrowed-names')!;
        const world = app.querySelector<HTMLElement>('.bn-world')!.getBoundingClientRect();
        const controls = app.querySelector<HTMLElement>('.bn-controls')!.getBoundingClientRect();
        const status = app.querySelector<HTMLElement>('[data-agent-status]')!.getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
          viewportWidth: innerWidth, viewportHeight: innerHeight,
          world: { height: world.height, bottom: world.bottom }, controls: { height: controls.height, bottom: controls.bottom },
          status: { height: status.height, bottom: status.bottom, right: status.right },
          essentialSize: getComputedStyle(app.querySelector('.bn-action')!).fontSize,
        };
      });
      expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.world.height).toBeGreaterThan(140);
      expect(layout.controls.height).toBeGreaterThan(100);
      expect(layout.controls.bottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.status.height).toBeGreaterThan(12);
      expect(layout.status.bottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.status.right).toBeLessThanOrEqual(layout.viewportWidth - 45);
      expect(layout.essentialSize).toBe('16px');
      await expect(root(page).getByRole('heading', { name: '借名之城', exact: true })).toBeVisible();
    }
  });
});

test.describe('借名之城 · 纯权威规则', () => {
  test('六证、三种结局与全拒绝后的有代价作桥路线均来自合法回放', () => {
    for (const ending of ['commons', 'charter', 'bridge'] as const) {
      const session = localCampaign(ending, ending === 'bridge');
      const state = session.state;
      expect(state.phase).toBe('won');
      expect(state.ending).toBe(ending);
      expect(state.turn).toBeLessThan(120);
      expect(state.evidence.map(e => e.id)).toEqual(expect.arrayContaining([...FACT_IDS]));
      expect(state.evidence.every(e => e.source === 'physical')).toBe(true);
      expect(new Set(state.claimed).size).toBe(state.claimed.length);
      if (ending === 'bridge') {
        expect(state.memory).toHaveLength(7);
        expect(state.memory.every(m => m.action === 'withhold')).toBe(true);
        expect(state.evidence.every(e => e.leadSource === 'petition')).toBe(true);
        expect(state.pawned).toBe(true);
        expect(state.allies).toHaveLength(0);
        expect(state.silver).toBeGreaterThanOrEqual(0);
      }
      const restored = new GameSession(definition);
      restored.restore(session.serialize());
      expect(restored.state).toEqual(state);
    }
  });

  test('种子事实不由口供决定，角色不知全局，非法来源／价格／身份字段均拒绝', () => {
    const s = start();
    const initial = s.serialize();
    expect(() => s.dispatch({ type: 'search', fact: 'receipt', method: 'listen', mode: 'steady' })).toThrow(AgentValidationError);
    expect(() => s.dispatch({ type: 'petition', npc: 'lan', topic: 'lead' })).toThrow(AgentValidationError);
    const legal = localPlan(s.state, 'lan', 'lead');
    for (const plan of [{ ...legal, fact: 'order' }, { ...legal, price: 4 }, { ...legal, action: 'ally', fact: 'none' }, { ...legal, encounter: 1 }]) {
      expect(() => s.dispatch({ type: 'agent', npc: 'lan', topic: 'lead', method: 'listen', plan: plan as Plan })).toThrow(AgentValidationError);
    }
    expect(() => parsePlan({ ...legal, xp: 1000 })).toThrow(AgentValidationError);
    expect(() => s.preview({ type: 'start', role: 'actor' })).toThrow(AgentValidationError);
    expect(s.serialize()).toBe(initial);
    localEncounter(s, 'lan', 'lead', 'bargain');
    expect(s.state.silver).toBeLessThan(20);
    expect(s.state.evidence).toHaveLength(0);
    expect(() => s.dispatch({ type: 'agent', npc: 'lan', topic: 'lead', method: 'listen', plan: legal })).toThrow(AgentValidationError);
    const opening = smokeCase();
    const observation = opening.request.observation as Record<string, unknown>;
    expect(observation.确知范围).toHaveLength(1);
    expect(JSON.stringify(observation.确知范围)).not.toContain('脉波');
    opening.verify({ encounter: 0, action: 'withhold', fact: 'none', price: 0, line: say });
    opening.verify({ encounter: 0, action: 'testify', fact: 'receipt', price: 0, line: say });
    expect(() => opening.verify({ encounter: 0, action: 'testify', fact: 'ledger', price: 0, line: say })).toThrow(AgentValidationError);
  });

  test('物证固定检定不能换方法刷，复勘有真实代价，报酬与技能只给一次', () => {
    const seed = Array.from({ length: 40 }, (_, i) => i).find(i => die(i, 'search:receipt') <= 2)!;
    const s = start(seed, 'watcher');
    localEncounter(s, 'lan');
    s.dispatch({ type: 'search', fact: 'receipt', method: 'listen', mode: 'steady' });
    expect(s.state.evidence).toHaveLength(0);
    expect(s.state.checks['search:receipt'].pass).toBe(false);
    expect(() => s.dispatch({ type: 'search', fact: 'receipt', method: 'shadow', mode: 'careful' })).toThrow(AgentValidationError);
    const silver = s.state.silver;
    s.dispatch({ type: 'search', fact: 'receipt', method: 'listen', mode: 'recover' });
    expect(s.state.silver).toBe(silver - 4);
    expect(s.state.evidence).toHaveLength(1);
    s.dispatch({ type: 'claim', quest: 'letter' });
    const rewarded = s.serialize();
    expect(() => s.dispatch({ type: 'claim', quest: 'letter' })).toThrow(AgentValidationError);
    expect(() => s.dispatch({ type: 'search', fact: 'receipt', method: 'listen', mode: 'recover' })).toThrow(AgentValidationError);
    expect(s.serialize()).toBe(rewarded);
    s.dispatch({ type: 'learn', skill: 'echo' });
    expect(() => s.dispatch({ type: 'learn', skill: 'echo' })).toThrow(AgentValidationError);
    expect(s.state.xp).toBe(8);
  });

  test('实体路线与潜入风险有效；失败不能重掷，遮灯不会复制通行权', () => {
    const seed = Array.from({ length: 40 }, (_, i) => i).find(i => die(i, 'route:registry:theater') < 6)!;
    const s = localActTwo(seed);
    expect(() => s.dispatch({ type: 'move', to: 'pump', mode: 'walk' })).toThrow(AgentValidationError);
    expect(() => s.dispatch({ type: 'move', to: 'registry', mode: 'walk' })).toThrow(AgentValidationError);
    const silver = s.state.silver;
    s.dispatch({ type: 'move', to: 'registry', mode: 'sneak' });
    expect(s.state.location).toBe('theater');
    expect(s.state.noise).toBe(3);
    expect(() => s.dispatch({ type: 'move', to: 'registry', mode: 'sneak' })).toThrow(AgentValidationError);
    s.dispatch({ type: 'move', to: 'registry', mode: 'bribe' });
    expect(s.state.location).toBe('registry');
    expect(s.state.silver).toBe(silver - 3);
    expect(() => s.dispatch({ type: 'move', to: 'theater', mode: 'bribe' })).toThrow(AgentValidationError);
    localEncounter(s, 'he', 'lead', 'patrol');
    expect(s.state.patrol).toBe(1);
    expect(s.state.noise).toBe(5);
    expect(s.state.leads.ledger).toBeUndefined();
    const quiet = localActTwo(83, 'watcher');
    quiet.dispatch({ type: 'move', to: 'registry', mode: 'sneak' });
    expect(quiet.state.location).toBe('registry');
    expect(quiet.state.noise).toBe(0);
  });

  test('经济无循环复制，换装不赎名，背包成本在收益之前扣除', () => {
    const s = start();
    s.dispatch({ type: 'move', to: 'alley', mode: 'walk' });
    s.dispatch({ type: 'buy', item: 'clerk-pass' });
    expect(() => s.dispatch({ type: 'buy', item: 'clerk-pass' })).toThrow(AgentValidationError);
    s.dispatch({ type: 'pawn' });
    s.dispatch({ type: 'wear', disguise: 'clerk' });
    s.dispatch({ type: 'wear', disguise: 'own' });
    expect(s.state.pawned).toBe(true);
    expect(() => s.dispatch({ type: 'pawn' })).toThrow(AgentValidationError);
    s.dispatch({ type: 'work' }); s.dispatch({ type: 'work' });
    expect(() => s.dispatch({ type: 'work' })).toThrow(AgentValidationError);
    expect(s.state.xp).toBe(0);
    const bag = createInventory(['tea'] as const);
    expect(() => exchangeInventory(bag, { spend: [{ item: 'tea', amount: 1 }], gain: [{ item: 'tea', amount: 1 }] })).toThrow(AgentValidationError);
    const full = createInventory(['tea'] as const, [{ item: 'tea', amount: 5 }]);
    expect(() => exchangeInventory(full, { gain: [{ item: 'tea', amount: 1 }] }, { capacity: 16, stackLimit: 5 })).toThrow(AgentValidationError);
  });

  test('案卷猜测有压力且不重复；篡改回放原子拒绝，重置／导入使旧版本失效', () => {
    const completed = localCampaign('commons');
    const record = JSON.parse(completed.serialize()) as { commands: Command[] };
    const fileIndex = record.commands.findIndex(c => c.type === 'file');
    const s = new GameSession(definition, 83);
    for (const c of record.commands.slice(0, fileIndex)) s.dispatch(c);
    const stress = s.state.stress;
    const wrong: Command = { type: 'file', motive: 'rescue', stamp: 'double', timing: 'before' };
    s.dispatch(wrong);
    expect(s.state.stress).toBe(stress + 3);
    expect(s.state.filed).toBe(false);
    expect(() => s.dispatch(wrong)).toThrow(AgentValidationError);
    s.dispatch({ type: 'file', motive: 'mortgage', stamp: 'broken', timing: 'before' });
    expect(s.state.filed).toBe(false);
    expect(() => s.dispatch({ type: 'finish', ending: 'commons' })).toThrow(AgentValidationError);
    const stable = s.serialize(), rev = s.revision;
    const bad = JSON.parse(stable);
    bad.commands.push({ type: 'claim', quest: 'letter' });
    expect(() => s.restore(JSON.stringify(bad))).toThrow(AgentValidationError);
    expect(s.serialize()).toBe(stable);
    expect(s.revision).toBe(rev);
    s.restore(stable);
    expect(s.revision).toBeGreaterThan(rev);
    const afterRestore = s.revision;
    s.reset();
    expect(s.revision).toBeGreaterThan(afterRestore);
    expect(s.state.phase).toBe('choosing');
    expect(s.moveCount).toBe(0);
    expect(() => s.restore(JSON.stringify({ ...bad, state: completed.state }))).toThrow(AgentValidationError);
    expect(s.state.phase).toBe('choosing');
    expect(Object.keys(SCENES)).toHaveLength(8);
  });
});
