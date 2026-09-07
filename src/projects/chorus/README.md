# Chorus

A first-contact instrument, not a conversation panel. A real tool-capable model
chooses lessons, translation challenges, requests and bargaining responses.
The local chamber turns those intentions into the same language the player uses.
No model call occurs on mount, restore, draft editing, or hypothesis testing.
There is no offline counterpart.

## Language

| Feature | Invariant |
| --- | --- |
| Ring / ultramarine | Well |
| Fork / coral | Reed |
| Knot / gold | Crown |
| First, second glyph | Speaking body, addressed body |
| One to three held intervals | Quantity of pulses |
| Joined relative phase | First body offers pulses **to** second |
| Alternating relative phase | First body asks for pulses **from** second |

An equivalent answer to an ask reverses the glyph order, preserves duration,
and joins the phase. Identity colors never vary with the model, and geometry
is shared between the received signal, sculptures and composer. Color is
redundant. Static phase marks, pulse bars, accessible signal descriptions and
14px readouts preserve the entire channel without motion or audio.

## Campaign

Two echoes calibrate the channel. The second teaching lesson introduces the
missing third body. Two translations establish reciprocal meaning. Then repair
the common beacon by balancing three reservoirs to four pulses each.

Three seed-selected tides rotate initial reserves (8, 3, 1) and counterpart
temperaments. A legal transfer moves one or two surplus pulses into a deficit.
Matching the counterpart's request effects a transfer under local rules. A
different feasible offer lets the model accept the actual transfer or counter
with a different request. An alternating player signal asks for renegotiation
without spending trust. Teaching and contrast gestures change the next signal;
contrast also exposes the preceding example in the field and evidence notebook.

There are 18 bandwidth intervals and up to six trust. Each accepted model turn
costs one interval. Incorrect echoes/translations and impossible offers cost one
trust. Show again spends bandwidth only. Testing observed glyph hypotheses and
undoing composition are free. Victory is exact reservoir equality, including
on the last interval; zero trust or exhausted bandwidth otherwise ends contact.
Strong and fragile accords, a trust rift and bandwidth silence are distinct
endings. Restart repeats a seed; New tide advances the authored profile.

## Controls and lifecycle

Pick a slot and then a glyph, or pick a sculpture in the chamber. Choose pulse
length and relative phase; Swap reverses order. Undo is a bounded 80-edit local
draft history, not a rollback of accepted world moves. Clear empties the rail.
Keyboard: 1/2/3 pick glyphs, arrows select a slot, +/- adjust length, Space
changes phase, X swaps, Backspace erases the selected slot, Ctrl/Cmd+Z undoes,
Enter sends when a native button does not own Enter. Dialogs and text inputs
isolate these shortcuts.

Lexicon contains free semantic hypotheses, witnessed examples, grammar and
the contact record. Guide and model settings are native dialogs. Save uses
the shared GameNotebook for automatic local replay persistence and native
export/import. Imports replay validated commands into a draft before replacing
the session. Sound is off by default; AudioContext is created only on consent.
Loops, ResizeObserver, event listeners, oscillators and audio are disposed.

## Boundaries

- `data.ts`: fixed vocabulary, shared encoding/decoding, three encounter profiles.
- `engine.ts`: pure GameSession reducer, strict command parsers, legal intentions,
  staged input evaluation, resource conservation, endings and replay authority.
- `agent.ts`: DOM-free exact-key tool parser, bounded public observation and
  role instructions. The model receives its exact legal action objects.
- `render.ts`: kinetic SVG chamber and repeated canonical glyph geometry.
- `index.ts`: lifecycle, undoable instrument, model console and notebook wiring.
- `style.css`: scoped, one-viewport layout with compact visual readouts.

The only model plan fields are intention, two allowlisted bodies, a bounded
quantity and phase. No arbitrary dialogue, URLs, executable content, hidden
reasoning or scores are accepted. A model cannot declare victory. Validation
previews the exact exchange; the shared console checks a mandatory revision
gate immediately before synchronous dispatch. World costs wait until the
complete model-backed exchange is valid. Draft/selection/dialog actions do
not change revision. Reset, new tide and replay import cancel pending ownership.

Each turn uses the foundation limit: at most two requests, 1,536 completion
tokens per request, one illegal-plan repair, and a 60-second total deadline.
Errors are explicit and never become a simulated response. Endpoint/model
configuration, CORS, tool support and provider availability remain prerequisites.

## Development and model integration

The Playwright suite is `tests/agent-games/chorus.spec.ts`. It uses
`tests/helpers/agent-fixtures.ts` and native tool responses intercepted at the
actual client. Full UI contact wins and resource losses are composed through
visible controls; fixtures never inject world state. Pure tests additionally
exercise grammar, replay rejection, conservation and all three profiles.

```sh
npm run build
npm test -- tests/agent-games/chorus.spec.ts
```

`smokeCase()` from `agent.ts` exports an `AgentRequest<Plan>` for the actual
opening counterpart turn and `verify(plan)` that dispatches that plan through
GameSession and requires one real demonstration with exactly one interval
debited. The [connection guide](../../../docs/model-connections.md) describes
the separate opt-in real-model suite. Ordinary automated workflows do not
contact a provider.
