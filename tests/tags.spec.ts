import { expect, test } from '@playwright/test';
import { collectTags, matchesTags, normalizeTag } from '../src/core/tags';
import { readProjectManifests } from '../scripts/project-pages';
import { returnToCollection } from './helpers/navigation';

const projects = readProjectManifests(process.cwd());
const spatialCount = projects.filter((project) => matchesTags(project, ['Spatial flagship'])).length;
const storageKey = 'odd-index:library:v2';

test('Tag facets normalize case and whitespace and count each project once', () => {
  const input = [
    { tags: ['3D', '  3d  ', 'AI   education'] },
    { tags: ['3d', 'Math'] },
    { tags: ['AI education'] },
  ];
  const before = JSON.stringify(input);
  expect(normalizeTag('  AI \t education  ')).toBe('ai education');
  expect(collectTags(input)).toEqual([
    { key: '3d', label: '3D', count: 2 },
    { key: 'ai education', label: 'AI education', count: 2 },
    { key: 'math', label: 'Math', count: 1 },
  ]);
  expect(JSON.stringify(input)).toBe(before);
  expect(() => collectTags([{ tags: [' '] }])).toThrow('readable label');
});

test('Selected tags are an intersection, not unrelated text matches', () => {
  const project = { tags: ['Spatial flagship', '3D', 'Robotics'] };
  expect(matchesTags(project, [])).toBe(true);
  expect(matchesTags(project, [' 3d ', 'spatial FLAGSHIP'])).toBe(true);
  expect(matchesTags(project, ['3D', 'Astronomy'])).toBe(false);
  expect(matchesTags(project, ['spatial'])).toBe(false);
  expect(collectTags([project].filter((item) => matchesTags(item, ['3D']))).find((tag) => tag.key === 'robotics')?.count).toBe(1);
});

test('The left sidebar combines tags with category and search and preserves focus and browse state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./');
  const sidebar = page.getByRole('complementary', { name: 'Project filters' });
  const tags = sidebar.getByRole('searchbox', { name: 'Search tags', exact: true });
  await tags.fill('spatial');
  const spatial = sidebar.getByRole('checkbox', { name: 'Spatial flagship', exact: true });
  await spatial.check();
  await expect(spatial).toBeFocused();
  await expect(page.locator('.project-card')).toHaveCount(spatialCount);
  await page.screenshot({ path: test.info().outputPath('tags-sidebar.png') });
  await tags.fill('');
  await sidebar.getByRole('checkbox', { name: '3D', exact: true }).check();
  await expect(page.locator('.project-card')).toHaveCount(spatialCount);
  await page.locator('[data-filter="create"]').click();
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('Morrow');
  await sidebar.getByRole('checkbox', { name: 'Robotics', exact: true }).check();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(sidebar.getByRole('checkbox', { name: 'AI education', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Sort projects', exact: true }).selectOption('newest');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator('.project-open[data-project="morrow"]').click();
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await returnToCollection(page);
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toHaveValue('Morrow');
  await expect(page.locator('[data-filter="create"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Sort projects', exact: true })).toHaveValue('newest');
  for (const tag of ['Spatial flagship', '3D', 'Robotics']) {
    await expect(sidebar.getByRole('checkbox', { name: tag, exact: true })).toBeChecked();
  }
  await sidebar.getByRole('button', { name: 'Remove Robotics tag', exact: true }).click();
  await expect(tags).toBeFocused();
  await sidebar.getByRole('button', { name: 'Clear tags', exact: true }).click();
  await expect(tags).toBeFocused();
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toHaveValue('Morrow');
  await expect(page.locator('[data-filter="create"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.project-card')).toHaveCount(1);
  expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).tags, storageKey)).toEqual([]);
});

test('An empty tag/category intersection remains reversible and Clear filters resets every facet', async ({ page }) => {
  await page.goto('./');
  const sidebar = page.locator('.library-sidebar');
  await sidebar.getByRole('checkbox', { name: 'Spatial flagship', exact: true }).check();
  await sidebar.getByRole('checkbox', { name: 'Robotics', exact: true }).check();
  await page.locator('[data-filter="learn"]').click();
  await expect(page.locator('.project-card')).toHaveCount(0);
  const selected = sidebar.getByRole('checkbox', { name: 'Robotics', exact: true });
  await expect(selected).toBeChecked();
  await expect(selected).toBeEnabled();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(projects.length);
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toBeFocused();
  await expect(selected).not.toBeChecked();
});

test('Existing browse settings migrate without losing their category, query or layout', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    sessionStorage.setItem(key, JSON.stringify({ category: 'create', query: 'Pixel Loom', layout: 'list', sort: 'az', scroll: 0 }));
  }, { key: storageKey });
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('[data-project-grid]')).toHaveClass(/project-grid--list/);
  await expect(page.locator('[data-filter="create"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Sort projects', exact: true })).toHaveValue('az');
  await expect(page.getByRole('searchbox', { name: 'Search projects', exact: true })).toHaveValue('Pixel Loom');
  await expect(page.locator('[data-storage-note]')).toBeHidden();
  expect(await page.locator('.library-sidebar [data-tag-key]:checked').count()).toBe(0);
});

test('Removed saved tags are reported while other valid preferences and canonical tags survive', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    sessionStorage.setItem(key, JSON.stringify({ category: 'all', query: '', layout: 'grid', sort: 'newest', scroll: 0, tags: [' 3D ', 'no-longer-a-project-tag'] }));
  }, { key: storageKey });
  await page.goto('./');
  await expect(page.locator('[data-storage-note]')).toContainText('Some saved tags are no longer available');
  await expect(page.locator('.library-sidebar').getByRole('checkbox', { name: '3D', exact: true })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Sort projects', exact: true })).toHaveValue('newest');
  await expect(page.locator('.project-card')).toHaveCount(projects.filter((project) => matchesTags(project, ['3D'])).length);
});

for (const width of [375, 320]) {
  test(`At ${width}px tags remain accessible without moving the fixed header or search`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    const headerY = (await page.locator('.site-header').boundingBox())!.y;
    const searchY = (await page.locator('.library-tools').boundingBox())!.y;
    const opener = page.getByRole('button', { name: 'Filter projects by tags', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Filter by tags', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox', { name: 'Search tags', exact: true })).toBeFocused();
    await dialog.getByRole('searchbox', { name: 'Search tags', exact: true }).fill('spatial');
    await dialog.getByRole('checkbox', { name: 'Spatial flagship', exact: true }).check();
    await page.screenshot({ path: test.info().outputPath(`tags-${width}-dialog.png`) });
    await dialog.getByRole('button', { name: `Show ${spatialCount} projects`, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('.project-card')).toHaveCount(spatialCount);
    await page.screenshot({ path: test.info().outputPath(`tags-${width}-library.png`) });
    await page.locator('[data-project-grid]').evaluate((list) => { list.scrollTop = 700; });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await page.locator('.site-header').boundingBox())!.y).toBe(headerY);
    expect((await page.locator('.library-tools').boundingBox())!.y).toBe(searchY);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await opener.click();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Find a project', exact: true })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await page.reload();
    await expect(page.locator('.project-card')).toHaveCount(spatialCount);
    await expect(page.locator('[data-tags-count]')).toHaveText('1');
  });
}
