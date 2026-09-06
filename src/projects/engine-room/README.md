# Four-Stroke Studio

A normalized, original SVG cutaway at `/projects/engine-room/`. Nothing is
downloaded, stored, or simulated on a server.

## Files and extension points

- `engine.ts`: pure slider-crank geometry, ideal valve schedule, 720-degree
  cycle state, and deterministic clock. Units are arbitrary; angles are
  degrees at the public boundary, radians inside trigonometric functions.
- `data.ts`: stroke explanations, colors, and rod-length study shortcuts.
- `scene.ts`: original SVG parts and exact piston-travel plot. Parts are
  constructed once, then updated from the same `EngineState` as the UI.
- `index.ts`: controls, accessible numeric readouts, lifecycle and preference
  handling. `style.css` is scoped to `.project-engine-room`.
- `manifest.json`: independent page discovery, registered after implementation.

To add a rod-length study, add an entry to `geometryStudies` within the UI's
2-to-5 ratio range. It needs no drawing-specific coordinates. The crank radius
stays one unit, the cylinder position stays fixed, and the crank center moves
to accommodate the new rod. If broadening the range, also check the cutaway
framing and the cylinder-to-crankcase connection at both extremes.

To add a different valve schedule, change `stateAt`/`valveLift`, the plotted
valve paths, and the schedule explanations together. Do not present a
different schedule as production engine timing. Pressure or force models
would need separate explicit assumptions; they are not inferred from color.

## Geometric contract

With a positive radius r, rod length l > r, and clockwise crank angle theta
from top dead center, the pin is `(r sin(theta), r cos(theta))` and the wrist
is `(0, r cos(theta) + sqrt(l^2 - r^2 sin(theta)^2))`. Model y points upward.
The two points remain exactly l apart. Downward piston displacement is
`l + r - wrist.y`; its full range is exactly `2r`.

The SVG uses 48 pixels per unit. The crank rotates clockwise in screen
coordinates. The piston wrist and connecting rod endpoints are transformed
from the pure model, not independently animated. The numbered parts and
port legend remain readable on a 375px viewport.

## Deliberate simplifications

- Four equal 180-degree strokes; no valve overlap or advance.
- Valve lift is a schematic sin-squared event, not a solved cam or spring.
- Heat and gas-flow cues explain sequence, not pressure, temperature or flow.
- The clock prescribes crank motion; no torque, combustion, friction, inertia
  or manufacturing tolerances are modeled.
- At a paused 720-degree endpoint the UI shows completed exhaust. Playback
  wraps continuously to intake. Manual scrubbing clamps to either endpoint.

This is an educational mechanism, not manufacturing, fuel-tuning, wiring or
safety-critical design guidance.

## Interaction and lifecycle

Scrubbing, stepping and geometry edits pause the clock. Reset restores the
default geometry, speed and display toggles at 0 degrees, paused. The cutaway
supports Space, arrow keys, Shift+arrows, Home and End; native controls remain
independently keyboard-operable. Reduced motion pauses on mount and on live
preference changes; disabling the preference never restarts motion.
`createLoop` sleeps on pause/hidden documents; `createProjectPage` aborts all
listeners and cancels the loop on exit. Exported controls become inert after
destruction.

Run only this site's focused checks with:

```sh
npm test -- tests/series/engine-room.spec.ts
```

They cover geometric closure, stroke and valve boundaries, displacement
derivatives, deterministic seeking, actual SVG connections, native controls,
375px layout, reduced motion and abort cleanup. The existing runner isolates
screenshots and traces in its per-run output directory.
