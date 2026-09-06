import { clamp } from '../../core/math';
import type { SandTool, Stencil } from './data';

export interface SandSnapshot {
  cells: Uint8Array;
  tick: number;
}

export class SandGrid {
  readonly cells: Uint8Array;
  tick = 0;

  constructor(readonly width = 192, readonly height = 152) {
    if (![width, height].every(Number.isInteger) || width < 20 || height < 20 || width > 256 || height > 256) {
      throw new RangeError('A sand tray needs 20-256 cells on each side.');
    }
    this.cells = new Uint8Array(width * height);
    this.empty();
  }

  empty(): void {
    this.cells.fill(0);
    this.tick = 0;
    for (let x = 0; x < this.width; x++) {
      this.cells[x] = 1;
      this.cells[x + (this.height - 1) * this.width] = 1;
    }
    for (let y = 0; y < this.height; y++) {
      this.cells[y * this.width] = 1;
      this.cells[y * this.width + this.width - 1] = 1;
    }
  }

  clearGrains(): void {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] > 1) this.cells[i] = 0;
  }

  countGrains(): number {
    let count = 0;
    for (const cell of this.cells) if (cell > 1) count++;
    return count;
  }

  snapshot(): SandSnapshot {
    return { cells: this.cells.slice(), tick: this.tick };
  }

  restore(snapshot: SandSnapshot): void {
    if (snapshot.cells.length !== this.cells.length || snapshot.cells.some((cell) => cell > 6)
      || !Number.isInteger(snapshot.tick) || snapshot.tick < 0) {
      throw new RangeError('That sand snapshot does not belong to this tray.');
    }
    for (let x = 0; x < this.width; x++) {
      if (snapshot.cells[x] !== 1 || snapshot.cells[x + (this.height - 1) * this.width] !== 1) {
        throw new RangeError('Sand snapshots must preserve the sealed tray boundary.');
      }
    }
    for (let y = 0; y < this.height; y++) {
      if (snapshot.cells[y * this.width] !== 1 || snapshot.cells[y * this.width + this.width - 1] !== 1) {
        throw new RangeError('Sand snapshots must preserve the sealed tray boundary.');
      }
    }
    this.cells.set(snapshot.cells);
    this.tick = snapshot.tick;
  }

  brush(x0: number, y0: number, x1: number, y1: number, radius: number, tool: SandTool, pigment = 4): number {
    if (![x0, y0, x1, y1, radius].every(Number.isFinite) || !Number.isInteger(pigment)
      || pigment < 2 || pigment > 6 || !['sand', 'wall', 'erase'].includes(tool)) {
      throw new RangeError('A sand brush needs finite coordinates and a known material.');
    }
    x0 = clamp(Math.round(x0), 0, this.width - 1);
    x1 = clamp(Math.round(x1), 0, this.width - 1);
    y0 = clamp(Math.round(y0), 0, this.height - 1);
    y1 = clamp(Math.round(y1), 0, this.height - 1);
    radius = clamp(Math.round(radius), 1, 10);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    let changed = 0;
    for (let n = 0; n <= steps; n++) {
      const cx = Math.round(x0 + (x1 - x0) * n / steps);
      const cy = Math.round(y0 + (y1 - y0) * n / steps);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || x >= this.width - 1 || y < 1 || y >= this.height - 1) continue;
          const index = x + y * this.width;
          const value = tool === 'erase' ? 0 : tool === 'wall' ? 1 : pigment;
          if ((tool !== 'sand' || this.cells[index] === 0) && this.cells[index] !== value) {
            this.cells[index] = value;
            changed++;
          }
        }
      }
    }
    return changed;
  }

  step(): number {
    let moved = 0;
    this.tick++;
    const width = this.width;
    for (let y = this.height - 2; y > 0; y--) {
      const reverse = ((y + this.tick) & 1) === 0;
      for (let n = 1; n < width - 1; n++) {
        const x = reverse ? width - 1 - n : n;
        const index = x + y * width;
        const cell = this.cells[index];
        if (cell < 2) continue;
        const down = index + width;
        // Bottom-up traversal means a moved grain cannot move a second time this tick.
        let target = down;
        if (this.cells[down]) {
          const side = ((x * 73 + y * 31 + this.tick * 17) & 2) ? -1 : 1;
          if (!this.cells[down + side]) target = down + side;
          else if (!this.cells[down - side]) target = down - side;
          else continue;
        }
        this.cells[target] = cell;
        this.cells[index] = 0;
        moved++;
      }
    }
    return moved;
  }

  load(stencil: Stencil): void {
    if (!['vessel', 'hourglass', 'terraces'].includes(stencil)) {
      throw new RangeError('Choose a known sand stencil.');
    }
    this.empty();
    const w = this.width;
    const h = this.height;
    const wall = (x0: number, y0: number, x1: number, y1: number, radius = 1) =>
      this.brush(x0 * w, y0 * h, x1 * w, y1 * h, radius, 'wall');
    const put = (x: number, y: number, cell: number) => {
      const i = x + y * w;
      if (!this.cells[i]) this.cells[i] = cell;
    };
    if (stencil === 'vessel') {
      wall(0.1, 0.23, 0.18, 0.87);
      wall(0.18, 0.87, 0.82, 0.87);
      wall(0.82, 0.87, 0.9, 0.23);
      for (let x = Math.ceil(w * 0.145); x < w * 0.855; x++) {
        const nx = x / w;
        const top = 0.46 - 0.18 * Math.exp(-(((nx - 0.37) / 0.2) ** 2))
          + 0.018 * Math.sin(nx * 24);
        for (let y = Math.ceil(top * h); y < h * 0.855; y++) {
          const ny = y / h;
          if (nx <= 0.1 + (ny - 0.23) * 0.125 + 0.017
            || nx >= 0.9 - (ny - 0.23) * 0.125 - 0.017) continue;
          const wave = ny + 0.055 * Math.sin(nx * 10) + 0.02 * Math.sin(nx * 25);
          const cell = wave > 0.78 ? 5 : wave > 0.68 ? 4 : wave > 0.57 ? 2 : wave > 0.48 ? 6 : 3;
          put(x, y, cell);
        }
      }
    } else if (stencil === 'hourglass') {
      wall(0.2, 0.13, 0.475, 0.48);
      wall(0.8, 0.13, 0.525, 0.48);
      wall(0.475, 0.52, 0.2, 0.88);
      wall(0.525, 0.52, 0.8, 0.88);
      wall(0.2, 0.88, 0.8, 0.88);
      for (let y = Math.ceil(h * 0.2); y < h * 0.45; y++) {
        const inset = (y / h - 0.13) / 0.35 * 0.275;
        for (let x = Math.ceil(w * (0.22 + inset)); x < w * (0.78 - inset); x++) {
          put(x, y, y / h < 0.27 ? 3 : y / h < 0.34 ? 4 : 5);
        }
      }
      for (let y = Math.ceil(h * 0.8); y < h * 0.865; y++) {
        for (let x = Math.ceil(w * 0.34); x < w * 0.66; x++) put(x, y, y / h < 0.82 ? 2 : 6);
      }
    } else {
      wall(0.16, 0.34, 0.55, 0.4);
      wall(0.46, 0.58, 0.85, 0.64);
      wall(0.14, 0.84, 0.72, 0.84);
      for (let y = Math.ceil(h * 0.16); y < h * 0.32; y++) {
        for (let x = Math.ceil(w * 0.22); x < w * 0.48; x++) put(x, y, y / h < 0.22 ? 3 : 4);
      }
      for (let y = Math.ceil(h * 0.47); y < h * 0.57; y++) {
        for (let x = Math.ceil(w * 0.53); x < w * 0.78; x++) put(x, y, y / h < 0.51 ? 2 : 5);
      }
      for (let y = Math.ceil(h * 0.74); y < h * 0.83; y++) {
        for (let x = Math.ceil(w * 0.2); x < w * 0.65; x++) put(x, y, 6);
      }
    }
    for (let step = 0; step < (stencil === 'hourglass' ? 12 : 56); step++) this.step();
  }
}
