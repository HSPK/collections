import './style.css';
import { createProjectPage, escapeMarkup, query, readLocalData, writeLocalData } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { destinations, expedition, getDestination, isWatchId, sharedUnits, watches } from './data';
import type { Destination, WatchId } from './data';
import { renderAtlasMap, renderLandscape } from './diagrams';

type SectionId = 'index' | 'station' | 'notes' | 'packing' | 'units';

interface AtlasRoute {
  destinationId: string;
  watchId: WatchId;
  section?: SectionId;
}

interface PackingState {
  version: 1;
  packed: Record<string, string[]>;
}

const storageKey = 'atlas-impossible-weather.packing.v1';
const sections: SectionId[] = ['index', 'station', 'notes', 'packing', 'units'];
const defaultRoute: AtlasRoute = { destinationId: 'pelagic-stair', watchId: 'dawn' };
const escape = escapeMarkup;

function routeHash(destinationId: string, watchId: WatchId, section?: SectionId): string {
  return `#weather/${destinationId}/${watchId}${section ? `/${section}` : ''}`;
}

function parseRoute(hash: string): AtlasRoute | undefined {
  const parts = hash.replace(/^#/, '').split('/');
  if (parts[0] !== 'weather' || parts.length < 2 || parts.length > 4) return undefined;
  const destination = getDestination(parts[1]);
  const watchId = parts[2] ?? 'dawn';
  const section = parts[3];
  if (!destination || !isWatchId(watchId)) return undefined;
  if (section !== undefined && !sections.includes(section as SectionId)) return undefined;
  return { destinationId: destination.id, watchId, ...(section ? { section: section as SectionId } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPackingState(value: unknown): value is PackingState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.packed)) return false;
  return Object.entries(value.packed).every(([id, items]) => {
    const destination = getDestination(id);
    return destination !== undefined && Array.isArray(items)
      && items.length <= destination.packing.length
      && new Set(items).size === items.length
      && items.every((item: unknown) => typeof item === 'string' && destination.packing.some((kit) => kit.id === item));
  });
}

function renderObservation(destination: Destination, watchId: WatchId): string {
  const forecast = destination.forecasts[watchId];
  const watch = watches.find((item) => item.id === watchId)!;
  return `<div class="weather-observation-top">
      <div class="weather-condition">
        <p class="weather-eyebrow">${watch.time} / ${escape(watch.name)} · fiction</p>
        <h3 data-weather-condition>${escape(forecast.condition)}</h3>
      </div>
      <div class="weather-primary-reading">
        <span>${escape(destination.measure.name)}</span>
        <p><strong data-weather-primary-reading>${forecast.reading}</strong> <span>${escape(destination.measure.unit)}</span></p>
      </div>
    </div>
    <figure class="weather-landscape">
      ${renderLandscape(destination, watchId)}
      <figcaption>
        <div class="weather-figure-title">
          <span>${escape(destination.section)}</span>
          <span class="weather-legend"><i aria-hidden="true"></i> Yellow: measured phenomenon</span>
        </div>
        <ol class="weather-feature-key">
          ${destination.features.map((feature, index) => `<li><span aria-hidden="true">${index + 1}</span>${escape(feature)}</li>`).join('')}
        </ol>
      </figcaption>
    </figure>
    <dl class="weather-instruments" aria-label="Invented expedition readings">
      <div>
        <dt>Hearth reading</dt>
        <dd class="weather-instrument-reading"><strong data-weather-warmth>${forecast.warmth}</strong><span>°h</span></dd>
        <dd class="weather-instrument-note">Imaginary warmth scale</dd>
      </div>
      <div>
        <dt>Wind pull</dt>
        <dd class="weather-instrument-reading"><strong data-weather-wind>${forecast.wind}</strong><span>ribbons</span></dd>
        <dd class="weather-instrument-note">${escape(forecast.direction)}</dd>
      </div>
      <div>
        <dt>Sky opacity</dt>
        <dd class="weather-instrument-reading"><strong data-weather-opacity>${forecast.veils}</strong><span>veils</span></dd>
        <dd class="weather-instrument-note">${10 - forecast.veils} of 10 sightglass bars visible</dd>
      </div>
    </dl>
    <p class="weather-unit-reminder">All readings use invented units, not Earth measurements.
      <a href="${routeHash(destination.id, watchId, 'units')}" data-weather-route>Read the unit key <span aria-hidden="true">↗</span></a>
    </p>
    <p class="weather-forecast-summary" data-weather-summary>${escape(forecast.summary)}</p>
    <div class="weather-route-advice">
      <span class="weather-advice-mark" aria-hidden="true">↗</span>
      <div><h4>For the imaginary expedition</h4><p data-weather-advice>${escape(forecast.route)}</p></div>
    </div>`;
}

function renderFieldNotes(destination: Destination, watchId: WatchId): string {
  const forecast = destination.forecasts[watchId];
  const watch = watches.find((item) => item.id === watchId)!;
  return `<div class="weather-geography">
      <p class="weather-eyebrow">02 / A geography of the unlikely</p>
      <h2>${escape(destination.geographyTitle)}</h2>
      ${destination.geography.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}
      <div class="weather-approach">
        <h3>The marked approach</h3>
        <p>${escape(destination.approach)}</p>
      </div>
    </div>
    <div class="weather-log">
      <div class="weather-log-heading"><span class="weather-eyebrow">Observatory notebook</span><span class="weather-log-stamp">FIELD / ${destination.number}</span></div>
      <h3>${escape(destination.station)}</h3>
      <p class="weather-log-watch">${watch.time} / ${escape(watch.name)} / ${escape(expedition.date)}</p>
      <blockquote><p data-weather-field-note>${escape(forecast.fieldNote)}</p></blockquote>
      <p class="weather-observer">Recorded by ${escape(destination.observer)}.</p>
      <dl class="weather-log-instrument"><dt>Instrument on the desk</dt><dd>${escape(destination.instrument)}</dd></dl>
      <details class="weather-other-logs">
        <summary>Read the other three watches <span aria-hidden="true">+</span></summary>
        <ol>
          ${watches.filter((item) => item.id !== watchId).map((item) => `<li>
            <h4>${item.time} / ${escape(item.name)}</h4>
            <p>${escape(destination.forecasts[item.id].fieldNote)}</p>
            <a href="${routeHash(destination.id, item.id, 'station')}" data-weather-route>Open this forecast <span aria-hidden="true">↗</span></a>
          </li>`).join('')}
        </ol>
      </details>
    </div>`;
}

function renderPackingList(destination: Destination, watchId: WatchId, packed: string[]): string {
  const forecast = destination.forecasts[watchId];
  return `<fieldset class="weather-kit-fieldset">
    <legend>Personal checklist for ${escape(destination.name)}</legend>
    <div class="weather-kit-grid">
      ${destination.packing.map((item) => `<label class="weather-kit-item${forecast.kit.includes(item.id) ? ' weather-kit-item--recommended' : ''}">
        <input type="checkbox" data-weather-pack="${item.id}" ${packed.includes(item.id) ? 'checked' : ''} aria-describedby="weather-kit-note-${item.id}">
        <span><span class="weather-kit-name">${escape(item.name)}</span>
          <span class="weather-kit-reason" id="weather-kit-note-${item.id}">${escape(item.reason)}</span>
          ${forecast.kit.includes(item.id) ? '<span class="weather-kit-tag">For this watch</span>' : ''}
        </span>
      </label>`).join('')}
    </div>
  </fieldset>`;
}

function renderUnitKey(destinationId: string, watchId: WatchId): string {
  return `<div class="weather-unit-group">
      <h3>In every instrument case</h3>
      <dl>
        ${sharedUnits.map((unit) => `<div class="weather-unit-row"><dt>${escape(unit.name)} <span>${escape(unit.symbol)}</span></dt><dd>${escape(unit.definition)}</dd></div>`).join('')}
      </dl>
    </div>
    <div class="weather-unit-group">
      <h3>One peculiar measure per station</h3>
      <dl>
        ${destinations.map((destination) => `<div class="weather-unit-row${destination.id === destinationId ? ' weather-unit-row--selected' : ''}">
          <dt>${escape(destination.measure.name)} <span>${escape(destination.measure.unit)}</span>
            <a href="${routeHash(destination.id, watchId, 'station')}" data-weather-route>${escape(destination.name)} <span aria-hidden="true">↗</span></a>
          </dt>
          <dd>${escape(destination.measure.definition)}</dd>
        </div>`).join('')}
      </dl>
    </div>`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'weather');
  page.root.dataset.workspace = 'true';
  const initialRoute = parseRoute(window.location.hash);
  let state: AtlasRoute = initialRoute ?? { ...defaultRoute };
  let storageMessage = 'Checked items are kept on this device when browser storage is available. No account or sync.';

  const storageReport = (message: string) => {
    storageMessage = message;
    const status = page.root.querySelector<HTMLElement>('[data-weather-storage-status]');
    if (status) status.textContent = message;
    page.report(message);
  };
  const packing: PackingState = readLocalData(storageKey, isPackingState, storageReport) ?? { version: 1, packed: {} };

  page.root.innerHTML = `
    <div class="weather-fiction-banner">
      <span class="weather-fiction-symbol" aria-hidden="true">✳</span>
      <strong>Entirely imaginary. Not live weather.</strong>
      <span class="weather-fiction-detail">No location access. No weather API.</span>
    </div>
    <div class="weather-page">
      <header class="weather-masthead">
        <div class="weather-brand">
          <p class="weather-eyebrow"><span class="weather-institute">The Institute of Unlikely Climates <span aria-hidden="true">/</span> </span>An invented field atlas</p>
          <h1>Atlas of <span>Impossible Weather</span></h1>
        </div>
        <div class="weather-introduction">
          <span class="weather-edition">EXPEDITION 07 <span aria-hidden="true">↗</span> PLATE 028</span>
          <p>Some skies are best<br>approached on paper.</p>
          <p class="weather-intro-small">Six places beyond the ordinary. Read the sky, find a route, pack for the impossible.</p>
        </div>
      </header>
      <nav class="weather-section-nav" aria-label="Atlas sections">
        <a href="" data-weather-section="index" data-weather-route>Stations</a>
        <a href="" data-weather-section="notes" data-weather-route>Notebook</a>
        <a href="" data-weather-section="packing" data-weather-route>Packing</a>
        <a href="" data-weather-section="units" data-weather-route>Units</a>
      </nav>
      <p class="weather-announcement" role="status" aria-live="polite" aria-atomic="true" data-weather-announcement></p>
      <div class="weather-atlas-layout" data-project-preview>
        <aside class="weather-station-index" id="weather-index" tabindex="-1" aria-labelledby="weather-index-title">
          <div class="weather-index-heading">
            <p class="weather-eyebrow">01 / Choose a station</p>
            <h2 id="weather-index-title">An atlas of<br>other atmospheres.</h2>
          </div>
          <figure class="weather-map">
            <div data-weather-map></div>
            <figcaption>Survey route / imaginary geography<br>Not to scale. Use the numbered index below.</figcaption>
          </figure>
          <nav aria-label="Destination index">
            <ol class="weather-destination-list">
              ${destinations.map((destination) => `<li><a class="weather-destination" href="${routeHash(destination.id, state.watchId, 'station')}" data-weather-destination="${destination.id}" data-weather-route>
                <span class="weather-destination-number">${destination.number}</span>
                <span class="weather-destination-text"><strong>${escape(destination.name)}</strong><span>${escape(destination.region)}</span><span data-weather-index-condition="${destination.id}"></span></span>
                <span class="weather-destination-arrow" aria-hidden="true">↗</span>
              </a></li>`).join('')}
            </ol>
          </nav>
          <p class="weather-index-note">One invented day, shared by every station. Your selected watch travels with you.</p>
          <div class="weather-survey-seal" aria-hidden="true"><span>IC</span><span>UNLIKELY<br>BUT WELL OBSERVED</span></div>
        </aside>
        <article class="weather-station" id="weather-station" tabindex="-1" aria-labelledby="weather-place-name">
          <header class="weather-station-header">
            <div class="weather-station-location"><p class="weather-eyebrow" data-weather-region></p><span class="weather-grid-reference" data-weather-grid></span></div>
            <h2 id="weather-place-name"></h2>
            <label class="weather-station-select">Station
              <select data-weather-station-select aria-label="Choose a station">
                ${destinations.map(destination => `<option value="${destination.id}">${escape(destination.name)}</option>`).join('')}
              </select>
            </label>
            <p class="weather-station-tagline" data-weather-tagline></p>
          </header>
          <section aria-label="Fictional expedition forecast">
            <fieldset class="weather-watch-selector">
              <legend>Choose a watch <span>${escape(expedition.date)}</span></legend>
              <div class="weather-watch-grid">
                ${watches.map((watch) => `<label class="weather-watch-choice">
                  <input type="radio" name="weather-watch" value="${watch.id}" aria-label="${escape(watch.name)} — ${watch.time}" aria-describedby="weather-watch-detail-${watch.id}">
                  <span class="weather-watch-face"><span class="weather-watch-time">${watch.time}</span><strong>${escape(watch.name)}</strong>
                    <span class="weather-watch-detail" id="weather-watch-detail-${watch.id}" data-weather-watch-detail="${watch.id}"></span>
                  </span>
                </label>`).join('')}
              </div>
            </fieldset>
            <p class="weather-fixed-time">${escape(expedition.note)}</p>
            <div data-weather-observation></div>
          </section>
        </article>
      </div>
      <section class="weather-field-notes" id="weather-notes" tabindex="-1" aria-label="Geography and observatory field notes" data-weather-field-notes></section>
      <section class="weather-packing" id="weather-packing" tabindex="-1" aria-labelledby="weather-packing-title">
        <header class="weather-section-heading">
          <div><p class="weather-eyebrow">03 / Before you set out</p><h2 id="weather-packing-title">Pack for this kind of impossible.</h2></div>
          <p class="weather-pack-count" data-weather-pack-count></p>
        </header>
        <div class="weather-packing-layout">
          <div data-weather-packing-list></div>
          <aside class="weather-packing-advice">
            <div data-weather-packing-advice></div>
            <p class="weather-storage-status" role="status" aria-live="polite" data-weather-storage-status>${escape(storageMessage)}</p>
            <button class="weather-clear-checklist" type="button" data-weather-clear>Clear this station’s checklist</button>
          </aside>
        </div>
      </section>
      <section class="weather-units" id="weather-units" tabindex="-1" aria-labelledby="weather-units-title">
        <header class="weather-section-heading">
          <div><p class="weather-eyebrow">04 / Reading the instruments</p><h2 id="weather-units-title">A small dictionary of strange weather.</h2></div>
        </header>
        <p class="weather-units-intro">Every unit in this atlas is made up. These readings are consistent inside the story, but none is calibrated for Earth, navigation, or real-world safety.</p>
        <div data-weather-unit-key></div>
      </section>
      <footer class="weather-footer">
        <div><p class="weather-eyebrow">${escape(expedition.edition)}</p><strong>A forecast for nowhere on Earth.</strong><p>An original work of imaginary geography. All forecasts and observations are authored locally, not fetched or measured.</p></div>
        <a href="" data-weather-section="index" data-weather-route>Back to the station index <span aria-hidden="true">↑</span></a>
      </footer>
    </div>`;

  const element = (selector: string) => query<HTMLElement>(page.root, selector);
  const stationContext = document.createElement('div');
  stationContext.className = 'weather-station-context';
  stationContext.append(element('.weather-station-location'), element('.weather-station-tagline'), element('.weather-fixed-time'));
  const forecastDetails = document.createElement('div');
  forecastDetails.className = 'weather-forecast-details';
  const dialogs = new Map([
    ['index', createWorkspaceDialog(page, { id: 'weather-index-dialog', title: 'Station index', content: [element('#weather-index')] })],
    ['notes', createWorkspaceDialog(page, { id: 'weather-notes-dialog', title: 'Forecast & field notebook', content: [stationContext, forecastDetails, element('#weather-notes')] })],
    ['packing', createWorkspaceDialog(page, { id: 'weather-packing-dialog', title: 'Packing list', content: [element('#weather-packing')] })],
    ['units', createWorkspaceDialog(page, { id: 'weather-units-dialog', title: 'Unit key & atlas notes', content: [element('#weather-units'), element('.weather-introduction'), element('.weather-brand .weather-eyebrow'), element('.weather-footer')] })],
  ]);
  for (const link of page.root.querySelectorAll<HTMLElement>('.weather-section-nav [data-weather-section]')) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', `weather-${link.dataset.weatherSection}-dialog`);
  }
  const stationSelect = query<HTMLSelectElement>(page.root, '[data-weather-station-select]');

  const announce = (message: string) => {
    query<HTMLElement>(page.root, '[data-weather-announcement]').textContent = message;
  };

  function updateNavigation(): void {
    for (const link of page.root.querySelectorAll<HTMLAnchorElement>('[data-weather-section]')) {
      const section = link.dataset.weatherSection as SectionId;
      link.href = routeHash(state.destinationId, state.watchId, section);
      if (state.section === section) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    for (const link of page.root.querySelectorAll<HTMLAnchorElement>('[data-weather-destination]')) {
      const id = link.dataset.weatherDestination!;
      link.href = routeHash(id, state.watchId, 'station');
      if (id === state.destinationId) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function updatePackingCount(): void {
    const destination = getDestination(state.destinationId)!;
    const count = (packing.packed[destination.id] ?? []).length;
    query<HTMLElement>(page.root, '[data-weather-pack-count]').textContent = `${count} / ${destination.packing.length} packed`;
    query<HTMLButtonElement>(page.root, '[data-weather-clear]').disabled = count === 0;
  }

  function render(): void {
    const destination = getDestination(state.destinationId)!;
    const forecast = destination.forecasts[state.watchId];
    const watch = watches.find((item) => item.id === state.watchId)!;
    query<HTMLElement>(page.root, '[data-weather-region]').textContent = `${destination.number} / ${destination.region}`;
    query<HTMLElement>(page.root, '[data-weather-grid]').textContent = `Atlas grid ${destination.grid}`;
    query<HTMLElement>(page.root, '#weather-place-name').textContent = destination.name;
    stationSelect.value = destination.id;
    query<HTMLElement>(page.root, '[data-weather-tagline]').textContent = destination.tagline;
    query<HTMLElement>(page.root, '[data-weather-map]').innerHTML = renderAtlasMap(destination.id);
    query<HTMLElement>(page.root, '[data-weather-observation]').innerHTML = renderObservation(destination, state.watchId);
    const landscapeKey = document.createElement('figure');
    landscapeKey.className = 'weather-landscape-reference';
    landscapeKey.append(element('.weather-landscape figcaption'));
    forecastDetails.replaceChildren(
      element('.weather-condition .weather-eyebrow'), landscapeKey, element('.weather-instruments'), element('.weather-unit-reminder'),
      element('.weather-forecast-summary'), element('.weather-route-advice'),
    );
    query<HTMLElement>(page.root, '[data-weather-field-notes]').innerHTML = renderFieldNotes(destination, state.watchId);
    query<HTMLElement>(page.root, '[data-weather-packing-list]').innerHTML = renderPackingList(destination, state.watchId, packing.packed[destination.id] ?? []);
    query<HTMLElement>(page.root, '[data-weather-packing-advice]').innerHTML = `<p class="weather-eyebrow">${watch.time} / ${escape(watch.name)} kit note</p>
      <h3>${escape(destination.name)}</h3><p>${escape(forecast.packingNote)}</p>
      <p class="weather-packing-explanation">“For this watch” marks the useful items in this forecast. Checks are yours to make; changing the weather never checks an item for you.</p>`;
    query<HTMLElement>(page.root, '[data-weather-unit-key]').innerHTML = renderUnitKey(destination.id, state.watchId);
    for (const input of page.root.querySelectorAll<HTMLInputElement>('input[name="weather-watch"]')) {
      input.checked = input.value === state.watchId;
    }
    for (const item of watches) {
      const detail = destination.forecasts[item.id];
      query<HTMLElement>(page.root, `[data-weather-watch-detail="${item.id}"]`).textContent = `${detail.short} · ${detail.reading} ${destination.measure.unit}`;
    }
    for (const item of destinations) {
      query<HTMLElement>(page.root, `[data-weather-index-condition="${item.id}"]`).textContent = item.forecasts[state.watchId].short;
    }
    updateNavigation();
    updatePackingCount();
  }

  function focusSection(section: SectionId): void {
    const dialog = dialogs.get(section);
    for (const other of dialogs.values()) {
      if (other !== dialog) other.close();
    }
    if (dialog) dialog.open();
    const target = query<HTMLElement>(page.root, `#weather-${section}`);
    // A queued hashchange must not steal focus from a control the reader already reached.
    if (target.contains(document.activeElement)) return;
    target.focus({ preventScroll: true });
  }

  function applyRoute(next: AtlasRoute): void {
    const destinationChanged = next.destinationId !== state.destinationId;
    const watchChanged = next.watchId !== state.watchId;
    state = next;
    if (destinationChanged || watchChanged) {
      render();
      const destination = getDestination(state.destinationId)!;
      const watch = watches.find((item) => item.id === state.watchId)!;
      const forecast = destination.forecasts[state.watchId];
      announce(`${destination.name}, ${watch.name}, ${watch.time}. ${forecast.condition} ${forecast.reading} ${destination.measure.unit}. All readings are fictional.`);
    } else {
      updateNavigation();
    }
    if (state.section) focusSection(state.section);
    else focusSection('station');
  }

  function savePacking(): void {
    if (writeLocalData(storageKey, packing, storageReport)) {
      storageMessage = 'Checklist saved on this device. No account or sync.';
      query<HTMLElement>(page.root, '[data-weather-storage-status]').textContent = storageMessage;
    }
    updatePackingCount();
  }

  page.root.addEventListener('change', (event) => {
    const input = event.target;
    if (input === stationSelect) {
      window.location.hash = routeHash(stationSelect.value, state.watchId, 'station');
      return;
    }
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name === 'weather-watch' && isWatchId(input.value)) {
      window.location.hash = routeHash(state.destinationId, input.value);
      return;
    }
    const itemId = input.dataset.weatherPack;
    const destination = getDestination(state.destinationId)!;
    if (!itemId || !destination.packing.some((item) => item.id === itemId)) return;
    const packed = new Set(packing.packed[destination.id] ?? []);
    if (input.checked) packed.add(itemId);
    else packed.delete(itemId);
    packing.packed[destination.id] = [...packed];
    savePacking();
  }, { signal: page.signal });

  page.root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const clear = event.target.closest<HTMLButtonElement>('[data-weather-clear]');
    if (clear && !clear.disabled) {
      delete packing.packed[state.destinationId];
      for (const input of page.root.querySelectorAll<HTMLInputElement>('[data-weather-pack]')) input.checked = false;
      savePacking();
      announce(`Cleared the checklist for ${getDestination(state.destinationId)!.name}. Other stations are unchanged.`);
      query<HTMLInputElement>(page.root, '[data-weather-pack]').focus({ preventScroll: true });
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>('a[data-weather-route]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (link.hash === window.location.hash) {
      event.preventDefault();
      const route = parseRoute(link.hash);
      if (route) focusSection(route.section ?? 'station');
    }
  }, { signal: page.signal });

  window.addEventListener('hashchange', () => {
    const next = parseRoute(window.location.hash);
    if (next) applyRoute(next);
    else if (!window.location.hash) applyRoute({ ...defaultRoute });
    else if (window.location.hash.startsWith('#weather')) {
      window.history.replaceState(null, '', routeHash(defaultRoute.destinationId, defaultRoute.watchId));
      applyRoute({ ...defaultRoute });
      announce('That chart address is not in this atlas. Showing Pelagic Stair at Dawn instead.');
    }
  }, { signal: page.signal });

  render();
  if (initialRoute) focusSection(initialRoute.section ?? 'station');
  else if (window.location.hash.startsWith('#weather')) {
    window.history.replaceState(null, '', routeHash(defaultRoute.destinationId, defaultRoute.watchId));
    announce('That chart address is not in this atlas. Showing Pelagic Stair at Dawn instead.');
  }

  return { destroy: page.destroy };
}
