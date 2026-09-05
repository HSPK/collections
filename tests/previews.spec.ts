import { expect, test } from '@playwright/test';

const ids = ['orbital', 'flow', 'soft', 'terrain', 'chroma', 'echo', 'gravity', 'type', 'fold', 'ribbon'];

test.describe('Artwork editions', () => {
  test.skip(!process.env.UPDATE_PREVIEWS, 'Run npm run test:update-previews to regenerate the gallery images.');
  test.use({ viewport: { width: 1322, height: 1160 }, deviceScaleFactor: 1 });
  for (const id of ids) {
    test(`Capture ${id}`, async ({ page }) => {
      await page.goto(`./#/experiment/${id}`);
      const stage = page.locator('[data-stage]');
      await expect(stage).toHaveAttribute('data-ready', 'true');
      await page.waitForTimeout(id === 'flow' ? 5500 : 2200);
      await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
      await page.addStyleTag({ content: '.stage-hint { visibility: hidden !important; }' });
      await stage.screenshot({ path: `public/previews/${id}.jpg`, type: 'jpeg', quality: 88, animations: 'disabled' });
    });
  }
});
