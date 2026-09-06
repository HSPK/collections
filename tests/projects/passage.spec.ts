import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  distance, doorRect, endpointIssue, pickEndpoint, pointOf, portalIssue, portalPath, radiusOf,
  segmentClear, segmentRectDistance, segmentRectEntry, solidsOn, structuralSolids,
} from '../../src/projects/passage/world';
import type { Layout } from '../../src/projects/passage/world';
import { makeLayout, PROFILES } from '../../src/projects/passage/presets';
import { buildGraph, Search, solve } from '../../src/projects/passage/search';
import type { Graph } from '../../src/projects/passage/search';
import { buildRoute, poseAtTime, timeAtDistance } from '../../src/projects/passage/route';
import { deserialize, History, serialize, validateLayout } from '../../src/projects/passage/state';
import { planMarkup } from '../../src/projects/passage/plan';

function simpleLayout(): Layout {
  return { world: { name: 'Reference floor', width: 8, depth: 8, floors: [{ id: 'g', name: 'Ground', elevation: 0, color: '#d9bea2', voids: [] }],
    walls: [], doors: [], obstacles: [], rooms: [], portals: [] },
  start: { floor: 'g', x: 1.25, z: 4.25 }, end: { floor: 'g', x: 6.25, z: 4.25 }, profile: { ...PROFILES[0] }, objective: 'comfort' };
}
function referenceDistance(graph: Graph): number {
  const frontier = new Map([[graph.start, 0]]), visited = new Set<number>();
  while (frontier.size) {
    let current = -1, cost = Infinity;
    for (const [node, candidate] of frontier) if (candidate < cost) { current = node; cost = candidate; }
    if (current === graph.end) return cost;
    frontier.delete(current); visited.add(current);
    for (const edge of graph.neighbors(current)) if (!visited.has(edge.to)) {
      frontier.set(edge.to, Math.min(frontier.get(edge.to) ?? Infinity, cost + edge.cost));
    }
  }
  return Infinity;
}
test.describe('PASSAGE / shared spatial model', () => {
  test('all three presets validate and JSON roundtrips preserve geometry and portal references', () => {
    for (const preset of ['open', 'move', 'offline']) {
      const layout = makeLayout(preset);
      expect(validateLayout(layout)).toEqual(layout);
      expect(deserialize(serialize(layout))).toEqual(layout);
    }
  });
  test('every open-house route edge has continuous clearance and agrees with the world units', () => {
    const layout = makeLayout(), result = solve(layout), route = buildRoute(layout, result);
    expect(result.status).toBe('found');
    expect(route.origin).toEqual(pointOf(layout.world, layout.start));
    expect(route.destination).toEqual(pointOf(layout.world, layout.end));
    expect(route.distance).toBeGreaterThan(30);
    expect(route.distance).toBeLessThan(150);
    for (const edge of result.edges) {
      if (edge.portal) {
        expect(portalIssue(layout.world, edge.portal, layout.profile)).toBeNull();
        const canonical = portalPath(layout.world, edge.portal);
        expect(edge.path).toEqual(edge.path[0].y < edge.path[edge.path.length - 1].y ? canonical : [...canonical].reverse());
      } else {
        const node = result.nodes.find((node) => node.id === edge.to)!;
        expect(segmentClear(layout.world, solidsOn(layout.world, node.floor), edge.path[0], edge.path[1], radiusOf(layout.profile))).toBe(true);
      }
    }
    expect(route.distance).toBeCloseTo(route.points.slice(1).reduce((sum, point, index) => sum + distance(point, route.points[index]), 0), 9);
    expect(route.distance).toBeCloseTo(result.edges.reduce((sum, edge) => sum + edge.distance, 0), 9);
    expect(route.cost).toBeGreaterThanOrEqual(route.distance);
    expect(route.instructions.some((instruction) => instruction.text.includes('Entrance hall door'))).toBe(true);
  });
  test('A* matches an independent reference Dijkstra for both costs, obstacles, and mobility', () => {
    for (const objective of ['distance', 'comfort'] as const) {
      const layout = makeLayout('move'); layout.objective = objective;
      const result = solve(layout);
      expect(result.status).toBe('found');
      expect(result.cost).toBeCloseTo(referenceDistance(buildGraph(layout)), 8);
    }
    const layout = makeLayout(); layout.profile = { ...PROFILES[1] };
    expect(solve(layout).cost).toBeCloseTo(referenceDistance(buildGraph(layout)), 8);
  });
  test('door voids are real, closure blocks traversal, and width respects radius plus margin', () => {
    const layout = simpleLayout();
    layout.world.walls.push({ id: 'divider', floor: 'g', x: 3.8, z: 0, axis: 'z', length: 8, thickness: .4 });
    layout.world.doors.push({ id: 'door', wall: 'divider', name: 'Test door', offset: 4.25, width: 1.5, open: true });
    const opening = doorRect(layout.world.walls[0], layout.world.doors[0]);
    expect(structuralSolids(layout.world, 'g')).toHaveLength(2);
    expect(segmentClear(layout.world, structuralSolids(layout.world, 'g'), { x: 3, z: 4.25 }, { x: 5, z: 4.25 }, .3)).toBe(true);
    expect(opening.d).toBe(1.5);
    expect(solve(layout).status).toBe('found');
    layout.world.doors[0].open = false;
    expect(structuralSolids(layout.world, 'g')).toHaveLength(3);
    expect(solve(layout).status).toBe('unreachable');
    layout.world.doors[0].open = true; layout.world.doors[0].width = .5;
    expect(solve(layout).status).toBe('unreachable');
    layout.world.doors[0].width = .65;
    expect(solve(layout).status).toBe('found');
  });
  test('moving a real solid reroutes around its clearance envelope rather than only changing its drawing', () => {
    const history = new History(simpleLayout()), direct = solve(history.current);
    expect(direct.cost).toBeCloseTo(5, 9);
    history.edit((draft) => { draft.world.obstacles.push({ id: 'display', floor: 'g', name: 'Display', x: 3, z: 3.5, w: 1, d: 1.5, height: 1 }); });
    const detour = solve(history.current);
    expect(detour.status).toBe('found'); expect(detour.cost).toBeGreaterThan(direct.cost + .5);
    for (const edge of detour.edges) expect(segmentClear(history.current.world, solidsOn(history.current.world, 'g'), edge.path[0], edge.path[1], .3)).toBe(true);
    history.undo(); expect(solve(history.current).cost).toBeCloseTo(direct.cost, 9);
  });
  test('circle clearance is exact at corners and graph diagonals cannot cut blocked adjacent cells', () => {
    const rect = { x: 2, z: 2, w: 1, d: 1 };
    expect(segmentRectDistance({ x: 1, z: 1 }, { x: 1, z: 1 }, rect)).toBeCloseTo(Math.sqrt(2), 12);
    expect(segmentRectDistance({ x: 1, z: 2.5 }, { x: 4, z: 2.5 }, rect)).toBe(0);
    expect(segmentRectDistance({ x: 1, z: 1 }, { x: 4, z: 1 }, rect)).toBe(1);
    const layout = simpleLayout(); layout.profile.radius = .2; layout.profile.margin = 0;
    layout.world.obstacles = [{ id: 'corner', floor: 'g', name: 'Corner', x: 1.5, z: 1, w: .5, d: .5, height: 1 }];
    const graph = buildGraph(layout);
    const from = [...graph.nodes.values()].find((node) => node.point.x === 1.25 && node.point.z === 1.25)!;
    const to = [...graph.nodes.values()].find((node) => node.point.x === 1.75 && node.point.z === 1.75)!;
    expect(segmentClear(layout.world, solidsOn(layout.world, 'g'), from.point, to.point, .2)).toBe(false);
    expect(graph.neighbors(from.id).some((edge) => edge.to === to.id)).toBe(false);
    layout.world.obstacles[0] = { ...layout.world.obstacles[0], x: 1.7, z: 1.2, w: .1, d: .1 };
    const conservative = buildGraph(layout);
    expect(segmentClear(layout.world, solidsOn(layout.world, 'g'), from.point, to.point, .2)).toBe(true);
    expect(conservative.neighbors(from.id).some((edge) => edge.to === to.id)).toBe(false);
  });
  test('grid boundary centers do not wrap rows or turn out-of-building picks into valid endpoints', () => {
    const layout = simpleLayout(), graph = buildGraph(layout);
    expect(endpointIssue(layout.world, { floor: 'g', x: .25, z: 4.25 }, layout.profile)).toContain('clearance');
    expect(() => pickEndpoint(layout.world, 'g', -.01, 4, layout.profile)).toThrow();
    expect(() => pickEndpoint(layout.world, 'g', 8.01, 4, layout.profile)).toThrow();
    expect(() => pickEndpoint(layout.world, 'g', .26, 4.25, layout.profile)).toThrow();
    expect(pickEndpoint(layout.world, 'g', 1.1, 4.1, layout.profile)).toEqual({ floor: 'g', x: 1.25, z: 4.25 });
    for (const node of graph.nodes.values()) for (const edge of graph.neighbors(node.id)) {
      expect(Math.abs(graph.nodes.get(edge.to)!.column - node.column)).toBeLessThanOrEqual(1);
      expect(Math.abs(graph.nodes.get(edge.to)!.row - node.row)).toBeLessThanOrEqual(1);
    }
  });
  test('EPS-near occupied terminals return invalid without throwing for both start and destination', () => {
    for (const terminal of ['start', 'end'] as const) {
      const layout = simpleLayout(), center = layout[terminal].x;
      layout.world.obstacles.push({ id: 'clearance-edge', floor: 'g', name: 'Clearance edge',
        x: center - .5, z: 3.75, w: .19999995, d: 1, height: 1 });
      layout[terminal].x = center + .00000009;
      expect(segmentClear(layout.world, solidsOn(layout.world, 'g'), layout[terminal], layout[terminal], radiusOf(layout.profile))).toBe(true);
      expect(() => solve(layout)).not.toThrow();
      expect(endpointIssue(layout.world, layout[terminal], layout.profile)).toContain('clearance');
      const envelope = JSON.parse(serialize(layout)) as { layout: Layout };
      envelope.layout = layout;
      const imported = deserialize(JSON.stringify(envelope));
      expect(imported[terminal].x).toBe(center);
      for (const candidate of [layout, imported]) {
        const graph = buildGraph(candidate);
        expect(graph.nodes.has(terminal === 'start' ? graph.start : graph.end)).toBe(false);
        for (const heuristic of [true, false]) {
          const result = solve(candidate, { heuristic });
          expect(result).toMatchObject({ status: 'invalid', expanded: 0, nodes: [], edges: [] });
          expect(result.message).toContain('clearance');
        }
      }
    }
  });
  test('tolerance-accepted endpoints and landmarks persist as exact centers without snapping invalid coordinates', () => {
    const layout = simpleLayout(), expectedStart = { ...layout.start }, expectedEnd = { ...layout.end };
    layout.start.x += .00000009; layout.start.z -= .00000009;
    layout.end.x -= .00000009; layout.end.z += .00000009;
    layout.world.rooms.push({ id: 'landmark', floor: 'g', name: 'Reference room', short: 'REFERENCE',
      x: .5, z: .5, w: 7, d: 7, point: { ...layout.start } });
    const original = structuredClone(layout), valid = validateLayout(layout);
    expect(valid.start).toEqual(expectedStart); expect(valid.end).toEqual(expectedEnd);
    expect(valid.world.rooms[0].point).toEqual(expectedStart);
    expect(layout).toEqual(original);
    expect(deserialize(serialize(layout))).toEqual(valid);
    expect(new History(layout).current).toEqual(valid);
    const result = solve(layout), route = buildRoute(layout, result);
    expect(route.origin).toEqual(pointOf(layout.world, expectedStart));
    expect(route.destination).toEqual(pointOf(layout.world, expectedEnd));
    expect(pointOf(layout.world, layout.start)).toEqual(route.origin);
    expect(result.cost).toBeCloseTo(referenceDistance(buildGraph(layout)), 12);
    for (const terminal of ['start', 'end'] as const) for (const offset of [.00000011, -.00000011, .1, -.1]) {
      const invalid = simpleLayout();
      invalid[terminal].x += offset;
      expect(() => validateLayout(invalid)).toThrow(/grid centers/);
      expect(endpointIssue(invalid.world, invalid[terminal], invalid.profile)).toContain('grid-cell center');
      expect(solve(invalid)).toMatchObject({ status: 'invalid', expanded: 0, nodes: [], edges: [] });
    }
  });
  test('EPS-near portal terminals share exact grid nodes and cannot bypass landing clearance', () => {
    const layout = makeLayout(); layout.profile = { ...PROFILES[1] };
    for (const portal of layout.world.portals) if (portal.kind === 'lift') portal.x += .00000009;
    expect(deserialize(serialize(layout))).toEqual(layout);
    const result = solve(layout);
    expect(result.status).toBe('found');
    expect(result.cost).toBeCloseTo(referenceDistance(buildGraph(layout)), 10);
    result.edges.forEach((edge, index) => {
      expect(edge.path[0]).toEqual(result.nodes[index].point);
      expect(edge.path[edge.path.length - 1]).toEqual(result.nodes[index + 1].point);
    });
    const lowerLift = layout.world.portals.find((portal) => portal.id === 'lift-g-m')!;
    expect(portalPath(layout.world, lowerLift)[0]).toEqual({ x: 14.25, y: 0, z: 16.25 });
    layout.world.obstacles.push({ id: 'near-landing', floor: 'g', name: 'Landing clearance edge',
      x: 13.5, z: 15.75, w: .29999995, d: 1, height: 1 });
    const suppliedLanding = { x: lowerLift.x - 1, z: lowerLift.z + lowerLift.d / 2 };
    expect(segmentClear(layout.world, solidsOn(layout.world, 'g'), suppliedLanding, suppliedLanding, radiusOf(layout.profile))).toBe(true);
    expect(portalIssue(layout.world, lowerLift, layout.profile)).toContain('obstructed');
    expect(solve(layout)).toMatchObject({ status: 'unreachable', nodes: [], edges: [] });
  });
  test('door instructions follow directed crossings rather than door-array order', () => {
    const a = { x: 0, z: 0 }, b = { x: 10, z: 10 }, obliqueOpening = { x: 2, z: 2, w: .2, d: 4 };
    expect(segmentRectEntry(a, b, obliqueOpening)).toBeCloseTo(.2, 12);
    expect(segmentRectEntry(b, a, obliqueOpening)).toBeCloseTo(.78, 12);
    expect(segmentRectEntry({ x: 2.1, z: 2.1 }, b, obliqueOpening)).toBe(0);
    expect(segmentRectEntry({ x: 0, z: 7 }, { x: 10, z: 7 }, obliqueOpening)).toBeNull();
    for (const reversedTravel of [false, true]) for (const reversedDoors of [false, true]) {
      const layout = makeLayout();
      for (const door of layout.world.doors) if (['g-door-0', 'g-door-2'].includes(door.id)) door.width = 4;
      layout.start = { floor: 'g', x: 22.25, z: 6.75 }; layout.end = { floor: 'g', x: 3.25, z: 6.75 };
      if (reversedTravel) [layout.start, layout.end] = [layout.end, layout.start];
      if (reversedDoors) layout.world.doors.reverse();
      const order = layout.world.doors.map((door) => door.id), route = buildRoute(layout, solve(layout));
      expect(route.distance).toBeCloseTo(19, 12);
      expect(route.segments).toHaveLength(1);
      const expected = reversedTravel ? 'Cartography hall door, then Object gallery door' : 'Object gallery door, then Cartography hall door';
      expect(route.instructions[0].text).toContain(`Pass through ${expected}.`);
      expect(layout.world.doors.map((door) => door.id)).toEqual(order);
    }
    for (const reversedTravel of [false, true]) for (const reversedDoors of [false, true]) {
      const layout = simpleLayout();
      layout.world.walls = [
        { id: 'north-wall', floor: 'g', x: 0, z: 2, axis: 'x', length: 8, thickness: .2 },
        { id: 'south-wall', floor: 'g', x: 0, z: 5, axis: 'x', length: 8, thickness: .2 },
      ];
      layout.world.doors = [
        { id: 'north-door', wall: 'north-wall', name: 'North door', offset: 4.25, width: 2, open: true },
        { id: 'south-door', wall: 'south-wall', name: 'South door', offset: 4.25, width: 2, open: true },
      ];
      layout.start = { floor: 'g', x: 4.25, z: 6.25 }; layout.end = { floor: 'g', x: 4.25, z: 1.25 };
      if (reversedTravel) [layout.start, layout.end] = [layout.end, layout.start];
      if (reversedDoors) layout.world.doors.reverse();
      const route = buildRoute(layout, solve(layout));
      expect(route.distance).toBeCloseTo(5, 12);
      expect(route.segments).toHaveLength(1);
      const expected = reversedTravel ? 'North door, then South door' : 'South door, then North door';
      expect(route.instructions[0].text).toContain(`Pass through ${expected}.`);
    }
  });
  test('stairs follow the same switchback geometry while step-free routes use only working lifts', () => {
    const layout = makeLayout();
    layout.objective = 'distance';
    layout.start = { floor: 'g', x: 11.25, z: 6.75 }; layout.end = { floor: 'u', x: 13.25, z: 6.75 };
    const walking = solve(layout);
    expect(walking.status).toBe('found');
    expect(walking.edges.some((edge) => edge.portal?.kind === 'stairs')).toBe(true);
    layout.profile = { ...PROFILES[1] };
    const accessible = solve(layout);
    expect(accessible.status).toBe('found');
    expect(accessible.edges.filter((edge) => edge.portal).every((edge) => edge.portal!.kind === 'lift')).toBe(true);
    expect(accessible.edges.filter((edge) => edge.portal)).toHaveLength(2);
    layout.world.portals.find((portal) => portal.id === 'lift-m-u')!.open = false;
    expect(solve(layout).status).toBe('unreachable');
    layout.profile = { ...PROFILES[0] };
    expect(solve(layout).status).toBe('found');
    const stair = layout.world.portals.find((portal) => portal.id === 'stair-g-m')!;
    expect(portalPath(layout.world, stair).map((point) => point.y)).toEqual([0, 0, 2.1, 2.1, 4.2, 4.2]);
  });
  test('reserved shafts cannot be horizontal shortcuts and obstructed connector landings invalidate their links', () => {
    const layout = makeLayout(), portal = layout.world.portals.find((portal) => portal.id === 'lift-g-m')!;
    const path = portalPath(layout.world, portal);
    expect(endpointIssue(layout.world, { floor: 'g', x: 16.25, z: 16.25 }, layout.profile)).toContain('occupied');
    layout.world.obstacles.push({ id: 'landing-block', floor: 'g', name: 'Blocked landing', x: 14, z: 15.75, w: 1, d: 1, height: 1 });
    expect(portalIssue(layout.world, portal, layout.profile)).toContain('obstructed');
    layout.profile = { ...PROFILES[1] };
    expect(solve(layout).status).toBe('unreachable');
    expect(path[0].y).toBe(0); expect(path[path.length - 1].y).toBe(4.2);
  });
  test('middle-floor plans retain distinct up/down connector states and real dimensioned scale bars', () => {
    const layout = makeLayout();
    layout.world.portals.find((portal) => portal.id === 'stair-g-m')!.open = false;
    const plan = planMarkup(layout, 'm', null);
    expect(plan).toContain('North stair 00–01: closed');
    expect(plan).toContain('North stair 01–02: open');
    expect(plan).toContain('DOWN CLOSED');
    expect(plan).toContain('>UP<');
    expect(plan).toContain('v.35 h5 v-.35');
  });
  test('offline upper floor, invalid endpoints, and exhausted or cancelled searches never emit fallback routes', () => {
    const offline = solve(makeLayout('offline'));
    expect(offline.status).toBe('unreachable'); expect(offline.edges).toHaveLength(0);
    expect(offline.message).toContain('closed');
    const bad = makeLayout(); bad.end = { floor: 'u', x: 12.25, z: 10.25 };
    expect(solve(bad).status).toBe('invalid');
    expect(() => buildRoute(bad, solve(bad))).toThrow(/reachable/);
    const budget = solve(makeLayout(), { budget: 2 });
    expect(budget.status).toBe('budget'); expect(budget.expanded).toBe(2);
    const search = new Search(makeLayout()); search.step(1); search.cancel();
    expect(search.step(1000)?.status).toBe('cancelled');
    expect(search.result?.nodes).toHaveLength(0);
  });
  test('distance, weighted cost, time, lift waits, and walk poses are independent and numerically consistent', () => {
    const layout = makeLayout(); layout.profile = { ...PROFILES[1] };
    const result = solve(layout), route = buildRoute(layout, result);
    expect(route.cost).toBeCloseTo(route.distance + 16 * .2, 8);
    expect(route.segments.filter((segment) => segment.kind === 'wait')).toHaveLength(2);
    for (const wait of route.segments.filter((segment) => segment.kind === 'wait')) {
      expect(wait.duration).toBe(8); expect(wait.distance).toBe(0);
      expect(poseAtTime(route, wait.startTime + 4).point).toEqual(wait.from);
      expect(poseAtTime(route, wait.startTime + 4).kind).toBe('wait');
    }
    for (const segment of route.segments.filter((segment) => segment.distance > 0)) {
      const middle = poseAtTime(route, segment.startTime + segment.duration / 2);
      expect(distance(segment.from, middle.point)).toBeCloseTo(segment.distance / 2, 8);
      expect(middle.distance).toBeCloseTo(segment.startDistance + segment.distance / 2, 8);
    }
    expect(poseAtTime(route, 0).point).toEqual(route.origin);
    expect(poseAtTime(route, route.duration + 10).point).toEqual(route.destination);
    expect(poseAtTime(route, route.duration).kind).toBe('arrive');
    expect(route.duration).toBeCloseTo(route.segments.reduce((sum, segment) => sum + segment.duration, 0), 8);
    for (let d = .1; d < route.distance; d += .7) expect(poseAtTime(route, timeAtDistance(route, d)).distance).toBeCloseTo(d, 8);
    expect(() => poseAtTime(route, NaN)).toThrow(/finite/);
  });
  test('a zero-length journey is a completed arrival, not an error or a division by zero', () => {
    const layout = makeLayout(); layout.end = { ...layout.start };
    const route = buildRoute(layout, solve(layout));
    expect(route.distance).toBe(0); expect(route.duration).toBe(0);
    expect(poseAtTime(route, 0).kind).toBe('arrive');
    expect(route.instructions).toHaveLength(1);
  });
  test('history is immutable and reversible; invalid transactions and imports do not overwrite it', () => {
    const layout = makeLayout(), history = new History(layout);
    history.edit((draft) => { draft.world.doors[0].open = false; draft.world.obstacles[0].x = 2; });
    expect(history.current.world.doors[0].open).toBe(false);
    expect(layout.world.doors[0].open).toBe(true);
    history.undo(); expect(history.current).toEqual(layout);
    history.redo(); expect(history.current.world.obstacles[0].x).toBe(2);
    const before = history.current;
    expect(() => history.edit((draft) => { draft.world.doors[0].wall = 'missing'; })).toThrow(/missing wall/);
    expect(history.current).toBe(before);
    history.undo(); history.edit((draft) => { draft.world.doors[1].open = false; });
    expect(history.canRedo).toBe(false);
  });
  test('imports reject bounds, unknown refs, overlapping doors, bad portals, oversized arrays, and malicious text safely', () => {
    const check = (change: (draft: Layout) => void, message: RegExp) => {
      const draft = makeLayout(); change(draft); expect(() => validateLayout(draft)).toThrow(message);
    };
    check((draft) => { draft.world.obstacles[0].w = 100; }, /finite number/);
    check((draft) => { draft.world.obstacles[0].x = NaN; }, /finite number/);
    check((draft) => { draft.world.doors[0].wall = 'unknown'; }, /missing wall/);
    check((draft) => { draft.world.portals[0].to = 'u'; }, /adjacent/);
    check((draft) => { draft.world.portals[0].x += .1; }, /grid centers/);
    check((draft) => { draft.world.portals[0].width = 2.5; }, /two clear flights/);
    check((draft) => { draft.world.doors[1].offset = draft.world.doors[0].offset; }, /overlap/);
    check((draft) => { draft.world.floors[1].id = 'g'; }, /Duplicate/);
    check((draft) => { draft.world.rooms[0].point.floor = 'u'; }, /own room/);
    check((draft) => { draft.world.obstacles = Array.from({ length: 81 }, (_, i) => ({ ...draft.world.obstacles[0], id: `object-${i}` })); }, /at most 80/);
    expect(() => deserialize('{')).toThrow(/valid JSON/);
    expect(() => deserialize(' '.repeat(400_001))).toThrow(/too large/);
    const serialized = JSON.parse(serialize(makeLayout())) as { schema: string; layout: Layout };
    serialized.schema = 'passage/9';
    expect(() => deserialize(JSON.stringify(serialized))).toThrow(/v1/);
    const labels = makeLayout(); labels.world.rooms[0].name = '<img src=x onerror=alert(1)>';
    const markup = planMarkup(deserialize(serialize(labels)), 'g', null);
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img');
  });
});

const root = '.project-passage';
async function ready(page: Page) {
  await expect(page.locator(root)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(page.locator(root)).not.toHaveAttribute('data-route-status', 'searching', { timeout: 60_000 });
}
async function open(page: Page) {
  await page.goto('./projects/passage/');
  await ready(page);
}
async function panel(page: Page, name: string) {
  await page.locator(`[data-passage-pane="${name}"]`).click();
}
test.describe('PASSAGE / browser workbench', () => {
  test.setTimeout(90_000);
  test('desktop atlas is ready, route is real, and explicit walking stops on a door edit without losing focus', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await expect(page.locator('[data-passage-space] canvas')).toBeVisible();
    await expect(page.locator('[data-passage-plan] svg')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('passage-desktop.png'), fullPage: true });
    await page.locator('[data-passage-walk]').click();
    await expect(page.locator(root)).toHaveAttribute('data-walk-state', 'walking');
    await expect.poll(async () => Number(await page.locator(root).getAttribute('data-walk-time'))).toBeGreaterThan(.1);
    await panel(page, 'edit');
    const door = page.locator('[data-passage-door="g-door-1"]');
    await door.uncheck(); await ready(page);
    await expect(door).toBeFocused();
    await expect(page.locator(root)).toHaveAttribute('data-walk-state', 'paused');
    await expect(page.locator(root)).toHaveAttribute('data-walk-time', '0.000');
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'unreachable');
    await page.locator('[data-passage-undo]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    expect(errors).toEqual([]);
  });
  test('step-free rerouting genuinely depends on lifts and connectors can be reversibly restored', async ({ page }, testInfo) => {
    await open(page);
    await page.locator('[data-passage-profile]').selectOption('step-free'); await ready(page);
    await panel(page, 'route');
    await page.locator('.passage-directions summary').click();
    await expect(page.locator('[data-passage-instructions]')).toContainText('South lift');
    await expect(page.locator('[data-passage-instructions]')).not.toContainText('Take North stair');
    await panel(page, 'edit');
    await page.locator('[data-passage-portal="lift-m-u"]').uncheck(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'unreachable');
    await expect(page.locator('[data-passage-status]')).toContainText('closed');
    await panel(page, 'route');
    await expect(page.locator('[data-passage-walk]')).toBeDisabled();
    await page.locator('[data-passage-open-portals]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await page.locator('[data-passage-profile]').selectOption('walker'); await ready(page);
    await panel(page, 'edit');
    await page.locator('[data-passage-portal="lift-g-m"]').uncheck(); await ready(page);
    await page.locator('[data-passage-portal="lift-m-u"]').uncheck(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await panel(page, 'route');
    await expect(page.locator('[data-passage-instructions]')).toContainText('Take North stair');
    await page.locator('[data-passage-space] canvas').focus();
    for (let step = 0; step < 18; step++) await page.keyboard.press('ArrowRight');
    await page.screenshot({ path: testInfo.outputPath('passage-stairs.png'), fullPage: true });
  });
  test('solid geometry changes invalidate endpoints; undo/redo and local snapshots preserve actual dimensions', async ({ page }) => {
    await open(page); await page.locator('[data-passage-save]').click(); await panel(page, 'edit');
    await page.locator('[data-passage-object]').selectOption('g-shelf-b');
    for (const [name, value] of [['x', '2'], ['z', '14'], ['w', '4'], ['d', '2']]) await page.locator(`[data-passage-object-${name}]`).fill(value);
    await page.locator('[data-passage-apply-object]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'invalid');
    await expect(page.locator('[data-passage-status]')).toContainText('endpoint');
    await page.locator('[data-passage-undo]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await page.locator('[data-passage-redo]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'invalid');
    await page.locator('[data-passage-restore]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await expect(page.locator('[data-passage-object-z]')).toHaveValue('17');
  });
  test('distance scrubbing and timed stepping follow route coordinates, including stationary lift waits', async ({ page }) => {
    await open(page); await page.locator('[data-passage-profile]').selectOption('step-free'); await ready(page);
    await panel(page, 'route'); await page.locator('.passage-directions summary').click();
    const firstLift = page.locator('[data-passage-instructions] button').filter({ hasText: 'Wait 8 s' }).first();
    await firstLift.click();
    await expect(page.locator(root)).toHaveAttribute('data-walk-kind', 'wait');
    const before = Number(await page.locator(root).getAttribute('data-walk-time'));
    const height = await page.locator(root).getAttribute('data-walk-y');
    await page.locator('[data-passage-step]').click();
    expect(Number(await page.locator(root).getAttribute('data-walk-time'))).toBeCloseTo(before + 1, 3);
    await expect(page.locator(root)).toHaveAttribute('data-walk-y', height!);
    await page.locator('[data-passage-scrub]').evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Missing range input');
      element.value = element.max; element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator(root)).toHaveAttribute('data-walk-kind', 'arrive');
    await expect(page.locator(root)).toHaveAttribute('data-walk-y', '8.400');
    await expect(page.locator('[data-passage-floor]')).toHaveValue('u');
  });
  test('JSON import/export and SVG export retain real openings; bad imports cannot replace a working layout', async ({ page }) => {
    await open(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-passage-export]').click();
    const download = await downloadPromise, path = await download.path();
    expect(path).not.toBeNull();
    const json = await readFile(path!, 'utf8');
    expect(deserialize(json)).toEqual(makeLayout());
    const bad = serialize(makeLayout()).replace('"wall": "g-wing-w"', '"wall": "missing"');
    await page.locator('[data-passage-file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
    await expect(page.locator('[data-passage-status]')).toContainText('missing wall');
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    await page.locator('[data-passage-preset]').selectOption('offline'); await ready(page);
    await page.locator('[data-passage-file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await ready(page); await expect(page.locator(root)).toHaveAttribute('data-route-status', 'found');
    const svgPromise = page.waitForEvent('download'); await page.locator('[data-passage-svg]').click();
    const svg = await svgPromise;
    const markup = await readFile((await svg.path())!, 'utf8');
    expect(markup).toContain('viewBox="-1 -1 28 22"');
    expect(markup).toContain('Entrance hall door: 1.80 m, open');
    expect(markup).toContain('polyline');
  });
  for (const width of [320, 375]) test(`mobile ${width}px panes, resized plan picking, keyboard alternative, and reduced-motion startup`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
    await expect(page.locator(root)).toHaveAttribute('data-walk-state', 'paused');
    await expect(page.locator(root)).toHaveAttribute('data-walk-time', '0.000');
    await page.screenshot({ path: testInfo.outputPath(`passage-mobile-${width}-space.png`), fullPage: true });
    await panel(page, 'plan');
    await expect(page.locator('[data-passage-plan]')).toBeVisible();
    await expect(page.locator('[data-passage-space]')).not.toBeVisible();
    await page.locator('[data-passage-interaction]').selectOption('start');
    const svg = page.locator('[data-passage-plan] svg');
    const target = await svg.evaluate((element) => {
      if (!(element instanceof SVGSVGElement)) throw new Error('Missing SVG');
      const matrix = element.getScreenCTM();
      if (!matrix) throw new Error('Missing plan transform');
      const point = new DOMPoint(4.25, 14.25).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
    await page.mouse.click(target.x, target.y); await ready(page);
    await expect(page.locator('[data-passage-start]')).toContainText('4.25, 14.25');
    await page.locator('[data-passage-zoom-in]').click();
    await page.locator('[data-passage-zoom-in]').click();
    await expect(page.locator('[data-passage-plan-zoom]')).toHaveText('2.3×');
    await page.setViewportSize({ width: width === 320 ? 375 : 320, height: 844 });
    await page.locator('[data-passage-plan]').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await ready(page);
    await expect(page.locator('[data-passage-start]')).toContainText('3.75, 15.25');
    await expect(page.locator('[data-passage-plan]')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`passage-mobile-${width}-plan.png`), fullPage: true });
    await panel(page, 'route'); await expect(page.locator('[data-passage-walk]')).toBeVisible();
    await panel(page, 'edit'); await expect(page.locator('[data-passage-apply-object]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const controlSizes = await page.locator(`${root} button, ${root} select, ${root} input`).evaluateAll((elements) =>
      elements.filter((element) => element.getClientRects().length > 0).map((element) => parseFloat(getComputedStyle(element).fontSize)));
    expect(Math.min(...controlSizes)).toBeGreaterThanOrEqual(14);
  });
  test('single-pointer plan ownership and cancellation cannot mutate a route; disposal stops jobs and allows remount', async ({ page }) => {
    await open(page); await panel(page, 'plan'); await page.locator('[data-passage-interaction]').selectOption('start');
    const revision = await page.locator(root).getAttribute('data-revision');
    await page.locator('[data-passage-plan]').evaluate((element) => {
      element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, isPrimary: true, clientX: 10, clientY: 10, bubbles: true }));
      element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, isPrimary: false, clientX: 100, clientY: 100, bubbles: true }));
      element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 11, isPrimary: true, bubbles: true }));
    });
    await expect(page.locator(root)).toHaveAttribute('data-revision', revision!);
    await page.locator('[data-passage-preset]').evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) throw new Error('Missing preset');
      element.value = 'offline'; element.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector<HTMLButtonElement>('[data-passage-cancel]')!.click();
    });
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'cancelled');
    await page.locator('[data-passage-recompute]').click(); await ready(page);
    await expect(page.locator(root)).toHaveAttribute('data-route-status', 'unreachable');
    const outcome = await page.evaluate(async () => {
      const path = '/src/projects/passage/index.ts';
      const module: typeof import('../../src/projects/passage/index') = await import(path);
      const container = document.createElement('div'), controls = document.createElement('div');
      document.body.append(container);
      const abort = new AbortController();
      const pending = module.mount({ container, controls, signal: abort.signal, reducedMotion: true, report: () => undefined });
      abort.abort();
      const instance = await pending;
      instance.destroy(); instance.destroy();
      const removed = container.childElementCount === 0;
      container.remove();
      return removed;
    });
    expect(outcome).toBe(true);
    await page.reload(); await ready(page);
    await expect(page.locator(root)).toHaveCount(1);
  });
  test('real 3D picking uses the selected floor and resized canvas bounds, with no idle rendering loop', async ({ page }) => {
    await open(page);
    await page.locator('[data-passage-file]').setInputFiles({ name: 'reference-floor.json', mimeType: 'application/json',
      buffer: Buffer.from(serialize(simpleLayout())) });
    await ready(page); await expect(page.locator('[data-passage-building-name]')).toHaveText('Reference floor');
    await page.locator('[data-passage-interaction]').selectOption('start');
    for (const width of [1024, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const canvas = page.locator('[data-passage-space] canvas');
      await canvas.scrollIntoViewIfNeeded();
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('3D canvas has no bounds');
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await ready(page);
      await expect(page.locator('[data-passage-start]')).toContainText('3.25, 3.25');
    }
    const idleCalls = await page.evaluate(async () => {
      const original = window.requestAnimationFrame;
      let calls = 0;
      window.requestAnimationFrame = (callback) => { calls++; return original.call(window, callback); };
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      const settled = calls;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      window.requestAnimationFrame = original;
      return calls - settled;
    });
    expect(idleCalls).toBe(0);
  });
});
