# Neon Rain / Vesper Ward

A fictional, locally built night-walk directory. The street—not a shared studio
inspector—is the main work. MOTH, AFTER HOURS, LOOP, KITE RADIO, SOFT PARTS and
NIGHT JAR are invented addresses. The clock is a set dressing, not live weather.

## Files

- `data.ts`: original addresses, camera presets, seed and pure rain helpers.
- `scene.ts`: batched buildings, shop interiors, marquees, awnings, windows,
  pavement, lamps, overhead cables, rooftop tanks and locally drawn signs.
- `engine.ts`: the owned Three.js lifecycle, instanced rain, instant orbit
  controls, view selection and post-render state.
- `index.ts` / `style.css`: the scoped street-directory website and its controls.

## Interaction and deterministic rain

Pause/Play really suspends simulation time. Reduced motion starts with a complete
rain volume, reacts to preference changes, and remains explicitly overridable
with Play. Drag, pinch, arrows and `+`/`-` use the undamped orbit control.
With the scene focused, `1`–`3` select Street/Arcade/Rooftop and Space pauses.
The accessible buttons provide the same camera presets on touch.

Rain intensity sets `InstancedMesh.count`, including zero. Desktop has a maximum
of 1,500 drops; narrow screens use 640. The seeded first drop is the same in
either budget. `rainHeightAt(drop, phase)` uses integer fall cycles, so phases
separated by 12 seconds agree. The phase slider pauses before scrubbing.
Light power changes the real point lights, sign materials, window illumination
and reflection intensity; it does not merely tint a CSS overlay.

## Viewport workspace

The `data-workspace="true"` root occupies exactly `100dvh`. The street takes the
remaining grid space, with camera views, playback and all three sliders kept
on-screen. Compact screens use a two-column console, not a scaled page.
**Directory** opens the native **Directory & field notes** dialog for the six
addresses, rain-count readout, control explanations and field notes. Escape or
Close returns focus to the trigger. The status area reserves the floating
collection menu's corner. All text and primary controls are at least 14 px.

The scene never changes tab or gets reparented; the existing size observer
updates camera projection and the real drawing buffer, including while paused.
Tests exercise five viewport sizes and save screenshots in their run artifacts.

## Rendering and ownership

Static primitives share geometries and are instanced by material. Signs,
asphalt, soft halos and broken inverted sign reflections are CanvasTextures.
Reflections are art-directed ground projections, not physically accurate mirrors.
There are no remote assets, shadow maps, audio, postprocessing or network calls.
Pixel ratio is capped at 1.35 desktop / 1 narrow screen.

`createProjectPage` scopes UI events and media listeners. `spatialExperiment`
owns RAF, visibility handling, resize observation, renderer/context and failure
cleanup. All local materials, textures, geometries and instance buffers are
registered with `stage.own`; orbit events and controls use stage cleanup.
No damping or CSS animation continues while the night is held.

## Verification surface

`.project-neon-rain[data-ready="true"]` is populated after an actual scene render.
Its `data-rain-count`, `data-rain-budget`, `data-rain-sample-y`,
`data-rain-phase`, `data-light-power`, `data-lamp-intensity`, `data-camera`,
`data-view`, `data-frame`, `data-motion` and `data-pixel-ratio` reflect real
rendered matrices, lights, camera and renderer state. A zero-count rain volume
reports the sample as `none`.

`[data-neon-scene][data-project-preview]` contains the actual canvas.
Controls have labels Rain intensity, Light power, Rain phase, Play rain /
Pause rain, Street view, Arcade view and Rooftop view.
The focused Playwright tests live in `tests/series/neon-rain.spec.ts`.
