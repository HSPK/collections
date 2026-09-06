export type Vector3 = [number, number, number];
export type Restraints = [boolean, boolean, boolean];
export interface Joint { id: string; position: Vector3; restraints: Restraints }
export interface Bar { id: string; a: string; b: string; section: string; material: string }
export interface Section { id: string; name: string; area: number }
export interface Material { id: string; name: string; elasticModulus: number; density: number }
export interface PointLoad { node: string; force: Vector3 }
export interface LoadCase { id: string; name: string; loads: PointLoad[]; selfWeight: boolean }
export interface Structure {
  name: string;
  nodes: Joint[];
  members: Bar[];
  sections: Section[];
  materials: Material[];
  loadCases: LoadCase[];
  activeCase: string;
}
export type Selection = { kind: 'node' | 'member'; id: string };
export const AXES = ['X', 'Y', 'Z'] as const;
export const LIMITS = {
  nodes: 60, members: 240, cases: 8, properties: 12, coordinate: 100,
  minLength: 0.01, minArea: 1e-6, maxArea: 0.1,
  minModulus: 1e6, maxModulus: 5e11, maxDensity: 25_000, maxForce: 1e6,
  importBytes: 150_000, history: 60,
} as const;
export const GRAVITY = 9.80665;
export class ModelError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelError'; }
}
export const length = (v: Vector3): number => Math.hypot(...v);
export const subtract = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function cloneModel(model: Structure): Structure {
  return {
    ...model,
    nodes: model.nodes.map((n) => ({ ...n, position: [...n.position], restraints: [...n.restraints] })),
    members: model.members.map((m) => ({ ...m })),
    sections: model.sections.map((s) => ({ ...s })),
    materials: model.materials.map((m) => ({ ...m })),
    loadCases: model.loadCases.map((c) => ({ ...c, loads: c.loads.map((l) => ({ ...l, force: [...l.force] })) })),
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ModelError(`${label} must be an object.`);
  return value;
}
function text(value: unknown, label: string, id = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || (id && !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value))) {
    throw new ModelError(`${label} must be ${id ? 'a short alphanumeric identifier' : '1-80 readable characters'}.`);
  }
  return value;
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ModelError(`${label} must be between ${min} and ${max} (SI).`);
  return value;
}
function list(value: unknown, max: number, label: string, min = 1): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new ModelError(`${label} must contain ${min}-${max} entries.`);
  return value;
}
function vector(value: unknown, max: number, label: string): Vector3 {
  const a = list(value, 3, label, 3);
  return [number(a[0], -max, max, label), number(a[1], -max, max, label), number(a[2], -max, max, label)];
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ModelError(`${label} must be true or false.`);
  return value;
}
function unique(items: { id: string }[], label: string): Set<string> {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new ModelError(`Duplicate ${label} identifiers.`);
  return ids;
}
/** Parses into fresh typed data; imported prototypes and surplus fields never enter the model. */
export function parseModel(value: unknown): Structure {
  const o = record(value, 'Structure');
  const nodes = list(o.nodes, LIMITS.nodes, 'Nodes').map((item): Joint => {
    const n = record(item, 'Node');
    const r = list(n.restraints, 3, 'Restraints', 3);
    return { id: text(n.id, 'Node id', true), position: vector(n.position, LIMITS.coordinate, 'Coordinate'), restraints: [boolean(r[0], 'X restraint'), boolean(r[1], 'Y restraint'), boolean(r[2], 'Z restraint')] };
  });
  const nodeIds = unique(nodes, 'node');
  const sections = list(o.sections, LIMITS.properties, 'Sections').map((item): Section => {
    const s = record(item, 'Section');
    return { id: text(s.id, 'Section id', true), name: text(s.name, 'Section name'), area: number(s.area, LIMITS.minArea, LIMITS.maxArea, 'Section area') };
  });
  const sectionIds = unique(sections, 'section');
  const materials = list(o.materials, LIMITS.properties, 'Materials').map((item): Material => {
    const m = record(item, 'Material');
    return { id: text(m.id, 'Material id', true), name: text(m.name, 'Material name'), elasticModulus: number(m.elasticModulus, LIMITS.minModulus, LIMITS.maxModulus, 'Elastic modulus'), density: number(m.density, 0, LIMITS.maxDensity, 'Density') };
  });
  const materialIds = unique(materials, 'material');
  const connections = new Set<string>();
  const members = list(o.members, LIMITS.members, 'Members', 0).map((item): Bar => {
    const m = record(item, 'Member');
    const bar = { id: text(m.id, 'Member id', true), a: text(m.a, 'Start node', true), b: text(m.b, 'End node', true), section: text(m.section, 'Section', true), material: text(m.material, 'Material', true) };
    if (!nodeIds.has(bar.a) || !nodeIds.has(bar.b)) throw new ModelError(`${bar.id} references a missing node.`);
    if (!sectionIds.has(bar.section) || !materialIds.has(bar.material)) throw new ModelError(`${bar.id} references a missing section or material.`);
    const start = nodes.find((n) => n.id === bar.a)!;
    const end = nodes.find((n) => n.id === bar.b)!;
    if (length(subtract(start.position, end.position)) < LIMITS.minLength) throw new ModelError(`${bar.id} is zero-length or shorter than 10 mm.`);
    const key = [bar.a, bar.b].sort().join('|');
    if (connections.has(key)) throw new ModelError(`Duplicate connection ${bar.a}-${bar.b}. Edit the existing member's area instead.`);
    connections.add(key);
    return bar;
  });
  unique(members, 'member');
  const loadCases = list(o.loadCases, LIMITS.cases, 'Load cases').map((item): LoadCase => {
    const c = record(item, 'Load case');
    const seen = new Set<string>();
    const loads = list(c.loads, LIMITS.nodes, 'Point loads', 0).map((item): PointLoad => {
      const l = record(item, 'Point load');
      const node = text(l.node, 'Load node', true);
      if (!nodeIds.has(node)) throw new ModelError(`Load references missing node ${node}.`);
      if (seen.has(node)) throw new ModelError(`Duplicate loads on ${node}; combine their vector components.`);
      seen.add(node);
      return { node, force: vector(l.force, LIMITS.maxForce, 'Load component') };
    });
    return { id: text(c.id, 'Case id', true), name: text(c.name, 'Case name'), selfWeight: boolean(c.selfWeight, 'Self-weight'), loads };
  });
  const caseIds = unique(loadCases, 'load case');
  const activeCase = text(o.activeCase, 'Active case', true);
  if (!caseIds.has(activeCase)) throw new ModelError('The active load case does not exist.');
  return { name: text(o.name, 'Structure name'), nodes, members, sections, materials, loadCases, activeCase };
}
export function nextId(prefix: string, items: { id: string }[]): string {
  let index = 1;
  while (items.some((item) => item.id === `${prefix}${String(index).padStart(2, '0')}`)) index++;
  return `${prefix}${String(index).padStart(2, '0')}`;
}
export function currentCase(model: Structure): LoadCase {
  const result = model.loadCases.find((item) => item.id === model.activeCase);
  if (!result) throw new ModelError('The active load case does not exist.');
  return result;
}
