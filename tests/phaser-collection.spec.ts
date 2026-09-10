import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readProjectManifests, renderProjectDocument } from '../scripts/project-pages';
import { parseManifest } from '../src/core/manifest';

const ids = ['cat-shift', 'marble-parley', 'dream-sorter', 'cloud-rescue', 'paper-watch'];
const projects = readProjectManifests(process.cwd());
const games = projects.filter(project => project.tags.includes('Phaser'));

test('desktop support metadata is explicit without changing existing project contracts', () => {
  const original = projects.find(project => project.id === 'nonogram')!;
  expect(parseManifest(original).platform).toBeUndefined();
  const desktop = parseManifest({ ...original, platform: 'desktop' });
  expect(desktop.platform).toBe('desktop');
  expect(renderProjectDocument(readFileSync('index.html', 'utf8'), desktop, true)).toContain('data-platform="desktop"');
  for (const platform of ['mobile', 1, null, []]) expect(() => parseManifest({ ...original, platform })).toThrow('platform');
});

test('five real Phaser games register as desktop-first Chinese model-required independent sites', () => {
  expect(games.map(game => game.id).sort()).toEqual([...ids].sort());
  expect(games.map(game => game.order).sort((a, b) => a - b)).toEqual([87, 88, 89, 90, 91]);
  for (const game of games) {
    expect(game.language).toBe('zh-CN');
    expect(game.platform).toBe('desktop');
    expect(game.runtime).toBe('openai-compatible');
    expect(game.tags).toContain('Agent games');
  }
  expect(projects.filter(project => project.order <= 86).every(project => project.platform !== 'desktop')).toBe(true);
});

test('the library discloses desktop input without downloading Phaser or contacting a model', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  await page.locator('[data-library-search]').fill('Phaser');
  await expect(page.locator('.project-card')).toHaveCount(5);
  await expect(page.locator('.card-platform')).toHaveCount(5);
  await expect(page.locator('.card-requirement')).toHaveCount(5);
  expect(requests.filter(url => /\/(?:phaser[^/]*\.js|chat\/completions|api\/openai\/v1\/models)/.test(url))).toEqual([]);
});

for (const id of ids) {
  test(`${id}: real Phaser scene, Chinese settings and desktop controls exist without an eager API turn`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const calls: string[] = [], errors: string[] = [];
    page.on('request', request => {
      if (/\/(?:chat\/completions|models)(?:\?|$)/.test(request.url())) calls.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`./projects/${id}/`);
    const root = page.locator(`.project-${id}`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    await expect(root.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(root.locator('[data-phaser-ready="true"]')).toHaveAttribute('data-phaser-version', '4.2.1');
    await expect(root.locator('.phaser-stage > canvas')).toHaveCount(1);
    const connect = root.locator('[data-agent-connect]');
    await connect.click();
    await expect(root.getByRole('dialog', { name: '模型连接', exact: true })).toBeVisible();
    await expect(root.locator('.phaser-stage')).toHaveAttribute('data-phaser-paused', 'true');
    await page.keyboard.press('Escape');
    await expect(connect).toBeFocused();
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}
