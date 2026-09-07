export const FIELDS = ['barrier', 'power', 'water', 'food'] as const;
export type Field = typeof FIELDS[number];
export const DELEGATE_IDS = ['vale', 'reed', 'moss'] as const;
export type DelegateId = typeof DELEGATE_IDS[number];
export const CONDITIONS = ['sheltered', 'estuary', 'exposed'] as const;
export type Condition = typeof CONDITIONS[number];
export const VOTES = ['yes', 'no', 'abstain'] as const;
export type Vote = typeof VOTES[number];

export const WORKS = 12;
export const MAX_HEARINGS = 3;
export const MAX_AMENDMENTS = 2;
export const HEARING_COST = 2;
export const CAPACITY = 18;

export const SECTORS: Record<Field, { name: string; short: string; unit: string; effect: string }> = {
  barrier: { name: 'Flood wall', short: 'Wall', unit: 'defence', effect: '+2 defence / work; 4 works also repair 2 fabric.' },
  power: { name: 'Turbines', short: 'Grid', unit: 'generation', effect: '+3 energy / work; every 2 works earn 1 crown.' },
  water: { name: 'Cisterns', short: 'Water', unit: 'capture', effect: '+2 water / work; each work draws 1 energy.' },
  food: { name: 'Market gardens', short: 'Food', unit: 'harvest', effect: '+2 food / work. The city eats 7 each season.' },
};

export const DELEGATES: Record<DelegateId, {
  name: string; surname: string; title: string; field: Field; mark: string; goal: string; knowledge: string; constraint: string;
}> = {
  vale: {
    name: 'Mara Vale', surname: 'Vale', title: 'Quays union', field: 'barrier', mark: 'V',
    goal: 'Protect the low quays. Prefer zero flooding, a substantial safety margin, and reliable promises. Blunt, cautious, protective.',
    knowledge: 'You inspect the wall section, forecast river pressure, flood exposure, city fabric, and your own trust ledger.',
    constraint: 'Cannot vote yes if any flooding is predicted.',
  },
  reed: {
    name: 'Ivo Reed', surname: 'Reed', title: 'Grid cooperative', field: 'power', mark: 'R',
    goal: 'Keep the grid and municipal economy solvent. Prefer a positive energy reserve and productive turbines over idle overbuilding. Precise, pragmatic, transactional.',
    knowledge: 'You inspect generation, pumping load, energy storage, treasury, and hearing costs; you know your own trust ledger.',
    constraint: 'Cannot vote yes if energy runs short or the treasury becomes negative.',
  },
  moss: {
    name: 'Sela Moss', surname: 'Moss', title: 'Commons assembly', field: 'food', mark: 'M',
    goal: 'Secure shared food and clean water. Prefer healthy stores, gardens, and honored public pacts. Warm but uncompromising on essentials.',
    knowledge: 'You inspect rainfall, cistern yield, food harvest, consumption, flood contamination, and your own trust ledger.',
    constraint: 'Cannot vote yes if water or food runs short.',
  },
};

export const SETUPS: Record<Condition, { name: string; description: string; pressure: number; water: number; energy: number; food: number; funds: number; cohesion: number }> = {
  sheltered: { name: 'Sheltered reach', description: 'Lower tides and generous stores. Learn the council.', pressure: -1, water: 9, energy: 10, food: 11, funds: 22, cohesion: 74 },
  estuary: { name: 'Working estuary', description: 'A close budget, a rising river. The original campaign.', pressure: 0, water: 6, energy: 6, food: 8, funds: 16, cohesion: 62 },
  exposed: { name: 'Exposed coast', description: 'Higher water, tighter trust. Plan reserves early.', pressure: 1, water: 7, energy: 8, food: 9, funds: 16, cohesion: 58 },
};

export const SEASONS = [
  { name: 'Thaw', tide: 7, storm: 2, rain: 2, cold: 1, note: 'Meltwater arrives. Build consent before the river rises.' },
  { name: 'Springrise', tide: 8, storm: 2, rain: 3, cold: 0, note: 'A wet spring replenishes cisterns, not the grid.' },
  { name: 'Long light', tide: 8, storm: 3, rain: 1, cold: 0, note: 'A dry interval. Stored water is a public asset.' },
  { name: 'High water', tide: 9, storm: 3, rain: 3, cold: 0, note: 'The river climbs to the old quay line.' },
  { name: 'Storm arrival', tide: 9, storm: 4, rain: 4, cold: 2, note: 'Pumps and winter heating compete for energy.' },
  { name: 'Last tide', tide: 10, storm: 4, rain: 5, cold: 1, note: 'One last spring tide. Keep the city and the mandate intact.' },
] as const;

export type Policy = Record<Field, number>;
export interface Resources { water: number; energy: number; food: number; funds: number; integrity: number; cohesion: number }
export interface Decision { delegate: DelegateId; vote: Vote; promise: 'none' | 'reciprocate'; statement: string }
export interface Offer { delegate: DelegateId; from: Field; to: Field; amount: number }
export interface Plan { decisions: Decision[]; offers: Offer[] }
export interface Pact { delegate: DelegateId; field: Field; minimum: number; due: number }
export interface Projection {
  pressure: number; defence: number; flood: number;
  rain: number; captured: number; generation: number; load: number; harvest: number;
  income: number; expense: number; hearingCost: number;
  raw: { water: number; energy: number; food: number };
  shortage: { water: number; energy: number; food: number };
  spill: { water: number; energy: number; food: number };
  after: Resources;
}
export interface SeasonRecord {
  season: number; mode: 'adopted' | 'emergency'; policy: Policy; votes: Decision[];
  before: Resources; projection: Projection; trustNotes: string[];
}
export interface State {
  seed: number; condition: Condition; phase: 'setup' | 'draft' | 'ballot' | 'resolved' | 'won' | 'lost';
  season: number; policy: Policy; resources: Resources; hearings: number; amendments: number;
  decisions: Decision[]; offers: Offer[]; offeredBy: DelegateId[]; pledge: DelegateId | 'none';
  pacts: Pact[]; trust: Record<DelegateId, number>; history: SeasonRecord[]; ending: string;
}
export type Command =
  | { type: 'start'; condition: Condition }
  | { type: 'allocate'; field: Field; value: number }
  | { type: 'pledge'; delegate: DelegateId | 'none' }
  | { type: 'council'; plan: Plan }
  | { type: 'take-offer'; delegate: DelegateId }
  | { type: 'amend' }
  | { type: 'enact' }
  | { type: 'emergency' }
  | { type: 'next' };

export const INITIAL_POLICY: Policy = { barrier: 3, power: 3, water: 2, food: 4 };
export const EMERGENCY_POLICY: Policy = { barrier: 4, power: 3, water: 2, food: 3 };
