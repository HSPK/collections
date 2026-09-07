# Shadow Play

A local point-light table with three original raised-paper constructions.
Pale shapes are the objects; charcoal polygons are ray projections onto z = 0.
No image assets, CSS shadow simulation, hosted AI, or saved visitor data.

## Files and geometry

- `engine.ts` owns bounded lamp coordinates, projection, inverse construction,
  alignment, and the responsive table transform.
- `data.ts` defines the ferry, wren, and negative-space window. Outlines are
  authored in their desired shadow positions, then inverse-projected to obtain
  the raised paper. Add an arrangement here with a lamp and individual heights.
- `renderer.ts` draws the light table, paper, projected outlines, guide, and rays.
- `index.ts` owns the page and input state; `style.css` is project-scoped.

The projection factor is `lamp.z / (lamp.z - paper.height)`. All paper remains
below the minimum lamp height. Matching uses RMS displacement of the projected
outline vertices, with a seven-millimetre tolerance. The percentage is a clamped
display of that geometric error, not a probability or AI confidence. The window
uses four solid strips: its bright centre is actual negative space.

## Interaction and lifecycle

Drag anywhere on the table, use the three labelled sliders, or focus the table
and use arrow keys (Shift gives two-millimetre fine steps). Dotted tracing and
the lamp station are optional clues. The station requires a 360 mm lamp height;
being over the station alone does not satisfy the geometric goal.

Animation is off initially, including under reduced motion. Explicitly starting
light drift opts into animation. Any manual lamp input stops it. A later switch
to reduced motion also stops drift and never automatically restarts it. Paused input
still renders through the core loop. Canvas sizing, frame callbacks, pointer
capture, and listeners are disposed with the page. Discoveries last only for the
current mount. Reset lamp preserves the visit's discoveries.

Focused coverage lives in `tests/series/shadow-play.spec.ts`.

## Viewport workspace

The project root is a `data-workspace="true"` viewport-height flex layout. The
light table receives the remaining space rather than retaining a fixed minimum
canvas height. Its original uniform table fit is also the pointer inverse, so
resizing does not change the lamp's millimetre coordinates or alignment rules.

The **Lamp** dock contains all three sliders, the lamp guide, and reset.
**Studies** contains the three arrangements, discovery feedback, tracing, and
rays. Only the dock scrolls; changing tabs never hides or resizes the canvas.
Discovery messages are also announced outside the inactive panes. **Table notes**
opens a native, internally scrolling dialog with the geometry explanation.
The footer leaves room for the collection menu. Shared workspace helpers own
keyboard tab navigation, inactive-panel focus, and dialog cleanup.

The focused suite retains the geometry and touch tests and checks 1440×900,
1280×720, 375×812, 320×640, and 768×480: fixed document dimensions, usable primary
controls, stable canvas bounds across tabs, resized pointer mapping, and dialog
Escape/focus restoration. It writes viewport screenshots to its test output.
