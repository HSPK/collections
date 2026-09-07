import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { GESTURE_TEMPLATES } from '../../src/projects/glyph-garden/data';
import { createRecognizer, MATCH_THRESHOLD, MAX_STROKE_POINTS, resample } from '../../src/projects/glyph-garden/engine';
import type { Point } from '../../src/projects/glyph-garden/engine';

const circle = (radius = 40, phase = 0): Point[] => Array.from({ length: 65 }, (_, index) => ({
  x: 50 + Math.cos(index / 64 * Math.PI * 2 + phase) * radius,
  y: 50 + Math.sin(index / 64 * Math.PI * 2 + phase) * radius,
}));
const chevron = [{ x: 15, y: 80 }, { x: 50, y: 15 }, { x: 85, y: 80 }];
const zigzag = [{ x: 9, y: 18 }, { x: 34, y: 69 }, { x: 59, y: 18 }, { x: 84, y: 69 }];
const straightLine = [{ x: 12, y: 50 }, { x: 50, y: 50 }, { x: 88, y: 50 }];

async function openGarden(page: Page) {
  // This local-only site has no sockets; sibling Vite edits must not reset a gesture in flight.
  await page.routeWebSocket('**', () => {});
  await page.goto('./projects/glyph-garden/');
  const site = page.locator('.project-glyph-garden');
  await expect(site.getByRole('heading', { name: 'Glyph Garden', exact: true })).toBeVisible();
  await expect(site.locator('[data-plant-count]')).toHaveText('9');
  return site;
}

async function strokeCoordinates(canvas: Locator, points: readonly Point[]) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const scale = Math.min(box!.width, box!.height) * 0.70 / 100;
  return resample(points, 64).map((point) => ({
    x: box!.x + box!.width * 0.51 + (point.x - 50) * scale,
    y: box!.y + box!.height * 0.43 + (point.y - 50) * scale,
  }));
}

async function draw(page: Page, canvas: Locator, points: readonly Point[]) {
  const samples = await strokeCoordinates(canvas, points);
  await page.mouse.move(samples[0].x, samples[0].y);
  await page.mouse.down();
  for (const point of samples.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

test('glyph garden: bounded local recognition accepts real normalized shapes, not arbitrary marks', () => {
  const matcher = createRecognizer(GESTURE_TEMPLATES);
  for (const template of GESTURE_TEMPLATES) {
    for (const reversed of [false, true]) {
      const points = resample(template.points, 80).map(({ x, y }) => ({ x: x * 2.3 + 170, y: y * 2.3 - 80 }));
      const match = matcher.recognize(reversed ? points.reverse() : points);
      expect(match.accepted, `${template.id} in ${reversed ? 'reverse' : 'forward'} direction`).toBe(true);
      expect(match.command).toBe(template.id);
      expect(match.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
      expect(match.distance).not.toBeNull();
    }
  }
  const variedCircle = circle(42, 1.13).map((point, index) => ({
    x: point.x + Math.sin(index * 2.2) * 0.8,
    y: point.y + Math.cos(index * 1.7) * 0.8,
  }));
  expect(matcher.recognize(variedCircle).command).toBe('flower');
  expect(matcher.recognize(chevron).command).toBe('tree');
  expect(matcher.recognize(zigzag).command).toBe('wind');
  for (const points of [
    straightLine,
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 50, y: 90 }, { x: 100, y: 0 }],
    [{ x: 0, y: 0 }, { x: 90, y: 90 }, { x: 0, y: 90 }, { x: 90, y: 0 }, { x: 0, y: 45 }, { x: 90, y: 45 }, { x: 0, y: 0 }],
    circle().slice(0, 29),
    circle(4),
    [],
    [{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 }],
    [{ x: 0, y: 0 }, { x: NaN, y: 70 }, { x: 100, y: 80 }],
    Array.from({ length: MAX_STROKE_POINTS + 1 }, (_, index) => ({ x: index, y: index % 3 * 70 })),
  ]) {
    const result = matcher.recognize(points);
    expect(result.accepted, JSON.stringify(points.slice(0, 8))).toBe(false);
    expect(result.command).toBeNull();
  }
  const frozenInput = Object.freeze(circle().map((point) => Object.freeze(point)));
  const first = matcher.recognize(frozenInput);
  expect(matcher.recognize(frozenInput)).toEqual(first);
  expect(first.command).toBe('flower');
  expect(() => createRecognizer([])).toThrow();
  expect(() => createRecognizer([{ id: 'tree', points: [{ x: NaN, y: 0 }, { x: 1, y: 1 }] }])).toThrow();
  expect(() => createRecognizer(Array(33).fill(GESTURE_TEMPLATES[0]))).toThrow();
  expect(resample(chevron, 2.5)).toEqual([]);
});

test('glyph garden: genuine drawing changes the chosen patch; rejection and cancellation preserve history', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const site = await openGarden(page);
  const canvas = site.locator('canvas.gg-canvas');
  expect((await canvas.boundingBox())!.y).toBeLessThan(300);
  await page.screenshot({ path: test.info().outputPath('glyph-garden-desktop.png'), fullPage: true });
  await site.getByRole('button', { name: 'Plant in Fern corner', exact: true }).click();
  await draw(page, canvas, circle());
  await expect(site.locator('[data-plant-count]')).toHaveText('10');
  await expect(site.locator('[data-feedback-title]')).toHaveText('Circle understood.');
  await expect(site.locator('[data-feedback-detail]')).toContainText('Fern corner');
  await expect(site.locator('[data-score]')).toHaveText(/\d+\.\d% shape match · circle/);

  await site.getByRole('button', { name: 'Plant in Pond bank', exact: true }).click();
  await draw(page, canvas, chevron);
  await expect(site.locator('[data-plant-count]')).toHaveText('11');
  await expect(site.locator('[data-feedback-title]')).toHaveText('Chevron understood.');
  await expect(site.locator('[data-feedback-detail]')).toContainText('Pond bank');
  await draw(page, canvas, zigzag);
  await expect(site.locator('[data-breeze]')).toHaveText('Lively breeze');
  await expect(site.locator('[data-feedback-title]')).toHaveText('Zigzag understood.');

  await draw(page, canvas, straightLine);
  await expect(site.locator('[data-feedback-title]')).toHaveText('Not quite a garden glyph.');
  await expect(site.locator('[data-feedback-detail]')).toContainText('Nothing was changed.');
  await expect(site.locator('[data-plant-count]')).toHaveText('11');
  await expect(site.locator('[data-breeze]')).toHaveText('Lively breeze');
  await site.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(site.locator('[data-breeze]')).toHaveText('Gentle breeze');
  await expect(site.locator('[data-plant-count]')).toHaveText('11');
  await page.keyboard.press('Control+z');
  await expect(site.locator('[data-plant-count]')).toHaveText('10');

  const samples = await strokeCoordinates(canvas, chevron);
  await page.mouse.move(samples[0].x, samples[0].y);
  await page.mouse.down();
  await page.mouse.move(samples[30].x, samples[30].y);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(site.locator('[data-feedback-title]')).toHaveText('Mark canceled.');
  await expect(site.locator('[data-plant-count]')).toHaveText('10');
  await site.getByRole('button', { name: 'Reset garden', exact: true }).click();
  await expect(site.locator('[data-plant-count]')).toHaveText('9');
  await site.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(site.locator('[data-plant-count]')).toHaveText('10');
  for (let plant = 0; plant < 7; plant += 1) {
    await site.getByRole('button', { name: 'Plant a flower', exact: true }).click();
  }
  await expect(site.locator('[data-plant-count]')).toHaveText('17');
  await expect(site.locator('[data-capacity]')).toHaveText('10 / 10 in this patch');
  await site.getByRole('button', { name: 'Plant a flower', exact: true }).click();
  await expect(site.locator('[data-feedback-title]')).toHaveText('This patch is wonderfully full.');
  await expect(site.locator('[data-plant-count]')).toHaveText('17');
  await site.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(site.locator('[data-plant-count]')).toHaveText('16');
  await expect(site.locator('[data-capacity]')).toHaveText('9 / 10 in this patch');
  expect(errors).toEqual([]);
});

test.describe('Glyph Garden on a narrow touch screen', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('touch, keyboard equivalents, undo, and motion work at 375px without overflow', async ({ page }) => {
    const site = await openGarden(page);
    const canvas = site.locator('canvas.gg-canvas');
    await expect(site).toHaveAttribute('data-paused', 'true');
    await expect(site.getByRole('button', { name: 'Resume motion', exact: true })).toBeVisible();
    const box = (await canvas.boundingBox())!;
    expect(box.y).toBeLessThan(300);
    await page.screenshot({ path: test.info().outputPath('glyph-garden-mobile.png'), fullPage: true });
    await canvas.tap({ position: { x: box.width * 0.20, y: box.height * 0.82 } });
    await expect(site.getByRole('button', { name: 'Plant in Fern corner', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const before = await canvas.screenshot();
    const samples = await strokeCoordinates(canvas, circle());
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...samples[0], id: 0 }] });
    for (const point of samples.slice(1)) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 0 }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await expect(site.locator('[data-plant-count]')).toHaveText('10');
    await expect(site.locator('[data-feedback-title]')).toHaveText('Circle understood.');
    const after = await canvas.screenshot();
    expect(after.equals(before)).toBe(false);
    await page.waitForTimeout(150);
    expect((await canvas.screenshot()).equals(after)).toBe(true);

    const grow = site.getByRole('button', { name: 'Grow a tree', exact: true });
    await grow.focus();
    await page.keyboard.press('Enter');
    await expect(site.locator('[data-plant-count]')).toHaveText('11');
    await expect(site.locator('[data-score]')).toHaveText('Button command · no shape matching used');
    await page.keyboard.press('Control+z');
    await expect(site.locator('[data-plant-count]')).toHaveText('10');
    await site.getByRole('button', { name: 'Call a breeze', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(site.locator('[data-breeze]')).toHaveText('Lively breeze');
    await expect(site).toHaveAttribute('data-paused', 'true');
    await site.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(site.locator('[data-breeze]')).toHaveText('Gentle breeze');

    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await expect(site.getByRole('button', { name: 'Plant in Sun pocket', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('f');
    await expect(site.locator('[data-plant-count]')).toHaveText('11');
    await site.getByRole('button', { name: 'Resume motion', exact: true }).click();
    await expect(site).toHaveAttribute('data-paused', 'false');
    await site.getByRole('button', { name: 'Pause motion', exact: true }).click();
    await expect(site).toHaveAttribute('data-paused', 'true');
    await site.getByRole('button', { name: 'Resume motion', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(site).toHaveAttribute('data-paused', 'true');
    await site.getByRole('button', { name: 'Garden notes', exact: true }).click();
    await expect(site.getByRole('dialog', { name: 'Garden notes', exact: true })).toBeVisible();
    await expect(site.locator('.gg-mechanics')).toHaveAttribute('open', '');
    const dimensions = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    for (const button of await site.getByRole('button').all()) {
      const target = await button.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('garden tools, field guide, and notes preserve a live resized viewport canvas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const site = await openGarden(page);
    const canvas = site.locator('canvas.gg-canvas');
    for (const viewport of [
      { width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 },
      { width: 320, height: 640 }, { width: 768, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(site).toHaveAttribute('data-workspace', 'true');
      await expect.poll(async () => (await site.boundingBox())!.height).toBe(viewport.height);
      await expect.poll(async () => canvas.evaluate(element => Math.abs(
        (element as HTMLCanvasElement).width - element.getBoundingClientRect().width * Math.min(devicePixelRatio, 2),
      ))).toBeLessThanOrEqual(1);
      const bounds = (await canvas.boundingBox())!;
      expect(bounds.height).toBeGreaterThan(140);
      for (const control of await site.locator('[data-bed], [data-command], [data-undo], [data-reset], [data-pause]').all()) {
        const box = (await control.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      }
      await site.getByRole('tab', { name: 'Field guide', exact: true }).click();
      await expect(site.getByRole('heading', { name: 'Three little spells', exact: true })).toBeVisible();
      expect((await canvas.boundingBox())!).toEqual(bounds);
      const before = Number(await site.locator('[data-plant-count]').textContent());
      await draw(page, canvas, circle());
      await expect(site.getByRole('tab', { name: 'Grow', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(site.locator('[data-plant-count]')).toHaveText(String(before + 1));
      await expect(site.locator('[data-feedback-title]')).toHaveText('Circle understood.');
      await site.getByRole('button', { name: 'Garden notes', exact: true }).click();
      await expect(site.getByRole('dialog', { name: 'Garden notes', exact: true })).toBeVisible();
      await page.keyboard.press('Control+z');
      await expect(site.locator('[data-plant-count]')).toHaveText(String(before + 1));
      await page.keyboard.press('Escape');
      await expect(site.getByRole('button', { name: 'Garden notes', exact: true })).toBeFocused();
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ ...viewport, x: 0, y: 0 });
      await page.screenshot({ path: test.info().outputPath(`garden-workspace-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
  });
});
