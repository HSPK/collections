export const RULE_IDS = ['sun', 'orange', 'not-moon', 'exact-two', 'two-plus'] as const;
export type RuleId = typeof RULE_IDS[number];
export const RHYTHMS = ['steady', 'breathing', 'quick'] as const;
export type Rhythm = typeof RHYTHMS[number];
export const PATTERNS = ['alternate', 'pairs', 'crossing'] as const;
export type Pattern = typeof PATTERNS[number];
export const DIRECTIONS = ['day', 'night'] as const;
export type Direction = typeof DIRECTIONS[number];
export const DIFFICULTIES = ['calm', 'regular'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export const STEP_MS = 50;
export const WAVE_SIZE = 6;
export const WAVE_COUNT = 4;
export const MAX_TICKS = 4096;
export const MAX_INPUTS = 16;
export const HOLD_TICKS = 24;
export const RULES: Record<RuleId, { title: string; day: string; night: string; icon: string }> = {
  sun: { title: '太阳回白昼', day: '太阳 ☀ → 白昼', night: '其余 → 黑夜', icon: '☀' },
  orange: { title: '橙色回白昼', day: '橙色包装 → 白昼', night: '其余 → 黑夜', icon: '橙' },
  'not-moon': { title: '不是月亮的回白昼', day: '非月亮符号 → 白昼', night: '月亮 ☾ → 黑夜', icon: '≠ ☾' },
  'exact-two': { title: '恰好两枚邮票', day: '邮票 = 2 → 白昼', night: '1 或 3 枚 → 黑夜', icon: '= 2' },
  'two-plus': { title: '两枚及以上邮票', day: '邮票 ≥ 2 → 白昼', night: '1 枚 → 黑夜', icon: '≥ 2' },
};
export const RHYTHM_NAMES: Record<Rhythm, string> = { steady: '匀速班', breathing: '一紧一松', quick: '轻快班' };
export const PATTERN_NAMES: Record<Pattern, string> = { alternate: '左右交替', pairs: '双件接续', crossing: '交错编组' };
export const SYMBOL_NAMES = { sun: '太阳', moon: '月亮', star: '星星' } as const;
export const SYMBOLS = { sun: '☀', moon: '☾', star: '★' } as const;
export const COLOR_NAMES = { orange: '橙色', blue: '蓝色' } as const;
export const COLORS = { orange: 0xff985d, blue: 0x79ceec };
export interface Parcel {
  id: string;
  symbol: keyof typeof SYMBOLS;
  color: keyof typeof COLORS;
  shape: 'bird' | 'boat' | 'kite';
  stamps: 1 | 2 | 3;
  window: number;
  gap: number;
}
export interface Plan { rule: RuleId; rhythm: Rhythm; pattern: Pattern; first: Direction }
export function classify(parcel: Parcel, rule: RuleId): Direction {
  const day = rule === 'sun' ? parcel.symbol === 'sun'
    : rule === 'orange' ? parcel.color === 'orange'
      : rule === 'not-moon' ? parcel.symbol !== 'moon'
        : rule === 'exact-two' ? parcel.stamps === 2 : parcel.stamps >= 2;
  return day ? 'day' : 'night';
}
export function parcelName(p: Parcel): string {
  return `${COLOR_NAMES[p.color]} · ${SYMBOL_NAMES[p.symbol]} · ${p.stamps} 枚邮票`;
}
export function destination(direction: Direction): string { return direction === 'day' ? '白昼' : '黑夜'; }
