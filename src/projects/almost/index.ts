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
import {
  availableLetters,
  categoryLabel,
  entries,
  entriesById,
  favoritesStorageKey,
  filterEntries,
  formatEntry,
  surpriseEntry,
  validateFavorites,
  wordCategories,
} from './data';
import type { DictionaryEntry, LexiconFilters, StoredFavorites } from './data';

const bookmarkIcon = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 3.5h10v13l-5-3-5 3z"/></svg>';
const copyIcon = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 6h9v11H7zM12 6V3H3v11h4"/></svg>';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'almost');
  const { root, signal } = page;
  const filters: LexiconFilters = { search: '', letter: '', category: 'all', keptOnly: false };
  let readingId: string | null = null;
  let canSave = true;
  const browseOpen = !window.matchMedia('(max-width: 760px)').matches;

  root.setAttribute('aria-labelledby', 'almost-title');
  root.innerHTML = `
    <div class="almost-paper" id="almost-top">
      <a class="almost-skip" href="#almost-lexicon">Skip to the words</a>
      <header class="almost-masthead">
        <div class="almost-imprint">
          <p><span class="almost-imprint-mark" aria-hidden="true">a.</span> An original, fictional lexicon</p>
          <p class="almost-edition">Vol. 01 <span aria-hidden="true">/</span> ${entries.length} entries</p>
        </div>
        <div class="almost-title-row">
          <h1 id="almost-title">A Dictionary <em>of Almost</em></h1>
          <div class="almost-introduction">
            <p>For the things you recognize<br class="almost-desktop-break"> before you know what to call them.</p>
            <a href="#almost-about">On making words up <span aria-hidden="true">&searr;</span></a>
          </div>
        </div>
        <nav class="almost-view-nav" aria-label="Dictionary views">
          <button type="button" data-action="view" data-view="all" aria-pressed="true" aria-controls="almost-entry-list">
            The lexicon <span class="almost-nav-count" aria-hidden="true">${entries.length}</span>
          </button>
          <button type="button" data-action="view" data-view="kept" aria-pressed="false" aria-controls="almost-entry-list">
            Kept words <span class="almost-nav-count" data-kept-count aria-hidden="true">0</span>
          </button>
          <button type="button" class="almost-surprise" data-action="surprise">
            <span class="almost-asterisk" aria-hidden="true">&#10035;</span> Surprise me
            <span aria-hidden="true">&nearr;</span>
          </button>
        </nav>
      </header>

      <div class="almost-notice" data-notice-box hidden>
        <p data-notice></p>
        <button type="button" data-action="dismiss" aria-label="Dismiss message">Dismiss <span aria-hidden="true">&times;</span></button>
      </div>
      <p class="almost-sr-only" data-live role="status" aria-live="polite" aria-atomic="true"></p>

      <div class="almost-layout" data-project-preview>
        <aside class="almost-sidebar" aria-label="Find and browse words">
          <form class="almost-search-form" role="search">
            <label for="almost-search">Search the dictionary</label>
            <div class="almost-search-field">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
              <input id="almost-search" type="search" placeholder="Try kettle" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="almost-search-hint" aria-controls="almost-entry-list">
              <button type="button" data-action="clear-search" aria-label="Clear search" hidden>&times;</button>
            </div>
            <p id="almost-search-hint">Search words, definitions, and examples.</p>
          </form>

          <details class="almost-browse" ${browseOpen ? 'open' : ''}>
            <summary>Browse by letter &amp; category</summary>
            <div class="almost-browse-inner">
              <label for="almost-category">By kind of experience</label>
              <select id="almost-category" aria-controls="almost-entry-list" aria-describedby="almost-category-hint">
                <option value="all">All kinds of experience</option>
                ${wordCategories.map((category) => `
                  <option value="${category.id}">${escapeMarkup(category.label)} (${entries.filter((entry) => entry.category === category.id).length})</option>
                `).join('')}
              </select>
              <p id="almost-category-hint">Combine a kind, a letter, and a search.</p>
              <nav class="almost-letter-nav" aria-label="Browse by first letter">
                <p class="almost-field-label">By first letter</p>
                <div class="almost-alphabet">
                  <button type="button" data-action="letter" data-letter="" aria-label="All letters" aria-pressed="true" aria-controls="almost-entry-list">All</button>
                  ${availableLetters.map((letter) => `
                    <button type="button" data-action="letter" data-letter="${letter}" aria-pressed="false" aria-controls="almost-entry-list">${letter}</button>
                  `).join('')}
                </div>
              </nav>
              <p class="almost-browse-footnote">Only letters with entries are listed. All three filters work together.</p>
            </div>
          </details>

          <section class="almost-margin-note" aria-labelledby="almost-margin-heading">
            <p class="almost-eyebrow">A word to start with</p>
            <span class="almost-margin-number" aria-hidden="true">03</span>
            <h2 id="almost-margin-heading">awayettle</h2>
            <p class="almost-margin-guide">uh-WAY-et-ul <span aria-hidden="true">&middot;</span> noun</p>
            <p class="almost-margin-scene">A familiar kettle.<br>An unfamiliar kitchen.<br>A second of being home.</p>
            <a href="#word-awayettle" data-entry-link="awayettle">Read the entry <span aria-hidden="true">&rarr;</span></a>
          </section>

          <div class="almost-reading-key">
            <p class="almost-eyebrow">A small reading key</p>
            <p>Say them as you like. The guides use English syllables; CAPITALS suggest the stress.</p>
            <p data-storage-note>Kept words stay in this browser. No account, no sync.</p>
          </div>
        </aside>

        <section class="almost-lexicon" aria-labelledby="almost-lexicon">
          <header class="almost-results-header">
            <div>
              <h2 id="almost-lexicon" tabindex="-1">The lexicon</h2>
              <p class="almost-results-count" data-results-count role="status" aria-live="polite" aria-atomic="true"></p>
            </div>
            <button type="button" class="almost-reset" data-action="reset" disabled>Reset filters <span aria-hidden="true">&times;</span></button>
          </header>
          <p class="almost-filter-summary" data-filter-summary></p>
          <div class="almost-kept-intro" data-kept-intro hidden>
            <p>Your favorites, gathered in one place. A small collection for this browser, not an account.</p>
            <button type="button" data-action="download" disabled>Download all kept words <span class="almost-file-type">.txt</span> <span aria-hidden="true">&darr;</span></button>
          </div>
          <div class="almost-column-labels" aria-hidden="true"><span>Headword</span><span>Meaning &amp; use</span></div>
          <div id="almost-entry-list" class="almost-entries"></div>
        </section>
      </div>

      <footer class="almost-colophon">
        <div>
          <p class="almost-eyebrow">A note, not an etymology</p>
          <h2 id="almost-about" tabindex="-1">Made-up words.<br>Recognizable corners of life.</h2>
        </div>
        <div class="almost-colophon-copy">
          <p>Every headword here is an <strong>original fictional coinage</strong>, written for this dictionary. These are not translations, established vocabulary, or claims about any language. The guides use English syllables, with CAPITALS for stress: suggestions, not scholarship.</p>
          <p>All ${entries.length} entries are written in advance. There is no live inference, AI service, or outside API. Search simply looks through the words already on this page.</p>
          <p>Keep a word if you want to find it again. Copy an entry to carry its meaning elsewhere. Follow a &ldquo;see also&rdquo; and let one small thing lead to another.</p>
        </div>
        <div class="almost-endnote">
          <span>A Dictionary of Almost <span aria-hidden="true">&middot;</span> ${entries.length} entries, no final word.</span>
          <a href="#almost-top">Back to the beginning <span aria-hidden="true">&uarr;</span></a>
        </div>
      </footer>
    </div>
  `;

  const searchForm = query<HTMLFormElement>(root, '.almost-search-form');
  const search = query<HTMLInputElement>(root, '#almost-search');
  const categorySelect = query<HTMLSelectElement>(root, '#almost-category');
  const categoryHint = query<HTMLParagraphElement>(root, '#almost-category-hint');
  const clearSearch = query<HTMLButtonElement>(root, '[data-action="clear-search"]');
  const resetButton = query<HTMLButtonElement>(root, '.almost-reset');
  const allViewButton = query<HTMLButtonElement>(root, '[data-view="all"]');
  const keptViewButton = query<HTMLButtonElement>(root, '[data-view="kept"]');
  const keptCount = query<HTMLSpanElement>(root, '[data-kept-count]');
  const keptIntro = query<HTMLDivElement>(root, '[data-kept-intro]');
  const downloadButton = query<HTMLButtonElement>(root, '[data-action="download"]');
  const resultsHeading = query<HTMLHeadingElement>(root, '#almost-lexicon');
  const resultsCount = query<HTMLParagraphElement>(root, '[data-results-count]');
  const filterSummary = query<HTMLParagraphElement>(root, '[data-filter-summary]');
  const list = query<HTMLDivElement>(root, '#almost-entry-list');
  const live = query<HTMLParagraphElement>(root, '[data-live]');
  const noticeBox = query<HTMLDivElement>(root, '[data-notice-box]');
  const notice = query<HTMLParagraphElement>(root, '[data-notice]');
  const storageNote = query<HTMLParagraphElement>(root, '[data-storage-note]');
  const stored = readLocalData(favoritesStorageKey, validateFavorites, (message) => announce(message, true));
  const favorites = new Set(stored?.ids ?? []);

  function announce(message: string, showNotice = false): void {
    if (signal.aborted) return;
    live.textContent = message;
    if (showNotice) {
      noticeBox.hidden = false;
      notice.textContent = message;
    }
    page.report(message);
  }

  function hasFilters(): boolean {
    return Boolean(filters.search.trim() || filters.letter || filters.category !== 'all');
  }

  function visibleEntries(): DictionaryEntry[] {
    return filterEntries(filters, favorites);
  }

  function syncControls(visible: readonly DictionaryEntry[]): void {
    if (search.value !== filters.search) search.value = filters.search;
    clearSearch.hidden = filters.search.length === 0;
    categorySelect.value = filters.category;
    categoryHint.textContent = wordCategories.find((item) => item.id === filters.category)?.description
      ?? 'Combine a kind, a letter, and a search.';
    resetButton.disabled = !hasFilters();
    allViewButton.setAttribute('aria-pressed', String(!filters.keptOnly));
    keptViewButton.setAttribute('aria-pressed', String(filters.keptOnly));
    keptViewButton.setAttribute('aria-label', `Kept words, ${favorites.size}`);
    keptCount.textContent = String(favorites.size);
    keptIntro.hidden = !filters.keptOnly;
    downloadButton.disabled = favorites.size === 0;
    root.querySelectorAll<HTMLButtonElement>('[data-action="letter"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.letter === filters.letter));
    });
    resultsHeading.textContent = filters.keptOnly ? 'Kept words' : 'The lexicon';
    const total = filters.keptOnly ? favorites.size : entries.length;
    const countText = `Showing ${visible.length} of ${total} ${filters.keptOnly ? 'kept ' : ''}${total === 1 ? 'word' : 'words'}.`;
    if (resultsCount.textContent !== countText) resultsCount.textContent = countText;
    const active: string[] = [];
    if (filters.search.trim()) active.push(`Search: "${filters.search.trim()}"`);
    if (filters.letter) active.push(`Letter: ${filters.letter}`);
    if (filters.category !== 'all') active.push(`Kind: ${categoryLabel(filters.category)}`);
    filterSummary.textContent = active.length
      ? `${active.join(' / ')}. All selected filters must match.`
      : 'In alphabetical order. No need to begin at the beginning.';
    filterSummary.dataset.active = String(active.length > 0);
  }

  function renderEntry(entry: DictionaryEntry): string {
    const kept = favorites.has(entry.id);
    const number = String(entries.indexOf(entry) + 1).padStart(2, '0');
    const related = entry.related
      .map((id) => entriesById.get(id))
      .filter((item): item is DictionaryEntry => item !== undefined);
    return `
      <article class="almost-entry${readingId === entry.id ? ' is-reading' : ''}" id="word-${entry.id}" data-entry="${entry.id}" aria-labelledby="almost-word-${entry.id}">
        <div class="almost-entry-heading">
          <p class="almost-entry-number">${number}${readingId === entry.id ? ' <span>/ open here</span>' : ''}</p>
          <h3 id="almost-word-${entry.id}" tabindex="-1">${escapeMarkup(entry.word)}</h3>
          <p class="almost-pronunciation"><span class="almost-sr-only">Pronounced </span>${escapeMarkup(entry.pronunciation)}</p>
          <p class="almost-word-kind"><em>${entry.partOfSpeech}</em> <span aria-hidden="true">&middot;</span> ${escapeMarkup(categoryLabel(entry.category))}</p>
          <p class="almost-origin">Original fictional coinage</p>
        </div>
        <div class="almost-entry-body">
          <p class="almost-definition">${escapeMarkup(entry.definition)}</p>
          <div class="almost-example">
            <p class="almost-eyebrow">In a sentence</p>
            <blockquote><p>&ldquo;${escapeMarkup(entry.example)}&rdquo;</p></blockquote>
          </div>
          <p class="almost-observation"><span>A small note.</span> ${escapeMarkup(entry.observation)}</p>
          <div class="almost-related">
            <span class="almost-related-label">See also</span>
            <div>${related.map((item) => `<a href="#word-${item.id}" data-entry-link="${item.id}">${escapeMarkup(item.word)}</a>`).join('<span class="almost-related-separator" aria-hidden="true">/</span>')}</div>
          </div>
          <div class="almost-entry-actions">
            <button type="button" class="almost-keep" data-action="favorite" data-id="${entry.id}" aria-label="Keep ${escapeMarkup(entry.word)} in favorites" aria-pressed="${kept}">
              ${bookmarkIcon}<span data-keep-label>${kept ? 'Kept' : 'Keep word'}</span>
            </button>
            <button type="button" class="almost-copy" data-action="copy" data-id="${entry.id}" aria-label="Copy ${escapeMarkup(entry.word)}">
              ${copyIcon}<span data-copy-label>Copy entry</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderResults(): void {
    const visible = visibleEntries();
    syncControls(visible);
    if (visible.length) {
      list.innerHTML = visible.map(renderEntry).join('');
      return;
    }
    const noKeptWords = filters.keptOnly && favorites.size === 0;
    list.innerHTML = `
      <div class="almost-empty">
        <span class="almost-empty-mark" aria-hidden="true">&mdash;</span>
        <h3>${noKeptWords ? 'Nothing kept, yet.' : 'No words on this page.'}</h3>
        <p>${noKeptWords
          ? 'Use Keep word beneath an entry to gather your favorites here. They will stay in this browser.'
          : 'Nothing matches these filters together. Try a shorter search, another letter, or a different kind of experience.'}</p>
        ${!noKeptWords ? '<button type="button" class="almost-plain-button" data-action="reset">Clear these filters <span aria-hidden="true">&rarr;</span></button>' : ''}
        ${filters.keptOnly ? '<button type="button" class="almost-plain-button" data-action="show-all">Show the full lexicon <span aria-hidden="true">&rarr;</span></button>' : ''}
      </div>
    `;
  }

  function clearEntrySelection(): void {
    const hadSelection = readingId !== null;
    readingId = null;
    if (hadSelection || window.location.hash.startsWith('#word-')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  function clearFilters(): void {
    filters.search = '';
    filters.letter = '';
    filters.category = 'all';
    clearEntrySelection();
  }

  function openEntry(id: string, updateAddress = true): void {
    const entry = entriesById.get(id);
    if (!entry) {
      announce('That word is not in this edition. You can search the full lexicon instead.', true);
      return;
    }
    filters.search = '';
    filters.letter = '';
    filters.category = 'all';
    filters.keptOnly = false;
    readingId = id;
    noticeBox.hidden = true;
    renderResults();
    if (updateAddress && window.location.hash !== `#word-${id}`) {
      window.history.pushState(window.history.state, '', `#word-${id}`);
    }
    const heading = query<HTMLHeadingElement>(root, `#almost-word-${id}`);
    heading.focus({ preventScroll: true });
    query<HTMLElement>(root, `#word-${id}`).scrollIntoView({ block: 'start', behavior: 'auto' });
    announce(`Opened ${entry.word}. Showing the full lexicon with browsing filters cleared.`);
  }

  function readEntryAddress(): void {
    let hash: string;
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      hash = 'unknown-entry';
    }
    if (hash === 'almost-top' || hash === 'almost-lexicon' || hash === 'almost-about') return;
    if (!hash) {
      if (readingId) {
        readingId = null;
        renderResults();
      }
      return;
    }
    const id = hash.startsWith('word-') ? hash.slice(5) : '';
    if (entriesById.has(id)) {
      openEntry(id, false);
      return;
    }
    filters.search = '';
    filters.letter = '';
    filters.category = 'all';
    filters.keptOnly = false;
    readingId = null;
    renderResults();
    announce('There is no entry at this address. The full lexicon is open below; try a word or a letter.', true);
  }

  function toggleFavorite(entry: DictionaryEntry, button: HTMLButtonElement): void {
    const before = visibleEntries();
    const previousIndex = before.findIndex((item) => item.id === entry.id);
    const previousTop = button.getBoundingClientRect().top;
    const wasKept = favorites.has(entry.id);
    if (wasKept) favorites.delete(entry.id);
    else favorites.add(entry.id);
    const payload: StoredFavorites = {
      version: 1,
      ids: entries.filter((item) => favorites.has(item.id)).map((item) => item.id),
    };
    let failureMessage = '';
    const previouslyCouldSave = canSave;
    canSave = writeLocalData(favoritesStorageKey, payload, (message) => { failureMessage = message; });
    storageNote.textContent = canSave
      ? 'Kept words stay in this browser. No account, no sync.'
      : 'Saving is unavailable. Your latest kept-word changes are held for this visit only.';

    let focusTarget: HTMLButtonElement | null = button;
    if (filters.keptOnly && wasKept) {
      renderResults();
      const remaining = visibleEntries();
      const next = remaining[Math.min(Math.max(previousIndex, 0), remaining.length - 1)];
      focusTarget = next ? root.querySelector<HTMLButtonElement>(`[data-action="favorite"][data-id="${next.id}"]`) : null;
    } else {
      button.setAttribute('aria-pressed', String(!wasKept));
      query<HTMLSpanElement>(button, '[data-keep-label]').textContent = wasKept ? 'Keep word' : 'Kept';
      syncControls(visibleEntries());
    }

    if (canSave) {
      if (!previouslyCouldSave) noticeBox.hidden = true;
      announce(wasKept ? `${entry.word} removed from your kept words.` : `${entry.word} kept in this browser.`);
    } else {
      announce(`Your changes are kept for this visit only. ${failureMessage}`, true);
    }
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
      const movement = focusTarget.getBoundingClientRect().top - previousTop;
      if (Math.abs(movement) > 1) window.scrollBy({ top: movement, behavior: 'auto' });
    } else {
      resultsHeading.focus({ preventScroll: true });
      resultsHeading.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  async function copyEntry(entry: DictionaryEntry, button: HTMLButtonElement): Promise<void> {
    if (button.dataset.copying === 'true') return;
    button.dataset.copying = 'true';
    button.setAttribute('aria-busy', 'true');
    const label = query<HTMLSpanElement>(button, '[data-copy-label]');
    label.textContent = 'Copying...';
    let message = '';
    try {
      const copied = await copyText(formatEntry(entry), (feedback) => { message = feedback; });
      if (signal.aborted) return;
      label.textContent = copied ? 'Copied' : 'Copy entry';
      announce(copied ? `${entry.word} copied with its definition, example, note, and related words.` : message, !copied);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      if (signal.aborted) return;
      label.textContent = 'Copy entry';
      announce('Copying is unavailable in this browser. Select the entry text and copy it manually.', true);
    } finally {
      button.removeAttribute('aria-busy');
      delete button.dataset.copying;
    }
  }

  function downloadFavorites(): void {
    const kept = entries.filter((entry) => favorites.has(entry.id));
    if (!kept.length) {
      announce('Keep at least one word before downloading a reading list.', true);
      return;
    }
    const text = [
      'A Dictionary of Almost',
      `${kept.length} kept ${kept.length === 1 ? 'word' : 'words'}`,
      'An original fictional lexicon. No language scholarship or historical etymologies.',
      '',
      kept.map(formatEntry).join(`\n\n${'-'.repeat(48)}\n\n`),
    ].join('\n');
    try {
      downloadText('a-dictionary-of-almost-kept-words.txt', text);
      announce(`Text file prepared for all ${kept.length} kept ${kept.length === 1 ? 'word' : 'words'}. Check your browser downloads.`);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      announce('This browser could not create the download. You can still copy individual entries.', true);
    }
  }

  search.addEventListener('input', () => {
    filters.search = search.value;
    clearEntrySelection();
    renderResults();
  }, { signal });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    filters.search = search.value;
    clearEntrySelection();
    renderResults();
  }, { signal });

  categorySelect.addEventListener('change', () => {
    filters.category = wordCategories.find((category) => category.id === categorySelect.value)?.id ?? 'all';
    clearEntrySelection();
    renderResults();
  }, { signal });

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-entry-link]');
    if (link && root.contains(link)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openEntry(link.dataset.entryLink ?? '');
      return;
    }
    const button = event.target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    switch (button.dataset.action) {
      case 'view':
        filters.keptOnly = button.dataset.view === 'kept';
        clearEntrySelection();
        renderResults();
        break;
      case 'letter':
        filters.letter = button.dataset.letter ?? '';
        clearEntrySelection();
        renderResults();
        break;
      case 'clear-search':
        filters.search = '';
        clearEntrySelection();
        renderResults();
        search.focus({ preventScroll: true });
        break;
      case 'reset':
        clearFilters();
        renderResults();
        search.focus();
        break;
      case 'show-all':
        clearFilters();
        filters.keptOnly = false;
        renderResults();
        resultsHeading.focus({ preventScroll: true });
        resultsHeading.scrollIntoView({ block: 'start', behavior: 'auto' });
        break;
      case 'surprise': {
        const visible = visibleEntries();
        const current = visible.some((entry) => entry.id === readingId) ? readingId : visible[0]?.id ?? readingId;
        openEntry(surpriseEntry(current).id);
        break;
      }
      case 'favorite': {
        const entry = entriesById.get(button.dataset.id ?? '');
        if (entry) toggleFavorite(entry, button);
        break;
      }
      case 'copy': {
        const entry = entriesById.get(button.dataset.id ?? '');
        if (entry) void copyEntry(entry, button);
        break;
      }
      case 'download':
        downloadFavorites();
        break;
      case 'dismiss':
        noticeBox.hidden = true;
        search.focus({ preventScroll: true });
        break;
    }
  }, { signal });

  window.addEventListener('hashchange', readEntryAddress, { signal });
  renderResults();
  readEntryAddress();
  return { destroy: page.destroy };
}
