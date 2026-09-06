import { DAY_MS } from './math';
export const MIN_TIME = Date.UTC(1900, 0, 1);
export const MAX_TIME = Date.UTC(2100, 11, 31, 23, 59, 59);
export function validTime(time: number): number {
  if (!Number.isFinite(time) || time < MIN_TIME || time > MAX_TIME)
    throw new RangeError('Choose a UTC instant from 1900 through 2100.');
  return time;
}
export function parseUTC(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z?$/.test(value))
    throw new RangeError('Use an explicit UTC date and time, YYYY-MM-DDTHH:mm:ss.');
  const iso = value.endsWith('Z') ? value : `${value}Z`;
  const time = validTime(Date.parse(iso));
  if (new Date(time).toISOString().slice(0, 10) !== value.slice(0, 10))
    throw new RangeError('This UTC calendar date does not exist.');
  return time;
}
export const utcDay = (time: number) => new Date(validTime(time)).toISOString().slice(0, 10);
export const utcInput = (time: number) => new Date(validTime(time)).toISOString().slice(0, 19);
export const utcClock = (time: number) => new Date(validTime(time)).toISOString().slice(11, 19);
export function dayStart(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('Use a YYYY-MM-DD UTC date.');
  return parseUTC(`${day}T00:00:00Z`);
}
export function sameUTCDay(a: number, b: number): boolean {
  return Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS);
}
