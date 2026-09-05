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

The compact masthead leads directly to the drawing tools and board. The mobile
quick-color strip sits immediately below the canvas. `data-project-preview`
marks the complete workbench, not the branding.

Run only this project's tests:
`npm test -- tests/projects/pixel-loom.spec.ts --reporter=line`.
