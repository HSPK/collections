import { clamp, random } from '../../core/math';
import type { CanvasSize } from '../../core/canvas';
import { flashLevel } from './engine';
import type { ChoirEngine } from './engine';

function layer() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The night garden needs a 2D canvas.');
  return { canvas, context };
}

function glow(warm: boolean) {
  const sprite = layer();
  sprite.canvas.width = 80;
  sprite.canvas.height = 80;
  const gradient = sprite.context.createRadialGradient(40, 40, 0, 40, 40, 40);
  gradient.addColorStop(0, warm ? '#fffbe1' : '#edffbd');
  gradient.addColorStop(0.035, warm ? '#fff7bc' : '#e0ffa0');
  gradient.addColorStop(0.095, warm ? 'rgba(236,239,123,.8)' : 'rgba(172,238,131,.7)');
  gradient.addColorStop(0.24, warm ? 'rgba(202,220,91,.2)' : 'rgba(105,209,123,.16)');
  gradient.addColorStop(0.6, 'rgba(137,196,94,.035)');
  gradient.addColorStop(1, 'rgba(109,177,82,0)');
  sprite.context.fillStyle = gradient;
  sprite.context.fillRect(0, 0, 80, 80);
  return sprite.canvas;
}

function fern(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  lean: number,
  color: string,
) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(0.8, length * 0.009);
  context.beginPath();
  context.moveTo(x, y);
  context.quadraticCurveTo(x, y - length * 0.6, x + lean * length, y - length);
  context.stroke();
  context.beginPath();
  for (let j = 1; j <= 14; j += 1) {
    const t = j / 15;
    const px = x + lean * length * t * t;
    const py = y - length * t;
    const leaf = length * 0.23 * Math.sin(Math.PI * t) ** 0.8;
    for (const side of [-1, 1]) {
      const tipX = px + side * leaf + lean * leaf * 0.35;
      const tipY = py - leaf * 0.45;
      context.moveTo(px, py);
      context.quadraticCurveTo(px + side * leaf * 0.48, py - leaf * 0.5, tipX, tipY);
      context.quadraticCurveTo(px + side * leaf * 0.6, py + leaf * 0.1, px, py + leaf * 0.08);
    }
  }
  context.fill();
}

function grasses(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  color: string,
  count: number,
  base: number,
) {
  const rng = random(seed);
  context.strokeStyle = color;
  context.lineWidth = 1.1;
  context.beginPath();
  for (let i = 0; i < count; i += 1) {
    const x = rng() * width;
    const edge = Math.abs(x / width - 0.5) * 2;
    const blade = height * (0.018 + rng() * (0.035 + edge * 0.16));
    const y = height * base + rng() * height * 0.018;
    const lean = (rng() - 0.5) * blade;
    context.moveTo(x, y);
    context.quadraticCurveTo(x + lean * 0.2, y - blade * 0.7, x + lean, y - blade);
  }
  context.stroke();
}

export class GardenPainter {
  private readonly backdrop = layer();
  private readonly foreground = layer();
  private readonly coolGlow = glow(false);
  private readonly warmGlow = glow(true);
  private width = 1;
  private height = 1;

  resize(size: CanvasSize): void {
    this.width = size.width;
    this.height = size.height;
    const ratio = Math.min(size.dpr, 1.5);
    for (const target of [this.backdrop, this.foreground]) {
      target.canvas.width = Math.round(size.width * ratio);
      target.canvas.height = Math.round(size.height * ratio);
      target.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    this.paintBackdrop();
    this.paintForeground();
  }

  private paintBackdrop(): void {
    const { context: c } = this.backdrop;
    const w = this.width;
    const h = this.height;
    const rng = random(43108);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#07181e');
    sky.addColorStop(0.43, '#132e30');
    sky.addColorStop(0.75, '#294639');
    sky.addColorStop(1, '#101f20');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    const mist = c.createRadialGradient(w * 0.52, h * 0.55, 0, w * 0.52, h * 0.55, w * 0.5);
    mist.addColorStop(0, 'rgba(134,165,105,.13)');
    mist.addColorStop(0.55, 'rgba(103,141,111,.045)');
    mist.addColorStop(1, 'rgba(88,128,108,0)');
    c.fillStyle = mist;
    c.fillRect(0, 0, w, h);

    c.fillStyle = '#abc5b2';
    for (let i = 0; i < 35; i += 1) {
      c.globalAlpha = 0.12 + rng() * 0.24;
      const x = (0.1 + rng() * 0.8) * w;
      const y = (0.09 + rng() * 0.35) * h;
      const radius = 0.4 + rng() * 0.6;
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    const moonX = w * 0.79;
    const moonY = h * 0.18;
    const moonRadius = clamp(w * 0.016, 9, 16);
    const moonHalo = c.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonRadius * 6);
    moonHalo.addColorStop(0, 'rgba(204,218,164,.08)');
    moonHalo.addColorStop(1, 'rgba(204,218,164,0)');
    c.fillStyle = moonHalo;
    c.fillRect(moonX - moonRadius * 6, moonY - moonRadius * 6, moonRadius * 12, moonRadius * 12);
    c.fillStyle = '#c4d5ad';
    c.beginPath();
    c.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#11282c';
    c.beginPath();
    c.arc(moonX + moonRadius * 0.46, moonY - moonRadius * 0.26, moonRadius * 0.96, 0, Math.PI * 2);
    c.fill();

    for (const [base, color] of [[0.63, '#173331'], [0.73, '#16302b'], [0.84, '#152c28']] as const) {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, h);
      c.lineTo(0, h * (base - 0.1));
      c.bezierCurveTo(w * 0.2, h * (base - 0.1), w * 0.28, h * (base + 0.09), w * 0.5, h * (base + 0.04));
      c.bezierCurveTo(w * 0.7, h * (base - 0.04), w * 0.78, h * (base - 0.06), w, h * (base - 0.03));
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    }

    c.fillStyle = '#203930';
    c.beginPath();
    c.moveTo(w * 0.29, h);
    c.bezierCurveTo(w * 0.34, h * 0.85, w * 0.7, h * 0.88, w * 0.63, h * 0.76);
    c.bezierCurveTo(w * 0.6, h * 0.7, w * 0.5, h * 0.73, w * 0.57, h * 0.65);
    c.bezierCurveTo(w * 0.54, h * 0.73, w * 0.67, h * 0.7, w * 0.68, h * 0.77);
    c.bezierCurveTo(w * 0.76, h * 0.91, w * 0.47, h * 0.9, w * 0.55, h);
    c.closePath();
    c.fill();

    for (let i = 0; i < 28; i += 1) {
      const x = rng() * w;
      const edge = Math.abs(x / w - 0.5) * 2;
      fern(c, x, h * (0.73 + rng() * 0.16), h * (0.03 + edge * 0.14), (rng() - 0.5) * 0.9, '#1b3830');
    }
    grasses(c, w, h, 4301, '#234333', 160, 0.87);

    // Overhanging branches frame the sky; the middle remains an open clearing.
    for (const side of [-1, 1]) {
      c.save();
      if (side === 1) { c.translate(w, 0); c.scale(-1, 1); }
      c.strokeStyle = '#0a2024';
      c.lineCap = 'round';
      c.lineWidth = w * 0.014;
      c.beginPath();
      c.moveTo(-w * 0.025, h * 0.62);
      c.bezierCurveTo(w * 0.015, h * 0.23, w * 0.17, h * 0.19, w * 0.29, -h * 0.03);
      c.stroke();
      c.lineWidth = Math.max(2, w * 0.003);
      c.beginPath();
      c.moveTo(w * 0.055, h * 0.32);
      c.quadraticCurveTo(w * 0.025, h * 0.16, w * 0.09, h * 0.025);
      c.moveTo(w * 0.105, h * 0.24);
      c.quadraticCurveTo(w * 0.23, h * 0.24, w * 0.31, h * 0.16);
      c.stroke();
      c.fillStyle = '#0b2325';
      for (let i = 0; i < 36; i += 1) {
        const t = rng();
        const x = (0.005 + t * 0.25) * w;
        const y = (0.29 - t * 0.25 + (rng() - 0.5) * 0.11) * h;
        c.beginPath();
        c.ellipse(x, y, w * (0.009 + rng() * 0.007), h * (0.01 + rng() * 0.006), -0.9 + rng() * 1.7, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    const vignette = c.createRadialGradient(w * 0.5, h * 0.5, h * 0.17, w * 0.5, h * 0.5, Math.max(w, h) * 0.69);
    vignette.addColorStop(0, 'rgba(2,13,18,0)');
    vignette.addColorStop(1, 'rgba(2,13,18,.58)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
  }

  private paintForeground(): void {
    const { context: c } = this.foreground;
    const w = this.width;
    const h = this.height;
    const rng = random(4360);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#07191b';
    c.beginPath();
    c.moveTo(0, h * 0.88);
    c.bezierCurveTo(w * 0.18, h * 0.87, w * 0.29, h * 0.99, w * 0.52, h * 1.015);
    c.bezierCurveTo(w * 0.73, h * 0.97, w * 0.87, h * 0.87, w, h * 0.88);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    c.fill();

    for (const side of [-1, 1]) {
      c.save();
      if (side === 1) { c.translate(w, 0); c.scale(-1, 1); }
      for (let group = 0; group < 3; group += 1) {
        const x = w * (0.02 + group * 0.055);
        const base = h * (0.97 + group * 0.016);
        for (let branch = 0; branch < 4; branch += 1) {
          fern(c, x, base, h * (0.2 + rng() * 0.22 - group * 0.025),
            -0.5 + branch * 0.33, group === 0 ? '#102b27' : '#091e1f');
        }
      }
      c.restore();
    }
    grasses(c, w, h, 4358, '#081a1d', 130, 1.02);
    c.strokeStyle = '#36513a';
    c.lineWidth = 0.8;
    for (const x of [0.12, 0.19, 0.86, 0.91]) {
      const height = h * (0.13 + rng() * 0.13);
      c.beginPath();
      c.moveTo(w * x, h);
      c.quadraticCurveTo(w * x - height * 0.15, h - height * 0.5, w * x + height * 0.05, h - height);
      c.stroke();
      c.fillStyle = '#3e593e';
      c.beginPath();
      c.ellipse(w * x + height * 0.05, h - height, 1.8, 5, 0.1, 0, Math.PI * 2);
      c.fill();
    }
  }

  draw(context: CanvasRenderingContext2D, engine: ChoirEngine): void {
    const w = this.width;
    const h = this.height;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(this.backdrop.canvas, 0, 0, w, h);
    context.globalCompositeOperation = 'lighter';
    if (engine.torch.enabled) {
      context.globalAlpha = 0.14;
      context.drawImage(this.warmGlow, (engine.torch.x - 0.24) * w, (engine.torch.y - 0.24) * h, w * 0.48, h * 0.48);
    }
    const scale = clamp(w / 800, 0.72, 1.2);
    for (const firefly of engine.fireflies) {
      const flash = flashLevel(firefly.phase);
      const diameter = (17 + firefly.depth * 25) * (0.7 + flash * 0.6) * scale;
      context.globalAlpha = (0.13 + flash * 0.87) * (0.5 + firefly.depth * 0.5);
      context.drawImage(firefly.depth > 0.6 ? this.warmGlow : this.coolGlow,
        firefly.x * w - diameter / 2, firefly.y * h - diameter / 2, diameter, diameter);
    }
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.drawImage(this.foreground.canvas, 0, 0, w, h);
    if (engine.torch.enabled) {
      const x = engine.torch.x * w;
      const y = engine.torch.y * h;
      context.strokeStyle = 'rgba(226,232,172,.42)';
      context.lineWidth = 1;
      context.setLineDash([2, 6]);
      context.beginPath();
      context.ellipse(x, y, w * 0.21, h * 0.21, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.strokeStyle = '#e0e8b6';
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.moveTo(x - 11, y);
      context.lineTo(x - 8, y);
      context.moveTo(x + 8, y);
      context.lineTo(x + 11, y);
      context.moveTo(x, y - 11);
      context.lineTo(x, y - 8);
      context.moveTo(x, y + 8);
      context.lineTo(x, y + 11);
      context.stroke();
    }
  }

  dispose(): void {
    for (const canvas of [
      this.backdrop.canvas, this.foreground.canvas, this.coolGlow, this.warmGlow,
    ]) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
