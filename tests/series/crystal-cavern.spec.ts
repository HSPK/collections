import { expect, test } from '@playwright/test';
import { createCrystalGeometry } from '../../src/projects/crystal-cavern/scene';
import { pulseAtPhase, resolveMineralLighting } from '../../src/projects/crystal-cavern/engine';
import { CLUSTERS } from '../../src/projects/crystal-cavern/data';
import { returnToCollection } from '../helpers/navigation';

test('Crystal Cavern: irregular hexagonal crystals are closed and mineral light is deterministic', () => {
  for (const seed of [1, 390, 391, 392, 393]) {
    const geometry = createCrystalGeometry(seed);
    const repeat = createCrystalGeometry(seed);
    try {
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      expect(positions.count).toBe(72);
      expect(Array.from(positions.array)).toEqual(Array.from(repeat.getAttribute('position').array));
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(geometry.boundingBox?.min.y).toBe(0);
      expect(geometry.boundingBox?.max.y).toBe(1);
      const point = (i: number) => `${positions.getX(i)},${positions.getY(i)},${positions.getZ(i)}`;
      const edges = new Map<string, number>();
      const base = new Set<string>();
      const shoulders = new Set<string>();
      const tips = new Set<string>();
      const baseRadii = new Set<string>();
      let widestBase = 0;
      let widestShoulder = 0;
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) === 0 && Math.hypot(positions.getX(i), positions.getZ(i)) > 0.01) {
          base.add(point(i));
          baseRadii.add(Math.hypot(positions.getX(i), positions.getZ(i)).toFixed(4));
          widestBase = Math.max(widestBase, Math.hypot(positions.getX(i), positions.getZ(i)));
        }
        if (positions.getY(i) > 0 && positions.getY(i) < 1) {
          shoulders.add(point(i));
          widestShoulder = Math.max(widestShoulder, Math.hypot(positions.getX(i), positions.getZ(i)));
        }
        if (positions.getY(i) === 1) tips.add(point(i));
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
      }
      for (let i = 0; i < positions.count; i += 3) {
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const key = [point(i + a), point(i + b)].sort().join('|');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect(base.size).toBe(6);
      expect(shoulders.size).toBe(6);
      expect(widestShoulder).toBeLessThan(widestBase);
      expect(baseRadii.size).toBeGreaterThan(3);
      expect(tips.size).toBe(1);
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
    } finally {
      geometry.dispose();
      repeat.dispose();
    }
  }
  expect(CLUSTERS).toHaveLength(22);
  expect(CLUSTERS.reduce((sum, cluster) => sum + cluster.count, 0)).toBeGreaterThan(140);
  expect(pulseAtPhase(0)).toBeCloseTo(pulseAtPhase(1), 12);
  expect(pulseAtPhase(0.25)).toBeCloseTo(1, 12);
  expect(pulseAtPhase(0.75)).toBeCloseTo(0.82, 12);
  const low = resolveMineralLighting('opal', 25, 0.18);
  const high = resolveMineralLighting('opal', 150, 0.18);
  expect(high.emission).toBeGreaterThan(low.emission);
  expect(high.pointIntensity).toBeGreaterThan(low.pointIntensity);
  expect(low.keyIntensity).toBeGreaterThan(1.7);
  expect(resolveMineralLighting('amber', 85, 0.18).colors).not.toEqual(resolveMineralLighting('cyan', 85, 0.18).colors);
  expect(resolveMineralLighting('opal', 85, 0.18)).toEqual(resolveMineralLighting('opal', 85, 0.18));
});

test('Crystal Cavern: paused views, mineral lighting and direct exploration change the real scene', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/crystal-cavern/');
  const scene = page.locator('[data-cavern-scene]');
  await expect(scene).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Crystal Cavern', exact: true })).toBeVisible();
  await expect(scene).toHaveAttribute('data-cluster-count', '22');
  await expect(scene).toHaveAttribute('data-crystal-triangles', '24');
  const canvas = scene.locator('canvas');
  await expect(canvas).toBeVisible();
  expect(Number(await scene.getAttribute('data-crystal-count'))).toBeGreaterThan(140);
  await expect(page.getByRole('button', { name: 'Play mineral light', exact: true })).toBeVisible();
  const originalCamera = await scene.getAttribute('data-camera');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Upper passage', exact: false }).click();
  await expect(scene).toHaveAttribute('data-view', 'passage');
  await expect(scene).not.toHaveAttribute('data-camera', originalCamera!);
  await expect(page.locator('[data-view-caption]')).toContainText('raised passage');
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Crystal grove', exact: false }).click();
  await expect(scene).toHaveAttribute('data-view', 'grove');
  await expect(page.getByRole('button', { name: 'Crystal grove', exact: false })).toHaveAttribute('aria-pressed', 'true');
  const originalColor = await scene.getAttribute('data-crystal-color');
  await page.getByLabel('Light palette', { exact: true }).selectOption('amber');
  await expect(scene).toHaveAttribute('data-mineral', 'amber');
  await expect(scene).not.toHaveAttribute('data-crystal-color', originalColor!);
  await expect(page.locator('[data-mineral-note]')).toContainText('Warm seams');
  const emission = Number(await scene.getAttribute('data-emission'));
  const pointIntensity = Number(await scene.getAttribute('data-light-intensity'));
  const luminance = page.getByRole('slider', { name: 'Mineral luminance' });
  await luminance.focus();
  await page.keyboard.press('End');
  await expect(luminance).toHaveValue('150');
  expect(Number(await scene.getAttribute('data-emission'))).toBeGreaterThan(emission);
  expect(Number(await scene.getAttribute('data-light-intensity'))).toBeGreaterThan(pointIntensity);
  const cameraBeforeKey = await scene.getAttribute('data-camera');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(scene).not.toHaveAttribute('data-camera', cameraBeforeKey!);
  const cameraBeforeDrag = await scene.getAttribute('data-camera');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.51, { steps: 3 });
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute('data-camera', cameraBeforeDrag!);
  const held = await scene.getAttribute('data-phase');
  const heldFrame = await canvas.screenshot();
  await page.waitForTimeout(200);
  await expect(scene).toHaveAttribute('data-phase', held!);
  expect((await canvas.screenshot()).equals(heldFrame)).toBe(true);
  await page.getByRole('button', { name: 'Play mineral light', exact: true }).click();
  await expect.poll(() => scene.getAttribute('data-phase')).not.toBe(held);
  const cycle = page.getByRole('slider', { name: 'Light cycle', exact: true });
  await cycle.focus();
  await page.keyboard.press('Home');
  await expect(scene).toHaveAttribute('data-phase', '0.000000');
  await expect(page.getByRole('button', { name: 'Play mineral light', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Crystal Cavern: 375px reduced motion stays still and leaving releases its WebGL context', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const remove = HTMLCanvasElement.prototype.remove;
    HTMLCanvasElement.prototype.remove = function () {
      const owned = this.closest('.project-crystal-cavern') !== null;
      remove.call(this);
      if (owned) sessionStorage.setItem('crystal-cavern-canvas-disposal', JSON.stringify({
        connected: this.isConnected,
        contextLost: this.getContext('webgl2')?.isContextLost() === true,
      }));
    };
  });
  await page.goto('./projects/crystal-cavern/');
  const scene = page.locator('[data-cavern-scene]');
  await expect(scene).toHaveAttribute('data-ready', 'true');
  await expect(scene).toHaveAttribute('data-budget', 'compact');
  await expect(scene).toHaveAttribute('data-mote-count', '44');
  await expect(scene).toHaveAttribute('data-motion', 'paused');
  expect(Number(await scene.getAttribute('data-crystal-count'))).toBeGreaterThan(90);
  const box = (await scene.boundingBox())!;
  expect(box.y).toBeLessThan(200);
  expect(box.height).toBeGreaterThan(400);
  expect(box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const labelSizes = await page.locator('.project-crystal-cavern').locator(
    'p, label, button, select, small, output, [data-phase-time], .cavern-eyebrow, .cavern-contour span, .cavern-view-label div > span',
  ).evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...labelSizes)).toBeGreaterThanOrEqual(12);
  for (const control of await page.locator('.project-crystal-cavern input[type="range"]').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const canvas = scene.locator('canvas');
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.getBoundingClientRect().width)).toBeLessThanOrEqual(1.01);
  const initialPhase = await scene.getAttribute('data-phase');
  await page.waitForTimeout(200);
  await expect(scene).toHaveAttribute('data-phase', initialPhase!);
  await page.getByRole('slider', { name: 'Mist density' }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-mist-output]')).toHaveText('100%');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(scene).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('button', { name: 'Play mineral light', exact: true }).click();
  await expect.poll(() => scene.getAttribute('data-phase')).not.toBe(initialPhase);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(scene).toHaveAttribute('data-motion', 'paused');
  const held = await scene.getAttribute('data-phase');
  await page.waitForTimeout(200);
  await expect(scene).toHaveAttribute('data-phase', held!);
  await expect(canvas).toHaveCount(1);
  await returnToCollection(page);
  await expect(page.locator('.project-crystal-cavern')).toHaveCount(0);
  await expect(canvas).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('crystal-cavern-canvas-disposal') ?? 'null')))
    .toEqual({ connected: false, contextLost: true });
  expect(errors).toEqual([]);
});
