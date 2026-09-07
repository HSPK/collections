export const CARGO_IDS = [
  'rain-tea', 'folded-piano', 'bottled-noon', 'moon-moths', 'rain-seeds',
  'pocket-tide', 'echo-pearls', 'glass-orchard', 'winter-salt', 'stolen-tomorrow',
] as const;
export type CargoId = typeof CARGO_IDS[number];
export const LICENCES = ['none', 'botanical', 'resonant', 'both'] as const;
export type Licence = typeof LICENCES[number];
export const PACKINGS = ['paper', 'cradle', 'stasis'] as const;
export type Packing = typeof PACKINGS[number];
export const VERDICTS = ['admit', 'quarantine', 'return'] as const;
export type Verdict = typeof VERDICTS[number];

export interface Cargo {
  id: CargoId;
  name: string;
  mass: number;
  temperature: number;
  value: number;
  licence: 'none' | 'botanical' | 'resonant';
  hazard: 'none' | 'living' | 'pressure' | 'contraband';
  shape: 'leaves' | 'keys' | 'sun' | 'moths' | 'seeds' | 'wave' | 'pearls' | 'tree' | 'crystal' | 'clock';
  note: string;
}

export const CARGO: readonly Cargo[] = [
  { id: 'rain-tea', name: 'Rain tea', mass: 4, temperature: 18, value: 2, licence: 'none', hazard: 'none', shape: 'leaves', note: 'Brews a small, private drizzle. Ordinary domestic cargo.' },
  { id: 'folded-piano', name: 'Folded piano', mass: 17, temperature: -4, value: 7, licence: 'resonant', hazard: 'none', shape: 'keys', note: 'An entire concert folded along its silences.' },
  { id: 'bottled-noon', name: 'Bottled noon', mass: 6, temperature: 84, value: 6, licence: 'none', hazard: 'none', shape: 'sun', note: 'A hot hour. Requires a stasis seal at every checkpoint.' },
  { id: 'moon-moths', name: 'Moon moths', mass: 3, temperature: 22, value: 5, licence: 'botanical', hazard: 'living', shape: 'moths', note: 'Living lunar pollinators. Habitat directive starts at traveller 3.' },
  { id: 'rain-seeds', name: 'Rain seeds', mass: 2, temperature: 8, value: 3, licence: 'botanical', hazard: 'none', shape: 'seeds', note: 'Dormant, not living cargo under the habitat directive.' },
  { id: 'pocket-tide', name: 'Pocket tide', mass: 12, temperature: 5, value: 8, licence: 'none', hazard: 'pressure', shape: 'wave', note: 'A pressurised sea. Cradle or stasis required.' },
  { id: 'echo-pearls', name: 'Echo pearls', mass: 8, temperature: 16, value: 6, licence: 'resonant', hazard: 'none', shape: 'pearls', note: 'Jewellery containing second-hand voices.' },
  { id: 'glass-orchard', name: 'Glass orchard', mass: 11, temperature: 32, value: 5, licence: 'none', hazard: 'none', shape: 'tree', note: 'Sculpture, not a living organism. No botanical licence required.' },
  { id: 'winter-salt', name: 'Winter salt', mass: 9, temperature: -18, value: 6, licence: 'none', hazard: 'none', shape: 'crystal', note: 'Crystallised cold. Cold-chain directive starts at traveller 5.' },
  { id: 'stolen-tomorrow', name: 'Unissued tomorrow', mass: 5, temperature: -9, value: 12, licence: 'none', hazard: 'contraband', shape: 'clock', note: 'Unallocated civic time. Prohibited in every container.' },
];

export const PACKAGING: Record<Packing, { name: string; mass: number; price: number; seal: string }> = {
  paper: { name: 'Waxed paper', mass: 1, price: 0, seal: 'P / ordinary wax' },
  cradle: { name: 'Pressure cradle', mass: 3, price: 2, seal: 'C / load-bearing brass' },
  stasis: { name: 'Stasis glass', mass: 2, price: 3, seal: 'S / continuous double ring' },
};

export interface Traveller {
  name: string;
  title: string;
  origin: string;
  personality: string;
  objective: string;
  preference: 'admit' | 'quarantine';
  licence: Licence;
  wallet: number;
  minimumValue: number;
  cargo: readonly CargoId[];
  color: string;
}

export const TRAVELLERS: readonly Traveller[] = [
  { name: 'Iona Vell', title: 'The weather factor', origin: 'The Soft Republic', personality: 'Precise, politely evasive; treats every delay as a breach of etiquette.', objective: 'Deliver a valuable parcel directly. Keep at least one credit if possible.', preference: 'admit', licence: 'resonant', wallet: 5, minimumValue: 2, cargo: ['rain-tea', 'folded-piano', 'bottled-noon'], color: '#c58658' },
  { name: 'Sister Spindle', title: 'Keeper of small migrations', origin: 'The Ninth Greenhouse', personality: 'Protective and sincere about living things, slippery about paperwork.', objective: 'Get the nursery cargo across. Supervised quarantine is better than return.', preference: 'quarantine', licence: 'botanical', wallet: 4, minimumValue: 3, cargo: ['moon-moths', 'rain-seeds', 'rain-tea', 'stolen-tomorrow'], color: '#809771' },
  { name: 'Orris Two-Tides', title: 'Salvage auctioneer', origin: 'The Inland Ocean', personality: 'Grandiose, competitive, always counteroffers. Values money over candour.', objective: 'Admit high-value salvage. Sell partial disclosure only for a good price.', preference: 'admit', licence: 'resonant', wallet: 6, minimumValue: 6, cargo: ['pocket-tide', 'echo-pearls', 'rain-tea', 'bottled-noon'], color: '#6a9599' },
  { name: 'June-of-the-Glass', title: 'Unlicensed optimist', origin: 'The Transparent District', personality: 'Warm, distractible; tries to charm the officer into overlooking awkward cargo.', objective: 'Get the most valuable shipment through, even if the declaration must be creative.', preference: 'admit', licence: 'botanical', wallet: 5, minimumValue: 5, cargo: ['glass-orchard', 'moon-moths', 'stolen-tomorrow', 'rain-seeds'], color: '#b49c61' },
  { name: 'The Quiet Auditor', title: 'Independent time broker', origin: 'A winter without a year', personality: 'Dry, exacting, never lies unnecessarily. Refuses cheap disclosure.', objective: 'Cross with a valuable cold shipment; avoid surrendering the cargo to return.', preference: 'admit', licence: 'none', wallet: 6, minimumValue: 6, cargo: ['folded-piano', 'winter-salt', 'stolen-tomorrow', 'rain-tea'], color: '#8c899e' },
  { name: 'Peregrine Last', title: 'Courier of the closing bell', origin: 'The Far Side of Thursday', personality: 'Fast-talking and opportunistic. Exploits the officer’s depleted resources.', objective: 'Deliver at least eight value. Pay for quarantine if direct admission looks unlikely.', preference: 'admit', licence: 'both', wallet: 7, minimumValue: 8, cargo: CARGO_IDS, color: '#ba705f' },
];

export const REGULATIONS = [
  { id: '01', from: 1, title: 'Unissued time', body: 'Unissued tomorrow is prohibited. RETURN, regardless of licences or containment.' },
  { id: '02', from: 1, title: 'Authority, not assertion', body: 'A missing required botanical or resonant licence means RETURN. The registry is authoritative; the declaration is not.' },
  { id: '03', from: 1, title: 'Heat & pressure', body: 'Cargo above 45°C requires stasis. A pocket tide requires a pressure cradle or stasis. Without it, QUARANTINE.' },
  { id: '04', from: 3, title: 'Living habitat directive', body: 'From traveller 3: living moon moths require stasis. Without it, QUARANTINE. Dormant seeds and glass sculpture are exempt.' },
  { id: '05', from: 5, title: 'Cold-chain directive', body: 'From traveller 5: any cargo below 0°C requires stasis. Without it, QUARANTINE, even in a pressure cradle.' },
  { id: '06', from: 5, title: 'Heavy crossing directive', body: 'From traveller 5: gross mass above 20 kg requires a cradle or stasis. Without it, QUARANTINE.' },
] as const;

export const CAMPAIGN = { travellers: 6, minutes: 36, credits: 14, scans: 3, trust: 6, scanPrice: 4, quarantineFee: 2, passingCases: 5 } as const;

export function cargoById(id: CargoId): Cargo {
  const cargo = CARGO.find(item => item.id === id);
  if (!cargo) throw new Error(`Unknown cargo: ${id}`);
  return cargo;
}
