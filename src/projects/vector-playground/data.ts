import type { Mat2, Vec2 } from './engine';

export const INPUT_LIMIT = 4;
export const INPUT_STEP = 0.1;

export interface MatrixPreset {
  id: string;
  label: string;
  matrix: Mat2;
  note: string;
}

export const MATRIX_PRESETS: readonly MatrixPreset[] = [
  {
    id: 'shear', label: 'Shear · lean without losing area', matrix: { a: 1, b: 0.75, c: 0, d: 1 },
    note: 'Vertical lines lean, but the signed unit-square area stays +1. Only the horizontal eigenline stays on itself.',
  },
  {
    id: 'identity', label: 'Identity · leave everything alone', matrix: { a: 1, b: 0, c: 0, d: 1 },
    note: 'Both basis vectors stay put. The original and transformed drawings coincide; every direction is an eigen-direction.',
  },
  {
    id: 'rotation', label: 'Rotate · 90° counterclockwise', matrix: { a: 0, b: -1, c: 1, d: 0 },
    note: 'A quarter-turn keeps lengths, angles, area, and orientation. No nonzero real vector stays on its original line.',
  },
  {
    id: 'stretch', label: 'Stretch · two different scales', matrix: { a: 1.5, b: 0, c: 0, d: 0.65 },
    note: 'Horizontal distances grow by 1.5; vertical distances shrink by 0.65. The area factor is their product: 0.975.',
  },
  {
    id: 'reflection', label: 'Reflect · across the x-axis', matrix: { a: 1, b: 0, c: 0, d: -1 },
    note: 'The pavilion flips upside down. Lengths stay the same; the negative determinant records reversed orientation.',
  },
  {
    id: 'projection', label: 'Project · onto the line (2, 1)', matrix: { a: 0.8, b: 0.4, c: 0.4, d: 0.2 },
    note: 'Perpendicular projection keeps the (2, 1) direction and erases its perpendicular. A second application changes nothing.',
  },
  {
    id: 'singular', label: 'Singular · collapse onto one line', matrix: { a: 1, b: 2, c: 0.5, d: 1 },
    note: 'The second column is twice the first. The plane collapses to a line, but this is not an orthogonal projection.',
  },
  {
    id: 'zero', label: 'Zero · collapse onto one point', matrix: { a: 0, b: 0, c: 0, d: 0 },
    note: 'Both columns vanish. Every input lands at the origin: zero area and rank 0. Every direction has eigenvalue 0.',
  },
];

export const INITIAL_VECTOR: Vec2 = { x: 2, y: 1 };
export const INITIAL_SOURCE: Vec2 = { x: 2, y: 2 };
export const INITIAL_DIRECTION: Vec2 = { x: 2, y: 1 };

export const PROJECTION_PRESETS = [
  { id: 'acute', label: 'Acute angle', source: { x: 2, y: 2 }, direction: { x: 2, y: 1 } },
  { id: 'perpendicular', label: 'Perpendicular', source: { x: -1, y: 2 }, direction: { x: 2, y: 1 } },
  { id: 'opposite', label: 'Opposite directions', source: { x: -2, y: -1 }, direction: { x: 2, y: 1 } },
  { id: 'zero', label: 'Zero direction', source: { x: 2, y: 2 }, direction: { x: 0, y: 0 } },
] as const;

// An original asymmetric paper pavilion; every vertex and interior stroke is transformed.
export const PAVILION_OUTLINE: readonly Vec2[] = [
  { x: -2.4, y: -1.8 }, { x: -0.9, y: -1.8 }, { x: -0.9, y: -0.7 },
  { x: -1.25, y: -0.7 }, { x: -1.7, y: 0.15 }, { x: -2.4, y: -0.7 },
];

export const PAVILION_LINES: readonly (readonly Vec2[])[] = [
  [{ x: -2.4, y: -0.7 }, { x: -1.25, y: -0.7 }],
  [{ x: -1.7, y: 0.15 }, { x: -1.7, y: -0.7 }],
  [{ x: -2.12, y: -1.8 }, { x: -2.12, y: -1.04 }, { x: -1.72, y: -1.04 }, { x: -1.72, y: -1.8 }],
  [{ x: -1.45, y: -1.02 }, { x: -1.12, y: -1.02 }, { x: -1.12, y: -1.37 }, { x: -1.45, y: -1.37 }, { x: -1.45, y: -1.02 }],
];

export const REFERENCES = [
  { label: 'MIT · Linear algebra', url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/' },
  { label: 'PyTorch · Linear layers', url: 'https://docs.pytorch.org/docs/stable/generated/torch.nn.Linear.html' },
];
