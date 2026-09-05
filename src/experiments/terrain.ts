import * as THREE from 'three';
import { controlButton, controlRange, controlSelect } from '../core/controls';
import { clamp, lerp, random } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { plateLabel, setControlValue, spatialExperiment } from './spatial-common';

const landscapeVertex = /* glsl */ `
  uniform float uTravel;
  uniform float uRelief;
  uniform float uSeed;
  uniform float uWire;
  uniform vec4 uRiver;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }
  float heightAt(vec2 p) {
    vec2 q = p + vec2(uSeed * 11.7, uSeed * 7.3);
    float river = uRiver.x * sin(q.y * uRiver.y) + uRiver.z * sin(q.y * uRiver.w + 0.6);
    float channelDistance = (p.x - river) * 0.155;
    float valley = 1.0 - exp(-channelDistance * channelDistance);
    float left = p.x + 19.0 + 5.0 * sin(q.y * 0.032);
    float right = p.x - 18.0 + 4.0 * cos(q.y * 0.046);
    float ridgeA = exp(-left * left * 0.0038)
      * (7.0 + 6.0 * pow(0.5 + 0.5 * sin(q.y * 0.033 + 0.7), 2.0));
    float ridgeB = exp(-right * right * 0.0045)
      * (5.0 + 6.0 * pow(0.5 + 0.5 * cos(q.y * 0.043), 2.0));
    float detail = noise(q * 0.068) * 1.9
      + noise(q * 0.15) * 0.72 + noise(q * 0.32) * 0.2;
    float folds = 0.55 * sin(q.x * 0.28 + q.y * 0.13 + noise(q * 0.05) * 4.0);
    return (0.18 + (ridgeA + ridgeB + detail + folds) * valley) * uRelief;
  }
  void main() {
    vec2 samplePosition = vec2(position.x, position.z - uTravel);
    float height = heightAt(samplePosition);
    float epsilon = 0.22;
    float left = heightAt(samplePosition - vec2(epsilon, 0.0));
    float right = heightAt(samplePosition + vec2(epsilon, 0.0));
    float back = heightAt(samplePosition - vec2(0.0, epsilon));
    float front = heightAt(samplePosition + vec2(0.0, epsilon));
    vNormal = normalize(vec3(left - right, 2.0 * epsilon, back - front));
    vHeight = height;
    vWorld = vec3(position.x, height + uWire * 0.018, position.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const landscapeFragment = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uMiddle;
  uniform vec3 uHigh;
  uniform vec3 uInk;
  uniform vec3 uHaze;
  uniform float uRelief;
  uniform float uMode;
  uniform float uWire;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    float distanceToEye = length(cameraPosition - vWorld);
    float haze = smoothstep(48.0, 151.0, distanceToEye);
    if (uWire > 0.5) {
      gl_FragColor = vec4(mix(uInk, uHaze, haze), 0.42 * (1.0 - haze));
    } else {
      float elevation = clamp(vHeight / (uRelief * 13.0), 0.0, 1.0);
      vec3 color = mix(uLow, uMiddle, smoothstep(0.04, 0.52, elevation));
      color = mix(color, uHigh, smoothstep(0.48, 1.0, elevation));
      vec3 normal = normalize(vNormal);
      float sunlight = max(dot(normal, normalize(vec3(-0.65, 0.85, 0.35))), 0.0);
      color *= 0.7 + 0.42 * sunlight;
      float contourCoordinate = vHeight * 1.35;
      float contourWidth = max(fwidth(contourCoordinate), 0.0001);
      float contour = 1.0 - smoothstep(0.25, 1.15,
        abs(fract(contourCoordinate + 0.5) - 0.5) / contourWidth);
      float majorCoordinate = vHeight * 0.27;
      float major = 1.0 - smoothstep(0.45, 1.4,
        abs(fract(majorCoordinate + 0.5) - 0.5) / max(fwidth(majorCoordinate), 0.0001));
      float lineVisibility = (1.0 - smoothstep(55.0, 125.0, distanceToEye));
      if (uMode < 0.5) {
        color = mix(color, uInk, (contour * 0.2 + major * 0.16) * lineVisibility);
      }
      float salt = 1.0 - smoothstep(0.22, 0.65, vHeight / uRelief);
      color = mix(color, uLow * 1.07, salt * 0.7);
      color = mix(color, uHaze, haze);
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      color += (grain - 0.5) * 0.007;
      gl_FragColor = vec4(color, 1.0);
    }
    #include <colorspace_fragment>
  }
`;

const biomes = [
  {
    value: 'lilac', label: 'Lilac badlands',
    low: '#e5d3b9', middle: '#aa9cb8', high: '#6b617f',
    ink: '#625568', sky: '#c9c5de', haze: '#d8cbd2', sun: '#f0c7a7',
  },
  {
    value: 'ochre', label: 'Ochre basin',
    low: '#ebd6ad', middle: '#c48d6e', high: '#805961',
    ink: '#775453', sky: '#dcc8be', haze: '#e4c8b4', sun: '#f5dfa8',
  },
  {
    value: 'sage', label: 'Sage highlands',
    low: '#e3dac3', middle: '#9da995', high: '#5c756c',
    ink: '#4c655d', sky: '#cad5cc', haze: '#d9d9c8', sun: '#e9ca9d',
  },
];

export function mount(context: ExperimentContext): ExperimentInstance {
  return spatialExperiment(context, {
    label: 'A traveling lilac and sand landscape, with sculpted ridges, fine elevation contours, a winding salt valley, and a pale horizon sun. Move or use arrow keys to steer the view.',
    background: '#c9c5de',
    camera: [0, 8.5, 23],
    target: [0, 4, -35],
    fov: 49,
    fitPortrait: false,
    shadows: false,
    pixelRatio: 1.75,
  }, (stage) => {
    stage.canvas.style.cursor = 'crosshair';
    stage.canvas.style.touchAction = 'pan-y';
    stage.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
    const caption = plateLabel(stage, '04 / CONTOUR SURVEY / LILAC BADLANDS');
    let biome = biomes[0];
    let speed = 0.65;
    let relief = 1;
    let travel = 0;
    let seed = 2.4;
    const seeded = random(4017);
    const desiredSteer = new THREE.Vector2();
    const steer = new THREE.Vector2();
    const look = new THREE.Vector3();

    const uniforms = {
      uTravel: { value: travel },
      uRelief: { value: relief },
      uSeed: { value: seed },
      uWire: { value: 0 },
      uMode: { value: 0 },
      uRiver: { value: new THREE.Vector4(5, 0.039, 2.3, 0.081) },
      uLow: { value: new THREE.Color(biome.low) },
      uMiddle: { value: new THREE.Color(biome.middle) },
      uHigh: { value: new THREE.Color(biome.high) },
      uInk: { value: new THREE.Color(biome.ink) },
      uHaze: { value: new THREE.Color(biome.haze) },
    };
    const compact = stage.size.width < 640;
    const geometry = new THREE.PlaneGeometry(116, 210, compact ? 112 : 180, compact ? 170 : 256);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -64);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: landscapeVertex,
      fragmentShader: landscapeFragment,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const landscape = new THREE.Mesh(geometry, material);
    landscape.frustumCulled = false;
    stage.scene.add(landscape);
    const wire = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uWire: { value: 1 } },
      vertexShader: landscapeVertex,
      fragmentShader: landscapeFragment,
      wireframe: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    wire.frustumCulled = false;
    wire.visible = false;
    wire.renderOrder = 2;
    stage.scene.add(wire);

    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const skyPainter = skyCanvas.getContext('2d');
    if (!skyPainter) throw new Error('The browser could not prepare the landscape sky.');
    const skyTexture = stage.own(new THREE.CanvasTexture(skyCanvas));
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    stage.scene.background = skyTexture;
    const sunMaterial = new THREE.MeshBasicMaterial({ color: biome.sun, toneMapped: false });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(11, 96), sunMaterial);
    sun.position.set(-28, 26, -128);
    stage.scene.add(sun);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(12.3, 12.34, 128),
      new THREE.MeshBasicMaterial({
        color: biome.sun, toneMapped: false, transparent: true, opacity: 0.52, depthWrite: false,
      }),
    );
    halo.position.copy(sun.position);
    stage.scene.add(halo);

    const applyBiome = () => {
      uniforms.uLow.value.set(biome.low);
      uniforms.uMiddle.value.set(biome.middle);
      uniforms.uHigh.value.set(biome.high);
      uniforms.uInk.value.set(biome.ink);
      uniforms.uHaze.value.set(biome.haze);
      sunMaterial.color.set(biome.sun);
      halo.material.color.set(biome.sun);
      const gradient = skyPainter.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, biome.sky);
      gradient.addColorStop(0.66, biome.haze);
      gradient.addColorStop(1, biome.haze);
      skyPainter.fillStyle = gradient;
      skyPainter.fillRect(0, 0, 4, 256);
      skyTexture.needsUpdate = true;
      caption.textContent = `04 / CONTOUR SURVEY / ${biome.label.toUpperCase()}`;
      stage.invalidate();
    };
    applyBiome();

    const riverCenter = (depth: number) => {
      const y = depth - travel + seed * 7.3;
      const curve = uniforms.uRiver.value;
      return curve.x * Math.sin(y * curve.y) + curve.z * Math.sin(y * curve.w + 0.6);
    };

    const point = (event: PointerEvent) => {
      const bounds = stage.canvas.getBoundingClientRect();
      desiredSteer.set(
        clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        clamp(1 - (event.clientY - bounds.top) / bounds.height * 2, -1, 1),
      );
      stage.invalidate();
    };
    stage.canvas.addEventListener('pointermove', point, { signal: stage.signal, passive: true });
    stage.canvas.addEventListener('pointerdown', point, { signal: stage.signal, passive: true });
    stage.canvas.addEventListener('pointerleave', () => {
      desiredSteer.set(0, 0);
      stage.invalidate();
    }, { signal: stage.signal });
    stage.canvas.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') desiredSteer.x -= 0.2;
      if (event.key === 'ArrowRight') desiredSteer.x += 0.2;
      if (event.key === 'ArrowUp') desiredSteer.y += 0.2;
      if (event.key === 'ArrowDown') desiredSteer.y -= 0.2;
      if (event.key === 'Home') desiredSteer.set(0, 0);
      desiredSteer.clampScalar(-1, 1);
      stage.invalidate();
    }, { signal: stage.signal });

    const reliefControl = controlRange(stage.controls, {
      label: 'Relief', min: 0.35, max: 1.8, step: 0.01, value: relief,
      format: (value) => `${Math.round(value * 100)}%`,
      onChange: (value) => { relief = value; uniforms.uRelief.value = value; stage.invalidate(); },
    });
    const speedControl = controlRange(stage.controls, {
      label: 'Travel', min: 0, max: 2, step: 0.05, value: speed,
      format: (value) => `${value.toFixed(2)}x`,
      onChange: (value) => { speed = value; stage.invalidate(); },
    });
    const modeControl = controlSelect(stage.controls, {
      label: 'Drawing', value: 'contours',
      choices: [
        { value: 'contours', label: 'Contour atlas' },
        { value: 'surface', label: 'Soft surface' },
        { value: 'wire', label: 'Wire terrain' },
      ],
      onChange: (value) => {
        if (!['contours', 'surface', 'wire'].includes(value)) throw new Error(`Unknown terrain drawing: ${value}`);
        uniforms.uMode.value = value === 'contours' ? 0 : value === 'surface' ? 1 : 2;
        wire.visible = value === 'wire';
        stage.invalidate();
        context.report(value === 'wire' ? 'The landscape mesh is now visible.' :
          value === 'surface' ? 'A quiet, unlined surface.' : 'Elevation contours are now visible.');
      },
    });
    const biomeControl = controlSelect(stage.controls, {
      label: 'Biome', value: biome.value, choices: biomes,
      onChange: (value) => {
        const next = biomes.find((choice) => choice.value === value);
        if (!next) throw new Error(`Unknown landscape biome: ${value}`);
        biome = next;
        applyBiome();
        context.report(`${biome.label} selected.`);
      },
    });
    controlButton(stage.controls, {
      label: 'New landscape',
      title: 'Generate a new arrangement of ridges and valleys',
      onClick: () => {
        seed = 1 + seeded() * 90;
        uniforms.uSeed.value = seed;
        stage.invalidate();
        context.report('A new landscape of ridges and valleys is ready to explore.');
      },
    });

    return {
      update(_elapsed, delta) {
        travel += delta * speed * 3.2;
        uniforms.uTravel.value = travel;
        const ease = stage.paused ? 1 : 1 - Math.exp(-delta * 3.5);
        steer.x = lerp(steer.x, desiredSteer.x, ease);
        steer.y = lerp(steer.y, desiredSteer.y, ease);
        // Follow the salt channel so the camera cannot travel inside a ridge.
        stage.camera.position.set(
          riverCenter(23) + steer.x * 2.4,
          8.5 + steer.y * 2 + Math.max(0, relief - 1) * 5,
          23,
        );
        look.set(riverCenter(-35) * 0.65 + steer.x * 10, 4 + steer.y * 3, -35);
        stage.camera.lookAt(look);
      },
      reset() {
        travel = 0;
        seed = 2.4;
        uniforms.uSeed.value = seed;
        desiredSteer.set(0, 0);
        steer.set(0, 0);
        setControlValue(reliefControl, 1);
        setControlValue(speedControl, 0.65);
        setControlValue(modeControl, 'contours');
        setControlValue(biomeControl, 'lilac');
        stage.invalidate();
        context.report('Terrarium returned to its original lilac landscape.');
      },
    };
  });
}
