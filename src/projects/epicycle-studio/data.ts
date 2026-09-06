import type { Point } from './engine';

export interface DrawingPreset {
  id: string;
  name: string;
  note: string;
  points: readonly Point[];
}

function contour(trace: (angle: number) => Point): Point[] {
  return Array.from({ length: 256 }, (_, index) => trace(index / 256 * Math.PI * 2));
}

export const presets: readonly DrawingPreset[] = [
  {
    id: 'orbit-flower',
    name: 'Orbit flower',
    note: 'Five broad petals, one continuous line. Small circles recover the shallow folds between them.',
    points: contour((angle) => {
      const radius = 0.69 + 0.2 * Math.cos(5 * angle - 0.4) + 0.035 * Math.sin(2 * angle);
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }),
  },
  {
    id: 'tidal-loop',
    name: 'Tidal loop',
    note: 'A rounded triangular current with rippled edges. Notice the large clockwise term.',
    points: contour((angle) => ({
      x: 0.68 * Math.cos(angle) + 0.24 * Math.cos(-2 * angle) + 0.09 * Math.cos(7 * angle),
      y: 0.68 * Math.sin(angle) + 0.24 * Math.sin(-2 * angle) + 0.09 * Math.sin(7 * angle),
    })),
  },
  {
    id: 'paper-kite',
    name: 'Paper kite',
    note: 'Straight folds and sharp corners need more harmonics. Even all samples do not imply perfect corners between samples.',
    points: [
      { x: -0.95, y: 0.16 }, { x: 0.8, y: 0.76 }, { x: 0.4, y: -0.82 },
      { x: 0.01, y: -0.25 }, { x: -0.47, y: -0.59 }, { x: -0.2, y: -0.03 },
    ],
  },
  {
    id: 'soft-square',
    name: 'Soft square',
    note: 'One outline, four rounded corners. A few strong turns capture most of its character.',
    points: contour((angle) => ({
      x: Math.sign(Math.cos(angle)) * Math.sqrt(Math.abs(Math.cos(angle))),
      y: 0.83 * Math.sign(Math.sin(angle)) * Math.sqrt(Math.abs(Math.sin(angle))),
    })),
  },
];
