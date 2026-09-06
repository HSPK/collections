import * as THREE from 'three';
import type { SpatialStage } from '../../core/spatial';
import { beamNames, canonicalEye, type Point3 } from './data';

export interface PhysicalBeam {
  name: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  startCap: THREE.Vector3[];
  endCap: THREE.Vector3[];
}

const up = new THREE.Vector3(0, 1, 0);

function cap(
  center: THREE.Vector3,
  axis: THREE.Vector3,
  side: THREE.Vector3,
  otherSide: THREE.Vector3,
  incoming: THREE.Vector3,
  outgoing: THREE.Vector3,
  width: number,
): THREE.Vector3[] {
  const normal = incoming.clone().add(outgoing);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const offset = side.clone().multiplyScalar(u * width / 2)
      .addScaledVector(otherSide, v * width / 2);
    offset.addScaledVector(axis, -normal.dot(offset) / normal.dot(axis));
    return center.clone().add(offset);
  });
}

export function createBeamLayout(): PhysicalBeam[] {
  const eye = new THREE.Vector3(...canonicalEye);
  const points = [
    new THREE.Vector3(-3, 2, -3),
    new THREE.Vector3(3, 2, -3),
    new THREE.Vector3(3, 8, -3),
    new THREE.Vector3(3, 8, 3),
  ];
  const axes = [new THREE.Vector3(1, 0, 0), up.clone(), new THREE.Vector3(0, 0, 1)];
  const width = (point: THREE.Vector3) => 1.34 * (
    eye.x + eye.y + eye.z - point.x - point.y - point.z
  ) / 48;
  const depthScales = [1, 0.84, 1.07];

  // Scaling about the actual eye preserves every projected vertex, not just the centerline.
  return axes.map((axis, index) => {
    const transform = (point: THREE.Vector3) => point.clone().sub(eye)
      .multiplyScalar(depthScales[index]).add(eye);
    const previous = axes[(index + 2) % 3];
    const next = axes[(index + 1) % 3];
    const side = next;
    const otherSide = previous;
    return {
      name: beamNames[index],
      start: transform(points[index]),
      end: transform(points[index + 1]),
      startCap: cap(points[index], axis, side, otherSide, previous, axis, width(points[index])).map(transform),
      endCap: cap(points[index + 1], axis, side, otherSide, axis, next, width(points[index + 1])).map(transform),
    };
  });
}

export function createBeamGeometry(beam: PhysicalBeam): THREE.BufferGeometry {
  const corners = [...beam.startCap, ...beam.endCap];
  const center = beam.start.clone().add(beam.end).multiplyScalar(0.5);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7],
    [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const face = faces[faceIndex];
    const normal = corners[face[1]].clone().sub(corners[face[0]])
      .cross(corners[face[2]].clone().sub(corners[face[0]])).normalize();
    const faceCenter = new THREE.Vector3();
    face.forEach((index) => faceCenter.add(corners[index]));
    faceCenter.multiplyScalar(0.25);
    if (normal.dot(faceCenter.sub(center)) < 0) {
      face.reverse();
      normal.negate();
    }
    const material = faceIndex < 2 ? 3 : normal.y > 0.45 ? 0 : normal.x > 0.45 ? 1 : 2;
    geometry.addGroup(positions.length / 3, 6, material);
    for (const index of [face[0], face[1], face[2], face[0], face[2], face[3]]) {
      positions.push(corners[index].x, corners[index].y, corners[index].z);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function physicalGaps(beams: PhysicalBeam[]): number[] {
  return beams.map((beam, index) => beam.end.distanceTo(beams[(index + 1) % beams.length].start));
}

export function projectionError(
  beams: PhysicalBeam[],
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): number {
  const project = (point: THREE.Vector3) => {
    const projected = point.clone().project(camera);
    return new THREE.Vector2(projected.x * width / 2, projected.y * height / 2);
  };
  let maximum = 0;
  for (let index = 0; index < beams.length; index++) {
    const a = beams[index].endCap.map(project);
    const b = beams[(index + 1) % beams.length].startCap.map(project);
    for (const [from, to] of [[a, b], [b, a]]) {
      for (const point of from) {
        maximum = Math.max(maximum, Math.min(...to.map((other) => point.distanceTo(other))));
      }
    }
  }
  return maximum;
}

function groundLetter(stage: SpatialStage, text: string, position: THREE.Vector3) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const painter = canvas.getContext('2d');
  if (!painter) throw new Error('The survey lettering needs a local 2D canvas.');
  painter.fillStyle = '#34423e';
  painter.font = '500 76px monospace';
  painter.textAlign = 'center';
  painter.textBaseline = 'middle';
  painter.fillText(text, 64, 65);
  const texture = stage.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = stage.own(new THREE.PlaneGeometry(0.75, 0.75));
  const material = stage.own(new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, toneMapped: false,
  }));
  const label = new THREE.Mesh(geometry, material);
  label.rotation.x = -Math.PI / 2;
  label.position.set(position.x - 0.95, 0.025, position.z + 0.65);
  stage.scene.add(label);
}

export function buildParadoxScene(stage: SpatialStage) {
  const mobile = stage.size.width < 640;
  const scene = stage.scene;
  scene.fog = new THREE.Fog('#e8e4dc', 42, 92);
  const stone = stage.own(new THREE.MeshStandardMaterial({ color: '#f0debe', roughness: 0.83 }));
  const warmFace = stage.own(new THREE.MeshStandardMaterial({ color: '#c75737', roughness: 0.83 }));
  const redFace = stage.own(new THREE.MeshStandardMaterial({ color: '#d36843', roughness: 0.85 }));
  const cutFace = stage.own(new THREE.MeshStandardMaterial({ color: '#bd563c', roughness: 0.95 }));
  const concrete = stage.own(new THREE.MeshStandardMaterial({ color: '#dedbd1', roughness: 0.95 }));
  const steel = stage.own(new THREE.MeshStandardMaterial({ color: '#354641', metalness: 0.25, roughness: 0.64 }));
  const paleSteel = stage.own(new THREE.MeshStandardMaterial({ color: '#71877d', metalness: 0.18, roughness: 0.7 }));
  const box = stage.own(new THREE.BoxGeometry(1, 1, 1));

  function block(size: Point3, position: Point3, material: THREE.Material, casts = true) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const ground = new THREE.Mesh(stage.own(new THREE.PlaneGeometry(160, 160)), concrete);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = -0.012;
  scene.add(ground);

  const gridVertices: number[] = [];
  for (let value = -12; value <= 12; value += 1.5) {
    gridVertices.push(-12, 0.012, value, 12, 0.012, value, value, 0.012, -12, value, 0.012, 12);
  }
  const grid = stage.own(new THREE.BufferGeometry());
  grid.setAttribute('position', new THREE.Float32BufferAttribute(gridVertices, 3));
  scene.add(new THREE.LineSegments(grid, stage.own(new THREE.LineBasicMaterial({
    color: '#abb5a8', transparent: true, opacity: 0.36,
  }))));

  const beams = createBeamLayout();
  beams.forEach((beam, index) => {
    const mesh = new THREE.Mesh(stage.own(createBeamGeometry(beam)), [stone, warmFace, redFace, cutFace]);
    mesh.name = beam.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const samples = index === 1 ? [0.02] : [0.18, 0.82];
    samples.forEach((t) => {
      const position = beam.start.clone().lerp(beam.end, t);
      const lowerEdge = index === 1 ? position.y - 0.5 : position.y - 0.68;
      const columnHeight = lowerEdge - 0.22;
      block([1.02, 0.2, 1.02], [position.x, 0.1, position.z], stone);
      block([0.24, columnHeight, 0.24], [position.x, 0.22 + columnHeight / 2, position.z], steel);
      block([0.5, 0.12, 0.5], [position.x, lowerEdge + 0.02, position.z], paleSteel);
      block([0.38, 0.08, 0.38], [position.x, 0.26, position.z], paleSteel);
    });
    groundLetter(stage, String.fromCharCode(65 + index), beam.start);
  });

  const pinGeometry = stage.own(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8));
  const capGeometry = stage.own(new THREE.BoxGeometry(0.16, 0.07, 0.16));
  for (const x of [-8, 8]) {
    for (const z of [-8, 8]) {
      const pin = new THREE.Mesh(pinGeometry, steel);
      pin.position.set(x, 0.21, z);
      pin.castShadow = true;
      scene.add(pin);
      const head = new THREE.Mesh(capGeometry, warmFace);
      head.position.set(x, 0.42, z);
      scene.add(head);
      block([0.9, 0.012, 0.05], [x, 0.018, z], paleSteel, false);
      block([0.05, 0.012, 0.9], [x, 0.018, z], paleSteel, false);
    }
  }

  const hemisphere = new THREE.HemisphereLight('#fff8e8', '#b2b9ad', 2.2);
  const sun = new THREE.DirectionalLight('#fff3da', 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.00015;
  sun.target.position.set(0, 2.5, 0);
  stage.own(sun.shadow);
  scene.add(hemisphere, sun, sun.target);

  const guides = new THREE.Group();
  guides.visible = false;
  const rayMaterial = stage.own(new THREE.LineDashedMaterial({
    color: '#9e3b26', dashSize: 0.18, gapSize: 0.13, transparent: true, opacity: 0.8,
  }));
  const eye = new THREE.Vector3(...canonicalEye);
  const beadGeometry = stage.own(new THREE.SphereGeometry(0.085, 10, 6));
  const beadMaterial = stage.own(new THREE.MeshBasicMaterial({ color: '#a53923', toneMapped: false }));
  for (let index = 0; index < beams.length; index++) {
    const first = beams[index].end;
    const second = beams[(index + 1) % beams.length].start;
    const far = eye.distanceTo(first) > eye.distanceTo(second) ? first : second;
    const geometry = stage.own(new THREE.BufferGeometry().setFromPoints([eye, far]));
    const ray = new THREE.Line(geometry, rayMaterial);
    ray.computeLineDistances();
    guides.add(ray);
    for (const position of [first, second]) {
      const bead = new THREE.Mesh(beadGeometry, beadMaterial);
      bead.position.copy(position);
      guides.add(bead);
    }
  }
  const eyeMarker = new THREE.Mesh(stage.own(new THREE.OctahedronGeometry(0.28)), beadMaterial);
  eyeMarker.position.copy(eye);
  guides.add(eyeMarker);
  scene.add(guides);

  return {
    beams,
    guides,
    setSun(degrees: number) {
      const angle = THREE.MathUtils.degToRad(degrees);
      sun.position.set(Math.cos(angle) * -18, 23, Math.sin(angle) * 18);
      stage.invalidate();
    },
  };
}
