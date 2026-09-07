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
    await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\/\?token=/, () => {});
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
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('.px-import > summary').click();
  });

  test('a delayed file cannot overwrite a newer calibration edit', async ({ page }) => {
    await page.locator('[data-import-file]').setInputFiles(experimentFile(6));
    await expect.poll(() => page.evaluate(() => window.__parallaxPendingReads.length)).toBe(1);
    await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
    await page.getByRole('tab', { name: 'Rig', exact: true }).click();
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
    await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
    await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
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
    await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
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

test('Parallax viewport workspace keeps live geometry and every pane reachable through resizing', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\/\?token=/, () => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/parallax/');
  const root = page.locator('.project-parallax');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.px-space-canvas')).toHaveAttribute('data-render-count', /^[1-9]\d*$/);
  await expect(root).toHaveAttribute('data-workspace', 'true');
  const original = await page.locator('[data-point3d]').getAttribute('data-xyz');
  for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    for (const pane of ['a', 'b', 'space', 'rig', 'inspect']) {
      await page.locator(`[data-tab="${pane}"]`).click();
      await expect(page.locator(`[data-tab="${pane}"]`)).toHaveAttribute('aria-selected', 'true');
      await testInfo.attach(`layout-${width}-${height}-${pane}`, {
        body: Buffer.from(JSON.stringify(await page.locator('.project-parallax, .px-studio, .px-space-panel, .px-space-host, .px-dock, .px-dock-panels').evaluateAll(elements => elements.map(element => {
          const style = getComputedStyle(element);
          return { className: element.className, height: element.clientHeight, scrollHeight: element.scrollHeight, display: style.display, rows: style.gridTemplateRows };
        })))), contentType: 'application/json',
      });
      await expect(page.locator('.px-space-canvas')).toBeInViewport();
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ width, height, x: 0, y: 0 });
      const canvas = await page.locator('.px-space-canvas').boundingBox();
      expect(canvas!.width).toBeGreaterThan(100);
      expect(canvas!.height).toBeGreaterThan(60);
    }
    await page.locator('[data-pixel="b-y"]').fill('110');
    await page.locator('.px-apply').click();
    await expect(page.locator('.px-apply')).toBeInViewport();
    await expect(page.locator('[data-point3d]')).not.toHaveAttribute('data-xyz', original!);
    await page.locator('[data-tab="b"]').click();
    await expect(page.locator('[data-image-overlay="b"]')).toBeInViewport();
    await page.locator('[data-action="undo"]').click();
    await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', original!);
    await page.locator('[data-tab="inspect"]').click();
    await page.locator('.px-inspector').evaluate(element => { element.scrollTop = 0; });
    const capture = testInfo.outputPath(`parallax-workspace-${width}x${height}.png`);
    await page.screenshot({ path: capture });
    await testInfo.attach(`Parallax ${width}x${height}`, { path: capture, contentType: 'image/png' });
    expect(await page.locator('input[data-pixel]').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  }
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Field notebook', exact: true })).toBeVisible();
  await page.locator('[data-action="fit-f"]').click();
  await expect(page.locator('[data-fit-status]')).toContainText('consensus inliers');
  await page.getByText('Open the geometry sheet', { exact: true }).click();
  await page.locator('[data-f-matrix]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-f-matrix]')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Notebook', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
