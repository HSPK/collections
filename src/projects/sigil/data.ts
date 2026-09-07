export const GLYPH_IDS = ['turn', 'mould', 'flare', 'sieve', 'facet', 'delay', 'echo', 'fork', 'weave'] as const;
export type Glyph = typeof GLYPH_IDS[number];
export type Hue = 0 | 1 | 2;
export interface Pulse { hue: Hue; shape: Hue; light: 1 | 2 }
export type Beam = Pulse | null;

export const HUES = ['amber', 'jade', 'vermilion'] as const;
export const SHAPES = ['ring', 'lozenge', 'triangle'] as const;
export const GLYPHS: Record<Glyph, { name: string; cost: number; rule: string; mark: string }> = {
  turn: { name: 'Turn', cost: 1, rule: 'Advance the color: amber > jade > vermilion > amber. Darkness stays dark.', mark: 'M14 9 A13 13 0 1 1 8 24 M14 9 H6 V17 M16 17 L24 17 L20 25 Z' },
  mould: { name: 'Mould', cost: 1, rule: 'Advance the shape: ring > lozenge > triangle > ring. Color and light stay unchanged.', mark: 'M7 25 L16 7 L25 25 Z M29 13 L35 19 L29 25 L23 19 Z' },
  flare: { name: 'Flare', cost: 1, rule: 'Exchange dim and bright. Darkness stays dark.', mark: 'M20 4 V11 M20 29 V36 M4 20 H11 M29 20 H36 M9 9 L14 14 M26 26 L31 31 M9 31 L14 26 M26 14 L31 9 M20 14 A6 6 0 1 0 20 26 A6 6 0 1 0 20 14' },
  sieve: { name: 'Sieve', cost: 1, rule: 'If the current color is amber, let it through. Otherwise output darkness.', mark: 'M6 9 H34 L24 23 V33 H16 V23 Z M12 15 H28' },
  facet: { name: 'Facet', cost: 1, rule: 'If the current shape is a triangle, advance its color once. Other shapes pass unchanged.', mark: 'M5 28 L20 5 L35 28 Z M12 22 H26 M22 17 L27 22 L22 27 M20 30 V36' },
  delay: { name: 'Delay', cost: 2, rule: 'Output the previous tick entering THIS tile. Remember the current input for next tick. The first output is dark.', mark: 'M9 5 H31 M9 35 H31 M12 5 C12 16 28 24 28 35 M28 5 C28 16 12 24 12 35 M15 11 H25 M15 29 H25' },
  echo: { name: 'Echo', cost: 2, rule: 'Pass the current light. Only on darkness, output the previous input to THIS tile. Remember inputs, not outputs; echoes do not repeat forever.', mark: 'M12 11 A12 12 0 1 0 12 29 M20 7 A16 16 0 1 1 20 33 M9 20 H27 M23 16 L27 20 L23 24' },
  fork: { name: 'Fork', cost: 1, rule: 'Copy this tick into a side register; the main stream continues. Only one fork may be open.', mark: 'M8 33 V24 C8 15 20 20 20 11 V5 M8 24 C8 15 32 20 32 11 V5 M16 9 L20 5 L24 9 M28 9 L32 5 L36 9' },
  weave: { name: 'Weave', cost: 2, rule: 'Rejoin the fork. For two lights, add color and shape indices modulo 3; brightness becomes bright. Darkness is the identity. Close the fork.', mark: 'M8 5 V13 C8 22 20 18 20 28 V35 M32 5 V13 C32 22 20 18 20 28 M16 31 L20 35 L24 31 M5 10 H11 M29 10 H35' },
};

export const CHAPTERS = [
  { name: 'The chromatic gate', lesson: 'Ordering', numeral: 'I', text: 'A gate reads the color it receives, not the color a light began with.' },
  { name: 'A conditional hand', lesson: 'Conditionals', numeral: 'II', text: 'A shape can decide which lights change. Before and after are different spells.' },
  { name: 'The patient glass', lesson: 'Memory', numeral: 'III', text: 'Time belongs to each tile. Darkness is an event, not an absent tick.' },
  { name: 'Two threads, one light', lesson: 'Branches', numeral: 'IV', text: 'Keep one copy untouched while the other travels; then recombine their indices.' },
  { name: 'The conjunction', lesson: 'Composition', numeral: 'V', text: 'Bind a remembered or conditional thread to the present without losing the grammar.' },
] as const;

export const CHALLENGE_IDS = [
  'gate-after', 'gate-before', 'facet-after', 'facet-before', 'late-gate',
  'borrowed-light', 'double-ink', 'braided-gate', 'eclipse', 'palimpsest',
] as const;
export type ChallengeId = typeof CHALLENGE_IDS[number];
export const DISCIPLINES = ['roomy', 'precise'] as const;
export type Discipline = typeof DISCIPLINES[number];
export const HINT_IDS = ['none', 'principle', 'first-glyph', 'witness'] as const;
export type HintId = typeof HINT_IDS[number];

export interface Challenge {
  id: ChallengeId;
  chapter: number;
  name: string;
  goal: string;
  palette: readonly Glyph[];
  target: readonly Glyph[];
  principle: string;
}

// Target recipes are executable specifications, not answers required of the player.
// Any well-formed program with the same behavior on the complete suite is accepted.
export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'gate-after', chapter: 0, name: 'The red admission',
    goal: 'Only originally vermilion lights may remain. Turn those survivors amber; preserve shape, brightness and timing.',
    palette: ['turn', 'sieve', 'flare'], target: ['turn', 'sieve'],
    principle: 'The Sieve recognizes amber. An originally vermilion light must reach it as amber.',
  },
  {
    id: 'gate-before', chapter: 0, name: 'The green departure',
    goal: 'Only originally amber lights may remain. Turn those survivors jade; preserve shape, brightness and timing.',
    palette: ['turn', 'sieve', 'flare'], target: ['sieve', 'turn'],
    principle: 'Keep the eligible lights before changing the color by which they are recognized.',
  },
  {
    id: 'facet-after', chapter: 1, name: 'The becoming triangle',
    goal: 'Advance every shape once. Advance the color only of lights that were originally lozenges.',
    palette: ['mould', 'facet', 'turn', 'sieve'], target: ['mould', 'facet'],
    principle: 'Facet reads triangles. Mould can turn an original lozenge into the triangle it reads.',
  },
  {
    id: 'facet-before', chapter: 1, name: 'The departing triangle',
    goal: 'Advance the color only of original triangles, then advance every shape once.',
    palette: ['mould', 'facet', 'turn', 'sieve'], target: ['facet', 'mould'],
    principle: 'Do not erase the evidence of an original triangle before the conditional tile reads it.',
  },
  {
    id: 'late-gate', chapter: 2, name: 'One beat too late',
    goal: 'Keep only original amber lights and turn them jade. Move that result one tick later, starting in darkness.',
    palette: ['delay', 'echo', 'turn', 'sieve', 'flare'], target: ['sieve', 'turn', 'delay'],
    principle: 'Delay remembers its input, not its output. All tiles begin with empty memory for each specimen.',
  },
  {
    id: 'borrowed-light', chapter: 2, name: 'A borrowed afterimage',
    goal: 'Advance every color. Fill each original dark tick with the immediately previous recolored input. Then keep only amber.',
    palette: ['delay', 'echo', 'turn', 'sieve', 'flare'], target: ['turn', 'echo', 'sieve'],
    principle: 'Echo must see darkness before a gate creates any new dark ticks. It remembers only one input.',
  },
  {
    id: 'double-ink', chapter: 3, name: 'The doubled inscription',
    goal: 'Add an untouched copy to a copy whose color advanced once. Add both color and shape indices modulo three; light becomes bright.',
    palette: ['fork', 'turn', 'mould', 'weave', 'sieve'], target: ['fork', 'turn', 'weave'],
    principle: 'Fork stores the untouched input of this tick. Turn changes only the continuing thread; Weave joins them.',
  },
  {
    id: 'braided-gate', chapter: 3, name: 'The amber braid',
    goal: 'Add an untouched copy to a copy whose shape advanced once. Only amber results of the addition may survive.',
    palette: ['fork', 'turn', 'mould', 'weave', 'sieve'], target: ['fork', 'mould', 'weave', 'sieve'],
    principle: 'Filtering before addition and filtering the sum are different. Weave adds color indices, too.',
  },
  {
    id: 'eclipse', chapter: 4, name: 'The present eclipsed',
    goal: 'Keep a copy of the present. Delay the other thread one tick, advance its color only on triangles, then add it to the present. Keep only amber sums.',
    palette: ['fork', 'delay', 'facet', 'weave', 'sieve', 'turn'], target: ['fork', 'delay', 'facet', 'weave', 'sieve'],
    principle: 'The fork belongs to the present tick; the delayed thread belongs to the preceding tick. Facet acts on that older thread.',
  },
  {
    id: 'palimpsest', chapter: 4, name: 'An illuminated absence',
    goal: 'Keep the present untouched in a fork. Advance the main shapes and fill its dark ticks from its previous input. Add both threads; advance the color of resulting triangles.',
    palette: ['fork', 'mould', 'echo', 'weave', 'facet', 'sieve'], target: ['fork', 'mould', 'echo', 'weave', 'facet'],
    principle: 'The final conditional reads the combined shape, not either original shape. Echo carries a changed shape into absence.',
  },
];

export function challengeById(id: ChallengeId): Challenge {
  const found = CHALLENGES.find(item => item.id === id);
  if (!found) throw new Error(`Missing Sigil catalog entry: ${id}`);
  return found;
}
