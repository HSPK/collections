import { expect, test } from '@playwright/test';

test('Roomtone keeps a floorplan drag with its initiating finger', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/roomtone/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await page.locator('[data-pane="edit"]').click();
  await page.locator('[data-floorplan]').scrollIntoViewIfNeeded();
  const source = (await page.locator('[data-position="source"]').boundingBox())!;
  const listener = (await page.locator('[data-position="listener"]').boundingBox())!;
  const first = { id: 1, x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const second = { id: 2, x: listener.x + listener.width / 2, y: listener.y + listener.height / 2 };
  const sourceX = page.locator('[data-field="source.x"]');
  const listenerX = page.locator('[data-field="listener.x"]');
  const initialSource = Number(await sourceX.inputValue());
  const initialListener = await listenerX.inputValue();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  try {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x + 24 }, second] });
    await expect.poll(async () => Number(await sourceX.inputValue())).toBeGreaterThan(initialSource + 0.25);
    await expect(listenerX).toHaveValue(initialListener);
  } finally {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await touch.detach();
  }
});
