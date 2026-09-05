# Garden of Rules

An independent, auto-height cellular-automata field guide at `/projects/rules/`.
The default is a composed, **paused** Life board, not an autoplaying illustration.
The page includes its own navigation, editable grid, seed library, rule lessons,
cell inspector, and local JSON download.

The compact masthead leads directly to the grid. Step/Play sit above the cells;
the longer opening prose and glider specimen live in Field notes. The working
board column carries `data-project-preview`, not the introductory material.

## Files and extension points

- `data.ts`: rule catalogue, correctly positioned seed patterns, lessons and
  references. Add a `RuleDefinition` with unique ID and valid B/S notation. Add a
  `Preset` with a rule ID and one or more stamps: `O` is alive, `.` is unoccupied,
  and stamp coordinates are zero-based columns/rows. Every preset is validated
  through the pure board factory. The dropdown and library derive from this data.
- `engine.ts`: immutable boards, rule parsing, simultaneous Moore-neighborhood
  evolution, finite/wrapping boundaries, interpolation of brush strokes,
  population counts, and the versioned JSON snapshot. No DOM, time or randomness.
- `index.ts`: state/history and accessible UI. All listeners use the page signal;
  the playback loop is explicitly cleaned up. Board dimensions come from data.
- `style.css`: all styles are scoped to `.project-rules`. The garden grows with
  its content and has a different field-notebook layout at narrow widths.
- `manifest.json`: discovery metadata; register this file only after the page
  implementation exists.

`Board.cells` is a frozen, row-major list of `0 | 1`. Factories accept dimensions
3-128 so all eight toroidal neighbor positions are distinct. All coordinates in
the engine are `[column, row]`, measured from the top left. On-page coordinate
labels are one-based. Rule digits are individual counts from 0-8; duplicates or
invalid syntax produce a specific error, not a fallback to Life.

To add a different neighborhood, extend the engine's neighbor enumeration and
the serialization contract, then update the prose and tests. B/S notation here
means an outer-totalistic, two-state, eight-neighbor rule; it cannot express
arbitrary multistate or position-dependent automata.

## Interaction and lifecycle

- Step advances exactly once. Play begins only on a button press; it stops at a
  fixed point. The core loop suspends while the document is hidden. Reduced
  motion selects the slowest tempo and still starts paused.
- Painting, changing rule/boundary, or loading a seed pauses playback. Painting
  and condition changes preserve the cells as appropriate but start a new
  generation count at zero; previous birth/death counts become unavailable.
- A pointer drag is one undoable stroke. The first cell selects the target state
  for the Toggle brush; interpolated cells get the same state, not repeated
  toggles. Plant and Erase select a fixed state.
- The SVG grid is one keyboard stop with named cells and an active descendant:
  arrows move the selection; Space/Enter paints; Delete/Backspace erases;
  Home/End selects the row edge, or the board corner with Ctrl/Command.
  Row/column inputs and Apply brush provide a large-target alternative.
- Fit, 2x and 3x views retain one coordinate system. Zoom overflow is local to the
  board. Pan view permits native touch scrolling without painting; turn it off
  to draw. Keyboard selection reveals its cell in a zoomed board. Editing is
  available without accurately tapping tiny cells.
- Reset restores starting cells but deliberately retains the current rule and
  boundary. Set as start changes that reset point. Undo restores up to 40 whole
  study snapshots, including rule, boundary, reset point and counts.
- Export writes the *current* board, generation, B/S rule, boundary, coordinate
  convention and computed population. No storage, network call, random seed,
  or reload persistence is implied. JSON reopening is not currently a UI feature.

## Focused coverage

`tests/projects/rules.spec.ts` exercises the pure engine and this project's
isolated browser mount through the existing Playwright runner. It covers the
Life blinker, toad, pulsar and glider, HighLife replication, Seeds, B0 rules,
boundaries, immutable painting, counters, serialization and interactive editing.
The parent collection owns integrated routing, base-path and visual coverage.
