# Star Nursery — particle study 041

An independent, locally generated astronomical artwork at
`/projects/star-nursery/`. It is **illustrative, not an astrophysics model**.
There are no telescope images, external textures, fonts, APIs, measurements,
or physically meaningful units.

## Files and extension points

- `data.ts`: the three structures, fixed gravitational anchors, palettes,
  default controls, and explanatory copy.
- `engine.ts`: deterministic seeded distributions, bounded budgets, and the
  CPU reference for the shader's displacement.
- `shaders.ts`: perspective-sized point sprites, diffuse emission, dark
  extinction splats, fine dust, and small diffraction-like stellar cores.
- `scene.ts`: five point layers, shared uniforms, direct orbit controls,
  geometry replacement, and the Three.js lifecycle.
- `index.ts` / `style.css`: the entire website, controls, accessible feedback,
  responsive layout, fallback, and interpretation notes.
- `manifest.json`: collection discovery only; the site needs no shared header.

## Three different volumes

**Cradle cloud** samples two irregular, folded banks along a three-dimensional
spine. Nearer dark splats interrupt the luminous material along a seam.
Several separate anchors form the stellar knots.

**Twin seeds** samples two offset ellipsoidal reservoirs plus a narrow bridge.
The clouds have different depths, not just different horizontal positions.

**Open shell** samples the surface of an uneven, hollow ellipsoid with finite
thickness. The near and far walls overlap in projection. It is not a flat
ring. Formation can collect shell material into new knots.

Each preset supplies its own initial formation and wind values. Presets
change the spatial distribution; palettes are intentionally related.
To add a preset, extend the `PresetId` union, add its data and anchors, and
add its bounded sampler in `cloudPoint`. Keep the CPU displacement and GLSL
formula aligned when changing the motion algorithm.

## Motion and boundedness

Each particle has a base position, a fixed nearby anchor, and a phase.
Formation contracts its offset from that anchor; wind expands that offset
and adds a low-amplitude, periodic outward breath. A small, independent
three-axis displacement supplies slow drift. No force accumulation,
integration instability, or particle-particle search is involved.

The CPU generator is O(N) because the number of anchors is fixed and small.
Each animation frame updates a few shared uniforms; vertex work is O(N).
Phase advances at 0.14 radians per active second, uses a capped 50 ms delta,
and wraps at 2π. All animated frequencies are integer multiples, making
the wrap continuous. `transformParticle` is a pure CPU reference used by
the focused invariant test.

The full budget is 7,800 fine particles, 420 diffuse splats, 84 dark splats,
1,300 distant stars, and at most six stellar seeds. Views initially narrower
than 620 px use 4,800 / 280 / 56 / 900 particles instead. Resizing does not
rebuild the cloud. Requested counts are sanitized and capped. DPR is capped
at 1.25, sprites are capped at 128 CSS-reference pixels, and there are five
draw calls without lights, shadows, textures, or full-screen postprocessing.
Point size follows the camera's focal length, including portrait framing,
so changing the aspect ratio does not inflate the clouds' soft edges.

The volume is an art-directed stack of three-dimensional translucent point
splats, not a ray-marched gas simulation. Emission and extinction have a
fixed compositing order. Orbiting reveals real position/parallax, but
absorption and color are intentionally approximate.

## Interaction and access

- **Formation:** loose material → compact stellar knots; changes geometry
  even while paused.
- **Stellar wind:** wider volume and larger periodic displacement.
- **Reseed dust:** a new deterministic arrangement, preserving the chosen
  structure and shaping values.
- **Pause / Play:** freezes/resumes the shared phase, including all twinkle.
  Camera movement never has damping, inertia, or automatic rotation.
- **Camera:** drag or touch-drag to orbit; wheel, pinch, or + / − to zoom.
  Focus the sky and use arrow keys to orbit. Space toggles playback.
- **Reset view:** restores only the opening camera.
- **Return to the first cloud:** restores the initial seed, cradle preset,
  shaping, time, and camera, while preserving playback state.

Reduced-motion visitors receive a fully composed, initially still scene.
Live media-query changes update playback. Explicit Play remains available.
Touch targets are at least 40 px, range inputs are native and labeled,
essential text is at least 12 px, and structure buttons expose
`aria-pressed`. The notes explain the illustration without relying on color.

## Lifecycle and failure behavior

`createProjectPage` owns the DOM and abortable input/media listeners.
`spatialExperiment` owns resize observation, RAF, visibility handling,
WebGL recovery, renderer disposal, and the scene graph. Its orbit helper
removes pointer/keyboard listeners on teardown. Replacing an arrangement
immediately disposes each old geometry; current geometry and all materials
are disposed with the scene. No independent timers, textures, or global
listeners are created. Destroy and abort are safe to repeat.

If WebGL cannot start, the site preserves its notes, explains the graphics
requirement, and disables unavailable controls rather than showing a broken
interactive surface.

## Focused validation

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/series/star-nursery.spec.ts
```

The three tests cover finite/deep and deterministic geometry, distinct
structures, formation/wind displacement, count/time bounds, real canvas
changes and frozen frames, controls, keyboard camera movement, a 375 px
touch/reduced-motion layout, and repeated/abort-driven teardown.
