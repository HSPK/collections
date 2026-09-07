# Gearbox Playground

A standalone, local-only planetary-gear kinematics notebook. The SVG contains a
sun, an inward-toothed ring, three meshing planets, and a carrier whose actual pin
positions follow the planets. There are no remote assets, dependencies, or saved
user data.

## Files and extension points

- `data.ts`: the three validated tooth families, experiment presets, labels, and
  educational copy. Add another model here, not in the UI markup.
- `engine.ts`: pure validation, pitch geometry, starting phases, speed solution,
  absolute poses, and mesh residuals. No DOM or animation state.
- `scene.ts`: SVG linework. It consumes the model's absolute angles and positions;
  never assign unrelated visual rotation rates here.
- `index.ts`: scoped lifecycle, controls, readouts, and a deterministic 20-second
  study clock. Setup/speed/direction changes rewind and pause. Scrubbing and
  0.1-second stepping also pause; reset restores Model A and remains paused.
  Tabs and native dialogs reuse `src/core/workspace.ts`, moving the original
  nodes rather than rebuilding controls when panels change.
- `style.css`: every selector is scoped to `.project-gearbox-playground`.
  The viewport-height root uses shrinkable grid tracks and a responsive SVG;
  long instrument panes and dialogs scroll independently.

## Workspace controls

Compact transport and desktop inspector content reserve 64px plus the right
safe-area inset for the floating collection menu. Preserve this local
clearance when adding controls rather than inserting a blank footer.

The planetary drawing and full timeline transport remain together. The desktop
dock has **Parameters** (tooth family, member roles, input direction/speed, and
pitch-circle toggle) and **Readout** (output, all signed member rates, and color
key) tabs. Arrow keys, Home, and End select a tab without altering the model.
At widths up to 700px or heights up to 540px, the **Parameters** button opens the
same dock in a native dialog. Short landscape screens put drawing and transport
side by side; mobile users can return to the simulation with Close or Escape.

**Experiments** contains Reduction, Overdrive, Reverse, and their explanations.
**Notebook** contains the Willis relation, current substitution, pitch and mesh
checks, planet spin, tooth-family notes, field notes, and all model assumptions.
Panels do not reset or pause playback; presets and setup changes retain their
original clock semantics. Dialogs use `--workspace-paper` for the original
paper theme and return focus to their opener. Keep named sections inside pane
wrappers when extending the dock; own new events with `page.signal`.

## Adding a tooth family

Add a `GearsetModel` to `GEARSETS` with a unique `id`, a useful `name` and `note`,
and integer `sun`, `planet`, `ring` counts with `planets: 3`. Keep these rules:

1. The common normalized module is 1; pitch radius is `N / 2`.
2. `ring = sun + 2 * planet`. Therefore the pin orbit radius is simultaneously
   `Rs + Rp` and `Rr - Rp`.
3. `(sun + ring) / 3` must be an integer for equal 120° assembly spacing.
4. Neighboring planet envelopes must clear one another. Validation checks this.
5. Counts must be 6–180: a drawing complexity limit, **not** a manufacturing rule.

Call `validateGearset` and test the new family across all six distinct
grounded/driven choices, both speed signs, and multiple timeline positions.
Do not silently modify an incompatible tooth count or force a last-minute visual
phase adjustment. A `RangeError` is intentional.

## Model and phase convention

All engine angles are unwrapped radians, positive counterclockwise. Rates are
signed normalized revolutions/second. The SVG maps `(x, y)` to `(x, -y)` and uses
`rotate(-angle * 180 / π)`. Planet translation and rotation are in **world space**;
carrier rotation is not accidentally added to planet spin a second time.

With one member grounded and a different member driven, the remaining member
is determined by the Willis relation:

```text
Ns (ωs − ωc) + Nr (ωr − ωc) = 0
ωp = ωc − (Ns / Np) (ωs − ωc)
```

The output/input ratio is solved independently of speed, so it remains meaningful
at zero input. A stopped mechanism is labelled stopped, not assigned a direction.
No torque, power, strength, friction, efficiency, or load is calculated.

The first pin begins at `φ₀ = π/2`, with the others 120° apart. An external tooth
maximum and an inward ring tooth maximum both have local angle zero. For every
planet at absolute center bearing `φ`, tooth-to-gap contact requires:

```text
Ns(φ − θs) + Np(φ + π − θp) ≡ π  (mod 2π)  [external contact]
Nr(φ − θr) − Np(φ − θp)     ≡ π  (mod 2π)  [internal contact]
```

`initialPhases` solves both congruences, rather than simply putting every rotor at
zero. Tooth-period normalization is harmless; rotations by a whole tooth pitch
leave the silhouette unchanged. Model C deliberately includes an odd-toothed
ring with a nonzero starting phase. `frameAt` preserves both congruences over time,
and `meshResiduals` exposes their signed, wrapped residuals for testing.

The shallow trapezoidal outlines are **illustrative, not involute profiles or
manufacturing geometry**. Pitch geometry and angular phases are coherent, but
these silhouettes do not claim exact conjugate flank contact. Carrier arms are
drawn in front of the gear faces so the pins and the distinct orbit are legible.

## Lifecycle and verification

Mount with `createProjectPage`. Listeners use `page.signal`; the `createLoop` and
scene are disposed with `page.onCleanup`. Returned `reset`/`setPaused` methods are
inert after destruction. Reduced motion starts paused; either live preference
change pauses without automatically resuming. Explicit Play is still available.
An invalid choice pauses playback, marks controls invalid, reports the error, and
clearly labels the retained scene as the last valid configuration.

Run only the focused existing Playwright suite from the repository root:

```sh
npm test -- tests/series/gearbox-playground.spec.ts
```

The spec imports pure TypeScript functions directly and checks speed signs,
ratios, initial phases, mesh residuals, pin positions, invalid inputs, rendered
transforms, playback, scrubbing, mobile layout, reduced motion, and disposal.
Browser artifacts use Playwright's isolated per-run output directory.
