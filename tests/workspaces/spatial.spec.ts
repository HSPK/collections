import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
];
const workspaces = [
  { id: 'section', canvas: '[data-solid] canvas', tabs: '.section-inspector-tabs', files: 'Files & guide' },
  { id: 'passage', canvas: '[data-passage-space] canvas', tabs: '.passage-pane-nav', files: 'Keep / guide' },
  { id: 'morrow', canvas: '[data-morrow-scene] canvas', tabs: '.morrow-mobile-views', files: 'Files / guide' },
  { id: 'parallax', canvas: '.px-space-canvas', tabs: '.px-mobile-tabs', files: 'Notebook' },
  { id: 'loadpath', canvas: '.lp-canvas', tabs: '.lp-mobile-tabs', files: 'Files & notes' },
];

async function noDocumentScroll(page: Page) {
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    x: scrollX, y: scrollY,
  }))).toEqual({
    ...viewport, bodyWidth: viewport.width, bodyHeight: viewport.height, x: 0, y: 0,
  });
}

// Check bounds and hit targets before clicking: Playwright must not make a
// clipped control pass by scrolling the document on the user's behalf.
async function reachable(locator: Locator) {
  const state = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + .5 && rect.bottom <= innerHeight + .5,
      hit: !!hit && (hit === element || element.contains(hit)),
      font: parseFloat(getComputedStyle(element).fontSize),
      textFits: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(state.inside).toBe(true);
  expect(state.hit).toBe(true);
  expect(state.font).toBeGreaterThanOrEqual(14);
  expect(state.textFits).toBe(true);
}

async function clearCollectionMenu(page: Page, id: string) {
  const menu = await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox();
  if (!menu) throw new Error('The floating collection menu is missing.');
  const overlaps = await page.locator(`.project-${id}`).evaluate((root, menu) => {
    const collisions: string[] = [];
    for (const control of root.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href]')) {
      if (!control.getClientRects().length || control.closest('[inert], [hidden]') ||
          getComputedStyle(control).visibility !== 'visible') continue;
      const rect = control.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = control.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
        if (style.overflowX !== 'visible') { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (style.overflowY !== 'visible') { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
      left = Math.max(left, menu.x); right = Math.min(right, menu.x + menu.width);
      top = Math.max(top, menu.y); bottom = Math.min(bottom, menu.y + menu.height);
      if (right - left > 1 && bottom - top > 1) {
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (!hit || (hit !== control && !control.contains(hit))) {
          collisions.push(control.getAttribute('aria-label') || control.textContent?.trim() || control.outerHTML);
        }
      }
    }
    return collisions;
  }, menu);
  expect(overlaps, 'The collection menu must not cover visible workspace controls').toEqual([]);
}

for (const workspace of workspaces) {
  test(`${workspace.id}: every workspace pane fits the actual viewport without document scrolling`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket(url => url.searchParams.has('token'), socket => { socket.onMessage(() => {}); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`./projects/${workspace.id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator(`.project-${workspace.id}`)).toHaveAttribute('data-workspace', 'true');
    const tabs = page.locator(workspace.tabs).getByRole('tab');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const tab of await tabs.all()) {
        await reachable(tab);
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await noDocumentScroll(page);
        if (workspace.id === 'loadpath' && await tab.textContent() === 'Structure') {
          for (const camera of await page.locator('[data-lp-view]').all()) {
            await reachable(camera);
            expect((await camera.boundingBox())!.height).toBeLessThanOrEqual(44);
          }
        }
        const plan = workspace.id === 'passage' && viewport.width <= 760 && await tab.textContent() === 'Plan';
        const surface = page.locator(plan ? '[data-passage-plan] svg' : workspace.canvas);
        await expect(surface).toBeVisible();
        await expect.poll(() => surface.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const bufferMatches = !(element instanceof HTMLCanvasElement) ||
            (Math.abs(element.width - Math.floor(rect.width * Math.min(devicePixelRatio, 1.5))) <= 2 &&
              Math.abs(element.height - Math.floor(rect.height * Math.min(devicePixelRatio, 1.5))) <= 2);
          return rect.width > 100 && rect.height > 60 && rect.left >= 0 && rect.top >= 0 &&
            rect.right <= innerWidth + .5 && rect.bottom <= innerHeight + .5 && bufferMatches;
        })).toBe(true);
        await clearCollectionMenu(page, workspace.id);
        await page.locator(`.project-${workspace.id}`).evaluate(root => {
          for (const panel of root.querySelectorAll<HTMLElement>('*')) {
            if (!panel.closest('[inert], [hidden], dialog') &&
                ['auto', 'scroll'].includes(getComputedStyle(panel).overflowY)) panel.scrollTop = panel.scrollHeight;
          }
        });
        await clearCollectionMenu(page, workspace.id);
        await noDocumentScroll(page);
        await page.locator(`.project-${workspace.id}`).evaluate(root => {
          for (const panel of root.querySelectorAll<HTMLElement>('*')) {
            if (!panel.closest('[inert], [hidden], dialog') &&
                ['auto', 'scroll'].includes(getComputedStyle(panel).overflowY)) panel.scrollTop = 0;
          }
        });
      }
      await tabs.first().focus();
      await page.keyboard.press('End');
      await expect(tabs.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(tabs.first()).toBeFocused();
      await noDocumentScroll(page);
      const files = page.getByRole('button', { name: workspace.files, exact: true });
      await reachable(files);
      await files.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await reachable(dialog.getByRole('button', { name: /^Close / }));
      const body = dialog.locator('.workspace-dialog-content');
      await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await noDocumentScroll(page);
      await page.keyboard.press('Escape');
      await expect(files).toBeFocused();
      await page.evaluate(() => window.scrollTo(10000, 10000));
      await noDocumentScroll(page);
      const capture = testInfo.outputPath(`${workspace.id}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: capture });
      await testInfo.attach(`${workspace.id} ${viewport.width}x${viewport.height}`, { path: capture, contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  });
}
