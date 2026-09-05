# Chroma

Independent URL: `/projects/chroma/`.

The color-field shader and its controls live in
[`chroma.ts`](../../experiments/chroma.ts). `manifest.json` is the public
discovery record and `index.ts` is its website adapter.

Add artist palettes or domain-warp variations in the renderer rather than
in the collection. Keep pointer and keyboard stirring connected to shader
uniforms, preserve reduced-motion behavior, and release WebGL resources
on exit. Do not add remote texture dependencies.

Regenerate `public/previews/chroma.jpg` for default-palette changes.
