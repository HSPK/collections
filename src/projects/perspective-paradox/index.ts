import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { defaultSun, fieldNotes, viewpoints, type Viewpoint } from './data';
import { createParadoxEngine, type ParadoxEngine } from './engine';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'perspective-paradox');
  page.root.setAttribute('aria-labelledby', 'paradox-title');
  page.root.innerHTML = `
    <header class="paradox-masthead">
      <div class="paradox-brand" aria-hidden="true">
        <svg viewBox="0 0 42 42"><path d="M6 33 21 7l15 26H6Zm8-5h14L21 16l-7 12Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        <span>FIELD<br>STUDIES</span>
      </div>
      <h1 id="paradox-title">Perspective Paradox<span>Convergence court</span></h1>
      <p class="paradox-edition">An invented architecture<br><b>NO. 040 / ONE POINT OF VIEW</b></p>
    </header>
    <section class="paradox-workbench" data-project-preview aria-label="Architectural perspective workbench">
      <div class="paradox-drawing-head">
        <span><i aria-hidden="true"></i> A study in looking, not building.</span>
        <span class="paradox-drawing-scale">THREE BEAMS / THREE GAPS</span>
      </div>
      <div class="paradox-scene" data-paradox-scene>
        <div class="paradox-scene-note" aria-hidden="true"><span>FIG. A</span><p>A closed loop.<br>Until you move.</p></div>
        <div class="paradox-alignment">
          <span>Joint alignment</span>
          <strong><output data-alignment>0.0</output><small> px</small></strong>
          <span data-alignment-label>Coincident sightlines</span>
        </div>
        <div class="paradox-view-label"><span data-view-label>01 / THE SINGLE POINT</span><span>MODEL, NOT A BUILDING PROPOSAL</span></div>
      </div>
      <div class="paradox-viewbar" aria-label="Camera viewpoints">
        ${viewpoints.map((view, index) => `<button type="button" data-paradox-view="${view.id}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${view.label}${index === 0 ? '<b aria-hidden="true">&#8599;</b>' : ''}</button>`).join('')}
      </div>
    </section>
    <section class="paradox-instruments" aria-label="Model controls">
      <div class="paradox-transport">
        <button type="button" data-paradox-play aria-label="Play inspection orbit"><span aria-hidden="true">&#9655;</span>Play inspection</button>
        <button type="button" data-paradox-reset>Reset model</button>
        <p id="paradox-camera-help">Drag to orbit. Pinch to zoom. Focus the scene for arrow keys, + / - and Space.</p>
      </div>
      <label class="paradox-range" for="paradox-orbit"><span>Inspection orbit <output for="paradox-orbit" data-orbit-output>0&#176;</output></span><input id="paradox-orbit" type="range" min="0" max="359" step="1" value="0" aria-label="Inspection orbit angle"><small>One full circuit of the canonical camera path.</small></label>
      <label class="paradox-range" for="paradox-sun"><span>Sun direction <output for="paradox-sun" data-sun-output>${defaultSun}&#176;</output></span><input id="paradox-sun" type="range" min="10" max="160" step="1" value="${defaultSun}" aria-label="Sun direction"><small>The shadows belong to the separate pieces.</small></label>
      <div class="paradox-guides">
        <button type="button" data-paradox-guides aria-pressed="false"><span aria-hidden="true">+</span>Projection guides</button>
        <p>Best seen from the side: three rays lead back to the original eye.</p>
      </div>
    </section>
    <div class="paradox-status" role="status" data-paradox-status>The camera starts still, at the one point where all three joints align.</div>
    <section class="paradox-notebook" aria-labelledby="paradox-notes-title">
      <div class="paradox-notebook-title"><p>THE CONSTRUCTION</p><h2 id="paradox-notes-title">Nothing connects.<br>Everything aligns.</h2><p>Original forced-perspective geometry.<br>No image plane. No hidden swap.</p></div>
      ${fieldNotes.map((note) => `<article><span>${note.number}</span><h3>${note.title}</h3><p>${note.text}</p></article>`).join('')}
    </section>
    <footer class="paradox-footer"><span>Physical gaps: <output data-physical-gaps>measuring</output></span><span>Local geometry / real-time projection</span></footer>
    <div data-paradox-runtime hidden></div>`;

  const scene = query<HTMLElement>(page.root, '[data-paradox-scene]');
  const play = query<HTMLButtonElement>(page.root, '[data-paradox-play]');
  const status = query<HTMLElement>(page.root, '[data-paradox-status]');
  const phase = query<HTMLInputElement>(page.root, '#paradox-orbit');
  const phaseOutput = query<HTMLOutputElement>(page.root, '[data-orbit-output]');
  const sun = query<HTMLInputElement>(page.root, '#paradox-sun');
  const sunOutput = query<HTMLOutputElement>(page.root, '[data-sun-output]');
  const guides = query<HTMLButtonElement>(page.root, '[data-paradox-guides]');
  const errorOutput = query<HTMLOutputElement>(page.root, '[data-alignment]');
  const alignmentLabel = query<HTMLElement>(page.root, '[data-alignment-label]');
  const viewLabel = query<HTMLElement>(page.root, '[data-view-label]');
  const gapOutput = query<HTMLOutputElement>(page.root, '[data-physical-gaps]');
  const viewButtons = page.root.querySelectorAll<HTMLButtonElement>('[data-paradox-view]');
  let engine: ParadoxEngine | undefined;
  let paused = true;

  function setPaused(value: boolean) {
    paused = value;
    engine?.setPaused(value);
    play.innerHTML = `<span aria-hidden="true">${value ? '&#9655;' : '&#8545;'}</span>${value ? 'Play inspection' : 'Pause inspection'}`;
    play.setAttribute('aria-label', value ? 'Play inspection orbit' : 'Pause inspection orbit');
    page.root.dataset.motion = value ? 'paused' : 'playing';
  }
  function reset() {
    setPaused(true);
    engine?.reset?.();
    sun.value = String(defaultSun);
    sunOutput.textContent = `${defaultSun}\u00b0`;
    status.textContent = 'Back at the single viewpoint. All three gaps remain physically open.';
  }
  const events = { signal: page.signal };
  play.addEventListener('click', () => {
    setPaused(!paused);
    status.textContent = paused ? 'The camera is held still. The instruments and arrow keys still work.' : 'Inspection orbit running. Watch each false joint come apart.';
  }, events);
  query<HTMLButtonElement>(page.root, '[data-paradox-reset]').addEventListener('click', reset, events);
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      const preset = viewpoints.find((item) => item.id === button.dataset.paradoxView);
      if (!preset) throw new Error('The selected viewpoint is missing.');
      setPaused(true);
      engine?.setView(preset.id);
      status.textContent = preset.note;
    }, events);
  }
  phase.addEventListener('input', () => {
    setPaused(true);
    engine?.setPhase(Number(phase.value));
    status.textContent = 'Camera placed on the inspection orbit. Find the viewpoint restores the exact alignment.';
  }, events);
  sun.addEventListener('input', () => {
    sunOutput.textContent = `${sun.value}\u00b0`;
    engine?.setSun(Number(sun.value));
  }, events);
  guides.addEventListener('click', () => {
    const visible = guides.getAttribute('aria-pressed') !== 'true';
    engine?.setGuides(visible);
    status.textContent = visible ? 'Projection guides are on. Try Side elevation to see the rays and their separated endpoints.' : 'Projection guides are off. The physical model is unchanged.';
  }, events);
  scene.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || !(event.target instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    setPaused(!paused);
  }, events);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', () => {
    if (preference.matches) {
      setPaused(true);
      status.textContent = 'Reduced motion is on. The camera is still; you can explore manually.';
    }
  }, events);
  const viewTitles: Record<Viewpoint, string> = {
    aligned: '01 / THE SINGLE POINT', side: '02 / SIDE ELEVATION', above: '03 / ABOVE THE JOINTS', free: '04 / FREE INSPECTION',
  };
  setPaused(true);
  try {
    engine = createParadoxEngine({
      ...context,
      container: scene,
      controls: query<HTMLElement>(page.root, '[data-paradox-runtime]'),
      signal: page.signal,
      report: (message) => { status.textContent = message; },
    }, (snapshot) => {
      scene.dataset.projectionError = snapshot.error.toFixed(6);
      scene.dataset.camera = snapshot.camera;
      scene.dataset.phase = snapshot.phase.toFixed(6);
      scene.dataset.guides = String(snapshot.guides);
      scene.dataset.sun = String(snapshot.sun);
      scene.dataset.physicalGaps = snapshot.gaps.map((gap) => gap.toFixed(6)).join(',');
      errorOutput.value = snapshot.error < 0.05 ? '0.0' : snapshot.error.toFixed(1);
      alignmentLabel.textContent = snapshot.error < 0.5 ? 'Coincident sightlines' : 'The joints are separated';
      scene.dataset.aligned = String(snapshot.error < 0.5);
      phase.value = String(Math.round(snapshot.phase));
      phaseOutput.value = `${Math.round(snapshot.phase)}\u00b0`;
      guides.setAttribute('aria-pressed', String(snapshot.guides));
      gapOutput.value = snapshot.gaps.map((gap) => `${gap.toFixed(2)} m`).join(' / ');
      viewLabel.textContent = viewTitles[snapshot.view];
      for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.paradoxView === snapshot.view));
    }, () => setPaused(true));
    page.onCleanup(engine.destroy);
    page.root.dataset.ready = 'true';
  } catch (error) {
    page.destroy();
    throw error;
  }
  return { destroy: page.destroy, setPaused, reset };
}
