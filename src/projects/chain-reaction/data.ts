export const DURATION = 12;
export const MARBLE_RADIUS = 15;

export const TIMING = {
  rollStart: 0.45,
  firstContact: 2.8,
  wheelStart: 6.15,
  wheelStop: 10.8,
} as const;

export const DOMINO = {
  count: 6,
  width: 14,
  height: 66,
  gap: 35,
  contactDelay: 0.42,
  fallDuration: 1.08,
} as const;

export const LEVER = {
  halfLength: 66,
  pivotOffset: 115,
  heightAboveRail: 28,
  paddleHalfHeight: 4,
  paddleHalfWidth: 17,
} as const;

export const WHEEL = {
  radius: 74,
  drumRadius: 18,
  camRadius: 36,
  eccentricity: 26,
  rollerRadius: 8,
  stemLength: 150,
  pinClearance: 9,
  bloomThreshold: 38,
} as const;

export const SPEEDS = [
  { value: 0.5, label: '½× slow' },
  { value: 1, label: '1× normal' },
  { value: 1.5, label: '1½× brisk' },
  { value: 2, label: '2× quick' },
] as const;

export type StageId = 'roll' | 'cascade' | 'release' | 'turn' | 'bloom';

export interface ReactionStage {
  id: StageId;
  number: string;
  label: string;
  title: string;
  seek: number;
  cause: string;
  effect: string;
  explanation: string;
}

export const STAGES: readonly ReactionStage[] = [
  {
    id: 'roll',
    number: '01',
    label: 'Roll',
    title: 'A small beginning.',
    seek: 1.7,
    cause: 'A marble on a rail',
    effect: 'The first little nudge',
    explanation: 'The marble follows the copper rail into the face of the first domino. Everything downstream waits for that contact. A small beginning is still a beginning.',
  },
  {
    id: 'cascade',
    number: '02',
    label: 'Cascade',
    title: 'A borrowed push.',
    seek: 4.25,
    cause: 'One tipping domino',
    effect: 'Five more follow',
    explanation: 'Six coral dominoes pass the motion to the right. Each starts when its neighbour reaches the next face. Watch at half speed: there is a hand-off, not a simultaneous fall.',
  },
  {
    id: 'release',
    number: '03',
    label: 'Release',
    title: 'A change of direction.',
    seek: 5.83,
    cause: 'The left paddle goes down',
    effect: 'The locking pin pulls clear',
    explanation: 'The last domino lands on the wide left paddle. The right arm rises, pulling a cord around the two lower guides. The cord draws the pin out of the wheel’s bottom notch.',
  },
  {
    id: 'turn',
    number: '04',
    label: 'Turn',
    title: 'Something held in reserve.',
    seek: 8.25,
    cause: 'A released counterweight',
    effect: 'A turning cam lifts the stem',
    explanation: 'Only with the pin clear does the copper weight descend. It turns the mustard wheel through half a revolution. The off-centre copper cam stays in contact with the little roller, lifting the flower stem.',
  },
  {
    id: 'bloom',
    number: '05',
    label: 'Bloom',
    title: 'An entirely unnecessary delight.',
    seek: 10.8,
    cause: 'The last stretch of the lift',
    effect: 'Eight petals open',
    explanation: 'Near the end of the stem’s travel, the flower’s little linkage fans out eight coral petals. The wheel comes to rest, the bloom stays open, and one small nudge has had its moment.',
  },
];

export interface MachineLayout {
  narrow: boolean;
  width: number;
  height: number;
  firstDominoX: number;
  railY: number;
  railStartX: number;
  railRise: number;
  wheelX: number;
  wheelY: number;
  cordY: number;
  baseY: number;
  labels: readonly { id: StageId; x: number; y: number; leader: string }[];
}

export const LAYOUTS: Record<'wide' | 'narrow', MachineLayout> = {
  wide: {
    narrow: false,
    width: 1120,
    height: 500,
    firstDominoX: 244,
    railY: 240,
    railStartX: 78,
    railRise: 94,
    wheelX: 785,
    wheelY: 288,
    cordY: 439,
    baseY: 466,
    labels: [
      { id: 'roll', x: 65, y: 77, leader: 'M83 94v22' },
      { id: 'cascade', x: 329, y: 115, leader: 'M347 132v22' },
      { id: 'release', x: 528, y: 145, leader: 'M546 162v24' },
      { id: 'turn', x: 638, y: 321, leader: 'M638 340v16h65' },
      { id: 'bloom', x: 925, y: 102, leader: 'M906 102h-53' },
    ],
  },
  narrow: {
    narrow: true,
    width: 560,
    height: 742,
    firstDominoX: 174,
    railY: 226,
    railStartX: 65,
    railRise: 88,
    wheelX: 330,
    wheelY: 515,
    cordY: 672,
    baseY: 704,
    labels: [
      { id: 'roll', x: 42, y: 72, leader: 'M60 94v22' },
      { id: 'cascade', x: 250, y: 92, leader: 'M268 112v27' },
      { id: 'release', x: 430, y: 150, leader: 'M448 170v13' },
      { id: 'turn', x: 143, y: 518, leader: 'M229 518h16' },
      { id: 'bloom', x: 176, y: 354, leader: 'M176 375v10h106' },
    ],
  },
};
