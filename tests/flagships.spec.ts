import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectManifests } from '../scripts/project-pages';
import { categoryNames } from '../src/core/manifest';

const editions = [
  { name: 'original flagship edition', firstOrder: 61, tag: 'Flagship', ids: ['apsis', 'lumen', 'relay', 'palinode', 'roomtone'] },
  { name: 'spatial flagship edition', firstOrder: 66, tag: 'Spatial flagship', ids: ['section', 'passage', 'morrow', 'parallax', 'loadpath'] },
  { name: 'solar observatory edition', firstOrder: 71, tag: 'Solar system', ids: ['helios'] },
];
const ids = editions.flatMap((edition) => edition.ids);
const manifests = readProjectManifests(process.cwd());

const matchingProjects = (words: string[]) => manifests.filter((project) => {
  const text = [
    project.title, project.subtitle, project.description, project.medium, ...project.tags, categoryNames[project.category],
  ].join(' ').toLowerCase();
  return words.every((word) => text.includes(word.toLowerCase()));
});

for (const edition of editions) {
  test(`The ${edition.name} contains independent, documented projects with real covers`, () => {
    expect(manifests.length).toBeGreaterThanOrEqual(edition.firstOrder + edition.ids.length - 1);
    const projects = manifests.filter((project) => edition.ids.includes(project.id)).sort((a, b) => a.order - b.order);
    expect(projects.map((project) => project.id)).toEqual(edition.ids);
    expect(projects.map((project) => project.order)).toEqual(edition.ids.map((_, index) => edition.firstOrder + index));
    for (const project of projects) {
      expect(project.format).toBe('page');
      expect(project.tags).toContain('Flagship');
      expect(project.tags).toContain(edition.tag);
      expect(existsSync(resolve('src/projects', project.id, 'README.md'))).toBe(true);
      const cover = readFileSync(resolve('public', project.preview || `previews/${project.id}.jpg`));
      expect(cover.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), `${project.id} needs a captured JPEG cover`).toBe(true);
    }
  });
}

test('The flagship collection is searchable without adding index chrome', async ({ page }) => {
  const matching = matchingProjects(['flagship']);
  await page.goto('./');
  await expect(page.locator('.main-nav > button, .main-nav > a')).toHaveText(['About', 'Source', 'Contribute']);
  await expect(page.locator('.library-intro, #app > footer, .collection-count')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('Flagship');
  await expect(page.locator('.project-card')).toHaveCount(matching.length);
  const links = page.locator('.project-open');
  expect(matching.map((project) => project.id)).toEqual(expect.arrayContaining(ids));
  expect((await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-project')))).sort()).toEqual(matching.map((project) => project.id).sort());
  await page.getByRole('combobox', { name: 'Sort projects', exact: true }).selectOption('newest');
  expect(await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-project')))).toEqual(matching.sort((a, b) => b.order - a.order).map((project) => project.id));
  for (const id of ids) {
    const image = page.locator(`.project-open[data-project="${id}"] img`);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth >= 1000)).toBe(true);
  }
});

test('Spatial flagships can be found together without replacing the rest of the library', async ({ page }) => {
  const matching = matchingProjects(['spatial', 'flagship']);
  await page.goto('./');
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('Spatial flagship');
  await expect(page.locator('.project-card')).toHaveCount(matching.length);
  const found = await page.locator('.project-open').evaluateAll((links) => links.map((link) => link.getAttribute('data-project')));
  expect(found).toEqual(expect.arrayContaining(editions[1].ids));
  expect([...found].sort()).toEqual(matching.map((project) => project.id).sort());
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(manifests.length);
});

for (const id of ids) {
  test(`${id}: small-screen controls stay readable, local, and silent until invited`, async ({ page, baseURL }) => {
    if (manifests.find((project) => project.id === id)?.tags.some((tag) => tag.toLowerCase().includes('3d'))) test.setTimeout(90_000);
    const origin = new URL(`./projects/${id}/`, baseURL).origin;
    const errors: string[] = [];
    const external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      if (!window.AudioContext) return;
      window.AudioContext = new Proxy(window.AudioContext, {
        construct(target, argumentsList, newTarget) {
          document.documentElement.dataset.flagshipAudio = 'created';
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
    });
    await page.setViewportSize({ width: 320, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== origin) {
        external.push(request.url());
      }
    });
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator(`.project-${id}`);
    await expect(root.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(root).toHaveCSS('transition-property', 'none');
    await expect(page.locator('#main-content > [data-stage] [data-project-preview]').first()).toBeAttached();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 780 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const smallControls = await root.locator('button, input, select, textarea').evaluateAll((elements) => elements.flatMap((element) => {
        const style = getComputedStyle(element);
        if (!element.getClientRects().length || style.visibility === 'hidden' || parseFloat(style.fontSize) >= 14) return [];
        return [{
          label: (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 70),
          fontSize: style.fontSize,
        }];
      }));
      expect(smallControls, `${id} needs readable controls at ${width}px`).toEqual([]);
    }
    expect(await page.locator('html').getAttribute('data-flagship-audio')).toBeNull();
    await expect(page.locator('.project-trail, #app > .site-header, iframe')).toHaveCount(0);
    const menu = page.getByRole('button', { name: 'Collection menu', exact: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Back to index', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
