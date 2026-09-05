# Flow State

Independent URL: `/projects/flow/`.

The entrypoint re-exports [`flow.ts`](../../experiments/flow.ts); the
manifest supplies the library description and tags.

`makeField` defines the sampled vector field. Particle lifetime, density,
prewarming, and the `INKS`, `OPACITY`, and `WIDTHS` constants control the
default composition. Keep the mobile particle cap and deterministic
prewarm when adding variants. The canvas and loop helpers own resizing,
pause, and visibility behavior.

Regenerate `public/previews/flow.jpg` for visual changes.
