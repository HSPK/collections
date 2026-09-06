import { expect, test } from '@playwright/test';
import { arrangements } from '../../src/projects/shadow-play/data';
import { alignment, boundedLamp, fitTable, projectPoint, tablePoint } from '../../src/projects/shadow-play/engine';

test('paper shadows are real ray intersections and each designed alignment is geometric', () => {
  expect(projectPoint({ x: 100, y: 80 }, 100, { x: 0, y: 0, z: 200 })).toEqual({ x: 200, y: 160 });
  expect(projectPoint({ x: 100, y: 80 }, 0, { x: 80, y: 20, z: 200 })).toEqual({ x: 100, y: 80 });
  expect(() => projectPoint({ x: 100, y: 80 }, 200, { x: 0, y: 0, z: 200 })).toThrow(RangeError);
  for (const arrangement of arrangements) {
    const result = alignment(arrangement.objects, arrangement.lamp);
    expect(result.error).toBeLessThan(1e-9);
    expect(result.found).toBe(true);
    expect(alignment(arrangement.objects, arrangement.start).found).toBe(false);
    expect(alignment(arrangement.objects, { ...arrangement.lamp, z: 520 }).found).toBe(false);
    expect(arrangement.objects.every((object) => object.height < 240)).toBe(true);
  }
  expect(boundedLamp({ x: -500, y: 900, z: 12 })).toEqual({ x: 54, y: 564, z: 240 });
  const fit = fitTable(343, 307);
  expect(tablePoint({ x: 188 * fit.scale + fit.x, y: 142 * fit.scale + fit.y }, 343, 307).x).toBeCloseTo(188);
});

test('three paper discoveries respond to pointer position, lamp height, keyboard, and pause', async ({ page }) => {
  await page.routeWebSocket('**', () => {});
  await page.goto('./projects/shadow-play/');
  const site = page.locator('.project-shadow-play');
  const canvas = site.locator('canvas');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(site.getByRole('heading', { level: 1 })).toHaveText('Shadow Play.');
  expect((await canvas.boundingBox())!.y).toBeLessThan(300);
  await page.screenshot({ path: test.info().outputPath('shadow-play-start.png'), fullPage: true });
  for (const arrangement of arrangements) {
    await site.getByRole('button', { name: new RegExp(arrangement.name) }).click();
    await expect(site.locator('[data-alignment]')).toHaveAttribute('data-found', 'false');
    await site.getByRole('button', { name: 'Show lamp guide', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const bounds = (await canvas.boundingBox())!;
    const fit = fitTable(bounds.width, bounds.height);
    await canvas.click({ position: { x: fit.x + arrangement.lamp.x * fit.scale, y: fit.y + arrangement.lamp.y * fit.scale } });
    await expect(site.locator('[data-alignment]')).toHaveAttribute('data-found', 'true');
    await expect(site.locator('[data-message]')).toHaveText(arrangement.revealed);
    await site.getByLabel('Height above table').focus();
    await page.keyboard.press('End');
    await expect(site.locator('[data-alignment]')).toHaveAttribute('data-found', 'false');
  }
  await expect(site.locator('[data-discoveries]')).toHaveText('3 / 3 found');
  await site.getByRole('button', { name: 'Reset lamp', exact: true }).click();
  const previous = await site.locator('[data-x-value]').textContent();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  expect(await site.locator('[data-x-value]').textContent()).not.toEqual(previous);
  await site.getByRole('button', { name: 'Drift light', exact: true }).click();
  await expect(site.getByRole('button', { name: 'Pause light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await site.getByRole('button', { name: 'Pause light', exact: true }).click();
  const paused = await site.locator('[data-x-value]').textContent();
  await page.waitForTimeout(120);
  expect(await site.locator('[data-x-value]').textContent()).toEqual(paused);
  await site.getByRole('button', { name: 'Drift light', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(site.getByRole('button', { name: 'Drift light', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await site.getByLabel('Light rays', { exact: true }).check();
  await site.getByLabel('Dotted tracing', { exact: true }).uncheck();
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('shadow-play-desktop.png'), fullPage: true });
});

test('the light table supports a 375px touch screen and begins still under reduced motion', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.routeWebSocket('**', () => {});
    await page.goto('./projects/shadow-play/');
    const site = page.locator('.project-shadow-play');
    const canvas = site.locator('canvas');
    await expect(site.getByRole('button', { name: 'Drift light', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const bounds = (await canvas.boundingBox())!;
    expect(bounds.y).toBeLessThan(300);
    const fit = fitTable(bounds.width, bounds.height);
    await page.touchscreen.tap(bounds.x + fit.x + 188 * fit.scale, bounds.y + fit.y + 142 * fit.scale);
    await expect(site.locator('[data-alignment]')).toHaveAttribute('data-found', 'true');
    await site.getByLabel('Left / right', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(site.locator('[data-x-value]')).toHaveText('189 mm');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of await site.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('shadow-play-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
