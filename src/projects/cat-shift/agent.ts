import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { LANES } from './data';
import type { Plan } from './data';
import { createSession, parsePlan, publicObservation, solve } from './engine';
import type { State } from './engine';

export const guardTool = defineTool<Plan>({
  name: 'commit_night_patrol',
  description: '公布本展室巡逻方向与首步节拍。此计划会真正控制每次猫行动后的灯光，不可临时改变。',
  parameters: schema.object({
    lane: schema.enum(LANES), offset: schema.integer(0, 1), intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => plan.intention,
});
export function guardRequest(state: State, validate: (plan: Plan) => void): AgentRequest<Plan> {
  return {
    system: '你是纸博物馆认真但不凶的巡夜员。团团猫想借走月牙沙丁鱼。只提交合法工具参数；根据公开的过往猫路线，在本室选择有针对性的巡逻方向和首步节拍。所有方案都可被聪明的猫破解。intention 用80字内中文，说你将检查哪里，不输出推理过程。你不能改变地图、步数、警报、奖励。第一次没有路线史时，自行选择合法巡逻。',
    observation: publicObservation(state),
    tool: guardTool, validate,
  };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = createSession();
  return {
    request: guardRequest(session.state, plan => { session.preview({ type: 'guard', plan }); }),
    verify(plan) {
      session.dispatch({ type: 'guard', plan });
      const witness = solve(session.state);
      requireRule(witness !== null, '真实开场巡逻必须存在合法脱出路线。');
      for (const action of witness.actions) session.dispatch(action);
      requireRule(session.state.phase === 'cleared' && session.state.stars.length === 1, '开场巡逻未推进真实展室。');
      session.dispatch({ type: 'next' });
      requireRule(session.state.room === 1 && session.state.history.length === 1, '巡逻没有形成下一室的公开路线史。');
    },
  };
}
