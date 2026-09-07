import * as THREE from 'three';
import { createLoop } from '../../core/loop';
import { displaced, extrema, forceColor, memberValue } from './diagrams';
import type { DrawingOptions } from './diagrams';
import { assemble } from './solver';
import type { Analysis } from './solver';
import type { Selection, Structure, Vector3 } from './schema';
import { matchAnalysis } from './result-lookup';

export type PlaneMode = 'inspect' | 'XZ' | 'XY' | 'YZ';
export type CameraView = 'orbit' | 'plan' | 'front';
export interface SceneOptions extends DrawingOptions { reactions: boolean; selection: Selection; plane: PlaneMode }
export interface StructureScene {
  ready: Promise<boolean>;
  update(model: Structure, result: Analysis, options: SceneOptions): void;
  view(mode: CameraView): void;
  camera(action: 'home' | 'left' | 'right' | 'up' | 'down' | 'in' | 'out'): void;
  destroy(): void;
}
export function createStructureScene(
  host: HTMLElement,
  pick: (selection: Selection) => void,
  move: (node: string, position: Vector3) => void,
  report: (message: string) => void,
  viewChanged: (mode: CameraView) => void,
): StructureScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'lp-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Editable 3D truss. Click a joint or bar to inspect. Drag empty space to orbit. Arrow keys orbit, plus and minus zoom, Home fits. Numeric editing is in the Edit pane.');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#edf2f5', 0);
  host.append(canvas);
  const labels = document.createElement('div');
  labels.className = 'lp-scene-labels';
  host.append(labels);
  const scene = new THREE.Scene();
  const geometry = new THREE.Group();
  scene.add(geometry);
  scene.add(new THREE.HemisphereLight('#ffffff', '#677780', 2.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.8);
  key.position.set(5, 14, 7);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.01, 2000);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const shared = new Set<THREE.BufferGeometry>([cylinder, sphere, cone, box]);
  const materials = new Set<THREE.Material>();
  const events = new AbortController();
  let model: Structure | null = null;
  let analysis: Analysis | null = null;
  let options: SceneOptions | null = null;
  let mode: CameraView = 'orbit';
  let theta = 0.7, phi = 0.96, zoom = 1, halfSpan = 7;
  let extent = 12;
  const target = new THREE.Vector3();
  let initial = true, disposed = false, lost = false;
  let rendered = 0;
  let resolveReady: (ready: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  let owner: { id: number; x: number; y: number; lastX: number; lastY: number; dragged: boolean; moving: string | null; plane: THREE.Plane | null; candidate: Vector3 | null } | null = null;
  let preview: THREE.Mesh | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const markers = new Map<string, HTMLElement>();
  const loop = createLoop(() => {
    if (lost || disposed || !model || !analysis || !options || host.clientWidth < 1 || host.clientHeight < 1) return;
    renderer.render(scene, camera);
    positionLabels();
    rendered++;
    canvas.dataset.frames = String(rendered);
    canvas.dataset.camera = `${theta.toFixed(3)},${phi.toFixed(3)},${zoom.toFixed(3)},${mode}`;
    host.dataset.ready = 'true';
    resolveReady(true);
  }, { paused: true });
  function clearGeometry(): void {
    geometry.traverse((object) => {
      if ((object instanceof THREE.Mesh || object instanceof THREE.Line) && !shared.has(object.geometry)) object.geometry.dispose();
    });
    geometry.clear();
    for (const material of materials) material.dispose();
    materials.clear();
    preview = null;
  }
  function material(color: string, opacity = 1): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.44, metalness: 0.25, transparent: opacity < 1, opacity });
    materials.add(m);
    return m;
  }
  function mesh(shape: THREE.BufferGeometry, mat: THREE.Material, point: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
    const result = new THREE.Mesh(shape, mat);
    result.position.copy(point);
    result.scale.copy(size);
    geometry.add(result);
    return result;
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): void {
    const delta = b.clone().sub(a);
    if (delta.length() < 1e-12) return;
    const body = mesh(cylinder, mat, a.clone().add(b).multiplyScalar(0.5), new THREE.Vector3(radius, delta.length(), radius));
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  }
  function line(a: THREE.Vector3, b: THREE.Vector3, color: string, dashed = false): void {
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: extent / 80, gapSize: extent / 100 }) : new THREE.LineBasicMaterial({ color });
    materials.add(mat);
    const object = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
    if (dashed) object.computeLineDistances();
    geometry.add(object);
  }
  function arrow(point: THREE.Vector3, force: Vector3, maximum: number, color: string, isReaction = false): void {
    const vector = new THREE.Vector3(...force);
    const amount = vector.length();
    if (amount < 1e-6 || maximum <= 0) return;
    const unit = extent / 12;
    vector.normalize();
    const span = (0.5 + 1.5 * amount / maximum) * unit;
    const tip = isReaction ? point.clone().addScaledVector(vector, span) : point.clone().addScaledVector(vector, -0.08 * unit);
    const start = isReaction ? point : tip.clone().addScaledVector(vector, -span);
    const mat = material(color);
    const headLength = 0.24 * unit;
    rod(start, tip.clone().addScaledVector(vector, -headLength), 0.024 * unit, mat);
    const head = mesh(cone, mat, tip.clone().addScaledVector(vector, -headLength / 2), new THREE.Vector3(0.10 * unit, headLength, 0.10 * unit));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector);
  }
  function positionLabels(): void {
    if (!model || !analysis || !options) return;
    const width = host.clientWidth, height = host.clientHeight;
    const factor = options.deformed && analysis.status === 'stable' ? options.amplification : 0;
    for (const node of model.nodes) {
      const element = markers.get(node.id);
      if (!element) continue;
      const p = new THREE.Vector3(...displaced(node, analysis, factor)).project(camera);
      element.style.left = `${(p.x + 1) / 2 * width}px`;
      element.style.top = `${(1 - p.y) / 2 * height}px`;
      element.hidden = Math.abs(p.x) > 1.08 || Math.abs(p.y) > 1.08;
    }
  }
  function orientation(): void {
    const radius = Math.max(50, extent * 4);
    const offset = mode === 'plan' ? new THREE.Vector3(0, radius, 0.00001) : mode === 'front' ? new THREE.Vector3(0, 0, radius) : new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta));
    camera.position.copy(target).add(offset);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function resize(): void {
    const { width, height } = host.getBoundingClientRect();
    if (disposed || width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const span = halfSpan / Math.min(1, aspect) / zoom;
    camera.left = -span * aspect; camera.right = span * aspect;
    camera.top = span; camera.bottom = -span;
    camera.updateProjectionMatrix();
    loop.requestRender();
  }
  function home(): void {
    if (!model) return;
    const bounds = new THREE.Box3().setFromPoints(model.nodes.map((node) => new THREE.Vector3(...node.position)));
    bounds.getCenter(target);
    zoom = 1; theta = 0.7; phi = 0.96;
    orientation();
    let x = 0, y = 0;
    for (const node of model.nodes) {
      const v = new THREE.Vector3(...node.position).applyMatrix4(camera.matrixWorldInverse);
      x = Math.max(x, Math.abs(v.x)); y = Math.max(y, Math.abs(v.y));
    }
    const aspect = host.clientWidth > 0 && host.clientHeight > 0
      ? host.clientWidth / host.clientHeight
      : (camera.right - camera.left) / (camera.top - camera.bottom);
    halfSpan = Math.max(x / Math.max(1, aspect), y * Math.min(1, aspect), extent * 0.2) * 1.26 + extent * 0.05;
    resize();
  }
  function cameraAction(action: 'home' | 'left' | 'right' | 'up' | 'down' | 'in' | 'out'): void {
    if (action === 'home') { home(); return; }
    if (action === 'in' || action === 'out') zoom = THREE.MathUtils.clamp(zoom * (action === 'in' ? 1.2 : 1 / 1.2), 0.4, 4);
    else { mode = 'orbit'; viewChanged(mode); theta += action === 'left' ? -0.2 : action === 'right' ? 0.2 : 0; phi = THREE.MathUtils.clamp(phi + (action === 'up' ? -0.15 : action === 'down' ? 0.15 : 0), 0.05, Math.PI - 0.05); }
    orientation(); resize();
  }
  function hitTest(x: number, y: number, touch: boolean): Selection | null {
    if (!model || !analysis || !options) return null;
    const rect = canvas.getBoundingClientRect();
    const px = x - rect.left, py = y - rect.top;
    const factor = options.deformed && analysis.status === 'stable' ? options.amplification : 0;
    const screen = (id: string): THREE.Vector2 => {
      const node = model!.nodes.find((n) => n.id === id)!;
      const p = new THREE.Vector3(...displaced(node, analysis!, factor)).project(camera);
      return new THREE.Vector2((p.x + 1) * rect.width / 2, (1 - p.y) * rect.height / 2);
    };
    const p = new THREE.Vector2(px, py);
    let distance = touch ? 24 : 16;
    let hit: Selection | null = null;
    for (const node of model.nodes) {
      const d = p.distanceTo(screen(node.id));
      if (d < distance) { distance = d; hit = { kind: 'node', id: node.id }; }
    }
    if (hit) return hit;
    distance = touch ? 14 : 8;
    for (const bar of model.members) {
      const a = screen(bar.a), b = screen(bar.b), ab = b.clone().sub(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0, 1);
      const d = p.distanceTo(a.addScaledVector(ab, t));
      if (d < distance) { distance = d; hit = { kind: 'member', id: bar.id }; }
    }
    return hit;
  }
  function onDown(event: PointerEvent): void {
    if (owner || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const hit = hitTest(event.clientX, event.clientY, event.pointerType !== 'mouse');
    let plane: THREE.Plane | null = null;
    let moving: string | null = null;
    if (options?.plane !== 'inspect' && hit?.kind === 'node' && model && options && !options.deformed) {
      const node = model.nodes.find((node) => node.id === hit.id)!;
      const normal = options.plane === 'XZ' ? new THREE.Vector3(0, 1, 0) : options.plane === 'XY' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...node.position));
      moving = node.id;
      pick(hit);
    }
    owner = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, dragged: false, moving, plane, candidate: null };
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.pointerOwner = String(event.pointerId);
  }
  function onMove(event: PointerEvent): void {
    if (!owner || owner.id !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - owner.x, event.clientY - owner.y) > 4) owner.dragged = true;
    if (owner.moving && owner.plane) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.intersectPlane(owner.plane, new THREE.Vector3());
      if (point && Math.abs(raycaster.ray.direction.dot(owner.plane.normal)) > 0.08) {
        owner.candidate = [Number(point.x.toFixed(3)), Number(point.y.toFixed(3)), Number(point.z.toFixed(3))];
        if (!preview) preview = mesh(sphere, material('#d29b2b', 0.8), point, new THREE.Vector3().setScalar(extent * 0.012));
        preview.position.copy(point);
        report(`Moving ${owner.moving} in ${options?.plane}: ${owner.candidate.join(', ')} m. Release to apply; Escape cancels.`);
      } else {
        owner.candidate = null;
        report('This plane is edge-on. Orbit the view or use the numeric coordinate controls.');
      }
    } else if (owner.dragged) {
      mode = 'orbit';
      viewChanged(mode);
      theta -= (event.clientX - owner.lastX) * 0.006;
      phi = THREE.MathUtils.clamp(phi - (event.clientY - owner.lastY) * 0.006, 0.05, Math.PI - 0.05);
      orientation();
    }
    owner.lastX = event.clientX; owner.lastY = event.clientY;
    loop.requestRender();
  }
  function release(event?: PointerEvent, cancel = false): void {
    if (!owner || (event && event.pointerId !== owner.id)) return;
    const ended = owner;
    owner = null;
    if (canvas.hasPointerCapture(ended.id)) canvas.releasePointerCapture(ended.id);
    delete canvas.dataset.pointerOwner;
    if (preview) {
      geometry.remove(preview);
      const owned = Array.isArray(preview.material) ? preview.material : [preview.material];
      for (const mat of owned) { mat.dispose(); materials.delete(mat); }
      preview = null;
      loop.requestRender();
    }
    if (cancel) { report('Pointer edit cancelled. The committed structure is unchanged.'); return; }
    if (ended.moving && ended.candidate && ended.dragged) move(ended.moving, ended.candidate);
    else if (!ended.dragged && event) {
      const hit = hitTest(event.clientX, event.clientY, event.pointerType !== 'mouse');
      if (hit) pick(hit);
    }
  }
  canvas.addEventListener('pointerdown', onDown, { signal: events.signal });
  canvas.addEventListener('pointermove', onMove, { signal: events.signal });
  canvas.addEventListener('pointerup', (e) => release(e), { signal: events.signal });
  canvas.addEventListener('pointercancel', (e) => release(e, true), { signal: events.signal });
  canvas.addEventListener('lostpointercapture', (e) => release(e, true), { signal: events.signal });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); if (!owner) cameraAction(event.deltaY < 0 ? 'in' : 'out'); }, { passive: false, signal: events.signal });
  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { release(undefined, true); return; }
    const keys: Record<string, Parameters<typeof cameraAction>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', Home: 'home' };
    if (keys[event.key]) { event.preventDefault(); cameraAction(keys[event.key]); }
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); lost = true; host.dataset.ready = 'false'; report('WebGL context lost. Numeric controls and results remain available; waiting for graphics recovery.'); }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; loop.requestRender(); report('The spatial view has recovered.'); }, { signal: events.signal });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function update(next: Structure, result: Analysis, settings: SceneOptions): void {
    if (disposed) return;
    const matches = result.status === 'stable' ? matchAnalysis(next, result) : null;
    if (owner) release(undefined, true);
    model = next; analysis = result; options = settings;
    clearGeometry();
    labels.replaceChildren(); markers.clear();
    const bounds = new THREE.Box3().setFromPoints(model.nodes.map((node) => new THREE.Vector3(...node.position)));
    const size = bounds.getSize(new THREE.Vector3());
    extent = Math.max(3, size.x, size.y, size.z);
    const unit = extent / 12;
    const factor = settings.deformed && result.status === 'stable' ? settings.amplification : 0;
    const [negative, positive] = extrema(result, settings.color);
    const maximum = Math.max(-negative, positive);
    const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
    const jointMaterial = material('#456073');
    const supportMaterial = material('#233e51');
    const chosenMaterial = material('#f1b83f');
    const planeY = bounds.min.y - unit * 0.25;
    const center = bounds.getCenter(new THREE.Vector3());
    for (let i = -8; i <= 8; i++) {
      const spacing = extent / 10;
      line(new THREE.Vector3(center.x + i * spacing, planeY, center.z - spacing * 8), new THREE.Vector3(center.x + i * spacing, planeY, center.z + spacing * 8), i === 0 ? '#bbcbd3' : '#d5e0e5');
      line(new THREE.Vector3(center.x - spacing * 8, planeY, center.z + i * spacing), new THREE.Vector3(center.x + spacing * 8, planeY, center.z + i * spacing), i === 0 ? '#bbcbd3' : '#d5e0e5');
    }
    model.members.forEach((bar) => {
      const a = nodeMap.get(bar.a)!, b = nodeMap.get(bar.b)!;
      const selected = settings.selection.kind === 'member' && settings.selection.id === bar.id;
      const color = matches ? forceColor(memberValue(matches.members.get(bar.id), settings.color), maximum) : '#939b9f';
      const section = next.sections.find((section) => section.id === bar.section)!;
      const radius = Math.max(unit * 0.018, Math.sqrt(section.area / Math.PI));
      const ap = new THREE.Vector3(...displaced(a, result, factor)), bp = new THREE.Vector3(...displaced(b, result, factor));
      if (factor) line(new THREE.Vector3(...a.position), new THREE.Vector3(...b.position), '#83919c', true);
      if (selected) rod(ap, bp, radius + unit * 0.035, material('#edb846', 0.45));
      rod(ap, bp, radius, material(color));
    });
    const assembly = assemble(model);
    const maxLoad = Math.max(...model.nodes.map((_, i) => Math.hypot(assembly.loads[i * 3], assembly.loads[i * 3 + 1], assembly.loads[i * 3 + 2])));
    const maxReaction = result.status === 'stable' ? Math.max(...result.nodes.map((node) => Math.hypot(...node.reaction))) : 0;
    model.nodes.forEach((node, i) => {
      const p = new THREE.Vector3(...displaced(node, result, factor));
      const selected = settings.selection.kind === 'node' && settings.selection.id === node.id;
      mesh(sphere, selected ? chosenMaterial : jointMaterial, p, new THREE.Vector3().setScalar(unit * (selected ? 0.10 : 0.055)));
      const restrained = node.restraints.some(Boolean);
      if (restrained) {
        mesh(cone, supportMaterial, p.clone().add(new THREE.Vector3(0, -0.16 * unit, 0)), new THREE.Vector3(0.20 * unit, 0.28 * unit, 0.20 * unit));
        mesh(box, supportMaterial, p.clone().add(new THREE.Vector3(0, -0.32 * unit, 0)), new THREE.Vector3(0.52 * unit, 0.04 * unit, 0.44 * unit));
        for (let axis = 0; axis < 3; axis++) if (node.restraints[axis]) {
          const end = p.clone(); end.setComponent(axis, end.getComponent(axis) + 0.35 * unit);
          line(p, end, ['#bd4933', '#3b786e', '#315cbe'][axis]);
        }
      }
      const label = document.createElement('span');
      label.className = `lp-node-marker${selected ? ' is-selected' : ''}${restrained ? ' is-support' : ''}`;
      label.dataset.lpNode = node.id;
      label.textContent = node.id;
      labels.append(label); markers.set(node.id, label);
      const f: Vector3 = [assembly.loads[3 * i], assembly.loads[3 * i + 1], assembly.loads[3 * i + 2]];
      arrow(new THREE.Vector3(...node.position), f, maxLoad, '#cc432b');
      if (settings.reactions && matches && restrained) {
        const r: Vector3 = [0, 0, 0];
        const reaction = matches.nodes.get(node.id).reaction;
        for (let axis = 0; axis < 3; axis++) if (node.restraints[axis]) r[axis] = reaction[axis];
        arrow(new THREE.Vector3(...node.position), r, maxReaction, '#23786f', true);
      }
      if (selected && settings.plane !== 'inspect' && !settings.deformed) {
        const axis1 = settings.plane === 'YZ' ? 1 : 0;
        const axis2 = settings.plane === 'XY' ? 1 : 2;
        for (const axis of [axis1, axis2]) {
          const a = p.clone(), b = p.clone();
          a.setComponent(axis, a.getComponent(axis) - unit * 0.75);
          b.setComponent(axis, b.getComponent(axis) + unit * 0.75);
          line(a, b, '#b88417');
        }
      }
    });
    if (initial) { home(); initial = false; }
    host.dataset.analysis = result.status;
    host.dataset.deformed = String(Boolean(factor));
    host.dataset.amplification = String(factor);
    host.dataset.nodeCount = String(model.nodes.length);
    host.dataset.memberCount = String(model.members.length);
    loop.requestRender();
  }
  return {
    ready,
    update,
    view(view) { mode = view; viewChanged(mode); home(); },
    camera: cameraAction,
    destroy() {
      if (disposed) return;
      disposed = true;
      resolveReady(false);
      release(undefined, true); events.abort(); observer.disconnect(); loop.destroy(); clearGeometry();
      for (const shape of shared) shape.dispose();
      renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
      scene.clear(); labels.remove(); canvas.remove();
    },
  };
}
