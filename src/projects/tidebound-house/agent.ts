import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { GameSession } from '../../core/games/session';
import { GUEST_IDS, GUESTS, SCENES, ITEMS } from './data';
import { CLUE_NAMES, definition, parsePlan, tasksFor, tide, watch } from './engine';
import type { Plan, State } from './engine';

export type { Plan } from './engine';
export const agendaTool = defineTool<Plan>({
  name: 'tidebound_guest_agendas',
  description: '只为当前潮段的五位原创旅客各选一个合法目录议程。由本地规则处理地点、有限援助、同桌互通与羁绊；不得自行发奖或完成任务。',
  parameters: schema.object({
    slot: schema.integer(0, 13),
    choices: schema.array(schema.object({
      guest: schema.enum(GUEST_IDS),
      task: schema.enum(['table', 'help', 'route', 'rest']),
      intention: schema.string(),
    }), 5, 5),
    intention: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => plan.intention,
});
export const SYSTEM = `你扮演原创中文群像故事《潮汐归客》的五位旅客，不是分配分数的裁判。
只返回本潮段的一份工具议程，五人各一次，严格从各自目录选择。不要全员休息。
每个角色依据自己的目标、缺点、有限已知线索与共同公开记忆行动；不要把一个人的未知秘密当成另一个人的知识。
table让人同时到潮灯厅，与在场者互通线索；请优先让有关系门槛的搭档同桌，不要让一个人空等。
help从该旅客自己的有限行李给工房一份材料，库存为零就不能援助。route让旅客到自己的去处发起会面。rest保留原地。
同桌与外出共享每人每潮一次羁绊上限。旅客彼此的相遇真的改变连结与共享知识，并影响双岸仪式，不只是向主人聊天。
认真参考主人本次邀请方向，但每人可以因自己的目标选择不同安排。开篇优先长桌相识，让秘密的两端有机会相遇。
角色完成了约定仍会生活、援助或作别；他们不必永远围着主人站着。
只写简短、温柔、中文的公开意向：每人最多六十四字，总意向最多一百五十字。不输出私密推理、网址、代码、自评或结局宣告。
工具没有自由行动权限。经验、库存、承诺真伪、期限、失败与结局只由本地规则判定。`;

export function observation(state: State, invitation = '长桌相遇，让彼此亲自说话') {
  return {
    世界: '潮汐归客', 潮次: tide(state), 时段: watch(state), slot: state.slot,
    主人的邀请: invitation,
    消耗: '一次成功议程耗一行动；失败、取消、过期不耗行动。每潮段仅一次。',
    公开记忆: state.memory,
    公开发现: state.clues.map(id => CLUE_NAMES[id]),
    主人位置: SCENES[state.location].name,
    共用行囊: Object.entries(state.inventory).filter(([, amount]) => amount > 0).map(([id, amount]) => ({ 名称: ITEMS[id as keyof typeof ITEMS].name, 数量: amount })),
    guests: GUEST_IDS.map(id => {
      const data = GUESTS[id], guest = state.guests[id];
      return {
        id, 姓名: data.name, 身份: data.role, 目标: data.goal, 缺点: data.flaw,
        搭档: data.partner, 位置: SCENES[guest.location].name,
        自己知道: guest.knowledge.map(clue => CLUE_NAMES[clue]),
        羁绊: guest.bond, 承诺: guest.promise === 'done' ? '已兑现' : guest.promise === 'pending' ? `第${guest.due}潮前兑现` : guest.promise === 'broken' ? '已错过' : '尚未立约',
        行李援助余量: guest.supply,
        legalTasks: tasksFor(state, id),
      };
    }),
    规则: '五人各一次；至少一人非休息；同桌至少两人才交流。不能获得目录以外的奖励。',
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 86);
  session.dispatch({ type: 'start', build: 'reader' });
  session.dispatch({ type: 'quest', quest: 'hearth' });
  const before = structuredClone(session.state);
  return {
    request: {
      system: SYSTEM, tool: agendaTool, observation: observation(session.state),
      validate: plan => { session.preview({ type: 'plan', plan }); },
    },
    verify(plan) {
      session.dispatch({ type: 'plan', plan });
      requireRule(session.state.ap === before.ap - 1 && session.state.plannedSlots.length === 1, '真实议程必须原子消耗一个行动并记录潮段。');
      requireRule(GUEST_IDS.some(id => session.state.guests[id].location !== before.guests[id].location), '开篇议程需要让旅客真正选择新地点。');
      requireRule(session.state.links.length > 0 || JSON.stringify(session.state.inventory) !== JSON.stringify(before.inventory) ||
        GUEST_IDS.some(id => session.state.guests[id].bond > before.guests[id].bond), '模型议程必须改变人物连结、有限物资或关系，而非只生成文字。');
    },
  };
}
