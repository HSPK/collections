import {
  canonicalEndpoint, distance, endpointIssue, floorOf, MAX_EXPANSIONS, portalIssue, portalPath, radiusOf,
  RESOLUTION, segmentClear, solidsOn,
} from './world';
import type { Endpoint, Layout, Point, Portal, Solid } from './world';

export interface Node { id: number; floor: string; column: number; row: number; point: Point }
export interface Edge { to: number; distance: number; cost: number; portal?: Portal; path: Point[] }
export interface SearchResult {
  status: 'found' | 'unreachable' | 'invalid' | 'budget' | 'cancelled';
  message: string; expanded: number; total: number; nodes: Node[]; edges: Edge[]; cost: number;
}
export interface Graph {
  layout: Layout; nodes: Map<number, Node>; start: number; end: number; total: number;
  neighbors(id: number): Edge[];
}
export function buildGraph(layout: Layout): Graph {
  const { world, profile } = layout, columns = Math.round(world.width / RESOLUTION), rows = Math.round(world.depth / RESOLUTION);
  const stride = columns * rows, nodes = new Map<number, Node>(), floorSolids = new Map<string, Solid[]>();
  const radius = radiusOf(profile);
  world.floors.forEach((floor, f) => {
    const solids = solidsOn(world, floor.id);
    floorSolids.set(floor.id, solids);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const point = { x: (column + 0.5) * RESOLUTION, y: floor.elevation, z: (row + 0.5) * RESOLUTION };
      const id = f * stride + row * columns + column;
      if (segmentClear(world, solids, point, point, radius)) nodes.set(id, { id, floor: floor.id, column, row, point });
    }
  });
  const endpointId = (endpoint: Endpoint) => {
    const center = canonicalEndpoint(endpoint), floor = world.floors.findIndex((floor) => floor.id === endpoint.floor);
    if (!center || floor < 0 || center.x < 0 || center.z < 0 || center.x >= world.width || center.z >= world.depth) return -1;
    return floor * stride + Math.floor(center.z / RESOLUTION) * columns + Math.floor(center.x / RESOLUTION);
  };
  const links = new Map<number, Edge[]>();
  for (const portal of world.portals) {
    if (portalIssue(world, portal, profile)) continue;
    const path = portalPath(world, portal);
    const from = endpointId({ ...path[0], floor: portal.from }), to = endpointId({ ...path[path.length - 1], floor: portal.to });
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const length = path.slice(1).reduce((sum, point, index) => sum + distance(path[index], point), 0);
    const cost = layout.objective === 'distance' ? length : length +
      (portal.kind === 'stairs' ? length * profile.stairPenalty : portal.wait * 0.2);
    const add = (id: number, edge: Edge) => links.set(id, [...(links.get(id) ?? []), edge]);
    add(from, { to, distance: length, cost, portal, path });
    add(to, { to: from, distance: length, cost, portal, path: [...path].reverse() });
  }
  return {
    layout, nodes, start: endpointId(layout.start), end: endpointId(layout.end), total: stride * world.floors.length,
    neighbors(id) {
      const node = nodes.get(id);
      if (!node) return [];
      const solids = floorSolids.get(node.floor)!;
      const edges: Edge[] = [...(links.get(id) ?? [])];
      for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const column = node.column + dc, row = node.row + dr;
        if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
        const next = nodes.get(id + dr * columns + dc);
        if (!next || next.floor !== node.floor) continue;
        if (dc && dr && (!nodes.has(id + dc) || !nodes.has(id + dr * columns))) continue;
        if (!segmentClear(world, solids, node.point, next.point, radius)) continue;
        const length = distance(node.point, next.point);
        edges.push({ to: next.id, distance: length, cost: length, path: [node.point, next.point] });
      }
      return edges;
    },
  };
}
interface Entry { id: number; priority: number; cost: number }
class Heap {
  private entries: Entry[] = [];
  get length() { return this.entries.length; }
  push(entry: Entry) {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].priority <= entry.priority) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }
  pop(): Entry {
    const first = this.entries[0], last = this.entries.pop()!;
    if (this.entries.length) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1].priority < this.entries[child].priority) child++;
        if (this.entries[child].priority >= last.priority) break;
        this.entries[index] = this.entries[child];
        index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
}
export class Search {
  readonly graph: Graph;
  expanded = 0;
  result: SearchResult | null = null;
  private queue = new Heap();
  private costs = new Map<number, number>();
  private previous = new Map<number, { id: number; edge: Edge }>();
  private closed = new Set<number>();
  private budget: number;
  constructor(layout: Layout, options: { budget?: number; heuristic?: boolean } = {}) {
    this.budget = Math.min(MAX_EXPANSIONS, Math.max(1, options.budget ?? MAX_EXPANSIONS));
    this.useHeuristic = options.heuristic ?? true;
    this.graph = buildGraph(layout);
    const issue = endpointIssue(layout.world, layout.start, layout.profile) ?? endpointIssue(layout.world, layout.end, layout.profile);
    if (issue) { this.finish('invalid', issue); return; }
    if (!this.graph.nodes.has(this.graph.start) || !this.graph.nodes.has(this.graph.end)) {
      this.finish('invalid', 'Start or destination has no clearance-safe grid node. Move the endpoint or undo the edit.');
      return;
    }
    this.costs.set(this.graph.start, 0);
    this.queue.push({ id: this.graph.start, cost: 0, priority: this.heuristic(this.graph.start) });
  }
  private useHeuristic: boolean;
  private heuristic(id: number) {
    return this.useHeuristic ? distance(this.graph.nodes.get(id)!.point, this.graph.nodes.get(this.graph.end)!.point) : 0;
  }
  private finish(status: SearchResult['status'], message: string) {
    this.result = { status, message, expanded: this.expanded, total: this.graph.total, nodes: [], edges: [], cost: 0 };
    if (status === 'found') {
      let id = this.graph.end;
      this.result.nodes.unshift(this.graph.nodes.get(id)!);
      while (id !== this.graph.start) {
        const previous = this.previous.get(id)!;
        this.result.edges.unshift(previous.edge);
        id = previous.id;
        this.result.nodes.unshift(this.graph.nodes.get(id)!);
      }
      this.result.cost = this.costs.get(this.graph.end)!;
    }
    return this.result;
  }
  cancel() { if (!this.result) this.finish('cancelled', 'Search cancelled. No route is active. Recompute when ready.'); }
  step(count = 200): SearchResult | null {
    if (this.result) return this.result;
    for (let step = 0; step < Math.max(1, Math.min(count, 1000)) && this.queue.length; step++) {
      const entry = this.queue.pop();
      if (this.closed.has(entry.id) || entry.cost !== this.costs.get(entry.id)) { step--; continue; }
      if (this.expanded >= this.budget) return this.finish('budget', `Search reached its ${this.budget.toLocaleString('en-US')}-node budget. No route is asserted.`);
      this.expanded++;
      if (entry.id === this.graph.end) return this.finish('found', 'Route ready. Optimal on the clearance graph for the selected cost, not a continuous-space shortest-path claim.');
      this.closed.add(entry.id);
      for (const edge of this.graph.neighbors(entry.id)) {
        const cost = entry.cost + edge.cost;
        if (cost + 1e-9 < (this.costs.get(edge.to) ?? Infinity)) {
          this.costs.set(edge.to, cost);
          this.previous.set(edge.to, { id: entry.id, edge });
          this.queue.push({ id: edge.to, cost, priority: cost + this.heuristic(edge.to) });
        }
      }
    }
    if (!this.queue.length) {
      const { world, profile } = this.graph.layout;
      const excluded = world.portals.map((portal) => portalIssue(world, portal, profile)).filter((issue): issue is string => issue !== null);
      return this.finish('unreachable', `No connected clearance-safe route. ${excluded.join(' ')} Reopen a door or connector, reduce clearance only if appropriate, move an obstruction, or Undo.`);
    }
    return null;
  }
}
export function solve(layout: Layout, options: { budget?: number; heuristic?: boolean } = {}): SearchResult {
  const search = new Search(layout, options);
  while (!search.result) search.step(1000);
  return search.result;
}
export function floorAt(world: Layout['world'], point: Point): string {
  return world.floors.reduce((best, floor) => Math.abs(floor.elevation - point.y) < Math.abs(floorOf(world, best).elevation - point.y) ? floor.id : best, world.floors[0].id);
}
