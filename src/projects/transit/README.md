# Transit Weaver

An independent imaginary-subway maker at `/projects/transit/`. Brindleport is
fictional: twenty original stations, four routes, and four interchange stations
form a connected starting network. No map service, remote asset, upload, or
persistent browser storage is used.

## Making a map

- Select a circle or use the station picker to rename, reposition, or remove it.
  Label placement is editable. Station checkboxes append/remove route memberships.
- Select a route in the legend or route picker to edit its name and six-digit
  color. Stops connect in **explicit list order**; append, move up/down, or remove
  stops in the workbench. Geometric crossings alone are not interchanges.
- **Add station** places the next stop on the paper. **Add without pointing**
  finds an available position. Both append to the chosen **Extend route**, or
  leave the station unserved when **No route** is selected.
- **Move** enables marker dragging without blocking ordinary paper scrolling.
  Grid snapping is optional; coordinate fields accept exact positions.
- Every committed edit, import, and restore is reversible. Undo/redo retain the
  last 60 snapshots for this open session; a complete drag is one edit.
- Download a self-contained SVG poster with a route legend, or save/open a
  versioned JSON project. Imports validate size, coordinates, unique identifiers,
  text, route colors, stop uniqueness, and every station reference before applying.
  Invalid imports leave the map unchanged. Save JSON before closing the page.
  Open the downloaded SVG to print the map without collection or editor chrome.

## Keyboard and touch

Tab to station circles; Enter or Space selects. Arrow keys move a focused
station by 20 map units with snapping or 10 without; Shift triples the step.
Ctrl/Command Z and Shift Z undo/redo outside text fields. Escape cancels a
pending drag or leaves the placement/move tool. All graph operations also have
ordinary labeled controls. The fitted map is a compact overview; **Zoom map**
opens readable, internally pannable paper, and **Fit map** restores the overview.
The labeled station picker is an alternative to pointing at small markers.

## Architecture and extensions

- `engine.ts`: types and pure immutable graph edits, validated JSON interchange,
  bounded history, position bounds, and derived graph health. Deleting a station
  removes it from **every** route; consecutive surviving stops become neighbors.
  Deleting a route retains its stations. Empty routes and unserved stations are
  valid work-in-progress states. A route is a sequence without repeated stations.
- `data.ts`: the original city, hand-placed labels, route names/colors, and preset
  factory. Add presets here and return independent copies.
- `svg.ts`: schematic path geometry, separated lanes on shared station pairs,
  escaped SVG markup, interactive marker geometry, and standalone poster export.
  It uses presentation attributes and local system fonts, with no external links.
  Station labels wrap at grapheme boundaries and specify per-line text lengths
  so long names and wide fallback glyphs remain inside the map paper.
  Text validation rejects XML-invalid characters; all text uses `escapeMarkup`.
- `index.ts`: scoped page lifecycle and accessible editor. Pointer coordinates use
  the inverse SVG screen CTM, so CSS sizing, scrolling, and viewBox scaling do not
  change a drag's coordinate space. Event handlers use the page abort signal;
  late imports and active pointer capture are discarded on destroy. Losing
  window focus or hiding the document cancels an unfinished move.
- `style.css`: all styles stay inside `.project-transit`, including print and
  reduced-motion rules. Print hides the editor while keeping the map and legend.

The civic worktable fills the remaining viewport height without document scrolling.
Desktop keeps the map beside a compact station/route editor. On narrow or short
screens, **Map / Workbench** tabs switch in place without losing the selection.
**Position, routes & removal** and **Stops & route actions** open native dialogs;
long station lists may scroll inside them. **Routes & health**, **Save & open**,
and **Field guide** retain the legend, connectivity report, files, reversible
reset, instructions, and colophon without competing with the map for height.
Errors open a visible, labeled dialog immediately. Feedback is local to this
workspace rather than a floating collection toast over the tools. Escape closes dialogs and
returns focus to their trigger; map Escape still cancels a drag.
One live feedback line remains below the active workspace.
The live feedback area keeps a stable height and a local right-hand gap for the
floating collection menu, so short messages cannot pull action buttons behind it.
`data-project-preview` marks the map/workbench region for collection covers.

To extend graph features, add a pure operation to `engine.ts`, run the result
through the existing `commit` helper, and add a focused engine test. Keep route
IDs stable, repair references when deleting stations, and update JSON validation
along with any format change. The graph readout is computed from route adjacency,
not visual crossings; reachability includes the selected station itself.

Browser coverage includes 1440×900, 1280×720, 375×812, 320×640, and 768×480,
actual SVG-coordinate placement after resizing, one-screen editing, project
download, reset/undo, and desktop/mobile screenshot artifacts.
The browser fixture isolates only Vite's development-reload socket so concurrent
edits to unrelated sites cannot reset an in-progress graph test.

Run `npm test -- tests/projects/transit.spec.ts --reporter=line`. To validate only
the engine and XML export without starting the site server, set
`SITE_URL=http://127.0.0.1:4173` and add `--grep "Transit engine"`.
