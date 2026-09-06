# Motor Field Lab

A self-contained, normalized permanent-magnet motor instrument. Mounts with
`createProjectPage(context, 'motor-field-lab')`; all controls, artwork, and
styles belong to its root. No assets, fonts, network requests, or dependencies
are needed.

## Files and extension points

- `data.ts`: phase axes, channel colors/dashes, viewing speeds, reproducible
  experiment presets, and field-notebook copy. Presets specify complete input
  states; they pause the lab when loaded.
- `engine.ts`: pure, degree-based current, vector, torque, and kinematic
  functions. `sampleMotor` is history-free. `advanceElectricalAngle` advances
  the prescribed electrical command, not a mechanical simulation.
- `scene.ts`: original SVG stator/rotor and waveform renderers. It owns no
  listeners or animation loops. Coordinates are mathematical +x right, +y up;
  conversion to screen coordinates negates y. All arrows share a 135 SVG-unit
  scale per normalized field unit. The rotor moment points S → N; a positive
  phase current makes its positive-axis **stator** face S, because the air-gap
  field points toward it from the opposite N face.
- `index.ts`: controls, DOM readouts, announcements, reduced-motion policy,
  and the single `createLoop` lifecycle. `page.signal` owns event listeners;
  `page.onCleanup` cancels the loop and releases both SVG scenes. Returned
  playback/reset methods cannot act after destruction or context abort.
- `style.css`: selectors are scoped to `.project-motor-field-lab`. Essential
  diagram letters use 26–28 SVG units, remaining above 12 CSS pixels at 375px;
  legends, scales, and longer labels are unscaled DOM text.

## Model contract

For axes α = (0°, 120°, 240°), `i[k] = enabled[k] cos(θe − α[k])`.
The actual field is `(2/3) Σ i[k] (cos α[k], sin α[k])`. All-enabled currents
sum to zero and the field is exactly `(cos θe, sin θe)`, to floating-point
precision. Disabling a phase zeros its current, waveform, and contribution;
it does not redistribute currents through a circuit.

One pole pair is fixed: `φe = φm`. The rotor is either prescribed to follow
`φm = θe − δcmd` or held at an absolute mechanical angle. `τ* = mx By − my Bx`
uses the **actual** field, including its varying magnitude and direction when
phases are disabled. This is an ideal unit-moment torque, not N·m.
Values below `1e-12` are treated as numerical zero. At zero field the field
direction and actual load angle are `null`, torque is zero, and field/torque
arrows are hidden. Exactly opposite alignment also has zero instantaneous
torque; it is not described as stable.

Playback is a fixed 36 electrical degrees/second times the viewing speed.
There is no electrical circuit, dynamic load, inertia, loss, or motor
controller. Adding pole-pair support would require changing the rotor's
physical geometry as well as electrical/mechanical conversions; do not just
relabel the one-pair drawing. A future dynamics mode should be separate from
the existing deterministic prescribed-motion mode.

Reset restores the balanced 30° command, 35° lag, all sources enabled, 1×
speed, and pauses. Scrubbing any angle pauses. Rotor-mode changes preserve
its current orientation. Reduced motion pauses initial playback; either
live preference change pauses without auto-resuming. Explicit Play remains
available.

## Focused verification

```sh
npm test -- tests/series/motor-field-lab.spec.ts
```

The spec imports the pure engine, checks hundreds of field/current/torque
relationships, and verifies SVG geometry, disabled traces, deterministic
scrubbing, keyboard controls, presets, playback, reduced motion, mobile
layout, and mount/abort/dispose behavior. Screenshots use the runner's
isolated output directory, never a shared preview location.
