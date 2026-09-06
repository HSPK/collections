import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp } from '../../core/math';
import { orbitView, spatialExperiment } from '../../core/spatial';
import type { SpatialStage } from '../../core/spatial';
import type { ExperimentContext, ExperimentInstance } from '../../core/types';
import { BREEZE_SECONDS, INITIAL_PHASE, PALETTE, getLandmark } from './data';
import type { LandmarkId } from './data';
import { buildPaperWorld } from './scene';
import type { PaperWorld } from './scene';

export interface AtlasState {
  selected: LandmarkId | null;
  paused: boolean;
  daylight: number;
  phase: number;
}

export interface AtlasEngine extends ExperimentInstance {
  select: (id: LandmarkId) => void;
  setLight: (amount: number) => void;
  setPhase: (amount: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
}

export function createAtlasEngine(
  context: ExperimentContext,
  onState: (state: AtlasState) => void,
  onPhase: (phase: number) => void,
): AtlasEngine {
  let stage: SpatialStage;
  let world: PaperWorld;
  let orbit: OrbitControls;
  let selected: LandmarkId | null = null;
  let paused = true;
  let daylight = 100;
  let seconds = BREEZE_SECONDS * INITIAL_PHASE / 100;
  let lastPhase = -1;
  const worldPosition = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const reportState = () => onState({ selected, paused, daylight, phase: seconds / BREEZE_SECONDS * 100 });

  function geometryState() {
    stage.scene.updateMatrixWorld(true);
    stage.camera.updateMatrixWorld(true);
    cameraDirection.copy(stage.camera.position).sub(orbit.target).normalize();
    const canvas = stage.canvas;
    canvas.dataset.sceneTime = seconds.toFixed(4);
    canvas.dataset.camera = stage.camera.position.toArray().map((value) => value.toFixed(4)).join(',');
    canvas.dataset.light = daylight.toFixed(0);
    canvas.dataset.selectedLandmark = selected ?? 'overview';
    const landmark = selected ? world.landmarks.get(selected) : undefined;
    if (landmark) {
      landmark.getWorldPosition(worldPosition);
      projected.copy(worldPosition).project(stage.camera);
      canvas.dataset.landmarkAlignment = cameraDirection.dot(worldPosition.clone().normalize()).toFixed(6);
      canvas.dataset.landmarkProjection = `${projected.x.toFixed(6)},${projected.y.toFixed(6)}`;
    } else {
      delete canvas.dataset.landmarkAlignment;
      delete canvas.dataset.landmarkProjection;
    }
  }

  const artwork = spatialExperiment({ ...context, reducedMotion: true }, {
    label: 'Paper Planet, an invented cut-paper globe with forests, golden fields, a coastal village, icy peaks and terracotta canyons. Drag or use arrow keys to orbit; plus and minus zoom.',
    background: PALETTE.paper,
    camera: [0, 3, 8.45],
    target: [0, 0, 0],
    fov: 40,
    pixelRatio: window.matchMedia('(max-width: 600px)').matches ? 1.2 : 1.5,
    exposure: 1.05,
    shadows: true,
  }, (current) => {
    stage = current;
    world = buildPaperWorld(stage);
    orbit = orbitView(stage, { minDistance: 7.3, maxDistance: 12, maxPolarAngle: Math.PI - 0.12 });
    orbit.minPolarAngle = 0.12;
    orbit.rotateSpeed = 0.55;
    stage.canvas.setAttribute('aria-describedby', 'pp-orbit-help');
    const onOrbit = () => {
      geometryState();
      stage.invalidate();
    };
    orbit.addEventListener('change', onOrbit);
    stage.onDestroy(() => orbit.removeEventListener('change', onOrbit));
    world.animate(seconds);
    world.setLight(daylight);
    geometryState();
    return {
      update(_elapsed, delta) {
        if (!stage.paused) seconds = (seconds + delta) % BREEZE_SECONDS;
        world.animate(seconds);
        geometryState();
        const phase = Math.floor(seconds / BREEZE_SECONDS * 100);
        if (lastPhase !== phase) {
          lastPhase = phase;
          onPhase(phase);
        }
      },
      reset,
    };
  });

  function select(id: LandmarkId) {
    const landmark = world.landmarks.get(id);
    if (!landmark) throw new Error(`The atlas has no geometry for ${id}.`);
    selected = id;
    world.select(id);
    landmark.getWorldPosition(worldPosition);
    const distance = clamp(stage.camera.position.distanceTo(orbit.target), 8.4, 10);
    stage.camera.position.copy(worldPosition).normalize().multiplyScalar(distance);
    orbit.target.set(0, 0, 0);
    orbit.update();
    geometryState();
    reportState();
    stage.invalidate();
    context.report(`${getLandmark(id).name} is now facing you. Drag to explore around it.`);
  }

  function setPaused(value: boolean) {
    paused = value;
    artwork.setPaused(value);
    reportState();
  }

  function reset() {
    selected = null;
    daylight = 100;
    seconds = BREEZE_SECONDS * INITIAL_PHASE / 100;
    lastPhase = -1;
    paused = true;
    artwork.setPaused(true);
    world.select(null);
    world.setLight(daylight);
    world.animate(seconds);
    orbit.reset();
    geometryState();
    reportState();
    onPhase(INITIAL_PHASE);
    stage.invalidate();
  }

  return {
    destroy: artwork.destroy,
    setPaused,
    reset,
    select,
    setLight(amount) {
      daylight = clamp(amount, 0, 100);
      world.setLight(daylight);
      geometryState();
      reportState();
      stage.invalidate();
    },
    setPhase(amount) {
      seconds = clamp(amount, 0, 100) / 100 * BREEZE_SECONDS;
      world.animate(seconds);
      geometryState();
      reportState();
      stage.invalidate();
    },
    zoom(factor) {
      const distance = clamp(stage.camera.position.length() * factor, orbit.minDistance, orbit.maxDistance);
      stage.camera.position.normalize().multiplyScalar(distance);
      orbit.update();
      geometryState();
      stage.invalidate();
    },
  };
}
