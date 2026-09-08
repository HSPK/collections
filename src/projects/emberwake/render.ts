import { escapeMarkup } from '../../core/page';
import { progression } from '../../core/rpg/progression';
import { portrait, scene } from './art';
import {
  COMPANIONS, CURVE, ENEMY_NAMES, ITEMS, ITEM_NAMES, LOCATIONS, PEOPLE, PLACE_NAMES, QUESTS, STANCES, STANCE_NAMES, questById,
} from './data';
import type { EnemyId } from './data';
import { ACTION_NAMES, LANES, PRICES, available, branchBlock, canUnbind, level, maxEnergy, maxHp, unlocked } from './engine';
import type { State } from './engine';
import { ACTS, CHARACTERS, ENDINGS, INTRO, PLACE_STORY, QUEST_STORY } from './story';

export interface Selection { lane: number; target: EnemyId }
const disabled = (condition: boolean) => condition ? ' disabled' : '';
export function shell(): string {
  return `<header class="ew-header"><div class="ew-brand"><span class="ew-brand-mark" aria-hidden="true">◇</span><div><h1 id="emberwake-title">余烬行旅</h1><p data-act></p></div></div>
    <div class="ew-resources" data-resources aria-label="车队状态"></div></header>
    <nav class="ew-toolbar" aria-label="行旅工具"><button data-open="map">航路</button><button data-open="story">此地故事</button><button data-open="journal">行旅簿</button><button data-open="party">同伴</button><button data-open="bag">行囊与航技</button><button data-save>存档</button><button data-open="help">玩法</button><button data-open="restart">重新启程</button></nav>
    <main class="ew-workbench" data-project-preview><section class="ew-stage" aria-label="空岛与战线"><div data-world></div>
      <div class="ew-place"><span data-place-subtitle></span><h2 data-place></h2></div><div class="ew-scene-caption" data-caption></div>
      <button class="ew-scene-read" data-open="story">细读此地</button></section>
      <aside class="ew-console" aria-label="当前行动"><div class="ew-phase" data-phase></div><div class="ew-scroll" data-panel></div><div class="ew-action-footer" data-actions></div></aside></main>
    <footer class="ew-footer"><p class="ew-notice" data-notice role="status" aria-live="polite">尚未出发。商议才会请求模型；阅读、看图不会消耗行动。</p><div data-agent-host></div></footer>`;
}
export function objective(state: State): string {
  if (state.phase === 'ended') return '旅途留在行旅簿里。可以先导出存档，再重新启程。';
  if (state.phase === 'finale') return '炉心已停下防御。选择重启天空的代价。';
  if (state.phase === 'choice') return '阅读商议，选择你愿意承担的后果。';
  if (state.phase === 'forecast') return '请求本轮战术。成功公开意图后，才会轮到你行动。';
  if (state.phase === 'action') return '先看落点，再选站位与技能。执行后结算整轮。';
  const next = QUESTS.find(q => !q.optional && !state.completed[q.id] && q.requires.every(id => state.completed[id]));
  return next ? `${PLACE_NAMES[next.location]} · ${next.title}` : '航路已经展开，仍可回访同伴的心事。';
}
function actorName(actor: string) {
  const person = PEOPLE.find(id => id === actor);
  const enemy = Object.keys(ENEMY_NAMES).find(id => id === actor) as EnemyId | undefined;
  return person ? CHARACTERS[person].name : enemy ? ENEMY_NAMES[enemy] : '车队';
}
export function render(root: HTMLElement, state: State, busy: boolean, selection: Selection) {
  const set = (selector: string, markup: string) => { root.querySelector<HTMLElement>(selector)!.innerHTML = markup; };
  set('[data-act]', ACTS[state.act - 1].title);
  set('[data-resources]', `<span data-hp>生命 <b>${state.hp}/${maxHp(state)}</b></span><span>心火 <b>${state.energy}/${maxEnergy(state)}</b></span><span data-level>等级 <b>${level(state)}</b></span><span data-coins>铜叶 <b>${state.bag.coin}</b></span>`);
  set('[data-world]', scene(state));
  set('[data-place]', PLACE_NAMES[state.location]);
  set('[data-place-subtitle]', PLACE_STORY[state.location].subtitle);
  set('[data-caption]', state.battle ? `第${state.battle.round}轮 · ${state.phase === 'action' ? '意图已锁定，轮到领航员' : '等待公开战术'}<br>第六轮起，每轮坍塌损伤十二点` :
    `悬空航路 ${unlocked(state).length} / 九处 · ${Object.keys(state.completed).length} / 十二项记事`);
  set('[data-phase]', `<span class="ew-kicker">${state.phase === 'travel' ? '行旅途中' : state.phase === 'choice' ? '灯下商议' : state.phase === 'forecast' ? '敌我代理 · 公开战术' : state.phase === 'action' ? '领航员 · 回应阶段' : '终章'}</span><p>${objective(state)}</p>`);
  let panel = '', actions = '';
  if (state.phase === 'travel') {
    const quests = available(state);
    const speaker = quests[0]?.person ?? 'you';
    panel = `<div class="ew-speaker">${portrait(speaker, true)}<div><h3>${CHARACTERS[speaker].name}</h3><span>${CHARACTERS[speaker].role}</span></div></div>
      <p class="ew-scene-prose">${state.completed.departure ? PLACE_STORY[state.location].text : '你刚领到铜针，风却停了。余烬图只剩一线温度，送灯人正在等你的回答。'}</p>
      <p class="ew-hint">先听完眼前人的提议，再决定怎样上路。守诺、留痕或解缆，会化作下一场遭遇的约定。</p>`;
    actions = quests.map(q => `<button class="ew-primary" data-parley="${q.id}"${disabled(busy)}>与${CHARACTERS[q.person].name}商议${q.optional ? ' · 支线' : ''}</button>`).join('');
    if (!quests.length) actions = '<button class="ew-primary" data-open="map">展开航路，继续旅行</button>';
    if (['kiln', 'market', 'bell', 'reservoir', 'observatory'].includes(state.location)) actions += `<button data-camp${disabled(busy || state.bag.coin < 4 || state.hp === maxHp(state) && state.energy === maxEnergy(state))}>扎营 · 四铜叶</button>`;
    if (state.location === 'market') actions += '<button data-open="bag">进入帆下商店</button>';
  } else if (state.phase === 'choice') {
    const quest = questById(state.pending!.quest);
    panel = `<div class="ew-speaker">${portrait(quest.person, true)}<div><h3>${CHARACTERS[quest.person].name}</h3><span>提议 · ${STANCE_NAMES[state.pending!.offer]}</span></div></div>
      <blockquote>${escapeMarkup(state.pending!.line)}</blockquote><button data-open="story">阅读「${quest.title}」</button>
      <p class="ew-hint">${state.pending!.offer === 'duty' ? '下一战首轮减伤二点。' : state.pending!.offer === 'memory' ? '开战恢复一点心火。' : '下一战首轮攻击增加一点。'}抉择一经执行就会记入旅途。</p>`;
    actions = quest.branches.map(branch => {
      const block = branchBlock(state, branch);
      return `<button class="ew-choice" data-choice="${branch.id}"${disabled(busy || Boolean(block))}>${branch.label}<small>${block ?? branch.consequence}</small></button>`;
    }).join('');
  } else if (state.phase === 'forecast' || state.phase === 'action') {
    const battle = state.battle!;
    panel = `<div class="ew-enemy-list">${battle.enemies.filter(e => e.hp > 0).map(e => `<p><b>${ENEMY_NAMES[e.id]}</b><span>${e.hp}/${e.maxHp} · ${LANES[e.lane]}${e.burn ? ' · 灼伤' : ''}</span></p>`).join('')}</div>`;
    panel += battle.plan ? `<ul class="ew-intents">${battle.plan.orders.map(o => `<li><b>${actorName(o.actor)}</b><span>${ACTION_NAMES[o.action]} · ${LANES[o.lane]}${o.target !== 'caravan' ? ` · ${ENEMY_NAMES[o.target]}` : ''}</span><p>${escapeMarkup(o.intention)}</p></li>`).join('')}</ul>` :
      '<div class="ew-waiting"><span class="ew-compass" aria-hidden="true">◇</span><p>敌我尚未行动</p><p class="ew-hint">模型只看上一轮公开状态。先公布敌人的攻击落点，你再决定怎样回应；失败、取消不会消耗生命、心火或轮数。</p></div>';
    if (state.phase === 'forecast') actions = `<button class="ew-primary" data-forecast${disabled(busy)}>${busy ? '正在等待公开战术…' : '聆听本轮战术'}</button>`;
    else actions = `<div class="ew-pickers"><label>站位<select data-lane>${LANES.map((name, lane) => `<option value="${lane}"${selection.lane === lane ? ' selected' : ''}${disabled(Math.abs(lane - battle.heroLane) > 1)}>${name}</option>`).join('')}</select></label>
      <label>目标<select data-target>${battle.enemies.filter(e => e.hp > 0).map(e => `<option value="${e.id}"${selection.target === e.id ? ' selected' : ''}>${ENEMY_NAMES[e.id]}</option>`).join('')}</select></label></div>
      <div class="ew-skill-grid"><button data-act-command="strike"${disabled(busy)}>普攻<span>不耗心火</span></button><button class="ew-primary" data-act-command="flare"${disabled(busy || state.energy < 2)}>烬火<span>心火二 · 灼伤</span></button>
      <button data-act-command="guard"${disabled(busy)}>护持<span>回心火二</span></button><button data-act-command="tonic"${disabled(busy || state.bag.tonic < 1 || state.hp >= maxHp(state))}>温灯药<span>余${state.bag.tonic} · 回复十六</span></button></div>`;
  } else if (state.phase === 'finale') {
    panel = `<h3>天空正在等你</h3><p>${QUEST_STORY.furnace[1]}</p><p class="ew-hint">这些结局不会请求模型。此前的记事决定哪些方案已经准备妥当。</p>`;
    actions = `<button class="ew-choice" data-ending="anchor">以自己的远方维持救援线<small>长明航约 · 付出记忆，建立今后的轮值义务</small></button>
      <button class="ew-choice" data-ending="unbound"${disabled(!canUnbind(state))}>拆开主环，归还所有记忆<small>${canUnbind(state) ? '无主的天空 · 放弃高速主航路' : '需完成墨鹭支线，留痕至少三点'}</small></button>`;
  } else {
    const ending = ENDINGS[state.ending!];
    panel = `<div class="ew-ending"><span class="ew-kicker">${state.ending === 'lost' ? '这一次，尚未抵达' : '旅途完成'}</span><h3 data-ending-title>${ending.title}</h3><p>${ending.text}</p><p class="ew-hint">等级${level(state)} · 完成${Object.keys(state.completed).length}项记事 · 历经${state.rounds}轮战斗</p></div>`;
    actions = '<button class="ew-primary" data-open="journal">翻阅这段旅程</button><button data-open="restart">重新启程</button>';
  }
  set('[data-panel]', panel);
  set('[data-actions]', actions);
}
export function routeContent(state: State, busy: boolean) {
  const open = unlocked(state);
  return `<p class="ew-dialog-lede">余烬图不画距离，只画仍有人等候的地方。</p><p>${objective(state)}。往返不花铜叶；阅读不记行动。</p>
    <div class="ew-route-grid">${LOCATIONS.map((id, i) => `<button data-travel="${id}"${disabled(busy || state.phase !== 'travel' || !open.includes(id) || state.location === id)}>
      <span class="ew-route-number">${String(i + 1).padStart(2, '0')}</span><b>${PLACE_NAMES[id]}</b><span>${state.location === id ? '当前所在' : open.includes(id) ? PLACE_STORY[id].subtitle : '航路尚未点亮'}</span></button>`).join('')}</div>`;
}
export function storyContent(state: State) {
  const q = state.pending ? questById(state.pending.quest) : available(state)[0];
  return `<p class="ew-kicker">${ACTS[state.act - 1].title}</p><p class="ew-dialog-lede">${ACTS[state.act - 1].text}</p>
    ${!state.completed.departure ? `<p>${INTRO}</p>` : ''}<h3>${PLACE_NAMES[state.location]}</h3><p>${PLACE_STORY[state.location].text}</p><p>${PLACE_STORY[state.location].detail}</p>
    ${q ? `<hr><h3>${q.title}</h3><p>${QUEST_STORY[q.id][0]}</p><p>任务报酬：阅历${q.xp}，铜叶${q.coins}。${q.branches.map(b => b.consequence).join(' / ')}</p>` : ''}
    <h3>刚刚发生</h3>${state.log.slice(-4).map(line => `<p>${escapeMarkup(line)}</p>`).join('')}`;
}
export function journalContent(state: State) {
  return `<p class="ew-dialog-lede">十二项记事 · 已完成 ${Object.keys(state.completed).length}</p>
    <p>${STANCES.map(id => `${STANCE_NAMES[id]} ${state.values[id]}`).join(' · ')}。这些不是善恶分数，而是你实际准备过的办法。</p>
    ${QUESTS.map(q => {
      const completed = state.completed[q.id];
      const ready = q.requires.every(id => state.completed[id]);
      return `<details${state.pending?.quest === q.id ? ' open' : ''}><summary>${completed ? '已完成' : ready ? '可追寻' : '未解锁'} · ${q.title}${q.optional ? '（同伴／集市支线）' : ''}</summary>
        <p>${PLACE_NAMES[q.location]} · 第${q.act}幕 · 前置：${q.requires.length ? q.requires.map(id => questById(id).title).join('、') : '无'}</p>
        ${ready ? `<p>${QUEST_STORY[q.id][0]}</p>` : '<p>先沿点亮的航路前进，新的记事会逐渐显现。</p>'}
        <p>固定报酬：阅历${q.xp}、铜叶${q.coins}${q.recruit ? `、${CHARACTERS[q.recruit].name}入队` : ''}。</p>
        ${q.branches.map(b => `<p>${completed === b.id ? '你的选择：' : ''}${b.label}。${b.consequence}</p>`).join('')}
        ${completed ? `<blockquote>${QUEST_STORY[q.id][1]}</blockquote>` : ''}</details>`;
    }).join('')}<h3>沿途记录</h3><ol class="ew-history">${state.log.map(line => `<li>${escapeMarkup(line)}</li>`).join('')}</ol>`;
}
export function partyContent(state: State) {
  return `<p class="ew-dialog-lede">同行，不是意见相同。</p><p>三位同伴全部参与战斗，共享帆车生命，各有独立心火与站位。代理按公开目标选择行动。</p>
    ${PEOPLE.map(id => {
      const c = CHARACTERS[id], companion = COMPANIONS.find(member => member === id);
      return `<details${id === 'you' ? ' open' : ''}><summary>${c.name} · ${c.role}${companion ? state.party.includes(companion) ? ` · 已同行／羁绊${state.bonds[companion]}` : ' · 尚未同行' : ''}</summary>
        <div class="ew-character-sheet">${portrait(id)}<div><p>${c.design}</p><p>${c.biography}</p></div></div>
        <p><b>想要：</b>${c.goal}</p><p><b>不擅长：</b>${c.flaw}</p><p><b>与同行者：</b>${c.bond}</p><p><b>实际职责：</b>${c.mechanic}</p></details>`;
    }).join('')}`;
}
export function bagContent(state: State, busy: boolean) {
  const town = state.phase === 'travel' && !busy, growth = progression(state.xp, CURVE);
  return `<p class="ew-dialog-lede">等级 ${growth.level} · 阅历 ${growth.xp}${growth.nextThreshold === null ? ' · 航技已臻圆满' : ` / ${growth.nextThreshold}`}</p>
    <p>可用航技点 <b data-points>${state.points}</b>。每升一级得一点，升级提高生命上限四点。航技至多各三阶。</p>
    <div class="ew-shop-row"><button data-build="fire"${disabled(!town || !state.points || state.build.fire >= 3)}>烬火航技 ${state.build.fire}/三阶</button><span>每阶普攻＋一、烬火＋二；二阶心火上限＋一。</span></div>
    <div class="ew-shop-row"><button data-build="shelter"${disabled(!town || !state.points || state.build.shelter >= 3)}>守帆航技 ${state.build.shelter}/三阶</button><span>每阶生命上限＋四、主动护持＋一；不会凭空治疗。</span></div>
    <h3>行囊</h3><div class="ew-items">${ITEMS.map(id => `<p><span>${ITEM_NAMES[id]}</span><b data-item="${id}">${state.bag[id]}</b></p>`).join('')}</div>
    <h3>单一装具槽</h3><p>当前：${state.equipment === 'none' ? '未装配' : ITEM_NAMES[state.equipment]}。装配不消耗物品；更换不会回血或叠加效果。</p>
    <div class="ew-equipment">${(['none', 'lens', 'coat'] as const).map(id => `<button data-equip="${id}"${disabled(!town || state.equipment === id || id !== 'none' && !state.bag[id])}>${id === 'none' ? '卸下装具' : ITEM_NAMES[id]}</button>`).join('')}</div>
    <p>折光镜：攻击＋二。帆织披肩：生命上限＋六，每次受击减伤一。温灯药：战斗中消耗一轮，恢复十六生命。</p>
    <h3>百帆集的有限存货</h3>${(['tonic', 'lens', 'coat'] as const).map(id => `<div class="ew-shop-row"><button data-buy="${id}"${disabled(!town || state.location !== 'market' || !state.stock[id] || state.bag.coin < PRICES[id])}>购买${ITEM_NAMES[id]}</button><span>${PRICES[id]}铜叶 · 余${state.stock[id]}</span></div>`).join('')}
    <p>没有转卖、免费复活或自动补货。只有扎营地能以四铜叶完全恢复；战斗期间不能扎营、换装或升级。</p>`;
}
export const HELP = `<p class="ew-dialog-lede">你负责决定去哪里、相信谁，以及如何回应已公开的危险。</p>
  <h3>第一次出发</h3><p>点击“与岚缇商议”。需要支持工具调用的模型连接；没有连接时，请打开下方“模型”。商议成功后读两种抉择，选一项招募她。随后在“航路”前往悬缆峡。</p>
  <h3>一轮战斗</h3><p>先“聆听本轮战术”，敌我代理会公布站位和意图；此时玩家尚未选择。再选左舷、中桥或右舷，以及敌人目标，最后点击技能。每轮可移动一格。普攻不耗心火，烬火消耗二点并留下两轮灼伤，护持回复二点心火，温灯药恢复十六生命。</p>
  <p>敌人普攻重击标记的一路，扫击覆盖落点与相邻路；躲开仍有二点车体擦伤。己方护持只保护该路。红色地块表示危险。远路攻击减伤二点。先处理余烬、玩家行动和同伴行动，再结算仍存活敌人的攻击；敌方护持从本轮开始就生效。</p>
  <p>同伴各有三点心火。墨鹭疗愈、巧砂破甲均耗二点，护持恢复一点。岚缇擅长护持，巧砂攻击较强；她们由真实模型按各自目标决定，不会在失败时自动替补。第六轮起每轮悬缆崩裂额外伤害十二，不能无限拖延。</p>
  <h3>成长与分歧</h3><p>任务奖励只发一次，升级获得航技点。城镇中打开“行囊与航技”选择成长和单一装备。守诺、留痕、解缆没有统一好坏；三位同伴支线与至少三点解缆会解锁不战终局。完成墨鹭支线且留痕至少三点，才有拆除主环的知识。</p>
  <h3>阅读、输入和存档</h3><p>故事、行旅簿、同伴、物品都在可滚动的原生对话框里，关闭可按退出键。所有按钮支持触摸与键盘切换焦点，选择框支持方向键；战线地块也可用回车或空格选择。没有必须记住的全局快捷键。</p>
  <p>每次接受的行动自动存档，导入时逐条重演规则；失败的导入不会覆盖当前旅途。阅读、选择目标、切换面板不写入行动。模型只在你点击商议或战术时调用，每轮最多两次请求；错误、取消或过期响应不会扣资源或推进时钟。下方模型状态始终可达，可打开记录查看完整错误。重新启程会取消正在等待的计划。</p>`;
