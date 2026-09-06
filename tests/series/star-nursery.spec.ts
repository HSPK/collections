import { expect, test } from '@playwright/test';
import { DEFAULT_SEED, PRESETS } from '../../src/projects/star-nursery/data';
import type { Point3 } from '../../src/projects/star-nursery/data';
import { advancePhase, createNursery, MAX_BUDGET, transformParticle } from '../../src/projects/star-nursery/engine';
import type { ParticleLayer } from '../../src/projects/star-nursery/engine';

function at(values: Float32Array, index: number): Point3 {
  return [values[index * 3]!, values[index * 3 + 1]!, values[index * 3 + 2]!];
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('stellar volumes are deterministic, deep, distinct, and bounded under shaping', () => {
  const clouds: ParticleLayer[] = [];
  for (const preset of PRESETS) {
    const budget = { dust: 192, volume: 48, shadow: 12, field: 32 };
    const geometry = createNursery(preset.id, DEFAULT_SEED, budget);
    clouds.push(geometry.dust);
    expect(createNursery(preset.id, DEFAULT_SEED, budget).dust.position).toEqual(geometry.dust.position);
    expect(createNursery(preset.id, DEFAULT_SEED + 1, budget).dust.position).not.toEqual(geometry.dust.position);
    for (const particles of Object.values(geometry)) {
      for (const values of Object.values(particles) as Float32Array[]) {
        expect(values.every(Number.isFinite)).toBe(true);
      }
    }
    const z = Array.from({ length: geometry.dust.size.length }, (_, i) => geometry.dust.position[i * 3 + 2]!);
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(2);

    let looseDistance = 0;
    let formedDistance = 0;
    let windDistance = 0;
    for (let i = 0; i < 32; i++) {
      const point = at(geometry.dust.position, i);
      const anchor = at(geometry.dust.anchor, i);
      const phase = geometry.dust.phase[i]!;
      const loose = transformParticle(point, anchor, phase, { formation: 0, wind: 0, phase: 0.7 });
      const formed = transformParticle(point, anchor, phase, { formation: 1, wind: 0, phase: 0.7 });
      const dispersed = transformParticle(point, anchor, phase, { formation: 0, wind: 1, phase: 0.7 });
      looseDistance += distance(loose, anchor);
      formedDistance += distance(formed, anchor);
      windDistance += distance(dispersed, anchor);
      for (const result of [loose, formed, dispersed]) {
        expect(result.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...result)).toBeLessThan(13);
      }
    }
    expect(formedDistance).toBeLessThan(looseDistance * 0.65);
    expect(windDistance).toBeGreaterThan(looseDistance * 1.25);
  }
  for (let i = 0; i < clouds.length; i++) {
    for (let j = i + 1; j < clouds.length; j++) {
      const meanDifference = Array.from({ length: 32 }, (_, point) =>
        distance(at(clouds[i]!.position, point), at(clouds[j]!.position, point)),
      ).reduce((sum, value) => sum + value, 0) / 32;
      expect(meanDifference).toBeGreaterThan(1.2);
    }
  }
  const shell = clouds[2]!;
  expect(Array.from({ length: shell.size.length }, (_, i) => Math.hypot(...at(shell.position, i))).every((radius) => radius > 1.2)).toBe(true);
  const capped = createNursery('cradle', DEFAULT_SEED, { dust: MAX_BUDGET.dust + 20, volume: -1, shadow: 0, field: 0 });
  expect(capped.dust.size.length).toBe(MAX_BUDGET.dust);
  expect(capped.volume.size.length).toBe(0);
  expect(advancePhase(0.75, 0.05, true)).toBe(0.75);
  expect(advancePhase(0.75, 50)).toBeCloseTo(advancePhase(0.75, 0.05), 12);
  expect(advancePhase(Math.PI * 2 - 0.001, 0.05)).toBeLessThan(0.01);
  expect(Number.isFinite(advancePhase(NaN, Infinity))).toBe(true);
});

test('the canvas responds to geometry controls and camera while pause freezes all drift', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|Shader Error|star-nursery/.test(message.text())) errors.push(message.text());
  });
  await page.goto('./projects/star-nursery/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const root = page.locator('.project-star-nursery');
  const canvas = root.locator('canvas');
  await expect(page.getByRole('heading', { name: 'Star Nursery', exact: true })).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const still = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect(await canvas.screenshot()).toEqual(still);

  const formation = page.getByLabel('Formation', { exact: true });
  await formation.focus();
  await formation.press('End');
  await expect(formation).toHaveValue('100');
  expect(await canvas.screenshot()).not.toEqual(still);
  await page.getByRole('button', { name: /Twin seeds Two clouds/ }).click();
  await expect(root).toHaveAttribute('data-preset', 'binary');
  const twin = await canvas.screenshot();
  await page.getByRole('button', { name: 'Reseed dust arrangement' }).click();
  expect(await canvas.screenshot()).not.toEqual(twin);

  await canvas.focus();
  const front = await canvas.screenshot();
  await canvas.press('ArrowRight');
  expect(await canvas.screenshot()).not.toEqual(front);
  await page.getByRole('button', { name: 'Play animation' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  const moving = await canvas.screenshot();
  await page.waitForTimeout(400);
  expect(await canvas.screenshot()).not.toEqual(moving);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  const paused = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect(await canvas.screenshot()).toEqual(paused);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
  await page.getByRole('button', { name: /Return to the first cloud/ }).click();
  await expect(root).toHaveAttribute('data-preset', 'cradle');
  await expect(formation).toHaveValue('34');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  expect(errors).toEqual([]);
});

test.describe('small-screen observatory', () => {
  test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });

  test('375 px touch controls, reduced motion, keyboard playback, and abort cleanup work', async ({ page }) => {
    await page.goto('./projects/star-nursery/');
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator('.project-star-nursery');
    const canvas = root.locator('canvas');
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(canvas).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const renderRatio = await canvas.evaluate((element) => {
      const view = element as HTMLCanvasElement;
      return view.width / view.getBoundingClientRect().width;
    });
    expect(renderRatio).toBeGreaterThan(1);
    expect(renderRatio).toBeLessThanOrEqual(1.25);
    const targets = await root.locator('button, input[type="range"]').evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height));
    expect(targets.every((height) => height >= 40)).toBe(true);
    await page.getByRole('button', { name: /Open shell A hollow/ }).tap();
    await expect(root).toHaveAttribute('data-preset', 'shell');
    const wind = page.getByLabel('Stellar wind', { exact: true });
    await wind.focus();
    await wind.press('Home');
    await wind.press('ArrowRight');
    await expect(wind).toHaveValue('1');
    await canvas.focus();
    await canvas.press('Space');
    await expect(root).toHaveAttribute('data-motion', 'playing');
    await canvas.press('Space');
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(page.getByText('Illustrative, not an astrophysics model.', { exact: true })).toBeVisible();

    const cleanup = await page.evaluate(async () => {
      const source = '/src/projects/star-nursery/index.ts';
      const project = await import(source);
      const host = document.createElement('div');
      document.body.append(host);
      const controller = new AbortController();
      const instance = project.mount({
        container: host,
        controls: document.createElement('div'),
        signal: controller.signal,
        reducedMotion: true,
        report: () => {},
      });
      const created = host.querySelectorAll('canvas').length;
      controller.abort();
      instance.destroy();
      instance.destroy();
      const remaining = host.childElementCount;
      host.remove();
      return { created, remaining };
    });
    expect(cleanup).toEqual({ created: 1, remaining: 0 });
    expect(await root.locator('canvas').count()).toBe(1);
  });
});
