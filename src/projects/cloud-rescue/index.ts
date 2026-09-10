import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents/console';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { createPhaserStage } from '../../core/phaser/stage';
import type { PhaserStage } from '../../core/phaser/stage';
import { gameKey } from '../../core/phaser/input';
import { COMPANY_SEED, DIRECTIONS, DIRECTION_NAMES, GOALS, ISLANDS } from './data';
import type { Direction, Goal } from './data';
import { definition, legalWindChoices, playerChoices } from './engine';
import type { Command } from './engine';
import { observation, SYSTEM, windTool } from './agent';
import { createCloudScene } from './scene';
import type { CloudView } from './scene';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'cloud-rescue');
  page.root.dataset.workspace = 'true';
  page.root.innerHTML = `
    <header class="cr-header"><div><p>天空营业中 / 五座岛，一间小公司</p><h1>云朵合伙人<span>☁</span></h1></div>
      <nav aria-label="游戏工具"><button data-pause>暂停</button><button data-help>玩法</button><button data-notebook>雨簿</button><button data-restart>重新开业</button></nav>
    </header>
    <div class="cr-workbench">
      <section class="cr-scene-panel" aria-label="浮岛天气实验室">
        <div class="cr-story"><strong data-island></strong><span data-story></span></div>
        <div class="cr-stage" data-project-preview></div>
        <p class="cr-caption" data-lesson></p>
      </section>
      <aside class="cr-desk" aria-label="合伙工作台">
        <div class="cr-order"><p>今日送雨单 <span data-chapter></span></p><h2 data-order></h2><div data-gardens></div></div>
        <div class="cr-ledger"><span>剩余 <b data-moves>12</b> 步</span><span>播种金 <b data-coins>4</b></span><span>小班次 <b data-held>0/3</b></span></div>
        <p class="cr-message" data-message role="status" aria-live="polite"></p>
        <section class="cr-wind" aria-label="与卷卷订风">
          <label>这一班想做什么<select data-goal>${GOALS.map(goal => `<option>${goal}</option>`).join('')}</select></label>
          <button class="cr-primary" data-wind>请卷卷订开工风</button>
          <p data-wind-note></p><button class="cr-catalog-button" data-catalog>查看保苗目录 · 每轮 3 风</button>
        </section>
        <section class="cr-player" aria-label="移动和播种">
          <div class="cr-arrows" aria-label="滑动云朵">${DIRECTIONS.map(direction => `<button data-move="${direction}" aria-label="向${DIRECTION_NAMES[direction]}吹风">${({ up: '↑', left: '←', down: '↓', right: '→' })[direction]}</button>`).join('')}</div>
          <p class="cr-keyhint">方向键移动 · 点棋盘选格</p>
          <div class="cr-seeds"><button data-seed="1">播 1 水 · 1 金</button><button data-seed="2">播 2 水 · 2 金</button></div>
          <button data-prune>修剪老云 · 2 金 / 每岛一次</button>
          <p data-selected>已选 1 格 · 顶排是苗床</p>
        </section>
        <div class="cr-end" hidden><h2 data-result></h2><p data-stars></p><button class="cr-primary" data-next>前往下一岛</button><button data-retry>重试本岛</button></div>
        <div class="cr-connection" data-console></div>
      </aside>
    </div>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => query<T>(page.root, selector);
  const session = new GameSession(definition, COMPANY_SEED);
  let stage: PhaserStage<CloudView> | undefined, busy = false, selected = 0, paused = false;
  const goal = el<HTMLSelectElement>('[data-goal]');
  const helpContent = document.createElement('section');
  helpContent.innerHTML = `<ol><li>方向键或箭头滑动；同水量只合并一次。2 水浇 1 剂，4 水浇 2 剂，8 水不下雨。</li><li>把云送到棋盘底部的绿叶出口。每个花园都浇够才算完成；多余雨不会存起来。</li><li>每三个动作休息订风。顶排播种花 1/2 金；老云可花 2 金修剪一次。岩石挡路，雷格使 4 水云变 8。</li></ol>
    <p>只有「请卷卷」会请求真实模型；每岛开工也必须订风。失败、取消、过期不会扣步。保苗目录只列出本地搜索认证仍有通关路径的播云、侧风和修剪；卷卷自己选择，不能发奖励。</p>
    <p>点棋盘选择格子；选择与目标不记为世界动作。P 暂停 / 继续。没有效果的方向不扣步。滑动、播种和修剪各花一步；用完步数、风道完全堵住或已无可认证保苗风路会失单。</p>
    <p>半数步内、不用手动修剪得三星；余至少三步得两星；送齐就至少一星。每岛只结算一次。雨簿自动保存合法指令，可原生导出、导入和回放。</p>
    <button data-close-day>本岛收工，重新试试</button>`;
  createWorkspaceDialog(page, { id: 'cloud-rescue-help', title: '三条天气公司守则', triggers: [el('[data-help]')], content: [helpContent], closeLabel: '关闭' });
  const catalogContent = document.createElement('section');
  createWorkspaceDialog(page, { id: 'cloud-rescue-catalog', title: '卷卷的保苗目录', triggers: [el('[data-catalog]')], content: [catalogContent], closeLabel: '关闭' });
  const agent = createAgentConsole(page, {
    gameId: 'cloud-rescue', host: el('[data-console]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; render(); },
  });
  const notice = (message: string) => { el('[data-message]').textContent = message; };
  function render() {
    const s = session.state, level = ISLANDS[s.island], canPlay = s.phase === 'play' && !busy && !paused;
    const waiting = s.phase === 'opening' || s.phase === 'wind', ended = ['won', 'lost', 'festival'].includes(s.phase);
    page.root.dataset.phase = s.phase;
    page.root.dataset.revision = String(session.revision);
    el('[data-island]').textContent = `${s.island + 1} / 5 · ${level.name}`;
    el('[data-story]').textContent = level.subtitle;
    el('[data-lesson]').textContent = level.lesson;
    el('[data-chapter]').textContent = `${s.island + 1} / 5`;
    el('[data-order]').textContent = ended ? (s.phase === 'lost' ? '今天，歇一歇' : '雨有了归处') : `让 ${level.gardens.length} 座花园开花`;
    el('[data-gardens]').innerHTML = level.gardens.map((garden, i) => `<span class="${s.delivered[i] === garden.need ? 'cr-grown' : ''}">${garden.name} <b>${s.delivered[i]}/${garden.need}</b></span>`).join('');
    el('[data-moves]').textContent = String(s.moves);
    el('[data-coins]').textContent = String(s.coins);
    el('[data-held]').textContent = `${s.held}/3`;
    el('[data-message]').textContent = ended ? s.reason : busy ? '卷卷正在向模型订风；你的步数原封不动。' : s.intention;
    const wind = el<HTMLButtonElement>('[data-wind]');
    wind.disabled = !waiting || busy || paused;
    wind.textContent = busy ? '订风中…' : s.phase === 'opening' ? '请卷卷订开工风' : '请卷卷执行一阵风';
    goal.disabled = !waiting || busy || paused;
    el('[data-wind-note]').textContent = waiting ? '真实模型必需 · 失败不扣步 · 无离线替身' : `已付 ${s.windSpent}/3 风 · 再做 ${3 - s.held} 步后商量`;
    const legal = playerChoices(s);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-move]')) {
      button.disabled = !canPlay || !legal.some(c => c.type === 'slide' && c.direction === button.dataset.move);
    }
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-seed]')) {
      button.disabled = !canPlay || !legal.some(c => c.type === 'seed' && c.cell === selected && c.water === Number(button.dataset.seed));
    }
    el<HTMLButtonElement>('[data-prune]').disabled = !canPlay || !legal.some(c => c.type === 'prune' && c.cell === selected);
    el('[data-selected]').textContent = `已选 ${selected + 1} 格 · ${s.board[selected] ? `${s.board[selected]} 水云` : '空格'}${selected < 4 ? ' / 苗床' : ''}`;
    el<HTMLElement>('.cr-wind').hidden = ended;
    el<HTMLElement>('.cr-player').hidden = ended;
    el<HTMLElement>('.cr-end').hidden = !ended;
    el('[data-result]').textContent = s.phase === 'festival' ? '百花开业祭 · 圆满！' : s.phase === 'won' ? '本岛订单完成' : '失单也可以重来';
    el('[data-stars]').textContent = s.phase === 'lost' ? '本岛没有奖励；保留此前完成的星章。' : `本岛 ${'★'.repeat(s.ratings[s.island] ?? 0)} · 总星章 ${s.ratings.reduce((a, b) => a + b, 0)} / 15`;
    el<HTMLButtonElement>('[data-next]').hidden = s.phase !== 'won';
    el<HTMLButtonElement>('[data-retry]').hidden = s.phase !== 'lost';
    const choices = legalWindChoices(s);
    catalogContent.innerHTML = `<p>本轮预算 <strong>3 风</strong>；一次恰选一个。编号是零起始目录 ID，格号是玩家看到的 1–16。</p>
      <p>先选共同目标，再请卷卷决定；不会自动行动。</p><ul>${choices.map(action => `<li>#${action.id} · ${escapeMarkup(action.label)}</li>`).join('') || '<li>做满三步，下一轮目录才开放。</li>'}</ul>
      <p>认证保证存在玩家通关路线，不保证随意移动都能获胜。每次订风前按当前棋盘重算。</p>`;
    stage?.view.draw(s); stage?.view.select(selected);
    if (stage) {
      const metrics = stage.metrics();
      const host = el('[data-project-preview]');
      host.dataset.objects = String(metrics.objects); host.dataset.textures = String(metrics.textures); host.dataset.tweens = String(metrics.tweens);
    }
  }
  function dispatch(command: Command) {
    if (busy || !stage?.canInteract()) return;
    try { session.dispatch(command); } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(error.message);
    }
  }
  function select(cell: number) {
    if (!stage?.canInteract() || busy) return;
    selected = cell; render();
  }
  function setPaused(value: boolean) {
    paused = value; stage?.setPaused(value);
    el('[data-pause]').textContent = value ? '继续' : '暂停';
    render();
  }
  function reset() {
    agent.cancel('重新开业，旧风单已取消。');
    selected = 0; goal.value = GOALS[0]; session.reset(COMPANY_SEED); setPaused(false);
  }
  el('[data-pause]').addEventListener('click', () => setPaused(!paused), { signal: page.signal });
  el('[data-restart]').addEventListener('click', reset, { signal: page.signal });
  el('[data-next]').addEventListener('click', () => { agent.cancel('新岛尚未订风。'); dispatch({ type: 'next' }); }, { signal: page.signal });
  el('[data-retry]').addEventListener('click', () => { agent.cancel('重试本岛，旧风单已取消。'); dispatch({ type: 'retry' }); }, { signal: page.signal });
  query(helpContent, '[data-close-day]').addEventListener('click', () => {
    agent.cancel('今天收工，风单已取消。');
    if (['play', 'wind'].includes(session.state.phase)) session.dispatch({ type: 'close' });
    query<HTMLDialogElement>(page.root, '#cloud-rescue-help').close();
  }, { signal: page.signal });
  el('[data-wind]').addEventListener('click', async () => {
    if (!stage?.canInteract() || busy || !['opening', 'wind'].includes(session.state.phase)) return;
    const selectedGoal = goal.value as Goal;
    await agent.turn({
      label: `${ISLANDS[session.state.island].name} · 第 ${session.state.turn + 1} 阵风`,
      system: SYSTEM, observation: observation(session.state, selectedGoal), tool: windTool,
      validate: plan => { session.preview({ type: 'wind', plan, goal: selectedGoal }); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'wind', plan, goal: selectedGoal }); },
    });
  }, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-move]')) {
    button.addEventListener('click', () => dispatch({ type: 'slide', direction: button.dataset.move as Direction }), { signal: page.signal });
  }
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-seed]')) {
    button.addEventListener('click', () => dispatch({ type: 'seed', cell: selected, water: Number(button.dataset.seed) as 1 | 2 }), { signal: page.signal });
  }
  el('[data-prune]').addEventListener('click', () => dispatch({ type: 'prune', cell: selected }), { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'p' && gameKey(event, page.root, !document.hidden) && !busy) {
      event.preventDefault(); setPaused(!paused); return;
    }
    if (!gameKey(event, page.root, Boolean(stage?.canInteract())) || busy) return;
    const direction = ({ ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' } as const)[event.key as 'ArrowUp'];
    if (direction) { event.preventDefault(); dispatch({ type: 'slide', direction }); }
  }, { signal: page.signal });
  stage = await createPhaserStage(page, { host: el('[data-project-preview]'), label: '云朵合伙人：四乘四浮岛送雨棋盘', width: 960, height: 640, background: '#f5edce',
    create: (scene, runtime) => createCloudScene(scene, runtime, select),
  });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, {
    gameId: 'cloud-rescue', session, trigger: el('[data-notebook]'), locale: 'zh-CN',
    beforeRestore() { agent.cancel('导入雨簿，旧风单已取消。'); },
    afterRestore() { selected = 0; goal.value = session.state.goal; render(); },
    onNotice: notice,
  });
  render();
  return { destroy: page.destroy, reset, setPaused };
}
