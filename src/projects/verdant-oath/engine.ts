import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import { createInventory, exchangeInventory } from '../../core/rpg/inventory';
import { gainExperience, progression } from '../../core/rpg/progression';
import {
  CHARMS, CHOICES, CHOICE_DATA, COMPANIONS, CURVE, ELEMENTS, ENDINGS, HELP_MOVES, ITEMS, LIMITS,
  LOCATIONS, MAX_FOCUS, MAX_STRAIN, OPTIONS, PLACES, RECIPES, SIDE_DATA, SIDE_QUESTS, SKILLS, SPIRITS,
  STANCES, WILD_MOVES,
} from './data';
import type { Command, CompanionId, Ending, Layout, LocationId, Plan, QuestId, State } from './data';
import { ENDING_STORY, QUEST_STORY } from './story';

export const distance = (a: number, b: number) => Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
function chinese(value: unknown): string {
  const result = text(value, '公开意图', 100);
  requireRule(/\p{Script=Han}/u.test(result) && !/[<>]|https?:|www\./i.test(result), '意图须为简短中文，不含标记或网址。');
  return result;
}
export function parsePlan(value: unknown): Plan {
  const p = object(value, ['wild', 'intention', 'companions'], '灵的应答');
  return {
    wild: choice(p.wild, WILD_MOVES, '野灵动作'), intention: chinese(p.intention),
    companions: array(p.companions, entry => {
      const c = object(entry, ['id', 'move', 'intention'], '伙伴应答');
      return { id: choice(c.id, COMPANIONS, '伙伴'), move: choice(c.move, HELP_MOVES, '伙伴动作'), intention: chinese(c.intention) };
    }, '伙伴应答', 0, 3),
  };
}
export function parseLayout(value: unknown): Layout {
  const p = object(value, ['runes', 'formation', 'stance'], '阵式');
  return {
    runes: array(p.runes, entry => {
      const r = object(entry, ['cell', 'element'], '阵字');
      return { cell: integer(r.cell, '阵格', 0, 24), element: choice(r.element, ELEMENTS, '元素') };
    }, '阵句', 5, 11),
    formation: array(p.formation, entry => {
      const r = object(entry, ['id', 'cell'], '站位');
      return { id: choice(r.id, COMPANIONS, '伙伴'), cell: integer(r.cell, '站位', 0, 24) };
    }, '阵位', 0, 3),
    stance: choice(p.stance, STANCES, '仪态'),
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '行动须有明确类别。');
  const type = choice(value.type, ['travel', 'gather', 'rest', 'begin', 'retreat', 'layout', 'agent', 'craft', 'equip', 'learn', 'recruit', 'train', 'evolve', 'quest', 'choose', 'finish'] as const, '行动');
  switch (type) {
    case 'travel': { const c = object(value, ['type', 'location']); return { type, location: choice(c.location, LOCATIONS, '地点') }; }
    case 'layout': { const c = object(value, ['type', 'layout']); return { type, layout: parseLayout(c.layout) }; }
    case 'agent': { const c = object(value, ['type', 'plan']); return { type, plan: parsePlan(c.plan) }; }
    case 'craft': case 'equip': { const c = object(value, ['type', 'charm']); return { type, charm: choice(c.charm, CHARMS, '符饰') }; }
    case 'learn': { const c = object(value, ['type', 'skill']); return { type, skill: choice(c.skill, SKILLS, '成长技') }; }
    case 'recruit': case 'train': case 'evolve': { const c = object(value, ['type', 'id']); return { type, id: choice(c.id, COMPANIONS, '伙伴') }; }
    case 'quest': { const c = object(value, ['type', 'id']); return { type, id: choice(c.id, SIDE_QUESTS, '支线') }; }
    case 'choose': { const c = object(value, ['type', 'id', 'option']); return { type, id: choice(c.id, CHOICES, '抉择'), option: choice(c.option, OPTIONS, '承诺') }; }
    case 'finish': { const c = object(value, ['type', 'ending']); return { type, ending: choice(c.ending, ENDINGS, '去处') }; }
    default: object(value, ['type']); return { type };
  }
}
export function create(seed: number): State {
  integer(seed, '旅程种子', 0, 0xffffffff);
  return {
    seed, location: 'village', phase: 'travel', completed: [], gathered: [], quests: [], choices: {},
    inventory: createInventory(ITEMS, [], LIMITS), crafted: [], equipped: null,
    xp: 0, skillPoints: 0, skills: [], party: [], focus: MAX_FOCUS, strain: 0, harmony: 0, turns: 0,
    layout: { runes: [], formation: [], stance: 'echo' }, ending: null,
    log: ['师岚缝：先拾取村里的落物，再去倾耳苔林。契环是约定，不是锁。'],
  };
}
function note(s: State, message: string) { s.log = [...s.log, message].slice(-16); }
function reward(s: State, quest: QuestId, xp: number) {
  requireRule(!s.quests.includes(quest), '这项约定已经结算，不能重复领赏。');
  s.quests.push(quest);
  const earned = gainExperience(s.xp, xp, CURVE);
  s.xp = earned.xp;
  s.skillPoints += earned.earnedLevels;
  note(s, `${QUEST_STORY[quest].title}已履行，获得${xp}历练。${QUEST_STORY[quest].after}`);
}
function exchange(s: State, spend: { item: typeof ITEMS[number]; amount: number }[] = [], gain: { item: typeof ITEMS[number]; amount: number }[] = []) {
  for (const cost of spend) requireRule(s.inventory[cost.item] >= cost.amount, '行囊物资不足；回访尚未采集的地景，或改用不需供露的仪态。');
  s.inventory = exchangeInventory(s.inventory, { spend, gain }, LIMITS);
}
export function travelReason(s: State, location: LocationId): string | null {
  if (s.phase !== 'travel') return '先撤阵，才可旅行。';
  if (location === s.location) return '已在此处。';
  const index = LOCATIONS.indexOf(location);
  if (index <= 1) return null;
  const previous = LOCATIONS[index - 1];
  if (previous !== 'village' && !s.completed.includes(previous)) return `先完成${PLACES[previous].name}的仪式。`;
  if (index >= 2 && !s.choices.ledger) return '先回村决定如何面对旧账。';
  if (index >= 4 && !s.choices.roots) return '先在石庭决定锁根去留。';
  if (index >= 4 && !s.skills.includes('path') && !s.party.some(p => p.id === 'bud' && p.bond >= 2)) return '需要羁绊二的棉芽，或成长技踏枝。';
  if (index === 7 && !s.choices.winter) return '先在冬湾承诺如何交还暖季。';
  return null;
}
export function inspectLayout(s: State, layout: Layout = s.layout) {
  const p = PLACES[s.location];
  const runes = layout.runes;
  requireRule(s.phase === 'ritual', '只有仪式中可布阵。');
  requireRule(runes.length >= 5 && runes.length <= 11, '阵句须有五至十一格。');
  requireRule(new Set(runes.map(r => r.cell)).size === runes.length, '阵句不可重复踏格。');
  requireRule(runes[0].cell === p.source && runes.at(-1)?.cell === p.target, '阵句须从起点连到终点。');
  requireRule(runes[0].element === 'wood' && runes.at(-1)?.element === 'water', '木字起句，水字收尾。');
  requireRule(runes.some(r => r.element === 'ember'), '句中至少需要一枚火字。');
  for (let i = 0; i < runes.length; i++) {
    const r = runes[i], previous = runes[i - 1];
    requireRule(!p.walls.includes(r.cell), '残墙与虚空不可落字。');
    if (previous) {
      requireRule(distance(previous.cell, r.cell) === 1, '阵格必须上下左右相连。');
      requireRule(!((previous.element === 'ember' && r.element === 'water') || (previous.element === 'water' && r.element === 'ember')), '火水之间必须有木承接。');
    }
  }
  requireRule(new Set(layout.formation.map(f => f.id)).size === layout.formation.length &&
    new Set(layout.formation.map(f => f.cell)).size === layout.formation.length, '每位伙伴各占一格，不能重叠。');
  for (const f of layout.formation) {
    requireRule(s.party.some(c => c.id === f.id), '尚未结契的伙伴不可入阵。');
    requireRule(!p.walls.includes(f.cell), '伙伴不能站在残墙或虚空上。');
  }
  requireRule(layout.stance !== 'guard' || s.skills.includes('shelter'), '先学习共伞，才能使用护阵仪态。');
  let terrain = 0;
  for (const r of runes) {
    if (p.marsh.includes(r.cell) && r.element !== 'water' && s.equipped !== 'rain-charm') terrain++;
    if (p.thorns.includes(r.cell) && r.element !== 'wood' && s.equipped !== 'root-charm' && !s.skills.includes('path')) terrain++;
  }
  return { cost: 1 + Math.min(4, terrain), dew: layout.stance === 'offer' ? 2 : 0 };
}
export function legalHelp(s: State, id: CompanionId): typeof HELP_MOVES[number][] {
  const spirit = s.party.find(c => c.id === id);
  requireRule(spirit, '未知同行者。');
  const f = s.layout.formation.find(c => c.id === id);
  const reach = spirit.evolved ? 2 : 1;
  const close = f ? s.layout.runes.filter(r => distance(r.cell, f.cell) <= reach) : [];
  const result: typeof HELP_MOVES[number][] = ['观望'];
  if (close.length) result.push('护持');
  if (close.some(r => r.element === SPIRITS[id].element)) result.push('接引');
  const afraid = id === 'coal' && !spirit.evolved && f && s.layout.runes.some(r => r.cell === f.cell && r.element === 'water');
  if (spirit.bond < 2 || afraid) result.push('抗拒');
  return result;
}
export function endingReason(s: State, ending: Ending): string | null {
  if (!s.completed.includes('crown')) return '须先解开冠顶的四候之结。';
  if (ending === 'anchor') return progression(s.xp, CURVE).level >= 3 && s.equipped ? null : '须至少三级，并佩戴亲手制作的符饰。';
  if (ending === 'roam') return s.choices.winter === 'follow' && s.party.filter(p => p.bond >= 2).length >= 2 ? null : '须选择随灵迁徙，且至少两位伙伴羁绊二。';
  return s.choices.ledger === 'truth' && s.choices.roots === 'release' && s.choices.winter === 'cede' &&
    ['sleeve', 'ferry', 'witness'].every(q => s.quests.some(id => id === q)) &&
    s.party.length === 3 && s.party.filter(p => p.evolved).length >= 2 ? null :
    '须公开旧账、拆锁、让暖季；完成空袖、空船、无字证人；三灵同行且至少两灵蜕变。';
}
export function objective(s: State): string {
  if (s.phase === 'lost') return '契环已断。本次旅程结束，可从新旅程重新启程。';
  if (s.phase === 'ending') return ENDING_STORY[s.ending!].title;
  if (s.phase === 'ritual') return `向${PLACES[s.location].wild}写句：共鸣${s.harmony}/${PLACES[s.location].need}，裂隙${s.strain}/${MAX_STRAIN}。`;
  if (s.completed.includes('crown')) return '打开约簿，选择已经挣得的去处；仍可回访履行支线。';
  for (const id of CHOICES) if (!s.choices[id] && s.completed.includes(CHOICE_DATA[id].requires)) return `回${PLACES[CHOICE_DATA[id].location].name}，在约簿决定：${CHOICE_DATA[id].name}。`;
  const next = LOCATIONS.find(id => id !== 'village' && !s.completed.includes(id));
  if (next === 'canopy' && !s.skills.includes('path') && !s.party.some(p => p.id === 'bud' && p.bond >= 2)) return '先结契并训练棉芽，或花成长点学习踏枝，再去悬叶驿。';
  return next ? `前往${PLACES[next].name}，履行「${QUEST_STORY[next as Exclude<LocationId, 'village'>].title}」。` : '听一听同行者的愿望。';
}
export function reduce(state: State, value: Command): State {
  const c = parseCommand(value);
  requireRule(state.phase !== 'lost' && state.phase !== 'ending', '旅程已结束；请重新启程。');
  const s = structuredClone(state);
  if (c.type === 'agent') {
    const costs = inspectLayout(s);
    requireRule(s.focus >= costs.cost, '息力不足，撤阵休息后再来，或改写地形字。');
    requireRule(c.plan.companions.length === s.party.length && new Set(c.plan.companions.map(p => p.id)).size === s.party.length &&
      c.plan.companions.every(p => s.party.some(sp => sp.id === p.id)), '每位同行者须恰好应答一次，不得遗漏或替换。');
    let harmony = 1 + (c.plan.wild === '靠近' ? 2 : c.plan.wild === '试探' ? 1 : 0);
    let strain = c.plan.wild === '筑障' ? 2 : c.plan.wild === '试探' ? 1 : 0;
    if (s.location === 'frost' || s.location === 'crown') strain++;
    if (s.location === 'ruins' && s.choices.ledger === 'truth') harmony++;
    if (s.skills.includes('listen')) harmony++;
    if (s.layout.stance === 'guard') strain--;
    if (s.equipped === 'ash-charm') strain--;
    if (s.layout.stance === 'offer') harmony += 2;
    for (const decision of c.plan.companions) {
      requireRule(legalHelp(s, decision.id).includes(decision.move), '伙伴的动作不符合站位、元素或羁绊条件。');
      const spirit = s.party.find(p => p.id === decision.id)!;
      if (decision.move === '接引') harmony += decision.id === 'coal' && spirit.bond >= 2 ? 2 : 1;
      if (decision.move === '护持') strain -= decision.id === 'tide' && spirit.bond >= 2 ? 2 : 1;
      if (decision.move === '抗拒') strain++;
      spirit.memory = [...spirit.memory, `${PLACES[s.location].name}：${decision.move}。${decision.intention}`].slice(-3);
    }
    exchange(s, costs.dew ? [{ item: 'dew', amount: costs.dew }] : []);
    s.focus -= costs.cost;
    s.harmony += harmony;
    s.strain = Math.max(0, s.strain + strain);
    s.turns++;
    note(s, `${PLACES[s.location].wild}：${c.plan.wild}。${c.plan.intention} 共鸣增加${harmony}，裂隙${s.strain}。`);
    if (s.strain >= MAX_STRAIN) {
      s.phase = 'lost';
      note(s, ENDING_STORY.lost.title);
    } else if (s.harmony >= PLACES[s.location].need) {
      requireRule(s.location !== 'village' && !s.completed.includes(s.location), '此地仪式不能重复完成。');
      s.completed.push(s.location);
      reward(s, s.location, 4);
      s.phase = 'travel';
    }
    return s;
  }
  if (c.type === 'layout') {
    inspectLayout(s, c.layout);
    s.layout = c.layout;
    return s;
  }
  if (c.type === 'retreat') {
    requireRule(s.phase === 'ritual', '目前不在阵中。');
    s.phase = 'travel'; s.harmony = 0; s.strain = 0;
    note(s, '撤下阵句，未消耗的物资仍在。可以休息再试，已履行的约定不变。');
    return s;
  }
  requireRule(s.phase === 'travel', '请先撤阵，再进行旅行、整备或履约。');
  switch (c.type) {
    case 'travel':
      requireRule(!travelReason(s, c.location), travelReason(s, c.location) ?? '道路尚未开放。');
      s.location = c.location;
      note(s, `抵达${PLACES[c.location].name}。${PLACES[c.location].season}正在路上。`);
      break;
    case 'gather':
      requireRule(!s.gathered.includes(s.location), '此处落物已拾取，不能重复采集。');
      exchange(s, [], [{ item: 'twig', amount: 3 }, { item: 'dew', amount: 3 }, { item: 'amber', amount: 2 }]);
      s.gathered.push(s.location);
      note(s, '只拾取已落下的枝、露与季珀：落枝三，露珠三，季珀二。');
      break;
    case 'rest':
      requireRule(s.focus < MAX_FOCUS || s.strain > 0, '已经休息充足，无需再停留。');
      s.focus = MAX_FOCUS; s.strain = 0;
      note(s, '在安全的叶檐下歇息，息力恢复。休息不会生成物资。');
      break;
    case 'begin':
      requireRule(s.location !== 'village' && !s.completed.includes(s.location), '此处没有尚待履行的主线仪式。');
      s.phase = 'ritual'; s.harmony = 0; s.strain = 0; s.turns = 0;
      s.layout = { runes: [], formation: [], stance: 'echo' };
      note(s, '阵地展开。先写连续的木火木水句，再落笔，请灵真实应答。');
      break;
    case 'craft':
      requireRule(!s.crafted.includes(c.charm), '这枚符饰已制作过；不可重复打造或刷取奖励。');
      exchange(s, RECIPES[c.charm], [{ item: c.charm, amount: 1 }]);
      s.crafted.push(c.charm);
      note(s, '符饰已制成，需在行囊选择佩戴。');
      break;
    case 'equip':
      requireRule(s.crafted.includes(c.charm) && s.inventory[c.charm] === 1, '只能佩戴亲手制成并持有的符饰。');
      requireRule(s.equipped !== c.charm, '已佩戴这枚符饰。');
      s.equipped = c.charm;
      break;
    case 'learn':
      requireRule(s.skillPoints > 0 && !s.skills.includes(c.skill), '需要未使用的成长点，且不能重复学习。');
      s.skillPoints--; s.skills.push(c.skill);
      break;
    case 'recruit':
      requireRule(s.location === SPIRITS[c.id].home && s.location !== 'village' && s.completed.includes(s.location), '完成故地仪式后，才能当面提出结契。');
      requireRule(!s.party.some(p => p.id === c.id), '已与这位伙伴结契。');
      exchange(s, [{ item: 'twig', amount: 1 }]);
      s.party.push({ id: c.id, bond: 1, trained: false, evolved: false, memory: ['我同意同行，但保留拒绝与离开的权利。'] });
      note(s, `${SPIRITS[c.id].name}接受空契环，成为同行者。`);
      break;
    case 'train': {
      const spirit = s.party.find(p => p.id === c.id);
      requireRule(spirit && !spirit.trained, '须先结契，且每位伙伴只进行一次基础训练。');
      requireRule(s.focus >= 2, '训练需要两息；可以先休息。');
      exchange(s, [{ item: 'twig', amount: 1 }]);
      s.focus -= 2; spirit.trained = true; spirit.bond = Math.min(4, spirit.bond + 1);
      spirit.memory = [...spirit.memory, '一起练习交接而非服从；我能说出自己的界限。'].slice(-3);
      note(s, `${SPIRITS[c.id].name}学会协作，羁绊加一。`);
      break;
    }
    case 'evolve': {
      const spirit = s.party.find(p => p.id === c.id);
      requireRule(spirit && !spirit.evolved && spirit.bond >= 3 && s.quests.includes(SPIRITS[c.id].quest), '蜕变需要羁绊三并完成该伙伴的专属约定，且只可一次。');
      exchange(s, [{ item: 'amber', amount: 1 }]);
      spirit.evolved = true;
      note(s, `${SPIRITS[c.id].name}蜕变为${SPIRITS[c.id].evolved}。阵线接引范围增至两格。`);
      break;
    }
    case 'quest': {
      const q = SIDE_DATA[c.id];
      requireRule(s.location === q.location && s.completed.includes(q.requires), '尚未在合适的时地满足这项约定。');
      requireRule(!s.quests.includes(c.id), '约定已履行，不能重复领赏。');
      if (q.companion) requireRule(s.party.some(p => p.id === q.companion && p.trained), '先结契并训练这位伙伴，再履行它的个人约定。');
      exchange(s, q.spend);
      if (q.companion) {
        const spirit = s.party.find(p => p.id === q.companion)!;
        spirit.bond = Math.min(4, spirit.bond + 1);
        spirit.memory = [...spirit.memory, QUEST_STORY[c.id].after].slice(-3);
      }
      reward(s, c.id, 2);
      break;
    }
    case 'choose': {
      const q = CHOICE_DATA[c.id];
      requireRule(s.location === q.location && s.completed.includes(q.requires), '须在当事人所在的地点、仪式完成后作出承诺。');
      requireRule(!s.choices[c.id] && q.options.includes(c.option), '承诺不可重复或改写，也不能替换成其他问题的答案。');
      s.choices[c.id] = c.option;
      if (c.option === 'release') for (const p of s.party) p.bond = Math.min(4, p.bond + 1);
      note(s, `${q.name}：${q.labels[q.options.indexOf(c.option)]}。${c.option === 'release' ? '同行者看见拒绝被尊重，羁绊各加一。' : '这份承诺将决定最终可选择的生活。'}`);
      break;
    }
    case 'finish':
      requireRule(!endingReason(s, c.ending), endingReason(s, c.ending) ?? '尚未挣得这一结局。');
      s.phase = 'ending'; s.ending = c.ending;
      note(s, ENDING_STORY[c.ending].title);
      break;
  }
  return s;
}
export const definition = { id: 'verdant-oath', create, reduce, parseCommand };
