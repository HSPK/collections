import { canvas2D, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { interactionScope, setRangeValue } from './interaction-common';

const LIMIT = 36;
const INITIAL_COUNT = 23;
const STEP = 1 / 120;
const PAPER = '#e9e3d4';
const COLOR_SEQUENCE = [0, 1, 2, 3, 5, 0, 1, 4, 2, 3, 0, 5];
const PALETTES = [
  { face: '#cf6948', light: '#e88b63', edge: '#aa4e37', ink: '#713c2c' },
  { face: '#354ac4', light: '#5c70dc', edge: '#24368e', ink: '#d9e0ff' },
  { face: '#7e874c', light: '#a0a567', edge: '#5d6638', ink: '#e3e6c2' },
  { face: '#353a37', light: '#535953', edge: '#242a27', ink: '#d8d8c8' },
  { face: '#d4a440', light: '#ebc266', edge: '#aa7e2b', ink: '#785820' },
  { face: '#ddcfb7', light: '#f5e8d1', edge: '#b6a38a', ink: '#796854' },
];

interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  factor: number;
  radius: number;
  shape: number;
  palette: number;
  sprite: HTMLCanvasElement;
  spriteSize: number;
}

interface Gesture {
  pointer: number;
  body: Body | undefined;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  lastTime: number;
  travelled: number;
}

function toyPaths(): Path2D[] {
  const disc = new Path2D();
  disc.arc(0, 0, 1, 0, Math.PI * 2);
  const square = new Path2D();
  square.roundRect(-0.77, -0.77, 1.54, 1.54, 0.3);
  const hexagon = new Path2D();
  for (let side = 0; side < 6; side++) {
    const angle = side * Math.PI / 3;
    if (side === 0) hexagon.moveTo(Math.cos(angle), Math.sin(angle));
    else hexagon.lineTo(Math.cos(angle), Math.sin(angle));
  }
  hexagon.closePath();
  const ring = new Path2D(disc);
  ring.moveTo(0.4, 0);
  ring.arc(0, 0, 0.4, 0, Math.PI * 2, true);
  const flower = new Path2D();
  for (let step = 0; step <= 120; step++) {
    const angle = step / 120 * Math.PI * 2;
    const radius = 0.88 + Math.cos(angle * 6) * 0.12;
    if (step === 0) flower.moveTo(radius, 0);
    else flower.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  flower.closePath();
  return [disc, square, hexagon, ring, flower];
}

export function mount(context: ExperimentContext): ExperimentInstance {
  const scope = interactionScope(context);
  const surface = canvas2D(
    context.container,
    'A garden of colored physical objects. Drag a shape or tap empty space to plant one. ' +
    'Use A to plant, S to shuffle, brackets to select a shape, and arrow keys to move it.',
  );
  scope.disposeWith(surface.dispose);
  const { canvas, context: ink, size } = surface;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-keyshortcuts', 'A S [ ] ArrowUp ArrowDown ArrowLeft ArrowRight');
  canvas.style.cursor = 'grab';
  const hint = stageHint(context.container, 'Drag a shape / tap to plant / A to add / S to shuffle');
  hint.style.maxWidth = 'calc(100% - 84px)';
  scope.disposeWith(() => hint.remove());
  const paths = toyPaths();
  const bodies: Body[] = [];
  let rng = random(70423);
  let serial = 0;
  let gravity = 65;
  let direction = 'down';
  let paused = context.reducedMotion;
  let gesture: Gesture | undefined;
  let selected: Body | undefined;
  let focused = false;
  let accumulator = 0;
  let previousWidth = size.width;
  let previousHeight = size.height;

  function bounds(width = size.width, height = size.height) {
    const inset = width > 700 ? width * 0.12 : 20;
    return { left: inset, right: width - inset, top: 67, bottom: height - 69 };
  }

  function baseRadius() {
    const area = bounds();
    return Math.max(10, Math.min(size.width * 0.061, (area.bottom - area.top) * 0.14, 48));
  }

  function paintToy(body: Body) {
    const diameter = body.radius * 2.85;
    const sprite = document.createElement('canvas');
    sprite.width = Math.ceil(diameter * size.dpr);
    sprite.height = Math.ceil(diameter * size.dpr);
    const paint = sprite.getContext('2d');
    if (!paint) throw new Error('Gravity Garden could not prepare its shape textures.');
    paint.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    paint.translate(diameter / 2, diameter / 2);
    paint.scale(body.radius, body.radius);
    const palette = PALETTES[body.palette];
    const path = paths[body.shape];
    paint.shadowColor = 'rgba(69, 54, 36, 0.24)';
    paint.shadowBlur = body.radius * 0.19 * size.dpr;
    paint.shadowOffsetX = body.radius * 0.06 * size.dpr;
    paint.shadowOffsetY = body.radius * 0.13 * size.dpr;
    paint.fillStyle = palette.edge;
    paint.fill(path, 'evenodd');
    paint.shadowColor = 'transparent';
    paint.translate(0, -0.055);
    const glaze = paint.createLinearGradient(-0.7, -0.85, 0.85, 0.85);
    glaze.addColorStop(0, palette.light);
    glaze.addColorStop(1, palette.face);
    paint.fillStyle = glaze;
    paint.fill(path, 'evenodd');
    paint.strokeStyle = 'rgba(255, 255, 240, 0.27)';
    paint.lineWidth = 0.022;
    paint.stroke(path);
    paint.strokeStyle = palette.ink;
    paint.fillStyle = palette.ink;
    paint.lineWidth = 0.024;
    paint.globalAlpha = 0.64;
    if (body.shape === 0) {
      paint.beginPath();
      paint.arc(0, 0, 0.63, -0.8, Math.PI * 1.31);
      paint.stroke();
      paint.font = '500 0.29px "Courier New", monospace';
      paint.textAlign = 'center';
      paint.textBaseline = 'middle';
      paint.fillText(String(body.id % 99 + 1).padStart(2, '0'), 0, 0.025);
    } else if (body.shape === 1) {
      paint.lineWidth = 0.055;
      paint.lineCap = 'round';
      for (let line = -1; line <= 1; line++) {
        paint.beginPath();
        paint.moveTo(-0.32, line * 0.24 - 0.08);
        paint.lineTo(0.32, line * 0.24 + 0.08);
        paint.stroke();
      }
    } else if (body.shape === 2) {
      paint.save();
      paint.scale(0.64, 0.64);
      paint.stroke(path);
      paint.restore();
      paint.beginPath();
      paint.arc(0, 0, 0.085, 0, Math.PI * 2);
      paint.fill();
    } else if (body.shape === 3) {
      for (let dot = 0; dot < 12; dot++) {
        const angle = dot * Math.PI / 6;
        paint.beginPath();
        paint.arc(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, 0.025, 0, Math.PI * 2);
        paint.fill();
      }
    } else {
      paint.beginPath();
      paint.arc(0, 0, 0.24, 0, Math.PI * 2);
      paint.stroke();
      paint.beginPath();
      paint.arc(0, 0, 0.12, 0, Math.PI * 2);
      paint.fill();
    }
    body.sprite = sprite;
    body.spriteSize = diameter;
  }

  function makeBody(): Body {
    const factor = 0.72 + rng() * 0.44;
    const body: Body = {
      id: serial++,
      x: 0, y: 0,
      vx: (rng() - 0.5) * 65,
      vy: -rng() * 24,
      angle: (rng() - 0.5) * Math.PI,
      spin: (rng() - 0.5) * 0.65,
      factor,
      radius: baseRadius() * factor,
      shape: Math.floor(rng() * paths.length),
      palette: COLOR_SEQUENCE[(serial - 1) % COLOR_SEQUENCE.length],
      sprite: document.createElement('canvas'),
      spriteSize: 0,
    };
    paintToy(body);
    return body;
  }

  function contain(body: Body, bounce: boolean) {
    const area = bounds();
    const left = area.left + body.radius;
    const right = area.right - body.radius;
    const top = area.top + body.radius;
    const bottom = area.bottom - body.radius;
    if (body.x < left || body.x > right) {
      body.x = clamp(body.x, left, right);
      if (bounce && ((body.x === left && body.vx < 0) || (body.x === right && body.vx > 0))) {
        body.vx *= -0.34;
        body.vy *= 0.97;
        body.spin *= 0.86;
      }
    }
    if (body.y < top || body.y > bottom) {
      body.y = clamp(body.y, top, bottom);
      if (bounce && ((body.y === top && body.vy < 0) || (body.y === bottom && body.vy > 0))) {
        body.vy = Math.abs(body.vy) < 25 ? 0 : body.vy * -0.34;
        body.vx *= 0.98;
        body.spin = body.spin * 0.9 + body.vx / body.radius * 0.035;
      }
    }
  }

  function solve(iterations: number, impulses: boolean) {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let first = 0; first < bodies.length; first++) {
        const a = bodies[first];
        for (let second = first + 1; second < bodies.length; second++) {
          const b = bodies[second];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const reach = a.radius + b.radius + 0.8;
          const squared = dx * dx + dy * dy;
          if (squared >= reach * reach) continue;
          if (squared < 0.0001) {
            dx = Math.cos(a.id + b.id) * 0.01;
            dy = Math.sin(a.id + b.id) * 0.01;
          }
          const distance = Math.hypot(dx, dy);
          const nx = dx / distance;
          const ny = dy / distance;
          const massA = gesture?.body === a ? 0 : 1 / (a.radius * a.radius);
          const massB = gesture?.body === b ? 0 : 1 / (b.radius * b.radius);
          const inverseMass = massA + massB;
          const correction = Math.max(0, reach - distance - 0.01) * 0.86 / inverseMass;
          a.x -= nx * correction * massA;
          a.y -= ny * correction * massA;
          b.x += nx * correction * massB;
          b.y += ny * correction * massB;
          if (!impulses) continue;
          const relativeX = b.vx - a.vx;
          const relativeY = b.vy - a.vy;
          const closing = relativeX * nx + relativeY * ny;
          if (closing >= 0) continue;
          const restitution = closing < -32 ? 0.38 : 0;
          const impulse = -(1 + restitution) * closing / inverseMass;
          a.vx -= impulse * nx * massA;
          a.vy -= impulse * ny * massA;
          b.vx += impulse * nx * massB;
          b.vy += impulse * ny * massB;
          const tangent = relativeX * -ny + relativeY * nx;
          const friction = clamp(-tangent / inverseMass, -impulse * 0.2, impulse * 0.2);
          a.vx += friction * ny * massA;
          a.vy -= friction * nx * massA;
          b.vx -= friction * ny * massB;
          b.vy += friction * nx * massB;
          a.spin = clamp(a.spin + tangent * 0.0015, -3, 3);
          b.spin = clamp(b.spin + tangent * 0.0015, -3, 3);
        }
        contain(a, impulses);
      }
    }
  }

  function arrange(count: number) {
    gesture = undefined;
    selected = undefined;
    bodies.length = 0;
    const area = bounds();
    const base = baseRadius();
    const columns = Math.max(3, Math.floor((area.right - area.left) / (base * 2.08)));
    let row = 0;
    while (bodies.length < count) {
      const capacity = count <= INITIAL_COUNT ? Math.max(3, columns - Math.min(row, 2)) : columns;
      const inRow = Math.min(capacity, count - bodies.length);
      for (let column = 0; column < inRow; column++) {
        const body = makeBody();
        body.x = size.width / 2 + (column - (inRow - 1) / 2) * base * 2.06 +
          (row % 2 ? base * 0.14 : -base * 0.14) + (rng() - 0.5) * base * 0.1;
        body.y = area.bottom - base * 1.2 - row * base * 1.86;
        contain(body, false);
        bodies.push(body);
      }
      row++;
    }
    solve(70, false);
    accumulator = 0;
  }

  function advance() {
    const acceleration = gravity * 5.5;
    const gx = direction === 'left' ? -acceleration : direction === 'right' ? acceleration : 0;
    const gy = direction === 'up' ? -acceleration : direction === 'down' ? acceleration : 0;
    const speedLimit = Math.max(260, baseRadius() * 13);
    for (const body of bodies) {
      if (gesture?.body === body) continue;
      body.vx = clamp((body.vx + gx * STEP) * 0.998, -speedLimit, speedLimit);
      body.vy = clamp((body.vy + gy * STEP) * 0.998, -speedLimit, speedLimit);
      body.x += body.vx * STEP;
      body.y += body.vy * STEP;
      body.angle += body.spin * STEP;
      body.spin *= 0.996;
      contain(body, true);
    }
    solve(7, true);
  }

  function draw() {
    const { width, height } = size;
    const area = bounds();
    ink.fillStyle = PAPER;
    ink.fillRect(0, 0, width, height);
    const wash = ink.createRadialGradient(width * 0.47, height * 0.42, 10, width / 2, height / 2, width * 0.68);
    wash.addColorStop(0, 'rgba(255, 252, 241, 0.5)');
    wash.addColorStop(1, 'rgba(255, 252, 241, 0)');
    ink.fillStyle = wash;
    ink.fillRect(0, 0, width, height);
    ink.fillStyle = 'rgba(89, 80, 59, 0.17)';
    for (let y = 78; y < area.bottom - 9; y += 26) {
      for (let x = 27; x < width - 20; x += 26) ink.fillRect(x, y, 0.9, 0.9);
    }
    ink.strokeStyle = 'rgba(79, 70, 49, 0.24)';
    ink.lineWidth = 1;
    ink.beginPath();
    ink.moveTo(area.left - 4, area.bottom + 6);
    ink.lineTo(area.right + 4, area.bottom + 6);
    ink.moveTo(area.left - 4, area.bottom - 4);
    ink.lineTo(area.left - 4, area.bottom + 11);
    ink.moveTo(area.right + 4, area.bottom - 4);
    ink.lineTo(area.right + 4, area.bottom + 11);
    ink.stroke();
    ink.fillStyle = '#686352';
    ink.font = '9px "Courier New", monospace';
    ink.textAlign = 'left';
    ink.fillText('MATERIAL / MOTION', 24, 32);
    ink.textAlign = 'right';
    ink.fillText(`${String(bodies.length).padStart(2, '0')} / ${LIMIT} PIECES`, width - 24, 32);

    const dragged = gesture?.body;
    const ordered = dragged ? bodies.filter((body) => body !== dragged).concat(dragged) : bodies;
    for (const body of ordered) {
      ink.save();
      ink.translate(body.x, body.y);
      ink.rotate(body.angle);
      ink.drawImage(body.sprite, -body.spriteSize / 2, -body.spriteSize / 2, body.spriteSize, body.spriteSize);
      ink.restore();
    }
    if (selected && (focused || gesture?.body)) {
      ink.strokeStyle = '#595b42';
      ink.lineWidth = 1;
      ink.setLineDash([3, 5]);
      ink.beginPath();
      ink.arc(selected.x, selected.y, selected.radius + 7, 0, Math.PI * 2);
      ink.stroke();
      ink.setLineDash([]);
    }
    const compassX = width - 37;
    const compassY = height - 30;
    ink.strokeStyle = '#797a60';
    ink.lineWidth = 1;
    ink.beginPath();
    ink.arc(compassX, compassY, 12, 0, Math.PI * 2);
    ink.stroke();
    const angle = direction === 'down' ? Math.PI / 2 : direction === 'up' ? -Math.PI / 2 :
      direction === 'left' ? Math.PI : 0;
    ink.save();
    ink.translate(compassX, compassY);
    ink.rotate(angle);
    ink.beginPath();
    ink.moveTo(-6, 0);
    ink.lineTo(6, 0);
    ink.lineTo(2, -3);
    ink.moveTo(6, 0);
    ink.lineTo(2, 3);
    ink.stroke();
    ink.restore();
    if (focused) {
      ink.strokeStyle = 'rgba(72, 67, 56, 0.65)';
      ink.strokeRect(3, 3, width - 6, height - 6);
    }
  }

  arrange(INITIAL_COUNT);
  const loop = createLoop((_elapsed, delta) => {
    accumulator += delta;
    while (accumulator >= STEP) {
      advance();
      accumulator -= STEP;
    }
    draw();
  }, { paused });

  function plant(x = size.width / 2, y = bounds().top + baseRadius() * 1.8) {
    if (bodies.length >= LIMIT) {
      context.report(`The garden is full: ${LIMIT} shapes. Shuffle them, or reset for a fresh arrangement.`);
      return;
    }
    const body = makeBody();
    let found = false;
    for (let attempt = 0; attempt < 140; attempt++) {
      const angle = attempt * 2.399963;
      const distance = Math.sqrt(attempt) * body.radius * 0.58;
      body.x = x + Math.cos(angle) * distance;
      body.y = y + Math.sin(angle) * distance;
      contain(body, false);
      if (bodies.every((other) => Math.hypot(other.x - body.x, other.y - body.y) > body.radius + other.radius + 2)) {
        found = true;
        break;
      }
    }
    if (!found) {
      const area = bounds();
      const spacing = Math.max(8, body.radius * 0.65);
      let nearest = Infinity;
      for (let candidateY = area.top + body.radius; candidateY <= area.bottom - body.radius; candidateY += spacing) {
        for (let candidateX = area.left + body.radius; candidateX <= area.right - body.radius; candidateX += spacing) {
          const distance = (candidateX - x) ** 2 + (candidateY - y) ** 2;
          if (distance >= nearest || !bodies.every((other) =>
            Math.hypot(other.x - candidateX, other.y - candidateY) > body.radius + other.radius + 2)) continue;
          body.x = candidateX;
          body.y = candidateY;
          nearest = distance;
          found = true;
        }
      }
    }
    if (!found) {
      context.report('There is no room in this patch. Try another empty spot, or shuffle the garden.');
      return;
    }
    bodies.push(body);
    selected = body;
    context.report(`Planted shape ${bodies.length} of ${LIMIT}.${paused ? ' Motion is paused; you can still drag the shapes.' : ''}`);
    loop.requestRender();
  }

  function shuffle() {
    releaseGesture();
    arrange(bodies.length);
    context.report(`A fresh arrangement of ${bodies.length} shapes.`);
    loop.requestRender();
  }

  const gravityControl = scope.ownControl(controlRange(context.controls, {
    label: 'Gravity', min: 0, max: 150, step: 5, value: gravity,
    format: (value) => `${value}%`,
    onChange: (value) => {
      gravity = value;
      loop.requestRender();
    },
  }));
  const directionControl = scope.ownControl(controlSelect(context.controls, {
    label: 'Pull toward', value: direction,
    choices: [
      { value: 'down', label: 'The floor' },
      { value: 'left', label: 'The left' },
      { value: 'up', label: 'The ceiling' },
      { value: 'right', label: 'The right' },
    ],
    onChange: (value) => {
      direction = value;
      context.report(`Gravity now pulls ${value}.${paused ? ' Resume motion to see the change.' : ''}`);
      loop.requestRender();
    },
  }));
  scope.ownControl(controlButton(context.controls, {
    label: 'Plant a shape', title: 'Plant a shape (A when the canvas is focused)', onClick: () => plant(),
  }));
  scope.ownControl(controlButton(context.controls, {
    label: 'Shuffle', title: 'Shuffle the garden (S when the canvas is focused)', onClick: shuffle,
  }));

  function hit(x: number, y: number) {
    return [...bodies].reverse().find((body) => Math.hypot(x - body.x, y - body.y) <= body.radius + 3);
  }

  function releaseGesture() {
    const previous = gesture;
    gesture = undefined;
    if (previous && canvas.hasPointerCapture(previous.pointer)) canvas.releasePointerCapture(previous.pointer);
    canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const point = pointerPosition(event, canvas);
    const body = hit(point.x, point.y);
    canvas.focus({ preventScroll: true });
    selected = body;
    gesture = {
      pointer: event.pointerId, body,
      startX: point.x, startY: point.y,
      offsetX: body ? body.x - point.x : 0,
      offsetY: body ? body.y - point.y : 0,
      lastTime: event.timeStamp, travelled: 0,
    };
    if (body) {
      body.vx = 0;
      body.vy = 0;
      body.spin = 0;
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = body ? 'grabbing' : 'crosshair';
    loop.requestRender();
  }, { signal: scope.signal });

  canvas.addEventListener('pointermove', (event) => {
    const point = pointerPosition(event, canvas);
    if (!gesture) {
      canvas.style.cursor = hit(point.x, point.y) ? 'grab' : 'crosshair';
      return;
    }
    if (gesture.pointer !== event.pointerId) return;
    gesture.travelled = Math.max(gesture.travelled, Math.hypot(point.x - gesture.startX, point.y - gesture.startY));
    const body = gesture.body;
    if (!body) return;
    const oldX = body.x;
    const oldY = body.y;
    body.x = point.x + gesture.offsetX;
    body.y = point.y + gesture.offsetY;
    contain(body, false);
    const dt = Math.max(1 / 120, (event.timeStamp - gesture.lastTime) / 1000);
    const maxSpeed = baseRadius() * 11;
    body.vx = clamp((body.x - oldX) / dt, -maxSpeed, maxSpeed);
    body.vy = clamp((body.y - oldY) / dt, -maxSpeed, maxSpeed);
    body.angle += clamp((body.x - oldX) / body.radius * 0.08, -0.12, 0.12);
    gesture.lastTime = event.timeStamp;
    solve(18, false);
    loop.requestRender();
  }, { signal: scope.signal });

  canvas.addEventListener('pointerup', (event) => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const previous = gesture;
    releaseGesture();
    if (!previous.body && previous.travelled < 9) plant(previous.startX, previous.startY);
    else if (previous.body) {
      if (event.timeStamp - previous.lastTime > 90) {
        previous.body.vx = 0;
        previous.body.vy = 0;
      }
      solve(24, false);
      context.report('Shape placed.');
      loop.requestRender();
    }
  }, { signal: scope.signal });

  const cancelGesture = () => {
    if (gesture?.body) {
      gesture.body.vx = 0;
      gesture.body.vy = 0;
    }
    releaseGesture();
    loop.requestRender();
  };
  canvas.addEventListener('pointercancel', cancelGesture, { signal: scope.signal });
  canvas.addEventListener('lostpointercapture', cancelGesture, { signal: scope.signal });
  canvas.addEventListener('focus', () => {
    focused = true;
    selected ??= bodies[0];
    loop.requestRender();
  }, { signal: scope.signal });
  canvas.addEventListener('blur', () => {
    focused = false;
    loop.requestRender();
  }, { signal: scope.signal });

  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'a' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) plant();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!event.repeat) shuffle();
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const index = selected ? bodies.indexOf(selected) : 0;
      selected = bodies[(index + (event.key === ']' ? 1 : -1) + bodies.length) % bodies.length];
      context.report(`Selected shape ${bodies.indexOf(selected) + 1}. Use the arrow keys to move it.`);
      loop.requestRender();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      selected ??= bodies[0];
      const amount = event.shiftKey ? 28 : 12;
      selected.x += event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
      selected.y += event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
      selected.vx = 0;
      selected.vy = 0;
      contain(selected, false);
      solve(30, false);
      loop.requestRender();
    }
  }, { signal: scope.signal });

  canvas.addEventListener('canvasresize', () => {
    releaseGesture();
    const oldArea = bounds(previousWidth, previousHeight);
    const newArea = bounds();
    for (const body of bodies) {
      body.x = newArea.left + (body.x - oldArea.left) / (oldArea.right - oldArea.left) * (newArea.right - newArea.left);
      body.y = newArea.top + (body.y - oldArea.top) / (oldArea.bottom - oldArea.top) * (newArea.bottom - newArea.top);
      body.radius = baseRadius() * body.factor;
      body.vx = 0;
      body.vy = 0;
      paintToy(body);
      contain(body, false);
    }
    previousWidth = size.width;
    previousHeight = size.height;
    solve(80, false);
    loop.requestRender();
  }, { signal: scope.signal });

  scope.disposeWith(releaseGesture);
  scope.disposeWith(() => {
    selected = undefined;
    bodies.length = 0;
    canvas.width = 1;
    canvas.height = 1;
  });
  scope.disposeWith(loop.destroy);
  return {
    destroy: scope.destroy,
    setPaused(value) {
      paused = value;
      accumulator = 0;
      loop.setPaused(value);
    },
    reset() {
      releaseGesture();
      rng = random(70423);
      serial = 0;
      setRangeValue(gravityControl, 65);
      direction = 'down';
      directionControl.value = direction;
      arrange(INITIAL_COUNT);
      context.report('The original garden is planted again.');
      loop.requestRender();
    },
  };
}
