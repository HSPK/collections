import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, isRecord, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { HOBS, INGREDIENTS, LAYOUTS, MODES, RECIPES, SHIFTS, STAFF_IDS } from './data';
import type { ComponentRecipe, Hob, Ingredient, Layout, Mode, StaffId, Station } from './data';

export interface Assignment { staff: StaffId; taskId: string }
export interface Plan { assignments: Assignment[]; intention: string }
export interface Part { id: string; stage: 'raw' | 'prepping' | 'prepared' | 'cooking' | 'ready' | 'burnt' | 'plated'; heat: number; quality: number; hob: Hob | null }
export interface Order {
  id: string; recipe: string; arrival: number; deadline: number;
  status: 'open' | 'plating' | 'plated' | 'served' | 'missed';
  parts: Part[]; pass: Station | null; quality: number; servedAt: number | null;
}
export interface Job { staff: StaffId; kind: 'prep' | 'plate'; target: string; station: Station; left: number }
export interface Task {
  id: string; kind: 'prep' | 'cook' | 'plate' | 'serve' | 'wait' | 'continue';
  target: string; station: Station; label: string; beats: number;
}
export interface State {
  phase: 'setup' | 'service' | 'intermission' | 'won' | 'lost';
  shift: number; tick: number; layout: Layout; mode: Mode; pin: string;
  hobs: Record<Hob, number>; stock: Record<Ingredient, number>; orders: Order[]; jobs: Job[];
  prepTokens: number; satisfaction: number; served: number; missed: number; waste: number; score: number;
  last: Record<StaffId, string>; activity: Record<StaffId, Pick<Task, 'kind' | 'station' | 'target'>>;
  log: string[]; outcome: string; seed: number;
}
export type Command =
  | { type: 'layout'; value: Layout }
  | { type: 'mode'; value: Mode }
  | { type: 'heat'; hob: Hob; value: number }
  | { type: 'pin'; order: string }
  | { type: 'prestock'; target: string }
  | { type: 'open' }
  | { type: 'hold' }
  | { type: 'next' }
  | { type: 'plan'; plan: Plan };

function makeOrders(shift: number): Order[] {
  const data = SHIFTS[shift];
  return data.recipes.map((recipe, index) => {
    const id = `S${shift + 1}-${index + 1}`;
    return {
      id, recipe, arrival: data.arrivals[index], deadline: data.deadlines[index], status: 'open',
      parts: RECIPES[recipe].components.map(part => ({ id: `${id}:${part.id}`, stage: 'raw', heat: 0, quality: 85, hob: null })),
      pass: null, quality: 0, servedAt: null,
    };
  });
}
function pantry(orders: Order[]): Record<Ingredient, number> {
  const stock: Record<Ingredient, number> = { root: 1, leek: 1, grain: 1, pear: 1, cream: 1, herb: 1 };
  for (const order of orders) for (const part of RECIPES[order.recipe].components) {
    for (const ingredient of INGREDIENTS) stock[ingredient] += part.stock[ingredient] ?? 0;
  }
  return stock;
}
function idleActivity(): State['activity'] {
  return {
    nell: { kind: 'wait', station: 'none', target: '' },
    sol: { kind: 'wait', station: 'none', target: '' },
    ivo: { kind: 'wait', station: 'none', target: '' },
  };
}
export function create(seed: number): State {
  const orders = makeOrders(0);
  return {
    phase: 'setup', shift: 0, tick: 0, layout: 'prep', mode: 'balanced', pin: orders[0].id,
    hobs: { 'hob-a': 2, 'hob-b': 2 }, stock: pantry(orders), orders, jobs: [], prepTokens: 3,
    satisfaction: 80, served: 0, missed: 0, waste: 0, score: 0,
    last: { nell: 'Sharpening the prep knife', sol: 'Polishing the copper pans', ivo: 'Folding the service cloth' },
    activity: idleActivity(), log: [], outcome: '', seed,
  };
}
export function recipePart(order: Order, part: Part): ComponentRecipe {
  const recipe = RECIPES[order.recipe].components.find(item => part.id === `${order.id}:${item.id}`);
  requireRule(recipe, 'Unknown recipe component.');
  return recipe;
}
function locate(state: State, target: string) {
  for (const order of state.orders) {
    const part = order.parts.find(item => item.id === target);
    if (part) return { order, part, recipe: recipePart(order, part) };
  }
  throw new Error(`Internal component not found: ${target}`);
}
export function stations(state: State, kind: 'prep' | 'pass'): Station[] {
  return kind === 'prep' ? state.layout === 'prep' ? ['prep-a', 'prep-b'] : ['prep-a'] :
    state.layout === 'pass' ? ['pass-a', 'pass-b'] : ['pass-a'];
}
function occupied(state: State, station: Station) {
  return state.jobs.some(job => job.station === station) ||
    state.orders.some(order => order.pass === station || order.parts.some(part => part.hob === station));
}
function duration(state: State, staff: StaffId, kind: 'prep' | 'plate') {
  if (state.mode === 'rush') return 1;
  if (state.mode === 'craft') return 2;
  return (kind === 'prep' && staff === 'nell') || (kind === 'plate' && staff === 'ivo') ? 1 : 2;
}
function enoughStock(state: State, recipe: ComponentRecipe) {
  return INGREDIENTS.every(ingredient => state.stock[ingredient] >= (recipe.stock[ingredient] ?? 0));
}
function takeStock(state: State, recipe: ComponentRecipe) {
  requireRule(enoughStock(state, recipe), `Not enough stock for ${recipe.name}.`);
  for (const ingredient of INGREDIENTS) state.stock[ingredient] -= recipe.stock[ingredient] ?? 0;
}
export function tasksFor(state: State, staff: StaffId): Task[] {
  if (state.phase !== 'service') return [];
  const job = state.jobs.find(item => item.staff === staff);
  if (job) return [{ id: 'continue', kind: 'continue', target: job.target, station: job.station, label: `Continue ${job.kind} (${job.left} beat)`, beats: job.left }];
  const tasks: Task[] = [];
  const add = (kind: Task['kind'], target: string, station: Station, label: string, beats: number) => {
    tasks.push({ id: `${kind}/${target}/${station}`, kind, target, station, label, beats });
  };
  for (const order of state.orders.filter(item => item.status !== 'missed' && item.status !== 'served')) {
    if (order.status === 'plated' && order.arrival <= state.tick && state.tick + 1 <= order.deadline) {
      // A plated dish owns its pass slot until a runner lifts it.
      add('serve', order.id, order.pass!, `Serve ${order.id}`, 1);
    }
    if (order.status !== 'open') continue;
    for (const part of order.parts) {
      const recipe = recipePart(order, part);
      if ((part.stage === 'raw' || part.stage === 'burnt') && enoughStock(state, recipe)) {
        for (const station of stations(state, 'prep').filter(item => !occupied(state, item))) {
          add('prep', part.id, station, `Prep ${order.id} ${recipe.name}`, duration(state, staff, 'prep'));
        }
      }
      if (part.stage === 'prepared' && recipe.heat > 0) {
        for (const hob of HOBS.filter(item => !occupied(state, item) && state.hobs[item] > 0)) {
          add('cook', part.id, hob, `Fire ${order.id} ${recipe.name}`, 1);
        }
      }
    }
    if (order.arrival <= state.tick && order.parts.every(part => part.stage === 'ready')) {
      for (const station of stations(state, 'pass').filter(item => !occupied(state, item))) {
        add('plate', order.id, station, `Plate ${order.id}`, duration(state, staff, 'plate'));
      }
    }
  }
  tasks.push({ id: 'wait', kind: 'wait', target: '', station: 'none', label: 'Stand by', beats: 1 });
  return tasks;
}
export function parsePlan(value: unknown): Plan {
  const item = object(value, ['assignments', 'intention'], 'Crew plan');
  return {
    assignments: array(item.assignments, entry => {
      const assignment = object(entry, ['staff', 'taskId'], 'Assignment');
      return { staff: choice(assignment.staff, STAFF_IDS, 'Staff'), taskId: text(assignment.taskId, 'Task ID', 120) };
    }, 'Staff assignments', 3, 3),
    intention: text(item.intention, 'Public intention', 240),
  };
}
export function parseCommand(value: unknown): Command {
  requireRule(isRecord(value), 'Command must be an object.');
  const type = choice(value.type, ['layout', 'mode', 'heat', 'pin', 'prestock', 'open', 'hold', 'next', 'plan'] as const, 'Command');
  if (type === 'layout' || type === 'mode') {
    const item = object(value, ['type', 'value']);
    return type === 'layout' ? { type, value: choice(item.value, LAYOUTS, 'Layout') } : { type, value: choice(item.value, MODES, 'Priority') };
  }
  if (type === 'heat') {
    const item = object(value, ['type', 'hob', 'value']);
    return { type, hob: choice(item.hob, HOBS, 'Hob'), value: integer(item.value, 'Heat', 0, 3) };
  }
  if (type === 'pin' || type === 'prestock') {
    const key = type === 'pin' ? 'order' : 'target';
    const item = object(value, ['type', key]);
    return type === 'pin' ? { type, order: text(item.order, 'Ticket', 20) } : { type, target: text(item.target, 'Component', 80) };
  }
  if (type === 'plan') {
    const item = object(value, ['type', 'plan']);
    return { type, plan: parsePlan(item.plan) };
  }
  object(value, ['type']);
  return { type };
}
function note(state: State, message: string) {
  state.log.unshift(`${state.shift + 1}.${state.tick} / ${message}`);
  state.log = state.log.slice(0, 48);
}
function miss(state: State, order: Order) {
  order.status = 'missed';
  order.pass = null;
  for (const part of order.parts) {
    if (part.stage !== 'raw' && part.stage !== 'burnt') state.waste++;
    part.hob = null;
  }
  state.jobs = state.jobs.filter(job => job.target !== order.id && !order.parts.some(part => part.id === job.target));
  state.missed++;
  state.satisfaction = Math.max(0, state.satisfaction - 22);
  note(state, `${order.id} missed service. The table leaves.`);
}
function finish(state: State) {
  const shift = SHIFTS[state.shift];
  for (const order of state.orders) {
    if (order.status !== 'served' && order.status !== 'missed' && (state.tick >= order.deadline || state.tick >= shift.clock)) miss(state, order);
  }
  if (state.missed >= 2 || state.satisfaction < 45) {
    state.phase = 'lost';
    state.outcome = 'Service lost: two tables left, or the room fell below 45 satisfaction.';
  } else if (state.orders.every(order => order.status === 'served' || order.status === 'missed')) {
    const served = state.orders.filter(order => order.status === 'served');
    const quality = served.reduce((sum, order) => sum + order.quality, 0) / Math.max(1, served.length);
    if (served.length < shift.goal || quality < 62) {
      state.phase = 'lost';
      state.outcome = `Service lost: this sitting needed ${shift.goal} dishes and 62 average quality.`;
    } else {
      state.phase = state.shift === 2 ? 'won' : 'intermission';
      state.outcome = state.phase === 'won' ? 'The house is full. All three sittings complete.' : `${shift.title} complete. Reset the kitchen for the next course.`;
    }
  }
}
function pulse(state: State, plan: Plan) {
  requireRule(state.phase === 'service', 'Open service before calling the crew.');
  requireRule(plan.assignments.length === 3 && new Set(plan.assignments.map(item => item.staff)).size === 3, 'Assign Nell, Sol and Ivo exactly once.');
  const assignments = plan.assignments.map(assignment => {
    const task = tasksFor(state, assignment.staff).find(item => item.id === assignment.taskId);
    requireRule(task, `${assignment.staff}: task ${assignment.taskId} is not currently legal. Use that staff member's catalog.`);
    return { staff: assignment.staff, task };
  });
  const usedStations = new Set<Station>(), usedTargets = new Set<string>();
  for (const { task } of assignments) {
    if (task.kind === 'wait' || task.kind === 'continue') continue;
    requireRule(!usedStations.has(task.station), `${task.station} is double-booked. Each station has capacity one per pulse.`);
    requireRule(!usedTargets.has(task.target), `${task.target} cannot be reserved by two staff.`);
    usedStations.add(task.station); usedTargets.add(task.target);
  }
  // Every catalog is from the same pre-pulse state. No within-plan dependency shortcuts.
  for (const { staff, task } of assignments) {
    state.last[staff] = task.label;
    state.activity[staff] = { kind: task.kind, station: task.station, target: task.target };
    if (task.kind === 'prep') {
      const { part, recipe } = locate(state, task.target);
      takeStock(state, recipe);
      part.stage = 'prepping'; part.heat = 0;
      part.quality = state.mode === 'rush' ? 77 : state.mode === 'craft' ? 93 : 85;
      state.jobs.push({ staff, kind: 'prep', target: part.id, station: task.station, left: task.beats });
    } else if (task.kind === 'cook') {
      const { part } = locate(state, task.target);
      part.stage = 'cooking'; part.hob = choice(task.station, HOBS, 'Hob');
      if (staff === 'sol') part.quality += 4;
    } else if (task.kind === 'plate') {
      const order = state.orders.find(item => item.id === task.target)!;
      order.status = 'plating'; order.pass = task.station;
      order.quality = Math.round(order.parts.reduce((sum, part) => sum + part.quality, 0) / order.parts.length);
      if (state.mode === 'rush') order.quality -= 5;
      if (state.mode === 'craft') order.quality += 4;
      for (const part of order.parts) { part.hob = null; part.stage = 'plated'; }
      state.jobs.push({ staff, kind: 'plate', target: order.id, station: task.station, left: task.beats });
    } else if (task.kind === 'serve') {
      const order = state.orders.find(item => item.id === task.target)!;
      requireRule(state.tick + 1 <= order.deadline, `${order.id} cannot reach the table before its deadline.`);
      order.status = 'served'; order.pass = null; order.servedAt = state.tick + 1;
      order.quality = Math.min(100, Math.max(0, order.quality + (staff === 'ivo' ? 3 : 0)));
      state.served++; state.satisfaction = Math.min(100, state.satisfaction + (order.quality >= 75 ? 3 : -2));
      state.score += order.quality * 10 + (order.deadline - order.servedAt) * 4;
      note(state, `${order.id} served at ${order.quality} quality.`);
    }
  }
  state.tick++;
  for (const job of state.jobs) {
    job.left--;
    if (job.left > 0) continue;
    if (job.kind === 'prep') {
      const { part, recipe } = locate(state, job.target);
      part.stage = recipe.heat ? 'prepared' : 'ready';
      note(state, `${job.staff} finished ${recipe.name}.`);
    } else {
      state.orders.find(order => order.id === job.target)!.status = 'plated';
      note(state, `${job.target} is on the pass.`);
    }
  }
  state.jobs = state.jobs.filter(job => job.left > 0);
  for (const order of state.orders.filter(item => item.status === 'open')) {
    for (const part of order.parts.filter(item => item.hob !== null)) {
      const recipe = recipePart(order, part);
      const heat = state.hobs[part.hob!];
      part.heat += heat;
      if (heat === 3) part.quality = Math.max(0, part.quality - 3);
      if (part.heat >= recipe.heat + 4) {
        part.stage = 'burnt'; part.hob = null; state.waste++;
        note(state, `${order.id} ${recipe.name} burnt. Prep again from the remaining stock.`);
      } else if (part.heat >= recipe.heat) part.stage = 'ready';
    }
  }
  note(state, plan.intention);
  finish(state);
}
export function reduce(previous: State, command: Command): State {
  const state = structuredClone(previous);
  if (command.type === 'next') {
    requireRule(state.phase === 'intermission' && state.shift < 2, 'Finish this sitting before opening another.');
    state.shift++; state.tick = 0; state.phase = 'setup';
    state.orders = makeOrders(state.shift); state.stock = pantry(state.orders); state.jobs = [];
    state.prepTokens = 3; state.pin = state.orders[0].id; state.hobs = { 'hob-a': 2, 'hob-b': 2 }; state.outcome = '';
    state.last = { nell: 'Unpacking the new delivery', sol: 'Resetting the burners', ivo: 'Writing the next tickets' };
    state.activity = idleActivity();
    return state;
  }
  requireRule(state.phase === 'setup' || state.phase === 'service', 'This sitting has ended. Start the next course or restart.');
  if (command.type === 'layout') {
    requireRule(state.phase === 'setup', 'The island can only move before service.');
    state.layout = command.value;
  } else if (command.type === 'mode') state.mode = command.value;
  else if (command.type === 'heat') state.hobs[command.hob] = integer(command.value, 'Heat', 0, 3);
  else if (command.type === 'pin') {
    requireRule(state.orders.some(order => order.id === command.order && order.status === 'open'), 'Pin an open ticket.');
    state.pin = command.order;
  } else if (command.type === 'prestock') {
    requireRule(state.phase === 'setup' && state.prepTokens > 0, 'Advance prep is limited to three components before service.');
    const order = state.orders.find(item => item.parts.some(part => part.id === command.target));
    requireRule(order, 'Choose a component on the forecast.');
    const part = order.parts.find(item => item.id === command.target)!;
    requireRule(part.stage === 'raw', 'That component is already prepared.');
    const recipe = recipePart(order, part);
    takeStock(state, recipe); part.stage = recipe.heat ? 'prepared' : 'ready'; state.prepTokens--;
    note(state, `Advance prep: ${order.id} ${recipe.name}.`);
  } else if (command.type === 'open') {
    requireRule(state.phase === 'setup', 'Service is already open.');
    state.phase = 'service'; note(state, 'Doors open. The clock advances only on accepted pulses or an explicit crew hold.');
  } else if (command.type === 'hold') {
    pulse(state, { assignments: STAFF_IDS.map(staff => ({ staff, taskId: state.jobs.some(job => job.staff === staff) ? 'continue' : 'wait' })), intention: 'Player holds new assignments. Existing jobs and hobs advance one beat.' });
  } else pulse(state, command.plan);
  return state;
}
export const definition: GameDefinition<State, Command> = { id: 'mise', create, reduce, parseCommand };
export function finalScore(state: State) { return Math.max(0, state.score - state.waste * 35 - state.missed * 150); }
