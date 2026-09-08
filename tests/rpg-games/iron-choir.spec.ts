import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { createInventory, exchangeInventory } from '../../src/core/rpg/inventory';
import { progression } from '../../src/core/rpg/progression';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import {
  actionsFor, create, damagePreview, definition, endingAvailable, fieldFor, parseCommand, parsePlan, pilotStats, reduce, validatePlan,
} from '../../src/projects/iron-choir/engine';
import type { Command, Plan, State } from '../../src/projects/iron-choir/engine';
import { observation, requestFor, smokeCase } from '../../src/projects/iron-choir/agent';
import { ENDING_IDS, ITEMS, LEVELS, LOCATIONS, MISSIONS, PILOT_IDS, QUESTS } from '../../src/projects/iron-choir/data';
import { CHARACTERS, ENDINGS, FACTIONS, INTERLUDES, LOCATION_STORY, MISSION_STORY, PROLOGUE } from '../../src/projects/iron-choir/story';
import { makeField, pathsFrom, segmentIntersectsBox, shotGeometry, walkable } from '../../src/projects/iron-choir/spatialmath';
import type { Field } from '../../src/projects/iron-choir/spatialmath';

type Observation = ReturnType<typeof observation>;
type Option = Observation['actors'][number]['options'][number];
type Strategy = 'balanced' | 'aggressive' | 'wait';
function fixturePlan(input: Observation, strategy: Strategy = 'balanced'): Plan {
  const destinations = new Set<string>(), reservedDamage = new Map<string, number>();
  const orders = input.actors.map(actor => {
    const options = actor.options.filter(o => !o.to || !destinations.has(`${o.to.x}:${o.to.z}`));
    const attack = options.filter(o => o.damage > 0 && o.target);
    const foes = input.visibleUnits.filter(u => input.side === 'enemy' ? u.team !== '旧网守机' : u.team === '旧网守机');
    const viable = attack.filter(o => {
      const target = foes.find(u => u.id === o.target);
      return target && target.hull + target.shield > (reservedDamage.get(target.id) ?? 0);
    });
    let selected: Option | undefined;
    if (strategy === 'wait') selected = options.find(o => o.id === 'vent');
    else if (input.side === 'ally') {
      selected = options.find(o => o.kind === 'mend') ?? options.find(o => o.kind === 'link');
      if (!foes.length && ['water', 'bridge'].includes(input.mission)) selected ??= options.find(o => o.kind === 'guard');
      if (!selected && actor.id === 'ye' && input.objective.includes('终端') && input.terminal.links === 0) {
        selected = options.filter(o => o.to).sort((a, b) =>
          Math.hypot(a.to!.x - input.terminal.x, a.to!.z - input.terminal.z) -
          Math.hypot(b.to!.x - input.terminal.x, b.to!.z - input.terminal.z))[0];
      }
      selected ??= (actor.id === 'luo' ? viable.find(o => o.kind === 'snipe') : undefined) ??
        viable.sort((a, b) => b.damage - a.damage)[0];
    } else {
      if (actor.name.startsWith('凿井')) selected = viable.filter(o => o.target === 'beacon').sort((a, b) => b.damage - a.damage)[0];
      if (strategy === 'aggressive') selected ??= viable.filter(o => o.target === 'shen').sort((a, b) => b.damage - a.damage)[0];
      if (actor.name.startsWith('守闸') && strategy === 'balanced' && actor.shield < 2) selected ??= options.find(o => o.id === 'guard');
      selected ??= viable.sort((a, b) => {
        const ta = foes.find(u => u.id === a.target)!, tb = foes.find(u => u.id === b.target)!;
        return (ta.hull + ta.shield - a.damage) - (tb.hull + tb.shield - b.damage);
      })[0];
    }
    if (!selected) {
      const target = input.side === 'ally' ? input.terminal : foes[0]?.position ?? input.terminal;
      selected = options.filter(o => o.to).sort((a, b) =>
        Math.hypot(a.to!.x - target.x, a.to!.z - target.z) - Math.hypot(b.to!.x - target.x, b.to!.z - target.z))[0] ??
        options.find(o => o.id === 'vent') ?? options[0];
    }
    if (!selected) throw new Error('Fixture actor has no legal choice.');
    if (selected.to) destinations.add(`${selected.to.x}:${selected.to.z}`);
    if (selected.target) reservedDamage.set(selected.target, (reservedDamage.get(selected.target) ?? 0) + selected.damage);
    return {
      unit: actor.id, option: selected.id,
      intention: actor.id === 'ye' ? '照看损伤与终端，不替同伴签署授权。' : actor.id === 'luo' ? '保持远射距离，优先压住威胁平民的炮口。' :
        actor.name.startsWith('凿井') ? '优先切断可见民用设施的供能。' : actor.name.startsWith('逐迹') ? '追踪可见弱盾机体，调整火力角度。' : '守住接驳区，执行当前合法动作。',
    };
  });
  return { round: input.round, side: input.side, orders, intention: input.side === 'enemy' ? '守机按各自防御职责锁定公开意图。' : '远征驾驶员按公开目标分工行动。' };
}
function fixture(turn: FixtureTurn) { return fixturePlan(turn.observation as Observation); }
function legalPlayer(s: State): string {
  const actions = actionsFor(s, s.lead), b = s.battle!, leader = b.units.find(u => u.id === s.lead)!;
  const enemies = b.units.filter(u => u.team === 'enemy' && u.hull > 0);
  const link = actions.find(a => a.kind === 'link');
  if (link) return link.id;
  const fire = actions.filter(a => a.kind === 'fire').sort((a, b) => {
    const targetA = enemies.find(u => u.id === a.target)!, targetB = enemies.find(u => u.id === b.target)!;
    return targetA.hull + targetA.shield - targetB.hull - targetB.shield;
  })[0];
  if (fire) return fire.id;
  if (leader.heat > leader.maxHeat - 4 || leader.energy < 3) return 'vent';
  if (!enemies.length && ['water', 'bridge'].includes(b.mission)) return 'guard';
  const destination = fieldFor(s).terminal;
  const move = actions.filter(a => a.to).sort((a, b) =>
    Math.hypot(a.to!.x - destination.x, a.to!.z - destination.z) -
    Math.hypot(b.to!.x - destination.x, b.to!.z - destination.z))[0];
  return move?.id ?? 'guard';
}
function setupCampaign(session: GameSession<State, Command>) {
  const dispatch = (c: Command) => session.dispatch(c);
  dispatch({ type: 'visit', location: 'kiln' });
  dispatch({ type: 'choice', scene: 'mercy', choice: 'share' });
  dispatch({ type: 'build', gear: 'lance' });
  dispatch({ type: 'equip', pilot: 'shen', gear: 'lance' });
  dispatch({ type: 'build', gear: 'relay' });
  dispatch({ type: 'equip', pilot: 'shen', gear: 'relay' });
}
function betweenMissions(session: GameSession<State, Command>) {
  const count = session.state.completed.length;
  if (count === 1) {
    session.dispatch({ type: 'visit', location: 'archive' });
    session.dispatch({ type: 'choice', scene: 'archive', choice: 'publish' });
    session.dispatch({ type: 'build', gear: 'reactor' });
    session.dispatch({ type: 'equip', pilot: 'shen', gear: 'reactor' });
  } else if (count === 2) {
    session.dispatch({ type: 'visit', location: 'barracks' });
    session.dispatch({ type: 'choice', scene: 'oath', choice: 'review' });
  } else if (count === 3) {
    session.dispatch({ type: 'visit', location: 'cistern' });
    session.dispatch({ type: 'choice', scene: 'silence', choice: 'rest' });
  } else if (count === 4) {
    session.dispatch({ type: 'visit', location: 'garden' });
    session.dispatch({ type: 'choice', scene: 'names-side', choice: 'people' });
  }
  for (const id of PILOT_IDS) {
    const p = session.state.pilots[id];
    if (!p.recruited) continue;
    if (p.damage) session.dispatch({ type: 'repair', pilot: id });
    for (const skill of ['piercer', 'coolant', 'vigil'] as const) {
      const current = session.state.pilots[id];
      if (!current.skills.includes(skill) && progression(current.xp, LEVELS).level - 1 > current.skills.length) {
        session.dispatch({ type: 'learn', pilot: id, skill });
      }
    }
  }
}
function simulateCampaign() {
  const session = new GameSession(definition, 85);
  setupCampaign(session);
  for (const mission of MISSIONS) {
    if (session.state.completed.length) betweenMissions(session);
    session.dispatch({ type: 'deploy', mission: mission.id, route: 'ridge' });
    let steps = 0;
    while (session.state.phase === 'battle' && steps++ < 90) {
      const s = session.state;
      if (s.battle!.stage === 'forecast') session.dispatch({ type: 'agent', plan: fixturePlan(observation(s, 'enemy')) });
      else if (s.battle!.units.find(u => u.id === s.lead)!.ap > 0) session.dispatch({ type: 'player', option: legalPlayer(s) });
      else session.dispatch({ type: 'agent', plan: fixturePlan(observation(s, 'ally')) });
    }
    expect(session.state.phase, `Mission ${mission.id}: ${session.state.log.at(-1)} / ${session.state.battle?.history.join(' | ')}`).toBe('debrief');
    session.dispatch({ type: 'debrief' });
  }
  return session;
}

test.describe('铁穹回声 · 纯规则', () => {
  test('原创内容、角色、场景与任务达到完整战役规模', () => {
    const authored = JSON.stringify({ CHARACTERS, ENDINGS, FACTIONS, INTERLUDES, LOCATION_STORY, MISSION_STORY, PROLOGUE });
    expect(authored.match(/[\u3400-\u9fff]/g)!.length).toBeGreaterThan(5000);
    expect(CHARACTERS).toHaveLength(6);
    expect(FACTIONS).toHaveLength(4);
    expect(CHARACTERS.every(c => c.biography && c.goal && c.flaw && c.bond && c.portrait >= 0)).toBe(true);
    expect(PILOT_IDS).toHaveLength(3);
    expect(LOCATIONS).toHaveLength(10);
    expect(QUESTS).toHaveLength(13);
    expect(new Set(MISSIONS.map(m => m.act)).size).toBe(3);
    expect(MISSIONS).toHaveLength(6);
  });
  test('真实几何统一射程、视线、高差、低掩体和可行路径', () => {
    const field: Field = { width: 5, depth: 5, heights: Array(25).fill(0), terminal: { x: 2, z: 2 }, solids: [] };
    const from = { x: 0, z: 2 }, to = { x: 4, z: 2 };
    expect(shotGeometry(field, from, to, 4)).toMatchObject({ visible: true, inRange: true, cover: false });
    expect(shotGeometry(field, from, to, 3.99).inRange).toBe(false);
    field.solids.push({ id: 'low', kind: 'low', min: { x: 1.6, y: 0, z: 1.6 }, max: { x: 2.4, y: 0.72, z: 2.4 } });
    expect(shotGeometry(field, from, to, 5)).toMatchObject({ visible: true, cover: true });
    expect(pathsFrom(field, from, 4, []).has('4:2')).toBe(false);
    field.solids[0].max.y = 2.1;
    expect(shotGeometry(field, from, to, 5)).toMatchObject({ visible: false, blocker: 'low' });
    expect(segmentIntersectsBox({ x: 2, y: 3, z: 0 }, { x: 2, y: 3, z: 4 }, field.solids[0])).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 1, z: 2 }, { x: 4, y: 1, z: 2 }, field.solids[0])).toBe(true);
    const high = { ...field, solids: [], heights: Array(25).fill(0) };
    high.heights[2 * 5 + 1] = 1;
    expect(pathsFrom(high, from, 1, []).has('1:2')).toBe(false);
    for (const mission of MISSIONS) {
      const geometry = makeField(mission.id, 85);
      for (const point of [{ x: 1, z: 2 }, { x: 1, z: 6 }, { x: 3, z: 6 }, { x: 0, z: 3 }, { x: 6, z: 2 }, { x: 7, z: 4 }, { x: 7, z: 1 }, { x: 8, z: 5 }]) {
        expect(walkable(geometry, point), `${mission.id} spawn ${JSON.stringify(point)}`).toBe(true);
      }
    }
  });
  test('经济先扣成本，拒绝装备、修复、奖励、升级与阶段复制', () => {
    const session = new GameSession(definition, 85);
    const initial = session.serialize();
    expect(() => session.dispatch({ type: 'repair', pilot: 'shen' })).toThrow(AgentValidationError);
    expect(() => session.dispatch({ type: 'debrief' })).toThrow(AgentValidationError);
    expect(() => session.dispatch({ type: 'learn', pilot: 'shen', skill: 'vigil' })).toThrow(AgentValidationError);
    expect(() => session.dispatch({ type: 'equip', pilot: 'shen', gear: 'lance' })).toThrow(AgentValidationError);
    expect(session.serialize()).toBe(initial);
    session.dispatch({ type: 'build', gear: 'lance' });
    const afterBuild = session.serialize();
    expect(session.state.inventory.scrap).toBe(4);
    expect(session.state.inventory.kit).toBe(5);
    expect(() => session.dispatch({ type: 'build', gear: 'lance' })).toThrow(AgentValidationError);
    expect(session.serialize()).toBe(afterBuild);
    session.dispatch({ type: 'equip', pilot: 'shen', gear: 'lance' });
    expect(() => session.dispatch({ type: 'equip', pilot: 'luo', gear: 'lance' })).toThrow(AgentValidationError);
    session.dispatch({ type: 'equip', pilot: 'shen', gear: 'standard' });
    session.dispatch({ type: 'equip', pilot: 'luo', gear: 'lance' });
    session.dispatch({ type: 'visit', location: 'kiln' });
    session.dispatch({ type: 'choice', scene: 'mercy', choice: 'share' });
    session.dispatch({ type: 'build', gear: 'relay' });
    session.dispatch({ type: 'equip', pilot: 'shen', gear: 'relay' });
    expect(() => session.dispatch({ type: 'equip', pilot: 'luo', gear: 'relay' })).toThrow();
    session.dispatch({ type: 'unmount', pilot: 'shen' });
    expect(() => session.dispatch({ type: 'unmount', pilot: 'shen' })).toThrow();
    session.dispatch({ type: 'equip', pilot: 'luo', gear: 'relay' });
    expect(session.state.pilots.shen.perk).toBeNull();
    expect(session.state.pilots.luo.perk).toBe('relay');
    session.dispatch({ type: 'deploy', mission: 'rain', route: 'main' });
    expect(() => session.dispatch({ type: 'build', gear: 'reactor' })).toThrow(AgentValidationError);
    expect(() => session.dispatch({ type: 'player', option: 'guard' })).toThrow(AgentValidationError);
    expect(() => parseCommand({ type: 'fabricate', reward: 100 })).toThrow(AgentValidationError);
    const bag = createInventory(ITEMS);
    expect(() => exchangeInventory(bag, { spend: [{ item: 'scrap', amount: 1 }], gain: [{ item: 'scrap', amount: 2 }] })).toThrow();
  });
  test('热量、行动顺序、坐标锁定与过期计划都由引擎裁定', () => {
    const s = new GameSession(definition, 85);
    s.dispatch({ type: 'deploy', mission: 'rain', route: 'main' });
    const planned = fixturePlan(observation(s.state, 'enemy'), 'aggressive');
    const collision = structuredClone(planned);
    collision.orders.forEach(order => { order.option = 'move:6:3'; });
    expect(() => validatePlan(s.state, collision)).toThrow('同一落点');
    const preview = s.preview({ type: 'agent', plan: planned });
    expect(s.state.battle!.stage).toBe('forecast');
    expect(preview.battle!.stage).toBe('player');
    s.dispatch({ type: 'agent', plan: planned });
    expect(() => s.dispatch({ type: 'agent', plan: planned })).toThrow();
    const beforeHull = s.state.battle!.units.find(u => u.id === 'shen')!.hull;
    const move = actionsFor(s.state, 'shen').find(a => a.to && a.to.x === 0 && a.to.z === 2)!;
    expect(move).toBeTruthy();
    s.dispatch({ type: 'player', option: move.id });
    s.dispatch({ type: 'player', option: 'vent' });
    expect(() => s.dispatch({ type: 'player', option: 'guard' })).toThrow();
    s.dispatch({ type: 'agent', plan: fixturePlan(observation(s.state, 'ally'), 'wait') });
    expect(s.state.battle!.units.find(u => u.id === 'shen')!.hull).toBe(beforeHull);
    expect(s.state.battle!.history.some(line => line.includes('落空'))).toBe(true);
    expect(s.state.battle!.units.find(u => u.id === 'shen')!.ap).toBe(2);
    const hot = structuredClone(s.state);
    const lead = hot.battle!.units.find(u => u.id === 'shen')!;
    lead.heat = lead.maxHeat;
    expect(actionsFor(hot, 'shen').some(a => a.damage > 0 || a.kind === 'move')).toBe(false);
    expect(actionsFor(hot, 'shen').some(a => a.kind === 'vent')).toBe(true);
    const wrongRound = { ...fixturePlan(observation(s.state, 'enemy')), round: 1 };
    expect(() => validatePlan(s.state, wrongRound)).toThrow('轮次');
    expect(() => parsePlan({ ...planned, orders: [...planned.orders, planned.orders[0]], code: 'run()' })).toThrow();
    const repeated = { ...fixturePlan(observation(s.state, 'enemy')) };
    repeated.orders[1] = repeated.orders[0];
    expect(() => validatePlan(s.state, repeated)).toThrow('每台');
  });
  test('代理知识隔离、不同职责与原生烟测契约不含界面依赖', () => {
    const opening = reduce(create(85), { type: 'deploy', mission: 'rain', route: 'main' });
    const enemy = observation(opening, 'enemy');
    expect(enemy.timing).toContain('不知道队长未来');
    expect(JSON.stringify(enemy)).not.toContain('待分配技能');
    expect(enemy.actors[0].objective).not.toBe(enemy.actors[1].objective);
    expect(enemy.actors[0].options.length).toBeGreaterThan(4);
    expect(enemy.publicForecast).toEqual([]);
    const request = requestFor(opening, 'enemy');
    expect(request.tool.parameters.additionalProperties).toBe(false);
    expect(JSON.stringify(request.observation).length).toBeLessThan(48_000);
    const smoke = smokeCase();
    smoke.verify(fixturePlan(enemy));
    const allyState = reduce(opening, { type: 'agent', plan: fixturePlan(enemy) });
    const ally = observation(allyState, 'ally');
    expect(ally.actors[0].objective).toContain('罗烬');
    expect(ally.publicForecast).toHaveLength(2);
    expect(fixturePlan(enemy, 'wait').orders).not.toEqual(fixturePlan(enemy, 'aggressive').orders);
  });
  test('完整合法战役在三百指令内赢得三种结局，回放原子验证', () => {
    const campaign = simulateCampaign();
    expect(campaign.state.phase).toBe('resolution');
    expect(campaign.state.completed).toHaveLength(6);
    expect(campaign.state.quests).toHaveLength(13);
    expect(campaign.state.pilots.ye.recruited).toBe(true);
    expect(campaign.state.pilots.shen.skills).toHaveLength(3);
    expect(campaign.moveCount).toBeLessThan(300);
    const recorded = campaign.serialize(), restored = new GameSession(definition, 1);
    restored.restore(recorded);
    expect(restored.state).toEqual(campaign.state);
    for (const ending of ENDING_IDS) {
      expect(endingAvailable(restored.state, ending)).toBe(true);
      restored.dispatch({ type: 'ending', ending });
      expect(restored.state.ending).toBe(ending);
      expect(() => restored.dispatch({ type: 'debrief' })).toThrow();
      restored.restore(recorded);
    }
    const valid = restored.serialize(), revision = restored.revision;
    const bad = JSON.parse(recorded);
    bad.commands.push({ type: 'debrief' });
    expect(() => restored.restore(JSON.stringify(bad))).toThrow();
    expect(restored.serialize()).toBe(valid);
    expect(restored.revision).toBe(revision);
    restored.reset();
    expect(restored.revision).toBeGreaterThan(revision);
    expect(endingAvailable(restored.state, 'choir')).toBe(false);
  });
  test('真实失败、一次性救援与债务偿还，不奖励失败任务', () => {
    const session = new GameSession(definition, 85);
    session.dispatch({ type: 'build', gear: 'lance' });
    session.dispatch({ type: 'fabricate' });
    expect(session.state.inventory.scrap).toBe(2);
    session.dispatch({ type: 'deploy', mission: 'rain', route: 'main' });
    for (let i = 0; i < 12 && session.state.phase === 'battle'; i++) {
      session.dispatch({ type: 'agent', plan: fixturePlan(observation(session.state, 'enemy'), 'aggressive') });
      session.dispatch({ type: 'player', option: 'vent' });
      session.dispatch({ type: 'player', option: 'vent' });
      session.dispatch({ type: 'agent', plan: fixturePlan(observation(session.state, 'ally'), 'wait') });
    }
    expect(session.state.phase).toBe('defeat');
    expect(session.state.pilots.shen.damage).toBe(pilotStats(session.state.pilots.shen).maxHull);
    expect(session.state.pilots.shen.xp).toBe(0);
    expect(session.state.completed).toHaveLength(0);
    expect(session.state.inventory.scrap).toBe(2);
    session.dispatch({ type: 'recover', payment: 'debt' });
    expect(session.state.debt).toBe(4);
    expect(() => session.dispatch({ type: 'recover', payment: 'debt' })).toThrow();
    session.dispatch({ type: 'equip', pilot: 'shen', gear: 'lance' });
    session.dispatch({ type: 'deploy', mission: 'rain', route: 'main' });
    let steps = 0;
    while (session.state.phase === 'battle' && steps++ < 60) {
      const s = session.state;
      if (s.battle!.stage === 'forecast') session.dispatch({ type: 'agent', plan: fixturePlan(observation(s, 'enemy')) });
      else if (s.battle!.units.find(u => u.id === s.lead)!.ap > 0) session.dispatch({ type: 'player', option: legalPlayer(s) });
      else session.dispatch({ type: 'agent', plan: fixturePlan(observation(s, 'ally')) });
    }
    expect(session.state.phase).toBe('debrief');
    session.dispatch({ type: 'debrief' });
    expect(session.state.inventory.scrap).toBe(4);
    expect(session.state.debt).toBe(0);
    expect(session.state.pilots.shen.xp).toBe(10);
  });
});

test.describe('铁穹回声 · 评审回归', () => {
  for (const cancelled of [true, false]) {
    test(`锁定射击：${cancelled ? '前机已击毁目标则免费取消' : '存活目标移动后仍支付落空成本'}`, () => {
      const opening = reduce(create(85), { type: 'deploy', mission: 'rain', route: 'main' });
      const b = opening.battle!;
      const leader = b.units.find(u => u.id === 'shen')!;
      const ally = b.units.find(u => u.id === 'luo')!;
      const first = b.units.find(u => u.id === 'e0')!;
      const second = b.units.find(u => u.id === 'e1')!;
      leader.hull = 1; leader.shield = 0;
      ally.hull = 1; ally.shield = 0; ally.position = { x: 3, z: 3 };
      first.position = { x: 5, z: 3 };
      second.position = { x: 6, z: 3 };
      // The final attacker ends combat before round regeneration can hide an erroneous cost.
      b.units.push({ ...structuredClone(second), id: 'e2', name: '逐迹者丙', position: { x: 4, z: 3 } });
      const enemyPlan: Plan = {
        round: 1, side: 'enemy', intention: '依次执行已公开的坐标射击。',
        orders: [
          { unit: 'e0', option: 'fire:luo', intention: '第一机锁定纸隼当前坐标。' },
          { unit: 'e1', option: 'burst:luo', intention: '第二机锁定同一目标，不得追踪后续移动。' },
          { unit: 'e2', option: 'fire:shen', intention: '末机攻击仍在原位的队长。' },
        ],
      };
      const snapshot = structuredClone(opening);
      const locked = reduce(opening, { type: 'agent', plan: enemyPlan });
      expect(opening).toEqual(snapshot);
      const reserved = locked.battle!.forecasts.find(f => f.unit === second.id)!.action;
      const before = structuredClone(locked);
      const command: Command = {
        type: 'agent',
        plan: {
          round: 1, side: 'ally', intention: cancelled ? '纸隼留在原位排热。' : '纸隼离开锁定坐标。',
          orders: [{ unit: 'luo', option: cancelled ? 'vent' : 'move:2:3', intention: '执行公开的单一协同行动。' }],
        },
      };
      const commandSnapshot = structuredClone(command);
      const result = reduce(locked, command);
      const after = result.battle!.units.find(u => u.id === second.id)!;
      expect(result.phase).toBe('defeat');
      expect(result.battle!.round).toBe(1);
      expect(locked).toEqual(before);
      expect(command).toEqual(commandSnapshot);
      expect(result.inventory).toEqual(before.inventory);
      expect(result.completed).toEqual(before.completed);
      expect(after.ap).toBe(second.ap - (cancelled ? 0 : reserved.ap));
      expect(after.energy).toBe(second.energy - (cancelled ? 0 : reserved.energy));
      expect(after.heat).toBe(second.heat + (cancelled ? 0 : reserved.heat));
      const resolvedAlly = result.battle!.units.find(u => u.id === ally.id)!;
      expect(resolvedAlly.hull).toBe(cancelled ? 0 : ally.hull);
      expect(result.battle!.history).toContain(cancelled
        ? `${second.name}的前置条件因更早行动改变，取消该动作，不消耗资源。`
        : `${second.name}按预告射向旧坐标，目标已脱离；弹道落空。`);
    });
  }
  for (const [weapon, heat] of [['standard', 4], ['pulse', 3], ['lance', 5]] as const) {
    test(`远针继承 ${weapon} 武器热修正，热量 ${heat} 且资源边界纯净`, () => {
      const loadout = create(85);
      loadout.pilots.luo.weapon = weapon;
      const deployed = reduce(reduce(loadout, { type: 'lead', pilot: 'luo' }), { type: 'deploy', mission: 'rain', route: 'main' });
      const ready = reduce(deployed, { type: 'agent', plan: fixturePlan(observation(deployed, 'enemy'), 'wait') });
      const shooter = ready.battle!.units.find(u => u.id === 'luo')!;
      shooter.heat = shooter.maxHeat - heat; shooter.energy = 3; shooter.ap = 1;
      const command: Command = { type: 'player', option: 'snipe:e0' };
      const before = structuredClone(ready);
      const action = actionsFor(ready, 'luo').find(a => a.id === command.option);
      expect(action).toMatchObject({ kind: 'snipe', ap: 1, energy: 3, heat });
      const result = reduce(ready, command);
      expect(result.battle!.units.find(u => u.id === 'luo')).toMatchObject({ ap: 0, energy: 0, heat: shooter.maxHeat });
      expect(result.inventory).toEqual(before.inventory);
      expect(ready).toEqual(before);
      for (const resource of ['heat', 'energy', 'ap'] as const) {
        const invalid = structuredClone(ready);
        const actor = invalid.battle!.units.find(u => u.id === 'luo')!;
        actor[resource] += resource === 'heat' ? 1 : -1;
        const unchanged = structuredClone(invalid);
        expect(actionsFor(invalid, 'luo').some(a => a.id === command.option)).toBe(false);
        expect(() => reduce(invalid, command)).toThrow(AgentValidationError);
        expect(invalid).toEqual(unchanged);
      }
    });
  }
  test('过量伤害按命中前剩余结构截断，预览、状态与日志一致', () => {
    for (const scenario of [
      { hull: 1, shield: 0, guard: false, option: 'burst:e0', removed: 1, absorbed: 0 },
      { hull: 2, shield: 2, guard: true, option: 'burst:e0', removed: 2, absorbed: 2 },
      { hull: 4, shield: 3, guard: true, option: 'fire:e0', removed: 0, absorbed: 2 },
    ]) {
      const deployed = reduce(create(85), { type: 'deploy', mission: 'rain', route: 'main' });
      const ready = reduce(deployed, { type: 'agent', plan: fixturePlan(observation(deployed, 'enemy'), 'wait') });
      const target = ready.battle!.units.find(u => u.id === 'e0')!;
      target.hull = scenario.hull; target.shield = scenario.shield; target.guard = scenario.guard;
      const before = structuredClone(ready);
      const action = actionsFor(ready, 'shen').find(a => a.id === scenario.option)!;
      const preview = damagePreview(ready, action);
      expect(preview).toEqual({ hull: scenario.removed, shield: scenario.absorbed });
      const result = reduce(ready, { type: 'player', option: action.id });
      const damaged = result.battle!.units.find(u => u.id === target.id)!;
      expect(target.hull - damaged.hull).toBe(preview.hull);
      expect(target.shield - damaged.shield).toBe(preview.shield);
      expect(result.battle!.history.at(-1)).toBe(
        `砧鹭 → ${target.name}：护盾 −${preview.shield}，结构 −${preview.hull}${action.cover ? '（低掩体减伤三）' : ''}。`,
      );
      expect(result.battle!.units.find(u => u.id === 'shen')).toMatchObject({
        ap: 2 - action.ap, energy: 8 - action.energy, heat: action.heat,
      });
      expect(result.inventory).toEqual(before.inventory);
      expect(ready).toEqual(before);
    }
  });
});

const root = (page: Page) => page.locator('.project-iron-choir');
const dock = (page: Page) => root(page).locator('[data-dock]');
async function closeDialog(page: Page) { await page.locator('dialog[open] .workspace-dialog-heading button').click(); }
async function visitChoice(page: Page, location: string, choice: string) {
  await dock(page).getByRole('button', { name: '世界航图', exact: true }).click();
  await page.locator(`[data-visit="${location}"]`).click();
  await dock(page).getByRole('button', { name: /^交谈/ }).click();
  await page.locator('dialog[open]').getByRole('button', { name: choice, exact: true }).click();
  await closeDialog(page);
}
async function work(page: Page, command: Command) {
  await page.locator('dialog[open]').locator(`[data-command=${JSON.stringify(JSON.stringify(command))}]`).click();
}
async function prepareUI(page: Page, after: number) {
  if (after === 0) await visitChoice(page, 'kiln', '把电池留给街区');
  if (after === 1) await visitChoice(page, 'archive', '公开原稿，承认未获续期');
  if (after === 2) await visitChoice(page, 'barracks', '由居民审查，每季重新授权');
  if (after === 3) await visitChoice(page, 'cistern', '让街区安静一夜');
  if (after === 4) await visitChoice(page, 'garden', '记录日常，不按战果排序');
  await dock(page).getByRole('button', { name: '整备机库', exact: true }).click();
  await page.locator('[data-pilot="shen"]').click();
  if (after === 0) {
    await work(page, { type: 'build', gear: 'lance' });
    await page.locator('select[data-equip="shen"]').nth(0).selectOption('lance');
    await work(page, { type: 'build', gear: 'relay' });
    await page.locator('select[data-equip="shen"]').nth(2).selectOption('relay');
  }
  if (after === 1) {
    await work(page, { type: 'build', gear: 'reactor' });
    await page.locator('select[data-equip="shen"]').nth(1).selectOption('reactor');
  }
  if (after > 0) for (const id of PILOT_IDS) {
    await page.locator(`[data-pilot="${id}"]`).click();
    const repair = page.locator('dialog[open]').getByRole('button', { name: '修复机体 · 一修复匣', exact: true });
    if (await repair.isEnabled()) await repair.click();
    for (const name of ['学习折线校准', '学习冷流回路', '学习守夜姿态']) {
      const skill = page.locator('dialog[open]').getByRole('button', { name, exact: true });
      if (await skill.count() && await skill.isEnabled()) await skill.click();
    }
  }
  await closeDialog(page);
}
async function chooseUIAction(page: Page): Promise<string> {
  const options = await dock(page).locator('[data-action] option').evaluateAll(options => options.map(option => ({
    id: (option as HTMLOptionElement).value, text: option.textContent ?? '',
  })));
  const link = options.find(o => o.id === 'link');
  if (link) return link.id;
  const fire = options.find(o => o.id.startsWith('fire:'));
  if (fire) return fire.id;
  const enemies = await dock(page).locator('[data-unit^="e"]').evaluateAll(nodes => nodes.some(node => Number((node as HTMLElement).dataset.hull) > 0));
  const mission = await root(page).getAttribute('data-mission');
  if (!enemies && (mission === 'water' || mission === 'bridge')) return 'guard';
  const moves = options.filter(o => o.id.startsWith('move:')).sort((a, b) => {
    const [, ax, az] = a.id.split(':').map(Number), [, bx, bz] = b.id.split(':').map(Number);
    return Math.hypot(ax - 4, az - 3) - Math.hypot(bx - 4, bz - 3);
  });
  return moves[0]?.id ?? 'vent';
}
async function playMissionUI(page: Page) {
  await dock(page).locator('[data-deploy]').click();
  let actions = 0;
  while (await root(page).getAttribute('data-phase') === 'battle' && actions++ < 80) {
    const request = dock(page).getByRole('button', { name: '截获守机意图', exact: true });
    if (await request.count()) {
      await request.click();
      await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
      await expect(dock(page).locator('[data-action]')).toBeVisible();
    } else {
      const execute = dock(page).locator('[data-execute]');
      if (await execute.isEnabled()) {
        await dock(page).locator('[data-action]').selectOption(await chooseUIAction(page));
        await execute.click();
      } else {
        await dock(page).locator('[data-advance]').click();
        await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
      }
    }
  }
  await expect(root(page)).toHaveAttribute('data-phase', 'debrief');
  await dock(page).getByRole('button', { name: '核对战利品并归库', exact: true }).click();
}
async function readReplay(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('odd-index:game:iron-choir:v1');
    return raw ? JSON.parse(raw) as string : '';
  });
}

test.describe('铁穹回声 · 原生客户端与完整界面', () => {
  test('完整六战胜利、制造配装、修复升级、十三任务、存档与三个已赢得结局', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const calls = await installAgentFixture(page, fixture);
    await page.goto('./projects/iron-choir/');
    await expect(root(page)).toHaveAttribute('data-phase', 'hangar');
    expect(calls).toHaveLength(0);
    for (let mission = 0; mission < 6; mission++) {
      await prepareUI(page, mission);
      await playMissionUI(page);
    }
    await expect(root(page)).toHaveAttribute('data-phase', 'resolution');
    expect(Number(await root(page).getAttribute('data-moves'))).toBeLessThan(300);
    const resolution = await readReplay(page);
    await dock(page).getByRole('button', { name: '签署「共同执笔」', exact: true }).click();
    await expect(dock(page).locator('[data-ending]')).toHaveText('共同执笔');
    await root(page).locator('.ic-header').getByRole('button', { name: '战记', exact: true }).click();
    await expect(page.locator('dialog[open] [data-quest][data-complete="true"]')).toHaveCount(13);
    await page.getByRole('button', { name: '存档与回放', exact: true }).click();
    for (const title of ['归还寂静', '有限守夜']) {
      await page.locator('[data-game-import]').setInputFiles({ name: 'iron-choir-earned-resolution.json', mimeType: 'application/json', buffer: Buffer.from(resolution) });
      await expect(root(page)).toHaveAttribute('data-phase', 'resolution');
      await closeDialog(page);
      await dock(page).getByRole('button', { name: `签署「${title}」`, exact: true }).click();
      await expect(dock(page).locator('[data-ending]')).toHaveText(title);
      if (title === '归还寂静') {
        await root(page).locator('.ic-header').getByRole('button', { name: '战记', exact: true }).click();
        await page.getByRole('button', { name: '存档与回放', exact: true }).click();
      }
    }
    const beforeReload = calls.length;
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-phase', 'ended');
    expect(calls.length).toBe(beforeReload);
    expect(calls.some(c => c.observation.side === 'enemy')).toBe(true);
    expect(calls.some(c => c.observation.side === 'ally')).toBe(true);
    expect(calls.every(c => c.tool === 'iron_choir_orders')).toBe(true);
    expect(errors).toEqual([]);
  });
  test('主控真实失能后无战利品，支付救援与重新开始都可操作', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => fixturePlan(turn.observation as Observation, turn.observation.side === 'enemy' ? 'aggressive' : 'wait'));
    await page.goto('./projects/iron-choir/');
    await dock(page).locator('[data-deploy]').click();
    for (let round = 0; round < 10 && await root(page).getAttribute('data-phase') === 'battle'; round++) {
      await dock(page).getByRole('button', { name: '截获守机意图', exact: true }).click();
      await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
      for (let i = 0; i < 2; i++) {
        await dock(page).locator('[data-action]').selectOption('vent');
        await dock(page).locator('[data-execute]').click();
      }
      await dock(page).getByRole('button', { name: '协同并结算', exact: true }).click();
      await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    }
    await expect(root(page)).toHaveAttribute('data-phase', 'defeat');
    await expect(dock(page)).toContainText('无战利品');
    await dock(page).getByRole('button', { name: '支付三废料，救援归库', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-phase', 'hangar');
    const replay = new GameSession(definition);
    replay.restore(await readReplay(page));
    expect(replay.state.completed).toHaveLength(0);
    expect(replay.state.inventory.scrap).toBe(5);
    expect(replay.state.pilots.shen.xp).toBe(0);
    expect(replay.state.failures).toBe(1);
    expect(calls.length).toBeGreaterThan(2);
    await root(page).getByRole('button', { name: '重启', exact: true }).click();
    await page.getByRole('button', { name: '确认重新开始', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-moves', '0');
  });
  test('两次畸形计划与网络失败不改变轮次、库存或回放', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => ({ ...fixture(turn), round: 99 }));
    await page.goto('./projects/iron-choir/');
    await dock(page).locator('[data-deploy]').click();
    const before = await readReplay(page);
    await dock(page).locator('[data-advance]').click();
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    expect(calls).toHaveLength(2);
    expect(await readReplay(page)).toBe(before);
    await expect(root(page).locator('[data-console]')).toHaveAttribute('data-agent-error', 'true');
    await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"fixture unavailable"}}' }));
    await dock(page).locator('[data-advance]').click();
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    expect(await readReplay(page)).toBe(before);
    await expect(root(page).locator('[data-agent-status]')).toContainText('503');
  });
  test('原生导出保留合法指令，畸形导入原子拒绝且不请求模型', async ({ page }) => {
    const calls = await installAgentFixture(page, fixture);
    await page.goto('./projects/iron-choir/');
    await dock(page).locator('[data-deploy]').click();
    await dock(page).locator('[data-advance]').click();
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    const original = await readReplay(page);
    await root(page).locator('.ic-header').getByRole('button', { name: '战记', exact: true }).click();
    await page.getByRole('button', { name: '存档与回放', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.locator('[data-game-export]').click();
    const download = await downloading;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe(original);
    const corrupted = JSON.parse(original);
    corrupted.commands.push({ type: 'debrief' });
    await page.locator('[data-game-import]').setInputFiles({ name: 'rejected-replay.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupted)) });
    await expect(page.locator('[data-game-save-status]')).toContainText(/拒绝|无法导入/);
    expect(await readReplay(page)).toBe(original);
    expect(calls).toHaveLength(1);
    await page.locator('[data-game-import]').setInputFiles({ name: 'accepted-replay.json', mimeType: 'application/json', buffer: Buffer.from(original) });
    await expect(page.locator('[data-game-save-status]')).toContainText(/已导入|导入成功/);
    expect(await readReplay(page)).toBe(original);
    expect(calls).toHaveLength(1);
  });
  test('镜头不取消请求，重启取消并丢弃迟到计划，模型文本按文本显示', async ({ page }) => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const calls = await installAgentFixture(page, async turn => {
      if (turn.index === 0) await gate;
      const plan = fixture(turn);
      plan.intention = '守住终端 <img src=x onerror="window.attack=1">';
      return plan;
    });
    await page.goto('./projects/iron-choir/');
    await dock(page).locator('[data-deploy]').click();
    await dock(page).locator('[data-advance]').click();
    await expect.poll(() => calls.length).toBe(1);
    const moves = await root(page).getAttribute('data-moves');
    await root(page).locator('[data-camera="top"]').click();
    await expect(root(page)).toHaveAttribute('data-moves', moves!);
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'true');
    await root(page).getByRole('button', { name: '重启', exact: true }).click();
    await page.getByRole('button', { name: '确认重新开始', exact: true }).click();
    release!();
    await expect(root(page)).toHaveAttribute('data-moves', '0');
    await dock(page).locator('[data-deploy]').click();
    await dock(page).locator('[data-advance]').click();
    await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
    await expect(root(page).locator('[data-agent-status]')).toContainText('<img');
    await expect(root(page).locator('[data-agent-status] img')).toHaveCount(0);
    expect((await readReplay(page)).includes('window.attack')).toBe(true);
  });
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 }]) {
    test(`中文工作区 ${size.width}×${size.height}：无文档滚动、键盘与战术替代`, async ({ page }) => {
      await page.setViewportSize(size);
      const calls = await installAgentFixture(page, fixture);
      await page.goto('./projects/iron-choir/');
      await expect(root(page).getByRole('heading', { level: 1, name: '铁穹回声' })).toBeVisible();
      await expect(root(page)).toHaveAttribute('data-workspace', 'true');
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        innerWidth, innerHeight,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.innerWidth + 1);
      expect(dimensions.height).toBeLessThanOrEqual(dimensions.innerHeight + 1);
      await expect(root(page).locator('[data-agent-connect]')).toBeVisible();
      await expect(root(page).locator('[data-agent-connect]')).toHaveText('模型');
      expect(await root(page).locator('[data-agent-status]').evaluate(node => getComputedStyle(node).whiteSpace)).toBe('normal');
      await page.screenshot({ path: test.info().outputPath('hangar.png') });
      const deployBounds = await dock(page).locator('[data-deploy]').boundingBox();
      const dockBounds = await dock(page).boundingBox();
      expect(deployBounds!.y + deployBounds!.height).toBeLessThanOrEqual(dockBounds!.y + dockBounds!.height + 1);
      await dock(page).locator('[data-deploy]').click();
      const canvas = root(page).locator('canvas');
      await canvas.focus();
      await page.keyboard.press('Space');
      await expect(root(page)).toHaveAttribute('data-agent-busy', 'false');
      expect(calls.length).toBe(1);
      const executeBounds = await dock(page).locator('[data-execute]').boundingBox();
      const liveDockBounds = await dock(page).boundingBox();
      expect(executeBounds!.y + executeBounds!.height).toBeLessThanOrEqual(liveDockBounds!.y + liveDockBounds!.height + 1);
      await page.screenshot({ path: test.info().outputPath('battle.png') });
      const saved = await readReplay(page);
      await root(page).getByRole('button', { name: '战术表', exact: true }).click();
      await page.locator('[data-coordinate="x"]').selectOption('2');
      await page.locator('[data-coordinate="z"]').selectOption('2');
      await page.getByRole('button', { name: '选中格点', exact: true }).click();
      await page.keyboard.press('g');
      expect(await readReplay(page)).toBe(saved);
      await page.getByRole('button', { name: '采用格点并返回战场', exact: true }).click();
      await page.keyboard.press('Enter');
      expect(await readReplay(page)).not.toBe(saved);
      const moved = new GameSession(definition);
      moved.restore(await readReplay(page));
      expect(moved.state.battle!.units.find(u => u.id === 'shen')!.position).toEqual({ x: 2, z: 2 });
      await root(page).getByRole('button', { name: '指南', exact: true }).click();
      await expect(page.locator('dialog[open]')).toContainText('最多两次请求');
      const reading = await readReplay(page);
      await page.locator('dialog[open] .ic-dialog-body').focus();
      await page.keyboard.press('Space');
      expect(await readReplay(page)).toBe(reading);
      await closeDialog(page);
      await root(page).locator('[data-agent-connect]').click();
      await expect(page.locator('dialog[open] [data-agent-endpoint]')).toBeVisible();
      const contrast = await page.locator('dialog[open]').evaluate(node => {
        const style = getComputedStyle(node);
        return { ink: style.color, paper: style.getPropertyValue('--agent-paper').trim() };
      });
      expect(contrast).toEqual({ ink: 'rgb(226, 233, 233)', paper: '#142632' });
    });
  }
});
