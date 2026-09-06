import * as THREE from 'three';
import type { SpatialStage } from '../../core/spatial';
import { random } from '../../core/math';
import { CLUSTERS, MINERALS } from './data';

export interface MineralLighting {
  colors: [string, string, string];
  key: string;
  fill: string;
  emission: number;
  keyIntensity: number;
  pointIntensity: number;
  reflection: number;
}

/** Two irregular hexagonal rings and an offset crown, with independent flat facets. */
export function createCrystalGeometry(seed = 1): THREE.BufferGeometry {
  const rng = random(seed);
  const lower: THREE.Vector3[] = [];
  const shoulder: THREE.Vector3[] = [];
  for (let side = 0; side < 6; side++) {
    const angle = side * Math.PI / 3 + (rng() - 0.5) * 0.1;
    const radius = 0.37 + rng() * 0.09;
    lower.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    shoulder.push(new THREE.Vector3(
      Math.cos(angle) * radius * 0.79 + 0.018,
      0.73 + rng() * 0.09,
      Math.sin(angle) * radius * 0.79 - 0.025,
    ));
  }
  const apex = new THREE.Vector3(0.045 + rng() * 0.035, 1, -0.045);
  const base = new THREE.Vector3(0, 0, 0);
  const positions: number[] = [];
  const colors: number[] = [];
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: number) {
    for (const vertex of [a, b, c]) {
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(shade * 0.9, shade, Math.min(1, shade * 1.025));
    }
  }
  for (let side = 0; side < 6; side++) {
    const next = (side + 1) % 6;
    const shade = [0.68, 0.92, 0.58, 0.82, 0.5, 1][side];
    triangle(lower[side], shoulder[side], shoulder[next], shade);
    triangle(lower[side], shoulder[next], lower[next], shade);
    triangle(shoulder[side], apex, shoulder[next], Math.min(1, shade + 0.12));
    triangle(base, lower[side], lower[next], 0.5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRockGeometry(seed: number): THREE.BufferGeometry {
  const rng = random(seed);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position');
  const color = new THREE.Color();
  const colors: number[] = [];
  // A position-based displacement keeps duplicate triangle corners watertight.
  const salt = rng() * 5;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wobble = 1 + 0.13 * Math.sin(x * 8 + y * 5 + z * 7 + salt);
    position.setXYZ(i, x * wobble, y * wobble, z * wobble);
  }
  for (let i = 0; i < position.count; i += 3) {
    const height = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    color.set('#67766b').multiplyScalar(0.65 + rng() * 0.4 + height * 0.09);
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const waterVertex = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = `
  uniform float uTime;
  uniform float uStrength;
  uniform vec3 uMint;
  uniform vec3 uOpal;
  uniform vec3 uAmber;
  varying vec3 vWorld;
  float reflected(vec2 origin, float width) {
    float along = vWorld.z - origin.y;
    float shimmer = sin(vWorld.z * 18.0 + sin(vWorld.x * 7.0 + uTime) * 2.0);
    float bend = sin(vWorld.z * 6.0 + uTime) * 0.12;
    float column = exp(-pow((vWorld.x - origin.x + bend) / width, 2.0) * 2.0);
    float reach = smoothstep(-0.6, 0.4, along) * exp(-max(along, 0.0) * 0.24);
    return column * reach * (0.16 + 0.52 * pow(max(shimmer, 0.0), 7.0));
  }
  void main() {
    vec3 color = vec3(0.019, 0.075, 0.074);
    float ripple = pow(max(sin(vWorld.z * 10.0 + sin(vWorld.x * 2.0) + uTime), 0.0), 26.0);
    color += vec3(0.025, 0.065, 0.055) * ripple;
    color += uMint * reflected(vec2(-3.5, -9.3), 1.05) * uStrength;
    color += uOpal * reflected(vec2(0.1, -12.2), 0.9) * uStrength;
    color += uAmber * reflected(vec2(4.1, -8.8), 0.9) * uStrength;
    color += uMint * reflected(vec2(-5.8, 0.1), 0.6) * uStrength;
    color += uAmber * reflected(vec2(4.9, 2.8), 0.6) * uStrength;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildCavern(stage: SpatialStage, mobile: boolean) {
  const rng = random(39027);
  const matrix = new THREE.Object3D();
  const rockGeometry = stage.own(createRockGeometry(3901));
  const stoneMaterial = stage.own(new THREE.MeshStandardMaterial({
    color: '#a2a698', vertexColors: true, roughness: 0.94, metalness: 0.04, flatShading: true,
  }));
  const darkMaterial = stage.own(new THREE.MeshStandardMaterial({
    color: '#344b49', vertexColors: true, roughness: 1, flatShading: true,
  }));
  const stoneTransforms: { position: number[]; scale: number[]; rotation: number }[] = [];
  const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    stoneTransforms.push({ position: [x, y, z], scale: [sx, sy, sz], rotation: rng() * 0.9 });
  };

  for (const side of [-1, 1]) {
    for (let row = 0; row < 8; row++) {
      const z = 8 - row * 3.7;
      rock(side * (9.8 + rng()), 3.5, z, 3.1, 5.2 + rng(), 3.2);
      rock(side * 7.5, 8.1 + rng(), z - 0.7, 3.5, 2.8, 3.6);
      rock(side * 3.9, 11.3, z - 1, 3.9, 2.0, 3.4);
      rock(side * (7.3 + rng()), 0.35, z, 1.5, 0.7 + rng() * 0.8, 2.1);
    }
    rock(side * 5.3, 3.7, -20, 4.3, 5.5, 3);
    rock(side * 2.8, 6.1, -20.5, 2.4, 3.3, 2.7);
  }
  rock(0, 9.2, -19.5, 5.6, 2.8, 3.2);
  rock(0, 12.1, -5.5, 3.8, 1.8, 13);
  rock(0, 3, -29, 9, 5, 2);

  for (const cluster of CLUSTERS) {
    rock(cluster.x, 0.1, cluster.z, 0.8 + cluster.height * 0.15, 0.35, 0.7 + cluster.height * 0.12);
  }
  // The path is walk-sized, not a display plinth: separate low stones cross the basin.
  for (let i = 0; i < 14; i++) {
    const z = 8.3 - i * 1.33;
    const x = 1.05 + Math.sin(i * 0.38) * 1.15;
    rock(x, 0.09 + rng() * 0.025, z, 0.74 + rng() * 0.12, 0.22, 0.62);
  }
  const rocks = stage.own(new THREE.InstancedMesh(rockGeometry, stoneMaterial, stoneTransforms.length));
  stoneTransforms.forEach((item, index) => {
    matrix.position.set(item.position[0], item.position[1], item.position[2]);
    matrix.scale.set(item.scale[0], item.scale[1], item.scale[2]);
    matrix.rotation.set(0.08 * Math.sin(index), item.rotation, 0.04 * Math.cos(index));
    matrix.updateMatrix();
    rocks.setMatrixAt(index, matrix.matrix);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  stage.scene.add(rocks);

  const spireGeometry = stage.own(new THREE.ConeGeometry(1, 1, 5, 1));
  spireGeometry.translate(0, 0.5, 0);
  const spireMaterial = stage.own(new THREE.MeshStandardMaterial({
    color: '#607268', roughness: 0.95, flatShading: true,
  }));
  const spires = stage.own(new THREE.InstancedMesh(spireGeometry, spireMaterial, 26));
  for (let i = 0; i < spires.count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const hanging = i >= 16;
    matrix.position.set(side * (6.6 + rng() * 1.6), hanging ? 9.4 : 0, 5.5 - (i % 13) * 1.8);
    matrix.scale.set(0.4 + rng() * 0.55, 1.2 + rng() * 2.9, 0.5 + rng() * 0.5);
    matrix.rotation.set(hanging ? Math.PI : 0, rng() * 3, (rng() - 0.5) * 0.2);
    matrix.updateMatrix();
    spires.setMatrixAt(i, matrix.matrix);
  }
  spires.castShadow = true;
  spires.receiveShadow = true;
  stage.scene.add(spires);

  const foreground = stage.own(new THREE.InstancedMesh(rockGeometry, darkMaterial, 6));
  const framing = [
    [-8.5, 3.1, 7.0, 2.8, 5.4, 2.4], [8.6, 3.9, 7.0, 2.8, 5.8, 2.8],
    [-6.5, -0.1, 10, 3.5, 1.1, 2.1], [6.5, 0, 10.9, 2.9, 1.1, 2.4],
    [-6.1, 9, 7.8, 3.8, 2.0, 3.0], [6.5, 9.1, 8.5, 3.8, 2.4, 3.0],
  ];
  framing.forEach(([x, y, z, sx, sy, sz], index) => {
    matrix.position.set(x, y, z);
    matrix.rotation.set(0, index * 0.6, 0.15);
    matrix.scale.set(sx, sy, sz);
    matrix.updateMatrix();
    foreground.setMatrixAt(index, matrix.matrix);
  });
  stage.scene.add(foreground);

  const floorGeometry = stage.own(new THREE.PlaneGeometry(42, 52, 18, 20));
  floorGeometry.rotateX(-Math.PI / 2);
  const floorPosition = floorGeometry.getAttribute('position');
  for (let i = 0; i < floorPosition.count; i++) {
    floorPosition.setY(i, -0.16 - rng() * 0.1);
  }
  floorGeometry.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeometry, stage.own(new THREE.MeshStandardMaterial({
    color: '#3b504b', roughness: 0.88, metalness: 0.14, flatShading: true,
  })));
  floor.position.z = -6;
  floor.receiveShadow = true;
  stage.scene.add(floor);

  const crystalGeometries = Array.from({ length: 4 }, (_, i) => stage.own(createCrystalGeometry(390 + i)));
  const crystalMaterials = MINERALS[0].colors.map((color) => stage.own(new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.3,
    roughness: 0.24, metalness: 0.2, vertexColors: true, flatShading: true,
  })));
  const shards: { mineral: number; variant: number; transform: THREE.Matrix4 }[] = [];
  CLUSTERS.forEach((cluster, clusterIndex) => {
    const count = mobile ? Math.max(4, Math.ceil(cluster.count * 0.72)) : cluster.count;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + rng() * 0.5;
      const radial = i === 0 ? 0 : (0.25 + rng() * 0.8) * (cluster.height * 0.23);
      const height = cluster.height * (i === 0 ? 1 : 0.22 + rng() * 0.58);
      const width = height * (0.26 + rng() * 0.16);
      matrix.position.set(cluster.x + Math.cos(angle) * radial, 0.27, cluster.z + Math.sin(angle) * radial);
      matrix.scale.set(width, height, width * (0.8 + rng() * 0.3));
      matrix.rotation.set(
        i === 0 ? -0.06 : Math.sin(angle) * (0.15 + rng() * 0.4),
        rng() * Math.PI,
        i === 0 ? 0.07 : -Math.cos(angle) * (0.15 + rng() * 0.4),
      );
      matrix.updateMatrix();
      shards.push({ mineral: cluster.mineral, variant: (clusterIndex + i) % 4, transform: matrix.matrix.clone() });
    }
  });
  let crystalCount = 0;
  for (let mineral = 0; mineral < 3; mineral++) {
    for (let variant = 0; variant < 4; variant++) {
      const group = shards.filter((shard) => shard.mineral === mineral && shard.variant === variant);
      const crystals = stage.own(new THREE.InstancedMesh(crystalGeometries[variant], crystalMaterials[mineral], group.length));
      group.forEach((shard, index) => crystals.setMatrixAt(index, shard.transform));
      crystalCount += crystals.count;
      crystals.castShadow = true;
      crystals.receiveShadow = true;
      stage.scene.add(crystals);
    }
  }

  const waterMaterial = stage.own(new THREE.ShaderMaterial({
    vertexShader: waterVertex, fragmentShader: waterFragment,
    uniforms: {
      uTime: { value: 0 }, uStrength: { value: 0.8 },
      uMint: { value: new THREE.Color(MINERALS[0].colors[0]) },
      uOpal: { value: new THREE.Color(MINERALS[0].colors[1]) },
      uAmber: { value: new THREE.Color(MINERALS[0].colors[2]) },
    },
  }));
  const pool = new THREE.Mesh(stage.own(new THREE.CircleGeometry(1, mobile ? 40 : 64)), waterMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(6.7, 9.1, 1);
  pool.position.set(-0.15, 0.035, -1.6);
  stage.scene.add(pool);

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 64;
  const painter = textureCanvas.getContext('2d');
  if (!painter) throw new Error('The cavern could not prepare its local mineral-light texture.');
  const gradient = painter.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.26, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  painter.fillStyle = gradient;
  painter.fillRect(0, 0, 64, 64);
  const glowTexture = stage.own(new THREE.CanvasTexture(textureCanvas));
  const glowMaterials = MINERALS[0].colors.map((color) => stage.own(new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity: 0.23,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  for (const cluster of CLUSTERS.slice(0, 10)) {
    const glow = new THREE.Sprite(glowMaterials[cluster.mineral]);
    glow.position.set(cluster.x, cluster.height * 0.57, cluster.z);
    glow.scale.set(cluster.height * 1.3, cluster.height * 1.5, 1);
    stage.scene.add(glow);
  }

  const shaftMaterial = stage.own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#afdfca') }, uDensity: { value: 0.09 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform vec3 uColor; uniform float uDensity;
      void main() {
        float edge = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 2.0);
        float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
        gl_FragColor = vec4(uColor, edge * fade * uDensity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const shaftGeometry = stage.own(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < 3; i++) {
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.set(-3.5 + i * 3.5, 6.2, -11 - i * 2.0);
    shaft.scale.set(2.4 - i * 0.4, 11.8, 1);
    shaft.rotation.z = -0.28;
    stage.scene.add(shaft);
  }

  const moteCount = mobile ? 44 : 88;
  const moteOrigins = Float32Array.from({ length: moteCount * 3 }, (_, i) => {
    if (i % 3 === 0) return (rng() - 0.5) * 15;
    if (i % 3 === 1) return 0.8 + rng() * 8;
    return 6 - rng() * 24;
  });
  const moteGeometry = stage.own(new THREE.BufferGeometry());
  const motePositions = new THREE.BufferAttribute(moteOrigins.slice(), 3);
  moteGeometry.setAttribute('position', motePositions);
  const moteMaterial = stage.own(new THREE.PointsMaterial({
    color: '#d0ebce', size: 0.07, map: glowTexture,
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  stage.scene.add(motes);

  stage.scene.fog = new THREE.FogExp2('#17383b', 0.026);
  const ambient = new THREE.HemisphereLight('#bad8ce', '#5f6251', 1.25);
  const key = new THREE.DirectionalLight('#c8eee0', 2.4);
  key.position.set(-4, 9, 6);
  key.target.position.set(0, 0, -7);
  key.castShadow = !mobile;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 14, bottom: -13, near: 0.5, far: 48 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = 0.07;
  key.shadow.bias = -0.0003;
  stage.own(key.shadow);
  const fill = new THREE.DirectionalLight('#e6b57c', 1.15);
  fill.position.set(7, 4, 4);
  const mintLight = new THREE.PointLight('#69d8cf', 105, 22, 2);
  mintLight.position.set(-3.2, 3.5, -7.2);
  const amberLight = new THREE.PointLight('#e8aa62', 70, 17, 2);
  amberLight.position.set(4.2, 2.4, -7);
  stage.own(fill.shadow);
  stage.own(mintLight.shadow);
  stage.own(amberLight.shadow);
  stage.scene.add(ambient, key, key.target, fill, mintLight, amberLight);
  stage.renderer.shadowMap.autoUpdate = false;
  stage.renderer.shadowMap.needsUpdate = true;

  return {
    crystalCount,
    clusterCount: CLUSTERS.length,
    moteCount,
    rockCount: rocks.count + foreground.count + spires.count,
    trianglesPerCrystal: crystalGeometries[0].getAttribute('position').count / 3,
    applyLighting(light: MineralLighting) {
      crystalMaterials.forEach((material, index) => {
        material.color.set(light.colors[index]);
        material.emissive.set(light.colors[index]);
        material.emissiveIntensity = light.emission;
        glowMaterials[index].color.set(light.colors[index]);
        glowMaterials[index].opacity = light.reflection * 0.2;
      });
      key.color.set(light.key);
      key.intensity = light.keyIntensity;
      fill.color.set(light.fill);
      mintLight.color.set(light.colors[0]);
      mintLight.intensity = light.pointIntensity;
      amberLight.color.set(light.colors[2]);
      amberLight.intensity = light.pointIntensity * 0.67;
      waterMaterial.uniforms.uMint.value.set(light.colors[0]);
      waterMaterial.uniforms.uOpal.value.set(light.colors[1]);
      waterMaterial.uniforms.uAmber.value.set(light.colors[2]);
      waterMaterial.uniforms.uStrength.value = light.reflection;
      shaftMaterial.uniforms.uColor.value.set(light.key);
    },
    setMist(amount: number) {
      const fraction = amount / 100;
      if (stage.scene.fog instanceof THREE.FogExp2) stage.scene.fog.density = 0.014 + fraction * 0.034;
      shaftMaterial.uniforms.uDensity.value = 0.035 + fraction * 0.12;
      moteMaterial.opacity = 0.28 + fraction * 0.5;
    },
    renderTime(phase: number) {
      const angle = phase * Math.PI * 2;
      // Every moving component is a pure function of the same cyclic clock.
      waterMaterial.uniforms.uTime.value = angle;
      for (let i = 0; i < moteCount; i++) {
        motePositions.setXYZ(i,
          moteOrigins[i * 3] + Math.sin(angle + i * 1.7) * 0.23,
          moteOrigins[i * 3 + 1] + Math.cos(angle + i) * 0.25,
          moteOrigins[i * 3 + 2] + Math.sin(angle + i * 0.8) * 0.18,
        );
      }
      motePositions.needsUpdate = true;
    },
    get emission() { return crystalMaterials[0].emissiveIntensity; },
    get crystalColor() { return `#${crystalMaterials[0].color.getHexString()}`; },
    get lightIntensity() { return mintLight.intensity; },
  };
}

export type CavernScene = ReturnType<typeof buildCavern>;
