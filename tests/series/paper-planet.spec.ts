import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { LANDMARKS, radialDirection } from '../../src/projects/paper-planet/data';
import { radialFrame } from '../../src/projects/paper-planet/scene';
import { returnToCollection } from '../helpers/navigation';

test('Paper Planet: radial cutouts and journal stops align with the real camera', async ({ page }) => {
  test.setTimeout(120_000);
  for (const point of [...LANDMARKS, { latitude: 90, longitude: 0 }, { latitude: -90, longitude: 172 }, { latitude: -22, longitude: 180 }]) {
    const direction = new THREE.Vector3(...radialDirection(point));
    const frame = radialFrame(point);
    expect(direction.length()).toBeCloseTo(1, 12);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(frame.quaternion).dot(direction)).toBeCloseTo(1, 12);
    expect(frame.position.clone().normalize().dot(direction)).toBeCloseTo(1, 12);
  }
  await page.goto('./projects/paper-planet/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const canvas = page.locator('[data-pp-scene] canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: 'Field journal', exact: true }).click();
  for (const landmark of LANDMARKS) {
    const button = page.locator(`[data-pp-landmark="${landmark.id}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-pp-entry-title]')).toHaveText(landmark.name);
    await expect(canvas).toHaveAttribute('data-selected-landmark', landmark.id);
    await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeGreaterThan(0.99999);
    const projection = (await canvas.getAttribute('data-landmark-projection'))!.split(',').map(Number);
    expect(Math.abs(projection[0])).toBeLessThan(0.0001);
    expect(Math.abs(projection[1])).toBeLessThan(0.0001);
  }
  const before = await canvas.getAttribute('data-camera');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.43, bounds.y + bounds.height * 0.47);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.61, bounds.y + bounds.height * 0.54, { steps: 4 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-camera', before!);
  await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeLessThan(0.99);
  await page.locator('[data-pp-landmark="observatory"]').click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeGreaterThan(0.99999);
});

test('Paper Planet: paused light, scrubbing, keys and motion preference stay functional', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./projects/paper-planet/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const canvas = page.locator('[data-pp-scene] canvas');
  await expect(page.getByRole('button', { name: 'Play breeze', exact: true })).toBeVisible();
  const time = await canvas.getAttribute('data-scene-time');
  const daylight = await canvas.screenshot();
  await page.getByRole('button', { name: 'Dusk', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-light', '0');
  const dusk = await canvas.screenshot();
  expect(dusk.equals(daylight), 'The actual rendered lighting should change while paused.').toBe(false);
  await page.waitForTimeout(150);
  expect((await canvas.screenshot()).equals(dusk), 'A paused frame must not drift.').toBe(true);
  await expect(canvas).toHaveAttribute('data-scene-time', time!);
  const breeze = page.getByRole('slider', { name: 'Breeze cycle', exact: true });
  await breeze.focus();
  await breeze.press('Home');
  await expect(canvas).toHaveAttribute('data-scene-time', '0.0000');
  await breeze.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-scene-time', '0.2400');
  const camera = await canvas.getAttribute('data-camera');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('data-camera', camera!);
  await page.getByRole('button', { name: 'Play breeze', exact: true }).click();
  await expect(canvas).not.toHaveAttribute('data-scene-time', '0.2400');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play breeze', exact: true })).toBeVisible();
  await expect(page.locator('.project-paper-planet')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('button', { name: 'Whole world', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-selected-landmark', 'overview');
  await expect(canvas).toHaveAttribute('data-light', '100');
  await expect(canvas).toHaveAttribute('data-scene-time', '4.3200');
});

test('Paper Planet: a large reduced-motion mobile globe releases its WebGL context', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    const seen = new WeakSet<object>();
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      const extension = Reflect.apply(original, this, [name]);
      if (name === 'WEBGL_lose_context' && extension && !seen.has(extension)) {
        seen.add(extension);
        const lose = extension.loseContext.bind(extension);
        extension.loseContext = () => {
          sessionStorage.setItem('paper-planet-context-releases', String(Number(sessionStorage.getItem('paper-planet-context-releases') ?? 0) + 1));
          lose();
        };
      }
      return extension;
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/paper-planet/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Play breeze', exact: true })).toBeVisible();
  const canvas = page.locator('[data-pp-scene] canvas');
  const bounds = (await canvas.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(330);
  expect(bounds.height).toBeGreaterThan(400);
  expect(bounds.y).toBeLessThan(205);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Field journal', exact: true }).click();
  await page.locator('[data-pp-landmark="lighthouse"]').click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeGreaterThan(0.99999);
  const before = await canvas.getAttribute('data-camera');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(canvas).not.toHaveAttribute('data-camera', before!);
  await returnToCollection(page);
  await expect(page.locator('.project-paper-planet')).toHaveCount(0);
  await expect(page.locator('[data-pp-scene] canvas')).toHaveCount(0);
  expect(await page.evaluate(() => Number(sessionStorage.getItem('paper-planet-context-releases')))).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(errors).toEqual([]);
});

test('Paper Planet: the live atlas and scrollable journal fit every workspace size', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/paper-planet/');
  const site = page.locator('.project-paper-planet');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(site).toHaveAttribute('data-workspace', 'true');
  for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('tab', { name: 'Atmosphere', exact: true }).click();
    await expect.poll(() => site.evaluate(element => Math.round(element.getBoundingClientRect().height))).toBe(height);
    expect(await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    }))).toEqual({ width, height });
    const canvas = site.locator('canvas');
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => Math.abs(element.width / element.height - element.clientWidth / element.clientHeight))).toBeLessThan(0.02);
    for (const name of ['Play breeze', 'Dusk', 'Daylight', 'Whole world']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(await button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    await page.screenshot({ path: testInfo.outputPath(`paper-planet-${width}x${height}.png`) });
    const camera = await canvas.getAttribute('data-camera');
    await page.getByRole('tab', { name: 'Field journal', exact: true }).click();
    await page.locator('[data-pp-landmark="lighthouse"]').click();
    await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeGreaterThan(0.99999);
    await page.getByRole('tab', { name: 'Atmosphere', exact: true }).click();
    await page.getByRole('button', { name: 'Whole world', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-camera', camera!);
    await page.getByRole('button', { name: 'Maker’s note', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Maker’s note', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Maker’s note', exact: true })).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
});
