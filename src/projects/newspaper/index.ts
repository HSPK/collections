import './style.css';
import { createProjectPage, query, readLocalData, writeLocalData } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { getStory, stories } from './data';
import { readRoute, routeTitle } from './routes';
import { renderShell, renderView } from './views';

interface ReaderState {
  version: 1;
  saved: string[];
  largeType: boolean;
}

const storageKey = 'signals-from-2086:reader:v1';

function isReaderState(value: unknown): value is ReaderState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && typeof candidate.largeType === 'boolean'
    && Array.isArray(candidate.saved)
    && candidate.saved.length <= stories.length
    && candidate.saved.every((id: unknown) => typeof id === 'string' && getStory(id) !== undefined)
    && new Set(candidate.saved).size === candidate.saved.length;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'newspaper');
  page.root.lang = 'en';
  page.root.innerHTML = renderShell();

  const content = query<HTMLElement>(page.root, '[data-content]');
  const status = query<HTMLElement>(page.root, '[data-reader-status]');
  const typeButton = query<HTMLButtonElement>(page.root, '[data-toggle-size]');
  const savedCount = query<HTMLElement>(page.root, '[data-saved-count]');
  const originalDocumentTitle = document.title;
  let documentTitle = originalDocumentTitle;

  const notify = (message: string) => {
    status.textContent = message;
    status.hidden = false;
    page.report(message);
  };

  const state = readLocalData(storageKey, isReaderState, notify)
    ?? { version: 1 as const, saved: [], largeType: false };
  let route = readRoute(window.location.hash);

  function updateReaderControls() {
    page.root.dataset.type = state.largeType ? 'large' : 'standard';
    savedCount.textContent = String(state.saved.length);
    typeButton.setAttribute('aria-pressed', String(state.largeType));
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-save]:not([data-remove])')) {
      const isSaved = state.saved.includes(button.dataset.save ?? '');
      button.textContent = isSaved ? 'Saved to reading list' : 'Save for later';
      button.setAttribute('aria-pressed', String(isSaved));
    }
  }

  function focusHeading() {
    const heading = query<HTMLElement>(content, '[data-route-heading]');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function render(focus = false) {
    content.innerHTML = renderView(route, state.saved);
    page.root.dataset.view = route.kind;
    const activeNav = route.kind === 'article' ? route.story.section
      : route.kind === 'section' ? route.section.id : route.kind;
    for (const link of page.root.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
      if (link.dataset.nav === activeNav) {
        link.setAttribute('aria-current', route.kind === 'article' ? 'location' : 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    documentTitle = `${routeTitle(route)} — Signals from 2086 · Fiction`;
    document.title = documentTitle;
    updateReaderControls();
    if (focus) focusHeading();
  }

  function toggleSaved(id: string) {
    const story = getStory(id);
    if (!story) return;
    const previousIndex = state.saved.indexOf(id);
    const wasSaved = previousIndex !== -1;
    state.saved = wasSaved ? state.saved.filter((savedId) => savedId !== id) : [...state.saved, id];
    const persisted = writeLocalData(storageKey, state, notify);

    if (route.kind === 'saved') {
      render();
      const remainingButtons = content.querySelectorAll<HTMLButtonElement>('[data-remove]');
      const nextButton = remainingButtons[Math.min(Math.max(0, previousIndex), remainingButtons.length - 1)];
      if (nextButton) nextButton.focus();
      else focusHeading();
    } else {
      updateReaderControls();
    }

    if (persisted) {
      notify(wasSaved
        ? `Removed “${story.title}” from your reading list.`
        : `Saved “${story.title}” to your reading list on this device.`);
    }
  }

  page.root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || event.defaultPrevented) return;
    const control = event.target.closest<HTMLElement>('a[href^="#"], button[data-save], button[data-toggle-size], button[data-print]');
    if (!control || !page.root.contains(control)) return;

    if (control instanceof HTMLAnchorElement) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (control.hasAttribute('data-skip') || control.hash === window.location.hash) {
        event.preventDefault();
        focusHeading();
      }
      return;
    }

    if (control.dataset.save) {
      toggleSaved(control.dataset.save);
    } else if (control.hasAttribute('data-toggle-size')) {
      state.largeType = !state.largeType;
      updateReaderControls();
      if (writeLocalData(storageKey, state, notify)) {
        notify(`${state.largeType ? 'Larger' : 'Standard'} reading type selected and saved on this device.`);
      }
    } else if (control.hasAttribute('data-print')) {
      try {
        window.print();
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        notify('Printing is unavailable in this browser. You can still select and copy the story text.');
      }
    }
  }, { signal: page.signal });

  window.addEventListener('hashchange', () => {
    // The collection's skip link is an anchor, not a request for a different story.
    if (window.location.hash === '#main-content' || window.location.hash === '#nw-content') {
      focusHeading();
      return;
    }
    route = readRoute(window.location.hash);
    render(true);
  }, { signal: page.signal });

  page.onCleanup(() => {
    if (document.title === documentTitle) document.title = originalDocumentTitle;
  });

  render();
  return { destroy: page.destroy };
}
