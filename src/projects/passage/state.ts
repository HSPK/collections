import { canonicalEndpoint, EPS, floorOf, LayoutError, portalPath, RESOLUTION } from './world';
import type { Door, Endpoint, Floor, Layout, Obstacle, Portal, Profile, Rect, Room, Wall, World } from './world';
import type { Route } from './route';

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new LayoutError('Expected a JSON object.');
  return value as Record<string, unknown>;
};
const list = (value: unknown, label: string, maximum: number): unknown[] => {
  if (!Array.isArray(value) || value.length > maximum) throw new LayoutError(`${label} must be an array with at most ${maximum} entries.`);
  return value;
};
const text = (value: unknown, label: string, maximum = 80): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) throw new LayoutError(`${label} must be 1–${maximum} characters.`);
  return value;
};
const id = (value: unknown): string => {
  const result = text(value, 'Identifier', 40);
  if (!/^[a-z][a-z0-9-]*$/.test(result)) throw new LayoutError('Identifiers must use lowercase letters, numbers, and hyphens.');
  return result;
};
const number = (value: unknown, label: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new LayoutError(`${label} must be a finite number from ${min} to ${max}.`);
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new LayoutError('Open and mobility flags must be true or false.');
  return value;
};
function rect(value: Record<string, unknown>): Rect {
  return { x: number(value.x, 'X', 0, 40), z: number(value.z, 'Z', 0, 40),
    w: number(value.w, 'Width', 0.1, 40), d: number(value.d, 'Depth', 0.1, 40) };
}
function endpoint(value: unknown): Endpoint {
  const entry = object(value);
  return { floor: id(entry.floor), x: number(entry.x, 'Endpoint X', 0, 40), z: number(entry.z, 'Endpoint Z', 0, 40) };
}
function profile(value: unknown): Profile {
  const entry = object(value);
  return { id: id(entry.id), name: text(entry.name, 'Profile name'), radius: number(entry.radius, 'Body radius', 0.2, 0.75),
    margin: number(entry.margin, 'Clearance margin', 0, 0.2), stepFree: bool(entry.stepFree),
    speed: number(entry.speed, 'Walking speed', 0.3, 2), stairSpeed: number(entry.stairSpeed, 'Stair speed', 0.2, 1.2),
    stairPenalty: number(entry.stairPenalty, 'Stair penalty', 0, 3) };
}
export function validateLayout(value: unknown): Layout {
  const input = object(value), source = object(input.world);
  const floors = list(source.floors, 'Floors', 4).map((value): Floor => {
    const entry = object(value), color = text(entry.color, 'Floor color', 7);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new LayoutError('Floor colors must be six-digit hex.');
    return { id: id(entry.id), name: text(entry.name, 'Floor name'), elevation: number(entry.elevation, 'Floor elevation', 0, 18),
      color, voids: list(entry.voids, 'Floor openings', 8).map((value) => rect(object(value))) };
  });
  const walls = list(source.walls, 'Walls', 80).map((value): Wall => {
    const entry = object(value);
    if (entry.axis !== 'x' && entry.axis !== 'z') throw new LayoutError('Wall axis must be x or z.');
    return { id: id(entry.id), floor: id(entry.floor), x: number(entry.x, 'Wall X', 0, 40), z: number(entry.z, 'Wall Z', 0, 40),
      length: number(entry.length, 'Wall length', 0.1, 40), thickness: number(entry.thickness, 'Wall thickness', 0.1, 1), axis: entry.axis };
  });
  const doors = list(source.doors, 'Doors', 80).map((value): Door => {
    const entry = object(value);
    return { id: id(entry.id), wall: id(entry.wall), name: text(entry.name, 'Door name'),
      offset: number(entry.offset, 'Door offset', 0, 40), width: number(entry.width, 'Door width', 0.4, 4), open: bool(entry.open) };
  });
  const obstacles = list(source.obstacles, 'Objects', 80).map((value): Obstacle => {
    const entry = object(value);
    return { ...rect(entry), id: id(entry.id), floor: id(entry.floor), name: text(entry.name, 'Object name'), height: number(entry.height, 'Object height', 0.1, 2.8) };
  });
  const rooms = list(source.rooms, 'Rooms', 32).map((value): Room => {
    const entry = object(value);
    return { ...rect(entry), id: id(entry.id), floor: id(entry.floor), name: text(entry.name, 'Room name'), short: text(entry.short, 'Sign', 20), point: endpoint(entry.point) };
  });
  const portals = list(source.portals, 'Connectors', 12).map((value): Portal => {
    const entry = object(value);
    if (entry.kind !== 'lift' && entry.kind !== 'stairs') throw new LayoutError('Connector kind must be lift or stairs.');
    return { ...rect(entry), id: id(entry.id), name: text(entry.name, 'Connector name'), kind: entry.kind, from: id(entry.from), to: id(entry.to),
      width: number(entry.width, 'Connector width', 0.5, 3), open: bool(entry.open), wait: number(entry.wait, 'Lift wait', 0, 60) };
  });
  const world: World = { name: text(source.name, 'Building name'), width: number(source.width, 'Building width', 8, 40),
    depth: number(source.depth, 'Building depth', 8, 40), floors, walls, doors, obstacles, rooms, portals };
  if (!floors.length || floors[0].elevation !== 0) throw new LayoutError('The building needs a ground floor at 0 m.');
  if (world.width % RESOLUTION || world.depth % RESOLUTION) throw new LayoutError('Building dimensions must align with the 0.5 m grid.');
  for (let i = 1; i < floors.length; i++) {
    const gap = floors[i].elevation - floors[i - 1].elevation;
    if (gap < 3 || gap > 6) throw new LayoutError('Floors must be ordered with 3–6 m between levels.');
  }
  const identifiers = new Set<string>();
  for (const entry of [...floors, ...walls, ...doors, ...obstacles, ...rooms, ...portals]) {
    if (identifiers.has(entry.id)) throw new LayoutError(`Duplicate identifier "${entry.id}".`);
    identifiers.add(entry.id);
  }
  const checkRect = (value: Rect) => {
    if (value.x + value.w > world.width + EPS || value.z + value.d > world.depth + EPS) throw new LayoutError('Geometry extends outside the building.');
  };
  const checkEndpoint = (value: Endpoint) => {
    floorOf(world, value.floor);
    const center = canonicalEndpoint(value);
    if (!center || center.x < 0 || center.z < 0 || center.x >= world.width || center.z >= world.depth) {
      throw new LayoutError('Endpoint coordinates must be in-bounds 0.5 m grid centers.');
    }
    return center;
  };
  floors.forEach((floor) => floor.voids.forEach(checkRect));
  for (const item of [...walls, ...obstacles, ...rooms]) floorOf(world, item.floor);
  for (const wall of walls) {
    checkRect({ x: wall.x, z: wall.z, w: wall.axis === 'x' ? wall.length : wall.thickness, d: wall.axis === 'z' ? wall.length : wall.thickness });
    const openings = doors.filter((door) => door.wall === wall.id).sort((a, b) => a.offset - b.offset);
    let previousEnd = 0;
    for (const door of openings) {
      if (door.offset - door.width / 2 < previousEnd - EPS || door.offset + door.width / 2 > wall.length + EPS) throw new LayoutError('Door openings overlap or extend past their wall.');
      previousEnd = door.offset + door.width / 2;
    }
  }
  for (const door of doors) if (!walls.some((wall) => wall.id === door.wall)) throw new LayoutError(`Door "${door.name}" references a missing wall.`);
  for (const item of [...obstacles, ...rooms, ...portals]) checkRect(item);
  for (const room of rooms) {
    room.point = checkEndpoint(room.point);
    if (room.floor !== room.point.floor || room.point.x < room.x || room.point.x > room.x + room.w ||
      room.point.z < room.z || room.point.z > room.z + room.d) throw new LayoutError('A room landmark must lie in its own room and floor.');
  }
  for (const portal of portals) {
    const from = floors.indexOf(floorOf(world, portal.from)), to = floors.indexOf(floorOf(world, portal.to));
    if (to !== from + 1) throw new LayoutError('Connectors must join adjacent floors, from lower to upper.');
    if (portal.kind === 'stairs' && (portal.width > portal.w / 2 - 0.1 || portal.d < 4 || portal.wait !== 0)) {
      throw new LayoutError('Stairs need two clear flights, at least 4 m depth, and zero lift wait.');
    }
    if (portal.kind === 'lift' && portal.width > Math.min(portal.w, portal.d) - 0.1) throw new LayoutError('Lift width exceeds its shaft envelope.');
    const path = portalPath(world, portal);
    checkEndpoint({ ...path[0], floor: portal.from });
    checkEndpoint({ ...path[path.length - 1], floor: portal.to });
    for (const point of path) if (point.x < 0 || point.x > world.width || point.z < 0 || point.z > world.depth) throw new LayoutError('A connector path leaves the building.');
  }
  const start = checkEndpoint(endpoint(input.start)), end = checkEndpoint(endpoint(input.end)), mobility = profile(input.profile);
  if (input.objective !== 'comfort' && input.objective !== 'distance') throw new LayoutError('Objective must be comfort or distance.');
  return { world, start, end, profile: mobility, objective: input.objective };
}
export function serialize(layout: Layout, route: Route | null = null): string {
  return JSON.stringify({ schema: 'passage/1', units: 'metres', axes: 'Y-up; XZ floor', resolution: RESOLUTION,
    layout: validateLayout(layout), route: route ? { distance: route.distance, estimatedSeconds: route.duration,
      searchCost: route.cost, objective: layout.objective, points: route.points, segments: route.segments, instructions: route.instructions } : null }, null, 2);
}
export function deserialize(json: string): Layout {
  if (json.length > 400_000) throw new LayoutError('Layout file is too large; the limit is 400 KB.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new LayoutError('This is not valid JSON. No changes were applied.');
  }
  const envelope = object(parsed);
  if (envelope.schema !== 'passage/1' || envelope.units !== 'metres' || envelope.resolution !== RESOLUTION || envelope.axes !== 'Y-up; XZ floor') {
    throw new LayoutError('Use a PASSAGE v1 layout in metres, Y-up, at 0.5 m resolution.');
  }
  return validateLayout(envelope.layout);
}
export class History {
  current: Layout;
  private past: Layout[] = [];
  private future: Layout[] = [];
  revision = 0;
  constructor(layout: Layout) { this.current = validateLayout(layout); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  commit(next: Layout) {
    const valid = validateLayout(next);
    this.past.push(this.current);
    if (this.past.length > 40) this.past.shift();
    this.current = valid; this.future = []; this.revision++;
  }
  edit(change: (draft: Layout) => void) {
    const draft = structuredClone(this.current);
    change(draft);
    this.commit(draft);
  }
  undo() {
    if (!this.canUndo) throw new LayoutError('There is no earlier layout.');
    this.future.push(this.current); this.current = this.past.pop()!; this.revision++;
  }
  redo() {
    if (!this.canRedo) throw new LayoutError('There is no later layout.');
    this.past.push(this.current); this.current = this.future.pop()!; this.revision++;
  }
}
