import { GARDEN, plants } from './data';
import type { PaperPlant } from './data';
import type { GardenState } from './engine';

type Ink = CanvasRenderingContext2D;

function polygon(ink: Ink, points: [number, number][], color: string): void {
  ink.beginPath();
  points.forEach(([x, y], index) => index ? ink.lineTo(x, y) : ink.moveTo(x, y));
  ink.closePath();
  ink.fillStyle = color;
  ink.fill();
}

function ellipse(ink: Ink, x: number, y: number, rx: number, ry: number, color: string): void {
  ink.beginPath();
  ink.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ink.fillStyle = color;
  ink.fill();
}

function flower(ink: Ink, plant: PaperPlant, opened: number, wheel: number): void {
  const size = plant.size * (0.76 + opened * 0.24);
  if (plant.kind === 'cup') {
    const width = size * (0.36 + opened * 0.5);
    polygon(ink, [[0, 12], [-width, -size * 0.6], [-width * 0.82, -size * 1.4], [0, -size * 0.91], [width * 0.82, -size * 1.4], [width, -size * 0.6]], plant.color);
    polygon(ink, [[0, 12], [0, -size * 0.91], [width * 0.82, -size * 1.4], [width, -size * 0.6]], plant.fold);
    polygon(ink, [[0, 12], [-width, -size * 0.6], [0, -size * 0.4]], '#f6c4b3');
  } else if (plant.kind === 'fan') {
    for (let petal = 0; petal < 7; petal += 1) {
      const angle = -Math.PI / 2 + (petal - 3) * (0.12 + opened * 0.31);
      const length = size * (petal % 2 ? 1.14 : 1.3);
      const left = angle - (0.08 + opened * 0.13);
      const right = angle + (0.08 + opened * 0.13);
      const tip: [number, number] = [Math.cos(angle) * length, Math.sin(angle) * length];
      polygon(ink, [[0, 6], [Math.cos(left) * length * 0.78, Math.sin(left) * length * 0.78], tip, [Math.cos(right) * length * 0.78, Math.sin(right) * length * 0.78]], plant.color);
      polygon(ink, [[0, 6], tip, [Math.cos(right) * length * 0.78, Math.sin(right) * length * 0.78]], plant.fold);
    }
  } else {
    ink.save();
    ink.rotate(wheel * 0.8);
    const reach = size * (0.42 + opened * 0.68);
    for (let petal = 0; petal < 5; petal += 1) {
      ink.save();
      ink.rotate(petal * Math.PI * 2 / 5);
      polygon(ink, [[0, 0], [8, -reach], [reach * 0.75, -reach * 0.5], [reach * 0.31, 8]], plant.color);
      polygon(ink, [[0, 0], [reach * 0.75, -reach * 0.5], [reach * 0.31, 8]], plant.fold);
      ink.restore();
    }
    ellipse(ink, 0, 0, 5, 5, '#f6e6c7');
    ink.restore();
  }
}

function paperPlant(ink: Ink, plant: PaperPlant, index: number, state: GardenState, direction: -1 | 1): void {
  const opened = state.opened[index];
  const height = plant.height * (0.67 + opened * 0.33);
  const flutter = Math.sin(state.phase + index * 1.3) * 0.025 * height;
  const bend = direction * state.wind * height * 0.31 + flutter;
  const tip = { x: plant.x + bend, y: plant.y - height + Math.abs(bend) * 0.12 };
  ink.fillStyle = '#d1dfdb';
  ink.beginPath();
  ink.ellipse(plant.x + 4, plant.y + 4, 23, 5, 0, 0, Math.PI * 2);
  ink.fill();
  ink.beginPath();
  ink.moveTo(plant.x - 3, plant.y);
  ink.bezierCurveTo(plant.x - 3, plant.y - height * 0.42, tip.x - 8, tip.y + height * 0.42, tip.x - 2, tip.y);
  ink.lineTo(tip.x + 2, tip.y);
  ink.bezierCurveTo(tip.x + 3, tip.y + height * 0.43, plant.x + 4, plant.y - height * 0.43, plant.x + 4, plant.y);
  ink.fillStyle = index % 2 ? '#78999f' : '#628b9d';
  ink.fill();
  for (let leaf = 0; leaf < 2; leaf += 1) {
    const side = (leaf + index) % 2 ? 1 : -1;
    const along = 0.27 + leaf * 0.22;
    const x = plant.x + bend * along;
    const y = plant.y - height * along;
    const reach = 28 + opened * 13;
    polygon(ink, [[x, y], [x + side * reach, y - 29], [x + side * reach * 0.85, y - 4]], '#a8c0bd');
    polygon(ink, [[x, y], [x + side * reach, y - 29], [x + side * reach * 0.45, y - 10]], '#7c9faa');
  }
  ink.save();
  ink.translate(tip.x, tip.y);
  ink.rotate(bend / height * 0.75);
  flower(ink, plant, opened, state.wheel + index * 0.43);
  ink.restore();
}

export function drawGarden(ink: Ink, width: number, height: number, state: GardenState, direction: -1 | 1): void {
  const scale = width < 600
    ? Math.max(width / GARDEN.width, height / GARDEN.height)
    : Math.min(width / GARDEN.width, height / GARDEN.height);
  ink.save();
  ink.fillStyle = '#f5f8f4';
  ink.fillRect(0, 0, width, height);
  ink.translate((width - GARDEN.width * scale) / 2, (height - GARDEN.height * scale) / 2);
  ink.scale(scale, scale);
  const sky = ink.createLinearGradient(0, 0, 0, 540);
  sky.addColorStop(0, '#f5f8f4');
  sky.addColorStop(1, '#e2edf0');
  ink.fillStyle = sky;
  ink.fillRect(0, 0, 1000, 590);
  ellipse(ink, 823, 99, 40, 40, '#f0d5bd');
  ink.fillStyle = '#d6e4e7';
  ink.beginPath();
  ink.moveTo(0, 428);
  ink.bezierCurveTo(200, 381, 380, 445, 526, 415);
  ink.bezierCurveTo(696, 380, 862, 373, 1000, 419);
  ink.lineTo(1000, 590);
  ink.lineTo(0, 590);
  ink.fill();
  ink.fillStyle = '#edf3ec';
  ink.beginPath();
  ink.moveTo(0, 457);
  ink.bezierCurveTo(254, 435, 500, 499, 705, 436);
  ink.bezierCurveTo(839, 402, 935, 453, 1000, 449);
  ink.lineTo(1000, 590);
  ink.lineTo(0, 590);
  ink.fill();
  if (state.wind > 0.02) {
    ink.save();
    ink.globalAlpha = state.wind * 0.5;
    ink.strokeStyle = '#799fae';
    ink.lineWidth = 2;
    for (let ribbon = 0; ribbon < 3; ribbon += 1) {
      const x = direction > 0 ? 95 + ribbon * 260 : 725 - ribbon * 260;
      const y = 130 + ribbon * 57;
      ink.beginPath();
      ink.moveTo(x, y + Math.sin(state.phase + ribbon) * 8);
      ink.bezierCurveTo(x + direction * 75, y - 15, x + direction * 105, y + 30, x + direction * 154, y);
      ink.bezierCurveTo(x + direction * 175, y - 21, x + direction * 149, y - 34, x + direction * 138, y - 16);
      ink.stroke();
    }
    ink.restore();
  }
  for (let index = 0; index < plants.length; index += 1) paperPlant(ink, plants[index], index, state, direction);
  ink.fillStyle = '#f8f8ef';
  ink.beginPath();
  ink.moveTo(0, 510);
  ink.bezierCurveTo(310, 465, 500, 553, 736, 503);
  ink.bezierCurveTo(860, 476, 933, 500, 1000, 517);
  ink.lineTo(1000, 590);
  ink.lineTo(0, 590);
  ink.fill();
  polygon(ink, [[84, 545], [110, 525], [154, 540], [140, 553]], '#c9d5d2');
  polygon(ink, [[84, 545], [110, 525], [113, 547]], '#e0e5da');
  polygon(ink, [[810, 548], [853, 520], [911, 546], [886, 561]], '#d6dcd1');
  polygon(ink, [[810, 548], [853, 520], [856, 551]], '#e8e9dc');
  ink.strokeStyle = '#d3ddd6';
  ink.lineWidth = 1.5;
  ink.beginPath();
  ink.moveTo(189, 545);
  ink.bezierCurveTo(300, 520, 421, 558, 561, 540);
  ink.stroke();
  ink.restore();
}
