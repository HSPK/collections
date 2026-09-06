# Season Clock

An original illustrated almanac, not a botanical or weather model. One fictional
360-day year takes 72 seconds at 1×. The opening scene is blossom time. Reduced
motion opens the same beautiful still, paused; explicit Play remains available.
Changing the motion preference pauses rather than silently resuming.

## Files and extension points

- `index.ts` owns the standalone page, native controls, accessible feedback,
  playback, and snapshot download. Scrubbing and season shortcuts pause.
  **Restart year** goes to the first winter still and pauses; it preserves the
  place and pace. Changing place preserves time and playback.
- `data.ts` contains three authored landscapes, branch paths, crown positions,
  terrain, leaf shapes, palettes, and phenology parameters. Tree coordinates are
  local: the trunk's foot is `(0, 0)`, with negative y toward the crown. A tree's
  `x`, `y`, and `scale` place it in the 1100 × 620 composition. Branches are fixed
  Bézier paths; they are never generated on a frame.
- `timeline.ts` is pure, DOM-free seasonal math. `sampleYear` supplies crossfading
  illustration layers and colors. `makeLeaves` gives each leaf a stable identity,
  position, birth, release, drift, and landing time. `sampleLeaf` can evaluate any
  moment directly, without having rendered earlier moments.
- `scene.ts` builds one retained SVG per selected landscape. Each frame updates
  presentation attributes on existing nodes; no leaf DOM is rebuilt during
  playback. The largest place has 217 leaves, with a flower on every second leaf.
- `style.css` is scoped to `.project-season-clock`; there are no CSS animations.

## Adding a place

Add a `Landscape` to `landscapes`. Give it its own trunk/branch geometry and crown
layout, not just a different palette. Three terrain compositions are implemented:
`river` (water and reeds), `orchard` (field rows, cottage, and fruit), and `mountain`
(ridges, pale bark, and rocks). Add a terrain drawing in `scene.ts` for a genuinely
new setting. `leafShape` selects an authored SVG silhouette; extend `leafPaths`
when needed. The native selector is populated automatically.

`leavesPerCrown` is an explicit frame-budget control. Aim for roughly 180–240
leaves across the entire place. The seed only changes the fixed leaf arrangement;
it does not generate the branch structure or change during playback.

## Editing the year

All time values are fractions of one year:

- `leafOut` starts leaf growth; individuals spread their births over 0.045 years
  and reach full size 0.065 years after birth.
- `flowerAt` centers the start of a flower envelope. Blossom overlaps early
  leaves, then fades before high summer.
- `fallStart` and `fallSpread` distribute leaf release times. Flights take
  0.045–0.09 years. Keep the final landing before 0.9 for a clean winter.
- `sampleYear` melts snow from 0.09–0.23 and brings it back at 0.85–0.97.
  Crown opacity crossfades with leaf growth and staggered release; grounded
  leaves disappear beneath returning snow at 0.9–0.97.
- `phases` names and explains the year intervals. `seasonStops` in `data.ts`
  chooses the four shortcut stills. If season boundaries change, update the
  decorative dial segments in `index.ts` as well.

## Determinism and the seam

`yearTime` canonicalizes finite times modulo one, to nanoyear precision; 0 and 1
are exactly the same frame. Wind and atmosphere use integer-frequency periodic
functions of that canonical time. There is no wall-clock read, per-frame random
generation, accumulated particle velocity, or CSS animation. Snow wraps outside
the drawing bounds, with its entry and exit faded. The endpoints are both bare,
snow-covered winter.

A falling leaf evaluates its attached pose **at its own release time**, then
follows an explicit curved flight to a fixed landing. Reversing the slider
retraces that trajectory exactly. Settled leaves do not keep drifting. Coarse
scrubs work as well as playback; neither requires cached history.

`createLoop` advances only the selected time using its bounded delta, respecting
hidden-tab behavior. The SVG needs no resize observer or canvas: its viewBox
scales naturally. `createProjectPage` scopes all listeners. Cleanup destroys the
loop, removes the SVG, and aborts the media/control listeners.

## SVG stills

Save pauses the year and serializes the **displayed SVG**, not a second renderer
or a regenerated approximation. All colors, gradients, paths, positions,
opacities, and strokes are SVG attributes, including the current atmosphere.
There are no remote assets, fonts, stylesheets, scripts, or animation elements.
The native `downloadText` helper downloads it locally and revokes its object URL.

## Focused verification

```sh
SITE_URL=http://127.0.0.1:4173 ./node_modules/.bin/playwright test tests/series/season-clock.spec.ts
```

The tests cover phase boundaries, the repeated winter endpoint, fixed geometry,
reversible leaf trajectories, native controls, SVG contents, reduced motion,
375px layout, and abort/destroy cleanup.
