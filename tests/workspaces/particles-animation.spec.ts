import { expect, test } from '@playwright/test';
import { expectWorkspaceViewport } from '../helpers/workspace';

const projects = [
  'star-nursery', 'ink-water', 'firefly-choir', 'sand-script', 'magnetic-loom',
  'epicycle-studio', 'chain-reaction', 'motion-foundry', 'camera-assembly', 'season-clock',
] as const;

for (const project of projects) {
  for (const viewport of [
    { width: 1440, height: 900 }, { width: 1280, height: 720 },
    { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
  ]) {
    test(`${project} ${viewport.width}x${viewport.height}: corner targets remain usable in both motion preferences`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(`./projects/${project}/`);
      const root = page.locator(`.project-${project}`);
      await expect(root).toHaveAttribute('data-workspace', 'true');
      await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
      const menu = page.getByRole('button', { name: 'Collection menu', exact: true });
      const slider = root.locator('input[type="range"]:visible').first();

      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({ reducedMotion });
        await slider.focus();
        await slider.press('Home');
        await expect(slider).toHaveValue(await slider.getAttribute('min') ?? '0');
        await slider.press('ArrowRight');
        await expect(slider).toHaveValue(String(
          Number(await slider.getAttribute('min') ?? 0) + Number(await slider.getAttribute('step') ?? 1),
        ));
        await expectWorkspaceViewport(page, viewport.width, viewport.height);
        expect(await root.evaluate(element => getComputedStyle(element).overflowY)).not.toMatch(/hidden|clip/);
        const corner = (await menu.boundingBox())!;
        const problems = await root.locator('button:visible, input:visible, select:visible').evaluateAll((controls, menuBox) =>
          controls.flatMap(control => {
            if (control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]')) return [];
            const box = control.getBoundingClientRect();
            if (box.width < 4 || box.height < 4) return [];
            const name = control.getAttribute('aria-label') || control.id || control.textContent?.trim() || control.tagName;
            if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) return [`${name}: outside viewport`];
            if (box.left < menuBox.x + menuBox.width && box.right > menuBox.x &&
                box.top < menuBox.y + menuBox.height && box.bottom > menuBox.y) return [`${name}: overlaps collection menu`];
            const inset = Math.min(4, box.width / 4, box.height / 4);
            // Rotated magnet handles have empty corners in their axis-aligned bounds.
            const transformed = getComputedStyle(control).transform !== 'none';
            const xs = transformed ? [box.left + box.width / 2] : [box.left + inset, box.left + box.width / 2, box.right - inset];
            const ys = transformed ? [box.top + box.height / 2] : [box.top + inset, box.top + box.height / 2, box.bottom - inset];
            for (const x of xs) {
              for (const y of ys) {
                const hit = document.elementFromPoint(x, y);
                const label = hit?.closest('label');
                const labelProxy = control.matches('input[type="checkbox"], input[type="radio"]') &&
                  label instanceof HTMLLabelElement && label.control === control;
                if (!control.contains(hit) && !labelProxy) return [`${name}: covered by ${hit?.tagName ?? 'nothing'}`];
              }
            }
            return [];
          }), corner);
        if (problems.length || viewport.width === 320 || (viewport.width === 768 && projects.indexOf(project) < 3)) {
          await page.screenshot({ path: test.info().outputPath(`${project}-${viewport.width}-${reducedMotion}.png`) });
        }
        expect(problems).toEqual([]);
      }
    });
  }
}
