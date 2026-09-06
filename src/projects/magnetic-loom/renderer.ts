import { random } from '../../core/math';
import type { canvas2D } from '../../core/canvas';
import { BED, PALETTE, SEED } from './data';
import { emptySample, sampleField, SOFTENING } from './field';
import type { LoomEngine } from './engine';

export function projectionFor(width: number, height: number) {
  const scale = Math.min(width / BED.width, height / BED.height);
  return {
    scale,
    x: (width - BED.width * scale) / 2,
    y: (height - BED.height * scale) / 2,
  };
}

export function createLoomRenderer(surface: ReturnType<typeof canvas2D>, engine: LoomEngine) {
  const background = document.createElement('canvas');
  const paper = background.getContext('2d', { alpha: false });
  if (!paper) throw new Error('The drafting surface could not be created.');
  const ends = new Float32Array(engine.filings.length * 4);
  const field = emptySample();
  let backgroundKey = '';

  function drawTraces(context: CanvasRenderingContext2D): void {
    context.beginPath();
    for (const source of engine.poles) {
      if (source.charge < 0) continue;
      for (let line = 0; line < 18; line += 1) {
        const angle = (line + 0.35) / 18 * Math.PI * 2;
        let x = source.x + Math.cos(angle) * SOFTENING * 1.15;
        let y = source.y + Math.sin(angle) * SOFTENING * 1.15;
        context.moveTo(x, y);
        for (let step = 0; step < 270; step += 1) {
          sampleField(x, y, engine.poles, field);
          if (field.strength < 0.00001) break;
          const midX = x + field.x / field.strength * 2.4;
          const midY = y + field.y / field.strength * 2.4;
          sampleField(midX, midY, engine.poles, field);
          if (field.strength < 0.00001) break;
          x += field.x / field.strength * 4.8;
          y += field.y / field.strength * 4.8;
          if (x < BED.inset || x > BED.width - BED.inset || y < BED.inset || y > BED.height - BED.inset) break;
          context.lineTo(x, y);
          if (engine.poles.some((pole) => pole.charge < 0 && Math.hypot(x - pole.x, y - pole.y) < 17)) break;
        }
      }
    }
    context.strokeStyle = '#758d7f';
    context.globalAlpha = 0.25;
    context.lineWidth = 0.85;
    context.stroke();
    context.globalAlpha = 1;
  }

  function refreshBackground(traces: boolean): void {
    if (!paper) return;
    const { width, height, dpr } = surface.size;
    background.width = surface.canvas.width;
    background.height = surface.canvas.height;
    paper.setTransform(dpr, 0, 0, dpr, 0, 0);
    paper.fillStyle = PALETTE.paper;
    paper.fillRect(0, 0, width, height);
    const view = projectionFor(width, height);
    paper.translate(view.x, view.y);
    paper.scale(view.scale, view.scale);
    paper.strokeStyle = PALETTE.grid;
    paper.lineWidth = 0.55;
    paper.globalAlpha = 0.29;
    paper.beginPath();
    for (let x = 25; x < BED.width; x += 25) {
      paper.moveTo(x, 22);
      paper.lineTo(x, BED.height - 22);
    }
    for (let y = 25; y < BED.height; y += 25) {
      paper.moveTo(22, y);
      paper.lineTo(BED.width - 22, y);
    }
    paper.stroke();
    paper.globalAlpha = 0.48;
    paper.lineWidth = 0.75;
    paper.strokeRect(20, 20, BED.width - 40, BED.height - 40);
    paper.beginPath();
    for (let x = 50; x <= 950; x += 25) {
      const tick = x % 100 === 0 ? 9 : 4;
      paper.moveTo(x, 20);
      paper.lineTo(x, 20 + tick);
      paper.moveTo(x, BED.height - 20);
      paper.lineTo(x, BED.height - 20 - tick);
    }
    for (let y = 50; y <= 700; y += 25) {
      const tick = y % 100 === 0 ? 9 : 4;
      paper.moveTo(20, y);
      paper.lineTo(20 + tick, y);
      paper.moveTo(BED.width - 20, y);
      paper.lineTo(BED.width - 20 - tick, y);
    }
    paper.stroke();
    const next = random(SEED);
    paper.fillStyle = '#656e5b';
    paper.globalAlpha = 0.07;
    for (let point = 0; point < 2_000; point += 1) {
      paper.fillRect(next() * BED.width, next() * BED.height, 0.6 + next(), 0.6);
    }
    paper.globalAlpha = 1;
    if (traces) drawTraces(paper);
  }

  function draw(traces: boolean): void {
    const { canvas, context, size } = surface;
    const key = `${canvas.width}:${canvas.height}:${engine.revision}:${traces}`;
    if (key !== backgroundKey) {
      refreshBackground(traces);
      backgroundKey = key;
    }
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.drawImage(background, 0, 0, background.width, background.height, 0, 0, size.width, size.height);
    const view = projectionFor(size.width, size.height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.lineCap = 'round';
    for (let index = 0; index < engine.filings.length; index += 1) {
      const filing = engine.filings[index];
      const dx = Math.cos(filing.angle) * filing.length / 2;
      const dy = Math.sin(filing.angle) * filing.length / 2;
      const offset = index * 4;
      ends[offset] = filing.x - dx;
      ends[offset + 1] = filing.y - dy;
      ends[offset + 2] = filing.x + dx;
      ends[offset + 3] = filing.y + dy;
    }
    context.beginPath();
    for (let offset = 0; offset < ends.length; offset += 4) {
      context.moveTo(ends[offset] + 0.6, ends[offset + 1] + 0.9);
      context.lineTo(ends[offset + 2] + 0.6, ends[offset + 3] + 0.9);
    }
    context.strokeStyle = '#626952';
    context.globalAlpha = 0.13;
    context.lineWidth = 2;
    context.stroke();
    context.globalAlpha = 1;
    for (let shade = 0; shade < PALETTE.filings.length; shade += 1) {
      context.beginPath();
      for (let index = 0; index < engine.filings.length; index += 1) {
        if (engine.filings[index].shade !== shade) continue;
        const offset = index * 4;
        context.moveTo(ends[offset], ends[offset + 1]);
        context.lineTo(ends[offset + 2], ends[offset + 3]);
      }
      context.strokeStyle = PALETTE.filings[shade];
      context.lineWidth = shade < 2 ? 1.28 : 1.02;
      context.stroke();
    }
    context.beginPath();
    for (let index = 0; index < engine.filings.length; index += 2) {
      const offset = index * 4;
      context.moveTo(ends[offset] - 0.22, ends[offset + 1] - 0.32);
      context.lineTo(ends[offset + 2] - 0.22, ends[offset + 3] - 0.32);
    }
    context.strokeStyle = '#d9ddcc';
    context.lineWidth = 0.36;
    context.stroke();
    context.restore();
  }

  return {
    draw,
    dispose() {
      background.width = 0;
      background.height = 0;
    },
  };
}
