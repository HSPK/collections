# Tidal Observatory

A fictional nautical field station: salt-paper instruments around a complete,
locally modelled lighthouse island. No forecasts, external assets, remote calls,
textures, fonts, models, environment maps, or postprocessing are used.

## Files

- `index.ts` owns the site layout, accessible instruments, live observations,
  playback, preference changes, error propagation, and page lifecycle.
- `data.ts` contains the deterministic initial state, camera stations, coastline
  functions, and the water mathematics.
- `scene.ts` constructs the layered cliffs and grass, keeper buildings, paths,
  gallery, lantern, timber landing, breakwater, boats, navigation buoys, birds,
  distant islands, sky, and water. It updates actual scene objects and returns
  observation values derived from those objects.
- `engine.ts` joins that environment to `spatialExperiment` and undamped
  `orbitView`, with no studio scene. It manages deterministic simulation time,
  immediate camera presets, zoom, rendering invalidation, and resolution caps.
- `style.css` is entirely scoped to `.project-tidal-observatory`.
- `manifest.json` registers the finished website.

## The common water surface

Coordinates are local fictional metres above a fixed chart datum. Tide `T`
is an independent offset from −0.55 to +0.85 m. Let `p = 2πt / 24`:

```text
h(x,z,T,t) = T
  + 0.045 sin(0.70x + 0.31z + p)
  + 0.023 sin(−0.28x + 1.08z − 2p)
  + 0.012 cos(1.40x + 0.90z + 3p)
```

`waterHeight` evaluates this function at the vertices of a 120 × 120 m
`PlaneGeometry`, with 112 subdivisions per side (25,088 water triangles).
The geometry is rotated −π/2 about X **before** its heights are updated.
Normals and highlights are calculated cheaply in the water fragment shader;
there is no reflection render pass or per-frame CPU normal recomputation.

Using the analytic height directly for boats would introduce small differences
from the triangulated sea. Instead, `waterSurfaceHeight` finds the same grid
cell and interpolates the same a–b–d / b–c–d diagonal as Three.js. With cell
fractions `u,v`:

```text
u + v ≤ 1: h00 + u(h10 − h00) + v(h01 − h00)
otherwise: h11 + (1−u)(h01 − h11) + (1−v)(h10 − h11)
```

Every boat and buoy sets its waterline anchor to this surface. Fore/aft and
port/starboard samples also set pitch and roll. The first boat's mooring is
`MOORING = { x: 3.35, z: 4.65, waterlineOffset: 0 }`. Its displayed water
reading is independently interpolated from the **actual mesh BufferAttribute**;
the vessel reading is its **actual Object3D Y position** minus its waterline
offset. Floating-point differences are below a micrometre at this mooring.
Raising tide by ΔT raises every water vertex and floating anchor by ΔT.
The fixed landing, cliff, and lighthouse do not rise.

The public pure helpers are `waterHeight`, `waterCell`,
`interpolateWaterTriangle`, and `waterSurfaceHeight`. These make changes to
grid density or waves explicitly testable; keep the shader's decorative
wave phase and `CYCLE_SECONDS` in agreement if changing the cycle.

## Operation and accessibility

- Tide changes only the common water datum; daylight changes sky, sea, fog,
  sun, window emission, and lantern intensity.
- The 24-second phase instrument freezes playback before moving to a precise
  time. Waves and birds loop over that period. The paired beacon makes two
  revolutions per cycle (12 seconds per revolution).
- Play/Pause is explicit. Space over the focused sea is an alternative.
- Drag and pinch use OrbitControls. Focus the sea and use arrow keys to
  orbit and `+`/`−` to zoom. The two visible zoom buttons and three camera
  viewpoints are additional alternatives. Damping and auto-rotation are off;
  presets move immediately, including while paused.
- Reduced motion starts paused and reacts to live media-query changes.
  An explicit Play action can opt into motion. Turning the preference on
  again pauses the station; turning it off resumes playback.
- Reset restores coast, tide, light, and phase without changing playback.
- Sliders, orbiting, resizing, and preference changes invalidate a held frame.
  A paused scene has no continuing camera or simulation movement.
- All essential labels are at least 12 px, body notes are 15 px, and controls
  have at least 44 px interaction height. The scene begins after a compact
  105–112 px masthead; the instruments stack below it on narrow screens.

## Resources and rendering budget

The terrain uses a fixed PRNG seed, low-poly primitives, and instancing for
shore rocks, grass, posts, breakwater stones, pier planks, clouds, and islands.
The sea dominates a modest triangle budget. There is one 768 px shadow map
(512 px for a narrow scene);
the beacon uses unshadowed lighting and low-opacity procedural light volumes.
DPR is capped at 1.5, or 1.15 at viewport widths up to 600 px, including live
resizes. No canvas textures or detached scratch geometries are needed.

Every geometry, material, instanced mesh, and light shadow is registered with
`stage.own` at construction. Orbit subscriptions and resize observers are
disposed by the spatial lifecycle; all site/canvas/media listeners use
`page.signal` or `stage.signal`. The returned engine destroy callback is
registered with `page.onCleanup`. The core lifecycle stops the frame loop,
disposes renderer resources, explicitly loses the context, and removes the
canvas. Construction failures clean up and are rethrown to the collection's
error boundary; they are never silently swallowed.

## Focused verification

`tests/series/tidal-observatory.spec.ts` has three Playwright tests covering:

1. Actual mesh/vessel waterline agreement at both tide endpoints; agreement
   with the exported pure surface sampler; deterministic phase/beacon looping.
2. Held clock, daylight changes, keyboard orbit, camera presets, explicit
   playback, and live reduced-motion changes.
3. 375 px layout, reduced-motion entry, touch-target height, and real WebGL
   buffer/program deletion plus canvas removal on collection navigation.
   Disposal counts persist across the site's full-document navigation, rather
   than attempting to inspect a handle from the previous JavaScript context.

Stable selectors: `[data-tidal-scene]`, `[data-tidal-host]`,
`[data-tidal-canvas]`, `[data-tidal-view="coast|lantern|harbor"]`,
`[data-tidal-play]`, `[data-tidal-status]`, and the labelled sliders.
`data-ready`, `data-view`, `data-scene-time`, `data-tide`, `data-daylight`,
`data-water-height`, `data-float-height`, `data-beacon-angle`, and `data-camera`
describe actual station/scene state, not synthetic test state.
The page root's `data-motion` describes the real loop playback state.
