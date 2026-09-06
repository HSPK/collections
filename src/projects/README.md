# Independent project websites

Every directory here is a website, not an iframe or a card inside the index.
The build emits `projects/<id>/index.html`, and the development server serves
the same URL. Each site owns its heading, navigation, content, layout, and
interactions. The collection adds a collapsible floating menu, with no
shared header or reserved strip above the site.

## Directory contract

Start a complete, no-overwrite scaffold from the repository root:

```sh
npm run new:project -- my-project --title "My Project" --category create
```

It assigns an unused order, creates a local starter cover and focused spec,
and registers the page without an index edit. Replace the starter before
submitting a PR; see [CONTRIBUTING.md](../../CONTRIBUTING.md) for the review path.

```text
my-project/
  manifest.json   Discovery metadata; register this last
  index.ts        Site entrypoint exporting mount(context)
  data.ts         Content, presets, levels, or other editable data
  style.css       Styles scoped to .project-my-project
  README.md       Project-specific extension notes
```

The index automatically discovers manifests and lazy-loads entrypoints.
No central list, route switch, or build entry needs updating. Manifests are
validated in both the browser registry and static-site build.

```json
{
  "id": "my-project",
  "order": 61,
  "title": "My Project",
  "subtitle": "A short, specific invitation.",
  "description": "What this website actually contains and does.",
  "category": "create",
  "format": "page",
  "medium": "A useful description",
  "tags": ["Making", "Original"],
  "color": "#e8e3d8",
  "ink": "#242a25",
  "instruction": "The simplest way to get started."
}
```

Categories are `create`, `play`, `read`, `learn`, `explore`, and `art`.
Every project uses `format: "page"` and owns its layout and controls.
`order` must be unique and positive.
The default cover is `public/previews/<id>.jpg`; an optional `preview`
can point to another local image inside `previews/`.
Add `data-project-preview` to the main workbench, exhibit, or content region
to make automatic covers focus on the useful website content rather than
its masthead. Keep the actual work visible near the top of interactive sites.

## Site entrypoint

```ts
import './style.css';
import { createProjectPage } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'my-project');
  page.root.innerHTML = '<h1>My Project</h1><p>The site starts here.</p>';
  return { destroy: page.destroy };
}
```

`ProjectInstance` requires only `destroy`. Playback and reset are optional;
a reading website does not need animation controls. Use your own controls
inside the site. `context.report` presents accessible feedback, and
`page.signal` scopes listeners. Register timers, audio, observers, and
other cleanup with `page.onCleanup`.

Use `core/page.ts` for escaped text, downloads, clipboard access, and
explicitly reported storage failures. Use `core/urls.ts` for collection
assets so links work from nested GitHub Pages directories. Web Audio
projects should reuse `holdGainAtTime` from `core/audio.ts`.

For Three.js work, `core/spatial.ts` exposes the existing responsive,
pausable `spatialExperiment` lifecycle and optional `orbitView` controls.
It does not create a pedestal or studio scenery unless you explicitly use
`studio`. Build your own environment in `stage.scene`, register additional
resources with `stage.own`/`stage.onDestroy`, and cap pixel ratio for dense
effects. A scene can use this lifecycle with its own website layout.

Optional microphone interactions must start only after an explicit user
action, process input locally without recording or uploading, offer a
pointer/keyboard alternative, and stop every media track on exit.

Keep essential controls and labels at least 14px, body text about 16-18px,
and touch targets generous. A 320px viewport should remain usable without
document-level horizontal scrolling. Provide substantive content and functioning controls.
Sound must start only after explicit opt-in. Label fictional information
as fiction and distinguish a local generator from a hosted AI model.

## Artwork websites

The original ten projects keep their mature rendering code in
`src/experiments/`, while their project directories own the studio
entrypoint, identity, and stylesheet:

```ts
import './style.css';
import { defineArtSite } from '../../core/art-site';
import { mount as artwork } from '../../experiments/orbital';
import manifest from './manifest.json';

export const mount = defineArtSite(manifest, artwork);
```

`defineArtSite` provides a project-local artwork viewport, inspector,
playback/reset controls, notes, and cleanup. Customize `--studio-*`
variables and scoped selectors in the site's stylesheet, or write a
different entrypoint entirely. The index never owns the artwork UI.
The floating collection menu remains separate from project controls.
