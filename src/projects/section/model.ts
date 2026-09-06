export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Kind = 'box' | 'sphere' | 'cylinder' | 'torus';
export type Operation = 'union' | 'difference' | 'intersection';
export interface Primitive {
  id: string;
  name: string;
  kind: Kind;
  operation: Operation;
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  radius: number;
  tube: number;
}
export interface SlicePlane {
  offset: number;
  rotation: Vec3;
}
export interface Document {
  version: 1;
  units: 'mm';
  title: string;
  primitives: Primitive[];
  plane: SlicePlane;
  resolution: 28 | 44 | 64;
}
export interface Bounds { min: Vec3; max: Vec3 }
export const KINDS: Kind[] = ['box', 'sphere', 'cylinder', 'torus'];
export const OPERATIONS: Operation[] = ['union', 'difference', 'intersection'];
export const LIMITS = { primitives: 16, fileBytes: 64_000, triangles: 220_000, history: 60 } as const;

export function primitive(kind: Kind, id: string, overrides: Partial<Primitive> = {}): Primitive {
  return {
    id, name: kind[0].toUpperCase() + kind.slice(1), kind, operation: 'union',
    position: [0, 0, 0], rotation: [0, 0, 0], size: [40, 40, 50],
    radius: 20, tube: 7, ...overrides,
  };
}

export function clone(document: Document): Document {
  return structuredClone(document);
}
