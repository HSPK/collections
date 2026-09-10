import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { DIRECTIONS, PATTERNS, RHYTHMS, RULE_IDS, RULES, type Plan } from './data';
import { create, legalRules, parsePlan, reduce, startWave, type State } from './engine';
import { classify } from './data';
import { step } from './simulation';

export const supervisorTool = defineTool<Plan>({
  name: 'dispatch_dream_batch',
  description: '梦境分拣局夜班督导。只选择合法规则卡、节奏模板和方向编组。当地引擎生成并验证全部包裹、窗口和得分。',
  parameters: schema.object({
    rule: schema.enum(RULE_IDS), rhythm: schema.enum(RHYTHMS),
    pattern: schema.enum(PATTERNS), first: schema.enum(DIRECTIONS),
  }),
  parse: parsePlan,
  summarize: plan => `${RULES[plan.rule].title}；${plan.rhythm === 'steady' ? '匀速' : plan.rhythm === 'quick' ? '轻快' : '一紧一松'}派件；${plan.first === 'day' ? '白昼' : '黑夜'}先行。`,
});
export const ROLE = `你是原创世界「梦境分拣局」的夜班督导。玩家要把六件梦邮分回白昼或黑夜。
你只能通过工具在班次之间选择规则、节奏与编组，不能决定得分、生命、时钟或生成任意包裹。
根据公开误分记录训练玩家：有超时优先 steady/breathing，有规则错误可选更直观的合法规则；稳定正确可选 quick。
每班仅一条规则，以 observation 中 legalRules 为准。第一班只能 sun/orange。之后必须换规则，并改变 pattern 或 first。
sun:太阳回白昼；orange:橙包装回白昼；not-moon:非月亮回白昼；exact-two:邮票恰好两枚回白昼；two-plus:邮票至少两枚回白昼。其余回黑夜。
模板均六件、白昼黑夜各三件、最长连续两件同向。模型影响真实规则与顺序，不要写故事。只提交精确四字段工具。`;
export function observation(s: State) {
  return {
    wave: s.wave + 1, totalWaves: 4, difficulty: s.difficulty,
    legalRules: legalRules(s).map(id => ({ id, day: RULES[id].day, night: RULES[id].night })),
    rhythms: RHYTHMS, patterns: PATTERNS, first: DIRECTIONS,
    previousPlan: s.plan, requireNewRule: true, requireNewPatternOrFirst: s.plan !== null,
    publicRecord: s.history.map(h => ({
      wave: h.wave, rule: h.plan.rule,
      correct: h.outcomes.filter(o => o.correct).length,
      mistakes: h.outcomes.filter(o => !o.correct).map(o => ({ expected: o.expected, actual: o.actual })),
    })),
    limits: { parcels: 6, eachDirection: 3, maxSameDirection: 2, minWindowMs: 2100, lives: s.lives, holdTokens: s.holds },
  };
}
export function requestFor(s: State): AgentRequest<Plan> {
  return { system: ROLE, observation: observation(s), tool: supervisorTool, validate: plan => { reduce(s, { type: 'plan', plan }); } };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = create(89);
  return {
    request: requestFor(state),
    verify(plan) {
      const accepted = reduce(state, { type: 'plan', plan });
      let live = startWave(accepted);
      while (live.tick < live.arrival - 1) live = step(live);
      live = step(live, { tick: live.tick + 1, action: classify(live.batch[0], plan.rule) });
      requireRule(live.score === 110 && live.outcomes[0].correct && accepted.batch.length === 6,
        '督导必须生成首个可由真实本地时钟分拣的批次。');
    },
  };
}
