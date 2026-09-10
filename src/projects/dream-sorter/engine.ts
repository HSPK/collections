import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import {
  DIFFICULTIES, DIRECTIONS, MAX_INPUTS, MAX_TICKS, PATTERNS, RHYTHMS, RULE_IDS, WAVE_COUNT,
  type Difficulty, type Parcel, type Plan, type RuleId,
} from './data';
import { createSimulation, makeBatch, replayWave, type Carry, type Input, type Outcome } from './simulation';

export interface WaveRecord { wave: number; plan: Plan; outcomes: readonly Outcome[]; ticks: number }
export interface State extends Carry {
  seed: number; wave: number; difficulty: Difficulty;
  phase: 'briefing' | 'ready' | 'between' | 'won' | 'lost';
  plan: Plan | null; batch: readonly Parcel[]; history: readonly WaveRecord[];
}
export type Command =
  | { type: 'difficulty'; difficulty: Difficulty }
  | { type: 'plan'; plan: Plan }
  | { type: 'finish'; inputs: Input[]; endTick: number };

export function parsePlan(value: unknown): Plan {
  const p = object(value, ['rule', 'rhythm', 'pattern', 'first'], '督导派件');
  return {
    rule: choice(p.rule, RULE_IDS, '规则'),
    rhythm: choice(p.rhythm, RHYTHMS, '节奏'),
    pattern: choice(p.pattern, PATTERNS, '顺序'),
    first: choice(p.first, DIRECTIONS, '起始方向'),
  };
}
export function parseInput(value: unknown): Input {
  const input = object(value, ['tick', 'action'], '分拣输入');
  return {
    tick: integer(input.tick, '输入时刻', 1, MAX_TICKS),
    action: choice(input.action, ['day', 'night', 'hold'] as const, '操作'),
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(value !== null && typeof value === 'object' && !Array.isArray(value), '操作必须是对象。');
  const type = choice((value as Record<string, unknown>).type, ['difficulty', 'plan', 'finish'] as const, '操作类型');
  if (type === 'difficulty') {
    const c = object(value, ['type', 'difficulty']);
    return { type, difficulty: choice(c.difficulty, DIFFICULTIES, '难度') };
  }
  if (type === 'plan') return { type, plan: parsePlan(object(value, ['type', 'plan']).plan) };
  const c = object(value, ['type', 'inputs', 'endTick']);
  return { type, inputs: array(c.inputs, parseInput, '输入轨迹', 0, MAX_INPUTS), endTick: integer(c.endTick, '结束时刻', 1, MAX_TICKS) };
}
export function create(seed: number): State {
  return { seed, wave: 0, difficulty: 'calm', phase: 'briefing', score: 0, lives: 3, combo: 0, best: 0, holds: 2, plan: null, batch: [], history: [] };
}
export function legalRules(s: State): RuleId[] {
  return (s.wave === 0 ? ['sun', 'orange'] as RuleId[] : [...RULE_IDS]).filter(rule => rule !== s.plan?.rule);
}
export function startWave(s: State) {
  requireRule(s.phase === 'ready' && s.plan !== null, '必须先领取有效的督导批次。');
  return createSimulation(s.batch, s.plan.rule, s);
}
export function reduce(s: State, command: Command): State {
  const c = parseCommand(command);
  if (c.type === 'difficulty') {
    requireRule(s.phase === 'briefing', '开班后不能更改难度。');
    return { ...s, difficulty: c.difficulty };
  }
  if (c.type === 'plan') {
    requireRule(s.phase === 'briefing' || s.phase === 'between', '只能在两班之间请求派件。');
    requireRule(s.wave < WAVE_COUNT && legalRules(s).includes(c.plan.rule), '请选择本班允许的新规则。');
    requireRule(!s.plan || c.plan.pattern !== s.plan.pattern || c.plan.first !== s.plan.first, '新班次必须改变编组或起始方向。');
    const wave = s.wave + 1;
    const batch = makeBatch(s.seed, wave, s.difficulty, c.plan);
    return { ...s, wave, phase: 'ready', plan: c.plan, batch };
  }
  const result = replayWave(startWave(s), c.inputs, c.endTick);
  return {
    ...s, score: result.score, lives: result.lives, combo: result.combo, best: result.best, holds: result.holds,
    phase: result.status === 'lost' ? 'lost' : s.wave === WAVE_COUNT ? 'won' : 'between',
    history: [...s.history, { wave: s.wave, plan: s.plan!, outcomes: result.outcomes, ticks: result.tick }],
  };
}
export function grade(s: Pick<State, 'score' | 'lives' | 'phase'>): string {
  return s.phase !== 'won' ? '未结业' : s.lives === 3 ? '金印分拣员' : s.lives === 2 ? '银印分拣员' : '铜印分拣员';
}
export function latestOutcome(s: State, live: { outcomes: readonly Outcome[] } | null): Outcome | undefined {
  if (live) return live.outcomes.at(-1);
  if (s.phase === 'between' || s.phase === 'won' || s.phase === 'lost') return s.history.at(-1)?.outcomes.at(-1);
  return undefined;
}
export const definition: GameDefinition<State, Command> = { id: 'dream-sorter', create, reduce, parseCommand };
