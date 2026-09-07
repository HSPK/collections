# Afterlight

A turn-based salvage and rescue mission aboard the derelict ring ship Eurydice.
The original Three.js ship has twelve cutaway compartments on two decks, a
central service spine, graph-linked lifts, frosted metal fittings, pod chambers,
instrument lighting, accepted movement trails and three moving crew figures.

## Play

Open `./projects/afterlight/`. Configure an OpenAI-compatible tool-capable model
with **Model**, set captain orders, then **Advance crew** for one tactical tick.
There are no requests on mount, during animation, on selection, or during replay.
All controls are English; the game has no audio.

- **Mission** edits starting oxygen, extraction deadline, breach severity and
  initial ballast isolation. Conditions lock after the first accepted turn.
- **Orders** stages mission priority, power routing, oxygen inlet, EVA permission
  and individual bulkheads. Open doors carry both crew and oxygen. Isolate the
  three ballast gates to stop leakage; hull decay continues until repaired.
- **Crew & paths** shows equipment, energy, suit air, cargo, captain destinations,
  exact current legal actions and the latest accepted job/public intention.
- **Isometric / Deck A / Deck B** are real 3D views. Drag to orbit, scroll to zoom,
  or use arrow keys and +/- on the canvas. **2D plan** is an explicitly labelled
  playable alternative, not an automatic silent fallback for broken WebGL.
- **[ / ]** select rooms; **1 / 2 / 3** select crew; **D** cycles deck views;
  **Space** requests a turn. Dialogs and input controls suppress these shortcuts.
  The room selector and bulkhead buttons provide non-pointer alternatives.
- **Notebook** auto-saves accepted commands and provides native replay
  import/export. Import cancels pending requests and validates the complete
  replay atomically. Restart cancels pending turns and creates a fresh mission.

## Mission and authoritative rules

Vale is the engineer, with an arc spanner and three patches. Iona is the medic,
with two medkits and a one-pod harness. Moth is the pathfinder, with a depth-two
scanner and two cells. Other crew survey one graph edge.

Moth should hand a cell to Vale before they separate. Vale repairs the reactor
with one patch and cell, then the scrubber with one patch. Initially, salvage
power feeds the reactor and archive; rescue power feeds both pods and scrubber.
Balanced power feeds all stations only after the reactor is repaired. The
captain must change the bus as appropriate.

Survey rooms before entering, rescue LARK from medbay and WREN from cryogenics
one at a time, and recover the flight core from the archive. Each cargo needs
an explicit delivery at the dock. Both systems must be repaired, both pods and
the core delivered, and all three crew at the dock before Vale can extract.

Each crew chooses one action from a bounded catalog. The shared budget is 5 AP.
Moves follow one or two open edges and spend energy per edge. Repair, rescue and
core recovery cost 2 AP and energy. Rest restores 3 energy in breathable rooms,
or 1 in vacuum, but still advances hazards. Every inventory has six consumable
slots. Handoffs, collection and job consumption form one validated net inventory
change. Transfers use starting locations and cannot unlock same-tick actions.
The workshop has one shared spare-patch-and-cell cache.

Fed rooms gain 15 pressure; unfed rooms lose 20. Ballast loses 30 until repaired.
Baseline shared oxygen use is 4 per turn, or 2 after scrubber repair, plus
3 per breach damage level if an oxygen inlet reaches ballast. Hull falls by the
damage level each turn until patched. Below 35 pressure, each entered room costs
one suit air and ending a turn costs two more; safe orders prohibit vacuum
crossings. Breathable rooms refill two suit air, to eight.

Zero reserve, zero hull, an empty crew suit, or reaching the deadline without
extracting loses the mission. Extraction itself costs one tick and must survive
that tick's resource consequences. Player-visible forecasts are conservative
idle forecasts with the currently staged doors, not promises that the model
will perform a repair. Evacuation routes disclose graph paths, minimum movement
ticks and vacuum crossings; energy rests, cargo delivery and extraction take
additional time.

## Architecture and model boundary

- `data.ts`: ship graph, roles, condition types and initial loadout.
- `engine.ts`: pure creation, exact command parsing, routing/pressure forecasts,
  explicit action catalogs and authoritative atomic reducer.
- `agent.ts`: DOM/CSS-free typed tool, public observation, short crew intentions,
  system contract and exported `smokeCase()`.
- `render.ts`: bespoke Three.js geometry using `core/spatial`, bounded 120-point
  dust field, DPR cap 1.5, no shadows/postprocessing, disposable resources and
  explicit 2D deck plan using `core/canvas` and `core/loop`.
- `index.ts`: scoped page, staged captain controls, shared agent console,
  revision-owned synchronous preview/dispatch, and shared game notebook.
- `style.css`: scoped fixed-viewport workspace, bounded inspectors and dialogs.

Only the validated `turn` command changes resources, actions or mission
conditions. Staging captain settings calls `prepare` on a draft, never commits
the session. `GameSession.preview` validates the full proposed turn;
`dispatch` commits synchronously after the console confirms revision ownership.
The model can neither execute code nor set resources, scores, victory or state.

The shared console enforces a 60-second deadline, at most two requests with
1,536 completion tokens each, and one illegal-plan correction. Errors remain
explicit, with no offline stand-in. Connection keys never enter state/replay.

`smokeCase()` returns `{ request, verify }` for a real opening scenario.
Its request validates against the engine; verification requires three crew
jobs, a real tick/oxygen/hull transition and useful movement, transfer or survey.
No real model calls are made by the deterministic suite. The
[connection guide](../../../docs/model-connections.md) documents the separate
opt-in real-model command.

## Development

`tests/agent-games/afterlight.spec.ts` uses the real shared native API client
with the existing deterministic fixture, plus pure engine checks:

```sh
npm run build
npm test -- tests/agent-games/afterlight.spec.ts
```

Runtime rendering needs WebGL 2 unless the player selects
the labelled 2D view. Three.js labels are supplemental; full-size readable
controls, room descriptions and all tactical data remain in the DOM.
