# PASSAGE

**A building, understood.** An interior navigation and layout atlas for the fictional
Meridian Library. All computation and storage stay in the browser. It is not an
evacuation certification, accessibility assessment, or crowd simulator.

## Workbench

The workbench fills the actual viewport without document scrolling. **Space**
contains the study, A/B landmarks and mobility settings; **Plan**, **Route** and
**Edit** open the native inspector at every screen size. The building remains
beside the inspector on desktop and as a compact live preview above it on phones.
On phones, Plan uses that entire working area for readable, interactive geometry.
Space and Plan share the selected level. No action starts an automatic walk.
Long inspectors scroll internally; Level, Pointer, pane selection and history stay
outside that scroll. Tab lists support arrows, Home and End.

- **Pick:** select Pick start or Pick destination, then click clear floor in either
  view. The selected level is explicit. Picks are checked before snapping to the
  0.5 m grid. Focus the plan, move its cursor with arrows, and press Enter for the
  keyboard equivalent. Zoom the plan for readable mobile room labels; in
  Camera / inspect mode arrows pan the zoomed plan.
- **Edit:** close doors, change their physical opening widths, toggle stair/lift
  links, change body diameter/margin, move/resize/remove a solid, or add a temporary
  partition. Enter dimensions and Apply geometry. Occupied endpoints and blocked
  landings produce explicit failure, not a straight-line substitute.
- **Walk:** use Walk / Pause, Step +1 s, rewind, a timed instruction, or the distance
  scrubber. Position is sampled from the routed 3D polyline. Stationary lift waits
  consume time but no distance. Scrubbing/walking follows the current level.
- **Keep / guide:** opens the keyboard-accessible local files/model dialog;
  Escape or Close returns focus to its trigger. Undo/Redo retains 40 transactions,
  including resets/imports. A local snapshot is explicit and never silently
  applied. JSON includes the layout and
  computed route; imported route data is deliberately discarded and recomputed.
  SVG exports the full selected floor with real openings and its route segments.

## Modules and invariants

| Module | Responsibility |
| --- | --- |
| `world.ts` | Units, structural wall subtraction, exact swept-circle clearance, canonical connector geometry |
| `presets.ts` | Three studies, rooms, library content, mobility defaults |
| `search.ts` | Grid graph, shaft reservation, portal edges, bounded incremental A*, cancellation |
| `route.ts` | Edge-to-polyline conversion, instructions, metric distance, travel time, position sampling |
| `state.ts` | Bounded validating JSON parser, reference validation, immutable transaction history |
| `scene.ts` | Three.js architectural cutaway, stairs derived from their centerlines, demand-only rendering |
| `plan.ts` | SVG geometry from the same solids, screen-CTM picking, full-floor export |
| `ui.ts`, `index.ts`, `style.css` | Publication layout, accessible inputs, async readiness, ownership and cleanup |

One unit is one metre. **Y is vertical; X/Z are floors**, with north at decreasing Z.
Floor elevations are physical, not renderer indices. The exploded view multiplies
Y by 1.8 for both geometry and routes; true-scale cutaway uses physical Y. No
exploded coordinate enters route distance, time, serialization, or clearance.

Grid spacing is 0.5 m. Centers are `(column + 0.5) * spacing`, not grid corners.
The bounded domain is at most 40 x 40 m and four floors (25,600 candidate cells).
All cell centers and graph edges test Euclidean distance from a swept disc to each
occupied axis-aligned rectangle. Body radius **plus** margin is the effective
radius; exact tangencies are conservatively excluded. Diagonals require both side
cells as well as the swept edge to be clear. No row wrapping or corner cutting.
Coordinates within 1e-7 m of a grid center are canonicalized to that exact center
before endpoint clearance, persistence, and world-point conversion. Larger
deviations are invalid, not silently snapped. Connector terminals use the same
canonical centers as graph nodes. Search rejects missing start/destination nodes
before initializing its queue, and the heuristic targets the exact goal node.

Walls are split around **all** door openings. Closed leaves add occupied rectangles
back into those voids. Shaft footprints are unavailable to normal horizontal
navigation. The only way through a shaft is its explicit portal edge. Each portal
also checks width, mobility, open state, and projected clearance through both
landing envelopes. That projection check can be conservative around other floors'
objects. It cannot admit a route through one of them.

A* uses a binary heap, a 3D Euclidean admissible/consistent heuristic, and a maximum
20,000 settled-node budget. The UI yields after 180 expansions and reports progress.
Every mutation cancels the old search and stops the old walk before publishing a
new graph. Mount awaits the first meaningful result. There is no worker URL or
external asset, so normal Vite imports work under `/collections/projects/passage/`.
Pane selection only changes presentation, never history, routing or reset origin.
The renderer observes its allocated area, ignores hidden zero-sized measurements,
and bounds projection dimensions away from zero. Showing Plan and returning to
Space therefore restores a correctly sized view without rebuilding model state.

Two objectives:

- **Distance:** sum of graph-edge 3D lengths, including stair/lift paths.
- **Comfort:** distance + stair distance x profile stair penalty + lift wait x
  0.2 m/s. The default stair penalty is 0.65. The result is reported as metres
  equivalent, **not** as a globally shortest geometric path.

Estimated time is independent: horizontal length / profile walking speed, stair
length / profile stair speed, vertical lift length / 1.1 m/s, plus per-hop waits.
Adjacent lift hops exit/re-enter and wait at each level; there is no elevator
scheduler. Only collinear ordinary graph edges are compressed. No line-of-sight
smoothing or unconstrained shortcuts are used.
Door instructions are ordered by the first intersection parameter along each
directed route segment, not by the layout's door-array order. Reversing travel
therefore reverses the crossing order without changing the underlying geometry.

The visible stair treads and rail flights are constructed from the same canonical
switchback path as the portal. Walking is continuous along the flight centerline,
not simulated footfall contact. Walls are cut to 0.85 m in the diagram, but still
occupied in navigation. The model omits headroom and door-swing sweeps. Grid
quantization can reject a physically traversable narrow or poorly aligned gap.

## Extending the building

Add a room to `world.rooms` with a unique lowercase ID, existing floor ID, its
rectangular signage area, and a grid-centered landmark point within the room.
**Rooms do not create walls.** Add explicit wall records, then add doors that
reference a wall and specify an along-wall center offset and opening width.
`structuralSolids` automatically supplies both renderers and navigation.

Add stair/lift portals with existing adjacent `from`/`to` floors, ordered from lower
to upper. A stairs rectangle has two flights at the quarter-width and
three-quarter-width lines, with a switchback at Z + 0.75 and entry/exit at
Z + depth + 1. A lift uses its rectangle center and an entrance X - 1. Ensure the
canonical endpoints land at grid centers. Set `width` to the actual clear width,
not the whole shaft width. Reusing the exact shaft rectangle between successive
levels reserves it once per floor. The parser rejects invalid references,
over-wide connectors, insufficient stair depth, and off-grid terminals.

Profiles declare a body radius, margin, true step-free flag, walking and stair
speeds, and a nonnegative stair penalty. Step-free is a hard graph constraint,
not a route preference. Update `PROFILES` to add a named profile.

Imports are limited to 400 KB, 80 walls/doors/objects, 32 rooms, 12 connectors,
and 8 atrium openings per floor. Geometry, IDs, elevations, endpoint centers,
door overlaps, dimensions, flags, and cross-references are validated. Imported
labels are escaped when rendered. Invalid transactions leave history unchanged.

## Focused verification

Use the existing Playwright runner with the owned selectors
`tests/projects/passage.spec.ts` and `tests/projects/passage-controls.spec.ts`.
Coordinate concurrent browser runs through the session's shared browser lock.

Numeric cases include independent reference Dijkstra costs, continuous clearance,
door closures/widths, diagonal/boundary conditions, portal envelopes, step-free
failures, unreachable/invalid/budget/cancelled results, exact distances and waits,
roundtrips, and history. Regression fixtures cover EPS-near occupied terminals,
canonical landmark/portal coordinates, and directed door order in both axes and
travel directions with reversed door arrays. Browser cases cover rerouting, focus, real geometry edits,
snapshots, JSON/SVG downloads, 320/375 px picking, reduced motion, and disposal.
Browser cases use 90-second software-WebGL budgets and retain failure traces.
Viewport regression checks cover 1440×900, 1280×720, 375×812, 320×640 and
768×480: every pane, real door edit → undo → route step, reset, JSON download,
model notes, live preview bounds and zero document overflow. They retain screenshots
for each size in the runner's output directory.

Review hooks: `.project-passage[data-ready="true"]`, `data-route-status`,
`data-walk-state`, `data-walk-time`, `data-walk-y`, `data-revision`,
`[data-passage-pane]`, `[data-passage-plan]`, `[data-passage-space]`,
`[data-passage-door]`, `[data-passage-portal]`, `[data-passage-object]`,
`[data-passage-object-x]`, `[data-passage-apply-object]`.
`[data-passage-keep]` opens files/model notes; pane buttons retain their existing
`data-passage-pane` and `aria-pressed` hooks as well as semantic tab state.
The root declares `data-workspace="true"`. Add inspector content inside its bounded
pane, not as a new root row; keep the stage's `min-height: 0` allocation.
`data-project-preview` encloses the linked workbench. No collection header is
injected and no background animation remains active while idle.
