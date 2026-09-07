import './style.css';
import { copyText, createProjectPage, escapeMarkup, query } from '../../core/page';
import { clamp } from '../../core/math';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceTabs } from '../../core/workspace';
import { RadioAudio } from './audio';
import type { RadioMode, RadioStatus } from './audio';
import { stationFromHash, stations } from './data';
import type { Station } from './data';
import { antenna, dialPosition, logbook, printedDial, stationGlyph, stationSketch } from './illustrations';

const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7V3Z" fill="currentColor"/></svg>';
const stopIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5z" fill="currentColor"/></svg>';
const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function stationCard(station: Station, selected: boolean): string {
  return `<li>
    <button type="button" class="radio-station-card" data-radio-station="${station.id}" aria-pressed="${selected}" aria-label="${escapeMarkup(`${station.number}. ${station.name}, ${station.frequency} on the imaginary dial`)}">
      <span class="radio-card-top"><span class="radio-mono">STN. ${station.number}</span><span class="radio-card-frequency">${station.frequency}</span></span>
      ${stationGlyph(station.id)}
      <span class="radio-card-name">${escapeMarkup(station.name)}</span>
      <span class="radio-card-character">${escapeMarkup(station.character)}</span>
      <span class="radio-card-bottom"><span data-radio-card-state>${selected ? 'Selected station' : 'Open notebook'}</span><span aria-hidden="true">↗</span></span>
    </button>
  </li>`;
}

function stationNotebook(station: Station): string {
  return `<section class="radio-notebook" id="radio-notebook" aria-labelledby="radio-story-title">
    <article class="radio-story">
      <p class="radio-eyebrow">Field notebook / ${station.number} <span>Fictional place</span></p>
      <p class="radio-notebook-invitation">${escapeMarkup(station.invitation)}</p>
      <p class="radio-place">${escapeMarkup(station.place)}</p>
      <h2 id="radio-story-title">${escapeMarkup(station.storyTitle)}</h2>
      <figure class="radio-notebook-sketch">${stationSketch(station)}<figcaption>${escapeMarkup(station.sketchCaption)}</figcaption></figure>
      <div class="radio-story-prose">${station.story.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}</div>
      <div class="radio-pocket-list"><h3>Objects to notice</h3><ul>${station.objects.map((object) => `<li>${escapeMarkup(object)}</li>`).join('')}</ul></div>
    </article>
    <aside class="radio-recipe" aria-labelledby="radio-recipe-title">
      <div class="radio-recipe-heading"><span class="radio-mono">RECIPE ${station.number}</span><span aria-hidden="true">⌁</span></div>
      <h2 id="radio-recipe-title">Sounds, assembled here.</h2>
      <p>Not a recording of this place. A small set of browser-made sounds to imagine it with.</p>
      <ol>${station.recipe.map((part) => `<li><h3>${escapeMarkup(part.name)}</h3><p>${escapeMarkup(part.detail)}</p></li>`).join('')}</ol>
      <div class="radio-recipe-footnote"><span aria-hidden="true">↳</span><p>Original synthesis. No voices, borrowed music, microphone, or incoming audio.</p></div>
    </aside>
  </section>
  <section class="radio-program-guide" aria-labelledby="radio-program-title">
    <div class="radio-section-heading"><div><p class="radio-eyebrow">From the station desk</p><h2 id="radio-program-title">The station day.</h2></div><span class="radio-stamp">Fictional timetable</span></div>
    <p class="radio-section-intro">An imagined schedule for ${escapeMarkup(station.name)}, not a live program listing. These stories stay put; the continuous sound recipe does not follow the clock or play spoken programs.</p>
    <ol class="radio-programs">${station.programs.map((program) => `<li>
      <span class="radio-program-time">${escapeMarkup(program.time)}</span>
      <h3>${escapeMarkup(program.title)}</h3><p>${escapeMarkup(program.description)}</p>
    </li>`).join('')}</ol>
  </section>
  <section class="radio-field-notes" aria-labelledby="radio-notes-title">
    <div class="radio-section-heading"><div><p class="radio-eyebrow">Margins & small concerns</p><h2 id="radio-notes-title">Notes for the next keeper.</h2></div></div>
    <ol>${station.notes.map((note, index) => `<li><span class="radio-note-number">0${index + 1}</span><div><h3>${escapeMarkup(note.heading)}</h3><p>${escapeMarkup(note.text)}</p></div></li>`).join('')}</ol>
  </section>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'radio');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let selected = Math.max(0, stationFromHash(window.location.hash));
  let mode: RadioMode = 'off';
  const initial = stations[selected];
  const finalStationNumber = stations[stations.length - 1].number;
  root.style.setProperty('--radio-station', initial.color);
  root.dataset.radioMode = 'off';
  root.innerHTML = `<div class="radio-wrap">
    <header class="radio-header">
      <a class="radio-brand" href="#radio-receiver" aria-label="Radio 404 receiver">${antenna}<div class="radio-brand-text"><h1>Radio <span>404</span></h1><span>Four places / no signal required</span></div></a>
      <nav class="radio-navigation" aria-label="Radio 404 navigation">
        <div data-radio-tabs></div>
      </nav>
    </header>

    <div class="radio-introduction">
      <div><p class="radio-eyebrow">Four places / no signal required</p><h2>Fiction, at low volume.</h2></div>
      <p>A warm window. A room below the tide.<br class="radio-desktop-break"/> Tune to somewhere that isn’t on the map.</p>
      <div class="radio-edition" aria-label="Volume one, four fictional stations"><span>VOL. 01</span><strong>Fiction,<br/>at low volume.</strong></div>
    </div>

    <section class="radio-receiver" id="radio-receiver" aria-label="Receiver" data-project-preview>
      <div class="radio-receiver-top"><span>R–404 <span class="radio-receiver-model">/ Wide imaginary band</span></span><span class="radio-power-state"><span class="radio-power-dot" aria-hidden="true"></span><span data-radio-power>Sound off</span></span></div>
      <div class="radio-receiver-body">
        <div class="radio-tuner">
          <div class="radio-selected-heading">
            <div><p class="radio-eyebrow">Station <span data-radio-number>${initial.number}</span> / ${finalStationNumber}</p><h2 data-radio-name>${escapeMarkup(initial.name)}</h2></div>
            <div class="radio-frequency"><strong data-radio-frequency>${initial.frequency}</strong><span>Imaginary dial</span></div>
          </div>
          <p class="radio-invitation" data-radio-invitation>${escapeMarkup(initial.invitation)}</p>
          ${printedDial(selected)}
          <div class="radio-tuning-controls">
            <button type="button" class="radio-step radio-step-back" data-radio-previous aria-label="Previous station">${arrowIcon}<span>Prev</span></button>
            <div class="radio-tuning-range"><label for="radio-tuning">Tune a station <span>01 — ${finalStationNumber}</span></label><input id="radio-tuning" data-radio-tuning type="range" min="0" max="${stations.length - 1}" step="1" value="${selected}" aria-valuetext="${escapeMarkup(`${initial.number}. ${initial.name}, ${initial.frequency} on the imaginary dial`)}"/></div>
            <button type="button" class="radio-step" data-radio-next aria-label="Next station">${arrowIcon}<span>Next</span></button>
          </div>
          <div class="radio-audio-controls">
            <button type="button" class="radio-listen" data-radio-listen aria-pressed="false">${playIcon}<span>Listen</span></button>
            <button type="button" class="radio-stop" data-radio-stop disabled>${stopIcon}<span>Stop</span></button>
            <div class="radio-volume"><div><label for="radio-volume">Volume</label><output for="radio-volume" data-radio-volume-output>45%</output></div><input id="radio-volume" data-radio-volume type="range" min="0" max="100" step="1" value="45" aria-valuetext="45 percent" aria-describedby="radio-volume-help"/></div>
          </div>
          <p class="radio-audio-status" role="status" aria-live="polite" aria-atomic="true" data-radio-status>Sound is off. Browse first, or press Listen.</p>
          <p class="radio-audio-error" role="alert" data-radio-error hidden></p>
        </div>
        <figure class="radio-receiver-sketch"><div data-radio-sketch>${stationSketch(initial)}</div><figcaption><span class="radio-mono">FIG. <span data-radio-figure-number>${initial.number}</span></span><span data-radio-caption>${escapeMarkup(initial.sketchCaption)}</span></figcaption><span class="radio-sketch-seal" aria-hidden="true">Nothing incoming.<br/>A place imagined.</span></figure>
      </div>
      <div class="radio-receiver-footer"><p><span aria-hidden="true">✳</span> Generated on your device, not a live broadcast.</p><button type="button" data-radio-copy>Copy station link <span aria-hidden="true">↗</span></button></div>
    </section>
    <div class="radio-receiver-afterword"><p id="radio-volume-help">Start low. 0% mutes.</p><p role="status" aria-live="polite" data-radio-link-status></p></div>

    <section class="radio-stations" id="radio-stations" aria-labelledby="radio-stations-title">
      <div class="radio-section-heading"><div><p class="radio-eyebrow">The station directory</p><h2 id="radio-stations-title">Where shall we linger?</h2></div><p>Choose a station to open its notebook.<br/>Sound stays off until you press Listen.</p></div>
      <ul class="radio-station-list">${stations.map((station, index) => stationCard(station, index === selected)).join('')}</ul>
      <p class="radio-directory-note">Already listening? A new station gently replaces the old one. Just reading? The dial is silent.</p>
    </section>

    <div data-radio-content>${stationNotebook(initial)}</div>

    <section class="radio-guide" id="radio-guide" aria-labelledby="radio-guide-title">
      <div class="radio-guide-title">${logbook}<p class="radio-eyebrow">A short field guide</p><h2 id="radio-guide-title">How to keep<br/>a little quiet.</h2></div>
      <div class="radio-guide-notes">
        <article><span>01 / Find your room</span><h3>The dial is an invitation, not a frequency.</h3><p>Use the station cards, the previous and next buttons, or the tuning slider. With a keyboard, Tab to a control; arrow keys move the sliders. Every story, recipe, and field note is available without listening. The printed numbers are fictional.</p></article>
        <article><span>02 / Let it settle</span><h3>Nothing is coming down the antenna.</h3><p>Listen creates oscillators and filtered noise inside your browser. There are no recordings, external audio requests, microphone access, or spoken shows. The four original recipes vary gently rather than replaying a song. Start with a comfortable, low device volume; the on-page level is deliberately limited.</p></article>
        <article><span>03 / Leave the light off</span><h3>Silence does not need your attention.</h3><p>Stop fades the room out. Hiding this page stops it immediately; leaving closes its audio device. Coming back, following a station link, or using browser history never starts sound. Press Listen yourself when you want to return. Nothing here needs to be caught up on.</p></article>
      </div>
    </section>

    <footer class="radio-footer"><div>${antenna}<p><strong>Radio 404</strong><span>Four fictional places. All words and sounds original.</span></p></div><a href="#radio-receiver">Back to the receiver ↑</a></footer>
  </div>`;

  const wrap = query<HTMLElement>(root, '.radio-wrap');
  const guide = query<HTMLElement>(root, '#radio-guide');
  const receiverPane = document.createElement('div');
  receiverPane.className = 'radio-pane radio-pane-receiver';
  receiverPane.append(
    query<HTMLElement>(root, '#radio-receiver'),
    query<HTMLElement>(root, '.radio-receiver-afterword'),
  );
  const panes = [
    { id: 'receiver', label: 'Receiver', panel: receiverPane },
    { id: 'stations', label: 'Stations', panel: query<HTMLElement>(root, '#radio-stations') },
    { id: 'notebook', label: 'Notebook', panel: query<HTMLElement>(root, '[data-radio-content]') },
    { id: 'guide', label: 'Guide', panel: guide },
  ].map(pane => {
    if (pane.panel === receiverPane) {
      wrap.append(receiverPane);
      return pane;
    }
    const wrapper = document.createElement('div');
    wrapper.className = `radio-pane radio-pane-${pane.id}`;
    wrapper.append(pane.panel);
    if (pane.id === 'guide') wrapper.append(
      query<HTMLElement>(root, '.radio-introduction'),
      query<HTMLElement>(root, '.radio-footer'),
    );
    wrap.append(wrapper);
    return { ...pane, panel: wrapper };
  });
  const tabs = createWorkspaceTabs(page, {
    id: 'radio-workspace', label: 'Radio 404 workspace',
    host: query<HTMLElement>(root, '[data-radio-tabs]'), panes,
  });
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="#radio-receiver"]')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      tabs.select('receiver');
    }, { signal });
  }

  const listenButton = query<HTMLButtonElement>(root, '[data-radio-listen]');
  const stopButton = query<HTMLButtonElement>(root, '[data-radio-stop]');
  const status = query<HTMLElement>(root, '[data-radio-status]');
  const errorMessage = query<HTMLElement>(root, '[data-radio-error]');
  const power = query<HTMLElement>(root, '[data-radio-power]');
  const tuning = query<HTMLInputElement>(root, '[data-radio-tuning]');
  const volume = query<HTMLInputElement>(root, '[data-radio-volume]');
  const volumeOutput = query<HTMLOutputElement>(root, '[data-radio-volume-output]');
  const linkStatus = query<HTMLElement>(root, '[data-radio-link-status]');
  const stationButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-radio-station]')];

  function renderStatus(next: RadioStatus): void {
    mode = next.mode;
    root.dataset.radioMode = mode;
    const busy = mode === 'starting' || mode === 'playing' || mode === 'stopping';
    listenButton.disabled = busy || !audio.supported;
    listenButton.setAttribute('aria-pressed', String(mode === 'playing'));
    stopButton.disabled = !busy;
    const labels: Record<RadioMode, string> = {
      off: 'Sound off', starting: 'Opening', playing: 'Listening', stopping: 'Closing', unavailable: 'Audio unavailable', error: 'Sound off',
    };
    power.textContent = labels[mode];
    const failed = mode === 'error' || mode === 'unavailable';
    errorMessage.hidden = !failed;
    errorMessage.textContent = failed ? next.message : '';
    status.textContent = failed ? 'Receiver silent. The notebook is available.' : next.message;
    if (mode === 'error') page.report(next.message);
  }

  const audio = new RadioAudio(renderStatus);
  page.onCleanup(() => audio.destroy());
  renderStatus(audio.supported
    ? { mode: 'off', message: 'Sound is off. Browse first, or press Listen.' }
    : { mode: 'unavailable', message: 'Web Audio is unavailable in this browser. All station stories and recipes are still open.' });

  function selectStation(index: number, origin: 'control' | 'history'): void {
    if (!Number.isFinite(index)) return;
    const nextIndex = clamp(Math.round(index), 0, stations.length - 1);
    if (nextIndex === selected) return;
    selected = nextIndex;
    const station = stations[selected];
    root.style.setProperty('--radio-station', station.color);
    query<HTMLElement>(root, '[data-radio-number]').textContent = station.number;
    query<HTMLElement>(root, '[data-radio-name]').textContent = station.name;
    query<HTMLElement>(root, '[data-radio-frequency]').textContent = station.frequency;
    query<HTMLElement>(root, '[data-radio-invitation]').textContent = station.invitation;
    query<SVGGElement>(root, '[data-radio-needle]').setAttribute('transform', `translate(${dialPosition(selected)} 0)`);
    query<HTMLElement>(root, '[data-radio-sketch]').innerHTML = stationSketch(station);
    query<HTMLElement>(root, '[data-radio-caption]').textContent = station.sketchCaption;
    query<HTMLElement>(root, '[data-radio-figure-number]').textContent = station.number;
    query<HTMLElement>(root, '[data-radio-content]').innerHTML = stationNotebook(station);
    tuning.value = String(selected);
    tuning.setAttribute('aria-valuetext', `${station.number}. ${station.name}, ${station.frequency} on the imaginary dial`);
    stationButtons.forEach((button, buttonIndex) => {
      const isSelected = buttonIndex === selected;
      button.setAttribute('aria-pressed', String(isSelected));
      query<HTMLElement>(button, '[data-radio-card-state]').textContent = isSelected ? 'Selected station' : 'Open notebook';
    });
    linkStatus.textContent = '';
    audio.tune(station.id);
    if (mode === 'off') {
      status.textContent = `Tuned to ${station.name}. Sound is off until you press Listen.`;
    }
    if (origin === 'control') {
      try {
        window.history.pushState(null, '', `#station-${station.id}`);
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        linkStatus.textContent = 'The station opened, but your browser could not update its link.';
        page.report(linkStatus.textContent);
      }
    }
  }

  stationButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      selectStation(index, 'control');
      tabs.select('notebook');
    }, { signal });
  });
  query<HTMLButtonElement>(root, '[data-radio-previous]').addEventListener('click', () => {
    selectStation((selected - 1 + stations.length) % stations.length, 'control');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-radio-next]').addEventListener('click', () => {
    selectStation((selected + 1) % stations.length, 'control');
  }, { signal });
  tuning.addEventListener('input', () => selectStation(Number(tuning.value), 'control'), { signal });
  volume.addEventListener('input', () => {
    const value = clamp(Number(volume.value), 0, 100);
    volumeOutput.value = value === 0 ? 'Muted' : `${value}%`;
    volume.setAttribute('aria-valuetext', value === 0 ? '0 percent, muted' : `${value} percent`);
    audio.setVolume(value / 100);
  }, { signal });
  listenButton.addEventListener('click', () => {
    if (document.hidden) return;
    void audio.listen(stations[selected].id);
  }, { signal });
  stopButton.addEventListener('click', () => audio.stop(), { signal });

  query<HTMLButtonElement>(root, '[data-radio-copy]').addEventListener('click', () => {
    const station = stations[selected];
    const url = new URL(window.location.href);
    url.hash = `station-${station.id}`;
    void copyText(url.href, (message) => {
      if (signal.aborted) return;
      linkStatus.textContent = message;
      page.report(message);
    }).catch((error: unknown) => {
      if (signal.aborted) return;
      const detail = error instanceof Error ? error.message : String(error);
      linkStatus.textContent = `The station link could not be copied: ${detail}`;
      page.report(linkStatus.textContent);
    });
  }, { signal });

  const followStationHash = () => {
    const index = window.location.hash ? stationFromHash(window.location.hash) : 0;
    if (index < 0) return;
    if (audio.engaged) audio.stop('Sound stopped for history navigation. Press Listen to start this station.', true);
    selectStation(index, 'history');
  };
  window.addEventListener('hashchange', followStationHash, { signal });
  window.addEventListener('popstate', followStationHash, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audio.engaged) {
      audio.stop('Sound stopped while this page was out of view. Press Listen when you return.', true);
    }
  }, { signal });
  const closeOnExit = () => audio.close();
  window.addEventListener('pagehide', closeOnExit, { signal });
  window.addEventListener('beforeunload', closeOnExit, { signal });

  return {
    destroy: page.destroy,
    setPaused(paused) {
      if (paused && audio.engaged) audio.stop('Sound is paused. Press Listen to begin again.', true);
    },
  };
}
