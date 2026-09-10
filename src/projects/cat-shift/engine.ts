import { GameSession } from '../../core/games/session';
import { requireRule } from '../../core/agents/errors';
import { choice, integer, object, text } from '../../core/agents/schema';
import { ALARM_LIMIT, COLS, COMMAND_LIMIT, LANES, RETRIES, ROOMS, sweepLine, xy } from './data';
import type { Exhibit, Plan } from './data';

export type Phase = 'briefing' | 'playing' | 'cleared' | 'lost' | 'won';
export type Action = { type: 'step' | 'swap'; cell: number } | { type: 'wait' };
export type Command = Action | { type: 'guard'; plan: Plan } | { type: 'next' } | { type: 'retry' };
export interface RouteRecord { room: string; cells: number[]; alarm: number; escaped: boolean }
export interface State {
  seed: number;
  room: number;
  phase: Phase;
  cat: number;
  exhibits: Exhibit[];
  picked: boolean;
  turn: number;
  alarm: number;
  plan: Plan | null;
  stars: number[];
  retries: number;
  commands: number;
  route: number[];
  history: RouteRecord[];
  notice: string;
}
export function parsePlan(value: unknown): Plan {
  const item = object(value, ['lane', 'offset', 'intention'], '巡查方案');
  return { lane: choice(item.lane, LANES, '巡查方向'), offset: integer(item.offset, '首步节拍', 0, 1),
    intention: text(item.intention, '公开意图', 80) };
}
export function parseCommand(value: unknown): Command {
  const raw = value as { type?: unknown } | null;
  const type = choice(raw?.type, ['step', 'swap', 'wait', 'guard', 'next', 'retry'] as const, '行动');
  if (type === 'guard') {
    const item = object(value, ['type', 'plan'], '行动');
    return { type, plan: parsePlan(item.plan) };
  }
  if (type === 'step' || type === 'swap') {
    const item = object(value, ['type', 'cell'], '行动');
    return { type, cell: integer(item.cell, '落脚格', 0, 34) };
  }
  object(value, ['type'], '行动');
  return { type };
}
function prepareRoom(state: State, room: number, plan: Plan | null = null): State {
  const definition = ROOMS[room]!;
  return { ...state, room, phase: plan ? 'playing' : 'briefing', cat: definition.start,
    exhibits: definition.exhibits.map(item => ({ ...item })), picked: false, turn: 0, alarm: 0,
    plan: plan ? { ...plan } : null, route: [definition.start],
    notice: plan ? '脚印不变，重新借位。' : '请巡夜员落定脚印，再动第一步。' };
}
export function create(seed: number): State {
  return prepareRoom({ seed, room: 0, phase: 'briefing', cat: 0, exhibits: [], picked: false, turn: 0, alarm: 0,
    plan: null, stars: [], retries: RETRIES, commands: 0, route: [], history: [], notice: '' }, 0);
}
export function adjacent(a: number, b: number): boolean {
  const p = xy(a), q = xy(b);
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
}
export function exitOpen(state: State): boolean {
  const plate = ROOMS[state.room]!.plate;
  return plate === null || state.exhibits.some(item => item.cell === plate);
}
/** The next lamp sweeps after this player action. Exhibits stop it, including paper cats. */
export function forecast(state: State, turn = state.turn): { lit: number[]; blocker: Exhibit | undefined; line: number } {
  if (!state.plan) return { lit: [], blocker: undefined, line: -1 };
  const line = sweepLine(state.plan, turn);
  const cells = ROOMS[state.room]!.floors.filter(cell => {
    const p = xy(cell);
    return state.plan!.lane === 'columns' ? p.x === line : p.y === line;
  }).sort((a, b) => state.plan!.lane === 'columns' ? a - b : b - a);
  const lit: number[] = [];
  let blocker: Exhibit | undefined;
  for (const cell of cells) {
    blocker = state.exhibits.find(item => item.cell === cell);
    if (blocker) break;
    lit.push(cell);
  }
  return { lit, blocker, line };
}
function record(state: State, escaped: boolean): RouteRecord {
  return { room: ROOMS[state.room]!.id, cells: [...state.route], alarm: state.alarm, escaped };
}
export function reduce(input: State, untrusted: Command): State {
  const command = parseCommand(untrusted);
  requireRule(input.commands < COMMAND_LIMIT, '本夜行动记录已满，请开始新一夜。');
  const state: State = { ...input, commands: input.commands + 1, stars: [...input.stars],
    exhibits: input.exhibits.map(item => ({ ...item })), route: [...input.route], history: [...input.history] };
  if (command.type === 'guard') {
    requireRule(state.phase === 'briefing' && !state.plan, '本室脚印已经公布，不能临时改巡。');
    state.plan = parsePlan(command.plan);
    state.phase = 'playing';
    state.notice = '脚印已落定。红格是下一次扫灯；现在轮到猫。';
    return state;
  }
  if (command.type === 'next') {
    requireRule(state.phase === 'cleared' && state.room < ROOMS.length - 1 && state.stars.length === state.room + 1,
      '先带着月牙签走到出口，才能开启下一室。');
    return prepareRoom(state, state.room + 1);
  }
  if (command.type === 'retry') {
    requireRule((state.phase === 'playing' || state.phase === 'lost') && state.turn > 0 && state.retries > 0 && state.plan !== null,
      '只可重试已经行动的未通关展室；本夜最多回头两次。');
    state.retries--;
    state.history.push(record(state, false));
    return prepareRoom(state, state.room, state.plan);
  }
  requireRule(state.phase === 'playing' && state.plan !== null, '现在不能行动。先请巡夜员公布路线。');
  const room = ROOMS[state.room]!;
  let squeak = false;
  if (command.type !== 'wait') {
    requireRule(room.floors.includes(command.cell) && adjacent(state.cat, command.cell), '只可借位或走到相邻的亮地板。');
    const exhibit = state.exhibits.find(item => item.cell === command.cell);
    if (command.type === 'swap') {
      requireRule(Boolean(exhibit), '借位要点身旁的雕塑或纸猫。');
      exhibit!.cell = state.cat;
    } else requireRule(!exhibit, '展品占着这格：点「借位」或按 Shift。');
    state.cat = command.cell;
    squeak = room.squeaks.includes(state.cat);
  }
  state.picked ||= state.cat === room.pickup;
  const light = forecast(state);
  const caught = light.lit.includes(state.cat);
  const decoy = light.blocker?.kind === 'decoy' ? light.blocker : undefined;
  if (decoy) state.exhibits = state.exhibits.filter(item => item.id !== decoy.id);
  state.alarm += Number(caught) + Number(squeak);
  state.turn++;
  state.route.push(state.cat);
  state.notice = caught ? '喵！被灯照到，警报 +1。' : decoy ? '纸猫：啾——替你挡过一次灯，被收走了。' :
    squeak ? '吱呀……地板响了，警报 +1。' : command.type === 'swap' ? '借个位置，谢啦。' :
      command.type === 'wait' ? '猫蹲一下，脚印向前。' : '轻手轻脚。';
  if (caught && squeak) state.notice = '灯光加上响地板，警报 +2！';
  if (state.alarm >= ALARM_LIMIT) {
    state.phase = 'lost';
    state.notice = '被巡夜员抱回门口了。回头再试，或开启新一夜。';
  } else if (state.cat === room.exit && state.picked && exitOpen(state)) {
    requireRule(state.stars.length === state.room, '本室奖章已经领取。');
    state.stars.push(1 + Number(state.alarm === 0) + Number(state.turn <= room.par));
    state.history.push(record(state, true));
    state.phase = state.room === ROOMS.length - 1 ? 'won' : 'cleared';
    state.notice = state.phase === 'won' ? '天亮之前，团团借到了月亮的味道。明晚会还……大概。' : '月牙签到手，这间展室悄悄关上了。';
  } else if (state.turn >= room.moves) {
    state.phase = 'lost';
    state.notice = '晨光赶上来了：本室步数用尽。';
  } else if (state.cat === room.exit && !state.picked) state.notice = `还没拿到${room.item}，不能空爪离开。`;
  else if (state.cat === room.exit && !exitOpen(state)) state.notice = '出口没开：要把展品留在圆形压板上。';
  return state;
}
export const createSession = (seed = 2031) => new GameSession({ id: 'cat-shift', create, reduce, parseCommand }, seed);
export function legalActions(state: State): Action[] {
  if (state.phase !== 'playing') return [];
  return [
    ...ROOMS[state.room]!.floors.filter(cell => adjacent(cell, state.cat)).map(cell => ({
      type: state.exhibits.some(item => item.cell === cell) ? 'swap' as const : 'step' as const, cell,
    })),
    { type: 'wait' },
  ];
}
export interface Witness { actions: Action[]; expanded: number }
/** Bounded BFS over real reducer states, with resource-dominance pruning; no door/guard bypass. */
export function solve(start: State, budget = 60_000): Witness | null {
  if (start.phase !== 'playing') return null;
  const queue: { state: State; parent: number; action: Action | null }[] = [{ state: start, parent: -1, action: null }];
  const seen = new Map<string, { turn: number; alarm: number }[]>();
  function key(state: State) {
    return `${state.cat}/${Number(state.picked)}/${state.turn % 4}/${state.exhibits.map(item => `${item.id}:${item.cell}`).join(',')}`;
  }
  seen.set(key(start), [{ turn: start.turn, alarm: start.alarm }]);
  for (let cursor = 0; cursor < queue.length && cursor < budget; cursor++) {
    const node = queue[cursor]!;
    for (const action of legalActions(node.state)) {
      const next = reduce(node.state, action);
      if (next.phase === 'cleared' || next.phase === 'won') {
        const actions: Action[] = [action];
        let parent = cursor;
        while (parent > 0) { actions.push(queue[parent]!.action!); parent = queue[parent]!.parent; }
        return { actions: actions.reverse(), expanded: cursor + 1 };
      }
      if (next.phase !== 'playing') continue;
      const stateKey = key(next), previous = seen.get(stateKey) ?? [];
      if (previous.some(item => item.turn <= next.turn && item.alarm <= next.alarm)) continue;
      seen.set(stateKey, [...previous.filter(item => !(next.turn <= item.turn && next.alarm <= item.alarm)),
        { turn: next.turn, alarm: next.alarm }]);
      queue.push({ state: next, parent: cursor, action });
    }
  }
  return null;
}
export function publicObservation(state: State) {
  const room = ROOMS[state.room]!;
  return {
    room: { id: room.id, number: state.room + 1, floors: room.floors, start: room.start, exit: room.exit,
      pickup: room.pickup, plate: room.plate, squeaks: room.squeaks, exhibits: state.exhibits },
    legal: { lane: LANES, offset: [0, 1], cycles: { columns: [2, 4, 3, 4], rows: [1, 3, 2, 3] },
      alarmLimit: ALARM_LIMIT, moves: room.moves },
    coordinates: `cell = y * ${COLS} + x; x=0..6, y=0..4`,
    publicRouteHistory: state.history,
    instruction: '选择本室整段巡逻。每次猫行动后扫灯，展品挡光，纸猫只挡一次。脚印提前公开，不能中途改。根据已公开的往室路线选择方向与首步节拍。',
  };
}
