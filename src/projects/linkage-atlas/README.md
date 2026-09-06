# Linkage Atlas

A self-contained four-bar kinematics notebook. The SVG drawing is the working
instrument, not an illustration: changing any length, assembly, or tracer
coordinate changes the circle-intersection model and its full reachable path.
No assets, fonts, services, or additional packages are required.

## Files

- `data.ts`: the five studies, their original proportions, experiments, and
  construction notes.
- `engine.ts`: DOM-free closure, classification, reachability, deterministic
  path sampling, chord deviation, and boundary-aware input advancement.
- `scene.ts`: original SVG drafting geometry. The view box follows the CSS
  viewport, so 12–14 px labels remain that size on a 375 px screen.
- `index.ts`: the independently mounted page, controls, readouts, and lifecycle.
- `style.css`: rules scoped to `.project-linkage-atlas`.
- `manifest.json`: discovery metadata; register after the implementation.

## Model and conventions

All four lengths use the same arbitrary model unit:

```text
A = (0, 0)                         D = (d, 0)
B = (a cos θ, a sin θ)             |B − C| = b
                                  |D − C| = c
u = (D − B) / |D − B|
x = (|BD|² + b² − c²) / (2 |BD|)
h = sqrt(b² − x²)
C = B + x u ± h leftNormal(u)
P = B + fraction (C − B) + offset leftNormal((C − B) / b)
```

Positive angles are counterclockwise with y up. `plus` is **left of B → D**,
not necessarily above the ground line. It is a signed, history-independent
assembly choice. It is not inferred from the preceding frame. Fractions may
extend past the coupler ends, and offset is a signed distance in model units.

The circles intersect when `|b − c| ≤ |BD| ≤ b + c`. Equality gives a tangent,
one-point closure. Coincident equal circles have infinitely many solutions;
concentric unequal circles have none. Neither case receives an invented C.
Invalid lengths and globally impossible closure also return `pose: null`.
The view removes C, P, the coupler, and output link whenever there is no current
solution; any visible ground/input link is only the specified partial chain.

Lengths are normalized by the longest link before circle calculations.
The relative comparison tolerance is `1e-10`. Inputs below useful floating-point
resolution (ratios beyond one billion, near-underflow, or overflowing sums)
receive an explicit diagnostic rather than unstable coordinates. Finite output
coordinates are checked before a pose is returned.

### Reachability and time

`reachableIntervals()` obtains exact angular endpoints from the circle-distance
inequalities. `sampleTrace()` samples each interval separately (nominally 900
samples per turn), includes its endpoints, and breaks at every undefined pose.
SVG paths use separate move commands and never artificially close across gaps.
A complete trace is independent of the current angle, play history, and seek
direction. Showing the other assembly adds only a labeled dashed path—not an
unlabeled ghost mechanism.

Playback is prescribed input-angle motion, 12 seconds per turn at 1×. It stops
at the first unreachable-arc boundary rather than skipping across even a narrow
gap. Manual scrub and ±1° stepping may deliberately enter unreachable states.
At a coincident-circle boundary playback stops with the undefined pose visible
as a diagnostic. No assembly is silently exchanged.

### Classification

Sort the four lengths as `s ≤ p ≤ q ≤ l`. Strict Grashof requires
`s + l < p + q`; the shortest link's location determines the inversion:

| Shortest | Input a | Output c | Inversion |
| --- | --- | --- | --- |
| Ground d | Full turn | Full turn | Double crank |
| Input a | Full turn | Rocks | Crank–rocker |
| Output c | Rocks | Full turn | Rocker–crank |
| Coupler b | Rocks | Rocks | Double rocker |

Non-Grashof mechanisms have two grounded rockers. Equality is explicitly
`change-point`, not automatically crank–rocker. Longest-equals-other-three
closure is a separate collinear limit; longest-exceeds-other-three is impossible.
The `inputFullTurn` / `outputFullTurn` flags describe geometric reachability,
including singular positions in equality cases, not guaranteed physical passage.

### Chebyshev study

The ratios are ground 2, side links 2.5 and 2.5, coupler 1, with P at its
midpoint. Only the solved **65°–95° + assembly segment** is emphasized.
Its maximum sampled perpendicular departure from the endpoint chord and
chord span are computed with 121 real poses. It is an approximate
straight-line segment, not an exact straight-line generator. Editing the
proportions, assembly, or tracer removes the original-study emphasis.

## Extending the notebook

1. Add a `LinkagePreset` to `presets` in `data.ts` with a unique ID, numbered
   name, all four positive lengths, a valid initial angle (degrees), a signed
   branch, and local tracer coordinates.
2. Write an observation that distinguishes the actual grounded inversion from
   a general Grashof label. Include a concrete experiment.
3. Check the initial angle on both branches with `solveFourBar`. Choose a
   non-tangent, unique starting pose. Do not precompute decorative paths.
4. An optional `highlight` is an input-angle interval in degrees. It must be
   completely reachable on the preset branch. The engine samples the real
   segment; it never replaces it with a straight line.
5. Run the focused spec. Its closure loop automatically covers every preset
   and both assembly signs. Add a targeted assertion for any new singular case.

The current single-highlight measurement is intended for approximately straight
segments. Other lesson types should introduce honest, model-derived measurements
rather than reuse a misleading chord-deviation label.

## Interaction and lifecycle

All numeric lengths, ranges, selects, and buttons are keyboard accessible.
Pin B also has a 44 px pointer target with arrow-key, Shift+arrow, Home, and End
equivalents. Pointer capture is released on up, cancellation, lost capture,
blur, reset, preference changes, and destruction. The rest of the plot allows
vertical touch scrolling.

Edits and scrubs pause playback. Reset restores the **selected study**, including
lengths, assembly, point, angle, speed, and guide toggles, and remains paused.
Reduced motion starts paused; every live preference change pauses without
automatic resumption. Hidden documents and blurred windows also pause.

Every listener uses `page.signal`. A `page.onCleanup` callback cancels the RAF,
releases capture, disconnects the resize observer, and removes the SVG. The
returned `setPaused` and `reset` methods become inert after destruction.

## Verification

From the collection root:

```sh
npm test -- tests/series/linkage-atlas.spec.ts
```

The existing Playwright runner imports the pure TypeScript engine directly.
Tests cover branch closure, tangency, coincident and concentric circles,
classification, invalid inputs, trace gaps and reverse seeking, live controls,
boundary playback, pointer cancellation, 375 px layout and label sizing,
reduced-motion changes, and cleanup. Test artifacts use the runner's isolated
output directory; no shared previews are generated.

This site predicts positions only. It does not model forces, torque, friction,
inertia, contact, collisions, manufacturing tolerances, or safe construction.
