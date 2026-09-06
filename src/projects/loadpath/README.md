# LOADPATH

**The forces inside a space.** A fictional structural form studio, not a
construction tool or structural-code certification service.

## The instrument

The workbench edits one `Structure`: nodes, axial members, global translational
restraints, solid circular sections, linear elastic materials, and point-load
cases. The solver, picking geometry, load glyphs, deformed endpoints, inspector,
comparison, JSON, CSV, and vector drawing all use that same committed model.

The default Aster canopy is a 22-joint, 60-member double-layer space frame on
four branching feet. Signal is a cross-braced tower; Reach is a triangular
cantilever. Each has downward, 3D crosswind, and eccentric point-load studies.
"One brace away" intentionally has a mechanism. Connect N03 to N04 to recover
the third independent spatial stiffness direction.

## An end-to-end exploration

1. Open Aster and pin the initial downward case in Results.
2. Choose Crosswind. Inspect a diagonal: the signed force and stress change.
   Reactions and the force ledger use this case, not a load envelope.
3. Choose Members, assign a different section/material or edit its area/E.
   Family property edits explicitly affect every member using that family.
   The comparison shows the current displacement, mass and energy against
   the immutable pinned model and load case.
4. Enable Deformed and set its amplification. Dashed lines are original;
   straight solid members join displaced nodes. Turn it off before dragging
   a joint in XY, XZ or YZ. The remaining coordinate stays fixed.
5. Try One brace away. No force colors, reactions, or zero-shaped displacement
   fallback is shown. In Edit > Build the frame, connect N03 to N04.
   Remove that member, undo, redo, and observe the explicit model status.
6. Save editable JSON, numerical CSV, or the actual X/Y elevation SVG. An
   imported document is fully validated before replacing good data. Undo also
   reverses imports and resets. A pinned design restores both its edited model
   and its original reset baseline. Imported studies can share display names
   without sharing reset origins.

There is no autoplay, network, external asset, persistence service or hidden
stiffness. Session changes persist through the exported JSON file; no implicit
local storage is used.

## Numerical contract

All internal units and version-1 JSON are SI: m, N, Pa, kg. Human controls convert
GPa to Pa, square millimetres to square metres, kN to N, and displacement metres
to displayed millimetres. Y is up, with gravity `(0, -9.80665, 0) m/s^2`.

For each bar, `L = |xb-xa|`, `d = (xb-xa)/L`, and `k = EA/L`.
The four global blocks are `+k dd^T`, `-k dd^T`, `-k dd^T`, `+k dd^T`.
Restrained translations are exactly zero. The solver factors
`D^-1 Kff D^-1 = LL^T`, where `Dii = sqrt(Kff_ii)`, with Cholesky.
There is no penalty constraint, regularization, diagonal spring, automatic
support or minimum-displacement fallback.

Zero diagonal stiffness is rejected. A scaled Schur-complement pivot at or
below `1e-10` withholds results. Pivots at/below `1e-13` are reported as a
mechanism/rank deficiency; small positive pivots above that are labeled
ill-conditioned. Finite precision cannot prove an exact rank boundary. The
reported minimum pivot depends on elimination order and is **not a condition
number**, eigenvalue, or structural safety criterion.

The full residual/reaction vector is `K*u-F`. The free-DOF infinity residual
is separately exposed. The normalized backward residual is
`max_free |K*u-F| / max(1 N, ||K||inf ||u||inf + ||F||inf)`;
values exceeding `1e-9` are rejected. Global force and moment balance use
applied loads plus reactions only on constrained axes, with moment taken
about the global origin. These are force-couple equilibrium diagnostics,
not member bending moments.

Bar extension is `d dot (ub-ua)`, axial force `EA/L * extension`,
stress `force/A`, strain `extension/L`, energy `force*extension/2`,
and mass `rho*A*L`. Self-weight is half the actual member weight at each end.
The energy identity `sum(Ubar) = F dot u / 2` is displayed.

Rendering uses the circular radius `sqrt(A/pi)`, with a visibility minimum
of `0.018 * (largest model extent / 12)` metres. This drawing minimum never
enters stiffness, self-weight, stress or Euler calculations. Arrow length is
schematic: `(0.5 + 1.5 * magnitude/groupMaximum) * extent/12`, separately for
loads and reactions. The numeric vectors are authoritative. Deformed drawing
starts off; its default optional amplification is 400.

All sections are **solid circular rods**, with equivalent diameter
`sqrt(4A/pi)` and `I = A^2/(4pi)`. The optional secondary Euler indicator is
`Pcr = pi^2*E*I/L^2`, ideal pin-ended effective length factor 1.
Compression/Pcr is neither code utilization nor a safety factor. The app
does not certify materials, imperfections, yielding or buckling. It does not
model beams, bending, rigid joints, solid FEA, contact, geometric nonlinearity,
collapse, dynamics, wind pressure or load combinations.

Warnings flag displacement greater than 1% of the longest member, axial strain
greater than 0.2%, compression beyond ideal Euler load, and scaled pivots below
`1e-6`. A "solved" label describes numerical equilibrium, not a safe design.

### Work and data bounds

| Quantity | Limit |
| --- | --- |
| Nodes / members | 60 / 240 |
| Total / free DOFs | At most 180 / 180 |
| Dense matrices | Global 180 x 180; reduced at most 180 x 180 |
| Cholesky work | At most about 1 million inner-product terms |
| Load cases / section families / materials | 8 / 12 / 12 |
| Coordinates | Each component -100 to +100 m |
| Minimum member length | 0.01 m |
| Area | 1 to 100,000 mm^2 |
| Young's modulus | 0.001 to 500 GPa |
| Density | 0 to 25,000 kg/m^3 |
| Point load components | -1,000 to +1,000 kN per node per case |
| JSON import / export | 150,000 UTF-8 bytes |
| Undo snapshots | 60 |
| Drawing amplification | 1 to 2,000; drawing only |

Duplicate reversed connections, duplicate identifiers/loads, missing references,
non-finite numbers, malformed versions, and zero/short members are rejected.
Unconnected or under-braced but syntactically valid designs are deliberately
accepted and shown as unsolved. A new free node normally creates a mechanism.

The bounded dense solve is synchronous: no stale worker response can race a
new edit. Revisions update together with results. File imports use a request
token and revision check; a later edit cancels a pending read. Pointer movement
previews a candidate and commits once on release. Escape/cancel/another model
update discards it. Only one pointer owns the canvas at a time.

## Documents and reset provenance

Version-1 JSON remains an SI model document, not a serialized editing session.
`serialize` validates the model and emits indented JSON when it fits the
150,000-byte import budget. Larger documents use lossless compact JSON. If even
compact JSON cannot fit, serialization throws `ModelError`; the UI reports the
failure without creating a download or changing the model. No coordinates,
loads, sections, cases or numeric precision are discarded to meet the budget.
Re-importing an exported model establishes that file's contents as its new
reset baseline.

CSV, SVG and the 3D scene share `result-lookup.ts`, matching each solved
node/member to geometry by its **ID**, never its array position. Model and result
rows must have unique IDs with complete one-to-one coverage; missing, duplicate
or unmatched IDs reject the output. The scene validates associations before
replacing its previous geometry. SVG member groups carry nonvisual
`data-lp-member` IDs, and the 3D scene uses matched node IDs for support reactions.
CSV row ordering follows the result arrays; drawing order still follows the
model. Physical edits still require recomputation, as the UI performs on every
committed edit.

`History` owns a single bounded timeline of `{model, origin}` snapshots.
`ResetOrigin` contains `{baseline: Structure, presetId: string | null}`:
authored studies use their stable study ID, and imports use `null`. Display
names and filenames are never origin keys. Constructor inputs and explicit
origins are validated and copied; `history.model` and `history.origin` return
defensive copies.

`new History(model)` is still supported and uses the initial model as its
baseline. `new History(model, origin)` records an explicit origin.
`commit(next)` inherits the current origin; `commit(next, origin)` replaces it
atomically with the model, for imports, study selection or pinned restoration.
Undo, redo and deduplication consider both fields. Identical working models can
therefore have distinct, undoable reset origins. Original baselines remain
available even after the initial model snapshot ages out of the 60-edit limit.

Ordinary edits must not construct a new baseline. Reset commits
`history.origin.baseline` while retaining its origin. Pinned UI references
capture the origin alongside their model and solved result; restoring one
does not turn its edited state into a new baseline. This also keeps authored
reset behavior intact when an imported file happens to use a preset's name.

## Modules and extension points

| Module | Responsibility |
| --- | --- |
| `schema.ts` | Typed SI model, bounds, validated fresh parsing, vector operations |
| `solver.ts` | Public validated assembly, scaled Cholesky, reactions, member results |
| `result-lookup.ts` | Shared one-to-one model/result ID matching for CSV, SVG and 3D |
| `presets.ts` | Three stable fictional studies and one mechanism, real load cases |
| `document.ts` | Reopenable bounded JSON, origin-aware history, ID-matched SI CSV |
| `diagrams.ts` | Shared displaced endpoints, signed palette, ledger, actual SVG |
| `scene.ts` | Y-up Three.js renderer, point/member picking, single-pointer plane edits |
| `ui.ts` | Semantic controls, result ledgers, comparison, assumptions |
| `index.ts` | Atomic edits, selection, history, import cancellation, lifecycle |
| `style.css` | Scoped drafting studio and Structure/Edit/Results mobile panes |

To add a **solid circular section**, add `{id, name, area}` in square metres
to a preset or imported model. The renderer and solver discover it through the
existing selectors. For a different shape, explicitly version the schema and
provide a validated second moment of area; update the Euler description and
fixtures instead of pretending the current circular formula still applies.

To add a **material**, add `{id, name, elasticModulus, density}` in Pa and
kg/m^3. There are no implicit yield strengths or allowable stresses.

To add a **load case**, add `{id, name, loads, selfWeight}`; each load is one
global 3-vector per node. UI, history and exports discover cases automatically.
Any new distributed loading needs a documented nodal equivalent, including
its force and moment resultant; do not draw arrows without assembled loads.

To add a **support type**, map it explicitly to the three global restraint
booleans: free `[false,false,false]`, pin `[true,true,true]`, Y roller
`[false,true,false]`. Rotated rollers, springs or settlements require a
deliberate schema/solver extension and fixtures, not hidden DOF pinning.

To add a **preset**, create a bounded `Structure` and add a `Study` in
`STUDIES`. Use unique short IDs. Prove its intended stability in every case.
Do not change the fixed manifest order (70).

## UI contracts and lifecycle

Main selectors: `.project-loadpath`, `[data-project-preview]`,
`[data-lp-scene]`, `[data-lp-study]`, `[data-lp-case]`, `[data-lp-selection]`,
`[data-lp-field]`, `[data-lp-restraint]`, `[data-lp-connect-from]`,
`[data-lp-connect-to]`, `[data-lp-metric]`, `[data-lp-status]`.
Root attributes `data-analysis`, `data-revision`, `data-selected` and
`data-ready` describe the currently displayed state. Canvas `data-frames`
and `data-pointer-owner` support real lifecycle and gesture assertions.

On small screens use `[data-lp-pane="structure|edit|results"]`; the model
persists when switching panes. Exact coordinates, selectors, camera keys,
zoom/fit buttons, and step moves mean editing never requires dragging.

The paused core render loop draws only on changes or resize, with no damping
or autoplay even without reduced-motion. Teardown aborts listeners, cancels
RAF and gestures, disconnects ResizeObserver, revokes download URLs, disposes
all owned geometries/materials/render lists, and releases the WebGL context.
Mount awaits the first rendered structural frame. All imports are relative;
there are no root-relative project assets, so nested `/collections/` hosting
is supported by the existing collection page build.

## Focused verification

Use the existing shared server; do not start a second server:

```sh
SITE_URL=http://127.0.0.1:4173 npx playwright test tests/projects/loadpath.spec.ts tests/projects/loadpath-workflows.spec.ts tests/flagships.spec.ts --grep 'LOADPATH|Loadpath|loadpath: small-screen'
```

Numerical fixtures cover closed-form axial/serial bars, symmetric spatial
tripods, arbitrary rigid rotation, full stiffness energy, three studies and
all cases, equilibrium, real mechanisms, near-singular rejection, invalid
topologies/ranges, mass/weight, material/section/geometric changes and
transactional interchange. Browser fixtures exercise the actual workbench.
The filechooser workflows inspect full exported models through same-name
imports, undo/redo, pinned restoration and authored/imported-name collisions.
Dense 60-node/240-member/eight-case fixtures exercise compact roundtrips and
real Save JSON downloads. CSV fixtures permute model and result arrays and
reject unmatched IDs. SVG fixtures compare per-member geometry and colors under
independent permutations. Real WebGL framebuffer comparisons exercise force
colors, support reactions, deformation and rejected incomplete scene updates.
Only real WebGL browser cases receive a 90-second budget. Traces are retained
on failure by the existing Playwright configuration.

The browser helper isolates only the development server's Vite HMR socket, so
concurrent edits to other collection projects cannot reload a page mid-test.
The application has no WebSocket feature; rendering, input, files, and numerical
analysis are not mocked.
