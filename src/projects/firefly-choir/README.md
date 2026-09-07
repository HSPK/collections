# Firefly Choir

An independent, silent night-garden website. A parchment-colored field notebook
surrounds a moonlit clearing, layered fern silhouettes, and locally synchronized
fireflies. This is an **illustrative phase/flocking model**, not a biological
simulation, acoustic instrument, or measured observation of real insects.

## Files and extension points

- `index.ts`: page-owned markup, accessible controls, input, and lifecycle.
- `engine.ts`: deterministic, DOM-free local phase/flocking simulation.
- `garden.ts`: cached scenery, reusable light sprites, and Canvas2D drawing.
- `data.ts`: authored defaults and editable field notes.
- `style.css`: all styles scoped to `.project-firefly-choir`.
- `manifest.json`: discoverable page metadata; no shared registration is needed.

Change `DEFAULT_SETTINGS` for a different first gathering. The fixed scenery
seeds in `garden.ts` are independent of the engine seed, so resetting the agents
does not rearrange the garden. The renderer uses normalized positions; resizing
changes the view, not the simulation or its neighborhood topology.

## Clocks and observable flashes

Each agent owns phase θ, position, velocity, a depth multiplier, and a natural
angular frequency near `2π / 4.2` radians/second, with a ±0.08 rad/s spread.
With the torch off, the phase update is:

```text
dθᵢ/dt = ωᵢ + K · Σⱼ wᵢⱼ sin(θⱼ − θᵢ) / Σⱼ wᵢⱼ
wᵢⱼ = 1 − distance² / radius², inside the local radius only
```

An empty neighborhood contributes zero coupling. `K` ranges from 0 to 5.
All next states are buffered and committed together: one agent never reads
another's already-advanced phase. The integration interval is at most 0.05 s.
The visible flash envelope is `max(0, cos(θ))⁶`, with a faint residual glow
between flashes. This produces slow, narrow pulses, not a global opacity
animation. Neighbor coupling really changes the phases that drive those pulses.

The displayed phase agreement is `|Σ exp(iθ) / N| × 100`, derived from every
current agent and rounded only for display. It measures phase agreement, not
brightness, neighbor count, or biological accuracy. Separate coherent local
groups can still yield low global agreement.

## Bounded neighborhoods and flocking

Population is clamped to **40–280 agents**. A uniform 6 × 6 grid uses a normalized
cell width/radius of **0.18**. An agent inspects only its own and eight adjacent
cells, with at most **48 candidate inspections per step**, including candidates
outside the circular radius and itself. The starting cell and bucket offsets
rotate to avoid permanently favoring the same agents in dense cells.

Thus even a fully collapsed flock costs at most `N × 48` candidate checks,
plus linear grid/state work; it does not fall back to an all-pairs scan.
This bounded local sample is not a nearest-48 search. The interaction radius
is circular in normalized model space and appears elliptical in wide viewports.

The same local samples provide soft cohesion, velocity alignment, and
short-range separation. Individual low-frequency wandering and a signed breeze
add drift. Velocity is capped at 0.042 normalized units/s. Soft boundary forces
and clamped, reflected positions keep agents within the meadow rectangle
`x: 0.08–0.93`, `y: 0.25–0.85`.

## Torch and controls

- **Firefly count:** add/remove agents within the population bounds.
- **Neighbor coupling:** compare independent clocks with local synchronization.
- **Breeze:** signed west/east drift; the center position is still air.
- **Scatter:** randomize phases without resetting position, time, or settings.
- **Torch:** gently attract nearby agents and phase-couple them to a clock
  running at the base frequency, inside normalized radius 0.21. Its ring is the
  actual influence boundary. There is no global phase reset.
- **Pointer/touch:** tap the clearing to enable and position the torch. Once
  enabled, mouse movement or dragging repositions it. The clearing owns touch
  gestures so dragging the torch is not interrupted by document panning.
- **Keyboard:** focus the garden; arrows move the torch, Shift+arrows move
  farther, Home centers it, T toggles it, and Space toggles playback.
- **Begin again:** restore the authored seed and settings, preserving pause.

Native labeled range inputs and 44px controls provide keyboard/touch alternatives.
Changing a control or moving the torch while paused redraws the direct input,
but does not advance positions, phases, time, or the coherence readout's clock.

## One-screen garden

The root declares `data-workspace="true"` and fits a `100dvh` grid. The garden,
live Phase agreement, playback, Scatter, all three primary ranges, and the torch
button remain in one workspace. Phones use a three-column parameter strip below
the clearing; desktop and short landscape retain a side desk. Primary controls
and readouts use at least 14px text, with 44px touch targets. Local right clearance
on the torch button keeps it beside the collection menu instead of sacrificing
a full-width bottom strip.

**Field notes ↗** opens the native `#fc-guide` dialog, labeled **Field notes**.
All authored notes, interpretation, complete keyboard help, descriptive live
feedback, and Begin again are retained there. Only this long secondary content
scrolls. Escape or **Close Field notes** returns focus to its trigger. The garden
is never unmounted or layout-hidden by this dialog, so its normalized torch
coordinates and cached scenery remain valid. Viewport resizing still rebuilds
the painter's cached layers and redraws a paused garden without advancing time.

## Rendering and lifecycle

The main canvas uses the shared DPR-capped `canvas2D` helper. Two static scene
layers are cached at DPR ≤1.5, and two 80px glow sprites are reused. A frame
copies the scenery and draws the bounded light population; it creates no
gradients, fullscreen blur, trails, textures, or particle DOM nodes.
Scenery is rebuilt only on `canvasresize`.
Resize redraws synchronously even while paused, so a resized canvas does not
remain cleared while waiting for the next animation frame.

`createProjectPage` owns all listeners through `page.signal`. `createLoop`
owns animation scheduling and tab visibility. Initial reduced motion pauses the
garden, and a media-query change updates playback. Pausing stops the loop's
autonomous work, including phase progression and readout updates; no CSS
animations or separate clocks run alongside it.

Cleanup destroys the loop, disconnects the canvas resize observer, clears
agent/bucket arrays, releases all four cached canvas buffers, and removes the
site. There is no audio, network dependency, persistent storage, or global
listener left behind.

## Focused validation

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/series/firefly-choir.spec.ts
```

The tests compare seeded uncoupled/coupled trajectories, check true locality,
local torch attraction/phase influence, finite bounds and candidate limits,
and exercise actual playback, paused resize, keyboard controls, torch input,
resets, mobile layout, touch, and reduced-motion changes.
Five viewport workflows also cover 1440×900, 1280×720, 375×812, 320×640,
and 768×480: no document scrolling, on-screen controls, real population/canvas
changes, exact pointer-to-torch coordinates, keyboard movement, secondary notes,
reset, and modal focus restoration. Screenshots are captured to per-test
`test.info().outputPath()` files.
