import { clamp, lerp } from '../../core/math';

export interface Point { x: number; y: number }
export type GestureId = 'flower' | 'tree' | 'wind';
export interface GestureTemplate {
  id: GestureId;
  points: readonly Point[];
  closed?: boolean;
}

export interface Recognition {
  accepted: boolean;
  command: GestureId | null;
  nearest: GestureId | null;
  score: number;
  distance: number | null;
  reason: 'matched' | 'too-small' | 'too-long' | 'invalid' | 'shape' | 'loop-shape' | 'ambiguous';
}

export const SAMPLE_COUNT = 64;
export const MAX_STROKE_POINTS = 1024;
export const MIN_STROKE_LENGTH = 52;
export const MATCH_THRESHOLD = 0.86;
const MIN_MARGIN = 0.045;
const ROTATIONS = [-12, -6, 0, 6, 12].map((degrees) => degrees * Math.PI / 180);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function length(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

function bounds(points: readonly Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

/** Arc-length sampling uses a forward-only cursor, never an insertion loop. */
export function resample(points: readonly Point[], count = SAMPLE_COUNT): Point[] {
  if (points.length < 2 || !Number.isInteger(count) || count < 2 || count > 128) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (!Number.isFinite(total) || total <= 0) return [];
  const sampled: Point[] = [];
  let segment = 1;
  for (let i = 0; i < count; i += 1) {
    const target = total * i / (count - 1);
    while (segment < points.length - 1 && cumulative[segment] < target) segment += 1;
    const span = cumulative[segment] - cumulative[segment - 1];
    const t = span > 0 ? clamp((target - cumulative[segment - 1]) / span, 0, 1) : 0;
    sampled.push({
      x: lerp(points[segment - 1].x, points[segment].x, t),
      y: lerp(points[segment - 1].y, points[segment].y, t),
    });
  }
  return sampled;
}

function normalize(points: readonly Point[], closed: boolean): Point[] {
  const sampled = closed
    ? resample([...points, points[0]], SAMPLE_COUNT + 1).slice(0, SAMPLE_COUNT)
    : resample(points);
  if (!sampled.length) return [];
  const box = bounds(sampled);
  const scale = Math.max(box.width, box.height);
  if (scale < 1e-8) return [];
  const center = sampled.reduce((sum, point) => ({
    x: sum.x + point.x / sampled.length,
    y: sum.y + point.y / sampled.length,
  }), { x: 0, y: 0 });
  return sampled.map((point) => ({
    x: (point.x - center.x) / scale,
    y: (point.y - center.y) / scale,
  }));
}

function rotate(points: readonly Point[], angle: number): Point[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return points.map(({ x, y }) => ({ x: x * cosine - y * sine, y: x * sine + y * cosine }));
}

function shapeDistance(candidate: readonly Point[], template: readonly Point[], closed: boolean): number {
  let best = Infinity;
  for (const angle of ROTATIONS) {
    const rotated = rotate(candidate, angle);
    for (const reversed of [false, true]) {
      const points = reversed ? rotated.slice().reverse() : rotated;
      for (let shift = 0; shift < (closed ? SAMPLE_COUNT : 1); shift += 2) {
        let total = 0;
        for (let i = 0; i < SAMPLE_COUNT; i += 1) {
          total += distance(points[(i + shift) % SAMPLE_COUNT], template[i]);
        }
        best = Math.min(best, total / SAMPLE_COUNT);
      }
    }
  }
  return best;
}

function isRoundLoop(points: readonly Point[]): boolean {
  const box = bounds(points);
  const diameter = Math.max(box.width, box.height);
  if (distance(points[0], points[points.length - 1]) > diameter * 0.24) return false;
  if (Math.min(box.width, box.height) / diameter < 0.62) return false;
  const loop = resample([...points, points[0]], SAMPLE_COUNT + 1);
  let twiceArea = 0;
  for (let i = 1; i < loop.length; i += 1) {
    twiceArea += loop[i - 1].x * loop[i].y - loop[i].x * loop[i - 1].y;
  }
  const perimeter = length(loop);
  const circularity = 2 * Math.PI * Math.abs(twiceArea) / (perimeter * perimeter);
  // Closing a square or a self-crossing scribble must not silently plant a flower.
  return circularity >= 0.81;
}

function reject(reason: Recognition['reason']): Recognition {
  return { accepted: false, command: null, nearest: null, score: 0, distance: null, reason };
}

export function createRecognizer(templates: readonly GestureTemplate[]) {
  if (!templates.length || templates.length > 32 || templates.some((template) =>
    template.points.length < 2 || template.points.length > MAX_STROKE_POINTS
    || template.points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)
      || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000))) {
    throw new Error('Use 1–32 gesture templates, each with 2–1024 finite, bounded points.');
  }
  const prepared = templates.map((template) => ({
    ...template,
    normalized: normalize(template.points, Boolean(template.closed)),
  }));
  if (!prepared.length || prepared.some((template) => template.normalized.length !== SAMPLE_COUNT)) {
    throw new Error('Glyph templates need at least two distinct, finite points.');
  }

  return {
    recognize(raw: readonly Point[]): Recognition {
      if (raw.length > MAX_STROKE_POINTS) return reject('too-long');
      if (raw.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)
        || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000)) return reject('invalid');
      const points = raw.filter((point, index) => index === 0 || distance(raw[index - 1], point) > 0.01);
      if (points.length < 3) return reject('too-small');
      const box = bounds(points);
      const longest = Math.max(box.width, box.height);
      const pathLength = length(points);
      if (longest < 26 || pathLength < MIN_STROKE_LENGTH) return reject('too-small');
      if (pathLength > longest * 8) return reject('too-long');

      const open = normalize(points, false);
      const closed = normalize(points, true);
      const scores = new Map<GestureId, { score: number; distance: number }>();
      for (const template of prepared) {
        const matchDistance = shapeDistance(template.closed ? closed : open, template.normalized, Boolean(template.closed));
        const score = clamp(1 - matchDistance / Math.SQRT1_2, 0, 1);
        if (score > (scores.get(template.id)?.score ?? -1)) {
          scores.set(template.id, { score, distance: matchDistance });
        }
      }
      const ranked = [...scores].sort((a, b) => b[1].score - a[1].score);
      const [nearest, result] = ranked[0];
      const shapeAllowed = nearest !== 'flower' || isRoundLoop(points);
      const margin = result.score - (ranked[1]?.[1].score ?? 0);
      const accepted = shapeAllowed && result.score >= MATCH_THRESHOLD && margin >= MIN_MARGIN;
      return {
        accepted,
        command: accepted ? nearest : null,
        nearest,
        score: result.score,
        distance: result.distance,
        reason: accepted ? 'matched' : !shapeAllowed ? 'loop-shape'
          : result.score >= MATCH_THRESHOLD ? 'ambiguous' : 'shape',
      };
    },
  };
}
