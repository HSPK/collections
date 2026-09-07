import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GRAVITY, LIMITS, cloneModel, currentCase, dot, length, parseModel } from '../../src/projects/loadpath/schema';
import type { Structure, Vector3 } from '../../src/projects/loadpath/schema';
import { analyze, assemble } from '../../src/projects/loadpath/solver';
import type { Solved } from '../../src/projects/loadpath/solver';
import { STUDIES } from '../../src/projects/loadpath/presets';
import { History, deserialize, resultsCSV, serialize } from '../../src/projects/loadpath/document';
import { displaced, extrema, forceColor, memberValue, structuralSVG } from '../../src/projects/loadpath/diagrams';

function solved(model: Structure): Solved {
  const result = analyze(model);
  expect(result.status, result.message).toBe('stable');
  if (result.status !== 'stable') throw new Error(result.message);
  return result;
}
function axial(): Structure {
  return {
    name: 'Two-metre axial specimen',
    nodes: [
      { id: 'A', position: [0, 0, 0], restraints: [true, true, true] },
      { id: 'B', position: [2, 0, 0], restraints: [false, true, true] },
    ],
    members: [{ id: 'AB', a: 'A', b: 'B', section: 'round', material: 'steel' }],
    sections: [{ id: 'round', name: 'Solid round', area: 0.001 }],
    materials: [{ id: 'steel', name: 'Steel', elasticModulus: 200e9, density: 7850 }],
    loadCases: [{ id: 'pull', name: 'Axial pull', loads: [{ node: 'B', force: [20000, 4000, -6000] }], selfWeight: false }],
    activeCase: 'pull',
  };
}
function tripod(): Structure {
  const m = axial();
  m.nodes = [
    { id: 'A', position: [-2, 0, -2], restraints: [true, true, true] },
    { id: 'B', position: [2, 0, -2], restraints: [true, true, true] },
    { id: 'C', position: [0, 0, 2], restraints: [true, true, true] },
    { id: 'D', position: [0, 3, 0], restraints: [false, false, false] },
  ];
  m.members = ['A', 'B', 'C'].map((a) => ({ id: `${a}D`, a, b: 'D', section: 'round', material: 'steel' }));
  m.loadCases[0].loads = [{ node: 'D', force: [0, -10000, 0] }];
  return m;
}
function denseModel(): Structure {
  const id = (prefix: string, index: number): string => `${prefix}${String(index).padStart(31, '0')}`;
  const model: Structure = {
    name: 'Dense reopenable spatial study',
    nodes: [
      { id: id('N', 0), position: [0, 0, 0], restraints: [true, true, true] },
      { id: id('N', 1), position: [4, 0, 0], restraints: [true, true, true] },
      { id: id('N', 2), position: [0, 0, 4], restraints: [true, true, true] },
    ],
    members: [],
    sections: [{ id: id('S', 0), name: 'Solid circular section', area: 0.0025 }],
    materials: [{ id: id('E', 0), name: 'Linear steel', elasticModulus: 200e9, density: 7850 }],
    loadCases: [],
    activeCase: id('C', 0),
  };
  for (let i = 0; i < 57; i++) {
    model.nodes.push({
      id: id('N', i + 3),
      position: [0.5 + (i % 8) * 0.5, 2 + Math.floor(i / 8) * 0.25, 0.5 + Math.floor(i / 8) * 0.5],
      restraints: [false, false, false],
    });
  }
  const connect = (a: number, b: number): void => {
    model.members.push({ id: id('M', model.members.length), a: model.nodes[a].id, b: model.nodes[b].id, section: model.sections[0].id, material: model.materials[0].id });
  };
  // Three independent legs to restrained, non-collinear anchors stabilize every free joint.
  for (let i = 3; i < model.nodes.length; i++) for (let base = 0; base < 3; base++) connect(i, base);
  for (let gap = 1; model.members.length < 240; gap++) {
    for (let i = 3; i + gap < model.nodes.length && model.members.length < 240; i++) connect(i, i + gap);
  }
  model.loadCases = Array.from({ length: 8 }, (_, c): Structure['loadCases'][number] => ({
    id: id('C', c),
    name: `Fully populated spatial case ${c + 1}`,
    selfWeight: c % 2 === 0,
    loads: model.nodes.map((node, i) => ({
      node: node.id,
      force: [1000 + i * 11.2345678901234 + c * 10, -(c + 1) * 2000.1234567890123, Math.sin(i + c) * 1234.123456789012],
    })),
  }));
  return model;
}
test.describe('LOADPATH numerical model', () => {
  test('closed-form axial stiffness, displacement, force, stress, mass and reactions', () => {
    const model = axial();
    const a = assemble(model);
    expect(a.size).toBe(6);
    expect(a.stiffness[0]).toBe(100e6);
    expect(a.stiffness[3]).toBe(-100e6);
    expect(a.stiffness[3 * 6 + 3]).toBe(100e6);
    const r = solved(model);
    expect(r.nodes[1].displacement).toEqual([0.0002, 0, 0]);
    expect(r.nodes[0].reaction[0]).toBeCloseTo(-20000, 8);
    expect(r.nodes[1].reaction[1]).toBe(-4000);
    expect(r.nodes[1].reaction[2]).toBe(6000);
    expect(r.members[0].force).toBeCloseTo(20000, 8);
    expect(r.members[0].stress).toBeCloseTo(20e6, 6);
    expect(r.members[0].extension).toBeCloseTo(0.0002, 12);
    expect(r.members[0].energy).toBeCloseTo(2, 10);
    expect(r.mass).toBeCloseTo(15.7, 10);
    expect(r.externalWork).toBeCloseTo(2 * r.energy, 10);
    expect(length(r.balance)).toBeLessThan(1e-8);
    expect(length(r.momentBalance)).toBeLessThan(1e-8);
  });

  test('serial bars give sum(FL/EA), compression sign and documented circular Euler load', () => {
    const m = axial();
    m.nodes.push({ id: 'C', position: [5, 0, 0], restraints: [false, true, true] });
    m.members.push({ id: 'BC', a: 'B', b: 'C', section: 'round', material: 'steel' });
    currentCase(m).loads = [{ node: 'C', force: [-20000, 0, 0] }];
    const r = solved(m);
    expect(r.nodes[2].displacement[0]).toBeCloseTo(-20000 * 5 / (200e9 * 0.001), 12);
    for (const bar of r.members) {
      expect(bar.force).toBeCloseTo(-20000, 8);
      const I = 0.001 ** 2 / (4 * Math.PI);
      expect(bar.eulerLoad).toBeCloseTo(Math.PI ** 2 * 200e9 * I / bar.length ** 2, 5);
      expect(bar.eulerRatio).toBeCloseTo(20000 / bar.eulerLoad, 10);
    }
  });

  test('three stable spatial studies solve all distinct load cases, equilibrium and energy', () => {
    for (const study of STUDIES.slice(0, 3)) {
      const signatures: number[] = [];
      for (const c of study.model.loadCases) {
        const model = cloneModel(study.model);
        model.activeCase = c.id;
        const r = solved(model);
        expect(r.freeDofs).toBeGreaterThan(25);
        expect(length(r.balance)).toBeLessThan(1e-6);
        expect(length(r.momentBalance)).toBeLessThan(1e-5);
        expect(r.freeResidual).toBeLessThan(1e-6);
        expect(r.relativeResidual).toBeLessThan(1e-12);
        expect(r.energy).toBeGreaterThan(0);
        expect(r.externalWork).toBeCloseTo(2 * r.energy, 7);
        expect(r.members.reduce((sum, m) => sum + m.mass, 0)).toBeCloseTo(r.mass, 8);
        expect(r.nodes.every((node) => node.displacement.every(Number.isFinite))).toBe(true);
        signatures.push(r.maxDisplacement);
      }
      expect(new Set(signatures).size).toBe(3);
    }
  });

  test('symmetric tripod has mirrored forces and displacements', () => {
    const r = solved(tripod());
    expect(r.nodes[3].displacement[0]).toBeCloseTo(0, 14);
    expect(r.members[0].force).toBeCloseTo(r.members[1].force, 8);
    expect(r.nodes[0].reaction[0]).toBeCloseTo(-r.nodes[1].reaction[0], 8);
    expect(r.nodes[0].reaction[1]).toBeCloseTo(r.nodes[1].reaction[1], 8);
    expect(r.members.every((m) => m.force < 0)).toBe(true);
  });

  test('arbitrary rigid rotation preserves energy and rotates every force and displacement', () => {
    const original = tripod();
    currentCase(original).loads[0].force = [2300, -17000, 4300];
    const before = solved(original);
    const rotate = (v: Vector3): Vector3 => {
      const c = Math.cos(0.63), s = Math.sin(0.63), d = Math.cos(0.41), t = Math.sin(0.41);
      const x = c * v[0] - s * v[1], y = s * v[0] + c * v[1];
      return [d * x + t * v[2], y, -t * x + d * v[2]];
    };
    const rotated = cloneModel(original);
    rotated.nodes.forEach((n) => { n.position = rotate(n.position); });
    currentCase(rotated).loads.forEach((l) => { l.force = rotate(l.force); });
    const after = solved(rotated);
    expect(after.energy).toBeCloseTo(before.energy, 10);
    before.members.forEach((m, i) => expect(after.members[i].force).toBeCloseTo(m.force, 7));
    for (let i = 0; i < before.nodes.length; i++) {
      const u = rotate(before.nodes[i].displacement), r = rotate(before.nodes[i].reaction);
      for (let axis = 0; axis < 3; axis++) {
        expect(after.nodes[i].displacement[axis]).toBeCloseTo(u[axis], 12);
        expect(after.nodes[i].reaction[axis]).toBeCloseTo(r[axis], 7);
      }
    }
  });

  test('assembled outer product reproduces axial strain energy for arbitrary nodal vectors', () => {
    const m = tripod();
    const { stiffness: k, size: n } = assemble(m);
    const u = m.nodes.flatMap((_, i) => [0.0001 * Math.sin(i + 1), -0.0002 * Math.cos(i), 0.0003 * Math.sin(i)]);
    let quadratic = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      expect(k[i * n + j]).toBeCloseTo(k[j * n + i], 8);
      quadratic += 0.5 * u[i] * k[i * n + j] * u[j];
    }
    const energy = m.members.reduce((sum, bar) => {
      const a = m.nodes.findIndex((node) => node.id === bar.a), b = m.nodes.findIndex((node) => node.id === bar.b);
      const delta: Vector3 = [m.nodes[b].position[0] - m.nodes[a].position[0], m.nodes[b].position[1] - m.nodes[a].position[1], m.nodes[b].position[2] - m.nodes[a].position[2]];
      const du: Vector3 = [u[b * 3] - u[a * 3], u[b * 3 + 1] - u[a * 3 + 1], u[b * 3 + 2] - u[a * 3 + 2]];
      return sum + 0.5 * 200e9 * 0.001 / length(delta) * (dot(delta, du) / length(delta)) ** 2;
    }, 0);
    expect(quadratic).toBeCloseTo(energy, 10);
  });

  test('true mechanisms stay unavailable even unloaded; the missing spatial brace restores stiffness', () => {
    const m = cloneModel(STUDIES[3].model);
    expect(analyze(m).status).toBe('unstable');
    currentCase(m).loads = [];
    currentCase(m).selfWeight = false;
    expect(analyze(m).status).toBe('unstable');
    m.members.push({ id: 'M03', a: 'N03', b: 'N04', section: 'rod60', material: 'steel' });
    const r = solved(m);
    expect(r.maxDisplacement).toBe(0);
    const free = axial();
    free.nodes[1].restraints[1] = false;
    expect(analyze(free).status).toBe('unstable');
    free.nodes.forEach((n) => { n.restraints = [false, false, false]; });
    expect(analyze(free).status).toBe('unstable');
  });

  test('almost coplanar bracing is rejected instead of unchecked near-singular division', () => {
    const m = tripod();
    m.nodes[2].position = [0, 0, -2 + 1e-7];
    const r = analyze(m);
    expect(['unstable', 'ill-conditioned']).toContain(r.status);
    expect('nodes' in r).toBe(false);
    expect(r.message).toMatch(/pivot|stiffness/i);
  });

  test('invalid duplicates, zero-length, missing references and finite bounds never reach the solver', () => {
    const cases: Structure[] = [];
    let m = axial(); m.members.push({ ...m.members[0], id: 'duplicate', a: 'B', b: 'A' }); cases.push(m);
    m = axial(); m.nodes[1].position = [0, 0, 0]; cases.push(m);
    m = axial(); m.nodes[1].position[0] = 0.009; cases.push(m);
    m = axial(); m.members[0].a = 'missing'; cases.push(m);
    m = axial(); m.sections[0].area = 0; cases.push(m);
    m = axial(); m.materials[0].elasticModulus = Infinity; cases.push(m);
    m = axial(); m.nodes[0].position[0] = LIMITS.coordinate + 1; cases.push(m);
    m = axial(); currentCase(m).loads[0].force[0] = NaN; cases.push(m);
    m = axial(); m.nodes = Array.from({ length: LIMITS.nodes + 1 }, (_, i) => ({ ...m.nodes[0], id: `N${i}` })); cases.push(m);
    for (const invalid of cases) {
      expect(() => parseModel(invalid)).toThrow();
      const result = analyze(invalid);
      expect(result.status).toBe('invalid');
      expect('nodes' in result).toBe(false);
    }
  });

  test('self-weight is real rho*A*L*g, half lumped to each end, always gravity minus Y', () => {
    const m = axial();
    currentCase(m).loads = [];
    currentCase(m).selfWeight = true;
    const r = solved(m);
    expect(r.weight).toBeCloseTo(15.7 * GRAVITY, 10);
    expect(r.applied[0]).toBe(0);
    expect(r.applied[1]).toBeCloseTo(-15.7 * GRAVITY, 10);
    expect(r.applied[2]).toBe(0);
    for (const node of r.nodes) {
      expect(node.applied[1]).toBeCloseTo(-r.weight / 2, 10);
      expect(node.reaction[1]).toBeCloseTo(r.weight / 2, 10);
    }
    expect(r.nodes[1].displacement[0]).toBe(0);
    m.materials[0].density *= 2;
    expect(solved(m).weight).toBeCloseTo(r.weight * 2, 10);
    currentCase(m).selfWeight = false;
    expect(solved(m).weight).toBe(0);
  });

  test('section, modulus, geometry and load edits change the actual stiffness solution', () => {
    const m = axial(), r = solved(m);
    m.sections[0].area *= 2;
    expect(solved(m).maxDisplacement).toBeCloseTo(r.maxDisplacement / 2, 12);
    m.materials[0].elasticModulus /= 2;
    expect(solved(m).maxDisplacement).toBeCloseTo(r.maxDisplacement, 12);
    m.nodes[1].position[0] *= 2;
    expect(solved(m).maxDisplacement).toBeCloseTo(r.maxDisplacement * 2, 12);
    currentCase(m).loads[0].force[0] *= 3;
    expect(solved(m).maxDisplacement).toBeCloseTo(r.maxDisplacement * 6, 12);
    m.nodes[1].restraints[0] = true;
    expect(solved(m).nodes[1].reaction[0]).toBe(-60000);
    expect(solved(m).minScaledPivot).toBeNull();
  });

  test('versioned interchange, bounded history and CSV preserve data and reject bad imports atomically', () => {
    const m = tripod();
    expect(deserialize(serialize(m))).toEqual(m);
    const h = new History(m);
    const edit = h.model;
    edit.sections[0].area *= 2;
    h.commit(edit);
    expect(h.model.sections[0].area).toBe(0.002);
    h.undo(); expect(h.model).toEqual(m);
    h.redo(); expect(h.model).toEqual(edit);
    for (const text of ['{', serialize(m).replace('"version": 1', '"version": 2'), serialize(m).replace('"SI"', '"mm"'), 'x'.repeat(150001)]) {
      expect(() => h.commit(deserialize(text))).toThrow();
      expect(h.model).toEqual(edit);
    }
    const csv = resultsCSV(m, solved(m));
    expect(csv).toContain('"force_N_tension_positive"');
    expect(csv).toContain('"moment_balance_Nm_about_origin"');
    expect(csv).toContain(`"${solved(m).members[0].force}"`);
    expect(() => resultsCSV(STUDIES[3].model, analyze(STUDIES[3].model))).toThrow(/unavailable/);
  });

  test('history snapshots atomically carry cloned reset origins through edits, imports and rejected commits', () => {
    const first = axial(), original = cloneModel(first);
    const initialOrigin = { baseline: first, presetId: 'authored' };
    const h = new History(first, initialOrigin);
    first.sections[0].area = 0.007;
    expect(h.model).toEqual(original);
    expect(h.origin.baseline).toEqual(original);
    const exposed = h.origin;
    exposed.baseline.nodes[0].position[0] = 25;
    exposed.presetId = null;
    expect(h.origin).toEqual({ baseline: original, presetId: 'authored' });
    const edited = h.model;
    edited.sections[0].area = 0.002;
    h.commit(edited);
    expect(h.origin).toEqual({ baseline: original, presetId: 'authored' });
    const imported = cloneModel(edited);
    imported.sections[0].area = 0.004;
    h.commit(imported, { baseline: imported, presetId: null });
    expect(h.origin.baseline).toEqual(imported);
    h.undo();
    expect(h.model).toEqual(edited);
    expect(h.origin).toEqual({ baseline: original, presetId: 'authored' });
    h.redo();
    expect(h.model).toEqual(imported);
    expect(h.origin).toEqual({ baseline: imported, presetId: null });
    const badBaseline = cloneModel(original);
    badBaseline.sections[0].area = 0;
    expect(() => h.commit(edited, { baseline: badBaseline, presetId: null })).toThrow();
    expect(() => h.commit(edited, { baseline: original, presetId: '' })).toThrow();
    expect(h.model).toEqual(imported);
    expect(h.origin).toEqual({ baseline: imported, presetId: null });
    h.undo();
    expect(h.model).toEqual(edited);
    expect(h.origin.baseline).toEqual(original);
  });

  test('origin-only history changes are distinct even when working models and display names are identical', () => {
    const first = axial(), second = cloneModel(first);
    second.sections[0].area = 0.002;
    const h = new History(first);
    h.commit(second);
    h.commit(second, { baseline: second, presetId: null });
    expect(h.model).toEqual(second);
    h.undo();
    expect(h.model).toEqual(second);
    expect(h.origin.baseline).toEqual(first);
    h.undo();
    expect(h.model).toEqual(first);
    expect(h.canUndo).toBe(false);
    h.redo(); h.redo();
    expect(h.origin.baseline).toEqual(second);
    h.commit(second, h.origin);
    h.undo();
    expect(h.model).toEqual(second);
    expect(h.origin.baseline).toEqual(first);
    h.commit(second, { baseline: first, presetId: 'authored' });
    expect(h.origin.presetId).toBe('authored');
    h.undo();
    expect(h.origin).toEqual({ baseline: first, presetId: null });
  });

  test('bounded history retains the original reset baseline after its initial model snapshot ages out', () => {
    const original = axial(), h = new History(original);
    for (let i = 1; i <= LIMITS.history + 5; i++) {
      const next = h.model;
      next.sections[0].area = original.sections[0].area + i * 0.000001;
      h.commit(next);
    }
    expect(h.origin.baseline).toEqual(original);
    let steps = 0;
    while (h.canUndo) { h.undo(); steps++; }
    expect(steps).toBe(LIMITS.history);
    expect(h.model).not.toEqual(original);
    expect(h.origin.baseline).toEqual(original);
    h.commit(h.origin.baseline);
    expect(h.model).toEqual(original);
  });

  test('dense valid 60-node 240-member 8-case JSON exports compactly and reopens within the byte budget', () => {
    const model = denseModel();
    expect(model.nodes).toHaveLength(60);
    expect(model.members).toHaveLength(240);
    expect(model.loadCases).toHaveLength(8);
    expect(model.loadCases.every((loadCase) => loadCase.loads.length === 60)).toBe(true);
    expect([...model.nodes, ...model.members, ...model.loadCases, ...model.sections, ...model.materials].every((item) => item.id.length === 32)).toBe(true);
    const envelope = { format: 'loadpath', version: 1, units: 'SI', model };
    const incoming = JSON.stringify(envelope);
    expect(Buffer.byteLength(incoming, 'utf8')).toBeLessThanOrEqual(LIMITS.importBytes);
    expect(Buffer.byteLength(JSON.stringify(envelope, null, 2), 'utf8')).toBeGreaterThan(LIMITS.importBytes);
    const accepted = deserialize(incoming);
    const result = solved(accepted);
    expect(result.freeDofs).toBe(171);
    expect(result.maxDisplacement).toBeGreaterThan(0);
    expect(length(result.balance)).toBeLessThan(1e-6);
    const exported = serialize(accepted);
    expect(Buffer.byteLength(exported, 'utf8')).toBeLessThanOrEqual(LIMITS.importBytes);
    expect(exported).not.toContain('\n');
    expect(deserialize(exported)).toEqual(accepted);
    expect(solved(deserialize(exported)).energy).toBeCloseTo(result.energy, 8);
    expect(serialize(axial())).toContain('\n  "format": "loadpath"');
    const unicode = axial();
    unicode.name = '\u03c0'.repeat(80);
    const unicodeJSON = serialize(unicode);
    const atLimit = unicodeJSON + ' '.repeat(LIMITS.importBytes - Buffer.byteLength(unicodeJSON, 'utf8'));
    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(LIMITS.importBytes);
    expect(deserialize(atLimit)).toEqual(unicode);
    expect(atLimit.length).toBeLessThan(LIMITS.importBytes);
    expect(() => deserialize(`${atLimit} `)).toThrow(/150 kB/);
  });

  test('CSV physical rows use result IDs and remain invariant when model or result arrays are permuted', () => {
    const model = cloneModel(STUDIES[1].model);
    const result = solved(model);
    const original = resultsCSV(model, result);
    const reordered = cloneModel(model);
    reordered.nodes.reverse();
    reordered.members.reverse();
    expect(resultsCSV(reordered, result)).toBe(original);
    const member = model.members[0], node = model.nodes[0];
    expect(original).toContain(`"${member.id}","${member.a}","${member.b}","${member.section}","${member.material}",`);
    expect(original).toContain(`"${node.id}",${[...node.position, ...node.restraints.map(Number)].map((n) => `"${n}"`).join(',')},`);
    const physicalRows = (csv: string) => csv.split('\r\n').filter((row) => /^"[MN]\d+",/.test(row)).sort();
    const reversedResults = { ...result, nodes: [...result.nodes].reverse(), members: [...result.members].reverse() };
    expect(physicalRows(resultsCSV(reordered, reversedResults))).toEqual(physicalRows(original));
  });

  test('SVG member geometry, force and stress associations are invariant under independent array permutations', () => {
    const model = cloneModel(STUDIES[1].model);
    model.activeCase = model.loadCases[2].id;
    const result = solved(model);
    expect(result.maxDisplacement).toBeGreaterThan(0);
    const reordered = cloneModel(model);
    reordered.members.reverse();
    reordered.nodes.reverse();
    const reversedResults = { ...result, nodes: [...result.nodes].reverse(), members: [...result.members].reverse() };
    const drawings = (svg: string): [string, string][] => Array.from(
      svg.matchAll(/<g data-lp-member="([^"]+)">([\s\S]*?)<\/g>/g),
      (match): [string, string] => [match[1], match[2]],
    ).sort(([a], [b]) => a.localeCompare(b));
    for (const color of ['force', 'stress'] as const) for (const deformed of [false, true]) {
      const options = { color, deformed, amplification: 400 };
      const original = drawings(structuralSVG(model, result, options));
      expect(original).toHaveLength(model.members.length);
      const [min, max] = extrema(result, color);
      for (const member of result.members) {
        const shape = original.find(([id]) => id === member.id)?.[1];
        expect(shape).toContain(`stroke="${forceColor(memberValue(member, color), Math.max(-min, max))}"`);
      }
      expect(drawings(structuralSVG(reordered, result, options))).toEqual(original);
      expect(drawings(structuralSVG(model, reversedResults, options))).toEqual(original);
      expect(drawings(structuralSVG(reordered, reversedResults, options))).toEqual(original);
    }
  });

  test('CSV and SVG reject missing, duplicate and unmatched model/result IDs instead of substituting another element', () => {
    const model = cloneModel(STUDIES[1].model), result = solved(model);
    const missingMember = cloneModel(model);
    missingMember.members.shift();
    const missingNode = cloneModel(model);
    missingNode.nodes.shift();
    const duplicate = cloneModel(model);
    duplicate.members.push({ ...duplicate.members[0] });
    const renderers: ((model: Structure, result: Solved) => string)[] = [
      resultsCSV,
      (model, result) => structuralSVG(model, result, { color: 'force', deformed: false, amplification: 400 }),
      (model, result) => structuralSVG(model, result, { color: 'stress', deformed: true, amplification: 400 }),
    ];
    for (const render of renderers) {
      expect(() => render(missingMember, result)).toThrow(/member result M01/);
      expect(() => render(missingNode, result)).toThrow(/node result N01/);
      expect(() => render(duplicate, result)).toThrow(/duplicate member IDs/);
      expect(() => render(model, { ...result, members: result.members.slice(1) })).toThrow(/missing member results/);
      expect(() => render(model, { ...result, nodes: result.nodes.slice(1) })).toThrow(/missing node results/);
      expect(() => render(model, { ...result, nodes: [result.nodes[0], ...result.nodes] })).toThrow(/duplicate node result/);
    }
  });

  test('deformed geometry shares solved endpoints, and vector exports label projection and amplification', () => {
    const m = tripod(), r = solved(m);
    const p = displaced(m.nodes[3], r, 80);
    for (let axis = 0; axis < 3; axis++) expect(p[axis]).toBeCloseTo(m.nodes[3].position[axis] + r.nodes[3].displacement[axis] * 80, 12);
    expect(displaced(m.nodes[3], r, 0)).toEqual(m.nodes[3].position);
    expect(() => displaced(m.nodes[3], { ...r, nodes: r.nodes.slice(0, 3) }, 80)).toThrow(/missing node result D/);
    const drawing = structuralSVG(m, r, { color: 'force', deformed: true, amplification: 80 });
    expect(drawing).toContain('Deformed geometry x80');
    expect(drawing).toContain('Z depth collapsed');
    expect(drawing).toContain('stroke-dasharray="5 5"');
    const unbraced = STUDIES[3].model, invalid = analyze(unbraced);
    expect(displaced(unbraced.nodes[3], invalid, 80)).toEqual(unbraced.nodes[3].position);
    expect(structuralSVG(unbraced, invalid, { color: 'stress', deformed: true, amplification: 80 })).toContain('UNAVAILABLE: unstable');
  });
});

async function openWorkbench(page: Page): Promise<void> {
  // Other projects share this dev server. Only suppress Vite HMR, not application behavior or WebGL.
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\/\?token=/, () => {});
  await page.goto('./projects/loadpath/');
  await expect(page.locator('.project-loadpath')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Collection menu', exact: true })).toBeVisible();
}
async function editNumber(page: Page, field: string, value: number): Promise<void> {
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const input = page.locator(`[data-lp-field="${field}"]`);
  await input.fill(String(value));
  await input.press('Tab');
}
async function metric(page: Page, key = 'max-displacement'): Promise<number> {
  return Number((await page.locator(`[data-lp-metric="${key}"]`).textContent())?.replaceAll(',', ''));
}
async function downloadText(page: Page, action: string): Promise<string> {
  const alreadyOpen = await page.locator('#lp-files').evaluate((element) => (element as HTMLDialogElement).open);
  if (!alreadyOpen) await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.locator(`[data-lp-action="${action}"]`).click();
  const file = await pending;
  const path = await file.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  if (!alreadyOpen) await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
  return text;
}
async function restoreTripod(page: Page): Promise<void> {
  await page.locator('[data-lp-study]').selectOption('mechanism');
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await page.locator('.lp-builder summary').click();
  await page.locator('[data-lp-connect-from]').selectOption('N03');
  await page.locator('[data-lp-connect-to]').selectOption('N04');
  await page.locator('[data-lp-action="connect"]').click();
  await expect(page.locator('.project-loadpath')).toHaveAttribute('data-analysis', 'stable');
}
async function nodePoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.locator(`[data-lp-node="${id}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - Number.parseFloat(getComputedStyle(element).marginTop) };
  });
}
test.describe('LOADPATH browser workbench', () => {
  test.setTimeout(90_000);
  const errorsByPage = new WeakMap<Page, string[]>();
  test.beforeEach(({ page }) => {
    const errors: string[] = [];
    errorsByPage.set(page, errors);
    page.on('pageerror', (error) => errors.push(error.message));
  });
  test.afterEach(({ page }) => { expect(errorsByPage.get(page)).toEqual([]); });
  test('desktop first view is a real rendered structural model with exact numerical results', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1080 });
    await openWorkbench(page);
    await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-node-count', '22');
    await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-member-count', '60');
    expect(await metric(page)).toBeCloseTo(solved(STUDIES[0].model).maxDisplacement * 1000, 3);
    await expect(page.locator('[data-lp-legend]')).toContainText('Compression');
    await expect(page.locator('[data-lp-legend]')).toContainText('Tension');
    await expect(page.locator('[data-lp-balance]')).toHaveText(/e-/);
    const screenshot = testInfo.outputPath('loadpath-desktop.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('Loadpath desktop', { path: screenshot, contentType: 'image/png' });
    console.log(`LOADPATH_DESKTOP_CAPTURE ${screenshot}`);
    await page.locator('[data-lp-deformed]').check();
    await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-amplification', '400');
    const deformed = testInfo.outputPath('loadpath-deformed.png');
    await page.locator('.lp-structure-pane').screenshot({ path: deformed });
    console.log(`LOADPATH_DEFORMED_CAPTURE ${deformed}`);
    expect(errors).toEqual([]);
  });

  test('load, section, modulus, deformation and pinned comparison affect the real design', async ({ page }, testInfo) => {
    await openWorkbench(page);
    await page.locator('[data-lp-case]').selectOption('asymmetric');
    const initial = await metric(page);
    await page.getByRole('tab', { name: 'Results', exact: true }).click();
    await page.locator('[data-lp-action="pin"]').click();
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.locator('[data-lp-select-kind="member"]').click();
    await page.locator('[data-lp-selection]').selectOption('M01');
    const area = Number(await page.locator('[data-lp-field="area"]').inputValue());
    await editNumber(page, 'area', area * 2);
    expect(await metric(page)).toBeCloseTo(initial / 2, 2);
    await expect(page.locator('[data-lp-comparison-delta]')).toContainText('Displacement change: -');
    const screenshot = testInfo.outputPath('loadpath-results-comparison.png');
    await page.getByRole('tab', { name: 'Results', exact: true }).click();
    await page.locator('.lp-results-pane').screenshot({ path: screenshot });
    console.log(`LOADPATH_RESULTS_CAPTURE ${screenshot}`);
    await editNumber(page, 'modulus', 100);
    expect(await metric(page)).toBeCloseTo(initial, 2);
    await page.getByRole('tab', { name: 'Structure', exact: true }).click();
    await page.locator('[data-lp-deformed]').check();
    await page.locator('[data-lp-amplification]').fill('150');
    await page.locator('[data-lp-amplification]').press('Tab');
    await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-amplification', '150');
    expect(await metric(page)).toBeCloseTo(initial, 2);
    await page.locator('[data-lp-color]').selectOption('stress');
    await expect(page.locator('[data-lp-legend]')).toContainText('MPa');
    await page.locator('[data-lp-reactions]').check();
    await page.getByRole('tab', { name: 'Results', exact: true }).click();
    await page.locator('[data-lp-action="restore-pin"]').click();
    expect(Number(await page.locator('[data-lp-field="area"]').inputValue())).toBeCloseTo(area, 4);
    await page.locator('[data-lp-case]').selectOption('lateral');
    expect(await metric(page)).not.toBe(initial);
    const withWeight = await metric(page, 'energy');
    await page.locator('[data-lp-weight]').uncheck();
    expect(await metric(page, 'energy')).not.toBe(withWeight);
  });

  test('stable to mechanism to restored uses actual brace edits, unavailable fields, undo and redo', async ({ page }) => {
    await openWorkbench(page);
    await page.locator('[data-lp-study]').selectOption('mechanism');
    const root = page.locator('.project-loadpath');
    await expect(root).toHaveAttribute('data-analysis', 'unstable');
    await expect(page.locator('[data-lp-metric="max-displacement"]')).toHaveText('—');
    await expect(page.locator('[data-lp-action="export-csv"]')).toBeDisabled();
    await expect(page.locator('[data-lp-invalid]')).toContainText(/mechanism|stiffness/);
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.locator('.lp-builder summary').click();
    await page.locator('[data-lp-connect-from]').selectOption('N03');
    await page.locator('[data-lp-connect-to]').selectOption('N04');
    await page.locator('[data-lp-action="connect"]').click();
    await expect(root).toHaveAttribute('data-analysis', 'stable');
    expect(await metric(page)).toBeGreaterThan(0);
    await expect(root).toHaveAttribute('data-selected', 'member:M03');
    await page.locator('[data-lp-action="remove-member"]').click();
    await expect(root).toHaveAttribute('data-analysis', 'unstable');
    await page.locator('[data-lp-action="undo"]').click();
    await expect(root).toHaveAttribute('data-analysis', 'stable');
    await page.locator('[data-lp-action="redo"]').click();
    await expect(root).toHaveAttribute('data-analysis', 'unstable');
    await page.locator('[data-lp-action="undo"]').click();
    await page.locator('[data-lp-action="reset"]').click();
    await expect(root).toHaveAttribute('data-analysis', 'unstable');
  });

  test('constructing and moving joints, editing 3D loads and explicit support releases recompute', async ({ page }) => {
    await openWorkbench(page);
    await restoreTripod(page);
    await editNumber(page, 'new-0', 1);
    await editNumber(page, 'new-1', 4);
    await editNumber(page, 'new-2', 1);
    await page.locator('[data-lp-action="add-node"]').click();
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-analysis', 'unstable');
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-selected', 'node:N05');
    for (const to of ['N01', 'N02', 'N03']) {
      await page.locator('[data-lp-connect-from]').selectOption('N05');
      await page.locator('[data-lp-connect-to]').selectOption(to);
      await page.locator('[data-lp-action="connect"]').click();
    }
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-analysis', 'stable');
    await page.locator('[data-lp-select-kind="node"]').click();
    await page.locator('[data-lp-selection]').selectOption('N05');
    await editNumber(page, 'load-0', 5);
    await editNumber(page, 'load-1', -20);
    await editNumber(page, 'load-2', 7);
    const before = await metric(page);
    await editNumber(page, 'position-1', 4.8);
    expect(await metric(page)).not.toBe(before);
    await page.locator('[data-lp-restraint="1"]').check();
    const afterSupport = await metric(page);
    await page.locator('[data-lp-action="undo"]').click();
    expect(await metric(page)).not.toBe(afterSupport);
    const exported = deserialize(await downloadText(page, 'export-json'));
    expect(exported.nodes).toHaveLength(5);
    expect(exported.members).toHaveLength(6);
    expect(exported.nodes.find((n) => n.id === 'N05')?.position).toEqual([1, 4.8, 1]);
    expect(currentCase(exported).loads.find((load) => load.node === 'N05')?.force).toEqual([5000, -20000, 7000]);
    await page.locator('[data-lp-selection]').selectOption('N01');
    await page.locator('[data-lp-restraint="0"]').uncheck();
    await page.locator('[data-lp-restraint="1"]').uncheck();
    await page.locator('[data-lp-restraint="2"]').uncheck();
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-analysis', 'unstable');
    await expect(page.locator('[data-lp-node-displacement]')).toHaveText('Unavailable');
  });

  test('JSON, CSV and diagram exports round-trip, while rejected imports preserve all current data', async ({ page }) => {
    await openWorkbench(page);
    await restoreTripod(page);
    await page.locator('[data-lp-case]').selectOption('asymmetric');
    const json = await downloadText(page, 'export-json');
    const saved = deserialize(json);
    const expected = solved(saved);
    const csv = await downloadText(page, 'export-csv');
    expect(csv).toContain(`"${expected.members[2].force}"`);
    expect(csv).toContain('"K_u_minus_F_Y_N"');
    await page.getByRole('tab', { name: 'Structure', exact: true }).click();
    await page.locator('[data-lp-deformed]').check();
    const svg = await downloadText(page, 'export-svg');
    expect(svg).toContain('Deformed geometry x400');
    expect(svg).toContain('N04');
    expect(svg).toContain('Z depth collapsed');
    await page.locator('[data-lp-study]').selectOption('tower');
    await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
    await page.locator('[data-lp-import]').setInputFiles({ name: 'design.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await expect(page.locator('[data-lp-status]')).toContainText('JSON model imported');
    expect(await metric(page)).toBeCloseTo(expected.maxDisplacement * 1000, 3);
    const revision = await page.locator('.project-loadpath').getAttribute('data-revision');
    await page.locator('.lp-paste summary').click();
    for (const source of ['{', json.replace('"version": 1', '"version": 4'), json.replace('"area":', '"area": -1, "ignored":')]) {
      await page.locator('[data-lp-import-text]').fill(source);
      await page.locator('[data-lp-action="import-text"]').click();
      await expect(page.locator('[data-lp-status]')).toContainText('Import rejected');
      await expect(page.locator('.project-loadpath')).toHaveAttribute('data-revision', revision!);
      expect(await metric(page)).toBeCloseTo(expected.maxDisplacement * 1000, 3);
    }
    expect(deserialize(await downloadText(page, 'export-json'))).toEqual(saved);
    await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
    await page.locator('[data-lp-action="undo"]').click();
    await expect(page.locator('[data-lp-study]')).toHaveValue('tower');
  });

  test('dense valid imported models save a real bounded JSON file that can be reopened unchanged', async ({ page }) => {
    await openWorkbench(page);
    const model = denseModel();
    const incoming = JSON.stringify({ format: 'loadpath', version: 1, units: 'SI', model });
    const choose = async (text: string): Promise<void> => {
      await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
      const pending = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
      const chooser = await pending;
      await chooser.setFiles({ name: 'dense-study.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      await expect(page.locator('[data-lp-design-name]')).toHaveText(model.name);
      await expect(page.locator('.project-loadpath')).toHaveAttribute('data-analysis', 'stable');
      await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-node-count', '60');
      await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-member-count', '240');
      await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
    };
    await choose(incoming);
    const before = await metric(page);
    expect(before).toBeGreaterThan(0);
    const saved = await downloadText(page, 'export-json');
    expect(Buffer.byteLength(saved, 'utf8')).toBeLessThanOrEqual(LIMITS.importBytes);
    expect(saved).not.toContain('\n');
    expect(deserialize(saved)).toEqual(model);
    await expect(page.locator('[data-lp-status]')).toContainText('loadpath-design.json exported');
    await expect(page.locator('[data-lp-status]')).toHaveAttribute('data-error', 'false');
    await page.locator('[data-lp-study]').selectOption('tower');
    await choose(saved);
    expect(await metric(page)).toBe(before);
    expect(deserialize(await downloadText(page, 'export-json'))).toEqual(model);
  });

  test('plane dragging is constrained, commits once, and undo cancels an outstanding pointer edit', async ({ page }) => {
    await openWorkbench(page);
    await restoreTripod(page);
    await page.locator('[data-lp-select-kind="node"]').click();
    await page.locator('[data-lp-selection]').selectOption('N04');
    await page.locator('[data-lp-plane]').selectOption('XY');
    await page.getByRole('tab', { name: 'Structure', exact: true }).click();
    await page.locator('[data-lp-view="front"]').click();
    await expect(page.locator('.lp-canvas')).toHaveAttribute('data-camera', /front$/);
    const original = deserialize(await downloadText(page, 'export-json'));
    await page.locator('.lp-canvas').scrollIntoViewIfNeeded();
    const start = await nodePoint(page, 'N04');
    const revision = Number(await page.locator('.project-loadpath').getAttribute('data-revision'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 24, start.y - 31, { steps: 4 });
    await expect(page.locator('[data-lp-status]')).toContainText('Moving N04 in XY');
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-revision', String(revision));
    await page.mouse.up();
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-revision', String(revision + 1));
    const moved = deserialize(await downloadText(page, 'export-json'));
    const node = moved.nodes.find((n) => n.id === 'N04')!;
    expect(node.position[0]).toBeGreaterThan(0);
    expect(node.position[1]).toBeGreaterThan(3.5);
    expect(node.position[2]).toBe(0);
    await page.locator('.lp-canvas').scrollIntoViewIfNeeded();
    const next = await nodePoint(page, 'N04');
    await page.mouse.move(next.x, next.y); await page.mouse.down();
    await page.mouse.move(next.x + 40, next.y - 20, { steps: 3 });
    await page.keyboard.press('Control+z');
    await expect(page.locator('.lp-canvas')).not.toHaveAttribute('data-pointer-owner', /.+/);
    await page.mouse.up();
    expect(deserialize(await downloadText(page, 'export-json'))).toEqual(original);
    await page.locator('[data-lp-view="front"]').click();
    await page.locator('.lp-canvas').press('ArrowRight');
    await expect(page.locator('[data-lp-view="orbit"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.locator('[data-lp-plane]').selectOption('inspect');
    await page.locator('.lp-nudge summary').click();
    await editNumber(page, 'nudge-step', 0.5);
    await page.locator('[data-lp-nudge="0"][data-direction="1"]').click();
    await page.locator('[data-lp-nudge="0"][data-direction="1"]').click();
    await expect(page.locator('[data-lp-field="position-0"]')).toHaveValue('1');
    await expect(page.locator('[data-lp-field="nudge-step"]')).toHaveValue('0.5');
  });

  test('a newer numeric edit wins over delayed file import; invalid fields do not mutate good data', async ({ page }) => {
    await openWorkbench(page);
    await page.evaluate(() => {
      const read = File.prototype.text;
      File.prototype.text = async function () {
        const text = await read.call(this);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
        return text;
      };
    });
    await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
    await page.locator('[data-lp-import]').setInputFiles({ name: 'tower.json', mimeType: 'application/json', buffer: Buffer.from(serialize(STUDIES[1].model)) });
    await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
    await editNumber(page, 'position-1', 5.9);
    await expect(page.locator('[data-lp-status]')).toContainText('Import cancelled');
    await expect(page.locator('[data-lp-study]')).toHaveValue('canopy');
    await expect(page.locator('[data-lp-field="position-1"]')).toHaveValue('5.9');
    const revision = await page.locator('.project-loadpath').getAttribute('data-revision');
    const before = await metric(page);
    await editNumber(page, 'position-1', 101);
    await expect(page.locator('[data-lp-field="position-1"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.project-loadpath')).toHaveAttribute('data-revision', revision!);
    expect(await metric(page)).toBe(before);
    await expect(page.locator('[data-lp-status]')).toContainText('last committed model');
  });

  test('reduced motion is idle, and mounted renderers, observers and pending readiness are disposed', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWorkbench(page);
    await page.waitForTimeout(150);
    const frames = await page.locator('.lp-canvas').getAttribute('data-frames');
    await page.waitForTimeout(350);
    await expect(page.locator('.lp-canvas')).toHaveAttribute('data-frames', frames!);
    await page.locator('.lp-canvas').press('ArrowLeft');
    await expect.poll(async () => Number(await page.locator('.lp-canvas').getAttribute('data-frames'))).toBeGreaterThan(Number(frames));
    const lifetime = await page.evaluate(async () => {
      const { mount } = await import('../../src/projects/loadpath/index.ts');
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;inset:0;width:900px;height:800px;overflow:auto;z-index:9999';
      const controls = document.createElement('div');
      document.body.append(container);
      const controller = new AbortController();
      const instance = await mount({ container, controls, signal: controller.signal, reducedMotion: true, report: () => {} });
      const canvas = container.querySelector('canvas');
      if (!canvas) throw new Error('No real renderer was mounted.');
      const gl = canvas.getContext('webgl2');
      const before = canvas.dataset.frames;
      instance.destroy(); instance.destroy(); controller.abort();
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
      const disposed = { removed: !canvas.isConnected, contextLost: gl?.isContextLost(), framesUnchanged: before === canvas.dataset.frames, children: container.childElementCount };
      const abort = new AbortController();
      const pending = mount({ container, controls, signal: abort.signal, reducedMotion: true, report: () => {} });
      abort.abort();
      let cancelled = false;
      try { await pending; }
      catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error;
        cancelled = true;
      }
      const remaining = container.childElementCount;
      container.remove();
      return { ...disposed, cancelled, remaining };
    });
    expect(lifetime).toEqual({ removed: true, contextLost: true, framesUnchanged: true, children: 0, cancelled: true, remaining: 0 });
    expect(errors).toEqual([]);
  });

  test('real 3D member colors and support reactions are unchanged by result permutation and reject incomplete updates', async ({ page }) => {
    await openWorkbench(page);
    const rendered = await page.evaluate(async () => {
      const { createStructureScene } = await import('../../src/projects/loadpath/scene.ts');
      const { STUDIES } = await import('../../src/projects/loadpath/presets.ts');
      const { analyze } = await import('../../src/projects/loadpath/solver.ts');
      const { cloneModel, ModelError } = await import('../../src/projects/loadpath/schema.ts');
      const model = cloneModel(STUDIES[1].model);
      model.activeCase = model.loadCases[2].id;
      const result = analyze(model);
      if (result.status !== 'stable') throw new Error(result.message);
      const host = document.createElement('div');
      host.className = 'lp-stage';
      host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:560px;z-index:10000';
      const root = document.querySelector('.project-loadpath');
      if (!root) throw new Error('The workbench is not mounted.');
      root.append(host);
      let view: import('../../src/projects/loadpath/scene').StructureScene | undefined;
      try {
        view = createStructureScene(host, () => {}, () => {}, () => {}, () => {});
        const settings: import('../../src/projects/loadpath/scene').SceneOptions = {
          color: 'force', deformed: true, amplification: 400, reactions: true,
          selection: { kind: 'member', id: model.members[0].id }, plane: 'inspect',
        };
        const canvas = host.querySelector('canvas');
        if (!canvas) throw new Error('The real spatial renderer did not create a canvas.');
        const gl = canvas.getContext('webgl2');
        if (!gl) throw new Error('The real spatial renderer has no WebGL2 context.');
        const capture = (): Promise<Uint8Array> => new Promise((resolve) => {
          // The scene schedules its render first. Read the real buffer in the same frame, before it is discarded.
          requestAnimationFrame(() => {
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            resolve(pixels);
          });
        });
        view.update(model, result, settings);
        await view.ready;
        view.update(model, result, settings);
        const original = await capture();
        const differences = (other: Uint8Array): number => {
          if (other.length !== original.length) throw new Error('The viewport changed during the association comparison.');
          return other.reduce((count, value, index) => count + Number(value !== original[index]), 0);
        };
        view.update(model, { ...result, members: [...result.members].reverse() }, settings);
        const members = differences(await capture());
        view.update(model, { ...result, nodes: [...result.nodes].reverse() }, settings);
        const nodes = differences(await capture());
        view.update(model, { ...result, members: [...result.members].reverse(), nodes: [...result.nodes].reverse() }, settings);
        const both = differences(await capture());
        const errors: string[] = [];
        for (const incomplete of [
          { ...result, members: result.members.slice(1) },
          { ...result, nodes: result.nodes.slice(1) },
          { ...result, nodes: [result.nodes[0], ...result.nodes] },
        ]) {
          try { view.update(model, incomplete, settings); }
          catch (error) {
            if (!(error instanceof ModelError)) throw error;
            errors.push(error.message);
          }
        }
        view.camera('home');
        const afterRejection = differences(await capture());
        const painted = original.reduce((count, value, index) => count + Number(index % 4 === 3 && value > 0), 0);
        return { members, nodes, both, afterRejection, painted, errors };
      } finally {
        view?.destroy();
        host.remove();
      }
    });
    expect(rendered.painted).toBeGreaterThan(1000);
    expect({ members: rendered.members, nodes: rendered.nodes, both: rendered.both, afterRejection: rendered.afterRejection }).toEqual({ members: 0, nodes: 0, both: 0, afterRejection: 0 });
    expect(rendered.errors).toHaveLength(3);
    expect(rendered.errors[0]).toMatch(/missing member results/);
    expect(rendered.errors[1]).toMatch(/missing node results/);
    expect(rendered.errors[2]).toMatch(/duplicate node result/);
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 375, height: 844 }, hasTouch: true, isMobile: true });
    test('375 and 320 px panes preserve picking, numerical editing, focus and bounded layout', async ({ page }, testInfo) => {
      await openWorkbench(page);
      const marker = page.locator('[data-lp-node="N14"]');
      const bounds = await marker.boundingBox();
      expect(bounds).not.toBeNull();
      await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
      await expect(page.locator('.project-loadpath')).toHaveAttribute('data-selected', 'node:N14');
      const screenshot = testInfo.outputPath('loadpath-mobile.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await testInfo.attach('Loadpath mobile', { path: screenshot, contentType: 'image/png' });
      console.log(`LOADPATH_MOBILE_CAPTURE ${screenshot}`);
      await page.locator('[data-lp-pane="edit"]').click();
      await expect(page.locator('[data-lp-selection]')).toHaveValue('N14');
      const before = await metric(page);
      await editNumber(page, 'position-1', 5.7);
      await page.locator('[data-lp-pane="results"]').click();
      expect(await metric(page)).not.toBe(before);
      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const button of await page.locator('.lp-history button').all()) {
          const box = await button.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeLessThanOrEqual(46);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
        for (const pane of ['structure', 'edit', 'results']) {
          await page.locator(`[data-lp-pane="${pane}"]`).click();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
          await expect(page.locator(`.lp-${pane === 'structure' ? 'structure' : pane === 'edit' ? 'edit' : 'results'}-pane`)).toBeVisible();
        }
      }
      await page.locator('[data-lp-pane="edit"]').focus();
      await expect(page.locator('[data-lp-pane="edit"]')).toBeFocused();
      expect(await page.locator('[data-lp-pane="edit"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
      await page.locator('[data-lp-pane="edit"]').click();
      await page.screenshot({ path: testInfo.outputPath('loadpath-mobile-edit-320.png'), fullPage: true });
    });

    test('only the first touch owns the spatial camera, cancellation leaves no captured pointer', async ({ page }) => {
      await openWorkbench(page);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const rect = await page.locator('.lp-canvas').boundingBox();
      if (!rect) throw new Error('The spatial canvas is not visible.');
      const x = Math.round(rect.x + rect.width * 0.4), y = Math.round(rect.y + rect.height * 0.7);
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      const owner = await page.locator('.lp-canvas').getAttribute('data-pointer-owner');
      expect(owner).toBeTruthy();
      const camera = await page.locator('.lp-canvas').getAttribute('data-camera');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 60, y, id: 2 }] });
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-pointer-owner', owner!);
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }, { x: x + 90, y: y + 20, id: 2 }] });
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-camera', camera!);
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(page.locator('.lp-canvas')).not.toHaveAttribute('data-pointer-owner', /.+/);
      await session.detach();
      expect(errors).toEqual([]);
    });
  });
});
