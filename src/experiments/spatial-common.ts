import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { observeSize } from '../core/canvas';
import type { CanvasSize } from '../core/canvas';
import { stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';

interface Disposable {
  dispose: () => void;
}

interface SpatialOptions {
  label: string;
  background: string;
  camera: [number, number, number];
  target: [number, number, number];
  fov?: number;
  fitPortrait?: boolean;
  shadows?: boolean;
  exposure?: number;
  pixelRatio?: number;
}

export interface SpatialStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  controls: HTMLElement;
  target: THREE.Vector3;
  signal: AbortSignal;
  size: CanvasSize;
  readonly paused: boolean;
  invalidate: () => void;
  own: <T extends Disposable>(resource: T) => T;
  onDestroy: (cleanup: () => void) => void;
}

interface SpatialArtwork {
  update: (elapsed: number, delta: number) => void;
  reset?: () => void;
}

export function spatialExperiment(
  context: ExperimentContext,
  options: SpatialOptions,
  build: (stage: SpatialStage) => SpatialArtwork,
): ExperimentInstance {
  if (context.signal.aborted) {
    throw new Error('This study has already closed. Open it again to explore.');
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'experiment-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', options.label);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (cause) {
    throw new Error(
      'This spatial study needs WebGL 2. Enable hardware acceleration or open it in a WebGL-compatible browser.',
      { cause },
    );
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  const camera = new THREE.PerspectiveCamera(options.fov ?? 36, 1, 0.1, 260);
  camera.position.set(...options.camera);
  const target = new THREE.Vector3(...options.target);
  camera.lookAt(target);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.12;
  renderer.shadowMap.enabled = options.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const controls = document.createElement('div');
  controls.style.display = 'contents';
  context.controls.append(controls);
  context.container.append(canvas);
  const lifecycle = new AbortController();
  const resources = new Set<Disposable>();
  const cleanups: (() => void)[] = [];
  const size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let loop: ReturnType<typeof createLoop> | undefined;
  let paused = context.reducedMotion;
  let disposed = false;
  let contextLost = false;

  const invalidate = () => loop?.requestRender();
  const stage: SpatialStage = {
    scene,
    camera,
    renderer,
    canvas,
    container: context.container,
    controls,
    target,
    signal: lifecycle.signal,
    size,
    get paused() {
      return paused;
    },
    invalidate,
    own(resource) {
      resources.add(resource);
      return resource;
    },
    onDestroy(cleanup) {
      cleanups.push(cleanup);
    },
  };

  function destroy() {
    if (disposed) return;
    disposed = true;
    lifecycle.abort();
    loop?.destroy();
    for (const cleanup of cleanups.reverse()) cleanup();
    cleanups.length = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        resources.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          resources.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) resources.add(value);
          }
        }
      }
      if (object instanceof THREE.InstancedMesh) resources.add(object);
    });
    scene.environment = null;
    scene.background = null;
    for (const resource of resources) resource.dispose();
    resources.clear();
    scene.clear();
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    controls.replaceChildren();
    controls.remove();
    canvas.remove();
  }

  context.signal.addEventListener('abort', destroy, { once: true, signal: lifecycle.signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    loop?.setPaused(true);
    context.report('The graphics connection was interrupted. Waiting for WebGL to recover.');
  }, { signal: lifecycle.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    loop?.setPaused(paused);
    context.report('The graphics connection has recovered.');
  }, { signal: lifecycle.signal });

  try {
    cleanups.push(observeSize(context.container, (next) => {
      Object.assign(size, next);
      camera.aspect = next.width / next.height;
      const portrait = options.fitPortrait === false ? 1 : Math.min(camera.aspect, 1);
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad((options.fov ?? 36) / 2)) / portrait),
      );
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(next.dpr, options.pixelRatio ?? 2));
      renderer.setSize(next.width, next.height, false);
      invalidate();
    }));
    const artwork = build(stage);
    loop = createLoop((elapsed, delta) => {
      if (contextLost) return;
      artwork.update(elapsed, delta);
      renderer.render(scene, camera);
    }, { paused });
    return {
      destroy,
      setPaused(value) {
        paused = value;
        loop?.setPaused(value || contextLost);
      },
      reset: artwork.reset,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}

export function orbitView(
  stage: SpatialStage,
  options: { minDistance?: number; maxDistance?: number; maxPolarAngle?: number } = {},
): OrbitControls {
  const orbit = new OrbitControls(stage.camera, stage.canvas);
  orbit.target.copy(stage.target);
  orbit.enablePan = false;
  orbit.enableDamping = false;
  orbit.rotateSpeed = 0.65;
  orbit.zoomSpeed = 0.7;
  orbit.minDistance = options.minDistance ?? 7;
  orbit.maxDistance = options.maxDistance ?? 23;
  orbit.minPolarAngle = 0.18;
  orbit.maxPolarAngle = options.maxPolarAngle ?? Math.PI / 2 - 0.035;
  orbit.update();
  orbit.saveState();
  stage.canvas.style.cursor = 'grab';
  stage.canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + -');
  const begin = () => { stage.canvas.style.cursor = 'grabbing'; };
  const end = () => { stage.canvas.style.cursor = 'grab'; };
  orbit.addEventListener('change', stage.invalidate);
  orbit.addEventListener('start', begin);
  orbit.addEventListener('end', end);
  stage.onDestroy(() => {
    orbit.removeEventListener('change', stage.invalidate);
    orbit.removeEventListener('start', begin);
    orbit.removeEventListener('end', end);
    orbit.dispose();
  });

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  stage.canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    spherical.setFromVector3(offset.copy(stage.camera.position).sub(orbit.target));
    if (event.key === 'ArrowLeft') spherical.theta -= 0.1;
    if (event.key === 'ArrowRight') spherical.theta += 0.1;
    if (event.key === 'ArrowUp') spherical.phi -= 0.08;
    if (event.key === 'ArrowDown') spherical.phi += 0.08;
    if (event.key === '+' || event.key === '=') spherical.radius *= 0.9;
    if (event.key === '-') spherical.radius *= 1.1;
    spherical.phi = clamp(spherical.phi, orbit.minPolarAngle, orbit.maxPolarAngle);
    spherical.radius = clamp(spherical.radius, orbit.minDistance, orbit.maxDistance);
    stage.camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical));
    orbit.update();
    stage.invalidate();
  }, { signal: stage.signal });
  return orbit;
}

export function studio(
  stage: SpatialStage,
  options: { ground: string; shadow: string; radius?: number },
) {
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  try {
    const environment = stage.own(pmrem.fromScene(room, 0.035));
    stage.scene.environment = environment.texture;
    stage.scene.environmentIntensity = 0.85;
  } finally {
    room.dispose();
    pmrem.dispose();
  }

  const key = new THREE.DirectionalLight('#fff4df', 3.6);
  key.position.set(-5, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 32;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.025;
  stage.own(key.shadow);
  const rim = new THREE.DirectionalLight('#f1e7ff', 1.4);
  rim.position.set(5, 5, -6);
  stage.scene.add(key, rim, new THREE.HemisphereLight('#fff5e8', options.shadow, 1.1));

  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshBasicMaterial({ color: options.ground, toneMapped: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  const shadow = new THREE.Mesh(
    groundGeometry,
    new THREE.ShadowMaterial({ color: options.shadow, opacity: 0.24, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  shadow.receiveShadow = true;
  shadow.renderOrder = 2;
  stage.scene.add(ground, shadow);

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 128;
  const painter = textureCanvas.getContext('2d');
  if (!painter) throw new Error('The browser could not prepare the studio shadow texture.');
  const gradient = painter.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  painter.fillStyle = gradient;
  painter.fillRect(0, 0, 128, 128);
  const texture = stage.own(new THREE.CanvasTexture(textureCanvas));
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry((options.radius ?? 3) * 2, (options.radius ?? 3) * 1.6),
    new THREE.MeshBasicMaterial({
      map: texture,
      color: options.shadow,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.65,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0.35, 0.004, -0.15);
  contact.renderOrder = 1;
  stage.scene.add(contact);
}

export function plinth(stage: SpatialStage, radius: number, color: string): THREE.Mesh {
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius - 0.07, 0),
    new THREE.Vector2(radius, 0.04),
    new THREE.Vector2(radius, 0.105),
    new THREE.Vector2(radius - 0.055, 0.16),
    new THREE.Vector2(0, 0.16),
  ];
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 128),
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.44,
      metalness: 0.12,
      clearcoat: 0.35,
      envMapIntensity: 0.5,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stage.scene.add(mesh);
  return mesh;
}

export function plateLabel(stage: SpatialStage, text: string): HTMLElement {
  const label = stageHint(stage.container, text);
  label.style.top = '20px';
  label.style.bottom = 'auto';
  stage.onDestroy(() => label.remove());
  return label;
}

export function setControlValue(control: HTMLInputElement | HTMLSelectElement, value: string | number) {
  control.value = String(value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
}
