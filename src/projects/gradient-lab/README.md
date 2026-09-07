# Gradient Lab

An independent, locally computed optimizer workbench. No hosted model, network
request, autoplay, stored session, decorative training score, or fabricated
history is involved. Open `/projects/gradient-lab/`.

## Files and extension points

- `index.ts` mounts the page with `createProjectPage`, coordinates shared-start
  runs, and owns events/playback. All event listeners use the page signal.
  Core `createLoop` is initially paused and is destroyed on teardown. Both
  core canvas resize observers are disconnected on teardown.
- `engine.ts` is a pure, immutable numerical module. It has no DOM dependency.
  An accepted update appends one sample; a rejected update retains the last
  finite state. Terminal runs do not advance while other methods continue.
- `data.ts` contains analytic surfaces, their derivatives, contour levels,
  suggested starts/rates, optimizer identity, and three original experiments.
  Add an objective here only with a matching analytic gradient, finite visible
  bounds, sensible contour levels, and a derivative test.
- `contours.ts` samples a 96 × 80 grid and applies marching squares with
  linear edge interpolation. Ambiguous saddle cells use the function value at
  the cell center. This approximates level-set geometry, not optimizer states.
- `diagram.ts` caches the computed topographic backdrop and draws actual
  sample paths, exact step segments, current endpoints, and loss histories.
  It reuses core `canvas2D` and `math` helpers.
- `ui.ts` owns markup and readouts. Static data goes through `escapeMarkup`;
  dynamic feedback uses text content. Sample export uses core `downloadText`.
- `style.css` is scoped entirely to `.project-gradient-lab`.
- `workspace.ts` composes the existing live nodes into the viewport grid,
  inspector tabs, and themed dialogs using the shared workspace lifecycle.

## Numerical conventions

Let θ = (x, y). The initial position is θ₀. At update t ≥ 1:

```text
gₜ = ∇L(θₜ₋₁)
θₜ = θₜ₋₁ + Δθₜ

Gradient descent:
  Δθₜ = −α gₜ

Heavy-ball momentum:
  v₀ = 0
  vₜ = 0.9 vₜ₋₁ + gₜ
  Δθₜ = −α vₜ

Adam:
  m₀ = v₀ = 0
  mₜ = 0.9 mₜ₋₁ + 0.1 gₜ
  vₜ = 0.999 vₜ₋₁ + 0.001 gₜ²
  m̂ₜ = mₜ / (1 − 0.9ᵗ)
  v̂ₜ = vₜ / (1 − 0.999ᵗ)
  Δθₜ = −α m̂ₜ / (√v̂ₜ + 10⁻⁸)
```

All vector operations are coordinate-wise. Momentum deliberately uses the
unnormalized heavy-ball accumulator, not an EMA with a `(1 − β)` factor.
Adam’s epsilon is **outside** the square root, and bias correction starts at
**t = 1**. There is no weight decay, gradient clipping, stochastic sampling,
learning-rate schedule, or automatic parameter tuning.

The bowl is `(x² + 4y²)/2`. Rosenbrock is
`[(1 − x)² + 100(y − x²)²]/50`, with the same scaling in both derivatives.
The saddle is `(x² − y²)/2`: it has a stationary origin and no finite minimum.

The inspector separates the current gradient at θₜ from the gradient gₜ
that produced the latest step. Changing the landscape, rate, or starting point
clears all paths and moment memory. Selecting a method only changes inspection.
Reset preserves the current setup. A comparison round attempts one update for
each still-active method, so stopped methods can have different accepted t.

## Safety and visual limitations

- Rates must be finite and in `[0.0001, 1]`; starts must be inside the stated
  bounds. Invalid edits are explicitly rejected without replacing a run.
- Each optimizer stops after **400 accepted updates**. A stationary stop
  requires both gradient norm and last-step norm ≤ `1e-8`; this does not
  certify a minimum.
- A finite endpoint outside the displayed domain is **accepted, recorded,
  and then stopped**, not clamped. Its exact coordinates and loss remain
  inspectable/exportable. Only the drawing is clipped to the viewport.
  Leaving the map alone does not prove mathematical divergence.
- Non-finite arithmetic, a proposed coordinate with magnitude above `1e6`,
  loss magnitude above `1e12`, or derivative magnitude above `1e12` cause a
  reported safety rejection. No invalid sample or moment is committed.
- Contours are sampled/interpolated; axis ranges independently fit the
  responsive plot. Gradient arrows have normalized display lengths, so their
  lengths are **not** gradient magnitudes. Read the numerical derivative.
- Loss histories use `sign(L) · log10(1 + |L|)` (implemented using `log1p`),
  with raw-loss tick labels and an auto-fitted vertical range. This preserves
  negative saddle losses. History lines join actual accepted samples only.
- Displayed numbers are rounded; CSV contains all methods’ full-precision
  samples, current gradients, and applied steps.
- A shared α illustrates differences, not an unbiased optimizer benchmark.
  Real neural training involves higher-dimensional, usually noisy objectives.

## Interaction and accessibility

The inspector and feedback use a local 64px right-side clearance, plus the
safe-area inset, so the floating collection menu cannot cover an input.
Keep this clearance when extending the dock; no document footer is reserved.

The `100dvh` workspace keeps the responsive landscape, method cards, and
Step/Play/Reset transport together. Setup holds landscape and learning rate;
Start holds coordinates and gradient visibility. Readout contains exact
updates, memory, formulas and stopping reasons; History contains the loss
plot, sample table and CSV export. On phones these are a bounded bottom dock,
not content below the simulation. Feedback stays visible below the tabs.
Experiments and Guide open native dialogs; choosing an experiment closes its
dialog without replacing the controls or losing the trigger's focus.
Long readouts and educational material scroll only inside their pane/dialog.
Extend the pane list in `workspace.ts`; keep canvas hosts and input nodes
mounted so resize observers, keyboard focus and model state remain intact.

Manual Step pauses playback and attempts exactly one comparison round.
Play is explicit, including under reduced motion. Either motion-preference
change or hiding the tab pauses playback; there is no catch-up burst.
Native starting-point number inputs provide the keyboard alternative to map
clicks. Buttons, selects, ranges, and checkbox labels have 44px targets.
Touch scrolling uses `pan-y`; dragging the map does not reset a run.
Line patterns and endpoint shapes supplement path colors. The current
readouts, stopping reasons, and recent-sample table provide a text alternative
to both canvases.

## Focused validation

```sh
npm test -- tests/series/gradient-lab.spec.ts
```

The three focused cases check analytic derivatives, known momentum/Adam
updates, bias correction/epsilon, counters and safety limits; desktop
integration including loss changes, playback, resets, and real CSV data; and
375px layout, keyboard operation, reduced motion, and mount teardown. The
numerical case also checks this project and spec with the repository’s
existing strict TypeScript options, without compiling other sites.
