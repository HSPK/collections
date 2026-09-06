# Epicycle Studio

An original Fourier drawing desk. Four locally authored outlines and a visitor's
pointer- or keyboard-drawn closed path feed the same actual complex DFT.
There are no remote assets, uploads, persistence, or audio.

## Modules

- `data.ts`: authored preset contours, names, and explanatory notes. Add a
  `DrawingPreset` with finite `{ x, y }` points; positive y means up.
- `engine.ts`: fit, arc-length resampling, bounded complex DFT, coefficient
  selection, reconstruction, vector chain, and sample-error measurement.
- `timeline.ts`: the 12-second periodic clock and finite, clamped seeking.
- `scene.ts`: Canvas2D graph, input outline, circle chain, and deterministic
  partial trace. The complete reconstructed curve is cached per coefficient set.
- `index.ts`: accessible controls, drawing input, and page-owned lifecycle.
- `style.css`: only `.project-epicycle-studio` selectors.

## Numerical contract

The fitted path retains its aspect ratio, includes its closing segment, and is
sampled 128 times at equal arc lengths, without duplicating the endpoint.
The direct O(N squared) transform is deliberately bounded to at most 256 samples;
the input desk accepts at most 1024 points. No transform runs per animation frame.

For sample `z[n] = x[n] + i*y[n]`,
`c[k] = sum(z[n] * exp(-2*pi*i*k*n/N)) / N`.
Bins above the positive-frequency half are signed negative frequencies; for even
N, the Nyquist bin is represented as `-N/2`. Reconstruction uses the opposite
exponent. The DC term is always included and is not a rotating harmonic.
Remaining terms are sorted by magnitude; selecting K keeps the K largest.
This is not a low-pass cutoff or an insistence on positive/negative pairs:
a general complex path does not have conjugate-symmetric coefficients.

All N coefficients reconstruct all input samples up to floating-point error.
Between samples the periodic Fourier interpolant can overshoot corners.
The RMS error readout uses Parseval's identity and is relative to the input's
RMS radius about its mean, not a Hausdorff distance or continuous-outline error.
The full plotted curve uses 512 line segments; the moving pen and circle chain
use the exact series at the chosen phase.

## Interaction and lifecycle

Scrubbing pauses, reset goes to zero, and playback wraps after one cycle.
The initial 68% frame is intentionally readable with reduced motion; in that
mode nothing advances until Play. A preference change to reduced motion pauses
and never implicitly restarts playback.

Drawing mode accepts one pointer stroke, closes it on Trace sketch, or supports
arrows to move the pen, Space to place corners, Backspace to undo, Enter to
trace, and Escape to cancel. Native form controls retain their keyboard behavior.
The main canvas allows touch scrolling outside drawing mode.

`createProjectPage` scopes events and teardown. Its cleanup releases pointer
capture, destroys `createLoop`, disconnects the Canvas2D resize observer, and
removes the canvas. There is no independent wall-clock animation or CSS loop.

Focused coverage is in `tests/series/epicycle-studio.spec.ts`: known signed
signals and DC, sample reconstruction and resampling, timeline endpoints,
browser controls and sketch input, mobile/reduced-motion behavior, and cleanup.
