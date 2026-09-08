# Shared RPG mechanics

RPGs retain independent worlds, rules, renderers and campaign structures.
These small pure helpers prevent economy/progression bugs without imposing
one game template or trusting a model to award resources.
Chinese RPGs declare `language: "zh-CN"` in their manifest and pass
`locale: "zh-CN"` to the shared agent console and game notebook. Keep all
player-facing narrative, names, skills, quest text and role prompts Chinese;
internal IDs remain stable ASCII identifiers.

## Inventory

```ts
const ITEMS = ['tonic', 'ore', 'charm'] as const;
const bag = createInventory(ITEMS, [{ item: 'ore', amount: 3 }]);
const crafted = exchangeInventory(bag, {
  spend: [{ item: 'ore', amount: 2 }],
  gain: [{ item: 'charm', amount: 1 }],
}, { capacity: 20, stackLimit: 9 });
```

Import from `core/rpg/inventory`. All operations are immutable and validate
IDs, integer quantities, duplicate costs, stack limits and final capacity.
Costs must be available before rewards, even when both mention the same item.
Keep quest reward claims, equipment restrictions, currency and recipe rules
in the game's authoritative reducer. A model chooses actions; it never
supplies arbitrary loot, experience, damage or quest completion.

## Progression

`progression(xp, thresholds)` returns the current one-based level and next
threshold. `gainExperience(xp, amount, thresholds)` also returns earned levels,
including multiple levels from one reward. Curves start at zero and strictly
increase. Experience beyond the last level remains recorded, without
inventing extra levels. Import from `core/rpg/progression`.

## Agent, campaign and replay contracts

Reuse `core/agents` and `core/games/session` / `notebook` for model access,
bounded native tools, cancellation, revision ownership and validated replay.
Read the [agent guide](../agents/README.md) before wiring a game.
Keep DOM-free agent definitions in each project's `agent.ts`, with a
`smokeCase()` exposing `{ request, verify }` for a real opening agent action.

A complete RPG needs original character identities and goals, inspectable
growth/build choices, meaningful inventory or equipment, a quest journal,
story prerequisites, finite progression through several acts, failure
recovery, distinct endings, and restart. Capture all mechanically relevant
player/agent actions as validated commands. Reward a quest at most once.
Saved state is not trusted; every command must replay legally.
Give the model console a `preflight: () => session.assertCanDispatch(32768)`
callback. This refuses paid calls when no command slot remains and reserves
32,768 UTF-16 code units for the bounded tool arguments plus the RPG command envelope.
`preview` and `dispatch` enforce the same replay limits; commit-time errors
remain explicit. The reservation is deliberately conservative near a full
save, so export and restart before reaching that boundary.

Keep full playthroughs comfortably within the existing 600-command replay
budget. Do not record camera motion, tab changes, inspections or dialogue
reading as world moves. No request may start on page load, and failed model
turns must not spend a player's resource, change a quest or grant a reward.
Long stories belong in bounded reading panes or native dialogs beside the
scene, not a vertically scrolling interaction page. Put the visible `h1`
and `data-workspace="true"` on the persistent project shell.
