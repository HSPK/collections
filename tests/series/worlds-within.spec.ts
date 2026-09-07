import { expect, test } from '@playwright/test';
import { portals, worlds } from '../../src/projects/worlds-within/data';
import {
  enterFrame, leaveFrame, MAX_DEPTH, overview, portalCamera, screenPoint,
  settleJourney, WORLD, worldPoint, zoomAt,
} from '../../src/projects/worlds-within/engine';
import type { Journey } from '../../src/projects/worlds-within/engine';

test('recursive zoom preserves its focal point and portal rebasing preserves the exact screen geometry', () => {
  const viewport = { width: 1050, height: 630 };
  let camera = overview(viewport);
  const cursor = { x: 273, y: 482 };
  const fixed = worldPoint(camera, cursor, viewport);
  for (const factor of [1.4, 1.9, 0.8, 2.2, 1 / 1.4]) {
    camera = zoomAt(camera, factor, cursor, viewport);
    const point = worldPoint(camera, cursor, viewport);
    expect(point.x).toBeCloseTo(fixed.x, 9);
    expect(point.y).toBeCloseTo(fixed.y, 9);
  }
  for (const portal of portals) {
    expect(portal.width / portal.height).toBeCloseTo(WORLD.width / WORLD.height);
    const before = portalCamera(portal, viewport);
    const child = enterFrame(before, portal);
    const childPoint = { x: 376, y: 242 };
    const inParent = { x: portal.x + childPoint.x * portal.width / WORLD.width, y: portal.y + childPoint.y * portal.width / WORLD.width };
    expect(screenPoint(before, inParent, viewport).x).toBeCloseTo(screenPoint(child, childPoint, viewport).x, 9);
    expect(screenPoint(before, inParent, viewport).y).toBeCloseTo(screenPoint(child, childPoint, viewport).y, 9);
    const restored = leaveFrame(child, portal);
    expect(restored.x).toBeCloseTo(before.x, 9);
    expect(restored.y).toBeCloseTo(before.y, 9);
    expect(restored.zoom).toBeCloseTo(before.zoom, 9);
  }
  let journey: Journey = { depth: 0, camera: overview(viewport) };
  for (let layer = 0; layer < MAX_DEPTH; layer += 1) {
    journey.camera = portalCamera(portals[journey.depth % worlds.length], viewport);
    journey = settleJourney(journey, portals, viewport);
    expect(journey.depth).toBe(layer + 1);
    expect(journey.camera.x).toBeCloseTo(500);
    expect(journey.camera.y).toBeCloseTo(350);
    expect(journey.camera.zoom).toBeLessThan(2);
  }
  journey.camera = portalCamera(portals[0], viewport);
  expect(settleJourney(journey, portals, viewport).depth).toBe(MAX_DEPTH);
  expect(() => zoomAt(camera, NaN, cursor, viewport)).toThrow(RangeError);
});

test('wheel focus, keyboard travel, four coherent scenes, back, and reset all operate without motion', async ({ page }) => {
  await page.routeWebSocket('**', () => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/worlds-within/');
  const site = page.locator('.project-worlds-within');
  const canvas = site.getByRole('application', { name: 'Recursive world explorer' });
  await expect(site.getByRole('heading', { name: 'Worlds Within', exact: true })).toBeVisible();
  await expect(site).toHaveAttribute('data-motion', 'false');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const box = (await canvas.boundingBox())!;
  expect(box.y).toBeLessThan(300);
  await page.screenshot({ path: test.info().outputPath('worlds-within-desk.png'), fullPage: true });
  const readCamera = async () => ({
    x: Number(await canvas.getAttribute('data-camera-x')),
    y: Number(await canvas.getAttribute('data-camera-y')),
    zoom: Number(await canvas.getAttribute('data-zoom')),
  });
  const cursor = {
    x: Math.round(box.x + box.width * 0.35) - box.x,
    y: Math.round(box.y + box.height * 0.66) - box.y,
  };
  const before = await readCamera();
  const fixed = worldPoint(before, cursor, box);
  await page.mouse.move(box.x + cursor.x, box.y + cursor.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await readCamera()).zoom).toBeGreaterThan(before.zoom);
  const after = worldPoint(await readCamera(), cursor, box);
  expect(after.x).toBeCloseTo(fixed.x, 6);
  expect(after.y).toBeCloseTo(fixed.y, 6);
  const beforePan = (await readCamera()).x;
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  expect((await readCamera()).x).toBeGreaterThan(beforePan);
  await page.keyboard.press('Home');
  for (let depth = 1; depth <= 4; depth += 1) {
    await canvas.focus();
    await page.keyboard.press('Enter');
    await expect(site).toHaveAttribute('data-depth', String(depth));
    await expect(site).toHaveAttribute('data-world', worlds[depth % worlds.length].id);
    await expect(site.locator('[data-story]')).toHaveText(worlds[depth % worlds.length].story);
  }
  await site.getByRole('button', { name: 'Back one world', exact: true }).click();
  await expect(site).toHaveAttribute('data-depth', '3');
  await page.screenshot({ path: test.info().outputPath('worlds-within-sea.png'), fullPage: true });
  await site.getByRole('button', { name: 'Return to the first desk', exact: true }).click();
  await expect(site).toHaveAttribute('data-depth', '0');
  await expect(site.getByRole('button', { name: 'Back one world', exact: true })).toBeDisabled();
  await site.getByRole('button', { name: 'Smooth travel: off', exact: true }).click();
  await site.getByRole('button', { name: 'Enter the blue postcard', exact: true }).click();
  await expect(site).toHaveAttribute('data-depth', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(site).toHaveAttribute('data-motion', 'false');
  expect(errors).toEqual([]);
});

test('atlas stories, notes, and guide leave recursive travel in a fixed viewport', async ({ page }) => {
    await page.routeWebSocket('**', () => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/worlds-within/');
    const site = page.locator('.project-worlds-within');
    const canvas = site.getByRole('application', { name: 'Recursive world explorer' });
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
      await site.getByRole('button', { name: 'Return to the first desk', exact: true }).click();
      const bounds = (await canvas.boundingBox())!;
      expect(bounds.height).toBeGreaterThan(140);
      for (const control of await site.locator('[data-back], [data-in], [data-out], [data-reset], [data-enter]').all()) {
        const box = (await control.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      await site.getByRole('tab', { name: 'Field notes', exact: true }).click();
      await expect(site.getByRole('list')).toBeVisible();
      await site.locator('.ww-mechanics summary').click();
      expect((await canvas.boundingBox())!).toEqual(bounds);
      await site.getByRole('button', { name: 'Enter the blue postcard', exact: true }).click();
      await expect(site).toHaveAttribute('data-depth', '1');
      await expect(site.getByRole('status')).toContainText('postcard city');
      await site.getByRole('tab', { name: 'Story', exact: true }).click();
      await expect(site.locator('[data-story]')).toHaveText(worlds[1].story);
      await site.getByRole('button', { name: 'Atlas guide', exact: true }).click();
      await expect(site.getByRole('dialog', { name: 'Atlas guide', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(site.getByRole('button', { name: 'Atlas guide', exact: true })).toBeFocused();
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ ...viewport, x: 0, y: 0 });
      await page.screenshot({ path: test.info().outputPath(`atlas-workspace-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
});

test('375px touch pinch preserves the midpoint and tapping a picture enters its actual frame', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.routeWebSocket('**', () => {});
    await page.goto('./projects/worlds-within/');
    const site = page.locator('.project-worlds-within');
    const canvas = site.getByRole('application', { name: 'Recursive world explorer' });
    const bounds = (await canvas.boundingBox())!;
    expect(bounds.y).toBeLessThan(300);
    const camera = {
      x: Number(await canvas.getAttribute('data-camera-x')), y: Number(await canvas.getAttribute('data-camera-y')),
      zoom: Number(await canvas.getAttribute('data-zoom')),
    };
    const mid = { x: bounds.width * 0.45, y: bounds.height * 0.55 };
    const fixed = worldPoint(camera, mid, bounds);
    const session = await context.newCDPSession(page);
    const touchPoints = (distance: number) => [
      { x: bounds.x + mid.x - distance, y: bounds.y + mid.y, id: 0 },
      { x: bounds.x + mid.x + distance, y: bounds.y + mid.y, id: 1 },
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(35) });
    for (const distance of [42, 51, 61, 72]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(distance) });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    expect(Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1.8);
    const after = worldPoint({
      x: Number(await canvas.getAttribute('data-camera-x')), y: Number(await canvas.getAttribute('data-camera-y')),
      zoom: Number(await canvas.getAttribute('data-zoom')),
    }, mid, bounds);
    expect(after.x).toBeCloseTo(fixed.x, 3);
    expect(after.y).toBeCloseTo(fixed.y, 3);
    await site.getByRole('button', { name: 'Return to the first desk', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const resetBounds = (await canvas.boundingBox())!;
    const portal = portals[0];
    const portalCentre = screenPoint(overview(resetBounds), { x: portal.x + portal.width / 2, y: portal.y + portal.height / 2 }, resetBounds);
    await page.touchscreen.tap(resetBounds.x + portalCentre.x, resetBounds.y + portalCentre.y);
    await expect(site).toHaveAttribute('data-world', 'city');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of await site.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('worlds-within-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
