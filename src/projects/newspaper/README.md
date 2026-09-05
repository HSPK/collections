# Signals from 2086

A complete, original English-language fictional future newspaper. The single
edition, dated **18 September 2086 inside the fiction**, follows the invented
coastal city of Port Meridian and a lunar seed library. It is not current news,
a prediction, a real municipal service, or engineering guidance.

The broadsheet has seven full stories, each approximately 340–360 words, with
individual reading views, original editorial SVGs, captions, and story-specific
margin notes. A sticky fiction notice remains visible while reading. The front
page is a hand-composed newspaper: a substantial lead, a lunar dispatch, an
editorial rail, and differently proportioned transport, ecology, and culture
columns, not a uniform article-card grid.

## Files

- `manifest.json` — collection discovery metadata; register this only after the
  complete site is present.
- `index.ts` — `mount(context)`, scoped event delegation, reader preferences,
  route rendering, focus management, and cleanup.
- `data.ts` — typed sections, edition metadata, seven original stories, lookups,
  and a reading-time estimate of 180 words per minute.
- `illustrations.ts` — seven original line drawings, assembled from inline SVG
  paths and small repeated engraving details. No external assets or SVG IDs.
- `routes.ts` — pure hash parsing and descriptive document titles.
- `views.ts` — escaped semantic HTML for the masthead, front page, articles,
  section archives, reading list, colophon, about page, and missing-page state.
- `style.css` — all selectors belong to `.project-newspaper`; responsive
  broadsheet, reading-size variables, focus treatments, and print layout.
- `../../../tests/projects/newspaper.spec.ts` — focused browser coverage.

## Content model

Each `Story` has a unique URL-safe `id`, a section ID, kicker, headline,
standfirst, fictional author and dateline, illustration key, accessible image
description, caption, full plain-text paragraphs, pull quote, and a structured
sidebar. The sidebar includes a title, label/text pairs, and a fiction or
design-limitation note. The pull quote repeats an actual sentence in the story;
it is never presented as testimony from a real person.

All story text passes through `escapeMarkup`. Keep content plain text rather
than adding HTML to paragraphs. The image description should explain the
composition and information, not merely say “illustration.” Captions carry
details outside the SVG so they remain readable at phone widths.

### Add or edit a story

1. Add a complete `Story` to `stories` in `data.ts`. Use an existing section ID,
   or extend `SectionId` and the `sections` array together.
2. Supply meaningful paragraphs, a standfirst, and specific side notes. Retain
   the publication’s persistent fiction framing. Avoid invented real-world
   circulation figures, purported breaking news, or actual service promises.
3. Add an illustration key and drawing as described below, or deliberately
   reuse an appropriate existing drawing with an accurate description.
4. Section listings, article routes, reading-time estimates, reading-list
   eligibility, and next-story navigation pick up the new item automatically.
5. The front page is intentionally curated. Its current seven positions are
   assigned by the `stories` array order inside `renderFrontPage()`. Adjust
   that composition when adding/removing a story rather than silently
   dropping a story into an eighth identical card. Update the explicit
   “seven stories” edition/about copy and test counts if the edition grows.

The story order is currently cloud, seeds, train, river, repair, shadows, and
editorial. Reordering also changes the “Next story” sequence.

### Add an illustration

Extend `IllustrationId` in `data.ts`, then add a drawing function to the
exhaustive `drawings` record in `illustrations.ts`. Draw within the common
`0 0 800 480` view box. Use:

- `.nw-svg-paper` for paper-filled shapes;
- `.nw-svg-wash` for pale secondary surfaces;
- `.nw-svg-solid` for ink fills;
- `.nw-svg-fine` for engraving/detail strokes;
- `.nw-svg-accent` for vermilion;
- `.nw-svg-route` for the dashed illustrative route.

`renderIllustration()` adds the SVG wrapper, `role="img"`, escaped accessible
name, and title. Drawings do not need timers, observers, IDs, remote fonts,
embedded text, animation, or network access. These are editorial diagrams,
not technically validated construction plans.

## Article routing

The standalone URL is `projects/newspaper/`. Hash links remain relative to that
URL, so a nested hosting base needs no special case.

| Hash | View |
| --- | --- |
| Empty hash or `#front-page` | Complete broadsheet front page |
| `#article/cloud-library` | Individual full story, by story ID |
| `#section/city` | Section archive, by section ID |
| `#reading-list` | Locally saved articles or an explicit empty state |
| `#about` | Fiction, authorship, content, and interaction explanation |

Direct navigation, reload, browser back, and browser forward all render from
the current hash. A decoded unknown ID, extra path component, or malformed
encoding gets an honest missing-page view, never an unrelated substitute
article. Its displayed address is escaped.

Navigation updates the current-section indicator and document title. Following
an internal route focuses and scrolls to its heading; initial load does not
steal focus. Article breadcrumbs and end-of-story links lead to real sections,
the front page, and the next full story. Modified link clicks retain ordinary
browser behaviour. The newspaper’s skip link focuses the current view without
changing its hash. The collection’s `#main-content` skip anchor is not treated
as an article-navigation request.

## Reading controls and storage

- **Save for later** toggles an article in the reading list.
- **Remove** works from the reading-list view. Focus moves to the next available
  remove button, or the list heading when it becomes empty.
- **Larger type** changes body-reading sizes throughout the edition; it is a
  labelled pressed-state toggle, not a decorative icon.
- **Print this story** invokes the browser’s print dialog only on request.
  Print CSS simplifies the current article and retains its fiction notice,
  full text, illustration, and notes. No print service is contacted.

The sole newspaper storage key is `signals-from-2086:reader:v1`. Its schema is
`{ version: 1, saved: string[], largeType: boolean }`. Validation requires known,
unique article IDs and bounds the list to this edition. `readLocalData` and
`writeLocalData` supply visible failures through both the publication’s live
status and `page.report`. If storage is blocked, the controls continue working
in memory; changes cannot survive a reload. Invalid old data is not trusted.
There are no accounts, uploads, analytics, or remote feeds.

## Lifecycle and accessibility

`mount()` imports the scoped stylesheet and creates its root with
`createProjectPage(context, 'newspaper')`. It returns `{ destroy: page.destroy }`.
All click and hash listeners use `page.signal`. `page.onCleanup` restores the
previous document title without overwriting a title another page has set.
There are no timers, observers, sounds, animation loops, or background requests.
No global body or collection wrapper styles are changed.

The publication owns its H1, English language declaration, navigation, and
content. It uses real anchors, named navigation landmarks, visible keyboard
focus, pressed/current states, live feedback, semantic paragraphs, descriptive
SVGs, and generous primary control targets. Narrow screens stack the editorial
columns into a natural-height document. No fixed reading viewport is required.

## Validation

Run the existing focused runner from the repository root:

```sh
npx playwright test tests/projects/newspaper.spec.ts
```

The spec covers all seven complete articles, section routes, reload and browser
history, reading-list/type persistence, empty and unknown states, malformed
hashes, invalid/blocked storage, keyboard focus, and 375px overflow. It uses the
repository’s configured development server or `SITE_URL`; it adds no tooling
or dependencies. A build or full collection suite is not required for this
project-specific check.
