import { expect, test } from '@playwright/test';
import { destinations, watches } from '../../src/projects/weather/data';

const route = './projects/weather/';
const storageKey = 'atlas-impossible-weather.packing.v1';

test('weather opens a rich fictional atlas and every station has its own landscape', async ({ page }) => {
  await page.goto(route);
  const atlas = page.locator('.project-weather');
  await expect(atlas.getByRole('heading', { level: 1 })).toHaveText('Atlas of Impossible Weather');
  await expect(atlas.locator('.weather-fiction-banner')).toContainText('Not live weather.');
  await expect(atlas.getByRole('navigation', { name: 'Destination index' }).getByRole('link')).toHaveCount(6);
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('6');

  const drawings = new Set<string>();
  for (const destination of destinations) {
    const link = atlas.locator(`[data-weather-destination="${destination.id}"]`);
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(atlas.locator('#weather-place-name')).toHaveText(destination.name);
    const scene = atlas.locator('[data-weather-scene]');
    await expect(scene).toHaveAttribute('data-weather-scene', destination.id);
    await expect(scene.locator('desc')).toContainText('fictional landscape');
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
    await atlas.getByRole('radio', { name: `${watch.name} — ${watch.time}`, exact: true }).check();
    const forecast = destinations[0].forecasts[watch.id];
    await expect(atlas.locator('[data-weather-condition]')).toHaveText(forecast.condition);
    await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText(String(forecast.reading));
    await expect(atlas.locator('[data-weather-warmth]')).toHaveText(String(forecast.warmth));
    await expect(atlas.locator('[data-weather-wind]')).toHaveText(String(forecast.wind));
    await expect(atlas.locator('[data-weather-opacity]')).toHaveText(String(forecast.veils));
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-watch', watch.id);
    await expect(atlas.locator('[data-weather-scene]')).toHaveAttribute('data-reading', String(forecast.reading));
    await expect(atlas.locator('[data-weather-field-note]')).toHaveText(forecast.fieldNote);
    await expect(atlas.locator('[data-weather-advice]')).toHaveText(forecast.route);
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

  await atlas.locator('[data-weather-destination="lantern-shelf"]').click();
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

test('weather native keyboard controls and per-station checklists work after reload', async ({ page }) => {
  await page.goto(route);
  const atlas = page.locator('.project-weather');
  const dawn = atlas.getByRole('radio', { name: 'Dawn — 06:00', exact: true });
  await dawn.focus();
  await page.keyboard.press('ArrowRight');
  await expect(atlas.getByRole('radio', { name: 'Noon — 12:00', exact: true })).toBeChecked();
  await expect(atlas.locator('[data-weather-primary-reading]')).toHaveText('11');

  await atlas.getByRole('navigation', { name: 'Atlas sections' }).getByRole('link', { name: 'Packing list' }).click();
  const boots = atlas.locator('[data-weather-pack="boots"]');
  await boots.focus();
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await expect(boots).toBeFocused();
  await page.keyboard.press('Space');
  await expect(boots).toBeChecked();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');

  await atlas.locator('[data-weather-destination="lantern-shelf"]').focus();
  await page.keyboard.press('Enter');
  await expect(atlas.locator('#weather-place-name')).toHaveText('Lantern Shelf');
  await atlas.locator('[data-weather-pack="wrap"]').check();
  await page.reload();
  await expect(atlas.locator('[data-weather-pack="wrap"]')).toBeChecked();
  await atlas.getByRole('button', { name: 'Clear this station’s checklist' }).click();
  await expect(atlas.locator('[data-weather-pack="wrap"]')).not.toBeChecked();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('0 / 4 packed');

  await atlas.locator('[data-weather-destination="pelagic-stair"]').click();
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
    await atlas.locator('[data-weather-destination="' + destination.id + '"]').click();
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

  await atlas.getByRole('navigation', { name: 'Atlas sections' }).getByRole('link', { name: 'Unit key' }).click();
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
  await expect(atlas.locator('[data-weather-storage-status]')).toContainText('older or invalid format');
  await expect(atlas.locator('[data-weather-pack="boots"]')).not.toBeChecked();
  await atlas.locator('[data-weather-pack="boots"]').check();
  await expect(atlas.locator('[data-weather-pack-count]')).toHaveText('1 / 4 packed');
  await expect(atlas.locator('[data-weather-storage-status]')).toContainText('could not save');
  await atlas.locator('[data-weather-destination="glass-orchard"]').click();
  await expect(atlas.locator('#weather-place-name')).toHaveText('The Glass Orchard');
  await atlas.locator('[data-weather-destination="pelagic-stair"]').click();
  await expect(atlas.locator('[data-weather-pack="boots"]')).toBeChecked();
});
