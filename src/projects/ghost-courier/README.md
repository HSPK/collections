# Ghost Courier

An original nocturnal courier heist, told through a cut-away isometric clockwork city. A real model plays the Brass Warden; it is not a narrative overlay. No model request is made on mount, during surveys, or when restoring a replay. Playing the campaign requires an OpenAI-compatible connection with native function tools. There is no simulated production fallback, audio, or bundled credential.

## Clock rules

The player traverses the explicit undirected graph in `data.ts`. A move, wait, or delivery costs one beat. Walking onto Vault automatically picks up the stolen parcel. Deliver at Dead letter to finish a case; all three cases must be completed to win.

Needle and Rivet follow two distinct named circuits chosen by the model. Each assignment has a starting offset, and each guard advances one circuit step per local action. Matching the player's destination or swapping ends of an edge adds two alarm. Alarm at its limit seals the loop before a delivery can count. A safe delivery at the final beat succeeds.

Each successful rewind resets position, parcel, alarm and clock, spends a loop, and records the prior path as an echo. Echoes replay exact beat positions and hold their final address. Only the latest two recordings remain. An occupied switch opens its shutter at the **departure beat**. Each guard can also be distracted once per loop: an echo at its next address on the next beat makes it pause one beat. The forecast includes that pause.

At the loop's beat/alarm limit, local actions stop. A sealed loop can rewind if another loop remains; otherwise the campaign is lost. A rejected, cancelled, or stale plan changes neither resources nor recordings. New heists also wait for a successful model plan before changing districts.

## Three editable cases

- **Bellfoundry / The borrowed minute:** record Dock, Steps, Fork, Relay; rewind and cross Bridge to Vault, Gantry, Dead letter.
- **Pendulum Stacks / The unwritten names:** reach Relay via Steps and Landing. The next loop needs a wait at Fork before the echo arrives and opens two shutters.
- **Zero-Hour Press / An hour for everyone:** anchor Relay on the first recording and Brake via Balcony on the second. The final run needs both echoes to open consecutive shutters.

The Cases dialog exposes each case's beat budget (16-32), alarm limit (4-8), and loop budget (3-4) before campaign start. Applying edits cancels pending plans and records a validated setup command. Survey selection does not change world revision or campaign order.

For authored extensions, edit `CASES` in `data.ts`: coordinates control only the drawing; explicit edges control movement. Keep every patrol circuit cyclically adjacent, avoid spawning guards at Dock, and supply two different circuits per plan. Every current circuit has three addresses and the tool allows offsets 0-2. Changing that length requires updating the parser/schema bounds. New IDs must be declared in `NODE_IDS` / `CIRCUIT_IDS`; no model-generated paths are accepted. Replays are revalidated under current rules rather than trusting stored state.

## Controls and ownership

Named exit buttons provide touch, mouse, and keyboard access. Map picking selects an address; Move here takes a legal adjacent edge. Arrows choose a connected direction in screen space; keys 1-5 take the listed exits; W waits, D delivers, R rewinds. Shortcuts do not run in native dialogs or text controls. Labels and selection never affect model ownership.

The shared agent console owns connection configuration, two-request correction bounds, cancellation and revision checks. `agent.ts` exports a pure strict native tool, bounded observation, and `smokeCase(): { request: AgentRequest<Plan>; verify(plan: Plan): void }`. Its realistic opening request must start a playable loop without charging a move; verification also executes a local beat and checks that the selected guards actually advance. The [connection guide](../../../docs/model-connections.md) documents the separate opt-in real-model suite.

`engine.ts` is authoritative and pure. `GameSession` validates and atomically replays every command. `createGameNotebook` supplies automatic local persistence and native export/import, with no model call on replay. `render.ts` uses shared Canvas2D sizing, seeded math and animation lifecycle helpers; reduced motion remains responsive via explicit redraws.

## Development

Use the repository's existing tools only:

```sh
npm run build
npm test -- tests/agent-games/ghost-courier.spec.ts
```

The spec covers pure legality and replay atomicity, model-selected mechanical changes, recorded observations, native correction, failed rewind atomicity, cancellation, campaign victory and loss, notebook import/export, case editing, keyboard guards, and 320x640 / 768x480 layouts. Production-facing URLs are used, and only the test fixture intercepts native model responses.
