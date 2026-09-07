# Algorithm Theatre

An independent learning website at `/projects/algorithms/`. The page owns its
navigation, reading sections, array editor, sorting stage, and transport. It
mounts with `createProjectPage(context, 'algorithms')`, fits one dynamic viewport, and
does not require the collection's animation toolbar.

The `data-workspace="true"` root keeps the sorting stage, Previous/Play/Next,
Restart, current array, operation counts and trace slider together. Array,
Trace, Script and Totals tabs hold the original editor, step explanations,
pseudocode and complete-run scorecard beside the stage, or below it on phones.
These bounded panes scroll without moving the live result away. Field notes
and Counting rules are native dialogs retaining the programme, stability
witness, all method notes and counting contract. Escape restores trigger focus.

## Files

- `index.ts`: page markup, input/application state, playback, and rendering.
- `data.ts`: algorithm descriptions, pseudocode, presets, and learning content.
- `engine.ts`: pure validation and immutable insertion/selection/bubble traces.
- `style.css`: styles scoped to `.project-algorithms`; no external assets.
- `manifest.json`: discovery metadata, registered after implementation.
- `../../../tests/projects/algorithms.spec.ts`: focused engine and isolated
  browser tests.

## The operation-trace contract

`buildTrace(algorithm, values)` accepts 2–12 integers from −99 to 99 and never
mutates its input. `validateInput(text)` accepts comma- or whitespace-separated
whole numbers, including negatives and duplicates. Missing comma-separated
values, decimals, out-of-range values, and unsuitable lengths produce readable
errors without replacing the running recording.

A `SortingTrace` contains the algorithm ID, copied numeric input, an ordered
array of `TraceStep` snapshots, and the final output. Every reachable object
and array in a trace is frozen. Items are `{ value, origin }`; `origin` is the
zero-based opening position and travels with the item. The UI displays it as
a letter ID. Algorithms compare `value`, never `origin`.

Each step contains:

- `index`, a contiguous zero-based frame number; setup is step zero.
- `kind`, `title`, and a truthful explanation of this exact frame.
- `line`, the ID of the matching pseudocode line in `data.ts`.
- `items`, the array state **after this step's operation**.
- `focus`, the involved array indices; `operands`, the values involved in the
  decision or movement, retaining their original identities.
- `held`, the insertion key outside the array, or `null`.
- `ordered`, the currently confirmed region. In insertion sort this is an
  ordered prefix, not necessarily final positions. In selection and bubble
  sort it contains final positions.
- `delta` and cumulative `counters`, each containing `comparisons`, `swaps`,
  and `writes`. Cumulative counts include the current frame's delta.

A comparison frame precedes the movement it decides. A swap is one atomic
frame with two slot writes. An insertion shift is a copy, so the intermediate
array can temporarily repeat an identity; the held register explains where
the displaced key is. The placement frame restores the full set of items.
Setup, selection, pass-boundary, and finished frames may have zero deltas.
Not every bookkeeping pseudocode line needs its own frame.

### Counting rules

1. A value-to-value comparison adds one comparison. Index/loop conditions and
   flags are excluded; failed value comparisons still count.
2. An exchange of two distinct array slots adds one swap **and two writes**.
   Selection sort skips self-swaps.
3. An insertion shift or placement adds one write, including placing a key
   back into its unchanged slot.
4. Scalar key copies, input copying, and snapshot storage are excluded.

Consequently, selection always makes `n(n − 1)/2` comparisons, bubble makes
one swap per strict inversion, and insertion makes
`strict inversions + n − 1` writes. Insertion and bubble are stable because
they move items only on strict greater-than comparisons; the selection
implementation is not stable. Complexity labels describe the sorting routines,
not the extra memory used to store the teaching trace.

### Adding an algorithm

1. Extend `AlgorithmId` and implement its pure routine in `buildTrace`.
   Use the shared emitter; do not retain mutable snapshots or change earlier
   counters. Keep setup and finished frames and their pseudocode references.
2. Add its ID to `algorithmOrder` and its definition to `algorithms` in
   `data.ts`: mechanism, tradeoffs, stability, best/average/worst complexity,
   ordered-region semantics, and uniquely identified pseudocode lines.
3. Emit exactly the operations the displayed routine executes, with correct
   operands, line IDs, held-key state, and per-step counter deltas.
4. Add output, counter, stability, snapshot immutability, and prefix-consistency
   tests. If a new kind of operation is needed, extend the kind labels and
   explain its counting convention both here and in the reading content.
5. The method controls and complete-run scorecard derive from the data registry.
   Update any editorial references to the number of algorithms.

## Interaction, accessibility, and motion

- Every recording starts paused, with a meaningful applied array. Switching
  algorithms preserves the text editor, including an unapplied or invalid
  draft; the stage and scorecard continue to identify the applied array.
- Selecting a preset only changes the preset description. “Use dataset” is an
  explicit replacement. “Try the stability witness” explains its replacement
  before loading `[2, 2, 1]` and selection sort, paused.
- Previous, Next, Restart, and the native range slider select snapshots rather
  than rerunning operations. Endpoints disable unavailable actions. Reset,
  inspection, array edits, algorithm changes, and tempo changes pause playback.
- Native labels, radio buttons, a table, a list of array slots, visible focus
  rings, and 44px-or-larger control targets support keyboard and touch use.
  With the stage itself focused: Left/Right step, Home/End jump, Space toggles
  playback. Editable controls retain their own keyboard behavior.
- Values, origin IDs, Active/Ordered labels, the held register, and a textual
  current array convey state without color. Pseudocode uses `aria-current`.
  User actions and playback completion have polite announcements; frequently
  updated numerical outputs explicitly opt out of live announcements.
- No values tween between frames. `context.reducedMotion` selects the slower
  initial tempo and explains the opt-in behavior. Motion never begins without
  Play (or the documented Space shortcut). The core loop suspends rendering in
  hidden tabs without a catch-up burst.
- All listeners use `page.signal`. The paused-by-default `createLoop` is
  registered with `page.onCleanup`; destroying or aborting the page cancels
  its animation frame and visibility listener. No timers, observers, storage,
  external services, fonts, or image downloads are used.
- Slot arrays use up to eight columns on desktop and four in compact layouts.
  The slot list scrolls locally when needed; the complete current-array text
  and transport stay visible. All twelve supported values remain present with
  readable value/identity labels. Compact cards show Act/Ord/Wait, with the full
  state in each card's accessible label and title; their bars retain the same
  signed zero-line scale. Native tab changes do not seek the trace or
  alter playback. Stage shortcuts are restricted to the focused stage itself.

## Focused verification

Using the existing Playwright installation:

```sh
npm test -- tests/projects/algorithms.spec.ts --output=src/projects/algorithms/.test-results
```

The engine tests cover duplicate, sorted, reverse, negative, and equal arrays;
exact known totals; every operation's effect and prefix counters; deep freezing;
caller nonmutation; pseudocode references; stability; input validation; and
exhaustive short arrays over `[-1, 0, 1]`.

The original browser tests intercept a test-only HTML document and mount just
this project from its Vite module. They exercise
controls, draft preservation, validation, reduced-motion defaults, 375px
interaction, playback completion, and abort cleanup with tracked animation
frames. `tests/workspaces/worlds-audio.spec.ts` adds actual-route screenshots,
no-document-scroll, responsive round trips, twelve-value editor/trace panes,
native-dialog and floating-menu workflows at 1440x900, 1280x720, 375x812,
320x640 and 768x480. Every browser run must use the coordinator's exclusive
renderer lock. `SITE_URL` can point at the existing Vite server. To run only engine
tests without starting the configured server, set `SITE_URL` and add
`--grep "trace engine"`; these tests do not make network requests.
