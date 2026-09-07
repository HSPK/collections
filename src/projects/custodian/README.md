# Nothing to Declare

An original, model-required customs investigation at Port 73. The player is the
officer; six distinct merchants choose their own hidden consignments, misleading
or truthful declarations, and bounded negotiation terms.

## Playing a shift

Open Model to configure a tool-capable OpenAI-compatible endpoint. **Call
traveller** makes the first explicit request. Nothing calls a model on mount,
reload, document selection, replay import, or a player inspection. No offline
merchant is supplied. Each arrival and optional negotiation is one bounded
decision, with at most one illegal-plan correction supplied by the shared client.

Read the loose declaration, click the regulations booklet, or open **File**.
Desktop has a bounded side dossier; smaller screens use its native modal.
**Scale**, **Thermal**, **Registry**, **Seal**, and **Scan** are independent evidence
channels. Seal magnifies the actual container mark. The spectral slider, arrow
keys, or **Full sweep** expose procedural cargo signatures from the paid scan.
The comparison section narrows possible consignments using measured evidence,
the public sourcing docket, and certified identities, never merchant assertions.

**Parley** offers one merchant-driven negotiation per traveller:

- A merchant may offer a 2-4 credit quarantine bond from its remaining wallet.
  Accepting binds Quarantine; payment offsets its fee only when stamped.
- A merchant may sell one or two authentic cargo IDs for 1-3 credits. Price and
  disclosure count are visible before acceptance, identities afterwards.
- Either request may be refused. Testimony is always unverified. A valid response
  costs one minute; a rejected, failed, or cancelled plan costs nothing.

Apply **Admit**, **Quarantine**, or **Return**. The local audit exposes the actual
cargo and rule-based result. Call the next traveller explicitly. Habitat rules
start at traveller 3, cold-chain and heavy-load rules at traveller 5.

The shift starts with 36 minutes, 14 credits, 3 scanner charges, and 6 trust.
Ordinary readings cost one minute; scanning costs two and one charge; refill
costs four credits and one minute. Quarantine costs two credits. Stamping and
arrivals are free, so zero inspection time cannot strand the game.
Correct rulings earn 20 points; errors lose 12. Wrong admissions lose 3 trust,
wrong returns 2, and wrong quarantines 1. All six travellers are processed even
if trust reaches zero. Five correct rulings and positive trust win; retained
credits and minutes add to the final score.

Keyboard: W scale, T thermal, L registry, M seal, X scan, D file, R rules.
Shortcuts are isolated from dialogs and form controls. Stamps intentionally have
no single-key shortcuts. All scene targets are also keyboard/touch buttons.
**Help** includes the full procedure. **Restart** cancels pending work and asks
before discarding the saved shift.

## Architecture and extension

- `data.ts`: editable cargo catalogue, packaging, six personalities and sourcing
  budgets, campaign constants, and regulation text.
- `engine.ts`: pure state transitions, strict replay parser, measurements,
  precedence-based adjudication, negotiation accounting, and merchant utility.
- `agent.ts`: pure tools, concise observations, and `smokeCase()`. It imports the
  schema, errors, and client types individually; no DOM, UI barrel, or CSS.
- `render.ts`: original procedural SVG portraits/parcels, scan geometry,
  evidence comparison, documents, and authored empty-desk brief.
- `index.ts`: scoped lifecycle, bounded model turns, scene controls, dialogs,
  shared `GameSession` and `createGameNotebook`; `style.css` is project-scoped.

To extend cargo, update the IDs, catalogue, glyph and merchant sourcing choices.
To add a regulation, update both the data reference and `adjudicate`, preserving
Return > Quarantine > Admit priority. Container costs are paid by merchants, not
the officer; container mass is part of gross mass. Stasis affects containment,
not thermometer readings. The registry is authored authority, independent of
the model's claimed licence. Replays rebuild state by validated commands, not a
trusted snapshot.

Notebook automatically restores/saves, exports and atomically imports replays.
Pending model ownership is cancelled before restore/reset. Replays include
hidden cargo and paid certifications to reproduce outcomes; they are not an
anti-cheat format. Credentials are never part of the replay.

## Development

```sh
npm run build
npm test -- tests/agent-games/custodian.spec.ts
```

The targeted Playwright suite intercepts the real native-tool client using the
shared fixture. It covers both six-traveller endings through legitimate UI moves,
resource limits, dishonest claims, forged tool payloads, negotiation, cancellation,
replay import/export, keyboard, and compact viewports. Pure rule assertions
supplement those workflows.

The opt-in real-model suite imports `smokeCase` from `./agent.ts`. It returns
`{ request: AgentRequest<ArrivalPlan>, verify(plan): void }` for one bounded real
model turn from the actual opening engine state. `verify` commits the selected
consignment and asserts a real charge-consuming scan. Local-model probes are
deliberately not run by this project's fixture suite. See the
[connection guide](../../../docs/model-connections.md) for explicit endpoint
configuration and the serial real-model command.
