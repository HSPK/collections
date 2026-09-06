# Soft Signal

Independent URL: `/projects/soft/`.

The maintained renderer is [`soft.ts`](../../experiments/soft.ts). This
folder separates its public manifest, project-owned studio entrypoint,
and blush-themed stylesheet from its rendering implementation.

Extend the metaball field, finishes, or control ranges in the renderer.
The shared spatial lifecycle handles camera framing, studio setup, and
disposal. Keep marching-cubes resolution bounded for smaller devices and
invalidate the scene after interactions while paused.

Default-scene changes should include a refreshed `previews/soft.jpg`.
