import { clamp, random } from '../../core/math';
import { DEFAULT_SEED, getPreset } from './data';
import type { NurseryPreset, Point3, PresetId } from './data';

export interface ParticleBudget {
  dust: number;
  volume: number;
  shadow: number;
  field: number;
}

export const MAX_BUDGET: Readonly<ParticleBudget> = {
  dust: 7800,
  volume: 420,
  shadow: 84,
  field: 1300,
};

export const LIGHT_BUDGET: Readonly<ParticleBudget> = {
  dust: 4800,
  volume: 280,
  shadow: 56,
  field: 900,
};

export interface ParticleLayer {
  position: Float32Array;
  anchor: Float32Array;
  color: Float32Array;
  size: Float32Array;
  phase: Float32Array;
}

export interface NurseryGeometry {
  dust: ParticleLayer;
  volume: ParticleLayer;
  shadow: ParticleLayer;
  field: ParticleLayer;
  seeds: ParticleLayer;
}

export interface FormationState {
  formation: number;
  wind: number;
  phase: number;
}

const TAU = Math.PI * 2;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const unit = (value: number) => clamp(finite(value, 0), 0, 1);
const gaussian = (rng: () => number) => (rng() + rng() + rng() + rng() + rng() + rng() - 3) * 0.78;

function layer(count: number): ParticleLayer {
  return {
    position: new Float32Array(count * 3),
    anchor: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    size: new Float32Array(count),
    phase: new Float32Array(count),
  };
}

function linearColor(hex: string): Point3 {
  const n = Number.parseInt(hex.slice(1), 16);
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return [linear((n >> 16) & 255), linear((n >> 8) & 255), linear(n & 255)];
}

function nearestAnchor(point: Point3, anchors: readonly Point3[]): Point3 {
  let nearest = anchors[0]!;
  let distance = Infinity;
  for (const anchor of anchors) {
    const next = (point[0] - anchor[0]) ** 2 + (point[1] - anchor[1]) ** 2 + (point[2] - anchor[2]) ** 2;
    if (next < distance) {
      distance = next;
      nearest = anchor;
    }
  }
  return nearest;
}

function cloudPoint(preset: NurseryPreset, rng: () => number, shadow: boolean): Point3 {
  if (preset.id === 'cradle') {
    const t = rng();
    const x = (t - 0.5) * 7.1;
    const seam = x * 0.39 + Math.sin(t * 8.5) * 0.3;
    const thickness = 0.3 + Math.sin(t * Math.PI) * 0.5;
    const bank = rng() < 0.5 ? -1 : 1;
    return [
      x + gaussian(rng) * 0.36,
      seam + (shadow ? gaussian(rng) * 0.15 : bank * thickness * 0.7 + gaussian(rng) * thickness * 0.6),
      Math.sin(t * 7.2) * 0.6 + gaussian(rng) * (shadow ? 0.25 : 0.88) + (shadow ? 0.72 : bank * 0.16),
    ];
  }

  if (preset.id === 'binary') {
    if (rng() < 0.17) {
      const x = (rng() - 0.5) * 3.3;
      return [x, Math.sin(x * 1.5) * 0.3 + gaussian(rng) * 0.16, gaussian(rng) * 0.28];
    }
    const side = rng() < 0.5 ? -1 : 1;
    return [
      side * 1.65 + gaussian(rng) * 1.08,
      side * 0.34 + gaussian(rng) * (shadow ? 0.22 : 1.06),
      side * -0.55 + gaussian(rng) * 1.1 + (shadow ? 0.82 : 0),
    ];
  }

  const height = rng() * 2 - 1;
  const angle = rng() * TAU;
  const plane = Math.sqrt(Math.max(0, 1 - height * height));
  const radius = 2.06 + gaussian(rng) * 0.18 + Math.sin(angle * 3 + height * 4) * 0.14;
  return [
    Math.cos(angle) * plane * radius * 1.31,
    height * radius * 0.87,
    Math.sin(angle) * plane * radius * 0.93 + (shadow ? 0.15 : 0),
  ];
}

function fillCloud(target: ParticleLayer, preset: NurseryPreset, rng: () => number, kind: 'dust' | 'volume' | 'shadow') {
  const palette = preset.palette.map(linearColor);
  for (let i = 0; i < target.size.length; i++) {
    const point = cloudPoint(preset, rng, kind === 'shadow');
    const anchor = nearestAnchor(point, preset.anchors);
    const phase = rng() * TAU;
    const warm = clamp(0.5 - point[0] * 0.13 + point[2] * 0.18 + gaussian(rng) * 0.16, 0, 1);
    const cool = palette[0]!;
    const amber = palette[1]!;
    const violet = palette[2]!;
    const violetMix = rng() * 0.32;
    target.position.set(point, i * 3);
    target.anchor.set(anchor, i * 3);
    for (let axis = 0; axis < 3; axis++) {
      target.color[i * 3 + axis] = (cool[axis]! * (1 - warm) + amber[axis]! * warm) * (1 - violetMix) + violet[axis]! * violetMix;
    }
    target.phase[i] = phase;
    target.size[i] = kind === 'dust' ? 0.9 + rng() ** 3 * 2.8
      : kind === 'volume' ? 46 + rng() * 66
      : 42 + rng() * 68;
  }
}

export function createNursery(
  id: PresetId,
  seed = DEFAULT_SEED,
  requested: Partial<ParticleBudget> = {},
): NurseryGeometry {
  const preset = getPreset(id);
  const rng = random(Math.floor(finite(seed, DEFAULT_SEED)));
  const count = (kind: keyof ParticleBudget) =>
    Math.floor(clamp(finite(requested[kind] ?? MAX_BUDGET[kind], MAX_BUDGET[kind]), 0, MAX_BUDGET[kind]));
  const geometry: NurseryGeometry = {
    dust: layer(count('dust')),
    volume: layer(count('volume')),
    shadow: layer(count('shadow')),
    field: layer(count('field')),
    seeds: layer(preset.anchors.length),
  };
  fillCloud(geometry.dust, preset, rng, 'dust');
  fillCloud(geometry.volume, preset, rng, 'volume');
  fillCloud(geometry.shadow, preset, rng, 'shadow');

  for (let i = 0; i < geometry.field.size.length; i++) {
    const angle = rng() * TAU;
    const height = rng() * 2 - 1;
    const plane = Math.sqrt(1 - height * height);
    const radius = 15 + rng() * 12;
    const point: Point3 = [Math.cos(angle) * plane * radius, height * radius, Math.sin(angle) * plane * radius];
    const warmth = rng();
    geometry.field.position.set(point, i * 3);
    geometry.field.anchor.set(point, i * 3);
    geometry.field.color.set([0.5 + warmth * 0.35, 0.55 + warmth * 0.22, 0.69 + warmth * 0.1], i * 3);
    geometry.field.size[i] = 1.05 + rng() ** 5 * 2.7;
    geometry.field.phase[i] = rng() * TAU;
  }

  preset.anchors.forEach((anchor, index) => {
    geometry.seeds.position.set(anchor, index * 3);
    geometry.seeds.anchor.set(anchor, index * 3);
    geometry.seeds.color.set(index % 2 ? [0.65, 0.76, 1] : [1, 0.77, 0.48], index * 3);
    geometry.seeds.size[index] = index === 1 ? 106 : 58 + rng() * 34;
    geometry.seeds.phase[index] = rng() * TAU;
  });
  return geometry;
}

/** CPU counterpart of the bounded displacement in shaders.ts; no particle-particle forces. */
export function transformParticle(position: Point3, anchor: Point3, phase: number, state: FormationState): Point3 {
  const formation = unit(state.formation);
  const wind = unit(state.wind);
  const time = finite(state.phase, 0) % TAU;
  const particlePhase = finite(phase, 0);
  const scale = (1 - formation * 0.62) * (1 + wind * 0.65) * (1 + wind * 0.065 * Math.sin(time + particlePhase));
  const center = 1 - formation * 0.1 + wind * 0.08;
  const amplitude = (0.035 + wind * 0.11) * (1 - formation * 0.45);
  const x = anchor[0] * center + (position[0] - anchor[0]) * scale;
  const y = anchor[1] * center + (position[1] - anchor[1]) * scale;
  const z = anchor[2] * center + (position[2] - anchor[2]) * scale;
  return [
    x + Math.sin(time + particlePhase + z * 0.6) * amplitude,
    y + Math.cos(time * 2 + particlePhase * 0.8 + x * 0.5) * amplitude,
    z + Math.sin(time + particlePhase * 0.7 + y * 0.6) * amplitude,
  ];
}

export function advancePhase(phase: number, delta: number, paused = false): number {
  const safePhase = finite(phase, 0);
  const current = safePhase >= 0 && safePhase < TAU ? safePhase : ((safePhase % TAU) + TAU) % TAU;
  if (paused) return current;
  return (current + clamp(finite(delta, 0), 0, 0.05) * 0.14) % TAU;
}
