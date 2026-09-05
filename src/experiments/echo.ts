import { canvas2D, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlToggle, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';

const TAU = Math.PI * 2;
const BACKGROUND = '#172c29';
const INK = '#d1dd95';
const DEFAULT_DECAY = 7;
const DEFAULT_TEMPO = 0.8;
const DEFAULT_VOLUME = 32;
const NOTES = [146.832, 174.614, 195.998, 220, 261.626, 293.665, 349.228, 391.995, 440, 523.251];
const NOTE_NAMES = ['D3', 'F3', 'G3', 'A3', 'C4', 'D4', 'F4', 'G4', 'A4', 'C5'];
const SEGMENTS = 224;

interface Ripple {
  x: number;
  y: number;
  age: number;
  travel: number;
  personal: boolean;
  phase: number;
}

interface Disturbance {
  x: number;
  y: number;
  radius: number;
  amplitude: number;
}

interface Voice {
  oscillators: OscillatorNode[];
  envelopes: GainNode[];
  pan: StereoPannerNode;
}

interface AudioGraph {
  context: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  voices: Set<Voice>;
  closeTimer: number | undefined;
  closed: boolean;
}

function holdGainAtTime(parameter: AudioParam, time: number): void {
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(time);
    return;
  }
  const currentValue = parameter.value;
  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(currentValue, time);
}

export function mount(context: ExperimentContext): ExperimentInstance {
  context.signal.throwIfAborted();
  const surface = canvas2D(
    context.container,
    'Pale chartreuse circular waves overlap on deep forest green. Tap to send a ripple, or use the Send a ripple button. Sound is optional and off initially.',
  );
  const { canvas, context: pen, size } = surface;
  const events = new AbortController();
  const controls = document.createElement('div');
  controls.className = 'experiment-controls';
  context.controls.append(controls);
  const hint = stageHint(context.container, 'TOUCH THE SURFACE / SOUND IS OFF');
  hint.style.color = INK;
  hint.style.textShadow = '0 1px 8px #172c29';
  canvas.style.cursor = 'crosshair';
  const cursor = document.createElement('div');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = 'position:absolute;left:0;top:0;width:24px;height:24px;border:1px solid #d1dd9555;border-radius:50%;pointer-events:none;display:none;z-index:1;box-sizing:border-box';
  context.container.append(cursor);

  let disposed = false;
  let paused = context.reducedMotion;
  let decay = DEFAULT_DECAY;
  let tempo = DEFAULT_TEMPO;
  let volume = DEFAULT_VOLUME;
  let soundEnabled = false;
  let soundRequest = 0;
  let activeAudio: AudioGraph | undefined;
  const audioGraphs = new Set<AudioGraph>();
  let lastTone = -1;
  let clock = 0;
  let untilAutomatic = 2.7;
  let gestureIndex = 0;
  let pointerId = -1;
  let seed = random(61026);
  let ripples: Ripple[] = [];
  let loop: ReturnType<typeof createLoop> | undefined;
  const cosine = new Float32Array(SEGMENTS + 1);
  const sine = new Float32Array(SEGMENTS + 1);
  const sineThree = new Float32Array(SEGMENTS + 1);
  const cosineThree = new Float32Array(SEGMENTS + 1);
  const sineFive = new Float32Array(SEGMENTS + 1);
  for (let index = 0; index <= SEGMENTS; index++) {
    const angle = index / SEGMENTS * TAU;
    cosine[index] = Math.cos(angle);
    sine[index] = Math.sin(angle);
    sineThree[index] = Math.sin(angle * 3);
    cosineThree[index] = Math.cos(angle * 3);
    sineFive[index] = Math.sin(angle * 5);
  }

  function invalidate() {
    if (!disposed) loop?.requestRender();
  }

  const decayControl = controlRange(controls, {
    label: 'Persistence', min: 3, max: 12, step: 0.5, value: decay,
    format: (value) => `${value.toFixed(1)}s`,
    onChange: (value) => { decay = value; invalidate(); },
  });
  const tempoControl = controlRange(controls, {
    label: 'Tempo', min: 0.35, max: 1.6, step: 0.05, value: tempo,
    format: (value) => `${value.toFixed(2)}x`,
    onChange: (value) => { tempo = value; invalidate(); },
  });
  const soundButton = controlToggle(controls, {
    label: 'Sound', value: false,
    onChange: (value) => { void setSound(value); },
  });
  soundButton.title = 'Enable gentle pentatonic tones for your gestures. Automatic ripples stay silent.';
  const volumeControl = controlRange(controls, {
    label: 'Volume', min: 0, max: 70, step: 1, value: volume,
    format: (value) => `${value}%`,
    onChange: (value) => {
      volume = value;
      if (activeAudio && !activeAudio.closed) {
        const { master, context: audio } = activeAudio;
        master.gain.setTargetAtTime(volume / 100 * 0.42, audio.currentTime, 0.04);
      }
      invalidate();
    },
  });
  controlButton(controls, {
    label: 'Send a ripple',
    title: 'Play the visual instrument without a pointer',
    onClick: () => {
      const angle = gestureIndex++ * 2.39996;
      sendRipple(0.5 + Math.cos(angle) * 0.21, 0.5 + Math.sin(angle) * 0.22);
    },
  });

  function audioReleaseError(error: unknown) {
    console.warn('Echo could not release its audio context.', error);
    if (!disposed) context.report('Sound is muted, but the browser could not release its audio context.');
  }

  function disconnectVoice(graph: AudioGraph, voice: Voice) {
    for (const oscillator of voice.oscillators) {
      oscillator.onended = null;
      oscillator.stop();
      oscillator.disconnect();
    }
    for (const envelope of voice.envelopes) envelope.disconnect();
    voice.pan.disconnect();
    graph.voices.delete(voice);
  }

  function closeAudio(graph: AudioGraph) {
    if (graph.closed) return;
    graph.closed = true;
    if (graph.closeTimer !== undefined) window.clearTimeout(graph.closeTimer);
    for (const voice of graph.voices) disconnectVoice(graph, voice);
    graph.master.disconnect();
    graph.filter.disconnect();
    audioGraphs.delete(graph);
    if (graph.context.state !== 'closed') void graph.context.close().catch(audioReleaseError);
  }

  function retireAudio(graph: AudioGraph, immediately = false) {
    if (graph.closed) return;
    if (immediately || graph.context.state !== 'running') {
      closeAudio(graph);
      return;
    }
    if (graph.closeTimer !== undefined) return;
    const now = graph.context.currentTime;
    holdGainAtTime(graph.master.gain, now);
    graph.master.gain.linearRampToValueAtTime(0, now + 0.025);
    for (const voice of graph.voices) {
      for (const oscillator of voice.oscillators) oscillator.stop(now + 0.035);
    }
    // Finish the short de-click envelope, then release the entire audio device.
    graph.closeTimer = window.setTimeout(() => closeAudio(graph), 45);
  }

  async function setSound(enabled: boolean) {
    if (disposed) return;
    const request = ++soundRequest;
    soundEnabled = enabled;
    soundButton.setAttribute('aria-pressed', String(enabled));
    hint.textContent = enabled ? 'TOUCH THE SURFACE / D MINOR PENTATONIC' : 'TOUCH THE SURFACE / SOUND IS OFF';
    if (!enabled) {
      if (activeAudio) retireAudio(activeAudio);
      activeAudio = undefined;
      context.report('Sound is off. Your ripples can still leave a trace.');
      return;
    }
    if (typeof AudioContext === 'undefined') {
      soundEnabled = false;
      soundButton.setAttribute('aria-pressed', 'false');
      hint.textContent = 'TOUCH THE SURFACE / VISUAL INSTRUMENT';
      context.report('Web Audio is not available in this browser. The visual instrument still works.');
      return;
    }

    let audio: AudioContext | undefined;
    let graph: AudioGraph | undefined;
    try {
      audio = new AudioContext({ latencyHint: 'interactive' });
      const master = audio.createGain();
      const filter = audio.createBiquadFilter();
      master.gain.value = volume / 100 * 0.42;
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      filter.Q.value = 0.45;
      master.connect(filter);
      filter.connect(audio.destination);
      graph = { context: audio, master, filter, voices: new Set(), closeTimer: undefined, closed: false };
      activeAudio = graph;
      audioGraphs.add(graph);
      lastTone = -1;
      await audio.resume();
      if (disposed || request !== soundRequest || activeAudio !== graph) return;
      context.report('Sound is on. Tap the surface or send a ripple to play a soft pentatonic tone.');
    } catch (error) {
      if (graph) closeAudio(graph);
      else if (audio && audio.state !== 'closed') void audio.close().catch(audioReleaseError);
      if (disposed || request !== soundRequest) return;
      activeAudio = undefined;
      soundEnabled = false;
      soundButton.setAttribute('aria-pressed', 'false');
      hint.textContent = 'TOUCH THE SURFACE / SOUND IS OFF';
      context.report(`Sound could not start. ${error instanceof Error ? error.message : 'Check your browser audio settings.'} The visual instrument is still available.`);
    }
  }

  function playTone(x: number, y: number): string | undefined {
    const graph = activeAudio;
    if (!soundEnabled || !graph || graph.closed) return;
    const audio = graph.context;
    if (audio.state !== 'running') {
      context.report('Audio is suspended. Switch Sound off and on to reconnect it.');
      return;
    }
    const now = audio.currentTime;
    // Bound input rate and gently retire old notes rather than building a loud chord.
    if (now - lastTone < 0.075) return;
    if (graph.voices.size >= 8) {
      const oldest = graph.voices.values().next().value;
      if (oldest) {
        for (const envelope of oldest.envelopes) {
          holdGainAtTime(envelope.gain, now);
          envelope.gain.linearRampToValueAtTime(0, now + 0.02);
        }
        for (const oscillator of oldest.oscillators) oscillator.stop(now + 0.035);
      }
    }
    lastTone = now;
    const note = clamp(Math.floor((1 - y) * NOTES.length), 0, NOTES.length - 1);
    const frequency = NOTES[note];
    const pan = audio.createStereoPanner();
    pan.pan.value = (x - 0.5) * 1.3;
    pan.connect(graph.master);
    const voice: Voice = { oscillators: [], envelopes: [], pan };
    const duration = Math.min(3.8, 1.2 + decay * 0.22);
    const partials = [
      { ratio: 1, gain: 0.16, length: duration },
      { ratio: 2.001, gain: 0.045, length: duration * 0.55 },
      { ratio: 3.002, gain: 0.012, length: duration * 0.32 },
    ];
    for (const partial of partials) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * partial.ratio;
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(partial.gain, now + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + partial.length);
      envelope.gain.linearRampToValueAtTime(0, now + partial.length + 0.04);
      oscillator.connect(envelope);
      envelope.connect(pan);
      oscillator.start(now);
      oscillator.stop(now + partial.length + 0.06);
      voice.oscillators.push(oscillator);
      voice.envelopes.push(envelope);
    }
    graph.voices.add(voice);
    voice.oscillators[0].onended = () => disconnectVoice(graph, voice);
    return NOTE_NAMES[note];
  }

  function addRipple(x: number, y: number, personal: boolean) {
    if (ripples.length >= 22) {
      const oldestAutomatic = ripples.findIndex((ripple) => !ripple.personal);
      ripples.splice(oldestAutomatic === -1 ? 0 : oldestAutomatic, 1);
    }
    ripples.push({
      x, y, personal, age: paused && personal ? 0.25 : 0,
      travel: paused && personal ? 0.072 : 0, phase: seed() * TAU,
    });
    invalidate();
  }

  function sendRipple(x: number, y: number) {
    addRipple(x, y, true);
    const note = playTone(x, y);
    if (note) context.report(`${note}. A small sound, a widening circle.`);
    else if (!soundEnabled) context.report('A new ripple. Enable Sound if you would like to hear it.');
  }

  function seedComposition() {
    clock = 0;
    untilAutomatic = 2.7;
    gestureIndex = 0;
    seed = random(61026);
    ripples = [
      { x: 0.39, y: 0.51, age: 2.1, travel: 0.34, personal: false, phase: 0.2 },
      { x: 0.65, y: 0.45, age: 1.4, travel: 0.23, personal: false, phase: 2.4 },
      { x: 0.28, y: 0.67, age: 0.6, travel: 0.105, personal: false, phase: 4.1 },
    ];
  }

  function ringPath(
    cx: number, cy: number, radius: number, phase: number, amplitude: number,
    disturbances: Disturbance[],
  ) {
    const stride = size.width < 640 ? 2 : 1;
    const unit = Math.min(size.width, size.height);
    const phaseA = Math.sin(phase + radius * 0.018) * amplitude;
    const phaseB = Math.cos(phase + radius * 0.018) * amplitude;
    for (let index = 0; index <= SEGMENTS; index += stride) {
      let r = radius + sineThree[index] * phaseA + cosineThree[index] * phaseB + sineFive[index] * amplitude * 0.28;
      const px = cx + cosine[index] * radius;
      const py = cy + sine[index] * radius;
      for (const disturbance of disturbances) {
        const distance = Math.hypot(px - disturbance.x, py - disturbance.y);
        const offset = (distance - disturbance.radius) / unit;
        const envelope = Math.max(0, 1 - Math.abs(offset) / 0.13);
        r += Math.sin(offset * 95) * envelope * disturbance.amplitude;
      }
      const pxFinal = cx + cosine[index] * r;
      const pyFinal = cy + sine[index] * r;
      if (index === 0) pen.moveTo(pxFinal, pyFinal);
      else pen.lineTo(pxFinal, pyFinal);
    }
    pen.closePath();
  }

  function drawRecord(cx: number, cy: number, radius: number, rings: number, opacity: number, disturbances: Disturbance[]) {
    pen.strokeStyle = INK;
    for (let group = 0; group < 4; group++) {
      pen.beginPath();
      pen.lineWidth = group === 0 ? 1.1 : 0.8;
      pen.globalAlpha = opacity * (group === 0 ? 1 : 0.55);
      for (let index = group + 1; index <= rings; index += 4) {
        const progress = index / rings;
        const r = radius * (0.045 + progress * 0.955);
        ringPath(cx, cy, r, clock * 0.17, (0.4 + progress * 1.7) * size.height / 600, disturbances);
      }
      pen.stroke();
    }
    pen.globalAlpha = opacity;
    pen.beginPath();
    pen.arc(cx, cy, 2.3, 0, TAU);
    pen.fillStyle = INK;
    pen.fill();
    pen.beginPath();
    pen.moveTo(cx - 9, cy);
    pen.lineTo(cx - 5, cy);
    pen.moveTo(cx + 5, cy);
    pen.lineTo(cx + 9, cy);
    pen.moveTo(cx, cy - 9);
    pen.lineTo(cx, cy - 5);
    pen.moveTo(cx, cy + 5);
    pen.lineTo(cx, cy + 9);
    pen.lineWidth = 0.7;
    pen.stroke();
  }

  function draw() {
    const unit = Math.min(size.width, size.height);
    const mobile = size.width < 640;
    pen.globalAlpha = 1;
    pen.globalCompositeOperation = 'source-over';
    pen.fillStyle = BACKGROUND;
    pen.fillRect(0, 0, size.width, size.height);
    const disturbances: Disturbance[] = [];
    for (let index = ripples.length - 1; index >= 0 && disturbances.length < 3; index--) {
      const ripple = ripples[index];
      if (ripple.personal && ripple.age < decay) {
        disturbances.push({
          x: ripple.x * size.width, y: ripple.y * size.height,
          radius: 12 + ripple.travel * unit,
          amplitude: 5.5 * (1 - ripple.age / decay),
        });
      }
    }
    const centerX = size.width * (mobile ? 0.44 : 0.405);
    const centerY = size.height * 0.505;
    const outerRadius = unit * 0.475;
    drawRecord(centerX, centerY, outerRadius, mobile ? 48 : 66, 0.75, disturbances);
    drawRecord(size.width * 0.665, size.height * 0.45, unit * 0.31, mobile ? 30 : 43, 0.6, disturbances);

    pen.globalAlpha = 0.24;
    pen.strokeStyle = INK;
    pen.lineWidth = 0.7;
    pen.beginPath();
    for (let index = 0; index < 48; index++) {
      const angle = index / 48 * TAU;
      const radius = outerRadius + 9;
      const length = index % 4 === 0 ? 5 : 2;
      pen.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      pen.lineTo(centerX + Math.cos(angle) * (radius + length), centerY + Math.sin(angle) * (radius + length));
    }
    pen.stroke();

    pen.globalCompositeOperation = 'lighter';
    const empty: Disturbance[] = [];
    for (const ripple of ripples) {
      const remaining = Math.max(0, 1 - ripple.age / decay);
      if (remaining === 0) continue;
      const opacity = remaining * remaining * (ripple.personal ? 0.93 : 0.44);
      const cx = ripple.x * size.width;
      const cy = ripple.y * size.height;
      const front = 12 + ripple.travel * unit;
      const spacing = unit * 0.014;
      const rings = ripple.personal ? 8 : 6;
      pen.strokeStyle = ripple.personal ? '#e4ebbb' : INK;
      for (let index = 0; index < rings; index++) {
        const radius = front - index * spacing;
        if (radius < 3) continue;
        pen.beginPath();
        pen.globalAlpha = opacity * (1 - index / (rings + 1));
        pen.lineWidth = index === 0 && ripple.personal ? 1.35 : 0.8;
        ringPath(cx, cy, radius, ripple.phase + clock * 0.13, Math.min(1.3, radius * 0.007), empty);
        pen.stroke();
      }
      if (ripple.personal && ripple.age < 2.2) {
        pen.fillStyle = '#e4ebbb';
        pen.globalAlpha = Math.max(0, 1 - ripple.age / 2.2) * 0.9;
        pen.beginPath();
        pen.arc(cx, cy, 2.6, 0, TAU);
        pen.fill();
        pen.globalAlpha *= 0.26;
        pen.beginPath();
        pen.arc(cx, cy, 7, 0, TAU);
        pen.fill();
      }
    }
    pen.globalAlpha = 1;
    pen.globalCompositeOperation = 'source-over';
  }

  function movePointer(event: PointerEvent) {
    if (pointerId !== -1 && event.pointerId !== pointerId) return;
    const point = pointerPosition(event, canvas);
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${point.x - 12}px, ${point.y - 12}px)`;
  }

  function releasePointer() {
    const id = pointerId;
    pointerId = -1;
    if (id !== -1 && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    cursor.style.display = 'none';
    invalidate();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointerId !== -1) return;
    event.preventDefault();
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    movePointer(event);
    const point = pointerPosition(event, canvas);
    sendRipple(clamp(point.x / size.width, 0, 1), clamp(point.y / size.height, 0, 1));
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', movePointer, { signal: events.signal });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId === pointerId) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === pointerId) releasePointer();
  }, { signal: events.signal });
  canvas.addEventListener('pointerleave', () => {
    if (pointerId === -1) releasePointer();
  }, { signal: events.signal });
  window.addEventListener('blur', releasePointer, { signal: events.signal });
  canvas.addEventListener('canvasresize', () => {
    releasePointer();
    invalidate();
  }, { signal: events.signal });

  seedComposition();
  draw();
  loop = createLoop((_elapsed, delta) => {
    clock += delta;
    if (delta > 0) {
      untilAutomatic -= delta * tempo;
      if (untilAutomatic <= 0) {
        untilAutomatic += 2.7;
        addRipple(0.23 + seed() * 0.55, 0.25 + seed() * 0.5, false);
      }
      const farthest = Math.hypot(size.width, size.height) / Math.min(size.width, size.height) + 0.15;
      for (const ripple of ripples) {
        ripple.age += delta;
        ripple.travel += delta * tempo * 0.15;
      }
      ripples = ripples.filter((ripple) => ripple.age < decay && ripple.travel < farthest);
    }
    draw();
  }, { paused });

  function destroy() {
    if (disposed) return;
    disposed = true;
    soundEnabled = false;
    soundRequest++;
    events.abort();
    loop?.destroy();
    activeAudio = undefined;
    for (const graph of audioGraphs) retireAudio(graph, true);
    surface.dispose();
    controls.remove();
    hint.remove();
    cursor.remove();
  }

  context.signal.addEventListener('abort', destroy, { once: true, signal: events.signal });
  return {
    destroy,
    setPaused(value) {
      paused = value;
      loop?.setPaused(value);
    },
    reset() {
      releasePointer();
      void setSound(false);
      decayControl.value = String(DEFAULT_DECAY);
      tempoControl.value = String(DEFAULT_TEMPO);
      volumeControl.value = String(DEFAULT_VOLUME);
      decayControl.dispatchEvent(new Event('input'));
      tempoControl.dispatchEvent(new Event('input'));
      volumeControl.dispatchEvent(new Event('input'));
      seedComposition();
      invalidate();
    },
  };
}
