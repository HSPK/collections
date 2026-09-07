import './style.css';
import { clamp } from '../../core/math';
import { createProjectPage, downloadBlob, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { createWorkspaceDialog } from '../../core/workspace';
import { BACKGROUNDS, EXPORT_SIZES, PALETTES, STARTERS } from './data';
import {
  GRID_SIZE, HISTORY_LIMIT, PixelEditor, emptyGrid, isColor, mirroredCells, rasterize,
} from './engine';
import type { Change, Pixel, Point, Symmetry, Transform } from './engine';

type Tool = 'paint' | 'erase' | 'fill' | 'pick';
type DrawingTool = Exclude<Tool, 'pick'>;
interface Stroke {
  tool: DrawingTool;
  color: Pixel;
  symmetry: Symmetry;
  last: Point;
}
interface PointerStroke extends Stroke { pointerId: number }
interface KeyboardStroke extends Stroke { key: string }

class PngExportError extends Error {}

const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const TOOLS: { id: Tool; name: string; shortcut: string; icon: string }[] = [
  { id: 'paint', name: 'Paint', shortcut: 'B', icon: icon('<path d="m4 15-1 6 6-1L21 8l-5-5L4 15Zm9-9 5 5M4 15l5 5"/>') },
  { id: 'erase', name: 'Erase', shortcut: 'E', icon: icon('<path d="m3 13 9-10 9 8-8 10H9l-6-8Zm5-5 9 8M13 21h8"/>') },
  { id: 'fill', name: 'Fill', shortcut: 'F', icon: icon('<path d="m3 11 8-8 9 9-8 8-9-9Zm3 3h12M7 2l5 6M20 17s-2 3-2 4a2 2 0 0 0 4 0c0-1-2-4-2-4Z"/>') },
  { id: 'pick', name: 'Pick', shortcut: 'I', icon: icon('<path d="m14 3 7 7M16 5 5 16l-2 5 5-2L19 8M6 15l3 3M12 5l7 7"/>') },
];

const toolLabels: Record<DrawingTool, string> = {
  paint: 'Paint stroke', erase: 'Erase stroke', fill: 'Flood fill',
};

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'pixel-loom');
  const { root, signal } = page;
  root.dataset.workspace = 'true';
  root.innerHTML = `
    <div class="pl-shell">
      <header class="pl-masthead">
        <div class="pl-brandline">
          <span class="pl-brandmark" aria-hidden="true"><svg viewBox="0 0 40 40">
            <path fill="#24473b" d="M0 10h10V0h10v10h10v10H20v10H10V20H0z"/>
            <path fill="#d97d77" d="M20 20h10V10h10v20H30v10H20z"/>
            <path fill="#e9bd73" d="M0 30h10v10H0z"/>
          </svg></span>
          <span class="pl-eyebrow">Your pocket-sized art studio</span>
          <span class="pl-browser-note">Made here. Kept by you.</span>
        </div>
        <div class="pl-heading-line">
          <h1>Pixel <em>Loom</em><span class="pl-title-stitch" aria-hidden="true">✳</span></h1>
          <p>Paint a tiny treasure. 16 × 16 pixels.</p>
        </div>
      </header>

      <div class="pl-workbench" data-project-preview>
        <section class="pl-editor" aria-label="Pixel-art drawing editor">
          <div class="pl-toolbar" role="group" aria-label="Drawing tools">
            ${TOOLS.map((item) => `<button type="button" class="pl-tool" data-tool="${item.id}" data-idle
              aria-label="${item.name} (${item.shortcut})" aria-keyshortcuts="${item.shortcut}"
              aria-pressed="${item.id === 'paint'}" title="${item.name} · ${item.shortcut}">
              ${item.icon}<span>${item.name}</span><kbd>${item.shortcut}</kbd>
            </button>`).join('')}
          </div>
          <div class="pl-stage-wrap">
            <div class="pl-stage">
              <canvas class="pl-canvas" data-canvas width="512" height="512" tabindex="0"
                role="application" aria-label="Pixel drawing canvas"
                aria-describedby="pl-drawing-help pl-cursor-readout">
                This editor needs canvas support. Use the arrow keys and Space to draw.
              </canvas>
            </div>
            <span class="pl-mat-label" aria-hidden="true">a little work in progress</span>
          </div>
          <div class="pl-quick-palette">
            <span>Threads <span aria-hidden="true">→</span></span>
            <div class="pl-quick-threads" data-quick-threads role="group"
              aria-label="Quick thread colors; scroll for more colors"></div>
          </div>
          <div class="pl-canvas-meta">
            <output id="pl-cursor-readout" data-cursor aria-live="off">Row 8 · Col 8</output>
            <label class="pl-check"><input type="checkbox" data-grid checked> Pixel grid</label>
          </div>
          <div class="pl-history">
            <div class="pl-history-buttons">
              <button type="button" data-action="undo" data-undo aria-keyshortcuts="Control+Z Meta+Z">
                <span aria-hidden="true">↶</span> Undo
              </button>
              <button type="button" data-action="redo" data-redo aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
                <span aria-hidden="true">↷</span> Redo
              </button>
            </div>
            <output class="pl-stats" data-stats aria-live="off"></output>
          </div>
          <div class="pl-transform-row" role="group" aria-label="Transform the whole artwork">
            <button type="button" data-transform="mirror-x" data-idle aria-label="Flip artwork left to right"
              title="Flip the entire artwork left to right"><span aria-hidden="true">↔</span> Flip H</button>
            <button type="button" data-transform="mirror-y" data-idle aria-label="Flip artwork top to bottom"
              title="Flip the entire artwork top to bottom"><span aria-hidden="true">↕</span> Flip V</button>
            <button type="button" data-transform="rotate-right" data-idle aria-label="Rotate artwork 90 degrees clockwise"
              title="Rotate the entire artwork 90° clockwise"><span aria-hidden="true">↻</span> Rotate</button>
            <button type="button" class="pl-clear-button" data-action="ask-clear" data-clear data-idle
              aria-expanded="false" aria-controls="pl-clear-confirmation">Clear canvas</button>
          </div>
          <div id="pl-clear-confirmation" class="pl-clear-confirmation" data-confirm hidden
            role="group" aria-label="Confirm clear canvas">
            <p><strong>Start with empty cloth?</strong> Your current artwork will be kept in Undo.</p>
            <div>
              <button type="button" data-action="confirm-clear" data-idle>Clear · keep in Undo</button>
              <button type="button" data-action="cancel-clear">Keep drawing</button>
            </div>
          </div>
          <p class="pl-status" data-status role="status" aria-live="polite" aria-atomic="true"></p>
          <details class="pl-keyboard-guide">
            <summary>Little shortcuts <span aria-hidden="true">⌨</span></summary>
            <div id="pl-drawing-help">
              <p><strong>Mouse or touch:</strong> choose a thread color, then drag on the canvas.
                A whole stroke is one Undo. Fill changes a connected region; Pick samples a pixel.</p>
              <p><strong>Keyboard:</strong> focus the canvas. Arrow keys move the pixel cursor;
                <kbd>Space</kbd> or <kbd>Enter</kbd> applies the tool. Hold Space and use the arrows
                for one continuous paint or erase stroke. <kbd>Home</kbd> / <kbd>End</kbd> jump to the corners.</p>
              <p><kbd>B</kbd> Paint · <kbd>E</kbd> Erase · <kbd>F</kbd> Fill · <kbd>I</kbd> Pick.
                <kbd>Ctrl/⌘ Z</kbd> undoes; add <kbd>Shift</kbd> to redo.
                <kbd>Esc</kbd> cancels an unfinished stroke. Leaving the window also cancels it.</p>
            </div>
          </details>
          <p class="pl-canvas-tip">Tip: you can also draw with <kbd>← ↑ ↓ →</kbd> + <kbd>Space</kbd>.</p>
        </section>

        <aside class="pl-sidebar" aria-label="Colors and finishing">
          <section class="pl-thread-box" aria-labelledby="pl-thread-title">
            <p class="pl-eyebrow">02 / Choose your threads</p>
            <h2 id="pl-thread-title">The thread box</h2>
            <div class="pl-field">
              <label for="pl-palette">Color palette</label>
              <select id="pl-palette" data-palette data-idle>
                ${PALETTES.map((palette) => `<option value="${palette.id}">${escapeMarkup(palette.name)}</option>`).join('')}
              </select>
            </div>
            <div class="pl-swatches" data-swatches role="group" aria-label="Thread colors"></div>
            <div class="pl-current-thread">
              <span class="pl-ink-dot" data-ink-dot aria-hidden="true"></span>
              <div><strong data-color-name>Forest</strong><code data-color-hex>#24473b</code></div>
              <label class="pl-custom-color">Custom
                <input type="color" data-custom-color data-idle value="#24473b" aria-label="Custom thread color">
              </label>
            </div>
            <div class="pl-field pl-symmetry-field">
              <label for="pl-symmetry">Mirror as you draw</label>
              <select id="pl-symmetry" data-symmetry data-idle>
                <option value="none">Off · freehand</option>
                <option value="left-right">Left ↔ right</option>
                <option value="top-bottom">Top ↕ bottom</option>
                <option value="both">Four-way mirror</option>
              </select>
            </div>
            <p class="pl-field-note">Mirrors paint, erase, and fill. Changing palettes leaves your artwork untouched.</p>
          </section>

          <section class="pl-finishing" aria-labelledby="pl-finishing-title">
            <p class="pl-eyebrow">03 / A little something to keep</p>
            <h2 id="pl-finishing-title">Small looks good.</h2>
            <div class="pl-preview-toolbar">
              <span>Live preview</span>
              <div class="pl-segmented" role="group" aria-label="Enlarged preview mode">
                <button type="button" data-preview="single" aria-pressed="true">Single</button>
                <button type="button" data-preview="repeat" aria-pressed="false">Repeat</button>
              </div>
            </div>
            <div class="pl-previews">
              <figure>
                <div class="pl-preview-cell pl-checker"><canvas data-actual width="16" height="16"
                  role="img" aria-label="Live artwork at its actual size of 16 by 16 pixels"></canvas></div>
                <figcaption>1× actual size</figcaption>
              </figure>
              <figure>
                <div class="pl-preview-cell pl-checker"><canvas data-preview-canvas width="96" height="96"
                  role="img" aria-label="Live artwork enlarged six times"></canvas></div>
                <figcaption data-preview-label>6× enlarged</figcaption>
              </figure>
            </div>
            <div class="pl-export-fields">
              <div class="pl-field">
                <label for="pl-export-size">PNG size</label>
                <select id="pl-export-size" data-export-size data-idle>
                  ${EXPORT_SIZES.map((size) => `<option value="${size.scale}"${size.scale === 16 ? ' selected' : ''}>${size.label}</option>`).join('')}
                </select>
              </div>
              <div class="pl-field">
                <label for="pl-export-background">Export background</label>
                <select id="pl-export-background" data-background data-idle>
                  ${BACKGROUNDS.map((background) => `<option value="${background.id}">${background.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <button type="button" class="pl-download" data-action="export" data-export>
              <span data-export-text>Download PNG</span><span aria-hidden="true">↓</span>
            </button>
            <p class="pl-export-note" data-export-note>256 × 256 · transparent background</p>
            <p class="pl-field-note">Crisp whole-pixel scaling. No grid, no watermark.
              Checkerboard means transparent; previews follow the export background.</p>
          </section>
        </aside>
      </div>

      <section class="pl-starters" aria-labelledby="pl-starters-title">
        <header>
          <div><p class="pl-eyebrow">A few loose threads to follow</p><h2 id="pl-starters-title">Start with a little story.</h2></div>
          <p>Original patterns, ready to make your own.<br>Loading replaces the canvas. <strong>Undo brings it back.</strong></p>
        </header>
        <div class="pl-starter-list">
          ${STARTERS.map((starter) => `<button type="button" class="pl-starter" data-starter="${starter.id}" data-idle
            aria-label="Load ${escapeMarkup(starter.name)} starter">
            <span class="pl-starter-art pl-checker"><canvas data-starter-art="${starter.id}" width="16" height="16" aria-hidden="true"></canvas></span>
            <span class="pl-starter-copy"><strong>${escapeMarkup(starter.name)}</strong>
              <span>${escapeMarkup(starter.description)}</span><span class="pl-load-label">Load pattern <span aria-hidden="true">↗</span></span>
            </span>
          </button>`).join('')}
        </div>
      </section>
      <footer class="pl-footer">
        <span><span aria-hidden="true">✳</span> Made slowly. Pixel by pixel.</span>
        <p>Session only, no autosave. Download before leaving. Undo keeps your last ${HISTORY_LIMIT} changes.</p>
      </footer>
    </div>`;

  const take = (selector: string) => query<HTMLElement>(root, selector);
  const button = (label: string) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    return control;
  };
  const threadsButton = button('Threads');
  const finishButton = button('Finish');
  const patternsButton = button('Patterns');
  const helpButton = button('Help');
  const zoomButton = button('Zoom 2×');
  zoomButton.setAttribute('aria-pressed', 'false');
  const nav = document.createElement('nav');
  nav.className = 'pl-workspace-nav';
  nav.setAttribute('aria-label', 'Studio panes');
  nav.append(threadsButton, finishButton, patternsButton, helpButton);
  const masthead = take('.pl-masthead');
  const helpDialog = createWorkspaceDialog(page, {
    id: 'pl-help', title: 'Little shortcuts & studio notes', triggers: [helpButton],
    content: [take('.pl-brandline'), take('.pl-heading-line > p'), take('.pl-keyboard-guide'),
      take('.pl-canvas-tip'), take('.pl-finishing > .pl-eyebrow'), take('.pl-finishing > h2'),
      take('.pl-finishing > .pl-field-note'), take('.pl-thread-box > .pl-eyebrow'),
      take('.pl-thread-box > h2'), take('.pl-thread-box > .pl-field-note'), take('.pl-footer')],
  });
  query<HTMLDetailsElement>(helpDialog.dialog, 'details').open = true;
  masthead.replaceChildren(take('h1'));
  masthead.after(nav);
  createWorkspaceDialog(page, {
    id: 'pl-threads', title: 'Threads & drawing options', triggers: [threadsButton],
    content: [take('.pl-thread-box'), take('.pl-canvas-meta'), take('[data-stats]')],
  });
  createWorkspaceDialog(page, {
    id: 'pl-finish', title: 'Preview, transform & export', triggers: [finishButton],
    content: [take('.pl-finishing'), take('.pl-transform-row')],
  });
  const patternsDialog = createWorkspaceDialog(page, {
    id: 'pl-patterns', title: 'Original starter patterns', triggers: [patternsButton], content: [take('.pl-starters')],
  });
  take('.pl-history-buttons').append(zoomButton, take('[data-clear]'));
  take('.pl-sidebar').remove();
  take('.pl-shell').append(take('[data-status]'));
  const confirmDialog = createWorkspaceDialog(page, {
    id: 'pl-clear-dialog', title: 'Clear canvas?', content: [take('[data-confirm]')],
  });
  take('[data-clear]').setAttribute('aria-haspopup', 'dialog');
  take('[data-clear]').setAttribute('aria-controls', confirmDialog.dialog.id);
  const errorMessage = document.createElement('p');
  errorMessage.setAttribute('role', 'alert');
  const errorDialog = createWorkspaceDialog(page, {
    id: 'pl-error', title: 'Studio message', content: [errorMessage],
  });
  const feedback = document.createElement('p');
  feedback.className = 'pl-dialog-status';
  feedback.setAttribute('role', 'status');
  const canvas = query<HTMLCanvasElement>(root, '[data-canvas]');
  const actual = query<HTMLCanvasElement>(root, '[data-actual]');
  const preview = query<HTMLCanvasElement>(root, '[data-preview-canvas]');
  const status = query<HTMLElement>(root, '[data-status]');
  const swatches = query<HTMLElement>(root, '[data-swatches]');
  const quickThreads = query<HTMLElement>(root, '[data-quick-threads]');
  const paletteInput = query<HTMLSelectElement>(root, '[data-palette]');
  const symmetryInput = query<HTMLSelectElement>(root, '[data-symmetry]');
  const customInput = query<HTMLInputElement>(root, '[data-custom-color]');
  const gridInput = query<HTMLInputElement>(root, '[data-grid]');
  const exportSize = query<HTMLSelectElement>(root, '[data-export-size]');
  const backgroundInput = query<HTMLSelectElement>(root, '[data-background]');
  const exportButton = query<HTMLButtonElement>(root, '[data-export]');
  const exportText = query<HTMLElement>(root, '[data-export-text]');
  const undoButton = query<HTMLButtonElement>(root, '[data-undo]');
  const redoButton = query<HTMLButtonElement>(root, '[data-redo]');
  const clearButton = query<HTMLButtonElement>(root, '[data-clear]');
  const confirmation = query<HTMLElement>(root, '[data-confirm]');
  const stats = query<HTMLElement>(root, '[data-stats]');
  const cursorReadout = query<HTMLElement>(root, '[data-cursor]');
  const inkDot = query<HTMLElement>(root, '[data-ink-dot]');
  const colorName = query<HTMLElement>(root, '[data-color-name]');
  const colorHex = query<HTMLElement>(root, '[data-color-hex]');
  const previewLabel = query<HTMLElement>(root, '[data-preview-label]');
  const exportNote = query<HTMLElement>(root, '[data-export-note]');
  const artCanvas = document.createElement('canvas');
  artCanvas.width = GRID_SIZE;
  artCanvas.height = GRID_SIZE;
  const stageContext = canvas.getContext('2d');
  const artContext = artCanvas.getContext('2d');
  const actualContext = actual.getContext('2d');
  const previewContext = preview.getContext('2d');

  function say(message: string, error = false) {
    if (signal.aborted) return;
    status.textContent = message;
    status.dataset.tone = error ? 'error' : 'normal';
    if (error) {
      errorMessage.textContent = message;
      errorDialog.open();
    } else {
      feedback.textContent = message;
      const openDialog = root.querySelector('dialog[open] .workspace-dialog-content');
      if (openDialog) {
        openDialog.parentElement!.append(feedback);
      }
    }
  }

  if (!stageContext || !artContext || !actualContext || !previewContext) {
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[data-idle], [data-undo], [data-redo], [data-export]')
      .forEach((control) => { control.disabled = true; });
    say('This browser could not open a drawing canvas. Try a browser with 2D canvas support.', true);
    return { destroy: page.destroy };
  }

  const stage = stageContext;
  const native = artContext;
  const actualPreview = actualContext;
  const enlargedPreview = previewContext;
  const editor = new PixelEditor(STARTERS[0].pixels);
  let palette = PALETTES[0];
  let color = palette.colors[0].color;
  let tool: Tool = 'paint';
  let symmetry: Symmetry = 'none';
  let cursor: Point = { x: 7, y: 7 };
  let hovering = false;
  let focused = false;
  let repeated = false;
  let exporting = false;
  let pointerStroke: PointerStroke | null = null;
  let keyboardStroke: KeyboardStroke | null = null;

  function nameForColor(value: string): string {
    return PALETTES.flatMap((entry) => entry.colors).find((entry) => entry.color === value)?.name ?? 'Custom thread';
  }

  function exportBackground() {
    return BACKGROUNDS.find((entry) => entry.id === backgroundInput.value) ?? BACKGROUNDS[0];
  }

  function drawPixels(target: CanvasRenderingContext2D, pixels: readonly Pixel[]) {
    const raster = rasterize(pixels);
    const image = target.createImageData(raster.width, raster.height);
    image.data.set(raster.data);
    target.putImageData(image, 0, 0);
  }

  function renderPalette() {
    paletteInput.value = palette.id;
    swatches.innerHTML = palette.colors.map((entry) => `<button type="button" class="pl-swatch"
      data-color="${entry.color}" data-idle style="--thread:${entry.color}"
      aria-label="${escapeMarkup(entry.name)} ${entry.color}" title="${escapeMarkup(entry.name)} · ${entry.color}"
      aria-pressed="${entry.color === color}"><span aria-hidden="true"></span></button>`).join('');
    quickThreads.innerHTML = swatches.innerHTML;
  }

  function renderStage() {
    const cell = canvas.width / GRID_SIZE;
    stage.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        stage.fillStyle = (x + y) % 2 === 0 ? '#f9f5e9' : '#eee7d7';
        stage.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    stage.imageSmoothingEnabled = false;
    stage.drawImage(artCanvas, 0, 0, canvas.width, canvas.height);
    if (gridInput.checked) {
      stage.beginPath();
      for (let index = 1; index < GRID_SIZE; index += 1) {
        stage.moveTo(index * cell + 0.5, 0);
        stage.lineTo(index * cell + 0.5, canvas.height);
        stage.moveTo(0, index * cell + 0.5);
        stage.lineTo(canvas.width, index * cell + 0.5);
      }
      stage.strokeStyle = '#24473b25';
      stage.lineWidth = 1;
      stage.stroke();
    }
    if (symmetry !== 'none') {
      stage.save();
      stage.beginPath();
      if (symmetry === 'left-right' || symmetry === 'both') {
        stage.moveTo(canvas.width / 2, 0);
        stage.lineTo(canvas.width / 2, canvas.height);
      }
      if (symmetry === 'top-bottom' || symmetry === 'both') {
        stage.moveTo(0, canvas.height / 2);
        stage.lineTo(canvas.width, canvas.height / 2);
      }
      stage.strokeStyle = '#fff6df';
      stage.lineWidth = 4;
      stage.stroke();
      stage.setLineDash([8, 8]);
      stage.strokeStyle = '#a5354b';
      stage.lineWidth = 2;
      stage.stroke();
      stage.restore();
    }
    if (hovering || focused || editor.isEditing) {
      for (const point of mirroredCells(cursor, tool === 'pick' ? 'none' : symmetry)) {
        stage.strokeStyle = '#ffffff';
        stage.lineWidth = 4;
        stage.strokeRect(point.x * cell + 2, point.y * cell + 2, cell - 4, cell - 4);
        stage.strokeStyle = '#24473b';
        stage.lineWidth = 2;
        stage.strokeRect(point.x * cell + 3, point.y * cell + 3, cell - 6, cell - 6);
      }
    }
    const pixel = editor.pixels[cursor.y * GRID_SIZE + cursor.x];
    cursorReadout.textContent = `Row ${cursor.y + 1} · Col ${cursor.x + 1}`;
    canvas.setAttribute('aria-label',
      `Pixel drawing canvas, row ${cursor.y + 1}, column ${cursor.x + 1}, ${pixel ?? 'transparent'}`);
  }

  function renderPreviews() {
    const background = exportBackground();
    for (const target of [actualPreview, enlargedPreview]) {
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      target.imageSmoothingEnabled = false;
      if (background.color !== null) {
        target.fillStyle = background.color;
        target.fillRect(0, 0, target.canvas.width, target.canvas.height);
      }
    }
    actualPreview.drawImage(artCanvas, 0, 0);
    if (repeated) {
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 3; x += 1) {
          enlargedPreview.drawImage(artCanvas, x * 32, y * 32, 32, 32);
        }
      }
    } else {
      enlargedPreview.drawImage(artCanvas, 0, 0, 96, 96);
    }
    previewLabel.textContent = repeated ? '3 × 3 repeat · 2×' : '6× enlarged';
    preview.setAttribute('aria-label', repeated
      ? 'Live artwork repeated in a three by three tile, enlarged two times'
      : 'Live artwork enlarged six times');
    root.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.preview === 'repeat') === repeated));
    });
    const size = EXPORT_SIZES.find((entry) => entry.scale === Number(exportSize.value)) ?? EXPORT_SIZES[3];
    exportNote.textContent = `${size.scale * GRID_SIZE} × ${size.scale * GRID_SIZE} · ${background.name.toLowerCase()} background`;
  }

  function renderControls() {
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[data-idle]')
      .forEach((control) => { control.disabled = editor.isEditing; });
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.color === color));
    });
    const painted = editor.pixels.filter((pixel) => pixel !== null).length;
    const colors = new Set(editor.pixels.filter((pixel) => pixel !== null)).size;
    stats.textContent = `${painted} / 256 painted · ${colors} ${colors === 1 ? 'color' : 'colors'}`;
    undoButton.disabled = !editor.canUndo;
    redoButton.disabled = !editor.canRedo;
    undoButton.title = editor.undoLabel ? `Undo ${editor.undoLabel.toLowerCase()} · Ctrl/⌘ Z` : 'Nothing to undo yet';
    redoButton.title = editor.redoLabel ? `Redo ${editor.redoLabel.toLowerCase()} · Ctrl/⌘ Shift Z` : 'Nothing to redo';
    clearButton.disabled = editor.isEditing || painted === 0;
    exportButton.disabled = editor.isEditing || exporting;
    exportText.textContent = exporting ? 'Preparing PNG…' : 'Download PNG';
    inkDot.style.backgroundColor = color;
    colorName.textContent = nameForColor(color);
    colorHex.textContent = color;
    customInput.value = color;
    canvas.dataset.tool = tool;
  }

  function render() {
    drawPixels(native, editor.pixels);
    renderStage();
    renderPreviews();
    renderControls();
  }

  function changed(change: Change | null, message?: string) {
    render();
    say(change
      ? `${message ?? change.label} · ${change.count} ${change.count === 1 ? 'pixel' : 'pixels'} changed. Undo brings it back.`
      : 'No pixels changed. Your undo history is untouched.');
  }

  function closeConfirmation(returnFocus = false) {
    confirmation.hidden = true;
    confirmDialog.close();
    clearButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) clearButton.focus({ preventScroll: true });
  }

  function setColor(next: string, announce = true) {
    if (editor.isEditing) return;
    if (!isColor(next)) { say('Choose a valid six-digit thread color.', true); return; }
    color = next.toLowerCase();
    if (tool !== 'fill') tool = 'paint';
    renderControls();
    renderStage();
    if (announce) say(`${nameForColor(color)} ${color} selected. ${tool === 'fill' ? 'Fill' : 'Paint'} is ready.`);
  }

  function pick(point: Point) {
    const sampled = editor.pixels[point.y * GRID_SIZE + point.x];
    if (sampled === null) {
      tool = 'erase';
      renderControls();
      say('That pixel is transparent. Erase is now selected.');
    } else {
      tool = 'paint';
      setColor(sampled, false);
      say(`Picked ${nameForColor(sampled)} ${sampled}. Paint is now selected.`);
    }
    renderStage();
  }

  function position(event: PointerEvent): Point {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor((event.clientX - bounds.left) / bounds.width * GRID_SIZE), 0, GRID_SIZE - 1),
      y: clamp(Math.floor((event.clientY - bounds.top) / bounds.height * GRID_SIZE), 0, GRID_SIZE - 1),
    };
  }

  function makeStroke(nextTool: DrawingTool): Stroke {
    return { tool: nextTool, color: nextTool === 'erase' ? null : color, symmetry, last: { ...cursor } };
  }

  function applyStroke(stroke: Stroke, point: Point, first = false) {
    if (stroke.tool === 'fill') {
      if (first) editor.fill(point, stroke.color, stroke.symmetry);
    } else {
      editor.paint(stroke.last, point, stroke.color, stroke.symmetry);
    }
    stroke.last = point;
    cursor = point;
  }

  function releasePointer(pointerId: number) {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  }

  function cancelStroke(announce = true) {
    const pointer = pointerStroke;
    pointerStroke = null;
    keyboardStroke = null;
    const canceled = editor.cancel();
    if (pointer) releasePointer(pointer.pointerId);
    if (canceled && !signal.aborted) {
      render();
      if (announce) say('Stroke canceled. Your artwork is back to how it was before this stroke.');
    }
  }

  function finishKeyboard() {
    if (!keyboardStroke) return;
    keyboardStroke = null;
    changed(editor.commit());
    revealCursor();
  }

  function revealCursor() {
    if (!root.classList.contains('pl-zoomed')) return;
    const viewport = take('.pl-stage-wrap');
    if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;
    const clip = viewport.getBoundingClientRect(), surface = canvas.getBoundingClientRect();
    const left = clip.left + viewport.clientLeft + 2;
    const top = clip.top + viewport.clientTop + 2;
    const right = clip.left + viewport.clientLeft + viewport.clientWidth - 2;
    const bottom = clip.top + viewport.clientTop + viewport.clientHeight - 2;
    const cellLeft = surface.left + cursor.x * surface.width / GRID_SIZE;
    const cellRight = surface.left + (cursor.x + 1) * surface.width / GRID_SIZE;
    const cellTop = surface.top + cursor.y * surface.height / GRID_SIZE;
    const cellBottom = surface.top + (cursor.y + 1) * surface.height / GRID_SIZE;
    viewport.scrollBy({
      left: cellLeft < left ? cellLeft - left : cellRight > right ? cellRight - right : 0,
      top: cellTop < top ? cellTop - top : cellBottom > bottom ? cellBottom - bottom : 0,
      behavior: 'instant',
    });
  }

  function history(action: 'undo' | 'redo') {
    if (editor.isEditing) return;
    closeConfirmation();
    const label = editor[action]();
    render();
    say(label
      ? `${action === 'undo' ? 'Undid' : 'Redid'} ${label.toLowerCase()}. ${action === 'undo' ? 'Redo' : 'Undo'} brings it back.`
      : `There is nothing to ${action} yet.`);
  }

  async function exportPng() {
    if (exporting || editor.isEditing) return;
    const size = EXPORT_SIZES.find((entry) => entry.scale === Number(exportSize.value));
    const background = BACKGROUNDS.find((entry) => entry.id === backgroundInput.value);
    if (!size || !background) { say('Choose one of the listed PNG sizes and backgrounds.', true); return; }
    exporting = true;
    renderControls();
    say('Preparing your little patch as a PNG…');
    try {
      const raster = rasterize(editor.pixels, size.scale, background.color);
      const output = document.createElement('canvas');
      output.width = raster.width;
      output.height = raster.height;
      const outputContext = output.getContext('2d');
      if (!outputContext) throw new PngExportError('The browser could not create an export canvas.');
      const image = outputContext.createImageData(raster.width, raster.height);
      image.data.set(raster.data);
      outputContext.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
      if (signal.aborted) return;
      if (!blob) throw new PngExportError('The browser could not encode this PNG. Try again.');
      downloadBlob(`pixel-loom-${raster.width}.png`, blob);
      say(`PNG ready: ${raster.width} × ${raster.height}, ${background.name.toLowerCase()} background. Check your downloads.`);
    } catch (error) {
      if (!(error instanceof PngExportError) && !(error instanceof DOMException)) throw error;
      say(`${error.message} Your artwork is still here.`, true);
    } finally {
      exporting = false;
      if (!signal.aborted) renderControls();
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !root.contains(button) || button.disabled) return;
    const selectedTool = TOOLS.find((entry) => entry.id === button.dataset.tool);
    if (selectedTool && !editor.isEditing) {
      tool = selectedTool.id;
      renderControls();
      renderStage();
      say(`${selectedTool.name} selected. ${tool === 'pick' ? 'Choose a pixel to sample its color.' : 'Draw on the canvas, or use arrows and Space.'}`);
      return;
    }
    if (button.dataset.color) { setColor(button.dataset.color); return; }
    if (button.dataset.preview) {
      repeated = button.dataset.preview === 'repeat';
      renderPreviews();
      say(repeated ? 'Repeat preview shows your artwork tiled three by three.' : 'Single preview shows your artwork enlarged six times.');
      return;
    }
    const starter = STARTERS.find((entry) => entry.id === button.dataset.starter);
    if (starter && !editor.isEditing) {
      closeConfirmation();
      palette = PALETTES.find((entry) => entry.id === starter.palette) ?? PALETTES[0];
      color = palette.colors[0].color;
      tool = 'paint';
      renderPalette();
      changed(editor.replace(starter.pixels, `Load ${starter.name}`), `Loaded ${starter.name}`);
      patternsDialog.close();
      return;
    }
    const transforms: { id: Transform; label: string }[] = [
      { id: 'mirror-x', label: 'Flip left to right' },
      { id: 'mirror-y', label: 'Flip top to bottom' },
      { id: 'rotate-right', label: 'Rotate 90° clockwise' },
    ];
    const transform = transforms.find((entry) => entry.id === button.dataset.transform);
    if (transform && !editor.isEditing) {
      closeConfirmation();
      changed(editor.transform(transform.id, transform.label));
      return;
    }
    switch (button.dataset.action) {
      case 'undo': history('undo'); break;
      case 'redo': history('redo'); break;
      case 'ask-clear':
        confirmation.hidden = false;
        clearButton.setAttribute('aria-expanded', 'true');
        confirmDialog.open();
        query<HTMLButtonElement>(confirmation, '[data-action="confirm-clear"]').focus({ preventScroll: true });
        break;
      case 'cancel-clear': closeConfirmation(true); break;
      case 'confirm-clear':
        closeConfirmation();
        changed(editor.replace(emptyGrid(), 'Clear canvas'), 'Canvas cleared');
        canvas.focus({ preventScroll: true });
        break;
      case 'export': void exportPng(); break;
    }
  }, { signal });

  zoomButton.addEventListener('click', () => {
    cancelStroke();
    const zoomed = zoomButton.getAttribute('aria-pressed') !== 'true';
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.textContent = zoomed ? 'Fit canvas' : 'Zoom 2×';
    root.classList.toggle('pl-zoomed', zoomed);
    take('.pl-stage-wrap').scrollTo(0, 0);
    say(zoomed ? 'Zoomed drawing: use the pan arrows to reach every pixel. Fit canvas restores the whole artwork.' : 'The whole canvas fits the loom.');
    if (zoomed) revealCursor();
  }, { signal });
  const pan = document.createElement('div');
  pan.className = 'pl-pan';
  pan.setAttribute('role', 'group');
  pan.setAttribute('aria-label', 'Pan zoomed canvas');
  for (const [label, dx, dy] of [['←', -160, 0], ['↑', 0, -160], ['↓', 0, 160], ['→', 160, 0]] as const) {
    const control = button(label);
    control.setAttribute('aria-label', `Pan canvas ${dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'}`);
    control.addEventListener('click', () => take('.pl-stage-wrap').scrollBy(dx, dy), { signal });
    pan.append(control);
  }
  take('.pl-toolbar').after(pan);
  confirmDialog.dialog.addEventListener('close', () => {
    confirmation.hidden = true;
    clearButton.setAttribute('aria-expanded', 'false');
  }, { signal });
  window.addEventListener('resize', () => cancelStroke(), { signal });

  paletteInput.addEventListener('change', () => {
    const selected = PALETTES.find((entry) => entry.id === paletteInput.value);
    if (!selected || editor.isEditing) return;
    palette = selected;
    renderPalette();
    renderControls();
    say(`${palette.name} threads are ready. Your artwork and selected color are unchanged.`);
  }, { signal });
  customInput.addEventListener('input', () => setColor(customInput.value, false), { signal });
  customInput.addEventListener('change', () => setColor(customInput.value), { signal });
  symmetryInput.addEventListener('change', () => {
    const choices: Symmetry[] = ['none', 'left-right', 'top-bottom', 'both'];
    const selected = choices.find((entry) => entry === symmetryInput.value);
    if (!selected || editor.isEditing) return;
    symmetry = selected;
    renderStage();
    say(symmetry === 'none' ? 'Mirror drawing is off.'
      : `${symmetryInput.selectedOptions[0].textContent} is on. The pink guide marks the mirror axis; it is not exported.`);
  }, { signal });
  gridInput.addEventListener('change', () => {
    renderStage();
    say(`Pixel grid ${gridInput.checked ? 'shown' : 'hidden'}. The grid never appears in your PNG.`);
  }, { signal });
  exportSize.addEventListener('change', () => {
    renderPreviews();
    say(`Export set to ${exportNote.textContent}.`);
  }, { signal });
  backgroundInput.addEventListener('change', () => {
    renderPreviews();
    say(`${exportBackground().name} export background selected. Live previews have been updated.`);
  }, { signal });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || editor.isEditing) return;
    event.preventDefault();
    closeConfirmation();
    canvas.focus({ preventScroll: true });
    cursor = position(event);
    if (tool === 'pick') { pick(cursor); return; }
    if (!editor.begin(toolLabels[tool])) return;
    pointerStroke = { ...makeStroke(tool), pointerId: event.pointerId };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      cancelStroke(false);
      say('The browser could not capture this stroke. Try again, or use the arrow keys and Space.', true);
      return;
    }
    applyStroke(pointerStroke, cursor, true);
    render();
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerStroke) {
      if (event.pointerId !== pointerStroke.pointerId) return;
      event.preventDefault();
      const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      for (const sample of [...samples, event]) applyStroke(pointerStroke, position(sample));
      render();
    } else if (event.pointerType !== 'touch' && !keyboardStroke) {
      hovering = true;
      cursor = position(event);
      renderStage();
    }
  }, { signal });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStroke || pointerStroke.pointerId !== event.pointerId) return;
    applyStroke(pointerStroke, position(event));
    const pointerId = pointerStroke.pointerId;
    pointerStroke = null;
    releasePointer(pointerId);
    changed(editor.commit());
  }, { signal });
  canvas.addEventListener('pointercancel', (event) => {
    if (pointerStroke?.pointerId === event.pointerId) cancelStroke();
  }, { signal });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (pointerStroke?.pointerId === event.pointerId) cancelStroke();
  }, { signal });
  canvas.addEventListener('pointerleave', () => {
    hovering = false;
    if (!pointerStroke) renderStage();
  }, { signal });
  canvas.addEventListener('focus', () => { focused = true; renderStage(); }, { signal });
  canvas.addEventListener('blur', () => {
    focused = false;
    if (keyboardStroke) cancelStroke();
    renderStage();
  }, { signal });

  canvas.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const drawingKey = event.key === ' ' || event.key === 'Enter';
    if (drawingKey) {
      event.preventDefault();
      if (event.repeat || editor.isEditing) return;
      revealCursor();
      closeConfirmation();
      if (tool === 'pick') { pick(cursor); return; }
      editor.begin(toolLabels[tool]);
      keyboardStroke = { ...makeStroke(tool), key: event.key };
      applyStroke(keyboardStroke, cursor, true);
      render();
      return;
    }
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if (pointerStroke) return;
    const next = direction
      ? { x: clamp(cursor.x + direction.x, 0, 15), y: clamp(cursor.y + direction.y, 0, 15) }
      : event.key === 'Home' ? { x: 0, y: 0 } : { x: 15, y: 15 };
    if (keyboardStroke) {
      applyStroke(keyboardStroke, next);
      render();
    } else {
      cursor = next;
      renderStage();
      const pixel = editor.pixels[cursor.y * GRID_SIZE + cursor.x];
      say(`Row ${cursor.y + 1}, column ${cursor.x + 1}: ${pixel ? `${nameForColor(pixel)} ${pixel}` : 'transparent'}. Space applies ${tool}.`);
    }
    revealCursor();
  }, { signal });
  window.addEventListener('keyup', (event) => {
    if (keyboardStroke?.key === event.key) {
      event.preventDefault();
      finishKeyboard();
    }
  }, { signal });
  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
    if (event.key === 'Escape') {
      if (editor.isEditing) { event.preventDefault(); cancelStroke(); }
      else if (!confirmation.hidden) { event.preventDefault(); closeConfirmation(true); }
      return;
    }
    if (target instanceof Element && target.closest('dialog')) return;
    if (event.defaultPrevented || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      if (pointerStroke) return;
      finishKeyboard();
      history(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (event.ctrlKey || event.metaKey || editor.isEditing) return;
    const selected = TOOLS.find((entry) => entry.shortcut.toLowerCase() === event.key.toLowerCase());
    if (selected) {
      event.preventDefault();
      tool = selected.id;
      renderControls();
      renderStage();
      say(`${selected.name} selected.`);
    }
  }, { signal });
  window.addEventListener('blur', () => cancelStroke(), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelStroke();
  }, { signal });
  page.onCleanup(() => {
    const pointer = pointerStroke;
    pointerStroke = null;
    keyboardStroke = null;
    editor.cancel();
    if (pointer) releasePointer(pointer.pointerId);
  });

  renderPalette();
  for (const starter of STARTERS) {
    const thumbnail = query<HTMLCanvasElement>(root, `[data-starter-art="${starter.id}"]`).getContext('2d');
    if (thumbnail) drawPixels(thumbnail, starter.pixels);
  }
  render();
  say('Pocket garden is on the loom. Choose a thread and make it yours; every stroke is one Undo.');
  return { destroy: page.destroy };
}
