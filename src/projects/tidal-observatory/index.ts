import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import {
  CYCLE_SECONDS, INITIAL_STATE, TIDE_MAX, TIDE_MIN, VIEWPOINTS, daylightName, signedMetres,
} from './data';
import type { Viewpoint } from './data';
import { createObservatory } from './engine';
import type { CoastalSnapshot } from './scene';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'tidal-observatory');
  page.root.setAttribute('aria-labelledby', 'tidal-title');
  page.root.innerHTML = `
    <header class="tidal-masthead">
      <div class="tidal-identity">
        <svg class="tidal-mark" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor"/>
          <path d="M24 5v7m0 24v7M5 24h7m24 0h7M22 15h4l3 18H19z" fill="none" stroke="currentColor"/>
          <path d="M19 15h10l-5-5zM14 36c4-3 6 3 10 0s6 3 10 0" fill="none" stroke="currentColor"/>
        </svg>
        <div><p class="tidal-eyebrow">Western Reach · Field station 036</p><h1 id="tidal-title">Tidal Observatory</h1></div>
      </div>
      <p class="tidal-header-note">An island, between tides.<br><span>A fictional coast, observed slowly.</span></p>
    </header>

    <section class="tidal-workbench" aria-label="Coastal observation" data-project-preview>
      <div class="tidal-scene" data-tidal-scene>
        <div class="tidal-chart-label"><span class="tidal-chart-dot" aria-hidden="true"></span>Western Reach<span class="tidal-chart-coordinate">58° 14′ N / imagined</span></div>
        <div class="tidal-compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="none"/><path d="m22 6 5 19-5-3-5 3z" fill="currentColor"/><path d="M22 22v16M7 22h7m16 0h7"/></svg></div>
        <div class="tidal-canvas-host" data-tidal-host></div>
        <div class="tidal-scene-caption"><span class="tidal-caption-rule"></span><span>01 / The keeper’s island</span><span data-tidal-light-label>Late afternoon</span></div>
        <div class="tidal-camera-toolbar">
          <div class="tidal-viewpoints" aria-label="Camera viewpoints">
            ${Object.entries(VIEWPOINTS).map(([key, value], i) => `<button type="button" data-tidal-view="${key}" aria-pressed="${i === 0}" title="${value.description}"><span class="tidal-view-number" aria-hidden="true">0${i + 1}</span>${value.label}</button>`).join('')}
          </div>
          <div class="tidal-zoom"><button type="button" data-tidal-zoom="in" aria-label="Zoom in">+</button><button type="button" data-tidal-zoom="out" aria-label="Zoom out">−</button></div>
        </div>
      </div>

      <div class="tidal-instruments" aria-label="Station instruments" data-tidal-instruments>
        <label class="tidal-instrument tidal-tide">
          <span class="tidal-instrument-heading"><span>01 <strong>Tide</strong></span><output for="tidal-tide" data-tidal-tide-output>${signedMetres(INITIAL_STATE.tide)}</output></span>
          <span class="tidal-ruler"><input id="tidal-tide" type="range" aria-label="Tide" min="${TIDE_MIN}" max="${TIDE_MAX}" step="0.01" value="${INITIAL_STATE.tide}" /></span>
          <span class="tidal-instrument-endpoints"><span>Low water −0.55 m</span><span>High +0.85 m</span></span>
        </label>
        <label class="tidal-instrument tidal-daylight">
          <span class="tidal-instrument-heading"><span>02 <strong>Daylight</strong></span><output for="tidal-daylight" data-tidal-daylight-output>${daylightName(INITIAL_STATE.daylight)}</output></span>
          <span class="tidal-light-track"><input id="tidal-daylight" type="range" aria-label="Daylight" min="0" max="100" step="1" value="${INITIAL_STATE.daylight}" /></span>
          <span class="tidal-instrument-endpoints"><span>Blue hour</span><span>Clear day</span></span>
        </label>
        <div class="tidal-instrument tidal-time">
          <label class="tidal-phase-label" for="tidal-phase"><span class="tidal-instrument-heading"><span>03 <strong>Observation cycle</strong></span><output for="tidal-phase" data-tidal-phase-output>04.5 / 24 s</output></span></label>
          <div class="tidal-transport"><button type="button" class="tidal-play" data-tidal-play aria-label="Pause animation">Pause</button><input id="tidal-phase" aria-label="Scene phase" type="range" min="0" max="${CYCLE_SECONDS}" step="0.1" value="${INITIAL_STATE.time}" /><button type="button" class="tidal-reset" data-tidal-reset aria-label="Reset station" title="Reset station">↺</button></div>
          <span class="tidal-instrument-endpoints"><span data-tidal-motion-note>Water, wings & a sweeping light</span></span>
        </div>
      </div>
    </section>

    <div class="tidal-observation-line">
      <p id="tidal-camera-help">Drag to orbit · pinch or + / − to zoom · focus the sea and use arrow keys.</p>
      <p class="tidal-status" data-tidal-status role="status">The tide is yours to set.</p>
    </div>
    <footer class="tidal-notebook" aria-label="Station notes">
      <div class="tidal-notebook-title"><p class="tidal-eyebrow">From the station notebook</p><span>NO. 036 / COASTAL STUDIES</span></div>
      <div class="tidal-notes-grid">
        <article><span class="tidal-note-number">I.</span><h2>A shore that changes</h2><p>Lower the water to uncover the dark foot of the cliffs. Raise it and watch the landing’s boats rise with the same sea, not a separate animation.</p></article>
        <article><span class="tidal-note-number">II.</span><h2>A light, kept</h2><p>Turn toward blue hour. The lantern warms, cottage windows glow and two opposing beams make one revolution every twelve seconds.</p></article>
        <article><span class="tidal-note-number">III.</span><h2>Outside the almanac</h2><p>This place and its coordinates are imagined. These are playful chart-datum metres, not forecasts or navigation advice. Everything is drawn locally.</p></article>
      </div>
      <div class="tidal-sounding"><span><span class="tidal-sounding-dot" aria-hidden="true"></span>Live mooring observation</span><span>Water <output data-tidal-water-output>—</output></span><span>Vessel waterline <output data-tidal-float-output>—</output></span><span class="tidal-sounding-coordinate">E 3.35 · N 4.65 / local m</span></div>
    </footer>`;

  const host = query<HTMLElement>(page.root, '[data-tidal-host]');
  const workbench = query<HTMLElement>(page.root, '[data-tidal-scene]');
  const controls = query<HTMLElement>(page.root, '[data-tidal-instruments]');
  const play = query<HTMLButtonElement>(page.root, '[data-tidal-play]');
  const tideInput = query<HTMLInputElement>(page.root, '#tidal-tide');
  const daylightInput = query<HTMLInputElement>(page.root, '#tidal-daylight');
  const phaseInput = query<HTMLInputElement>(page.root, '#tidal-phase');
  const tideOutput = query<HTMLOutputElement>(page.root, '[data-tidal-tide-output]');
  const daylightOutput = query<HTMLOutputElement>(page.root, '[data-tidal-daylight-output]');
  const phaseOutput = query<HTMLOutputElement>(page.root, '[data-tidal-phase-output]');
  const waterOutput = query<HTMLOutputElement>(page.root, '[data-tidal-water-output]');
  const floatOutput = query<HTMLOutputElement>(page.root, '[data-tidal-float-output]');
  const lightLabel = query<HTMLElement>(page.root, '[data-tidal-light-label]');
  const status = query<HTMLElement>(page.root, '[data-tidal-status]');
  const motionNote = query<HTMLElement>(page.root, '[data-tidal-motion-note]');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = context.reducedMotion || preference.matches;
  let engine: ReturnType<typeof createObservatory> | undefined;

  function report(message: string) {
    if (!page.signal.aborted) status.textContent = message;
  }

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value;
    engine?.setPaused(value);
    play.textContent = value ? '▶ Play' : 'Ⅱ Pause';
    play.setAttribute('aria-label', value ? 'Play animation' : 'Pause animation');
    page.root.dataset.motion = value ? 'paused' : 'playing';
    motionNote.textContent = value ? 'Held still · instruments remain live' : 'Water, wings & a sweeping light';
  }

  function setView(view: Viewpoint) {
    engine?.setView(view);
    workbench.dataset.view = view;
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-tidal-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tidalView === view));
    }
  }

  function observation(snapshot: CoastalSnapshot) {
    if (page.signal.aborted) return;
    workbench.dataset.sceneTime = snapshot.time.toFixed(6);
    workbench.dataset.tide = String(snapshot.tide);
    workbench.dataset.daylight = String(snapshot.daylight);
    workbench.dataset.waterHeight = snapshot.waterHeight.toFixed(7);
    workbench.dataset.floatHeight = snapshot.floatHeight.toFixed(7);
    workbench.dataset.beaconAngle = snapshot.beaconAngle.toFixed(6);
    workbench.dataset.camera = snapshot.camera;
    waterOutput.value = signedMetres(snapshot.waterHeight);
    floatOutput.value = signedMetres(snapshot.floatHeight);
    phaseInput.value = snapshot.time.toFixed(1);
    phaseOutput.value = `${snapshot.time.toFixed(1).padStart(4, '0')} / ${CYCLE_SECONDS} s`;
  }

  function syncInstruments() {
    tideOutput.value = signedMetres(Number(tideInput.value));
    tideInput.setAttribute('aria-valuetext', `${signedMetres(Number(tideInput.value))} above station datum`);
    daylightOutput.value = daylightName(Number(daylightInput.value));
    daylightInput.setAttribute('aria-valuetext', daylightOutput.value);
    lightLabel.textContent = daylightOutput.value;
    for (const input of [tideInput, daylightInput]) {
      const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
      input.style.setProperty('--tidal-progress', `${percent}%`);
    }
  }

  function reset() {
    if (page.signal.aborted) return;
    engine?.reset();
    tideInput.value = String(INITIAL_STATE.tide);
    daylightInput.value = String(INITIAL_STATE.daylight);
    syncInstruments();
    setView('coast');
    report('Station reset to late afternoon and the southern coast. Playback is unchanged.');
  }

  try {
    engine = createObservatory({
      container: host, controls, signal: page.signal, reducedMotion: paused, report,
    }, observation);
    page.onCleanup(engine.destroy);
    setPaused(paused);
    syncInstruments();
    workbench.dataset.view = 'coast';
    workbench.dataset.ready = 'true';
    if (paused) report('Motion is paused. Explore the tide, light and viewpoints at your own pace.');

    play.addEventListener('click', () => {
      setPaused(!paused);
      report(paused ? 'Observation held still. Scrub the cycle to inspect another moment.' : 'Observation running. One complete cycle lasts 24 seconds.');
    }, { signal: page.signal });
    tideInput.addEventListener('input', () => {
      engine?.setTide(Number(tideInput.value));
      syncInstruments();
      report(`Tide set to ${signedMetres(Number(tideInput.value))}. The moored boats follow the water.`);
    }, { signal: page.signal });
    daylightInput.addEventListener('input', () => {
      engine?.setDaylight(Number(daylightInput.value));
      syncInstruments();
      report(`${daylightName(Number(daylightInput.value))}. The light changes; the observation time stays yours.`);
    }, { signal: page.signal });
    phaseInput.addEventListener('input', () => {
      const time = Number(phaseInput.value);
      setPaused(true);
      engine?.setTime(time);
      report(`Observation held at ${time.toFixed(1)} seconds. Play to continue from here.`);
    }, { signal: page.signal });
    query<HTMLButtonElement>(page.root, '[data-tidal-reset]').addEventListener('click', reset, { signal: page.signal });
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-tidal-view]')) {
      button.addEventListener('click', () => {
        const view = button.dataset.tidalView as Viewpoint;
        setView(view);
        report(VIEWPOINTS[view].description);
      }, { signal: page.signal });
    }
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-tidal-zoom]')) {
      button.addEventListener('click', () => {
        engine?.zoom(button.dataset.tidalZoom === 'in' ? 0.86 : 1.16);
      }, { signal: page.signal });
    }
    host.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' || event.defaultPrevented) return;
      event.preventDefault();
      setPaused(!paused);
      report(paused ? 'Observation held still.' : 'Observation running.');
    }, { signal: page.signal });
    preference.addEventListener('change', () => {
      setPaused(preference.matches);
      report(preference.matches ? 'Reduced motion enabled. The station is held still; all instruments still work.' : 'Reduced motion disabled. The observation is running.');
    }, { signal: page.signal });
  } catch (error) {
    page.destroy();
    throw error;
  }

  return { destroy: page.destroy, setPaused, reset };
}
