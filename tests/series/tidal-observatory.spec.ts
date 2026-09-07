import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { returnToCollection } from '../helpers/navigation';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';
import {
  CYCLE_SECONDS, MOORING, TIDE_MAX, TIDE_MIN, waterHeight, waterSurfaceHeight,
} from '../../src/projects/tidal-observatory/data';

test.describe('Tidal Observatory', () => {
  test.setTimeout(120_000);

  async function observation(scene: Locator) {
    return scene.evaluate((element: HTMLElement) => ({
      time: Number(element.dataset.sceneTime),
      tide: Number(element.dataset.tide),
      water: Number(element.dataset.waterHeight),
      vessel: Number(element.dataset.floatHeight),
      beacon: Number(element.dataset.beaconAngle),
    }));
  }

  test('the rendered water and vessel share tide and deterministic scene phase', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/tidal-observatory/');
    const scene = page.locator('[data-tidal-scene]');
    await expect(scene).toHaveAttribute('data-ready', 'true');
    await expect(scene.locator('canvas')).toBeVisible();
    const tide = page.getByRole('slider', { name: 'Tide', exact: true });
    await tide.focus();
    await page.keyboard.press('Home');
    await expect(scene).toHaveAttribute('data-tide', String(TIDE_MIN));
    const low = await observation(scene);
    expect(low.water).toBeCloseTo(waterSurfaceHeight(MOORING.x, MOORING.z, low.tide, low.time), 6);
    expect(low.vessel).toBeCloseTo(low.water, 6);

    await page.keyboard.press('End');
    await expect(scene).toHaveAttribute('data-tide', String(TIDE_MAX));
    const high = await observation(scene);
    expect(high.vessel).toBeCloseTo(high.water, 6);
    expect(high.water - low.water).toBeCloseTo(TIDE_MAX - TIDE_MIN, 6);
    expect(high.vessel - low.vessel).toBeCloseTo(TIDE_MAX - TIDE_MIN, 6);
    expect(high.time).toBe(low.time);

    const phase = page.getByRole('slider', { name: 'Scene phase', exact: true });
    await phase.focus();
    await page.keyboard.press('Home');
    await expect(scene).toHaveAttribute('data-scene-time', '0.000000');
    const beginning = await observation(scene);
    await page.keyboard.press('ArrowRight');
    await expect(scene).toHaveAttribute('data-scene-time', '0.100000');
    const advanced = await observation(scene);
    expect(advanced.vessel).toBeCloseTo(advanced.water, 6);
    expect(advanced.water).toBeCloseTo(waterSurfaceHeight(MOORING.x, MOORING.z, advanced.tide, 0.1), 6);
    expect(advanced.beacon).toBeCloseTo(0.1 / CYCLE_SECONDS * Math.PI * 4, 5);
    expect(advanced.water).not.toBe(beginning.water);
    await page.keyboard.press('End');
    await expect(scene).toHaveAttribute('data-scene-time', '24.000000');
    const end = await observation(scene);
    expect(end.water).toBeCloseTo(beginning.water, 6);
    expect(end.vessel).toBeCloseTo(end.water, 6);
    expect(end.beacon).toBeCloseTo(Math.PI * 4, 5);
    expect(waterHeight(-4, 7, TIDE_MAX, 0)).toBeCloseTo(waterHeight(-4, 7, TIDE_MAX, CYCLE_SECONDS), 12);
    await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  });

  test('paused instruments and camera remain responsive without camera drift', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('./projects/tidal-observatory/');
    const scene = page.locator('[data-tidal-scene]');
    const root = page.locator('.project-tidal-observatory');
    await expect(scene).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(root).toHaveAttribute('data-motion', 'paused');
    const heldTime = await scene.getAttribute('data-scene-time');
    const originalCamera = await scene.getAttribute('data-camera');
    await scene.locator('canvas').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scene.getAttribute('data-camera')).not.toBe(originalCamera);
    const orbitedCamera = await scene.getAttribute('data-camera');
    await page.waitForTimeout(160);
    await expect(scene).toHaveAttribute('data-scene-time', heldTime!);
    await expect(scene).toHaveAttribute('data-camera', orbitedCamera!);
    await page.locator('[data-tidal-view="lantern"]').click();
    await expect(page.locator('[data-tidal-view="lantern"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(scene).toHaveAttribute('data-view', 'lantern');
    await expect.poll(() => scene.getAttribute('data-camera')).not.toBe(orbitedCamera);

    await page.getByRole('slider', { name: 'Daylight', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(scene).toHaveAttribute('data-daylight', '0');
    await expect(page.locator('[data-tidal-daylight-output]')).toHaveText('Blue hour');
    await expect(scene).toHaveAttribute('data-scene-time', heldTime!);
    await page.getByRole('button', { name: 'Play animation', exact: true }).click();
    await expect.poll(() => scene.getAttribute('data-scene-time')).not.toBe(heldTime);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
    const reducedTime = await scene.getAttribute('data-scene-time');
    await page.waitForTimeout(160);
    await expect(scene).toHaveAttribute('data-scene-time', reducedTime!);
    await expect(page.locator('[data-tidal-status]')).toContainText('Reduced motion enabled');
  });

  test('375px reduced-motion station fits and releases real graphics resources on exit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const counts = {
        buffers: Number(sessionStorage.getItem('tidal-deleted-buffers') ?? 0),
        programs: Number(sessionStorage.getItem('tidal-deleted-programs') ?? 0),
      };
      Object.defineProperty(window, '__tidalDisposedResources', { value: counts });
      const prototype = WebGL2RenderingContext.prototype;
      const deleteBuffer = prototype.deleteBuffer;
      const deleteProgram = prototype.deleteProgram;
      prototype.deleteBuffer = function (buffer) {
        if (buffer) {
          counts.buffers++;
          sessionStorage.setItem('tidal-deleted-buffers', String(counts.buffers));
        }
        deleteBuffer.call(this, buffer);
      };
      prototype.deleteProgram = function (program) {
        if (program) {
          counts.programs++;
          sessionStorage.setItem('tidal-deleted-programs', String(counts.programs));
        }
        deleteProgram.call(this, program);
      };
    });
    await page.goto('./projects/tidal-observatory/');
    const scene = page.locator('[data-tidal-scene]');
    await expect(scene).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
    const bounds = (await scene.boundingBox())!;
    expect(bounds.y).toBeLessThan(200);
    expect(bounds.width).toBeLessThanOrEqual(375);
    expect(bounds.height).toBeGreaterThan(350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const phase = page.getByRole('slider', { name: 'Scene phase', exact: true });
    expect((await phase.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('slider', { name: 'Tide', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(scene).toHaveAttribute('data-tide', '0.19');
    const snapshot = await observation(scene);
    expect(snapshot.water).toBeCloseTo(snapshot.vessel, 6);
    const before = await page.evaluate(() => (
      window as typeof window & { __tidalDisposedResources: { buffers: number; programs: number } }
    ).__tidalDisposedResources);
    await returnToCollection(page);
    await expect(page.locator('.project-card').first()).toBeVisible();
    await expect(page.locator('[data-tidal-canvas]')).toHaveCount(0);
    await expect(page.locator('.project-tidal-observatory')).toHaveCount(0);
    const after = await page.evaluate(() => (
      window as typeof window & { __tidalDisposedResources: { buffers: number; programs: number } }
    ).__tidalDisposedResources);
    expect(after.buffers).toBeGreaterThan(before.buffers);
    expect(after.programs).toBeGreaterThan(before.programs);
    expect(errors).toEqual([]);
  });

  test('the station resizes within the viewport and its notebook preserves live water readings', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/tidal-observatory/');
    const root = page.locator('.project-tidal-observatory');
    const scene = page.locator('[data-tidal-scene]');
    await expect(scene).toHaveAttribute('data-ready', 'true');
    const heldTime = await scene.getAttribute('data-scene-time');
    for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
      await page.setViewportSize({ width, height });
      await expect(root).toHaveAttribute('data-workspace', 'true');
      await expect.poll(() => root.evaluate(element => Math.round(element.getBoundingClientRect().height))).toBe(height);
      await page.getByRole('slider', { name: 'Tide', exact: true }).focus();
      await page.keyboard.press('End');
      await expect(scene).toHaveAttribute('data-tide', String(TIDE_MAX));
      await expect(scene).toHaveAttribute('data-scene-time', heldTime!);
      const sample = await observation(scene);
      expect(sample.water).toBeCloseTo(sample.vessel, 6);
      await page.getByRole('button', { name: 'Station notebook', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Station notebook', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-tidal-water-output]')).toHaveText(await dialog.locator('[data-tidal-float-output]').textContent() ?? '');
      await dialog.getByRole('button', { name: 'Close Station notebook', exact: true }).click();
      const layout = await root.evaluate(element => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        sceneHeight: element.querySelector('[data-tidal-scene]')!.getBoundingClientRect().height,
      }));
      expect(layout.height).toBeLessThanOrEqual(height);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.sceneHeight).toBeGreaterThan(170);
      await expectWorkspaceViewport(page, width, height);
      expect(await visibleControlProblems(root)).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`tidal-observatory-${width}x${height}.png`) });
    }
  });
});
