import { expect, test } from '@playwright/test';
import { BED, DEFAULT_MAGNETS } from '../../src/projects/magnetic-loom/data';
import { LoomEngine, MAX_HOME_DRIFT, MAX_SPEED } from '../../src/projects/magnetic-loom/engine';
import { MAX_FIELD, MAX_GRADIENT, polesFor, sampleField } from '../../src/projects/magnetic-loom/field';
import type { Magnet } from '../../src/projects/magnetic-loom/field';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';

test('Magnetic Loom: softened field is symmetric, polarity-sensitive, and filings stay bounded', () => {
  const magnet: Magnet = { id: 'A', x: 500, y: 380, angle: 0, polarity: 1 };
  const poles = polesFor([magnet]);
  for (const pole of poles) {
    const sample = sampleField(pole.x, pole.y, poles);
    expect(Object.values(sample).every(Number.isFinite)).toBe(true);
    expect(sample.strength).toBeLessThanOrEqual(MAX_FIELD);
    expect(Math.hypot(sample.gradientX, sample.gradientY)).toBeLessThanOrEqual(MAX_GRADIENT + 1e-10);
  }
  const top = sampleField(620, 290, poles);
  const bottom = sampleField(620, 470, poles);
  expect(top.x).toBeCloseTo(bottom.x, 10);
  expect(top.y).toBeCloseTo(-bottom.y, 10);
  expect(sampleField(500, 380, poles).x).toBeLessThan(0);
  const reversed = sampleField(620, 290, polesFor([{ ...magnet, polarity: -1 }]));
  expect(reversed.x).toBeCloseTo(-top.x, 10);
  expect(reversed.y).toBeCloseTo(-top.y, 10);
  expect(reversed.gradientX).toBeCloseTo(top.gradientX, 10);

  const before = sampleField(520, 280, polesFor(DEFAULT_MAGNETS));
  const after = sampleField(520, 280, polesFor(DEFAULT_MAGNETS.map((item, index) => ({
    ...item,
    polarity: index === 0 ? -1 : item.polarity,
  }))));
  const cross = before.x * after.y - before.y * after.x;
  expect(Math.abs(cross) / (before.strength * after.strength)).toBeGreaterThan(0.2);

  const engine = new LoomEngine({ count: 300, seed: 45 });
  const replica = new LoomEngine({ count: 300, seed: 45 });
  expect(engine.filings).toEqual(replica.filings);
  const originalPositions = engine.filings.map(({ x, y }) => ({ x, y }));
  engine.setMagnet(0, { polarity: -1 }, true);
  expect(engine.filings.some((filing, index) => Math.abs(Math.sin(
    2 * (filing.angle - replica.filings[index].angle),
  )) > 0.2)).toBe(true);
  expect(engine.filings.map(({ x, y }) => ({ x, y }))).toEqual(originalPositions);
  expect(engine.time).toBe(0);
  engine.step(1 / 30);
  expect(engine.filings.some((filing, index) => Math.hypot(
    filing.x - originalPositions[index].x,
    filing.y - originalPositions[index].y,
  ) > 0.01)).toBe(true);
  engine.setMagnet(0, { x: -100_000, y: 100_000, angle: 80 });
  engine.setMagnet(1, { x: engine.magnets[0].x, y: engine.magnets[0].y, angle: engine.magnets[0].angle });
  engine.shake();
  for (let step = 0; step < 120; step += 1) engine.step(step % 20 === 0 ? 10 : 1 / 60);
  for (const filing of engine.filings) {
    expect([filing.x, filing.y, filing.vx, filing.vy, filing.angle].every(Number.isFinite)).toBe(true);
    expect(filing.x).toBeGreaterThanOrEqual(BED.inset);
    expect(filing.x).toBeLessThanOrEqual(BED.width - BED.inset);
    expect(filing.y).toBeGreaterThanOrEqual(BED.inset);
    expect(filing.y).toBeLessThanOrEqual(BED.height - BED.inset);
    expect(Math.hypot(filing.vx, filing.vy)).toBeLessThanOrEqual(MAX_SPEED + 1e-8);
    expect(Math.hypot(filing.x - filing.homeX, filing.y - filing.homeY)).toBeLessThanOrEqual(MAX_HOME_DRIFT + 1e-8);
  }
  const snapshot = JSON.stringify(engine.filings);
  const clock = engine.time;
  engine.step(0);
  engine.step(-1);
  engine.step(Number.NaN);
  expect(JSON.stringify(engine.filings)).toBe(snapshot);
  expect(engine.time).toBe(clock);
  engine.reset();
  expect(engine.filings).toEqual(replica.filings);
  expect(engine.time).toBe(0);
});

test('Magnetic Loom: drag, keyboard, rotation and flip change the field; pause truly freezes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./projects/magnetic-loom/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Magnetic Loom', exact: true })).toBeVisible();
  const root = page.locator('.project-magnetic-loom');
  const canvas = root.locator('canvas');
  const bitmap = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.waitForTimeout(80);
  const initial = await bitmap();
  const handle = page.locator('[data-magnet-handle="0"]');
  const coordinates = page.locator('[data-position]');
  const oldPosition = await coordinates.textContent();
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 - 28, { steps: 4 });
  await page.mouse.up();
  await expect(coordinates).not.toHaveText(oldPosition!);
  await expect.poll(bitmap).not.toBe(initial);
  await page.getByRole('button', { name: 'Select magnet B', exact: true }).click();
  const bPosition = await coordinates.textContent();
  await page.keyboard.press('ArrowRight');
  await expect(coordinates).not.toHaveText(bPosition!);
  const angle = page.getByRole('slider', { name: 'Magnet angle', exact: true });
  const previousAngle = await angle.inputValue();
  const beforeTurn = await bitmap();
  await angle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(angle).not.toHaveValue(previousAngle);
  await expect.poll(bitmap).not.toBe(beforeTurn);
  await page.getByRole('button', { name: 'Rotate right 15 degrees', exact: true }).click();
  const beforeFlip = await bitmap();
  await page.getByRole('button', { name: /Flip pole/ }).click();
  await expect(page.locator('[data-magnet-handle="1"]')).toHaveAttribute('data-polarity', '-1');
  await expect.poll(bitmap).not.toBe(beforeFlip);

  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await page.getByRole('button', { name: /Shake bed/ }).click();
  const moving = await bitmap();
  await expect.poll(bitmap).not.toBe(moving);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.waitForTimeout(100);
  const frozen = await bitmap();
  await page.waitForTimeout(220);
  expect(await bitmap()).toBe(frozen);
  await canvas.focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.getByRole('button', { name: 'Field notes and settings', exact: true }).click();
  await page.getByRole('button', { name: /Reset arrangement/ }).click();
  await page.getByRole('button', { name: 'Close Field notes and settings', exact: true }).click();
  await expect(angle).toHaveValue('-28');
  await expect(handle).toHaveAttribute('data-polarity', '1');
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collection menu', exact: true }).click();
  await page.getByRole('link', { name: 'Back to index', exact: true }).click();
  await expect(root).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Magnetic Loom: 375px reduced-motion entry is settled, usable and responsive to preference changes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/magnetic-loom/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const root = page.locator('.project-magnetic-loom');
  const canvas = root.locator('canvas');
  const bitmap = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(300);
  await page.waitForTimeout(80);
  const still = await bitmap();
  await page.waitForTimeout(180);
  expect(await bitmap()).toBe(still);
  await page.getByRole('button', { name: 'Select magnet A', exact: true }).click();
  const coordinates = page.locator('[data-position]');
  const previous = await coordinates.textContent();
  await page.getByRole('button', { name: 'Move magnet down', exact: true }).click();
  await expect(coordinates).not.toHaveText(previous!);
  await expect.poll(bitmap).not.toBe(still);
  await page.getByRole('button', { name: /Shake bed/ }).click();
  await page.getByRole('button', { name: 'Field notes and settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The bed is shaken' })).toContainText('Press Play');
  await page.getByRole('button', { name: 'Close Field notes and settings', exact: true }).click();
  await page.waitForTimeout(80);
  const scattered = await bitmap();
  await page.waitForTimeout(180);
  expect(await bitmap()).toBe(scattered);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(bitmap).not.toBe(scattered);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const sizes = await root.locator('button:visible, label:visible').evaluateAll((elements) => elements.map((element) => ({
    font: Number.parseFloat(getComputedStyle(element).fontSize),
    height: element.getBoundingClientRect().height,
    isButton: element.tagName === 'BUTTON',
  })));
  expect(sizes.every((item) => item.font >= 14)).toBe(true);
  expect(sizes.filter((item) => item.isButton).every((item) => item.height >= 44)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
  test(`magnetic workspace ${width}x${height}: live field edits and secondary notes fit the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/magnetic-loom/');
    const root = page.locator('.project-magnetic-loom');
    const canvas = root.locator('canvas');
    const bitmap = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await expect(root).toHaveAttribute('data-workspace', 'true');
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expectWorkspaceViewport(page, width, height);
    expect(await visibleControlProblems(root)).toEqual([]);
    const menu = (await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox())!;
    expect(await root.locator('button:visible, input:visible').evaluateAll((controls, corner) =>
      controls.filter(control => {
        const box = control.getBoundingClientRect();
        return box.left < corner.x + corner.width && box.right > corner.x &&
          box.top < corner.y + corner.height && box.bottom > corner.y;
      }).map(control => control.getAttribute('aria-label') || control.id || control.textContent), menu)).toEqual([]);
    for (const selector of ['[data-select-magnet="1"]', '#ml-angle', '[data-move="0,10"]', '[data-flip]', '[data-play]', '[data-shake]']) {
      await expect(root.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: test.info().outputPath(`magnetic-${width}x${height}.png`) });
    const initial = await bitmap();
    const position = root.locator('[data-position]');
    const oldPosition = await position.textContent();
    await page.getByRole('button', { name: 'Move magnet right', exact: true }).click();
    await expect(position).not.toHaveText(oldPosition!);
    await expect.poll(bitmap).not.toBe(initial);
    const angle = page.getByRole('slider', { name: 'Magnet angle', exact: true });
    const beforeTurn = await bitmap();
    await angle.focus();
    await angle.press('Home');
    await expect(angle).toHaveValue('-180');
    await expect.poll(bitmap).not.toBe(beforeTurn);
    await page.getByRole('button', { name: 'Flip pole', exact: true }).click();
    await expect(root.locator('[data-magnet-handle="0"]')).toHaveAttribute('data-polarity', '-1');
    const trigger = page.getByRole('button', { name: 'Field notes and settings', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Field notes and settings', exact: true });
    await expect(dialog).toBeVisible();
    const traces = await bitmap();
    await page.getByLabel('Show field traces', { exact: true }).uncheck();
    await expect.poll(bitmap).not.toBe(traces);
    await page.getByRole('button', { name: 'Reset arrangement', exact: true }).click();
    await expect(angle).toHaveValue('-28');
    await expect(root.locator('[data-magnet-handle="0"]')).toHaveAttribute('data-polarity', '1');
    await root.locator('.ml-colophon').scrollIntoViewIfNeeded();
    await expectWorkspaceViewport(page, width, height);
    if (width === 320) await page.screenshot({ path: test.info().outputPath('magnetic-notes-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    const magnet = root.locator('[data-magnet-handle="0"]');
    const bounds = (await magnet.boundingBox())!;
    const beforeDrag = await position.textContent();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 20, bounds.y + bounds.height / 2 - 12, { steps: 4 });
    await page.mouse.up();
    await expect(position).not.toHaveText(beforeDrag!);
    await page.getByRole('button', { name: 'Play animation', exact: true }).click();
    await page.getByRole('button', { name: 'Shake bed', exact: true }).click();
    const shaken = await bitmap();
    await expect.poll(bitmap).not.toBe(shaken);
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expectWorkspaceViewport(page, width, height);
    expect(await visibleControlProblems(root)).toEqual([]);
    const coordinates = await position.textContent();
    const next = width === 375 ? { width: 1280, height: 720 } : { width: 375, height: 812 };
    await page.setViewportSize(next);
    await expect.poll(() => canvas.evaluate(node => {
      const element = node as HTMLCanvasElement;
      const rect = element.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
      return Math.max(Math.abs(element.width - rect.width * dpr), Math.abs(element.height - rect.height * dpr));
    })).toBeLessThanOrEqual(1);
    await expect(position).toHaveText(coordinates!);
    await expectWorkspaceViewport(page, next.width, next.height);
  });
}
