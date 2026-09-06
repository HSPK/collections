import { isBody, SITES } from './data';
import type { BodyName, Site } from './data';
import { observer } from './astronomy';
import { parseUTC, validTime } from './time';
export type View = 'system' | 'planet' | 'sky';
export interface StudyState {
  time: number;
  site: Site;
  view: View;
  body: BodyName;
  track: 'Sun' | 'Moon' | 'horizon';
  fov: number;
  skyAzimuth: number;
  skyAltitude: number;
  orbitYaw: number;
  orbitPitch: number;
  orbitZoom: number;
  planetCamera: 'orbit' | 'ride';
  rate: number;
}
export function initialState(): StudyState {
  return {
    time: parseUTC('2024-04-08T18:17:00Z'), site: { ...SITES[0] },
    view: 'sky', body: 'Earth', track: 'Sun', fov: 1.6, skyAzimuth: 180, skyAltitude: 15,
    orbitYaw: 0.45, orbitPitch: 0.48, orbitZoom: 1, planetCamera: 'orbit', rate: 1,
  };
}
export const cloneState = (state: StudyState): StudyState => ({ ...state, site: { ...state.site } });
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function validateState(value: unknown): StudyState {
  if (!record(value) || !record(value.site)) throw new Error('The observation state is missing.');
  const s = value.site;
  if (typeof s.name !== 'string' || s.name.length < 1 || s.name.length > 80 ||
      !finite(s.latitude, -90, 90) || !finite(s.longitude, -180, 180) || !finite(s.elevation, -500, 10000))
    throw new Error('The observer location is invalid.');
  if (!finite(value.time, -Infinity, Infinity)) throw new Error('The UTC instant is invalid.');
  validTime(value.time);
  if ((value.view !== 'system' && value.view !== 'planet' && value.view !== 'sky') ||
      !isBody(value.body) || (value.track !== 'Sun' && value.track !== 'Moon' && value.track !== 'horizon') ||
      !finite(value.fov, 0.65, 110) || !finite(value.skyAzimuth, 0, 360) || !finite(value.skyAltitude, -90, 90) ||
      !finite(value.orbitYaw, -10000, 10000) || !finite(value.orbitPitch, -1.45, 1.45) ||
      !finite(value.orbitZoom, 0.45, 3) || (value.planetCamera !== 'orbit' && value.planetCamera !== 'ride') ||
      ![1, 30, 300, 3600, 86400, 864000].includes(typeof value.rate === 'number' ? value.rate : NaN))
    throw new Error('One or more view, camera, or playback settings are invalid.');
  if (typeof value.rate !== 'number') throw new Error('Playback rate is invalid.');
  const site = { name: s.name, latitude: s.latitude, longitude: s.longitude, elevation: s.elevation };
  observer(site);
  return { time: value.time, site, view: value.view, body: value.body, track: value.track,
    fov: value.fov, skyAzimuth: value.skyAzimuth, skyAltitude: value.skyAltitude,
    orbitYaw: value.orbitYaw, orbitPitch: value.orbitPitch, orbitZoom: value.orbitZoom,
    planetCamera: value.planetCamera, rate: value.rate };
}
export function encodeStudy(state: StudyState): string {
  return JSON.stringify({ format: 'helios-observation', version: 1, state: validateState(state) }, null, 2);
}
export function decodeStudy(text: string): StudyState {
  if (text.length > 32000) throw new Error('Observation files are limited to 32 KB.');
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.format !== 'helios-observation' || data.version !== 1)
    throw new Error('Expected a HELIOS observation file, version 1.');
  return validateState(data.state);
}
export function shareURL(base: string, state: StudyState): string {
  const url = new URL(base);
  url.hash = `helios=${encodeURIComponent(encodeStudy(state))}`;
  return url.href;
}
export function stateFromHash(hash: string): StudyState | null {
  if (!hash.startsWith('#helios=')) return null;
  if (hash.length > 32000) throw new Error('This observation link is too long.');
  return decodeStudy(decodeURIComponent(hash.slice(8)));
}

// All asynchronous producers claim ownership when initiated, not when completed.
// An ordinary edit, a newer file, undo, reset, or disposal invalidates that claim.
export class StudyHistory {
  private value: StudyState;
  private readonly baseline: StudyState;
  private past: StudyState[] = [];
  private epoch = 0;
  private alive = true;
  constructor(state: StudyState) {
    this.value = validateState(state);
    this.baseline = cloneState(this.value);
  }
  get state(): StudyState { return cloneState(this.value); }
  get canUndo(): boolean { return this.past.length > 0; }
  claim(): number { return ++this.epoch; }
  owns(token: number): boolean { return this.alive && this.epoch === token; }
  commit(value: StudyState, remember = true): void {
    if (!this.alive) throw new Error('This observation has been closed.');
    const valid = validateState(value);
    if (remember) {
      this.past.push(cloneState(this.value));
      if (this.past.length > 50) this.past.shift();
    }
    this.value = valid;
    ++this.epoch;
  }
  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.commit(previous, false);
  }
  reset(): void { this.commit(this.baseline); }
  dispose(): void { this.alive = false; ++this.epoch; this.past = []; }
}
