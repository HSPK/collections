# Breath Garden

An original coastal paper garden of nine blue fans, coral cups, and folded
pinwheels. Wind bends the stems, turns the wheels, and opens the folds. A wind
button and Space provide the complete interaction without any microphone.

## Files and local mechanism

- `data.ts`: editable paper specimens, starting folds, and calibration duration.
- `engine.ts`: RMS loudness, bounded noise calibration, attack/release smoothing,
  stable wind state, and persistent-in-this-mount unfolding amounts.
- `illustration.ts`: original canvas paper constructions, coastal layers, and
  drawn wind ribbons. No sprites, external art, particle field, or runtime AI.
- `microphone.ts`: explicit-consent capture lifecycle, separate from the UI.
- `index.ts` and `style.css`: standalone, scoped page and input controls.

The first 1.1 seconds establish a conservative lower-quartile room level.
Values below a noise gate have no effect. A 0.12-second attack and 0.6-second
release smooth the remaining loudness to [0, 1]. This is not speech, breath, or
health analysis. The samples are overwritten in a short in-memory analyser
buffer and cleared when input is stopped; they are not recorded or saved.
The microphone is never connected to an audio destination, so there is no
speaker monitoring or feedback.

## Consent and shutdown

Only the Enable microphone button calls `getUserMedia`. Pending requests can be
canceled. Request generations ensure a late permission grant is immediately
stopped without creating an audio context, even if another request has started.
Disable, hidden documents, pagehide, ended tracks, interrupted processing, and
page disposal stop every track and close the owned audio context. Returning to
the page never resumes capture. No permission polling, recordings, storage,
uploads, network requests, or auto-enable path is used.

## Controls and reduced motion

Hold the visible wind button, hold the garden itself, or hold Space outside
native form/navigation controls. The wind button also supports keyboard holding
and an assistive click. Direction buttons and canvas Left/Right arrows reverse
the breeze. Breeze strength affects both manual and optional microphone input.
Fold back resets the paper, not microphone consent or the motion preference.

Reduced motion starts the scene paused. Each manual press or new audible onset
then opens a discrete step; the input-responsive bend is quantized and no idle
sway/rotation advances. Continuous holding grows the paper when motion is on.
Changing the system preference to reduced motion also pauses the scene; changing
back does not automatically resume it.
Optional microphone polling may continue while motion is paused, without
advancing scene animation. All input, observer, frame, and capture resources are
cleaned up via the core page lifecycle.

Focused tests in `tests/series/breath-garden.spec.ts` mock every microphone and
audio context. They must never request access to a real microphone.
