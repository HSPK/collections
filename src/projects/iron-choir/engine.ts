import { AgentValidationError, requireRule } from '../../core/agents/errors';
import { array, choice, integer, isRecord, object, text } from '../../core/agents/schema';
import { createInventory, exchangeInventory } from '../../core/rpg/inventory';
import type { Inventory, ItemStack } from '../../core/rpg/inventory';
import { gainExperience, progression } from '../../core/rpg/progression';
import {
  ENDING_IDS, ENEMY_DATA, GEAR, GEAR_IDS, GOALS, ITEMS, LEVELS, LOCATIONS, LOCATION_IDS,
  MACHINES, MISSIONS, MISSION_IDS, PILOT_IDS, SKILLS,
} from './data';
import type { EndingId, EnemyKind, GearId, Goal, ItemId, LocationId, MissionId, PilotId, SkillId } from './data';
import { ENDINGS, INTERLUDES, MISSION_STORY } from './story';
import { center, distance, equalPoint, makeField, pathsFrom, pointKey, shotGeometry } from './spatialmath';
import type { Field, Point } from './spatialmath';

export interface Pilot {
  id: PilotId; recruited: boolean; xp: number; skills: SkillId[]; damage: number; bond: number;
  weapon: GearId; core: GearId; perk: 'relay' | null;
}
export interface Unit {
  id: string; name: string; team: 'friend' | 'enemy' | 'civil'; pilot: PilotId | null; kind: EnemyKind | null;
  position: Point; hull: number; maxHull: number; shield: number; maxShield: number;
  energy: number; maxEnergy: number; heat: number; maxHeat: number; ap: number;
  range: number; damage: number; move: number; guard: boolean; cooling: number; shieldRegen: number; shotHeat: number;
}
export type ActionKind = 'move' | 'fire' | 'burst' | 'guard' | 'vent' | 'brace' | 'snipe' | 'mend' | 'link';
export interface Action {
  id: string; name: string; kind: ActionKind; target: string | null; to: Point | null;
  path: Point[]; ap: number; energy: number; heat: number; damage: number; cover: boolean;
}
export interface Order { unit: string; option: string; intention: string }
export interface Plan { round: number; side: 'enemy' | 'ally'; orders: Order[]; intention: string }
export interface Forecast { unit: string; action: Action; aim: Point | null; intention: string }
export interface Battle {
  mission: MissionId; round: number; stage: 'forecast' | 'player'; units: Unit[];
  forecasts: Forecast[]; links: number; route: 'main' | 'ridge'; history: string[];
}
export interface State {
  seed: number; phase: 'hangar' | 'battle' | 'debrief' | 'defeat' | 'resolution' | 'ended';
  location: LocationId; lead: PilotId; pilots: Record<PilotId, Pilot>; inventory: Inventory<ItemId>;
  crafted: GearId[]; completed: MissionId[]; quests: string[]; decisions: Record<string, string>;
  empathy: number; autonomy: number; truth: number; debt: number; failures: number; goal: Goal;
  battle: Battle | null; ending: EndingId | null; log: string[]; reply: string;
}
export type Command =
  | { type: 'visit'; location: LocationId }
  | { type: 'lead'; pilot: PilotId }
  | { type: 'build'; gear: GearId }
  | { type: 'equip'; pilot: PilotId; gear: GearId }
  | { type: 'unmount'; pilot: PilotId }
  | { type: 'repair'; pilot: PilotId }
  | { type: 'fabricate' }
  | { type: 'learn'; pilot: PilotId; skill: SkillId }
  | { type: 'choice'; scene: string; choice: string }
  | { type: 'goal'; goal: Goal }
  | { type: 'deploy'; mission: MissionId; route: 'main' | 'ridge' }
  | { type: 'player'; option: string }
  | { type: 'agent'; plan: Plan }
  | { type: 'resolve' }
  | { type: 'debrief' }
  | { type: 'retreat' }
  | { type: 'recover'; payment: 'scrap' | 'debt' }
  | { type: 'ending'; ending: EndingId };

const CAPACITY = { capacity: 120, stackLimit: 60 };
const stacks = (values: Partial<Record<ItemId, number>>): ItemStack<ItemId>[] =>
  ITEMS.filter(item => (values[item] ?? 0) > 0).map(item => ({ item, amount: values[item]! }));
function exchange(s: State, spend: Partial<Record<ItemId, number>>, gain: Partial<Record<ItemId, number>>) {
  for (const item of ITEMS) requireRule(s.inventory[item] >= (spend[item] ?? 0), '物资不足，工单未执行。');
  s.inventory = exchangeInventory(s.inventory, { spend: stacks(spend), gain: stacks(gain) }, CAPACITY);
}
function log(s: State, message: string) { s.log = [...s.log.slice(-39), message]; }
function battleLog(b: Battle, message: string) { b.history = [...b.history.slice(-23), message]; }
function grantQuest(s: State, id: string) {
  requireRule(!s.quests.includes(id), '这项任务已经结算，不能重复领取。');
  s.quests.push(id);
}
export function create(seed: number): State {
  const pilot = (id: PilotId): Pilot => ({ id, recruited: id !== 'ye', xp: 0, skills: [], damage: 0, bond: id === 'shen' ? 2 : 0, weapon: 'standard', core: 'stock', perk: null });
  return {
    seed: integer(seed, '世界种子', 0, 0xffffffff), phase: 'hangar', location: 'hangar', lead: 'shen',
    pilots: { shen: pilot('shen'), luo: pilot('luo'), ye: pilot('ye') },
    inventory: createInventory(ITEMS, stacks({ scrap: 8, kit: 4, alloy: 2, coil: 1 }), CAPACITY),
    crafted: [], completed: [], quests: [], decisions: {}, empathy: 0, autonomy: 0, truth: 0,
    debt: 0, failures: 0, goal: 'protect', battle: null, ending: null,
    log: ['第九机库远征档案已建立。未连接模型，不会自动请求。'], reply: '',
  };
}
export function pilotStats(p: Pilot) {
  const base = MACHINES[p.id], level = progression(p.xp, LEVELS).level;
  return {
    maxHull: base.hull + (level - 1) * 2,
    maxShield: base.shield + (p.core === 'bulwark' ? 6 : 0) + (p.skills.includes('vigil') ? 4 : 0),
    maxEnergy: base.energy + (p.core === 'reactor' ? 3 : p.core === 'bulwark' ? -1 : 0) + (p.skills.includes('capacitor') ? 2 : 0),
    maxHeat: base.heat + (p.core === 'reactor' ? 2 : 0) + (p.skills.includes('coolant') ? 3 : 0),
    range: base.range + (p.weapon === 'lance' ? 2 : 0),
    damage: base.damage + Math.floor((level - 1) / 2) + (p.weapon === 'lance' ? 3 : p.weapon === 'pulse' ? 1 : 0) + (p.skills.includes('piercer') ? 2 : 0),
    move: base.move + (p.skills.includes('stride') ? 1 : 0), cooling: p.skills.includes('coolant') ? 4 : 3,
    shieldRegen: p.skills.includes('vigil') ? 2 : 1,
    shotHeat: p.weapon === 'lance' ? 4 : p.weapon === 'pulse' ? 2 : 3,
  };
}
export function activeBattle(s: State): Battle {
  requireRule(s.phase === 'battle' && s.battle, '当前不在战斗中。');
  return s.battle;
}
export function fieldFor(s: State): Field { return makeField(s.battle?.mission ?? s.location, s.seed); }
export function agentUnits(s: State, side: Plan['side']): Unit[] {
  const b = activeBattle(s);
  return b.units.filter(u => u.hull > 0 && (side === 'enemy' ? u.team === 'enemy' : u.team === 'friend' && u.id !== s.lead));
}
export function actionsFor(s: State, id: string): Action[] {
  const b = activeBattle(s), u = b.units.find(unit => unit.id === id);
  if (!u || u.hull <= 0 || u.team === 'civil') return [];
  const field = fieldFor(s), result: Action[] = [];
  const add = (id: string, name: string, kind: ActionKind, ap: number, energy: number, heat: number,
    target: string | null = null, damage = 0, to: Point | null = null, path: Point[] = [], cover = false) => {
    if (u.ap >= ap && u.energy >= energy && u.heat + heat <= u.maxHeat) {
      result.push({ id, name, kind, ap, energy, heat, target, damage, to, path, cover });
    }
  };
  add('guard', '架盾待机', 'guard', 1, 0, 0);
  add('vent', '排热充能', 'vent', 1, 0, 0);
  if (u.pilot === 'shen') add('brace', '立壁', 'brace', 1, 2, 1);
  for (const target of b.units.filter(target => target.hull > 0 && target.id !== id)) {
    const foe = u.team === 'enemy' ? target.team !== 'enemy' : target.team === 'enemy';
    if (foe) {
      const geometry = shotGeometry(field, u.position, target.position, u.range);
      if (geometry.visible && geometry.inRange) {
        const amount = Math.max(1, u.damage - (geometry.cover ? 3 : 0));
        add(`fire:${target.id}`, `射击 ${target.name}`, 'fire', 1, 2, u.shotHeat, target.id, amount, null, [], geometry.cover);
        add(`burst:${target.id}`, `齐射 ${target.name}`, 'burst', 2, 4, u.shotHeat + 2, target.id, amount + 4, null, [], geometry.cover);
      }
      const sniper = shotGeometry(field, u.position, target.position, u.range + 2);
      if (u.pilot === 'luo' && sniper.visible && sniper.inRange) {
        add(`snipe:${target.id}`, `远针 ${target.name}`, 'snipe', 1, 3, u.shotHeat + 1, target.id, Math.max(1, u.damage + 3 - (sniper.cover ? 3 : 0)), null, [], sniper.cover);
      }
    } else if (u.pilot === 'ye' && target.team === 'friend' && target.hull < target.maxHull &&
      distance(center(field, u.position), center(field, target.position)) <= 3) {
      add(`mend:${target.id}`, `缝合 ${target.name}`, 'mend', 1, 3, 1, target.id);
    }
  }
  const occupied = b.units.filter(other => other.hull > 0 && other.id !== id).map(other => other.position);
  for (const [key, path] of pathsFrom(field, u.position, u.move, occupied)) {
    const to = path[path.length - 1];
    add(`move:${key}`, `移至 ${to.x + 1}列${to.z + 1}行`, 'move', 1, 2, 1, null, 0, to, path);
  }
  const mission = MISSIONS.find(m => m.id === b.mission)!;
  if (u.team === 'friend' && mission.links > 0 && b.links < mission.links &&
    distance(center(field, u.position), center(field, field.terminal)) <= 1.5) {
    add('link', '接驳终端', 'link', 1, 1, 1);
  }
  return result;
}
export function damagePreview(s: State, action: Action) {
  const target = s.battle?.units.find(u => u.id === action.target);
  if (!target) return { shield: 0, hull: 0 };
  const damage = Math.max(1, action.damage - (target.guard ? 3 : 0));
  return { shield: Math.min(target.shield, damage), hull: Math.min(target.hull, Math.max(0, damage - target.shield)) };
}
function perform(s: State, unit: Unit, action: Action, aim?: Point | null) {
  const b = s.battle!;
  requireRule(unit.ap >= action.ap && unit.energy >= action.energy && unit.heat + action.heat <= unit.maxHeat, '行动点、能量或热容量不足。');
  unit.ap -= action.ap; unit.energy -= action.energy; unit.heat += action.heat;
  const target = b.units.find(other => other.id === action.target);
  if (action.kind === 'move') {
    requireRule(action.to, '移动缺少落点。');
    unit.position = { ...action.to };
  } else if (action.kind === 'guard' || action.kind === 'brace') {
    unit.guard = true;
    unit.shield = Math.min(unit.maxShield, unit.shield + (action.kind === 'brace' ? 6 : 3));
  } else if (action.kind === 'vent') {
    unit.heat = Math.max(0, unit.heat - 5); unit.energy = Math.min(unit.maxEnergy, unit.energy + 3);
  } else if (action.kind === 'link') {
    b.links += unit.pilot && s.pilots[unit.pilot].perk === 'relay' ? 2 : 1;
    b.links = Math.min(MISSIONS.find(m => m.id === b.mission)!.links, b.links);
  } else if (action.kind === 'mend') {
    requireRule(target && target.hull > 0, '不能修复已经击毁的机体。');
    target.hull = Math.min(target.maxHull, target.hull + 6);
  } else {
    const hit = target && target.hull > 0 && (!aim || equalPoint(target.position, aim)) &&
      shotGeometry(fieldFor(s), unit.position, target.position, unit.range + (action.kind === 'snipe' ? 2 : 0)).visible;
    if (!hit) {
      battleLog(b, `${unit.name}按预告射向旧坐标，目标已脱离；弹道落空。`);
      return;
    }
    const loss = damagePreview(s, action);
    target.shield -= loss.shield;
    target.hull -= loss.hull;
    battleLog(b, `${unit.name} → ${target.name}：护盾 −${loss.shield}，结构 −${loss.hull}${action.cover ? '（低掩体减伤三）' : ''}。`);
    return;
  }
  battleLog(b, `${unit.name}：${action.name}。`);
}
function recordDamage(s: State) {
  for (const u of s.battle!.units) if (u.pilot) s.pilots[u.pilot].damage = u.maxHull - u.hull;
}
function outcome(s: State): boolean {
  const b = s.battle!, mission = MISSIONS.find(m => m.id === b.mission)!;
  const leader = b.units.find(u => u.id === s.lead)!;
  const asset = b.units.find(u => u.team === 'civil');
  if (leader.hull <= 0 || (asset && asset.hull <= 0) || b.round > mission.rounds) {
    s.phase = 'defeat'; s.failures++; recordDamage(s);
    log(s, leader.hull <= 0 ? '队长机体失能，远征中止。' : asset?.hull === 0 ? '民用设施被毁，远征中止。' : '错过撤离窗口，远征中止。');
    return true;
  }
  const cleared = b.units.every(u => u.team !== 'enemy' || u.hull <= 0);
  const won = mission.objective === 'clear' ? cleared :
    mission.objective === 'hold' ? b.round > 3 :
      mission.objective === 'escort' ? asset!.position.x >= 5 :
        mission.objective === 'final' ? b.links >= 3 || (cleared && b.links >= 1) : cleared && b.links >= mission.links;
  if (won) {
    s.phase = 'debrief'; recordDamage(s); log(s, `${mission.name}完成。等待归库核对战利品；此时尚未发放。`);
    return true;
  }
  return false;
}
export function parsePlan(value: unknown): Plan {
  const p = object(value, ['round', 'side', 'orders', 'intention'], '战术计划');
  const chinese = (v: unknown, label: string, max: number) => {
    const line = text(v, label, max);
    requireRule(/[\u3400-\u9fff]/u.test(line), `${label}必须使用中文公开说明。`);
    return line;
  };
  return {
    round: integer(p.round, '轮次', 1, 12), side: choice(p.side, ['enemy', 'ally'], '指挥侧'),
    orders: array(p.orders, entry => {
      const order = object(entry, ['unit', 'option', 'intention'], '机体指令');
      return { unit: text(order.unit, '机体标识', 12), option: text(order.option, '合法选项', 40), intention: chinese(order.intention, '机体意图', 90) };
    }, '机体指令', 1, 4),
    intention: chinese(p.intention, '公开意图', 160),
  };
}
export function validatePlan(s: State, plan: Plan): Forecast[] {
  const b = activeBattle(s);
  requireRule(plan.round === b.round, '轮次已经改变，旧计划不产生任何消耗。');
  requireRule((plan.side === 'enemy' && b.stage === 'forecast') || (plan.side === 'ally' && b.stage === 'player'), '计划不属于当前指挥阶段。');
  const units = agentUnits(s, plan.side);
  requireRule(plan.orders.length === units.length && new Set(plan.orders.map(o => o.unit)).size === units.length, '每台存活代理机体必须且只能收到一条指令。');
  const destinations = new Set<string>();
  return units.map(unit => {
    const order = plan.orders.find(o => o.unit === unit.id);
    requireRule(order, '计划缺少本方机体，或含有越权单位。');
    const action = actionsFor(s, unit.id).find(a => a.id === order.option);
    requireRule(action, `${unit.name}的选项不合法：请只使用观察中的选项标识。`);
    if (action.to) {
      const key = pointKey(action.to);
      requireRule(!destinations.has(key), '两台机体不能预约同一落点。');
      destinations.add(key);
    }
    const target = b.units.find(u => u.id === action.target);
    return { unit: unit.id, action, aim: target ? { ...target.position } : null, intention: order.intention };
  });
}
function executeOrders(s: State, orders: Forecast[], locked: boolean) {
  for (const order of orders) {
    if (s.phase !== 'battle') break;
    const unit = s.battle!.units.find(u => u.id === order.unit)!;
    if (unit.hull <= 0) continue;
    const current = actionsFor(s, unit.id).find(a => a.id === order.action.id);
    const attack = ['fire', 'burst', 'snipe'].includes(order.action.kind);
    const target = s.battle!.units.find(u => u.id === order.action.target);
    if (locked && attack && target && target.hull > 0) {
      perform(s, unit, order.action, order.aim);
    } else if (current) {
      perform(s, unit, current);
    } else {
      battleLog(s.battle!, `${unit.name}的前置条件因更早行动改变，取消该动作，不消耗资源。`);
    }
    outcome(s);
  }
}
function finishRound(s: State) {
  const b = s.battle!;
  executeOrders(s, b.forecasts, true);
  if (s.phase !== 'battle') return;
  const asset = b.units.find(u => u.team === 'civil');
  if (b.mission === 'bridge' && asset && !b.units.some(u => u.team === 'enemy' && u.hull > 0 &&
    Math.hypot(u.position.x - asset.position.x, u.position.z - asset.position.z) <= 1.5)) {
    const next = { x: asset.position.x + 1, z: asset.position.z };
    if (!b.units.some(u => u.hull > 0 && equalPoint(u.position, next))) asset.position = next;
    else battleLog(b, '货厢前方被机体占用，等待让路。');
  }
  b.round++;
  for (const u of b.units.filter(u => u.hull > 0 && u.team !== 'civil')) {
    u.ap = 2; u.energy = Math.min(u.maxEnergy, u.energy + 4);
    u.heat = Math.max(0, u.heat - u.cooling); u.shield = Math.min(u.maxShield, u.shield + u.shieldRegen); u.guard = false;
  }
  b.forecasts = [];
  b.stage = b.units.some(u => u.team === 'enemy' && u.hull > 0) ? 'forecast' : 'player';
  outcome(s);
}
function requireHangar(s: State) { requireRule(s.phase === 'hangar', '请先完成当前出征，再办理机库工单。'); }
export function endingAvailable(s: State, ending: EndingId): boolean {
  if (s.completed.length !== MISSIONS.length) return false;
  if (ending === 'choir') return s.empathy >= 2 && s.truth >= 2 && s.pilots.ye.bond >= 2;
  if (ending === 'quiet') return s.autonomy >= 2 && Boolean(s.decisions.withdrawal);
  return s.completed.includes('bridge');
}
export function gearUnlocked(s: State, gear: GearId): boolean {
  return !GEAR[gear].unlock || (gear === 'relay' ? s.decisions.mercy === 'share' : s.quests.includes(GEAR[gear].unlock));
}
function deploy(s: State, missionId: MissionId, route: 'main' | 'ridge') {
  requireHangar(s);
  const mission = MISSIONS[s.completed.length];
  requireRule(mission?.id === missionId, '只能出征当前未完成的主线任务，已结算任务不能刷取战利品。');
  requireRule(route === 'main' || s.pilots.luo.bond >= 2, '罗烬尚未开放高台侧路。');
  const pilots = PILOT_IDS.filter(id => s.pilots[id].recruited);
  requireRule(pilots.every(id => s.pilots[id].damage < pilotStats(s.pilots[id]).maxHull), '有机体结构归零，请先修复。');
  const starts: Record<PilotId, Point> = { shen: { x: 1, z: 2 }, luo: { x: route === 'ridge' ? 3 : 1, z: 6 }, ye: { x: 0, z: 3 } };
  const units: Unit[] = pilots.map(id => {
    const stats = pilotStats(s.pilots[id]);
    return { ...stats, id, name: MACHINES[id].name, team: 'friend', pilot: id, kind: null, position: starts[id],
      hull: stats.maxHull - s.pilots[id].damage, shield: stats.maxShield, energy: stats.maxEnergy, heat: 0, ap: 2, guard: false };
  });
  const enemyStarts = [{ x: 6, z: 2 }, { x: 7, z: 4 }, { x: 7, z: 1 }, { x: 8, z: 5 }];
  mission.enemies.forEach((kind, i) => {
    const data = ENEMY_DATA[kind], hull = data.hull + s.completed.length;
    units.push({ id: `e${i}`, name: `${data.name}${'甲乙丙丁'[i]}`, team: 'enemy', pilot: null, kind, position: enemyStarts[i],
      hull, maxHull: hull, shield: 3 + Math.floor(s.completed.length / 2), maxShield: 3 + Math.floor(s.completed.length / 2),
      energy: 8, maxEnergy: 8, heat: 0, maxHeat: 10, ap: 2, range: data.range, damage: data.damage,
      move: kind === 'hunter' ? 4 : 3, guard: false, cooling: 3, shieldRegen: 1, shotHeat: 3 });
  });
  if (mission.objective === 'hold' || mission.objective === 'escort') {
    units.push({ id: 'beacon', name: mission.objective === 'hold' ? '民用水泵' : '断路器货厢', team: 'civil', pilot: null, kind: null,
      position: { x: mission.objective === 'hold' ? 3 : 1, z: 3 }, hull: 28, maxHull: 28, shield: 4, maxShield: 4,
      energy: 0, maxEnergy: 0, heat: 0, maxHeat: 0, ap: 0, range: 0, damage: 0, move: 0, guard: false, cooling: 0, shieldRegen: 0, shotHeat: 0 });
  }
  s.battle = { mission: mission.id, round: 1, stage: 'forecast', units, forecasts: [], links: 0, route, history: [] };
  s.phase = 'battle'; s.location = mission.location; s.reply = MISSION_STORY[mission.id].before;
  log(s, `出征：${mission.name}；${route === 'ridge' ? '纸隼使用高台侧路' : '沿主路进入'}。`);
}
function makeChoice(s: State, scene: string, selected: string) {
  requireHangar(s);
  const interlude = INTERLUDES.find(i => i.id === scene);
  requireRule(interlude && s.location === interlude.location && s.completed.length >= interlude.after, '请在剧情解锁后，前往对应地点交谈。');
  requireRule(!s.decisions[scene], '这个决定已经写入战记，不能重复领取后果。');
  const option = interlude.choices.find(o => o.id === selected);
  requireRule(option, '不存在这项对话决定。');
  s.decisions[scene] = selected; grantQuest(s, scene); s.reply = option.reply;
  if (scene === 'mercy') {
    if (selected === 'share') { s.pilots.luo.bond += 2; s.empathy++; exchange(s, {}, { coil: 1 }); }
    else exchange(s, {}, { scrap: 4, kit: 1 });
  } else if (scene === 'archive') {
    s.pilots.ye.recruited = true;
    s.pilots.ye.xp = s.pilots.shen.xp;
    s.pilots.ye.bond += selected === 'publish' ? 2 : 1;
    s.truth += selected === 'publish' ? 2 : 1;
    if (selected === 'publish') s.autonomy++;
    else exchange(s, {}, { alloy: 2 });
  } else if (scene === 'oath') {
    if (selected === 'review') { s.empathy++; s.autonomy++; exchange(s, {}, { alloy: 1 }); }
    else exchange(s, {}, { scrap: 3 });
  } else if (scene === 'silence') {
    s.empathy++;
    if (selected === 'rest') { s.autonomy++; s.pilots.luo.bond++; s.decisions.withdrawal = 'yes'; }
    else { s.truth++; s.pilots.ye.bond++; exchange(s, {}, { coil: 1 }); }
  } else if (selected === 'people') {
    s.empathy++; s.pilots.ye.bond++; exchange(s, {}, { coil: 1 });
  } else {
    s.truth++; s.autonomy++; s.decisions.withdrawal = 'yes'; exchange(s, {}, { scrap: 2 });
  }
  log(s, `${interlude.title}：${option.title}。`);
}
export function reduce(state: State, command: Command): State {
  const s = structuredClone(state);
  requireRule(s.phase !== 'ended', '战记已落款。请通过重新开始建立新远征。');
  switch (command.type) {
    case 'visit': {
      requireHangar(s);
      requireRule(LOCATIONS.find(l => l.id === command.location)!.unlock <= s.completed.length, '这处地点尚未开放。');
      requireRule(s.location !== command.location, '已经在这处地点。');
      s.location = command.location; s.reply = ''; break;
    }
    case 'lead':
      requireHangar(s); requireRule(s.pilots[command.pilot].recruited && s.lead !== command.pilot, '只能切换到已加入且不是当前队长的驾驶员。');
      s.lead = command.pilot; log(s, `${MACHINES[command.pilot].name}担任本次远征的主控机。`); break;
    case 'build':
      requireHangar(s);
      requireRule(!['standard', 'stock'].includes(command.gear) && !s.crafted.includes(command.gear), '原装或已制造装备不能重复生产。');
      requireRule(gearUnlocked(s, command.gear), '尚未取得这件装备的图纸。');
      exchange(s, GEAR[command.gear].cost, {}); s.crafted.push(command.gear);
      if (!s.quests.includes('refit')) { grantQuest(s, 'refit'); exchange(s, {}, { kit: 1 }); }
      log(s, `制造完成：${GEAR[command.gear].name}。请在配装中装入机体。`); break;
    case 'equip': {
      requireHangar(s);
      const p = s.pilots[command.pilot], gear = command.gear, slot = GEAR[gear].slot;
      requireRule(p.recruited, '驾驶员尚未加入。');
      requireRule(['standard', 'stock'].includes(gear) || s.crafted.includes(gear), '尚未制造这件装备。');
      requireRule(p[slot] !== gear, '机体已经安装这件装备。');
      requireRule(['standard', 'stock'].includes(gear) || PILOT_IDS.every(id => s.pilots[id][slot] !== gear), '这件独有装备已在另一台机体上，请先换回原装或拆下外挂。');
      if (slot === 'perk') { requireRule(gear === 'relay', '外挂类型不正确。'); p.perk = gear; }
      else p[slot] = gear;
      log(s, `${MACHINES[p.id].name}装入${GEAR[gear].name}。`); break;
    }
    case 'repair': {
      requireHangar(s); const p = s.pilots[command.pilot];
      requireRule(p.recruited && p.damage > 0, '无须修复，不能消耗或复制修复资源。');
      exchange(s, { kit: 1 }, {}); p.damage = 0; log(s, `${MACHINES[p.id].name}修复完成，消耗一修复匣。`); break;
    }
    case 'unmount': {
      requireHangar(s); const p = s.pilots[command.pilot];
      requireRule(p.recruited && p.perk, '这台机体没有可拆卸的战术外挂。');
      p.perk = null; log(s, `${MACHINES[p.id].name}已拆下共振中继，可转交另一台机体。`); break;
    }
    case 'fabricate':
      requireHangar(s); exchange(s, { scrap: 2 }, { kit: 1 }); log(s, '使用二废料组装一修复匣。'); break;
    case 'learn': {
      requireHangar(s); const p = s.pilots[command.pilot];
      requireRule(p.recruited && progression(p.xp, LEVELS).level - 1 > p.skills.length && !p.skills.includes(command.skill), '没有未分配技能点，或已学会此技能。');
      p.skills.push(command.skill);
      if (!s.quests.includes('growth')) { grantQuest(s, 'growth'); exchange(s, {}, { alloy: 1 }); }
      log(s, `${MACHINES[p.id].name}完成成长训练。`); break;
    }
    case 'choice': makeChoice(s, command.scene, command.choice); break;
    case 'goal':
      requireRule(s.phase === 'hangar' || (s.phase === 'battle' && s.battle?.stage === 'forecast'), '协同目标须在截获敌方意图之前公开，不能临时改写代理约定。');
      requireRule(s.goal !== command.goal, '这已经是当前协同目标。'); s.goal = command.goal; break;
    case 'deploy': deploy(s, command.mission, command.route); break;
    case 'player': {
      const b = activeBattle(s); requireRule(b.stage === 'player', '先截获敌方公开意图，再执行队长行动。');
      const action = actionsFor(s, s.lead).find(a => a.id === command.option);
      requireRule(action, '该行动不可用；请检查射程、视线、热量、能量和行动点。');
      perform(s, b.units.find(u => u.id === s.lead)!, action); outcome(s); break;
    }
    case 'agent': {
      const orders = validatePlan(s, command.plan);
      if (command.plan.side === 'enemy') {
        s.battle!.forecasts = orders; s.battle!.stage = 'player';
      } else {
        executeOrders(s, orders, false);
        if (s.phase === 'battle') finishRound(s);
      }
      log(s, command.plan.intention); break;
    }
    case 'resolve':
      requireRule(activeBattle(s).stage === 'player' && agentUnits(s, 'ally').length === 0, '仍有存活同伴，必须由模型提交合法协同行动。');
      finishRound(s); break;
    case 'retreat':
      activeBattle(s); s.phase = 'defeat'; s.failures++; recordDamage(s); log(s, '主动撤离，没有获得本次战利品或经验。'); break;
    case 'debrief': {
      requireRule(s.phase === 'debrief' && s.battle, '没有待核对的战利品，或已经领取。');
      const mission = MISSIONS.find(m => m.id === s.battle!.mission)!;
      requireRule(!s.completed.includes(mission.id), '任务奖励已经领取。');
      const reward = { ...mission.reward };
      const repaid = Math.min(s.debt, reward.scrap ?? 0);
      reward.scrap = (reward.scrap ?? 0) - repaid; s.debt -= repaid;
      exchange(s, {}, reward);
      for (const id of PILOT_IDS) if (s.pilots[id].recruited) s.pilots[id].xp = gainExperience(s.pilots[id].xp, mission.xp, LEVELS).xp;
      s.completed.push(mission.id); grantQuest(s, mission.id);
      if (mission.id === 'water') s.pilots.luo.bond++;
      s.reply = MISSION_STORY[mission.id].after;
      s.phase = s.completed.length === MISSIONS.length ? 'resolution' : 'hangar'; s.location = 'hangar'; s.battle = null;
      log(s, `${mission.name}战利品与全队${mission.xp}经验已入账${repaid ? `，偿还${repaid}废料救援债` : ''}。`); break;
    }
    case 'recover':
      requireRule(s.phase === 'defeat', '只有出征失败后可以调用一次救援。');
      if (command.payment === 'scrap') exchange(s, { scrap: 3 }, {});
      else { requireRule(s.inventory.scrap < 3, '物资足够时请直接支付，救援债仅为物资不足时的恢复通道。'); s.debt += 4; }
      PILOT_IDS.forEach(id => { s.pilots[id].damage = 0; });
      s.phase = 'hangar'; s.location = 'hangar'; s.battle = null; s.reply = '拖索归位。救援工单已记账，队伍可以重新出征，失败任务没有奖励。';
      log(s, command.payment === 'scrap' ? '支付三废料完成救援修复。' : '登记四废料救援债，下一次战利品优先偿还。'); break;
    case 'ending':
      requireRule(s.phase === 'resolution' && endingAvailable(s, command.ending), '尚未赢得该终局协议的条件。');
      s.ending = command.ending; s.phase = 'ended'; s.reply = ENDINGS[command.ending].paragraphs.join('\n\n');
      log(s, `远征落款：${ENDINGS[command.ending].title}。`); break;
  }
  return s;
}
export function parseCommand(value: unknown): Command {
  requireRule(isRecord(value), '战记指令必须是对象。');
  const type = text(value.type, '指令类型', 24);
  const record = (keys: string[]) => object(value, ['type', ...keys], '战记指令');
  const pilot = (v: unknown) => choice(v, PILOT_IDS, '驾驶员');
  switch (type) {
    case 'visit': { const v = record(['location']); return { type, location: choice(v.location, LOCATION_IDS, '地点') }; }
    case 'lead': case 'repair': case 'unmount': { const v = record(['pilot']); return { type, pilot: pilot(v.pilot) }; }
    case 'build': { const v = record(['gear']); return { type, gear: choice(v.gear, GEAR_IDS, '装备') }; }
    case 'equip': { const v = record(['pilot', 'gear']); return { type, pilot: pilot(v.pilot), gear: choice(v.gear, GEAR_IDS, '装备') }; }
    case 'learn': { const v = record(['pilot', 'skill']); return { type, pilot: pilot(v.pilot), skill: choice(v.skill, SKILLS, '技能') }; }
    case 'choice': { const v = record(['scene', 'choice']); return { type, scene: text(v.scene, '插叙', 24), choice: text(v.choice, '决定', 24) }; }
    case 'goal': { const v = record(['goal']); return { type, goal: choice(v.goal, GOALS, '协同目标') }; }
    case 'deploy': { const v = record(['mission', 'route']); return { type, mission: choice(v.mission, MISSION_IDS, '任务'), route: choice(v.route, ['main', 'ridge'], '进场路线') }; }
    case 'player': { const v = record(['option']); return { type, option: text(v.option, '行动', 40) }; }
    case 'agent': { const v = record(['plan']); return { type, plan: parsePlan(v.plan) }; }
    case 'recover': { const v = record(['payment']); return { type, payment: choice(v.payment, ['scrap', 'debt'], '救援支付') }; }
    case 'ending': { const v = record(['ending']); return { type, ending: choice(v.ending, ENDING_IDS, '终局') }; }
    case 'fabricate': case 'resolve': case 'debrief': case 'retreat': record([]); return { type };
    default: throw new AgentValidationError('未知战记指令。');
  }
}
export const definition = { id: 'iron-choir', create, reduce, parseCommand };
