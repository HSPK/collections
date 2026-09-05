import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BACKGROUNDS, PALETTES, STARTERS } from '../../src/projects/pixel-loom/data';
import {
  GRID_SIZE, HISTORY_LIMIT, PixelEditor, emptyGrid, floodFill, gridFromPattern,
  isPixelGrid, lineCells, mirroredCells, paintLine, rasterize, transformGrid,
} from '../../src/projects/pixel-loom/engine';
import type { PixelGrid, Point } from '../../src/projects/pixel-loom/engine';

const FOREST = '#24473b';
const PINK = '#d97d77';
const index = (point: Point) => point.y * GRID_SIZE + point.x;

test.describe('Pixel Loom engine', () => {
  test('validates all original patterns, colors, and untrusted grids', () => {
    expect(STARTERS).toHaveLength(3);
    expect(new Set(STARTERS.map((starter) => starter.id)).size).toBe(3);
    expect(new Set(STARTERS.map((starter) => JSON.stringify(starter.pixels))).size).toBe(3);
    for (const starter of STARTERS) {
      expect(isPixelGrid(starter.pixels)).toBe(true);
      expect(starter.pixels.filter(Boolean).length).toBeGreaterThan(70);
      expect(starter.pixels.filter(Boolean).length).toBeLessThan(200);
      expect(PALETTES.some((palette) => palette.id === starter.palette)).toBe(true);
    }
    for (const palette of PALETTES) {
      expect(palette.colors).toHaveLength(10);
      expect(new Set(palette.colors.map((color) => color.color)).size).toBe(10);
      expect(palette.colors.every((color) => /^#[0-9a-f]{6}$/.test(color.color))).toBe(true);
    }
    expect(isPixelGrid(new Array(256))).toBe(false);
    expect(isPixelGrid(Array(256).fill('#fff'))).toBe(false);
    expect(isPixelGrid(Array(256).fill('red'))).toBe(false);
    expect(isPixelGrid({ length: 256 })).toBe(false);
    expect(() => new PixelEditor([])).toThrow('256');
    expect(() => gridFromPattern(['....'], {})).toThrow('16 rows');
    expect(() => gridFromPattern(Array<string>(16).fill('x'.repeat(16)), {})).toThrow('missing or invalid');
    const normalized = emptyGrid();
    normalized[0] = '#AABBCC';
    expect(new PixelEditor(normalized).pixels[0]).toBe('#aabbcc');
  });

  test('interpolates fast strokes in every direction without gaps', () => {
    const origins = [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 }];
    for (const from of origins) {
      for (let x = 0; x < 16; x += 1) {
        for (let y = 0; y < 16; y += 1) {
          const to = { x, y };
          const cells = lineCells(from, to);
          expect(cells[0]).toEqual(from);
          expect(cells.at(-1)).toEqual(to);
          expect(cells.length).toBe(Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) + 1);
          for (let i = 1; i < cells.length; i += 1) {
            expect(Math.abs(cells[i].x - cells[i - 1].x)).toBeLessThanOrEqual(1);
            expect(Math.abs(cells[i].y - cells[i - 1].y)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    const pixels = emptyGrid();
    paintLine(pixels, { x: 0, y: 3 }, { x: 15, y: 3 }, FOREST);
    expect(pixels.filter(Boolean)).toHaveLength(16);
    expect(pixels.slice(48, 64)).toEqual(Array(16).fill(FOREST));
    expect(lineCells({ x: -1, y: 0 }, { x: 4, y: 4 })).toEqual([]);
    expect(lineCells({ x: Number.NaN, y: 0 }, { x: 4, y: 4 })).toEqual([]);
  });

  test('mirrors paint and erase across the selected axes', () => {
    const pixels = emptyGrid();
    const origin = { x: 2, y: 3 };
    const mirrors = mirroredCells(origin, 'both');
    expect(mirrors).toEqual([{ x: 2, y: 3 }, { x: 2, y: 12 }, { x: 13, y: 3 }, { x: 13, y: 12 }]);
    paintLine(pixels, origin, origin, PINK, 'both');
    expect(pixels.filter(Boolean)).toHaveLength(4);
    for (const point of mirrors) expect(pixels[index(point)]).toBe(PINK);
    paintLine(pixels, origin, origin, null, 'left-right');
    expect(pixels.filter(Boolean)).toHaveLength(2);
    expect(pixels[index({ x: 2, y: 12 })]).toBe(PINK);
    expect(pixels[index({ x: 13, y: 12 })]).toBe(PINK);
  });

  test('fills four-connected regions and resolves mirrors against the original image', () => {
    const pixels = emptyGrid();
    for (let y = 0; y < 16; y += 1) pixels[y * 16 + 8] = FOREST;
    floodFill(pixels, { x: 0, y: 0 }, PINK);
    expect(pixels.filter((pixel) => pixel === PINK)).toHaveLength(128);
    expect(pixels.filter((pixel) => pixel === null)).toHaveLength(112);
    floodFill(pixels, { x: 0, y: 0 }, '#ffffff', 'left-right');
    expect(pixels.filter((pixel) => pixel === '#ffffff')).toHaveLength(240);
    expect(pixels.filter((pixel) => pixel === FOREST)).toHaveLength(16);

    const diagonal = Array<string>(256).fill(FOREST);
    diagonal[0] = PINK;
    diagonal[17] = PINK;
    floodFill(diagonal, { x: 0, y: 0 }, '#ffffff');
    expect(diagonal[0]).toBe('#ffffff');
    expect(diagonal[17]).toBe(PINK);

    const original = emptyGrid();
    original[0] = FOREST;
    original[15] = PINK;
    floodFill(original, { x: 0, y: 0 }, PINK, 'left-right');
    expect(original.filter((pixel) => pixel === PINK)).toHaveLength(2);
    expect(original.filter((pixel) => pixel === null)).toHaveLength(254);
  });

  test('treats a gesture as one history step and cancels without losing redo', () => {
    const editor = new PixelEditor(emptyGrid());
    expect(editor.begin('Paint stroke')).toBe(true);
    expect(editor.begin('Overlapping stroke')).toBe(false);
    editor.paint({ x: 0, y: 0 }, { x: 15, y: 0 }, FOREST);
    editor.paint({ x: 15, y: 0 }, { x: 15, y: 15 }, FOREST);
    expect(editor.canUndo).toBe(false);
    expect(editor.undo()).toBeNull();
    expect(editor.commit()).toEqual({ label: 'Paint stroke', count: 31 });
    expect(editor.undoCount).toBe(1);
    const painted = editor.snapshot();
    expect(editor.undo()).toBe('Paint stroke');
    expect(editor.pixels).toEqual(emptyGrid());
    editor.begin('Canceled stroke');
    editor.paint({ x: 1, y: 1 }, { x: 8, y: 4 }, PINK);
    expect(editor.cancel()).toBe(true);
    expect(editor.pixels).toEqual(emptyGrid());
    expect(editor.redoCount).toBe(1);
    expect(editor.redo()).toBe('Paint stroke');
    expect(editor.pixels).toEqual(painted);
    const detached = editor.snapshot();
    detached[0] = null;
    expect(editor.pixels[0]).toBe(FOREST);
  });

  test('bounds history, preserves redo on no-ops, and discards a divergent future', () => {
    const editor = new PixelEditor(emptyGrid(), 3);
    for (let x = 0; x < 5; x += 1) {
      editor.begin(`Pixel ${x}`);
      editor.paint({ x, y: 0 }, { x, y: 0 }, FOREST);
      editor.commit();
    }
    expect(editor.undoCount).toBe(3);
    expect(editor.undo()).toBe('Pixel 4');
    expect(editor.replace(editor.snapshot(), 'No change')).toBeNull();
    expect(editor.redoCount).toBe(1);
    editor.begin('No-op erase');
    editor.paint({ x: 15, y: 15 }, { x: 15, y: 15 }, null);
    expect(editor.commit()).toBeNull();
    expect(editor.redoCount).toBe(1);
    editor.begin('New branch');
    editor.paint({ x: 15, y: 15 }, { x: 15, y: 15 }, PINK);
    editor.commit();
    expect(editor.redoCount).toBe(0);
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.undo()).toBeNull();
    expect(editor.pixels.filter(Boolean)).toHaveLength(2);
    expect(HISTORY_LIMIT).toBe(60);
    expect(() => new PixelEditor(emptyGrid(), 0)).toThrow('History');
  });

  test('makes flips, rotation, starter replacement, and clearing fully reversible', () => {
    const pixels = emptyGrid();
    pixels[index({ x: 2, y: 3 })] = PINK;
    expect(transformGrid(pixels, 'mirror-x')[index({ x: 13, y: 3 })]).toBe(PINK);
    expect(transformGrid(pixels, 'mirror-y')[index({ x: 2, y: 12 })]).toBe(PINK);
    expect(transformGrid(pixels, 'rotate-right')[index({ x: 12, y: 2 })]).toBe(PINK);
    let rotated = pixels;
    for (let i = 0; i < 4; i += 1) rotated = transformGrid(rotated, 'rotate-right');
    expect(rotated).toEqual(pixels);
    const editor = new PixelEditor(STARTERS[0].pixels);
    editor.transform('mirror-x', 'Flip');
    const flipped = editor.snapshot();
    editor.replace(STARTERS[1].pixels, 'Moon moth');
    editor.replace(emptyGrid(), 'Clear');
    expect(editor.pixels).toEqual(emptyGrid());
    editor.undo();
    expect(editor.pixels).toEqual(STARTERS[1].pixels);
    editor.undo();
    expect(editor.pixels).toEqual(flipped);
    editor.undo();
    expect(editor.pixels).toEqual(STARTERS[0].pixels);
  });

  test('exports exact integer-scaled RGBA pixels and real transparency', () => {
    const pixels = emptyGrid();
    pixels[0] = '#123456';
    pixels[255] = PINK;
    const output = rasterize(pixels, 4);
    expect([output.width, output.height]).toEqual([64, 64]);
    const rgba = (x: number, y: number) => Array.from(output.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
    expect(rgba(0, 0)).toEqual([18, 52, 86, 255]);
    expect(rgba(3, 3)).toEqual([18, 52, 86, 255]);
    expect(rgba(4, 0)).toEqual([0, 0, 0, 0]);
    expect(rgba(0, 4)).toEqual([0, 0, 0, 0]);
    expect(rgba(63, 63)).toEqual([217, 125, 119, 255]);
    const paper = rasterize(pixels, 1, '#ffffff');
    expect(Array.from(paper.data.slice(4, 8))).toEqual([255, 255, 255, 255]);
    expect(Array.from(paper.data.slice(0, 4))).toEqual([18, 52, 86, 255]);
    for (const background of BACKGROUNDS) expect(rasterize(pixels, 1, background.color).data.length).toBe(1024);
    expect(() => rasterize(pixels, 1.5)).toThrow('whole number');
    expect(() => rasterize(pixels, 0)).toThrow('whole number');
    expect(() => rasterize(pixels, 33)).toThrow('whole number');
    expect(() => rasterize(pixels, 1, 'transparent')).toThrow('six-digit');
  });
});

async function openEditor(page: Page) {
  await page.goto('projects/pixel-loom/');
  await expect(page.locator('.project-pixel-loom h1')).toHaveText('Pixel Loom✳');
  await expect(page.locator('[data-canvas]')).toBeVisible();
}

async function clearCanvas(page: Page) {
  await page.getByRole('button', { name: 'Clear canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Clear · keep in Undo', exact: true }).click();
  await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
}

async function actualPixels(page: Page): Promise<number[]> {
  return page.locator('[data-actual]').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 16, 16).data);
  });
}

function rgbaForGrid(pixels: PixelGrid) {
  return Array.from(rasterize(pixels).data);
}

test.describe('Pixel Loom website', () => {
  test('maker content density: the board leads the page and marks its preview', async ({ page }) => {
    for (const viewport of [{ width: 1322, height: 1160 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto('./projects/pixel-loom/');
      const preview = page.locator('.project-pixel-loom [data-project-preview]');
      await expect(preview).toHaveCount(1);
      const board = preview.locator('[data-canvas]');
      await expect(board).toBeVisible();
      const top = await board.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      expect(top, `Board starts at ${viewport.width}px width`).toBeLessThanOrEqual(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });

  test('loads complete original art and reversibly replaces, transforms, and clears it', async ({ page }) => {
    await openEditor(page);
    expect(await actualPixels(page)).toEqual(rgbaForGrid(STARTERS[0].pixels));
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Load Moon moth starter' }).click();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(STARTERS[1].pixels));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(STARTERS[0].pixels));
    await page.getByRole('button', { name: 'Rotate artwork 90 degrees clockwise' }).click();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(transformGrid(STARTERS[0].pixels, 'rotate-right')));
    await page.getByRole('button', { name: 'Clear canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Keep drawing', exact: true }).click();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(transformGrid(STARTERS[0].pixels, 'rotate-right')));
    await clearCanvas(page);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(transformGrid(STARTERS[0].pixels, 'rotate-right')));
    await expect(page.locator('[data-status]')).toContainText('Undid clear canvas');
  });

  test('interpolates a quick pointer drag as one undo step and cancels captured strokes', async ({ page }) => {
    await openEditor(page);
    await clearCanvas(page);
    const canvas = page.locator('[data-canvas]');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = (await canvas.boundingBox())!;
    const y = bounds.y + bounds.height * 7.5 / 16;
    await page.mouse.move(bounds.x + bounds.width * .5 / 16, y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 15.5 / 16, y, { steps: 1 });
    await page.mouse.up();
    await expect(page.locator('[data-stats]')).toHaveText('16 / 256 painted · 1 color');
    await canvas.press('Control+z');
    await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
    await canvas.press('Control+Shift+z');
    await expect(page.locator('[data-stats]')).toHaveText('16 / 256 painted · 1 color');
    await canvas.press('Control+z');

    await page.mouse.move(bounds.x + bounds.width * 2.5 / 16, bounds.y + bounds.height * 2.5 / 16);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 10.5 / 16, bounds.y + bounds.height * 2.5 / 16);
    await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    await page.mouse.up();
    await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
    await expect(page.locator('[data-status]')).toContainText('Stroke canceled');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('[data-stats]')).toHaveText('16 / 256 painted · 1 color');
  });

  test('supports keyboard strokes, mirrored fill, erasing, and transparent eyedropping', async ({ page }) => {
    await openEditor(page);
    await clearCanvas(page);
    const canvas = page.locator('[data-canvas]');
    await canvas.press('Home');
    await page.keyboard.down('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Space');
    await expect(page.locator('[data-stats]')).toHaveText('4 / 256 painted · 1 color');
    await canvas.press('Control+z');
    await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
    await page.getByLabel('Mirror as you draw', { exact: true }).selectOption('both');
    await canvas.focus();
    await canvas.press('Home');
    await canvas.press('Space');
    await expect(page.locator('[data-stats]')).toHaveText('4 / 256 painted · 1 color');
    await canvas.press('e');
    await canvas.press('Space');
    await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
    await canvas.press('f');
    await canvas.press('Space');
    await expect(page.locator('[data-stats]')).toHaveText('256 / 256 painted · 1 color');
    await canvas.press('Control+z');
    await canvas.press('i');
    await canvas.press('Space');
    await expect(page.getByRole('button', { name: 'Erase (E)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-status]')).toContainText('transparent');
  });

  test('captures touch drags without scrolling and reverses canceled touch gestures', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openEditor(page);
    await clearCanvas(page);
    const canvas = page.locator('[data-canvas]');
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await canvas.scrollIntoViewIfNeeded();
      let bounds = (await canvas.boundingBox())!;
      const scroll = await page.evaluate(() => window.scrollY);
      const left = { x: bounds.x + bounds.width * .5 / 16, y: bounds.y + bounds.height * 7.5 / 16, id: 1 };
      const right = { ...left, x: bounds.x + bounds.width * 15.5 / 16 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('[data-stats]')).toHaveText('16 / 256 painted · 1 color');
      expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
      await canvas.press('Control+z');
      await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
      await canvas.scrollIntoViewIfNeeded();
      bounds = (await canvas.boundingBox())!;
      const start = { x: bounds.x + bounds.width * 1.5 / 16, y: bounds.y + bounds.height * 1.5 / 16, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ ...start, x: bounds.x + bounds.width * 12.5 / 16 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(page.locator('[data-stats]')).toHaveText('0 / 256 painted · 0 colors');
      await expect(page.locator('[data-status]')).toContainText('Stroke canceled');
      await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
    } finally {
      await cdp.detach();
    }
  });

  test('exports a decodable PNG with exact blocks, alpha, and background choice', async ({ page }) => {
    await openEditor(page);
    await clearCanvas(page);
    const canvas = page.locator('[data-canvas]');
    await canvas.press('Home');
    await canvas.press('Space');
    await page.getByLabel('PNG size', { exact: true }).selectOption('4');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('pixel-loom-64.png');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const image = await page.evaluate(async (values) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(values)], { type: 'image/png' }));
      const target = document.createElement('canvas');
      target.width = bitmap.width;
      target.height = bitmap.height;
      const ctx = target.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const result = {
        width: bitmap.width, height: bitmap.height,
        painted: Array.from(ctx.getImageData(3, 3, 1, 1).data),
        transparent: Array.from(ctx.getImageData(4, 0, 1, 1).data),
      };
      bitmap.close();
      return result;
    }, Array.from(bytes));
    expect(image).toEqual({ width: 64, height: 64, painted: [36, 71, 59, 255], transparent: [0, 0, 0, 0] });
    await expect(page.locator('[data-status]')).toContainText('PNG ready: 64 × 64');
    await page.getByLabel('Export background', { exact: true }).selectOption('white');
    const pixels = await actualPixels(page);
    expect(pixels.slice(4, 8)).toEqual([255, 255, 255, 255]);
    await page.getByRole('button', { name: 'Repeat', exact: true }).click();
    await expect(page.locator('[data-preview-label]')).toHaveText('3 × 3 repeat · 2×');
  });

  test('reports PNG encoding failures inside the editor without losing artwork', async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
    });
    await page.getByRole('button', { name: 'Download PNG' }).click();
    await expect(page.locator('[data-status]')).toHaveAttribute('data-tone', 'error');
    await expect(page.locator('[data-status]')).toContainText('could not encode this PNG');
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
    expect(await actualPixels(page)).toEqual(rgbaForGrid(STARTERS[0].pixels));
  });

  test('fits 375px, keeps input shortcuts native, and disposes on unmount', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openEditor(page);
    const overflow = await page.locator('.project-pixel-loom').evaluate((root) => root.scrollWidth > root.clientWidth);
    expect(overflow).toBe(false);
    const targetSizes = await page.locator('.project-pixel-loom button').evaluateAll((buttons) =>
      buttons.filter((button) => !button.closest('[hidden]')).map((button) => button.getBoundingClientRect().height));
    expect(targetSizes.every((height) => height >= 44)).toBe(true);
    await page.getByLabel('Color palette', { exact: true }).focus();
    await page.keyboard.press('e');
    await expect(page.getByRole('button', { name: 'Paint (B)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const lifecycle = await page.evaluate(async () => {
      const moduleUrl = new URL('src/projects/pixel-loom/index.ts', document.querySelector<HTMLMetaElement>('meta[name="odd-index-base"]')
        ? new URL(document.querySelector<HTMLMetaElement>('meta[name="odd-index-base"]')!.content, location.href)
        : new URL('../../', location.href));
      const { mount } = await import(/* @vite-ignore */ moduleUrl.href);
      const container = document.createElement('div');
      const controls = document.createElement('div');
      document.body.append(container);
      const controller = new AbortController();
      let reports = 0;
      const instance = mount({
        container, controls, signal: controller.signal, reducedMotion: true,
        report: () => { reports += 1; },
      });
      const target = container.querySelector('[data-canvas]')!;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      controller.abort();
      const before = reports;
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      window.dispatchEvent(new Event('blur'));
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      instance.destroy();
      const result = { empty: container.childElementCount === 0, unchanged: reports === before };
      container.remove();
      return result;
    });
    expect(lifecycle).toEqual({ empty: true, unchanged: true });
  });
});
