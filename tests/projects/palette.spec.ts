import { expect, test } from '@playwright/test';
import { RECIPES } from '../../src/projects/palette/data';
import {
  contrastGrade, contrastRatio, cookPalette, createKitchenState, editPigment, hexToRgb,
  hslToHex, isKitchenState, isSavedRecipes, normalizeHex, readableInk, relativeLuminance,
  rgbToHsl, ROLES, togglePin,
} from '../../src/projects/palette/engine';
import { paletteCss, paletteSvg } from '../../src/projects/palette/export';

test.describe('Palette Kitchen color engine', () => {
  test('matches published sRGB/WCAG cases without rounded threshold errors', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 8);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.478089, 5);
    expect(contrastGrade(contrastRatio('#777777', '#ffffff'))).toBe('Large only');
    expect(contrastGrade(4.4999)).toBe('Large only');
    expect(contrastGrade(4.5)).toBe('AA');
    expect(contrastGrade(7)).toBe('AAA');
  });

  test('validates hex and round-trips colors through HSL', () => {
    expect(normalizeHex(' #AbC ')).toBe('#aabbcc');
    expect(normalizeHex('123DEF')).toBe('#123def');
    for (const color of ['', '#', '#1234', '##fff', 'red', '#12xx12', '<svg>']) expect(normalizeHex(color)).toBeNull();
    expect(() => hexToRgb('bad color')).toThrow(RangeError);
    for (const color of ['#000000', '#ffffff', '#a437e2', '#21b588', '#777777']) {
      expect(hslToHex(rgbToHsl(hexToRgb(color)))).toBe(color);
    }
  });

  test('all six intentional recipes yield distinct valid palettes and readable inks', () => {
    expect(RECIPES).toHaveLength(6);
    const unique = new Set<string>();
    for (const recipe of RECIPES) {
      const palette = cookPalette(createKitchenState(recipe.settings));
      unique.add(JSON.stringify(palette));
      expect(palette.base).toBe(recipe.settings.base);
      for (const role of ROLES) {
        expect(palette[role]).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrastRatio(palette[role], readableInk(palette[role]))).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(unique.size).toBe(6);
  });

  test('manual pigment edits pin and survive recipe changes until unpinned', () => {
    const initial = createKitchenState(RECIPES[0].settings);
    const pinned = editPigment(initial, 'accent', '#fed');
    const changed = { ...pinned, settings: { ...RECIPES[1].settings } };
    expect(cookPalette(changed).accent).toBe('#ffeedd');
    expect(cookPalette(togglePin(changed, 'accent')).accent).not.toBe('#ffeedd');
    expect(initial.pins.accent).toBeNull();
    expect(cookPalette(editPigment(initial, 'base', '#abc')).base).toBe('#aabbcc');
  });

  test('spice and paper warmth affect their intended ingredients', () => {
    const initial = createKitchenState(RECIPES[0].settings);
    const baseline = cookPalette(initial);
    const spicy = cookPalette({ ...initial, settings: { ...initial.settings, spice: 100 } });
    const cold = cookPalette({ ...initial, settings: { ...initial.settings, warmth: -30 } });
    expect(spicy.companion).not.toBe(baseline.companion);
    expect(spicy.accent).not.toBe(baseline.accent);
    expect(cold.paper).not.toBe(baseline.paper);
    expect(cold.base).toBe(baseline.base);
    expect(spicy.base).toBe(baseline.base);
  });

  test('rejects corrupt pantry data and duplicate ids', () => {
    const state = createKitchenState(RECIPES[0].settings);
    const saved = { id: 'a-recipe', name: 'A useful color', state };
    expect(isKitchenState(state)).toBe(true);
    expect(isSavedRecipes([saved])).toBe(true);
    expect(isSavedRecipes([saved, saved])).toBe(false);
    expect(isSavedRecipes([{ ...saved, name: '' }])).toBe(false);
    expect(isSavedRecipes([{ ...saved, name: 'Bad\u0000name' }])).toBe(false);
    expect(isSavedRecipes([{ ...saved, name: '\ud800' }])).toBe(false);
    expect(isSavedRecipes([{ ...saved, id: '" onclick="oops' }])).toBe(false);
    expect(isKitchenState({ ...state, pins: {} })).toBe(false);
    expect(isKitchenState({ ...state, settings: { ...state.settings, spice: Infinity } })).toBe(false);
    expect(isKitchenState({ ...state, settings: { ...state.settings, harmony: 'invented' } })).toBe(false);
  });

  test('exports actual palette values and safe SVG text', () => {
    const state = editPigment(createKitchenState(RECIPES[0].settings), 'paper', '#fefefe');
    const palette = cookPalette(state);
    const css = paletteCss(state);
    for (const role of ROLES) expect(css).toContain(`--palette-${role}: ${palette[role]};`);
    const svg = paletteSvg(state, '<script>&" A recipe');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
    expect(() => paletteSvg(state, 'Bad\u0000name')).toThrow(RangeError);
    expect(svg).toContain('width="1400" height="910"');
    for (const role of ROLES) expect(svg).toContain(palette[role]);
  });
});

test.describe('Palette Kitchen site', () => {
  test('maker content density: swatches lead the page and mark its preview', async ({ page }) => {
    for (const viewport of [{ width: 1322, height: 1160 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto('./projects/palette/');
      const preview = page.locator('.project-palette [data-project-preview]');
      await expect(preview).toHaveCount(1);
      const palette = preview.locator('.pk-spectrum');
      await expect(palette).toBeVisible();
      const top = await palette.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      expect(top, `Palette starts at ${viewport.width}px width`).toBeLessThanOrEqual(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('./projects/palette/');
    await expect(page.locator('.project-palette h1')).toContainText('Palette Kitchen');
  });

  test('invalid hex is visible and leaves the previous palette intact', async ({ page }) => {
    const base = page.locator('[data-chip-hex="base"]');
    const before = await base.textContent();
    await page.getByLabel('Base ingredient #RGB or #RRGGBB', { exact: true }).fill('#wrong');
    await page.getByRole('button', { name: 'Mix color', exact: true }).click();
    await expect(page.locator('[data-base-error]')).toContainText('Your palette has not changed');
    await expect(base).toHaveText(before!);
    await page.locator('[data-base]').fill('#123');
    await page.getByRole('button', { name: 'Mix color', exact: true }).click();
    await expect(base).toHaveText('#112233');
    await expect(page.locator('[data-base-error]')).toBeEmpty();
  });

  test('pins survive preset changes and the matrix selects a real pairing', async ({ page }) => {
    await page.locator('[data-role="accent"]').click();
    await page.getByLabel('Edit this pigment', { exact: true }).fill('#010203');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByRole('button', { name: /Recipe 02 Cobalt crockery/ }).click();
    await expect(page.locator('[data-chip-hex="accent"]')).toHaveText('#010203');
    await page.getByRole('button', { name: 'Unpin pigment', exact: true }).click();
    await expect(page.locator('[data-chip-hex="accent"]')).not.toHaveText('#010203');
    await page.getByText('Open the full pairing table', { exact: false }).click();
    await page.locator('[data-pair-fg="base"][data-pair-bg="base"]').click();
    await expect(page.locator('[data-pair-ratio]')).toHaveText('1.00:1');
    await expect(page.locator('[data-pair-verdict]')).toContainText('AA does not pass');
  });

  test('keeps named pantry snapshots across page reloads and safely renders names', async ({ page }) => {
    await page.locator('[data-recipe-name]').fill('<b>My palette</b>');
    await page.getByRole('button', { name: 'Save to pantry', exact: true }).click();
    await expect(page.locator('[data-shelf]')).toContainText('<b>My palette</b>');
    await expect(page.locator('[data-shelf] b')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Load <b>My palette</b>', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Recipe 03 Plum preserve/ }).click();
    await page.getByRole('button', { name: 'Load <b>My palette</b>', exact: true }).click();
    await expect(page.locator('[data-chip-hex="base"]')).toHaveText('#B74732');
  });

  test('downloads real SVG and CSS files', async ({ page }) => {
    const svgDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Keep SVG card', exact: true }).click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toBe('palette-kitchen.svg');
    const stream = await svg.createReadStream();
    if (!stream) throw new Error('SVG download stream missing.');
    let content = '';
    for await (const chunk of stream) content += chunk.toString();
    expect(content).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(content).toContain('#b74732');
    const parsed = await page.evaluate((text) => {
      const document = new DOMParser().parseFromString(text, 'image/svg+xml');
      return { errors: document.querySelectorAll('parsererror').length, title: document.querySelector('title')?.textContent };
    }, content);
    expect(parsed.errors).toBe(0);
    expect(parsed.title).toContain('Market tomato');
    const cssDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSS', exact: true }).click();
    expect((await cssDownload).suggestedFilename()).toBe('palette-kitchen.css');
  });
});
