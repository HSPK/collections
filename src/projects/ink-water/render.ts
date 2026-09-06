import { INKS } from './data';
import type { InkWater } from './engine';

export class WaterRenderer {
  private readonly sheet = document.createElement('canvas');
  private readonly sheetContext: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(private readonly engine: InkWater) {
    this.sheet.width = engine.cols;
    this.sheet.height = engine.rows;
    const context = this.sheet.getContext('2d');
    if (!context) throw new Error('The pigment layer needs a 2D canvas.');
    this.sheetContext = context;
    this.image = context.createImageData(engine.cols, engine.rows);
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    const { engine } = this;
    const pixels = this.image.data;
    for (let y = 0; y < engine.rows; y++) {
      for (let x = 0; x < engine.cols; x++) {
        const index = x + 1 + (y + 1) * engine.stride;
        const a = engine.dyes[0][index];
        const b = engine.dyes[1][index];
        const c = engine.dyes[2][index];
        const density = a + b + c;
        const pixel = (x + y * engine.cols) * 4;
        if (density < 0.0001) {
          pixels[pixel + 3] = 0;
          continue;
        }
        for (let channel = 0; channel < 3; channel++) {
          pixels[pixel + channel] = (a * INKS[0].rgb[channel] + b * INKS[1].rgb[channel]
            + c * INKS[2].rgb[channel]) / density;
        }
        pixels[pixel + 3] = (1 - Math.exp(-density * 2.15)) * 249;
      }
    }
    this.sheetContext.putImageData(this.image, 0, 0);
    context.save();
    const water = context.createLinearGradient(0, 0, width, height);
    water.addColorStop(0, '#f8faf9');
    water.addColorStop(0.6, '#edf2f5');
    water.addColorStop(1, '#f3f2f5');
    context.fillStyle = water;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.sheet, 0, 0, width, height);
    context.lineCap = 'round';
    context.lineWidth = Math.max(0.55, Math.min(1, width / 1000));
    for (let pigment = 0; pigment < INKS.length; pigment++) {
      context.strokeStyle = INKS[pigment].color;
      context.globalAlpha = 0.12;
      context.beginPath();
      for (let n = 0; n < engine.count; n++) {
        if (engine.pigment[n] !== pigment || engine.strength[n] < 0.1) continue;
        const x = engine.x[n] * width;
        const y = engine.y[n] * height;
        context.moveTo(engine.previousX[n] * width - 0.25, engine.previousY[n] * height);
        context.lineTo(x + 0.25, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(61, 79, 110, 0.13)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(20, 26);
    context.lineTo(width - 20, 26);
    context.stroke();
    context.restore();
  }

  dispose(): void {
    this.sheet.width = 0;
    this.sheet.height = 0;
  }
}
