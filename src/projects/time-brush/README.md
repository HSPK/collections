# Time Brush

An original ultramarine chronograph with three motion families: an orbital array,
a four-train circular line, and two harmonic tides. Paint exceptions into space
instead of changing a global animation speed.

## Files

- `index.ts` owns the page, accessible controls, pointer/keyboard input, and lifecycle.
- `data.ts` owns the four brushes, 41 object definitions, limits, and three starter experiments.
- `engine.ts` is DOM-free: scalar-field sampling, analytic paths, and independent signed clocks.
- `renderer.ts` draws the composition and a cached visualization of the **composited** field.
- `style.css` is scoped to `.project-time-brush`.
- `manifest.json` registers the independent page.

## A bounded field, not a speed slider

Empty space has rate `1`. Each circular patch stores normalized centre coordinates,
a radius measured against the shorter side of the viewport, a brush mode, and a
stroke group. Slow is `0.25`, Freeze is `0`, Fast is `3`, and Reverse is `-1`.

The inner 78% of a patch has full coverage. Its outer 22% uses a smoothstep falloff.
Sample patches from oldest to newest, replacing the previous scalar with
`lerp(previous, brushRate, coverage)`. A new patch therefore wins at its solid
centre; rims blend instead of accumulating unbounded acceleration. The resulting
field is clamped to `[-1, 3]`. Keep at most 64 patches, evicting the oldest first.
Undo removes one retained stroke group, including an interpolated pointer stroke.
Evicted patches are not recoverable by Undo.

Every object has its **own signed clock**. At each simulation substep:

1. Derive the object's current position analytically from its clock.
2. Sample the scalar field at that position.
3. Add `realDelta × sampledRate` to that object's clock only.

Clock stepping is limited to 50ms per frame and substeps no longer than 1/120s.
No velocity, acceleration, pendulum solver, or global phase is integrated.
Orbit and wave phases use positive modulo; the train track is an analytic,
tangent-continuous stadium path, also safe for negative phase. A train is one
composed object: the engine samples the field and its four carriages derive
positions from the same clock at fixed path offsets. Every wave bead has a
separate clock, so a locally accelerated section visibly loses synchrony.

A frozen clock keeps exactly its previous phase. A reverse clock may pass below
zero and retrace its analytic path. Smooth transitions between positive and
negative rates necessarily contain a zero-rate contour: an approaching object
can settle there. This is a property of the field, not a collision or numerical
explosion. Paint directly on an object, or use the targeted experiment buttons,
to give it a new local rate.

## Readouts and rendering

“At your brush” samples the actual field at the reticle. “One clock, up close”
shows a selected object's actual signed clock and the field at its current
position. These rates describe the painted field **even when global playback is
paused**. Values are updated immediately on input, and approximately eight times
per second during playback. They are not decorative counters.

The cached low-resolution field image is calculated from the same scalar sampler
as the clocks. Pattern marks distinguish still (`Ⅱ`), backward (`‹`), slow dots,
and fast (`›`) areas without relying on hue alone. Unpainted space has no texture
overlay. Patch boundaries identify the most recent stamp of the last six stroke
groups; older paint still contributes to the composited field. On portrait
layouts, patterns and the brush legend replace in-field patch captions so they
do not collide with the smaller scene. Motion trails are short analytic phase
samples, not stored recordings.

The drawing surface uses `core/canvas.ts`, with DPR capped there. The fixed-camera
layout rearranges the orbital array and wave rows for portrait screens. On
resize, clocks retain their values and patches retain normalized centres; paths
reflow to the new layout rather than turning patches into object attachments.

## Interaction, accessibility, and cleanup

- Mouse, pen, and single-finger touch paint. Captured strokes interpolate stamps
  at 38% of the radius, and are one Undo group.
- The field is keyboard-focusable: arrows move a visible reticle, Shift+arrows
  move farther, Space/Enter stamps, Home centres, 1–4 changes modes, and brackets
  change brush diameter. Tab remains native; Escape ends a stroke/hides the aim.
- Four ordinary direction buttons, a labeled Stamp button, the object selector,
  and “Aim at this object” provide an alternative to custom canvas keyboard input.
- The three experiment buttons place a real patch at a real object's current
  position. They do not replace the whole scene or fake a recorded animation.
- Paint, undo, clear, reset, mode changes, sizing, and aiming work while paused.
  Clear preserves clocks; Reset zeroes clocks and restores starter patches,
  without changing the playback state.
- Reduced-motion visitors start paused. A change to reduced motion also pauses.
  There is no camera animation, audio, external asset, network request, or storage.
- Canvas-only motion is complemented by labeled clock readouts and polite
  action feedback. Continuously changing outputs have `aria-live="off"`.
- Listeners use the page abort signal. Pointer cancellation, lost capture,
  window blur, hidden documents, and resize end a stroke without leaving a
  latched paint operation. Page cleanup stops the core loop, disconnects the
  core size observer, releases capture, and frees both canvas buffers.

## Extension and checks

Add object definitions and editable starter experiments in `data.ts`. Add an
analytic family to `motionAt` and its drawing to the renderer; give **each new
independently moving object a clock**, never reuse a global elapsed time. Keep
the existing normalized field metric when adding a responsive layout.

Focused checks live in `tests/series/time-brush.spec.ts`:

```sh
npx --no-install playwright test tests/series/time-brush.spec.ts
```

They cover exact freeze and negative clocks, field bounds/layering, retained
stroke limits, paused painting, keyboard input, pointer cancellation, lifecycle,
and the narrow touch layout. No full-repository build is needed for this site.
