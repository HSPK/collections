# Word Circuit

A standalone, original four-letter word-ladder game at
`/projects/word-circuit/`. The routing console, letter wires, editable ladder,
route library, instructions, and searchable dictionary all belong to this
project. There are no remote services, external assets, sound, timers,
leaderboards, or stored performance claims.

## Files and extension points

- **`data.ts`** owns the curated English vocabulary and original short meanings,
  plus eight named start/destination pairs. The vocabulary is deliberately not
  an exhaustive English dictionary. Every accepted word is visible in the
  searchable dictionary, including its meaning. English regional spellings and
  inflected forms count only when explicitly listed.
- **`engine.ts`** has no DOM or browser dependencies. It builds a deterministic,
  undirected graph using single-position wildcard buckets. Edges change exactly
  one letter in place. Breadth-first search calculates actual shortest routes.
  Move validation, immutable attempts, move counts, rewinds, resets, legal next
  words, and hints are pure functions.
- **`index.ts`** mounts one stable page skeleton with `createProjectPage`. Only
  changing displays and lists are re-rendered; typing never remounts the form.
  All event listeners use `page.signal`; destroying the page aborts them.
- **`style.css`** scopes every selector under `.project-word-circuit`. Its paper,
  green circuit board, four letter rails, and numbered route log are CSS and
  inline SVG, with no animation dependency. Breakpoints rearrange the console,
  log, route cards, and dictionary for phones.
- **`manifest.json`** registers the independent page with the collection.

The page opts into the collection workspace contract with `data-workspace="true"`.
Its `100dvh` shell and `min-height: 0` flex/grid children allocate the actual
remaining space; document overflow is not hidden. Desktop word entry and counters
sit beside the circuit, with a separately scrolling route log. Phones show the
current/destination letters, entry, counters, live feedback, hint, backtrack,
reset, and next controls together; **Route log** opens the ladder in one tap.
The collection floating menu is preserved.

**Choose a route**, **How to play**, and **Browse dictionary** open named native
dialogs. All original introduction, rules, wire explanation, route descriptions,
dictionary meanings, and footer notes remain available. Hint explanations,
invalid submissions, and completed results also open immediately in accessible
dialogs instead of extending the page. `data-project-preview` marks the single
`.wc-workbench` containing the playable console and the desktop log.

## Adding words

Add an uppercase four-letter `[A-Z]` word and an original, helpful meaning to
`vocabulary` in `data.ts`. Entries are sorted for display. Do not silently accept
unlisted variants, abbreviations, or proper names. A graph build rejects malformed
or duplicate dictionary entries. Keep added words connected to the existing graph:
the engine test checks reachability of **every** listed word from `COLD`.

Changes to the dictionary can change old puzzles' shortest routes. The UI derives
minimum moves, remaining distance, hints, and route-card difficulty from the graph,
never from a stored answer or a guessed number. The route descriptions are thematic,
not definitions of intermediate steps.

## Adding puzzles

Add a unique `id`, `title`, `start`, `goal`, and `description` to `PUZZLES`. Both
endpoints must already be dictionary entries, must differ, and must be connected.
The first entry is the initial puzzle; “Next puzzle” follows array order and wraps.
The cards use actual minimum lengths: up to 4 moves is “Short circuit,” 5–6 is
“A few turns,” and 7 or more is “Long connection.” These labels describe length,
not a measured human difficulty rating. Update the visible “Eight” copy and any
tests if the number of authored puzzles changes.

## Rules and honest assistance

- A move is a new, listed four-letter word differing from the current word at
  exactly one position. Input is case-insensitive and trims surrounding whitespace.
  Internal spaces, non-ASCII letters, numbers, punctuation, other lengths, and
  unknown words receive distinct actionable feedback.
- Words cannot repeat on the current route. Backtracking to a previous stop
  removes everything after it, so those removed words become available again.
  Move count always equals `path.length - 1`; failed submissions are not moves.
- A hint searches from the **current** word and blocks earlier route words. It
  displays the next word without making a move. A blocked detour explicitly
  recommends backtracking and does not invent a hint or increment its count.
- Each newly revealed hint is counted once for an exact route prefix. Requesting
  it again, including after rewinding to that prefix, does not count twice.
  Backtracking never refunds hints. Reset and switching puzzles begin fresh
  attempts, clearing both counts.
- Dictionary browsing, the next-word filter, and visible distances are open
  assistance and do not count as next-word hints. Consequently, zero hints is
  never described as “unassisted.”
- Completion requires the actual current word to equal the destination.
  The completed log remains available and is compared to the real starting minimum.
  No results persist after a reset, route change, page reload, or unmount.
- Lit wires indicate matching positions only, not percent completion or optimality.
  Matching letters may be changed again.

## Controls and accessibility

Enter submits the form; “Connect word” does the same on touch. “Backtrack” removes
one move; earlier log stops rewind directly. “Reset route,” “Next puzzle,” and
route cards remain available inside the page. Selecting the already-selected card
does not discard the attempt.

The dictionary can be opened using “Browse dictionary” or “Browse valid next
words” in the log; its original native disclosure remains inside the pane.
Search includes words and meanings. Available
dictionary entries offer “Use word,” which only fills and focuses the input;
the user must still submit. No global shortcuts interfere with typing.

Input labels, live validation/status messages, `aria-invalid`, ordered route
history, named letter diagrams, pressed route cards, keyboard focus outlines,
readable 14px-or-larger controls, and a reduced-width single-column console are built in.
Focus remains in the input for normal submissions; finishing focuses the completion
heading. Reset, rewind, dictionary fills, and route changes intentionally return
focus to the input. Dictionary opening focuses its search field. Dialogs support
Escape/Close and trap focus natively. Route changes and dictionary fills close
their pane without document scrolling. Resizing moves the same log nodes between
the desktop sidebar and phone dialog, without discarding the active attempt.

## Focused verification

The focused spec is `tests/projects/word-circuit.spec.ts`. Its pure tests cover
all words and puzzle pairs, exact graph edges, deterministic shortest routes,
blocked vertices, malformed input, unlisted English words, duplicates, immutable
move counts, resets/rewinds, restored words, solved outcomes, detours, and truthful
hint accounting.

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/projects/word-circuit.spec.ts --grep engine
```

This command does not start a development server or browser. The same spec has
browser workflows at 1440×900, 1280×720, 375×812, 320×640, and 768×480. They assert
document dimensions and visible controls before playing, then exercise hints,
errors, dictionary filtering/fill, ladder rewinds, actual completion, reset,
puzzle selection, and resizing with a stable attempt. Desk/result screenshots
are written to each test's `testInfo.outputPath`.
Browser setup intercepts Vite's token-bearing development WebSocket so unrelated
project edits cannot reload an active route on the shared server.
Coordinate browser runs when sharing a development server. Collection-wide type
checking and building run from the repository root.
