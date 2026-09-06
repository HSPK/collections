import { expect, test } from '@playwright/test';
import { openCollectionMenu, returnToCollection } from './helpers/navigation';

test('The header and search stay fixed while only the project list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(page.locator('.main-nav > button, .main-nav > a')).toHaveText(['About', 'Source', 'Contribute']);
  await expect(page.locator('.nav-current, .library-intro, .collection-count, #app > footer')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Contribute', exact: true })).toHaveAttribute('href', 'https://github.com/HSPK/collections/blob/main/CONTRIBUTING.md');
  await expect(page.getByText('Discover projects', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tools, games, stories, and unexpected ideas.', { exact: true })).toHaveCount(0);
  const header = (await page.locator('.site-header').boundingBox())!;
  const search = (await page.locator('.library-tools').boundingBox())!;
  const list = page.locator('[data-project-grid]');
  await list.hover();
  await page.mouse.wheel(0, 950);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await page.locator('.site-header').boundingBox())!.y).toBe(header.y);
  expect((await page.locator('.library-tools').boundingBox())!.y).toBe(search.y);
  expect(await list.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await list.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('thin');
  await page.locator('[data-project="flow"]').click();
  await expect(page.locator('.art-website')).toBeVisible();
  await returnToCollection(page);
  await expect.poll(() => page.locator('[data-project-grid]').evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
});

test('The mobile library retains its fixed search controls and usable inner scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.locator('.main-nav > button, .main-nav > a')).toHaveText(['About', 'Source', 'Contribute']);
  await expect(page.locator('.header-code span')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contribute', exact: true })).toBeVisible();
  await expect(page.locator('#app > footer')).toHaveCount(0);
  const search = (await page.locator('.library-search').boundingBox())!;
  const list = page.locator('[data-project-grid]');
  await list.evaluate((element) => { element.scrollTop = 900; });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await page.locator('.library-search').boundingBox())!.y).toBe(search.y);
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('Pixel Loom');
  await expect(page.locator('.project-card')).toHaveCount(1);
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('Reduced motion disables transitions without creating responsive layout animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const layout = page.locator('.library-shell');
  const card = page.locator('.project-card').first();
  await expect(layout).toHaveCSS('transition-property', 'none');
  await expect(card).toHaveCSS('transition-property', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(layout).toHaveCSS('transition-duration', '0s');
  await expect(card).toHaveCSS('transition-property', 'border-color, box-shadow');
});

test('Floating collection navigation is collapsible, keyboard accessible, and out of page flow', async ({ page }) => {
  await page.goto('./projects/postcards/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.project-trail, #app > .site-header')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Collection menu', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#collection-menu-panel')).toBeHidden();
  const initial = (await toggle.boundingBox())!;
  await page.evaluate(() => window.scrollTo(0, 700));
  expect((await toggle.boundingBox())!.y).toBe(initial.y);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Back to index', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await openCollectionMenu(page);
  await page.getByRole('button', { name: 'About this project', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Letters from Elsewhere', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await openCollectionMenu(page);
  await page.getByRole('button', { name: 'Search projects', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find a project', exact: true })).toBeVisible();
});

test('Original artworks own their studio layout, theme, and playback lifecycle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/flow/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-format', 'page');
  await expect(page.locator('.project-flow.art-website')).toBeVisible();
  await expect(page.locator('[data-art-stage] canvas')).toBeVisible();
  await expect(page.locator('.art-inspector [data-controls]')).toBeVisible();
  await expect(page.locator('.lab-page, .experiment-toolbar, .project-trail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(page.locator('.art-website')).toHaveAttribute('data-motion', 'playing');
  await page.locator('.art-website').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.art-website')).toHaveAttribute('data-motion', 'paused');
});
