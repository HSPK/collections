# Palinode

An original, nonviolent civic mystery in four eras. Aven and all its people,
documents and performances are fiction. The player edits institutions rather
than selecting arbitrary prose branches. There are 28 authored artifacts and
three honest endings, each retaining a different kind of memory.

## Files and invariants

- `world.ts`: eras, places, exclusive decisions, dependency rules, artifacts,
  ending prose and inherited choices. This is the authored source of truth.
- `engine.ts`: pure DAG evaluation, prerequisites, history, diffs, hints,
  bounded ending reachability and validated version-1 serialization.
- `map.ts`: local architectural SVG artwork and retained-DOM map updates.
- `index.ts`: retained controls, folio, comparison, persistence and lifecycle.
- `style.css`: namespaced warm-paper folio, mobile panels and reduced motion.

Every option names exactly one rule. Rules may require all, any, or none of
their referenced parent facts. A rule can only depend on its own era or an
earlier era. `evaluate(choices, era)` evaluates the historical city without
letting future decisions leak backward. The final-era evaluation drives
artifacts, future maps, relationships, goals, hints and endings.

An edit is rejected if its prerequisites are currently unavailable. If an
earlier edit invalidates an already-entered later option, its intention stays
in the timeline but becomes **suspended**. Its rule is false and contributes no
effects. Restoring the prerequisite restores the intention. No fallback
choice is silently entered. Conditional documents report suspended records
instead of pretending an incompatible structure or source exists.

## Adding a document or event

Add an `Artifact` to `ARTIFACTS` in `world.ts`. Give it a unique id, an era,
existing place, title, archival metadata, and authored variants. Variants are
ordered: the first true `when` wins; the last must be an unconditional fallback.
An optional `visible` fact controls whether the source exists in a branch.
The index retains the title of an absent record but displays **no evidence**
from it. Use existing facts where possible. New causal events belong in
`RULES`, with a readable `label`, accurate `because`, and explicit dependencies.

The UI builds the era index and decision controls from those arrays. Update
the displayed artifact count (currently 28) when changing the corpus. Add a
test for each new conditional variant's enabling and disabling branch.

## Adding an era

Append its year, name and subtitle in `ERAS`; extend the `Era` union, the
serialization era bound, and the explicit year lookup in `engine.ts`.
Assign new decisions and rules an era number. For a new exclusive decision,
extend `DecisionId`, `INITIAL_CHOICES`, and the empty-choice constructors in
`engine.ts`; add its unique options to `DECISIONS`. This changes the save
schema: increment the version and implement an explicit migration, never
silently reinterpret an older folio. The shared host is not involved.

If the new era changes a location, extend `locationStates` and a corresponding
map scene. A scene should derive from the same named facts as its documents,
not from UI state. `validateWorld()` detects unknown references, cycles, and
future dependencies. Add end-to-end goals and verify them with
`reachableEndings(limit)`, which enumerates only prerequisite-compatible
choices and reports whether its explicit bound was exhausted.

## History and local data

Version 1 saves use `palinode.folio.v1`. They include all revisions and labels,
cursor, pinned choices, current era, and selected document. Later choices may
be unassigned; the four inherited decisions must retain an intention. Any
choice may be intentionally suspended, but unknown options are rejected.
Import validates a maximum 4 MB file and at most 2,000 history entries before
asking to replace the open folio. The old city is not mutated on rejection.
The engine enforces the same capacity before accepting a new revision.
A full history remains exportable; undoing to an earlier revision permits
a new branch without silently discarding older entries.

Invalid local data and cross-tab conflicts pause automatic writes and expose
an export of the preserved data. Explicit replacement is required to resume.
Reset is a confirmed, undoable revision, not a deletion of the stored history.
Pins are separate copies and do not move under undo/redo. Editing after undo
replaces the redo path; the history panel explains this trade-off.

## Review and validation

Run only the owned spec against the existing server:

```sh
SITE_URL=http://127.0.0.1:4173 npx playwright test tests/projects/palinode.spec.ts
```

Useful selectors:

- `.project-palinode`, `[data-project-preview]`
- `[data-era="0"]` through `[data-era="3"]`
- `[data-choice="shore:steps"]`, `[data-choice="performance:return"]`
- `[data-main-map]`, `[data-pinned-map]`, `[data-revised-map]`
- `#palinode-future-document`, `[data-pinned-text]`, `[data-revised-text]`
- `[data-ledger-rule="old-circuit"]`, `[data-ending-panel]`

One return path: 1891 **tidal steps / common trust**; 1932 **footbridge /
kitchen copies**; 1976 **rehearsal room / listen**; 2026 **inheriting
households / return to the steps**. Pin this ending, then choose the tram in
1932: the old return is suspended, the map and Eli's occupation change, and
the procession becomes available. The annotated reading instead requires a
bound original, collation, reading room and open invitation.
