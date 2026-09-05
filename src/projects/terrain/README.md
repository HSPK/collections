# Terrarium

Independent URL: `/projects/terrain/`.

[`terrain.ts`](../../experiments/terrain.ts) owns landscape generation,
biomes, view steering, and contour/surface presentation. The manifest and
entrypoint here are discovered automatically by the collection build.

Extend the height function and biome palettes independently of the shared
studio/camera lifecycle in `spatial-common.ts`. Preserve the continuous
landscape travel and keep contour generation consistent with the surface.
Controls must also update a paused scene.

Refresh `public/previews/terrain.jpg` when the default landscape changes.
