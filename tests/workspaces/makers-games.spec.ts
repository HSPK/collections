import { expect, test } from '@playwright/test';

const sites = [
  {
    id: 'palette', guide: 'Notes', guideRole: 'button', dialog: 'Kitchen notes',
    surfaces: ['.pk-spectrum', '.workspace-tabs', '[data-base-form]', '.pk-status'],
  },
  {
    id: 'pixel-loom', guide: 'Help', guideRole: 'button', dialog: 'Little shortcuts & studio notes',
    surfaces: ['[data-canvas]', '.pl-toolbar', '.pl-history', '.pl-status'],
  },
  {
    id: 'transit', guide: 'Field guide', guideRole: 'link', dialog: 'Field guide',
    surfaces: ['[data-map-scroll]', '.tw-toolbar', '.tw-map-caption', '.tw-status'],
  },
  {
    id: 'zine', guide: 'How to fold', guideRole: 'link', dialog: 'How to fold',
    surfaces: ['.zine-reader', '.zine-worktable-top', '.zine-shared-navigation', '.zine-worktable-bottom'],
  },
  {
    id: 'nonogram', guide: 'How to play', guideRole: 'link', dialog: 'The club handbook',
    surfaces: ['.nc-board-wrap', '.nc-paint-tools', '.nc-game-actions', '.nc-page-turn'],
  },
  {
    id: 'detective', guide: 'Bureau guide', guideRole: 'button', dialog: 'The bureau guide',
    surfaces: ['.td-pane-stack', '.td-desk-actions', '.td-footer-actions'],
  },
  {
    id: 'word-circuit', guide: 'How to play', guideRole: 'button', dialog: 'How to play',
    surfaces: ['.wc-circuit', '.wc-move-form', '.wc-utility-row', '.wc-feedback'],
  },
  {
    id: 'parcel', guide: 'Field guide', guideRole: 'button', dialog: 'The field guide',
    surfaces: ['[data-map]', '.parcel-dpad', '.parcel-actions', '.parcel-status-row'],
  },
] as const;

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
  { width: 320, height: 640 },
  { width: 768, height: 480 },
];

test.beforeEach(async ({ page }) => {
  // Other contributors use this Vite server while these in-memory attempts are open.
  await page.routeWebSocket(url => url.searchParams.has('token'), () => {});
});

for (const site of sites) {
  for (const viewport of viewports) {
    test(`${site.id} ${viewport.width}x${viewport.height}: visible workspace, native notes and collection menu`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`./projects/${site.id}/`);
      const root = page.locator(`.project-${site.id}`);
      await expect(root).toHaveAttribute('data-workspace', 'true');
      const assertScreen = async () => {
        expect(await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          x: scrollX, y: scrollY,
        }))).toEqual({ ...viewport, x: 0, y: 0 });
      };
      const assertHitTargets = async () => {
        const covered = await root.evaluate(element => {
          const menu = document.querySelector<HTMLButtonElement>('[aria-label="Collection menu"]');
          if (!menu) throw new Error('The collection menu must remain available.');
          const menuBox = menu.getBoundingClientRect();
          return [...element.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')]
            .flatMap(control => {
              if (!control.checkVisibility() || control.closest('[inert], [aria-hidden="true"]')) return [];
              const box = control.getBoundingClientRect();
              if (box.width < 10 || box.height < 10) return [];
              let left = Math.max(0, box.left), top = Math.max(0, box.top);
              let right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
              for (let parent = control.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
                if (style.overflowX !== 'visible') { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
                if (style.overflowY !== 'visible') { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
              }
              if (right - left < 10 || bottom - top < 10) return [];
              const overlapLeft = Math.max(left, menuBox.left), overlapTop = Math.max(top, menuBox.top);
              const overlapRight = Math.min(right, menuBox.right), overlapBottom = Math.min(bottom, menuBox.bottom);
              const points = [{ x: (left + right) / 2, y: (top + bottom) / 2 }];
              if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
                points.push({ x: (overlapLeft + overlapRight) / 2, y: (overlapTop + overlapBottom) / 2 });
              }
              return points.flatMap(point => {
                const hit = document.elementFromPoint(point.x, point.y);
                return hit && menu.contains(hit) ? [{
                  control: control.outerHTML.slice(0, 180), point,
                }] : [];
              });
            });
        });
        expect(covered, 'The collection menu must not cover any visible control hit area').toEqual([]);
      };
      await assertScreen();
      await assertHitTargets();
      for (const selector of site.surfaces) {
        await expect(root.locator(selector)).toBeInViewport({ ratio: 1 });
      }
      const undersizedControls = await root.evaluate(element => [...element.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a, label',
      )].filter(control => {
        const box = control.getBoundingClientRect();
        return control.checkVisibility() && box.width > 10 && box.height > 10 &&
          box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight &&
          parseFloat(getComputedStyle(control).fontSize) < 14;
      }).map(control => ({
        element: control.outerHTML.slice(0, 180),
        size: getComputedStyle(control).fontSize,
      })));
      expect(undersizedControls).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${site.id}-${viewport.width}x${viewport.height}.png`) });
      const tabs = await root.getByRole('tab').all();
      for (const tab of tabs) {
        await tab.click();
        await assertScreen();
        await assertHitTargets();
      }
      if (site.id === 'transit') {
        if (tabs.length) await root.getByRole('tab', { name: 'Workbench', exact: true }).click();
        await root.getByLabel('Station name', { exact: true }).fill('A reachable station');
        await root.getByRole('button', { name: 'Save station', exact: true }).click();
        await assertScreen();
        await assertHitTargets();
        if (viewport.width <= 600) {
          const save = await root.getByRole('button', { name: 'Save station', exact: true }).boundingBox();
          const actions = await root.locator('.tw-editor-actions').boundingBox();
          expect(save!.y + save!.height + 4).toBeLessThanOrEqual(actions!.y);
        }
        await root.getByRole('button', { name: 'Add without pointing', exact: true }).click();
        await expect(root.locator('[data-map] [data-station]')).toHaveCount(21);
        await assertScreen();
        await assertHitTargets();
      }
      if (tabs.length) await tabs[0].click();

      const guide = root.getByRole(site.guideRole, { name: site.guide });
      await expect(guide).toBeInViewport({ ratio: 1 });
      await guide.click();
      const dialog = root.getByRole('dialog', { name: site.dialog, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.workspace-dialog-heading')).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(guide).toBeFocused();
      await assertScreen();

      const menu = page.getByRole('button', { name: 'Collection menu', exact: true });
      await expect(menu).toBeInViewport({ ratio: 1 });
      await menu.click();
      await expect(page.getByRole('link', { name: 'Back to index', exact: true })).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Escape');
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeFocused();
      await assertScreen();
    });
  }
}
