import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseManifest } from '../../src/core/manifest';
import { presets, TILE_IDS } from '../../src/projects/city/data';
import type { TileId } from '../../src/projects/city/data';
import {
  HISTORY_LIMIT, addressOf, analyzePlan, clearPlan, commitPlan, createHistory,
  createPlan, deserializePlan, neighborIndices, placeTile, planFilename,
  planFromPreset, recipeChecks, redo, renamePlan, serializePlan, undo,
} from '../../src/projects/city/engine';
import { exportIllustration } from '../../src/projects/city/renderer';

test.use({ trace: 'off', screenshot: 'off', video: 'off', acceptDownloads: true });

const plan = (rows: string[], name = 'Test quarter') => planFromPreset({
  id: 'test', name, description: 'A model fixture.', rows,
});

test('city: composed presets have exact counts and a connected default street graph', () => {
  const starter = planFromPreset(presets[0]);
  const metrics = analyzePlan(starter);
  expect(starter.width).toBe(8);
  expect(starter.height).toBe(8);
  expect(metrics.roadCount).toBe(24);
  expect(metrics.counts.bridge).toBe(2);
  expect(metrics.roadGroups).toHaveLength(1);
  expect(metrics.largestRoadGroup).toBe(24);
  expect(metrics.buildingCount).toBe(16);
  expect(metrics.buildingsWithFrontage).toBe(14);
  expect(metrics.unfrontedBuildings.map((index) => addressOf(starter, index))).toEqual(['E1', 'E8']);
  expect(metrics.greenCount).toBe(12);
  expect(metrics.counts.water).toBe(10);
  expect(recipeChecks(metrics)['every-frontage']).toBe(false);
  expect(recipeChecks(analyzePlan(planFromPreset(presets[1])))['joined-streets']).toBe(false);
  expect(recipeChecks(analyzePlan(planFromPreset(presets[2])))['four-green-neighbors']).toBe(false);
  for (const preset of presets) {
    const current = planFromPreset(preset);
    expect(current.cells).toHaveLength(64);
    expect(Object.values(analyzePlan(current).counts).reduce((sum, count) => sum + count, 0)).toBe(64);
  }
});

test('city: road components use shared sides, never diagonals or row wrapping', () => {
  const diagonal = analyzePlan(plan(['+..', '.+.', '..+']));
  expect(diagonal.roadGroups.map((group) => group.length)).toEqual([1, 1, 1]);
  expect(diagonal.roadEdges).toBe(0);
  const wrapping = plan(['..+', '+..']);
  expect(analyzePlan(wrapping).roadGroups).toHaveLength(2);
  expect(neighborIndices(wrapping, 2)).toEqual([5, 1]);
  const joined = analyzePlan(plan(['++.', '.++']));
  expect(joined.roadGroups).toHaveLength(1);
  expect(joined.roadEdges).toBe(3);
  expect(joined.largestRoadGroup).toBe(4);
});

test('city: filling E3 joins two actual road components without changing the starting plan', () => {
  const lanes = planFromPreset(presets[1]);
  expect(analyzePlan(lanes).roadGroups).toHaveLength(2);
  const stitched = placeTile(lanes, 2 * lanes.width + 4, 'road');
  expect(analyzePlan(stitched).roadGroups).toHaveLength(1);
  expect(analyzePlan(stitched).roadCount).toBe(analyzePlan(lanes).roadCount + 1);
  expect(lanes.cells[20]).toBe('empty');
  expect(stitched.cells[20]).toBe('road');
});

test('city: bridges are road nodes; water, green, buildings, and squares are not routes', () => {
  const bridge = analyzePlan(plan(['+=+']));
  expect(bridge.roadGroups).toHaveLength(1);
  expect(bridge.roadEdges).toBe(2);
  expect(bridge.roadCount).toBe(3);
  expect(bridge.counts.water).toBe(0);
  for (const middle of ['~', 'p', 'g', 's', 'h', '.']) {
    expect(analyzePlan(plan([`+${middle}+`])).roadGroups, middle).toHaveLength(2);
  }
});

test('city: frontage and green adjacency count each building once and exclude corners', () => {
  const corner = analyzePlan(plan(['h..', '.+.', '..l']));
  expect(corner.buildingCount).toBe(2);
  expect(corner.buildingsWithFrontage).toBe(0);
  expect(corner.unfrontedBuildings).toEqual([0, 8]);
  const surrounded = analyzePlan(plan(['++.', '+hp', '.g.']));
  expect(surrounded.buildingCount).toBe(1);
  expect(surrounded.buildingsWithFrontage).toBe(1);
  expect(surrounded.buildingsBesideGreen).toBe(1);
  expect(surrounded.greenCount).toBe(2);
  const terrace = analyzePlan(plan(['t+p', '..h']));
  expect(terrace.buildingCount).toBe(2);
  expect(terrace.buildingsWithFrontage).toBe(1);
  expect(terrace.buildingsBesideGreen).toBe(1);
});

test('city: edits, resets, and imports are immutable, reversible, and branch-aware', () => {
  const starter = plan(['h+', 'p.']);
  const source: TileId[] = ['cottage', 'road'];
  const copied = createPlan('Copied input', 2, 1, source);
  source[0] = 'empty';
  expect(copied.cells[0]).toBe('cottage');
  expect(Object.isFrozen(copied.cells)).toBe(true);

  const first = commitPlan(createHistory(starter), placeTile(starter, 0, 'library'));
  const reverted = undo(first);
  expect(reverted.present).toBe(starter);
  expect(redo(reverted).present.cells[0]).toBe('library');
  expect(commitPlan(reverted, plan(['h+', 'p.']))).toBe(reverted);
  expect(commitPlan(reverted, placeTile(starter, 3, 'garden')).future).toHaveLength(0);
  expect(starter.cells).toEqual(['cottage', 'road', 'park', 'empty']);
  expect(placeTile(starter, 0, 'cottage')).toBe(starter);
  expect(() => placeTile(starter, 4, 'road')).toThrow('outside');

  const cleared = commitPlan(first, clearPlan(first.present));
  expect(cleared.present.cells.every((tile) => tile === 'empty')).toBe(true);
  expect(undo(cleared).present).toBe(first.present);
  const reset = commitPlan(cleared, planFromPreset(presets[0]));
  expect(undo(reset).present).toBe(cleared.present);
  const imported = commitPlan(reset, deserializePlan(serializePlan(starter)));
  expect(imported.present).toEqual(starter);
  expect(undo(imported).present).toBe(reset.present);
  expect(redo(undo(imported)).present).toBe(imported.present);
});

test('city: history is bounded and empty plans do not claim successful recipes', () => {
  let history = createHistory(plan(['.']));
  for (let index = 0; index < HISTORY_LIMIT + 7; index++) {
    history = commitPlan(history, renamePlan(history.present, `Edition ${index}`));
  }
  expect(history.past).toHaveLength(HISTORY_LIMIT);
  const blank = analyzePlan(plan(['..', '..']));
  expect(blank.roadCount).toBe(0);
  expect(blank.roadGroups).toEqual([]);
  expect(blank.largestRoadGroup).toBe(0);
  expect(blank.roadEdges).toBe(0);
  expect(blank.buildingCount).toBe(0);
  expect(Object.values(recipeChecks(blank)).every((value) => !value)).toBe(true);
});

test('city: JSON round-trips every tile and rejects malformed or unsupported plans', () => {
  const original = createPlan('Mira’s <paper> & pond', TILE_IDS.length, 1, TILE_IDS);
  const serialized = serializePlan(original);
  expect(deserializePlan(serialized)).toEqual(original);
  expect(JSON.parse(serialized).model.caveat).toContain('not real urban planning advice');
  const base = JSON.parse(serialized);
  expect(() => deserializePlan('{bad')).toThrow('not valid JSON');
  expect(() => deserializePlan(JSON.stringify({ ...base, version: 2 }))).toThrow('version 1');
  expect(() => deserializePlan(JSON.stringify({ ...base, tiles: [['unknown']] }))).toThrow('known tile');
  expect(() => deserializePlan(JSON.stringify({ ...base, width: 2 }))).toThrow('known tile');
  expect(() => deserializePlan(JSON.stringify({ ...base, name: '' }))).toThrow('readable name');
  expect(() => deserializePlan(' '.repeat(100_001))).toThrow('too large');
  expect(() => createPlan('Too big', 17, 1, Array<TileId>(17).fill('empty'))).toThrow('1 to 16');
  expect(() => createPlan('Bad\u0001title', 1, 1, ['empty'])).toThrow('readable name');
  expect(planFilename(renamePlan(plan(['.']), '東京'), 'json')).toBe('recipe-for-a-city-neighborhood.json');
});

test('city: SVG is original, self-contained, escaped, and deterministic', () => {
  const original = plan(['hl+', 'pg='], '<paper> & "trees"');
  const svg = exportIllustration(original);
  expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain('&lt;paper&gt; &amp;');
  expect(svg).toContain('<metadata>');
  expect(svg).not.toMatch(/<(?:image|script|foreignObject)\b/);
  expect(svg).not.toContain('data-city-cell');
  expect(svg).not.toContain('#a7462b');
  expect(exportIllustration(original)).toBe(svg);
  expect(exportIllustration(renamePlan(original, 'A'.repeat(60))).match(/<tspan/g)!.length).toBeGreaterThan(1);
});

test('city: the manifest declares a discoverable independent website', () => {
  const manifest = parseManifest(JSON.parse(readFileSync('src/projects/city/manifest.json', 'utf8')));
  expect(manifest.id).toBe('city');
  expect(manifest.title).toBe('Recipe for a City');
  expect(manifest.order).toBe(26);
  expect(manifest.category).toBe('explore');
  expect(manifest.format).toBe('page');
});

async function mountCity(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/projects/city/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>City isolated mount</title><style>body { margin: 0; }</style></head><body><main id="city-host"></main>
      <script type="module">
        import { mount } from '/src/projects/city/index.ts';
        const controller = new AbortController();
        const instance = mount({
          container: document.querySelector('#city-host'), controls: document.createElement('div'),
          signal: controller.signal, reducedMotion: true, report: () => {},
        });
        window.cityTestDestroy = () => instance.destroy();
        window.cityTestAbort = () => controller.abort();
      </script></body></html>`,
  }));
  await page.goto('./projects/city/');
  await expect(page.locator('.project-city')).toBeVisible();
  return errors;
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The browser did not provide a download stream.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function closeCityPanel(page: Page): Promise<void> {
  const dialog = page.locator('.project-city dialog[open]');
  if (await dialog.count()) await dialog.getByRole('button', { name: /^Close / }).click();
}

async function openCityPanel(page: Page, name: string): Promise<void> {
  await closeCityPanel(page);
  await page.getByRole('navigation', { name: 'Recipe for a City' }).getByRole('button', { name, exact: true }).click();
}

test('city: placement, pointer selection, undo, redo, clear, and reset use the actual plan', async ({ page }) => {
  const errors = await mountCity(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe for a City', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Recipe for a City' })).toBeVisible();
  await expect(page.locator('[data-city-road-count]')).toHaveText('24');
  await page.getByLabel('Ingredient', { exact: true }).selectOption('road');
  await page.getByLabel('Plot column').selectOption('4');
  await page.getByLabel('Plot row').selectOption({ value: '1' });
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Square');
  await page.getByRole('button', { name: 'Place Street at E2', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('25');
  await expect(page.locator('[data-city-frontage]')).toHaveText('15 / 16');
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('24');
  await page.getByRole('button', { name: '↷ Redo', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('25');
  await page.getByRole('button', { name: 'Remove tile at E2', exact: true }).click();
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Empty plot');
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await openCityPanel(page, 'Tools');
  await page.getByRole('button', { name: 'Clear all plots', exact: true }).click();
  await expect(page.locator('[data-city-road-groups]')).toHaveText('0');
  await expect(page.locator('[data-city-frontage]')).toHaveText('0 / 0');
  await expect(page.locator('[data-city-count="empty"]')).toHaveText('64 on this plan');
  await closeCityPanel(page);
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('25');
  await openCityPanel(page, 'Tools');
  await page.getByRole('button', { name: 'Restore canal starter', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('24');
  await closeCityPanel(page);
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('25');
  await page.locator('[data-city-cell="7"] polygon').first().click();
  await expect(page.locator('[data-city-address-label]')).toHaveText('H1');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Canal');
  await expect(page.locator('[data-city-road-count]')).toHaveText('25');
  expect(errors).toEqual([]);
});

test('city: keyboard address editing, graph overlays, and recipe loading remain operable', async ({ page }) => {
  const errors = await mountCity(page);
  await page.getByLabel('Plot column').selectOption('0');
  await page.getByLabel('Plot row').selectOption('0');
  await openCityPanel(page, 'Tools');
  const pad = page.locator('[data-city-navigator]');
  await pad.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-city-address-label]')).toHaveText('A1');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-city-address-label]')).toHaveText('B1');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await pad.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Library');
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Empty plot');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Library');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Empty plot');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Library');
  await closeCityPanel(page);
  await page.getByRole('checkbox', { name: 'Road groups', exact: true }).check();
  await openCityPanel(page, 'Tools');
  await expect(page.locator('[data-city-group-note]')).toBeVisible();
  await expect(page.locator('[data-city-cell="2"] text')).toHaveText('1');
  await openCityPanel(page, 'Recipes');
  await page.getByRole('button', { name: 'Try Two quiet lanes', exact: true }).click();
  await expect(page.locator('[data-city-plan-name]')).toHaveText('Two quiet lanes');
  await expect(page.locator('[data-city-plan-name]')).toBeFocused();
  await expect(page.locator('[data-city-road-groups]')).toHaveText('2');
  await openCityPanel(page, 'Tools');
  await page.getByLabel('Start from a recipe').selectOption('commons');
  await expect(page.locator('[data-city-plan-name]')).toHaveText('A square to share');
  expect(errors).toEqual([]);
});

test('city: a 375px touch layout keeps controls readable and enlarged artwork contained', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors = await mountCity(page);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  const controlSizes = await page.locator('.project-city button, .project-city select, .project-city input:not([type="checkbox"]):not([type="file"])')
    .evaluateAll((elements) => elements.filter((element) => element.getClientRects().length).map((element) => ({
      height: element.getBoundingClientRect().height,
      font: parseFloat(getComputedStyle(element).fontSize),
      right: element.getBoundingClientRect().right,
    })));
  for (const control of controlSizes) {
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.font).toBeGreaterThanOrEqual(14);
    expect(control.right).toBeLessThanOrEqual(375);
  }
  await page.getByRole('button', { name: 'Enlarge drawing', exact: true }).click();
  expect(await fits()).toBe(true);
  expect(await page.locator('[data-city-art]').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.getByLabel('Ingredient', { exact: true }).selectOption('bakery');
  await page.getByLabel('Plot column').selectOption('0');
  await page.getByLabel('Plot row').selectOption('0');
  await page.getByRole('button', { name: 'Place Bakery at A1', exact: true }).click();
  await expect(page.locator('[data-city-current-tile]')).toHaveText('Bakery');
  await openCityPanel(page, 'Tools');
  await page.getByRole('button', { name: 'Select next row', exact: true }).click();
  await expect(page.locator('[data-city-address-label]')).toHaveText('A2');
  await closeCityPanel(page);
  await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  expect(await fits()).toBe(true);
  expect(errors).toEqual([]);
});

test('city: SVG and JSON downloads are valid, re-openable, and safe with a custom title', async ({ page }) => {
  const errors = await mountCity(page);
  const title = `Mira's <paper> & pond`;
  await openCityPanel(page, 'Save');
  await page.getByLabel('Title on your illustration').fill(title);
  await page.getByRole('button', { name: 'Set title', exact: true }).click();
  await expect(page.locator('[data-city-plan-name]')).toHaveText(title);
  await closeCityPanel(page);
  await page.getByRole('checkbox', { name: 'Road groups', exact: true }).check();
  await openCityPanel(page, 'Save');
  const svgEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep the illustration SVG ↓', exact: true }).click();
  const svgDownload = await svgEvent;
  expect(svgDownload.suggestedFilename()).toBe('recipe-for-a-city-mira-s-paper-pond.svg');
  const svg = await downloadText(svgDownload);
  const svgResult = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      errors: doc.querySelectorAll('parsererror').length,
      title: doc.querySelector('title')?.textContent,
      unsafeElements: doc.querySelectorAll('image, script, foreignObject').length,
      metadata: JSON.parse(doc.querySelector('metadata')!.textContent!),
    };
  }, svg);
  expect(svgResult.errors).toBe(0);
  expect(svgResult.title).toBe(title);
  expect(svgResult.unsafeElements).toBe(0);
  expect(svgResult.metadata.tiles.flat()).toHaveLength(64);
  expect(svg).not.toContain('data-city-cell');
  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save the editable plan JSON ↓', exact: true }).click();
  const jsonDownload = await jsonEvent;
  const json = await downloadText(jsonDownload);
  expect(deserializePlan(json).name).toBe(title);
  await openCityPanel(page, 'Tools');
  await page.getByRole('button', { name: 'Clear all plots', exact: true }).click();
  await openCityPanel(page, 'Save');
  await page.locator('[data-city-import]').setInputFiles({
    name: 'saved-quarter.json', mimeType: 'application/json', buffer: Buffer.from(json),
  });
  await expect(page.locator('[data-city-export-status]')).toContainText('Opened');
  await expect(page.locator('[data-city-road-count]')).toHaveText('24');
  await closeCityPanel(page);
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.locator('[data-city-road-count]')).toHaveText('0');
  await openCityPanel(page, 'Save');
  await page.locator('[data-city-import]').setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken'),
  });
  await expect(page.locator('[data-city-export-status]')).toContainText('not valid JSON');
  await expect(page.locator('[data-city-road-count]')).toHaveText('0');
  const small = serializePlan(plan(['h+', 'p.'], 'A smaller quarter'));
  await page.locator('[data-city-import]').setInputFiles({
    name: 'small.json', mimeType: 'application/json', buffer: Buffer.from(small),
  });
  await expect(page.getByLabel('Plot column').locator('option')).toHaveCount(2);
  await expect(page.getByLabel('Plot row').locator('option')).toHaveCount(2);
  await expect(page.locator('[data-city-map-selection]')).toHaveText('Selected: B2 · Empty plot');
  expect(errors).toEqual([]);
});

test('city: destroy and parent abort remove the page and retire its event handlers', async ({ page }) => {
  const errors = await mountCity(page);
  const result = await page.evaluate(() => {
    const root = document.querySelector('.project-city')!;
    const oldClear = root.querySelector<HTMLButtonElement>('[data-city-action="clear"]')!;
    const oldCount = root.querySelector('[data-city-road-count]')!;
    const before = oldCount.textContent;
    Reflect.get(window, 'cityTestDestroy')();
    Reflect.get(window, 'cityTestDestroy')();
    oldClear.click();
    return { connected: root.isConnected, before, after: oldCount.textContent };
  });
  expect(result.connected).toBe(false);
  expect(result.after).toBe(result.before);
  await mountCity(page);
  await page.evaluate(() => Reflect.get(window, 'cityTestAbort')());
  await expect(page.locator('.project-city')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`city: bounded workspace ${viewport.width}×${viewport.height} keeps edits and notebooks usable`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('./projects/city/');
    const root = page.locator('.project-city[data-workspace="true"]');
    await expect(root).toBeVisible();
    const expectFits = async () => {
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        bodyHeight: document.body.scrollHeight, y: window.scrollY,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dimensions.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(dimensions.bodyHeight).toBeLessThanOrEqual(viewport.height + 1);
      expect(dimensions.y).toBe(0);
    };
    await expectFits();
    for (const selector of ['[data-city-art]', '[data-city-brush]', '[data-city-column]', '[data-city-row]', '[data-city-action="place"]']) {
      const box = await root.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.width).toBeGreaterThan(30);
    }
    await page.getByLabel('Ingredient', { exact: true }).selectOption('road');
    await page.getByLabel('Plot column').selectOption('4');
    await page.getByLabel('Plot row').selectOption({ value: '1' });
    await page.getByRole('button', { name: 'Place Street at E2', exact: true }).click();
    await expect(root.locator('[data-city-cell="12"] > title')).toHaveText('E2 · Street');
    await expect(root.locator('[data-city-road-count]')).toHaveText('25');
    await page.screenshot({ path: testInfo.outputPath(`city-workspace-${viewport.width}x${viewport.height}.png`) });
    await openCityPanel(page, 'Notes');
    await page.getByText('1 building tile has no street frontage · show addresses', { exact: true }).click();
    await page.getByRole('button', { name: 'E8 · Library', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(root.locator('[data-city-map-selection]')).toContainText('E8');
    await openCityPanel(page, 'Guide');
    await page.getByRole('heading', { name: 'A drawing is not a policy', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.locator('.city-caveat')).toContainText('not real urban planning advice');
    await expectFits();
    const scroll = await page.locator('#city-guide-dialog').evaluate(element => element.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    if (viewport.width === 320) await page.screenshot({ path: testInfo.outputPath('city-guide-320x640.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Guide', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
    await expect(root.locator('[data-city-road-count]')).toHaveText('24');
    await page.getByRole('button', { name: '↷ Redo', exact: true }).click();
    await expect(root.locator('[data-city-road-count]')).toHaveText('25');
    await page.mouse.move(20, 110);
    await page.mouse.wheel(0, 700);
    await expectFits();
    await page.getByRole('button', { name: 'Collection menu', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Collection navigation' })).toBeVisible();
  });
}

test('city: a maximum-size imported plan still maps pointer addresses in the compact workspace', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./projects/city/');
  const large = createPlan('A'.repeat(60), 16, 16, Array<TileId>(256).fill('empty'));
  await openCityPanel(page, 'Save');
  const chooserEvent = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Open a saved JSON plan/ }).click();
  await (await chooserEvent).setFiles({
    name: 'large-neighborhood.json', mimeType: 'application/json', buffer: Buffer.from(serializePlan(large)),
  });
  await expect(page.locator('[data-city-export-status]')).toContainText('Opened');
  await closeCityPanel(page);
  await expect(page.getByLabel('Plot column').locator('option')).toHaveCount(16);
  await expect(page.getByLabel('Plot row').locator('option')).toHaveCount(16);
  const tile = page.locator('[data-city-cell="255"] polygon').first();
  await tile.click();
  await expect(page.locator('[data-city-map-selection]')).toHaveText('Selected: P16 · Empty plot');
  await page.getByLabel('Ingredient', { exact: true }).selectOption('library');
  await page.getByRole('button', { name: 'Place Library at P16', exact: true }).click();
  await expect(page.locator('[data-city-cell="255"] > title')).toHaveText('P16 · Library');
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scroll: window.scrollY,
  }))).toEqual({ width: 320, height: 640, scroll: 0 });
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.locator('[data-city-cell="255"] > title')).toHaveText('P16 · Empty plot');
});
