import { expect, test } from '@playwright/test';
import type { ProjectContext, ProjectInstance } from '../../src/core/types';
import { BRUSH_MODES, CORE_RATIO, MAX_PATCHES, OBJECTS } from '../../src/projects/time-brush/data';
import { fieldDistance, motionAt, patchWeight, sampleField, TimeScene, wrap } from '../../src/projects/time-brush/engine';

test('Time Brush composes a bounded scalar field and advances independent, stable signed clocks', () => {
  const scene = new TimeScene(1.6);
  scene.clearPatches();
  const center = { x: 0.5, y: 0.5 };
  expect(scene.rateAt(center)).toBe(1);
  scene.stamp(center, 'slow', 0.2);
  expect(scene.rateAt(center)).toBe(0.25);
  expect(scene.rateAt({ x: 0, y: 0 })).toBe(1);
  expect(patchWeight(0.2 * CORE_RATIO, 0.2)).toBe(1);
  expect(patchWeight(0.2, 0.2)).toBe(0);
  expect(patchWeight(0.2 * (CORE_RATIO + 1) / 2, 0.2)).toBeCloseTo(0.5, 12);
  scene.stamp(center, 'reverse', 0.2);
  expect(scene.rateAt(center)).toBe(-1);
  scene.stamp(center, 'freeze', 0.2);
  expect(scene.rateAt(center)).toBe(0);
  scene.stamp(center, 'fast', 0.2);
  expect(scene.rateAt(center)).toBe(3);
  expect(scene.undoStroke()).toBe(1);
  expect(scene.rateAt(center)).toBe(0);
  expect(fieldDistance(center, { x: center.x + 0.1 / 1.6, y: center.y }, 1.6)).toBeCloseTo(0.1);

  scene.clearPatches();
  for (let index = 0; index < MAX_PATCHES + 40; index++) {
    scene.stamp({ x: (index % 11) / 10, y: (index % 7) / 6 }, BRUSH_MODES[index % 4].id, 0.24);
  }
  expect(scene.patches).toHaveLength(MAX_PATCHES);
  const lastId = scene.patches.at(-1)!.id;
  expect(scene.patches[0].id).toBe(lastId - MAX_PATCHES + 1);
  for (let x = 0; x <= 10; x++) {
    for (let y = 0; y <= 10; y++) {
      const rate = sampleField(scene.patches, { x: x / 10, y: y / 10 }, scene.aspect);
      expect(rate).toBeGreaterThanOrEqual(-1);
      expect(rate).toBeLessThanOrEqual(3);
    }
  }
  scene.clearPatches();
  const group = scene.beginStroke();
  for (let index = 0; index < 9; index++) scene.stamp({ x: index / 10, y: 0.5 }, 'slow', 0.1, group);
  expect(scene.undoStroke()).toBe(9);
  expect(scene.patches).toHaveLength(0);
  expect(() => scene.stamp({ x: NaN, y: 0.5 }, 'freeze', 0.1)).toThrow(RangeError);

  const frozen = scene.inspect('orbit-10');
  const spindle = scene.inspect('spindle');
  scene.stamp(frozen.position, 'freeze', 0.1);
  scene.stamp(spindle.position, 'reverse', 0.1);
  for (let step = 0; step < 120; step++) scene.advance(1 / 120);
  expect(scene.inspect('orbit-10').time).toBe(0);
  expect(scene.inspect('orbit-10').position).toEqual(frozen.position);
  expect(scene.inspect('spindle').time).toBeCloseTo(-1, 12);
  expect(scene.inspect('train-1').time).toBeCloseTo(1, 12);
  const clocks = scene.clocks.map((clock) => clock.time);
  scene.advance(1, true);
  scene.advance(NaN);
  scene.advance(-1);
  expect(scene.clocks.map((clock) => clock.time)).toEqual(clocks);
  scene.clearPatches();
  expect(scene.clocks.map((clock) => clock.time)).toEqual(clocks);
  scene.advance(500);
  expect(scene.inspect('spindle').time).toBeCloseTo(-0.95, 12);

  expect(wrap(-1, 10)).toBe(9);
  for (const aspect of [0.76, 1.6]) {
    for (const spec of OBJECTS) {
      const negative = motionAt(spec, -120.75, aspect);
      const periodLater = motionAt(spec, -120.75 + Math.PI * 2 / spec.speed, aspect);
      expect(negative.position.x).toBeCloseTo(periodLater.position.x, 10);
      expect(negative.position.y).toBeCloseTo(periodLater.position.y, 10);
      expect(Number.isFinite(negative.angle)).toBe(true);
      expect(negative.position.x).toBeGreaterThan(0);
      expect(negative.position.x).toBeLessThan(1);
      expect(negative.position.y).toBeGreaterThan(0);
      expect(negative.position.y).toBeLessThan(1);
    }
  }
});

test('Time Brush edits while paused, rewinds below zero, groups pointer strokes, and cleans up', async ({ page }) => {
  await page.routeWebSocket('**', () => {});
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/time-brush/');
  const root = page.locator('.project-time-brush');
  const canvas = root.getByRole('application', { name: 'Time field painting canvas' });
  const count = root.locator('[data-region-count]');
  const clock = root.locator('[data-watch-time]');
  const rate = root.locator('[data-watch-rate]');
  await expect(root).toHaveAttribute('data-paused', 'true');
  await expect(root.getByRole('heading', { level: 1 })).toHaveText('Time Brush↶');
  await expect(count).toHaveAttribute('data-count', '3');
  await root.getByRole('button', { name: 'Clear patches', exact: true }).click();
  await expect(count).toHaveAttribute('data-count', '0');
  await root.getByLabel('Watch an object', { exact: true }).selectOption('spindle');
  await root.getByRole('button', { name: 'Aim at this object', exact: true }).click();
  await canvas.focus();
  await canvas.press('4');
  await canvas.press('Space');
  await expect(root.getByRole('button', { name: 'Reverse brush', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveAttribute('data-count', '1');
  await expect(rate).toHaveAttribute('data-value', '-1');
  await expect(clock).toHaveAttribute('data-value', '0');
  const aimX = Number(await root.locator('[data-aim-position]').getAttribute('data-x'));
  await canvas.press('ArrowRight');
  await canvas.press(']');
  expect(Number(await root.locator('[data-aim-position]').getAttribute('data-x'))).toBeGreaterThan(aimX);
  await expect(root.locator('[data-brush-size]')).toHaveText('28%');
  await canvas.press('Space');
  await expect(count).toHaveAttribute('data-count', '2');
  await expect(clock).toHaveAttribute('data-value', '0');

  await root.getByRole('button', { name: 'Play scene', exact: true }).click();
  await expect.poll(async () => Number(await clock.getAttribute('data-value'))).toBeLessThan(-0.03);
  await root.getByRole('button', { name: 'Pause scene', exact: true }).click();
  const negativeTime = await clock.getAttribute('data-value');
  await root.getByRole('button', { name: 'Freeze brush', exact: true }).click();
  await root.getByRole('button', { name: 'Aim at this object', exact: true }).click();
  await root.getByRole('button', { name: 'Stamp Freeze patch', exact: true }).click();
  await expect(rate).toHaveAttribute('data-value', '0');
  await expect(clock).toHaveAttribute('data-value', negativeTime!);

  await root.getByRole('button', { name: 'Slow brush', exact: true }).click();
  const beforeStroke = Number(await count.getAttribute('data-count'));
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.12, bounds.y + bounds.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.52, { steps: 9 });
  await page.mouse.up();
  expect(Number(await count.getAttribute('data-count'))).toBeGreaterThan(beforeStroke + 2);
  await root.getByRole('button', { name: 'Undo stroke', exact: true }).click();
  await expect(count).toHaveAttribute('data-count', String(beforeStroke));

  await canvas.scrollIntoViewIfNeeded();
  const cancelBounds = (await canvas.boundingBox())!;
  await page.mouse.move(cancelBounds.x + 40, cancelBounds.y + 80);
  await page.mouse.down();
  await canvas.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
  const afterCancel = await count.getAttribute('data-count');
  await page.mouse.move(cancelBounds.x + 130, cancelBounds.y + 110, { steps: 3 });
  await page.mouse.up();
  await expect(count).toHaveAttribute('data-count', afterCancel!);
  await expect(root).not.toHaveClass(/tb-painting/);
  await root.getByLabel('Watch an object', { exact: true }).selectOption('spindle');
  await expect(clock).toHaveAttribute('data-value', negativeTime!);
  await root.getByRole('button', { name: 'Reset scene', exact: true }).click();
  await expect(root).toHaveAttribute('data-paused', 'true');
  await expect(count).toHaveAttribute('data-count', '3');
  await expect(clock).toHaveAttribute('data-value', '0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('time-brush-desktop.png'), fullPage: true });

  const lifecycle = await page.evaluate(async () => {
    const moduleUrl = new URL('../../src/projects/time-brush/index.ts', location.href).href;
    const project = await import(moduleUrl) as { mount(context: ProjectContext): ProjectInstance };
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:700px;overflow:auto;z-index:1000';
    document.body.append(holder);
    const controller = new AbortController();
    const OriginalObserver = window.ResizeObserver;
    let observed = 0;
    let disconnected = 0;
    window.ResizeObserver = class extends OriginalObserver {
      override observe(target: Element, options?: ResizeObserverOptions) { observed++; super.observe(target, options); }
      override disconnect() { disconnected++; super.disconnect(); }
    };
    const originalFill = CanvasRenderingContext2D.prototype.fillRect;
    let ownedCanvas: HTMLCanvasElement | null = null;
    let draws = 0;
    CanvasRenderingContext2D.prototype.fillRect = function (...args: Parameters<typeof originalFill>) {
      if (this.canvas === ownedCanvas) draws++;
      return originalFill.apply(this, args);
    };
    let instance: ProjectInstance | undefined;
    try {
      instance = project.mount({ container: holder, controls: holder, signal: controller.signal, reducedMotion: false, report: () => {} });
      ownedCanvas = holder.querySelector('canvas')!;
      const oldRoot = holder.querySelector('.project-time-brush')!;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const before = draws;
      const regionOutput = oldRoot.querySelector<HTMLOutputElement>('[data-region-count]')!;
      const beforeCount = regionOutput.value;
      controller.abort();
      instance.destroy();
      oldRoot.querySelector<HTMLButtonElement>('[data-action="stamp"]')!.click();
      ownedCanvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return { before, after: draws, observed, disconnected, remaining: holder.childElementCount, beforeCount, afterCount: regionOutput.value };
    } finally {
      instance?.destroy();
      window.ResizeObserver = OriginalObserver;
      CanvasRenderingContext2D.prototype.fillRect = originalFill;
      holder.remove();
    }
  });
  expect(lifecycle.before).toBeGreaterThan(0);
  expect(lifecycle.after).toBe(lifecycle.before);
  expect(lifecycle.observed).toBe(1);
  expect(lifecycle.disconnected).toBe(1);
  expect(lifecycle.remaining).toBe(0);
  expect(lifecycle.afterCount).toBe(lifecycle.beforeCount);
  expect(errors).toEqual([]);
});

test('Time Brush fits a 375px touch screen and provides native aim-and-stamp controls', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 1, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.routeWebSocket('**', () => {});
    await page.goto('./projects/time-brush/');
    const root = page.locator('.project-time-brush');
    const canvas = root.getByRole('application', { name: 'Time field painting canvas' });
    const count = root.locator('[data-region-count]');
    await expect(root).toHaveAttribute('data-paused', 'true');
    expect((await canvas.boundingBox())!.y).toBeLessThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const targetSizes = await root.locator('button:visible, input:visible, select:visible').evaluateAll((elements) =>
      elements.map((element) => ({ label: element.getAttribute('aria-label') || element.textContent, height: element.getBoundingClientRect().height })));
    expect(targetSizes.filter((target) => target.height < 44)).toEqual([]);

    await root.getByRole('button', { name: 'Clear patches', exact: true }).click();
    await expect(count).toHaveAttribute('data-count', '0');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = (await canvas.boundingBox())!;
    const point = await root.locator('[data-aim-position]').evaluate((element) => ({
      x: Number((element as HTMLOutputElement).dataset.x), y: Number((element as HTMLOutputElement).dataset.y),
    }));
    await page.touchscreen.tap(bounds.x + bounds.width * point.x, bounds.y + bounds.height * point.y);
    await expect(count).toHaveAttribute('data-count', '1');
    await expect(root.locator('[data-watch-rate]')).toHaveAttribute('data-value', '0');
    await expect(root.locator('[data-watch-time]')).toHaveAttribute('data-value', '0');
    await expect(root).not.toHaveClass(/tb-painting/);

    const beforeX = Number(await root.locator('[data-aim-position]').getAttribute('data-x'));
    await root.getByRole('button', { name: 'Move brush right', exact: true }).click();
    expect(Number(await root.locator('[data-aim-position]').getAttribute('data-x'))).toBeGreaterThan(beforeX);
    await expect(count).toHaveAttribute('data-count', '1');
    await root.getByRole('button', { name: 'Reverse brush', exact: true }).click();
    await root.getByRole('button', { name: 'Stamp Reverse patch', exact: true }).click();
    await expect(count).toHaveAttribute('data-count', '2');
    await expect(root.locator('[data-aim-rate]')).toHaveAttribute('data-value', '-1');
    await expect(root).toHaveAttribute('data-paused', 'true');
    await root.getByLabel('Brush diameter', { exact: true }).focus();
    await root.getByLabel('Brush diameter', { exact: true }).press('End');
    await expect(root.locator('[data-brush-size]')).toHaveText('48%');

    await root.getByRole('button', { name: /Send a train backward/ }).click();
    await expect(root).toHaveAttribute('data-watch', 'train-1');
    await expect(root.locator('[data-watch-rate]')).toHaveAttribute('data-value', '-1');
    await expect(root.locator('[data-watch-time]')).toHaveAttribute('data-value', '0');
    await root.getByRole('button', { name: 'Reset scene', exact: true }).click();
    await expect(count).toHaveAttribute('data-count', '3');
    await expect(root).toHaveAttribute('data-paused', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('time-brush-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
