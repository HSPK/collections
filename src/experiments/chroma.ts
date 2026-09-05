import {
  Camera, Color, Mesh, NoToneMapping, PlaneGeometry, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, Vector4, WebGLRenderer,
} from 'three';
import { observeSize, pointerPosition } from '../core/canvas';
import { controlButton, controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';

const PALETTES = [
  {
    id: 'paprika', name: 'Paprika',
    colors: ['#e96b37', '#50271f', '#f7d5aa', '#f39a5b', '#bb402c'],
    description: 'burnt orange, vermilion and unbleached cream',
  },
  {
    id: 'cobalt', name: 'Cobalt',
    colors: ['#254dc5', '#10244f', '#e3e9dc', '#608fcc', '#143d91'],
    description: 'cobalt blue, indigo and porcelain',
  },
  {
    id: 'moss', name: 'Moss',
    colors: ['#7c8e53', '#213e32', '#e4dfb5', '#b4bc73', '#405c42'],
    description: 'olive, forest green and pale lichen',
  },
  {
    id: 'aubergine', name: 'Aubergine',
    colors: ['#83556f', '#332a42', '#efd4bf', '#c28a8c', '#5a3e59'],
    description: 'aubergine, dusty rose and warm ivory',
  },
];
const DEFAULT_SCALE = 1.25;
const DEFAULT_ENERGY = 0.7;
const BRUSH_COUNT = 8;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uScale;
  uniform float uEnergy;
  uniform vec2 uOffset;
  uniform vec4 uBrushes[8];
  uniform vec3 uBase;
  uniform vec3 uShadow;
  uniform vec3 uPaper;
  uniform vec3 uWarm;
  uniform vec3 uAccent;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise21(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * noise21(p);
      p = turn * p * 2.03 + vec2(13.4, 7.2);
      amplitude *= 0.5;
    }
    return value / 0.9375;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * aspect * uScale * 2.7 + uOffset;
    float t = uTime * 0.075;

    // Each gesture leaves a small, slowly relaxing displacement in the pigment.
    for (int i = 0; i < 8; i++) {
      if (dot(uBrushes[i].zw, uBrushes[i].zw) > 0.0000001) {
        vec2 distance = (vUv - uBrushes[i].xy) * aspect;
        float influence = exp(-dot(distance, distance) * 9.0);
        p -= uBrushes[i].zw * aspect * uScale * 3.6 * influence;
      }
    }

    vec2 eddy = p - vec2(0.45, 0.15);
    float twist = 1.8 * exp(-dot(eddy, eddy) * 0.42);
    p = mat2(cos(twist), sin(twist), -sin(twist), cos(twist)) * eddy + vec2(0.45, 0.15);
    vec2 q = vec2(
      fbm(p * 0.72 + vec2(t * 0.13, -t * 0.07)),
      fbm(p * 0.72 + vec2(5.2, 1.3) + vec2(-t * 0.08, t * 0.09))
    );
    vec2 warped = p + (q - 0.5) * (3.8 + uEnergy * 1.2);
    warped += 0.2 * vec2(sin(warped.y * 2.1 + t), cos(warped.x * 1.7 - t * 0.7));
    float ink = fbm(warped * 0.85 + vec2(0.7, -2.3));
    float contour = ink * 3.8 + q.x * 0.48 + p.y * 0.035 + t * 0.045;
    float band = fract(contour);

    vec3 color = mix(uShadow, uBase, smoothstep(0.035, 0.095, band));
    color = mix(color, uWarm, smoothstep(0.4, 0.48, band));
    color = mix(color, uPaper, smoothstep(0.65, 0.685, band));
    color = mix(color, uAccent, smoothstep(0.785, 0.82, band));
    color = mix(color, uShadow, smoothstep(0.95, 0.985, band));

    float aa = clamp(fwidth(contour), 0.0005, 0.025);
    float vein = abs(fract(contour * 9.0 + q.y * 0.2) - 0.5);
    float fineLine = 1.0 - smoothstep(0.014 + aa, 0.035 + aa * 5.0, vein);
    float paleRegion = smoothstep(0.55, 0.7, band) * (1.0 - smoothstep(0.91, 0.98, band));
    color = mix(color, uPaper, fineLine * paleRegion * 0.24);
    float edge = min(abs(band - 0.665), abs(band - 0.802));
    color = mix(color, uShadow, (1.0 - smoothstep(aa, aa * 3.0 + 0.002, edge)) * 0.18);
    float grain = (hash21(gl_FragCoord.xy + 17.0) - 0.5) * 0.022;
    color += grain * (0.35 + color * 0.65);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export function mount(context: ExperimentContext): ExperimentInstance {
  context.signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.className = 'experiment-canvas';
  canvas.setAttribute('role', 'img');
  canvas.style.cursor = 'crosshair';
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    throw new Error('Chroma needs WebGL 2 to mix its pigments. Enable hardware acceleration or open this page in a WebGL-capable browser.', { cause: error });
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.debug.onShaderError = () => {
    throw new Error('Chroma could not compile its pigment shader. Please try a browser with working WebGL 2 support.');
  };

  const events = new AbortController();
  const controls = document.createElement('div');
  controls.className = 'experiment-controls';
  context.controls.append(controls);
  context.container.append(canvas);
  const hint = stageHint(context.container, 'PAPRIKA / DRAG SLOWLY TO PULL THE PIGMENT');
  hint.style.color = '#fff0d8';
  hint.style.textShadow = '0 1px 7px #39231c';
  const cursor = document.createElement('div');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = 'position:absolute;left:0;top:0;width:30px;height:30px;border:1px solid #ffffffaa;border-radius:50%;mix-blend-mode:difference;pointer-events:none;display:none;z-index:1;box-sizing:border-box';
  context.container.append(cursor);

  let disposed = false;
  let paused = context.reducedMotion;
  let contextLost = false;
  let clock = 0;
  let brushIndex = 0;
  let stirring = 0;
  let pointerId = -1;
  let hasPointer = false;
  let loop: ReturnType<typeof createLoop> | undefined;
  const previousPointer = new Vector2();
  const brushes = Array.from({ length: BRUSH_COUNT }, () => new Vector4(-10, -10, 0, 0));
  const uniforms = {
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uScale: { value: DEFAULT_SCALE },
    uEnergy: { value: DEFAULT_ENERGY },
    uOffset: { value: new Vector2(0, 0) },
    uBrushes: { value: brushes },
    uBase: { value: new Color(PALETTES[0].colors[0]) },
    uShadow: { value: new Color(PALETTES[0].colors[1]) },
    uPaper: { value: new Color(PALETTES[0].colors[2]) },
    uWarm: { value: new Color(PALETTES[0].colors[3]) },
    uAccent: { value: new Color(PALETTES[0].colors[4]) },
  };
  const scene = new Scene();
  const camera = new Camera();
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function invalidate() {
    if (!disposed && !contextLost) loop?.requestRender();
  }

  function setPalette(id: string) {
    const palette = PALETTES.find((candidate) => candidate.id === id);
    if (!palette) {
      context.report('That pigment palette is not available.');
      return;
    }
    const colors = [uniforms.uBase, uniforms.uShadow, uniforms.uPaper, uniforms.uWarm, uniforms.uAccent];
    colors.forEach((uniform, index) => uniform.value.set(palette.colors[index]));
    canvas.setAttribute('aria-label', `Marbled liquid pigment in ${palette.description}. Drag to pull the shapes, or use Stir pigment.`);
    hint.textContent = `${palette.name.toUpperCase()} / DRAG SLOWLY TO PULL THE PIGMENT`;
    invalidate();
    return palette;
  }

  const paletteControl = controlSelect(controls, {
    label: 'Pigment', value: 'paprika',
    choices: PALETTES.map((palette) => ({ value: palette.id, label: palette.name })),
    onChange: (value) => {
      const palette = setPalette(value);
      if (palette) context.report(`A fresh color study in ${palette.name}.`);
    },
  });
  const scaleControl = controlRange(controls, {
    label: 'Scale', min: 0.65, max: 2.4, step: 0.05, value: DEFAULT_SCALE,
    format: (value) => `${value.toFixed(2)}x`,
    onChange: (value) => { uniforms.uScale.value = value; invalidate(); },
  });
  const energyControl = controlRange(controls, {
    label: 'Energy', min: 0, max: 1.5, step: 0.05, value: DEFAULT_ENERGY,
    format: (value) => `${Math.round(value * 100)}%`,
    onChange: (value) => { uniforms.uEnergy.value = value; invalidate(); },
  });
  controlButton(controls, {
    label: 'Stir pigment',
    title: 'Pull a new fold through the pigment without dragging',
    onClick: () => {
      stirring++;
      const angle = stirring * 2.39996;
      const x = 0.5 + Math.cos(angle) * 0.19;
      const y = 0.5 + Math.sin(angle) * 0.19;
      brushes[brushIndex].set(x, y, Math.cos(angle + 1) * 0.23, Math.sin(angle + 1) * 0.23);
      brushIndex = (brushIndex + 1) % BRUSH_COUNT;
      uniforms.uOffset.value.add(new Vector2(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16));
      invalidate();
      context.report('A new fold in the pigment. Give it a moment to settle.');
    },
  });

  function movePointer(event: PointerEvent) {
    if (pointerId !== -1 && event.pointerId !== pointerId) return;
    const point = pointerPosition(event, canvas);
    const x = clamp(point.x / uniforms.uResolution.value.x, 0, 1);
    const y = 1 - clamp(point.y / uniforms.uResolution.value.y, 0, 1);
    if (hasPointer) {
      const dx = clamp(x - previousPointer.x, -0.075, 0.075);
      const dy = clamp(y - previousPointer.y, -0.075, 0.075);
      if (dx * dx + dy * dy > 0.0000002) {
        const pull = pointerId === -1 ? 2.8 : 5.5;
        brushes[brushIndex].set(x, y, dx * pull, dy * pull);
        brushIndex = (brushIndex + 1) % BRUSH_COUNT;
      }
    }
    hasPointer = true;
    previousPointer.set(x, y);
    cursor.style.display = 'block';
    const diameter = pointerId === -1 ? 30 : 46;
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.transform = `translate(${point.x - diameter / 2}px, ${point.y - diameter / 2}px)`;
    invalidate();
  }

  function releasePointer() {
    const id = pointerId;
    pointerId = -1;
    hasPointer = false;
    if (id !== -1 && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    cursor.style.display = 'none';
    invalidate();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointerId !== -1) return;
    event.preventDefault();
    pointerId = event.pointerId;
    hasPointer = false;
    canvas.setPointerCapture(event.pointerId);
    movePointer(event);
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
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    loop?.setPaused(true);
    context.report('The pigment surface lost its graphics context. Waiting for the browser to restore it.');
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    loop?.setPaused(paused);
    context.report('The pigment surface is restored.');
  }, { signal: events.signal });

  const stopObserving = observeSize(context.container, (size) => {
    renderer.setPixelRatio(Math.min(size.dpr, size.width < 640 ? 1.5 : 1.75));
    renderer.setSize(size.width, size.height, false);
    uniforms.uResolution.value.set(size.width, size.height);
    releasePointer();
    invalidate();
  });
  setPalette('paprika');

  function destroy() {
    if (disposed) return;
    disposed = true;
    events.abort();
    loop?.destroy();
    stopObserving();
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    controls.remove();
    hint.remove();
    cursor.remove();
  }

  // Compile and paint synchronously so initialization errors reach the page boundary.
  try {
    renderer.render(scene, camera);
  } catch (error) {
    destroy();
    throw error;
  }
  loop = createLoop((_elapsed, delta) => {
    if (contextLost) return;
    clock += delta * uniforms.uEnergy.value;
    uniforms.uTime.value = clock;
    if (delta > 0) {
      const relaxation = Math.exp(-delta * 0.75);
      for (const brush of brushes) {
        brush.z *= relaxation;
        brush.w *= relaxation;
        if (Math.abs(brush.z) + Math.abs(brush.w) < 0.0001) brush.set(-10, -10, 0, 0);
      }
    }
    renderer.render(scene, camera);
  }, { paused });
  context.signal.addEventListener('abort', destroy, { once: true, signal: events.signal });

  return {
    destroy,
    setPaused(value) {
      paused = value;
      loop?.setPaused(value || contextLost);
    },
    reset() {
      releasePointer();
      clock = 0;
      stirring = 0;
      brushIndex = 0;
      uniforms.uTime.value = 0;
      uniforms.uOffset.value.set(0, 0);
      for (const brush of brushes) brush.set(-10, -10, 0, 0);
      paletteControl.value = 'paprika';
      scaleControl.value = String(DEFAULT_SCALE);
      energyControl.value = String(DEFAULT_ENERGY);
      scaleControl.dispatchEvent(new Event('input'));
      energyControl.dispatchEvent(new Event('input'));
      setPalette('paprika');
      invalidate();
    },
  };
}
