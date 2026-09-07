# Perspective Paradox

An original, fictional architectural model called Convergence Court. Three
physically disconnected tapered beams form an apparently continuous triangular
loop from one exact perspective camera. The page opens still at that viewpoint,
including when reduced motion is off. Nothing swaps, morphs, or becomes a flat
image when the camera arrives there.

## Construction

`scene.ts` exports `createBeamLayout`, `createBeamGeometry`, `physicalGaps`, and
`projectionError`. The initial centerline follows the positive X, Y, and Z axes.
The first and final ends lie on the same ray from `canonicalEye`. A depth-linear
width taper and mitered end planes make all four vertices of the false joint
coincide in projection, not just their centers. Scaling each entire beam about
that eye separates the other two joints without changing any projected point.

Every beam is a closed, volumetric mesh with actual caps, faces, support piers,
and shadows. The error readout is the largest bidirectional nearest-vertex
distance between neighboring end-cap projections, measured in CSS pixels. It
changes with the real camera, aspect ratio, and viewport size. Physical centerline
gaps remain open in every view. The optional guides are Three.js sightline
segments and endpoint markers, not an illusion drawn over the canvas.

## Files and controls

- `data.ts`: the canonical eye, viewpoints, field notes, and default sunlight.
- `scene.ts`: beam construction, projection math, foundations, survey marks,
  locally painted lettering, lights, and optional sightlines.
- `engine.ts`: the spatial lifecycle, orbit camera, measured projection error,
  deterministic orbit-angle scrub, and sun/guide state.
- `index.ts` / `style.css`: the independent architectural drawing-board website.

Drag or use the focused canvas's arrow keys to orbit; pinch or use + / - to zoom.
Space and the playback button start or pause a slow inspection orbit. Manual
camera movement pauses playback so that controls never fight the visitor.
Inspection angle selects a point on the canonical orbit; the three viewpoint
buttons also pause and reposition immediately. Sun direction and projection
guides work while paused. Reset restores the canonical eye, sun, and hidden
guides. Enabling reduced motion stops playback; disabling it does not start
motion without the visitor's choice.

## Viewport workspace

The `data-workspace="true"` drawing board occupies exactly `100dvh`, with the
real scene assigned the remaining grid height. **Viewpoints** holds all three
camera presets plus Play inspection and Reset model. **Instruments** holds
inspection angle, sun direction and projection guides. Their fixed-size dock
scrolls internally if needed; short landscape screens place it alongside the
scene. The canvas remains visible and keeps its dimensions across tab changes.

**Field notes** opens the native **Construction field notes** dialog for camera
help, the complete construction notebook and physical-gap measurements.
Close/Escape restores focus. The shared helpers own keyboard tab navigation,
inert inactive panels and abort-scoped events. No scene or projection math is
replaced. Text remains at least 14 px and the status row reserves the floating
collection menu's corner. Five viewport checks save screenshots in test artifacts.

## Budget and lifetime

There is no postprocessing, external asset, audio, or secondary animation loop.
The spatial renderer caps DPR at 1.5 (1 on narrow screens), uses one 1024-square
shadow map (512 on narrow screens), and shares structural geometry/materials.
All geometry, materials, textures, and the light shadow are registered with
`stage.own`; orbit subscriptions use `stage.onDestroy`. `createProjectPage` owns
the engine and abort-scoped page listeners. The shared lifecycle disconnects
resize/visibility listeners, stops RAF, disposes the renderer and resources,
and releases the WebGL context on exit and on construction failure.

Focused Playwright coverage lives in
`tests/series/perspective-paradox.spec.ts`: actual projection and separation
invariants, camera/settings while paused, mobile layout, and context lifetime.
The disposal observation is recorded when the actual canvas is removed, so it
survives the website's full-document return to the collection.
