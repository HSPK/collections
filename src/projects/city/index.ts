import './style.css';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { fieldNotes, presets, recipes, tileById, tiles } from './data';
import type { RecipeRule, TileId } from './data';
import {
  HISTORY_LIMIT, MAX_NAME_LENGTH, PlanInputError, addressOf, analyzePlan, clearPlan, commitPlan,
  createHistory, deserializePlan, isStreet, isTileId, neighborIndices, placeTile,
  planFilename, planFromPreset, recipeChecks, redo, renamePlan, serializePlan, undo,
} from './engine';
import type { CityHistory, CityPlan } from './engine';
import { exportIllustration, renderMap, tileIcon } from './renderer';

const e = escapeMarkup;

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'city');
  let history = createHistory(planFromPreset(presets[0]));
  let metrics = analyzePlan(history.present);
  let selected = 27;
  let ingredient: TileId = 'cottage';
  let showGroups = false;
  let enlarged = false;
  let importRevision = 0;
  let renderedName = history.present.name;

  page.root.innerHTML = `
    <div class="city-sheet">
      <header class="city-masthead" id="city-top">
        <a class="city-wordmark" href="#city-top">
          <span class="city-wordmark-art" aria-hidden="true">${tileIcon('cottage')}</span>
          <span>The neighborhood press<small>Small places, made by you.</small></span>
        </a>
        <nav class="city-nav" aria-label="Recipe for a City">
          <a href="#city-worktable">Worktable</a><a href="#city-recipes">Recipes</a><a href="#city-fieldnotes">Field notes</a>
        </nav>
      </header>

      <section class="city-introduction" aria-labelledby="city-title">
        <div>
          <p class="city-eyebrow">An illustrated street-making toy</p>
          <h1 id="city-title">Recipe for a <em>City<span aria-hidden="true">.</span></em></h1>
        </div>
        <p class="city-lede">Choose a tile. Make a place of your own.</p>
      </section>

      <section class="city-worktable" id="city-worktable" aria-labelledby="city-plan-heading">
        <div class="city-section-heading">
          <div>
            <p class="city-eyebrow">01 / The worktable</p>
            <h2 id="city-plan-heading" data-city-plan-name tabindex="-1">${e(history.present.name)}</h2>
          </div>
          <label class="city-preset-label">Start from a recipe
            <select data-city-preset>
              <option value="">Choose a starting plan…</option>
              ${presets.map((preset) => `<option value="${preset.id}">${e(preset.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="city-studio">
          <figure class="city-map-frame" data-project-preview>
            <div class="city-map-tools">
              <span class="city-eyebrow" data-city-dimensions>8 × 8 paper plots</span>
              <button type="button" class="city-small-button" data-city-action="zoom" aria-pressed="false">Enlarge drawing</button>
            </div>
            <div class="city-art" data-city-art></div>
            <figcaption>
              <strong data-city-map-selection></strong>
              <span>Original illustration · not to scale</span>
            </figcaption>
            <div class="city-map-legend">
              <label class="city-check-label"><input type="checkbox" data-city-groups> Road groups</label>
              <p data-city-map-hint>Tapping the drawing selects a plot; it never paints over your work. Use Place to make a change.</p>
            </div>
            <p class="city-map-group-note" data-city-group-note hidden>Matching numbers mark connected streets.
              Different numbers mean separate groups; color is only a second cue. Numbers are recalculated after each edit.</p>
          </figure>

          <aside class="city-editor" aria-label="Neighborhood editing controls">
            <fieldset class="city-ingredients">
              <legend><span class="city-step">1</span> Pick an ingredient</legend>
              <div class="city-palette">
                ${tiles.map((tile) => `<button type="button" class="city-tile-choice" data-city-tile="${tile.id}"
                  aria-label="${e(tile.name)}" aria-pressed="${tile.id === ingredient}">
                  ${tileIcon(tile.id)}<span>${e(tile.name)}</span><span class="city-choice-mark" aria-hidden="true">✓</span>
                </button>`).join('')}
              </div>
              <p class="city-ingredient-note" data-city-ingredient-note></p>
            </fieldset>

            <div class="city-address-editor">
              <h3><span class="city-step">2</span> Choose an address</h3>
              <div class="city-address-fields">
                <label>Column<select data-city-column aria-label="Plot column"></select></label>
                <label>Row<select data-city-row aria-label="Plot row"></select></label>
              </div>
              <div class="city-place-actions">
                <button type="button" class="city-primary" data-city-action="place"></button>
                <button type="button" data-city-action="remove">Remove tile</button>
              </div>
              <div class="city-address-target" tabindex="0" role="group" data-city-navigator
                aria-describedby="city-key-help" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Delete">
                <span class="city-address-number" data-city-address-label></span>
                <div><strong data-city-current-tile></strong><span>Focus here to move with arrow keys.</span></div>
              </div>
              <p class="city-cell-note" data-city-cell-note></p>
              <div class="city-direction-buttons" role="group" aria-label="Move the selected address">
                <button type="button" data-city-move="north" aria-label="Select previous row">↑ <span>Row</span></button>
                <button type="button" data-city-move="west" aria-label="Select previous column">← <span>Column</span></button>
                <button type="button" data-city-move="east" aria-label="Select next column"><span>Column</span> →</button>
                <button type="button" data-city-move="south" aria-label="Select next row"><span>Row</span> ↓</button>
              </div>
              <p class="city-key-help" id="city-key-help">On the address pad: arrows move; Enter or Space places;
                Delete removes. The row and column menus work without these shortcuts.</p>
            </div>

            <div class="city-history-actions" role="group" aria-label="Plan history">
              <button type="button" data-city-action="undo" disabled>↶ Undo</button>
              <button type="button" data-city-action="redo" disabled>↷ Redo</button>
            </div>
            <div class="city-reset-actions">
              <button type="button" data-city-action="reset">Restore canal starter</button>
              <button type="button" data-city-action="clear">Clear all plots</button>
            </div>
            <p class="city-history-note">Restoring, clearing, opening a plan, and placing tiles can all be undone.
              The last ${HISTORY_LIMIT} changes stay in this tab.</p>
            <p class="city-status" role="status" aria-live="polite" aria-atomic="true" data-city-status>
              The canal quarter is ready. Try a cottage, a park, or a missing stretch of street.
            </p>
          </aside>

          <section class="city-observations" aria-labelledby="city-observations-heading">
            <p class="city-eyebrow">Notes from this plan, not a score</p>
            <h3 id="city-observations-heading">What actually meets?</h3>
            <dl class="city-metrics">
              <div><dt>Street tiles</dt><dd data-city-road-count></dd><span>streets + bridges</span></div>
              <div><dt>Road groups</dt><dd data-city-road-groups></dd><span>shared-side connections</span></div>
              <div><dt>Building frontage</dt><dd data-city-frontage></dd><span>building tiles beside a street</span></div>
            </dl>
            <p class="city-observation-text" data-city-observation></p>
            <p class="city-green-note" data-city-green-note></p>
            <details class="city-frontage-details">
              <summary data-city-frontage-summary></summary>
              <div class="city-frontage-addresses" data-city-frontage-addresses></div>
            </details>
            <a class="city-text-link" href="#city-graph-rules">Read the exact counting rules <span aria-hidden="true">↗</span></a>
          </section>
        </div>
      </section>

      <section class="city-recipes" id="city-recipes" aria-labelledby="city-recipes-heading">
        <div class="city-recipe-context">
          <p class="city-lede">A few homes, a ribbon of road, a place to linger.
            Make a little neighborhood, one good small idea at a time.
            Pick an ingredient, choose an address, then place it.</p>
          <aside class="city-recipe-slip" aria-label="A note from the worktable">
            <p class="city-eyebrow">Serves: one curious mind</p>
            <p>A pinch of park.<br>A handful of doorsteps.<br><em>Stir in a street.</em></p>
            <span class="city-slip-rule"></span>
            <p class="city-small">No budget to balance. No perfect score.<br>Just a small place to think with.</p>
          </aside>
        </div>
        <div class="city-section-heading">
          <div><p class="city-eyebrow">02 / A few things to try</p><h2 id="city-recipes-heading">Three small recipes.</h2></div>
          <p>No winning city here. These live checklists describe your current plan, not its quality.</p>
        </div>
        <div class="city-recipe-grid">
          ${recipes.map((recipe) => `<article class="city-recipe">
            <span class="city-recipe-number" aria-hidden="true">${recipe.number}</span>
            <h3>${e(recipe.title)}</h3><p>${e(recipe.introduction)}</p>
            <ol>${recipe.steps.map((step) => `<li>${e(step)}</li>`).join('')}</ol>
            <ul class="city-recipe-checks" aria-label="${e(recipe.title)} live ingredients">
              ${recipe.checks.map((check) => `<li data-city-rule="${check.rule}">
                <span class="city-check-icon" aria-hidden="true">○</span><span>${e(check.label)}</span><span class="city-sr-only" data-city-check-status></span>
              </li>`).join('')}
            </ul>
            <details><summary>A small hint</summary><p>${e(recipe.hint)}</p></details>
            <button type="button" data-city-load-preset="${recipe.presetId}">Try ${e(presets.find((preset) => preset.id === recipe.presetId)!.name)}</button>
          </article>`).join('')}
        </div>
      </section>

      <section class="city-fieldnotes" id="city-fieldnotes" aria-labelledby="city-fieldnotes-heading">
        <div class="city-section-heading">
          <div><p class="city-eyebrow">03 / The field guide</p><h2 id="city-fieldnotes-heading">Small ingredients.<br>Clear rules.</h2></div>
          <p>Everything you see is drawn here from simple shapes. Nothing arrives from a map service,
            an image library, or a city simulation.</p>
        </div>
        <div class="city-reference-layout">
          <section class="city-catalog" aria-labelledby="city-catalog-heading">
            <h3 id="city-catalog-heading">The ingredient shelf</h3>
            <p>One tile at each address. The counts below always describe the plan on your worktable.</p>
            <dl>
              ${tiles.map((tile) => `<div class="city-catalog-item">
                <dt>${tileIcon(tile.id)}<span>${e(tile.name)}<small data-city-count="${tile.id}"></small></span></dt>
                <dd><p>${e(tile.description)}</p><p class="city-catalog-rule">${e(tile.rule)}</p></dd>
              </div>`).join('')}
            </dl>
          </section>
          <section class="city-graph-rules" id="city-graph-rules" aria-labelledby="city-rules-heading">
            <p class="city-eyebrow">Under the paper</p>
            <h3 id="city-rules-heading">Drawn like a town.<br>Counted like a graph.</h3>
            ${fieldNotes.map((note, index) => `<article${index === fieldNotes.length - 1 ? ' class="city-caveat"' : ''}>
              <h4>${e(note.title)}</h4><p>${e(note.text)}</p>
            </article>`).join('')}
          </section>
        </div>
      </section>

      <section class="city-keep" aria-labelledby="city-keep-heading">
        <div class="city-keep-heading">
          <p class="city-eyebrow">04 / Fold it up and take it home</p>
          <h2 id="city-keep-heading">A little place,<br><em>yours to keep.</em></h2>
          <p>Save a clean, original SVG illustration to print or edit. Save the JSON plan to bring
            your exact tiles back later. Both files are made in your browser; nothing is uploaded.</p>
        </div>
        <div class="city-keep-controls">
          <form class="city-name-form" data-city-name-form>
            <label for="city-plan-title">Title on your illustration</label>
            <div><input id="city-plan-title" data-city-name value="${e(history.present.name)}" maxlength="${MAX_NAME_LENGTH}" required autocomplete="off">
              <button type="submit">Set title</button></div>
          </form>
          <div class="city-export-actions">
            <button type="button" class="city-primary" data-city-action="export-svg">Keep the illustration <span>SVG ↓</span></button>
            <button type="button" data-city-action="export-json">Save the editable plan <span>JSON ↓</span></button>
            <button type="button" class="city-open-plan" data-city-action="open-json">Open a saved JSON plan <span>↑</span></button>
            <input type="file" accept=".json,application/json" aria-label="Choose a Recipe for a City JSON plan" data-city-import hidden>
          </div>
          <p class="city-small">This page does not autosave. Reloading starts a new canal quarter.
            JSON keeps the title and tiles, not your undo history. Opening a plan is itself undoable.</p>
          <p class="city-export-status" role="status" aria-live="polite" aria-atomic="true" data-city-export-status></p>
        </div>
      </section>
      <footer class="city-footer"><p>Recipe for a City · A toy model, not real urban planning advice.</p><a href="#city-top">Back to the rooftops ↑</a></footer>
    </div>`;

  const art = query<HTMLDivElement>(page.root, '[data-city-art]');
  const columnControl = query<HTMLSelectElement>(page.root, '[data-city-column]');
  const rowControl = query<HTMLSelectElement>(page.root, '[data-city-row]');
  const navigator = query<HTMLDivElement>(page.root, '[data-city-navigator]');
  const placeButton = query<HTMLButtonElement>(page.root, '[data-city-action="place"]');
  const removeButton = query<HTMLButtonElement>(page.root, '[data-city-action="remove"]');
  const status = query<HTMLElement>(page.root, '[data-city-status]');
  const exportStatus = query<HTMLElement>(page.root, '[data-city-export-status]');
  const nameInput = query<HTMLInputElement>(page.root, '[data-city-name]');
  const importInput = query<HTMLInputElement>(page.root, '[data-city-import]');
  const presetControl = query<HTMLSelectElement>(page.root, '[data-city-preset]');

  const announce = (message: string) => { status.textContent = message; };

  function describeSelected(): string {
    const plan = history.present;
    const tile = plan.cells[selected];
    const neighbors = neighborIndices(plan, selected);
    if (isStreet(tile)) {
      const group = metrics.groupByCell[selected];
      const streetNeighbors = neighbors.filter((neighbor) => isStreet(plan.cells[neighbor])).length;
      return `Road group ${group + 1}, with ${metrics.roadGroups[group].length} street tiles. This tile shares ${streetNeighbors} ${streetNeighbors === 1 ? 'side' : 'sides'} with another street.`;
    }
    if (tileById[tile].kind === 'building') {
      const frontage = neighbors.filter((neighbor) => isStreet(plan.cells[neighbor])).length;
      const green = neighbors.filter((neighbor) => tileById[plan.cells[neighbor]].kind === 'green').length;
      return `${frontage ? `Street frontage on ${frontage} ${frontage === 1 ? 'side' : 'sides'}` : 'No street frontage'}. ${green} neighboring ${green === 1 ? 'green tile' : 'green tiles'}.`;
    }
    return tileById[tile].rule;
  }

  function renderSelection(): void {
    const plan = history.present;
    const address = addressOf(plan, selected);
    const tile = tileById[plan.cells[selected]];
    const brush = tileById[ingredient];
    art.innerHTML = renderMap(plan, metrics, selected, showGroups);
    query<HTMLElement>(page.root, '[data-city-map-selection]').textContent = `Selected: ${address} · ${tile.name}`;
    query<HTMLElement>(page.root, '[data-city-address-label]').textContent = address;
    query<HTMLElement>(page.root, '[data-city-current-tile]').textContent = tile.name;
    query<HTMLElement>(page.root, '[data-city-cell-note]').textContent = describeSelected();
    navigator.setAttribute('aria-label', `Address ${address}, ${tile.name}. Arrow keys select a plot; Enter places ${brush.name}.`);
    columnControl.value = String(selected % plan.width);
    rowControl.value = String(Math.floor(selected / plan.width));
    placeButton.textContent = ingredient === 'empty' ? `Clear ${address}` : `Place ${brush.name} at ${address}`;
    placeButton.disabled = ingredient === plan.cells[selected];
    removeButton.disabled = plan.cells[selected] === 'empty';
    removeButton.setAttribute('aria-label', `Remove tile at ${address}`);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-city-tile]')) {
      button.setAttribute('aria-pressed', String(button.dataset.cityTile === ingredient));
    }
    query<HTMLElement>(page.root, '[data-city-ingredient-note]').innerHTML = `<strong>${e(brush.name)}.</strong> ${e(brush.rule)}`;
    const column = selected % plan.width;
    const row = Math.floor(selected / plan.width);
    for (const button of page.root.querySelectorAll<HTMLButtonElement>('[data-city-move]')) {
      button.disabled = button.dataset.cityMove === 'north' ? row === 0
        : button.dataset.cityMove === 'south' ? row === plan.height - 1
          : button.dataset.cityMove === 'west' ? column === 0 : column === plan.width - 1;
    }
  }

  function renderPlan(): void {
    const plan = history.present;
    metrics = analyzePlan(plan);
    query<HTMLElement>(page.root, '[data-city-plan-name]').textContent = plan.name;
    query<HTMLElement>(page.root, '[data-city-dimensions]').textContent = `${plan.width} × ${plan.height} paper plots`;
    columnControl.innerHTML = Array.from({ length: plan.width }, (_, column) => `<option value="${column}">${String.fromCharCode(65 + column)}</option>`).join('');
    rowControl.innerHTML = Array.from({ length: plan.height }, (_, row) => `<option value="${row}">${row + 1}</option>`).join('');
    if (plan.name !== renderedName) nameInput.value = plan.name;
    renderedName = plan.name;
    query<HTMLButtonElement>(page.root, '[data-city-action="undo"]').disabled = history.past.length === 0;
    query<HTMLButtonElement>(page.root, '[data-city-action="redo"]').disabled = history.future.length === 0;
    query<HTMLButtonElement>(page.root, '[data-city-action="clear"]').disabled = metrics.occupiedCount === 0;
    query<HTMLElement>(page.root, '[data-city-road-count]').textContent = String(metrics.roadCount);
    query<HTMLElement>(page.root, '[data-city-road-groups]').textContent = String(metrics.roadGroups.length);
    query<HTMLElement>(page.root, '[data-city-frontage]').textContent = `${metrics.buildingsWithFrontage} / ${metrics.buildingCount}`;
    const networkNote = metrics.roadCount === 0 ? 'No streets yet, so there are no road groups.'
      : metrics.roadGroups.length === 1 ? `All ${metrics.roadCount} street tiles belong to one connected group.`
        : `${metrics.roadGroups.length} separate road groups. The largest contains ${metrics.largestRoadGroup} of ${metrics.roadCount} street tiles.`;
    query<HTMLElement>(page.root, '[data-city-observation]').textContent = `${networkNote} There ${metrics.roadEdges === 1 ? 'is' : 'are'} ${metrics.roadEdges} shared-side ${metrics.roadEdges === 1 ? 'street connection' : 'street connections'} (each pair counted once).`;
    query<HTMLElement>(page.root, '[data-city-green-note]').textContent = `${metrics.buildingsBesideGreen} of ${metrics.buildingCount} building tiles have a park or allotment directly next door. There are ${metrics.greenCount} green tiles and ${metrics.counts.water} canal tiles; water under a bridge counts as a bridge, not a canal tile.`;
    query<HTMLElement>(page.root, '[data-city-frontage-summary]').textContent = metrics.buildingCount === 0
      ? 'No building tiles to check yet'
      : metrics.unfrontedBuildings.length === 0 ? 'Every building tile has street frontage'
        : `${metrics.unfrontedBuildings.length} building ${metrics.unfrontedBuildings.length === 1 ? 'tile has' : 'tiles have'} no street frontage · show addresses`;
    query<HTMLElement>(page.root, '[data-city-frontage-addresses]').innerHTML = metrics.unfrontedBuildings.length
      ? metrics.unfrontedBuildings.map((index) => `<button type="button" data-city-select-address="${index}">${addressOf(plan, index)} · ${e(tileById[plan.cells[index]].name)}</button>`).join('')
      : `<p>${metrics.buildingCount ? 'Frontage means a shared side, not necessarily access to one common road group.' : 'Place a cottage, row houses, a bakery, or a library to explore frontage.'}</p>`;
    for (const count of page.root.querySelectorAll<HTMLElement>('[data-city-count]')) {
      const id = count.dataset.cityCount as TileId;
      count.textContent = `${metrics.counts[id]} on this plan`;
    }
    const checks = recipeChecks(metrics);
    for (const item of page.root.querySelectorAll<HTMLElement>('[data-city-rule]')) {
      const met = checks[item.dataset.cityRule as RecipeRule];
      item.dataset.met = String(met);
      query<HTMLElement>(item, '.city-check-icon').textContent = met ? '✓' : '○';
      query<HTMLElement>(item, '[data-city-check-status]').textContent = met ? ' — met' : ' — not yet';
    }
    renderSelection();
  }

  function replaceHistory(next: CityHistory, message: string): void {
    if (next === history) {
      announce('No change needed. Your undo history is unchanged.');
      return;
    }
    const column = selected % history.present.width;
    const row = Math.floor(selected / history.present.width);
    history = next;
    selected = Math.min(row, history.present.height - 1) * history.present.width
      + Math.min(column, history.present.width - 1);
    renderPlan();
    announce(message);
  }

  function commit(plan: CityPlan, message: string): void {
    replaceHistory(commitPlan(history, plan), message);
  }

  function selectPlot(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= history.present.cells.length) {
      announce('Choose an address inside the neighborhood. The selected plot has not changed.');
      return;
    }
    selected = index;
    renderSelection();
    announce(`${addressOf(history.present, selected)} selected: ${tileById[history.present.cells[selected]].name}. ${describeSelected()}`);
  }

  function moveSelection(direction: string): void {
    const plan = history.present;
    let column = selected % plan.width;
    let row = Math.floor(selected / plan.width);
    if (direction === 'north') row--;
    if (direction === 'east') column++;
    if (direction === 'south') row++;
    if (direction === 'west') column--;
    if (row < 0 || row >= plan.height || column < 0 || column >= plan.width) {
      announce('The selected address is already at that edge of the neighborhood.');
      return;
    }
    selectPlot(row * plan.width + column);
  }

  function place(tile: TileId): void {
    const address = addressOf(history.present, selected);
    commit(placeTile(history.present, selected, tile),
      tile === 'empty' ? `Cleared ${address}. Undo brings the tile back.` : `${tileById[tile].name} placed at ${address}. Undo is available.`);
  }

  function loadPreset(id: string): void {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Unknown city recipe: ${id}`);
    commit(planFromPreset(preset), `Opened “${preset.name}.” ${preset.description} Undo brings the previous plan back.`);
    presetControl.value = '';
  }

  function download(extension: 'svg' | 'json'): void {
    const plan = history.present;
    const content = extension === 'svg' ? exportIllustration(plan) : serializePlan(plan);
    try {
      downloadText(planFilename(plan, extension), content, extension === 'svg' ? 'image/svg+xml;charset=utf-8' : 'application/json;charset=utf-8');
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      exportStatus.textContent = 'Your browser could not start the download. Check its download permissions; your plan is still on the worktable.';
      return;
    }
    exportStatus.textContent = extension === 'svg'
      ? 'Your SVG illustration is ready for your browser’s downloads. It has no selection marker or road-group overlay.'
      : 'Your JSON plan is ready for your browser’s downloads. Open it here later to restore the title and tiles.';
  }

  page.root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const cell = event.target.closest<SVGGElement>('[data-city-cell]');
    if (cell) {
      selectPlot(Number(cell.dataset.cityCell));
      return;
    }
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (isTileId(button.dataset.cityTile)) {
      ingredient = button.dataset.cityTile;
      renderSelection();
      announce(`${tileById[ingredient].name} selected. Choose an address, then use Place.`);
      return;
    }
    if (button.dataset.cityMove) {
      moveSelection(button.dataset.cityMove);
      return;
    }
    if (button.dataset.citySelectAddress !== undefined) {
      selectPlot(Number(button.dataset.citySelectAddress));
      navigator.focus({ preventScroll: false });
      return;
    }
    if (button.dataset.cityLoadPreset) {
      loadPreset(button.dataset.cityLoadPreset);
      query<HTMLElement>(page.root, '#city-worktable').scrollIntoView({ block: 'start' });
      query<HTMLElement>(page.root, '[data-city-plan-name]').focus({ preventScroll: true });
      return;
    }
    switch (button.dataset.cityAction) {
      case 'place': place(ingredient); break;
      case 'remove': place('empty'); break;
      case 'undo': replaceHistory(undo(history), 'Undid the last change.'); break;
      case 'redo': replaceHistory(redo(history), 'Redid the last change.'); break;
      case 'clear': commit(clearPlan(history.present), 'All plots cleared. Undo brings the whole neighborhood back.'); break;
      case 'reset': loadPreset(presets[0].id); break;
      case 'zoom':
        enlarged = !enlarged;
        art.classList.toggle('city-art-enlarged', enlarged);
        button.setAttribute('aria-pressed', String(enlarged));
        button.textContent = enlarged ? 'Fit drawing' : 'Enlarge drawing';
        query<HTMLElement>(page.root, '[data-city-map-hint]').textContent = enlarged
          ? 'Enlarged: scroll or swipe inside the drawing. Address controls stay below or beside it.'
          : 'Tap a plot to select it, or use the address controls.';
        break;
      case 'export-svg': download('svg'); break;
      case 'export-json': download('json'); break;
      case 'open-json': importInput.click(); break;
    }
  }, { signal: page.signal });

  page.root.addEventListener('change', (event) => {
    if (event.target === columnControl || event.target === rowControl) {
      selectPlot(Number(rowControl.value) * history.present.width + Number(columnControl.value));
    } else if (event.target === presetControl && presetControl.value) {
      loadPreset(presetControl.value);
    } else if (event.target instanceof HTMLInputElement && event.target.matches('[data-city-groups]')) {
      showGroups = event.target.checked;
      query<HTMLElement>(page.root, '[data-city-group-note]').hidden = !showGroups;
      renderSelection();
      announce(showGroups ? 'Road group numbers are shown. Equal numbers mean connected streets.' : 'Road group numbers hidden. The plan has not changed.');
    }
  }, { signal: page.signal });

  page.root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        event.stopPropagation();
        const forward = key === 'y' || event.shiftKey;
        replaceHistory(forward ? redo(history) : undo(history), forward ? 'Redid the last change.' : 'Undid the last change.');
      }
      return;
    }
    if (target !== navigator || event.altKey) return;
    const directions: Record<string, string> = { ArrowUp: 'north', ArrowRight: 'east', ArrowDown: 'south', ArrowLeft: 'west' };
    if (directions[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(directions[event.key]);
    } else if (['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      place(event.key === 'Enter' || event.key === ' ' ? ingredient : 'empty');
    }
  }, { signal: page.signal });

  query<HTMLFormElement>(page.root, '[data-city-name-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      commit(renamePlan(history.present, nameInput.value), 'Neighborhood title updated. It will appear on both saved files.');
      nameInput.value = history.present.name;
      exportStatus.textContent = `Title set to “${history.present.name}.”`;
    } catch (error) {
      if (!(error instanceof PlanInputError)) throw error;
      exportStatus.textContent = error.message;
    }
  }, { signal: page.signal });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    const revision = ++importRevision;
    if (file.size > 100_000) {
      exportStatus.textContent = 'Choose a Recipe for a City JSON file under 100 KB. Your current plan has not changed.';
      return;
    }
    exportStatus.textContent = 'Opening your saved plan…';
    try {
      const text = await file.text();
      if (page.signal.aborted || revision !== importRevision) return;
      const plan = deserializePlan(text);
      commit(plan, `Opened “${plan.name}.” Undo brings your previous neighborhood back.`);
      exportStatus.textContent = `Opened “${plan.name}.” Your previous plan is one Undo away.`;
    } catch (error) {
      if (page.signal.aborted || revision !== importRevision) return;
      if (!(error instanceof PlanInputError) && !(error instanceof DOMException)) throw error;
      exportStatus.textContent = `${error.message} Your current plan has not changed.`;
    }
  }, { signal: page.signal });

  page.onCleanup(() => { importRevision++; });
  renderPlan();
  return { destroy: page.destroy };
}
