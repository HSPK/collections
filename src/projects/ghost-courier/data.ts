export const NODE_IDS = [
  'dock', 'steps', 'fork', 'relay', 'bridge', 'vault', 'gantry', 'drop',
  'alley', 'quay', 'kiln', 'market', 'tower', 'landing', 'balcony', 'brake',
] as const;
export type NodeId = typeof NODE_IDS[number];
export const CIRCUIT_IDS = [
  'canal-watch', 'forge-round', 'roof-line',
  'tram-watch', 'stack-round', 'bell-line',
  'drain-watch', 'press-round', 'crown-line',
] as const;
export type CircuitId = typeof CIRCUIT_IDS[number];
export const GUARD_IDS = ['needle', 'rivet'] as const;
export type GuardId = typeof GUARD_IDS[number];

export interface CityNode {
  id: NodeId;
  name: string;
  x: number;
  y: number;
  z: number;
  kind: 'street' | 'switch' | 'parcel' | 'drop' | 'start';
}
export interface Edge { a: NodeId; b: NodeId; switch?: NodeId }
export interface Circuit { id: CircuitId; name: string; nodes: NodeId[] }
export interface CaseSettings { beats: number; alarm: number; loops: number }
export interface Heist {
  id: string;
  title: string;
  district: string;
  parcel: string;
  brief: string;
  hint: string;
  nodes: CityNode[];
  edges: Edge[];
  circuits: Circuit[];
  settings: CaseSettings;
}

function node(id: NodeId, name: string, x: number, y: number, z = 0, kind: CityNode['kind'] = 'street'): CityNode {
  return { id, name, x, y, z, kind };
}
function edge(a: NodeId, b: NodeId, hold?: NodeId): Edge {
  return hold ? { a, b, switch: hold } : { a, b };
}

// Coordinates author the diorama; only explicit edges authorize movement.
export const CASES: readonly Heist[] = [
  {
    id: 'bellfoundry', title: 'The borrowed minute', district: '01 / BELLFOUNDRY',
    parcel: 'A minute stolen from the night shift',
    brief: 'Take the bottled minute from the vault to the dead-letter office. The bridge listens to a pressure relay.',
    hint: 'Record Dock > Steps > Fork > Relay, then rewind. Your echo stays on the relay after its recording ends. Take the bridge at beat 3, then cross to the vault.',
    settings: { beats: 18, alarm: 6, loops: 3 },
    nodes: [
      node('dock', 'Dock', 0, 4, 0, 'start'), node('steps', 'Steps', 1, 4, .15),
      node('fork', 'Fork', 2, 4, .35), node('relay', 'Relay', 2, 5, .35, 'switch'),
      node('bridge', 'Bridge', 3, 4, .55), node('vault', 'Vault', 4, 4, 1, 'parcel'),
      node('gantry', 'Gantry', 4, 3, 1.1), node('drop', 'Dead letter', 3, 2, 1.15, 'drop'),
      node('alley', 'Alley', 1, 3, .1), node('quay', 'Quay', 0, 3),
      node('kiln', 'Kiln', 3, 5, .5), node('market', 'Market', 4, 5, .6),
      node('tower', 'Tower', 5, 3, 1.3),
    ],
    edges: [
      edge('dock', 'steps'), edge('steps', 'fork'), edge('fork', 'relay'), edge('fork', 'bridge'),
      edge('bridge', 'vault', 'relay'), edge('vault', 'gantry'), edge('gantry', 'drop'),
      edge('steps', 'alley'), edge('alley', 'quay'), edge('quay', 'steps'),
      edge('bridge', 'kiln'), edge('kiln', 'market'), edge('market', 'bridge'),
      edge('gantry', 'tower'), edge('tower', 'drop'),
    ],
    circuits: [
      { id: 'canal-watch', name: 'Canal watch', nodes: ['quay', 'alley', 'steps'] },
      { id: 'forge-round', name: 'Forge round', nodes: ['kiln', 'market', 'bridge'] },
      { id: 'roof-line', name: 'Roof line', nodes: ['tower', 'gantry', 'drop'] },
    ],
  },
  {
    id: 'pendulum-stacks', title: 'The unwritten names', district: '02 / PENDULUM STACKS',
    parcel: 'The names the city erased',
    brief: 'Reach the upper relay by the landing. A held relay opens both the tram barrier and the archive shutter.',
    hint: 'Record Dock > Steps > Landing > Relay. Rewind. Dock > Steps > Fork, wait one beat for the echo, then Bridge > Vault > Gantry > Dead letter.',
    settings: { beats: 20, alarm: 6, loops: 3 },
    nodes: [
      node('dock', 'Dock', 0, 5, 0, 'start'), node('steps', 'Steps', 1, 5, .2),
      node('fork', 'Fork', 2, 5, .2), node('landing', 'Landing', 1, 4, .9),
      node('relay', 'Relay', 1, 3, 1.3, 'switch'), node('bridge', 'Bridge', 3, 5, .7),
      node('vault', 'Vault', 4, 4, 1.25, 'parcel'), node('gantry', 'Gantry', 4, 3, 1.65),
      node('drop', 'Dead letter', 3, 2, 1.8, 'drop'),
      node('alley', 'Alley', 0, 4), node('quay', 'Quay', -1, 4),
      node('kiln', 'Switchyard', 3, 6, .3), node('market', 'Platform', 4, 6, .3),
      node('tower', 'Bell', 5, 2, 1.8),
    ],
    edges: [
      edge('dock', 'steps'), edge('steps', 'fork'), edge('steps', 'landing'), edge('landing', 'relay'),
      edge('fork', 'bridge', 'relay'), edge('bridge', 'vault', 'relay'),
      edge('vault', 'gantry'), edge('gantry', 'drop'),
      edge('steps', 'alley'), edge('alley', 'quay'), edge('quay', 'steps'),
      edge('bridge', 'kiln'), edge('kiln', 'market'), edge('market', 'bridge'),
      edge('gantry', 'tower'), edge('tower', 'drop'),
    ],
    circuits: [
      { id: 'tram-watch', name: 'Tram watch', nodes: ['quay', 'alley', 'steps'] },
      { id: 'stack-round', name: 'Stack round', nodes: ['kiln', 'market', 'bridge'] },
      { id: 'bell-line', name: 'Bell line', nodes: ['tower', 'gantry', 'drop'] },
    ],
  },
  {
    id: 'zero-hour', title: 'An hour for everyone', district: '03 / ZERO-HOUR PRESS',
    parcel: 'The master key to tomorrow',
    brief: 'Two shutters. Two echoes. Leave one recording at the relay and another at the brake. Carry tomorrow out on your third loop.',
    hint: 'Loop 1: Dock > Steps > Fork > Relay. Loop 2: Dock > Steps > Fork > Balcony > Brake. Loop 3: take Bridge > Vault > Gantry > Dead letter. Both echoes hold their final positions.',
    settings: { beats: 22, alarm: 6, loops: 3 },
    nodes: [
      node('dock', 'Dock', 0, 5, 0, 'start'), node('steps', 'Steps', 1, 5, .1),
      node('fork', 'Fork', 2, 5, .35), node('relay', 'Relay', 2, 6, .35, 'switch'),
      node('balcony', 'Balcony', 2, 4, .9), node('brake', 'Brake', 2, 3, 1.2, 'switch'),
      node('bridge', 'Bridge', 3, 5, .7), node('vault', 'Vault', 4, 5, 1.15, 'parcel'),
      node('gantry', 'Gantry', 4, 4, 1.5), node('drop', 'Dead letter', 4, 2, 1.7, 'drop'),
      node('alley', 'Alley', 0, 4), node('quay', 'Quay', -1, 4),
      node('kiln', 'Press', 3, 6, .4), node('market', 'Flywheel', 4, 6, .4),
      node('tower', 'Crown', 5, 3, 2),
    ],
    edges: [
      edge('dock', 'steps'), edge('steps', 'fork'), edge('fork', 'relay'),
      edge('fork', 'balcony'), edge('balcony', 'brake'), edge('fork', 'bridge'),
      edge('bridge', 'vault', 'relay'), edge('vault', 'gantry', 'brake'), edge('gantry', 'drop'),
      edge('steps', 'alley'), edge('alley', 'quay'), edge('quay', 'steps'),
      edge('bridge', 'kiln'), edge('kiln', 'market'), edge('market', 'bridge'),
      edge('gantry', 'tower'), edge('tower', 'drop'),
    ],
    circuits: [
      { id: 'drain-watch', name: 'Drain watch', nodes: ['quay', 'alley', 'steps'] },
      { id: 'press-round', name: 'Press round', nodes: ['kiln', 'market', 'bridge'] },
      { id: 'crown-line', name: 'Crown line', nodes: ['tower', 'gantry', 'drop'] },
    ],
  },
];
