import { cross, dot, eccentricityVector, elements, length, stateFromApsides } from './mechanics';
import type { State } from './mechanics';

export interface Mission {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  description: string;
  instruction: string;
  periapsis: number;
  apoapsis: number;
  inclination: number;
  targetPeriapsis: number;
  targetApoapsis: number;
  targetInclination: number;
  budget: number;
  planner: 'hohmann' | 'plane' | 'ellipse';
}

export const MISSIONS: readonly Mission[] = [
  {
    id: 'first-light', code: '01', title: 'First light', subtitle: 'CIRCULAR ORBIT TRANSFER',
    description: 'Lift a 400 km parking orbit to 2,000 km with two precisely placed impulses.',
    instruction: 'Build the transfer, inspect its orange arc, then execute each burn. The second impulse circularizes at the new altitude.',
    periapsis: 400, apoapsis: 400, inclination: 28.5,
    targetPeriapsis: 2000, targetApoapsis: 2000, targetInclination: 28.5,
    budget: 1.2, planner: 'hohmann',
  },
  {
    id: 'meridian', code: '02', title: 'Meridian', subtitle: 'ORBITAL PLANE CHANGE',
    description: 'Rotate a 900 km orbit from 28.5° to 38.5° inclination without changing its size.',
    instruction: 'At the ascending node, a normal impulse alone also raises the orbit. The solution includes a small retrograde component to keep speed constant.',
    periapsis: 900, apoapsis: 900, inclination: 28.5,
    targetPeriapsis: 900, targetApoapsis: 900, targetInclination: 38.5,
    budget: 1.6, planner: 'plane',
  },
  {
    id: 'long-arc', code: '03', title: 'The long arc', subtitle: 'ELLIPTICAL ORBIT MATCH',
    description: 'From a 600 × 5,200 km ellipse, lower apoapsis to match a 600 × 2,800 km reference orbit.',
    instruction: 'Wait for periapsis, then trim along-track speed. This matches orbit shape and plane, not another spacecraft’s position: no rendezvous is claimed.',
    periapsis: 600, apoapsis: 5200, inclination: 51.6,
    targetPeriapsis: 600, targetApoapsis: 2800, targetInclination: 51.6,
    budget: 0.8, planner: 'ellipse',
  },
];

export const initialState = (mission: Mission) => stateFromApsides(mission.periapsis, mission.apoapsis, mission.inclination);
export const targetState = (mission: Mission) => stateFromApsides(mission.targetPeriapsis, mission.targetApoapsis, mission.targetInclination);

export const GOAL_TOLERANCES = Object.freeze({ apsisKm: 5, planeDegrees: 0.1, apsidalDegrees: 0.2 });

export interface MissionAlignment {
  planeError: number | null;
  apsidalError: number | null;
  aligned: boolean;
}
export interface GoalStatus {
  complete: boolean;
  altitudeError: number | null;
  planeError: number | null;
  apsidalError: number | null;
  text: string;
}

export function missionAlignment(mission: Mission, state: State): MissionAlignment {
  // All reference orbits have their ascending node on +X. Inclination alone is not a plane match.
  const target = targetState(mission);
  const h = cross(state.position, state.velocity);
  const ht = cross(target.position, target.velocity);
  const denominator = length(h) * length(ht);
  const planeError = denominator < 1e-8 ? null :
    Math.acos(Math.max(-1, Math.min(1, dot(h, ht) / denominator))) * 180 / Math.PI;
  const eccentric = mission.targetApoapsis !== mission.targetPeriapsis;
  const e = eccentricityVector(state);
  const et = eccentricityVector(target);
  const eProduct = length(e) * length(et);
  const apsidalError = !eccentric || eProduct < 1e-12 ? null :
    Math.acos(Math.max(-1, Math.min(1, dot(e, et) / eProduct))) * 180 / Math.PI;
  const aligned = planeError !== null && planeError <= GOAL_TOLERANCES.planeDegrees &&
    (!eccentric || (apsidalError !== null && apsidalError <= GOAL_TOLERANCES.apsidalDegrees));
  return { planeError, apsidalError, aligned };
}

export function missionGoal(mission: Mission, state: State): GoalStatus {
  const orbit = elements(state);
  const altitudeError = orbit.periapsis === null || orbit.apoapsis === null ? null :
    Math.max(Math.abs(orbit.periapsis - mission.targetPeriapsis), Math.abs(orbit.apoapsis - mission.targetApoapsis));
  const { planeError, apsidalError, aligned } = missionAlignment(mission, state);
  const complete = state.status === 'flying' && altitudeError !== null && altitudeError <= GOAL_TOLERANCES.apsisKm && aligned;
  return {
    complete, altitudeError, planeError, apsidalError,
    text: complete ? 'Target orbit acquired' : state.status === 'impact' ? 'Flight ended · surface impact' :
      state.status === 'escaped' ? 'Flight ended · escaped simulation domain' : 'Target orbit not yet acquired',
  };
}
