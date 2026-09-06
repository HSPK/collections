import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __sectionWorkerConstructor: typeof Worker;
  }
}

test('Section surfaces a blocked worker and recovers without losing its construction', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/section/');
  const root = page.locator('.project-section');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await expect(root).toHaveAttribute('data-computing', 'false');
  const title = await page.locator('[data-title]').innerText();
  await page.evaluate(() => {
    window.__sectionWorkerConstructor = window.Worker;
    window.Worker = new Proxy(window.Worker, {
      construct() { throw new DOMException('Blocked by document policy.', 'SecurityError'); },
    });
  });
  const offset = page.getByRole('spinbutton', { name: 'Exact section offset', exact: true });
  try {
    await offset.fill('12');
    await offset.press('Tab');
    await expect(root).toHaveAttribute('data-computing', 'error');
    await expect(page.locator('[data-error]')).toContainText('SecurityError');
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    await expect(page.locator('[data-action="svg"]')).toBeDisabled();
    await expect(page.locator('[data-title]')).toHaveText(title);
  } finally {
    await page.evaluate(() => { window.Worker = window.__sectionWorkerConstructor; });
  }
  await offset.fill('14');
  await offset.press('Tab');
  await expect(root).toHaveAttribute('data-computing', 'false');
  await expect(page.locator('[data-error]')).toBeHidden();
  await expect(page.locator('[data-action="svg"]')).toBeEnabled();
  await expect(page.locator('[data-title]')).toHaveText(title);
  expect(errors).toEqual([]);
});
