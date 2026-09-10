# Phaser game production contract

This edition uses the exact stable `phaser@4.2.1` release. The engine is lazy
loaded only inside a project entry; the collection does not import it. Its
MIT notice is bundled under `public/third-party/phaser-LICENSE.txt`.

## One scene owner

```ts
const stage = await createPhaserStage(page, {
  host, label: '游戏画面', width: 960, height: 640,
  create(scene, runtime) {
    const token = scene.add.sprite(120, 100, 'original-local-texture');
    return {
      draw(state: State) { token.setPosition(state.x, state.y); },
      update(elapsedMs, deltaMs) { /* presentation or fixed-step simulation */ },
      pauseChanged(paused) { /* clear held input and accumulator */ },
      motionChanged(reduced) { /* remove cosmetic motion, not gameplay */ },
      destroy() { /* dispose resources outside Phaser */ },
    };
  },
});
stage.view.draw(session.state);
```

`scene` is a real Phaser Scene: use its GameObjects, Graphics, textures,
input, cameras, groups, tweens and other systems. Do not place a custom
Canvas game behind an unused Phaser instance. Build original local textures
once and reuse objects/groups; clear or pool temporary effects with limits.

The shared stage owns FIT scaling, host resize, explicit pause, document
visibility, all native modal dialogs, reduced-motion notifications and
Phaser destruction. Its built-in sound manager is disabled; no AudioContext
is created on load. Optional sound must be explicitly opted into using the
existing audio lifecycle. `runtime.canInteract()` gates pointer callbacks;
`gameKey(event, root, stage.canInteract())` guards keyboard shortcuts.
Do not install Phaser's document-global keyboard capture or another RAF loop.
Pausing stops both scene simulation and the game's render submissions, so
opening a notebook does not keep repainting an unchanged GPU canvas.

`stage.metrics()` reports actual update count, scene object count, texture
count and tween count. Test resource counts after repeated rounds/restarts.
Phaser itself destroys its scene/system resources; register non-Phaser
listeners, subscriptions and external objects with the project lifecycle.

## Authoritative games

Game rules and agent tools stay in pure modules, without importing Phaser,
DOM or CSS. Reuse `GameSession`, the Chinese `createAgentConsole` and
`createGameNotebook`, including replay-space preflight.

For arcade rounds, `FixedStepClock` makes logical steps independent of
render cadence. It limits catch-up work after a stall instead of skipping
unseen gameplay. Reset its remainder on pauses and new rounds. Record
bounded, timestamped input intents; replay the same fixed-step engine to
derive scores and outcomes. Never import a claimed score as authority.
Turn-based games simply record legal commands.

The LLM supplies a small legal strategy, wave, opponent move or cooperative
intent **between rounds or deliberate turns**, not every render frame.
Show its public commitment before a timed action window begins. Network
latency must not consume action time or lives. No model calls on page load,
fake offline agent, arbitrary model-authored code or model-owned rewards.

## Desktop experience and budgets

This edition targets desktop keyboard and mouse, per the user's request.
Keep scene and controls together at 1280x720, 1440x900 and 1920x1080.
No touch control layer or phone-specific feature work is required.
Use a persistent Chinese `h1`, `data-workspace="true"` on the root, an
always-available pause/help/restart path, and bounded dialogs for secondary
logs. Essential controls remain at least 14px.

Default logical scene resolution is 960x640 and never follows unbounded
device pixel ratio. Plan for at most 200 active display objects, 64 local
textures and 32 concurrent tweens per game; if a game needs more, document
and measure the deliberate bound. No per-frame texture creation. These are
engineering budgets, not a universal FPS guarantee or production certificate.

Each game needs a complete short campaign/arcade run, actual victories and
losses, replay/reset, a first-ten-seconds tutorial, and meaningful repeat
play. Keep the rules short and let the first action teach the mechanic.
The standard Playwright runner covers the real client/tool boundary,
scene input, pause, endings, replay and resource stability. Pure `agent.ts`
exports `smokeCase()` for the separately opted-in real-model suite.
