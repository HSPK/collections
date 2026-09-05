import { canvas2D, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { interactionScope, setRangeValue } from './interaction-common';

const PAPER = '#d9eb6c';
const INK = '#252c18';
const MAX_PARTICLES = 6200;

interface Particle {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  shade: number;
}

interface Typesetting {
  font: string;
  lines: { text: string; baseline: number }[];
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function cleanWord(value: string) {
  return Array.from(value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' '))
    .slice(0, 12).join('');
}

export function mount(context: ExperimentContext): ExperimentInstance {
  context.signal.throwIfAborted();
  const mask = document.createElement('canvas');
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  if (!maskContext) throw new Error('Type Playground could not create its letter sampling canvas.');
  const maskInk = maskContext;
  const scope = interactionScope(context);
  const surface = canvas2D(
    context.container,
    'PLAY, typeset in elastic particles. Move through the letters. ' +
    'Arrow keys move the brush, Space scatters the word, and Escape puts the letters back.',
  );
  scope.disposeWith(surface.dispose);
  const { canvas, context: ink, size } = surface;
  canvas.tabIndex = 0;
  canvas.style.cursor = 'crosshair';
  canvas.setAttribute('aria-keyshortcuts', 'Space Escape ArrowLeft ArrowRight ArrowUp ArrowDown');
  const hint = stageHint(context.container, 'Move through the letters / Space to scatter / Esc to gather');
  scope.disposeWith(() => hint.remove());
  let word = 'PLAY';
  let typeface = 'grotesk';
  let elasticity = 55;
  let paused = context.reducedMotion;
  let focused = false;
  let scatterSeed = 804;
  let pointerId: number | undefined;
  let pointerTime = 0;
  const pointer = { x: size.width / 2, y: size.height / 2, vx: 0, vy: 0, active: false, pressed: false };
  const particles: Particle[] = [];
  let setting: Typesetting;

  function fontAt(fontSize: number) {
    if (typeface === 'editorial') return `700 ${fontSize}px Georgia, "Times New Roman", serif`;
    if (typeface === 'mono') return `700 ${fontSize}px "Courier New", monospace`;
    return `900 ${fontSize}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  }

  function typeset(): Typesetting {
    const padding = Math.max(24, size.width * 0.065);
    const availableWidth = size.width - padding * 2;
    const availableHeight = Math.max(90, size.height - 156);
    const characters = Array.from(word);
    const portrait = availableWidth / availableHeight < 1.22;
    const rows = portrait ? (characters.length > 8 ? 3 : characters.length > 2 ? 2 : 1) :
      characters.length > 7 ? 2 : 1;
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
      const length = Math.ceil(characters.length / (rows - row));
      const line = characters.splice(0, length).join('').trim();
      if (line) lines.push(line);
    }
    maskInk.font = fontAt(100);
    const metrics = lines.map((line) => maskInk.measureText(line));
    const widthRatio = Math.max(...metrics.map((metric) =>
      Math.max(metric.width, metric.actualBoundingBoxLeft + metric.actualBoundingBoxRight))) / 100;
    const ascentRatio = Math.max(...metrics.map((metric) => metric.actualBoundingBoxAscent)) / 100;
    const descentRatio = Math.max(...metrics.map((metric) => metric.actualBoundingBoxDescent)) / 100;
    const lineHeight = typeface === 'editorial' ? 0.93 : 0.89;
    const heightRatio = Math.max(0.1, ascentRatio + descentRatio + (lines.length - 1) * lineHeight);
    const fontSize = Math.min(490, availableWidth / Math.max(widthRatio, 0.1), availableHeight / heightRatio);
    const height = fontSize * heightRatio;
    const top = (size.height - height) / 2 - 3;
    return {
      font: fontAt(fontSize),
      lines: lines.map((text, index) => ({ text, baseline: top + fontSize * (ascentRatio + index * lineHeight) })),
      left: (size.width - fontSize * widthRatio) / 2,
      right: (size.width + fontSize * widthRatio) / 2,
      top,
      bottom: top + height,
    };
  }

  function rebuild(snap: boolean) {
    setting = typeset();
    const scale = Math.min(1, 1400 / size.width, 900 / size.height);
    mask.width = Math.max(1, Math.round(size.width * scale));
    mask.height = Math.max(1, Math.round(size.height * scale));
    maskInk.setTransform(scale, 0, 0, scale, 0, 0);
    maskInk.font = setting.font;
    maskInk.textAlign = 'center';
    maskInk.textBaseline = 'alphabetic';
    maskInk.fillStyle = INK;
    for (const line of setting.lines) maskInk.fillText(line.text, size.width / 2, line.baseline);
    const pixels = maskInk.getImageData(0, 0, mask.width, mask.height).data;
    let area = 0;
    for (let pixel = 3; pixel < pixels.length; pixel += 4) {
      if (pixels[pixel] > 110) area++;
    }
    const target = Math.min(MAX_PARTICLES, size.width < 600 ? 3400 : 5800);
    const spacing = Math.max(1.65, Math.sqrt(area / target));
    const candidates: { x: number; y: number }[] = [];
    let row = 0;
    for (let y = spacing / 2; y < mask.height; y += spacing) {
      const offset = row++ % 2 ? spacing * 0.5 : 0;
      for (let x = spacing / 2 + offset; x < mask.width; x += spacing) {
        const index = (Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3;
        if (pixels[index] > 110) candidates.push({ x: x / scale, y: y / scale });
      }
    }
    const previous = snap ? [] : particles.slice();
    particles.length = 0;
    const count = Math.min(target, candidates.length);
    const rng = random(807 + word.length * 41);
    const grain = clamp(spacing / scale * 0.27, 0.8, 2.8);
    for (let index = 0; index < count; index++) {
      const candidate = candidates[Math.floor(index * candidates.length / count)];
      const homeX = candidate.x + (rng() - 0.5) * spacing * 0.12 / scale;
      const homeY = candidate.y + (rng() - 0.5) * spacing * 0.12 / scale;
      const old = previous.length ? previous[Math.floor(index * previous.length / count)] : undefined;
      particles.push({
        x: old?.x ?? homeX,
        y: old?.y ?? homeY,
        homeX, homeY,
        vx: 0, vy: 0,
        radius: grain * (0.7 + rng() * 0.55),
        phase: rng() * Math.PI * 2,
        shade: index % 19 === 0 ? 2 : index % 7 === 0 ? 1 : 0,
      });
    }
    if (count === 0) context.report('Those characters have no visible outline. Try letters, numbers, or punctuation.');
    canvas.setAttribute('aria-label', `"${word}", typeset in ${count} elastic particles. ` +
      'Arrow keys move the brush, Space scatters the word, and Escape puts the letters back.');
  }

  function brushRadius() {
    return Math.min(126, size.width * 0.25) * (pointer.pressed ? 1.35 : 1);
  }

  function advance(elapsed: number, delta: number) {
    const steps = Math.max(1, Math.ceil(delta / (1 / 90)));
    const dt = delta / steps;
    const spring = 12 + elasticity * 0.8;
    const damping = Math.exp(-(5.8 + elasticity * 0.036) * dt);
    const radius = brushRadius();
    const radiusSquared = radius * radius;
    for (let step = 0; step < steps; step++) {
      for (const particle of particles) {
        const drift = Math.sin(elapsed * 1.15 + particle.phase) * 0.55;
        particle.vx += (particle.homeX + drift - particle.x) * spring * dt;
        particle.vy += (particle.homeY + drift * 0.7 - particle.y) * spring * dt;
        if (pointer.active) {
          let dx = particle.x - pointer.x;
          let dy = particle.y - pointer.y;
          const squared = dx * dx + dy * dy;
          if (squared < radiusSquared) {
            if (squared < 0.01) {
              dx = Math.cos(particle.phase) * 0.1;
              dy = Math.sin(particle.phase) * 0.1;
            }
            const distance = Math.hypot(dx, dy);
            const falloff = (1 - distance / radius) ** 2;
            const force = pointer.pressed ? 4700 : 2400;
            particle.vx += (dx / distance * force + pointer.vx * 4.5) * falloff * dt;
            particle.vy += (dy / distance * force + pointer.vy * 4.5) * falloff * dt;
          }
        }
        particle.vx = clamp(particle.vx * damping, -850, 850);
        particle.vy = clamp(particle.vy * damping, -850, 850);
        particle.x = clamp(particle.x + particle.vx * dt, 8, size.width - 8);
        particle.y = clamp(particle.y + particle.vy * dt, 48, size.height - 58);
      }
    }
    pointer.vx *= Math.exp(-delta * 12);
    pointer.vy *= Math.exp(-delta * 12);
  }

  function draw() {
    const { width, height } = size;
    ink.fillStyle = PAPER;
    ink.fillRect(0, 0, width, height);
    ink.lineWidth = 0.6;
    ink.strokeStyle = 'rgba(73, 88, 30, 0.095)';
    ink.beginPath();
    for (let x = 24; x < width; x += 28) {
      ink.moveTo(x, 60);
      ink.lineTo(x, height - 62);
    }
    for (let y = 74; y < height - 64; y += 28) {
      ink.moveTo(20, y);
      ink.lineTo(width - 20, y);
    }
    ink.stroke();
    ink.globalAlpha = 0.034;
    ink.drawImage(mask, 0, 0, width, height);
    ink.globalAlpha = 1;

    const colors = [INK, '#637031', '#8b9a40'];
    for (let shade = 0; shade < colors.length; shade++) {
      ink.fillStyle = colors[shade];
      ink.beginPath();
      for (const particle of particles) {
        if (particle.shade !== shade) continue;
        ink.moveTo(particle.x + particle.radius, particle.y);
        ink.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      }
      ink.fill();
    }

    ink.strokeStyle = 'rgba(37, 44, 24, 0.4)';
    ink.lineWidth = 0.8;
    ink.beginPath();
    for (const x of [setting.left - 9, setting.right + 9]) {
      for (const y of [setting.top - 10, setting.bottom + 10]) {
        ink.moveTo(x - 4, y);
        ink.lineTo(x + 4, y);
        ink.moveTo(x, y - 4);
        ink.lineTo(x, y + 4);
      }
    }
    ink.stroke();
    ink.fillStyle = INK;
    ink.font = '9px "Courier New", monospace';
    ink.textAlign = 'left';
    ink.fillText('COMPOSE / DECOMPOSE', 24, 32);
    ink.textAlign = 'right';
    ink.fillText(`${particles.length.toLocaleString('en-US')} POINTS`, width - 24, 32);
    if (width > 650) {
      ink.fillText('A STUDY IN RETURN', width - 24, height - 23);
    }
    if (pointer.active) {
      ink.strokeStyle = 'rgba(37, 44, 24, 0.27)';
      ink.beginPath();
      ink.arc(pointer.x, pointer.y, brushRadius() * 0.42, 0, Math.PI * 2);
      ink.stroke();
      ink.fillStyle = INK;
      ink.fillRect(pointer.x - 2, pointer.y - 0.5, 4, 1);
      ink.fillRect(pointer.x - 0.5, pointer.y - 2, 1, 4);
    }
    if (focused) {
      ink.strokeStyle = 'rgba(37, 44, 24, 0.7)';
      ink.strokeRect(3, 3, width - 6, height - 6);
    }
  }

  rebuild(true);
  const loop = createLoop((elapsed, delta) => {
    if (delta > 0) advance(elapsed, delta);
    draw();
  }, { paused });

  function scatter() {
    const rng = random(scatterSeed++);
    pointer.active = false;
    for (const particle of particles) {
      const angle = rng() * Math.PI * 2;
      const distance = 24 + rng() * Math.min(size.width * 0.31, size.height * 0.32);
      particle.x = clamp(particle.homeX + Math.cos(angle) * distance, 12, size.width - 12);
      particle.y = clamp(particle.homeY + Math.sin(angle) * distance, 53, size.height - 64);
      particle.vx = Math.cos(angle) * (80 + rng() * 200);
      particle.vy = Math.sin(angle) * (80 + rng() * 200);
    }
    context.report(paused ? 'Word scattered. Resume motion to watch the letters return, or press Escape to gather them.' :
      'Word scattered. Every point will find its way back.');
    loop.requestRender();
  }

  function gather() {
    pointer.active = false;
    for (const particle of particles) {
      particle.x = particle.homeX;
      particle.y = particle.homeY;
      particle.vx = 0;
      particle.vy = 0;
    }
    context.report(`"${word}" is back in place.`);
    loop.requestRender();
  }

  // Paused artwork remains directly editable without starting an animation.
  function pressStillBrush(moveX = 0, moveY = 0) {
    const radius = brushRadius();
    for (const particle of particles) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      const falloff = (1 - distance / radius) ** 2;
      const nx = distance > 0.01 ? dx / distance : Math.cos(particle.phase);
      const ny = distance > 0.01 ? dy / distance : Math.sin(particle.phase);
      particle.x = clamp(particle.x + (nx * 23 + moveX * 0.4) * falloff, 8, size.width - 8);
      particle.y = clamp(particle.y + (ny * 23 + moveY * 0.4) * falloff, 48, size.height - 58);
      particle.vx = 0;
      particle.vy = 0;
    }
  }

  const wordGroup = document.createElement('label');
  wordGroup.className = 'control control--text';
  const wordLabel = document.createElement('span');
  wordLabel.className = 'control-label';
  wordLabel.textContent = 'Your word';
  const wordInput = document.createElement('input');
  wordInput.type = 'text';
  wordInput.value = word;
  wordInput.placeholder = 'PLAY';
  wordInput.maxLength = 12;
  wordInput.autocomplete = 'off';
  wordInput.autocapitalize = 'characters';
  wordInput.spellcheck = false;
  wordInput.setAttribute('aria-label', 'Your word, up to 12 characters');
  wordInput.title = 'Up to 12 characters. Long words are automatically arranged on more than one line.';
  wordGroup.append(wordLabel, wordInput);
  context.controls.append(wordGroup);
  scope.ownControl(wordInput);
  wordInput.addEventListener('input', () => {
    const clean = cleanWord(wordInput.value);
    if (clean !== wordInput.value) wordInput.value = clean;
    word = clean.trim().toUpperCase() || 'PLAY';
    pointer.active = false;
    rebuild(paused);
    if (particles.length) context.report(clean.trim() ? `Now typesetting "${word}".` : 'Type a word of up to 12 characters. PLAY is shown while the field is empty.');
    loop.requestRender();
  }, { signal: scope.signal });

  const elasticityControl = scope.ownControl(controlRange(context.controls, {
    label: 'Elasticity', min: 10, max: 100, step: 5, value: elasticity,
    format: (value) => `${value}%`,
    onChange: (value) => {
      elasticity = value;
      loop.requestRender();
    },
  }));
  const typefaceControl = scope.ownControl(controlSelect(context.controls, {
    label: 'Typeface', value: typeface,
    choices: [
      { value: 'grotesk', label: 'Heavy grotesk' },
      { value: 'editorial', label: 'Editorial serif' },
      { value: 'mono', label: 'Typewriter' },
    ],
    onChange: (value) => {
      typeface = value;
      rebuild(paused);
      loop.requestRender();
    },
  }));
  scope.ownControl(controlButton(context.controls, {
    label: 'Scatter the word', title: 'Scatter the word (Space when the canvas is focused)', onClick: scatter,
  }));

  function movePointer(event: PointerEvent) {
    const point = pointerPosition(event, canvas);
    const moveX = point.x - pointer.x;
    const moveY = point.y - pointer.y;
    const dt = Math.max(1 / 120, (event.timeStamp - pointerTime) / 1000);
    pointer.vx = pointer.active ? clamp(moveX / dt, -850, 850) : 0;
    pointer.vy = pointer.active ? clamp(moveY / dt, -850, 850) : 0;
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
    pointerTime = event.timeStamp;
    if (paused) pressStillBrush(clamp(moveX, -40, 40), clamp(moveY, -40, 40));
    loop.requestRender();
  }

  canvas.addEventListener('pointermove', (event) => {
    if (!event.isPrimary || (pointerId !== undefined && pointerId !== event.pointerId)) return;
    movePointer(event);
  }, { signal: scope.signal });
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || pointerId !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerId = event.pointerId;
    pointer.pressed = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    movePointer(event);
  }, { signal: scope.signal });

  function releasePointer() {
    const previous = pointerId;
    pointerId = undefined;
    pointer.pressed = false;
    if (previous !== undefined && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }
  canvas.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    releasePointer();
    if (event.pointerType !== 'mouse') pointer.active = false;
    loop.requestRender();
  }, { signal: scope.signal });
  const cancelPointer = () => {
    releasePointer();
    pointer.active = false;
    loop.requestRender();
  };
  canvas.addEventListener('pointercancel', cancelPointer, { signal: scope.signal });
  canvas.addEventListener('lostpointercapture', cancelPointer, { signal: scope.signal });
  canvas.addEventListener('pointerleave', () => {
    if (pointerId === undefined) pointer.active = false;
    loop.requestRender();
  }, { signal: scope.signal });
  canvas.addEventListener('focus', () => {
    focused = true;
    loop.requestRender();
  }, { signal: scope.signal });
  canvas.addEventListener('blur', () => {
    focused = false;
    if (pointerId === undefined) pointer.active = false;
    loop.requestRender();
  }, { signal: scope.signal });
  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) scatter();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      gather();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const amount = event.shiftKey ? 44 : 22;
      const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
      const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
      pointer.x = clamp(pointer.x + dx, 16, size.width - 16);
      pointer.y = clamp(pointer.y + dy, 60, size.height - 65);
      pointer.vx = dx * 12;
      pointer.vy = dy * 12;
      pointer.active = true;
      if (paused) pressStillBrush(dx, dy);
      loop.requestRender();
    }
  }, { signal: scope.signal });
  canvas.addEventListener('canvasresize', () => {
    releasePointer();
    pointer.active = false;
    pointer.x = size.width / 2;
    pointer.y = size.height / 2;
    rebuild(true);
    loop.requestRender();
  }, { signal: scope.signal });

  scope.disposeWith(releasePointer);
  scope.disposeWith(() => {
    particles.length = 0;
    mask.width = 1;
    mask.height = 1;
    canvas.width = 1;
    canvas.height = 1;
  });
  scope.disposeWith(loop.destroy);
  return {
    destroy: scope.destroy,
    setPaused(value) {
      paused = value;
      loop.setPaused(value);
    },
    reset() {
      releasePointer();
      pointer.active = false;
      word = 'PLAY';
      wordInput.value = word;
      typeface = 'grotesk';
      typefaceControl.value = typeface;
      scatterSeed = 804;
      setRangeValue(elasticityControl, 55);
      rebuild(true);
      context.report('PLAY is back in its original type.');
      loop.requestRender();
    },
  };
}
