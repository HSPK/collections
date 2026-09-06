import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { observeSize } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { query } from '../../core/page';
import { EARTH_RADIUS, ESCAPE_RADIUS, elements, length, movingFrame, sampleOrbit } from './mechanics';
import type { State, Vec3 } from './mechanics';
import { createGeography } from './geography';

export interface SceneData {
  live: State;
  target: State;
  projected: Vec3[];
  hasPlan: boolean;
  inspected: State | null;
  burns: { position: Vec3; label: string }[];
}
type CameraView = 'oblique' | 'north' | 'edge';
interface Label { element: HTMLElement; position: THREE.Vector3; offset: number }
const world = (value: Vec3) => new THREE.Vector3(value.x / EARTH_RADIUS, value.z / EARTH_RADIUS, -value.y / EARTH_RADIUS);

export function createOrbitalScene(host: HTMLElement, signal: AbortSignal, report: (message: string) => void) {
  const canvas = document.createElement('canvas');
  canvas.className = 'apsis-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Interactive Earth orbital view. Drag to orbit, scroll to zoom. Arrow keys rotate, plus and minus zoom, Home fits the orbit.');
  canvas.setAttribute('role', 'img');
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = 2.35;
  controls.maxDistance = 240;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.6;
  const resources = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
  const globe = new THREE.Mesh(own(new THREE.SphereGeometry(1, 64, 48)),
    own(new THREE.MeshPhongMaterial({ map: own(createGeography()), color: '#d7e5e4', shininess: 13,
      specular: '#2c555b', emissive: '#0a1921', emissiveIntensity: 0.42 })));
  globe.rotation.y = 0.2;
  scene.add(globe);
  scene.add(new THREE.AmbientLight('#94bdd0', 0.25));
  const sun = new THREE.DirectionalLight('#f2f4e7', 2.8);
  sun.position.set(-3, 4, 5);
  scene.add(sun);
  const atmosphere = new THREE.Mesh(own(new THREE.SphereGeometry(1.022, 48, 32)), own(new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color('#658dba') } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-p.xyz);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 tint;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.6);
        gl_FragColor = vec4(tint, rim * 0.42);
      }`,
  })));
  scene.add(atmosphere);
  const currentLine = new THREE.Line(own(new THREE.BufferGeometry()),
    own(new THREE.LineBasicMaterial({ color: '#9bcddd', transparent: true, opacity: 0.78 })));
  const targetLine = new THREE.Line(own(new THREE.BufferGeometry()),
    own(new THREE.LineDashedMaterial({ color: '#8ca69c', dashSize: 0.028, gapSize: 0.027, transparent: true, opacity: 0.85 })));
  const projectedLine = new THREE.Line(own(new THREE.BufferGeometry()),
    own(new THREE.LineBasicMaterial({ color: '#ef856e', transparent: true, opacity: 0.95 })));
  scene.add(currentLine, targetLine, projectedLine);

  const craft = new THREE.Group();
  const hull = new THREE.Mesh(own(new THREE.BoxGeometry(0.027, 0.024, 0.042)),
    own(new THREE.MeshBasicMaterial({ color: '#f5d8a2' })));
  const panels = new THREE.Mesh(own(new THREE.BoxGeometry(0.105, 0.003, 0.026)),
    own(new THREE.MeshBasicMaterial({ color: '#8fb5cb' })));
  craft.add(hull, panels);
  scene.add(craft);
  const ghost = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.027)),
    own(new THREE.MeshBasicMaterial({ color: '#f3e2bd', wireframe: true, depthTest: true })));
  ghost.visible = false;
  scene.add(ghost);
  const nodeGeometry = own(new THREE.OctahedronGeometry(0.016));
  const nodeMaterial = own(new THREE.MeshBasicMaterial({ color: '#f68c73' }));
  const nodeGroup = new THREE.Group();
  scene.add(nodeGroup);
  const northLine = new THREE.Line(own(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 1.025, 0), new THREE.Vector3(0, 1.24, 0),
  ])), own(new THREE.LineDashedMaterial({ color: '#7899a7', dashSize: 0.015, gapSize: 0.012 })));
  northLine.computeLineDistances();
  scene.add(northLine);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'apsis-scene-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  host.append(labelLayer);
  const labels: Label[] = [];
  const makeLabel = (text: string, className: string, offset = 0) => {
    const element = document.createElement('span');
    element.className = `apsis-scene-label ${className}`;
    element.textContent = text;
    labelLayer.append(element);
    const label: Label = { element, position: new THREE.Vector3(), offset };
    labels.push(label);
    return label;
  };
  const craftLabel = makeLabel('ODYSSEY / 01', 'apsis-label-craft', 16);
  const ghostLabel = makeLabel('PREDICTION', 'apsis-label-ghost', 14);
  const northLabel = makeLabel('N', 'apsis-label-pole');
  northLabel.position.set(0, 1.29, 0);
  const apoLabel = makeLabel('AP', 'apsis-label-apsis', 10);
  const periLabel = makeLabel('PE', 'apsis-label-apsis', 10);
  let width = 1, height = 1, fitRadius = 1.4, contextLost = false, disposed = false;
  let data: SceneData | undefined;
  const scaleRule = query<HTMLElement>(host, '[data-apsis-scale-rule]');
  const scaleDistance = query<HTMLOutputElement>(host, '[data-apsis-scale-distance]');
  const render = () => {
    if (disposed || contextLost) return;
    renderer.render(scene, camera);
    const pixelsPerKm = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.length() * EARTH_RADIUS);
    const distances = [500, 1000, 2000, 5000, 10000, 20000, 50000];
    const reference = distances.reduce((best, value) => Math.abs(value * pixelsPerKm - 70) < Math.abs(best * pixelsPerKm - 70) ? value : best);
    scaleRule.style.width = `${reference * pixelsPerKm}px`;
    scaleDistance.textContent = reference.toLocaleString('en-US');
    for (const label of labels) {
      const projection = label.position.clone().project(camera);
      const ray = label.position.clone().sub(camera.position);
      const fraction = Math.max(0, Math.min(1, -camera.position.dot(ray) / ray.lengthSq()));
      const occluded = camera.position.clone().addScaledVector(ray, fraction).length() < 0.999;
      const visible = !occluded && projection.z < 1 && projection.x > -0.94 && projection.x < 0.94 && projection.y > -0.92 && projection.y < 0.9;
      label.element.style.visibility = visible ? 'visible' : 'hidden';
      const labelX = (projection.x + 1) / 2 * width + label.offset;
      label.element.style.transform = `translate(${Math.min(labelX, width - label.element.offsetWidth - 10)}px, ${(-projection.y + 1) / 2 * height}px)`;
    }
  };
  const loop = createLoop(render, { paused: true });
  const invalidate = () => loop.requestRender();
  controls.addEventListener('change', invalidate);

  function setLine(line: THREE.Line, points: Vec3[]) {
    const position = line.geometry.getAttribute('position');
    if (position && position.count !== points.length) {
      resources.delete(line.geometry);
      line.geometry.dispose();
      line.geometry = own(new THREE.BufferGeometry());
    }
    line.geometry.setFromPoints(points.map(world));
    line.geometry.computeBoundingSphere();
    if (line === targetLine) line.computeLineDistances();
  }

  function fit(view: CameraView = 'oblique') {
    const portrait = Math.min(camera.aspect, 1);
    const distance = Math.min(controls.maxDistance, Math.max(3.7, fitRadius / Math.sin(THREE.MathUtils.degToRad(37 / 2)) / portrait * 1.12));
    const direction = view === 'north' ? new THREE.Vector3(0, 1, 0.001) :
      view === 'edge' ? new THREE.Vector3(1, 0.035, 1) : new THREE.Vector3(2.6, 1.75, 3.8);
    camera.position.copy(direction.normalize().multiplyScalar(distance));
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    invalidate();
  }

  function update(next: SceneData, refit = false) {
    data = next;
    setLine(currentLine, sampleOrbit(next.live));
    setLine(targetLine, sampleOrbit(next.target));
    setLine(projectedLine, next.projected);
    projectedLine.visible = next.hasPlan;
    craft.position.copy(world(next.live.position));
    craftLabel.position.copy(craft.position);
    craftLabel.element.textContent = next.live.status === 'flying' ? 'ODYSSEY / 01' : next.live.status.toUpperCase();
    if (elements(next.live).kind !== 'radial') {
      const frame = movingFrame(next.live);
      craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), world(frame.prograde).normalize());
    }
    globe.rotation.y = 0.2 + next.live.time / 86164 * Math.PI * 2;
    ghost.visible = next.inspected !== null;
    ghostLabel.element.hidden = next.inspected === null;
    if (next.inspected) {
      ghost.position.copy(world(next.inspected.position));
      ghostLabel.position.copy(ghost.position);
    }
    nodeGroup.clear();
    for (const point of next.burns) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.copy(world(point.position));
      nodeGroup.add(node);
    }
    const orbit = elements(next.live);
    const points = sampleOrbit(next.live, 240);
    if (orbit.eccentricity > 1e-5 && orbit.kind === 'elliptic' && points.length) {
      apoLabel.position.copy(world(points[0]));
      periLabel.position.copy(world(points[Math.floor(points.length / 2)]));
      apoLabel.element.textContent = `AP ${orbit.apoapsis?.toFixed(0)} km`;
      periLabel.element.textContent = `PE ${orbit.periapsis?.toFixed(0)} km`;
      apoLabel.element.hidden = orbit.apoapsis === null || orbit.apoapsis + EARTH_RADIUS > ESCAPE_RADIUS;
      periLabel.element.hidden = orbit.periapsis === null || orbit.periapsis < 0;
    } else {
      apoLabel.element.hidden = true;
      periLabel.element.hidden = true;
    }
    const targetRadius = (elements(next.target).apoapsis ?? 0) / EARTH_RADIUS + 1;
    const liveRadius = (orbit.apoapsis ?? orbit.altitude) / EARTH_RADIUS + 1;
    const predictedRadius = next.hasPlan ? Math.max(0, ...next.projected.map(length)) / EARTH_RADIUS : 0;
    fitRadius = Math.min(ESCAPE_RADIUS / EARTH_RADIUS, Math.max(1.28, targetRadius, liveRadius, predictedRadius));
    if (refit) fit();
    invalidate();
  }

  function inspect(state: State | null) {
    if (!data) return;
    data = { ...data, inspected: state };
    ghost.visible = state !== null;
    ghostLabel.element.hidden = state === null;
    if (state) {
      ghost.position.copy(world(state.position));
      ghostLabel.position.copy(ghost.position);
    }
    invalidate();
  }
  function rotate(azimuth: number, polar = 0) {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    spherical.theta += azimuth;
    spherical.phi = Math.max(0.04, Math.min(Math.PI - 0.04, spherical.phi + polar));
    camera.position.setFromSpherical(spherical);
    controls.update();
    invalidate();
  }
  function zoom(multiplier: number) {
    camera.position.multiplyScalar(Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.length() * multiplier)) / camera.position.length());
    controls.update();
    invalidate();
  }
  canvas.addEventListener('keydown', (event) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotate(-0.12), ArrowRight: () => rotate(0.12),
      ArrowUp: () => rotate(0, -0.12), ArrowDown: () => rotate(0, 0.12),
      '+': () => zoom(0.85), '=': () => zoom(0.85), '-': () => zoom(1.15), Home: () => fit(),
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); action(); }
  }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    report('The WebGL context was lost. Flight paused; your mission state is intact. Waiting for graphics recovery.');
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    report('Graphics restored. Resume the flight when ready.');
    invalidate();
  }, { signal });
  const stopObserving = observeSize(host, (size) => {
    const previousAspect = camera.aspect;
    const first = width === 1;
    width = size.width;
    height = size.height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(size.dpr, 1.35));
    renderer.setSize(width, height, false);
    if (first || Math.abs(previousAspect - camera.aspect) > 0.25) fit();
    invalidate();
  });
  return {
    update, inspect, fit, zoom, rotate, canvas,
    destroy() {
      if (disposed) return;
      disposed = true;
      loop.destroy();
      stopObserving();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      for (const resource of resources) resource.dispose();
      resources.clear();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      labelLayer.remove();
      canvas.remove();
    },
  };
}
