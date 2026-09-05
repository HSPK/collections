import './style.css';
import { copyText, createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { catalogEntry, exhibits, fictionNotice, fullCatalog, roomFor, rooms } from './data';
import type { Exhibit, RoomId } from './data';
import { renderDiagram } from './diagrams';

type RoomFilter = RoomId | 'all';

function objectFigure(exhibit: Exhibit, instance: string): string {
  return `
    <figure class="museum-object-figure">
      <div class="museum-drawing-sheet">
        <div class="museum-study-label" aria-hidden="true">
          <span>${escapeMarkup(exhibit.accession)}</span><span>Object study / Not to scale</span>
        </div>
        ${renderDiagram(exhibit.id, exhibit.title, instance)}
      </div>
      <figcaption>${escapeMarkup(exhibit.caption)}</figcaption>
    </figure>`;
}

function exhibitLabel(exhibit: Exhibit, index: number): string {
  const room = roomFor(exhibit.room);
  const layout = index === 0 ? ' museum-object--lead'
    : index % 3 === 0 ? ` museum-object--wide${index % 2 === 0 ? ' museum-object--reverse' : ''}` : '';
  return `
    <article class="museum-object${layout}" data-exhibit="${exhibit.id}"
      aria-labelledby="museum-object-${exhibit.id}">
      ${objectFigure(exhibit, 'gallery')}
      <div class="museum-wall-label">
        <p class="museum-kicker">${escapeMarkup(exhibit.accession)} <span aria-hidden="true">/</span> Room ${room.number}</p>
        <h3 id="museum-object-${exhibit.id}">${escapeMarkup(exhibit.title)}</h3>
        <p class="museum-object-kind">${escapeMarkup(exhibit.classification)}</p>
        <p class="museum-label-summary">${escapeMarkup(exhibit.summary)}</p>
        <p class="museum-object-origin">Imagined object, ${escapeMarkup(exhibit.imaginedDate)}<br>
          <span>${escapeMarkup(exhibit.maker)} (invented)</span>
        </p>
        <button class="museum-story-button" type="button" data-open-object="${exhibit.id}"
          aria-haspopup="dialog" aria-controls="museum-object-dialog">
          Read the story<span class="museum-sr-only"> of ${escapeMarkup(exhibit.title)}</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </article>`;
}

function detailMarkup(exhibit: Exhibit, position: number, total: number, filterName: string): string {
  const room = roomFor(exhibit.room);
  return `
    <div class="museum-detail-content">
      <header class="museum-detail-heading">
        <p class="museum-kicker">Room ${room.number} / ${escapeMarkup(room.name)}</p>
        <h2 id="museum-dialog-title" tabindex="-1">${escapeMarkup(exhibit.title)}</h2>
        <p class="museum-fiction-tag">Speculative object &mdash; not a historical artifact</p>
      </header>
      <div class="museum-detail-overview">
        ${objectFigure(exhibit, 'detail')}
        <div class="museum-detail-label">
          <p class="museum-detail-summary" id="museum-dialog-summary">${escapeMarkup(exhibit.summary)}</p>
          <dl class="museum-object-facts">
            <div><dt>Accession</dt><dd>${escapeMarkup(exhibit.accession)}</dd></div>
            <div><dt>Invented maker</dt><dd>${escapeMarkup(exhibit.maker)}</dd></div>
            <div><dt>Imagined date</dt><dd>${escapeMarkup(exhibit.imaginedDate)}</dd></div>
            <div><dt>Proposed size</dt><dd>${escapeMarkup(exhibit.dimensions)}</dd></div>
            <div><dt>Classification</dt><dd>${escapeMarkup(exhibit.classification)}</dd></div>
          </dl>
        </div>
      </div>
      <div class="museum-detail-reading">
        <section aria-labelledby="museum-story-heading" class="museum-story">
          <h3 id="museum-story-heading">The object story</h3>
          ${exhibit.story.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}
          <div class="museum-care-note">
            <h4>Care, in principle</h4>
            <p>${escapeMarkup(exhibit.care)}</p>
          </div>
        </section>
        <aside class="museum-detail-record" aria-label="Imagined object record">
          <h3>Imagined provenance</h3>
          <p>${escapeMarkup(exhibit.provenance)}</p>
          <h3>Materials, proposed</h3>
          <dl class="museum-material-list">
            ${exhibit.materials.map((material) => `
              <div><dt>${escapeMarkup(material.name)}</dt><dd>${escapeMarkup(material.note)}</dd></div>
            `).join('')}
          </dl>
        </aside>
      </div>
      <div class="museum-question">
        <p class="museum-kicker">A question to take away</p>
        <p>${escapeMarkup(exhibit.question)}</p>
      </div>
      <section class="museum-entry-tools" aria-labelledby="museum-keep-entry">
        <div>
          <h3 id="museum-keep-entry">Keep this entry</h3>
          <p>The complete story, provenance, and notes as plain text. Drawings are not included.</p>
        </div>
        <div class="museum-actions">
          <button class="museum-button museum-button--solid" type="button" data-museum-action="download-entry">
            Download entry (.txt) <span aria-hidden="true">&darr;</span>
          </button>
          <button class="museum-button" type="button" data-museum-action="copy-entry">Copy entry</button>
        </div>
        <p class="museum-feedback" data-museum-feedback role="status" aria-live="polite"></p>
      </section>
      <p class="museum-detail-disclaimer">${escapeMarkup(fictionNotice)}</p>
      <nav class="museum-object-navigation" aria-label="Exhibit navigation">
        <button class="museum-button" type="button" data-museum-action="previous-object" ${position === 0 ? 'disabled' : ''}>
          <span aria-hidden="true">&larr;</span> Previous object
        </button>
        <p>${position + 1} of ${total}<span>${escapeMarkup(filterName)}</span></p>
        <button class="museum-button" type="button" data-museum-action="next-object" ${position === total - 1 ? 'disabled' : ''}>
          Next object <span aria-hidden="true">&rarr;</span>
        </button>
      </nav>
    </div>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'museum');
  const { root, signal } = page;
  let selectedRoom: RoomFilter = 'all';
  let visibleExhibits = [...exhibits];
  let activeExhibit: Exhibit | undefined;
  let opener: HTMLButtonElement | undefined;

  root.innerHTML = `
    <a class="museum-skip" href="#museum-collection">Skip to the collection</a>
    <div class="museum-shell">
      <header class="museum-masthead" id="museum-top">
        <div class="museum-brand">
          <svg class="museum-mark" viewBox="0 0 72 84" aria-hidden="true" focusable="false">
            <path d="M0 0h72v84H0Z" fill="currentColor"/>
            <g fill="none" stroke="#f4efe3" stroke-width="1.5">
              <path d="M19 62h34v7H19Z M15 62l8-8h26l8 8"/>
              <path d="M26 48V24h20v24Z" stroke-dasharray="3 4"/>
              <path d="M36 14v8m-4-4h8M29 42l14-12"/>
            </g>
          </svg>
          <div>
            <p class="museum-kicker">A fictional museum of impossible design</p>
            <h1>The Museum of<br>Unmade Things</h1>
          </div>
        </div>
        <div class="museum-masthead-note">
          <p class="museum-kicker">Collection 01</p>
          <p>A fictional museum.<br>For very real human needs.</p>
        </div>
      </header>
      <nav class="museum-nav" aria-label="Museum navigation">
        <div>
          <a href="#museum-collection">The collection</a>
          <a href="#museum-curatorial">Curator's note</a>
          <a href="#museum-catalog">Take a catalog</a>
        </div>
        <span>Speculative design / Reading room</span>
      </nav>

      <section id="museum-collection" class="museum-collection" aria-labelledby="museum-collection-heading">
        <header class="museum-collection-intro">
          <div>
            <p class="museum-kicker">On view / Permanent, in principle</p>
            <h2 id="museum-collection-heading">The permanent collection</h2>
          </div>
          <p>Ten imagined tools for very real needs. Each has a story, a purpose,
            and one impossible material. Begin anywhere.</p>
        </header>
        <div class="museum-room-toolbar">
          <p class="museum-kicker" id="museum-room-label">Choose a room</p>
          <div class="museum-room-filters" role="group" aria-labelledby="museum-room-label">
            <button class="museum-room-filter" type="button" data-museum-room="all" aria-pressed="true"
              aria-label="All rooms, ${exhibits.length} objects">
              All rooms <span class="museum-room-count">${exhibits.length}</span>
            </button>
            ${rooms.map((room) => {
              const count = exhibits.filter((exhibit) => exhibit.room === room.id).length;
              return `
                <button class="museum-room-filter" type="button" data-museum-room="${room.id}" aria-pressed="false"
                  aria-label="${escapeMarkup(room.name)}, ${count} objects">
                  <span class="museum-room-number" aria-hidden="true">${room.number}</span>
                  ${escapeMarkup(room.shortName)}
                  <span class="museum-room-count">${count}</span>
                </button>`;
            }).join('')}
          </div>
        </div>
        <div class="museum-gallery-meta">
          <div>
            <p class="museum-current-room" data-museum-room-title>All four rooms</p>
            <p class="museum-room-description" data-museum-room-description hidden></p>
          </div>
          <p class="museum-results" data-museum-results role="status" aria-live="polite" aria-atomic="true">
            ${exhibits.length} imagined objects on view
          </p>
        </div>
        <div class="museum-gallery" data-museum-gallery data-project-preview>
          ${visibleExhibits.map(exhibitLabel).join('')}
        </div>
      </section>

      <section id="museum-curatorial" class="museum-curatorial" aria-labelledby="museum-curatorial-heading">
        <div class="museum-note-title">
          <p class="museum-kicker">From the curatorial desk</p>
          <h2 id="museum-curatorial-heading">Why keep what<br>cannot be made?</h2>
          <p class="museum-note-number" aria-hidden="true">Note / 001</p>
        </div>
        <div class="museum-note-prose">
          <p>These objects begin with small needs that ordinary design cannot quite reach: a little distance without
            departure, a pause without an excuse, a repair that does not have to disappear. Their impossibility is
            a way of making the need visible, not a claim that a machine can resolve it.</p>
          <p>The collection favors modest tools over grand solutions. Each drawing borrows the visual language
            of a practical object, then leaves one essential material impossible. Read the proposed use, question
            it, and keep only what is useful.</p>
          <blockquote><p>The need is real. The object is not.</p></blockquote>
          <p class="museum-note-fiction">There is no physical museum behind this website. Its makers, dates, and
            acquisitions are invented parts of the stories, not overlooked chapters of design history.</p>
        </div>
      </section>

      <section id="museum-catalog" class="museum-catalog" aria-labelledby="museum-catalog-heading">
        <div class="museum-catalog-title">
          <p class="museum-kicker">The reading edition</p>
          <h2 id="museum-catalog-heading">Take the collection<br>with you.</h2>
          <p>A plain-text catalog, not a mailing list. Keep it, annotate it, or leave it open beside an ordinary object.</p>
        </div>
        <div class="museum-catalog-copy">
          <dl class="museum-catalog-contents">
            <div><dt>Inside</dt><dd>All ${exhibits.length} object stories, wall labels, imagined provenance, and material notes.</dd></div>
            <div><dt>Format</dt><dd>A .txt file, readable offline. Drawings are not included.</dd></div>
            <div><dt>Scope</dt><dd>The whole collection, regardless of the room currently on view.</dd></div>
          </dl>
          <div class="museum-actions">
            <button class="museum-button museum-button--solid" type="button" data-museum-action="download-catalog">
              Download full catalog (.txt) <span aria-hidden="true">&darr;</span>
            </button>
            <button class="museum-button" type="button" data-museum-action="copy-catalog">Copy full catalog</button>
          </div>
          <p class="museum-feedback" data-museum-feedback role="status" aria-live="polite"></p>
        </div>
      </section>
      <footer class="museum-footer">
        <p class="museum-footer-name">MU / Unmade, not unconsidered.</p>
        <p>${escapeMarkup(fictionNotice)}</p>
        <a href="#museum-top">Back to the entrance <span aria-hidden="true">&uarr;</span></a>
      </footer>
    </div>
    <dialog class="museum-dialog" id="museum-object-dialog" aria-labelledby="museum-dialog-title"
      aria-describedby="museum-dialog-summary">
      <div class="museum-dialog-bar">
        <span class="museum-kicker" data-museum-dialog-accession>Imagined object record</span>
        <button class="museum-close-button" type="button" data-museum-action="close-detail" aria-label="Close exhibit detail">
          Close <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div data-museum-detail></div>
    </dialog>`;

  const gallery = query<HTMLDivElement>(root, '[data-museum-gallery]');
  const dialog = query<HTMLDialogElement>(root, '.museum-dialog');
  const detail = query<HTMLDivElement>(root, '[data-museum-detail]');
  const resultText = query<HTMLParagraphElement>(root, '[data-museum-results]');

  function report(message: string): void {
    if (signal.aborted) return;
    page.report(message);
    root.querySelectorAll<HTMLElement>('[data-museum-feedback]').forEach((element) => {
      element.textContent = message;
    });
  }

  function chooseRoom(room: RoomFilter): void {
    selectedRoom = room;
    visibleExhibits = room === 'all' ? [...exhibits] : exhibits.filter((exhibit) => exhibit.room === room);
    gallery.innerHTML = visibleExhibits.map(exhibitLabel).join('');
    root.querySelectorAll<HTMLButtonElement>('[data-museum-room]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.museumRoom === room));
    });
    query(root, '[data-museum-room-title]').textContent = room === 'all' ? 'All four rooms'
      : `Room ${roomFor(room).number} / ${roomFor(room).name}`;
    const roomDescription = query<HTMLParagraphElement>(root, '[data-museum-room-description]');
    roomDescription.hidden = room === 'all';
    roomDescription.textContent = room === 'all' ? '' : roomFor(room).introduction;
    query(root, '.museum-gallery-meta').classList.toggle('museum-gallery-meta--filtered', room !== 'all');
    resultText.textContent = `${visibleExhibits.length} imagined objects on view${room === 'all' ? '' : ` in ${roomFor(room).name}`}`;
  }

  function showObject(exhibit: Exhibit, trigger?: HTMLButtonElement): void {
    if (trigger) opener = trigger;
    activeExhibit = exhibit;
    const position = visibleExhibits.findIndex((item) => item.id === exhibit.id);
    detail.innerHTML = detailMarkup(exhibit, position, visibleExhibits.length,
      selectedRoom === 'all' ? 'All rooms' : roomFor(selectedRoom).name);
    query(root, '[data-museum-dialog-accession]').textContent = `${exhibit.accession} / Imagined object record`;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    query<HTMLElement>(detail, '#museum-dialog-title').focus({ preventScroll: true });
  }

  async function exportText(scope: 'entry' | 'catalog', method: 'copy' | 'download'): Promise<void> {
    if (scope === 'entry' && !activeExhibit) {
      report('Open an object story before keeping an entry.');
      return;
    }
    const text = scope === 'entry' && activeExhibit ? catalogEntry(activeExhibit) : fullCatalog();
    const filename = scope === 'entry' && activeExhibit
      ? `museum-of-unmade-things-${activeExhibit.id}.txt`
      : 'museum-of-unmade-things-catalog.txt';
    try {
      if (method === 'copy') {
        await copyText(text, (message) => report(`${message}${message === 'Copied to your clipboard.' ? '' : ' The download button is another way to keep the text.'}`));
        return;
      }
      downloadText(filename, text);
      report(scope === 'entry' ? 'Your complete object entry is ready to save as a text file.'
        : `Your complete ${exhibits.length}-object catalog is ready to save as a text file.`);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      report(method === 'copy' ? 'This browser could not copy the text. Use the download button to keep it instead.'
        : 'This browser could not prepare the download. Try copying the text instead.');
    }
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const requestedRoom = button.dataset.museumRoom;
    if (requestedRoom === 'all') {
      chooseRoom('all');
      return;
    }
    const room = rooms.find((candidate) => candidate.id === requestedRoom);
    if (room) {
      chooseRoom(room.id);
      return;
    }
    const requestedObject = button.dataset.openObject;
    if (requestedObject) {
      const exhibit = visibleExhibits.find((item) => item.id === requestedObject);
      if (exhibit) showObject(exhibit, button);
      return;
    }
    switch (button.dataset.museumAction) {
      case 'close-detail':
        dialog.close();
        break;
      case 'previous-object':
      case 'next-object': {
        const currentIndex = visibleExhibits.findIndex((item) => item.id === activeExhibit?.id);
        const offset = button.dataset.museumAction === 'next-object' ? 1 : -1;
        const next = visibleExhibits[currentIndex + offset];
        if (next) showObject(next);
        break;
      }
      case 'download-entry':
        void exportText('entry', 'download');
        break;
      case 'copy-entry':
        void exportText('entry', 'copy');
        break;
      case 'download-catalog':
        void exportText('catalog', 'download');
        break;
      case 'copy-catalog':
        void exportText('catalog', 'copy');
        break;
    }
  }, { signal });

  dialog.addEventListener('close', () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = undefined;
    activeExhibit = undefined;
  }, { signal });

  page.onCleanup(() => {
    opener = undefined;
    if (dialog.open) dialog.close();
  });

  return { destroy: page.destroy };
}
