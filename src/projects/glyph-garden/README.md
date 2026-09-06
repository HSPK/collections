# Glyph Garden

An original, illustrated garden you tend with a small drawing language. All artwork
is generated locally with Canvas 2D paths; there are no assets, network requests,
AI services, recordings, or saved personal data. A refresh begins a new garden.

## Interaction

- Draw one generous, closed **circle** for a starbell flower.
- Draw an upright **chevron** (up, then down) for a ribbonwood tree.
- Draw a **zigzag** (down, up, down) to cycle still, gentle, and lively air.
- Draw anywhere in the picture; new growth goes in the selected patch. Tap the
  garden to select its nearest patch, or use the three labeled patch buttons.
- The illustrated guide has native buttons for the exact same commands. With the
  canvas focused, `F`, `T`, and `W` invoke them; left/right or `1`/`2`/`3` select
  a patch. Escape cancels an unfinished mark. Button activation is standard
  Enter/Space. Undo also supports Ctrl/Command+Z when focus is inside this site.
- Each patch holds ten plants, including its three starter plants. Full patches
  reject new planting without losing history. The other patches and wind still work.
- Undo keeps the last 32 actual world changes. Reset restores the starter
  composition and can itself be undone. Rejected/canceled strokes and patch
  selection never consume an Undo.
- Pause freezes the illustration, not the controls. Reduced-motion contexts start
  paused. Recognition, planting, selection, reset, and wind changes remain visible
  while paused. A later switch to reduced motion also pauses the garden; switching
  the preference back does not automatically resume it.

## Files and extension points

- `data.ts`: editable gesture examples and point templates, bed coordinates,
  deterministic plant slots, capacities, initial plants, and command copy.
- `engine.ts`: bounded, independent unistroke recognition. It resamples by arc
  length to 64 points, translates to the centroid, scales uniformly, and compares
  mean point distance at five rotations from −12° through +12°. Either stroke
  direction is supported; closed loops also compare cyclic start offsets.
  Upright orientation and aspect ratio are intentionally retained.
- The displayed score is `1 − mean distance / √0.5`, clamped to [0, 1]:
  **template similarity, not a probability or AI confidence**. Acceptance requires
  at least 86% similarity and a 4.5-point margin over the next command.
  A loop additionally needs endpoint closure, reasonable aspect ratio, and at
  least 0.81 circularity, rejecting squares and self-crossing scribbles. Tiny,
  non-finite, overly long, or more-than-1024-point input is rejected before
  matching. Template sets are capped at 32 strokes and validated before preparation.
  There is no fallback that executes the “closest” command.
- `art.ts`: original greenhouse, foliage, pond, mushrooms, snail, starbells, and
  ribbonwood drawings. Asset placement responds to actual canvas dimensions.
- `index.ts`: pointer capture and cancellation, accessible controls, honest match
  feedback, bounded world history, and the core canvas/loop/page lifecycle.
- `style.css`: the scoped, responsive paper-and-botanical field-guide layout.

To add a command, extend `GestureId`, add its original example and templates in
`data.ts`, and give it an explicit state transition and keyboard equivalent in
`index.ts`. Add recognizer fixtures covering both genuine marks and near misses.
Keep the bounded point count, rejection path, and non-animation render requests.

## Validation

`npx playwright test tests/series/glyph-garden.spec.ts`

The focused tests cover deterministic shape matching and rejection, actual
draw-to-garden changes, native keyboard/Undo behavior, touch input, paused commands,
reduced motion, and a 375px layout. No shared test or configuration files are owned
by this project.
