import { clamp } from '../../core/math';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 660;
export const GRID_SIZE = 20;
export const MAP_BOUNDS = { minX: 80, maxX: 920, minY: 140, maxY: 560 } as const;
export const LIMITS = { stations: 80, routes: 12, history: 60, name: 36, city: 48 } as const;

export const LABEL_SIDES = ['above', 'below', 'left', 'right', 'above-left', 'above-right', 'below-left', 'below-right'] as const;
export type LabelSide = typeof LABEL_SIDES[number];

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  label: LabelSide;
}

export interface Route {
  id: string;
  name: string;
  color: string;
  stops: string[];
}

export interface Network {
  version: 1;
  city: string;
  stations: Station[];
  routes: Route[];
}

export interface History {
  past: Network[];
  present: Network;
  future: Network[];
}

export interface NetworkHealth {
  components: number;
  connections: number;
  interchanges: number;
  unserved: number;
  reachable: number;
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NetworkError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function validName(value: unknown, label: string, maximum: number = LIMITS.name): string {
  if (typeof value !== 'string' || !value.trim()) throw new NetworkError(`${label} cannot be blank.`);
  const name = value.trim();
  if (name.length > maximum) throw new NetworkError(`${label} must be ${maximum} characters or fewer.`);
  // XML cannot represent control characters or unpaired UTF-16 surrogates.
  if (/[\u0000-\u001f\u007f-\u009f\ud800-\udfff\ufffe\uffff]/u.test(name)) {
    throw new NetworkError(`${label} must be a single line of printable text.`);
  }
  return name;
}

export function validColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.trim())) {
    throw new NetworkError('Use a six-digit route color, such as #e65d35.');
  }
  return value.trim().toLowerCase();
}

function validId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw new NetworkError(`${label} must use a lowercase letter followed by letters, numbers, or hyphens.`);
  }
  return value;
}

function validLabel(value: unknown): LabelSide {
  if (!LABEL_SIDES.some((side) => side === value)) {
    throw new NetworkError('Choose a valid station label position, such as above or above-left.');
  }
  return value as LabelSide;
}

function validCoordinate(value: unknown, axis: 'x' | 'y', strict = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new NetworkError(`Station ${axis.toUpperCase()} must be a finite number.`);
  }
  const [min, max] = axis === 'x'
    ? [MAP_BOUNDS.minX, MAP_BOUNDS.maxX]
    : [MAP_BOUNDS.minY, MAP_BOUNDS.maxY];
  if (strict && (value < min || value > max)) {
    throw new NetworkError(`Station ${axis.toUpperCase()} must be between ${min} and ${max}.`);
  }
  return Math.round(clamp(value, min, max) * 100) / 100;
}

export function validateNetwork(value: unknown): Network {
  const source = record(value, 'The project');
  if (source.version !== 1) throw new NetworkError('This project needs format version 1.');
  const city = validName(source.city, 'City name', LIMITS.city);
  if (!Array.isArray(source.stations) || source.stations.length > LIMITS.stations) {
    throw new NetworkError(`The project must contain a stations array with at most ${LIMITS.stations} stations.`);
  }
  const stationIds = new Set<string>();
  const stations = source.stations.map((value: unknown, index: number): Station => {
    const station = record(value, `Station ${index + 1}`);
    const id = validId(station.id, `Station ${index + 1} ID`);
    if (stationIds.has(id)) throw new NetworkError(`Duplicate station ID: ${id}.`);
    stationIds.add(id);
    return {
      id,
      name: validName(station.name, `Station ${index + 1} name`),
      x: validCoordinate(station.x, 'x', true),
      y: validCoordinate(station.y, 'y', true),
      label: validLabel(station.label),
    };
  });
  if (!Array.isArray(source.routes) || source.routes.length > LIMITS.routes) {
    throw new NetworkError(`The project must contain a routes array with at most ${LIMITS.routes} routes.`);
  }
  const routeIds = new Set<string>();
  const routes = source.routes.map((value: unknown, index: number): Route => {
    const route = record(value, `Route ${index + 1}`);
    const id = validId(route.id, `Route ${index + 1} ID`);
    if (routeIds.has(id)) throw new NetworkError(`Duplicate route ID: ${id}.`);
    routeIds.add(id);
    if (!Array.isArray(route.stops) || route.stops.length > LIMITS.stations) {
      throw new NetworkError(`Route ${index + 1} needs a stops array.`);
    }
    const seen = new Set<string>();
    const stops = route.stops.map((value: unknown): string => {
      const stop = validId(value, `Route ${index + 1} stop`);
      if (!stationIds.has(stop)) throw new NetworkError(`Route ${index + 1} refers to a missing station: ${stop}.`);
      if (seen.has(stop)) throw new NetworkError(`Route ${index + 1} repeats station ${stop}. Each stop can appear once.`);
      seen.add(stop);
      return stop;
    });
    return {
      id,
      name: validName(route.name, `Route ${index + 1} name`),
      color: validColor(route.color),
      stops,
    };
  });
  return { version: 1, city, stations, routes };
}

export function parseProject(text: string): Network {
  if (text.length > 200_000) throw new NetworkError('This project is too large. Choose a JSON file under 200 KB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new NetworkError('That file is not valid JSON. Open a Transit Weaver project file.');
  }
  return validateNetwork(value);
}

export function serializeProject(network: Network): string {
  return `${JSON.stringify(validateNetwork(network), null, 2)}\n`;
}

function requireStation(network: Network, id: string): Station {
  const station = network.stations.find((item) => item.id === id);
  if (!station) throw new NetworkError('That station no longer exists.');
  return station;
}

function requireRoute(network: Network, id: string): Route {
  const route = network.routes.find((item) => item.id === id);
  if (!route) throw new NetworkError('That route no longer exists.');
  return route;
}

function nextId(prefix: string, items: { id: string }[]): string {
  const ids = new Set(items.map((item) => item.id));
  let suffix = 1;
  while (ids.has(`${prefix}-${suffix}`)) suffix += 1;
  return `${prefix}-${suffix}`;
}

export function renameCity(network: Network, name: string): Network {
  return { ...network, city: validName(name, 'City name', LIMITS.city) };
}

export function updateStation(
  network: Network,
  id: string,
  changes: Partial<Pick<Station, 'name' | 'x' | 'y' | 'label'>>,
): Network {
  const previous = requireStation(network, id);
  const station: Station = {
    ...previous,
    ...(changes.name !== undefined ? { name: validName(changes.name, 'Station name') } : {}),
    ...(changes.x !== undefined ? { x: validCoordinate(changes.x, 'x', true) } : {}),
    ...(changes.y !== undefined ? { y: validCoordinate(changes.y, 'y', true) } : {}),
    ...(changes.label !== undefined ? { label: validLabel(changes.label) } : {}),
  };
  return { ...network, stations: network.stations.map((item) => item.id === id ? station : item) };
}

export function moveStation(network: Network, id: string, x: number, y: number, snap = false): Network {
  const round = (value: number) => snap ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
  return updateStation(network, id, {
    x: validCoordinate(round(x), 'x'),
    y: validCoordinate(round(y), 'y'),
  });
}

export function addStation(
  network: Network,
  position: { x: number; y: number },
  routeId = '',
  name = `New station ${network.stations.length + 1}`,
): Network {
  if (network.stations.length >= LIMITS.stations) {
    throw new NetworkError(`This map supports up to ${LIMITS.stations} stations. Remove a station before adding another.`);
  }
  if (routeId) requireRoute(network, routeId);
  const station: Station = {
    id: nextId('station', network.stations),
    name: validName(name, 'Station name'),
    x: validCoordinate(position.x, 'x', true),
    y: validCoordinate(position.y, 'y', true),
    label: 'above',
  };
  return {
    ...network,
    stations: [...network.stations, station],
    routes: network.routes.map((route) => route.id === routeId ? { ...route, stops: [...route.stops, station.id] } : route),
  };
}

export function removeStation(network: Network, id: string): Network {
  requireStation(network, id);
  return {
    ...network,
    stations: network.stations.filter((station) => station.id !== id),
    routes: network.routes.map((route) => ({ ...route, stops: route.stops.filter((stop) => stop !== id) })),
  };
}

export function addRoute(network: Network, name: string, color: string): Network {
  if (network.routes.length >= LIMITS.routes) {
    throw new NetworkError(`This map supports up to ${LIMITS.routes} routes. Remove a route before adding another.`);
  }
  return {
    ...network,
    routes: [...network.routes, {
      id: nextId('route', network.routes),
      name: validName(name, 'Route name'),
      color: validColor(color),
      stops: [],
    }],
  };
}

export function updateRoute(network: Network, id: string, changes: { name?: string; color?: string }): Network {
  const previous = requireRoute(network, id);
  const route = {
    ...previous,
    ...(changes.name !== undefined ? { name: validName(changes.name, 'Route name') } : {}),
    ...(changes.color !== undefined ? { color: validColor(changes.color) } : {}),
  };
  return { ...network, routes: network.routes.map((item) => item.id === id ? route : item) };
}

export function removeRoute(network: Network, id: string): Network {
  requireRoute(network, id);
  return { ...network, routes: network.routes.filter((route) => route.id !== id) };
}

export function setRouteStops(network: Network, routeId: string, stops: string[]): Network {
  requireRoute(network, routeId);
  const knownIds = new Set(network.stations.map((station) => station.id));
  if (stops.some((id) => !knownIds.has(id))) throw new NetworkError('A route cannot include a missing station.');
  if (new Set(stops).size !== stops.length) throw new NetworkError('Each station can appear only once on a route.');
  return {
    ...network,
    routes: network.routes.map((route) => route.id === routeId ? { ...route, stops: [...stops] } : route),
  };
}

export function appendStop(network: Network, routeId: string, stationId: string): Network {
  requireStation(network, stationId);
  const route = requireRoute(network, routeId);
  return setRouteStops(network, routeId, [...route.stops, stationId]);
}

export function removeStop(network: Network, routeId: string, stationId: string): Network {
  const route = requireRoute(network, routeId);
  return setRouteStops(network, routeId, route.stops.filter((stop) => stop !== stationId));
}

export function reorderStop(network: Network, routeId: string, stationId: string, direction: -1 | 1): Network {
  const route = requireRoute(network, routeId);
  const index = route.stops.indexOf(stationId);
  if (index < 0) throw new NetworkError('That station is not on this route.');
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= route.stops.length) return network;
  const stops = [...route.stops];
  [stops[index], stops[nextIndex]] = [stops[nextIndex], stops[index]];
  return setRouteStops(network, routeId, stops);
}

export function routesAtStation(network: Network, stationId: string): Route[] {
  return network.routes.filter((route) => route.stops.includes(stationId));
}

export function suggestStationPosition(network: Network, routeId = ''): { x: number; y: number } {
  const route = network.routes.find((item) => item.id === routeId);
  const last = network.stations.find((station) => station.id === route?.stops.at(-1));
  const origin = last ?? { x: 500, y: 340 };
  const candidates = [
    { x: origin.x + 80, y: origin.y + 80 },
    { x: origin.x - 80, y: origin.y + 80 },
    { x: origin.x + 80, y: origin.y - 80 },
    { x: origin.x - 80, y: origin.y - 80 },
  ];
  for (let y = MAP_BOUNDS.minY; y <= MAP_BOUNDS.maxY; y += GRID_SIZE * 2) {
    for (let x = MAP_BOUNDS.minX; x <= MAP_BOUNDS.maxX; x += GRID_SIZE * 2) candidates.push({ x, y });
  }
  const point = candidates.find(({ x, y }) =>
    x >= MAP_BOUNDS.minX && x <= MAP_BOUNDS.maxX && y >= MAP_BOUNDS.minY && y <= MAP_BOUNDS.maxY
    && network.stations.every((station) => Math.hypot(station.x - x, station.y - y) >= 55));
  return point ?? { x: 500, y: 340 };
}

export function analyzeNetwork(network: Network, fromStationId?: string): NetworkHealth {
  const neighbors = new Map(network.stations.map((station) => [station.id, new Set<string>()]));
  const edges = new Set<string>();
  for (const route of network.routes) {
    for (let index = 1; index < route.stops.length; index += 1) {
      const a = route.stops[index - 1];
      const b = route.stops[index];
      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);
      edges.add([a, b].sort().join('/'));
    }
  }
  const visit = (start: string): Set<string> => {
    const seen = new Set<string>();
    const pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id) || !neighbors.has(id)) continue;
      seen.add(id);
      for (const neighbor of neighbors.get(id)!) if (!seen.has(neighbor)) pending.push(neighbor);
    }
    return seen;
  };
  const visited = new Set<string>();
  let components = 0;
  for (const station of network.stations) {
    if (visited.has(station.id)) continue;
    components += 1;
    for (const id of visit(station.id)) visited.add(id);
  }
  return {
    components,
    connections: edges.size,
    interchanges: network.stations.filter((station) => routesAtStation(network, station.id).length > 1).length,
    unserved: network.stations.filter((station) => routesAtStation(network, station.id).length === 0).length,
    reachable: fromStationId ? visit(fromStationId).size : 0,
  };
}

export function createHistory(network: Network): History {
  return { past: [], present: validateNetwork(network), future: [] };
}

export function recordChange(history: History, network: Network): History {
  if (JSON.stringify(history.present) === JSON.stringify(network)) return history;
  return {
    past: [...history.past, history.present].slice(-LIMITS.history),
    present: network,
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, LIMITS.history),
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-LIMITS.history),
    present: next,
    future: history.future.slice(1),
  };
}
