import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { COMPANIONS, HELP_MOVES, PLACES, SPIRITS, WILD_MOVES } from './data';
import type { Layout, Plan, State } from './data';
import { create, inspectLayout, legalHelp, parsePlan, reduce } from './engine';

export type { Plan } from './data';
export const ritualTool = defineTool<Plan>({
  name: 'answer_ritual',
  description: '代表当前野灵与每一位同行伙伴各给一次合法的中文公开应答。只能选择公布的动作，不能创造物资、改变阵式、决定成败或执行代码。',
  parameters: schema.object({
    wild: schema.enum(WILD_MOVES), intention: schema.string(),
    companions: schema.array(schema.object({
      id: schema.enum(COMPANIONS), move: schema.enum(HELP_MOVES), intention: schema.string(),
    }), 0, 3),
  }),
  parse: parsePlan,
  summarize: p => `${p.wild}：${p.intention}${p.companions.map(c => `；${SPIRITS[c.id].name}${c.move}：${c.intention}`).join('')}`,
});
export const SYSTEM = `你扮演原创世界祈芽岭中的野灵以及同行伙伴，不扮演玩家或裁判。只调用一次 answer_ritual。
为野灵从野灵合法动作中选一项，为观察中每位伙伴恰好给一个应答，伙伴动作必须来自它自己的合法动作目录。
角色各有独立目标、缺点与最近的公开记忆。不要让所有角色无条件讨好玩家。伏穗重视听觉枝；河卵重视回游；折岁翁重视见证也怕失去身份；借风匣怕告别；炭铃既要保护灰芽也需要休息；白絮要求冬眠；四候之结记住人的真实承诺。
棉芽要自己选择生长方向，蘸月想完成照护又拥有自己的旅行，炭铃容易逞强并畏惧未经同意的熄灭。高羁绊意味着能坦诚协作，不是丧失性格。根据各自目标、站位、附近元素、羁绊和记忆，在接引、护持、观望、抗拒的合法子集中选择。
公开意图用一至一百字中文，只说愿意做什么或拒绝什么；不要披露私密推理链，不要给模型自评分，不要输出网址、标记或任意代码。
野灵靠近加二共鸣；试探加一共鸣和一裂隙；筑障加二裂隙。阵句本身加一共鸣；伙伴接引或护持另由本地规则计算。模型的一次合法应答会真实耗息并推进这一场仪式。不要虚构新阵字、资源、奖励、技能或胜负。本地引擎是唯一裁判，不能用叙述绕过规则。`;

export function observation(s: State) {
  const p = PLACES[s.location];
  return {
    游戏: '森语契约', 地点: p.name, 季候: p.season, 阶段: s.phase,
    野灵: { 名字: p.wild, 目标: p.goal, 性格: p.trait, 合法动作: WILD_MOVES },
    阵式: s.layout, 费用: inspectLayout(s), 息力: s.focus, 裂隙: s.strain,
    共鸣: s.harmony, 目标共鸣: p.need, 地形: { 墙: p.walls, 湿地: p.marsh, 荆棘: p.thorns },
    装备: s.equipped, 成长: s.skills, 已作承诺: s.choices,
    同行者: s.party.map(spirit => ({
      id: spirit.id, 名字: spirit.evolved ? SPIRITS[spirit.id].evolved : SPIRITS[spirit.id].name,
      目标: SPIRITS[spirit.id].goal, 缺点: SPIRITS[spirit.id].flaw, 元素: SPIRITS[spirit.id].element,
      羁绊: spirit.bond, 蜕变: spirit.evolved, 记忆: spirit.memory, 合法动作: legalHelp(s, spirit.id),
    })),
    最近见闻: s.log.slice(-3),
    约束: '伙伴名单须完全匹配；不在接引范围只能观望或合法抗拒。每句公开意图至多一百字中文。七裂先判失败，之后才检查共鸣。不得自行授予胜利。',
  };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  let state = reduce(create(84), { type: 'travel', location: 'wood' });
  state = reduce(state, { type: 'begin' });
  const layout: Layout = {
    runes: [
      { cell: 10, element: 'wood' }, { cell: 11, element: 'ember' }, { cell: 12, element: 'wood' },
      { cell: 13, element: 'water' }, { cell: 14, element: 'water' },
    ], formation: [], stance: 'echo',
  };
  state = reduce(state, { type: 'layout', layout });
  return {
    request: { system: SYSTEM, observation: observation(state), tool: ritualTool, validate(plan) { reduce(state, { type: 'agent', plan }); } },
    verify(plan) {
      const next = reduce(state, { type: 'agent', plan });
      requireRule(next.turns === 1 && next.focus === state.focus - 1 && next.harmony > 0, '首轮必须实际耗息并推进阵上共鸣。');
      requireRule(next.phase === 'ritual' && next.quests.length === 0, '一次首轮应答不能伪造胜利或任务奖励。');
      requireRule(next.harmony === (plan.wild === '靠近' ? 3 : plan.wild === '试探' ? 2 : 1), '野灵意图必须真正改变仪式数值。');
    },
  };
}
