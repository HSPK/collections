import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DISTRICT, INITIAL_PHASE, INITIAL_RAIN, SHOPS, VIEWS } from './data';
import { createStreetEngine, type StreetEngine, type StreetSnapshot } from './engine';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'neon-rain');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'neon-rain-title');
  page.root.innerHTML = `
    <div class="nr-shell">
      <header class="nr-masthead">
        <div class="nr-brand">
          <svg class="nr-mark" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M5 8h38v32H5zM12 32V16l12 16V16m8 0v16" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="m0 6 4-4m40 44 4-4M0 42l4 4M44 2l4 4" stroke="currentColor" stroke-width="2"/>
          </svg>
          <div><p class="nr-eyebrow">An after-dark street directory</p><h1 id="neon-rain-title">NEON RAIN<span aria-hidden="true">↘</span></h1></div>
        </div>
        <p class="nr-edition"><span>VOL. 037 / NIGHT STUDIES</span><strong>Take the long way home.</strong></p>
        <button type="button" class="nr-directory-toggle" data-nr-directory>Directory</button>
      </header>

      <figure class="nr-screen">
        <div class="nr-scene" data-neon-scene data-project-preview>
          <div class="nr-scene-top" aria-hidden="true">
            <span class="nr-location-code">VW—07 / EAST PASSAGE</span><span class="nr-time">02:17 AM · FICTIONAL SET</span>
          </div>
          <div class="nr-scene-caption">
            <p class="nr-eyebrow">Somewhere between the last show &amp; the first tram</p>
            <h2>${DISTRICT}<span aria-hidden="true">.</span></h2>
            <p class="nr-caption-note">Six lights left on. Nobody in a hurry.</p>
          </div>
          <span class="nr-frame-mark" aria-hidden="true">37<br>—<br>N</span>
        </div>
        <figcaption class="nr-camera-strip">
          <span class="nr-camera-label">Choose a corner <span aria-hidden="true">→</span></span>
          <div class="nr-views" role="group" aria-label="Camera views">
            ${VIEWS.map((view) => `<button type="button" data-view-button="${view.id}" aria-label="${view.label} view" aria-pressed="${view.id === 'street'}"><span>${view.number}</span>${view.label}</button>`).join('')}
          </div>
          <span class="nr-view-location" data-view-location>${VIEWS[0].location}</span>
        </figcaption>
      </figure>

      <section class="nr-console" aria-label="Night set controls">
        <div class="nr-transport">
          <span class="nr-eyebrow">The night is yours</span>
          <button class="nr-play" type="button" data-play><span data-play-icon aria-hidden="true">Ⅱ</span><span data-play-text>Pause</span></button>
          <span class="nr-motion-label" data-motion-label>Weather in motion</span>
        </div>
        <div class="nr-setting">
          <label for="nr-rain">Rain intensity <output for="nr-rain" data-rain-output>${INITIAL_RAIN}%</output></label>
          <input id="nr-rain" type="range" min="0" max="100" step="5" value="${INITIAL_RAIN}">
          <span class="nr-setting-note" data-rain-readout>Preparing the rain volume…</span>
        </div>
        <div class="nr-setting">
          <label for="nr-light">Light power <output for="nr-light" data-light-output>100%</output></label>
          <input id="nr-light" type="range" min="25" max="150" step="5" value="100">
          <span class="nr-setting-note">From last orders to all-night glow</span>
        </div>
        <div class="nr-setting">
          <label for="nr-phase">Rain phase <output for="nr-phase" data-phase-output aria-live="off">${INITIAL_PHASE.toFixed(1)} s</output></label>
          <input id="nr-phase" type="range" min="0" max="11.9" step="0.1" value="${INITIAL_PHASE}">
          <span class="nr-setting-note">Scrub a 12-second loop · holds the frame</span>
        </div>
      </section>
      <div class="nr-under-console">
        <p data-neon-status role="status">Invented weather. Real time to wander.</p>
        <p>Drag / pinch to explore · arrows to look · <kbd>1</kbd>–<kbd>3</kbd> views · <kbd>Space</kbd> pause</p>
      </div>

      <section class="nr-directory" aria-labelledby="nr-directory-title">
        <div class="nr-section-heading"><h2 id="nr-directory-title">Still open, probably.</h2><span>06 ADDRESSES / NO REAL COORDINATES</span></div>
        <ol class="nr-addresses">
          ${SHOPS.map((shop) => `<li style="--shop-color:${shop.color}"><span class="nr-address-number">${shop.number}</span><div><h3>${escapeMarkup(shop.name)}</h3><p>${escapeMarkup(shop.note)}</p></div><span class="nr-open-dot" aria-hidden="true"></span></li>`).join('')}
        </ol>
      </section>
      <footer class="nr-footer">
        <p><span class="nr-footer-star" aria-hidden="true">✳</span> A neighborhood that only exists after dark.</p>
        <details><summary>Field notes</summary><p>Vesper Ward is fiction, not a forecast or a map. Every sign is drawn here, every building assembled locally. Broken, inverted sign textures make the wet-road reflections; there is no expensive live mirror or bloom pass. Rain is a seeded, repeating volume. Nothing streams in, and nothing is recorded.</p></details>
      </footer>
    </div>`;

  createWorkspaceDialog(page, {
    id: 'nr-directory-dialog', title: 'Directory & field notes',
    triggers: [query<HTMLElement>(page.root, '[data-nr-directory]')],
    content: [
      query<HTMLElement>(page.root, '.nr-directory'),
      ...page.root.querySelectorAll<HTMLElement>('.nr-setting-note'),
      query<HTMLElement>(page.root, '.nr-under-console p:last-child'),
      query<HTMLElement>(page.root, '.nr-footer'),
    ],
  });

  const canvasHost = query<HTMLElement>(page.root, '[data-neon-scene]');
  const consoleHost = query<HTMLElement>(page.root, '.nr-console');
  const play = query<HTMLButtonElement>(page.root, '[data-play]');
  const playText = query<HTMLElement>(page.root, '[data-play-text]');
  const playIcon = query<HTMLElement>(page.root, '[data-play-icon]');
  const motionLabel = query<HTMLElement>(page.root, '[data-motion-label]');
  const rainInput = query<HTMLInputElement>(page.root, '#nr-rain');
  const lightInput = query<HTMLInputElement>(page.root, '#nr-light');
  const phaseInput = query<HTMLInputElement>(page.root, '#nr-phase');
  const rainOutput = query<HTMLOutputElement>(page.root, '[data-rain-output]');
  const lightOutput = query<HTMLOutputElement>(page.root, '[data-light-output]');
  const phaseOutput = query<HTMLOutputElement>(page.root, '[data-phase-output]');
  const rainReadout = query<HTMLElement>(page.root, '[data-rain-readout]');
  const viewLocation = query<HTMLElement>(page.root, '[data-view-location]');
  const status = query<HTMLElement>(page.root, '[data-neon-status]');
  const viewButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-view-button]'));
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = context.reducedMotion || preference.matches;
  let engine: StreetEngine | undefined;
  const rangeProgress = (input: HTMLInputElement) => {
    const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--nr-range-progress', `${percent}%`);
  };
  [rainInput, lightInput, phaseInput].forEach(rangeProgress);

  function setPaused(value: boolean) {
    paused = value;
    engine?.setPaused(value);
    playText.textContent = value ? 'Play' : 'Pause';
    playIcon.textContent = value ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', value ? 'Play rain' : 'Pause rain');
    motionLabel.textContent = value ? 'A held moment' : 'Weather in motion';
  }

  function renderState(state: StreetSnapshot) {
    if (page.signal.aborted) return;
    Object.assign(page.root.dataset, {
      ready: 'true',
      motion: state.paused ? 'paused' : 'playing',
      rainCount: String(state.rainCount),
      rainBudget: String(state.rainBudget),
      rainPhase: state.phase.toFixed(5),
      rainSampleY: state.firstDropY === null ? 'none' : state.firstDropY.toFixed(5),
      lightPower: state.lightPower.toFixed(2),
      lampIntensity: state.lampIntensity.toFixed(2),
      camera: state.camera,
      view: state.view,
      frame: String(state.frame),
      pixelRatio: String(state.pixelRatio),
    });
    rainReadout.textContent = `${state.rainCount.toLocaleString()} / ${state.rainBudget.toLocaleString()} visible drops`;
    phaseInput.value = state.phase.toFixed(1);
    phaseOutput.value = `${state.phase.toFixed(1)} s`;
    phaseInput.setAttribute('aria-valuetext', `${state.phase.toFixed(1)} seconds of a 12-second loop`);
    rangeProgress(phaseInput);
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.viewButton === state.view));
    viewLocation.textContent = VIEWS.find((item) => item.id === state.view)?.location ?? '';
  }

  setPaused(paused);
  play.addEventListener('click', () => {
    setPaused(!paused);
    status.textContent = paused ? 'The night is held. Look around or scrub the rain.' : 'The rain is moving again.';
  }, { signal: page.signal });
  rainInput.addEventListener('input', () => {
    const intensity = Number(rainInput.value);
    rainOutput.value = `${intensity}%`;
    rangeProgress(rainInput);
    engine?.setRain(intensity);
    status.textContent = intensity === 0 ? 'Rain off. The shop lights stay on.' : `Rain intensity set to ${intensity}%.`;
  }, { signal: page.signal });
  lightInput.addEventListener('input', () => {
    lightOutput.value = `${lightInput.value}%`;
    rangeProgress(lightInput);
    engine?.setLightPower(Number(lightInput.value) / 100);
    status.textContent = `Shop lights and their wet reflections at ${lightInput.value}%.`;
  }, { signal: page.signal });
  phaseInput.addEventListener('input', () => {
    const value = Number(phaseInput.value);
    setPaused(true);
    engine?.setPhase(value);
    status.textContent = `Held at ${value.toFixed(1)} seconds. Play to continue from here.`;
  }, { signal: page.signal });
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      const preset = VIEWS.find((item) => item.id === button.dataset.viewButton);
      if (!preset) throw new Error('The selected Vesper Ward viewpoint is missing.');
      engine?.setView(preset.id);
      status.textContent = `${preset.label} view. ${preset.location}.`;
    }, { signal: page.signal });
  }
  page.root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.code !== 'Space' || !(event.target instanceof HTMLElement)) return;
    if (event.target.closest('dialog')) return;
    if (event.target.isContentEditable || /^(INPUT|BUTTON|SELECT|TEXTAREA|A|SUMMARY)$/.test(event.target.tagName)) return;
    event.preventDefault();
    setPaused(!paused);
    status.textContent = paused ? 'The night is held.' : 'The rain is moving again.';
  }, { signal: page.signal });
  preference.addEventListener('change', () => {
    setPaused(preference.matches);
    status.textContent = preference.matches
      ? 'Reduced motion: the rain is held. All views and controls still work.'
      : 'Motion preference updated. The rain is moving.';
  }, { signal: page.signal });
  try {
    engine = createStreetEngine({
      container: canvasHost,
      controls: consoleHost,
      signal: page.signal,
      reducedMotion: paused,
      report: (message) => { status.textContent = message; },
    }, renderState);
    page.onCleanup(engine.destroy);
    if (paused) status.textContent = 'Reduced motion: a fully lit, held night. Play only when you want to.';
  } catch (error) {
    page.destroy();
    throw error;
  }
  return { destroy: page.destroy, setPaused };
}
