import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { INITIAL_PHASE, LANDMARKS, getLandmark } from './data';
import type { LandmarkId } from './data';
import { createAtlasEngine } from './engine';
import type { AtlasEngine, AtlasState } from './engine';

const globeMark = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#d7b65b"/><path d="m10 16 11-8 9 7-4 10-12 3-5-6zm16 16 8-8 10 1-8 13-9 4z" fill="#427353"/><path d="M5 28c12 4 28 0 38-10M17 5c-4 15 0 32 11 39" fill="none" stroke="#f4efe3" stroke-width="2"/></svg>`;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'paper-planet');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'pp-title');
  page.root.innerHTML = `
    <header class="pp-header">
      <div class="pp-brand">${globeMark}<span>A very small atlas<span>Imaginary places, carefully folded</span></span></div>
      <nav aria-label="Paper Planet"><button type="button" data-pp-notes>Maker’s note</button></nav>
    </header>
    <div class="pp-intro">
      <div><p class="pp-kicker">Edition 01 / A world of little things</p><h1 id="pp-title">Paper Planet<span aria-hidden="true">.</span></h1></div>
      <p>Somewhere small. <br>Something worth a closer look.</p>
    </div>
    <section class="pp-atlas" id="pp-globe" aria-label="Paper Planet field atlas" data-project-preview>
      <section class="pp-exhibit" aria-label="Interactive globe">
        <div class="pp-scene" data-pp-scene>
          <div class="pp-plate"><span class="pp-small-label">A handmade hemisphere</span><span>Fig. 01 <span aria-hidden="true">—</span> turn to discover</span></div>
          <span class="pp-fiction-stamp">Entirely<br><em>imaginary</em></span>
          <div class="pp-orientation" aria-hidden="true"><span>↑</span>this way<br>is also up</div>
          <div class="pp-zoom" aria-label="Globe zoom">
            <button type="button" data-pp-zoom-in aria-label="Zoom in">+</button>
            <button type="button" data-pp-zoom-out aria-label="Zoom out">−</button>
          </div>
          <div class="pp-scene-caption"><span class="pp-location" data-pp-location>Six places. One little world.</span><span class="pp-motion-indicator" data-pp-motion-label>Breeze paused</span></div>
        </div>
        <div class="pp-under-scene">
          <p id="pp-orbit-help"><span aria-hidden="true">↔</span> Drag to turn · pinch to zoom<br><span>Keyboard: arrows to orbit, + / − to zoom.</span></p>
          <button type="button" class="pp-reset" data-pp-reset><span aria-hidden="true">↺</span> Whole world</button>
        </div>
      </section>
      <aside class="pp-journal" aria-labelledby="pp-journal-title">
        <div class="pp-journal-heading"><p class="pp-kicker">The field journal</p><h2 id="pp-journal-title">Small wonders</h2><p>Pick a place. We’ll turn the world for you.</p></div>
        <div class="pp-stops" role="group" aria-label="Landmarks">
          ${LANDMARKS.map((landmark) => `
            <button type="button" class="pp-stop" data-pp-landmark="${landmark.id}" aria-pressed="false" aria-controls="pp-entry" style="--stop-color:${landmark.color}">
              <span class="pp-stop-number" aria-hidden="true">${landmark.number}</span><span>${escapeMarkup(landmark.name)}<small>${escapeMarkup(landmark.biome)}</small></span><span class="pp-stop-arrow" aria-hidden="true">↗</span>
            </button>`).join('')}
        </div>
        <article class="pp-entry" id="pp-entry" aria-live="polite" aria-atomic="true">
          <p class="pp-entry-label" data-pp-entry-label>Before you unfold</p>
          <h3 data-pp-entry-title>There is no wrong way up.</h3>
          <p data-pp-entry-note>Orchards, folded mountains, a village by the blue margins. This little world is made for wandering, not measuring.</p>
          <p class="pp-find" data-pp-entry-find>Start with a landmark above, or take the globe for a gentle turn.</p>
          <p class="pp-specimen" data-pp-specimen>A fictional atlas · not a map of Earth</p>
        </article>
      </aside>
      <section class="pp-day-strip" aria-label="Atmosphere and motion">
        <div class="pp-light-control">
          <div class="pp-control-heading"><label for="pp-daylight">Light of day</label><output for="pp-daylight" data-pp-light-name>Paper daylight</output></div>
          <div class="pp-light-track"><span aria-hidden="true">☾</span><input id="pp-daylight" type="range" min="0" max="100" value="100" step="1" aria-label="Light of day"><span aria-hidden="true">☀</span></div>
          <div class="pp-light-presets"><button type="button" data-pp-dusk aria-pressed="false">Dusk</button><button type="button" data-pp-day aria-pressed="true">Daylight</button></div>
        </div>
        <div class="pp-breeze-control">
          <div class="pp-control-heading"><label for="pp-phase">A passing breeze</label><output for="pp-phase" data-pp-phase-output>${INITIAL_PHASE}%</output></div>
          <input id="pp-phase" type="range" min="0" max="100" step="1" value="${INITIAL_PHASE}" aria-label="Breeze cycle">
          <p>Clouds drift. Sails turn. The globe stays yours.</p>
        </div>
        <button type="button" class="pp-play" data-pp-play aria-label="Play breeze"><span aria-hidden="true">▷</span><span>Play breeze</span></button>
      </section>
    </section>
    <p class="pp-status" role="status" data-pp-status>At rest, in good light. Choose a wonder or turn the globe.</p>
    <footer class="pp-notes" id="pp-notes">
      <div><p class="pp-kicker">A note from the paper desk</p><h2>Less geography.<br>More daydream.</h2></div>
      <p>Every island, apple and rooftop belongs to an invented little world. This is a dimensional paper illustration, built from simple shapes and a local color palette. No real places. No borrowed maps. Just a few good folds.</p>
      <div class="pp-palette"><span aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><p>Forest · clay · wheat · sea · cream<br>Five colors to get a little lost in.</p></div>
    </footer>`;

  const atlas = query<HTMLElement>(page.root, '.pp-atlas');
  const dock = document.createElement('div');
  dock.className = 'pp-dock';
  const tabs = document.createElement('div');
  const atmosphere = document.createElement('div');
  const journal = document.createElement('div');
  atmosphere.append(query<HTMLElement>(page.root, '.pp-day-strip'));
  journal.append(query<HTMLElement>(page.root, '.pp-journal'));
  dock.append(tabs, atmosphere, journal);
  atlas.append(dock);
  createWorkspaceTabs(page, {
    id: 'pp-atlas-tools', label: 'Atlas tools', host: tabs,
    panes: [
      { id: 'atmosphere', label: 'Atmosphere', panel: atmosphere },
      { id: 'journal', label: 'Field journal', panel: journal },
    ],
  });
  createWorkspaceDialog(page, {
    id: 'pp-maker-dialog', title: 'Maker’s note',
    triggers: [query<HTMLElement>(page.root, '[data-pp-notes]')],
    content: [query<HTMLElement>(page.root, '.pp-notes')],
  });

  const sceneHost = query<HTMLElement>(page.root, '[data-pp-scene]');
  const status = query<HTMLElement>(page.root, '[data-pp-status]');
  const play = query<HTMLButtonElement>(page.root, '[data-pp-play]');
  const light = query<HTMLInputElement>(page.root, '#pp-daylight');
  const phase = query<HTMLInputElement>(page.root, '#pp-phase');
  const lightName = query<HTMLOutputElement>(page.root, '[data-pp-light-name]');
  const phaseOutput = query<HTMLOutputElement>(page.root, '[data-pp-phase-output]');
  const entryLabel = query<HTMLElement>(page.root, '[data-pp-entry-label]');
  const entryTitle = query<HTMLElement>(page.root, '[data-pp-entry-title]');
  const entryNote = query<HTMLElement>(page.root, '[data-pp-entry-note]');
  const entryFind = query<HTMLElement>(page.root, '[data-pp-entry-find]');
  const specimen = query<HTMLElement>(page.root, '[data-pp-specimen]');
  const location = query<HTMLElement>(page.root, '[data-pp-location]');
  const motionLabel = query<HTMLElement>(page.root, '[data-pp-motion-label]');
  const dayButton = query<HTMLButtonElement>(page.root, '[data-pp-day]');
  const duskButton = query<HTMLButtonElement>(page.root, '[data-pp-dusk]');
  const initialEntry = [entryLabel, entryTitle, entryNote, entryFind, specimen].map((element) => element.textContent);
  const stopButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-pp-landmark]'));
  let engine: AtlasEngine;
  let paused = true;
  let lastSelection: LandmarkId | null = null;

  function sync(state: AtlasState) {
    paused = state.paused;
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    play.setAttribute('aria-label', paused ? 'Play breeze' : 'Pause breeze');
    play.innerHTML = `<span aria-hidden="true">${paused ? '▷' : 'Ⅱ'}</span><span>${paused ? 'Play breeze' : 'Pause breeze'}</span>`;
    motionLabel.textContent = paused ? 'Breeze paused' : 'A breeze is passing';
    light.value = String(state.daylight);
    lightName.textContent = state.daylight > 70 ? 'Paper daylight' : state.daylight > 25 ? 'Honey-colored hour' : 'Lavender dusk';
    light.setAttribute('aria-valuetext', `${lightName.textContent}, ${state.daylight}% daylight`);
    dayButton.setAttribute('aria-pressed', String(state.daylight === 100));
    duskButton.setAttribute('aria-pressed', String(state.daylight === 0));
    if (state.selected !== lastSelection) {
      lastSelection = state.selected;
      for (const button of stopButtons) button.setAttribute('aria-pressed', String(button.dataset.ppLandmark === state.selected));
      if (state.selected) {
        const landmark = getLandmark(state.selected);
        entryLabel.textContent = `Field note ${landmark.number} / ${landmark.biome}`;
        entryTitle.textContent = landmark.name;
        entryNote.textContent = landmark.note;
        entryFind.textContent = landmark.find;
        specimen.textContent = landmark.specimen;
        location.textContent = `${landmark.number} — ${landmark.name}`;
      } else {
        [entryLabel, entryTitle, entryNote, entryFind, specimen].forEach((element, index) => { element.textContent = initialEntry[index]; });
        location.textContent = 'Six places. One little world.';
      }
    }
  }

  try {
    engine = createAtlasEngine({
      ...context,
      container: sceneHost,
      controls: sceneHost,
      signal: page.signal,
      report(message) { status.textContent = message; },
    }, sync, (value) => {
      phase.value = String(value);
      phaseOutput.textContent = `${value}%`;
    });
    page.onCleanup(engine.destroy);
    engine.setPaused(true);
  } catch (error) {
    page.destroy();
    throw error;
  }

  for (const landmark of LANDMARKS) {
    query<HTMLButtonElement>(page.root, `[data-pp-landmark="${landmark.id}"]`)
      .addEventListener('click', () => engine.select(landmark.id), { signal: page.signal });
  }
  play.addEventListener('click', () => {
    engine.setPaused(!paused);
    status.textContent = paused ? 'A still moment. You can still turn the globe and change its light.' : 'The breeze is moving the clouds and windmill, not your camera.';
  }, { signal: page.signal });
  light.addEventListener('input', () => engine.setLight(Number(light.value)), { signal: page.signal });
  phase.addEventListener('input', () => {
    engine.setPhase(Number(phase.value));
    phaseOutput.textContent = `${phase.value}%`;
  }, { signal: page.signal });
  dayButton.addEventListener('click', () => engine.setLight(100), { signal: page.signal });
  duskButton.addEventListener('click', () => engine.setLight(0), { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-pp-reset]').addEventListener('click', () => {
    engine.reset();
    status.textContent = 'The whole world, in daylight. Breeze paused and all folds back in place.';
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-pp-zoom-in]').addEventListener('click', () => engine.zoom(0.9), { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-pp-zoom-out]').addEventListener('click', () => engine.zoom(1.1), { signal: page.signal });
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  page.root.dataset.reducedMotion = String(preference.matches);
  preference.addEventListener('change', () => {
    page.root.dataset.reducedMotion = String(preference.matches);
    if (preference.matches) {
      engine.setPaused(true);
      status.textContent = 'Reduced motion is on. The breeze is paused; all atlas controls still work.';
    }
  }, { signal: page.signal });

  return { destroy: page.destroy, setPaused: engine.setPaused, reset: engine.reset };
}
