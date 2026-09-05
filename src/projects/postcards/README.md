# Letters from Elsewhere

A standalone English reading website at `projects/postcards/`. Eight original
illustrated destinations follow Mara's correspondence with Kit: eight complete
letters, each with four substantial paragraphs. The geography, weather, customs,
people, and postage are explicitly fictional.

## Files

- `index.ts`: `mount(context)`, page layout, accessible selection/reading controls,
  download actions, and the locally kept letter satchel.
- `data.ts`: destination records, the postal route's order and coordinates,
  letter paragraphs, word counts, and saved-data validation.
- `illustrations.ts`: eight source-authored SVG landscapes and the imaginary
  atlas. No image service, remote asset, canvas, or generated map data is used.
- `postcard.ts`: escaped front/back markup, complete plain-text letters, and
  self-contained downloadable HTML postcards.
- `style.css`: the site's own readable baseline and responsive styles, scoped
  entirely to `.project-postcards`.
- `manifest.json`: collection discovery metadata; no shared registry changes.

## Editing a destination or letter

Edit its record in `data.ts`. `name`, `region`, `caption`, `weather`, and `custom`
appear in the atlas or beside the postcard. `title`, `date`, `salutation`,
`paragraphs`, `signoff`, `sender`, `address`, `enclosure`, and `marginNote`
form the actual addressed letter and its exports. Each paragraph is a separate
string; do not use HTML in content. `teaser` is an exact line from that letter
shown on the picture side. Reading time is calculated from the paragraph word
count at 180 words per minute, rounded up.

Destination array order is the postal route. Previous/next do not wrap: the
previous button is disabled at Aster Quay and the next button at Lantern End.
They retain the selected picture/letter side, so a reader can continue through
all the letters without flipping each one again.

## Map and illustrations

The map's viewBox is `0 0 420 300`. A record's `point.x` and `point.y` position
its ordinary HTML marker button; the dotted route is generated automatically
from those same coordinates in array order. The background islands in
`atlasMarkup()` are decorative, imaginary cartography. Keep marker centers far
enough apart for their 44-by-44-pixel touch targets at the narrowest map width.
The destination directory is an equivalent keyboard-friendly navigation path.

Each landscape in `illustrations.ts` has its own 800-by-490 composition and
descriptive accessible name. Its SVG geometry is trusted, locally authored
source, not interpolated user content. Add or replace geometry in the scene
record matching the destination ID. If adding destinations, extend
`DestinationId`, the scene record, and the introductory copy that says eight;
the directory, markers, route, counts, and navigation follow the data array.

## Useful actions

- Select any of the eight places using either its directory button or map
  marker. Active buttons have synchronized `aria-pressed` states.
- Switch between the illustrated picture and the complete addressed letter.
  No content requires hover, an animation, or a 3D transformation.
- Keep/unkeep a letter; reopen kept correspondence directly on its letter side;
  remove a particular kept item; download all kept letters in route order.
- Copy a complete letter, including its title, address, enclosure, and explicit
  fiction notice. Clipboard errors are reported; a blocked clipboard opens the
  current letter for manual selection.
- Download an individual `.txt` letter.
- Download an `.html` postcard containing both sides, all SVG artwork, inline
  readable styles, and print rules. It works offline with no scripts or remote
  assets. All dynamic HTML text is passed through `escapeMarkup`.

## Saved state, failures, and focus

The only localStorage key is `letters-from-elsewhere:kept:v1`. Its schema is:

```json
{ "version": 1, "ids": ["aster-quay", "paper-fen"] }
```

`isSavedLetters` accepts only this version, known unique destination IDs, a
maximum of eight IDs, and the expected object keys. Malformed JSON, unknown IDs,
duplicates, stale versions, and blocked storage cannot inject content or break
the atlas. Read/write failures are visibly and accessibly reported. When a save
fails, the in-memory satchel still works, but both the feedback and satchel
explanation clearly say the changes are only for this visit. Downloads remain
available. There is no account, synchronization, external API, or mail delivery.

Selection never replaces the directory, map buttons, or reading controls.
Desktop map/directory selection retains focus on the activated control. At
880px and below, those selections bring the newly selected postcard into view
and focus its title because the atlas follows the postcard in the document.
Previous/next, reopening a kept letter, and the lower flip shortcut similarly
focus the postcard title. Removing a kept letter focuses the next remove
button, or the satchel heading if it is empty. Place changes, side changes, and
action results use a local polite live region.

All listeners use `page.signal`; no timers, observers, animation loops, or
other site-owned asynchronous resources need cleanup. The instance returns
`{ destroy: page.destroy }`. Clipboard completions check the signal before
updating the page. The core download helper owns its short-lived object URLs.

## Validation

Focused browser coverage lives in `tests/projects/postcards.spec.ts` and visits
`./projects/postcards/`. It covers map/directory equivalence, all eight complete
letters and distinct landscapes, both postcard sides, bounded route navigation,
kept-state persistence/removal, text/HTML downloads, invalid/blocked storage,
clipboard fallback, and a 375px layout. The collection coordinator runs the
browser batch and visual review; this site does not start a separate server.

For a type check isolated to this site, use the existing TypeScript executable:

```sh
./node_modules/.bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable \
  --module ESNext --moduleResolution Bundler --strict --noUnusedLocals \
  --noUnusedParameters --skipLibCheck --types vite/client,node \
  src/projects/postcards/index.ts tests/projects/postcards.spec.ts
```
