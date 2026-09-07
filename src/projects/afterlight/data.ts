export const ROOM_IDS = ['dock', 'atrium', 'medbay', 'observatory', 'archive', 'relay', 'life', 'workshop', 'cryo', 'reactor', 'ballast', 'conduit'] as const;
export type RoomId = typeof ROOM_IDS[number];
export const CREW_IDS = ['vale', 'iona', 'moth'] as const;
export type CrewId = typeof CREW_IDS[number];
export const ITEMS = ['patch', 'medkit', 'cell'] as const;
export type Item = typeof ITEMS[number];
export const PRIORITIES = ['rescue', 'stabilize', 'core', 'explore', 'extract'] as const;
export const POWER = ['salvage', 'rescue', 'balanced'] as const;
export const OXYGEN = ['all', 'upper', 'lower'] as const;
export type Deck = 0 | 1;

export interface Room {
  id: RoomId;
  name: string;
  deck: Deck;
  sector: number;
  code: string;
  function: string;
}

export const ROOMS: readonly Room[] = [
  { id: 'dock', name: 'Dock / 01', deck: 0, sector: 0, code: 'A1', function: 'Shuttle, cargo delivery and extraction' },
  { id: 'atrium', name: 'Atrium', deck: 0, sector: 1, code: 'A2', function: 'Habitat junction' },
  { id: 'medbay', name: 'Medbay', deck: 0, sector: 2, code: 'A3', function: 'Survivor pod LARK' },
  { id: 'observatory', name: 'Observatory', deck: 0, sector: 3, code: 'A4', function: 'Forward survey station' },
  { id: 'archive', name: 'Archive', deck: 0, sector: 4, code: 'A5', function: 'Flight-memory core' },
  { id: 'relay', name: 'Relay', deck: 0, sector: 5, code: 'A6', function: 'Communications passage' },
  { id: 'life', name: 'Life support', deck: 1, sector: 0, code: 'B1', function: 'Damaged scrubber; repair reduces oxygen use' },
  { id: 'workshop', name: 'Workshop', deck: 1, sector: 1, code: 'B2', function: 'One spare patch and one cell' },
  { id: 'cryo', name: 'Cryogenics', deck: 1, sector: 2, code: 'B3', function: 'Survivor pod WREN' },
  { id: 'reactor', name: 'Reactor', deck: 1, sector: 3, code: 'B4', function: 'Restore the balanced power bus' },
  { id: 'ballast', name: 'Ballast', deck: 1, sector: 4, code: 'B5', function: 'Hull breach; isolate or patch' },
  { id: 'conduit', name: 'Conduit', deck: 1, sector: 5, code: 'B6', function: 'Engineering access' },
];

export interface Door { id: string; a: RoomId; b: RoomId; lift?: boolean }
export const DOORS: readonly Door[] = [
  { id: 'a12', a: 'dock', b: 'atrium' }, { id: 'a23', a: 'atrium', b: 'medbay' },
  { id: 'a34', a: 'medbay', b: 'observatory' }, { id: 'a45', a: 'observatory', b: 'archive' },
  { id: 'a56', a: 'archive', b: 'relay' }, { id: 'a61', a: 'relay', b: 'dock' },
  { id: 'b12', a: 'life', b: 'workshop' }, { id: 'b23', a: 'workshop', b: 'cryo' },
  { id: 'b34', a: 'cryo', b: 'reactor' }, { id: 'b45', a: 'reactor', b: 'ballast' },
  { id: 'b56', a: 'ballast', b: 'conduit' }, { id: 'b61', a: 'conduit', b: 'life' },
  { id: 'lift1', a: 'dock', b: 'life', lift: true },
  { id: 'lift3', a: 'medbay', b: 'cryo', lift: true },
  { id: 'lift5', a: 'archive', b: 'ballast', lift: true },
  { id: 'spine', a: 'life', b: 'reactor' },
];
export const BREACH_DOORS = ['b45', 'b56', 'lift5'];

export const CREW = [
  { id: 'vale', name: 'Vale', role: 'Systems engineer', color: '#f7be78', equipment: 'Arc spanner', maxEnergy: 10 },
  { id: 'iona', name: 'Iona', role: 'Rescue medic', color: '#f397ac', equipment: 'Pod harness', maxEnergy: 10 },
  { id: 'moth', name: 'Moth', role: 'Pathfinder', color: '#8de3e3', equipment: 'Deep scanner', maxEnergy: 12 },
] as const;

export interface Conditions { reserve: number; deadline: number; damage: number; layout: 'sealed' | 'open' }
export const DEFAULT_CONDITIONS: Conditions = { reserve: 200, deadline: 28, damage: 2, layout: 'sealed' };
export interface Orders {
  priority: typeof PRIORITIES[number];
  power: typeof POWER[number];
  oxygen: typeof OXYGEN[number];
  risk: 'safe' | 'eva';
  doors: { id: string; open: boolean }[];
  targets: { crew: CrewId; room: RoomId | 'auto' }[];
}
export interface CrewState {
  id: CrewId;
  room: RoomId;
  energy: number;
  air: number;
  inventory: Record<Item, number>;
  cargo: 'none' | 'lark' | 'wren' | 'core';
}
export interface RoomState { id: RoomId; known: boolean; pressure: number }
export interface CrewIntent { crew: CrewId; action: string; intention: string }
export interface Plan { tick: number; actions: CrewIntent[] }
export interface Job { crew: CrewId; label: string; path: RoomId[]; intention: string }
export interface State {
  seed: number;
  tick: number;
  status: 'active' | 'won' | 'lost';
  ending: string;
  conditions: Conditions;
  orders: Orders;
  oxygen: number;
  hull: number;
  rooms: RoomState[];
  crew: CrewState[];
  repaired: { reactor: boolean; life: boolean; breach: boolean };
  pods: { lark: 'waiting' | 'carried' | 'saved'; wren: 'waiting' | 'carried' | 'saved' };
  core: 'waiting' | 'carried' | 'saved';
  supplies: boolean;
  jobs: Job[];
  log: string[];
}
export interface Command { type: 'turn'; conditions: Conditions; orders: Orders; plan: Plan }
export type ActionKind = 'rest' | 'move' | 'scan' | 'repair' | 'rescue' | 'recover' | 'give' | 'collect' | 'deliver' | 'extract';
export interface LegalAction {
  id: string;
  kind: ActionKind;
  label: string;
  ap: number;
  energy: number;
  path: RoomId[];
  target?: 'reactor' | 'life' | 'breach';
  pod?: 'lark' | 'wren';
  recipient?: CrewId;
  item?: Item;
}

export function roomInfo(id: RoomId): Room { return ROOMS.find(room => room.id === id)!; }
export function position(id: RoomId): [number, number, number] {
  const room = roomInfo(id);
  const angle = room.sector * Math.PI / 3 + Math.PI / 6;
  return [Math.cos(angle) * 6.9, room.deck === 0 ? 2.2 : -2.2, Math.sin(angle) * 6.9];
}
export function initialOrders(conditions = DEFAULT_CONDITIONS): Orders {
  return {
    priority: 'rescue', power: 'salvage', oxygen: 'all', risk: 'safe',
    doors: DOORS.map(door => ({ id: door.id, open: conditions.layout === 'open' || !BREACH_DOORS.includes(door.id) })),
    targets: CREW_IDS.map(crew => ({ crew, room: 'auto' })),
  };
}
