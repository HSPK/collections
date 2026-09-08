# Bounded game agents

These modules provide transport and lifecycle, not a shared game template.
Each project owns its pure rules, state, renderer, campaign, and visual language.

## Turn contract

```ts
const agent = createAgentConsole(page, { gameId: 'my-game', host });
const tool = defineTool({
  name: 'choose_route',
  description: 'Choose one legal route.',
  parameters: schema.object({ route: schema.enum(['north', 'east']), intention: schema.string() }),
  parse(value) {
    const item = object(value, ['route', 'intention']);
    return {
      route: choice(item.route, ['north', 'east'] as const, 'Route'),
      intention: text(item.intention, 'Intention', 160),
    };
  },
  summarize: plan => plan.intention,
});
await agent.turn({
  label: 'The navigator',
  system: 'Your original fictional role and explicit game rules.',
  observation: publicObservation(session.state),
  tool,
  validate: plan => { session.preview({ type: 'agent-plan', plan }); },
  getRevision: () => session.revision,
  commit: plan => { session.dispatch({ type: 'agent-plan', plan }); },
});
```

Both `createAgentConsole(page, { gameId, host, locale?, onBusyChange? })` and
`createGameNotebook(page, { gameId, session, trigger, beforeRestore, afterRestore,
onNotice?, locale? })` accept `locale: 'en' | 'zh-CN'`, defaulting to `'en'`.
Pass `locale: 'zh-CN'` to both for Chinese connection settings, public action-log
controls, turn notices, and replay controls. This only changes shared UI copy,
not model prompts, connection preferences, replay formats, or request limits.
Game-authored labels, plans, custom cancellation messages, and notebook notices
remain verbatim text; author those in the game's language. Chinese error summaries
retain original validator/provider-client diagnostics as labelled technical detail.
The operating system's file picker follows the user's system language.

`turn` returns whether a plan committed. Configuration, network, protocol,
timeout, and rule errors are reported explicitly. A bad plan gets one
tool-feedback correction, never an offline substitute. Unknown programming
errors still propagate. Each call sends one bounded observation and can make
at most two requests of 1,536 completion tokens within a 60-second turn deadline.
Only public intentions and accepted actions enter the action log.

Use a typed `AgentTool<Plan>` in a project-owned `agent.ts`; keep it importable
without DOM or CSS by importing `agents/schema`, not the UI barrel. Include
legal entity IDs, action choices, and budgets in observations. Parse exact
objects, bounded arrays, enums, numbers, and text. Rebuild the accepted typed
plan; never spread model objects into state. Use `requireRule` for game legality.
No tool may run code, fetch arbitrary URLs, access files, or decide its own score.

`getRevision` is mandatory. The console checks it again immediately before a
synchronous commit. `agent.cancel()` also invalidates ownership; call it on
restart, import, and explicit new-world intents. Camera/selection-only edits
should not change the world revision. Disable conflicting actions while a
turn runs, and use `onBusyChange` if a view needs to update its controls.
Never modify the world speculatively before an API-backed transition succeeds.
An optional synchronous `preflight` on the console options checks local
capacity before any request. RPGs use it to reserve replay space with
`session.assertCanDispatch(32768)`; validation failures are reported normally
without contacting a model. `GameSession.preview` also applies every
count/size constraint used by the eventual commit.

## Replay and lifecycle

`core/games/session.ts` provides `GameSession<State, Command>` with `create`,
`reduce`, and `parseCommand` supplied by the game. Reducers are pure and enforce
phases, entity IDs, budgets, and endings for player and agent commands alike.
`preview` stages a transition, `dispatch` commits one, and `revision` is
monotonic across reset and restore. Replays store a seed and validated commands,
not a trusted state blob. Import replays into a draft and commit atomically.

`createGameNotebook(page, { gameId, session, trigger, beforeRestore,
afterRestore, onNotice })` restores an existing valid local replay on mount,
saves later moves, and supplies a native export/import dialog. Instantiate it
after all renderer and console references exist. `beforeRestore` cancels an
agent request, `afterRestore` redraws, and `onNotice` can surface storage issues
in the game's own status. A restored campaign never calls a model by itself.
Call `session.subscribe(render)` and register its returned cleanup with the page.

Each page still needs an always-visible `h1`, a `data-workspace="true"` root,
primary actions beside its scene, and usable 320px/short-landscape layouts.
Guard document-level shortcuts with `event.target` and `dialog:modal` checks.
Use text nodes or `escapeMarkup` for model-authored dialogue. Dispose observers,
renderers, animation loops, and sound with `page.onCleanup`.

## Connection and privacy

The console does not request a model on mount. On loopback pages it suggests
the same-origin `/api/openai/v1` gateway and the verified local GPT-4.1 mini
model ID. On public pages it requires an endpoint to be configured explicitly.
Use Fetch models to discover your own server's IDs; not every listed model
supports function tools. The endpoint must be HTTPS or loopback HTTP.

Endpoint and model preferences are the only persisted connection values.
Optional keys live only in memory and never transfer to a different endpoint.
Server-side keys are preferable. GitHub Pages has no backend: users need their
own browser-compatible endpoint or the repository's local game server.
Provider CORS, HTTPS/local-network restrictions, quotas, and billing still apply.

## Existing-runner fixtures

`tests/helpers/agent-fixtures.ts` intercepts the real client with native
OpenAI-compatible responses. `installAgentFixture(page, decide)` supplies the
request's tool name and parsed observation and accepts a deterministic plan.
This helper is test-only; production must never import it or silently simulate
an unavailable agent. Cover complete victories, losses, resource constraints,
correction/failure, cancellation, replay, keyboard, and responsive workflows.
Real local-model smoke turns are run separately and serially by the release owner.
