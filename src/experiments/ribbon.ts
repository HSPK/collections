import { canvas2D, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: Point[];
  hue: number;
  seed: number;
}

const palettes: Record<string, [number, number, number]> = {
  opal: [345, 170, 28],
  acid: [76, 156, 56],
  cobalt: [227, 286, 190],
  ember: [12, 43, 345],
};

export function mount({ container, controls, signal, reducedMotion, report }: ExperimentContext): ExperimentInstance {
  const surface = canvas2D(container, 'Satin ribbons of light on a dark canvas. Drag to draw; use New gesture for a keyboard-accessible composition.');
  const { canvas, context: ctx, size } = surface;
  canvas.style.cursor = 'crosshair';
  const hint = stageHint(container, 'DRAG TO DRAW / EVERY GESTURE IS AN ORIGINAL');
  let width = 38;
  let drift = 0.35;
  let palette = 'opal';
  let seed = 14;
  let strokes: Stroke[] = [];
  let activeStroke: Stroke | undefined;
  let pointerId: number | undefined;
  let time = 0;

  function cancelDrawing() {
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    activeStroke = undefined;
    pointerId = undefined;
  }

  function seedComposition() {
    cancelDrawing();
    const rng = random(seed);
    strokes = [];
    for (let line = 0; line < 3; line++) {
      const points: Point[] = [];
      const rotation = rng() * 0.2 - 0.1;
      for (let index = 0; index < 215; index++) {
        const t = index / 214;
        const a = t * Math.PI * (2.5 + line * 0.13) - 1.5 + line * 0.9;
        const envelope = Math.sin(t * Math.PI) * 0.4 + 0.6;
        points.push({
          x: 0.5 + Math.sin(a * 0.91 + rotation) * (0.32 - line * 0.053) * envelope + Math.sin(a * 2.1) * 0.04,
          y: 0.49 + Math.cos(a * 1.12) * (0.35 - line * 0.065) * envelope,
          pressure: 0.65 + Math.sin(t * 5 + line) * 0.2,
        });
      }
      strokes.push({ points, hue: line, seed: rng() * 10 });
    }
  }
  seedComposition();

  function drawStroke(stroke: Stroke) {
    if (stroke.points.length < 2) return;
    const length = stroke.points.length;
    const ribbonWidth = width * Math.min(size.width / 850, 1.3);
    const points = stroke.points.map((point, index) => {
      const t = index / (length - 1);
      const taper = Math.pow(Math.sin(t * Math.PI), 0.36);
      return {
        x: point.x * size.width + Math.sin(time * 0.55 + t * 10 + stroke.seed) * drift * 9,
        y: point.y * size.height + Math.cos(time * 0.45 + t * 9 + stroke.seed) * drift * 9,
        width: Math.max(0.4, ribbonWidth * (0.3 + point.pressure * 0.7) * taper),
      };
    });
    const normals = points.map((point, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const distance = Math.hypot(dx, dy) || 1;
      return { x: -dy / distance * point.width, y: dx / distance * point.width };
    });
    const hues = palettes[palette];
    const baseHue = hues[stroke.hue % hues.length];
    const strips = 12;
    for (let strip = 0; strip < strips; strip++) {
      const sideA = strip / strips - 0.5;
      const sideB = (strip + 1.08) / strips - 0.5;
      ctx.beginPath();
      for (let index = 0; index < length; index++) {
        const point = points[index];
        const normal = normals[index];
        const x = point.x + normal.x * sideA;
        const y = point.y + normal.y * sideA;
        if (!index) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let index = length - 1; index >= 0; index--) {
        const point = points[index];
        const normal = normals[index];
        ctx.lineTo(point.x + normal.x * sideB, point.y + normal.y * sideB);
      }
      ctx.closePath();
      const lightness = 25 + Math.sin((strip / strips) * Math.PI) ** 2 * 54;
      const gradient = ctx.createLinearGradient(size.width * 0.15, size.height * 0.15, size.width * 0.85, size.height * 0.85);
      gradient.addColorStop(0, `hsl(${baseHue}, 50%, ${lightness + 5}%)`);
      gradient.addColorStop(0.43, `hsl(${baseHue + 35}, 67%, ${lightness}%)`);
      gradient.addColorStop(0.68, `hsl(${baseHue - 20}, 45%, ${Math.min(lightness + 13, 95)}%)`);
      gradient.addColorStop(1, `hsl(${baseHue + 12}, 59%, ${lightness - 6}%)`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  function draw(elapsed: number) {
    time = elapsed;
    ctx.fillStyle = '#202027';
    ctx.fillRect(0, 0, size.width, size.height);
    const spacing = 55;
    ctx.strokeStyle = '#ffffff06';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (size.width % spacing) / 2; x < size.width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
    }
    for (let y = (size.height % spacing) / 2; y < size.height; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#b5b1b9';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('GESTURE STUDY / 010', 25, 30);
    ctx.textAlign = 'right';
    ctx.fillText(`${String(strokes.length).padStart(2, '0')} MARKS`, size.width - 25, 30);
    strokes.forEach(drawStroke);
    if (!strokes.length) {
      ctx.textAlign = 'center';
      ctx.font = `italic ${Math.min(size.width * 0.09, 70)}px Georgia`;
      ctx.fillStyle = '#c5bec8';
      ctx.fillText('Your move.', size.width / 2, size.height / 2);
    }
    ctx.textAlign = 'right';
    ctx.font = `italic ${Math.min(size.width * 0.046, 44)}px Georgia`;
    ctx.fillStyle = '#d9c5d0';
    ctx.fillText('afterimage', size.width - 25, size.height - 23);
  }

  const loop = createLoop(draw, { paused: reducedMotion });
  canvas.addEventListener('canvasresize', loop.requestRender, { signal });

  function addPoint(event: PointerEvent) {
    if (!activeStroke) return;
    const position = pointerPosition(event, canvas);
    const point = {
      x: clamp(position.x / size.width, 0, 1),
      y: clamp(position.y / size.height, 0, 1),
      pressure: event.pointerType === 'pen' ? Math.max(event.pressure, 0.15) : 0.75,
    };
    const previous = activeStroke.points.at(-1);
    if (!previous || Math.hypot((point.x - previous.x) * size.width, (point.y - previous.y) * size.height) > 2) {
      if (activeStroke.points.length >= 700) activeStroke.points.shift();
      activeStroke.points.push(point);
      loop.requestRender();
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointerId !== undefined || event.button !== 0) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (strokes.length >= 16) {
      strokes.shift();
      report('Making room for your newest mark. Up to sixteen gestures stay on the canvas.');
    }
    activeStroke = { points: [], hue: strokes.length, seed: seed++ };
    strokes.push(activeStroke);
    addPoint(event);
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) addPoint(event);
  }, { signal });
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (activeStroke && activeStroke.points.length === 1) {
      const point = activeStroke.points[0];
      activeStroke.points.push({ ...point, x: clamp(point.x + 0.012, 0, 1), y: clamp(point.y - 0.012, 0, 1) });
    }
    activeStroke = undefined;
    pointerId = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    loop.requestRender();
  };
  canvas.addEventListener('pointerup', finish, { signal });
  canvas.addEventListener('pointercancel', finish, { signal });

  controlSelect(controls, {
    label: 'Ink',
    value: palette,
    choices: [{ value: 'opal', label: 'Opal' }, { value: 'acid', label: 'Acid' }, { value: 'cobalt', label: 'Cobalt' }, { value: 'ember', label: 'Ember' }],
    onChange(value) { palette = value; loop.requestRender(); },
  });
  controlRange(controls, {
    label: 'Ribbon width', min: 10, max: 85, value: width, format: (value) => `${value} px`,
    onChange(value) { width = value; loop.requestRender(); },
  });
  controlRange(controls, {
    label: 'Drift', min: 0, max: 1, step: 0.01, value: drift, format: (value) => `${Math.round(value * 100)}%`,
    onChange(value) { drift = value; loop.requestRender(); },
  });
  controlButton(controls, {
    label: 'New gesture',
    onClick() {
      seed++;
      seedComposition();
      report('A new composition. Add a gesture to make it yours.');
      loop.requestRender();
    },
  });
  controlButton(controls, {
    label: 'Clear',
    onClick() {
      strokes = [];
      cancelDrawing();
      report('Canvas cleared. Draw a ribbon or use New gesture to begin.');
      loop.requestRender();
    },
  });
  controlButton(controls, {
    label: 'Keep a print',
    onClick() {
      draw(time);
      canvas.toBlob((blob) => {
        if (signal.aborted) return;
        if (!blob) {
          report('The print could not be created. Try again with a smaller browser window.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'odd-index-afterimage.png';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        report('Your print is ready: odd-index-afterimage.png.');
      }, 'image/png');
    },
  });

  return {
    setPaused: loop.setPaused,
    reset() {
      seed = 14;
      seedComposition();
      loop.requestRender();
    },
    destroy() {
      cancelDrawing();
      loop.destroy();
      surface.dispose();
      hint.remove();
      strokes = [];
    },
  };
}
