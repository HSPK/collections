import * as THREE from 'three';
import { orbitView, spatialExperiment } from '../../core/spatial';
import type { SpatialStage } from '../../core/spatial';
import type { ProjectContext } from '../../core/types';
import { clamp } from '../../core/math';
import {
  CYCLE_SECONDS, INITIAL_STATE, TIDE_MAX, TIDE_MIN, VIEWPOINTS,
} from './data';
import type { Viewpoint } from './data';
import { createCoastalScene } from './scene';
import type { CoastalSnapshot } from './scene';

export function createObservatory(
  context: ProjectContext,
  onObservation: (observation: CoastalSnapshot) => void,
) {
  let stage: SpatialStage;
  let orbit: ReturnType<typeof orbitView>;
  let coast: ReturnType<typeof createCoastalScene>;
  let tide: number = INITIAL_STATE.tide;
  let daylight: number = INITIAL_STATE.daylight;
  let time: number = INITIAL_STATE.time;
  let disposed = false;
  const offset = new THREE.Vector3();
  const narrow = window.matchMedia('(max-width: 600px)');

  function observe() {
    if (disposed) return;
    onObservation(coast.update(time, tide, daylight));
    stage.invalidate();
  }

  const instance = spatialExperiment(context, {
    label: 'A rocky island with a striped lighthouse, keeper’s cottages, a timber landing and boats on a moving sea.',
    background: '#e8dccc',
    camera: VIEWPOINTS.coast.position,
    target: VIEWPOINTS.coast.target,
    fov: 37,
    pixelRatio: narrow.matches ? 1.15 : 1.5,
    shadows: true,
    exposure: 1.05,
  }, (nextStage) => {
    stage = nextStage;
    stage.onDestroy(() => { disposed = true; });
    coast = createCoastalScene(stage);
    orbit = orbitView(stage, { minDistance: 7, maxDistance: 39, maxPolarAngle: Math.PI / 2 - 0.075 });
    stage.canvas.setAttribute('aria-describedby', 'tidal-camera-help');
    stage.canvas.dataset.tidalCanvas = '';
    stage.canvas.addEventListener('pointerdown', () => stage.canvas.focus({ preventScroll: true }), { signal: stage.signal });
    let previousAspect = -1;
    let previousDpr = -1;
    const applyViewport = () => {
      const aspect = stage.size.width / stage.size.height;
      if (aspect !== previousAspect) {
        previousAspect = aspect;
        stage.camera.zoom = aspect > 1.35 ? 1.1 : 1;
        stage.camera.updateProjectionMatrix();
      }
      const dpr = Math.min(stage.size.dpr, narrow.matches ? 1.15 : 1.5);
      if (previousDpr !== dpr || stage.renderer.getPixelRatio() !== dpr) {
        previousDpr = dpr;
        stage.renderer.setPixelRatio(dpr);
      }
    };
    narrow.addEventListener('change', stage.invalidate, { signal: stage.signal });
    applyViewport();
    onObservation(coast.update(time, tide, daylight));
    return {
      update(_elapsed, delta) {
        applyViewport();
        if (!stage.paused) time = (time + delta) % CYCLE_SECONDS;
        onObservation(coast.update(time, tide, daylight));
      },
    };
  });

  function setView(view: Viewpoint) {
    if (disposed) return;
    const preset = VIEWPOINTS[view];
    stage.camera.position.set(...preset.position);
    orbit.target.set(...preset.target);
    stage.target.copy(orbit.target);
    orbit.update();
    observe();
  }

  return {
    destroy: instance.destroy,
    setPaused: instance.setPaused,
    setTide(value: number) {
      tide = clamp(value, TIDE_MIN, TIDE_MAX);
      observe();
    },
    setDaylight(value: number) {
      daylight = clamp(value, 0, 100);
      observe();
    },
    setTime(value: number) {
      time = clamp(value, 0, CYCLE_SECONDS);
      observe();
    },
    setView,
    zoom(factor: number) {
      if (disposed) return;
      offset.copy(stage.camera.position).sub(orbit.target);
      offset.setLength(clamp(offset.length() * factor, orbit.minDistance, orbit.maxDistance));
      stage.camera.position.copy(orbit.target).add(offset);
      orbit.update();
      observe();
    },
    reset() {
      tide = INITIAL_STATE.tide;
      daylight = INITIAL_STATE.daylight;
      time = INITIAL_STATE.time;
      setView('coast');
    },
  };
}
