export const TAU = Math.PI * 2;
export const MEMBERS = ['sun', 'ring', 'carrier'] as const;
export type Member = typeof MEMBERS[number];

export interface Gearset {
  readonly sun: number;
  readonly planet: number;
  readonly ring: number;
  readonly planets: number;
}

export interface Configuration {
  readonly gearset: Gearset;
  readonly grounded: Member;
  readonly driven: Member;
  /** Signed, normalized revolutions per second; positive is counterclockwise. */
  readonly speed: number;
}

export interface PitchGeometry {
  readonly sunRadius: number;
  readonly planetRadius: number;
  readonly ringRadius: number;
  readonly orbitRadius: number;
  readonly addendum: number;
  readonly dedendum: number;
}

export interface Phases {
  readonly sun: number;
  readonly ring: number;
  readonly carrier: number;
  readonly planets: readonly number[];
  readonly orbits: readonly number[];
}

export interface Solution {
  readonly gearset: Gearset;
  readonly grounded: Member;
  readonly driven: Member;
  readonly output: Member;
  readonly speeds: Readonly<Record<Member, number>>;
  readonly planetSpeed: number;
  /** Output / input, including its sign; remains defined at zero input speed. */
  readonly ratio: number;
  readonly geometry: PitchGeometry;
  readonly phases: Phases;
}

export interface PlanetPose {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly orbitAngle: number;
  readonly angle: number;
}

export interface GearboxFrame {
  readonly time: number;
  readonly sunAngle: number;
  readonly ringAngle: number;
  readonly carrierAngle: number;
  readonly planets: readonly PlanetPose[];
}

// Unit module, deliberately shallow illustrative teeth, not an involute profile.
export const ADDENDUM = 0.32;
export const DEDENDUM = 0.42;

export function validateGearset(gearset: Gearset): void {
  for (const member of ['sun', 'planet', 'ring'] as const) {
    if (!Number.isSafeInteger(gearset[member]) || gearset[member] < 6 || gearset[member] > 180) {
      throw new RangeError(`${member} tooth count must be a whole number from 6 to 180 (the drawing limit).`);
    }
  }
  if (gearset.planets !== 3) {
    throw new RangeError('This model requires exactly three equally spaced planets.');
  }
  if (gearset.ring !== gearset.sun + 2 * gearset.planet) {
    throw new RangeError('Pitch geometry requires Nᵣ = Nₛ + 2Nₚ: the ring must match the sun plus two planets.');
  }
  if ((gearset.sun + gearset.ring) % gearset.planets !== 0) {
    throw new RangeError('Equal-spacing assembly requires (Nₛ + Nᵣ) / 3 to be a whole number.');
  }
  const orbit = (gearset.sun + gearset.planet) / 2;
  const adjacentPinDistance = 2 * orbit * Math.sin(Math.PI / gearset.planets);
  if (adjacentPinDistance <= gearset.planet + 2 * ADDENDUM) {
    throw new RangeError('The neighboring planet tooth envelopes overlap. Choose smaller planets.');
  }
}

export function geometryFor(gearset: Gearset): PitchGeometry {
  validateGearset(gearset);
  return {
    sunRadius: gearset.sun / 2,
    planetRadius: gearset.planet / 2,
    ringRadius: gearset.ring / 2,
    orbitRadius: (gearset.sun + gearset.planet) / 2,
    addendum: ADDENDUM,
    dedendum: DEDENDUM,
  };
}

function toothPhase(angle: number, teeth: number): number {
  const period = TAU / teeth;
  const phase = ((angle % period) + period) % period;
  return phase < 1e-12 || period - phase < 1e-12 ? 0 : phase;
}

export function initialPhases(gearset: Gearset): Phases {
  validateGearset(gearset);
  const firstOrbit = Math.PI / 2;
  const orbits = Array.from({ length: gearset.planets }, (_, index) => firstOrbit + index * TAU / gearset.planets);
  const sun = 0;
  // A tooth maximum is at local angle zero, for external AND inward ring teeth.
  // External: Ns(φ−θs) + Np(φ+π−θp) = π (mod 2π).
  // Internal: Nr(φ−θr) − Np(φ−θp) = π (mod 2π).
  const ring = toothPhase(
    ((gearset.sun + gearset.ring) * firstOrbit + gearset.planet * Math.PI - gearset.sun * sun) / gearset.ring,
    gearset.ring,
  );
  const planets = orbits.map((orbit) => toothPhase(
    ((gearset.sun + gearset.planet) * orbit + (gearset.planet - 1) * Math.PI - gearset.sun * sun) / gearset.planet,
    gearset.planet,
  ));
  return { sun, ring, carrier: 0, planets, orbits };
}

export function solveGearbox(configuration: Configuration): Solution {
  const { gearset, grounded, driven, speed } = configuration;
  validateGearset(gearset);
  if (!MEMBERS.includes(grounded) || !MEMBERS.includes(driven)) {
    throw new RangeError('Choose a sun, ring, or carrier for both the grounded and driven member.');
  }
  if (grounded === driven) {
    throw new RangeError(`The ${grounded} cannot be both grounded and driven. Choose two different members.`);
  }
  if (!Number.isFinite(speed)) {
    throw new RangeError('Input speed must be a finite number of revolutions per second.');
  }
  const output = MEMBERS.find((member) => member !== grounded && member !== driven)!;
  const coefficients = { sun: gearset.sun, ring: gearset.ring, carrier: -(gearset.sun + gearset.ring) };
  const ratio = -coefficients[driven] / coefficients[output];
  const speeds: Record<Member, number> = { sun: 0, ring: 0, carrier: 0 };
  speeds[driven] = speed === 0 ? 0 : speed;
  speeds[output] = speed === 0 ? 0 : ratio * speed;
  const planetSpeed = speeds.carrier - gearset.sun / gearset.planet * (speeds.sun - speeds.carrier);
  if (![...Object.values(speeds), planetSpeed].every(Number.isFinite)) {
    throw new RangeError('The requested speed exceeds the finite range of this model.');
  }
  return {
    gearset: { ...gearset },
    grounded,
    driven,
    output,
    speeds,
    planetSpeed,
    ratio,
    geometry: geometryFor(gearset),
    phases: initialPhases(gearset),
  };
}

export function frameAt(solution: Solution, time: number): GearboxFrame {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError('Timeline time must be a finite, non-negative number of seconds.');
  }
  const { phases, speeds, geometry } = solution;
  const sunAngle = phases.sun + speeds.sun * TAU * time;
  const ringAngle = phases.ring + speeds.ring * TAU * time;
  const carrierAngle = phases.carrier + speeds.carrier * TAU * time;
  const spin = solution.planetSpeed * TAU * time;
  if (![sunAngle, ringAngle, carrierAngle, spin].every(Number.isFinite)) {
    throw new RangeError('The requested time exceeds the finite angular range of this model.');
  }
  return {
    time,
    sunAngle,
    ringAngle,
    carrierAngle,
    planets: phases.orbits.map((initialOrbit, index) => {
      const orbitAngle = initialOrbit + carrierAngle;
      return {
        index,
        orbitAngle,
        angle: phases.planets[index] + spin,
        x: geometry.orbitRadius * Math.cos(orbitAngle),
        y: geometry.orbitRadius * Math.sin(orbitAngle),
      };
    }),
  };
}

export function willisResidual(gearset: Gearset, speeds: Readonly<Record<Member, number>>): number {
  return gearset.sun * (speeds.sun - speeds.carrier) + gearset.ring * (speeds.ring - speeds.carrier);
}

export function meshResiduals(gearset: Gearset, frame: GearboxFrame) {
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  return frame.planets.map((planet) => {
    const sunContact = gearset.sun * (planet.orbitAngle - frame.sunAngle);
    const planetInnerContact = gearset.planet * (planet.orbitAngle + Math.PI - planet.angle);
    const ringContact = gearset.ring * (planet.orbitAngle - frame.ringAngle);
    const planetOuterContact = gearset.planet * (planet.orbitAngle - planet.angle);
    return {
      sunPlanet: wrap(sunContact + planetInnerContact - Math.PI),
      ringPlanet: wrap(ringContact - planetOuterContact - Math.PI),
    };
  });
}
