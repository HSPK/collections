import * as THREE from 'three';
import type { SpatialStage } from '../../core/spatial';
import { PARTS } from './data';
import type { PartId } from './data';
import { canvasTexture, pictureTexture, surfaceSet } from './surfaces';
import type { Surface } from './surfaces';

function roundedPath<T extends THREE.Path>(path: T, width: number, height: number, radius: number): T {
  const x = -width / 2;
  const y = -height / 2;
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  return path;
}

export function createCameraComponents(stage: SpatialStage) {
  const surfaces = surfaceSet(stage);
  const root = new THREE.Group();
  root.position.y = 0.45;
  stage.scene.add(root);
  const groups = Object.fromEntries(
    PARTS.map(({ id }) => {
      const group = new THREE.Group();
      group.name = id;
      root.add(group);
      return [id, group];
    }),
  ) as Record<PartId, THREE.Group>;

  function mesh(
    part: PartId,
    geometry: THREE.BufferGeometry,
    kind: Surface,
    x = 0, y = 0, z = 0,
  ): THREE.Mesh {
    const item = new THREE.Mesh(stage.own(geometry), surfaces.get(part, kind));
    item.position.set(x, y, z);
    item.castShadow = kind !== 'glass';
    item.receiveShadow = true;
    groups[part].add(item);
    return item;
  }

  function roundedGeometry(width: number, height: number, depth: number, radius: number, hole?: THREE.Path) {
    const shape = roundedPath(new THREE.Shape(), width, height, radius);
    if (hole) shape.holes.push(hole);
    const bevel = Math.min(0.035, depth / 4);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8,
    });
    geometry.translate(0, 0, -depth / 2 + bevel);
    return geometry;
  }

  function panel(
    part: PartId, kind: Surface, width: number, height: number, depth: number, radius: number,
    x = 0, y = 0, z = 0,
  ) {
    return mesh(part, roundedGeometry(width, height, depth, radius), kind, x, y, z);
  }

  function surround(
    part: PartId, kind: Surface, width: number, height: number, depth: number, radius: number, wall: number,
    z = 0,
  ) {
    const hole = roundedPath(new THREE.Path(), width - wall * 2, height - wall * 2, Math.max(0.04, radius - wall));
    return mesh(part, roundedGeometry(width, height, depth, radius, hole), kind, 0, 0, z);
  }

  function ring(part: PartId, kind: Surface, radius: number, thickness: number, z: number, x = 0, y = 0) {
    return mesh(part, new THREE.TorusGeometry(radius, thickness, 8, 64), kind, x, y, z);
  }

  function cylinder(
    part: PartId, kind: Surface, radius: number, depth: number,
    x: number, y: number, z: number, top = false,
  ) {
    const item = mesh(part, new THREE.CylinderGeometry(radius, radius, depth, 32), kind, x, y, z);
    if (!top) item.rotation.x = Math.PI / 2;
    return item;
  }

  function repeatedBoxes(
    part: PartId, kind: Surface, size: [number, number, number], count: number,
    arrange: (object: THREE.Object3D, index: number) => void,
  ) {
    const geometry = stage.own(new THREE.BoxGeometry(...size));
    const items = stage.own(new THREE.InstancedMesh(geometry, surfaces.get(part, kind), count));
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      arrange(dummy, i);
      dummy.updateMatrix();
      items.setMatrixAt(i, dummy.matrix);
    }
    items.instanceMatrix.needsUpdate = true;
    items.castShadow = true;
    items.receiveShadow = true;
    groups[part].add(items);
  }

  function inscription(part: PartId, text: string, width: number, height: number, x: number, y: number, z: number, rear = false) {
    const texture = canvasTexture(stage, 512, 96, (p) => {
      p.fillStyle = '#eee5d4';
      p.fillRect(0, 0, 512, 96);
      p.fillStyle = '#423445';
      p.font = '34px monospace';
      p.textAlign = 'center';
      p.textBaseline = 'middle';
      p.fillText(text, 256, 48);
    });
    const material = stage.own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65 }));
    const label = new THREE.Mesh(stage.own(new THREE.PlaneGeometry(width, height)), material);
    label.position.set(x, y, z);
    if (rear) label.rotation.y = Math.PI;
    groups[part].add(label);
  }

  surround('frame', 'darkMetal', 3.48, 2.23, 0.5, 0.27, 0.12);
  for (const x of [-1.36, 1.36]) {
    panel('frame', 'metal', 0.11, 1.94, 0.17, 0.045, x, 0, 0.21);
    for (const y of [-0.76, 0.76]) cylinder('frame', 'metal', 0.075, 0.05, x, y, 0.33);
  }
  for (const y of [-0.87, 0.78]) panel('frame', 'metal', 2.84, 0.1, 0.25, 0.04, 0, y, 0.24);
  panel('frame', 'rubber', 2.9, 0.27, 0.7, 0.05, 0, -1.06, 0.05);
  cylinder('frame', 'metal', 0.08, 2.72, 0, -0.86, 0.46).rotation.z = Math.PI / 2;

  panel('film', 'rubber', 2.93, 1.84, 0.29, 0.16);
  panel('film', 'darkMetal', 2.65, 1.53, 0.05, 0.12, 0, 0, 0.175);
  for (let i = 0; i < 4; i++) panel('film', 'paper', 2.61, 0.022, 0.23, 0.008, 0, 0.64 + i * 0.058, 0.07);
  panel('film', 'teal', 0.36, 0.57, 0.055, 0.06, 1.4, -0.05, 0.18);
  inscription('film', 'LIGHT / 08', 1.16, 0.21, -0.08, 0.08, 0.206);

  surround('housing', 'enamel', 3.98, 2.92, 1.15, 0.52, 0.2);
  surround('housing', 'rubber', 3.63, 2.57, 1.07, 0.34, 0.065);
  for (const x of [-1.96, 1.96]) {
    const lug = ring('housing', 'metal', 0.11, 0.035, -0.13, x, 0.74);
    lug.rotation.y = Math.PI / 2;
  }

  panel('back', 'cream', 3.68, 2.61, 0.17, 0.39);
  panel('back', 'rubber', 2.91, 1.79, 0.12, 0.27, 0, -0.06, -0.14);
  repeatedBoxes('back', 'darkMetal', [0.026, 1.21, 0.036], 14, (o, i) => {
    o.position.set(-0.6 + i * 0.093, -0.15, -0.225);
  });
  panel('back', 'metal', 0.81, 0.34, 0.1, 0.1, 0, 0.67, -0.21);
  panel('back', 'teal', 0.62, 0.19, 0.02, 0.05, 0, 0.67, -0.275);
  for (const x of [-1.3, 1.3]) panel('back', 'metal', 0.37, 0.13, 0.16, 0.055, x, -1.08, -0.16);
  inscription('back', 'VESPER / 03', 1.04, 0.195, 0, -1.11, -0.093, true);

  surround('face', 'rubber', 3.82, 2.74, 0.08, 0.43, 0.085, -0.04);
  const eye = new THREE.Path();
  eye.absarc(-0.46, 0.1, 0.79, 0, Math.PI * 2, true);
  mesh('face', roundedGeometry(3.68, 2.61, 0.14, 0.4, eye), 'cream');
  panel('face', 'rubber', 0.55, 1.46, 0.11, 0.2, 1.4, -0.17, 0.11);
  repeatedBoxes('face', 'darkMetal', [0.029, 1.07, 0.035], 7, (o, i) => {
    o.position.set(1.17 + i * 0.068, -0.17, 0.186);
  });
  panel('face', 'metal', 2.56, 0.22, 0.14, 0.075, 0, -1.055, 0.115);
  panel('face', 'rubber', 2.4, 0.115, 0.025, 0.045, 0, -1.05, 0.203);
  for (const x of [-1.58, 1.58]) {
    for (const y of [-1.09, 1.08]) {
      cylinder('face', 'metal', 0.047, 0.02, x, y, 0.09);
      panel('face', 'darkMetal', 0.045, 0.009, 0.005, 0.002, x, y, 0.104);
    }
  }
  inscription('face', 'V E S P E R', 1.05, 0.197, 0.93, 0.57, 0.076);
  inscription('face', '0 3', 0.3, 0.15, 0.88, 0.32, 0.076);

  const barrelProfile = [
    [0.71, 0], [0.85, 0.025], [0.86, 0.1], [0.8, 0.16], [0.73, 0.52],
    [0.64, 0.52], [0.66, 0.13], [0.71, 0],
  ].map(([radius, depth]) => new THREE.Vector2(radius, depth));
  const barrel = mesh('barrel', new THREE.LatheGeometry(barrelProfile, 64), 'darkMetal');
  barrel.rotation.x = Math.PI / 2;
  ring('barrel', 'metal', 0.83, 0.035, 0.07);
  ring('barrel', 'metal', 0.72, 0.032, 0.52);
  for (let i = 0; i < 7; i++) ring('barrel', 'rubber', 0.79 - i * 0.009, 0.019, 0.17 + i * 0.047);
  repeatedBoxes('barrel', 'enamel', [0.018, 0.065, 0.022], 28, (o, i) => {
    const angle = i * Math.PI * 2 / 28;
    o.position.set(Math.sin(angle) * 0.779, Math.cos(angle) * 0.779, 0.126);
    o.rotation.z = -angle;
  });

  ring('shutter', 'metal', 0.603, 0.032, -0.006);
  const leaf = new THREE.Shape();
  leaf.moveTo(0.13, 0.035);
  leaf.bezierCurveTo(0.29, -0.24, 0.54, -0.3, 0.591, -0.105);
  leaf.lineTo(0.46, 0.277);
  leaf.quadraticCurveTo(0.28, 0.15, 0.13, 0.035);
  const leafGeometry = stage.own(new THREE.ExtrudeGeometry(leaf, {
    depth: 0.013, bevelEnabled: false, curveSegments: 10,
  }));
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const blade = mesh('shutter', leafGeometry, i % 2 ? 'darkMetal' : 'metal', 0, 0, i * 0.003);
    leaves.push(blade);
  }
  cylinder('shutter', 'rubber', 0.14, 0.015, 0, 0, -0.02);

  ring('glass', 'metal', 0.665, 0.043, 0);
  ring('glass', 'darkMetal', 0.612, 0.025, 0.025);
  const lens = mesh('glass', new THREE.SphereGeometry(0.604, 48, 24), 'glass', 0, 0, 0.015);
  lens.scale.z = 0.14;
  lens.renderOrder = 3;
  for (const angle of [Math.PI / 4, Math.PI * 5 / 4]) {
    cylinder('glass', 'darkMetal', 0.026, 0.011, Math.cos(angle) * 0.667, Math.sin(angle) * 0.667, 0.043);
  }

  const deck = panel('controls', 'darkMetal', 2.87, 0.73, 0.065, 0.19, 0, 1.442, -0.03);
  deck.rotation.x = Math.PI / 2;
  cylinder('controls', 'metal', 0.327, 0.075, 0.96, 1.53, -0.07, true);
  cylinder('controls', 'teal', 0.3, 0.16, 0.96, 1.638, -0.07, true);
  cylinder('controls', 'cream', 0.095, 0.018, 0.96, 1.727, -0.07, true);
  repeatedBoxes('controls', 'metal', [0.017, 0.1, 0.025], 24, (o, i) => {
    const angle = i * Math.PI * 2 / 24;
    o.position.set(0.96 + Math.sin(angle) * 0.3, 1.633, -0.07 + Math.cos(angle) * 0.3);
    o.rotation.y = angle;
  });
  panel('controls', 'enamel', 0.029, 0.014, 0.105, 0.006, 0.96, 1.731, 0.105);
  cylinder('controls', 'metal', 0.18, 0.08, -0.97, 1.52, 0.06, true);
  cylinder('controls', 'cream', 0.145, 0.095, -0.97, 1.593, 0.06, true);
  panel('controls', 'darkMetal', 1.12, 0.38, 0.14, 0.12, -0.79, 0.974, 0.795);
  panel('controls', 'cream', 0.96, 0.235, 0.04, 0.065, -0.79, 0.974, 0.889);
  repeatedBoxes('controls', 'metal', [0.014, 0.179, 0.018], 15, (o, i) => {
    o.position.set(-1.209 + i * 0.06, 0.974, 0.922);
  });
  panel('controls', 'metal', 0.55, 0.4, 0.16, 0.12, 1.1, 0.978, 0.81);
  panel('controls', 'rubber', 0.41, 0.283, 0.02, 0.077, 1.1, 0.978, 0.902);
  panel('controls', 'teal', 0.28, 0.185, 0.018, 0.046, 1.1, 0.978, 0.917);

  const printMaterial = stage.own(new THREE.MeshStandardMaterial({ map: pictureTexture(stage), roughness: 0.91, metalness: 0 }));
  const paper = surfaces.get('print', 'paper');
  const photograph = new THREE.Mesh(
    stage.own(new THREE.BoxGeometry(2.15, 2.34, 0.026)),
    [paper, paper, paper, paper, printMaterial, paper],
  );
  photograph.castShadow = true;
  photograph.receiveShadow = true;
  root.add(photograph);

  return { root, groups, leaves, photograph, highlight: surfaces.highlight };
}
