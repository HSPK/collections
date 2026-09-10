import { array, boolean, choice, integer, object, text } from '../../core/agents/schema';
import { requireRule } from '../../core/agents/errors';
import type { GameDefinition } from '../../core/games/session';
import { ARCHETYPES, CHAPTERS, FORMATIONS, MAX_TRACE, UPGRADES, WAVE_TICKS } from './data';
import type { Lane, Plan, Upgrade } from './data';
import { replay } from './simulation';
import type { Input, WaveStats } from './simulation';

export interface Summary extends WaveStats { score: number; lives: number; tick: number }
export interface State {
  phase: 'awaiting' | 'prepared' | 'upgrade' | 'won' | 'lost';
  wave: number; lives: number; score: number; plan: Plan | null; upgrades: Upgrade[]; history: Summary[];
}
export type Command = { type: 'plan'; plan: Plan } | { type: 'finish'; trace: Input[]; endTick: number } | { type: 'upgrade'; upgrade: Upgrade };
export function parsePlan(value: unknown): Plan {
  const p = object(value, ['formation', 'focus', 'spacing', 'archetype', 'feint', 'intention'], '墨影编排');
  const spacing = integer(p.spacing, '间距', 32, 36);
  requireRule(spacing === 32 || spacing === 36, '间距只能为32或36刻。');
  const intention = text(p.intention, '公开意图', 70);
  requireRule(/[\u3400-\u9fff]/u.test(intention) && !/https?:|www\.|[<>]/i.test(intention), '公开意图须为简短中文，不能包含网址或标记。');
  return {
    formation: choice(p.formation, FORMATIONS, '队形'), focus: integer(p.focus, '灯道', 0, 2) as Lane,
    spacing, archetype: choice(p.archetype, ARCHETYPES, '墨影'), feint: boolean(p.feint, '换巷'),
    intention,
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '指令必须包含类型。');
  const type = choice(value.type, ['plan', 'finish', 'upgrade'] as const, '指令');
  if (type === 'plan') {
    const c = object(value, ['type', 'plan']); return { type, plan: parsePlan(c.plan) };
  }
  if (type === 'upgrade') {
    const c = object(value, ['type', 'upgrade']); return { type, upgrade: choice(c.upgrade, UPGRADES, '折灯改造') };
  }
  const c = object(value, ['type', 'trace', 'endTick']);
  return {
    type, endTick: integer(c.endTick, '结束刻', 1, WAVE_TICKS),
    trace: array(c.trace, entry => {
      const i = object(entry, ['tick', 'lane', 'pulse'], '输入');
      return { tick: integer(i.tick, '输入刻', 1, WAVE_TICKS), lane: integer(i.lane, '灯道', 0, 2) as Lane, pulse: boolean(i.pulse, '闪光') };
    }, '输入记录', 0, MAX_TRACE),
  };
}
export function create(_seed: number): State {
  return { phase: 'awaiting', wave: 0, lives: 3, score: 0, plan: null, upgrades: [], history: [] };
}
export function reduce(state: State, command: Command): State {
  if (command.type === 'plan') {
    requireRule(state.phase === 'awaiting', '只可在等待编排时提交墨影。');
    return { ...state, phase: 'prepared', plan: parsePlan(command.plan) };
  }
  if (command.type === 'upgrade') {
    requireRule(state.phase === 'upgrade', '每更之间只能选择一次改造。');
    const upgrade = choice(command.upgrade, UPGRADES, '改造');
    return { ...state, phase: 'awaiting', wave: state.wave + 1, plan: null, upgrades: [...state.upgrades, upgrade] };
  }
  requireRule(state.phase === 'prepared' && state.plan !== null, '须先取得有效编排，再封存一更。');
  const round = replay(state.plan, state.wave, state.lives, state.upgrades, command.trace, command.endTick);
  return {
    ...state, phase: round.lives === 0 ? 'lost' : state.wave === CHAPTERS.length - 1 ? 'won' : 'upgrade',
    lives: round.lives, score: state.score + round.score,
    history: [...state.history, { ...round.stats, score: round.score, lives: round.lives, tick: round.tick }],
  };
}
export function medal(state: State): string {
  if (state.phase !== 'won') return state.phase === 'lost' ? '残星纪念' : '守夜进行中';
  const misses = state.history.reduce((sum, w) => sum + w.misses, 0);
  return state.lives === 3 && misses <= 5 ? '金灯 · 无缺黎明' : state.lives >= 2 ? '银灯 · 长街犹亮' : '星灯 · 把天守亮';
}
export const definition: GameDefinition<State, Command> = { id: 'paper-watch', create, reduce, parseCommand };
