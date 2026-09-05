# The Museum of Unmade Things

A standalone, English-language fictional museum at `/projects/museum/`.
Ten original speculative objects occupy four rooms. Every maker, date,
acquisition, and provenance is invented; that distinction appears in the
gallery, object records, curatorial note, and exported text.

## Files and exhibit model

- `index.ts` mounts the complete page with `createProjectPage(context, 'museum')`.
  It owns the masthead, anchor navigation, room filters, gallery, object dialog,
  curatorial note, and catalog controls.
- `data.ts` defines typed rooms and `Exhibit` records. Each record has an
  accession, imagined maker/date, proposed dimensions, classification, a wall
  label, drawing caption, substantial story, imagined provenance, material
  notes, care instruction, and a question to take away.
- `diagrams.ts` holds ten distinct original inline SVG object studies. No
  remote images, fonts, APIs, canvas, or external asset requests are used.
- `style.css` scopes every rule to `.project-museum`, including the local
  baseline, responsive rules, dialog, and focus states.
- `manifest.json` is the collection discovery record, added only after the
  implementation exists.

## Browsing and room filters

The initial view contains all ten objects in a deliberate sequence, with
alternating paired labels and full-width object studies. Every object has
enough prose to be understood without opening its detail.

Filter buttons form a labeled group, use `aria-pressed`, and show counts
calculated from the records. Filtering updates the heading, room description,
live result count, and gallery. It does not move keyboard focus or navigate
away. The first object in each room receives the larger opening treatment.
The three masthead links use native document anchors; no client router is
required.

## Object reading and cleanup

Each story opens a native modal `dialog`. It has a labeled heading, a summary,
and a visible sticky close button. Initial focus moves to the heading;
Escape uses native dialog behavior, and closing restores focus to the gallery
button. Previous/next buttons stay within the selected room. The content
scrolls inside the viewport-sized dialog, including at 375px, without fixing
or changing the document body's scroll styles.

All JavaScript listeners use `page.signal`. `page.onCleanup` closes any open
dialog; `mount` returns `{ destroy: page.destroy }`. There are no custom
timers, observers, storage, audio, or background processes.

## Real catalog actions

Entry and full-catalog controls use the shared `copyText` and `downloadText`
helpers. Both formats include complete stories, notes, and the fiction
disclaimer, not just titles or summaries. Exports are plain text; the UI
explicitly states that diagrams are not included. The full catalog always
contains all ten objects, even while a room is filtered.

Clipboard/download feedback is available within the page and dialog as well
as through `page.report`. A blocked clipboard reports the failure and points
to the download alternative. Late clipboard feedback is ignored after
unmount.

## Adding an object or drawing

1. Add a URL-safe ID to the `DiagramId` union in `diagrams.ts`.
2. Add a distinct SVG study and a useful plain-English description to the
   typed `drawings` record. Use the `600 x 390` viewBox. The wrapper supplies
   unique title/description IDs for gallery and detail instances. Keep all
   essential labels in HTML rather than tiny text inside the drawing.
3. Add a complete `Exhibit` in `data.ts`, assigning an existing `RoomId` and a
   unique accession such as `U.04.004`. Dates and provenance must remain
   explicitly fictional. The story should explain the need and limits of
   the object, not merely advertise its imagined capability.
4. Insert it at the intended position in the curated sequence. Counts,
   filtering, dialog navigation, and text exports derive from the data.
5. If introducing a room, extend `RoomId` and add its number, full name,
   short filter label, and introduction to `rooms`.
6. Update editorial text that explicitly says "ten" or "four" if changing the
   collection size, and keep the manifest description accurate.

There are no working engineering plans: even plausible materials always
meet an explicitly impossible one. Any future local shared asset should use
the helpers in `core/urls.ts`, not an absolute root-relative URL.

## Focused validation

`tests/projects/museum.spec.ts` covers complete initial labels, room filters,
story dialog semantics and focus return, actual text exports, clipboard
feedback, and a 375px viewport. The parent integration owns execution of
these browser tests. A project-only TypeScript check can target `index.ts`
with the repository's strict ES2022/Bundler compiler settings.
