import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { observeSize } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { clamp, random } from '../../core/math';
import { floorOf, portalPath, radiusOf, sameRect, solidsOn, structuralSolids } from './world';
import type { Layout, Point, Rect } from './world';
import type { Pose, Route } from './route';

export type Interaction = 'camera' | 'start' | 'end';
export interface SceneOptions { floor: string; exploded: boolean; interaction: Interaction }
export interface BuildingScene {
  update(layout: Layout, route: Route | null, options: SceneOptions): void;
  pose(value: Pose | null): void;
  home(): void;
  destroy(): void;
}
function subtract(rectangles: Rect[], hole: Rect): Rect[] {
  return rectangles.flatMap((rect) => {
    const x1 = Math.max(rect.x, hole.x), x2 = Math.min(rect.x + rect.w, hole.x + hole.w);
    const z1 = Math.max(rect.z, hole.z), z2 = Math.min(rect.z + rect.d, hole.z + hole.d);
    if (x1 >= x2 || z1 >= z2) return [rect];
    return [{ x: rect.x, z: rect.z, w: rect.w, d: z1 - rect.z }, { x: rect.x, z: z2, w: rect.w, d: rect.z + rect.d - z2 },
      { x: rect.x, z: z1, w: x1 - rect.x, d: z2 - z1 }, { x: x2, z: z1, w: rect.x + rect.w - x2, d: z2 - z1 }]
      .filter((piece) => piece.w > 0 && piece.d > 0);
  });
}
export function createBuildingScene(host: HTMLElement, signal: AbortSignal,
  pick: (x: number, z: number) => void, report: (message: string) => void): BuildingScene {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Three-dimensional library. In Camera mode drag to orbit, scroll to zoom, or use arrow keys, plus, minus, and Home. Choose a picking mode to set a route endpoint on the selected floor.');
  host.prepend(canvas);
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!context) {
    const message = document.createElement('p');
    message.className = 'passage-webgl-error';
    message.textContent = '3D is unavailable in this browser. The linked Plan, Route, and Edit panes remain fully usable.';
    host.append(message);
    report(message.textContent);
    return { update() {}, pose() {}, home() {}, destroy() { canvas.remove(); message.remove(); } };
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-22, 22, 18, -18, .1, 180);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minZoom = .6; controls.maxZoom = 2.8;
  controls.minPolarAngle = .2; controls.maxPolarAngle = Math.PI / 2.15;
  scene.add(new THREE.HemisphereLight('#fff9e9', '#aaa28b', 1.8));
  const sun = new THREE.DirectionalLight('#fff0d8', 2);
  sun.position.set(-20, 45, 25); scene.add(sun);
  const fill = new THREE.DirectionalLight('#d7e6eb', .8);
  fill.position.set(30, 12, -20); scene.add(fill);
  const model = new THREE.Group(), paths = new THREE.Group();
  scene.add(model, paths);
  let resources: { dispose(): void }[] = [], pathResources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(value: T) => { resources.push(value); return value; };
  const ownPath = <T extends { dispose(): void }>(value: T) => { pathResources.push(value); return value; };
  const labelLayer = document.createElement('div');
  labelLayer.className = 'passage-space-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  host.append(labelLayer);
  let labels: { element: HTMLElement; point: THREE.Vector3 }[] = [];
  let layout: Layout | null = null, currentRoute: Route | null = null, options: SceneOptions = { floor: 'g', exploded: true, interaction: 'camera' };
  let liftCars: { rect: Rect; mesh: THREE.Mesh; base: number }[] = [];
  let width = 1, height = 1, lost = false, destroyed = false;
  const displayY = (y: number) => options.exploded ? y * 1.8 : y;
  const worldPoint = (point: Point, offset = 0) => new THREE.Vector3(point.x, displayY(point.y) + offset, point.z);
  const agent = new THREE.Group();
  const agentMaterial = new THREE.MeshBasicMaterial({ color: '#f4c85d' });
  const agentGeometry = new THREE.SphereGeometry(.27, 12, 8);
  const person = new THREE.Mesh(agentGeometry, agentMaterial); person.position.y = .55;
  const ringGeometry = new THREE.TorusGeometry(.43, .08, 6, 20);
  const ring = new THREE.Mesh(ringGeometry, agentMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = .1;
  agent.add(person, ring); agent.visible = false; scene.add(agent);
  const render = () => {
    if (destroyed || lost) return;
    renderer.render(scene, camera);
    for (const label of labels) {
      const projection = label.point.clone().project(camera);
      const x = (projection.x + 1) / 2 * width, y = (1 - projection.y) / 2 * height;
      label.element.style.transform = `translate(${clamp(x, 4, width - 120)}px, ${y}px)`;
      label.element.style.visibility = projection.z < 1 && y > 0 && y < height - 22 ? 'visible' : 'hidden';
    }
  };
  const loop = createLoop(render, { paused: true });
  const invalidate = () => loop.requestRender();
  controls.addEventListener('change', invalidate);
  function fitProjection() {
    const aspect = width / height;
    let span = Math.max(18, 22 / aspect);
    if (layout) {
      const { world } = layout, top = options.exploded ? world.floors[world.floors.length - 1].elevation : floorOf(world, options.floor).elevation;
      camera.updateMatrixWorld(true);
      let maxX = 0, maxY = 0;
      for (const x of [0, world.width]) for (const y of [-.3, displayY(top) + 1]) for (const z of [0, world.depth]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, Math.abs(point.y));
      }
      span = Math.max(maxY, maxX / aspect) * 1.12;
    }
    camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span;
    camera.updateProjectionMatrix();
  }
  function home() {
    const top = layout ? (options.exploded ? layout.world.floors[layout.world.floors.length - 1] : floorOf(layout.world, options.floor)).elevation : 8.4;
    const center = new THREE.Vector3(layout ? layout.world.width / 2 : 13, (displayY(top) + 1) / 2, layout ? layout.world.depth / 2 : 10);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(33, 31, 39));
    camera.zoom = 1;
    controls.update(); fitProjection(); invalidate();
  }
  const stopSize = observeSize(host, (size) => {
    width = size.width; height = size.height;
    renderer.setSize(width, height, false);
    fitProjection(); invalidate();
  });
  function rebuild() {
    resources.forEach((resource) => resource.dispose()); resources = [];
    model.clear(); labelLayer.replaceChildren(); labels = []; liftCars = [];
    if (!layout) return;
    const { world } = layout, selected = floorOf(world, options.floor);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (color: string) => {
      if (!materials.has(color)) materials.set(color, own(new THREE.MeshStandardMaterial({ color, roughness: .9 })));
      return materials.get(color)!;
    };
    const box = (rect: Rect, bottom: number, height: number, color: string) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(rect.w, height, rect.d)), material(color));
      mesh.position.set(rect.x + rect.w / 2, bottom + height / 2, rect.z + rect.d / 2); model.add(mesh);
      return mesh;
    };
    const rod = (a: THREE.Vector3, b: THREE.Vector3, radius: number, color: string) => {
      const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6)), material(color));
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      model.add(mesh);
    };
    const randomValue = random(671);
    world.floors.forEach((floor) => {
      if (!options.exploded && floor.elevation > selected.elevation) return;
      const y = displayY(floor.elevation);
      const holes = solidsOn(world, floor.id).filter((item) => item.kind === 'void' || item.kind === 'shaft');
      let plates: Rect[] = [{ x: -.08, z: -.08, w: world.width + .16, d: world.depth + .16 }];
      holes.forEach((hole) => { plates = subtract(plates, hole); });
      plates.forEach((plate) => box(plate, y - .28, .25, '#d9cbb4'));
      for (const room of world.rooms.filter((room) => room.floor === floor.id)) {
        box(room, y - .025, .035, floor.color);
        const sign = document.createElement('canvas');
        sign.width = 512; sign.height = 96;
        const pen = sign.getContext('2d');
        if (pen) {
          pen.fillStyle = '#364131'; pen.font = '600 38px Arial'; pen.textAlign = 'center'; pen.fillText(room.short, 256, 60);
          const texture = own(new THREE.CanvasTexture(sign)); texture.colorSpace = THREE.SRGBColorSpace;
          const label = new THREE.Mesh(own(new THREE.PlaneGeometry(6, 1.125)),
            own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
          label.rotation.x = -Math.PI / 2; label.position.set(room.x + room.w / 2, y + .045, room.z + room.d / 2);
          model.add(label);
        }
      }
      for (const solid of structuralSolids(world, floor.id)) {
        const color = solid.kind === 'wall' ? '#eee4d1' : solid.kind === 'door' ? '#bf4930' : solid.id === 'garden' ? '#758361' : '#ae8c60';
        const h = solid.kind === 'wall' ? .85 : solid.kind === 'door' ? .8 : solid.height;
        box(solid, y, h, color);
        if (solid.kind === 'obstacle' && solid.id !== 'garden') {
          box({ x: solid.x - .03, z: solid.z - .03, w: solid.w + .06, d: solid.d + .06 }, y + h, .06, '#d4b98b');
          if (solid.w > 3) for (let x = solid.x + .15; x < solid.x + solid.w - .1; x += .23) {
            box({ x, z: solid.z + .15, w: .13, d: Math.min(.32, solid.d - .2) }, y + h + .06, .18 + randomValue() * .25,
              ['#60694e', '#b95637', '#e5d2a5'][Math.floor(randomValue() * 3)]);
          }
        }
        if (solid.id === 'garden') for (let i = 0; i < 14; i++) {
          const crown = new THREE.Mesh(own(new THREE.IcosahedronGeometry(.35 + randomValue() * .3, 0)), material('#4d6a45'));
          crown.position.set(solid.x + .7 + randomValue() * (solid.w - 1.4), y + .85, solid.z + .6 + randomValue() * (solid.d - 1.2));
          model.add(crown);
        }
      }
      for (const voidRect of floor.voids) {
        const corners = [[voidRect.x + .07, voidRect.z + .07], [voidRect.x + voidRect.w - .07, voidRect.z + .07],
          [voidRect.x + voidRect.w - .07, voidRect.z + voidRect.d - .07], [voidRect.x + .07, voidRect.z + voidRect.d - .07]];
        corners.forEach(([x, z], i) => {
          const [nx, nz] = corners[(i + 1) % corners.length];
          rod(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + .7, z), .035, '#5d6854');
          rod(new THREE.Vector3(x, y + .7, z), new THREE.Vector3(nx, y + .7, nz), .035, '#5d6854');
        });
      }
      for (const door of world.doors) {
        const wall = world.walls.find((wall) => wall.id === door.wall)!;
        if (wall.floor !== floor.id) continue;
        const x = wall.x + (wall.axis === 'x' ? door.offset : wall.thickness / 2);
        const z = wall.z + (wall.axis === 'z' ? door.offset : wall.thickness / 2);
        box({ x: x - .2, z: z - .2, w: .4, d: .4 }, y + .015, .035, door.open ? '#526e4e' : '#bf4930');
      }
      const label = document.createElement('span'), number = document.createElement('b'), name = document.createElement('em');
      number.textContent = String(world.floors.indexOf(floor)).padStart(2, '0');
      name.textContent = floor.name;
      label.append(number, name, ` / +${floor.elevation.toFixed(1)} m`);
      label.className = floor.id === options.floor ? 'is-active' : '';
      labelLayer.append(label); labels.push({ element: label, point: new THREE.Vector3(-.2, y + .1, world.depth + .5) });
    });
    const visibleShafts: Rect[] = [];
    for (const portal of world.portals) {
      if (!options.exploded && floorOf(world, portal.from).elevation >= selected.elevation) continue;
      const path = portalPath(world, portal), color = portal.open ? '#a78759' : '#b3604a';
      if (portal.kind === 'stairs') {
        for (const landing of path) {
          box({ x: landing.x - portal.width / 2, z: landing.z - portal.width / 2, w: portal.width, d: portal.width },
            displayY(landing.y) - .1, .15, color);
        }
        for (let i = 1; i < path.length; i++) {
          const a = worldPoint(path[i - 1]), b = worldPoint(path[i]);
          const steps = Math.abs(b.y - a.y) > .01 ? 14 : 1;
          for (let step = 0; step < steps; step++) {
            const start = a.clone().lerp(b, step / steps), end = a.clone().lerp(b, (step + 1) / steps);
            const center = start.clone().add(end).multiplyScalar(.5);
            const alongX = Math.abs(end.x - start.x) > .01;
            box({ x: center.x - (alongX ? Math.abs(end.x - start.x) / 2 : portal.width / 2),
              z: center.z - (alongX ? portal.width / 2 : Math.abs(end.z - start.z) / 2),
              w: alongX ? Math.abs(end.x - start.x) + .02 : portal.width,
              d: alongX ? portal.width : Math.abs(end.z - start.z) + .02 }, Math.min(start.y, end.y) - .08, Math.abs(end.y - start.y) + .12, color);
          }
          for (const side of [-1, 1]) {
            const offset = new THREE.Vector3(Math.abs(b.x - a.x) < .01 ? side * portal.width / 2 : 0, .5,
              Math.abs(b.x - a.x) >= .01 ? side * portal.width / 2 : 0);
            rod(a.clone().add(offset), b.clone().add(offset), .025, '#5d624c');
          }
        }
      } else {
        const a = worldPoint(path[1]), b = worldPoint(path[2]);
        for (const dx of [-portal.w / 2 + .06, portal.w / 2 - .06]) for (const dz of [-portal.d / 2 + .06, portal.d / 2 - .06]) {
          rod(a.clone().add(new THREE.Vector3(dx, 0, dz)), b.clone().add(new THREE.Vector3(dx, .6, dz)), .045, portal.open ? '#748174' : '#b3604a');
        }
        if (!visibleShafts.some((rect) => sameRect(rect, portal))) {
          const mesh = box({ x: portal.x + .12, z: portal.z + .12, w: portal.w - .24, d: portal.d - .24 }, a.y, .18, '#aab4a0');
          liftCars.push({ rect: portal, mesh, base: a.y + .09 });
          visibleShafts.push(portal);
        }
      }
    }
  }
  function drawRoute(route: Route | null) {
    pathResources.forEach((resource) => resource.dispose()); pathResources = []; paths.clear();
    if (!route || !layout) return;
    const color = ownPath(new THREE.MeshBasicMaterial({ color: '#c43f25' }));
    const light = ownPath(new THREE.MeshBasicMaterial({ color: '#fff8e8' }));
    for (const segment of route.segments) {
      if (!segment.distance) continue;
      if (!options.exploded && Math.max(segment.from.y, segment.to.y) > floorOf(layout.world, options.floor).elevation + .01) continue;
      const a = worldPoint(segment.from, .18), b = worldPoint(segment.to, .18), length = a.distanceTo(b);
      const tube = new THREE.Mesh(ownPath(new THREE.CylinderGeometry(.065, .065, length, 6)), color);
      tube.position.copy(a).add(b).multiplyScalar(.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); paths.add(tube);
    }
    for (const [point, material] of [[route.origin, color], [route.destination, light]] as const) {
      if (!options.exploded && point.y > floorOf(layout.world, options.floor).elevation + .01) continue;
      const marker = new THREE.Mesh(ownPath(new THREE.CylinderGeometry(.42, .42, .16, 24)), material);
      marker.position.copy(worldPoint(point, .2)); paths.add(marker);
    }
  }
  let owner: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (owner !== null || !event.isPrimary) { event.stopImmediatePropagation(); return; }
    owner = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (options.interaction !== 'camera') { event.preventDefault(); canvas.setPointerCapture(event.pointerId); }
  }, { signal, capture: true });
  canvas.addEventListener('pointerup', (event) => {
    if (owner?.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - owner.x, event.clientY - owner.y); owner = null;
    if (options.interaction === 'camera' || moved > 8 || !layout) return;
    const rect = canvas.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const point = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -displayY(floorOf(layout.world, options.floor).elevation)), point);
    if (hit) pick(point.x, point.z);
  }, { signal });
  const release = (event: PointerEvent) => { if (owner?.id === event.pointerId) owner = null; };
  canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('lostpointercapture', release, { signal });
  canvas.addEventListener('keydown', (event) => {
    if (options.interaction !== 'camera') return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { home(); return; }
    if (['+', '=', '-'].includes(event.key)) camera.zoom = clamp(camera.zoom * (event.key === '-' ? .9 : 1.1), .6, 2.8);
    else {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= .12;
      if (event.key === 'ArrowRight') spherical.theta += .12;
      if (event.key === 'ArrowUp') spherical.phi = clamp(spherical.phi - .1, .2, 1.45);
      if (event.key === 'ArrowDown') spherical.phi = clamp(spherical.phi + .1, .2, 1.45);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    }
    controls.update(); camera.updateProjectionMatrix(); invalidate();
  }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); lost = true;
    report('3D context lost. The walk has stopped; the Plan remains available.');
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; invalidate(); report('3D context restored. Start the walk explicitly to resume.'); }, { signal });
  home();
  return {
    update(next, route, nextOptions) {
      const refit = !layout || options.exploded !== nextOptions.exploded || !nextOptions.exploded && options.floor !== nextOptions.floor ||
        layout.world.width !== next.world.width || layout.world.depth !== next.world.depth ||
        layout.world.floors[layout.world.floors.length - 1].elevation !== next.world.floors[next.world.floors.length - 1].elevation;
      const rebuildModel = layout !== next || options.floor !== nextOptions.floor || options.exploded !== nextOptions.exploded;
      layout = next; currentRoute = route; options = nextOptions;
      ring.scale.setScalar(radiusOf(layout.profile) / .51);
      person.scale.setScalar(Math.min(1, layout.profile.radius / .27));
      controls.enabled = options.interaction === 'camera';
      canvas.style.cursor = options.interaction === 'camera' ? 'grab' : 'crosshair';
      if (rebuildModel) rebuild();
      drawRoute(route);
      if (refit) home();
      invalidate();
    },
    pose(value) {
      agent.visible = value !== null && (options.exploded || !!layout && value.point.y <= floorOf(layout.world, options.floor).elevation + .01);
      if (value) agent.position.copy(worldPoint(value.point, .05));
      if (!value || value.time === 0) liftCars.forEach((car) => { car.mesh.position.y = car.base; });
      const portalId = value ? currentRoute?.segments[value.segment]?.portal : undefined;
      const portal = layout?.world.portals.find((item) => item.id === portalId && item.kind === 'lift');
      const car = portal ? liftCars.find((item) => sameRect(item.rect, portal)) : undefined;
      if (car && value) car.mesh.position.y = displayY(value.point.y) + .09;
      invalidate();
    },
    home,
    destroy() {
      if (destroyed) return;
      destroyed = true; owner = null; loop.destroy(); stopSize(); controls.dispose();
      resources.forEach((resource) => resource.dispose()); pathResources.forEach((resource) => resource.dispose());
      agentGeometry.dispose(); ringGeometry.dispose(); agentMaterial.dispose();
      renderer.dispose(); canvas.remove(); labelLayer.remove();
    },
  };
}
