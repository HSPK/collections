import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { deserialize, serialize } from '../../src/projects/loadpath/document';
import { STUDIES } from '../../src/projects/loadpath/presets';
import { cloneModel } from '../../src/projects/loadpath/schema';
import type { Structure } from '../../src/projects/loadpath/schema';

async function openModel(page: Page, model: Structure) {
  await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
  const previousRevision = Number(await page.locator('.project-loadpath').getAttribute('data-revision'));
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'loadpath-study.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serialize(model)),
  });
  await expect.poll(async () => Number(await page.locator('.project-loadpath').getAttribute('data-revision'))).toBeGreaterThan(previousRevision);
  await expect(page.locator('[data-lp-design-name]')).toHaveText(model.name);
  await expect(page.locator('[data-lp-status]')).toContainText('JSON model imported');
  await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
}

async function exportedModel(page: Page): Promise<Structure> {
  await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('The model export did not produce a local download.');
  const model = deserialize(await readFile(path, 'utf8'));
  await page.getByRole('button', { name: 'Close Design files & notes', exact: true }).click();
  return model;
}

async function setArea(page: Page, model: Structure, area: number): Promise<Structure> {
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const next = cloneModel(model);
  const member = next.members[0];
  const section = next.sections.find((section) => section.id === member.section);
  if (!section) throw new Error('The fixture member has no section.');
  section.area = area;
  await page.locator('[data-lp-select-kind="member"]').click();
  await page.locator('[data-lp-selection]').selectOption(member.id);
  await page.locator('[data-lp-field="area"]').fill(String(area * 1e6));
  await page.locator('[data-lp-field="area"]').press('Tab');
  expect(await exportedModel(page)).toEqual(next);
  return next;
}

async function setLoadX(page: Page, model: Structure, force: number): Promise<Structure> {
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const next = cloneModel(model);
  const loadCase = next.loadCases.find((loadCase) => loadCase.id === next.activeCase);
  if (!loadCase?.loads.length) throw new Error('The fixture needs a point load in its active case.');
  const load = loadCase.loads[0];
  load.force[0] = force;
  await page.locator('[data-lp-select-kind="node"]').click();
  await page.locator('[data-lp-selection]').selectOption(load.node);
  await page.locator('[data-lp-field="load-0"]').fill(String(force / 1000));
  await page.locator('[data-lp-field="load-0"]').press('Tab');
  expect(await exportedModel(page)).toEqual(next);
  return next;
}

function importedPair(name: string): [Structure, Structure] {
  const first = cloneModel(STUDIES[0].model);
  first.name = name;
  first.sections[0].area = 0.0015;
  first.nodes[12].position[1] = 5.6;
  first.activeCase = first.loadCases[1].id;
  first.loadCases[1].loads[0].force = [1300, -4200, 2600];
  const second = cloneModel(first);
  second.sections[0].area = 0.0045;
  second.nodes[12].position[1] = 6.1;
  second.activeCase = second.loadCases[2].id;
  second.loadCases[2].loads[0].force = [-1800, -9300, 1700];
  return [first, second];
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  // Keep unrelated shared-server HMR from replacing a live filechooser workflow.
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\/\?token=/, () => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/loadpath/');
  await expect(page.locator('.project-loadpath')).toHaveAttribute('data-ready', 'true');
});

test('Loadpath reset belongs to the restored imported study after undo', async ({ page }) => {
  const [first, second] = importedPair('First imported frame');
  second.name = 'Second imported frame';
  await openModel(page, first);
  await openModel(page, second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-lp-design-name]')).toHaveText(first.name);
  expect(await exportedModel(page)).toEqual(first);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(first);
});

test('Loadpath same-name imports keep distinct reset origins through undo and redo', async ({ page }) => {
  const [first, second] = importedPair('Same display name');
  expect(first.name).toBe(second.name);
  expect(first).not.toEqual(second);
  await openModel(page, first);
  let editedFirst = await setArea(page, first, 0.00225);
  editedFirst = await setLoadX(page, editedFirst, 7500);
  await openModel(page, second);
  const editedSecond = await setArea(page, second, 0.00675);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedFirst);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedSecond);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedSecond);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedFirst);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(first);
});

test('Loadpath pinned restoration retains the original same-name import baseline, not its edited snapshot', async ({ page }) => {
  const [first, second] = importedPair('Pinned frame');
  await openModel(page, first);
  let editedFirst = await setArea(page, first, 0.00225);
  editedFirst = await setLoadX(page, editedFirst, 7500);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByRole('button', { name: 'Pin this design', exact: true }).click();
  await openModel(page, second);
  const editedSecond = await setArea(page, second, 0.00675);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByRole('button', { name: 'Restore pinned', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedFirst);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(first);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedFirst);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedSecond);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);
});

test('Loadpath identical working models retain different reset origins as separate history states', async ({ page }) => {
  const [first] = importedPair('Identical working model');
  const second = cloneModel(first);
  second.sections[0].area = 0.0045;
  await openModel(page, first);
  const editedFirst = await setArea(page, first, second.sections[0].area);
  expect(editedFirst).toEqual(second);
  await openModel(page, second);
  expect(await exportedModel(page)).toEqual(second);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(editedFirst);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(first);
});

test('Loadpath authored preset resets still restore original sections and loads after pin and history restoration', async ({ page }) => {
  const authored = cloneModel(STUDIES[0].model);
  let edited = await setArea(page, authored, 0.0045);
  edited = await setLoadX(page, edited, 6400);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByRole('button', { name: 'Pin this design', exact: true }).click();
  await page.locator('[data-lp-study]').selectOption(STUDIES[1].id);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(STUDIES[1].model);
  await page.getByRole('button', { name: 'Restore pinned', exact: true }).click();
  expect(await exportedModel(page)).toEqual(edited);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(authored);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(edited);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedModel(page)).toEqual(authored);
});

test('Loadpath an import with an authored preset display name resets to its file, not the named preset', async ({ page }) => {
  const [imported] = importedPair(STUDIES[0].model.name);
  expect(imported.name).toBe(STUDIES[0].model.name);
  expect(imported).not.toEqual(STUDIES[0].model);
  await openModel(page, imported);
  await setArea(page, imported, 0.0045);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(imported);
  await page.locator('[data-lp-study]').selectOption(STUDIES[1].id);
  await page.locator('[data-lp-study]').selectOption(STUDIES[0].id);
  await setArea(page, STUDIES[0].model, 0.00675);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(STUDIES[0].model);
});

test('Loadpath viewport workspace preserves live FEM editing, results and export across all sizes', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const root = page.locator('.project-loadpath');
  await expect(root).toHaveAttribute('data-workspace', 'true');
  const baseline = await exportedModel(page);
  for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    for (const pane of ['structure', 'edit', 'results']) {
      await page.locator(`[data-lp-pane="${pane}"]`).click();
      await expect(page.locator(`[data-lp-pane="${pane}"]`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.lp-canvas')).toBeInViewport();
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ width, height, x: 0, y: 0 });
      const canvas = await page.locator('.lp-canvas').boundingBox();
      expect(canvas!.width).toBeGreaterThan(100);
      expect(canvas!.height).toBeGreaterThan(60);
    }
    const edited = await setArea(page, baseline, 0.00375);
    await expect(page.locator('[data-lp-field="area"]')).toBeInViewport();
    await page.locator('[data-lp-pane="structure"]').click();
    await page.locator('[data-lp-deformed]').check();
    await expect(page.locator('[data-lp-scene]')).toHaveAttribute('data-amplification', '400');
    expect(await exportedModel(page)).toEqual(edited);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await exportedModel(page)).toEqual(baseline);
    await page.locator('[data-lp-deformed]').uncheck();
    await page.locator('[data-lp-pane="edit"]').click();
    await page.locator('.lp-dock-panels > :not([hidden])').evaluate(element => { element.scrollTop = 0; });
    const capture = testInfo.outputPath(`loadpath-workspace-${width}x${height}.png`);
    await page.screenshot({ path: capture });
    await testInfo.attach(`Loadpath ${width}x${height}`, { path: capture, contentType: 'image/png' });
    expect(await page.locator('[data-lp-field="area"]').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  }
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.locator('[data-lp-support-details] > summary').click();
  await page.locator('[data-lp-supports] table').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-lp-supports] table')).toBeInViewport();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await exportedModel(page)).toEqual(baseline);
  await page.getByRole('button', { name: 'Files & notes', exact: true }).click();
  await page.getByText('Model assumptions & numerical limits', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Files & notes', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
