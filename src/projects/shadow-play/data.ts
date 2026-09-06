import { makePaper } from './engine';
import type { Lamp, PaperObject, Point } from './engine';

export interface Arrangement {
  id: string;
  number: string;
  name: string;
  invitation: string;
  hint: string;
  revealed: string;
  lamp: Lamp;
  start: Lamp;
  objects: PaperObject[];
}

const polygon = (...points: [number, number][]): Point[][] =>
  [points.map(([x, y]) => ({ x, y }))];

function ellipse(x: number, y: number, rx: number, ry = rx): Point[][] {
  return [Array.from({ length: 60 }, (_, i) => ({
    x: x + Math.cos(i / 60 * Math.PI * 2) * rx,
    y: y + Math.sin(i / 60 * Math.PI * 2) * ry,
  }))];
}

function moon(x: number, y: number): Point[][] {
  const outside = Array.from({ length: 33 }, (_, i) => ({
    x: x - Math.sin(i / 32 * Math.PI) * 45,
    y: y - Math.cos(i / 32 * Math.PI) * 45,
  }));
  const inside = Array.from({ length: 33 }, (_, i) => ({
    x: x - Math.sin(i / 32 * Math.PI) * 13,
    y: y + Math.cos(i / 32 * Math.PI) * 45,
  }));
  return [[...outside, ...inside]];
}

const ferryLamp: Lamp = { x: 188, y: 142, z: 360 };
const birdLamp: Lamp = { x: 222, y: 486, z: 360 };
const windowLamp: Lamp = { x: 730, y: 170, z: 360 };

export const arrangements: Arrangement[] = [
  {
    id: 'ferry', number: '01', name: 'The night ferry',
    invitation: 'Find a boat in five pieces of paper.',
    hint: 'Bring the mast between the sails. The hull belongs just underneath.',
    revealed: 'A quiet crossing. Two sails, one hull, and a moon with nowhere else to be.',
    lamp: ferryLamp,
    start: { x: 210, y: 478, z: 360 },
    objects: [
      makePaper('hull', 'Folded hull', 176, polygon([455, 382], [618, 382], [591, 412], [483, 412]), ferryLamp),
      makePaper('port', 'Wide sail', 138, polygon([531, 275], [531, 373], [462, 373]), ferryLamp),
      makePaper('starboard', 'Small sail', 98, polygon([543, 302], [601, 373], [543, 373]), ferryLamp),
      makePaper('mast', 'Paper mast', 76, polygon([535, 266], [540, 266], [540, 385], [535, 385]), ferryLamp),
      makePaper('moon', 'Cut moon', 118, moon(643, 238), ferryLamp),
    ],
  },
  {
    id: 'wren', number: '02', name: 'A visitor at dawn',
    invitation: 'Coax a little bird onto a branch.',
    hint: 'The small round head meets the oval body. Let the tail point left.',
    revealed: 'The paper wren has landed. A beak, a tail, and a moment of stillness.',
    lamp: birdLamp,
    start: { x: 716, y: 322, z: 360 },
    objects: [
      makePaper('body', 'Oval body', 126, ellipse(533, 327, 48, 34), birdLamp),
      makePaper('head', 'Round head', 170, ellipse(573, 292, 25), birdLamp),
      makePaper('beak', 'Small beak', 148, polygon([593, 285], [617, 296], [593, 301]), birdLamp),
      makePaper('tail', 'Folded tail', 68, polygon([498, 318], [453, 287], [474, 338], [506, 342]), birdLamp),
      makePaper('perch', 'Branch and feet', 42, polygon(
        [422, 393], [520, 377], [528, 351], [532, 353], [527, 377],
        [548, 373], [553, 348], [557, 348], [553, 374], [640, 360], [641, 368], [422, 401],
      ), birdLamp),
    ],
  },
  {
    id: 'window', number: '03', name: 'The uncut diamond',
    invitation: 'Make a shape out of the light you leave behind.',
    hint: 'Four strips become a frame. Its centre is not an object: it is untouched light.',
    revealed: 'Nothing became something. The bright diamond is the space between four shadows.',
    lamp: windowLamp,
    start: { x: 308, y: 446, z: 360 },
    objects: [
      makePaper('northwest', 'Upper left fold', 128, polygon([528, 226], [536, 253], [435, 354], [407, 354]), windowLamp),
      makePaper('northeast', 'Upper right fold', 62, polygon([528, 226], [649, 347], [621, 354], [528, 261]), windowLamp),
      makePaper('southeast', 'Lower right fold', 152, polygon([649, 347], [528, 468], [528, 433], [621, 340]), windowLamp),
      makePaper('southwest', 'Lower left fold', 94, polygon([528, 468], [407, 347], [435, 340], [536, 441]), windowLamp),
    ],
  },
];
