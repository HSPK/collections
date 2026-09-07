import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test('decoding actions announce printed tokens while History is inactive', async ({ page }) => {
  await page.goto('./projects/decoding-lab/');
  const root = page.locator('.project-decoding-lab');
  await root.getByRole('tab', { name: 'Settings', exact: true }).click();
  await root.getByRole('button', { name: 'Print 1 token', exact: true }).click();
  await expect(root.getByRole('status').filter({ hasText: /^Printed 1 token/ })).toHaveCount(1);
  await expect(root.getByRole('tab', { name: 'Settings', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('rank-one completion remains announced while Parameters is active', async ({ page }) => {
  await page.goto('./projects/vector-playground/');
  const root = page.locator('.project-vector-playground');
  await root.getByRole('tab', { name: 'Guide', exact: true }).click();
  await root.getByRole('button', { name: 'Try the rank-one challenge' }).click();
  const input = root.locator('[data-vp-number="d"]');
  await input.fill('0');
  await expect(root.getByRole('tab', { name: 'Parameters', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(root.getByRole('status').filter({ hasText: /^Solved: rank 1/ })).toHaveCount(1);
  await expect(input).toBeFocused();
  await root.getByRole('button', { name: 'Reset both labs' }).click();
  await expect(root.getByRole('status').filter({ hasText: /^Solved: rank 1/ })).toHaveCount(0);
});

test('attention routing completion stays announced outside the Challenge pane', async ({ page }) => {
  await page.goto('./projects/attention-studio/');
  const root = page.locator('.project-attention-studio');
  await root.getByRole('tab', { name: 'Challenge', exact: true }).click();
  await root.getByRole('button', { name: 'Start routing challenge', exact: true }).click();
  const input = root.locator('[data-embedding-row="1"][data-embedding-column="0"]');
  await input.fill('4');
  await expect(root).toHaveAttribute('data-challenge-solved', 'true');
  await expect(root.getByRole('status').filter({ hasText: /^Route found!/ })).toHaveCount(1);
  await expect(input).toBeFocused();
});

test('engine transport announcements remain accessible with Parameters selected', async ({ page }) => {
  await page.goto('./projects/engine-room/');
  const root = page.locator('.project-engine-room');
  await root.getByRole('tab', { name: 'Parameters', exact: true }).click();
  await root.locator('[data-reset]').click();
  await expect(root.getByRole('status').filter({ hasText: /^Reset to top dead center/ })).toHaveCount(1);
  await expect(root.getByRole('tab', { name: 'Parameters', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('engine parameter announcements stay inside the active compact dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./projects/engine-room/');
  const root = page.locator('.project-engine-room');
  await root.locator('[data-er-parameters]').click();
  const dialog = root.getByRole('dialog', { name: 'Engine instruments', exact: true });
  await dialog.getByRole('slider', { name: 'Rod / crank ratio', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('status').filter({ hasText: /^Rod length changed/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(root.getByRole('status').filter({ hasText: /^Rod length changed/ })).toHaveCount(1);
  expect(await page.evaluate(() => [scrollY, document.documentElement.scrollHeight])).toEqual([0, 640]);
});
