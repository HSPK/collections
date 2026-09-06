# Afterimage

Independent URL: `/projects/ribbon/`.

[`ribbon.ts`](../../experiments/ribbon.ts) contains normalized gesture
points, satin-strip drawing, palette presets, and local PNG export.
The metadata, plum-toned studio stylesheet, and project-owned website
entrypoint are isolated in this directory.

Extend palettes or the seeded default composition in the renderer.
Preserve bounded stroke history, pointer-capture cleanup, responsive
coordinates, and an actual downloadable image rather than a UI-only
export action. Canvas contents stay on the visitor's device.

Regenerate `public/previews/ribbon.jpg` when changing the initial artwork.
