import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { LESSONS, PHASE_LABELS } from './data';
import type { Lesson } from './data';
import { DEFAULT_PARAMETERS, sampleMotion } from './model';
import type { EasingId, MotionParameters } from './model';
import { createScene, lessonButtonMarkup, sceneMarkup } from './scene';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'motion-foundry');
  page.root.tabIndex = 0;
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'mf-title');
  page.root.innerHTML = `
    <div class="mf-site">
      <header class="mf-masthead">
        <div>
          <p class="mf-brand-line"><span class="mf-brand-mark" aria-hidden="true">M↗F</span> A practical motion lab</p>
          <h1 id="mf-title">Motion Foundry<span aria-hidden="true">.</span></h1>
        </div>
        <p class="mf-tagline">Make a move.<br><strong>Make it mean something.</strong></p>
      </header>
      <nav class="mf-lessons" aria-label="Animation lessons">
        ${LESSONS.map(lessonButtonMarkup).join('')}
      </nav>
      <section class="mf-workbench" id="mf-comparison" aria-labelledby="mf-study-title" aria-describedby="mf-keyboard-hint" tabindex="0" data-project-preview>
        <header class="mf-study-heading">
          <div><p class="mf-overline" data-mf-study-number></p><h2 id="mf-study-title" data-mf-study-title></h2></div>
          <span class="mf-phase" data-mf-phase></span>
        </header>
        <div class="mf-scene-tabs"></div>
        <div class="mf-scenes">${sceneMarkup('plain')}${sceneMarkup('expressive')}</div>
        <div class="mf-guide-row">
          <label class="mf-guide-toggle"><input type="checkbox" data-mf-guides checked aria-label="Show motion guides"> Guides</label>
          <p><span class="mf-guide-dot" aria-hidden="true"></span> Outlines = ⅛-clip snapshots <span aria-hidden="true">·</span> Dashed line = center route</p>
        </div>
        <div class="mf-transport">
          <div class="mf-playback-buttons">
            <button class="mf-play-button" type="button" data-mf-play aria-label="Play animation"><span data-mf-play-symbol aria-hidden="true">▶</span><span data-mf-play-label>Play</span></button>
            <button class="mf-replay-button" type="button" data-mf-replay aria-label="Replay animation"><span aria-hidden="true">↺</span> Replay</button>
          </div>
          <div class="mf-timeline">
            <div class="mf-field-top"><label for="mf-position">Clip position</label><output for="mf-position" data-mf-clock aria-live="off"></output></div>
            <input id="mf-position" type="range" min="0" max="1000" step="1" value="0" aria-describedby="mf-scrub-hint" data-mf-position>
          </div>
          <div class="mf-speed">
            <label for="mf-speed">Viewing speed</label>
            <select id="mf-speed" data-mf-speed><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
          </div>
        </div>
        <div class="mf-transport-notes">
          <p id="mf-scrub-hint">Scrubbing pauses the clip. Every frame works in either direction.</p>
          <p class="mf-status" role="status" aria-live="polite" data-mf-status></p>
        </div>
        <p class="mf-reduced-note" data-mf-reduced hidden>Reduced motion · still until Play.</p>
      </section>
      <div class="mf-lower">
        <article class="mf-lesson-notes" id="mf-lesson-notes" aria-labelledby="mf-explanation-title">
          <p class="mf-overline">The principle</p>
          <h2 id="mf-explanation-title" data-mf-headline></h2>
          <p class="mf-explanation" data-mf-explanation></p>
          <div class="mf-notice"><h3>Watch for</h3><p data-mf-notice></p></div>
          <div class="mf-challenge"><h3>Try this <span aria-hidden="true">↗</span></h3><p data-mf-challenge></p></div>
        </article>
        <aside class="mf-settings" aria-labelledby="mf-settings-title">
          <header><h2 id="mf-settings-title">Tune the move.</h2><button type="button" class="mf-reset-button" data-mf-reset aria-label="Reset settings">Reset</button></header>
          <p class="mf-settings-intro">One clock. Two treatments. Change one thing.</p>
          <div class="mf-parameter">
            <div class="mf-field-top"><label for="mf-duration">Clip duration</label><output for="mf-duration" data-mf-duration-output aria-live="off"></output></div>
            <input id="mf-duration" type="range" min="1.2" max="5" step="0.1" value="2.8" data-mf-duration aria-describedby="mf-duration-hint">
            <p class="mf-control-hint" id="mf-duration-hint">Full clip length at 1×. Viewing speed changes the watching rate.</p>
          </div>
          <div class="mf-parameter">
            <div class="mf-field-top"><label for="mf-amplitude">Amplitude</label><output for="mf-amplitude" data-mf-amplitude-output aria-live="off"></output></div>
            <input id="mf-amplitude" type="range" min="0" max="100" step="1" value="75" data-mf-amplitude aria-label="Expression amplitude" aria-describedby="mf-amplitude-hint">
            <p class="mf-control-hint" id="mf-amplitude-hint" data-mf-amplitude-hint></p>
          </div>
          <div class="mf-parameter">
            <label for="mf-easing">Travel easing</label>
            <select id="mf-easing" data-mf-easing aria-describedby="mf-easing-hint"><option value="smooth">Smooth in–out</option><option value="out">Quick out</option><option value="in">Slow in</option><option value="linear">Linear</option></select>
            <p class="mf-control-hint" id="mf-easing-hint" data-mf-easing-hint></p>
          </div>
          <details class="mf-model-note">
            <summary>Under the hood <span aria-hidden="true">+</span></summary>
            <p data-mf-model-note></p>
            <p>Time is normalized to the full clip. All poses are calculated directly from that time and your settings, so reverse scrubbing does not rewind a simulation.</p>
          </details>
        </aside>
      </div>
      <footer class="mf-footer"><strong>Built from time, not tricks.</strong><p>Six original mathematical studies, not claims of physical realism.</p><p id="mf-keyboard-hint">Focus the workbench and press Space to play or pause. Native controls keep their usual keys.</p></footer>
      <nav class="mf-workspace-actions" aria-label="Motion workspace">
        <button type="button" data-mf-open-lessons>Lessons</button>
        <button type="button" data-mf-open-principle>Principle &amp; notes</button>
      </nav>
    </div>
    <p class="sr-only" data-mf-announcement role="status" aria-live="polite"></p>`;

  const actions = query<HTMLElement>(page.root, '.mf-workspace-actions');
  actions.append(query(page.root, '[data-mf-reset]'));
  query(page.root, '.mf-study-heading').append(query(page.root, '.mf-guide-toggle'));
  const notes = query<HTMLElement>(page.root, '.mf-lesson-notes');
  notes.prepend(query(page.root, '[data-mf-study-number]'));
  notes.append(
    query(page.root, '.mf-settings > header'),
    query(page.root, '.mf-settings-intro'),
    ...page.root.querySelectorAll<HTMLElement>('.mf-control-hint'),
    query(page.root, '.mf-model-note'),
    query(page.root, '.mf-guide-row'),
    query(page.root, '.mf-transport-notes'),
    query(page.root, '.mf-footer'),
  );
  createWorkspaceDialog(page, {
    id: 'mf-lessons-dialog', title: 'Choose a motion lesson',
    triggers: [query(page.root, '[data-mf-open-lessons]')],
    content: [query(page.root, '.mf-lessons')],
  });
  createWorkspaceDialog(page, {
    id: 'mf-principle-dialog', title: 'Principle & notes',
    triggers: [query(page.root, '[data-mf-open-principle]')],
    content: [notes],
  });
  const comparison = window.matchMedia('(max-width: 740px)');
  const scenePanels = ['plain', 'expressive'].map(id => ({
    id, label: id === 'plain' ? 'Plain' : 'Expressive',
    panel: query<HTMLElement>(page.root, `[data-mf-scene="${id}"]`),
  }));
  function syncComparison() {
    for (const { panel } of scenePanels) {
      const inactive = comparison.matches && panel.hasAttribute('data-workspace-inactive');
      panel.inert = inactive;
      panel.setAttribute('aria-hidden', String(inactive));
    }
    const phase = query<HTMLElement>(page.root, '[data-mf-phase]');
    if (comparison.matches) notes.prepend(phase);
    else query(page.root, '.mf-study-heading').insertBefore(phase, query(page.root, '.mf-guide-toggle'));
  }
  createWorkspaceTabs(page, {
    id: 'mf-comparison', label: 'Comparison treatment',
    host: query(page.root, '.mf-scene-tabs'), panes: scenePanels,
    initial: 'expressive', preserveLayout: true, onSelect: syncComparison,
  });
  comparison.addEventListener('change', syncComparison, { signal: page.signal });
  syncComparison();

  const playButton = query<HTMLButtonElement>(page.root, '[data-mf-play]');
  const playLabel = query<HTMLElement>(page.root, '[data-mf-play-label]');
  const playSymbol = query<HTMLElement>(page.root, '[data-mf-play-symbol]');
  const positionInput = query<HTMLInputElement>(page.root, '[data-mf-position]');
  const clock = query<HTMLOutputElement>(page.root, '[data-mf-clock]');
  const speedInput = query<HTMLSelectElement>(page.root, '[data-mf-speed]');
  const durationInput = query<HTMLInputElement>(page.root, '[data-mf-duration]');
  const durationOutput = query<HTMLOutputElement>(page.root, '[data-mf-duration-output]');
  const amplitudeInput = query<HTMLInputElement>(page.root, '[data-mf-amplitude]');
  const amplitudeOutput = query<HTMLOutputElement>(page.root, '[data-mf-amplitude-output]');
  const easingInput = query<HTMLSelectElement>(page.root, '[data-mf-easing]');
  const guidesInput = query<HTMLInputElement>(page.root, '[data-mf-guides]');
  const status = query<HTMLElement>(page.root, '[data-mf-status]');
  const announcement = query<HTMLElement>(page.root, '[data-mf-announcement]');
  const phaseLabel = query<HTMLElement>(page.root, '[data-mf-phase]');
  const reducedNote = query<HTMLElement>(page.root, '[data-mf-reduced]');
  const lessonButtons = Array.from(page.root.querySelectorAll<HTMLButtonElement>('[data-mf-lesson]'));
  const scenes = [createScene(page.root, 'plain'), createScene(page.root, 'expressive')];
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const startsReduced = context.reducedMotion || preference.matches;
  let lesson: Lesson = LESSONS[0];
  let parameters: MotionParameters = { ...DEFAULT_PARAMETERS };
  let seconds = startsReduced ? lesson.featuredProgress * parameters.duration : 0;
  let speed = 1;
  let paused = true;

  function announce(message: string, report = false) {
    status.textContent = message;
    announcement.textContent = status.closest('dialog')?.open ? '' : message;
    if (report) page.report(message);
  }

  function draw() {
    const frame = sampleMotion(lesson.id, seconds, parameters);
    scenes.forEach((scene) => scene.draw(frame));
    positionInput.value = String(Math.round(frame.progress * 1000));
    positionInput.style.setProperty('--mf-range-progress', `${(frame.progress * 100).toFixed(3)}%`);
    positionInput.setAttribute('aria-valuetext', `${(frame.progress * 100).toFixed(1)} percent; ${frame.seconds.toFixed(2)} of ${parameters.duration.toFixed(2)} seconds`);
    clock.textContent = `${frame.seconds.toFixed(2)} / ${parameters.duration.toFixed(2)} s`;
    phaseLabel.textContent = PHASE_LABELS[frame.phase];
    page.root.dataset.progress = frame.progress.toFixed(6);
  }

  function configureScenes() {
    scenes.forEach((scene) => scene.configure(lesson, parameters));
    draw();
  }

  function syncSettings() {
    durationInput.value = String(parameters.duration);
    durationOutput.textContent = `${parameters.duration.toFixed(1)} s`;
    durationInput.setAttribute('aria-valuetext', `${parameters.duration.toFixed(1)} seconds`);
    durationInput.style.setProperty('--mf-range-progress', `${(parameters.duration - 1.2) / 3.8 * 100}%`);
    amplitudeInput.value = String(Math.round(parameters.amplitude * 100));
    amplitudeOutput.textContent = `${Math.round(parameters.amplitude * 100)}%`;
    amplitudeInput.setAttribute('aria-valuetext', `${Math.round(parameters.amplitude * 100)} percent`);
    amplitudeInput.style.setProperty('--mf-range-progress', `${parameters.amplitude * 100}%`);
    easingInput.value = parameters.easing;
    speedInput.value = String(speed);
  }

  function showLesson() {
    const index = LESSONS.indexOf(lesson);
    page.root.dataset.lesson = lesson.id;
    query<HTMLElement>(page.root, '[data-mf-study-number]').textContent = `Study ${String(index + 1).padStart(2, '0')} / 06`;
    query<HTMLElement>(page.root, '[data-mf-study-title]').textContent = lesson.title;
    query<HTMLElement>(page.root, '[data-mf-headline]').textContent = lesson.headline;
    query<HTMLElement>(page.root, '[data-mf-explanation]').textContent = lesson.explanation;
    query<HTMLElement>(page.root, '[data-mf-notice]').textContent = lesson.notice;
    query<HTMLElement>(page.root, '[data-mf-challenge]').textContent = lesson.tryThis;
    query<HTMLElement>(page.root, '[data-mf-model-note]').textContent = lesson.modelNote;
    query<HTMLElement>(page.root, '[data-mf-amplitude-hint]').textContent = lesson.amplitudeHint;
    query<HTMLElement>(page.root, '[data-mf-easing-hint]').textContent = lesson.id === 'timing'
      ? 'Applied to Expressive only. Plain stays linear for comparison.'
      : 'The same travel ease is used on both sides, isolating this principle.';
    lessonButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mfLesson === lesson.id)));
    configureScenes();
  }

  const loop = createLoop((_elapsed, delta) => {
    if (paused || page.signal.aborted) return;
    seconds = Math.min(parameters.duration, seconds + delta * speed);
    draw();
    if (seconds >= parameters.duration) {
      setPaused(true);
      announce('Clip complete. Replay it, or scrub backward to take it apart.');
    }
  }, { paused: true });
  page.onCleanup(loop.destroy);

  function setPaused(value: boolean) {
    if (page.signal.aborted) return;
    paused = value;
    if (!paused && seconds >= parameters.duration) {
      seconds = 0;
      draw();
    }
    loop.setPaused(paused);
    playLabel.textContent = paused ? 'Play' : 'Pause';
    playSymbol.textContent = paused ? '▶' : 'Ⅱ';
    playButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    page.root.dataset.motion = paused ? 'paused' : 'playing';
  }

  function togglePlayback() {
    setPaused(!paused);
    announce(paused ? 'Paused. The outlines show the rest of the move.' : 'Playing once. Both sides share the same clock.');
  }

  function replay() {
    if (page.signal.aborted) return;
    seconds = 0;
    draw();
    setPaused(false);
    announce('Replaying from the first frame.');
  }

  function reset() {
    if (page.signal.aborted) return;
    setPaused(true);
    parameters = { ...DEFAULT_PARAMETERS };
    speed = 1;
    seconds = lesson.featuredProgress * parameters.duration;
    guidesInput.checked = true;
    page.root.classList.remove('mf-guides-hidden');
    syncSettings();
    configureScenes();
    announce('Default settings restored. Paused on this principle’s study frame.');
  }

  for (const button of lessonButtons) {
    button.addEventListener('click', () => {
      const next = LESSONS.find((item) => item.id === button.dataset.mfLesson);
      if (!next) throw new Error('The selected motion lesson is not defined.');
      setPaused(true);
      lesson = next;
      seconds = lesson.featuredProgress * parameters.duration;
      showLesson();
      announce(`${lesson.title}. Paused at a useful study frame; Replay starts at the beginning.`);
    }, { signal: page.signal });
  }
  playButton.addEventListener('click', togglePlayback, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-mf-replay]').addEventListener('click', replay, { signal: page.signal });
  query<HTMLButtonElement>(page.root, '[data-mf-reset]').addEventListener('click', reset, { signal: page.signal });
  positionInput.addEventListener('input', () => {
    if (!paused) setPaused(true);
    seconds = Number(positionInput.value) / 1000 * parameters.duration;
    draw();
    announce('Paused for scrubbing. Earlier and later frames use the same settings.');
  }, { signal: page.signal });
  speedInput.addEventListener('change', () => {
    speed = Number(speedInput.value);
    announce(`Viewing speed is ${speed}×. The clip’s poses and duration setting are unchanged.`);
  }, { signal: page.signal });
  durationInput.addEventListener('input', () => {
    const progress = seconds / parameters.duration;
    parameters.duration = Number(durationInput.value);
    seconds = progress * parameters.duration;
    syncSettings();
    configureScenes();
    announce('Duration changed. Your relative position in the clip is preserved.');
  }, { signal: page.signal });
  amplitudeInput.addEventListener('input', () => {
    parameters.amplitude = Number(amplitudeInput.value) / 100;
    syncSettings();
    configureScenes();
    announce('Amplitude changed. The destination stays the same.');
  }, { signal: page.signal });
  easingInput.addEventListener('change', () => {
    parameters.easing = easingInput.value as EasingId;
    configureScenes();
    announce('Easing changed. Compare where this moment sits along each route.');
  }, { signal: page.signal });
  guidesInput.addEventListener('change', () => {
    page.root.classList.toggle('mf-guides-hidden', !guidesInput.checked);
    draw();
    announce(guidesInput.checked ? 'Motion guides shown: route and equal-time snapshots.' : 'Motion guides hidden. Only the current pose is shown.');
  }, { signal: page.signal });
  page.root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.defaultPrevented || event.repeat || event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey ||
        !(target instanceof HTMLElement) || target.isContentEditable ||
        target.closest('input, textarea, select, button, a, summary, [role="slider"]')) return;
    event.preventDefault();
    togglePlayback();
  }, { signal: page.signal });
  preference.addEventListener('change', () => {
    setPaused(true);
    reducedNote.hidden = !preference.matches;
    announce('Motion preference changed. Playback is paused; press Play when you are ready.');
  }, { signal: page.signal });

  syncSettings();
  showLesson();
  reducedNote.hidden = !startsReduced;
  setPaused(startsReduced);
  announce(startsReduced
    ? 'Reduced motion: paused on a study frame. Guides reveal the whole move.'
    : 'Playing once. Pick a principle, or pause to inspect the differences.');
  return { destroy: page.destroy, setPaused, reset };
}
