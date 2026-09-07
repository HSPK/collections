import { expect, test } from '@playwright/test';
import { readProjectManifests } from '../../scripts/project-pages';

const projects = readProjectManifests(process.cwd()).filter(project => project.order <= 10);
const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
  { width: 768, height: 480 },
];

for (const project of projects) {
  test(`${project.id}: the artwork, transport and control dock form one viewport`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`./projects/${project.id}/`);
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator('.art-website');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    for (const size of sizes) {
      await page.setViewportSize(size);
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      })), `${project.id} at ${size.width}x${size.height}`).toEqual({ ...size, x: 0, y: 0 });
      const toggle = page.locator('[data-art-controls-toggle]');
      if (size.width <= 850) {
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(page.locator('.art-inspector')).toBeVisible();
      const stage = (await page.locator('[data-art-stage]').boundingBox())!;
      expect(stage.height).toBeGreaterThan(120);
      expect(stage.y + stage.height).toBeLessThan(size.height);
      const play = (await page.getByRole('button', { name: 'Play animation', exact: true }).boundingBox())!;
      expect(play.y + play.height).toBeLessThanOrEqual(size.height);
      const range = page.locator('[data-controls] input[type=range]').first();
      if (await range.count()) {
        await range.focus();
        await page.keyboard.press('End');
        await page.keyboard.press('ArrowLeft');
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(size.height);
      if (size.width === 320) {
        await page.screenshot({ path: info.outputPath(`${project.id}-compact-workspace.png`), animations: 'disabled' });
      }
      if (size.width <= 850) {
        await toggle.click();
        await expect(page.locator('.art-inspector')).not.toBeVisible();
      }
    }
    await page.getByRole('button', { name: /Studio notes/ }).click();
    const notes = page.getByRole('dialog', { name: 'Studio notes', exact: true });
    await expect(notes).toBeVisible();
    await expect(notes).toContainText(project.description);
    await page.keyboard.press('Escape');
    await expect(notes).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Studio notes/ })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(480);
    expect(errors).toEqual([]);
  });
}
