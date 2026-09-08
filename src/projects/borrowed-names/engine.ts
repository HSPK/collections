import { requireRule } from '../../core/agents/errors';
import { choice, integer, object, text } from '../../core/agents/schema';
import { createInventory, exchangeInventory } from '../../core/rpg/inventory';
import type { Inventory } from '../../core/rpg/inventory';
import { gainExperience, progression } from '../../core/rpg/progression';
import type { GameDefinition } from '../../core/games/session';
import {
  ACTIONS, CLASS_IDS, CLASSES, CURVE, DISGUISES, DISGUISE_NAMES, ENDINGS, FACT_IDS, FACTS,
  GAME_ID, ITEM_IDS, ITEMS, METHODS, METHOD_NAMES, NPC_IDS, NPCS, QUEST_IDS, QUESTS,
  ROUTES, SCENE_IDS, SCENES, SKILL_IDS, SKILLS, TOPICS,
} from './data';
import type {
  AgentAction, ClassId, Disguise, Ending, FactId, Faction, ItemId, Method, NpcId, QuestId, SceneId, SkillId, Topic,
} from './data';
import { factText } from './story';

export interface Plan {
  encounter: number;
  action: AgentAction;
  fact: FactId | 'none';
  price: number;
  line: string;
}

export type Command =
  | { type: 'start'; role: ClassId }
  | { type: 'move'; to: SceneId; mode: 'walk' | 'sneak' | 'bribe' }
  | { type: 'agent'; npc: NpcId; topic: Topic; method: Method; plan: Plan }
  | { type: 'petition'; npc: NpcId; topic: 'lead' | 'hearing' }
  | { type: 'search'; fact: FactId; method: Method; mode: 'steady' | 'careful' | 'recover' }
  | { type: 'claim'; quest: QuestId }
  | { type: 'buy' | 'use' | 'equip'; item: ItemId }
  | { type: 'wear'; disguise: Disguise }
  | { type: 'learn'; skill: SkillId }
  | { type: 'aid' | 'pawn' | 'work' | 'rest' | 'shelter' }
  | { type: 'identity'; decision: 'protect' | 'expose' }
  | { type: 'file'; motive: 'mortgage' | 'rescue' | 'theater'; stamp: 'broken' | 'double'; timing: 'before' | 'after' }
  | { type: 'finish'; ending: Ending };

export interface Evidence {
  id: FactId;
  source: 'physical';
  witness: NpcId;
  leadSource: 'agent' | 'petition';
  imprint: number;
}

export interface State {
  seed: number;
  phase: 'choosing' | 'playing' | 'won' | 'lost';
  role: ClassId | null;
  act: number;
  location: SceneId;
  turn: number;
  silver: number;
  vigor: number;
  stress: number;
  noise: number;
  xp: number;
  skillPoints: number;
  skills: SkillId[];
  bag: Inventory<ItemId>;
  gear: ItemId | null;
  disguise: Disguise;
  worn: Disguise[];
  factions: Record<Faction, number>;
  trust: Record<NpcId, number>;
  allies: NpcId[];
  leads: Partial<Record<FactId, 'agent' | 'petition'>>;
  evidence: Evidence[];
  claimed: QuestId[];
  conversations: Record<string, number>;
  agentTurns: number;
  memory: { npc: NpcId; topic: Topic; action: AgentAction; line: string; turn: number }[];
  checks: Record<string, { score: number; dc: number; pass: boolean }>;
  visits: SceneId[];
  patrol: number;
  aided: boolean;
  identity: 'undecided' | 'protect' | 'expose';
  pawned: boolean;
  jobs: number;
  debts: number;
  filed: boolean;
  wrongTheories: string[];
  heard: boolean;
  ending: Ending | null;
  loss: string;
  log: string[];
}

const limits = { capacity: 16, stackLimit: 5 };
const disguiseItem: Partial<Record<Disguise, ItemId>> = { stage: 'stage-pass', clerk: 'clerk-pass', worker: 'worker-pass' };
const questFact: Partial<Record<QuestId, FactId>> = {
  letter: 'receipt', costume: 'pattern', books: 'ledger', patient: 'pulse', clock: 'bell', redseal: 'order',
};

export function parsePlan(value: unknown): Plan {
  const p = object(value, ['encounter', 'action', 'fact', 'price', 'line'], '角色行动');
  const line = text(p.line, '公开台词', 120, 8);
  requireRule(/[\u3400-\u9fff]/.test(line) && !/[a-zA-Z]/.test(line), '角色须用简短中文台词公开表达意图。');
  return {
    encounter: integer(p.encounter, '交涉编号', 0, 40),
    action: choice(p.action, ACTIONS, '角色意图'),
    fact: choice(p.fact, ['none', ...FACT_IDS] as const, '线索'),
    price: integer(p.price, '银钱要求', 0, 4), line,
  };
}

export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '行动缺少类型。');
  const type = choice(value.type, ['start', 'move', 'agent', 'petition', 'search', 'claim', 'buy', 'use', 'equip', 'wear', 'learn', 'aid', 'pawn', 'work', 'rest', 'shelter', 'identity', 'file', 'finish'] as const, '行动');
  switch (type) {
    case 'start': { const p = object(value, ['type', 'role']); return { type, role: choice(p.role, CLASS_IDS, '职业') }; }
    case 'move': { const p = object(value, ['type', 'to', 'mode']); return { type, to: choice(p.to, SCENE_IDS, '目的地'), mode: choice(p.mode, ['walk', 'sneak', 'bribe'] as const, '路线方式') }; }
    case 'agent': {
      const p = object(value, ['type', 'npc', 'topic', 'method', 'plan']);
      return { type, npc: choice(p.npc, NPC_IDS, '人物'), topic: choice(p.topic, TOPICS, '话题'), method: choice(p.method, METHODS, '交涉方式'), plan: parsePlan(p.plan) };
    }
    case 'petition': {
      const p = object(value, ['type', 'npc', 'topic']);
      return { type, npc: choice(p.npc, NPC_IDS, '人物'), topic: choice(p.topic, ['lead', 'hearing'] as const, '申请') };
    }
    case 'search': {
      const p = object(value, ['type', 'fact', 'method', 'mode']);
      return { type, fact: choice(p.fact, FACT_IDS, '证据'), method: choice(p.method, METHODS, '勘验方式'), mode: choice(p.mode, ['steady', 'careful', 'recover'] as const, '勘验方案') };
    }
    case 'claim': { const p = object(value, ['type', 'quest']); return { type, quest: choice(p.quest, QUEST_IDS, '任务') }; }
    case 'buy': case 'use': case 'equip': {
      const p = object(value, ['type', 'item']); return { type, item: choice(p.item, ITEM_IDS, '物品') };
    }
    case 'wear': { const p = object(value, ['type', 'disguise']); return { type, disguise: choice(p.disguise, DISGUISES, '身份服饰') }; }
    case 'learn': { const p = object(value, ['type', 'skill']); return { type, skill: choice(p.skill, SKILL_IDS, '技能') }; }
    case 'identity': { const p = object(value, ['type', 'decision']); return { type, decision: choice(p.decision, ['protect', 'expose'] as const, '名单决定') }; }
    case 'file': {
      const p = object(value, ['type', 'motive', 'stamp', 'timing']);
      return { type, motive: choice(p.motive, ['mortgage', 'rescue', 'theater'] as const, '案由'), stamp: choice(p.stamp, ['broken', 'double'] as const, '原印'), timing: choice(p.timing, ['before', 'after'] as const, '时序') };
    }
    case 'finish': { const p = object(value, ['type', 'ending']); return { type, ending: choice(p.ending, ENDINGS, '结局') }; }
    default: object(value, ['type']); return { type };
  }
}

export function create(seed: number): State {
  integer(seed, '世界种子', 0, 0xffffffff);
  return {
    seed, phase: 'choosing', role: null, act: 1, location: 'ferry', turn: 0,
    silver: 20, vigor: 24, stress: 0, noise: 0, xp: 0, skillPoints: 1, skills: [],
    bag: createInventory(ITEM_IDS, [{ item: 'tonic', amount: 2 }, { item: 'tea', amount: 1 }], limits),
    gear: null, disguise: 'own', worn: ['own'], factions: { civic: 0, stage: 0, tide: 0 },
    trust: { lan: 0, mei: 0, he: 0, qiao: 0, lu: 0, yan: 0 }, allies: [], leads: {}, evidence: [], claimed: [],
    conversations: {}, agentTurns: 0, memory: [], checks: {}, visits: ['ferry'], patrol: 0,
    aided: false, identity: 'undecided', pawned: false, jobs: 0, debts: 0, filed: false, wrongTheories: [],
    heard: false, ending: null, loss: '', log: ['渡口的灯亮了。先选择职业；只有主动交涉才会请求模型。'],
  };
}

export function level(s: State) { return progression(s.xp, CURVE); }
export function hasFact(s: State, id: FactId) { return s.evidence.some(e => e.id === id); }
export function die(seed: number, key: string): number {
  let h = (seed ^ 2166136261) >>> 0;
  for (const char of key) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % 6 + 1;
}
export function ability(s: State, method: Method): number {
  if (!s.role) return 0;
  return CLASSES[s.role].stats[method] + s.skills.filter(id => SKILLS[id].method === method).length * 2 +
    (s.gear && ITEMS[s.gear].method === method ? 2 : 0) + Math.floor((level(s).level - 1) / 2);
}
function check(s: State, key: string, method: Method, dc: number, bonus = 0) {
  const score = ability(s, method) + die(s.seed, key) + bonus;
  return { score, dc, pass: score >= dc };
}
function note(s: State, line: string) { s.log.push(line); }
function cost(s: State, silver: number, vigor = 0) {
  requireRule(s.silver >= silver, `银钱不足，需要${silver}银。可领已完成委托，或回折伞巷搬货、抵名。`);
  requireRule(s.vigor >= vigor, `精力不足，需要${vigor}点。先服药或休整。`);
  s.silver -= silver; s.vigor -= vigor;
}
function reputation(s: State, faction: Faction, amount: number) {
  s.factions[faction] = Math.max(-4, Math.min(6, s.factions[faction] + amount));
}
function trust(s: State, npc: NpcId, amount: number) {
  s.trust[npc] = Math.max(-3, Math.min(4, s.trust[npc] + amount));
}
function reward(s: State, id: QuestId) {
  requireRule(!s.claimed.includes(id), '这份委托已经结算，不能重复领取。');
  const q = QUESTS[id];
  const next = gainExperience(s.xp, q.xp, CURVE);
  s.xp = next.xp; s.skillPoints += next.earnedLevels; s.silver += q.silver; s.claimed.push(id);
  const fact = questFact[id];
  if (fact) reputation(s, NPCS[NPC_IDS.find(n => NPCS[n].fact === fact)!].faction, 1);
  if (id === 'costume' && s.bag['stage-pass'] === 0) s.bag = exchangeInventory<ItemId>(s.bag, { gain: [{ item: 'stage-pass', amount: 1 }] }, limits);
  note(s, `委托「${q.name}」结算：阅历＋${q.xp}，银钱＋${q.silver}${next.earnedLevels ? '；升级，可选择新技能' : ''}。`);
}

export function questReady(s: State, id: QuestId): boolean {
  if (s.claimed.includes(id) || s.phase !== 'playing') return false;
  const fact = questFact[id];
  if (fact) return hasFact(s, fact);
  switch (id) {
    case 'aid': return s.aided;
    case 'wardrobe': return s.worn.includes('clerk') || s.worn.includes('worker');
    case 'pact': return s.allies.length > 0;
    case 'shelter': return s.identity !== 'undecided';
    case 'case': return s.filed;
    default: return false;
  }
}

export function routeTo(s: State, to: SceneId) {
  return ROUTES.find(r => (r.a === s.location && r.b === to) || (r.b === s.location && r.a === to));
}
export function routeGate(s: State, to: SceneId): string {
  const route = routeTo(s, to);
  if (!route) return '两地没有直接相连的实体道路。';
  if (route.gate === 'court' && s.act < 3) return '第三幕提交案卷后，公庭踏道才会展开。';
  if (['clerk', 'worker', 'roof', 'tower'].includes(route.gate) && s.act < 2) return '先领取渡口与戏楼主线报酬，开启第二幕。';
  if (route.gate === 'tower' && (!hasFact(s, 'ledger') || !hasFact(s, 'bell'))) return '需先核验街产账与潮钟，才能确认通往雨钟塔的道路。';
  return '';
}
export function walkAllowed(s: State, to: SceneId): boolean {
  const route = routeTo(s, to);
  if (!route || routeGate(s, to)) return false;
  if (route.gate === 'roof') return false;
  // Once inside, leaving a controlled district never requires buying a new identity.
  if (s.location === 'registry' && to === 'alley' || s.location === 'pump' && to === 'clinic' ||
      s.location === 'tower' && ['registry', 'pump'].includes(to)) return true;
  switch (route.gate) {
    case 'clerk': return s.disguise === 'clerk' || s.factions.civic >= 2;
    case 'worker': return s.disguise === 'worker' || s.factions.tide >= 2;
    case 'tower': return s.disguise === 'clerk' || s.factions.civic >= 2;
    default: return true;
  }
}
export function routeKey(s: State, to: SceneId) { return `route:${[s.location, to].sort().join(':')}`; }

export function encounterGate(s: State, npc: NpcId, topic: Topic): string {
  if (s.phase !== 'playing') return '请先选择职业，或重新开始已结束的调查。';
  if (SCENES[s.location].npc !== npc) return '这位角色不在当前场景。';
  if (npc === 'mei' && !hasFact(s, 'receipt')) return '先在渡口核验抵押收据，裴绡才知道你说的是哪只戏袖。';
  if (!['lan', 'mei'].includes(npc) && s.act < 2) return '先领取渡口与戏楼主线报酬，开启第二幕的调查。';
  if (s.location === 'court' && topic !== 'hearing') return '公庭只处理终审交涉；案情与担保请在雨钟塔谈。';
  if (topic === 'hearing' && (npc !== 'yan' || s.location !== 'court' || s.act !== 3 || !s.claimed.includes('case'))) return '需在第三幕领取案卷报酬，抵达公庭后进行终审交涉。';
  if (topic === 'lead' && s.leads[NPCS[npc].fact]) return '此案情的线索已经取得，不能重复索取。';
  if (topic === 'hearing' && s.heard) return '终审陈述已经获准。';
  if (topic === 'pact') {
    if (!hasFact(s, NPCS[npc].fact)) return '先取得这位角色所指向的实物证据，再谈共同担保。';
    if (s.allies.includes(npc)) return '已建立担保，不能重复获益。';
    if (s.identity === 'expose' && ['mei', 'qiao', 'lu'].includes(npc)) return '公开病人名单破坏了这位角色的底线，无法再求担保。';
    if (s.trust[npc] < 1 && s.factions[NPCS[npc].faction] < 1) return '担保需信任或该阵营声望至少１；先完成并领取相关委托。';
  }
  if ((s.conversations[`${npc}:${topic}`] ?? 0) >= 2) return '同一话题最多交涉两次。案情可付费调档；担保必须由另一位愿意合作的人给出。';
  if (s.vigor < (topic === 'hearing' ? 2 : 1)) return '精力不足，先休整或服药再交涉。';
  return '';
}
export function legalActions(s: State, npc: NpcId, topic: Topic): AgentAction[] {
  const result: AgentAction[] = topic === 'pact' ? ['ally', 'withhold'] : ['testify', 'withhold'];
  if (s.silver > 0) result.push('bargain');
  if (NPCS[npc].faction === 'civic') result.push('patrol');
  return result;
}

export function endingGate(s: State, ending: Ending): string {
  if (s.act !== 3 || s.location !== 'court' || !s.filed || !s.heard || !s.claimed.includes('case')) return '先完成六证案卷、领取报酬，并在公庭进行真实终审交涉。';
  switch (ending) {
    case 'commons':
      return s.identity !== 'protect' ? '需要保护病人的化名。' :
        !s.claimed.includes('aid') ? '需要亲手送药并结算诊所委托。' :
          s.factions.tide < 2 ? '需要互助会声望至少２。' :
            !s.allies.some(n => ['mei', 'qiao', 'lu'].includes(n)) ? '需要裴绡、乔砚或陆芦的真实担保。' : '';
    case 'charter':
      return s.identity !== 'expose' ? '需要公开病人名单以建立署方新约。' :
        s.pawned || s.debts > 0 ? '需要未抵押的本名，且不能欠避雨棚救济债。' :
          s.factions.civic < 2 ? '需要量名署声望至少２。' :
            !s.allies.some(n => ['he', 'yan'].includes(n)) ? '需要贺迟或晏珩的真实担保。' : '';
    case 'bridge':
      return s.identity !== 'protect' ? '需要保护病人化名，不能再让名单替你担责。' :
        !s.pawned ? '需先在折伞巷抵押自己的本名，才有资格将这笔债永久转作桥契。' : '';
  }
}

export function reduce(previous: State, raw: Command): State {
  const c = parseCommand(raw);
  requireRule(previous.phase === 'playing' || c.type === 'start' && previous.phase === 'choosing', '这轮调查已经结束，或尚未选择职业。');
  requireRule(previous.turn < 240, '夜已尽，请重新开始。');
  const s = structuredClone(previous);
  switch (c.type) {
    case 'start': {
      requireRule(s.phase === 'choosing' && s.role === null, '职业只能在新调查时选择一次。');
      s.role = c.role; s.phase = 'playing'; s.gear = CLASSES[c.role].gear;
      s.bag = exchangeInventory(s.bag, { gain: [{ item: s.gear, amount: 1 }] }, limits);
      note(s, `你以${CLASSES[c.role].name}的身份走入雨里。雨中能力各不相同；先与阮灯交涉。`);
      break;
    }
    case 'move': {
      const route = routeTo(s, c.to);
      requireRule(route, '这里没有直达目的地的实体道路。');
      requireRule(!routeGate(s, c.to), routeGate(s, c.to));
      const key = routeKey(s, c.to);
      if (c.mode === 'walk') {
        requireRule(walkAllowed(s, c.to), '正门需要对应身份服饰或阵营声望；也可考虑潜入。');
        cost(s, 0, 1);
      } else if (c.mode === 'sneak') {
        requireRule(!s.checks[key], '这条潜入线已留下记录，不能反复掷骰。失手后可付费遮灯，或换一条实际道路。');
        cost(s, 0, 2);
        const result = check(s, key, 'shadow', route.dc + s.patrol + (s.noise >= 5 ? 1 : 0));
        s.checks[key] = result;
        if (!result.pass) {
          s.noise += 3; s.stress += 2;
          note(s, `潜入${route.name}失手（${result.score}／${result.dc}），仍在原地。警戒＋３，压力＋２；可花３银雇人遮灯。`);
          break;
        }
        s.noise = Math.max(0, s.noise - (s.skills.includes('softstep') ? 2 : 1));
        note(s, `潜入${route.name}成功（${result.score}／${result.dc}）。固定检定已记档。`);
      } else {
        requireRule(s.checks[key] && !s.checks[key].pass, '只有潜入失手留下的路线，才能雇人遮灯恢复通行。');
        cost(s, 3, 2); s.stress++;
        s.checks[key].pass = true;
        note(s, '付出３银与１压力，船工暂时遮住巡灯。这不是一次重新掷骰。');
      }
      s.location = c.to;
      if (!s.visits.includes(c.to)) s.visits.push(c.to);
      note(s, `沿${route.name}抵达${SCENES[c.to].name}。`);
      break;
    }
    case 'agent': {
      const gate = encounterGate(s, c.npc, c.topic);
      requireRule(!gate, gate);
      const p = c.plan, npc = NPCS[c.npc], key = `${c.npc}:${c.topic}`;
      requireRule(p.encounter === s.agentTurns, '这份角色行动已经过期，不能重复或套用到新局。');
      requireRule(legalActions(s, c.npc, c.topic).includes(p.action), '此角色在当前话题不能采取这种行动。');
      requireRule(p.price === 0 && p.action !== 'bargain' || p.action === 'bargain' && p.price >= 1 && p.price <= Math.min(4, s.silver), '只有议价可以要求１至４银，且不得超过玩家现有银钱。');
      const gives = p.action === 'testify' || p.action === 'bargain';
      requireRule(p.fact === (c.topic === 'lead' && gives ? npc.fact : 'none'), '角色只能指出自己确知的线索；不能制造证据或替别人作证。');
      const result = check(s, `social:${key}`, c.method, 7 + Math.max(0, -s.factions[npc.faction]),
        s.disguise === 'stage' && npc.faction === 'stage' ? 1 : 0);
      const discount = result.pass ? (s.skills.includes('double') ? 2 : 1) : 0;
      const paid = p.action === 'bargain' ? Math.max(1, p.price - discount) : 0;
      cost(s, paid, c.topic === 'hearing' ? 2 : 1);
      s.conversations[key] = (s.conversations[key] ?? 0) + 1; s.agentTurns++;
      s.checks[`social:${key}`] = result;
      if (!result.pass && !s.skills.includes('poise')) s.stress++;
      if (s.skills.includes('mercy')) s.stress = Math.max(0, s.stress - 1);
      if (p.action === 'withhold' || p.action === 'patrol') {
        trust(s, c.npc, -1); s.noise += p.action === 'patrol' ? 2 : 1;
        if (p.action === 'patrol') s.patrol = Math.min(3, s.patrol + 1);
      } else {
        trust(s, c.npc, result.pass ? 2 : 1);
        if (c.topic === 'lead') s.leads[npc.fact] = 'agent';
        if (c.topic === 'hearing') s.heard = true;
        if (c.topic === 'pact') { s.allies.push(c.npc); reputation(s, npc.faction, 1); }
      }
      s.memory.push({ npc: c.npc, topic: c.topic, action: p.action, line: p.line, turn: s.turn + 1 });
      note(s, `${npc.name}：「${p.line}」交涉${result.pass ? '稳住' : '失手'}（${result.score}／${result.dc}）${paid ? `，支付${paid}银` : ''}。${p.action === 'withhold' || p.action === 'patrol' ? '未获许可；案情可付费调档，担保不能强买。' : c.topic === 'lead' ? '取得的是线索，仍需亲手勘验实物。' : c.topic === 'pact' ? '共同担保已记入公开关系。' : '终审陈述获准。'}`);
      break;
    }
    case 'petition': {
      requireRule(SCENES[s.location].npc === c.npc, '须在角色所在场景申请调档。');
      requireRule((s.conversations[`${c.npc}:${c.topic}`] ?? 0) >= 1, '必须先进行一次实际成功提交的角色交涉；网络错误和取消不构成申请资格。');
      if (c.topic === 'lead') {
        requireRule(s.location !== 'court' && !s.leads[NPCS[c.npc].fact], '此线索已经取得，或不属于公庭。');
        cost(s, 5, 1); s.leads[NPCS[c.npc].fact] = 'petition';
        note(s, '支付５银调取登记副本，压力＋２，阵营声望－１。获得物证位置，不获得证据本身。');
      } else {
        requireRule(s.location === 'court' && s.act === 3 && s.claimed.includes('case') && !s.heard, '当前不能申请强制陈述。');
        cost(s, 6, 2); s.heard = true;
        note(s, '支付６银行使一次强制陈述权，压力＋２，署方声望－１。公庭必须接收你的案卷，但没有人自动与你结盟。');
      }
      s.stress += 2; reputation(s, NPCS[c.npc].faction, -1);
      break;
    }
    case 'search': {
      requireRule(SCENES[s.location].fact === c.fact, '这件实物不在当前位置。');
      requireRule(s.leads[c.fact], '先主动与当地角色交涉取得来源线索。不能凭模型台词直接认定真相。');
      requireRule(!hasFact(s, c.fact), '实物已经核验，不能重复取证或刷取奖励。');
      const key = `search:${c.fact}`;
      if (c.mode === 'recover') {
        requireRule(s.checks[key] && !s.checks[key].pass, '只有勘验失手后才能付费复勘。');
        cost(s, 4, 2);
        s.checks[key].pass = true;
        note(s, '支付４银，请修复匠协作复勘。固定结果不重掷，保管来源不变。');
      } else {
        requireRule(!s.checks[key], '这件证据的初勘已经记档；不能换一种方法刷检定。请付费复勘。');
        cost(s, c.mode === 'careful' ? 3 : 0, 2);
        const result = check(s, key, c.method, FACTS[c.fact].dc, (c.mode === 'careful' ? 4 : 0) + (c.method === FACTS[c.fact].method ? 1 : 0));
        s.checks[key] = result;
        if (!result.pass) {
          s.stress += 2;
          note(s, `勘验${FACTS[c.fact].name}失手（${result.score}／${result.dc}），压力＋２。未取得证据，可付费复勘。`);
          break;
        }
        note(s, `实物核验成功（${result.score}／${result.dc}），不是仅凭角色口供。`);
      }
      const witness = NPC_IDS.find(n => NPCS[n].fact === c.fact)!;
      s.evidence.push({ id: c.fact, source: 'physical', witness, leadSource: s.leads[c.fact]!, imprint: die(s.seed, `imprint:${c.fact}`) });
      note(s, factText(c.fact, s.seed));
      break;
    }
    case 'claim':
      requireRule(questReady(s, c.quest), '该委托尚未完成，或已经领取报酬。');
      reward(s, c.quest);
      if (s.act === 1 && s.claimed.includes('letter') && s.claimed.includes('costume')) {
        s.act = 2; note(s, '第二幕开启：署前石阶、工道与屋脊路线可用。装备身份服饰，或准备潜入。');
      }
      break;
    case 'buy':
      requireRule(s.location === 'alley', '物品只在折伞巷出售。');
      requireRule(ITEMS[c.item].type === 'consumable' || s.bag[c.item] === 0, '装备与身份服饰是唯一物品，不能重复购买。');
      cost(s, ITEMS[c.item].price);
      s.bag = exchangeInventory(s.bag, { gain: [{ item: c.item, amount: 1 }] }, limits);
      note(s, `购入${ITEMS[c.item].name}，支付${ITEMS[c.item].price}银。`);
      break;
    case 'use':
      requireRule(c.item === 'tonic' || c.item === 'tea', '只有药和茶可以消耗使用。');
      requireRule(c.item === 'tonic' ? s.vigor < 24 || s.stress > 0 : s.stress > 0 || s.noise > 0, '当前无需使用，保留物资。');
      s.bag = exchangeInventory<ItemId>(s.bag, { spend: [{ item: c.item, amount: 1 }] }, limits);
      if (c.item === 'tonic') { s.vigor = Math.min(24, s.vigor + 6); s.stress = Math.max(0, s.stress - 2); }
      else { s.stress = Math.max(0, s.stress - 3); s.noise = Math.max(0, s.noise - 1); }
      note(s, `使用${ITEMS[c.item].name}。`); break;
    case 'equip':
      requireRule(ITEMS[c.item].type === 'gear' && s.bag[c.item] > 0 && s.gear !== c.item, '只能装备已持有且尚未装备的工具。');
      s.gear = c.item; note(s, `装备${ITEMS[c.item].name}，仅一个工具位生效。`); break;
    case 'wear': {
      const item = disguiseItem[c.disguise];
      requireRule(c.disguise !== s.disguise && (!item || s.bag[item] > 0), '必须持有这套服饰，且不能重复穿当前衣服。');
      s.disguise = c.disguise;
      if (!s.worn.includes(c.disguise)) s.worn.push(c.disguise);
      note(s, `换上${DISGUISE_NAMES[c.disguise]}。法律通行权改变，本名抵押状态不变。`); break;
    }
    case 'learn':
      requireRule(s.skillPoints > 0 && !s.skills.includes(c.skill), '技能点不足，或已掌握该技能。');
      s.skillPoints--; s.skills.push(c.skill); note(s, `习得${SKILLS[c.skill].name}：${SKILLS[c.skill].detail}`); break;
    case 'aid':
      requireRule(s.location === 'clinic' && !s.aided, '送药只在诊所进行一次。');
      s.bag = exchangeInventory<ItemId>(s.bag, { spend: [{ item: 'tonic', amount: 1 }] }, limits);
      s.aided = true; reputation(s, 'tide', 2); trust(s, 'qiao', 1);
      note(s, '留下一份温盐药。互助会声望＋２，乔砚信任＋１；可领取送药委托。'); break;
    case 'identity':
      requireRule(s.location === 'clinic' && hasFact(s, 'pulse') && s.identity === 'undecided', '须先核验病历，并且名单决定不可反悔。');
      requireRule(c.decision !== 'expose' || !s.pawned && s.debts === 0 && s.allies.some(n => ['he', 'yan'].includes(n)),
        '公开名单须先取得贺迟或晏珩的担保，并保有未抵押、无救济债的本名；否则没有人能接住这些身份。可先查账谈担保，或选择保护。');
      s.identity = c.decision;
      if (c.decision === 'protect') {
        reputation(s, 'tide', 2); reputation(s, 'stage', 1); reputation(s, 'civic', -1);
        note(s, '你封存病人的本名，只公开脉波旁证。互助会＋２、百面行＋１、量名署－１；共同担保或以身作桥仍有可能。');
      } else {
        reputation(s, 'civic', 2); reputation(s, 'tide', -1); s.stress++;
        s.allies = s.allies.filter(n => !['mei', 'qiao', 'lu'].includes(n));
        note(s, '你公开病人名单。量名署＋２、互助会－１、压力＋１；相关民间担保撤回，今后只能争取有名之约。');
      }
      break;
    case 'pawn':
      requireRule(s.location === 'alley' && !s.pawned && s.identity !== 'expose', '本名只能在巷尾抵押一次；公开名单后不可破坏新约所需的本名。');
      s.pawned = true; s.silver += 12; s.stress = Math.max(0, s.stress - 2);
      note(s, '抵押唯一的本名，获得１２银。本轮无法赎回；有名之约关闭，以身作桥的资格开启。'); break;
    case 'work':
      requireRule(s.location === 'alley' && s.jobs < 2, '巷中只剩两趟搬货短工，不能无限刷钱。');
      cost(s, 0, 2); s.jobs++; s.silver += 4;
      note(s, '搬完一趟伞骨，精力－２、银钱＋４。没有阅历奖励。'); break;
    case 'rest':
      requireRule(['ferry', 'alley', 'clinic'].includes(s.location), '只有渡口、巷子与诊所能安全休整。');
      requireRule(s.vigor < 24 || s.stress > 0 || s.noise > 0, '状态完好，无需花钱休整。');
      cost(s, 3); s.vigor = Math.min(24, s.vigor + (s.skills.includes('nerve') ? 12 : 9));
      s.stress = Math.max(0, s.stress - 3); s.noise = Math.max(0, s.noise - 2);
      note(s, '支付３银烘衣休整：精力恢复，压力－３、警戒－２。巡逻布置不会因此消失。'); break;
    case 'shelter':
      requireRule(s.location === 'ferry' && s.debts < 2 && (s.vigor < 12 || s.silver < 3), '渡口最多救济两次，仅在精力不足１２或缺少休整费用时可用。');
      s.debts++; s.vigor = Math.min(24, s.vigor + 6); s.stress = Math.max(0, s.stress - 2);
      reputation(s, 'tide', -1);
      note(s, '避雨棚借你一晚干柴：精力＋６、压力－２、互助会声望－１，记下一笔本轮无法偿清的救济债。'); break;
    case 'file': {
      requireRule(s.location === 'tower' && s.act === 2 && !s.filed, '案卷须在第二幕雨钟塔提交一次。');
      requireRule(FACT_IDS.every(f => hasFact(s, f)) && s.identity !== 'undecided', '六件实物和病人名单决定缺一不可。');
      requireRule(['letter', 'costume', 'books', 'patient', 'clock', 'redseal', 'shelter'].every(q => s.claimed.includes(q as QuestId)), '先在委托簿结算七项前置主线，确认保管与报酬。');
      const key = `${c.motive}:${c.stamp}:${c.timing}`;
      requireRule(!s.wrongTheories.includes(key), '这份错误陈述已经被驳回，不能重复试探。');
      cost(s, 0, 1);
      if (c.motive !== 'mortgage' || c.stamp !== (s.seed % 2 === 0 ? 'broken' : 'double') || c.timing !== 'before') {
        s.wrongTheories.push(key); s.stress += 3;
        note(s, '案卷与原物冲突，被退回。压力＋３。请对照证据的原印、获利条件与潮钟，而不是猜测。'); break;
      }
      s.filed = true; s.act = 3;
      note(s, '六证互校成立：白契账房通过借名债券吞并街产。第三幕开启，先结算案卷，再走公庭踏道。');
      break;
    }
    case 'finish': {
      const gate = endingGate(s, c.ending); requireRule(!gate, gate);
      reward(s, 'dawn'); s.phase = 'won'; s.ending = c.ending;
      note(s, '契约落印。街道重新打开，而你选择的代价留在城里。'); break;
    }
  }
  s.turn++;
  if (s.phase === 'playing') {
    s.loss = s.vigor <= 0 ? '精力耗尽，调查者倒在封街线外。' :
      s.stress >= 12 ? '压力达到十二，失名恐惧压垮了调查。' :
        s.noise >= 10 ? '警戒达到十，巡街队封锁了所有出口。' :
          s.turn >= 240 ? '第二百四十次行动后天亮，封街令已经执行。' : '';
    if (s.loss) { s.phase = 'lost'; note(s, s.loss); }
  }
  return s;
}

export const definition: GameDefinition<State, Command> = { id: GAME_ID, create, reduce, parseCommand };

export function publicObservation(s: State, npc: NpcId, topic: Topic, method: Method) {
  const person = NPCS[npc];
  return {
    encounter: s.agentTurns, npc, topic, method,
    场景: SCENES[s.location].name, 姓名: person.name, 职业: person.job,
    愿望: person.desire, 缺点: person.flaw, 效忠: person.allegiance,
    确知范围: topic === 'lead' ? [{ id: person.fact, 内容: factText(person.fact, s.seed) }] : [],
    不知范围: '你不了解其他角色保管的实物，不得替他们作证。台词不是证据。',
    合法意图: legalActions(s, npc, topic), 允许线索: topic === 'lead' ? person.fact : 'none',
    议价上限: Math.min(4, s.silver), 玩家方法: METHOD_NAMES[method],
    玩家身份: DISGUISE_NAMES[s.disguise], 本名已抵押: s.pawned,
    名单决定: s.identity === 'protect' ? '保护化名' : s.identity === 'expose' ? '公开名单' : '尚未决定',
    关系: { 信任: s.trust[npc], 阵营声望: s.factions[person.faction], 已担保: s.allies.includes(npc) },
    公共风险: { 警戒: s.noise, 压力: s.stress, 巡逻: s.patrol },
    已有物证名称: s.evidence.map(e => FACTS[e.id].name),
    公开记忆: s.memory.slice(-8).map(m => ({ 姓名: NPCS[m.npc].name, 意图: m.action, 台词: m.line })),
    本话题次数: s.conversations[`${npc}:${topic}`] ?? 0,
    规则: '仅输出工具意图与八至一百二十字中文台词。证言或议价在案情话题仅可给自己的线索；其他行动线索填none。只有议价收一至四银，其余价格为零。不得宣告伤害、阅历、真假、结案或胜利。拒绝和巡逻有代价；无义务迎合玩家，也不可捏造事实。',
  };
}

export function nextHint(s: State): string {
  if (s.phase === 'choosing') return '选择一种职业开始。阅读、查看地图不消耗行动，也不会调用模型。';
  if (s.phase === 'won') return '契约已经生效。可读结局、导出案卷，或重新开始探索另一种代价。';
  if (s.phase === 'lost') return '本轮已终止；可读失败记录，再用同一种子重新规划路线。';
  if (s.vigor <= 5 || s.stress >= 8 || s.noise >= 7) return '资源接近危险线：优先服药、喝茶，或在渡口／巷子／诊所休整。不要硬撑。';
  if (QUEST_IDS.some(q => questReady(s, q))) return '有委托可结算：打开「委托」领取一次性报酬与阅历。';
  if (s.skillPoints > 0) return '有技能点：打开「名夹」选择成长，再进行检定。';
  const scene = SCENES[s.location];
  if (scene.fact && !s.leads[scene.fact]) return `主动与${NPCS[scene.npc!].name}交涉。若已遭拒，可付费调档；网络失败不收费也不推进。`;
  if (scene.fact && !hasFact(s, scene.fact)) return '已经知道物证位置。选择适合职业的勘验方式；精勘多花３银，失手可花４银复勘。';
  if (s.location === 'clinic' && hasFact(s, 'pulse') && s.identity === 'undecided') return '病历已核验：在此决定保护化名或公开名单。此选择不可反悔，影响担保与结局。';
  if (s.act === 1) return '沿实际街道去百面戏楼；拿到收据与袖纹并领取两项主线后，第二幕开启。';
  if (s.act === 2 && FACT_IDS.every(f => hasFact(s, f))) return '六证齐全。在雨钟塔提交案卷；案由、印模和时序都写在实物记录里。';
  if (s.act === 3) return s.location === 'court' ? '先进行终审交涉，再按已付出的代价选择契约。受阻的结局会列出缺少条件。' : '领取案卷报酬；经雨钟塔进入借名公庭。先确认自己拥有所需担保或抵押本名。';
  return '查量名署的双账、诊所的脉波、泵房的潮钟，再去雨钟塔。服饰、声望和潜入是真正不同的通路。';
}
