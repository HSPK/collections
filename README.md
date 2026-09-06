# odd/index

**Small websites. Big "what if?"** A growing playground of AI-made tools,
games, stories, 3D worlds, educational labs, and ideas that do not fit a box.

[**Explore the live collection**](https://hspk.github.io/collections/) ·
[**Add your AI-made website**](CONTRIBUTING.md) ·
[Suggest an idea](https://github.com/HSPK/collections/issues/new?template=project-idea.yml)

[![GitHub Pages deployment](https://github.com/HSPK/collections/actions/workflows/deploy.yml/badge.svg)](https://github.com/HSPK/collections/actions/workflows/deploy.yml)

![The Odd Index project browser](public/cover.jpg)

The library is deliberately small: search, project types, tag filters, useful
previews, and links. Its header and search area stay in place while the project list
scrolls independently. Projects are the main event. Each one opens its **own complete
website** at `/projects/<id>/`, with its own content, layout, and behavior.
There are no iframes and no requirement to fit a project inside an animation
viewport. Collection navigation lives in a collapsible floating menu, not
an injected page header.

Everything is statically hosted and runs in the visitor's browser. "AI-made"
describes how this collection was created, not a hosted inference service.
There are no AI API keys, accounts, analytics, or backend functions. Some
projects keep preferences or work locally on the visitor's device.

## Made something with AI? Give it a home.

Your weird little tool, interactive explanation, playable idea, or
beautiful experiment belongs here. **AI-generated and AI-assisted PRs are
welcome.** Bring a finished experience, not a perfect pitch.

```sh
npm ci
npm run new:project -- my-idea --title "My Idea" --category create
npm run dev
```

The starter creates an independent page, a valid manifest, a local cover,
extension notes, and a focused browser spec without touching the index.
Replace the starter with your idea and
[open a focused pull request](CONTRIBUTING.md). Maintainers review and merge;
the site publishes automatically after the main-branch quality gate.

## The websites

### Spatial systems

Five independent studios where space is part of the computation, not just
the scenery. Search **Spatial flagship** to explore this edition together.

| Project | Inside |
|---------|--------|
| [Section](https://hspk.github.io/collections/projects/section/) | Editable implicit CSG, real surface meshing, arbitrary-plane sections with holes, measured geometry, and STL/SVG export. |
| [Passage](https://hspk.github.io/collections/projects/passage/) | Three floors and twelve rooms with clearance-aware routing, step-free constraints, editable doors/connectors, and a timed spatial walkthrough. |
| [Morrow](https://hspk.github.io/collections/projects/morrow/) | A six-joint robot with full-pose inverse kinematics, conservative collision checks, bounded RRT motion planning, and actual pick/place workflows. |
| [Parallax](https://hspk.github.io/collections/projects/parallax/) | Rendered stereo exposures, pixel-only triangulation, nonlinear refinement, robust image geometry, uncertainty ellipsoids, and point-cloud export. |
| [Loadpath](https://hspk.github.io/collections/projects/loadpath/) | Editable 3D axial finite elements: supports, load cases, self-weight, reactions, member forces, deformation, and explicit mechanism detection. |

Each project keeps its model, spatial representation, and interaction
connected. Its local notes explain coordinates, numerical limits, and
extension points. These are exploratory browser tools, not instructions
for physical robot control or certified structural design.

### The first flagship edition

Five deeper dives, built around systems you can inspect and change rather
than effects you can only watch. Search **Flagship** in the library to
browse both editions; each is still its own independent website.

| Project | Inside |
|---------|--------|
| [Apsis](https://hspk.github.io/collections/projects/apsis/) | An orbital flight desk with executable transfer plans, moving-frame burns, trajectory inspection, and live delta-v accounting. |
| [Lumen](https://hspk.github.io/collections/projects/lumen/) | Six editable optical element types, spectral Snell/Fresnel ray tracing, real detector readings, an experiment notebook, and SVG/JSON export. |
| [Relay](https://hspk.github.io/collections/projects/relay/) | A working eight-bit computer with a 28-operation instruction set, assembler, reverse debugger, five programs, and a memory-mapped display. |
| [Palinode](https://hspk.github.io/collections/projects/palinode/) | Four eras, 28 authored artifacts, and three endings driven by rewritable causal history, with pinned-future comparison and a keepable folio. |
| [Roomtone](https://hspk.github.io/collections/projects/roomtone/) | An editable 3D acoustic studio with image-source reflections, frequency-dependent impulse responses, opt-in convolution audio, and WAV export. |

These are local, browser-based systems, not remote AI services. Their
project notes explain the algorithms, scientific approximations, and
extension points. The scientific workbenches are exploratory models, not
flight-planning or acoustic-certification software; Palinode is original
fiction.

### Six creative and educational series

| Series | Five independent websites |
|--------|---------------------------|
| Novel interactions | [Shadow Play](https://hspk.github.io/collections/projects/shadow-play/), [Glyph Garden](https://hspk.github.io/collections/projects/glyph-garden/), [Worlds Within](https://hspk.github.io/collections/projects/worlds-within/), [Time Brush](https://hspk.github.io/collections/projects/time-brush/), [Breath Garden](https://hspk.github.io/collections/projects/breath-garden/) |
| 3D scenes | [Tidal Observatory](https://hspk.github.io/collections/projects/tidal-observatory/), [Neon Rain](https://hspk.github.io/collections/projects/neon-rain/), [Paper Planet](https://hspk.github.io/collections/projects/paper-planet/), [Crystal Cavern](https://hspk.github.io/collections/projects/crystal-cavern/), [Perspective Paradox](https://hspk.github.io/collections/projects/perspective-paradox/) |
| Particle studies | [Star Nursery](https://hspk.github.io/collections/projects/star-nursery/), [Ink in Water](https://hspk.github.io/collections/projects/ink-water/), [Firefly Choir](https://hspk.github.io/collections/projects/firefly-choir/), [Sand Script](https://hspk.github.io/collections/projects/sand-script/), [Magnetic Loom](https://hspk.github.io/collections/projects/magnetic-loom/) |
| Animation demonstrations | [Epicycle Studio](https://hspk.github.io/collections/projects/epicycle-studio/), [Chain Reaction](https://hspk.github.io/collections/projects/chain-reaction/), [Motion Foundry](https://hspk.github.io/collections/projects/motion-foundry/), [Camera Assembly](https://hspk.github.io/collections/projects/camera-assembly/), [Season Clock](https://hspk.github.io/collections/projects/season-clock/) |
| AI Education | [Vector Playground](https://hspk.github.io/collections/projects/vector-playground/), [Gradient Lab](https://hspk.github.io/collections/projects/gradient-lab/), [Attention Studio](https://hspk.github.io/collections/projects/attention-studio/), [Decoding Lab](https://hspk.github.io/collections/projects/decoding-lab/), [Patchwork Vision](https://hspk.github.io/collections/projects/patchwork-vision/) |
| Engineering principles | [Four-Stroke Studio](https://hspk.github.io/collections/projects/engine-room/), [Motor Field Lab](https://hspk.github.io/collections/projects/motor-field-lab/), [Gearbox Playground](https://hspk.github.io/collections/projects/gearbox-playground/), [Linkage Atlas](https://hspk.github.io/collections/projects/linkage-atlas/), [Cam Workshop](https://hspk.github.io/collections/projects/cam-workshop/) |

The interaction studies explore shadows as controls, local gesture grammar,
recursive zoom, painting local time, and optional breath/sound input. The
three other series use genuinely different scenes, particle mechanisms,
and inspectable animation timelines rather than palette-swapped effects.
The AI learning path connects linear algebra and optimization to attention,
decoding, and image/text alignment. The mechanical labs expose actual
kinematic relationships and clearly identify their idealized assumptions.

### Tools, games, stories, worlds, and the original artwork studios

| Project | Kind | Inside |
|---------|------|--------|
| [The Museum of Unmade Things](https://hspk.github.io/collections/projects/museum/) | Stories & archives | An original speculative design museum and its impossible exhibits. |
| [Letters from Elsewhere](https://hspk.github.io/collections/projects/postcards/) | Stories & archives | An illustrated atlas of imaginary places and their correspondence. |
| [The Last Bookshop](https://hspk.github.io/collections/projects/bookshop/) | Stories & archives | A branching literary world with choices, discoveries, and endings. |
| [A Dictionary of Almost](https://hspk.github.io/collections/projects/almost/) | Stories & archives | Invented words for specific, not-quite-nameable experiences. |
| [Palette Kitchen](https://hspk.github.io/collections/projects/palette/) | Tools & makers | Color recipes, actual contrast ratios, and keepable palettes. |
| [Pixel Loom](https://hspk.github.io/collections/projects/pixel-loom/) | Tools & makers | Pixel drawing, fill, symmetry, undo, and image export. |
| [Transit Weaver](https://hspk.github.io/collections/projects/transit/) | Tools & makers | An editable fictional transit network and a map to take away. |
| [Zine Machine](https://hspk.github.io/collections/projects/zine/) | Tools & makers | A small print studio for an editable eight-page mini-zine. |
| [Nonogram Club](https://hspk.github.io/collections/projects/nonogram/) | Games & puzzles | Original picture-logic puzzles with real clues and solving tools. |
| [The Tiny Detective](https://hspk.github.io/collections/projects/detective/) | Games & puzzles | Nonviolent mysteries, evidence, and explainable deductions. |
| [Word Circuit](https://hspk.github.io/collections/projects/word-circuit/) | Games & puzzles | Word ladders with a real dictionary graph and useful hints. |
| [Parcel Panic](https://hspk.github.io/collections/projects/parcel/) | Games & puzzles | Postal route puzzles with pickups, deliveries, and undo. |
| [Garden of Rules](https://hspk.github.io/collections/projects/rules/) | Learning | Editable cellular automata, rules, presets, and step-by-step evolution. |
| [The Scale of Things](https://hspk.github.io/collections/projects/scale/) | Learning | Logarithmic size comparisons with clearly approximate facts. |
| [Algorithm Theatre](https://hspk.github.io/collections/projects/algorithms/) | Learning | Actual sorting traces with explanations and editable inputs. |
| [Recipe for a City](https://hspk.github.io/collections/projects/city/) | Worlds & explorations | A city-building toy with meaningful neighborhood rules. |
| [Signals from 2086](https://hspk.github.io/collections/projects/newspaper/) | Stories & archives | A clearly fictional future newspaper with full original stories. |
| [Atlas of Impossible Weather](https://hspk.github.io/collections/projects/weather/) | Worlds & explorations | Illustrated forecasts from imaginary destinations. |
| [Pocket Synth](https://hspk.github.io/collections/projects/synth/) | Tools & makers | An actual browser-based step sequencer. |
| [Radio 404](https://hspk.github.io/collections/projects/radio/) | Worlds & explorations | Locally synthesized stations from fictional places. |
| [Orbital](https://hspk.github.io/collections/projects/orbital/) | Art & motion | Polished kinetic rings and material studies. |
| [Flow State](https://hspk.github.io/collections/projects/flow/) | Art & motion | A dense, touchable vector-field particle study. |
| [Soft Signal](https://hspk.github.io/collections/projects/soft/) | Art & motion | Organic merging and separating liquid forms. |
| [Terrarium](https://hspk.github.io/collections/projects/terrain/) | Art & motion | Procedural landscapes, contours, and biomes. |
| [Chroma](https://hspk.github.io/collections/projects/chroma/) | Art & motion | Domain-warped marbling and color fields. |
| [Echo](https://hspk.github.io/collections/projects/echo/) | Art & motion | An opt-in audiovisual ripple instrument. |
| [Gravity Garden](https://hspk.github.io/collections/projects/gravity/) | Games & puzzles | Physical toys to plant, move, and rearrange. |
| [Type Playground](https://hspk.github.io/collections/projects/type/) | Art & motion | Elastic particle lettering and custom words. |
| [Fold Study](https://hspk.github.io/collections/projects/fold/) | Art & motion | Dimensional paper, folds, and light. |
| [Afterimage](https://hspk.github.io/collections/projects/ribbon/) | Art & motion | Satin-ribbon drawing and local PNG prints. |

## Run and build

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

The development server supports both the library and each independent
`/projects/<id>/` website. To build and serve the production output:

```sh
npm run build
npm run preview
```

Deploy the complete `dist/` directory, preserving its structure:

```text
dist/
  index.html
  assets/
  previews/
  projects/
    museum/index.html
    palette/index.html
    orbital/index.html
    ...
```

Every project URL has a real HTML entrypoint, its own page metadata, and
lazy-loaded application code. Direct links and refreshes work on static
hosting without a server-side routing fallback. Older links such as
`/#/experiment/orbital` redirect to the corresponding independent website.
Projects may use their own hash navigation for chapters, articles, or views.

## Extending a project

Each project directory contains its own manifest, entrypoint, content or
engine files, styles, and extension notes. Start with that directory's
`README.md`, rather than changing the collection UI.

```text
src/projects/<id>/
  manifest.json   Title, type, tags, order, and discovery metadata
  index.ts        Website mount entrypoint
  data.ts         Content, levels, recipes, or presets
  engine.ts       Pure rules or algorithms, where appropriate
  style.css       Project-scoped visual design
  README.md       Local extension guide
```

There is no central switch statement or manual project registration.
`src/catalog.ts` discovers the manifests, and `scripts/project-pages.ts`
generates the standalone entrypoints. Adding a complete project folder
adds its website and library entry. Invalid IDs, categories, duplicate
orders, or missing entrypoints fail explicitly.

See [the project authoring guide](src/projects/README.md) for the manifest
schema and a minimal entrypoint, or use `npm run new:project` to generate
the safe starting structure. [CONTRIBUTING.md](CONTRIBUTING.md) explains
how to take an AI-made idea through a community PR.

`ProjectInstance` requires only `destroy`; playback and reset are optional.
Reading websites do not inherit irrelevant animation controls. Shared
helpers cover lifecycle cleanup, accessible notifications, downloads,
safe markup, clipboard access, local data, animation loops, and compatible
audio automation. The original ten renderers remain in `src/experiments/`,
but each now has a project-owned studio entrypoint and theme in its own
directory. `defineArtSite` in `src/core/art-site.ts` composes the artwork,
local controls, notes, and lifecycle without involving the index layout.
All project manifests use `format: "page"`.

## Browsing and accessibility

- Discovery interleaves project types rather than presenting an entire row
  of near-identical effects. Categories, selected tags, search, and layout preferences
  and the list's own scroll position survive navigation between websites.
- Left-side tag filters match **all selected tags** and combine with search
  and project type. Counts reflect the current result set; tag-name search
  only narrows the available controls. Clear tags keeps the other filters.
  On phones, the Tags button opens the same controls in a keyboard-accessible
  dialog without moving the fixed header or search.
- The header contains About, Source, and Contribute, without a project-count
  badge or introductory headline. There is no bottom status/footer bar.
  Header, search, and filters remain visible; the list has a restrained,
  independently scrollable viewport.
- Press **/** to focus library search or **Ctrl/Command + K** to find a
  project from anywhere. Dialogs support Tab, Enter, and Escape.
- The library starts with project content, not a heavyweight 3D hero.
  Its first load does not request Three.js.
- Controls, labels, and body copy use readable sizes. Sites are designed
  for narrow screens and provide keyboard or touch alternatives.
- Motion respects the system preference where appropriate. The original
  art websites own their Play/Pause controls and keyboard behavior;
  the collection does not control their playback.
- The floating collection menu provides return, search, project information,
  source, and previous/next links. It can be closed with Escape or by
  clicking outside and does not reserve any page-header space.
- Sound always requires explicit opt-in. Audio graphs, rendering loops,
  observers, and listeners are released when leaving a project.
- Optional microphone interactions also require explicit consent, offer a
  keyboard/pointer alternative, process signals locally without recording,
  and release media tracks when disabled or when leaving the site.
- Fictional archives, newspapers, forecasts, and radio stations are
  identified as fiction. Scientific comparisons distinguish approximate
  illustrations from measured reference data.

## GitHub Pages

The existing workflow, `.github/workflows/deploy.yml`, builds all project
websites, runs the browser suite, and deploys the artifact on pushes to
`main`. The repository uses **Settings > Pages > GitHub Actions**.

Relative assets and per-page base markers support repository Pages
(`https://<owner>.github.io/<repository>/`) without broken nested paths.
All public assets are local; there are no CDN font or runtime library
dependencies. If deploying under a different brand/domain, also update
the canonical social URLs in `index.html` and `scripts/project-pages.ts`.

## Browser coverage and real previews

```sh
npx playwright install chromium
npm test
```

The suite covers the content-first library, manifests, standalone entry
documents, direct refreshes, original art controls, reduced motion, audio
consent and cleanup, editable typography, and the new sites' own rules and
interactions. New `page` projects automatically enter the shared
standalone/mobile coverage.

```sh
npm run test:update-previews
```

This opt-in command captures the actual registered websites into
`public/previews/` and refreshes `public/cover.jpg` from the content-first
library. It does not replace custom non-JPEG preview assets. Commit changed
previews with the corresponding site code.

Use `SITE_URL=https://hspk.github.io/collections/ npm test` to point the
browser suite at the published collection. Canvas2D motion comparisons use
source bitmaps to avoid compositor dithering; the test browser allows
software WebGL without forcing ordinary website rendering through it.
