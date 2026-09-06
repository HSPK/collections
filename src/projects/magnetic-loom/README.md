# Magnetic Loom

An independent, light-paper magnetic filing study at
`/projects/magnetic-loom/`. It uses local Canvas 2D, system fonts, and no
network assets, audio, storage, or GPU dependencies.

## Files and extension points

- `data.ts`: the 4,500-filing budget, seed, bed dimensions, starting magnets,
  palette, and visible explanatory notes.
- `field.ts`: pure softened-pole field and analytic field-strength gradient.
- `engine.ts`: seeded micro-chains, spring settling, angular alignment,
  clamped magnet edits, shake, and deterministic reset.
- `renderer.ts`: cached drafting paper / field traces and batched metallic
  slivers; no full-frame blur or particle-to-particle loop.
- `index.ts`: independent layout, accessible controls, and lifecycle.
- `style.css`: styles scoped to `.project-magnetic-loom`.

Keep the live filing budget between 3,000 and 6,000. The engine also accepts
a smaller count for inexpensive invariant tests. Avoid adding all-pairs
filing forces: field evaluation is O(filings × poles), with four poles for
the two supported magnets.

## Illustrative model, not laboratory physics

Each magnet has two opposite poles, 108 drawing units apart, rotated about
its center. For a pole at `p`, signed strength `q`, and `r = x - p`:

```
B(x) = Σ q r / (r·r + ε²)^(3/2)
ε = 24 drawing units
```

This is an illustrative, planar sample of a softened pole-pair / dipole
approximation, not a claim that free magnetic monopoles exist. The field
and its derivative remain finite even at a pole or when magnets overlap.
The module analytically evaluates `½∇|B|²`. Display-safe field magnitude
is limited to 24 and gradient magnitude to 2.5.

Filings align to **axes**, using the shortest angular difference modulo π.
Reversing an isolated magnet therefore preserves sliver alignment.
Reversing only one of these two magnets changes the superposed field and
its bridges/divides; visible N/S markings change with polarity.

Seeded, lightly jittered anchors each host five short filings. A tangent
offset forms a tiny chain, while a bounded displacement toward stronger
field gives the paper some texture. These authored springs and chains
stand in for bed friction and granularity, not true ferromagnetic
interactions. The gradient displacement is at most 20 units, and no filing
may travel more than 54 units from its own home.

Spring integration uses at most 50 ms per call, split into steps no larger
than 1/60 second. Acceleration is capped at 900 units/s², speed at 120
units/s, and positions at the paper inset. Shake adds a bounded
displacement/impulse and decaying, simulation-time-driven tremor.
There is no perpetual random jitter at equilibrium. Initialization and
reset place filings analytically into a settled, immediately visible field.

## Controls and pause

- Drag either magnet. Shift-drag rotates it about its center.
- Select A or B with the labeled buttons. Arrow keys move it by 10 units;
  Shift + arrows moves by 30. Four touch nudge buttons provide the same
  basic movement.
- Use the angle range or ±15° buttons to turn the selected magnet.
- `[`, `]`, and `F` on the focused canvas or magnet buttons turn / flip.
- **Flip pole** reverses just the selected magnet.
- **Shake bed** scatters the filings; **Reset arrangement** restores the
  original settled bridge without changing playback or trace visibility.
- **Show field traces** toggles faint, midpoint-integrated field guides.
- **Pause / Play**, or Space on the canvas, freezes / resumes actual
  settling, position, angle relaxation, and shake tremor.

Paused input is an edit, not a hidden simulation: moving or turning a magnet
updates field alignment in one redraw, but does not integrate positions or
time. Shaking while paused makes one bounded scatter and holds it; Play
then releases the stored impulse. The status text explains this.

Reduced motion starts paused with the complete settled artwork, without
a warm-up animation. Changes to the media preference are listened to.
Touch-friendly DOM magnet handles maintain legible N/S labels at narrow
widths; their field coordinates still come from the same bed projection.

## Rendering and lifecycle

Drawing is throttled to about 30 Hz during playback. Paper grain, drafting
rules, and field traces share a reusable offscreen canvas, invalidated only
by size, magnet configuration, or trace visibility. Four batched shades
plus a narrow highlight suggest metallic slivers. Pointer edits schedule
one render even when paused; paused mode does not run a perpetual RAF.

`createProjectPage` owns all event listeners through `page.signal`.
`canvas2D` owns the only resize observer; its disposer is registered.
`createLoop` owns RAF and its visibility listener; its destroy function is
registered. Destruction releases pointer capture, cancels the loop,
clears the offscreen backing store, disconnects canvas sizing, and removes
the site. There are no timers, untracked observers, or external resources.

## Focused validation

```
SITE_URL=http://127.0.0.1:4173 npm test -- tests/series/magnetic-loom.spec.ts
```

Tests cover finite/symmetric field behavior, polarity superposition,
bounded settling and zero-delta invariance, genuine browser drag/rotation/
flip/shake/pause, and a 375px reduced-motion layout.
