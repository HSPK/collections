import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { presets } from '../../src/projects/epicycle-studio/data';
import {
  MAX_INPUT_POINTS, MAX_SAMPLES, SAMPLE_COUNT, chainAt, discreteFourier,
  fitPath, makeDrawing, reconstruct, reconstructionPath, relativeError, resampleClosedPath, selectHarmonics,
} from '../../src/projects/epicycle-studio/engine';
import { CYCLE_SECONDS, OPENING_PHASE, advancePhase, seekPhase } from '../../src/projects/epicycle-studio/timeline';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';

test('Fourier engine preserves DC, signed frequencies, Nyquist, and complex phase', () => {
  const samples = Array.from({ length: 16 }, (_, index) => {
    const angle = index / 16 * Math.PI * 2;
    return {
      x: 2 + 3 * Math.cos(2 * angle + 0.4) + 0.7 * Math.cos(-3 * angle - 0.2),
      y: -1 + 3 * Math.sin(2 * angle + 0.4) + 0.7 * Math.sin(-3 * angle - 0.2),
    };
  });
  const terms = discreteFourier(samples);
  expect(terms[0]).toMatchObject({ frequency: 0 });
  expect(terms[0].re).toBeCloseTo(2, 12);
  expect(terms[0].im).toBeCloseTo(-1, 12);
  const positive = terms.find((term) => term.frequency === 2)!;
  const negative = terms.find((term) => term.frequency === -3)!;
  expect(positive.re).toBeCloseTo(3 * Math.cos(0.4), 12);
  expect(positive.im).toBeCloseTo(3 * Math.sin(0.4), 12);
  expect(negative.re).toBeCloseTo(0.7 * Math.cos(-0.2), 12);
  expect(negative.im).toBeCloseTo(0.7 * Math.sin(-0.2), 12);
  for (const term of terms.filter((item) => ![0, 2, -3].includes(item.frequency))) {
    expect(term.amplitude).toBeLessThan(1e-12);
  }
  for (let index = 0; index < samples.length; index++) {
    const point = reconstruct(terms, index / samples.length);
    expect(point.x).toBeCloseTo(samples[index].x, 11);
    expect(point.y).toBeCloseTo(samples[index].y, 11);
  }
  expect(reconstruct(terms, 1)).toEqual(reconstruct(terms, 0));
  expect(reconstruct(terms, -0.25)).toEqual(reconstruct(terms, 0.75));
  const nyquist = discreteFourier(Array.from({ length: 8 }, (_, index) => ({ x: (-1) ** index, y: 0 })));
  expect(nyquist.find((term) => term.frequency === -4)!.amplitude).toBeCloseTo(1, 12);
  expect(nyquist.some((term) => term.frequency === 4)).toBe(false);
  const constant = discreteFourier(Array.from({ length: 7 }, () => ({ x: -3, y: 4 })));
  expect(constant[0]).toEqual({ frequency: 0, re: -3, im: 4, amplitude: 5 });
  expect(constant.slice(1).every((term) => term.amplitude < 1e-12)).toBe(true);
});

test('closed resampling is uniform and every original preset reconstructs its samples', () => {
  const square = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 0 }];
  expect(resampleClosedPath(square, 8)).toEqual([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 },
    { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 },
  ]);
  expect(fitPath(square)[0]).toEqual({ x: -0.9, y: -0.9 });
  for (const preset of presets) {
    const original = JSON.stringify(preset.points);
    const drawing = makeDrawing(preset.points);
    expect(drawing.samples).toHaveLength(SAMPLE_COUNT);
    expect(drawing.harmonics).toHaveLength(SAMPLE_COUNT - 1);
    const all = selectHarmonics(drawing, SAMPLE_COUNT - 1);
    for (let index = 0; index < SAMPLE_COUNT; index++) {
      const point = reconstruct(all, index / SAMPLE_COUNT);
      expect(point.x).toBeCloseTo(drawing.samples[index].x, 10);
      expect(point.y).toBeCloseTo(drawing.samples[index].y, 10);
    }
    const partial = selectHarmonics(drawing, 18);
    expect(chainAt(partial, 0.37).at(-1)!.end).toEqual(reconstruct(partial, 0.37));
    expect(chainAt(selectHarmonics(drawing, 0), 0.4)).toEqual([]);
    expect(relativeError(drawing, 0)).toBeCloseTo(100, 10);
    expect(relativeError(drawing, 18)).toBeLessThan(relativeError(drawing, 4));
    expect(relativeError(drawing, SAMPLE_COUNT - 1)).toBe(0);
    const sourceEnergy = drawing.samples.reduce((sum, point) =>
      sum + (point.x - drawing.dc.re) ** 2 + (point.y - drawing.dc.im) ** 2, 0);
    const squaredError = drawing.samples.reduce((sum, point, index) => {
      const result = reconstruct(partial, index / SAMPLE_COUNT);
      return sum + (point.x - result.x) ** 2 + (point.y - result.y) ** 2;
    }, 0);
    expect(relativeError(drawing, 18)).toBeCloseTo(Math.sqrt(squaredError / sourceEnergy) * 100, 9);
    const path = reconstructionPath(partial);
    expect(path).toHaveLength(513);
    expect(path[0]).toEqual(path.at(-1));
    expect(JSON.stringify(preset.points)).toBe(original);
  }
  expect(() => resampleClosedPath([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toThrow(RangeError);
  expect(() => resampleClosedPath(square, MAX_SAMPLES + 1)).toThrow(RangeError);
  expect(() => makeDrawing([{ x: Infinity, y: 0 }])).toThrow(RangeError);
  expect(() => makeDrawing(Array(MAX_INPUT_POINTS + 1).fill({ x: 0, y: 0 }))).toThrow(RangeError);
  expect(() => discreteFourier(Array(MAX_SAMPLES + 1).fill({ x: 0, y: 0 }))).toThrow(RangeError);
  expect(() => selectHarmonics(makeDrawing(square), -1)).toThrow(RangeError);
});

test('Fourier timeline preserves a paused endpoint and wraps a playing cycle', () => {
  expect(seekPhase(-1)).toBe(0);
  expect(seekPhase(2)).toBe(1);
  expect(advancePhase(1, 0, 1)).toBe(1);
  expect(advancePhase(0.9, CYCLE_SECONDS * 0.2, 1)).toBeCloseTo(0.1, 12);
  expect(advancePhase(0.2, CYCLE_SECONDS * 0.1, 2)).toBeCloseTo(0.4, 12);
  expect(() => seekPhase(Infinity)).toThrow(RangeError);
  expect(() => advancePhase(0, -1, 1)).toThrow(RangeError);
  expect(() => advancePhase(0, 1, 0)).toThrow(RangeError);
});

async function openStudio(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/epicycle-studio/');
  await expect(page.locator('.project-epicycle-studio canvas')).toBeVisible();
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  return page.locator('.project-epicycle-studio');
}

async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, amount) => {
    const input = element as HTMLInputElement;
    input.value = String(amount);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('studio controls change the actual series and reverse seeking reproduces the exact trace', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  const root = await openStudio(page);
  const canvas = root.locator('canvas');
  const slider = page.getByRole('slider', { name: 'Cycle position', exact: true });
  await expect(root).toHaveAttribute('data-phase', OPENING_PHASE.toFixed(6));
  await expect(root).toHaveAttribute('data-motion', 'paused');
  expect((await canvas.boundingBox())!.y).toBeLessThan(250);
  await page.getByRole('button', { name: 'Use 4 harmonics', exact: true }).click();
  await expect(root).toHaveAttribute('data-harmonics', '4');
  const fourError = Number(await root.locator('[data-error]').textContent());
  expect(fourError).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Use all 127 harmonics', exact: true }).click();
  await expect(root.locator('[data-error]')).toHaveText('0.00');
  await setRange(page, 'Rotating harmonics', 0);
  await expect(root).toHaveAttribute('data-harmonics', '0');
  await expect(root.locator('[data-error]')).toHaveText('100.00');
  await page.getByRole('button', { name: 'Use 18 harmonics', exact: true }).click();
  await page.getByRole('button', { name: 'Signal and notes', exact: true }).click();
  await page.getByLabel('Choose a closed path').selectOption('paper-kite');
  await expect(root).toHaveAttribute('data-source', 'paper-kite');
  await expect(root.locator('[data-source-note]')).toContainText('sharp corners');
  await page.getByText('The six largest turns', { exact: true }).click();
  await expect(root.locator('[data-spectrum] li')).toHaveCount(6);
  await expect(root.locator('[data-spectrum]')).toContainText('-');
  await page.getByRole('button', { name: 'Close Signal and notes', exact: true }).click();
  await setRange(page, 'Cycle position', 0.372);
  const pose = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await setRange(page, 'Cycle position', 1);
  await expect(root).toHaveAttribute('data-phase', '1.000000');
  await setRange(page, 'Cycle position', 0);
  await setRange(page, 'Cycle position', 0.372);
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()) === pose,
    'Reverse scrubbing must restore the identical canvas pixels.').toBe(true);
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(root).toHaveAttribute('data-phase', '0.373000');
  await slider.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('button', { name: 'Signal and notes', exact: true }).click();
  await page.getByLabel('Show circles', { exact: true }).uncheck();
  const noCircles = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  expect(noCircles === pose).toBe(false);
  await page.getByLabel('Show circles', { exact: true }).check();
  await page.getByRole('button', { name: 'Close Signal and notes', exact: true }).click();
  await page.getByLabel('Speed', { exact: true }).selectOption('2');
  await expect(root).toHaveAttribute('data-speed', '2');
  await page.getByRole('button', { name: 'Play drawing', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-phase'))).toBeGreaterThan(0.38);
  await page.getByRole('button', { name: 'Pause drawing', exact: true }).click();
  const clock = await root.getAttribute('data-phase');
  await page.waitForTimeout(100);
  expect(await root.getAttribute('data-phase')).toBe(clock);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(root).toHaveAttribute('data-phase', '0.000000');
  await canvas.focus();
  await canvas.press('End');
  await expect(root).toHaveAttribute('data-phase', '1.000000');
  await page.getByRole('button', { name: 'Signal and notes', exact: true }).click();
  await page.getByLabel('Choose a closed path').selectOption('orbit-flower');
  await page.getByText('The six largest turns', { exact: true }).click();
  await page.getByRole('button', { name: 'Close Signal and notes', exact: true }).click();
  await setRange(page, 'Cycle position', OPENING_PHASE);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('epicycle-desktop.png') });
  expect(errors).toEqual([]);
});

test('a pointer or keyboard sketch is resampled, retained when switching presets, and clearable', async ({ page }) => {
  const root = await openStudio(page);
  const canvas = root.locator('canvas');
  await root.getByRole('button', { name: '+ Draw a path', exact: true }).click();
  await expect(root).toHaveAttribute('data-input-mode', 'draw');
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x - 90, y + 50);
  await page.mouse.down();
  await page.mouse.move(x - 45, y - 85, { steps: 12 });
  await page.mouse.move(x + 95, y - 25, { steps: 12 });
  await page.mouse.move(x + 30, y + 70, { steps: 12 });
  await page.mouse.move(x - 90, y + 50, { steps: 12 });
  await page.mouse.up();
  await root.getByRole('button', { name: 'Trace sketch', exact: true }).click();
  await expect(root).toHaveAttribute('data-source', 'custom');
  await expect(root).toHaveAttribute('data-phase', '1.000000');
  await expect.poll(() => canvas.evaluate(element => {
    const node = element as HTMLCanvasElement;
    return Math.abs(node.width / Math.min(devicePixelRatio, 2) - node.getBoundingClientRect().width);
  })).toBeLessThan(1);
  const custom = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: 'Signal and notes', exact: true }).click();
  await page.getByLabel('Choose a closed path').selectOption('tidal-loop');
  await expect(root).toHaveAttribute('data-source', 'tidal-loop');
  await page.getByLabel('Choose a closed path').selectOption('custom');
  await expect(root).toHaveAttribute('data-source', 'custom');
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()) === custom,
    'The stored sketch must render identically after switching presets.').toBe(true);
  await page.getByRole('button', { name: 'Close Signal and notes', exact: true }).click();
  await root.getByRole('button', { name: '+ Draw a path', exact: true }).click();
  await canvas.press('Space');
  await canvas.press('Shift+ArrowUp');
  await canvas.press('Space');
  await canvas.press('Shift+ArrowRight');
  await canvas.press('Space');
  await expect(root.locator('[data-sketch-count]')).toContainText('3 points');
  await root.getByRole('button', { name: 'Clear sketch', exact: true }).click();
  await expect(root.locator('[data-sketch-count]')).toContainText('0 points');
  await expect(root.getByRole('button', { name: 'Trace sketch', exact: true })).toBeDisabled();
  await canvas.focus();
  await canvas.press('Space');
  await canvas.press('Shift+ArrowLeft');
  await canvas.press('Space');
  await canvas.press('Shift+ArrowDown');
  await canvas.press('Space');
  await canvas.press('Backspace');
  await expect(root.locator('[data-sketch-count]')).toContainText('2 points');
  await canvas.press('Space');
  await canvas.press('Enter');
  await expect(root).toHaveAttribute('data-input-mode', 'view');
  await expect(root).toHaveAttribute('data-source', 'custom');
  await root.getByRole('button', { name: 'Use all 127 harmonics', exact: true }).click();
  await expect(root.locator('[data-error]')).toHaveText('0.00');
});

test('375px studio is immediately visible, viewport-sized, and still when reduced motion changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openStudio(page, 'no-preference');
  const canvas = root.locator('canvas');
  expect((await canvas.boundingBox())!.y).toBeLessThan(300);
  await expect(canvas).toHaveCSS('touch-action', 'pan-y');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const phase = await root.getAttribute('data-phase');
  await page.waitForTimeout(120);
  expect(await root.getAttribute('data-phase')).toBe(phase);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await setRange(page, 'Cycle position', OPENING_PHASE);
  for (const selector of ['[data-play]', '[data-reset]', '#epicycle-time', '#epicycle-harmonics', '[data-draw]']) {
    const size = (await root.locator(selector).boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('epicycle-mobile.png') });
});

for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
  test(`epicycle workspace ${width}x${height}: scrub, harmonics, signal notes and sketch stay together`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const root = await openStudio(page);
    const canvas = root.locator('canvas');
    const bitmap = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await expect(root).toHaveAttribute('data-workspace', 'true');
    await expectWorkspaceViewport(page, width, height);
    expect(await visibleControlProblems(root)).toEqual([]);
    const menu = (await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox())!;
    expect(await root.locator('button:visible, input:visible, select:visible').evaluateAll((controls, corner) =>
      controls.filter(control => {
        const box = control.getBoundingClientRect();
        return box.left < corner.x + corner.width && box.right > corner.x &&
          box.top < corner.y + corner.height && box.bottom > corner.y;
      }).map(control => control.getAttribute('aria-label') || control.id || control.textContent), menu)).toEqual([]);
    for (const selector of ['[data-play]', '[data-reset]', '#epicycle-time', '#epicycle-harmonics', '[data-draw]']) {
      await expect(root.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: test.info().outputPath(`epicycle-${width}x${height}.png`) });
    const initial = await bitmap();
    await page.getByRole('button', { name: 'Use 4 harmonics', exact: true }).click();
    await expect(root).toHaveAttribute('data-harmonics', '4');
    await expect.poll(bitmap).not.toBe(initial);
    const error = Number(await root.locator('[data-error]').textContent());
    await page.getByRole('button', { name: 'Use all 127 harmonics', exact: true }).click();
    await expect(root.locator('[data-error]')).toHaveText('0.00');
    expect(error).toBeGreaterThan(0);
    const slider = page.getByRole('slider', { name: 'Cycle position', exact: true });
    await slider.focus();
    await slider.press('Home');
    await expect(root).toHaveAttribute('data-phase', '0.000000');
    const atStart = await bitmap();
    await slider.press('ArrowRight');
    await expect(root).toHaveAttribute('data-phase', '0.001000');
    await expect.poll(bitmap).not.toBe(atStart);
    await slider.press('End');
    await expect(root).toHaveAttribute('data-phase', '1.000000');
    const trigger = page.getByRole('button', { name: 'Signal and notes', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Signal and notes', exact: true });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Choose a closed path').selectOption('paper-kite');
    await expect(root).toHaveAttribute('data-source', 'paper-kite');
    await page.getByText('The six largest turns', { exact: true }).click();
    await expect(root.locator('[data-spectrum] li')).toHaveCount(6);
    const circles = await bitmap();
    await page.getByLabel('Show circles', { exact: true }).uncheck();
    await expect.poll(bitmap).not.toBe(circles);
    await page.getByLabel('Show circles', { exact: true }).check();
    await root.locator('.ep-equation').scrollIntoViewIfNeeded();
    await expectWorkspaceViewport(page, width, height);
    if (width === 320) await page.screenshot({ path: test.info().outputPath('epicycle-signal-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: '+ Draw a path', exact: true }).click();
    await expect(root).toHaveAttribute('data-input-mode', 'draw');
    await expectWorkspaceViewport(page, width, height);
    expect(await visibleControlProblems(root)).toEqual([]);
    if (width === 320) await page.screenshot({ path: test.info().outputPath('epicycle-sketch-workspace.png') });
    await expect(page.getByRole('button', { name: 'Trace sketch', exact: true })).toBeInViewport({ ratio: 1 });
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.65);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.3, { steps: 6 });
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.65, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Trace sketch', exact: true }).click();
    await expect(root).toHaveAttribute('data-source', 'custom');
    await expect(root).toHaveAttribute('data-input-mode', 'view');
    await expect(root.locator('[data-error]')).toHaveText('0.00');
    await page.getByRole('button', { name: 'Play drawing', exact: true }).click();
    await expect.poll(async () => Number(await root.getAttribute('data-phase'))).toBeLessThan(1);
    await page.getByRole('button', { name: 'Pause drawing', exact: true }).click();
    await expectWorkspaceViewport(page, width, height);
    expect(await visibleControlProblems(root)).toEqual([]);
    const phase = await root.getAttribute('data-phase');
    const next = width === 375 ? { width: 1280, height: 720 } : { width: 375, height: 812 };
    await page.setViewportSize(next);
    await expect.poll(() => canvas.evaluate(node => {
      const element = node as HTMLCanvasElement;
      const rect = element.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
      return Math.max(Math.abs(element.width - rect.width * dpr), Math.abs(element.height - rect.height * dpr));
    })).toBeLessThanOrEqual(1);
    await expect(root).toHaveAttribute('data-source', 'custom');
    await expect(root).toHaveAttribute('data-phase', phase!);
    await expectWorkspaceViewport(page, next.width, next.height);
  });
}

test('aborting the studio removes frames, resize observers, and all live controls', async ({ page }) => {
  await openStudio(page);
  await page.waitForTimeout(100);
  const result = await page.evaluate(async () => {
    const source = '/src/projects/epicycle-studio/index.ts';
    const { mount } = await import(source);
    const host = document.createElement('div');
    host.style.width = '700px';
    document.body.append(host);
    const controller = new AbortController();
    const reports: string[] = [];
    const frames = new Set<number>();
    const observers = new Set<ResizeObserver>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const OriginalObserver = window.ResizeObserver;
    window.requestAnimationFrame = (callback) => {
      const frame = request((now) => { frames.delete(frame); callback(now); });
      frames.add(frame);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => { frames.delete(frame); cancel(frame); };
    window.ResizeObserver = class extends OriginalObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    try {
      const instance = mount({
        container: host, controls: document.createElement('div'), signal: controller.signal,
        reducedMotion: false, report: (message: string) => reports.push(message),
      });
      const pausedOnMount = host.firstElementChild?.getAttribute('data-motion');
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const root = host.querySelector<HTMLElement>('.project-epicycle-studio')!;
      const button = root.querySelector<HTMLButtonElement>('[data-play]')!;
      const before = { frames: frames.size, observers: observers.size, time: Number(root.dataset.phase) };
      controller.abort();
      instance.destroy();
      instance.destroy();
      const reportCount = reports.length;
      button.click();
      instance.reset();
      instance.setPaused(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((resolve) => window.setTimeout(resolve, 70));
      return {
        pausedOnMount, before, after: { frames: frames.size, observers: observers.size, children: host.childElementCount },
        newReports: reports.length - reportCount,
      };
    } finally {
      controller.abort();
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      window.ResizeObserver = OriginalObserver;
      host.remove();
    }
  });
  expect(result.pausedOnMount).toBe('paused');
  expect(result.before).toMatchObject({ frames: 1, observers: 1 });
  expect(result.before.time).toBeGreaterThan(OPENING_PHASE);
  expect(result.after).toEqual({ frames: 0, observers: 0, children: 0 });
  expect(result.newReports).toBe(0);
});
