# Worlds Within

Four original, geometric vector scenes form a genuinely nested canvas atlas:
an afternoon desk contains a postcard city, its rose building contains a room,
the room's book contains the Margin Sea, and an island studio contains the desk.
This is an openly imagined, deterministic loop, not generated scenery.

## Geometry

`engine.ts` owns screen/world transforms, cursor-anchored zoom, panning, portal
transforms, and coordinate rebasing. All scenes use a 1000 by 700 coordinate
system. A portal has the same aspect ratio and is a uniform transform of the
entire child world. `illustrations.ts` recursively draws and clips these worlds;
the camera operates on geometry, not CSS scale or swapped screenshots.

When the viewport lies entirely inside a portal, its camera is re-expressed in
the child coordinate system. When panning or zooming out crosses the current
world boundary, the inverse transform restores the parent. These operations
preserve screen positions. Values remain near scene scale even after many
crossings. Navigation is capped at 24 layers; recursive drawing is bounded to
six visible descendants, with sub-eight-pixel descendants shown as flat colour.

## Extending and controls

- Add scene metadata and its aligned portal to `data.ts`, then a painter to
  `illustrations.ts`. The existing loop cycles through the resulting list.
- Wheel zoom uses the cursor as its fixed point. Two touch pointers combine
  centroid translation and distance-based zoom; one pointer pans.
- Tap the framed picture or use the labelled Enter button to travel into it.
  Canvas keys: +/- zoom, arrows pan, Enter enters, Escape/Backspace goes back,
  Home resets. Back and Desk buttons are also available.
- Smooth travel applies only to button/Enter camera journeys. Reduced motion
  starts it disabled. Direct wheel, pinch, and pan remain immediate. Switching
  motion off finishes an in-flight journey as a jump rather than losing it.
  A later system change to reduced motion also disables smooth travel.

`index.ts` owns DOM and input state. Core canvas sizing, the on-demand loop,
pointer capture, and all listeners are cleaned up with the page. There are no
external assets, network requests, storage, or idle animation timers.

Focused coverage: `tests/series/worlds-within.spec.ts`.

## Viewport workspace

The viewport-height `data-workspace="true"` root allocates real flex/grid space
to the atlas instead of giving the canvas a tall fixed height. The navigation
toolbar and Enter button remain with the live stage at every size. The **Story**
dock carries the current address, narration, scale, and smooth-travel preference;
**Field notes** contains the four-world index and recursion explanation. These
secondary panes scroll internally and never change the stage dimensions.
Live navigation announcements remain available while Field notes is selected.

**Atlas guide** opens a native dialog for pointer, touch, and keyboard help.
Shared workspace helpers supply tab focus/inert state and dialog cleanup. The
footer leaves a clear area for the collection menu. Existing resize handling
still cancels in-flight travel, rebases the actual camera, and requests a frame;
there is no CSS scaling or camera substitute.

The focused suite preserves numerical portal, wheel-focus, and pinch assertions.
Additional checks exercise 1440×900, 1280×720, 375×812, 320×640, and 768×480,
including viewport screenshots, document dimensions, primary-control bounds,
tab-stable canvas size, live recursion from the notes pane, and dialog focus.
