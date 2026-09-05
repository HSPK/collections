import { canvas2D, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';

const BACKGROUND = '#161c26';
const INKS = ['#d79058', '#e9b480', '#f2dec2', '#bfd9e1', '#82aebd', '#ba7851'];
const OPACITY = [0.65, 0.78, 0.88, 0.75, 0.52, 0.56];
const WIDTHS = [0.9, 0.95, 0.85, 0.85, 0.7, 0.75];
const DEFAULT_STRENGTH = 1;
const DEFAULT_TURBULENCE = 0.38;

export function mount(context: ExperimentContext): ExperimentInstance {
  context.signal.throwIfAborted();
  const surface = canvas2D(
    context.container,
    'Copper, cream and ice-blue traces moving through a vortex field. Use the current controls or Gather at center to shape the flow.',
  );
  const { canvas, context: pen, size } = surface;
  const events = new AbortController();
  const controls = document.createElement('div');
  controls.className = 'experiment-controls';
  context.controls.append(controls);
  const hint = stageHint(context.container, 'MOVE TO BEND THE CURRENT / HOLD TO GATHER');
  hint.style.color = '#e5c3a0';
  hint.style.textShadow = '0 1px 8px #161c26';
  const cursor = document.createElement('div');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = 'position:absolute;left:0;top:0;width:28px;height:28px;border:1px solid #e9b48066;border-radius:50%;pointer-events:none;display:none;z-index:1;box-sizing:border-box';
  context.container.append(cursor);
  canvas.style.cursor = 'crosshair';

  let disposed = false;
  let paused = context.reducedMotion;
  let strength = DEFAULT_STRENGTH;
  let turbulence = DEFAULT_TURBULENCE;
  let mode = 'gather';
  let clock = 0;
  let seed = random(20417);
  let count = 0;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let previousX = new Float32Array(0);
  let previousY = new Float32Array(0);
  let age = new Float32Array(0);
  let lifetime = new Float32Array(0);
  let mobility = new Float32Array(0);
  let fieldX = new Float32Array(0);
  let fieldY = new Float32Array(0);
  let columns = 0;
  let rows = 0;
  let cellWidth = 1;
  let cellHeight = 1;
  let rebuildPending = false;
  let inputSteps = 0;
  let loop: ReturnType<typeof createLoop> | undefined;
  const pointer = { x: 0, y: 0, active: false, held: false, id: -1 };
  const impulse = { x: 0.5, y: 0.5, life: 0 };

  function invalidate(steps = 0) {
    if (disposed) return;
    if (paused) inputSteps = Math.max(inputSteps, steps);
    loop?.requestRender();
  }

  function changeField() {
    rebuildPending = true;
    invalidate();
  }

  const strengthControl = controlRange(controls, {
    label: 'Field strength', min: 0.4, max: 1.8, step: 0.05, value: strength,
    format: (value) => `${value.toFixed(2)}x`,
    onChange: (value) => { strength = value; changeField(); },
  });
  const turbulenceControl = controlRange(controls, {
    label: 'Turbulence', min: 0, max: 1, step: 0.01, value: turbulence,
    format: (value) => `${Math.round(value * 100)}%`,
    onChange: (value) => { turbulence = value; changeField(); },
  });
  const modeControl = controlSelect(controls, {
    label: 'Gesture', value: mode,
    choices: [{ value: 'gather', label: 'Attract' }, { value: 'repel', label: 'Repel' }],
    onChange: (value) => {
      mode = value;
      gatherButton.textContent = mode === 'gather' ? 'Gather at center' : 'Scatter at center';
      hint.textContent = mode === 'gather'
        ? 'MOVE TO BEND THE CURRENT / HOLD TO GATHER'
        : 'MOVE TO BEND THE CURRENT / HOLD TO SCATTER';
      invalidate(12);
      context.report(mode === 'gather' ? 'Hold to draw the current towards you.' : 'Hold to push the current away.');
    },
  });
  const gatherButton = controlButton(controls, {
    label: 'Gather at center',
    title: 'Shape the center of the field without a pointer',
    onClick: () => {
      impulse.life = 2.4;
      invalidate(36);
      context.report(mode === 'gather' ? 'A small gravity well, right in the middle.' : 'The center opens; the current flows outwards.');
    },
  });

  function spawn(index: number) {
    x[index] = seed() * size.width;
    y[index] = seed() * size.height;
    previousX[index] = x[index];
    previousY[index] = y[index];
    age[index] = 0;
    lifetime[index] = 2.5 + seed() * 7;
    mobility[index] = 0.65 + seed() * 0.7;
  }

  function makeField() {
    const unit = Math.min(size.width, size.height);
    const portrait = size.width < size.height * 1.05;
    const centers = portrait
      ? [[0.39, 0.3, 1.2, 0.38], [0.58, 0.7, -1.4, 0.45], [0.9, 0.43, 0.65, 0.25]]
      : [[0.31, 0.45, 1.35, 0.43], [0.66, 0.49, -1.4, 0.48], [0.47, 0.94, 0.65, 0.27]];
    const t = clock * 0.09;
    const influences = [];
    if (pointer.active) {
      influences.push({
        x: pointer.x, y: pointer.y, amount: 1,
        radial: pointer.held ? (mode === 'gather' ? -4.8 : 6) : 0,
        spin: pointer.held ? 2.2 : 3.6,
      });
    }
    if (impulse.life > 0) {
      influences.push({
        x: impulse.x * size.width, y: impulse.y * size.height,
        amount: Math.min(1, impulse.life), radial: mode === 'gather' ? -5.8 : 7, spin: 2.8,
      });
    }

    // Sample the analytic current once on a small lattice, not once per particle.
    for (let row = 0; row < rows; row++) {
      const py = row * cellHeight;
      const v = (py - size.height * 0.5) / unit;
      for (let column = 0; column < columns; column++) {
        const px = column * cellWidth;
        const u = (px - size.width * 0.5) / unit;
        let vx = portrait ? 0.07 : 0.19;
        let vy = portrait ? 0.16 : -0.035;
        for (let index = 0; index < centers.length; index++) {
          const center = centers[index];
          const dx = (px - center[0] * size.width) / unit - Math.sin(t + index * 2) * 0.025;
          const dy = (py - center[1] * size.height) / unit - Math.cos(t * 0.8 + index * 3) * 0.025;
          const distance = dx * dx + dy * dy;
          const circulation = center[2] * 0.25 * Math.exp(-distance / (center[3] * center[3] * 2.2))
            / (distance + 0.026);
          vx -= dy * circulation;
          vy += dx * circulation;
        }
        vx += turbulence * (0.65 * Math.cos(v * 8 + Math.sin(u * 3 + t)) + 0.25 * Math.cos(v * 17 + u * 3 - t));
        vy += turbulence * (0.65 * Math.sin(u * 7 + Math.sin(v * 4 - t)) + 0.25 * Math.sin(u * 15 - v * 4 + t));
        for (const influence of influences) {
          const dx = (px - influence.x) / unit;
          const dy = (py - influence.y) / unit;
          const weight = Math.exp(-(dx * dx + dy * dy) / 0.052) * influence.amount * 3;
          vx += (dx * influence.radial - dy * influence.spin) * weight;
          vy += (dy * influence.radial + dx * influence.spin) * weight;
        }
        const index = row * columns + column;
        fieldX[index] = vx;
        fieldY[index] = vy;
      }
    }
  }

  function advect(delta: number, paint = true) {
    const speed = Math.min(size.width, size.height) * 0.19 * strength * delta;
    if (paint) {
      pen.globalCompositeOperation = 'source-over';
      pen.globalAlpha = 1 - Math.exp(-delta * 4.6);
      pen.fillStyle = BACKGROUND;
      pen.fillRect(0, 0, size.width, size.height);
    }
    for (let index = 0; index < count; index++) {
      age[index] += delta;
      if (age[index] > lifetime[index] || x[index] < 0 || x[index] >= size.width || y[index] < 0 || y[index] >= size.height) {
        spawn(index);
        continue;
      }
      previousX[index] = x[index];
      previousY[index] = y[index];
      const gx = x[index] / cellWidth;
      const gy = y[index] / cellHeight;
      const column = Math.min(columns - 2, Math.floor(gx));
      const row = Math.min(rows - 2, Math.floor(gy));
      const fx = gx - column;
      const fy = gy - row;
      const cell = row * columns + column;
      const a = (1 - fx) * (1 - fy);
      const b = fx * (1 - fy);
      const c = (1 - fx) * fy;
      const d = fx * fy;
      const vx = fieldX[cell] * a + fieldX[cell + 1] * b + fieldX[cell + columns] * c + fieldX[cell + columns + 1] * d;
      const vy = fieldY[cell] * a + fieldY[cell + 1] * b + fieldY[cell + columns] * c + fieldY[cell + columns + 1] * d;
      x[index] += vx * speed * mobility[index];
      y[index] += vy * speed * mobility[index];
    }
    if (!paint) return;
    pen.globalCompositeOperation = 'source-over';
    pen.lineCap = 'round';
    const exposure = Math.min(1.4, delta * 60);
    for (let ink = 0; ink < INKS.length; ink++) {
      pen.beginPath();
      pen.strokeStyle = INKS[ink];
      pen.lineWidth = WIDTHS[ink];
      pen.globalAlpha = Math.min(1, OPACITY[ink] * exposure);
      for (let index = ink; index < count; index += INKS.length) {
        pen.moveTo(previousX[index], previousY[index]);
        pen.lineTo(x[index], y[index]);
      }
      pen.stroke();
    }
    pen.globalAlpha = 1;
    pen.globalCompositeOperation = 'source-over';
  }

  function rebuild() {
    seed = random(20417);
    clock = 0;
    const mobile = size.width < 640;
    count = Math.round(clamp(size.width * size.height / 67, mobile ? 1800 : 3600, mobile ? 3100 : 10500));
    x = new Float32Array(count);
    y = new Float32Array(count);
    previousX = new Float32Array(count);
    previousY = new Float32Array(count);
    age = new Float32Array(count);
    lifetime = new Float32Array(count);
    mobility = new Float32Array(count);
    columns = Math.ceil(size.width / 18) + 1;
    rows = Math.ceil(size.height / 18) + 1;
    cellWidth = size.width / (columns - 1);
    cellHeight = size.height / (rows - 1);
    fieldX = new Float32Array(columns * rows);
    fieldY = new Float32Array(columns * rows);
    pen.globalAlpha = 1;
    pen.globalCompositeOperation = 'source-over';
    pen.fillStyle = BACKGROUND;
    pen.fillRect(0, 0, size.width, size.height);
    for (let index = 0; index < count; index++) {
      spawn(index);
      age[index] = seed() * lifetime[index];
    }
    makeField();
    // A deterministic long exposure is already on the page before its first animation frame.
    for (let step = 0; step < 84; step++) advect(1 / 50, step >= 60);
    rebuildPending = false;
  }

  function showCursor() {
    const diameter = pointer.held ? 46 : 28;
    cursor.style.display = pointer.active ? 'block' : 'none';
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.borderColor = mode === 'gather' ? '#e9b48077' : '#bfd9e188';
    cursor.style.transform = `translate(${pointer.x - diameter / 2}px, ${pointer.y - diameter / 2}px)`;
  }

  function movePointer(event: PointerEvent) {
    if (pointer.id !== -1 && event.pointerId !== pointer.id) return;
    const point = pointerPosition(event, canvas);
    pointer.x = clamp(point.x, 0, size.width);
    pointer.y = clamp(point.y, 0, size.height);
    pointer.active = true;
    showCursor();
    invalidate(6);
  }

  function releasePointer() {
    const id = pointer.id;
    pointer.id = -1;
    pointer.held = false;
    pointer.active = false;
    if (id !== -1 && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    showCursor();
    invalidate();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer.id !== -1) return;
    event.preventDefault();
    pointer.id = event.pointerId;
    pointer.held = true;
    canvas.setPointerCapture(event.pointerId);
    movePointer(event);
    invalidate(24);
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', movePointer, { signal: events.signal });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId === pointer.id) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointer.id) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === pointer.id) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('pointerleave', () => {
    if (!pointer.held) releasePointer();
  }, { signal: events.signal });
  window.addEventListener('blur', releasePointer, { signal: events.signal });
  canvas.addEventListener('canvasresize', () => {
    releasePointer();
    changeField();
  }, { signal: events.signal });

  rebuild();
  loop = createLoop((_elapsed, delta) => {
    if (rebuildPending) rebuild();
    if (delta === 0 && inputSteps === 0) return;
    const steps = inputSteps || Math.max(1, Math.ceil(delta * 60));
    const stepDelta = inputSteps ? 1 / 60 : delta / steps;
    inputSteps = 0;
    clock += delta;
    makeField();
    for (let step = 0; step < steps; step++) advect(stepDelta);
    impulse.life = Math.max(0, impulse.life - stepDelta * steps);
  }, { paused });

  function reset() {
    releasePointer();
    impulse.life = 0;
    inputSteps = 0;
    strengthControl.value = String(DEFAULT_STRENGTH);
    turbulenceControl.value = String(DEFAULT_TURBULENCE);
    modeControl.value = 'gather';
    strengthControl.dispatchEvent(new Event('input'));
    turbulenceControl.dispatchEvent(new Event('input'));
    modeControl.dispatchEvent(new Event('change'));
    inputSteps = 0;
    changeField();
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    events.abort();
    loop?.destroy();
    surface.dispose();
    controls.remove();
    hint.remove();
    cursor.remove();
  }

  context.signal.addEventListener('abort', destroy, { once: true, signal: events.signal });
  return {
    destroy,
    reset,
    setPaused(value) {
      paused = value;
      inputSteps = 0;
      loop?.setPaused(value);
    },
  };
}
