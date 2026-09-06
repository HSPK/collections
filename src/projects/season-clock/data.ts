export interface Branch {
  readonly path: string;
  readonly width: number;
}

export interface Crown {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

export interface Tree {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly trunk: string;
  readonly branches: readonly Branch[];
  readonly crowns: readonly Crown[];
  readonly leavesPerCrown: number;
}

export interface Landscape {
  readonly id: string;
  readonly name: string;
  readonly number: string;
  readonly caption: string;
  readonly note: string;
  readonly terrain: 'river' | 'orchard' | 'mountain';
  readonly leafShape: 'lance' | 'oval' | 'spade';
  readonly seed: number;
  readonly wind: number;
  readonly leafOut: number;
  readonly flowerAt: number;
  readonly fallStart: number;
  readonly fallSpread: number;
  readonly colors: {
    readonly young: string;
    readonly leaf: string;
    readonly gold: string;
    readonly blossom: string;
    readonly bark: string;
  };
  readonly hills: readonly [string, string, string];
  readonly trees: readonly Tree[];
}

const willowBranches: readonly Branch[] = [
  { path: 'M-1-140 C-47-191-85-224-150-238', width: 9 },
  { path: 'M-5-189 C-49-265-91-287-151-264', width: 8 },
  { path: 'M-49-245 C-113-282-173-260-197-219', width: 4 },
  { path: 'M2-187 C28-263 15-300 41-340', width: 8 },
  { path: 'M15-241 C68-300 111-303 154-275', width: 7 },
  { path: 'M2-159 C61-218 111-218 180-242', width: 9 },
  { path: 'M-151-264 C-196-241-211-207-210-151', width: 2 },
  { path: 'M-113-270 C-151-226-151-177-153-130', width: 2 },
  { path: 'M-65-267 C-98-227-99-181-92-143', width: 2 },
  { path: 'M40-325 C-9-314-36-275-33-234', width: 3 },
  { path: 'M106-291 C157-273 176-228 171-179', width: 2 },
  { path: 'M152-275 C208-252 222-209 214-160', width: 2 },
  { path: 'M178-241 C211-221 219-180 207-123', width: 2 },
  { path: 'M88-218 C116-196 121-149 114-113', width: 2 },
  { path: 'M-143-235 C-178-207-179-168-177-114', width: 2 },
];

const orchardBranches: readonly Branch[] = [
  { path: 'M-2-107 C-61-129-68-191-115-228', width: 11 },
  { path: 'M-49-154 C-83-178-123-175-165-192', width: 6 },
  { path: 'M-66-181 C-81-220-78-248-89-273', width: 5 },
  { path: 'M0-112 C31-168 13-210 37-278', width: 10 },
  { path: 'M16-186 C-13-222-22-255-46-275', width: 5 },
  { path: 'M11-134 C66-153 88-188 130-235', width: 10 },
  { path: 'M85-187 C133-182 152-211 174-231', width: 4 },
  { path: 'M41-257 C75-282 95-281 115-270', width: 3 },
  { path: 'M-115-228 C-146-230-163-257-168-279', width: 3 },
  { path: 'M127-231 C135-267 126-279 135-299', width: 3 },
];

const orchardTrunk = 'M-22 2 C-9-42-17-77-14-113 L-40-147 Q-14-138 0-124 Q17-141 31-156 L16-111 C8-62 10-28 27 2 Z';
const orchardCrowns: readonly Crown[] = [
  { x: -139, y: -234, rx: 68, ry: 57 },
  { x: -72, y: -267, rx: 67, ry: 60 },
  { x: 13, y: -289, rx: 72, ry: 61 },
  { x: 92, y: -279, rx: 72, ry: 65 },
  { x: 150, y: -218, rx: 62, ry: 61 },
  { x: -79, y: -188, rx: 70, ry: 48 },
  { x: 45, y: -209, rx: 84, ry: 64 },
];

const birchBranches: readonly Branch[] = [
  { path: 'M-1-136 C-38-178-66-190-92-207', width: 6 },
  { path: 'M-2-193 C33-216 68-246 93-273', width: 5 },
  { path: 'M-3-236 C-31-267-59-276-80-299', width: 5 },
  { path: 'M0-271 C32-300 49-319 55-344', width: 4 },
  { path: 'M-5-300 C-24-332-23-353-35-375', width: 3 },
  { path: 'M-38-179 C-47-211-69-228-77-255', width: 2 },
  { path: 'M42-230 C73-226 91-247 114-254', width: 2 },
  { path: 'M-35-270 C-56-306-49-333-54-354', width: 2 },
  { path: 'M31-308 C69-309 80-322 91-341', width: 2 },
];
const birchTrunk = 'M-12 3 C-7-97-11-187-8-272 L-8-357 L-2-393 L3-348 C8-252 1-170 9-86 L14 3 Z';
const birchCrowns: readonly Crown[] = [
  { x: -17, y: -354, rx: 49, ry: 56 },
  { x: 39, y: -320, rx: 53, ry: 57 },
  { x: -42, y: -293, rx: 63, ry: 61 },
  { x: 53, y: -261, rx: 65, ry: 55 },
  { x: -51, y: -225, rx: 66, ry: 49 },
  { x: 9, y: -213, rx: 49, ry: 57 },
];

export const landscapes: readonly Landscape[] = [
  {
    id: 'riverbend-willow',
    name: 'Riverbend willow',
    number: '01',
    caption: 'A slow river. A tree with room to wander.',
    note: 'Long, pendulous branches, honey-colored flowers, and reeds leaning over a winding river.',
    terrain: 'river',
    leafShape: 'lance',
    seed: 731,
    wind: 0.95,
    leafOut: 0.16,
    flowerAt: 0.22,
    fallStart: 0.69,
    fallSpread: 0.13,
    colors: { young: '#b7cd80', leaf: '#527e54', gold: '#d9a54e', blossom: '#f4e8b1', bark: '#665c48' },
    hills: [
      'M0 353 C129 312 230 365 355 308 S625 281 752 316 S1007 269 1100 298 L1100 620 H0Z',
      'M0 424 C157 341 353 349 561 399 S898 359 1100 407 L1100 620 H0Z',
      'M0 482 C200 455 362 485 527 455 S874 433 1100 484 L1100 620 H0Z',
    ],
    trees: [{
      x: 701, y: 518, scale: 1.12,
      trunk: 'M-22 3 C-12-58-22-139-9-214 C-7-234 7-254 16-273 C15-248 3-220 6-188 C11-119 1-71 21 2 Z',
      branches: willowBranches,
      leavesPerCrown: 18,
      crowns: [
        { x: -144, y: -250, rx: 69, ry: 60 },
        { x: -79, y: -289, rx: 76, ry: 58 },
        { x: 2, y: -318, rx: 67, ry: 56 },
        { x: 76, y: -309, rx: 74, ry: 58 },
        { x: 144, y: -262, rx: 68, ry: 65 },
        { x: -192, y: -198, rx: 42, ry: 74 },
        { x: -133, y: -192, rx: 47, ry: 77 },
        { x: -67, y: -224, rx: 58, ry: 68 },
        { x: 42, y: -252, rx: 60, ry: 66 },
        { x: 128, y: -193, rx: 42, ry: 81 },
        { x: 193, y: -190, rx: 37, ry: 82 },
      ],
    }],
  },
  {
    id: 'hillside-orchard',
    name: 'Hillside orchard',
    number: '02',
    caption: 'Three small crowns on a generous hillside.',
    note: 'Low, forked trunks carry rounded leaves, pink blossom, and late-summer fruit above curved field rows.',
    terrain: 'orchard',
    leafShape: 'oval',
    seed: 419,
    wind: 0.65,
    leafOut: 0.18,
    flowerAt: 0.225,
    fallStart: 0.65,
    fallSpread: 0.15,
    colors: { young: '#a5bc79', leaf: '#477251', gold: '#c98742', blossom: '#f0b9c3', bark: '#715745' },
    hills: [
      'M0 344 Q168 259 352 342 T728 323 T1100 319 L1100 620 H0Z',
      'M0 436 C158 392 251 334 437 379 S838 443 1100 365 L1100 620 H0Z',
      'M0 495 C229 509 330 433 564 462 S859 507 1100 455 L1100 620 H0Z',
    ],
    trees: [
      { x: 924, y: 465, scale: 0.56, trunk: orchardTrunk, branches: orchardBranches, crowns: orchardCrowns, leavesPerCrown: 8 },
      { x: 644, y: 495, scale: 1.03, trunk: orchardTrunk, branches: orchardBranches, crowns: orchardCrowns, leavesPerCrown: 12 },
      { x: 277, y: 529, scale: 0.8, trunk: orchardTrunk, branches: orchardBranches, crowns: orchardCrowns, leavesPerCrown: 11 },
    ],
  },
  {
    id: 'highland-birches',
    name: 'Highland birches',
    number: '03',
    caption: 'Pale trunks, open sky, a little mountain weather.',
    note: 'A loose grove of white-barked trees, spade-shaped leaves, exposed rock, and a cooler, windier ridgeline.',
    terrain: 'mountain',
    leafShape: 'spade',
    seed: 983,
    wind: 1.3,
    leafOut: 0.2,
    flowerAt: 0.235,
    fallStart: 0.64,
    fallSpread: 0.14,
    colors: { young: '#b4c485', leaf: '#69916b', gold: '#dcb655', blossom: '#e5d69c', bark: '#e3e2cb' },
    hills: [
      'M0 352 L134 251 L207 291 L387 137 L558 293 L678 208 L819 323 L964 194 L1100 306 V620 H0Z',
      'M0 405 C124 353 222 362 361 398 S648 333 789 371 S1002 379 1100 341 L1100 620 H0Z',
      'M0 502 C191 455 390 483 550 466 S885 421 1100 473 L1100 620 H0Z',
    ],
    trees: [
      { x: 432, y: 484, scale: 0.7, trunk: birchTrunk, branches: birchBranches, crowns: birchCrowns, leavesPerCrown: 10 },
      { x: 637, y: 518, scale: 1.02, trunk: birchTrunk, branches: birchBranches, crowns: birchCrowns, leavesPerCrown: 13 },
      { x: 838, y: 533, scale: 0.86, trunk: birchTrunk, branches: birchBranches, crowns: birchCrowns, leavesPerCrown: 12 },
    ],
  },
];

export const seasonStops = [
  { name: 'Spring', time: 0.26, color: '#afc796' },
  { name: 'Summer', time: 0.48, color: '#4d7958' },
  { name: 'Autumn', time: 0.75, color: '#c19456' },
  { name: 'Winter', time: 0.97, color: '#c4d9db' },
] as const;

export const INITIAL_TIME = 0.26;
export const YEAR_SECONDS = 72;
