import { IMAGE_HEIGHT, IMAGE_WIDTH, lookAt, project } from './camera';
import type { Camera } from './camera';
import { add, cross, dot, mul, norm, sub, unit } from './math';
import type { V2, V3 } from './math';

export interface Landmark { id: string; label: string; position: V3 }
export interface Surface { vertices: [V3, V3, V3]; color: string }
export interface World { landmarks: Landmark[]; surfaces: Surface[]; edges: [string, string][] }
export type StudyId = 'signal' | 'shore' | 'oblique';
export interface Rig { baseline: number; focal: number; yaw: number }
export const STUDIES: { id: StudyId; title: string; subtitle: string; center: V3; target: V3; rig: Rig }[] = [
  { id: 'signal', title: '01 / Signal house', subtitle: 'A convergent survey of a folded coastal observatory.', center: [8, 6.1, 12], target: [0, 2.5, 0], rig: { baseline: 3.4, focal: 840, yaw: 0 } },
  { id: 'shore', title: '02 / Across the water', subtitle: 'The same structure, thirty metres away. Small disparity, large uncertainty.', center: [12, 8, 31], target: [0, 2.6, 0], rig: { baseline: 1.2, focal: 1450, yaw: 0 } },
  { id: 'oblique', title: '03 / Around the corner', subtitle: 'An oblique capture: shared visibility is a geometric constraint.', center: [12, 6.2, 2.7], target: [0, 2.5, 0], rig: { baseline: 3.8, focal: 870, yaw: 0 } },
];
export function cameras(study: StudyId, rig: Rig): [Camera, Camera] {
  const preset = STUDIES.find((value) => value.id === study);
  if (!preset) throw new Error('Unknown capture study.');
  const forward = unit(sub(preset.target, preset.center)), right = unit(cross(forward, [0, 1, 0]));
  const ca = sub(preset.center, mul(right, rig.baseline / 2)), cb = add(preset.center, mul(right, rig.baseline / 2));
  const bDirection = sub(preset.target, cb), angle = rig.yaw * Math.PI / 180;
  const turned: V3 = [Math.cos(angle) * bDirection[0] + Math.sin(angle) * bDirection[2], bDirection[1], -Math.sin(angle) * bDirection[0] + Math.cos(angle) * bDirection[2]];
  return [lookAt(ca, preset.target, rig.focal), lookAt(cb, add(cb, turned), rig.focal)];
}

export function createWorld(): World {
  const world: World = { landmarks: [], surfaces: [], edges: [] };
  function triangle(a: V3, b: V3, c: V3, color: string) { world.surfaces.push({ vertices: [a, b, c], color }); }
  function feature(position: V3, label: string) {
    const id = `P${String(world.landmarks.length + 1).padStart(3, '0')}`;
    world.landmarks.push({ id, label, position });
    return id;
  }
  function box(center: V3, size: V3, color: string, label?: string) {
    const vertices: V3[] = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
    ].map((p) => [center[0] + p[0] * size[0] / 2, center[1] + p[1] * size[1] / 2, center[2] + p[2] * size[2] / 2]);
    const ids = label ? vertices.map((p, i) => feature(p, `${label} / corner ${i + 1}`)) : [];
    const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const [a, b, c, d] of faces) { triangle(vertices[a], vertices[b], vertices[c], color); triangle(vertices[a], vertices[c], vertices[d], color); }
    if (label) for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) world.edges.push([ids[a], ids[b]]);
  }
  function rod(a: V3, b: V3, radius: number, color: string) {
    const axis = unit(sub(b, a));
    const u = mul(unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), radius);
    const v = mul(unit(cross(axis, u)), radius);
    const rings = [a, b].map((p) => Array.from({ length: 6 }, (_, i) => add(p, add(mul(u, Math.cos(i * Math.PI / 3)), mul(v, Math.sin(i * Math.PI / 3))))));
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      triangle(rings[0][i], rings[0][j], rings[1][j], color);
      triangle(rings[0][i], rings[1][j], rings[1][i], color);
      triangle(a, rings[0][j], rings[0][i], color);
      triangle(b, rings[1][i], rings[1][j], color);
    }
  }
  box([0, -0.3, 0], [6.4, 0.45, 5.4], '#96958b', 'Quay');
  box([0, 0.02, 0], [5.6, 0.18, 4.6], '#ddd8c8', 'Deck');
  for (const x of [-1.7, 1.7]) for (const z of [-1.35, 1.35]) {
    box([x, 2.4, z], [0.16, 4.8, 0.16], '#e5dfc9', `${x > 0 ? 'East' : 'West'} ${z > 0 ? 'front' : 'rear'} pier`);
    box([x, 0.2, z], [0.46, 0.3, 0.46], '#757971');
  }
  box([0, 2.15, 0], [3.95, 0.2, 3.25], '#d6d0bd', 'Lower gallery');
  box([0, 4.6, 0], [4.35, 0.22, 3.65], '#ece6d2', 'Upper gallery');
  box([-0.45, 3.3, -0.12], [2.35, 2.1, 2.1], '#556567', 'Instrument room');
  // Narrow louvres sit proud of the opaque room; they are not transparent windows.
  for (let i = 0; i < 9; i++) box([-1.53 + i * 0.27, 3.38, 0.963], [0.075, 1.65, 0.1], '#bdc4b9');
  box([0.35, 0.72, -0.35], [1.5, 1.2, 1.15], '#626e6d', 'Service block');
  for (const z of [-1.4, 1.4]) {
    rod([-1.7, 0.25, z], [1.7, 2.05, z], 0.043, '#bba44a');
    rod([1.7, 0.25, z], [-1.7, 2.05, z], 0.043, '#bba44a');
    rod([-1.7, 2.3, z], [1.7, 4.47, z], 0.036, '#bba44a');
  }
  const roof: V3[] = [[-2.65, 4.95, -2.12], [0, 6.85, -1.7], [2.65, 4.95, -2.12], [-2.65, 5.25, 2.12], [0, 6.35, 2.45], [2.65, 5.25, 2.12]];
  const roofIds = roof.map((p, i) => feature(p, ['Canopy west heel', 'Rear ridge', 'Canopy east heel', 'West wingtip', 'Signal ridge', 'East wingtip'][i]));
  for (const [a, b, c, color] of [[0, 1, 4, '#e7dfbb'], [0, 4, 3, '#c2b686'], [1, 2, 5, '#f2e7bd'], [1, 5, 4, '#d1bc6a']] as const) {
    triangle(roof[a], roof[b], roof[c], color);
    world.edges.push([roofIds[a], roofIds[b]], [roofIds[b], roofIds[c]], [roofIds[c], roofIds[a]]);
  }
  for (const x of [-1.7, 1.7]) rod([x, 4.7, 1.35], [x * 1.55, 5.25, 2.12], 0.035, '#444d4b');
  rod([0, 6.6, -0.7], [0, 7.65, -0.7], 0.045, '#414b49');
  box([0, 7.43, -0.7], [0.33, 0.22, 0.24], '#e1c34b', 'Beacon');
  for (let i = 0; i < 11; i++) box([2.48, 0.12 + i * 0.18, 2.08 - i * 0.29], [0.86, 0.16, 0.37], i % 2 ? '#9fa99f' : '#ccd0bd');
  rod([2.92, 0.85, 2.24], [2.92, 2.8, -0.92], 0.036, '#475750');
  for (const z of [2.1, 0.6, -0.9]) rod([2.92, (2.1 - z) * 0.62 + 0.2, z], [2.92, (2.1 - z) * 0.62 + 0.93, z], 0.035, '#475750');
  box([-2.55, 0.4, 1.95], [0.5, 0.7, 0.5], '#d6c265', 'Survey monument');
  box([2.65, 0.3, -2.15], [0.45, 0.5, 0.45], '#bbc0b0', 'Mooring');
  return world;
}
export const WORLD = createWorld();

function triangleDistance(origin: V3, direction: V3, vertices: [V3, V3, V3]): number | null {
  const e1 = sub(vertices[1], vertices[0]), e2 = sub(vertices[2], vertices[0]);
  const p = cross(direction, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-10) return null;
  const t = sub(origin, vertices[0]), u = dot(t, p) / det;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const q = cross(t, e1), v = dot(direction, q) / det;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const distance = dot(e2, q) / det;
  return distance > 1e-7 ? distance : null;
}
export function visiblePixel(camera: Camera, point: V3, surfaces = WORLD.surfaces): V2 | null {
  const pixel = project(camera, point);
  if (!pixel || pixel[0] < 10 || pixel[0] > IMAGE_WIDTH - 10 || pixel[1] < 10 || pixel[1] > IMAGE_HEIGHT - 10) return null;
  const delta = sub(point, camera.center), distance = norm(delta), direction = unit(delta);
  for (const surface of surfaces) {
    const hit = triangleDistance(camera.center, direction, surface.vertices);
    if (hit !== null && hit < distance - 1e-5) return null;
  }
  return pixel;
}
