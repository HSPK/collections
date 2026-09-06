# Roomtone

An architectural-acoustics workbench, not a wave solver. Change a shoebox room,
place a source and listener, assign all six surfaces, and follow actual specular
reflection paths. The same calculation feeds the drawings, plots, mono WAV
export, and explicitly user-initiated Web Audio convolution.

## Modules

- `data.ts`: typed room schema, bounds, material coefficients and four room studies.
- `engine.ts`: pure image-source geometry, wall interactions, pressure losses,
  surface areas and diffuse-field RT60 estimates.
- `ir.ts`: complementary frequency filters, fractional-delay accumulation and
  backward-integrated energy decay.
- `wav.ts`: mono, 32-bit IEEE float RIFF/WAVE encoding with a `fact` chunk.
- `scene.ts`: Three.js cutaway, material cues and selected folded ray; on-demand
  rendering, orthographic plan view and keyboard/pointer camera controls.
- `floorplan.ts`: proportionally scaled SVG plan with pointer and keyboard
  source/listener positioning.
- `audio.ts`: deterministic local source synthesis and one-shot audio graph.
- `ui.ts`, `index.ts`, `style.css`: studio composition, validated edits,
  reference comparison, responsive panes and lifecycle ownership.

## Model and coordinates

All geometry is in metres. `x` runs west to east, `y` south to north and `z`
floor to ceiling. Source/listener points stay at least 0.15 m inside every
surface. Width is bounded to 2-24 m, depth to 2-32 m, height to 2-12 m.

For one axis of length L and source position s, image cell n has coordinate
`n L + s` for even n and `(n + 1) L - s` for odd n, including negative n.
Enumerate cells with `|nx| + |ny| + |nz| <= order`. This gives exactly
`(4 order^3 + 6 order^2 + 8 order + 3) / 3` paths, including direct sound.
Order is an integer from 0 through 6: at most 377 paths and 2,197 lattice visits.
A conservative preflight work count must fit 20,000 geometry units. Budgets
reject the entire request rather than silently dropping rays. The IR has at most
`377 * 513 * 6 = 1,160,406` band/tap multiply-accumulates, independent of room size.

Intersect the listener-to-image segment with unfolded integer boundary planes,
then fold each intersection back into the room. Reversing those intersections
gives source-to-listener bounce order. Even boundary planes represent the low
wall and odd planes the high wall. Exact simultaneous edge/corner hits retain
both wall losses but share one drawn vertex; these are the specular limiting
construction, **not** edge diffraction.

Travel distance is the Euclidean image-to-listener distance and delay is
`distance / 343 m/s`, a fixed approximate sound speed at 20 degrees Celsius.
For each of the six bands (125, 250, 500, 1,000, 2,000 and 4,000 Hz):

```
pressure = product(sqrt(1 - wall_absorption))
           * 10^(-air_dB_per_m * distance / 20)
           / max(distance, 1 metre)
```

There is no boundary loss on the direct path. The 1 m distance cap makes
coincident source/listener positions finite; this is a near-field safeguard,
not a finite-size loudspeaker model. Air-loss constants are a nominal indoor
approximation, not a temperature/humidity-dependent atmospheric calculation.
Material arrays are illustrative, plausible generic coefficients, not certified
measurements of specific products. Angle dependence and complex phase are absent.

## From rays to a real impulse response

The all-band response is a sum of six complementary, 513-tap Blackman-windowed
sinc filters per path, with crossover frequencies at geometric band midpoints.
The lowest band includes DC through the first crossover; the highest extends
to Nyquist. The band kernels telescope to a delayed unit impulse when all six
amplitudes are equal. Geometric arrival times are linearly interpolated between
adjacent 44.1 kHz samples. A common causal filter latency of 256 samples,
5.8049887 ms, shifts the wavelet peak; it is **not extra acoustic travel time**.
Coherent addition here follows the chosen positive-coefficient filter model,
not a calibrated physical wall-phase or modal/interference simulation.

The plot uses signed min/max envelopes of actual band-filtered IR samples.
Its green cursor includes the filter latency; the path inspector reports
unshifted geometric timing. Audio and WAV use all six bands together, with no
per-room normalization. Blue reference plots share the same time and pressure
axes as the edited room.

The Schroeder curve is `10 log10(sum(ir[t:]^2) / sum(ir^2))`, plotted down to
-60 dB with an internal -80 dB display floor. The reported finite -5 to -25 dB
interval is a threshold interval in **this truncated response**, not T20 or
RT60. If the thresholds coincide or no energy exists, the interval is
unavailable. No slope extrapolation is performed and there is no synthesized
late diffuse tail.

RT60 values are separate estimates, evaluated per band:

```
V = room volume; S = total surface area
A = sum(surface_area * band_absorption)
Sabine = 0.161 V / A
Eyring = 0.161 V / (-S ln(1 - A/S))
```

Both assume a well-mixed diffuse field and omit air absorption from the RT60
estimate. Real rooms can violate this assumption, particularly small, absorptive,
or strongly nonuniform spaces. Neither estimate is derived from the finite
image-source decay. No low-frequency modes, diffraction, scattering, occlusion,
source directivity, binaural spatialization, or late reverberation is claimed.

## Workflow and audio safety

Choose a studio, chamber, stone hall or gallery. Numeric geometry edits commit
on change/Enter/blur; invalid input leaves the valid design intact and Escape
restores it. Shrinking a dimension keeps both points inside the new room.
Floorplan arrows move 0.1 m, Shift+arrows 0.5 m; numeric coordinates and heights
are equivalent controls. Drag updates are coalesced to one calculation per frame.

Select any calculated ray by its ordered option, including direct sound. The
full path is highlighted in both views and its walls, distance and time are
shown below the response plots. Camera controls are on demand; no automatic
rotation, animation, or dependency on motion preference is needed.

Pin an immutable design B, then edit A. Comparison shows volume, bandwise Eyring
estimate and actual broadband IR energy; neither response is normalized.
Reset restores the selected preset without erasing B. Export always writes A.

Audio does not create an AudioContext until Play is pressed. A click, original
chord or noise/percussive source is synthesized locally into a one-shot buffer.
The context explicitly requests the IR's 44.1 kHz sample rate. When honored,
the real IR is copied sample-for-sample into a `ConvolverNode` with normalization
disabled; the browser handles any subsequent hardware-output conversion.

If the context actually uses another rate, its native `decodeAudioData` converts
the locally encoded float WAV to that rate before any playback source is created.
The converted kernel is multiplied by `IR_rate / context_rate`: convolution is a
discrete sum, so ordinary recording resampling without this factor would change
its transfer gain. This is a common sample-period correction, **not** per-room
normalization or relabeled sample metadata. Native 48 and 96 kHz cases cover
timing, complex frequency response, impulse area, and two-to-one level preservation,
including float samples above unity. Browser conversion can introduce small
rounding/filter differences, particularly near the original Nyquist limit.
Plots and exported WAV remain the original 44.1 kHz model.

Dry and wet branches join a conservative shared output gain and a compressor.
Both A/B kernels are prepared at the actual context rate, and the larger of their
L1 norms determines the common safety gain. This preserves comparison level
differences while bounding convolution output. There is no loop, autoplay,
microphone access, external sample, or network asset. If opening the requested
rate, decoding, or graph construction is unsupported, playback stays off with
an explicit error suggesting another output/browser or WAV export.

Stop, edits, tab hiding and navigation disconnect every graph node, stop the
source only if `start()` succeeded, cancel completion/resume timers and close
the context. Every node is owned immediately after creation, so failure during
convolver assignment, later graph construction, or source start cannot strand a
partial graph. Expected native Web Audio exceptions produce actionable feedback;
unexpected programming exceptions are cleaned up and rethrown.

Pending resume and rate-conversion waits are revocable and generation-guarded:
neither can start a late source or overwrite a newer audition. The browser's
bounded decoder task itself has no abort API; after cancellation the context
is closed and any eventual result is discarded. Unsupported, denied, or
timed-out audio has visible feedback. Gain changes stop playback and require
a fresh Play, rather than unexpectedly restarting sound.

## Rendering and extension points

Three.js uses an orthographic camera, capped 1.5 DPR, simple lighting, bounded
mesh counts and no shadow maps or postprocessing. Static scenes do not run a
continuous loop. Room changes dispose old geometry/materials; teardown disposes
the renderer, orbit controls, observers, listeners, animation requests, audio
work and download URLs. WebGL failure is explicit; the acoustic engine and
editable SVG plan remain available.

Mobile panes switch between Space, Edit room, and Listen & measure. SVG text
sizes are adjusted to preserve at least 14 CSS-pixel labels. All pointer
interactions have visible keyboard alternatives.

A diffuse-tail extension should remain independently labeled and expose its
energy-matching rule, seed and truncation. Measured material data should include
provenance and mounting conditions. Phase, directivity or binaural work needs a
new model contract rather than suggesting this amplitude-only model includes it.

Targeted coverage: `tests/projects/roomtone.spec.ts`. Review selectors:
`.project-roomtone`, `[data-project-preview]`, `[data-scene]`,
`.roomtone-canvas`, `[data-floorplan]`, `[data-field]`, `[data-material]`,
`[data-path]`, `[data-path-route]`, `[data-comparison]`, `[data-audio-status]`,
`[data-audio-error]`, `[data-pane]`.
