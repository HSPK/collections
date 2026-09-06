import { expect, test } from '@playwright/test';
import { createRainDrops, INITIAL_RAIN, rainCount, rainHeightAt, RAIN_HEIGHT, RAIN_PERIOD } from '../../src/projects/neon-rain/data';
import { returnToCollection } from '../helpers/navigation';

test.describe('Neon Rain / Vesper Ward', () => {
  test.setTimeout(120_000);

  test('the seeded rain, density, phase and shop lights match rendered state', async ({ page }) => {
    const drops = createRainDrops(1500);
    expect(drops).toEqual(createRainDrops(1500));
    expect(new Set(drops.map((drop) => Math.floor(rainHeightAt(drop, 4.2)))).size).toBeGreaterThan(14);
    for (const drop of drops.slice(0, 25)) {
      expect(rainHeightAt(drop, 0.7)).toBeCloseTo(rainHeightAt(drop, 0.7 + RAIN_PERIOD), 10);
      expect(rainHeightAt(drop, 0.7)).toBeGreaterThanOrEqual(0.18);
      expect(rainHeightAt(drop, 0.7)).toBeLessThan(RAIN_HEIGHT + 0.18);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/neon-rain/');
    const site = page.locator('.project-neon-rain');
    await expect(site).toHaveAttribute('data-ready', 'true');
    const budget = Number(await site.getAttribute('data-rain-budget'));
    expect(budget).toBe(1500);
    await expect(site).toHaveAttribute('data-rain-count', String(rainCount(INITIAL_RAIN, budget)));
    await page.getByRole('slider', { name: 'Rain intensity' }).focus();
    await page.keyboard.press('End');
    await expect(site).toHaveAttribute('data-rain-count', String(budget));
    await page.keyboard.press('Home');
    await expect(site).toHaveAttribute('data-rain-count', '0');
    await expect(site).toHaveAttribute('data-rain-sample-y', 'none');
    await page.keyboard.press('End');
    await expect(site).toHaveAttribute('data-rain-count', String(budget));
    await page.getByRole('slider', { name: 'Rain phase' }).focus();
    await page.keyboard.press('Home');
    await expect(site).toHaveAttribute('data-rain-phase', '0.00000');
    expect(Number(await site.getAttribute('data-rain-sample-y'))).toBeCloseTo(rainHeightAt(drops[0], 0), 4);
    await page.getByRole('slider', { name: 'Light power' }).focus();
    await page.keyboard.press('Home');
    await expect(site).toHaveAttribute('data-light-power', '0.25');
    await expect(site).toHaveAttribute('data-lamp-intensity', '22.50');
    await page.keyboard.press('End');
    await expect(site).toHaveAttribute('data-light-power', '1.50');
    await expect(site).toHaveAttribute('data-lamp-intensity', '135.00');
    await expect(site).toHaveAttribute('data-rain-phase', '0.00000');
  });

  test('a reduced-motion street stays still but keyboard views and manual play work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/neon-rain/');
    const site = page.locator('.project-neon-rain');
    await expect(site).toHaveAttribute('data-ready', 'true');
    await expect(site).toHaveAttribute('data-motion', 'paused');
    await expect(page.getByRole('button', { name: 'Play rain', exact: true })).toBeVisible();
    await page.waitForTimeout(200);
    const frame = await site.getAttribute('data-frame');
    const phase = await site.getAttribute('data-rain-phase');
    await page.waitForTimeout(300);
    await expect(site).toHaveAttribute('data-frame', frame!);
    const canvas = site.locator('canvas');
    await canvas.focus();
    await page.keyboard.press('2');
    await expect(site).toHaveAttribute('data-view', 'arcade');
    await expect(page.getByRole('button', { name: 'Arcade view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const camera = await site.getAttribute('data-camera');
    await page.keyboard.press('ArrowRight');
    await expect(site).not.toHaveAttribute('data-camera', camera!);
    await expect(site).toHaveAttribute('data-rain-phase', phase!);
    await page.keyboard.press('3');
    await expect(site).toHaveAttribute('data-view', 'rooftop');
    await page.getByRole('button', { name: 'Street view', exact: true }).click();
    await expect(site).toHaveAttribute('data-view', 'street');
    await page.getByRole('button', { name: 'Play rain', exact: true }).click();
    await expect(site).toHaveAttribute('data-motion', 'playing');
    await expect(site).not.toHaveAttribute('data-rain-phase', phase!);
    await page.getByRole('button', { name: 'Pause rain', exact: true }).click();
    await expect(site).toHaveAttribute('data-motion', 'paused');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(site).toHaveAttribute('data-motion', 'playing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(site).toHaveAttribute('data-motion', 'paused');
    const held = await site.getAttribute('data-rain-phase');
    const heldFrame = await site.getAttribute('data-frame');
    await page.waitForTimeout(300);
    await expect(site).toHaveAttribute('data-rain-phase', held!);
    await expect(site).toHaveAttribute('data-frame', heldFrame!);
  });

  test('the 375px street fits, has touch controls, and releases its WebGL context on exit', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const remove = HTMLCanvasElement.prototype.remove;
      HTMLCanvasElement.prototype.remove = function () {
        const owned = this.closest('.project-neon-rain') !== null;
        remove.call(this);
        if (owned) sessionStorage.setItem('neon-rain-canvas-disposal', JSON.stringify({
          connected: this.isConnected,
          contextLost: this.getContext('webgl2')?.isContextLost() === true,
        }));
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./projects/neon-rain/');
    const site = page.locator('.project-neon-rain');
    await expect(site).toHaveAttribute('data-ready', 'true');
    await expect(site).toHaveAttribute('data-rain-budget', '640');
    expect(Number(await site.getAttribute('data-pixel-ratio'))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screen = site.locator('[data-project-preview]');
    const bounds = (await screen.boundingBox())!;
    expect(bounds.y).toBeLessThan(200);
    expect(bounds.width).toBeLessThanOrEqual(375);
    expect(bounds.height).toBeGreaterThan(300);
    for (const control of await site.locator('button, input[type="range"]').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const canvas = site.locator('canvas');
    expect(await canvas.evaluate((element) => element instanceof HTMLCanvasElement && Boolean(element.getContext('webgl2')))).toBe(true);
    await returnToCollection(page);
    await expect(site).toHaveCount(0);
    await expect(canvas).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('neon-rain-canvas-disposal') ?? 'null')))
      .toEqual({ connected: false, contextLost: true });
    expect(errors).toEqual([]);
  });
});
