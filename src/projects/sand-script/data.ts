export const PIGMENTS = [
  { cell: 2, name: 'Chalk', color: '#ecd9b1', rgb: [236, 217, 177] },
  { cell: 3, name: 'Saffron', color: '#c99c51', rgb: [201, 156, 81] },
  { cell: 4, name: 'Terracotta', color: '#bc6b4f', rgb: [188, 107, 79] },
  { cell: 5, name: 'Mulberry', color: '#70444c', rgb: [112, 68, 76] },
  { cell: 6, name: 'River slate', color: '#6f8580', rgb: [111, 133, 128] },
] as const;

export const STENCILS = [
  { id: 'vessel', name: 'Strata vessel', note: 'A wide basin, already holding a small landscape.' },
  { id: 'hourglass', name: 'The hourglass', note: 'A narrow throat turns a pile into a patient stream.' },
  { id: 'terraces', name: 'Three terraces', note: 'Catch a falling line on a staircase of shelves.' },
] as const;

export type Stencil = typeof STENCILS[number]['id'];
export type SandTool = 'sand' | 'wall' | 'erase';
