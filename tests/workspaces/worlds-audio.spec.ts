import { expect, test } from '@playwright/test';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';

const sizes = [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
];
const sites = [
  { id: 'rules', visual: '[data-board]', action: '[data-step]', cornerTargets: ['[data-load]'] },
  { id: 'scale', visual: '.scale-pair', action: '[data-action="swap"]', cornerTargets: ['.scale-notebook-button'] },
  { id: 'algorithms', visual: '[data-slots]', action: '[data-next]', cornerTargets: ['#algorithms-scrub', '[data-array-form] button'] },
  { id: 'city', visual: '[data-city-art]', action: '[data-city-action="place"]', cornerTargets: ['.city-history-actions button'] },
  { id: 'weather', visual: '[data-weather-scene]', action: '[data-weather-station-select]', cornerTargets: ['.weather-watch-grid label'] },
  { id: 'synth', visual: '.synth-sequence-scroll', action: '.synth-play', cornerTargets: ['.synth-clear'] },
  { id: 'radio', visual: '.radio-dial', action: '[data-radio-listen]', cornerTargets: ['[data-radio-volume]', '[data-radio-copy]'] },
];

for (const site of sites) {
  test(`${site.id}: bounded workspace survives responsive round trips`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`./projects/${site.id}/`);
    const root = page.locator(`.project-${site.id}[data-workspace="true"]`);
    await expect(root).toBeVisible();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectWorkspaceViewport(page, size.width, size.height);
      expect(await visibleControlProblems(root), `${site.id} ${size.width}x${size.height}`).toEqual([]);
      for (const selector of [site.visual, site.action]) {
        const box = await root.locator(selector).boundingBox();
        expect(box, selector).not.toBeNull();
        expect(box!.y, selector).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, selector).toBeLessThanOrEqual(size.height + 1);
        expect(box!.height, selector).toBeGreaterThan(25);
      }
      const menu = (await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox())!;
      for (const selector of site.cornerTargets) {
        const targets = root.locator(selector);
        expect(await targets.count(), selector).toBeGreaterThan(0);
        for (const target of await targets.all()) {
          await target.scrollIntoViewIfNeeded();
          const box = (await target.boundingBox())!;
          const overlaps = box.x < menu.x + menu.width && box.x + box.width > menu.x &&
            box.y < menu.y + menu.height && box.y + box.height > menu.y;
          expect(overlaps, `${site.id} ${selector}: collection menu overlaps the control`).toBe(false);
          expect(await target.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const points = [
              [bounds.left + 8, bounds.top + bounds.height / 2],
              [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2],
              [bounds.right - 8, bounds.top + bounds.height / 2],
              [bounds.right - 8, bounds.bottom - 8],
            ];
            return points.every(([x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return hit === element || element.contains(hit);
            });
          }), `${site.id} ${selector}: control edges must be real hit targets`).toBe(true);
        }
      }
      if (site.id === 'rules') {
        await page.getByRole('button', { name: 'Step', exact: true }).click();
        await expect(root.locator('[data-generation]')).toHaveText('1');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(root.locator('[data-generation]')).toHaveText('0');
        const cell = root.locator('#rules-cell-0');
        await cell.click();
        await expect(cell).toHaveAttribute('aria-label', 'Row 1, column 1, alive');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
      } else if (site.id === 'scale') {
        await root.locator('[data-action="swap"]').click();
        await expect(root.locator('[data-ratio]')).toHaveText('≈ 11×');
        await root.locator('[data-action="swap"]').click();
        await expect(root.locator('[data-b-over-a]')).toHaveText('≈ 11');
      } else if (site.id === 'algorithms') {
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(root.locator('[data-step-number]')).toHaveText('01');
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await expect(root.locator('[data-step-number]')).toHaveText('00');
      }
      await expectWorkspaceViewport(page, size.width, size.height);
      await page.screenshot({ path: info.outputPath(`${site.id}-${size.width}x${size.height}.png`), animations: 'disabled' });
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectWorkspaceViewport(page, 768, 480);
    expect(await visibleControlProblems(root)).toEqual([]);
    await page.setViewportSize(sizes[0]);
    await expectWorkspaceViewport(page, sizes[0].width, sizes[0].height);
    await expect(root.locator(site.visual)).toBeVisible();
    await page.getByRole('button', { name: 'Collection menu', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Collection navigation', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const size of [sizes[1], sizes[3]]) {
  test(`rules: live grid and all tool panes at ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto('./projects/rules/');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Plant', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Row', exact: true }).fill('1');
    await page.getByRole('spinbutton', { name: 'Column', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Apply brush', exact: true }).click();
    await expect(page.locator('[data-population]')).toHaveText('24');
    await page.getByLabel('Board zoom').selectOption('300');
    await page.getByRole('grid').focus();
    await page.getByRole('grid').press('Control+End');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-activedescendant', 'rules-cell-431');
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.getByLabel('Board zoom').selectOption('100');
    await page.getByRole('tab', { name: 'Rules', exact: true }).click();
    await page.getByLabel('At the edge').selectOption('wrap');
    await page.getByRole('tab', { name: 'Keep', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download JSON', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Seed library', exact: true }).click();
    await page.getByRole('button', { name: 'Plant Glider', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-population]')).toHaveText('5');
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(page.locator('[data-generation]')).toHaveText('1');
    await page.getByRole('button', { name: 'Field notes', exact: true }).click();
    await page.getByRole('heading', { name: 'A model, not a miniature ecosystem.', exact: true }).scrollIntoViewIfNeeded();
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.screenshot({ path: info.outputPath(`rules-notes-${size.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Field notes', exact: true })).toBeFocused();
    await expect(page.locator('[data-generation]')).toHaveText('1');
  });

  test(`scale: model and catalogue return to a live comparison at ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto('./projects/scale/');
    await page.getByRole('button', { name: 'Model & comparison notebook', exact: true }).click();
    await page.getByLabel('Make A’s named length', { exact: true }).fill('20');
    await expect(page.locator('[data-model-reading]')).toContainText('2.2 m');
    expect(await visibleControlProblems(page.getByRole('dialog', { name: 'Comparison notebook', exact: true }))).toEqual([]);
    await page.locator('.scale-pair-caveats summary').click();
    await page.locator('[data-pair-caveats] a').last().scrollIntoViewIfNeeded();
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.screenshot({ path: info.outputPath(`scale-notebook-${size.width}.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Catalogue', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search field notes' }).fill('DNA');
    await page.getByRole('button', { name: 'Explore DNA double helix', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
    const alternate = size.width < 600 ? sizes[1] : sizes[3];
    await page.setViewportSize(alternate);
    await expectWorkspaceViewport(page, alternate.width, alternate.height);
    await expect(page.locator('#scale-reference')).toHaveValue('dna');
    const plate = (await page.locator('.scale-plate').boundingBox())!;
    expect(plate.height).toBeGreaterThan(100);
    expect(plate.y + plate.height).toBeLessThanOrEqual(alternate.height);
    await page.screenshot({ path: info.outputPath(`scale-explorer-${alternate.width}.png`) });
    await page.setViewportSize(size);
    await page.getByRole('button', { name: 'Compare as A', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Compare', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#scale-compare-a')).toHaveValue('dna');
    await expect(page.locator('[data-ratio]')).toContainText('10');
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.screenshot({ path: info.outputPath(`scale-extreme-${size.width}.png`) });
  });

  test(`algorithms: editor and trace keep the full twelve-item model at ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto('./projects/algorithms/');
    const input = page.getByRole('textbox', { name: 'Write your opening array' });
    await input.fill('99, -99, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0');
    await input.press('Enter');
    await page.getByRole('slider', { name: 'Trace position' }).press('End');
    await expect(page.locator('[data-current-array]')).toHaveText('[-99, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 99]');
    await expect(page.locator('[data-slot]')).toHaveCount(12);
    await page.getByRole('tab', { name: 'Trace', exact: true }).click();
    await expect(page.locator('[data-explanation]')).toBeVisible();
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.getByRole('tab', { name: 'Script', exact: true }).click();
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.locator('[data-code-line][aria-current="step"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`algorithms-script-${size.width}.png`) });
    await expectWorkspaceViewport(page, size.width, size.height);
    await page.getByRole('tab', { name: 'Totals', exact: true }).click();
    await expect(page.locator('[data-score-method]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Counting rules', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Counting rules', exact: true }).getByRole('heading', { name: 'Comparisons', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Array', exact: true }).click();
    await expect(input).toHaveValue('99, -99, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0');
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('[data-current-array]')).toHaveText('[99, -99, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]');
    await expectWorkspaceViewport(page, size.width, size.height);
  });
}
