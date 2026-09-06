import * as THREE from 'three';
import { random } from '../../core/math';
import type { SpatialStage } from '../../core/spatial';
import { SHOPS, type Shopfront } from './data';

interface GlowMaterial {
  material: THREE.MeshBasicMaterial;
  color: THREE.Color;
  opacity: number;
}

export interface NightStreet {
  setLightPower: (power: number) => void;
  lightPower: () => number;
  lampIntensity: () => number;
}

function drawing(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const painter = canvas.getContext('2d');
  if (!painter) throw new Error('Neon Rain could not draw its local shop signs.');
  return { canvas, painter };
}

function signDrawing(shop: Shopfront, blade = false): HTMLCanvasElement {
  const { canvas, painter } = drawing(blade ? 256 : 1024, blade ? 640 : 256);
  const { width, height } = canvas;
  painter.fillStyle = '#0a161d';
  painter.fillRect(0, 0, width, height);
  painter.strokeStyle = shop.color;
  painter.lineWidth = blade ? 5 : 4;
  painter.strokeRect(11, 11, width - 22, height - 22);
  painter.strokeStyle = `${shop.color}55`;
  painter.strokeRect(19, 19, width - 38, height - 38);
  painter.textAlign = 'center';
  painter.textBaseline = 'middle';
  painter.fillStyle = shop.color;
  painter.shadowColor = shop.color;
  painter.shadowBlur = 14;
  if (blade) {
    const interval = (height - 104) / shop.blade.length;
    shop.blade.forEach((line, index) => {
      painter.font = `bold ${line.length === 1 ? 100 : 43}px monospace`;
      painter.fillText(line, width / 2, 52 + interval * (index + 0.5), width - 38);
    });
  } else {
    painter.font = `900 ${shop.name.length > 9 ? 105 : 140}px sans-serif`;
    painter.fillText(shop.name, width / 2, 111, width - 65);
    painter.shadowBlur = 0;
    painter.font = '22px monospace';
    painter.fillStyle = '#f2e9cd';
    painter.fillText(shop.detail, width / 2, 212, width - 60);
    for (let x = 32; x < width - 20; x += 24) {
      painter.fillStyle = shop.color;
      painter.fillRect(x, height - 24, 6, 4);
    }
  }
  painter.shadowBlur = 0;
  painter.fillStyle = '#00000016';
  for (let y = 0; y < height; y += 4) painter.fillRect(0, y, width, 1);
  return canvas;
}

function puddleDrawing(sign: HTMLCanvasElement, color: string, seed: number): HTMLCanvasElement {
  const { canvas, painter } = drawing(256, 512);
  const next = random(seed);
  const glow = painter.createLinearGradient(0, 0, 0, 512);
  glow.addColorStop(0, `${color}08`);
  glow.addColorStop(0.3, `${color}55`);
  glow.addColorStop(0.75, `${color}8c`);
  glow.addColorStop(1, `${color}00`);
  painter.fillStyle = glow;
  painter.fillRect(32, 0, 192, 512);
  // Inverted sign scanlines break into long, irregular streaks on the asphalt.
  for (let y = 8; y < 500; y += 3) {
    const fade = Math.sin(y / 512 * Math.PI);
    painter.globalAlpha = (0.18 + next() * 0.64) * fade;
    const sourceY = Math.floor((1 - y / 512) * (sign.height - 1));
    painter.drawImage(sign, 0, sourceY, sign.width, 1, 20 + (next() - 0.5) * 34, y, 216, 2);
  }
  painter.globalCompositeOperation = 'destination-in';
  const edge = painter.createLinearGradient(0, 0, 256, 0);
  edge.addColorStop(0, '#ffffff00');
  edge.addColorStop(0.2, '#ffffffff');
  edge.addColorStop(0.8, '#ffffffff');
  edge.addColorStop(1, '#ffffff00');
  painter.globalAlpha = 1;
  painter.fillStyle = edge;
  painter.fillRect(0, 0, 256, 512);
  return canvas;
}

export function buildNightStreet(stage: SpatialStage): NightStreet {
  const { scene } = stage;
  const next = random(370037);
  scene.fog = new THREE.FogExp2('#091c25', 0.022);
  const cube = stage.own(new THREE.BoxGeometry(1, 1, 1));
  const plane = stage.own(new THREE.PlaneGeometry(1, 1));
  const cylinder = stage.own(new THREE.CylinderGeometry(1, 1, 1, 9));
  const orb = stage.own(new THREE.SphereGeometry(1, 8, 6));
  const glowMaterials: GlowMaterial[] = [];
  const pools = new Map<THREE.Material, Map<THREE.BufferGeometry, THREE.Matrix4[]>>();
  const transform = new THREE.Object3D();
  const standard = (color: string, roughness = 0.7, metalness = 0.1) => stage.own(
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
  const solid = (color: string) => stage.own(new THREE.MeshBasicMaterial({ color }));
  const neon = (color: string, opacity = 1, additive = false) => {
    const material = stage.own(new THREE.MeshBasicMaterial({
      color, opacity, transparent: opacity < 1 || additive,
      depthWrite: !additive, toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    }));
    glowMaterials.push({ material, color: material.color.clone(), opacity });
    return material;
  };
  const texture = (canvas: HTMLCanvasElement) => {
    const map = stage.own(new THREE.CanvasTexture(canvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy());
    return map;
  };
  const put = (
    geometry: THREE.BufferGeometry, material: THREE.Material,
    position: [number, number, number], scale: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) => {
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    let byGeometry = pools.get(material);
    if (!byGeometry) {
      byGeometry = new Map();
      pools.set(material, byGeometry);
    }
    let matrices = byGeometry.get(geometry);
    if (!matrices) {
      matrices = [];
      byGeometry.set(geometry, matrices);
    }
    matrices.push(transform.matrix.clone());
  };
  const box = (
    material: THREE.Material, x: number, y: number, z: number,
    width: number, height: number, depth: number,
  ) => put(cube, material, [x, y, z], [width, height, depth]);
  const panel = (
    map: THREE.Texture, x: number, y: number, z: number,
    width: number, height: number, angle = 0,
  ) => {
    const material = neon('#ffffff');
    material.map = map;
    const mesh = new THREE.Mesh(plane, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, 1);
    mesh.rotation.y = angle;
    scene.add(mesh);
  };

  const walls = ['#263744', '#29343c', '#243d45', '#3b343e'].map((color) => standard(color));
  const recess = standard('#111d25');
  const trim = standard('#445965', 0.45, 0.45);
  const sidewalk = standard('#35444c', 0.7);
  const metal = standard('#172c35', 0.4, 0.6);
  const glass = standard('#163542', 0.19, 0.65);
  const paint = solid('#627777');
  const warmWindow = neon('#b29166');
  const coolWindow = neon('#497d80');
  const unlitWindow = solid('#14232d');
  const teal = neon('#65e9d1');
  const pink = neon('#ff6baf');
  const amber = neon('#ffbd78');

  scene.add(new THREE.HemisphereLight('#7aa6b7', '#18202e', 1.25));
  const moon = new THREE.DirectionalLight('#b0d6e5', 1.5);
  stage.own(moon.shadow);
  moon.position.set(-8, 22, 12);
  scene.add(moon);
  const lampLights: { light: THREE.PointLight; intensity: number }[] = [];
  for (const [x, z, color, intensity] of [
    [-3.9, 0, '#ffa064', 90],
    [3.9, -5, '#ff438b', 95],
    [-3.8, -15, '#3cffe0', 85],
  ] as const) {
    const light = new THREE.PointLight(color, intensity, 17, 2);
    stage.own(light.shadow);
    light.position.set(x, 3.2, z);
    scene.add(light);
    lampLights.push({ light, intensity });
  }

  const asphalt = drawing(256, 512);
  asphalt.painter.fillStyle = '#27363c';
  asphalt.painter.fillRect(0, 0, 256, 512);
  for (let index = 0; index < 4500; index++) {
    asphalt.painter.fillStyle = next() > 0.5 ? '#83909023' : '#040d1538';
    asphalt.painter.fillRect(next() * 256, next() * 512, 1 + next() * 2, 1);
  }
  const roadMap = texture(asphalt.canvas);
  roadMap.wrapS = roadMap.wrapT = THREE.RepeatWrapping;
  roadMap.repeat.set(3, 12);
  const road = standard('#667c86', 0.24, 0.55);
  road.map = roadMap;
  box(road, 0, -0.14, -18, 12, 0.25, 85);
  for (const side of [-1, 1]) {
    box(sidewalk, side * 5.7, 0.11, -20, 2.8, 0.24, 77);
    box(trim, side * 4.36, 0.18, -20, 0.13, 0.3, 77);
    box(metal, side * 4.15, 0.015, -20, 0.14, 0.025, 77);
    for (let z = 14; z > -57; z -= 2.2) {
      box(recess, side * 5.6, 0.234, z, 2.65, 0.008, 0.025);
      for (let slot = 0; slot < 5; slot++) {
        box(recess, side * 4.6, 0.237, z + slot * 0.08, 0.34, 0.009, 0.026);
      }
    }
  }
  for (let z = 7; z > -51; z -= 6) box(paint, 0, 0.008, z, 0.09, 0.016, 2.2);
  for (let x = -3.5; x < 4; x += 1.1) box(paint, x, 0.01, 8.3, 0.63, 0.02, 2.8);
  box(paint, 0, 0.01, 5.8, 7.6, 0.02, 0.12);

  for (const side of [-1, 1]) {
    for (let block = 0; block < 6; block++) {
      const z = 1 - block * 11.7;
      const height = 11 + next() * 11;
      const wall = walls[(block + (side === 1 ? 1 : 0)) % walls.length];
      box(wall, side * 8.8, height / 2, z, 7.2, height, 11.1);
      box(recess, side * 5.15, 2.15, z, 0.18, 3.75, 10.75);
      box(trim, side * 5.02, 4.25, z, 0.37, 0.27, 11.35);
      box(trim, side * 8.8, height + 0.12, z, 7.5, 0.25, 11.35);
      box(recess, side * 8.8, height + 0.25, z, 6.9, 0.08, 10.8);
      for (let floor = 6; floor < height - 1; floor += 3) {
        box(trim, side * 5.16, floor - 1.27, z, 0.13, 0.1, 10.9);
        for (let column = -4; column <= 4; column += 2) {
          const lit = next();
          const windowMaterial = lit < 0.27 ? warmWindow : lit < 0.55 ? coolWindow : unlitWindow;
          box(recess, side * 5.13, floor, z + column, 0.17, 1.95, 1.3);
          box(windowMaterial, side * 5.02, floor, z + column, 0.04, 1.68, 1.06);
          box(metal, side * 4.99, floor, z + column, 0.045, 0.055, 1.08);
          box(metal, side * 4.99, floor, z + column, 0.045, 1.7, 0.035);
          box(trim, side * 4.96, floor - 0.92, z + column, 0.33, 0.12, 1.43);
        }
        for (let column = 0; column < 3; column++) {
          const x = side * (6.5 + column * 2.05);
          const windowMaterial = next() < 0.42 ? warmWindow : coolWindow;
          box(recess, x, floor, z + 5.59, 1.32, 1.94, 0.13);
          box(windowMaterial, x, floor, z + 5.68, 1.05, 1.66, 0.025);
          box(metal, x, floor, z + 5.7, 0.035, 1.7, 0.03);
          box(metal, x, floor, z + 5.7, 1.08, 0.055, 0.03);
        }
      }
      // A little rooftop machinery keeps the elevated view a real neighborhood.
      put(cylinder, metal, [side * 8.6, height + 1.15, z - 1.5], [1, 2, 1]);
      put(cylinder, trim, [side * 8.6, height + 2.18, z - 1.5], [1.08, 0.1, 1.08]);
      box(trim, side * 6.1, height + 0.5, z + 3, 1.4, 0.75, 1.1);
      box(metal, side * 6.1, height + 2.3, z + 3, 0.06, 4, 0.06);
      box(metal, side * 6.1, height + 3.3, z + 3, 2.1, 0.04, 0.04);
      put(cylinder, metal, [side * 5.0, height / 2, z - 5.25], [0.06, height, 0.06]);
      for (let shopWindow = -3.6; shopWindow <= 3.6; shopWindow += 2.4) {
        box(glass, side * 5.02, 1.85, z + shopWindow, 0.08, 2.55, 2.06);
        box(trim, side * 4.95, 1.85, z + shopWindow + 1, 0.1, 2.9, 0.09);
        box(trim, side * 4.95, 0.52, z + shopWindow, 0.1, 0.15, 2.1);
      }
    }
  }

  const haloDrawing = drawing(64, 64);
  const haloGradient = haloDrawing.painter.createRadialGradient(32, 32, 0, 32, 32, 32);
  haloGradient.addColorStop(0, '#ffffffff');
  haloGradient.addColorStop(0.2, '#ffffff55');
  haloGradient.addColorStop(1, '#ffffff00');
  haloDrawing.painter.fillStyle = haloGradient;
  haloDrawing.painter.fillRect(0, 0, 64, 64);
  const haloMap = texture(haloDrawing.canvas);
  const halo = (color: string, x: number, y: number, z: number, width: number, height: number, ground = false) => {
    const material = neon(color, ground ? 0.28 : 0.18, true);
    material.map = haloMap;
    const mesh = new THREE.Mesh(plane, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, 1);
    if (ground) mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
  };

  SHOPS.forEach((shop, index) => {
    const { side, z, color } = shop;
    const shopNeon = neon(color);
    const canvas = signDrawing(shop);
    const signMap = texture(canvas);
    panel(signMap, side * 4.91, 4.95, z, 8.7, 1.95, -side * Math.PI / 2);
    if (index < 2) {
      panel(signMap, side * 8.75, 4.5, 6.68, 6.8, 1.65);
      box(glass, side * 8.75, 1.9, 6.58, 6.8, 2.7, 0.05);
      for (let mullion = 0; mullion < 5; mullion++) {
        box(trim, side * (5.5 + mullion * 1.6), 1.9, 6.65, 0.08, 2.8, 0.08);
      }
      box(shopNeon, side * 8.75, 3.3, 6.69, 6.9, 0.05, 0.05);
    }
    box(metal, side * 4.99, 4.95, z, 0.27, 2.15, 9);
    const bladeZ = z + 4.1;
    box(metal, side * 4.5, 7.3, bladeZ - 0.1, 1.5, 4.9, 0.27);
    panel(texture(signDrawing(shop, true)), side * 4.42, 7.3, bladeZ + 0.06, 1.3, 4.65);
    box(shopNeon, side * 3.72, 7.3, bladeZ, 0.035, 4.9, 0.07);
    box(metal, side * 4.8, 9.5, bladeZ, 1.2, 0.09, 0.1);
    halo(color, side * 4.4, 7.3, bladeZ + 0.03, 4, 7.5);
    box(shopNeon, side * 4.87, 3.55, z, 0.1, 0.055, 9);
    for (let stripe = 0; stripe < 15; stripe++) {
      put(cube, stripe % 2 ? metal : walls[index % walls.length],
        [side * 4.65, 3.2, z - 4.3 + stripe * 0.61], [1.45, 0.12, 0.59], [0, 0, side * 0.15]);
    }
    box(shopNeon, side * 3.94, 3.09, z, 0.045, 0.065, 9.1);
    for (let shelf = 0; shelf < 3; shelf++) {
      box(shopNeon, side * 4.92, 1.1 + shelf * 0.54, z - 1.8, 0.05, 0.05, 3.5);
    }
    box(shopNeon, side * 4.91, 2, z + 3.05, 0.03, 1.95, 0.035);
    box(shopNeon, side * 4.91, 2.99, z + 2.3, 0.03, 0.035, 1.5);
    const reflectionMaterial = neon('#ffffff', 0.69, true);
    reflectionMaterial.map = texture(puddleDrawing(canvas, color, index + 101));
    const reflection = new THREE.Mesh(plane, reflectionMaterial);
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(side * 2.8, 0.024 + index * 0.001, z + 4.5);
    reflection.scale.set(3.45, 15, 1);
    reflection.renderOrder = 2;
    scene.add(reflection);
    halo(color, side * 3.2, 0.02, z, 5.5, 10, true);
    for (let line = 0; line < 22; line++) {
      box(shopNeon, side * (1.6 + next() * 2.3), 0.022, z - 2 + next() * 13,
        0.03 + next() * 0.42, 0.002, 0.03);
    }
  });

  // Cinema fins, ticket booth and a row of glowing laundry doors.
  for (let z = -3.2; z <= 3.2; z += 0.8) {
    box(amber, -4.89, 6.6, z, 0.06, 1.15, 0.04);
  }
  box(metal, -4.3, 1.25, 3.4, 0.8, 2, 1.2);
  box(amber, -3.86, 1.45, 3.4, 0.03, 0.75, 0.84);
  const washerRim = stage.own(new THREE.TorusGeometry(0.43, 0.06, 5, 18));
  for (let z = -17.7; z < -12.2; z += 1.25) {
    box(trim, -4.97, 1.1, z, 0.15, 1.5, 1.08);
    put(washerRim, teal, [-4.85, 1.15, z], [1, 1, 1], [0, Math.PI / 2, 0]);
  }
  for (const side of [-1, 1]) {
    for (let z = 3; z > -47; z -= 17) {
      const x = side * 4.08;
      put(cylinder, metal, [x, 2.6, z], [0.065, 5.2, 0.065]);
      box(metal, x - side * 0.35, 5.18, z, 0.85, 0.08, 0.1);
      put(orb, amber, [x - side * 0.7, 5.13, z], [0.15, 0.1, 0.2]);
      halo('#ffbf7a', x - side * 0.7, 5.1, z + 0.03, 1.7, 1.7);
      halo('#b7935b', x - side * 0.7, 0.025, z, 2.1, 5.8, true);
      box(metal, side * 4.95, 0.48, z - 2, 0.55, 0.9, 0.55);
      box(trim, side * 4.95, 0.95, z - 2, 0.62, 0.06, 0.62);
    }
  }

  for (const [z, height] of [[2, 10.8], [-15, 12.2], [-30, 14]] as const) {
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5.2, height, z),
      new THREE.Vector3(0, height - 1.4, z - 0.5),
      new THREE.Vector3(5.2, height + 0.2, z - 1),
    ]);
    scene.add(new THREE.Mesh(stage.own(new THREE.TubeGeometry(cable, 16, 0.024, 4, false)), metal));
  }
  box(metal, 0, 6.9, -48, 12, 0.8, 2);
  box(trim, 0, 7.6, -48, 12, 0.06, 1.7);
  box(teal, 0, 6.45, -46.94, 11, 0.06, 0.04);
  for (let x = -5; x <= 5; x += 0.6) box(metal, x, 7.3, -47.2, 0.04, 0.8, 0.04);
  const exit: Shopfront = {
    name: 'VESPER', detail: 'NORTH TRAM / FIRST LIGHT', blade: [], side: 1,
    z: -51, color: '#67e6d0', number: '07', note: '',
  };
  panel(texture(signDrawing(exit)), 0, 5, -49, 5.5, 1.45);
  for (let index = 0; index < 18; index++) {
    const height = 14 + next() * 21;
    box(walls[index % walls.length], -29 + index * 3.4, height / 2, -73 - next() * 8, 3.1, height, 8);
  }
  // A few long puddle highlights connect the lit frontages across the crossing.
  for (let index = 0; index < 65; index++) {
    const material = index % 3 === 0 ? pink : index % 3 === 1 ? teal : amber;
    box(material, (next() - 0.5) * 7.6, 0.023, 3 + next() * 11,
      0.03 + next() * 0.36, 0.003, 0.035);
  }

  for (const [material, byGeometry] of pools) {
    for (const [geometry, matrices] of byGeometry) {
      const mesh = stage.own(new THREE.InstancedMesh(geometry, material, matrices.length));
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  }
  pools.clear();
  let power = 1;
  function setLightPower(value: number) {
    power = THREE.MathUtils.clamp(value, 0.25, 1.5);
    for (const item of glowMaterials) {
      item.material.color.copy(item.color).multiplyScalar(power);
      if (item.material.transparent) item.material.opacity = Math.min(1, item.opacity * Math.sqrt(power));
    }
    for (const item of lampLights) item.light.intensity = item.intensity * power;
  }
  setLightPower(1);
  return {
    setLightPower,
    lightPower: () => power,
    lampIntensity: () => lampLights[0].light.intensity,
  };
}
