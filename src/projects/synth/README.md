# Pocket Synth / PS—16

A standalone, English-language, five-voice Web Audio instrument. All four starter
patterns are original sketches made for this project. There are no recordings,
external audio assets, microphone requests, accounts, or hosted generation models.
Audio is created only after the visitor activates **Play**.

## Files

- `index.ts`: page markup, transport controls, accessible pads, lifecycle listeners,
  explicit persistence, and JSON workflows. Exports `mount(ProjectContext)`.
- `style.css`: viewport-bounded styles scoped to `.project-synth`; the wide pad
  editor scrolls horizontally, while long notebook and reference panes scroll
  internally.
- `types.ts`: shared pattern, track, and transport types.
- `data.ts`: track descriptions, original starter patterns, cloning, strict
  validation, JSON parsing/serialization, and filename generation.
- `voices.ts`: locally generated noise, five voice factories, source envelopes,
  source ownership, and voice cleanup.
- `engine.ts`: audio context ownership, bounded lookahead scheduling, playback
  state, event-timed lamps, master gain, and complete stop/exit cleanup.
- `manifest.json`: collection discovery metadata; no central registration required.

## Controls

The `data-workspace="true"` root fills the viewport without document scrolling.
**Machine**, **Notebook**, and **Guide** are native keyboard-accessible tabs.
The machine keeps all five rows, Play/Stop, tempo, and Clear pads together,
including at 320 × 640 and 768 × 480. Pads retain their 44 px minimum targets and
horizontal keyboard/swipe navigation; no steps or model limits are removed.
**Sound settings** opens a native dialog for the starter, bass root, and master
volume. Escape/Close returns focus to its trigger. Opening settings or another
workspace pane never interrupts playback; switching away from the browser tab
still stops it. Tab-list keys are scoped to tabs and do not capture editor keys.
The floating collection menu remains available.

The five rows are Kick, Snare, Hat, Bass, and Chime. A pressed/red pad triggers its
voice at that subdivision. Four subdivisions make one beat, and sixteen make one
4/4 bar. The tempo is an integer from **50–180 BPM**. There is deliberately no
swing control: every subdivision has equal duration.

- **Play** starts at step 1; **Stop** cancels playback and clears the position.
  Play stays disabled during startup, but Stop remains available to cancel it.
- Track-name buttons toggle mute (`aria-pressed="true"` means muted).
  Muting retires sounding voices and cancels scheduled future hits in that row.
- **Bass root**, in Sound settings, selects MIDI notes 36–59 (C2–B3); bass pads repeat that root.
  Chime's lower partial follows at +31 semitones.
- **Master volume** is 0–100% of a deliberately capped gain, not an uncapped
  amplitude percentage. Factory peaks are conservative and a compressor follows
  the master. Headphones should still start low.
- **Clear pads** stops playback and clears all eighty steps, retaining the name,
  tempo, pitch, mutes, and volume.
- Pads are native toggle buttons with row, step, and beat in their accessible
  names. There is one roving pad tab stop. Arrows move, Home/End reach the row
  edges, Ctrl+Home/Ctrl+End reach the table corners, Space/Enter toggle, and Tab
  leaves the pads. Left/right wrap within the row; up/down stop at the outer rows.
  There is no document-wide Space shortcut to steal input from editing controls.
- Current-step lamps and readout are decorative (`aria-hidden` readout; no live
  pad announcements). The transport status changes only for transport events.
- Loading any starter, imported pattern, or local save stops playback first.
  Loading does not autosave or request audio.

## Pattern JSON, version 1

An exported file is an editable **recipe**, not an audio recording. The filename
is `<safe-name>.pocket-synth.json`. The strict schema is:

| Field | Accepted value |
| --- | --- |
| `format` | Exactly `"pocket-synth"` |
| `version` | Exactly the number `1` |
| `name` | 1–48 UTF-16 code units, no surrounding whitespace, control characters, or bidi overrides/isolates |
| `tempo` | Integer 50–180 |
| `bassNote` | Integer MIDI note 36–59 |
| `volume` | Integer 0–100 |
| `tracks` | Exactly five unique track objects: `kick`, `snare`, `hat`, `bass`, `chime` |
| `tracks[].id` | One of those five exact lowercase IDs |
| `tracks[].muted` | Boolean |
| `tracks[].steps` | Exactly 16 booleans; `true` is on |

Objects must have exactly the documented fields. Unknown keys, missing keys,
unknown/duplicate IDs, non-boolean steps, non-finite/fractional numbers, wrong
lengths, and other versions are rejected. Track order may differ on input and is
normalized to the display order. Validation returns a fresh, known-field pattern;
it never merges arbitrary JSON into application objects. Imported names are
rendered with `textContent` (initial markup uses `escapeMarkup`).

Example of a valid, deliberately sparse pattern:

```json
{
  "format": "pocket-synth",
  "version": 1,
  "name": "Two small footsteps",
  "tempo": 100,
  "bassNote": 36,
  "volume": 40,
  "tracks": [
    { "id": "kick", "muted": false, "steps": [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false] },
    { "id": "snare", "muted": false, "steps": [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] },
    { "id": "hat", "muted": false, "steps": [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false] },
    { "id": "bass", "muted": false, "steps": [true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false] },
    { "id": "chime", "muted": false, "steps": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false] }
  ]
}
```

File imports are limited to **32,768 bytes** before reading. Pasted JSON is bounded
to **32,768 UTF-16 code units** before parsing. Normal exports are much smaller.
Failures are visible and preserve the workspace. A read-in-progress is invalidated
by a later import, pattern replacement, edit, or page destruction.

**Save locally** writes one explicit slot,
`odd-index:pocket-synth:pattern:v1`, using `writeLocalData`.
**Load saved** reads and validates it using `readLocalData`, then normalizes the
validated result. Nothing is loaded automatically at mount. Storage denial,
corruption, and quota failures are reported; JSON export remains available.
**Show current JSON** fills the text field with the real current pattern for
manual copying or editing. These controls, the pattern name, local save slot,
import editor, and all original starters are in **Notebook**. File export uses
the shared `downloadText` helper. Switching panes preserves edits and scroll
positions; it neither saves nor loads a pattern.

## Scheduling and ownership

The engine wakes every **25 ms** and schedules at most **100 ms** ahead on
`AudioContext.currentTime`. The first step is 50 ms ahead. Each oscillator/noise
source starts at the exact scheduled context time, and its envelope is anchored
to that time. Changes affect events not already scheduled; a tempo change therefore
has up to 100 ms of scheduling latency. A stalled main thread skips missed ticks
instead of playing a catch-up burst.

Scheduled `{ step, time }` events enter a queue capped at 32 entries. The RAF
renderer consumes only events whose audio time has arrived. Lamps are not advanced
by the early lookahead callback. This visual clock is approximate at display-frame
resolution; it does not claim sample-accurate hardware-output latency.

There are at most **48 active track voices**, each with at most two source layers.
The oldest voice is disposed if that defensive cap is reached. Every layer owns
its source, filter if any, and gain envelope. A once-only, signal-scoped `ended`
handler disconnects that layer; completion of the last layer unregisters the
voice. Normal repeating playback therefore does not accumulate audio nodes.

Stop increments a generation token before doing anything asynchronous, clears the
scheduler/RAF/visual queue, and:

1. Stops and disconnects future-start voices immediately.
2. Holds and fades current envelopes over 12 ms, stopping sources at 15 ms.
3. Fades the master over 15 ms and closes/disconnects the graph after 35 ms.

All interrupted gain automation uses the shared `holdGainAtTime`, including its
legacy Firefox `cancelScheduledValues` fallback. No voice calls
`cancelAndHoldAtTime` directly.

A new explicit Play finalizes any retiring graph before creating another context.
Each run has its own generation and context: a late `resume()` settlement from a
canceled run cannot start, stop, or overwrite a newer run. The context is stored
before awaiting resume so Stop can close it during startup. Browser-level audio
interruptions also stop the engine rather than attempting automatic recovery.
Audio constructor/resume/graph/scheduling/close failures are surfaced with useful
messages and leave non-audio controls available.

Visibility loss and `pagehide` cancel startup/playback and immediately disconnect
and close contexts. There is no visibility-return or `pageshow` restart.
`createProjectPage.onCleanup` destroys the engine, cancels retiring close timers,
and invalidates file reads. All application event listeners use abort signals.
The shared download helper independently revokes its short-lived object URL.

## Extending the instrument

### Add an original starter

Add a `StarterPattern` to `STARTERS` in `data.ts`: a unique URL-safe ID, a name,
character/description/suggestion, tempo, bass note, and five strings containing
sixteen `0`/`1` values (spaces may separate beat groups). Keep names and rhythms
original. The select, notebook card, miniature grid, and load action are generated
from the data. UI headings currently say “Four”; update those if the count changes.
Do not mutate `STARTERS`; use `clonePattern`.

### Change a sound or add a track

For an existing sound, edit its entry in `VOICE_FACTORIES` in `voices.ts` and keep
the corresponding `TRACKS` description honest. Use `voice.addLayer` rather than
unowned nodes: it supplies exact starts/stops, envelopes, ended cleanup, and
cancellation. Keep layer peaks low, give every sound a finite decay, and review
the longest decay against maximum tempo and the voice cap.

Adding a sixth track is a schema change. Update `TRACK_IDS` and types, `TRACKS`,
the factory map, all starter rows (including `makeStarter`'s row tuple), validator
requirements/messages, and the five-voice/eighty-pad UI and documentation counts.
Introduce a new format version and an explicit validated migration if old JSON
should be supported; do not quietly accept incomplete or unknown-track files.
Grid rows and keyboard bounds derive from the track data.

### Verification

Owned tests are `tests/projects/synth.spec.ts`. They cover the pure schema, starter
isolation, JSON round trips, modern/legacy gain holding, browser editing and
persistence, no autoplay, audio timing and retirement, asynchronous resume races,
visibility/pagehide/exit, failure states, and the contained mobile keyboard grid.
Workspace tests cover 1440 × 900, 1280 × 720, 375 × 812, 320 × 640, and 768 × 480,
including internal reading/editor scroll, focus, and uninterrupted opted-in audio.
Screenshots are stored in each test run's artifact directory.

With the collection's existing Playwright setup:

```sh
flock "$BROWSER_LOCK" npm test -- tests/projects/synth.spec.ts --reporter=dot
```

To use an already-running server without Playwright starting one:

```sh
SITE_URL=http://127.0.0.1:4173/ flock "$BROWSER_LOCK" npm test -- tests/projects/synth.spec.ts --reporter=dot
```

Set `BROWSER_LOCK` to the shared renderer-lock path supplied by your review
session. Use that same exclusive lock for browser tests and screenshots when
other reviewers share the renderer.
