# Crystal Cavern

An original, fictional underground chamber—not a mineralogical model. The
site's invented specimens are veil quartz, milkglass spar and lanternite.
Everything is made locally: faceted rock walls and vault, 22 crystal clusters,
a flooded floor, low stepping stones, light shafts, and suspended particles.
The map is a decorative survey drawing, not navigation.

## Modules

- `data.ts`: camera stations, authored cluster locations, mineral palettes.
- `scene.ts`: closed irregular hexagonal crystal geometry, rock and water
  geometry, instancing, local glow texture, materials and lighting.
- `engine.ts`: bounded orbit, deterministic clock, palette/intensity state,
  `pulseAtPhase` and `resolveMineralLighting`.
- `index.ts`: expedition page, accessible controls and scoped lifecycle.
- `style.css`: the `.project-crystal-cavern` identity, including mobile console.

## Interaction

Choose Pool’s edge, Upper passage or Crystal grove. Drag horizontally to look;
touch gestures stay with the scene rather than scrolling the document. Focus the canvas for arrow-key looking,
plus/minus distance adjustment, and Space playback. Desktop pointer orbit also
supports vertical looking. Orbit is bounded to keep the camera in the chamber;
there is no inertia, automatic camera drift, or wheel-scroll capture.
Labels stay at least 14 px, body notes are 15 px, and every range, view, playback,
and palette control has at least 44 px of interaction height.

Luminance and the three mineral palettes change actual crystal materials,
two unshadowed mineral lights, the key light, and local water-reflection bands.
Mist changes depth fog, visible shafts, and particle opacity. Scrubbing the
60-second light cycle pauses first; all moving properties derive from that
one phase. Play is explicit after a reduced-motion preference appears or is
removed. A still first frame has the entire environment and lighting.

## Viewport workspace

The `data-workspace="true"` root uses a `100dvh` grid. The real chamber takes the
remaining height, with **Play/Pause mineral light** and **Fieldbook** always in
the caption strip. **Views** holds all three camera stations and their caption;
**Light** holds palette, luminance and the mineral reading; **Atmosphere** holds
light-cycle scrubbing and mist. Panels scroll internally when needed, never the
document. Short landscape screens put the instruments beside the chamber.

**Fieldbook** opens the native **Cavern fieldbook** dialog with every specimen
and the original geological/rendering notes. Close/Escape restores focus.
Shared tab wrappers preserve nested groups and labels. Switching panels does
not hide or resize the canvas; the existing size observer handles viewport
changes and on-demand projection updates. The status row reserves the floating
collection menu's corner. Tests retain screenshots for all five target sizes.

## Rendering / lifetime

Four shared crystal geometries use irregular six-sided lower/shoulder rings
and an offset apex (24 flat triangles each), with three shared materials.
Rock masses and crystals are instanced. Desktop has 88 point motes, at most
1.5 DPR and one cached 1024px directional shadow. Narrow entry uses fewer
crystals, 44 motes, 1 DPR and no shadow map. There is no post-processing,
external asset, HDR, reflection target or realtime scene mirror. The water
uses inexpensive world-space colored reflection streaks; this is deliberately
identified as stylized rather than physically accurate.

All geometries, materials, texture, instanced meshes and light shadow objects
are registered with `stage.own`. The spatial lifecycle owns the renderer,
size observer and animation loop. Orbit listeners are removed through
`stage.onDestroy`; page controls and media listeners use `page.signal`.
Both construction layers destroy their resources before rethrowing failures.

## Checks

`tests/series/crystal-cavern.spec.ts` covers actual closed geometry and
deterministic light helpers, paused viewpoint/palette/luminance changes, mobile
reduced-motion changes, phase stability, readable mobile labels, and explicit
renderer teardown. The canvas's actual removal and lost-context state are
recorded at disposal and retained across full-document collection navigation.
Allow 120 seconds for software WebGL. The scene's `data-crystal-count`,
`data-cluster-count`, `data-crystal-triangles`, `data-rock-count`,
`data-mote-count`, `data-camera`, `data-emission`, `data-crystal-color`,
`data-light-intensity` and `data-phase` are derived from constructed resources
and current engine/material state, not stand-in render statistics.

Extend geology through `CLUSTERS`; keep its mineral indices aligned with the
three palette colors. New disposable resources must use `stage.own`, and new
moving effects must depend solely on the engine phase.
