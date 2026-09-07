import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, isRecord, object, text } from '../../core/agents/schema';
import { CASES, CIRCUIT_IDS, GUARD_IDS, NODE_IDS } from './data';
import type { CaseSettings, CircuitId, Edge, GuardId, Heist, NodeId } from './data';

export interface Assignment { guard: GuardId; circuit: CircuitId; offset: number }
export interface Plan { assignments: Assignment[]; bulletin: string }
export type Intent = 'start' | 'rewind' | 'next';
export type Phase = 'ready' | 'running' | 'caught' | 'delivered' | 'won' | 'lost';
export interface Guard extends Assignment { index: number; distracted: boolean }
export interface Recording { heist: number; loop: number; path: NodeId[]; outcome: string }
export interface State {
  seed: number;
  heist: number;
  phase: Phase;
  settings: CaseSettings[];
  loop: number;
  tick: number;
  position: NodeId;
  carrying: boolean;
  suspicion: number;
  guards: Guard[];
  echoes: NodeId[][];
  trace: NodeId[];
  archives: Recording[];
  bulletin: string;
  message: string;
  deliveries: number;
}
export type Command =
  | { type: 'plan'; intent: Intent; plan: Plan }
  | { type: 'move'; to: NodeId }
  | { type: 'wait' }
  | { type: 'deliver' }
  | { type: 'setup'; cases: CaseSettings[] };

export function parsePlan(value: unknown): Plan {
  const p = object(value, ['assignments', 'bulletin'], 'Patrol plan');
  return {
    assignments: array(p.assignments, entry => {
      const a = object(entry, ['guard', 'circuit', 'offset'], 'Guard assignment');
      return {
        guard: choice(a.guard, GUARD_IDS, 'Guard'),
        circuit: choice(a.circuit, CIRCUIT_IDS, 'Circuit'),
        offset: integer(a.offset, 'Circuit offset', 0, 2),
      };
    }, 'Assignments', 2, 2),
    bulletin: text(p.bulletin, 'Public bulletin', 180),
  };
}

export function parseCommand(value: unknown): Command {
  requireRule(isRecord(value), 'Command must be an object.');
  const type = choice(value.type, ['plan', 'move', 'wait', 'deliver', 'setup'] as const, 'Command');
  if (type === 'plan') {
    const c = object(value, ['type', 'intent', 'plan']);
    return { type, intent: choice(c.intent, ['start', 'rewind', 'next'] as const, 'Turn'), plan: parsePlan(c.plan) };
  }
  if (type === 'move') {
    const c = object(value, ['type', 'to']);
    return { type, to: choice(c.to, NODE_IDS, 'Address') };
  }
  if (type === 'setup') {
    const c = object(value, ['type', 'cases']);
    return { type, cases: array(c.cases, entry => {
      const s = object(entry, ['beats', 'alarm', 'loops'], 'Case settings');
      return {
        beats: integer(s.beats, 'Beats', 16, 32),
        alarm: integer(s.alarm, 'Alarm limit', 4, 8),
        loops: integer(s.loops, 'Loop budget', 3, 4),
      };
    }, 'Cases', 3, 3) };
  }
  object(value, ['type']);
  return { type };
}

export function create(seed: number): State {
  return {
    seed, heist: 0, phase: 'ready', settings: CASES.map(c => ({ ...c.settings })),
    loop: 0, tick: 0, position: 'dock', carrying: false, suspicion: 0,
    guards: [], echoes: [], trace: ['dock'], archives: [], bulletin: '',
    message: 'Survey the city. A connected model must assign the first patrol before the clock can start.',
    deliveries: 0,
  };
}

export function heistOf(state: State): Heist { return CASES[state.heist]; }
export function nodeName(id: NodeId, heist: Heist): string { return heist.nodes.find(n => n.id === id)?.name ?? id; }
export function echoAt(trace: readonly NodeId[], tick: number): NodeId { return trace[Math.min(tick, trace.length - 1)]; }
export function held(state: State, id: NodeId, tick = state.tick): boolean {
  return state.position === id || state.echoes.some(echo => echoAt(echo, tick) === id);
}
export function gateOpen(state: State, edge: Edge): boolean { return !edge.switch || held(state, edge.switch); }
export function exits(state: State): { to: NodeId; open: boolean; switch?: NodeId }[] {
  return heistOf(state).edges.filter(e => e.a === state.position || e.b === state.position).map(e => ({
    to: e.a === state.position ? e.b : e.a, open: gateOpen(state, e), switch: e.switch,
  }));
}
export function guardPosition(heist: Heist, guard: Guard): NodeId {
  const circuit = heist.circuits.find(c => c.id === guard.circuit);
  requireRule(circuit, 'The guard must use a circuit from this district.');
  return circuit.nodes[guard.index];
}

export function forecast(state: State): { guard: GuardId; from: NodeId; to: NodeId; decoy: boolean }[] {
  const heist = heistOf(state);
  return state.guards.map(guard => {
    const circuit = heist.circuits.find(c => c.id === guard.circuit);
    requireRule(circuit, 'Unknown guard circuit.');
    const from = circuit.nodes[guard.index];
    const next = circuit.nodes[(guard.index + 1) % circuit.nodes.length];
    const decoy = !guard.distracted && state.echoes.some(e => echoAt(e, state.tick + 1) === next);
    return { guard: guard.guard, from, to: decoy ? from : next, decoy };
  });
}

export function turnTarget(state: State, intent: Intent): number {
  if (intent === 'start') requireRule(state.phase === 'ready', 'The campaign has already started.');
  if (intent === 'next') requireRule(state.phase === 'delivered' && state.heist < CASES.length - 1, 'Deliver this parcel before opening another heist.');
  if (intent === 'rewind') {
    requireRule(state.phase === 'running' || state.phase === 'caught', 'Only a running or caught loop can rewind.');
    requireRule(state.tick > 0, 'Record at least one beat before rewinding.');
    requireRule(state.loop < state.settings[state.heist].loops, 'No loops remain.');
  }
  return state.heist + (intent === 'next' ? 1 : 0);
}

function record(state: State): Recording {
  return { heist: state.heist, loop: state.loop, path: [...state.trace], outcome: state.phase };
}

export function reduce(state: State, input: Command): State {
  // The same strict parser protects direct reducer calls and imported command chains.
  const command = parseCommand(input);
  if (command.type === 'setup') {
    requireRule(state.phase === 'ready', 'Case files can only be edited before the campaign starts. Restart first.');
    return { ...state, settings: command.cases, message: 'Case files updated. No clock or model request has started.' };
  }
  if (command.type === 'plan') {
    const heist = turnTarget(state, command.intent);
    const data = CASES[heist];
    requireRule(new Set(command.plan.assignments.map(a => a.guard)).size === 2, 'Assign Needle and Rivet exactly once each.');
    requireRule(new Set(command.plan.assignments.map(a => a.circuit)).size === 2, 'The guards must cover two different circuits.');
    for (const assignment of command.plan.assignments) {
      const circuit = data.circuits.find(c => c.id === assignment.circuit);
      requireRule(circuit, 'Choose only a named legal circuit in the target district.');
      requireRule(assignment.offset < circuit.nodes.length, 'Offset is outside this circuit.');
    }
    const rewind = command.intent === 'rewind';
    return {
      ...state, heist, phase: 'running', tick: 0, position: 'dock', suspicion: 0, carrying: false,
      loop: rewind ? state.loop + 1 : 1,
      guards: command.plan.assignments.map(a => ({ ...a, index: a.offset, distracted: false })),
      echoes: rewind ? [...state.echoes, [...state.trace]].slice(-2) : [],
      trace: ['dock'],
      archives: command.intent === 'start' ? state.archives : [...state.archives, record(state)],
      bulletin: command.plan.bulletin,
      message: rewind ? 'Rewound. Your recorded route now walks without you; its final address stays occupied.' :
        'Patrol accepted. The clock advances only when you act. Collect at Vault; deliver at Dead letter.',
    };
  }
  requireRule(state.phase === 'running', 'The clock is not running. Request a patrol or rewind first.');
  const settings = state.settings[state.heist];
  requireRule(state.tick < settings.beats && state.suspicion < settings.alarm, 'This loop is exhausted.');
  let position = state.position;
  if (command.type === 'move') {
    const exit = exits(state).find(e => e.to === command.to);
    requireRule(exit, 'That address is not adjacent. Follow an illuminated connection.');
    requireRule(exit.open, `Shutter locked. Hold ${exit.switch} at the departure beat with an echo.`);
    position = command.to;
  }
  if (command.type === 'deliver') {
    requireRule(state.position === 'drop', 'Deliver only at the dead-letter office.');
    requireRule(state.carrying, 'Collect the stolen parcel at the vault first.');
  }
  const moves = forecast(state);
  const collisions = moves.filter(g => g.to === position || (g.from === position && g.to === state.position));
  const suspicion = state.suspicion + collisions.length * 2;
  const tick = state.tick + 1;
  const guards = state.guards.map((guard, i) => {
    const circuit = heistOf(state).circuits.find(c => c.id === guard.circuit)!;
    return {
      ...guard, index: moves[i].decoy ? guard.index : (guard.index + 1) % circuit.nodes.length,
      distracted: guard.distracted || moves[i].decoy,
    };
  });
  const carrying = state.carrying || position === 'vault';
  let phase: Phase = 'running';
  let message = collisions.length ? `Spotted by ${collisions.map(c => c.guard).join(' and ')}. Alarm +${collisions.length * 2}.` :
    moves.some(m => m.decoy) ? 'A guard followed your echo. Its circuit pauses for one beat; that guard will not fall for it again this loop.' :
      position === 'vault' && !state.carrying ? 'Parcel lifted. Reach Dead letter and choose Deliver.' :
        `Beat ${tick}. ${nodeName(position, heistOf(state))}.`;
  if (suspicion >= settings.alarm) {
    phase = state.loop < settings.loops ? 'caught' : 'lost';
    message = phase === 'lost' ? 'The warden seals the city. Your last loop is spent; tomorrow remains locked.' : 'Alarm limit reached. Rewind to escape this sealed loop.';
  } else if (command.type === 'deliver') {
    phase = state.heist === CASES.length - 1 ? 'won' : 'delivered';
    message = phase === 'won' ? 'Tomorrow belongs to everyone. Three parcels delivered; the city clock finally misses a beat.' : 'Parcel delivered. Your echoes dissolve. Open the next heist when you are ready.';
  } else if (tick >= settings.beats) {
    phase = state.loop < settings.loops ? 'caught' : 'lost';
    message = phase === 'lost' ? 'Zero hour. No loops remain. The city keeps its stolen time.' : 'Zero hour. This recording is sealed; rewind to leave it walking.';
  }
  return {
    ...state, tick, position, carrying, suspicion, guards, phase, message,
    trace: [...state.trace, position],
    deliveries: state.deliveries + (phase === 'won' || phase === 'delivered' ? 1 : 0),
  };
}

export const definition = { id: 'ghost-courier', create, reduce, parseCommand };
