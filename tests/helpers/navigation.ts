import { expect, type Page } from '@playwright/test';

export async function openCollectionMenu(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Collection menu', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

export async function returnToCollection(page: Page): Promise<void> {
  await openCollectionMenu(page);
  await page.getByRole('link', { name: 'Back to index', exact: true }).click();
}
