import { BANDS, LIMITS, MATERIALS, WALLS, isMaterial } from './data';
import type { BandValues, Point, Room, Wall } from './data';

/** Metres per second, fixed dry air at approximately 20 degrees Celsius. */
export const SPEED_OF_SOUND = 343;
/** Approximate amplitude loss in dB/m, nominal indoor air, not a humidity model. */
export const AIR_DB_PER_METRE: BandValues = [0.0001, 0.0003, 0.0006, 0.001, 0.003, 0.01];
export interface Bounce { wall: Wall; point: Point }
export interface ReflectionPath {
  id: string;
  image: Point;
  cell: [number, number, number];
  order: number;
  length: number;
  delay: number;
  amplitudes: BandValues;
  bounces: Bounce[];
  points: Point[];
}
export interface ReflectionResult {
  paths: ReflectionPath[];
  candidates: number;
  work: number;
  order: number;
}
export interface RoomEstimate {
  volume: number;
  area: number;
  absorptionArea: BandValues;
  sabine: BandValues;
  eyring: BandValues;
  meanAbsorption: BandValues;
}
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function validateRoom(room: Room): void {
  for (const key of ['width', 'depth', 'height'] as const) {
    if (!Number.isFinite(room[key]) || room[key] < LIMITS[key][0] || room[key] > LIMITS[key][1]) {
      throw new RangeError(`${key} must be between ${LIMITS[key][0]} and ${LIMITS[key][1]} metres.`);
    }
  }
  for (const name of ['source', 'listener'] as const) {
    for (const [axis, size] of [['x', room.width], ['y', room.depth], ['z', room.height]] as const) {
      const value = room[name][axis];
      if (!Number.isFinite(value) || value < LIMITS.margin || value > size - LIMITS.margin) {
        throw new RangeError(`${name} ${axis} must stay at least ${LIMITS.margin} m inside the room.`);
      }
    }
  }
  if (!Number.isInteger(room.order) || room.order < 0 || room.order > LIMITS.order) {
    throw new RangeError(`Reflection order must be an integer from 0 to ${LIMITS.order}.`);
  }
  for (const wall of WALLS) {
    if (!isMaterial(room.materials[wall])) throw new RangeError(`Unknown material for ${wall}.`);
  }
}
export function pathCount(order: number): number {
  if (!Number.isInteger(order) || order < 0 || order > LIMITS.order) throw new RangeError('Invalid reflection order.');
  return (4 * order ** 3 + 6 * order ** 2 + 8 * order + 3) / 3;
}
function imageCoordinate(cell: number, size: number, source: number): number {
  return cell % 2 === 0 ? cell * size + source : (cell + 1) * size - source;
}
function fold(value: number, size: number): number {
  const positive = ((value % (2 * size)) + 2 * size) % (2 * size);
  return positive <= size ? positive : 2 * size - positive;
}
function vectorBands(fn: (index: number) => number): BandValues {
  return [fn(0), fn(1), fn(2), fn(3), fn(4), fn(5)];
}

/** Unfolded lattice ray, folded at each exact boundary crossing. No ray marching. */
export function imageSources(
  room: Room,
  budget: { maxPaths?: number; maxWork?: number } = {},
): ReflectionResult {
  validateRoom(room);
  const count = pathCount(room.order);
  const maxPaths = budget.maxPaths ?? LIMITS.paths;
  const maxWork = budget.maxWork ?? 20_000;
  if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > LIMITS.paths ||
      !Number.isInteger(maxWork) || maxWork < 1 || maxWork > 20_000) {
    throw new RangeError('Image-source budgets must be positive bounded integers.');
  }
  if (count > maxPaths) throw new RangeError(`Order ${room.order} needs ${count} paths; the budget is ${maxPaths}.`);
  // Preflight a conservative number of cell visits, crossing checks and band interactions.
  const candidates = (2 * room.order + 1) ** 3;
  const work = candidates + count * (3 + room.order * (1 + BANDS.length));
  if (work > maxWork) throw new RangeError(`The reflection calculation needs ${work} work units; the budget is ${maxWork}.`);
  const paths: ReflectionPath[] = [];
  const axes = [
    { axis: 'x', size: room.width, low: 'west', high: 'east' },
    { axis: 'y', size: room.depth, low: 'south', high: 'north' },
    { axis: 'z', size: room.height, low: 'floor', high: 'ceiling' },
  ] as const;
  for (let nx = -room.order; nx <= room.order; nx++) {
    for (let ny = -room.order; ny <= room.order; ny++) {
      for (let nz = -room.order; nz <= room.order; nz++) {
        const order = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
        if (order > room.order) continue;
        const cell: [number, number, number] = [nx, ny, nz];
        const image = {
          x: imageCoordinate(nx, room.width, room.source.x),
          y: imageCoordinate(ny, room.depth, room.source.y),
          z: imageCoordinate(nz, room.height, room.source.z),
        };
        const crossings: { t: number; wall: Wall }[] = [];
        axes.forEach(({ axis, size, low, high }, i) => {
          const n = cell[i];
          for (let j = 0; j < Math.abs(n); j++) {
            const plane = n > 0 ? j + 1 : -j;
            const t = (plane * size - room.listener[axis]) / (image[axis] - room.listener[axis]);
            crossings.push({ t, wall: Math.abs(plane) % 2 === 0 ? low : high });
          }
        });
        crossings.sort((a, b) => b.t - a.t);
        const bounces: Bounce[] = crossings.map(({ t, wall }) => ({
          wall,
          point: {
            x: fold(room.listener.x + (image.x - room.listener.x) * t, room.width),
            y: fold(room.listener.y + (image.y - room.listener.y) * t, room.depth),
            z: fold(room.listener.z + (image.z - room.listener.z) * t, room.height),
          },
        }));
        const length = distance(image, room.listener);
        const amplitudes = vectorBands((band) => {
          let amplitude = 10 ** (-AIR_DB_PER_METRE[band] * length / 20) / Math.max(1, length);
          for (const bounce of bounces) {
            amplitude *= Math.sqrt(1 - MATERIALS[room.materials[bounce.wall]].absorption[band]);
          }
          return amplitude;
        });
        const points: Point[] = [{ ...room.source }];
        for (const bounce of bounces) {
          if (distance(points[points.length - 1], bounce.point) > 1e-8) points.push(bounce.point);
        }
        points.push({ ...room.listener });
        paths.push({
          id: order === 0 ? 'direct' : `${nx},${ny},${nz}`,
          image, cell, order, length, delay: length / SPEED_OF_SOUND, amplitudes, bounces, points,
        });
      }
    }
  }
  paths.sort((a, b) => a.delay - b.delay || a.id.localeCompare(b.id));
  return { paths, candidates, work, order: room.order };
}
export function wallAreas(room: Room): Record<Wall, number> {
  return {
    west: room.depth * room.height, east: room.depth * room.height,
    south: room.width * room.height, north: room.width * room.height,
    floor: room.width * room.depth, ceiling: room.width * room.depth,
  };
}
export function estimateRoom(room: Room): RoomEstimate {
  validateRoom(room);
  const areas = wallAreas(room);
  const area = WALLS.reduce((sum, wall) => sum + areas[wall], 0);
  const volume = room.width * room.depth * room.height;
  const absorptionArea = vectorBands((band) =>
    WALLS.reduce((sum, wall) => sum + areas[wall] * MATERIALS[room.materials[wall]].absorption[band], 0));
  const meanAbsorption = vectorBands((band) => absorptionArea[band] / area);
  const sabine = vectorBands((band) => 0.161 * volume / absorptionArea[band]);
  const eyring = vectorBands((band) => 0.161 * volume / (-area * Math.log(1 - meanAbsorption[band])));
  return { volume, area, absorptionArea, sabine, eyring, meanAbsorption };
}
