import './style.css';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import { spatialExperiment } from '../../core/spatial';
import type { ExperimentInstance, ProjectContext, ProjectInstance } from '../../core/types';
import { DEFAULT_SEED, formationLabel, getPreset, PRESETS, windLabel } from './data';
import type { PresetId } from './data';
import { createNurseryScene } from './scene';
import type { NurseryScene, SceneSettings } from './scene';

const starMark = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 1v38M1 20h38M6.5 6.5l27 27m0-27-27 27" stroke="currentColor"/><circle cx="20" cy="20" r="8" stroke="currentColor"/><circle cx="20" cy="20" r="2.5" fill="currentColor"/></svg>';
const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3v12H5zm7 0h3v12h-3z" fill="currentColor"/></svg>';
const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="currentColor"/></svg>';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'star-nursery');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'sn-title');
  page.root.innerHTML = `
    <header class="sn-masthead">
      <div class="sn-identity">
        <div class="sn-mark">${starMark}</div>
        <div><p class="sn-eyebrow">Particle study / 041</p><h1 id="sn-title">Star Nursery<span aria-hidden="true">.</span></h1></div>
      </div>
      <div class="sn-intro"><p>A little matter. The possibility of light.</p><span>Generative astronomy-inspired art</span></div>
      <button type="button" class="sn-explore" data-sn-explore aria-label="Structures and notes">Explore ↗</button>
    </header>
    <div class="sn-workspace" data-project-preview>
      <section class="sn-observation" aria-label="Interactive nebula">
        <div class="sn-view" data-sn-view>
          <div class="sn-view-top" aria-hidden="true">
            <span><i></i> <span data-sn-volume>Volume 01 / Cradle cloud</span></span>
            <span class="sn-perspective">Perspective view</span>
          </div>
          <div class="sn-canvas-host" data-sn-canvas></div>
          <div class="sn-fallback" data-sn-fallback hidden><div class="sn-fallback-mark">${starMark}</div><h2>A clear view needs WebGL 2.</h2><p>Try a browser with graphics acceleration enabled. Explore still opens the formation notes.</p></div>
          <div class="sn-view-bottom" aria-hidden="true">
            <div><span class="sn-eyebrow">An imaginary sky</span><p data-sn-title>The quiet before the light.</p></div>
            <span class="sn-crosshair">+</span>
          </div>
        </div>
        <div class="sn-view-caption">
          <p id="sn-view-help">Drag to orbit · Pinch or + / − to zoom<br><span>Focus sky: arrows orbit · Space plays / pauses.</span></p>
          <button type="button" class="sn-text-button" data-sn-view-reset aria-label="Reset camera view">Reset view <span aria-hidden="true">↗</span></button>
        </div>
      </section>
      <aside class="sn-inspector" aria-label="Star Nursery controls" data-sn-controls>
        <div class="sn-inspector-heading"><span class="sn-eyebrow">The formation desk</span><h2>Shape a beginning.</h2></div>
        <fieldset class="sn-presets">
          <legend>01 <span>Choose a structure</span></legend>
          ${PRESETS.map((preset) => `<button type="button" class="sn-preset" data-sn-preset="${preset.id}" aria-pressed="${preset.id === 'cradle'}"><span class="sn-preset-symbol sn-symbol-${preset.id}" aria-hidden="true"></span><span><strong>${preset.name}</strong><small>${preset.shape}</small></span><span class="sn-preset-indicator" aria-hidden="true"></span></button>`).join('')}
        </fieldset>
        <fieldset class="sn-shaping">
          <legend>02 <span>Gather & release</span></legend>
          <div class="sn-parameter">
          <div class="sn-range-heading"><label for="sn-formation">Formation</label><output for="sn-formation" data-sn-formation-output>34%</output></div>
          <input id="sn-formation" type="range" min="0" max="100" value="34" step="1" aria-describedby="sn-formation-help">
          <div class="sn-range-ends"><span>Loose dust</span><span>Stellar knots</span></div>
          <p id="sn-formation-help" class="sn-control-note">Pull dust into the stellar seeds.</p>
          </div><div class="sn-parameter">
          <div class="sn-range-heading sn-wind-heading"><label for="sn-wind">Stellar wind</label><output for="sn-wind" data-sn-wind-output>18%</output></div>
          <input id="sn-wind" type="range" min="0" max="100" value="18" step="1" aria-describedby="sn-wind-help">
          <div class="sn-range-ends"><span>Sheltered</span><span>Dispersed</span></div>
          <p id="sn-wind-help" class="sn-control-note">Spread the cloud and its slow drift.</p>
          </div>
        </fieldset>
        <div class="sn-playback">
          <button class="sn-play-button" type="button" data-sn-play aria-label="Pause animation">${pauseIcon}<span>Pause</span></button>
          <button class="sn-reseed-button" type="button" data-sn-reseed aria-label="Reseed dust arrangement"><span aria-hidden="true">⤨</span> Reseed dust</button>
        </div>
        <p class="sn-motion-note" data-sn-motion-note>Slow, continuous drift</p>
        <p class="sn-status" role="status" aria-live="polite" data-sn-status>Gathering · Still air. Every point has a place in depth.</p>
        <button class="sn-start-over" type="button" data-sn-reset>Return to the first cloud <span aria-hidden="true">↺</span></button>
      </aside>
    </div>
    <section class="sn-notes" aria-labelledby="sn-notes-title">
      <div class="sn-notes-intro"><p class="sn-eyebrow">Notes from the nursery</p><h2 id="sn-notes-title">Not empty.<br>Not yet a star.</h2><p>Between darkness and a new sun, there is a cloud. This is a small, invented place to linger in that in-between.</p></div>
      <article><span class="sn-note-number">I / MATTER</span><h3 data-sn-note-heading>The shape of a cradle</h3><p data-sn-preset-note>${PRESETS[0]!.note}</p><p data-sn-caption>${PRESETS[0]!.caption}</p></article>
      <article><span class="sn-note-number">II / DEPTH</span><h3>Look through, not at.</h3><p>Fine stars sit among softer layers of colored dust. Dark seams interrupt the light. Orbit the sky to see nearby material move against the more distant field.</p><p>Nothing here is a flat photograph: the cloud, its bright seeds, and the surrounding stars occupy three-dimensional space.</p></article>
      <article><span class="sn-note-number">III / INTERPRETATION</span><h3>A sky, not a simulation.</h3><p>Formation pulls material toward a few fixed centers. Wind spreads it outward. The motion is deliberately gentle, bounded, and reversible—not a calculation of real stellar evolution.</p><p><strong>Illustrative, not an astrophysics model.</strong> Colors and scales are artistic choices; no telescope data is used.</p></article>
    </section>
    <footer class="sn-footer"><span>${starMark} An observatory for imaginary skies</span><p>Made of points. Held in depth.</p></footer>`;

  const guide = createWorkspaceDialog(page, {
    id: 'sn-guide',
    title: 'Structures and notes',
    triggers: [query(page.root, '[data-sn-explore]')],
    content: [
      query(page.root, '.sn-intro'),
      query(page.root, '.sn-inspector-heading'),
      query(page.root, '.sn-presets'),
      query(page.root, '[data-sn-reset]'),
      query(page.root, '#sn-view-help'),
      ...page.root.querySelectorAll<HTMLElement>('.sn-range-ends, .sn-control-note'),
      query(page.root, '.sn-motion-note'),
      query(page.root, '.sn-notes'),
      query(page.root, '.sn-footer'),
    ],
  });
  const canvasHost = query<HTMLElement>(page.root, '[data-sn-canvas]');
  const inspector = query<HTMLElement>(page.root, '[data-sn-controls]');
  const play = query<HTMLButtonElement>(page.root, '[data-sn-play]');
  const formation = query<HTMLInputElement>(page.root, '#sn-formation');
  const wind = query<HTMLInputElement>(page.root, '#sn-wind');
  const formationOutput = query<HTMLOutputElement>(page.root, '[data-sn-formation-output]');
  const windOutput = query<HTMLOutputElement>(page.root, '[data-sn-wind-output]');
  const status = query<HTMLElement>(page.root, '[data-sn-status]');
  const motionNote = query<HTMLElement>(page.root, '[data-sn-motion-note]');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = context.reducedMotion || preference.matches;
  let artwork: ExperimentInstance | undefined;
  let scene: NurseryScene | undefined;
  const state: SceneSettings = {
    preset: 'cradle',
    seed: DEFAULT_SEED,
    formation: PRESETS[0]!.formation,
    wind: PRESETS[0]!.wind,
  };

  function report(message: string) {
    if (!page.signal.aborted) status.textContent = message;
  }

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value;
    artwork?.setPaused(paused);
    play.innerHTML = `${paused ? playIcon : pauseIcon}<span>${paused ? 'Play' : 'Pause'}</span>`;
    play.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    motionNote.textContent = paused
      ? preference.matches ? 'Reduced motion · a still sky' : 'A still sky · camera and controls remain active'
      : 'Slow, continuous drift';
    report(`${formationLabel(state.formation)} · ${windLabel(state.wind)}. ${paused ? 'The sky is still; shaping remains live.' : 'Every point has a place in depth.'}`);
  }

  function updateControls() {
    formation.value = String(Math.round(state.formation * 100));
    wind.value = String(Math.round(state.wind * 100));
    formationOutput.value = `${formation.value}%`;
    windOutput.value = `${wind.value}%`;
    formation.setAttribute('aria-valuetext', `${formation.value}% · ${formationLabel(state.formation)}`);
    wind.setAttribute('aria-valuetext', `${wind.value}% · ${windLabel(state.wind)}`);
    formation.style.setProperty('--sn-fill', `${formation.value}%`);
    wind.style.setProperty('--sn-fill', `${wind.value}%`);
    scene?.setControls(state.formation, state.wind);
    report(`${formationLabel(state.formation)} · ${windLabel(state.wind)}. ${paused ? 'The sky is still; shaping remains live.' : 'Every point has a place in depth.'}`);
  }

  function selectPreset(id: PresetId) {
    const preset = getPreset(id);
    state.preset = preset.id;
    state.formation = preset.formation;
    state.wind = preset.wind;
    page.root.dataset.preset = preset.id;
    page.root.querySelectorAll<HTMLButtonElement>('[data-sn-preset]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.snPreset === preset.id));
    });
    query<HTMLElement>(page.root, '[data-sn-volume]').textContent = `Volume ${preset.number} / ${preset.name}`;
    query<HTMLElement>(page.root, '[data-sn-title]').textContent = preset.title;
    query<HTMLElement>(page.root, '[data-sn-note-heading]').textContent = preset.name;
    query<HTMLElement>(page.root, '[data-sn-preset-note]').textContent = preset.note;
    query<HTMLElement>(page.root, '[data-sn-caption]').textContent = preset.caption;
    canvasHost.querySelector('canvas')?.setAttribute('aria-label', `${preset.name}: ${preset.caption} Interactive three-dimensional stellar dust artwork.`);
    scene?.setArrangement(preset.id, state.seed);
    updateControls();
  }

  function reset() {
    if (page.signal.aborted) return;
    state.seed = DEFAULT_SEED;
    selectPreset('cradle');
    scene?.resetView();
    scene?.resetTime();
    report('The first cloud, restored. Playback stays as you left it.');
  }

  play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
  page.root.querySelectorAll<HTMLButtonElement>('[data-sn-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      selectPreset(button.dataset.snPreset as PresetId);
      guide.close();
    }, { signal: page.signal });
  });
  formation.addEventListener('input', () => {
    state.formation = Number(formation.value) / 100;
    updateControls();
  }, { signal: page.signal });
  wind.addEventListener('input', () => {
    state.wind = Number(wind.value) / 100;
    updateControls();
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-sn-reseed]').addEventListener('click', () => {
    state.seed = (state.seed + 7919) >>> 0;
    scene?.setArrangement(state.preset, state.seed);
    report('A new arrangement of dust. Structure and shaping values are unchanged.');
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-sn-view-reset]').addEventListener('click', () => {
    scene?.resetView();
    report('Camera returned to the opening perspective.');
  }, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-sn-reset]').addEventListener('click', reset, { signal: page.signal });
  canvasHost.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.defaultPrevented) return;
    event.preventDefault();
    setPaused(!paused);
  }, { signal: page.signal });
  preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });

  try {
    artwork = spatialExperiment({
      container: canvasHost,
      controls: inspector,
      signal: page.signal,
      reducedMotion: paused,
      report,
    }, {
      label: 'Cradle cloud: a deep, branching volume of luminous stellar dust. Drag or use arrow keys to orbit.',
      background: '#070910',
      camera: [0.15, 0.4, canvasHost.clientWidth < 620 ? 11.6 : 10.8],
      target: [0, 0, 0],
      fov: 43,
      shadows: false,
      pixelRatio: 1.25,
    }, (stage) => {
      scene = createNurseryScene(stage, state);
      return { update: scene.update, reset: scene.resetTime };
    });
    page.onCleanup(artwork.destroy);
    page.root.dataset.preset = state.preset;
    setPaused(paused);
    updateControls();
  } catch {
    query<HTMLElement>(page.root, '[data-sn-fallback]').hidden = false;
    page.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      '.sn-workspace button, .sn-workspace input, [data-sn-preset], [data-sn-reset]',
    ).forEach((control) => { control.disabled = true; });
    setPaused(true);
    report('The 3D view is unavailable in this browser. Open Explore for formation notes.');
  }

  return { destroy: page.destroy, setPaused, reset };
}
