import { NextLocalSolarEclipse, SearchLocalSolarEclipse, SearchMoonPhase } from 'astronomy-engine';
import type { EclipseEvent, LocalSolarEclipseInfo } from 'astronomy-engine';
import { observer, observe } from './astronomy';
import type { Site } from './data';
import { DAY_MS } from './math';
import { dayStart, MAX_TIME, utcDay, validTime } from './time';

export interface Contact {
  label: 'C1' | 'C2' | 'Peak' | 'C3' | 'C4';
  time: number;
  altitude: number;
}
export interface LocalEvent {
  day: string; site: Site; kind: string; peak: number; contacts: Contact[];
  engineObscuration: number; centralDuration: number | null;
}
export interface EventRequest { mode: 'current' | 'next'; time: number; site: Site }
export type EventReply = { ok: true; event: LocalEvent | null } | { ok: false; error: string };
function convert(info: LocalSolarEclipseInfo, site: Site): LocalEvent {
  const contacts: Contact[] = [];
  const append = (label: Contact['label'], event: EclipseEvent | undefined) => {
    if (!event) return;
    const time = event.time.date.getTime();
    // Library EclipseEvent.altitude includes normal refraction. All HELIOS
    // instrument readouts deliberately recompute geometric center altitude.
    contacts.push({ label, time, altitude: observe(time, site).sun.altitude });
  };
  append('C1', info.partial_begin); append('C2', info.total_begin);
  append('Peak', info.peak); append('C3', info.total_end); append('C4', info.partial_end);
  return { day: utcDay(info.peak.time.date.getTime()), site: { ...site }, kind: info.kind,
    peak: info.peak.time.date.getTime(), contacts, engineObscuration: info.obscuration,
    centralDuration: info.total_begin && info.total_end ?
      (info.total_end.time.date.getTime() - info.total_begin.time.date.getTime()) / 1000 : null };
}
export function currentEvent(ms: number, site: Site): LocalEvent | null {
  const start = dayStart(utcDay(ms));
  const obs = observer(site);
  const newMoon = SearchMoonPhase(0, new Date(start - DAY_MS), 3);
  if (!newMoon) return null;
  const event = SearchLocalSolarEclipse(new Date(start - DAY_MS), obs);
  const peak = event.peak.time.date.getTime();
  // A "next" search is NEVER allowed to replace this date's circumstances.
  if (peak < start || peak >= start + DAY_MS) return null;
  return convert(event, site);
}
export function nextEvent(ms: number, site: Site): LocalEvent {
  const start = dayStart(utcDay(validTime(ms))) + DAY_MS;
  if (start > MAX_TIME) throw new RangeError('The next eclipse would be outside the supported date range.');
  const obs = observer(site);
  // Candidate selection uses geocentric new Moon, which can be on a different
  // UTC day from the local peak. Bound the result, not only the search start.
  let result = SearchLocalSolarEclipse(new Date(start - DAY_MS), obs);
  while (result.peak.time.date.getTime() < start) result = NextLocalSolarEclipse(result.peak.time, obs);
  const peak = result.peak.time.date.getTime();
  if (peak > Math.min(MAX_TIME, start + 5 * 366 * DAY_MS))
    throw new RangeError('No local eclipse was returned within the next five years and the 1900–2100 range.');
  return convert(result, site);
}
export function eventKey(time: number, site: Site): string {
  return `${utcDay(time)}:${site.latitude}:${site.longitude}:${site.elevation}`;
}
