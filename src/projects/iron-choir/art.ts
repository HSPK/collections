import * as THREE from 'three';
import type { Character } from './story';
import type { PilotId } from './data';

function material(color: THREE.ColorRepresentation, metalness = 0.2, emissive?: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness, emissive: emissive ?? 0, emissiveIntensity: emissive ? 0.55 : 0 });
}
export function makeMech(pilot: PilotId | null, enemy = false): THREE.Group {
  const root = new THREE.Group();
  const ceramic = material(enemy ? '#c9cdd0' : '#edece5', 0.18);
  const dark = material('#25333e', 0.65), joint = material('#59707c', 0.75);
  const color = pilot === 'luo' ? '#7ed2eb' : pilot === 'ye' ? '#adcbb3' : '#ed9454';
  const accent = material(enemy ? '#ec7a46' : color, 0.35, enemy ? '#a83912' : color);
  const black = material('#081a23');
  const box = (size: number[], pos: number[], mat: THREE.Material, tilt = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.rotation.z = tilt;
    root.add(mesh); return mesh;
  };
  const tube = (radius: number, length: number, pos: number[], mat: THREE.Material, axis: 'x' | 'y' | 'z' = 'y') => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    root.add(mesh); return mesh;
  };
  if (enemy) {
    box([0.62, 0.34, 0.54], [0, 0.78, 0], ceramic, 0.12);
    box([0.5, 0.1, 0.1], [0, 0.97, 0.21], black);
    box([0.3, 0.05, 0.05], [0, 0.98, 0.275], accent);
    for (const x of [-0.32, 0.32]) for (const z of [-0.3, 0.3]) {
      box([0.1, 0.49, 0.13], [x, 0.39, z], dark, x);
      box([0.23, 0.1, 0.28], [x * 1.18, 0.08, z], ceramic);
      tube(0.105, 0.24, [x, 0.59, z], joint, 'x');
    }
    tube(0.105, 0.84, [0.27, 0.87, 0.2], dark, 'z');
    tube(0.13, 0.12, [0.27, 0.87, 0.64], ceramic, 'z');
    box([0.16, 0.4, 0.18], [-0.24, 1.07, -0.19], dark);
    box([0.04, 0.24, 0.04], [-0.24, 1.31, -0.19], accent);
  } else if (pilot === 'ye') {
    for (const x of [-0.26, 0.26]) for (const z of [-0.22, 0.22]) {
      box([0.1, 0.45, 0.1], [x, 0.35, z], dark, x * 0.7);
      box([0.2, 0.11, 0.3], [x * 1.2, 0.09, z * 1.3], ceramic);
    }
    tube(0.28, 0.55, [0, 0.67, 0], ceramic);
    tube(0.23, 0.09, [0, 0.88, 0], dark);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.065, 8, 24), ceramic);
    ring.position.set(0, 1.12, 0); root.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 6, 24), accent);
    inner.position.copy(ring.position); inner.position.z += 0.03; root.add(inner);
    box([0.12, 0.1, 0.13], [0, 1.12, 0.02], black);
    box([0.055, 0.04, 0.025], [0, 1.12, 0.1], accent);
    for (const x of [-0.41, 0.41]) {
      box([0.24, 0.29, 0.31], [x, 0.74, 0], ceramic);
      tube(0.055, 0.5, [x, 0.57, 0.26], dark, 'z');
      box([0.025, 0.32, 0.025], [x, 0.78, -0.23], accent);
    }
  } else {
    const light = pilot === 'luo';
    for (const x of [-0.2, 0.2]) {
      box([0.24, 0.12, light ? 0.48 : 0.42], [x, 0.09, 0.08], dark);
      box([light ? 0.13 : 0.23, 0.32, 0.21], [x, 0.28, 0], ceramic, x * 0.4);
      tube(light ? 0.095 : 0.12, 0.27, [x, 0.49, 0.045], joint, 'x');
      box([0.12, 0.32, 0.14], [x, 0.61, -0.06], dark, -x * 0.5);
    }
    box([0.38, 0.2, 0.3], [0, 0.72, -0.04], joint);
    box([light ? 0.44 : 0.63, 0.42, 0.43], [0, 0.96, 0], ceramic);
    box([0.34, 0.12, 0.035], [0, 1.04, 0.237], black);
    box([light ? 0.21 : 0.12, 0.036, 0.045], [light ? 0.05 : -0.07, 1.06, 0.26], accent);
    box([0.17, 0.17, 0.04], [0.18, 0.89, 0.243], dark);
    for (const x of [-0.43, 0.43]) {
      tube(0.14, 0.13, [x, 1, 0], joint, 'x');
      box([light ? 0.19 : 0.3, 0.28, 0.41], [x, 1.04, -0.04], ceramic, -x * 0.14);
      box([0.17, 0.31, 0.18], [x, 0.75, 0.06], dark);
    }
    if (light) {
      box([0.12, 0.13, 1.1], [0.43, 0.78, 0.5], dark);
      box([0.05, 0.04, 0.75], [0.43, 0.86, 0.5], accent);
      for (const x of [-0.22, 0.22]) {
        tube(0.19, 0.12, [x, 1.22, -0.21], dark, 'z');
        tube(0.11, 0.13, [x, 1.22, -0.22], ceramic, 'z');
      }
    } else {
      box([0.36, 0.69, 0.16], [-0.45, 0.69, 0.28], ceramic, -0.09);
      box([0.07, 0.48, 0.02], [-0.45, 0.7, 0.372], accent);
      tube(0.12, 0.7, [0.43, 0.78, 0.4], dark, 'z');
      tube(0.16, 0.2, [0.43, 0.78, 0.72], ceramic, 'z');
      box([0.54, 0.28, 0.25], [0, 1.15, -0.32], dark);
      for (const x of [-0.17, 0, 0.17]) box([0.08, 0.03, 0.1], [x, 1.3, -0.32], accent);
    }
  }
  return root;
}
export function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      geometries.add(node.geometry);
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) materials.add(mat);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(mat => {
    if (mat instanceof THREE.MeshStandardMaterial) mat.map?.dispose();
    mat.dispose();
  });
  root.clear();
}
export function portrait(character: Character, large = false): string {
  const i = character.portrait, accent = character.color;
  if (i === 5) return `<svg viewBox="0 0 100 120" role="img" aria-label="第零声部原创信号肖像" class="ic-portrait${large ? ' ic-portrait-large' : ''}">
    <rect width="100" height="120" fill="#112735"/><path d="M0 94L100 56M0 64L100 26" stroke="#27414e"/>
    <circle cx="50" cy="51" r="29" fill="none" stroke="${accent}" stroke-width="2"/>
    <path d="M18 57h8l5-19 7 40 6-56 7 67 7-48 7 22 5-9h12" fill="none" stroke="${accent}" stroke-width="2"/>
    <path d="M25 100h50M35 106h30" stroke="#7095a8"/></svg>`;
  const skin = ['#c6a898', '#c6a082', '#c4b4a1', '#b9977d', '#bea58f'][i];
  const hair = [
    'M28 48V33Q31 12 60 22L76 31L73 47L64 31L40 35Z',
    'M24 59V34Q31 12 55 20Q79 21 78 47L68 35L61 32L35 38L34 61Z',
    'M26 53L24 32Q41 13 67 24L76 38L70 59L68 37L49 28L34 43L32 59Z',
    'M27 46L25 33Q40 20 64 25L75 39L72 47L66 34L34 37Z',
    'M27 42L29 28L47 20L67 25L75 42L69 40L63 31L37 35Z',
  ][i];
  return `<svg viewBox="0 0 100 120" role="img" aria-label="${character.name}原创肖像" class="ic-portrait${large ? ' ic-portrait-large' : ''}">
    <defs><pattern id="ic-grain-${i}-${large}" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0h1" stroke="#e2edf1" opacity=".1"/></pattern></defs>
    <rect width="100" height="120" fill="#132734"/><path d="M-10 110L112 0M-10 136L116 26" stroke="#2a4553"/>
    <path d="M7 120L15 94L38 83H64L86 96L95 120" fill="#435563"/>
    <path d="M39 74L37 89L50 101L64 88L60 74" fill="${skin}"/>
    <path d="M30 38Q49 21 70 39L69 67L61 81L48 86L35 76L29 61Z" fill="${skin}"/>
    <path d="M50 39L68 42L67 67L59 78L48 82L56 65Z" fill="#796c68" opacity=".35"/>
    <path d="${hair}" fill="${i === 3 ? '#bcbfbb' : i === 4 ? '#757d7a' : '#26353e'}"/>
    <path d="M35 50l10-1M55 49l10 2" stroke="#3b4548" stroke-width="2"/>
    <path d="M37 54h5M57 54h5M49 56l-3 9h7M43 73l13-1" fill="none" stroke="#4d4b48" stroke-width="1.5"/>
    ${i === 2 ? '<path d="M31 50h16v10H31zm22 0h16v10H53zm-6 4h6" fill="none" stroke="#9fc9d0"/>' : ''}
    ${i === 0 ? '<path d="M60 58l3 9" stroke="#e2cec0"/>' : ''}
    ${i === 3 ? '<path d="M34 63l7 2M58 64l8-3M41 78l16-1" stroke="#856e62"/>' : ''}
    <path d="M16 95L34 88L49 104L63 88L83 96L75 120H25Z" fill="#263945"/>
    <path d="M22 98l13-4 5 15H23M68 95l10 4-3 10H64" fill="${accent}"/>
    <path d="M49 104v16" stroke="#7f929b"/><rect x="63" y="112" width="13" height="3" fill="#d3d8d3"/>
    <rect width="100" height="120" fill="url(#ic-grain-${i}-${large})"/>
    <path d="M5 5h13M5 5v13M95 115H82M95 115v-13" stroke="${accent}" fill="none"/>
  </svg>`;
}
