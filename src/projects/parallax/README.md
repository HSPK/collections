# PARALLAX

A calibrated two-view reconstruction studio, not an image-recognition demo.
The authored **Signal house** is a folded-canopy coastal observatory with 110
stable survey landmarks, opaque surfaces, louvres, cross-bracing and a stair.
Three actual capture rigs study convergence, long-range disparity and oblique
visibility. The images use the same geometry as the explicit truth reveal.

## A complete study

1. Select the signal ridge in either image or the landmark selector. Yellow
   marks are observed pixels; the red square is the displayed point reprojected
   with the assumed calibration. The line is the calibrated epipolar locus.
2. Add 20 pixels to B's y coordinate and apply. Both the recovered position and
   its four-coordinate RMS change. Compare raw midpoint and refined estimates.
3. Enable the robust gate. An inconsistent match is rejected rather than
   replaced by a plausible point. Project B onto its epipolar line to remove
   perpendicular error. This cannot establish correct along-line identity.
4. Restore the captured match. Change assumed baseline or focal length: the
   exposures and observations remain fixed, so calibration error is visible.
   **Capture with this rig** explicitly creates new exposures and observations.
5. Run the 4 m versus 0.15 m guided capture. The same seeded one-pixel noise
   produces much larger depth uncertainty with a narrow baseline.
6. Reveal the authored world only when ready to compare Euclidean error.
   Export an experiment JSON and reconstructed-only PLY. JSON can be imported
   from a local file or pasted into the evidence panel. Undo retains 50 edits.

## Numerical contract

- World distances are metres, world +Y is up. The right-handed camera frame is
  +X right, +Y down, +Z forward. Image origin is upper-left, x right, y down.
  All observations remain in a fixed **960 x 640 pixel** sensor, regardless of
  CSS size, mobile pane selection or device pixel ratio.
- `q = R (X - C)` applies translation before world-to-camera rotation.
  `u = fx qx/qz + cx`, `v = fy qy/qz + cy`, only for positive `qz`.
  Unprojection applies `K^-1` then `R^T` and normalizes the resulting world ray.
- `triangulate` receives only two cameras and two pixels. It computes the
  midpoint of the closest locations on the rays. Baseline below 1e-6 m is
  unavailable; acute ray angle below 0.1 degree is unstable; nonpositive ray
  distances fail cheirality. None receives a fallback depth or an absolute-z fix.
- `refine` minimizes the sum of four squared pixel-coordinate residuals with
  analytic Jacobians, at most 24 Gauss-Newton iterations, and at most 14
  backtracking steps per iteration. It accepts only lower-error, positive-depth
  candidates. The interface distinguishes convergence from a bounded/local stop.
- Displayed RMS is `sqrt(sum(residual^2)/4)`, not a world-space distance.
  It is recomputed from the displayed estimate, including after refinement.
- `E = [Rb(Ca-Cb)]x Rb Ra^T`; `F = Kb^-T E Ka^-1`.
  The calibrated gate uses square-root Sampson distance in pixels with
  threshold `max(2, 3 sigma)`. It never reads the injected-outlier recipe.
- Optional pixel-estimated F uses Hartley normalization, a Jacobi eigensolver
  for the 9-column homogeneous design, a rank-eight design test and rank-two
  projection. Seeded RANSAC evaluates 240 eight-point hypotheses, truncated
  squared Sampson cost and consensus size, with up to three consensus refits.
  At least 12 observations and 45% consensus are required. Rank-deficient
  planar/collinear samples are rejected. This does **not** recover cameras,
  pose, metric scale or 3D; calibrated geometry remains the reconstruction source.
- Uncertainty is first-order `sigma^2 (J^T J)^-1`, conditional on exact
  calibration and independent equal-variance Gaussian coordinate noise.
  The ellipsoid radii are one standard deviation on its principal axes.
  Depth sigma is covariance projected onto camera A's forward axis.
  Singular or condition-number-over-1e12 systems have no uncertainty estimate.
  Zero sigma means zero assumed sensor variance, not certainty about the model.
  Coordinate text is rounded according to the largest modeled sigma; exports
  retain numeric calculation precision without claiming that physical accuracy.
- Known baseline fixes scale. The authored world frame fixes origin and
  orientation. Common rigid transforms preserve pixels, residuals and ray angle.
  Uniformly scaling points and camera centres preserves pixels and scales depth.
  F itself has arbitrary nonzero scale; estimating it does not fix the projective
  gauge or any Euclidean reconstruction.

## Separation and extension points

| Module | Responsibility |
| --- | --- |
| `math.ts`, `camera.ts` | Pure small-matrix algebra, camera transforms, F/E and projection derivatives |
| `triangulation.ts` | Pixel-only ray solution, local refinement, residuals and covariance |
| `robust.ts` | Independent normalized eight-point/RANSAC image-geometry estimator |
| `world.ts` | Authored triangles, stable landmark IDs, authored edge topology, capture rigs and visibility |
| `state.ts` | The explicit synthetic capture boundary, observation-only solve orchestration, history, bounded JSON and PLY |
| `space.ts` | One Three.js renderer, depth-buffered exposures, recovered geometry, camera frusta and rays |
| `images.ts` | SVG observation/epipolar/reprojection overlays over real rasterized exposures |
| `ui.ts`, `style.css` | Accessible instrument UI, atomic edits and pane-specific responsive layout |

To extend the structure, add geometry/landmarks in `createWorld`, preserve old
IDs, and version the experiment format if the identity set changes. Add camera
studies to `STUDIES`. Add distortion only if projection, unprojection, rendering,
Jacobians, validation and tests are updated together. More than two views needs
a new observation schema and objective; do not reinterpret two-view data as SfM.

## Visibility, performance and lifecycle

Each exposure is an actual depth-buffered Three.js render from its captured
calibration, not a disconnected hand drawing. Opaque ray-triangle tests
determine which authored corners produce observations. Sensor perturbations
that leave the image also become unavailable. No hidden feature receives a
synthetic visible dot. The reconstructed wire connections use authored
connectivity only when both endpoint estimates exist; they are **not** inferred
surface topology. PLY exports points, not a fabricated mesh.

The original world appears in the volume only in the explicit reveal mode.
Metric reconstruction has no access to landmark positions, labels or surfaces.
Restoring a match reruns the explicitly authored capture recipe; it is not
optimization and can restore an injected mismatch if that is in the recipe.

There is one WebGL renderer, one 960 x 640 render target, capped 1.6 DPR, a
1024-pixel shadow map and low-segment point instances. Camera exposures redraw
only when the exposure rig changes. The space uses the shared paused `createLoop`
and redraws on input/resize, with no auto-orbit, damping or continuous animation.
Image and orbit gestures share single-pointer ownership. Pixel drags have one
undo boundary and cancellation restores the original. Keyboard arrows navigate
image features; the volume's arrows orbit, +/- zoom, and Home resets.
Mobile pane tabs have one tab stop and support arrow keys, Home and End.
File imports belong to their selection sequence and starting experiment/input
revision. A late file cannot replace a newer selection, committed edit, or
uncommitted pixel input; the existing work is preserved with explicit feedback.

Page destruction aborts listeners, disconnects its ResizeObserver, stops the
loop, disposes geometries/materials/textures/instances/shadow map/render target
and renderer, releases its context and removes its canvas. All resources are
local imports, with no fetched media, external fonts, workers or runtime assets.

## Deliberate limits

Ideal pinhole cameras; no distortion, rolling shutter, automated recognition,
matching, bundle adjustment, AI result, or uncalibrated SfM. Calibration changes
are hypotheses applied to fixed exposures until explicit recapture. Covariance
does not model calibration bias, feature confusion or nonlinear tails near
degeneracy. Along-epipolar mismatches can pass the gate with nearly zero residual
and wrong depth. Bounded RANSAC can fail or find misleading consensus; a fit is
not proof. The three scenarios share one original structure, not three unrelated
scenes. Mesh recovery and arbitrary image uploads are not claimed.

## Local validation and selectors

Run only the owned suite against the existing server:

```sh
SITE_URL=http://127.0.0.1:4173/ npx playwright test tests/projects/parallax.spec.ts
```

Numerical cases cover gauge invariance, F/E constraints, cheirality, degeneracy,
noise, Jacobians, refinement improvement, covariance, outlier rejection,
observation provenance, visibility and strict serialization. Browser cases
exercise edits, repair, calibration mismatch, all rigs, guidance, exports,
imports, image resizing, keyboard/pointer selection, 320/375 px panes,
reduced-motion idleness and remounts.

Useful integration selectors: `.project-parallax`, `[data-project-preview]`,
`[data-image-overlay="a"]`, `[data-image-overlay="b"]`,
`[data-camera-image="a"]`, `.px-space-canvas`, `[data-point3d]` (full calculation
in `data-xyz`), `[data-rms]` and `[data-uncertainty]` (`data-value`),
`[data-pixel="b-y"]`, `[data-rig="baseline"]`, `[data-tab="inspect"]`,
`[data-action="fit-f"]`, `[data-import-text]`, `[data-status]`.
