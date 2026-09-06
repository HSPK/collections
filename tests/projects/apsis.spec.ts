import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  EARTH_RADIUS, ESCAPE_RADIUS, MU, add, applyBurn, burnCost, cross, dot, eccentricityVector, elements, length,
  movingFrame, propagate, sampleOrbit, scale, stateFromApsides,
} from '../../src/projects/apsis/mechanics';
import type { State, Vec3 } from '../../src/projects/apsis/mechanics';
import {
  advanceFlight, createFlight, executeNext, exportFlight, hohmannPlan, inspectPrediction, installPlan,
  missionPlan, predict, queueBurn, removeBurn, reservedBudget,
} from '../../src/projects/apsis/flight';
import { MISSIONS, initialState, missionGoal, targetState } from '../../src/projects/apsis/missions';

const distance = (a: Vec3, b: Vec3) => length(add(a, scale(b, -1)));
const zeros = { prograde: 0, radial: 0, normal: 0 };

test.describe('APSIS two-body mechanics', () => {
  test('circular period, energy, and closure agree with the analytic solution over twelve revolutions', () => {
    const initial = stateFromApsides(400, 400, 28.5);
    const expectedPeriod = 2 * Math.PI * Math.sqrt((EARTH_RADIUS + 400) ** 3 / MU);
    expect(elements(initial).period).toBeCloseTo(expectedPeriod, 8);
    let current = initial;
    for (let orbit = 0; orbit < 12; orbit++) {
      current = propagate(current, expectedPeriod);
      expect(Math.abs(elements(current).energy / elements(initial).energy - 1)).toBeLessThan(1e-10);
      expect(distance(current.position, initial.position)).toBeLessThan(1e-4);
      expect(elements(current).eccentricity).toBeLessThan(1e-10);
    }
    expect(current.time).toBeCloseTo(12 * expectedPeriod, 6);
  });

  test('elliptic coasts conserve angular momentum and are independent of caller partitioning', () => {
    const initial = stateFromApsides(600, 5200, 51.6);
    const whole = propagate(initial, 6000);
    const split = propagate(propagate(propagate(initial, 123.4), 910.6), 4966);
    expect(distance(whole.position, split.position)).toBeLessThan(1e-6);
    expect(distance(whole.velocity, split.velocity)).toBeLessThan(1e-9);
    expect(distance(cross(initial.position, initial.velocity), cross(whole.position, whole.velocity))).toBeLessThan(1e-6);
    expect(elements(whole).periapsis).toBeCloseTo(600, 6);
    expect(elements(whole).apoapsis).toBeCloseTo(5200, 6);
    expect(elements(whole).energy).toBeCloseTo(elements(initial).energy, 9);
    expect(elements(whole).inclination).toBeCloseTo(51.6, 9);
  });

  test('RTN burns use the execution frame, with exact vector magnitude and energy change', () => {
    const state = propagate(stateFromApsides(600, 5200, 51.6), 1000);
    const frame = movingFrame(state);
    expect(dot(frame.radial, frame.prograde)).toBeCloseTo(0, 12);
    expect(dot(frame.normal, frame.prograde)).toBeCloseTo(0, 12);
    expect(dot(frame.normal, frame.radial)).toBeCloseTo(0, 12);
    expect(length(frame.normal)).toBeCloseTo(1, 12);
    expect(Math.abs(dot(state.velocity, frame.radial))).toBeGreaterThan(0.1);
    const burn = { prograde: 0.05, radial: -0.03, normal: 0.02 };
    const result = applyBurn(state, burn, 0.8);
    const delta = add(add(scale(frame.prograde, burn.prograde), scale(frame.radial, burn.radial)), scale(frame.normal, burn.normal));
    expect(distance(result.state.velocity, add(state.velocity, delta))).toBeLessThan(1e-12);
    expect(distance(result.state.position, state.position)).toBe(0);
    expect(result.state.time).toBe(state.time);
    expect(result.remaining).toBeCloseTo(0.8 - burnCost(burn), 12);
    expect(elements(result.state).energy - elements(state).energy).toBeCloseTo(dot(state.velocity, delta) + burnCost(burn) ** 2 / 2, 10);
  });

  test('budget and invalid inputs reject explicitly without mutating the original state', () => {
    const state = stateFromApsides(400, 400);
    const original = structuredClone(state);
    expect(() => applyBurn(state, { ...zeros, prograde: 0.5 }, 0.4)).toThrow(/Insufficient delta-v/);
    expect(() => applyBurn(state, zeros, 0.4)).toThrow(/nonzero/);
    expect(() => applyBurn(state, { ...zeros, radial: Number.NaN }, 0.4)).toThrow(/finite/);
    expect(() => propagate(state, -1)).toThrow(/86,400/);
    expect(() => propagate(state, 86401)).toThrow(/86,400/);
    expect(() => propagate({ ...state, position: { x: 0, y: 0, z: 0 } }, 1)).toThrow(/center/);
    expect(() => stateFromApsides(-50, 100)).toThrow(/apsides/);
    expect(() => stateFromApsides(500, 100)).toThrow(/apsides/);
    expect(state).toEqual(original);
    expect(applyBurn(state, { ...zeros, prograde: 0.4 }, 0.4).remaining).toBe(0);
  });

  test('circular, equatorial, radial, parabolic, and hyperbolic states have explicit unavailable elements', () => {
    const circular = stateFromApsides(400, 400);
    expect(elements(circular)).toMatchObject({ kind: 'elliptic', raan: null, argumentOfPeriapsis: null, trueAnomaly: null });
    const escapeSpeed = Math.sqrt(2 * MU / length(circular.position));
    const parabolic: State = { ...circular, velocity: { x: 0, y: escapeSpeed, z: 0 } };
    expect(elements(parabolic)).toMatchObject({ kind: 'parabolic', apoapsis: null, period: null, semiMajorAxis: null });
    const parabolicCoast = propagate(parabolic, 6000);
    expect(Math.abs(elements(parabolicCoast).energy)).toBeLessThan(1e-9);
    expect(elements(parabolicCoast).period).toBeNull();
    expect(length(parabolicCoast.position)).toBeGreaterThan(length(parabolic.position));
    const escapedConic = propagate({ ...parabolic, velocity: scale(parabolic.velocity, 1.1) }, 6000);
    expect(elements(escapedConic)).toMatchObject({ kind: 'hyperbolic', apoapsis: null, period: null });
    expect(length(escapedConic.position)).toBeGreaterThan(length(circular.position));
    const radial: State = { ...circular, velocity: { x: 0.1, y: 0, z: 0 } };
    expect(elements(radial)).toMatchObject({ kind: 'radial', inclination: null, periapsis: null, apoapsis: null, period: null });
    expect(() => applyBurn(radial, { ...zeros, prograde: 0.1 }, 1)).toThrow(/frame/);
    expect(sampleOrbit(radial)).toEqual([]);
  });

  test('surface collisions terminate at a root-solved event, including fast radial impacts', () => {
    const initial = stateFromApsides(400, 400);
    const deorbit = applyBurn(initial, { ...zeros, prograde: -1 }, 2).state;
    const impacted = propagate(deorbit, 3000);
    expect(impacted.status).toBe('impact');
    expect(length(impacted.position)).toBeCloseTo(EARTH_RADIUS, 8);
    expect(impacted.time).toBeGreaterThan(100);
    expect(impacted.time).toBeLessThan(3000);
    expect(propagate(impacted, 3000)).toBe(impacted);
    expect(() => applyBurn(impacted, { ...zeros, prograde: 0.1 }, 2)).toThrow(/still in flight/);
    const fast: State = { ...initial, position: { x: EARTH_RADIUS + 20, y: 0, z: 0 }, velocity: { x: -80, y: 0, z: 0 } };
    const fastImpact = propagate(fast, 60);
    expect(fastImpact.status).toBe('impact');
    expect(fastImpact.time).toBeGreaterThan(0.249);
    expect(fastImpact.time).toBeLessThan(0.251);
    const fasterImpact = propagate({ ...fast, velocity: { x: -100, y: 0, z: 0 } }, 60);
    expect(fasterImpact.status).toBe('impact');
    expect(elements(fasterImpact).speed).toBeGreaterThan(100);
  });

  test('a shallow grazing perigee is detected even when both substep endpoints are outside Earth', () => {
    const ra = EARTH_RADIUS + 200;
    const rp = EARTH_RADIUS - 0.001;
    const a = (ra + rp) / 2;
    const initial: State = { position: { x: ra, y: 0, z: 0 },
      velocity: { x: 0, y: Math.sqrt(MU * (2 / ra - 1 / a)), z: 0 }, time: 0, status: 'flying' };
    const halfPeriod = Math.PI * Math.sqrt(a ** 3 / MU);
    const coast = propagate(initial, halfPeriod + 30);
    expect(coast.status).toBe('impact');
    expect(coast.time).toBeLessThan(halfPeriod);
    expect(coast.time).toBeGreaterThan(halfPeriod - 10);
    expect(length(coast.position)).toBeCloseTo(EARTH_RADIUS, 7);
  });

  test('escape means unbound and outward at the domain boundary, not a timer or altitude alone', () => {
    const state: State = { position: { x: EARTH_RADIUS + 400, y: 0, z: 0 }, velocity: { x: 30, y: 2, z: 0 }, time: 0, status: 'flying' };
    const escaped = propagate(state, 10000);
    expect(escaped.status).toBe('escaped');
    expect(length(escaped.position)).toBeCloseTo(ESCAPE_RADIUS, 6);
    expect(elements(escaped).energy).toBeGreaterThan(0);
    expect(dot(escaped.position, escaped.velocity)).toBeGreaterThan(0);
    expect(escaped.time).toBeLessThan(10000);
    const inbound: State = { ...state, position: { x: ESCAPE_RADIUS + 10, y: 0, z: 0 }, velocity: { x: -10, y: 2, z: 0 } };
    expect(propagate(inbound, 10).status).toBe('flying');
  });

  test('parabolic escape stops at the analytic boundary time despite negative energy roundoff', () => {
    const periapsisRadius = 6471;
    const initial: State = { position: { x: periapsisRadius, y: 0, z: 0 },
      velocity: { x: 0, y: Math.sqrt(2 * MU / periapsisRadius), z: 0 }, time: 0, status: 'flying' };
    const original = structuredClone(initial);
    const d = Math.sqrt(ESCAPE_RADIUS / periapsisRadius - 1);
    const crossingTime = Math.sqrt(2 * periapsisRadius ** 3 / MU) * (d + d ** 3 / 3);
    const escaped = propagate(initial, 72000);
    const diagnosis = `r=${length(escaped.position)} km; energy=${elements(escaped).energy} km²/s²; t=${escaped.time} s`;
    expect(escaped.status, diagnosis).toBe('escaped');
    expect(escaped.time).toBeCloseTo(crossingTime, 4);
    expect(escaped.time).toBeCloseTo(69945.408, 2);
    expect(length(escaped.position)).toBeCloseTo(ESCAPE_RADIUS, 7);
    expect(elements(escaped)).toMatchObject({ kind: 'parabolic', apoapsis: null, period: null });
    expect(Math.abs(elements(escaped).energy)).toBeLessThan(1e-9);
    expect(propagate(escaped, 100)).toBe(escaped);
    const split = propagate(propagate(initial, 36000), 36000);
    expect(split.status).toBe('escaped');
    expect(split.time).toBeCloseTo(crossingTime, 4);
    expect(distance(split.position, escaped.position)).toBeLessThan(1e-5);
    expect(initial).toEqual(original);
  });

  test('both escape guards share the parabolic tolerance for radial and nonradial motion', () => {
    for (const radial of [false, true]) {
      for (const energy of [-5e-10, 0, 5e-10, -5e-8, -0.5]) {
        const unbound = energy >= -1e-9;
        const makeState = (radius: number): State => {
          const speed = Math.sqrt(2 * (MU / radius + energy));
          return { position: { x: radius, y: 0, z: 0 },
            velocity: radial ? { x: speed, y: 0, z: 0 } : { x: 0.6 * speed, y: 0.8 * speed, z: 0 },
            time: 0, status: 'flying' };
        };
        const outside = makeState(ESCAPE_RADIUS + 1);
        const outsideResult = propagate(outside, 0);
        expect(outsideResult.status, `initial guard: radial=${radial}, energy=${energy}`).toBe(unbound ? 'escaped' : 'flying');
        expect(outsideResult.position).toEqual(outside.position);
        expect(outsideResult.time).toBe(0);
        const crossing = propagate(makeState(ESCAPE_RADIUS - 10), 60);
        expect(crossing.status, `crossing guard: radial=${radial}, energy=${energy}`).toBe(unbound ? 'escaped' : 'flying');
        if (unbound) {
          expect(length(crossing.position)).toBeCloseTo(ESCAPE_RADIUS, 7);
          expect(crossing.time).toBeLessThan(60);
          expect(elements(crossing)).toMatchObject({ kind: radial ? 'radial' : 'parabolic', apoapsis: null, period: null });
        } else {
          expect(length(crossing.position)).toBeGreaterThan(ESCAPE_RADIUS);
          expect(crossing.time).toBe(60);
          expect(elements(crossing).energy).toBeLessThan(-1e-9);
          expect(elements(crossing).kind).toBe(radial ? 'radial' : 'elliptic');
        }
        const inbound = { ...outside, velocity: scale(outside.velocity, -1) };
        expect(propagate(inbound, 0).status).toBe('flying');
      }
    }
  });

  for (const transverseSpeed of [1e-7, 1e-9]) {
    test(`near-radial bound apoapsis remains finite at ${transverseSpeed} km/s transverse speed`, () => {
      const state: State = { position: { x: 6771, y: 0, z: 0 },
        velocity: { x: -1, y: transverseSpeed, z: 0 }, time: 0, status: 'flying' };
      const orbit = elements(state);
      const energy = (1 + transverseSpeed ** 2) / 2 - MU / 6771;
      const h = 6771 * transverseSpeed;
      // The larger root of energy*r² + MU*r - h²/2 = 0 avoids subtracting nearly equal values.
      const expectedRadius = (MU + Math.sqrt(MU ** 2 + 2 * energy * h * h)) / (-2 * energy);
      expect(orbit.kind).toBe('elliptic');
      expect(orbit.apoapsis).not.toBeNull();
      expect(orbit.periapsis).not.toBeNull();
      expect(Number.isFinite(orbit.apoapsis)).toBe(true);
      expect(Number.isFinite(orbit.semiMajorAxis)).toBe(true);
      expect(Number.isFinite(orbit.period)).toBe(true);
      expect(orbit.apoapsis).toBeGreaterThan(orbit.altitude);
      expect(orbit.apoapsis).toBeCloseTo(expectedRadius - EARTH_RADIUS, 7);
      expect(orbit.apoapsis).toBeCloseTo(458.002, 2);
      expect(orbit.periapsis).toBeLessThan(0);
      const radial = elements({ ...state, velocity: { x: -1, y: 1e-12, z: 0 } });
      expect(radial).toMatchObject({ kind: 'radial', apoapsis: null, periapsis: null, period: null, inclination: null });
      const unbound = elements({ ...state, velocity: { x: 12, y: transverseSpeed, z: 0 } });
      expect(unbound).toMatchObject({ kind: 'hyperbolic', apoapsis: null, period: null });
    });
  }

  test('complete ellipse samples preserve the renderer apoapsis/periapsis index contract', () => {
    for (const initial of [initialState(MISSIONS[2]), targetState(MISSIONS[2]), stateFromApsides(300, 24000, 83)]) {
      const state = propagate(initial, 913);
      const orbit = elements(state);
      const samples = sampleOrbit(state, 240);
      expect(samples).toHaveLength(241);
      expect(length(samples[0]) - EARTH_RADIUS).toBeCloseTo(orbit.apoapsis!, 6);
      expect(length(samples[120]) - EARTH_RADIUS).toBeCloseTo(orbit.periapsis!, 6);
      expect(distance(samples[0], samples[240])).toBeLessThan(1e-8);
      const toPeriapsis = eccentricityVector(state);
      expect(dot(samples[0], toPeriapsis)).toBeLessThan(0);
      expect(dot(samples[120], toPeriapsis)).toBeGreaterThan(0);
      expect(length(cross(samples[0], toPeriapsis))).toBeLessThan(1e-7);
      expect(length(cross(samples[120], toPeriapsis))).toBeLessThan(1e-7);
    }
  });
});

test.describe('APSIS executable planning', () => {
  test('Hohmann numbers and both executed impulses actually achieve the first mission', () => {
    const mission = MISSIONS[0];
    const initial = createFlight(mission);
    const plan = missionPlan(initial, mission);
    expect(plan.maneuvers).toHaveLength(2);
    expect(plan.cost).toBeGreaterThan(0.76);
    expect(plan.cost).toBeLessThan(0.79);
    const transferA = EARTH_RADIUS + 1200;
    expect(plan.maneuvers[1].time - plan.maneuvers[0].time).toBeCloseTo(Math.PI * Math.sqrt(transferA ** 3 / MU), 9);
    let flight = installPlan(initial, plan);
    expect(missionGoal(mission, flight.state).complete).toBe(false);
    flight = executeNext(flight);
    expect(elements(flight.state).periapsis).toBeCloseTo(400, 6);
    expect(elements(flight.state).apoapsis).toBeCloseTo(2000, 6);
    expect(missionGoal(mission, flight.state).complete).toBe(false);
    flight = executeNext(flight);
    expect(missionGoal(mission, flight.state).complete).toBe(true);
    expect(elements(flight.state).eccentricity).toBeLessThan(1e-9);
    expect(elements(flight.state).periapsis).toBeCloseTo(2000, 5);
    expect(elements(flight.state).apoapsis).toBeCloseTo(2000, 5);
    expect(flight.remaining).toBeCloseTo(mission.budget - plan.cost, 10);
    expect(flight.log.filter((entry) => entry.deltaV !== undefined)).toHaveLength(2);
  });

  test('a lowering Hohmann transfer works and unsupported starts are rejected', () => {
    const initial = stateFromApsides(2000, 2000, 35);
    const plan = hohmannPlan(initial, 200);
    expect(plan.maneuvers.every((entry) => entry.burn.prograde < 0)).toBe(true);
    const start = { ...createFlight(MISSIONS[0]), state: initial };
    const final = executeNext(executeNext(installPlan(start, plan)));
    expect(elements(final.state).periapsis).toBeCloseTo(200, 5);
    expect(elements(final.state).apoapsis).toBeCloseTo(200, 5);
    expect(elements(final.state).inclination).toBeCloseTo(35, 9);
    expect(() => hohmannPlan(initialState(MISSIONS[2]), 2000)).toThrow(/circular orbit/);
    expect(() => hohmannPlan(initial, 150)).toThrow(/160/);
    expect(() => hohmannPlan(initial, 2000)).toThrow(/already/);
  });

  test('coasting through the queue agrees with explicit execution, and inspection never spends live fuel', () => {
    const initial = createFlight(MISSIONS[0]);
    const plan = missionPlan(initial, MISSIONS[0]);
    const flight = installPlan(initial, plan);
    const original = structuredClone(flight);
    const projected = predict(flight);
    const final = advanceFlight(flight, projected.duration);
    expect(distance(final.state.position, projected.final.state.position)).toBeLessThan(1e-5);
    expect(final.remaining).toBeCloseTo(projected.final.remaining, 12);
    expect(missionGoal(MISSIONS[0], projected.final.state).complete).toBe(true);
    expect(inspectPrediction(flight, projected.duration).remaining).toBeLessThan(flight.remaining);
    expect(flight).toEqual(original);
    expect(flight.maneuvers.every((entry) => entry.status === 'queued')).toBe(true);
    expect(projected.points.some((point) => Math.abs(point.time - plan.maneuvers[1].time) < 1e-8)).toBe(true);
  });

  test('the plane-change solution includes retrograde compensation and waits for the real node', () => {
    const mission = MISSIONS[1];
    const initial = createFlight(mission);
    const later = advanceFlight(initial, 800);
    const plan = missionPlan(later, mission);
    expect(plan.duration).toBeGreaterThan(1000);
    expect(plan.maneuvers[0].burn.prograde).toBeLessThan(0);
    expect(plan.maneuvers[0].burn.normal).toBeGreaterThan(0);
    expect(plan.cost).toBeCloseTo(2 * elements(initial.state).speed * Math.sin(5 * Math.PI / 180), 9);
    const final = executeNext(installPlan(later, plan));
    expect(missionGoal(mission, final.state).complete).toBe(true);
    expect(elements(final.state).inclination).toBeCloseTo(38.5, 7);
    expect(elements(final.state).periapsis).toBeCloseTo(900, 5);
    expect(elements(final.state).apoapsis).toBeCloseTo(900, 5);
  });

  test('elliptical matching happens at periapsis, and completion checks full orbital plane', () => {
    const mission = MISSIONS[2];
    const later = advanceFlight(createFlight(mission), 960);
    const plan = missionPlan(later, mission);
    expect(plan.maneuvers[0].burn.prograde).toBeLessThan(0);
    expect(plan.duration).toBeGreaterThan(1000);
    const final = executeNext(installPlan(later, plan));
    expect(elements(final.state).periapsis).toBeCloseTo(600, 5);
    expect(elements(final.state).apoapsis).toBeCloseTo(2800, 5);
    expect(missionGoal(mission, final.state).complete).toBe(true);
    const target = targetState(mission);
    const rotate = (value: Vec3): Vec3 => ({ x: value.x * Math.cos(0.8) - value.y * Math.sin(0.8),
      y: value.x * Math.sin(0.8) + value.y * Math.cos(0.8), z: value.z });
    const wrongNode = { ...target, position: rotate(target.position), velocity: rotate(target.velocity) };
    expect(elements(wrongNode).inclination).toBeCloseTo(mission.targetInclination, 9);
    expect(missionGoal(mission, wrongNode).complete).toBe(false);
    expect(missionGoal(mission, wrongNode).planeError).toBeGreaterThan(10);
    const frame = movingFrame(target);
    const rotateWithinPlane = (value: Vec3) => add(scale(value, Math.cos(0.6)), scale(cross(frame.normal, value), Math.sin(0.6)));
    const wrongApsis = { ...target, position: rotateWithinPlane(target.position), velocity: rotateWithinPlane(target.velocity) };
    expect(missionGoal(mission, wrongApsis).planeError).toBeLessThan(0.001);
    expect(missionGoal(mission, wrongApsis).altitudeError).toBeLessThan(0.001);
    expect(missionGoal(mission, wrongApsis).apsidalError).toBeGreaterThan(30);
    expect(missionGoal(mission, wrongApsis).complete).toBe(false);
  });

  for (const fixture of [
    { name: 'radial', burn: { ...zeros, radial: 0.01 }, planeError: 0, apsidalError: 0.341206 },
    { name: 'normal', burn: { ...zeros, normal: 0.05 }, planeError: 0.339113, apsidalError: 0 },
  ]) {
    test(`ellipse trim rejects incompatible alignment after a ${fixture.name} burn without spending fuel`, () => {
      const mission = MISSIONS[2];
      const initial = createFlight(mission);
      const perturbed = executeNext(queueBurn(initial, 0, fixture.burn));
      const original = structuredClone(perturbed);
      const beforeLog = exportFlight(perturbed, mission);
      const goal = missionGoal(mission, perturbed.state);
      expect(Math.abs(elements(perturbed.state).periapsis! - mission.targetPeriapsis)).toBeLessThan(1);
      expect(goal.planeError).toBeCloseTo(fixture.planeError, 5);
      expect(goal.apsidalError).toBeCloseTo(fixture.apsidalError, 5);
      expect(() => missionPlan(perturbed, mission)).toThrow(/Reset.*manual/);
      expect(perturbed).toEqual(original);
      expect(exportFlight(perturbed, mission)).toBe(beforeLog);
      expect(perturbed.remaining).toBeCloseTo(mission.budget - burnCost(fixture.burn), 12);
      expect(perturbed.maneuvers).toHaveLength(1);
      expect(perturbed.maneuvers[0].status).toBe('executed');
    });
  }

  test('ellipse trim and completion agree just inside and outside both alignment tolerances', () => {
    const mission = MISSIONS[2];
    const initial = initialState(mission);
    const target = targetState(mission);
    for (const fixture of [
      { plane: true, degrees: 0.0999, accepted: true },
      { plane: true, degrees: 0.1001, accepted: false },
      { plane: false, degrees: 0.1999, accepted: true },
      { plane: false, degrees: 0.2001, accepted: false },
    ]) {
      const axis = fixture.plane ? movingFrame(initial).radial : movingFrame(initial).normal;
      const theta = fixture.degrees * Math.PI / 180;
      const rotate = (value: Vec3) => add(
        add(scale(value, Math.cos(theta)), scale(cross(axis, value), Math.sin(theta))),
        scale(axis, dot(axis, value) * (1 - Math.cos(theta))),
      );
      const rotatedTarget = { ...target, position: rotate(target.position), velocity: rotate(target.velocity) };
      expect(missionGoal(mission, rotatedTarget).complete).toBe(fixture.accepted);
      const start = { ...createFlight(mission), state: { ...initial, position: rotate(initial.position), velocity: rotate(initial.velocity) } };
      const flight = advanceFlight(start, 960);
      const snapshot = structuredClone(flight);
      if (fixture.accepted) {
        const plan = missionPlan(flight, mission);
        const final = executeNext(installPlan(flight, plan));
        expect(missionGoal(mission, final.state).complete).toBe(true);
        expect(elements(final.state).periapsis).toBeCloseTo(600, 5);
        expect(elements(final.state).apoapsis).toBeCloseTo(2800, 5);
        expect(final.remaining).toBeCloseTo(flight.remaining - plan.cost, 12);
      } else {
        expect(() => missionPlan(flight, mission)).toThrow(/Reset.*manual/);
      }
      expect(flight).toEqual(snapshot);
    }
  });

  test('small physical alignment errors still permit a successful coasting periapsis trim', () => {
    const mission = MISSIONS[2];
    for (const burn of [{ ...zeros, radial: 0.005 }, { ...zeros, normal: 0.01 }]) {
      const perturbed = executeNext(queueBurn(createFlight(mission), 0, burn));
      const coast = advanceFlight(perturbed, 960);
      const plan = missionPlan(coast, mission);
      const final = executeNext(installPlan(coast, plan));
      const goal = missionGoal(mission, final.state);
      expect(goal.complete).toBe(true);
      expect(goal.altitudeError).toBeLessThan(0.1);
      expect(goal.planeError).toBeLessThan(0.1);
      expect(goal.apsidalError).toBeLessThan(0.2);
      expect(final.remaining).toBeCloseTo(mission.budget - burnCost(burn) - plan.cost, 12);
      expect(final.state.time).toBeGreaterThan(coast.state.time);
    }
  });

  test('editing, removing, and reserving multiple impulses keeps an ordered finite queue', () => {
    const initial = createFlight(MISSIONS[0]);
    let flight = queueBurn(initial, 240, { ...zeros, prograde: 0.1 });
    flight = queueBurn(flight, 120, { ...zeros, normal: 0.05 });
    expect(flight.maneuvers.map((entry) => entry.time)).toEqual([120, 240]);
    const firstId = flight.maneuvers[0].id;
    flight = queueBurn(flight, 300, { ...zeros, normal: 0.08 }, 'Edited plane impulse', firstId);
    expect(flight.maneuvers.map((entry) => entry.time)).toEqual([240, 300]);
    expect(reservedBudget(flight)).toBeCloseTo(0.18, 12);
    expect(flight.remaining).toBe(initial.remaining);
    expect(() => queueBurn(flight, 400, { ...zeros, prograde: 1.1 })).toThrow(/exceeds/);
    expect(() => queueBurn(flight, 21601, { ...zeros, prograde: 0.1 })).toThrow(/six simulation hours/);
    expect(() => queueBurn(flight, Number.NaN, { ...zeros, prograde: 0.1 })).toThrow(/six simulation hours/);
    expect(() => queueBurn(flight, 400, zeros)).toThrow(/nonzero/);
    flight = removeBurn(flight, firstId);
    expect(flight.maneuvers).toHaveLength(1);
    expect(() => removeBurn(flight, firstId)).toThrow(/no longer/);
    for (let index = 0; index < 7; index++) flight = queueBurn(flight, 600 + index, { ...zeros, prograde: 0.001 });
    expect(() => queueBurn(flight, 800, { ...zeros, prograde: 0.001 })).toThrow(/eight/);
  });

  test('exactly timed burns execute once, impact aborts later impulses, and logs export physical state', () => {
    let flight = queueBurn(createFlight(MISSIONS[0]), 60, { ...zeros, prograde: 0.05 });
    const before = advanceFlight(flight, 59.999);
    expect(before.remaining).toBe(flight.remaining);
    const at = advanceFlight(before, 0.001);
    expect(at.remaining).toBeCloseTo(1.15, 10);
    expect(advanceFlight(at, 0).remaining).toBe(at.remaining);
    flight = queueBurn(createFlight(MISSIONS[0]), 0, { ...zeros, prograde: -1 });
    flight = queueBurn(flight, 2500, { ...zeros, prograde: 0.1 });
    const ended = advanceFlight(flight, 2600);
    expect(ended.state.status).toBe('impact');
    expect(ended.remaining).toBeCloseTo(0.2, 10);
    expect(ended.maneuvers[1].status).toBe('queued');
    expect(missionGoal(MISSIONS[0], ended.state).complete).toBe(false);
    const log = JSON.parse(exportFlight(ended, MISSIONS[0]));
    expect(log.units.velocity).toBe('km/s');
    expect(log.flight.state.position).toEqual(ended.state.position);
    expect(log.flight.remaining).toBe(ended.remaining);
    expect(log.model.omissions).toContain('target spacecraft phasing');
    expect(log.flight.log.at(-1).event).toMatch(/Surface impact/);
  });
});

async function openDesk(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/projects/apsis/');
  await expect(page.locator('.project-apsis .apsis-canvas')).toBeVisible();
  await expect(page.locator('[data-apsis-altitude]')).toHaveText('400.0');
  return errors;
}

test.describe('APSIS browser flight desk', () => {
  test.setTimeout(90_000);

  test('desktop transfer, real future inspection, two burns, undo, and reset', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    await expect(root.locator('[data-project-preview]')).toHaveCount(1);
    const sceneTop = await root.locator('[data-apsis-scene]').evaluate((element) => element.getBoundingClientRect().top);
    expect(sceneTop).toBeLessThan(230);
    expect((await root.locator('[data-project-preview]').boundingBox())!.height).toBeLessThanOrEqual(825);
    await page.screenshot({ path: testInfo.outputPath('apsis-desktop-launch.png'), fullPage: false });
    const originalPath = await root.locator('[data-apsis-chart-path]').getAttribute('d');
    await root.locator('[data-apsis-build]').click();
    await expect(root.locator('[data-apsis-burn]')).toHaveCount(2);
    expect(await root.locator('[data-apsis-chart-path]').getAttribute('d')).not.toBe(originalPath);
    await page.screenshot({ path: testInfo.outputPath('apsis-desktop.png'), fullPage: false });
    await root.locator('[data-apsis-inspect]').focus();
    await root.locator('[data-apsis-inspect]').press('End');
    await expect(root.locator('[data-apsis-inspect-altitude]')).toHaveText('2,000.0');
    await expect(root.locator('[data-apsis-inspect-budget]')).not.toHaveText('1.2000');
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:00:00');
    await expect(root.locator('[data-apsis-budget]')).toHaveText('1.2000');
    await expect(root).toHaveAttribute('data-mission-complete', 'false');
    await root.locator('.apsis-prediction-panel').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath('apsis-desktop-inspection.png'), fullPage: false });
    await root.locator('[data-apsis-live]').click();
    await expect(root.locator('[data-apsis-inspect-altitude]')).toHaveText('400.0');
    await root.locator('[data-apsis-execute]').click();
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:01:00');
    await expect(root.locator('[data-apsis-metric="apoapsis"]')).toHaveText('2,000.0 km');
    await expect(root.locator('[data-apsis-metric="periapsis"]')).toHaveText('400.0 km');
    await expect(root).toHaveAttribute('data-mission-complete', 'false');
    await root.locator('[data-apsis-execute]').click();
    await expect(root.locator('[data-apsis-goal-text]')).toHaveText('Target orbit acquired');
    await expect(root.locator('[data-apsis-metric="periapsis"]')).toHaveText('2,000.0 km');
    await expect(root.locator('[data-apsis-metric="apoapsis"]')).toHaveText('2,000.0 km');
    await expect(root.locator('[data-apsis-metric="eccentricity"]')).toHaveText('0.00000');
    const plan = missionPlan(createFlight(MISSIONS[0]), MISSIONS[0]);
    expect(Number((await root.locator('[data-apsis-budget]').innerText()).replaceAll(',', ''))).toBeCloseTo(1.2 - plan.cost, 4);
    await root.locator('[data-apsis-undo]').click();
    await expect(root.locator('[data-apsis-metric="periapsis"]')).toHaveText('400.0 km');
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:01:00');
    await root.locator('[data-apsis-reset]').click();
    await expect(root.locator('[data-apsis-budget]')).toHaveText('1.2000');
    await expect(root.locator('[data-apsis-burn]')).toHaveCount(0);
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:00:00');
    await expect(root.getByRole('button', { name: 'Resume simulation', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('manual burn editing changes projected physics, rejects overbudget burns, and executes in flight', async ({ page }) => {
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    const initialPath = await root.locator('[data-apsis-chart-path]').getAttribute('d');
    await root.locator('[data-apsis-prograde]').fill('2');
    await root.locator('[data-apsis-queue]').click();
    await expect(root.locator('[data-apsis-editor-error]')).toContainText('exceeds');
    await expect(root.locator('[data-apsis-burn]')).toHaveCount(0);
    await root.locator('[data-apsis-prograde]').fill('0.05');
    await root.locator('[data-apsis-queue]').click();
    await expect(root.locator('[data-apsis-burn]')).toHaveCount(1);
    const firstPath = await root.locator('[data-apsis-chart-path]').getAttribute('d');
    expect(firstPath).not.toBe(initialPath);
    await root.getByRole('button', { name: /Edit burn 1/ }).click();
    await root.locator('[data-apsis-prograde]').fill('0.075');
    await root.locator('[data-apsis-queue]').click();
    expect(await root.locator('[data-apsis-chart-path]').getAttribute('d')).not.toBe(firstPath);
    await expect(root.locator('[data-apsis-reserved]')).toHaveText('0.0750');
    await root.getByRole('button', { name: /Remove burn 1/ }).click();
    await expect(root.locator('[data-apsis-reserved]')).toHaveText('0.0000');
    await root.locator('[data-apsis-undo]').click();
    await expect(root.locator('[data-apsis-reserved]')).toHaveText('0.0750');
    await root.locator('[data-apsis-step]').click();
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:01:00');
    await expect(root.locator('[data-apsis-budget]')).toHaveText('1.2000');
    await root.locator('[data-apsis-execute]').click();
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:02:00');
    await expect(root.locator('[data-apsis-budget]')).toHaveText('1.1250');
    const expected = elements(applyBurn(propagate(initialState(MISSIONS[0]), 120), { ...zeros, prograde: 0.075 }, 1.2).state);
    expect(Number((await root.locator('[data-apsis-metric="apoapsis"]').innerText()).replace(/[^0-9.-]/g, ''))).toBeCloseTo(expected.apoapsis!, 1);
    await expect(root).toHaveAttribute('data-mission-complete', 'false');
    expect(errors).toEqual([]);
  });

  test('running advances real state, pausing freezes it, and reduced-motion changes pause an active flight', async ({ page }) => {
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    const initialVectors = await root.locator('[data-apsis-state-vectors]').textContent();
    await root.locator('[data-apsis-warp]').selectOption('600');
    await root.getByRole('button', { name: 'Resume simulation', exact: true }).click();
    await expect.poll(async () => Number(await root.locator('[data-apsis-clock]').getAttribute('data-seconds'))).toBeGreaterThan(60);
    await root.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    const pausedTime = await root.locator('[data-apsis-clock]').getAttribute('data-seconds');
    const pausedVectors = await root.locator('[data-apsis-state-vectors]').textContent();
    expect(pausedVectors).not.toBe(initialVectors);
    await page.waitForTimeout(400);
    await expect(root.locator('[data-apsis-clock]')).toHaveAttribute('data-seconds', pausedTime!);
    await expect(root.locator('[data-apsis-budget]')).toHaveText('1.2000');
    await root.getByRole('button', { name: 'Resume simulation', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root.getByRole('button', { name: 'Resume simulation', exact: true })).toBeVisible();
    await expect(root.locator('[data-apsis-reduced]')).toBeVisible();
    await root.locator('[data-apsis-undo]').click();
    await expect(root.locator('[data-apsis-clock]')).toHaveAttribute('data-seconds', pausedTime!);
    expect(errors).toEqual([]);
  });

  test('the distinct plane and ellipse missions complete through the model and export a usable flight log', async ({ page }) => {
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    await root.locator('[data-apsis-mission]').selectOption('meridian');
    await expect(root.locator('[data-apsis-target-field]')).toBeHidden();
    await root.locator('[data-apsis-build]').click();
    await root.locator('[data-apsis-execute]').click();
    await expect(root).toHaveAttribute('data-mission-complete', 'true');
    await expect(root.locator('[data-apsis-metric="inclination"]')).toHaveText('38.50 °');
    await expect(root.locator('[data-apsis-metric="apoapsis"]')).toHaveText('900.0 km');
    await root.locator('[data-apsis-mission]').selectOption('long-arc');
    await root.locator('[data-apsis-step]').click();
    await root.locator('[data-apsis-build]').click();
    await root.locator('[data-apsis-execute]').click();
    await expect(root).toHaveAttribute('data-mission-complete', 'true');
    await expect(root.locator('[data-apsis-metric="periapsis"]')).toHaveText('600.0 km');
    await expect(root.locator('[data-apsis-metric="apoapsis"]')).toHaveText('2,800.0 km');
    const downloadPromise = page.waitForEvent('download');
    await root.locator('[data-apsis-export]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('apsis-long-arc-flight.json');
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const log = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(log.format).toBe('apsis-flight-log');
    expect(log.flight.state.time).toBeGreaterThan(6000);
    expect(log.flight.maneuvers[0].status).toBe('executed');
    expect(missionGoal(MISSIONS[2], log.flight.state).complete).toBe(true);
    expect(log.units).toMatchObject({ distance: 'km', velocity: 'km/s' });
    expect(errors).toEqual([]);
  });

  test('a misaligned ellipse exposes planner guidance without another fuel charge, and reset restores the solution', async ({ page }) => {
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    await root.locator('[data-apsis-mission]').selectOption('long-arc');
    await root.locator('[data-apsis-delay]').fill('0');
    await root.locator('[data-apsis-prograde]').fill('0');
    await root.locator('[data-apsis-radial]').fill('0.01');
    await root.locator('[data-apsis-queue]').click();
    await root.locator('[data-apsis-execute]').click();
    await expect(root.locator('[data-apsis-budget]')).toHaveText('0.7900');
    await expect(root.locator('[data-apsis-reserved]')).toHaveText('0.0000');
    await expect(root.locator('[data-apsis-build]')).toBeDisabled();
    await root.locator('[data-apsis-plan-hint]').scrollIntoViewIfNeeded();
    await expect(root.locator('[data-apsis-plan-hint]')).toContainText('cannot correct orbital-plane or periapsis-direction misalignment');
    await expect(root.locator('[data-apsis-plan-hint]')).toContainText('Reset this mission or use manual burns');
    await expect(root.locator('[data-apsis-goal-error]')).toContainText('apsis direction 0.34°');
    await expect(root).toHaveAttribute('data-mission-complete', 'false');
    await root.locator('[data-apsis-reset]').click();
    await expect(root.locator('[data-apsis-budget]')).toHaveText('0.8000');
    await expect(root.locator('[data-apsis-build]')).toBeEnabled();
    await root.locator('[data-apsis-build]').click();
    await root.locator('[data-apsis-execute]').click();
    await expect(root).toHaveAttribute('data-mission-complete', 'true');
    await expect(root.locator('[data-apsis-metric="apoapsis"]')).toHaveText('2,800.0 km');
    expect(errors).toEqual([]);
  });

  test('mobile fits, scene and keyboard camera are useful, and a complete transfer remains accessible', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await openDesk(page);
    const root = page.locator('.project-apsis');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const scene = root.locator('[data-apsis-scene]');
    expect((await scene.boundingBox())!.height).toBeGreaterThanOrEqual(400);
    await page.screenshot({ path: testInfo.outputPath('apsis-mobile.png'), fullPage: false });
    await root.locator('.apsis-canvas').focus();
    await root.locator('.apsis-canvas').press('ArrowRight');
    await expect(root.locator('.apsis-canvas')).toBeFocused();
    await root.locator('.apsis-canvas').press('Home');
    await root.locator('[data-apsis-view="north"]').click();
    await expect(root.locator('[data-apsis-view="north"]')).toHaveAttribute('aria-pressed', 'true');
    await root.locator('[data-apsis-zoom="in"]').click();
    await root.locator('[data-apsis-fit]').click();
    await expect(root.locator('[data-apsis-clock]')).toHaveText('T+00:00:00');
    await root.locator('[data-apsis-build]').click();
    await root.locator('.apsis-planner').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('apsis-mobile-plan.png'), fullPage: false });
    await root.locator('.apsis-prediction-panel').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath('apsis-mobile-inspection.png'), fullPage: false });
    const chartWidth = await root.locator('[data-apsis-chart] svg').evaluate((element) => {
      if (!(element instanceof SVGSVGElement)) throw new Error('Missing altitude plot.');
      return { viewport: element.viewBox.baseVal.width, rendered: element.getBoundingClientRect().width };
    });
    expect(chartWidth.viewport).toBeCloseTo(chartWidth.rendered, 0);
    const ticks = await root.locator('[data-apsis-time-tick]').evaluateAll((labels) =>
      labels.map((label) => ({ left: label.getBoundingClientRect().left, right: label.getBoundingClientRect().right })));
    for (let index = 1; index < ticks.length; index++) expect(ticks[index].left - ticks[index - 1].right).toBeGreaterThan(12);
    await root.locator('[data-apsis-execute]').click();
    await root.locator('[data-apsis-execute]').click();
    await expect(root).toHaveAttribute('data-mission-complete', 'true');
    await expect(root.locator('[data-apsis-metric="periapsis"]')).toHaveText('2,000.0 km');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await root.locator('.apsis-notes summary').click();
    await expect(root.locator('.apsis-notes-grid')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('an active desk releases its WebGL context and every animation request on abort', async ({ page }) => {
    const errors = await openDesk(page);
    const result = await page.evaluate(async () => {
      const modulePath = '/src/projects/apsis/index.ts';
      const project: typeof import('../../src/projects/apsis/index') = await import(modulePath);
      const host = document.createElement('div');
      document.body.append(host);
      const controller = new AbortController();
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const pending = new Set<number>();
      window.requestAnimationFrame = (callback) => {
        const id = request((time) => { pending.delete(id); callback(time); });
        pending.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
      try {
        const instance = project.mount({ container: host, controls: document.createElement('div'),
          signal: controller.signal, reducedMotion: false, report: () => {} });
        const canvas = host.querySelector<HTMLCanvasElement>('.apsis-canvas');
        const gl = canvas?.getContext('webgl2');
        const play = host.querySelector<HTMLButtonElement>('[data-apsis-run]');
        if (!gl || !play) throw new Error('The mounted desk did not provide a WebGL scene and Run control.');
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        const pendingWhilePaused = pending.size;
        play.click();
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        const seconds = Number(host.querySelector<HTMLElement>('[data-apsis-clock]')?.dataset.seconds);
        const active = pending.size;
        const lostBefore = gl.isContextLost();
        controller.abort();
        instance.destroy();
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        return { seconds, active, pendingWhilePaused, lostBefore, lostAfter: gl.isContextLost(), pendingAfter: pending.size, childrenAfter: host.childElementCount };
      } finally {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        controller.abort();
        host.remove();
      }
    });
    expect(result.seconds).toBeGreaterThan(0);
    expect(result.active).toBeGreaterThan(0);
    expect(result.pendingWhilePaused).toBe(0);
    expect(result.lostBefore).toBe(false);
    expect(result.lostAfter).toBe(true);
    expect(result.pendingAfter).toBe(0);
    expect(result.childrenAfter).toBe(0);
    expect(errors).toEqual([]);
  });
});
