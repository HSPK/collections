export const LANES = [0, 1, 2] as const;
export type Lane = typeof LANES[number];
export const LANE_NAMES = ['西街', '钟楼', '东埠'] as const;
export const FORMATIONS = ['procession', 'pendulum', 'gather'] as const;
export const ARCHETYPES = ['moth', 'kite', 'mask'] as const;
export type Archetype = typeof ARCHETYPES[number] | 'crown';
export const UPGRADES = ['reserve', 'breeze'] as const;
export type Upgrade = typeof UPGRADES[number];
export const STEP_MS = 50;
export const WAVE_TICKS = 480;
export const MAX_TRACE = WAVE_TICKS;
export const CHAPTERS = [
  { title: '一更 · 瓦上有声', place: '折瓦街', count: 8, sky: 0x101f35, paper: 0x718292 },
  { title: '二更 · 纸舟夜渡', place: '纸舟埠', count: 9, sky: 0x102839, paper: 0x74938e },
  { title: '三更 · 风从书页来', place: '书页园', count: 10, sky: 0x24253e, paper: 0x90849c },
  { title: '四更 · 墨冠展开', place: '千折楼 · 上阕', count: 11, sky: 0x292439, paper: 0xa08c92 },
  { title: '五更 · 把黎明折回来', place: '千折楼 · 下阕', count: 12, sky: 0x2b3044, paper: 0xb49e82 },
] as const;
export const NAMES: Record<Archetype, string> = { moth: '墨蛾', kite: '纸鸢', mask: '换巷客', crown: '墨冠' };
export interface Plan {
  formation: typeof FORMATIONS[number];
  focus: Lane;
  spacing: 32 | 36;
  archetype: typeof ARCHETYPES[number];
  feint: boolean;
  intention: string;
}
export interface Spawn {
  id: number;
  tick: number;
  lane: Lane;
  decoy: Lane;
  kind: Archetype;
}
export function schedule(plan: Plan, wave: number): Spawn[] {
  return Array.from({ length: CHAPTERS[wave].count }, (_, id) => {
    const offset = plan.formation === 'gather' ? 0 : plan.formation === 'procession' ? id % 3 : [0, 1, 2, 1][id % 4];
    const lane = ((plan.focus + offset) % 3) as Lane;
    const kind = wave >= 3 && id % (wave === 4 ? 2 : 3) === 0 ? 'crown' : plan.archetype;
    return { id, tick: 20 + id * plan.spacing, lane, decoy: plan.feint && kind === 'mask' ? ((lane + 1) % 3) as Lane : lane, kind };
  });
}
