import * as THREE from 'three';
import { orbitView, spatialExperiment } from '../../core/spatial';
import type { ExperimentContext, ExperimentInstance } from '../../core/types';
import { cameraFov, canonicalEye, defaultSun, focalPoint, viewpoints, type Viewpoint } from './data';
import { buildParadoxScene, physicalGaps, projectionError } from './scene';

export interface ParadoxSnapshot {
  phase: number;
  error: number;
  gaps: number[];
  camera: string;
  view: Viewpoint;
  guides: boolean;
  sun: number;
}

export interface ParadoxEngine extends ExperimentInstance {
  setView: (view: Exclude<Viewpoint, 'free'>) => void;
  setPhase: (degrees: number) => void;
  setGuides: (visible: boolean) => void;
  setSun: (degrees: number) => void;
}

export function createParadoxEngine(
  context: ExperimentContext,
  publish: (snapshot: ParadoxSnapshot) => void,
  onManualView: () => void,
): ParadoxEngine {
  let setView: ParadoxEngine['setView'] = () => {};
  let setPhase: ParadoxEngine['setPhase'] = () => {};
  let setGuides: ParadoxEngine['setGuides'] = () => {};
  let setSun: ParadoxEngine['setSun'] = () => {};
  const instance = spatialExperiment({ ...context, reducedMotion: true }, {
    label: 'Three tapered architectural beams that form an impossible triangle from one exact viewpoint. Drag or use arrow keys to reveal the gaps.',
    background: '#e8e4dc',
    camera: [...canonicalEye],
    target: [...focalPoint],
    fov: cameraFov,
    pixelRatio: context.container.clientWidth < 640 ? 1 : 1.5,
    exposure: 1.04,
  }, (stage) => {
    const model = buildParadoxScene(stage);
    const orbit = orbitView(stage, { minDistance: 12, maxDistance: 46, maxPolarAngle: Math.PI * 0.48 });
    const canonicalOffset = new THREE.Vector3(...canonicalEye).sub(new THREE.Vector3(...focalPoint));
    const spinAxis = new THREE.Vector3(0, 1, 0);
    const gaps = physicalGaps(model.beams);
    let view: Viewpoint = 'aligned';
    let phase = 0;
    let sun = defaultSun;
    let internalMove = false;
    model.setSun(sun);
    stage.canvas.setAttribute('aria-describedby', 'paradox-camera-help');

    const onChange = () => {
      if (internalMove) return;
      view = 'free';
      const offset = stage.camera.position.clone().sub(orbit.target);
      phase = ((Math.atan2(offset.x, offset.z) - Math.atan2(canonicalOffset.x, canonicalOffset.z))
        * 180 / Math.PI + 360) % 360;
      onManualView();
      stage.invalidate();
    };
    orbit.addEventListener('change', onChange);
    stage.onDestroy(() => orbit.removeEventListener('change', onChange));

    const move = (position: THREE.Vector3) => {
      internalMove = true;
      stage.camera.position.copy(position);
      orbit.target.set(...focalPoint);
      orbit.update();
      internalMove = false;
      stage.invalidate();
    };
    setView = (id) => {
      const preset = viewpoints.find((item) => item.id === id);
      if (!preset) throw new Error(`Unknown architectural viewpoint: ${id}`);
      move(new THREE.Vector3(...preset.eye));
      view = id;
      const offset = stage.camera.position.clone().sub(orbit.target);
      phase = ((Math.atan2(offset.x, offset.z) - Math.atan2(canonicalOffset.x, canonicalOffset.z))
        * 180 / Math.PI + 360) % 360;
    };
    setPhase = (degrees) => {
      if (!Number.isFinite(degrees)) throw new Error('The inspection angle must be a finite number.');
      phase = ((degrees % 360) + 360) % 360;
      move(canonicalOffset.clone().applyAxisAngle(spinAxis, THREE.MathUtils.degToRad(phase))
        .add(new THREE.Vector3(...focalPoint)));
      view = phase < 0.001 ? 'aligned' : 'free';
    };
    setGuides = (visible) => {
      model.guides.visible = visible;
      stage.invalidate();
    };
    setSun = (degrees) => {
      if (!Number.isFinite(degrees)) throw new Error('The light angle must be a finite number.');
      sun = THREE.MathUtils.clamp(degrees, 10, 160);
      model.setSun(sun);
    };
    return {
      update(_elapsed, delta) {
        if (delta > 0) {
          phase = (phase + delta * 7) % 360;
          internalMove = true;
          const offset = stage.camera.position.clone().sub(orbit.target);
          stage.camera.position.copy(offset.applyAxisAngle(spinAxis, delta * 7 * Math.PI / 180)).add(orbit.target);
          orbit.update();
          internalMove = false;
          view = 'free';
        }
        stage.camera.updateMatrixWorld();
        publish({
          phase,
          error: projectionError(model.beams, stage.camera, stage.size.width, stage.size.height),
          gaps,
          camera: stage.camera.position.toArray().map((coordinate) => coordinate.toFixed(5)).join(','),
          view,
          guides: model.guides.visible,
          sun,
        });
      },
      reset() {
        setView('aligned');
        setGuides(false);
        setSun(defaultSun);
      },
    };
  });
  return {
    ...instance,
    setView: (view) => setView(view),
    setPhase: (degrees) => setPhase(degrees),
    setGuides: (visible) => setGuides(visible),
    setSun: (degrees) => setSun(degrees),
  };
}
