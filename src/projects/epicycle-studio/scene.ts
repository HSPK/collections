import { chainAt, reconstruct } from './engine';
import type { Coefficient, FourierDrawing, Point } from './engine';

export interface PlotModel {
  drawing: FourierDrawing;
  coefficients: readonly Coefficient[];
  path: readonly Point[];
}

export interface PlotOptions {
  phase: number;
  circles: boolean;
  source: boolean;
  sketch: readonly Point[] | null;
  cursor: Point;
}

export interface PlotView {
  x: number;
  y: number;
  scale: number;
}

export function plotView(width: number, height: number, model: PlotModel, sketching: boolean): PlotView {
  const radius = sketching ? 1.15 : Math.max(1.05,
    Math.hypot(model.drawing.dc.re, model.drawing.dc.im)
    + model.coefficients.slice(1).reduce((sum, term) => sum + term.amplitude, 0));
  return { x: width / 2, y: height / 2, scale: Math.max(1, Math.min(width - 44, height - 64) / (2 * radius)) };
}

export function pointFromCanvas(x: number, y: number, view: PlotView): Point {
  return { x: (x - view.x) / view.scale, y: (view.y - y) / view.scale };
}

export function drawPlot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  model: PlotModel,
  options: PlotOptions,
): void {
  const view = plotView(width, height, model, options.sketch !== null);
  const px = (point: Point) => view.x + point.x * view.scale;
  const py = (point: Point) => view.y - point.y * view.scale;
  const strokePath = (points: readonly Point[], close = false) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(px(points[0]), py(points[0]));
    for (let index = 1; index < points.length; index++) ctx.lineTo(px(points[index]), py(points[index]));
    if (close) ctx.closePath();
    ctx.stroke();
  };

  ctx.fillStyle = '#f5f2e8';
  // Fractional CSS sizes must still clear the last device pixel on every frame.
  ctx.fillRect(0, 0, Math.ceil(width), Math.ceil(height));
  ctx.save();
  ctx.strokeStyle = '#deded2';
  ctx.lineWidth = 0.65;
  const grid = view.scale / 5;
  ctx.beginPath();
  for (let x = view.x % grid; x < width; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = view.y % grid; y < height; y += grid) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();
  ctx.strokeStyle = '#b9c6b9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(view.x, 0); ctx.lineTo(view.x, height);
  ctx.moveTo(0, view.y); ctx.lineTo(width, view.y);
  ctx.stroke();
  ctx.fillStyle = '#607466';
  ctx.font = '12px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Im / y', view.x + 9, 20);
  ctx.textAlign = 'right';
  ctx.fillText('Re / x', width - 12, view.y - 10);
  ctx.textAlign = 'left';
  for (const value of [-1, 1]) {
    const point = { x: value, y: 0 };
    if (px(point) > 20 && px(point) < width - 30) ctx.fillText(String(value), px(point) + 4, view.y + 18);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (options.sketch !== null) {
    ctx.strokeStyle = '#155d4e';
    ctx.lineWidth = 2.5;
    strokePath(options.sketch);
    if (options.sketch.length > 1) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#ae6144';
      strokePath([options.sketch[options.sketch.length - 1], options.sketch[0]]);
      ctx.setLineDash([]);
    }
    for (const point of [options.sketch[0], options.sketch[options.sketch.length - 1]]) {
      if (!point) continue;
      ctx.fillStyle = '#cf4c28';
      ctx.beginPath();
      ctx.arc(px(point), py(point), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#cf4c28';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(options.cursor), py(options.cursor), 7, 0, Math.PI * 2);
    ctx.moveTo(px(options.cursor) - 12, py(options.cursor));
    ctx.lineTo(px(options.cursor) + 12, py(options.cursor));
    ctx.moveTo(px(options.cursor), py(options.cursor) - 12);
    ctx.lineTo(px(options.cursor), py(options.cursor) + 12);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (options.source) {
    ctx.strokeStyle = '#a59e8c';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 5]);
    strokePath(model.drawing.samples, true);
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#8aa899';
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  strokePath(model.path);
  ctx.globalAlpha = 1;

  if (options.circles) {
    const chain = chainAt(model.coefficients, options.phase);
    for (let index = 0; index < chain.length; index++) {
      const circle = chain[index];
      const radius = circle.radius * view.scale;
      if (radius < 0.4) continue;
      ctx.strokeStyle = index < 3 ? '#577da5a6' : '#577da568';
      ctx.lineWidth = index < 3 ? 1.2 : 0.9;
      ctx.beginPath();
      ctx.arc(px(circle.center), py(circle.center), radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = circle.frequency < 0 ? '#b67754a6' : '#557eaba6';
      strokePath([circle.center, circle.end]);
      ctx.fillStyle = '#577da5';
      ctx.beginPath();
      ctx.arc(px(circle.end), py(circle.end), index < 3 ? 2.4 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const pen = reconstruct(model.coefficients, options.phase);
  const segments = model.path.length - 1;
  const end = Math.floor(options.phase * segments);
  ctx.strokeStyle = '#155d4e';
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  ctx.moveTo(px(model.path[0]), py(model.path[0]));
  for (let index = 1; index <= end; index++) ctx.lineTo(px(model.path[index]), py(model.path[index]));
  ctx.lineTo(px(pen), py(pen));
  ctx.stroke();

  const mean = { x: model.drawing.dc.re, y: model.drawing.dc.im };
  ctx.fillStyle = '#233c34';
  ctx.beginPath();
  ctx.arc(px(mean), py(mean), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '12px Consolas, monospace';
  ctx.fillText('DC', px(mean) + 8, py(mean) + 16);
  ctx.strokeStyle = '#cf4c28';
  ctx.fillStyle = '#f5f2e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px(pen), py(pen), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#cf4c28';
  ctx.beginPath();
  ctx.arc(px(pen), py(pen), 2.2, 0, Math.PI * 2);
  ctx.fill();

  const start = model.path[0];
  ctx.fillStyle = '#155d4e';
  ctx.beginPath();
  ctx.arc(px(start), py(start), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#607466';
  ctx.font = '12px Consolas, monospace';
  ctx.fillText('128 samples / closed path', 14, height - 15);
  ctx.restore();
}
