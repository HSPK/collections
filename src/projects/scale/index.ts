import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import {
  catalogue, comparisonPresets, DEFAULT_COMPARISON, DEFAULT_ENTRY,
  domains, sources, SOURCE_REVIEW_DATE,
} from './data';
import type { ScaleEntry, SourceId } from './data';
import {
  compareLengths, formatLength, formatNumber, isUnit, logPosition, magnitudeBounds,
  metresAtPosition, nearestReference, rescaleLength, scientificNumber, superscript,
  toMetres, UNITS,
} from './engine';
import type { DisplayUnit, Unit } from './engine';
import { illustration } from './illustrations';

const e = escapeMarkup;
const bounds = magnitudeBounds(catalogue);
const lowestOrder = Math.log10(bounds.min);
const highestOrder = Math.log10(bounds.max);
const rulerSteps = (highestOrder - lowestOrder) * 20;
const orderSpan = Math.log10(catalogue[catalogue.length - 1].metres) - Math.log10(catalogue[0].metres);

function reference(id: string): ScaleEntry {
  const entry = catalogue.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown scale reference: ${id}`);
  return entry;
}

function domainName(entry: ScaleEntry): string {
  return domains.find((domain) => domain.id === entry.domain)?.name ?? entry.domain;
}

function entryLength(entry: ScaleEntry, unit: DisplayUnit = 'auto'): string {
  const converted = unit !== 'auto' && unit !== entry.unit;
  return `${entry.approximate || converted ? '≈ ' : ''}${formatLength(entry.metres, unit === 'auto' ? entry.unit : unit, entry.digits)}`;
}

function sourceLink(id: SourceId): string {
  const source = sources[id];
  return `<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="${e(`${source.publisher}: ${source.title} (opens in a new tab)`)}">${e(source.publisher)} <span aria-hidden="true">↗</span></a>`;
}

function referenceOptions(): string {
  return domains.map((domain) => `<optgroup label="${e(domain.name)}">${catalogue
    .filter((entry) => entry.domain === domain.id)
    .map((entry) => `<option value="${entry.id}">${e(entry.name)} — ${e(entryLength(entry))}</option>`)
    .join('')}</optgroup>`).join('');
}

function searchText(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[µμ]/g, 'u');
}

function selectedUnit(select: HTMLSelectElement): Unit {
  if (!isUnit(select.value)) throw new Error(`Unknown length unit: ${select.value}`);
  return select.value;
}

function comparisonSentence(a: ScaleEntry, b: ScaleEntry): string {
  const comparison = compareLengths(a.metres, b.metres);
  if (comparison.larger === 'equal') {
    return `A and B have the same reference length. The length ratio is 1 to 1.`;
  }
  const longer = comparison.larger === 'a' ? a : b;
  const shorter = comparison.larger === 'a' ? b : a;
  return `The ${longer.measure.toLowerCase()} of ${longer.name} is about ${formatNumber(comparison.largerOverSmaller)} times the ${shorter.measure.toLowerCase()} of ${shorter.name}.`;
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'scale');
  const root = page.root;
  root.dataset.workspace = 'true';
  let selected = reference(DEFAULT_ENTRY);
  let a = reference(DEFAULT_COMPARISON.a);
  let b = reference(DEFAULT_COMPARISON.b);
  let displayUnit: DisplayUnit = 'auto';
  const options = referenceOptions();
  const ticks = Array.from({ length: highestOrder - lowestOrder + 1 }, (_, index) =>
    `<span class="${index % 3 === 0 ? 'scale-major-tick' : ''}" style="left:${index / (highestOrder - lowestOrder) * 100}%"></span>`).join('');
  const tickLabels = Array.from({ length: 6 }, (_, index) => {
    const exponent = Math.round(lowestOrder + index * (highestOrder - lowestOrder) / 5);
    const position = (exponent - lowestOrder) / (highestOrder - lowestOrder) * 100;
    return `<span style="left:${position}%">10${superscript(exponent)} m</span>`;
  }).join('');

  root.innerHTML = `
    <div class="scale-site">
      <header class="scale-header">
        <a class="scale-wordmark" href="#scale-top" aria-label="The Scale of Things, back to top">
          <svg viewBox="0 0 38 38" aria-hidden="true" focusable="false"><path d="M4 30V23h8V15h9V6h12M4 34h30"/><circle cx="30" cy="10" r="5"/></svg>
          <span>A field guide<br>to magnitude</span>
        </a>
        <button type="button" data-atlas-notes>How to read</button>
      </header>
      <nav data-atlas-tabs aria-label="Atlas navigation"></nav>

      <section class="scale-intro" id="scale-top" aria-labelledby="scale-title">
        <div>
          <p class="scale-eyebrow">Length & distance / ${catalogue.length} references</p>
          <h1 id="scale-title">The Scale <em>of Things<span aria-hidden="true">.</span></em></h1>
        </div>
        <p class="scale-lede">Two real lengths. One clear comparison.</p>
      </section>

      <section class="scale-section scale-comparer" id="scale-compare" tabindex="-1" aria-labelledby="scale-compare-title">
        <div class="scale-section-heading">
          <p class="scale-section-number">01 / Compare</p>
          <h2 id="scale-compare-title">Put things in perspective.</h2>
          <p>Select any two references.</p>
        </div>
        <div class="scale-compare-workspace" data-project-preview>
        <div class="scale-pair">
          <div class="scale-reference-side scale-side-a">
            <label for="scale-compare-a"><span class="scale-letter">A</span> First reference</label>
            <select id="scale-compare-a">${options}</select>
            <div class="scale-pair-art" data-art-a></div>
            <p class="scale-pair-value" data-value-a></p>
            <p class="scale-pair-measure" data-measure-a></p>
          </div>
          <button class="scale-swap" type="button" data-action="swap"><span aria-hidden="true">⇄</span>Swap A & B</button>
          <div class="scale-reference-side scale-side-b">
            <label for="scale-compare-b"><span class="scale-letter">B</span> Second reference</label>
            <select id="scale-compare-b">${options}</select>
            <div class="scale-pair-art" data-art-b></div>
            <p class="scale-pair-value" data-value-b></p>
            <p class="scale-pair-measure" data-measure-b></p>
          </div>
        </div>
        <div class="scale-comparison-result">
          <div class="scale-verdict">
            <p class="scale-eyebrow">The long & the short</p>
            <p class="scale-ratio" data-ratio></p>
            <p class="scale-ratio-sentence" data-ratio-sentence role="status" aria-atomic="true"></p>
            <dl class="scale-equations">
              <div><dt>A ÷ B</dt><dd data-a-over-b></dd></div>
              <div><dt>B ÷ A</dt><dd data-b-over-a></dd></div>
              <div><dt>Orders apart</dt><dd data-orders></dd></div>
            </dl>
            <p class="scale-help">Ratios are unitless. Swapping A and B reverses the quotients, not which physical length is longer.</p>
          </div>
          <figure class="scale-linear-ruler">
            <figcaption>Now, on the <em>same</em> linear ruler</figcaption>
            <p data-ruler-label-a></p>
            <div class="scale-ratio-track" aria-hidden="true"><span class="scale-bar-a" data-bar-a></span></div>
            <p data-ruler-label-b></p>
            <div class="scale-ratio-track" aria-hidden="true"><span class="scale-bar-b" data-bar-b></span></div>
            <p class="scale-help" data-ruler-note></p>
          </figure>
        </div>
        </div>
        <div class="scale-display-control">
          <p>Two references, one honest ratio. Compare the named lengths—not their mass, volume or how many objects could fit inside another.
            Illustrations are enlarged separately for identification, <strong>not drawn in proportion.</strong></p>
          <label for="scale-units">Read values in
            <select id="scale-units">
              <option value="auto">Catalogue units</option>
              <option value="scientific">Scientific metres</option>
              ${Object.entries(UNITS).map(([id, unit]) => `<option value="${id}">${e(unit.name)} (${unit.symbol})</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="scale-presets" role="group" aria-label="Suggested comparisons">
          ${comparisonPresets.map((preset) => `<button type="button" data-preset="${preset.id}" aria-pressed="false" title="${e(preset.note)}">${e(preset.title)}</button>`).join('')}
        </div>
        <div class="scale-model">
          <div>
            <p class="scale-eyebrow">A thought experiment</p>
            <h3>Bring it into your world.</h3>
            <p>If A changes size, what happens to B at the same scale?</p>
          </div>
          <div class="scale-model-tool">
            <div class="scale-model-inputs">
              <label for="scale-model-length">Make A’s named length
                <input id="scale-model-length" type="number" inputmode="decimal" value="10" min="0.000001" max="1000000" step="any" aria-describedby="scale-model-help scale-model-error">
              </label>
              <label for="scale-model-unit">Model unit
                <select id="scale-model-unit"><option value="mm">millimetres</option><option value="cm" selected>centimetres</option><option value="m">metres</option><option value="km">kilometres</option></select>
              </label>
            </div>
            <p class="scale-help" id="scale-model-help">Use a positive value from 0.000001 to 1,000,000 in the chosen unit.</p>
            <p class="scale-error" id="scale-model-error" aria-live="polite"></p>
            <p class="scale-model-reading" data-model-reading aria-live="polite" aria-atomic="true"></p>
            <p class="scale-help">B’s model length = (B ÷ A) × A’s model length. This rescales a length, not the physical behaviour of an animal, cell or star.</p>
          </div>
        </div>
        <details class="scale-pair-caveats">
          <summary>What exactly are we comparing? <span aria-hidden="true">+</span></summary>
          <div data-pair-caveats></div>
        </details>
        <div class="scale-download-row">
          <button type="button" class="scale-button-dark" data-action="download">Download comparison <span aria-hidden="true">↓</span></button>
          <p class="scale-help" data-download-status role="status">A plain-text field note with both sources. Nothing is uploaded.</p>
        </div>
      </section>

      <section class="scale-section scale-explorer" id="scale-explore" tabindex="-1" aria-labelledby="scale-explore-title">
        <div class="scale-section-heading">
          <p class="scale-section-number">02 / Explore</p>
          <h2 id="scale-explore-title">One world. Many magnitudes.</h2>
          <p>Move along the ruler, or choose a reference to open its field note.</p>
        </div>
        <div class="scale-specimen">
          <figure class="scale-plate">
            <div class="scale-plate-heading"><span data-plate-number></span><span data-plate-domain></span></div>
            <div class="scale-plate-art" data-feature-art></div>
            <figcaption><span data-plate-measure></span><span>Illustration independently rescaled.<br>Not a shared physical scale.</span></figcaption>
          </figure>
          <article class="scale-specimen-copy" data-feature-copy aria-labelledby="scale-active-entry"></article>
        </div>
        <div class="scale-explorer-controls">
          <label for="scale-reference">Open a reference
            <select id="scale-reference">${options}</select>
          </label>
          <div class="scale-step-controls" role="group" aria-label="Adjacent references">
            <button type="button" data-action="previous"><span aria-hidden="true">←</span> Smaller</button>
            <button type="button" data-action="next">Larger <span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div class="scale-log-panel">
          <div class="scale-log-heading">
            <label for="scale-log">The logarithmic ruler</label>
            <output id="scale-probe" for="scale-log" aria-live="off"></output>
          </div>
          <div class="scale-log-marks" aria-hidden="true">${ticks}${catalogue.map((entry) => `<i style="left:${logPosition(entry.metres, bounds) * 100}%"></i>`).join('')}</div>
          <input id="scale-log" type="range" min="0" max="${rulerSteps}" step="1" aria-describedby="scale-log-help">
          <div class="scale-log-labels" aria-hidden="true">${tickLabels}</div>
          <p class="scale-help" id="scale-log-help">Each tick is a factor of 10, not another metre. The nearest catalogue reference is shown. Arrow keys move 0.05 orders at a time; Home and End reach the limits. Dots mark the references.</p>
          <div class="scale-domain-links" role="group" aria-label="Jump to a domain">
            ${domains.map((domain, index) => `<button type="button" data-domain="${domain.id}" data-jump="${domain.entry}" aria-pressed="false"><span>${String(index + 1).padStart(2, '0')}</span>${e(domain.name)}</button>`).join('')}
          </div>
        </div>
      </section>

      <section class="scale-section" id="scale-catalogue" tabindex="-1" aria-labelledby="scale-catalogue-title">
        <div class="scale-section-heading">
          <p class="scale-section-number">03 / The catalogue</p>
          <h2 id="scale-catalogue-title">A small inventory of a large world.</h2>
          <p>Read each reference’s story, see what was measured, and follow the source. Natural sizes are approximate; standards are labelled.</p>
        </div>
        <div class="scale-filters">
          <label for="scale-search">Search field notes
            <input id="scale-search" type="search" maxlength="160" placeholder="DNA, Moon, diameter…" autocomplete="off">
          </label>
          <label for="scale-domain-filter">Domain
            <select id="scale-domain-filter"><option value="all">All domains</option>${domains.map((domain) => `<option value="${domain.id}">${e(domain.name)}</option>`).join('')}</select>
          </label>
          <label for="scale-kind-filter">What is measured
            <select id="scale-kind-filter"><option value="all">Objects & distances</option><option value="object">Object dimensions</option><option value="distance">Distances only</option></select>
          </label>
          <button type="button" data-action="clear-filters">Clear filters</button>
        </div>
        <div class="scale-catalogue-heading"><p data-result-count role="status"></p><span>Smallest → largest</span></div>
        <ol class="scale-catalogue-list" data-catalogue-list></ol>
      </section>

      <section class="scale-section scale-notes" id="scale-notes" tabindex="-1" aria-labelledby="scale-notes-title">
        <div class="scale-section-heading">
          <p class="scale-section-number">04 / How to read this atlas</p>
          <h2 id="scale-notes-title">The small print matters.</h2>
          <p>A useful comparison starts by being clear about what the numbers mean.</p>
        </div>
        <div class="scale-atlas-note">
          <p class="scale-lede">A strand of DNA. A blue whale.<br>A galaxy we call home.</p>
          <p>Our world is difficult to take in at one size. Change your point of reference, and the familiar becomes extraordinary.</p>
          <p class="scale-edition"><strong>${catalogue.length}</strong> references <span>·</span> <strong>${orderSpan.toFixed(1)}</strong> orders of magnitude</p>
        </div>
        <div class="scale-reading-notes">
          <article><span class="scale-note-mark" aria-hidden="true">×10</span><h3>A ruler that multiplies.</h3><p>On an ordinary ruler, equal steps add equal lengths. Here, equal steps multiply: 1 mm → 10 mm → 100 mm. An order of magnitude means a factor of ten.</p><p>Positions use log₁₀(length in metres). The atlas spans about ${orderSpan.toFixed(1)} orders of magnitude. A halfway point is a <em>geometric</em> midpoint, not an arithmetic average.</p></article>
          <article><span class="scale-note-mark" aria-hidden="true">↔</span><h3>A length, not “bigness”.</h3><p>A whale’s length, a tree’s height and a planet’s diameter are all lengths. They are not interchangeable with area, mass or volume.</p><p>Entries marked <strong>Distance</strong> measure a separation, a route or a defined interval—not the size of an object. A light-year measures distance, despite its name.</p></article>
          <article><span class="scale-note-mark" aria-hidden="true">≈</span><h3>Approximate on purpose.</h3><p>Living things vary. Orbits change. A galaxy has no crisp edge. We choose labelled, source-backed reference values, not supposedly perfect sizes.</p><p>The ≈ sign means “approximately”. A ratio calculated from approximate inputs stays approximate, however many digits a calculator could print.</p></article>
        </div>
        <div class="scale-units-note">
          <h3>A pocket guide to units</h3>
          <dl>
            <div><dt>1 nm</dt><dd>10⁻⁹ m · a billionth of a metre</dd></div>
            <div><dt>1 µm</dt><dd>10⁻⁶ m · a millionth of a metre</dd></div>
            <div><dt>1 mm</dt><dd>10⁻³ m · a thousandth of a metre</dd></div>
            <div><dt>1 cm</dt><dd>10⁻² m · a hundredth of a metre</dd></div>
            <div><dt>1 km</dt><dd>10³ m · a thousand metres</dd></div>
            <div><dt>1 au</dt><dd>149,597,870,700 m · exactly</dd></div>
            <div><dt>1 ly</dt><dd>≈ 9.46 × 10¹⁵ m · a light-year</dd></div>
          </dl>
          <p class="scale-help">Conversions use the speed of light in vacuum (299,792,458 m/s) and a Julian year of exactly 365.25 days of 86,400 seconds. Extra conversion digits do not improve the precision of the original measurement.</p>
        </div>
        <div class="scale-editor-note"><strong>A note on the drawings.</strong> All plates are original inline illustrations, enlarged separately to remain legible. They are not photographs, maps, orbital solutions or molecular models. Only the comparison bars share a linear scale; an extremely short bar is allowed to disappear rather than being secretly enlarged.</div>
        <details class="scale-source-ledger">
          <summary>The source ledger · ${Object.keys(sources).length} references <span aria-hidden="true">+</span></summary>
          <p>Sources support the particular quantity described in each field note. Links open in a new tab; no external images, data or scripts are loaded by this atlas.</p>
          <ol>${Object.entries(sources).map(([id, source]) => `<li>${sourceLink(id as SourceId)}<p>${e(source.title)}</p><p class="scale-help">Used for: ${e(catalogue.filter((entry) => entry.source === id).map((entry) => entry.name).join('; '))}.</p></li>`).join('')}</ol>
          <p class="scale-help">Source review: ${SOURCE_REVIEW_DATE}. Older educational sources are used only for the stated scale estimate, not for unrelated or time-sensitive claims.</p>
        </details>
      </section>
      <footer class="scale-footer"><p>A small atlas for a very large world.<br><span>Read closely. Think relatively.</span></p><a href="#scale-top">Back to the beginning <span aria-hidden="true">↑</span></a></footer>
      <p class="scale-sr-only" data-feedback role="status" aria-live="polite"></p>
    </div>`;

  const atlasNotes = query<HTMLElement>(root, '.scale-notes');
  atlasNotes.prepend(query<HTMLElement>(root, '.scale-wordmark'));
  query<HTMLElement>(root, '.scale-header').prepend(query<HTMLElement>(root, '#scale-title'));
  atlasNotes.prepend(query<HTMLElement>(root, '.scale-intro'));
  const compare = query<HTMLElement>(root, '#scale-compare');
  const explore = query<HTMLElement>(root, '#scale-explore');
  const catalogueSection = query<HTMLElement>(root, '#scale-catalogue');
  const paneStack = document.createElement('div');
  paneStack.className = 'scale-pane-stack';
  query<HTMLElement>(root, '.scale-site').append(paneStack);
  const panes = [compare, explore, catalogueSection].map((section, index) => {
    const panel = document.createElement('div');
    panel.className = 'scale-atlas-pane';
    panel.append(section);
    paneStack.append(panel);
    return { id: ['compare', 'explore', 'catalogue'][index], label: ['Compare', 'Explore', 'Catalogue'][index], panel };
  });
  const tabs = createWorkspaceTabs(page, { id: 'scale-atlas', label: 'Atlas navigation', host: query(root, '[data-atlas-tabs]'), panes });
  atlasNotes.prepend(...[compare, explore].map(section => query<HTMLElement>(section, '.scale-section-heading')));
  const notebookButton = document.createElement('button');
  notebookButton.type = 'button';
  notebookButton.className = 'scale-notebook-button';
  notebookButton.textContent = 'Model & notebook';
  notebookButton.setAttribute('aria-label', 'Model & comparison notebook');
  compare.append(notebookButton);
  const notebook = createWorkspaceDialog(page, {
    id: 'scale-comparison-notebook', title: 'Comparison notebook', triggers: [notebookButton],
    content: ['.scale-model', '.scale-display-control', '.scale-presets', '.scale-verdict > .scale-help', '.scale-linear-ruler', '.scale-pair-caveats', '.scale-download-row']
      .map(selector => query<HTMLElement>(root, selector)),
  });
  atlasNotes.prepend(query<HTMLElement>(root, '#scale-log-help'));
  createWorkspaceDialog(page, {
    id: 'scale-atlas-notes', title: 'How to read this atlas',
    content: [atlasNotes, query(root, '.scale-footer')], triggers: [query(root, '[data-atlas-notes]')],
  });
  const specimen = query<HTMLElement>(root, '.scale-specimen');
  const referenceReading = document.createElement('div');
  referenceReading.className = 'scale-reference-reading';
  referenceReading.append(query<HTMLElement>(root, '.scale-specimen-copy'), query<HTMLElement>(root, '.scale-domain-links'));
  specimen.append(referenceReading);
  explore.prepend(query<HTMLElement>(root, '.scale-explorer-controls'), query<HTMLElement>(root, '.scale-log-panel'));
  root.querySelectorAll<HTMLAnchorElement>('a[href="#scale-top"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      link.closest('dialog')?.close();
      tabs.select('compare', true);
    }, { signal: page.signal });
  });

  const selectReference = query<HTMLSelectElement>(root, '#scale-reference');
  const ruler = query<HTMLInputElement>(root, '#scale-log');
  const selectA = query<HTMLSelectElement>(root, '#scale-compare-a');
  const selectB = query<HTMLSelectElement>(root, '#scale-compare-b');
  const unitsSelect = query<HTMLSelectElement>(root, '#scale-units');
  const modelInput = query<HTMLInputElement>(root, '#scale-model-length');
  const modelUnit = query<HTMLSelectElement>(root, '#scale-model-unit');
  const searchInput = query<HTMLInputElement>(root, '#scale-search');
  const domainFilter = query<HTMLSelectElement>(root, '#scale-domain-filter');
  const kindFilter = query<HTMLSelectElement>(root, '#scale-kind-filter');

  function announce(message: string): void {
    query(root, '[data-feedback]').textContent = message;
  }

  function goTo(id: string): void {
    const section = query<HTMLElement>(root, `#${id}`);
    notebook.close();
    tabs.select(id === 'scale-compare' ? 'compare' : id === 'scale-explore' ? 'explore' : 'catalogue');
    section.focus({ preventScroll: true });
    if (id.startsWith('scale-entry-')) {
      const list = query<HTMLElement>(root, '.scale-catalogue-list');
      list.scrollTop += section.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }
  }

  function updateProbe(): void {
    const metres = metresAtPosition(Number(ruler.value) / rulerSteps, bounds);
    const label = `Ruler: ${formatLength(metres)} · nearest reference shown`;
    query(root, '#scale-probe').textContent = label;
    ruler.setAttribute('aria-valuetext', `${formatLength(metres)}. Nearest reference: ${selected.name}, ${entryLength(selected)}, ${selected.measure.toLowerCase()}.`);
  }

  function showReference(entry: ScaleEntry, moveRuler = true): void {
    selected = entry;
    selectReference.value = entry.id;
    if (moveRuler) ruler.value = String(Math.round(logPosition(entry.metres, bounds) * rulerSteps));
    const index = catalogue.indexOf(entry);
    query(root, '[data-plate-number]').textContent = `Plate ${String(index + 1).padStart(2, '0')} / ${catalogue.length}`;
    query(root, '[data-plate-domain]').textContent = domainName(entry);
    query(root, '[data-plate-measure]').textContent = entry.measure;
    query(root, '[data-feature-art]').innerHTML = illustration(entry.illustration);
    query(root, '[data-feature-copy]').innerHTML = `
      <p class="scale-type-label">${entry.kind === 'object' ? 'Object dimension' : 'Distance'} <span>· ${e(entry.qualification)}</span></p>
      <h3 id="scale-active-entry">${e(entry.name)}</h3>
      <p class="scale-specimen-value">${e(entryLength(entry))}</p>
      <p class="scale-scientific">${entry.approximate ? '≈ ' : ''}${e(scientificNumber(entry.metres, entry.digits))} metres <span>· ${e(entry.measure.toLowerCase())}</span></p>
      <p class="scale-specimen-summary">${e(entry.summary)}</p>
      <p>${e(entry.context)}</p>
      <details class="scale-feature-source"><summary>Measurement & source <span aria-hidden="true">+</span></summary><p>${e(entry.caveat)}</p><p>${e(entry.sourceNote)}</p><p>${sourceLink(entry.source)}</p></details>
      <div class="scale-specimen-actions"><button type="button" data-assign="a" data-reference="${entry.id}">Compare as A</button><button type="button" data-assign="b" data-reference="${entry.id}">Compare as B</button><button type="button" class="scale-quiet-button" data-locate="${entry.id}">Full field note <span aria-hidden="true">↘</span></button></div>`;
    query<HTMLButtonElement>(root, '[data-action="previous"]').disabled = index === 0;
    query<HTMLButtonElement>(root, '[data-action="next"]').disabled = index === catalogue.length - 1;
    root.querySelectorAll<HTMLButtonElement>('[data-domain]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.domain === entry.domain));
    });
    updateProbe();
  }

  function modelMetres(): number | undefined {
    const value = modelInput.valueAsNumber;
    if (!Number.isFinite(value) || value < 0.000001 || value > 1_000_000) return undefined;
    return toMetres(value, selectedUnit(modelUnit));
  }

  function updateModel(): void {
    const model = modelMetres();
    const valid = model !== undefined;
    modelInput.setAttribute('aria-invalid', String(!valid));
    query(root, '#scale-model-error').textContent = valid ? '' : 'Enter a number from 0.000001 to 1,000,000. A length cannot be zero or negative.';
    query<HTMLButtonElement>(root, '[data-action="download"]').disabled = !valid;
    query(root, '[data-model-reading]').textContent = valid
      ? `If ${a.name} measured ${formatLength(model, selectedUnit(modelUnit), 6)}, ${b.name} would measure ≈ ${formatLength(rescaleLength(a.metres, b.metres, model))}.`
      : 'The model will appear here when the length is valid.';
    query(root, '[data-download-status]').textContent = 'A plain-text field note with both sources. Nothing is uploaded.';
  }

  function updateComparison(): void {
    selectA.value = a.id;
    selectB.value = b.id;
    const comparison = compareLengths(a.metres, b.metres);
    for (const [side, entry] of [['a', a], ['b', b]] as const) {
      query(root, `[data-art-${side}]`).innerHTML = illustration(entry.illustration);
      query(root, `[data-value-${side}]`).textContent = entryLength(entry, displayUnit);
      query(root, `[data-measure-${side}]`).textContent = `${entry.kind === 'object' ? 'Object' : 'Distance'} · ${entry.measure}`;
      query(root, `[data-ruler-label-${side}]`).textContent = `${side.toUpperCase()} · ${entry.name}`;
      query<HTMLElement>(root, `[data-bar-${side}]`).style.width = `${(side === 'a' ? comparison.aShare : comparison.bShare) * 100}%`;
    }
    query(root, '[data-ratio]').textContent = `${comparison.larger === 'equal' ? '' : '≈ '}${formatNumber(comparison.largerOverSmaller)}×`;
    query(root, '[data-ratio-sentence]').textContent = comparisonSentence(a, b);
    query(root, '[data-a-over-b]').textContent = `≈ ${formatNumber(comparison.aOverB)}`;
    query(root, '[data-b-over-a]').textContent = `≈ ${formatNumber(comparison.bOverA)}`;
    query(root, '[data-orders]').textContent = comparison.ordersApart.toFixed(2);
    query(root, '[data-ruler-note]').textContent = Math.min(comparison.aShare, comparison.bShare) < 0.01
      ? 'The shorter length is less than 1% of the longer one and may be too small to see. It has not been enlarged. Use the numerical ratio above.'
      : 'Both lengths share the same scale here. The longer reference fills the ruler; the other occupies its true linear fraction.';
    query(root, '[data-pair-caveats]').innerHTML = [a, b].map((entry, index) =>
      `<article><h3>${index ? 'B' : 'A'} · ${e(entry.name)}</h3><p><strong>${e(entry.measure)}:</strong> ${e(entryLength(entry))}.</p><p>${e(entry.caveat)}</p><p>${e(entry.sourceNote)}</p><p>${sourceLink(entry.source)}</p></article>`).join('');
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      const preset = comparisonPresets.find((item) => item.id === button.dataset.preset);
      button.setAttribute('aria-pressed', String(preset?.a === a.id && preset.b === b.id));
    });
    updateModel();
  }

  function catalogueItem(entry: ScaleEntry): string {
    const number = String(catalogue.indexOf(entry) + 1).padStart(2, '0');
    return `<li class="scale-catalogue-item" id="scale-entry-${entry.id}" tabindex="-1">
      <div class="scale-catalogue-overview">
        <span class="scale-entry-number">${number}</span>
        <div class="scale-catalogue-art">${illustration(entry.illustration)}</div>
        <div class="scale-catalogue-name"><p class="scale-type-label">${e(domainName(entry))} · ${entry.kind === 'object' ? 'Object' : 'Distance'}</p><h3>${e(entry.name)}</h3><p class="scale-catalogue-value">${e(entryLength(entry))}</p><p class="scale-help">${e(entry.measure)}</p></div>
        <p class="scale-catalogue-summary">${e(entry.summary)}</p>
        <button type="button" data-explore="${entry.id}" aria-label="Explore ${e(entry.name)}">Explore <span aria-hidden="true">↗</span></button>
      </div>
      <details class="scale-catalogue-note"><summary>Read field note <span aria-hidden="true">+</span></summary>
        <div class="scale-field-note"><div><h4>${e(entry.qualification)}</h4><p>${e(entry.context)}</p><p>${e(entry.caveat)}</p></div>
          <div><h4>Where the number comes from</h4><p>${e(entry.sourceNote)}</p><p>${sourceLink(entry.source)}</p><p class="scale-help">In metres: ${e(scientificNumber(entry.metres, entry.digits))} m. Conversion does not add measurement precision.</p>
          <div class="scale-note-actions"><button type="button" data-assign="a" data-reference="${entry.id}">Use as A</button><button type="button" data-assign="b" data-reference="${entry.id}">Use as B</button></div></div>
        </div>
      </details>
    </li>`;
  }

  function renderCatalogue(): void {
    const term = searchText(searchInput.value.trim());
    const entries = catalogue.filter((entry) => {
      const text = searchText(`${entry.name} ${entry.measure} ${entry.qualification} ${entry.summary} ${entry.context} ${entry.caveat} ${entry.sourceNote} ${sources[entry.source].publisher} ${entryLength(entry)} ${domainName(entry)} ${UNITS[entry.unit].name} ${UNITS[entry.unit].symbol}`);
      return (domainFilter.value === 'all' || domainFilter.value === entry.domain)
        && (kindFilter.value === 'all' || kindFilter.value === entry.kind)
        && (!term || text.includes(term));
    });
    query(root, '[data-catalogue-list]').innerHTML = entries.length
      ? entries.map(catalogueItem).join('')
      : '<li class="scale-empty"><h3>No references found.</h3><p>Try a different word or widen the domain and measurement filters.</p><button type="button" data-action="clear-filters">Show all references</button></li>';
    query(root, '[data-result-count]').textContent = `${entries.length} of ${catalogue.length} references`;
    query<HTMLButtonElement>(root, '.scale-filters [data-action="clear-filters"]').disabled = !term && domainFilter.value === 'all' && kindFilter.value === 'all';
  }

  function clearFilters(): void {
    searchInput.value = '';
    domainFilter.value = 'all';
    kindFilter.value = 'all';
    renderCatalogue();
  }

  function downloadComparison(): void {
    const model = modelMetres();
    if (model === undefined) {
      updateModel();
      modelInput.focus();
      return;
    }
    const comparison = compareLengths(a.metres, b.metres);
    const text = [
      'THE SCALE OF THINGS', 'A comparison field note', '',
      ...[a, b].flatMap((entry, index) => [
        `${index ? 'B' : 'A'}: ${entry.name}`, `${entry.kind === 'object' ? 'Object dimension' : 'Distance'} — ${entry.measure}`,
        `${entryLength(entry, displayUnit)} (${scientificNumber(entry.metres, entry.digits)} m)`,
        entry.qualification, entry.caveat, `Source basis: ${entry.sourceNote}`,
        `${sources[entry.source].publisher}: ${sources[entry.source].url}`, '',
      ]),
      comparisonSentence(a, b),
      `A / B ≈ ${formatNumber(comparison.aOverB)}; B / A ≈ ${formatNumber(comparison.bOverA)} (unitless).`,
      `Orders of magnitude apart: ${comparison.ordersApart.toFixed(2)}.`, '',
      `If A's named length becomes ${formatLength(model, selectedUnit(modelUnit), 6)}, B's becomes approximately ${formatLength(rescaleLength(a.metres, b.metres, model))}.`,
      "Model B = (real B / real A) × model A. This rescales length only, not area, volume, mass or physical behaviour.",
      'The logarithmic atlas uses log10(length in metres). Illustrations are individually rescaled and not in proportion.',
      'All results inherit the uncertainty of their reference values. Converted digits are not new measurement precision.',
      `Source review: ${SOURCE_REVIEW_DATE}.`,
    ].join('\n');
    downloadText(`scale-${a.id}-and-${b.id}.txt`, text);
    query(root, '[data-download-status]').textContent = 'Your comparison download has been requested, with measurements, caveats and source links.';
  }

  selectReference.addEventListener('change', () => {
    showReference(reference(selectReference.value));
    announce(`Opened ${selected.name}, ${entryLength(selected)}.`);
  }, { signal: page.signal });
  ruler.addEventListener('input', () => {
    const metres = metresAtPosition(Number(ruler.value) / rulerSteps, bounds);
    const next = nearestReference(catalogue, metres);
    if (next.id !== selected.id) showReference(next, false);
    else updateProbe();
  }, { signal: page.signal });
  selectA.addEventListener('change', () => { a = reference(selectA.value); updateComparison(); }, { signal: page.signal });
  selectB.addEventListener('change', () => { b = reference(selectB.value); updateComparison(); }, { signal: page.signal });
  unitsSelect.addEventListener('change', () => {
    const value = unitsSelect.value;
    if (value !== 'auto' && value !== 'scientific' && !isUnit(value)) throw new Error(`Unknown display unit: ${value}`);
    displayUnit = value;
    updateComparison();
  }, { signal: page.signal });
  modelInput.addEventListener('input', updateModel, { signal: page.signal });
  modelUnit.addEventListener('change', updateModel, { signal: page.signal });
  searchInput.addEventListener('input', renderCatalogue, { signal: page.signal });
  domainFilter.addEventListener('change', renderCatalogue, { signal: page.signal });
  kindFilter.addEventListener('change', renderCatalogue, { signal: page.signal });
  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.jump) {
      showReference(reference(button.dataset.jump));
      announce(`Opened ${selected.name} in ${domainName(selected)}.`);
    } else if (button.dataset.explore) {
      showReference(reference(button.dataset.explore));
      goTo('scale-explore');
      announce(`Opened ${selected.name}, ${entryLength(selected)}.`);
    } else if (button.dataset.locate) {
      clearFilters();
      const entry = query<HTMLElement>(root, `#scale-entry-${button.dataset.locate}`);
      query<HTMLDetailsElement>(entry, 'details').open = true;
      goTo(entry.id);
    } else if (button.dataset.assign && button.dataset.reference) {
      const entry = reference(button.dataset.reference);
      if (button.dataset.assign === 'a') a = entry;
      else b = entry;
      updateComparison();
      goTo('scale-compare');
      announce(`${entry.name} is now reference ${button.dataset.assign.toUpperCase()}.`);
    } else if (button.dataset.preset) {
      const preset = comparisonPresets.find((item) => item.id === button.dataset.preset);
      if (!preset) throw new Error(`Unknown scale comparison: ${button.dataset.preset}`);
      a = reference(preset.a);
      b = reference(preset.b);
      updateComparison();
    } else {
      switch (button.dataset.action) {
        case 'previous':
        case 'next': {
          const direction = button.dataset.action === 'previous' ? -1 : 1;
          const next = catalogue[catalogue.indexOf(selected) + direction];
          if (next) { showReference(next); announce(`Opened ${next.name}, ${entryLength(next)}.`); }
          break;
        }
        case 'swap': [a, b] = [b, a]; updateComparison(); announce('References A and B exchanged.'); break;
        case 'clear-filters': {
          const removedButton = !button.closest('.scale-filters');
          clearFilters();
          if (removedButton) searchInput.focus();
          break;
        }
        case 'download': downloadComparison(); break;
      }
    }
  }, { signal: page.signal });

  showReference(selected);
  updateComparison();
  renderCatalogue();
  return { destroy: page.destroy };
}
