import '../styles/art-sites.css';
import { parseManifest } from './manifest';
import { createProjectPage, escapeMarkup, query } from './page';
import type { ExperimentContext, ExperimentInstance, ProjectContext, ProjectInstance } from './types';

export function defineArtSite(
  manifest: unknown,
  createArtwork: (context: ExperimentContext) => ExperimentInstance,
): (context: ProjectContext) => ProjectInstance {
  const identity = parseManifest(manifest);
  return (context) => {
    const page = createProjectPage(context, identity.id);
    page.root.classList.add('art-website');
    page.root.tabIndex = 0;
    page.root.setAttribute('aria-labelledby', `${identity.id}-site-title`);
    page.root.innerHTML = `
      <header class="art-site-header">
        <div class="art-brand"><p>${escapeMarkup(identity.medium)}</p><h1 id="${identity.id}-site-title">${escapeMarkup(identity.title)}</h1></div>
        <p class="art-subtitle">${escapeMarkup(identity.subtitle)}</p>
        <button class="art-notes-button" type="button" data-open-art-notes>Studio notes <span aria-hidden="true">+</span></button>
      </header>
      <div class="art-workbench" data-project-preview>
        <div class="art-stage" data-art-stage style="background:${identity.color};color:${identity.ink}"></div>
        <aside class="art-inspector" aria-label="${escapeMarkup(identity.title)} studio controls">
          <div class="art-transport">
            <button class="art-play-button" type="button" data-art-play disabled></button>
            <button class="art-reset-button" type="button" data-art-reset disabled>Reset</button>
          </div>
          <div class="art-controls experiment-controls" data-controls></div>
          <p class="art-status" role="status" aria-live="polite" data-art-report>${escapeMarkup(identity.instruction)}</p>
          <details class="art-notes" data-art-notes>
            <summary>About this study</summary>
            <p>${escapeMarkup(identity.description)}</p>
            <p>Use the studio controls or explore the artwork directly. Space pauses motion when the studio is focused, unless the artwork has its own shortcut.</p>
            <div class="art-tags">${identity.tags.map((tag) => `<span>${escapeMarkup(tag)}</span>`).join('')}</div>
          </details>
        </aside>
      </div>`;

    const canvasHost = query<HTMLElement>(page.root, '[data-art-stage]');
    const controls = query<HTMLElement>(page.root, '[data-controls]');
    const status = query<HTMLElement>(page.root, '[data-art-report]');
    const play = query<HTMLButtonElement>(page.root, '[data-art-play]');
    const reset = query<HTMLButtonElement>(page.root, '[data-art-reset]');
    const notes = query<HTMLDetailsElement>(page.root, '[data-art-notes]');
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
    page.root.querySelector('[data-open-art-notes]')?.addEventListener('click', () => {
      notes.open = !notes.open;
      if (notes.open) {
        notes.querySelector('summary')?.focus({ preventScroll: true });
        notes.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    }, { signal: page.signal });
    page.root.addEventListener('keydown', (event) => {
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
