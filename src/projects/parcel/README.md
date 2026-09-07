# Parcel Panic

A standalone, original postal route-planning puzzle. Five hand-authored districts
introduce automatic deliveries, batching, limited bag capacity, one-way bridges,
and a tight final round. All artwork is local inline SVG and scoped CSS: no
assets, requests, audio, animation loop, storage, or dependencies.

## Files and extension points

- `index.ts` mounts through `createProjectPage(context, 'parcel')`. It owns the
  page, SVG map, delivery manifest, controls, honest progress, and result panels.
- `style.css` is scoped to `.project-parcel`. The physical road board and airmail
  dispatch slip adapt to narrow screens. Direction touch targets are at least 44 × 44px.
- `data.ts` contains editable `ADDRESSES` and `LEVELS`.
- `engine.ts` contains the schema, validating map compiler, pure transitions,
  immutable undo history, derived counters, and breadth-first solver.
- `manifest.json` registers the independent website.
- `tests/projects/parcel.spec.ts` covers the pure engine, every authored route,
  capacity, pickups, matching addresses, arrows, budget, hints, and full undo.

The remaining viewport is a real flex/grid workspace, not a long page hidden
behind body overflow. The map shrinks to available width and height while the
dashboard, direction pad, and undo/reset/hint controls remain on the desk.
Map + opens a larger read-only inspection map when the driving preview is
compact. SVG labels retain a 14px screen-space minimum across route changes
and resizing; the map artwork itself is fitted, never the entire website.
Mailbag & manifest opens the briefing and current dispatch slip. Field guide
contains the full introduction, map legend, keyboard instructions, route note,
and visit-only progress explanation. Routes opens the five stamped shortcuts;
the native route selector remains visible. These native dialogs support Escape,
contained keyboard focus, and a labeled Close button.
`data-project-preview` marks `.parcel-map-sheet`, including the actual map,
controls, and compact turn status, without the long dispatch field guide.
Full turn details are always one tap away. Invalid moves and verified hints
open feedback immediately; completion and budget exhaustion open the result
dialog immediately, with undo, replay, and next-route actions.

## Level schema

Add a `LevelDefinition` to `LEVELS`. Give it a unique `id`, `title`, `district`,
`briefing`, and `tip`, a positive integer `capacity` and `moveBudget`, a scenery
style (`garden`, `town`, or `canal`), a rectangular array of `map` strings, and
the parcel definitions used by that map. Keep boards at seven columns or fewer
for comfortable phone-sized lettering. The UI derives route counts and chooser
options; update the introductory five-route copy if the collection grows.

Map symbols:

| Symbol | Meaning |
| --- | --- |
| `.` | Ordinary street |
| `#` | Blocked square, rendered as a garden, block, or water |
| `@` | The van's starting post office; exactly one per map |
| `a`–`z` | Pickup for the matching uppercase parcel ID |
| `A`–`Z` | Matching delivery address |
| `↑` `→` `↓` `←` | Street with a restricted **exit** direction |

Each used parcel needs exactly one pickup and one address. `ParcelDefinition`
uses a unique single uppercase letter, a destination name, a six-digit display
color, and a shape (`circle`, `square`, `triangle`, or `diamond`). Both the map
and dispatch slip show the same letter and shape, so color is never required.
An authored map cell holds one symbol; the transition engine also supports
compiled maps with co-located events, processing deliveries before pickups.

## Rules and state

Every valid orthogonal move costs one move. Walls, map edges, and wrong-way
exits do not change any state or create undo entries. Entering an arrow square
is allowed from any adjacent street, but leaving must follow its arrow.

Cross a waiting parcel with space in the bag to collect it automatically.
With a full bag, crossing is **allowed** and costs a move, but the parcel stays
on its square. Return with room to collect it. There is no discard action.
Entering the correct lettered address with its parcel delivers automatically;
unrelated addresses do nothing. You do not have to return to the post office.
The final allowed move can win. Otherwise, using the entire allowance pauses
the round until undo or restart.

`GameState` stores position, facing, step count, and each parcel's location
(street index, `bag`, or `delivered`). Bag contents, remaining allowance,
delivery totals, and phase are derived, never independently cached.
`takeTurn()` returns a new immutable session; `undoTurn()` restores its exact
previous snapshot. This includes pickups, full-bag crossings, deliveries,
facing, and success or exhausted-budget states. Restart creates a fresh session.

Each route's current session survives switching routes while mounted. Progress
counts only currently completed sessions: undoing a winning move or replaying a
route removes its stamp. Refreshing or leaving the page clears the visit.
There are no invented scores, saves, simulated opponents, or autoplay.

## Solver and validation

`solve(level, state?, maxVisited?)` runs breadth-first search through the **same
movement function** as the game. It respects existing parcel locations, bag
capacity, arrow exits, spent moves, and the remaining budget. The visited key
omits cosmetic facing and step count because BFS reaches each position/parcel
configuration with the smallest extra move cost first.

The result is `solved` with a shortest remaining move list, `unsolvable` when
no delivery route fits the current allowance, or `limit` when the explicit
search cap is reached (default 100,000 configurations). A hint presents only
the first verified move and never drives the van. Search failure is reported
honestly instead of inventing a direction.

Run the existing focused tests; set `SITE_URL` to reuse a development server:

```sh
npm test -- tests/projects/parcel.spec.ts --reporter=dot
```

The five authored shortest routes currently take 9/12, 11/14, 19/22, 27/32,
and 36/38 moves respectively. Tests solve and replay every route, verify bag
limits throughout, and require complete deliveries within the allowance.
Run them after changing any map or rule; never ship an unverified route.
Browser workflows also cover 1440×900, 1280×720, 375×812, 320×640, and
768×480, verifying unobscured controls, dispatch, route context, errors,
completion, focus-restoring undo, and reset. Screenshots are saved in each
test's existing Playwright output directory.

## Controls, accessibility, and lifecycle

Click or tab to the map, then use the arrow keys; `Z` undoes one move.
Holding a key does not spend repeated moves. Generous visible direction
buttons support touch. Undo, restart, verified hints, a native level chooser,
five route shortcuts, replay, and next unfinished route are all real actions.

Key handling stays within the project and ignores buttons, selects, inputs,
links, and editable content, as well as modified keyboard shortcuts. Live
feedback explains invalid moves and full-bag crossings. The SVG has a dynamic
description; visible coordinates and a delivery manifest expose all parcel
statuses and addresses. Focus outlines and text labels accompany visual states.

Every event listener uses the page's abort signal. `onCleanup` releases the
per-route sessions; `mount` returns `{ destroy: page.destroy }`. There are no
global timers, global key handlers, persistent storage, or active work to leak
after the page is destroyed.
