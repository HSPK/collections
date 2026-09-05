import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BOOKS, FACTS, SCENES } from '../../src/projects/bookshop/data';
import {
  BOOKMARK_KEY, BOOKMARK_VERSION, MAX_STEPS, auditStory, bookmarkFor, currentFrame,
  getScene, isBookmark, journeyText, newJourney, paragraphsFor, restoreBookmark,
  rewindJourney, takeChoice,
} from '../../src/projects/bookshop/engine';
import type { Journey } from '../../src/projects/bookshop/engine';

function follow(choices: readonly string[]): Journey {
  let journey = newJourney();
  for (const choice of choices) {
    const next = takeChoice(journey, choice);
    if (!next) throw new Error(`Illegal test choice ${currentFrame(journey).scene}/${choice}`);
    journey = next;
  }
  return journey;
}

async function choose(page: Page, id: string): Promise<void> {
  await page.locator(`.project-bookshop .bs-paper [data-choice="${id}"]`).click();
  await expect(page.locator('#bookshop-chapter-title')).toBeFocused();
}

async function openShop(page: Page): Promise<void> {
  await page.goto('./projects/bookshop/');
  await expect(page.locator('.project-bookshop h1')).toHaveText('The Last Bookshop');
}

test.describe('The Last Bookshop: story engine', () => {
  test('all scene targets, conditions, and three endings are valid and reachable', () => {
    const audit = auditStory();
    expect(audit.issues).toEqual([]);
    expect(audit.sceneCount).toBe(22);
    expect(new Set(audit.reachableScenes)).toEqual(new Set(SCENES.map((scene) => scene.id)));
    expect(audit.reachableEndings.sort()).toEqual(['ending-keeper', 'ending-road', 'ending-street']);
    expect(BOOKS).toHaveLength(6);
    for (const [ending, path] of Object.entries(audit.endingPaths)) {
      const journey = restoreBookmark({ version: BOOKMARK_VERSION, steps: path });
      expect(journey).toBeDefined();
      const frame = currentFrame(journey!);
      expect(frame.scene).toBe(ending);
      expect(getScene(frame.scene).choices).toEqual([]);
      expect(isBookmark(bookmarkFor(journey!))).toBe(true);
    }
  });

  test('back restores past state and a new choice does not duplicate rewards', () => {
    const atlas = follow(['enter', 'browse', 'read-atlas']);
    const withChart = takeChoice(atlas, 'take-fold')!;
    expect(currentFrame(withChart).facts).toContain('chart');
    const rewound = rewindJourney(withChart, atlas.frames.length - 1)!;
    expect(currentFrame(rewound).facts).not.toContain('chart');
    const alternative = takeChoice(rewound, 'leave-fold')!;
    expect(currentFrame(alternative).facts).toEqual(['map-left']);
    expect(takeChoice(alternative, 'read-atlas')).toBeUndefined();
    expect(restoreBookmark(bookmarkFor(alternative))).toEqual(alternative);
    expect(currentFrame(newJourney()).facts).toEqual([]);
    expect(newJourney().steps).toEqual([]);
  });

  test('the street uses real resources and rewinding the preparation returns them', () => {
    const beforeDecision = follow([
      'enter', 'browse', 'read-atlas', 'take-fold', 'go-down', 'enter-cellar',
      'return-room', 'read-repairs', 'mend-binding', 'return-room',
      'read-borrowers', 'copy-names', 'call-out', 'return-room',
      'open-ledger', 'read-entries',
    ]);
    expect(currentFrame(beforeDecision).facts).toEqual(expect.arrayContaining(['key', 'thread', 'names', 'witness']));
    const prepared = takeChoice(beforeDecision, 'choose-street')!;
    expect(currentFrame(prepared).facts).not.toContain('thread');
    expect(currentFrame(prepared).facts).not.toContain('key');
    expect(currentFrame(prepared).facts).toContain('roof-mended');
    expect(paragraphsFor(currentFrame(prepared)).join(' ')).toContain('Mina holds the ladder');
    const rewound = rewindJourney(prepared, beforeDecision.frames.length - 1)!;
    expect(rewound).toEqual(beforeDecision);
    const ending = takeChoice(prepared, 'open-street')!;
    expect(currentFrame(ending).scene).toBe('ending-street');
    expect(journeyText(ending)).toContain('You chose: Give the door back to the street');
    expect(journeyText(ending)).toContain('Mina holds the ladder');
    expect(journeyText(ending)).toContain('Ending: A place returned');
  });

  test('the return address opens a different first delivery with different prose', () => {
    const packed = follow([
      'enter', 'browse', 'read-letter', 'keep-address', 'read-parcel',
      'accept-book', 'open-ledger', 'read-entries', 'choose-road',
    ]);
    const home = takeChoice(packed, 'go-homeward')!;
    const road = takeChoice(packed, 'go-outward')!;
    expect(currentFrame(home).scene).toBe('ending-road');
    expect(currentFrame(road).scene).toBe('ending-road');
    expect(paragraphsFor(currentFrame(home)).join(' ')).toContain('Your first stop is your own kitchen.');
    expect(paragraphsFor(currentFrame(home)).join(' ')).not.toContain('At the first station, you sit');
    expect(paragraphsFor(currentFrame(road)).join(' ')).toContain('At the first station, you sit');
    const withoutAddress = follow([
      'enter', 'browse', 'read-parcel', 'accept-book',
      'open-ledger', 'read-entries', 'choose-road',
    ]);
    expect(takeChoice(withoutAddress, 'go-homeward')).toBeUndefined();
  });

  test('bookmarks reject malformed, stale, forged, and illegal paths', () => {
    const decision = follow(['enter', 'ask-hour', 'consider-ending', 'read-entries']);
    const ending = takeChoice(decision, 'choose-keeper')!;
    const invalid: unknown[] = [
      null, [], {}, { version: 0, steps: [] }, { version: BOOKMARK_VERSION, steps: 'enter' },
      { version: BOOKMARK_VERSION, steps: [], facts: ['key', 'thread'] },
      { version: BOOKMARK_VERSION, steps: [{ scene: 'cellar', choice: 'return-room' }] },
      { version: BOOKMARK_VERSION, steps: [{ scene: 'threshold', choice: 'enter', facts: ['key'] }] },
      { version: BOOKMARK_VERSION, steps: [...decision.steps, { scene: 'decision', choice: 'choose-street' }] },
      { version: BOOKMARK_VERSION, steps: [...ending.steps, { scene: 'ending-keeper', choice: 'enter' }] },
      { version: BOOKMARK_VERSION, steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ scene: 'threshold', choice: 'enter' })) },
    ];
    for (const value of invalid) {
      expect(isBookmark(value)).toBe(false);
      expect(restoreBookmark(value)).toBeUndefined();
    }
    expect(isBookmark(bookmarkFor(decision))).toBe(true);
    expect(takeChoice(decision, 'choose-road')).toBeUndefined();
  });
});

test.describe('The Last Bookshop: reading room', () => {
  test('inventory, back, remembered reload, history, and restart agree', async ({ page }) => {
    await openShop(page);
    await expect(page.locator('.bs-prose')).toContainText('Yesterday there was a wall here.');
    for (const choice of ['enter', 'browse', 'read-atlas', 'take-fold']) await choose(page, choice);
    await expect(page.locator('[data-pocket]')).toContainText(FACTS.chart.label);
    await page.reload();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'map-pocket');
    await expect(page.locator('[data-pocket]')).toContainText(FACTS.chart.label);
    await page.locator('[data-action="back"]').click();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'tide-atlas');
    await expect(page.locator('[data-pocket]')).not.toContainText(FACTS.chart.label);
    await expect(page.locator('#bookshop-chapter-title')).toBeFocused();
    await choose(page, 'leave-fold');
    await expect(page.locator('[data-pocket]')).toContainText(FACTS['map-left'].label);
    await page.locator('.bs-navigation [data-action="bookmark"]').click();
    await page.locator('.bs-dialog [data-return="1"]').click();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'counter');
    await expect(page.locator('[data-pocket]')).not.toContainText(FACTS['map-left'].label);
    await page.locator('.bs-footer [data-action="restart"]').click();
    await page.locator('.bs-dialog [data-action="confirm-restart"]').click();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'threshold');
    await expect(page.locator('[data-pocket-count]')).toHaveText('0 keepsakes');
    await expect(page.locator('[data-action="back"]')).toBeDisabled();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BOOKMARK_KEY);
    expect(saved).toEqual(bookmarkFor(newJourney()));
    await page.reload();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'threshold');
  });

  test('an unearned ending stays disabled, then accepting the book opens the road', async ({ page }) => {
    await openShop(page);
    for (const choice of ['enter', 'ask-hour', 'consider-ending', 'read-entries']) await choose(page, choice);
    await expect(page.locator('[data-choice="choose-street"]')).toBeDisabled();
    await expect(page.locator('[data-choice="choose-road"]')).toBeDisabled();
    await expect(page.locator('#bookshop-reason-choose-road')).toContainText('Accept the unclaimed orchard parcel');
    for (const choice of ['not-yet', 'read-parcel', 'accept-book', 'return-ledger']) await choose(page, choice);
    await expect(page.locator('[data-choice="choose-road"]')).toBeEnabled();
    await choose(page, 'choose-road');
    await expect(page.locator('[data-choice="go-homeward"]')).toBeDisabled();
    await choose(page, 'go-outward');
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'ending-road');
    await expect(page.locator('.bs-ending-note')).toContainText('The room is gone');
    await page.reload();
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'ending-road');
  });

  test('invalid saved progress is reported and overwritten, not trusted', async ({ page }) => {
    await page.addInitScript(({ key, version }) => {
      localStorage.setItem(key, JSON.stringify({
        version,
        steps: [{ scene: 'cellar', choice: 'return-room' }],
      }));
    }, { key: BOOKMARK_KEY, version: BOOKMARK_VERSION });
    await openShop(page);
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'threshold');
    await expect(page.locator('[data-status]')).toContainText('older or invalid format');
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BOOKMARK_KEY);
    expect(saved).toEqual(bookmarkFor(newJourney()));
  });

  test('blocked saving is reported without preventing reading', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value() { throw new DOMException('Storage is not available.', 'QuotaExceededError'); },
      });
    });
    await openShop(page);
    await expect(page.locator('[data-storage-note]')).toContainText('could not remember your place');
    await choose(page, 'enter');
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'counter');
    await expect(page.locator('[data-status]')).toContainText('could not save this session');
  });

  test('a downloaded journey contains the actual chosen chapters', async ({ page }) => {
    await openShop(page);
    for (const choice of ['enter', 'ask-hour', 'consider-ending', 'read-entries', 'choose-keeper']) await choose(page, choice);
    await page.locator('.bs-ending-note [data-action="bookmark"]').click();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('.bs-dialog [data-action="download"]').click();
    const download = await downloadEvent;
    await expect(page.locator('.bs-dialog').getByRole('status')).toContainText('Your text copy includes the chapters you read');
    expect(download.suggestedFilename()).toBe('the-last-bookshop-journey.txt');
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let receipt = '';
    for await (const chunk of stream!) receipt += chunk.toString();
    expect(receipt).toContain('The handwriting after Nell\'s');
    expect(receipt).toContain('You chose: Write your name in Nell\'s place');
    expect(receipt).toContain('Ending: A place kept');
    expect(receipt).not.toContain('You chose: Give the door back to the street');
  });

  test('blocked downloads are reported inside the open bookmark dialog', async ({ page }) => {
    await openShop(page);
    await page.locator('.bs-navigation [data-action="bookmark"]').click();
    await page.evaluate(() => {
      URL.createObjectURL = () => { throw new DOMException('Downloads are blocked for this test.', 'SecurityError'); };
    });
    const dialog = page.locator('.bs-dialog');
    await dialog.locator('[data-action="download"]').click();
    await expect(dialog.getByRole('status')).toContainText('The browser could not start the download.');
    await expect(dialog.locator('[data-action="close"]')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bs-paper')).toHaveAttribute('data-scene', 'threshold');
  });

  test('375px keeps scrolling on the shelf, with readable books and working focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openShop(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const shelf = page.locator('.bs-bookcase');
    expect(await shelf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const original = await page.evaluate((key) => localStorage.getItem(key), BOOKMARK_KEY);
    await page.locator('[data-book="hour"]').click();
    await expect(page.locator('.bs-dialog')).toBeVisible();
    await expect(page.locator('.bs-book-excerpt')).toContainText('The baker measures the last hour in loaves.');
    expect(await page.evaluate((key) => localStorage.getItem(key), BOOKMARK_KEY)).toBe(original);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bs-dialog')).not.toBeVisible();
    await choose(page, 'enter');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const metrics = await page.locator('.bs-prose p').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { size: parseFloat(style.fontSize), height: parseFloat(style.lineHeight) };
    });
    expect(metrics.size).toBeGreaterThanOrEqual(16);
    expect(metrics.height).toBeGreaterThan(metrics.size * 1.5);
    for (const button of await page.locator('.bs-spine').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
