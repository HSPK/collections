import { expect, test } from '@playwright/test';
import { createExperiment, serialize } from '../../src/projects/parallax/state';

declare global {
  interface Window {
    __parallaxPendingReads: Array<() => void>;
  }
}

function experimentFile(baseline: number) {
  const experiment = createExperiment();
  experiment.calibration.baseline = baseline;
  return {
    name: `parallax-${baseline}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(serialize(experiment)),
  };
}

test.describe('Parallax preserved work and keyboard panes', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.__parallaxPendingReads = [];
      const original = File.prototype.text;
      File.prototype.text = function (this: File) {
        return original.call(this).then((text) => new Promise<string>((resolve) => {
          window.__parallaxPendingReads.push(() => resolve(text));
        }));
      };
    });
    await page.goto('./projects/parallax/');
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    await page.locator('.px-import > summary').click();
  });

  test('a delayed file cannot overwrite a newer calibration edit', async ({ page }) => {
    await page.locator('[data-import-file]').setInputFiles(experimentFile(6));
    await expect.poll(() => page.evaluate(() => window.__parallaxPendingReads.length)).toBe(1);
    await page.getByRole('slider', { name: 'Assumed baseline', exact: true }).focus();
    await page.keyboard.press('End');
    await expect(page.locator('[data-rig="baseline"]')).toHaveValue('8');
    await page.evaluate(() => window.__parallaxPendingReads[0]());
    await expect(page.locator('[data-status]')).toContainText('Import cancelled');
    await expect(page.locator('[data-rig="baseline"]')).toHaveValue('8');
  });

  test('a delayed file preserves uncommitted pixel input', async ({ page }) => {
    await page.locator('[data-import-file]').setInputFiles(experimentFile(6));
    await expect.poll(() => page.evaluate(() => window.__parallaxPendingReads.length)).toBe(1);
    await page.locator('[data-pixel="b-y"]').fill('110');
    await page.evaluate(() => window.__parallaxPendingReads[0]());
    await expect(page.locator('[data-status]')).toContainText('Import cancelled');
    await expect(page.locator('[data-pixel="b-y"]')).toHaveValue('110');
  });

  test('the latest file selection owns its completion', async ({ page }) => {
    await page.locator('[data-import-file]').setInputFiles(experimentFile(6));
    await expect.poll(() => page.evaluate(() => window.__parallaxPendingReads.length)).toBe(1);
    await page.locator('[data-import-file]').setInputFiles(experimentFile(2));
    await expect.poll(() => page.evaluate(() => window.__parallaxPendingReads.length)).toBe(2);
    await page.evaluate(() => window.__parallaxPendingReads[1]());
    await expect(page.locator('[data-rig="baseline"]')).toHaveValue('2');
    await page.evaluate(() => window.__parallaxPendingReads[0]());
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page.locator('[data-rig="baseline"]')).toHaveValue('2');
  });

  test('mobile pane tabs support arrows, Home, End and one tab stop', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const first = page.getByRole('tab', { name: 'View A', exact: true });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    const second = page.getByRole('tab', { name: 'View B', exact: true });
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-image-overlay="b"]')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Inspect', exact: true })).toBeFocused();
    await expect(page.locator('[data-point3d]')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Inspect', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(page.locator('.px-mobile-tabs [tabindex="0"]')).toHaveCount(1);
  });
});
