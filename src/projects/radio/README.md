# Radio 404

A standalone, English-language field radio and illustrated fictional notebook.
Open `projects/radio/`. The page has its own receiver, station directory, stories,
sound recipes, fixed imaginary program guides, keeper notes, and navigation.
Reading never requires audio. Nothing is downloaded from an audio service.

## Files and responsibilities

- `index.ts`: `mount(context)`, page markup, accessible controls, station/history
  navigation, clipboard feedback, and lifecycle listeners.
- `data.ts`: typed station records and all original station writing.
- `audio.ts`: the local Web Audio engine, four graph recipes, scheduling,
  ownership, cancellation, and teardown.
- `illustrations.ts`: original inline SVG antenna, printed tuner, notebook,
  station glyphs, and four environment sketches. No external artwork or fonts.
- `style.css`: paper-and-ink layout, all selectors scoped to `.project-radio`,
  touch controls, narrow layouts, and reduced-motion overrides.
- `manifest.json`: automatic collection registration; no shared registry edit.
- `tests/projects/radio.spec.ts`: focused browser coverage.

## Content conventions

These are invented places, not stations claimed to exist. The dial numbers are
fictional markers, not real frequencies. The prominent receiver label says
“Generated on your device, not a live broadcast.” Program cards are a fixed
fictional timetable, with an explicit note that neither the clock nor the cards
control the generator. There are no spoken programs, recordings, encoded packet
messages, popularity statistics, accounts, microphones, or hosted AI calls.

Each station has three substantial story paragraphs, three tangible objects,
four sound-recipe explanations, three keeper notes, and three program cards.
Write about specific places, objects, routines, and small concerns. The current
stations have a pocket jar and slowly traveling roof drip; a library stone with
its own circulation card; an empty cello case and a sapling in orbit; and an
orchard's water allowance and undecided gate. Keep the fiction available when
Web Audio is absent or blocked.

## Adding a station

1. Extend `StationId` in `data.ts` with a URL-safe identifier. Add a complete
   `Station` record to `stations`, with a sequential two-digit number, distinct
   dial marker, six-digit ink color, original content, and honest sound recipe.
2. Add that ID to the typed glyph and scene records in `illustrations.ts`. Both
   should be original SVG paths, not remote assets. The full scene's accessible
   description comes from `sketchCaption`.
3. Implement a genuinely different bed in `Soundscape.start()` and a sparse
   gesture in `Soundscape.gesture()` in `audio.ts`. Update the typed interval
   record in `tick()`. The bed switch is exhaustively checked against `StationId`.
4. Use `this.voice(build)` for **every** group. Use `Voice.oscillator()`,
   `Voice.noise()`, `Voice.gain()`, and `Voice.filter()` so every source and
   processing node has an owner. Modulators are sources too: create them with
   `modulate()`, never with an untracked oscillator.
5. For a one-shot, call `envelope()` and pass its returned end time to every
   source in the group. Short noise gestures must fit within the three-second
   generated noise buffer. Do not add independent intervals or orphan
   `setTimeout` calls. Make errors flow to the engine's visible error state.
6. Update the written station-count references in the introduction, edition,
   field guide, footer, and manifest. Controls and needle positions derive their
   count from `stations`; review printed tick spacing if the number changes.
   Recheck narrow-screen card names, dial labels, and the focused tests.

`stationFromHash()` recognizes only known `#station-<id>` links. Selecting a card
or tuning control pushes a same-document history entry without jumping the
viewport. Hash entry and browser back/forward select content silently; if sound
was playing, station history navigation stops it. No route handler calls
`listen()`. Section anchors do not change the selected station.

## The four sound graphs

| Station | Continuous layers | Sparse gestures |
| --- | --- | --- |
| Midnight Laundromat | 54 Hz sine and a quiet 108.3 Hz triangle harmonic, low-passed at 420 Hz; shallow gain LFO; a separate low-passed noise bed with a slower cycle | Rounded falling sine drips and an occasional soft rinse swell |
| Underwater Library | 174.6/261.9 Hz muffled sines with slow gain variation; narrow, gently shifting water noise | Long, softly bending tones behind a 670 Hz low-pass filter; short synthetic page turns |
| Low Orbit Shipping | Very quiet 86/129.5 Hz sine subcarriers; no continuous noise | Groups of two or three rounded sine packets, silence, and an occasional three-partial chime |
| Salt Orchard | High- and low-pass-filtered wind noise, with separate slow gain and filter LFOs; no continuous tonal drone | Soft triangle/sine wooden bells, sometimes an answer, and little leaf-noise envelopes |

Noise is generated locally with the core seeded random helper. The buffer is
shared only within one context; no audio file, media element, network request,
microphone input, or feedback/delay loop is involved.

## Sound ranges and safety

- Default volume: **45%**. User range: **0–100%**. Zero mutes but leaves the
  selected sound recipe running until Stop; changing volume while stopped does
  not create a context or a source.
- The master gain is `0.28 * volume^1.5`, so even 100% cannot exceed **0.28**.
  Changes use `holdGainAtTime()` followed by a 75 ms time-constant target.
  Starting uses a 220 ms master ramp.
- Station buses rise from zero to **0.84** over 900 ms. Continuous amplitude
  modulation stays positive and small; the largest bed gain is 0.25 at the top
  of the orchard wind swell. One-shot envelopes are clamped to 0.001–0.24, begin
  and finish at zero, and have rounded attacks.
- A final compressor has threshold -15 dB, knee 12 dB, ratio 5, attack 30 ms,
  and release 350 ms. It adds no makeup gain. There are no sharp square/sawtooth
  alarms, bright continuous static, resonant feedback, or unbounded delays.
- Current audible oscillators lie roughly between 54 and 1,047 Hz. Sub-audio
  LFOs modulate parameters only. Noise filters deliberately remove harsh highs.
  A conservative numerical level is **not** a guarantee of safe hardware
  loudness: readers are asked to start with low device volume.

## Scheduling, retuning, and ownership

There is one **180 ms scheduler interval** for the incoming soundscape. It looks
350 ms ahead on `AudioContext.currentTime`. A delayed callback schedules at most
one new gesture, never a burst of missed ones. Internal packet/answer offsets
are bounded (the largest current start offset is 1.2 seconds). One-shot source
stop times include their complete envelope, and the final `ended` event
disconnects the whole voice, including filters and gains.

Each soundscape accepts at most **16 voice groups**, including continuous
layers. The receiver owns at most **two soundscapes**: incoming and outgoing.
Every outgoing interval is canceled immediately. Normal retunes fade the old
bus for 650 ms, shorten all of its source stop times, and force final disposal
80 ms after the fade. A further rapid retune disposes the previous outgoing
graph before making another. This bounds nodes and timers even if the dial is
moved repeatedly. Pending one-shots are stopped as well as audible sources;
`stop()` before a future `start()` prevents that source from sounding.

All parameter-automation cancellation uses the shared
`core/audio.holdGainAtTime()` helper, including volume changes, retunes, Stop,
errors, and immediate cleanup. Do not call `cancelAndHoldAtTime()` directly:
the helper also supports browsers that only have `cancelScheduledValues()`.
New one-shot envelopes need no cancellation until their graph is retired.

## Lifecycle and races

The `RadioAudio` constructor does not allocate an `AudioContext`. Only an
explicit **Listen** click calls `listen()` and then `resume()`. The first click
creates one context, output chain, and generated noise buffer. **Stop** fades
for 240 ms, disconnects every voice, then suspends that context for later reuse.
Its cleanup deadline is 320 ms. Listen is disabled while starting, playing,
fading out, or closing; Stop can cancel a pending start.

A generation token invalidates an old `resume()` continuation after Stop,
navigation, failure, or closing. The latest selected station is read only after
resume succeeds. A seven-second startup deadline produces an honest error
instead of leaving “opening” on screen indefinitely. A stale resume cannot
build a graph; a quiet surviving context is suspended. `closePromise` prevents
a second context from being opened while the first is closing. On close
failure, the disconnected context is retained for retry rather than forgotten,
and the failure is reported. A shutdown failure after unmount is logged because
there is no longer a page on which to display it.

`index.ts` binds all page events with the page's AbortSignal:

- `visibilitychange`: if hidden, stop **immediately**, dispose future/active
  voices and timers, and suspend. There is no “visible” resume branch.
- `pagehide` and `beforeunload`: disconnect everything and close the context.
  A page restored from back/forward cache is silent. The collection may remount
  the page on restoration, which also starts silently.
- `hashchange` / `popstate`: station history updates content, never opts in.
- `page.onCleanup()`: permanently destroy the receiver, cancel all engine and
  graph timers, stop/disconnect all sources, abort audio-event listeners,
  disconnect the output chain, and close the context.

Context state changes that interrupt playing also stop sound without resuming.
Voices and context listeners have their own abortable lifetimes. There is no
render loop, animation interval, visibility-triggered start, or persistent
audio preference. CSS movement respects reduced motion.

## Focused verification

Use the existing project Playwright configuration:

```sh
npx playwright test tests/projects/radio.spec.ts
```

Against a server already managed elsewhere, prevent the config from starting
one by supplying its URL:

```sh
SITE_URL=http://127.0.0.1:4173/ npx playwright test tests/projects/radio.spec.ts
```

The spec covers original station content, silent navigation and deep links,
explicit listening, retuning, volume/mute, bounded source/interval ownership,
legacy gain automation, unavailable/blocked audio, delayed resume races,
visibility/exit cleanup, return without autoplay, and a 375 px keyboard layout.
It does not capture screenshots or use remote audio.
