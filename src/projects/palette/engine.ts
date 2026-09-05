import { clamp } from '../../core/math';

export const ROLES = ['base', 'companion', 'accent', 'paper', 'ink'] as const;
export const HARMONIES = ['analogous', 'complementary', 'split', 'triad', 'monochrome'] as const;

export type Role = (typeof ROLES)[number];
export type GeneratedRole = Exclude<Role, 'base'>;
export type Harmony = (typeof HARMONIES)[number];
export type Palette = Record<Role, string>;
export interface RecipeSettings {
  base: string;
  harmony: Harmony;
  spice: number;
  warmth: number;
}
export interface KitchenState {
  settings: RecipeSettings;
  pins: Record<GeneratedRole, string | null>;
}
export interface SavedRecipe {
  id: string;
  name: string;
  state: KitchenState;
}
export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((digit) => digit + digit).join('').toLowerCase()}`;
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

export function hexToRgb(value: string): RGB {
  const hex = normalizeHex(value);
  if (!hex) throw new RangeError('Use a three- or six-digit hexadecimal color.');
  const number = Number.parseInt(hex.slice(1), 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  if (![r, g, b].every(Number.isFinite)) throw new RangeError('RGB channels must be finite.');
  return `#${[r, g, b].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const [red, green, blue] = [r, g, b].map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const hue = max === red
    ? (green - blue) / delta + (green < blue ? 6 : 0)
    : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return { h: hue * 60, s: delta / (1 - Math.abs(2 * l - 1)), l };
}

export function hslToHex({ h, s, l }: HSL): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  const channels = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return rgbToHex({ r: (channels[0] + m) * 255, g: (channels[1] + m) * 255, b: (channels[2] + m) * 255 });
}

export function mixHex(first: string, second: string, amount: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const t = clamp(amount, 0, 1);
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function contrastGrade(ratio: number): 'AAA' | 'AA' | 'Large only' | 'Fails' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'Large only';
  return 'Fails';
}

export function readableInk(background: string): '#000000' | '#ffffff' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
}

export function createKitchenState(settings: RecipeSettings): KitchenState {
  if (!isRecipeSettings(settings)) throw new RangeError('The color recipe is invalid.');
  return {
    settings: { ...settings, base: hexToNormalized(settings.base) },
    pins: { companion: null, accent: null, paper: null, ink: null },
  };
}

function hexToNormalized(value: string): string {
  const hex = normalizeHex(value);
  if (!hex) throw new RangeError('The color is invalid.');
  return hex;
}

const offsets: Record<Harmony, [number, number]> = {
  analogous: [32, 68],
  complementary: [180, 150],
  split: [150, 210],
  triad: [120, 240],
  monochrome: [0, 0],
};

export function cookPalette({ settings, pins }: KitchenState): Palette {
  const base = hexToNormalized(settings.base);
  const { h, s } = rgbToHsl(hexToRgb(base));
  const [side, spark] = offsets[settings.harmony];
  const saturation = settings.spice / 100;
  const warmth = settings.warmth / 30;
  const tint = mixHex('#eef3ff', '#fff0d5', (warmth + 1) / 2);
  const palette: Palette = {
    base,
    companion: hslToHex({ h: h + side, s: clamp(s * 0.35 + saturation * 0.6, 0, 0.95), l: 0.65 }),
    accent: hslToHex({ h: h + spark, s: clamp(s * 0.25 + saturation * 0.65, 0, 0.95), l: 0.37 }),
    paper: mixHex(base, tint, 0.94),
    ink: mixHex(base, '#11151a', 0.83),
  };
  for (const role of ROLES) {
    if (role !== 'base' && pins[role]) palette[role] = hexToNormalized(pins[role]);
  }
  return palette;
}

export function editPigment(state: KitchenState, role: Role, color: string): KitchenState {
  const hex = hexToNormalized(color);
  return role === 'base'
    ? { settings: { ...state.settings, base: hex }, pins: { ...state.pins } }
    : { settings: { ...state.settings }, pins: { ...state.pins, [role]: hex } };
}

export function togglePin(state: KitchenState, role: GeneratedRole): KitchenState {
  return {
    settings: { ...state.settings },
    pins: { ...state.pins, [role]: state.pins[role] ? null : cookPalette(state)[role] },
  };
}

export function isRole(value: string): value is Role {
  return ROLES.some((role) => role === value);
}

export function isHarmony(value: string): value is Harmony {
  return HARMONIES.some((harmony) => harmony === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecipeSettings(value: unknown): value is RecipeSettings {
  return isRecord(value)
    && typeof value.base === 'string' && normalizeHex(value.base) !== null
    && typeof value.harmony === 'string' && isHarmony(value.harmony)
    && typeof value.spice === 'number' && Number.isFinite(value.spice) && value.spice >= 0 && value.spice <= 100
    && typeof value.warmth === 'number' && Number.isFinite(value.warmth) && value.warmth >= -30 && value.warmth <= 30;
}

export function isKitchenState(value: unknown): value is KitchenState {
  if (!isRecord(value) || !isRecipeSettings(value.settings) || !isRecord(value.pins)) return false;
  const pins = value.pins;
  return ROLES.every((role) => role === 'base' || pins[role] === null
    || (typeof pins[role] === 'string' && normalizeHex(pins[role]) !== null));
}

export function isRecipeName(value: string): boolean {
  return value.trim().length > 0 && value.length <= 48
    && /^(?:[\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd]|[\ud800-\udbff][\udc00-\udfff])*$/.test(value);
}

export function isSavedRecipes(value: unknown): value is SavedRecipe[] {
  if (!Array.isArray(value) || value.length > 8) return false;
  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.id)
      || ids.has(item.id) || typeof item.name !== 'string' || !isRecipeName(item.name)
      || !isKitchenState(item.state)) return false;
    ids.add(item.id);
    return true;
  });
}
