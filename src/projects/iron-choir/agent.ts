import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { ENEMY_DATA, GOAL_NAMES } from './data';
import { actionsFor, activeBattle, agentUnits, create, fieldFor, parsePlan, reduce, validatePlan } from './engine';
import type { Plan, State, Unit } from './engine';
import { shotGeometry } from './spatialmath';

const ALLY_OBJECTIVES = {
  shen: '沈砚：保护民用设施与受损同伴。优先立壁、阻挡炮线；必要时射击威胁设施的凿井者。不把保护误解为永远不进攻。',
  luo: '罗烬：保持长射程与低暴露，用远针消灭正在威胁平民的目标。护人目标下避免冒进；集火目标下用齐射或侧翼推进。',
  ye: '叶缄：先缝合近处受损同伴，再接驳或向终端推进；无工程工作时使用脉冲火力。不能修复已击毁的机体。',
};
function unitView(u: Unit) {
  return {
    id: u.id, name: u.name, team: u.team === 'enemy' ? '旧网守机' : u.team === 'civil' ? '民用设施' : '远征机体',
    position: u.position, hull: u.hull, shield: u.shield, energy: u.energy, heat: u.heat,
    maxHull: u.maxHull, maxHeat: u.maxHeat, ap: u.ap, range: u.range,
  };
}
export function observation(s: State, side: Plan['side']) {
  const b = activeBattle(s), field = fieldFor(s), actors = agentUnits(s, side);
  const friendly = b.units.filter(u => u.hull > 0 && (side === 'enemy' ? u.team === 'enemy' : u.team !== 'enemy'));
  const visible = b.units.filter(u => u.hull > 0 && (friendly.includes(u) ||
    friendly.some(viewer => shotGeometry(field, viewer.position, u.position, 10).visible &&
      shotGeometry(field, viewer.position, u.position, 10).inRange)));
  return {
    round: b.round, side, mission: b.mission,
    role: side === 'enemy' ? '旧网守机的分布式指挥员' : '远征同伴的有限协同',
    timing: side === 'enemy'
      ? '在队长本轮决策之前锁定公开意图。你不知道队长未来会移动或射击哪里，也不会收到其草稿。射击锁定当前坐标，目标移动可使射击落空。'
      : '队长本轮行动已经落地。你们先按观察中的机体顺序行动，随后执行已锁定的敌方意图，最后结算回合。不能改写队长。',
    objective: side === 'enemy' ? '执行各守机独立目标，只依据可见遥测，不推测未公开命令。' : GOAL_NAMES[s.goal],
    rules: [
      '只能给每台 actors 机体各选一个合法 options.id。不得增加单位、资源、伤害或动作。',
      '模型仅提交选择；几何、掩体、热量、能量、行动点、伤害、经验、物资与胜负均由本地引擎计算。',
      '不得让两台机体预约同一落点。按 actors 顺序执行；若目标先被击毁或道路被堵，后续相应动作取消且不消耗。',
      '架盾减少三点入射伤害；低掩体已在选项伤害中扣除三；硬墙完全阻挡弹道。',
      '每轮恢复四能量、至少冷却三、恢复二行动点。排热额外降低五热、回复三能量。',
      '只写简短中文公开意图，不提供隐私推理链，不执行代码或请求外部工具。',
    ],
    terminal: { ...field.terminal, links: b.links },
    map: { width: field.width, depth: field.depth, heights: field.heights, cover: field.solids.filter(solid => solid.kind !== 'terrain') },
    visibleUnits: visible.map(unitView),
    actors: actors.map(unit => ({
      ...unitView(unit),
      objective: unit.kind ? ENEMY_DATA[unit.kind].objective : ALLY_OBJECTIVES[unit.pilot!],
      trust: side === 'ally' && unit.pilot ? s.pilots[unit.pilot].bond : undefined,
      options: actionsFor(s, unit.id).map(action => ({
        id: action.id, label: action.name, kind: action.kind, target: action.target, to: action.to,
        cost: { ap: action.ap, energy: action.energy, heat: action.heat }, damage: action.damage, cover: action.cover,
      })),
    })),
    publicForecast: side === 'ally' ? b.forecasts.map(f => ({ unit: f.unit, action: f.action.name, aim: f.aim, intention: f.intention })) : [],
  };
}
export function requestFor(s: State, side: Plan['side']): AgentRequest<Plan> {
  const units = agentUnits(s, side);
  requireRule(units.length > 0, '当前没有需要模型决策的机体。');
  const options = [...new Set(units.flatMap(unit => actionsFor(s, unit.id).map(action => action.id)))];
  const tool = defineTool<Plan>({
    name: 'iron_choir_orders',
    description: '为铁穹回声当前轮次提交有限战术指令。每台本方存活机体一个合法选项与中文公开意图；本地引擎裁定全部物理与经济结果。',
    parameters: schema.object({
      round: schema.integer(1, 12), side: schema.enum([side]),
      orders: schema.array(schema.object({
        unit: schema.enum(units.map(unit => unit.id)), option: schema.enum(options), intention: schema.string(),
      }), units.length, units.length),
      intention: schema.string(),
    }),
    parse: parsePlan,
    summarize: plan => plan.intention,
  });
  return {
    system: `你参与原创中文机甲远征《铁穹回声》。${side === 'enemy'
      ? '你是旧防御网络的分布式指挥员，不是全知裁判。守闸者保护终端；逐迹者追击暴露弱盾目标；凿井者破坏可见民用设施。各机保有自己的优先级。'
      : '你只控制不是玩家主控的远征驾驶员。沈砚守护、罗烬远射、叶缄修复与接驳；尊重队长公开协同目标和每人的性格。'}
使用唯一的原生函数工具提交计划。精确匹配 observation.actors 中的单位和选项。不要编造选项或预知玩家下一步，不得改变规则。不需要解释思考过程。只给短中文公开作战意图。`,
    observation: observation(s, side),
    tool,
    validate: plan => { validatePlan(s, plan); },
  };
}
export function smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void } {
  const opening = reduce(create(85), { type: 'deploy', mission: 'rain', route: 'main' });
  return {
    request: requestFor(opening, 'enemy'),
    verify(plan) {
      const accepted = reduce(opening, { type: 'agent', plan: parsePlan(plan) });
      requireRule(accepted.battle?.stage === 'player' && accepted.battle.forecasts.length === 2, '开场守机必须生成两条真实机械预告。');
      requireRule(accepted.battle.forecasts.every(f => f.action.ap > 0 && f.action.id.length > 0), '公开预告必须对应有行动成本的机械选择。');
      requireRule(JSON.stringify(opening.inventory) === JSON.stringify(accepted.inventory), '锁定意图不能产生物资。');
    },
  };
}
