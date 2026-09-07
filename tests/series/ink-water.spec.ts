import { expect, test } from '@playwright/test';
import { InkWater } from '../../src/projects/ink-water/engine';

test('pressure projection reduces divergence and the bounded field transports pigment', () => {
  const fluid = new InkWater(32, 40, 400);
  fluid.inject({ x: 0.43, y: 0.25, vx: 0.3, vy: 0.65, pigment: 0, amount: 2, radius: 0.08 });
  const divergence = fluid.divergenceRms();
  expect(divergence).toBeGreaterThan(0.1);
  fluid.project(80);
  expect(fluid.divergenceRms()).toBeLessThan(divergence * 0.7);
  const before = fluid.centroid(0);
  for (let n = 0; n < 42; n++) fluid.step(0.025);
  const after = fluid.centroid(0);
  expect(after.mass).toBeGreaterThan(0);
  expect(after.y).toBeGreaterThan(before.y + 0.01);
  expect([...fluid.u, ...fluid.v].every((value) => Number.isFinite(value) && Math.abs(value) <= 0.951)).toBe(true);
  expect(fluid.dyes.every((dye) => dye.every((value) => Number.isFinite(value) && value >= 0 && value <= 5.001))).toBe(true);
  expect(fluid.x.subarray(0, fluid.count).every((x) => x >= 0 && x <= 1)).toBe(true);
  expect(fluid.y.subarray(0, fluid.count).every((y) => y >= 0 && y <= 1)).toBe(true);
  const frozen = fluid.dyes[0].slice();
  fluid.step(0);
  expect(fluid.dyes[0]).toEqual(frozen);
  fluid.clear();
  expect(fluid.count).toBe(0);
  expect(fluid.centroid(0).mass).toBe(0);
  expect(fluid.u.every((value) => value === 0)).toBe(true);
  const energy = (viscosity: number) => {
    const water = new InkWater(24, 30, 100);
    water.viscosity = viscosity;
    water.inject({ x: 0.5, y: 0.4, vx: 0.45, vy: 0.3, pigment: 0 });
    water.dyes[0].fill(0);
    for (let n = 0; n < 24; n++) water.step(0.025);
    return water.u.reduce((sum, value, i) => sum + value * value + water.v[i] ** 2, 0);
  };
  expect(energy(0.003)).toBeLessThan(energy(0.00001) * 0.9);
});

test('the water really pauses, accepts pigment, changes viscosity, and prints locally', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./projects/ink-water/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Ink in Water', exact: true })).toBeVisible();
  const canvas = page.locator('[data-water-canvas] canvas');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.waitForTimeout(130);
  const frame = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(frame);
  await page.getByRole('button', { name: 'Clear the water', exact: true }).click();
  await expect(page.locator('[data-water-canvas]')).toHaveAttribute('data-tracers', '0');
  await page.getByRole('button', { name: 'Carbon pigment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Carbon pigment', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pour a ribbon', exact: false }).click();
  await expect(page.locator('[data-water-canvas]')).toHaveAttribute('data-tracers', '1050');
  await page.getByLabel('Viscosity').focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-viscosity-value]')).toHaveText('100');
  await page.getByRole('button', { name: 'Studio notes', exact: false }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep a print', exact: false }).click();
  expect((await download).suggestedFilename()).toBe('ink-in-water.png');
  await page.getByRole('button', { name: 'Restore this study', exact: true }).click();
  await expect(page.locator('[data-water-canvas]')).toHaveAttribute('data-tracers', '7200');
  await page.getByRole('button', { name: 'Close Studio notes and prints', exact: true }).click();
  expect(errors).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 },
  { width: 768, height: 480 },
]) {
  test(`one-screen vessel, real pigment and local print at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./projects/ink-water/');
    const root = page.locator('.project-ink-water');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    await expect(root).toHaveAttribute('data-motion', 'paused');
    const fits = () => page.evaluate(() => ({
      width: document.documentElement.scrollWidth <= innerWidth,
      height: document.documentElement.scrollHeight <= innerHeight,
      controls: [...document.querySelectorAll<HTMLElement>('.iw-workbench button, .iw-workbench input')].every(element => {
        const bounds = element.getBoundingClientRect();
        const uncovered = document.querySelector('dialog[open]') || [4, bounds.width / 2, bounds.width - 4].every(x =>
          [4, bounds.height / 2, bounds.height - 4].every(y =>
            element.contains(document.elementFromPoint(bounds.left + x, bounds.top + y))));
        return !!uncovered && bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth;
      }),
    }));
    await expect.poll(fits).toEqual({ width: true, height: true, controls: true });
    const host = page.locator('[data-water-canvas]');
    const canvas = host.locator('canvas');
    await page.getByRole('button', { name: 'Clear the water', exact: true }).click();
    await expect(host).toHaveAttribute('data-tracers', '0');
    const clear = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
    await page.getByRole('button', { name: 'Carbon pigment', exact: true }).click();
    await page.getByRole('button', { name: 'Pour a ribbon', exact: false }).click();
    await expect(host).toHaveAttribute('data-tracers', '1050');
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(clear);
    await page.getByLabel('Viscosity').press('End');
    await expect(page.locator('[data-viscosity-value]')).toHaveText('100');
    const bounds = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: bounds.width * .7, y: bounds.height * .5 } });
    await expect(host).toHaveAttribute('data-tracers', '1160');
    await page.getByRole('button', { name: 'Studio notes', exact: false }).click();
    const dialog = page.getByRole('dialog', { name: 'Studio notes and prints', exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close Studio notes and prints' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Keep a print', exact: false }).click();
    const print = await download;
    expect(print.suggestedFilename()).toBe('ink-in-water.png');
    expect(await print.failure()).toBeNull();
    await page.getByRole('button', { name: 'Restore this study', exact: true }).click();
    await expect(host).toHaveAttribute('data-tracers', '7200');
    await expect(page.getByLabel('Viscosity')).toHaveValue('100');
    const explanation = page.getByText('Water, interpreted.', { exact: true });
    await explanation.scrollIntoViewIfNeeded();
    await expect(explanation).toBeInViewport();
    await expect.poll(fits).toEqual({ width: true, height: true, controls: true });
    if (viewport.width === 375) await page.screenshot({ path: test.info().outputPath('ink-water-studio-notes.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Studio notes', exact: false })).toBeFocused();
    await expect.poll(fits).toEqual({ width: true, height: true, controls: true });
    await page.screenshot({ path: test.info().outputPath(`ink-water-${viewport.width}x${viewport.height}.png`) });
  });
}

test('a 375px reduced-motion vessel stays still and has a keyboard pipette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/ink-water/');
  await expect(page.locator('.project-ink-water')).toHaveAttribute('data-motion', 'paused');
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  const host = page.locator('[data-water-canvas]');
  const bounds = (await host.boundingBox())!;
  expect(bounds.y).toBeLessThan(220);
  expect(bounds.height).toBeGreaterThan(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Clear the water', exact: true }).click();
  await host.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-tracers', '1050');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
});
