import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { createGameNotebook } from '../../core/games/notebook';
import { GameSession } from '../../core/games/session';
import { gameKey } from '../../core/phaser/input';
import { createPhaserStage, type PhaserStage } from '../../core/phaser/stage';
import { RULES, STEP_MS, RHYTHM_NAMES, PATTERN_NAMES, classify, destination, parcelName } from './data';
import { definition, grade, latestOutcome, startWave } from './engine';
import { requestFor } from './agent';
import { accepts, activeParcel, step, type Input, type Simulation } from './simulation';
import { createPostalScene, type PostalView } from './scene';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'dream-sorter');
  page.root.dataset.workspace = 'true';
  const session = new GameSession(definition, 89);
  let stage: PhaserStage<PostalView> | undefined;
  let live: Simulation | null = null, inputs: Input[] = [], pending: Input['action'] | undefined;
  let busy = false, manualPause = false, paused = false, notice = '', lastAnnouncement = '';
  const heldKeys = new Set<string>();
  page.root.innerHTML = `
    <header class="ds-header">
      <div class="ds-wordmark"><span class="ds-seal" aria-hidden="true">梦</span><div><h1>梦境分拣局</h1><p>夜班第八十九号 · 原创梦邮街机</p></div></div>
      <nav aria-label="工作台工具"><button data-pause>暂停</button><button data-help>帮助</button><button data-settings>班务</button><button data-save>回放</button><button data-reset>重新开班</button></nav>
    </header>
    <main class="ds-workbench" data-project-preview>
      <section class="ds-hall" aria-label="梦邮分拣大厅">
        <div class="ds-hall-top"><span>昼夜邮政 · 分拣一厅</span><span data-floor-phase>等待督导派件</span></div>
        <div class="ds-stage-wrap"><div class="ds-stage" data-scene></div>
          <div class="ds-paused" data-paused hidden><strong>传送带已暂停</strong><span data-pause-note>时钟静止，梦邮不会丢失。</span></div>
        </div>
        <div class="ds-hall-bottom"><span data-current>传送带尚未开动</span><span data-clock>本地时钟 · 0.0 秒</span></div>
      </section>
      <aside class="ds-desk" aria-label="分拣操作">
        <div class="ds-progress"><strong data-wave>第 1 / 4 班</strong><span data-lives aria-label="剩余机会">● ● ●</span></div>
        <div class="ds-wave-dots" aria-label="四班进度">${[1, 2, 3, 4].map(i => `<span data-wave-dot="${i}"></span>`).join('')}</div>
        <div class="ds-rule"><span class="ds-eyebrow" data-caption>你的夜班从这里开始</span><h2 data-rule>给每个梦一个归处</h2><p data-rule-day>← 白昼 · 黑夜 →</p><p data-rule-night>看清一条规则，签收一件梦邮。</p></div>
        <p class="ds-brief" data-brief>城市睡着后，梦邮堆满大厅。你负责分拣，夜班督导负责换规则。四班交接，让白昼与黑夜各归其位。</p>
        <button class="ds-primary" data-primary>请督导开班</button>
        <p class="ds-hint" data-hint>只在班次之间调用模型；派件返回后由你开带。</p>
        <div class="ds-sort" aria-label="分拣方向">
          <button class="ds-day" data-day><strong>← 白昼</strong><span>← / A</span></button>
          <button class="ds-night" data-night><strong>黑夜 →</strong><span>→ / D</span></button>
        </div>
        <button class="ds-hold" data-hold>紧急暂存 · 剩余 2 次</button>
        <div class="ds-scoreline"><span data-combo>连签 0</span><strong data-score>0 分</strong></div>
        <p class="ds-status" data-status role="status" aria-live="polite"></p>
      </aside>
    </main>
    <footer class="ds-footer"><div data-agent-host></div><span>桌面键鼠 · 无声开班 · 本地计时</span></footer>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => query<T>(page.root, selector);
  const primary = el<HTMLButtonElement>('[data-primary]');
  const help = document.createElement('section');
  help.innerHTML = `<p>先请督导派件，再看规则按「准备好了，开带」。第一件会提示去向；每班只有一条规则。</p>
    <h3>分拣操作</h3><p>← / A 或白昼按钮：送白昼。→ / D 或黑夜按钮：送黑夜。画面内两个大邮槽也能点击。每次按键只签收一件；长按不会连发。桌面键盘与鼠标设计，没有触屏布局。</p>
    <p>响应窗口内分拣成功得 100 分，加连签奖励（每次加 10，最高加 100）。误分或超时扣一次机会，连签归零；三次退件结束。四班共 24 件，送完即结业。</p>
    <p>紧急暂存将当前件截止时间延长 1.2 秒，整次开班仅两次，每件最多一次。暂存不是无限暂停。</p>
    <h3>规则看这里</h3><p>太阳、橙色、非月亮、邮票恰好两枚、邮票至少两枚：每班只用其中一条。规则所说的送白昼，其余送黑夜。颜色同时有文字；邮票有图案与数字。折纸形状不参与判定。</p>
    <h3>不会被网络偷走的时间</h3><p>模型只在你点击派件时调用，绝不逐件请求，也不自动调用。督导选真实规则、编组和节奏；本地引擎限制每批昼夜各三件，同向最多连两件。错误计划最多反馈重试一次，无离线督导替代。</p>
    <p>暂停 / P、切换页面、打开任何对话框都会冻结固定步时钟并清除按键与残余时间。关闭窗口后恢复；手动暂停需要再次按暂停按钮。不追赶离开期间的时间。</p>
    <h3>回放与恢复</h3><p>已接收的督导批次与完整结束班次自动保存。正在进行的一班不逐帧保存：刷新或导入后从该班预告重开，已完成班次不丢失。重新开班清空本次回放并沿用种子；重新请求的督导可能改变策略。导出回放可以精确复核同一批次和输入。</p>
    <p>响应窗口为 [到达时刻，截止时刻)：截止时刻本身算超时。输入按 50 毫秒固定步验证，得分只由引擎复算。回放用于本地复核，不声称具有联网排名防作弊能力。</p>`;
  createWorkspaceDialog(page, { id: 'dream-sorter-help', title: '分拣员手册', content: [help], triggers: [el('[data-help]')], closeLabel: '关闭' });
  const settings = document.createElement('section');
  settings.innerHTML = `<label>班次节奏 <select data-difficulty><option value="calm">从容班 · 约三秒一件</option><option value="regular">熟练班 · 约两秒半一件</option></select></label>
    <p>仅开班前可选。首件总有五秒，不会随着班次不断加速。每班六件，四班结业。声音关闭，本作品不请求音频权限。</p>
    <h3>运行账本</h3><p data-metrics>画面正在准备。</p><p>50 毫秒固定步，每帧最多补两步。目标预算：200 个显示对象、64 张纹理、32 个补间以内。长卡顿减慢而不跳过操作窗口，不保证所有设备帧率。</p>
    <p data-seed>回放种子：89</p>`;
  createWorkspaceDialog(page, { id: 'dream-sorter-settings', title: '班务与运行账本', content: [settings], triggers: [el('[data-settings]')], closeLabel: '关闭' });
  function report(message: string) { notice = message; render(); }
  const agent = createAgentConsole({ ...page, report: message => { page.report(message); report(message); } }, {
    gameId: 'dream-sorter', locale: 'zh-CN', host: el('[data-agent-host]'),
    preflight: () => session.assertCanDispatch(65536),
    onBusyChange(value) { busy = value; render(); },
  });
  function clearInput() { heldKeys.clear(); pending = undefined; stage?.view.resetClock(); }
  function queue(action: Input['action']) {
    if (!live || !stage?.canInteract() || pending || !accepts(live, action)) return;
    pending = action;
  }
  function advance() {
    if (!live || live.status !== 'running') return;
    const input = pending && accepts(live, pending) ? { tick: live.tick + 1, action: pending } : undefined;
    pending = undefined;
    live = step(live, input);
    if (input) inputs.push(input);
    if (live.status !== 'running') {
      const completed = live;
      live = null;
      clearInput();
      session.dispatch({ type: 'finish', inputs, endTick: completed.tick });
      inputs = [];
    } else render();
  }
  function render() {
    if (page.signal.aborted) return;
    const s = session.state, current = live && activeParcel(live), carry = live ?? s;
    const phase = live ? 'running' : s.phase;
    page.root.dataset.phase = phase;
    page.root.dataset.wave = String(s.wave);
    page.root.dataset.tick = String(live?.tick ?? 0);
    page.root.dataset.paused = String(paused);
    stage?.view.draw(s, live);
    el('[data-wave]').textContent = `第 ${Math.max(1, s.wave)} / 4 班`;
    el('[data-lives]').textContent = `${'● '.repeat(carry.lives)}${'○ '.repeat(3 - carry.lives)}`.trim();
    el('[data-lives]').setAttribute('aria-label', `剩余 ${carry.lives} 次机会`);
    el('[data-score]').textContent = `${carry.score} 分`;
    el('[data-combo]').textContent = `连签 ${carry.combo}`;
    el('[data-paused]').hidden = !paused;
    el('[data-pause-note]').textContent = manualPause ? '按「继续分拣」或 P 恢复；不会快进。' : '关闭窗口或回到本页后继续；不会快进。';
    el('[data-pause]').textContent = manualPause ? '继续分拣' : '暂停';
    el('[data-pause]').setAttribute('aria-pressed', String(manualPause));
    for (const dot of page.root.querySelectorAll<HTMLElement>('[data-wave-dot]')) {
      const wave = Number(dot.dataset.waveDot);
      dot.dataset.done = String(s.history.some(h => h.wave === wave));
      dot.dataset.currentWave = String(s.wave === wave);
    }
    el('[data-caption]').textContent = live ? `当前规则 · 已分 ${live.index} / 6` : s.phase === 'ready' ? `第 ${s.wave} 班预告` : s.phase === 'won' ? '四班结业' : s.phase === 'lost' ? '夜班停机' : '督导只在班次之间派件';
    el('[data-rule]').textContent = s.phase === 'won' ? grade(s) : s.phase === 'lost' ? '三次退件，先歇一歇' : s.plan ? RULES[s.plan.rule].title : '给每个梦一个归处';
    el('[data-rule-day]').textContent = s.plan ? RULES[s.plan.rule].day : '← 白昼 · 黑夜 →';
    el('[data-rule-night]').textContent = s.plan ? RULES[s.plan.rule].night : '看清一条规则，签收一件梦邮。';
    el('[data-brief]').textContent = s.phase === 'briefing' ? '你分拣梦邮，夜班督导换规则。四班交接，让白昼与黑夜各归其位。'
      : s.phase === 'won' ? `24 件梦邮已结算。最高连签 ${s.best}，剩余 ${s.lives} 次机会。可以导出回放，或重新开班。`
        : s.phase === 'lost' ? `这一班没有撑到交接。已得 ${s.score} 分；再试一次，从第一班重新开始。`
          : s.plan ? `${RHYTHM_NAMES[s.plan.rhythm]} · ${PATTERN_NAMES[s.plan.pattern]} · ${destination(s.plan.first)}先行。六件梦邮，昼夜各半。` : '';
    primary.textContent = busy ? '督导正在派件…' : live ? '传送带运行中'
      : s.phase === 'ready' ? '准备好了，开带' : s.phase === 'between' ? '请督导安排下一班'
        : s.phase === 'won' ? '再开一班' : s.phase === 'lost' ? '再试一次' : '请督导开班';
    primary.disabled = busy || Boolean(live) || !stage || paused;
    const first = s.wave === 1 && (live?.index ?? 0) === 0 && s.plan && s.batch[0];
    el('[data-hint]').textContent = first ? `第一件示范：${parcelName(s.batch[0])}，按${classify(s.batch[0], s.plan!.rule) === 'day' ? '← / A 送白昼' : '→ / D 送黑夜'}。`
      : live ? '只看本班规则。按一次，分一件。' : s.phase === 'ready' ? '先读新规则。按开带之前不计时。' : '只在班次之间调用模型；派件返回后由你开带。';
    el('[data-current]').textContent = current ? `正在分拣：${parcelName(current)}` : live ? '下一件正在入站…' : s.phase === 'ready' ? `首件：${parcelName(s.batch[0])}` : '传送带尚未开动';
    el('[data-clock]').textContent = `本地时钟 · ${((live?.tick ?? 0) * STEP_MS / 1000).toFixed(1)} 秒`;
    el('[data-floor-phase]').textContent = paused ? '传送带已暂停' : busy ? '等督导回信 · 不计时' : live ? '正在分拣' : s.phase === 'ready' ? '批次已验收 · 等你开带' : s.phase === 'won' ? '梦邮全部归档' : s.phase === 'lost' ? '本次夜班结束' : '等待督导派件';
    const enabled = Boolean(live && stage?.canInteract());
    el<HTMLButtonElement>('[data-day]').disabled = !enabled || !live || !accepts(live, 'day');
    el<HTMLButtonElement>('[data-night]').disabled = !enabled || !live || !accepts(live, 'night');
    const hold = el<HTMLButtonElement>('[data-hold]');
    hold.disabled = !enabled || !live || !accepts(live, 'hold');
    hold.textContent = `紧急暂存 · 剩余 ${carry.holds} 次${live?.held ? '（此件已用）' : ''}`;
    const outcome = latestOutcome(s, live);
    const wrap = !live && s.phase === 'between' ? '本班已完成并保存。' :
      !live && s.phase === 'won' ? '夜班完成，所有梦邮都已有归处。' :
        !live && s.phase === 'lost' ? '本次夜班结束，可以休息后再试。' : '';
    const message = notice || (outcome ? (outcome.correct ? `签收成功，${carry.combo} 连签。` :
      `${outcome.actual === 'timeout' ? '超时' : '误分'}退件，应送${destination(outcome.expected)}。${wrap ? '' : `还有 ${carry.lives} 次机会，下一件稳住。`}`) + wrap
      : s.phase === 'between' ? '本班已完成并保存。督导会参考本班公开错单。'
        : s.phase === 'ready' ? '刷新会回到本班预告；已完成班次保留。' : s.phase === 'won' ? '夜班完成！白昼与黑夜都收到了来信。' : s.phase === 'lost' ? '已保存本次结束记录。重试不会自动调用模型。' : '');
    if (message !== lastAnnouncement) { el('[data-status]').textContent = message; lastAnnouncement = message; }
    const difficulty = query<HTMLSelectElement>(settings, '[data-difficulty]');
    difficulty.disabled = s.phase !== 'briefing' || busy;
    difficulty.value = s.difficulty;
    query(settings, '[data-seed]').textContent = `回放种子：${session.seed}；已接受 ${session.moveCount} 条指令。`;
    if (stage) {
      const m = stage.metrics();
      query(settings, '[data-metrics]').textContent = `显示对象 ${m.objects} / 200 · 纹理 ${m.textures} / 64 · 补间 ${m.tweens} / 32 · 已绘制 ${m.updates} 帧`;
      el('[data-scene]').dataset.objects = String(m.objects);
      el('[data-scene]').dataset.textures = String(m.textures);
      el('[data-scene]').dataset.tweens = String(m.tweens);
    }
  }
  function reset() {
    agent.cancel('已重新开班，旧派件作废。');
    live = null; inputs = []; clearInput(); notice = ''; manualPause = false;
    stage?.setPaused(false);
    session.reset();
    render();
  }
  async function primaryAction() {
    if (!stage?.canInteract() || busy || live) return;
    notice = '';
    if (session.state.phase === 'won' || session.state.phase === 'lost') { reset(); return; }
    if (session.state.phase === 'ready') {
      session.assertCanDispatch(65536);
      live = startWave(session.state); inputs = []; clearInput();
      stage.canvas.focus({ preventScroll: true }); render(); return;
    }
    await agent.turn({
      ...requestFor(session.state), label: `夜班督导安排第 ${session.state.wave + 1} 班`,
      validate: plan => { session.preview({ type: 'plan', plan }); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'plan', plan }); },
    });
    render();
  }
  function togglePause() {
    manualPause = !manualPause; clearInput(); stage?.setPaused(manualPause); render();
  }
  primary.addEventListener('click', () => {
    void primaryAction().catch(error => {
      if (!(error instanceof AgentValidationError)) throw error;
      report(error.message);
    });
  }, { signal: page.signal });
  el('[data-day]').addEventListener('click', () => queue('day'), { signal: page.signal });
  el('[data-night]').addEventListener('click', () => queue('night'), { signal: page.signal });
  el('[data-hold]').addEventListener('click', () => queue('hold'), { signal: page.signal });
  el('[data-reset]').addEventListener('click', reset, { signal: page.signal });
  el('[data-pause]').addEventListener('click', togglePause, { signal: page.signal });
  query<HTMLSelectElement>(settings, '[data-difficulty]').addEventListener('change', event => {
    const difficulty = (event.target as HTMLSelectElement).value;
    if (difficulty === 'calm' || difficulty === 'regular') session.dispatch({ type: 'difficulty', difficulty });
  }, { signal: page.signal });
  window.addEventListener('keydown', event => {
    if (!gameKey(event, page.root, !document.hidden)) return;
    const key = event.key.toLowerCase();
    if (key === 'p') { event.preventDefault(); togglePause(); return; }
    if (!stage?.canInteract() || heldKeys.has(key)) return;
    const action = key === 'arrowleft' || key === 'a' ? 'day' : key === 'arrowright' || key === 'd' ? 'night' : undefined;
    if (!action) return;
    event.preventDefault(); heldKeys.add(key); queue(action);
  }, { signal: page.signal });
  window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()), { signal: page.signal });
  stage = await createPhaserStage(page, {
    host: el('[data-scene]'), label: '梦境分拣大厅：传送带、待分梦邮、白昼和黑夜邮槽',
    width: 960, height: 600, background: '#272344',
    create: (scene, runtime) => createPostalScene(scene, runtime, {
      advance, input: queue,
      pauseChanged(value) { paused = value; clearInput(); render(); },
    }),
    report,
  });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, {
    gameId: 'dream-sorter', locale: 'zh-CN', session, trigger: el('[data-save]'),
    beforeRestore() { agent.cancel('正在恢复回放，旧派件作废。'); clearInput(); },
    afterRestore() { live = null; inputs = []; notice = '回放已复核；未完成的班次从预告重新开带。'; manualPause = false; stage?.setPaused(false); render(); },
    onNotice: report,
  });
  page.onCleanup(() => { live = null; inputs = []; heldKeys.clear(); });
  paused = stage.paused;
  render();
  return { destroy: page.destroy, reset, setPaused(value) { manualPause = value; stage?.setPaused(value); render(); } };
}
