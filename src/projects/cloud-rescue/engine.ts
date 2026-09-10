import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { DIRECTIONS, GOALS, ISLANDS, MOODS, NURSERIES } from './data';
import type { Direction, Goal, WindPlan } from './data';

export type Phase = 'opening' | 'play' | 'wind' | 'won' | 'lost' | 'festival';
export interface Effect { kind: 'merge' | 'rain' | 'seed' | 'gust' | 'rescue' | 'storm'; cell: number; amount: number; from?: number }
export interface State {
  seed: number; island: number; board: number[]; delivered: number[]; phase: Phase;
  moves: number; held: number; coins: number; prunes: number; turn: number;
  windSpent: number; ratings: number[]; used: number; merges: number; rain: number;
  intention: string; mood: typeof MOODS[number]; goal: Goal; effects: Effect[]; reason: string;
}
export type PlayerCommand = { type: 'slide'; direction: Direction } |
  { type: 'seed'; cell: number; water: 1 | 2 } | { type: 'prune'; cell: number };
export type Command = PlayerCommand | { type: 'wind'; plan: WindPlan; goal: Goal } |
  { type: 'next' } | { type: 'retry' } | { type: 'close' };
export interface WindChoice {
  id: number; action: 'seed' | 'gust' | 'rescue'; cell: number; to: number; water: number; cost: number; label: string;
}

function start(seed: number, island: number, ratings: number[]): State {
  const level = ISLANDS[island];
  // Seed chooses the spirit's character, never an unrecorded/random cloud spawn.
  return {
    seed, island, board: [...level.board], delivered: level.gardens.map(() => 0), phase: 'opening',
    moves: level.moves, held: 0, coins: 4, prunes: 1, turn: 0, windSpent: 0, ratings: [...ratings],
    used: 0, merges: 0, rain: 0, mood: MOODS[seed % 3], goal: GOALS[0], effects: [],
    intention: '我是卷卷，爱把好天气折成小纸条。开工前，先一起订一阵风。', reason: '',
  };
}
export function create(seed: number): State { return start(integer(seed, '公司种子', 0, 0xffffffff), 0, []); }
function clone(s: State): State {
  return { ...s, board: [...s.board], delivered: [...s.delivered], ratings: [...s.ratings], effects: [] };
}
export function parsePlan(value: unknown): WindPlan {
  const p = object(value, ['turn', 'choices', 'mood', 'intention'], '风灵承诺');
  const intention = text(p.intention, '公开意图', 72);
  requireRule(/[\u3400-\u9fff]/u.test(intention), '请用一句简短中文说明公开行动。');
  return {
    turn: integer(p.turn, '风轮编号', 0, 30),
    choices: array(p.choices, v => integer(v, '目录编号', 0, 255), '风行动', 1, 1),
    mood: choice(p.mood, MOODS, '心情'), intention,
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, '需要一条公司指令。');
  const type = choice(value.type, ['slide', 'seed', 'prune', 'wind', 'next', 'retry', 'close'] as const, '指令');
  if (type === 'slide') {
    const c = object(value, ['type', 'direction']);
    return { type, direction: choice(c.direction, DIRECTIONS, '方向') };
  }
  if (type === 'seed') {
    const c = object(value, ['type', 'cell', 'water']);
    return { type, cell: integer(c.cell, '苗床格', 0, 15), water: integer(c.water, '水量', 1, 2) as 1 | 2 };
  }
  if (type === 'prune') {
    const c = object(value, ['type', 'cell']);
    return { type, cell: integer(c.cell, '老云格', 0, 15) };
  }
  if (type === 'wind') {
    const c = object(value, ['type', 'plan', 'goal']);
    return { type, plan: parsePlan(c.plan), goal: choice(c.goal, GOALS, '共同目标') };
  }
  object(value, ['type']);
  return { type };
}
export function slideBoard(board: readonly number[], rocks: readonly number[], direction: Direction) {
  const next = [...board], effects: Effect[] = [];
  for (let line = 0; line < 4; line++) {
    const cells = Array.from({ length: 4 }, (_, k) => direction === 'up' ? k * 4 + line :
      direction === 'down' ? (3 - k) * 4 + line : direction === 'left' ? line * 4 + k : line * 4 + 3 - k);
    let segment: number[] = [];
    const flush = () => {
      const clouds = segment.map(cell => board[cell]).filter(Boolean);
      const merged: number[] = [];
      for (let i = 0; i < clouds.length; i++) {
        if (clouds[i] === clouds[i + 1] && clouds[i] < 8) {
          merged.push(clouds[i] * 2);
          effects.push({ kind: 'merge', cell: segment[merged.length - 1], amount: clouds[i] * 2 });
          i++;
        } else merged.push(clouds[i]);
      }
      segment.forEach((cell, index) => { next[cell] = merged[index] ?? 0; });
      segment = [];
    };
    for (const cell of cells) { if (rocks.includes(cell)) flush(); else segment.push(cell); }
    flush();
  }
  return { board: next, effects, changed: next.some((water, cell) => water !== board[cell]) };
}
function settle(s: State) {
  const level = ISLANDS[s.island];
  for (const cell of level.storms) {
    if (s.board[cell] === 4) { s.board[cell] = 8; s.effects.push({ kind: 'storm', cell, amount: 8 }); }
  }
  level.gardens.forEach((garden, index) => {
    const cell = 12 + garden.column, water = s.board[cell];
    if ((water === 2 || water === 4) && s.delivered[index] < garden.need) {
      const amount = Math.min(water / 2, garden.need - s.delivered[index]);
      s.delivered[index] += amount; s.rain += amount; s.board[cell] = 0;
      s.effects.push({ kind: 'rain', cell, amount });
    }
  });
}
export function complete(s: State): boolean {
  return ISLANDS[s.island].gardens.every((garden, i) => s.delivered[i] === garden.need);
}
function award(s: State) {
  if (!complete(s)) return false;
  const stars = s.used <= Math.ceil(ISLANDS[s.island].moves / 2) && s.prunes === 1 ? 3 : s.moves >= 3 ? 2 : 1;
  s.ratings[s.island] = stars;
  s.phase = s.island === ISLANDS.length - 1 ? 'festival' : 'won';
  s.reason = s.phase === 'festival' ? '百花开了！小小天气公司，正式开业。' : '订单完成！每一滴雨都有了去处。';
  return true;
}
export function playerChoices(s: State): PlayerCommand[] {
  const level = ISLANDS[s.island], result: PlayerCommand[] = [];
  for (const direction of DIRECTIONS) if (slideBoard(s.board, level.rocks, direction).changed) result.push({ type: 'slide', direction });
  for (const cell of NURSERIES) if (!s.board[cell] && !level.rocks.includes(cell)) {
    for (const water of [1, 2] as const) if (s.coins >= water) result.push({ type: 'seed', cell, water });
  }
  if (s.prunes && s.coins >= 2) s.board.forEach((water, cell) => { if (water === 8) result.push({ type: 'prune', cell }); });
  return result;
}
function applyPlayer(s: State, command: PlayerCommand): State {
  const next = clone(s), level = ISLANDS[s.island];
  if (command.type === 'slide') {
    const slide = slideBoard(s.board, level.rocks, command.direction);
    requireRule(slide.changed, '风吹不动这一边；没有扣步。');
    next.board = slide.board; next.effects = slide.effects; next.merges += slide.effects.length;
  } else if (command.type === 'seed') {
    requireRule(NURSERIES.some(cell => cell === command.cell) && !next.board[command.cell], '只能在空的顶排苗床播种。');
    requireRule(next.coins >= command.water, '播种金不足。');
    next.coins -= command.water; next.board[command.cell] = command.water;
    next.effects.push({ kind: 'seed', cell: command.cell, amount: command.water });
  } else {
    requireRule(next.board[command.cell] === 8 && next.prunes > 0 && next.coins >= 2, '每岛一次：2 金把 8 水老云修剪成 2 水。');
    next.board[command.cell] = 2; next.coins -= 2; next.prunes--;
    next.effects.push({ kind: 'rescue', cell: command.cell, amount: 2 });
  }
  next.moves--; next.used++; next.held++;
  settle(next);
  return next;
}

// Small, deterministic reachability search. Planning pauses are omitted, not player costs.
// Every offered wind must leave a certified player route; future winds preserve that invariant.
export function findSolution(initial: State, limit = 12000): PlayerCommand[] | null {
  if (complete(initial)) return [];
  const memo = new Map<string, number>();
  let visited = 0;
  const visit = (s: State, depth: number): PlayerCommand[] | null => {
    if (complete(s)) return [];
    if (depth === 0 || s.moves <= 0 || ++visited > limit) return null;
    const needed = ISLANDS[s.island].gardens.reduce((sum, garden, i) => sum + garden.need - s.delivered[i], 0);
    const usable = s.board.reduce((sum, water) => sum + (water === 8 ? 0 : water), 0) + s.coins + (s.prunes && s.coins >= 2 && s.board.includes(8) ? 2 : 0);
    if (usable < needed * 2) return null;
    const key = `${s.board.join(',')}/${s.delivered.join(',')}/${s.coins}/${s.prunes}`;
    if ((memo.get(key) ?? -1) >= depth) return null;
    memo.set(key, depth);
    const candidates = playerChoices(s).map(command => ({ command, state: applyPlayer(s, command) }));
    candidates.sort((a, b) => b.state.rain - a.state.rain || a.state.board.filter(v => v === 8).length - b.state.board.filter(v => v === 8).length);
    for (const candidate of candidates) {
      const path = visit(candidate.state, depth - 1);
      if (path) return [candidate.command, ...path];
    }
    return null;
  };
  // Iterative deepening makes the UI/test witness short without an unbounded graph.
  for (let depth = 1; depth <= Math.min(initial.moves, 10); depth++) {
    memo.clear();
    const path = visit(initial, depth);
    if (path) return path;
    if (visited > limit) break;
  }
  return null;
}
function applyWind(s: State, action: WindChoice): State {
  const next = clone(s);
  if (action.action === 'seed') next.board[action.cell] = action.water;
  else if (action.action === 'rescue') next.board[action.cell] = 2;
  else { next.board[action.to] = next.board[action.cell]; next.board[action.cell] = 0; }
  next.effects.push({ kind: action.action, cell: action.action === 'gust' ? action.to : action.cell, amount: action.water, from: action.cell });
  next.windSpent = action.cost;
  settle(next);
  return next;
}
function rawWindChoices(s: State): WindChoice[] {
  const result: WindChoice[] = [], level = ISLANDS[s.island];
  const add = (action: Omit<WindChoice, 'id'>) => result.push({ ...action, id: result.length });
  for (const cell of NURSERIES) if (!s.board[cell]) {
    add({ action: 'seed', cell, to: cell, water: 2, cost: 2, label: `${cell + 1} 格播一朵 2 水云 · 2 风` });
  }
  if (s.phase === 'opening') return result;
  s.board.forEach((water, cell) => {
    if (water === 8) add({ action: 'rescue', cell, to: cell, water: 2, cost: 3, label: `${cell + 1} 格老云修剪成 2 水 · 3 风` });
    if (!water) return;
    for (const to of [cell - 1, cell + 1]) {
      if (to >= 0 && to < 16 && Math.floor(to / 4) === Math.floor(cell / 4) && !s.board[to] && !level.rocks.includes(to)) {
        add({ action: 'gust', cell, to, water, cost: 1, label: `${cell + 1} → ${to + 1} 格侧风 · 1 风` });
      }
    }
  });
  return result;
}
let cacheKey = '', cacheChoices: WindChoice[] = [];
export function legalWindChoices(s: State): WindChoice[] {
  if (s.phase !== 'opening' && s.phase !== 'wind') return [];
  const key = JSON.stringify([s.island, s.phase, s.board, s.delivered, s.moves, s.coins, s.prunes]);
  if (key !== cacheKey) {
    cacheChoices = rawWindChoices(s).filter(action => findSolution(applyWind(s, action), 6000) !== null);
    cacheKey = key;
  }
  return cacheChoices.map(action => ({ ...action }));
}
export function reduce(state: State, command: Command): State {
  const c = parseCommand(command);
  if (c.type === 'retry') {
    requireRule(state.phase === 'lost', '只有失单后才能重试本岛。');
    return start(state.seed, state.island, state.ratings.slice(0, state.island));
  }
  if (c.type === 'next') {
    requireRule(state.phase === 'won' && state.island < 4, '先完成本岛订单。');
    return start(state.seed, state.island + 1, state.ratings);
  }
  if (c.type === 'close') {
    requireRule(['play', 'wind'].includes(state.phase), '开工之后才能收工。');
    return { ...clone(state), phase: 'lost', reason: '今天先收工；重试会回到本岛开工前，不补发奖励。' };
  }
  if (c.type === 'wind') {
    requireRule(state.phase === 'opening' || state.phase === 'wind', '每岛开工及每三步休息时才可请风。');
    requireRule(c.plan.turn === state.turn, '旧风轮承诺已过期。');
    const action = legalWindChoices(state).find(item => item.id === c.plan.choices[0]);
    requireRule(action !== undefined && action.cost <= 3, '行动不在保苗目录内，或超过本轮 3 风预算。');
    const next = applyWind(state, action);
    next.phase = 'play'; next.held = 0; next.turn++; next.goal = c.goal;
    next.intention = c.plan.intention; next.mood = c.plan.mood;
    award(next);
    return next;
  }
  requireRule(state.phase === 'play' && state.moves > 0, '先请风灵订风；等待模型不扣步。');
  const next = applyPlayer(state, c);
  if (award(next)) return next;
  if (!next.moves) { next.phase = 'lost'; next.reason = '步数用完了，订单尚未送齐。云和花都等你重新开工。'; }
  else if (next.held === 3) {
    next.phase = 'wind';
    if (!legalWindChoices(next).length) { next.phase = 'lost'; next.reason = '这份订单已没有可认证的保苗风路。重试，少合一朵老云。'; }
  } else if (!playerChoices(next).length) {
    next.phase = 'lost'; next.reason = '风道全堵住，播种金和修剪机会也救不了。重试本岛吧。';
  }
  return next;
}
export const definition: GameDefinition<State, Command> = { id: 'cloud-rescue', create, reduce, parseCommand };
