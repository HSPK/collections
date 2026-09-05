# Type Playground

Independent URL: `/projects/type/`.

[`type.ts`](../../experiments/type.ts) owns glyph sampling, spring
particles, responsive word layout, and the accessible editor. Its public
metadata and standalone entrypoint live here.

Add typefaces, sampling schemes, or spring presets in that implementation.
Keep input bounded and fit glyphs to narrow screens. Canvas-specific
shortcuts consume their events, so scattering must not accidentally
toggle the collection's playback shortcut.

The shared suite exercises editing and scattering while motion is paused.
