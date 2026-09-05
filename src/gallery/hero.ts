import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { observeSize } from '../core/canvas';
import { createLoop } from '../core/loop';

export function mountHero(container: HTMLElement, signal: AbortSignal, reducedMotion: boolean) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'A polished, moving ring sculpture. Drag to rotate it or use the arrow keys.');
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(5, 3.5, 8);
  camera.lookAt(0, 0, 0);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.035);
  scene.environment = environmentMap.texture;
  environment.dispose();

  scene.add(new THREE.AmbientLight('#f7f3df', 0.65));
  const key = new THREE.DirectionalLight('#fff9e7', 4);
  key.position.set(-3, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.normalBias = 0.04;
  key.shadow.bias = -0.001;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#d3e5cc', 3);
  rim.position.set(4, 1, -3);
  scene.add(rim);

  const sculpture = new THREE.Group();
  sculpture.rotation.set(0.2, -0.2, -0.28);
  scene.add(sculpture);
  const graphite = new THREE.MeshPhysicalMaterial({ color: '#465246', metalness: 1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.25 });
  const silver = new THREE.MeshPhysicalMaterial({ color: '#c5c9b0', metalness: 1, roughness: 0.2, clearcoat: 1 });
  const dark = new THREE.MeshPhysicalMaterial({ color: '#2c3931', metalness: 0.95, roughness: 0.24 });
  const vermilion = new THREE.MeshPhysicalMaterial({ color: '#d74614', metalness: 0.08, roughness: 0.42, clearcoat: 0.35, envMapIntensity: 0.35 });
  const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshPhysicalMaterial>[] = [];
  for (const [radius, tube, material] of [
    [1.86, 0.23, graphite],
    [1.33, 0.19, silver],
    [0.82, 0.18, dark],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 36, 160), material);
    ring.castShadow = true;
    ring.receiveShadow = true;
    rings.push(ring);
    sculpture.add(ring);
  }
  rings[0].rotation.set(0.4, 0.65, -0.3);
  rings[1].rotation.set(1.15, -0.2, 0.55);
  rings[2].rotation.set(-0.4, 1.15, -0.2);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 32), vermilion);
  core.castShadow = true;
  sculpture.add(core);
  const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.23, 40, 32), vermilion);
  satellite.position.set(1.8, 1.0, 0.2);
  satellite.castShadow = true;
  sculpture.add(satellite);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.11 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.42;
  floor.receiveShadow = true;
  scene.add(floor);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.5;
  controls.minPolarAngle = 0.4;
  controls.maxPolarAngle = Math.PI - 0.4;
  renderer.domElement.style.touchAction = 'pan-y';
  let inView = true;
  let motionReduced = reducedMotion;
  let manualRotation = 0;
  const loop = createLoop((elapsed) => {
    rings[0].rotation.y = 0.65 + elapsed * 0.08;
    rings[1].rotation.x = 1.15 - elapsed * 0.13;
    rings[2].rotation.y = 1.15 + elapsed * 0.19;
    sculpture.rotation.y = -0.2 + Math.sin(elapsed * 0.17) * 0.18 + manualRotation;
    sculpture.position.y = Math.sin(elapsed * 0.5) * 0.06;
    satellite.position.set(Math.cos(elapsed * 0.18 + 0.5) * 1.97, Math.sin(elapsed * 0.18 + 0.5) * 1.97, 0.25);
    renderer.render(scene, camera);
  }, { paused: reducedMotion });

  controls.addEventListener('change', loop.requestRender);
  const disposeSize = observeSize(container, ({ width, height, dpr }) => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    loop.requestRender();
  });
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    loop.setPaused(motionReduced || !inView);
  });
  visibility.observe(container);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', () => {
    motionReduced = preference.matches;
    loop.setPaused(motionReduced || !inView);
  }, { signal });
  renderer.domElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    manualRotation += event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -0.2 : 0.2;
    loop.requestRender();
  }, { signal });
  renderer.render(scene, camera);
  container.querySelector('.hero-fallback')?.remove();

  return () => {
    loop.destroy();
    disposeSize();
    visibility.disconnect();
    controls.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    graphite.dispose();
    silver.dispose();
    dark.dispose();
    vermilion.dispose();
    floor.material.dispose();
    key.shadow.dispose();
    environmentMap.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
