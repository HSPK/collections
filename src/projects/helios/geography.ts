export type LandPosition = readonly [longitude: number, latitude: number];
export interface LandPolygon {
  /** Longitudes are unwrapped across the date line; holes share their shell's longitude interval. */
  readonly rings: readonly (readonly LandPosition[])[];
}
export interface LandGeometry {
  readonly polygons: readonly LandPolygon[];
  readonly pointCount: number;
  readonly ringCount: number;
}
export interface MapView { centerLongitude: number; centerLatitude: number; zoom: number }
export const INITIAL_MAP_VIEW: Readonly<MapView> = Object.freeze({ centerLongitude: 0, centerLatitude: 0, zoom: 1 });
export const MAX_MAP_ZOOM = 16;
export const GEOGRAPHY_LIMITS = Object.freeze({
  bytes: 8 * 1024 * 1024, features: 10_000, polygons: 20_000, rings: 25_000,
  points: 250_000, topologyChecks: 4_000_000,
});
const EPSILON = 1e-10;
const invalid = (message: string): never => { throw new TypeError(`Invalid land geography: ${message}`); };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    throw new RangeError('Coordinates require finite latitude −90…90° and longitude −180…180°.');
}

export function wrapLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) throw new RangeError('Longitude must be finite.');
  const result = ((longitude + 180) % 360 + 360) % 360 - 180;
  return result === -180 && longitude > 0 ? 180 : result;
}

/** Equirectangular / Plate carrée: north at the top, −180° left, +180° right. */
export function geographicToWorld(latitude: number, longitude: number) {
  validateCoordinates(latitude, longitude);
  return { x: (longitude + 180) / 360, y: (90 - latitude) / 180 };
}

export function worldToGeographic(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < 0 || y > 1)
    throw new RangeError('World coordinates require finite x and y in 0…1.');
  return { latitude: 90 - y * 180, longitude: wrapLongitude(x * 360 - 180) };
}

/** Clamp the view, not the observer: the visible map never extends beyond a pole. */
export function constrainMapView(view: MapView): MapView {
  if (![view.centerLatitude, view.centerLongitude, view.zoom].every(Number.isFinite) ||
      view.zoom < 1 || view.zoom > MAX_MAP_ZOOM)
    throw new RangeError(`Map view requires finite coordinates and zoom 1…${MAX_MAP_ZOOM}.`);
  const limit = 90 - 90 / view.zoom;
  return {
    centerLatitude: Math.max(-limit, Math.min(limit, view.centerLatitude)),
    centerLongitude: wrapLongitude(view.centerLongitude), zoom: view.zoom,
  };
}

function dimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new RangeError('Map dimensions must be finite and positive.');
}

export function geographicToScreen(latitude: number, longitude: number, view: MapView, width: number, height: number) {
  validateCoordinates(latitude, longitude);
  dimensions(width, height);
  const v = constrainMapView(view);
  return {
    x: width * (.5 + wrapLongitude(longitude - v.centerLongitude) * v.zoom / 360),
    y: height * (.5 + (v.centerLatitude - latitude) * v.zoom / 180),
  };
}

export function screenToGeographic(x: number, y: number, view: MapView, width: number, height: number) {
  dimensions(width, height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > width || y < 0 || y > height)
    throw new RangeError('Choose a point inside the map.');
  const v = constrainMapView(view);
  return {
    latitude: Math.max(-90, Math.min(90, v.centerLatitude + (.5 - y / height) * 180 / v.zoom)),
    longitude: wrapLongitude(v.centerLongitude + (x / width - .5) * 360 / v.zoom),
  };
}

export function panMapView(view: MapView, dx: number, dy: number, width: number, height: number): MapView {
  dimensions(width, height);
  if (![dx, dy].every(Number.isFinite)) throw new RangeError('Map pan must be finite.');
  const v = constrainMapView(view);
  return constrainMapView({
    ...v, centerLongitude: v.centerLongitude - dx * 360 / (width * v.zoom),
    centerLatitude: v.centerLatitude + dy * 180 / (height * v.zoom),
  });
}

export function zoomMapView(view: MapView, factor: number, x: number, y: number, width: number, height: number): MapView {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('Map zoom factor must be positive and finite.');
  const anchor = screenToGeographic(x, y, view, width, height);
  const zoom = Math.max(1, Math.min(MAX_MAP_ZOOM, view.zoom * factor));
  return constrainMapView({
    zoom, centerLongitude: anchor.longitude - (x / width - .5) * 360 / zoom,
    centerLatitude: anchor.latitude - (.5 - y / height) * 180 / zoom,
  });
}

function signedArea(ring: readonly LandPosition[]): number {
  let area = 0;
  // Translate before summing to avoid cancellation for very small islands.
  const [x, y] = ring[0];
  for (let i = 1; i < ring.length; i++)
    area += (ring[i - 1][0] - x) * (ring[i][1] - y) - (ring[i][0] - x) * (ring[i - 1][1] - y);
  return area / 2;
}

function inside(point: LandPosition, ring: readonly LandPosition[], check: () => void): boolean {
  let result = false;
  for (let i = 1; i < ring.length; i++) {
    check();
    const a = ring[i - 1], b = ring[i];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

interface Edge { a: LandPosition; b: LandPosition; ring: number; index: number; count: number; minX: number; maxX: number }
const cross = (a: LandPosition, b: LandPosition, c: LandPosition) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersects(a: Edge, b: Edge): boolean {
  if (Math.max(a.a[1], a.b[1]) < Math.min(b.a[1], b.b[1]) - EPSILON ||
      Math.max(b.a[1], b.b[1]) < Math.min(a.a[1], a.b[1]) - EPSILON) return false;
  const sign = (value: number) => Math.abs(value) < EPSILON ? 0 : Math.sign(value);
  return sign(cross(a.a, a.b, b.a)) * sign(cross(a.a, a.b, b.b)) <= 0 &&
    sign(cross(b.a, b.b, a.a)) * sign(cross(b.a, b.b, a.b)) <= 0;
}

function validateTopology(rings: LandPosition[][], check: () => void): void {
  const edges: Edge[] = [];
  for (const [r, ring] of rings.entries()) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    edges.push({ a, b, ring: r, index: i - 1, count: ring.length - 1, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]) });
  }
  edges.sort((a, b) => a.minX - b.minX);
  let active: Edge[] = [];
  for (const edge of edges) {
    active = active.filter(other => other.maxX >= edge.minX - EPSILON);
    for (const other of active) {
      check();
      const distance = Math.abs(edge.index - other.index);
      if (edge.ring === other.ring && (distance === 1 || distance === edge.count - 1)) continue;
      if (intersects(edge, other)) invalid('polygon rings intersect or touch themselves/one another.');
    }
    active.push(edge);
  }
  for (let i = 1; i < rings.length; i++) {
    if (!inside(rings[i][0], rings[0], check)) invalid('a hole lies outside its outer ring.');
    for (let j = 1; j < i; j++)
      if (inside(rings[i][0], rings[j], check) || inside(rings[j][0], rings[i], check))
        invalid('holes overlap or nest.');
  }
}

export function parseGeography(value: unknown): LandGeometry {
  if (!record(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features) ||
      value.features.length < 1 || value.features.length > GEOGRAPHY_LIMITS.features)
    return invalid('expected a nonempty, bounded GeoJSON FeatureCollection.');
  if (value.crs !== undefined && (!record(value.crs) || value.crs.type !== 'name' ||
      !record(value.crs.properties) || value.crs.properties.name !== 'urn:ogc:def:crs:OGC:1.3:CRS84'))
    return invalid('only longitude/latitude CRS84 coordinates are supported.');
  const polygons: LandPolygon[] = [];
  let pointCount = 0, ringCount = 0, topologyChecks = 0;
  const check = () => { if (++topologyChecks > GEOGRAPHY_LIMITS.topologyChecks) invalid('topology complexity limit exceeded.'); };
  for (const feature of value.features) {
    if (!record(feature) || feature.type !== 'Feature' || !record(feature.geometry))
      return invalid('each feature must contain a Polygon or MultiPolygon geometry.');
    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
      return invalid('only Polygon and MultiPolygon geometries are supported.');
    const source = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(source) || !source.length || source.length + polygons.length > GEOGRAPHY_LIMITS.polygons)
      return invalid('polygon count is empty or exceeds the limit.');
    for (const polygon of source) {
      if (!Array.isArray(polygon) || !polygon.length || polygon.length + ringCount > GEOGRAPHY_LIMITS.rings)
        return invalid('ring count is empty or exceeds the limit.');
      const rings: LandPosition[][] = [];
      let shellCenter = 0;
      for (const raw of polygon) {
        if (!Array.isArray(raw) || raw.length < 4 || raw.length + pointCount > GEOGRAPHY_LIMITS.points)
          return invalid('rings require at least four positions within the point limit.');
        const ring: LandPosition[] = [];
        let previousLongitude = 0, longitude = 0, min = Infinity, max = -Infinity;
        for (const [i, position] of raw.entries()) {
          if (!Array.isArray(position) || position.length !== 2 || !position.every(v => typeof v === 'number' && Number.isFinite(v)) ||
              Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90)
            return invalid('positions must be finite [longitude, latitude] pairs in range.');
          let delta = position[0] - previousLongitude;
          // Explicit −180/+180 full-width edges stay full-width (including polar caps).
          if (Math.abs(delta) > 180 && Math.abs(delta) < 360) delta -= Math.sign(delta) * 360;
          longitude = i === 0 ? position[0] : longitude + delta;
          if (i > 0 && longitude === ring[i - 1][0] && position[1] === ring[i - 1][1])
            return invalid('a ring contains a zero-length edge.');
          ring.push([longitude, position[1]]);
          previousLongitude = position[0];
          min = Math.min(min, longitude); max = Math.max(max, longitude);
        }
        const first = raw[0], last = raw[raw.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) return invalid('rings must be explicitly closed.');
        if (Math.abs(ring[0][0] - ring[ring.length - 1][0]) > EPSILON || max - min > 360 + EPSILON)
          return invalid('a ring winds around the world; split it at the antimeridian.');
        ring[ring.length - 1] = ring[0];
        const area = signedArea(ring);
        if (Math.abs(area) < 1e-12) return invalid('rings must enclose nonzero area.');
        if (rings.length === 0) shellCenter = (min + max) / 2;
        const shift = rings.length === 0 ? 360 * Math.round((wrapLongitude(shellCenter) - shellCenter) / 360) :
          360 * Math.round((shellCenter - (min + max) / 2) / 360);
        if (shift) for (let i = 0; i < ring.length; i++) ring[i] = [ring[i][0] + shift, ring[i][1]];
        if (rings.length === 0) shellCenter += shift;
        // A single nonzero canvas fill then preserves holes regardless of the source winding.
        if ((area > 0) !== (rings.length === 0)) ring.reverse();
        rings.push(ring); pointCount += ring.length; ringCount++;
      }
      validateTopology(rings, check);
      polygons.push({ rings });
    }
  }
  return { polygons, pointCount, ringCount };
}

export async function loadGeography(url: string, signal: AbortSignal): Promise<LandGeometry> {
  signal.throwIfAborted();
  try {
    const base = typeof location === 'undefined' ? undefined : location.href;
    const target = new URL(url, base ?? 'http://localhost/');
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
        (base && target.origin !== new URL(base).origin))
      throw new Error('The geography asset must use a same-origin HTTP(S) URL.');
    const response = await fetch(url, { signal, mode: 'same-origin', credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} while loading the offline land asset.`);
    }
    if (Number(response.headers.get('content-length')) > GEOGRAPHY_LIMITS.bytes) {
      await response.body?.cancel();
      throw new Error('The geography asset exceeds the byte limit.');
    }
    if (!response.body) throw new Error('The geography asset has no response body.');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks: string[] = [];
    let bytes = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > GEOGRAPHY_LIMITS.bytes) throw new Error('The geography asset exceeds the byte limit.');
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
    signal.throwIfAborted();
    return parseGeography(JSON.parse(chunks.join('')));
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(`Unable to load offline geography: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export interface LandPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Shared atlas/map paths in a 360 × 180 degree rectangle. Repeat at ±360 to cover the date line. */
export function traceLandPaths(land: LandGeometry, fill: LandPathSink, coast: LandPathSink): void {
  for (const polygon of land.polygons) for (const ring of polygon.rings) {
    fill.moveTo(ring[0][0] + 180, 90 - ring[0][1]);
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      fill.lineTo(b[0] + 180, 90 - b[1]);
      const seam = a[0] === b[0] && Math.abs(Math.abs(wrapLongitude(a[0])) - 180) < EPSILON;
      const pole = a[1] === b[1] && Math.abs(a[1]) === 90;
      if (!seam && !pole) {
        coast.moveTo(a[0] + 180, 90 - a[1]);
        coast.lineTo(b[0] + 180, 90 - b[1]);
      }
    }
    fill.closePath();
  }
}
