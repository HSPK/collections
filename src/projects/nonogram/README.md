# Nonogram Club

An original, standalone picture-logic website. The first edition, **The Little
Things**, contains four hand-drawn pictures: an 8×8 cup and cactus, and a 10×10
sailboat and house. Every puzzle has exactly one solution and is solvable by
intersecting line candidates, without guessing.

## Files

- `index.ts` mounts the complete club page with `createProjectPage`, including
  its selector, board, instructions, help, counters, and solved-picture reveals.
- `style.css` provides the paper-and-green-ink design. All selectors are scoped
  to `.project-nonogram`; the board has its own pan surface, never horizontal
  document scrolling or whole-page scaling.
- `data.ts` holds original drawings and editorial copy. Picture titles are
  revealed only after completing their puzzle.
- `engine.ts` contains DOM-free, immutable game operations, clue generation,
  candidate enumeration, a small bounded-solution solver, and one-cell hints.
- `manifest.json` registers the page with the collection.
- `../../../tests/projects/nonogram.spec.ts` covers clues, uniqueness, rules,
  hint accounting, and the browser interaction contract.

The page opts into the collection workspace contract with `data-workspace="true"`.
A `100dvh` shell gives its flex/grid children the real remaining height with
`min-height: 0`; it does not hide document overflow. Desktop tools sit beside the
board. Phones keep painting, Check, One hint, Reset, feedback, counters, and puzzle
navigation on the same screen. The collection floating menu remains available.

**Puzzles & collection** opens the original shelf and collected stamps in a native
dialog. **How to play** retains the introduction, invitation, clue explanation,
keyboard handbook, editorial notes, and footer. Choosing a puzzle closes its pane
and restores that puzzle's board position instead of scrolling to a shelf.
Check/hint explanations, reset confirmation, and completed pictures use named
native dialogs with Escape, Close, and focus restoration.

Cells are at least **32 CSS pixels**, with a ResizeObserver fitting larger cells
when space allows. Dense grids pan inside the board, with sticky row/column clues.
**Focus board** moves the same paper and controls into a nearly full-screen native
dialog, using cells of at least **36px**. **Return to desk** restores the same nodes,
listeners, marks, and selected tool. Keyboard navigation pans only the board to
keep its focused cell visible. `data-project-preview` stays on the single
`.nc-paper` gameplay region, including while focused.

## Rules and honest feedback

Numbers give lengths of consecutive filled runs, in order. Row clues read from
left to right; column clues read from top to bottom. Adjacent runs require at
least one empty square between them. An empty clue is displayed as **0**.

Completion requires exactly the picture's filled squares. Background squares
may remain untouched or carry an X; completing every X is never required.
Faded, struck-through clues mean the current **filled runs match** the numbers,
not that their positions have been checked.

**Check** counts only explicit contradictions: ink on background, or X on a
required filled square. An unmarked required square is unfinished, not wrong.
Checks do not modify marks. Highlighted mistakes have both a distinctive
border and a description in the square's accessible name.

**One hint** fixes one contradictory mark first. Otherwise it explains a square
forced by the available row/column arrangements, preferring ink over an X.
The fallback for future, harder grids is explicitly described as a one-square
reveal, not a deduction. Only an actual one-square change increments hints.
Hints are separate from manual moves; checks have their own counter.

Each selected puzzle keeps its own cells, counters, checked mistakes, hint,
and keyboard position for the lifetime of this mounted page. Switching never
resets progress. Resetting one puzzle requires confirmation and clears only
its current attempt. A completed puzzle is locked until replayed. Collected
picture counts are unique per puzzle and survive replay **within this visit**.
There is no local storage, account, timer, network request, or sound.

## Accessible controls

- Click or tap a cell to apply the selected **Fill** or **Mark X** tool.
  Applying the same mark again erases it; the other mark replaces it.
- Right-click a cell to toggle X without changing the selected tool.
- The board is a labeled table/grid with one tabbable cell. **Tab** enters or
  leaves it, and arrow keys move without wrapping. **Home/End** reach the ends
  of the current row. Focus also highlights the associated clues.
- **Space/Enter** paints using the selected tool. **F** toggles ink and **X**
  toggles X directly on the focused cell; **Delete/Backspace** erases.
  Shortcuts only run while a board cell is focused and ignore modifier chords.
- Each cell's accessible name includes its row, column, state, both clues,
  and any checked mistake. Solved cells remain keyboard-readable.
- Help feedback is a local polite live region with a **Details** button to reopen
  its complete explanation (or a completed picture). Completion immediately opens
  and focuses the actual picture result. Reset confirmation can be dismissed with
  **Escape**, restoring focus to Reset.
- All event listeners use the page's abort signal. The board ResizeObserver is
  disconnected on cleanup; native dialogs close and are removed on unmount.

## Extending the edition

Add a drawing to `data.ts`: a unique URL-safe ID, spoiler-free selector label,
picture title, level, invitation, reveal copy, and a rectangular `pattern`.
Use `#` for ink and `.` for background. `createGrid` derives both sets of clues,
so never hand-maintain the displayed clue numbers. The engine supports grids
up to 15 squares per side; keep this edition at 8×8 or 10×10 for comfortable
phone use. Editorial collection totals in `index.ts` should be updated if the
number of pictures changes.

Run the focused tests after any drawing change:

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/projects/nonogram.spec.ts --grep engine
```

The engine tests independently reconstruct every line's runs, verify the
original picture is one legal reconstruction, enumerate up to two whole-grid
solutions to prove uniqueness, and require all current pictures to solve
without branching. They also test ambiguity and impossible clues so uniqueness
is not assumed. The command above does not start or use a development server.

The browser cases exercise 1440×900, 1280×720, 375×812, 320×640, and 768×480.
They assert document dimensions and visible primary controls before interaction,
paint using actual pointer coordinates, pan with keyboard focus, open reference
panes, complete a real puzzle, replay, and confirm reset. Desktop/mobile desk,
focused-board, and completed-picture screenshots use `testInfo.outputPath`.
Run browser checks against the coordinated server under its shared browser lock.
The specs intercept only Vite's token-bearing development WebSocket, preventing
unrelated project edits from reloading an active attempt during a workflow.
