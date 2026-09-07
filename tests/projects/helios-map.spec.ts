import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { earthAtlas } from '../../src/projects/helios/atlas';
import {
  constrainMapView, geographicToScreen, geographicToWorld, GEOGRAPHY_LIMITS, INITIAL_MAP_VIEW, loadGeography,
  MAX_MAP_ZOOM, panMapView, parseGeography, screenToGeographic, traceLandPaths, worldToGeographic, wrapLongitude, zoomMapView,
} from '../../src/projects/helios/geography';
import type { LandGeometry, LandPathSink, LandPosition, MapView } from '../../src/projects/helios/geography';
import { createObserverMap } from '../../src/projects/helios/map';
import { siteToMap } from '../../src/projects/helios/math';

const source = readFileSync(new URL('../../public/helios/ne_50m_land.geojson', import.meta.url));
const attribution = readFileSync(new URL('../../public/helios/attribution.txt', import.meta.url), 'utf8');
const ring = [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]];
const hole = [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]];
const collection = (coordinates: unknown, type = 'Polygon') => ({
  type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type, coordinates } }],
});
const area = (positions: readonly LandPosition[]) => positions.slice(1).reduce((sum, p, i) =>
  sum + positions[i][0] * p[1] - p[0] * positions[i][1], 0) / 2;
const fixture = () => parseGeography(collection([ring, hole]));

class RecordedPath implements LandPathSink {
  commands: { kind: string; x?: number; y?: number }[] = [];
  moveTo(x: number, y: number) { this.commands.push({ kind: 'M', x, y }); }
  lineTo(x: number, y: number) { this.commands.push({ kind: 'L', x, y }); }
  closePath() { this.commands.push({ kind: 'Z' }); }
}

function globals(values: Record<string, unknown>): () => void {
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return () => {
    for (const [key, descriptor] of Object.entries(originals))
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  };
}

function onLand(land: LandGeometry, latitude: number, longitude: number): boolean {
  const inRing = (r: readonly LandPosition[], x: number) => {
    let inside = false;
    for (let i = 1; i < r.length; i++) {
      const [ax, ay] = r[i - 1], [bx, by] = r[i];
      if ((ay > latitude) !== (by > latitude) && x < (bx - ax) * (latitude - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  };
  return land.polygons.some(p => [-360, 0, 360].some(offset =>
    inRing(p.rings[0], longitude + offset) && !p.rings.slice(1).some(r => inRing(r, longitude + offset))));
}

test.describe('HELIOS offline geography validation', () => {
  test('the pinned public-domain 50m asset retains its detail, metadata, exact bytes, and provenance', () => {
    expect(source.length).toBe(1_636_166);
    const hash = createHash('sha256').update(source).digest('hex');
    expect(hash).toBe('e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b');
    expect(attribution).toContain(hash);
    for (const text of ['Made with Natural Earth', 'PUBLIC DOMAIN', 'v5.1.2', '1:50,000,000',
      'Tom Patterson', 'Nathaniel Vaughn Kelso', 'not\na surveyed', 'mean-radius', 'geodetic ellipsoid',
      'https://www.naturalearthdata.com/about/terms-of-use/',
      'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson'])
      expect(attribution).toContain(text);
    const land = parseGeography(JSON.parse(source.toString()));
    expect(land.polygons).toHaveLength(1421);
    expect(land.pointCount).toBe(60669);
    expect(land.ringCount).toBe(1422);
    expect(land.polygons.every(polygon => polygon.rings.every((r, index) =>
      r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] && area(r) * (index === 0 ? 1 : -1) > 0))).toBe(true);
    expect(land.polygons.every(polygon => polygon.rings.every(r => r.every(([longitude, latitude]) =>
      Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(latitude) <= 90)))).toBe(true);
  });

  test('source islands, continents, inland hole, poles, and ocean remain geographically credible', () => {
    const land = parseGeography(JSON.parse(source.toString()));
    for (const [latitude, longitude] of [[25, 20], [72, -40], [-25, 135], [-20, 47], [-43, 172], [65, -19], [19.6, -155.5], [-80, 0]])
      expect(onLand(land, latitude, longitude), `${latitude},${longitude} must be land`).toBe(true);
    for (const [latitude, longitude] of [[0, -140], [89, 0], [41, 51], [-40, -20]])
      expect(onLand(land, latitude, longitude), `${latitude},${longitude} must be water`).toBe(false);
  });

  test('Polygon/MultiPolygon parsing preserves holes, normalizes winding, and detaches from input arrays', () => {
    const input = collection([[ring, hole], [[[30, 0], [40, 0], [40, 10], [30, 0]]]], 'MultiPolygon');
    const land = parseGeography(input);
    expect(land.polygons).toHaveLength(2);
    expect(land.ringCount).toBe(3); expect(land.pointCount).toBe(14);
    expect(area(land.polygons[0].rings[0])).toBeGreaterThan(0);
    expect(area(land.polygons[0].rings[1])).toBeLessThan(0);
    expect(onLand(land, 0, 0)).toBe(false);
    expect(onLand(land, 5, 5)).toBe(true);
    expect(land.polygons[0].rings[0][0]).not.toBe(ring[0]);
  });

  test('non-GeoJSON, empty, unsupported geometry, and non-CRS84 data fail explicitly', () => {
    const wrong = [null, [], {}, { type: 'FeatureCollection', features: [] }, collection([ring], 'LineString'),
      { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null }] },
      { ...collection([ring]), crs: { type: 'name', properties: { name: 'EPSG:3857' } } }];
    for (const input of wrong) expect(() => parseGeography(input)).toThrow(/Invalid land geography/);
  });

  test('malformed/nonfinite/out-of-range positions, unclosed and degenerate rings are rejected', () => {
    for (const bad of [[], [0], [0, 0, 1], [NaN, 0], [Infinity, 0], [0, -Infinity], [181, 0], [0, 91], ['0', 0], null]) {
      expect(() => parseGeography(collection([[bad, ...ring.slice(1)]]))).toThrow();
    }
    for (const bad of [ring.slice(0, 3), ring.slice(0, 4), [[0, 0], [1, 0], [2, 0], [0, 0]],
      [[0, 0], [1, 0], [1, 0], [0, 1], [0, 0]]])
      expect(() => parseGeography(collection([bad]))).toThrow();
  });

  test('self-intersections, crossing/outside holes and nested/overlapping holes are rejected', () => {
    const badPolygons = [
      [[[0, 0], [5, 5], [0, 5], [5, 0], [0, 0]]],
      [ring, [[9, -2], [12, -2], [12, 2], [9, 2], [9, -2]]],
      [ring, [[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]]],
      [ring, hole, [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
      [ring, hole, [[1, -1], [3, -1], [3, 1], [1, 1], [1, -1]]],
    ];
    for (const polygon of badPolygons) expect(() => parseGeography(collection(polygon))).toThrow();
  });

  test('feature, polygon, ring, and point counts are bounded before expensive traversal', () => {
    const feature = collection([ring]).features[0];
    expect(() => parseGeography({ type: 'FeatureCollection', features: Array(GEOGRAPHY_LIMITS.features + 1).fill(feature) })).toThrow(/bounded/);
    expect(() => parseGeography(collection(Array(GEOGRAPHY_LIMITS.polygons + 1).fill([ring]), 'MultiPolygon'))).toThrow(/polygon count/);
    expect(() => parseGeography(collection(Array(GEOGRAPHY_LIMITS.rings + 1).fill(ring)))).toThrow(/ring count/);
    expect(() => parseGeography(collection([Array(GEOGRAPHY_LIMITS.points + 1).fill([0, 0])]))).toThrow(/point limit/);
  });

  test('uncut date-line shells and holes unwrap together without filling the other 340 degrees', () => {
    const land = parseGeography(collection([
      [[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]],
      [[175, -5], [-175, -5], [-175, 5], [175, 5], [175, -5]],
    ]));
    const shell = land.polygons[0].rings[0].map(p => p[0]);
    expect(Math.max(...shell) - Math.min(...shell)).toBe(20);
    expect(onLand(land, 0, 172)).toBe(true);
    expect(onLand(land, 0, -172)).toBe(true);
    expect(onLand(land, 0, 179)).toBe(false);
    expect(onLand(land, 0, -179)).toBe(false);
    expect(onLand(land, 0, 0)).toBe(false);
  });

  test('full-width polar caps survive while unsupported world-winding rings fail explicitly', () => {
    const cap = parseGeography(collection([[[-180, -70], [180, -70], [180, -90], [-180, -90], [-180, -70]]]));
    expect(onLand(cap, -89, 0)).toBe(true);
    expect(onLand(cap, -89, 179)).toBe(true);
    expect(onLand(cap, -60, 0)).toBe(false);
    expect(() => parseGeography(collection([[[-170, 80], [-60, 80], [60, 80], [170, 80], [-170, 80]]]))).toThrow(/antimeridian/);
  });
});

test.describe('HELIOS shared cartographic coordinates', () => {
  test('north, equator, poles, prime meridian and ±180 match the existing observer convention', () => {
    for (const latitude of [-90, -66.5, 0, 23.5, 90]) for (const longitude of [-180, -104.015, 0, 151.2093, 180]) {
      const point = geographicToWorld(latitude, longitude);
      expect(point).toEqual(siteToMap(latitude, longitude));
      const selected = worldToGeographic(point.x, point.y);
      expect(selected.latitude).toBeCloseTo(latitude, 10);
      expect(selected.longitude).toBeCloseTo(longitude, 10);
      const screen = geographicToScreen(latitude, longitude, INITIAL_MAP_VIEW, 400, 200);
      expect(screen.x).toBeCloseTo(point.x * 400, 10);
      expect(screen.y).toBeCloseTo(point.y * 200, 10);
    }
    expect(geographicToWorld(90, -180)).toEqual({ x: 0, y: 0 });
    expect(geographicToWorld(-90, 180)).toEqual({ x: 1, y: 1 });
  });

  test('atlas UVs agree with Earth shader normals and the vertically flipped CanvasTexture', () => {
    for (const latitude of [-90, -45, 0, 45, 90]) for (const longitude of [-179.9, -90, 0, 90, 179.9]) {
      const phi = latitude * Math.PI / 180, lambda = longitude * Math.PI / 180;
      const normal = { x: Math.cos(phi) * Math.cos(lambda), y: Math.sin(phi), z: -Math.cos(phi) * Math.sin(lambda) };
      const shader = { u: Math.atan2(-normal.z, normal.x) / (2 * Math.PI) + .5, v: Math.asin(normal.y) / Math.PI + .5 };
      const world = geographicToWorld(latitude, longitude);
      expect(shader.u).toBeCloseTo(world.x, 10);
      expect(shader.v).toBeCloseTo(1 - world.y, 10);
    }
  });

  test('zoomed and panned picking round trips across the date line and near the poles', () => {
    const views: MapView[] = [
      { ...INITIAL_MAP_VIEW }, { centerLongitude: 179, centerLatitude: 0, zoom: 4 },
      { centerLongitude: -179, centerLatitude: 67.5, zoom: 4 },
      { centerLongitude: 135, centerLatitude: -84.375, zoom: 16 },
    ];
    for (const view of views) for (const [width, height] of [[300, 200], [450, 210]]) {
      for (const x of [0, width * .2, width * .5, width * .9, width]) for (const y of [0, height / 2, height]) {
        const site = screenToGeographic(x, y, view, width, height);
        expect(Math.abs(site.latitude)).toBeLessThanOrEqual(90);
        expect(Math.abs(site.longitude)).toBeLessThanOrEqual(180);
        const pixel = geographicToScreen(site.latitude, site.longitude, view, width, height);
        expect(pixel.x).toBeCloseTo(x, 8); expect(pixel.y).toBeCloseTo(y, 8);
      }
    }
    expect(screenToGeographic(300, 100, views[1], 400, 200).longitude).toBeCloseTo(-158.5, 10);
  });

  test('pan follows the hand, wraps repeatedly, and cannot expose blank space beyond poles', () => {
    const view = { centerLongitude: 170, centerLatitude: 0, zoom: 2 };
    expect(panMapView(view, -40, 0, 400, 200).centerLongitude).toBe(-172);
    expect(panMapView(view, 0, 1000, 400, 200).centerLatitude).toBe(45);
    expect(panMapView(view, 0, -1000, 400, 200).centerLatitude).toBe(-45);
    expect(panMapView(view, 400 * 2 * 1000, 0, 400, 200).centerLongitude).toBe(170);
    expect(constrainMapView({ centerLatitude: 90, centerLongitude: 720, zoom: 1 })).toEqual(INITIAL_MAP_VIEW);
  });

  test('pointer-centered zoom preserves its geographic anchor and obeys finite zoom limits', () => {
    const view = { centerLongitude: 179, centerLatitude: 10, zoom: 2 };
    const before = screenToGeographic(280, 80, view, 400, 200);
    const zoomed = zoomMapView(view, 2, 280, 80, 400, 200);
    const after = screenToGeographic(280, 80, zoomed, 400, 200);
    expect(after.latitude).toBeCloseTo(before.latitude, 10);
    expect(after.longitude).toBeCloseTo(before.longitude, 10);
    expect(zoomMapView(view, 10000, 200, 100, 400, 200).zoom).toBe(MAX_MAP_ZOOM);
    expect(zoomMapView(view, .0001, 200, 100, 400, 200).zoom).toBe(1);
    expect(wrapLongitude(540)).toBe(180); expect(wrapLongitude(-540)).toBe(-180);
  });

  test('invalid coordinates, dimensions, transforms and pointer positions never silently become valid sites', () => {
    for (const [latitude, longitude] of [[NaN, 0], [0, Infinity], [91, 0], [0, 181]])
      expect(() => geographicToWorld(latitude, longitude)).toThrow();
    for (const [x, y] of [[NaN, 0], [0, -1], [0, 1.1]]) expect(() => worldToGeographic(x, y)).toThrow();
    expect(() => screenToGeographic(-1, 10, INITIAL_MAP_VIEW, 400, 200)).toThrow();
    expect(() => screenToGeographic(10, 201, INITIAL_MAP_VIEW, 400, 200)).toThrow();
    expect(() => geographicToScreen(0, 0, INITIAL_MAP_VIEW, 0, 200)).toThrow();
    expect(() => constrainMapView({ ...INITIAL_MAP_VIEW, zoom: 0 })).toThrow();
    expect(() => constrainMapView({ ...INITIAL_MAP_VIEW, centerLatitude: NaN })).toThrow();
    expect(() => panMapView(INITIAL_MAP_VIEW, Infinity, 0, 400, 200)).toThrow();
    expect(() => zoomMapView(INITIAL_MAP_VIEW, NaN, 200, 100, 400, 200)).toThrow();
  });

  test('atlas and picker paths retain exact projection and holes, but omit artificial seam coast strokes', () => {
    const land = fixture(), fill = new RecordedPath(), coast = new RecordedPath();
    traceLandPaths(land, fill, coast);
    expect(fill.commands.filter(c => c.kind === 'Z')).toHaveLength(2);
    expect(fill.commands[0]).toEqual({ kind: 'M', x: 170, y: 100 });
    const cap = parseGeography(collection([[[-180, -70], [180, -70], [180, -90], [-180, -90], [-180, -70]]]));
    const capFill = new RecordedPath(), capCoast = new RecordedPath();
    traceLandPaths(cap, capFill, capCoast);
    expect(capFill.commands.filter(c => c.kind === 'L')).toHaveLength(4);
    expect(capCoast.commands).toHaveLength(2);
    expect(capCoast.commands.every(c => c.y === 160)).toBe(true);
  });

  test('the canvas atlas is capped at 2048×1024 and actually uses the shared paths without invented terrain', () => {
    const fills: unknown[][] = [], strokes: unknown[] = [], transforms: number[][] = [];
    const context = {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      fillRect() {}, setTransform(...args: number[]) { transforms.push(args); }, resetTransform() {},
      fill(...args: unknown[]) { fills.push(args); }, stroke(path: unknown) { strokes.push(path); },
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const restore = globals({ document: { createElement: () => canvas }, Path2D: RecordedPath });
    try {
      const land = fixture(), texture = earthAtlas(land);
      expect(texture).toBe(canvas);
      expect([texture.width, texture.height]).toEqual([2048, 1024]);
      expect(fills).toHaveLength(3); expect(strokes).toHaveLength(3);
      expect(fills.every(args => args[1] === 'nonzero')).toBe(true);
      const expected = new RecordedPath(); traceLandPaths(land, expected, new RecordedPath());
      expect((fills[0][0] as RecordedPath).commands).toEqual(expected.commands);
      expect(transforms.map(t => t[4])).toEqual([-2048, 0, 2048]);
      expect(context.fillStyle).toBe('#699c89');
    } finally { restore(); }
  });
});

test.describe('HELIOS abortable static geography loading', () => {
  test('same-origin fetch receives the supplied signal and parses the validated local shape', async () => {
    const controller = new AbortController();
    const restore = globals({
      location: { href: 'https://example.test/projects/helios' },
      fetch: async (url: string, options: RequestInit) => {
        expect(url).toBe('/assets/land.geojson');
        expect(options).toMatchObject({ signal: controller.signal, mode: 'same-origin', credentials: 'same-origin', redirect: 'error' });
        return new Response(JSON.stringify(collection([ring, hole])));
      },
    });
    try { expect((await loadGeography('/assets/land.geojson', controller.signal)).ringCount).toBe(2); }
    finally { restore(); }
  });

  test('cross-origin, non-HTTP, credential-bearing URLs and HTTP errors are explicit failures', async () => {
    let requests = 0;
    const restore = globals({
      location: { href: 'https://example.test/helios/' },
      fetch: async () => { requests++; return new Response('missing', { status: 404 }); },
    });
    try {
      for (const url of ['https://elsewhere.test/land.json', '//elsewhere.test/land.json', 'data:application/json,{}', 'https://u:p@example.test/land'])
        await expect(loadGeography(url, new AbortController().signal)).rejects.toThrow(/same-origin/);
      expect(requests).toBe(0);
      await expect(loadGeography('/missing.geojson', new AbortController().signal)).rejects.toThrow(/HTTP 404/);
    } finally { restore(); }
  });

  test('malformed JSON, non-geographic JSON, invalid UTF-8, and declared/streamed byte limits are rejected', async () => {
    for (const response of [
      new Response('{ broken'), new Response('{}'),
      new Response(new Uint8Array([0xff, 0xfe])),
      new Response('{}', { headers: { 'content-length': String(GEOGRAPHY_LIMITS.bytes + 1) } }),
      new Response(new Uint8Array(GEOGRAPHY_LIMITS.bytes + 1)),
    ]) {
      const restore = globals({ fetch: async () => response });
      try { await expect(loadGeography('/land.geojson', new AbortController().signal)).rejects.toThrow(/Unable to load offline geography/); }
      finally { restore(); }
    }
  });

  test('pre-aborted and aborted-in-flight loads remain AbortErrors instead of fallback artwork', async () => {
    const before = new AbortController(); before.abort();
    await expect(loadGeography('/land.geojson', before.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    const restore = globals({
      fetch: async () => {
        controller.abort();
        return new Response(JSON.stringify(collection([ring])));
      },
    });
    try { await expect(loadGeography('/land.geojson', controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { restore(); }
  });
});

test('the observer-map module is Node-importable without a window or URL helper side effect', () => {
  expect(typeof createObserverMap).toBe('function');
  expect(typeof globalThis.window).toBe('undefined');
});

function mapHarness() {
  const controller = new AbortController(), chosen: number[][] = [], reports: string[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0, painted = 0, mounted = false;
  const context = {
    setTransform() {}, fillRect() { painted++; }, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {}, setLineDash() {}, fillText() {},
  };
  class Canvas extends EventTarget {
    width = 300; height = 150; dataset: Record<string, string> = {}; style: Record<string, string> = {};
    attributes: Record<string, string> = {}; captures = new Set<number>();
    rect = { width: 0, height: 0, left: 10, top: 20 };
    getContext() { return context; }
    getBoundingClientRect() { return this.rect; }
    setAttribute(key: string, value: string) { this.attributes[key] = value; }
    setPointerCapture(id: number) { this.captures.add(id); }
    hasPointerCapture(id: number) { return this.captures.has(id); }
    releasePointerCapture(id: number) { this.captures.delete(id); }
    focus() {}
    remove() { mounted = false; }
  }
  const observers: Observer[] = [];
  class Observer {
    disconnected = false;
    constructor(public callback: () => void) { observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const canvas = new Canvas();
  const win = Object.assign(new EventTarget(), {
    devicePixelRatio: 3,
    requestAnimationFrame(callback: FrameRequestCallback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  });
  const doc = { defaultView: win, createElement: () => canvas };
  const host = { ownerDocument: doc, append() { mounted = true; } };
  const restore = globals({ Path2D: RecordedPath, ResizeObserver: Observer });
  const map = createObserverMap({
    host: host as unknown as HTMLElement, land: fixture(), signal: controller.signal,
    onChoose: (latitude, longitude) => chosen.push([latitude, longitude]), report: message => reports.push(message),
  });
  const emit = (type: string, values: Record<string, unknown>) => {
    const event = Object.assign(new Event(type, { cancelable: true }), values);
    canvas.dispatchEvent(event);
    return event;
  };
  return {
    map, canvas, controller, chosen, reports, frames, observers,
    get painted() { return painted; }, get mounted() { return mounted; },
    resize(width: number, height: number) {
      canvas.rect.width = width; canvas.rect.height = height;
      for (const observer of observers) if (!observer.disconnected) observer.callback();
    },
    flush() {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(0));
    },
    pointer(type: string, x: number, y: number, pointerId = 1, isPrimary = true) {
      return emit(type, { clientX: x + canvas.rect.left, clientY: y + canvas.rect.top, pointerId, isPrimary, button: 0 });
    },
    key(key: string, shiftKey = false) { return emit('keydown', { key, shiftKey }); },
    cleanup() { map.destroy(); restore(); },
  };
}

test.describe('HELIOS observer-map event lifecycle (Node canvas double)', () => {
  test('initially hidden maps wait for reveal, resize at capped DPR, and expose copy-safe transforms', () => {
    const h = mapHarness();
    try {
      expect(h.painted).toBe(0); expect(h.frames.size).toBe(0);
      h.map.setSite({ name: 'Site', latitude: 45, longitude: 170, elevation: 100 });
      h.map.zoomIn();
      h.map.setSite({ name: 'Site', latitude: 45, longitude: 170, elevation: 100 });
      expect(h.map.getView().centerLongitude).toBe(170);
      h.resize(400, 200); h.flush();
      expect([h.canvas.width, h.canvas.height]).toEqual([800, 400]);
      expect(h.painted).toBeGreaterThan(0);
      expect(h.canvas.dataset).toMatchObject({ centerLongitude: '170', centerLatitude: '45', zoom: '2', latitude: '45', longitude: '170' });
      expect(h.canvas.attributes['aria-label']).toContain('Shift+arrows move 0.1 degree');
      const view = h.map.getView(); view.centerLongitude = 0;
      expect(h.map.getView().centerLongitude).toBe(170);
      h.resize(300, 160); h.flush();
      expect([h.canvas.width, h.canvas.height]).toEqual([600, 320]);
    } finally { h.cleanup(); }
  });

  test('only the initiating pointer can pan or choose, and transformed taps report exact coordinates', () => {
    const h = mapHarness();
    try {
      h.resize(400, 200); h.map.zoomIn();
      h.pointer('pointerdown', 200, 100);
      h.pointer('pointerdown', 50, 50, 2, false);
      h.pointer('pointermove', 0, 0, 2, false);
      expect(h.map.getView()).toEqual({ centerLongitude: 0, centerLatitude: 0, zoom: 2 });
      h.pointer('pointermove', 240, 120);
      expect(h.map.getView()).toEqual({ centerLongitude: -18, centerLatitude: 9, zoom: 2 });
      h.pointer('pointerup', 0, 0, 2, false);
      expect(h.canvas.captures.has(1)).toBe(true);
      h.pointer('pointerup', 240, 120);
      expect(h.chosen).toHaveLength(0); expect(h.canvas.captures.size).toBe(0);
      h.pointer('pointerdown', 300, 100); h.pointer('pointerup', 300, 100);
      expect(h.chosen).toEqual([[9, 27]]);
      expect(h.reports.at(-1)).toContain('9.0000°N, 27.0000°E');
      expect(h.canvas.dataset.latitude).toBe('9'); expect(h.canvas.dataset.longitude).toBe('27');
    } finally { h.cleanup(); }
  });

  test('keyboard selection clamps poles, wraps the date line, honors fine steps, and reports invalid external sites', () => {
    const h = mapHarness();
    try {
      h.resize(400, 200);
      h.map.setSite({ name: 'Pole', latitude: 90, longitude: 180, elevation: 0 });
      expect(h.key('ArrowUp').defaultPrevented).toBe(true);
      h.key('ArrowRight'); h.key('ArrowDown', true);
      expect(h.chosen).toEqual([[90, 180], [90, -179], [89.9, -179]]);
      h.map.setSite({ name: 'Invalid', latitude: NaN, longitude: 0, elevation: 0 });
      expect(h.reports.at(-1)).toContain('finite latitude');
      expect(h.canvas.dataset.latitude).toBe('89.9');
      h.key('+'); expect(h.map.getView().zoom).toBe(2);
      h.key('-'); expect(h.map.getView().zoom).toBe(1);
      h.key('+'); h.key('0'); expect(h.map.getView()).toEqual(INITIAL_MAP_VIEW);
    } finally { h.cleanup(); }
  });

  test('pointer cancellation, hidden resizing and abort release capture, listeners, buffers and pending redraws', () => {
    const h = mapHarness();
    try {
      h.resize(400, 200);
      h.pointer('pointerdown', 100, 100); h.pointer('pointercancel', 100, 100);
      h.pointer('pointerup', 100, 100);
      expect(h.chosen).toHaveLength(0); expect(h.canvas.captures.size).toBe(0);
      h.pointer('pointerdown', 100, 100); h.resize(0, 0);
      expect(h.canvas.captures.size).toBe(0);
      h.resize(400, 200); h.pointer('pointerdown', 100, 100);
      h.controller.abort();
      expect(h.canvas.captures.size).toBe(0);
      expect(h.frames.size).toBe(0);
      expect(h.mounted).toBe(false);
      expect(h.observers.every(observer => observer.disconnected)).toBe(true);
      expect([h.canvas.width, h.canvas.height]).toEqual([1, 1]);
      const view = h.map.getView();
      h.key('ArrowRight'); h.key('+'); h.pointer('pointerup', 100, 100);
      h.map.zoomIn(); h.map.reset(); h.flush();
      expect(h.map.getView()).toEqual(view);
      expect(h.chosen).toHaveLength(0);
      expect(() => h.map.destroy()).not.toThrow();
    } finally { h.cleanup(); }
  });
});
