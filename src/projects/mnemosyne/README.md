# Mnemosyne

An original two-chapter epistemic mystery for the municipal memory office of
Palimpsest. A stolen voice cylinder leads to a substituted flood register.
The town's beliefs can change; what happened cannot.

## Investigation

Begin the case, compare the public credential register in **Casebook**, and
select a witness by portrait or the **Witness** menu. **Interview** spends one
turn. **Reassure** also spends one influence, raising trust before the witness
chooses. Witnesses have three interviews each. They may share one registered
observation, withhold, offer their own registered alibi, change a relationship,
or relay something they know to a trusted contact.

**Route** carries a discovered claim from a witness who knows it to a connected
recipient. It costs one turn and one influence. The recipient chooses to
accept, doubt, or reject it. Acceptance raises their trust in the investigator.
An optional onward relay needs relationship trust of at least two. Receiving a
relevant claim can make a custodian locate a physical record.

**Claims** records provenance. Two distinct direct observers corroborate a
claim; repeated interviews, received beliefs, and forwarded messages do not
create additional independent observers. An inspected physical record is
independently authoritative. Public testimony is escaped flavor accompanying
the structured actions, never executable logic or an additional fact.

**Objects** offers both access paths:

- A disclosed observation locates its physical exhibit: inspect for one turn.
- Without cooperation, commission a warrant: three turns and two influence.

The three critical warrants cost nine turns and six influence out of a
14-turn/eight-influence chapter. No witness can destroy or permanently seal
them. The ribbon is contextual evidence that refutes a tempting rumor, not a
shortcut to a conviction. Spending resources on every option is not a strategy.
Known objects, records, source graphs, credential registers, and selections
can be revisited without spending time.

Pin claims to the **Evidence graph**. At the **Final hearing**, link three
distinct pinned claims to identity, entry, and time, choose a suspect, route,
and corrected minute, and write the connective reasoning. Local rules require
corroborated, role-correct claims supporting the suspect and the exact seeded
route/time. Prose is archived, not semantically scored. A wrong accusation
ends the chapter in a loss. At zero turns, an incomplete record loses; a fully
corroborated record grants a final opportunity to pin and file.

A supported first verdict unlocks chapter II with fresh resources, changed
responsibility, changed timing, and a different physical mechanism. Completing
both returns the town's public memory. **Restart** replays the same seed;
**New seeded case** changes the objective arrangement.

## Controls, layout, and persistence

Everything is available through native buttons and labeled menus. Outside
forms and modal dialogs, **1–5** selects a witness, **E** changes diagram,
**N** opens records, and **?** opens the guide. The map's gentle perspective
responds to a mouse; system reduced motion disables perspective movement and
thread animation. No sound or external image/font resources are used.

The workspace is a bounded `100dvh` grid. The network and primary actions stay
together. Desktop has a marginal notebook; narrow screens use the same notebook
inside a bounded native dialog. Long testimony, evidence, and help scroll
inside their own panes. The bottom-right area stays clear of the collection
control.

The shared game notebook automatically saves accepted commands and restores
them without contacting a model. **Save** exports/imports a seed-plus-command
replay, not a trusted state blob or connection settings. Restore is atomic:
every command must pass current rules before replacement. Restart intent,
import, next chapter, and teardown cancel pending model ownership.

## Source boundaries

| File | Responsibility |
| --- | --- |
| `data.ts` | Editable chapter fiction, witness goals, partial knowledge, seeded credentials, timeline, artifacts and authoritative constraints |
| `engine.ts` | Pure resources, phases, knowledge/trust gates, source provenance, message propagation, exact command parsing and deterministic verdicts |
| `agent.ts` | Pure tool schema/parser, bounded witness observation, role prompt and `smokeCase()` |
| `render.ts` | Original procedural engraved portraits/contact prints, network/source diagrams, notebook, dialogs and keyboard controls |
| `index.ts` | Shared console, mandatory revision guard, preview/commit, session and notebook lifecycle |
| `style.css` | Scoped archive-noir typography, ivory/ink/rust/gold surfaces, perspective and reduced-motion layouts |

The case seed rotates responsibility and public credentials. The chapter
changes the entry mechanism and corrected minute. No global mutable RNG, model
truth flags, hidden state blob, or verdict supplied by an endpoint is trusted.
Observation payloads contain only that witness's observations, alibi, known
beliefs, legal choices, contact budgets, and short prior public testimony.
They exclude the culprit and truth labels.

There is no chat substitute, offline witness simulator, new dependency, or
production test fixture. Interviews and routed messages use the shared native
tool client: at most two requests of 1,536 completion tokens within a 60-second
deadline, including one correction. Invalid, failed, stale, and cancelled
responses do not spend game resources. Physical warrants are explicit player
actions rather than fabricated API responses.

## Development and model integration

`tests/agent-games/mnemosyne.spec.ts` uses the repository's Playwright runner
and real native-tool client interception. It includes pure Node-side engine
cases over both chapters and multiple seeds, and browser workflows for a full
two-chapter victory, wrong accusation, exhausted leads, provenance and evidence
legality, bounded correction, HTTP failure, late cancelled response, escaped
testimony, export/import/reload, keyboard controls and 320×640 / 768×480 /
desktop layouts.

```sh
npm run build
npm test -- tests/agent-games/mnemosyne.spec.ts
```

No real endpoint is contacted by the fixture suite.

`smokeCase()` in pure `agent.ts` returns `{ request, verify }`. `request` is
the actual opening Ivo interview on seed 74, including the real tool and reducer
preview. After the opt-in real-model suite runs that request, `verify(plan)` commits
it to the actual session and checks time/influence, sourced disclosure or
withholding, chosen relay propagation, the accepted transcript, and unchanged
authoritative responsibility. Withholding is a valid mechanical result, not a
smoke failure. The [connection guide](../../../docs/model-connections.md)
documents the separate, serial real-model command and its provider costs.
