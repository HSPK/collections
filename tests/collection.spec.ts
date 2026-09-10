import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectManifests, renderProjectDocument } from '../scripts/project-pages';
import { parseManifest, validateCollection } from '../src/core/manifest';
import { escapeMarkup } from '../src/core/markup';
import { openCollectionMenu } from './helpers/navigation';

const projects = readProjectManifests(process.cwd());
const websites = projects.filter((project) => project.format === 'page');

test('The expanded collection includes twenty new independent websites and six kinds of work', () => {
  expect(projects.length).toBeGreaterThanOrEqual(30);
  expect(websites.length).toBeGreaterThanOrEqual(20);
  expect(websites.length).toBe(projects.length);
  expect(new Set(projects.map((project) => project.category)).size).toBe(6);
  for (const project of projects) {
    const folder = resolve('src/projects', project.id);
    expect(existsSync(resolve(folder, 'manifest.json'))).toBe(true);
    expect(existsSync(resolve(folder, 'index.ts'))).toBe(true);
    expect(existsSync(resolve(folder, 'README.md')), `${project.id} needs extension documentation`).toBe(true);
  }
});

test('The library gives the first screen to readable project content, not a hero canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(projects.length);
  await expect(page.locator('canvas, iframe')).toHaveCount(0);
  expect((await page.locator('[data-project-grid]').boundingBox())!.y).toBeLessThan(250);
  const visible = await page.locator('.project-card').evaluateAll((cards) => {
    const viewport = document.querySelector('[data-project-grid]')!.getBoundingClientRect();
    return cards.filter((card) => card.getBoundingClientRect().bottom <= viewport.bottom).length;
  });
  expect(visible).toBeGreaterThanOrEqual(6);
  expect(await page.locator('.card-copy p').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.locator('.card-tags span').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  expect(requested.filter((url) => /\/(?:three|astronomy|phaser)[^/]*\.js|\/deps\/(?:three|astronomy-engine|phaser)\.js/.test(url))).toEqual([]);
});

test('Old shared links lead to real standalone pages and survive direct refresh', async ({ page }) => {
  await page.goto('./#/experiment/orbital');
  await expect(page).toHaveURL(/\/projects\/orbital\/$/);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await page.reload();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-project', 'orbital');
  await expect(page.locator('iframe, .library-shell')).toHaveCount(0);
  await expect(page.locator('.project-trail, #app > .site-header, .lab-page')).toHaveCount(0);
  await expect(page.locator('.art-website')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collection menu', exact: true })).toBeVisible();
});

test('Manifest and HTML generation are data-driven, validated, and safely rebased', () => {
  const template = readFileSync(resolve('index.html'), 'utf8')
    .replace('<body>', '<body class="example">')
    .replace('src="/src/main.ts"', 'src="./assets/example.js"');
  const original = projects[0];
  const special = { ...original, title: 'A $& <new> "website"', description: 'A $& description with <tags> & quotes.' };
  const result = renderProjectDocument(template, special, true);
  expect(result).toContain(`data-project="${original.id}"`);
  expect(result).toContain('class="example"');
  expect(result).toContain('content="../../"');
  expect(result).toContain('src="../../assets/example.js"');
  expect(result).toContain(`<title>${escapeMarkup(`${special.title} - Odd Index`)}</title>`);
  expect(result).toContain(escapeMarkup(special.description));
  expect(() => parseManifest({ ...original, id: '../outside' })).toThrow('URL-safe');
  expect(() => parseManifest({ ...original, category: 'unknown' })).toThrow('category');
  expect(() => validateCollection([original, original])).toThrow('Duplicate');
});

for (const project of websites) {
  test(`${project.id}: independent website loads, refreshes, and fits ${project.platform === 'desktop' ? 'a desktop' : 'a phone'}`, async ({ page }) => {
    if (project.tags.some((tag) => tag.toLowerCase().includes('3d'))) test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`./projects/${project.id}/`);
    const surface = page.locator('#main-content > [data-stage]');
    await expect(surface).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('body')).toHaveAttribute('data-project', project.id);
    await expect(page.locator('iframe, .library-shell, .standalone-site > .experiment-toolbar')).toHaveCount(0);
    await expect(page.locator('.project-app')).toBeVisible();
    expect(await page.locator('.project-app').innerText()).not.toBe('');
    await expect(page.locator('.project-app').getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.reload();
    await expect(surface).toHaveAttribute('data-ready', 'true');
    await page.setViewportSize(project.platform === 'desktop' ? { width: 1280, height: 720 } : { width: 375, height: 812 });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${project.id} must not overflow its supported viewport`).toBe(true);
    await expect(page.locator('.project-trail, #app > .site-header')).toHaveCount(0);
    await openCollectionMenu(page);
    await expect(page.getByRole('link', { name: project.language === 'zh-CN' ? '返回合集' : 'Back to index', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
