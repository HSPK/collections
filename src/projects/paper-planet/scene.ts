import * as THREE from 'three';
import { random } from '../../core/math';
import type { SpatialStage } from '../../core/spatial';
import { LANDMARKS, PALETTE, BREEZE_SECONDS, radialDirection } from './data';
import type { AtlasPoint, LandmarkId } from './data';

const SEA_RADIUS = 2.08;
const LAND_RADIUS = 2.16;
const UP = new THREE.Vector3(0, 1, 0);

export function radialFrame(point: AtlasPoint, radius = LAND_RADIUS): THREE.Group {
  const group = new THREE.Group();
  const normal = new THREE.Vector3(...radialDirection(point));
  group.position.copy(normal).multiplyScalar(radius);
  group.quaternion.setFromUnitVectors(UP, normal);
  return group;
}

type Material = THREE.MeshStandardMaterial;
interface Cloud {
  root: THREE.Group;
  radius: number;
  normal: THREE.Vector3;
  offset: number;
}

export interface PaperWorld {
  landmarks: Map<LandmarkId, THREE.Group>;
  setLight: (amount: number) => void;
  select: (id: LandmarkId | null) => void;
  animate: (seconds: number) => void;
}

export function buildPaperWorld(stage: SpatialStage): PaperWorld {
  const { scene } = stage;
  const rng = random(380127);
  const world = new THREE.Group();
  world.name = 'An invented little world';
  scene.add(world);

  const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    stage.own(new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra }));
  const paper = material(PALETTE.snow);
  const green = material(PALETTE.forest);
  const leaf = material(PALETTE.leaf);
  const mint = material(PALETTE.mint);
  const salmon = material(PALETTE.salmon);
  const clay = material(PALETTE.clay);
  const mustard = material(PALETTE.mustard);
  const wheat = material(PALETTE.wheat);
  const stone = material(PALETTE.stone);
  const sea = material(PALETTE.sea);
  const foam = material(PALETTE.foam);
  const timber = material('#79604a');
  const dark = material(PALETTE.ink);
  const apple = material('#b85a44');
  const windows = material('#f8d68c', { emissive: '#f8c16d', emissiveIntensity: 0.08 });
  const cloudPaper = material('#fffaf0');
  const roofGeometry = stage.own(new THREE.BufferGeometry());
  roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -0.5, -0.5, 1, -0.5, -0.5, 0, 0.5, -0.5,
    -1, -0.5, 0.5, 1, -0.5, 0.5, 0, 0.5, 0.5,
  ], 3));
  roofGeometry.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
  roofGeometry.computeVertexNormals();
  const geometry = {
    box: stage.own(new THREE.BoxGeometry(1, 1, 1)),
    ball: stage.own(new THREE.IcosahedronGeometry(1, 0)),
    round: stage.own(new THREE.IcosahedronGeometry(1, 1)),
    cone: stage.own(new THREE.ConeGeometry(1, 1, 5)),
    cylinder: stage.own(new THREE.CylinderGeometry(1, 1, 1, 8)),
    tapered: stage.own(new THREE.CylinderGeometry(0.65, 1, 1, 8)),
    roof: roofGeometry,
  };
  const make = (
    parent: THREE.Object3D,
    shape: THREE.BufferGeometry,
    surface: Material,
    position: [number, number, number],
    scale: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(shape, surface);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Repeated cutouts share geometry and are drawn in material batches.
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: Material; matrices: THREE.Matrix4[] }>();
  const scratch = new THREE.Object3D();
  const stamp = (
    frame: THREE.Group,
    shape: THREE.BufferGeometry,
    surface: Material,
    position: [number, number, number],
    scale: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) => {
    const key = `${shape.uuid}:${surface.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry: shape, material: surface, matrices: [] };
      batches.set(key, batch);
    }
    frame.updateMatrixWorld(true);
    scratch.position.set(...position);
    scratch.rotation.set(...rotation);
    scratch.scale.set(...scale);
    scratch.updateMatrix();
    batch.matrices.push(new THREE.Matrix4().multiplyMatrices(frame.matrixWorld, scratch.matrix));
  };

  const oceanGeometry = stage.own(new THREE.IcosahedronGeometry(SEA_RADIUS, 5));
  const oceanColors: number[] = [];
  const oceanPosition = oceanGeometry.getAttribute('position');
  for (let index = 0; index < oceanPosition.count; index += 3) {
    const color = new THREE.Color(PALETTE.sea).lerp(new THREE.Color(PALETTE.deepSea), rng() * 0.4);
    for (let vertex = 0; vertex < 3; vertex++) oceanColors.push(color.r, color.g, color.b);
  }
  oceanGeometry.setAttribute('color', new THREE.Float32BufferAttribute(oceanColors, 3));
  make(world, oceanGeometry, material('#ffffff', { vertexColors: true }), [0, 0, 0], [1, 1, 1]);

  function patch(point: AtlasPoint, width: number, depth: number, surface: Material, edge: Material, seed: number) {
    const normal = new THREE.Vector3(...radialDirection(point));
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    const localRandom = random(seed);
    const sides = 18;
    const perimeter = Array.from({ length: sides }, () => 0.88 + localRandom() * 0.2);
    const vertices: number[] = [];
    const indices: number[] = [];
    const rings = 4;
    for (let ring = 0; ring <= rings; ring++) {
      for (let sector = 0; sector < sides; sector++) {
        const angle = sector / sides * Math.PI * 2;
        const fraction = ring / rings;
        const distance = perimeter[sector] * fraction;
        const direction = new THREE.Vector3(Math.cos(angle) * width * distance, 1, Math.sin(angle) * depth * distance)
          .normalize().applyQuaternion(rotation);
        const raised = ring === rings ? 0 : (1 - fraction) * 0.045;
        vertices.push(...direction.multiplyScalar(LAND_RADIUS + raised).toArray());
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let sector = 0; sector < sides; sector++) {
        const next = (sector + 1) % sides;
        const a = ring * sides + sector;
        const b = ring * sides + next;
        const c = (ring + 1) * sides + sector;
        const d = (ring + 1) * sides + next;
        indices.push(a, b, c, b, d, c);
      }
    }
    const top = stage.own(new THREE.BufferGeometry());
    top.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    top.setIndex(indices);
    top.computeVertexNormals();
    make(world, top, surface, [0, 0, 0], [1, 1, 1]);

    const edges: number[] = [];
    for (let sector = 0; sector < sides; sector++) {
      const next = (sector + 1) % sides;
      const a = new THREE.Vector3().fromArray(vertices, (rings * sides + sector) * 3);
      const b = new THREE.Vector3().fromArray(vertices, (rings * sides + next) * 3);
      const c = a.clone().normalize().multiplyScalar(SEA_RADIUS - 0.015);
      const d = b.clone().normalize().multiplyScalar(SEA_RADIUS - 0.015);
      edges.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...b.toArray(), ...d.toArray(), ...c.toArray());
    }
    const edgeGeometry = stage.own(new THREE.BufferGeometry());
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    edgeGeometry.computeVertexNormals();
    make(world, edgeGeometry, edge, [0, 0, 0], [1, 1, 1]);
  }

  patch({ latitude: 24, longitude: -42 }, 0.68, 0.58, leaf, green, 12);
  patch({ latitude: -15, longitude: -28 }, 0.48, 0.42, mint, wheat, 8);
  patch({ latitude: -30, longitude: 21 }, 0.49, 0.39, wheat, salmon, 3);
  patch({ latitude: 27, longitude: 32 }, 0.5, 0.45, salmon, clay, 42);
  patch({ latitude: 62, longitude: 0 }, 0.49, 0.38, paper, stone, 19);
  patch({ latitude: 2, longitude: 64 }, 0.18, 0.25, wheat, stone, 5);
  // The far hemisphere has its own islands; orbiting never reveals an unfinished prop.
  patch({ latitude: 15, longitude: 139 }, 0.7, 0.68, leaf, green, 71);
  patch({ latitude: -35, longitude: -126 }, 0.65, 0.5, salmon, clay, 92);
  patch({ latitude: 48, longitude: -131 }, 0.48, 0.44, paper, stone, 31);
  patch({ latitude: -53, longitude: 92 }, 0.35, 0.3, mint, wheat, 17);

  function tree(point: AtlasPoint, scale: number, pine = false) {
    const frame = radialFrame(point, LAND_RADIUS + 0.018);
    stamp(frame, geometry.cylinder, timber, [0, scale * 0.24, 0], [scale * 0.075, scale * 0.5, scale * 0.075]);
    if (pine) {
      stamp(frame, geometry.cone, green, [0, scale * 0.59, 0], [scale * 0.32, scale * 0.68, scale * 0.32]);
      stamp(frame, geometry.cone, leaf, [0, scale * 0.86, 0], [scale * 0.23, scale * 0.48, scale * 0.23]);
    } else {
      stamp(frame, geometry.ball, rng() > 0.5 ? green : leaf, [0, scale * 0.68, 0], [scale * 0.36, scale * 0.43, scale * 0.34], [0, rng() * 3, 0]);
      stamp(frame, geometry.ball, apple, [scale * 0.2, scale * 0.65, scale * 0.25], [0.035, 0.038, 0.035]);
      stamp(frame, geometry.ball, apple, [-scale * 0.18, scale * 0.79, scale * 0.19], [0.028, 0.03, 0.028]);
    }
  }
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      tree({ latitude: 5 + row * 7 + rng() * 2, longitude: -66 + column * 9 + rng() * 3 }, 0.31 + rng() * 0.18, column < 2);
    }
  }
  for (let index = 0; index < 32; index++) {
    tree({ latitude: -4 + rng() * 39, longitude: 114 + rng() * 48 }, 0.33 + rng() * 0.16, index % 3 === 0);
  }
  for (let index = 0; index < 9; index++) {
    tree({ latitude: -60 + rng() * 13, longitude: 79 + rng() * 21 }, 0.32 + rng() * 0.15);
  }

  function house(frame: THREE.Group, x: number, z: number, scale: number, roofMaterial = salmon) {
    stamp(frame, geometry.box, paper, [x, scale * 0.36, z], [scale * 0.75, scale * 0.65, scale * 0.63]);
    stamp(frame, geometry.roof, roofMaterial, [x, scale * 0.78, z], [scale * 0.51, scale * 0.34, scale * 0.84]);
    stamp(frame, geometry.box, windows, [x - scale * 0.2, scale * 0.43, z + scale * 0.321], [scale * 0.15, scale * 0.19, 0.012]);
    stamp(frame, geometry.box, windows, [x + scale * 0.2, scale * 0.43, z + scale * 0.321], [scale * 0.15, scale * 0.19, 0.012]);
    stamp(frame, geometry.box, dark, [x, scale * 0.21, z + scale * 0.324], [scale * 0.15, scale * 0.32, 0.013]);
    stamp(frame, geometry.box, clay, [x + scale * 0.18, scale * 0.85, z - scale * 0.12], [scale * 0.12, scale * 0.32, scale * 0.12]);
  }

  function path(points: AtlasPoint[], color = paper, width = 0.044) {
    for (const point of points) {
      stamp(radialFrame(point, LAND_RADIUS + 0.045), geometry.box, color, [0, 0, 0], [width, 0.014, width * 1.7]);
    }
  }
  path(Array.from({ length: 24 }, (_, index) => ({ latitude: -30 + index * 2.6, longitude: -32 + Math.sin(index * 0.35) * 4 })), wheat, 0.055);
  path(Array.from({ length: 12 }, (_, index) => ({ latitude: -31 + Math.sin(index * 0.6), longitude: 7 + index * 2.2 })));

  const landmarks = new Map<LandmarkId, THREE.Group>();
  for (const landmark of LANDMARKS) {
    const frame = radialFrame(landmark, LAND_RADIUS + 0.045);
    frame.name = landmark.name;
    world.add(frame);
    landmarks.set(landmark.id, frame);
  }
  function anchor(id: LandmarkId) {
    const frame = landmarks.get(id);
    if (!frame) throw new Error(`Missing geometry for ${id}`);
    return frame;
  }

  const orchard = anchor('mossfold');
  house(orchard, 0.05, 0.04, 0.26, green);
  make(orchard, geometry.box, timber, [-0.23, 0.16, 0.06], [0.019, 0.32, 0.02], [0.2, 0, -0.12]);
  make(orchard, geometry.box, timber, [-0.12, 0.16, 0.06], [0.019, 0.32, 0.02], [0.2, 0, -0.12]);
  for (let step = 0; step < 4; step++) {
    make(orchard, geometry.box, wheat, [-0.175, 0.055 + step * 0.075, 0.07], [0.13, 0.016, 0.02]);
  }

  const mill = anchor('windmill');
  make(mill, geometry.tapered, paper, [0, 0.23, 0], [0.14, 0.46, 0.14]);
  make(mill, geometry.cone, clay, [0, 0.53, 0], [0.19, 0.2, 0.19]);
  make(mill, geometry.box, dark, [0, 0.09, 0.138], [0.075, 0.17, 0.02]);
  const sails = new THREE.Group();
  sails.position.set(0, 0.39, 0.16);
  mill.add(sails);
  make(sails, geometry.cylinder, mustard, [0, 0, 0.035], [0.055, 0.08, 0.055], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 4; index++) {
    const sail = new THREE.Group();
    sail.rotation.z = index * Math.PI / 2;
    sails.add(sail);
    make(sail, geometry.box, timber, [0, 0.18, 0], [0.022, 0.4, 0.018]);
    make(sail, geometry.box, paper, [0.045, 0.25, 0.014], [0.105, 0.23, 0.014]);
  }
  for (let plot = 0; plot < 5; plot++) {
    const field = radialFrame({ latitude: -23 + (plot % 2) * 12, longitude: -42 + Math.floor(plot / 2) * 10 }, LAND_RADIUS + 0.04);
    stamp(field, geometry.box, plot % 2 ? wheat : mustard, [0, 0, 0], [0.24, 0.035, 0.33]);
    for (let row = 0; row < 5; row++) {
      stamp(field, geometry.box, paper, [-0.088 + row * 0.044, 0.024, 0], [0.012, 0.009, 0.28]);
    }
  }
  const bridge = radialFrame({ latitude: -17, longitude: -5 }, SEA_RADIUS + 0.09);
  for (let plank = 0; plank < 11; plank++) {
    stamp(bridge, geometry.box, timber, [-0.35 + plank * 0.07, Math.sin(plank / 10 * Math.PI) * 0.1, 0], [0.062, 0.04, 0.15]);
  }
  for (const side of [-1, 1]) {
    stamp(bridge, geometry.box, wheat, [0, 0.14, side * 0.078], [0.78, 0.025, 0.022]);
    for (const x of [-0.34, 0, 0.34]) stamp(bridge, geometry.box, timber, [x, 0.08, side * 0.078], [0.024, 0.22, 0.024]);
  }

  const quay = anchor('quay');
  house(quay, -0.31, -0.11, 0.27, clay);
  house(quay, 0, -0.16, 0.31, salmon);
  house(quay, 0.32, -0.05, 0.24, mustard);
  house(radialFrame({ latitude: -19, longitude: 15 }, LAND_RADIUS + 0.045), 0, 0, 0.25, salmon);
  house(radialFrame({ latitude: -39, longitude: 24 }, LAND_RADIUS + 0.035), 0, 0, 0.24, green);
  const jetty = radialFrame({ latitude: -24, longitude: -3 }, SEA_RADIUS + 0.14);
  for (let plank = 0; plank < 8; plank++) {
    stamp(jetty, geometry.box, timber, [0, 0, plank * 0.055], [0.16, 0.025, 0.046]);
  }
  for (const x of [-0.075, 0.075]) {
    for (const z of [0, 0.36]) stamp(jetty, geometry.cylinder, wheat, [x, 0.015, z], [0.018, 0.14, 0.018]);
  }

  function boat(point: AtlasPoint, size = 1) {
    const boatFrame = radialFrame(point, SEA_RADIUS + 0.015);
    boatFrame.scale.setScalar(size);
    stamp(boatFrame, geometry.ball, clay, [0, 0.035, 0], [0.075, 0.07, 0.2]);
    stamp(boatFrame, geometry.cylinder, timber, [0, 0.18, 0], [0.01, 0.31, 0.01]);
    stamp(boatFrame, geometry.cone, paper, [0.045, 0.22, 0], [0.11, 0.24, 0.014], [0, 0, -0.22]);
    stamp(boatFrame, geometry.box, foam, [0, 0.001, -0.27], [0.02, 0.008, 0.1]);
  }
  boat({ latitude: -6, longitude: 7 }, 1.2);
  boat({ latitude: -43, longitude: 1 });
  boat({ latitude: 10, longitude: 91 });
  boat({ latitude: 2, longitude: -117 });

  const wick = anchor('lighthouse');
  make(wick, geometry.tapered, paper, [0, 0.3, 0], [0.105, 0.6, 0.105]);
  for (let stripe = 0; stripe < 3; stripe++) {
    const radius = 0.099 - stripe * 0.013;
    make(wick, geometry.cylinder, clay, [0, 0.12 + stripe * 0.18, 0], [radius, 0.063, radius]);
  }
  make(wick, geometry.cylinder, dark, [0, 0.59, 0], [0.14, 0.035, 0.14]);
  make(wick, geometry.cylinder, windows, [0, 0.67, 0], [0.075, 0.12, 0.075]);
  make(wick, geometry.cone, clay, [0, 0.78, 0], [0.13, 0.13, 0.13]);
  make(wick, geometry.box, dark, [0, 0.095, 0.105], [0.05, 0.15, 0.013]);
  for (let rock = 0; rock < 7; rock++) {
    const frame = radialFrame({ latitude: -9 + rock * 2.1, longitude: 62 + Math.sin(rock) * 1.5 }, SEA_RADIUS + 0.035);
    stamp(frame, geometry.ball, stone, [0, 0, 0], [0.055, 0.045, 0.075]);
  }

  function mountain(point: AtlasPoint, size: number) {
    const frame = radialFrame(point, LAND_RADIUS);
    stamp(frame, geometry.cone, stone, [0, size * 0.4, 0], [size * 0.46, size * 0.8, size * 0.42]);
    stamp(frame, geometry.cone, paper, [0, size * 0.64, 0], [size * 0.25, size * 0.44, size * 0.23]);
  }
  mountain({ latitude: 66, longitude: -23 }, 0.8);
  mountain({ latitude: 72, longitude: 12 }, 0.68);
  mountain({ latitude: 57, longitude: 15 }, 0.65);
  mountain({ latitude: 51, longitude: -130 }, 0.7);
  mountain({ latitude: 40, longitude: -145 }, 0.52);
  const peaks = anchor('peaks');
  make(peaks, geometry.cylinder, sea, [-0.17, 0.035, 0.12], [0.17, 0.018, 0.12]);
  house(peaks, 0.17, 0.16, 0.2, clay);

  function canyon(point: AtlasPoint, size: number) {
    const frame = radialFrame(point, LAND_RADIUS - 0.005);
    stamp(frame, geometry.tapered, clay, [0, 0.09 * size, 0], [0.19 * size, 0.19 * size, 0.15 * size]);
    stamp(frame, geometry.tapered, wheat, [0, 0.19 * size, 0], [0.16 * size, 0.045 * size, 0.125 * size]);
    stamp(frame, geometry.tapered, salmon, [0, 0.25 * size, 0], [0.145 * size, 0.085 * size, 0.11 * size]);
    stamp(frame, geometry.tapered, clay, [0, 0.31 * size, 0], [0.1 * size, 0.045 * size, 0.08 * size]);
  }
  for (let index = 0; index < 8; index++) {
    canyon({ latitude: 12 + index * 3.8, longitude: 41 + Math.sin(index) * 5 }, 0.7 + rng() * 0.65);
  }
  for (let index = 0; index < 8; index++) {
    canyon({ latitude: -48 + rng() * 26, longitude: -149 + rng() * 43 }, 0.75 + rng() * 0.7);
  }
  path(Array.from({ length: 12 }, (_, index) => ({ latitude: 12 + index * 2.5, longitude: 31 + Math.sin(index * 0.45) * 3 })), wheat);
  for (const point of [{ latitude: 12, longitude: 27 }, { latitude: 35, longitude: 48 }, { latitude: -40, longitude: -128 }]) {
    const cactus = radialFrame(point, LAND_RADIUS + 0.02);
    stamp(cactus, geometry.cylinder, green, [0, 0.17, 0], [0.04, 0.34, 0.04]);
    stamp(cactus, geometry.box, green, [0.07, 0.15, 0], [0.13, 0.035, 0.035]);
    stamp(cactus, geometry.cylinder, green, [0.12, 0.2, 0], [0.027, 0.13, 0.027]);
  }
  const observatory = anchor('observatory');
  make(observatory, geometry.cylinder, wheat, [0, 0.09, 0], [0.23, 0.16, 0.23]);
  make(observatory, geometry.cylinder, paper, [0, 0.24, 0], [0.19, 0.25, 0.19]);
  const domeGeometry = stage.own(new THREE.SphereGeometry(0.22, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2));
  make(observatory, domeGeometry, green, [0, 0.36, 0], [1, 1, 1]);
  make(observatory, geometry.cylinder, mustard, [0.12, 0.48, 0.09], [0.041, 0.34, 0.041], [0.6, 0, -0.9]);
  make(observatory, geometry.box, dark, [0, 0.17, 0.194], [0.085, 0.18, 0.013]);
  house(radialFrame({ latitude: -40, longitude: -117 }, LAND_RADIUS + 0.04), 0, 0, 0.25, green);
  house(radialFrame({ latitude: 11, longitude: 139 }, LAND_RADIUS + 0.04), 0, 0, 0.3, salmon);

  // Paper waves are sparse, raised strokes rather than a texture or a fluid simulation.
  const seaPoints: AtlasPoint[] = [
    { latitude: -3, longitude: 1 }, { latitude: 10, longitude: -5 }, { latitude: -45, longitude: 0 },
    { latitude: -12, longitude: 44 }, { latitude: -22, longitude: 55 }, { latitude: 23, longitude: 89 },
    { latitude: 0, longitude: -98 }, { latitude: 20, longitude: -104 }, { latitude: -18, longitude: 174 },
    { latitude: -59, longitude: -31 }, { latitude: 34, longitude: 92 }, { latitude: 15, longitude: 178 },
  ];
  for (const point of seaPoints) {
    const wave = radialFrame(point, SEA_RADIUS + 0.018);
    for (let index = 0; index < 3; index++) {
      stamp(wave, geometry.box, foam, [(index - 1) * 0.075, 0, Math.abs(index - 1) * 0.015], [0.065, 0.009, 0.013]);
    }
  }
  for (const batch of batches.values()) {
    const mesh = stage.own(new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length));
    batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    world.add(mesh);
  }
  batches.clear();

  const clouds: Cloud[] = [];
  const cloudPositions = [
    { latitude: 43, longitude: -77 }, { latitude: -32, longitude: -60 },
    { latitude: 21, longitude: 74 }, { latitude: -44, longitude: 42 },
    { latitude: 51, longitude: 148 }, { latitude: -13, longitude: -164 },
  ];
  cloudPositions.forEach((point, index) => {
    const radius = 2.74 + index % 2 * 0.08;
    const root = radialFrame(point, radius);
    root.rotation.y += index * 0.7;
    make(root, geometry.round, cloudPaper, [-0.15, 0, 0], [0.24, 0.11, 0.14]);
    make(root, geometry.round, cloudPaper, [0.06, 0.06, 0], [0.23, 0.17, 0.18]);
    make(root, geometry.round, cloudPaper, [0.25, 0, 0], [0.18, 0.105, 0.13]);
    world.add(root);
    clouds.push({ root, radius, normal: new THREE.Vector3(...radialDirection(point)), offset: index * 1.3 });
  });

  const selection = new THREE.Group();
  const ringGeometry = stage.own(new THREE.TorusGeometry(0.28, 0.015, 4, 32));
  const ring = make(selection, ringGeometry, mustard, [0, 0.022, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  ring.castShadow = false;
  selection.visible = false;
  world.add(selection);

  const key = new THREE.DirectionalLight('#fff0d2', 3.4);
  key.position.set(-4, 7, 7);
  key.castShadow = true;
  const shadowSize = stage.size.width < 600 ? 512 : 1024;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -3.8;
  key.shadow.camera.right = 3.8;
  key.shadow.camera.top = 3.8;
  key.shadow.camera.bottom = -3.8;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0003;
  stage.own(key.shadow);
  const fill = new THREE.DirectionalLight('#c7e4e4', 1.9);
  fill.position.set(5, 1, -6);
  stage.own(fill.shadow);
  const ambient = new THREE.HemisphereLight('#fff7e0', '#789c96', 2.2);
  scene.add(key, fill, ambient);
  const noon = new THREE.Color(PALETTE.paper);
  const dusk = new THREE.Color('#e9ddd8');
  const background = new THREE.Color(PALETTE.paper);
  scene.background = background;

  return {
    landmarks,
    select(id) {
      selection.visible = id !== null;
      if (id) {
        const frame = anchor(id);
        selection.position.copy(frame.position);
        selection.quaternion.copy(frame.quaternion);
      }
    },
    setLight(amount) {
      const daylight = amount / 100;
      key.color.set('#ffc094').lerp(new THREE.Color('#fff0d2'), daylight);
      key.intensity = 1.6 + daylight * 1.8;
      key.position.set(-5 + daylight, 1.8 + daylight * 5.2, 7);
      fill.color.set('#aabce0').lerp(new THREE.Color('#c7e4e4'), daylight);
      fill.intensity = 1.6 + daylight * 0.3;
      ambient.intensity = 1.4 + daylight * 0.8;
      windows.emissiveIntensity = 0.08 + (1 - daylight) * 1.5;
      background.copy(dusk).lerp(noon, daylight);
    },
    animate(seconds) {
      const phase = seconds / BREEZE_SECONDS * Math.PI * 2;
      sails.rotation.z = -phase * 2;
      for (const cloud of clouds) {
        cloud.root.position.copy(cloud.normal).multiplyScalar(cloud.radius + Math.sin(phase + cloud.offset) * 0.045);
      }
    },
  };
}
