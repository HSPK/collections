import * as THREE from 'three';
import { random } from '../../core/math';
import type { SpatialStage } from '../../core/spatial';
import {
  CYCLE_SECONDS, MOORING, WATER_SEGMENTS, WATER_SIZE, interpolateWaterTriangle,
  islandHeight, islandRadius, waterCell, waterHeight, waterSurfaceHeight,
} from './data';

export interface CoastalSnapshot {
  time: number;
  tide: number;
  daylight: number;
  waterHeight: number;
  floatHeight: number;
  beaconAngle: number;
  camera: string;
}

export function createCoastalScene(stage: SpatialStage) {
  const own = stage.own;
  const seed = random(360824);
  const scene = stage.scene;
  const material = (color: string, options: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color, roughness: 0.87, ...options }));
  const stone = material('#ffffff', { flatShading: true, vertexColors: true });
  const ivory = material('#eee7cf');
  const chalk = material('#d6d5bd');
  const navy = material('#243c4a', { roughness: 0.65 });
  const rust = material('#b95640');
  const wood = material('#9b8b6c');
  const roof = material('#6a7776');
  const glass = material('#d9ad65', { emissive: '#f2b861', emissiveIntensity: 0.3 });
  const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
  const unitCylinder = own(new THREE.CylinderGeometry(1, 1, 1, 12));
  const rockGeometry = own(new THREE.IcosahedronGeometry(1, 0));
  const transform = new THREE.Object3D();

  function mesh(
    geometry: THREE.BufferGeometry, surface: THREE.Material,
    parent: THREE.Object3D = scene, shadows = true,
  ) {
    const object = new THREE.Mesh(geometry, surface);
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }

  function box(
    parent: THREE.Object3D, surface: THREE.Material,
    size: [number, number, number], position: [number, number, number],
  ) {
    const object = mesh(unitBox, surface, parent);
    object.scale.set(...size);
    object.position.set(...position);
    return object;
  }

  function cylinder(
    parent: THREE.Object3D, surface: THREE.Material,
    top: number, bottom: number, height: number,
    position: [number, number, number], segments = 24,
  ) {
    const object = mesh(own(new THREE.CylinderGeometry(top, bottom, height, segments)), surface, parent);
    object.position.set(...position);
    return object;
  }

  function instances(
    geometry: THREE.BufferGeometry, surface: THREE.Material, count: number,
    place: (index: number, object: THREE.Object3D) => void, shadows = true,
  ) {
    const object = own(new THREE.InstancedMesh(geometry, surface, count));
    for (let i = 0; i < count; i++) {
      transform.position.set(0, 0, 0);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      place(i, transform);
      transform.updateMatrix();
      object.setMatrixAt(i, transform.matrix);
    }
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    scene.add(object);
    return object;
  }

  const hemi = new THREE.HemisphereLight('#e6f2ff', '#69776d', 2.4);
  const sunLight = new THREE.DirectionalLight('#ffdfb2', 3.1);
  sunLight.position.set(-10, 16, 7);
  sunLight.castShadow = true;
  const shadowSize = stage.size.width < 600 ? 512 : 768;
  sunLight.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sunLight.shadow.camera, {
    left: -11, right: 11, top: 13, bottom: -10, near: 0.5, far: 48,
  });
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.normalBias = 0.04;
  sunLight.shadow.bias = -0.0003;
  own(sunLight.shadow);
  scene.add(hemi, sunLight);
  scene.fog = new THREE.Fog('#e5ded4', 30, 92);

  const skyMaterial = own(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#add1e4') },
      uHorizon: { value: new THREE.Color('#f2d8c5') },
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying vec3 vPosition;
      void main() {
        float height = smoothstep(-0.06, 0.64, normalize(vPosition).y);
        gl_FragColor = vec4(mix(uHorizon, uTop, height), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  mesh(own(new THREE.SphereGeometry(145, 32, 16)), skyMaterial, scene, false);
  const sunMaterial = own(new THREE.MeshBasicMaterial({ color: '#fff1ce', fog: false }));
  const sun = mesh(own(new THREE.SphereGeometry(3.6, 20, 12)), sunMaterial, scene, false);
  sun.position.set(-32, 19, -67);

  const cloudMaterial = material('#f2dfcf', { flatShading: true });
  instances(own(new THREE.IcosahedronGeometry(1, 1)), cloudMaterial, 9, (i, object) => {
    const cluster = Math.floor(i / 3);
    object.position.set(-34 + cluster * 31 + (i % 3) * 5, 13 + cluster * 1.3, -51 - cluster * 5);
    object.scale.set(7 + seed() * 2, 0.65 + seed() * 0.35, 2.5);
  }, false);
  const distantMaterial = material('#8b9ba2', { flatShading: true });
  instances(rockGeometry, distantMaterial, 9, (i, object) => {
    object.position.set(-43 + i * 5.7, -0.7, -34 - Math.sin(i) * 4);
    object.scale.set(4 + seed() * 3, 1.4 + seed() * 1.8, 3 + seed() * 2);
    object.rotation.y = seed() * Math.PI;
  }, false);

  const cliffPositions: number[] = [];
  const cliffColors: number[] = [];
  const cliffIndices: number[] = [];
  const slices = 64;
  const rings = [
    { radius: 1.06, height: -1.35 },
    { radius: 1.09, height: -0.28 },
    { radius: 1.01, height: 0.85 },
    { radius: 0.97, height: 1.67 },
    { radius: 0.87, height: 3 },
  ];
  const stratum = ['#455966', '#6c7d7a', '#939b8c', '#778c86', '#b0af96'];
  for (let ring = 0; ring < rings.length; ring++) {
    for (let i = 0; i < slices; i++) {
      const angle = i / slices * Math.PI * 2;
      const radius = islandRadius(angle) * rings[ring].radius;
      const x = Math.cos(angle) * 6.25 * radius;
      const z = Math.sin(angle) * 3.75 * radius;
      const y = ring === 4 ? islandHeight(x, z) : Math.min(
        rings[ring].height + Math.sin(angle * 5 + ring * 0.8) * 0.13,
        islandHeight(x, z) - 0.22,
      );
      cliffPositions.push(x, y, z);
      const color = new THREE.Color(stratum[ring]).multiplyScalar(0.9 + seed() * 0.2);
      cliffColors.push(color.r, color.g, color.b);
      if (ring < rings.length - 1) {
        const a = ring * slices + i;
        const b = ring * slices + (i + 1) % slices;
        cliffIndices.push(a, a + slices, b, b, a + slices, b + slices);
      }
    }
  }
  const cliffGeometry = own(new THREE.BufferGeometry());
  cliffGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cliffPositions, 3));
  cliffGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cliffColors, 3));
  cliffGeometry.setIndex(cliffIndices);
  cliffGeometry.computeVertexNormals();
  mesh(cliffGeometry, stone);

  const grassPositions = [0, islandHeight(0, 0), 0];
  const grassColors: number[] = [];
  const grassIndices: number[] = [];
  const grassCenter = new THREE.Color('#829865');
  grassColors.push(grassCenter.r, grassCenter.g, grassCenter.b);
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < slices; i++) {
      const angle = i / slices * Math.PI * 2;
      const radius = islandRadius(angle) * (ring ? 0.87 : 0.43);
      const x = Math.cos(angle) * 6.25 * radius;
      const z = Math.sin(angle) * 3.75 * radius;
      grassPositions.push(x, islandHeight(x, z) + 0.018, z);
      const color = new THREE.Color(ring ? '#9ba174' : '#829569').multiplyScalar(0.9 + seed() * 0.17);
      grassColors.push(color.r, color.g, color.b);
      const a = 1 + ring * slices + i;
      const b = 1 + ring * slices + (i + 1) % slices;
      if (!ring) grassIndices.push(0, b, a);
      else grassIndices.push(a - slices, b - slices, a, b - slices, b, a);
    }
  }
  const grassGeometry = own(new THREE.BufferGeometry());
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  grassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3));
  grassGeometry.setIndex(grassIndices);
  grassGeometry.computeVertexNormals();
  mesh(grassGeometry, material('#ffffff', { vertexColors: true, flatShading: true }));

  const shoreRocks = instances(rockGeometry, material('#89938d', { flatShading: true }), 66, (i, object) => {
    const angle = i / 66 * Math.PI * 2 + seed() * 0.07;
    const radius = islandRadius(angle) * (1.02 + seed() * 0.22);
    object.position.set(Math.cos(angle) * 6.25 * radius, -0.05 + seed() * 0.35, Math.sin(angle) * 3.75 * radius);
    const size = 0.24 + seed() * 0.58;
    object.scale.set(size * (1.1 + seed()), size * (0.8 + seed()), size);
    object.rotation.set(seed(), seed() * Math.PI, seed() * 0.4);
  });
  for (let i = 0; i < 66; i++) shoreRocks.setColorAt(i, new THREE.Color().setHSL(0.13, 0.08, 0.68 + seed() * 0.18));

  const bladeGeometry = own(new THREE.BufferGeometry());
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.09, 0, 0, 0.02, 0.32, 0.01, 0.05, 0, 0,
    0, 0, -0.08, 0.04, 0.24, 0.04, 0, 0, 0.08,
    -0.06, 0, 0.07, -0.07, 0.22, -0.04, 0.07, 0, -0.06,
  ], 3));
  bladeGeometry.computeVertexNormals();
  instances(bladeGeometry, material('#748554', { side: THREE.DoubleSide }), 95, (_, object) => {
    const angle = seed() * Math.PI * 2;
    const r = 0.37 + seed() * 0.39;
    const x = Math.cos(angle) * 6.0 * r;
    const z = Math.sin(angle) * 3.75 * r;
    object.position.set(x, islandHeight(x, z), z);
    object.rotation.y = seed() * Math.PI;
    object.scale.setScalar(0.75 + seed() * 0.6);
  }, false);

  const path = [
    [-1.85, 0.45], [-0.95, 0.85], [0.2, 0.78], [1.35, 1.15],
    [2.5, 1.05], [3.65, 1.2], [4.65, 1.75], [4.65, 2.2],
  ];
  const pathVertices: number[] = [];
  const pathIndices: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i];
    const next = path[Math.min(i + 1, path.length - 1)];
    const previous = path[Math.max(0, i - 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      const px = x - dz / length * 0.19 * side;
      const pz = z + dx / length * 0.19 * side;
      pathVertices.push(px, islandHeight(px, pz) + 0.065, pz);
    }
    if (i) pathIndices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  }
  const pathGeometry = own(new THREE.BufferGeometry());
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathVertices, 3));
  pathGeometry.setIndex(pathIndices);
  pathGeometry.computeVertexNormals();
  mesh(pathGeometry, material('#c8bc99', { side: THREE.DoubleSide }));

  const tower = new THREE.Group();
  tower.position.set(-2.25, islandHeight(-2.25, -0.45), -0.45);
  scene.add(tower);
  cylinder(tower, chalk, 1.02, 1.11, 0.18, [0, 0.09, 0]);
  cylinder(tower, ivory, 0.78, 0.9, 0.17, [0, 0.25, 0]);
  let towerY = 0.34;
  for (let stripe = 0; stripe < 6; stripe++) {
    const height = stripe === 5 ? 0.55 : 0.69;
    const bottom = 0.7 - stripe * 0.043;
    cylinder(tower, stripe === 1 || stripe === 4 ? rust : ivory, bottom - 0.043, bottom, height, [0, towerY + height / 2, 0], 32);
    towerY += height;
  }
  const door = box(tower, navy, [0.3, 0.61, 0.07], [0, 0.63, 0.68]);
  door.rotation.x = -0.045;
  box(tower, chalk, [0.42, 0.09, 0.3], [0, 0.29, 0.83]);
  for (const [height, radius] of [[1.76, 0.61], [3.03, 0.53]]) {
    box(tower, navy, [0.17, 0.35, 0.045], [0, height, radius]);
    box(tower, glass, [0.105, 0.27, 0.05], [0, height, radius + 0.01]);
    box(tower, ivory, [0.21, 0.045, 0.09], [0, height - 0.19, radius + 0.01]);
  }
  cylinder(tower, navy, 0.85, 0.74, 0.12, [0, 4.4, 0]);
  cylinder(tower, chalk, 0.83, 0.83, 0.045, [0, 4.48, 0]);
  const galleryPosts = own(new THREE.InstancedMesh(unitCylinder, navy, 16));
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2;
    transform.position.set(Math.cos(angle) * 0.78, 4.67, Math.sin(angle) * 0.78);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(0.019, 0.38, 0.019);
    transform.updateMatrix();
    galleryPosts.setMatrixAt(i, transform.matrix);
  }
  tower.add(galleryPosts);
  const galleryRing = own(new THREE.TorusGeometry(0.78, 0.022, 5, 32));
  for (const height of [4.59, 4.84]) {
    const railing = mesh(galleryRing, navy, tower, false);
    railing.position.y = height;
    railing.rotation.x = Math.PI / 2;
  }
  cylinder(tower, navy, 0.54, 0.55, 0.13, [0, 4.59, 0]);
  const lanternGlass = material('#adcbd0', { transparent: true, opacity: 0.18, roughness: 0.15, depthWrite: false });
  cylinder(tower, lanternGlass, 0.49, 0.49, 0.76, [0, 5, 0], 8).castShadow = false;
  const mullions = own(new THREE.InstancedMesh(unitCylinder, navy, 8));
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    transform.position.set(Math.cos(angle) * 0.48, 5, Math.sin(angle) * 0.48);
    transform.scale.set(0.025, 0.84, 0.025);
    transform.updateMatrix();
    mullions.setMatrixAt(i, transform.matrix);
  }
  tower.add(mullions);
  const lampMaterial = own(new THREE.MeshBasicMaterial({ color: '#ffe5a1' }));
  const lamp = mesh(own(new THREE.SphereGeometry(0.16, 12, 8)), lampMaterial, tower, false);
  lamp.position.y = 5;
  const lensGeometry = own(new THREE.TorusGeometry(0.22, 0.026, 5, 20));
  for (const y of [4.86, 5, 5.14]) {
    const lens = mesh(lensGeometry, glass, tower, false);
    lens.position.y = y;
    lens.rotation.x = Math.PI / 2;
  }
  cylinder(tower, navy, 0.62, 0.62, 0.09, [0, 5.43, 0]);
  cylinder(tower, roof, 0, 0.7, 0.43, [0, 5.68, 0]);
  cylinder(tower, navy, 0.028, 0.028, 0.42, [0, 6.01, 0], 8);
  box(tower, rust, [0.38, 0.1, 0.024], [0.12, 6.09, 0]);

  const beacon = new THREE.Group();
  beacon.position.y = 5;
  tower.add(beacon);
  const beamGeometry = own(new THREE.ConeGeometry(1.2, 9, 24, 1, true));
  beamGeometry.rotateZ(Math.PI / 2);
  beamGeometry.translate(4.5, 0, 0);
  const beamMaterial = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uStrength: { value: 0.12 } },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vLocal;
      uniform float uStrength;
      void main() {
        float fade = pow(1.0 - clamp(vLocal.x / 9.0, 0.0, 1.0), 1.7);
        gl_FragColor = vec4(1.0, 0.8, 0.43, fade * uStrength);
        #include <colorspace_fragment>
      }`,
  }));
  mesh(beamGeometry, beamMaterial, beacon, false);
  mesh(beamGeometry, beamMaterial, beacon, false).rotation.y = Math.PI;
  const lanternLight = new THREE.PointLight('#ffcb80', 6, 9, 2);
  lanternLight.position.y = 5;
  own(lanternLight.shadow);
  tower.add(lanternLight);
  const sweepLight = new THREE.SpotLight('#ffe1a2', 35, 22, 0.15, 0.8, 1.3);
  sweepLight.target.position.set(12, -1.3, 0);
  beacon.add(sweepLight, sweepLight.target);
  own(sweepLight.shadow);

  function house(x: number, z: number, scale: number, rotation: number, redRoof: boolean) {
    const group = new THREE.Group();
    group.position.set(x, islandHeight(x, z) + 0.05, z);
    group.rotation.y = rotation;
    group.scale.setScalar(scale);
    scene.add(group);
    box(group, chalk, [2.18, 0.12, 1.42], [0, 0.03, 0]);
    box(group, ivory, [2, 0.98, 1.24], [0, 0.57, 0]);
    const gables = own(new THREE.BufferGeometry());
    gables.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, 1.06, -0.62, -1, 1.06, 0.62, -1, 1.62, 0,
      1, 1.06, 0.62, 1, 1.06, -0.62, 1, 1.62, 0,
    ], 3));
    gables.computeVertexNormals();
    mesh(gables, ivory, group);
    for (const side of [-1, 1]) {
      const roofPanel = box(group, redRoof ? rust : roof, [2.27, 0.09, 0.95], [0, 1.32, side * 0.35]);
      roofPanel.rotation.x = side * 0.68;
    }
    box(group, chalk, [0.23, 0.7, 0.27], [0.58, 1.61, -0.17]);
    box(group, navy, [0.3, 0.08, 0.34], [0.58, 1.98, -0.17]);
    box(group, navy, [0.32, 0.68, 0.045], [-0.17, 0.42, 0.65]);
    for (const wx of [-0.7, 0.57]) {
      box(group, navy, [0.35, 0.39, 0.06], [wx, 0.69, 0.65]);
      box(group, glass, [0.26, 0.29, 0.065], [wx, 0.69, 0.66]);
      box(group, ivory, [0.025, 0.32, 0.075], [wx, 0.69, 0.67]);
    }
    box(group, chalk, [0.5, 0.1, 0.34], [-0.17, 0.06, 0.78]);
  }
  house(0.7, -0.25, 1, -0.08, true);
  house(2.85, -0.6, 0.62, -0.2, false);
  cylinder(scene, navy, 0.3, 0.31, 0.63, [1.7, islandHeight(1.7, -1.25) + 0.31, -1.25], 16);

  const fencePoints: THREE.Vector3[] = [];
  instances(unitCylinder, wood, 17, (i, object) => {
    const x = -3.9 + i * 0.47;
    const z = 1.55 + Math.sin(i * 0.21) * 0.28;
    const y = islandHeight(x, z);
    object.position.set(x, y + 0.23, z);
    object.scale.set(0.035, 0.49, 0.035);
    for (const height of [0.18, 0.41]) {
      if (i) {
        const px = x - 0.47;
        const pz = 1.55 + Math.sin((i - 1) * 0.21) * 0.28;
        fencePoints.push(new THREE.Vector3(px, islandHeight(px, pz) + height, pz), new THREE.Vector3(x, y + height, z));
      }
    }
  });
  const fenceGeometry = own(new THREE.BufferGeometry().setFromPoints(fencePoints));
  scene.add(new THREE.LineSegments(fenceGeometry, own(new THREE.LineBasicMaterial({ color: '#a6987b' }))));

  instances(rockGeometry, material('#758780', { flatShading: true }), 13, (i, object) => {
    object.position.set(5.25 + i * 0.105, 0.24, 2.05 + i * 0.19);
    object.scale.set(0.45, 0.65 + seed() * 0.2, 0.4);
    object.rotation.y = seed() * Math.PI;
  });
  instances(unitBox, wood, 18, (i, object) => {
    object.position.set(4.65, 1.17, 2.08 + i * 0.2);
    object.scale.set(0.91, 0.11, 0.18);
  });
  instances(unitCylinder, wood, 10, (i, object) => {
    object.position.set(i % 2 ? 5.04 : 4.26, 0.05, 2.14 + Math.floor(i / 2) * 0.8);
    object.scale.set(0.075, 2.65, 0.075);
  });
  instances(unitBox, chalk, 5, (i, object) => {
    object.position.set(4.65, 1.25 + i * 0.12, 2.01 - i * 0.16);
    object.scale.set(0.65, 0.13, 0.2);
  });
  for (const z of [3.35, 5.1]) {
    cylinder(scene, navy, 0.095, 0.095, 0.22, [4.31, 1.32, z], 10);
    cylinder(scene, navy, 0.13, 0.13, 0.04, [4.31, 1.45, z], 10);
  }

  const floats: { object: THREE.Group; x: number; z: number; heading: number; offset: number }[] = [];
  function boat(x: number, z: number, heading: number, scale: number, working: boolean) {
    const group = new THREE.Group();
    scene.add(group);
    const vessel = new THREE.Group();
    vessel.scale.setScalar(scale);
    group.add(vessel);
    const outline = [[0, -1.03], [0.37, -0.53], [0.4, 0.58], [0.28, 0.86], [-0.28, 0.86], [-0.4, 0.58], [-0.37, -0.53]];
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const level of [0, 1]) {
      for (const [px, pz] of outline) vertices.push(px * (level ? 1 : 0.64), level ? 0.19 : -0.22, pz * (level ? 1 : 0.83));
    }
    for (let i = 0; i < 7; i++) {
      const n = (i + 1) % 7;
      indices.push(i, i + 7, n, n, i + 7, n + 7);
    }
    const hullGeometry = own(new THREE.BufferGeometry());
    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();
    mesh(hullGeometry, working ? rust : navy, vessel);
    const deckShape = new THREE.Shape(outline.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const deckGeometry = own(new THREE.ShapeGeometry(deckShape));
    deckGeometry.rotateX(-Math.PI / 2);
    const deck = mesh(deckGeometry, wood, vessel);
    deck.position.y = 0.135;
    const gunwaleCurve = new THREE.CatmullRomCurve3(outline.map(([px, pz]) => new THREE.Vector3(px, 0.2, pz)), true, 'centripetal');
    mesh(own(new THREE.TubeGeometry(gunwaleCurve, 32, 0.027, 4, true)), ivory, vessel);
    if (working) {
      box(vessel, ivory, [0.49, 0.44, 0.61], [0, 0.4, 0.24]);
      box(vessel, navy, [0.58, 0.06, 0.69], [0, 0.64, 0.24]);
      box(vessel, navy, [0.38, 0.19, 0.02], [0, 0.46, -0.075]);
      box(vessel, navy, [0.02, 0.2, 0.4], [0.251, 0.46, 0.24]);
      const lifeRing = mesh(own(new THREE.TorusGeometry(0.105, 0.03, 6, 16)), rust, vessel);
      lifeRing.position.set(0.27, 0.37, 0.4);
      lifeRing.rotation.y = Math.PI / 2;
    } else {
      box(vessel, ivory, [0.63, 0.05, 0.16], [0, 0.24, 0.36]);
      box(vessel, ivory, [0.59, 0.05, 0.16], [0, 0.24, -0.35]);
    }
    cylinder(vessel, wood, 0.018, 0.03, 1.53, [0, 0.91, -0.28], 8);
    const rigging = own(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.65, -0.28), new THREE.Vector3(0, 0.23, -0.94),
      new THREE.Vector3(0, 1.65, -0.28), new THREE.Vector3(0, 0.23, 0.77),
    ]));
    vessel.add(new THREE.LineSegments(rigging, own(new THREE.LineBasicMaterial({ color: '#d6c9a3' }))));
    const pennant = own(new THREE.BufferGeometry());
    pennant.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.57, -0.28, 0.36, 1.45, -0.24, 0, 1.34, -0.28], 3));
    pennant.computeVertexNormals();
    mesh(pennant, material('#d6ab59', { side: THREE.DoubleSide }), vessel, false);
    floats.push({ object: group, x, z, heading, offset: 0 });
    return group;
  }
  const mooredBoat = boat(MOORING.x, MOORING.z, -0.16, 1, true);
  boat(-5.45, 3.65, -1.2, 0.76, false);
  for (const [i, x, z] of [[0, 6.55, 5.7], [1, 1.3, 6.65], [2, -3.15, 5.9], [3, 7.4, 1.3]]) {
    const buoy = new THREE.Group();
    scene.add(buoy);
    const color = i % 2 ? rust : material('#427c6c');
    cylinder(buoy, color, 0.13, 0.24, 0.29, [0, 0.1, 0], 12);
    cylinder(buoy, ivory, 0.115, 0.13, 0.12, [0, 0.3, 0], 12);
    cylinder(buoy, navy, 0.021, 0.021, 0.48, [0, 0.53, 0], 8);
    cylinder(buoy, color, 0, 0.12, 0.17, [0, 0.8, 0], 8);
    floats.push({ object: buoy, x, z, heading: 0, offset: 0 });
  }

  const waterGeometry = own(new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS));
  waterGeometry.rotateX(-Math.PI / 2);
  const waterPositions = waterGeometry.getAttribute('position') as THREE.BufferAttribute;
  waterPositions.setUsage(THREE.DynamicDrawUsage);
  const waterMaterial = own(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uTide: { value: 0 },
      uDeep: { value: new THREE.Color('#397c94') },
      uShallow: { value: new THREE.Color('#87b9bb') },
      uHorizon: { value: new THREE.Color('#f2d8c5') },
      uSun: { value: new THREE.Vector3(-0.4, 0.8, 0.3) },
      uDay: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform float uTide;
      uniform float uDay;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      void main() {
        vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (normal.y < 0.0) normal = -normal;
        vec3 eye = normalize(cameraPosition - vWorld);
        float radius = length(vec2(vWorld.x / 1.667, vWorld.z));
        float angle = atan(vWorld.z, vWorld.x / 1.667);
        float edge = 3.92 * (1.0 + 0.075 * sin(angle * 3.0 + 0.3)
          + 0.043 * cos(angle * 7.0 - 0.6) + 0.019 * sin(angle * 11.0));
        float shoal = exp(-max(0.0, radius - edge) * 0.6);
        vec3 color = mix(uDeep, uShallow, shoal * 0.69);
        float fresnel = pow(1.0 - max(0.0, dot(eye, normal)), 3.0);
        color = mix(color, uHorizon, fresnel * 0.48);
        float phase = uTime * 6.2831853 / 24.0;
        float ribbon = sin(vWorld.x * 2.1 + vWorld.z * 3.3 + phase * 2.0);
        float streak = pow(max(0.0, ribbon), 24.0);
        float crest = smoothstep(0.012, 0.075, vWorld.y - uTide);
        color += vec3(0.075, 0.095, 0.09) * streak * crest;
        float foam = exp(-abs(radius - edge - 0.13 * sin(angle * 13.0 + phase)) * 12.0);
        foam *= smoothstep(-0.7, 0.4, sin(angle * 21.0 - phase * 2.0));
        color = mix(color, vec3(0.75, 0.82, 0.76), foam * 0.5);
        float glitter = pow(max(0.0, dot(reflect(-normalize(uSun), normal), eye)), 90.0);
        color += vec3(0.72, 0.51, 0.29) * glitter * (0.25 + 0.5 * uDay);
        float mist = smoothstep(31.0, 62.0, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(mix(color, uHorizon, mist), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const water = mesh(waterGeometry, waterMaterial, scene, false);
  water.frustumCulled = false;

  const birdPositions = new Float32Array(7 * 4 * 3);
  const birdGeometry = own(new THREE.BufferGeometry());
  const birdAttribute = new THREE.BufferAttribute(birdPositions, 3).setUsage(THREE.DynamicDrawUsage);
  birdGeometry.setAttribute('position', birdAttribute);
  const birds = new THREE.LineSegments(birdGeometry, own(new THREE.LineBasicMaterial({ color: '#334c5b' })));
  birds.frustumCulled = false;
  scene.add(birds);

  const daySky = new THREE.Color('#bbd9e7');
  const duskSky = new THREE.Color('#465c89');
  const dayHorizon = new THREE.Color('#eedfca');
  const duskHorizon = new THREE.Color('#d7a1a0');
  const dayDeep = new THREE.Color('#397a92');
  const duskDeep = new THREE.Color('#304667');
  const dayShallow = new THREE.Color('#86b7b5');
  const duskShallow = new THREE.Color('#648693');
  const daySun = new THREE.Color('#ffdfb5');
  const duskSun = new THREE.Color('#f4a486');
  let previousDaylight = -1;
  let previousTime = -1;
  let previousTide = -999;

  function setDaylight(value: number) {
    if (previousDaylight === value) return;
    previousDaylight = value;
    const day = value / 100;
    skyMaterial.uniforms.uTop.value.copy(duskSky).lerp(daySky, day);
    skyMaterial.uniforms.uHorizon.value.copy(duskHorizon).lerp(dayHorizon, day);
    waterMaterial.uniforms.uHorizon.value.copy(skyMaterial.uniforms.uHorizon.value);
    waterMaterial.uniforms.uDeep.value.copy(duskDeep).lerp(dayDeep, day);
    waterMaterial.uniforms.uShallow.value.copy(duskShallow).lerp(dayShallow, day);
    waterMaterial.uniforms.uDay.value = day;
    (scene.fog as THREE.Fog).color.copy(skyMaterial.uniforms.uHorizon.value);
    sunLight.color.copy(duskSun).lerp(daySun, day);
    sunLight.intensity = 0.7 + day * 2.5;
    sunLight.position.y = 5 + day * 12;
    hemi.intensity = 0.85 + day * 1.55;
    sun.position.y = 7 + day * 20;
    sunMaterial.color.copy(duskSun).lerp(daySun, day);
    cloudMaterial.color.copy(duskHorizon).lerp(dayHorizon, day);
    glass.emissiveIntensity = 0.35 + (1 - day) * 1.6;
    lanternLight.intensity = 3 + (1 - day) * 11;
    sweepLight.intensity = 10 + (1 - day) * 70;
    beamMaterial.uniforms.uStrength.value = 0.055 + (1 - day) * 0.17;
    waterMaterial.uniforms.uSun.value.copy(sunLight.position).normalize();
  }

  /** Reads the actual uploaded mesh vertices; station telemetry is not a second model. */
  function sampleGeometryHeight(x: number, z: number): number {
    const { column, row, u, v } = waterCell(x, z);
    const a = row * (WATER_SEGMENTS + 1) + column;
    return interpolateWaterTriangle(u, v,
      waterPositions.getY(a), waterPositions.getY(a + 1),
      waterPositions.getY(a + WATER_SEGMENTS + 1), waterPositions.getY(a + WATER_SEGMENTS + 2));
  }

  function update(time: number, tide: number, daylight: number): CoastalSnapshot {
    setDaylight(daylight);
    if (time !== previousTime || tide !== previousTide) {
      previousTime = time;
      previousTide = tide;
      for (let i = 0; i < waterPositions.count; i++) {
        waterPositions.setY(i, waterHeight(waterPositions.getX(i), waterPositions.getZ(i), tide, time));
      }
      waterPositions.needsUpdate = true;
      waterMaterial.uniforms.uTime.value = time;
      waterMaterial.uniforms.uTide.value = tide;
      for (const floating of floats) {
        const { object, x, z, heading, offset } = floating;
        object.position.set(x, waterSurfaceHeight(x, z, tide, time) + offset, z);
        const sx = Math.sin(heading) * 0.4;
        const sz = Math.cos(heading) * 0.4;
        const forward = (waterSurfaceHeight(x + sx, z + sz, tide, time) - waterSurfaceHeight(x - sx, z - sz, tide, time)) / 0.8;
        const right = (waterSurfaceHeight(x + sz, z - sx, tide, time) - waterSurfaceHeight(x - sz, z + sx, tide, time)) / 0.8;
        object.rotation.set(-Math.atan(forward), heading, Math.atan(right), 'YXZ');
      }
      beacon.rotation.y = time / CYCLE_SECONDS * Math.PI * 4;
      for (let i = 0; i < 7; i++) {
        const phase = time / CYCLE_SECONDS * Math.PI * 2;
        const x = -6 + i * 1.3 + Math.sin(phase + i) * 0.9;
        const y = 7 + Math.sin(i * 1.6) * 0.9 + Math.sin(phase * 2 + i) * 0.13;
        const z = -4.5 - i * 0.4 + Math.cos(phase + i) * 0.6;
        const wing = 0.07 + Math.sin(phase * 6 + i) * 0.055;
        birdPositions.set([x - 0.2, y + wing, z, x, y, z + 0.04, x, y, z + 0.04, x + 0.2, y + wing, z], i * 12);
      }
      birdAttribute.needsUpdate = true;
    }
    return {
      time, tide, daylight,
      waterHeight: sampleGeometryHeight(MOORING.x, MOORING.z),
      floatHeight: mooredBoat.position.y - MOORING.waterlineOffset,
      beaconAngle: beacon.rotation.y,
      camera: stage.camera.position.toArray().map((v) => v.toFixed(4)).join(','),
    };
  }

  return { update };
}
