import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import { createAgentConsole } from '../../core/agents';
import { AgentValidationError } from '../../core/agents/errors';
import { GameSession } from '../../core/games/session';
import { createGameNotebook } from '../../core/games/notebook';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { BUILD_IDS, BUILDS, ENDING_IDS, ENDINGS, GUEST_IDS, GUESTS, ITEM_IDS, ITEMS, QUEST_IDS, QUESTS, RECIPES, RECIPE_IDS, SCENE_IDS, SCENES, SKILL_IDS, SKILLS } from './data';
import type { GuestId, SceneId } from './data';
import { act, CLUE_NAMES, definition, effectiveSkill, guestCost, hasQuest, level, objective, parseCommand, powers, recipeCost, tide, unlocked, watch } from './engine';
import type { Command } from './engine';
import { ACTS, BIOGRAPHIES, CONFESSIONS, ENDING_STORY, FAILURE, PROLOGUE, RESOLUTIONS, TIDES } from './story';
import { agendaTool, observation, SYSTEM } from './agent';
import { createWorld, keepsake, portrait } from './render';

const paragraphs = (text: string) => text.split('\n').map(line => `<p>${escapeMarkup(line)}</p>`).join('');
const MATERIAL_QUESTS = ['hearth', 'chart', 'beacon', 'heart', 'council', 'marks', 'letters'] as const;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'tidebound-house');
  page.root.dataset.workspace = 'true';
  page.root.lang = 'zh-CN';
  page.root.innerHTML = `
    <header class="tb-header">
      <div class="tb-brand"><span class="tb-brand-mark" aria-hidden="true">潮</span><div><h1>潮汐归客</h1><p>七次潮水，一座借来的屋檐</p></div></div>
      <nav aria-label="海屋随身册"><button data-journal>手记</button><button data-bag>行囊</button><button data-help>指南</button><button data-restart>重来</button></nav>
    </header>
    <div class="tb-progress"><strong data-phase></strong><span data-ap></span><span data-growth></span><span data-favor></span></div>
    <main class="tb-main">
      <section class="tb-world" aria-label="潮汐海屋">
        <div class="tb-canvas" data-project-preview></div>
        <div class="tb-scene-top"><span data-act></span><button data-camera aria-pressed="false">全景／近观</button></div>
        <div class="tb-world-caption"><span data-weather></span><span class="tb-free">查看与阅读不耗时</span></div>
      </section>
      <section class="tb-dock" aria-label="地点与行动">
        <div class="tb-objective"><strong>眼下的事</strong><p data-objective></p><button data-start>领取钥匙</button></div>
        <div class="tb-location-row"><label>查看地点<select data-location aria-label="查看地点">${SCENE_IDS.map(id => `<option value="${id}">${SCENES[id].name}</option>`).join('')}</select></label><button data-travel>前往 · 一行动</button><button data-inspect>此地事务</button><button data-guests>访客</button></div>
        <div class="tb-action-row"><button class="tb-primary" data-plan>邀请旅客 · 一行动</button><button data-next>推进潮段</button><button data-ending hidden>阅读终章</button><p data-notice role="status" aria-live="polite">先领取钥匙。所有模型请求都只由你明确发起。</p></div>
      </section>
    </main>
    <footer class="tb-footer"><div data-agent-host></div><button data-notebook aria-label="打开存档与回放">存档</button></footer>`;
  const session = new GameSession(definition, 86);
  let busy = false, selected: SceneId = 'hall', selectedGuest: GuestId = 'shen';
  let invitation = '长桌相遇，让彼此亲自说话';
  const notice = query<HTMLElement>(page.root, '[data-notice]');
  function say(text: string) { notice.textContent = text; }
  function panel(id: string, title: string, trigger?: string) {
    const content = document.createElement('section');
    content.className = 'tb-reading';
    const dialog = createWorkspaceDialog(page, {
      id: `tidebound-${id}`, title, content: [content], closeLabel: '关闭',
      className: 'tb-dialog', triggers: trigger ? [query(page.root, trigger)] : [],
    });
    return { ...dialog, content };
  }
  const opening = panel('opening', '海屋的第一把钥匙');
  const scenePanel = panel('scene', '窗外与门内');
  const guestsPanel = panel('guests', '五位旅客');
  const personPanel = panel('person', '一个尚未说完的故事');
  const journal = panel('journal', '七潮手记');
  const bag = panel('bag', '行囊与研习');
  const help = panel('help', '临时主人的指南', '[data-help]');
  const nextPanel = panel('next', '把这一段时间交还给潮水');
  const restartPanel = panel('restart', '重新迎接第一潮', '[data-restart]');
  const endingPanel = panel('ending', '潮汐的落款');
  const world = createWorld(query(page.root, '[data-project-preview]'), session.state, page.signal, id => selectScene(id), id => showGuest(id));
  page.onCleanup(world.destroy);
  const agent = createAgentConsole(page, {
    gameId: 'tidebound-house', host: query(page.root, '[data-agent-host]'), locale: 'zh-CN',
    preflight: () => session.assertCanDispatch(32768),
    onBusyChange(value) { busy = value; render(); },
  });

  function legal(command: Command): { ok: boolean; reason: string } {
    if (busy) return { ok: false, reason: '旅客正在安排议程；可阅读与看地图，或取消请求。' };
    try { session.preview(command); return { ok: true, reason: '' }; }
    catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      return { ok: false, reason: error.message };
    }
  }
  function button(command: Command, label: string, extra = '') {
    const allowed = legal(command);
    return `<button data-command="${escapeMarkup(JSON.stringify(command))}" ${allowed.ok ? '' : 'disabled'} title="${escapeMarkup(allowed.reason)}" ${extra}>${escapeMarkup(label)}</button>`;
  }
  function action(command: Command, label: string) {
    const allowed = legal(command);
    return `<div class="tb-work">${button(command, label)}${allowed.ok ? '' : `<span>${escapeMarkup(allowed.reason)}</span>`}</div>`;
  }
  function dispatch(command: Command) {
    if (busy) { say('请等待议程完成或先取消；当前世界没有改变。'); return; }
    try {
      session.dispatch(command);
      say(session.state.log.at(-1) ?? '行动完成。');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      say(error.message); page.report(error.message);
    }
  }
  function selectScene(id: SceneId) {
    selected = id; render();
  }
  function renderScene() {
    const state = session.state, scene = SCENES[selected];
    const here = state.location === selected;
    scenePanel.content.innerHTML = `<p class="tb-eyebrow">${here ? '你正在这里' : '正在免费查看'} · ${unlocked(state, selected) ? '道路已开' : '尚未解锁'}</p><h3>${scene.name}</h3>${paragraphs(scene.description)}
      ${here ? '' : action({ type: 'travel', scene: selected }, '走到这里 · 一行动')}
      ${here && state.phase === 'play' ? `
      ${scene.resource ? action({ type: 'gather' }, `拾取${ITEMS[scene.resource].name}二 · 一行动 · 余${state.stock[selected]}`) : ''}
      ${scene.clue ? action({ type: 'explore' }, `辨读线索 · ${effectiveSkill(state, 'lore') >= 2 ? '一' : '二'}行动${state.clues.includes(scene.clue) ? ' · 已辨读' : ''}`) : ''}
      ${MATERIAL_QUESTS.filter(id => ({ hearth: 'hall', chart: 'archive', beacon: 'lighthouse', heart: 'loft', council: 'hall', marks: 'cliff', letters: 'hall' })[id] === selected).map(id => `<div class="tb-quest-line"><h4>${QUESTS[id].name}${hasQuest(state, id) ? ' · 已完成' : ''}</h4><p>${QUESTS[id].hint}</p>${action({ type: 'quest', quest: id }, `${hasQuest(state, id) ? '已完成' : id === 'hearth' ? '修炉座' : id === 'chart' ? '合读潮图' : id === 'beacon' ? '修灯塔' : id === 'heart' ? '修屋心' : id === 'council' ? '议定新约' : id === 'marks' ? '刻潮标' : '收拢称呼'} · 一行动`)}</div>`).join('')}
      ${selected === 'workshop' ? `<h3>工房配方</h3><p>匠艺二以上花一行动，否则二行动；每种配方有有限编号。屋心与仪式各需一个归潮结。</p>${RECIPE_IDS.map(id => `<div class="tb-recipe">${keepsake(RECIPES[id].gain)}<div><h4>${RECIPES[id].name}</h4><p>${recipeCost(state, id).map(stack => `${ITEMS[stack.item].name}${stack.amount}`).join('、')} · 已制${state.crafted[id]}/${RECIPES[id].cap}</p>${action({ type: 'craft', recipe: id }, `制作${ITEMS[RECIPES[id].gain].name}`)}</div></div>`).join('')}` : ''}
      ${selected === 'harbor' ? `<h3>港边换物</h3><p>一贝钱换二份材料，花一行动。只能买现货，不能卖物品或循环套利。</p>${(['wood', 'glass', 'thread', 'salt'] as const).map(item => action({ type: 'trade', item }, `换${ITEMS[item].name}二 · 余${state.market[item]}`)).join('')}` : ''}
      ${selected === 'loft' ? `<h3>仪式不是一道猜谜题</h3><p>${powerText()}</p>${ENDING_IDS.map(id => `<div class="tb-quest-line"><h4>${ENDINGS[id].name}</h4><p>${ENDINGS[id].hint}</p>${action({ type: 'ritual', ending: id }, `落款：${ENDINGS[id].name}`)}</div>`).join('')}` : ''}` : ''}
      <h3>此处的人</h3><div class="tb-inline">${GUEST_IDS.filter(id => state.guests[id].location === selected).map(id => `<button data-person="${id}">${GUESTS[id].name} · 羁绊${state.guests[id].bond}</button>`).join('') || '<p>这一刻没有旅客在这里。访客册可以付费递信，或下个潮段明确邀请新的议程。</p>'}</div>`;
  }
  function powerText() {
    const power = powers(session.state);
    return `屋心力量${power.heart} · 支持${power.support}/5 · 留岸${power.anchor} · 远航${power.sail} · 旅客连结${power.links}。支持只来自已兑现且羁绊三以上的旅客。`;
  }
  function renderGuests() {
    const state = session.state;
    guestsPanel.content.innerHTML = `<p>旅客只在你发起的真实议程中自行选址。错过同处一室，可多花一行动与一贝钱递信；听故事的人免贝钱。阅读下面的传记完全免费。</p>
      <label class="tb-invitation">下次邀请的方向<select data-invitation aria-label="邀请方向"><option>长桌相遇，让彼此亲自说话</option><option>援助工房，带来行李中的有限材料</option><option>沿岸各行，让旅客约定自己的会面地点</option></select></label>
      <div class="tb-guest-list">${GUEST_IDS.map(id => {
        const guest = state.guests[id], data = GUESTS[id];
        return `<button data-person="${id}" class="tb-guest-card">${portrait(id, true)}<span><strong>${data.name}</strong><span>${data.role}</span><span>${SCENES[guest.location].name} · 羁绊${guest.bond}/6</span><span>${guest.promise === 'done' ? '已兑现 · ' + (guest.branch === 'carry' ? '远航' : '留岸') : guest.promise === 'pending' ? '约至第' + guest.due + '潮' : guest.promise === 'broken' ? '错过约定 · 可补信' : '尚未立约'}</span></span></button>`;
      }).join('')}</div>`;
    query<HTMLSelectElement>(guestsPanel.content, '[data-invitation]').value = invitation;
  }
  function renderPerson() {
    const state = session.state, id = selectedGuest, data = GUESTS[id], guest = state.guests[id];
    const remote = guest.location !== state.location;
    const verbs = { listen: '坐下听开篇', gift: '赠盐花茶', carry: '立约：带走经历', release: '立约：放下约束', fulfill: '兑现承诺', renew: '补信重订' } as const;
    personPanel.content.innerHTML = `<div class="tb-person-heading">${portrait(id, true)}<div><p class="tb-eyebrow">${data.role}</p><h3>${data.name}</h3><p>${SCENES[guest.location].name} · 羁绊${guest.bond}/6</p><p>${remote ? '不在同一地点：以下相处已计入远程递信费用。' : '你们在同一地点，无须远程递信。'}</p></div></div>
      <p class="tb-public-intention">${escapeMarkup(guest.intention)}</p>
      <h4>眼下的愿望</h4><p>${data.goal} ${data.flaw}</p><p>${QUESTS[id].hint}</p>
      <p>${guest.promise === 'pending' ? `承诺截止：第${guest.due}潮结束。` : guest.promise === 'broken' ? '承诺已错过，羁绊与人心各损失一。只能认真重订一次。' : guest.promise === 'done' ? RESOLUTIONS[id][guest.branch === 'carry' ? 'carry' : 'release'] : '先听开篇并建立二点羁绊，再选择带走或放下。两个分支都不是善恶值，且立约后不能任意切换。'}</p>
      <div class="tb-person-actions">${(['listen', 'gift', 'carry', 'release', 'fulfill', 'renew'] as const).map(verb => action({ type: 'guest', guest: id, action: verb }, `${verbs[verb]} · ${guestCost(state, id, verb)}行动${remote && state.build !== 'listener' ? '＋一贝钱' : ''}${verb === 'renew' ? '＋一贝钱' : ''}`)).join('')}</div>
      <details class="tb-biography" open><summary>人物传记 · 阅读免费</summary>${paragraphs(BIOGRAPHIES[id])}${guest.introduced ? `<blockquote>${CONFESSIONS[id]}</blockquote>` : ''}</details>`;
  }
  function renderJournal() {
    const state = session.state;
    journal.content.innerHTML = `<p class="tb-eyebrow">第${tide(state)}潮 · ${watch(state)} · 已记录${session.moveCount}个有效行动</p>
      <h3>${ACTS[act(state)].name}</h3>${paragraphs(ACTS[act(state)].text)}<blockquote>${TIDES[tide(state) - 1]}</blockquote>
      <h3>实际能够托起的仪式</h3><p>${powerText()}</p>
      <h3>主线与人物约定 · ${state.quests.length}/${QUEST_IDS.length}</h3>${QUEST_IDS.map(id => `<div class="tb-journal-quest" data-quest-status="${id}"><strong>${hasQuest(state, id) ? '已完成' : '待完成'} · ${QUESTS[id].name}</strong><p>${QUESTS[id].hint}</p></div>`).join('')}
      <h3>亲手辨读的证据</h3><p>${state.clues.map(id => CLUE_NAMES[id]).join('；') || '尚无线索。旅客知道的局部事实不等于你已亲自验证。'}</p>
      <h3>旅客共同记忆</h3>${state.memory.map(text => `<p>${escapeMarkup(text)}</p>`).join('') || '<p>请明确邀请旅客，才会有真正的议程与共同记忆。</p>'}
      <details><summary>三幕目录与开篇</summary>${paragraphs(PROLOGUE)}${ACTS.map(act => `<h3>${act.name}</h3>${paragraphs(act.text)}`).join('')}</details>
      <details><summary>本次海屋的行动记录</summary><ol>${state.log.map(line => `<li>${escapeMarkup(line)}</li>`).join('')}</ol></details>`;
  }
  function renderBag() {
    const state = session.state, growth = level(state);
    bag.content.innerHTML = `<h3>${state.phase === 'setup' ? '尚未领取钥匙' : BUILDS[state.build].name} · ${growth.level}级</h3><p>经验${state.xp}，${growth.nextThreshold === null ? '已到最高等级' : '距下一级还需' + growth.remaining}；可用研习点${state.points}。每升一级只给一点，研习不耗潮段行动。</p>
      <div class="tb-skill-list">${SKILL_IDS.map(skill => `<div><strong>${SKILLS[skill]} ${effectiveSkill(state, skill)}</strong><p>基础${state.skills[skill]}${ITEMS[state.equipped].skill === skill ? '＋纪念物一' : ''}</p>${button({ type: 'train', skill }, `研习${SKILLS[skill]}`)}</div>`).join('')}</div>
      <p>共情二：听开篇只花一行动；识潮二：辨读只花一行动；匠艺二：制作只花一行动。低于门槛也能做，但要花二行动，不掷隐藏骰子。</p>
      <h3>一只行囊，一个纪念物槽</h3><p>当前佩戴：${ITEMS[state.equipped].name}。容量八十，每种最多二十四。装备消耗一行动，物品保留在行囊中但加成不叠加。</p>
      <div class="tb-inventory">${ITEM_IDS.filter(item => state.inventory[item] > 0).map(item => `<div data-item="${item}">${keepsake(item)}<div><strong>${ITEMS[item].name} × ${state.inventory[item]}</strong><p>${ITEMS[item].description}</p>${ITEMS[item].skill ? button({ type: 'equip', item }, state.equipped === item ? '正在佩戴' : `佩戴${ITEMS[item].name} · 一行动`) : ''}</div></div>`).join('')}</div>`;
  }
  function renderNext() {
    const state = session.state;
    nextPanel.content.innerHTML = `<h3>第${tide(state)}潮 · ${watch(state)}，尚余${state.ap}行动</h3><p>主动推进会放弃本时段未用的行动，进入下一个七行动时段。时间不按现实秒数流动，旅客也不会自动执行议程。</p>
      ${state.slot === 13 ? '<p class="tb-warning">这是最后一夜。现在推进会结束本次旅程；未完成的仪式不会自动成功。</p>' : ''}
      ${GUEST_IDS.filter(id => state.guests[id].promise === 'pending').map(id => `<p>${GUESTS[id].name}：第${state.guests[id].due}潮结束前兑现${state.guests[id].due <= tide(state) && state.slot % 2 === 1 ? '。本次推进将错过约定！' : '。'}</p>`).join('')}
      ${action({ type: 'advance' }, '让潮水前进')}`;
  }
  function renderEnding() {
    const state = session.state;
    endingPanel.content.innerHTML = `<p class="tb-eyebrow">七潮的落款 · ${session.moveCount}个有效行动</p><h3>${escapeMarkup(state.outcome)}</h3>${paragraphs(state.ending ? ENDING_STORY[state.ending] : FAILURE)}
      <p>${powerText()}</p><h3>这一回，他们实际选择了什么</h3>${GUEST_IDS.map(id => `<p><strong>${GUESTS[id].name}</strong>：${state.guests[id].promise === 'done' ? RESOLUTIONS[id][state.guests[id].branch === 'carry' ? 'carry' : 'release'] : '这一次的约定尚未兑现，不能为仪式提供支持。'}</p>`).join('')}<button data-fresh>从第一潮重新开始</button>`;
  }
  function render() {
    const state = session.state;
    page.root.dataset.phase = state.phase; page.root.dataset.tide = String(tide(state)); page.root.dataset.slot = String(state.slot);
    page.root.dataset.ap = String(state.ap); page.root.dataset.moves = String(session.moveCount);
    page.root.dataset.ending = state.ending ?? ''; page.root.dataset.xp = String(state.xp);
    query(page.root, '[data-phase]').textContent = `第${tide(state)}潮 / 七 · ${watch(state)}`;
    query(page.root, '[data-ap]').textContent = `行动 ${state.ap}/7`;
    query(page.root, '[data-growth]').textContent = `${level(state).level}级 · 经验${state.xp}`;
    query(page.root, '[data-favor]').textContent = `人心 ${state.favor}`;
    query(page.root, '[data-act]').textContent = ACTS[act(state)].name;
    query(page.root, '[data-weather]').textContent = state.slot % 2 ? '窗灯渐暖 · 潮水有自己的步子' : '雨幕未歇 · 退潮露出新的路';
    query(page.root, '[data-objective]').textContent = objective(state);
    const location = query<HTMLSelectElement>(page.root, '[data-location]');
    location.value = selected;
    for (const option of location.options) {
      const id = option.value as SceneId;
      option.textContent = `${SCENES[id].name}${id === state.location ? ' · 你在此' : unlocked(state, id) ? '' : ' · 未开'}`;
    }
    const travel = query<HTMLButtonElement>(page.root, '[data-travel]'), allowed = legal({ type: 'travel', scene: selected });
    travel.disabled = !allowed.ok; travel.title = allowed.reason;
    travel.textContent = selected === state.location ? '你在此处' : '前往 · 一行动';
    const plan = query<HTMLButtonElement>(page.root, '[data-plan]');
    plan.disabled = busy || state.phase !== 'play' || state.ap < 1 || !hasQuest(state, 'hearth') || state.plannedSlots.includes(state.slot);
    plan.textContent = busy ? '旅客正在商议…' : state.plannedSlots.includes(state.slot) ? '本潮段已邀请' : '邀请旅客 · 一行动';
    plan.title = !hasQuest(state, 'hearth') ? '先修好潮灯厅炉座' : '只在明确点击时请求一次模型议程';
    query<HTMLButtonElement>(page.root, '[data-next]').disabled = busy || state.phase !== 'play';
    query<HTMLElement>(page.root, '[data-start]').hidden = state.phase !== 'setup';
    query<HTMLElement>(page.root, '[data-ending]').hidden = state.phase !== 'won' && state.phase !== 'lost';
    world.update(state, selected);
    if (scenePanel.dialog.open) renderScene();
    if (guestsPanel.dialog.open) renderGuests();
    if (personPanel.dialog.open) renderPerson();
    if (journal.dialog.open) renderJournal();
    if (bag.dialog.open) renderBag();
    if (nextPanel.dialog.open) renderNext();
    if (endingPanel.dialog.open) renderEnding();
  }
  function showGuest(id: GuestId) { selectedGuest = id; renderPerson(); personPanel.open(); }
  function restart() {
    agent.cancel();
    for (const entry of [opening, scenePanel, guestsPanel, personPanel, journal, bag, nextPanel, restartPanel, endingPanel]) entry.close();
    selected = 'hall'; session.reset(86); say('第一次退潮重新到来。选择待客之道，不会自动联系模型。');
  }
  async function invite() {
    if (query<HTMLButtonElement>(page.root, '[data-plan]').disabled) return;
    const accepted = await agent.turn({
      label: `第${tide(session.state)}潮的五位旅客`,
      system: SYSTEM, observation: observation(session.state, invitation), tool: agendaTool,
      validate: plan => { session.preview({ type: 'plan', plan }); },
      getRevision: () => session.revision,
      commit: plan => { session.dispatch({ type: 'plan', plan }); },
    });
    if (accepted) say('旅客已有自己的去处。看地图上的身影，或打开访客册查看新意向。');
  }
  opening.content.innerHTML = `<p class="tb-eyebrow">原创海岸群像角色扮演</p><h3>一座会改主意的房子</h3>${paragraphs(PROLOGUE)}
    <h3>你会怎样待客？</h3><p>选择会决定起始技艺、纪念物与实际能力，而非只改变称呼。</p>${BUILD_IDS.map(build => `<div class="tb-build"><h4>${BUILDS[build].name}</h4><p>${BUILDS[build].description}</p><button data-build="${build}">以${BUILDS[build].name}领取钥匙</button></div>`).join('')}`;
  restartPanel.content.innerHTML = '<p>重新开始会取消正在等待的模型议程，并替换此浏览器的当前回放。要保留这次旅程，请先用存档导出。</p><button data-fresh>确认重新开始</button>';
  help.content.innerHTML = `<h3>先让炉火有地方坐</h3><p>领取钥匙 → 潮灯厅「此地事务」修炉座 → 明确点击「邀请旅客」 → 看旅客实际选择的位置，与他们相处。每次退潮与灯时各有七行动，共七潮十四段。只有主动行动消耗时间，镜头、读书、查看人物与菜单都免费。</p>
    <h3>不用等倒计时</h3><p>地点选择与点击房间只用于查看。点「前往」才消耗一行动移动；「此地事务」可拾取、辨读、制作、修复。行动不足时主动推进潮段。低技艺不锁死行动，只会使辨读、制作或听开篇更费时。升级后到行囊研习，也可佩戴纪念物。</p>
    <h3>承诺不是送礼进度条</h3><p>先听开篇，羁绊二后选择带走经历或放下约束。再依据手记备齐人物证据、相关人的开篇与材料，亲手兑现。带走增加远航，放下增加留岸。一个人只能收一次茶、立一个分支、领一次人物奖励。承诺通常在两潮后到期；错过会减羁绊与人心，可以多花行动和贝钱重订一次。人心降到一会提前结束。</p>
    <h3>旅客也会彼此生活</h3><p>模型只按五个人的目标、各自有限知识与公开记忆，选择长桌相遇、有限援助、沿岸会面或歇息。相遇能让他们互通线索、形成连结；援助会耗掉他们自己的行李。你可在访客册改变下次邀请方向，不能命令模型授予分数。至少三次真实议程才能议定新约。没有连接时仍可探索与准备，但不会出现假扮模型的离线旅客。</p>
    <h3>错过会面，不会卡死</h3><p>访客册可直接递信相处，比当面多一行动与一贝钱；听故事的人免贝钱。信可以完成同样的人物动作，绝不会伪造一次 Agent 议程。码头的有限换物、花台的贝荚、沿岸存量与旅客援助互为备用。查看禁用动作下的文字即可知道缺什么。</p>
    <h3>三个认真铺成的结局</h3><p>修炉座、合读潮图、修灯塔、修屋心、第五潮起议约。第七潮到屋心阁：岸上需留岸三，远航需远航三；双岸需五人支持、留岸二、远航二、两组旅客连结和潮标。三种仪式都实际消耗归潮结与月盐；详细材料见手记或屋心阁。期限到而未落款就是有限失败，可以重来。</p>
    <h3>按键、模型与隐私</h3><p>空格邀请旅客；方向键左右切换查看地点；回车查看此地；问号开指南。这些快捷键在所有对话框、输入框、下拉框和按钮获得焦点时停用；全部操作都有触摸与键盘按钮。地图房间和人物也可用制表键选择。关闭阅读页用退出键。</p>
    <p>只在明确邀请时请求模型。共用控制台最多两次请求、每次一千五百三十六个输出令牌、整个回合六十秒。失败、取消、过期不扣行动、不发奖。重来或导入会取消旧议程。模型设置与错误在底栏和模型日志中可查看；回放只保存经验证的游戏命令，不包含密钥。自动存档与导入都不联系模型。</p>
    <p>装饰雨幕遵循系统减少动态效果设置；没有声音、摄像头或持续后台请求。所有人物、地方与旧约均为本作原创。</p>`;
  page.root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLButtonElement>('button');
    if (!target || target.disabled) return;
    if (target.dataset.command) {
      const command = parseCommand(JSON.parse(target.dataset.command));
      dispatch(command);
      if (command.type === 'advance') nextPanel.close();
      if (command.type === 'ritual') { scenePanel.close(); renderEnding(); endingPanel.open(); }
    } else if (target.dataset.build) {
      dispatch(parseCommand({ type: 'start', build: target.dataset.build })); opening.close();
    } else if (target.dataset.person) showGuest(target.dataset.person as GuestId);
    else if (target.hasAttribute('data-fresh')) restart();
    else if (target.hasAttribute('data-start')) opening.open();
    else if (target.hasAttribute('data-travel')) dispatch({ type: 'travel', scene: selected });
    else if (target.hasAttribute('data-inspect')) { renderScene(); scenePanel.open(); }
    else if (target.hasAttribute('data-guests')) { renderGuests(); guestsPanel.open(); }
    else if (target.hasAttribute('data-journal')) { renderJournal(); journal.open(); }
    else if (target.hasAttribute('data-bag')) { renderBag(); bag.open(); }
    else if (target.hasAttribute('data-next')) { renderNext(); nextPanel.open(); }
    else if (target.hasAttribute('data-plan')) void invite();
    else if (target.hasAttribute('data-ending')) { renderEnding(); endingPanel.open(); }
    else if (target.hasAttribute('data-camera')) target.setAttribute('aria-pressed', String(world.overview()));
  }, { signal: page.signal });
  page.root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (event.target.hasAttribute('data-location')) selectScene(event.target.value as SceneId);
    if (event.target.hasAttribute('data-invitation')) invitation = event.target.value;
  }, { signal: page.signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog:modal') ||
      event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"],[role="button"]')) return;
    if (event.key === ' ') { event.preventDefault(); void invite(); }
    if (event.key === '?') { event.preventDefault(); help.open(); }
    if (event.key === 'Enter') { event.preventDefault(); renderScene(); scenePanel.open(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); selectScene(SCENE_IDS[(SCENE_IDS.indexOf(selected) + (event.key === 'ArrowRight' ? 1 : 9)) % SCENE_IDS.length]);
    }
  }, { signal: page.signal });
  page.onCleanup(session.subscribe(render));
  createGameNotebook(page, {
    gameId: 'tidebound-house', locale: 'zh-CN', session, trigger: query(page.root, '[data-notebook]'),
    beforeRestore: () => { agent.cancel(); },
    afterRestore: () => { selected = session.state.location; render(); },
    onNotice: say,
  });
  render();
  return { destroy: page.destroy, reset: restart };
}
