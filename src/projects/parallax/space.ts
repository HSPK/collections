import * as THREE from 'three';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { IMAGE_HEIGHT, IMAGE_WIDTH, rayPoint } from './camera';
import type { Camera } from './camera';
import { add, mul, norm, sub } from './math';
import type { Experiment, Reconstruction } from './state';
import { cameras, WORLD } from './world';

export interface SpaceOptions {
  host: HTMLElement;
  images: [HTMLCanvasElement, HTMLCanvasElement];
  signal: AbortSignal;
  select: (id: string) => void;
  report: (message: string) => void;
  pointerOwner: { id: number | null };
}
export function createSpace(options: SpaceOptions) {
  const canvas = document.createElement('canvas');
  canvas.className = 'px-space-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Reconstruction volume. Arrow keys orbit, plus and minus zoom, Home resets. Use the landmark selector to pick numerically.');
  options.host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const target = new THREE.WebGLRenderTarget(IMAGE_WIDTH, IMAGE_HEIGHT, { depthBuffer: true });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const resources = new Set<{ dispose: () => void }>();
  const own = <T extends { dispose: () => void }>(resource: T): T => { resources.add(resource); return resource; };
  own(target);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#172321');
  const exposureScene = new THREE.Scene();
  exposureScene.background = new THREE.Color('#d7d8cc');
  function lightScene(s: THREE.Scene, shadow: boolean) {
    s.add(new THREE.HemisphereLight('#fff9df', '#68766d', 2.3));
    const light = new THREE.DirectionalLight('#fff8df', 3.1);
    light.position.set(-5, 13, 8);
    light.castShadow = shadow;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -8, right: 8, top: 10, bottom: -8, near: 0.5, far: 40 });
    light.shadow.bias = -0.001;
    s.add(light);
    return light;
  }
  const light = lightScene(exposureScene, true);
  lightScene(scene, false);
  const grouped = new Map<string, number[]>();
  for (const surface of WORLD.surfaces) {
    if (!grouped.has(surface.color)) grouped.set(surface.color, []);
    grouped.get(surface.color)!.push(...surface.vertices.flat());
  }
  for (const [color, vertices] of grouped) {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const material = own(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    exposureScene.add(mesh);
  }
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(200, 200)), own(new THREE.MeshStandardMaterial({ color: '#bdc3b5', roughness: 1 })));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.54; floor.receiveShadow = true;
  exposureScene.add(floor);
  const grid = new THREE.GridHelper(22, 22, '#52635a', '#30433d');
  grid.position.y = -0.55;
  scene.add(grid);
  own(grid.geometry);
  if (Array.isArray(grid.material)) grid.material.forEach(own); else own(grid.material);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 220);
  let yaw = 0.65, elevation = 0.52, distance = 24;
  const lookTarget = new THREE.Vector3(0, 2.1, 3);
  let homeDistance = 24, currentStudy = 'signal';
  const sphere = own(new THREE.SphereGeometry(1, 10, 7));
  const pointMaterial = own(new THREE.MeshBasicMaterial({ color: '#e9d573' }));
  const rawMaterial = own(new THREE.MeshBasicMaterial({ color: '#879b91', wireframe: true, transparent: true, opacity: 0.3 }));
  const selectedMaterial = own(new THREE.MeshBasicMaterial({ color: '#ffdd55' }));
  const points = new THREE.InstancedMesh(sphere, pointMaterial, WORLD.landmarks.length);
  const rawPoints = new THREE.InstancedMesh(sphere, rawMaterial, WORLD.landmarks.length);
  own(points); own(rawPoints);
  scene.add(points, rawPoints);
  const selected = new THREE.Mesh(sphere, selectedMaterial);
  scene.add(selected);
  const ellipsoid = new THREE.Mesh(own(new THREE.SphereGeometry(1, 24, 12)), own(new THREE.MeshBasicMaterial({ color: '#ffdd55', wireframe: true, transparent: true, opacity: 0.35 })));
  scene.add(ellipsoid);
  function segments(color: string, opacity = 1) {
    const geometry = own(new THREE.BufferGeometry());
    const material = own(new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    const line = new THREE.LineSegments(geometry, material);
    scene.add(line);
    return line;
  }
  const recoveredEdges = segments('#b7bda0', 0.6), raysA = segments('#ffdd55'), raysB = segments('#e8eee2');
  const frusta = segments('#829c8d', 0.75), truth = segments('#91a99e', 0.25), axes = segments('#718a7b', 0.8);
  const setSegments = (line: THREE.LineSegments, coordinates: number[]) => {
    let attribute = line.geometry.getAttribute('position');
    if (!attribute) {
      attribute = new THREE.Float32BufferAttribute(new Float32Array(Math.max(coordinates.length, WORLD.edges.length * 6)), 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      line.geometry.setAttribute('position', attribute);
    }
    attribute.array.set(coordinates);
    attribute.array.fill(0, coordinates.length);
    attribute.needsUpdate = true;
    line.geometry.setDrawRange(0, coordinates.length / 3);
    line.geometry.computeBoundingSphere();
  };
  setSegments(truth, WORLD.surfaces.flatMap((s) => [...s.vertices[0], ...s.vertices[1], ...s.vertices[1], ...s.vertices[2], ...s.vertices[2], ...s.vertices[0]]));
  truth.visible = false;
  setSegments(axes, [[0, -0.5, 0], [4, -0.5, 0], [0, -0.5, 0], [0, 3.5, 0], [0, -0.5, 0], [0, -0.5, 4]].flat());
  const labels: THREE.Sprite[] = [];
  function label(text: string, color = '#d5dfd2') {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128; labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is required for spatial labels.');
    ctx.font = 'bold 32px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#172321'; ctx.fillRect(24, 8, 80, 48);
    ctx.fillStyle = color; ctx.fillText(text, 64, 33);
    const texture = own(new THREE.CanvasTexture(labelCanvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false })));
    sprite.scale.set(0.08, 0.04, 1);
    labels.push(sprite);
    scene.add(sprite);
    return sprite;
  }
  const cameraLabels = [label('A', '#ffdd55'), label('B')];
  label('X').position.set(4.5, -0.45, 0);
  label('Y').position.set(0, 4, 0);
  label('Z').position.set(0, -0.45, 4.5);
  const contexts = options.images.map((image) => {
    image.width = IMAGE_WIDTH; image.height = IMAGE_HEIGHT;
    const ctx = image.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is required for camera exposures.');
    return ctx;
  });
  const pixels = new Uint8Array(IMAGE_WIDTH * IMAGE_HEIGHT * 4);
  const image = new ImageData(IMAGE_WIDTH, IMAGE_HEIGHT);
  function calibratedCamera(source: Camera) {
    const c = new THREE.PerspectiveCamera(2 * Math.atan(IMAGE_HEIGHT / (2 * source.fy)) * 180 / Math.PI, IMAGE_WIDTH / IMAGE_HEIGHT, 0.05, 200);
    c.position.set(...source.center);
    c.up.set(...mul(source.rotation[1], -1));
    c.lookAt(...add(source.center, source.rotation[2]));
    // makePerspective supports independently calibrated fx/fy and principal point.
    const n = c.near;
    c.projectionMatrix.makePerspective(-source.cx * n / source.fx, (IMAGE_WIDTH - source.cx) * n / source.fx, source.cy * n / source.fy, -(IMAGE_HEIGHT - source.cy) * n / source.fy, n, c.far);
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    return c;
  }
  let exposureKey = '';
  function renderExposures(experiment: Experiment) {
    if (contextLost) return;
    const key = JSON.stringify([experiment.study, experiment.exposure]);
    if (key === exposureKey) return;
    exposureKey = key;
    const pair = cameras(experiment.study, experiment.exposure);
    pair.forEach((source, i) => {
      renderer.setRenderTarget(target);
      renderer.render(exposureScene, calibratedCamera(source));
      renderer.readRenderTargetPixels(target, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT, pixels);
      for (let row = 0; row < IMAGE_HEIGHT; row++) {
        const offset = (IMAGE_HEIGHT - row - 1) * IMAGE_WIDTH * 4;
        image.data.set(pixels.subarray(offset, offset + IMAGE_WIDTH * 4), row * IMAGE_WIDTH * 4);
      }
      contexts[i].putImageData(image, 0, 0);
    });
    renderer.setRenderTarget(null);
  }
  let destroyed = false, renders = 0, contextLost = false;
  const loop = createLoop(() => {
    if (destroyed || contextLost || options.host.clientWidth < 1 || options.host.clientHeight < 1) return;
    const fittedDistance = distance * Math.max(1, 0.72 / camera.aspect);
    camera.position.set(lookTarget.x + fittedDistance * Math.cos(elevation) * Math.sin(yaw), lookTarget.y + fittedDistance * Math.sin(elevation), lookTarget.z + fittedDistance * Math.cos(elevation) * Math.cos(yaw));
    camera.lookAt(lookTarget);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    canvas.dataset.renderCount = String(++renders);
  }, { paused: true });
  const resize = new ResizeObserver(() => {
    const width = options.host.clientWidth, height = options.host.clientHeight;
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const labelHeight = 72 * Math.tan(camera.fov * Math.PI / 360) / height;
    labels.forEach((sprite) => sprite.scale.set(labelHeight * 2, labelHeight, 1));
    loop.requestRender();
  });
  resize.observe(options.host);
  let pickIds: string[] = [];
  function update(experiment: Experiment, results: Reconstruction[]) {
    if (currentStudy !== experiment.study) {
      const pair = cameras(experiment.study, experiment.calibration);
      const midpoint = mul(add(pair[0].center, pair[1].center), 0.5);
      homeDistance = experiment.study === 'signal' ? 24 : Math.max(24, norm(sub(midpoint, [0, 2.5, 0])) * 1.6);
      lookTarget.set(experiment.study === 'signal' ? 0 : midpoint[0] * 0.4, 2.1, experiment.study === 'signal' ? 3 : midpoint[2] * 0.4);
      currentStudy = experiment.study;
      yaw = 0.65; elevation = 0.52; distance = homeDistance;
    }
    renderExposures(experiment);
    const matrix = new THREE.Matrix4();
    pickIds = [];
    let rawCount = 0;
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const result of results) {
      if (result.point) {
        matrix.makeScale(0.058, 0.058, 0.058); matrix.setPosition(...result.point);
        points.setMatrixAt(pickIds.length, matrix); pickIds.push(result.id);
      }
      if (result.raw && result.point && experiment.method !== 'raw') {
        matrix.makeScale(0.07, 0.07, 0.07); matrix.setPosition(...result.raw); rawPoints.setMatrixAt(rawCount++, matrix);
      }
    }
    points.count = pickIds.length; points.instanceMatrix.needsUpdate = true; points.computeBoundingSphere();
    rawPoints.count = rawCount; rawPoints.instanceMatrix.needsUpdate = true; rawPoints.computeBoundingSphere();
    const edgeCoordinates: number[] = [];
    for (const [a, b] of WORLD.edges) {
      const pa = byId.get(a)?.point, pb = byId.get(b)?.point;
      if (pa && pb) edgeCoordinates.push(...pa, ...pb);
    }
    setSegments(recoveredEdges, edgeCoordinates);
    const result = byId.get(experiment.selected);
    selected.visible = !!result?.point;
    ellipsoid.visible = !!result?.point && !!result.uncertainty && experiment.sigma > 0;
    if (result?.point) {
      selected.position.set(...result.point); selected.scale.setScalar(0.11);
      if (result.uncertainty) {
        const { radii, axes: basis } = result.uncertainty;
        ellipsoid.matrixAutoUpdate = false;
        ellipsoid.matrix.set(
          basis[0][0] * radii[0], basis[0][1] * radii[1], basis[0][2] * radii[2], result.point[0],
          basis[1][0] * radii[0], basis[1][1] * radii[1], basis[1][2] * radii[2], result.point[1],
          basis[2][0] * radii[0], basis[2][1] * radii[1], basis[2][2] * radii[2], result.point[2],
          0, 0, 0, 1,
        );
      }
    }
    truth.visible = experiment.reveal;
    const pair = cameras(experiment.study, experiment.calibration);
    const frustumCoordinates: number[] = [];
    pair.forEach((c, i) => {
      const corners = [[0, 0], [960, 0], [960, 640], [0, 640]].map(([x, y]) => rayPoint(c, [x, y], 1.9));
      for (let k = 0; k < 4; k++) frustumCoordinates.push(...c.center, ...corners[k], ...corners[k], ...corners[(k + 1) % 4]);
      cameraLabels[i].position.set(...add(c.center, [0, 0.65, 0]));
    });
    setSegments(frusta, frustumCoordinates);
    const observation = experiment.observations.find((o) => o.id === experiment.selected);
    for (let i = 0; i < 2; i++) {
      const pixel = i === 0 ? observation?.a : observation?.b, c = pair[i];
      const rayLength = result?.raw ? norm(sub(result.raw, c.center)) * 1.07 : norm(sub([0, 2.5, 0], c.center));
      const end = pixel ? rayPoint(c, pixel, rayLength) : null;
      setSegments(i === 0 ? raysA : raysB, end ? [...c.center, ...end] : []);
    }
    canvas.dataset.points = String(pickIds.length);
    loop.requestRender();
  }
  let mode: 'orbit' | 'pick' = 'orbit';
  let pointer: { id: number; x: number; y: number; moved: boolean } | null = null;
  const signal = options.signal;
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer || options.pointerOwner.id !== null || event.button !== 0) return;
    options.pointerOwner.id = event.pointerId;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true;
    if (mode === 'orbit') {
      yaw -= dx * 0.007; elevation = clamp(elevation + dy * 0.006, 0.06, 1.4);
      loop.requestRender();
    }
    pointer.x = event.clientX; pointer.y = event.clientY;
  }, { signal });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.moved && mode === 'pick') {
      const rect = canvas.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObject(points)[0];
      if (hit?.instanceId !== undefined && pickIds[hit.instanceId]) options.select(pickIds[hit.instanceId]);
    }
    pointer = null;
    options.pointerOwner.id = null;
    canvas.releasePointerCapture(event.pointerId);
  }, { signal });
  const cancel = () => {
    if (pointer?.id === options.pointerOwner.id) options.pointerOwner.id = null;
    pointer = null;
  };
  canvas.addEventListener('pointercancel', cancel, { signal });
  canvas.addEventListener('lostpointercapture', cancel, { signal });
  canvas.addEventListener('wheel', (event) => {
    if (mode !== 'orbit') return;
    event.preventDefault();
    distance = clamp(distance * Math.exp(event.deltaY * 0.001), 8, 70);
    loop.requestRender();
  }, { signal, passive: false });
  const resetView = () => { yaw = 0.65; elevation = 0.52; distance = homeDistance; loop.requestRender(); };
  canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= 0.12;
    if (event.key === 'ArrowRight') yaw += 0.12;
    if (event.key === 'ArrowUp') elevation = clamp(elevation + 0.08, 0.06, 1.4);
    if (event.key === 'ArrowDown') elevation = clamp(elevation - 0.08, 0.06, 1.4);
    if (event.key === '+' || event.key === '=') distance = clamp(distance * 0.9, 8, 70);
    if (event.key === '-') distance = clamp(distance / 0.9, 8, 70);
    if (event.key === 'Home') resetView();
    loop.requestRender();
  }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); contextLost = true;
    options.report('WebGL context lost. Pixel editing and numerical results remain available; reopen the study to restore the spatial view.');
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; exposureKey = ''; loop.requestRender(); }, { signal });
  return {
    update, resetView,
    setMode(value: 'orbit' | 'pick') { mode = value; canvas.dataset.mode = value; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resize.disconnect(); loop.destroy();
      light.shadow.map?.dispose();
      for (const resource of resources) resource.dispose();
      scene.clear(); exposureScene.clear();
      renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
      for (const image of options.images) { image.width = 0; image.height = 0; }
    },
  };
}
