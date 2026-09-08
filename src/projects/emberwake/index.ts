import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { choice, integer } from '../../core/agents/schema';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { observation, planTool, SYSTEM } from './agent';
import { ENEMY_IDS, LOCATIONS, QUEST_IDS } from './data';
import type { QuestId } from './data';
import { definition } from './engine';
import type { Command } from './engine';
import { HELP, bagContent, journalContent, partyContent, render, routeContent, shell, storyContent } from './render';
import type { Selection } from './render';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'emberwake');
  page.root.dataset.workspace = 'true';
  page.root.dataset.reducedMotion = String(context.reducedMotion);
  page.root.setAttribute('aria-labelledby', 'emberwake-title');
  page.root.lang = 'zh-CN';
  page.root.innerHTML = shell();
  const session = new GameSession(definition, 82);
  let busy = false;
  const selection: Selection = { lane: 1, target: 'hook' };
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  const say = (message: string) => { notice.textContent = message; };
  const content = () => { const el = document.createElement('section'); el.className = 'ew-dialog-inner'; return el; };
  const names = { map: '余烬航路', story: '灯下细读', journal: '行旅簿', party: '同行者', bag: '行囊与航技', help: '领航手册', restart: '重新启程' };
  type DialogId = keyof typeof names;
  const panes = new Map<DialogId, { body: HTMLElement; view: ReturnType<typeof createWorkspaceDialog> }>();
  for (const id of Object.keys(names) as DialogId[]) {
    const body = content();
    const view = createWorkspaceDialog(page, { id: `emberwake-${id}`, title: names[id], closeLabel: '关闭', content: [body], className: 'ew-dialog' });
    panes.set(id, { body, view });
  }
  function highlightLane() {
    for (const tile of page.root.querySelectorAll<SVGElement>('[data-pick-lane]')) {
      tile.setAttribute('aria-pressed', String(session.state.phase === 'action' && Number(tile.dataset.pickLane) === selection.lane));
    }
  }
  function refreshPane(id: DialogId) {
    const pane = panes.get(id)!;
    const state = session.state;
    pane.body.innerHTML = id === 'map' ? routeContent(state, busy) : id === 'story' ? storyContent(state) :
      id === 'journal' ? journalContent(state) : id === 'party' ? partyContent(state) : id === 'bag' ? bagContent(state, busy) :
        id === 'help' ? HELP : '<p>重新从停风第七夜出发，当前自动存档会被替换。若想保留本次旅程，请先关闭此页并从“存档”导出。打开本页已经取消待处理的模型计划。</p><button class="ew-primary" data-restart-confirm>确认重新启程</button>';
  }
  function draw() {
    if (page.signal.aborted) return;
    const battle = session.state.battle;
    if (battle) {
      if (Math.abs(selection.lane - battle.heroLane) > 1) selection.lane = battle.heroLane;
      if (!battle.enemies.some(e => e.id === selection.target && e.hp > 0)) selection.target = battle.enemies.find(e => e.hp > 0)?.id ?? 'hook';
    }
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && page.root.contains(active) ?
      [...active.attributes].find(attribute => attribute.name.startsWith('data-')) : undefined;
    render(page.root, session.state, busy, selection);
    highlightLane();
    for (const [id, pane] of panes) if (pane.view.dialog.open && (id === 'bag' || id === 'map')) refreshPane(id);
    if (focusKey && active && !active.isConnected) {
      const candidates = page.root.querySelectorAll<HTMLElement>(`[${focusKey.name}]`);
      const replacement = [...candidates].find(el => el.getAttribute(focusKey.name) === focusKey.value && !el.matches(':disabled'));
      const fallback = page.root.querySelector<HTMLElement>('[data-actions] button:not(:disabled)');
      (replacement ?? (page.root.querySelector('dialog[open]') ? null : fallback))?.focus({ preventScroll: true });
    }
  }
  const agent = createAgentConsole(page, {
    gameId: 'emberwake', host: query(page.root, '[data-agent-host]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; draw(); },
  });
  function dispatch(command: Command) {
    if (busy) { say('代理仍在商议。请等待或使用下方取消按钮。'); return; }
    try {
      session.dispatch(command);
      say(command.type === 'travel' ? '已抵达。可阅读此地故事，或与在场人物商议。' : command.type === 'forecast' ? '战术已公开。现在选择你的回应。' :
        command.type === 'act' ? '本轮已按公开战术结算。详细经过已记入行旅簿。' : '行动已记入行旅簿，资源与进展已保存。');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(/[\u3400-\u9fff]/.test(error.message) && !/[a-zA-Z]/.test(error.message) ? error.message : '这项行动不符合当前规则，进度与资源未改变。');
      draw();
    }
  }
  async function request(quest?: QuestId) {
    if (busy) return;
    const state = session.state;
    if (quest === undefined && state.phase !== 'forecast' || quest !== undefined && state.phase !== 'travel') return;
    const command = (plan: ReturnType<typeof planTool.parse>): Command => quest === undefined ? { type: 'forecast', plan } : { type: 'parley', quest, plan };
    const accepted = await agent.turn({
      label: quest ? '灯下商议' : `战术商议 · 第${state.battle!.round}轮`,
      system: SYSTEM, observation: observation(state, quest), tool: planTool,
      validate(plan) { session.preview(command(plan)); },
      getRevision: () => session.revision,
      commit(plan) { session.dispatch(command(plan)); },
    });
    if (!page.signal.aborted && accepted) say(quest ? '商议已到。阅读任务，再决定你的回答。' : '敌我意图已经锁定。选择站位、目标和技能。');
  }
  function open(id: DialogId) {
    if (id === 'restart') agent.cancel();
    refreshPane(id);
    panes.get(id)!.view.open();
  }
  function pickLane(raw: string) {
    const lane = integer(Number(raw), '战线', 0, 2);
    if (session.state.phase !== 'action') { say('战术公开后才能选择本轮站位。'); return; }
    if (Math.abs(lane - session.state.battle!.heroLane) > 1) { say('一轮只能移动到相邻战线。'); return; }
    selection.lane = lane;
    query<HTMLSelectElement>(page.root, '[data-lane]').value = String(lane);
    highlightLane();
    say(`已选择${['左舷', '中桥', '右舷'][lane]}，尚未执行行动。`);
  }
  page.root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const tile = event.target.closest<SVGElement>('[data-pick-lane]');
    if (tile) { pickLane(tile.dataset.pickLane!); return; }
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.open) { open(choice(data.open, Object.keys(names) as DialogId[], '页面')); return; }
    if (data.parley) { void request(choice(data.parley, QUEST_IDS, '任务')); return; }
    if (data.forecast !== undefined) { void request(); return; }
    if (data.choice) { dispatch({ type: 'choose', branch: choice(data.choice, ['a', 'b'] as const, '抉择') }); return; }
    if (data.travel) {
      dispatch({ type: 'travel', location: choice(data.travel, LOCATIONS, '地点') });
      panes.get('map')!.view.close(); return;
    }
    if (data.actCommand) { dispatch({ type: 'act', action: choice(data.actCommand, ['strike', 'flare', 'guard', 'tonic'] as const, '动作'), ...selection }); return; }
    if (data.camp !== undefined) { dispatch({ type: 'camp' }); return; }
    if (data.buy) { dispatch({ type: 'buy', item: choice(data.buy, ['tonic', 'lens', 'coat'] as const, '商品') }); return; }
    if (data.equip) { dispatch({ type: 'equip', item: choice(data.equip, ['none', 'lens', 'coat'] as const, '装备') }); return; }
    if (data.build) { dispatch({ type: 'build', path: choice(data.build, ['fire', 'shelter'] as const, '航技') }); return; }
    if (data.ending) { dispatch({ type: 'ending', ending: choice(data.ending, ['anchor', 'unbound'] as const, '结局') }); return; }
    if (data.restartConfirm !== undefined) {
      agent.cancel(); session.reset(82); selection.lane = 1; selection.target = 'hook';
      panes.get('restart')!.view.close(); say('新的行旅开始。旧的请求不会再改变这张地图。'); draw();
    }
  }, { signal: page.signal });
  page.root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (event.target.matches('[data-lane]')) pickLane(event.target.value);
    if (event.target.matches('[data-target]')) selection.target = choice(event.target.value, ENEMY_IDS, '目标');
  }, { signal: page.signal });
  page.root.addEventListener('keydown', event => {
    if (!(event.target instanceof Element) || page.root.querySelector('dialog:modal') ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const tile = event.target.closest<SVGElement>('[data-pick-lane]');
    if (tile && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pickLane(tile.dataset.pickLane!); }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(draw));
  createGameNotebook(page, {
    gameId: 'emberwake', session, trigger: query(page.root, '[data-save]'), locale: 'zh-CN',
    beforeRestore: () => agent.cancel(), afterRestore: draw, onNotice: say,
  });
  draw();
  return { destroy: page.destroy };
}
