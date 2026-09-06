export const PHASES = [
  { id: 'a', name: 'A', axis: 0, color: '#efa976', dash: '' },
  { id: 'b', name: 'B', axis: 120, color: '#70d8c5', dash: '9 4' },
  { id: 'c', name: 'C', axis: 240, color: '#bdbee9', dash: '3 4' },
] as const;

export const POLE_PAIRS = 1;
export const ELECTRICAL_SPEED = 36;
export const SPEEDS = [
  { value: 0.25, label: '0.25×' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
] as const;

export const PRESETS = [
  {
    id: 'balanced', name: 'Balanced drive', short: 'Balanced',
    electricalAngle: 30, enabled: [true, true, true], commandLag: 35,
    rotorMode: 'follow', rotorAngle: 0,
    observation: 'Three fixed axes, one moving field. The currents change, but the balanced resultant keeps a magnitude of exactly 1. With a prescribed 35° rotor lag, ideal torque stays positive.',
  },
  {
    id: 'missing-phase', name: 'Drop phase B', short: 'Drop phase B',
    electricalAngle: 0, enabled: [true, false, true], commandLag: 0,
    rotorMode: 'follow', rotorAngle: 0,
    observation: 'At the initial 0° command, the rotor has zero commanded lag but nonzero torque. Removing B can tilt the actual field away from the command. Play to see its elliptical, uneven resultant.',
  },
  {
    id: 'leading-rotor', name: 'Rotor leads the field', short: 'Reverse torque',
    electricalAngle: 30, enabled: [true, true, true], commandLag: -45,
    rotorMode: 'follow', rotorAngle: 0,
    observation: 'The rotor leads the balanced field by 45°. The cross product is negative: ideal electromagnetic torque acts clockwise, opposing the prescribed counterclockwise motion.',
  },
  {
    id: 'no-field', name: 'All sources off', short: 'All off',
    electricalAngle: 30, enabled: [false, false, false], commandLag: 35,
    rotorMode: 'follow', rotorAngle: 0,
    observation: 'All three currents, the resultant, and electromagnetic torque are zero. Field direction is undefined. Playback can still move the prescribed rotor; that motion is not caused by torque.',
  },
] as const;

export const FIELD_NOTES = [
  {
    number: '01', title: 'Stationary copper, moving field.',
    text: 'The A, B, and C magnetic axes sit 120° apart. Each colored arrow is one signed phase contribution, not a moving coil. Reversing its current swaps the N and S pole faces. Inside the air gap, the field points from stator N toward stator S.',
  },
  {
    number: '02', title: 'The rotor tries to align.',
    text: 'The permanent magnet’s moment points from its S end to its N end. Ideal torque turns that moment toward the actual resultant. Counterclockwise is positive. Aligned and exactly opposite moments both have zero instantaneous torque; opposite alignment is not stable.',
  },
  {
    number: '03', title: 'An angle is not a motor controller.',
    text: 'This lab has one pole pair, so rotor electrical angle equals mechanical angle. “Follow command” prescribes the rotor position from the electrical command and a chosen load angle. “Hold rotor” fixes its mechanical angle. Neither mode integrates torque into motion.',
  },
] as const;
