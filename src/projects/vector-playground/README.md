# Vector Playground

A self-contained, two-dimensional linear algebra workbench. Its graph-paper drawing is an original paper pavilion, not an external illustration or an AI-generated/learned embedding. No assets, requests, storage, timers, or animation loops are needed.

## Files and extension points

- `index.ts` owns the project lifecycle, local state, number controls, results, challenge, and mode changes. It exports the collection's `mount(context): ProjectInstance` contract.
- `engine.ts` contains DOM-free vector arithmetic, matrix transforms, determinant/numerical rank, projection, and real eigenspace analysis. Matrices are **row-major**: `A = [[a, b], [c, d]]`; the draggable columns are `(a, c)` and `(b, d)`.
- `data.ts` holds transformation/projection presets, coordinate limits, reference links, and the original pavilion vertices. Add presets here without changing the engine or registry.
- `diagram.ts` renders responsive SVG. Its base grid stays fixed; its finite input grid patch (−4…4), unit square, and every pavilion vertex follow the same matrix. Eigenlines are dashed guides, not vectors. SVG handles remain mounted during redraws so focus and pointer capture survive editing.
- `view.ts` provides the semantic page markup, scoped input labels, and short field guide.
- `style.css` is scoped to `.project-vector-playground`; layout reaches a single column before the inspector would squeeze the drawing.
- `manifest.json` registers order **51**. No shared navigation, catalog edits, or preview assets are required.

## Interaction and lifecycle

Drag either basis endpoint or edit all four matrix entries. The input vector can also be dragged or entered numerically. The other lab compares a source with a direction and can transfer its orthogonal projection matrix, plus source vector, into the matrix lab.

Every draggable endpoint supports arrow keys (0.1, or 0.5 with Shift). Enter/Space focuses its first numeric input. Numeric inputs support Up/Down with the same steps; arbitrary finite entries within −4…4 are accepted. Invalid edits leave the computation unchanged and revert to the last valid value on blur. Dragging snaps to 0.05 and holds the current plot scale until release; otherwise the plot auto-fits relevant original/transformed points. Both modes retain their inputs until reset or navigation.

All listeners use the page's abort signal. The resize observer and SVG are released with `page.onCleanup`; destroying twice is safe. There is no autonomous motion, including when reduced motion is requested.

## Mathematical boundaries

- The signed area is `ad − bc`; unsigned area is its absolute value. Negative determinant reverses orientation. Rank-zero and rank-one collapses are distinguished. Numerical rank uses a `1e−10` relative determinant tolerance after normalization by the largest absolute entry. A nonzero determinant inside that threshold is labeled **near collapse**, not exact collapse.
- Orthogonal projection uses a normalized nonzero direction. A zero direction gives a defined dot product of zero but **undefined projection, cosine, and angle**. With a zero source and nonzero direction, projection is zero while cosine/angle remain undefined. Nonzero direction rescaling, including a sign flip, leaves the projection unchanged.
- Eigen-analysis distinguishes two real eigenlines, one defective repeated-eigenvalue line, all directions for scalar matrices (including zero), and complex conjugate eigenvalues. Negative discriminants are never snapped to zero or drawn as fake real eigenvectors. A square-root-factorized fallback preserves underflowing discriminant products, and directions are solved after removing the trace so nearby eigenvalues do not erase their eigenspaces.
- JavaScript double precision applies. Very close eigenvalues and nearly singular matrices are numerically sensitive. Scientific notation preserves visibility of small nonzero values; screen readouts round while computations retain unrounded numbers. This educational engine is intended for moderate finite inputs, not arbitrary-magnitude numerical linear algebra.
- Coordinates here are authored numbers, not learned meanings. A real embedding comes from a model; this 2×2 board illustrates the linear part of a layer, not the bias or an actual trained representation.

## Focused validation

```sh
npm test -- tests/series/vector-playground.spec.ts
```

The three tests cover known transforms/ranks/eigenspaces, dot/projection invariants and undefined cases, then browser editing, pointer dragging, keyboard alternatives, state transfer, honest labels, challenge/reset, 375px layout, and disposal. Screenshots are test artifacts via `testInfo.outputPath`, never public previews.
