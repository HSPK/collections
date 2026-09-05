import { expect, test } from '@playwright/test';
import { stories } from '../../src/projects/newspaper/data';

const address = './projects/newspaper/';
const storageKey = 'signals-from-2086:reader:v1';

test('newspaper: the complete front page opens all seven original stories', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(address);
  const paper = page.locator('.project-newspaper');
  await expect(paper.getByRole('heading', { level: 1, name: 'Signals from 2086' })).toBeVisible();
  await expect(paper.locator('.nw-fiction-bar')).toContainText('Fictional future publication');
  await expect(paper.locator('[data-story]')).toHaveCount(7);
  await expect(paper.getByRole('img')).toHaveCount(7);

  for (const story of stories) {
    await paper.getByRole('heading', { name: story.title, exact: true }).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`#article/${story.id}$`));
    await expect(paper.locator('[data-open-story]')).toHaveAttribute('data-open-story', story.id);
    await expect(paper.getByRole('heading', { name: story.title, exact: true })).toBeVisible();
    const paragraphs = paper.locator('.nw-prose > p:not(.nw-story-dateline):not(.nw-endmark)');
    await expect(paragraphs).toHaveCount(story.paragraphs.length);
    const words = (await paragraphs.allTextContents()).join(' ').split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(250);
    expect(words).toBeLessThanOrEqual(450);
    await expect(paper.getByRole('img', { name: story.imageDescription, exact: true })).toBeVisible();
    await expect(paper.getByRole('complementary', { name: 'Story notes' })).toBeVisible();
    await expect(paper.getByRole('navigation', { name: 'Continue reading' }).getByRole('link')).toHaveCount(2);
    await page.goBack();
    await expect(paper).toHaveAttribute('data-view', 'front');
  }
  expect(errors).toEqual([]);
});

test('newspaper: section and article hashes survive reload, back, and forward', async ({ page }) => {
  await page.goto(`${address}#section/city`);
  const paper = page.locator('.project-newspaper');
  await expect(paper.getByRole('heading', { name: 'City & commons', exact: true })).toBeVisible();
  await expect(paper.locator('[data-story]')).toHaveCount(2);
  await expect(paper.locator('[data-nav="city"]')).toHaveAttribute('aria-current', 'page');
  await paper.getByRole('heading', { name: 'The 07:12 arrives without making an entrance' }).getByRole('link').click();
  await expect(paper.locator('[data-route-heading]')).toBeFocused();
  await expect(paper.locator('[data-nav="city"]')).toHaveAttribute('aria-current', 'location');
  await page.reload();
  await expect(paper.locator('[data-open-story]')).toHaveAttribute('data-open-story', 'quiet-line');
  await page.goBack();
  await expect(paper).toHaveAttribute('data-view', 'section');
  await expect(paper.getByRole('heading', { name: 'City & commons', exact: true })).toBeVisible();
  await page.goForward();
  await expect(paper.locator('[data-open-story]')).toHaveAttribute('data-open-story', 'quiet-line');
  await paper.getByRole('navigation', { name: 'Newspaper sections' }).getByRole('link', { name: 'Off-world', exact: true }).click();
  await expect(page).toHaveURL(/#section\/off-world$/);
  await expect(paper.locator('[data-story]')).toHaveCount(1);
  await page.reload();
  await expect(paper.getByRole('heading', { name: 'Off-world', exact: true })).toBeVisible();
});

test('newspaper: reading choices persist and the last removed item leaves an honest empty state', async ({ page }) => {
  await page.goto(`${address}#article/moon-seed-library`);
  const paper = page.locator('.project-newspaper');
  await paper.getByRole('button', { name: 'Save for later', exact: true }).click();
  await expect(paper.getByRole('button', { name: 'Saved to reading list' })).toHaveAttribute('aria-pressed', 'true');
  await expect(paper.locator('[data-saved-count]')).toHaveText('1');
  await paper.getByRole('button', { name: 'Larger type', exact: true }).click();
  await expect(paper).toHaveAttribute('data-type', 'large');
  await page.reload();
  await expect(paper.getByRole('button', { name: 'Larger type', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(paper.getByRole('button', { name: 'Saved to reading list' })).toHaveAttribute('aria-pressed', 'true');
  await paper.locator('[data-nav="saved"]').click();
  await expect(paper.getByRole('heading', { name: 'Your reading list', exact: true })).toBeVisible();
  await expect(paper.locator('[data-story]')).toHaveCount(1);
  await paper.getByRole('button', { name: 'Remove A seed library at the edge of the lunar night from reading list', exact: true }).click();
  await expect(paper.getByRole('heading', { name: 'No stories saved yet', exact: true })).toBeVisible();
  await expect(paper.locator('[data-saved-count]')).toHaveText('0');
  await expect(paper.locator('[data-route-heading]')).toBeFocused();
  await page.reload();
  await expect(paper.locator('[data-story]')).toHaveCount(0);
  await expect(paper.getByRole('heading', { name: 'No stories saved yet', exact: true })).toBeVisible();
});

test('newspaper: unknown and malformed hashes are not silently replaced by an article', async ({ page }) => {
  for (const hash of ['#article/no-such-story', '#section/no-such-section', '#article/%3Cscript%3E', '#article/%E0%A4%A']) {
    await page.goto(`${address}${hash}`);
    const paper = page.locator('.project-newspaper');
    await expect(paper.getByRole('heading', { name: 'That page is not in this edition', exact: true })).toBeVisible();
    await expect(paper.locator('[data-open-story]')).toHaveCount(0);
    await expect(paper.locator('.nw-missing script')).toHaveCount(0);
    await paper.getByRole('link', { name: 'Return to the front page', exact: true }).click();
    await expect(paper).toHaveAttribute('data-view', 'front');
  }
});

test('newspaper: keyboard reading works at 375px without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(address);
  const paper = page.locator('.project-newspaper');
  const noOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };
  await expect(paper.getByRole('heading', { level: 1, name: 'Signals from 2086' })).toBeVisible();
  await noOverflow();
  await paper.getByRole('button', { name: 'Larger type', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(paper).toHaveAttribute('data-type', 'large');
  await paper.getByRole('link', { name: 'Skip to the stories', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(paper.locator('[data-route-heading]')).toBeFocused();
  await expect(page).not.toHaveURL(/#nw-content$/);
  await paper.getByRole('navigation', { name: 'Newspaper sections' }).getByRole('link', { name: 'Culture', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(paper.getByRole('heading', { name: 'Culture', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(paper.getByRole('link', { name: 'At the repair hall, a second life has a sound', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(paper.locator('[data-open-story]')).toHaveAttribute('data-open-story', 'repair-choir');
  await expect(paper.locator('[data-route-heading]')).toBeFocused();
  await noOverflow();
  const notice = await paper.locator('.nw-fiction-bar').boundingBox();
  expect(notice).not.toBeNull();
  expect(notice!.y).toBeGreaterThanOrEqual(0);
  expect(notice!.y).toBeLessThanOrEqual(1);
});

test('newspaper: invalid local data is visibly reported rather than trusted', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, saved: ['not-a-story'], largeType: false }));
  }, storageKey);
  await page.goto(address);
  const paper = page.locator('.project-newspaper');
  await expect(paper.locator('[data-reader-status]')).toContainText('older or invalid format');
  await expect(paper.locator('[data-saved-count]')).toHaveText('0');
  await expect(paper.locator('[data-story]')).toHaveCount(7);
});

test('newspaper: blocked storage preserves the working reading list for this session', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value() { throw new DOMException('Storage is blocked for this test.', 'SecurityError'); },
    });
  });
  await page.goto(`${address}#article/cloud-library`);
  const paper = page.locator('.project-newspaper');
  await paper.getByRole('button', { name: 'Save for later', exact: true }).click();
  await expect(paper.locator('[data-reader-status]')).toContainText('could not save');
  await expect(paper.getByRole('button', { name: 'Saved to reading list' })).toHaveAttribute('aria-pressed', 'true');
  await paper.locator('[data-nav="saved"]').click();
  await expect(paper.locator('[data-story]')).toHaveCount(1);
  await expect(paper.locator('[data-reader-status]')).toBeVisible();
});
