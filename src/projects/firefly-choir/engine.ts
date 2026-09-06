import { clamp, random } from '../../core/math';

export const TAU = Math.PI * 2;
export const MIN_FIREFLIES = 40;
export const MAX_FIREFLIES = 280;
export const NEIGHBOR_RADIUS = 0.18;
export const MAX_CANDIDATES = 48;
export const BASE_FREQUENCY = TAU / 4.2;
export const MEADOW = { left: 0.08, right: 0.93, top: 0.25, bottom: 0.85 } as const;

const GRID_SIDE = Math.ceil(1 / NEIGHBOR_RADIUS);
const RADIUS_SQUARED = NEIGHBOR_RADIUS ** 2;
const SEPARATION_SQUARED = 0.035 ** 2;
const MAX_SPEED = 0.042;

export interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  frequency: number;
  depth: number;
  drift: number;
}

export interface ChoirOptions {
  count?: number;
  coupling?: number;
  breeze?: number;
  seed?: number;
}

export interface Torch {
  enabled: boolean;
  x: number;
  y: number;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function wrapPhase(phase: number): number {
  return ((phase % TAU) + TAU) % TAU;
}

export function flashLevel(phase: number): number {
  return Math.max(0, Math.cos(phase)) ** 6;
}

export function phaseCoherence(fireflies: readonly Pick<Firefly, 'phase'>[]): number {
  if (!fireflies.length) return 0;
  let real = 0;
  let imaginary = 0;
  for (const firefly of fireflies) {
    real += Math.cos(firefly.phase);
    imaginary += Math.sin(firefly.phase);
  }
  return clamp(Math.hypot(real, imaginary) / fireflies.length, 0, 1);
}

export class ChoirEngine {
  readonly fireflies: Firefly[] = [];
  readonly torch: Torch = { enabled: false, x: 0.52, y: 0.56 };
  time = 0;
  candidateChecks = 0;
  private couplingValue = 2.8;
  private breezeValue = 0.12;
  private readonly rng: () => number;
  private readonly buckets: number[][] = Array.from(
    { length: GRID_SIDE * GRID_SIDE },
    () => [],
  );
  private readonly next = new Float64Array(MAX_FIREFLIES * 5);
  private tick = 0;

  constructor(options: ChoirOptions = {}) {
    this.rng = random(finite(options.seed ?? 43017, 43017));
    this.setCoupling(options.coupling ?? 2.8);
    this.setBreeze(options.breeze ?? 0.12);
    this.setCount(options.count ?? 160);
  }

  get coupling(): number { return this.couplingValue; }
  get breeze(): number { return this.breezeValue; }
  get coherence(): number { return phaseCoherence(this.fireflies); }

  setCoupling(value: number): void {
    this.couplingValue = clamp(finite(value, 2.8), 0, 5);
  }

  setBreeze(value: number): void {
    this.breezeValue = clamp(finite(value, 0), -1, 1);
  }

  setCount(value: number): void {
    const count = Math.round(clamp(finite(value, 160), MIN_FIREFLIES, MAX_FIREFLIES));
    if (count < this.fireflies.length) this.fireflies.length = count;
    while (this.fireflies.length < count) {
      const x = 0.15 + (this.rng() + this.rng()) * 0.36;
      const y = 0.34 + (this.rng() + this.rng()) * 0.205;
      const direction = this.rng() * TAU;
      this.fireflies.push({
        x,
        y,
        vx: Math.cos(direction) * 0.012,
        vy: Math.sin(direction) * 0.01,
        phase: this.rng() * TAU,
        frequency: BASE_FREQUENCY + (this.rng() - 0.5) * 0.16,
        depth: 0.25 + this.rng() * 0.75,
        drift: this.rng() * TAU,
      });
    }
  }

  setTorch(x: number, y: number, enabled = this.torch.enabled): void {
    this.torch.x = clamp(finite(x, 0.52), MEADOW.left, MEADOW.right);
    this.torch.y = clamp(finite(y, 0.56), MEADOW.top, MEADOW.bottom);
    this.torch.enabled = enabled;
  }

  scatterPhases(): void {
    for (const firefly of this.fireflies) firefly.phase = this.rng() * TAU;
  }

  step(delta: number): void {
    const dt = clamp(finite(delta, 0), 0, 0.05);
    if (!dt) return;
    this.time += dt;
    this.tick += 1;
    this.candidateChecks = 0;
    for (const bucket of this.buckets) bucket.length = 0;
    for (let i = 0; i < this.fireflies.length; i += 1) {
      const firefly = this.fireflies[i];
      const cellX = Math.min(GRID_SIDE - 1, Math.floor(firefly.x / NEIGHBOR_RADIUS));
      const cellY = Math.min(GRID_SIDE - 1, Math.floor(firefly.y / NEIGHBOR_RADIUS));
      this.buckets[cellY * GRID_SIDE + cellX].push(i);
    }

    for (let i = 0; i < this.fireflies.length; i += 1) {
      const firefly = this.fireflies[i];
      const cellX = Math.floor(firefly.x / NEIGHBOR_RADIUS);
      const cellY = Math.floor(firefly.y / NEIGHBOR_RADIUS);
      let checks = 0;
      let weight = 0;
      let phasePull = 0;
      let centerX = 0;
      let centerY = 0;
      let velocityX = 0;
      let velocityY = 0;
      let separationX = 0;
      let separationY = 0;

      // Rotate the bounded sample so dense cells do not always favor the same lights.
      for (let visit = 0; visit < 9 && checks < MAX_CANDIDATES; visit += 1) {
        const cellOffset = (visit + i + this.tick) % 9;
        const x = cellX + cellOffset % 3 - 1;
        const y = cellY + Math.floor(cellOffset / 3) - 1;
        if (x < 0 || y < 0 || x >= GRID_SIDE || y >= GRID_SIDE) continue;
        const bucket = this.buckets[y * GRID_SIDE + x];
        const start = bucket.length ? (i * 17 + this.tick) % bucket.length : 0;
        for (let n = 0; n < bucket.length && checks < MAX_CANDIDATES; n += 1) {
          const otherIndex = bucket[(start + n) % bucket.length];
          checks += 1;
          if (otherIndex === i) continue;
          const other = this.fireflies[otherIndex];
          const dx = other.x - firefly.x;
          const dy = other.y - firefly.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= RADIUS_SQUARED) continue;
          const influence = 1 - distanceSquared / RADIUS_SQUARED;
          weight += influence;
          phasePull += Math.sin(other.phase - firefly.phase) * influence;
          centerX += other.x * influence;
          centerY += other.y * influence;
          velocityX += other.vx * influence;
          velocityY += other.vy * influence;
          if (distanceSquared < SEPARATION_SQUARED) {
            separationX -= dx / Math.max(0.0002, distanceSquared);
            separationY -= dy / Math.max(0.0002, distanceSquared);
          }
        }
      }
      this.candidateChecks += checks;

      let ax = Math.cos(firefly.drift + this.time * 0.71) * 0.007;
      let ay = Math.sin(firefly.drift * 1.7 + this.time * 0.57) * 0.005;
      let phaseVelocity = firefly.frequency;
      if (weight > 0) {
        phaseVelocity += this.couplingValue * phasePull / weight;
        ax += (centerX / weight - firefly.x) * 0.065
          + (velocityX / weight - firefly.vx) * 0.4;
        ay += (centerY / weight - firefly.y) * 0.065
          + (velocityY / weight - firefly.vy) * 0.4;
      }
      ax += separationX * 0.000045 + this.breezeValue * 0.008;
      ay += separationY * 0.000045;

      if (this.torch.enabled) {
        const dx = this.torch.x - firefly.x;
        const dy = this.torch.y - firefly.y;
        const influence = Math.max(0, 1 - (dx * dx + dy * dy) / 0.21 ** 2);
        ax += dx * influence * 0.13;
        ay += dy * influence * 0.13;
        phaseVelocity += 2.4 * influence
          * Math.sin(this.time * BASE_FREQUENCY - firefly.phase);
      }

      ax += Math.max(0, MEADOW.left + 0.07 - firefly.x) * 0.7
        - Math.max(0, firefly.x - MEADOW.right + 0.07) * 0.7;
      ay += Math.max(0, MEADOW.top + 0.06 - firefly.y) * 0.7
        - Math.max(0, firefly.y - MEADOW.bottom + 0.06) * 0.7;

      let vx = (firefly.vx + ax * dt) * (1 - 0.32 * dt);
      let vy = (firefly.vy + ay * dt) * (1 - 0.32 * dt);
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) {
        vx *= MAX_SPEED / speed;
        vy *= MAX_SPEED / speed;
      }
      const rawX = firefly.x + vx * dt;
      const rawY = firefly.y + vy * dt;
      if (rawX < MEADOW.left || rawX > MEADOW.right) vx *= -0.7;
      if (rawY < MEADOW.top || rawY > MEADOW.bottom) vy *= -0.7;
      const offset = i * 5;
      this.next[offset] = clamp(rawX, MEADOW.left, MEADOW.right);
      this.next[offset + 1] = clamp(rawY, MEADOW.top, MEADOW.bottom);
      this.next[offset + 2] = vx;
      this.next[offset + 3] = vy;
      this.next[offset + 4] = wrapPhase(firefly.phase + phaseVelocity * dt);
    }

    // Commit together: no oscillator reads a neighbor's already-advanced phase.
    for (let i = 0; i < this.fireflies.length; i += 1) {
      const firefly = this.fireflies[i];
      const offset = i * 5;
      firefly.x = this.next[offset];
      firefly.y = this.next[offset + 1];
      firefly.vx = this.next[offset + 2];
      firefly.vy = this.next[offset + 3];
      firefly.phase = this.next[offset + 4];
    }
  }

  dispose(): void {
    this.fireflies.length = 0;
    for (const bucket of this.buckets) bucket.length = 0;
  }
}
