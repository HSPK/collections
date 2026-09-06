import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { observeSize } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { JOINTS, forward } from './arm';
import type { Joints, Pose } from './arm';
import { LINK_RADII, partPose } from './collision';
import type { CollisionWorld } from './collision';
import { destination, source } from './state';

export type ManipulationMode = 'camera' | 'xz' | 'xy' | 'yz' | 'x' | 'y' | 'z';
export interface SceneState {
  joints: Joints; target: Pose; preview: Joints | null; previewSafe: boolean;
  world: CollisionWorld; path: THREE.Vector3[]; frames: boolean;
}
export interface SceneActions {
  beginEdit(): void;
  moveTarget(position: THREE.Vector3): void;
  message(text: string): void;
  contextLost(): void;
}

export function createWorkcell(host: HTMLElement, signal: AbortSignal, actions: SceneActions) {
  const canvas = document.createElement('canvas');
  canvas.className = 'morrow-canvas';
  canvas.tabIndex = 0;
  canvas.dataset.morrowCanvas = '';
  canvas.setAttribute('aria-label', 'Morrow 3D workcell. Camera mode: drag to orbit, scroll to zoom, arrows to orbit, Home to fit. Target mode: drag on the selected plane or axis, arrows to move by 10 mm, Shift for 1 mm. Page Up and Down also move within the selected plane.');
  canvas.setAttribute('role', 'img');
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#202828');
  const camera = new THREE.PerspectiveCamera(37, 1, .02, 30);
  let owner: number | null = null, mode: ManipulationMode = 'camera';
  let dragPoint: THREE.Vector3 | null = null, targetStart: THREE.Vector3 | null = null;
  const dragPlane = new THREE.Plane();
  // Capture-phase ownership also prevents OrbitControls from adopting a second pointer.
  canvas.addEventListener('pointerdown', event => {
    if (owner !== null && owner !== event.pointerId) event.stopImmediatePropagation();
    else if (event.button === 0 && event.isPrimary) owner = event.pointerId;
    else event.stopImmediatePropagation();
  }, { capture: true, signal });
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = 1.8;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = .12;
  controls.maxPolarAngle = Math.PI / 2 - .035;
  controls.rotateSpeed = .65;
  const resources = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(resource: T) => { resources.add(resource); return resource; };
  const material = (color: string, metalness = 0, roughness = .6) =>
    own(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const porcelain = material('#e6e5da', .23, .32);
  const aluminum = material('#a9b1ac', .75, .3);
  const graphite = material('#253132', .4, .42);
  const orange = material('#f17c42', .25, .42);
  const floorMaterial = material('#283132', .25, .77);
  const ghostMaterial = own(new THREE.MeshBasicMaterial({ color: '#eaaa77', transparent: true, opacity: .14, depthWrite: false }));
  const boxGeometry = own(new THREE.BoxGeometry(1, 1, 1));
  function box(parent: THREE.Object3D, size: THREE.Vector3, position: THREE.Vector3, mat: THREE.Material) {
    const mesh = new THREE.Mesh(boxGeometry, mat); mesh.scale.copy(size); mesh.position.copy(position);
    mesh.castShadow = mat !== ghostMaterial; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent: THREE.Object3D, radius: number, length: number, position: THREE.Vector3,
    axis: THREE.Vector3, mat: THREE.Material, segments = 24) {
    const geometry = own(new THREE.CylinderGeometry(radius, radius, length, segments));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    mesh.castShadow = mat !== ghostMaterial; mesh.receiveShadow = mat !== ghostMaterial;
    mesh.position.copy(position); parent.add(mesh); return mesh;
  }
  function line(points: THREE.Vector3[], color: string, parent: THREE.Object3D = scene) {
    const geometry = own(new THREE.BufferGeometry().setFromPoints(points));
    const mesh = new THREE.LineSegments(geometry, own(new THREE.LineBasicMaterial({ color })));
    parent.add(mesh); return mesh;
  }
  function triad(size: number, parent: THREE.Object3D) {
    const group = new THREE.Group();
    [new THREE.Vector3(size, 0, 0), new THREE.Vector3(0, size, 0), new THREE.Vector3(0, 0, size)].forEach((p, i) =>
      line([new THREE.Vector3(), p], ['#ed9975', '#bed29e', '#91becb'][i], group));
    parent.add(group); return group;
  }
  scene.add(new THREE.HemisphereLight('#f9f0da', '#52636d', 2.2));
  const key = new THREE.DirectionalLight('#fff3da', 3.6); key.position.set(1, 4, 2); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .1, far: 8 });
  key.shadow.bias = -.0004; key.shadow.normalBias = .008;
  const rim = new THREE.DirectionalLight('#9ac2cc', 2); rim.position.set(-3, 2, -3); scene.add(rim);
  box(scene, new THREE.Vector3(3.4, .07, 2.8), new THREE.Vector3(0, -.036, 0), floorMaterial);
  const grid: THREE.Vector3[] = [];
  for (let i = -16; i <= 16; i++) {
    grid.push(new THREE.Vector3(i * .1, .001, -1.3), new THREE.Vector3(i * .1, .001, 1.3));
    if (Math.abs(i) <= 13) grid.push(new THREE.Vector3(-1.6, .001, i * .1), new THREE.Vector3(1.6, .001, i * .1));
  }
  line(grid, '#354344');
  const border = [new THREE.Vector3(-1.3, .002, -1.1), new THREE.Vector3(1.3, .002, -1.1),
    new THREE.Vector3(1.3, .002, 1.1), new THREE.Vector3(-1.3, .002, 1.1)];
  line(border.flatMap((p, i) => [p, border[(i + 1) % 4]]), '#62706b');
  const floorAxes = triad(.3, scene); floorAxes.position.set(-.26, .004, .32);
  cylinder(scene, .14, .20, new THREE.Vector3(0, .1, 0), new THREE.Vector3(0, 1, 0), graphite, 48);
  cylinder(scene, .125, .025, new THREE.Vector3(0, .212, 0), new THREE.Vector3(0, 1, 0), aluminum, 48);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    cylinder(scene, .012, .007, new THREE.Vector3(Math.cos(angle) * .108, .204, Math.sin(angle) * .108),
      new THREE.Vector3(0, 1, 0), aluminum, 6);
  }
  function robot(ghost: boolean) {
    const frames: THREE.Group[] = [], triads: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const frame = new THREE.Group();
      const offset = i < 5 ? JOINTS[i + 1].offset : new THREE.Vector3(.14, 0, 0);
      const length = offset.length(), direction = offset.clone().normalize(), radius = LINK_RADII[i];
      const body = ghost ? ghostMaterial : porcelain;
      cylinder(frame, radius * .76, length * .88, offset.clone().multiplyScalar(.5), direction, body);
      cylinder(frame, radius * .87, Math.min(.055, length * .2), offset.clone().multiplyScalar(.19), direction, ghost ? ghostMaterial : aluminum);
      cylinder(frame, radius * .86, .014, offset.clone().multiplyScalar(.8), direction, ghost ? ghostMaterial : orange);
      cylinder(frame, radius * .82, radius * 1.12, new THREE.Vector3(), JOINTS[i].axis, ghost ? ghostMaterial : graphite);
      cylinder(frame, radius * .58, radius * 1.4, new THREE.Vector3(), JOINTS[i].axis, ghost ? ghostMaterial : aluminum);
      cylinder(frame, radius * .31, radius * 1.45, new THREE.Vector3(), JOINTS[i].axis, ghost ? ghostMaterial : porcelain, 12);
      if (!ghost && i > 0 && i < 3) {
        box(frame, new THREE.Vector3(length * .55, .018, .042),
          new THREE.Vector3(length * .5, -radius * .55, 0), graphite);
      }
      if (i === 5) {
        for (const side of [-1, 1]) box(frame, new THREE.Vector3(.056, .012, .014),
          new THREE.Vector3(.13, 0, side * .025), ghost ? ghostMaterial : graphite);
      }
      triads.push(triad(.11, frame));
      scene.add(frame); frames.push(frame);
    }
    return { frames, triads };
  }
  const live = robot(false), preview = robot(true);
  const toolFrame = triad(.13, scene);
  const targetFrame = new THREE.Group(); triad(.22, targetFrame); scene.add(targetFrame);
  const targetRing = new THREE.Mesh(own(new THREE.TorusGeometry(.053, .0035, 8, 40)), orange);
  targetRing.rotation.y = Math.PI / 2; targetFrame.add(targetRing);
  const targetCube = new THREE.LineSegments(own(new THREE.EdgesGeometry(new THREE.BoxGeometry(.07, .07, .07))),
    own(new THREE.LineBasicMaterial({ color: '#eea16f' })));
  targetFrame.add(targetCube);
  const manipulation = new THREE.Group(); scene.add(manipulation);
  const planeGuide = new THREE.Group();
  planeGuide.add(new THREE.Mesh(own(new THREE.PlaneGeometry(.34, .34)),
    own(new THREE.MeshBasicMaterial({ color: '#e9a277', transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide }))));
  const corners = [new THREE.Vector3(-.17, -.17, 0), new THREE.Vector3(.17, -.17, 0),
    new THREE.Vector3(.17, .17, 0), new THREE.Vector3(-.17, .17, 0)];
  line(corners.flatMap((p, i) => [p, corners[(i + 1) % 4]]), '#c58f68', planeGuide);
  const axisGuide = new THREE.Group();
  line([new THREE.Vector3(-.3, 0, 0), new THREE.Vector3(.3, 0, 0)], '#edaa75', axisGuide);
  for (const end of [-.3, .3]) {
    const knob = new THREE.Mesh(own(new THREE.SphereGeometry(.009, 10, 8)), orange);
    knob.position.x = end; axisGuide.add(knob);
  }
  manipulation.add(planeGuide, axisGuide); manipulation.visible = false;
  const receiver = new THREE.Group(); receiver.position.copy(destination.position); receiver.quaternion.copy(destination.orientation);
  receiver.add(new THREE.LineSegments(own(new THREE.EdgesGeometry(new THREE.BoxGeometry(.12, .09, .12))),
    own(new THREE.LineBasicMaterial({ color: '#aabc96', transparent: true, opacity: .75 }))));
  scene.add(receiver);
  const part = new THREE.Group();
  cylinder(part, .025, .07, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), orange, 32);
  cylinder(part, .018, .073, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), aluminum, 24);
  scene.add(part);
  const obstacles = new THREE.Group(); scene.add(obstacles);
  const pathGeometry = own(new THREE.BufferGeometry());
  const pathArray = new Float32Array(2049 * 3);
  pathGeometry.setAttribute('position', new THREE.BufferAttribute(pathArray, 3));
  pathGeometry.setDrawRange(0, 0);
  const pathLine = new THREE.Line(pathGeometry, own(new THREE.LineBasicMaterial({ color: '#ef8e51' })));
  pathLine.frustumCulled = false; scene.add(pathLine);
  const layer = document.createElement('div'); layer.className = 'morrow-scene-labels'; layer.setAttribute('aria-hidden', 'true'); host.append(layer);
  const labels: { element: HTMLElement; position: THREE.Vector3 }[] = [];
  function label(text: string, position: THREE.Vector3, className = '') {
    const element = document.createElement('span'); element.className = `morrow-scene-label ${className}`;
    element.textContent = text; layer.append(element); const entry = { element, position }; labels.push(entry); return entry;
  }
  label('01 / SOURCE', source.position.clone().add(new THREE.Vector3(0, -.12, .14)));
  label('02 / RECEIVER', destination.position.clone().add(new THREE.Vector3(.03, -.19, -.12)));
  label('M-06', new THREE.Vector3(-.08, .27, 0), 'morrow-label-arm');
  const targetLabel = label('TARGET', new THREE.Vector3(), 'morrow-label-target');
  const axisLabels = ['X', 'Y', 'Z'].map(axis => label(axis, new THREE.Vector3(), `morrow-label-axis morrow-label-axis-${axis}`));
  let width = 1, height = 1, disposed = false, lost = false, data: SceneState | null = null, obstacleKey = '';
  function render() {
    if (disposed || lost) return;
    renderer.render(scene, camera);
    canvas.dataset.ready = 'true';
    for (const item of labels) {
      const point = item.position.clone().project(camera);
      item.element.hidden = point.z > 1 || point.z < -1 || Math.abs(point.x) > .95 || Math.abs(point.y) > .93;
      item.element.style.left = `${(point.x * .5 + .5) * width}px`;
      item.element.style.top = `${(-point.y * .5 + .5) * height}px`;
    }
  }
  const loop = createLoop(render, { paused: true });
  const requestRender = () => loop.requestRender();
  controls.addEventListener('change', requestRender);
  function fit() {
    controls.target.set(.38, .4, 0); camera.position.set(2.05, 1.68, 2.05); controls.update(); requestRender();
  }
  fit();
  const stopSize = observeSize(host, size => {
    width = size.width; height = size.height; renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 480 ? 48 : 37;
    camera.updateProjectionMatrix(); requestRender();
  });
  const raycaster = new THREE.Raycaster();
  function planePoint(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2), camera);
    return raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
  }
  function axisVector(axis: string) {
    return new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  }
  canvas.addEventListener('pointerdown', event => {
    if (mode === 'camera' || !data || owner !== event.pointerId) return;
    const normal = mode.length === 2 ? axisVector(mode === 'xz' ? 'y' : mode === 'xy' ? 'z' : 'x') :
      camera.getWorldDirection(new THREE.Vector3());
    if (mode.length === 1) {
      const axis = axisVector(mode); normal.addScaledVector(axis, -normal.dot(axis));
    }
    if (normal.length() < .01) { actions.message('This axis is end-on. Orbit the camera first, or use the keyboard.'); return; }
    dragPlane.setFromNormalAndCoplanarPoint(normal.normalize(), data.target.position);
    dragPoint = planePoint(event);
    if (!dragPoint) { actions.message('This plane is edge-on. Orbit the camera or use the coordinate inspector.'); return; }
    targetStart = data.target.position.clone(); actions.beginEdit();
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); event.preventDefault();
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== owner || !dragPoint || !targetStart || mode === 'camera') return;
    const point = planePoint(event);
    if (!point) return;
    const delta = point.sub(dragPoint);
    if (mode.length === 1) {
      const axis = axisVector(mode); delta.copy(axis.multiplyScalar(delta.dot(axis)));
    }
    actions.moveTarget(targetStart.clone().add(delta));
  }, { signal });
  const endPointer = (event: PointerEvent) => {
    if (event.pointerId !== owner) return;
    owner = null; dragPoint = null; targetStart = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', endPointer, { signal });
  canvas.addEventListener('pointercancel', endPointer, { signal });
  canvas.addEventListener('lostpointercapture', endPointer, { signal });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', '+', '-', '='].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { fit(); return; }
    const positive = ['ArrowRight', 'ArrowUp', 'PageUp', '+', '='].includes(event.key);
    if (mode === 'camera') {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (event.key === '+' || event.key === '=' || event.key === '-') spherical.radius *= positive ? .9 : 1.1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') spherical.theta += positive ? -.12 : .12;
      else spherical.phi += positive ? -.1 : .1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, .12, Math.PI / 2 - .035);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, 1.8, 5.5);
      camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target)); controls.update(); requestRender();
    } else if (data && !['+', '-', '='].includes(event.key)) {
      const coordinate = mode.length === 1 ? mode :
        event.key.startsWith('Page') ? (mode === 'xz' ? 'z' : 'y') :
        ['ArrowLeft', 'ArrowRight'].includes(event.key) ? mode[0] : mode[1];
      const delta = axisVector(coordinate).multiplyScalar((positive ? 1 : -1) * (event.shiftKey ? .001 : .01));
      actions.beginEdit(); actions.moveTarget(data.target.position.clone().add(delta));
    }
  }, { signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; actions.contextLost();
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; actions.message('Graphics restored. Motion remains paused.'); requestRender(); }, { signal });

  return {
    canvas,
    fit,
    setMode(next: ManipulationMode) {
      mode = next; controls.enabled = next === 'camera'; dragPoint = null; targetStart = null;
      manipulation.visible = next !== 'camera';
      planeGuide.visible = next.length === 2; axisGuide.visible = next.length === 1;
      planeGuide.rotation.set(next === 'xz' ? -Math.PI / 2 : 0, next === 'yz' ? Math.PI / 2 : 0, 0);
      if (next.length === 1) axisGuide.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axisVector(next));
      if (owner !== null && canvas.hasPointerCapture(owner)) canvas.releasePointerCapture(owner);
      owner = null; canvas.dataset.mode = next; canvas.style.cursor = next === 'camera' ? 'grab' : 'crosshair'; requestRender();
    },
    update(next: SceneState) {
      data = next;
      const fk = forward(next.joints);
      for (let i = 0; i < 6; i++) {
        live.frames[i].position.copy(fk.frames[i].position); live.frames[i].quaternion.copy(fk.frames[i].orientation);
        live.triads[i].visible = next.frames;
        preview.frames[i].visible = next.preview !== null;
        preview.triads[i].visible = false;
      }
      if (next.preview) {
        const ghost = forward(next.preview);
        ghostMaterial.color.set(next.previewSafe ? '#c6d5ae' : '#e88c65');
        for (let i = 0; i < 6; i++) {
          preview.frames[i].position.copy(ghost.frames[i].position); preview.frames[i].quaternion.copy(ghost.frames[i].orientation);
        }
      }
      toolFrame.position.copy(fk.tool.position); toolFrame.quaternion.copy(fk.tool.orientation);
      targetFrame.position.copy(next.target.position); targetFrame.quaternion.copy(next.target.orientation);
      manipulation.position.copy(next.target.position);
      targetLabel.position.copy(next.target.position).add(new THREE.Vector3(0, .11, 0));
      axisLabels.forEach((item, i) => {
        item.position.set(i === 0 ? .23 : 0, i === 1 ? .23 : 0, i === 2 ? .23 : 0)
          .applyQuaternion(next.target.orientation).add(next.target.position);
      });
      const pose = partPose(next.joints, next.world); part.position.copy(pose.position); part.quaternion.copy(pose.orientation);
      const key = JSON.stringify(next.world.obstacles.map(o => [o.id, o.center.toArray(), o.half.toArray()]));
      if (key !== obstacleKey) {
        obstacles.clear();
        for (const obstacle of next.world.obstacles) {
          const fixture = obstacle.id.includes('fixture');
          box(obstacles, obstacle.half.clone().multiplyScalar(2), obstacle.center, fixture ? graphite : aluminum);
          box(obstacles, new THREE.Vector3(obstacle.half.x * 1.9, .008, obstacle.half.z * 1.9),
            obstacle.center.clone().add(new THREE.Vector3(0, obstacle.half.y - .004, 0)), fixture ? orange : graphite);
        }
        obstacleKey = key;
      }
      const count = Math.min(2049, next.path.length);
      for (let i = 0; i < count; i++) next.path[i].toArray(pathArray, i * 3);
      pathGeometry.attributes.position.needsUpdate = true; pathGeometry.setDrawRange(0, count);
      requestRender();
    },
    destroy() {
      disposed = true; loop.destroy(); stopSize(); controls.removeEventListener('change', requestRender); controls.dispose();
      for (const resource of resources) resource.dispose();
      key.shadow.map?.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); layer.remove();
    },
  };
}
