import './style.css';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DURATION, SPEEDS, STAGES } from './data';
import { createMachineScene } from './scene';
import { STAGE_CUES, stateAt } from './timeline';

let nextPageId = 0;
const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7Z" fill="currentColor"/></svg>';
const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5zm7 0h3v14h-3Z" fill="currentColor"/></svg>';
const replayIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7a6.5 6.5 0 1 1-.5 5M4 2v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const seconds = (value: number) => value.toFixed(2).padStart(5, '0');

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'chain-reaction');
  const { root, signal } = page;
  const id = `chain-reaction-${++nextPageId}`;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = context.reducedMotion || preference.matches;
  let paused = reducedMotion;
  let time = 0;
  let speed = 1;
  let previousStage = '';
  let previousButton = '';

  root.tabIndex = 0;
  root.dataset.workspace = 'true';
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.innerHTML = `
    <div class="cr-shell">
      <header class="cr-header">
        <div class="cr-identity">
          <div class="cr-wordmark">
            <svg class="cr-brand" viewBox="0 0 50 42" aria-hidden="true">
              <g fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="2" y="13" width="28" height="17" rx="8.5" transform="rotate(-34 16 21.5)"/>
                <rect x="20" y="13" width="28" height="17" rx="8.5" transform="rotate(-34 34 21.5)"/>
              </g>
              <circle cx="25" cy="21" r="4" fill="#df836b"/>
            </svg>
            <h1 id="${id}-title">Chain Reaction<span aria-hidden="true">.</span></h1>
          </div>
          <p>Small causes. Excellent consequences.</p>
        </div>
        <div class="cr-header-note">
          <span class="cr-kicker">No. 01 / The Bloom Machine</span>
          <a href="#${id}-notes">Behind the motion <span aria-hidden="true">↙</span></a>
        </div>
      </header>

      <figure class="cr-machine" data-project-preview aria-label="The Bloom Machine and playback controls">
        <div class="cr-machine-topline">
          <span class="cr-kicker">A little nudge goes a long way</span>
          <span class="cr-machine-status"><i aria-hidden="true"></i><span data-machine-status></span></span>
        </div>
        <div class="cr-scene-host" data-scene-host></div>
        <figcaption class="cr-transport">
          <div class="cr-transport-buttons">
            <button type="button" class="cr-play" data-play></button>
            <button type="button" class="cr-replay" data-replay aria-label="Replay from the beginning">${replayIcon}<span>Replay</span></button>
          </div>
          <div class="cr-scrubber">
            <div class="cr-scrubber-heading">
              <label for="${id}-timeline">Follow the chain</label>
              <output for="${id}-timeline" data-clock role="timer" aria-live="off">00.00 / 12.00 s</output>
            </div>
            <input id="${id}-timeline" type="range" min="0" max="${DURATION}" step="0.01" value="0" aria-label="Timeline position" aria-describedby="${id}-timeline-help">
            <div class="cr-cue-marks" aria-hidden="true">
              ${STAGES.map((stage) => `<span style="left:${STAGE_CUES[stage.id] / DURATION * 100}%"></span>`).join('')}
            </div>
          </div>
          <div class="cr-speed"><label for="${id}-speed">Playback speed</label>
            <select id="${id}-speed">
              ${SPEEDS.map((item) => `<option value="${item.value}" ${item.value === 1 ? 'selected' : ''}>${escapeMarkup(item.label)}</option>`).join('')}
            </select>
          </div>
        </figcaption>
      </figure>

      <div class="cr-under-machine">
        <p class="cr-feedback" data-feedback role="status" aria-live="polite" aria-atomic="true"></p>
        <p id="${id}-timeline-help" class="cr-timeline-help">Drag either way. <kbd>Space</kbd> plays / pauses when the page is focused.</p>
      </div>
      <p class="cr-motion-note" data-motion-note hidden>Reduced motion · still until you choose Play.</p>

      <section class="cr-inspector" aria-labelledby="${id}-stages-title">
        <div class="cr-section-heading">
          <h2 id="${id}-stages-title">Follow the hand-off.</h2>
          <p>Choose a stage to pause and take a closer look.</p>
        </div>
        <div class="cr-stages" role="group" aria-label="Inspect a stage">
          ${STAGES.map((stage) => `
            <button type="button" data-seek-stage="${stage.id}" aria-label="Inspect stage ${Number(stage.number)}: ${stage.label}">
              <span class="cr-stage-number">${stage.number}</span>
              <span class="cr-stage-name">${stage.label}</span>
              <span class="cr-stage-time">${stage.seek.toFixed(2)} s <span aria-hidden="true">↗</span></span>
            </button>
          `).join('')}
        </div>
        <div class="cr-stage-detail">
          <div class="cr-detail-heading">
            <span class="cr-detail-number" data-detail-number>01</span>
            <div><p class="cr-kicker" data-detail-label>The roll</p><h3 data-detail-title></h3></div>
          </div>
          <div class="cr-detail-copy">
            <p class="cr-handoff"><span data-cause></span><span class="cr-handoff-arrow" aria-hidden="true">→</span><span data-effect></span></p>
            <p data-explanation></p>
          </div>
        </div>
      </section>

      <section id="${id}-notes" class="cr-notes" aria-labelledby="${id}-notes-title">
        <div><p class="cr-kicker">A note on the choreography</p><h2 id="${id}-notes-title">Not quite physics.<br><em>Quite a chain.</em></h2></div>
        <div class="cr-notes-copy">
          <p>This is an <strong>illustrative, hand-authored timeline</strong>, not a rigid-body physics simulation. Contacts, pauses, and the final flourish are deliberately staged. It is a tiny story about cause and effect, not an engineering model.</p>
          <p>Every part answers to the same twelve-second clock. Try half speed for the domino hand-off, or scrub backwards to put a moment back exactly as you found it. Nothing runs on in the background of a paused machine.</p>
          <div class="cr-materials" aria-label="The machine's illustrated materials"><span><i class="cr-swatch-blue" aria-hidden="true"></i>Powder blue</span><span><i class="cr-swatch-coral" aria-hidden="true"></i>Coral</span><span><i class="cr-swatch-gold" aria-hidden="true"></i>Mustard</span><span><i class="cr-swatch-copper" aria-hidden="true"></i>Copper</span></div>
        </div>
      </section>
      <footer class="cr-footer"><span>Built for the pleasure of the next thing.</span><span>Original SVG · One reversible clock · Quiet by design</span></footer>
      <nav class="cr-workspace-actions" aria-label="Machine workspace">
        <button type="button" data-open-stages>Inspect stages</button>
        <button type="button" data-open-notes>Behind the motion</button>
      </nav>
    </div>
    <p class="sr-only" data-cr-announcement role="status" aria-live="polite"></p>`;

  createWorkspaceDialog(page, {
    id: `${id}-stages`, title: 'Follow the hand-off',
    triggers: [query(root, '[data-open-stages]')],
    content: [query(root, '.cr-inspector')],
  });
  createWorkspaceDialog(page, {
    id: `${id}-choreography`, title: 'Behind the motion',
    triggers: [query(root, '[data-open-notes]'), query(root, '.cr-header-note a')],
    content: [query(root, '.cr-notes'), query(root, '.cr-under-machine'), query(root, '.cr-footer')],
  });
  query(root, '.cr-workspace-actions').append(query(root, '[data-motion-note]'));

  const play = query<HTMLButtonElement>(root, '[data-play]');
  const replay = query<HTMLButtonElement>(root, '[data-replay]');
  const slider = query<HTMLInputElement>(root, `#${id}-timeline`);
  const speedSelect = query<HTMLSelectElement>(root, `#${id}-speed`);
  const clock = query<HTMLOutputElement>(root, '[data-clock]');
  const feedback = query<HTMLElement>(root, '[data-feedback]');
  const announcement = query<HTMLElement>(root, '[data-cr-announcement]');
  const motionNote = query<HTMLElement>(root, '[data-motion-note]');
  const machineStatus = query<HTMLElement>(root, '[data-machine-status]');
  const detailNumber = query<HTMLElement>(root, '[data-detail-number]');
  const detailLabel = query<HTMLElement>(root, '[data-detail-label]');
  const detailTitle = query<HTMLElement>(root, '[data-detail-title]');
  const cause = query<HTMLElement>(root, '[data-cause]');
  const effect = query<HTMLElement>(root, '[data-effect]');
  const explanation = query<HTMLElement>(root, '[data-explanation]');
  const stageButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-seek-stage]')];
  const scene = createMachineScene(query<HTMLElement>(root, '[data-scene-host]'), signal);
  page.onCleanup(scene.destroy);

  function announce(message: string, report = false) {
    if (signal.aborted) return;
    feedback.textContent = message;
    announcement.textContent = feedback.closest('dialog')?.open ? '' : message;
    if (report) page.report(message);
  }

  function render() {
    const state = stateAt(time);
    scene.render(state);
    root.dataset.motion = paused ? 'paused' : 'playing';
    root.dataset.time = time.toFixed(4);
    root.dataset.stage = state.stage;
    root.dataset.reducedMotion = String(reducedMotion);
    motionNote.hidden = !reducedMotion;
    slider.value = time.toFixed(2);
    slider.style.setProperty('--cr-progress', `${time / DURATION * 100}%`);
    clock.value = `${seconds(time)} / ${seconds(DURATION)} s`;
    const stage = STAGES.find((candidate) => candidate.id === state.stage)!;
    slider.setAttribute('aria-valuetext', `${time.toFixed(2)} seconds of ${DURATION} seconds. Stage ${stage.number}: ${stage.label}.`);
    machineStatus.textContent = state.complete ? 'The chain is complete' : `${paused ? 'Still' : 'In motion'} · ${stage.number} / ${stage.label}`;

    const buttonState = paused ? (state.complete ? 'again' : 'play') : 'pause';
    if (buttonState !== previousButton) {
      previousButton = buttonState;
      play.innerHTML = `${paused ? playIcon : pauseIcon}<span>${paused ? (state.complete ? 'Play again' : 'Play') : 'Pause'}</span>`;
      play.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    }
    if (state.stage !== previousStage) {
      previousStage = state.stage;
      detailNumber.textContent = stage.number;
      detailLabel.textContent = `The ${stage.label.toLowerCase()}`;
      detailTitle.textContent = stage.title;
      cause.textContent = stage.cause;
      effect.textContent = stage.effect;
      explanation.textContent = stage.explanation;
      stageButtons.forEach((button) => {
        if (button.dataset.seekStage === stage.id) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
  }

  const loop = createLoop((_, delta) => {
    if (!paused) {
      time = clamp(time + delta * speed, 0, DURATION);
      if (time === DURATION) {
        paused = true;
        loop.setPaused(true);
        announce('Chain complete. The flower is open. Replay, or scrub backwards to find your favourite moment.');
      }
    }
    render();
  }, { paused });
  page.onCleanup(loop.destroy);

  function setPaused(value: boolean) {
    if (signal.aborted) return;
    if (!value && time === DURATION) time = 0;
    paused = value;
    loop.setPaused(paused);
    render();
  }

  function togglePlayback() {
    setPaused(!paused);
    announce(paused
      ? `Paused at ${seconds(time)} seconds. Every part is still.`
      : `Playing at ${speed}×. One twelve-second sequence, then a well-earned rest.`);
  }

  function seek(value: number) {
    time = clamp(value, 0, DURATION);
    setPaused(true);
  }

  play.addEventListener('click', togglePlayback, { signal });
  replay.addEventListener('click', () => {
    time = 0;
    setPaused(false);
    announce(`Replaying from the first nudge at ${speed}×.`);
  }, { signal });
  slider.addEventListener('input', () => seek(slider.valueAsNumber), { signal });
  slider.addEventListener('change', () => {
    const stage = STAGES.find((candidate) => candidate.id === stateAt(time).stage)!;
    announce(`Paused at ${seconds(time)} seconds. ${stage.label}: ${stage.cause} → ${stage.effect}.`);
  }, { signal });
  speedSelect.addEventListener('change', () => {
    const choice = SPEEDS.find((item) => item.value === Number(speedSelect.value));
    if (!choice) throw new RangeError('Unknown Chain Reaction playback speed.');
    speed = choice.value;
    announce(`Playback speed is ${speed}×. The choreography stays the same.`);
  }, { signal });
  stageButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const stage = STAGES.find((candidate) => candidate.id === button.dataset.seekStage)!;
      seek(stage.seek);
      announce(`Inspecting ${stage.number}: ${stage.label}, paused at ${seconds(stage.seek)} seconds. ${stage.title}`);
    }, { signal });
  });
  root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button, input, select, textarea, a, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"]')) return;
    event.preventDefault();
    togglePlayback();
  }, { signal });
  preference.addEventListener('change', () => {
    reducedMotion = preference.matches;
    setPaused(true);
    announce(reducedMotion
      ? 'Reduced motion is now on. The machine is paused; inspect a stage or choose Play when you want to.'
      : 'Reduced motion is now off. The machine stays paused until you choose Play.');
  }, { signal });

  render();
  announce(reducedMotion
    ? 'Ready, and still. Choose Play, or inspect any stage without animation.'
    : 'Playing · One twelve-second sequence, then a well-earned rest.');
  return {
    destroy: page.destroy,
    setPaused,
    reset() {
      if (signal.aborted) return;
      seek(0);
      announce('Back to the beginning. The machine is paused and ready for a little nudge.');
    },
  };
}
