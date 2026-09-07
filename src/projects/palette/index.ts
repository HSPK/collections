import './style.css';
import { copyText, createProjectPage, downloadText, escapeMarkup, query, readLocalData, writeLocalData } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import { HARMONY_INFO, RECIPES, ROLE_INFO } from './data';
import {
  contrastGrade, contrastRatio, cookPalette, createKitchenState, editPigment, HARMONIES, isHarmony,
  isRecipeName, isRole, isSavedRecipes, normalizeHex, readableInk, ROLES, togglePin,
} from './engine';
import type { Role, SavedRecipe } from './engine';
import { paletteCss, paletteSvg } from './export';

const PANTRY_KEY = 'palette-kitchen-pantry-v1';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'palette');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  let state = createKitchenState(RECIPES[0].settings);
  let selected: Role = 'base';
  let foreground: Role = 'ink';
  let background: Role = 'paper';
  let largeType = false;
  let pantry: SavedRecipe[] = [];

  const options = ROLES.map((role) => `<option value="${role}">${ROLE_INFO[role].name}</option>`).join('');
  root.innerHTML = `
    <div class="pk-wrap">
      <header class="pk-header">
        <a class="pk-wordmark" href="#pk-mix" aria-label="Palette Kitchen mixing counter">
          <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M11 6h22l-3 10 7 17q-15 12-30 0l7-17Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 28q12-8 26 0v5q-13 8-26 0Z" fill="currentColor"/><path d="M16 11h12" stroke="currentColor" stroke-width="2"/></svg>
          <span>A small-batch<br>color laboratory</span>
        </a>
        <nav aria-label="Kitchen sections"><a href="#pk-mix">Mix</a><a href="#pk-taste">Taste</a><a href="#pk-keep">Keep</a></nav>
      </header>

      <section class="pk-hero" aria-labelledby="pk-title">
        <h1 id="pk-title">Palette <em>Kitchen</em><span class="pk-period">.</span></h1>
        <p class="pk-intro">Mix a base color, taste the contrast, keep the recipe.</p>
      </section>

      <section class="pk-counter" id="pk-mix" aria-labelledby="pk-mix-title" data-project-preview>
        <div class="pk-section-heading"><h2 id="pk-mix-title"><span>01</span> Your palette</h2><label class="pk-proof-toggle"><input type="checkbox" data-proof> Grayscale proof</label></div>
        <div class="pk-spectrum" aria-label="Your five-color palette">
          ${ROLES.map((role, index) => `<button type="button" class="pk-chip" data-role="${role}" aria-pressed="${role === selected}">
            <span class="pk-chip-label"><span>${String(index + 1).padStart(2, '0')}</span> ${ROLE_INFO[role].short}<span class="pk-pin-mark" data-pin-mark="${role}" aria-hidden="true"></span></span>
            <span class="pk-chip-type" aria-hidden="true">Aa</span><span class="pk-chip-hex" data-chip-hex="${role}"></span>
          </button>`).join('')}
        </div>
        <p class="pk-caption">Select a pigment to edit it. Every swatch uses its more readable black or white ink. <span data-proof-note hidden>Grayscale is a visual proof; all ratios still describe the original sRGB colors.</span></p>

        <div class="pk-workbench">
          <section class="pk-recipe-controls" aria-labelledby="pk-ingredients-title">
            <div class="pk-card-heading"><h3 id="pk-ingredients-title">Build your recipe</h3><span class="pk-small-label">5 useful pigments</span></div>
            <form class="pk-base-form" data-base-form novalidate>
              <label for="pk-base">Base ingredient <span>#RGB or #RRGGBB</span></label>
              <div class="pk-input-row">
                <input class="pk-color-input" type="color" data-base-picker aria-label="Pick a base color" value="${state.settings.base}">
                <input id="pk-base" class="pk-hex-input" type="text" data-base value="${state.settings.base}" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="pk-base-error">
                <button class="pk-solid-button" type="submit">Mix color</button>
              </div>
              <p class="pk-error" id="pk-base-error" data-base-error role="alert"></p>
            </form>
            <label class="pk-field" for="pk-harmony">Color-wheel recipe
              <select id="pk-harmony" data-harmony>${HARMONIES.map((harmony) => `<option value="${harmony}">${HARMONY_INFO[harmony].name}</option>`).join('')}</select>
            </label>
            <p class="pk-field-note" data-harmony-note></p>
            <div class="pk-sliders">
              <label for="pk-spice">Spice <output data-spice-output for="pk-spice"></output><input id="pk-spice" data-spice type="range" min="0" max="100" step="1"><span>Muted companions &harr; vivid companions</span></label>
              <label for="pk-warmth">Paper warmth <output data-warmth-output for="pk-warmth"></output><input id="pk-warmth" data-warmth type="range" min="-30" max="30" step="1"><span>Cool paper &harr; warm paper</span></label>
            </div>
          </section>
          <section class="pk-pigment-editor" aria-labelledby="pk-pigment-title">
            <div class="pk-card-heading"><h3 id="pk-pigment-title" data-pigment-title></h3><span class="pk-selected-dot" aria-hidden="true" data-selected-dot></span></div>
            <p class="pk-field-note" data-pigment-note></p>
            <form data-pigment-form novalidate>
              <label for="pk-pigment">Edit this pigment</label>
              <div class="pk-input-row">
                <input class="pk-color-input" type="color" data-pigment-picker aria-label="Pick the selected pigment">
                <input class="pk-hex-input" id="pk-pigment" data-pigment type="text" maxlength="7" autocomplete="off" spellcheck="false" aria-describedby="pk-pigment-error">
                <button type="submit">Apply</button>
              </div>
              <p class="pk-error" data-pigment-error id="pk-pigment-error" role="alert"></p>
            </form>
            <div class="pk-pin-row"><button type="button" data-pin></button><button type="button" data-copy-color>Copy hex</button></div>
            <p class="pk-pin-note" data-pin-note></p>
            <div class="pk-ink-comparisons">
              <div><div class="pk-ink-sample" data-black-sample>Black ink</div><strong data-black-ratio></strong><span data-black-grade></span></div>
              <div><div class="pk-ink-sample" data-white-sample>White ink</div><strong data-white-ratio></strong><span data-white-grade></span></div>
            </div>
          </section>
        </div>

        <div class="pk-presets-heading"><h3>Six recipes from the notebook</h3><button type="button" data-unpin-all>Unpin all pigments</button></div>
        <p class="pk-field-note">Pinned pigments stay put when you mix or choose another recipe. Direct edits pin a pigment automatically.</p>
        <div class="pk-recipes">
          ${RECIPES.map((recipe, index) => {
            const colors = cookPalette(createKitchenState(recipe.settings));
            return `<button type="button" class="pk-recipe" data-recipe="${recipe.id}" aria-pressed="${index === 0}">
              <span class="pk-recipe-number">Recipe ${String(index + 1).padStart(2, '0')}</span><strong>${recipe.name}</strong><span class="pk-recipe-note">${recipe.note}</span>
              <span class="pk-recipe-colors" aria-hidden="true">${ROLES.map((role) => `<i style="background:${colors[role]}"></i>`).join('')}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="pk-tasting" id="pk-taste" aria-labelledby="pk-taste-title">
        <div class="pk-section-heading"><h2 id="pk-taste-title"><span>02</span> Taste it in type</h2><span class="pk-small-label">No invented scores. Just light.</span></div>
        <div class="pk-taste-grid">
          <div class="pk-pairing">
            <div class="pk-pair-selectors">
              <label for="pk-foreground">Text ink<select id="pk-foreground" data-foreground>${options}</select></label>
              <button type="button" class="pk-swap" data-swap aria-label="Swap text and background colors">&harr;</button>
              <label for="pk-background">Background<select id="pk-background" data-background>${options}</select></label>
            </div>
            <article class="pk-specimen" data-specimen>
              <p class="pk-specimen-kicker">The important small print</p><h3>A bright idea needs a readable label.</h3>
              <p class="pk-specimen-body" data-specimen-body>For notes, navigation and everything worth reading. Color is a lovely ingredient; contrast makes it useful.</p>
            </article>
            <div class="pk-verdict"><strong data-pair-ratio></strong><span data-pair-verdict></span></div>
            <div class="pk-specimen-actions"><label><input data-large-type type="checkbox"> Large type (24px)</label><button type="button" data-copy-pair>Copy this pairing</button></div>
          </div>
          <div class="pk-contrast-guide">
            <h3>Let the colors do the math.</h3><p>A ratio compares the relative lightness of two sRGB colors. <strong>1:1</strong> is identical; <strong>21:1</strong> is black on white.</p>
            <dl><div><dt>4.5:1</dt><dd>AA for normal text</dd></div><div><dt>7:1</dt><dd>AAA for normal text</dd></div><div><dt>3:1</dt><dd>AA for large text</dd></div></dl>
            <p class="pk-field-note">Large means at least 24px regular or about 18.7px bold. These are WCAG 2 contrast thresholds, not a complete accessibility audit. Ratings use unrounded values.</p>
          </div>
        </div>
        <details class="pk-matrix-details">
          <summary>Open the full pairing table <span>25 ways to taste your palette</span></summary>
          <p>Rows are backgrounds; columns are text ink. Choose any ratio to try that pairing above. AA and AAA refer to normal text.</p>
          <div class="pk-table-scroll" tabindex="0" role="region" aria-label="Scrollable contrast pairing table">
            <table><caption>WCAG contrast for all five pigments</caption><thead><tr><th scope="col">Paper &darr; / ink &rarr;</th>${ROLES.map((role) => `<th scope="col">${ROLE_INFO[role].short}</th>`).join('')}</tr></thead>
              <tbody>${ROLES.map((bg) => `<tr><th scope="row">${ROLE_INFO[bg].short}</th>${ROLES.map((fg) => `<td><button type="button" data-pair-fg="${fg}" data-pair-bg="${bg}"></button></td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section class="pk-keeping" id="pk-keep" aria-labelledby="pk-keep-title">
        <div class="pk-section-heading"><h2 id="pk-keep-title"><span>03</span> Keep something good</h2><span class="pk-small-label">Made here. Yours to take.</span></div>
        <div class="pk-keep-grid">
          <div class="pk-export">
            <h3>Ready for the real world.</h3><p>Five CSS variables, plus the more readable black or white ink for each. Or take a printable SVG recipe card with the ratios attached.</p>
            <label class="pk-code-label" for="pk-css">Your CSS, ready to copy</label><textarea id="pk-css" data-css readonly rows="14" spellcheck="false"></textarea>
            <div class="pk-export-buttons"><button type="button" class="pk-solid-button" data-download-svg>Keep SVG card</button><button type="button" data-download-css>Download CSS</button><button type="button" data-copy-css>Copy CSS</button></div>
          </div>
          <div class="pk-pantry">
            <div class="pk-card-heading"><h3>The recipe pantry</h3><span class="pk-small-label" data-pantry-count></span></div>
            <p>Put a favorite on the shelf. Explicit saves stay in this browser; download a card to keep it elsewhere.</p>
            <form data-save-form novalidate>
              <label for="pk-recipe-name">Name this mix <span>up to 48 characters</span></label>
              <input type="text" id="pk-recipe-name" data-recipe-name value="Market tomato" maxlength="48" autocomplete="off" aria-describedby="pk-save-error">
              <p class="pk-error" id="pk-save-error" data-save-error role="alert"></p>
              <button type="submit" class="pk-solid-button">Save to pantry</button>
            </form>
            <div class="pk-shelf" data-shelf></div>
          </div>
        </div>
      </section>
      <p class="pk-status" data-status role="status" aria-live="polite">The counter is ready. Start with a recipe or bring your own base color.</p>
      <footer class="pk-footer"><span>Palette Kitchen / a small-batch color laboratory</span><span>Local mixing. No accounts. Nothing sent away.</span></footer>
    </div>`;

  const take = (selector: string) => query<HTMLElement>(root, selector);
  const makeButton = (label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    return button;
  };
  const header = take('.pk-header');
  const notesButton = makeButton('Notes');
  const recipesButton = makeButton('Recipes');
  const notes = [
    take('.pk-wordmark'), take('.pk-intro'), take('.pk-caption'),
    take('.pk-recipe-controls .pk-card-heading'), take('[data-harmony-note]'),
    take('[data-pigment-note]'), take('[data-pin-note]'),
    take('.pk-contrast-guide'), take('.pk-export > h3'), take('.pk-export > p'),
    take('.pk-pantry > .pk-card-heading'), take('.pk-pantry > p'), take('.pk-footer'),
  ];
  createWorkspaceDialog(page, { id: 'pk-notes', title: 'Kitchen notes', content: notes, triggers: [notesButton] });
  const recipeDialog = createWorkspaceDialog(page, {
    id: 'pk-recipes', title: 'Recipe notebook', triggers: [recipesButton],
    content: [take('.pk-presets-heading'), take('.pk-presets-heading + p'), take('.pk-recipes')],
  });
  header.replaceChildren(take('h1'), recipesButton, notesButton);
  take('.pk-hero').remove();

  const shelfButton = makeButton('Open pantry');
  const cssButton = makeButton('View / copy CSS');
  createWorkspaceDialog(page, {
    id: 'pk-pantry', title: 'Saved recipe pantry', triggers: [shelfButton], content: [take('[data-shelf]')],
  });
  createWorkspaceDialog(page, {
    id: 'pk-code', title: 'Your CSS', triggers: [cssButton],
    content: [take('.pk-code-label'), take('[data-css]'), take('[data-copy-css]')],
  });
  take('.pk-pantry').append(shelfButton);
  take('.pk-export-buttons').append(cssButton);

  const matrixButton = makeButton('Open the full pairing table');
  const matrix = take('.pk-matrix-details');
  const matrixDialog = createWorkspaceDialog(page, {
    id: 'pk-pairs', title: 'All 25 contrast pairings', triggers: [matrixButton], content: [matrix],
  });
  (matrix as HTMLDetailsElement).open = true;
  take('.pk-specimen-actions').append(matrixButton);
  const bench = take('.pk-workbench');
  const mix = take('.pk-recipe-controls');
  const pigment = take('.pk-pigment-editor');
  const tasting = take('.pk-tasting');
  const keeping = take('.pk-keeping');
  const tabsHost = document.createElement('div');
  bench.before(tabsHost);
  bench.replaceChildren(mix, pigment, tasting, keeping);
  const tabs = createWorkspaceTabs(page, {
    id: 'pk-work', label: 'Palette workspace', host: tabsHost,
    onSelect: (id) => { root.dataset.pane = id; },
    panes: [
      { id: 'mix', label: 'Mix', panel: mix },
      { id: 'pigment', label: 'Pigment', panel: pigment },
      { id: 'taste', label: 'Taste', panel: tasting },
      { id: 'keep', label: 'Keep', panel: keeping },
    ],
  });
  const status = query<HTMLElement>(root, '[data-status]');
  const dialogStatus = document.createElement('p');
  dialogStatus.className = 'pk-dialog-status';
  dialogStatus.setAttribute('role', 'status');
  const announce = (message: string) => {
    if (signal.aborted) return;
    status.textContent = message;
    const openDialog = root.querySelector('dialog[open] .workspace-dialog-content');
    if (openDialog) {
      dialogStatus.textContent = message;
      openDialog.prepend(dialogStatus);
    }
  };
  const baseInput = query<HTMLInputElement>(root, '[data-base]');
  const basePicker = query<HTMLInputElement>(root, '[data-base-picker]');
  const baseError = query<HTMLElement>(root, '[data-base-error]');
  const pigmentInput = query<HTMLInputElement>(root, '[data-pigment]');
  const pigmentPicker = query<HTMLInputElement>(root, '[data-pigment-picker]');
  const pigmentError = query<HTMLElement>(root, '[data-pigment-error]');
  const harmonyInput = query<HTMLSelectElement>(root, '[data-harmony]');
  const spiceInput = query<HTMLInputElement>(root, '[data-spice]');
  const warmthInput = query<HTMLInputElement>(root, '[data-warmth]');
  const foregroundInput = query<HTMLSelectElement>(root, '[data-foreground]');
  const backgroundInput = query<HTMLSelectElement>(root, '[data-background]');
  const pinButton = query<HTMLButtonElement>(root, '[data-pin]');
  const nameInput = query<HTMLInputElement>(root, '[data-recipe-name]');
  const saveError = query<HTMLElement>(root, '[data-save-error]');
  const shelf = query<HTMLElement>(root, '[data-shelf]');
  const errors = [baseError, pigmentError, saveError];
  const errorDialog = createWorkspaceDialog(page, {
    id: 'pk-error', title: 'Check this recipe', content: errors,
  });
  function showError(error: HTMLElement) {
    for (const message of errors) message.hidden = message !== error;
    errorDialog.open();
  }

  function clearColorErrors() {
    baseError.textContent = '';
    pigmentError.textContent = '';
    baseInput.removeAttribute('aria-invalid');
    pigmentInput.removeAttribute('aria-invalid');
  }

  function renderPair() {
    const palette = cookPalette(state);
    const ratio = contrastRatio(palette[foreground], palette[background]);
    const aa = largeType ? 3 : 4.5;
    const aaa = largeType ? 4.5 : 7;
    foregroundInput.value = foreground;
    backgroundInput.value = background;
    const specimen = query<HTMLElement>(root, '[data-specimen]');
    specimen.style.backgroundColor = palette[background];
    specimen.style.color = palette[foreground];
    specimen.classList.toggle('pk-large-type', largeType);
    query<HTMLElement>(root, '[data-pair-ratio]').textContent = `${ratio.toFixed(2)}:1`;
    const verdict = query<HTMLElement>(root, '[data-pair-verdict]');
    verdict.textContent = `${largeType ? 'Large' : 'Normal'} text: ${ratio >= aaa ? 'AAA & AA pass' : ratio >= aa ? 'AA pass; AAA does not pass' : 'AA does not pass'}`;
    verdict.dataset.passes = String(ratio >= aa);
  }

  function render() {
    const palette = cookPalette(state);
    clearColorErrors();
    baseInput.value = state.settings.base;
    basePicker.value = state.settings.base;
    harmonyInput.value = state.settings.harmony;
    spiceInput.value = String(state.settings.spice);
    warmthInput.value = String(state.settings.warmth);
    query<HTMLOutputElement>(root, '[data-spice-output]').value = `${state.settings.spice}%`;
    query<HTMLOutputElement>(root, '[data-warmth-output]').value = `${state.settings.warmth > 0 ? '+' : ''}${state.settings.warmth}`;
    query<HTMLElement>(root, '[data-harmony-note]').textContent = HARMONY_INFO[state.settings.harmony].note;
    for (const role of ROLES) {
      const chip = query<HTMLButtonElement>(root, `[data-role="${role}"]`);
      chip.style.backgroundColor = palette[role];
      chip.style.color = readableInk(palette[role]);
      chip.setAttribute('aria-pressed', String(role === selected));
      chip.setAttribute('aria-label', `Edit ${ROLE_INFO[role].name}, ${palette[role]}`);
      query<HTMLElement>(chip, `[data-chip-hex="${role}"]`).textContent = palette[role].toUpperCase();
      query<HTMLElement>(chip, `[data-pin-mark="${role}"]`).textContent = role !== 'base' && state.pins[role] ? '*' : '';
    }
    query<HTMLElement>(root, '[data-pigment-title]').textContent = ROLE_INFO[selected].name;
    query<HTMLElement>(root, '[data-pigment-note]').textContent = ROLE_INFO[selected].note;
    query<HTMLElement>(root, '[data-selected-dot]').style.backgroundColor = palette[selected];
    pigmentInput.value = palette[selected];
    pigmentPicker.value = palette[selected];
    pinButton.hidden = selected === 'base';
    pinButton.textContent = selected !== 'base' && state.pins[selected] ? 'Unpin pigment' : 'Pin pigment';
    pinButton.setAttribute('aria-pressed', String(selected !== 'base' && Boolean(state.pins[selected])));
    query<HTMLElement>(root, '[data-pin-note]').textContent = selected === 'base'
      ? 'The base is always your ingredient. The recipe never changes it.'
      : state.pins[selected] ? 'Pinned: this pigment stays put until you unpin or edit it.' : 'Unpinned: this pigment follows your recipe.';
    for (const ink of ['black', 'white'] as const) {
      const color = ink === 'black' ? '#000000' : '#ffffff';
      const sample = query<HTMLElement>(root, `[data-${ink}-sample]`);
      sample.style.backgroundColor = palette[selected];
      sample.style.color = color;
      const ratio = contrastRatio(palette[selected], color);
      query<HTMLElement>(root, `[data-${ink}-ratio]`).textContent = `${ratio.toFixed(2)}:1`;
      query<HTMLElement>(root, `[data-${ink}-grade]`).textContent = contrastGrade(ratio) === 'Large only' ? 'AA: large text only' : contrastGrade(ratio) === 'Fails' ? 'Below AA for text' : `${contrastGrade(ratio)} normal text`;
    }
    query<HTMLButtonElement>(root, '[data-unpin-all]').disabled = !Object.values(state.pins).some(Boolean);
    for (const recipe of RECIPES) {
      const active = (['base', 'harmony', 'spice', 'warmth'] as const)
        .every((key) => recipe.settings[key] === state.settings[key]);
      query<HTMLButtonElement>(root, `[data-recipe="${recipe.id}"]`).setAttribute('aria-pressed', String(active));
    }
    for (const cell of root.querySelectorAll<HTMLButtonElement>('[data-pair-fg]')) {
      const fg = cell.dataset.pairFg;
      const bg = cell.dataset.pairBg;
      if (!fg || !bg || !isRole(fg) || !isRole(bg)) throw new Error('Invalid palette table role.');
      const ratio = contrastRatio(palette[fg], palette[bg]);
      cell.innerHTML = `<strong>${ratio.toFixed(2)}</strong><span>${contrastGrade(ratio)}</span>`;
      cell.dataset.grade = ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'large' : 'fail';
      cell.setAttribute('aria-label', `${ROLE_INFO[fg].short} text on ${ROLE_INFO[bg].short}, ${ratio.toFixed(2)} to 1, ${contrastGrade(ratio)}`);
    }
    query<HTMLTextAreaElement>(root, '[data-css]').value = paletteCss(state);
    renderPair();
  }

  function renderShelf() {
    query<HTMLElement>(root, '[data-pantry-count]').textContent = `${pantry.length} / 8 jars`;
    shelf.innerHTML = pantry.length
      ? pantry.map((recipe) => {
        const colors = cookPalette(recipe.state);
        return `<div class="pk-saved-recipe">
          <button type="button" data-load="${recipe.id}" aria-label="Load ${escapeMarkup(recipe.name)}"><span class="pk-saved-colors" aria-hidden="true">${ROLES.map((role) => `<i style="background:${colors[role]}"></i>`).join('')}</span><strong>${escapeMarkup(recipe.name)}</strong><span>Load recipe &rarr;</span></button>
          <button type="button" class="pk-remove-recipe" data-remove="${recipe.id}" aria-label="Remove ${escapeMarkup(recipe.name)} from pantry">Remove</button>
        </div>`;
      }).join('')
      : '<p class="pk-empty-shelf">An empty shelf is a good beginning.<br>Name this mix and save your first recipe.</p>';
  }

  function applyColor(role: Role, value: string, source: 'base' | 'pigment') {
    const hex = normalizeHex(value);
    if (!hex) {
      const error = source === 'base' ? baseError : pigmentError;
      const input = source === 'base' ? baseInput : pigmentInput;
      error.textContent = 'Use 3 or 6 hex digits, for example #b74732. Your palette has not changed.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      showError(error);
      announce('That color is not a valid hex value. Your last valid palette is still on the counter.');
      return;
    }
    state = editPigment(state, role, hex);
    render();
    announce(`${ROLE_INFO[role].name} set to ${hex}.${role !== 'base' ? ' Pinned so the recipe will keep it.' : ''}`);
  }

  query<HTMLFormElement>(root, '[data-base-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    applyColor('base', baseInput.value, 'base');
  }, { signal });
  query<HTMLFormElement>(root, '[data-pigment-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    applyColor(selected, pigmentInput.value, 'pigment');
  }, { signal });
  basePicker.addEventListener('input', () => applyColor('base', basePicker.value, 'base'), { signal });
  pigmentPicker.addEventListener('input', () => applyColor(selected, pigmentPicker.value, 'pigment'), { signal });
  harmonyInput.addEventListener('change', () => {
    if (!isHarmony(harmonyInput.value)) throw new Error('Unknown harmony option.');
    state = { ...state, settings: { ...state.settings, harmony: harmonyInput.value } };
    render();
    announce(`Mixed ${HARMONY_INFO[state.settings.harmony].name.toLowerCase()}. Pinned pigments stayed put.`);
  }, { signal });
  for (const [input, key] of [[spiceInput, 'spice'], [warmthInput, 'warmth']] as const) {
    input.addEventListener('input', () => {
      state = { ...state, settings: { ...state.settings, [key]: input.valueAsNumber } };
      render();
    }, { signal });
  }
  pinButton.addEventListener('click', () => {
    if (selected === 'base') throw new Error('The base ingredient cannot be pinned.');
    state = togglePin(state, selected);
    render();
    announce(`${ROLE_INFO[selected].name} ${state.pins[selected] ? 'pinned' : 'unpinned and mixed back into the recipe'}.`);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-unpin-all]').addEventListener('click', () => {
    state = createKitchenState(state.settings);
    render();
    announce('All pigments unpinned. Your recipe is mixing every companion again.');
  }, { signal });
  const proofInput = query<HTMLInputElement>(root, '[data-proof]');
  proofInput.addEventListener('change', () => {
    const checked = proofInput.checked;
    root.classList.toggle('pk-grayscale', checked);
    query<HTMLElement>(root, '[data-proof-note]').hidden = !checked;
    announce(checked ? 'Grayscale proof on. Contrast ratios still describe the original colors.' : 'Full color restored.');
  }, { signal });

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const chip = event.target.closest<HTMLButtonElement>('[data-role]');
    if (chip) {
      const role = chip.dataset.role;
      if (!role || !isRole(role)) throw new Error('Unknown pigment.');
      selected = role;
      render();
      tabs.select('pigment');
    }
    const recipeButton = event.target.closest<HTMLButtonElement>('[data-recipe]');
    if (recipeButton) {
      const recipe = RECIPES.find((item) => item.id === recipeButton.dataset.recipe);
      if (!recipe) throw new Error('Unknown recipe.');
      state = { settings: { ...recipe.settings }, pins: { ...state.pins } };
      nameInput.value = recipe.name;
      render();
      announce(`${recipe.name} is on the counter. Any pinned pigments were preserved.`);
      recipeDialog.close();
    }
    const pair = event.target.closest<HTMLButtonElement>('[data-pair-fg]');
    if (pair) {
      const fg = pair.dataset.pairFg;
      const bg = pair.dataset.pairBg;
      if (!fg || !bg || !isRole(fg) || !isRole(bg)) throw new Error('Invalid color pairing.');
      foreground = fg;
      background = bg;
      renderPair();
      matrixDialog.close();
      tabs.select('taste');
      announce(`Tasting ${ROLE_INFO[fg].short.toLowerCase()} text on ${ROLE_INFO[bg].short.toLowerCase()}.`);
    }
  }, { signal });

  foregroundInput.addEventListener('change', () => {
    if (!isRole(foregroundInput.value)) throw new Error('Unknown foreground pigment.');
    foreground = foregroundInput.value;
    renderPair();
  }, { signal });
  backgroundInput.addEventListener('change', () => {
    if (!isRole(backgroundInput.value)) throw new Error('Unknown background pigment.');
    background = backgroundInput.value;
    renderPair();
  }, { signal });
  query<HTMLButtonElement>(root, '[data-swap]').addEventListener('click', () => {
    [foreground, background] = [background, foreground];
    renderPair();
  }, { signal });
  const largeTypeInput = query<HTMLInputElement>(root, '[data-large-type]');
  largeTypeInput.addEventListener('change', () => {
    largeType = largeTypeInput.checked;
    renderPair();
  }, { signal });

  query<HTMLButtonElement>(root, '[data-copy-color]').addEventListener('click', () => {
    void copyText(cookPalette(state)[selected], announce);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-copy-pair]').addEventListener('click', () => {
    const palette = cookPalette(state);
    void copyText(`color: ${palette[foreground]};\nbackground-color: ${palette[background]};`, announce);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-copy-css]').addEventListener('click', () => {
    const code = query<HTMLTextAreaElement>(root, '[data-css]');
    code.select();
    void copyText(code.value, announce);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-download-css]').addEventListener('click', () => {
    downloadText('palette-kitchen.css', paletteCss(state), 'text/css;charset=utf-8');
    announce('Your CSS file is ready, with all five pigments and their readable inks.');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-download-svg]').addEventListener('click', () => {
    if (nameInput.value.trim() && !isRecipeName(nameInput.value.trim())) {
      saveError.textContent = 'Use a recipe name of up to 48 printable characters before exporting.';
      nameInput.setAttribute('aria-invalid', 'true');
      tabs.select('keep');
      nameInput.focus();
      showError(saveError);
      announce('The recipe name contains unsupported characters. Edit it before exporting the SVG.');
      return;
    }
    downloadText('palette-kitchen.svg', paletteSvg(state, nameInput.value), 'image/svg+xml;charset=utf-8');
    announce('Your SVG recipe card is ready. It includes every color and both ink comparisons.');
  }, { signal });

  query<HTMLFormElement>(root, '[data-save-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!isRecipeName(name)) {
      saveError.textContent = 'Give this recipe a name between 1 and 48 printable characters.';
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      showError(saveError);
      announce('Add a recipe name before saving it to the pantry.');
      return;
    }
    if (pantry.length >= 8) {
      saveError.textContent = 'The pantry holds eight recipes. Remove a jar to make room, or download this recipe instead.';
      showError(saveError);
      announce('The pantry is full. Download this recipe or remove an older saved mix.');
      return;
    }
    saveError.textContent = '';
    nameInput.removeAttribute('aria-invalid');
    const nextPantry = [...pantry, { id: crypto.randomUUID(), name, state: structuredClone(state) }];
    if (writeLocalData(PANTRY_KEY, nextPantry, announce)) {
      pantry = nextPantry;
      renderShelf();
      announce(`${name} saved in this browser's recipe pantry.`);
    } else {
      saveError.textContent = 'This recipe was not saved. Download it instead; your current palette is unchanged.';
      showError(saveError);
    }
  }, { signal });
  shelf.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const load = event.target.closest<HTMLButtonElement>('[data-load]');
    const remove = event.target.closest<HTMLButtonElement>('[data-remove]');
    if (!load && !remove) return;
    const recipe = pantry.find((item) => item.id === (load?.dataset.load ?? remove?.dataset.remove));
    if (!recipe) throw new Error('The saved recipe is no longer in the pantry.');
    if (load) {
      state = structuredClone(recipe.state);
      nameInput.value = recipe.name;
      render();
      announce(`${recipe.name} is back on the counter, pins and all.`);
    } else {
      const nextPantry = pantry.filter((item) => item.id !== recipe.id);
      if (writeLocalData(PANTRY_KEY, nextPantry, announce)) {
        pantry = nextPantry;
        renderShelf();
        saveError.textContent = '';
        announce(`${recipe.name} removed from the pantry. Your current palette is unchanged.`);
        query<HTMLButtonElement>(root, '#pk-pantry .workspace-dialog-heading button').focus();
      }
    }
  }, { signal });

  pantry = readLocalData(PANTRY_KEY, isSavedRecipes, announce) ?? [];
  render();
  renderShelf();
  page.onCleanup(() => { pantry = []; });
  return { destroy: page.destroy };
}
