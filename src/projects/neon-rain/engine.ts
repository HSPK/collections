import * as THREE from 'three';
import { orbitView, spatialExperiment } from '../../core/spatial';
import type { ExperimentContext, ExperimentInstance } from '../../core/types';
import {
  createRainDrops, INITIAL_PHASE, INITIAL_RAIN, RAIN_BUDGET,
  rainCount, rainHeightAt, rainPhase, VIEWS, type ViewId,
} from './data';
import { buildNightStreet } from './scene';

export interface StreetSnapshot {
  paused: boolean;
  phase: number;
  rainCount: number;
  rainBudget: number;
  firstDropY: number | null;
  lightPower: number;
  lampIntensity: number;
  camera: string;
  view: ViewId;
  frame: number;
  pixelRatio: number;
}

export interface StreetEngine extends ExperimentInstance {
  setRain: (intensity: number) => void;
  setLightPower: (power: number) => void;
  setPhase: (phase: number) => void;
  setView: (view: ViewId) => void;
}

export function createStreetEngine(
  context: ExperimentContext,
  onFrame: (state: StreetSnapshot) => void,
): StreetEngine {
  const narrow = window.matchMedia('(max-width: 640px)');
  let intensity = INITIAL_RAIN;
  let phase = INITIAL_PHASE;
  let view: ViewId = 'street';
  let frame = 0;
  let setRain: StreetEngine['setRain'] = () => {};
  let setLightPower: StreetEngine['setLightPower'] = () => {};
  let setPhase: StreetEngine['setPhase'] = () => {};
  let setView: StreetEngine['setView'] = () => {};
  const initial = VIEWS[0];
  const instance = spatialExperiment(context, {
    label: 'Neon Rain: an invented night street in Vesper Ward. Drag to look; use arrow keys or 1, 2, 3 to change views.',
    background: '#091720',
    camera: initial.position,
    target: initial.target,
    fov: 55,
    fitPortrait: false,
    shadows: false,
    exposure: 1.18,
    pixelRatio: narrow.matches ? 1 : 1.35,
  }, (stage) => {
    const street = buildNightStreet(stage);
    const orbit = orbitView(stage, {
      minDistance: 5, maxDistance: 60, maxPolarAngle: Math.PI / 2 - 0.012,
    });
    orbit.enableDamping = false;
    orbit.minAzimuthAngle = -Math.PI * 0.42;
    orbit.maxAzimuthAngle = Math.PI * 0.42;
    const drops = createRainDrops(RAIN_BUDGET.desktop);
    const geometry = stage.own(new THREE.PlaneGeometry(0.018, 0.43));
    const material = stage.own(new THREE.MeshBasicMaterial({
      color: '#a6d8e7', transparent: true, opacity: 0.48, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    }));
    const rain = stage.own(new THREE.InstancedMesh(geometry, material, drops.length));
    rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rain.frustumCulled = false;
    rain.name = 'Vesper instanced rain';
    stage.scene.add(rain);
    const transform = new THREE.Object3D();
    const firstMatrix = new THREE.Matrix4();
    let budget: number = narrow.matches ? RAIN_BUDGET.mobile : RAIN_BUDGET.desktop;
    const updateRain = () => {
      rain.count = rainCount(intensity, budget);
      transform.quaternion.copy(stage.camera.quaternion);
      transform.rotateZ(-0.12);
      for (let index = 0; index < rain.count; index++) {
        const drop = drops[index];
        transform.position.set(drop.x, rainHeightAt(drop, phase), drop.z);
        transform.scale.set(1, drop.length, 1);
        transform.updateMatrix();
        rain.setMatrixAt(index, transform.matrix);
      }
      rain.instanceMatrix.needsUpdate = true;
    };
    setRain = (value) => {
      intensity = THREE.MathUtils.clamp(value, 0, 100);
      updateRain();
      stage.invalidate();
    };
    setLightPower = (value) => {
      street.setLightPower(value);
      material.opacity = 0.3 + street.lightPower() * 0.18;
      stage.invalidate();
    };
    setPhase = (value) => {
      phase = rainPhase(value);
      updateRain();
      stage.invalidate();
    };
    setView = (id) => {
      const preset = VIEWS.find((item) => item.id === id);
      if (!preset) throw new Error(`Unknown Vesper Ward viewpoint: ${id}`);
      view = preset.id;
      stage.camera.position.set(...preset.position);
      stage.target.set(...preset.target);
      orbit.target.copy(stage.target);
      orbit.update();
      updateRain();
      stage.invalidate();
    };
    stage.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - 1 2 3 Space');
    stage.canvas.addEventListener('keydown', (event) => {
      const preset = VIEWS.find((item) => String(Number(item.number)) === event.key);
      if (!preset) return;
      event.preventDefault();
      setView(preset.id);
    }, { signal: stage.signal });
    const resizeBudget = () => {
      budget = narrow.matches ? RAIN_BUDGET.mobile : RAIN_BUDGET.desktop;
      updateRain();
      stage.invalidate();
    };
    narrow.addEventListener('change', resizeBudget, { signal: stage.signal });
    updateRain();
    // Publish the actual matrices and light after rendering, never optimistic UI state.
    stage.scene.onAfterRender = () => {
      rain.getMatrixAt(0, firstMatrix);
      onFrame({
        paused: stage.paused, phase, rainCount: rain.count, rainBudget: budget,
        firstDropY: rain.count > 0 ? firstMatrix.elements[13] : null, lightPower: street.lightPower(),
        lampIntensity: street.lampIntensity(), view, frame: ++frame,
        camera: stage.camera.position.toArray().map((value) => value.toFixed(4)).join(','),
        pixelRatio: stage.renderer.getPixelRatio(),
      });
    };
    stage.onDestroy(() => { stage.scene.onAfterRender = () => {}; });
    return {
      update(_elapsed, delta) {
        const pixelRatio = Math.min(stage.size.dpr, narrow.matches ? 1 : 1.35);
        if (stage.renderer.getPixelRatio() !== pixelRatio) stage.renderer.setPixelRatio(pixelRatio);
        if (delta > 0) phase = rainPhase(phase + delta);
        updateRain();
      },
    };
  });
  return {
    ...instance,
    setRain: (value) => setRain(value),
    setLightPower: (value) => setLightPower(value),
    setPhase: (value) => setPhase(value),
    setView: (value) => setView(value),
  };
}
