import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { compileField, cross, dot, modelBounds, planeBasis, planePoint, sub, worldPoint } from '../../src/projects/section/fields';
import { exportSTL, sectionDrawing } from '../../src/projects/section/exports';
import { meshSolid } from '../../src/projects/section/mesh';
import { clone, LIMITS, primitive } from '../../src/projects/section/model';
import type { Document, Primitive, Vec3 } from '../../src/projects/section/model';
import { STUDIES } from '../../src/projects/section/presets';
import { sliceSolid } from '../../src/projects/section/slice';
import { History, parseDocument, RevisionGate, serializeDocument, validateDocument } from '../../src/projects/section/state';

function document(primitives: Primitive[], resolution: Document['resolution'] = 28): Document {
  return { version: 1, units: 'mm', title: 'Numerical fixture', plane: { offset: 0, rotation: [0, 0, 0] }, primitives, resolution };
}
function relative(actual: number, expected: number) { return Math.abs(actual - expected) / expected; }

function auditMesh(mesh: ReturnType<typeof meshSolid>) {
  const edges = new Map<string, { count: number; balance: number }>();
  const center: Vec3 = [
    (mesh.domain.min[0] + mesh.domain.max[0]) / 2,
    (mesh.domain.min[1] + mesh.domain.max[1]) / 2,
    (mesh.domain.min[2] + mesh.domain.max[2]) / 2,
  ];
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let volume = 0, collapsed = 0;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const points: Vec3[] = [0, 3, 6].map((offset) => [
      mesh.positions[i + offset], mesh.positions[i + offset + 1], mesh.positions[i + offset + 2],
    ]);
    const face = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    if (Math.hypot(...face) === 0) collapsed++;
    volume += dot(sub(points[0], center), face) / 6;
    for (let j = 0; j < 3; j++) {
      const a = points[j].join(','), b = points[(j + 1) % 3].join(',');
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++; edge.balance += a < b ? 1 : -1; edges.set(key, edge);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], points[j][axis]); max[axis] = Math.max(max[axis], points[j][axis]);
      }
    }
  }
  return {
    volume, collapsed, bounds: { min, max },
    conflictingSharedEdges: [...edges.values()].filter((edge) => edge.count === 2 && edge.balance !== 0).length,
  };
}

function cutSphere(radius: number, position: Vec3): Document {
  return document([
    primitive('sphere', 'sphere', { radius, position }),
    primitive('box', 'cut', { operation: 'difference', size: [radius * 4, radius * 4, radius * 2], position: [position[0], position[1], position[2] + radius] }),
  ], 44);
}

test.describe('SECTION engine', () => {
  test('sphere volume, area and bounds converge to known geometry', () => {
    const scene = document([primitive('sphere', 'sphere', { radius: 20 })]);
    const coarse = meshSolid(scene), fine = meshSolid({ ...scene, resolution: 64 });
    const analyticVolume = 4 / 3 * Math.PI * 20 ** 3;
    expect(relative(coarse.volume, analyticVolume)).toBeLessThan(0.015);
    expect(relative(fine.volume, analyticVolume)).toBeLessThan(relative(coarse.volume, analyticVolume));
    expect(relative(fine.volume, analyticVolume)).toBeLessThan(0.004);
    expect(fine.bounds?.max[0]).toBeCloseTo(20, 1);
    const section = sliceSolid(scene), refined = sliceSolid({ ...scene, resolution: 64 });
    const analyticArea = Math.PI * 20 ** 2;
    expect(relative(section.area, analyticArea)).toBeLessThan(0.002);
    expect(relative(refined.area, analyticArea)).toBeLessThan(relative(section.area, analyticArea));
    expect(section).toMatchObject({ islands: 1, holes: 0, open: 0 });
    expect(sliceSolid({ ...scene, plane: { offset: 12, rotation: [32, -17, 43] } }).area).toBeCloseTo(Math.PI * (400 - 144), 0);
  });

  test('box and capped cylinder measurements are numerical, not canned', () => {
    const box = document([primitive('box', 'box', { size: [30, 40, 50] })]);
    const cylinder = document([primitive('cylinder', 'cylinder', { radius: 15, size: [30, 30, 40] })]);
    expect(relative(meshSolid(box).volume, 60_000)).toBeLessThan(0.015);
    expect(relative(sliceSolid(box).area, 1200)).toBeLessThan(0.002);
    expect(relative(meshSolid(cylinder).volume, Math.PI * 225 * 40)).toBeLessThan(0.025);
    expect(relative(sliceSolid(cylinder).area, Math.PI * 225)).toBeLessThan(0.002);
    const larger = clone(cylinder); larger.primitives[0].radius = 22;
    expect(meshSolid(larger).volume).toBeGreaterThan(meshSolid(cylinder).volume * 2);
  });

  test('torus section carries a true hole and a measured annular area', () => {
    const scene = document([primitive('torus', 'ring', { radius: 20, tube: 6 })], 44);
    const section = sliceSolid(scene), mesh = meshSolid(scene);
    expect(section).toMatchObject({ islands: 1, holes: 1, open: 0 });
    expect(section.contours).toHaveLength(2);
    expect(relative(section.area, 4 * Math.PI * 20 * 6)).toBeLessThan(0.002);
    expect(relative(mesh.volume, 2 * Math.PI ** 2 * 20 * 6 ** 2)).toBeLessThan(0.02);
    const vertical = sliceSolid({ ...scene, plane: { rotation: [90, 0, 0], offset: 0 } });
    expect(vertical).toMatchObject({ islands: 2, holes: 0, open: 0 });
    expect(relative(vertical.area, 2 * Math.PI * 6 ** 2)).toBeLessThan(0.005);
  });

  test('ordered union, difference and intersection have consistent fields and meshes', () => {
    const outer = primitive('sphere', 'outer', { radius: 20 });
    const inner = primitive('sphere', 'inner', { radius: 10, operation: 'difference' });
    const shell = document([outer, inner]);
    expect(compileField(shell)([0, 0, 0])).toBe(10);
    expect(compileField(shell)([15, 0, 0])).toBeLessThan(0);
    expect(sliceSolid(shell)).toMatchObject({ islands: 1, holes: 1, open: 0 });
    expect(relative(meshSolid(shell).volume, 4 / 3 * Math.PI * (8000 - 1000))).toBeLessThan(0.02);
    const intersection = document([outer, { ...inner, operation: 'intersection' }]);
    expect(relative(meshSolid(intersection).volume, 4 / 3 * Math.PI * 1000)).toBeLessThan(0.02);
    const union = document([outer, { ...inner, operation: 'union', position: [50, 0, 0] }]);
    expect(sliceSolid(union)).toMatchObject({ islands: 2, holes: 0, open: 0 });
    expect(relative(meshSolid(union).volume, 4 / 3 * Math.PI * 9000)).toBeLessThan(0.025);
    expect(compileField(document([inner, outer]))([0, 0, 0])).toBeLessThan(0);
  });

  test('local rotations then translation agree with arbitrary-plane coordinates', () => {
    const rotation: Vec3 = [33, -26, 71];
    const plane = { rotation, offset: 17 };
    const frame = planeBasis(plane);
    const point = planePoint(plane, 8, -4);
    expect(dot(sub(point, frame.origin), frame.normal)).toBeCloseTo(0, 10);
    expect(dot(cross(frame.u, frame.v), frame.normal)).toBeCloseTo(1, 10);
    const item = primitive('cylinder', 'rotated', { radius: 15, size: [40, 40, 40], rotation, position: frame.origin });
    const scene = { ...document([item], 44), plane };
    expect(compileField(scene)(worldPoint([15, 0, 0], item.position, rotation))).toBeCloseTo(0, 10);
    expect(compileField(scene)(point)).toBeLessThan(0);
    const section = sliceSolid(scene);
    expect(relative(section.area, Math.PI * 225)).toBeLessThan(0.003);
    expect(section).toMatchObject({ islands: 1, holes: 0, open: 0 });
    expect(relative(meshSolid(scene).volume, Math.PI * 225 * 40)).toBeLessThan(0.02);
    for (const contour of section.contours) for (const [u, v] of contour.points.filter((_, i) => i % 23 === 0)) {
      expect(Math.abs(compileField(scene)(planePoint(plane, u, v)))).toBeLessThan(section.step * 0.02);
    }
  });

  test('mesh triangles and STL vertices are finite and consistently outward', () => {
    const scene = document([primitive('sphere', 'sphere', { radius: 15, position: [21, -17, 11] })]);
    const mesh = meshSolid(scene), field = compileField(scene);
    expect(mesh.triangles).toBeGreaterThan(1000);
    expect(mesh.positions.length).toBe(mesh.triangles * 9);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    let allFinite = true, minOrientation = Infinity, maxResidual = 0;
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const a: Vec3 = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      const b: Vec3 = [mesh.positions[i + 3], mesh.positions[i + 4], mesh.positions[i + 5]];
      const c: Vec3 = [mesh.positions[i + 6], mesh.positions[i + 7], mesh.positions[i + 8]];
      const normal = cross(sub(b, a), sub(c, a));
      allFinite &&= [...a, ...b, ...c, ...normal].every(Number.isFinite);
      minOrientation = Math.min(minOrientation, dot(normal, sub(a, [21, -17, 11])));
      maxResidual = Math.max(maxResidual, Math.abs(field(a)));
    }
    expect(allFinite).toBe(true);
    expect(minOrientation).toBeGreaterThan(0);
    expect(maxResidual).toBeLessThan(mesh.step * 0.08);
    const stl = exportSTL(mesh), view = new DataView(stl);
    expect(stl.byteLength).toBe(84 + mesh.triangles * 50);
    expect(view.getUint32(80, true)).toBe(mesh.triangles);
    expect(view.getFloat32(96, true)).toBe(mesh.positions[0]);
    expect(view.getFloat32(100, true)).toBe(mesh.positions[1]);
    expect(view.getFloat32(104, true)).toBe(mesh.positions[2]);
  });

  test('empty, disjoint, missing and sub-grid geometry never substitutes a shape', () => {
    const empty = document([]);
    expect(meshSolid(empty)).toMatchObject({ state: 'empty', volume: 0, triangles: 0, bounds: null });
    expect(sliceSolid(empty)).toMatchObject({ area: 0, islands: 0, holes: 0 });
    const disjoint = document([primitive('sphere', 'a'), primitive('sphere', 'b', { operation: 'intersection', position: [100, 0, 0] })]);
    expect(modelBounds(disjoint)).toBeNull();
    expect(meshSolid(disjoint).state).toBe('empty');
    const erased = document([primitive('sphere', 'a'), primitive('sphere', 'b', { radius: 40, operation: 'difference' })]);
    expect(meshSolid(erased)).toMatchObject({ state: 'unresolved', triangles: 0, volume: 0 });
    expect(() => exportSTL(meshSolid(erased))).toThrow('No resolved mesh');
    const thin = document([primitive('box', 'thin', { size: [80, 80, 0.4] })]);
    expect(meshSolid(thin).warnings.join(' ')).toMatch(/thinner than three grid cells/);
    expect(sliceSolid({ ...thin, plane: { offset: 20, rotation: [0, 0, 0] } }).area).toBe(0);
  });

  test('all four construction studies produce distinct actual solids and valid contours', () => {
    const volumes: number[] = [];
    for (const study of STUDIES) {
      const scene = validateDocument(study.create()), mesh = meshSolid({ ...scene, resolution: 28 }), section = sliceSolid(scene);
      expect(mesh.state, study.id).toBe('resolved');
      expect(mesh.volume, study.id).toBeGreaterThan(1000);
      expect(section.area, study.id).toBeGreaterThan(100);
      expect(section.open, study.id).toBe(0);
      const audit = auditMesh(mesh);
      expect(audit.conflictingSharedEdges, study.id).toBe(0);
      expect(audit.collapsed, study.id).toBe(0);
      expect(audit.bounds, study.id).toEqual(mesh.bounds);
      expect(relative(audit.volume, mesh.volume), study.id).toBeLessThan(1e-12);
      volumes.push(Math.round(mesh.volume));
    }
    expect(new Set(volumes).size).toBe(4);
    expect(sliceSolid(STUDIES[2].create())).toMatchObject({ islands: 2, holes: 2 });
  });

  test('strict versioned JSON roundtrips without accepting malformed or unbounded data', () => {
    const scene = STUDIES[0].create();
    expect(parseDocument(serializeDocument(scene))).toEqual(scene);
    for (const change of [
      { version: 2 }, { units: 'inches' }, { resolution: 512 }, { plane: { offset: Infinity, rotation: [0, 0, 0] } },
      { primitives: Array.from({ length: 17 }, (_, i) => primitive('box', `b${i}`)) },
      { primitives: [primitive('sphere', 'same'), primitive('sphere', 'same')] },
      { primitives: [primitive('box', 'bad', { position: [NaN, 0, 0] })] },
      { primitives: [primitive('box', 'bad', { size: [-1, 0, 3] })] },
      { primitives: [primitive('torus', 'bad', { radius: 2, tube: 4 })] },
      { primitives: [{ ...primitive('box', 'bad'), rotation: [1, 2] }] },
      { primitives: [{ ...primitive('box', 'bad'), kind: 'mesh' }] },
    ]) expect(() => validateDocument({ ...scene, ...change })).toThrow();
    expect(() => parseDocument('{')).toThrow('not valid JSON');
    expect(() => parseDocument(' '.repeat(64_001))).toThrow('64 KB');
    expect(() => parseDocument('['.repeat(100) + '0' + ']'.repeat(100))).toThrow('version 1');
    expect(sectionDrawing(scene, sliceSolid(scene), true)).toContain('fill-rule="evenodd"');
    const dangerousTitle = { ...scene, title: '<script>alert(1)</script>' };
    const svg = sectionDrawing(dangerousTitle, sliceSolid(scene), true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('numerical approximation');
    expect(svg).toMatch(/width="[0-9.]+mm" height="[0-9.]+mm"/);
  });

  test('history groups a gesture, cancels without losing work, and rejects invalid edits', () => {
    const scene = STUDIES[0].create(), history = new History(scene);
    history.begin();
    for (const offset of [10, 20, 30]) history.change({ ...clone(history.current), plane: { offset, rotation: [0, 0, 0] } });
    history.finish();
    expect(history.current.plane.offset).toBe(30);
    expect(history.undo()).toBe(true);
    expect(history.current).toEqual(scene);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.current.plane.offset).toBe(30);
    history.begin(); history.change({ ...clone(history.current), title: 'Cancelled' }); history.cancel();
    expect(history.current.title).toBe(scene.title);
    expect(() => history.change({ ...clone(history.current), plane: { offset: 999, rotation: [0, 0, 0] } })).toThrow();
    expect(history.current.plane.offset).toBe(30);
    history.undo(); history.change({ ...clone(history.current), title: 'Branch' });
    expect(history.canRedo).toBe(false);
  });

  test('revision gate rejects superseded and post-disposal computation', () => {
    const gate = new RevisionGate();
    const first = gate.next(), second = gate.next();
    expect(gate.accepts(first)).toBe(false);
    expect(gate.accepts(second)).toBe(true);
    gate.close();
    expect(gate.accepts(second)).toBe(false);
    expect(gate.accepts(gate.next())).toBe(false);
  });

  test('cavity walls point into the void and section tangencies have zero area', () => {
    const fixture = document([primitive('sphere', 'outer', { radius: 20 }), primitive('sphere', 'cavity', { radius: 12, operation: 'difference' })]);
    const mesh = meshSolid(fixture);
    let innerFaces = 0, minimumOutward = Infinity;
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const a: Vec3 = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      const b: Vec3 = [mesh.positions[i + 3], mesh.positions[i + 4], mesh.positions[i + 5]];
      const c: Vec3 = [mesh.positions[i + 6], mesh.positions[i + 7], mesh.positions[i + 8]];
      if (Math.hypot(...a) > 15) continue;
      innerFaces++;
      minimumOutward = Math.min(minimumOutward, -dot(cross(sub(b, a), sub(c, a)), a));
    }
    expect(innerFaces).toBeGreaterThan(100);
    expect(minimumOutward).toBeGreaterThan(0);
    expect(sliceSolid({ ...fixture, plane: { offset: 20, rotation: [0, 0, 0] } })).toMatchObject({ area: 0, islands: 0, holes: 0, open: 0 });
    const subgrid = meshSolid(document([primitive('box', 'sheet', { size: [80, 80, 0.4] })]));
    expect(subgrid.state).toBe('unresolved');
    expect(subgrid.triangles).toBe(0);
  });

  test('Boolean-crease winding and stored volume remain translation invariant', async ({}, testInfo) => {
    const original = meshSolid(cutSphere(20, [0, 0, 0]));
    const moved = meshSolid(cutSphere(20, [0, 0, 80]));
    for (const mesh of [original, moved]) {
      const audit = auditMesh(mesh);
      expect(audit.conflictingSharedEdges).toBe(0);
      expect(audit.collapsed).toBe(0);
      expect(audit.bounds).toEqual(mesh.bounds);
      expect(relative(audit.volume, mesh.volume)).toBeLessThan(1e-12);
      expect(relative(mesh.volume, 2 / 3 * Math.PI * 20 ** 3)).toBeLessThan(0.006);
    }
    expect(relative(moved.volume, original.volume)).toBeLessThan(2e-6);
    await testInfo.attach('boolean-volume.json', {
      body: JSON.stringify({ original: original.volume, translated: moved.volume, difference: moved.volume - original.volume, relativeDifference: relative(moved.volume, original.volume), triangles: original.triangles }, null, 2),
      contentType: 'application/json',
    });
  });

  test('small translated Boolean solids avoid world-origin cancellation', async ({}, testInfo) => {
    const originalDocument = validateDocument(cutSphere(0.4, [0, 0, 0]));
    const movedDocument = validateDocument(cutSphere(0.4, [119, 119, 119]));
    const original = meshSolid(originalDocument), moved = meshSolid(movedDocument);
    expect(auditMesh(moved).conflictingSharedEdges).toBe(0);
    expect(relative(moved.volume, original.volume)).toBeLessThan(6e-5);
    expect(relative(moved.volume, 2 / 3 * Math.PI * 0.4 ** 3)).toBeLessThan(0.006);
    expect(relative(auditMesh(moved).volume, moved.volume)).toBeLessThan(1e-12);
    await testInfo.attach('small-boolean-volume.json', {
      body: JSON.stringify({ original: original.volume, translated: moved.volume, difference: moved.volume - original.volume, relativeDifference: relative(moved.volume, original.volume), triangles: moved.triangles }, null, 2),
      contentType: 'application/json',
    });
  });

  test('dense rotated boxes export only noncollapsed Float32 facets with consistent metrics', async ({}, testInfo) => {
    const measurements: { resolution: number; triangles: number; volume: number; warnings: string[] }[] = [];
    for (const resolution of [28, 44, 64] as const) {
      const mesh = meshSolid(document([primitive('box', 'rotated', { size: [40, 40, 50], rotation: [0, 0, 45] })], resolution));
      const audit = auditMesh(mesh);
      expect(mesh.triangles).toBeGreaterThan(1000);
      expect(mesh.positions.length).toBe(mesh.triangles * 9);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(audit.collapsed).toBe(0);
      expect(audit.conflictingSharedEdges).toBe(0);
      expect(audit.bounds).toEqual(mesh.bounds);
      expect(relative(audit.volume, mesh.volume)).toBeLessThan(1e-12);
      expect(relative(mesh.volume, 80_000)).toBeLessThan(0.015);
      const buffer = exportSTL(mesh), stl = new DataView(buffer);
      expect(stl.getUint32(80, true)).toBe(mesh.triangles);
      expect(buffer.byteLength).toBe(84 + mesh.triangles * 50);
      let collapsed = 0, minimumAlignment = Infinity, maximumNormalError = 0, matchingVertices = true;
      for (let i = 0; i < mesh.triangles; i++) {
        const base = 84 + i * 50;
        const normal: Vec3 = [stl.getFloat32(base, true), stl.getFloat32(base + 4, true), stl.getFloat32(base + 8, true)];
        const points: Vec3[] = [12, 24, 36].map((offset) => [stl.getFloat32(base + offset, true), stl.getFloat32(base + offset + 4, true), stl.getFloat32(base + offset + 8, true)]);
        const face = cross(sub(points[1], points[0]), sub(points[2], points[0]));
        if (Math.hypot(...face) === 0) collapsed++;
        minimumAlignment = Math.min(minimumAlignment, dot(normal, face));
        maximumNormalError = Math.max(maximumNormalError, Math.abs(Math.hypot(...normal) - 1));
        matchingVertices &&= points.flat().every((value, j) => value === mesh.positions[i * 9 + j]);
      }
      expect(collapsed).toBe(0);
      expect(minimumAlignment).toBeGreaterThan(0);
      expect(maximumNormalError).toBeLessThan(1e-6);
      expect(matchingVertices).toBe(true);
      measurements.push({ resolution, triangles: mesh.triangles, volume: mesh.volume, warnings: mesh.warnings });
    }
    await testInfo.attach('rotated-boxes.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  });

  test('STL rejects collapsed or corrupt buffers rather than fabricating normals', () => {
    const mesh = meshSolid(document([primitive('sphere', 'sphere')]));
    const one = { ...mesh, triangles: 1, positions: new Float32Array([0, 0, 0, 0, 1e-8, 0, 0, 0, 1e-8]), normals: new Float32Array(9) };
    const valid = new DataView(exportSTL(one));
    expect([valid.getFloat32(84, true), valid.getFloat32(88, true), valid.getFloat32(92, true)]).toEqual([1, 0, 0]);
    expect(() => exportSTL({ ...one, positions: new Float32Array(9) })).toThrow('collapsed');
    const nonfinite = new Float32Array(one.positions); nonfinite[0] = Infinity;
    expect(() => exportSTL({ ...one, positions: nonfinite })).toThrow('non-finite');
    expect(() => exportSTL({ ...one, triangles: 2 })).toThrow('triangle count');
    expect(() => exportSTL({ ...one, triangles: LIMITS.triangles + 1 })).toThrow('triangle count');
  });

  test('history origins follow snapshots and origin-only loads without entering version 1 files', () => {
    const first = STUDIES[0].create(), second = clone(first);
    second.plane.offset = 21;
    const history = new History(first, 'tender');
    expect(history.origin).toEqual({ baseline: first, studyId: 'tender' });
    history.change(second);
    expect(history.load(second)).toBe(true);
    expect(history.current).toEqual(second);
    expect(history.origin).toEqual({ baseline: second, studyId: null });
    expect(history.undo()).toBe(true);
    expect(history.current).toEqual(second);
    expect(history.origin).toEqual({ baseline: first, studyId: 'tender' });
    expect(history.redo()).toBe(true);
    expect(history.origin).toEqual({ baseline: second, studyId: null });
    history.undo();
    history.change(history.origin.baseline);
    expect(history.current).toEqual(first);
    expect(history.canRedo).toBe(false);
    const exposed = history.origin;
    exposed.baseline.plane.offset = 99;
    expect(history.origin.baseline).toEqual(first);
    expect(parseDocument(serializeDocument(history.current))).toEqual(first);
    expect(serializeDocument(history.current)).not.toMatch(/"origin"|"baseline"|"studyId"/);
    const withUntrustedOrigin = parseDocument(JSON.stringify({ ...first, origin: { baseline: second, studyId: 'vessel' } }));
    history.load(withUntrustedOrigin);
    expect(history.origin).toEqual({ baseline: first, studyId: null });
  });

  test('history origins survive grouped commit, cancellation, invalid loads and bounded eviction', () => {
    const first = STUDIES[0].create(), second = STUDIES[2].create();
    const history = new History(first, 'tender');
    history.load(second, 'vessel');
    history.begin();
    for (const offset of [5, 13, 29]) history.change({ ...clone(history.current), plane: { offset, rotation: [0, 0, 0] } });
    history.finish();
    expect(history.origin).toEqual({ baseline: second, studyId: 'vessel' });
    history.undo();
    expect(history.current).toEqual(second);
    expect(history.origin).toEqual({ baseline: second, studyId: 'vessel' });
    history.undo();
    expect(history.current).toEqual(first);
    expect(history.origin).toEqual({ baseline: first, studyId: 'tender' });
    history.redo();
    history.begin();
    history.change({ ...clone(history.current), plane: { offset: 33, rotation: [0, 0, 0] } });
    expect(() => history.load({ ...clone(first), plane: { offset: 999, rotation: [0, 0, 0] } }, 'tender')).toThrow();
    expect(history.current.plane.offset).toBe(33);
    expect(history.cancel()).toBe(true);
    expect(history.current).toEqual(second);
    expect(history.origin).toEqual({ baseline: second, studyId: 'vessel' });
    expect(history.canRedo).toBe(true);
    history.begin();
    history.change({ ...clone(second), plane: { offset: 7, rotation: [0, 0, 0] } });
    history.load(first, 'tender');
    history.undo();
    expect(history.current.plane.offset).toBe(7);
    expect(history.origin).toEqual({ baseline: second, studyId: 'vessel' });
    history.undo();
    expect(history.current).toEqual(second);
    for (let i = 0; i < LIMITS.history + 5; i++) {
      history.change({ ...clone(history.current), plane: { offset: i + 1, rotation: [0, 0, 0] } });
    }
    let undos = 0;
    while (history.undo()) {
      undos++;
      expect(history.origin).toEqual({ baseline: second, studyId: 'vessel' });
    }
    expect(undos).toBe(LIMITS.history);
  });
});

async function openSection(page: Page, path = './projects/section/') {
  await page.goto(path);
  await expect(page.locator('.project-section')).toHaveAttribute('data-ready', 'true');
  await settled(page);
}
async function settled(page: Page) {
  await expect(page.locator('.project-section')).toHaveAttribute('data-computing', 'false', { timeout: 25_000 });
}
async function numericEdit(page: Page, selector: string, value: string) {
  await page.locator(selector).fill(value);
  await page.locator(selector).press('Tab');
  await settled(page);
}

test.describe('SECTION browser', () => {
  test.beforeEach(async ({ page }) => {
    // Concurrent projects share Vite; unrelated HMR reloads must not reset this workflow.
    await page.routeWebSocket((url) => url.searchParams.has('token'), (socket) => { socket.onMessage(() => {}); });
  });

  test('actual initial linked geometry, editing, history, study switching and exports', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSection(page);
    await expect(page.locator('[data-project-preview]')).toBeVisible();
    await expect(page.locator('[data-solid] canvas')).toBeVisible();
    await expect(page.locator('[data-drawing] svg')).toBeVisible();
    await expect(page.locator('[data-volume]')).not.toHaveText('0');
    await page.screenshot({ path: testInfo.outputPath('section-desktop.png'), fullPage: true });
    const initial = await page.locator('[data-volume]').textContent();
    await numericEdit(page, '[data-field="radius"]', '31');
    await expect(page.locator('[data-field="size-2"]')).toBeFocused();
    expect(await page.locator('[data-volume]').textContent()).not.toBe(initial);
    await page.getByRole('button', { name: 'Undo last edit' }).click(); await settled(page);
    await expect(page.locator('[data-volume]')).toHaveText(initial ?? '');
    await page.getByRole('button', { name: 'Redo last edit' }).click(); await settled(page);
    await expect(page.locator('[data-field="radius"]')).toHaveValue('31');
    await page.getByRole('button', { name: 'Files & guide', exact: true }).click();
    const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="save"]').click()]);
    const jsonPath = await jsonDownload.path();
    if (!jsonPath) throw new Error('Missing JSON download');
    const saved = parseDocument(await readFile(jsonPath, 'utf8'));
    expect(saved.primitives[0].radius).toBe(31);
    const [stlDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="stl"]').click()]);
    const stlPath = await stlDownload.path();
    if (!stlPath) throw new Error('Missing STL download');
    const stl = await readFile(stlPath);
    expect(stl.length).toBe(84 + stl.readUInt32LE(80) * 50);
    expect(stl.readUInt32LE(80)).toBeGreaterThan(500);
    const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="svg"]').click()]);
    const svgPath = await svgDownload.path();
    if (!svgPath) throw new Error('Missing SVG download');
    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('<metadata>');
    expect(svg).not.toMatch(/(?:href|src)="https?:/);
    await page.getByRole('button', { name: 'Close Construction files & guide', exact: true }).click();
    await page.getByRole('tab', { name: 'Studies', exact: true }).click();
    await page.locator('[data-study="vessel"]').click(); await settled(page);
    await expect(page.locator('[data-topology]')).toContainText('2 islands / 2 holes');
    await page.getByRole('button', { name: 'Undo last edit' }).click(); await settled(page);
    await expect(page.locator('[data-study="tender"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-title]')).toHaveText('Tender monument');
    await page.locator('[data-file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(serializeDocument(saved)) });
    await settled(page);
    await expect(page.locator('[data-field="radius"]')).toHaveValue('31');
    await page.getByRole('tab', { name: 'Construction', exact: true }).click();
    await numericEdit(page, '[data-field="radius"]', '35');
    await page.locator('[data-action="reset"]').click(); await settled(page);
    await expect(page.locator('[data-field="radius"]')).toHaveValue('31');
    expect(errors).toEqual([]);
  });

  test('new construction, transforms, reordering, invalid imports and empty result', async ({ page }) => {
    test.setTimeout(90_000);
    await openSection(page);
    const fixture = document([primitive('sphere', 'seed', { radius: 20 })]);
    await page.locator('[data-file]').setInputFiles({ name: 'sphere.json', mimeType: 'application/json', buffer: Buffer.from(serializeDocument(fixture)) });
    await settled(page);
    const baseline = await page.locator('[data-volume]').textContent();
    await page.locator('[data-file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await expect(page.locator('[data-error]')).toContainText('current study has not changed');
    await expect(page.locator('[data-volume]')).toHaveText(baseline ?? '');
    await page.locator('[data-kind]').selectOption('cylinder');
    await page.locator('[data-action="add"]').click(); await settled(page);
    await page.locator('[data-field="operation"]').selectOption('difference'); await settled(page);
    await numericEdit(page, '[data-field="radius"]', '8');
    await expect(page.locator('[data-topology]')).toContainText('1 island / 1 hole');
    await numericEdit(page, '[data-field="rotation-0"]', '90');
    await expect(page.locator('[data-topology]')).toContainText('2 islands / 0 holes');
    await numericEdit(page, '[data-field="position-0"]', '12');
    expect(await page.locator('[data-volume]').textContent()).not.toBe(baseline);
    await page.locator('[data-action="up"]').click(); await settled(page);
    await expect(page.locator('[data-volume]')).toHaveText(baseline ?? '');
    await page.locator('[data-action="remove"]').click(); await settled(page);
    await page.locator('[data-action="remove"]').click(); await settled(page);
    await expect(page.locator('[data-empty-solid]')).toBeVisible();
    await expect(page.locator('[data-volume]')).toHaveText('0');
    await expect(page.locator('[data-action="stl"]')).toBeDisabled();
    await page.locator('[data-kind]').selectOption('torus');
    await page.locator('[data-action="add"]').click(); await settled(page);
    await expect(page.locator('[data-topology]')).toContainText('1 island / 1 hole');
  });

  test('rapid plane changes cancel stale workers and keyboard gestures remain synchronized', async ({ page }) => {
    test.setTimeout(90_000);
    await openSection(page);
    await page.getByRole('tab', { name: 'Studies', exact: true }).click();
    await page.locator('[data-study="vessel"]').click(); await settled(page);
    await page.locator('#section-offset').evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Missing range');
      for (const value of ['5', '18', '-7', '70', '0']) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settled(page);
    await expect(page.locator('[data-offset-number]')).toHaveValue('0');
    await expect(page.locator('[data-topology]')).toContainText('2 islands / 2 holes');
    await page.locator('[data-mode="plane"]').click();
    await page.locator('[data-solid] canvas').focus();
    await page.keyboard.press('Shift+ArrowUp'); await settled(page);
    await expect(page.locator('[data-offset-number]')).toHaveValue('5');
    await page.getByRole('button', { name: 'Undo last edit' }).click(); await settled(page);
    await expect(page.locator('[data-offset-number]')).toHaveValue('0');
    const canvas = page.locator('[data-solid] canvas'), box = await canvas.boundingBox();
    if (!box) throw new Error('Missing solid canvas');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, { steps: 5 });
    await page.keyboard.press('Escape'); await page.mouse.up(); await settled(page);
    await expect(page.locator('[data-offset-number]')).toHaveValue('0');
    await numericEdit(page, '[data-offset-number]', '200');
    await expect(page.locator('[data-area]')).toHaveText('0');
    await expect(page.locator('[data-drawing]')).toContainText('No resolved material');
    await page.locator('[data-panel="plane"]').click();
    await page.locator('[data-plane-preset="YZ"]').click(); await settled(page);
    await expect(page.locator('[data-basis]')).toContainText('1.000 / 0.000 / 0.000');
  });

  test('a superseded geometry request cannot overwrite the last radius, and leaving closes its worker', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSection(page);
    const fixture = document([primitive('sphere', 'sphere', { radius: 20 })], 64);
    await page.locator('[data-file]').setInputFiles({ name: 'sphere.json', mimeType: 'application/json', buffer: Buffer.from(serializeDocument(fixture)) });
    await settled(page);
    await page.locator('[data-field="radius"]').evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Missing radius input');
      for (const value of ['21', '44', '13', '30']) {
        element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await settled(page);
    const volume = Number((await page.locator('[data-volume]').textContent())?.replaceAll(',', ''));
    expect(relative(volume, 4 / 3 * Math.PI * 30 ** 3)).toBeLessThan(0.004);
    await expect(page.locator('[data-field="radius"]')).toHaveValue('30');
    const workerStarted = page.waitForEvent('worker');
    await page.locator('[data-field="radius"]').fill('40');
    await page.locator('[data-field="radius"]').press('Tab');
    const worker = await workerStarted;
    const workerClosed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
    await page.goto('./');
    await workerClosed;
    expect(errors).toEqual([]);
  });

  test('built module and worker run under the nested static project path', async ({ page }) => {
    test.setTimeout(90_000);
    const { build } = await import('vite');
    const built = await build({
      configFile: false, envFile: false, base: './', logLevel: 'silent',
      build: {
        write: false, assetsInlineLimit: 0,
        lib: { entry: 'src/projects/section/index.ts', formats: ['es'], fileName: 'section' },
        rollupOptions: { output: { entryFileNames: 'assets/section.js', assetFileNames: 'assets/[name]-[hash][extname]' } },
      },
    });
    const files = new Map<string, { body: string | Buffer; contentType: string }>();
    for (const output of Array.isArray(built) ? built : [built]) {
      if (!('output' in output)) throw new Error('Unexpected watch build');
      for (const file of output.output) {
        const body = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : Buffer.from(file.source);
        files.set(`/collections/${file.fileName}`, { body, contentType: file.fileName.endsWith('.css') ? 'text/css' : 'text/javascript' });
      }
    }
    expect([...files.keys()].some((name) => /compute\.worker.*\.js$/.test(name))).toBe(true);
    const css = [...files.keys()].filter((name) => name.endsWith('.css')).map((name) => `<link rel="stylesheet" href="${name}">`).join('');
    const workers: string[] = [], errors: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/collections/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/collections/projects/section/') {
        await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${css}</head><body style="margin:0"><main id="host"></main><script type="module">import { mount } from "/collections/assets/section.js"; await mount({container: document.getElementById("host"), controls: document.createElement("div"), signal: new AbortController().signal, reducedMotion: true, report: () => {}});</script></body></html>` });
      } else {
        const file = files.get(path);
        if (!file) { await route.fulfill({ status: 404, body: 'Unexpected static asset' }); return; }
        await route.fulfill(file);
      }
    });
    await openSection(page, '/collections/projects/section/');
    await expect(page.locator('[data-volume]')).toHaveText('103,724.3');
    expect(workers.length).toBeGreaterThan(0);
    expect(workers.every((url) => url.startsWith('http://127.0.0.1:4173/collections/') && !url.includes('/src/'))).toBe(true);
    await page.locator('[data-panel="plane"]').click();
    await page.locator('[data-plane-preset="YZ"]').click(); await settled(page);
    await expect(page.locator('[data-drawing] svg')).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const width of [320, 375]) {
    test(`${width}px immediate resize keeps useful panes, readable controls and real geometry`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1440, height: 900 });
      await openSection(page);
      await page.setViewportSize({ width, height: 850 });
      await expect(page.locator('[data-solid] canvas')).toBeVisible();
      expect(await page.evaluate(() => window.document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const controls = await page.locator('.project-section button:visible, .project-section input:visible, .project-section select:visible').evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
      expect(Math.min(...controls)).toBeGreaterThanOrEqual(14);
      await page.screenshot({ path: testInfo.outputPath(`section-${width}-solid.png`), fullPage: true });
      await page.locator('[data-view-tab="slice"]').click();
      await expect(page.locator('[data-drawing] svg')).toBeVisible();
      await expect(page.locator('[data-solid] canvas')).not.toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`section-${width}-slice.png`), fullPage: true });
      await page.locator('[data-panel="plane"]').click();
      await page.locator('[data-plane-preset="XZ"]').click(); await settled(page);
      await numericEdit(page, '[data-field="plane-1"]', '25');
      expect(await page.evaluate(() => window.document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator('[data-drawing] svg')).toBeVisible();
    });
  }
});
