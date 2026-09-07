import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 },
  { width: 768, height: 480 },
];
const sites = ['apsis', 'lumen', 'relay', 'palinode', 'roomtone'] as const;

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
  const hits = await control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, y]) => {
      const hit = document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height * y);
      return hit === element || (hit !== null && element.contains(hit));
    });
  });
  expect(hits, `${await control.getAttribute('data-action') ?? await control.textContent()} hit targets`).toEqual([true, true, true, true, true]);
}

async function fits(page: Page) {
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth, viewportHeight: innerHeight, x: scrollX, y: scrollY,
  }))).toEqual({
    width: page.viewportSize()!.width, height: page.viewportSize()!.height,
    viewportWidth: page.viewportSize()!.width, viewportHeight: page.viewportSize()!.height, x: 0, y: 0,
  });
}

for (const site of sites) {
  for (const viewport of viewports) {
    test(`${site}: ${viewport.width}x${viewport.height} real controls clear the floating menu`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.goto(`./projects/${site}/`);
      const root = page.locator(`.project-${site}`);
      await expect(root).toHaveAttribute('data-workspace', 'true');

      if (site === 'apsis') {
        const build = root.locator('[data-apsis-build]');
        const execute = root.locator('[data-apsis-execute]');
        await reachable(build);
        await build.click();
        await reachable(execute);
        await execute.click();
        await reachable(execute);
        await execute.click();
        await expect(root).toHaveAttribute('data-mission-complete', 'true');
        await reachable(root.locator('[data-apsis-run]'));
      } else if (site === 'lumen') {
        await reachable(root.locator('[data-action="remove"]'));
        await root.locator('[data-action="remove"]').click();
        await root.locator('[data-action="undo"]').click();
        await expect(root.locator('[data-selection]')).toHaveValue('source-1');
        await expect(root.locator('[data-optic-id="prism-1"]')).toHaveCount(1);
        await root.getByRole('tab', { name: 'Notebook', exact: true }).click();
        await reachable(root.locator('[data-notes]'));
        await reachable(root.locator('[data-action="record"]'));
        await root.locator('[data-action="record"]').click();
        await expect(root.locator('[data-notes]')).toHaveValue(/mW/);
      } else if (site === 'relay') {
        await root.locator('[data-relay-action="step"]').click();
        const reverse = root.locator('[data-relay-action="reverse"]');
        await reachable(reverse);
        await reverse.click();
        if (viewport.width < 1000) await root.locator('[data-relay-pane="output"]').click();
        else await root.getByRole('tab', { name: 'Screen', exact: true }).click();
        await reachable(root.locator('[data-relay-action="guide"]'));
        await root.locator('[data-relay-action="guide"]').click();
        const confirm = root.locator('[data-relay-action="replace-confirm"]');
        if (await confirm.isVisible()) await confirm.click();
        await reachable(root.locator('[data-relay-action="guide-next"]'));
        await root.locator('[data-relay-action="guide-next"]').click();
        await reachable(root.locator('[data-relay-action="guide-close"]'));
      } else if (site === 'palinode') {
        const next = root.locator('[data-action="next-document"]');
        const previous = await root.locator('#palinode-document-title').textContent();
        await reachable(next);
        await next.click();
        await expect(root.locator('#palinode-document-title')).not.toHaveText(previous!);
        await reachable(next);
        await root.getByRole('tab', { name: 'Decide', exact: true }).click();
        await root.locator('[data-era="0"]').click();
        await reachable(root.locator('[data-choice="shore:steps"]'));
        await root.locator('[data-choice="shore:steps"]').click();
        await expect(root.locator('[data-main-map]')).toHaveAttribute('data-shore', 'steps');
        await root.getByRole('tab', { name: 'Read', exact: true }).click();
        await reachable(next);
      } else {
        await expect(root).toHaveAttribute('data-audio-state', 'off');
        await reachable(root.locator('[data-action="play"]'));
        const settings = root.getByRole('button', { name: 'Sound', exact: true });
        await reachable(settings);
        await settings.click();
        await reachable(root.locator('[data-wet]'));
        await reachable(root.locator('[data-level]'));
        await root.getByRole('button', { name: 'Close Sound settings', exact: true }).click();
        await root.getByRole('tab', { name: 'Response', exact: true }).click();
        await reachable(root.locator('[data-action="next-path"]'));
        await root.locator('[data-action="next-path"]').click();
        await reachable(root.locator('[data-action="export"]'));
        await expect(root).toHaveAttribute('data-audio-state', 'off');
      }
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath(`${site}-menu-safe-${viewport.width}x${viewport.height}.png`) });
      expect(errors).toEqual([]);
    });
  }
}
