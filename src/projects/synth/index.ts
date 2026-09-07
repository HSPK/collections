import './style.css';
import {
  createProjectPage, downloadText, escapeMarkup, query, readLocalData, writeLocalData,
} from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import {
  clonePattern, isPattern, MAX_JSON_LENGTH, MAX_TEMPO, MIN_TEMPO, noteName,
  parsePatternJSON, patternFilename, patternJSON, STARTERS, STEP_COUNT, STORAGE_KEY,
  TRACKS, validatePattern,
} from './data';
import { SynthEngine } from './engine';
import type { SynthPattern } from './types';

function sequencerMarkup(pattern: SynthPattern): string {
  return `
    <table class="synth-sequence">
      <caption class="sr-only">Five voices, sixteen on/off steps. Each group of four steps is one beat.</caption>
      <colgroup><col class="synth-label-column"><col span="16"></colgroup>
      <thead>
        <tr class="synth-beat-groups" aria-hidden="true">
          <th>4/4 · ONE BAR</th>
          ${[1, 2, 3, 4].map((beat) => `<th colspan="4">BEAT 0${beat}</th>`).join('')}
        </tr>
        <tr>
          <th scope="col" class="synth-voice-header">VOICE <span>Tap a name to mute</span></th>
          ${Array.from({ length: STEP_COUNT }, (_, step) => `
            <th scope="col" class="synth-step-header" data-column="${step}" data-current="false">
              <span class="synth-step-lamp" aria-hidden="true"></span>
              <span class="sr-only">Step </span>${String(step + 1).padStart(2, '0')}
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${TRACKS.map((track, trackIndex) => `
          <tr data-row="${track.id}" data-muted="false">
            <th scope="row">
              <button type="button" class="synth-track-toggle" data-mute="${track.id}"
                aria-label="Mute ${track.label}" aria-pressed="false">
                <span class="synth-track-number" aria-hidden="true">0${trackIndex + 1}</span>
                <span><strong>${track.label}</strong><span data-mute-label>Mute</span></span>
                <span class="synth-track-led" aria-hidden="true"></span>
              </button>
            </th>
            ${pattern.tracks[trackIndex].steps.map((on, step) => `
              <td>
                <button type="button" class="synth-pad" data-step="${step}" data-track-index="${trackIndex}"
                  data-column="${step}" data-current="false" aria-pressed="${on}"
                  aria-label="${track.label}, step ${step + 1}, beat ${Math.floor(step / 4) + 1}"
                  tabindex="${trackIndex === 0 && step === 0 ? '0' : '-1'}">
                  <span class="synth-pad-lamp" aria-hidden="true"></span>
                  <span aria-hidden="true">${String(step + 1).padStart(2, '0')}</span>
                </button>
              </td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'synth');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let pattern = clonePattern(STARTERS[0].pattern);
  let importOperation = 0;

  root.innerHTML = `
    <header class="synth-masthead">
      <div class="synth-header-inner">
        <a class="synth-identity" href="#synth-machine" aria-label="Pocket Synth — go to the machine">
          <span class="synth-logo" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <div class="synth-wordmark"><span class="synth-model">PS—16 / PERSONAL MUSIC MACHINE</span><h1>Pocket Synth</h1></div>
        </a>
        <nav aria-label="Pocket Synth navigation"><div data-synth-tabs></div></nav>
      </div>
    </header>

    <div class="synth-content">
      <section id="synth-machine" class="synth-machine-section" aria-labelledby="synth-machine-title">
        <div class="synth-section-heading">
          <div><p class="synth-kicker">01 / THE MACHINE</p><h2 id="synth-machine-title">A little rhythm goes a long way.</h2></div>
          <p class="synth-local"><span aria-hidden="true"></span>Local synthesis. No samples. No cloud.</p>
        </div>
        <p class="synth-introduction">Light a few pads. Find a pocket. Five handmade sounds, sixteen steps, and nowhere you need to be.</p>

        <div class="synth-machine" data-transport="stopped" data-project-preview>
          <div class="synth-machine-top">
            <div class="synth-nameplate">
              <span class="synth-control-label">PATTERN IN MEMORY</span>
              <strong data-pattern-name>${escapeMarkup(pattern.name)}</strong>
              <span data-workspace-kind>Original starter / 01</span>
            </div>
            <label class="synth-starter-control">
              <span class="synth-control-label">STARTING POINT</span>
              <select id="synth-starter" aria-describedby="synth-replace-note">
                ${STARTERS.map((starter) => `<option value="${starter.id}">${escapeMarkup(starter.pattern.name)} · ${starter.pattern.tempo} BPM</option>`).join('')}
                <option value="workspace" disabled>Custom workspace</option>
              </select>
            </label>
            <div class="synth-machine-stamp" aria-hidden="true"><strong>16</strong><span>STEP<br>SEQUENCER</span></div>
          </div>

          <div class="synth-controls">
            <div class="synth-transport-controls">
              <span class="synth-control-label">TRANSPORT</span>
              <div class="synth-transport-buttons">
                <button type="button" class="synth-play" aria-label="Play pattern">
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 1 15 8 3 15Z" fill="currentColor"/></svg>
                  <span data-play-label>Play</span>
                </button>
                <button type="button" class="synth-stop" aria-label="Stop pattern" disabled>
                  <span class="synth-stop-symbol" aria-hidden="true"></span>Stop
                </button>
              </div>
            </div>
            <div class="synth-tempo-control">
              <label for="synth-tempo" class="synth-control-label">TEMPO / BPM</label>
              <div class="synth-tempo-input">
                <button type="button" data-action="slower" aria-label="Decrease tempo by 1 BPM">−</button>
                <input id="synth-tempo" type="number" min="${MIN_TEMPO}" max="${MAX_TEMPO}" step="1" value="${pattern.tempo}" inputmode="numeric">
                <button type="button" data-action="faster" aria-label="Increase tempo by 1 BPM">+</button>
              </div>
            </div>
            <label class="synth-root-control" for="synth-root">
              <span class="synth-control-label">BASS ROOT</span>
              <select id="synth-root">
                ${Array.from({ length: 24 }, (_, index) => index + 36).map((note) => `<option value="${note}" ${note === pattern.bassNote ? 'selected' : ''}>${noteName(note)}</option>`).join('')}
              </select>
            </label>
            <div class="synth-volume-control">
              <label for="synth-volume" class="synth-control-label">MASTER VOLUME <output for="synth-volume" data-volume>${pattern.volume}%</output></label>
              <input id="synth-volume" type="range" min="0" max="100" step="1" value="${pattern.volume}" aria-describedby="synth-volume-note">
              <span id="synth-volume-note">Headphones? Start low.</span>
            </div>
          </div>

          <div class="synth-transport-readout">
            <p id="synth-transport-status" role="status" aria-live="polite"><span class="synth-status-led" aria-hidden="true"></span><span data-status-text>Stopped. Press Play to enable audio.</span></p>
            <span class="synth-step-readout" aria-hidden="true" data-step-readout>STEP — / 16</span>
          </div>
          <div class="synth-sequence-scroll" role="region" aria-label="Scrollable step sequencer" aria-describedby="synth-grid-help" tabindex="0">
            ${sequencerMarkup(pattern)}
          </div>
          <div class="synth-grid-footer">
            <button type="button" class="synth-settings-open">Sound settings</button>
            <span class="synth-swipe-hint">Swipe steps →</span>
            <button type="button" class="synth-clear" data-action="clear">Clear pads <span aria-hidden="true">↗</span></button>
          </div>
          <p id="synth-grid-help" class="synth-grid-help"><strong>Click or tap</strong> a pad to toggle. <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move between pads; <kbd>Space</kbd> toggles; <kbd>Tab</kbd> leaves the pads. On small screens, swipe the grid sideways.</p>
          <p class="synth-silence-note" data-silence hidden></p>
          <div class="synth-machine-bottom"><span>5 VOICES · 16 STEPS · 4 BEATS</span><span>DESIGNED TO BE PLAYED WITH</span></div>
        </div>
        <p class="synth-under-machine">Edits reach the sound within 100 ms. Muting also cuts queued hits. Loading a pattern stops playback; press Play to start its first step.</p>
      </section>

      <section id="synth-notebook" class="synth-notebook" aria-labelledby="synth-notebook-title">
        <div class="synth-section-heading">
          <div><p class="synth-kicker">02 / PATTERN NOTEBOOK</p><h2 id="synth-notebook-title">Make a small thing. Keep it.</h2></div>
          <span class="synth-margin-note">YOUR IDEAS, NOT A FEED.</span>
        </div>
        <div class="synth-workspace">
          <div class="synth-workspace-tools">
            <label class="synth-field" for="synth-pattern-name"><span>Pattern name</span><input id="synth-pattern-name" type="text" maxlength="48" value="${escapeMarkup(pattern.name)}" autocomplete="off" spellcheck="false" aria-describedby="synth-name-error"></label>
            <p id="synth-name-error" class="synth-field-error" hidden></p>
            <div class="synth-file-actions">
              <button type="button" class="synth-button synth-button-red" data-action="save">Save locally</button>
              <button type="button" class="synth-button" data-action="load">Load saved</button>
              <button type="button" class="synth-button synth-button-ink" data-action="export">Export .json <span aria-hidden="true">↓</span></button>
            </div>
            <p class="synth-small" data-save-state>No automatic saving. One local slot, kept only in this browser.</p>
          </div>
          <div class="synth-workspace-note">
            <span class="synth-note-number" aria-hidden="true">REC<br>IPE.</span>
            <div><h3>A recipe, not a recording.</h3><p>The JSON file keeps your steps, mutes, tempo, tuning, and volume. Import it here to play it again. It contains no recorded audio.</p><p id="synth-replace-note">Loading a saved file or starter replaces the workspace. Save or export your edits first.</p></div>
          </div>
        </div>
        <p class="synth-notice" data-notice role="status" aria-live="polite" data-tone="info">Your first pattern is ready. Audio stays off until you press Play.</p>
        <details class="synth-import">
          <summary>Import a pattern file or paste JSON <span aria-hidden="true">+</span></summary>
          <div class="synth-import-inner">
            <label class="synth-field" for="synth-import-file"><span>Open a Pocket Synth JSON file</span><input id="synth-import-file" type="file" accept=".json,application/json" aria-describedby="synth-import-help"></label>
            <p id="synth-import-help" class="synth-small">Version 1 only · 32 KB maximum · checked before loading · nothing is uploaded.</p>
            <label class="synth-field" for="synth-json"><span>Pattern JSON</span><textarea id="synth-json" rows="8" maxlength="${MAX_JSON_LENGTH}" spellcheck="false" placeholder="Paste a Pocket Synth JSON export here."></textarea></label>
            <div class="synth-file-actions">
              <button type="button" class="synth-button synth-button-red" data-action="import">Import JSON</button>
              <button type="button" class="synth-button" data-action="show-json">Show current JSON</button>
            </div>
          </div>
        </details>

        <div class="synth-starters-heading"><h3>Four original starting points.</h3><p>Not covers. Not samples. Just a few ways into the grid.</p></div>
        <div class="synth-starter-cards">
          ${STARTERS.map((starter, index) => `
            <article class="synth-starter-card" data-starter-card="${starter.id}" data-selected="${index === 0}">
              <div class="synth-starter-meta"><span>0${index + 1} / ${starter.character}</span><span>${starter.pattern.tempo} BPM</span></div>
              <h4>${escapeMarkup(starter.pattern.name)}</h4>
              <div class="synth-pattern-mini" aria-hidden="true">${starter.pattern.tracks.flatMap((track) => track.steps.map((on) => `<i data-on="${on}"></i>`)).join('')}</div>
              <p>${escapeMarkup(starter.description)}</p>
              <p class="synth-starter-tip"><strong>Try this:</strong> ${escapeMarkup(starter.suggestion)}</p>
              <button type="button" data-load-starter="${starter.id}" aria-label="Load ${escapeMarkup(starter.pattern.name)}">Load pattern <span aria-hidden="true">↗</span></button>
            </article>`).join('')}
        </div>
      </section>

      <section id="synth-how" class="synth-how" aria-labelledby="synth-how-title">
        <div class="synth-section-heading"><div><p class="synth-kicker">03 / UNDER THE LID</p><h2 id="synth-how-title">No magic. A few good waves.</h2></div><span class="synth-margin-note">THE SIGNAL PATH</span></div>
        <ol class="synth-signal-path">
          <li><span>01</span><h3>The clock</h3><p>Sixteen equal subdivisions make one 4/4 bar. Steps 1, 5, 9, and 13 land on the beats. Tempo sets how fast the bar comes around.</p></li>
          <li><span>02</span><h3>The voices</h3><p>Each lit pad triggers an oscillator or locally generated noise. An envelope shapes its attack and decay; filters change its tone.</p></li>
          <li><span>03</span><h3>The mix</h3><p>Five quiet voices meet at the capped master gain, then a safety compressor, then your speakers. All sound is made by Web Audio in this browser.</p></li>
        </ol>
        <div class="synth-voice-notes">
          ${TRACKS.map((track, index) => `<article><span class="synth-voice-note-number">0${index + 1}</span><div><h3>${track.label} <span>${track.material}</span></h3><p>${track.description}</p></div></article>`).join('')}
        </div>
        <div class="synth-playing-notes">
          <div><h3>Leave some air.</h3><p>Start with a kick on 1 and 9, a snare on 5 and 13, and a few hats in between. Add just two bass notes. Repetition does most of the work; the empty pads matter too.</p></div>
          <div><h3>Not hearing anything?</h3><p>Press Play, raise the master a little, and check that some pads are on and their tracks are not muted. Check your device’s sound output, too. Hiding the browser tab or leaving this page stops the engine. Workspace panes and sound settings keep it playing. It never resumes by itself.</p></div>
        </div>
      </section>
      <footer class="synth-footer"><strong>POCKET SYNTH / PS—16</strong><p>No account. No microphone. No audio leaves this page.</p><a href="#synth-machine">Back to the machine ↑</a></footer>
    </div>`;

  const content = query<HTMLElement>(root, '.synth-content');
  const how = query<HTMLElement>(root, '#synth-how');
  const machineSection = query<HTMLElement>(root, '#synth-machine');
  const reading = document.createElement('div');
  reading.className = 'synth-machine-notes';
  for (const selector of [
    '.synth-machine-section > .synth-section-heading', '.synth-introduction',
    '.synth-grid-help', '.synth-machine-bottom', '.synth-under-machine',
  ]) reading.append(query<HTMLElement>(root, selector));
  how.append(reading, query<HTMLElement>(root, '.synth-footer'));
  machineSection.removeAttribute('aria-labelledby');
  machineSection.setAttribute('aria-label', 'Step sequencer');
  const panes = [
    { id: 'machine', label: 'Machine', panel: machineSection },
    { id: 'notebook', label: 'Notebook', panel: query<HTMLElement>(root, '#synth-notebook') },
    { id: 'guide', label: 'Guide', panel: how },
  ].map(pane => {
    const wrapper = document.createElement('div');
    wrapper.className = `synth-pane synth-pane-${pane.id}`;
    wrapper.append(pane.panel);
    content.append(wrapper);
    return { ...pane, panel: wrapper };
  });
  const tabs = createWorkspaceTabs(page, {
    id: 'synth-workspace', label: 'Pocket Synth workspace',
    host: query<HTMLElement>(root, '[data-synth-tabs]'), panes,
  });
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="#synth-machine"]')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      tabs.select('machine');
    }, { signal });
  }
  const settings = document.createElement('div');
  settings.className = 'synth-settings';
  for (const selector of ['.synth-starter-control', '.synth-root-control', '.synth-volume-control']) {
    settings.append(query<HTMLElement>(root, selector));
  }
  createWorkspaceDialog(page, {
    id: 'synth-sound-settings', title: 'Sound settings', content: [settings],
    triggers: [query<HTMLElement>(root, '.synth-settings-open')],
  });

  const playButton = query<HTMLButtonElement>(root, '.synth-play');
  const stopButton = query<HTMLButtonElement>(root, '.synth-stop');
  const playLabel = query<HTMLSpanElement>(root, '[data-play-label]');
  const machine = query<HTMLElement>(root, '.synth-machine');
  const statusText = query<HTMLSpanElement>(root, '[data-status-text]');
  const stepReadout = query<HTMLElement>(root, '[data-step-readout]');
  const patternName = query<HTMLElement>(root, '[data-pattern-name]');
  const nameInput = query<HTMLInputElement>(root, '#synth-pattern-name');
  const nameError = query<HTMLElement>(root, '#synth-name-error');
  const starterSelect = query<HTMLSelectElement>(root, '#synth-starter');
  const tempoInput = query<HTMLInputElement>(root, '#synth-tempo');
  const bassSelect = query<HTMLSelectElement>(root, '#synth-root');
  const volumeInput = query<HTMLInputElement>(root, '#synth-volume');
  const volumeOutput = query<HTMLOutputElement>(root, '[data-volume]');
  const notice = query<HTMLElement>(root, '[data-notice]');
  const saveState = query<HTMLElement>(root, '[data-save-state]');
  const workspaceKind = query<HTMLElement>(root, '[data-workspace-kind]');
  const silenceNote = query<HTMLElement>(root, '[data-silence]');
  const jsonInput = query<HTMLTextAreaElement>(root, '#synth-json');
  const fileInput = query<HTMLInputElement>(root, '#synth-import-file');
  const scrollPanel = query<HTMLElement>(root, '.synth-sequence-scroll');
  const pads = TRACKS.map((_, row) => Array.from({ length: STEP_COUNT }, (_, step) =>
    query<HTMLButtonElement>(root, `[data-track-index="${row}"][data-step="${step}"]`)));
  const columns = Array.from({ length: STEP_COUNT }, (_, step) =>
    [...root.querySelectorAll<HTMLElement>(`[data-column="${step}"]`)]);
  let focusedPad = pads[0][0];
  let shownStep = -1;

  function notify(message: string, tone: 'info' | 'error' = 'info'): void {
    if (signal.aborted) return;
    notice.textContent = message;
    notice.dataset.tone = tone;
    if (tone === 'error') page.report(message);
  }

  const engine = new SynthEngine(pattern, {
    onState(state, message) {
      machine.dataset.transport = state;
      statusText.textContent = message;
      playButton.disabled = state === 'playing' || state === 'starting';
      stopButton.disabled = state !== 'playing' && state !== 'starting';
      playLabel.textContent = state === 'starting' ? 'Opening…' : 'Play';
    },
    onStep(step) {
      if (shownStep === step) return;
      if (shownStep >= 0) columns[shownStep].forEach((element) => { element.dataset.current = 'false'; });
      if (step >= 0) columns[step].forEach((element) => { element.dataset.current = 'true'; });
      shownStep = step;
      stepReadout.textContent = step < 0 ? 'STEP — / 16' : `STEP ${String(step + 1).padStart(2, '0')} / 16`;
    },
    onError: (message) => notify(message, 'error'),
  });
  page.onCleanup(() => {
    importOperation++;
    engine.destroy();
  });

  function updateSilenceHint(): void {
    const hasSteps = pattern.tracks.some((track) => !track.muted && track.steps.some(Boolean));
    silenceNote.hidden = pattern.volume > 0 && hasSteps;
    silenceNote.textContent = pattern.volume === 0
      ? 'Master is at 0%. Raise it to listen.'
      : 'Silent: enable an unmuted pad.';
  }

  function updateTempoControls(): void {
    tempoInput.value = String(pattern.tempo);
    query<HTMLButtonElement>(root, '[data-action="slower"]').disabled = pattern.tempo === MIN_TEMPO;
    query<HTMLButtonElement>(root, '[data-action="faster"]').disabled = pattern.tempo === MAX_TEMPO;
  }

  function updateStarterCards(id?: string): void {
    root.querySelectorAll<HTMLElement>('[data-starter-card]').forEach((card) => {
      card.dataset.selected = String(card.dataset.starterCard === id);
    });
  }

  function edited(): void {
    importOperation++;
    starterSelect.value = 'workspace';
    workspaceKind.textContent = 'Custom workspace / edited';
    saveState.textContent = 'Unsaved changes. Save locally or export a JSON copy.';
    updateStarterCards();
    updateSilenceHint();
    engine.updatePattern(pattern);
  }

  function renderPattern(): void {
    patternName.textContent = pattern.name;
    nameInput.value = pattern.name;
    nameInput.setCustomValidity('');
    nameInput.removeAttribute('aria-invalid');
    nameError.hidden = true;
    updateTempoControls();
    bassSelect.value = String(pattern.bassNote);
    volumeInput.value = String(pattern.volume);
    volumeOutput.value = `${pattern.volume}%`;
    for (const [row, track] of pattern.tracks.entries()) {
      for (let step = 0; step < STEP_COUNT; step++) pads[row][step].setAttribute('aria-pressed', String(track.steps[step]));
      const mute = query<HTMLButtonElement>(root, `[data-mute="${track.id}"]`);
      mute.setAttribute('aria-pressed', String(track.muted));
      query<HTMLElement>(mute, '[data-mute-label]').textContent = track.muted ? 'Muted' : 'Mute';
      query<HTMLElement>(root, `[data-row="${track.id}"]`).dataset.muted = String(track.muted);
    }
    updateSilenceHint();
  }

  function replacePattern(next: SynthPattern, message: string, starterId?: string): void {
    importOperation++;
    engine.stop('Pattern loaded. Press Play to start from step 1.');
    pattern = clonePattern(next);
    engine.updatePattern(pattern);
    renderPattern();
    starterSelect.value = starterId ?? 'workspace';
    const starterIndex = STARTERS.findIndex((starter) => starter.id === starterId);
    workspaceKind.textContent = starterId ? `Original starter / 0${starterIndex + 1}` : 'Custom workspace';
    updateStarterCards(starterId);
    saveState.textContent = 'Workspace loaded. Save locally or export to keep a separate copy.';
    notify(message);
  }

  function loadStarter(id: string): void {
    const starter = STARTERS.find((item) => item.id === id);
    if (starter) replacePattern(starter.pattern, `Loaded “${starter.pattern.name}”. Make it your own; press Play when ready.`, id);
  }

  function commitName(report = false): boolean {
    const result = validatePattern({ ...pattern, name: nameInput.value.trim() });
    if (!result.ok) {
      nameInput.setCustomValidity(result.error);
      nameInput.setAttribute('aria-invalid', 'true');
      nameError.hidden = false;
      nameError.textContent = result.error;
      if (report) {
        notify(result.error, 'error');
        nameInput.focus();
        nameInput.reportValidity();
      }
      return false;
    }
    nameInput.setCustomValidity('');
    nameInput.removeAttribute('aria-invalid');
    nameError.hidden = true;
    if (pattern.name !== result.pattern.name) {
      pattern.name = result.pattern.name;
      patternName.textContent = pattern.name;
      edited();
    }
    if (report) nameInput.value = pattern.name;
    return true;
  }

  function importJSON(text: string): void {
    const result = parsePatternJSON(text);
    if (!result.ok) {
      jsonInput.setAttribute('aria-invalid', 'true');
      notify(`Nothing changed. ${result.error}`, 'error');
      return;
    }
    jsonInput.removeAttribute('aria-invalid');
    replacePattern(result.pattern, `Imported “${result.pattern.name}”. Checked and ready; press Play to hear it.`);
  }

  function setPadFocus(button: HTMLButtonElement, move = false): void {
    focusedPad.tabIndex = -1;
    focusedPad = button;
    focusedPad.tabIndex = 0;
    if (move) {
      focusedPad.focus({ preventScroll: true });
      focusedPad.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.step !== undefined) {
      const row = Number(button.dataset.trackIndex);
      const step = Number(button.dataset.step);
      pattern.tracks[row].steps[step] = !pattern.tracks[row].steps[step];
      button.setAttribute('aria-pressed', String(pattern.tracks[row].steps[step]));
      setPadFocus(button);
      edited();
      return;
    }
    if (button.dataset.mute) {
      const track = pattern.tracks.find((item) => item.id === button.dataset.mute)!;
      track.muted = !track.muted;
      button.setAttribute('aria-pressed', String(track.muted));
      query<HTMLElement>(button, '[data-mute-label]').textContent = track.muted ? 'Muted' : 'Mute';
      query<HTMLElement>(root, `[data-row="${track.id}"]`).dataset.muted = String(track.muted);
      edited();
      return;
    }
    if (button.dataset.loadStarter) {
      loadStarter(button.dataset.loadStarter);
      return;
    }
    switch (button.dataset.action) {
      case 'slower':
      case 'faster':
        pattern.tempo = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, pattern.tempo + (button.dataset.action === 'faster' ? 1 : -1)));
        updateTempoControls();
        edited();
        break;
      case 'clear':
        replacePattern({
          ...pattern,
          tracks: pattern.tracks.map((track) => ({ ...track, steps: Array<boolean>(STEP_COUNT).fill(false) })),
        }, 'All pads are off. Tempo, tuning, and mutes are kept. Add a few steps to begin again.');
        break;
      case 'save':
        if (commitName(true) && writeLocalData(STORAGE_KEY, pattern, (message) => notify(message, 'error'))) {
          saveState.textContent = `Saved “${pattern.name}” in this browser.`;
          notify('Pattern saved locally. This replaces the previous local save; export JSON for extra copies.');
        }
        break;
      case 'load': {
        let readFailed = false;
        const saved = readLocalData(STORAGE_KEY, isPattern, (message) => {
          readFailed = true;
          notify(`Workspace unchanged. ${message}`, 'error');
        });
        if (saved) {
          const checked = validatePattern(saved);
          if (checked.ok) replacePattern(checked.pattern, `Loaded the local save “${checked.pattern.name}”. Press Play when ready.`);
        } else if (!readFailed) notify('There is no local save yet. Use Save locally to keep this pattern in this browser.');
        break;
      }
      case 'export':
        if (commitName(true)) {
          downloadText(patternFilename(pattern.name), patternJSON(pattern), 'application/json;charset=utf-8');
          notify('Your pattern JSON is prepared. Check your browser’s downloads; import it here to play it again.');
        }
        break;
      case 'import':
        importOperation++;
        importJSON(jsonInput.value);
        break;
      case 'show-json':
        if (commitName(true)) {
          jsonInput.value = patternJSON(pattern);
          jsonInput.removeAttribute('aria-invalid');
          notify('The current pattern is in the JSON field. You can select and copy it, or edit it and import.');
        }
        break;
    }
  }, { signal });

  playButton.addEventListener('click', () => { void engine.start(); }, { signal });
  stopButton.addEventListener('click', () => engine.stop(), { signal });
  starterSelect.addEventListener('change', () => loadStarter(starterSelect.value), { signal });
  nameInput.addEventListener('input', () => { importOperation++; commitName(); }, { signal });
  nameInput.addEventListener('change', () => { if (commitName()) nameInput.value = pattern.name; }, { signal });
  tempoInput.addEventListener('input', () => { importOperation++; }, { signal });
  tempoInput.addEventListener('change', () => {
    const tempo = Number(tempoInput.value);
    if (!Number.isInteger(tempo) || tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
      notify(`Tempo stays at ${pattern.tempo} BPM. Enter a whole number from ${MIN_TEMPO} to ${MAX_TEMPO}.`, 'error');
      updateTempoControls();
      return;
    }
    pattern.tempo = tempo;
    updateTempoControls();
    edited();
  }, { signal });
  bassSelect.addEventListener('change', () => {
    pattern.bassNote = Number(bassSelect.value);
    edited();
  }, { signal });
  volumeInput.addEventListener('input', () => {
    pattern.volume = Number(volumeInput.value);
    volumeOutput.value = `${pattern.volume}%`;
    edited();
  }, { signal });
  jsonInput.addEventListener('input', () => { importOperation++; jsonInput.removeAttribute('aria-invalid'); }, { signal });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';
    const operation = ++importOperation;
    if (file.size > MAX_JSON_LENGTH) {
      notify('Nothing changed. The file is too large; Pocket Synth accepts JSON files up to 32 KB.', 'error');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
      if (!signal.aborted && operation === importOperation) notify('The file could not be read. Try selecting it again, or paste its JSON. Your workspace is unchanged.', 'error');
      return;
    }
    if (signal.aborted || operation !== importOperation) return;
    importJSON(text);
  }, { signal });
  scrollPanel.addEventListener('keydown', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-step]');
    if (!button || event.altKey || event.metaKey || event.shiftKey) return;
    let row = Number(button.dataset.trackIndex);
    let step = Number(button.dataset.step);
    switch (event.key) {
      case 'ArrowLeft': step = (step + STEP_COUNT - 1) % STEP_COUNT; break;
      case 'ArrowRight': step = (step + 1) % STEP_COUNT; break;
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(TRACKS.length - 1, row + 1); break;
      case 'Home': step = 0; if (event.ctrlKey) row = 0; break;
      case 'End': step = STEP_COUNT - 1; if (event.ctrlKey) row = TRACKS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setPadFocus(pads[row][step], true);
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) engine.interrupt('Playback stopped because the page was hidden. Press Play to begin again.');
  }, { signal });
  window.addEventListener('pagehide', () => {
    engine.interrupt('Playback stopped because you left this page. Press Play to begin again.');
  }, { signal });

  updateSilenceHint();
  return { destroy: page.destroy };
}
