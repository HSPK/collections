# Independent project websites

Every directory here is a website, not an iframe or a card inside the index.
The build emits `projects/<id>/index.html`, and the development server serves
the same URL. Each site owns its heading, navigation, content, layout, and
interactions. The collection adds only a small return/source bar.

## Directory contract

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
  "order": 31,
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
Use `page` for complete websites; `immersive` retains the original art
viewport and playback controls. `order` must be unique and positive.
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

Keep essential UI text at least 12px, body text about 15-18px, and touch
targets generous. Provide substantive content and functioning controls.
Sound must start only after explicit opt-in. Label fictional information
as fiction and distinguish a local generator from a hosted AI model.

The original ten projects keep their mature rendering code in
`src/experiments/`; their directories here provide the same manifest and
entrypoint interface as the newer full websites.
