# Paper Planet

A fictional cut-paper field atlas: warm ivory, editorial serif type, and a
generous inhabited globe. This is an invented world, not geographical data.
All geometry and colors are local. There are no downloaded assets, textures,
fonts, environment maps, or network services.

## Explore

- Drag with a mouse or one finger; pinch with two fingers to zoom. A focused
  canvas supports arrow-key orbit and `+` / `−` zoom. Separate zoom buttons
  provide a touch/keyboard alternative.
- Six journal buttons turn the camera directly toward the corresponding
  **actual scene anchor**. The mustard ring identifies its physical location.
  Selection never animates or spins the globe underneath the camera.
- The light strip changes the key/fill lights, paper background, and lit
  windows, even while paused. Daylight and dusk also have one-tap presets.
- Play/pause controls only the windmill sails and cloud bobbing. The breeze
  slider directly scrubs their common 24-second loop. Scene time stops while
  paused. The planet and camera never auto-rotate.
- “Whole world” restores the populated front view, daylight, the initial
  breeze phase, and pause. Every visit starts paused. Enabling reduced motion
  during playback pauses it; disabling the preference does not auto-play.

## Viewport workspace

The `data-workspace="true"` atlas fills `100dvh` without document scrolling.
The globe remains visible beside a desktop dock or above its compact mobile
counterpart. **Atmosphere** contains daylight/dusk, breeze scrubbing and playback;
**Field journal** contains all six landmarks and their live narrated entries.
The journal scrolls inside its own panel, with the globe's dimensions unchanged
when switching tabs. Whole world and zoom stay beside the live scene.
**Maker’s note** opens a native dialog; Escape/Close restores trigger focus.

Tabs wrap the existing section/aside instead of replacing their semantics.
They use the shared abort-scoped helper. Existing camera/resize/render ownership
is unchanged, and the collection menu retains its bottom-right space. Primary
text is at least 14 px. The series tests cover five viewport sizes and retain
workspace screenshots in the Playwright run artifacts.

## Files and extension points

- `data.ts`: six original journal entries, local palette, cycle constants,
  and the pure `radialDirection` helper. Coordinates are fictional layout
  coordinates with longitude zero on +Z.
- `scene.ts`: hand-placed biomes, layered coast edges, orchard, wheat fields,
  village, lighthouse, observatory, windmill, peaks, sea details, and clouds.
  `radialFrame` maps local +Y to the surface normal, including at both poles.
  Add a landmark's physical scene geometry and its data entry together.
- `engine.ts`: `spatialExperiment` lifecycle, `orbitView`, camera alignment,
  playback clock, light interpolation, and diagnostic scene measurements.
- `index.ts` and `style.css`: project-owned atlas layout and accessible journal.
  All styling is scoped to `.project-paper-planet`.

Repeated trees, houses, waves, cliff layers, paths, and fields are instanced
by shared geometry/material. The seeded generator only varies decorative
cutouts; continent positions and identities are deliberately composed.
The back hemisphere also has forests, villages, peaks, and canyon islands.

No automatic studio is used. All geometries, materials, instanced meshes,
and both directional light shadow objects are registered with `stage.own`.
The shared spatial lifecycle also releases the renderer, context, render
lists, resize observer and RAF. Orbit listeners are retired by `onDestroy`;
page listeners and preference changes use the page abort signal. There are
no project timers. DPR is capped at 1.5, or 1.2 for narrow screens at mount,
and the only shadow map is 1024² (512² for a narrow scene).

## Validation

`tests/series/paper-planet.spec.ts` covers radial frames, real landmark camera
alignment/projection, drag and keyboard navigation, paused light and phase
changes, reduced-motion changes, narrow layout, and actual WebGL context
release when leaving the page.

The canvas exposes measured state, not a second simulation:
`data-camera`, `data-scene-time`, `data-light`, `data-selected-landmark`,
`data-landmark-alignment` (surface-normal/camera dot product), and
`data-landmark-projection` (normalized device coordinates).
The latter two come from the selected scene group's world matrix and the
live camera, so they change when the user orbits away.

The scene is marked with `[data-pp-scene]`; the complete workbench carries
`data-project-preview`. Landmark buttons use `[data-pp-landmark="<id>"]`.
