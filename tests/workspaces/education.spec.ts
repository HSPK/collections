import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
  { width: 768, height: 480 },
];

const labs = [
  { id: 'vector-playground', stage: '.vp-svg', control: '[data-vp-number="a"]', state: 'data-determinant' },
  { id: 'gradient-lab', stage: '[data-landscape] canvas', control: '#gl-rate', state: 'data-rate' },
  { id: 'attention-studio', stage: '.as-heatmap', control: '[data-embedding-row="1"][data-embedding-column="0"]', state: '' },
  { id: 'decoding-lab', stage: '.dl-overview', control: '', state: 'data-steps' },
  { id: 'patchwork-vision', stage: '[data-image]', control: '[data-color]', state: 'data-score' },
  { id: 'engine-room', stage: '[data-drawing] svg', control: '#er-cycle', state: 'data-angle' },
  { id: 'motor-field-lab', stage: '[data-mfl-motor] svg', control: '[data-mfl-angle]', state: 'data-electrical-angle' },
  { id: 'gearbox-playground', stage: '[data-scene-host] svg', control: '[aria-label="Timeline in seconds"]', state: 'data-time' },
  { id: 'linkage-atlas', stage: '[data-plot] svg', control: '#linkage-angle', state: 'data-angle' },
  { id: 'cam-workshop', stage: '.cw-machine-svg', control: '[data-cw-scrub]', state: 'data-angle' },
];

async function withinViewport(locator: Locator, width: number, height: number, minimumHeight = 30) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  expect(box.width).toBeGreaterThan(30);
  expect(box.height).toBeGreaterThanOrEqual(minimumHeight);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
}

async function documentFits(page: Page, size: { width: number; height: number }) {
  await expect.poll(() => page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    x: window.scrollX, y: window.scrollY,
  }))).toEqual({ ...size, x: 0, y: 0 });
}

async function launcherDoesNotCoverControls(root: Locator) {
  const blocked = await root.evaluate(element => {
    const menu = document.querySelector<HTMLElement>('[data-menu-toggle]');
    if (!menu) throw new Error('The collection menu must be present for hit-target coverage.');
    const menuBox = menu.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [role="button"]')]
      .filter(control => {
        if (!control.getClientRects().length || getComputedStyle(control).visibility === 'hidden') return false;
        const box = control.getBoundingClientRect();
        let left = Math.max(0, box.left, menuBox.left), right = Math.min(innerWidth, box.right, menuBox.right);
        let top = Math.max(0, box.top, menuBox.top), bottom = Math.min(innerHeight, box.bottom, menuBox.bottom);
        for (let parent = control.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
          }
        }
        if (right <= left || bottom <= top) return false;
        return [0.25, 0.5, 0.75].some(x => [0.25, 0.5, 0.75].some(y =>
          document.elementFromPoint(left + x * (right - left), top + y * (bottom - top))
            ?.closest('[data-collection-menu]')));
      })
      .map(control => ({
        label: control.getAttribute('aria-label') || control.id || control.textContent?.trim(),
        rect: control.getBoundingClientRect().toJSON(),
      }));
  });
  expect(blocked, 'The floating menu must not intercept any visible control hit target.').toEqual([]);
}

for (const lab of labs) {
  test(`${lab.id}: visible simulation and real editing stay in every viewport`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(`./projects/${lab.id}/`);
      await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
      const root = page.locator(`.project-${lab.id}`);
      await expect(root).toHaveAttribute('data-workspace', 'true');
      await documentFits(page, size);
      const stage = root.locator(lab.stage).first();
      await withinViewport(stage, size.width, size.height, 80);
      if (lab.id === 'decoding-lab') {
        const step = root.getByRole('button', { name: 'Print 1 token', exact: true });
        await withinViewport(step, size.width, size.height, 44);
        await step.focus();
        await step.press('Enter');
        await expect(root).toHaveAttribute('data-steps', '1');
        await expect(root.locator('[data-generated-text]')).toHaveText('ink');
        await expect(step).toBeFocused();
      } else {
        const control = root.locator(lab.control);
        await control.focus();
        await withinViewport(control, size.width, size.height, 44);
        if (lab.id === 'attention-studio') {
          const weight = root.locator('[data-cell-row="0"][data-cell-key="1"]');
          const before = await weight.getAttribute('data-weight');
          await control.fill('4');
          await expect(weight).not.toHaveAttribute('data-weight', before!);
        } else if (lab.id === 'patchwork-vision') {
          const before = await root.getAttribute(lab.state);
          await control.selectOption('blue');
          await expect(root).not.toHaveAttribute(lab.state, before!);
          await expect(root.locator('[data-feature-value="1"]')).toHaveText('1.000');
        } else {
          const before = await root.getAttribute(lab.state);
          await control.press(lab.id === 'vector-playground' ? 'ArrowUp' : 'ArrowRight');
          await expect(root).not.toHaveAttribute(lab.state, before!);
        }
        await expect(control).toBeFocused();
      }
      await documentFits(page, size);
      await withinViewport(stage, size.width, size.height, 80);
      await launcherDoesNotCoverControls(root);
      await page.screenshot({ path: info.outputPath(`${lab.id}-${size.width}x${size.height}.png`) });
      if (size.width === 375) {
        for (const tab of await root.getByRole('tab').all()) {
          if (!await tab.isVisible()) continue;
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expect(tab).toBeFocused();
          await documentFits(page, size);
          await withinViewport(stage, size.width, size.height, 80);
          await launcherDoesNotCoverControls(root);
        }
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await launcherDoesNotCoverControls(root);
      await documentFits(page, size);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    expect(errors).toEqual([]);
  });
}
