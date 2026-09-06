import { fitTable, projectedOutlines, TABLE } from './engine';
import type { Lamp, Point } from './engine';
import type { Arrangement } from './data';

function path(context: CanvasRenderingContext2D, outlines: Point[][]): void {
  context.beginPath();
  for (const outline of outlines) {
    outline.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }
}

function centre(outlines: Point[][]): Point {
  const points = outlines[0];
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export interface TableView {
  arrangement: Arrangement;
  lamp: Lamp;
  tracing: boolean;
  rays: boolean;
  station: boolean;
  found: boolean;
}

export function drawTable(
  context: CanvasRenderingContext2D, width: number, height: number, state: TableView,
): void {
  const { lamp, arrangement } = state;
  const fit = fitTable(width, height);
  context.save();
  context.fillStyle = '#e7e0d1';
  context.fillRect(0, 0, width, height);
  context.translate(fit.x, fit.y);
  context.scale(fit.scale, fit.scale);
  context.fillStyle = '#faf7ed';
  context.fillRect(20, 20, TABLE.width - 40, TABLE.height - 40);
  const light = context.createRadialGradient(lamp.x, lamp.y, 12, lamp.x, lamp.y, 790);
  light.addColorStop(0, '#fffef8');
  light.addColorStop(0.6, '#f3eedf');
  light.addColorStop(1, '#e3daca');
  context.fillStyle = light;
  context.fillRect(20, 20, TABLE.width - 40, TABLE.height - 40);

  context.save();
  context.beginPath();
  context.rect(20, 20, TABLE.width - 40, TABLE.height - 40);
  context.clip();
  context.strokeStyle = '#d0c5b4';
  context.lineWidth = 1;
  for (let x = 60; x < 870; x += 30) {
    context.beginPath();
    context.moveTo(x, 24);
    context.lineTo(x, x % 150 === 0 ? 35 : 30);
    context.moveTo(x, 590);
    context.lineTo(x, x % 150 === 0 ? 577 : 584);
    context.stroke();
  }
  for (let y = 60; y < 590; y += 30) {
    context.beginPath();
    context.moveTo(24, y);
    context.lineTo(y % 150 === 0 ? 35 : 30, y);
    context.moveTo(870, y);
    context.lineTo(y % 150 === 0 ? 857 : 864, y);
    context.stroke();
  }

  if (state.tracing) {
    context.strokeStyle = state.found ? '#678171' : '#b9a487';
    context.lineWidth = 1.5;
    context.setLineDash([4, 6]);
    for (const object of arrangement.objects) {
      path(context, object.target);
      context.stroke();
    }
    context.setLineDash([]);
  }

  if (state.rays) {
    context.lineWidth = 1.2;
    context.strokeStyle = '#bd955975';
    context.setLineDash([3, 5]);
    for (const object of arrangement.objects) {
      const source = centre(object.outlines);
      const projected = centre(projectedOutlines(object, lamp));
      context.beginPath();
      context.moveTo(lamp.x, lamp.y);
      context.lineTo(source.x, source.y);
      context.lineTo(projected.x, projected.y);
      context.stroke();
    }
    context.setLineDash([]);
  }

  context.fillStyle = '#272a29';
  for (const object of arrangement.objects) {
    path(context, projectedOutlines(object, lamp));
    context.fill('evenodd');
  }

  for (const object of [...arrangement.objects].sort((a, b) => a.height - b.height)) {
    const pin = centre(object.outlines);
    context.strokeStyle = '#ab9b80';
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(pin.x, pin.y + 9, 6, 3, 0, 0, Math.PI * 2);
    context.moveTo(pin.x, pin.y + 9);
    context.lineTo(pin.x, pin.y);
    context.stroke();
    path(context, object.outlines);
    context.fillStyle = '#fffdf4';
    context.fill('evenodd');
    context.strokeStyle = '#b8a98e';
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.arc(pin.x, pin.y, 2.4, 0, Math.PI * 2);
    context.fillStyle = '#b28b52';
    context.fill();
  }

  if (state.station) {
    context.strokeStyle = '#a36339';
    context.lineWidth = 2;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(arrangement.lamp.x, arrangement.lamp.y, 27, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(arrangement.lamp.x - 12, arrangement.lamp.y);
    context.lineTo(arrangement.lamp.x + 12, arrangement.lamp.y);
    context.moveTo(arrangement.lamp.x, arrangement.lamp.y - 12);
    context.lineTo(arrangement.lamp.x, arrangement.lamp.y + 12);
    context.stroke();
  }

  const radius = Math.max(20, 12 / fit.scale);
  context.beginPath();
  context.arc(lamp.x, lamp.y, radius + 10, 0, Math.PI * 2);
  context.fillStyle = '#edb45c35';
  context.fill();
  context.beginPath();
  context.arc(lamp.x, lamp.y, radius, 0, Math.PI * 2);
  context.fillStyle = '#e8ad51';
  context.fill();
  context.strokeStyle = '#6e4926';
  context.lineWidth = 1.5;
  context.stroke();
  context.beginPath();
  context.arc(lamp.x, lamp.y, radius * 0.44, 0, Math.PI * 2);
  context.fillStyle = '#fff9d8';
  context.fill();
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    context.beginPath();
    context.moveTo(lamp.x + Math.cos(angle) * (radius + 16), lamp.y + Math.sin(angle) * (radius + 16));
    context.lineTo(lamp.x + Math.cos(angle) * (radius + 22), lamp.y + Math.sin(angle) * (radius + 22));
    context.strokeStyle = '#bb9057';
    context.stroke();
  }
  context.restore();
  context.strokeStyle = '#cabfae';
  context.lineWidth = 1;
  context.strokeRect(20.5, 20.5, TABLE.width - 41, TABLE.height - 41);
  context.restore();
}
