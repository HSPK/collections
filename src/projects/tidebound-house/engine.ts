import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import { createInventory, exchangeInventory } from '../../core/rpg/inventory';
import type { Inventory, ItemStack } from '../../core/rpg/inventory';
import { gainExperience, progression } from '../../core/rpg/progression';
import type { GameDefinition } from '../../core/games/session';
import {
  BUILD_IDS, BUILDS, CLUE_IDS, CURVE, ENDING_IDS, GUEST_IDS, GUESTS, ITEM_IDS, ITEMS,
  LIMITS, QUEST_IDS, QUESTS, RECIPES, RECIPE_IDS, SCENE_IDS, SCENES, SKILL_IDS,
} from './data';
import type { BuildId, ClueId, EndingId, GuestId, ItemId, QuestId, RecipeId, SceneId, SkillId } from './data';
import { CONFESSIONS, RESOLUTIONS } from './story';

export interface GuestState {
  location: SceneId;
  bond: number;
  introduced: boolean;
  gifted: boolean;
  branch: 'none' | 'carry' | 'release';
  promise: 'none' | 'pending' | 'broken' | 'done';
  due: number;
  renewed: boolean;
  supply: number;
  socialTide: number;
  knowledge: ClueId[];
  intention: string;
}
export interface State {
  seed: number;
  phase: 'setup' | 'play' | 'won' | 'lost';
  build: BuildId;
  slot: number;
  ap: number;
  favor: number;
  location: SceneId;
  xp: number;
  points: number;
  skills: Record<SkillId, number>;
  inventory: Inventory<ItemId>;
  equipped: ItemId;
  guests: Record<GuestId, GuestState>;
  quests: QuestId[];
  clues: ClueId[];
  stock: Record<SceneId, number>;
  market: Record<'wood' | 'glass' | 'thread' | 'salt', number>;
  crafted: Record<RecipeId, number>;
  harvested: SceneId[];
  plannedSlots: number[];
  links: string[];
  linkedTides: string[];
  memory: string[];
  log: string[];
  ending: EndingId | null;
  outcome: string;
}
export interface Plan {
  slot: number;
  choices: { guest: GuestId; task: 'table' | 'help' | 'route' | 'rest'; intention: string }[];
  intention: string;
}
export type Command =
  | { type: 'start'; build: BuildId }
  | { type: 'travel'; scene: SceneId }
  | { type: 'gather' | 'explore' | 'advance' }
  | { type: 'craft'; recipe: RecipeId }
  | { type: 'trade'; item: 'wood' | 'glass' | 'thread' | 'salt' }
  | { type: 'equip'; item: ItemId }
  | { type: 'train'; skill: SkillId }
  | { type: 'quest'; quest: QuestId }
  | { type: 'guest'; guest: GuestId; action: 'listen' | 'gift' | 'carry' | 'release' | 'fulfill' | 'renew' }
  | { type: 'ritual'; ending: EndingId }
  | { type: 'plan'; plan: Plan };

export const tide = (state: State) => Math.floor(state.slot / 2) + 1;
export const act = (state: State) => tide(state) <= 2 ? 0 : tide(state) <= 4 ? 1 : 2;
export const watch = (state: State) => state.slot % 2 === 0 ? '退潮' : '灯时';
export const hasQuest = (state: State, quest: QuestId) => state.quests.includes(quest);
export function effectiveSkill(state: State, skill: SkillId) {
  return state.skills[skill] + (ITEMS[state.equipped].skill === skill ? 1 : 0);
}
export function unlocked(state: State, scene: SceneId): boolean {
  if (['hall', 'shore', 'harbor'].includes(scene)) return true;
  if (['workshop', 'archive', 'garden'].includes(scene)) return hasQuest(state, 'hearth');
  return hasQuest(state, 'chart');
}
export function powers(state: State) {
  const supporters = GUEST_IDS.filter(id => state.guests[id].promise === 'done' && state.guests[id].bond >= 3);
  return {
    support: supporters.length,
    anchor: supporters.filter(id => state.guests[id].branch === 'release').length + (hasQuest(state, 'marks') ? 1 : 0),
    sail: supporters.filter(id => state.guests[id].branch === 'carry').length,
    links: state.links.length,
    heart: hasQuest(state, 'heart') ? 3 + supporters.length : 0,
  };
}
export function objective(state: State): string {
  if (state.phase === 'setup') return '选一种待客之道，领取钥匙。先读开篇，不会扣除行动。';
  if (state.phase === 'won' || state.phase === 'lost') return state.outcome;
  const next = (['hearth', 'chart', 'beacon', 'heart', 'council'] as const).find(id => !hasQuest(state, id));
  return next ? QUESTS[next].hint : tide(state) < 7 ? '新约已定。兑现余下承诺、备齐仪式物品；第七潮到屋心阁落款。' : '最后一潮：到屋心阁，选择与真实支持相符的仪式。不要再放走这一夜。';
}
function log(state: State, message: string) {
  state.log = [...state.log, `第${tide(state)}潮·${watch(state)}｜${message}`].slice(-80);
}
function spendAP(state: State, cost: number) {
  requireRule(state.ap >= cost, `需要${cost}行动，当前只有${state.ap}。可主动推进到下一时段。`);
  state.ap -= cost;
}
function exchange(state: State, spend: ItemStack<ItemId>[] = [], gain: ItemStack<ItemId>[] = []) {
  for (const stack of spend) requireRule(state.inventory[stack.item] >= stack.amount, `${ITEMS[stack.item].name}不足：需要${stack.amount}，现有${state.inventory[stack.item]}。`);
  state.inventory = exchangeInventory(state.inventory, { spend, gain }, LIMITS);
}
function experience(state: State, amount: number) {
  const gained = gainExperience(state.xp, amount, CURVE);
  state.xp = gained.xp;
  state.points += gained.earnedLevels;
  if (gained.earnedLevels) log(state, `升至${gained.level}级，获得${gained.earnedLevels}点研习。可在行囊中提升共情、识潮或匠艺。`);
}
function finishQuest(state: State, quest: QuestId, xp = 4) {
  requireRule(!hasQuest(state, quest), '这项约定已经兑现，不能重复领取。');
  state.quests.push(quest);
  experience(state, xp);
  log(state, `完成「${QUESTS[quest].name}」。`);
}
export function create(seed: number): State {
  return {
    seed, phase: 'setup', build: 'reader', slot: 0, ap: 7, favor: 6, location: 'hall', xp: 0, points: 0,
    skills: { empathy: 1, lore: 1, craft: 1 },
    inventory: createInventory(ITEM_IDS, [
      { item: 'wood', amount: 6 }, { item: 'glass', amount: 4 }, { item: 'thread', amount: 8 },
      { item: 'salt', amount: 8 }, { item: 'shell', amount: 8 },
    ], LIMITS),
    equipped: 'compass',
    guests: Object.fromEntries(GUEST_IDS.map((id, index) => [id, {
      location: (['harbor', 'shore', 'hall', 'hall', 'shore'] as const)[index],
      bond: 0, introduced: false, gifted: false, branch: 'none', promise: 'none', due: 0, renewed: false,
      supply: 2, socialTide: 0, knowledge: [GUESTS[id].clue], intention: '等待主人明确邀请，尚未安排议程。',
    }])) as Record<GuestId, GuestState>,
    quests: [], clues: [], stock: Object.fromEntries(SCENE_IDS.map(id => [id, SCENES[id].stock ?? 0])) as Record<SceneId, number>,
    market: { wood: 4, glass: 4, thread: 6, salt: 6 },
    crafted: { lens: 0, brace: 0, knot: 0, tea: 0 }, harvested: [], plannedSlots: [], links: [], linkedTides: [],
    memory: [], log: ['海屋抵岸。钥匙等待一个临时主人。'], ending: null, outcome: '',
  };
}
export function parsePlan(value: unknown): Plan {
  const data = object(value, ['slot', 'choices', 'intention'], '旅客议程');
  return {
    slot: integer(data.slot, '潮段', 0, 13),
    choices: array(data.choices, value => {
      const entry = object(value, ['guest', 'task', 'intention'], '旅客行动');
      return {
        guest: choice(entry.guest, GUEST_IDS, '旅客'),
        task: choice(entry.task, ['table', 'help', 'route', 'rest'] as const, '议程'),
        intention: publicText(entry.intention, 64),
      };
    }, '五位旅客', 5, 5),
    intention: publicText(data.intention, 150),
  };
}
function publicText(value: unknown, maximum: number) {
  const result = text(value, '中文公开意向', maximum);
  requireRule(/[\u3400-\u9fff]/u.test(result) && !/https?:\/\/|www\.|```/i.test(result), '请只写简短中文公开意向，不含网址或代码。');
  return result;
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '行动必须标明类型。');
  const type = choice(value.type, ['start', 'travel', 'gather', 'explore', 'advance', 'craft', 'trade', 'equip', 'train', 'quest', 'guest', 'ritual', 'plan'] as const, '行动类型');
  if (type === 'gather' || type === 'explore' || type === 'advance') { object(value, ['type'], '行动'); return { type }; }
  if (type === 'guest') {
    const data = object(value, ['type', 'guest', 'action'], '相处');
    return { type, guest: choice(data.guest, GUEST_IDS, '旅客'), action: choice(data.action, ['listen', 'gift', 'carry', 'release', 'fulfill', 'renew'] as const, '相处方式') };
  }
  const key = { start: 'build', travel: 'scene', craft: 'recipe', trade: 'item', equip: 'item', train: 'skill', quest: 'quest', ritual: 'ending', plan: 'plan' }[type];
  const data = object(value, ['type', key], '行动');
  switch (type) {
    case 'start': return { type, build: choice(data.build, BUILD_IDS, '待客之道') };
    case 'travel': return { type, scene: choice(data.scene, SCENE_IDS, '地点') };
    case 'craft': return { type, recipe: choice(data.recipe, RECIPE_IDS, '配方') };
    case 'trade': return { type, item: choice(data.item, ['wood', 'glass', 'thread', 'salt'] as const, '换取物') };
    case 'equip': return { type, item: choice(data.item, ITEM_IDS, '纪念物') };
    case 'train': return { type, skill: choice(data.skill, SKILL_IDS, '技艺') };
    case 'quest': return { type, quest: choice(data.quest, QUEST_IDS, '约定') };
    case 'ritual': return { type, ending: choice(data.ending, ENDING_IDS, '仪式') };
    case 'plan': return { type, plan: parsePlan(data.plan) };
  }
}
export function tasksFor(state: State, id: GuestId) {
  const guest = GUESTS[id], current = state.guests[id];
  const tasks: { id: Plan['choices'][number]['task']; location: SceneId; label: string }[] = [
    { id: 'table', location: 'hall', label: `与${GUESTS[guest.partner].name}在长桌见面；同桌互通已知线索，每潮一次羁绊。` },
  ];
  if (hasQuest(state, 'hearth') && current.supply > 0) tasks.push({ id: 'help', location: 'workshop', label: `从自己行李交出${ITEMS[guest.supply].name}一；仅余${current.supply}份。` });
  if (unlocked(state, guest.haunt) && current.socialTide !== tide(state)) tasks.push({ id: 'route', location: guest.haunt, label: `前往${SCENES[guest.haunt].name}发起一次会面，羁绊加一；与长桌共享每潮上限。` });
  tasks.push({ id: 'rest', location: current.location, label: '留在原地歇息，不获得物资或关系。' });
  return tasks;
}
function applyPlan(state: State, plan: Plan) {
  requireRule(plan.slot === state.slot, '这份议程属于已经过去的潮段。');
  requireRule(!state.plannedSlots.includes(state.slot), '每个时段只能召集一次真实旅客议程。');
  requireRule(hasQuest(state, 'hearth'), '先修好潮灯厅的炉座，再邀请旅客安排时间。');
  requireRule(new Set(plan.choices.map(entry => entry.guest)).size === 5, '五位旅客必须各有且只有一个议程。');
  requireRule(plan.choices.some(entry => entry.task !== 'rest'), '请至少安排一位旅客相遇、援助或外出，不能全体原地等待。');
  const tasks = plan.choices.map(entry => {
    const task = tasksFor(state, entry.guest).find(task => task.id === entry.task);
    requireRule(task, `${GUESTS[entry.guest].name}不能选择目录之外的议程。`);
    return { ...entry, location: task.location };
  });
  const table = tasks.filter(entry => entry.task === 'table');
  requireRule(table.length !== 1, '长桌会面至少需要两位旅客，不能让一个人空等。');
  spendAP(state, 1);
  for (const task of tasks) {
    const guest = state.guests[task.guest];
    guest.location = task.location;
    guest.intention = task.intention;
    if (task.task === 'help') {
      exchange(state, [], [{ item: GUESTS[task.guest].supply, amount: 1 }]);
      guest.supply--;
    }
    if (task.task === 'route' && guest.socialTide !== tide(state)) {
      guest.bond = Math.min(6, guest.bond + 1);
      guest.socialTide = tide(state);
    }
  }
  if (table.length >= 2) {
    const knowledge = [...new Set(table.flatMap(entry => state.guests[entry.guest].knowledge))];
    for (const entry of table) {
      const guest = state.guests[entry.guest];
      guest.knowledge = [...knowledge];
      if (guest.socialTide !== tide(state)) {
        guest.bond = Math.min(6, guest.bond + 1);
        guest.socialTide = tide(state);
      }
      const partner = GUESTS[entry.guest].partner;
      if (table.some(other => other.guest === partner)) {
        const pair = [entry.guest, partner].sort().join('-'), stamp = `${tide(state)}:${pair}`;
        if (!state.linkedTides.includes(stamp)) {
          state.linkedTides.push(stamp);
          if (!state.links.includes(pair)) state.links.push(pair);
          state.memory.push(`${GUESTS[entry.guest].name}与${GUESTS[partner].name}在长桌互通线索；双方不再只通过主人传话。`);
        }
      }
    }
  }
  state.plannedSlots.push(state.slot);
  state.memory = [...state.memory, plan.intention].slice(-16);
  log(state, `旅客自行安排了去处：${plan.intention}`);
}
export function recipeCost(state: State, id: RecipeId): ItemStack<ItemId>[] {
  return RECIPES[id].spend.map(stack => ({ ...stack, amount: stack.amount - (state.build === 'maker' && stack.item === 'wood' ? 1 : 0) }));
}
export function guestCost(state: State, id: GuestId, action: Extract<Command, { type: 'guest' }>['action']): number {
  const base = action === 'renew' ? 2 : action === 'listen' && effectiveSkill(state, 'empathy') < 2 ? 2 : 1;
  return base + (state.location !== state.guests[id].location ? 1 : 0);
}
function guestAction(state: State, command: Extract<Command, { type: 'guest' }>) {
  const { guest: id, action } = command, guest = state.guests[id], data = GUESTS[id];
  const remote = guest.location !== state.location;
  spendAP(state, guestCost(state, id, action));
  if (remote && state.build !== 'listener') exchange(state, [{ item: 'shell', amount: 1 }]);
  if (action === 'listen') {
    requireRule(!guest.introduced, '开篇已听过。重读人物传记免费，不会重复获得经验。');
    guest.introduced = true;
    guest.bond = Math.min(6, guest.bond + 1);
    experience(state, 2);
    log(state, `听见${data.name}没有说完的故事。${CONFESSIONS[id]}`);
  } else if (action === 'gift') {
    requireRule(!guest.gifted, '这位旅客已经收过盐花茶，不能反复赠礼刷取羁绊。');
    requireRule(guest.introduced, '先听过对方的故事，再赠茶。');
    exchange(state, [{ item: 'tea', amount: 1 }]);
    guest.gifted = true; guest.bond = Math.min(6, guest.bond + 1);
    log(state, `${data.name}把盐花茶留在窗边。羁绊加一，此礼仅一次。`);
  } else if (action === 'carry' || action === 'release') {
    requireRule(guest.introduced && guest.bond >= 2, '先听开篇，并以相遇或赠茶把羁绊提升到二。');
    requireRule(guest.promise === 'none', '承诺已经写下，不能来回切换或重复立约。');
    guest.branch = action; guest.promise = 'pending'; guest.due = Math.min(7, tide(state) + 2);
    log(state, `与${data.name}约定${action === 'carry' ? '带走所珍惜的经历' : '放下不再适用的约束'}。请在第${guest.due}潮结束前兑现；需要${ITEMS[data.need].name}${data.amount}与人物线索。`);
  } else if (action === 'renew') {
    requireRule(guest.promise === 'broken' && !guest.renewed, '只有错过的承诺可以重订，而且仅一次。');
    exchange(state, [{ item: 'shell', amount: 1 }]);
    guest.promise = 'pending'; guest.due = 7; guest.renewed = true;
    log(state, `你认真向${data.name}补了一封信。约定延至第七潮，已经损失的人心不会凭空回来。`);
  } else {
    requireRule(guest.promise === 'pending', '先立下有效承诺；错过的承诺需重订。');
    requireRule(guest.bond >= 2, '羁绊不足二。请相遇或赠茶，再兑现约定。');
    requireRule(state.clues.includes(data.clue), `尚缺人物证据：${QUESTS[id].hint}`);
    requireRule(state.guests[data.gate].introduced, `先听过${GUESTS[data.gate].name}的开篇，不要替另一方作答。`);
    requireRule(id !== 'tang' || hasQuest(state, 'beacon'), '陶芽要先看见灯塔修好，才愿意为海屋决定花盆的位置。');
    exchange(state, [{ item: data.need, amount: data.amount }], [{ item: data.reward, amount: data.reward === 'glass' ? 2 : 1 }]);
    guest.promise = 'done'; guest.bond = Math.min(6, guest.bond + 2);
    state.favor = Math.min(10, state.favor + 1);
    finishQuest(state, id, 5);
    log(state, RESOLUTIONS[id][guest.branch === 'carry' ? 'carry' : 'release']);
  }
}
function questAction(state: State, quest: QuestId) {
  requireRule(!hasQuest(state, quest), '任务已经完成，不能重复领取奖励。');
  requireRule(!GUEST_IDS.some(id => id === quest), '人物任务请通过相处中的兑现承诺完成。');
  const places: Partial<Record<QuestId, SceneId>> = { hearth: 'hall', chart: 'archive', beacon: 'lighthouse', heart: 'loft', council: 'hall', marks: 'cliff', letters: 'hall' };
  requireRule(state.location === places[quest], `请到${SCENES[places[quest]!].name}完成这项工作。`);
  spendAP(state, 1);
  switch (quest) {
    case 'hearth':
      exchange(state, [{ item: 'wood', amount: 2 }], [{ item: 'thread', amount: 2 }, { item: 'salt', amount: 1 }]);
      log(state, '炉座坐稳了。工房、雨信阁与悬雨花台的门展开；旧抽屉中找到帆线二与月盐一。'); break;
    case 'chart':
      requireRule(state.clues.includes('shore') && state.clues.includes('ledger') && state.plannedSlots.length >= 1, '需要滩纹、借宿簿，以及至少一次真正的旅客议程。');
      exchange(state, [], [{ item: 'shell', amount: 2 }]);
      log(state, '旧约收回的是借来的潮，不是借宿的人。通往石庭、岬角、灯塔与屋心阁的路出现了。'); break;
    case 'beacon':
      requireRule(state.guests.shen.introduced, '先听沈砚讲清那一夜，灯不应替别人决定回家。');
      exchange(state, [{ item: 'lens', amount: 1 }, { item: 'wood', amount: 1 }]);
      log(state, '返照灯亮了。两条路同时被照见，陶芽终于愿意谈屋心。'); break;
    case 'heart':
      requireRule(hasQuest(state, 'beacon') && state.clues.includes('ledger'), '先修灯塔并读过借宿簿，才知道屋心应当怎样归还潮水。');
      exchange(state, [{ item: 'brace', amount: 1 }, { item: 'knot', amount: 1 }]);
      log(state, '木环恢复摆动。它问的不是要去哪儿，而是能否保留改主意的权利。'); break;
    case 'council':
      requireRule(tide(state) >= 5 && hasQuest(state, 'heart'), '第五潮起，修好的屋心才愿意参与议约。');
      requireRule(GUEST_IDS.filter(id => hasQuest(state, id)).length >= 3 && state.plannedSlots.length >= 3, '需要三位旅客兑现、至少三次真实议程。没有连接模型时可以探索准备，但不能伪造议约。');
      log(state, '第六把椅子空着。新约承认每个人的选择，也承认房子可以犹豫。'); break;
    case 'marks':
      requireRule(state.clues.includes('echo'), '先辨读回声岬，不要把潮标刻在错误的回声上。');
      exchange(state, [{ item: 'salt', amount: 1 }]);
      log(state, '为下一次来访刻下潮标。留岸力量加一；它不是一道拦住离开的门。'); break;
    case 'letters':
      requireRule(GUEST_IDS.every(id => state.guests[id].introduced), '还没听完五个人的称呼。');
      exchange(state, [], [{ item: 'shell', amount: 2 }]);
      state.favor = Math.min(10, state.favor + 1); break;
  }
  finishQuest(state, quest);
}
export function reduce(previous: State, command: Command): State {
  const state = structuredClone(previous);
  if (command.type === 'start') {
    requireRule(state.phase === 'setup', '已经领取钥匙。重新开始才能更换待客之道。');
    state.build = command.build;
    state.skills[BUILDS[command.build].skill]++;
    state.equipped = BUILDS[command.build].item;
    exchange(state, [], [{ item: state.equipped, amount: 1 }]);
    state.phase = 'play';
    log(state, `你以「${BUILDS[command.build].name}」的方式领取钥匙。先修炉座，再邀请旅客。`);
    return state;
  }
  requireRule(state.phase === 'play', '这一回潮汐尚未开始或已经落幕。阅读记录免费，重新开始才能再次行动。');
  switch (command.type) {
    case 'travel':
      requireRule(unlocked(state, command.scene), '这条路尚未出现。请查看当前主线。');
      requireRule(command.scene !== state.location, '你已经在这里；查看地图不耗行动。');
      spendAP(state, 1); state.location = command.scene;
      log(state, `前往${SCENES[command.scene].name}。`); break;
    case 'gather': {
      const scene = SCENES[state.location];
      requireRule(scene.resource && state.stock[state.location] > 0, '这里没有可拾取的存量。海岸资源不会刷新。');
      const amount = Math.min(2, state.stock[state.location]);
      spendAP(state, 1);
      exchange(state, [], [{ item: scene.resource, amount }]);
      state.stock[state.location] -= amount;
      if (!state.harvested.includes(state.location)) { state.harvested.push(state.location); experience(state, 1); }
      log(state, `拾得${ITEMS[scene.resource].name}${amount}，此地余${state.stock[state.location]}。`); break;
    }
    case 'explore': {
      const clue = SCENES[state.location].clue;
      requireRule(clue && !state.clues.includes(clue), '这里没有尚未辨读的线索。重读地点描述免费。');
      spendAP(state, effectiveSkill(state, 'lore') >= 2 ? 1 : 2);
      state.clues.push(clue); experience(state, 3);
      log(state, `辨读${SCENES[state.location].name}：${SCENES[state.location].description}`); break;
    }
    case 'craft': {
      requireRule(state.location === 'workshop', '请到补帆工房制作。');
      const recipe = RECIPES[command.recipe];
      requireRule(state.crafted[command.recipe] < recipe.cap, `这份配方最多制作${recipe.cap}次，不能循环刷取。`);
      spendAP(state, effectiveSkill(state, 'craft') >= 2 ? 1 : 2);
      exchange(state, recipeCost(state, command.recipe), [{ item: recipe.gain, amount: 1 }]);
      if (state.crafted[command.recipe] === 0) experience(state, 2);
      state.crafted[command.recipe]++;
      log(state, `${recipe.name}完成。编号${state.crafted[command.recipe]}，原料已经实际扣除。`); break;
    }
    case 'trade':
      requireRule(state.location === 'harbor' && state.market[command.item] >= 2, '只在贝壳港换取现货，每种存量有限。');
      spendAP(state, 1);
      exchange(state, [{ item: 'shell', amount: 1 }], [{ item: command.item, amount: 2 }]);
      state.market[command.item] -= 2;
      log(state, `贝钱一换得${ITEMS[command.item].name}二。不能出售物品套取贝钱。`); break;
    case 'equip':
      requireRule(ITEMS[command.item].skill && state.inventory[command.item] > 0 && state.equipped !== command.item, '只能装备已经持有且尚未装备的纪念物。');
      spendAP(state, 1); state.equipped = command.item;
      log(state, `佩上${ITEMS[command.item].name}。只占一个纪念物槽，属性不会叠加。`); break;
    case 'train':
      requireRule(state.points > 0 && state.skills[command.skill] < 4, '需要可用研习点，基础技艺最高四级。');
      state.points--; state.skills[command.skill]++;
      log(state, '把一次成长用在认真练习上。研习点只从首次获得的经验升级而来。'); break;
    case 'quest': questAction(state, command.quest); break;
    case 'guest': guestAction(state, command); break;
    case 'plan': applyPlan(state, command.plan); break;
    case 'ritual': {
      requireRule(tide(state) === 7 && state.location === 'loft' && hasQuest(state, 'council'), '第七潮在屋心阁落款；必须先议定新约。');
      const power = powers(state);
      requireRule(power.support >= 3, '至少三位已兑现且羁绊三以上的旅客才能托住仪式。');
      if (command.ending === 'shore') requireRule(power.anchor >= 3, '留岸力量需要三：放下承诺与潮标共同提供。');
      if (command.ending === 'voyage') requireRule(power.sail >= 3, '远航力量需要三：三位兑现带走承诺的旅客。');
      if (command.ending === 'bridge') requireRule(power.support === 5 && power.anchor >= 2 && power.sail >= 2 && power.links >= 2 && hasQuest(state, 'marks'), '双岸需要五人支持、留岸二、远航二、至少两组旅客连结及潮标。');
      spendAP(state, 1);
      exchange(state, [{ item: 'salt', amount: 2 }, { item: 'knot', amount: 1 }, command.ending === 'shore' ? { item: 'wood', amount: 2 } : command.ending === 'voyage' ? { item: 'glass', amount: 2 } : { item: 'lens', amount: 1 }]);
      state.phase = 'won'; state.ending = command.ending;
      state.outcome = command.ending === 'shore' ? '岸上第八扇窗' : command.ending === 'voyage' ? '把故乡带向远方' : '两岸之间的一盏灯';
      log(state, `仪式完成：${state.outcome}。屋心力量${power.heart}，真实支持${power.support}。`); break;
    }
    case 'advance':
      if (state.slot % 2 === 1) {
        for (const id of GUEST_IDS) {
          const guest = state.guests[id];
          if (guest.promise === 'pending' && guest.due <= tide(state)) {
            guest.promise = 'broken'; guest.bond = Math.max(0, guest.bond - 1); state.favor--;
            log(state, `错过了与${GUESTS[id].name}的约定：羁绊与人心各减一。可花行动与贝钱重订一次。`);
          }
        }
      }
      if (state.slot === 13 || state.favor <= 1) {
        state.phase = 'lost';
        state.outcome = state.favor <= 1 ? '人心散去，海屋提前归潮' : '第七潮已过，这一次未能落款';
        log(state, state.outcome);
      } else {
        state.slot++; state.ap = 7;
        log(state, '潮段更替，恢复七行动。旅客不会自动行动；新议程需要你明确召集。');
      }
      break;
  }
  return state;
}
export function level(state: State) { return progression(state.xp, CURVE); }
export const definition: GameDefinition<State, Command> = { id: 'tidebound-house', create, reduce, parseCommand };
export const CLUE_NAMES: Record<typeof CLUE_IDS[number], string> = { shore: '七潮滩纹', ledger: '归还借潮的条款', stone: '旧约的两处空格', echo: '不要替我决定永远' };
