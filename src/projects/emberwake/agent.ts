import { defineTool, schema } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { AgentRequest } from '../../core/agents/client';
import { GameSession } from '../../core/games/session';
import { ACTORS, ACTIONS, TARGETS, battleActors, definition, legalOrders, level, maxHp, parsePlan } from './engine';
import type { Plan, State } from './engine';
import { ENEMY_NAMES, PEOPLE, PLACE_NAMES, STANCES, questById } from './data';
import type { QuestId } from './data';
import { CHARACTERS, QUEST_STORY } from './story';

export const SYSTEM = `你是原创中文空岛行旅中的多角色代理导演，不是裁判。只返回指定工具。
分别遵守每个角色的公开目标、缺点、羁绊和知识；同伴希望车队生还，敌人希望阻止推进，不互相分享私密知识。
商议时只由指定人物选择一种立场并说一句简短中文；orders必须为空。守诺提供首轮两点减伤，留痕提供开战一点心火，解缆提供首轮一点攻击。
战斗时每位在场角色恰好一个战术，从该角色catalog逐字选取action/lane/target。不得编造目标或代价。护持恢复一点角色心火，疗愈和破甲消耗两点；敌人扫击消耗两点。
敌人只能看见上一轮公开状态，不知道玩家本轮会选择的站位、技能、目标；现在先公布意图，随后玩家回应。不要试图猜测未提交的指令。
line最多一百二十字，intention最多四十八字，均为中文公开台词或行动意图，禁止外文、代码、私密推理。不要替玩家选择任务分支或结局。
所有伤害、奖励、等级、任务与结局由本地规则计算。你只能作出给定范围内的决定。`;
export const planTool = defineTool<Plan>({
  name: 'emberwake_council',
  description: '让在场人物商议，或公开全体同伴与敌人的合法战术；不决定伤害与奖励。',
  parameters: schema.object({
    kind: schema.enum(['parley', 'battle']), speaker: schema.enum(PEOPLE), stance: schema.enum(STANCES), line: schema.string(),
    orders: schema.array(schema.object({
      actor: schema.enum(ACTORS), action: schema.enum(ACTIONS), lane: schema.integer(0, 2), target: schema.enum(TARGETS), intention: schema.string(),
    }), 0, 5),
  }),
  parse: parsePlan,
  summarize: plan => plan.line,
});
export function observation(state: State, questId?: QuestId) {
  const quest = questById(questId ?? state.pending!.quest);
  const speaker = CHARACTERS[quest.person];
  return {
    kind: state.phase === 'forecast' ? 'battle' : 'parley',
    speaker: quest.person, place: PLACE_NAMES[state.location], act: state.act,
    quest: quest.title, situation: QUEST_STORY[quest.id][0],
    speakingRole: { name: speaker.name, goal: speaker.goal, flaw: speaker.flaw, bond: speaker.bond, mechanics: speaker.mechanic },
    stances: STANCES,
    persistentGoals: state.party.map(id => ({
      id, name: CHARACTERS[id].name, goal: CHARACTERS[id].goal, flaw: CHARACTERS[id].flaw,
      mechanics: CHARACTERS[id].mechanic, bond: state.bonds[id],
    })),
    journey: { completed: Object.keys(state.completed), values: state.values, level: level(state), hp: state.hp, maxHp: maxHp(state), energy: state.energy },
    battle: state.battle ? {
      round: state.battle.round, heroLane: state.battle.heroLane,
      enemies: state.battle.enemies.filter(e => e.hp > 0).map(e => ({ ...e, name: ENEMY_NAMES[e.id] })),
      allies: state.battle.allies,
      hazard: '第六轮起每轮悬缆坍塌造成十二点损伤。玩家尚未选择本轮动作。目标caravan表示共享车队生命。',
    } : null,
    roles: battleActors(state).map(actor => ({
      actor,
      side: state.party.some(id => id === actor) ? '同伴' : '敌方',
      knowledge: '仅此处公开的上一轮状态；不知道玩家接下来的指令。',
      goal: state.party.some(id => id === actor) ? '按自身角色职责保护车队并突破障碍。' : '守住此地，利用公开站位施压；不能预知玩家移动。',
      catalog: legalOrders(state, actor),
    })),
    rules: '同伴战术中的lane是本轮站位，最多移动一格；敌人攻击中的lane是预告落点。普攻只重击该路，扫击覆盖落点及相邻路。护持仅护本路。不要更改规则。',
  };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const session = new GameSession(definition, 82);
  const request: AgentRequest<Plan> = {
    system: SYSTEM, observation: observation(session.state, 'departure'), tool: planTool,
    validate(plan) { session.preview({ type: 'parley', quest: 'departure', plan }); },
  };
  return {
    request,
    verify(plan) {
      const fresh = planTool.parse(plan);
      session.dispatch({ type: 'parley', quest: 'departure', plan: fresh });
      session.dispatch({ type: 'choose', branch: 'a' });
      requireRule(session.state.completed.departure === 'a' && session.state.party.includes('lan') &&
        session.state.xp === 8 && session.state.bag.tonic === 3 && session.moveCount === 2, '开场代理决定未正确推进招募与奖励。');
    },
  };
}
