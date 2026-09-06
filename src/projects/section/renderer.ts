import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLoop } from '../../core/loop';
import { compilePrimitive, corners, planeBasis, primitiveBounds } from './fields';
import type { Document, Primitive, Vec3 } from './model';
import type { MeshResult } from './mesh';
import type { SliceResult } from './slice';

export interface ViewCallbacks {
  select: (id: string) => void;
  beginPlane: () => void;
  movePlane: (delta: number) => void;
  endPlane: (cancel: boolean) => void;
  report: (message: string) => void;
}

export function createSolidView(host: HTMLElement, callbacks: ViewCallbacks) {
  const events = new AbortController(), signal = events.signal;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Solid view. Arrow keys orbit; plus and minus zoom. In Move cut mode, arrow keys move the section plane.');
  canvas.tabIndex = 0;
  host.append(canvas);
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (cause) { canvas.remove(); throw new Error('SECTION needs WebGL 2 for its solid view. Enable hardware acceleration or use a WebGL-capable browser.', { cause }); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xf0eee5, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-65, 65, 65, -65, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(115, -160, 110);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minZoom = 0.3; controls.maxZoom = 6;
  controls.target.set(0, 0, 5);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xf9f9ff, 0x565449, 2.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 3.2); key.position.set(-80, -100, 150); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8dcff, 2.0); rim.position.set(80, 30, 80); scene.add(rim);
  const material = new THREE.MeshStandardMaterial({ color: 0xe6d8bd, roughness: 0.38, metalness: 0.06, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);
  const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x2a58d3, opacity: 0.115, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMaterial);
  plane.renderOrder = 1; scene.add(plane);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1b4aca, transparent: true, opacity: 0.75, depthTest: false });
  const planeOutline = new THREE.LineLoop(new THREE.BufferGeometry(), lineMaterial);
  planeOutline.renderOrder = 3; scene.add(planeOutline);
  const sectionLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x1249db, depthTest: false }));
  sectionLines.renderOrder = 4; scene.add(sectionLines);
  const capMaterial = new THREE.MeshBasicMaterial({ color: 0x4674dd, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const sectionCap = new THREE.Mesh(new THREE.BufferGeometry(), capMaterial);
  sectionCap.renderOrder = 2; scene.add(sectionCap);
  const selected = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x6a6f70, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.65 }));
  selected.visible = false; scene.add(selected);
  const grid = new THREE.GridHelper(240, 24, 0xaaa89c, 0xd2cfc3);
  grid.rotation.x = Math.PI / 2; grid.position.z = -35; scene.add(grid);
  const axis = new THREE.AxesHelper(15); axis.position.set(-48, -40, -35); scene.add(axis);
  let model: Document | null = null, selection: Primitive | undefined, mode: 'view' | 'plane' = 'view';
  let clipping = false, extent = 130, pointer: { id: number; x: number; y: number; moved: boolean } | null = null;
  let lost = false;
  const loop = createLoop(() => { if (!lost) renderer.render(scene, camera); }, { paused: true });
  controls.addEventListener('change', loop.requestRender);
  const observer = new ResizeObserver(() => {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.left = -extent * width / height / 2; camera.right = -camera.left;
    camera.top = extent / 2; camera.bottom = -camera.top;
    camera.updateProjectionMatrix(); loop.requestRender();
  });
  observer.observe(host);

  function frameModel(bounds: MeshResult['bounds']) {
    if (!bounds) return;
    const center = new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(0.5);
    const size = new THREE.Vector3(...bounds.max).sub(new THREE.Vector3(...bounds.min));
    extent = Math.max(70, size.length() * 1.03);
    const aspect = Math.max(0.35, host.clientWidth / Math.max(1, host.clientHeight));
    if (aspect < 1) extent /= Math.sqrt(aspect);
    camera.position.copy(center).add(new THREE.Vector3(1.05, -1.5, 1).normalize().multiplyScalar(250));
    controls.target.copy(center); camera.zoom = 1; controls.update();
    camera.left = -extent * aspect / 2; camera.right = -camera.left; camera.top = extent / 2; camera.bottom = -camera.top; camera.updateProjectionMatrix();
    grid.position.z = bounds.min[2] - 0.7;
    axis.position.set(bounds.min[0] - 15, bounds.min[1] - 10, bounds.min[2]);
    loop.requestRender();
  }

  function updatePlane() {
    if (!model) return;
    const { u, v, normal } = planeBasis(model.plane);
    const patchCenter = controls.target.clone().addScaledVector(new THREE.Vector3(...normal), model.plane.offset - controls.target.dot(new THREE.Vector3(...normal)));
    const rotation = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(...v), new THREE.Vector3(...normal));
    plane.quaternion.setFromRotationMatrix(rotation); plane.position.copy(patchCenter);
    const width = Math.max(95, extent * 0.82);
    plane.scale.set(width, width, 1);
    const vertices = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => patchCenter.clone().addScaledVector(new THREE.Vector3(...u), a * width / 2).addScaledVector(new THREE.Vector3(...v), b * width / 2));
    planeOutline.geometry.dispose(); planeOutline.geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    material.clippingPlanes = clipping ? [new THREE.Plane(new THREE.Vector3(...normal).negate(), model.plane.offset)] : [];
    capMaterial.opacity = clipping ? 0.8 : 0.38;
    renderer.localClippingEnabled = clipping;
    loop.requestRender();
  }
  function highlight(item?: Primitive) {
    selection = item; selected.visible = !!item;
    if (item) {
      const bounds = primitiveBounds(item), points = corners(bounds), lines: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) lines.push(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i | bit]));
      selected.geometry.dispose(); selected.geometry = new THREE.BufferGeometry().setFromPoints(lines); selected.computeLineDistances();
    }
    loop.requestRender();
  }
  function update(next: Document, solid: MeshResult | null, section: SliceResult, fit: boolean) {
    model = next;
    if (solid) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute('position', new THREE.BufferAttribute(solid.positions, 3));
      mesh.geometry.setAttribute('normal', new THREE.BufferAttribute(solid.normals, 3));
      mesh.geometry.computeBoundingSphere();
      if (fit) frameModel(solid.bounds);
    }
    const frame = planeBasis(next.plane), lines: THREE.Vector3[] = [];
    const shapes = section.open ? [] : section.contours.flatMap((contour, index) => {
      if (!contour.closed || contour.hole) return [];
      const shape = new THREE.Shape(contour.points.map(([u, v]) => new THREE.Vector2(u, v)));
      shape.holes = section.contours.filter((hole) => hole.hole && hole.closed && hole.parent === index)
        .map((hole) => new THREE.Path(hole.points.map(([u, v]) => new THREE.Vector2(u, v))));
      return [shape];
    });
    sectionCap.geometry.dispose(); sectionCap.geometry = new THREE.ShapeGeometry(shapes);
    sectionCap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal)));
    sectionCap.position.set(...frame.origin);
    const toWorld = (p: [number, number]) => new THREE.Vector3(...frame.origin).addScaledVector(new THREE.Vector3(...frame.u), p[0]).addScaledVector(new THREE.Vector3(...frame.v), p[1]);
    for (const contour of section.contours) for (let i = 1; i < contour.points.length; i++) lines.push(toWorld(contour.points[i - 1]), toWorld(contour.points[i]));
    sectionLines.geometry.dispose(); sectionLines.geometry = new THREE.BufferGeometry().setFromPoints(lines);
    highlight(next.primitives.find((item) => item.id === selection?.id)); updatePlane();
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) {
      event.stopImmediatePropagation(); event.preventDefault(); return;
    }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (mode === 'plane') {
      event.stopImmediatePropagation(); canvas.setPointerCapture(event.pointerId); callbacks.beginPlane(); canvas.focus({ preventScroll: true });
    }
  }, { capture: true, signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) pointer.moved = true;
    if (mode === 'plane') {
      event.stopImmediatePropagation();
      const millimetersPerPixel = extent / camera.zoom / Math.max(1, canvas.getBoundingClientRect().height);
      callbacks.movePlane((pointer.y - event.clientY) * millimetersPerPixel);
    }
  }, { capture: true, signal });
  function release(event: PointerEvent, cancel: boolean) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const moved = pointer.moved;
    pointer = null;
    if (mode === 'plane') {
      callbacks.endPlane(cancel);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } else if (!cancel && !moved && model) {
      const rectangle = canvas.getBoundingClientRect(), raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rectangle.left) / rectangle.width * 2 - 1, -(event.clientY - rectangle.top) / rectangle.height * 2 + 1), camera);
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit) {
        const point: Vec3 = [hit.point.x, hit.point.y, hit.point.z];
        const nearest = [...model.primitives].sort((a, b) => Math.abs(compilePrimitive(a)(point)) - Math.abs(compilePrimitive(b)(point)))[0];
        if (nearest) callbacks.select(nearest.id);
      }
    }
  }
  canvas.addEventListener('pointerup', (event) => release(event, false), { signal });
  canvas.addEventListener('pointercancel', (event) => release(event, true), { signal });
  canvas.addEventListener('lostpointercapture', (event) => release(event, true), { signal });
  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pointer && mode === 'plane') {
      const id = pointer.id; pointer = null; callbacks.endPlane(true);
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      return;
    }
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault(); zoom(event.key === '-' ? 0.85 : 1.15); return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (mode === 'plane') {
      callbacks.beginPlane(); callbacks.movePlane((event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 5 : 1)); callbacks.endPlane(false);
    } else {
      const position = camera.position.clone().sub(controls.target);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') position.applyAxisAngle(new THREE.Vector3(0, 0, 1), event.key === 'ArrowLeft' ? -0.12 : 0.12);
      else position.applyAxisAngle(new THREE.Vector3().crossVectors(position, camera.up).normalize(), event.key === 'ArrowUp' ? 0.1 : -0.1);
      camera.position.copy(controls.target).add(position); controls.update(); loop.requestRender();
    }
  }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); lost = true; callbacks.report('The WebGL context was lost. JSON and SVG remain available; reopen SECTION to restore the solid view.');
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; loop.requestRender(); callbacks.report('Solid view restored.'); }, { signal });
  function zoom(factor: number) { camera.zoom = Math.min(6, Math.max(0.3, camera.zoom * factor)); camera.updateProjectionMatrix(); loop.requestRender(); }
  return {
    update, highlight, frameModel, zoom,
    previewPlane(next: Document) { model = next; updatePlane(); sectionLines.visible = false; sectionCap.visible = false; },
    busy(value: boolean) { mesh.visible = !value; sectionLines.visible = !value; sectionCap.visible = !value; },
    mode(value: 'view' | 'plane') {
      if (pointer && mode === 'plane') {
        const id = pointer.id; pointer = null; callbacks.endPlane(true);
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
      mode = value; controls.enabled = value === 'view'; canvas.style.cursor = value === 'view' ? 'grab' : 'ns-resize';
    },
    clipping(value: boolean) { clipping = value; updatePlane(); },
    destroy() {
      events.abort(); observer.disconnect(); loop.destroy(); controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          for (const item of Array.isArray(object.material) ? object.material : [object.material]) item.dispose();
        }
      });
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
