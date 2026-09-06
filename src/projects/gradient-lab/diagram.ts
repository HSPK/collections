import { canvas2D } from '../../core/canvas';
import type { CanvasSize } from '../../core/canvas';
import { clamp, lerp } from '../../core/math';
import { getOptimizer } from './data';
import type { Surface } from './data';
import { inBounds, inverseSignedLog, magnitude, signedLog } from './engine';
import type { Bounds, Method, OptimizerRun, Point } from './engine';
import { sampleTerrain } from './contours';
import type { Terrain } from './contours';

export interface LandscapeModel {
  surface: Surface;
  start: Point;
  runs: readonly OptimizerRun[];
  selected: Method;
  showGradients: boolean;
}

interface PlotFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

function plotFrame(size: CanvasSize): PlotFrame {
  const left = size.width < 450 ? 38 : 48;
  return { left, top: 24, width: Math.max(1, size.width - left - 20), height: Math.max(1, size.height - 62) };
}

function project(point: Point, bounds: Bounds, frame: PlotFrame): Point {
  return {
    x: frame.left + (point.x - bounds.xMin) / (bounds.xMax - bounds.xMin) * frame.width,
    y: frame.top + (bounds.yMax - point.y) / (bounds.yMax - bounds.yMin) * frame.height,
  };
}

function plotNumber(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  if (Math.abs(value) >= 10000 || Math.abs(value) < 0.001) return value.toExponential(1);
  return String(Number(value.toPrecision(3)));
}

function line(context: CanvasRenderingContext2D, start: Point, end: Point) {
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
}

function arrow(context: CanvasRenderingContext2D, start: Point, end: Point, head = 5) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.beginPath();
  line(context, start, end);
  context.moveTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  context.lineTo(end.x, end.y);
  context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  context.stroke();
}

function label(context: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#a4c3cc') {
  context.font = '12px ui-monospace, monospace';
  context.textAlign = 'left';
  const width = context.measureText(text).width;
  context.fillStyle = '#0b1c28';
  context.fillRect(x - 4, y - 12, width + 8, 18);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function marker(context: CanvasRenderingContext2D, position: Point, method: Method, radius: number) {
  context.beginPath();
  if (method === 'momentum') {
    context.moveTo(position.x, position.y - radius - 1);
    context.lineTo(position.x + radius + 1, position.y + radius);
    context.lineTo(position.x - radius - 1, position.y + radius);
    context.closePath();
  } else if (method === 'adam') {
    context.rect(position.x - radius, position.y - radius, radius * 2, radius * 2);
  } else {
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  surface: Surface,
  terrain: Terrain,
  showGradients: boolean,
) {
  const frame = plotFrame(size);
  const at = (point: Point) => project(point, surface.bounds, frame);
  context.fillStyle = '#0a1925';
  context.fillRect(0, 0, size.width, size.height);
  const minimum = signedLog(terrain.minimum);
  const range = Math.max(0.001, signedLog(terrain.maximum) - minimum);

  for (let row = 0; row < terrain.rows; row++) {
    for (let column = 0; column < terrain.columns; column++) {
      const value = terrain.values[row * (terrain.columns + 1) + column];
      const low = 1 - clamp((signedLog(value) - minimum) / range, 0, 1);
      context.fillStyle = `rgb(${Math.round(10 + low * 3)}, ${Math.round(25 + low * 19)}, ${Math.round(38 + low * 16)})`;
      context.fillRect(
        frame.left + column / terrain.columns * frame.width,
        frame.top + (1 - (row + 1) / terrain.rows) * frame.height,
        frame.width / terrain.columns + 1, frame.height / terrain.rows + 1,
      );
    }
  }

  context.save();
  context.beginPath();
  context.rect(frame.left, frame.top, frame.width, frame.height);
  context.clip();
  context.lineWidth = 1;
  context.strokeStyle = '#66869924';
  context.beginPath();
  for (let index = 0; index <= 8; index++) {
    const x = frame.left + index / 8 * frame.width;
    const y = frame.top + index / 8 * frame.height;
    line(context, { x, y: frame.top }, { x, y: frame.top + frame.height });
    line(context, { x: frame.left, y }, { x: frame.left + frame.width, y });
  }
  context.stroke();

  terrain.contours.forEach((contour, index) => {
    context.strokeStyle = contour.level === 0 ? '#b6c9c578' : index % 3 === 0 ? '#7cb5a475' : '#61988c48';
    context.lineWidth = index % 3 === 0 ? 1.1 : 0.8;
    context.beginPath();
    for (const [start, end] of contour.segments) line(context, at(start), at(end));
    context.stroke();
    if (index % 3 === 0 && contour.segments.length > 8) {
      const point = at(contour.segments[Math.floor(contour.segments.length * (0.25 + (index % 4) * 0.12))][0]);
      if (point.x < frame.left + frame.width - 40 && point.y > frame.top + 18) {
        label(context, plotNumber(contour.level), point.x, point.y);
      }
    }
  });

  if (showGradients) {
    context.strokeStyle = '#85a5bc80';
    context.lineWidth = 1;
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 9; column++) {
        const point = {
          x: lerp(surface.bounds.xMin, surface.bounds.xMax, (column + 0.5) / 9),
          y: lerp(surface.bounds.yMin, surface.bounds.yMax, (row + 0.5) / 6),
        };
        const gradient = surface.gradient(point);
        if (magnitude(gradient) < 1e-12) continue;
        const start = at(point);
        const direction = {
          x: gradient.x / (surface.bounds.xMax - surface.bounds.xMin) * frame.width,
          y: -gradient.y / (surface.bounds.yMax - surface.bounds.yMin) * frame.height,
        };
        const length = magnitude(direction);
        const end = { x: start.x + direction.x / length * 13, y: start.y + direction.y / length * 13 };
        arrow(context, start, end, 4);
      }
    }
  }

  const landmark = at(surface.landmark.point);
  context.strokeStyle = '#d4e2d3';
  context.lineWidth = 1;
  context.beginPath();
  line(context, { x: landmark.x - 5, y: landmark.y }, { x: landmark.x + 5, y: landmark.y });
  line(context, { x: landmark.x, y: landmark.y - 5 }, { x: landmark.x, y: landmark.y + 5 });
  context.stroke();
  const landmarkWidth = context.measureText(surface.landmark.label).width;
  label(context, surface.landmark.label,
    clamp(landmark.x + 12, frame.left + 5, frame.left + frame.width - landmarkWidth - 5),
    landmark.y + 22, '#b6ccc1');
  context.restore();

  context.strokeStyle = '#496477';
  context.lineWidth = 1;
  context.strokeRect(frame.left, frame.top, frame.width, frame.height);
  context.font = '12px ui-monospace, monospace';
  context.fillStyle = '#9fb7c6';
  for (let index = 0; index <= 4; index++) {
    const fraction = index / 4;
    context.textAlign = 'center';
    context.fillText(plotNumber(lerp(surface.bounds.xMin, surface.bounds.xMax, fraction)),
      frame.left + fraction * frame.width, frame.top + frame.height + 20);
    context.textAlign = 'right';
    context.fillText(plotNumber(lerp(surface.bounds.yMax, surface.bounds.yMin, fraction)),
      frame.left - 8, frame.top + fraction * frame.height + 4);
  }
  context.textAlign = 'left';
  context.fillText('y', frame.left, 14);
  context.textAlign = 'right';
  context.fillText('weight x', frame.left + frame.width, size.height - 3);
}

function drawPaths(context: CanvasRenderingContext2D, size: CanvasSize, model: LandscapeModel) {
  const frame = plotFrame(size);
  const at = (point: Point) => project(point, model.surface.bounds, frame);
  context.save();
  context.beginPath();
  context.rect(frame.left, frame.top, frame.width, frame.height);
  context.clip();
  const start = at(model.start);
  context.strokeStyle = '#edf1dd';
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(start.x, start.y, 11, 0, Math.PI * 2);
  context.stroke();
  label(context, 'shared start',
    clamp(start.x + 17, frame.left + 5, frame.left + frame.width - 94),
    clamp(start.y - 13, frame.top + 18, frame.top + frame.height - 8), '#edf1dd');

  const ordered = [...model.runs].sort((a, b) => Number(a.method === model.selected) - Number(b.method === model.selected));
  for (const run of ordered) {
    const info = getOptimizer(run.method);
    context.strokeStyle = info.color;
    context.lineWidth = run.method === model.selected ? 2.7 : 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.setLineDash(info.dash);
    context.beginPath();
    run.history.forEach((sample, index) => {
      const point = at(sample.position);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
    context.setLineDash([]);
    if (inBounds(run.position, model.surface.bounds)) {
      const point = at(run.position);
      context.fillStyle = info.color;
      context.strokeStyle = '#0a1925';
      context.lineWidth = 2;
      marker(context, point, run.method, run.method === model.selected ? 5 : 4);
      if (run.method === model.selected && run.lastUpdate) {
        const previous = at(run.lastUpdate.from);
        if (Math.hypot(point.x - previous.x, point.y - previous.y) > 12) {
          context.strokeStyle = info.color;
          context.lineWidth = 2;
          arrow(context, previous, point, 7);
        }
      }
    }
  }

  const selected = model.runs.find((run) => run.method === model.selected)!;
  if (model.showGradients && inBounds(selected.position, model.surface.bounds) && magnitude(selected.gradient) > 1e-12) {
    const point = at(selected.position);
    const direction = {
      x: selected.gradient.x / (model.surface.bounds.xMax - model.surface.bounds.xMin) * frame.width,
      y: -selected.gradient.y / (model.surface.bounds.yMax - model.surface.bounds.yMin) * frame.height,
    };
    const length = magnitude(direction);
    const end = { x: point.x + direction.x / length * 31, y: point.y + direction.y / length * 31 };
    context.strokeStyle = '#f2f3e7';
    context.lineWidth = 1.8;
    arrow(context, point, end, 6);
  }
  context.restore();
}

export function createLandscape(container: HTMLElement, signal: AbortSignal) {
  const drawing = canvas2D(container, 'Computed loss contours, uphill gradient directions, and optimizer paths.');
  const background = document.createElement('canvas');
  const backgroundContext = background.getContext('2d')!;
  let terrain: Terrain | undefined;
  let lastSurface: Surface | undefined;
  let cacheKey = '';
  let current: LandscapeModel | undefined;

  const render = (model: LandscapeModel) => {
    current = model;
    const { context, size } = drawing;
    if (lastSurface !== model.surface) {
      terrain = sampleTerrain(model.surface, model.surface.levels);
      lastSurface = model.surface;
      cacheKey = '';
    }
    const key = `${size.width}/${size.height}/${size.dpr}/${model.showGradients}`;
    if (key !== cacheKey) {
      background.width = drawing.canvas.width;
      background.height = drawing.canvas.height;
      backgroundContext.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      drawTerrain(backgroundContext, size, model.surface, terrain!, model.showGradients);
      cacheKey = key;
    }
    context.drawImage(background, 0, 0, size.width, size.height);
    drawPaths(context, size, model);
    const selected = model.runs.find((run) => run.method === model.selected)!;
    drawing.canvas.setAttribute('aria-label',
      `${model.surface.name}: computed contours and ${model.runs.length} optimizer paths. ${getOptimizer(model.selected).name} at x ${plotNumber(selected.position.x)}, y ${plotNumber(selected.position.y)}, loss ${plotNumber(selected.loss)}, t ${selected.iteration}. Use the starting-point fields to change the start without a pointer.`);
  };
  drawing.canvas.addEventListener('canvasresize', () => { if (current) render(current); }, { signal });
  return {
    canvas: drawing.canvas,
    render,
    pointAt(pixel: Point): Point | null {
      if (!current) return null;
      const frame = plotFrame(drawing.size);
      if (pixel.x < frame.left || pixel.x > frame.left + frame.width ||
          pixel.y < frame.top || pixel.y > frame.top + frame.height) return null;
      return {
        x: lerp(current.surface.bounds.xMin, current.surface.bounds.xMax, (pixel.x - frame.left) / frame.width),
        y: lerp(current.surface.bounds.yMax, current.surface.bounds.yMin, (pixel.y - frame.top) / frame.height),
      };
    },
    dispose() {
      current = undefined;
      background.width = 1;
      background.height = 1;
      drawing.dispose();
    },
  };
}

export function createLossHistory(container: HTMLElement, signal: AbortSignal) {
  const drawing = canvas2D(container, 'Actual loss history. The signed-log scale includes zero and negative loss.');
  let current: { runs: readonly OptimizerRun[]; selected: Method } | undefined;
  const render = (runs: readonly OptimizerRun[], selected: Method) => {
    current = { runs, selected };
    const { context, size } = drawing;
    context.fillStyle = '#0a1722';
    context.fillRect(0, 0, size.width, size.height);
    const frame = { left: 62, top: 16, width: Math.max(1, size.width - 84), height: Math.max(1, size.height - 47) };
    const values = runs.flatMap((run) => run.history.map((sample) => signedLog(sample.loss)));
    let yMin = Math.min(0, ...values);
    let yMax = Math.max(0, ...values);
    if (yMax - yMin < 0.1) yMax = yMin + 0.1;
    const padding = (yMax - yMin) * 0.08;
    yMin -= padding;
    yMax += padding;
    const lastT = Math.max(...runs.map((run) => run.iteration));
    const xMax = Math.max(10, lastT);
    const pointAt = (t: number, loss: number): Point => ({
      x: frame.left + t / xMax * frame.width,
      y: frame.top + (yMax - signedLog(loss)) / (yMax - yMin) * frame.height,
    });
    context.font = '12px ui-monospace, monospace';
    for (let index = 0; index <= 3; index++) {
      const fraction = index / 3;
      const y = frame.top + fraction * frame.height;
      context.strokeStyle = '#8ea2b124';
      context.lineWidth = 1;
      context.beginPath();
      line(context, { x: frame.left, y }, { x: frame.left + frame.width, y });
      context.stroke();
      context.fillStyle = '#9db2c1';
      context.textAlign = 'right';
      context.fillText(plotNumber(inverseSignedLog(lerp(yMax, yMin, fraction))), frame.left - 9, y + 4);
    }
    const zeroY = pointAt(0, 0).y;
    context.setLineDash([3, 4]);
    context.strokeStyle = '#b7c8cc70';
    context.beginPath();
    line(context, { x: frame.left, y: zeroY }, { x: frame.left + frame.width, y: zeroY });
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#9db2c1';
    context.textAlign = 'left';
    context.fillText('0', frame.left, size.height - 8);
    context.textAlign = 'center';
    context.fillText(String(Math.round(xMax / 2)), frame.left + frame.width / 2, size.height - 8);
    context.textAlign = 'right';
    context.fillText(`${xMax}  t`, frame.left + frame.width, size.height - 8);

    const ordered = [...runs].sort((a, b) => Number(a.method === selected) - Number(b.method === selected));
    for (const run of ordered) {
      const info = getOptimizer(run.method);
      context.lineWidth = run.method === selected ? 2.5 : 1.7;
      context.strokeStyle = info.color;
      context.setLineDash(info.dash);
      context.beginPath();
      run.history.forEach((sample, index) => {
        const point = pointAt(sample.t, sample.loss);
        if (!index) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = info.color;
      context.strokeStyle = '#0a1722';
      context.lineWidth = 1;
      marker(context, pointAt(run.iteration, run.loss), run.method, 3);
    }
    if (lastT === 0) {
      context.fillStyle = '#bac9cf';
      context.font = '14px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText('Press Step all to grow the histories.', frame.left + frame.width / 2, frame.top + frame.height / 2);
    }
    drawing.canvas.setAttribute('aria-label',
      `Actual loss history through ${lastT} accepted updates. Signed-log axis; tick labels are raw loss. ${runs.map((run) => `${getOptimizer(run.method).name}: ${run.history.length} samples, current loss ${plotNumber(run.loss)}`).join('. ')}. Full recent samples are in the table below.`);
  };
  drawing.canvas.addEventListener('canvasresize', () => {
    if (current) render(current.runs, current.selected);
  }, { signal });
  return {
    canvas: drawing.canvas,
    render,
    dispose() { current = undefined; drawing.dispose(); },
  };
}
