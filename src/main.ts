import './style.css';
import { categoryNames, projects } from './catalog';
import type { Category, ExperimentInstance, Project } from './core/types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.5"/></svg>';
const diagonalArrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" stroke-width="1.5"/></svg>';
const mark = '<svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><ellipse cx="20" cy="20" rx="17" ry="10" transform="rotate(-40 20 20)" stroke="currentColor" stroke-width="2.8"/><circle cx="31" cy="11" r="4.5" fill="currentColor"/></svg>';
const categoryCounts: Record<Category, number> = { space: 0, motion: 0, play: 0 };
for (const project of projects) categoryCounts[project.category]++;
let routeController = new AbortController();
let disposeRoute: (() => void) | undefined;
let currentProject: Project | undefined;
let category: Category | 'all' = 'all';
let layout: 'grid' | 'list' = 'grid';
let galleryScroll = 0;
let routeGeneration = 0;
let playbackButton: HTMLButtonElement | undefined;
let instance: ExperimentInstance | undefined;
let paused = motionPreference.matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function header(inExperiment = false) {
  return `
    <header class="site-header">
      <a class="brand" href="#/" aria-label="Odd Index home">${mark}<span>odd<span class="brand-slash">/</span>index</span></a>
      <span class="header-note"><span class="status-dot"></span> AN EXERCISE IN CURIOSITY</span>
      <nav class="main-nav" aria-label="Main navigation">
        <a class="nav-index ${inExperiment ? '' : 'is-active'}" href="#/" data-index-link>Index <span class="nav-count">${projects.length}</span></a>
        <button class="nav-about" type="button" data-about>About</button>
        <button class="search-trigger" type="button" aria-label="Search experiments" title="Search experiments (Ctrl or Command K)" data-search>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.5"/></svg><kbd>K</kbd>
        </button>
      </nav>
    </header>`;
}

function bindHeader(signal: AbortSignal) {
  app.querySelector('[data-about]')?.addEventListener('click', () => aboutDialog.showModal(), { signal });
  app.querySelector('[data-search]')?.addEventListener('click', openSearch, { signal });
  app.querySelector('[data-index-link]')?.addEventListener('click', (event) => {
    if (!currentProject && document.querySelector('#index')) {
      event.preventDefault();
      document.querySelector('#index')?.scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth' });
    }
  }, { signal });
}

function projectCard(project: Project) {
  return `
    <a class="project-card" href="#/experiment/${project.id}" data-project="${project.id}" aria-label="${project.title}: ${project.subtitle}">
      <div class="card-art" style="--art-color:${project.color};--art-ink:${project.ink}">
        <img src="${import.meta.env.BASE_URL}previews/${project.id}.jpg" alt="${project.title} interactive artwork" width="1200" height="800" loading="lazy" decoding="async" />
        <span class="art-number">${project.number} /</span>
        <span class="art-action">ENTER EXPERIMENT ${diagonalArrow}</span>
      </div>
      <div class="card-caption">
        <div><span class="card-medium">${project.medium}</span><h3>${project.title}</h3><p>${project.subtitle}</p></div>
        <span class="card-arrow">${diagonalArrow}</span>
      </div>
    </a>`;
}

function updateGrid() {
  const grid = app.querySelector<HTMLElement>('[data-project-grid]');
  if (!grid) return;
  const filtered = projects.filter((project) => category === 'all' || project.category === category);
  grid.className = `project-grid ${layout === 'list' ? 'project-grid--list' : ''}`;
  grid.innerHTML = filtered.map(projectCard).join('');
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === category));
  });
  const count = app.querySelector('[data-result-count]');
  if (count) count.textContent = `${String(filtered.length).padStart(2, '0')} experiments`;
}

async function renderGallery(signal: AbortSignal, restoreScroll: boolean) {
  document.title = 'Odd Index - An exercise in curiosity';
  app.className = 'gallery-root';
  app.innerHTML = `
    ${header()}
    <main id="main-content" tabindex="-1">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <div class="eyebrow"><span class="tiny-cross">+</span> A COLLECTION OF INTERACTIVE POSSIBILITIES</div>
          <h1 id="hero-title">An exercise<br>in <em>curiosity.</em></h1>
          <p class="hero-description">A little physics. A little code.<br>A healthy disregard for the ordinary.</p>
          <a class="explore-link" href="#/index" data-explore>Find something to play with <span>${arrow}</span></a>
          <div class="hero-edition"><span>INDEPENDENT EXPERIMENTS</span><span>VOL. 001 &nbsp;/&nbsp; 2026</span></div>
        </div>
        <div class="hero-art-wrap">
          <div class="hero-art" data-hero aria-label="An interactive sculptural arrangement of rings">
            <div class="hero-fallback" aria-hidden="true">
              <svg viewBox="0 0 640 620"><g fill="none" stroke="#424a3c"><ellipse cx="320" cy="310" rx="222" ry="108" stroke-width="32" transform="rotate(-38 320 310)"/><ellipse cx="320" cy="310" rx="153" ry="102" stroke-width="24" transform="rotate(53 320 310)"/><ellipse cx="320" cy="310" rx="87" ry="48" stroke-width="19" transform="rotate(-18 320 310)"/></g><circle cx="457" cy="161" r="29" fill="#e65a36"/></svg>
            </div>
          </div>
          <div class="hero-art-label"><span>FIG. 01 &nbsp; OBJECTS IN MOTION</span><span class="spin-label">GIVE IT A SPIN ${diagonalArrow}</span></div>
          <span class="hero-coordinate" aria-hidden="true">POLISHED OBJECTS / UNPOLISHED IDEAS</span>
        </div>
      </section>
      <div class="collection-note"><span>NOT EVERYTHING NEEDS TO BE USEFUL.</span><span>SOMETIMES, INTERESTING IS ENOUGH. <span class="note-star" aria-hidden="true">*</span></span></div>
      <section class="index-section" id="index" aria-labelledby="index-title">
        <div class="index-heading"><h2 id="index-title">The index<span>(${projects.length})</span></h2><p>Open one. Get a little lost.</p></div>
        <div class="index-toolbar">
          <div class="filters" role="group" aria-label="Filter experiments by category">
            <button type="button" data-filter="all" aria-pressed="true">All work <sup>${projects.length}</sup></button>
            <button type="button" data-filter="space" aria-pressed="false">Space <sup>${String(categoryCounts.space).padStart(2, '0')}</sup></button>
            <button type="button" data-filter="motion" aria-pressed="false">Motion <sup>${String(categoryCounts.motion).padStart(2, '0')}</sup></button>
            <button type="button" data-filter="play" aria-pressed="false">Play <sup>${String(categoryCounts.play).padStart(2, '0')}</sup></button>
          </div>
          <div class="layout-switch" role="group" aria-label="Collection layout">
            <button type="button" data-layout="grid" aria-label="Grid view" aria-pressed="${layout === 'grid'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2h6v6H2zm10 0h6v6h-6zM2 12h6v6H2zm10 0h6v6h-6z" fill="currentColor"/></svg></button>
            <button type="button" data-layout="list" aria-label="List view" aria-pressed="${layout === 'list'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 3h16v2H2zm0 6h16v2H2zm0 6h16v2H2z" fill="currentColor"/></svg></button>
          </div>
        </div>
        <span class="sr-only" aria-live="polite" data-result-count>${projects.length} experiments</span>
        <div class="project-grid" data-project-grid></div>
      </section>
      <section class="closing-note" aria-label="About the collection">
        <span class="closing-asterisk" aria-hidden="true">*</span>
        <p>The browser is a playground.<br>We intend to <em>keep it that way.</em></p>
        <button type="button" data-footer-about>More about this little corner of the internet ${diagonalArrow}</button>
      </section>
    </main>
    <footer class="site-footer"><a class="footer-brand" href="#/">odd/index</a><span>AI-ASSISTED. CURIOSITY-LED. OPEN TO EVERYONE.</span><button type="button" data-top>BACK TO TOP ${arrow}</button></footer>`;

  bindHeader(signal);
  updateGrid();
  app.querySelector('[data-explore]')?.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector('#index')?.scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth' });
  }, { signal });
  app.querySelector('[data-footer-about]')?.addEventListener('click', () => aboutDialog.showModal(), { signal });
  app.querySelector('[data-top]')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: motionPreference.matches ? 'instant' : 'smooth' }), { signal });
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      category = button.dataset.filter as Category | 'all';
      updateGrid();
    }, { signal });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
    button.addEventListener('click', () => {
      layout = button.dataset.layout as 'grid' | 'list';
      app.querySelectorAll('[data-layout]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      updateGrid();
    }, { signal });
  });
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    if (location.hash === '#/index') document.querySelector('#index')?.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: restoreScroll ? galleryScroll : 0, behavior: 'instant' });
  });

  const hero = app.querySelector<HTMLElement>('[data-hero]')!;
  try {
    const { mountHero } = await import('./gallery/hero');
    if (signal.aborted) return;
    const destroy = mountHero(hero, signal, motionPreference.matches);
    if (signal.aborted) destroy();
    else disposeRoute = destroy;
  } catch (error) {
    if (signal.aborted) return;
    console.warn('The interactive hero is unavailable; showing the illustrated edition.', error);
    const label = app.querySelector('.spin-label');
    if (label) label.textContent = 'ILLUSTRATED EDITION / WEBGL UNAVAILABLE';
  }
}

function setPlayback(value: boolean) {
  paused = value;
  instance?.setPaused(paused);
  if (playbackButton) {
    playbackButton.innerHTML = `${paused ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor"/></svg>'}<span>${paused ? 'Play' : 'Pause'}</span>`;
    playbackButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  }
}

async function renderExperiment(project: Project, signal: AbortSignal) {
  document.title = `${project.title} - Odd Index`;
  paused = motionPreference.matches;
  app.className = 'lab-root';
  const position = projects.indexOf(project);
  const previous = projects[(position + projects.length - 1) % projects.length];
  const next = projects[(position + 1) % projects.length];
  app.innerHTML = `
    ${header(true)}
    <main id="main-content" class="lab-page" tabindex="-1">
      <div class="lab-heading">
        <div class="lab-title"><a class="back-index" href="#/" aria-label="Back to index">${arrow}</a><div><div class="eyebrow">${project.number} / ${categoryNames[project.category].toUpperCase()}</div><h1>${project.title}</h1></div></div>
        <p class="lab-subtitle">${project.subtitle}<span>${project.medium}</span></p>
        <nav class="experiment-pager" aria-label="Browse experiments"><a href="#/experiment/${previous.id}" aria-label="Previous experiment: ${previous.title}">${arrow}</a><span>${project.number} <span>/</span> ${String(projects.length).padStart(2, '0')}</span><a href="#/experiment/${next.id}" aria-label="Next experiment: ${next.title}">${arrow}</a></nav>
      </div>
      <div class="experiment-stage" data-stage data-experiment="${project.id}" style="background:${project.color};color:${project.ink}" aria-label="${project.title} interactive stage">
        <div class="experiment-loading" role="status"><span class="loading-orbit"></span>PREPARING A LITTLE SOMETHING</div>
      </div>
      <div class="experiment-toolbar">
        <div class="playback-controls">
          <button type="button" class="playback-button" data-playback disabled aria-label="Pause animation"></button>
          <button type="button" class="reset-button" data-reset disabled title="Reset experiment"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 8a6 6 0 1 1 0 5M4 3v5h5" stroke="currentColor" stroke-width="1.5"/></svg><span>Reset</span></button>
        </div>
        <div class="experiment-controls" data-controls aria-label="Experiment controls"></div>
      </div>
      <div class="lab-status"><p role="status" aria-live="polite" data-report>${project.instruction}</p><span>REAL-TIME. RIGHT HERE IN YOUR BROWSER.</span></div>
      <details class="experiment-about"><summary>Notes on this experiment <span>+</span></summary><div><p>${project.description}</p><p>Made with ${project.category === 'space' || project.id === 'chroma' ? 'WebGL' : 'Canvas'} and a little curiosity. Everything runs locally. No account, no API keys, no data collection. Use the controls to play without a pointer; pause motion at any time.</p></div></details>
    </main>
    <footer class="lab-footer"><a href="#/">BACK TO THE INDEX ${arrow}</a><span>ODD INDEX &nbsp;/&nbsp; EXPERIMENT ${project.number}</span><a href="#/experiment/${next.id}">UP NEXT: ${next.title.toUpperCase()} ${arrow}</a></footer>`;
  bindHeader(signal);
  playbackButton = app.querySelector<HTMLButtonElement>('[data-playback]')!;
  const reset = app.querySelector<HTMLButtonElement>('[data-reset]')!;
  const container = app.querySelector<HTMLElement>('[data-stage]')!;
  const controls = app.querySelector<HTMLElement>('[data-controls]')!;
  const report = app.querySelector<HTMLElement>('[data-report]')!;
  setPlayback(paused);
  playbackButton.addEventListener('click', () => setPlayback(!paused), { signal });
  reset.addEventListener('click', () => {
    instance?.reset?.();
    report.textContent = 'A fresh start. Make it your own.';
  }, { signal });
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    const module = await project.load();
    if (signal.aborted) return;
    container.replaceChildren();
    const mounted = await module.mount({
      container,
      controls,
      signal,
      reducedMotion: motionPreference.matches,
      report: (message) => { if (!signal.aborted) report.textContent = message; },
    });
    if (signal.aborted) {
      mounted.destroy();
      return;
    }
    instance = mounted;
    disposeRoute = mounted.destroy;
    playbackButton.disabled = false;
    reset.disabled = !mounted.reset;
    if (!mounted.reset) reset.hidden = true;
    container.dataset.ready = 'true';
    if (paused) mounted.setPaused(true);
  } catch (error) {
    if (signal.aborted) return;
    console.error(`Could not start ${project.title}.`, error);
    container.replaceChildren();
    controls.replaceChildren();
    const message = document.createElement('div');
    message.className = 'experiment-error';
    message.setAttribute('role', 'alert');
    const heading = document.createElement('h2');
    heading.textContent = 'This one needs a little more from your browser.';
    const detail = document.createElement('p');
    detail.textContent = error instanceof Error ? error.message : 'The experiment could not be started.';
    const recommendation = document.createElement('p');
    recommendation.textContent = 'Try enabling hardware acceleration or opening this page in a current browser. Our canvas experiments do not require WebGL.';
    const link = document.createElement('a');
    link.href = '#/experiment/flow';
    link.textContent = 'Try Flow State instead';
    message.append(heading, detail, recommendation, link);
    container.append(message);
    report.textContent = 'Experiment unavailable. See the message above for alternatives.';
  }
}

async function route() {
  const generation = ++routeGeneration;
  const wasExperiment = Boolean(currentProject);
  if (!wasExperiment && app.querySelector('#index')) galleryScroll = window.scrollY;
  routeController.abort();
  disposeRoute?.();
  disposeRoute = undefined;
  instance = undefined;
  playbackButton = undefined;
  routeController = new AbortController();
  const signal = routeController.signal;
  const path = location.hash.slice(1) || '/';
  const match = /^\/experiment\/([a-z-]+)\/?$/.exec(path);
  currentProject = match ? projects.find((project) => project.id === match[1]) : undefined;
  if (currentProject) {
    await renderExperiment(currentProject, signal);
  } else if (path === '/' || path === '/index') {
    await renderGallery(signal, wasExperiment);
  } else {
    document.title = 'A little too far - Odd Index';
    app.className = 'gallery-root';
    app.innerHTML = `${header()}<main id="main-content" class="not-found" tabindex="-1"><span class="eyebrow">404 / AN UNCHARTED CORNER</span><h1>A little <em>too far.</em></h1><p>There is plenty to get lost in here. This page is not one of those things.</p><a class="explore-link" href="#/">Find your way back ${arrow}</a></main>`;
    bindHeader(signal);
  }
  if (generation !== routeGeneration) return;
}

const aboutDialog = document.createElement('dialog');
aboutDialog.className = 'about-dialog';
aboutDialog.setAttribute('aria-labelledby', 'about-title');
aboutDialog.innerHTML = `
  <div class="dialog-top"><span class="eyebrow">A NOTE FROM ODD INDEX</span><button type="button" class="dialog-close" aria-label="Close about dialog">&times;</button></div>
  <span class="about-mark" aria-hidden="true">*</span>
  <h2 id="about-title">For the sake<br>of <em>interesting.</em></h2>
  <p>Odd Index is an AI-assisted collection of creative-coding experiments, curated around one idea: the browser can still surprise you.</p>
  <p>No grand promises. No productivity hacks. Just ${projects.length} little worlds made of physics, light, type, and sound. Things to touch, pull apart, and get happily lost in.</p>
  <div class="about-facts"><span>${projects.length} EXPERIMENTS</span><span>100% IN YOUR BROWSER</span><span>ZERO ACCOUNTS</span></div>
  <p class="about-small">Built with TypeScript, Three.js, Canvas, and Web Audio. All experiments run on your device, without AI API calls, tracking, or external services. Sound is off until you choose otherwise.</p>`;
document.body.append(aboutDialog);
aboutDialog.querySelector('.dialog-close')?.addEventListener('click', () => aboutDialog.close());

const searchDialog = document.createElement('dialog');
searchDialog.className = 'search-dialog';
searchDialog.setAttribute('aria-labelledby', 'search-title');
searchDialog.innerHTML = `
  <div class="dialog-top"><h2 id="search-title">Find your next distraction.</h2><button class="dialog-close" type="button" aria-label="Close search">&times;</button></div>
  <label class="sr-only" for="experiment-search">Search experiments</label>
  <div class="search-input-wrap"><input id="experiment-search" type="search" placeholder="Try particles, type, sound..." autocomplete="off" spellcheck="false" /><kbd>ESC</kbd></div>
  <p class="search-result-count" aria-live="polite"></p><div class="search-results"></div>
  <div class="search-help">TAB TO EXPLORE &nbsp;&nbsp; ENTER TO OPEN &nbsp;&nbsp; ESC TO RETURN</div>`;
document.body.append(searchDialog);
const searchInput = searchDialog.querySelector<HTMLInputElement>('input')!;
const searchResults = searchDialog.querySelector<HTMLElement>('.search-results')!;

function updateSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const results = projects.filter((project) =>
    `${project.title} ${project.subtitle} ${project.medium} ${project.description} ${categoryNames[project.category]}`.toLowerCase().includes(query),
  );
  searchDialog.querySelector('.search-result-count')!.textContent = `${results.length} ${results.length === 1 ? 'experiment' : 'experiments'} to explore`;
  searchResults.replaceChildren();
  for (const project of results) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = `#/experiment/${project.id}`;
    link.innerHTML = `<span class="search-number">${project.number}</span><span>${project.title}<small>${project.medium}</small></span>${diagonalArrow}`;
    link.addEventListener('click', () => searchDialog.close());
    searchResults.append(link);
  }
  if (!results.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'Nothing here by that name. Try a color, a medium, or a little less specificity.';
    searchResults.append(empty);
  }
}

function openSearch() {
  searchInput.value = '';
  updateSearch();
  searchDialog.showModal();
  searchInput.focus();
}

searchInput.addEventListener('input', updateSearch);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const first = searchResults.querySelector<HTMLAnchorElement>('a');
    if (first) {
      event.preventDefault();
      first.click();
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    searchResults.querySelector<HTMLAnchorElement>('a')?.focus();
  }
});
searchDialog.querySelector('.dialog-close')?.addEventListener('click', () => searchDialog.close());

for (const dialog of [aboutDialog, searchDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}

document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector<HTMLElement>('#main-content')?.focus();
});
window.addEventListener('hashchange', () => { void route(); });
window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const target = event.target;
  const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!searchDialog.open && !aboutDialog.open) openSearch();
  }
  if (event.code === 'Space' && !editing && currentProject && instance && !aboutDialog.open && !searchDialog.open && !(target instanceof HTMLButtonElement) && !(target instanceof HTMLAnchorElement)) {
    event.preventDefault();
    setPlayback(!paused);
  }
});
motionPreference.addEventListener('change', () => {
  if (currentProject) setPlayback(motionPreference.matches);
});
void route();
