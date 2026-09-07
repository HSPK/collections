# Sigil

A model-required, five-chapter workshop for executable glyph programs. The
architect commissions exercises and chooses restrictions or bounded hints;
the player composes the program. Local execution, not model praise, decides
every seal and ending.

## Playing

1. Open Model to configure an OpenAI-compatible Chat Completions endpoint and
   a model supporting native function tools. Invite architect explicitly;
   mounting, restoring, tracing, and editing never request a model.
2. Read Brief for the exact transformation, palette, socket and brass limits.
   Pick a drawer tile to append it. Select a placed tile, then Left, Right or
   Lift; desktop drag reorders occupied sockets. Clear empties the bench.
3. Inspect three open six-tick specimens. Numbered tick buttons and the Trace
   control expose execution through every tile. The three concentric
   instruments show source, actual output and required output. Outlines are
   dim, fills bright; shapes and color-index dots remain distinguishable
   without relying on hue alone.
4. Fire spell spends one mana and one plate firing. All 45 streams must match,
   including 42 sealed streams. Failed firings expose a concrete input,
   expected/actual output and first mismatching tick through Inspect proof
   (the round seal stamp). Select a tile to inspect its memory and branch.
5. Earn a seal, then request the next commission. Five seals win. Exhausting a
   plate's firings, running out of campaign mana before finishing, or
   explicitly leaving a plate unfinished loses. The full campaign has 14
   mana and three hint slips; hints cost a slip only after an accepted API
   response. Editing and inspection are free.

The architect chooses **roomy** (one extra socket, two extra brass units,
five firings) or **precise** (target-recipe socket/brass limits, four firings)
for each plate. Restrictions are mechanically checked and solver-verified
before a commission is committed. The architect sees recent attempted
programs, mismatch categories, actual witnesses and resource history, and
is instructed to adapt exercise variants and restrictions to mistakes.

Keyboard: Tab/Enter activate controls; 1-9 append the numbered available
glyph, arrows select a neighbor, Alt+arrows reorder, Delete lifts, C fires,
and ? opens Rules. Shortcuts are isolated from modal dialogs, text fields and
other page regions. All drag operations have ordinary button alternatives.
Reduced motion replaces Trace playback with a one-tick step. There is no
audio, external artwork, or external font request.

Save uses `createGameNotebook`: automatic browser persistence, native JSON
export/import and replay reconstruction through `GameSession`. Import is
atomic and never contacts a model. Restart same edition retries the same
sealed specimens; New edition changes their deterministic seed. Both cancel
an outstanding turn. Earned spell programs and firing history remain in the
ledger after an ending.

## Language

Each value is darkness or a light with color index 0/1/2, shape index 0/1/2
and brightness 1/2. A program is a linear sequence of at most six glyphs.
For each tick it executes left to right:

| Glyph | Semantics |
| --- | --- |
| Turn | Advance color modulo three. |
| Mould | Advance shape modulo three. |
| Flare | Swap dim and bright. |
| Sieve | Keep amber only; all other colors become darkness. |
| Facet | Advance color only when the current shape is a triangle. |
| Delay | Output the previous input to this particular tile. |
| Echo | Pass current light; on darkness, output this tile's previous input. |
| Fork | Copy current value into a side register for this tick. |
| Weave | Join the side register and main thread, then close the branch. |

Weave adds color and shape indices modulo three and makes two non-dark
lights bright; darkness is the identity. Only one branch may be open and
every Fork must close with Weave. Branch values reset every tick; Delay and
Echo memory resets only between specimens. Echo remembers its input, never
its own output, so it does not perpetuate a light through arbitrary absence.
Tick six has no implicit flush or extra tail tick.

The chapters progress through ordering, shape-dependent conditionals,
memory, fork/combine, and five-glyph temporal/conditional compositions.
There are two genuinely different targets in each chapter.

## Source and extension points

- `data.ts`: editable glyph metadata, SVG engravings, chapter and challenge
  catalogs. Target recipes are executable specifications, not exact spellings
  required of the player.
- `interpreter.ts`: pure stream interpreter, per-tile temporal state, branch
  syntax and trace cells. Never evaluates JavaScript supplied by anyone.
- `solver.ts`: deterministic specimens, first counterexamples, budget checks
  and bounded exhaustive shortest-program search. It enumerates the allowed
  palette up to the socket/brass bound and checks actual stream behavior.
- `engine.ts`: pure command parser/reducer and `GameSession` definition.
  Phases, palette IDs, resources, endings and all imported replay moves are
  validated. No model-provided state blobs are trusted.
- `agent.ts`: DOM/CSS-free native tool, exact bounded typed plan parsing,
  public observations and `smokeCase()`. It imports individual foundation
  schema/errors modules and the client type, not the UI barrel.
- `render.ts`, `style.css`: scoped letterpress workbench, procedural SVG,
  light playback, accessible direct manipulation and native rule/proof
  dialogs.
- `index.ts`: shared console/notebook lifecycle. Architect validation calls
  `session.preview`; the mandatory revision guard precedes synchronous
  `dispatch`. Restart/import cancel request ownership. Selection and traces
  do not change revisions.

To add a challenge, add its ID and catalog entry, set its chapter, palette,
target recipe, exact English goal and principle hint. Keep all targets
nontrivial and within six sockets. Run the catalog solver tests for both
disciplines. To add an operator, extend the glyph enum, semantic switch,
brass cost, branch rules if needed, rulebook and interpreter tests. Adding
a new chapter also requires revisiting campaign mana and the victory tests.

Shared transport and persistence remain in `src/core`; keep extensions focused
on the project's interpreter, verified catalog, and player-facing workbench.

## Development and deliberate bounds

Targeted existing-runner suite:

```sh
npm run build
npm test -- tests/agent-games/sigil.spec.ts
```

The suite uses `installAgentFixture` through the real client and native tool
parser, not a production offline architect. Full browser campaigns place
tiles and fire through public controls; no hidden state mutation fabricates
victory. Pure checks additionally cover solver certificates, held-outs,
grammar, memory, replay reconstruction and resource enforcement.

`smokeCase()` returns `{ request: AgentRequest<Plan>, verify(plan): void }`
for a realistic first commission. Its verifier dispatches into the actual
reducer and confirms a meaningful solvable commission and unchanged player
resources. The [connection guide](../../../docs/model-connections.md) describes
the separate opt-in real-model suite, which runs requests serially.

**Deliberate bounds:** correctness is against a finite 45-stream executable
suite, not a proof of equivalence for every infinite stream. The solver
proves existence within the legal finite palette/socket/brass bounds.
Architect choices come only from that checked catalog, not arbitrary model
goals. Replay imports validate legal transitions but are not cryptographic
evidence that an external model authored the recorded legal plans. Storage
and connection failures are surfaced by the shared notebook/console.
