import './style.css';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { gameKey } from '../../core/phaser/input';
import type { PhaserStage } from '../../core/phaser/stage';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CHAPTERS, LANE_NAMES, NAMES, WAVE_TICKS, schedule } from './data';
import type { Lane } from './data';
import { definition, medal } from './engine';
import type { Command } from './engine';
import { requestFor } from './agent';
import { createWatchScene } from './scene';
import type { WatchView } from './scene';
import type { Round } from './simulation';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'paper-watch');
  page.root.dataset.workspace = 'true';
  page.root.lang = 'zh-CN';
  const session = new GameSession(definition, 91);
  let stage: PhaserStage<WatchView> | undefined, live: Round | null = null;
  let busy = false, manualPause = false, notice = '', paused = false;
  page.root.innerHTML = `
    <header class="pw-header"><div class="pw-wordmark"><span class="pw-seal">夜</span><div><h1>纸上守夜</h1><span>一座纸城，三盏折灯。</span></div></div>
      <nav aria-label="守夜工具"><button data-pause>暂停 <kbd>P</kbd></button><button data-help>玩法</button><button data-save>夜巡手记</button><button data-reset>重新守夜</button></nav></header>
    <section class="pw-hud" aria-label="夜巡状态">
      <div><span data-chapter>一更 · 瓦上有声</span><strong data-phase>等候墨影编排</strong></div>
      <div><span>纸城余折</span><strong data-lives>◆ ◆ ◆</strong></div>
      <div><span>化墨得星</span><strong data-score>0</strong></div>
      <div><span>连锁 / 余时</span><strong><b data-combo>0</b> / <b data-time>24.0</b> 秒</strong></div>
    </section>
    <main class="pw-theatre" data-project-preview>
      <div class="pw-stage" data-stage></div>
      <section class="pw-curtain" data-curtain aria-label="更次安排">
        <span class="pw-kicker" data-kicker>今晚，你是守夜人</span><h2 data-title>别让墨影把城折走。</h2>
        <p data-message>书页合拢时，纸城就醒了。淘气墨影想偷走三道城折；用祖母留下的三盏灯，把它们照成星屑，守到天亮。</p>
        <p class="pw-preview" data-preview>模型只在更次之间编排。连接成功后先看预告，再亲手开更；等待不扣时间。</p>
        <div class="pw-upgrades" data-upgrades hidden><button data-upgrade="reserve"><strong>深折灯肚</strong><span>每灯容量 +20<br>多存一轮应急光</span></button><button data-upgrade="breeze"><strong>开一道风褶</strong><span>每闲刻散热 +1<br>更快从连闪恢复</span></button></div>
        <button class="pw-primary" data-main disabled>正在展开纸城…</button>
        <span class="pw-model-note" data-model-note>真实模型编排 · 本地闪光与计分 · 无离线指挥替身</span>
      </section>
      <div class="pw-pause-veil" data-pause-veil hidden><strong>灯火暂歇</strong><span>时间已冻结 · 关闭弹窗或继续守夜</span></div>
      <div class="pw-lamp-hud" aria-label="三盏折灯">${LANE_NAMES.map((name, lane) => `<button data-lane="${lane}" aria-label="选择${name}"><span><kbd>${lane + 1}</kbd> ${name} <b data-energy="${lane}">100</b></span><meter data-meter="${lane}" min="0" max="100" value="100" aria-label="${name}能量"></meter><small data-heat="${lane}">热度 0 / 100</small></button>`).join('')}</div>
    </main>
    <section class="pw-instructions" aria-label="三句玩法"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 选灯，或点画面中的巷道。</span><span><kbd>空格</kbd> 闪一下；墨影金边时才照得散。</span><span>别长按！闲灯回能散热，墨冠要照两次。</span></section>
    <footer class="pw-footer"><div data-agent></div><p data-notice role="status"></p></footer>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => query<T>(page.root, selector);
  const help = document.createElement('section');
  help.innerHTML = `<p><strong>① 1 / 2 / 3 选灯，或点击巷道选灯并闪光。</strong><br>② 按空格照金边墨影；双层墨冠隔一拍再照一次。<br>③ 闲灯回能散热，别一直长按；P 暂停。</p>
    <p>每更24秒，共五更；第四、五更是墨冠上下阕。灰蓝轮廓尚未就绪，金边轮廓可照散。换巷客的箭头提前告诉你最终巷道。漏过一只失去一道城折，三折用尽便结束。</p>
    <p>闪光消耗28能量、增加32热度，间隔至少0.4秒；闲刻回能2、散热至少2。超过68热不能再闪。照散得100星，连锁每级加10（最多200），最后0.8至0.4秒照散再加20；空闪与漏影断连。</p>
    <p>每更之间选一次灯肚扩容或加快散热，再请真实模型重新编排。预告公开且不再改变，准备好了才计时。无伤通关且空闪不超过5次得金灯；至少余两折得银灯。</p>
    <p>手记自动保存已完成各更与已接受的编排。刷新或导入时，未完成的一更从准备页重新开始（不保存半更按键），以前的得分与城折仍保留。导入由固定步长引擎重算，不相信文件中的分数。暂停、隐藏页面或任一原生弹窗会冻结时钟并释放长按。</p>
    <p>仅供桌面键盘与鼠标。无默认音频。减少动态只停装饰，不改变玩法。舞台预算：164显示对象、6本地纹理、16装饰补间；墨影池12、星屑池36。</p>`;
  createWorkspaceDialog(page, { id: 'paper-watch-help', title: '守夜人的三句话', content: [help], triggers: [el('[data-help]')], closeLabel: '关闭' });
  const agent = createAgentConsole(page, {
    gameId: 'paper-watch', host: el('[data-agent]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(65536),
    onBusyChange(value) { busy = value; render(); },
  });
  function running() { return live !== null && !live.terminal; }
  function report(message: string) { notice = message; el('[data-notice]').textContent = message; }
  function act(command: Command) {
    try { session.dispatch(command); }
    catch (error) { if (!(error instanceof AgentValidationError)) throw error; report(error.message); }
  }
  function reset() {
    agent.cancel(); stage?.view.cancel(); pause(false);
    notice = ''; session.reset(); render();
  }
  function pause(value: boolean) {
    manualPause = value; stage?.setPaused(value);
    el('[data-pause]').innerHTML = `${value ? '继续' : '暂停'} <kbd>P</kbd>`;
    el('[data-pause]').setAttribute('aria-pressed', String(value));
  }
  function renderLive() {
    const s = session.state;
    const r = live;
    page.root.dataset.tick = String(r?.tick ?? 0);
    page.root.dataset.selected = String(r?.lane ?? 1);
    page.root.dataset.pulses = String(r?.stats.pulses ?? 0);
    page.root.dataset.combo = String(r?.combo ?? 0);
    el('[data-lives]').textContent = '◆ '.repeat(r?.lives ?? s.lives).trim() || '纸城合拢';
    el('[data-score]').textContent = String(s.score + (running() ? r?.score ?? 0 : 0));
    el('[data-combo]').textContent = String(r?.combo ?? 0);
    el('[data-time]').textContent = ((WAVE_TICKS - (r?.tick ?? 0)) / 20).toFixed(1);
    for (let i = 0; i < 3; i++) {
      const lamp = r?.lamps[i], capacity = r?.capacity ?? 100 + s.upgrades.filter(u => u === 'reserve').length * 20;
      el(`[data-energy="${i}"]`).textContent = String(lamp?.energy ?? capacity);
      el(`[data-heat="${i}"]`).textContent = `热度 ${lamp?.heat ?? 0} / 100`;
      const meter = el<HTMLMeterElement>(`[data-meter="${i}"]`);
      meter.max = capacity; meter.value = lamp?.energy ?? capacity;
      const button = el<HTMLButtonElement>(`[data-lane="${i}"]`);
      button.dataset.selected = String(i === (r?.lane ?? 1)); button.disabled = !running() || paused;
    }
  }
  function render() {
    const s = session.state, active = running(), c = CHAPTERS[s.wave];
    page.root.dataset.phase = active ? 'running' : s.phase;
    page.root.dataset.wave = String(s.wave + 1);
    page.root.dataset.score = String(s.score);
    page.root.dataset.paused = String(paused);
    el('[data-chapter]').textContent = c.title;
    el('[data-phase]').textContent = paused ? '已暂停 · 时间冻结' : active ? '守夜中 · 照金边' : busy ? '墨影正在编排 · 不计时' : { awaiting: '等候墨影编排', prepared: '预告已定 · 等你开更', upgrade: '更歇 · 选一次折灯改造', won: '天亮了 · 纸城仍在', lost: '三折尽失 · 可重新守夜' }[s.phase];
    el('[data-curtain]').hidden = active;
    el('[data-pause-veil]').hidden = !paused || !active;
    el('[data-upgrades]').hidden = s.phase !== 'upgrade';
    const main = el<HTMLButtonElement>('[data-main]');
    main.hidden = s.phase === 'upgrade';
    main.disabled = !stage || busy || paused;
    main.textContent = busy ? '等待墨影编排…' : s.phase === 'prepared' ? '准备好了 · 开更' : s.phase === 'won' || s.phase === 'lost' ? '再守一夜' : s.wave === 0 ? '请墨影编排第一更' : `请墨影编排第${s.wave + 1}更`;
    el('[data-model-note]').hidden = s.phase === 'won' || s.phase === 'lost' || s.phase === 'upgrade';
    el('[data-kicker]').textContent = s.phase === 'won' ? medal(s) : s.phase === 'lost' ? '残星也值得收藏' : s.phase === 'prepared' ? '墨影已落笔 · 不再临场改道' : s.phase === 'upgrade' ? '一更守成 · 二选一' : `今晚，第${s.wave + 1}更`;
    el('[data-title]').textContent = s.phase === 'won' ? '你把黎明折回来了。' : s.phase === 'lost' ? '纸城轻轻合拢了。' : s.phase === 'upgrade' ? '给灯添一道新折。' : s.phase === 'prepared' ? c.title : s.wave === 0 ? '别让墨影把城折走。' : c.title;
    el('[data-message]').textContent = s.phase === 'won' ? `五更长街化出 ${s.score} 颗星。余下 ${s.lives} 道城折，今夜的每一次闪光都记在手记里。` : s.phase === 'lost' ? `你留下了 ${s.score} 颗星。金边再照，双折补照；下一夜，留一盏凉灯给自己。` : s.phase === 'upgrade' ? `这一更化墨 ${s.history.at(-1)?.cleared} 只，得到 ${s.history.at(-1)?.score} 星。扩容更能存光；风褶更能连闪。` : s.phase === 'prepared' && s.plan ? s.plan.intention : s.wave === 0 ? '书页合拢时，纸城就醒了。淘气墨影想偷走三道城折；用祖母留下的三盏灯，把它们照成星屑，守到天亮。' : '三盏灯已经添好灯芯。指挥只看上一更的公开表现；这一更的按键，只有你来决定。';
    if (s.phase === 'prepared' && s.plan) {
      const counts = [0, 0, 0];
      for (const spawn of schedule(s.plan, s.wave)) counts[spawn.lane]++;
      el('[data-preview]').textContent = `${LANE_NAMES.map((name, i) => `${name} ${counts[i]}只`).join(' · ')}\n每${s.plan.spacing / 20}秒一只 · ${NAMES[s.plan.archetype]}${s.plan.feint && s.plan.archetype === 'mask' ? '：箭头预告换巷' : ''}${s.wave >= 3 ? ' · 墨冠双折需两闪' : ''}\n先等金边再照；灰影出现不必急。`;
    } else el('[data-preview]').textContent = s.phase === 'won' || s.phase === 'lost' ? '夜巡手记可导出重放。再守一夜会清空本局；想留下它，请先导出。' : s.phase === 'upgrade' ? '改造当场生效，下一更由模型重新编排。没有倒计时，慢慢选。' : '模型只在更次之间编排。连接成功后先看预告，再亲手开更；等待不扣时间。';
    el('[data-notice]').textContent = notice;
    stage?.view.draw(s);
    if (stage) page.root.dataset.metrics = JSON.stringify(stage.metrics());
    renderLive();
  }
  el('[data-main]').addEventListener('click', () => {
    if (!stage?.canInteract() || busy) return;
    if (session.state.phase === 'prepared') {
      try { session.assertCanDispatch(65536); stage.view.start(session.state); stage.canvas.focus({ preventScroll: true }); render(); }
      catch (error) { if (!(error instanceof AgentValidationError)) throw error; report(error.message); }
    } else if (session.state.phase === 'won' || session.state.phase === 'lost') reset();
    else if (session.state.phase === 'awaiting') {
      notice = '';
      void agent.turn({
        ...requestFor(session.state), label: `墨影编排第${session.state.wave + 1}更`,
        validate: plan => { session.preview({ type: 'plan', plan }); },
        getRevision: () => session.revision,
        commit: plan => { session.dispatch({ type: 'plan', plan }); },
      });
    }
  }, { signal: page.signal });
  for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-upgrade]')) button.addEventListener('click', () => {
    if (!stage?.canInteract() || busy || running()) return;
    const upgrade = button.dataset.upgrade === 'reserve' ? 'reserve' : 'breeze';
    stage.view.cancel(); act({ type: 'upgrade', upgrade });
  }, { signal: page.signal });
  for (let i = 0; i < 3; i++) el(`[data-lane="${i}"]`).addEventListener('click', () => stage?.view.select(i as Lane), { signal: page.signal });
  el('[data-reset]').addEventListener('click', reset, { signal: page.signal });
  el('[data-pause]').addEventListener('click', () => pause(!manualPause), { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.code === 'KeyP' && gameKey(event, page.root, !document.hidden)) { event.preventDefault(); pause(!manualPause); return; }
    if (!gameKey(event, page.root, stage?.canInteract() ?? false) || !running()) return;
    if (/^Digit[123]$/.test(event.code)) { event.preventDefault(); stage?.view.select((Number(event.code.at(-1)) - 1) as Lane); }
    if (event.code === 'Space') { event.preventDefault(); stage?.view.hold(true); }
  }, { signal: page.signal });
  document.addEventListener('keyup', event => { if (event.code === 'Space') stage?.view.hold(false); }, { signal: page.signal });
  window.addEventListener('blur', () => stage?.view.clear(), { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  const { createPhaserStage } = await import('../../core/phaser/stage');
  page.signal.throwIfAborted();
  stage = await createPhaserStage(page, {
    host: el('[data-stage]'), label: '纸城三巷折灯舞台', width: 1440, height: 640, background: '#101f35',
    create: (scene, runtime) => createWatchScene(scene, runtime, {
      changed(round) { live = round; renderLive(); },
      finished(trace, round) { act({ type: 'finish', trace, endTick: round.tick }); },
      paused(value) { paused = value; render(); },
    }),
  });
  createGameNotebook(page, {
    gameId: 'paper-watch', session, trigger: el('[data-save]'), locale: 'zh-CN',
    beforeRestore() { agent.cancel(); stage?.view.clear(); },
    afterRestore() { stage?.view.cancel(); pause(false); render(); },
    onNotice: report,
  });
  render();
  return { destroy: page.destroy, reset, setPaused: pause };
}
