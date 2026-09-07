import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';
import { portals } from '../../src/projects/worlds-within/data';
import { overview, screenPoint } from '../../src/projects/worlds-within/engine';

const scenes = [
  { id: 'shadow-play', notes: 'Table notes' },
  { id: 'glyph-garden', notes: 'Garden notes' },
  { id: 'worlds-within', notes: 'Atlas guide' },
  { id: 'time-brush' },
  { id: 'breath-garden', notes: 'Field notes' },
  { id: 'tidal-observatory', notes: 'Station notebook', camera: '[data-tidal-scene]' },
  { id: 'neon-rain', notes: 'Directory', camera: '.project-neon-rain' },
  { id: 'paper-planet', notes: 'Maker\u2019s note', camera: 'canvas' },
  { id: 'crystal-cavern', notes: 'Fieldbook', camera: '[data-cavern-scene]' },
  { id: 'perspective-paradox', notes: 'Field notes', camera: '[data-paradox-scene]' },
] as const;

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
  { width: 768, height: 480 },
];

async function dragStage(page: Page, canvas: Locator, touch: boolean) {
  const box = (await canvas.boundingBox())!;
  const points = [0, 1, 2, 3].map(step => ({
    x: box.x + box.width * (0.44 + step * 0.06),
    y: box.y + box.height * (0.46 + step * 0.015),
  }));
  if (touch) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ ...points[0], id: 0 }],
      });
      for (const point of points.slice(1)) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ ...point, id: 0 }],
        });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
  } else {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
  }
}

async function tapStage(canvas: Locator, touch: boolean, x = 0.5, y = 0.5) {
  const box = (await canvas.boundingBox())!;
  const options = { position: { x: box.width * x, y: box.height * y } };
  if (touch) await canvas.tap(options);
  else await canvas.click(options);
}

async function expectLiveViewport(page: Page, root: Locator, width: number, height: number) {
  await expectWorkspaceViewport(page, width, height);
  expect(await visibleControlProblems(root)).toEqual([]);
  const menu = page.getByRole('button', { name: 'Collection menu', exact: true });
  await expect(menu).toBeVisible();
  const menuBox = (await menu.boundingBox())!;
  const menuOverlaps = await root.evaluate((element, corner) => {
    const overlaps: string[] = [];
    for (const control of element.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary')) {
      if (control.matches(':disabled') || control.closest('[inert]') || !control.getClientRects().length ||
          getComputedStyle(control).visibility === 'hidden') continue;
      const box = control.getBoundingClientRect();
      let left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
      let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
      for (let parent = control.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
      }
      if (Math.min(right, corner.x + corner.width) > Math.max(left, corner.x) &&
          Math.min(bottom, corner.y + corner.height) > Math.max(top, corner.y)) {
        overlaps.push((control.getAttribute('aria-label') || control.textContent || control.id).trim());
      }
    }
    return overlaps;
  }, menuBox);
  expect(menuOverlaps, 'The collection menu must not cover any part of a visible control.').toEqual([]);
  const box = (await root.locator('canvas').boundingBox())!;
  expect(box.width).toBeGreaterThan(140);
  expect(box.height).toBeGreaterThan(100);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  expect(await root.locator('canvas').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
  })).toBe(true);
}

for (const viewport of viewports) {
  const touch = viewport.width <= 768;
  test.describe(`${viewport.width}x${viewport.height} interaction scenes`, () => {
    test.use({ viewport, isMobile: viewport.width <= 375, hasTouch: touch, reducedMotion: 'reduce' });

    for (const scene of scenes) {
      test(`${scene.id}: stage, tools, and secondary reading stay in one viewport`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.routeWebSocket('**', () => {});
        await page.goto(`./projects/${scene.id}/`);
        const root = page.locator(`.project-${scene.id}`);
        const canvas = root.locator('canvas');
        await expect(root).toHaveAttribute('data-workspace', 'true');
        await expect(canvas).toBeVisible();
        await expect.poll(async () => (await root.boundingBox())!.height).toBe(viewport.height);
        await expectLiveViewport(page, root, viewport.width, viewport.height);

        for (const tab of await root.getByRole('tab').all()) {
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expectLiveViewport(page, root, viewport.width, viewport.height);
        }
        const firstTab = root.getByRole('tab').first();
        if (await firstTab.count()) await firstTab.click();
        if (scene.id === 'time-brush') await root.getByRole('button', { name: 'Reverse brush', exact: true }).click();
        const before = await canvas.screenshot();

        if ('camera' in scene) {
          const camera = page.locator(scene.camera);
          const position = await camera.getAttribute('data-camera');
          expect(position).not.toBeNull();
          await dragStage(page, canvas, touch);
          await expect(camera).not.toHaveAttribute('data-camera', position!);
        } else if (scene.id === 'shadow-play') {
          const previous = await root.locator('[data-x-value]').textContent();
          await tapStage(canvas, touch);
          await expect(root.locator('[data-x-value]')).not.toHaveText(previous!);
          await root.getByRole('tab', { name: 'Studies', exact: true }).click();
          await root.getByLabel('Light rays', { exact: true }).check();
        } else if (scene.id === 'glyph-garden') {
          await tapStage(canvas, touch, 0.2, 0.82);
          await expect(root.getByRole('button', { name: 'Plant in Fern corner', exact: true }))
            .toHaveAttribute('aria-pressed', 'true');
          await canvas.press('f');
          await expect(root.locator('[data-plant-count]')).toHaveText('10');
        } else if (scene.id === 'worlds-within') {
          const box = (await canvas.boundingBox())!;
          const portal = portals[0];
          const point = screenPoint(overview(box), {
            x: portal.x + portal.width / 2, y: portal.y + portal.height / 2,
          }, box);
          await tapStage(canvas, touch, point.x / box.width, point.y / box.height);
          await expect(root).toHaveAttribute('data-depth', '1');
          await expect(root).toHaveAttribute('data-world', 'city');
        } else if (scene.id === 'time-brush') {
          await tapStage(canvas, touch);
          await expect(root.locator('[data-region-count]')).toHaveAttribute('data-count', '4');
          await root.getByRole('tab', { name: 'Discover', exact: true }).click();
          await root.getByRole('button', { name: /Send a train backward/ }).click();
          await expect(root.locator('[data-watch-rate]')).toHaveAttribute('data-value', '-1');
        } else if (scene.id === 'breath-garden') {
          const opened = Number(await root.getAttribute('data-opened'));
          await tapStage(canvas, touch);
          expect(Number(await root.getAttribute('data-opened'))).toBeGreaterThan(opened);
          await expect(root).toHaveAttribute('data-mic-state', 'off');
        }

        expect((await canvas.screenshot()).equals(before), 'The real paused scene must respond.').toBe(false);
        if (scene.id === 'paper-planet') {
          await root.getByRole('tab', { name: 'Field journal', exact: true }).click();
          await root.locator('[data-pp-landmark="lighthouse"]').click();
          await expect.poll(async () => Number(await canvas.getAttribute('data-landmark-alignment'))).toBeGreaterThan(0.99999);
        } else if (scene.id === 'crystal-cavern') {
          await root.getByRole('tab', { name: 'Light', exact: true }).click();
          await root.getByLabel('Light palette', { exact: true }).selectOption('amber');
          await expect(root.locator('[data-cavern-scene]')).toHaveAttribute('data-mineral', 'amber');
        } else if (scene.id === 'perspective-paradox') {
          await root.getByRole('tab', { name: 'Instruments', exact: true }).click();
          await root.getByRole('button', { name: /Projection guides/ }).click();
          await expect(root.locator('[data-paradox-scene]')).toHaveAttribute('data-guides', 'true');
        }
        await expectLiveViewport(page, root, viewport.width, viewport.height);
        await page.screenshot({ path: testInfo.outputPath(`${scene.id}-workspace.png`), fullPage: true });

        if ('notes' in scene) {
          const trigger = root.getByRole('button', { name: scene.notes, exact: true });
          await trigger.click();
          const dialog = root.locator('dialog[open]');
          await expect(dialog).toBeVisible();
          for (const summary of await dialog.locator('summary').all()) {
            if (!await summary.evaluate(element => element.parentElement?.hasAttribute('open'))) await summary.click();
          }
          const lastParagraph = dialog.locator('p').last();
          if (await lastParagraph.count()) {
            await lastParagraph.scrollIntoViewIfNeeded();
            await expect(lastParagraph).toBeVisible();
          }
          await expectWorkspaceViewport(page, viewport.width, viewport.height);
          expect(await visibleControlProblems(dialog)).toEqual([]);
          await page.screenshot({ path: testInfo.outputPath(`${scene.id}-notes.png`), fullPage: true });
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } else {
          await root.getByRole('tab', { name: 'Discover', exact: true }).click();
          await root.getByText('How this little universe works', { exact: true }).click();
          const explanation = root.locator('.tb-explanation p').last();
          await explanation.scrollIntoViewIfNeeded();
          await expect(explanation).toBeVisible();
          await expectWorkspaceViewport(page, viewport.width, viewport.height);
          await page.screenshot({ path: testInfo.outputPath(`${scene.id}-notes.png`), fullPage: true });
        }
        await expectLiveViewport(page, root, viewport.width, viewport.height);
        expect(errors).toEqual([]);
      });
    }
  });
}
