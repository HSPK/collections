import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { spatialExperiment } from '../../core/spatial';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DEFAULT_INTENSITY, DEFAULT_MIST, MINERALS, VIEWS, getCavernView, getMineral } from './data';
import { buildCavern } from './scene';
import { createCavernEngine, type CavernEngine, type CavernState } from './engine';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'crystal-cavern');
  page.root.setAttribute('aria-labelledby', 'cavern-title');
  page.root.innerHTML = `
    <header class="cavern-masthead">
      <div class="cavern-identity">
        <p class="cavern-eyebrow"><span class="cavern-mark" aria-hidden="true">◇</span> Subsurface field notes <span> / </span> No. 039</p>
        <h1 id="cavern-title">Crystal <em>Cavern</em></h1>
      </div>
      <div class="cavern-header-note"><span>THE LANTERN CHAMBER</span><p>Somewhere below the noise.<br>A study in stone, water &amp; borrowed light.</p></div>
    </header>

    <figure class="cavern-exhibit">
      <div class="cavern-environment" data-cavern-scene data-project-preview aria-describedby="cavern-navigation">
        <div class="cavern-survey cavern-survey--top" aria-hidden="true"><span>CHAMBER 04 / INNER BASIN</span><span>↓ 128 m · imagined depth</span></div>
        <div class="cavern-contour" aria-hidden="true">
          <svg viewBox="0 0 148 112" fill="none">
            <path d="M10 74C-6 34 32 2 73 9s76 14 65 55-27 46-71 38S20 104 10 74Z"/>
            <path d="M24 70C12 40 39 18 71 21s60 14 53 41-20 37-54 30S34 94 24 70Z"/>
            <path d="M37 66C27 43 47 32 71 33s42 11 40 28-15 27-38 22S45 82 37 66Z"/>
            <path d="M51 62C44 47 57 43 73 44s26 7 24 17-12 13-24 11S57 72 51 62Z"/>
            <path d="m76 47 4 9-4 10-4-10Z" fill="currentColor"/>
            <path d="M134 90v16m-8-8h16"/>
          </svg>
          <span>PLAN / NOT TO SCALE</span>
        </div>
        <div class="cavern-view-label"><span data-view-number>01</span><div><span>OBSERVATION POINT</span><strong data-view-name>Pool’s edge</strong></div></div>
        <p class="cavern-navigation" id="cavern-navigation">Drag to look · focus &amp; use arrow keys <span>· + / − to move closer</span></p>
      </div>
      <figcaption class="cavern-caption">
        <span>FIELD NOTE <span data-caption-number>01</span></span>
        <p data-view-caption>${escapeMarkup(VIEWS[0].caption)}</p>
        <span class="cavern-live"><i aria-hidden="true"></i><span data-motion-caption>Light moving</span></span>
      </figcaption>
    </figure>

    <section class="cavern-console" aria-label="Mineral light console">
      <div class="cavern-console-title"><span>INSTRUMENT PANEL</span><h2>Read the light.</h2><p>Change your vantage, not the quiet.</p></div>
      <div class="cavern-vantages">
        <h3><span>01</span> Vantage point</h3>
        <div class="cavern-view-buttons" role="group" aria-label="Vantage point">
          ${VIEWS.map((view) => `<button type="button" data-view="${view.id}" aria-pressed="${view.id === 'pool'}"><span>${view.number}</span>${escapeMarkup(view.label)}</button>`).join('')}
        </div>
      </div>
      <div class="cavern-light-settings">
        <h3><span>02</span> Mineral light</h3>
        <label class="cavern-select-label" for="cavern-mineral">Light palette</label>
        <select id="cavern-mineral" aria-label="Light palette">
          ${MINERALS.map((mineral) => `<option value="${mineral.id}">${mineral.label}</option>`).join('')}
        </select>
        <label class="cavern-range-label" for="cavern-intensity">Luminance <output for="cavern-intensity" data-intensity-output>${DEFAULT_INTENSITY}%</output></label>
        <input id="cavern-intensity" aria-label="Mineral luminance" type="range" min="25" max="150" step="1" value="${DEFAULT_INTENSITY}">
      </div>
      <div class="cavern-time-settings">
        <h3><span>03</span> Chamber atmosphere</h3>
        <div class="cavern-transport"><button type="button" data-cavern-play aria-label="Pause mineral light">Pause <span aria-hidden="true">Ⅱ</span></button><span data-phase-time>11 / 60 s</span></div>
        <label class="cavern-range-label" for="cavern-phase">Light cycle <span>scrub to hold</span></label>
        <input id="cavern-phase" aria-label="Light cycle" type="range" min="0" max="100" step="0.1" value="18">
        <label class="cavern-range-label" for="cavern-mist">Suspended mist <output for="cavern-mist" data-mist-output>${DEFAULT_MIST}%</output></label>
        <input id="cavern-mist" aria-label="Mist density" type="range" min="0" max="100" step="1" value="${DEFAULT_MIST}">
      </div>
      <p class="cavern-reading" data-mineral-note>${escapeMarkup(MINERALS[0].note)}</p>
    </section>

    <section class="cavern-fieldbook" aria-label="Specimen legend and field notes">
      <div class="cavern-fieldbook-intro"><span class="cavern-eyebrow">A FICTIONAL GEOLOGY</span><h2>A place that<br>could almost be.</h2><p>No coordinates, no extracted specimens. This chamber and its light-bearing minerals are invented, composed entirely from local geometry.</p></div>
      <dl class="cavern-specimens">
        <div><dt><span class="cavern-specimen-swatch cavern-specimen-swatch--mint" aria-hidden="true">◇</span><span><small>CC—01 / CYAN</small>Veil quartz</span></dt><dd>Cold, six-sided growths collect along the flooded margin. Tall crowns lean toward the unseen fissure.</dd></div>
        <div><dt><span class="cavern-specimen-swatch cavern-specimen-swatch--opal" aria-hidden="true">◇</span><span><small>CC—02 / OPAL</small>Milkglass spar</span></dt><dd>Pale colonies mark the route inward. Their uneven facets break a single light into many small readings.</dd></div>
        <div><dt><span class="cavern-specimen-swatch cavern-specimen-swatch--amber" aria-hidden="true">◇</span><span><small>CC—03 / AMBER</small>Lanternite</span></dt><dd>Honey-colored seams warm the far shore. A fictional mineral, named for the light it seems to keep.</dd></div>
      </dl>
    </section>
    <footer class="cavern-footer"><span>039 / AN EXERCISE IN LOOKING CLOSER</span><p>Water reflections are a local, stylized light study—not a physical simulation.</p><span data-cavern-status role="status" aria-live="polite">Explore slowly. Sound is not required.</span></footer>
  `;

  const environment = query<HTMLElement>(page.root, '[data-cavern-scene]');
  const consoleElement = query<HTMLElement>(page.root, '.cavern-console');
  const play = query<HTMLButtonElement>(page.root, '[data-cavern-play]');
  const palette = query<HTMLSelectElement>(page.root, '#cavern-mineral');
  const intensity = query<HTMLInputElement>(page.root, '#cavern-intensity');
  const mist = query<HTMLInputElement>(page.root, '#cavern-mist');
  const phase = query<HTMLInputElement>(page.root, '#cavern-phase');
  const intensityOutput = query<HTMLOutputElement>(page.root, '[data-intensity-output]');
  const mistOutput = query<HTMLOutputElement>(page.root, '[data-mist-output]');
  const phaseTime = query<HTMLElement>(page.root, '[data-phase-time]');
  const motionCaption = query<HTMLElement>(page.root, '[data-motion-caption]');
  const viewNumber = query<HTMLElement>(page.root, '[data-view-number]');
  const viewName = query<HTMLElement>(page.root, '[data-view-name]');
  const viewCaption = query<HTMLElement>(page.root, '[data-view-caption]');
  const captionNumber = query<HTMLElement>(page.root, '[data-caption-number]');
  const mineralNote = query<HTMLElement>(page.root, '[data-mineral-note]');
  const status = query<HTMLElement>(page.root, '[data-cavern-status]');
  const buttons = [...page.root.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let engine: CavernEngine | undefined;
  let artwork: ProjectInstance | undefined;
  let paused = context.reducedMotion || preference.matches;
  let lastView = '';
  let lastMineral = '';
  let lastPaused: boolean | undefined;

  function reflectState(state: Readonly<CavernState>) {
    page.root.dataset.motion = state.paused ? 'paused' : 'playing';
    if (lastPaused !== state.paused) {
      play.innerHTML = state.paused ? 'Play <span aria-hidden="true">▷</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
      play.setAttribute('aria-label', state.paused ? 'Play mineral light' : 'Pause mineral light');
      motionCaption.textContent = state.paused ? 'Light held still' : 'Light moving';
      lastPaused = state.paused;
    }
    if (lastView !== state.view) {
      const selected = getCavernView(state.view);
      viewNumber.textContent = selected.number;
      captionNumber.textContent = selected.number;
      viewName.textContent = selected.label;
      viewCaption.textContent = selected.caption;
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
      lastView = state.view;
    }
    if (lastMineral !== state.mineral) {
      const mineral = getMineral(state.mineral);
      palette.value = state.mineral;
      mineralNote.textContent = mineral.note;
      lastMineral = state.mineral;
    }
    phase.value = String(state.phase * 100);
    phaseTime.textContent = `${Math.round(state.phase * 60).toString().padStart(2, '0')} / 60 s`;
    intensity.value = String(state.intensity);
    intensityOutput.textContent = `${state.intensity}%`;
    mist.value = String(state.mist);
    mistOutput.textContent = `${state.mist}%`;
  }

  function setPaused(value: boolean) {
    paused = value;
    engine?.setPaused(value);
    artwork?.setPaused?.(value);
  }

  try {
    const mobile = window.matchMedia('(max-width: 640px)').matches;
    artwork = spatialExperiment({
      container: environment, controls: consoleElement, signal: page.signal, reducedMotion: paused,
      report(message) { status.textContent = message; },
    }, {
      label: 'Inside Crystal Cavern: a vaulted rock chamber with cyan, opal and amber crystal groves, a reflective pool and stepping stones toward a distant passage. Drag or use arrow keys to look around.',
      background: '#17383b', camera: VIEWS[0].camera, target: VIEWS[0].target,
      fov: 55, pixelRatio: mobile ? 1 : 1.5, exposure: 1.18, shadows: !mobile,
    }, (stage) => {
      const scene = buildCavern(stage, mobile);
      environment.dataset.crystalCount = String(scene.crystalCount);
      environment.dataset.clusterCount = String(scene.clusterCount);
      environment.dataset.crystalTriangles = String(scene.trianglesPerCrystal);
      environment.dataset.moteCount = String(scene.moteCount);
      environment.dataset.rockCount = String(scene.rockCount);
      environment.dataset.budget = mobile ? 'compact' : 'full';
      engine = createCavernEngine(stage, scene, paused, reflectState);
      return { update: engine.update };
    });
    page.onCleanup(artwork.destroy);

    play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
    buttons.forEach((button) => button.addEventListener('click', () => {
      engine?.selectView(getCavernView(button.dataset.view).id);
    }, { signal: page.signal }));
    palette.addEventListener('change', () => engine?.setMineral(getMineral(palette.value).id), { signal: page.signal });
    intensity.addEventListener('input', () => engine?.setIntensity(Number(intensity.value)), { signal: page.signal });
    mist.addEventListener('input', () => engine?.setMist(Number(mist.value)), { signal: page.signal });
    phase.addEventListener('input', () => {
      const value = Number(phase.value) / 100;
      setPaused(true);
      engine?.setPhase(value);
    }, { signal: page.signal });
    environment.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' || event.target !== environment.querySelector('canvas')) return;
      event.preventDefault();
      setPaused(!paused);
    }, { signal: page.signal });
    preference.addEventListener('change', () => {
      // Removing a system preference never resumes motion the visitor has held.
      if (preference.matches) setPaused(true);
      status.textContent = preference.matches
        ? 'Reduced motion: the chamber is held still. Every viewing and light control remains available.'
        : 'Motion preference updated. Use Play when you want the mineral light to move.';
    }, { signal: page.signal });
    if (paused) status.textContent = 'The chamber is held still for reduced motion. Explore or scrub the light without animation.';
    environment.dataset.ready = 'true';
  } catch (error) {
    page.destroy();
    throw error;
  }

  return { destroy: page.destroy, setPaused };
}
