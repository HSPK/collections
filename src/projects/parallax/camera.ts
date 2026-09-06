import { add, cross, mm, mul, mv, sub, transpose, unit } from './math';
import type { M3, V2, V3 } from './math';

export const IMAGE_WIDTH = 960;
export const IMAGE_HEIGHT = 640;

// Right-handed camera frame: +X right, +Y down, +Z forward. World +Y is up.
export interface Camera {
  center: V3;
  rotation: M3;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}
export function lookAt(center: V3, target: V3, focal = 840, up: V3 = [0, 1, 0]): Camera {
  const forward = unit(sub(target, center));
  const right = unit(cross(forward, up));
  const down = cross(forward, right);
  return { center, rotation: [right, down, forward], fx: focal, fy: focal, cx: IMAGE_WIDTH / 2, cy: IMAGE_HEIGHT / 2 };
}
export function cameraPoint(camera: Camera, world: V3): V3 {
  return mv(camera.rotation, sub(world, camera.center));
}
export function project(camera: Camera, world: V3): V2 | null {
  const [x, y, z] = cameraPoint(camera, world);
  if (z <= 1e-8) return null;
  return [camera.fx * x / z + camera.cx, camera.fy * y / z + camera.cy];
}
export function unproject(camera: Camera, pixel: V2): V3 {
  return unit(mv(transpose(camera.rotation), [(pixel[0] - camera.cx) / camera.fx, (pixel[1] - camera.cy) / camera.fy, 1]));
}
export const rayPoint = (camera: Camera, pixel: V2, distance: number): V3 => add(camera.center, mul(unproject(camera, pixel), distance));
export function intrinsicInverse(camera: Camera): M3 {
  return [[1 / camera.fx, 0, -camera.cx / camera.fx], [0, 1 / camera.fy, -camera.cy / camera.fy], [0, 0, 1]];
}
export function essential(a: Camera, b: Camera): M3 {
  const rotation = mm(b.rotation, transpose(a.rotation));
  const [x, y, z] = mv(b.rotation, sub(a.center, b.center));
  const skew: M3 = [[0, -z, y], [z, 0, -x], [-y, x, 0]];
  return mm(skew, rotation);
}
export function fundamental(a: Camera, b: Camera): M3 {
  return mm(mm(transpose(intrinsicInverse(b)), essential(a, b)), intrinsicInverse(a));
}
export function epipolarLine(f: M3, point: V2, reverse = false): V3 {
  return mv(reverse ? transpose(f) : f, [point[0], point[1], 1]);
}
export function sampsonDistance(f: M3, a: V2, b: V2): number {
  const l = epipolarLine(f, a), r = epipolarLine(f, b, true);
  const numerator = l[0] * b[0] + l[1] * b[1] + l[2];
  const denominator = l[0] ** 2 + l[1] ** 2 + r[0] ** 2 + r[1] ** 2;
  return denominator < 1e-28 ? Infinity : Math.abs(numerator) / Math.sqrt(denominator);
}
export function closestOnLine(pixel: V2, line: V3): V2 | null {
  const squared = line[0] ** 2 + line[1] ** 2;
  if (squared < 1e-28) return null;
  const distance = (line[0] * pixel[0] + line[1] * pixel[1] + line[2]) / squared;
  return [pixel[0] - distance * line[0], pixel[1] - distance * line[1]];
}
export function projectionJacobian(camera: Camera, point: V3): [V3, V3] | null {
  const [x, y, z] = cameraPoint(camera, point);
  if (z <= 1e-8) return null;
  return [
    sub(mul(camera.rotation[0], camera.fx / z), mul(camera.rotation[2], camera.fx * x / (z * z))),
    sub(mul(camera.rotation[1], camera.fy / z), mul(camera.rotation[2], camera.fy * y / (z * z))),
  ];
}
