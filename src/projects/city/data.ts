export const TILE_IDS = [
  'cottage', 'terrace', 'bakery', 'library', 'road', 'bridge',
  'park', 'garden', 'square', 'water', 'empty',
] as const;

export type TileId = typeof TILE_IDS[number];
export type TileKind = 'building' | 'street' | 'green' | 'square' | 'water' | 'empty';

export interface TileDefinition {
  readonly id: TileId;
  readonly name: string;
  readonly kind: TileKind;
  readonly color: string;
  readonly description: string;
  readonly rule: string;
}

export const tiles: readonly TileDefinition[] = [
  {
    id: 'cottage', name: 'Cottage', kind: 'building', color: '#c57d59',
    description: 'A low roof, a little chimney, somewhere to come home to.',
    rule: 'One building tile. A street or bridge on any shared side gives it frontage.',
  },
  {
    id: 'terrace', name: 'Row houses', kind: 'building', color: '#c78b81',
    description: 'Two narrow houses sharing a wall and a patch of afternoon sun.',
    rule: 'Still one building tile, not two households in a population model.',
  },
  {
    id: 'bakery', name: 'Bakery', kind: 'building', color: '#cc9a4d',
    description: 'A striped awning and the entirely imaginary smell of warm bread.',
    rule: 'One building tile. It follows the same frontage rule as a cottage.',
  },
  {
    id: 'library', name: 'Library', kind: 'building', color: '#718b85',
    description: 'A small civic roof for a very large collection of stories.',
    rule: 'One building tile. No extra influence radius or fictional service score.',
  },
  {
    id: 'road', name: 'Street', kind: 'street', color: '#777b70',
    description: 'A little ribbon of street. Its arms meet neighboring streets automatically.',
    rule: 'One graph node; joins streets and bridges across shared sides, never diagonals.',
  },
  {
    id: 'bridge', name: 'Bridge', kind: 'street', color: '#9b8966',
    description: 'A raised wooden crossing with water underneath and room for a small journey.',
    rule: 'A street node with the same four possible neighbors. Placement is not structurally checked.',
  },
  {
    id: 'park', name: 'Pocket park', kind: 'green', color: '#789263',
    description: 'Three trees, a meandering path, and a bench with no particular appointment.',
    rule: 'A green tile. Counts as green next door only across a shared side; not a street route.',
  },
  {
    id: 'garden', name: 'Allotment', kind: 'green', color: '#8e9a65',
    description: 'Neat little beds for ambitious beans and patient gardeners.',
    rule: 'A green tile, just like a park in this model. It does not connect street groups.',
  },
  {
    id: 'square', name: 'Square', kind: 'square', color: '#c7b591',
    description: 'A stone fountain and a little breathing room between the buildings.',
    rule: 'Open space, but neither a green tile nor a street node. The drawn paving is decorative.',
  },
  {
    id: 'water', name: 'Canal', kind: 'water', color: '#89adb1',
    description: 'Slow blue water with a few carefully drawn ripples.',
    rule: 'Not a street node. Water flow, flood risk, and navigation are not simulated.',
  },
  {
    id: 'empty', name: 'Empty plot', kind: 'empty', color: '#d8cbaa',
    description: 'Leave a little room for the next idea. Also works as an eraser.',
    rule: 'An unused tile. Replacing something with an empty plot is undoable.',
  },
];

export const tileById = Object.fromEntries(tiles.map((tile) => [tile.id, tile])) as Record<TileId, TileDefinition>;

export const presetLegend: Readonly<Record<string, TileId>> = {
  h: 'cottage', t: 'terrace', b: 'bakery', l: 'library', '+': 'road',
  '=': 'bridge', p: 'park', g: 'garden', s: 'square', '~': 'water', '.': 'empty',
};

export interface CityPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rows: readonly string[];
}

export const presets: readonly CityPreset[] = [
  {
    id: 'canal',
    name: 'Saturday by the canal',
    description: 'Two bridges, a loop of streets, and a few doorsteps still waiting for a street.',
    rows: [
      'ph+hlp~~',
      'ht+bsp~~',
      '++++++=+',
      'pl+ph+~p',
      'hb+tp+~h',
      '++++++=+',
      'ph+hbp~~',
      'gp+slp~~',
    ],
  },
  {
    id: 'lanes',
    name: 'Two quiet lanes',
    description: 'Two separate street groups. A single well-placed tile could bring them together.',
    rows: [
      'ph+hp~~p',
      'lh+bp~~p',
      '++++.+++',
      'pl+ph+~h',
      'hp+hp+~p',
      'ph.bh+~h',
      'pp.pl+~p',
      'gpphpp~p',
    ],
  },
  {
    id: 'commons',
    name: 'A square to share',
    description: 'A busy little quarter. Try making green space without losing the street connections.',
    rows: [
      '..h+hs~~',
      '.hh+bs~~',
      '++++++=+',
      'hlh+ht~s',
      'shh+h+~h',
      '++++++=+',
      '.hl+hb~~',
      'ggp+ss~~',
    ],
  },
];

export type RecipeRule =
  | 'six-streets' | 'joined-streets' | 'four-buildings'
  | 'every-frontage' | 'three-greens' | 'four-green-neighbors';

export interface CityRecipe {
  readonly number: string;
  readonly title: string;
  readonly presetId: string;
  readonly introduction: string;
  readonly steps: readonly string[];
  readonly checks: readonly { rule: RecipeRule; label: string }[];
  readonly hint: string;
}

export const recipes: readonly CityRecipe[] = [
  {
    number: '01', title: 'Stitch the lanes', presetId: 'lanes',
    introduction: 'A street can be beautifully drawn and still go nowhere near its neighbor.',
    steps: [
      'Start with Two quiet lanes and turn on “Road groups.” The numbers show the separate networks.',
      'Look for a gap with a street on each side. Add a street, then watch two groups become one.',
      'Remove a tile from the middle of the new connection. Did the group split again? Undo and compare.',
    ],
    checks: [
      { rule: 'six-streets', label: 'Keep at least 6 street or bridge tiles' },
      { rule: 'joined-streets', label: 'Bring every street into a single group' },
    ],
    hint: 'In the starting plan, E3 is the missing stitch. Diagonal corners will not do the job.',
  },
  {
    number: '02', title: 'A street at every doorstep', presetId: 'canal',
    introduction: 'Give the little buildings an edge on the street, not just a good-looking address.',
    steps: [
      'Start beside the canal. The observation notes list buildings with no street frontage.',
      'Select one of those addresses. Put a street on a neighboring side, or move the building beside one.',
      'Try a library diagonally across from a road. It may look close, but our rule does not count it.',
    ],
    checks: [
      { rule: 'four-buildings', label: 'Keep at least 4 building tiles' },
      { rule: 'every-frontage', label: 'Give every building a shared side with a street' },
    ],
    hint: 'The libraries at E1 and E8 need attention. E2 and D8 are useful places to investigate.',
  },
  {
    number: '03', title: 'The green next door', presetId: 'commons',
    introduction: 'A patch of green can have several neighbors. Arrange a few small commons.',
    steps: [
      'Start with A square to share. Replace a few building or empty tiles with parks or allotments.',
      'Try putting one green tile between two buildings. Both can count as green neighbors.',
      'Compare a compact green patch with scattered pocket parks. Which buildings actually share a side?',
    ],
    checks: [
      { rule: 'three-greens', label: 'Keep at least 3 park or allotment tiles' },
      { rule: 'four-green-neighbors', label: 'Give at least 4 buildings a green next door' },
    ],
    hint: 'A street between a building and a park breaks direct adjacency. This is a shape experiment, not a health claim.',
  },
];

export const fieldNotes = [
  {
    title: 'A very small graph',
    text: 'Each street or bridge tile is one node. Two nodes share one undirected edge exactly when their grid cells share a side: above, below, left, or right. Corner contact does not count. A road group is a connected component: any two of its nodes can be joined by a chain of those edges. An isolated street is a group of one; an empty plan has zero groups.',
  },
  {
    title: 'What “frontage” means here',
    text: 'A building has frontage if at least one street or bridge shares any of its four sides. We count each building tile once, even if it touches several streets. The illustrated doors do not determine the result. Frontage does not promise a route to every other building: its street may belong to a disconnected group.',
  },
  {
    title: 'Green means next door',
    text: 'A green neighbor is a park or an allotment sharing a side with a building. Each building counts once, however many green neighbors it has. Squares, canals, buildings, and green tiles are not street nodes; even a drawn path through a park cannot connect two street groups in this model.',
  },
  {
    title: 'A drawing is not a policy',
    text: 'This is a toy model, not real urban planning advice. A row-house tile still counts as one building tile, not a population estimate. Bridges can be placed anywhere and connect on all four sides. We do not model traffic, travel time, safe access, land ownership, budgets, flood risk, or environmental outcomes. There is no sustainability score and no claim that a prettier plan is a better real city.',
  },
] as const;
