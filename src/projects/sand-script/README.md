# Sand Script

A small cellular sand editor with five pigment strata, editable walls, and three
authored starting structures. The initial landscape already contains real grains;
it does not depend on an animated introduction or the first pointer gesture.

## Extend the cabinet

- `data.ts`: pigment colors and structure names.
- `engine.ts`: DOM-free grid, rasterized circular brush, cellular stepping,
  snapshots, conservation, and authored vessel/hourglass/terrace geometry.
- `render.ts`: textured grain bitmap, fitted tray coordinates, and local framing.
- `index.ts` / `style.css`: materials shelf, tools, history, input, and lifecycle.

The default world has 192 by 152 cells. Cell 0 is empty, 1 is a wall, and 2-6 are
pigments. A grain first tries the cell below, then a diagonal. Bottom-up traversal
moves each grain at most once per tick; alternating scan/diagonal preference
avoids a persistent one-sided pile. Movement only swaps a grain with an empty
cell, preserving both total count and pigment counts exactly. The sealed outside
border cannot be painted or erased. This is an illustrative cellular material,
not a calibrated physical granular simulation.

Dimensions are capped at 256 per side, brush radius at 10 cells, and playback at
six simulation steps per animation callback. There are no particle-particle
distance calculations, growing particle arrays, or per-grain drawing calls.
The renderer writes one small bitmap with deterministic grain texture, then scales
it without smoothing. The displayed grain count is counted from the actual grid.

## Editing

Sand only fills empty cells. Walls replace grains underneath the brush; erase
removes either material, except the sealed outside boundary. Pointer strokes are
interpolated in grid space so a fast drag does not leave gaps. Holding sand in one
place pours while gravity runs. Clear grains keeps walls; Empty tray removes all
interior material; Reload stencil restores its original contents.

Focus the tray: arrows move, Shift + arrows move five cells, Space draws and can
be held while moving, Enter makes one stamp, B/W/E switch tools, P pauses, and
Ctrl/Meta + Z undoes. The materials shelf and controls also work by keyboard and
touch. All essential control and canvas labels are at least 14px.

## One-screen workspace

The `data-workspace="true"` page fits the dynamic viewport without hiding root
overflow. The tray, pour/wall/erase tools, playback, undo, grain count, brush
width, pigment selector, and falling pace remain together. The compact landscape layout puts
transport and parameters beside the tray; portrait layouts use a lower dock.
The collection-menu corner is reserved, not placed over a slider.

**Materials** (`[data-materials]`, accessible name **Materials and notes**)
opens the native `#ss-materials-dialog`: all five pigments, structure selection,
clear/empty/reload, local PNG export, keyboard help, and material notes.
Only this secondary content scrolls. Close or Escape returns focus to Materials.
Dialogs leave the canvas mounted and sized; viewport resize redraws the same
grid using the same fitted bounds as pointer input, without advancing gravity.
The toolbar pigment select and original pigment-shelf buttons stay synchronized.

Up to 16 pre-edit snapshots are retained. One pointer or held-key stroke is one
undo, including grains added during a held pour. Simulation steps do not pollute
history. Clear, empty, reload, and structure changes also have snapshots. Undo
restores the exact pre-edit grid and tick and pauses so the restored state can be
inspected. The PNG button saves the actual canvas without its editing cursor.

Reduced motion starts with a pre-settled paused scene; explicit Play is available.
Pause stops both falling and held automatic pouring, while direct edits remain
possible. Resize redraws but never advances the material. All listeners are scoped
to `createProjectPage`; canvas observation, RAF, and the offscreen grain sheet are
disposed on exit. No remote assets, storage, or audio are used.

Focused coverage: `tests/series/sand-script.spec.ts` exercises pigment conservation,
sealed boundaries, brush/wall behavior, exact snapshot restore, undo/clear/export,
and 375px keyboard/reduced-motion controls. Workspace workflows additionally
cover 1440×900, 1280×720, 375×812, 320×640, and 768×480: exact document bounds,
uncovered controls, real brush/pigment effects, structures and PNG export,
dialog scrolling/focus return, and preserved grains through live resizing.
Screenshots are written with Playwright's per-test `outputPath()`.
