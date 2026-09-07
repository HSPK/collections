import * as THREE from 'three';
import { createLoop } from '../../core/loop';
import { ACTORS, MARK_IDS, roles } from './data';
import type { ActorId, Camera, MarkId, World } from './data';
import { actorParts, actorYaw, cameraFrame, coverage } from './geometry';
import type { Part } from './geometry';
import type { Take } from './engine';

export interface TheaterOptions {
  signal: AbortSignal;
  onFocus(id: ActorId): void;
  onMark(mark: MarkId): void;
  onMoveMark(mark: MarkId, x: number, z: number): void;
  onRail(delta: number): void;
  onMotion(moving: boolean): void;
  onError(message: string): void;
}
export function createTheater(host: HTMLElement, options: TheaterOptions) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor('#0d0d12');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Miniature theater. Drag stage to orbit, drag a tape mark to block, click an actor to focus. Arrow keys move the camera.');
  host.prepend(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0d12');
  const orbit = new THREE.PerspectiveCamera(42, 1, .1, 80);
  const shot = new THREE.PerspectiveCamera(45, 16 / 9, .1, 80);
  const stillCamera = new THREE.PerspectiveCamera(45, 16 / 9, .1, 80);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];
  const mat = (color: string) => {
    let material = materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: .83 }); materials.set(color, material); }
    return material;
  };
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    return mesh(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z);
  }
  const stage = new THREE.Group(); scene.add(stage);
  box(stage, 0, -.3, -.1, 11.8, .55, 8.1, '#482128');
  for (let i = 0; i < 20; i++) box(stage, -5.7 + i * .6, -.012, -.1, .58, .045, 7.7, i % 3 === 0 ? '#8c5c43' : '#a87956');
  box(stage, 0, -.20, 4, 11.9, .26, .15, '#d5af6a');
  box(stage, 0, 1.65, -3.9, 11.8, 3.6, .18, '#431923');
  for (let i = 0; i < 25; i++) mesh(stage, new THREE.CylinderGeometry(.25, .25, 3.9, 10), i % 2 ? '#64222d' : '#792b35', -5.7 + i * .48, 1.95, -3.8);
  for (const x of [-5.65, 5.65]) {
    box(stage, x, 2, 0, .36, 4.4, 7.9, '#411822');
    box(stage, x, 2.2, 3.9, .45, 4.65, .35, '#a47948');
    for (let i = 0; i < 4; i++) mesh(stage, new THREE.CylinderGeometry(.2, .28, 4.1, 10), '#752532', x + (i - 1.5) * .16, 2, 3.65);
  }
  box(stage, 0, 4.2, 3.7, 11.7, .6, .38, '#5d1d2a');
  box(stage, 0, 4.52, 3.7, 11.8, .07, .44, '#ccab70');
  // The front arch is scenery for the orbit view, not an invisible obstruction in shot view.
  const arch = stage.children.slice(-2);
  for (let i = 0; i < 13; i++) {
    const geometry = new THREE.SphereGeometry(.085, 8, 6); geometries.push(geometry);
    const bulb = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffd68d' }));
    bulb.position.set(-5.1 + i * .85, .04, 3.85); stage.add(bulb);
  }
  const markMeshes: THREE.Mesh[] = [];
  function labelTexture(label: string) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f1dfad'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, 64, 31);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; textures.push(t); return t;
  }
  const markGroup = new THREE.Group(); scene.add(markGroup);
  for (const [index, id] of MARK_IDS.entries()) {
    const ring = mesh(markGroup, new THREE.RingGeometry(.21, .25, 24), roles[id.startsWith('mica') ? 'mica' : 'pip'].color, 0, .025, 0);
    ring.rotation.x = -Math.PI / 2; ring.userData.mark = id; markMeshes.push(ring);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.65, .25), new THREE.MeshBasicMaterial({ map: labelTexture(`${id.startsWith('mica') ? 'M' : 'P'}${index % 3 + 1}`), transparent: true, depthWrite: false }));
    geometries.push(label.geometry); label.rotation.x = -Math.PI / 2; label.position.set(0, .028, .42); ring.add(label);
    // Labels are independently oriented because they are children of the rotated tape.
    label.rotation.x = 0; label.position.set(0, -.39, .003);
  }
  const cabinet = new THREE.Group(); scene.add(cabinet);
  box(cabinet, 0, 1.38, 0, 1.28, 2.44, .76, '#365d5d');
  box(cabinet, 0, 1.42, .39, 1.10, 2.18, .045, '#527777');
  for (let i = 0; i < 3; i++) {
    box(cabinet, 0, .64 + i * .7, .43, .91, .5, .05, '#355454');
    box(cabinet, 0, .64 + i * .7, .49, .21, .04, .06, '#e4ba71');
  }
  for (const x of [-.45, .45]) for (const z of [-.24, .24]) mesh(cabinet, new THREE.SphereGeometry(.105, 8, 6), '#201e26', x, .10, z);
  const actors = new Map<ActorId, THREE.Group>();
  const actorGeometry = new Map<ActorId, THREE.BufferGeometry[]>();
  const floorShadows = new Map<ActorId, THREE.Mesh>();
  for (const id of ACTORS) {
    const group = new THREE.Group(); scene.add(group); actors.set(id, group);
    const shadow = mesh(scene, new THREE.CircleGeometry(.7, 24), '#6c4a39', 0, .018, 0);
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .6; floorShadows.set(id, shadow);
  }
  const hemisphere = new THREE.HemisphereLight('#ffe9bb', '#372235', 2.1); scene.add(hemisphere);
  const key = new THREE.DirectionalLight('#ffe1aa', 3); key.position.set(-3, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#de886a', 2); rim.position.set(4, 5, -4); scene.add(rim);
  const practical = new THREE.PointLight('#ffd090', 18, 12, 2); practical.position.set(-4, 4, 1); scene.add(practical);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let world: World | undefined, camera: Camera | undefined, worldKey = '', mode: 'stage' | 'shot' = 'stage';
  let width = 1, height = 1, angle = .35, elevation = 7, moving = false;
  let drag: { x: number; y: number; startX: number; startY: number; region: 'stage' | 'shot'; mark?: MarkId; moved: boolean } | undefined;
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const destinations = new Map<ActorId, THREE.Vector3>();
  type Rect = { x: number; y: number; w: number; h: number; kind: 'stage' | 'shot' };
  let rects: Rect[] = [];
  function configureShot(c: Camera, w: World, view = shot) {
    const f = cameraFrame(c, w);
    view.position.set(f.position.x, f.position.y, f.position.z); view.lookAt(f.target.x, f.target.y, f.target.z);
    view.fov = THREE.MathUtils.radToDeg(2 * Math.atan(f.tangent)); view.aspect = 16 / 9; view.updateProjectionMatrix();
  }
  function posePart(mesh: THREE.Object3D, part: Part) {
    mesh.position.set(part.at.x, part.at.y, part.at.z);
    mesh.scale.set(part.size.x, part.size.y, part.size.z); mesh.rotation.z = part.tilt ?? 0;
  }
  function layout(): Rect[] {
    if (width < 700) {
      const insetW = Math.min(150, width * .32), insetH = insetW * 9 / 16;
      return [{ x: 0, y: 0, w: width, h: height, kind: mode },
        { x: 10, y: 12, w: insetW, h: insetH, kind: mode === 'stage' ? 'shot' : 'stage' }];
    }
    const mainW = Math.floor(width * .60);
    return [{ x: 0, y: 0, w: mainW - 3, h: height, kind: mode },
      { x: mainW + 3, y: 0, w: width - mainW - 3, h: height, kind: mode === 'stage' ? 'shot' : 'stage' }];
  }
  function draw() {
    if (!world || !camera) return;
    orbit.position.set(Math.sin(angle) * 13, elevation, Math.cos(angle) * 13); orbit.lookAt(0, .7, 0);
    configureShot(camera, world);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.clear();
    renderer.setScissorTest(true); rects = layout();
    for (const rect of rects) {
      let { x, y, w, h } = rect;
      if (rect.kind === 'shot') {
        const fit = Math.min(w / 16, h / 9); const fw = fit * 16, fh = fit * 9;
        x += (w - fw) / 2; y += (h - fh) / 2; w = fw; h = fh;
      }
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h); renderer.clear();
      renderer.setViewport(x, y, w, h);
      orbit.aspect = w / h; orbit.updateProjectionMatrix();
      markGroup.visible = rect.kind === 'stage';
      arch.forEach(m => { m.visible = rect.kind === 'stage'; });
      renderer.render(scene, rect.kind === 'stage' ? orbit : shot);
      if (rect.kind === 'shot') {
        host.style.setProperty('--monitor-left', `${x}px`);
        host.style.setProperty('--monitor-top', `${height - y - h}px`);
        host.style.setProperty('--monitor-width', `${w}px`);
        host.style.setProperty('--monitor-height', `${h}px`);
      }
    }
    renderer.setScissorTest(false);
  }
  const loop = createLoop((_elapsed, delta) => {
    if (moving) {
      let remaining = false;
      for (const id of ACTORS) {
        const actor = actors.get(id)!, target = destinations.get(id)!;
        actor.position.lerp(target, Math.min(1, delta * 11));
        if (actor.position.distanceTo(target) > .012) remaining = true;
        else actor.position.copy(target);
        floorShadows.get(id)!.position.set(actor.position.x, .018, actor.position.z);
      }
      if (!remaining) { moving = false; options.onMotion(false); loop.setPaused(true); }
    }
    draw();
  }, { paused: true });
  function sync(next: World, nextCamera: Camera, nextMode: 'stage' | 'shot', instant = false) {
    const key = JSON.stringify(next);
    const oldWorld = world, changed = key !== worldKey;
    world = next; camera = nextCamera; mode = nextMode;
    if (changed) {
      worldKey = key;
      for (const actor of world.actors) {
        const group = actors.get(actor.id)!;
        for (const geometry of actorGeometry.get(actor.id) ?? []) geometry.dispose();
        group.clear();
        const shapes: THREE.BufferGeometry[] = [];
        for (const p of actorParts(actor)) {
          const geometry = p.shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : p.shape === 'sphere' ? new THREE.SphereGeometry(.5, 12, 8) : new THREE.CylinderGeometry(.42, .5, 1, 12);
          shapes.push(geometry);
          const m = new THREE.Mesh(geometry, mat(p.color)); posePart(m, p);
          m.userData.actor = actor.id; group.add(m);
        }
        actorGeometry.set(actor.id, shapes); group.rotation.y = actorYaw(actor, world);
        const p = world.marks[actor.mark], target = new THREE.Vector3(p.x, 0, p.z);
        destinations.set(actor.id, target);
        if (!oldWorld || reduced.matches) group.position.copy(target);
        floorShadows.get(actor.id)!.position.set(group.position.x, .018, group.position.z);
      }
      cabinet.position.set(world.prop.x, 0, world.prop.z);
      MARK_IDS.forEach((id, i) => markMeshes[i].position.set(next.marks[id].x, .026, next.marks[id].z));
    }
    if (changed || instant) {
      if (instant) for (const id of ACTORS) {
        const target = destinations.get(id)!;
        actors.get(id)!.position.copy(target);
        floorShadows.get(id)!.position.set(target.x, .018, target.z);
      }
      moving = !instant && !reduced.matches && ACTORS.some(id => actors.get(id)!.position.distanceTo(destinations.get(id)!) > .012);
      options.onMotion(moving); loop.setPaused(!moving);
    }
    loop.requestRender();
  }
  function pointer(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = height - (event.clientY - bounds.top);
    const rect = [...rects].reverse().find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (!rect) return undefined;
    const view = rect.kind === 'stage' ? orbit : shot;
    if (rect.kind === 'stage') { orbit.aspect = rect.w / rect.h; orbit.updateProjectionMatrix(); }
    ray.setFromCamera(new THREE.Vector2((x - rect.x) / rect.w * 2 - 1, (y - rect.y) / rect.h * 2 - 1), view);
    return rect;
  }
  canvas.addEventListener('pointerdown', e => {
    const rect = pointer(e); if (!rect) return;
    canvas.focus(); canvas.setPointerCapture(e.pointerId);
    const hit = rect.kind === 'stage' ? ray.intersectObjects(markMeshes)[0] : undefined;
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, region: rect.kind, mark: hit?.object.userData.mark, moved: false };
    if (drag.mark) options.onMark(drag.mark);
  }, { signal: options.signal });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
    if (!drag.mark) {
      if (drag.region === 'stage') { angle -= dx * .007; elevation = THREE.MathUtils.clamp(elevation + dy * .03, 3.5, 12); loop.requestRender(); }
      else options.onRail(dx * .025);
    }
    drag.x = e.clientX; drag.y = e.clientY;
  }, { signal: options.signal });
  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    pointer(e);
    if (drag.mark && drag.moved) {
      const point = new THREE.Vector3();
      if (ray.ray.intersectPlane(ground, point)) options.onMoveMark(drag.mark, Math.round(THREE.MathUtils.clamp(point.x, -4, 4) * 10) / 10, Math.round(THREE.MathUtils.clamp(point.z, -2, 2) * 10) / 10);
    } else if (!drag.moved) {
      const hit = ray.intersectObjects([...actors.values()], true)[0];
      if (hit?.object.userData.actor) options.onFocus(hit.object.userData.actor);
    }
    drag = undefined;
  }, { signal: options.signal });
  canvas.addEventListener('pointercancel', () => { drag = undefined; }, { signal: options.signal });
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); loop.setPaused(true); options.onError('The theater lost its WebGL context. Your replay is saved; reload to rebuild the set.');
  }, { signal: options.signal });
  const observer = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false); loop.requestRender();
  }); observer.observe(host);
  const motionChanged = () => {
    if (reduced.matches && world && camera) {
      for (const id of ACTORS) {
        actors.get(id)!.position.copy(destinations.get(id)!);
        floorShadows.get(id)!.position.set(destinations.get(id)!.x, .018, destinations.get(id)!.z);
      }
      moving = false; options.onMotion(false); loop.setPaused(true); loop.requestRender();
    }
  };
  reduced.addEventListener('change', motionChanged, { signal: options.signal });
  function still(take: Take): string {
    const transforms = [cabinet, ...ACTORS.flatMap(id => {
      const group = actors.get(id)!;
      return [group, ...group.children, floorShadows.get(id)!];
    })].map(object => ({
      object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
    }));
    const visibility = [markGroup, ...arch].map(object => ({ object, visible: object.visible }));
    const oldDpr = renderer.getPixelRatio(), oldSize = renderer.getSize(new THREE.Vector2());
    // Snapshot posing must not enter sync: its world cache, tween targets and loop belong to the live set.
    try {
      for (const actor of take.world.actors) {
        const group = actors.get(actor.id)!, p = take.world.marks[actor.mark];
        group.position.set(p.x, 0, p.z); group.rotation.y = actorYaw(actor, take.world);
        // Each puppet has fixed part topology, so the recorded pose can reuse its existing geometry.
        actorParts(actor).forEach((part, index) => posePart(group.children[index], part));
        floorShadows.get(actor.id)!.position.set(p.x, .018, p.z);
      }
      cabinet.position.set(take.world.prop.x, 0, take.world.prop.z);
      configureShot(take.camera, take.world, stillCamera);
      renderer.setPixelRatio(1); renderer.setSize(480, 270, false); renderer.setScissorTest(false); renderer.setViewport(0, 0, 480, 270);
      markGroup.visible = false; arch.forEach(m => { m.visible = false; });
      renderer.render(scene, stillCamera);
      return canvas.toDataURL('image/png');
    } finally {
      for (const saved of transforms) {
        saved.object.position.copy(saved.position); saved.object.quaternion.copy(saved.quaternion); saved.object.scale.copy(saved.scale);
      }
      visibility.forEach(saved => { saved.object.visible = saved.visible; });
      renderer.setPixelRatio(oldDpr); renderer.setSize(oldSize.x, oldSize.y, false);
      draw();
    }
  }
  return {
    canvas, sync, still,
    readings: () => world && camera ? world.actors.map(a => coverage(a, camera!, world!)) : [],
    orbitBy: (step: number) => { angle += step; loop.requestRender(); },
    dispose() {
      observer.disconnect(); loop.destroy();
      geometries.forEach(g => g.dispose()); actorGeometry.forEach(gs => gs.forEach(g => g.dispose())); textures.forEach(t => t.dispose());
      const allMaterials = new Set<THREE.Material>(materials.values());
      scene.traverse(o => { if (o instanceof THREE.Mesh) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) allMaterials.add(m); } });
      allMaterials.forEach(m => m.dispose()); renderer.dispose(); canvas.remove();
    },
  };
}
