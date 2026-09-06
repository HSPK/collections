export interface Vec {
  x: number;
  y: number;
}

export const BENCH = { width: 1000, height: 600 } as const;
export const WAVELENGTHS = [420, 460, 500, 540, 580, 620, 660] as const;
export const MATERIAL_IDS = ['crown', 'flint', 'water'] as const;
export type MaterialId = typeof MATERIAL_IDS[number];
export const ELEMENT_KINDS = ['emitter', 'prism', 'lens', 'block', 'mirror', 'detector'] as const;
export type ElementKind = typeof ELEMENT_KINDS[number];

interface ElementBase {
  id: string;
  label: string;
  x: number;
  y: number;
  rotation: number;
}

export interface Emitter extends ElementBase {
  kind: 'emitter';
  spectrum: 'white' | 'mono';
  wavelength: number;
  rays: number;
  aperture: number;
  spread: number;
  power: number;
}

export interface Prism extends ElementBase {
  kind: 'prism';
  size: number;
  material: MaterialId;
}

export interface Lens extends ElementBase {
  kind: 'lens';
  diameter: number;
  thickness: number;
  material: MaterialId;
}

export interface Block extends ElementBase {
  kind: 'block';
  width: number;
  height: number;
  material: MaterialId;
}

export interface Mirror extends ElementBase {
  kind: 'mirror';
  length: number;
  reflectivity: number;
}

export interface Detector extends ElementBase {
  kind: 'detector';
  length: number;
}

export type Refractor = Prism | Lens | Block;
export type OpticalElement = Emitter | Refractor | Mirror | Detector;

export interface Experiment {
  version: 1;
  title: string;
  notes: string;
  elements: OpticalElement[];
}

export function isRefractor(element: OpticalElement): element is Refractor {
  return element.kind === 'prism' || element.kind === 'lens' || element.kind === 'block';
}

export const KIND_NAMES: Record<ElementKind, string> = {
  emitter: 'Emitter',
  prism: 'Prism',
  lens: 'Biconvex lens',
  block: 'Glass block',
  mirror: 'Mirror',
  detector: 'Detector',
};

export function createElement(kind: ElementKind, id: string): OpticalElement {
  const base = { id, label: KIND_NAMES[kind], x: 500, y: 300, rotation: 0 };
  switch (kind) {
    case 'emitter': return { ...base, kind, x: 120, spectrum: 'white', wavelength: 540, rays: 5, aperture: 20, spread: 0, power: 1 };
    case 'prism': return { ...base, kind, size: 210, material: 'flint', rotation: 15 };
    case 'lens': return { ...base, kind, diameter: 210, thickness: 42, material: 'crown' };
    case 'block': return { ...base, kind, width: 100, height: 210, material: 'crown', rotation: 20 };
    case 'mirror': return { ...base, kind, length: 180, reflectivity: 0.96, rotation: 45 };
    case 'detector': return { ...base, kind, x: 840, length: 260, rotation: 90 };
  }
}
