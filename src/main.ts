import './style.css';
import { categories, categoryNames, isCategory, projects } from './catalog';
import { escapeMarkup } from './core/markup';
import { collectTags, matchesTags, normalizeTag } from './core/tags';
import { projectUrl, siteBase, siteUrl } from './core/urls';
import type { Category, Project, ProjectInstance } from './core/types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.7"/></svg>';
const diagonal = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" stroke-width="1.7"/></svg>';
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7"/></svg>';
const codeIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const mark = '<svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><ellipse cx="20" cy="20" rx="17" ry="10" transform="rotate(-40 20 20)" stroke="currentColor" stroke-width="2.8"/><circle cx="31" cy="11" r="4.5" fill="currentColor"/></svg>';
const storageKey = 'odd-index:library:v2';
const projectTags = collectTags(projects);
const tagLabels = new Map(projectTags.map((tag) => [tag.key, tag.label]));
let storageWarning = '';

interface LibraryState {
  category: Category | 'all';
  query: string;
  layout: 'grid' | 'list';
  sort: 'discover' | 'newest' | 'az';
  scroll: number;
  tags: string[];
}

interface SavedLibraryState extends Omit<LibraryState, 'tags'> {
  tags?: string[];
}

function validLibraryState(value: unknown): value is SavedLibraryState {
  return typeof value === 'object' && value !== null &&
    'category' in value && (value.category === 'all' || isCategory(value.category)) &&
    'query' in value && typeof value.query === 'string' && value.query.length <= 200 &&
    'layout' in value && (value.layout === 'grid' || value.layout === 'list') &&
    'sort' in value && ['discover', 'newest', 'az'].some((sort) => sort === value.sort) &&
    'scroll' in value && typeof value.scroll === 'number' && Number.isFinite(value.scroll) && value.scroll >= 0 &&
    (!('tags' in value) || (Array.isArray(value.tags) && value.tags.length <= 1000 &&
      value.tags.every((tag: unknown) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 1000)));
}

function readLibraryState(): LibraryState {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (validLibraryState(parsed)) {
        const previousTags = [...new Set((parsed.tags || []).map(normalizeTag))];
        const tags = previousTags.filter((tag) => tagLabels.has(tag));
        if (tags.length !== previousTags.length) storageWarning = 'Some saved tags are no longer available. Your other browse settings were restored.';
        return { category: parsed.category, query: parsed.query, layout: parsed.layout, sort: parsed.sort, scroll: parsed.scroll, tags };
      }
      storageWarning = 'Your previous browse settings could not be restored.';
    }
  } catch (error) {
    if (!(error instanceof DOMException) && !(error instanceof SyntaxError)) throw error;
    storageWarning = 'Browse settings cannot be saved in this browser session.';
    console.warn(storageWarning, error);
  }
  return { category: 'all', query: '', layout: 'grid', sort: 'discover', scroll: 0, tags: [] };
}

let library = readLibraryState();
let routeController = new AbortController();
let instance: ProjectInstance | undefined;
let activeProject: Project | undefined;
let closeFloatingMenu: ((restoreFocus?: boolean) => void) | undefined;
let reportTimer = 0;
let mountGeneration = 0;

function saveLibrary() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(library));
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    storageWarning = 'Browse settings cannot be saved in this browser session.';
    console.warn(storageWarning, error);
    const note = app.querySelector<HTMLElement>('[data-storage-note]');
    if (note) { note.textContent = storageWarning; note.hidden = false; }
  }
}

function rememberListPosition() {
  const grid = app.querySelector<HTMLElement>('[data-project-grid]');
  if (grid) library.scroll = grid.scrollTop;
  saveLibrary();
}

function sourceUrl(project: Project): string {
  return `https://github.com/HSPK/collections/tree/main/${project.sourcePath}`;
}

function categoryIcon(category: Category): string {
  const paths: Record<Category, string> = {
    create: '<path d="m5 16-1 4 4-1L20 7l-3-3L5 16Zm9-9 3 3"/>',
    play: '<path d="M7 7h10l4 10-3 2-4-4h-4l-4 4-3-2L7 7Z"/><path d="M7 10v4m-2-2h4m7-1h.01m2 2h.01"/>',
    read: '<path d="M12 6c-3-3-7-2-9-1v14c3-2 6-2 9 0 3-2 6-2 9 0V5c-2-1-6-2-9 1Zm0 0v13"/>',
    learn: '<path d="M8 3h8M10 3v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M7 15h10"/>',
    explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
    art: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9" transform="rotate(40 12 12)"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[category]}</svg>`;
}

function header() {
  return `<header class="site-header">
    <a class="brand" href="${siteUrl()}" aria-label="Odd Index home">${mark}<span>odd/index</span></a>
    <nav class="main-nav" aria-label="Main navigation">
      <button type="button" data-about>About</button>
      <a class="header-code" href="https://github.com/HSPK/collections" target="_blank" rel="noopener noreferrer" aria-label="Collection source code">${codeIcon}<span>Source</span></a>
      <a class="header-contribute" href="https://github.com/HSPK/collections/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Contribute</a>
    </nav>
  </header>`;
}

function bindCommon(signal: AbortSignal) {
  app.querySelectorAll('[data-about]').forEach((button) => button.addEventListener('click', () => aboutDialog.showModal(), { signal }));
  app.querySelectorAll('[data-search]').forEach((button) => button.addEventListener('click', openSearch, { signal }));
}

function queryMatches(project: Project): boolean {
  const words = library.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const haystack = projectSearchText(project);
  return words.every((word) => haystack.includes(word));
}

function projectSearchText(project: Project): string {
  const runtime = project.runtime === 'openai-compatible' ? 'openai-compatible openai api model required agent' : '';
  return `${project.title} ${project.subtitle} ${project.description} ${project.medium} ${project.tags.join(' ')} ${categoryNames[project.category]} ${runtime}`.toLowerCase();
}

function discoveryOrder(items: Project[]): Project[] {
  const pools = categories.map((category) => items.filter((project) => project.category === category.id).sort((a, b) => b.order - a.order));
  const result: Project[] = [];
  while (pools.some((pool) => pool.length)) {
    for (const pool of pools) {
      const item = pool.shift();
      if (item) result.push(item);
    }
  }
  return result;
}

function card(project: Project) {
  const requiresModel = project.runtime === 'openai-compatible';
  return `<article class="project-card" data-category="${project.category}" data-runtime="${project.runtime ?? 'local'}">
    <a class="project-open" data-project="${project.id}" href="${projectUrl(project.id)}" aria-label="${escapeMarkup(project.title)}: ${escapeMarkup(project.subtitle)}"${requiresModel ? ` aria-describedby="requirement-${project.id}"` : ''}>
      <div class="card-art" style="--art-color:${project.color};--art-ink:${project.ink}">
        <div class="card-placeholder" aria-hidden="true"><span>${escapeMarkup(project.medium)}</span><strong>${escapeMarkup(project.title)}</strong></div>
        <img src="${siteUrl(project.preview || `previews/${project.id}.jpg`)}" alt="${escapeMarkup(project.title)} website preview" loading="lazy" decoding="async" width="1200" height="800" />
        <span class="card-open-indicator">${diagonal}</span>
      </div>
      <div class="card-copy"><div class="card-heading"><h2>${escapeMarkup(project.title)}</h2>${requiresModel ? `<span class="card-requirement" id="requirement-${project.id}" title="Bring your own OpenAI-compatible model connection.">API required</span>` : ''}</div><p>${escapeMarkup(project.description)}</p></div>
    </a>
    <div class="card-tags">${project.tags.slice(0, 3).map((tag) => `<span>${escapeMarkup(tag)}</span>`).join('')}</div>
    <footer class="card-footer"><span>${categoryIcon(project.category)}${categoryNames[project.category]}</span><a href="${sourceUrl(project)}" target="_blank" rel="noopener noreferrer" aria-label="View source for ${escapeMarkup(project.title)}">${codeIcon}</a></footer>
  </article>`;
}

function tagControls(instance: 'sidebar' | 'dialog') {
  return `<section class="library-tag-panel" data-tag-panel aria-label="Tag filters">
    <div class="tag-panel-heading"><h2>Tags <span data-selected-tag-count></span></h2><button type="button" data-clear-tags hidden>Clear tags</button></div>
    <p class="tag-match-note">Match all selected tags.</p>
    <div class="tag-selection" data-tag-selection role="group" aria-label="Selected tags" hidden></div>
    <label class="tag-search"><span class="sr-only">Search tags</span>${searchIcon}<input type="search" data-tag-search maxlength="80" placeholder="Find a tag..." autocomplete="off" spellcheck="false" /></label>
    <div class="tag-options" role="group" aria-label="Available tags">
      ${projectTags.map((tag, index) => `<label class="tag-option" data-tag-option="${escapeMarkup(tag.key)}" for="tag-${instance}-${index}"><input id="tag-${instance}-${index}" type="checkbox" data-tag-key="${escapeMarkup(tag.key)}" /><span class="tag-label">${escapeMarkup(tag.label)}</span><span class="tag-count" data-tag-count aria-hidden="true">${tag.count}</span></label>`).join('')}
      <p class="tag-search-empty" data-tag-search-empty hidden>No matching tags.</p>
    </div>
  </section>`;
}

function filterTagOptions(panel: HTMLElement) {
  const query = normalizeTag(panel.querySelector<HTMLInputElement>('[data-tag-search]')!.value);
  let visible = 0;
  panel.querySelectorAll<HTMLElement>('[data-tag-option]').forEach((row) => {
    row.hidden = !row.dataset.tagOption!.includes(query);
    if (!row.hidden) visible++;
  });
  panel.querySelector<HTMLElement>('[data-tag-search-empty]')!.hidden = visible !== 0;
}

function updateTagControls(filtered: Project[]) {
  const selected = new Set(library.tags);
  const counts = new Map(collectTags(filtered).map((tag) => [tag.key, tag.count]));
  app.querySelectorAll<HTMLElement>('[data-tag-panel]').forEach((panel) => {
    panel.querySelector<HTMLElement>('[data-selected-tag-count]')!.textContent = selected.size ? `(${selected.size})` : '';
    panel.querySelector<HTMLButtonElement>('[data-clear-tags]')!.hidden = selected.size === 0;
    panel.querySelectorAll<HTMLInputElement>('[data-tag-key]').forEach((input) => {
      const key = input.dataset.tagKey!;
      const count = counts.get(key) || 0;
      input.checked = selected.has(key);
      input.disabled = count === 0 && !input.checked;
      const row = input.closest<HTMLElement>('[data-tag-option]')!;
      row.classList.toggle('tag-option--unavailable', input.disabled);
      row.querySelector<HTMLElement>('[data-tag-count]')!.textContent = String(count);
    });
    const chips = panel.querySelector<HTMLElement>('[data-tag-selection]')!;
    chips.hidden = selected.size === 0;
    chips.replaceChildren(...library.tags.map((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-chip';
      button.dataset.removeTag = key;
      const label = tagLabels.get(key)!;
      button.setAttribute('aria-label', `Remove ${label} tag`);
      button.title = label;
      const name = document.createElement('span');
      name.textContent = label;
      const close = document.createElement('span');
      close.setAttribute('aria-hidden', 'true');
      close.textContent = '×';
      button.append(name, close);
      return button;
    }));
    filterTagOptions(panel);
  });
  const count = app.querySelector<HTMLElement>('[data-tags-count]');
  if (count) { count.hidden = selected.size === 0; count.textContent = String(selected.size); }
  app.querySelector('[data-open-tags]')?.classList.toggle('has-tags', selected.size > 0);
  const apply = app.querySelector<HTMLElement>('[data-tags-apply]');
  if (apply) apply.textContent = `Show ${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}`;
  const status = app.querySelector<HTMLElement>('[data-tags-result]');
  if (status) status.textContent = selected.size ? `${selected.size} selected. Counts include your current search and project type.` : 'Choose one or more tags. Counts include your current search and project type.';
}

function bindTagControls(signal: AbortSignal) {
  const change = (tags: string[]) => {
    library.tags = [...new Set(tags)];
    library.scroll = 0;
    saveLibrary();
    updateLibrary();
  };
  app.querySelectorAll<HTMLElement>('[data-tag-panel]').forEach((panel) => {
    const search = panel.querySelector<HTMLInputElement>('[data-tag-search]')!;
    search.addEventListener('input', () => filterTagOptions(panel), { signal });
    panel.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-tag-key')) return;
      const key = input.dataset.tagKey;
      if (!key || !tagLabels.has(key)) throw new Error('Unknown project tag.');
      change(input.checked ? [...library.tags, key] : library.tags.filter((tag) => tag !== key));
      if (input.disabled) search.focus();
    }, { signal });
    panel.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!button) return;
      if (button.hasAttribute('data-clear-tags')) {
        change([]);
        search.focus();
      } else if (button.dataset.removeTag) {
        change(library.tags.filter((tag) => tag !== button.dataset.removeTag));
        search.focus();
      }
    }, { signal });
  });
}

function updateLibrary() {
  const grid = app.querySelector<HTMLElement>('[data-project-grid]');
  if (!grid) return;
  const matches = projects.filter((project) => queryMatches(project) && matchesTags(project, library.tags));
  let filtered = matches.filter((project) => library.category === 'all' || project.category === library.category);
  if (library.sort === 'discover') filtered = discoveryOrder(filtered);
  else if (library.sort === 'newest') filtered.sort((a, b) => b.order - a.order);
  else filtered.sort((a, b) => a.title.localeCompare(b.title));
  grid.className = `project-grid${library.layout === 'list' ? ' project-grid--list' : ''}`;
  grid.innerHTML = filtered.length ? filtered.map(card).join('') : `<div class="empty-results"><h2>No projects found.</h2><p>Try another search, project type, or tag.</p><button class="app-button" type="button" data-clear-filters>Clear filters</button></div>`;
  grid.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.addEventListener('error', () => { image.hidden = true; }, { once: true, signal: routeController.signal });
  });
  grid.querySelectorAll<HTMLAnchorElement>('.project-open').forEach((link) => {
    link.addEventListener('click', rememberListPosition, { signal: routeController.signal });
  });
  grid.querySelector('[data-clear-filters]')?.addEventListener('click', resetFilters, { signal: routeController.signal });
  app.querySelectorAll<HTMLElement>('[data-category-count]').forEach((label) => {
    label.textContent = String(label.dataset.categoryCount === 'all' ? matches.length : matches.filter((project) => project.category === label.dataset.categoryCount).length);
  });
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === library.category)));
  app.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.layout === library.layout)));
  const select = app.querySelector<HTMLSelectElement>('[data-mobile-category]');
  if (select) select.value = library.category;
  const status = app.querySelector('[data-result-count]');
  if (status) status.textContent = `${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}${library.category === 'all' ? '' : ` in ${categoryNames[library.category]}`}`;
  const clear = app.querySelector<HTMLButtonElement>('[data-clear-search]');
  if (clear) clear.hidden = !library.query;
  updateTagControls(filtered);
  grid.scrollTop = library.scroll;
}

function resetFilters() {
  library.category = 'all';
  library.query = '';
  library.tags = [];
  library.scroll = 0;
  const input = app.querySelector<HTMLInputElement>('[data-library-search]');
  if (input) input.value = '';
  app.querySelectorAll<HTMLInputElement>('[data-tag-search]').forEach((search) => { search.value = ''; });
  saveLibrary();
  updateLibrary();
  input?.focus();
}

function renderLibrary() {
  routeController.abort();
  routeController = new AbortController();
  const signal = routeController.signal;
  document.title = 'Odd Index - Small websites. Wide possibilities.';
  document.body.classList.add('library-mode');
  app.className = 'library-root';
  app.innerHTML = `${header()}
    <main id="main-content" class="library-shell" tabindex="-1">
      <aside class="library-sidebar" aria-label="Project filters">
        <h2>Explore projects</h2>
        <nav class="category-nav" aria-label="Browse by type">
          <button type="button" data-filter="all" aria-pressed="true"><span class="all-icon" aria-hidden="true">+</span><span>All projects</span><span data-category-count="all">${projects.length}</span></button>
          ${categories.map((category) => `<button type="button" data-filter="${category.id}" aria-pressed="false">${categoryIcon(category.id)}<span>${category.label}</span><span data-category-count="${category.id}"></span></button>`).join('')}
        </nav>
        ${tagControls('sidebar')}
        <div class="sidebar-note"><p>Independent websites.<br>Different ways to be curious.</p><a href="https://github.com/HSPK/collections/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Add your AI-made site ${diagonal}</a></div>
      </aside>
      <section class="library-content" id="index" aria-labelledby="library-title">
        <h1 id="library-title" class="sr-only">Project library</h1>
        <div class="library-tools">
          <div class="library-search">${searchIcon}<label class="sr-only" for="library-search">Search projects</label><input id="library-search" data-library-search type="search" maxlength="200" placeholder="Search projects, ideas, or tags..." autocomplete="off" spellcheck="false" /><button type="button" data-clear-search aria-label="Clear search" hidden>&times;</button><kbd>/</kbd></div>
          <label class="sort-label"><span class="sr-only">Sort projects</span><select aria-label="Sort projects" data-sort><option value="discover">Discover</option><option value="newest">Recently added</option><option value="az">A to Z</option></select></label>
          <div class="layout-switch" role="group" aria-label="Collection layout"><button type="button" data-layout="grid" aria-label="Grid view" aria-pressed="true"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2h6v6H2zm10 0h6v6h-6zM2 12h6v6H2zm10 0h6v6h-6z" fill="currentColor"/></svg></button><button type="button" data-layout="list" aria-label="List view" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 3h16v2H2zm0 6h16v2H2zm0 6h16v2H2z" fill="currentColor"/></svg></button></div>
        </div>
        <div class="results-line"><p role="status" aria-live="polite" data-result-count></p><label class="mobile-category"><span class="sr-only">Project type</span><select aria-label="Project type" data-mobile-category><option value="all">All types</option>${categories.map((category) => `<option value="${category.id}">${category.label}</option>`).join('')}</select></label><button class="mobile-tags-button" type="button" data-open-tags aria-label="Filter projects by tags" aria-haspopup="dialog" aria-controls="library-tags-dialog" aria-expanded="false">Tags <span data-tags-count hidden></span></button><span class="local-note"><span></span>API games are labeled</span></div>
        <p class="storage-note" data-storage-note ${storageWarning ? '' : 'hidden'}>${escapeMarkup(storageWarning)}</p>
        <div class="project-grid" data-project-grid role="region" aria-label="Project list" tabindex="0"></div>
      </section>
    </main>`;
  const tagsDialog = makeDialog('library-tags-dialog', 'library-tags-title', `<div class="dialog-top"><h2 id="library-tags-title">Filter by tags</h2><button class="dialog-close" type="button" aria-label="Close tag filters">&times;</button></div>${tagControls('dialog')}<p class="tag-dialog-result" data-tags-result role="status"></p><button class="tag-apply" type="button" data-tags-apply>Show projects</button>`, app);
  tagsDialog.id = 'library-tags-dialog';
  const openTags = app.querySelector<HTMLButtonElement>('[data-open-tags]')!;
  openTags.addEventListener('click', () => {
    tagsDialog.showModal();
    openTags.setAttribute('aria-expanded', 'true');
    tagsDialog.querySelector<HTMLInputElement>('[data-tag-search]')!.focus();
  }, { signal });
  tagsDialog.querySelector('[data-tags-apply]')!.addEventListener('click', () => tagsDialog.close(), { signal });
  tagsDialog.addEventListener('close', () => {
    openTags.setAttribute('aria-expanded', 'false');
    if (openTags.getClientRects().length) openTags.focus({ preventScroll: true });
    else app.querySelector<HTMLInputElement>('.library-sidebar [data-tag-search]')?.focus({ preventScroll: true });
  }, { signal });
  signal.addEventListener('abort', () => tagsDialog.close(), { once: true });
  bindTagControls(signal);
  bindCommon(signal);
  const input = app.querySelector<HTMLInputElement>('[data-library-search]')!;
  input.value = library.query;
  const sort = app.querySelector<HTMLSelectElement>('[data-sort]')!;
  sort.value = library.sort;
  input.addEventListener('input', () => { library.query = input.value; library.scroll = 0; saveLibrary(); updateLibrary(); }, { signal });
  app.querySelector('[data-clear-search]')?.addEventListener('click', () => { input.value = ''; library.query = ''; library.scroll = 0; saveLibrary(); updateLibrary(); input.focus(); }, { signal });
  const changeCategory = (value: string) => {
    if (value !== 'all' && !isCategory(value)) return;
    library.category = value;
    library.scroll = 0;
    saveLibrary();
    updateLibrary();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.addEventListener('click', () => changeCategory(button.dataset.filter || 'all'), { signal }));
  app.querySelector<HTMLSelectElement>('[data-mobile-category]')?.addEventListener('change', (event) => {
    if (event.currentTarget instanceof HTMLSelectElement) changeCategory(event.currentTarget.value);
  }, { signal });
  sort.addEventListener('change', () => {
    const value = sort.value;
    if (value === 'discover' || value === 'newest' || value === 'az') { library.sort = value; library.scroll = 0; saveLibrary(); updateLibrary(); }
  }, { signal });
  app.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => button.addEventListener('click', () => {
    library.layout = button.dataset.layout === 'list' ? 'list' : 'grid';
    saveLibrary();
    updateLibrary();
  }, { signal }));
  updateLibrary();
  const grid = app.querySelector<HTMLElement>('[data-project-grid]')!;
  grid.addEventListener('scroll', () => { library.scroll = grid.scrollTop; }, { passive: true, signal });
  requestAnimationFrame(() => { if (!signal.aborted) grid.scrollTop = library.scroll; });
}

function floatingMenu(project: Project) {
  const position = projects.indexOf(project);
  const previous = projects[(position + projects.length - 1) % projects.length];
  const next = projects[(position + 1) % projects.length];
  return `<div class="collection-menu" data-collection-menu>
    <button class="collection-menu-toggle" type="button" aria-label="Collection menu" aria-expanded="false" aria-controls="collection-menu-panel" data-menu-toggle>${mark}</button>
    <nav class="collection-menu-panel" id="collection-menu-panel" aria-label="Collection navigation" hidden>
      <div class="collection-menu-heading"><strong>${escapeMarkup(project.title)}</strong><span>${categoryNames[project.category]}</span></div>
      <a href="${siteUrl()}" aria-label="Back to index">${arrow}<span>All projects</span></a>
      <button type="button" data-search>${searchIcon}<span>Search projects</span></button>
      <button type="button" data-project-info aria-label="About this project"><span class="menu-info-icon" aria-hidden="true">i</span><span>About this project</span></button>
      <a href="${sourceUrl(project)}" target="_blank" rel="noopener noreferrer">${codeIcon}<span>Source & notes</span></a>
      <div class="collection-menu-pager"><a href="${projectUrl(previous.id)}" aria-label="Previous project: ${escapeMarkup(previous.title)}">${arrow}<span>Previous</span></a><a href="${projectUrl(next.id)}" aria-label="Next project: ${escapeMarkup(next.title)}"><span>Next</span>${arrow}</a></div>
    </nav>
  </div>`;
}

function bindFloatingMenu(signal: AbortSignal) {
  const menu = app.querySelector<HTMLElement>('[data-collection-menu]')!;
  const toggle = menu.querySelector<HTMLButtonElement>('[data-menu-toggle]')!;
  const panel = menu.querySelector<HTMLElement>('#collection-menu-panel')!;
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  closeFloatingMenu = close;
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }, { signal });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) close();
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  }, { signal });
  menu.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !menu.contains(event.relatedTarget)) close();
  }, { signal });
}

function destroyProject() {
  routeController.abort();
  instance?.destroy();
  instance = undefined;
  closeFloatingMenu = undefined;
  window.clearTimeout(reportTimer);
}

async function renderProject(project: Project) {
  const generation = ++mountGeneration;
  destroyProject();
  routeController = new AbortController();
  const signal = routeController.signal;
  activeProject = project;
  document.body.classList.remove('library-mode');
  document.title = `${project.title} - Odd Index`;
  app.className = 'standalone-root';
  app.innerHTML = `
    <main id="main-content" class="standalone-site" tabindex="-1">
      <div class="project-surface" data-stage data-experiment="${project.id}" data-format="${project.format}" aria-label="${escapeMarkup(project.title)} website">
        <div class="project-loading" role="status"><span class="loading-orbit"></span>Opening ${escapeMarkup(project.title)}...</div>
      </div>
      <div data-project-controls hidden></div>
    </main>
    ${floatingMenu(project)}
    <div class="project-feedback" data-feedback hidden><p role="status" aria-live="polite" data-report></p><button type="button" aria-label="Dismiss message" data-dismiss-feedback>&times;</button></div>`;
  bindFloatingMenu(signal);
  bindCommon(signal);
  app.querySelector('[data-project-info]')?.addEventListener('click', () => {
    closeFloatingMenu?.(true);
    projectInfo.querySelector('h2')!.textContent = project.title;
    projectInfo.querySelector('[data-info-description]')!.textContent = project.description;
    projectInfo.querySelector('[data-info-medium]')!.textContent = `${categoryNames[project.category]} / ${project.medium}`;
    projectInfo.querySelector('[data-info-runtime]')!.textContent = project.runtime === 'openai-compatible' ?
      'Requires your own OpenAI-compatible model connection. Game observations are sent only when you request a turn. The collection does not provide hosted inference; provider charges may apply.' :
      'This project runs locally in your browser and does not require a hosted model.';
    const link = projectInfo.querySelector<HTMLAnchorElement>('a')!;
    link.href = sourceUrl(project);
    projectInfo.showModal();
  }, { signal });
  const container = app.querySelector<HTMLElement>('[data-stage]')!;
  const controls = app.querySelector<HTMLElement>('[data-project-controls]')!;
  const reportElement = app.querySelector<HTMLElement>('[data-report]')!;
  const feedback = app.querySelector<HTMLElement>('[data-feedback]');
  app.querySelector('[data-dismiss-feedback]')?.addEventListener('click', () => { if (feedback) feedback.hidden = true; }, { signal });
  try {
    const module = await project.load();
    if (signal.aborted) return;
    container.replaceChildren();
    const mounted = await module.mount({
      container, controls, signal, reducedMotion: motionPreference.matches,
      report(message) {
        if (signal.aborted) return;
        reportElement.textContent = message;
        if (feedback) {
          feedback.hidden = false;
          window.clearTimeout(reportTimer);
          reportTimer = window.setTimeout(() => { feedback.hidden = true; }, 7000);
        }
      },
    });
    if (signal.aborted || generation !== mountGeneration) { mounted.destroy(); return; }
    instance = mounted;
    container.dataset.ready = 'true';
  } catch (error) {
    if (signal.aborted) return;
    console.error(`Could not open ${project.title}.`, error);
    controls.replaceChildren();
    container.innerHTML = `<div class="project-error" role="alert"><h1>This website could not be opened.</h1><p data-error-message></p><p>Try a current browser with hardware acceleration for 3D projects, or explore a Canvas website instead.</p><div><a class="app-button" href="${projectUrl('flow')}">Try Flow State instead</a><a class="app-button app-button--quiet" href="${siteUrl()}">All projects</a></div></div>`;
    container.querySelector('[data-error-message]')!.textContent = error instanceof Error ? error.message : 'The project could not be started.';
    reportElement.textContent = 'Project unavailable. See the message above.';
  }
}

function renderNotFound() {
  document.body.classList.remove('library-mode');
  document.title = 'Project not found - Odd Index';
  app.className = 'library-root';
  app.innerHTML = `${header()}<main id="main-content" class="not-found" tabindex="-1"><span>404 / Project not found</span><h1>A little too far.</h1><p>That project is not in the collection. There are ${projects.length} other places to start.</p><a class="app-button" href="${siteUrl()}">Find your way back ${arrow}</a></main>`;
  bindCommon(routeController.signal);
}

function openLibraryRoute() {
  const hash = location.hash || '#/';
  const oldProject = /^#\/(?:experiment|project)\/([a-z][a-z0-9-]*)\/?$/.exec(hash);
  if (oldProject) {
    const project = projects.find((item) => item.id === oldProject[1]);
    if (project) location.replace(projectUrl(project.id));
    else renderNotFound();
    return;
  }
  if (!['#/', '#/index', '#index', '#main-content', ''].includes(hash)) { renderNotFound(); return; }
  renderLibrary();
}

function makeDialog(className: string, labelledBy: string, html: string, parent: HTMLElement = document.body): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = className;
  dialog.setAttribute('aria-labelledby', labelledBy);
  dialog.innerHTML = html;
  parent.append(dialog);
  dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  return dialog;
}

const aboutDialog = makeDialog('about-dialog', 'about-title', `<div class="dialog-top"><h2 id="about-title">A collection, not a template.</h2><button class="dialog-close" type="button" aria-label="Close about dialog">&times;</button></div><p>Odd Index collects independent, AI-made websites: useful little tools, original games, invented worlds, stories, and visual experiments.</p><p>Each project has its own page and its own point of view. Open one, use it, read it, or take apart its source code.</p><div class="about-facts"><strong>${projects.length} projects</strong><span>Static hosting</span><span>No collection account</span></div><p>Most projects work entirely on your device. Games marked <strong>API required</strong> send fictional game observations to the model endpoint you configure, only when you request a turn. The collection does not provide hosted inference. Provider charges and browser connection restrictions may apply; optional browser keys remain in memory, not saved progress.</p><p>Work and progress can be saved on your device. Sound and optional microphone input are off until explicitly enabled. Microphone signals stay on your device and are not recorded. Fictional worlds are labeled as fiction.</p><a class="text-link" href="https://github.com/HSPK/collections/blob/main/src/projects/README.md" target="_blank" rel="noopener noreferrer">How the independent project system works ${diagonal}</a>`);
const projectInfo = makeDialog('project-info-dialog', 'project-info-title', '<div class="dialog-top"><h2 id="project-info-title">About this project</h2><button class="dialog-close" type="button" aria-label="Close project information">&times;</button></div><p class="info-medium" data-info-medium></p><p data-info-description></p><p data-info-runtime></p><a class="text-link" href="https://github.com/HSPK/collections" target="_blank" rel="noopener noreferrer">Source code & extension notes</a>');
const searchDialog = makeDialog('search-dialog', 'search-title', `<div class="dialog-top"><h2 id="search-title">Find a project</h2><button class="dialog-close" type="button" aria-label="Close search">&times;</button></div><label class="sr-only" for="project-search">Search all projects</label><div class="search-input-wrap">${searchIcon}<input id="project-search" type="search" placeholder="Tools, stories, games, ideas..." autocomplete="off" spellcheck="false" /></div><p class="search-result-count" aria-live="polite"></p><div class="search-results"></div><p class="search-help">Tab to browse results. Enter to open. Escape to return.</p>`);
const searchInput = searchDialog.querySelector<HTMLInputElement>('input')!;
const searchResults = searchDialog.querySelector<HTMLElement>('.search-results')!;

function updateSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const results = projects.filter((project) => projectSearchText(project).includes(query));
  searchDialog.querySelector('.search-result-count')!.textContent = `${results.length} projects`;
  searchResults.innerHTML = results.length ? results.map((project) => `<a class="search-result" href="${projectUrl(project.id)}"><span class="search-project-icon" style="--icon-color:${project.color};--icon-ink:${project.ink}">${categoryIcon(project.category)}</span><span><strong>${escapeMarkup(project.title)}</strong><small>${escapeMarkup(project.medium)}${project.runtime === 'openai-compatible' ? ' / API required' : ''}</small></span>${diagonal}</a>`).join('') : '<p class="search-empty">No projects by that name. Try a different word or idea.</p>';
}

function openSearch() {
  closeFloatingMenu?.(true);
  searchInput.value = '';
  updateSearch();
  searchDialog.showModal();
  searchInput.focus();
}

searchInput.addEventListener('input', updateSearch);
searchInput.addEventListener('keydown', (event) => {
  const first = searchResults.querySelector<HTMLAnchorElement>('a');
  if (event.key === 'Enter' && first) { event.preventDefault(); first.click(); }
  if (event.key === 'ArrowDown' && first) { event.preventDefault(); first.focus(); }
});

document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector<HTMLElement>('#main-content')?.focus();
});
window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const target = event.target;
  const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const dialogOpen = document.querySelector('dialog[open]') !== null;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!dialogOpen) openSearch();
  }
  if (event.key === '/' && !editing && !activeProject && !dialogOpen) { event.preventDefault(); app.querySelector<HTMLInputElement>('[data-library-search]')?.focus(); }
});
window.addEventListener('pagehide', () => {
  if (activeProject) destroyProject();
  else rememberListPosition();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && activeProject) void renderProject(activeProject);
});
const standaloneId = document.body.dataset.project;
if (standaloneId) {
  const project = projects.find((item) => item.id === standaloneId);
  if (project) void renderProject(project);
  else renderNotFound();
} else {
  window.addEventListener('hashchange', openLibraryRoute);
  openLibraryRoute();
}

if (siteBase.origin !== location.origin) console.warn('The collection base points to another origin.');
