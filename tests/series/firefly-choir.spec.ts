import { expect, test } from '@playwright/test';
import {
  BASE_FREQUENCY,
  ChoirEngine,
  flashLevel,
  MAX_CANDIDATES,
  MAX_FIREFLIES,
  MEADOW,
  MIN_FIREFLIES,
  phaseCoherence,
  TAU,
} from '../../src/projects/firefly-choir/engine';

test('local coupling synchronizes seeded clocks with bounded finite neighborhoods', () => {
  const uncoupled = new ChoirEngine({ seed: 43017, count: 160, coupling: 0, breeze: 0 });
  const coupled = new ChoirEngine({ seed: 43017, count: 160, coupling: 4.5, breeze: 0 });
  expect(coupled.fireflies).toEqual(uncoupled.fireflies);
  for (let step = 0; step < 400; step += 1) {
    uncoupled.step(0.05);
    coupled.step(0.05);
  }
  expect(coupled.coherence).toBeGreaterThan(0.8);
  expect(coupled.coherence - uncoupled.coherence).toBeGreaterThan(0.5);
  expect(phaseCoherence([{ phase: 0 }, { phase: Math.PI }])).toBeCloseTo(0);
  expect(phaseCoherence([{ phase: 1 }, { phase: 1 }])).toBeCloseTo(1);
  expect(flashLevel(0)).toBe(1);
  expect(flashLevel(Math.PI)).toBe(0);

  for (const firefly of coupled.fireflies) {
    expect(Object.values(firefly).every(Number.isFinite)).toBe(true);
    expect(firefly.x).toBeGreaterThanOrEqual(MEADOW.left);
    expect(firefly.x).toBeLessThanOrEqual(MEADOW.right);
    expect(firefly.y).toBeGreaterThanOrEqual(MEADOW.top);
    expect(firefly.y).toBeLessThanOrEqual(MEADOW.bottom);
    expect(firefly.phase).toBeGreaterThanOrEqual(0);
    expect(firefly.phase).toBeLessThan(TAU);
  }
  const held = coupled.fireflies.map((firefly) => ({ ...firefly }));
  const heldTime = coupled.time;
  coupled.step(0);
  coupled.step(Number.NaN);
  expect(coupled.fireflies).toEqual(held);
  expect(coupled.time).toBe(heldTime);

  const local = new ChoirEngine({ count: MIN_FIREFLIES, coupling: 5, breeze: 0 });
  for (const firefly of local.fireflies) {
    Object.assign(firefly, { x: 0.2, y: 0.5, vx: 0, vy: 0, phase: 0, frequency: BASE_FREQUENCY });
  }
  const nearby = local.fireflies[0];
  const isolated = local.fireflies[local.fireflies.length - 1];
  nearby.phase = Math.PI / 2;
  isolated.x = 0.85;
  isolated.phase = Math.PI / 2;
  local.step(0.05);
  expect(nearby.phase).toBeLessThan(Math.PI / 2 + BASE_FREQUENCY * 0.05 - 0.1);
  expect(isolated.phase).toBeCloseTo(Math.PI / 2 + BASE_FREQUENCY * 0.05, 10);

  const torchOff = new ChoirEngine({ count: MIN_FIREFLIES, coupling: 0, breeze: 0 });
  const torchOn = new ChoirEngine({ count: MIN_FIREFLIES, coupling: 0, breeze: 0 });
  for (const engine of [torchOff, torchOn]) {
    for (const firefly of engine.fireflies) {
      Object.assign(firefly, { x: 0.85, y: 0.5, vx: 0, vy: 0, phase: Math.PI / 2, frequency: BASE_FREQUENCY });
    }
    engine.fireflies[0].x = 0.4;
  }
  torchOn.setTorch(0.45, 0.5, true);
  torchOff.step(0.05);
  torchOn.step(0.05);
  expect(torchOn.fireflies[0].phase).toBeLessThan(torchOff.fireflies[0].phase - 0.1);
  expect(torchOn.fireflies[0].vx).toBeGreaterThan(torchOff.fireflies[0].vx);
  expect(torchOn.fireflies[1].phase).toBeCloseTo(torchOff.fireflies[1].phase, 10);

  const dense = new ChoirEngine({ count: 10000 });
  expect(dense.fireflies).toHaveLength(MAX_FIREFLIES);
  for (const firefly of dense.fireflies) { firefly.x = 0.5; firefly.y = 0.5; }
  dense.step(0.05);
  expect(dense.candidateChecks).toBeGreaterThan(0);
  expect(dense.candidateChecks).toBeLessThanOrEqual(MAX_FIREFLIES * MAX_CANDIDATES);
  expect(dense.fireflies.every((firefly) => Object.values(firefly).every(Number.isFinite))).toBe(true);
  dense.setCount(-100);
  expect(dense.fireflies).toHaveLength(MIN_FIREFLIES);
  for (const engine of [uncoupled, coupled, local, dense, torchOff, torchOn]) engine.dispose();
});

test('garden controls, torch, reset and playback update the real canvas', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./projects/firefly-choir/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const root = page.locator('.project-firefly-choir');
  const garden = page.getByRole('group', { name: 'Interactive firefly garden' });
  const canvas = garden.locator('canvas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Firefly Choir✳');
  await expect(garden).toHaveAttribute('data-project-preview', '');
  await expect(garden).toHaveAttribute('data-particle-count', '160');
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const color = element.getContext('2d')!.getImageData(Math.floor(element.width / 2), Math.floor(element.height * 0.4), 1, 1).data;
    return color[1];
  })).toBeGreaterThan(15);
  await expect.poll(async () => Number(await garden.getAttribute('data-simulation-time'))).toBeGreaterThan(0.1);

  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const pausedTime = await garden.getAttribute('data-simulation-time');
  const frozen = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const agreement = await root.locator('[data-coherence]').textContent();
  await page.waitForTimeout(300);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(frozen);
  await expect(garden).toHaveAttribute('data-simulation-time', pausedTime!);
  await expect(root.locator('[data-coherence]')).toHaveText(agreement!);
  await page.setViewportSize({ width: 1260, height: 1000 });
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const color = element.getContext('2d')!.getImageData(Math.floor(element.width / 2), Math.floor(element.height * 0.4), 1, 1).data;
    return color[1];
  })).toBeGreaterThan(15);
  await expect(garden).toHaveAttribute('data-simulation-time', pausedTime!);

  await page.getByLabel('Firefly count', { exact: true }).press('End');
  await expect(garden).toHaveAttribute('data-particle-count', '280');
  await page.getByLabel('Neighbor coupling', { exact: true }).press('Home');
  await expect(root.locator('[data-coupling-output]')).toHaveText('0.0');
  await page.getByLabel('Breeze', { exact: true }).press('Home');
  await expect(root.locator('[data-breeze-output]')).toHaveText('West · 100%');

  await page.getByRole('button', { name: 'Enable torch', exact: true }).click();
  await garden.press('ArrowRight');
  await expect(garden).toHaveAttribute('data-torch', 'on');
  await expect(garden).toHaveAttribute('data-torch-x', '0.555');
  const bounds = (await garden.boundingBox())!;
  await garden.click({ position: { x: bounds.width * 0.36, y: bounds.height * 0.6 } });
  await expect(garden).toHaveAttribute('data-torch-x', '0.360');
  await expect(garden).toHaveAttribute('data-simulation-time', pausedTime!);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(frozen);
  await garden.press('t');
  await expect(page.getByRole('button', { name: 'Enable torch', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Scatter phases', exact: true }).click();
  await expect(root.locator('[data-status]')).toContainText('clocks are scattered');
  await page.getByRole('button', { name: 'Begin again' }).click();
  await expect(garden).toHaveAttribute('data-particle-count', '160');
  await expect(garden).toHaveAttribute('data-simulation-time', '0.000');
  await expect(page.getByLabel('Neighbor coupling', { exact: true })).toHaveValue('2.8');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await testInfo.attach('night-garden-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect.poll(async () => Number(await garden.getAttribute('data-simulation-time'))).toBeGreaterThan(0.1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  const reducedTime = await garden.getAttribute('data-simulation-time');
  await page.waitForTimeout(200);
  await expect(garden).toHaveAttribute('data-simulation-time', reducedTime!);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect(errors).toEqual([]);
});

test.describe('small-screen reduced-motion garden', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  test('starts still, fits the screen and accepts touch and keyboard torch input', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./projects/firefly-choir/');
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator('.project-firefly-choir');
    const garden = page.getByRole('group', { name: 'Interactive firefly garden' });
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(garden).toHaveAttribute('data-simulation-time', '0.000');
    await expect.poll(() => garden.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const color = canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.4), 1, 1).data;
      return color[1];
    })).toBeGreaterThan(15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const bounds = (await garden.boundingBox())!;
    expect(bounds.y).toBeLessThan(220);
    expect(bounds.height).toBeGreaterThanOrEqual(400);
    await garden.tap({ position: { x: bounds.width * 0.5, y: bounds.height * 0.55 } });
    await expect(garden).toHaveAttribute('data-torch', 'on');
    await garden.press('Home');
    await garden.press('ArrowUp');
    await expect(garden).toHaveAttribute('data-torch-y', '0.525');
    await garden.press('t');
    await expect(garden).toHaveAttribute('data-torch', 'off');
    const frozen = await garden.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.waitForTimeout(250);
    expect(await garden.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(frozen);
    await page.getByLabel('Firefly count', { exact: true }).press('Home');
    await expect(garden).toHaveAttribute('data-particle-count', '40');
    await expect(garden).toHaveAttribute('data-simulation-time', '0.000');
    const controlHeights = await root.locator('button, input[type="range"]').evaluateAll(
      (elements) => elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(controlHeights.every((height) => height >= 44)).toBe(true);
    await page.getByRole('button', { name: 'Begin again' }).tap();
    await testInfo.attach('night-garden-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await garden.press('Space');
    await expect(root).toHaveAttribute('data-motion', 'playing');
    await expect.poll(async () => Number(await garden.getAttribute('data-simulation-time'))).toBeGreaterThan(0.1);
    expect(errors).toEqual([]);
  });
});
