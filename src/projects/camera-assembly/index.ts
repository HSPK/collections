import './style.css';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CHAPTERS, DURATION, EXPLODED_FRAME, PARTS, VIEWS } from './data';
import type { PartId, ViewId } from './data';
import { createCameraArtwork } from './scene';
import { chapterAt } from './timeline';

const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="currentColor"/></svg>';
const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor"/></svg>';
const replayIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7a6.5 6.5 0 1 1-.2 6M4 2v5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'camera-assembly');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = context.reducedMotion || preference.matches;
  let progress = paused ? EXPLODED_FRAME : 0;
  let selected: PartId | null = null;
  let artwork: ReturnType<typeof createCameraArtwork> | undefined;
  let activeChapter = -1;

  page.root.tabIndex = 0;
  page.root.setAttribute('aria-labelledby', 'ca-title');
  page.root.innerHTML = `
    <header class="ca-header">
      <div class="ca-identity">
        <p class="ca-eyebrow"><span class="ca-aperture" aria-hidden="true">◉</span> Object studies <span class="ca-slash">/</span> Nº 03</p>
        <h1 id="ca-title">Camera Assembly<span aria-hidden="true">.</span></h1>
      </div>
      <p class="ca-intro">An imaginary instant camera, one layer at a time.<br><span>A motion study, not a repair guide.</span></p>
    </header>

    <div class="ca-exhibit" data-project-preview>
      <section class="ca-viewer" aria-label="Interactive camera exhibit">
        <div class="ca-viewport">
          <div class="ca-scene" data-ca-scene></div>
          <div class="ca-scene-heading">
            <p class="ca-object-code">VESPER <span>/ 03</span></p>
            <p class="ca-phase-title" data-ca-phase-title>A skeleton, first.</p>
          </div>
          <div class="ca-scene-stamp" aria-hidden="true"><span>V</span><small>FORM<br>IN MOTION</small></div>
          <div class="ca-scene-foot">
            <p><span aria-hidden="true">↔</span> Drag to orbit <span class="ca-help-wide">· Scroll to zoom</span></p>
            <span class="ca-view-name" data-ca-view-name>Three-quarter</span>
          </div>
        </div>
        <div class="ca-views" role="group" aria-label="Camera view presets">
          <span class="ca-small-label">View</span>
          ${VIEWS.map((view) => `<button type="button" data-ca-view="${view.id}" aria-pressed="${view.id === 'study'}">${view.name}</button>`).join('')}
        </div>
        <section class="ca-timeline" aria-label="Assembly timeline">
          <div class="ca-transport">
            <button class="ca-play" type="button" data-ca-play aria-label="Pause assembly">${pauseIcon}<span>Pause</span></button>
            <button class="ca-replay" type="button" data-ca-replay>${replayIcon}<span>Replay</span></button>
            <label class="ca-speed">Speed
              <select aria-label="Playback speed" data-ca-speed>
                <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
              </select>
            </label>
            <output class="ca-time" data-ca-time aria-label="Elapsed assembly time" aria-live="off">00.0 <span>/ ${DURATION} s</span></output>
          </div>
          <label class="ca-scrub-label" for="ca-progress"><span>Separated</span><span data-ca-percentage>0%</span><span>Assembled</span></label>
          <input id="ca-progress" class="ca-scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="Assembly progress" data-ca-progress>
          <div class="ca-chapters" role="group" aria-label="Assembly stages">
            ${CHAPTERS.map((chapter, index) => `<button type="button" data-ca-chapter="${index}" aria-label="Jump to ${chapter.name.toLowerCase()} stage"><span>${String(index + 1).padStart(2, '0')}</span>${chapter.name}</button>`).join('')}
          </div>
          <p class="ca-stage-note" data-ca-stage-note>${CHAPTERS[0].note}</p>
        </section>
      </section>

      <aside class="ca-index" aria-label="Camera parts inspector">
        <div class="ca-index-heading"><p class="ca-eyebrow">Anatomy of an idea</p><h2>The object,<br>unmade.</h2><p>Choose a group to pause &amp; separate.</p></div>
        <div class="ca-parts" role="group" aria-label="Inspect camera parts">
          ${PARTS.map((part) => `<button type="button" data-ca-part="${part.id}" aria-pressed="false" aria-controls="ca-part-detail" aria-label="Inspect ${part.name.toLowerCase()}"><span>${part.number}</span>${part.name}</button>`).join('')}
        </div>
        <section class="ca-part-detail" id="ca-part-detail" aria-label="Selected part description">
          <p class="ca-material" data-ca-material>Nine groups / four material families</p>
          <h3 data-ca-part-title>Every piece has a part.</h3>
          <p data-ca-part-description>Follow the assembly or select a piece above. A warm highlight picks it out; the other parts recede.</p>
          <button class="ca-clear" type="button" data-ca-clear disabled>Clear highlight <span aria-hidden="true">↗</span></button>
        </section>
        <div class="ca-materials" aria-label="Material palette">
          <span><i class="ca-swatch-enamel"></i>Enamel</span><span><i class="ca-swatch-metal"></i>Metal</span>
          <span><i class="ca-swatch-glass"></i>Glass</span><span><i class="ca-swatch-paper"></i>Paper</span>
        </div>
        <p class="ca-status" data-ca-status role="status" aria-live="polite"></p>
      </aside>
    </div>

    <footer class="ca-footer">
      <p><span>Design fiction.</span> Original geometry, invented mechanics. The final picture is drawn locally—no camera, uploads, or external assets.</p>
      <p>Focus the scene: arrow keys orbit, + / − zoom, Space plays or pauses.</p>
    </footer>
    <div class="ca-engine-controls" data-ca-engine-controls hidden></div>`;

  const play = query<HTMLButtonElement>(page.root, '[data-ca-play]');
  const slider = query<HTMLInputElement>(page.root, '[data-ca-progress]');
  const speed = query<HTMLSelectElement>(page.root, '[data-ca-speed]');
  const status = query<HTMLElement>(page.root, '[data-ca-status]');
  const time = query<HTMLOutputElement>(page.root, '[data-ca-time]');
  const elapsedText = time.firstChild!;
  const percentage = query<HTMLElement>(page.root, '[data-ca-percentage]');
  const phaseTitle = query<HTMLElement>(page.root, '[data-ca-phase-title]');
  const stageNote = query<HTMLElement>(page.root, '[data-ca-stage-note]');
  const partTitle = query<HTMLElement>(page.root, '[data-ca-part-title]');
  const partDescription = query<HTMLElement>(page.root, '[data-ca-part-description]');
  const material = query<HTMLElement>(page.root, '[data-ca-material]');
  const clear = query<HTMLButtonElement>(page.root, '[data-ca-clear]');
  const viewName = query<HTMLElement>(page.root, '[data-ca-view-name]');
  const partButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-ca-part]'));
  const viewButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-ca-view]'));
  const chapterButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-ca-chapter]'));

  function report(message: string, notifyCollection = false) {
    if (page.signal.aborted) return;
    status.textContent = message;
    if (notifyCollection) page.report(message);
  }

  function syncFrame(value: number) {
    progress = value;
    slider.value = String(Math.round(value * 1000));
    slider.style.setProperty('--ca-progress', `${value * 100}%`);
    percentage.textContent = `${Math.round(value * 100)}%`;
    page.root.dataset.progress = value.toFixed(5);
    const seconds = (value * DURATION).toFixed(1).padStart(4, '0');
    if (elapsedText.textContent !== `${seconds} `) elapsedText.textContent = `${seconds} `;
    const chapter = chapterAt(value);
    slider.setAttribute('aria-valuetext', `${Math.round(value * 100)} percent assembled. ${CHAPTERS[chapter].name} stage.`);
    if (chapter !== activeChapter) {
      activeChapter = chapter;
      phaseTitle.textContent = CHAPTERS[chapter].title;
      stageNote.textContent = CHAPTERS[chapter].note;
      chapterButtons.forEach((button, index) => {
        if (chapter === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
  }

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value;
    artwork?.setPaused(value);
    page.root.dataset.motion = paused ? 'paused' : 'playing';
    play.setAttribute('aria-label', paused ? 'Play assembly' : 'Pause assembly');
    play.innerHTML = `${paused ? playIcon : pauseIcon}<span>${paused ? 'Play' : 'Pause'}</span>`;
  }

  function togglePlayback() {
    if (paused && progress === 1) artwork?.seek(0);
    setPaused(!paused);
    report(paused ? 'Assembly paused. You can still orbit and inspect.' : 'Assembly playing. Scrub the timeline to pause at any point.');
  }

  function seek(value: number) {
    setPaused(true);
    artwork?.seek(value);
    report(`${Math.round(value * 100)}% assembled. ${CHAPTERS[chapterAt(value)].note}`);
  }

  function inspect(id: PartId | null) {
    selected = id;
    const part = PARTS.find((item) => item.id === id);
    if (id && !part) throw new RangeError('That camera part does not exist.');
    if (part) {
      setPaused(true);
      artwork?.seek(EXPLODED_FRAME);
      material.textContent = part.material;
      partTitle.textContent = `${part.number} / ${part.name}`;
      partDescription.textContent = part.description;
    } else {
      material.textContent = 'Nine groups / four material families';
      partTitle.textContent = 'Every piece has a part.';
      partDescription.textContent = 'Follow the assembly or select a piece above. A warm highlight picks it out; the other parts recede.';
    }
    partButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.caPart === selected)));
    clear.disabled = !selected;
    page.root.dataset.selected = selected ?? '';
    artwork?.inspect(selected);
    report(part ? `${part.name} highlighted. Animation paused and pieces separated for inspection.` : 'All parts shown with their original finishes.');
  }

  function syncView(id: ViewId | 'custom') {
    page.root.dataset.view = id;
    viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.caView === id)));
    viewName.textContent = id === 'custom' ? 'Free orbit' : VIEWS.find((view) => view.id === id)!.name;
  }

  function replay() {
    inspect(null);
    artwork?.seek(0);
    setPaused(false);
    report('Replaying from the separated pieces.');
  }

  play.addEventListener('click', togglePlayback, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-ca-replay]').addEventListener('click', replay, { signal: page.signal });
  slider.addEventListener('input', () => seek(Number(slider.value) / 1000), { signal: page.signal });
  speed.addEventListener('change', () => {
    artwork?.setSpeed(Number(speed.value));
    report(`Playback speed set to ${speed.value}×.`);
  }, { signal: page.signal });
  clear.addEventListener('click', () => inspect(null), { signal: page.signal });
  partButtons.forEach((button) => button.addEventListener('click', () => inspect(button.dataset.caPart as PartId), { signal: page.signal }));
  viewButtons.forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.caView as ViewId;
    artwork?.setView(id);
    report(`${VIEWS.find((view) => view.id === id)!.name} view. Drag or use the scene’s arrow keys to explore.`);
  }, { signal: page.signal }));
  chapterButtons.forEach((button) => button.addEventListener('click', () => {
    seek(CHAPTERS[Number(button.dataset.caChapter)].seek);
  }, { signal: page.signal }));
  page.root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.code !== 'Space' || event.repeat) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.isContentEditable || target.closest('input, textarea, select, button, a, summary')) return;
    event.preventDefault();
    togglePlayback();
  }, { signal: page.signal });
  preference.addEventListener('change', () => {
    setPaused(true);
    report(preference.matches ? 'Reduced motion enabled. The assembly is paused; all controls remain available.' : 'Motion preference changed. Press Play when you are ready.');
  }, { signal: page.signal });

  try {
    artwork = createCameraArtwork({
      container: query<HTMLElement>(page.root, '[data-ca-scene]'),
      controls: query<HTMLElement>(page.root, '[data-ca-engine-controls]'),
      signal: page.signal,
      reducedMotion: paused,
      report: (message) => report(message, true),
    }, {
      frame: syncFrame,
      finish() {
        setPaused(true);
        report('Assembled. “Last light” is an original drawing made in this browser. Replay, scrub backwards, or orbit the finished camera.');
      },
      view: syncView,
    });
    page.onCleanup(artwork.destroy);
    setPaused(paused);
    syncView('study');
    report(paused ? 'Reduced motion: a separated still frame. Play when you choose, or explore with the timeline.' : 'An object in nine parts. Drag to orbit; choose a part to look closer.');
  } catch (error) {
    page.destroy();
    throw error;
  }

  return {
    destroy: page.destroy,
    setPaused,
    reset() {
      if (page.signal.aborted) return;
      inspect(null);
      artwork?.seek(EXPLODED_FRAME);
      artwork?.setView('study');
      setPaused(true);
      report('Returned to the separated study, paused.');
    },
  };
}
