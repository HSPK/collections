# odd/index

**An exercise in curiosity.** Ten interactive experiments in space, motion, and play, collected in a small, editorial-style website.

[Explore the collection](https://hspk.github.io/collections/)

![The Odd Index gallery, with editorial typography and an interactive metal sculpture](public/cover.jpg)

This is a fully static, English-language creative-coding collection. The work is AI-assisted, not an AI service: there are no API keys, accounts, server functions, analytics, or runtime requests to third-party services. Everything is rendered in the visitor's browser.

## The collection

| # | Experiment | Medium | Play |
|---|------------|--------|------|
| 01 | **Orbital** | Three.js kinetic sculpture | Orbit polished rings; change their material and movement. |
| 02 | **Flow State** | Canvas particle vector fields | Bend a current; gather and redirect its particles. |
| 03 | **Soft Signal** | Three.js metaballs | Shape a liquid sculpture as its forms merge and separate. |
| 04 | **Terrarium** | Procedural 3D landscapes | Reshape the terrain and travel across its surface. |
| 05 | **Chroma** | Domain-warped color shaders | Pull liquid pigment through a selection of artist palettes. |
| 06 | **Echo** | Canvas and Web Audio | Send ripples through a field; optionally hear their tones. |
| 07 | **Gravity Garden** | Interactive collision physics | Plant shapes, drag them around, and change gravity. |
| 08 | **Type Playground** | Particle typography and springs | Write a word, scatter its particles, and watch it reform. |
| 09 | **Fold Study** | Dimensional paper geometry | Change a sheet's folds, material, and perspective. |
| 10 | **Afterimage** | Generative ribbon drawing | Draw with satin ribbons and download a local PNG print. |

Each experiment is a separate, lazy-loaded TypeScript project module with its own controls, rendering, and lifecycle. They share the gallery, accessible controls, and a lightweight static-page shell.

## Run locally

Node.js 22 or later is recommended.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To make and serve the production build:

```sh
npm run build
npm run preview
```

Only `dist/` is needed on the web server.

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`. It builds, runs the browser suite, and deploys `dist/` whenever `main` is updated. It can also be run manually.

1. Push this project to a GitHub repository with a `main` branch.
2. In **Settings > Pages > Build and deployment**, select **GitHub Actions**.
3. Push a change to `main`, or run **Deploy to GitHub Pages** in the Actions tab.

The default build uses relative asset URLs. Both repository Pages (`https://<owner>.github.io/<repository>/`) and root/custom-domain Pages work without changing source code.

Experiment links use hash routing, for example:

```text
https://<owner>.github.io/<repository>/#/experiment/orbital
https://<owner>.github.io/<repository>/#/experiment/type
```

These URLs can be opened directly and refreshed without a server-side route fallback or a custom `404.html`. When hosting beneath a fixed path elsewhere, an explicit base can be supplied with `VITE_BASE_PATH=/your-path/ npm run build`.

## Interaction and accessibility

- The index has working category filters, grid/list layouts, and project search. Filter and layout choices survive a trip into an experiment.
- Open search with **Ctrl/Command + K**. Enter opens the first result; Tab moves through results; Escape closes a dialog.
- Every experiment has a **Play/Pause** control. Space toggles playback outside form controls and links; an experiment's own keyboard interaction takes precedence when its canvas is focused.
- The operating system's **reduced-motion** preference starts each artwork paused. Direct input and controls still work.
- Sound in Echo is **off by default** and starts only after an explicit click. No microphone access is requested.
- Touch dragging, narrow screens, high-density displays, keyboard controls, and visible focus states are supported.
- Rendering is paused while the browser tab is hidden. The homepage sculpture also rests when it leaves the viewport.
- The five WebGL experiments need hardware acceleration. A visible error with an alternative Canvas experiment is shown when WebGL is unavailable; the gallery retains an illustrated hero.
- Exports stay local. Afterimage's **Keep a print** button downloads an actual PNG, without uploading it.

## Project structure

```text
src/
  main.ts                 Gallery, hash router, search, dialogs, experiment shell
  catalog.ts              The collection manifest and lazy imports
  style.css               Editorial gallery design and responsive layouts
  core/
    types.ts              Shared experiment contract
    canvas.ts             Responsive, DPR-aware canvas and sizing utilities
    controls.ts           Labeled range, select, toggle, and button controls
    loop.ts               Pausable, visibility-aware animation lifecycle
    math.ts               Small deterministic math helpers
  gallery/hero.ts         Interactive homepage sculpture
  experiments/            Ten independent creative-coding projects
  styles/experiments.css  Shared experiment shell and toolbar styles
public/
  previews/               Real captures of each experiment, served locally
  cover.jpg               Actual homepage capture for social sharing
  favicon.svg
tests/                    Browser behavior and preview-generation scripts
.github/workflows/       Static GitHub Pages deployment
```

### Adding an experiment

Create a module that exports `mount(context: ExperimentContext): ExperimentInstance`, then add its metadata and dynamic import to `src/catalog.ts`.

The stage and toolbar are provided by the shell. An instance must implement `setPaused` and `destroy`, and may implement `reset`. Use `context.signal` for listeners, the shared loop for motion, and `context.report` for useful accessible feedback. Release renderers, geometries, materials, audio, observers, and animation frames on teardown.

Keep the default artwork composed and interesting before the first interaction. Every visible control must actually change the work. Prefer a specific visual idea over generic gradients, glass panels, decorative dashboards, or unnecessary UI.

### Browser suite and artwork captures

```sh
npx playwright install chromium
npm test
```

The suite covers all ten routes, real controls, pause behavior, navigation cleanup, search, filters, narrow viewports, reduced motion, and PNG downloads. Chromium's software WebGL backend allows the 3D projects to run in headless environments.

Canvas2D artwork is compared at the source-bitmap level so compositor color dithering cannot masquerade as motion. Audio coverage confirms that no sound starts before opt-in and that audio contexts close on navigation.

Point the same browser suite at a deployed site with `SITE_URL=https://<owner>.github.io/<repository>/ npm test`. All navigation is relative to that base, including direct experiment links.

Gallery images are real renders, not stock artwork or unrelated mockups. Regenerate them after changing an experiment:

```sh
npm run test:update-previews
```

Commit the updated `public/previews/*.jpg` files together with the source. Preview generation is opt-in and is skipped during ordinary test runs.
