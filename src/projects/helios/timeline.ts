import { clamp, DAY_MS } from './math';
import { MAX_TIME, MIN_TIME, validTime } from './time';

export const TIME_SPANS = [
  { id: '6h', label: '6 hours', milliseconds: DAY_MS / 4 },
  { id: '2d', label: '2 days', milliseconds: 2 * DAY_MS },
  { id: '30d', label: '30 days', milliseconds: 30 * DAY_MS },
  { id: '1y', label: '1 year', milliseconds: 365.25 * DAY_MS },
  { id: '10y', label: '10 years', milliseconds: 3652.5 * DAY_MS },
] as const;
export type TimeSpan = typeof TIME_SPANS[number]['id'];
export interface TimeWindow { start: number; end: number }
export function timelineWindow(time: number, span: string): TimeWindow {
  validTime(time);
  const setting = TIME_SPANS.find(item => item.id === span);
  if (!setting) throw new RangeError('Choose one of the supported UTC timeline spans.');
  const start = clamp(time - setting.milliseconds / 2, MIN_TIME, MAX_TIME - setting.milliseconds);
  return { start, end: start + setting.milliseconds };
}
function check(window: TimeWindow) {
  validTime(window.start); validTime(window.end);
  if (window.end <= window.start) throw new RangeError('The timeline must have an increasing finite interval.');
}
export function timeAtFraction(fraction: number, window: TimeWindow): number {
  check(window);
  if (!Number.isFinite(fraction)) throw new RangeError('Timeline picking requires a finite position.');
  return Math.round(window.start + clamp(fraction, 0, 1) * (window.end - window.start));
}
export function timeFraction(time: number, window: TimeWindow): number {
  validTime(time); check(window);
  return (time - window.start) / (window.end - window.start);
}
export function axisLabel(time: number, span: TimeSpan): string {
  const iso = new Date(time).toISOString();
  if (span === '6h') return iso.slice(11, 16);
  if (span === '2d') return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
  if (span === '30d') return iso.slice(5, 10);
  return iso.slice(0, 7);
}
