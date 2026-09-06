# Flow State

Independent URL: `/projects/flow/`.

The entrypoint mounts [`flow.ts`](../../experiments/flow.ts) inside a
project-owned studio. `style.css` defines its dark/copper identity; the
manifest supplies discovery metadata, not a shared index frame.

`makeField` defines the sampled vector field. Particle lifetime, density,
prewarming, and the `INKS`, `OPACITY`, and `WIDTHS` constants control the
default composition. Keep the mobile particle cap and deterministic
prewarm when adding variants. The canvas and loop helpers own resizing,
pause, and visibility behavior.

Regenerate `public/previews/flow.jpg` for visual changes.
