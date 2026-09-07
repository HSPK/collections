# Chain Reaction — The Bloom Machine

An original, silent SVG causal-machine illustration. This is an **illustrative,
hand-authored timeline**, not a rigid-body physics simulator or an engineering
model. One twelve-second clock drives every moving part, including the flower.

## Modules

- `data.ts`: stage copy, inspection times, dimensions, playback speeds, and two
  authored layouts. The narrow layout keeps the domino hand-off above the wheel
  rather than shrinking an entire landscape drawing into a phone.
- `timeline.ts`: pure `stateAt(seconds)`, cue times, and layout-aware marble and
  lever poses. Negative/late times clamp to the endpoints; non-finite input is
  rejected. It has no browser dependencies, random values, or simulation state.
- `scene.ts`: original SVG construction and state-to-attribute rendering. Each
  mount gets unique SVG resource IDs. A media query changes framing without
  changing the clock. The scene owns no animation loop.
- `index.ts`: page lifecycle, the single `createLoop`, transport, stage inspection,
  accessible feedback, and reduced-motion changes.
- `style.css`: styles scoped to `.project-chain-reaction`; there are no CSS
  animations or transitions running independently of the timeline.

## Extending the choreography

The marble's final centre meets the first upright domino face. Domino start
times are spaced at the authored contact delay; the contact angle is derived
from the tile height, width, and spacing. The last tile's upper corner sets the
level lever paddle's height. That lifts the opposite end and retracts the pin
through the two lower cord guides. Keep the wheel start **after** full release.

The wheel makes half a clockwise turn. Its drum unwinds the copper counterweight,
while a circular eccentric cam lifts a vertically constrained roller. The roller
position is solved from circle tangency, not approximated by an unrelated sine
wave. The last part of that lift fans open eight petals. The final pose is held
until the clock reaches twelve seconds, then playback stops.

To add a stage, extend `StageId`, `STAGES`, and `STAGE_CUES`; add its pure state to
`stateAt`, and render it in both layouts. Keep inspection times inside their stage.
Changing geometry may require retiming the corresponding contact. Do not add
frame-history simulation, random motion, timers, CSS animation, or sound.

## Interaction and lifecycle

Play/pause, replay, native timeline scrubbing, and four playback speeds all use
the same time value. Seeking or inspecting a stage pauses immediately. Speed
changes only clock advancement, never the authored pose. Space toggles playback
when the project is focused, but never overrides native interactive controls.

Reduced motion starts at the fully armed, paused initial pose. Any preference
change pauses at the current time; removing the preference does not autoplay.
Explicit Play or Replay is still available. All event listeners use the page
signal. `page.onCleanup` disposes the loop and scene; external abort and repeated
`destroy()` calls are safe. SVG scales natively and needs no resize observer,
canvas, external assets, or network requests.

## One-screen workspace

The root declares `data-workspace="true"` and uses a `100dvh` grid. Its SVG
receives the remaining height between the identity and playback dock; the
entire drawing remains in its viewBox without changing the timeline geometry.
The authored narrow composition still switches at 680px. Transport, the native
scrubber, and speed never scroll away from the machine. Motion-preference changes
pause and announce through the project status without covering transport with a
collection toast; the action dock leaves the menu's corner clear.

**Inspect stages** opens the native “Follow the hand-off” dialog with all five
stage buttons, causal explanations, and the current stage detail.
**Behind the motion** opens choreography, keyboard help, feedback, and credits.
Only these secondary dialogs scroll. Escape/Close returns focus to the opener;
closing a dialog does not reset time or speed. Reduced-motion state stays in the
main dock. Dialogs use the project’s green paper palette.

## Targeted validation

```sh
SITE_URL=http://127.0.0.1:4173/ flock /home/hangxingwei/.copilot/session-state/23f8825b-223c-4cb6-95ec-3e7881d9e65f/files/viewport-browser.lock npm test -- tests/series/chain-reaction.spec.ts --reporter=dot
```

Tests cover timeline endpoints, causal contact order, cam tangency, reverse
determinism, real transport and keyboard controls, reduced-motion changes,
375px layout, and cancellation of frames/listeners on external abort. Workspace
checks cover 1440×900, 1280×720, 375×812, 320×640, and 768×480: no document scroll,
real flower/wheel responses, playback, modal focus return, and per-test screenshots.
