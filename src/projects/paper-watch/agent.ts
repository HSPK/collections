import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { ARCHETYPES, CHAPTERS, FORMATIONS, LANE_NAMES, WAVE_TICKS, schedule } from './data';
import type { Plan } from './data';
import { create, parsePlan, reduce } from './engine';
import type { State } from './engine';
import { createRound, replay, step, winningTrace } from './simulation';

export const conductorTool = defineTool<Plan>({
  name: 'conduct_ink_watch',
  description: '为下一更选择真实墨影分布、固定间距、轮廓和预先承诺的换巷；奖励与碰撞由本地决定。',
  parameters: schema.object({
    formation: schema.enum(FORMATIONS), focus: schema.integer(0, 2), spacing: schema.integer(32, 36),
    archetype: schema.enum(ARCHETYPES), feint: schema.boolean(), intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: p => `${p.intention} · ${LANE_NAMES[p.focus]} / ${p.formation} / ${p.spacing}刻 / ${p.archetype}${p.feint ? ' / 预告换巷' : ''}`,
});
export const ROLE = `你是原创纸城的墨影指挥，与守夜人做一场不伤人的夜间把戏。只调用 conduct_ink_watch。
根据上一更公开的用灯次数、空闪、连锁与剩余城折，选择下一更真正执行的队形。
formation: procession轮流三巷；pendulum按0,1,2,1摆动；gather聚集focus巷。focus为0西街/1钟楼/2东埠。
spacing只能32或36刻（每刻50毫秒）。archetype: moth早亮轮廓、kite晚亮、mask可换巷。
feint只影响mask：先出现在目标巷右邻，24刻时移至目标巷；箭头与目标从开更起公开。
第4/5更本地将每第3/2只替换为双层墨冠，需相隔8刻的两次闪光。
所有影子都提前3秒出现，金色轮廓才能照散；32至60刻皆可命中。首只20刻出现，全更480刻。
一更中不得改编，不得读取实时按键或声称计分。intention为1至70字的简短中文公开战术，不是旁白、不含网址。
不得输出任意事件、代码、奖励、额外字段。无论玩家表现如何，都只选择这些合法选项。`;
export function observation(state: State) {
  return {
    wave: state.wave + 1, chapter: CHAPTERS[state.wave].title,
    cityFolds: state.lives, previousWave: state.history.at(-1) ?? null,
    upgrades: state.upgrades, legal: { formations: FORMATIONS, lanes: LANE_NAMES, spacing: [32, 36], archetypes: ARCHETYPES, feint: [false, true] },
    budget: { shadows: CHAPTERS[state.wave].count, ticks: WAVE_TICKS, minimumSpacing: 32, damagePerEscape: 1, maximumSimultaneous: 2 },
    fairness: '每灯初始100能量；闪光28能量/32热；冷却8刻；闲刻回能2、散热至少2。任何合法编排均可在出现后36刻照一次，墨冠44刻补照。',
  };
}
export function requestFor(state: State): AgentRequest<Plan> {
  return { system: ROLE, observation: observation(state), tool: conductorTool, validate: plan => { reduce(state, { type: 'plan', plan }); } };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = create(91);
  return {
    request: requestFor(state),
    verify(plan) {
      const prepared = reduce(state, { type: 'plan', plan });
      requireRule(prepared.phase === 'prepared' && prepared.lives === 3 && prepared.score === 0, '编排不能消耗城折或替玩家计分。');
      const round = createRound(plan, 0);
      for (let tick = 0; tick < 20; tick++) step(round);
      requireRule(round.shadows[0].status === 'live' && round.shadows[0].spawn.lane === schedule(plan, 0)[0].lane, '模型选择必须在本地生成真实墨影。');
      const result = replay(plan, 0, 3, [], winningTrace(plan, 0), WAVE_TICKS);
      requireRule(result.stats.cleared === 8 && result.score > 0 && result.lives === 3, '真实首更编排必须可由合法闪光完成。');
    },
  };
}
