# Mise

An original kitchen/service campaign at **The Little Copper**. The player
arranges a miniature bistro and controls its pace; a connected model coordinates
three fictional staff through bounded, simultaneous task reservations. The
simulation is local and deterministic. No recipe or timing is real food-safety
advice.

## Play

- **Kitchen / prep:** before each sitting choose two prep boards / one pass,
  or one prep board / two pass slots. Prepare up to three forecast components
  from actual pantry stock.
- **Ticket rail:** every ticket displays arrival, deadline and dependency
  progress. Open a ticket to inspect ingredients, heat targets and burning
  thresholds, or pin it as the crew's priority.
- **Priority:** Balanced uses Nell's one-beat prep and Ivo's one-beat plating;
  other staff take two beats. Rush makes both jobs one beat at lower quality.
  Craft makes both two beats at higher quality. Sol adds cooking quality.
- **Hob controls:** Off / Low / Steady / High adds 0 / 1 / 2 / 3 heat per pulse.
  `!` identifies ready food. Turn ready hobs off to buy plating time.
  High heat costs quality; food burns at its target plus four heat.
- **Open service**, then **Call crew / 1 beat:** one successful model plan
  advances the simulation by one beat. There is no real-time deadline.
  **Hold crew +1** explicitly advances existing jobs and heat without new
  assignments or a model request. It is not a failure fallback.
- **Space** opens service or calls the crew, **K** opens kitchen tools, and
  **?** opens the guide, unless a modal or form control owns focus.
  Every shortcut has a visible button. **Still life** stops decorative motion.

Serve at least 3 / 3 / 4 dishes across three sittings, with average quality at
least 62 each. Two missed tables over the entire campaign or room satisfaction
below 45 ends service. All 12 dishes can be served with no waste. Deadlines
include the serving beat. The final ledger scores quality and earliness, with
penalties for waste and missed tables. The last sitting ends the campaign;
restart creates a clean kitchen.
An unresolved ticket expires at the end of its deadline beat, immediately
releasing its pass, pans and unfinished staff jobs.

## Implementation

- `data.ts`: recipes, role objectives, ingredients and complete demand forecasts.
- `engine.ts`: pure state, command parser and reducer used by `GameSession`.
  Prep consumes stock on reservation. Cold prep finishes ready; hot prep must
  pass through a hob. Cooking is unattended after loading. Plating requires
  every component ready, removes pans from heat, and reserves a pass. Serving
  is a later action. Each staff member, target and station can be reserved only
  once per pulse. All assignments use the pre-pulse state, so outputs cannot
  satisfy other assignments in the same plan. Rejected commands are atomic.
- `agent.ts`: DOM/CSS-free native tool, public observation and `smokeCase()`.
  Plans contain exactly three `{ staff, taskId }` assignments plus a bounded
  public intention. Per-staff catalogs supply legal IDs, stations and durations;
  observations include recipes, roles, deadlines, stock and player decisions.
  There is no JavaScript, URL, readiness or scoring tool.
- `render.ts`: original procedural isometric Canvas 2D kitchen, enamel cabinets,
  wood cutting boards, steel pass, copper pans, plated components, steam,
  distinct staff silhouettes, working motions and a service conveyor.
  The renderer never changes game state. Core canvas/loop helpers own sizing
  and animation; cleanup disposes both.
- `index.ts` / `style.css`: independent English one-viewport workspace.
  Native bounded dialogs contain recipes, prep, guide, notebook and final
  ledger. The bottom-right collection control has reserved space.

The shared agent console imposes at most two requests, 1,536 completion tokens
per request, and a 60-second turn deadline. One invalid plan may be corrected.
Network failures, invalid plans, cancellation and stale responses spend no
game clock, ingredients or actions. All model transitions run through
`session.preview` before a revision-gated synchronous `session.dispatch`.
World controls are disabled during requests; restart, import and next-sitting
intents cancel pending work. Selection and motion controls do not revise the
world. No model requests occur on mount, restore or animation. No production
offline staff policy exists.

Notebook automatically persists seed plus validated commands, never a trusted
state blob or API keys. Export/import replays every move atomically; reload
does not contact a model. Exported public intentions are text, never markup.
The seed is retained for replay identity; campaign forecasts are deliberately
fixed so deadlines are learnable.

## Development and extension notes

Existing Playwright only; no additional packages. Native real-client fixtures
are confined to `tests/agent-games/mise.spec.ts`. Its policy chooses from the
public observation, while the legitimate UI campaign uses actual player prep,
heat changes and service buttons. It also covers missed-service loss, distinct
plans, resource/dependency conflicts, correction, network failure, cancellation,
restart/import invalidation, replay, keyboard and three viewport sizes.

```sh
npm run build
npm test -- tests/agent-games/mise.spec.ts
```

`smokeCase()` returns `{ request: AgentRequest<Plan>, verify(plan): void }` from
a genuine, unprepared first-service state. Its validation previews the actual
reducer; verification dispatches the result and requires exactly one beat,
real stock consumption and dependency progress. The opt-in real-model suite
runs separately; ordinary tests make no provider calls. See the
[connection guide](../../../docs/model-connections.md).

To add a recipe, define its finite stock and heat dependency in `data.ts`, then
include it in a forecast and validate the complete campaign's throughput.
Do not infer completion from model prose or accept serialized state directly.
New command types must be parsed and phase-checked by the same reducer used
for replay. Changes to public catalogs belong in `engine.ts`, not a UI-only
availability check. Regenerate the actual site preview when changing its visuals.
