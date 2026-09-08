import { escapeMarkup, query } from '../../core/page';
import type { createProjectPage } from '../../core/page';
import { AgentValidationError } from '../../core/agents/errors';
import type { GameSession } from '../../core/games/session';
import {
  CLASS_IDS, CLASSES, DISGUISE_NAMES, ENDINGS, FACT_IDS, FACTS, FACTION_NAMES, FACTIONS,
  ITEM_IDS, ITEMS, METHODS, METHOD_NAMES, NPC_IDS, NPCS, QUEST_IDS, QUESTS, ROUTES, SCENES, SKILL_IDS, SKILLS,
} from './data';
import type { Disguise, Method, NpcId, Topic } from './data';
import {
  ability, encounterGate, endingGate, hasFact, level, nextHint, parseCommand, questReady, routeGate, routeKey,
  walkAllowed,
} from './engine';
import type { Command, State } from './engine';
import { ACTS, BIOGRAPHIES, ENDING_STORY, INTRO, LOSS_STORY, QUEST_STORY, SCENE_STORY, factText } from './story';
import { cityMap, diorama, portrait } from './art';

type Page = ReturnType<typeof createProjectPage>;
type Pane = 'wallet' | 'quests' | 'evidence' | 'people' | 'map' | 'story' | 'help' | 'ending' | 'restart';
const paneNames: Record<Pane, string> = {
  wallet: '身份名夹', quests: '委托与任务分支', evidence: '六证案卷', people: '城中故人',
  map: '雾津实测地图', story: '雨夜手记', help: '行事须知', ending: '黎明契约', restart: '重开调查',
};
const disguiseFor: Partial<Record<string, Disguise>> = { 'stage-pass': 'stage', 'clerk-pass': 'clerk', 'worker-pass': 'worker' };
const esc = escapeMarkup;
const paras = (lines: readonly string[]) => lines.map(line => `<p>${esc(line)}</p>`).join('');

export function createRenderer(
  page: Page,
  session: GameSession<State, Command>,
  callbacks: {
    encounter(npc: NpcId, topic: Topic, method: Method): Promise<void>;
    reset(fresh: boolean): void;
  },
) {
  const root = page.root;
  root.dataset.workspace = 'true';
  root.lang = 'zh-CN';
  root.tabIndex = -1;
  root.innerHTML = `
    <header class="bn-header"><div><p class="bn-kicker">雾津 · 姓名抵押调查局</p><h1>借名之城</h1></div><div class="bn-header-tools"><button data-pane="help" aria-label="行事须知">须知</button><button data-notebook>存档</button><button data-pane="restart">重开</button></div></header>
    <nav class="bn-tabs" aria-label="调查工具"><button data-pane="wallet">名夹</button><button data-pane="quests">委托</button><button data-pane="evidence">证据</button><button data-pane="people">人物</button><button data-pane="map">地图</button><button data-pane="story">手记</button></nav>
    <section class="bn-hud" aria-label="调查者状态" data-hud></section>
    <main class="bn-main">
      <section class="bn-world" data-project-preview aria-label="当前雨夜场景">
        <div class="bn-diorama" data-art></div>
        <div class="bn-world-label"><p data-act></p><h2 data-location></h2><p data-scene-sub></p></div>
        <button class="bn-object" data-pane="evidence" aria-label="查看现场物件与六证案卷"><span>⌑</span><b data-object></b></button>
        <button class="bn-world-person" data-pane="people" aria-label="查看当前人物档案" data-world-person></button>
        <button class="bn-world-map" data-pane="map">展开实测图</button>
      </section>
      <section class="bn-controls" aria-label="现场行动" tabindex="-1">
        <p class="bn-hint" data-hint></p><div data-actions></div>
      </section>
    </main>
    <footer class="bn-footer"><div class="bn-notices"><p data-notice role="status" aria-live="polite">阅读不计行动。角色交涉需模型连接，失败或取消不收游戏费用。</p><button data-pane="story" class="bn-last" data-last></button></div><div data-console></div></footer>
    <dialog class="bn-dialog" aria-labelledby="bn-dialog-title"><header><h2 id="bn-dialog-title"></h2><button data-close aria-label="关闭案夹">关闭</button></header><div class="bn-dialog-body" data-dialog-body></div></dialog>`;
  const hud = query<HTMLElement>(root, '[data-hud]');
  const art = query<HTMLElement>(root, '[data-art]');
  const actions = query<HTMLElement>(root, '[data-actions]');
  const dialog = query<HTMLDialogElement>(root, '.bn-dialog');
  const body = query<HTMLElement>(root, '[data-dialog-body]');
  const noticeElement = query<HTMLElement>(root, '[data-notice]');
  let pane: Pane = 'help', busy = false, selectedMethod: Method = 'listen';
  let lastArt = '', lastRole: State['role'] = null;

  function reason(command: Command): string {
    if (busy) return '角色正在思考；可以读资料，或取消本轮交涉。';
    try { session.preview(command); return ''; }
    catch (error) { if (!(error instanceof AgentValidationError)) throw error; return error.message; }
  }
  function button(label: string, command: Command, extra = '') {
    const why = reason(command);
    return `<button type="button" class="bn-action ${extra}" data-command="${esc(JSON.stringify(command))}" data-cmd="${command.type}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(label)}</button>`;
  }
  function agentButton(npc: NpcId, topic: Topic, label: string) {
    const why = busy ? '角色正在思考' : encounterGate(session.state, npc, topic);
    return `<button type="button" class="bn-action bn-primary" data-encounter="${topic}" data-npc="${npc}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(label)}</button>`;
  }
  function routesMarkup(s: State) {
    return ROUTES.filter(r => r.a === s.location || r.b === s.location).map(route => {
      const to = route.a === s.location ? route.b : route.a, gate = routeGate(s, to), key = routeKey(s, to);
      const method = s.checks[key] && !s.checks[key].pass ? 'bribe' : 'sneak';
      return `<div class="bn-route"><strong>${SCENES[to].name}</strong><small>${route.name}${gate ? ` · ${gate}` : ''}</small><div class="bn-inline">${button('步行 · １精力', { type: 'move', to, mode: 'walk' })}${!walkAllowed(s, to) || route.gate === 'roof' ? button(method === 'bribe' ? '遮灯 · ３银２精力' : `潜入 · 难度${route.dc + s.patrol + (s.noise >= 5 ? 1 : 0)}`, { type: 'move', to, mode: method }) : ''}</div></div>`;
    }).join('');
  }
  function renderActions(s: State): string {
    if (s.phase === 'choosing') return `<h3>你借哪种本领入城？</h3><p>一枚本名，一夜调查。选择不可中途更换。</p>${CLASS_IDS.map(role =>
      `<article class="bn-class">${button(CLASSES[role].name, { type: 'start', role }, 'bn-primary')}<strong>${CLASSES[role].subtitle}</strong><p>${CLASSES[role].description}</p><small>听辨 ${CLASSES[role].stats.listen} · 周旋 ${CLASSES[role].stats.perform} · 潜行 ${CLASSES[role].stats.shadow}</small></article>`).join('')}<button class="bn-action" data-pane="story">先读序章</button>`;
    if (s.phase === 'won' || s.phase === 'lost') return `<h3>${s.ending ? ENDING_STORY[s.ending].title : '雨里无门 · 调查终止'}</h3><p>${s.phase === 'lost' ? esc(s.loss) : '你选择的代价已经写入城市。'}</p><button class="bn-action bn-primary" data-pane="ending">阅读${s.phase === 'won' ? '结局' : '失败记录'}</button><button class="bn-action" data-pane="restart">重新开始调查</button><button class="bn-action" data-pane="quests">查看已完成委托</button>`;
    const scene = SCENES[s.location], npc = scene.npc;
    let content = `<label class="bn-method">交涉／勘验方式<select data-method aria-label="交涉与勘验方式" ${busy ? 'disabled' : ''}>${METHODS.map(m => `<option value="${m}" ${m === selectedMethod ? 'selected' : ''}>${METHOD_NAMES[m]} · 能力${ability(s, m)}</option>`).join('')}</select></label>`;
    if (npc) {
      content += `<div class="bn-encounter"><strong>${NPCS[npc].name}<small>${NPCS[npc].job}</small></strong><p>${NPCS[npc].desire}</p>`;
      if (s.location === 'court') {
        content += agentButton(npc, 'hearing', '请求终审交涉');
        if ((s.conversations[`${npc}:hearing`] ?? 0) > 0 && !s.heard) content += button('强制陈述 · ６银２压力', { type: 'petition', npc, topic: 'hearing' });
      } else {
        if (!s.leads[NPCS[npc].fact]) content += agentButton(npc, 'lead', `交涉 · ${NPCS[npc].name}`);
        if ((s.conversations[`${npc}:lead`] ?? 0) > 0 && !s.leads[NPCS[npc].fact]) content += button('付费调档 · ５银２压力', { type: 'petition', npc, topic: 'lead' });
        if (hasFact(s, NPCS[npc].fact) && !s.allies.includes(npc)) {
          content += agentButton(npc, 'pact', `请求${NPCS[npc].name}担保`);
          const gate = encounterGate(s, npc, 'pact');
          if (gate) content += `<small>${esc(gate)}</small>`;
        }
        if (s.allies.includes(npc)) content += '<p class="bn-good">已与你建立公开担保。</p>';
      }
      content += '</div>';
    }
    if (scene.fact) {
      const fact = scene.fact, taken = hasFact(s, fact);
      content += `<div class="bn-investigation"><h3>${taken ? '已核验' : '现场物件'} · ${scene.object}</h3>`;
      if (taken) content += `<p>${FACTS[fact].name}已入案卷。</p>`;
      else if (s.checks[`search:${fact}`]) content += button('复勘实物 · ４银２精力', { type: 'search', fact, method: selectedMethod, mode: 'recover' });
      else content += `<small>固定六面检定＋能力，对抗难度${FACTS[fact].dc}；${METHOD_NAMES[FACTS[fact].method]}额外＋１。</small>${button('勘验实物 · ２精力', { type: 'search', fact, method: selectedMethod, mode: 'steady' })}${button('精勘实物 · ３银２精力', { type: 'search', fact, method: selectedMethod, mode: 'careful' })}`;
      content += '</div>';
    }
    if (s.location === 'clinic') {
      if (!s.aided) content += button('送一份温盐药', { type: 'aid' });
      if (hasFact(s, 'pulse') && s.identity === 'undecided') {
        content += `<div class="bn-choice"><h3>不可撤回的名单决定</h3><p>保护化名保留民间担保；公开名单换取署方支持，却失去民间担保。公开前须取得贺迟或晏珩担保，保有未抵押、无救济债的本名。</p>${button('保护病人化名', { type: 'identity', decision: 'protect' })}${button('公开病人名单', { type: 'identity', decision: 'expose' })}</div>`;
      }
    }
    if (s.location === 'alley') content += `<div class="bn-inline"><button class="bn-action" data-pane="wallet">购置装备与服饰</button>${button('搬货 · ２精力换４银', { type: 'work' })}${button('抵押本名 · 换１２银', { type: 'pawn' })}</div>`;
    if (s.location === 'ferry' && (s.vigor < 12 || s.silver < 3)) content += button('借宿避雨棚 · 记救济债', { type: 'shelter' });
    if (s.location === 'tower' && s.act === 2) content += `<button class="bn-action bn-primary" data-file-pane>整理并提交六证案卷</button>`;
    if (s.location === 'court') content += `<div class="bn-endings"><h3>选择你能兑现的契约</h3>${ENDINGS.map(ending => `<article>${button(ENDING_STORY[ending].title, { type: 'finish', ending })}<small>${esc(endingGate(s, ending) || '条件已满足；签字后本轮结束。')}</small></article>`).join('')}</div>`;
    content += `<div class="bn-quick"><h3>照顾自己</h3><div class="bn-inline">${button(`服温盐药 · 余${s.bag.tonic}`, { type: 'use', item: 'tonic' })}${button(`饮压惊茶 · 余${s.bag.tea}`, { type: 'use', item: 'tea' })}${['ferry', 'alley', 'clinic'].includes(s.location) ? button('休整 · ３银', { type: 'rest' }) : ''}</div></div>`;
    content += `<section class="bn-routes"><h3>离开此地 · 实际相邻街道</h3>${routesMarkup(s)}</section>`;
    return content;
  }

  function wallet(s: State) {
    const growth = level(s);
    return `<div class="bn-wallet"><div class="bn-paper"><small>雾津临时通行身份</small><h3>${s.role ? CLASSES[s.role].name : '尚未入城'}</h3><p>${DISGUISE_NAMES[s.disguise]}</p><strong>${s.pawned ? '本名已押 · 不得转赎' : '本名自持'}</strong><span class="bn-stamp">借名<br>有凭</span></div><p>阅历 ${s.xp} · 等级 ${growth.level} · ${growth.nextThreshold === null ? '成长圆满' : `下级需${growth.remaining}阅历`}<br>可用技能点 ${s.skillPoints} · 工具位：${s.gear ? ITEMS[s.gear].name : '无'}</p></div>
      <h3>成长选择</h3><p>每次升级获得１技能点。每项只能学习一次；职业起点不同，技能可自由组合。</p><div class="bn-two">${SKILL_IDS.map(skill => `<article><h4>${SKILLS[skill].name}${s.skills.includes(skill) ? ' · 已掌握' : ''}</h4><p>${SKILLS[skill].detail}</p>${button(`习得${SKILLS[skill].name}`, { type: 'learn', skill })}</article>`).join('')}</div>
      <h3>阵营与人情</h3><p>${FACTIONS.map(f => `${FACTION_NAMES[f]}：${s.factions[f]}`).join(' ／ ')}<br>避雨棚救济债：${s.debts}；本轮不能抹去。</p>
      <h3>随身物资 · 容量十六／单类最多五</h3><p>商店仅在折伞巷营业；装备与衣服各只持有一件。换装不赎回本名。</p><div class="bn-two">${ITEM_IDS.map(item => `<article><h4>${ITEMS[item].name} × ${s.bag[item]}</h4><p>${ITEMS[item].detail}</p><div class="bn-inline">${s.bag[item] > 0 ? ITEMS[item].type === 'consumable' ? button(`使用${ITEMS[item].name}`, { type: 'use', item }) : ITEMS[item].type === 'gear' ? button(`装备${ITEMS[item].name}`, { type: 'equip', item }) : button(`穿上${ITEMS[item].name}`, { type: 'wear', disguise: disguiseFor[item]! }) : ''}${s.location === 'alley' ? button(`购买${ITEMS[item].name} · ${ITEMS[item].price}银`, { type: 'buy', item }) : ''}</div></article>`).join('')}</div>${button('换回本名便衣', { type: 'wear', disguise: 'own' })}`;
  }
  function fileForm(s: State) {
    return `<section class="bn-file"><h3>提交六证案卷</h3><p>必须在雨钟塔，核验六件原物、决定病人名单并结算前置主线。错误陈述压力＋３，同一错误不能重试。正确提交消耗１精力。</p><form data-case-form>
      <label>获利案由<select name="motive"><option value="mortgage">借名债券吞并街产</option><option value="rescue">防汛救灾</option><option value="theater">戏班伪造身份牟利</option></select></label>
      <label>两份原物共同的印模<select name="stamp"><option value="broken">折角印</option><option value="double">双环印</option></select></label>
      <label>封街与涨潮的先后<select name="timing"><option value="before">封街在涨潮之前</option><option value="after">封街在涨潮之后</option></select></label>
      <button class="bn-action bn-primary" type="submit" ${busy || s.filed || s.phase !== 'playing' ? 'disabled' : ''}>提交案卷 · １精力</button></form></section>`;
  }
  function paneContent(s: State): string {
    switch (pane) {
      case 'wallet': return wallet(s);
      case 'quests': return `<p>主线推动三幕，支线改变担保、成长与结局。每份报酬只结算一次。已完成 ${s.claimed.length}／１２。</p>${QUEST_IDS.map(id => `<article class="bn-quest ${s.claimed.includes(id) ? 'bn-done' : ''}"><small>第${QUESTS[id].act}幕 · ${QUESTS[id].kind} · ${s.claimed.includes(id) ? '已结算' : questReady(s, id) ? '待领取' : '进行中'}</small><h3>${QUESTS[id].name}</h3><p>${QUESTS[id].objective}</p><p>${QUEST_STORY[id]}</p>${questReady(s, id) ? button(`领取「${QUESTS[id].name}」报酬`, { type: 'claim', quest: id }, 'bn-primary') : ''}<small>阅历＋${QUESTS[id].xp} · 银钱＋${QUESTS[id].silver}</small></article>`).join('')}`;
      case 'evidence': return `<p>台词只给线索，原物才给证据。六份来源互相独立；换世界后必须重新核对印模。</p>${FACT_IDS.map(id => {
        const evidence = s.evidence.find(e => e.id === id);
        return `<article class="bn-evidence"><small>${evidence ? '已核验原物' : s.leads[id] ? '已知位置 · 尚未核验' : '尚无线索'}</small><h3>${FACTS[id].name}</h3><p>${evidence ? factText(id, s.seed) : FACTS[id].description}</p>${evidence ? `<p class="bn-provenance">保管人：${NPCS[evidence.witness].name} · ${evidence.leadSource === 'agent' ? '真实角色交涉指出位置' : '交涉受阻后的付费调档'} · 实物压痕编号${evidence.imprint}</p>` : ''}</article>`;
      }).join('')}${fileForm(s)}`;
      case 'people': return `<p>每位角色只知自己保管的一段事实。担保需要独立交涉；民间角色有保护病人名单的底线。</p>${NPC_IDS.map(n => `<article class="bn-person"><div>${portrait(n, 'dossier')}<h3>${NPCS[n].name}</h3><small>${NPCS[n].job} · ${FACTION_NAMES[NPCS[n].faction]}</small><p>信任 ${s.trust[n]} · ${s.allies.includes(n) ? '已担保' : '尚未担保'}</p></div><div>${paras(BIOGRAPHIES[n])}<p><b>所求：</b>${NPCS[n].desire}</p><p><b>弱点：</b>${NPCS[n].flaw}</p><p><b>归属：</b>${NPCS[n].allegiance}</p><p><b>关系门槛：</b>${NPCS[n].gate}</p></div></article>`).join('')}`;
      case 'map': return `${cityMap(s.location, s.visits)}<p>红点为${SCENES[s.location].name}。只有真实相邻的道路能移动；地图查看免费。灰褂通署门，油衣通工道；屋脊只能潜行。离开受限街区不重新查验衣服。</p>${routesMarkup(s)}`;
      case 'story': return `<h3>序章 · 名字可以卖，身体不能搬走</h3>${paras(INTRO)}<h3>${ACTS[s.act - 1].name}</h3><p>${ACTS[s.act - 1].text}</p><h3>${SCENES[s.location].name}</h3>${paras(SCENE_STORY[s.location])}<h3>公开行动记忆</h3><ol class="bn-log">${s.log.map(line => `<li>${esc(line)}</li>`).join('')}</ol>`;
      case 'ending': return s.ending ? `<h3>${ENDING_STORY[s.ending].title}</h3>${paras(ENDING_STORY[s.ending].text)}<p>行动 ${s.turn}／２４０ · 角色交涉 ${s.agentTurns} · 等级 ${level(s).level} · 完成委托 ${s.claimed.length}／１２。</p>` : `<h3>${s.phase === 'lost' ? esc(s.loss) : '黎明尚未到来'}</h3><p>${LOSS_STORY}</p>`;
      case 'restart': return `<h3>让雨重新落下</h3><p>这会取消未提交的模型行动并清空本轮案卷。相同世界保留印模与固定检定；新世界改变它们。可先用「存档」导出回放。</p><button class="bn-action bn-primary" data-reset="same">同一世界重新开始</button><button class="bn-action" data-reset="fresh">生成新的雾津</button>`;
      case 'help': return `<h3>先做什么</h3><p>${nextHint(s)}</p><h3>一夜的尺度</h3><p>选择职业、在名夹学习技能，与阮灯交涉，再勘验渡口封套。前往戏楼取袖纹，领取两项主线后进入第二幕。查账、查病历、查潮钟，选择名单去向；取原令、六证结案，最后在公庭谈判并签字。正常调查约六十至一百二十步，最多二百四十步；查看地图、阅读和切换面板不计行动。</p>
        <h3>角色不是裁判</h3><p>只有主动按交涉或担保按钮才发送模型请求。每次交涉最多两次请求，每次上限一千五百三十六生成词元、整轮最多六十秒。网络失败、非法意图、取消或过期响应不消耗游戏资源；服务商可能仍计算已经处理的请求费用。此游戏没有离线角色替代。</p>
        <h3>检定、风险与恢复</h3><p>能力＋固定六面结果对抗难度。同一物件与潜入路线不能反复掷骰。精勘加四但花三银；失手后复勘花四银。潜入失败留在原地，警戒加三、压力加二；可花三银遮灯通行。服饰给的是法律许可，不是隐形。角色加派的巡逻会提高后续潜入难度。</p><p>已提交的角色拒绝后，可花五银调档、增加两压力并损失阵营声望，仍须勘验实物。终审受阻可花六银行使强制陈述权。担保永远需要角色亲自同意。所有角色不合作时，保护化名、抵押本名的作桥路线仍可达成，但必须完成六处真实交涉与终审交涉，不能离线解谜通关。</p>
        <h3>失败与经济</h3><p>精力归零、压力达到十二、警戒达到十或用尽二百四十步即失败。三银休整恢复九精力、降低三压力与二警戒；短工仅两次，抵名仅一次，救济仅两次。委托、技能与身份物品都不能重复刷取。</p>
        <h3>结局代价</h3><p>共名街：保护化名、送药结算、互助会声望至少二，并取得裴绡／乔砚／陆芦的担保。有名之约：公开名单、未抵押本名且无救济债、署方声望至少二，并取得贺迟／晏珩担保。借我作桥：保护化名并抵押自己的本名。三者都需要六证案卷与一次真实终审交涉。</p>
        <h3>键盘与触摸</h3><p>所有场景物件都有按钮替代，不需要精确点图。用制表键切换按钮，回车或空格操作；地图快捷键 M，名夹 I，委托 J，证据 E，须知 H。对话框中快捷键停用，退出键关闭；输入框和下拉框不触发快捷键。没有自动播放的声音，减少动态偏好会停止雨线移动。</p>`;
    }
  }

  function renderPane() {
    query<HTMLElement>(dialog, '#bn-dialog-title').textContent = paneNames[pane];
    body.innerHTML = paneContent(session.state);
  }
  function openPane(next: Pane) {
    pane = next; renderPane();
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
  }
  function notice(message: string) { noticeElement.textContent = message; }
  function render() {
    const s = session.state, scene = SCENES[s.location];
    if (s.role !== lastRole && s.role) {
      selectedMethod = METHODS.reduce((best, m) => CLASSES[s.role!].stats[m] > CLASSES[s.role!].stats[best] ? m : best, 'listen');
    }
    lastRole = s.role;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeCommand = active?.dataset.command, activeEncounter = active?.dataset.encounter;
    hud.innerHTML = `<span><b>${s.role ? CLASSES[s.role].name : '待定身份'}</b> · ${level(s).level}级</span><span>精力 <b class="${s.vigor <= 5 ? 'bn-danger' : ''}">${s.vigor}／24</b></span><span>银 <b>${s.silver}</b></span><span>压力 <b class="${s.stress >= 8 ? 'bn-danger' : ''}">${s.stress}／12</b></span><span>警戒 <b class="${s.noise >= 7 ? 'bn-danger' : ''}">${s.noise}／10</b></span><span>第${s.turn}步</span>`;
    query<HTMLElement>(root, '[data-act]').textContent = ACTS[s.act - 1].name;
    query<HTMLElement>(root, '[data-location]').textContent = scene.name;
    query<HTMLElement>(root, '[data-scene-sub]').textContent = scene.sub;
    query<HTMLElement>(root, '[data-object]').textContent = scene.object;
    query<HTMLElement>(root, '[data-hint]').textContent = nextHint(s);
    query<HTMLElement>(root, '[data-last]').textContent = s.log.at(-1) ?? '';
    const signature = `${s.location}:${scene.fact ? hasFact(s, scene.fact) : false}`;
    if (signature !== lastArt) {
      art.innerHTML = diorama(s.location, scene.fact ? hasFact(s, scene.fact) : false);
      const person = query<HTMLElement>(root, '[data-world-person]');
      person.hidden = !scene.npc;
      person.innerHTML = scene.npc ? `${portrait(scene.npc)}<span>${NPCS[scene.npc].name}</span>` : '';
      lastArt = signature;
    }
    actions.innerHTML = renderActions(s);
    if (dialog.open) renderPane();
    root.dataset.phase = s.phase; root.dataset.location = s.location; root.dataset.turn = String(s.turn);
    if (active && !active.isConnected) {
      const candidates = [...root.querySelectorAll<HTMLButtonElement>('button')];
      const replacement = candidates.find(b => !b.disabled && ((activeCommand && b.dataset.command === activeCommand) || (activeEncounter && b.dataset.encounter === activeEncounter)));
      if (replacement) replacement.focus({ preventScroll: true });
      else if (dialog.open) query<HTMLButtonElement>(dialog, '[data-close]').focus({ preventScroll: true });
    }
  }
  function commit(command: Command) {
    try {
      session.preview(command);
      session.dispatch(command);
      notice(session.state.log.at(-1) ?? '行动已记录。');
      if (command.type === 'move' || command.type === 'finish') dialog.close();
      if (session.state.phase === 'won' || session.state.phase === 'lost') openPane('ending');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(error.message);
      if (dialog.open) {
        const errorLine = document.createElement('p');
        errorLine.className = 'bn-danger'; errorLine.setAttribute('role', 'alert'); errorLine.textContent = error.message;
        body.prepend(errorLine); body.scrollTop = 0;
      }
    }
  }
  root.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target || !root.contains(target) || target instanceof HTMLButtonElement && target.disabled) return;
    if (target.hasAttribute('data-close')) { dialog.close(); return; }
    if (target.dataset.pane && Object.hasOwn(paneNames, target.dataset.pane)) { openPane(target.dataset.pane as Pane); return; }
    if (target.hasAttribute('data-file-pane')) { openPane('evidence'); body.querySelector('.bn-file')?.scrollIntoView({ block: 'start' }); return; }
    if (target.dataset.reset) { dialog.close(); callbacks.reset(target.dataset.reset === 'fresh'); return; }
    if (target.dataset.command && !busy) { commit(parseCommand(JSON.parse(target.dataset.command))); return; }
    if (target.dataset.encounter && target.dataset.npc && !busy) {
      const npc = NPC_IDS.find(n => n === target.dataset.npc), topic = (['lead', 'pact', 'hearing'] as const).find(t => t === target.dataset.encounter);
      if (npc && topic) void callbacks.encounter(npc, topic, selectedMethod);
    }
  }, { signal: page.signal });
  root.addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement && event.target.hasAttribute('data-method')) {
      selectedMethod = METHODS.find(m => m === (event.target as HTMLSelectElement).value) ?? 'listen';
      render();
      query<HTMLSelectElement>(root, '[data-method]').focus({ preventScroll: true });
    }
  }, { signal: page.signal });
  root.addEventListener('submit', event => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-case-form')) return;
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.target);
    commit(parseCommand({ type: 'file', motive: data.get('motive'), stamp: data.get('stamp'), timing: data.get('timing') }));
  }, { signal: page.signal });
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog:modal') ||
      event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    const keys: Partial<Record<string, Pane>> = { m: 'map', i: 'wallet', j: 'quests', e: 'evidence', h: 'help' };
    const next = keys[event.key.toLowerCase()];
    if (next) { event.preventDefault(); openPane(next); }
  }, { signal: page.signal });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  }, { signal: page.signal });
  page.onCleanup(() => { if (dialog.open) dialog.close(); });
  render();
  root.focus({ preventScroll: true });
  return {
    render, notice, openPane,
    setBusy(value: boolean) { busy = value; render(); },
    consoleHost: query<HTMLElement>(root, '[data-console]'),
    notebookTrigger: query<HTMLElement>(root, '[data-notebook]'),
  };
}
