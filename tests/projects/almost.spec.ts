import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  availableLetters,
  entries,
  entriesById,
  favoritesStorageKey,
  filterEntries,
  formatEntry,
  surpriseEntry,
  validateFavorites,
  wordCategories,
} from '../../src/projects/almost/data';

test.use({ viewport: { width: 1280, height: 900 } });

async function openDictionary(page: Page) {
  await page.goto('./projects/almost/');
  const site = page.locator('.project-almost');
  await expect(site.getByRole('heading', { name: 'A Dictionary of Almost', exact: true })).toBeVisible();
  return site;
}

test('almost: complete fictional corpus, real references, and strict favorite data', () => {
  expect(entries).toHaveLength(28);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(28);
  expect(entries.map((entry) => entry.word)).toEqual(entries.map((entry) => entry.word).sort());
  expect(availableLetters).toHaveLength(24);
  expect(wordCategories.map((category) => entries.filter((entry) => entry.category === category.id).length))
    .toEqual([5, 5, 5, 6, 4, 3]);
  for (const entry of entries) {
    expect(entry.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(entry.pronunciation).toMatch(/[A-Z]{2}/);
    expect(entry.definition.length).toBeGreaterThan(60);
    expect(entry.example.toLowerCase()).toContain(entry.word);
    expect(entry.observation.length).toBeGreaterThan(20);
    expect(entry.related).toHaveLength(3);
    expect(new Set(entry.related).size).toBe(3);
    for (const id of entry.related) {
      expect(entriesById.has(id)).toBe(true);
      expect(id).not.toBe(entry.id);
    }
    expect(formatEntry(entry)).toContain('original fictional coinage');
    for (const random of [0, 0.25, 0.5, 0.999]) {
      expect(surpriseEntry(entry.id, () => random).id).not.toBe(entry.id);
    }
  }
  expect(validateFavorites({ version: 1, ids: ['awayettle', 'mapmolt'] })).toBe(true);
  for (const invalid of [
    null,
    [],
    {},
    { version: 2, ids: [] },
    { version: 1, ids: ['missing-word'] },
    { version: 1, ids: ['awayettle', 'awayettle'] },
    { version: 1, ids: [null] },
  ]) {
    expect(validateFavorites(invalid)).toBe(false);
  }
  const filters = { search: 'KETTLE unfamiliar', letter: 'A', category: 'rooms', keptOnly: false } as const;
  expect(filterEntries(filters, new Set()).map((entry) => entry.id)).toEqual(['awayettle']);
  expect(filterEntries({ ...filters, letter: 'K' }, new Set())).toEqual([]);
});

test('almost: search, category, letter, and kept view intersect without losing input focus', async ({ page }) => {
  const site = await openDictionary(page);
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(site.locator('.almost-origin')).toHaveCount(28);
  const search = site.getByRole('searchbox', { name: 'Search the dictionary' });
  const alphabet = site.getByRole('navigation', { name: 'Browse by first letter' });
  const category = site.getByLabel('By kind of experience');

  await search.fill('KETTLE');
  await search.pressSequentially(' unfamiliar');
  await expect(search).toBeFocused();
  await category.selectOption('rooms');
  await alphabet.getByRole('button', { name: 'A', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(1);
  await expect(site.getByRole('article', { name: 'awayettle', exact: true })).toBeVisible();
  await alphabet.getByRole('button', { name: 'K', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(0);
  await expect(site.getByRole('heading', { name: 'No words on this page.' })).toBeVisible();
  await expect(alphabet.getByRole('button', { name: 'K', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await category.selectOption('traces');
  await search.fill('key');
  await expect(site.getByRole('article')).toHaveCount(1);
  await expect(site.getByRole('article', { name: 'keyafter', exact: true })).toBeVisible();
  await site.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(category).toHaveValue('traces');
  await expect(alphabet.getByRole('button', { name: 'K', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await site.getByRole('button', { name: 'Keep keyafter in favorites', exact: true }).click();
  await site.getByRole('button', { name: /^Kept words,/ }).click();
  await alphabet.getByRole('button', { name: 'A', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(0);
  await site.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(1);
  await expect(site.getByRole('heading', { name: 'Kept words', exact: true })).toBeVisible();
  await expect(category).toHaveValue('all');
  await expect(alphabet.getByRole('button', { name: 'All letters', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toBeFocused();
});

test('almost: searches example text, handles empty results, and resets to the dictionary', async ({ page }) => {
  const site = await openDictionary(page);
  const search = site.getByRole('searchbox', { name: 'Search the dictionary' });
  await search.fill('sprinkler');
  await search.press('Enter');
  await expect(site.getByRole('article')).toHaveCount(1);
  await expect(site.getByRole('article', { name: 'almostory', exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill('unfaded');
  await expect(site.getByRole('article', { name: 'framepale', exact: true })).toBeVisible();
  await expect(site.getByRole('article')).toHaveCount(1);
  await search.fill('zzzz-not-a-word');
  await expect(site.getByRole('article')).toHaveCount(0);
  await site.getByRole('button', { name: 'Clear these filters', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.fill('   ');
  await expect(site.getByRole('article')).toHaveCount(28);
  await site.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(site.getByRole('button', { name: 'Clear search', exact: true })).toBeHidden();
});

test('almost: related links reveal excluded entries and surprise opens a different real word', async ({ page }) => {
  const site = await openDictionary(page);
  const search = site.getByRole('searchbox', { name: 'Search the dictionary' });
  await search.fill('kettle');
  await site.getByLabel('By kind of experience').selectOption('rooms');
  await site.getByRole('navigation', { name: 'Browse by first letter' }).getByRole('button', { name: 'A', exact: true }).click();
  await site.getByRole('article', { name: 'awayettle', exact: true }).getByRole('link', { name: 'windowkin', exact: true }).click();
  await expect(page).toHaveURL(/#word-windowkin$/);
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(search).toHaveValue('');
  await expect(site.getByLabel('By kind of experience')).toHaveValue('all');
  await expect(site.getByRole('heading', { name: 'windowkin', exact: true })).toBeFocused();

  let previous = 'windowkin';
  for (let turn = 0; turn < 2; turn += 1) {
    await site.getByRole('button', { name: 'Surprise me', exact: true }).click();
    const current = await site.locator('.almost-entry.is-reading').getAttribute('data-entry');
    expect(current).not.toBe(previous);
    expect(entriesById.has(current ?? '')).toBe(true);
    await expect(page).toHaveURL(new RegExp(`#word-${current}$`));
    await expect(site.getByRole('article', { name: current ?? '', exact: true }).getByRole('heading', { name: current ?? '', exact: true })).toBeFocused();
    previous = current ?? '';
  }
});

test('almost: direct entry addresses, history, and malformed fragments are safe', async ({ page }) => {
  await page.goto('./projects/almost/#word-ticketender');
  const site = page.locator('.project-almost');
  await expect(site.getByRole('heading', { name: 'ticketender', exact: true })).toBeFocused();
  await expect(site.getByRole('article')).toHaveCount(28);
  await site.getByRole('article', { name: 'ticketender', exact: true }).getByRole('link', { name: 'zipstill', exact: true }).click();
  await expect(site.getByRole('heading', { name: 'zipstill', exact: true })).toBeFocused();
  await page.goBack();
  await expect(site.getByRole('heading', { name: 'ticketender', exact: true })).toBeFocused();
  await page.goForward();
  await expect(site.getByRole('heading', { name: 'zipstill', exact: true })).toBeFocused();
  await page.goto('./projects/almost/#word-%E0%A4%A');
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(site.locator('[data-notice-box]')).toContainText('There is no entry at this address.');
  await page.goto('./projects/almost/#unknown-word');
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(site.locator('[data-notice-box]')).toBeVisible();
});

test('almost: favorites persist and removal preserves useful focus', async ({ page }) => {
  const site = await openDictionary(page);
  const keepAwayettle = site.getByRole('button', { name: 'Keep awayettle in favorites', exact: true });
  await keepAwayettle.click();
  await expect(keepAwayettle).toHaveAttribute('aria-pressed', 'true');
  await expect(keepAwayettle).toBeFocused();
  await site.getByRole('button', { name: 'Keep mapmolt in favorites', exact: true }).click();
  await page.reload();
  await site.getByRole('button', { name: 'Kept words, 2', exact: true }).click();
  await expect(site.locator('.almost-entry h3')).toHaveText(['awayettle', 'mapmolt']);
  await keepAwayettle.click();
  await expect(site.locator('.almost-entry h3')).toHaveText(['mapmolt']);
  const keepMapmolt = site.getByRole('button', { name: 'Keep mapmolt in favorites', exact: true });
  await expect(keepMapmolt).toBeFocused();
  await keepMapmolt.click();
  await expect(site.getByRole('heading', { name: 'Nothing kept, yet.', exact: true })).toBeVisible();
  await expect(site.getByRole('heading', { name: 'Kept words', exact: true })).toBeFocused();
  await site.getByRole('button', { name: 'Show the full lexicon', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(28);
  await expect(keepAwayettle).toHaveAttribute('aria-pressed', 'false');
});

test('almost: invalid favorite payloads are rejected with visible feedback', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, ids: ['awayettle', 'awayettle'] }));
  }, { key: favoritesStorageKey });
  const site = await openDictionary(page);
  await expect(site.locator('[data-notice-box]')).toContainText('older or invalid format');
  await site.getByRole('button', { name: 'Kept words, 0', exact: true }).click();
  await expect(site.getByRole('article')).toHaveCount(0);
  await expect(site.getByRole('heading', { name: 'Nothing kept, yet.', exact: true })).toBeVisible();
});

test('almost: failed storage writes keep a working in-memory collection without claiming persistence', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, storageKey: string, value: string): void {
      if (storageKey === key) throw new DOMException('Blocked for the test', 'QuotaExceededError');
      original.call(this, storageKey, value);
    };
  }, { key: favoritesStorageKey });
  const site = await openDictionary(page);
  await site.getByRole('button', { name: 'Keep awayettle in favorites', exact: true }).click();
  await expect(site.locator('[data-notice-box]')).toContainText('for this visit only');
  await site.getByRole('button', { name: 'Kept words, 1', exact: true }).click();
  await expect(site.getByRole('article', { name: 'awayettle', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), favoritesStorageKey)).toBeNull();
  await page.reload();
  await expect(site.getByRole('button', { name: 'Keep awayettle in favorites', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('almost: copy contains the real entry and a failed retry never says Copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { almostCopiedText?: string }).almostCopiedText = text;
        },
      },
    });
  });
  const site = await openDictionary(page);
  const copy = site.getByRole('button', { name: 'Copy awayettle', exact: true });
  await copy.click();
  await expect(copy).toHaveText('Copied');
  const text = await page.evaluate(() => (window as Window & { almostCopiedText?: string }).almostCopiedText);
  const entry = entriesById.get('awayettle');
  expect(entry).toBeDefined();
  expect(text).toBe(entry ? formatEntry(entry) : '');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Blocked for the test', 'NotAllowedError'); } },
    });
  });
  await copy.click();
  await expect(copy).toHaveText('Copy entry');
  await expect(site.locator('[data-notice-box]')).toContainText('Your browser blocked copying.');
});

test('almost: the text download includes all kept words rather than only filtered results', async ({ page }) => {
  const site = await openDictionary(page);
  await site.getByRole('button', { name: 'Keep awayettle in favorites', exact: true }).click();
  await site.getByRole('button', { name: 'Keep mapmolt in favorites', exact: true }).click();
  await site.getByRole('button', { name: 'Kept words, 2', exact: true }).click();
  await site.getByRole('searchbox', { name: 'Search the dictionary' }).fill('kettle');
  await expect(site.getByRole('article')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await site.getByRole('button', { name: /^Download all kept words/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('a-dictionary-of-almost-kept-words.txt');
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  if (stream) {
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('2 kept words');
  expect(text).toContain('awayettle');
  expect(text).toContain('mapmolt');
  expect(text).toContain('original fictional coinage');
});

test('almost: the narrow layout wraps browsing and keeps search usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const site = await openDictionary(page);
  await expect(site.getByRole('heading', { name: 'afterstep', exact: true })).toBeInViewport();
  const browse = site.locator('.almost-browse');
  await expect(browse).toHaveJSProperty('open', false);
  await browse.locator('summary').click();
  const alphabet = site.getByRole('navigation', { name: 'Browse by first letter' });
  await expect(alphabet.getByRole('button')).toHaveCount(25);
  await alphabet.getByRole('button', { name: 'A', exact: true }).click();
  await site.getByLabel('By kind of experience').selectOption('rooms');
  const search = site.getByRole('searchbox', { name: 'Search the dictionary' });
  await search.fill('kett');
  await search.pressSequentially('le');
  await expect(search).toBeFocused();
  await expect(site.locator('.almost-entry h3')).toHaveText(['awayettle']);
  await search.fill('x'.repeat(120));
  await expect(site.getByRole('article')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const letterSize = await alphabet.getByRole('button', { name: 'A', exact: true }).boundingBox();
  expect(letterSize?.width).toBeGreaterThanOrEqual(42);
  expect(letterSize?.height).toBeGreaterThanOrEqual(44);
  await site.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(site.locator('.almost-entry h3')).toHaveText(['awayettle']);
});
