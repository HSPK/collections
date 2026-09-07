# SECTION

A constructive implicit-solid atelier. `mount(context)` awaits the first real mesh
and measured section; it does not resolve on a placeholder. No external assets,
network services, runtime CDNs, storage requirements or additional dependencies.

## Module map

- `model.ts`: document types, primitives and resource limits.
- `fields.ts`: signed primitive fields, ordered Booleans, conservative envelopes,
  world transforms and the section frame.
- `mesh.ts`: bounded marching tetrahedra, outward triangle orientation, numerical
  volume and meshed bounds.
- `slice.ts`: independent plane-grid clipping, numerical area, edge-ID contour
  stitching and nesting-based island/hole classification.
- `state.ts`: strict version 1 validation, JSON, transactional history, revisions.
- `presets.ts`: Tender monument, Bored joint, Nested vessel and The cloister.
- `compute.worker.ts`, `compute.ts`: worker boundary and latest-revision ownership.
- `renderer.ts`: demand-rendered Three.js solid, operand bounds, plane and world
  contours with a hole-aware section fill; explicit orbit versus plane manipulation.
- `exports.ts`: binary STL and self-contained, even-odd SVG with source metadata.
- `ui.ts`, `style.css`, `index.ts`: responsive linked atelier and mount lifecycle.

## One coordinate contract

All source distances, rendered geometry, dimensions and exported STL coordinates
are **millimeters**. Angles are **degrees**. The world is right-handed and Z-up.
Local geometry is rotated about X, then Y, then Z, then translated:

```text
world = Rz * Ry * Rx * local + position
```

Box `size` is full X/Y/Z length. A capped cylinder is centered on local Z; its
height is `size[2]`. A torus revolves around local Z; `radius` is the centerline
radius, `tube` its tube radius. Major radius must exceed tube radius. Sphere
rotations remain editable but have no geometric effect.

The plane frame uses the same rotation matrix. Its columns are u, v, n:
`u cross v = n`, `origin = n * offset`, `world(u,v) = origin + u*uCoord + v*vCoord`.
SVG v increases upward (the SVG mapping reverses screen Y). The visible finite
plane patch is centered near the camera target, but represents that same infinite
plane; it does not bound the numerical section.
Exported SVG root dimensions are in millimeters and preserve a 1:1 physical
section scale; the on-screen drawing instead fits the available pane.

An operation stack starts at positive infinity (empty). Union is min, difference
is max(accumulator, -operand), intersection is max. There is no hidden seed rule:
moving a subtraction to the first row subtracts from empty. Every row is editable.
These are hard CSG fields, not smooth blends; composite values are not guaranteed
to be exact Euclidean signed distances.

## Numerical limits and honest states

The longest envelope axis has 28, 44 or 64 cells. The padded uniform surface
grid has at most 330,000 samples; six consistent tetrahedra subdivide each cube.
Vertices linearly interpolate field zero crossings. Shared sampling edges use a
canonical endpoint order. Face winding follows the tetrahedron's affine field,
and four-crossing polygons are sorted in that affine zero plane. The original
nonlinear CSG gradient is used only for shading, never to orient geometry at a
Boolean crease.

Vertices are converted to Float32 before rejecting exactly zero-area facets.
The displayed removal count, triangle count, normals, bounds, volume and STL all
refer to the retained Float32 surface. Volume is a compensated signed triangle
integral rebased near the model, avoiding cancellation for small solids far from
the world origin. STL normals are calculated from its noncollapsed stored faces;
invalid counts or degenerate/non-finite export buffers fail explicitly rather than
receiving fabricated normals. STL exports the full mesh, never the visual clip
shader result.

The section grid uses three times the surface resolution across its projected
longest axis. Two triangles per cell are clipped against their linearly
interpolated field. Their clipped polygon areas are summed; shared sampling-edge
IDs join contours without approximate coordinate welding. Even-odd nesting
distinguishes material islands and holes. Both views sample the same model, not
one another; their differently sampled boundaries can disagree slightly.
The 3D section fill triangulates those same loops with immediate-parent holes;
it is not a second fabricated model or a replacement for field-based measurements.

Envelope-proven empty constructions are distinguished from no-resolved-surface
results, where empty CSG and missed sub-grid material cannot be distinguished.
Open/branching contour states are reported as uncertain topology. Positive
measurements are approximations, not invented analytic values. No manifoldness,
watertightness, manufacturing tolerance or fabrication suitability is certified.
Small gaps, tangencies, cavities, shell walls and features narrower than two or
three grid cells can disappear. The UI reports cell size and recommends comparing
resolutions; it does not claim a formal error bound.
Float32 position rounding remains observable: translating the same field can
slightly change its stored mesh and numerical volume. Collapsed-facet removal
does not certify the remaining topology or recover sub-grid features.

Limits: 16 primitive rows; 220,000 triangles; 64 KB JSON; 60 undo entries;
translations +/-120 mm; rotations +/-180 degrees; plane offset +/-240 mm;
size 0.4-160 mm; primitive radius 0.4-80 mm; tube radius 0.4-40 mm.
There is no recursive construction tree, so imported nesting cannot add executable
depth: validation accepts only a flat primitive list and explicitly copies known
fields. Files are wholly validated before replacing work.

## Interaction and lifecycle

Pointer gestures have one owner. Plane dragging converts CSS pixels using the
orthographic world height and zoom, independent of DPR. Drag, range input and
keyboard alternatives share history. Escape/pointer cancellation restores the
gesture baseline. Object manipulation is numeric; clicking a solid boundary
selects the closest primitive field there. Dashed bounds expose subtractive
operands that cannot otherwise be seen.

`History` snapshots own both the document and its reset origin. Construct a
history with `new History(document, studyId?)`; `load(document, studyId?)`
establishes a fresh origin, including when the incoming document equals the
current edit. `change(document)` retains the current origin. `origin` exposes a
defensive copy of its baseline and the originating study ID, not a title/content
lookup. Imports have a null study ID even if their title matches a built-in study.
Undo, redo and grouped gesture snapshots restore origin and geometry together.
A load validates first, finishes any preceding gesture, then records its own
history entry. Reset uses the current snapshot's baseline and is itself undoable
when it changes geometry. Origins are internal session metadata: version 1 JSON
remains geometry-only, and imported extra origin fields cannot establish reset
ownership. The UI maintains no parallel history or title-keyed baseline cache.

Each newer computation terminates the previous worker and debounces its
replacement; generation IDs reject stale responses. Changed meshes and
measurements are not presented as current while pending, and exports are disabled.
Plane-only changes reuse the unchanged solid but recompute its actual section.
Blocked worker startup and message failures become explicit error states rather
than indefinite pending work. Failed recalculations keep the editable construction
available as JSON and withhold stale geometric exports until recovery.
Workers, observers, event listeners, RAF, geometries and materials are disposed on
unmount. Rendering is on demand, DPR <= 1.5, with no auto-motion even without a
reduced-motion preference.

The root's `data-workspace="true"` allocates one dynamic viewport to the atelier.
Desktop keeps both linked views beside the bounded inspector; mobile keeps a
live Solid/Section view and the cut rail above that inspector. Solid/Section tabs
retain both render hosts' dimensions while the inactive view is invisible and
inert, so resizing or computing in the other view never introduces zero-size
camera math. The renderer's existing ResizeObserver continues to resize its
buffer and orthographic projection without resetting model or camera state.

Construction, Cut plane, Results and Studies are keyboard-operated inspector
tabs at every size. Their shared, bounded scroll region contains long operation
lists, shape fields, measurements, resolution and study notes. Cut offset,
undo/redo and reset stay outside this scroll region. Surface picking selects the
construction tab and reveals its operand inspector without scrolling the page.
The plane shortcut selects and focuses its tab without a document scroll.
Files & guide opens a lifetime-scoped native dialog containing JSON/STL/SVG
actions and the complete methods/keyboard notes. Import closes it when a file is
chosen so completion and validation errors remain visible in the status region;
Escape/Close restore the trigger focus. Files remain local downloads and the
current unsaved document intentionally lasts only for this mount.
The existing live-status strip reserves local bottom-right collection-menu
clearance. Keep inspector controls above it and status text out of its final
64 px; no shared header or empty footer is required.

## Extension and integration

Add a primitive field in `fields.ts`, its parameter controls in `ui.ts`, validated
ranges in `state.ts`, and numerical fixtures in the owned spec. Do not add a
display-only primitive that bypasses the common field. New plane orientations
must use `planeBasis` in rendering and exports. Workers use Vite's
`new URL('./compute.worker.ts', import.meta.url)` construction for nested static
project paths.

Useful selectors: `.project-section[data-ready="true"]`,
`.project-section[data-computing="false"]`, `[data-project-preview]`,
`[data-solid] canvas`, `[data-drawing] svg`, `[data-study]`, `[data-select]`,
`[data-field]`, `#section-offset`, `[data-offset-number]`, `[data-plane-preset]`,
`[data-volume]`, `[data-area]`, `[data-topology]`, `[data-action="stl"]`,
`[data-action="svg"]`, `[data-file]`, `[data-error]`.

The owned Playwright spec is `tests/projects/section.spec.ts`. It covers known
shape convergence, Booleans, transforms and arbitrary sections, holes, finite
outward geometry, STL coordinates, validation/roundtrips, empty and sub-grid
states, grouped history, cancellation and real browser construction/edit/export
workflows. Desktop, 320 px and 375 px captures are saved in that run's output.
One browser case builds only SECTION in memory with the installed Vite, without
reading environment files or writing build artifacts, and serves its compiled
entrypoint, stylesheet and real worker at `/collections/projects/section/`.
Browser cases isolate the shared dev server's HMR socket so concurrent edits to
other projects cannot silently remount the study midway through an assertion.
Mesh regressions include a translated sphere-minus-box crease, a radius 0.4 mm
Boolean solid near 119 mm world coordinates, and 45-degree rotated boxes at all
three resolutions. They inspect directed shared edges, stored-facet area,
buffer/count/bounds/volume agreement and every binary STL facet.
`tests/projects/section-workflows.spec.ts` covers reset origins across undo/redo,
same-title and origin-only imports, study switches and complete JSON downloads,
plus mobile pane/edit/view, geometry exports and bounded inspector interaction.
`tests/workspaces/spatial.spec.ts` checks viewport bounds, render buffers, tab
hit targets, keyboard selection and dialogs at 1440x900, 1280x720, 375x812,
320x640 and 768x480. Extend the existing `panels` declaration for supplemental
inspector data; keep render regions and primary cut/history controls outside
its scroller. Existing `data-panel`/`data-view-tab` hooks are retained alongside
the shared semantic tab identifiers.
