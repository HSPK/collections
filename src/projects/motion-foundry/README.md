# Motion Foundry

A six-lesson, local SVG animation-principles workbench. The plain and expressive
panels share a clock, not an accumulated physics simulation. Shapes and lesson
copy are original. There are no remote assets, audio, storage, or dependencies.

## Modules

- `data.ts`: lesson identities, teaching copy, comparison captions, amplitude
  descriptions, and informative paused positions.
- `model.ts`: pure `sampleMotion(lesson, seconds, parameters)`, easing functions,
  poses, and phase boundaries. It has no DOM, clock, random, or integration state.
- `scene.ts`: the SVG comparison renderer. Full-clip paths and seven equally
  timed ghost poses are rebuilt only when a lesson or parameter changes.
- `index.ts`: the independent page, native controls, playback, and lifecycle.
- `style.css`: all styles are scoped to `.project-motion-foundry`.
- `manifest.json`: collection discovery, registered after the implementation.

## The model

`t = clamp(seconds / duration, 0, 1)` and `a = clamp(amplitude, 0, 1)`.
Positions use a route whose start is 0 and finish is 1; lift uses SVG guide units.
Inputs must have finite time/amplitude and positive finite duration.

The available eases are linear, cubic in, cubic out, and piecewise cubic in–out.
They have exact endpoints. Except in the timing lesson, the selected travel
curve is shared by both treatments.

| Lesson | Expressive treatment |
| --- | --- |
| Timing | `(1 − a)t + aE(t)` blends linear progress into the selected ease. |
| Anticipation | For `0.22a` of the clip, smoothstep moves backward to `−0.16a`; only then does eased forward travel start. |
| Squash & stretch | A shared hop runs from 18–72%; sine-squared shape pulses load, stretch, and squash it. `scaleX = 1 / scaleY` keeps the 2D ellipse area constant. The bottom of the shape anchors to the ground during contact. |
| Arcs | `lift = 4 × 105a × q(1 − q)`, where `q = E(t)`. This changes the route itself. |
| Overshoot | The first 60% reaches `1 + 0.20a`. The excess then follows `cos(3πv) × (1 − smoothstep(v))`, reaching exactly zero at the clip end. |
| Follow-through | The carrier arrives at 46%; the two tabs start `0.16a` and `0.32a` later. Each has a bounded overshoot and the same finite settling envelope. All parts reach their own exact resting positions by the end. |

At zero amplitude, each expressive pose matches its plain counterpart.
The squash lesson preserves **2D area**, not a claimed 3D volume; the arc is a
drawn parabola, not a gravity solver; the connector is a lag visualization,
not a rope. The teaching copy makes these distinctions explicit.

## Playback and accessibility

Playback runs once and stops on the exact last frame. Replay is an explicit
request to play from the beginning. Scrubbing pauses and samples directly, so
visiting frames backward gives the same results. Duration changes preserve
normalized position; speed only changes the viewing clock.

Reduced motion starts paused at the first lesson's study frame. Either direction
of a preference change pauses without resuming automatically. Selecting a lesson
also pauses at a useful frame. Play and Replay remain explicit opt-ins.

All inputs are native and labeled. Space toggles playback only outside native
controls and editable content, within the page. The SVGs have current textual
descriptions; only interaction feedback, not every frame, is live-announced.
Desktop shows both treatments side by side. On narrow screens, native
**Plain / Expressive** tabs share one explicitly sized visual layer instead of
stacking results above their controls. Both SVGs retain identical dimensions
and continue receiving the same calculated frame. Arrow/Home/End tab navigation
is supported; inactive mobile content is inert. Desktop restores both panels’
visibility and accessibility when the breakpoint changes.

`createProjectPage` owns the root and abortable listeners. Its cleanup destroys
the shared `createLoop` instance; destroying or aborting the page is idempotent.
No animation runs in CSS. A paused loop has no continuing frame requests.

## One-screen workspace

The root declares `data-workspace="true"` and lays out identity, a flexible
comparison, primary parameters, and an action dock within `100dvh`.
Duration, amplitude, easing, playback, scrubber, viewing speed, and Guides remain
next to the result at all supported sizes. No scene or primary-control scrolling
is required, and no page scaling is used. The compact easing field and action
dock reserve the collection-menu corner locally. Motion-preference changes use
the existing accessible status instead of a toast over the controls.

**Lessons** opens all six studies in a native dialog. **Principle & notes**
contains teaching copy, challenges, parameter hints, the existing “Under the
hood” disclosure, feedback, and keyboard instructions. Only secondary content
scrolls. Escape/Close restores opener focus without losing settings or position.
**Reset settings** stays in the dock. Dialogs retain the lavender paper palette.

## Adding a lesson

1. Add an ID and complete teaching copy to `data.ts`. Choose a study frame where
   the distinction is visible, including when guides are on and playback is off.
2. Add its deterministic branch to `sampleMotion`. Keep start/end poses exact,
   return to the plain comparison at zero amplitude, and make every exposed
   parameter meaningful. Keep shapes within the documented SVG guide space.
3. If needed, extend the renderer's metric or primitive geometry; do not use
   frame-to-frame interpolation or update a simulation during render.
4. Extend the focused tests, particularly reverse scrubbing, endpoints, zero
   amplitude, and the new principle's actual distinction. Update the six-lesson
   count in the interface and discovery copy if the collection expands.

Run the existing focused suite against the running Vite server:

```sh
SITE_URL=http://127.0.0.1:4173/ flock /home/hangxingwei/.copilot/session-state/23f8825b-223c-4cb6-95ec-3e7881d9e65f/files/viewport-browser.lock npm test -- tests/series/motion-foundry.spec.ts --reporter=dot
```

The suite retains all six models, reverse scrubbing, playback, preferences, and
cleanup checks. Workspace tests cover 1440×900, 1280×720, 375×812, 320×640, and
768×480, testing document bounds, real parameter-to-pose changes, comparison
tabs, lesson/notes workflows, and per-test screenshots.
