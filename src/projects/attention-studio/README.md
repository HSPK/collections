# Attention Studio

An independent, static attention notebook. The weights and token vectors are
original, hand-authored teaching examples: **an untrained single head, not
learned semantic intelligence, a production LLM, or a text generator**.
Token words are labels. The workbench makes no inference or data requests and
has no saved edits, playback, timers, animation frames, or observers.

## Files and extension points

- `tensor.ts`: rectangular finite-matrix validation, dot products, transpose,
  matrix multiplication, stable softmax and its numeric trace.
- `attention.ts`: projection and self-attention pipelines, plus per-key
  weighted-value contributions. Pure functions, independent of the DOM.
- `data.ts`: original presets, token labels, editor limit, stage identifiers.
- `visuals.ts`: numeric formatting, accessible matrix markup, contrast-aware
  heat colors, and stage explanations using the actual computed numbers.
- `ui.ts`: the notebook layout and rendering; interactive elements are retained
  so calculations do not destroy keyboard focus or half-entered coordinates.
- `index.ts`: mount lifecycle, validated input, preset/challenge controls,
  roving heatmap keyboard selection, and event cleanup.
- `style.css`: all styles scoped to `.project-attention-studio`; no motion.

Add a preset to `PRESETS`, supplying four 3D embedding rows and three 3 × 2
projection matrices. Give it an honest description and a falsifiable
observation. Presets are copied before editing; their originals are never
mutated. The current UI deliberately fixes `n = 4`, `d_model = 3`,
`d_k = d_v = 2`. Changing these requires updating both the dimension labels and
the layout, not just substituting an array. The pure engine supports other
positive dimensions and checks matching token counts and inner dimensions.

## Mathematical contract

Embeddings are **row vectors**. `Q = XWq`, `K = XWk`, and `V = XWv`, with
`X: 4 × 3`, each `W: 3 × 2`, and `Q, K, V: 4 × 2`.

1. `D[i,j] = dot(Q[i], K[j])`
2. `S[i,j] = D[i,j] / sqrt(d_k)`
3. Optional causal mask permits `j <= i`, including the diagonal.
4. `m = max(allowed S[i])`; `a[i,j] = exp(S[i,j]-m) / Z`.
   Masked positions have numerator and weight exactly zero.
5. `O[i] = sum_j a[i,j] V[j]`, so `O: 4 × 2`.

The mask is passed separately to `softmaxTrace`/`stableSoftmax`; those APIs
accept finite logits, not an array of `-Infinity` sentinels. `maskedScores`
contains `-Infinity` for inspection. A fully masked row throws a `RangeError`;
ordinary causal self-attention always has at least the diagonal available.
No bias, cosine normalization, dropout, output projection, residual connection,
or multi-head operation is implied.

The Similarity preset separates routing features e₁/e₂ from a value-only
feature e₃. Position routing uses invented circular position codes and a
quarter-turn query matrix, not standard sinusoidal position encodings. Causal
averages uses zero queries to expose uniform allowed weights and prefix means.
The challenge checks the actual `A[0][1] >= 0.8`, with masking off.

## Numerical limits and input behavior

The editor accepts any finite coordinate in **[-1000, 1000]**, including zero,
negative values, decimals and scientific notation. Invalid/empty/out-of-range
fields retain the last valid calculation, show an accessible error, and can
be restored with Escape. Reset restores the selected preset and clears errors.

Arithmetic is JavaScript Float64. Matrix operations reject nonfinite inputs,
ragged arrays, incompatible dimensions, or intermediate dot-product overflow.
Preset projection coefficients have magnitude at most 2, comfortably inside
finite arithmetic at the editor limits. Stable softmax handles even logits
near ±`Number.MAX_VALUE`: an overflowing negative difference becomes
`-Infinity` and exponentiates to zero. Extremely separated allowed logits may
also underflow to zero; this is disclosed, not confused with causal masking.
Row sums equal one within floating-point precision, not arbitrary-precision
arithmetic. Display rounding never feeds back into calculation.

## Interaction and verification

The heatmap remains a normalized-weight map through all six pipeline steps.
Click a cell, or use arrow keys/Home/End inside it, to select a query/key pair.
All projection matrices and Q/K/V rows are visible below; the expandable full
ledger includes raw dot products, scaled/masked scores and every output.
Every event listener uses `page.signal`. `page.onCleanup` makes retained reset
handles inert after abort/destroy; there are no ongoing resources to stop.

Run only the focused suite:

```sh
npm test -- tests/series/attention-studio.spec.ts
```

It checks a hand-calculated projection/orientation example, normalization,
causal prefixes, zero/negative/large inputs, and real browser edits, stage
selection, challenge behavior, keyboard access, 375px layout, and cleanup.

Reference: Vaswani et al., [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762)
(2017), §3.2.1. This notebook illustrates that equation with original toy data.
