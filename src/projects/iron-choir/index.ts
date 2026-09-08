import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents/console';
import { AgentError, requireRule } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import { progression } from '../../core/rpg/progression';
import {
  ENDING_IDS, GEAR, GEAR_IDS, GOALS, GOAL_NAMES, ITEMS, ITEM_NAMES, LEVELS, LOCATIONS, MACHINES,
  MISSIONS, PILOT_IDS, QUESTS, SKILLS, SKILL_DATA,
} from './data';
import type { PilotId } from './data';
import {
  actionsFor, agentUnits, damagePreview, definition, endingAvailable, fieldFor, gearUnlocked, pilotStats,
} from './engine';
import type { Action, Command } from './engine';
import { requestFor } from './agent';
import { createScene } from './render';
import { portrait } from './art';
import { CHARACTERS, DEFEAT_STORY, ENDINGS, FACTIONS, INTERLUDES, LOCATION_STORY, MISSION_STORY, PILOT_LINES, PROLOGUE } from './story';
import { equalPoint, heightAt, shotGeometry, walkable } from './spatialmath';
import type { Point } from './spatialmath';

const esc = escapeMarkup;
const actName = (completed: number) => completed < 2 ? '第一幕 · 被续写的值勤表' : completed < 4 ? '第二幕 · 活人的边界' : '第三幕 · 命令的结束时间';
const costText = (cost: Partial<Record<typeof ITEMS[number], number>>) =>
  ITEMS.filter(item => cost[item]).map(item => `${cost[item]} ${ITEM_NAMES[item]}`).join(' · ');
const commandButton = (label: string, command: Command, disabled = false, primary = false) =>
  `<button type="button" data-command="${esc(JSON.stringify(command))}" ${disabled ? 'disabled' : ''} ${primary ? 'class="ic-primary"' : ''}>${esc(label)}</button>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'iron-choir');
  page.root.dataset.workspace = 'true';
  page.root.lang = 'zh-CN';
  page.root.innerHTML = `
    <header class="ic-header">
      <div class="ic-brand"><span class="ic-seal" aria-hidden="true">穹</span><div><h1>铁穹回声</h1><p>原创机甲远征 · 三幕战记</p></div></div>
      <nav aria-label="战记工具"><button data-open="journal">战记</button><button data-open="help">指南</button><button data-open="restart">重启</button></nav>
    </header>
    <div class="ic-workspace">
      <section class="ic-scene" data-project-preview aria-label="远征三维场景">
        <div class="ic-scene-host"></div>
        <div class="ic-scene-title"><span data-act></span><h2 data-location></h2><p data-scene-subtitle></p></div>
        <div class="ic-scene-stamp" aria-hidden="true">第九远征队<br><span>记忆不是军需</span></div>
        <div class="ic-scene-pilots" data-scene-pilots aria-label="驾驶员实时遥测"></div>
        <div class="ic-view-tools" aria-label="免费视角控制">
          <button data-camera="left" aria-label="向左旋转视角">左旋</button><button data-camera="top">俯视</button><button data-camera="right" aria-label="向右旋转视角">右旋</button><button data-camera="near" aria-label="拉近视角">拉近</button><button data-camera="far" aria-label="拉远视角">拉远</button><button data-open="tactical">战术表</button>
        </div>
        <div class="ic-scene-legend"><span>蓝环 · 远征队</span><span>橙虚线 · 锁定炮线</span><span>白框 · 选中格点</span></div>
      </section>
      <aside class="ic-dock" aria-label="远征指挥台" data-dock></aside>
    </div>
    <footer class="ic-footer"><p data-notice role="status" aria-live="polite">先整备与阅读，再主动请求代理。模型不会在载入时运行。</p><div data-console></div></footer>`;
  const session = new GameSession(definition, 85);
  const dock = query<HTMLElement>(page.root, '[data-dock]');
  const noticeNode = query<HTMLElement>(page.root, '[data-notice]');
  const content = (className = '') => { const element = document.createElement('section'); element.className = `ic-dialog-body ${className}`; element.tabIndex = 0; return element; };
  const workshopContent = content(), mapContent = content(), storyContent = content(), journalContent = content();
  const peopleContent = content(), tacticalContent = content(), helpContent = content(), restartContent = content();
  const dialog = (id: string, title: string, element: HTMLElement) => {
    const options = { id: `iron-choir-${id}`, title, content: [element], className: 'ic-dialog', closeLabel: '关闭' };
    return createWorkspaceDialog(page, options);
  };
  const workshop = dialog('workshop', '整备机库', workshopContent);
  const worldmap = dialog('map', '世界航图', mapContent);
  const story = dialog('story', '现场与回声', storyContent);
  const journal = dialog('journal', '远征战记', journalContent);
  const people = dialog('people', '同行者档案', peopleContent);
  const tactical = dialog('tactical', '二维战术表', tacticalContent);
  const help = dialog('help', '远征指南', helpContent);
  const restart = dialog('restart', '重新建立远征', restartContent);
  let busy = false, selected: Point = { x: 1, z: 2 }, selectedOption = '', selectedPilot: PilotId = 'shen', selectedCharacter = 'shen';
  let route: 'main' | 'ridge' = 'main';
  function notice(message: string) { noticeNode.textContent = message; }
  const scene = createScene(query(page.root, '.ic-scene-host'), pick, notice);
  page.onCleanup(scene.destroy);
  const agentOptions = {
    gameId: 'iron-choir', host: query<HTMLElement>(page.root, '[data-console]'), locale: 'zh-CN' as const,
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value: boolean) { busy = value; renderDock(); },
  };
  const agent = createAgentConsole(page, agentOptions);
  const notebookTrigger = document.createElement('button');
  notebookTrigger.type = 'button'; notebookTrigger.textContent = '存档与回放'; notebookTrigger.dataset.notebook = '';
  const notebook = createGameNotebook(page, {
    locale: 'zh-CN',
    gameId: 'iron-choir', session, trigger: notebookTrigger,
    beforeRestore: () => agent.cancel(),
    afterRestore: render,
    onNotice: notice,
  });
  function run(command: Command) {
    try {
      requireRule(!busy, '代理正在提交计划。请等待或先取消，当前工单没有执行。');
      session.dispatch(command);
      notice(session.state.log.at(-1) ?? '工单已执行。');
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      notice(error.message); page.report(error.message);
    }
  }
  async function advance() {
    if (busy || session.state.phase !== 'battle') return;
    const state = session.state, b = state.battle!, side = b.stage === 'forecast' ? 'enemy' : 'ally';
    if (side === 'ally' && agentUnits(state, side).length === 0) { run({ type: 'resolve' }); return; }
    const request = requestFor(state, side);
    await agent.turn({
      ...request, label: `${side === 'enemy' ? '旧网指挥' : '同伴协同'} · 第${b.round}轮`,
      validate: plan => { session.preview({ type: 'agent', plan }); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'agent', plan }); },
    });
  }
  function playerActions(): Action[] {
    return session.state.phase === 'battle' && session.state.battle?.stage === 'player' ? actionsFor(session.state, session.state.lead) : [];
  }
  function pick(p: Point, unit: string | null) {
    selected = p;
    if (!session.state.battle && unit && PILOT_IDS.some(id => id === unit)) {
      selectedPilot = PILOT_IDS.find(id => id === unit)!;
      renderWorkshop(); workshop.open(); return;
    }
    const actions = playerActions();
    const matching = actions.find(a => a.kind === 'fire' && a.target === unit) ??
      actions.find(a => a.to && equalPoint(a.to, p));
    selectedOption = matching?.id ?? '__none__';
    scene.select(p, matching);
    renderDock(); renderTactical();
    const field = fieldFor(session.state);
    const target = session.state.battle?.units.find(u => u.id === unit);
    if (target) {
      const lead = session.state.battle!.units.find(u => u.id === session.state.lead)!;
      const geometry = shotGeometry(field, lead.position, target.position, lead.range);
      notice(`${target.name} · 结构 ${target.hull}/${target.maxHull} · 距离 ${geometry.distance.toFixed(1)} · ${!geometry.visible ? '硬掩体阻断视线' : !geometry.inRange ? '超出主炮射程' : geometry.cover ? '低掩体减伤三' : '弹道通畅'}。`);
    } else notice(`${p.x + 1}列${p.z + 1}行 · 高度 ${heightAt(field, p).toFixed(2)} · ${walkable(field, p) ? '可通行地面，移动仍须检查路径和能量' : '实体掩体，不能占据'}。`);
  }
  function renderDock() {
    const s = session.state, b = s.battle;
    const character = CHARACTERS.find(c => c.id === s.lead)!;
    const leader = b?.units.find(u => u.id === s.lead);
    const stats = pilotStats(s.pilots[s.lead]);
    const pilotHeader = `<div class="ic-pilot-live">${portrait(character)}<div><p class="ic-eyebrow">${s.phase === 'battle' ? `第 ${b!.round} 轮 · ${b!.stage === 'forecast' ? '意图截获阶段' : '队长行动阶段'}` : '远征主控'}</p><h3>${character.name}<span>／${MACHINES[s.lead].name}</span></h3><p>${esc(PILOT_LINES[s.lead][s.pilots[s.lead].bond >= 2 ? 'high' : 'low'])}</p></div></div>`;
    let body = '';
    if (s.phase === 'battle' && b && leader) {
      const mission = MISSIONS.find(m => m.id === b.mission)!;
      const actions = playerActions();
      if (selectedOption !== '__none__' && !actions.some(a => a.id === selectedOption)) selectedOption = actions.find(a => a.kind === 'fire')?.id ?? actions[0]?.id ?? '';
      const action = actions.find(a => a.id === selectedOption), prediction = action ? damagePreview(s, action) : null;
      const asset = b.units.find(u => u.team === 'civil');
      body = `<div class="ic-telemetry" aria-label="主控机资源">
        <span>结构 <b data-lead-hull>${leader.hull}</b>/${leader.maxHull}</span><span>护盾 <b>${leader.shield}</b>/${leader.maxShield}</span>
        <span>能量 <b>${leader.energy}</b>/${leader.maxEnergy}</span><span>热量 <b>${leader.heat}</b>/${leader.maxHeat}</span><span>行动 <b data-ap>${leader.ap}</b>/2</span>
        <meter aria-label="主控机热量" value="${leader.heat}" max="${leader.maxHeat}"></meter></div>
        <div class="ic-orders">
          ${b.stage === 'forecast' ? `<label>公开协同目标<select data-goal ${busy ? 'disabled' : ''}>${GOALS.map(goal => `<option value="${goal}" ${s.goal === goal ? 'selected' : ''}>${GOAL_NAMES[goal]}</option>`).join('')}</select></label>
          <button class="ic-primary" data-advance ${busy ? 'disabled' : ''}>${busy ? '正在等待公开计划…' : '截获守机意图'}</button><p class="ic-caption">先锁定敌方意图，再由你决策。不透露未来行动。</p>`
          : `<label>队长合法行动<select data-action ${busy || !actions.length ? 'disabled' : ''}>${selectedOption === '__none__' && actions.length ? '<option value="__none__" selected>此格点无合法行动，请另选指令</option>' : ''}${actions.length ? actions.map(a => `<option value="${esc(a.id)}" ${a.id === selectedOption ? 'selected' : ''}>${esc(a.name)} · ${a.ap}行动 / ${a.energy}能量 / ${a.heat}热</option>`).join('') : '<option>本轮行动点用尽</option>'}</select></label>
            <p class="ic-action-preview">${action ? action.damage > 0 ? `确定命中当前坐标：护盾 −${prediction!.shield}／结构 −${prediction!.hull}${action.cover ? '，含掩体减伤' : ''}` : action.kind === 'move' ? `沿 ${action.path.length} 格真实路径移动；橙色锁定炮线不会追随你。` : action.kind === 'link' ? `接驳进度 ＋${s.pilots[s.lead].perk ? 2 : 1}，占用 ${action.ap} 行动。` : '资源变化由本地规则结算，不询问模型。' : '仍可让同伴协同，然后结算已锁定的敌方动作。'}</p>
            <div class="ic-action-row"><button class="ic-primary" data-execute ${busy || !action ? 'disabled' : ''}>执行所选行动</button><button data-advance ${busy ? 'disabled' : ''}>协同并结算</button></div>`}
        </div>
        <details class="ic-mission-brief" open><summary>${mission.name} · ${mission.links ? `接驳 ${b.links}/${mission.links}` : `撤离窗口 ${mission.rounds} 轮`}</summary><p>${mission.instruction}</p>${asset ? `<p data-asset-hull>${asset.name}：结构 ${asset.hull}/${asset.maxHull}${mission.objective === 'escort' ? ` · 第 ${asset.position.x + 1} 列／目标第六列` : ''}</p>` : ''}</details>
        ${b.forecasts.length ? `<section class="ic-intentions" aria-label="已锁定公开意图"><h4>已锁定 · 可躲开的炮线</h4>${b.forecasts.map(f => {
          const actor = b.units.find(u => u.id === f.unit)!;
          const target = b.units.find(u => u.id === f.action.target);
          const lost = f.aim && target && !equalPoint(f.aim, target.position);
          return `<p><b>${esc(actor.name)}</b> ${esc(f.action.name)}${f.aim ? ` → ${f.aim.x + 1}列${f.aim.z + 1}行` : ''}
            <span>${actor.hull <= 0 ? '已失能，不再执行。' : lost ? '目标已脱离，当前锁定将落空。' : f.action.damage > 0 ? `预告威力 ${f.action.damage}${f.action.cover ? '（已扣低掩体三）' : ''}；护盾先吸收，架盾再减三。` : '本轮末执行；你仍能提前改变局面。'}</span>
            <span>${f.action.ap} 行动 · ${f.action.energy} 能量 · ${f.action.heat} 热</span><span>${esc(f.intention)}</span></p>`;
        }).join('')}</section>` : ''}
        <div class="ic-squad-status">${b.units.filter(u => u.team !== 'civil').map(u => `<p data-unit="${u.id}" data-hull="${u.hull}"><span>${u.team === 'enemy' ? '旧网' : '同伴'} · ${u.name}</span><span>结构 ${u.hull} · 盾 ${u.shield} · 热 ${u.heat}</span></p>`).join('')}</div>
        <details><summary>本次行动记录</summary>${b.history.map(line => `<p>${esc(line)}</p>`).join('') || '<p>尚未执行机械动作。</p>'}</details>
        <button data-retreat ${busy ? 'disabled' : ''}>紧急撤离</button>`;
    } else if (s.phase === 'debrief' && b) {
      const mission = MISSIONS.find(m => m.id === b.mission)!;
      body = `<p class="ic-eyebrow">任务完成 · 尚未发放奖励</p><h3>${mission.name}</h3><p>${MISSION_STORY[mission.id].after}</p>
        <div class="ic-loot"><h4>待核对战利品</h4><p>${costText(mission.reward)}</p><p>全队经验 ＋${mission.xp}${s.debt ? ` · 优先偿还 ${s.debt} 废料债务` : ''}</p></div>
        ${commandButton('核对战利品并归库', { type: 'debrief' }, busy, true)}`;
    } else if (s.phase === 'defeat') {
      body = `<p class="ic-eyebrow">远征失利 · 无战利品</p><h3>拖索仍然连着</h3><p>${DEFEAT_STORY}</p>
        ${commandButton(s.inventory.scrap >= 3 ? '支付三废料，救援归库' : '登记四废料救援债，归库', { type: 'recover', payment: s.inventory.scrap >= 3 ? 'scrap' : 'debt' }, busy, true)}`;
    } else if (s.phase === 'resolution') {
      body = `<p class="ic-eyebrow">六场远征结束 · 等待你的落款</p><h3>为命令写下结束时间</h3><p>${MISSION_STORY.crown.after}</p>
        ${ENDING_IDS.map(id => `<div class="ic-ending-choice"><h4>${ENDINGS[id].title}</h4><p>${ENDINGS[id].requirement}</p>${commandButton(`签署「${ENDINGS[id].title}」`, { type: 'ending', ending: id }, !endingAvailable(s, id), true)}</div>`).join('')}`;
    } else if (s.phase === 'ended' && s.ending) {
      body = `<p class="ic-eyebrow">战记已落款</p><h3 data-ending>${ENDINGS[s.ending].title}</h3>${ENDINGS[s.ending].paragraphs.map(p => `<p>${p}</p>`).join('')}
        <p class="ic-caption">完成六场远征 · ${s.quests.length} 项任务 · ${session.moveCount} 条合法指令 · 失利 ${s.failures} 次</p><button data-open="restart">开始另一份远征战记</button><button data-open="journal">阅读完整战记</button>`;
    } else {
      const mission = MISSIONS[s.completed.length];
      const interlude = INTERLUDES.find(i => i.location === s.location && i.after <= s.completed.length && !s.decisions[i.id]);
      body = `<div class="ic-hangar-readout"><span>结构 ${stats.maxHull - s.pilots[s.lead].damage}/${stats.maxHull}</span><span>等级 ${progression(s.pilots[s.lead].xp, LEVELS).level}</span><span>已归航 ${s.completed.length}/6</span></div>
        <div class="ic-orders"><p class="ic-eyebrow">下一次远征</p><h3>${mission.name}</h3><p>${mission.instruction}</p>
        ${s.pilots.luo.bond >= 2 ? `<label>进场路线<select data-route><option value="main" ${route === 'main' ? 'selected' : ''}>主路 · 全队稳步集结</option><option value="ridge" ${route === 'ridge' ? 'selected' : ''}>高台侧路 · 纸隼前出两格</option></select></label>` : '<p class="ic-caption">罗烬信任达到二，将开放高台侧路。</p>'}
        <button class="ic-primary" data-deploy ${busy ? 'disabled' : ''}>出征 · ${mission.name}</button>
        <div class="ic-action-row"><button data-open="workshop">整备机库</button><button data-open="map">世界航图</button></div>
        <button data-open="story" class="${interlude ? 'ic-story-ready' : ''}">${interlude ? `交谈 · ${interlude.title}` : '当地见闻与序章'}</button></div>
        <div class="ic-supply-line">${ITEMS.map(item => `<span>${ITEM_NAMES[item]} <b>${s.inventory[item]}</b></span>`).join('')}</div>
        ${s.reply ? `<details open><summary>归航之后</summary><p>${esc(s.reply)}</p></details>` : `<blockquote>“${CHARACTERS.find(c => c.id === 'lin')!.voice}”<cite>林簿 · 民间记名人</cite></blockquote>`}
        <button data-open="people">同行者与关系</button>`;
    }
    dock.innerHTML = pilotHeader + body;
    const action = playerActions().find(a => a.id === selectedOption);
    scene.select(selected, action);
  }
  function renderWorkshop() {
    const s = session.state, p = s.pilots[selectedPilot], stats = pilotStats(p), growth = progression(p.xp, LEVELS);
    const character = CHARACTERS.find(c => c.id === selectedPilot)!;
    const disabled = s.phase !== 'hangar' || busy;
    workshopContent.innerHTML = `<div class="ic-dialog-toolbar">${PILOT_IDS.map(id => `<button data-pilot="${id}" aria-pressed="${id === selectedPilot}">${CHARACTERS.find(c => c.id === id)!.name}${s.pilots[id].recruited ? '' : ' · 未加入'}</button>`).join('')}</div>
      <div class="ic-workshop-pilot">${portrait(character, true)}<div><p class="ic-eyebrow">${MACHINES[p.id].designation}</p><h3>${MACHINES[p.id].name} · ${character.name}</h3><p>${MACHINES[p.id].ability}</p><p>信任 ${p.bond} · 结构 ${stats.maxHull - p.damage}/${stats.maxHull} · 护盾上限 ${stats.maxShield}</p><p>等级 ${growth.level} · 经验 ${p.xp}${growth.nextThreshold === null ? ' · 已达最高等级' : `／下级 ${growth.nextThreshold}`}</p></div></div>
      <div class="ic-supply-line">${ITEMS.map(item => `<span data-item="${item}">${ITEM_NAMES[item]} <b>${s.inventory[item]}</b></span>`).join('')}<span>仓容 ${ITEMS.reduce((n, item) => n + s.inventory[item], 0)}/120</span></div>
      <div class="ic-dialog-toolbar">${commandButton('设为主控驾驶员', { type: 'lead', pilot: p.id }, disabled || !p.recruited || s.lead === p.id)}${commandButton('修复机体 · 一修复匣', { type: 'repair', pilot: p.id }, disabled || !p.recruited || p.damage === 0 || !s.inventory.kit)}${commandButton('组装修复匣 · 二废料', { type: 'fabricate' }, disabled || s.inventory.scrap < 2)}</div>
      <h4>负载与核心</h4><p>独有装备只制造一次、只装一台；转交武器或核心前先换回原装，外挂可选择不安装后转交。更换配装不会恢复结构。</p>
      ${(['weapon', 'core', 'perk'] as const).map(slot => `<label>${slot === 'weapon' ? '主武器' : slot === 'core' ? '能源核心' : '战术外挂'}<select data-equip="${p.id}" ${disabled || !p.recruited ? 'disabled' : ''}>
        ${slot === 'perk' ? `<option value="none" ${p.perk ? '' : 'selected'}>不安装战术外挂</option>` : ''}
        ${GEAR_IDS.filter(id => GEAR[id].slot === slot).map(id => `<option value="${id}" ${p[slot] === id ? 'selected' : ''} ${!['standard', 'stock'].includes(id) && (!s.crafted.includes(id) || PILOT_IDS.some(other => other !== p.id && s.pilots[other][slot] === id)) ? 'disabled' : ''}>${GEAR[id].name}${p[slot] === id ? ' · 已安装' : ''}</option>`).join('')}</select></label>`).join('')}
      <p>主炮射程 ${stats.range.toFixed(1)} · 基础伤害 ${stats.damage} · 热容量 ${stats.maxHeat} · 能量 ${stats.maxEnergy} · 移动 ${stats.move} 格</p>
      <h4>制造工单</h4><div class="ic-ledger">${GEAR_IDS.filter(id => !['standard', 'stock'].includes(id)).map(id => `<div><div><b>${GEAR[id].name}</b><p>${GEAR[id].description}</p><p>${costText(GEAR[id].cost)}${!gearUnlocked(s, id) ? ' · 需要剧情图纸' : ''}</p></div>${commandButton(s.crafted.includes(id) ? '已制造' : `制造${GEAR[id].name}`, { type: 'build', gear: id }, disabled || s.crafted.includes(id) || !gearUnlocked(s, id) || ITEMS.some(item => s.inventory[item] < (GEAR[id].cost[item] ?? 0)))}</div>`).join('')}</div>
      <h4>成长技能 · 待分配 ${Math.max(0, growth.level - 1 - p.skills.length)} 点</h4><div class="ic-ledger">${SKILLS.map(skill => `<div><div><b>${SKILL_DATA[skill].name}</b><p>${SKILL_DATA[skill].description}</p></div>${commandButton(p.skills.includes(skill) ? '已掌握' : `学习${SKILL_DATA[skill].name}`, { type: 'learn', pilot: p.id, skill }, disabled || !p.recruited || p.skills.includes(skill) || growth.level - 1 <= p.skills.length)}</div>`).join('')}</div>`;
  }
  function renderMap() {
    const s = session.state;
    const currentMission = MISSIONS[s.completed.length];
    mapContent.innerHTML = `<p>十处可抵达地点沿穹顶肋骨相连。出征之外，旅行与交谈不请求模型；会改变世界的决定写入回放。</p>
      <svg class="ic-world-map" viewBox="0 0 1000 450" role="img" aria-label="穹城十处地点的轨道航图">
      <defs><pattern id="ic-map-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" fill="none" stroke="#254453" stroke-width="1"/></pattern></defs>
      <rect width="1000" height="450" fill="url(#ic-map-grid)"/><path d="M40 410Q160 50 600 45T990 320M10 280Q550 520 950 100" fill="none" stroke="#496776" stroke-width="2"/>
      <polyline points="${LOCATIONS.map(l => `${l.x * 10},${l.y * 5}`).join(' ')}" fill="none" stroke="#6b8d9f" stroke-dasharray="6 9"/>
      ${LOCATIONS.map(l => `<g opacity="${l.unlock > s.completed.length ? '.3' : '1'}"><circle cx="${l.x * 10}" cy="${l.y * 5}" r="${s.location === l.id ? 11 : 7}" fill="${s.location === l.id ? '#f3a364' : '#a3cad9'}"/><text x="${l.x * 10}" y="${l.y * 5 - 18}" text-anchor="middle" fill="#e5edef" font-size="22">${l.name}</text></g>`).join('')}</svg>
      <p>下一战：${currentMission?.name ?? '远征完成'} · 当前 ${LOCATIONS.find(l => l.id === s.location)!.name}</p>
      <div class="ic-location-list">${LOCATIONS.map(l => `<button data-visit="${l.id}" ${l.unlock > s.completed.length || s.phase !== 'hangar' || busy || l.id === s.location ? 'disabled' : ''}><b>${l.name}</b><span>${l.unlock > s.completed.length ? `完成 ${l.unlock} 场远征后开放` : l.id === s.location ? '当前所在' : l.kind}</span></button>`).join('')}</div>`;
  }
  function renderStory() {
    const s = session.state, interlude = INTERLUDES.find(i => i.location === s.location && i.after <= s.completed.length);
    storyContent.innerHTML = `<p class="ic-eyebrow">${LOCATIONS.find(l => l.id === s.location)!.name}</p>
      ${s.completed.length === 0 && s.location === 'hangar' ? `<h3>序章 · 没有结束时间的命令</h3>${PROLOGUE.map(p => `<p>${p}</p>`).join('')}` : ''}
      ${LOCATION_STORY[s.location].map(p => `<p>${p}</p>`).join('')}
      ${interlude ? `<hr><div class="ic-story-speaker">${portrait(CHARACTERS.find(c => c.id === interlude.character)!)}<h3>${interlude.title}</h3></div>
        ${interlude.choices.map(c => `<div class="ic-story-choice">${commandButton(c.title, { type: 'choice', scene: interlude.id, choice: c.id }, s.phase !== 'hangar' || busy || Boolean(s.decisions[interlude.id]), true)}<p>${c.consequence}</p>${s.decisions[interlude.id] === c.id ? `<blockquote>${c.reply}</blockquote>` : ''}</div>`).join('')}` : '<p class="ic-caption">此处没有尚待签署的决定，阅读不会消耗行动。</p>'}`;
  }
  function renderJournal() {
    const s = session.state;
    journalContent.innerHTML = `<div class="ic-dialog-toolbar" data-journal-tools><button data-open="people">人物档案</button><button data-open="story">当地见闻</button></div>
      <p>${actName(s.completed.length)} · ${session.moveCount} 条合法指令 · 失利 ${s.failures} 次</p><p>共情 ${s.empathy} · 自主 ${s.autonomy} · 真相 ${s.truth} · 救援债 ${s.debt}</p>
      <h3>主线与支线</h3><div class="ic-quest-ledger">${QUESTS.map(q => `<div data-quest="${q.id}" data-complete="${s.quests.includes(q.id)}"><span>${s.quests.includes(q.id) ? '完成' : '待办'} · ${q.kind}</span><h4>${q.name}</h4><p>${q.description}</p></div>`).join('')}</div>
      <h3>公开战记</h3><ol>${s.log.map(line => `<li>${esc(line)}</li>`).join('')}</ol>
      ${s.ending ? `<h3>${ENDINGS[s.ending].title}</h3>${ENDINGS[s.ending].paragraphs.map(p => `<p>${p}</p>`).join('')}` : ''}`;
    query(journalContent, '[data-journal-tools]').prepend(notebookTrigger);
  }
  function renderPeople() {
    const s = session.state, c = CHARACTERS.find(c => c.id === selectedCharacter)!;
    const pilotId = PILOT_IDS.find(id => id === c.id);
    peopleContent.innerHTML = `<div class="ic-dialog-toolbar">${CHARACTERS.map(c => `<button data-character="${c.id}" aria-pressed="${c.id === selectedCharacter}">${c.name}</button>`).join('')}</div>
      <div class="ic-workshop-pilot">${portrait(c, true)}<div><p class="ic-eyebrow">${c.age}</p><h3>${c.name}</h3><p>${c.role}</p>${pilotId ? `<p>${s.pilots[pilotId].recruited ? '已加入远征' : '尚待招募'} · 信任 ${s.pilots[pilotId].bond}</p>` : ''}</div></div>
      <blockquote>${c.voice}</blockquote><p>${c.biography}</p><h4>想要抵达的地方</h4><p>${c.goal}</p><h4>会犯的错</h4><p>${c.flaw}</p><h4>与你的羁绊</h4><p>${c.bond}</p>
      <h3>穹城诸方</h3>${FACTIONS.map(f => `<section><h4>${f.name}</h4><p>代表：${f.representative}</p><p>${f.purpose}</p><p>${f.fault}</p></section>`).join('')}`;
  }
  function renderTactical() {
    const s = session.state, field = fieldFor(s);
    tacticalContent.innerHTML = `<p>与三维场景共用格点、高度与实体掩体。这里仅选择格点，关闭后再执行指令。方向键与回车也可直接操作战场。</p>
      <div class="ic-coordinate-controls"><label>列<select data-coordinate="x">${Array.from({ length: 9 }, (_, x) => `<option value="${x}" ${selected.x === x ? 'selected' : ''}>第 ${x + 1} 列</option>`).join('')}</select></label><label>行<select data-coordinate="z">${Array.from({ length: 7 }, (_, z) => `<option value="${z}" ${selected.z === z ? 'selected' : ''}>第 ${z + 1} 行</option>`).join('')}</select></label><button data-choose-coordinate>选中格点</button></div>
      <div class="ic-tactical-grid" role="grid" aria-label="九列七行战术地形">${Array.from({ length: 7 }, (_, z) => `<div role="row">${Array.from({ length: 9 }, (_, x) => {
        const unit = s.battle?.units.find(u => u.hull > 0 && equalPoint(u.position, { x, z }));
        const cover = field.solids.find(solid => solid.kind !== 'terrain' && x > solid.min.x && x < solid.max.x && z > solid.min.z && z < solid.max.z);
        const label = unit?.name ?? (cover?.kind === 'wall' ? '硬墙' : cover ? '低掩体' : equalPoint(field.terminal, { x, z }) ? '终端' : '地面');
        return `<button role="gridcell" data-grid="${x}:${z}" data-team="${unit?.team ?? ''}" data-cover="${cover?.kind ?? ''}" aria-selected="${equalPoint(selected, { x, z })}" aria-label="${x + 1}列${z + 1}行 ${label} 高度${heightAt(field, { x, z }).toFixed(2)}">${unit ? unit.name[0] : cover?.kind === 'wall' ? '墙' : cover ? '掩' : equalPoint(field.terminal, { x, z }) ? '端' : '·'}</button>`;
      }).join('')}</div>`).join('')}</div><p data-grid-status>已选 ${selected.x + 1}列${selected.z + 1}行 · 高度 ${heightAt(field, selected).toFixed(2)}</p><button data-return-tactical class="ic-primary">采用格点并返回战场</button>`;
  }
  helpContent.innerHTML = `<h3>先数人，再数机器</h3><p>这是原创虚构世界，不基于任何既有动画人物或机甲设计。你操纵一位主控驾驶员，在机库招募同伴、装配机体并决定共同目标。六场任务横跨三幕；五处插叙会实质改变招募、路线、图纸和三种结局。</p>
    <h4>一次完整出征</h4><ol><li>在机库制造后装入装备。通过世界航图到白窑街等地交谈，取得图纸与信任。</li><li>主动点击出征，再点击「截获守机意图」。模型为敌方每台存活守机选择一个合法动作；你此时还没有决定本轮行动。</li><li>读橙色虚线与公开意图，使用两个行动点。射击看真实三维距离与视线；点选场景只选择，不消耗。移动能离开已锁定的炮线。</li><li>点击「协同并结算」。另一次独立请求让同伴按各自目标选择动作，然后本地引擎依序执行同伴、守机、冷却和任务进度。</li><li>完成目标后核对战利品，归库修复、升级、学习技能，继续远征。最后选择已赢得资格的终局协议。</li></ol>
    <h4>可以核算的机械规则</h4><p>每轮二行动点。移动耗一行动、二能量、一热，沿最短可通行格点路径移动，单步高差不得超过零点三六。原装射击耗一行动、二能量、三热，齐射耗二行动、四能量、多二热，追加四伤害。超热、缺能或视线被挡的指令不能提交。</p>
    <p>实体硬墙完全挡住射线；低掩体在腰部射线被挡、传感器射线可见时减伤三。架盾再减三伤害并补三护盾。护盾先吸收，剩余伤害才扣结构。沈砚能立壁，罗烬能远针，叶缄能缝合。每轮结束恢复四能量、至少冷却三、补一护盾；排热额外减五热、补三能量。</p>
    <p>敌人射击锁定预告时的坐标，不追随你的后续移动。守机被先击毁便不再行动；若队友提前击毁某目标，后机对应指令取消且不收费。每台代理机体每轮一个动作，先按机体顺序执行同伴，再执行守机。队长归零、民用设施归零或超出撤离窗口都是真实失败。</p>
    <h4>资源与失败</h4><p>奖励只在归库核对时发放一次；不能重刷已完成任务。制造、修复先扣实际库存，独有装备不得复制。每升一级获得一个技能点，可选五种不同成长技能。失败不发物资或经验，可花三废料救援；不足时登记四废料债，从后续战利品扣还。重启会取消未完成请求，再清空当前战记。</p>
    <h4>键盘、触屏与视角</h4><p>在战场画布上使用方向键选择格点，回车执行该格的合法动作。空格截获意图或协同结算；字母Ｇ架盾，Ｖ排热；Ｑ／Ｅ转动视角，Ｔ切换俯视，Ｊ打开战记。也可以使用完整行动下拉框，或战术表的列、行选择器。对话框打开时，所有世界快捷键停用。视角、阅读与选择不进入回放，也不取消请求。</p>
    <h4>模型、隐私与离线边界</h4><p>需要支持原生函数工具的兼容接口。使用底部「模型」配置自己的端点和模型。仅在主动请求轮次时发送公开战场快照；敌方不接收队长未来决定。同伴和敌方使用分离请求。每次最多两次请求、每次最多一千五百三十六输出令牌，总限时六十秒。可能产生服务商费用。</p><p>只展示中文公开意图，不请求私有推理链。输出经过严格工具解析、纯引擎预演和同步版本门控，才写入战记。网络错误、取消和过期计划不会扣除游戏资源；已单独执行的队长动作不会因此撤销。没有离线假代理。重放只验证既有指令，不会联系模型。</p>
    <p>战记自动保存在此浏览器，可在战记中打开原生存档对话框导出与导入。正常完整远征远低于三百条指令，共享回放上限六百。三维场景按需绘制，像素倍率封顶，不播放音频，也没有持续闪烁与镜头摇晃。</p>`;
  restartContent.innerHTML = '<p>将取消所有未完成代理计划，并清空当前远征的本地战记。若要保留，请先在「战记 → 存档与回放」导出。模型连接偏好不受影响。</p><button class="ic-primary" data-confirm-restart>确认重新开始</button>';
  function render() {
    const s = session.state;
    page.root.dataset.phase = s.phase; page.root.dataset.round = String(s.battle?.round ?? 0);
    page.root.dataset.mission = s.battle?.mission ?? ''; page.root.dataset.moves = String(session.moveCount);
    query(page.root, '[data-act]').textContent = actName(s.completed.length);
    query(page.root, '[data-location]').textContent = s.ending ? ENDINGS[s.ending].title : LOCATIONS.find(l => l.id === s.location)!.name;
    query(page.root, '[data-scene-subtitle]').textContent = s.battle ? `${MISSIONS.find(m => m.id === s.battle!.mission)!.weather} ／ 第 ${s.battle.round} 轮` : LOCATIONS.find(l => l.id === s.location)!.subtitle;
    query(page.root, '[data-scene-pilots]').innerHTML = PILOT_IDS.filter(id => s.pilots[id].recruited).map(id => {
      const character = CHARACTERS.find(c => c.id === id)!;
      const unit = s.battle?.units.find(u => u.id === id);
      const hp = unit?.hull ?? pilotStats(s.pilots[id]).maxHull - s.pilots[id].damage;
      return `<button data-inspect-pilot="${id}" aria-label="查看${character.name}，结构${hp}" ${hp === 0 ? 'class="ic-pilot-down"' : ''}>${portrait(character)}<span>${character.name} ${hp}</span></button>`;
    }).join('');
    scene.update(s);
    renderDock(); renderWorkshop(); renderMap(); renderStory(); renderJournal(); renderPeople(); renderTactical();
  }
  function openPanel(name: string) {
    const panels: Record<string, typeof workshop> = { workshop, map: worldmap, story, journal, people, tactical, help, restart };
    const panel = panels[name];
    if (!panel) return;
    // One modal owns keyboard focus at a time, including nested notebook navigation.
    for (const current of Object.values(panels)) if (current !== panel && current.dialog.open) current.close();
    panel.open();
  }
  page.root.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || button.disabled) return;
    if (button.dataset.open) { openPanel(button.dataset.open); return; }
    if (button.dataset.command) {
      const command = definition.parseCommand(JSON.parse(button.dataset.command));
      run(command); return;
    }
    if (button.hasAttribute('data-notebook')) { journal.close(); notebook.open(); return; }
    if (button.hasAttribute('data-advance')) { void advance(); return; }
    if (button.hasAttribute('data-execute')) { if (selectedOption) run({ type: 'player', option: selectedOption }); return; }
    if (button.hasAttribute('data-deploy')) { run({ type: 'deploy', mission: MISSIONS[session.state.completed.length].id, route }); return; }
    if (button.dataset.pilot) { selectedPilot = PILOT_IDS.find(id => id === button.dataset.pilot)!; renderWorkshop(); return; }
    if (button.dataset.character) { selectedCharacter = button.dataset.character; renderPeople(); return; }
    if (button.dataset.inspectPilot) {
      selectedCharacter = button.dataset.inspectPilot; renderPeople(); people.open(); return;
    }
    if (button.dataset.visit) {
      const location = LOCATIONS.find(l => l.id === button.dataset.visit)!.id;
      run({ type: 'visit', location }); worldmap.close(); return;
    }
    if (button.dataset.grid) {
      const [x, z] = button.dataset.grid.split(':').map(Number);
      pick({ x, z }, session.state.battle?.units.find(u => u.hull > 0 && equalPoint(u.position, { x, z }))?.id ?? null); return;
    }
    if (button.hasAttribute('data-choose-coordinate')) {
      const x = Number(query<HTMLSelectElement>(tacticalContent, '[data-coordinate="x"]').value);
      const z = Number(query<HTMLSelectElement>(tacticalContent, '[data-coordinate="z"]').value);
      pick({ x, z }, session.state.battle?.units.find(u => u.hull > 0 && equalPoint(u.position, { x, z }))?.id ?? null); return;
    }
    if (button.hasAttribute('data-return-tactical')) { tactical.close(); query<HTMLCanvasElement>(page.root, 'canvas').focus(); return; }
    if (button.dataset.camera) {
      if (button.dataset.camera === 'top') scene.top();
      else if (button.dataset.camera === 'near') scene.zoom(-1);
      else if (button.dataset.camera === 'far') scene.zoom(1);
      else scene.orbit(button.dataset.camera === 'left' ? -0.28 : 0.28);
      return;
    }
    if (button.hasAttribute('data-retreat')) { run({ type: 'retreat' }); return; }
    if (button.hasAttribute('data-confirm-restart')) {
      agent.cancel(); restart.close(); session.reset(85); route = 'main'; selectedOption = ''; notice('新远征已建立，没有自动请求模型。');
    }
  }, { signal: page.signal });
  page.root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const input = event.target;
    if (input.hasAttribute('data-action')) {
      selectedOption = input.value;
      const action = playerActions().find(a => a.id === selectedOption);
      if (action?.to) selected = action.to;
      renderDock();
      query<HTMLSelectElement>(dock, '[data-action]').focus();
    } else if (input.hasAttribute('data-route')) route = input.value === 'ridge' ? 'ridge' : 'main';
    else if (input.hasAttribute('data-goal')) run({ type: 'goal', goal: GOALS.find(goal => goal === input.value)! });
    else if (input.dataset.equip && input.value) {
      if (input.value === 'none') {
        run({ type: 'unmount', pilot: PILOT_IDS.find(id => id === input.dataset.equip)! });
        return;
      }
      const gear = GEAR_IDS.find(id => id === input.value);
      if (gear) run({ type: 'equip', pilot: PILOT_IDS.find(id => id === input.dataset.equip)!, gear });
    }
  }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog:modal') ||
      (event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"]'))) return;
    const key = event.key.toLowerCase();
    if (key === 'q' || key === 'e') { event.preventDefault(); scene.orbit(key === 'q' ? -0.28 : 0.28); return; }
    if (key === 't') { event.preventDefault(); scene.top(); return; }
    if (key === 'j') { event.preventDefault(); journal.open(); return; }
    if (session.state.phase !== 'battle') return;
    if (key.startsWith('arrow')) {
      event.preventDefault();
      const x = Math.max(0, Math.min(8, selected.x + (key === 'arrowright' ? 1 : key === 'arrowleft' ? -1 : 0)));
      const z = Math.max(0, Math.min(6, selected.z + (key === 'arrowdown' ? 1 : key === 'arrowup' ? -1 : 0)));
      pick({ x, z }, session.state.battle!.units.find(u => u.hull > 0 && equalPoint(u.position, { x, z }))?.id ?? null);
    } else if (key === ' ') { event.preventDefault(); void advance(); }
    else if (key === 'enter' && selectedOption && !busy) { event.preventDefault(); run({ type: 'player', option: selectedOption }); }
    else if ((key === 'g' || key === 'v') && !busy) { event.preventDefault(); run({ type: 'player', option: key === 'g' ? 'guard' : 'vent' }); }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  render();
  return { destroy: page.destroy };
}
