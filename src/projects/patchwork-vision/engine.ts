import { BACKGROUND, COLORS, PATCH_COUNT, SHAPES, TILE_SIZE } from './data';
import type {
  Descriptor, DescriptorResult, Features, MatchResult, Patch, Pooling, ShapeId, VisualToken,
} from './types';

const zeroFeatures = (): Features => [0, 0, 0, 0, 0, 0, 0];

function assertVector(vector: readonly number[]): void {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Vectors must contain finite numbers and at least one coordinate.');
  }
}

export function normalize(vector: readonly number[]): number[] {
  assertVector(vector);
  const scale = vector.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  if (scale === 0) return vector.map(() => 0);
  const scaled = vector.map((value) => value / scale);
  const length = Math.hypot(...scaled);
  return scaled.map((value) => value / length);
}

export function dot(left: readonly number[], right: readonly number[]): number {
  assertVector(left);
  assertVector(right);
  if (left.length !== right.length) throw new RangeError('Vector dimensions must agree.');
  const result = left.reduce((sum, value, index) => sum + value * right[index], 0);
  if (!Number.isFinite(result)) throw new RangeError('Dot product overflowed the numerical range.');
  return result;
}

export function cosine(left: readonly number[], right: readonly number[]): number | null {
  const unitLeft = normalize(left);
  const unitRight = normalize(right);
  if (left.length !== right.length) throw new RangeError('Vector dimensions must agree.');
  if (!unitLeft.some((value) => value !== 0) || !unitRight.some((value) => value !== 0)) return null;
  return Math.max(-1, Math.min(1, dot(unitLeft, unitRight)));
}

export function templateMask(shape: ShapeId): Uint8Array {
  if (!SHAPES.some((item) => item.id === shape)) throw new RangeError('Unknown shape template.');
  const mask = new Uint8Array(TILE_SIZE * TILE_SIZE);
  const center = TILE_SIZE / 2;
  const radius = 10;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const inside = shape === 'circle'
        ? dx * dx + dy * dy <= radius * radius
        : shape === 'square'
          ? Math.abs(dx) <= radius && Math.abs(dy) <= radius
          : dy >= -radius && dy <= radius && Math.abs(dx) <= (dy + radius) / 2;
      mask[y * TILE_SIZE + x] = inside ? 1 : 0;
    }
  }
  return mask;
}

const TEMPLATES = SHAPES.map((shape) => templateMask(shape.id));

export function rasterizePatch(patch: Patch): Uint8ClampedArray {
  const color = COLORS.find((item) => item.id === patch.color);
  if (!color) throw new RangeError('Unknown paint color.');
  const mask = patch.shape === 'empty' ? null : templateMask(patch.shape);
  const pixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  for (let index = 0; index < TILE_SIZE * TILE_SIZE; index++) {
    const rgb = mask?.[index] ? color.rgb : BACKGROUND;
    pixels.set([...rgb, 255], index * 4);
  }
  return pixels;
}

export function extractFeatures(pixels: Uint8ClampedArray): VisualToken {
  if (pixels.length !== TILE_SIZE * TILE_SIZE * 4) {
    throw new RangeError(`A patch must be ${TILE_SIZE} by ${TILE_SIZE} RGBA pixels.`);
  }
  const features = zeroFeatures();
  const foreground = new Uint8Array(TILE_SIZE * TILE_SIZE);
  let occupied = 0;
  for (let index = 0; index < foreground.length; index++) {
    const offset = index * 4;
    if (pixels[offset + 3] !== 255) throw new RangeError('Only opaque synthetic pixels are supported.');
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    if (rgb.every((value, channel) => value === BACKGROUND[channel])) continue;
    const colorIndex = COLORS.findIndex((color) =>
      rgb.every((value, channel) => value === color.rgb[channel]));
    if (colorIndex < 0) throw new RangeError('Pixels must use the four declared paint colors or background.');
    occupied++;
    foreground[index] = 1;
    features[colorIndex]++;
  }
  if (occupied === 0) {
    return { features, unit: [...features], coverage: 0, affinities: [0, 0, 0] };
  }
  for (let index = 0; index < COLORS.length; index++) features[index] /= occupied;
  const affinities: [number, number, number] = [0, 0, 0];
  TEMPLATES.forEach((template, shapeIndex) => {
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < foreground.length; index++) {
      if (foreground[index] && template[index]) intersection++;
      if (foreground[index] || template[index]) union++;
    }
    affinities[shapeIndex] = Math.exp(-12 * (1 - intersection / union));
  });
  const shapeFeatures = normalize(affinities);
  for (let index = 0; index < SHAPES.length; index++) features[COLORS.length + index] = shapeFeatures[index];
  return {
    features,
    unit: normalize(features),
    coverage: occupied / foreground.length,
    affinities,
  };
}

export function parseDescriptor(text: string): DescriptorResult {
  if (text.length > 120) return { ok: false, message: 'Use a short descriptor, up to 120 characters.' };
  const cleaned = text.trim().toLowerCase().replace(/[.,!?]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const vocabulary = ['a', 'an', 'the', 'shape', ...COLORS.map((color) => color.id), ...SHAPES.map((shape) => shape.id)];
  const unknown = words.filter((word) => !vocabulary.includes(word));
  if (unknown.length) {
    return {
      ok: false,
      message: `Unsupported words: ${[...new Set(unknown)].join(', ')}. This fixed vocabulary has no objects, relations, negation, or world knowledge.`,
    };
  }
  const colors = COLORS.filter((color) => words.includes(color.id));
  const shapes = SHAPES.filter((shape) => words.includes(shape.id));
  if (colors.length > 1 || shapes.length > 1) {
    return { ok: false, message: 'Use at most one color and one shape. Combinations of several objects are not represented.' };
  }
  if (!colors.length && !shapes.length) {
    return { ok: false, message: 'Name a color (red, blue, gold, teal), a shape (circle, square, triangle), or one of each.' };
  }
  const features = zeroFeatures();
  const color = colors[0]?.id ?? null;
  const shape = shapes[0]?.id ?? null;
  if (color) features[COLORS.findIndex((item) => item.id === color)] = 1;
  if (shape) features[COLORS.length + SHAPES.findIndex((item) => item.id === shape)] = 1;
  return {
    ok: true,
    descriptor: { text: cleaned, color, shape, features, unit: normalize(features) },
  };
}

export function maskedSoftmax(
  values: readonly number[],
  active: readonly boolean[],
  temperature: number,
): number[] {
  assertVector(values);
  if (values.length !== active.length) throw new RangeError('The patch mask must match the scores.');
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError('Attention temperature must be finite and strictly positive.');
  }
  const present = values.filter((_, index) => active[index]);
  if (present.length === 0) return values.map(() => 0);
  const max = Math.max(...present);
  const exponentials = values.map((value, index) =>
    active[index] ? Math.exp((value - max) / temperature) : 0);
  const sum = exponentials.reduce((total, value) => total + value, 0);
  return exponentials.map((value) => value / sum);
}

export function entropyBits(weights: readonly number[]): number {
  assertVector(weights);
  if (weights.some((value) => value < 0 || value > 1)) throw new RangeError('Weights must be probabilities.');
  return -weights.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
}

export function matchImage(
  patches: readonly Patch[],
  descriptor: Descriptor,
  temperature: number,
  pooling: Pooling = 'attention',
): MatchResult {
  if (patches.length !== PATCH_COUNT) throw new RangeError(`An image needs exactly ${PATCH_COUNT} patches.`);
  if (pooling !== 'attention' && pooling !== 'mean') throw new RangeError('Unknown pooling mode.');
  if (descriptor.unit.length !== 7) throw new RangeError('Text descriptors must have seven dimensions.');
  assertVector(descriptor.unit);
  const tokens = patches.map((patch) => extractFeatures(rasterizePatch(patch)));
  const active = tokens.map((token) => token.coverage > 0);
  const activeCount = active.filter(Boolean).length;
  const similarities = tokens.map((token) => cosine(token.unit, descriptor.unit));
  const attention = maskedSoftmax(similarities.map((value) => value ?? 0), active, temperature);
  const weights = pooling === 'attention'
    ? attention
    : active.map((value) => value ? 1 / activeCount : 0);
  const contributions = tokens.map((token, index) => token.unit.map((value) => value * weights[index]));
  const pooled = Array.from({ length: 7 }, (_, dimension) =>
    contributions.reduce((sum, vector) => sum + vector[dimension], 0));
  const mean = Array.from({ length: 7 }, (_, dimension) => activeCount === 0 ? 0 :
    tokens.reduce((sum, token) => sum + token.unit[dimension], 0) / activeCount);
  return {
    tokens, similarities, weights, pooled, contributions, activeCount,
    cosine: cosine(pooled, descriptor.unit),
    meanCosine: cosine(mean, descriptor.unit),
    weightedSimilarity: activeCount ? weights.reduce((sum, weight, index) =>
      sum + weight * (similarities[index] ?? 0), 0) : null,
    entropy: entropyBits(weights),
  };
}
