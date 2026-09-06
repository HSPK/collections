import { clamp } from '../../core/math';
import { orbitView, type SpatialStage } from '../../core/spatial';
import {
  CYCLE_SECONDS, DEFAULT_INTENSITY, DEFAULT_MIST, getCavernView, getMineral,
  type MineralId, type ViewId,
} from './data';
import type { CavernScene, MineralLighting } from './scene';

export interface CavernState {
  paused: boolean;
  view: ViewId;
  mineral: MineralId;
  intensity: number;
  mist: number;
  phase: number;
}

export function pulseAtPhase(phase: number): number {
  return 0.91 + 0.09 * Math.sin(phase * Math.PI * 2);
}

export function resolveMineralLighting(mineral: MineralId, intensity: number, phase: number): MineralLighting {
  const palette = getMineral(mineral);
  const strength = clamp(intensity, 25, 150) / 100;
  const pulse = pulseAtPhase(phase);
  return {
    colors: palette.colors,
    key: palette.key,
    fill: palette.fill,
    emission: (0.16 + strength * 0.38) * pulse,
    keyIntensity: 1.7 + strength * 0.75,
    pointIntensity: (45 + strength * 90) * pulse,
    reflection: (0.35 + strength * 0.65) * pulse,
  };
}

export function createCavernEngine(
  stage: SpatialStage,
  scene: CavernScene,
  paused: boolean,
  onChange: (state: Readonly<CavernState>) => void,
) {
  const state: CavernState = {
    paused, view: 'pool', mineral: 'opal', intensity: DEFAULT_INTENSITY,
    mist: DEFAULT_MIST, phase: 0.18,
  };
  const orbit = orbitView(stage, { minDistance: 10, maxDistance: 22, maxPolarAngle: Math.PI / 2 - 0.025 });
  orbit.minPolarAngle = 1.12;
  orbit.minAzimuthAngle = -0.48;
  orbit.maxAzimuthAngle = 0.48;
  orbit.enableZoom = false;
  stage.canvas.style.touchAction = 'pan-y';
  stage.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Space');

  function publishCamera() {
    stage.container.dataset.camera = stage.camera.position.toArray().map((n) => n.toFixed(4)).join(',');
    stage.invalidate();
  }
  orbit.addEventListener('change', publishCamera);
  stage.onDestroy(() => orbit.removeEventListener('change', publishCamera));

  function synchronize() {
    scene.applyLighting(resolveMineralLighting(state.mineral, state.intensity, state.phase));
    scene.renderTime(state.phase);
    stage.container.dataset.phase = state.phase.toFixed(6);
    stage.container.dataset.emission = scene.emission.toFixed(6);
    stage.container.dataset.crystalColor = scene.crystalColor;
    stage.container.dataset.lightIntensity = scene.lightIntensity.toFixed(4);
    stage.container.dataset.motion = state.paused ? 'paused' : 'playing';
    stage.container.dataset.view = state.view;
    stage.container.dataset.mineral = state.mineral;
    onChange(state);
  }

  function changed() {
    synchronize();
    stage.invalidate();
  }

  scene.setMist(state.mist);
  synchronize();
  publishCamera();

  return {
    state,
    update(_elapsed: number, delta: number) {
      if (!state.paused && delta > 0) {
        state.phase = (state.phase + delta / CYCLE_SECONDS) % 1;
        synchronize();
      }
    },
    setPaused(value: boolean) {
      state.paused = value;
      changed();
    },
    selectView(id: ViewId) {
      const view = getCavernView(id);
      state.view = id;
      stage.camera.position.set(...view.camera);
      orbit.target.set(...view.target);
      orbit.update();
      publishCamera();
      changed();
    },
    setMineral(id: MineralId) {
      state.mineral = getMineral(id).id;
      changed();
    },
    setIntensity(value: number) {
      state.intensity = clamp(value, 25, 150);
      changed();
    },
    setMist(value: number) {
      state.mist = clamp(value, 0, 100);
      scene.setMist(state.mist);
      changed();
    },
    setPhase(value: number) {
      state.phase = clamp(value, 0, 1);
      changed();
    },
  };
}

export type CavernEngine = ReturnType<typeof createCavernEngine>;
