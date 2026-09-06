import {
  EARTH_RADIUS, MU, MAX_COAST, OrbitError, add, applyBurn, burnCost, cross, dot, elements,
  length, movingFrame, propagate, radians, scale, unit,
} from './mechanics';
import type { Burn, State, Vec3 } from './mechanics';
import { GOAL_TOLERANCES, initialState, missionAlignment, targetState } from './missions';
import type { Mission } from './missions';

export const PLAN_HORIZON = 21600;
export const MAX_MANEUVERS = 8;
export interface Maneuver { id: number; label: string; time: number; burn: Burn; status: 'queued' | 'executed' }
export interface LogEntry { time: number; event: string; deltaV?: number; state: State }
export interface Flight {
  missionId: string;
  state: State;
  remaining: number;
  maneuvers: Maneuver[];
  log: LogEntry[];
  nextId: number;
}
export interface Plan {
  title: string;
  explanation: string;
  maneuvers: Omit<Maneuver, 'id' | 'status'>[];
  cost: number;
  duration: number;
}
export interface PredictionPoint { time: number; state: State; remaining: number }
export interface Prediction { points: PredictionPoint[]; final: Flight; duration: number }

export function createFlight(mission: Mission): Flight {
  const state = initialState(mission);
  return { missionId: mission.id, state, remaining: mission.budget, maneuvers: [], nextId: 1,
    log: [{ time: 0, event: `${mission.title}: spacecraft initialized`, state }] };
}

const queued = (flight: Flight) => flight.maneuvers.filter((maneuver) => maneuver.status === 'queued');
export const reservedBudget = (flight: Flight) => queued(flight).reduce((sum, maneuver) => sum + burnCost(maneuver.burn), 0);
export const nextManeuver = (flight: Flight) => queued(flight)[0];

function validateQueue(flight: Flight, maneuvers: Maneuver[]): void {
  if (flight.state.status !== 'flying') throw new OrbitError('Reset or undo to plan a spacecraft still in flight.');
  const pending = maneuvers.filter((maneuver) => maneuver.status === 'queued');
  if (pending.length > MAX_MANEUVERS) throw new OrbitError('The timeline holds up to eight future maneuvers.');
  for (const maneuver of pending) {
    if (!Number.isFinite(maneuver.time) || maneuver.time < flight.state.time - 1e-8 ||
        maneuver.time > flight.state.time + PLAN_HORIZON) {
      throw new OrbitError('A maneuver must be between now and six simulation hours from now.');
    }
    if (!Object.values(maneuver.burn).every(Number.isFinite) || burnCost(maneuver.burn) < 1e-9) {
      throw new OrbitError('Enter finite, nonzero burn components in km/s.');
    }
  }
  if (pending.reduce((sum, maneuver) => sum + burnCost(maneuver.burn), 0) > flight.remaining + 1e-10) {
    throw new OrbitError('The queued sequence exceeds the remaining delta-v budget. Reduce a burn or remove one first.');
  }
}

export function queueBurn(flight: Flight, time: number, burn: Burn, label = 'Manual impulse', editId?: number): Flight {
  if (editId !== undefined && !flight.maneuvers.some((maneuver) => maneuver.id === editId && maneuver.status === 'queued')) {
    throw new OrbitError('Only a queued maneuver can be edited.');
  }
  const maneuver: Maneuver = { id: editId ?? flight.nextId, label, time, burn: { ...burn }, status: 'queued' };
  const maneuvers = [...flight.maneuvers.filter((entry) => entry.id !== editId), maneuver]
    .sort((a, b) => a.time - b.time || a.id - b.id);
  validateQueue(flight, maneuvers);
  return { ...flight, maneuvers, nextId: editId === undefined ? flight.nextId + 1 : flight.nextId };
}

export function removeBurn(flight: Flight, id: number): Flight {
  if (!flight.maneuvers.some((maneuver) => maneuver.id === id && maneuver.status === 'queued')) {
    throw new OrbitError('That queued maneuver no longer exists.');
  }
  return { ...flight, maneuvers: flight.maneuvers.filter((maneuver) => maneuver.id !== id) };
}

export function installPlan(flight: Flight, plan: Plan): Flight {
  const maneuvers = [
    ...flight.maneuvers.filter((maneuver) => maneuver.status === 'executed'),
    ...plan.maneuvers.map((maneuver, index): Maneuver => ({ ...maneuver, burn: { ...maneuver.burn },
      id: flight.nextId + index, status: 'queued' })),
  ].sort((a, b) => a.time - b.time || a.id - b.id);
  validateQueue(flight, maneuvers);
  return { ...flight, maneuvers, nextId: flight.nextId + plan.maneuvers.length };
}

function loggedCoast(flight: Flight, duration: number): Flight {
  const state = propagate(flight.state, duration);
  if (state.status !== flight.state.status) {
    return { ...flight, state, log: [...flight.log, { time: state.time, event: state.status === 'impact' ?
      'Surface impact: propagation stopped at 6,371 km radius' : 'Unbound spacecraft crossed the 200,000 km domain boundary', state }].slice(-200) };
  }
  return { ...flight, state };
}

export function advanceFlight(flight: Flight, duration: number): Flight {
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_COAST) {
    throw new OrbitError('Advance by 0–86,400 simulation seconds at a time.');
  }
  const end = flight.state.time + duration;
  let current = flight;
  for (const maneuver of queued(flight)) {
    if (maneuver.time > end + 1e-8) break;
    current = loggedCoast(current, Math.max(0, maneuver.time - current.state.time));
    if (current.state.status !== 'flying') return current;
    const result = applyBurn(current.state, maneuver.burn, current.remaining);
    current = { ...current, state: result.state, remaining: result.remaining,
      maneuvers: current.maneuvers.map((entry) => entry.id === maneuver.id ? { ...entry, status: 'executed' } : entry),
      log: [...current.log, { time: current.state.time, event: maneuver.label, deltaV: burnCost(maneuver.burn), state: result.state }].slice(-200) };
  }
  return loggedCoast(current, Math.max(0, end - current.state.time));
}

export function executeNext(flight: Flight): Flight {
  const maneuver = nextManeuver(flight);
  if (!maneuver) throw new OrbitError('Build a plan or queue an impulse first.');
  return advanceFlight(flight, Math.max(0, maneuver.time - flight.state.time));
}

export function hohmannPlan(state: State, targetAltitude: number): Plan {
  const orbit = elements(state);
  if (state.status !== 'flying' || orbit.eccentricity > 1e-4 || orbit.kind !== 'elliptic') {
    throw new OrbitError('A Hohmann transfer starts from a circular orbit (eccentricity < 0.0001). Reset or circularize first.');
  }
  if (!Number.isFinite(targetAltitude) || targetAltitude < 160 || targetAltitude > 50000) {
    throw new OrbitError('Choose a circular target between 160 and 50,000 km altitude.');
  }
  const r1 = length(state.position);
  const r2 = EARTH_RADIUS + targetAltitude;
  if (Math.abs(r2 - r1) < 1) throw new OrbitError('The target is already within 1 km of this circular orbit.');
  const a = (r1 + r2) / 2;
  const first = Math.sqrt(MU / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1);
  const second = Math.sqrt(MU / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2)));
  const transferTime = Math.PI * Math.sqrt(a ** 3 / MU);
  if (transferTime + 60 > PLAN_HORIZON) throw new OrbitError('This transfer exceeds the six-hour planning window.');
  const maneuvers = [
    { label: r2 > r1 ? 'Raise apoapsis' : 'Lower periapsis', time: state.time + 60, burn: { prograde: first, radial: 0, normal: 0 } },
    { label: 'Circularize', time: state.time + 60 + transferTime, burn: { prograde: second, radial: 0, normal: 0 } },
  ];
  return { title: 'Hohmann transfer', explanation: 'Two tangential impulses, separated by half a transfer ellipse. Departure is 60 simulation seconds from now.',
    maneuvers, cost: Math.abs(first) + Math.abs(second), duration: 60 + transferTime };
}

function planePlan(state: State, mission: Mission): Plan {
  const orbit = elements(state);
  if (orbit.eccentricity > 1e-4 || orbit.period === null) throw new OrbitError('This plane-change solution needs a circular orbit.');
  const frame = movingFrame(state);
  const targetNormal = movingFrame(targetState(mission)).normal;
  const intersection = cross(frame.normal, targetNormal);
  if (length(intersection) < 1e-7) throw new OrbitError('The orbit is already in the target plane.');
  let node = unit(intersection);
  if (node.x < 0) node = scale(node, -1);
  let theta = Math.atan2(dot(node, frame.prograde), dot(node, frame.radial));
  if (theta < -1e-8) theta += Math.PI * 2;
  const wait = Math.max(0, theta) / (Math.PI * 2) * orbit.period;
  const atNode = propagate(state, wait);
  const nodeFrame = movingFrame(atNode);
  const desired = scale(unit(cross(targetNormal, nodeFrame.radial)), orbit.speed);
  const delta = add(desired, scale(atNode.velocity, -1));
  const burn = { prograde: dot(delta, nodeFrame.prograde), radial: dot(delta, nodeFrame.radial), normal: dot(delta, nodeFrame.normal) };
  return { title: 'Matched-speed plane change', explanation: 'Coast to the intersection of both orbital planes. Rotate velocity without changing its magnitude.',
    maneuvers: [{ label: 'Rotate orbital plane', time: state.time + wait, burn }], cost: burnCost(burn), duration: wait };
}

function ellipsePlan(state: State, mission: Mission): Plan {
  const orbit = elements(state);
  if (orbit.period === null || orbit.semiMajorAxis === null || orbit.trueAnomaly === null ||
      orbit.periapsis === null || Math.abs(orbit.periapsis - mission.targetPeriapsis) > 1) {
    throw new OrbitError('This shape-match solution needs the original ellipse with its 600 km periapsis. Reset this mission to restore it.');
  }
  if (!missionAlignment(mission, state).aligned) {
    throw new OrbitError(
      `This periapsis trim cannot correct orbital-plane or periapsis-direction misalignment. ` +
      `The plane must be within ${GOAL_TOLERANCES.planeDegrees}° and the periapsis direction within ${GOAL_TOLERANCES.apsidalDegrees}° of the target. ` +
      'Reset this mission or use manual burns to correct alignment first.',
    );
  }
  const nu = radians(orbit.trueAnomaly);
  const E = Math.atan2(Math.sqrt(1 - orbit.eccentricity ** 2) * Math.sin(nu), orbit.eccentricity + Math.cos(nu));
  const M = (E - orbit.eccentricity * Math.sin(E) + 2 * Math.PI) % (2 * Math.PI);
  const wait = M < 1e-8 ? 0 : (2 * Math.PI - M) / (2 * Math.PI) * orbit.period;
  const atPeriapsis = propagate(state, wait);
  const rp = EARTH_RADIUS + mission.targetPeriapsis;
  const a = (2 * EARTH_RADIUS + mission.targetPeriapsis + mission.targetApoapsis) / 2;
  const prograde = Math.sqrt(MU * (2 / rp - 1 / a)) - length(atPeriapsis.velocity);
  const burn = { prograde, radial: 0, normal: 0 };
  return { title: 'Periapsis trim', explanation: 'Change the far side of the ellipse with an impulse at periapsis. This matches an orbit, not a target vehicle.',
    maneuvers: [{ label: 'Trim apoapsis', time: state.time + wait, burn }], cost: Math.abs(prograde), duration: wait };
}

export function missionPlan(flight: Flight, mission: Mission, altitude = mission.targetApoapsis): Plan {
  if (flight.state.status !== 'flying') throw new OrbitError('Reset or undo the ended flight before planning.');
  if (mission.planner === 'plane') return planePlan(flight.state, mission);
  if (mission.planner === 'ellipse') return ellipsePlan(flight.state, mission);
  return hohmannPlan(flight.state, altitude);
}

export function predict(flight: Flight, requestedDuration?: number, samples = 180): Prediction {
  if (!Number.isInteger(samples) || samples < 2 || samples > 720) throw new OrbitError('Use 2–720 prediction samples.');
  const last = queued(flight).at(-1)?.time ?? flight.state.time;
  const period = elements(flight.state).period ?? 7200;
  const duration = requestedDuration ?? Math.min(PLAN_HORIZON, Math.max(period * 1.05, last - flight.state.time + period * 0.65));
  if (!Number.isFinite(duration) || duration <= 0 || duration > PLAN_HORIZON) throw new OrbitError('Prediction spans must be within six simulation hours.');
  const start = flight.state.time;
  const times = new Set<number>(Array.from({ length: samples }, (_, index) => start + index / (samples - 1) * duration));
  for (const maneuver of queued(flight)) if (maneuver.time <= start + duration) times.add(maneuver.time);
  const points: PredictionPoint[] = [];
  let current = flight;
  for (const time of [...times].sort((a, b) => a - b)) {
    current = advanceFlight(current, Math.max(0, time - current.state.time));
    points.push({ time: current.state.time, state: current.state, remaining: current.remaining });
    if (current.state.status !== 'flying') break;
  }
  return { points, final: current, duration };
}

export function inspectPrediction(flight: Flight, offset: number): Flight {
  if (!Number.isFinite(offset) || offset < 0 || offset > PLAN_HORIZON) throw new OrbitError('Inspect within six simulation hours of the live state.');
  return advanceFlight(flight, offset);
}

export function exportFlight(flight: Flight, mission: Mission): string {
  return JSON.stringify({
    format: 'apsis-flight-log', version: 1,
    units: { distance: 'km', velocity: 'km/s', time: 'simulation seconds since mission start', energy: 'km^2/s^2' },
    model: { gravity: 'Earth two-body point mass', mu: MU, earthRadius: EARTH_RADIUS, escapeBoundary: 200000,
      frame: 'Earth-centered inertial; +Z north; burns in orthonormal radial / transverse-prograde / normal frame',
      omissions: ['atmosphere', 'J2', 'third bodies', 'finite thrust', 'target spacecraft phasing'] },
    mission, flight, elements: elements(flight.state),
  }, null, 2);
}

export const predictionPositions = (prediction: Prediction): Vec3[] => prediction.points.map((point) => point.state.position);
