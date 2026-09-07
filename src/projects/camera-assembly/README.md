# Camera Assembly

An independent, real-time 3D object exhibit. **Vesper / 03** is an original,
imaginary instant camera: saffron enamel, a cream face, a teal dial, and a
stepped metal lens. The mechanism and assembly order are design fiction,
not engineering documentation or repair instructions.

## Interaction

- Play, pause, replay, or scrub a 22-second, five-chapter assembly.
- Four playback speeds and clickable chapter markers remain usable while paused.
- Three-quarter, front, rear, and top viewpoints share `orbitView`. Drag to
  orbit, scroll/pinch to zoom, or focus the canvas and use arrows and `+`/`−`.
- Selecting any of nine component groups pauses at a separated pose and
  highlights the selection. Its material and design notes appear alongside.
  Clear the highlight to restore every finish.
- Space toggles playback when the exhibit or canvas is focused, never inside
  a native control. Reduced motion starts at a separated still frame; changes
  to the preference pause playback. Explicit Play or Replay is still available.
- At the end, a paper print emerges. Its “Last light” image is an original
  Canvas 2D drawing generated entirely in the browser. No camera access,
  sound, network assets, imported models, or persistence are used.

## One-screen workspace

The root declares `data-workspace="true"`. A `100dvh` grid keeps the flexible
WebGL exhibit, all four viewpoints, transport, speed, and assembly scrubber on
the same screen, including short landscape viewports. The compact scrubber and
action dock leave local right clearance for the collection menu, including the
slider's end hit target; no full-width blank footer is required.

**Inspect parts** opens the native “Camera parts inspector” dialog with all nine
groups, material descriptions, clear-highlight action, and feedback.
**Stages & notes** opens the five chapter shortcuts, current chapter note,
design-fiction explanation, and keyboard help. Secondary dialogs alone scroll;
Close/Escape restores opener focus. Inspecting or changing chapters still
updates the same live model while the dialog is open. Closing does not recreate
the camera or discard orbit/selection/timeline state. Dialogs use the cream paper
palette.

## Modules and extension points

- `data.ts`: part identities, descriptions, exploded/assembled poses, ordered
  timing windows, chapters, view presets, and total duration.
- `timeline.ts`: pure quintic interpolation, chapter selection, shutter
  rotation, and print emergence. Every transform is evaluated from absolute
  progress; reverse scrubbing does not integrate or accumulate transforms.
  Invalid non-finite inputs fail explicitly. Progress outside `[0, 1]` clamps.
- `components.ts`: rounded extrusions with real openings, a lathed barrel,
  curved shutter leaves, instanced ribs/index marks, and the nine model groups.
- `surfaces.ts`: per-group material ownership, reversible inspection shading,
  local lettering textures, and the print generator.
- `scene.ts`: the shared `spatialExperiment` lifecycle, `orbitView`, model pose
  application, and this exhibit’s lighting and floor.
- `index.ts` and `style.css`: project-local DOM, accessible native controls,
  responsive exhibit/inspector layout, and the scoped visual identity.

To add a component, add its record to `PARTS`, construct its group in
`components.ts`, and give it an ordered interval. Keep all mesh-local animation
an absolute function of the frame, and extend the endpoint tests. Add
viewpoints to `VIEWS`; the DOM and preset actions follow the data.

## Rendering and ownership

The shared spatial stage owns rendering, resize observation, pause/invalidation,
context-loss recovery, and teardown. Pausing the timeline does not disable the
orbit controls. Scrubbing, inspection, and preset changes explicitly invalidate
the paused scene. Only playback advances progress; lighting and geometry never
use wall-clock randomness.

The viewport is never hidden or reparented when a dialog opens. Its existing
size observer updates renderer dimensions and camera aspect/FOV after layout
changes, and invalidates paused frames. Orbit pointer coordinates continue to
come from the canvas bounds; responsive sizing does not scale the page.

Pixel ratio is capped at **1.5**. One directional light casts a **512²** shadow.
Repeated grip ribs, flash bars, dial knurling, and index marks are instanced;
curves have moderate segment counts. The only transmissive surface is the
main lens. The soft studio environment is generated once from Three’s
`RoomEnvironment`—no downloaded HDR image.

Geometries, materials, textures, instanced meshes, lights, and the generated
environment render target are registered with `stage.own`. Transient PMREM
objects are disposed in `finally`. Offscreen drawing canvases are released
with `stage.onDestroy`; orbit listeners use the stage lifecycle. The page uses
its own signal and registers `artwork.destroy` with `page.onCleanup`.

## Focused checks

```sh
SITE_URL=http://127.0.0.1:4173/ flock /home/hangxingwei/.copilot/session-state/23f8825b-223c-4cb6-95ec-3e7881d9e65f/files/viewport-browser.lock npm test -- tests/series/camera-assembly.spec.ts --reporter=dot
```

The tests cover every part’s endpoints and staged order, exact reverse
scrubbing, print timing, browser playback/scrubbing/inspection/view controls,
orbiting while paused, motion preferences, the 375px layout, and an isolated
mount/abort with observed WebGL buffer, texture, program, and context disposal.
The isolated lifecycle test imports the entrypoint through the Vite dev server.
Browser checks filter Vite update/reload messages so concurrent sibling edits
cannot remount the page in the middle of a control or resource assertion.
Workspace checks additionally cover 1440×900, 1280×720, 375×812, 320×640, and
768×480: no document scroll, slider-to-print changes, pointer orbit, modal
inspection/chapter workflows, rendering aspect, focus return, and screenshots.
