import { requireRule } from '../../core/agents/errors';
import { integer } from '../../core/agents/schema';
import {
  classify, HOLD_TICKS, MAX_TICKS, WAVE_SIZE,
  type Difficulty, type Direction, type Parcel, type Plan,
} from './data';

export interface Input { tick: number; action: Direction | 'hold' }
export interface Outcome {
  id: string; tick: number; expected: Direction; actual: Direction | 'timeout'; correct: boolean;
}
export interface Carry { score: number; lives: number; combo: number; best: number; holds: number }
export interface Simulation extends Carry {
  tick: number;
  index: number;
  arrival: number;
  deadline: number;
  held: boolean;
  status: 'running' | 'cleared' | 'lost';
  batch: readonly Parcel[];
  rule: Plan['rule'];
  outcomes: readonly Outcome[];
}
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export function makeBatch(seed: number, wave: number, difficulty: Difficulty, plan: Plan): Parcel[] {
  const rng = random((seed ^ Math.imul(wave, 0x9e3779b9)) >>> 0);
  const pattern = plan.pattern === 'alternate' ? [0, 1, 0, 1, 0, 1]
    : plan.pattern === 'pairs' ? [0, 0, 1, 1, 0, 1] : [0, 1, 1, 0, 0, 1];
  const base = difficulty === 'calm' ? 64 : 50;
  const parcels = pattern.map((side, index): Parcel => {
    const expected = (side === 0) === (plan.first === 'day') ? 'day' : 'night';
    const parcel: Parcel = {
      id: `w${wave}-p${index + 1}`,
      symbol: (['sun', 'moon', 'star'] as const)[Math.floor(rng() * 3)],
      color: rng() < 0.5 ? 'orange' : 'blue',
      shape: (['bird', 'boat', 'kite'] as const)[Math.floor(rng() * 3)],
      stamps: (1 + Math.floor(rng() * 3)) as 1 | 2 | 3,
      window: wave === 1 && index === 0 ? 100
        : base + (plan.rhythm === 'quick' ? -8 : plan.rhythm === 'breathing' ? (index % 2 ? 10 : -4) : 0),
      gap: plan.rhythm === 'breathing' ? (index % 2 ? 12 : 8) : plan.rhythm === 'quick' ? 6 : 9,
    };
    if (plan.rule === 'sun') parcel.symbol = expected === 'day' ? 'sun' : (index % 2 ? 'moon' : 'star');
    if (plan.rule === 'orange') parcel.color = expected === 'day' ? 'orange' : 'blue';
    if (plan.rule === 'not-moon') parcel.symbol = expected === 'night' ? 'moon' : (index % 2 ? 'sun' : 'star');
    if (plan.rule === 'exact-two') parcel.stamps = expected === 'day' ? 2 : (index % 2 ? 1 : 3);
    if (plan.rule === 'two-plus') parcel.stamps = expected === 'night' ? 1 : (index % 2 ? 2 : 3);
    return parcel;
  });
  validateBatch(parcels, plan);
  return parcels;
}
export function validateBatch(batch: readonly Parcel[], plan: Plan): void {
  requireRule(batch.length === WAVE_SIZE && new Set(batch.map(p => p.id)).size === WAVE_SIZE, '每批必须有六个独立包裹。');
  let previous = '', run = 0, days = 0;
  for (const parcel of batch) {
    integer(parcel.window, '响应窗口', 42, 100);
    integer(parcel.gap, '传送间隔', 6, 12);
    const direction = classify(parcel, plan.rule);
    days += Number(direction === 'day');
    run = direction === previous ? run + 1 : 1;
    requireRule(run <= 2, '同一方向不能连续超过两件。');
    previous = direction;
  }
  requireRule(days === 3, '白昼与黑夜必须各有三件。');
}
export function createSimulation(batch: readonly Parcel[], rule: Plan['rule'], carry: Carry): Simulation {
  requireRule(batch.length === WAVE_SIZE, '缺少完整批次。');
  return {
    ...carry, batch, rule, tick: 0, index: 0, arrival: 8,
    deadline: 8 + batch[0].window, held: false, status: 'running', outcomes: [],
  };
}
export function activeParcel(s: Simulation): Parcel | undefined {
  return s.status === 'running' && s.tick >= s.arrival && s.tick < s.deadline ? s.batch[s.index] : undefined;
}
export function accepts(s: Simulation, action: Input['action']): boolean {
  const tick = s.tick + 1;
  return s.status === 'running' && tick >= s.arrival && tick < s.deadline &&
    (action !== 'hold' || (s.holds > 0 && !s.held));
}
function resolve(s: Simulation, actual: Outcome['actual']): Simulation {
  const parcel = s.batch[s.index], expected = classify(parcel, s.rule);
  const correct = expected === actual;
  const combo = correct ? s.combo + 1 : 0;
  const lives = s.lives - Number(!correct);
  const index = s.index + 1;
  const arrival = s.tick + (s.batch[index]?.gap ?? 0);
  return {
    ...s, index, arrival, deadline: arrival + (s.batch[index]?.window ?? 0), held: false,
    lives, combo, best: Math.max(s.best, combo),
    score: s.score + (correct ? 100 + Math.min(combo, 10) * 10 : 0),
    status: lives <= 0 ? 'lost' : index === s.batch.length ? 'cleared' : 'running',
    outcomes: [...s.outcomes, { id: parcel.id, tick: s.tick, expected, actual, correct }],
  };
}
/** A step owns the next tick. The action window is [arrival, deadline); expiry runs at deadline. */
export function step(s: Simulation, input?: Input): Simulation {
  requireRule(s.status === 'running', '结束后不能继续走时。');
  const tick = s.tick + 1;
  requireRule(tick <= MAX_TICKS, '局程超出时间边界。');
  if (input) {
    integer(input.tick, '输入时刻', 1, MAX_TICKS);
    requireRule(input.tick === tick, '输入必须属于下一个固定时刻。');
    requireRule(accepts(s, input.action), '输入不在响应窗口内，或暂存额度不足。');
  }
  let next: Simulation = { ...s, tick };
  if (input?.action === 'hold') next = { ...next, holds: s.holds - 1, deadline: s.deadline + HOLD_TICKS, held: true };
  else if (input) next = resolve(next, input.action);
  else if (tick >= next.deadline) next = resolve(next, 'timeout');
  return next;
}
export function replayWave(initial: Simulation, inputs: readonly Input[], endTick: number): Simulation {
  integer(endTick, '结束时刻', 1, MAX_TICKS);
  let previous = 0;
  for (const input of inputs) {
    integer(input.tick, '输入时刻', 1, endTick);
    requireRule(input.tick > previous, '每个时刻最多一次输入，时间必须严格递增。');
    previous = input.tick;
  }
  let simulation = initial, cursor = 0;
  while (simulation.tick < endTick) {
    const input = inputs[cursor]?.tick === simulation.tick + 1 ? inputs[cursor++] : undefined;
    simulation = step(simulation, input);
  }
  requireRule(cursor === inputs.length && simulation.status !== 'running', '必须保存整局已结束的真实输入轨迹。');
  return simulation;
}
