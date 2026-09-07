# Zine Machine

A standalone, local-first eight-page mini-zine studio at `/projects/zine/`.
Three original starter books, three ink treatments, a deliberately blank
starter, full-size reading copy, eight-page navigation, live text editing,
undo/redo, and A4/US Letter SVG export. No network services or extra packages.

## Where things live

- `data.ts`: original starter text and theme definitions. `makeStarter` clones
  the originals so editing never mutates the library.
- `engine.ts`: document validation, grapheme-aware wrapping, physical geometry,
  text measurement, and layout. There are no starter-content dependencies.
- `artwork.ts`: original burst, botanical, and orbit vector treatments.
- `svg.ts`: XML-safe, editable-text sheet export; no images or foreign objects.
- `state.ts`: validated local storage and bounded, immutable undo history.
- `index.ts` / `style.css`: the complete site; styles stay under `.project-zine`.

The reading worktable fills the remaining viewport height rather than the document.
Desktop shows the reading copy and writing fields together. Narrow and short
screens use **Reading copy / Write** tabs; **Edit text** opens and focuses the
current editor without moving the document. Long writing scrolls only inside its
reading copy or text area. Shared previous/next controls retain the selected page
across panes and ink changes. **All pages**, **Starter library**, **How to fold**,
**Ink & export**, and **Draft & save details** are labeled native dialogs with
Escape/Close and restored trigger focus. The original explanations, starter
gallery, artwork, fold diagrams, and save warnings remain available in them.
Validation failures appear immediately in the workspace, with the full text
preserved and invalid changes excluded from local storage and export.
`data-project-preview` marks the worktable rather than the branding.

To add a starter, provide eight `{ heading, body }` pages in `data.ts`.
The document title is the cover headline; page 1's heading is its subtitle.
Blank headings/text are allowed, but the title is required. Add a new theme ID
in `engine.ts`, then its palette/fonts in `data.ts`, artwork if needed, and a
scoped swatch in CSS. Check all starters on both paper sizes after changes.

## The fold is the format

Landscape A4 is **297 × 210 mm**; Letter is **279.4 × 215.9 mm**. Four equal
columns and two rows produce **74.25 × 105 mm** or **69.85 × 107.95 mm** pages.

```text
          top row, rotated 180°
          [ 5 ][ 4 ][ 3 ][ 2 ]
          [ 6 ][ 7 ][ 8 ][ 1 ]
          bottom row, upright
```

Cut **only** along `y = height/2`, from `x = width/4` to `x = 3*width/4`.
All three vertical grid lines are folds, not cuts. The uncut leaf pairs are
1–2, 3–4, 5–6, and 7–8; the neighboring reading spreads are 2–3, 4–5, and 6–7.
This also places cover 1 next to back 8 when the cross closes. Tests assert
these edge relationships, every slot/rotation, and the actual SVG coordinates.
The UI explains the creases, folded-edge scissor cut, long fold, and collapse.
For another explanation of the standard construction, see the
[single-sheet mini-zine tutorial](https://zacharykai.net/tools/minizine).
Our text, illustrations, and implementation are original.

Print **landscape, single-sided, 100% / actual size**, on the matching paper.
Disable fit/shrink, page margins, headers, and footers. Artwork has 6 mm safe
margins within every panel. Optional dashed gray folds and a solid red cut are
part of the exported SVG. No page-print button is offered: collection chrome
can never enter the downloaded sheet. Browser printing also prepares a separate
physical-size sheet in `beforeprint`; screen-only flex heights and hidden panes
never constrain printed pages. A4 and Letter use their own landscape `@page`
size and zero margins. Invalid drafts print an explicit warning instead of a
stale or cropped sheet.

## Text and drafts

Lengths count graphemes, including line breaks: title 60, heading 44, body 360
(cover 180; back 240). A separate 16× UTF-16 safety ceiling limits pathological
combining sequences. Words wrap first; long tokens wrap only at whole grapheme
boundaries. Hard breaks and whitespace survive. Layout reduces artwork, then
body size, never below 3.25 mm / 9.21 pt. Length limits are ceilings, not a
guarantee that every arrangement of line breaks will fit.

Unfit or invalid text remains fully visible and editable, with explicit errors;
export and autosave pause. The last valid local draft is left untouched.
Valid drafts save synchronously to `odd-index.zine.draft.v1`; storage failure
and corrupt/version-mismatched drafts are reported. History is session-only,
up to 60 steps, with adjacent typing coalesced. Starter/reset actions undo.

SVG uses system fonts and per-line `textLength` to preserve physical fit across
font fallbacks. Unavailable glyphs, especially emoji, still depend on the
viewer's fonts and printer; check a proof copy. Printing behavior also depends
on the SVG viewer. Export includes the authored document as XML-safe metadata.

## Focused validation

```sh
npm test -- tests/projects/zine.spec.ts --reporter=line
```

Engine tests cover geometry, leaves/spreads, all starter/paper/style combinations,
Unicode and whitespace preservation, fit rejection, valid/safe/complete SVG,
storage errors, and undo/redo. Browser tests mount this module in a routed test
fixture, independent of the collection frontend, and exercise editing, keyboard
navigation, persistence, downloads, over-budget recovery, and abort/remount.
Standalone workflows additionally cover 1440×900, 1280×720, 375×812, 320×640,
768×480, theme/selection retention, reversible resets, and screenshot artifacts.
Print-media tests verify all eight panels and actual millimeter dimensions from
a small-screen session on both papers.
The browser fixture isolates only Vite's development-reload socket, preventing
unrelated site edits from resetting a live writing session during validation.
If no development server is ready, engine tests can run without one:

```sh
SITE_URL=http://127.0.0.1:4173 npm test -- tests/projects/zine.spec.ts --reporter=line --grep "zine engine"
```
