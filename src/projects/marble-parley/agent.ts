import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { FORMATIONS, FORMATION_NAMES, PACTS, PACT_NAMES, ROUNDS } from './data';
import type { Plan } from './data';
import { create, parsePlan, publicStats, reduce } from './engine';
import type { State } from './engine';

export const boardTool = defineTool<Plan>({
  name: 'arrange_embassy',
  description: '选择一套有通关证明的弹珠礼阵及一个受铜盾保护的契约。这会改变实际碰撞几何。附一条简短中文公开意图，不提供推理、代码或得分。',
  parameters: schema.object({
    formation: schema.enum(FORMATIONS), defend: schema.enum(PACTS), intent: schema.string(),
  }),
  parse: parsePlan,
  summarize: plan => `${FORMATION_NAMES[plan.formation]} · 守护${PACT_NAMES[plan.defend]}：${plan.intent}`,
});
export const SYSTEM = `你是弹珠外交中的外星使馆对手，不是旁白。根据公开的玩家发射角度、力度、碰撞与契约命中统计，选择一次真实的防御布阵。
仅调用 arrange_embassy 一次。formation 必须为 fan、bridge、orbit；defend 必须为 harbor、garden、night。
fan 将两枚弹台向外移动；bridge 向内移动并加大弹台；orbit 加入第三枚低位弹台。铜盾固定放在被守护契约下方，挡住直射，但侧面与反弹仍可达。
所有阵型来自本地已验证有限目录，不得修改坐标、次数、分数或规则。选择有针对性的困难路线而不是帮玩家赢。第一回合没有历史时自由选阵。终章需签三份契约。
intent 为1至80字的简短中文公开意图；只说你将守哪里/采用什么策略，不要思维链或隐藏推理。布阵会在发射前完全公开，发射后你不能干预。`;
export function observation(state: State) {
  return { game: '弹珠外交', round: state.round, chapter: ROUNDS[state.round].name, opponent: ROUNDS[state.round].host,
    seedVariant: state.seed % 3, requiredPacts: state.round === 4 ? 3 : 2, shotsPerRound: 3,
    phase: state.phase, publicShotStatistics: publicStats(state),
    legalFormations: FORMATIONS.map(id => ({ id, name: FORMATION_NAMES[id] })),
    legalDefenses: PACTS.map(id => ({ id, name: PACT_NAMES[id] })),
    rules: '一回合只布阵一次；三个普通发射足够完成任何合法阵型。玩家另有一次连签电荷：撞墙或弹台后命中契约，可连签最近的另一份。已公开的板面不能再变动。',
    intentMaxCharacters: 80 };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const state = create(1);
  return {
    request: { system: SYSTEM, observation: observation(state), tool: boardTool,
      validate(plan) { reduce(state, { type: 'arrange', round: 0, plan }); } },
    verify(plan) {
      const next = reduce(state, { type: 'arrange', round: 0, plan });
      requireRule(next.phase === 'ready' && next.board?.defend === plan.defend && next.plan?.formation === plan.formation,
        '模型必须提交真正的碰撞板面。');
      requireRule(next.shots === 3 && next.score === 0 && next.history.length === 0, '布阵不得花费弹珠或颁发得分。');
    },
  };
}
