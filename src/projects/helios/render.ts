import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Line, LineBasicMaterial,
  LineLoop, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry,
  Points, PointsMaterial, Quaternion, Raycaster, RingGeometry, Scene, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, DoubleSide,
} from 'three';
import type { Material } from 'three';
import { bodyData, BODIES } from './data';
import type { BodyName } from './data';
import { displayPosition, eclipticToScene, eqjToScene, orbitSamples } from './astronomy';
import type { BodyPosition, Observation, Frame } from './astronomy';
import { add, clamp, DEG, scale, skyBasis, unit } from './math';
import type { Vec3 } from './math';
import type { StudyState } from './state';
import { earthAtlas } from './atlas';
import type { LandGeometry } from './geography';
import { planetFragment, planetVertex, ringFragment, ringVertex, skyFragment, skyVertex } from './shaders';

const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
interface Label { name: BodyName; x: number; y: number; anchorX: number; anchorY: number; visible: boolean }
export interface RenderInfo { labels: Label[]; camera: Vec3; target: Vec3; frame: string }
interface RenderOptions {
  land: LandGeometry;
  host: HTMLElement; signal: AbortSignal; invalidate: () => void;
  zoomTarget?: HTMLElement;
  navigate: (dx: number, dy: number, zoom?: number) => void;
  select: (body: BodyName) => void;
  report: (message: string) => void;
}
export function createRenderer(options: RenderOptions) {
  const { host, signal } = options;
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor('#05090f');
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'HELIOS interactive observatory. Scroll to zoom; drag to orbit or pan. Arrow keys and plus or minus also work.');
  canvas.setAttribute('role', 'img'); canvas.tabIndex = 0;
  canvas.dataset.heliosCanvas = '';
  host.append(canvas);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const geometry = <T extends BufferGeometry>(g: T): T => { geometries.add(g); return g; };
  const material = <T extends Material>(m: T): T => { materials.add(m); return m; };
  const atlas = new CanvasTexture(earthAtlas(options.land)); atlas.colorSpace = SRGBColorSpace;
  const sphere = geometry(new SphereGeometry(1, 64, 40));
  const scene = new Scene();
  const planetScene = new Scene();
  const skyScene = new Scene();
  const camera = new PerspectiveCamera(43, 1, 0.02, 1500);
  const skyCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const meshes = new Map<BodyName, Mesh<SphereGeometry, ShaderMaterial>>();
  const paths = new Map<BodyName, Line>();
  const pathGroup = new Group(); scene.add(pathGroup);
  function planetMaterial(name: BodyName) {
    const body = bodyData(name);
    return material(new ShaderMaterial({ vertexShader: planetVertex, fragmentShader: planetFragment,
      uniforms: { sunlight: { value: new Vector3(1, 0, 0) }, baseColor: { value: new Color(body.color) },
        kind: { value: body.kind }, atlas: { value: atlas } } }));
  }
  for (const body of BODIES) {
    const mesh = new Mesh(sphere, planetMaterial(body.name));
    mesh.scale.setScalar(body.displayRadius); meshes.set(body.name, mesh); scene.add(mesh);
  }
  const planet = new Mesh(sphere, planetMaterial('Earth')); planetScene.add(planet);
  const ringMaterial = material(new ShaderMaterial({ vertexShader: ringVertex, fragmentShader: ringFragment,
    uniforms: { sunlight: { value: new Vector3(0, 1, 0) } }, transparent: true, depthWrite: false, side: DoubleSide }));
  const ringGeometry = geometry(new RingGeometry(1.32, 2.3, 144, 8));
  const rings = new Mesh(ringGeometry, ringMaterial);
  const nearRings = new Mesh(ringGeometry, ringMaterial);
  rings.rotation.x = Math.PI / 2; nearRings.rotation.x = Math.PI / 2;
  meshes.get('Saturn')?.add(rings); planet.add(nearRings);
  const surfaceMarker = new Mesh(geometry(new SphereGeometry(0.017, 12, 8)), material(new MeshBasicMaterial({ color: '#ffe1a1' })));
  planet.add(surfaceMarker);
  const nearGrid = new Group(); planet.add(nearGrid);
  const gridMaterial = material(new LineBasicMaterial({ color: '#adcbce', transparent: true, opacity: 0.12 }));
  for (const latitude of [-60, -30, 0, 30, 60]) {
    const points = Array.from({ length: 128 }, (_, i) => {
      const a = i / 128 * Math.PI * 2, h = latitude * DEG;
      return new Vector3(Math.cos(a) * Math.cos(h), Math.sin(h), -Math.sin(a) * Math.cos(h)).multiplyScalar(1.002);
    });
    nearGrid.add(new LineLoop(geometry(new BufferGeometry().setFromPoints(points)), gridMaterial));
  }
  const starGeometry = geometry(new BufferGeometry());
  const stars: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const z = 1 - 2 * (i + 0.5) / 1000, a = i * 2.399963229728653;
    const r = Math.sqrt(1 - z * z);
    stars.push(Math.cos(a) * r * 250, z * 250, Math.sin(a) * r * 250);
  }
  starGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  const starMaterial = material(new PointsMaterial({ size: 0.25, color: '#7a8c9e', transparent: true, opacity: 0.45, sizeAttenuation: true }));
  scene.add(new Points(starGeometry, starMaterial)); planetScene.add(new Points(starGeometry, starMaterial));
  const selection = new LineLoop(geometry(new BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => {
    const a = i / 96 * Math.PI * 2; return new Vector3(Math.cos(a), Math.sin(a), 0);
  }))), material(new LineBasicMaterial({ color: '#eac787', transparent: true, opacity: 0.8 })));
  scene.add(selection);
  const skyMaterial = material(new ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment,
    depthTest: false, depthWrite: false,
    uniforms: {
      aspect: { value: 1 }, tangent: { value: 0.01 }, sunRadius: { value: 0.0046 }, moonRadius: { value: 0.0047 },
      totality: { value: 0 }, wide: { value: 0 }, viewportHeight: { value: 850 }, forward: { value: new Vector3() }, rightward: { value: new Vector3() },
      upward: { value: new Vector3() }, sunDirection: { value: new Vector3() }, moonDirection: { value: new Vector3() },
      moonLight: { value: new Vector3() }, moonPrime: { value: new Vector3() }, moonEast: { value: new Vector3() }, moonNorth: { value: new Vector3() },
    } }));
  skyScene.add(new Mesh(geometry(new PlaneGeometry(2, 2)), skyMaterial));
  let width = 1, height = 1, disposed = false, orbitEpoch = '', renderCount = 0;
  let latestState: StudyState | undefined;
  let selectedPlanet: BodyName = 'Earth';
  const raycaster = new Raycaster();
  function resize() {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    width = rect.width; height = rect.height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    options.invalidate();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host); resize();
  function frameQuaternion(frame: Frame, ms: number): Quaternion {
    const prime = vector(eqjToScene(frame.prime, ms));
    const north = vector(eqjToScene(frame.north, ms));
    const negativeEast = vector(scale(eqjToScene(frame.east, ms), -1));
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(prime, north, negativeEast));
  }
  function orient(mesh: Mesh<SphereGeometry, ShaderMaterial>, body: BodyPosition, ms: number) {
    mesh.quaternion.copy(frameQuaternion(body.frame, ms));
    if (body.name !== 'Sun') {
      const sunlight = vector(eqjToScene(scale(unit(body.eqjAu), -1), ms)).applyQuaternion(mesh.quaternion.clone().invert());
      mesh.material.uniforms.sunlight.value.copy(sunlight);
      if (body.name === 'Saturn') ringMaterial.uniforms.sunlight.value.copy(sunlight);
    }
  }
  function updateOrbits(ms: number) {
    const key = new Date(ms).toISOString().slice(0, 7);
    if (key === orbitEpoch) return;
    orbitEpoch = key;
    for (const body of BODIES) {
      if (body.name === 'Sun') continue;
      const points = orbitSamples(body.name, ms).map(vector);
      const existing = paths.get(body.name);
      if (existing) {
        geometries.delete(existing.geometry); existing.geometry.dispose();
        existing.geometry = geometry(new BufferGeometry().setFromPoints(points));
      } else {
        const path = new Line(geometry(new BufferGeometry().setFromPoints(points)),
          material(new LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.34 })));
        paths.set(body.name, path); pathGroup.add(path);
      }
    }
  }
  function draw(state: StudyState, observation: Observation, bodies: BodyPosition[]): RenderInfo {
    if (disposed) throw new Error('The renderer has been disposed.');
    latestState = state;
    const tracked = state.track === 'Moon' ? observation.moon : observation.sun;
    const skyAz = state.track === 'horizon' ? state.skyAzimuth : tracked.azimuth;
    const skyAlt = state.track === 'horizon' ? state.skyAltitude : tracked.altitude;
    const targetBody = bodies.find(body => body.name === state.body);
    const earth = bodies.find(body => body.name === 'Earth');
    if (!targetBody || !earth) throw new Error('A required ephemeris body is missing.');
    let info: RenderInfo = { labels: [], camera: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, frame: 'HOR / true angular' };
    if (state.view === 'sky') {
      const basis = skyBasis(skyAz, skyAlt), u = skyMaterial.uniforms;
      u.aspect.value = width / height; u.tangent.value = Math.tan(state.fov * DEG / 2);
      u.viewportHeight.value = height * renderer.getPixelRatio();
      u.sunRadius.value = observation.sun.radius; u.moonRadius.value = observation.moon.radius;
      u.totality.value = observation.eclipse.kind === 'total' && observation.sun.visibility === 'above' ? 1 : 0;
      u.wide.value = clamp((state.fov - 5) / 30, 0, 1);
      u.forward.value.copy(basis.forward); u.rightward.value.copy(basis.right); u.upward.value.copy(basis.up);
      u.sunDirection.value.copy(observation.sun.horizon); u.moonDirection.value.copy(observation.moon.horizon);
      u.moonLight.value.copy(observation.phase.lightHorizon);
      u.moonPrime.value.copy(observation.phase.frameHorizon.prime);
      u.moonEast.value.copy(observation.phase.frameHorizon.east);
      u.moonNorth.value.copy(observation.phase.frameHorizon.north);
      renderer.render(skyScene, skyCamera);
      info.target = basis.forward;
    } else {
      const local = state.view === 'planet' && state.planetCamera === 'orbit';
      const yaw = state.orbitYaw, pitch = state.orbitPitch;
      const direction = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      camera.fov = 43; camera.updateProjectionMatrix();
      if (local) {
        if (selectedPlanet !== state.body) {
          materials.delete(planet.material); planet.material.dispose();
          planet.material = planetMaterial(state.body); selectedPlanet = state.body;
        }
        orient(planet, targetBody, state.time);
        nearRings.visible = state.body === 'Saturn';
        nearGrid.visible = state.body !== 'Sun';
        surfaceMarker.visible = state.body === 'Earth';
        const lat = state.site.latitude * DEG, lon = state.site.longitude * DEG;
        surfaceMarker.position.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(1.017);
        camera.position.copy(direction.multiplyScalar((state.body === 'Saturn' ? 7 : 4.5) * state.orbitZoom * Math.max(1, 1 / camera.aspect)));
        camera.lookAt(0, 0, 0);
        renderer.render(planetScene, camera);
        const physicalOffsetScene = scale(camera.position, bodyData(state.body).radiusKm / 149597870.69098932);
        info = { labels: [], camera: add(eclipticToScene(targetBody.eclipticAu), physicalOffsetScene),
          target: eclipticToScene(targetBody.eclipticAu), frame: 'Heliocentric ECL scene axes / AU; floating origin' };
      } else {
        updateOrbits(state.time);
        for (const body of bodies) {
          const mesh = meshes.get(body.name);
          if (!mesh) continue;
          mesh.position.copy(displayPosition(body, earth)); orient(mesh, body, state.time);
        }
        paths.get('Moon')?.position.copy(displayPosition(earth));
        const target = state.view === 'planet' ? vector(displayPosition(targetBody, earth)) : new Vector3(0, 0, 0);
        const distance = (state.view === 'planet' ? Math.max(5, bodyData(state.body).displayRadius * 7) : 125) * state.orbitZoom * Math.max(1, 1 / camera.aspect);
        camera.position.copy(target).add(direction.multiplyScalar(distance));
        camera.lookAt(target);
        const selectedMesh = meshes.get(state.body);
        if (selectedMesh) {
          selection.position.copy(selectedMesh.position);
          selection.scale.setScalar(bodyData(state.body).displayRadius * 1.5 + .28);
          selection.quaternion.copy(camera.quaternion);
        }
        renderer.render(scene, camera);
        const labels = bodies.map(body => {
          const location = displayPosition(body, earth), projected = vector(location).project(camera);
          const size = bodyData(body.name).displayRadius;
          return { name: body.name, x: (projected.x + 1) * width / 2,
            y: (1 - projected.y) * height / 2 + size * 3 + 13,
            anchorX: (projected.x + 1) * width / 2, anchorY: (1 - projected.y) * height / 2,
            visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .96 && Math.abs(projected.y) < .86 };
        });
        const placed: { x: number; y: number; halfWidth: number }[] = [];
        for (const label of labels.filter(label => label.visible).sort((a, b) => a.y - b.y)) {
          const halfWidth = label.name.length * 4 + 9;
          label.x = clamp(label.x, halfWidth + 8, width - halfWidth - 8);
          for (let attempt = 0; attempt < 8; attempt++) {
            if (!placed.some(other => Math.abs(label.x - other.x) < halfWidth + other.halfWidth + 6 && Math.abs(label.y - other.y) < 31)) break;
            label.y += 32;
          }
          if (label.y > height - 125) label.visible = false;
          else placed.push({ x: label.x, y: label.y, halfWidth });
        }
        info = { labels, camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: target.x, y: target.y, z: target.z }, frame: 'Compressed heliocentric ECL display units' };
      }
    }
    canvas.dataset.frame = info.frame;
    canvas.dataset.camera = JSON.stringify(info.camera);
    canvas.dataset.target = JSON.stringify(info.target);
    canvas.dataset.body = state.body; canvas.dataset.view = state.view;
    canvas.dataset.renderCount = String(++renderCount);
    return info;
  }
  let pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true });
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
    if (pointer.moved) options.navigate((event.clientX - pointer.x) / width, (event.clientY - pointer.y) / height);
    pointer.x = event.clientX; pointer.y = event.clientY;
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const pick = !pointer.moved && latestState?.view !== 'sky' &&
      (latestState?.view === 'system' || latestState?.planetCamera === 'ride');
    pointer = null; canvas.releasePointerCapture(event.pointerId);
    if (pick) {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
      if (hit) for (const [name, mesh] of meshes) if (mesh === hit.object) options.select(name);
    }
  }, { signal });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; }, { signal });
  canvas.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) pointer = null; }, { signal });
  canvas.addEventListener('keydown', event => {
    const dx = event.key === 'ArrowLeft' ? -.045 : event.key === 'ArrowRight' ? .045 : 0;
    const dy = event.key === 'ArrowUp' ? -.045 : event.key === 'ArrowDown' ? .045 : 0;
    const zoom = event.key === '+' || event.key === '=' ? .85 : event.key === '-' ? 1.18 : undefined;
    if (dx || dy || zoom) { event.preventDefault(); options.navigate(dx, dy, zoom); }
  }, { signal });
  const wheelTarget = options.zoomTarget ?? canvas;
  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.deltaY === 0) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    options.navigate(0, 0, Math.exp(clamp(pixels, -240, 240) * .0015));
  };
  wheelTarget.addEventListener('wheel', onWheel, { signal, passive: false });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); options.report('Graphics context lost. Playback stopped; waiting for the browser to restore it.');
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    options.report('Graphics context restored. The observation remains paused.'); options.invalidate();
  }, { signal });
  return {
    draw,
    destroy() {
      if (disposed) return;
      disposed = true; resizeObserver.disconnect(); pointer = null;
      wheelTarget.removeEventListener('wheel', onWheel);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      atlas.dispose(); scene.clear(); planetScene.clear(); skyScene.clear();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
