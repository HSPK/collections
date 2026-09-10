export const COLS = 7;
export const ROWS = 5;
export const tile = (x: number, y: number) => y * COLS + x;
export const xy = (cell: number) => ({ x: cell % COLS, y: Math.floor(cell / COLS) });
export const LANES = ['columns', 'rows'] as const;
export type Lane = typeof LANES[number];
export interface Plan { lane: Lane; offset: number; intention: string }
export interface Exhibit { id: string; cell: number; kind: 'bust' | 'decoy' }
export interface Room {
  id: string;
  title: string;
  lesson: string;
  floors: readonly number[];
  start: number;
  exit: number;
  pickup: number;
  item: string;
  exhibits: readonly Exhibit[];
  plate: number | null;
  squeaks: readonly number[];
  moves: number;
  par: number;
}
const cells = (rows: readonly string[]) => rows.flatMap((row, y) =>
  [...row].flatMap((value, x) => value === '.' ? [tile(x, y)] : []));
export const ROOMS: readonly Room[] = [
  {
    id: 'foyer', title: '打烊前厅', lesson: '第一招：点「借位」再点身旁展品，猫与展品交换。',
    floors: cells(['#######', '###...#', '###.#.#', '#...#.#', '#######']),
    start: tile(1, 3), exit: tile(5, 3), pickup: tile(5, 1), item: '月牙签',
    exhibits: [{ id: 'foyer-bust', cell: tile(2, 3), kind: 'bust' }],
    plate: null, squeaks: [], moves: 20, par: 10,
  },
  {
    id: 'sculpture', title: '大鼻子雕塑厅', lesson: '展品会挡住整条灯线；看好下一步红格再走。',
    floors: cells(['#######', '#.....#', '#..#..#', '#.....#', '#######']),
    start: tile(1, 3), exit: tile(5, 1), pickup: tile(1, 1), item: '月牙签',
    exhibits: [{ id: 'sculpture-bust', cell: tile(2, 3), kind: 'bust' }],
    plate: null, squeaks: [], moves: 22, par: 9,
  },
  {
    id: 'balance', title: '翘板藏品室', lesson: '把展品留在圆形压板上，出口才会一直开着。',
    floors: cells(['#######', '#.....#', '#..##.#', '#.....#', '#######']),
    start: tile(1, 3), exit: tile(5, 3), pickup: tile(5, 1), item: '月牙签',
    exhibits: [{ id: 'balance-bust', cell: tile(2, 3), kind: 'bust' }],
    plate: tile(1, 3), squeaks: [], moves: 24, par: 11,
  },
  {
    id: 'double', title: '真假猫画廊', lesson: '纸猫也能借位；替你挡一次灯后，就会被收走。',
    floors: cells(['#######', '#.....#', '##...##', '#.....#', '#######']),
    start: tile(1, 3), exit: tile(5, 3), pickup: tile(5, 1), item: '月牙签',
    exhibits: [{ id: 'double-bust', cell: tile(3, 2), kind: 'bust' }, { id: 'double-decoy', cell: tile(2, 3), kind: 'decoy' }],
    plate: tile(3, 3), squeaks: [], moves: 26, par: 13,
  },
  {
    id: 'moon', title: '黎明回廊', lesson: '金色裂纹地板会响：踏入一次，多涨一格警报。',
    floors: cells(['#######', '#.....#', '#.##..#', '#.....#', '#######']),
    start: tile(1, 3), exit: tile(5, 3), pickup: tile(5, 1), item: '月牙沙丁鱼',
    exhibits: [{ id: 'moon-bust', cell: tile(2, 3), kind: 'bust' }, { id: 'moon-decoy', cell: tile(4, 2), kind: 'decoy' }],
    plate: tile(1, 3), squeaks: [tile(3, 3), tile(4, 1)], moves: 28, par: 13,
  },
];
export const LEGAL_PLANS: readonly Plan[] = LANES.flatMap(lane =>
  [0, 1].map(offset => ({ lane, offset, intention: '按公布的脚印巡查。' })));
export const ALARM_LIMIT = 4;
export const COMMAND_LIMIT = 240;
export const RETRIES = 2;
export const laneLabel = (lane: Lane) => lane === 'columns' ? '北侧纵巡' : '东侧横巡';
export function sweepLine(plan: Plan, turn: number): number {
  return (plan.lane === 'columns' ? [2, 4, 3, 4] : [1, 3, 2, 3])[(turn + plan.offset) % 4]!;
}
