import { clamp } from '../../core/math';

export interface Point {
  x: number;
  y: number;
}

export interface Lamp extends Point {
  z: number;
}

export interface PaperObject {
  id: string;
  name: string;
  height: number;
  outlines: Point[][];
  target: Point[][];
}

export const TABLE = { width: 900, height: 620 };
export const LAMP_LIMITS = { left: 54, right: 846, top: 56, bottom: 564, low: 240, high: 520 };

export function boundedLamp(lamp: Lamp): Lamp {
  return {
    x: clamp(lamp.x, LAMP_LIMITS.left, LAMP_LIMITS.right),
    y: clamp(lamp.y, LAMP_LIMITS.top, LAMP_LIMITS.bottom),
    z: clamp(lamp.z, LAMP_LIMITS.low, LAMP_LIMITS.high),
  };
}

export function projectPoint(point: Point, height: number, lamp: Lamp): Point {
  if (height < 0 || height >= lamp.z) {
    throw new RangeError('Paper must be between the table and the lamp.');
  }
  const ray = lamp.z / (lamp.z - height);
  return { x: lamp.x + (point.x - lamp.x) * ray, y: lamp.y + (point.y - lamp.y) * ray };
}

export function makePaper(
  id: string, name: string, height: number, target: Point[][], alignedLamp: Lamp,
): PaperObject {
  if (height < 0 || height >= alignedLamp.z) {
    throw new RangeError('An arrangement has an impossible paper height.');
  }
  const fraction = (alignedLamp.z - height) / alignedLamp.z;
  return {
    id, name, height, target,
    outlines: target.map((outline) => outline.map((point) => ({
      x: alignedLamp.x + (point.x - alignedLamp.x) * fraction,
      y: alignedLamp.y + (point.y - alignedLamp.y) * fraction,
    }))),
  };
}

export function projectedOutlines(object: PaperObject, lamp: Lamp): Point[][] {
  return object.outlines.map((outline) => outline.map((point) => projectPoint(point, object.height, lamp)));
}

export function alignment(objects: PaperObject[], lamp: Lamp): { error: number; percent: number; found: boolean } {
  let squaredDistance = 0;
  let points = 0;
  for (const object of objects) {
    object.outlines.forEach((outline, ring) => {
      outline.forEach((point, index) => {
        const actual = projectPoint(point, object.height, lamp);
        const target = object.target[ring][index];
        squaredDistance += (actual.x - target.x) ** 2 + (actual.y - target.y) ** 2;
        points += 1;
      });
    });
  }
  if (!points) throw new RangeError('An arrangement needs at least one paper outline.');
  const error = Math.sqrt(squaredDistance / points);
  return { error, percent: Math.round(clamp(1 - error / 150, 0, 1) * 100), found: error <= 7 };
}

export function fitTable(width: number, height: number) {
  const scale = Math.min(width / TABLE.width, height / TABLE.height);
  return { scale, x: (width - TABLE.width * scale) / 2, y: (height - TABLE.height * scale) / 2 };
}

export function tablePoint(point: Point, width: number, height: number): Point {
  const fit = fitTable(width, height);
  return { x: (point.x - fit.x) / fit.scale, y: (point.y - fit.y) / fit.scale };
}
