import type { Structure, Vector3 } from './schema';

export interface Study { id: string; name: string; description: string; model: Structure; note: string }
function empty(name: string): Structure {
  return {
    name, nodes: [], members: [], activeCase: 'gravity',
    sections: [
      { id: 'rod60', name: 'Round A', area: Math.PI * 0.06 ** 2 / 4 },
      { id: 'rod40', name: 'Round B', area: Math.PI * 0.04 ** 2 / 4 },
      { id: 'rod80', name: 'Round C', area: Math.PI * 0.08 ** 2 / 4 },
    ],
    materials: [
      { id: 'steel', name: 'Steel', elasticModulus: 200e9, density: 7850 },
      { id: 'aluminium', name: 'Aluminium', elasticModulus: 69e9, density: 2700 },
    ],
    loadCases: [],
  };
}
function node(m: Structure, position: Vector3, fixed = false): string {
  const id = `N${String(m.nodes.length + 1).padStart(2, '0')}`;
  m.nodes.push({ id, position, restraints: [fixed, fixed, fixed] });
  return id;
}
function bar(m: Structure, a: string, b: string): void {
  if (m.members.some((member) => (member.a === a && member.b === b) || (member.a === b && member.b === a))) return;
  m.members.push({ id: `M${String(m.members.length + 1).padStart(2, '0')}`, a, b, section: 'rod60', material: 'steel' });
}
function loads(m: Structure, loaded: string[], force: number): void {
  m.loadCases = [
    { id: 'gravity', name: '01 / Downward', selfWeight: true, loads: loaded.map((id) => ({ node: id, force: [0, -force, 0] })) },
    { id: 'lateral', name: '02 / Crosswind', selfWeight: true, loads: loaded.map((id) => ({ node: id, force: [force * 0.65, -force * 0.25, force * 0.3] })) },
    { id: 'asymmetric', name: '03 / Eccentric', selfWeight: false, loads: [{ node: loaded[0], force: [force * 0.4, -force * 2, -force * 0.6] }] },
  ];
}
function canopy(): Structure {
  const m = empty('Aster / space canopy');
  const bottom: string[][] = [];
  for (let x = 0; x < 4; x++) {
    bottom[x] = [];
    for (let z = 0; z < 3; z++) bottom[x][z] = node(m, [-6 + x * 4, 3.2, -4 + z * 4]);
  }
  const top: string[][] = [];
  for (let x = 0; x < 3; x++) {
    top[x] = [];
    for (let z = 0; z < 2; z++) top[x][z] = node(m, [-4 + x * 4, 5.2, -2 + z * 4]);
  }
  for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
    if (x < 3) bar(m, bottom[x][z], bottom[x + 1][z]);
    if (z < 2) bar(m, bottom[x][z], bottom[x][z + 1]);
  }
  for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) {
    if (x < 2) bar(m, top[x][z], top[x + 1][z]);
    if (z < 1) bar(m, top[x][z], top[x][z + 1]);
    for (const dx of [0, 1]) for (const dz of [0, 1]) bar(m, top[x][z], bottom[x + dx][z + dz]);
  }
  for (const [x, z] of [[0, 0], [0, 2], [3, 0], [3, 2]]) {
    const foot = node(m, [-5.5 + (x / 3) * 11, 0, -3.5 + (z / 2) * 7], true);
    bar(m, foot, bottom[x][z]);
    bar(m, foot, bottom[x === 0 ? 1 : 2][z]);
    bar(m, foot, bottom[x][1]);
  }
  loads(m, top.flat(), 9000);
  return m;
}
function tower(): Structure {
  const m = empty('Signal / braced tower');
  const rings: string[][] = [];
  for (let level = 0; level < 4; level++) {
    const r = 1.8 - level * 0.22;
    rings[level] = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([x, z]) => node(m, [x, level * 3, z], level === 0));
    for (let j = 0; j < 4; j++) bar(m, rings[level][j], rings[level][(j + 1) % 4]);
    bar(m, rings[level][0], rings[level][2]);
    if (level) for (let j = 0; j < 4; j++) {
      bar(m, rings[level - 1][j], rings[level][j]);
      bar(m, rings[level - 1][j], rings[level][(j + 1) % 4]);
      bar(m, rings[level - 1][(j + 1) % 4], rings[level][j]);
    }
  }
  loads(m, rings[3], 14000);
  return m;
}
function cantilever(): Structure {
  const m = empty('Reach / triangular cantilever');
  const rings: string[][] = [];
  for (let i = 0; i < 5; i++) {
    rings[i] = [[1, -1.3], [1, 1.3], [3.2, 0]].map(([y, z]) => node(m, [-5 + i * 2.5, y, z], i === 0));
    for (let j = 0; j < 3; j++) bar(m, rings[i][j], rings[i][(j + 1) % 3]);
    if (i) for (let j = 0; j < 3; j++) {
      bar(m, rings[i - 1][j], rings[i][j]);
      bar(m, rings[i - 1][j], rings[i][(j + 1) % 3]);
    }
  }
  loads(m, rings[4], 8000);
  return m;
}
function mechanism(): Structure {
  const m = empty('One brace away / tripod');
  const a = node(m, [-3, 0, -2], true);
  const b = node(m, [3, 0, -2], true);
  node(m, [0, 0, 3], true);
  const top = node(m, [0, 3.5, 0]);
  bar(m, a, top);
  bar(m, b, top);
  loads(m, [top], 12000);
  return m;
}
export const STUDIES: Study[] = [
  { id: 'canopy', name: 'Aster canopy', description: 'A double-layer roof on four branching supports.', model: canopy(), note: 'Follow the roof load through its pyramidal cells into four restrained feet.' },
  { id: 'tower', name: 'Signal tower', description: 'A tapered, cross-braced three-storey mast.', model: tower(), note: 'Compare downward and crosswind loads. The same diagonals can change sign.' },
  { id: 'cantilever', name: 'Reach cantilever', description: 'A triangular space truss projecting ten metres.', model: cantilever(), note: 'The three restrained root nodes carry the eccentric load. No beam elements are used.' },
  { id: 'mechanism', name: 'One brace away', description: 'An intentionally under-braced spatial tripod.', model: mechanism(), note: 'Connect N03 to N04. The third non-coplanar leg removes the mechanism; adding area to the other legs cannot.' },
];
