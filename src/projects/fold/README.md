# Fold Study

Independent URL: `/projects/fold/`.

The paper mesh, thickness, lighting, and perspective controls are in
[`fold.ts`](../../experiments/fold.ts). This folder supplies the uniform
manifest and project-owned studio entrypoint used by the static page
generator. `style.css` defines the blue paper-workshop identity.

Extend fold patterns and material/view presets in the implementation.
Recompute the actual geometry when folds change, preserve mobile framing,
and release replaced geometry and materials. Keyboard orbit/fold controls
must continue to work when automatic motion is paused.

Regenerate `public/previews/fold.jpg` after changing its default geometry.
