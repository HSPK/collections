import './style.css';
import {
  copyText,
  createProjectPage,
  downloadText,
  escapeMarkup,
  query,
  readLocalData,
  writeLocalData,
} from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { destinations, isDestinationId, isSavedLetters, letterWordCount, storageKey } from './data';
import type { DestinationId } from './data';
import { atlasMarkup } from './illustrations';
import { backMarkup, frontMarkup, letterText, postcardDocument, stopNumber } from './postcard';

const iconPaths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  previous: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  turn: '<path d="M5 9h10a5 5 0 0 1 0 10h-4M9 5 5 9l4 4"/>',
  keep: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="1"/><path d="M15 8V3H3v13h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  postcard: '<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M14 7v10M5 10h6m-6 4h4m8-6h2v3h-2Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  envelope: '<rect x="2" y="5" width="20" height="15" rx="1"/><path d="m2 6 10 8L22 6"/>',
  star: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/>',
};

function icon(name: keyof typeof iconPaths): string {
  return `<svg class="pp-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'postcards');
  const total = destinations.length;
  page.root.innerHTML = `
    <a class="pp-skip" href="#postcards-letter">Skip to the postcard</a>
    <div class="pp-shell">
      <header class="pp-masthead">
        <div class="pp-brand">
          <svg class="pp-brand-mark" viewBox="0 0 62 66" width="62" height="66" aria-hidden="true">
            <path d="M5 5h52v56H5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
            <path d="M10 10h42v46H10Z" fill="none" stroke="currentColor"/>
            <path d="M18 26h26v18H18Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="m18 26 13 10 13-10M31 15v7m-4-3h8" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M23 50h16" stroke="currentColor"/>
          </svg>
          <div>
            <p class="pp-brand-kicker">AN ATLAS OF CORRESPONDENCE</p>
            <h1>Letters from Elsewhere</h1>
          </div>
        </div>
        <nav class="pp-site-nav" aria-label="Letters from Elsewhere">
          <a href="#postcards-atlas">The atlas</a>
          <a href="#postcards-kept">Your satchel <span class="pp-nav-count" data-kept-count>0</span></a>
          <a href="#postcards-about">About the letters</a>
        </nav>
      </header>

      <div class="pp-introduction">
        <p>Eight places off the map. A little closer to home.</p>
        <span>${icon('star')} An imagined atlas &middot; Vol. 01</span>
      </div>

      <div class="pp-atlas-layout" data-project-preview>
        <section class="pp-reader" id="postcards-letter" aria-labelledby="postcards-letter-title">
          <div class="pp-reader-topline">
            <p class="pp-kicker" data-reader-stop>ON THE ROAD / 01 OF 08</p>
            <a class="pp-mobile-atlas-link" href="#postcards-atlas">Choose a place ${icon('arrow')}</a>
          </div>
          <header class="pp-reader-heading">
            <div>
              <h2 id="postcards-letter-title" tabindex="-1" data-letter-title></h2>
              <p class="pp-correspondents">From Mara, on the road. To Kit, at home.</p>
            </div>
            <div class="pp-postmark" aria-hidden="true">
              <span>ELSEWHERE POST</span>
              <strong>TAKE<br>YOUR TIME</strong>
              <span data-postmark-code>ROUTE / 01</span>
            </div>
          </header>
          <div class="pp-card-toolbar">
            <div class="pp-side-controls" role="group" aria-label="Postcard side">
              <button type="button" data-side="front" aria-pressed="true" aria-controls="postcards-front">${icon('postcard')} Picture side</button>
              <button type="button" data-side="back" aria-pressed="false" aria-controls="postcards-back">${icon('envelope')} Letter side</button>
            </div>
            <span class="pp-postcard-label">SENT WITH FEELING</span>
          </div>
          <div class="pp-postcard" role="group" aria-label="Selected postcard" data-postcard>
            <div id="postcards-front" class="pp-postcard-face" data-front></div>
            <div id="postcards-back" class="pp-postcard-face" data-back hidden></div>
          </div>
          <div class="pp-turn-row">
            <button class="pp-turn-button" type="button" data-action="turn" aria-controls="postcards-front postcards-back">
              ${icon('turn')} <span data-turn-label>Turn over &amp; read the letter</span>
            </button>
            <span class="pp-reading-length" data-reading-length></span>
          </div>
          <blockquote class="pp-letter-teaser" data-teaser>
            <p data-teaser-text></p>
            <cite>A line from the other side</cite>
          </blockquote>
          <div class="pp-letter-actions" role="group" aria-label="Keep or take this letter">
            <button class="pp-keep-button" type="button" data-action="keep" aria-pressed="false">
              ${icon('keep')} <span data-keep-label>Keep this letter</span>
            </button>
            <button type="button" data-action="copy">${icon('copy')} Copy letter</button>
            <button type="button" data-action="letter-download">${icon('download')} Save letter <span class="pp-file-type">.txt</span></button>
            <button type="button" data-action="postcard-download">${icon('postcard')} Save postcard <span class="pp-file-type">.html</span></button>
          </div>
          <p class="pp-status" role="status" aria-live="polite" aria-atomic="true" data-status></p>
          <dl class="pp-field-notes">
            <div><dt>Weather in the letter</dt><dd data-weather></dd></div>
            <div><dt>A local habit</dt><dd data-custom></dd></div>
          </dl>
          <nav class="pp-place-navigation" aria-label="Travel the postal route">
            <button type="button" data-action="previous" disabled>
              ${icon('previous')}
              <span><small>Previous place</small><strong data-previous-name>Start of the route</strong></span>
            </button>
            <span class="pp-route-position" data-route-position>01 / 08</span>
            <button type="button" data-action="next">
              <span><small>Next place</small><strong data-next-name></strong></span>
              ${icon('arrow')}
            </button>
          </nav>
        </section>

        <aside class="pp-route" id="postcards-atlas" aria-labelledby="postcards-atlas-title">
          <header class="pp-route-heading">
            <p class="pp-kicker">PICK A PLACE. FOLLOW A FEELING.</p>
            <h2 id="postcards-atlas-title">The elsewhere route</h2>
            <p>No wrong turns. No real coordinates.</p>
          </header>
          <div class="pp-map" role="group" aria-label="Choose a destination on the imagined map">
            ${atlasMarkup()}
            ${destinations.map((destination, index) => `
              <button class="pp-map-marker" type="button" style="left:${(destination.point.x / 420) * 100}%;top:${(destination.point.y / 300) * 100}%" data-place="${escapeMarkup(destination.id)}" aria-label="Visit ${escapeMarkup(destination.name)}, stop ${index + 1} of ${total}" aria-pressed="${index === 0}">
                <span>${stopNumber(index)}</span>
              </button>`).join('')}
          </div>
          <p class="pp-map-key"><span aria-hidden="true"></span> One meandering postal route</p>
          <nav id="postcards-directory" class="pp-directory" aria-label="Destination directory">
            <div class="pp-directory-heading"><span>THE DIRECTORY</span><span>${stopNumber(total - 1)} PLACES</span></div>
            <ol>
              ${destinations.map((destination, index) => `
                <li>
                  <button type="button" data-place="${escapeMarkup(destination.id)}" aria-pressed="${index === 0}">
                    <span class="pp-directory-number">${stopNumber(index)}</span>
                    <span class="pp-directory-name"><strong>${escapeMarkup(destination.name)}</strong><small>${escapeMarkup(destination.region)}</small></span>
                    <span class="pp-directory-kept" data-kept-marker="${escapeMarkup(destination.id)}" hidden>kept</span>
                    ${icon('arrow')}
                  </button>
                </li>`).join('')}
            </ol>
          </nav>
          <div class="pp-route-note">
            ${icon('envelope')}
            <p>Letters travel in route order.<br>You do not have to.</p>
          </div>
          <a class="pp-mobile-reader-link" href="#postcards-letter">Back to the postcard ${icon('arrow')}</a>
        </aside>
      </div>

      <section class="pp-satchel" id="postcards-kept" aria-labelledby="postcards-kept-title">
        <header>
          <p class="pp-kicker">FOR THE WAY BACK</p>
          <h2 id="postcards-kept-title" tabindex="-1">Your letter satchel <span data-kept-count>0</span></h2>
          <p data-storage-note>Saved only in this browser, on this device. No account, no syncing, no actual mail.</p>
        </header>
        <div class="pp-satchel-content">
          <p class="pp-satchel-empty" data-kept-empty>Your satchel is pleasantly light.<br><span>Use &ldquo;Keep this letter&rdquo; to tuck something away for another day.</span></p>
          <ul class="pp-kept-list" data-kept-list hidden></ul>
          <button class="pp-satchel-download" type="button" data-action="kept-download" disabled>${icon('download')} Save kept letters as .txt</button>
          <p class="pp-satchel-footnote">Downloads are yours to keep, even after you leave.</p>
        </div>
      </section>

      <section class="pp-about" id="postcards-about" aria-labelledby="postcards-about-title">
        <div>
          <p class="pp-kicker">A NOTE ON ELSEWHERE</p>
          <h2 id="postcards-about-title">Made-up places.<br>Room for real feelings.</h2>
        </div>
        <div class="pp-about-copy">
          <p>This is an illustrated work of fiction: eight places, eight original letters, and one traveler slowly finding her way home. Mara is writing to Kit. You are welcome to read over a shoulder.</p>
          <p>The geography, people, customs, weather, and postage are all imagined. There is no live mail, map, tracking, or delivery service here. Just a small invitation to take your time, turn something over, and see what is on the other side.</p>
        </div>
        <div class="pp-about-envelope" aria-hidden="true">
          <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 29h135v81H12Z" fill="#f8edda"/>
            <path d="m12 29 68 47 67-47M12 110l49-47m86 47-48-47"/>
            <path d="M116 40h19v24h-19Z" stroke-dasharray="2 2"/>
            <path d="M49 19 39 5m23 10L59 0m-22 29-18-5"/>
          </svg>
          <span>No postage necessary.</span>
        </div>
      </section>
      <footer class="pp-footer">
        <span>LETTERS FROM ELSEWHERE &middot; FIELD EDITION 01</span>
        <a href="#postcards-letter">Back to the postcard &uarr;</a>
      </footer>
    </div>`;

  const status = query<HTMLParagraphElement>(page.root, '[data-status]');
  const reader = query<HTMLElement>(page.root, '.pp-reader');
  const title = query<HTMLHeadingElement>(page.root, '[data-letter-title]');
  const readerStop = query<HTMLParagraphElement>(page.root, '[data-reader-stop]');
  const postmarkCode = query<HTMLElement>(page.root, '[data-postmark-code]');
  const postcard = query<HTMLDivElement>(page.root, '[data-postcard]');
  const front = query<HTMLDivElement>(page.root, '[data-front]');
  const back = query<HTMLDivElement>(page.root, '[data-back]');
  const teaser = query<HTMLQuoteElement>(page.root, '[data-teaser]');
  const teaserText = query<HTMLParagraphElement>(page.root, '[data-teaser-text]');
  const turnLabel = query<HTMLSpanElement>(page.root, '[data-turn-label]');
  const readingLength = query<HTMLSpanElement>(page.root, '[data-reading-length]');
  const keepButton = query<HTMLButtonElement>(page.root, '[data-action="keep"]');
  const keepLabel = query<HTMLSpanElement>(page.root, '[data-keep-label]');
  const copyButton = query<HTMLButtonElement>(page.root, '[data-action="copy"]');
  const previousButton = query<HTMLButtonElement>(page.root, '[data-action="previous"]');
  const nextButton = query<HTMLButtonElement>(page.root, '[data-action="next"]');
  const previousName = query<HTMLElement>(page.root, '[data-previous-name]');
  const nextName = query<HTMLElement>(page.root, '[data-next-name]');
  const routePosition = query<HTMLElement>(page.root, '[data-route-position]');
  const weather = query<HTMLElement>(page.root, '[data-weather]');
  const custom = query<HTMLElement>(page.root, '[data-custom]');
  const keptList = query<HTMLUListElement>(page.root, '[data-kept-list]');
  const keptEmpty = query<HTMLParagraphElement>(page.root, '[data-kept-empty]');
  const keptTitle = query<HTMLHeadingElement>(page.root, '#postcards-kept-title');
  const keptDownload = query<HTMLButtonElement>(page.root, '[data-action="kept-download"]');
  const storageNote = query<HTMLParagraphElement>(page.root, '[data-storage-note]');
  const placeButtons = [...page.root.querySelectorAll<HTMLButtonElement>('[data-place]')];
  const sideButtons = [...page.root.querySelectorAll<HTMLButtonElement>('[data-side]')];

  let selectedIndex = 0;
  let side: 'front' | 'back' = 'front';
  let readProblem = false;
  const report = (message: string) => {
    if (!page.signal.aborted) status.textContent = message;
  };
  const saved = readLocalData(storageKey, isSavedLetters, (message) => {
    readProblem = true;
    report(message);
  });
  const kept = new Set<DestinationId>(saved?.ids ?? []);

  function renderSide(): void {
    front.hidden = side !== 'front';
    back.hidden = side !== 'back';
    teaser.hidden = side !== 'front';
    postcard.dataset.side = side;
    for (const button of sideButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.side === side));
    }
    turnLabel.textContent = side === 'front' ? 'Turn over & read the letter' : 'Back to the picture side';
  }

  function renderKeptMarkers(): void {
    const destination = destinations[selectedIndex];
    const isKept = kept.has(destination.id);
    keepButton.setAttribute('aria-pressed', String(isKept));
    keepButton.setAttribute('aria-label', isKept ? `Remove ${destination.name} from your satchel` : `Keep this letter from ${destination.name}`);
    keepLabel.textContent = isKept ? 'Kept in your satchel' : 'Keep this letter';
    for (const marker of page.root.querySelectorAll<HTMLElement>('[data-kept-marker]')) {
      const id = marker.dataset.keptMarker;
      marker.hidden = !isDestinationId(id) || !kept.has(id);
    }
    for (const button of keptList.querySelectorAll<HTMLButtonElement>('[data-open-kept]')) {
      button.setAttribute('aria-pressed', String(button.dataset.openKept === destination.id));
    }
    for (const count of page.root.querySelectorAll<HTMLElement>('[data-kept-count]')) {
      count.textContent = String(kept.size);
    }
  }

  function renderSelected(): void {
    const destination = destinations[selectedIndex];
    const number = stopNumber(selectedIndex);
    reader.dataset.destination = destination.id;
    title.textContent = destination.title;
    readerStop.textContent = `ON THE ROAD / ${number} OF ${stopNumber(total - 1)}`;
    postmarkCode.textContent = `ROUTE / ${number}`;
    postcard.setAttribute('aria-label', `Postcard from ${destination.name}`);
    front.innerHTML = frontMarkup(destination, selectedIndex);
    back.innerHTML = backMarkup(destination);
    teaserText.textContent = destination.teaser;
    const words = letterWordCount(destination);
    readingLength.textContent = `${words} words / about ${Math.max(1, Math.ceil(words / 180))} min`;
    weather.textContent = destination.weather;
    custom.textContent = destination.custom;
    previousButton.disabled = selectedIndex === 0;
    nextButton.disabled = selectedIndex === total - 1;
    previousName.textContent = destinations[selectedIndex - 1]?.name ?? 'Start of the route';
    nextName.textContent = destinations[selectedIndex + 1]?.name ?? 'End of the route';
    previousButton.setAttribute('aria-label', selectedIndex === 0 ? 'Previous place: start of the route' : `Previous place: ${previousName.textContent}`);
    nextButton.setAttribute('aria-label', selectedIndex === total - 1 ? 'Next place: end of the route' : `Next place: ${nextName.textContent}`);
    routePosition.textContent = `${number} / ${stopNumber(total - 1)}`;
    for (const button of placeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.place === destination.id));
    }
    renderSide();
    renderKeptMarkers();
  }

  function focusReader(): void {
    reader.scrollIntoView({ block: 'start', behavior: 'auto' });
    title.focus({ preventScroll: true });
  }

  function selectPlace(id: DestinationId, openLetter = false): void {
    selectedIndex = destinations.findIndex((destination) => destination.id === id);
    if (openLetter) side = 'back';
    renderSelected();
    const destination = destinations[selectedIndex];
    report(`Stop ${selectedIndex + 1} of ${total}: ${destination.name}. ${side === 'front' ? 'Picture' : 'Letter'} side. ${destination.title}.`);
  }

  function changeSide(nextSide: 'front' | 'back'): void {
    if (nextSide === side) return;
    side = nextSide;
    renderSide();
    const destination = destinations[selectedIndex];
    report(side === 'back'
      ? `Letter side of ${destination.name}. ${destination.title}, from Mara to Kit. The complete letter is now open.`
      : `Picture side of ${destination.name}. ${destination.caption}`);
  }

  function renderSatchel(): void {
    const keptDestinations = destinations.filter((destination) => kept.has(destination.id));
    keptList.innerHTML = keptDestinations.map((destination) => `
      <li>
        <button class="pp-kept-open" type="button" data-open-kept="${escapeMarkup(destination.id)}" aria-label="Open kept letter from ${escapeMarkup(destination.name)}" aria-pressed="${destination.id === destinations[selectedIndex].id}">
          <span class="pp-kept-number">${stopNumber(destinations.indexOf(destination))}</span>
          <span><strong>${escapeMarkup(destination.name)}</strong><small>${escapeMarkup(destination.title)}</small></span>
          ${icon('arrow')}
        </button>
        <button class="pp-kept-remove" type="button" data-remove-kept="${escapeMarkup(destination.id)}" aria-label="Remove ${escapeMarkup(destination.name)} from your satchel">${icon('close')}</button>
      </li>`).join('');
    keptList.hidden = kept.size === 0;
    keptEmpty.hidden = kept.size > 0;
    keptDownload.disabled = kept.size === 0;
    renderKeptMarkers();
  }

  function updateKept(id: DestinationId, shouldKeep: boolean): void {
    if (shouldKeep) kept.add(id);
    else kept.delete(id);
    const ids = destinations.filter((destination) => kept.has(destination.id)).map((destination) => destination.id);
    const persisted = writeLocalData(storageKey, { version: 1, ids }, report);
    renderSatchel();
    storageNote.textContent = persisted
      ? 'Saved only in this browser, on this device. No account, no syncing, no actual mail.'
      : 'Session only: this browser could not save your changes. Download anything you want to keep before leaving.';
    const destination = destinations.find((item) => item.id === id);
    const name = destination?.name ?? 'This letter';
    if (persisted) {
      report(shouldKeep ? `${name} is in your satchel, saved in this browser.` : `${name} was removed from your satchel.`);
    } else {
      report(shouldKeep
        ? `${name} is kept for this visit only. Your browser could not save it. Download the letter before leaving.`
        : `${name} was removed for this visit only. Your browser could not save the change; the letter may return after a reload.`);
    }
  }

  function startDownload(filename: string, text: string, message: string, type?: string): void {
    try {
      downloadText(filename, text, type);
      report(message);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      report('The download could not be started. Try Copy letter, or open the Letter side and select its text manually.');
    }
  }

  async function copySelectedLetter(): Promise<void> {
    const destination = destinations[selectedIndex];
    let resultMessage = '';
    copyButton.disabled = true;
    copyButton.setAttribute('aria-busy', 'true');
    try {
      const copied = await copyText(letterText(destination), (message) => { resultMessage = message; });
      if (page.signal.aborted) return;
      if (copied) {
        report(`The complete letter from ${destination.name} was copied to your clipboard.`);
      } else {
        if (destinations[selectedIndex].id === destination.id) {
          side = 'back';
          renderSide();
          report(`${resultMessage} The Letter side is now open for manual selection.`);
        } else {
          report(resultMessage);
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      report('Clipboard copying failed. Open the Letter side to select the text manually, or use Save letter .txt.');
    } finally {
      if (!page.signal.aborted) {
        copyButton.disabled = false;
        copyButton.removeAttribute('aria-busy');
      }
    }
  }

  page.root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !page.root.contains(button) || button.disabled) return;

    if (isDestinationId(button.dataset.place)) {
      selectPlace(button.dataset.place);
      if (window.matchMedia('(max-width: 880px)').matches) focusReader();
      return;
    }
    if (button.dataset.side === 'front' || button.dataset.side === 'back') {
      changeSide(button.dataset.side);
      return;
    }
    if (isDestinationId(button.dataset.openKept)) {
      selectPlace(button.dataset.openKept, true);
      focusReader();
      return;
    }
    if (isDestinationId(button.dataset.removeKept)) {
      const removeButtons = [...keptList.querySelectorAll<HTMLButtonElement>('[data-remove-kept]')];
      const removedIndex = removeButtons.indexOf(button);
      updateKept(button.dataset.removeKept, false);
      const remaining = [...keptList.querySelectorAll<HTMLButtonElement>('[data-remove-kept]')];
      const nextFocus = remaining[Math.min(removedIndex, remaining.length - 1)];
      if (nextFocus) nextFocus.focus();
      else keptTitle.focus();
      return;
    }

    const destination = destinations[selectedIndex];
    switch (button.dataset.action) {
      case 'turn':
        changeSide(side === 'front' ? 'back' : 'front');
        focusReader();
        break;
      case 'keep':
        updateKept(destination.id, !kept.has(destination.id));
        break;
      case 'copy':
        void copySelectedLetter();
        break;
      case 'letter-download':
        startDownload(`letter-from-${destination.id}.txt`, letterText(destination), `Prepared the complete letter from ${destination.name} as a plain-text download.`);
        break;
      case 'postcard-download':
        startDownload(`postcard-from-${destination.id}.html`, postcardDocument(destination, selectedIndex), `Prepared both sides of the ${destination.name} postcard as a self-contained HTML file. Open it offline or print it.`, 'text/html;charset=utf-8');
        break;
      case 'previous':
      case 'next': {
        const nextIndex = selectedIndex + (button.dataset.action === 'next' ? 1 : -1);
        const nextDestination = destinations[nextIndex];
        if (nextDestination) {
          selectPlace(nextDestination.id);
          focusReader();
        }
        break;
      }
      case 'kept-download': {
        const text = destinations.filter((item) => kept.has(item.id)).map(letterText).join('\n\n' + '-'.repeat(56) + '\n\n');
        startDownload('letters-from-elsewhere-satchel.txt', text, `Prepared ${kept.size} kept ${kept.size === 1 ? 'letter' : 'letters'} as one plain-text download, in route order.`);
        break;
      }
    }
  }, { signal: page.signal });

  renderSelected();
  renderSatchel();
  if (readProblem) {
    storageNote.textContent = 'Saved letters could not be restored. This visit still works; you can keep letters again or download them.';
  } else {
    report('Picture side of Aster Quay. Turn it over for the first of eight letters.');
  }

  return { destroy: page.destroy };
}
