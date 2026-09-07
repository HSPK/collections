# Pixel Loom

A self-contained, original 16×16 pixel-art workshop at `/projects/pixel-loom/`.
Nothing is uploaded or persisted. Download a PNG before leaving.

## Making

- Paint, erase, four-neighbor flood fill, and eyedropper; ten colors in each of
  three authored palettes, plus a custom color picker.
- Mouse, pen, and touch strokes use pointer capture and interpolated grid cells.
  A completed stroke is one history entry. Cancel, lost capture, window blur,
  or hiding the document restores the pre-stroke image.
- Left/right, top/bottom, or four-way live symmetry; reversible flips, clockwise
  rotation, starter replacement, and confirmed clear. Undo retains 60 changes.
- Actual-size, enlarged, and tiled live previews. PNGs are 16, 64, 128, 256, or
  512 pixels square, with transparent, cream, white, or forest backgrounds.
  Grid, cursor, mirror guides, and checkerboard are never exported.

## Keyboard

Focus the canvas, then use arrows to move and Space or Enter to apply the tool.
Hold Space with arrows for a continuous paint/erase stroke. Home and End jump
to opposite corners; Escape cancels an unfinished stroke. B/E/F/I select
Paint/Erase/Fill/Pick. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
Shortcuts do not intercept color inputs or select menus.

## Extending

- `engine.ts` owns validated 256-pixel grids, line interpolation, mirrored flood
  regions, transforms, bounded transactional history, and exact RGBA export.
  Its operations have no DOM dependencies. Add engine coverage before adding
  a tool. A no-op does not consume history or discard redo.
- `data.ts` owns palettes, export options, and three original starter patterns.
  Add a unique starter ID, 16 rows of 16 characters, and a six-digit hex legend;
  `.` means transparent. `gridFromPattern` validates patterns on import.
- `index.ts` owns the entire page, status feedback, canvas rendering, and event
  wiring. Rendering never mutates the grid. Events use the page abort signal;
  an in-flight PNG is discarded after unmount. There are no owned timers,
  animation loops, storage, observers, remote assets, or audio.
- `style.css` is scoped to `.project-pixel-loom`, with a cream/forest textile
  direction, a quick-color strip below the canvas on narrow screens, visible
  focus, and reduced-motion support.

## One-screen studio

The drawing board, four tools, quick thread strip, Undo/Redo, clear and feedback
share the actual remaining viewport height. The page never needs document
scrolling between drawing and controls. Short landscape screens put controls
beside the board. The textile mat, forest/cream styling and floating collection
menu are retained.

**Threads** opens the full palette, custom color, symmetry, grid toggle and pixel
statistics. **Finish** contains actual/enlarged/repeated previews, reversible
transforms and PNG settings. **Patterns** and **Help** hold the complete starter
gallery and original instructions/session warning. These native dialogs keep
the current canvas and history intact, support Escape, and internally scroll
longer content. Clear confirmation and export errors are also native dialogs.

On small screens, **Zoom 2×** opens a detailed 640-pixel drawing surface inside
the same bounded mat. Four pan buttons reach every cell without confusing touch
painting with scrolling; **Fit canvas** restores the complete artwork. Pointer
mapping reads the current canvas bounds for every sample, including after pan,
zoom and viewport resize. A resize cancels an unfinished stroke, preserving
its original pixels and redo history.
Entering zoom reveals the existing pixel cursor. Keyboard moves, corner jumps,
and continuous strokes scroll only the bounded mat just enough to keep the
active pixel visible; focus and document position do not move.

`data-project-preview` marks the complete workbench, not the branding.

Run only this project's tests:
`npm test -- tests/projects/pixel-loom.spec.ts --reporter=line`.
