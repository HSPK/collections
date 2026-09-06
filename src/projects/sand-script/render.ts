import { PIGMENTS } from './data';
import type { SandGrid } from './engine';

const PAPER = [241, 232, 211] as const;
const WALL = [68, 59, 55] as const;

export function trayBounds(width: number, height: number, grid: SandGrid) {
  const scale = Math.max(0.1, Math.min((width - 32) / grid.width, (height - 54) / grid.height));
  return { x: (width - grid.width * scale) / 2, y: (height - grid.height * scale) / 2 - 5,
    width: grid.width * scale, height: grid.height * scale, scale };
}

export class SandRenderer {
  private readonly sheet = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(private readonly grid: SandGrid) {
    this.sheet.width = grid.width;
    this.sheet.height = grid.height;
    const context = this.sheet.getContext('2d', { alpha: false });
    if (!context) throw new Error('The sand tray needs a 2D canvas.');
    this.context = context;
    this.image = context.createImageData(grid.width, grid.height);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const pixels = this.image.data;
    for (let i = 0; i < this.grid.cells.length; i++) {
      const cell = this.grid.cells[i];
      const grain = PIGMENTS[cell - 2];
      const rgb = grain ? grain.rgb : cell === 1 ? WALL : PAPER;
      const noise = ((Math.imul(i + 11, 127) ^ Math.imul((i / this.grid.width) | 0, 997)) & 15) - 7;
      const shade = cell === 0 ? noise * 0.22 : noise;
      const offset = i * 4;
      pixels[offset] = rgb[0] + shade;
      pixels[offset + 1] = rgb[1] + shade;
      pixels[offset + 2] = rgb[2] + shade;
      pixels[offset + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
    const bounds = trayBounds(width, height, this.grid);
    ctx.save();
    ctx.fillStyle = '#e7dac0';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#d1c1a2';
    ctx.fillRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
    ctx.fillStyle = '#f8f0df';
    ctx.fillRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.sheet, bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = '#6d6153';
    ctx.font = '12px Georgia, serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SAND / a landscape in layers', bounds.x, height - 7);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.grid.width} : ${this.grid.height}`, bounds.x + bounds.width, height - 7);
    ctx.restore();
  }

  dispose(): void {
    this.sheet.width = 0;
    this.sheet.height = 0;
  }
}
