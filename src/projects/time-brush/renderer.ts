import type { CanvasSize } from '../../core/canvas';
import { clamp, lerp } from '../../core/math';
import { MODE_BY_ID } from './data';
import type { ObjectSpec, TimeMode } from './data';
import { formatRate, motionAt, railMotion, sampleField, sceneLayout } from './engine';
import type { Point, SceneLayout, TimeScene } from './engine';

interface RenderOptions {
  aim: Point;
  mode: TimeMode;
  radius: number;
  watch: string;
  showAim: boolean;
}

const TAU = Math.PI * 2;
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function objectColor(rate: number, normal: string): string {
  if (Math.abs(rate) < 0.00001) return MODE_BY_ID.freeze.color;
  if (rate < 0) return MODE_BY_ID.reverse.color;
  if (rate < 0.99) return MODE_BY_ID.slow.color;
  return rate > 1.01 ? MODE_BY_ID.fast.color : normal;
}

function fieldColor(rate: number): readonly number[] {
  if (Math.abs(rate - 1) < 0.015) return [0, 0, 0, 0];
  if (rate < 0) {
    const t = -rate;
    return [lerp(154, 249, t), lerp(232, 175, t), lerp(255, 228, t), 57];
  }
  if (rate < 0.25) {
    const t = rate * 4;
    return [lerp(154, 255, t), lerp(232, 197, t), lerp(255, 137, t), 54];
  }
  if (rate < 1) return [255, 197, 137, 46 * (1 - rate) / 0.75];
  return [229, 252, 131, 52 * (rate - 1) / 2];
}

export class TimeRenderer {
  private readonly fieldCanvas = document.createElement('canvas');
  private readonly fieldContext = this.fieldCanvas.getContext('2d');
  private fieldVersion = '';
  private samples: number[] = [];

  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly size: CanvasSize) {}

  private point(point: Point): Point {
    return { x: point.x * this.size.width, y: point.y * this.size.height };
  }

  private circle(x: number, y: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, TAU);
  }

  private updateField(scene: TimeScene): void {
    const key = `${scene.revision}:${this.size.width}:${this.size.height}`;
    if (this.fieldVersion === key || !this.fieldContext) return;
    this.fieldVersion = key;
    const columns = clamp(Math.ceil(this.size.width / 9), 32, 160);
    const rows = clamp(Math.ceil(this.size.height / 9), 32, 120);
    this.fieldCanvas.width = columns;
    this.fieldCanvas.height = rows;
    const image = this.fieldContext.createImageData(columns, rows);
    this.samples = new Array<number>(columns * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        const rate = sampleField(scene.patches, { x: (x + 0.5) / columns, y: (y + 0.5) / rows }, scene.aspect);
        this.samples[index] = rate;
        const color = fieldColor(rate);
        for (let channel = 0; channel < 4; channel++) image.data[index * 4 + channel] = color[channel];
      }
    }
    this.fieldContext.putImageData(image, 0, 0);
  }

  private drawField(scene: TimeScene): void {
    this.updateField(scene);
    const { ctx } = this;
    const { width, height } = this.size;
    if (this.fieldContext) ctx.drawImage(this.fieldCanvas, 0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.27;
    ctx.lineWidth = 1;
    const columns = this.fieldCanvas.width;
    const rows = this.fieldCanvas.height;
    for (let gy = 2; gy < rows; gy += 4) {
      for (let gx = 2; gx < columns; gx += 4) {
        const rate = this.samples[gy * columns + gx] ?? 1;
        if (Math.abs(rate - 1) < 0.15) continue;
        const x = (gx + 0.5) / columns * width;
        const y = (gy + 0.5) / rows * height;
        ctx.strokeStyle = objectColor(rate, '#fff8df');
        ctx.beginPath();
        if (Math.abs(rate) < 0.04) {
          ctx.moveTo(x - 2, y - 3); ctx.lineTo(x - 2, y + 3);
          ctx.moveTo(x + 2, y - 3); ctx.lineTo(x + 2, y + 3);
        } else if (rate < 0 || rate > 1) {
          const direction = rate < 0 ? -1 : 1;
          ctx.moveTo(x - direction * 3, y - 3);
          ctx.lineTo(x + direction * 2, y);
          ctx.lineTo(x - direction * 3, y + 3);
        } else {
          ctx.arc(x, y, 2, 0, TAU);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    const lastByStroke = new Map<number, typeof scene.patches[number]>();
    scene.patches.forEach((patch) => lastByStroke.set(patch.stroke, patch));
    const compact = sceneLayout(scene.aspect).compact;
    for (const patch of [...lastByStroke.values()].slice(-6)) {
      const center = this.point(patch);
      const radius = patch.radius * Math.min(width, height);
      const mode = MODE_BY_ID[patch.mode];
      ctx.save();
      ctx.strokeStyle = mode.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.setLineDash(patch.mode === 'reverse' ? [3, 5] : [1, 0]);
      this.circle(center.x, center.y, radius);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!compact) {
        ctx.globalAlpha = 0.9;
        ctx.font = `12px ${MONO}`;
        ctx.fillStyle = mode.color;
        const label = `${mode.name.toUpperCase()} ${formatRate(mode.rate)}`;
        const labelWidth = ctx.measureText(label).width;
        const x = clamp(center.x - labelWidth / 2, 12, width - labelWidth - 12);
        const y = clamp(center.y + radius + 16, 50, height - 12);
        ctx.fillText(label, x, y);
      }
      ctx.restore();
    }
  }

  private drawOrbit(layout: SceneLayout, scene: TimeScene): void {
    const { ctx } = this;
    const unit = Math.min(this.size.width, this.size.height);
    const center = this.point(layout.orbit);
    ctx.strokeStyle = '#aac7ff42';
    ctx.lineWidth = 1;
    for (const radius of layout.orbitRadii) {
      this.circle(center.x, center.y, radius * unit);
      ctx.stroke();
    }
    const outer = layout.orbitRadii[2] * unit;
    for (let index = 0; index < 60; index++) {
      const angle = index / 60 * TAU;
      const length = index % 5 === 0 ? 6 : 2.5;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(angle) * (outer + 7), center.y + Math.sin(angle) * (outer + 7));
      ctx.lineTo(center.x + Math.cos(angle) * (outer + 7 + length), center.y + Math.sin(angle) * (outer + 7 + length));
      ctx.stroke();
    }
    ctx.strokeStyle = '#a9c3ff1e';
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(center.x - outer - 18, center.y); ctx.lineTo(center.x + outer + 18, center.y);
    ctx.moveTo(center.x, center.y - outer - 18); ctx.lineTo(center.x, center.y + outer + 18);
    ctx.stroke();
    ctx.setLineDash([]);

    const spindle = scene.inspect('spindle');
    const hub = Math.max(20, unit * 0.052);
    ctx.save();
    ctx.translate(center.x, center.y);
    this.circle(0, 0, hub + 9);
    ctx.fillStyle = '#15286a';
    ctx.fill();
    ctx.strokeStyle = '#bed0ff63';
    ctx.stroke();
    ctx.rotate(spindle.angle);
    const color = objectColor(spindle.rate, '#e5fc83');
    for (let blade = 0; blade < 4; blade++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(3, -4);
      ctx.quadraticCurveTo(hub * 1.14, -hub * 0.7, hub * 0.9, 4);
      ctx.lineTo(7, 9);
      ctx.closePath();
      ctx.fillStyle = blade % 2 ? '#eef5dd' : color;
      ctx.fill();
    }
    this.circle(0, 0, 5);
    ctx.fillStyle = '#14235c'; ctx.fill();
    ctx.restore();
  }

  private drawRails(layout: SceneLayout): void {
    const { ctx } = this;
    const unit = Math.min(this.size.width, this.size.height);
    const left = layout.railLeft * this.size.width;
    const right = layout.railRight * this.size.width;
    const y = layout.railY * this.size.height;
    const r = layout.railRadius * unit;
    ctx.strokeStyle = '#a8bfff35';
    ctx.lineWidth = 1;
    for (const offset of [-4, 4]) {
      ctx.beginPath();
      ctx.roundRect(left - r - offset, y - r - offset, right - left + 2 * (r + offset), 2 * (r + offset), r + offset);
      ctx.stroke();
    }
    for (let index = 0; index < 90; index++) {
      const pose = railMotion(index / 90 * TAU, layout);
      const p = this.point(pose.position);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.sin(pose.angle) * 6, p.y - Math.cos(pose.angle) * 6);
      ctx.lineTo(p.x - Math.sin(pose.angle) * 6, p.y + Math.cos(pose.angle) * 6);
      ctx.stroke();
    }
    ctx.fillStyle = '#9aaee726';
    ctx.fillRect(left + (right - left) * 0.25, y - r - 17, (right - left) * 0.22, 5);
    ctx.fillRect(left + (right - left) * 0.53, y + r + 12, (right - left) * 0.22, 5);
  }

  private drawWaves(layout: SceneLayout, scene: TimeScene): void {
    const { ctx } = this;
    for (let track = 0; track < 2; track++) {
      const wave = scene.clocks.filter((clock) => clock.spec.family === 'wave' && clock.spec.track === track);
      const points = wave.map((clock) => this.point(motionAt(clock.spec, clock.time, scene.aspect).position));
      const base = layout.waveRows[track] * this.size.height;
      ctx.beginPath();
      ctx.moveTo(layout.waveLeft * this.size.width, base);
      ctx.lineTo(layout.waveRight * this.size.width, base);
      ctx.strokeStyle = '#b0c5ff35';
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];
        ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
      }
      ctx.lineTo(points.at(-1)!.x, points.at(-1)!.y);
      ctx.strokeStyle = '#b9cdff10';
      ctx.lineWidth = 15;
      ctx.stroke();
      ctx.strokeStyle = track === 0 ? '#fff8df8c' : '#aecbff8c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#b7cdff25';
      points.forEach((point) => {
        ctx.beginPath();
        ctx.moveTo(point.x, base); ctx.lineTo(point.x, point.y);
        ctx.stroke();
      });
    }
  }

  private drawTrain(spec: ObjectSpec, time: number, rate: number, layout: SceneLayout): void {
    const { ctx } = this;
    const unit = Math.min(this.size.width, this.size.height);
    const length = 2 * (layout.railRight - layout.railLeft) * layout.sx + TAU * layout.railRadius;
    const spacing = 0.061 / length * TAU;
    const width = Math.max(15, unit * 0.049);
    const height = Math.max(8, unit * 0.024);
    const poses = Array.from({ length: 4 }, (_, index) => railMotion(spec.phase + time * spec.speed - index * spacing, layout));
    ctx.beginPath();
    poses.forEach((pose, index) => {
      const p = this.point(pose.position);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#ccd8fa8c';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let index = poses.length - 1; index >= 0; index--) {
      const pose = poses[index];
      const p = this.point(pose.position);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(pose.angle);
      ctx.fillStyle = objectColor(rate, spec.color);
      ctx.beginPath();
      ctx.roundRect(-width / 2, -height / 2, width, height, index === 0 ? [2, 6, 6, 2] : 2);
      ctx.fill();
      ctx.fillStyle = '#182760';
      ctx.fillRect(-width * 0.28, -height * 0.25, width * 0.17, height * 0.5);
      ctx.fillRect(width * 0.04, -height * 0.25, width * 0.17, height * 0.5);
      if (index === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(width / 2 - 3, -height / 2 + 2, 2, Math.max(2, height - 4));
      }
      ctx.restore();
    }
  }

  private drawObjects(scene: TimeScene, layout: SceneLayout): void {
    const { ctx } = this;
    const unit = Math.min(this.size.width, this.size.height);
    for (const clock of scene.clocks) {
      if (clock.spec.id === 'spindle') continue;
      const motion = motionAt(clock.spec, clock.time, scene.aspect);
      const point = this.point(motion.position);
      const rate = scene.rateAt(motion.position);
      if (clock.spec.family === 'train') {
        this.drawTrain(clock.spec, clock.time, rate, layout);
        continue;
      }
      const color = objectColor(rate, clock.spec.color);
      if (clock.spec.family === 'orbit') {
        if (Math.abs(rate) > 0.001) {
          for (let index = 8; index > 0; index--) {
            const tail = this.point(motionAt(clock.spec, clock.time - index * 0.08 * rate, scene.aspect).position);
            ctx.globalAlpha = 0.26 * (1 - index / 10);
            ctx.fillStyle = color;
            this.circle(tail.x, tail.y, Math.max(2, unit * 0.009) * (1 - index / 13));
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        const radius = Math.max(4.5, unit * (clock.spec.track === 2 ? 0.015 : 0.011));
        this.circle(point.x, point.y, radius + 3);
        ctx.fillStyle = '#142361';
        ctx.fill();
        this.circle(point.x, point.y, radius);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = '#142361';
        this.circle(point.x + radius * 0.25, point.y - radius * 0.2, radius * 0.25);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(motion.angle);
        const radius = Math.max(4, unit * 0.009);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(-radius, -radius, radius * 2, radius * 2, 1.5);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawLabels(layout: SceneLayout): void {
    const { ctx } = this;
    const { width, height } = this.size;
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = '#b5c9f1';
    ctx.fillText('01 / ORBITAL ARRAY', 20, 25);
    ctx.fillText('02 / HARMONIC TIDES', layout.compact ? 20 : width * 0.57, layout.compact ? height * 0.47 : 25);
    ctx.fillText('03 / THE CIRCULAR LINE', 20, height * (layout.compact ? 0.77 : 0.635));
  }

  private drawWatch(scene: TimeScene, id: string): void {
    const watched = scene.inspect(id);
    const p = this.point(watched.position);
    const { ctx } = this;
    ctx.strokeStyle = '#fff8dfa8';
    ctx.lineWidth = 1;
    this.circle(p.x, p.y, watched.spec.family === 'train' ? 18 : 14);
    ctx.stroke();
    const name = watched.spec.name.replace('Orbiter', 'ORB').replace('Wave bead', 'WAVE').replace('Train', 'LINE').replace('Central spindle', 'SPINDLE');
    const label = `${name} / ${formatRate(watched.rate)}`;
    ctx.font = `12px ${MONO}`;
    const width = ctx.measureText(label).width + 16;
    const x = clamp(p.x + 18, 10, this.size.width - width - 10);
    const y = clamp(p.y - 37, 33, this.size.height - 34);
    ctx.beginPath();
    ctx.moveTo(p.x + 9, p.y - 9);
    ctx.lineTo(x + 8, y + 26);
    ctx.stroke();
    ctx.fillStyle = '#0b184fe8';
    ctx.beginPath();
    ctx.roundRect(x, y, width, 26, 3);
    ctx.fill();
    ctx.strokeStyle = '#a8c2ff55';
    ctx.stroke();
    ctx.fillStyle = '#fff8df';
    ctx.fillText(label, x + 8, y + 17);
  }

  render(scene: TimeScene, options: RenderOptions): void {
    const { ctx } = this;
    const { width, height } = this.size;
    if (width < 2 || height < 2) return;
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#162a70');
    gradient.addColorStop(1, '#0c194b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#c7d7ff16';
    for (let x = 18; x < width; x += 32) {
      for (let y = 18; y < height; y += 32) ctx.fillRect(x, y, 1, 1);
    }
    const layout = sceneLayout(scene.aspect);
    this.drawField(scene);
    this.drawOrbit(layout, scene);
    this.drawRails(layout);
    this.drawWaves(layout, scene);
    this.drawObjects(scene, layout);
    this.drawLabels(layout);
    this.drawWatch(scene, options.watch);
    if (options.showAim) {
      const aim = this.point(options.aim);
      ctx.strokeStyle = MODE_BY_ID[options.mode].color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      this.circle(aim.x, aim.y, options.radius * Math.min(width, height));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(aim.x - 7, aim.y); ctx.lineTo(aim.x - 2, aim.y);
      ctx.moveTo(aim.x + 2, aim.y); ctx.lineTo(aim.x + 7, aim.y);
      ctx.moveTo(aim.x, aim.y - 7); ctx.lineTo(aim.x, aim.y - 2);
      ctx.moveTo(aim.x, aim.y + 2); ctx.lineTo(aim.x, aim.y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  destroy(): void {
    this.fieldCanvas.width = 0;
    this.fieldCanvas.height = 0;
    this.samples = [];
  }
}
