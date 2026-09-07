import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { destinations, watches } from '../../src/projects/weather/data';

const route = './projects/weather/';
const storageKey = 'atlas-impossible-weather.packing.v1';

async function closeAtlasPanel(page: Page): Promise<void> {
  const dialog = page.locator('.project-weather dialog[open]');
  if (await dialog.count()) await dialog.getByRole('button', { name: /^Close / }).click();
}

async function openAtlasPanel(page: Page, name: string): Promise<void> {
  await closeAtlasPanel(page);
  const trigger = page.getByRole('navigation', { name: 'Atlas sections' }).getByRole('link', { name, exact: true });
  await trigger.click();
  const dialogId = await trigger.getAttribute('aria-controls');
  if (!dialogId) throw new Error(`The ${name} link must identify its dialog.`);
  await expect(page.locator(`#${dialogId}`)).toBeVisible();
}

test('weather opens a rich fictional atlas and every station has its own landscape', async ({ page }) => {
  await page.goto(route);
  const atlas = page.locator('.project-weather');
  await expect(atlas.getByRole('heading', { level: 1 })).toHaveText('Atlas of Impossible Weather');
  await expect(atlas.locator('.weather-fiction-banner')).toContainText('Not live weather.');
  await openAtlasPanel(page, 'Stations');
  await expect(atlas.getByRole('navigation', { name: 'Destination index' }).getByRole('link')).toHaveCount(6);
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('6');

  const drawings = new Set<string>();
  for (const destination of destinations) {
    await openAtlasPanel(page, 'Stations');
    const link = atlas.locator(`[data-weather-destination="${destination.id}"]`);
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(atlas.locator('#weather-place-name')).toHaveText(destination.name);
    const scene = atlas.locator('[data-weather-scene]');
    await expect(scene).toHaveAttribute('data-weather-scene', destination.id);
    await expect(scene.locator('desc')).toContainText('fictional landscape');
    await openAtlasPanel(page, 'Notebook');
    await expect(atlas.locator('[data-weather-field-note]')).toHaveText(destination.forecasts.dawn.fieldNote);
    await expect(atlas.locator('.weather-geography')).toContainText(destination.geography[1]);
    drawings.add(await scene.innerHTML());
  }
  expect(drawings.size).toBe(6);
});

test('weather watches update every reading, diagram, field note, and recommendation together', async ({ page }) => {
  await page.goto(`${route}#weather/pelagic-stair/dawn`);
  const atlas = page.locator('.project-weather');

  for (const watch of watches) {
    await closeAtlasPanel(page);
    await atlas.getByRole('radio', { name: `${watch.name} — ${watch.time}`, exact: true }).check();
    const forecast = destinations[0].forecasts[watch.id];
    await expect(atlas.locator('[data-weather-condition]')).toHaveText(forecast.condition);
    await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText(String(forecast.reading));
    await openAtlasPanel(page, 'Notebook');
    await expect(atlas.locator('[data-weather-warmth]')).toHaveText(String(forecast.warmth));
    await expect(atlas.locator('[data-weather-wind]')).toHaveText(String(forecast.wind));
    await expect(atlas.locator('[data-weather-opacity]')).toHaveText(String(forecast.veils));
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-watch', watch.id);
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-reading', String(forecast.reading));
    await expect(atlas.locator('[data-weather-field-note]')).toHaveText(forecast.fieldNote);
    await expect(atlas.locator('[data-weather-advice]')).toHaveText(forecast.route);
    await openAtlasPanel(page, 'Packing');
    await expect(atlas.locator('[data-weather-packing-advice]')).toContainText(forecast.packingNote);
    const recommendations = await atlas.locator('.weather-kit-item--recommended input').evaluateAll(
      (inputs) => inputs.map((input) => (input as HTMLInputElement).dataset.weatherPack),
    );
    expect(recommendations.sort()).toEqual([...forecast.kit].sort());
  }
});

test('weather deep links, destination browsing, and browser history preserve the watch', async ({ page }) => {
  await page.goto(`${route}#weather/umbra-marsh/night`);
  const atlas = page.locator('.project-weather');
  await expect(atlas.locator('#weather-place-name')).toHaveText('Umbra Marsh');
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('16');
  await expect(atlas.getByRole('radio', { name: 'Night watch — 23:00', exact: true })).toBeChecked();

  await atlas.getByLabel('Choose a station', { exact: true }).selectOption('lantern-shelf');
  await expect(page).toHaveURL(/#weather\/lantern-shelf\/night\/station$/);
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('18');
  await atlas.getByRole('radio', { name: 'Noon — 12:00', exact: true }).check();
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('1');

  await page.goBack();
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('18');
  await page.goBack();
  await expect(atlas.locator('#weather-place-name')).toHaveText('Umbra Marsh');
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('16');
  await page.goForward();
  await expect(atlas.locator('#weather-place-name')).toHaveText('Lantern Shelf');
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('18');
});

for (const fragment of ['', '#weather/pelagic-stair/noon']) {
  test(`weather sectionless history closes stale panels: ${fragment || 'initial route'}`, async ({ page }) => {
    await page.goto(`${route}${fragment}`);
    const original = page.url();
    await openAtlasPanel(page, 'Packing');
    await page.locator('[data-weather-pack="boots"]').check();
    const dialog = page.getByRole('dialog', { name: 'Packing list', exact: true });
    await page.goBack();
    await expect(page).toHaveURL(original);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.project-weather dialog[open]')).toHaveCount(0);
    const watch = page.getByRole('radio', { name: fragment ? 'Noon — 12:00' : 'Dawn — 06:00', exact: true });
    await expect(watch).toBeChecked();
    await page.goForward();
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-weather-pack="boots"]')).toBeChecked();
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    await watch.focus();
    await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    await expect(watch).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('weather native keyboard controls and per-station checklists work after reload', async ({ page }) => {
  await page.goto(route);
  const atlas = page.locator('.project-weather');
  const dawn = atlas.getByRole('radio', { name: 'Dawn — 06:00', exact: true });
  await dawn.focus();
  await page.keyboard.press('ArrowRight');
  await expect(atlas.getByRole('radio', { name: 'Noon — 12:00', exact: true })).toBeChecked();
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('11');

  await openAtlasPanel(page, 'Packing');
  const boots = atlas.locator('[data-weather-pack="boots"]');
  await boots.focus();
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await expect(boots).toBeFocused();
  await page.keyboard.press('Space');
  await expect(boots).toBeChecked();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');

  await openAtlasPanel(page, 'Stations');
  const lantern = atlas.locator('[data-weather-destination="lantern-shelf"]');
  await lantern.focus();
  await expect(lantern).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(atlas.locator('#weather-place-name')).toHaveText('Lantern Shelf');
  await openAtlasPanel(page, 'Packing');
  await atlas.locator('[data-weather-pack="wrap"]').check();
  await page.reload();
  await expect(atlas.locator('[data-weather-pack="wrap"]')).toBeChecked();
  await atlas.getByRole('button', { name: 'Clear this station’s checklist' }).click();
  await expect(atlas.locator('[data-weather-pack="wrap"]')).not.toBeChecked();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('0 / 4 packed');

  await closeAtlasPanel(page);
  await atlas.getByLabel('Choose a station', { exact: true }).selectOption('pelagic-stair');
  await openAtlasPanel(page, 'Packing');
  await expect(atlas.locator('[data-weather-pack="boots"]')).toBeChecked();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(stored).toEqual({ version: 1, packed: { 'pelagic-stair': ['boots'] } });
});

test('weather has a usable 375px layout and a persistent fiction notice', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  const atlas = page.locator('.project-weather');

  for (const destination of destinations) {
    await atlas.getByLabel('Choose a station', { exact: true }).selectOption(destination.id);
    await atlas.getByRole('radio', { name: 'Night watch — 23:00', exact: true }).check();
    await expect(atlas.locator('#weather-place-name')).toHaveText(destination.name);
    await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText(String(destination.forecasts.night.reading));
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
    const scene = await atlas.locator('[data-weather-scene]').boundingBox();
    expect(scene?.width).toBeGreaterThan(300);
    const radio = await atlas.getByRole('radio', { name: 'Night watch — 23:00', exact: true }).boundingBox();
    expect(radio?.height).toBeGreaterThanOrEqual(44);
  }

  await openAtlasPanel(page, 'Units');
  const banner = await atlas.locator('.weather-fiction-banner').boundingBox();
  expect(banner?.y).toBeGreaterThanOrEqual(0);
  expect(banner?.y).toBeLessThan(3);
  await expect(atlas.locator('.weather-units')).toContainText('none is calibrated for Earth');
});

test('weather rejects stale checklists and keeps working when local saving is blocked', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 0, packed: { 'pelagic-stair': ['boots'] } }));
    Storage.prototype.setItem = () => { throw new DOMException('Storage is unavailable', 'QuotaExceededError'); };
  }, storageKey);
  await page.goto(route);
  const atlas = page.locator('.project-weather');
  await openAtlasPanel(page, 'Packing');
  await expect(atlas.locator('[data-weather-storage-status]')).toContainText('older or invalid format');
  await expect(atlas.locator('[data-weather-pack="boots"]')).not.toBeChecked();
  await atlas.locator('[data-weather-pack="boots"]').check();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');
  await expect(atlas.locator('[data-weather-storage-status]')).toContainText('could not save');
  await closeAtlasPanel(page);
  await atlas.getByLabel('Choose a station', { exact: true }).selectOption('glass-orchard');
  await expect(atlas.locator('#weather-place-name')).toHaveText('The Glass Orchard');
  await atlas.getByLabel('Choose a station', { exact: true }).selectOption('pelagic-stair');
  await openAtlasPanel(page, 'Packing');
  await expect(atlas.locator('[data-weather-pack="boots"]')).toBeChecked();
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`weather bounded workspace ${viewport.width}×${viewport.height} keeps the live chart and reference usable`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(route);
    const atlas = page.locator('.project-weather[data-workspace="true"]');
    await expect(atlas).toBeVisible();
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
    await atlas.getByLabel('Choose a station', { exact: true }).selectOption('umbra-marsh');
    await atlas.getByRole('radio', { name: 'Night watch — 23:00', exact: true }).check();
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-watch', 'night');
    await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('16');
    for (const selector of ['[data-weather-scene]', '[data-weather-primary-reading]', '[data-weather-station-select]', '.weather-watch-grid']) {
      const box = await atlas.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.height).toBeGreaterThan(20);
    }
    await expectFits();
    await page.screenshot({ path: testInfo.outputPath(`weather-workspace-${viewport.width}x${viewport.height}.png`) });
    await openAtlasPanel(page, 'Notebook');
    const otherWatches = atlas.getByText('Read the other three watches', { exact: false });
    await otherWatches.click();
    await expect(atlas.locator('.weather-other-logs')).toHaveAttribute('open', '');
    await expectFits();
    if (viewport.width === 320) await page.screenshot({ path: testInfo.outputPath('weather-notebook-320x640.png') });
    await atlas.locator('.weather-other-logs a').first().click();
    await expect(page.locator('.project-weather dialog[open]')).toHaveCount(0);
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-watch', 'dawn');
    await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText(String(destinations.find(destination => destination.id === 'umbra-marsh')!.forecasts.dawn.reading));
    await openAtlasPanel(page, 'Packing');
    const checkbox = atlas.locator('[data-weather-pack]').first();
    await checkbox.check();
    await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Packing list', exact: true })).toBeVisible();
    await expect(atlas.locator('[data-weather-pack]').first()).toBeChecked();
    await expectFits();
    await openAtlasPanel(page, 'Units');
    await atlas.locator('.weather-unit-row').last().scrollIntoViewIfNeeded();
    expect(await atlas.locator('#weather-units-dialog').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expectFits();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Units', exact: true })).toBeFocused();
    await page.mouse.move(15, 110);
    await page.mouse.wheel(0, 700);
    await expectFits();
    await page.getByRole('button', { name: 'Collection menu', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Collection navigation' })).toBeVisible();
  });
}
