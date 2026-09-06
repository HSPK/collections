import { clamp, random } from '../../core/math';
import type { Pigment } from './data';

export interface Pour {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pigment: Pigment;
  amount?: number;
  radius?: number;
  tracers?: number;
}

const SPEED_LIMIT = 0.95;
const DENSITY_LIMIT = 5;

export class InkWater {
  readonly stride: number;
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly dyes: [Float32Array, Float32Array, Float32Array];
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly previousX: Float32Array;
  readonly previousY: Float32Array;
  readonly pigment: Uint8Array;
  readonly strength: Float32Array;
  count = 0;
  viscosity = 0.00015;
  private cursor = 0;
  private readonly sourceU: Float32Array;
  private readonly sourceV: Float32Array;
  private readonly sourceDye: Float32Array;
  private readonly forwardDye: Float32Array;
  private readonly pressure: Float32Array;
  private readonly divergence: Float32Array;
  private readonly curl: Float32Array;
  private rng = random(42817);

  constructor(readonly cols = 100, readonly rows = 112, readonly capacity = 7200) {
    if (![cols, rows, capacity].every(Number.isInteger)
      || cols < 12 || rows < 12 || cols > 128 || rows > 128 || capacity < 1 || capacity > 10000) {
      throw new RangeError('Ink grids need 12-128 cells per side and 1-10,000 tracers.');
    }
    this.stride = cols + 2;
    const length = this.stride * (rows + 2);
    this.u = new Float32Array(length);
    this.v = new Float32Array(length);
    this.dyes = [new Float32Array(length), new Float32Array(length), new Float32Array(length)];
    this.sourceU = new Float32Array(length);
    this.sourceV = new Float32Array(length);
    this.sourceDye = new Float32Array(length);
    this.forwardDye = new Float32Array(length);
    this.pressure = new Float32Array(length);
    this.divergence = new Float32Array(length);
    this.curl = new Float32Array(length);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.pigment = new Uint8Array(capacity);
    this.strength = new Float32Array(capacity);
  }

  clear(): void {
    for (const buffer of [this.u, this.v, ...this.dyes, this.sourceU, this.sourceV,
      this.sourceDye, this.forwardDye, this.pressure, this.divergence, this.curl, this.strength]) buffer.fill(0);
    this.count = 0;
    this.cursor = 0;
    this.rng = random(42817);
  }

  inject(pour: Pour): void {
    if (![pour.x, pour.y, pour.vx, pour.vy, pour.amount ?? 1, pour.radius ?? 0.036,
      pour.tracers ?? 80].every(Number.isFinite) || ![0, 1, 2].includes(pour.pigment)) {
      throw new RangeError('A pour needs finite coordinates, momentum, and a known pigment.');
    }
    const x = clamp(pour.x, 0.025, 0.975);
    const y = clamp(pour.y, 0.025, 0.975);
    const radius = clamp(pour.radius ?? 0.036, 0.009, 0.12);
    const amount = clamp(pour.amount ?? 1, 0, 2);
    const vx = clamp(pour.vx, -SPEED_LIMIT, SPEED_LIMIT);
    const vy = clamp(pour.vy, -SPEED_LIMIT, SPEED_LIMIT);
    const startX = Math.max(1, Math.floor((x - radius * 2.5) * this.cols));
    const endX = Math.min(this.cols, Math.ceil((x + radius * 2.5) * this.cols));
    const startY = Math.max(1, Math.floor((y - radius * 2.5) * this.rows));
    const endY = Math.min(this.rows, Math.ceil((y + radius * 2.5) * this.rows));
    for (let j = startY; j <= endY; j++) {
      for (let i = startX; i <= endX; i++) {
        const distance = ((i - 0.5) / this.cols - x) ** 2 + ((j - 0.5) / this.rows - y) ** 2;
        const weight = Math.exp(-distance / (radius * radius * 0.7));
        const index = i + j * this.stride;
        this.dyes[pour.pigment][index] = Math.min(DENSITY_LIMIT,
          this.dyes[pour.pigment][index] + weight * amount * 0.55);
        this.u[index] = clamp(this.u[index] + vx * weight * amount, -SPEED_LIMIT, SPEED_LIMIT);
        this.v[index] = clamp(this.v[index] + vy * weight * amount, -SPEED_LIMIT, SPEED_LIMIT);
      }
    }
    const tracers = clamp(Math.round(pour.tracers ?? 80), 0, 180);
    for (let n = 0; n < tracers; n++) {
      const index = this.cursor;
      const angle = this.rng() * Math.PI * 2;
      const spread = Math.sqrt(this.rng()) * radius;
      this.x[index] = this.previousX[index] = clamp(x + Math.cos(angle) * spread, 0.005, 0.995);
      this.y[index] = this.previousY[index] = clamp(y + Math.sin(angle) * spread, 0.005, 0.995);
      this.pigment[index] = pour.pigment;
      this.strength[index] = 0.45 + this.rng() * 0.55;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.count = Math.min(this.count + 1, this.capacity);
    }
  }

  private boundary(field: Float32Array, direction: 0 | 1 | 2): void {
    const s = this.stride;
    for (let y = 1; y <= this.rows; y++) {
      field[y * s] = (direction === 1 ? -1 : 1) * field[y * s + 1];
      field[y * s + this.cols + 1] = (direction === 1 ? -1 : 1) * field[y * s + this.cols];
    }
    for (let x = 1; x <= this.cols; x++) {
      field[x] = (direction === 2 ? -1 : 1) * field[x + s];
      field[x + (this.rows + 1) * s] = (direction === 2 ? -1 : 1) * field[x + this.rows * s];
    }
    field[0] = (field[1] + field[s]) * 0.5;
    field[this.cols + 1] = (field[this.cols] + field[this.cols + 1 + s]) * 0.5;
    const bottom = (this.rows + 1) * s;
    field[bottom] = (field[bottom + 1] + field[bottom - s]) * 0.5;
    field[bottom + this.cols + 1] = (field[bottom + this.cols] + field[bottom + this.cols + 1 - s]) * 0.5;
  }

  private sample(field: Float32Array, x: number, y: number): number {
    const gx = clamp(x * this.cols + 0.5, 0.5, this.cols + 0.5);
    const gy = clamp(y * this.rows + 0.5, 0.5, this.rows + 0.5);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const ax = gx - x0;
    const ay = gy - y0;
    const i = x0 + y0 * this.stride;
    return (field[i] * (1 - ax) + field[i + 1] * ax) * (1 - ay)
      + (field[i + this.stride] * (1 - ax) + field[i + this.stride + 1] * ax) * ay;
  }

  private diffuse(field: Float32Array, source: Float32Array, direction: 1 | 2, dt: number): void {
    source.set(field);
    const ax = this.viscosity * dt * this.cols * this.cols;
    const ay = this.viscosity * dt * this.rows * this.rows;
    const divisor = 1 + 2 * (ax + ay);
    for (let pass = 0; pass < 4; pass++) {
      for (let y = 1; y <= this.rows; y++) {
        for (let x = 1; x <= this.cols; x++) {
          const i = x + y * this.stride;
          field[i] = (source[i] + ax * (field[i - 1] + field[i + 1])
            + ay * (field[i - this.stride] + field[i + this.stride])) / divisor;
        }
      }
      this.boundary(field, direction);
    }
  }

  project(iterations = 18): void {
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) {
      throw new RangeError('Pressure projection needs 1-100 iterations.');
    }
    const s = this.stride;
    const ax = this.cols * this.cols;
    const ay = this.rows * this.rows;
    this.boundary(this.u, 1);
    this.boundary(this.v, 2);
    this.pressure.fill(0);
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * s;
        this.divergence[i] = 0.5 * (this.cols * (this.u[i + 1] - this.u[i - 1])
          + this.rows * (this.v[i + s] - this.v[i - s]));
      }
    }
    for (let pass = 0; pass < iterations; pass++) {
      for (let y = 1; y <= this.rows; y++) {
        for (let x = 1; x <= this.cols; x++) {
          const i = x + y * s;
          this.pressure[i] = (ax * (this.pressure[i - 1] + this.pressure[i + 1])
            + ay * (this.pressure[i - s] + this.pressure[i + s]) - this.divergence[i]) / (2 * (ax + ay));
        }
      }
      this.boundary(this.pressure, 0);
    }
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * s;
        this.u[i] -= 0.5 * this.cols * (this.pressure[i + 1] - this.pressure[i - 1]);
        this.v[i] -= 0.5 * this.rows * (this.pressure[i + s] - this.pressure[i - s]);
      }
    }
    this.boundary(this.u, 1);
    this.boundary(this.v, 2);
  }

  private advect(target: Float32Array, source: Float32Array, dt: number, decay = 1): void {
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * this.stride;
        const px = (x - 0.5) / this.cols - this.u[i] * dt;
        const py = (y - 0.5) / this.rows - this.v[i] * dt;
        target[i] = this.sample(source, px, py) * decay;
      }
    }
  }

  private transportDye(dye: Float32Array, dt: number): void {
    this.sourceDye.set(dye);
    this.advect(this.forwardDye, this.sourceDye, dt);
    this.boundary(this.forwardDye, 0);
    const decay = Math.exp(-dt * 0.016);
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * this.stride;
        const px = (x - 0.5) / this.cols;
        const py = (y - 0.5) / this.rows;
        const gx = clamp(x - this.u[i] * dt * this.cols, 0.5, this.cols + 0.5);
        const gy = clamp(y - this.v[i] * dt * this.rows, 0.5, this.rows + 0.5);
        const j = Math.floor(gx) + Math.floor(gy) * this.stride;
        const a = this.sourceDye[j];
        const b = this.sourceDye[j + 1];
        const c = this.sourceDye[j + this.stride];
        const d = this.sourceDye[j + this.stride + 1];
        const reverse = this.sample(this.forwardDye, px + this.u[i] * dt, py + this.v[i] * dt);
        // A locally limited forward/backward correction retains wisps without new extrema.
        const corrected = this.forwardDye[i] + (this.sourceDye[i] - reverse) * 0.5;
        dye[i] = clamp(corrected, Math.min(a, b, c, d), Math.max(a, b, c, d)) * decay;
      }
    }
    this.boundary(dye, 0);
  }

  step(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(this.viscosity)
      || this.viscosity < 0 || this.viscosity > 0.005) {
      throw new RangeError('Fluid time and viscosity must be finite and within the model bounds.');
    }
    if (delta === 0) return;
    const dt = Math.min(delta, 0.04);
    const s = this.stride;
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * s;
        this.curl[i] = 0.5 * (this.cols * (this.v[i + 1] - this.v[i - 1])
          - this.rows * (this.u[i + s] - this.u[i - s]));
      }
    }
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * s;
        const nx = Math.abs(this.curl[i + 1]) - Math.abs(this.curl[i - 1]);
        const ny = Math.abs(this.curl[i + s]) - Math.abs(this.curl[i - s]);
        const length = Math.hypot(nx, ny) + 0.00001;
        const confinement = this.curl[i] * 0.05 * dt;
        const density = this.dyes[0][i] + this.dyes[1][i] + this.dyes[2][i];
        this.u[i] = clamp((this.u[i] + ny / length * confinement) * Math.exp(-dt * 0.12),
          -SPEED_LIMIT, SPEED_LIMIT);
        this.v[i] = clamp((this.v[i] - nx / length * confinement + Math.min(3, density) * dt * 0.026)
          * Math.exp(-dt * 0.12), -SPEED_LIMIT, SPEED_LIMIT);
      }
    }
    this.diffuse(this.u, this.sourceU, 1, dt);
    this.diffuse(this.v, this.sourceV, 2, dt);
    this.project();
    this.advect(this.sourceU, this.u, dt);
    this.advect(this.sourceV, this.v, dt);
    this.u.set(this.sourceU);
    this.v.set(this.sourceV);
    this.project(12);
    for (let i = 0; i < this.u.length; i++) {
      this.u[i] = clamp(this.u[i], -SPEED_LIMIT, SPEED_LIMIT);
      this.v[i] = clamp(this.v[i], -SPEED_LIMIT, SPEED_LIMIT);
    }
    for (const dye of this.dyes) this.transportDye(dye, dt);
    for (let n = 0; n < this.count; n++) {
      this.previousX[n] = this.x[n];
      this.previousY[n] = this.y[n];
      this.x[n] = clamp(this.x[n] + this.sample(this.u, this.x[n], this.y[n]) * dt, 0.006, 0.994);
      this.y[n] = clamp(this.y[n] + this.sample(this.v, this.previousX[n], this.y[n]) * dt, 0.006, 0.994);
      this.strength[n] *= Math.exp(-dt * 0.035);
    }
  }

  seedScene(): void {
    this.clear();
    const viscosity = this.viscosity;
    this.viscosity = 0.000025;
    const pour = (drop: Pour) => this.inject({
      ...drop,
      x: 0.5 + (drop.x - 0.5) * 1.5,
      y: 0.16 + (drop.y - 0.16) * 1.5,
      vx: drop.vx * 1.5,
      vy: drop.vy * 1.5,
      radius: (drop.radius ?? 0.036) * 1.5,
    });
    for (let n = 0; n < 84; n++) {
      if (n < 54) {
        pour({ x: 0.44 + Math.sin(n * 0.15) * 0.025, y: 0.13 + n * 0.0017,
          vx: Math.cos(n * 0.19) * 0.19, vy: 0.24, pigment: 0,
          amount: 0.48 + 0.28 * Math.sin(n * 0.9) ** 2, tracers: 95, radius: 0.022 });
      }
      if (n > 12 && n < 50) {
        pour({ x: 0.65 - n * 0.00055, y: 0.17 + n * 0.0012,
          vx: -0.1 + Math.sin(n * 0.2) * 0.04, vy: 0.22,
          pigment: 2, amount: 0.24, tracers: 46, radius: 0.021 });
      }
      if (n > 27 && n < 60) {
        pour({ x: 0.38 + n * 0.001, y: 0.41, vx: -0.16, vy: 0.08,
          pigment: 0, amount: 0.16, tracers: 30, radius: 0.018 });
      }
      this.step(0.028);
    }
    this.viscosity = viscosity;
  }

  divergenceRms(): number {
    let sum = 0;
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const i = x + y * this.stride;
        const value = 0.5 * (this.cols * (this.u[i + 1] - this.u[i - 1])
          + this.rows * (this.v[i + this.stride] - this.v[i - this.stride]));
        sum += value * value;
      }
    }
    return Math.sqrt(sum / (this.cols * this.rows));
  }

  centroid(pigment: Pigment): { x: number; y: number; mass: number } {
    let sumX = 0;
    let sumY = 0;
    let mass = 0;
    for (let y = 1; y <= this.rows; y++) {
      for (let x = 1; x <= this.cols; x++) {
        const value = this.dyes[pigment][x + y * this.stride];
        mass += value;
        sumX += value * (x - 0.5) / this.cols;
        sumY += value * (y - 0.5) / this.rows;
      }
    }
    return { x: mass ? sumX / mass : 0, y: mass ? sumY / mass : 0, mass };
  }
}
