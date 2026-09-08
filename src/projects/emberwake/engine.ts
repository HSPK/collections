import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { createInventory, exchangeInventory } from '../../core/rpg/inventory';
import type { Inventory, ItemStack } from '../../core/rpg/inventory';
import { gainExperience, progression } from '../../core/rpg/progression';
import {
  BATTLES, COMPANIONS, CURVE, ENEMY_IDS, ENEMY_NAMES, ITEMS, LOCATIONS, PEOPLE, QUEST_IDS, QUESTS, STANCES,
  questById, ITEM_NAMES,
} from './data';
import type { Branch, CompanionId, EnemyId, ItemId, LocationId, PersonId, QuestId, Stance } from './data';
import { CHARACTERS, QUEST_STORY } from './story';

export const ACTIONS = ['strike', 'guard', 'mend', 'burst', 'sweep'] as const;
export type Action = typeof ACTIONS[number];
export const ACTORS = [...COMPANIONS, ...ENEMY_IDS] as const;
export type Actor = typeof ACTORS[number];
export const TARGETS = ['caravan', ...ENEMY_IDS] as const;
export interface Order {
  actor: Actor;
  action: Action;
  lane: number;
  target: typeof TARGETS[number];
  intention: string;
}
export interface Plan {
  kind: 'parley' | 'battle';
  speaker: PersonId;
  stance: Stance;
  line: string;
  orders: Order[];
}
export interface Enemy { id: EnemyId; hp: number; maxHp: number; lane: number; power: number; energy: number; burn: number }
export interface Battle {
  round: number; heroLane: number; enemies: Enemy[];
  allies: { id: CompanionId; lane: number; energy: number }[];
  plan: Plan | null;
}
export interface State {
  seed: number;
  phase: 'travel' | 'choice' | 'forecast' | 'action' | 'finale' | 'ended';
  location: LocationId;
  act: 1 | 2 | 3;
  hp: number;
  energy: number;
  xp: number;
  points: number;
  build: { fire: number; shelter: number };
  bag: Inventory<ItemId>;
  equipment: 'none' | 'lens' | 'coat';
  stock: { tonic: number; lens: number; coat: number };
  party: CompanionId[];
  bonds: Record<CompanionId, number>;
  values: Record<Stance, number>;
  completed: Partial<Record<QuestId, 'a' | 'b'>>;
  pending: { quest: QuestId; branch: 'a' | 'b' | null; offer: Stance; line: string } | null;
  battle: Battle | null;
  ending: 'anchor' | 'unbound' | 'shared' | 'lost' | null;
  log: string[];
  rounds: number;
}
export type Command =
  | { type: 'travel'; location: LocationId }
  | { type: 'parley'; quest: QuestId; plan: Plan }
  | { type: 'choose'; branch: 'a' | 'b' }
  | { type: 'forecast'; plan: Plan }
  | { type: 'act'; action: 'strike' | 'flare' | 'guard' | 'tonic'; lane: number; target: EnemyId }
  | { type: 'camp' }
  | { type: 'buy'; item: 'tonic' | 'lens' | 'coat' }
  | { type: 'equip'; item: 'none' | 'lens' | 'coat' }
  | { type: 'build'; path: 'fire' | 'shelter' }
  | { type: 'ending'; ending: 'anchor' | 'unbound' };

const LIMITS = { capacity: 999, stackLimit: 500 };
export const PRICES = { tonic: 5, lens: 14, coat: 14 };
export const LANES = ['左舷', '中桥', '右舷'] as const;
export const ACTION_NAMES: Record<Action, string> = { strike: '攻击', guard: '护持', mend: '疗愈', burst: '破甲', sweep: '扫击' };
export function level(state: State) { return progression(state.xp, CURVE).level; }
export function maxHp(state: State) { return 34 + (level(state) - 1) * 4 + state.build.shelter * 4 + (state.equipment === 'coat' ? 6 : 0); }
export function maxEnergy(state: State) { return 5 + (state.build.fire > 1 ? 1 : 0); }
function stacks(values: Partial<Record<ItemId, number>>): ItemStack<ItemId>[] {
  return ITEMS.flatMap(item => values[item] ? [{ item, amount: values[item]! }] : []);
}
function exchange(state: State, spend: Partial<Record<ItemId, number>>, gain: Partial<Record<ItemId, number>>) {
  for (const cost of stacks(spend)) requireRule(state.bag[cost.item] >= cost.amount, `${ITEM_NAMES[cost.item]}不足，行动未发生。`);
  state.bag = exchangeInventory(state.bag, { spend: stacks(spend), gain: stacks(gain) }, LIMITS);
}
function note(state: State, message: string) { state.log = [...state.log.slice(-119), message]; }
export function unlocked(state: State): LocationId[] {
  if (!state.completed.departure) return ['kiln'];
  const places: LocationId[] = ['kiln', 'span'];
  if (state.completed.cable) places.push('bell', 'market');
  if (state.completed.bells) places.push('garden');
  if (state.completed.crossing) places.push('reservoir');
  if (state.completed.mirror) places.push('archive');
  if (state.completed.archive) places.push('observatory');
  if (state.completed.council) places.push('heart');
  return places;
}
export function available(state: State) {
  if (state.phase !== 'travel') return [];
  return QUESTS.filter(q => q.location === state.location && !state.completed[q.id] &&
    q.requires.every(id => state.completed[id]) &&
    (q.id !== 'qiaoarc' || state.bag.coin >= 6) &&
    (q.id !== 'moarc' || state.bag.ore > 0 || state.bag.tonic > 0));
}
export function canShare(state: State) {
  return Boolean(state.completed.lanarc && state.completed.moarc && state.completed.qiaoarc && state.values.freedom >= 3);
}
export function canUnbind(state: State) { return Boolean(state.completed.moarc && state.values.memory >= 3); }
export function branchBlock(state: State, branch: Branch): string | null {
  if (state.pending?.quest === 'furnace' && branch.id === 'b' && !canShare(state)) return '需要三条同伴支线全部完成，且解缆至少三点。';
  for (const cost of stacks(branch.cost ?? {})) if (state.bag[cost.item] < cost.amount) return `${ITEM_NAMES[cost.item]}不足。`;
  return null;
}
export function publicText(value: unknown, label: string, limit: number) {
  const result = text(value, label, limit);
  requireRule(/[\u3400-\u9fff]/.test(result) && !/[a-zA-Z]/.test(result), `${label}须使用简短中文，不得包含外文或代码。`);
  return result;
}
export function parsePlan(value: unknown): Plan {
  const p = object(value, ['kind', 'speaker', 'stance', 'line', 'orders'], '行旅计划');
  return {
    kind: choice(p.kind, ['parley', 'battle'] as const, '计划阶段'),
    speaker: choice(p.speaker, PEOPLE, '发言者'),
    stance: choice(p.stance, STANCES, '立场'),
    line: publicText(p.line, '公开发言', 120),
    orders: array(p.orders, value => {
      const o = object(value, ['actor', 'action', 'lane', 'target', 'intention'], '战术');
      return {
        actor: choice(o.actor, ACTORS, '行动者'), action: choice(o.action, ACTIONS, '战术动作'),
        lane: integer(o.lane, '战线', 0, 2), target: choice(o.target, TARGETS, '目标'),
        intention: publicText(o.intention, '公开意图', 48),
      };
    }, '战术列表', 0, 5),
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '行动必须包含类型。');
  const type = choice(value.type, ['travel', 'parley', 'choose', 'forecast', 'act', 'camp', 'buy', 'equip', 'build', 'ending'] as const, '行动类型');
  switch (type) {
    case 'travel': { const c = object(value, ['type', 'location']); return { type, location: choice(c.location, LOCATIONS, '目的地') }; }
    case 'parley': { const c = object(value, ['type', 'quest', 'plan']); return { type, quest: choice(c.quest, QUEST_IDS, '任务'), plan: parsePlan(c.plan) }; }
    case 'choose': { const c = object(value, ['type', 'branch']); return { type, branch: choice(c.branch, ['a', 'b'] as const, '抉择') }; }
    case 'forecast': { const c = object(value, ['type', 'plan']); return { type, plan: parsePlan(c.plan) }; }
    case 'act': {
      const c = object(value, ['type', 'action', 'lane', 'target']);
      return { type, action: choice(c.action, ['strike', 'flare', 'guard', 'tonic'] as const, '领航动作'),
        lane: integer(c.lane, '站位', 0, 2), target: choice(c.target, ENEMY_IDS, '敌人') };
    }
    case 'camp': object(value, ['type']); return { type };
    case 'buy': { const c = object(value, ['type', 'item']); return { type, item: choice(c.item, ['tonic', 'lens', 'coat'] as const, '商品') }; }
    case 'equip': { const c = object(value, ['type', 'item']); return { type, item: choice(c.item, ['none', 'lens', 'coat'] as const, '装备') }; }
    case 'build': { const c = object(value, ['type', 'path']); return { type, path: choice(c.path, ['fire', 'shelter'] as const, '航技') }; }
    case 'ending': { const c = object(value, ['type', 'ending']); return { type, ending: choice(c.ending, ['anchor', 'unbound'] as const, '结局') }; }
  }
}
export function create(seed: number): State {
  return {
    seed, phase: 'travel', location: 'kiln', act: 1, hp: 34, energy: 5, xp: 0, points: 0,
    build: { fire: 0, shelter: 0 }, bag: createInventory(ITEMS, [{ item: 'coin', amount: 12 }, { item: 'tonic', amount: 2 }], LIMITS),
    equipment: 'none', stock: { tonic: 6, lens: 1, coat: 1 }, party: [],
    bonds: { lan: 0, mo: 0, qiao: 0 }, values: { duty: 0, memory: 0, freedom: 0 },
    completed: {}, pending: null, battle: null, ending: null, log: ['停风第七夜。先与岚缇商议，再决定余烬图的第一条路。'], rounds: 0,
  };
}
function complete(state: State) {
  const pending = state.pending;
  requireRule(pending !== null && pending.branch !== null && !state.completed[pending.quest], '这份任务无法重复领取。');
  const quest = questById(pending.quest);
  const branch = quest.branches.find(b => b.id === pending.branch)!;
  const oldMax = maxHp(state);
  exchange(state, {}, { coin: quest.coins || undefined, ...branch.gain });
  const growth = gainExperience(state.xp, quest.xp, CURVE);
  state.xp = growth.xp;
  state.points += growth.earnedLevels;
  state.hp = Math.min(maxHp(state), state.hp + maxHp(state) - oldMax);
  state.completed[quest.id] = branch.id;
  state.values[branch.stance]++;
  if (quest.recruit && !state.party.includes(quest.recruit)) state.party.push(quest.recruit);
  if (quest.bond) state.bonds[quest.bond]++;
  if (quest.id === 'mirror') { state.hp = maxHp(state); state.energy = maxEnergy(state); }
  if (quest.id === 'crossing') state.act = 2;
  if (quest.id === 'council') state.act = 3;
  note(state, `完成「${quest.title}」：阅历＋${quest.xp}，铜叶＋${quest.coins}。${QUEST_STORY[quest.id][1]}`);
  state.phase = quest.id === 'furnace' ? 'finale' : 'travel';
  state.pending = null;
  state.battle = null;
}
export interface LegalOrder { action: Action; lane: number; target: typeof TARGETS[number] }
export function legalOrders(state: State, actor: Actor): LegalOrder[] {
  const battle = state.battle;
  if (!battle) return [];
  const ally = battle.allies.find(a => a.id === actor);
  if (ally) {
    const result: LegalOrder[] = [];
    for (let lane = 0; lane < 3; lane++) {
      if (Math.abs(lane - ally.lane) > 1) continue;
      result.push({ action: 'guard', lane, target: 'caravan' });
      if (ally.id === 'mo' && ally.energy >= 2 && state.hp < maxHp(state)) result.push({ action: 'mend', lane, target: 'caravan' });
      for (const enemy of battle.enemies.filter(e => e.hp > 0)) {
        result.push({ action: 'strike', lane, target: enemy.id });
        if (ally.id === 'qiao' && ally.energy >= 2) result.push({ action: 'burst', lane, target: enemy.id });
      }
    }
    return result;
  }
  const enemy = battle.enemies.find(e => e.id === actor && e.hp > 0);
  if (!enemy) return [];
  const result: LegalOrder[] = [{ action: 'guard', lane: enemy.lane, target: enemy.id }];
  for (let lane = 0; lane < 3; lane++) {
    result.push({ action: 'strike', lane, target: 'caravan' });
    if (enemy.energy >= 2) result.push({ action: 'sweep', lane, target: 'caravan' });
  }
  return result;
}
export function battleActors(state: State): Actor[] {
  return state.battle ? [...state.battle.allies.map(a => a.id), ...state.battle.enemies.filter(e => e.hp > 0).map(e => e.id)] : [];
}
function validateBattle(state: State, plan: Plan) {
  requireRule(plan.kind === 'battle' && plan.speaker === questById(state.pending!.quest).person, '战术与当前遭遇不符。');
  const actors = battleActors(state);
  requireRule(plan.orders.length === actors.length && new Set(plan.orders.map(o => o.actor)).size === actors.length, '每位在场角色必须且只能行动一次。');
  for (const order of plan.orders) requireRule(actors.includes(order.actor) && legalOrders(state, order.actor).some(o =>
    o.action === order.action && o.lane === order.lane && o.target === order.target), '战术超出当前角色的站位、心火或目标限制。');
}
function resolve(state: State, command: Extract<Command, { type: 'act' }>) {
  const battle = state.battle!;
  const plan = battle.plan!;
  requireRule(Math.abs(command.lane - battle.heroLane) <= 1, '每轮只能移动到相邻战线。');
  const target = battle.enemies.find(e => e.id === command.target && e.hp > 0);
  requireRule(Boolean(target), '只能选择仍在场的敌人。');
  if (command.action === 'flare') requireRule(state.energy >= 2, '烬火需要两点心火。');
  if (command.action === 'tonic') {
    requireRule(state.hp < maxHp(state), '生命已满，不消耗药品。');
    exchange(state, { tonic: 1 }, {});
  }
  battle.heroLane = command.lane;
  const shields = [0, 0, 0];
  const guarded = new Set(plan.orders.filter(o => o.action === 'guard' && ENEMY_IDS.some(id => id === o.actor)).map(o => o.actor));
  // 公开的破甲战术先于伤害生效，玩家和先行动的同伴也能利用缺口。
  for (const order of plan.orders) {
    const exposed = battle.enemies.find(enemy => enemy.id === order.target);
    if (order.action === 'burst' && exposed && battle.allies.some(ally => ally.id === order.actor)) guarded.delete(exposed.id);
  }
  const hit = (enemy: Enemy, damage: number, pierce = false) => {
    enemy.hp = Math.max(0, enemy.hp - Math.max(1, damage - (!pierce && guarded.has(enemy.id) ? 4 : 0)));
  };
  for (const enemy of battle.enemies) if (enemy.hp > 0 && enemy.burn > 0) {
    hit(enemy, 2, true); enemy.burn--; note(state, `${ENEMY_NAMES[enemy.id]}受到二点余烬灼伤。`);
  }
  if (command.action === 'strike' || command.action === 'flare') {
    const attack = level(state) + state.build.fire + (state.equipment === 'lens' ? 2 : 0) +
      (battle.round === 1 && state.pending!.offer === 'freedom' ? 1 : 0);
    const damage = (command.action === 'flare' ? 8 + state.build.fire : 5) + attack - (command.lane === target!.lane ? 0 : 2);
    hit(target!, damage);
    if (command.action === 'flare') { state.energy -= 2; target!.burn = 2; }
    note(state, `小烬在${LANES[command.lane]}使用${command.action === 'flare' ? '烬火' : '普攻'}，命中${ENEMY_NAMES[target!.id]}。`);
  } else if (command.action === 'guard') {
    shields[command.lane] += 5 + state.build.shelter;
    state.energy = Math.min(maxEnergy(state), state.energy + 2);
    note(state, `小烬护持${LANES[command.lane]}，恢复两点心火。`);
  } else {
    state.hp = Math.min(maxHp(state), state.hp + 16);
    note(state, '消耗一瓶温灯药，恢复十六点生命。');
  }
  for (const ally of battle.allies) {
    const order = plan.orders.find(o => o.actor === ally.id)!;
    ally.lane = order.lane;
    if (order.action === 'guard') {
      shields[order.lane] += (ally.id === 'lan' ? 4 : 2) + state.bonds[ally.id];
      ally.energy = Math.min(3, ally.energy + 1);
    } else if (order.action === 'mend') {
      ally.energy -= 2;
      state.hp = Math.min(maxHp(state), state.hp + 6 + state.bonds.mo);
    } else {
      const enemy = battle.enemies.find(e => e.id === order.target)!;
      if (order.action === 'burst') ally.energy -= 2;
      if (enemy.hp > 0) hit(enemy, 3 + Math.floor(level(state) / 2) + (ally.id === 'qiao' ? 1 : 0) +
        state.bonds[ally.id] + (order.action === 'burst' ? 3 : 0) - (ally.lane === enemy.lane ? 0 : 1), order.action === 'burst');
    }
  }
  for (const enemy of battle.enemies.filter(e => e.hp > 0)) {
    const order = plan.orders.find(o => o.actor === enemy.id)!;
    if (order.action === 'guard') { enemy.energy = Math.min(3, enemy.energy + 1); continue; }
    if (order.action === 'sweep') enemy.energy -= 2;
    const reaches = order.action === 'sweep' ? Math.abs(battle.heroLane - order.lane) <= 1 : battle.heroLane === order.lane;
    const raw = reaches ? enemy.power + (order.action === 'sweep' ? 2 : 0) : 2;
    const shield = shields[battle.heroLane] + (state.equipment === 'coat' ? 1 : 0) + (battle.round === 1 && state.pending!.offer === 'duty' ? 2 : 0);
    const damage = Math.max(0, raw - shield);
    state.hp = Math.max(0, state.hp - damage);
    note(state, `${ENEMY_NAMES[enemy.id]}${ACTION_NAMES[order.action]}${LANES[order.lane]}，车队损失${damage}点生命。`);
  }
  state.rounds++;
  if (battle.enemies.every(e => e.hp <= 0) && state.hp > 0) { complete(state); return; }
  if (battle.round >= 6) {
    state.hp = Math.max(0, state.hp - 12);
    note(state, '久战导致悬缆崩裂：第六轮起，每轮额外损失十二点生命。');
  }
  if (state.hp <= 0) {
    state.phase = 'ended'; state.ending = 'lost'; note(state, '车队失去支撑。任务未完成，也未发放奖励。'); return;
  }
  battle.round++;
  battle.plan = null;
  state.phase = 'forecast';
}
export function reduce(previous: State, command: Command): State {
  requireRule(previous.phase !== 'ended', '旅途已经结束，请重新启程。');
  const state = structuredClone(previous);
  const town = () => requireRule(state.phase === 'travel', '请先完成当前商议或遭遇。');
  switch (command.type) {
    case 'travel':
      town(); requireRule(command.location !== state.location && unlocked(state).includes(command.location), '这条航路尚未解锁，或已经身在此处。');
      state.location = command.location; break;
    case 'parley': {
      town(); requireRule(available(state).some(q => q.id === command.quest), '此地没有这项可商议的任务。');
      const plan = command.plan;
      requireRule(plan.kind === 'parley' && plan.speaker === questById(command.quest).person && plan.orders.length === 0, '商议只能由在场角色发言，不能夹带战斗命令。');
      state.pending = { quest: command.quest, branch: null, offer: plan.stance, line: plan.line };
      state.phase = 'choice'; note(state, `${CHARACTERS[plan.speaker].name}：${plan.line}`); break;
    }
    case 'choose': {
      requireRule(state.phase === 'choice' && state.pending !== null, '现在没有待作出的抉择。');
      const quest = questById(state.pending.quest), branch = quest.branches.find(b => b.id === command.branch)!;
      const blocked = branchBlock(state, branch);
      requireRule(!blocked, blocked ?? '这项抉择尚未开放。');
      exchange(state, branch.cost ?? {}, {});
      state.pending.branch = command.branch;
      note(state, `选择：${branch.label}。`);
      if (quest.id === 'furnace' && command.branch === 'b') {
        complete(state); state.ending = 'shared'; state.phase = 'ended';
      } else if (quest.battle) {
        state.battle = { round: 1, heroLane: 1,
          enemies: BATTLES[quest.battle].map(e => ({ ...e, maxHp: e.hp, energy: 3, burn: 0 })),
          allies: state.party.map((id, i) => ({ id, lane: i % 3, energy: 3 })), plan: null };
        if (state.pending.offer === 'memory') state.energy = Math.min(maxEnergy(state), state.energy + 1);
        state.phase = 'forecast';
      } else complete(state);
      break;
    }
    case 'forecast':
      requireRule(state.phase === 'forecast' && state.battle !== null, '当前不接受新的战术。');
      validateBattle(state, command.plan); state.battle.plan = structuredClone(command.plan); state.phase = 'action';
      note(state, command.plan.line); break;
    case 'act':
      requireRule(state.phase === 'action' && state.battle !== null && state.battle.plan !== null, '先请求并阅读公开战术，再选择动作。');
      resolve(state, command); break;
    case 'camp':
      town(); requireRule(['kiln', 'market', 'bell', 'reservoir', 'observatory'].includes(state.location), '此处无法扎营。');
      requireRule(state.hp > 0 && (state.hp < maxHp(state) || state.energy < maxEnergy(state)), '队伍状态已满，无需扎营。');
      exchange(state, { coin: 4 }, {}); state.hp = maxHp(state); state.energy = maxEnergy(state);
      note(state, '支付四铜叶扎营。灯下休整，生命与心火恢复。'); break;
    case 'buy':
      town(); requireRule(state.location === 'market', '只有百帆集出售物资。');
      requireRule(state.stock[command.item] > 0, '这件商品已经售罄。');
      exchange(state, { coin: PRICES[command.item] }, { [command.item]: 1 });
      state.stock[command.item]--; note(state, `购入${ITEM_NAMES[command.item]}。`); break;
    case 'equip':
      town(); requireRule(state.equipment !== command.item, '此装备已经装配。');
      requireRule(command.item === 'none' || state.bag[command.item] > 0, '行囊里没有这件装备。');
      state.equipment = command.item; state.hp = Math.min(state.hp, maxHp(state)); break;
    case 'build':
      town(); requireRule(state.points > 0 && state.build[command.path] < 3, '没有可用航技点，或此航技已满。');
      state.points--; state.build[command.path]++;
      note(state, command.path === 'fire' ? '修习烬火航技：攻击增强，二阶增加一点心火上限。' : '修习守帆航技：生命上限增加四点，护持增加一点。'); break;
    case 'ending':
      requireRule(state.phase === 'finale' && state.completed.furnace === 'a', '尚未取得炉心的决定权。');
      requireRule(command.ending === 'anchor' || canUnbind(state), '拆除主环需要完成墨鹭支线，且留痕至少三点。');
      state.ending = command.ending; state.phase = 'ended'; break;
  }
  return state;
}
export const definition: GameDefinition<State, Command> = { id: 'emberwake', create, reduce, parseCommand };
