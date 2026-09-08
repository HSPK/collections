import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { ACTIONS, FACT_IDS, NPCS } from './data';
import type { Method, NpcId, Topic } from './data';
import { create, encounterGate, parsePlan, publicObservation, reduce } from './engine';
import type { Plan, State } from './engine';

export type { Plan } from './engine';

export const tool = defineTool<Plan>({
  name: 'choose_city_intent',
  description: '作为雾津当前角色，选择一项合法的公开交涉意图。只能指出亲自保管的线索；费用、检定、信任、物证与结局由本地规则裁决。',
  parameters: schema.object({
    encounter: schema.integer(0, 40),
    action: schema.enum(ACTIONS),
    fact: schema.enum(['none', ...FACT_IDS]),
    price: schema.integer(0, 4),
    line: schema.string(),
  }),
  parse: parsePlan,
  summarize: p => p.line,
});

export function requestFor(s: State, npc: NpcId, topic: Topic, method: Method): AgentRequest<Plan> {
  const gate = encounterGate(s, npc, topic);
  requireRule(!gate, gate);
  const person = NPCS[npc];
  return {
    system: `你是原创中文城市奇幻侦探游戏《借名之城》中的${person.name}，${person.job}。城市雾津以名字作抵押，服装承载临时法律身份。你的愿望：${person.desire}你的缺点：${person.flaw}你的效忠：${person.allegiance}只依据观察中的有限知识、关系与公开记忆选择行动，不扮演旁白或裁判。可以作证、扣留、议价、担保或布置巡逻，但必须属于合法意图。仅用指定工具提交结构化意图和简短中文台词，不输出私人推理，不发明证据、分数、奖励或结果。真实人物不必永远合作；拒绝会带来已公开的风险和昂贵恢复路径。`,
    observation: publicObservation(s, npc, topic, method),
    tool,
    validate: plan => { reduce(s, { type: 'agent', npc, topic, method, plan }); },
  };
}

export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const before = reduce(create(83), { type: 'start', role: 'listener' });
  return {
    request: requestFor(before, 'lan', 'lead', 'listen'),
    verify(plan) {
      const after = reduce(before, { type: 'agent', npc: 'lan', topic: 'lead', method: 'listen', plan });
      requireRule(after.agentTurns === 1 && after.memory[0]?.npc === 'lan' && after.vigor === before.vigor - 1,
        '开场角色意图必须经过规则、留下公开记忆并支付一次合法交涉成本。');
      requireRule(after.evidence.length === 0 && after.xp === 0 && after.phase === 'playing',
        '角色不能凭台词发放证据、阅历或胜利。');
      requireRule(plan.action === 'withhold' ? !after.leads.receipt && after.noise === 1 : after.leads.receipt === 'agent',
        '阮灯的选择必须真实改变线索或调查风险。');
    },
  };
}
