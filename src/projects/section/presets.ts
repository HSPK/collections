import { primitive } from './model';
import type { Document, Primitive } from './model';

function study(title: string, primitives: Primitive[], rotation: [number, number, number] = [0, 0, 0], offset = 0): Document {
  return { version: 1, units: 'mm', title, primitives, plane: { offset, rotation }, resolution: 44 };
}
export const STUDIES = [
  {
    id: 'tender', name: 'Tender monument', type: '01 / Sculptural union',
    note: 'A tilted ring meets a hollow drum. Move the cut through the shoulder: one island becomes two, then a ring.',
    create: () => study('Tender monument', [
      primitive('cylinder', 'drum', { name: 'Porcelain drum', radius: 25, size: [40, 40, 52], position: [0, 0, -8] }),
      primitive('sphere', 'shoulder', { name: 'Rounded shoulder', radius: 25, position: [0, 0, 18] }),
      primitive('torus', 'handle', { name: 'Leaning handle', radius: 26, tube: 8, rotation: [72, 12, 0], position: [15, 0, 21] }),
      primitive('cylinder', 'bore', { name: 'Through-bore', operation: 'difference', radius: 13, size: [40, 40, 140], position: [0, 0, 6] }),
      primitive('box', 'foot', { name: 'Planed foot', operation: 'difference', size: [140, 140, 35], position: [0, 0, -47] }),
    ], [0, 0, 0], 8),
  },
  {
    id: 'joint', name: 'Bored joint', type: '02 / Subtractive joinery',
    note: 'Three orthogonal bores share a chamfered block. Turn the section obliquely to reveal their hidden meeting.',
    create: () => study('Bored joint', [
      primitive('box', 'block', { name: 'Joint blank', size: [64, 64, 64] }),
      primitive('sphere', 'rounding', { name: 'Corner envelope', operation: 'intersection', radius: 45 }),
      primitive('cylinder', 'bore-z', { name: 'Vertical bore', operation: 'difference', radius: 12, size: [40, 40, 130] }),
      primitive('cylinder', 'bore-x', { name: 'Cross bore X', operation: 'difference', radius: 12, size: [40, 40, 130], rotation: [0, 90, 0] }),
      primitive('cylinder', 'bore-y', { name: 'Cross bore Y', operation: 'difference', radius: 12, size: [40, 40, 130], rotation: [90, 0, 0] }),
    ], [25, 32, 0]),
  },
  {
    id: 'vessel', name: 'Nested vessel', type: '03 / Shells & voids',
    note: 'Two independent nested shells. A central section has two material islands and two holes; the void is part of the drawing.',
    create: () => study('Nested vessel', [
      primitive('sphere', 'outer', { name: 'Outer shell', radius: 34 }),
      primitive('sphere', 'hollow', { name: 'Outer cavity', operation: 'difference', radius: 28 }),
      primitive('sphere', 'inner', { name: 'Inner shell', radius: 19 }),
      primitive('sphere', 'inner-void', { name: 'Inner cavity', operation: 'difference', radius: 13 }),
      primitive('box', 'mouth', { name: 'Open crown', operation: 'difference', size: [100, 100, 50], position: [0, 0, 49] }),
    ]),
  },
  {
    id: 'arcade', name: 'The cloister', type: '04 / Architectural cells',
    note: 'A row of vaulted openings carved through a wall. Raise the horizontal cut to watch three passages close under the lintel.',
    create: () => study('The cloister', [
      primitive('box', 'wall', { name: 'Limestone wall', size: [108, 28, 65], position: [0, 0, 0] }),
      ...[-34, 0, 34].flatMap((x, i) => [
        primitive('box', `door-${i}`, { name: `Passage ${i + 1}`, operation: 'difference', size: [22, 60, 40], position: [x, 0, -17] }),
        primitive('cylinder', `arch-${i}`, { name: `Vault ${i + 1}`, operation: 'difference', radius: 11, size: [40, 40, 60], rotation: [90, 0, 0], position: [x, 0, 3] }),
      ]),
    ], [90, 0, 0]),
  },
];
