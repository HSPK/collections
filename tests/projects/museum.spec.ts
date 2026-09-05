import { expect, test } from '@playwright/test';
import type { Download } from '@playwright/test';

async function downloadedText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The catalog download did not produce a readable file.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

test.describe('The Museum of Unmade Things', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./projects/museum/');
    await expect(page.locator('.project-museum h1')).toHaveText(/The Museum of\s*Unmade Things/);
  });

  test('shows ten substantial wall labels and ten distinct accessible object studies', async ({ page }) => {
    const museum = page.locator('.project-museum');
    const gallery = museum.locator('[data-museum-gallery]');
    const titles = [
      'Portable Horizon',
      'Tuesday Preserver',
      'Compass for Second Thoughts',
      'Letterweight for Unsent Words',
      'Hinge for an Absent Room',
      'Listening Thimble',
      'Window for Borrowed Weather',
      'Rain Receipt',
      'Foldable Pause',
      'Shadow Mender',
    ];
    await expect(gallery.getByRole('article')).toHaveCount(10);
    await expect(gallery.getByRole('heading', { level: 3 })).toHaveText(titles);
    await expect(gallery.getByRole('img')).toHaveCount(10);
    await expect(museum.getByText('A fictional museum of impossible design', { exact: true })).toBeVisible();
    for (const title of titles) {
      const object = gallery.getByRole('article').filter({
        has: page.getByRole('heading', { name: title, exact: true }),
      });
      expect((await object.locator('.museum-label-summary').innerText()).length).toBeGreaterThan(150);
      await expect(object.locator('.museum-object-origin')).toContainText('Imagined object');
      await expect(object.getByRole('img')).toHaveAccessibleName(new RegExp(title));
      await expect(object.getByRole('button', { name: `Read the story of ${title}`, exact: true })).toBeVisible();
    }
    const studies = await gallery.locator('svg').evaluateAll((svgs) => svgs.map((svg) => svg.querySelector('g')?.innerHTML));
    expect(new Set(studies).size).toBe(10);
    await museum.getByRole('link', { name: "Curator's note", exact: true }).click();
    await expect(museum.getByRole('heading', { name: /Why keep what\s*cannot be made/ })).toBeInViewport();
  });

  test('filters all four rooms with correct counts and preserves the selected control focus', async ({ page }) => {
    const museum = page.locator('.project-museum');
    const gallery = museum.locator('[data-museum-gallery]');
    const filters = [
      { name: 'Distance & direction, 3 objects', count: 3, title: 'Portable Horizon' },
      { name: 'Time & its keeping, 2 objects', count: 2, title: 'Tuesday Preserver' },
      { name: 'Things left unsaid, 2 objects', count: 2, title: 'Letterweight for Unsent Words' },
      { name: 'Domestic impossibilities, 3 objects', count: 3, title: 'Hinge for an Absent Room' },
    ];
    for (const filter of filters) {
      const button = museum.getByRole('button', { name: filter.name, exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toBeFocused();
      await expect(gallery.getByRole('article')).toHaveCount(filter.count);
      await expect(gallery.getByRole('heading', { level: 3 }).first()).toHaveText(filter.title);
      await expect(museum.locator('[data-museum-results]')).toContainText(`${filter.count} imagined objects on view`);
      await expect(museum.locator('[data-museum-room][aria-pressed="true"]')).toHaveCount(1);
    }
    await museum.getByRole('button', { name: 'All rooms, 10 objects', exact: true }).click();
    await expect(gallery.getByRole('article')).toHaveCount(10);
  });

  test('opens a complete reading dialog and returns keyboard focus after Escape or close', async ({ page }) => {
    const museum = page.locator('.project-museum');
    const trigger = museum.getByRole('button', { name: 'Read the story of Portable Horizon', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = museum.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Portable Horizon', exact: true })).toBeFocused();
    await expect(dialog.locator('.museum-story > p')).toHaveCount(3);
    await expect(dialog.getByRole('heading', { name: 'Imagined provenance', exact: true })).toBeVisible();
    await expect(dialog.locator('.museum-material-list > div')).toHaveCount(3);
    await expect(dialog).toContainText('Every object, maker, date, acquisition, and provenance described here is invented.');
    await expect(dialog.getByRole('button', { name: 'Previous object', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', { name: 'Next object', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Tuesday Preserver', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Previous object', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Portable Horizon', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Close exhibit detail', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('keeps detail navigation inside a filtered room', async ({ page }) => {
    const museum = page.locator('.project-museum');
    await museum.getByRole('button', { name: 'Time & its keeping, 2 objects', exact: true }).click();
    await museum.getByRole('button', { name: 'Read the story of Tuesday Preserver', exact: true }).click();
    const dialog = museum.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next object', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Foldable Pause', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Next object', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('navigation', { name: 'Exhibit navigation' })).toContainText('2 of 2');
    await page.keyboard.press('Escape');
    await expect(museum.getByRole('button', { name: 'Read the story of Tuesday Preserver', exact: true })).toBeFocused();
  });

  test('downloads a complete entry and an unfiltered full catalog as real text files', async ({ page }) => {
    const museum = page.locator('.project-museum');
    await museum.getByRole('button', { name: 'Read the story of Portable Horizon', exact: true }).click();
    const entryDownload = page.waitForEvent('download');
    await museum.getByRole('dialog').getByRole('button', { name: 'Download entry (.txt)', exact: true }).click();
    const entry = await entryDownload;
    expect(entry.suggestedFilename()).toBe('museum-of-unmade-things-portable-horizon.txt');
    const entryText = await downloadedText(entry);
    expect(entryText).toContain('U.01.001 | Portable Horizon');
    expect(entryText).toContain('THE OBJECT STORY');
    expect(entryText).toContain('IMAGINED PROVENANCE');
    expect(entryText).toContain('MATERIALS (PROPOSED)');
    expect(entryText).toContain('The first recipient, a fictional upstairs tailor');
    expect(entryText).not.toContain('U.02.001 | Tuesday Preserver');
    await page.keyboard.press('Escape');
    await museum.getByRole('button', { name: 'Time & its keeping, 2 objects', exact: true }).click();
    const catalogDownload = page.waitForEvent('download');
    await museum.getByRole('button', { name: 'Download full catalog (.txt)', exact: true }).click();
    const catalog = await catalogDownload;
    expect(catalog.suggestedFilename()).toBe('museum-of-unmade-things-catalog.txt');
    const catalogText = await downloadedText(catalog);
    expect(catalogText.match(/^U\.\d{2}\.\d{3} \| /gm)).toHaveLength(10);
    expect(catalogText).toContain('U.01.001 | Portable Horizon');
    expect(catalogText).toContain('U.04.003 | Shadow Mender');
    expect(catalogText).toContain('This museum is a work of fiction.');
  });

  test('copies full catalog content and reports clipboard denial within the dialog', async ({ page, context }) => {
    const museum = page.locator('.project-museum');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await museum.getByRole('button', { name: 'Copy full catalog', exact: true }).click();
    await expect(museum.locator('#museum-catalog [role="status"]')).toHaveText('Copied to your clipboard.');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('U.04.003 | Shadow Mender');
    expect(copied).toContain('This museum is a work of fiction.');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
        },
      });
    });
    await museum.getByRole('button', { name: 'Read the story of Listening Thimble', exact: true }).click();
    const dialog = museum.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Copy entry', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Your browser blocked copying.');
    await expect(dialog.getByRole('status')).toContainText('The download button is another way to keep the text.');
  });

  test('fits 375px, keeps touch controls generous, and permits full dialog scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const museum = page.locator('.project-museum');
    expect(await museum.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const filters = museum.locator('[data-museum-room]');
    for (const button of await filters.all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await museum.getByRole('button', { name: 'Things left unsaid, 2 objects', exact: true }).click();
    const trigger = museum.getByRole('button', { name: 'Read the story of Listening Thimble', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const originalScroll = await page.evaluate(() => window.scrollY);
    await trigger.click();
    const dialog = museum.getByRole('dialog');
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox?.width).toBeLessThanOrEqual(375);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole('button', { name: 'Close exhibit detail', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Previous object', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Close exhibit detail', exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(originalScroll);
    expect(await museum.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
