import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep unrelated development reloads from interrupting an active gesture.
  await page.routeWebSocket(url => url.pathname === '/' && url.searchParams.has('token'), socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      if (typeof message !== 'string' || !/"type"\s*:\s*"full-reload"/.test(message)) socket.send(message);
    });
  });
});

test('Roomtone keeps a floorplan drag with its initiating finger', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
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
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([375, 812]);
  } finally {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await touch.detach();
  }
});

test('Roomtone keeps real orbit gestures and text editing separate from pane shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./projects/roomtone/');
  const canvas = page.locator('.roomtone-canvas');
  await expect(canvas).toHaveAttribute('data-camera', /,/);
  const before = await canvas.getAttribute('data-camera');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 42, box.y + box.height / 2 + 16, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-camera', before!);
  const orbited = await canvas.getAttribute('data-camera');
  await page.getByRole('tab', { name: 'Edit room', exact: true }).click();
  const width = page.getByLabel('Width', { exact: true });
  await width.fill('10.2');
  await width.press('Home');
  await width.press('End');
  await expect(width).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Edit room', exact: true })).toHaveAttribute('aria-selected', 'true');
  await width.press('Tab');
  await expect(page.locator('.project-roomtone')).toHaveAttribute('data-volume', String(10.2 * 7.2 * 3.8));
  await expect(canvas).toHaveAttribute('data-camera', orbited!);
  await width.fill('999');
  await width.press('Tab');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await width.press('Escape');
  await expect(width).toHaveValue('10.2');
  await expect(width).not.toHaveAttribute('aria-invalid');
  await page.getByRole('tab', { name: 'Edit room', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Response', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Space', exact: true })).toBeFocused();
  await expect(canvas).toBeInViewport();
  await expect(canvas).toHaveAttribute('data-camera', orbited!);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([375, 812]);
});
