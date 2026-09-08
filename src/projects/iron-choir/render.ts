import * as THREE from 'three';
import { disposeTree, makeMech } from './art';
import { PILOT_IDS } from './data';
import { fieldFor } from './engine';
import type { Action, State } from './engine';
import { center, heightAt } from './spatialmath';
import type { Point } from './spatialmath';

export interface SceneView {
  update(state: State): void;
  select(point: Point | null, action?: Action): void;
  orbit(delta: number): void;
  zoom(delta: number): void;
  top(): void;
  destroy(): void;
}
export function createScene(host: HTMLElement, onPick: (p: Point, unit: string | null) => void, onNotice: (message: string) => void): SceneView {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '三维微缩战场；可用战术表和方向键选择同一格点');
  canvas.tabIndex = 0;
  host.prepend(canvas);
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) {
    onNotice('此浏览器未提供三维绘图环境。战术表仍按同一真实几何运行；请使用支持三维绘图的浏览器观看场景。');
    const noop = () => {};
    return { update: noop, select: noop, orbit: noop, zoom: noop, top: noop, destroy: () => canvas.remove() };
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#0a1721');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#0a1721', 22, 46);
  const world = new THREE.Group(), overlay = new THREE.Group();
  scene.add(world, overlay);
  scene.add(new THREE.HemisphereLight('#c5e7ff', '#38414a', 2.2));
  const key = new THREE.DirectionalLight('#c5dcff', 3.2); key.position.set(-3, 12, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#ef985a', 1.5); rim.position.set(8, 4, -6); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 90);
  const target = new THREE.Vector3(4, 0.35, 3);
  let angle = -0.77, topView = false, scale = 10.5, frame = 0, disposed = false, current: State | null = null;
  let selected: Point | null = null, selectedAction: Action | undefined;
  const raycaster = new THREE.Raycaster();
  const events = new AbortController();
  function requestRender() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); });
  }
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height, fit = Math.max(scale, 12 / aspect);
    camera.left = -fit * aspect / 2; camera.right = fit * aspect / 2;
    camera.top = fit / 2; camera.bottom = -fit / 2; camera.updateProjectionMatrix();
    camera.position.set(target.x + Math.sin(angle) * (topView ? 0.1 : 13), topView ? 24 : 13, target.z + Math.cos(angle) * (topView ? 0.1 : 13));
    camera.lookAt(target); requestRender();
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  const solidMat = (color: string, metalness = 0.2, emissive?: string) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.73, emissive: emissive ?? 0, emissiveIntensity: emissive ? 0.5 : 0 });
  function box(parent: THREE.Group, x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function line(parent: THREE.Group, points: THREE.Vector3[], color: string, dashed = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.09 }) : new THREE.LineBasicMaterial({ color });
    const object = new THREE.Line(geometry, material);
    if (dashed) object.computeLineDistances();
    object.userData.ignore = true; parent.add(object);
  }
  function circle(parent: THREE.Group, p: Point, y: number, color: string, radius: number) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.025, radius, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, y, p.z); mesh.userData.ignore = true; parent.add(mesh);
  }
  function decorate(s: State) {
    const dark = solidMat('#233743', 0.6), pale = solidMat('#c5cdc9'), blue = solidMat('#577e98', 0.3, '#335d83');
    const orange = solidMat('#ed9e61', 0.3, '#b34b21');
    const base = box(world, 4, -0.74, 3, 10.2, 0.35, 8.1, dark); base.userData.ignore = true;
    for (const x of [-0.9, 8.9]) {
      const beam = box(world, x, -0.35, 3, 0.12, 0.8, 7.8, pale); beam.userData.ignore = true;
      for (const z of [0, 2, 4, 6]) {
        box(world, x, 0.2, z, 0.18, 0.65, 0.18, dark).userData.ignore = true;
        box(world, x, 0.54, z, 0.13, 0.04, 0.13, orange).userData.ignore = true;
      }
    }
    const hangar = !s.battle && s.location === 'hangar';
    if (hangar) {
      for (const x of [0.1, 4, 7.9]) {
        box(world, x, 1.6, -0.7, 0.25, 4.8, 0.32, dark).userData.ignore = true;
        box(world, x, 3.8, 2.8, 0.17, 0.2, 7.3, pale).userData.ignore = true;
        box(world, x, 3.65, 2.8, 0.07, 0.08, 6.8, blue).userData.ignore = true;
      }
      box(world, 4, 3.95, -0.7, 8.8, 0.23, 0.35, dark).userData.ignore = true;
      for (const x of [2, 4, 6]) {
        line(world, [new THREE.Vector3(x, 3.8, 2.6), new THREE.Vector3(x, 1.8, 2.6)], '#758795');
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.035, 6, 36), pale);
        ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.07, 3); ring.userData.ignore = true; world.add(ring);
        box(world, x, 0.17, 1.4, 0.7, 0.36, 0.6, dark).userData.ignore = true;
        box(world, x, 0.36, 1.4, 0.5, 0.035, 0.4, blue).userData.ignore = true;
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const height = 1.2 + ((i * 7 + s.seed) % 5) * 0.48;
        const x = -1.5 + i * 1.8;
        const tower = box(world, x, height / 2 - 0.5, -2.3, 0.8, height, 0.8, dark); tower.userData.ignore = true;
        box(world, x, height - 0.44, -1.88, 0.56, 0.07, 0.035, blue).userData.ignore = true;
      }
      if (s.location === 'cistern' || s.location === 'kiln') {
        for (const x of [0, 8]) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 3, 16), pale);
          pipe.rotation.x = Math.PI / 2; pipe.position.set(x, 2.8, -1.4); pipe.userData.ignore = true; world.add(pipe);
        }
      }
      if (s.location === 'archive' || s.location === 'garden' || s.location === 'crown') {
        for (const x of [0.8, 2.5, 4.2, 5.9, 7.6]) {
          box(world, x, 0.65, -1.1, 0.12, 2.6, 0.12, pale).userData.ignore = true;
          box(world, x, 1.97, -1.1, 0.24, 0.08, 0.24, blue).userData.ignore = true;
        }
      }
    }
  }
  function update(s: State) {
    current = s;
    disposeTree(world); disposeTree(overlay);
    const field = fieldFor(s), hangar = !s.battle && s.location === 'hangar';
    const floor = solidMat('#536772', 0.45), ledge = solidMat('#78888d', 0.35), wall = solidMat('#d7d9d1'), low = solidMat('#667985', 0.4);
    const graphite = solidMat('#263e4d'), strip = solidMat('#f0a060', 0.2, '#ba5b2d');
    for (const solid of field.solids) {
      if (hangar && solid.kind !== 'terrain') continue;
      const { min, max } = solid;
      const top = hangar ? 0 : max.y;
      const mesh = box(world, (min.x + max.x) / 2, (min.y + top) / 2, (min.z + max.z) / 2,
        max.x - min.x - (solid.kind === 'terrain' ? 0.025 : 0), top - min.y, max.z - min.z - (solid.kind === 'terrain' ? 0.025 : 0),
        solid.kind === 'wall' ? wall : solid.kind === 'low' ? low : max.y > 0.5 ? ledge : floor);
      mesh.userData.ground = true;
      if (solid.kind !== 'terrain') {
        box(world, (min.x + max.x) / 2, top - 0.12, max.z + 0.006, max.x - min.x - 0.1, 0.045, 0.02, strip).userData.ignore = true;
        if (solid.kind === 'wall') box(world, (min.x + max.x) / 2, (min.y + top) / 2, max.z + 0.006, 0.16, 1.1, 0.015, graphite).userData.ignore = true;
      }
    }
    decorate(s);
    if (s.battle) {
      for (const unit of s.battle.units) {
        if (unit.team === 'civil') {
          const group = new THREE.Group();
          box(group, 0, 0.35, 0, 0.7, 0.6, 0.8, wall);
          box(group, 0, 0.67, 0, 0.46, 0.05, 0.5, strip);
          group.position.set(unit.position.x, heightAt(field, unit.position), unit.position.z);
          group.userData.unit = unit.id; world.add(group); continue;
        }
        const mech = makeMech(unit.pilot, unit.team === 'enemy');
        mech.position.set(unit.position.x, heightAt(field, unit.position), unit.position.z);
        mech.rotation.y = unit.team === 'enemy' ? -Math.PI / 2 : Math.PI / 2;
        mech.userData.unit = unit.id;
        if (unit.hull <= 0) { mech.rotation.z = 1.25; mech.scale.setScalar(0.65); mech.position.y += 0.18; }
        world.add(mech);
        if (unit.hull > 0) {
          circle(world, unit.position, heightAt(field, unit.position) + 0.035, unit.team === 'enemy' ? '#e49b68' : '#8bd2e7', unit.id === s.lead ? 0.52 : 0.4);
          box(world, unit.position.x, heightAt(field, unit.position) + 1.62, unit.position.z, 0.65, 0.045, 0.04, graphite).userData.ignore = true;
          box(world, unit.position.x - 0.325 + 0.325 * unit.hull / unit.maxHull, heightAt(field, unit.position) + 1.62, unit.position.z,
            0.65 * unit.hull / unit.maxHull, 0.05, 0.045, unit.team === 'enemy' ? strip : new THREE.MeshBasicMaterial({ color: '#8ed5e3' })).userData.ignore = true;
        }
      }
      const p = field.terminal, y = heightAt(field, p);
      circle(world, p, y + 0.05, '#eaa96c', 0.46);
      box(world, p.x, y + 0.09, p.z, 0.27, 0.18, 0.27, strip).userData.ignore = true;
      for (const f of s.battle.forecasts) {
        const u = s.battle.units.find(unit => unit.id === f.unit);
        if (!u || u.hull <= 0) continue;
        const from = center(field, u.position);
        if (f.aim) {
          const to = center(field, f.aim);
          line(world, [new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)], '#e59a61', true);
          circle(world, f.aim, heightAt(field, f.aim) + 0.07, '#eea26a', 0.43);
        } else if (f.action.path.length) {
          line(world, [u.position, ...f.action.path].map(p => new THREE.Vector3(p.x, heightAt(field, p) + 0.12, p.z)), '#e59a61', true);
        }
      }
    } else {
      PILOT_IDS.forEach((id, i) => {
        const mech = makeMech(id);
        mech.position.set(2 + i * 2, hangar ? 0.1 : heightAt(field, { x: 2 + i * 2, z: 3 }), 3);
        mech.rotation.y = 0.3; mech.userData.unit = id;
        if (!s.pilots[id].recruited) {
          mech.traverse(node => {
            if (node instanceof THREE.Mesh) {
              const old = Array.isArray(node.material) ? node.material : [node.material];
              for (const material of old) if (material instanceof THREE.MeshStandardMaterial) { material.transparent = true; material.opacity = 0.2; }
            }
          });
        }
        world.add(mech);
      });
    }
    select(selected, selectedAction); resize();
  }
  function select(point: Point | null, action?: Action) {
    selected = point; selectedAction = action;
    disposeTree(overlay);
    if (!current || !point) { requestRender(); return; }
    const field = fieldFor(current);
    circle(overlay, point, heightAt(field, point) + 0.1, '#e7f5ed', 0.48);
    if (action?.path.length) {
      const lead = current.battle?.units.find(u => u.id === current!.lead);
      if (lead) line(overlay, [lead.position, ...action.path].map(p => new THREE.Vector3(p.x, heightAt(field, p) + 0.14, p.z)), '#8fddec');
    }
    requestRender();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!current || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hits = raycaster.intersectObject(world, true);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object, unit: string | null = null, ignored = false;
      while (node && node !== world) { if (node.userData.ignore) ignored = true; if (typeof node.userData.unit === 'string') unit = node.userData.unit; node = node.parent; }
      if (ignored) continue;
      const position = current.battle?.units.find(u => u.id === unit)?.position ?? { x: Math.round(hit.point.x), z: Math.round(hit.point.z) };
      if (position.x >= 0 && position.z >= 0 && position.x < 9 && position.z < 7) onPick(position, unit);
      break;
    }
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); onNotice('三维绘图上下文中断。请导出战记后刷新；战术表仍可操作。');
  }, { signal: events.signal });
  resize();
  return {
    update, select,
    orbit(delta) { angle += delta; topView = false; resize(); },
    zoom(delta) { scale = Math.max(7, Math.min(16, scale + delta)); resize(); },
    top() { topView = !topView; resize(); },
    destroy() {
      disposed = true; events.abort(); observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      disposeTree(world); disposeTree(overlay); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
