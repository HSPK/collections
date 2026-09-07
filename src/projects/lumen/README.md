# Lumen

A local, editable 2D spectral optical workbench. No network services, assets, accounts, dependencies, animation loops, or hidden persistence. Download a JSON experiment to retain geometry and notebook observations; import restores it as one reversible edit. SVG export is standalone, includes the actual traced geometry and experiment metadata, and escapes all editable text.

## Modules

- `model.ts`: discriminated element types and physical units.
- `geometry.ts`: ray/segment, stable ray/circle roots, winding-independent convex polygons, exact spherical biconvex lens surfaces, containment and coordinate transforms.
- `optics.ts`: pure tracing, Snell refraction, total internal reflection, unpolarized Fresnel splitting, Beer-Lambert absorption, energy ledger and power-weighted detector measurements.
- `state.ts`: strict versioned import/export and immutable 80-edit history with drag transactions.
- `presets.ts`: prism dispersion, thick-lens caustic, two-mirror folded path, and a narrow scanning spectrometer.
- `renderer.ts`: SVG drafting geometry, spectral ray energy, selectable instruments, and standalone scene export.
- `ui.ts`, `index.ts`, `style.css`: scoped responsive instrument, keyboard inspector, file workflows and lifecycle.
- `workspace.ts`: viewport pane assembly, keyboard tabs and the native files/reference dialog.

## Model and units

The field is 1000 by 600 mm. Positions and lengths are in mm, source powers in mW, wavelengths in nm, and rotations in degrees clockwise from the rightward X axis. Mirror/detector rotation describes their tangent; source rotation describes its aim; prism rotation describes its triangular body. A biconvex lens is the intersection of two equal circles with spherical radius `(diameter^2 + thickness^2) / (4 * thickness)`. It is not a thin-lens approximation.

Index follows the illustrative two-term **Cauchy formula** `n(lambda) = A + B / lambda_um^2`:

| Material | A | B (um squared) | Absorption (/mm) |
| --- | --- | --- | --- |
| Crown glass | 1.5046 | 0.0042 | 0.00008 |
| Dense flint | 1.62 | 0.015 | 0.00018 |
| Water | 1.322 | 0.003 | 0.00004 |

Air is n = 1. These approximations are not certified catalog data. Bulk power is multiplied by `exp(-absorption * distance)`. At a refractive interface, the unpolarized mean of s/p Fresnel reflectances determines the reflected branch; the remaining power is transmitted. TIR retains all interface power in the reflected ray. Mirror loss goes to absorption. Every ideal, double-sided detector absorbs the actual crossing ray, with no invented response curve.

White emitters sample seven equally powered bands at 420, 460, 500, 540, 580, 620 and 660 nm. Monochromatic mode accepts 380-750 nm. Aperture and fan angles are sampled uniformly, with equal power per ray; a single ray uses the central sample. Detection is discrete geometric sampling, **not a continuous spectral reconstruction**. Bars show per-wavelength collected/emitted power. Centroid and RMS width are power weighted along the detector tangent. Band separation is the distance between centroids of the shortest and longest *captured* bands, not necessarily 420/660 nm if a band misses.

Tracing stops after 18 interface interactions, 2,400 total launched branches, or below 0.00002 mW (20 nW) per branch. Stopped energy is explicitly reported separately from detected, absorbed and escaped energy. Every processed ray creates at most one drawn segment. Invisible branch energy is never silently reassigned. Line opacity scales with the square root of relative power; low-energy branches are dashed. Hiding faint rays changes drawing only, never the trace or detector.

Inside/outside transitions use the incident propagation medium and one-sided containment in the outgoing direction. At a boundary, outward normals of polygon faces or lens circles distinguish inward, outward and tangent launches. The boundary-distance tolerance is 0.0000001 mm; a unit direction is inward when its dot product with the outward unit normal is below -0.0000001. An emitter exactly on a surface launches its specified power directly into the outgoing medium: inward launches traverse glass, while outward and tangent launches remain outside that refractor. There is no incoming ray or invented Fresnel event at zero distance. Actual positive-distance crossings still split power by Fresnel reflectance, and glass travel still incurs bulk absorption. In overlapping/nested refractors the last listed element containing the outgoing path supplies the medium; exiting or running tangent to one refractor can still leave the ray inside another.

All nearest intersections within 0.0000001 mm are resolved as one coincident event before branching. An absorbing detector intercepts the incident ray before a coincident refractive or reflective surface, independent of its placement relative to refractors in the element list. If several detectors coincide, the first listed detector collects the ray rather than duplicating its energy. Parallel/collinear zero-thickness surfaces do not cross a ray. Polygon corner hits choose the most head-on coincident face deterministically. Near-surface offsets are 0.00001 mm to prevent self-intersection. Parts outside the finite bench are clipped; a ray leaving the field is escaped.

**Limitations:** geometric rays only: no wave propagation, diffraction, interference, polarization state, scattering, coatings, 3D effects or calibrated optical-design claims. Discrete source sampling limits spot statistics. Overlapping refractors use explicit scene ordering, not a physical mixture of materials.

## Editing and keeping

Lumen uses a fixed `100dvh`, `data-workspace="true"` workbench. The live SVG,
study selector, Add, Undo/Redo and Reset remain on screen. Desktop uses a
side-by-side bench/drawer; mobile retains a compact live preview above the
drawer. **Inspector / Detector / Notebook** are bounded tabs with arrow-key
navigation, and never reload the experiment. The Detector pane retains the
full spectral readout and energy ledger; collected power also stays beside
the preview. **Files & help** opens a native dialog for JSON import/save,
SVG export, preset cards, drawing options, physics and keyboard references.
Import failures are shown next to the file actions inside that active dialog.
Scene/history shortcuts are suspended while it is open; native Tab, Escape and
text-field editing still work. Escape returns focus to its opener. Exact geometry is unchanged: SVG
`viewBox`/screen transforms accommodate the available renderer rectangle
without scaling controls or substituting a static preview.

The status line leaves 64px beside the host's floating menu. Bounded instrument
panes retain bottom scroll clearance so their final inputs and notebook actions
can move above that corner, without an extra footer or a narrower optical bench.

Select from the bench or "On the bench." Drag to move; the round selection handle rotates/aims. Every position, angle, size, wavelength, material, detector length and source property also has a keyboard-operable inspector control. Focus a diagram element and use arrow keys (2 mm), Shift+arrows (10 mm), Delete/Backspace, or Enter to inspect. A rotation handle supports left/right arrows (1 degree, or 10 with Shift).

The "2x detail" view centers on the selected element. Drag empty paper to pan, or focus the bench and use arrow keys (20 mm; 80 mm with Shift). "Fit bench" restores the whole field. View changes never alter the physical geometry, measurements, history or full-field SVG export.

A drag, including many pointer moves, is one undo step. Escape/pointer cancellation restores its starting geometry. Native text-field undo is not intercepted. Ctrl/Cmd+Z outside fields and dialogs, and the visible undo/redo buttons, operate experiment history. Preset loads, reset and successful imports are also undoable.

JSON validation rejects nonfinite/out-of-range numbers, unknown fields/types/materials (including empty field names), duplicate/unsafe IDs, excessive strings, files over 200 kB, more than 24 elements or 4 emitters, and invalid lens geometry. Failure leaves the valid history untouched and displays a specific inline error. File reads check mount cancellation; event listeners and pointer capture are cleaned up on unmount.

## Parent review

Route: `/projects/lumen/`. Preview: `.project-lumen [data-project-preview]`.

Useful selectors: `[data-bench]`, `[data-optic-id="prism-1"]`, `[data-selection]`, `[data-field="material"]`, `[data-field="rotation"]`, `[data-power]`, `[data-separation]`, `[data-band]`, `[data-panel="notebook"]`, `[data-action="record"]`, `[data-action="undo"]`, `[data-action="save"]`, `[data-action="svg"]`, `[data-import]`, `[data-file-error]`.

Try changing prism material, moving the focal screen through the lens caustic, setting both mirror reflectivities to 0.9 (0.81 mW collected from 1 mW), or moving the narrow spectrometer detector in 2 mm steps. Record a reading, save, change presets, import, and undo the import.

Targeted numerical and browser workflows live in `tests/projects/lumen.spec.ts`
and `tests/projects/lumen-history.spec.ts`. Workspace tests check actual
document/body scroll sizes at 1440×900, 1280×720, 375×812, 320×640 and 768×480,
including edits, history, all panes and the files dialog. Screenshots are
written to each run's individual test artifact directories. Reuse the parent
server and serialize browser runs with its shared viewport-browser lock.
