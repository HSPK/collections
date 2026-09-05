import { expect, test } from '@playwright/test';
import type { Download } from '@playwright/test';

const storageKey = 'letters-from-elsewhere:kept:v1';
const places = [
  ['aster-quay', 'Aster Quay'],
  ['bellwether-steps', 'Bellwether Steps'],
  ['morrowmere', 'Morrowmere'],
  ['threadfall', 'Threadfall'],
  ['orchard-of-tides', 'Orchard of Tides'],
  ['paper-fen', 'Paper Fen'],
  ['cinderstep', 'Cinderstep'],
  ['lantern-end', 'Lantern End'],
] as const;

async function downloadContents(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The postcard download did not provide a readable stream.');
  let result = '';
  for await (const chunk of stream) result += chunk.toString();
  return result;
}

test.use({ viewport: { width: 1280, height: 900 } });

test('the directory and keyboard-operable map select the same postcard', async ({ page }) => {
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await expect(site.getByRole('heading', { name: 'Letters from Elsewhere', exact: true })).toBeVisible();
  await expect(site.locator('.pp-directory button')).toHaveCount(8);
  await expect(site.locator('.pp-map-marker')).toHaveCount(8);

  const directoryButton = site.locator('.pp-directory [data-place="morrowmere"]');
  await directoryButton.click();
  await expect(directoryButton).toBeFocused();
  await expect(directoryButton).toHaveAttribute('aria-pressed', 'true');
  await expect(site.locator('.pp-map [data-place="morrowmere"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(site.locator('[data-letter-title]')).toHaveText('The morning can wait');

  const mapButton = site.getByRole('button', { name: 'Visit Threadfall, stop 4 of 8', exact: true });
  await mapButton.focus();
  await page.keyboard.press('Enter');
  await expect(mapButton).toBeFocused();
  await expect(mapButton).toHaveAttribute('aria-pressed', 'true');
  await expect(directoryButton).toHaveAttribute('aria-pressed', 'false');
  await expect(site.locator('.pp-directory [data-place="threadfall"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(site.locator('[data-letter-title]')).toHaveText('What the knots are for');
  await expect(site.locator('[data-status]')).toContainText('Stop 4 of 8: Threadfall.');
});

test('every postcard has a distinct landscape and a complete four-paragraph addressed letter', async ({ page }) => {
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  const sceneDescriptions = new Set<string>();

  for (const [id, name] of places) {
    await site.locator(`.pp-directory [data-place="${id}"]`).click();
    await site.getByRole('button', { name: 'Picture side', exact: true }).click();
    await expect(site.locator('[data-front]')).toBeVisible();
    await expect(site.locator('[data-back]')).toBeHidden();
    await expect(site.locator('.pp-destination-name')).toHaveText(name);
    const description = await site.locator('.pp-landscape').getAttribute('aria-label');
    expect(description).toBeTruthy();
    sceneDescriptions.add(description ?? '');

    await site.getByRole('button', { name: 'Letter side', exact: true }).click();
    await expect(site.getByRole('button', { name: 'Letter side', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(site.locator('[data-front]')).toBeHidden();
    await expect(site.locator('[data-back]')).toBeVisible();
    const paragraphs = site.locator('.pp-letter-paragraphs > p');
    await expect(paragraphs).toHaveCount(4);
    for (const paragraph of await paragraphs.all()) await expect(paragraph).toBeVisible();
    const body = (await paragraphs.allTextContents()).join(' ');
    expect(body.trim().split(/\s+/).length).toBeGreaterThan(200);
    await expect(site.locator('.pp-salutation')).toHaveText('Dear Kit,');
    await expect(site.locator('.pp-address address')).toContainText('Kit');
    await expect(site.locator('.pp-signoff')).toContainText('Mara');
    await expect(site.locator('[data-status]')).toContainText('The complete letter is now open.');
  }

  expect(sceneDescriptions.size).toBe(8);
  await site.locator('[data-action="turn"]').click();
  await expect(site.locator('[data-front]')).toBeVisible();
  await expect(site.locator('[data-back]')).toBeHidden();
  await expect(site.locator('[data-letter-title]')).toBeFocused();
});

test('previous and next follow the bounded route and retain the reading side', async ({ page }) => {
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await expect(site.locator('[data-action="previous"]')).toBeDisabled();
  await site.getByRole('button', { name: 'Letter side', exact: true }).click();
  await site.getByRole('button', { name: 'Next place: Bellwether Steps', exact: true }).click();
  await expect(site.locator('[data-letter-title]')).toHaveText('A landing is a place, too');
  await expect(site.locator('[data-back]')).toBeVisible();
  await expect(site.locator('[data-route-position]')).toHaveText('02 / 08');
  await site.getByRole('button', { name: 'Next place: Morrowmere', exact: true }).click();
  await site.getByRole('button', { name: 'Previous place: Bellwether Steps', exact: true }).click();
  await expect(site.locator('[data-route-position]')).toHaveText('02 / 08');
  await site.locator('.pp-directory [data-place="lantern-end"]').click();
  await expect(site.locator('[data-action="next"]')).toBeDisabled();
  await site.getByRole('button', { name: 'Previous place: Cinderstep', exact: true }).click();
  await expect(site.locator('[data-letter-title]')).toHaveText('The warmth we borrow');
  await expect(site.locator('[data-route-position]')).toHaveText('07 / 08');
});

test('kept letters persist, reopen for reading, and can be individually removed', async ({ page }) => {
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await site.locator('[data-action="keep"]').click();
  await expect(site.locator('[data-kept-marker="aster-quay"]')).toBeVisible();
  await site.locator('.pp-directory [data-place="paper-fen"]').click();
  await site.locator('[data-action="keep"]').click();
  await expect(site.locator('[data-kept-list] li')).toHaveCount(2);

  await page.reload();
  await expect(site.locator('[data-action="keep"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(site.locator('[data-kept-list] li')).toHaveCount(2);
  await site.getByRole('button', { name: 'Open kept letter from Paper Fen', exact: true }).click();
  await expect(site.locator('[data-letter-title]')).toHaveText('Instructions for an imperfect boat');
  await expect(site.locator('[data-letter-title]')).toBeFocused();
  await expect(site.locator('[data-back]')).toBeVisible();

  await site.locator('[data-remove-kept="aster-quay"]').click();
  await expect(site.locator('[data-kept-list] li')).toHaveCount(1);
  await expect(site.locator('[data-remove-kept="paper-fen"]')).toBeFocused();
  await site.locator('[data-remove-kept="paper-fen"]').click();
  await expect(site.locator('[data-kept-empty]')).toBeVisible();
  await expect(site.locator('#postcards-kept-title')).toBeFocused();
  await expect(site.locator('[data-action="kept-download"]')).toBeDisabled();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, storageKey))
    .toEqual({ version: 1, ids: [] });
});

test('letter, offline postcard, and kept-letter downloads contain complete usable content', async ({ page }) => {
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  const letterPromise = page.waitForEvent('download');
  await site.locator('[data-action="letter-download"]').click();
  const letter = await letterPromise;
  expect(letter.suggestedFilename()).toBe('letter-from-aster-quay.txt');
  const text = await downloadContents(letter);
  expect(text).toContain('Fictional places, people, and correspondence.');
  expect(text).toContain('The chair at the end of the pier');
  expect(text).toContain('You are allowed to do that too.');
  expect(text).toContain('17 Ordinary Street');

  const postcardPromise = page.waitForEvent('download');
  await site.locator('[data-action="postcard-download"]').click();
  const postcard = await postcardPromise;
  expect(postcard.suggestedFilename()).toBe('postcard-from-aster-quay.html');
  const html = await downloadContents(postcard);
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<svg');
  expect(html).toContain('aria-label="Picture side"');
  expect(html).toContain('aria-label="Letter side"');
  expect(html).toContain('You are allowed to do that too.');
  expect(html).not.toMatch(/<script\b|<iframe\b|(?:src|href)=["']https?:/i);

  await site.locator('[data-action="keep"]').click();
  await site.locator('.pp-directory [data-place="lantern-end"]').click();
  await site.locator('[data-action="keep"]').click();
  const satchelPromise = page.waitForEvent('download');
  await site.locator('[data-action="kept-download"]').click();
  const satchel = await satchelPromise;
  expect(satchel.suggestedFilename()).toBe('letters-from-elsewhere-satchel.txt');
  const collection = await downloadContents(satchel);
  expect(collection).toContain('The chair at the end of the pier');
  expect(collection).toContain('Leave the little light on');
  expect(collection.indexOf('The chair at the end of the pier')).toBeLessThan(collection.indexOf('Leave the little light on'));
});

test('malformed saved state is rejected without rendering unknown content', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, ids: ['<img src=x onerror=alert(1)>'] }));
  }, storageKey);
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await expect(site.locator('[data-status]')).toContainText('older or invalid format');
  await expect(site.locator('[data-kept-empty]')).toBeVisible();
  await expect(site.locator('[data-kept-list] li')).toHaveCount(0);
  await expect(site.locator('img')).toHaveCount(0);
  await site.locator('[data-action="keep"]').click();
  await expect(site.locator('[data-kept-list] li')).toHaveCount(1);
  await expect(site.locator('[data-status]')).toContainText('saved in this browser');
});

test('blocked storage and clipboard have explicit, useful fallbacks', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage is blocked for this test.', 'SecurityError'); };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Clipboard is blocked for this test.', 'NotAllowedError')) },
    });
  });
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await site.locator('[data-action="keep"]').click();
  await expect(site.locator('[data-status]')).toContainText('kept for this visit only');
  await expect(site.locator('[data-storage-note]')).toContainText('Session only');
  await expect(site.locator('[data-kept-list] li')).toHaveCount(1);
  await site.locator('[data-action="copy"]').click();
  await expect(site.locator('[data-status]')).toContainText('blocked copying');
  await expect(site.locator('[data-status]')).toContainText('manual selection');
  await expect(site.locator('[data-back]')).toBeVisible();
  await expect(site.locator('[data-action="copy"]')).toBeEnabled();
  await expect(site.locator('[data-action="letter-download"]')).toBeEnabled();
});

test('the 375px layout shows the postcard first and stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./projects/postcards/');
  const site = page.locator('.project-postcards');
  await expect(site.locator('.pp-picture')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await site.locator('.pp-map-marker').all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await site.locator('.pp-directory [data-place="orchard-of-tides"]').click();
  await expect(site.locator('[data-letter-title]')).toBeFocused();
  await expect(site.locator('.pp-destination-name')).toHaveText('Orchard of Tides');
  await site.getByRole('button', { name: 'Letter side', exact: true }).click();
  await expect(site.locator('.pp-letter-paragraphs > p')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await site.locator('[data-action="keep"]').click();
  await expect(site.locator('[data-action="keep"]')).toHaveAttribute('aria-pressed', 'true');
});
