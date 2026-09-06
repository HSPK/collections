export type ColorId = 'red' | 'blue' | 'gold' | 'teal';
export type ShapeId = 'circle' | 'square' | 'triangle';
export type RGB = readonly [number, number, number];
export type Features = [number, number, number, number, number, number, number];

export interface Patch {
  color: ColorId;
  shape: ShapeId | 'empty';
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  patches: readonly Patch[];
}

export interface VisualToken {
  features: Features;
  unit: number[];
  coverage: number;
  affinities: [number, number, number];
}

export interface Descriptor {
  text: string;
  color: ColorId | null;
  shape: ShapeId | null;
  features: Features;
  unit: number[];
}

export type DescriptorResult =
  | { ok: true; descriptor: Descriptor }
  | { ok: false; message: string };

export type Pooling = 'attention' | 'mean';

export interface MatchResult {
  tokens: VisualToken[];
  similarities: (number | null)[];
  weights: number[];
  pooled: number[];
  contributions: number[][];
  cosine: number | null;
  meanCosine: number | null;
  weightedSimilarity: number | null;
  entropy: number;
  activeCount: number;
}
