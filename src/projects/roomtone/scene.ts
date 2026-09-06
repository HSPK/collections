import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLoop } from '../../core/loop';
import { MATERIALS } from './data';
import type { Point, Room } from './data';
import type { ReflectionPath } from './engine';

export type ViewMode = 'cutaway' | 'plan';
export type CameraAction = 'left' | 'right' | 'up' | 'down' | 'closer' | 'further' | 'home';
export interface RoomScene {
  update: (room: Room, paths: ReflectionPath[], selected: ReflectionPath) => void;
  view: (mode: ViewMode) => void;
  camera: (action: CameraAction) => void;
  destroy: () => void;
}
function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  group.clear();
}
export function createRoomScene(host: HTMLElement, report: (message: string) => void): RoomScene {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    host.dataset.renderMode = 'unavailable';
    const message = document.createElement('p');
    message.className = 'roomtone-webgl-message';
    message.textContent = 'The 3D model needs WebGL, which is unavailable here. The editable floorplan, acoustics, and audio still work.';
    host.append(message);
    report(message.textContent);
    return { update() {}, view() {}, camera() {}, destroy() { message.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#e8e9df', 0);
  const canvas = renderer.domElement;
  canvas.className = 'roomtone-canvas';
  canvas.dataset.view = 'cutaway';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Three-dimensional acoustic room. Drag to orbit, arrow keys rotate, plus and minus zoom, Home resets the camera.');
  host.append(canvas);
  host.dataset.renderMode = 'webgl';
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight('#fff7e8', '#3e564f', 2.2));
  const key = new THREE.DirectionalLight('#fff0d8', 2.2);
  key.position.set(5, 10, -4);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#d1e4e4', 1.15);
  fill.position.set(-6, 5, 8);
  scene.add(fill);
  const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minZoom = 0.55;
  controls.maxZoom = 2.1;
  controls.rotateSpeed = 0.6;
  const events = new AbortController();
  let extent = 10;
  let roomHeight = 3.8;
  let mode: ViewMode = 'cutaway';
  let initialized = false;
  let destroyed = false;
  let lost = false;
  const loop = createLoop(() => {
    if (lost) return;
    renderer.render(scene, camera);
    canvas.dataset.camera = camera.position.toArray().map((value) => value.toFixed(2)).join(',');
  }, { paused: true });
  controls.addEventListener('change', loop.requestRender);
  function resize(): void {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const span = extent * 0.79 / Math.min(1.3, aspect);
    camera.left = -span * aspect;
    camera.right = span * aspect;
    camera.top = span;
    camera.bottom = -span;
    camera.updateProjectionMatrix();
    loop.requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function home(): void {
    controls.target.set(0, mode === 'plan' ? 0 : roomHeight * 0.23, 0);
    camera.position.set(mode === 'plan' ? 0 : extent * 1.1, extent * (mode === 'plan' ? 2 : 1), -extent * (mode === 'plan' ? 0.001 : 1.15));
    camera.zoom = 1;
    controls.enableRotate = mode !== 'plan';
    controls.update();
    camera.updateProjectionMatrix();
    loop.requestRender();
  }
  function move(action: CameraAction): void {
    if (action === 'home') { home(); return; }
    if (action === 'closer' || action === 'further') {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (action === 'closer' ? 1.13 : 1 / 1.13), 0.55, 2.1);
    } else if (mode === 'cutaway') {
      const relative = camera.position.clone().sub(controls.target);
      const sphere = new THREE.Spherical().setFromVector3(relative);
      if (action === 'left' || action === 'right') sphere.theta += action === 'left' ? -0.18 : 0.18;
      else sphere.phi = THREE.MathUtils.clamp(sphere.phi + (action === 'up' ? -0.12 : 0.12), 0.1, 1.5);
      camera.position.copy(new THREE.Vector3().setFromSpherical(sphere).add(controls.target));
    }
    controls.update();
    camera.updateProjectionMatrix();
    loop.requestRender();
  }
  canvas.addEventListener('keydown', (event) => {
    const keys: Record<string, CameraAction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'closer', '=': 'closer', '-': 'further', Home: 'home' };
    const action = keys[event.key];
    if (action) { event.preventDefault(); move(action); }
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    host.dataset.renderMode = 'lost';
    report('The 3D graphics context was lost. The floorplan and acoustic controls remain available.');
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    host.dataset.renderMode = 'webgl';
    report('The 3D model is available again.');
    loop.requestRender();
  }, { signal: events.signal });
  function update(room: Room, paths: ReflectionPath[], selected: ReflectionPath): void {
    if (destroyed) return;
    disposeGroup(group);
    const previousExtent = extent;
    extent = Math.max(room.width, room.depth, room.height * 1.5);
    roomHeight = room.height;
    const unit = Math.max(0.7, extent / 10);
    const position = (point: Point) => new THREE.Vector3(point.x - room.width / 2, point.z, point.y - room.depth / 2);
    function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string): THREE.Mesh {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    }
    function line(points: THREE.Vector3[], color: string, opacity = 1): void {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })));
    }
    const thickness = 0.16 * unit;
    box(room.width + thickness * 3, 0.25 * unit, room.depth + thickness * 3, 0, -0.20 * unit, 0, '#e0d8c6');
    box(room.width, 0.12 * unit, room.depth, 0, -0.06 * unit, 0, MATERIALS[room.materials.floor].color);
    box(thickness, room.height, room.depth + thickness, -room.width / 2 - thickness / 2, room.height / 2, 0, MATERIALS[room.materials.west].color);
    box(room.width + thickness * 2, room.height, thickness, 0, room.height / 2, room.depth / 2 + thickness / 2, MATERIALS[room.materials.north].color);
    box(thickness, 0.22 * unit, room.depth + thickness, room.width / 2 + thickness / 2, 0.07 * unit, 0, MATERIALS[room.materials.east].color);
    box(room.width + thickness * 2, 0.22 * unit, thickness, 0, 0.07 * unit, -room.depth / 2 - thickness / 2, MATERIALS[room.materials.south].color);
    // Surface marks describe the assigned lining, not decorative furniture.
    for (const wall of ['west', 'north'] as const) {
      const length = wall === 'west' ? room.depth : room.width;
      const material = room.materials[wall];
      const panels = Math.min(28, Math.ceil(length / (material === 'timber' ? 0.38 : 1.2)));
      for (let i = 1; i < panels; i++) {
        const coordinate = -length / 2 + i * length / panels;
        const color = material === 'absorber' ? '#314f48' : '#827963';
        if (wall === 'west') {
          line([new THREE.Vector3(-room.width / 2 + 0.015, 0, coordinate), new THREE.Vector3(-room.width / 2 + 0.015, room.height, coordinate)], color, 0.38);
        } else {
          line([new THREE.Vector3(coordinate, 0, room.depth / 2 - 0.015), new THREE.Vector3(coordinate, room.height, room.depth / 2 - 0.015)], color, 0.38);
        }
      }
      if (material === 'stone' || material === 'absorber') {
        for (let i = 1; i < Math.min(12, Math.ceil(room.height / 0.65)); i++) {
          const h = i * 0.65;
          line(wall === 'west'
            ? [new THREE.Vector3(-room.width / 2 + 0.02, h, -room.depth / 2), new THREE.Vector3(-room.width / 2 + 0.02, h, room.depth / 2)]
            : [new THREE.Vector3(-room.width / 2, h, room.depth / 2 - 0.02), new THREE.Vector3(room.width / 2, h, room.depth / 2 - 0.02)], '#72796b', 0.38);
        }
      }
    }
    for (let x = 1; x < room.width; x++) {
      line([new THREE.Vector3(x - room.width / 2, 0.025, -room.depth / 2), new THREE.Vector3(x - room.width / 2, 0.025, room.depth / 2)], '#e7e1cc', 0.5);
    }
    for (let y = 1; y < room.depth; y++) {
      line([new THREE.Vector3(-room.width / 2, 0.025, y - room.depth / 2), new THREE.Vector3(room.width / 2, 0.025, y - room.depth / 2)], '#e7e1cc', 0.5);
    }
    const ceiling = [
      new THREE.Vector3(-room.width / 2, room.height, -room.depth / 2),
      new THREE.Vector3(room.width / 2, room.height, -room.depth / 2),
      new THREE.Vector3(room.width / 2, room.height, room.depth / 2),
    ];
    const ceilingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ceiling),
      new THREE.LineDashedMaterial({ color: '#526d61', dashSize: 0.16 * unit, gapSize: 0.12 * unit, transparent: true, opacity: 0.5 }));
    ceilingLine.computeLineDistances();
    group.add(ceilingLine);
    for (const name of ['source', 'listener'] as const) {
      const p = position(room[name]);
      const color = name === 'source' ? '#b55631' : '#173f38';
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * unit, 0.04 * unit, room[name].z, 8), new THREE.MeshStandardMaterial({ color }));
      stand.position.set(p.x, room[name].z / 2, p.z);
      group.add(stand);
      const marker = new THREE.Mesh(
        name === 'source' ? new THREE.IcosahedronGeometry(0.17 * unit, 1) : new THREE.SphereGeometry(0.16 * unit, 16, 10),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
      );
      marker.position.copy(p);
      group.add(marker);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 * unit, 0.023 * unit, 6, 40), new THREE.MeshBasicMaterial({ color }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.04, p.z);
      group.add(ring);
    }
    for (const path of paths.filter((path) => path.order <= 1 && path.id !== selected.id)) {
      line(path.points.map(position), path.order === 0 ? '#254b41' : '#466960', path.order === 0 ? 0.8 : 0.22);
    }
    for (let i = 1; i < selected.points.length; i++) {
      const start = position(selected.points[i - 1]);
      const end = position(selected.points[i]);
      if (start.distanceTo(end) < 1e-8) continue;
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.017 * unit, 0.017 * unit, start.distanceTo(end), 6),
        new THREE.MeshBasicMaterial({ color: '#a54e2d' }),
      );
      tube.position.copy(start).add(end).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
      group.add(tube);
    }
    for (const bounce of selected.bounces) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.073 * unit, 10, 8), new THREE.MeshBasicMaterial({ color: '#cc6439' }));
      marker.position.copy(position(bounce.point));
      group.add(marker);
    }
    canvas.dataset.selectedPath = selected.id;
    canvas.dataset.pathVertices = String(selected.points.length);
    canvas.dataset.pathCount = String(paths.length);
    if (!initialized || Math.abs(previousExtent - extent) > 2) home();
    initialized = true;
    resize();
  }
  return {
    update,
    view(next) { mode = next; canvas.dataset.view = next; home(); },
    camera: move,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      events.abort();
      observer.disconnect();
      controls.removeEventListener('change', loop.requestRender);
      controls.dispose();
      loop.destroy();
      disposeGroup(group);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
