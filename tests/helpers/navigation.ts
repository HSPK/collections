import { expect, type Page } from '@playwright/test';

export async function openCollectionMenu(page: Page): Promise<void> {
  const chinese = await page.locator('html').getAttribute('lang') === 'zh-CN';
  const toggle = page.getByRole('button', { name: chinese ? '项目导航' : 'Collection menu', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

export async function returnToCollection(page: Page): Promise<void> {
  await openCollectionMenu(page);
  const chinese = await page.locator('html').getAttribute('lang') === 'zh-CN';
  await page.getByRole('link', { name: chinese ? '返回合集' : 'Back to index', exact: true }).click();
}
