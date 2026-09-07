# Graft

An original six-season ecology strategy game. Velvet moss pursues expansion,
Lantern lichen mutual aid, and Paper coral conservation. All organisms and
biology are fictional.

## Play

The player tends a 19-hex specimen (17 soil sites and two basalt outcrops).
Select a site on the drawing, through the native Site selector, with a colony
button, or with arrow keys while the map is focused. Home selects Moss.
Lens + magnifies the selected site; Inspect opens exact resources, colony
objectives, accepted public intentions, and the local resolution journal.

Stage up to three interventions per season, then **Ask colonies**. There are
12 water, 9 compost, and 10 tools for the entire campaign. Water/compost move
three units from stock to a site. Shelters, seedbanks, directional channels,
and symbiosis bridges each cost two tools. Undo removes the last draft edit.
Rust dashes identify draft sites. Displayed stock is the amount left after
reservations, not a committed deduction.

The first two seasons are the Dew nursery, the next two Glass drought, and
the last two Ember bloom. Each forecast is visible before committing.
After the sixth season, win with all three lineages, at least six living
patches, 18 total spores, and three spores per lineage. Extinction of any
lineage immediately collapses the ecology. Surviving below the final quotas
also loses. Restart restores the same reproducible specimen.

## Deterministic rules

- Each colony independently allocates up to three effort among 1-3 unique
  catalog IDs. Target, reach, reserve, and effort legality are checked locally.
- Forage moves up to two soil nutrients per effort into a colony reserve.
  Shared deposits resolve in published, rotating colony priority.
- Share donates exactly one reserve per effort to a reachable allied patch's
  owner. A bridge extends access up to two hexes.
- Spread spends two reserve per bid, including failed bids. Highest effort
  wins; ties use seasonal priority. A bid must beat incumbent biomass plus
  defense. New patches start with one biomass.
- Defend prevents one dryness per effort at one owned patch, and adds the
  same amount to that patch's resistance to rival spread.
- After actions: rain, channels in placement order, drought, then upkeep in
  tile order. Channels move up to two water above the source's floor of two,
  plus one nutrient if any water flows. Soil and water each cap at 12.
- Shelters prevent two dryness. Every patch with one reserve and one water
  remaining consumes both, grows one biomass (cap three), and yields one
  spore. Otherwise it loses one biomass. Zero dies; a seedbank prevents one
  death at biomass one, then is consumed.
- Soil nutrients + colony reserves + unused compost + metabolized nutrients
  is invariant. Models never author resource deltas, scores, weather, or
  state. Water is intentionally external rain/evaporation, not conserved.

## Agent and replay boundary

`agent.ts` is DOM/CSS-free. `tool` strictly reconstructs a coordinated `Plan`
with season, three distinct colony decisions, public intentions, and bounded
allocations. The observation exposes every tile, current draft, forecast,
objective, budget, priority, and legal action ID. It is one coordinated native
tool request, not three unbounded independent API calls.

`GameSession` stores only the seed and validated season commands. Physical
edits are a separate local draft; the command contains **both** edits and the
accepted agent plan. Validation previews that exact command, and the shared
console revision-checks before synchronous dispatch. A failed, malformed,
cancelled, or stale request advances no season and spends no resources.
There is no offline agent substitute or eager model request. Camera and
selection do not change world revision. Restart/import cancel the console.

The shared notebook persists accepted commands, restores through the reducer,
and provides native replay import/export. Drafts are not persisted. Connection
keys are neither game state nor replay data. The common console owns connection
settings, cancellation, request/token limits, correction, and error reporting.

`smokeCase()` exports `{ request, verify }` for the opt-in serial real-model
suite. It represents season one with shelters staged on
the three founders, validates through the actual session reducer, commits
mechanical actions, and asserts season/resource application and conservation.
Ordinary automated tests use fixtures rather than a real endpoint.

## Source and development

`data.ts` defines campaign conditions and colony identities; `engine.ts` owns
pure legality and deterministic transitions; `agent.ts` the bounded tool;
`render.ts` the procedural SVG specimen; `index.ts` the page/lifecycle;
`style.css` scopes the warm paper-and-ink workspace.

Existing-runner tests live in `tests/agent-games/graft.spec.ts`. Browser turns
use `installAgentFixture` against the actual native-tool client, not a hidden
state shortcut. Full UI win and extinction campaigns accompany constraints,
competition, conservation, cancellation, malformed responses, persistence,
native replay, keyboard, and responsive coverage.

```sh
npm run build
npm test -- tests/agent-games/graft.spec.ts
```

Motion is a CSS-only vein shimmer; reduced motion keeps the entire specimen
and all controls available. The SVG and event listeners are disposed with the
page. Native dialogs isolate keyboard interaction.

The [connection guide](../../../docs/model-connections.md) explains supported
endpoints and the opt-in real-model suite. No sound or external artwork is
required; the model is contacted only for explicitly requested colony turns.
