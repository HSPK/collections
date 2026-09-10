import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { createGameNotebook } from '../../core/games/notebook';
import { createProjectPage, query } from '../../core/page';
import { createPhaserStage } from '../../core/phaser/stage';
import type { PhaserStage } from '../../core/phaser/stage';
import { gameKey } from '../../core/phaser/input';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { guardRequest } from './agent';
import { ALARM_LIMIT, COLS, ROOMS, laneLabel, sweepLine } from './data';
import { createSession, exitOpen } from './engine';
import type { Command } from './engine';
import { createMuseumScene } from './scene';
import type { MuseumView } from './scene';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'cat-shift');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  const session = createSession();
  let busy = false, swap = false, explicitlyPaused = false;
  let stage: PhaserStage<MuseumView> | undefined;
  root.innerHTML = `<div class="cs-shell">
    <header class="cs-header">
      <div class="cs-brand"><span class="cs-seal" aria-hidden="true">借</span><div><p class="cs-eyebrow">纸博物馆 · 桌面键鼠</p><h1>猫咪借位</h1></div></div>
      <p class="cs-tagline">馆藏不动。<br>只是换个位置。</p>
      <nav aria-label="游戏工具">
        <button type="button" data-pause>暂停</button><button type="button" data-retry>重试本室</button>
        <button type="button" data-new>新一夜</button><button type="button" data-help>玩法</button>
        <button type="button" data-notebook>手账</button>
      </nav>
    </header>
    <ol class="cs-room-strip" aria-label="五室夜游进度">${ROOMS.map((room, i) =>
      `<li data-room-mark="${i}"><span>${String(i + 1).padStart(2, '0')}</span><strong>${room.title}</strong><small data-room-stars="${i}">未解锁</small></li>`).join('')}</ol>
    <main class="cs-main">
      <section class="cs-play" aria-label="猫的纸馆">
        <div class="cs-room-heading"><div><span class="cs-eyebrow" data-room-number></span><h2 data-room-title></h2></div>
          <div class="cs-resources"><span>脚步 <b data-moves></b></span><span>警报 <b data-alarm></b></span><span>回头 <b data-retries></b></span></div></div>
        <div class="cs-stage" data-stage data-project-preview></div>
        <div class="cs-controls">
          <button type="button" class="cs-swap" data-swap aria-pressed="false">⇄ 借位 <kbd>Shift</kbd></button>
          <button type="button" data-wait>蹲一拍 <kbd>空格</kbd></button>
          <p>点相邻地板 / 方向键 / WASD<br><span>借位后点相邻展品，拾取自动完成</span></p>
        </div>
      </section>
      <aside class="cs-sidebar" aria-label="本室提示">
        <div class="cs-night-number"><span>闭馆后的</span><b>一小场<br>借月行动</b><i aria-hidden="true"></i></div>
        <p class="cs-story">团团想借走馆藏月牙沙丁鱼。趁天亮前穿过五间展室，把展品借个位置，带着月光溜出后门。</p>
        <div class="cs-goal"><span class="cs-eyebrow">本室小窍门</span><p data-lesson></p><strong data-goal></strong></div>
        <section class="cs-patrol"><h3>巡夜员的脚印</h3><p data-intention>还没落定。猫先不用动。</p><ol data-forecast aria-label="接下来四步扫灯"></ol></section>
        <button type="button" class="cs-primary" data-primary>请巡夜员落脚印</button>
        <p class="cs-call-note" data-call-note>每室只请一次 · 不会边走边改巡逻</p>
      </aside>
    </main>
    <footer class="cs-footer"><p data-notice role="status" aria-live="polite"></p><div data-connection></div></footer>
  </div>`;
  const notice = query<HTMLElement>(root, '[data-notice]');
  const primary = query<HTMLButtonElement>(root, '[data-primary]');
  const retry = query<HTMLButtonElement>(root, '[data-retry]');
  const swapButton = query<HTMLButtonElement>(root, '[data-swap]');
  const waitButton = query<HTMLButtonElement>(root, '[data-wait]');
  const pauseButton = query<HTMLButtonElement>(root, '[data-pause]');
  const help = document.createElement('section');
  help.innerHTML = `<ol class="cs-help-rules">
    <li><strong>走一格，灯扫一次。</strong>点击相邻地板或按方向键 / WASD。红框是下一次扫灯；空格或点猫可蹲一拍。没有现实倒计时。</li>
    <li><strong>借个位置。</strong>点「借位」或按 Shift 切换，再点相邻展品 / 按方向键交换。雕塑挡光、压板开门；纸猫挡一次光便消失。</li>
    <li><strong>拿签，再溜走。</strong>前四室拿月牙签，最后一室拿沙丁鱼，再去箭头出口。警报满四或步数用尽就失手；全夜有两次回头，重试沿用已公布脚印。</li>
    </ol><p>过关得一星；零警报再一星；不超过本室标注的巧步数再一星。每室只结算一次。五室打通后开启新一夜，星章与解锁从头挣。</p>
    <p>巡夜员由你配置的模型扮演，每室按公开旧路线选一种真实巡逻。连接失败或取消不扣资源，不提供假巡夜员。模型设置与行动记录在下方；手账自动保存，可导入导出。</p>
    <p data-metrics></p>`;
  const helpDialog = createWorkspaceDialog(page, { id: 'cat-shift-help', title: '三条猫规矩', content: [help],
    className: 'cs-dialog', closeLabel: '关闭' });
  const resetContent = document.createElement('section');
  resetContent.innerHTML = '<p>本夜的星章、展室与回头次数会重新开始。需要留念？先用手账导出。模型连接不会改变。</p><button type="button" data-confirm-new>开始新一夜</button>';
  const resetDialog = createWorkspaceDialog(page, { id: 'cat-shift-new', title: '换一夜，再借月亮', content: [resetContent],
    triggers: [query(root, '[data-new]')], className: 'cs-dialog', closeLabel: '不换了' });
  const agent = createAgentConsole(page, {
    gameId: 'cat-shift', host: query(root, '[data-connection]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; render(); },
  });
  function report(message: string) { notice.textContent = message; }
  function render() {
    if (signal.aborted) return;
    const state = session.state, room = ROOMS[state.room]!;
    root.dataset.phase = state.phase;
    root.dataset.room = String(state.room);
    root.dataset.turn = String(state.turn);
    root.dataset.alarm = String(state.alarm);
    root.dataset.cat = String(state.cat);
    root.dataset.commands = String(state.commands);
    root.dataset.stars = state.stars.join(',');
    root.dataset.retries = String(state.retries);
    query(root, '[data-room-number]').textContent = `第 ${state.room + 1} / 5 室 · 巧步 ${room.par} 步`;
    query(root, '[data-room-title]').textContent = room.title;
    query(root, '[data-moves]').textContent = `${Math.max(0, room.moves - state.turn)} / ${room.moves}`;
    query(root, '[data-alarm]').textContent = `${Math.min(ALARM_LIMIT, state.alarm)} / ${ALARM_LIMIT}`;
    query(root, '[data-retries]').textContent = `${state.retries} 次`;
    query(root, '[data-lesson]').textContent = room.lesson;
    query(root, '[data-goal]').textContent = state.phase === 'won' ? `五室通关 · ${state.stars.reduce((a, b) => a + b, 0)} / 15 星` :
      `${state.picked ? '✓' : '○'} ${room.item}　${exitOpen(state) ? '↗ 出口已开' : '◎ 压板待占'}`;
    query(root, '[data-intention]').textContent = state.plan ? `${laneLabel(state.plan.lane)} · ${state.plan.intention}` : '还没落定。猫先不用动。';
    const forecastHost = query(root, '[data-forecast]');
    forecastHost.replaceChildren();
    if (state.plan) for (let i = 0; i < 4; i++) {
      const item = document.createElement('li');
      item.textContent = `${i === 0 ? '下一步' : `再 ${i} 步`}　${sweepLine(state.plan, state.turn + i) + 1}${state.plan.lane === 'columns' ? '列 ↓' : '行 ←'}`;
      forecastHost.append(item);
    }
    for (let i = 0; i < ROOMS.length; i++) {
      const mark = query<HTMLElement>(root, `[data-room-mark="${i}"]`);
      mark.dataset.current = String(i === state.room);
      mark.dataset.unlocked = String(i <= state.room || i === state.stars.length);
      mark.setAttribute('aria-current', i === state.room ? 'step' : 'false');
      query(root, `[data-room-stars="${i}"]`).textContent = state.stars[i] ? '★'.repeat(state.stars[i]!) :
        i === state.room ? '正在借月' : i <= state.stars.length ? '已解锁' : '未解锁';
    }
    const canPlay = state.phase === 'playing' && !busy && !explicitlyPaused;
    swapButton.disabled = waitButton.disabled = !canPlay;
    swapButton.setAttribute('aria-pressed', String(swap));
    retry.disabled = !busy && !((state.phase === 'playing' || state.phase === 'lost') && state.turn > 0 && state.retries > 0);
    retry.textContent = busy ? '取消本次落脚印' : `重试本室${state.retries === 0 ? '（已用完）' : ''}`;
    primary.disabled = busy || explicitlyPaused || !['briefing', 'cleared', 'won', 'lost'].includes(state.phase);
    primary.textContent = busy ? '巡夜员正在落脚印…' : state.phase === 'cleared' ? '进入下一室 →' :
      state.phase === 'won' ? '再借一夜 ↗' : state.phase === 'lost' ? state.retries > 0 ? '回头，再试本室' : '开启新一夜' :
        state.phase === 'playing' ? '脚印已落定 · 轮到猫' : '请巡夜员落脚印';
    query(root, '[data-call-note]').textContent = state.phase === 'lost' ? '失手不丢已得星章 · 不能重复领奖' :
      state.plan ? '红格随展品遮挡变化 · 脚印不变' : '每室只请一次 · 不会边走边改巡逻';
    pauseButton.textContent = explicitlyPaused ? '继续' : '暂停';
    stage?.view.draw(state, swap);
    report(explicitlyPaused ? '猫打个盹。点击「继续」回到纸馆。' : state.notice);
  }
  function dispatch(command: Command): boolean {
    try {
      session.dispatch(command);
      return true;
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      report(error.message);
      return false;
    }
  }
  function act(cell: number) {
    if (!stage?.canInteract() || busy) return;
    const command: Command = cell === session.state.cat ? { type: 'wait' } :
      { type: swap ? 'swap' : 'step', cell };
    const accepted = dispatch(command);
    stage.view.feedback(cell, accepted);
  }
  function toggleSwap() {
    if (!stage?.canInteract() || busy || session.state.phase !== 'playing') return;
    swap = !swap; render();
  }
  function setPaused(paused: boolean) {
    explicitlyPaused = paused;
    stage?.setPaused(paused);
    render();
  }
  function newRun() {
    agent.cancel('新一夜开始，旧脚印请求已取消。');
    swap = false;
    explicitlyPaused = false;
    stage?.setPaused(false);
    session.reset((session.seed + 1) >>> 0);
  }
  function retryRoom() {
    if (busy) { agent.cancel('已取消落脚印，没有消耗脚步或回头次数。'); return; }
    if (!stage?.canInteract()) return;
    agent.cancel();
    swap = false;
    dispatch({ type: 'retry' });
  }
  try {
    stage = await createPhaserStage(page, {
      host: query(root, '[data-stage]'), label: '猫咪借位纸馆棋盘：点击相邻地板行走，Shift 切换借位',
      width: 960, height: 640, background: '#e6d6b4', report,
      create(scene, runtime) { return createMuseumScene(scene, runtime, act); },
    });
    page.onCleanup(session.subscribe(render));
    primary.addEventListener('click', async () => {
      if (!stage?.canInteract() || busy) return;
      if (session.state.phase === 'briefing') {
        await agent.turn({
          ...guardRequest(session.state, plan => { session.preview({ type: 'guard', plan }); }),
          label: '巡夜员', getRevision: () => session.revision,
          commit: plan => { session.dispatch({ type: 'guard', plan }); },
        });
      } else if (session.state.phase === 'cleared') { swap = false; dispatch({ type: 'next' }); }
      else if (session.state.phase === 'lost' && session.state.retries > 0) retryRoom();
      else if (session.state.phase === 'won' || session.state.phase === 'lost') resetDialog.open();
    }, { signal });
    swapButton.addEventListener('click', toggleSwap, { signal });
    waitButton.addEventListener('click', () => act(session.state.cat), { signal });
    pauseButton.addEventListener('click', () => setPaused(!explicitlyPaused), { signal });
    retry.addEventListener('click', retryRoom, { signal });
    query(root, '[data-help]').addEventListener('click', () => {
      const metrics = stage!.metrics();
      query(help, '[data-metrics]').textContent = `纸馆画面：Phaser 4.2.1 · ${metrics.renderer === 'webgl' ? '显卡画布' : '二维画布'} · ${metrics.objects} 个场景对象 · ${metrics.textures} 张纹理 · ${metrics.tweens} 个动画`;
      const metricsHost = query<HTMLElement>(help, '[data-metrics]');
      metricsHost.dataset.objects = String(metrics.objects);
      metricsHost.dataset.textures = String(metrics.textures);
      metricsHost.dataset.tweens = String(metrics.tweens);
      helpDialog.open();
    }, { signal });
    query(resetContent, '[data-confirm-new]').addEventListener('click', () => { newRun(); resetDialog.close(); }, { signal });
    document.addEventListener('keydown', event => {
      if (!gameKey(event, root, stage!.canInteract()) || busy) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && event.target instanceof HTMLElement && event.target.closest('button')) return;
      if (key === 'shift') { event.preventDefault(); toggleSwap(); return; }
      const delta = ({ arrowup: -COLS, w: -COLS, arrowdown: COLS, s: COLS, arrowleft: -1, a: -1, arrowright: 1, d: 1 } as Record<string, number>)[key];
      if (delta !== undefined || key === ' ') {
        event.preventDefault();
        act(session.state.cat + (delta ?? 0));
      }
    }, { signal });
    createGameNotebook(page, { gameId: 'cat-shift', locale: 'zh-CN', session, trigger: query(root, '[data-notebook]'),
      beforeRestore() { agent.cancel('导入手账，旧请求已取消。'); swap = false; },
      afterRestore: render, onNotice: report,
    });
    render();
    return { destroy: page.destroy, setPaused, reset: newRun };
  } catch (error) {
    page.destroy();
    throw error;
  }
}
