export const EARTH_RADIUS = 6371;
export const MU = 398600.4418;
export const ESCAPE_RADIUS = 200000;
export const MAX_COAST = 86400;
const TAU = 2 * Math.PI;
const MAX_SUBSTEP = 60;
const ENERGY_TOLERANCE = 1e-9;

export interface Vec3 { x: number; y: number; z: number }
export interface State {
  position: Vec3;
  velocity: Vec3;
  time: number;
  status: 'flying' | 'impact' | 'escaped';
}
export interface Burn { prograde: number; radial: number; normal: number }
export interface Elements {
  altitude: number;
  speed: number;
  radialSpeed: number;
  energy: number;
  eccentricity: number;
  semiMajorAxis: number | null;
  periapsis: number | null;
  apoapsis: number | null;
  inclination: number | null;
  raan: number | null;
  argumentOfPeriapsis: number | null;
  trueAnomaly: number | null;
  period: number | null;
  kind: 'elliptic' | 'parabolic' | 'hyperbolic' | 'radial';
}

export class OrbitError extends Error {}
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export function unit(a: Vec3): Vec3 {
  const magnitude = length(a);
  if (magnitude < 1e-12) throw new OrbitError('A moving frame is unavailable for a zero vector.');
  return scale(a, 1 / magnitude);
}
export const degrees = (radians: number) => radians * 180 / Math.PI;
export const radians = (angle: number) => angle * Math.PI / 180;
const angle = (cosine: number) => Math.acos(Math.max(-1, Math.min(1, cosine)));
const positiveAngle = (value: number) => (value % TAU + TAU) % TAU;

function classifyEnergy(energy: number): 'elliptic' | 'parabolic' | 'hyperbolic' {
  if (energy < -ENERGY_TOLERANCE) return 'elliptic';
  if (energy > ENERGY_TOLERANCE) return 'hyperbolic';
  return 'parabolic';
}

function validateState(state: State): void {
  if (![state.time, ...Object.values(state.position), ...Object.values(state.velocity)].every(Number.isFinite)) {
    throw new OrbitError('State vectors and simulation time must be finite.');
  }
  if (length(state.position) < 1) throw new OrbitError('Position cannot be at Earth’s center.');
  if (!Number.isFinite(dot(state.velocity, state.velocity))) throw new OrbitError('Velocity magnitude exceeds the numerical range of this model.');
}

export function eccentricityVector(state: State): Vec3 {
  return add(scale(cross(state.velocity, cross(state.position, state.velocity)), 1 / MU),
    scale(state.position, -1 / length(state.position)));
}

export function elements(state: State): Elements {
  validateState(state);
  const r = length(state.position);
  const speed = length(state.velocity);
  const h = cross(state.position, state.velocity);
  const hm = length(h);
  const eVector = eccentricityVector(state);
  const eccentricity = length(eVector);
  const energy = speed * speed / 2 - MU / r;
  const radial = hm < 1e-7;
  const energyClass = classifyEnergy(energy);
  const bound = energyClass === 'elliptic';
  const semiMajorAxis = energyClass === 'parabolic' ? null : -MU / (2 * energy);
  const node = { x: -h.y, y: h.x, z: 0 };
  const nm = length(node);
  const circular = eccentricity < 1e-7;
  const p = hm * hm / MU;
  let anomaly: number | null = null;
  let argument: number | null = null;
  if (!radial && !circular) {
    anomaly = positiveAngle(Math.atan2(dot(cross(eVector, state.position), h) / hm, dot(eVector, state.position)));
    if (nm > 1e-7) {
      argument = positiveAngle(Math.atan2(dot(cross(node, eVector), h) / hm, dot(node, eVector)));
    }
  }
  return {
    altitude: r - EARTH_RADIUS,
    speed,
    radialSpeed: dot(state.position, state.velocity) / r,
    energy,
    eccentricity,
    semiMajorAxis,
    periapsis: radial ? null : p / (1 + eccentricity) - EARTH_RADIUS,
    apoapsis: !radial && bound && semiMajorAxis !== null ? semiMajorAxis * (1 + eccentricity) - EARTH_RADIUS : null,
    inclination: radial ? null : degrees(angle(h.z / hm)),
    raan: radial || nm < 1e-7 ? null : degrees(positiveAngle(Math.atan2(node.y, node.x))),
    argumentOfPeriapsis: argument === null ? null : degrees(argument),
    trueAnomaly: anomaly === null ? null : degrees(anomaly),
    period: !radial && bound && semiMajorAxis !== null ? TAU * Math.sqrt(semiMajorAxis ** 3 / MU) : null,
    kind: radial ? 'radial' : energyClass,
  };
}

export function stateFromApsides(periapsis: number, apoapsis: number, inclination = 0): State {
  if (![periapsis, apoapsis, inclination].every(Number.isFinite) || periapsis < 1 ||
      apoapsis < periapsis || apoapsis > 150000 || inclination < 0 || inclination > 180) {
    throw new OrbitError('Use 1–150,000 km apsides with apoapsis ≥ periapsis and inclination 0–180°.');
  }
  const rp = EARTH_RADIUS + periapsis;
  const a = (2 * EARTH_RADIUS + periapsis + apoapsis) / 2;
  const speed = Math.sqrt(MU * (2 / rp - 1 / a));
  return {
    position: { x: rp, y: 0, z: 0 },
    velocity: { x: 0, y: speed * Math.cos(radians(inclination)), z: speed * Math.sin(radians(inclination)) },
    time: 0, status: 'flying',
  };
}

// Series near zero avoid cancellation at the elliptic/parabolic boundary.
function stumpff(z: number): { c: number; s: number } {
  if (Math.abs(z) < 1e-4) {
    return { c: 1 / 2 - z / 24 + z * z / 720 - z ** 3 / 40320,
      s: 1 / 6 - z / 120 + z * z / 5040 - z ** 3 / 362880 };
  }
  if (z > 0) {
    const root = Math.sqrt(z);
    return { c: (1 - Math.cos(root)) / z, s: (root - Math.sin(root)) / root ** 3 };
  }
  const root = Math.sqrt(-z);
  return { c: (Math.cosh(root) - 1) / -z, s: (Math.sinh(root) - root) / root ** 3 };
}

function kepler(state: State, dt: number): State {
  if (dt === 0) return state;
  const r0 = length(state.position);
  const sqrtMu = Math.sqrt(MU);
  const rv = dot(state.position, state.velocity) / sqrtMu;
  const alpha = 2 / r0 - dot(state.velocity, state.velocity) / MU;
  const evaluate = (chi: number) => {
    const { c, s } = stumpff(alpha * chi * chi);
    return {
      residual: rv * chi * chi * c + (1 - alpha * r0) * chi ** 3 * s + r0 * chi - sqrtMu * dt,
      derivative: rv * chi * (1 - alpha * chi * chi * s) + (1 - alpha * r0) * chi * chi * c + r0,
      c, s,
    };
  };
  let low = 0;
  let high = Math.max(1, sqrtMu * dt / r0);
  let bracketed = false;
  for (let iteration = 0; iteration < 40; iteration++) {
    if (evaluate(high).residual >= 0) { bracketed = true; break; }
    high *= 2;
  }
  if (!bracketed) throw new OrbitError('The Kepler solver could not bracket this coast.');
  let chi = (low + high) / 2;
  let converged = false;
  for (let iteration = 0; iteration < 64; iteration++) {
    const value = evaluate(chi);
    if (Math.abs(value.residual) < 1e-8 || high - low < 1e-12) { converged = true; break; }
    if (value.residual > 0) high = chi;
    else low = chi;
    const candidate = chi - value.residual / value.derivative;
    chi = Number.isFinite(candidate) && candidate > low && candidate < high ? candidate : (low + high) / 2;
  }
  if (!converged) throw new OrbitError('The Kepler solver did not converge; the state was not advanced.');
  const { c, s } = evaluate(chi);
  const f = 1 - chi * chi / r0 * c;
  const g = dt - chi ** 3 * s / sqrtMu;
  const position = add(scale(state.position, f), scale(state.velocity, g));
  const r = length(position);
  const fdot = sqrtMu / (r * r0) * (alpha * chi ** 3 * s - chi);
  const gdot = 1 - chi * chi / r * c;
  return { ...state, position, velocity: add(scale(state.position, fdot), scale(state.velocity, gdot)), time: state.time + dt };
}

function radiusEvent(state: State, dt: number, radius: number, entering: boolean): State {
  let low = 0;
  let high = dt;
  for (let iteration = 0; iteration < 42; iteration++) {
    const middle = (low + high) / 2;
    const outside = length(kepler(state, middle).position) > radius;
    if (outside === entering) low = middle;
    else high = middle;
  }
  const event = kepler(state, high);
  return { ...event, position: scale(unit(event.position), radius), status: entering ? 'impact' : 'escaped' };
}

export function propagate(initial: State, duration: number): State {
  validateState(initial);
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_COAST) {
    throw new OrbitError('A coast must be between 0 and 86,400 simulation seconds.');
  }
  if (initial.status !== 'flying') return initial;
  if (length(initial.position) <= EARTH_RADIUS) return { ...initial, status: 'impact' };
  if (length(initial.position) >= ESCAPE_RADIUS && classifyEnergy(elements(initial).energy) !== 'elliptic' &&
      dot(initial.position, initial.velocity) > 0) return { ...initial, status: 'escaped' };
  const endTime = initial.time + duration;
  let current = initial;
  while (endTime - current.time > 1e-8) {
    const dt = Math.min(MAX_SUBSTEP, 0.25 * length(current.position) / (length(current.velocity) + 1), endTime - current.time);
    const next = kepler(current, dt);
    let impactWindow = length(next.position) <= EARTH_RADIUS ? dt : null;
    // Detect a grazing pass even when both endpoints are above the surface.
    if (impactWindow === null && dot(current.position, current.velocity) < 0 &&
        dot(next.position, next.velocity) > 0 && elements(current).periapsis !== null &&
        (elements(current).periapsis ?? 0) < 0) {
      let low = 0;
      let high = dt;
      for (let iteration = 0; iteration < 36; iteration++) {
        const middle = (low + high) / 2;
        const at = kepler(current, middle);
        if (dot(at.position, at.velocity) < 0) low = middle;
        else high = middle;
      }
      if (length(kepler(current, high).position) <= EARTH_RADIUS) impactWindow = high;
    }
    if (impactWindow !== null) return radiusEvent(current, impactWindow, EARTH_RADIUS, true);
    if (length(next.position) >= ESCAPE_RADIUS && classifyEnergy(elements(next).energy) !== 'elliptic' &&
        dot(next.position, next.velocity) > 0) {
      if (length(current.position) >= ESCAPE_RADIUS) return { ...next, status: 'escaped' };
      return radiusEvent(current, dt, ESCAPE_RADIUS, false);
    }
    current = next;
  }
  return current;
}

export function movingFrame(state: State): { radial: Vec3; prograde: Vec3; normal: Vec3 } {
  validateState(state);
  const momentum = cross(state.position, state.velocity);
  if (length(momentum) < 1e-7) throw new OrbitError('The burn frame is undefined for radial motion.');
  const normal = unit(momentum);
  const radial = unit(state.position);
  return { radial, normal, prograde: unit(cross(normal, radial)) };
}

export const burnCost = (burn: Burn) => Math.hypot(burn.prograde, burn.radial, burn.normal);

export function applyBurn(state: State, burn: Burn, budget: number): { state: State; remaining: number } {
  if (state.status !== 'flying') throw new OrbitError('Burns require a spacecraft still in flight.');
  if (![burn.prograde, burn.radial, burn.normal, budget].every(Number.isFinite) || budget < 0) {
    throw new OrbitError('Burn components and available delta-v must be finite; the budget cannot be negative.');
  }
  const cost = burnCost(burn);
  if (cost < 1e-9) throw new OrbitError('Enter a nonzero burn in km/s.');
  if (cost > budget + 1e-10) throw new OrbitError(`Insufficient delta-v: ${cost.toFixed(4)} km/s requested, ${budget.toFixed(4)} km/s available.`);
  const frame = movingFrame(state);
  const delta = add(add(scale(frame.prograde, burn.prograde), scale(frame.radial, burn.radial)), scale(frame.normal, burn.normal));
  const next = { ...state, velocity: add(state.velocity, delta) };
  validateState(next);
  return { state: next, remaining: Math.max(0, budget - cost) };
}

export function sampleOrbit(state: State, samples = 240): Vec3[] {
  const orbit = elements(state);
  if (orbit.kind === 'radial') return [];
  const frame = movingFrame(state);
  const eVector = eccentricityVector(state);
  const pAxis = orbit.eccentricity < 1e-7 ? frame.radial : unit(eVector);
  const qAxis = cross(frame.normal, pAxis);
  const h = length(cross(state.position, state.velocity));
  const p = h * h / MU;
  const limit = orbit.kind === 'elliptic' ? Math.PI : Math.acos(-1 / Math.max(1, orbit.eccentricity)) - 0.02;
  const points: Vec3[] = [];
  for (let index = 0; index <= samples; index++) {
    const theta = -limit + index / samples * 2 * limit;
    const radius = p / (1 + orbit.eccentricity * Math.cos(theta));
    if (radius > ESCAPE_RADIUS || radius < EARTH_RADIUS) continue;
    points.push(add(scale(pAxis, radius * Math.cos(theta)), scale(qAxis, radius * Math.sin(theta))));
  }
  return points;
}
