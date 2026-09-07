import { expect, test } from '@playwright/test';
import { presetScene } from '../../src/projects/lumen/presets';
import { serializeExperiment } from '../../src/projects/lumen/state';

test('Lumen restores the right study baseline when an import is undone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const first = { ...presetScene('dispersion'), title: 'First imported study' };
  const prism = first.elements.find((element) => element.kind === 'prism');
  if (!prism) throw new Error('The dispersion fixture needs a prism.');
  const second = {
    ...first,
    title: 'Second imported study',
    elements: first.elements.map((element) => element.id === prism.id ? { ...element, x: prism.x + 80 } : element),
  };
  await page.goto('./projects/lumen/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await page.locator('[data-lumen-files]').click();
  const firstChooser = page.waitForEvent('filechooser');
  await page.locator('[data-action="open"]').click();
  await (await firstChooser).setFiles({ name: 'first.json', mimeType: 'application/json', buffer: Buffer.from(serializeExperiment(first)) });
  await expect(page.locator('[data-scene-title]')).toHaveText(first.title);
  await page.getByRole('button', { name: 'Close Experiments & field guide', exact: true }).click();
  await page.locator('[data-selection]').selectOption(prism.id);
  const position = page.locator('[data-field="x"]');
  await position.fill(String(prism.x + 25));
  await position.press('Tab');
  await page.locator('[data-lumen-files]').click();
  const secondChooser = page.waitForEvent('filechooser');
  await page.locator('[data-action="open"]').click();
  await (await secondChooser).setFiles({ name: 'second.json', mimeType: 'application/json', buffer: Buffer.from(serializeExperiment(second)) });
  await expect(page.locator('[data-scene-title]')).toHaveText(second.title);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('[data-scene-title]')).toHaveText(first.title);
  await page.locator('[data-selection]').selectOption(prism.id);
  await expect(position).toHaveValue(String(prism.x + 25));
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator('[data-scene-title]')).toHaveText(first.title);
  await page.locator('[data-selection]').selectOption(prism.id);
  await expect(position).toHaveValue(String(prism.x));
  await page.locator('[data-action="undo"]').click();
  await expect(position).toHaveValue(String(prism.x + 25));
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(812);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
