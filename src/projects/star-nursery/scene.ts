import * as THREE from 'three';
import { orbitView } from '../../core/spatial';
import type { SpatialStage } from '../../core/spatial';
import { clamp } from '../../core/math';
import { advancePhase, createNursery, LIGHT_BUDGET, MAX_BUDGET } from './engine';
import type { NurseryGeometry, ParticleLayer } from './engine';
import type { PresetId } from './data';
import { dustFragment, particleVertex, seedFragment, volumeFragment } from './shaders';

export interface SceneSettings {
  preset: PresetId;
  seed: number;
  formation: number;
  wind: number;
}

function bufferGeometry(particles: ParticleLayer): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(particles.position, 3));
  geometry.setAttribute('aAnchor', new THREE.BufferAttribute(particles.anchor, 3));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(particles.color, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(particles.size, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(particles.phase, 1));
  return geometry;
}

export function createNurseryScene(stage: SpatialStage, initial: SceneSettings) {
  const budget = stage.size.width < 620 ? LIGHT_BUDGET : MAX_BUDGET;
  const orbit = orbitView(stage, {
    minDistance: 7.5,
    maxDistance: 19,
    maxPolarAngle: Math.PI - 0.18,
  });
  const uniforms = {
    uTime: { value: 0 },
    uFormation: { value: initial.formation },
    uWind: { value: initial.wind },
    uDpr: { value: stage.renderer.getPixelRatio() },
    uHeight: { value: stage.size.height },
    uFocal: { value: stage.camera.projectionMatrix.elements[5]! },
  };
  const cloud = new THREE.Group();
  cloud.rotation.set(-0.08, 0.09, -0.055);
  stage.scene.add(cloud);
  let phase = 0;

  const material = (fragmentShader: string, opacity: number, influence = 1, shade = false) =>
    stage.own(new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader,
      uniforms: {
        ...uniforms,
        uOpacity: { value: opacity },
        uInfluence: { value: influence },
        uShade: { value: shade ? 1 : 0 },
      },
      transparent: true,
      blending: shade ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }));

  const source = createNursery(initial.preset, initial.seed, budget);
  const layers = {} as Record<keyof NurseryGeometry, THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>>;
  const definitions = [
    ['field', material(dustFragment, 0.78, 0), 0],
    ['volume', material(volumeFragment, 0.18 * Math.sqrt(MAX_BUDGET.volume / budget.volume)), 1],
    ['shadow', material(volumeFragment, 0.42, 1, true), 2],
    ['dust', material(dustFragment, 0.56), 3],
    ['seeds', material(seedFragment, 1), 4],
  ] as const;
  for (const [key, shader, order] of definitions) {
    const points = new THREE.Points(bufferGeometry(source[key]), shader);
    points.frustumCulled = false;
    points.renderOrder = order;
    (key === 'field' ? stage.scene : cloud).add(points);
    layers[key] = points;
  }
  stage.canvas.setAttribute('aria-describedby', 'sn-view-help');

  return {
    update(_elapsed: number, delta: number) {
      phase = advancePhase(phase, delta, stage.paused);
      uniforms.uTime.value = phase;
      uniforms.uDpr.value = stage.renderer.getPixelRatio();
      uniforms.uHeight.value = stage.size.height;
      uniforms.uFocal.value = stage.camera.projectionMatrix.elements[5]!;
    },
    setControls(formation: number, wind: number) {
      uniforms.uFormation.value = clamp(Number.isFinite(formation) ? formation : 0, 0, 1);
      uniforms.uWind.value = clamp(Number.isFinite(wind) ? wind : 0, 0, 1);
      stage.invalidate();
    },
    setArrangement(preset: PresetId, seed: number) {
      const next = createNursery(preset, seed, budget);
      for (const key of Object.keys(layers) as (keyof NurseryGeometry)[]) {
        const previous = layers[key].geometry;
        layers[key].geometry = bufferGeometry(next[key]);
        previous.dispose();
      }
      phase = 0;
      stage.invalidate();
    },
    resetView() {
      orbit.reset();
      stage.invalidate();
    },
    resetTime() {
      phase = 0;
      stage.invalidate();
    },
  };
}

export type NurseryScene = ReturnType<typeof createNurseryScene>;
