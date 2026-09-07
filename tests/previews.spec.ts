import { expect, test } from '@playwright/test';
import { readProjectManifests } from '../scripts/project-pages';

const projects = readProjectManifests(process.cwd()).sort((a, b) => a.order - b.order);

test.describe('Project covers', () => {
  test.skip(!process.env.UPDATE_PREVIEWS, 'Run npm run test:update-previews to regenerate actual site covers.');
  test.use({ viewport: { width: 1322, height: 1160 }, deviceScaleFactor: 1 });
  for (const project of projects) {
    test(`Capture ${project.id}`, async ({ page }) => {
      test.skip(Boolean(project.preview && !project.preview.endsWith('.jpg')), 'This project supplies its own preview asset.');
      const viewportHeight = project.category === 'read' ? 1160 : 900;
      await page.setViewportSize({ width: 1322, height: viewportHeight });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`./projects/${project.id}/`);
      const surface = page.locator('#main-content > [data-stage]');
      await expect(surface).toHaveAttribute('data-ready', 'true');
      await page.waitForTimeout(300);
      await page.addStyleTag({ content: '.collection-menu, .project-feedback { visibility: hidden !important; }' });
      const focus = surface.locator('[data-project-preview]').first();
      const target = await focus.count() ? focus : surface;
      await target.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
      const bounds = (await target.boundingBox())!;
      const top = Math.max(0, bounds.y);
      await page.screenshot({
        path: `public/previews/${project.id}.jpg`,
        type: 'jpeg',
        quality: 88,
        animations: 'disabled',
        clip: { x: 0, y: top, width: 1322, height: Math.min(850, Math.max(400, bounds.height), viewportHeight - top) },
      });
    });
  }

  test('Capture collection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 756 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await expect(page.locator('.project-card')).toHaveCount(projects.length);
    await page.locator('[data-project-grid]').evaluate(async (list) => {
      list.scrollTop = 0;
      const viewport = list.getBoundingClientRect();
      for (const card of list.querySelectorAll('.project-card')) {
        const bounds = card.getBoundingClientRect();
        if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
        const image = card.querySelector('img');
        if (!image) throw new Error('A visible project card is missing its preview.');
        await image.decode();
      }
    });
    await page.screenshot({ path: 'public/cover.jpg', type: 'jpeg', quality: 90, animations: 'disabled' });
  });
});
