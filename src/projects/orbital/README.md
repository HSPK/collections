# Orbital

Independent URL: `/projects/orbital/`.

`manifest.json` controls discovery metadata. `index.ts` builds Orbital's
own studio with `defineArtSite`, and `style.css` defines its sage identity.
The renderer lives in
[`src/experiments/orbital.ts`](../../experiments/orbital.ts).

Add ring geometry, materials, or motion variants in that renderer. Shared
studio lighting, responsive framing, keyboard orbit controls, and resource
ownership live in `src/experiments/spatial-common.ts`. Register allocated
resources with that lifecycle and keep paused interaction functional.
Regenerate `public/previews/orbital.jpg` after changing the default scene.
