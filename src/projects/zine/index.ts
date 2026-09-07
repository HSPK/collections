import './style.css';
import { createProjectPage, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { artwork } from './artwork';
import { STARTERS, THEMES, makeBlank, makeStarter } from './data';
import {
  LIMITS, PAPERS, THEME_IDS, analyzeDocument, bodyLimit, canvasMeasurer, characterCount,
  cloneDocument, escapeXml, estimateText, filenameFor, normalizeNewlines, number,
  sheetGeometry, wordCount, type ZineDocument,
} from './engine';
import { changeDocument, createHistory, loadDraft, redo, saveDraft, undo } from './state';
import { makeSheetSvg } from './svg';

let mountedCount = 0;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'zine');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  const id = `zine-${++mountedCount}`;
  const storageAccess = () => window.localStorage;
  const stored = loadDraft(storageAccess);
  const history = createHistory(stored.status === 'restored' ? stored.document : makeStarter());
  const measurementContext = document.createElement('canvas').getContext('2d');
  const measure = measurementContext ? canvasMeasurer(measurementContext) : estimateText;
  const downloadUrls = new Set<string>();
  const downloadTimers = new Set<number>();
  let activePage = 0;
  let mode: 'read' | 'sheet' = 'read';
  let guides = true;
  let lastEditKey = '';
  let lastEditAt = 0;
  let saveMessage = stored.status === 'restored' ? 'Your local draft is back. Welcome to the worktable.'
    : stored.status === 'unavailable' ? 'Local saving is unavailable. Keep this tab open, or copy your text before leaving.'
    : stored.status === 'invalid' ? 'The saved draft was invalid or from another version. A fresh starter is open; your old data is unchanged until you edit.'
    : 'Your draft stays in this browser. It saves as you edit.';
  let saveProblem = stored.status === 'unavailable' || stored.status === 'invalid';
  let analysis = analyzeDocument(history.present, THEMES[history.present.theme], measure);

  root.innerHTML = `
    <div class="zine-shell">
      <header class="zine-masthead">
        <div class="zine-identity">
          <p class="zine-masthead-name"><span class="zine-press-mark" aria-hidden="true">↗</span> THE POCKET PRESS / 8 PAGES, 1 SHEET</p>
          <h1 id="${id}-heading">Zine <span>Machine<span class="zine-title-dot">.</span></span></h1>
        </div>
        <nav aria-label="Studio sections"><a href="#${id}-library">Starter library</a><a href="#${id}-fold">How to fold <span aria-hidden="true">↘</span></a><button type="button" data-open-export>Ink &amp; export</button></nav>
      </header>

      <section class="zine-worktable" aria-labelledby="${id}-worktable" data-project-preview>
        <div class="zine-worktable-top">
          <h2 id="${id}-worktable">Your edition</h2>
          <button type="button" class="zine-editor-jump" data-action="edit-page">Edit text</button>
          <div class="zine-history" aria-label="Draft history">
            <button type="button" data-action="undo" title="Undo (Ctrl or Command + Z)"><span aria-hidden="true">↶</span> Undo</button>
            <button type="button" data-action="redo" title="Redo (Ctrl or Command + Shift + Z)"><span aria-hidden="true">↷</span> Redo</button>
          </div>
        </div>
        <div class="zine-shared-navigation"><button type="button" data-open-pages>All pages</button></div>
        <div class="zine-pane-tabs"></div>
        <div class="zine-workspace">
          <div class="zine-preview-column">
            <div class="zine-preview-toolbar">
              <div class="zine-view-switch" role="group" aria-label="Preview mode">
                <button type="button" data-action="mode" data-mode="read" aria-pressed="true">Reading copy</button>
                <button type="button" data-action="mode" data-mode="sheet" aria-pressed="false">Print sheet</button>
              </div>
              <div class="zine-page-navigation">
                <button type="button" data-action="previous" aria-label="Previous page">← <span>Previous</span></button>
                <p class="zine-page-announcement" role="status" aria-live="polite"></p>
                <button type="button" data-action="next" aria-label="Next page"><span>Next</span> →</button>
              </div>
            </div>
            <div class="zine-reader-view" id="${id}-read-view">
              <div class="zine-reading-mat">
                <article class="zine-reader" tabindex="0" aria-label="Reading copy. Use left and right arrow keys to turn pages."></article>
              </div>
              <p class="zine-view-note">A legible reading copy, reflowed for your screen. <strong>Print sheet</strong> shows the exact exported layout.</p>
            </div>
            <div class="zine-sheet-view" id="${id}-sheet-view" hidden>
              <div class="zine-sheet-caption"><strong>Upside down is right.</strong><span>This is the order the folds need, not the reading order.</span></div>
              <div class="zine-sheet"></div>
              <div class="zine-guide-key"><span><i class="zine-key-fold" aria-hidden="true"></i> Dashed = fold</span><span><i class="zine-key-cut" aria-hidden="true"></i> Solid red = cut only here</span></div>
              <p class="zine-sheet-size"></p>
            </div>
            <nav class="zine-overview" aria-label="All eight pages"></nav>
            <p class="zine-overview-help">Select a page to read and edit it. 1 is your cover; 8 is the back.</p>
          </div>

          <div class="zine-issue-title">
            <label for="${id}-title">Zine title <span>Appears on the cover</span></label>
            <input id="${id}-title" name="zine-title" type="text" spellcheck="true" autocomplete="off" aria-describedby="${id}-title-count ${id}-title-error">
            <div class="zine-title-meta"><span id="${id}-title-count"></span></div>
            <p id="${id}-title-error" class="zine-field-error"></p>
          </div>
          <aside class="zine-editor" aria-labelledby="${id}-editor-heading">
            <div class="zine-editor-heading">
              <p class="zine-eyebrow">ON THIS PAGE</p>
              <h3 id="${id}-editor-heading"></h3>
            </div>
            <div class="zine-field">
              <label for="${id}-panel-heading" class="zine-panel-heading-label">Page heading</label>
              <input id="${id}-panel-heading" name="panel-heading" type="text" spellcheck="true" autocomplete="off" aria-describedby="${id}-heading-count ${id}-heading-error">
              <p id="${id}-heading-count" class="zine-field-count"></p>
              <p id="${id}-heading-error" class="zine-field-error"></p>
            </div>
            <div class="zine-field">
              <label for="${id}-body">Page text</label>
              <textarea id="${id}-body" name="panel-body" rows="8" spellcheck="true" aria-describedby="${id}-body-count ${id}-body-error ${id}-text-help"></textarea>
              <p id="${id}-body-count" class="zine-field-count"></p>
              <p id="${id}-body-error" class="zine-field-error"></p>
              <p id="${id}-text-help" class="zine-field-help">Line breaks count, too. Artwork makes room for your words; text never gets cropped. If a page will not fit, shorten it or remove a few breaks.</p>
            </div>
            <div class="zine-fit-status" aria-live="polite"></div>
            <fieldset class="zine-style-field">
              <legend>Ink &amp; character</legend>
              <div class="zine-theme-options">
                ${THEME_IDS.map((themeId) => {
                  const theme = THEMES[themeId];
                  return `<button type="button" data-action="theme" data-theme="${themeId}" title="${escapeXml(theme.description)}" aria-pressed="false"><span class="zine-swatch zine-swatch-${themeId}" aria-hidden="true"></span>${escapeXml(theme.name)}</button>`;
                }).join('')}
              </div>
            </fieldset>
            <div class="zine-paper-field">
              <label for="${id}-paper">Paper on your printer</label>
              <select id="${id}-paper" name="paper">
                <option value="a4">A4 · 297 × 210 mm</option>
                <option value="letter">US Letter · 11 × 8½ in</option>
              </select>
            </div>
            <label class="zine-guide-toggle" for="${id}-guides">
              <input id="${id}-guides" name="guides" type="checkbox" checked>
              <span>Include fold &amp; cut guides<small>Useful for your first copy. Turn off for clean artwork.</small></span>
            </label>
            <button type="button" class="zine-download" data-action="download"><span class="zine-download-label">Download sheet · SVG</span><span aria-hidden="true">↧</span></button>
            <p class="zine-download-help">A real-size, editable vector sheet. All eight pages. No account, no upload.</p>
            <p class="zine-export-warning" aria-live="polite"></p>
          </aside>
        </div>
        <div class="zine-worktable-bottom">
          <p class="zine-save-status" role="status"></p>
          <p class="zine-notice" role="status"></p>
        </div>
      </section>

      <section class="zine-starters" id="${id}-library" aria-labelledby="${id}-starters">
        <div class="zine-section-heading">
          <h2 id="${id}-starters"><span>02</span> Start with a spark.</h2>
          <p>Original little books. Make one your own.</p>
        </div>
        <div class="zine-starter-grid">
          ${STARTERS.map((starter, index) => `
            <button type="button" class="zine-starter" data-action="starter" data-starter="${starter.id}">
              <span class="zine-starter-index">0${index + 1} / ${escapeXml(THEMES[starter.theme].name)}</span>
              <strong>${escapeXml(starter.name)}</strong>
              <span>${escapeXml(starter.note)}</span>
              <span class="zine-starter-arrow" aria-hidden="true">↗</span>
            </button>`).join('')}
          <button type="button" class="zine-starter zine-starter-blank" data-action="blank">
            <span class="zine-starter-index">YOUR WORDS / YOUR WAY</span>
            <strong>A blank beginning</strong>
            <span>Eight open pages. No prescribed story.</span>
            <span class="zine-starter-arrow" aria-hidden="true">+</span>
          </button>
        </div>
        <p class="zine-replace-note">Loading a starter replaces your pages. <strong>Undo brings your previous draft back.</strong></p>
      </section>

      <section class="zine-folding" id="${id}-fold" aria-labelledby="${id}-fold-heading">
        <div class="zine-section-heading">
          <h2 id="${id}-fold-heading"><span>03</span> Make the cut.</h2>
          <p>One sheet. Scissors. No glue.</p>
        </div>
        <div class="zine-fold-intro">
          <div>
            <p class="zine-fold-deck">A little paper engineering.<br>A book in your pocket.</p>
            <p>Start with a proof copy. The numbers are there to help: your finished booklet reads 1 through 8, with the cover in front and page 8 behind.</p>
          </div>
          <figure class="zine-fold-diagram">
            <svg viewBox="0 0 400 224" role="img" aria-labelledby="${id}-net-title">
              <title id="${id}-net-title">Landscape folding net: top row 5, 4, 3, 2 upside down; bottom row 6, 7, 8, 1 upright. Cut only the central horizontal line across columns two and three.</title>
              <rect x="1" y="1" width="398" height="198" fill="#fffdf6" stroke="#202019" stroke-width="2"/>
              <path d="M100 1V199 M200 1V199 M300 1V199 M1 100H399" stroke="#807970" stroke-dasharray="5 5"/>
              <path d="M100 100H300 M100 94V106 M300 94V106" stroke="#ce3825" stroke-width="3"/>
              <g font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#202019">
                <text x="50" y="62" transform="rotate(180 50 50)">5</text><text x="150" y="62" transform="rotate(180 150 50)">4</text>
                <text x="250" y="62" transform="rotate(180 250 50)">3</text><text x="350" y="62" transform="rotate(180 350 50)">2</text>
                <text x="50" y="161">6</text><text x="150" y="161">7</text><text x="250" y="161">8</text><text x="350" y="161" fill="#ce3825">1</text>
              </g>
              <text x="200" y="219" font-family="Arial, Helvetica, sans-serif" font-size="15" text-anchor="middle" fill="#202019">ONLY THE SOLID RED LINE IS A CUT</text>
            </svg>
            <figcaption>Do not cut to an outside edge.</figcaption>
          </figure>
        </div>
        <ol class="zine-fold-steps">
          <li><h3>Print it true to size.</h3><p>Open the SVG in a browser or vector editor. Match A4 or Letter, choose <strong>landscape, single-sided, 100% / actual size</strong>. Turn off fit/shrink, headers and footers; use no page margins. The artwork has its own 6 mm safe area.</p></li>
          <li><h3>Crease the eight panels.</h3><p>Fold the short ends together, then unfold. Fold each short edge into that center crease and unfold: four columns. Now fold the long edges together and unfold: two rows. Press each crease firmly.</p></li>
          <li><h3>One cut, in the middle.</h3><p>Fold the short ends together again. Cut along the horizontal middle crease <strong>from the folded edge to the first quarter-fold only</strong>. Unfold. The slit should span the middle two columns, exactly as shown.</p></li>
          <li><h3>Make a long strip.</h3><p>Fold the long edges together with the printing on the outside. The strip is four panels long, and the slit sits along the middle of its folded edge.</p></li>
          <li><h3>Push, then gather.</h3><p>Hold the strip at its short ends and push them toward each other. The slit opens into a diamond, then a cross. Bring the four arms together into a little stack.</p></li>
          <li><h3>Find the front. Pass it on.</h3><p>Find page <strong>1</strong> and fold the other leaves behind it in numbered order. Page <strong>8</strong> is the back. Flatten the spine, read your book, and give it somewhere to go.</p></li>
        </ol>
        <p class="zine-print-note"><strong>A note on print size:</strong> A4 makes a 74.25 × 105 mm booklet; Letter makes a 69.85 × 107.95 mm booklet. SVG printing varies between apps: check the paper size and 100% scale in your print dialog. System fonts are used, so proof unfamiliar scripts and emoji on your printer.</p>
      </section>
      <footer class="zine-footer"><strong>Small is a real size.</strong><span>A little ink. A little paper. Entirely your own.</span></footer>
    </div>`;

  const find = <T extends HTMLElement>(selector: string): T => query<T>(root, selector);
  const titleInput = find<HTMLInputElement>('input[name="zine-title"]');
  const headingInput = find<HTMLInputElement>('input[name="panel-heading"]');
  const bodyInput = find<HTMLTextAreaElement>('textarea[name="panel-body"]');
  const paperInput = find<HTMLSelectElement>('select[name="paper"]');
  const readView = find<HTMLElement>('.zine-reader-view');
  const pageNavigation = find<HTMLElement>('.zine-page-navigation');
  const sheetView = find<HTMLElement>('.zine-sheet-view');
  const reader = find<HTMLElement>('.zine-reader');
  const sheet = find<HTMLElement>('.zine-sheet');
  const overview = find<HTMLElement>('.zine-overview');
  const notice = find<HTMLElement>('.zine-notice');
  const downloadButton = find<HTMLButtonElement>('[data-action="download"]');
  const previewColumn = find<HTMLElement>('.zine-preview-column');
  const editor = find<HTMLElement>('.zine-editor');
  const writePanel = document.createElement('div');
  writePanel.className = 'zine-write-panel';
  find('.zine-workspace').append(writePanel);
  writePanel.append(find('.zine-issue-title'), editor);
  find('.zine-shared-navigation').prepend(pageNavigation);
  const tabHost = find<HTMLElement>('.zine-pane-tabs');
  const compact = window.matchMedia('(max-width: 900px), (max-height: 560px)');
  const syncPanes = () => {
    tabHost.hidden = !compact.matches;
    if (!compact.matches) {
      for (const panel of [previewColumn, writePanel]) {
        panel.hidden = false;
        panel.inert = false;
        panel.setAttribute('aria-hidden', 'false');
      }
    }
  };
  const panes = createWorkspaceTabs(page, {
    id: `${id}-workspace`, label: 'Zine workspace', host: tabHost,
    panes: [{ id: 'read', label: 'Reading copy', panel: previewColumn }, { id: 'write', label: 'Write', panel: writePanel }],
    onSelect: syncPanes,
  });
  compact.addEventListener('change', () => { panes.select(panes.selected); syncPanes(); }, { signal });
  syncPanes();
  const libraryDialog = createWorkspaceDialog(page, {
    id: `${id}-library-dialog`, title: 'Starter library', content: [find('.zine-starters')],
    triggers: [find(`a[href="#${id}-library"]`)],
  });
  createWorkspaceDialog(page, {
    id: `${id}-pages-dialog`, title: 'All eight pages', content: [overview, find('.zine-overview-help')],
    triggers: [find('[data-open-pages]')],
  });
  const fold = find<HTMLElement>('.zine-folding');
  fold.append(find('.zine-view-note'), find('.zine-field-help'), find('.zine-footer'));
  createWorkspaceDialog(page, {
    id: `${id}-fold-dialog`, title: 'How to fold', content: [fold],
    triggers: [find(`a[href="#${id}-fold"]`)],
  });
  const exportControls = document.createElement('div');
  exportControls.className = 'zine-export-controls';
  exportControls.append(find('.zine-style-field'), find('.zine-paper-field'), find('.zine-guide-toggle'),
    downloadButton, find('.zine-download-help'));
  const exportLayout = document.createElement('div');
  exportLayout.className = 'zine-export-layout';
  exportLayout.append(sheetView, exportControls);
  const exportTabs = document.createElement('div');
  exportTabs.className = 'zine-export-tabs';
  const compactExport = window.matchMedia('(max-width: 600px)');
  const syncExport = () => {
    exportTabs.hidden = !compactExport.matches;
    if (!compactExport.matches) {
      for (const panel of [sheetView, exportControls]) {
        panel.hidden = false;
        panel.inert = false;
        panel.setAttribute('aria-hidden', 'false');
      }
    }
  };
  const exportPanes = createWorkspaceTabs(page, {
    id: `${id}-output`, label: 'Sheet and output', host: exportTabs, initial: 'output',
    panes: [{ id: 'sheet', label: 'Print layout', panel: sheetView }, { id: 'output', label: 'Ink & output', panel: exportControls }],
    onSelect: syncExport,
  });
  compactExport.addEventListener('change', () => { exportPanes.select(exportPanes.selected); syncExport(); }, { signal });
  syncExport();
  const exportDialog = createWorkspaceDialog(page, {
    id: `${id}-export-dialog`, title: 'Ink & export', content: [exportTabs, exportLayout],
  });
  exportDialog.dialog.addEventListener('close', () => { mode = 'read'; renderPreview(); }, { signal });
  const saveDetails = document.createElement('div');
  saveDetails.append(find('.zine-save-status'), notice, find('.zine-fit-status'));
  saveDetails.append(...root.querySelectorAll<HTMLElement>('.zine-field-error'));
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'zine-save-summary';
  saveButton.setAttribute('aria-live', 'polite');
  saveButton.setAttribute('aria-atomic', 'true');
  const saveDialog = createWorkspaceDialog(page, {
    id: `${id}-save-dialog`, title: 'Draft & save details', content: [saveDetails], triggers: [saveButton],
  });
  find('.zine-worktable-bottom').append(saveButton, find('.zine-export-warning'));
  find('.zine-export-warning').setAttribute('role', 'alert');
  const printOutput = document.createElement('div');
  printOutput.className = 'zine-print-output';
  root.append(printOutput);
  const printStyle = document.createElement('style');
  root.append(printStyle);
  function preparePrint(): void {
    printStyle.textContent = `@page { size: ${history.present.paper === 'a4' ? 'A4' : 'letter'} landscape; margin: 0; }`;
    printOutput.innerHTML = analysis.issues.length
      ? `<p>Printing paused. ${escapeXml(analysis.issues[0]!.message)} Your full draft remains in the editor.</p>`
      : makeSheetSvg(history.present, THEMES[history.present.theme], { guides, measure }).replace(/^<\?xml[^>]+\?>\s*/u, '');
  }
  window.addEventListener('beforeprint', preparePrint, { signal });

  function announce(message: string, error = false): void {
    if (signal.aborted) return;
    notice.textContent = message;
    saveButton.textContent = `${message.split('. ')[0]!.replace(/\.$/u, '')} · Details`;
    if (error) saveDialog.open();
  }

  function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
    if (input.value !== value) input.value = value;
  }

  function renderPreview(): void {
    const draft = history.present;
    const panel = draft.pages[activePage]!;
    const theme = THEMES[draft.theme];
    const dimensions = sheetGeometry(draft.paper);
    const heading = activePage === 0 ? draft.title : panel.heading;
    const role = activePage === 0 ? 'Front cover' : activePage === 7 ? 'Back cover' : 'Inside page';
    readView.hidden = false;
    pageNavigation.hidden = false;
    sheetView.hidden = mode !== 'sheet';
    root.querySelectorAll<HTMLButtonElement>('[data-action="mode"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    reader.dataset.theme = draft.theme;
    reader.style.setProperty('--zine-page-accent', theme.accent);
    reader.style.setProperty('--zine-page-ink', theme.ink);
    reader.style.setProperty('--zine-page-display', theme.titleFont);
    reader.style.setProperty('--zine-page-body', theme.bodyFont);
    reader.innerHTML = `
      <div class="zine-reader-masthead"><span>POCKET EDITION</span><span>${String(activePage + 1).padStart(2, '0')} / 08</span></div>
      ${activePage === 0 && panel.heading ? `<p class="zine-reader-subtitle">${escapeXml(panel.heading)}</p>` : ''}
      ${heading ? `<h3 class="${activePage === 0 ? 'zine-reader-cover-title' : ''}">${escapeXml(heading)}</h3>` : '<p class="zine-reader-hint">An open page. Add a heading in the editor.</p>'}
      <svg class="zine-reader-art" viewBox="0 0 280 88" aria-hidden="true">${artwork(theme, activePage + 1, 280, 88)}</svg>
      ${panel.body ? `<p class="zine-reader-body">${escapeXml(panel.body)}</p>` : '<p class="zine-reader-hint">Your words can go here.<br>This hint will not print.</p>'}
      <div class="zine-reader-footer"><span>${escapeXml(role)}</span><span>${String(activePage + 1).padStart(2, '0')}</span></div>`;
    const pageAnnouncement = find<HTMLElement>('.zine-page-announcement');
    pageAnnouncement.textContent = `${activePage + 1} / 8`;
    pageAnnouncement.setAttribute('aria-label', `Page ${activePage + 1} of 8, ${role}`);
    find<HTMLButtonElement>('[data-action="previous"]').disabled = activePage === 0;
    find<HTMLButtonElement>('[data-action="next"]').disabled = activePage === 7;
    const focusedPage = document.activeElement instanceof HTMLButtonElement && overview.contains(document.activeElement)
      ? document.activeElement.dataset.page : undefined;
    overview.innerHTML = draft.pages.map((item, index) => {
      const title = index === 0 ? draft.title : item.heading || 'An open page';
      const hasIssue = analysis.issues.some((issue) => issue.page === index || (index === 0 && issue.field === 'title'));
      return `<button type="button" class="zine-mini ${hasIssue ? 'zine-mini-error' : ''}" data-action="page" data-page="${index}" ${index === activePage ? 'aria-current="page"' : ''} aria-label="Page ${index + 1}${index === 0 ? ', front cover' : index === 7 ? ', back cover' : ''}: ${escapeXml(title)}${hasIssue ? '. Needs attention.' : ''}" title="${escapeXml(title)}">
        <span class="zine-mini-number">${String(index + 1).padStart(2, '0')}<span aria-hidden="true">${hasIssue ? '!' : index === 0 ? '↗' : index === 7 ? '•' : '—'}</span></span>
        <span class="zine-mini-title">${escapeXml(title || 'Untitled')}</span>
        <span class="zine-mini-rule" aria-hidden="true"></span>
      </button>`;
    }).join('');
    if (focusedPage !== undefined) {
      overview.querySelector<HTMLButtonElement>(`[data-page="${focusedPage}"]`)?.focus({ preventScroll: true });
    }
    if (mode === 'sheet') {
      if (analysis.issues.length) {
        sheet.innerHTML = `<div class="zine-sheet-problem"><strong>This sheet is not ready to print.</strong><p>${escapeXml(analysis.issues[0]!.message)}</p><p>Your full text is still in the reading copy and editor. Nothing has been trimmed to make it fit.</p></div>`;
      } else {
        sheet.innerHTML = makeSheetSvg(draft, theme, { guides, measure }).replace(/^<\?xml[^>]+\?>\s*/u, '');
      }
    }
    find<HTMLElement>('.zine-guide-key').hidden = !guides;
    find<HTMLElement>('.zine-sheet-size').textContent = `${PAPERS[draft.paper].name} · ${number(dimensions.width)} × ${number(dimensions.height)} mm · landscape · 100% scale${guides ? '' : ' · guides off'}`;
    exportPanes.select(exportPanes.selected);
    syncExport();
  }

  function renderEditor(): void {
    const draft = history.present;
    const panel = draft.pages[activePage]!;
    const layout = analysis.layouts[activePage];
    setInputValue(titleInput, draft.title);
    setInputValue(headingInput, panel.heading);
    setInputValue(bodyInput, panel.body);
    setInputValue(paperInput, draft.paper);
    find<HTMLElement>(`#${id}-title-count`).textContent = `${characterCount(draft.title)} / ${LIMITS.title} characters`;
    find<HTMLElement>(`#${id}-heading-count`).textContent = `${characterCount(panel.heading)} / ${LIMITS.heading} characters`;
    find<HTMLElement>(`#${id}-body-count`).textContent = `${characterCount(panel.body)} / ${bodyLimit(activePage)} characters · ${wordCount(panel.body)} words`;
    find<HTMLElement>(`#${id}-editor-heading`).textContent = activePage === 0 ? '01 / The front cover' : activePage === 7 ? '08 / The back cover' : `${String(activePage + 1).padStart(2, '0')} / Inside the book`;
    find<HTMLElement>('.zine-panel-heading-label').textContent = activePage === 0 ? 'Cover subtitle' : activePage === 7 ? 'Back cover heading' : 'Page heading';
    const titleError = analysis.issues.find((issue) => issue.field === 'title');
    const headingError = analysis.issues.find((issue) => issue.field === 'heading' && issue.page === activePage);
    const bodyError = analysis.issues.find((issue) => issue.field === 'body' && issue.page === activePage);
    const fieldErrors = [
      { input: titleInput, field: 'title', error: titleError },
      { input: headingInput, field: 'heading', error: headingError },
      { input: bodyInput, field: 'body', error: bodyError },
    ];
    for (const { input, field, error } of fieldErrors) {
      input.setAttribute('aria-invalid', String(Boolean(error)));
      find<HTMLElement>(`#${id}-${field}-error`).textContent = error?.message ?? '';
    }
    const fit = find<HTMLElement>('.zine-fit-status');
    const activeIssue = titleError && activePage === 0 ? titleError : headingError || bodyError;
    fit.classList.toggle('zine-fit-problem', Boolean(activeIssue));
    if (activeIssue) fit.textContent = 'Needs a little editing. No text has been lost.';
    else if (layout) fit.textContent = panel.body
      ? `Ready for paper · ${layout.bodyPoints.toFixed(1)} pt text · ${layout.blocks.find((block) => block.field === 'body')?.lines.length ?? 0} printed lines`
      : 'An open page is allowed. Only your words and artwork will print.';
    else fit.textContent = 'Fix the flagged text to check the complete sheet.';
    root.querySelectorAll<HTMLButtonElement>('[data-action="theme"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.theme === draft.theme));
    });
    find<HTMLButtonElement>('[data-action="undo"]').disabled = history.past.length === 0;
    find<HTMLButtonElement>('[data-action="redo"]').disabled = history.future.length === 0;
    downloadButton.disabled = analysis.issues.length > 0;
    find<HTMLElement>('.zine-download-label').textContent = `Download ${PAPERS[draft.paper].name} sheet`;
    find<HTMLElement>('.zine-export-warning').textContent = analysis.issues.length
      ? `Export paused: ${analysis.issues[0]!.message.split('. ')[0]}` : '';
    const saved = find<HTMLElement>('.zine-save-status');
    saved.textContent = saveMessage;
    saved.classList.toggle('zine-save-problem', saveProblem);
    const summary = saveProblem
      ? analysis.issues.length ? 'Not saved yet · Details' : 'Local saving unavailable · Details'
      : saveMessage.startsWith('Your draft stays') ? 'Local draft · Save details' : 'Local draft saved · Details';
    if (saveButton.textContent !== summary) saveButton.textContent = summary;
    saveButton.classList.toggle('zine-save-problem', saveProblem);
  }

  function refresh(persist = false): void {
    analysis = analyzeDocument(history.present, THEMES[history.present.theme], measure);
    if (persist) {
      if (analysis.issues.length) {
        saveMessage = 'Not saved yet: fix the flagged text. Previously saved work is unchanged; keep this tab open to retain these edits.';
        saveProblem = true;
      } else {
        const saved = saveDraft(storageAccess, history.present);
        saveMessage = saved ? 'Saved on this device. Your words never leave this browser.'
          : 'Local saving is unavailable. Keep this tab open, or download the sheet to keep your work.';
        saveProblem = !saved;
      }
    }
    renderPreview();
    renderEditor();
  }

  function edit(next: ZineDocument, key = ''): void {
    const now = performance.now();
    changeDocument(history, next, key !== '' && key === lastEditKey && now - lastEditAt < 1500);
    lastEditKey = key;
    lastEditAt = now;
    notice.textContent = '';
    refresh(true);
  }

  function selectPage(index: number): void {
    if (index < 0 || index > 7 || !Number.isInteger(index)) return;
    activePage = index;
    lastEditKey = '';
    renderPreview();
    renderEditor();
  }

  function applyHistory(direction: 'undo' | 'redo'): void {
    const changed = direction === 'undo' ? undo(history) : redo(history);
    if (!changed) return;
    lastEditKey = '';
    refresh(true);
    announce(direction === 'undo' ? 'Undid the last change.' : 'Redid the last change.');
  }

  function returnToWorktable(): void {
    libraryDialog.close();
    const target = panes.selected === 'write' ? (activePage === 0 ? titleInput : bodyInput) : reader;
    target.focus({ preventScroll: true });
  }

  function handleTextInput(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const next = cloneDocument(history.present);
    if (target.name === 'zine-title') next.title = target.value;
    else if (target.name === 'panel-heading') next.pages[activePage]!.heading = target.value;
    else if (target.name === 'panel-body') next.pages[activePage]!.body = normalizeNewlines(target.value);
    else return;
    edit(next, `${target.name}-${activePage}`);
  }

  function download(): void {
    if (analysis.issues.length) {
      announce('Shorten the flagged text before exporting. All your words are still in the editor.');
      return;
    }
    try {
      const svg = makeSheetSvg(history.present, THEMES[history.present.theme], { guides, measure });
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      downloadUrls.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFor(history.present);
      link.hidden = true;
      root.append(link);
      link.click();
      link.remove();
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.delete(url);
        downloadTimers.delete(timer);
      }, 1500);
      downloadTimers.add(timer);
      announce(`${PAPERS[history.present.paper].name} SVG downloaded. Print landscape, single-sided, at 100% actual size. Then follow the folding guide.`);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      announce('The browser could not create the download. Your draft is still here; try again or copy your text before leaving.', true);
    }
  }

  root.addEventListener('input', (event) => {
    if (event instanceof InputEvent && event.isComposing) return;
    handleTextInput(event.target);
  }, { signal });
  root.addEventListener('compositionend', (event) => handleTextInput(event.target), { signal });
  root.addEventListener('focusout', () => { lastEditKey = ''; }, { signal });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === 'paper') {
      if (target.value !== 'a4' && target.value !== 'letter') {
        announce('Choose A4 or US Letter. Your previous paper size is unchanged.', true);
        target.value = history.present.paper;
        return;
      }
      const next = cloneDocument(history.present);
      next.paper = target.value;
      edit(next);
    } else if (target instanceof HTMLInputElement && target.name === 'guides') {
      guides = target.checked;
      renderPreview();
    }
  }, { signal });
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    if (!target || target.disabled || !root.contains(target)) return;
    switch (target.dataset.action) {
      case 'edit-page':
        panes.select('write');
        (activePage === 0 ? titleInput : bodyInput).focus({ preventScroll: true });
        break;
      case 'starter': {
        const starter = STARTERS.find((item) => item.id === target.dataset.starter);
        if (!starter) return;
        const next = makeStarter(starter.id);
        next.paper = history.present.paper;
        edit(next);
        announce(`Loaded “${starter.name}”. Undo restores your previous draft.`);
        returnToWorktable();
        break;
      }
      case 'blank': {
        const next = makeBlank();
        next.paper = history.present.paper;
        next.theme = history.present.theme;
        edit(next);
        announce('Eight open pages, ready for your words. Undo restores your previous draft.');
        returnToWorktable();
        break;
      }
      case 'undo':
      case 'redo': applyHistory(target.dataset.action); break;
      case 'page':
        mode = 'read';
        selectPage(Number(target.dataset.page));
        break;
      case 'previous': selectPage(activePage - 1); break;
      case 'next': selectPage(activePage + 1); break;
      case 'mode':
        mode = target.dataset.mode === 'sheet' ? 'sheet' : 'read';
        if (mode === 'sheet') exportPanes.select('sheet');
        renderPreview();
        if (mode === 'sheet') exportDialog.open();
        else panes.select('read');
        break;
      case 'theme': {
        const themeId = THEME_IDS.find((theme) => theme === target.dataset.theme);
        if (!themeId) {
          announce('That ink treatment is not available. Choose one of the three studio styles.', true);
          return;
        }
        const next = cloneDocument(history.present);
        next.theme = themeId;
        edit(next);
        break;
      }
      case 'download': download(); break;
    }
  }, { signal });
  find('[data-open-export]').addEventListener('click', () => {
    mode = 'sheet';
    exportPanes.select('output');
    renderPreview();
    exportDialog.open();
  }, { signal });
  root.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? 'redo' : 'undo');
    } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      applyHistory('redo');
    } else if (!event.ctrlKey && !event.metaKey && event.target instanceof Element &&
      (readView.contains(event.target) || pageNavigation.contains(event.target)) && !event.target.matches('input, textarea, select')) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectPage(activePage - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectPage(activePage + 1);
      }
    }
  }, { signal });
  page.onCleanup(() => {
    for (const timer of downloadTimers) window.clearTimeout(timer);
    for (const url of downloadUrls) URL.revokeObjectURL(url);
    downloadTimers.clear();
    downloadUrls.clear();
  });

  refresh();
  if (!measurementContext) announce('This browser cannot measure system fonts. The sheet uses conservative text estimates; print a proof copy first.');
  return { destroy: page.destroy };
}
