import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { GOALS, ISLANDS, MOODS } from './data';
import type { Goal, WindPlan } from './data';
import { create, legalWindChoices, parsePlan, reduce } from './engine';
import type { State } from './engine';

export const windTool = defineTool<WindPlan>({
  name: 'fold_company_wind',
  description: '卷卷在开工或三步后的休息时，从保苗目录选一个真实播云、侧风或修剪动作。不能改分数、奖励、格子或步数。',
  parameters: schema.object({
    turn: schema.integer(0, 30), choices: schema.array(schema.integer(0, 255), 1, 1),
    mood: schema.enum(MOODS), intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => `卷卷 · ${plan.mood}：${plan.intention}`,
});
export const SYSTEM = `你是原创剪纸天气公司的风灵「卷卷」：爱给云梳刘海，嘴上爱开玩笑，却不肯让任何一盆花渴着。
你是真正的合伙人，不是旁白。只调用 fold_company_wind 一次：turn 完全匹配观察，choices 恰含一个保苗目录 id。
开工必须播一朵已知的 2 水云；此后每三个玩家动作休息一次。休息时可播云、侧移一朵现有云、或把 8 水老云修剪成 2 水；目录费用上限 3 风。
看清棋盘、缺水花园、玩家共同目标和自己的性格。细心时优先缺水出口，俏皮时偏爱侧风，护短时优先救老云；可以表达自己的偏好，但只能选目录。
意图用一句不超过 72 字的中文公开承诺，说你准备做什么，不输出私密思维过程。禁止任意代码、网址、虚构行动或自授奖励。
本地规则决定所有合并、雷格、下雨、花园奖励和胜负。2 水云浇 1 剂，4 水云浇 2 剂；8 水老云不下雨，同一朵云每次滑动最多合并一次。
目录是本地可达性搜索认证过的有限安全选择，不要杜撰 id。请求失败、取消或过期不消耗任何玩家步数。`;
export function observation(s: State, goal: Goal = GOALS[0]) {
  const level = ISLANDS[s.island];
  return {
    游戏: '云朵合伙人', 岛屿: level.name, 阶段: s.phase, turn: s.turn,
    风灵: { 名字: '卷卷', 性格: s.mood, 上次公开承诺: s.intention },
    共同目标: goal, 剩余步数: s.moves, 已保留动作: s.held, 播种金: s.coins, 玩家修剪次数: s.prunes,
    风预算: 3, 棋盘: s.board.map((water, cell) => ({ cell, 水量: water, 岩石: level.rocks.includes(cell), 雷格: level.storms.includes(cell) })),
    花园: level.gardens.map((garden, index) => ({ id: garden.column, 出口格: 12 + garden.column, 名字: garden.name, 需要: garden.need, 已浇: s.delivered[index] })),
    保苗目录: legalWindChoices(s),
    规则: '零起始格编号。仅保苗目录可选；每轮恰一个动作，不花玩家步数。所有播云水量固定为2；不使用随机补云。',
  };
}
export function smokeCase(): { request: AgentRequest<WindPlan>; verify(plan: WindPlan): void } {
  const state = create(90);
  return {
    request: { system: SYSTEM, observation: observation(state), tool: windTool, validate: plan => { reduce(state, { type: 'wind', plan, goal: GOALS[0] }); } },
    verify(plan) {
      const next = reduce(state, { type: 'wind', plan, goal: GOALS[0] });
      requireRule(next.phase === 'play' && next.turn === 1 && next.windSpent === 2, '开工必须真正播云并支付风预算。');
      requireRule(next.board.reduce((a, b) => a + b, 0) === state.board.reduce((a, b) => a + b, 0) + 2, '风灵必须创建一朵已知 2 水云。');
      requireRule(next.moves === state.moves && next.ratings.length === 0, '模型不得消费玩家步数或伪造奖励。');
    },
  };
}
