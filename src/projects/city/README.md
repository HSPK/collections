# Recipe for a City

An independent, local-only neighborhood toy at `/projects/city/`. The site owns
its navigation, heading, worktable, recipes, field guide, and downloads.
`mount(context)` uses `createProjectPage(context, 'city')` and returns its
idempotent `destroy`. The `.project-city[data-workspace="true"]` root fits the
viewport without document scrolling.

The compact masthead opens directly onto the city worktable. The illustrated
map frame is marked `data-project-preview`. A native ingredient selector,
address menus, Place/Remove, and Undo/Redo remain beside the live drawing on
desktop and immediately beneath it on phones. Tools, Notes, Recipes, Guide,
and Save open native dialogs; the original editor, recipe slip, checklists,
reference, title editor, and file controls remain mounted rather than copied.

## Files and responsibilities

- `data.ts`: typed tile catalog, symbol legend, three composed starting plans,
  recipe instructions/checklist identifiers, and the exact model explanation.
- `engine.ts`: pure plan validation, four-side neighbors, graph components,
  counts/frontage/green adjacency, immutable edits, bounded undo/redo, and
  versioned JSON serialization/deserialization.
- `renderer.ts`: original isometric SVG primitives, individual tile drawings,
  automatic street connections, the interactive illustration, and a
  self-contained printable SVG with embedded plan metadata.
- `index.ts`: DOM and scoped event listeners; no simulation loop, observers,
  external requests, or automatic storage.
- `style.css`: only `.project-city`-scoped styling. No global layout contract
  is assumed beyond an available container.
- `manifest.json`: collection discovery metadata.

## Editing and accessibility

Clicking/tapping the illustration selects an address; it does not place tiles.
Choose a catalog ingredient and press **Place**. The labeled row and column
menus provide an equivalent precise interface without small SVG hit targets.
The focusable address pad supports arrows, Enter/Space to place, and
Delete/Backspace to erase. The four large movement buttons work with touch.
Ctrl/Command+Z and Ctrl/Command+Shift+Z (or Ctrl/Command+Y) undo/redo within the
site, except in native input/select controls.

Reset, clear, preset changes, imports, title changes, and individual edits all
use the same 80-entry history. A no-op does not consume history or remove redo.
Nothing is autosaved. A JSON file restores the name and tiles, not the history.
Opening a file is undoable and validates the complete file before changing the
current plan. JSON imports are limited to 100 KB and dimensions 1–16 per axis.

Bounded grid tracks and `min-height: 0` keep the map and primary editing controls
together at 1440×900, 1280×720, 375×812, 320×640, and 768×480. Long editor and
reference content scrolls only inside dialogs. The drawing can still be enlarged
and panned inside its own frame without widening the document; the SVG
projection and hit targets are unchanged. Road overlays use numbers as well as
colors. Essential control text is at least 14px, native text inputs are 16px,
and project actions have 44px minimum touch targets. Mobile history controls
reserve room for the floating collection menu.

Dialog Close/Escape returns to the opener. Loading a recipe or choosing a
frontage address closes its notebook and focuses the live worktable. The exact
counting-rules link opens the Guide and scrolls that dialog, not the document.
Tools retains the full illustrated palette, keyboard address pad, movement
buttons, presets, reset/clear, selection explanation, and operation feedback.

All listeners use `page.signal`. The single asynchronous file read checks the
signal and an import revision before touching the page; cleanup invalidates
pending results. Downloads use `core/page.ts`'s download utility. There are no
project-owned animation frames, timers, object URLs, or observers to retire.

## Add an ingredient

1. Add a literal ID to `TILE_IDS` and a matching entry to `tiles` in `data.ts`.
   Describe both its appearance and its actual rule. Choose a kind:
   `building`, `street`, `green`, `square`, `water`, or `empty`.
2. Add a symbol to `presetLegend` if a preset will use it. Every preset row must
   have the same length; the engine rejects unknown symbols and invalid sizes.
3. Implement the new `drawTile` switch branch in `renderer.ts`. The palette,
   field-guide listing, and live inventory come from the catalog automatically.
4. Add focused model assertions, especially if the tile changes counting rules.
   A new kind or rule must also be explained in the field guide and JSON model
   description. Do not imply capacities, population, safety, or other values
   that are not actually modeled.

`TileId` makes missing renderer branches a type-check error. The parser accepts
only known IDs; if changing the persisted schema or interpretation in an
incompatible way, increment the JSON version and add an explicit migration
rather than silently reinterpreting saved plans.

## Draw a tile

Tile coordinates `(u, v)` cover `[0, 1] × [0, 1]`. Height `z` is in drawing
units. Projection is `x = (u - v) × 36`, `y = (u + v) × 20 - z`.
`ground`, `polygon`, `line`, `slab`, windows, roofs, trees, and benches compose
the tile artwork. Paint visible walls before roofs and details. The scene
visits increasing `column + row` so nearer buildings overlap farther ones.

Streets draw only the arms that actually connect to neighboring street/bridge
tiles. Bridges use the same connection data; water and planks are illustrative,
not hydrological or structural simulation. Keep every SVG fill and stroke
explicit, with no remote images/fonts, so exported SVG files remain portable.
Export omits selection markers and graph overlays, escapes the user's title,
wraps long titles, and includes a plain-text JSON plan in `<metadata>`.

## Change the graph model

- A node is exactly one tile whose catalog kind is `street`.
- An edge is an unordered pair of nodes sharing a grid side. No row wrapping
  and no diagonal links. The edge count visits each pair once.
- A road group is a connected component; an isolated road is a group of one.
  An empty street graph has zero groups, not one fully connected group.
- Frontage is a building tile with one or more direct street neighbors.
  Count it once, ignoring the positions of illustrated doors.
- A green neighbor is a direct park/allotment neighbor (kind `green`), again
  counting each building once. Parks and squares cannot carry street routes.
- One row-house tile counts as one building tile regardless of its drawing.
  Bridge-underlay water does not also count as a canal tile.

`analyzePlan` is the single source for the notes, overlay component numbers,
checklists, catalog totals, and exported illustration description. Add rules
there, not as presentation-only numbers. New recipe predicates belong in
`recipeChecks`; labels and instructions belong in `data.ts`. Checklist
completion is a shape challenge, never an urban quality or sustainability score.
Street and green totals derive from catalog kinds rather than hard-coded tile
IDs, so a new ingredient in those kinds participates automatically.

Malformed user plans and titles throw `PlanInputError`. UI handlers surface
those expected validation errors and browser file/download `DOMException`s,
while unexpected programming errors propagate instead of looking like an
ordinary invalid file.

## Focused validation

The existing Playwright runner hosts both pure model assertions and isolated
browser mounting tests in `tests/projects/city.spec.ts`. Browser tests intercept
an in-memory fixture document and import this project's entrypoint through Vite;
they do not rely on shared collection markup or styles. They cover keyboard and
touch alternatives, undo/reset/clear, portable exports/imports, lifecycle
cleanup, all five workspace sizes, real pointer selection, visible control
effects, dialog reference workflows, and the floating collection menu. Workspace
tests save screenshots into the runner's per-test artifact directory.

```sh
npm test -- tests/projects/city.spec.ts --reporter=dot
```

Use the existing runner's `SITE_URL` option when a Vite development server is
already available. A static production server cannot serve the isolated
fixture's TypeScript module imports. Keep validation artifacts in the owned
project or runner output directory.
