import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { clone } from '../../src/projects/section/model';
import type { Document } from '../../src/projects/section/model';
import { STUDIES } from '../../src/projects/section/presets';
import { parseDocument, serializeDocument } from '../../src/projects/section/state';

test.beforeEach(async ({ page }) => {
  // Unrelated shared-server HMR must not remount a construction during its history workflow.
  await page.routeWebSocket((url) => url.searchParams.has('token'), (socket) => { socket.onMessage(() => {}); });
});

async function settled(page: Page) {
  await expect(page.locator('.project-section')).toHaveAttribute('data-computing', 'false');
}

async function editOffset(page: Page, offset: number) {
  const input = page.locator('[data-offset-number]');
  await input.fill(String(offset));
  await input.press('Tab');
  await settled(page);
  await expect(input).toHaveValue(String(offset));
}

async function expectSavedConstruction(page: Page, document: Document) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error('The construction download is missing.');
  expect(parseDocument(await readFile(path, 'utf8'))).toEqual(document);
}

async function openConstruction(page: Page, document: Document) {
  const previousRevision = await page.locator('.project-section').getAttribute('data-revision');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open JSON', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'section-study.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeDocument(document)),
  });
  await expect(page.locator('[data-title]')).toHaveText(document.title);
  await expect(page.locator('[data-offset-number]')).toHaveValue(String(document.plane.offset));
  await expect(page.locator('.project-section')).not.toHaveAttribute('data-revision', previousRevision ?? '');
  await expect(page.locator('.project-section')).toHaveAttribute('data-computing', 'false');
}

test('Section reset preserves the restored origin of same-title imported constructions', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = STUDIES[0].create();
  first.title = 'Two drafts, one title';
  first.plane.offset = 8;
  const second = clone(first);
  second.plane.offset = 21;
  await page.goto('./projects/section/');
  const root = page.locator('.project-section');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await openConstruction(page, first);
  await openConstruction(page, second);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await expect(page.locator('[data-offset-number]')).toHaveValue('8');
  await expect(root).toHaveAttribute('data-computing', 'false');
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await expect(root).toHaveAttribute('data-computing', 'false');
  await expect(page.locator('[data-offset-number]')).toHaveValue('8');
});

test('Section reset follows same-title origins through redo, edits and repeated imports', async ({ page }) => {
  test.setTimeout(90_000);
  const first = STUDIES[0].create();
  first.title = 'Three imports, one title';
  const second = clone(first);
  second.plane = { offset: 21, rotation: [17, -12, 31] };
  second.primitives[0].radius = 31;
  const third = clone(first);
  third.plane = { offset: -14, rotation: [-25, 19, 8] };
  third.primitives[0].radius = 18;
  await page.goto('./projects/section/');
  await expect(page.locator('.project-section')).toHaveAttribute('data-ready', 'true');
  await openConstruction(page, first);
  await openConstruction(page, second);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, first);
  await page.getByRole('button', { name: 'Redo last edit', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, second);
  await editOffset(page, 37);
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, second);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expect(page.locator('[data-offset-number]')).toHaveValue('37');
  await openConstruction(page, third);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expect(page.locator('[data-offset-number]')).toHaveValue('37');
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, second);
  await expect(page.getByRole('button', { name: 'Redo last edit', exact: true })).toBeDisabled();
});

test('Section reset separates a same-title imported origin from a revisited built-in study', async ({ page }) => {
  test.setTimeout(90_000);
  const imported = STUDIES[0].create();
  imported.plane = { offset: 21, rotation: [11, 24, -9] };
  imported.primitives[0].radius = 31;
  await page.goto('./projects/section/');
  await expect(page.locator('.project-section')).toHaveAttribute('data-ready', 'true');
  await openConstruction(page, imported);
  await expect(page.locator('[data-study="tender"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-study="vessel"]').click();
  await settled(page);
  await page.locator('[data-study="tender"]').click();
  await settled(page);
  await expect(page.locator('[data-study="tender"]')).toHaveAttribute('aria-pressed', 'true');
  await expectSavedConstruction(page, STUDIES[0].create());
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, STUDIES[2].create());
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, imported);
  await expect(page.locator('[data-study="tender"]')).toHaveAttribute('aria-pressed', 'false');
  await editOffset(page, 33);
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, imported);
});

test('Section reset retains origin-only imports when geometry matches the current edit', async ({ page }) => {
  test.setTimeout(90_000);
  const first = STUDIES[0].create();
  first.title = 'Identical geometry, different origin';
  first.plane.offset = 8;
  const second = clone(first);
  second.plane.offset = 21;
  await page.goto('./projects/section/');
  await expect(page.locator('.project-section')).toHaveAttribute('data-ready', 'true');
  await openConstruction(page, first);
  await editOffset(page, 21);
  await openConstruction(page, second);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, second);
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await settled(page);
  await expectSavedConstruction(page, first);
});
