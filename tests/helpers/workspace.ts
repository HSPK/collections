import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function expectWorkspaceViewport(page: Page, width: number, height: number) {
  expect(await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    x: window.scrollX,
    y: window.scrollY,
  }))).toEqual({ width, height, x: 0, y: 0 });
}

export async function visibleControlProblems(root: Locator) {
  return root.evaluate(element => {
    const problems: { label: string; issue: string }[] = [];
    for (const control of element.querySelectorAll('button, input, select, textarea, a[href], summary, [role="button"]')) {
      // SVG handles can be stroke-only or overlap in projection. Their actual
      // hit regions and keyboard selection belong to the scene workflow tests.
      if (!(control instanceof HTMLElement)) continue;
      const style = getComputedStyle(control);
      if (control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]') ||
          !control.checkVisibility({ visibilityProperty: true }) || !control.getClientRects().length) continue;
      const box = control.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      let clipped = false;
      for (let parent = control.parentElement; parent; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if ((/auto|scroll|hidden|clip/.test(parentStyle.overflowX) && (x < bounds.left || x >= bounds.right)) ||
            (/auto|scroll|hidden|clip/.test(parentStyle.overflowY) && (y < bounds.top || y >= bounds.bottom))) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const label = (control.getAttribute('aria-label') || control.textContent || control.id || control.tagName).trim().slice(0, 90);
      const hit = document.elementFromPoint(x, y);
      const labelProxy = hit?.closest('label');
      const nativeLabel = control.matches('input[type="checkbox"], input[type="radio"], input[type="file"]') &&
        labelProxy instanceof HTMLLabelElement && labelProxy.control === control;
      if (!hit || (hit !== control && !control.contains(hit) && !nativeLabel)) {
        problems.push({ label, issue: `covered by ${hit?.tagName ?? 'nothing'}${hit?.id ? `#${hit.id}` : ''}.${hit?.getAttribute('class') ?? ''}` });
      }
      if (control.matches('button, select, textarea, input:not([type="range"]):not([type="color"]):not([type="file"])') &&
          Number.parseFloat(style.fontSize) < 14) {
        problems.push({ label, issue: `control text is ${style.fontSize}` });
      }
    }
    return problems;
  });
}
