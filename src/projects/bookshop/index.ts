import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query, readLocalData, writeLocalData } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { BOOKS, FACTS, SCENES } from './data';
import type { Choice, FactId, ShelfBook } from './data';
import {
  BOOKMARK_KEY, MAX_STEPS, bookmarkFor, choiceReason, currentFrame, getScene,
  isBookmark, journeyText, meetsCondition, newJourney, paragraphsFor,
  restoreBookmark, rewindJourney, takeChoice,
} from './engine';

const text = escapeMarkup;

function spine(book: ShelfBook): string {
  return `<button type="button" class="bs-spine bs-binding-${book.binding}" data-book="${text(book.id)}"
    aria-label="Examine ${text(book.title)}, by ${text(book.author)}">
    <span class="bs-spine-title">${text(book.shortTitle)}</span>
    <span class="bs-spine-author">${text(book.author)}</span>
    <span class="bs-shelfmark" aria-hidden="true">${text(book.shelfmark)}</span>
  </button>`;
}

function factList(ids: readonly FactId[]): string {
  return `<ul class="bs-fact-list">${ids.map((id) => `<li>
    <span class="bs-fact-name">${text(FACTS[id].label)}</span>
    <span class="bs-fact-detail">${text(FACTS[id].detail)}</span>
  </li>`).join('')}</ul>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'bookshop');
  page.root.innerHTML = `
    <div class="bs-house">
      <header class="bs-masthead">
        <div class="bs-wordmark">
          <p class="bs-address">No. 6, Bellwether Lane <span aria-hidden="true">&middot;</span> Open until the last page</p>
          <h1>The Last <em>Bookshop</em></h1>
          <p class="bs-invitation">Come in out of the rain. There is a chair for you.</p>
        </div>
        <nav class="bs-navigation" aria-label="Bookshop">
          <a href="#bookshop-shelves">The shelves</a>
          <a href="#bookshop-chapter">Your chapter</a>
          <button type="button" data-action="bookmark">Your bookmark <span aria-hidden="true">&#8599;</span></button>
        </nav>
      </header>

      <div class="bs-room" data-project-preview>
        <aside class="bs-cabinet" aria-label="The shelves and your coat pocket">
          <section class="bs-shelves" id="bookshop-shelves" tabindex="-1" aria-labelledby="bookshop-shelf-title">
            <div class="bs-shelf-heading">
              <h2 id="bookshop-shelf-title">On the shelves</h2>
              <span>Six well-handled volumes</span>
            </div>
            <div class="bs-bookcase" role="group" aria-label="Six books. Select a spine to read its jacket and an excerpt.">
              <div class="bs-shelf-row">${BOOKS.slice(0, 3).map(spine).join('')}</div>
              <div class="bs-shelf-row">${BOOKS.slice(3).map(spine).join('')}</div>
            </div>
            <p class="bs-shelf-caption">Touch a spine. Read a little of what is inside.<span class="bs-mobile-hint"> The shelf scrolls sideways.</span></p>
          </section>

          <details class="bs-pocket">
            <summary>Your coat pocket <span class="bs-pocket-count" data-pocket-count>0 keepsakes</span></summary>
            <div class="bs-pocket-content" data-pocket></div>
          </details>

          <div class="bs-lamplight">
            <svg viewBox="0 0 180 130" width="180" height="130" aria-hidden="true" focusable="false">
              <ellipse cx="90" cy="117" rx="63" ry="8" fill="currentColor" opacity=".10"/>
              <path d="M87 43h6v65h-6zM65 108h50l9 8H56z" fill="currentColor" opacity=".8"/>
              <path d="M65 13h50l24 40H41z" fill="currentColor" opacity=".8"/>
              <path d="M41 53h98M89 8h3M130 53v27" fill="none" stroke="currentColor" stroke-width="3"/>
              <circle cx="130" cy="83" r="3" fill="currentColor"/>
            </svg>
            <p>The lamp is on.<br>There is no need to hurry.</p>
          </div>
        </aside>

        <div class="bs-desk">
          <article class="bs-paper" id="bookshop-chapter" aria-labelledby="bookshop-chapter-title" tabindex="-1"></article>
          <nav class="bs-page-controls" aria-label="Reading controls">
            <button type="button" data-action="back"><span aria-hidden="true">&larr;</span> Previous chapter</button>
            <button type="button" data-action="bookmark">Bookmark &amp; journey</button>
          </nav>
          <p class="bs-status" role="status" aria-live="polite" aria-atomic="true" data-status></p>
        </div>
      </div>

      <footer class="bs-footer">
        <div>
          <p>Original interactive fiction. The shop, its people, books, and authors are all invented.</p>
          <p data-storage-note>Your place is remembered only in this browser. Nothing is sent anywhere.</p>
        </div>
        <button type="button" data-action="restart">Begin a new visit</button>
      </footer>
      <dialog class="bs-dialog" aria-labelledby="bookshop-dialog-title"></dialog>
    </div>`;

  const chapter = query<HTMLElement>(page.root, '#bookshop-chapter');
  const pocket = query<HTMLElement>(page.root, '[data-pocket]');
  const pocketCount = query<HTMLElement>(page.root, '[data-pocket-count]');
  const pocketDetails = query<HTMLDetailsElement>(page.root, '.bs-pocket');
  const status = query<HTMLElement>(page.root, '[data-status]');
  const storageNote = query<HTMLElement>(page.root, '[data-storage-note]');
  const backButton = query<HTMLButtonElement>(page.root, '[data-action="back"]');
  const dialog = query<HTMLDialogElement>(page.root, '.bs-dialog');
  pocketDetails.open = window.matchMedia('(min-width: 861px)').matches;

  const report = (message: string) => {
    status.textContent = message;
    const dialogStatus = dialog.querySelector<HTMLElement>('[data-dialog-status]');
    if (dialogStatus) dialogStatus.textContent = message;
    page.report(message);
  };
  const saved = readLocalData(BOOKMARK_KEY, isBookmark, report);
  let journey = saved ? restoreBookmark(saved) ?? newJourney() : newJourney();
  let canSave = true;

  function persist(): boolean {
    canSave = writeLocalData(BOOKMARK_KEY, bookmarkFor(journey), report);
    storageNote.textContent = canSave
      ? 'Your place is remembered only in this browser. Nothing is sent anywhere.'
      : 'This browser could not remember your place. Keep this page open, or download your journey.';
    return canSave;
  }

  function choicesMarkup(choices: readonly Choice[]): string {
    const frame = currentFrame(journey);
    const visible = choices.filter((choice) => !choice.hideWhenUnavailable || meetsCondition(frame, choice.when));
    const groups = [...new Set(visible.map((choice) => choice.group ?? 'Turn the page'))];
    return `<div class="bs-choices">${groups.map((group) => `
      <section class="bs-choice-group" aria-label="${text(group)}">
        <h3>${text(group)}</h3>
        <ul>${visible.filter((choice) => (choice.group ?? 'Turn the page') === group).map((choice) => {
          const reason = choiceReason(frame, choice);
          const reasonId = `bookshop-reason-${choice.id}`;
          return `<li class="${reason ? 'bs-choice-locked' : ''}">
            <button type="button" class="bs-choice" data-choice="${text(choice.id)}"
              ${reason ? `disabled aria-describedby="${text(reasonId)}"` : ''}>
              <span class="bs-choice-label">${text(choice.label)}</span>
              <span class="bs-choice-arrow" aria-hidden="true">${reason ? '&mdash;' : '&rarr;'}</span>
              ${choice.note ? `<span class="bs-choice-note">${text(choice.note)}</span>` : ''}
            </button>
            ${reason ? `<p class="bs-requirement" id="${text(reasonId)}"><strong>Not open.</strong> ${text(reason)}</p>` : ''}
          </li>`;
        }).join('')}</ul>
      </section>`).join('')}</div>`;
  }

  function render(focusChapter = false): void {
    const frame = currentFrame(journey);
    const scene = getScene(frame.scene);
    chapter.dataset.scene = scene.id;
    chapter.innerHTML = `
      <header class="bs-chapter-heading">
        <p class="bs-running-head"><span>${text(scene.place)}</span><span>Page ${String(journey.frames.length).padStart(2, '0')}</span></p>
        ${scene.ending ? `<p class="bs-ending-kicker">Ending ${text(scene.ending.number)} of III</p>` : ''}
        <h2 id="bookshop-chapter-title" tabindex="-1">${text(scene.title)}</h2>
        <div class="bs-ornament" aria-hidden="true"><span></span>&#10022;<span></span></div>
      </header>
      <div class="bs-prose">${paragraphsFor(frame).map((paragraph) => `<p>${text(paragraph)}</p>`).join('')}</div>
      ${scene.ending ? `
        <section class="bs-ending-note" aria-label="The consequence of your ending">
          <p class="bs-ending-name">${text(scene.ending.name)}</p>
          <p>${text(scene.ending.consequence)}</p>
          <p class="bs-ending-invitation">One of three possible endings. The books you read and the things you carried made this visit yours.</p>
          <button type="button" class="bs-ink-button" data-action="bookmark">Keep this journey</button>
          <button type="button" class="bs-text-button" data-action="restart">Begin another visit</button>
        </section>` : choicesMarkup(scene.choices)}
      <div class="bs-paper-foot" aria-hidden="true">THE LAST BOOKSHOP <span>&middot;</span> ${String(journey.frames.length).padStart(2, '0')}</div>`;

    const items = frame.facts.filter((id) => FACTS[id].kind === 'item');
    const discoveries = frame.facts.filter((id) => FACTS[id].kind === 'discovery');
    pocketCount.textContent = `${items.length} ${items.length === 1 ? 'keepsake' : 'keepsakes'}`;
    pocket.innerHTML = items.length ? factList(items)
      : '<p class="bs-empty-pocket">Nothing taken from the shelves yet. What you choose to carry will appear here.</p>';
    if (discoveries.length) {
      pocket.insertAdjacentHTML('beforeend', `<h3>Things you know</h3>${factList(discoveries)}`);
    }
    backButton.disabled = journey.steps.length === 0;
    backButton.title = journey.steps.length ? 'Rewind one chapter, including your pocket and discoveries.' : 'You are on the first page.';
    if (focusChapter) {
      const heading = query<HTMLHeadingElement>(chapter, '#bookshop-chapter-title');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

  function closeDialog(): void {
    if (dialog.open) dialog.close();
  }

  function openDialog(eyebrow: string, title: string, content: string): void {
    dialog.innerHTML = `
      <div class="bs-dialog-top">
        <p class="bs-dialog-eyebrow">${text(eyebrow)}</p>
        <button type="button" class="bs-dialog-close" data-action="close" aria-label="Close this bookshop window">Close <span aria-hidden="true">&times;</span></button>
      </div>
      <h2 id="bookshop-dialog-title" tabindex="-1">${text(title)}</h2>
      <p class="bs-dialog-status" data-dialog-status role="status" aria-live="polite" aria-atomic="true"></p>
      ${content}`;
    if (!dialog.open) dialog.showModal();
    query<HTMLHeadingElement>(dialog, '#bookshop-dialog-title').focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }

  function showBook(book: ShelfBook): void {
    const frame = currentFrame(journey);
    const choice = getScene(frame.scene).choices.find((candidate) =>
      candidate.target === book.scene && meetsCondition(frame, candidate.when));
    const readNote = frame.visited.includes(book.scene)
      ? 'You have opened this volume on your present path. To choose differently, rewind to it from your bookmark.'
      : 'A jacket is a glimpse, not a choice. Read into this book from the reading room to take something into your story.';
    openDialog(`From the shelves / ${book.shelfmark}`, book.title, `
      <p class="bs-book-author">by ${text(book.author)}</p>
      <p class="bs-book-jacket">${text(book.jacket)}</p>
      <div class="bs-book-excerpt"><h3>A passage from the book</h3>${book.excerpt.map((paragraph) => `<p>${text(paragraph)}</p>`).join('')}</div>
      <p class="bs-dialog-help">${text(readNote)}</p>
      <div class="bs-dialog-actions">
        ${choice ? `<button type="button" class="bs-ink-button" data-choice="${text(choice.id)}">Take this book to the table</button>`
          : '<button type="button" class="bs-ink-button" data-action="close">Return to your chapter</button>'}
        ${frame.visited.includes(book.scene) ? '<button type="button" class="bs-text-button" data-action="bookmark">Open your bookmark</button>' : ''}
      </div>`);
  }

  function showBookmark(): void {
    const scene = getScene(currentFrame(journey).scene);
    openDialog('The ribbon between the pages', 'Your bookmark', `
      <p class="bs-bookmark-place">You left the lamp on at <em>${text(scene.title)}</em>.</p>
      <p class="bs-dialog-help">${canSave
        ? 'Every choice is remembered in this browser, including this ending if you reach one. A new visit replaces this bookmark; a text copy is yours to keep.'
        : 'Browser storage is unavailable. Your journey still works in this open page. Keep a text copy before leaving.'}</p>
      <div class="bs-dialog-actions">
        <button type="button" class="bs-ink-button" data-action="download">Keep a text copy</button>
        <button type="button" class="bs-text-button" data-action="restart">Begin a new visit</button>
      </div>
      <h3 class="bs-history-heading">Turn back the pages</h3>
      <p class="bs-dialog-help" id="bookshop-history-warning">Returning to a page rewinds your pocket and discoveries too. All later pages will be removed from this bookmark.</p>
      <ol class="bs-history">${journey.frames.map((frame, index) => {
        const title = getScene(frame.scene).title;
        const current = index === journey.frames.length - 1;
        return `<li${current ? ' aria-current="step"' : ''}>
          <span class="bs-history-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
          <button type="button" data-return="${index}" aria-describedby="bookshop-history-warning"
            aria-label="${current ? 'Current page' : 'Return to page'} ${index + 1}: ${text(title)}" ${current ? 'disabled' : ''}>
            ${text(title)}${current ? '<span class="bs-history-current">You are here</span>' : ''}
          </button>
        </li>`;
      }).join('')}</ol>`);
  }

  function askRestart(): void {
    openDialog('Leave the door as you found it', 'Begin a new visit?', `
      <p class="bs-restart-copy">Your present bookmark, pocket, and discoveries will be cleared. You will return to the rain outside the door. Nothing from this visit will be carried into the next.</p>
      <p class="bs-dialog-help">If you want to keep this particular journey, take a text copy first.</p>
      <div class="bs-dialog-actions">
        <button type="button" class="bs-ink-button" data-action="confirm-restart">Yes, begin again</button>
        <button type="button" class="bs-text-button" data-action="close">Keep my place</button>
        <button type="button" class="bs-text-button" data-action="download">Keep a text copy</button>
      </div>`);
  }

  function choose(choiceId: string): void {
    const previous = currentFrame(journey);
    const next = takeChoice(journey, choiceId);
    if (!next) {
      report(journey.steps.length >= MAX_STEPS
        ? 'This bookmark has reached its page limit. Keep a text copy, then rewind or begin a new visit.'
        : 'That path is not open with your current pocket and discoveries.');
      return;
    }
    closeDialog();
    journey = next;
    const savedNow = persist();
    render(true);
    if (savedNow) {
      const frame = currentFrame(journey);
      const added = frame.facts.filter((id) => !previous.facts.includes(id));
      const removed = previous.facts.filter((id) => !frame.facts.includes(id));
      const changes = [
        added.length ? `Now with you: ${added.map((id) => FACTS[id].label).join('; ')}.` : '',
        removed.length ? `Put to use: ${removed.map((id) => FACTS[id].label).join('; ')}.` : '',
      ].filter(Boolean);
      report(changes.length ? `${changes.join(' ')} Your bookmark is saved.` : `Bookmarked at "${getScene(frame.scene).title}".`);
    }
  }

  function rewind(index: number): void {
    const restored = rewindJourney(journey, index);
    if (!restored) {
      report('That page is not in this journey.');
      return;
    }
    closeDialog();
    journey = restored;
    const savedNow = persist();
    render(true);
    if (savedNow) report('The page, your pocket, and your discoveries have been rewound. Later choices are no longer in this bookmark.');
  }

  page.root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('[data-action], [data-choice], [data-book], [data-return]');
    if (!control || !page.root.contains(control) || (control instanceof HTMLButtonElement && control.disabled)) return;
    if (control.dataset.choice !== undefined) {
      choose(control.dataset.choice);
      return;
    }
    if (control.dataset.book !== undefined) {
      const book = BOOKS.find((candidate) => candidate.id === control.dataset.book);
      if (book) showBook(book);
      return;
    }
    if (control.dataset.return !== undefined) {
      rewind(Number(control.dataset.return));
      return;
    }
    switch (control.dataset.action) {
      case 'close': closeDialog(); break;
      case 'bookmark': showBookmark(); break;
      case 'restart': askRestart(); break;
      case 'back': rewind(journey.frames.length - 2); break;
      case 'confirm-restart': {
        closeDialog();
        journey = newJourney();
        const savedNow = persist();
        render(true);
        if (savedNow) report('A new visit. Your pocket and history are empty; the lamp is still on.');
        break;
      }
      case 'download':
        try {
          downloadText('the-last-bookshop-journey.txt', journeyText(journey));
          report('Your text copy includes the chapters you read, your choices, and what you carried.');
        } catch (error) {
          if (!(error instanceof DOMException)) throw error;
          report('The browser could not start the download. Your journey is still available in this page.');
        }
        break;
    }
  }, { signal: page.signal });

  page.onCleanup(closeDialog);
  persist();
  render();
  if (!status.textContent) {
    status.textContent = saved && journey.steps.length
      ? 'Your remembered bookmark is open. You can continue, turn back, or begin a new visit.'
      : `${SCENES.length} original scenes. Three possible endings. Your choices, not a clock, turn the pages.`;
  }
  return { destroy: page.destroy };
}
