import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { orbitView, spatialExperiment } from '../../core/spatial';
import type { SpatialStage } from '../../core/spatial';
import type { ExperimentContext } from '../../core/types';
import { createCameraComponents } from './components';
import { DURATION, EXPLODED_FRAME, PARTS, VIEWS } from './data';
import type { PartId, ViewId } from './data';
import { assemblyFrame, normaliseProgress } from './timeline';

interface ArtworkControls {
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;
  inspect: (part: PartId | null) => void;
  setView: (view: ViewId) => void;
}

interface ArtworkEvents {
  frame: (progress: number) => void;
  finish: () => void;
  view: (view: ViewId | 'custom') => void;
}

function lightExhibit(stage: SpatialStage) {
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(stage.renderer);
  try {
    const environment = stage.own(generator.fromScene(room, 0.045));
    stage.scene.environment = environment.texture;
    stage.scene.environmentIntensity = 0.65;
  } finally {
    room.dispose();
    generator.dispose();
  }

  const key = stage.own(new THREE.DirectionalLight('#ffe6c4', 3.5));
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 8, bottom: -6, near: 0.5, far: 28 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.035;
  const rim = stage.own(new THREE.DirectionalLight('#a7dcd5', 2.2));
  rim.position.set(4, 5, -6);
  const fill = stage.own(new THREE.HemisphereLight('#eddfea', '#302134', 1.25));
  stage.scene.add(key, rim, fill);

  stage.scene.fog = new THREE.Fog('#291f30', 20, 47);
  const ground = new THREE.Mesh(
    stage.own(new THREE.PlaneGeometry(90, 90)),
    stage.own(new THREE.MeshStandardMaterial({ color: '#291f30', roughness: 0.94, metalness: 0.04 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.65;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const points = Array.from({ length: 96 }, (_, i) => {
    const angle = i / 96 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 4.2, -2.635, Math.sin(angle) * 4.2 + 0.4);
  });
  const guide = new THREE.LineLoop(
    stage.own(new THREE.BufferGeometry().setFromPoints(points)),
    stage.own(new THREE.LineBasicMaterial({ color: '#b4a5b6', transparent: true, opacity: 0.19 })),
  );
  stage.scene.add(guide);
}

export function createCameraArtwork(context: ExperimentContext, events: ArtworkEvents) {
  let commands!: ArtworkControls;
  const artwork = spatialExperiment(context, {
    label: 'An exploded, saffron and cream imaginary instant camera in three dimensions. Drag to orbit; arrow keys rotate and plus or minus zoom.',
    background: '#291f30',
    camera: [...VIEWS[0].position],
    target: [0, 0.45, 0.55],
    fov: 40,
    pixelRatio: 1.5,
    shadows: true,
    exposure: 1.08,
  }, (stage) => {
    lightExhibit(stage);
    const model = createCameraComponents(stage);
    const orbit = orbitView(stage, { minDistance: 7.5, maxDistance: 22, maxPolarAngle: Math.PI * 0.73 });
    let progress = context.reducedMotion ? EXPLODED_FRAME : 0;
    let speed = 1;
    let settingView = false;

    function fitComposition() {
      const zoom = stage.size.width < stage.size.height ? 0.88 : 1;
      if (stage.camera.zoom !== zoom) {
        stage.camera.zoom = zoom;
        stage.camera.updateProjectionMatrix();
      }
    }

    fitComposition();

    function recordCamera() {
      stage.canvas.dataset.camera = stage.camera.position.toArray().map((value) => value.toFixed(3)).join(',');
    }

    const cameraChanged = () => {
      recordCamera();
      if (!settingView) {
        stage.canvas.dataset.view = 'custom';
        events.view('custom');
      }
    };
    orbit.addEventListener('change', cameraChanged);
    stage.onDestroy(() => orbit.removeEventListener('change', cameraChanged));
    stage.canvas.dataset.view = 'study';
    recordCamera();

    function applyFrame() {
      const frame = assemblyFrame(progress);
      for (const part of PARTS) {
        const pose = frame.parts[part.id];
        model.groups[part.id].position.set(...pose.position);
        model.groups[part.id].rotation.set(...pose.rotation);
      }
      for (let i = 0; i < model.leaves.length; i++) {
        model.leaves[i].rotation.z = i * Math.PI * 2 / model.leaves.length + frame.shutterAngle;
      }
      model.photograph.visible = frame.print.visible;
      model.photograph.position.set(...frame.print.position);
      model.photograph.rotation.set(...frame.print.rotation);
      stage.canvas.dataset.progress = progress.toFixed(5);
      stage.canvas.dataset.print = frame.print.visible ? 'visible' : 'hidden';
      events.frame(progress);
    }

    function seek(value: number) {
      progress = normaliseProgress(value);
      applyFrame();
      stage.invalidate();
    }

    commands = {
      seek,
      setSpeed(value) {
        if (![0.5, 1, 1.5, 2].includes(value)) throw new RangeError('Choose one of the four assembly playback speeds.');
        speed = value;
      },
      inspect(part) {
        model.highlight(part);
        stage.canvas.dataset.selected = part ?? '';
        stage.invalidate();
      },
      setView(id) {
        const view = VIEWS.find((item) => item.id === id);
        if (!view) throw new RangeError('That camera viewpoint does not exist.');
        settingView = true;
        const [x, y, z] = view.position;
        stage.camera.position.set(x, y, z);
        orbit.target.copy(stage.target);
        orbit.update();
        settingView = false;
        stage.canvas.dataset.view = id;
        recordCamera();
        events.view(id);
        stage.invalidate();
      },
    };
    applyFrame();

    return {
      update(_elapsed, delta) {
        fitComposition();
        if (!stage.paused && delta > 0 && progress < 1) {
          progress = Math.min(1, progress + delta * speed / DURATION);
          applyFrame();
          if (progress === 1) events.finish();
        }
      },
      reset: () => seek(EXPLODED_FRAME),
    };
  });
  return { ...artwork, ...commands };
}
