import { expect, test } from '@playwright/test';
import { readProjectManifests } from '../../scripts/project-pages';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';

const projects = readProjectManifests(process.cwd());
const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
  { width: 768, height: 480 },
];

for (const project of projects.filter(project => project.category !== 'read')) {
  test(`${project.id}: viewport layout keeps standard controls readable and clickable`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`./projects/${project.id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator(`.project-${project.id}`);
    await expect(root).toHaveAttribute('data-workspace', 'true');
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectWorkspaceViewport(page, size.width, size.height);
      expect(await visibleControlProblems(root), `${project.id} at ${size.width}x${size.height}`).toEqual([]);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const size of sizes.filter(size => size.width === 1440 || size.width === 320)) {
      await page.setViewportSize(size);
      await expectWorkspaceViewport(page, size.width, size.height);
      expect(await visibleControlProblems(root), `${project.id}, default motion at ${size.width}x${size.height}`).toEqual([]);
    }
    await expect(page.getByRole('button', { name: 'Collection menu', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('read-oriented websites retain natural document flow and complete reading content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 });
  for (const project of projects.filter(project => project.category === 'read')) {
    await page.goto(`./projects/${project.id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator(`.project-${project.id}[data-workspace="true"]`)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(640);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
});
