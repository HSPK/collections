import { requireRule } from '../../core/agents/errors';
import { boolean, choice, integer, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { FORMATIONS, makeBoard, PACTS } from './data';
import type { Board, Pact, Plan, Shot } from './data';
import { simulate, solve } from './physics';
import type { Result } from './physics';

export type Phase = 'parley' | 'ready' | 'round-win' | 'victory' | 'lost';
export interface PublicShot extends Shot { round: number; pacts: Pact[]; banks: number }
export interface State {
  seed: number; round: number; phase: Phase; plan: Plan | null; board: Board | null;
  shots: number; specialUsed: boolean; captured: Pact[]; score: number; stars: number;
  history: PublicShot[]; last: Result | null; lastInput: Shot | null;
}
export type Command = { type: 'arrange'; round: number; plan: Plan } | { type: 'shot'; shot: Shot } | { type: 'advance' };
export function create(seed: number): State {
  integer(seed, '星图种子', 0, 0xffffffff);
  return { seed, round: 0, phase: 'parley', plan: null, board: null, shots: 3, specialUsed: false,
    captured: [], score: 0, stars: 0, history: [], last: null, lastInput: null };
}
export function parsePlan(value: unknown): Plan {
  const item = object(value, ['formation', 'defend', 'intent'], '使馆布阵');
  const intent = text(item.intent, '公开意图', 80);
  requireRule(/[\u3400-\u9fff]/.test(intent), '公开意图请用简短中文。');
  return { formation: choice(item.formation, FORMATIONS, '礼阵'), defend: choice(item.defend, PACTS, '守护契约'), intent };
}
export function parseShot(value: unknown): Shot {
  const item = object(value, ['angle', 'power', 'special'], '发射输入');
  return { angle: integer(item.angle, '角度', -70, 70), power: integer(item.power, '力度', 60, 100), special: boolean(item.special, '连签电荷') };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '缺少指令。');
  const type = choice(value.type, ['arrange', 'shot', 'advance'], '指令');
  if (type === 'arrange') {
    const item = object(value, ['type', 'round', 'plan']);
    return { type, round: integer(item.round, '回合', 0, 4), plan: parsePlan(item.plan) };
  }
  if (type === 'shot') return { type, shot: parseShot(object(value, ['type', 'shot']).shot) };
  object(value, ['type']); return { type };
}
export function reduce(state: State, raw: Command): State {
  const command = parseCommand(raw);
  if (command.type === 'arrange') {
    requireRule(state.phase === 'parley' && command.round === state.round, '只接受当前回合的公开布阵。');
    const board = makeBoard(state.round, command.plan, state.seed);
    requireRule(solve(board) !== null, '此礼阵没有已验证的通关航线，不能启用。');
    return { ...state, phase: 'ready', plan: command.plan, board };
  }
  if (command.type === 'advance') {
    requireRule(state.phase === 'round-win' && state.round < 4, '尚未签署本回合契约。');
    return { ...state, round: state.round + 1, phase: 'parley', shots: 3, captured: [], specialUsed: false,
      plan: null, board: null, last: null, lastInput: null };
  }
  requireRule(state.phase === 'ready' && state.board !== null && state.shots > 0, '现在不能发射。');
  requireRule(!command.shot.special || !state.specialUsed, '本回合的连签电荷已使用。');
  const last = simulate(state.board, command.shot);
  const captured = [...new Set([...state.captured, ...last.hits])];
  const shots = state.shots - 1, won = captured.length >= (state.round === 4 ? 3 : 2);
  return {
    ...state, shots, captured, specialUsed: state.specialUsed || command.shot.special,
    phase: won ? state.round === 4 ? 'victory' : 'round-win' : shots === 0 ? 'lost' : 'ready',
    score: state.score + last.score + (won ? shots * 150 : 0),
    stars: state.stars + (won ? shots + 1 : 0), last, lastInput: command.shot,
    history: [...state.history, { ...command.shot, round: state.round, pacts: last.hits, banks: last.banks }],
  };
}
export function publicStats(state: State) {
  return {
    shots: state.history.length,
    meanAngle: state.history.length ? Math.round(state.history.reduce((sum, shot) => sum + shot.angle, 0) / state.history.length) : 0,
    meanPower: state.history.length ? Math.round(state.history.reduce((sum, shot) => sum + shot.power, 0) / state.history.length) : 85,
    bankHits: state.history.reduce((sum, shot) => sum + shot.banks, 0),
    pactHits: Object.fromEntries(PACTS.map(id => [id, state.history.filter(shot => shot.pacts.includes(id)).length])),
    recentShots: state.history.slice(-3),
  };
}
export const definition: GameDefinition<State, Command> = { id: 'marble-parley', create, reduce, parseCommand };
