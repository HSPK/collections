import { clamp } from '../../core/math';

export const ASTRONOMICAL_UNIT_METRES = 149_597_870_700;
export const JULIAN_YEAR_SECONDS = 365.25 * 86_400;
export const LIGHT_YEAR_METRES = 299_792_458 * JULIAN_YEAR_SECONDS;

export const UNITS = {
  nm: { symbol: 'nm', name: 'nanometres', metres: 1e-9 },
  um: { symbol: 'µm', name: 'micrometres', metres: 1e-6 },
  mm: { symbol: 'mm', name: 'millimetres', metres: 1e-3 },
  cm: { symbol: 'cm', name: 'centimetres', metres: 1e-2 },
  m: { symbol: 'm', name: 'metres', metres: 1 },
  km: { symbol: 'km', name: 'kilometres', metres: 1e3 },
  au: { symbol: 'au', name: 'astronomical units', metres: ASTRONOMICAL_UNIT_METRES },
  ly: { symbol: 'ly', name: 'light-years', metres: LIGHT_YEAR_METRES },
} as const;

export type Unit = keyof typeof UNITS;
export type DisplayUnit = Unit | 'auto' | 'scientific';
export interface MeasuredLength { metres: number }
export interface MagnitudeBounds { min: number; max: number }

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && Object.hasOwn(UNITS, value);
}

function positive(value: number, name = 'Length'): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero.`);
  }
  return value;
}

function validBounds(bounds: MagnitudeBounds): void {
  positive(bounds.min, 'Minimum length');
  positive(bounds.max, 'Maximum length');
  if (bounds.max <= bounds.min) {
    throw new RangeError('Maximum length must be greater than minimum length.');
  }
}

export function toMetres(value: number, unit: Unit): number {
  return positive(positive(value) * UNITS[unit].metres);
}

export function fromMetres(metres: number, unit: Unit): number {
  return positive(positive(metres) / UNITS[unit].metres);
}

export function convertLength(value: number, from: Unit, to: Unit): number {
  return fromMetres(toMetres(value, from), to);
}

export function magnitudeBounds(entries: readonly MeasuredLength[]): MagnitudeBounds {
  if (!entries.length) throw new RangeError('A catalogue needs at least one reference.');
  const orders = entries.map((entry) => Math.log10(positive(entry.metres)));
  const lower = Math.floor(Math.min(...orders));
  const upper = Math.max(lower + 1, Math.ceil(Math.max(...orders)));
  const bounds = { min: 10 ** lower, max: 10 ** upper };
  validBounds(bounds);
  return bounds;
}

/** A position of 0–1 is logarithmic, not an index into the catalogue. */
export function logPosition(metres: number, bounds: MagnitudeBounds): number {
  positive(metres);
  validBounds(bounds);
  const low = Math.log10(bounds.min);
  return clamp((Math.log10(metres) - low) / (Math.log10(bounds.max) - low), 0, 1);
}

export function metresAtPosition(position: number, bounds: MagnitudeBounds): number {
  if (!Number.isFinite(position)) throw new RangeError('Position must be finite.');
  validBounds(bounds);
  const low = Math.log10(bounds.min);
  return 10 ** (low + clamp(position, 0, 1) * (Math.log10(bounds.max) - low));
}

/** A geometric midpoint is equally far away in either direction; prefer the smaller entry. */
export function nearestReference<T extends MeasuredLength>(entries: readonly T[], metres: number): T {
  if (!entries.length) throw new RangeError('A catalogue needs at least one reference.');
  const target = Math.log10(positive(metres));
  let nearest = entries[0];
  let gap = Math.abs(Math.log10(positive(nearest.metres)) - target);
  for (const entry of entries.slice(1)) {
    const nextGap = Math.abs(Math.log10(positive(entry.metres)) - target);
    const tied = Math.abs(nextGap - gap) < 1e-12;
    if (nextGap < gap - 1e-12 || (tied && entry.metres < nearest.metres)) {
      nearest = entry;
      gap = nextGap;
    }
  }
  return nearest;
}

export interface LengthComparison {
  aOverB: number;
  bOverA: number;
  larger: 'a' | 'b' | 'equal';
  largerOverSmaller: number;
  ordersApart: number;
  signedOrders: number;
  aShare: number;
  bShare: number;
}

/** The directed quotient is always A ÷ B; shares are linear fractions of the longer length. */
export function compareLengths(a: number, b: number): LengthComparison {
  positive(a, 'A');
  positive(b, 'B');
  const aOverB = positive(a / b, 'A divided by B');
  const bOverA = positive(b / a, 'B divided by A');
  const signedOrders = Math.log10(a) - Math.log10(b);
  return {
    aOverB,
    bOverA,
    larger: a === b ? 'equal' : a > b ? 'a' : 'b',
    largerOverSmaller: Math.max(aOverB, bOverA),
    ordersApart: Math.abs(signedOrders),
    signedOrders,
    aShare: a / Math.max(a, b),
    bShare: b / Math.max(a, b),
  };
}

/** If A becomes modelA metres long, B becomes (B ÷ A) × modelA metres long. */
export function rescaleLength(a: number, b: number, modelA: number): number {
  positive(modelA, 'Model length');
  return positive(compareLengths(a, b).bOverA * modelA, 'Rescaled length');
}

export function superscript(value: number): string {
  if (!Number.isInteger(value)) throw new RangeError('An exponent must be an integer.');
  const symbols: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(value).split('').map((digit) => symbols[digit]).join('');
}

function precisionDigits(digits: number): void {
  if (!Number.isInteger(digits) || digits < 1 || digits > 12) {
    throw new RangeError('Use between 1 and 12 significant digits.');
  }
}

export function scientificNumber(value: number, digits = 3): string {
  positive(value);
  precisionDigits(digits);
  const [coefficient, exponent] = value.toExponential(digits - 1).split('e');
  return `${Number(coefficient)} × 10${superscript(Number(exponent))}`;
}

export function formatNumber(value: number, digits = 3): string {
  positive(value);
  precisionDigits(digits);
  if (value < 0.001 || value >= 1e9) return scientificNumber(value, digits);
  return new Intl.NumberFormat('en', { maximumSignificantDigits: digits }).format(value);
}

export function naturalUnit(metres: number): Unit {
  positive(metres);
  if (metres >= LIGHT_YEAR_METRES * 0.01) return 'ly';
  if (metres >= ASTRONOMICAL_UNIT_METRES) return 'au';
  if (metres >= 1e3) return 'km';
  if (metres >= 1) return 'm';
  if (metres >= 1e-2) return 'cm';
  if (metres >= 1e-3) return 'mm';
  if (metres >= 1e-6) return 'um';
  return 'nm';
}

export function formatLength(metres: number, unit: DisplayUnit = 'auto', digits = 3): string {
  positive(metres);
  if (unit === 'scientific') return `${scientificNumber(metres, digits)} m`;
  const chosen = unit === 'auto' ? naturalUnit(metres) : unit;
  return `${formatNumber(fromMetres(metres, chosen), digits)} ${UNITS[chosen].symbol}`;
}
