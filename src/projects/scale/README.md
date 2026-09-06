# The Scale of Things

A standalone educational field atlas at `/projects/scale/`: seventeen
source-backed reference lengths, from a DNA helix to the Milky Way's stellar
disk. The design uses warm paper, ink, vermilion rules and original inline SVG
plates. There are no runtime network requests, remote assets or dependencies
on another project's private code.

## Files and lifecycle

- `index.ts` exports `mount(context: ProjectContext): ProjectInstance`.
  It creates an auto-height `.project-scale` root with
  `createProjectPage(context, 'scale')` and returns `{ destroy: page.destroy }`.
- `data.ts` owns the catalogue, domains, source ledger and comparison presets.
- `engine.ts` contains pure conversion, logarithmic-coordinate, nearest-reference,
  ratio, model-rescaling and number-formatting functions.
- `illustrations.ts` contains the original decorative vector drawings.
- `style.css` is imported by the entrypoint; every selector is project-scoped.
- `manifest.json` registers the completed page with the collection.

All event listeners use `page.signal`. No observers, animation loops,
background timers, storage or persistent page state are used. The export uses
the shared `downloadText` helper, which revokes its own object URL. Destroying
the page aborts listeners and removes the page root. The collection supplies
only its floating collection menu, not this site's heading, navigation or content.

## Behaviour

The initial plate is a 30 m large-adult blue whale. The initial comparison is
that whale against the Eiffel Tower's 330 m antenna-inclusive height: B/A = 11.
Making A 10 cm long therefore makes B 1.1 m tall.

The compact masthead opens on the comparison, not an oversized introduction.
Its `data-project-preview` workspace places the two references and calculated
ratio side by side on desktop. The logarithmic explorer follows the comparison;
the extended atlas introduction remains in How to read.

The explorer and the comparison are deliberately independent. Use “Compare
as A/B” to transfer a reference. The explorer supports a native reference
select, previous/next references, domain jumps and a continuous logarithmic
ruler. The catalogue supplies search, domain and object/distance filters,
full field notes, source links, and assignment to either comparison side.
Clearing filters restores all entries; “Full field note” also clears filters
so that its destination cannot be hidden.

The comparison has two selects, suggested pairs, a reversible swap, display
units, a linear ratio ruler, and a custom model-length calculation. Selecting
the same reference twice is valid and produces 1:1. Swapping leaves the model
input attached to **the new A**, and recalculates B. Invalid, empty, non-finite,
zero, negative or out-of-range model inputs receive inline feedback and
disable export. Accepted inputs are 0.000001–1,000,000 in the chosen model unit.
The downloadable text includes the pair, dimensions, quotients, model,
uncertainty notes and both sources; it is generated locally.

## Coordinate and unit rules

**Canonical quantities are positive, finite lengths in metres.** Use
`toMetres(value, unit)` in data rather than scattering conversion factors.
Supported internal unit keys are `nm`, `um`, `mm`, `cm`, `m`, `km`, `au`, `ly`;
the `um` key displays as `µm`. SI prefixes use powers of ten. An astronomical
unit is exactly 149,597,870,700 m. A light-year uses the vacuum light speed
299,792,458 m/s times a Julian year (365.25 × 86,400 seconds); it is a length,
not a duration.

The ruler bounds are whole powers of ten derived from the catalogue.
Its normalized position is
`(log10(metres) - log10(min)) / (log10(max) - log10(min))`.
Each keyboard increment is 0.05 orders. The probe does not pretend to be an
entry's exact length: the visible probe value and the nearest reference are
identified separately. Nearest means smallest absolute log difference, with
ties going to the smaller reference. Gaps in the catalogue are real gaps,
not evenly spaced fictional specimens.

`compareLengths(A, B).aOverB` always means **A/B**, never “larger/smaller.”
The latter is a separate field. Model B is `(real B / real A) * model A`.
Comparison bars use linear `length / max(A, B)` shares with no minimum width.
If one is below 1%, the caption warns that it may not be visible. Ratios are
rounded for reading and do not acquire extra measurement precision.

Drawings use a **560 × 330 SVG viewBox**, in arbitrary illustration units,
not metres or geographic coordinates. They are schematic, independently
rescaled identification plates; even the route, DNA and orbital drawings
are not measurement diagrams. SVG guide lines identify a dimension but are
not calibrated. Only the dedicated comparison bars share a physical ratio.
Do not apply a minimum pixel size to those bars.

## Extending the atlas and its sources

1. Add or reuse a source in `sources`, using an HTTPS link to a publisher,
   scientific institution, standard or reliable educational reference.
   The linked page must actually support the chosen quantity.
2. Add a `ScaleEntry` in increasing metre order with a unique URL-safe id.
   Name the precise dimension: diameter vs radius, height vs circumference,
   and length along a route vs point-to-point distance.
3. Set `kind: 'distance'` for intervals, separations and routes. Do not present
   the distance to a star as the star's size. Scope orbital means and galaxy
   extents explicitly.
4. Supply a preferred unit, significant-digit cap, approximation flag,
   qualification, original summary/context, a caveat and a source note.
   Do not treat a selected representative inside a range as a measured mean.
   Do not silently replace an average with a maximum.
5. Add a distinct original illustration key to `IllustrationId` and the
   exhaustive drawing record, or deliberately reuse a suitable plate.
   Keep the SVG decorative, inline, self-contained and free of external
   images, scripts, ids that collide between instances, or copied artwork.
6. Add an appropriate domain/preset if useful. Update the focused tests when
   making a deliberate change to a landmark value or a unit convention.

### Important source qualifications

Source review: 2026-09-05. Notes in the live catalogue are authoritative for
how each number is used. In particular:

- The 0.5 mm sand grain is selected inside USGS's size class, not a reported
  mean. The 30 m whale is a plausible large adult, not a species mean or record.
- A Type 2 tennis ball is represented by the 6.7 cm midpoint of the ITF's
  6.54–6.86 cm interval. The quarter uses the Mint's nominal specification.
  The ITF interval was checked in the official PDF. The Mint's automated
  fetch returned HTTP 403; its official indexed specification supported the
  24.26 mm value.
- The Moon's rounded 3,480 km diameter is twice NASA's approximate 1,740 km
  radius; Earth uses its 12,756 km **equatorial** diameter.
- Earth–Moon distance is a mean **centre-to-centre** distance, not the empty
  gap between surfaces. The au is an exact unit, not today's Earth–Sun gap.
- The Milky Way reference is an approximate stellar-disk diameter, not a
  sharply defined boundary or dark-matter halo size. The older NASA
  educational source is used only for that stated approximation.
- No uncertain “particle radii” are presented as physical object diameters.

## Accessibility and responsive behaviour

Body text is 15–18 px; essential labels are at least 12 px. Controls have
44 px minimum heights, visible focus outlines and native keyboard behaviour.
The range has a meaningful `aria-valuetext`; Home/End and arrow keys work
without custom keyboard interception. Every select, input and section is
labelled. Native details disclose longer notes without trapping focus.

Comparison changes, filtered counts, exports and input errors have scoped
status messages. Navigation from an entry focuses the destination section;
search input is not replaced when results change. Text identifies A/B,
object/distance and approximation without relying on colour or illustration.
The SVGs are decorative because all measurements and context are readable
in HTML. Source links announce that they open a new tab.

At narrow widths the main plate, comparison, notes and catalogue reflow into
stacked editorial layouts. No fixed-height viewport or page-internal scroll
trap is used. There is no autoplay or motion; reduced-motion styles also
suppress inherited transitions.

## Focused validation

`tests/projects/scale.spec.ts` uses the existing Playwright runner for pure
engine/data assertions and isolated browser mounts at `/projects/scale/`.
Browser cases cover the logarithmic selector, reciprocal comparisons, filters,
model validation, sourced downloads, 375px layout and scoped cleanup. They
intercept a fixture document and import only this site's Vite module, not the
shared shell. Use an existing Vite server or the runner's configured web server:

```sh
PWTEST_CACHE_DIR=src/projects/scale/.test-cache \
npm test -- tests/projects/scale.spec.ts \
  --output=src/projects/scale/.test-results --workers=1
```

Set `SITE_URL` to an existing Vite server to avoid launching another one.
For engine-only work, add `--grep-invert "isolated browser"` and set `SITE_URL`
to any local address; those cases make no network requests. Remove the owned
`.test-cache` and `.test-results` outputs after the run. Integrated routing,
base paths, screenshots and the collection build remain the coordinator's work.
