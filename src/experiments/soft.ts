import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { controlRange, controlSelect } from '../core/controls';
import { clamp, lerp } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { orbitView, plateLabel, plinth, setControlValue, spatialExperiment, studio } from './spatial-common';

const palettes = [
  {
    value: 'coral', label: 'Coral & cream',
    colors: ['#e9583e', '#ed8061', '#f5d9c4', '#cc382e', '#ec7257', '#eabbaa', '#d74c3d'],
    metalness: 0.12, roughness: 0.2,
  },
  {
    value: 'pearl', label: 'Cultured pearl',
    colors: ['#ead9cd', '#f4e6d3', '#c5bcc4', '#ecdad4', '#e9bfaa', '#eadfd6', '#c4c7c8'],
    metalness: 0.28, roughness: 0.23,
  },
  {
    value: 'lacquer', label: 'Cherry lacquer',
    colors: ['#9f1831', '#d8343b', '#e76c5a', '#70152b', '#bf2739', '#f0997a', '#981b30'],
    metalness: 0.2, roughness: 0.16,
  },
];

export function mount(context: ExperimentContext): ExperimentInstance {
  return spatialExperiment(context, {
    label: 'A glossy coral and cream liquid sculpture with forms that melt together and pull apart. Move to influence it, drag or use arrow keys to orbit, and scroll to zoom.',
    background: '#f2b4b9',
    camera: [6.1, 5.2, 10.8],
    target: [0, 2.75, 0],
    fov: 34,
    pixelRatio: 1.75,
    exposure: 1.06,
  }, (stage) => {
    studio(stage, { ground: '#f2b4b9', shadow: '#983e58', radius: 3.1 });
    const orbit = orbitView(stage, { minDistance: 7, maxDistance: 21 });
    const caption = plateLabel(stage, '03 / VISCOSITY STUDY / CORAL & CREAM');
    plinth(stage, 2.03, '#dfa2a6');

    const material = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.2,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.2,
      sheen: 0.2,
      sheenColor: new THREE.Color('#f6ddd1'),
      sheenRoughness: 0.5,
    });
    const compact = stage.size.width < 640;
    const sculpture = new MarchingCubes(compact ? 36 : 48, material, false, true, compact ? 8000 : 16000);
    sculpture.isolation = 78;
    sculpture.position.y = 2.85;
    sculpture.scale.set(4.35, 4.65, 4.35);
    sculpture.castShadow = true;
    sculpture.frustumCulled = false;
    stage.scene.add(sculpture);

    let phase = 0;
    let speed = 0.7;
    let viscosity = 0.6;
    let forms = 5;
    let palette = palettes[0];
    let colors = palette.colors.map((color) => new THREE.Color(color));
    let dirty = true;
    let frameTime = 0;
    const influence = new THREE.Vector2();
    const desiredInfluence = new THREE.Vector2();

    const point = (event: PointerEvent) => {
      const bounds = stage.canvas.getBoundingClientRect();
      desiredInfluence.set(
        clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        clamp(1 - (event.clientY - bounds.top) / bounds.height * 2, -1, 1),
      );
      dirty = true;
      stage.invalidate();
    };
    stage.canvas.addEventListener('pointermove', (event) => {
      if (!event.buttons) point(event);
    }, { passive: true, signal: stage.signal });
    stage.canvas.addEventListener('pointerdown', point, { passive: true, signal: stage.signal });
    stage.canvas.addEventListener('pointerleave', () => {
      desiredInfluence.set(0, 0);
      dirty = true;
      stage.invalidate();
    }, { signal: stage.signal });

    const buildField = () => {
      sculpture.reset();
      const t = phase;
      const pullX = influence.x * 0.085;
      const pullY = influence.y * 0.075;
      const strength = 0.76 + viscosity * 0.42;
      const positions = [
        [0.49 + 0.025 * Math.sin(t), 0.465 + 0.025 * Math.cos(t), 0.5, 1.14],
        [0.57 + 0.085 * Math.cos(t), 0.625 + 0.065 * Math.sin(t), 0.5 + 0.055 * Math.sin(t + 1), 0.87],
        [0.385 + 0.075 * Math.sin(t + 0.2), 0.65 + 0.05 * Math.cos(t), 0.49 + 0.035 * Math.cos(t), 0.69],
        [0.505 + 0.09 * Math.sin(t + 2), 0.335 + 0.025 * Math.cos(t + 1), 0.51 + 0.055 * Math.cos(t + 2), 0.96],
        [0.285 + 0.07 * Math.cos(t + 1), 0.455 + 0.07 * Math.sin(t + 0.5), 0.515 + 0.035 * Math.sin(t), 0.63],
        [0.66 + 0.055 * Math.sin(t + 1), 0.44 + 0.065 * Math.cos(t), 0.43 + 0.05 * Math.cos(t + 1), 0.52],
        [0.45 + 0.09 * Math.cos(t + 2), 0.76 + 0.03 * Math.sin(t), 0.54 + 0.05 * Math.sin(t + 2), 0.4],
      ];
      for (let index = 0; index < forms; index++) {
        const [x, y, z, weight] = positions[index];
        const attraction = index === 2 ? 1.15 : index === 0 ? 0.15 : 0.45;
        sculpture.addBall(
          x + pullX * attraction,
          y + pullY * attraction,
          z,
          strength * weight,
          12,
          colors[index],
        );
      }
      sculpture.update();
      let bottom = Number.POSITIVE_INFINITY;
      for (let index = 1; index < sculpture.count * 3; index += 3) {
        bottom = Math.min(bottom, sculpture.positionArray[index]);
      }
      sculpture.position.y = Math.max(2.85, 0.22 - bottom * sculpture.scale.y);
      for (const name of ['position', 'normal', 'color']) {
        const attribute = sculpture.geometry.getAttribute(name);
        if (attribute instanceof THREE.BufferAttribute) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, sculpture.count * 3);
        }
      }
      dirty = false;
      frameTime = 0;
    };

    const speedControl = controlRange(stage.controls, {
      label: 'Speed', min: 0, max: 1.8, step: 0.05, value: speed,
      format: (value) => `${value.toFixed(2)}x`,
      onChange: (value) => { speed = value; stage.invalidate(); },
    });
    const viscosityControl = controlRange(stage.controls, {
      label: 'Viscosity', min: 0, max: 1, step: 0.01, value: viscosity,
      format: (value) => `${Math.round(value * 100)}%`,
      onChange: (value) => { viscosity = value; dirty = true; stage.invalidate(); },
    });
    const formsControl = controlRange(stage.controls, {
      label: 'Forms', min: 3, max: 7, step: 1, value: forms,
      onChange: (value) => { forms = value; dirty = true; stage.invalidate(); },
    });
    const paletteControl = controlSelect(stage.controls, {
      label: 'Finish', value: palette.value, choices: palettes,
      onChange: (value) => {
        const next = palettes.find((choice) => choice.value === value);
        if (!next) throw new Error(`Unknown liquid finish: ${value}`);
        palette = next;
        colors = palette.colors.map((color) => new THREE.Color(color));
        material.metalness = palette.metalness;
        material.roughness = palette.roughness;
        caption.textContent = `03 / VISCOSITY STUDY / ${palette.label.toUpperCase()}`;
        dirty = true;
        stage.invalidate();
        context.report(`${palette.label} selected. Move across the stage to pull the liquid.`);
      },
    });

    return {
      update(_elapsed, delta) {
        phase += delta * speed * 0.48 / (0.6 + viscosity * 0.9);
        frameTime += delta;
        const ease = stage.paused ? 1 : 1 - Math.exp(-delta * (7 - viscosity * 4));
        influence.x = lerp(influence.x, desiredInfluence.x, ease);
        influence.y = lerp(influence.y, desiredInfluence.y, ease);
        const moving = speed > 0 || influence.distanceToSquared(desiredInfluence) > 0.000001;
        if (dirty || (moving && frameTime >= 1 / (compact ? 24 : 30))) buildField();
      },
      reset() {
        phase = 0;
        influence.set(0, 0);
        desiredInfluence.set(0, 0);
        setControlValue(speedControl, 0.7);
        setControlValue(viscosityControl, 0.6);
        setControlValue(formsControl, 5);
        setControlValue(paletteControl, 'coral');
        orbit.reset();
        dirty = true;
        stage.invalidate();
        context.report('Soft Signal returned to its original liquid composition.');
      },
    };
  });
}
