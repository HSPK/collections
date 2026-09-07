import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { INITIAL_TIME, landscapes, seasonStops, YEAR_SECONDS } from './data';
import { createSeasonScene } from './scene';
import { yearTime } from './timeline';

const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 10 7-10 7Z" fill="currentColor"/></svg>';
const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5zm7 0h3v14h-3Z" fill="currentColor"/></svg>';
const arrowIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m-4-4 4 4 4-4M4 14v3h12v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'season-clock');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'season-clock-title');
  page.root.innerHTML = `
    <div class="season-shell">
      <header class="season-masthead">
        <div>
          <p class="season-eyebrow season-brand">
            <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 26V8m0 12C5 20 4 12 5 9c7-1 10 4 10 11Zm0-5C24 15 27 8 24 4c-6 0-9 5-9 11Z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
            An illustrated almanac
          </p>
          <h1 id="season-clock-title">Season <em>Clock</em></h1>
        </div>
        <div class="season-introduction">
          <p>A year, gently unfolding. <br>Turn the seasons. Stay awhile.</p>
          <button class="season-button season-quiet" type="button" data-notes>Field notes <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <section class="season-workbench" aria-label="Seasonal landscape and year controls">
        <div class="season-work">
          <figure class="season-figure" data-project-preview>
            <div class="season-scene" data-scene-host></div>
            <figcaption>
              <div><span class="season-place-number" data-place-number>01</span><strong data-place-name>Riverbend willow</strong></div>
              <span data-place-caption>A slow river. A tree with room to wander.</span>
            </figcaption>
          </figure>
          <section class="season-timeline" aria-label="Year timeline">
            <div class="season-transport">
              <button class="season-button season-play" type="button" data-play>${playIcon}<span>Play year</span></button>
              <button class="season-button season-quiet" type="button" data-restart>
                <span aria-hidden="true">↺</span> Restart year
              </button>
              <div class="season-speed">
                <label for="season-speed">Pace</label>
                <select id="season-speed">
                  <option value="0.5">½× · 144 s</option>
                  <option value="1" selected>1× · 72 s</option>
                  <option value="2">2× · 36 s</option>
                  <option value="4">4× · 18 s</option>
                </select>
              </div>
            </div>
            <div class="season-range-heading">
              <label for="season-year">Turn the year</label>
              <output for="season-year" data-position aria-live="off">26% of the year</output>
            </div>
            <input id="season-year" type="range" min="0" max="1000" step="1" value="260"
              aria-describedby="season-scrub-help" aria-valuetext="Spring, blossom days, 26% of the imagined year">
            <div class="season-range-ends" aria-hidden="true"><span>Winter · 0%</span><span>Winter · 100%</span></div>
            <div class="season-jumps" aria-label="Visit a season">
              ${seasonStops.map((season) => `<button type="button" data-jump="${season.time}"
                aria-label="Jump to ${season.name.toLowerCase()}" aria-pressed="${season.name === 'Spring'}">
                <span class="season-dot" style="--season-dot:${season.color}" aria-hidden="true"></span>${season.name}
              </button>`).join('')}
            </div>
            <p id="season-scrub-help" class="season-help">Scrubbing pauses the year. Go forward, or let the leaves find their way back.</p>
          </section>
        </div>

        <aside class="season-notebook" aria-label="Landscape and field notes">
          <div class="season-place-picker">
            <label for="season-landscape">A place to return to</label>
            <select id="season-landscape">
              ${landscapes.map((landscape) => `<option value="${landscape.id}">${escapeMarkup(landscape.name)}</option>`).join('')}
            </select>
            <p data-place-note>${escapeMarkup(landscapes[0].note)}</p>
          </div>
          <div class="season-observation">
            <div class="season-phase-heading">
              <svg class="season-dial" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="39" fill="none" stroke="#d9e0ce" stroke-width="7"/>
                <g fill="none" stroke-width="7" transform="rotate(-90 50 50)">
                  <circle cx="50" cy="50" r="39" pathLength="100" stroke="#c4d9db" stroke-dasharray="8.5 91.5"/>
                  <circle cx="50" cy="50" r="39" pathLength="100" stroke="#afc796" stroke-dasharray="22.5 77.5" stroke-dashoffset="-10"/>
                  <circle cx="50" cy="50" r="39" pathLength="100" stroke="#4d7958" stroke-dasharray="24.5 75.5" stroke-dashoffset="-34"/>
                  <circle cx="50" cy="50" r="39" pathLength="100" stroke="#c19456" stroke-dasharray="24.5 75.5" stroke-dashoffset="-60"/>
                  <circle cx="50" cy="50" r="39" pathLength="100" stroke="#c4d9db" stroke-dasharray="12.5 87.5" stroke-dashoffset="-86"/>
                </g>
                <g data-clock-hand stroke="#284d38" stroke-width="2" stroke-linecap="round">
                  <path d="M50 58V15"/><circle cx="50" cy="15" r="3" fill="#284d38"/>
                </g>
                <circle cx="50" cy="50" r="5" fill="#284d38"/>
              </svg>
              <div><p class="season-eyebrow" data-season>Spring</p><h2 data-phase>Blossom days</h2></div>
            </div>
            <p class="season-day"><span data-day>Day 094</span><span>/ 360 imagined days</span></p>
            <p class="season-phase-note" data-phase-note></p>
            <dl class="season-layers" aria-label="Illustration layers">
              <div><dt>Canopy</dt><dd><meter min="0" max="1" value="0" aria-label="Canopy layer" data-canopy-meter></meter><span data-canopy>0%</span></dd></div>
              <div><dt>Blossom</dt><dd><meter min="0" max="1" value="0" aria-label="Blossom layer" data-blossom-meter></meter><span data-blossom>0%</span></dd></div>
              <div><dt>Snow</dt><dd><meter min="0" max="1" value="0" aria-label="Snow layer" data-snow-meter></meter><span data-snow>0%</span></dd></div>
            </dl>
          </div>
          <div class="season-keeping">
            <button class="season-button season-save" type="button" data-export>${arrowIcon} Save SVG still</button>
            <p>A little piece of this year, exactly as it is. A vector image, made here in your browser.</p>
          </div>
          <p class="season-status" role="status" aria-live="polite" data-status></p>
        </aside>
      </section>

      <section class="season-notes" id="season-clock-notes" aria-labelledby="season-notes-title">
        <div class="season-notes-heading">
          <p class="season-eyebrow">Notes from the margin</p>
          <h2 id="season-notes-title">One year. <em>Many little changes.</em></h2>
          <p>A stylized, imagined year—not a botanical simulation or a forecast. These places are original drawings, not real locations.</p>
        </div>
        <div class="season-note-columns">
          <article><span class="season-note-number">01 / Structure</span><h3>A tree remembers.</h3>
            <p>The trunk and branches stay put. Layered crown shapes and individual leaves grow over them; winter reveals the same skeleton.</p></article>
          <article><span class="season-note-number">02 / Overlap</span><h3>No sudden costume changes.</h3>
            <p>Snow melts before the crown fills. Blossom overlaps new green, then gives way to summer. Each leaf turns and falls on its own schedule.</p></article>
          <article><span class="season-note-number">03 / Return</span><h3>Even the breeze can go back.</h3>
            <p>Wind, light, and falling leaves all belong to the slider—not the wall clock. The same place and year position always make the same picture. The two winter endpoints meet.</p></article>
        </div>
      </section>
      <footer class="season-footer"><span>Season Clock <span aria-hidden="true">·</span> A quiet study of change</span><span>No hurry. It comes around again.</span></footer>
    </div>`;

  const notebook = query<HTMLElement>(page.root, '.season-notebook');
  const notes = query<HTMLElement>(page.root, '.season-notes');
  const picker = query<HTMLElement>(page.root, '.season-place-picker');
  notebook.prepend(query<HTMLElement>(picker, '[data-place-note]'));
  const locationBar = document.createElement('div');
  locationBar.className = 'season-location-bar';
  locationBar.append(picker, query<HTMLElement>(page.root, '.season-phase-heading'));
  query<HTMLElement>(page.root, '.season-work').prepend(locationBar);
  notebook.prepend(query<HTMLElement>(page.root, '.season-speed'));
  notes.prepend(query<HTMLElement>(page.root, '.season-introduction p'));
  notes.append(query<HTMLElement>(page.root, '.season-help'));
  const caption = query<HTMLElement>(page.root, '.season-figure figcaption');
  const captionText = query<HTMLElement>(caption, '[data-place-caption]');
  const captionNote = document.createElement('p');
  notebook.prepend(captionNote);
  const compact = window.matchMedia('(max-width: 600px)');
  function placeCaption() {
    captionNote.hidden = !compact.matches;
    (compact.matches ? captionNote : caption).append(captionText);
  }
  compact.addEventListener('change', placeCaption, { signal: page.signal });
  placeCaption();

  const dock = document.createElement('div');
  dock.className = 'season-dock';
  dock.append(query<HTMLElement>(page.root, '[data-export]'), query<HTMLElement>(page.root, '[data-status]'));
  query<HTMLElement>(page.root, '.season-shell').append(dock);
  createWorkspaceDialog(page, {
    id: 'season-field-notes',
    title: 'Almanac and field notes',
    triggers: [query<HTMLElement>(page.root, '[data-notes]')],
    content: [notebook, notes, query<HTMLElement>(page.root, '.season-footer')],
  });

  const host = query<HTMLElement>(page.root, '[data-scene-host]');
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const slider = query<HTMLInputElement>(page.root, '#season-year');
  const speedControl = query<HTMLSelectElement>(page.root, '#season-speed');
  const placeControl = query<HTMLSelectElement>(page.root, '#season-landscape');
  const status = query<HTMLElement>(page.root, '[data-status]');
  const positionLabel = query<HTMLOutputElement>(page.root, '[data-position]');
  const dayLabel = query<HTMLElement>(page.root, '[data-day]');
  const seasonLabel = query<HTMLElement>(page.root, '[data-season]');
  const phaseLabel = query<HTMLElement>(page.root, '[data-phase]');
  const phaseNote = query<HTMLElement>(page.root, '[data-phase-note]');
  const clockHand = query<SVGGElement>(page.root, '[data-clock-hand]');
  const layerElements = ['canopy', 'blossom', 'snow'].map((key) => ({
    key: key as 'canopy' | 'blossom' | 'snow',
    text: query<HTMLElement>(page.root, `[data-${key}]`),
    meter: query<HTMLMeterElement>(page.root, `[data-${key}-meter]`),
  }));
  const jumps = [...page.root.querySelectorAll<HTMLButtonElement>('[data-jump]')];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let landscape = landscapes[0];
  let scene = createSeasonScene(host, landscape);
  let position = INITIAL_TIME;
  let speed = 1;
  let paused = context.reducedMotion || preference.matches;
  let disposed = false;

  const setText = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  function render() {
    const frame = scene.draw(position);
    const percentage = Math.round(position * 100);
    const day = Math.min(360, Math.floor(position * 360) + 1);
    slider.value = String(Math.round(position * 1000));
    slider.style.setProperty('--range-progress', `${position * 100}%`);
    slider.setAttribute('aria-valuetext', `${frame.phase.season}, ${frame.phase.name.toLowerCase()}, ${percentage}% of the imagined year`);
    page.root.dataset.yearPosition = position.toFixed(9);
    page.root.dataset.landscape = landscape.id;
    setText(positionLabel, `${percentage}% of the year`);
    setText(dayLabel, `Day ${String(day).padStart(3, '0')}`);
    setText(seasonLabel, frame.phase.season);
    setText(phaseLabel, frame.phase.name);
    setText(phaseNote, frame.phase.note);
    clockHand.setAttribute('transform', `rotate(${(position * 360).toFixed(3)} 50 50)`);
    for (const button of jumps) {
      const stop = seasonStops.find((item) => item.time === Number(button.dataset.jump))!;
      button.setAttribute('aria-pressed', String(stop.name === frame.phase.season));
    }
    for (const layer of layerElements) {
      layer.meter.value = frame[layer.key];
      setText(layer.text, `${Math.round(frame[layer.key] * 100)}%`);
    }
  }

  function updatePlayback() {
    play.innerHTML = `${paused ? playIcon : pauseIcon}<span>${paused ? 'Play year' : 'Pause year'}</span>`;
    play.setAttribute('aria-label', paused ? 'Play year' : 'Pause year');
    page.root.dataset.playback = paused ? 'paused' : 'playing';
  }

  function report(message: string, notify = false) {
    status.textContent = message;
    if (notify) page.report(message);
  }

  render();
  updatePlayback();
  status.textContent = paused
    ? 'A still for your reduced-motion preference. Play the year whenever you choose.'
    : 'One imagined year in 72 seconds. Pause to linger, or turn the year yourself.';
  const loop = createLoop((_elapsed, delta) => {
    if (paused || delta === 0) return;
    position = yearTime(position + delta * speed / YEAR_SECONDS);
    render();
  }, { paused });

  function setPaused(value: boolean) {
    if (disposed) return;
    paused = value;
    loop.setPaused(paused);
    updatePlayback();
  }

  function restart() {
    if (disposed) return;
    setPaused(true);
    position = 0;
    render();
    report('Back to the first winter still. Your landscape and pace are unchanged.');
  }

  play.addEventListener('click', () => {
    setPaused(!paused);
    report(paused ? 'Year paused. Even the breeze is still.' : `Year playing at ${speed}×. Every moving detail follows the year.`);
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-restart]').addEventListener('click', restart, { signal: page.signal });
  slider.addEventListener('pointerdown', () => setPaused(true), { signal: page.signal });
  slider.addEventListener('input', () => {
    setPaused(true);
    position = Number(slider.value) / 1000;
    render();
    setText(status, 'Year paused for a closer look. Use the arrow keys for smaller steps.');
  }, { signal: page.signal });
  for (const button of jumps) {
    button.addEventListener('click', () => {
      setPaused(true);
      position = Number(button.dataset.jump);
      render();
      report(`${seasonLabel.textContent}, held still. Play to continue from here.`);
    }, { signal: page.signal });
  }
  speedControl.addEventListener('change', () => {
    speed = Number(speedControl.value);
    report(`${YEAR_SECONDS / speed} seconds for one year at ${speed}×.${paused ? ' The year is still paused.' : ''}`);
  }, { signal: page.signal });
  placeControl.addEventListener('change', () => {
    const next = landscapes.find((item) => item.id === placeControl.value);
    if (!next) throw new Error('Unknown Season Clock landscape.');
    scene.destroy();
    landscape = next;
    scene = createSeasonScene(host, landscape);
    setText(query(page.root, '[data-place-number]'), landscape.number);
    setText(query(page.root, '[data-place-name]'), landscape.name);
    setText(query(page.root, '[data-place-caption]'), landscape.caption);
    setText(query(page.root, '[data-place-note]'), landscape.note);
    render();
    report(`${landscape.name}. The year position and pace are unchanged.`);
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-export]').addEventListener('click', () => {
    setPaused(true);
    const day = Math.min(360, Math.floor(position * 360) + 1);
    downloadText(`season-clock-${landscape.id}-day-${String(day).padStart(3, '0')}.svg`, scene.snapshot(), 'image/svg+xml;charset=utf-8');
    report('SVG still saved. The year is paused at your snapshot; nothing was uploaded.', true);
  }, { signal: page.signal });
  preference.addEventListener('change', () => {
    setPaused(true);
    report(preference.matches
      ? 'Reduced motion is on. The year is paused; you can still choose Play.'
      : 'Motion preference changed. The year stays paused until you choose Play.');
  }, { signal: page.signal });
  page.onCleanup(() => {
    disposed = true;
    loop.destroy();
    scene.destroy();
  });
  return { destroy: page.destroy, setPaused, reset: restart };
}
