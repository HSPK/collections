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
- The **Grow** pane has native buttons for the exact same commands. With the
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
  ribbonwood drawings. Asset placement and plant scale respond to actual canvas
  dimensions, including short landscape and compact mobile previews.
- `index.ts`: pointer capture and cancellation, accessible controls, honest match
  feedback, bounded world history, and the core canvas/loop/page lifecycle.
- `style.css`: the scoped, responsive paper-and-botanical field-guide layout.

To add a command, extend `GestureId`, add its original example and templates in
`data.ts`, and give it an explicit state transition and keyboard equivalent in
`index.ts`. Add recognizer fixtures covering both genuine marks and near misses.
Keep the bounded point count, rejection path, and non-animation render requests.

## Validation

`SITE_URL=http://127.0.0.1:4173/ npm test -- tests/series/glyph-garden.spec.ts`

The focused tests cover deterministic shape matching and rejection, actual
draw-to-garden changes, native keyboard/Undo behavior, touch input, paused commands,
reduced motion, and a 375px layout. No shared test or configuration files are owned
by this project.

## Viewport workspace

The `data-workspace="true"` root occupies the viewport. A flex-sized live garden
and patch selector stay visible beside the dock on wide screens and above it on
phones. **Grow** keeps equivalent command buttons and Undo/Reset available while
the longer feedback/census area scrolls independently. **Field guide** holds the
original drawings and instructions; drawing from that pane returns to Grow with
the result. Tabs never replace or resize the canvas.

**Garden notes** opens a native dialog with recognition theory, keyboard help,
and local-state details. The dialog does not intercept the browser's Escape
behavior, and garden shortcuts do not mutate the scene from inside it. Shared
workspace helpers own tab focus/inert state and dialog lifecycle. The footer
reserves space for the floating collection menu.

Viewport regression coverage includes 1440×900, 1280×720, 375×812, 320×640, and
768×480, with screenshots, no-document-scroll assertions, primary-control bounds,
real shape recognition after resizing, and native-dialog focus restoration.
