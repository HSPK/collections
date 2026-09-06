# APSIS

An Earth-centered orbital flight desk. There are no fetched assets, services, or persistence dependencies.

## Modules

- `mechanics.ts`: immutable km / km/s / second state vectors, derived osculating elements, universal-variable Kepler propagation, moving-frame impulses, event termination, and conic sampling.
- `missions.ts`: three initial states, reference targets, and physical completion criteria.
- `flight.ts`: finite delta-v accounting, ordered editable maneuvers, exact event execution, Hohmann/plane-change/ellipse-trim solutions, immutable forecasts, and JSON flight logs.
- `geography.ts`: deterministic CanvasTexture construction from schematic continental polygons.
- `scene.ts`: Three.js Earth, daylight/night shading, atmosphere, orbit semantics, marker inspection, and accessible camera controls.
- `ui.ts`: flight-desk markup, numerical formatting, timeline, and altitude chart.
- `index.ts`: lifecycle, mission workflow, undo checkpoints, clock, reduced-motion preference, and UI binding.

## Model contract

Earth radius is 6,371 km; mu is 398,600.4418 km^3/s^2. Coordinates are Earth-centered inertial, with +Z north. A spacecraft is a point mass. There is no atmosphere, J2, third-body gravity, attitude, mass-dependent fuel model, finite thrust, or target-vehicle phase. The Earth texture is schematic; illumination is illustrative, not a dated ephemeris.

Kepler's universal anomaly is solved with bracketed, safeguarded Newton iterations and near-zero Stumpff series. Coasts split into at most 60-second substeps, additionally bounded by the local travel timescale. Surface crossing times are root-solved, including a grazing pericenter between two exterior samples. Unbound outward flight terminates at 200,000 km radius, a declared sandbox boundary rather than a physical sphere of influence. Individual calls are bounded to 24 simulation hours; timeline and prediction windows are bounded to six hours.

Element classification and both escape guards share a specific-energy tolerance of +/-1e-9 km^2/s^2. States inside this window are numerically parabolic, including those with slightly negative roundoff energy. They qualify for outward boundary termination even when their angular momentum is radial/degenerate. Energy below -1e-9 remains bound: merely exceeding the distance boundary does not declare an elliptic or bound radial trajectory escaped.

Burns use the **orthonormal RTN** frame: radial R = r/|r|, normal N = (r cross v)/|r cross v|, transverse T = N cross R. The UI calls T "prograde / along-track"; away from an apsis it differs from the velocity direction. Impulse cost is the Euclidean magnitude of these components. Singular frames reject burns explicitly.

Bound apoapsis uses a*(1+e)-R, with semi-major axis a derived from specific energy. Unlike p/(1-e), this remains finite and accurate for near-radial ellipses when eccentricity approaches or rounds to one. Unavailable orbital quantities remain `null`, including apsides/period below the radial angular-momentum threshold, unbound apoapsis and period, circular periapsis direction, and equatorial ascending-node direction.

Completion requires the live state to remain in flight, both apsis altitudes within 5 km of the mission target, and the **full plane-normal angle** within 0.1 degrees. Elliptical targets additionally require the eccentricity-vector direction within 0.2 degrees. `missionAlignment` and `GOAL_TOLERANCES` are shared by completion and ellipse-trim eligibility, so the planner rejects misalignment that a tangential trim cannot fix. Rejection preserves the live state, fuel, and queue, and advises reset or manual alignment correction. There is deliberately no successful-rendezvous claim.

For an unclipped ellipse, `sampleOrbit(state, 240)` retains its 241-point ordering: indices 0 and 240 are apoapsis, and index 120 is periapsis, independent of the live spacecraft's phase. Samples below Earth's surface or beyond the sandbox radius are filtered out; fixed apsis indices are not a general contract for those clipped paths. The renderer's visibility guards hide apsis labels outside that domain. Circular orbits have no distinguished apsis direction.

## Workflows and extension points

First light opens paused. **Build transfer -> inspect projected flight -> Execute burn 1 -> Execute burn 2** reaches a 2,000 km circular orbit from 400 km. Execution jumps simulation time to the actual event, not to a scripted scene. Run advances the same model and automatically executes scheduled events. Meridian rotates velocity at the intersection of the planes. The long arc changes apoapsis with a periapsis trim.

Every change creates a bounded undo checkpoint. Run creates a checkpoint at its start; undo restores the whole run. Reset starts the current mission with its original budget. Scrubbing only evaluates a copy; it does not change live time or fuel. Export produces a versioned, full-precision JSON log, not an importable save.

Add missions in `MISSIONS`, with a physical goal and an applicable planner, or introduce another pure planner returning `Plan`. Do not attach completion to timeline state or animation. Additional perturbations would require a different integrator and explicit assumptions; do not add visual offsets to physics vectors.

The clock uses bounded integer simulation-second advances, with exact subdivisions at fractional-time maneuvers. The RAF helper clamps real-time delta; warp is therefore a maximum rate that slows under load. Paused rendering is on demand. The camera has no autoplay or damping. WebGL pixel ratio is capped at 1.35. Geometry, materials, texture, controls, observers, RAF loops, and event listeners are disposed on page destruction.

## Review hooks

Open `/projects/apsis/`. The workbench is marked `[data-project-preview]`.

Useful selectors: `[data-apsis-build]`, `[data-apsis-execute]`, `[data-apsis-inspect]`, `[data-apsis-clock]` (full-precision `data-seconds`), `[data-apsis-budget]`, `[data-apsis-goal-text]`, `[data-apsis-metric]`, `[data-apsis-burn]`, `[data-apsis-burn-form]`, and `[data-apsis-mission]`. `.project-apsis[data-mission-complete="true"]` reflects the actual live-state goal evaluation.

Targeted coverage lives in `tests/projects/apsis.spec.ts`. Use the existing Playwright runner and shared dev server; no additional server or dependency is needed.
