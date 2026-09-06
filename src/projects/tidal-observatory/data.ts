import { clamp, lerp } from '../../core/math';

export const CYCLE_SECONDS = 24;
export const WATER_SIZE = 120;
export const WATER_SEGMENTS = 112;
export const TIDE_MIN = -0.55;
export const TIDE_MAX = 0.85;
export const INITIAL_STATE = { tide: 0.18, daylight: 72, time: 4.5 } as const;
export const MOORING = { x: 3.35, z: 4.65, waterlineOffset: 0 } as const;

export const VIEWPOINTS = {
  coast: {
    label: 'Coast',
    description: 'The whole island, from the southern water.',
    position: [14, 11.5, 19] as [number, number, number],
    target: [0, 3, 0] as [number, number, number],
  },
  lantern: {
    label: 'Lantern',
    description: 'The lantern gallery and the keeper’s roof.',
    position: [7.5, 9.6, 12] as [number, number, number],
    target: [-1.7, 5.3, -0.35] as [number, number, number],
  },
  harbor: {
    label: 'Harbor',
    description: 'A low view of the landing and its floating boats.',
    position: [13.5, 6.8, 15.5] as [number, number, number],
    target: [3.4, 1.7, 2.8] as [number, number, number],
  },
};

export type Viewpoint = keyof typeof VIEWPOINTS;

export function signedMetres(value: number): string {
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)} m`;
}

export function daylightName(value: number): string {
  return value < 25 ? 'Blue hour' : value < 55 ? 'Last light' : value < 85 ? 'Late afternoon' : 'Clear daylight';
}

/** Heights are metres above a fictional fixed chart datum; all waves loop in 24 s. */
export function waterHeight(x: number, z: number, tide: number, seconds: number): number {
  const phase = (seconds / CYCLE_SECONDS) * Math.PI * 2;
  return tide
    + 0.045 * Math.sin(x * 0.7 + z * 0.31 + phase)
    + 0.023 * Math.sin(-x * 0.28 + z * 1.08 - phase * 2)
    + 0.012 * Math.cos(x * 1.4 + z * 0.9 + phase * 3);
}

export interface WaterCell {
  column: number;
  row: number;
  u: number;
  v: number;
}

export function waterCell(x: number, z: number): WaterCell {
  const gx = clamp((x / WATER_SIZE + 0.5) * WATER_SEGMENTS, 0, WATER_SEGMENTS);
  const gz = clamp((z / WATER_SIZE + 0.5) * WATER_SEGMENTS, 0, WATER_SEGMENTS);
  const column = Math.min(Math.floor(gx), WATER_SEGMENTS - 1);
  const row = Math.min(Math.floor(gz), WATER_SEGMENTS - 1);
  return { column, row, u: gx - column, v: gz - row };
}

/** Matches PlaneGeometry's a-b-d / b-c-d triangle diagonal after rotateX(-π/2). */
export function interpolateWaterTriangle(
  u: number, v: number, h00: number, h10: number, h01: number, h11: number,
): number {
  return u + v <= 1
    ? h00 + (h10 - h00) * u + (h01 - h00) * v
    : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Float anchors sample the rendered triangles, not a slightly different analytic surface. */
export function waterSurfaceHeight(x: number, z: number, tide: number, seconds: number): number {
  const cell = waterCell(x, z);
  const step = WATER_SIZE / WATER_SEGMENTS;
  const x0 = cell.column * step - WATER_SIZE / 2;
  const z0 = cell.row * step - WATER_SIZE / 2;
  return interpolateWaterTriangle(
    cell.u, cell.v,
    waterHeight(x0, z0, tide, seconds),
    waterHeight(x0 + step, z0, tide, seconds),
    waterHeight(x0, z0 + step, tide, seconds),
    waterHeight(x0 + step, z0 + step, tide, seconds),
  );
}

export function islandHeight(x: number, z: number): number {
  const descent = clamp((x - 2.1) / 3.7, 0, 1);
  return lerp(3.03, 1.28, descent * descent * (3 - 2 * descent))
    + Math.sin(x * 0.65 + z * 0.35) * 0.055;
}

export function islandRadius(angle: number): number {
  return 1 + Math.sin(angle * 3 + 0.3) * 0.075
    + Math.cos(angle * 7 - 0.6) * 0.043 + Math.sin(angle * 11) * 0.019;
}
