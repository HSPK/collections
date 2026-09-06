import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { contains, intersectElement, normalize, pointInConvex, rayCircle, rayPolygon, raySegment, rotate } from '../../src/projects/lumen/geometry';
import { createElement } from '../../src/projects/lumen/model';
import type { Block, Experiment, OpticalElement } from '../../src/projects/lumen/model';
import { materialIndex, MATERIALS, measureDetector, reflect, snell, TRACE_LIMITS, traceExperiment } from '../../src/projects/lumen/optics';
import { PRESETS, presetScene } from '../../src/projects/lumen/presets';
import { exportSceneSvg } from '../../src/projects/lumen/renderer';
import {
  beginEdit, cancelEdit, changeScene, createHistory, finishEdit, importIntoHistory, parseExperiment, redo,
  replaceElement, serializeExperiment, undo, validateExperiment,
} from '../../src/projects/lumen/state';

function scene(elements: OpticalElement[]): Experiment {
  return { version: 1, title: 'Numerical fixture', notes: '', elements };
}

function source(x = 100, y = 300, rotation = 0): OpticalElement {
  return { id: 's1', label: 'Reference source', kind: 'emitter', x, y, rotation, spectrum: 'mono', wavelength: 540, power: 1, rays: 1, aperture: 0, spread: 0 };
}

function detector(x = 800, y = 300, length = 200): OpticalElement {
  return { id: 'd1', label: 'Reference detector', kind: 'detector', x, y, rotation: 90, length };
}

const boundaryBlock: Block = {
  id: 'b1', label: 'Boundary reference glass', kind: 'block', x: 400, y: 300,
  width: 100, height: 200, rotation: 0, material: 'crown',
};

function accounted(result: ReturnType<typeof traceExperiment>): number {
  const { detected, absorbed, escaped, truncated } = result.energy;
  return detected + absorbed + escaped + truncated;
}

test.describe('Lumen engine', () => {
  test('segment intersections handle endpoints, parallel, collinear and backward rays', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -2 }, { x: 10, y: 2 })).toMatchObject({ distance: 10, point: { x: 10, y: 0 } });
    expect(raySegment({ x: 0, y: 2 }, { x: 1, y: 0 }, { x: 10, y: -2 }, { x: 10, y: 2 })?.distance).toBe(10);
    expect(raySegment({ x: 0, y: 3 }, { x: 1, y: 0 }, { x: 10, y: -2 }, { x: 10, y: 2 })).toBeNull();
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: -2 }, { x: -10, y: 2 })).toBeNull();
    expect(raySegment({ x: 10, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -2 }, { x: 10, y: 2 })).toBeNull();
    expect(() => normalize({ x: 0, y: 0 })).toThrow('nonzero');
  });

  test('circle roots and convex polygon normals are robust from either side', () => {
    expect(rayCircle({ x: -10, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 2).map((hit) => hit.distance)).toEqual([8, 12]);
    expect(rayCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 2)).toMatchObject([{ distance: 2, normal: { x: 1, y: 0 } }]);
    expect(rayCircle({ x: -10, y: 2 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 2)).toHaveLength(1);
    expect(rayCircle({ x: -10, y: 2.00001 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 2)).toHaveLength(0);
    const square = [{ x: 2, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: 2, y: 2 }];
    for (const vertices of [square, [...square].reverse()]) {
      const entering = rayPolygon({ x: 0, y: 0 }, { x: 1, y: 0 }, vertices);
      const leaving = rayPolygon({ x: 4, y: 0 }, { x: 1, y: 0 }, vertices);
      expect(entering?.distance).toBe(2);
      expect(entering?.normal.x).toBe(-1);
      expect(entering?.normal.y).toBeCloseTo(0, 12);
      expect(leaving?.distance).toBe(2);
      expect(leaving?.normal.x).toBe(1);
      expect(leaving?.normal.y).toBeCloseTo(0, 12);
      expect(rayPolygon({ x: 0, y: -2 }, { x: 1, y: 0 }, vertices)?.distance).toBe(2);
      expect(pointInConvex({ x: 4, y: 0 }, vertices)).toBe(true);
      expect(pointInConvex({ x: 4, y: 3 }, vertices)).toBe(false);
    }
  });

  test('Snell and reflection match numerical fixtures and conserve interface energy', () => {
    const direction = { x: 0.5, y: Math.sqrt(3) / 2 };
    const normal = { x: 0, y: -1 };
    const interfaceResult = snell(direction, normal, 1, 1.5);
    expect(interfaceResult.incidentAngle).toBeCloseTo(30, 9);
    expect(interfaceResult.transmittedAngle).toBeCloseTo(19.4712206345, 9);
    expect(interfaceResult.refracted?.x).toBeCloseTo(1 / 3, 9);
    expect(reflect(direction, normal)).toEqual({ x: 0.5, y: -Math.sqrt(3) / 2 });
    expect(interfaceResult.reflectance + interfaceResult.transmittance).toBeCloseTo(1, 12);
    expect(snell({ x: 1, y: 0 }, { x: -1, y: 0 }, 1, 1.5).reflectance).toBeCloseTo(0.04, 12);
    expect(snell(direction, { x: 0, y: 1 }, 1, 1.5).refracted).toEqual(interfaceResult.refracted);
    expect(snell({ x: 1, y: 0 }, { x: 0, y: 1 }, 1, 1).reflectance).toBe(0);
  });

  test('total internal reflection and critical-angle behavior are explicit', () => {
    const above = snell(rotate({ x: 0, y: 1 }, -50), { x: 0, y: -1 }, 1.5, 1);
    expect(above.tir).toBe(true);
    expect(above.refracted).toBeNull();
    expect(above.reflectance).toBe(1);
    const below = snell(rotate({ x: 0, y: 1 }, -40), { x: 0, y: -1 }, 1.5, 1);
    expect(below.tir).toBe(false);
    expect(below.transmittedAngle).toBeCloseTo(74.6185683, 6);
    expect(() => snell({ x: 1, y: 0 }, { x: 0, y: 1 }, 0, 1)).toThrow('positive');
  });

  test('Cauchy dispersion changes direction and an actual prism spectrum', () => {
    expect(materialIndex('crown', 500)).toBeCloseTo(1.5214, 8);
    expect(materialIndex('flint', 420)).toBeGreaterThan(materialIndex('flint', 660));
    const incident = rotate({ x: 1, y: 0 }, 40);
    expect(snell(incident, { x: -1, y: 0 }, 1, materialIndex('flint', 420)).transmittedAngle)
      .toBeLessThan(snell(incident, { x: -1, y: 0 }, 1, materialIndex('flint', 660)).transmittedAngle ?? 0);
    const experiment = presetScene('dispersion');
    const result = traceExperiment(experiment);
    const reading = measureDetector(result, { id: 'detector-1' });
    expect(reading.spectrum.filter((band) => band.power > 0)).toHaveLength(7);
    expect(reading.separation).toBeGreaterThan(10);
    expect(reading.power).toBeGreaterThan(0.5);
  });

  test('biconvex lens has analytic surfaces and a real narrow focal region', () => {
    const experiment = presetScene('focus');
    const lens = experiment.elements.find((element) => element.kind === 'lens');
    if (!lens || lens.kind !== 'lens') throw new Error('Missing lens fixture');
    expect(contains(lens, { x: 420, y: 300 })).toBe(true);
    expect(contains(lens, { x: 470, y: 300 })).toBe(false);
    expect(intersectElement({ x: 100, y: 300 }, { x: 1, y: 0 }, lens)?.point.x).toBeCloseTo(387.5, 8);
    expect(intersectElement({ x: 420, y: 300 }, { x: 1, y: 0 }, lens)?.point.x).toBeCloseTo(452.5, 8);
    const focused = measureDetector(traceExperiment(experiment), { id: 'detector-1' });
    const near = measureDetector(traceExperiment({ ...experiment, elements: experiment.elements.map((element) => element.kind === 'detector' ? { ...element, x: 470 } : element) }), { id: 'detector-1' });
    expect(focused.rmsWidth).toBeLessThan((near.rmsWidth ?? 0) / 2);
    expect(focused.power).toBeGreaterThan(0.7);
  });

  test('inside/outside handling allows an embedded source and records TIR', () => {
    const block: OpticalElement = { id: 'b1', label: 'Glass', kind: 'block', x: 400, y: 300, width: 100, height: 300, rotation: 0, material: 'crown' };
    const result = traceExperiment(scene([source(400, 300, 60), block]));
    expect(result.interactions.some((hit) => hit.n1 > 1.5 && hit.n2 === 1 && hit.tir)).toBe(true);
    expect(result.segments.every((segment) => Object.values(segment.end).every(Number.isFinite))).toBe(true);
    expect(accounted(result)).toBeCloseTo(1, 10);
  });

  test('ideal detector hits, weighted spot width and misses come from intersections', () => {
    const emitter = source();
    if (emitter.kind !== 'emitter') throw new Error('Missing emitter fixture');
    const result = traceExperiment(scene([{ ...emitter, rays: 3, aperture: 40 }, detector()]));
    const reading = measureDetector(result, { id: 'd1' });
    expect(reading.count).toBe(3);
    expect(reading.power).toBeCloseTo(1, 10);
    expect(reading.centroid).toBeCloseTo(0, 10);
    expect(reading.rmsWidth).toBeCloseTo(Math.sqrt(800 / 3), 8);
    expect(result.energy.detected).toBeCloseTo(1, 10);
    const missed = traceExperiment(scene([source(), detector(800, 400, 20)]));
    expect(measureDetector(missed, { id: 'd1' })).toMatchObject({ power: 0, count: 0, centroid: null, rmsWidth: null });
    expect(missed.energy.escaped).toBe(1);
  });

  for (const [surface, x, expectedPower] of [['exit', 450, 0.9499196701], ['entrance', 350, 1]] as const) {
    test(`coincident ${surface} detectors intercept the incident ray independently of refractor ordering`, () => {
      const screen = detector(x, 300, 100);
      const orders = [[source(), boundaryBlock, screen], [source(), screen, boundaryBlock]];
      const results = orders.map((elements) => traceExperiment(scene(elements)));
      for (const result of results) {
        expect(result.energy.detected).toBeCloseTo(expectedPower, 9);
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].point.x).toBeCloseTo(x, 10);
        expect(result.interactions).toHaveLength(surface === 'exit' ? 1 : 0);
        expect(result.interactions.every((hit) => hit.point.x < x)).toBe(true);
        expect(accounted(result)).toBeCloseTo(1, 12);
      }
      expect(results[0].energy).toEqual(results[1].energy);
      expect(results[0].hits).toEqual(results[1].hits);
    });
  }

  test('outward boundary launches into air have no distance-dependent glass absorption', () => {
    for (const x of [800, 500]) {
      const result = traceExperiment(scene([source(450), boundaryBlock, detector(x)]));
      expect(result.energy.detected).toBe(1);
      expect(result.energy.absorbed).toBe(0);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].powerStart).toBe(result.segments[0].powerEnd);
      expect(result.interactions).toHaveLength(0);
      expect(accounted(result)).toBe(1);
    }
    const outward = rotate({ x: 1, y: 0 }, 35);
    const result = traceExperiment(scene([
      source(400 + 50 * outward.x, 300 + 50 * outward.y, 35),
      { ...boundaryBlock, rotation: 35 },
      { ...detector(400 + 250 * outward.x, 300 + 250 * outward.y), rotation: 125 },
    ]));
    expect(result.energy.detected).toBe(1);
    expect(result.energy.absorbed).toBe(0);
  });

  test('inward boundary launches retain glass attenuation and real exit Fresnel splitting', () => {
    const index = materialIndex('crown', 540);
    const reflectance = ((index - 1) / (index + 1)) ** 2;
    const result = traceExperiment(scene([source(450, 300, 180), boundaryBlock, detector(100)]));
    const bulkPower = Math.exp(-MATERIALS.crown.absorption * 100);
    expect(result.segments[0].end.x).toBeCloseTo(350, 10);
    expect(result.segments[0].powerEnd).toBeCloseTo(bulkPower, 12);
    expect(result.interactions[0]).toMatchObject({ n1: index, n2: 1, tir: false });
    expect(result.interactions[0].reflectance).toBeCloseTo(reflectance, 12);
    expect(result.hits[0].power).toBeCloseTo(bulkPower * (1 - reflectance), 12);
    expect(result.energy.absorbed).toBeGreaterThan(1 - bulkPower);
    expect(result.energy.detected).toBeLessThan(1);
    expect(accounted(result)).toBeCloseTo(1, 12);
    expect(result.branches).toBeLessThan(30);
    expect(result.segments.every((segment) => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 0.001)).toBe(true);

    const justInside = traceExperiment(scene([source(449.999), boundaryBlock, detector()]));
    expect(justInside.interactions[0]).toMatchObject({ n1: index, n2: 1 });
    expect(justInside.segments[0].powerEnd).toBeCloseTo(Math.exp(-MATERIALS.crown.absorption * 0.001), 12);
    expect(justInside.hits[0].power).toBeCloseTo((1 - reflectance) * Math.exp(-MATERIALS.crown.absorption * 0.001), 12);
    expect(justInside.energy.detected).toBeLessThan(0.97);
  });

  test('tangent boundary launches remain exterior on flat, rotated, triangular and curved surfaces', () => {
    const direction = rotate({ x: 0, y: 1 }, 35);
    const rotatedStart = rotate({ x: 50, y: 0 }, 35);
    const triangleStart = { x: 450, y: 300 - 50 / Math.sqrt(3) };
    const fixtures: OpticalElement[][] = [
      [source(450, 300, 90), boundaryBlock, { ...detector(450, 500, 100), rotation: 0 }],
      [source(350, 200), boundaryBlock, detector(700, 200, 100)],
      [
        source(400 + rotatedStart.x, 300 + rotatedStart.y, 125),
        { ...boundaryBlock, rotation: 35 },
        { ...detector(400 + rotatedStart.x + 200 * direction.x, 300 + rotatedStart.y + 200 * direction.y, 100), rotation: 35 },
      ],
      [
        source(triangleStart.x, triangleStart.y, 60),
        { id: 'p1', label: 'Tangent prism', kind: 'prism', x: 400, y: 300, rotation: 0, size: 200, material: 'crown' },
        { ...detector(triangleStart.x + 100, triangleStart.y + 100 * Math.sqrt(3), 100), rotation: 150 },
      ],
      [
        source(420, 300, 90),
        { id: 'l1', label: 'Tangent lens', kind: 'lens', x: 400, y: 300, rotation: 0, diameter: 200, thickness: 40, material: 'crown' },
        { ...detector(420, 500, 100), rotation: 0 },
      ],
    ];
    for (const elements of fixtures) {
      const result = traceExperiment(scene(elements));
      expect(result.energy.detected).toBeCloseTo(1, 12);
      expect(result.energy.absorbed).toBe(0);
      expect(result.energy.truncated).toBe(0);
      expect(result.hits).toHaveLength(1);
      expect(result.interactions.every((hit) => hit.n1 === 1 && hit.n2 === 1 && hit.reflectance === 0)).toBe(true);
      expect(result.branches).toBeLessThanOrEqual(3);
      expect(accounted(result)).toBeCloseTo(1, 12);
    }
  });

  test('overlapping refractors keep last-listed medium precedence at coincident and boundary launches', () => {
    const flint: Block = { ...boundaryBlock, id: 'b2', material: 'flint' };
    for (const media of [[boundaryBlock, flint], [flint, boundaryBlock]]) {
      const last = media[1].material;
      const index = materialIndex(last, 540);
      const reflectance = ((index - 1) / (index + 1)) ** 2;
      const onExit = traceExperiment(scene([source(), ...media, detector(450, 300, 100)]));
      expect(onExit.interactions[0].n2).toBe(index);
      expect(onExit.energy.detected).toBeCloseTo((1 - reflectance) * Math.exp(-MATERIALS[last].absorption * 100), 8);
      const inward = traceExperiment(scene([source(450, 300, 180), ...media, detector(400, 300, 100)]));
      expect(inward.energy.detected).toBeCloseTo(Math.exp(-MATERIALS[last].absorption * 50), 12);
      expect(inward.interactions).toHaveLength(0);
    }
    const outer: Block = { ...flint, width: 200, height: 300 };
    const tangentInsideOuter = traceExperiment(scene([source(450, 300, 90), outer, boundaryBlock, { ...detector(450, 350, 50), rotation: 0 }]));
    expect(tangentInsideOuter.energy.detected).toBeCloseTo(Math.exp(-MATERIALS.flint.absorption * 50), 12);
  });

  test('mirror energy, branch budgets and attenuation close the energy ledger', () => {
    const mirrors = presetScene('mirrors');
    const result = traceExperiment({ ...mirrors, elements: mirrors.elements.map((element) => element.kind === 'mirror' ? { ...element, reflectivity: 0.9 } : element) });
    expect(result.energy.detected).toBeCloseTo(0.81, 10);
    expect(result.energy.absorbed).toBeCloseTo(0.19, 10);
    for (const preset of PRESETS) {
      for (const limits of [{}, { maxDepth: 0 }, { maxBranches: 5 }, { minPower: 0.2 }]) {
        const traced = traceExperiment(preset.scene, limits);
        expect(accounted(traced)).toBeCloseTo(traced.energy.emitted, 9);
        expect(traced.branches).toBeLessThanOrEqual('maxBranches' in limits ? limits.maxBranches ?? TRACE_LIMITS.maxBranches : TRACE_LIMITS.maxBranches);
        expect(traced.segments.length).toBeLessThanOrEqual(traced.branches);
        expect(traced.segments.every((segment) => segment.depth <= (limits.maxDepth ?? TRACE_LIMITS.maxDepth))).toBe(true);
        expect(traced.segments.every((segment) => segment.powerEnd <= segment.powerStart && segment.powerEnd >= 0)).toBe(true);
      }
    }
    expect(traceExperiment(presetScene('dispersion')).energy.absorbed).toBeGreaterThan(0);
    expect(traceExperiment(mirrors, { maxDepth: 0 }).energy.truncated).toBeGreaterThan(0.9);
    expect(traceExperiment(presetScene('dispersion'), { maxDepth: 0 }).interactions).toHaveLength(0);
    expect(() => traceExperiment(mirrors, { maxBranches: Infinity })).toThrow('Invalid trace limits');
  });

  test('a multi-event drag is one undo edit; cancel and branching histories are exact', () => {
    const initial = presetScene('dispersion');
    let history = beginEdit(createHistory(initial));
    for (let index = 1; index <= 30; index += 1) {
      history = changeScene(history, replaceElement(history.present, { ...history.present.elements[1], x: 470 + index }));
    }
    expect(history.past).toHaveLength(0);
    history = finishEdit(history);
    expect(history.past).toHaveLength(1);
    const after = history.present;
    expect(undo(history).present).toEqual(initial);
    expect(redo(undo(history)).present).toEqual(after);
    expect(cancelEdit(changeScene(beginEdit(history), initial)).present).toEqual(after);
    expect(changeScene(undo(history), { ...initial, title: 'New branch' }).future).toHaveLength(0);
    expect(finishEdit(beginEdit(history)).past).toHaveLength(1);
  });

  test('a perfect mirror trap stops at the path limit and branching glass stops at the queue budget', () => {
    const mirror = { id: 'm1', label: 'Mirror', kind: 'mirror' as const, x: 400, y: 300, rotation: 90, length: 400, reflectivity: 1 };
    const trap = traceExperiment(scene([source(500), mirror, { ...mirror, id: 'm2', x: 600 }]), { minPower: 0 });
    expect(trap.segments).toHaveLength(TRACE_LIMITS.maxDepth + 1);
    expect(trap.energy.truncated).toBeCloseTo(1, 12);
    expect(trap.energy.escaped).toBe(0);
    expect(trap.energy.absorbed).toBe(0);
    const glass = { ...createElement('block', 'b1'), rotation: 0 };
    const branching = traceExperiment(scene([source(), glass]), { maxBranches: 6, maxDepth: 64, minPower: 0 });
    expect(branching.branches).toBe(6);
    expect(branching.energy.truncated).toBeGreaterThan(0);
    expect(accounted(branching)).toBeCloseTo(1, 10);
  });

  test('a scanning detector selects real wavelengths and widening it trades selection for collection', () => {
    const experiment = presetScene('spectrometer');
    const red = measureDetector(traceExperiment(experiment), { id: 'detector-1' });
    expect(red.spectrum.filter((band) => band.power > 0).map((band) => band.wavelength)).toEqual([660]);
    const blueScene = { ...experiment, elements: experiment.elements.map((element) => element.kind === 'detector' ? { ...element, y: 531 } : element) };
    const blue = measureDetector(traceExperiment(blueScene), { id: 'detector-1' });
    expect(blue.spectrum.filter((band) => band.power > 0).map((band) => band.wavelength)).toEqual([420]);
    const broad = measureDetector(traceExperiment({ ...experiment, elements: experiment.elements.map((element) => element.kind === 'detector' ? { ...element, length: 200 } : element) }), { id: 'detector-1' });
    expect(broad.spectrum.filter((band) => band.power > 0)).toHaveLength(7);
    expect(broad.power).toBeGreaterThan(red.power + blue.power);
  });

  test('JSON and SVG round trips keep geometry, notes, and safe editable labels', () => {
    const initial = { ...presetScene('dispersion'), title: '<script>alert("no")</script> & glass', notes: 'A real observation.\nSecond line.' };
    initial.elements[1] = { ...initial.elements[1], label: '<img src=x onerror=alert(1)>' };
    const parsed = parseExperiment(serializeExperiment(initial));
    expect(parsed).toEqual({ ok: true, scene: initial });
    const history = importIntoHistory(createHistory(presetScene('focus')), serializeExperiment(initial));
    expect(history.error).toBeNull();
    expect(history.history.present).toEqual(initial);
    expect(undo(history.history).present).toEqual(presetScene('focus'));
    const svg = exportSceneSvg(initial, traceExperiment(initial));
    expect(svg).toContain('<svg xmlns=');
    expect(svg).toContain('data-ray=');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('data-optic-id');
    expect(svg).toContain('<metadata>');
  });

  test('malformed, nonfinite, unbounded, and unknown input preserves valid history', () => {
    const valid = presetScene('dispersion');
    const history = createHistory(valid);
    const invalid: unknown[] = [
      null, { ...valid, version: 2 }, { ...valid, title: '' }, { ...valid, surprise: true },
      { ...valid, elements: [{ ...valid.elements[0], kind: 'hologram' }] },
      { ...valid, elements: [{ ...valid.elements[1], material: 'unobtainium' }] },
      { ...valid, elements: [{ ...valid.elements[0], x: null }] },
      { ...valid, elements: [{ ...valid.elements[0], x: 1001 }] },
      { ...valid, elements: [{ ...valid.elements[0], rays: 1.5 }] },
      { ...valid, elements: [valid.elements[0], valid.elements[0]] },
      { ...valid, elements: Array.from({ length: 25 }, (_, index) => ({ ...valid.elements[1], id: `p-${index}` })) },
      { ...valid, elements: Array.from({ length: 5 }, (_, index) => ({ ...valid.elements[0], id: `s-${index}` })) },
      { ...valid, elements: [{ ...createElement('lens', 'l1'), diameter: 50, thickness: 45 }] },
    ];
    for (const value of invalid) {
      const result = importIntoHistory(history, JSON.stringify(value));
      expect(result.error).toBeTruthy();
      expect(result.history).toBe(history);
    }
    expect(parseExperiment('{"version":')).toMatchObject({ ok: false });
    expect(parseExperiment(JSON.stringify(valid).replace('"x":125', '"x":1e309'))).toMatchObject({ ok: false });
    expect(parseExperiment(' '.repeat(200_001))).toMatchObject({ ok: false });
    expect(() => validateExperiment({ ...valid, elements: [{ ...valid.elements[0], x: NaN }] })).toThrow('finite');
  });

  test('empty unknown keys are rejected at experiment and element levels without changing any history', () => {
    const valid = presetScene('dispersion');
    let history = changeScene(createHistory(valid), { ...valid, title: 'Earlier edit' });
    history = undo(changeScene(history, { ...valid, title: 'Redo target' }));
    history = changeScene(beginEdit(history), { ...history.present, notes: 'Unfinished drag or edit' });
    const snapshot = JSON.stringify(history);
    const invalid = [
      { version: 1, title: 'Imported', notes: '', elements: [], '': 0 },
      { version: 1, title: 'Imported', notes: '', elements: [], '': 0, unsupportedSetting: true },
      { ...valid, elements: [{ ...valid.elements[0], '': 0 }] },
      { ...valid, elements: [{ ...valid.elements[0], '': 0, unsupportedSetting: true }] },
    ];
    for (const value of invalid) {
      const input = JSON.stringify(value);
      expect(parseExperiment(input)).toMatchObject({ ok: false });
      expect(() => validateExperiment(value)).toThrow('unknown field: ""');
      const result = importIntoHistory(history, input);
      expect(result.error).toContain('unknown field: ""');
      expect(result.history).toBe(history);
      expect(JSON.stringify(result.history)).toBe(snapshot);
    }
    expect(parseExperiment(serializeExperiment(history.present))).toEqual({ ok: true, scene: history.present });
  });
});

async function openLumen(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./projects/lumen/');
  await expect(page.locator('.project-lumen [data-bench]')).toBeVisible();
  await expect(page.locator('[data-power]')).toHaveAttribute('data-power', /[1-9]/);
  return errors;
}

test('Lumen browser: editable optics, measured change, keyboard and atomic drag undo', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1060 });
  const errors = await openLumen(page);
  const site = page.locator('.project-lumen');
  const initialPower = await site.locator('[data-power]').getAttribute('data-power');
  const initialSeparation = await site.locator('[data-separation]').getAttribute('data-separation');
  const initialRays = await site.locator('[data-bench]').innerHTML();
  await site.locator('[data-field="material"]').selectOption('crown');
  expect(await site.locator('[data-bench]').innerHTML()).not.toBe(initialRays);
  expect(await site.locator('[data-separation]').getAttribute('data-separation')).not.toBe(initialSeparation);
  await site.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await expect(site.locator('[data-field="material"]')).toHaveValue('flint');
  await expect(site.locator('[data-power]')).toHaveAttribute('data-power', initialPower ?? '');
  await expect(site.locator('[data-separation]')).toHaveAttribute('data-separation', initialSeparation ?? '');
  const box = await site.locator('[data-bench]').boundingBox();
  if (!box) throw new Error('Missing bench');
  const startX = box.x + box.width * 0.47;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 64, startY + 28, { steps: 12 });
  await page.mouse.up();
  expect(Number(await site.locator('[data-field="x"]').inputValue())).toBeGreaterThan(500);
  await site.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await expect(site.locator('[data-field="x"]')).toHaveValue('470');
  await expect(site.locator('[data-field="y"]')).toHaveValue('300');
  await site.locator('[data-optic-id="prism-1"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(site.locator('[data-field="x"]')).toHaveValue('472');
  await page.keyboard.press('Control+z');
  await expect(site.locator('[data-field="x"]')).toHaveValue('470');
  await site.locator('[data-field="size"]').fill('999');
  await site.locator('[data-field="size"]').press('Tab');
  await expect(site.locator('[data-edit-error]')).toContainText('last valid geometry is unchanged');
  await expect(site.locator('[data-power]')).toHaveAttribute('data-power', initialPower ?? '');
  await site.locator('[data-field="size"]').fill('250');
  await site.locator('[data-field="size"]').press('Tab');
  await expect(site.locator('[data-edit-error]')).toBeEmpty();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('lumen-desktop.png'), fullPage: true });
  console.log('Lumen desktop screenshot:', testInfo.outputPath('lumen-desktop.png'));
  expect(errors).toEqual([]);
});

test('Lumen browser: notebook, real SVG and JSON files, safe import and reversible rejection', async ({ page }) => {
  const errors = await openLumen(page);
  const site = page.locator('.project-lumen');
  await site.locator('[data-panel="notebook"]').click();
  await site.locator('[data-title]').fill('Prism & <light>');
  await site.locator('[data-title]').press('Tab');
  await site.locator('[data-action="record"]').click();
  await expect(site.locator('[data-notes]')).toHaveValue(/mW.*captured.*centroid/);
  const jsonEvent = page.waitForEvent('download');
  await site.locator('[data-action="save"]').click();
  const jsonDownload = await jsonEvent;
  const jsonPath = await jsonDownload.path();
  if (!jsonPath) throw new Error('No experiment download');
  const saved = await readFile(jsonPath, 'utf8');
  const parsed = parseExperiment(saved);
  expect(parsed.ok).toBe(true);
  const svgEvent = page.waitForEvent('download');
  await site.locator('[data-action="svg"]').click();
  const svgDownload = await svgEvent;
  const svgPath = await svgDownload.path();
  if (!svgPath) throw new Error('No SVG download');
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('Prism &amp; &lt;light&gt;');
  expect(await page.evaluate((markup) => new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('parsererror')?.textContent ?? null, svg)).toBeNull();
  await site.locator('[data-preset="focus"]').click();
  await expect(site.locator('[data-scene-title]')).toHaveText('The shape of a focus');
  await site.locator('[data-import]').setInputFiles({ name: 'experiment.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(site.locator('[data-scene-title]')).toHaveText('Prism & <light>');
  await expect(site.locator('[data-notes]')).toHaveValue(/mW.*captured/);
  const validPower = await site.locator('[data-power]').getAttribute('data-power');
  await site.locator('[data-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(saved.replace('"x": 125', '"x": 1e309')) });
  await expect(site.locator('[data-file-error]')).toContainText('finite');
  await expect(site.locator('[data-scene-title]')).toHaveText('Prism & <light>');
  await expect(site.locator('[data-power]')).toHaveAttribute('data-power', validPower ?? '');
  await site.locator('[data-action="undo"]').click();
  await expect(site.locator('[data-scene-title]')).toHaveText('The shape of a focus');
  await expect(site.locator('[data-preset="focus"]')).toHaveAttribute('aria-pressed', 'true');
  await site.locator('[data-action="redo"]').click();
  await expect(site.locator('[data-scene-title]')).toHaveText('Prism & <light>');
  expect(errors).toEqual([]);
});

test('Lumen browser: source, detector, add/remove and all four studies work without errors', async ({ page }) => {
  const errors = await openLumen(page);
  const site = page.locator('.project-lumen');
  await site.locator('[data-selection]').selectOption('source-1');
  await site.locator('[data-field="spectrum"]').selectOption('mono');
  await expect(site.locator('[data-band]')).toHaveCount(1);
  const greenGeometry = await site.locator('[data-bench] [data-ray="540"]').evaluateAll((rays) => rays.map((ray) => ray.getAttribute('d')));
  await site.locator('[data-field="wavelength"]').fill('620');
  await site.locator('[data-field="wavelength"]').press('Tab');
  await expect(site.locator('[data-band]')).toHaveAttribute('data-band', '620');
  expect(await site.locator('[data-bench] [data-ray="620"]').evaluateAll((rays) => rays.map((ray) => ray.getAttribute('d')))).not.toEqual(greenGeometry);
  const aimedGeometry = await site.locator('[data-bench] [data-ray="620"]').evaluateAll((rays) => rays.map((ray) => ray.getAttribute('d')));
  await site.locator('[data-field="rotation"]').fill('0');
  await site.locator('[data-field="rotation"]').press('Tab');
  expect(await site.locator('[data-bench] [data-ray="620"]').evaluateAll((rays) => rays.map((ray) => ray.getAttribute('d')))).not.toEqual(aimedGeometry);
  await site.locator('[data-preset="mirrors"]').click();
  expect(Number(await site.locator('[data-power]').getAttribute('data-power'))).toBeCloseTo(0.9216, 8);
  await site.locator('[data-selection]').selectOption('detector-1');
  await site.locator('[data-field="y"]').fill('100');
  await site.locator('[data-field="y"]').press('Tab');
  await expect(site.locator('[data-power]')).toHaveAttribute('data-power', '0');
  await expect(site.locator('.lumen-no-signal')).toContainText('No rays');
  await site.locator('[data-action="undo"]').click();
  expect(Number(await site.locator('[data-power]').getAttribute('data-power'))).toBeCloseTo(0.9216, 8);
  await site.locator('[data-add-kind]').selectOption('block');
  await site.locator('[data-action="add"]').click();
  await expect(site.locator('[data-optic-id]')).toHaveCount(5);
  await expect(site.locator('[data-field="width"]')).toBeVisible();
  await site.locator('[data-action="remove"]').click();
  await expect(site.locator('[data-optic-id]')).toHaveCount(4);
  for (const preset of PRESETS) {
    await site.locator(`[data-preset="${preset.id}"]`).click();
    await expect(site.locator('[data-scene-title]')).toHaveText(preset.scene.title);
    await expect(site.locator('[data-bench] path[data-ray]')).not.toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('Lumen browser: narrow screen fits and inspector remains keyboard-operable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openLumen(page);
  const site = page.locator('.project-lumen');
  for (const width of [320, 640, 780, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `Document fits at ${width}px`).toBe(width);
    const smallControls = await site.locator('button, input, select, textarea').evaluateAll((elements) => elements
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && parseFloat(getComputedStyle(element).fontSize) < 14)
      .map((element) => ({ label: element.getAttribute('aria-label') ?? element.textContent, fontSize: getComputedStyle(element).fontSize })));
    expect(smallControls, `Native controls remain readable at ${width}px`).toEqual([]);
    if (width === 320) {
      await page.screenshot({ path: testInfo.outputPath('lumen-320-reduced-motion.png'), fullPage: true });
      console.log('Lumen 320px screenshot:', testInfo.outputPath('lumen-320-reduced-motion.png'));
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bench = await site.locator('[data-bench]').boundingBox();
  if (!bench) throw new Error('Missing mobile bench');
  expect(bench.width).toBeGreaterThan(340);
  expect(bench.x + bench.width).toBeLessThanOrEqual(390);
  await site.locator('[data-selection]').selectOption('prism-1');
  const powerBeforeZoom = await site.locator('[data-power]').getAttribute('data-power');
  await site.locator('[data-zoom]').selectOption('2');
  await expect(site.locator('[data-bench]')).toHaveAttribute('viewBox', '220 150 500 300');
  await site.locator('[data-bench]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(site.locator('[data-bench]')).toHaveAttribute('viewBox', '240 150 500 300');
  await expect(site.locator('[data-power]')).toHaveAttribute('data-power', powerBeforeZoom ?? '');
  await site.locator('[data-bench]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('lumen-mobile-detail.png') });
  await site.locator('[data-zoom]').selectOption('1');
  await expect(site.locator('[data-bench]')).toHaveAttribute('viewBox', '0 0 1000 600');
  await site.locator('[data-field="rotation"]').fill('17');
  await site.locator('[data-field="rotation"]').press('Tab');
  await expect(site.locator('[data-field="rotation"]')).toHaveValue('17');
  await site.locator('[data-action="bench"]').click();
  await expect(site.locator('[data-bench]')).toBeFocused();
  await site.locator('[data-action="inspect"]').click();
  await expect(site.locator('[data-selection]')).toBeFocused();
  await site.locator('[data-action="undo"]').click();
  await expect(site.locator('[data-field="rotation"]')).toHaveValue('15');
  await site.locator('[data-panel="notebook"]').click();
  await expect(site.locator('[data-guide]')).toContainText('Change the glass');
  await site.locator('[data-panel="inspector"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('lumen-mobile.png'), fullPage: true });
  console.log('Lumen mobile screenshot:', testInfo.outputPath('lumen-mobile.png'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('Lumen browser: drag cancellation, rotation handles and escaped imported labels', async ({ page }) => {
  const errors = await openLumen(page);
  const site = page.locator('.project-lumen');
  const box = await site.locator('[data-bench]').boundingBox();
  if (!box) throw new Error('Missing bench');
  await page.mouse.move(box.x + box.width * 0.47, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(site.locator('[data-field="x"]')).toHaveValue('470');
  await expect(site.locator('[data-action="undo"]')).toBeDisabled();
  await site.locator('[data-zoom]').selectOption('2');
  const initialView = await site.locator('[data-bench]').getAttribute('viewBox');
  await site.locator('[data-bench]').scrollIntoViewIfNeeded();
  const panBox = await site.locator('[data-bench]').boundingBox();
  if (!panBox) throw new Error('Missing zoomed bench');
  await page.mouse.move(panBox.x + panBox.width * 0.1, panBox.y + panBox.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(panBox.x + panBox.width * 0.1 + 30, panBox.y + panBox.height * 0.9, { steps: 5 });
  await page.mouse.up();
  expect(await site.locator('[data-bench]').getAttribute('viewBox')).not.toBe(initialView);
  await expect(site.locator('[data-action="undo"]')).toBeDisabled();
  await site.locator('[data-zoom]').selectOption('1');
  await site.locator('[data-selection]').selectOption('source-1');
  await site.locator('[data-rotate="source-1"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(site.locator('[data-field="rotation"]')).toHaveValue('-14');
  await page.keyboard.press('Control+z');
  await expect(site.locator('[data-field="rotation"]')).toHaveValue('-15');
  const imported = presetScene('dispersion');
  imported.elements[0] = { ...imported.elements[0], label: '<img src=x onerror=alert(1)>' };
  await site.locator('[data-import]').setInputFiles({ name: 'labels.json', mimeType: 'application/json', buffer: Buffer.from(serializeExperiment(imported)) });
  await expect(site.locator('[data-field="label"]')).toHaveValue('<img src=x onerror=alert(1)>');
  await expect(site.locator('img, script')).toHaveCount(0);
  await expect(site.locator('[data-optic-id="source-1"]')).toContainText('<img src=x onerror=alert(1)>');
  await page.goto('./');
  await expect(page.locator('.project-lumen')).toHaveCount(0);
  expect(errors).toEqual([]);
});
