import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { observeSize } from '../core/canvas';
import { controlRange, controlSelect, stageHint } from '../core/controls';
import { createLoop } from '../core/loop';
import { clamp } from '../core/math';
import type { ExperimentContext, ExperimentInstance } from '../core/types';
import { interactionScope, setRangeValue } from './interaction-common';

const ROWS = 16;
const SHEET_WIDTH = 7.8;
const SHEET_DEPTH = 4.3;
const THICKNESS = 0.022;
const BACKGROUND = '#bed2ec';

interface PaperVertex {
  column: number;
  row: number;
  side: number;
}

interface PaperGeometry {
  geometry: THREE.BufferGeometry;
  creases: THREE.BufferGeometry;
  positions: THREE.BufferAttribute;
  creasePositions: THREE.BufferAttribute;
  vertices: PaperVertex[];
  creaseVertices: PaperVertex[];
  panels: number;
}

function createPaperGeometry(pleats: number): PaperGeometry {
  const panels = pleats * 2;
  const geometry = new THREE.BufferGeometry();
  const vertices: PaperVertex[] = [];
  const indices: number[] = [];
  for (const side of [1, -1]) {
    const start = indices.length;
    // Separate vertices at each hinge keep the crease sharp, while the long arc stays smooth.
    for (let panel = 0; panel < panels; panel++) {
      const offset = vertices.length;
      for (let row = 0; row <= ROWS; row++) {
        vertices.push({ column: panel, row, side }, { column: panel + 1, row, side });
      }
      for (let row = 0; row < ROWS; row++) {
        const a = offset + row * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (side === 1) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
    geometry.addGroup(start, indices.length - start, side === 1 ? 0 : 1);
  }

  const edgeStart = indices.length;
  function edge(columnA: number, rowA: number, columnB: number, rowB: number) {
    const offset = vertices.length;
    vertices.push(
      { column: columnA, row: rowA, side: 1 },
      { column: columnB, row: rowB, side: 1 },
      { column: columnB, row: rowB, side: -1 },
      { column: columnA, row: rowA, side: -1 },
    );
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  for (let column = 0; column < panels; column++) {
    edge(column, 0, column + 1, 0);
    edge(column + 1, ROWS, column, ROWS);
  }
  for (let row = 0; row < ROWS; row++) {
    edge(panels, row, panels, row + 1);
    edge(0, row + 1, 0, row);
  }
  geometry.addGroup(edgeStart, indices.length - edgeStart, 2);
  const positions = new THREE.BufferAttribute(new Float32Array(vertices.length * 3), 3)
    .setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setIndex(indices);

  const creases = new THREE.BufferGeometry();
  const creaseVertices: PaperVertex[] = [];
  for (let column = 1; column < panels; column++) {
    for (let row = 0; row < ROWS; row++) {
      creaseVertices.push({ column, row, side: 1.55 }, { column, row: row + 1, side: 1.55 });
    }
  }
  const creasePositions = new THREE.BufferAttribute(new Float32Array(creaseVertices.length * 3), 3)
    .setUsage(THREE.DynamicDrawUsage);
  creases.setAttribute('position', creasePositions);
  return { geometry, creases, positions, creasePositions, vertices, creaseVertices, panels };
}

function shapePaper(paper: PaperGeometry, amount: number) {
  const fold = clamp(amount / 100, 0, 1);
  const angle = fold * 1.38;
  const panelLength = SHEET_WIDTH / paper.panels;
  const panelWidth = panelLength * Math.cos(angle);
  const rise = panelLength * Math.sin(angle);
  const bend = fold * 1.12;
  const radius = bend > 0.0001 ? SHEET_DEPTH / bend : 0;
  const rowY: number[] = [];
  const rowZ: number[] = [];
  for (let row = 0; row <= ROWS; row++) {
    const along = row / ROWS - 0.5;
    rowZ.push(bend > 0.0001 ? Math.sin(along * bend) * radius : along * SHEET_DEPTH);
    rowY.push(bend > 0.0001 ? (Math.cos(along * bend) - Math.cos(bend / 2)) * radius : 0);
  }
  function write(attribute: THREE.BufferAttribute, references: PaperVertex[]) {
    for (let index = 0; index < references.length; index++) {
      const vertex = references[index];
      const across = vertex.column / paper.panels - 0.5;
      const along = vertex.row / ROWS - 0.5;
      attribute.setXYZ(
        index,
        (vertex.column - paper.panels / 2) * panelWidth + rowZ[vertex.row] * fold * 0.055,
        (vertex.column % 2 === 0 ? -0.5 : 0.5) * rise + rowY[vertex.row] +
          across * along * fold * 0.42 + vertex.side * THICKNESS / 2,
        rowZ[vertex.row],
      );
    }
    attribute.needsUpdate = true;
  }
  write(paper.positions, paper.vertices);
  write(paper.creasePositions, paper.creaseVertices);
  paper.geometry.computeVertexNormals();
  paper.geometry.computeBoundingSphere();
  paper.creases.computeBoundingSphere();
}

export function mount(context: ExperimentContext): ExperimentInstance {
  context.signal.throwIfAborted();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (cause) {
    throw new Error('Fold Study needs WebGL 2 to render its paper sculpture. Enable hardware acceleration or try a WebGL-capable browser.', { cause });
  }
  const scope = interactionScope(context);
  const canvas = renderer.domElement;
  canvas.className = 'experiment-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label',
    'A suspended, folded paper sculpture with directional shadows. Drag to orbit and scroll to zoom. ' +
    'Arrow keys orbit, plus and minus zoom, brackets change the fold, and Home restores the studio view.');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Plus - [ ] Home');
  canvas.style.cursor = 'grab';
  context.container.append(canvas);
  scope.disposeWith(() => {
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  });
  const hint = stageHint(context.container, 'Drag to orbit / scroll to zoom / [ and ] to fold');
  scope.disposeWith(() => hint.remove());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(5.2, 8.5, 9.5);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 0.28, 0);
  orbit.enablePan = false;
  orbit.enableDamping = false;
  orbit.rotateSpeed = 0.7;
  orbit.zoomSpeed = 0.7;
  orbit.minPolarAngle = 0.16;
  orbit.maxPolarAngle = Math.PI / 2 - 0.08;
  orbit.update();
  scope.disposeWith(() => orbit.dispose());

  const hemisphere = new THREE.HemisphereLight('#f7f5ed', '#8097ba', 0.95);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight('#fff4de', 2.4);
  key.position.set(-3.8, 7.5, 5.2);
  key.castShadow = true;
  const shadowSize = context.container.clientWidth < 600 ? 1024 : 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 3;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const fill = new THREE.DirectionalLight('#b8d1f6', 0.35);
  fill.position.set(5, 3, -4);
  scene.add(fill);

  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.ShadowMaterial({ color: '#354d6c', opacity: 0.25 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.9;
  ground.receiveShadow = true;
  scene.add(ground);

  const frontMaterial = new THREE.MeshStandardMaterial({
    color: '#f4eddd', roughness: 0.84, metalness: 0, shadowSide: THREE.DoubleSide,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4eddd').multiplyScalar(0.83), roughness: 0.94, metalness: 0,
    shadowSide: THREE.DoubleSide,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4eddd').multiplyScalar(0.66), roughness: 1,
  });
  const creaseMaterial = new THREE.LineBasicMaterial({
    color: '#6d695d', transparent: true, opacity: 0.15, depthWrite: false,
  });
  let pleats = 8;
  let targetFold = 58;
  let paper = createPaperGeometry(pleats);
  shapePaper(paper, targetFold);
  const sheet = new THREE.Mesh(paper.geometry, [frontMaterial, backMaterial, edgeMaterial]);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  const creaseLines = new THREE.LineSegments(paper.creases, creaseMaterial);
  const sculpture = new THREE.Group();
  sculpture.add(sheet, creaseLines);
  sculpture.rotation.set(0, -0.11, 0.045);
  sculpture.position.y = 0.44;
  scene.add(sculpture);
  let paused = context.reducedMotion;
  let graphicsLost = false;
  let lastElapsed = 0;
  let phaseOrigin = 0;
  let lastFold = targetFold;
  let view = 'studio';
  let finish = 'paper';

  const loop = createLoop((elapsed) => {
    if (graphicsLost) return;
    lastElapsed = elapsed;
    const phase = elapsed - phaseOrigin;
    const breath = Math.sin(phase * 0.72) * 0.75 * Math.sin(targetFold / 100 * Math.PI);
    const nextFold = clamp(targetFold + breath, 0, 100);
    if (Math.abs(nextFold - lastFold) > 0.001) {
      shapePaper(paper, nextFold);
      lastFold = nextFold;
    }
    sculpture.position.y = 0.44 + Math.sin(phase * 0.6) * 0.035;
    renderer.render(scene, camera);
  }, { paused });

  function frameCamera(allowCloser = true) {
    const direction = camera.position.clone().sub(orbit.target).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    sculpture.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    let distance = 0;
    for (let index = 0; index < paper.positions.count; index++) {
      point.fromBufferAttribute(paper.positions, index).applyMatrix4(sculpture.matrixWorld).sub(orbit.target);
      const depth = point.dot(direction);
      distance = Math.max(
        distance,
        depth + Math.abs(point.dot(right)) / (tangent * camera.aspect) * 1.24,
        depth + Math.abs(point.dot(up)) / tangent * 1.27,
      );
    }
    const fitDistance = distance;
    if (!allowCloser) distance = Math.max(distance, camera.position.distanceTo(orbit.target));
    camera.position.copy(orbit.target).addScaledVector(direction, distance);
    camera.near = Math.max(0.05, distance / 100);
    camera.far = Math.max(80, distance * 6);
    camera.updateProjectionMatrix();
    orbit.minDistance = fitDistance * 0.48;
    orbit.maxDistance = fitDistance * 2.25;
    orbit.update();
  }

  function setView(value: string) {
    view = value;
    orbit.target.set(0, 0.28, 0);
    if (view === 'overhead') camera.position.set(0.01, 11, 1.85);
    else if (view === 'profile') camera.position.set(8, 2.6, 8.5);
    else camera.position.set(5.2, 8.5, 9.5);
    frameCamera();
    loop.requestRender();
  }

  function rebuildPaper(count: number) {
    const previous = paper;
    pleats = count;
    paper = createPaperGeometry(pleats);
    shapePaper(paper, lastFold);
    sheet.geometry = paper.geometry;
    creaseLines.geometry = paper.creases;
    previous.geometry.dispose();
    previous.creases.dispose();
    frameCamera(false);
    loop.requestRender();
  }

  function setFinish(value: string) {
    finish = value;
    const color = new THREE.Color(finish === 'ink' ? '#303c4c' : finish === 'terracotta' ? '#bd644b' : '#f4eddd');
    frontMaterial.color.copy(color);
    backMaterial.color.copy(color).multiplyScalar(0.83);
    edgeMaterial.color.copy(color).multiplyScalar(0.66);
    creaseMaterial.color.set(finish === 'ink' ? '#a8bace' : finish === 'terracotta' ? '#713c2e' : '#6d695d');
    creaseMaterial.opacity = finish === 'ink' ? 0.14 : 0.15;
    loop.requestRender();
  }

  const foldControl = scope.ownControl(controlRange(context.controls, {
    label: 'Fold', min: 0, max: 100, step: 1, value: targetFold,
    format: (value) => `${value}%`,
    onChange: (value) => {
      targetFold = value;
      phaseOrigin = lastElapsed;
      shapePaper(paper, value);
      lastFold = value;
      frameCamera(false);
      loop.requestRender();
    },
  }));
  const pleatControl = scope.ownControl(controlRange(context.controls, {
    label: 'Pleats', min: 4, max: 14, step: 1, value: pleats,
    onChange: rebuildPaper,
  }));
  const materialControl = scope.ownControl(controlSelect(context.controls, {
    label: 'Material', value: finish,
    choices: [
      { value: 'paper', label: 'Warm paper' },
      { value: 'ink', label: 'Blue ink' },
      { value: 'terracotta', label: 'Terracotta' },
    ],
    onChange: setFinish,
  }));
  const viewControl = scope.ownControl(controlSelect(context.controls, {
    label: 'View', value: view,
    choices: [
      { value: 'studio', label: 'Three-quarter' },
      { value: 'overhead', label: 'From above' },
      { value: 'profile', label: 'Low angle' },
    ],
    onChange: (value) => {
      setView(value);
      context.report(value === 'overhead' ? 'Looking down onto the creases.' :
        value === 'profile' ? 'A low view of the paper planes.' : 'The studio view is restored.');
    },
  }));
  const disposeResize = observeSize(context.container, ({ width, height, dpr }) => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    frameCamera();
    loop.requestRender();
  });
  scope.disposeWith(disposeResize);

  const onOrbit = () => loop.requestRender();
  const onOrbitStart = () => { canvas.style.cursor = 'grabbing'; };
  const onOrbitEnd = () => { canvas.style.cursor = 'grab'; };
  orbit.addEventListener('change', onOrbit);
  orbit.addEventListener('start', onOrbitStart);
  orbit.addEventListener('end', onOrbitEnd);
  scope.disposeWith(() => {
    orbit.removeEventListener('change', onOrbit);
    orbit.removeEventListener('start', onOrbitStart);
    orbit.removeEventListener('end', onOrbitEnd);
  });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), { signal: scope.signal });
  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const offset = camera.position.clone().sub(orbit.target);
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const amount = event.shiftKey ? 0.22 : 0.1;
      spherical.theta += event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
      spherical.phi = clamp(spherical.phi + (event.key === 'ArrowUp' ? -amount :
        event.key === 'ArrowDown' ? amount : 0), orbit.minPolarAngle, orbit.maxPolarAngle);
      camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical));
      orbit.update();
      loop.requestRender();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      const distance = clamp(offset.length() * (event.key === '-' ? 1.12 : 1 / 1.12), orbit.minDistance, orbit.maxDistance);
      camera.position.copy(orbit.target).add(offset.setLength(distance));
      orbit.update();
      loop.requestRender();
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      setRangeValue(foldControl, clamp(targetFold + (event.key === ']' ? 5 : -5), 0, 100));
    } else if (event.key === 'Home') {
      event.preventDefault();
      viewControl.value = 'studio';
      setView('studio');
    }
  }, { signal: scope.signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    graphicsLost = true;
    loop.setPaused(true);
    context.report('The graphics connection was lost. Fold Study will redraw when the browser restores it.');
  }, { signal: scope.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    graphicsLost = false;
    loop.setPaused(paused);
    loop.requestRender();
    context.report('The graphics connection is restored.');
  }, { signal: scope.signal });

  scope.disposeWith(() => {
    paper.geometry.dispose();
    paper.creases.dispose();
    frontMaterial.dispose();
    backMaterial.dispose();
    edgeMaterial.dispose();
    creaseMaterial.dispose();
    groundGeometry.dispose();
    groundMaterial.dispose();
    key.shadow.dispose();
    scene.clear();
  });
  scope.disposeWith(loop.destroy);
  return {
    destroy: scope.destroy,
    setPaused(value) {
      paused = value;
      loop.setPaused(value || graphicsLost);
    },
    reset() {
      phaseOrigin = lastElapsed;
      setRangeValue(foldControl, 58);
      setRangeValue(pleatControl, 8);
      materialControl.value = 'paper';
      setFinish('paper');
      viewControl.value = 'studio';
      setView('studio');
      shapePaper(paper, 58);
      lastFold = 58;
      context.report('The original paper, eight pleats, and studio view are restored.');
      loop.requestRender();
    },
  };
}
