# Cam Workshop

A self-contained, plum-and-coral instrument for radial cams with a **translating
knife-edge follower**. No roller geometry, external artwork, fonts, network
services, or added dependencies are used.

## Files and extension points

- `data.ts`: law names, exact normalized derivative peak constants, explanations,
  geometry limits, timing presets, and model limitations. A timing preset changes
  only rise / high dwell / return, never the law or geometry.
- `engine.ts`: pure validation, analytic laws, angular derivatives, one-sided
  boundary values, profile coordinates, and constant-speed playback.
- `scene.ts`: original SVG mechanism and three responsive Canvas 2D graphs. It
  keeps geometry separate from controls and never fits a spline across a jump.
- `index.ts`: the `mount(ProjectContext): ProjectInstance` lifecycle, native
  controls, validation feedback, keyboard interactions, and reduced-motion state.
- `style.css`: all selectors are scoped to `.project-cam-workshop`. Essential
  diagram labels are HTML; canvas labels are drawn at 14 CSS pixels, never scaled
  down with an SVG viewBox.
- `manifest.json`: collection discovery only. No shared registry edit is needed.

To add a law, add its content and exact peak constants to `LAWS`, extend `LawId`
and `normalizedLaw`, and add endpoint/finite-difference/contact checks to the
focused spec. Keep displacement and both analytic derivatives together. For a
law whose peaks exceed the current cycloidal envelope, also extend the plot
scaling in `scene.ts`; never silently clip a new law's derivatives.

To add a timing example, add a `PRESETS` entry. Supported moving intervals are
whole degrees from 1 to 359. High dwell is a nonnegative whole number; low dwell
is `360 − rise − high − return`. Zero dwells are allowed and skipped. Invalid
draft timing stays visible, pauses playback, and leaves the last valid model and
all unrelated controls intact.

## Numerical model

The phase `u` runs from 0 to 1 over each moving interval. For a rise of lift `h`
and interval `β` **in radians**:

```
s = h f(u)
ds/dθ = (h/β) f′(u)
d²s/dθ² = (h/β²) f″(u)
```

The return uses `h[1 − f(u)]` and negative signs on both derivative expressions.
Dwells have constant displacement and zero derivatives. Length is normalized
in `lu`; angular derivatives have units `lu/rad` and `lu/rad²`. The speed control
is a physical constant angular speed in rpm: `ω = 2π rpm / 60` rad/s. Temporal
derivatives would be `ω ds/dθ` and `ω² d²s/dθ²`; they are not the plotted values.

Intervals are half-open and right-continuous. At an acceleration jump, the
classical acceleration at the edge is undefined: the UI explicitly shows the
right-hand limit and reports both sides. Curves are drawn as separate paths with
open/filled left/right markers. The harmonic law has acceleration jumps at
dwell edges. Cycloidal and 3–4–5 laws have zero endpoint acceleration but finite
jerk steps at dwell edges. Equal harmonic rise and return intervals without
dwells have continuous acceleration at their joins.

Positive cam rotation is counterclockwise in mathematical coordinates. With the
fixed follower pointing up at reference angle `π/2`, the body radius is
`r(φ) = Rb + s(π/2 − φ)`. In SVG screen coordinates a body point for phase `θ` is:

```
x = (Rb + s(θ)) sin θ
y = −(Rb + s(θ)) cos θ
```

Rotating that body by SVG angle `−θ` puts the point exactly at
`(0, −[Rb + s(θ)])`. The blade apex is placed there. The displayed polyline
contains all timing boundaries, 0.5° angular samples, additional moving-interval
samples, and the **exact current analytic contact vertex**, inserted on every
scrub/animation frame. Thus the follower touches the actual drawn centerline,
not merely a separate readout. Away from the inserted point, the visual profile
is a fine polygonal approximation; exported analytic functions are not polygonal.

The fixed guide and knife blade are diagrammatic. Contact is imposed, not solved
from dynamics. There is no spring, mass, force, friction, loss-of-contact,
pressure-angle, curvature, undercut, material, stress, or tolerance analysis.
Smooth derivatives do not establish manufacturability or safety.

## Lifecycle and controls

Transport and desktop instruments reserve a local 64px right-side gap plus
the safe-area inset. On phones the playback row spans the workbench while
the lower scrub/speed row leaves the launcher corner clear; no footer is added.

The full-height workspace keeps the cam, phase shortcuts and transport together.
**Parameters** opens/focuses the timing, motion-law, comparison and geometry dock;
**Traces** opens the three live analytic graphs. On narrow or short viewports
both triggers open the same instrument dock in a native dialog. **Notebook**
contains detailed peaks, experiments, every law and derivative, coordinate
assumptions, limitations and keyboard guidance. Close/Escape returns focus.

`index.ts` assembles these existing nodes without re-rendering controls.
The dock uses wrapper tab panels with `preserveLayout`: both are stacked in
the same zero-minimum grid area so hidden graphs retain their measured size
without adding page height. Extend those panels rather than changing the
semantic roles of the named sections. Native dialogs inherit the plum paper
through `--workspace-paper`; new listeners and observers must use `page.signal`
and `page.onCleanup`. The SVG fills the remaining stage height, and canvases
redraw at their actual resized CSS size.

- Play/pause, ±5° steps, reversible 0–360° scrub, rpm, and full reset work locally.
- Reset restores the default cycloidal setup, 8 rpm, all comparisons, and a
  paused angle of 0°. Initial reduced-motion view instead starts at a useful 42°
  study angle; without reduced motion it plays.
- Live reduced-motion changes pause immediately; disabling the preference never
  restarts playback automatically. Explicit Play remains available.
- All listeners use `page.signal`; the RAF loop and three size observers are
  registered with `page.onCleanup`. Destroy/abort is idempotent, and returned
  `reset` / `setPaused` are inert after disposal.
- If a canvas cannot initialize, previously created plots release their resize
  observers, the partial page is removed, and the original error is surfaced.

## Focused verification

From the repository root, using the existing Playwright runner:

```sh
npx --no-install playwright test tests/series/cam-workshop.spec.ts
```

The existing config creates isolated per-run output directories. Screenshots use
`testInfo.outputPath`, not shared preview assets. The spec checks exact endpoints,
finite differences, invalid inputs, all timing boundaries, world-space profile
contact, responsive/browser controls, reduced motion, and cleanup.
