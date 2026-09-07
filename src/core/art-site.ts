import '../styles/art-sites.css';
import { parseManifest } from './manifest';
import { createProjectPage, escapeMarkup, query } from './page';
import { createWorkspaceDialog } from './workspace';
import type { ExperimentContext, ExperimentInstance, ProjectContext, ProjectInstance } from './types';

export function defineArtSite(
  manifest: unknown,
  createArtwork: (context: ExperimentContext) => ExperimentInstance,
): (context: ProjectContext) => ProjectInstance {
  const identity = parseManifest(manifest);
  return (context) => {
    const page = createProjectPage(context, identity.id);
    page.root.classList.add('art-website');
    page.root.dataset.workspace = 'true';
    page.root.tabIndex = 0;
    page.root.setAttribute('aria-labelledby', `${identity.id}-site-title`);
    page.root.innerHTML = `
      <header class="art-site-header">
        <div class="art-brand"><p>${escapeMarkup(identity.medium)}</p><h1 id="${identity.id}-site-title">${escapeMarkup(identity.title)}</h1></div>
        <p class="art-subtitle">${escapeMarkup(identity.subtitle)}</p>
        <button class="art-notes-button" type="button" data-open-art-notes>Studio notes <span aria-hidden="true">+</span></button>
      </header>
      <div class="art-workbench" data-project-preview>
        <section class="art-surface" aria-label="${escapeMarkup(identity.title)} artwork and playback">
          <div class="art-stage" data-art-stage style="background:${identity.color};color:${identity.ink}"></div>
          <div class="art-transport">
            <button class="art-play-button" type="button" data-art-play disabled></button>
            <button class="art-reset-button" type="button" data-art-reset disabled>Reset</button>
            <button class="art-controls-toggle" type="button" data-art-controls-toggle aria-controls="${identity.id}-inspector" aria-expanded="false">Controls</button>
          </div>
        </section>
        <aside class="art-inspector" id="${identity.id}-inspector" aria-label="${escapeMarkup(identity.title)} studio controls">
          <h2 class="art-inspector-heading">Studio controls</h2>
          <div class="art-controls experiment-controls" data-controls></div>
          <p class="art-status" role="status" aria-live="polite" data-art-report>${escapeMarkup(identity.instruction)}</p>
        </aside>
      </div>
      <section class="art-notes" data-art-notes>
        <h3>About this study</h3>
        <p>${escapeMarkup(identity.description)}</p>
        <p>The artwork and playback stay in view. On a small screen, open Controls to adjust the work in a compact dock. Space pauses motion when the studio is focused, unless the artwork has its own shortcut.</p>
        <div class="art-tags">${identity.tags.map((tag) => `<span>${escapeMarkup(tag)}</span>`).join('')}</div>
      </section>`;

    const canvasHost = query<HTMLElement>(page.root, '[data-art-stage]');
    const controls = query<HTMLElement>(page.root, '[data-controls]');
    const status = query<HTMLElement>(page.root, '[data-art-report]');
    const play = query<HTMLButtonElement>(page.root, '[data-art-play]');
    const reset = query<HTMLButtonElement>(page.root, '[data-art-reset]');
    const inspector = query<HTMLElement>(page.root, '.art-inspector');
    const toggle = query<HTMLButtonElement>(page.root, '[data-art-controls-toggle]');
    const compact = window.matchMedia('(max-width: 850px)');
    let inspectorOpen = false;
    function syncInspector() {
      const visible = !compact.matches || inspectorOpen;
      const focusInside = inspector.contains(document.activeElement);
      inspector.hidden = !visible;
      toggle.hidden = !compact.matches;
      toggle.setAttribute('aria-expanded', String(visible));
      toggle.setAttribute('aria-label', visible ? 'Hide studio controls' : 'Show studio controls');
      if (!visible && focusInside) toggle.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => { inspectorOpen = !inspectorOpen; syncInspector(); }, { signal: page.signal });
    compact.addEventListener('change', syncInspector, { signal: page.signal });
    syncInspector();
    createWorkspaceDialog(page, {
      id: `${identity.id}-studio-notes`,
      title: 'Studio notes',
      content: [query(page.root, '[data-art-notes]')],
      triggers: [query(page.root, '[data-open-art-notes]')],
    });
    let artwork: ExperimentInstance | undefined;
    let paused = context.reducedMotion;

    function setPaused(value: boolean) {
      paused = value;
      artwork?.setPaused(paused);
      play.innerHTML = `${paused ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor"/></svg>'}<span>${paused ? 'Play' : 'Pause'}</span>`;
      play.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
      page.root.dataset.motion = paused ? 'paused' : 'playing';
    }

    setPaused(paused);
    play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
    reset.addEventListener('click', () => {
      artwork?.reset?.();
      status.textContent = 'A fresh start. Make it your own.';
    }, { signal: page.signal });
    page.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && compact.matches && inspectorOpen && !page.root.querySelector('dialog[open]')) {
        event.preventDefault();
        inspectorOpen = false;
        syncInspector();
        toggle.focus({ preventScroll: true });
        return;
      }
      const target = event.target;
      if (event.defaultPrevented || event.code !== 'Space' || !(target instanceof HTMLElement)) return;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName)) return;
      event.preventDefault();
      setPaused(!paused);
    }, { signal: page.signal });
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });

    try {
      artwork = createArtwork({
        container: canvasHost,
        controls,
        signal: page.signal,
        reducedMotion: context.reducedMotion,
        report(message) { if (!page.signal.aborted) status.textContent = message; },
      });
      page.onCleanup(artwork.destroy);
      play.disabled = false;
      reset.disabled = !artwork.reset;
      reset.hidden = !artwork.reset;
      setPaused(paused);
    } catch (error) {
      page.destroy();
      throw error;
    }
    return { destroy: page.destroy, setPaused, reset: artwork.reset };
  };
}
