export const DIRECTIONS = ['up', 'left', 'down', 'right'] as const;
export type Direction = typeof DIRECTIONS[number];
export const GOALS = ['先浇缺水花园', '留住播种金', '请帮我解围'] as const;
export type Goal = typeof GOALS[number];
export const MOODS = ['细心', '俏皮', '护短'] as const;
export type Mood = typeof MOODS[number];
export interface Garden { column: number; name: string; need: number }
export interface Island {
  name: string; subtitle: string; lesson: string; color: number;
  rocks: number[]; storms: number[]; board: number[]; gardens: Garden[]; moves: number;
}
const board = (entries: [number, number][]) => {
  const cells = Array<number>(16).fill(0);
  for (const [cell, water] of entries) cells[cell] = water;
  return cells;
};
export const ISLANDS: Island[] = [
  {
    name: '薄荷码头', subtitle: '第一单生意，是让一盆薄荷相信春天。',
    lesson: '先按 ←，同水量云合并；再按 ↓，把雨送到绿叶出口。',
    color: 0x9fcfa7, rocks: [], storms: [],
    board: board([[0, 1], [1, 1], [6, 2], [8, 1], [9, 1]]),
    gardens: [{ column: 0, name: '薄荷', need: 3 }], moves: 12,
  },
  {
    name: '双生茶台', subtitle: '两位茶树邻居，谁都不想被落下。',
    lesson: '岩石把风道分段。分别照顾两个出口，不只堆大云。',
    color: 0x79bca8, rocks: [5], storms: [],
    board: board([[0, 1], [1, 1], [6, 2], [8, 1], [11, 1]]),
    gardens: [{ column: 0, name: '青茶', need: 2 }, { column: 3, name: '白茶', need: 2 }], moves: 14,
  },
  {
    name: '电铃苗圃', subtitle: '雷铃很漂亮，但成熟的云经不起它一碰。',
    lesson: '雷格上的 4 水云变成 8。绕开雷格，或让风灵修剪。',
    color: 0xb2bd76, rocks: [5, 7], storms: [10],
    board: board([[0, 1], [1, 1], [4, 2], [6, 4], [8, 1], [9, 1]]),
    gardens: [{ column: 0, name: '铃兰', need: 2 }, { column: 2, name: '金盏', need: 2 }], moves: 16,
  },
  {
    name: '桃色屋顶', subtitle: '昨天忘记收的老云，今天也值得被照顾。',
    lesson: '8 水老云不能下雨；点选它，再花 2 金修剪成 2 水云。',
    color: 0xdca78a, rocks: [4, 10], storms: [6],
    board: board([[0, 8], [1, 1], [2, 1], [7, 2], [8, 1], [9, 1], [11, 2]]),
    gardens: [{ column: 1, name: '桃枝', need: 2 }, { column: 3, name: '小葵', need: 2 }], moves: 16,
  },
  {
    name: '百花开业祭', subtitle: '五座岛的邻居，都带着花来参加公司的开业礼。',
    lesson: '三个花园都要开花。每三步和风灵商量一次，别浪费整朵雨。',
    color: 0xc9bf77, rocks: [5, 9], storms: [6, 10],
    board: board([[0, 2], [1, 1], [2, 1], [4, 4], [7, 2], [8, 8]]),
    gardens: [{ column: 0, name: '薄荷', need: 2 }, { column: 2, name: '金盏', need: 2 }, { column: 3, name: '小葵', need: 2 }], moves: 18,
  },
];
export const NURSERIES = [0, 1, 2, 3] as const;
export const DIRECTION_NAMES: Record<Direction, string> = { up: '上', left: '左', down: '下', right: '右' };
export const COMPANY_SEED = 90;
export interface WindPlan { turn: number; choices: number[]; mood: Mood; intention: string }
