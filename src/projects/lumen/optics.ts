import { add, clamp, contains, degrees, dot, EPSILON, intersectElement, length, lensCircles, normalize, OFFSET, polygonPoints, rayPolygon, rotate, scale, sub, toLocal } from './geometry';
import type { Intersection } from './geometry';
import { BENCH, isRefractor, WAVELENGTHS } from './model';
import type { Detector, Experiment, MaterialId, OpticalElement, Refractor, Vec } from './model';

export const MATERIALS: Record<MaterialId, { name: string; a: number; b: number; absorption: number }> = {
  crown: { name: 'Crown glass', a: 1.5046, b: 0.0042, absorption: 0.00008 },
  flint: { name: 'Dense flint', a: 1.62, b: 0.015, absorption: 0.00018 },
  water: { name: 'Water', a: 1.322, b: 0.003, absorption: 0.00004 },
};

// Two-term Cauchy approximation: n(lambda) = A + B / lambda_um^2.
// These illustrative fits are not certified optical-glass catalog data.
export function materialIndex(material: MaterialId | null, wavelengthNm: number): number {
  if (!Number.isFinite(wavelengthNm) || wavelengthNm <= 0) throw new RangeError('Wavelength must be positive and finite.');
  if (material === null) return 1;
  const { a, b } = MATERIALS[material];
  return a + b / (wavelengthNm / 1000) ** 2;
}

export interface InterfaceResult {
  reflected: Vec;
  refracted: Vec | null;
  reflectance: number;
  transmittance: number;
  incidentAngle: number;
  transmittedAngle: number | null;
  tir: boolean;
}

export function reflect(direction: Vec, normal: Vec): Vec {
  const d = normalize(direction);
  const n = normalize(normal);
  return normalize(sub(d, scale(n, 2 * dot(d, n))));
}

export function snell(direction: Vec, outwardNormal: Vec, n1: number, n2: number): InterfaceResult {
  if (![n1, n2].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError('Refractive indices must be positive and finite.');
  const d = normalize(direction);
  let normal = normalize(outwardNormal);
  if (dot(d, normal) > 0) normal = scale(normal, -1);
  const cosI = clamp(-dot(d, normal), 0, 1);
  const ratio = n1 / n2;
  const sinT2 = ratio * ratio * (1 - cosI * cosI);
  const reflected = reflect(d, normal);
  const incidentAngle = degrees(Math.acos(cosI));
  if (sinT2 > 1) return { reflected, refracted: null, reflectance: 1, transmittance: 0, incidentAngle, transmittedAngle: null, tir: true };
  const cosT = Math.sqrt(Math.max(0, 1 - sinT2));
  const refracted = normalize(add(scale(d, ratio), scale(normal, ratio * cosI - cosT)));
  const rs = n1 === n2 ? 0 : ((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT)) ** 2;
  const rp = n1 === n2 ? 0 : ((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI)) ** 2;
  const reflectance = clamp((rs + rp) / 2, 0, 1);
  return { reflected, refracted, reflectance, transmittance: 1 - reflectance, incidentAngle, transmittedAngle: degrees(Math.acos(cosT)), tir: false };
}

export interface TraceLimits {
  maxDepth: number;
  maxBranches: number;
  minPower: number;
}

export const TRACE_LIMITS: TraceLimits = { maxDepth: 18, maxBranches: 2400, minPower: 0.00002 };

export interface RaySegment {
  start: Vec;
  end: Vec;
  wavelength: number;
  powerStart: number;
  powerEnd: number;
  rootPower: number;
  depth: number;
  leg: 'source' | 'transmitted' | 'reflected';
  white: boolean;
  targetId: string | null;
}

export interface DetectorHit {
  detectorId: string;
  wavelength: number;
  position: number;
  point: Vec;
  power: number;
}

export interface Interaction extends InterfaceResult {
  elementId: string;
  point: Vec;
  normal: Vec;
  wavelength: number;
  n1: number;
  n2: number;
  power: number;
}

export interface TraceResult {
  segments: RaySegment[];
  hits: DetectorHit[];
  interactions: Interaction[];
  emittedByWavelength: Map<number, number>;
  energy: { emitted: number; detected: number; absorbed: number; escaped: number; truncated: number };
  branches: number;
  limits: TraceLimits;
}

interface Ray {
  origin: Vec;
  direction: Vec;
  wavelength: number;
  power: number;
  rootPower: number;
  depth: number;
  leg: RaySegment['leg'];
  white: boolean;
}

function containsOutgoing(element: Refractor, point: Vec, direction: Vec): boolean {
  if (!contains(element, point)) return false;
  // Boundary launches enter a volume only when directed inward at every touching face.
  // Tangency to either a flat face or a curved surface belongs to the exterior.
  if (element.kind === 'lens') {
    const { radius, centers } = lensCircles(element);
    return centers.every((center) => {
      const radial = sub(point, center);
      return radius - length(radial) > EPSILON || dot(direction, normalize(radial)) < -EPSILON;
    });
  }
  const points = polygonPoints(element);
  return points.every((start, index) => {
    const edge = sub(points[(index + 1) % points.length], start);
    const normal = normalize({ x: edge.y, y: -edge.x });
    return dot(sub(point, start), normal) < -EPSILON || dot(direction, normal) < -EPSILON;
  });
}

export function mediumAt(elements: OpticalElement[], point: Vec, direction?: Vec): MaterialId | null {
  const forward = direction ? normalize(direction) : null;
  // A later refractor replaces the medium in an overlap, including nested volumes.
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (isRefractor(element) && (forward ? containsOutgoing(element, point, forward) : contains(element, point))) return element.material;
  }
  return null;
}

export function traceExperiment(scene: Experiment, options: Partial<TraceLimits> = {}): TraceResult {
  const limits = { ...TRACE_LIMITS, ...options };
  if (!Number.isInteger(limits.maxDepth) || limits.maxDepth < 0 || limits.maxDepth > 64 ||
    !Number.isInteger(limits.maxBranches) || limits.maxBranches < 1 || limits.maxBranches > 10000 ||
    !Number.isFinite(limits.minPower) || limits.minPower < 0) throw new RangeError('Invalid trace limits.');
  const result: TraceResult = {
    segments: [], hits: [], interactions: [], emittedByWavelength: new Map(),
    energy: { emitted: 0, detected: 0, absorbed: 0, escaped: 0, truncated: 0 }, branches: 0, limits,
  };
  const queue: Ray[] = [];
  const enqueue = (ray: Ray) => {
    if (ray.power <= 0) return;
    if (ray.power < limits.minPower || ray.depth > limits.maxDepth || result.branches >= limits.maxBranches) {
      result.energy.truncated += ray.power;
      return;
    }
    result.branches += 1;
    queue.push(ray);
  };
  for (const emitter of scene.elements) {
    if (emitter.kind !== 'emitter') continue;
    const wavelengths: readonly number[] = emitter.spectrum === 'white' ? WAVELENGTHS : [emitter.wavelength];
    result.energy.emitted += emitter.power;
    for (const wavelength of wavelengths) {
      result.emittedByWavelength.set(wavelength, (result.emittedByWavelength.get(wavelength) ?? 0) + emitter.power / wavelengths.length);
      for (let index = 0; index < emitter.rays; index += 1) {
        const fraction = emitter.rays === 1 ? 0 : index / (emitter.rays - 1) - 0.5;
        const power = emitter.power / (wavelengths.length * emitter.rays);
        enqueue({
          origin: add(emitter, rotate({ x: 0, y: fraction * emitter.aperture }, emitter.rotation)),
          direction: rotate({ x: 1, y: 0 }, emitter.rotation + fraction * emitter.spread),
          wavelength, power, rootPower: power, depth: 0, leg: 'source', white: emitter.spectrum === 'white',
        });
      }
    }
  }
  const boundary = [{ x: 0, y: 0 }, { x: BENCH.width, y: 0 }, { x: BENCH.width, y: BENCH.height }, { x: 0, y: BENCH.height }];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const ray = queue[cursor];
    if (ray.origin.x <= 0 || ray.origin.x >= BENCH.width || ray.origin.y <= 0 || ray.origin.y >= BENCH.height) {
      result.energy.escaped += ray.power;
      continue;
    }
    const exit = rayPolygon(ray.origin, ray.direction, boundary);
    if (!exit) throw new Error('A finite ray inside the bench must intersect its boundary.');
    let nearestDistance = exit.distance;
    const events: { element: OpticalElement; hit: Intersection }[] = [];
    for (const element of scene.elements) {
      const hit = intersectElement(ray.origin, ray.direction, element);
      if (hit) {
        events.push({ element, hit });
        nearestDistance = Math.min(nearestDistance, hit.distance);
      }
    }
    const coincident = events.filter(({ hit }) => hit.distance <= nearestDistance + EPSILON);
    // Absorption is resolved before any coincident surface can offset a new branch.
    const event = coincident.find(({ element }) => element.kind === 'detector') ?? coincident[0];
    const nearest = event?.hit ?? exit;
    const target = event?.element ?? null;
    const medium = mediumAt(scene.elements, ray.origin, ray.direction);
    const power = ray.power * Math.exp(-(medium === null ? 0 : MATERIALS[medium].absorption) * nearest.distance);
    result.energy.absorbed += ray.power - power;
    result.segments.push({
      start: ray.origin, end: nearest.point, wavelength: ray.wavelength, powerStart: ray.power, powerEnd: power,
      rootPower: ray.rootPower, depth: ray.depth, leg: ray.leg, white: ray.white, targetId: target?.id ?? null,
    });
    if (!target) {
      result.energy.escaped += power;
      continue;
    }
    if (target.kind === 'detector') {
      result.hits.push({ detectorId: target.id, wavelength: ray.wavelength, position: toLocal(nearest.point, target).x, point: nearest.point, power });
      result.energy.detected += power;
      continue;
    }
    if (ray.depth >= limits.maxDepth) {
      result.energy.truncated += power;
      continue;
    }
    const next = (direction: Vec, nextPower: number, leg: RaySegment['leg']) => enqueue({
      ...ray, origin: add(nearest.point, scale(direction, OFFSET)), direction, power: nextPower, depth: ray.depth + 1, leg,
    });
    if (target.kind === 'mirror') {
      result.energy.absorbed += power * (1 - target.reflectivity);
      next(reflect(ray.direction, nearest.normal), power * target.reflectivity, 'reflected');
    } else if (isRefractor(target)) {
      const n1 = materialIndex(medium, ray.wavelength);
      const n2 = materialIndex(mediumAt(scene.elements, nearest.point, ray.direction), ray.wavelength);
      const interaction = snell(ray.direction, nearest.normal, n1, n2);
      result.interactions.push({
        ...interaction, elementId: target.id, point: nearest.point, normal: nearest.normal, wavelength: ray.wavelength, n1, n2, power,
      });
      if (interaction.refracted) next(interaction.refracted, power * interaction.transmittance, 'transmitted');
      next(interaction.reflected, power * interaction.reflectance, 'reflected');
    }
  }
  return result;
}

export interface DetectorReading {
  power: number;
  capture: number;
  count: number;
  centroid: number | null;
  rmsWidth: number | null;
  separation: number | null;
  spectrum: { wavelength: number; power: number; capture: number; centroid: number | null }[];
}

export function measureDetector(trace: TraceResult, detector: Pick<Detector, 'id'>): DetectorReading {
  const hits = trace.hits.filter((hit) => hit.detectorId === detector.id);
  const power = hits.reduce((total, hit) => total + hit.power, 0);
  const centroid = power > 0 ? hits.reduce((total, hit) => total + hit.position * hit.power, 0) / power : null;
  const rmsWidth = centroid === null ? null : Math.sqrt(hits.reduce((total, hit) => total + (hit.position - centroid) ** 2 * hit.power, 0) / power);
  const spectrum = [...trace.emittedByWavelength].sort(([a], [b]) => a - b).map(([wavelength, emitted]) => {
    const band = hits.filter((hit) => hit.wavelength === wavelength);
    const bandPower = band.reduce((total, hit) => total + hit.power, 0);
    return {
      wavelength, power: bandPower, capture: emitted > 0 ? bandPower / emitted : 0,
      centroid: bandPower > 0 ? band.reduce((total, hit) => total + hit.position * hit.power, 0) / bandPower : null,
    };
  });
  const captured = spectrum.filter((band) => band.centroid !== null);
  const first = captured[0]?.centroid;
  const last = captured[captured.length - 1]?.centroid;
  const separation = captured.length > 1 && first !== null && first !== undefined && last !== null && last !== undefined ? Math.abs(last - first) : null;
  return { power, capture: trace.energy.emitted > 0 ? power / trace.energy.emitted : 0, count: hits.length, centroid, rmsWidth, separation, spectrum };
}

export function wavelengthColor(wavelength: number): string {
  const stops = [
    [380, 107, 64, 173], [420, 119, 70, 195], [460, 53, 103, 209], [500, 0, 147, 150],
    [540, 65, 153, 70], [580, 196, 153, 10], [620, 221, 98, 31], [660, 198, 53, 57], [750, 144, 38, 60],
  ];
  const position = clamp(wavelength, 380, 750);
  const upper = stops.findIndex((stop) => stop[0] >= position);
  const right = stops[Math.max(0, upper)];
  const left = stops[Math.max(0, upper - 1)];
  const fraction = right[0] === left[0] ? 0 : (position - left[0]) / (right[0] - left[0]);
  return `rgb(${[1, 2, 3].map((channel) => Math.round(left[channel] + (right[channel] - left[channel]) * fraction)).join(',')})`;
}
