# Takes / Little Pictures, no. 81

An original miniature-theater filmmaking game. Three editable nonviolent scripts:
**The Applause Department**, **One Moon, Lightly Toasted**, and **The Umbrella Post**.
Mica protects the ritual; Pip welcomes the impossible. A configured model chooses
their actual stage marks, poses, attention and short original lines.

## Production workflow

Open the brief, choose/edit a script, and begin. Rehearse **discover**, then keep
an establishing wide and Mica portrait. Advance to **offer** for a wide and Pip
portrait, then **celebrate** for a wide and Mica portrait. All six shots must pass
to wrap. Start with front rig / 28 mm / Both actors for the wide; for a portrait
choose its assignment, the named focal actor and 85 mm. Nearby blocking may need
a longer dolly distance. There is no automatic success camera.

Ten film exposures, 24 stage-time units, and ten rehearsals cover the whole
production. A valid rehearsal costs one time, not film. Recording costs one of
each even when rejected. Moving a tape mark or cabinet costs one time. Camera
edits are free. Empty film or time ends production unless the sixth required
shot has just been kept. Grade A leaves at least three film, B at least one,
and C finishes on the last exposure.

Drag the stage to orbit; click an actor to focus; drag tape circles to move
marks; drag the camera image to shift the rail. Numeric mark/prop controls,
camera sliders and orbit buttons provide touch/keyboard alternatives.
`R` records, `Space` rehearses, `C` swaps views, arrows shift rail/dolly.
Shortcuts do not fire inside dialogs or editable controls.

Save uses the core notebook: automatic browser replay persistence, native JSON
export/import, atomic validated restore. Contact sheet renders real PNG stills
on demand from take snapshots; choosing a frame reconstructs its recorded
stage and camera without a model request. Storyboard export is **JSON**, not
MP4, animation or audio. Stills are regenerated after restore rather than
storing large bitmap strings in the session. Playback is shot-by-shot, not a
continuous video. No sound or external asset requests.
Still capture applies the exact recorded poses without changing the live
camera, interrupting an actor's movement, or advancing the production.

## Boundaries and extension notes

- `data.ts`: three scripts, actor motivations, six legal tape marks, poses/cues.
- `geometry.ts`: shared handmade puppet primitives, transformed bounding
  corners, perspective projection, nine body sightline segment tests against
  conservative cabinet/actor/stage bounds and screen-direction calculation.
  The same camera sensor (24 mm high, 16:9 image), primitive dimensions, attention
  rotation and positions drive both Three and local coverage. This is a geometric
  game, not pixel-perfect photographic silhouette analysis.
- `engine.ts`: pure state/reducer/parser. A kept wide locks occupied marks,
  props, poses, attention and dialogue. Portraits must match that continuity
  and the wide's left-to-right ordering. Invalid replay commands cannot skip
  scenes, fabricate takes or overspend.
- `agent.ts`: DOM/CSS-free bounded tool, public observation and `smokeCase()`.
  The smoke case is the actual opening rehearsal and verifies mechanical
  reducer application, unchanged film/scene, valid actors and charged time.
  The opt-in real-model suite runs this scenario serially. Ordinary automated
  tests use native-tool fixtures and do not contact a provider.
- `render.ts`: a single WebGL renderer with two scissored views and exact 16:9
  camera monitor. DPR capped at 1.5; low-poly bespoke primitives, no postFX,
  no shadow-map pass, no imported textures. Render loop sleeps when settled.
  Reduced motion snaps to new committed marks and still redraws. Geometry,
  materials, canvas textures, observer and loop are disposed on unmount.
- `index.ts`: independent project page, camera-only local state, world session,
  mandatory revision guard, explicit cancellation on restart/import/new scene,
  core agent console and notebook. Production actions are gated while actors
  move or a rehearsal is pending. No offline actor fallback.

Each model turn permits at most two requests of 1,536 completion tokens within
60 seconds, with one illegal-plan correction. The parser reconstructs exact
objects. Public intentions/lines are escaped before HTML insertion. Only a
successfully validated, current plan enters the reducer. Camera state is not
in the observation, so camera edits cannot stale a pending rehearsal.

## Development

Existing Playwright runner only; native OpenAI-compatible fixtures exercise the
real client, not a production substitute. Browser suite covers a full legitimate
six-shot production, obstruction and screen-direction misses, film-budget loss,
AI-dependent framing, one correction/two failures, HTTP failure, late cancelled
responses, camera edits during requests, dialogue escaping, editable scripts,
notebook import/export/reload, storyboard reconstruction, keyboard and the
320x640 / 768x480 layouts.

```sh
npm run build
npm test -- tests/agent-games/takes.spec.ts
```

The [connection guide](../../../docs/model-connections.md) explains local and
public-page endpoints, server-side keys, billing, and opt-in model execution.
The fixture production exercises geometric misses, continuity restoration,
six kept shots, real still-backed records, and a winning replay restored
through both the native notebook and a reload.
