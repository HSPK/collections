import './style.css';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { createGameNotebook } from '../../core/games/notebook';
import { GameSession } from '../../core/games/session';
import { createProjectPage, query } from '../../core/page';
import { gameKey } from '../../core/phaser/input';
import { createPhaserStage } from '../../core/phaser/stage';
import type { PhaserStage } from '../../core/phaser/stage';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { boardTool, observation, SYSTEM } from './agent';
import { HEIGHT, WIDTH } from './data';
import type { Shot } from './data';
import { definition } from './engine';
import type { State } from './engine';
import { createCabinet } from './scene';
import type { CabinetView } from './scene';

export async function mount(context: ProjectContext): Promise<ProjectInstance> {
  const page = createProjectPage(context, 'marble-parley');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'mp-title');
  page.root.innerHTML = `
    <header class="mp-header">
      <div class="mp-brand"><span>月面共同体 / 第 88 号使馆</span><h1 id="mp-title">弹珠外交</h1></div>
      <p class="mp-score"><span data-round>第 1 / 5 轮</span><strong data-score>0 分</strong><span data-stars>0 星</span><span data-shots>弹珠 3 / 3</span></p>
      <nav aria-label="游戏控制"><button data-pause>暂停 P</button><button data-help>玩法 ?</button><button data-restart>重开</button><button data-save>存档</button></nav>
    </header>
    <main class="mp-board"><div data-stage></div><div class="mp-paused" data-pause-shade hidden>已暂停 · 点击「继续 P」返回球台</div></main>
    <section class="mp-controls" aria-label="弹珠发射台">
      <div class="mp-aim"><label for="mp-angle">角度 <output data-angle>0°</output></label><input id="mp-angle" data-angle-input type="range" min="-70" max="70" step="1" value="0" aria-label="发射角度"></div>
      <div class="mp-aim"><label for="mp-power">力度 <output data-power>85%</output></label><input id="mp-power" data-power-input type="range" min="60" max="100" step="1" value="85" aria-label="发射力度"></div>
      <button class="mp-special" data-special aria-pressed="false">连签电荷 E · 1 次</button>
      <button class="mp-primary" data-primary>邀请使馆布阵</button>
      <p data-instruction>模型先布阵；看清铜盾，再发射。</p>
    </section>
    <footer class="mp-footer"><p data-notice role="status" aria-live="polite">五轮弹珠，替月亮写一份共同使用的契约。音效默认关闭。</p><div data-agent-host></div></footer>`;
  const session = new GameSession(definition, 1);
  let stage: PhaserStage<CabinetView> | undefined;
  let busy = false, animating = false, explicitPause = false;
  let presentation: State | null = null;
  let shot: Shot = { angle: 0, power: 85, special: false };
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  const primary = query<HTMLButtonElement>(page.root, '[data-primary]');
  const angleInput = query<HTMLInputElement>(page.root, '[data-angle-input]');
  const powerInput = query<HTMLInputElement>(page.root, '[data-power-input]');
  const specialButton = query<HTMLButtonElement>(page.root, '[data-special]');
  const say = (text: string) => { notice.textContent = text; notice.title = text; };
  const canShoot = () => Boolean(stage?.canInteract()) && !busy && !animating && session.state.phase === 'ready';
  function aim(next: Shot) {
    shot = { angle: Math.max(-70, Math.min(70, Math.round(next.angle))), power: Math.max(60, Math.min(100, Math.round(next.power))),
      special: next.special && !session.state.specialUsed };
    angleInput.value = String(shot.angle); powerInput.value = String(shot.power);
    query(page.root, '[data-angle]').textContent = `${shot.angle > 0 ? '+' : ''}${shot.angle}°`;
    query(page.root, '[data-power]').textContent = `${shot.power}%`;
    specialButton.setAttribute('aria-pressed', String(shot.special));
    stage?.view.aim(shot);
  }
  function render() {
    if (page.signal.aborted) return;
    const state = presentation ?? session.state;
    page.root.dataset.phase = session.state.phase;
    page.root.dataset.round = String(session.state.round + 1);
    page.root.dataset.shots = String(session.state.shots);
    page.root.dataset.animating = String(animating);
    query(page.root, '[data-round]').textContent = `第 ${state.round + 1} / 5 轮${state.round === 4 ? ' · 终章' : ''}`;
    query(page.root, '[data-score]').textContent = `${state.score} 分`;
    query(page.root, '[data-stars]').textContent = `${state.stars} 星`;
    query(page.root, '[data-shots]').textContent = `弹珠 ${animating ? session.state.shots : state.shots} / 3`;
    primary.textContent = busy ? '使馆正在布阵…' : animating ? '弹珠飞行中…' : ({
      parley: '邀请使馆布阵', ready: '发射 · 空格', 'round-win': '契约落印 · 下一轮', victory: '月亮共享！再来一局', lost: '谈判破裂 · 重试',
    })[state.phase];
    primary.disabled = !stage || busy || animating || explicitPause;
    angleInput.disabled = !canShoot(); powerInput.disabled = !canShoot();
    specialButton.disabled = !canShoot() || state.specialUsed;
    specialButton.textContent = state.specialUsed ? '连签电荷 · 已使用' : shot.special ? '连签电荷 E · 已装填' : '连签电荷 E · 1 次';
    const instructions = {
      parley: '失败不会扣弹珠。先连接模型，邀请一次布阵。',
      ready: `需签 ${state.round === 4 ? 3 : 2} 份 · 已签 ${state.captured.length} 份。拖球后拉松手；或 ← → 调角，↑ ↓ 调力，空格发射。`,
      'round-win': `本轮达成！剩余弹珠已计入星级。下一站的使馆将参考你的发射记录。`,
      victory: `五轮全部签署！月亮归每个人。总计 ${state.score} 分 / ${state.stars} 星。`,
      lost: '三枚弹珠已用完，契约未齐。存档可保留这次航迹；重试会明确重置战役。',
    };
    query(page.root, '[data-instruction]').textContent = instructions[state.phase];
    if (!animating) stage?.view.draw(state);
    aim(shot);
  }
  const content = (markup: string) => {
    const section = document.createElement('section'); section.innerHTML = markup; return section;
  };
  const helpBody = content(`<p class="mp-dialog-lede">一个小小的太空使馆，没有讲台，只有一台弹珠机。</p>
    <ol><li>点击「邀请使馆布阵」。真实模型根据公开的发射统计选择弹台和铜盾。全部布阵先公开，飞行中绝不反击。</li>
    <li>拖住球台下方的弹珠，向后拉，松手发射。也可用 ← → 调角、↑ ↓ 调力、空格发射。滑条可精调到 1 度。</li>
    <li>每轮 3 枚弹珠，签亮任意 2 份契约过关；第五轮大使长要求全部 3 份。契约是可穿过的光印，铜盾和弹台才会反弹。</li>
    <li>每轮一次「连签电荷」（E）：装填后发射，先撞铜轨或弹台再命中契约，自动连签距离该契约最近的另一份。直射不触发。</li></ol>
    <p>同一发射中，第 1 / 2 / 3 份契约分别得 100 / 200 / 300 分；每种反弹面另加每份 20 分，首次撞每枚弹台得 25 分。过关每枚剩余弹珠加 150 分，星级为剩余弹珠 + 1（每轮 1–3 星）。三球用完未达标即战役失败。</p>
    <p>P 暂停，? 查看玩法。任何弹窗与切走页面都会暂停。发射即保存输入和本地结算；刷新或导入不会退还已经发射的弹珠。重开会明确开始新战役。声音关闭，不需要移动端触控。</p>
    <p>铜盾只挡正面，试试从侧边折返。所有合法礼阵均经同一物理引擎验证，可用至多三枚普通弹珠完成；没有自动代打或离线假对手。</p>
    <button data-measure>测量画面资源</button><output data-metrics>上限：200 对象 / 64 纹理 / 32 补间；固定步长 120 Hz，单球最多 5 秒。</output>`);
  createWorkspaceDialog(page, { id: 'mp-help', title: '弹珠外交 · 玩法', content: [helpBody],
    triggers: [query(page.root, '[data-help]')], closeLabel: '关闭', className: 'mp-dialog' });
  const restartBody = content(`<p>发射已立即记入本地存档。这里只开始一场明确的新战役，不退还旧战役的弹珠。若要保留航迹，请先关闭此窗并导出存档。</p>
    <p>同星图保留目标偏移；新星图换一组目标位置。两者都需要重新邀请真实模型布阵，不会自动调用模型。</p>
    <div class="mp-dialog-actions"><button data-retry-confirm>重试本星图</button><button data-new-confirm>新星图出发</button></div>`);
  const restartDialog = createWorkspaceDialog(page, { id: 'mp-restart', title: '重新启航', content: [restartBody], closeLabel: '关闭', className: 'mp-dialog' });
  const agent = createAgentConsole(page, { gameId: 'marble-parley', host: query(page.root, '[data-agent-host]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; render(); },
  });
  function openRestart() {
    agent.cancel('已取消布阵；未花费弹珠。');
    restartDialog.open();
  }
  function reset(newSeed: boolean) {
    agent.cancel(); stage?.view.cancel(); animating = false; presentation = null;
    explicitPause = false; stage?.setPaused(false); shot = { angle: 0, power: 85, special: false };
    query(page.root, '[data-pause]').textContent = '暂停 P';
    query<HTMLElement>(page.root, '[data-pause-shade]').hidden = true;
    session.reset(newSeed ? (session.seed + 1) >>> 0 : session.seed);
    restartDialog.close(); say('新战役已就绪。先邀请使馆，不会自动请求模型。'); render();
  }
  function fire() {
    if (!canShoot()) return;
    try {
      const before = session.state;
      session.preview({ type: 'shot', shot });
      animating = true; presentation = before;
      const next = session.dispatch({ type: 'shot', shot });
      stage!.view.play(before, next.last!);
      say('已发射并保存：飞行完全由本地物理计算，期间无需等待模型。');
      render();
    } catch (error) {
      animating = false; presentation = null;
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message); render();
    }
  }
  async function primaryAction() {
    if (!stage?.canInteract() || busy || animating) return;
    const state = session.state;
    if (state.phase === 'ready') { fire(); return; }
    if (state.phase === 'round-win') {
      session.dispatch({ type: 'advance' }); shot.special = false;
      say('新的使馆将参考之前的角度、力度和契约命中记录。'); render(); return;
    }
    if (state.phase === 'victory' || state.phase === 'lost') { openRestart(); return; }
    const committed = await agent.turn({
      label: `第 ${state.round + 1} 轮 · 公开布阵`, system: SYSTEM, observation: observation(state), tool: boardTool,
      validate(plan) { session.preview({ type: 'arrange', round: state.round, plan }); },
      getRevision: () => session.revision,
      commit(plan) { session.dispatch({ type: 'arrange', round: state.round, plan }); },
    });
    if (page.signal.aborted) return;
    if (committed) say('布阵已锁定：铜盾与弹台现在都能看见。看准光印，试着侧击或折返。');
    else say('布阵未成功，弹珠一枚未扣。检查模型设置后可重试。');
    render();
  }
  function togglePause() {
    if (!stage || document.querySelector('dialog:modal')) return;
    explicitPause = !explicitPause; stage.setPaused(explicitPause);
    query(page.root, '[data-pause]').textContent = explicitPause ? '继续 P' : '暂停 P';
    query<HTMLElement>(page.root, '[data-pause-shade]').hidden = !explicitPause;
    render();
  }
  primary.addEventListener('click', () => { void primaryAction(); }, { signal: page.signal });
  query(page.root, '[data-restart]').addEventListener('click', openRestart, { signal: page.signal });
  query(page.root, '[data-pause]').addEventListener('click', togglePause, { signal: page.signal });
  query(restartBody, '[data-retry-confirm]').addEventListener('click', () => reset(false), { signal: page.signal });
  query(restartBody, '[data-new-confirm]').addEventListener('click', () => reset(true), { signal: page.signal });
  angleInput.addEventListener('input', () => { if (canShoot()) aim({ ...shot, angle: Number(angleInput.value) }); }, { signal: page.signal });
  powerInput.addEventListener('input', () => { if (canShoot()) aim({ ...shot, power: Number(powerInput.value) }); }, { signal: page.signal });
  specialButton.addEventListener('click', () => { if (canShoot()) { aim({ ...shot, special: !shot.special }); render(); } }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (!gameKey(event, page.root, !document.hidden)) return;
    if (event.key.toLowerCase() === 'p') { event.preventDefault(); togglePause(); return; }
    if (!stage?.canInteract()) return;
    if (event.key === '?') { event.preventDefault(); query<HTMLButtonElement>(page.root, '[data-help]').click(); return; }
    if (!canShoot()) return;
    if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'e', 'E'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft') aim({ ...shot, angle: shot.angle - 1 });
    if (event.key === 'ArrowRight') aim({ ...shot, angle: shot.angle + 1 });
    if (event.key === 'ArrowUp') aim({ ...shot, power: shot.power + 5 });
    if (event.key === 'ArrowDown') aim({ ...shot, power: shot.power - 5 });
    if (event.key.toLowerCase() === 'e' && !session.state.specialUsed) { aim({ ...shot, special: !shot.special }); render(); }
    if (event.key === ' ') fire();
  }, { signal: page.signal });
  stage = await createPhaserStage(page, {
    host: query(page.root, '[data-stage]'), label: '弹珠外交：铜轨、弹台、三份发光契约与下方弹珠发射台',
    width: WIDTH, height: HEIGHT, background: '#061622',
    create(scene, runtime) {
      return createCabinet(scene, runtime, {
        canShoot, aim, fire,
        complete() {
          animating = false; presentation = null;
          if (session.state.specialUsed) shot.special = false;
          say(session.state.phase === 'victory' ? '月亮共享！五份使馆协议全数通过。' :
            session.state.phase === 'lost' ? '谈判破裂。三枚弹珠已用尽，可以存档或重试。' :
              session.state.phase === 'round-win' ? '契约落印！进入下一轮。' : `本球签署 ${session.state.last?.hits.length ?? 0} 份，还剩 ${session.state.shots} 枚弹珠。`);
          render();
        },
        paused() { render(); },
      });
    },
    report: say,
  });
  query(helpBody, '[data-measure]').addEventListener('click', () => {
    const metrics = stage!.metrics();
    page.root.dataset.metrics = JSON.stringify(metrics);
    query(helpBody, '[data-metrics]').textContent = `实测 ${metrics.objects} 对象 / ${metrics.textures} 纹理 / ${metrics.tweens} 补间；${metrics.renderer} 渲染；${metrics.updates} 帧更新。`;
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, { gameId: 'marble-parley', session, trigger: query(page.root, '[data-save]'), locale: 'zh-CN',
    beforeRestore() { agent.cancel(); stage?.view.cancel(); animating = false; presentation = null; render(); },
    afterRestore() { shot.special = false; render(); },
    onNotice: say,
  });
  render();
  return { destroy: page.destroy, setPaused(value) {
    explicitPause = value; stage?.setPaused(value);
    query(page.root, '[data-pause]').textContent = value ? '继续 P' : '暂停 P';
    query<HTMLElement>(page.root, '[data-pause-shade]').hidden = !value; render();
  }, reset: openRestart };
}
