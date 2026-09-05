# Atlas of Impossible Weather

A standalone, English-language fictional expedition atlas. The entire website
lives in this directory. It uses system fonts and original inline SVG; it does
not request a location, call a weather API, load external assets, or use a real
clock to choose a forecast.

## Files and entrypoint

- `index.ts` exports `mount(context)`. It owns the page, controls, hash routing,
  accessible announcements, and local packing checklists.
- `data.ts` contains all six destinations, their geography, equipment, fictional
  units, and the 24 authored forecast records.
- `diagrams.ts` draws the expedition map and six different landscape sections.
  Drawings are deterministic SVG strings, not images or gradient presets.
- `style.css` scopes every selector to `.project-weather`. The layout is a
  natural-height editorial page; at narrow widths the selected station appears
  before the full destination index.
- `manifest.json` registers this page with the collection. No central catalog,
  router, or build configuration needs an entry.

The entrypoint uses `createProjectPage(context, 'weather')` and returns only
`{ destroy: page.destroy }`. There is no playback or animation state.

## Content model and stable timeline

`Destination` has a permanent URL-safe `id`, printed station number, region,
invented grid reference, map point, `landscape` renderer key, two substantial
geography paragraphs, an approach, observatory information, three diagram
feature descriptions, a local measure, packing items, and
`Record<WatchId, Forecast>`.

The fixed expedition date is **18 Mothmonth, Year 07**. Every destination shares:

| Watch ID | Printed watch | Fictional expedition time |
| --- | --- | --- |
| `dawn` | Dawn | 06:00 |
| `noon` | Noon | 12:00 |
| `dusk` | Dusk | 18:00 |
| `night` | Night watch | 23:00 |

These are four records from one invented day, not a rolling forecast and not
the visitor's time zone. Loading the same destination and watch always produces
the same readings, advice, log, and illustration. No random seed, date API,
geolocation, or network data is involved.

Each `Forecast` includes `short`, `condition`, `warmth`, `wind`, `direction`,
`veils`, the station-specific `reading`, a synopsis, an expedition route note,
an observer's field note, recommended packing IDs in `kit`, and a `packingNote`.
Recommendations do not automatically check a visitor's equipment.

## Fictional units

The visible unit key explains every displayed measure; these units have no
conversion to real weather or safety measurements.

- **°h / hearth reading:** an imaginary warmth scale. Zero means frost on a
  sleeping kettle; twenty means a sun-warmed stone. Negative values are colder.
- **Ribbons / wind pull:** 0–12 ribbons held taut on the invented vane.
- **Veils / sky opacity:** 0–10 hidden sightglass bars. Higher is less clear.
- **Rungs / sky-tide height:** the Upper Sea's height on Pelagic Stair's gauge.
- **Chimes / glassfall:** beads caught in a cup per bell swing, not sound volume.
- **Voices / dune chorus:** distinct tones separated by a twelve-tooth fork.
- **Beats / shadow lag:** delay before a reflection follows the reference staff.
- **Upsteps / snow ascent:** highest step reached on a twelve-step snow ladder.
- **Spools / aurora fall:** condensed sky-thread collected per coast-bell swing.

The per-station `measure.maximum` documents the instrument range. Keep readings
within it. In particular, a higher sky tide must be drawn higher, more glassfall
must show more beads, and a longer shadow lag must show a larger displacement.

## Adding a destination

1. Add a new `Destination` in `data.ts` with a unique, stable lowercase ID and
   station number. Supply geography specific to that place, not a condition
   template with the nouns changed.
2. Choose an unused point inside the map's `380 × 310` viewBox. Add or reshape
   its landform in `renderAtlasMap`; the marker and index link are generated
   from the destination record.
3. Define a comprehensible local measure, range, and four compatible forecasts.
   Check that the changing numbers agree with the route advice and field notes.
   Each `kit` entry must match a packing item's permanent ID.
4. Use an existing appropriate landscape or add a distinct renderer as below.
   Set `diagramDescription`, `section`, and all three feature labels.
5. Update the introductory six-place count and any deliberately fixed editorial
   wording. Add the new destination to the focused test expectations.

To add a watch instead, extend `watches`, provide that record for **every**
destination, and adjust the watch-grid columns and “other three watches” copy.
The `Record<WatchId, Forecast>` type prevents silently missing a forecast.

## Adding or extending an illustration

1. Extend the `Landscape` union in `data.ts`.
2. Add a pure `(forecast: Forecast) => string` renderer in `diagrams.ts`, using
   the existing `960 × 620` drawing space and blue/ivory/yellow palette.
3. Register it in `sceneRenderers`; the `satisfies Record<...>` check requires
   every landscape type to have a renderer.
4. Give the place a real silhouette and terrain structure. Drive the unusual
   phenomenon from its `reading`, with other relevant instruments affecting
   marks or density. Do not merely recolor the shared sky.
5. Place the three large numbered callouts and match them to `features`.
   Captions and metric labels are HTML so they remain readable on small screens.
6. Keep an informative SVG title and description. IDs are prefixed
   `weather-`; one landscape and one map exist at a time. Escape any new authored
   strings before inserting them into markup.

The shared sky changes between the four watches without animation. Landscape
geometry changes separately: floating tide height, falling glass density,
resonance arcs, reflection displacement, climbing snow, and aurora threads.
Yellow indicates the measured phenomenon, not an alarm severity.

## Hash browsing and keyboard controls

Canonical route shape:

```text
#weather/pelagic-stair/dawn
#weather/umbra-marsh/night
#weather/lantern-shelf/dusk/packing
```

An optional fourth segment can be `index`, `station`, `notes`, `packing`, or
`units`; it focuses and scrolls to that page section. A destination-only link
such as `#weather/glass-orchard` selects Dawn. Invalid atlas routes fall back to
Pelagic Stair at Dawn with an accessible announcement. Unrelated fragments are
left alone for the enclosing page's anchors.

The six visible index links, glossary links, and other-watch notebook links are
ordinary anchors. The current watch is retained when choosing another place.
Hash changes are separate history entries, so browser Back/Forward works.
Selecting a place moves focus to its station; changing a radio watch keeps
keyboard focus on that native radio control. The native radio group supports
Tab, arrow keys, and Space. Checkboxes, anchors, buttons, and the expandable
field log use their native keyboard behavior.

## Local checklist and versioning

Storage key: `atlas-impossible-weather.packing.v1`

```json
{
  "version": 1,
  "packed": {
    "pelagic-stair": ["boots", "cup"],
    "lantern-shelf": ["wrap"]
  }
}
```

`readLocalData` uses `isPackingState`, which checks the version, record shape,
known destination IDs, known item IDs, array bounds, and duplicate items.
Malformed, removed-item, or older-version data is rejected with visible storage
feedback; the atlas still works in memory. `writeLocalData` reports a denied or
full storage area and never falsely claims a successful save.

Checks persist by destination, independently of the watch. “Clear this station's
checklist” removes only that destination's checks and returns focus to its first
checkbox. No reset touches other websites' storage. Keep packing IDs stable.
For an incompatible schema change, add an explicit migration or bump both the
key and payload version; do not silently reinterpret old checks.

## Cleanup, accessibility, and validation

All custom listeners use `page.signal`, including the window's `hashchange`
listener. `page.destroy` aborts them and removes the page. There are no timers,
observers, animation frames, audio nodes, or object URLs. If adding any, register
their disposal with `page.onCleanup`. There is no motion to disable for reduced
motion users, and section navigation scrolls without animation.

The fictional-service notice stays visible while scrolling. Essential text is
at least 12px; prose is 15–18px. Selection is communicated by native checked
state or `aria-current`, not color alone. The layout has no fixed-height art
container and no page-wide horizontal scrolling at 375px.

Focused browser coverage lives in `tests/projects/weather.spec.ts`:

```sh
npx playwright test tests/projects/weather.spec.ts --workers=1
```

Use the existing Playwright runner (port 4173, or its `SITE_URL` override). The
spec exercises destination browsing, coherent watch updates, deep links,
history, keyboard controls, checklist persistence and failure handling, and
the narrow layout. No snapshot or screenshot updates are required.
