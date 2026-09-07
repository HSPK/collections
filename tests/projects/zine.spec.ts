import { expect, test, type Page } from '@playwright/test';
import { STARTERS, THEMES, makeBlank, makeStarter } from '../../src/projects/zine/data';
import {
  IMPOSITION, LIMITS, MIN_BODY_MM, MM_PER_PT, THEME_IDS, analyzeDocument, characterCount,
  cloneDocument, escapeXml, filenameFor, graphemes, normalizeNewlines, sheetGeometry,
  validateDocument, wrapText, type ZineDocument,
} from '../../src/projects/zine/engine';
import { STORAGE_KEY, changeDocument, createHistory, loadDraft, redo, saveDraft, undo } from '../../src/projects/zine/state';
import { makeSheetSvg } from '../../src/projects/zine/svg';

test.describe('zine engine', () => {
  test('imposes the eight distinct pages, rotations, and exact physical paper sizes', () => {
    expect(IMPOSITION.map((slot) => slot.page)).toEqual([5, 4, 3, 2, 6, 7, 8, 1]);
    expect(IMPOSITION.map((slot) => slot.rotation)).toEqual([180, 180, 180, 180, 0, 0, 0, 0]);
    expect([...IMPOSITION.map((slot) => slot.page)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const paper of ['a4', 'letter'] as const) {
      const geometry = sheetGeometry(paper);
      expect([geometry.width, geometry.height]).toEqual(paper === 'a4' ? [297, 210] : [279.4, 215.9]);
      expect(geometry.pageWidth * 4).toBe(geometry.width);
      expect(geometry.pageHeight * 2).toBe(geometry.height);
      expect(geometry.cut).toEqual({ x1: geometry.width / 4, x2: geometry.width * 3 / 4, y: geometry.height / 2 });
      expect(geometry.cut.x2 - geometry.cut.x1).toBeCloseTo(geometry.width / 2, 8);
      expect(geometry.verticalFolds).toEqual([geometry.width / 4, geometry.width / 2, geometry.width * 3 / 4]);
      expect(geometry.cut.x1).toBeGreaterThan(0);
      expect(geometry.cut.x2).toBeLessThan(geometry.width);
    }
  });

  test('the folded leaves and reading spreads meet on uncut edges', () => {
    const slotFor = (number: number) => IMPOSITION.find((slot) => slot.page === number)!;
    const edges = [[1, 2], [3, 4], [5, 6], [7, 8], [2, 3], [4, 5], [6, 7], [8, 1]];
    for (const [first, second] of edges) {
      const a = slotFor(first!);
      const b = slotFor(second!);
      expect(Math.abs(a.column - b.column) + Math.abs(a.row - b.row)).toBe(1);
      if (a.row !== b.row) {
        expect([0, 3]).toContain(a.column);
        expect(Math.abs(a.rotation - b.rotation)).toBe(180);
      } else expect(a.rotation).toBe(b.rotation);
    }
    for (const [first, second] of [[3, 8], [4, 7]]) {
      expect(slotFor(first!).column).toBe(slotFor(second!).column);
      expect([1, 2]).toContain(slotFor(first!).column);
    }
  });

  test('every original starter fits both papers in every style', () => {
    expect(STARTERS).toHaveLength(3);
    for (const starter of STARTERS) {
      expect(starter.document.pages).toHaveLength(8);
      expect(new Set(starter.document.pages.map((panel) => panel.heading)).size).toBe(8);
      expect(starter.document.pages.every((panel) => panel.body.length > 50)).toBe(true);
      for (const paper of ['a4', 'letter'] as const) {
        for (const theme of THEME_IDS) {
          const draft = { ...cloneDocument(starter.document), paper, theme };
          const result = analyzeDocument(draft, THEMES[theme]);
          expect(result.issues, `${starter.id}, ${paper}, ${theme}`).toEqual([]);
          for (const layout of result.layouts) {
            expect(layout).not.toBeNull();
            expect(layout!.bodyPoints).toBeGreaterThanOrEqual(MIN_BODY_MM / MM_PER_PT);
            for (const block of layout!.blocks) {
              expect(block.widths.every((width) => width <= layout!.width - 12 + 0.001)).toBe(true);
              expect(block.y + block.height).toBeLessThanOrEqual(layout!.height - 12 + 0.001);
            }
          }
        }
      }
    }
    expect(makeBlank().pages.every((panel) => panel.body === '' && panel.heading === '')).toBe(true);
    const independent = makeStarter();
    independent.pages[0]!.body = 'Changed';
    expect(makeStarter().pages[0]!.body).not.toBe('Changed');
  });

  test('wraps words and long Unicode tokens without losing spaces, breaks, or graphemes', () => {
    const measure = (value: string) => graphemes(value).length;
    expect(wrapText('Words are worth keeping.', 10, measure).map((line) => line.text))
      .toEqual(['Words are ', 'worth ', 'keeping.']);
    const family = '👩🏽‍🔬';
    const text = `  A note & a word.\r\n\n${('e\u0301' + family + '🇳🇿').repeat(13)}\t end  \n`;
    const lines = wrapText(text, 9, measure);
    expect(lines.map((line) => line.text + (line.hardBreak ? '\n' : '')).join('')).toBe(normalizeNewlines(text));
    expect(lines.every((line) => measure(line.text) <= 9)).toBe(true);
    expect(lines.flatMap((line) => graphemes(line.text))).toEqual(graphemes(normalizeNewlines(text).replace(/\n/g, '')));
    expect(characterCount(family.repeat(4))).toBe(4);
    expect(() => wrapText('hello', 0, measure)).toThrow('positive, finite');
  });

  test('rejects invalid titles, excessive text, invalid XML, and unprintable line budgets', () => {
    expect(validateDocument({ ...makeStarter(), title: ' ' }).some((issue) => issue.field === 'title')).toBe(true);
    expect(validateDocument({ ...makeStarter(), version: 3 })).not.toEqual([]);
    expect(validateDocument({ ...makeStarter(), paper: 'a3' })).not.toEqual([]);
    expect(validateDocument({ ...makeStarter(), theme: '<script>' })).not.toEqual([]);
    expect(validateDocument({ ...makeStarter(), pages: [] })).not.toEqual([]);
    const draft = makeStarter();
    draft.title = '👩🏽‍🔬'.repeat(LIMITS.title);
    expect(validateDocument(draft)).toEqual([]);
    draft.title += 'a';
    expect(validateDocument(draft)[0]!.message).toContain('over 60 characters');
    draft.title = 'A title';
    draft.pages[2]!.body = 'a'.repeat(361);
    expect(validateDocument(draft)[0]).toMatchObject({ page: 2, field: 'body' });
    for (const character of ['\u0000', '\u0001', '\ud800', '\ufffe']) {
      draft.pages[2]!.body = `bad${character}text`;
      expect(validateDocument(draft)[0]!.message).toContain('unsupported control character');
    }
    draft.pages[2]!.body = '\n'.repeat(35);
    expect(validateDocument(draft)).toEqual([]);
    const result = analyzeDocument(draft, THEMES[draft.theme]);
    expect(result.issues).toContainEqual(expect.objectContaining({ page: 2, field: 'body' }));
    expect(() => makeSheetSvg(draft, THEMES[draft.theme])).toThrow('will not fit');
    expect(draft.pages[2]!.body).toBe('\n'.repeat(35));
  });

  test('exports valid, complete, safely escaped XML with no external resources', async ({ page }) => {
    const draft = makeStarter();
    draft.title = 'Keep <this> & "that"';
    draft.pages[0]!.heading = 'A literal <tag>, not markup';
    draft.pages[0]!.body = 'Use <script>alert("ink")</script> & keep the text.\nCafé 👩🏽‍🔬 🇳🇿.';
    draft.pages[1]!.body = `A long token:\n${'e\u0301🪴'.repeat(18)}\n\nNo missing ending.`;
    for (const paper of ['a4', 'letter'] as const) {
      draft.paper = paper;
      const svg = makeSheetSvg(draft, THEMES[draft.theme], { guides: true });
      expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(svg).toContain(escapeXml(draft.title));
      expect(svg).not.toContain('<script>');
      const parsed = await page.evaluate((source) => {
        const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
        return {
          errors: xml.querySelectorAll('parsererror').length,
          width: xml.documentElement.getAttribute('width'),
          height: xml.documentElement.getAttribute('height'),
          unsafe: xml.querySelectorAll('script, image, foreignObject, a, use').length,
          slots: [...xml.querySelectorAll('g[data-page]')].map((group) => ({
            number: Number(group.getAttribute('data-page')),
            rotation: Number(group.getAttribute('data-rotation')),
            transform: group.getAttribute('transform'),
            fields: [...group.querySelectorAll('g[data-field]')].map((field) => ({
              name: field.getAttribute('data-field'),
              text: [...field.querySelectorAll('text')].map((line) =>
                (line.textContent ?? '') + (line.getAttribute('data-break') === 'hard' ? '\n' : ''),
              ).join(''),
            })),
          })),
          cut: xml.querySelector('#cut-guide path')?.getAttribute('d'),
          metadata: JSON.parse(xml.querySelector('metadata')!.textContent!),
        };
      }, svg);
      expect(parsed.errors).toBe(0);
      expect(parsed.unsafe).toBe(0);
      expect([parsed.width, parsed.height]).toEqual(paper === 'a4' ? ['297mm', '210mm'] : ['279.4mm', '215.9mm']);
      expect(parsed.slots.map((slot) => slot.number)).toEqual(IMPOSITION.map((slot) => slot.page));
      expect(parsed.slots.map((slot) => slot.rotation)).toEqual(IMPOSITION.map((slot) => slot.rotation));
      expect(parsed.slots.find((slot) => slot.number === 1)!.transform).toContain(paper === 'a4' ? 'translate(222.75 105)' : 'translate(209.55 107.95)');
      expect(parsed.cut).toBe(paper === 'a4' ? 'M 74.25 105 H 222.75' : 'M 69.85 107.95 H 209.55');
      expect(parsed.metadata).toEqual(draft);
      for (const slot of parsed.slots) {
        expect(slot.fields.find((field) => field.name === 'body')!.text).toBe(draft.pages[slot.number - 1]!.body);
        expect(slot.fields.find((field) => field.name === 'heading')!.text).toBe(draft.pages[slot.number - 1]!.heading);
      }
      expect(parsed.slots.find((slot) => slot.number === 1)!.fields.find((field) => field.name === 'title')!.text).toBe(draft.title);
    }
    const clean = makeSheetSvg(draft, THEMES[draft.theme], { guides: false });
    expect(clean).not.toContain('id="cut-guide"');
    expect(clean).not.toContain('id="fold-guides"');
    expect(clean).toContain('data-page="1"');
    expect(filenameFor({ ...draft, title: 'À little / book?' })).toBe('a-little-book-letter-8-page.svg');
    expect(filenameFor({ ...draft, title: '你好' })).toBe('my-zine-letter-8-page.svg');
  });

  test('restores validated local drafts and reports blocked or corrupted storage', () => {
    let raw: string | null = null;
    const access = () => ({
      getItem: (key: string) => key === STORAGE_KEY ? raw : null,
      setItem: (key: string, value: string) => { if (key === STORAGE_KEY) raw = value; },
    });
    expect(loadDraft(access).status).toBe('empty');
    const draft = makeStarter('ordinary');
    expect(saveDraft(access, draft)).toBe(true);
    const loaded = loadDraft(access);
    expect(loaded).toEqual({ status: 'restored', document: draft });
    const before = raw;
    expect(saveDraft(access, { ...draft, title: '' })).toBe(false);
    expect(raw).toBe(before);
    raw = '{broken json';
    expect(loadDraft(access).status).toBe('invalid');
    raw = JSON.stringify({ ...draft, version: 99 });
    expect(loadDraft(access).status).toBe('invalid');
    raw = JSON.stringify({ ...draft, pages: draft.pages.slice(1) });
    expect(loadDraft(access).status).toBe('invalid');
    const blocked = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    expect(loadDraft(blocked).status).toBe('unavailable');
    expect(saveDraft(blocked, draft)).toBe(false);
    expect(saveDraft(() => ({ getItem: () => null, setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); } }), draft)).toBe(false);
    expect(() => loadDraft(() => { throw new Error('Unexpected programming error'); })).toThrow('Unexpected programming error');
  });

  test('starter changes and blank resets undo and redo without aliasing drafts', () => {
    const original = makeStarter();
    const history = createHistory(original);
    const edited = cloneDocument(original);
    edited.pages[2]!.body = 'First thought.';
    changeDocument(history, edited);
    edited.pages[2]!.body = 'A better first thought.';
    changeDocument(history, edited, true);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.pages[2]!.body).toBe(original.pages[2]!.body);
    changeDocument(history, makeStarter('ordinary'));
    changeDocument(history, makeBlank());
    expect(undo(history)).toBe(true);
    expect(history.present.title).toBe(makeStarter('ordinary').title);
    expect(undo(history)).toBe(true);
    expect(history.present.pages[2]!.body).toBe('A better first thought.');
    expect(redo(history)).toBe(true);
    expect(history.present.title).toBe(makeStarter('ordinary').title);
    changeDocument(history, original);
    expect(redo(history)).toBe(false);
    for (let index = 0; index < 80; index++) changeDocument(history, { ...original, title: `Issue ${index}` });
    expect(history.past).toHaveLength(60);
  });
});

async function mountStudio(page: Page): Promise<void> {
  await page.route('**/projects/zine/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="studio"></div></body></html>',
  }));
  await page.goto('./projects/zine/');
  await page.evaluate(async () => {
    const source = '/src/projects/zine/index.ts';
    const project = await import(source);
    const controller = new AbortController();
    const instance = project.mount({
      container: document.querySelector('#studio')!,
      controls: document.createElement('div'),
      signal: controller.signal,
      reducedMotion: true,
      report: () => {},
    });
    Object.assign(window, { zineTest: { controller, instance } });
  });
  await expect(page.getByRole('heading', { name: 'Zine Machine.', level: 1 })).toBeVisible();
}

test.describe('zine browser behavior', () => {
  test.beforeEach(async ({ page }) => {
    // Disjoint workspace edits must not hot-reload this local-only writing session.
    await page.routeWebSocket(/\/\?token=/u, () => {});
  });

  test('maker content density: the reading copy leads the page and marks its preview', async ({ page }) => {
    for (const viewport of [{ width: 1322, height: 1160 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto('./projects/zine/');
      const preview = page.locator('.project-zine [data-project-preview]');
      await expect(preview).toHaveCount(1);
      const readingCopy = preview.locator('.zine-reader');
      await expect(readingCopy).toBeVisible();
      const top = await readingCopy.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      expect(top, `Reading copy starts at ${viewport.width}px width`).toBeLessThanOrEqual(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Edit text', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Zine title' })).toBeFocused();
    }
  });

  test('opens its complete standalone website at the canonical URL', async ({ page }) => {
    await page.goto('./projects/zine/');
    await expect(page.locator('.project-zine').getByRole('heading', { name: 'Zine Machine.', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download A4 sheet', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
    await expect(page.locator('.project-zine .zine-reader-body')).toContainText('For the idea living in your notebook.');
  });

  test('edits, navigates, restores, reverses starters, and downloads the actual imposed issue', async ({ page }) => {
    await mountStudio(page);
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download A4 sheet', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Zine title' });
    await title.fill('A book <for> us & you');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByRole('textbox', { name: 'Page heading', exact: true }).fill('A real second page');
    const body = page.getByRole('textbox', { name: 'Page text', exact: true });
    const text = 'Literal <img src=x onerror=alert(1)>.\nA complete thought. 👩🏽‍🔬';
    await body.fill(text);
    await expect(page.locator('.zine-reader-body')).toHaveText(text);
    await expect(page.locator('.project-zine img')).toHaveCount(0);
    await page.locator('.zine-reader').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.zine-page-announcement')).toContainText('3 / 8');
    await page.keyboard.press('ArrowLeft');
    await expect(body).toHaveValue(text);
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await page.getByRole('combobox', { name: 'Paper on your printer' }).selectOption('letter');
    await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
    await page.getByRole('button', { name: 'Print sheet', exact: true }).click();
    await expect(page.locator('.zine-sheet > svg')).toHaveAttribute('width', '279.4mm');
    await expect(page.locator('.zine-sheet g[data-page]')).toHaveCount(8);
    await page.getByRole('checkbox', { name: 'Include fold & cut guides' }).uncheck();
    await expect(page.locator('.zine-sheet #cut-guide')).toHaveCount(0);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download US Letter sheet', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('a-book-for-us-you-letter-8-page.svg');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const svg = Buffer.concat(chunks).toString('utf8');
    expect(svg).toContain('width="279.4mm"');
    expect(svg).toContain(escapeXml('A book <for> us & you'));
    expect(svg).toContain(escapeXml('Literal <img src=x onerror=alert(1)>.'));
    expect(svg).not.toContain('id="cut-guide"');
    await mountStudio(page);
    await expect(title).toHaveValue('A book <for> us & you');
    await page.getByRole('button', { name: 'All pages', exact: true }).click();
    await page.getByRole('button', { name: /^Page 2,?:/ }).click();
    await expect(page.getByRole('button', { name: /^Page 2,?:/ })).toBeFocused();
    await expect(body).toHaveValue(text);
    await page.getByRole('button', { name: 'Close All eight pages', exact: true }).click();
    await page.getByRole('link', { name: 'Starter library', exact: true }).click();
    await page.getByRole('button', { name: /A blank beginning/ }).click();
    await expect(title).toHaveValue('Something worth sharing');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(title).toHaveValue('A book <for> us & you');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(title).toHaveValue('Something worth sharing');
    await title.focus();
    await page.keyboard.press('Control+z');
    await expect(title).toHaveValue('A book <for> us & you');
  });

  test('keeps over-budget edits visible but out of storage and export, then cleans up on abort', async ({ page }) => {
    await mountStudio(page);
    await page.getByRole('textbox', { name: 'Zine title' }).fill('The saved version');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    const body = page.getByRole('textbox', { name: 'Page text', exact: true });
    const previous = await body.inputValue();
    await body.fill('x'.repeat(361));
    await expect(body).toHaveValue('x'.repeat(361));
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download A4 sheet', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as ZineDocument, STORAGE_KEY);
    expect(saved.pages[1]!.body).toBe(previous);
    await expect(page.locator('.zine-save-status')).toContainText('Not saved yet');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(body).toHaveValue(previous);
    await body.fill('\n'.repeat(35));
    await expect(body).toHaveValue('\n'.repeat(35));
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download A4 sheet', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
    await expect(page.locator('.zine-export-warning')).toContainText('will not fit');
    await page.evaluate(() => {
      const state = (window as typeof window & { zineTest: { controller: AbortController; instance: { destroy(): void } } }).zineTest;
      state.controller.abort();
      state.instance.destroy();
    });
    await expect(page.locator('.project-zine')).toHaveCount(0);
    await mountStudio(page);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(body).toHaveValue(previous);
    await expect(page.locator('.project-zine')).toHaveCount(1);
  });

  test('fits all originals using actual browser font metrics', async ({ page }) => {
    await mountStudio(page);
    const results = await page.evaluate(async () => {
      const enginePath = '/src/projects/zine/engine.ts';
      const dataPath = '/src/projects/zine/data.ts';
      const engine = await import(enginePath) as typeof import('../../src/projects/zine/engine');
      const data = await import(dataPath) as typeof import('../../src/projects/zine/data');
      const measure = engine.canvasMeasurer(document.createElement('canvas').getContext('2d')!);
      const results: { name: string; issues: string[] }[] = [];
      for (const starter of data.STARTERS) {
        for (const paper of ['a4', 'letter'] as const) {
          for (const theme of engine.THEME_IDS) {
            const draft = { ...engine.cloneDocument(starter.document), paper, theme };
            results.push({
              name: `${starter.id} / ${paper} / ${theme}`,
              issues: engine.analyzeDocument(draft, data.THEMES[theme], measure).issues.map((issue) => issue.message),
            });
          }
        }
      }
      return results;
    });
    expect(results).toHaveLength(18);
    for (const result of results) expect(result.issues, result.name).toEqual([]);
  });

  test('reports storage failure and revokes downloads when its lifetime ends', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
      const created: string[] = [];
      const revoked: string[] = [];
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        revoked.push(url);
        revoke(url);
      };
      Object.assign(window, { zineUrls: { created, revoked } });
    });
    await mountStudio(page);
    await expect(page.locator('.zine-save-status')).toContainText('Local saving is unavailable');
    await page.getByRole('textbox', { name: 'Zine title' }).fill('A copy to keep');
    await expect(page.locator('.zine-save-status')).toContainText('Local saving is unavailable');
    await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download A4 sheet', exact: true }).click(),
    ]);
    const lifecycle = await page.evaluate(() => {
      const state = window as typeof window & {
        zineTest: { controller: AbortController; instance: { destroy(): void } };
        zineUrls: { created: string[]; revoked: string[] };
      };
      const oldButton = document.querySelector<HTMLButtonElement>('.zine-download')!;
      state.zineTest.controller.abort();
      state.zineTest.instance.destroy();
      oldButton.click();
      return state.zineUrls;
    });
    expect(lifecycle.created).toHaveLength(1);
    expect(lifecycle.revoked).toEqual(lifecycle.created);
    await expect(page.locator('.project-zine')).toHaveCount(0);
  });

  test('one-screen writing, artwork and secondary panes work at actual viewport sizes', async ({ page }, testInfo) => {
    for (const viewport of [
      { width: 1440, height: 900 }, { width: 1280, height: 720 },
      { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('./projects/zine/');
      const root = page.locator('.project-zine');
      await expect(root).toHaveAttribute('data-workspace', 'true');
      const fit = async () => {
        const geometry = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth,
          viewportHeight: innerHeight, viewportWidth: innerWidth, scroll: scrollY,
        }));
        expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight + 1);
        expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
        expect(geometry.scroll).toBe(0);
      };
      await page.screenshot({ path: testInfo.outputPath(`zine-${viewport.width}x${viewport.height}-read.png`) });
      await fit();
      await root.getByRole('button', { name: 'Edit text', exact: true }).click();
      await root.getByRole('textbox', { name: 'Zine title' }).fill('One screen, eight pages');
      await root.getByRole('button', { name: 'Next page', exact: true }).click();
      await root.getByRole('textbox', { name: 'Page text', exact: true }).fill('A thought that fits on paper.');
      await fit();
      const bodyBox = await root.getByRole('textbox', { name: 'Page text', exact: true }).boundingBox();
      expect(bodyBox!.height).toBeGreaterThanOrEqual(44);
      expect(bodyBox!.y + bodyBox!.height).toBeLessThan(viewport.height);
      await page.screenshot({ path: testInfo.outputPath(`zine-${viewport.width}x${viewport.height}-write.png`) });
      await root.getByRole('button', { name: 'Ink & export', exact: true }).click();
      await root.getByRole('button', { name: 'Field notes', exact: true }).click();
      await expect(root.getByRole('button', { name: 'Field notes', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(root.locator('.zine-sheet g[data-page]')).toHaveCount(8);
      if (viewport.width === 320) {
        await page.screenshot({ path: testInfo.outputPath('zine-320-export.png') });
        await root.getByRole('tab', { name: 'Print layout', exact: true }).click();
        await expect(root.locator('.zine-sheet > svg')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('zine-320-sheet.png') });
        await root.getByRole('tab', { name: 'Ink & output', exact: true }).click();
        const download = page.waitForEvent('download');
        await root.getByRole('button', { name: 'Download A4 sheet', exact: true }).click();
        expect((await download).suggestedFilename()).toBe('one-screen-eight-pages-a4-8-page.svg');
      }
      await root.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
      await expect(root.locator('.zine-page-announcement')).toHaveText('2 / 8');
      await expect(root.getByRole('textbox', { name: 'Page text', exact: true })).toHaveValue('A thought that fits on paper.');
      await fit();
      await root.getByRole('textbox', { name: 'Page text', exact: true }).fill('x'.repeat(361));
      await expect(root.locator('.zine-export-warning')).toBeVisible();
      await expect(root.locator('.zine-export-warning')).toContainText('over 360');
      if (viewport.width === 320) await page.screenshot({ path: testInfo.outputPath('zine-320-validation.png') });
      await fit();
      const countBox = await root.locator('.zine-field:has(textarea) .zine-field-count').boundingBox();
      const feedbackBox = await root.locator('.zine-worktable-bottom').boundingBox();
      expect(countBox!.y + countBox!.height).toBeLessThanOrEqual(feedbackBox!.y + 1);
      await root.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(root.getByRole('textbox', { name: 'Page text', exact: true })).toHaveValue('A thought that fits on paper.');
      if (viewport.width === 375) {
        await root.getByRole('link', { name: 'Starter library', exact: true }).click();
        await root.getByRole('button', { name: /The nearby expedition/ }).click();
        await expect(root.locator('.zine-page-announcement')).toHaveText('2 / 8');
        await expect(root.getByRole('textbox', { name: 'Page text', exact: true })).toBeVisible();
        await root.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(root.getByRole('textbox', { name: 'Page text', exact: true })).toHaveValue('A thought that fits on paper.');
      }
      await root.getByRole('link', { name: 'Starter library', exact: true }).click();
      await root.getByRole('button', { name: /A blank beginning/ }).click();
      await root.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(root.getByRole('textbox', { name: 'Zine title' })).toHaveValue('One screen, eight pages');
      await fit();
    }
  });

  test('print media uses the complete physical sheet, never the screen height or open panes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('./projects/zine/');
    for (const paper of ['a4', 'letter']) {
      await page.emulateMedia({ media: 'screen' });
      await page.getByRole('button', { name: 'Ink & export', exact: true }).click();
      await page.getByRole('combobox', { name: 'Paper on your printer' }).selectOption(paper);
      await page.getByRole('button', { name: 'Close Ink & export', exact: true }).click();
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      const sheet = page.locator('.zine-print-output > svg');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('g[data-page]')).toHaveCount(8);
      await expect(sheet).toHaveAttribute('width', paper === 'a4' ? '297mm' : '279.4mm');
      const box = await sheet.boundingBox();
      expect(box!.width).toBeCloseTo((paper === 'a4' ? 297 : 279.4) * 96 / 25.4, 0);
      expect(box!.height).toBeCloseTo((paper === 'a4' ? 210 : 215.9) * 96 / 25.4, 0);
      await expect(page.locator('.zine-shell')).toBeHidden();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.locator('.collection-menu')).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`zine-print-${paper}.png`), fullPage: true });
    }
    await page.emulateMedia({ media: 'screen' });
    await expect(page.getByRole('button', { name: 'Collection menu', exact: true })).toBeVisible();
  });
});
