import { requireRule } from '../../core/agents/errors';
import { array, boolean, choice, integer, object, text } from '../../core/agents/schema';
import { clamp } from '../../core/math';
import type { GameDefinition } from '../../core/games/session';
import { CREW, CREW_IDS, DEFAULT_CONDITIONS, DOORS, ITEMS, OXYGEN, POWER, PRIORITIES, ROOM_IDS, ROOMS, initialOrders, roomInfo } from './data';
import type { Command, Conditions, CrewState, LegalAction, Orders, Plan, RoomId, State } from './data';

export function parseConditions(value: unknown): Conditions {
  const item = object(value, ['reserve', 'deadline', 'damage', 'layout'], 'Mission conditions');
  return {
    reserve: integer(item.reserve, 'Oxygen reserve', 80, 240),
    deadline: integer(item.deadline, 'Extraction window', 12, 36),
    damage: integer(item.damage, 'Breach severity', 1, 3),
    layout: choice(item.layout, ['sealed', 'open'], 'Bulkhead condition'),
  };
}

export function parseOrders(value: unknown): Orders {
  const item = object(value, ['priority', 'power', 'oxygen', 'risk', 'doors', 'targets'], 'Captain orders');
  const doors = array(item.doors, value => {
    const door = object(value, ['id', 'open'], 'Bulkhead');
    return { id: choice(door.id, DOORS.map(entry => entry.id), 'Bulkhead ID'), open: boolean(door.open, 'Bulkhead open') };
  }, 'Bulkheads', DOORS.length, DOORS.length);
  requireRule(new Set(doors.map(door => door.id)).size === DOORS.length, 'Every bulkhead must appear exactly once.');
  const targets = array(item.targets, value => {
    const target = object(value, ['crew', 'room'], 'Crew assignment');
    return { crew: choice(target.crew, CREW_IDS, 'Crew'), room: choice(target.room, ['auto', ...ROOM_IDS], 'Assignment') };
  }, 'Assignments', 3, 3);
  requireRule(new Set(targets.map(target => target.crew)).size === 3, 'Assign each crew member exactly once.');
  return {
    priority: choice(item.priority, PRIORITIES, 'Priority'), power: choice(item.power, POWER, 'Power route'),
    oxygen: choice(item.oxygen, OXYGEN, 'Oxygen route'), risk: choice(item.risk, ['safe', 'eva'], 'Risk permit'),
    doors, targets,
  };
}

export function parsePlan(value: unknown): Plan {
  const item = object(value, ['tick', 'actions'], 'Crew plan');
  const actions = array(item.actions, value => {
    const action = object(value, ['crew', 'action', 'intention'], 'Crew action');
    return {
      crew: choice(action.crew, CREW_IDS, 'Crew ID'), action: text(action.action, 'Legal action ID', 120),
      intention: text(action.intention, 'Public intention', 140),
    };
  }, 'Crew actions', 3, 3);
  requireRule(new Set(actions.map(action => action.crew)).size === 3, 'Choose exactly one action for each of the three crew.');
  return { tick: integer(item.tick, 'Turn number', 0, 36), actions };
}

export function parseCommand(value: unknown): Command {
  const command = object(value, ['type', 'conditions', 'orders', 'plan'], 'Mission command');
  requireRule(command.type === 'turn', 'Only validated crew turns can change the ship.');
  return { type: 'turn', conditions: parseConditions(command.conditions), orders: parseOrders(command.orders), plan: parsePlan(command.plan) };
}

export function create(seed = 1, conditions: Conditions = DEFAULT_CONDITIONS): State {
  return {
    seed, tick: 0, status: 'active', ending: '', conditions: { ...conditions }, orders: initialOrders(conditions),
    oxygen: conditions.reserve, hull: 92,
    rooms: ROOMS.map(room => ({
      id: room.id, known: ['dock', 'atrium', 'relay', 'life', 'reactor', 'ballast'].includes(room.id),
      pressure: room.id === 'ballast' ? 15 : room.id === 'archive' ? 45 : 75,
    })),
    crew: CREW.map(crew => ({
      id: crew.id, room: 'dock', energy: crew.maxEnergy, air: 8, cargo: 'none',
      inventory: { patch: crew.id === 'vale' ? 3 : 0, medkit: crew.id === 'iona' ? 2 : 0, cell: crew.id === 'moth' ? 2 : 0 },
    })),
    repaired: { reactor: false, life: false, breach: false },
    pods: { lark: 'waiting', wren: 'waiting' }, core: 'waiting', supplies: true, jobs: [],
    log: ['Distress beacon acquired. Two occupied pods. Flight core intact. Scrubber and reactor offline.'],
  };
}

export function prepare(state: State, orders: Orders, conditions: Conditions): State {
  requireRule(state.status === 'active', 'This mission has ended. Restart or import another replay.');
  const parsedConditions = parseConditions(conditions);
  if (state.tick > 0) {
    requireRule(Object.keys(parsedConditions).every(key => {
      const field = key as keyof Conditions;
      return parsedConditions[field] === state.conditions[field];
    }), 'Mission conditions are locked after the first accepted turn. Start a new mission to change them.');
  }
  const next = state.tick === 0 ? create(state.seed, parsedConditions) : structuredClone(state);
  next.orders = parseOrders(orders);
  return next;
}

export function neighbors(state: State, id: RoomId): RoomId[] {
  return DOORS.filter(door => (door.a === id || door.b === id) && state.orders.doors.find(item => item.id === door.id)?.open)
    .map(door => door.a === id ? door.b : door.a);
}

export function route(state: State, start: RoomId, end: RoomId, knownOnly = true): RoomId[] {
  const queue: RoomId[][] = [[start]];
  const seen = new Set<RoomId>([start]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last === end) return path;
    for (const next of neighbors(state, last)) {
      if (seen.has(next) || (knownOnly && !state.rooms.find(room => room.id === next)!.known)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return [];
}

export function oxygenated(state: State): Set<RoomId> {
  const sources: RoomId[] = state.orders.oxygen === 'all' ? ['dock', 'life'] : state.orders.oxygen === 'upper' ? ['dock'] : ['life'];
  const supplied = new Set<RoomId>(sources);
  const queue = [...sources];
  while (queue.length) {
    for (const next of neighbors(state, queue.shift()!)) {
      if (!supplied.has(next)) { supplied.add(next); queue.push(next); }
    }
  }
  return supplied;
}

export function powered(state: State, id: RoomId): boolean {
  if (id === 'dock') return true;
  if (state.orders.power === 'balanced') return state.repaired.reactor;
  return state.orders.power === 'rescue' ? ['medbay', 'cryo', 'life'].includes(id) : ['reactor', 'life', 'archive', 'workshop'].includes(id);
}

export function forecast(state: State) {
  const supplied = oxygenated(state);
  const leak = !state.repaired.breach && supplied.has('ballast') ? state.conditions.damage * 3 : 0;
  const burn = (state.repaired.life ? 2 : 4) + leak;
  const hullLoss = state.repaired.breach ? 0 : state.conditions.damage;
  const pressures = state.rooms.map(room => ({
    id: room.id,
    next: clamp(room.pressure + (room.id === 'ballast' && !state.repaired.breach ? -30 :
      supplied.has(room.id) && state.oxygen >= burn ? 15 : -20), 0, 100),
  }));
  return {
    burn, leak, hullLoss, oxygenNext: Math.max(0, state.oxygen - burn), hullNext: Math.max(0, state.hull - hullLoss),
    remaining: Math.max(0, Math.min(state.conditions.deadline - state.tick, Math.ceil(state.oxygen / burn),
      hullLoss ? Math.ceil(state.hull / hullLoss) : 36)),
    supplied: [...supplied], pressures,
    evacuation: state.crew.map(crew => {
      const path = route(state, crew.room, 'dock');
      const vacuumSteps = path.slice(1).filter(id => state.rooms.find(room => room.id === id)!.pressure < 35).length;
      return { crew: crew.id, path, minimumMoveTurns: path.length ? Math.ceil((path.length - 1) / 2) : null, vacuumSteps, suitAir: crew.air };
    }),
    note: 'Idle forecast with staged routing. Repairs can improve it. Movement through each low-pressure room costs 1 suit air; ending a turn there costs 2 more. Extraction also uses a tick.',
  };
}

function mass(crew: CrewState) { return ITEMS.reduce((total, item) => total + crew.inventory[item], 0); }
function traversable(state: State, crew: CrewState, path: RoomId[]) {
  const dry = path.slice(1).filter(id => state.rooms.find(room => room.id === id)!.pressure < 35);
  const finalPressure = forecast(state).pressures.find(room => room.id === path[path.length - 1])!.next;
  return (dry.length === 0 || state.orders.risk === 'eva') && crew.air > dry.length + (finalPressure < 35 ? 2 : 0);
}

export function catalog(state: State, crew: CrewState): LegalAction[] {
  if (state.status !== 'active') return [];
  const actions: LegalAction[] = [];
  const add = (action: LegalAction) => { if (crew.energy >= action.energy) actions.push(action); };
  const stationary = [crew.room];
  add({ id: 'rest', kind: 'rest', label: 'Recover energy / hold position', ap: 0, energy: 0, path: stationary });
  const scanRange = crew.id === 'moth' ? 2 : 1;
  const reveal = state.rooms.filter(room => !room.known && (() => {
    const path = route(state, crew.room, room.id, false);
    return path.length > 0 && path.length <= scanRange + 1;
  })());
  if (reveal.length) add({ id: 'scan', kind: 'scan', label: `Survey ${reveal.length} uncharted compartments`, ap: 1, energy: 1, path: stationary });
  const paths: RoomId[][] = [[crew.room]];
  for (let depth = 0; depth < 2; depth++) {
    for (const path of paths.filter(path => path.length === depth + 1)) {
      for (const next of neighbors(state, path[path.length - 1])) {
        if (path.includes(next) || !state.rooms.find(room => room.id === next)!.known) continue;
        const movement = [...path, next];
        paths.push(movement);
        if (traversable(state, crew, movement)) add({
          id: `move:${movement.join('>')}`, kind: 'move', label: `Move to ${roomInfo(next).name}`,
          ap: movement.length - 1, energy: movement.length - 1, path: movement,
        });
      }
    }
  }
  if (crew.id === 'vale' && crew.inventory.patch > 0) {
    for (const target of ['reactor', 'life', 'breach'] as const) {
      if (state.repaired[target] || crew.room !== (target === 'breach' ? 'ballast' : target)) continue;
      if (target === 'reactor' && (crew.inventory.cell < 1 || !powered(state, crew.room))) continue;
      if (target === 'life' && !powered(state, crew.room)) continue;
      if (target === 'breach' && (state.orders.risk !== 'eva' || crew.air <= 2)) continue;
      add({ id: `repair:${target}`, kind: 'repair', label: `Repair ${target} / 1 patch${target === 'reactor' ? ' + 1 cell' : ''}`, ap: 2, energy: 2, path: stationary, target });
    }
  }
  if (crew.id === 'iona' && crew.inventory.medkit > 0 && crew.cargo === 'none' && powered(state, crew.room) &&
      state.rooms.find(room => room.id === crew.room)!.pressure >= 35) {
    const pod = crew.room === 'medbay' ? 'lark' : crew.room === 'cryo' ? 'wren' : undefined;
    if (pod && state.pods[pod] === 'waiting') add({ id: `rescue:${pod}`, kind: 'rescue', label: `Release pod ${pod.toUpperCase()} / 1 medkit`, ap: 2, energy: 2, path: stationary, pod });
  }
  if (crew.id === 'moth' && crew.room === 'archive' && crew.inventory.cell > 0 && crew.cargo === 'none' &&
      state.core === 'waiting' && powered(state, 'archive')) {
    add({ id: 'recover:core', kind: 'recover', label: 'Recover flight core / 1 cell', ap: 2, energy: 2, path: stationary });
  }
  if (crew.room === 'workshop' && state.supplies && mass(crew) <= 4) {
    add({ id: 'collect', kind: 'collect', label: 'Collect spare patch + cell', ap: 1, energy: 1, path: stationary });
  }
  for (const other of state.crew) {
    // Recipients may free slots this turn; the reducer checks combined final capacity.
    if (crew.id === other.id || crew.room !== other.room) continue;
    for (const item of ITEMS) {
      if (crew.inventory[item] > 0) add({
        id: `give:${other.id}:${item}`, kind: 'give', label: `Hand 1 ${item} to ${other.id}`,
        ap: 1, energy: 0, path: stationary, recipient: other.id, item,
      });
    }
  }
  if (crew.room === 'dock' && crew.cargo !== 'none') add({ id: 'deliver', kind: 'deliver', label: `Secure ${crew.cargo} aboard shuttle`, ap: 1, energy: 0, path: stationary });
  if (crew.id === 'vale' && state.crew.every(member => member.room === 'dock') && state.pods.lark === 'saved' &&
      state.pods.wren === 'saved' && state.core === 'saved' && state.repaired.life && state.repaired.reactor) {
    add({ id: 'extract', kind: 'extract', label: 'Detach shuttle / all crew, both pods and core', ap: 1, energy: 0, path: stationary });
  }
  return actions;
}

export function reduce(state: State, raw: Command): State {
  const command = parseCommand(raw);
  requireRule(command.plan.tick === state.tick, 'That plan belongs to a different turn.');
  const next = prepare(state, command.orders, command.conditions);
  const chosen = command.plan.actions.map(intent => {
    const crew = next.crew.find(member => member.id === intent.crew)!;
    const action = catalog(next, crew).find(action => action.id === intent.action);
    requireRule(action, `${intent.crew}: "${intent.action}" is not in the current legal catalog. Check location, doors, equipment, energy, pressure and power.`);
    return { intent, action };
  });
  requireRule(chosen.reduce((sum, entry) => sum + entry.action.ap, 0) <= 5, 'The coordinated crew has only 5 action points per turn.');
  requireRule(chosen.filter(entry => entry.action.kind === 'collect').length <= 1, 'The workshop cache can only be collected once.');
  // Validate starting-state actions first, then resolve every consumable delta atomically.
  const deltas = new Map(next.crew.map(crew => [crew.id, { patch: 0, medkit: 0, cell: 0 }]));
  for (const { intent, action } of chosen) {
    const delta = deltas.get(intent.crew)!;
    if (action.kind === 'give') {
      delta[action.item!]--;
      deltas.get(action.recipient!)![action.item!]++;
    } else if (action.kind === 'collect') {
      delta.patch++; delta.cell++;
    } else if (action.kind === 'repair') {
      delta.patch--;
      if (action.target === 'reactor') delta.cell--;
    } else if (action.kind === 'rescue') {
      delta.medkit--;
    } else if (action.kind === 'recover') {
      delta.cell--;
    }
  }
  next.crew = next.crew.map(crew => {
    const inventory = { ...crew.inventory };
    const delta = deltas.get(crew.id)!;
    for (const item of ITEMS) inventory[item] += delta[item];
    requireRule(ITEMS.every(item => Number.isSafeInteger(inventory[item]) && inventory[item] >= 0),
      `${crew.id}: Coordinated inventory operations require non-negative item counts.`);
    const resolved = { ...crew, inventory };
    requireRule(mass(resolved) <= 6, `${crew.id}: Coordinated inventory operations exceed the capacity of 6.`);
    return resolved;
  });
  next.jobs = [];
  for (const { intent, action } of chosen) {
    const crew = next.crew.find(member => member.id === intent.crew)!;
    crew.energy -= action.energy;
    if (action.kind === 'rest') {
      crew.energy = Math.min(CREW.find(member => member.id === crew.id)!.maxEnergy,
        crew.energy + (next.rooms.find(room => room.id === crew.room)!.pressure >= 35 ? 3 : 1));
    } else if (action.kind === 'move') {
      crew.air -= action.path.slice(1).filter(id => next.rooms.find(room => room.id === id)!.pressure < 35).length;
      crew.room = action.path[action.path.length - 1];
    } else if (action.kind === 'scan') {
      for (const room of next.rooms) {
        const path = route(next, crew.room, room.id, false);
        if (path.length && path.length <= (crew.id === 'moth' ? 3 : 2)) room.known = true;
      }
    } else if (action.kind === 'repair') {
      next.repaired[action.target!] = true;
      if (action.target === 'breach') next.hull = Math.min(100, next.hull + 12);
    } else if (action.kind === 'rescue') {
      next.pods[action.pod!] = 'carried';
      crew.cargo = action.pod!;
    } else if (action.kind === 'recover') {
      next.core = 'carried';
      crew.cargo = 'core';
    } else if (action.kind === 'collect') {
      next.supplies = false;
    } else if (action.kind === 'deliver') {
      if (crew.cargo === 'core') next.core = 'saved';
      else if (crew.cargo === 'lark' || crew.cargo === 'wren') next.pods[crew.cargo] = 'saved';
      crew.cargo = 'none';
    } else if (action.kind === 'extract') {
      next.status = 'won'; next.ending = 'All three crew, LARK, WREN and the flight core are aboard. Shuttle detached. Nobody left behind.';
    }
    next.jobs.push({ crew: crew.id, label: action.label, path: [...action.path], intention: intent.intention });
  }
  requireRule(next.status !== 'won' || next.crew.every(crew => crew.room === 'dock'),
    'Extraction cannot depart while another crew member moves away from the dock.');
  const hazard = forecast(next);
  next.tick++;
  next.oxygen = hazard.oxygenNext;
  next.hull = hazard.hullNext;
  for (const room of next.rooms) room.pressure = hazard.pressures.find(entry => entry.id === room.id)!.next;
  for (const crew of next.crew) {
    const pressure = next.rooms.find(room => room.id === crew.room)!.pressure;
    crew.air = clamp(crew.air + (pressure < 35 ? -2 : 2), 0, 8);
  }
  const casualty = next.crew.find(crew => crew.air === 0);
  const failure = casualty ? `${casualty.id.toUpperCase()}'s suit oxygen ran out. Rescue aborted.` :
    next.oxygen === 0 ? 'Shared oxygen exhausted. The shuttle cannot complete a safe extraction.' :
      next.hull === 0 ? 'Structural integrity lost. The ring broke apart before extraction.' :
        next.tick >= next.conditions.deadline && next.status !== 'won' ? 'The extraction window closed. Orbital debris cut off the shuttle.' : '';
  if (failure) { next.status = 'lost'; next.ending = failure; }
  next.log = [
    `T${String(next.tick).padStart(2, '0')} / ${next.jobs.map(job => `${job.crew}: ${job.label}`).join(' | ')}. O2 -${hazard.burn}; hull -${hazard.hullLoss}.`,
    ...next.log,
  ].slice(0, 36);
  return next;
}

export const definition: GameDefinition<State, Command> = { id: 'afterlight', create, reduce, parseCommand };
