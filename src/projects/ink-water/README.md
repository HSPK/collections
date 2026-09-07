# Ink in Water

An independent, pale-water pigment workbench. The initial indigo and madder
composition is made by a deterministic sequence of pours through the same engine
used by the pointer. It is present even when reduced motion starts the page paused.

## Extend the study

- `engine.ts`: DOM-free fluid field, dye advection, and tracer pool.
- `data.ts`: three pigment identities and the relative viscosity control mapping.
- `render.ts`: optical-density-like dye compositing and batched tracer strokes.
- `index.ts` / `style.css`: the water vessel, mixing desk, input, and lifecycle.

The engine uses a 100 by 112 interior grid with ghost boundaries. Each step applies
a small downward pigment force and vorticity confinement, four viscosity diffusion
iterations, pressure projection, semi-Lagrangian velocity advection, a second
projection, then scalar dye and tracer advection. A locally clamped forward/backward
correction retains fine pigment edges without introducing negative dye or new
concentration maxima. Projection is approximate, not
an exact divergence-free solve; the artwork is an illustrative fluid-like model,
not a physically calibrated experiment. Dye advection is intentionally dissipative
and is not advertised as mass-conserving.

There are at most 7,200 tracers in a recycling typed-array pool. Grid dimensions
are limited to 128 per side, tracer capacity to 10,000, pressure iterations to 100,
and each time step to 0.04 seconds. Velocity is capped, dye injection saturates, and
bilinear sampling stays inside reflected boundaries. Rendering and simulation run
at no more than 35 updates per second; Canvas DPR is capped by `canvas2D`.
Soft plumes come from the density field, not a screen-sized blur. Tracer paths are
batched into three strokes.

## Interaction

Drag a pipette through the water: motion injects momentum as well as pigment.
Holding it still feeds a small stream. The three pigments coexist in one velocity
field. Viscosity changes diffusion; clear removes dye, tracers, and momentum.
Restore recreates the authored composition without changing the chosen viscosity.

Focus the water and use arrows (Shift for larger steps) to place the pipette.
Enter or Space releases a ribbon. P controls playback. The button version of
every important action is available to touch and keyboard users. A print is an
actual local PNG of the canvas without the pipette cursor.

## One-screen studio

The `data-workspace="true"` root fills `100dvh` without hiding document overflow.
A flexible vessel stays beside the mixing desk on desktop and above its compact
two-row pigment/viscosity controls on phones. Playback, Pour a ribbon, Clear the
water, tracer count, pigment selection, and Viscosity remain with the actual
painting. A local right inset on the mobile viscosity strip protects the slider
from the collection menu without reserving a full-width blank footer.
Controls and explanatory text use at least 14px type.

**Studio notes ↗** opens the native `#iw-guide` dialog, labeled **Studio notes
and prints**. Restore this study, Keep a print, live descriptive feedback, complete
keyboard instructions, viscosity explanation, and the field guide remain there.
Long notes scroll inside the dialog, not between the canvas and mixing controls.
Escape or **Close Studio notes and prints** restores focus to the trigger.
Opening/closing the dialog leaves the canvas mounted at the same dimensions.
The existing `canvasresize` redraw and normalized pointer coordinates continue to
track viewport changes without modifying fluid state or resetting playback.

Pause stops every autonomous field/tracer update. Input can still edit the
paused composition. Reduced motion starts paused and follows preference changes.
`createProjectPage`, `canvas2D`, and `createLoop` own abortable listeners, resize
observation, RAF, and canvas teardown. The density canvas is explicitly released;
PNG callbacks ignore a disposed page. No remote resources or storage are used.

Focused coverage: `tests/series/ink-water.spec.ts` checks pressure reduction,
advected pigment, numerical bounds, real pause/clear/pour/print, and narrow-screen
keyboard/reduced-motion behavior. Five additional workflows check 1440×900,
1280×720, 375×812, 320×640, and 768×480 layouts for no document scrolling,
visible controls, actual pigment injection and canvas changes, pointer input,
native-dialog notes/focus, restoration, and successful local PNG downloads.
Screenshots use Playwright's per-test `test.info().outputPath()`.
