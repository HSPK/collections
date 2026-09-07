# Accord

A six-season council game on an architectural survey of **Nacre**, a fictional
tidal city. Bone paper, municipal blue, and vermilion carry a live isometric
district plan and a river/wall section. There are no external media assets.

## Play

Open `/projects/accord/`, choose **Sheltered reach**, **Working estuary**, or
**Exposed coast**, then **Open the council**. This setup is entirely local.
Configure a tool-capable OpenAI-compatible endpoint with **Model**.

Allocate exactly twelve works across flood wall, turbines, cisterns and gardens,
at most six in a service. Release a work before moving it elsewhere. The resource
strip shows stored -> projected quantities, including the next hearing cost.
**City / Section** changes only the drawing. The six-season forecast is public.

**Call council** explicitly requests one coordinated, three-delegate model turn.
Each delegate has its own constituency, goals, knowledge context, legal vote
choices, trust, and legal counteroffers. The resulting votes are binding:
**two actual yes votes** permit **Enact policy**. A legal yes is never forced.
Opening a delegate seat shows its public statement, constraints, and offer budget.

Each successful hearing costs **2 crowns**, up to **3 hearings per season**.
There are **2 amendments**. Reopening the policy or accepting a counteroffer
spends an amendment and clears every vote. Each delegate has at most one
counteroffer per season: transfer 1-2 works between two services; at most two
offers per hearing. No final-hearing offers are legal. Offers must satisfy the
author's hard support constraints, but do not themselves enact or approve a policy.
The treasury must also be able to fund the current and follow-up hearing before
a draft can solicit counteroffers.
Counteroffer support is checked against the funds remaining after both paid
hearings, not just the treasury before the first one.

An optional pact pledges four works to a delegate's priority next season. A
matching yes delegate may promise reciprocal support. Honor the allocation and
otherwise-legal support to gain one trust and two cohesion. Breaking either
side costs two trust and three cohesion. Hard safety constraints excuse an
otherwise-promised vote. The unvoted emergency charter assesses only the player's
allocation promise. Trust is bounded 0-6; at 0-1, support also requires at least
four priority works. The last season allows no future pledge.

After rejection, **Emergency charter** previews an explicit constitutional
fallback: wall 4 / turbines 3 / cisterns 2 / gardens 3. **Enact emergency** commits
it, spending three extra crowns and fourteen cohesion instead of gaining two.
This is a local rule, not simulated delegate approval, and cannot be invoked
before a completed, rejected ballot. Repeated emergency rule is not sustainable.

**Next season** never calls a model. Win after six tides with at least **40 city
fabric and 30 cohesion**. Any unmet water/energy/food demand, zero fabric/cohesion,
negative treasury, or inability to fund the next two-crown hearing ends the
campaign. A good working-estuary opening is the default 3 / 3 / 2 / 4; build food
reserves early and raise the wall as the published tides increase.

## Authoritative simulation

`data.ts` owns the finite roles, authored weather, scenarios, and typed domain.
`engine.ts` owns all conservation, validation, phases, budgets, trust and endings.
No agent plan may contain weather, resources, scores, or arbitrary state fields.
All proposal totals and commands are validated again during replay.

| Account | Rule per season |
| --- | --- |
| Pressure | Tide + storm + scenario adjustment |
| Defence / flood | 4 + 2 * wall; flood = max(0, pressure - defence) |
| Water | Stored + rain + 2 * cisterns - 6 - flood |
| Energy | Stored + 3 * turbines - (5 + cisterns + ceil(wall/2) + cold) - flood |
| Food | Stored + 2 * gardens - 7 - 2 * flood |
| Treasury | Stored + 7 + floor(turbines/2) - 6 - 2 * flood - hearing/emergency costs |
| Fabric | -12 * flood, +2 if wall >= 4; bounded 0-100 |
| Cohesion | +2 adopted or -14 emergency, -5 * flood, -6 per unmet resource unit, then pact changes; bounded 0-100 |

Water, energy and food cap at 18, with excess explicitly recorded as
spill/curtailment/surplus. Negative raw quantities are unmet demand, not silently
clamped success. Minutes records every before/after account, exact flows, actual
votes, public statements, and trust changes. Flooding can be approved by Reed
and Moss if their constituencies' constraints are met; that can still destroy
the city. Similarly, Vale and Moss can approve an energy-failing policy.

The seed identifies the replay and varies the initial city drawing. Weather is
authored and deterministic by scenario, not randomly generated or model-owned.
To extend the game, update finite data, the reducer/parser, published forecast
and rules, then scenario and browser tests together. Keep tools small and pure.

## Lifecycle, controls and limits

`index.ts` mounts a standalone `createProjectPage(context, 'accord')` workspace.
`render.ts` draws the architectural board and escaped public record. CSS is
project-scoped. Tab/Enter operate buttons and native dialogs; arrow keys adjust
focused allocation sliders. There are no global game shortcuts. Reduced motion
stops continuous flow but preserves all live planning feedback. Long rules and
minutes use native dialogs; the policy desk is a bounded scrolling pane.

The shared `GameSession` previews a plan during validation and dispatches only
on successful completion under the mandatory revision guard. Pending turns
disable policy edits. View changes do not change the game revision. Cancel,
New, restart, import and unmount invalidate pending responses. Errors leave
both the previous draft and hearing budget intact. There are no automatic model
loops, eager API requests, offline delegates, or production fixture imports.

The shared notebook automatically saves accepted moves and restores them on
mount. **Save** provides native export/import; invalid imports leave the current
campaign unchanged. Replays reconstruct every move rather than trusting a saved
state. Import/reload do not contact a model. Export before **New** or **Restart
this campaign** if you want to preserve the old local save.

A user-supplied tool model and browser-compatible endpoint are required for a
hearing. Each turn has at most two requests, 1,536 completion tokens per request,
and a 60-second deadline, including one illegal-plan correction. Provider costs,
CORS, quotas and model reliability remain external constraints. Ordinary
automated tests use fixtures; real-model integration is a separate opt-in step.

## Development and model integration

```sh
npm run build
npm test -- tests/agent-games/accord.spec.ts
```

`agent.ts` is DOM/CSS-free and exports:

```ts
smokeCase(): {
  request: AgentRequest<Plan>;
  verify(plan: Plan): void;
}
```

This is the real initial working-estuary request. Its validator runs the pure
reducer. `verify` requires a mechanically advanced ballot, three actual votes,
and exactly the legal hearing cost, without advancing the river. A valid
rejection is a successful smoke turn, not a fake majority.
The [connection guide](../../../docs/model-connections.md) describes the
explicit real-model command, gateway, and browser connection requirements.

The targeted existing-runner suite uses `installAgentFixture` to route actual
native client/tool calls. It covers all three winnable scenarios, conservation,
budgets, hard votes, meaningful offers/pacts, complete browser victory and
flood/resource/rejection defeats, invalid and network responses, late response
cancellation, reset/export/import/reload, keyboard controls and both 320x640 and
768x480 layouts. Fixtures never override hidden game state to manufacture a win.
