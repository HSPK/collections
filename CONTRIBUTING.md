# Bring your own strange little website

**AI-generated and AI-assisted websites are welcome here.** If you made
something useful, delightful, educational, or unexpectedly interesting,
open a pull request. A small finished idea is better than an ambitious
placeholder.

You do not need to reproduce the collection's visual style. Each project is
an independent website with its own layout, content, and interaction. The
index only helps people discover it.

## A quick path from idea to pull request

1. Fork the repository and create a branch for your project.
2. Install the existing dependencies with `npm ci`.
3. Run `npm run new:project -- my-idea --title "My Idea" --category create`.
4. Run `npm run dev` and open `/projects/my-idea/`.
5. Replace the starter with your actual website, update its content and
   extension notes, and add focused behavior coverage.
6. Run `npm run build` and `npm test -- tests/projects/my-idea.spec.ts`.
7. Open a PR with a short description and screenshots or a recording.

The starter command creates the project folder, a local SVG cover, and a
focused browser spec. It assigns the next available order and refuses to
overwrite existing files. No manual route or index registration is needed.
If another merged PR has taken the same order, rebase and update your
manifest to an unused order.

## What belongs in the collection

Tools, games, stories, visual experiments, educational explanations,
mechanical models, unusual interactions, and ideas without an obvious
category all belong. Your project may be quiet and mostly readable, or
highly interactive. It does not have to call an AI service: the point is
what you made with AI, not whether it needs an API key.

We look for a specific idea, real content or behavior, and a usable first
screen. Please avoid copied templates with only a different title, giant
marketing introductions before the actual tool, fake statistics, inert
buttons, and unfinished demos presented as complete.

## Project structure

```text
src/projects/my-idea/
  manifest.json
  index.ts
  data.ts
  engine.ts       # when the project has meaningful rules or math
  style.css
  README.md
```

The exact internal structure can grow with the project. Keep content,
presets, models, rendering, and UI separated when doing so makes the
website easier to extend. Use `src/core` helpers rather than copying
browser lifecycle, storage, download, or audio workarounds.

### Model-powered games

Agent games are welcome too. Set `"runtime": "openai-compatible"` in the
manifest so the library, search, and standalone metadata disclose the
requirement before someone plays. Omitted runtime means local; do not label a
local generator as a hosted model.

Use the [shared agent and replay contracts](src/core/agents/README.md), not
another hand-written API client. Keep model roles and tool schemas separate
from pure, authoritative game rules and rendering. Validate every action's
IDs, phases, budgets, and legality before an atomic revision-checked commit.
Model prose must not decide scores or execute code. API failure must leave a
recoverable, honest state, not silently substitute a scripted opponent.

Provide a complete game loop, readable model-required setup, a playable
ending and restart, deterministic native-tool fixtures, and cancellation and
replay coverage. No external model requests in CI. Document the exact
observations sent and meaningful agent decisions. Keys belong in a
user-controlled server-side gateway, or optional browser memory only; never
in source, URLs, storage, replays, screenshots, or fixture recordings.
GitHub Pages does not run a backend. Explain a supported
[connection path](docs/model-connections.md), including CORS and billing limits.

Read [the authoring guide](src/projects/README.md) for the manifest and
`mount(context)` contract. `format` is always `page`. Styles should be
scoped to `.project-my-idea`; do not restyle the index or other websites.
The site already supplies a collapsible floating collection menu.

The current stack is TypeScript, DOM/SVG/Canvas, Three.js, and Web Audio.
Prefer the existing dependencies. Propose significant framework or package
changes in an issue before coupling a small contribution to a new stack.

## Before you submit

- Make controls do what they say. Include sensible initial content,
  explicit errors, reset/back paths, and keyboard or touch alternatives.
- Keep essential UI readable: roughly 16-18px body copy and at least 14px
  controls and labels. A 320px screen should not acquire document-level horizontal
  scrolling for universal projects. A deliberately keyboard/mouse-only game
  may declare `"platform": "desktop"`; the library labels that limitation and
  its supported layout contract is tested at desktop sizes instead.
- Keep interaction-led sites in one viewport, with primary controls beside
  their result. Use compact docks or explicit panes on phones and bounded
  panels/dialogs for long notes or inspectors. Do not conceal offscreen controls
  with overflow clipping. Reading-oriented sites can keep natural document flow.
- Respect reduced motion and provide pause controls for ongoing motion.
  Audio, microphone, or other sensitive input must be explicitly enabled.
  Never record or upload microphone input without a separately reviewed
  requirement; include a non-microphone alternative.
- Release animation frames, timers, listeners, media tracks, audio graphs,
  renderers, geometry, textures, and observers when leaving the site.
  Phaser projects should reuse `src/core/phaser/` for scene ownership, modal
  and visibility pausing, fixed-step timing and teardown. Keep renderer
  dependencies lazy, pool effects, and document measurable resource budgets.
- Do not include API keys, credentials, private prompts, personal data,
  trackers, or undocumented network calls.
- Explain approximations. A toy model is welcome; fake scientific results
  or claims that a handcrafted demo is a production LLM/VLM are not.
- Submit original work or clearly licensed material. Credit imported
  assets and dependencies. AI assistance does not remove copyright or
  licensing obligations.

The repository does not currently declare a blanket license. Do not
assume every public file or imported asset is unrestricted; flag licensing
questions in your PR rather than silently adding a new license.

## Covers and documentation

Prefer an actual screenshot of the useful part of your site, not unrelated
stock art. Add `data-project-preview` to the main workspace or content
region. Remove the starter's custom `preview` field, then run:

```sh
npm run test:update-previews -- --grep "Capture my-idea$"
```

Commit `public/previews/my-idea.jpg` with the site. A deliberate local SVG
or other custom cover is also supported through the `preview` field.

Your project README should explain what works, where its content/rules
live, how to extend it, and any important limitations. Mention AI tools if
you wish, but **do not paste private prompts or conversations**.

## Review and merge

Pull requests run read-only build/browser checks without deployment
permissions. Maintainers review behavior, accessibility, content, resource
cleanup, originality, and how the website fits the collection. A green
check is necessary, not automatic approval.

Keep a PR focused on one project or one coherent improvement. After a
maintainer merges it, the main-branch workflow publishes the static
website through GitHub Pages. You remain welcome to improve and maintain
your project after it lands.

Have an idea but not an implementation yet? Use the **Project idea** issue
template. Found a broken interaction? Use **Website bug** and include the
project URL and a reproducible sequence.
