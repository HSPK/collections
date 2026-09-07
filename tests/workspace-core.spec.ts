import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { visibleControlProblems } from './helpers/workspace';

async function fixture(page: Page, preserveLayout = false, withStatus = false) {
  await page.goto('./');
  await page.evaluate(async ({ preserve, withStatus }) => {
    const path = '/src/core/workspace.ts';
    const { createWorkspaceTabs, createWorkspaceDialog, mirrorWorkspaceStatus }: typeof import('../src/core/workspace') = await import(path);
    const root = document.createElement('section');
    root.className = 'project-app workspace-fixture';
    root.style.cssText = 'position:fixed;inset:20px;z-index:100;background:white;color:black;padding:20px';
    root.innerHTML = `
      <div data-fixture-tabs></div>
      <div style="display:grid;height:180px;margin:20px 0">
        <section data-first style="grid-area:1/1"><label>First draft<input value="A" aria-label="First draft"></label></section>
        <section data-second style="grid-area:1/1"><label>Second draft<input value="B" aria-label="Second draft"></label></section>
      </div>
      <button data-notes>Open notebook</button>
      <section data-note-content><label>Notebook text<input aria-label="Notebook text" value="Original note"></label></section>`;
    document.body.append(root);
    const controller = new AbortController();
    const cleanups: (() => void)[] = [];
    const lifecycle = { root, signal: controller.signal, onCleanup: (cleanup: () => void) => cleanups.push(cleanup) };
    const get = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing fixture element ${selector}`);
      return element;
    };
    const tabs = createWorkspaceTabs(lifecycle, {
      id: 'workspace-fixture', label: 'Draft panes', host: get('[data-fixture-tabs]'),
      panes: [{ id: 'first', label: 'First', panel: get('[data-first]') }, { id: 'second', label: 'Second', panel: get('[data-second]') }],
      preserveLayout: preserve,
      onSelect: id => { root.dataset.selected = id; },
    });
    root.dataset.selected = tabs.selected;
    createWorkspaceDialog(lifecycle, {
      id: 'workspace-notebook', title: 'Notebook', content: [get('[data-note-content]')], triggers: [get('[data-notes]')],
    });
    if (withStatus) {
      const source = document.createElement('p');
      source.dataset.testStatusSource = '';
      source.setAttribute('role', 'status');
      source.setAttribute('aria-live', 'polite');
      get('[data-second]').append(source);
      mirrorWorkspaceStatus(lifecycle, source);
      const publish = document.createElement('button');
      publish.textContent = 'Publish notebook status';
      publish.addEventListener('click', () => { source.textContent = 'Notebook action complete'; }, { signal: controller.signal });
      get('[data-note-content]').append(publish);
    }
    root.addEventListener('select-first', () => tabs.select('first'));
    root.addEventListener('dispose-fixture', () => {
      controller.abort();
      for (const cleanup of cleanups.reverse()) cleanup();
      root.remove();
    });
  }, { preserve: preserveLayout, withStatus });
}

test('workspace tabs retain drafts, implement keyboard navigation, and do not leave focus in hidden panels', async ({ page }) => {
  await fixture(page);
  const first = page.getByRole('tab', { name: 'First', exact: true });
  const second = page.getByRole('tab', { name: 'Second', exact: true });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'First draft', exact: true }).fill('Keep this work');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'First draft', exact: true })).toHaveCount(0);
  const input = page.getByRole('textbox', { name: 'Second draft', exact: true });
  await input.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(input).toBeFocused();
  await page.locator('.workspace-fixture').dispatchEvent('select-first');
  await expect(first).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'First draft', exact: true })).toHaveValue('Keep this work');
  await page.keyboard.press('End');
  await expect(second).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
});

test('workspace dialogs retain moved controls, trap focus, return it on Escape, and close on disposal', async ({ page }) => {
  await fixture(page);
  const trigger = page.getByRole('button', { name: 'Open notebook', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Notebook', exact: true });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Notebook text', exact: true }).fill('A retained notebook');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByRole('textbox', { name: 'Notebook text', exact: true })).toHaveValue('A retained notebook');
  await dialog.getByRole('button', { name: 'Close Notebook', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('textbox', { name: 'Notebook text', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close Notebook', exact: true })).toBeFocused();
  await page.locator('.workspace-fixture').dispatchEvent('dispose-fixture');
  await expect(page.locator('#workspace-notebook, .workspace-fixture')).toHaveCount(0);
});

test('layout-preserving panes keep renderer dimensions but remain inert and inaccessible while inactive', async ({ page }) => {
  await fixture(page, true);
  const first = page.locator('[data-first]');
  const size = await first.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await expect(first).not.toBeVisible();
  expect(await first.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(size);
  expect(size.width).toBeGreaterThan(100);
  expect(size.height).toBeGreaterThan(100);
  expect(await first.evaluate((element: HTMLElement) => element.inert)).toBe(true);
  await first.locator('input').evaluate(element => element.focus());
  await expect(page.getByRole('tab', { name: 'Second', exact: true })).toBeFocused();
});

test('wrapping focus reveals the last field in a long notebook without scrolling the page', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Open notebook', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Notebook', exact: true });
  await dialog.locator('.workspace-dialog-content').evaluate(content => {
    const spacer = document.createElement('div');
    spacer.style.height = '1400px';
    spacer.textContent = 'Long notebook content';
    content.prepend(spacer);
  });
  await dialog.getByRole('button', { name: 'Close Notebook', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  const input = dialog.getByRole('textbox', { name: 'Notebook text', exact: true });
  await expect(input).toBeFocused();
  const bounds = (await input.boundingBox())!, modal = (await dialog.boundingBox())!;
  expect(bounds.y).toBeGreaterThan(modal.y);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(modal.y + modal.height);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('the standard-control audit detects HTML occlusion without treating unpainted SVG centers as buttons', async ({ page }) => {
  await fixture(page);
  const root = page.locator('.workspace-fixture');
  await page.locator('[data-first]').evaluate(panel => {
    panel.innerHTML = `
      <svg width="180" height="90" aria-label="Scene fixture">
        <g role="button" tabindex="0" aria-label="Outlined optic"><circle cx="80" cy="45" r="30" fill="none" stroke="black" stroke-width="2"/></g>
      </svg>
      <div style="position:relative;width:200px;height:48px">
        <button style="width:100%;height:100%">Covered action</button>
        <div class="workspace-test-blocker" style="position:absolute;inset:0;background:white">An obstructing overlay</div>
      </div>`;
  });
  expect(await visibleControlProblems(root)).toEqual([{ label: 'Covered action', issue: 'covered by DIV.workspace-test-blocker' }]);
  await page.locator('.workspace-test-blocker').evaluate(element => element.remove());
  expect(await visibleControlProblems(root)).toEqual([]);
  await page.getByRole('button', { name: 'Outlined optic', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Outlined optic', exact: true })).toBeFocused();
});

test('the control audit ignores native-closed disclosures but checks the actual opened controls', async ({ page }) => {
  await fixture(page);
  const root = page.locator('.workspace-fixture');
  await page.locator('[data-first]').evaluate(panel => {
    panel.innerHTML = `
      <details open>
        <summary>Descriptor options</summary>
        <div style="position:relative;width:220px;height:48px">
          <label><select aria-label="Color descriptor" style="width:220px;height:48px"><option value="any">Any color</option><option value="red">Red</option></select></label>
          <div class="workspace-disclosure-blocker" style="position:absolute;inset:0;background:white">An obstructing overlay</div>
        </div>
      </details>`;
  });
  const summary = page.locator('[data-first] summary');
  const select = page.getByRole('combobox', { name: 'Color descriptor', exact: true });
  expect(await visibleControlProblems(root)).toEqual([{ label: 'Color descriptor', issue: 'covered by DIV.workspace-disclosure-blocker' }]);
  await summary.click();
  await expect(select).not.toBeVisible();
  expect(await visibleControlProblems(root)).toEqual([]);
  await summary.click();
  await expect(select).toBeVisible();
  expect(await visibleControlProblems(root)).toEqual([{ label: 'Color descriptor', issue: 'covered by DIV.workspace-disclosure-blocker' }]);
  await page.locator('.workspace-disclosure-blocker').evaluate(element => element.remove());
  expect(await visibleControlProblems(root)).toEqual([]);
  await select.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('red');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('workspace announcements escape inactive panes, follow modal context, and stop on disposal', async ({ page }) => {
  await fixture(page, false, true);
  const root = page.locator('.workspace-fixture');
  const source = root.locator('[data-test-status-source]');
  await source.evaluate(element => { element.textContent = 'Hidden-pane action complete'; });
  await expect(root.getByRole('status')).toHaveText('Hidden-pane action complete');
  await expect(root.getByRole('status')).toHaveCount(1);
  await expect(source).not.toBeVisible();
  await expect(source).not.toHaveAttribute('role', 'status');
  await source.evaluate((element: HTMLElement) => { element.hidden = true; });
  await expect(root.getByRole('status')).toHaveText('');
  await source.evaluate((element: HTMLElement) => { element.hidden = false; });
  await expect(root.getByRole('status')).toHaveText('Hidden-pane action complete');
  await root.getByRole('button', { name: 'Open notebook', exact: true }).click();
  const dialog = root.getByRole('dialog', { name: 'Notebook', exact: true });
  await dialog.getByRole('button', { name: 'Publish notebook status', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Notebook action complete');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(root.getByRole('status')).toHaveText('Notebook action complete');
  const after = await root.evaluate(async element => {
    const source = element.querySelector<HTMLElement>('[data-test-status-source]')!;
    const live = element.querySelector<HTMLElement>('[data-workspace-announcement]')!;
    element.dispatchEvent(new Event('dispose-fixture'));
    source.textContent = 'A late update after disposal';
    await Promise.resolve();
    return { text: live.textContent, detached: live.parentElement === null };
  });
  expect(after).toEqual({ text: 'Notebook action complete', detached: true });
  await expect(page.locator('.workspace-fixture')).toHaveCount(0);
});
