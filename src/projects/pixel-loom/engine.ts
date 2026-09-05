export const GRID_SIZE = 16;
export const PIXEL_COUNT = GRID_SIZE * GRID_SIZE;
export const HISTORY_LIMIT = 60;

export type Pixel = string | null;
export type PixelGrid = Pixel[];
export type Symmetry = 'none' | 'left-right' | 'top-bottom' | 'both';
export type Transform = 'mirror-x' | 'mirror-y' | 'rotate-right';
export interface Point { x: number; y: number }
export interface Change { label: string; count: number }

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function isPixelGrid(value: unknown): value is PixelGrid {
  return Array.isArray(value) && value.length === PIXEL_COUNT
    && Array.from(value).every((pixel: unknown) => pixel === null || isColor(pixel));
}

function copyGrid(pixels: readonly Pixel[]): PixelGrid {
  if (!isPixelGrid(pixels)) throw new Error('Artwork must contain exactly 256 valid pixels.');
  return pixels.map((pixel) => pixel?.toLowerCase() ?? null);
}

function validPixel(pixel: Pixel): Pixel {
  if (pixel !== null && !isColor(pixel)) throw new Error('Use a six-digit hex color.');
  return pixel?.toLowerCase() ?? null;
}

export function emptyGrid(): PixelGrid {
  return Array<Pixel>(PIXEL_COUNT).fill(null);
}

export function gridFromPattern(
  rows: readonly string[],
  colors: Readonly<Record<string, string>>,
): PixelGrid {
  if (rows.length !== GRID_SIZE || rows.some((row) => row.length !== GRID_SIZE)) {
    throw new Error('A starter pattern must have 16 rows of 16 characters.');
  }
  return rows.join('').split('').map((symbol) => {
    if (symbol === '.') return null;
    const color = colors[symbol];
    if (!isColor(color)) throw new Error(`The starter color "${symbol}" is missing or invalid.`);
    return color.toLowerCase();
  });
}

export function isInside(point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= 0 && point.x < GRID_SIZE && point.y >= 0 && point.y < GRID_SIZE;
}

export function lineCells(from: Point, to: Point): Point[] {
  if (!isInside(from) || !isInside(to)) return [];
  const cells: Point[] = [];
  let { x, y } = from;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const stepX = x < to.x ? 1 : -1;
  const stepY = y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) return cells;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += stepX; }
    if (doubled <= dx) { error += dx; y += stepY; }
  }
}

export function mirroredCells(point: Point, symmetry: Symmetry): Point[] {
  if (!isInside(point)) return [];
  const xs = symmetry === 'left-right' || symmetry === 'both'
    ? [point.x, GRID_SIZE - 1 - point.x] : [point.x];
  const ys = symmetry === 'top-bottom' || symmetry === 'both'
    ? [point.y, GRID_SIZE - 1 - point.y] : [point.y];
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

export function paintLine(
  pixels: PixelGrid,
  from: Point,
  to: Point,
  color: Pixel,
  symmetry: Symmetry = 'none',
): void {
  const ink = validPixel(color);
  for (const cell of lineCells(from, to)) {
    for (const mirror of mirroredCells(cell, symmetry)) {
      pixels[mirror.y * GRID_SIZE + mirror.x] = ink;
    }
  }
}

export function floodFill(
  pixels: PixelGrid,
  origin: Point,
  color: Pixel,
  symmetry: Symmetry = 'none',
): void {
  const ink = validPixel(color);
  const selected = new Set<number>();
  // Find every mirrored region before changing any colors, so one fill cannot affect another.
  for (const seed of mirroredCells(origin, symmetry)) {
    const seedIndex = seed.y * GRID_SIZE + seed.x;
    const target = pixels[seedIndex];
    if (target === ink || selected.has(seedIndex)) continue;
    const queue = [seedIndex];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      if (selected.has(index) || pixels[index] !== target) continue;
      selected.add(index);
      const x = index % GRID_SIZE;
      const y = Math.floor(index / GRID_SIZE);
      if (x > 0) queue.push(index - 1);
      if (x < GRID_SIZE - 1) queue.push(index + 1);
      if (y > 0) queue.push(index - GRID_SIZE);
      if (y < GRID_SIZE - 1) queue.push(index + GRID_SIZE);
    }
  }
  for (const index of selected) pixels[index] = ink;
}

export function transformGrid(pixels: readonly Pixel[], transform: Transform): PixelGrid {
  const source = copyGrid(pixels);
  const result = emptyGrid();
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const next = transform === 'mirror-x'
        ? { x: GRID_SIZE - 1 - x, y }
        : transform === 'mirror-y'
          ? { x, y: GRID_SIZE - 1 - y }
          : { x: GRID_SIZE - 1 - y, y: x };
      result[next.y * GRID_SIZE + next.x] = source[y * GRID_SIZE + x];
    }
  }
  return result;
}

export function rasterize(pixels: readonly Pixel[], scale = 1, background: Pixel = null) {
  const source = copyGrid(pixels);
  const paper = validPixel(background);
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) {
    throw new Error('PNG scale must be a whole number between 1 and 32.');
  }
  const width = GRID_SIZE * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = source[Math.floor(y / scale) * GRID_SIZE + Math.floor(x / scale)] ?? paper;
      if (color === null) continue;
      const index = (y * width + x) * 4;
      data[index] = Number.parseInt(color.slice(1, 3), 16);
      data[index + 1] = Number.parseInt(color.slice(3, 5), 16);
      data[index + 2] = Number.parseInt(color.slice(5, 7), 16);
      data[index + 3] = 255;
    }
  }
  return { width, height: width, data };
}

interface Snapshot { pixels: PixelGrid; label: string }

export class PixelEditor {
  private grid: PixelGrid;
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private gesture: Snapshot | null = null;
  private readonly limit: number;

  constructor(pixels: readonly Pixel[], limit = HISTORY_LIMIT) {
    this.grid = copyGrid(pixels);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error('History must retain between 1 and 200 changes.');
    }
    this.limit = limit;
  }

  get pixels(): readonly Pixel[] { return this.grid; }
  get isEditing(): boolean { return this.gesture !== null; }
  get canUndo(): boolean { return !this.isEditing && this.past.length > 0; }
  get canRedo(): boolean { return !this.isEditing && this.future.length > 0; }
  get undoLabel(): string | undefined { return this.past.at(-1)?.label; }
  get redoLabel(): string | undefined { return this.future.at(-1)?.label; }
  get undoCount(): number { return this.past.length; }
  get redoCount(): number { return this.future.length; }

  snapshot(): PixelGrid { return this.grid.slice(); }

  begin(label: string): boolean {
    if (this.gesture) return false;
    this.gesture = { pixels: this.snapshot(), label };
    return true;
  }

  paint(from: Point, to: Point, color: Pixel, symmetry: Symmetry = 'none'): void {
    if (this.gesture) paintLine(this.grid, from, to, color, symmetry);
  }

  fill(point: Point, color: Pixel, symmetry: Symmetry = 'none'): void {
    if (this.gesture) floodFill(this.grid, point, color, symmetry);
  }

  commit(): Change | null {
    const before = this.gesture;
    if (!before) return null;
    this.gesture = null;
    const count = this.grid.reduce((sum, color, index) => sum + Number(color !== before.pixels[index]), 0);
    if (count === 0) return null;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return { label: before.label, count };
  }

  cancel(): boolean {
    if (!this.gesture) return false;
    this.grid = this.gesture.pixels;
    this.gesture = null;
    return true;
  }

  replace(pixels: readonly Pixel[], label: string): Change | null {
    const next = copyGrid(pixels);
    if (!this.begin(label)) return null;
    this.grid = next;
    return this.commit();
  }

  transform(transform: Transform, label: string): Change | null {
    return this.replace(transformGrid(this.grid, transform), label);
  }

  undo(): string | null {
    if (!this.canUndo) return null;
    const before = this.past.pop()!;
    this.future.push({ pixels: this.snapshot(), label: before.label });
    this.grid = before.pixels;
    return before.label;
  }

  redo(): string | null {
    if (!this.canRedo) return null;
    const next = this.future.pop()!;
    this.past.push({ pixels: this.snapshot(), label: next.label });
    this.grid = next.pixels;
    return next.label;
  }
}
