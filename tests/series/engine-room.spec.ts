import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  DEFAULT_ANGLE, DEFAULT_GEOMETRY, advanceCycle, seekAngle, sliderCrank, stateAt, valveLift,
} from '../../src/projects/engine-room/engine';
import { geometryStudies, strokes } from '../../src/projects/engine-room/data';
import { DRAWING_SCALE, crankCenter, travelPath } from '../../src/projects/engine-room/scene';

test('slider-crank closes exactly, has a 2r stroke, and retains the nonlinear rod correction', () => {
  for (const radius of [0.5, 1, 1.7]) {
    for (const ratio of [1.1, 2.2, 3.4, 5]) {
      const geometry = { radius, rod: radius * ratio };
      for (let angle = 0; angle <= 720; angle += 3) {
        const pose = sliderCrank(angle, geometry);
        expect(Math.hypot(pose.crank.x, pose.crank.y)).toBeCloseTo(radius, 11);
        expect(Math.hypot(pose.wrist.x - pose.crank.x, pose.wrist.y - pose.crank.y)).toBeCloseTo(geometry.rod, 11);
        expect(pose.wrist.x).toBe(0);
        expect(pose.displacement).toBeGreaterThanOrEqual(-1e-12);
        expect(pose.displacement).toBeLessThanOrEqual(2 * radius + 1e-12);
        expect(pose.strokeFraction).toBeCloseTo(pose.displacement / (2 * radius), 12);
        expect(Math.sin(pose.rodAngle * Math.PI / 180) * geometry.rod).toBeCloseTo(pose.crank.x, 11);
      }
      for (const angle of [0, 360, 720]) expect(sliderCrank(angle, geometry).displacement).toBeCloseTo(0, 12);
      for (const angle of [180, 540]) expect(sliderCrank(angle, geometry).displacement).toBeCloseTo(2 * radius, 12);
      expect(sliderCrank(90, geometry).strokeFraction).toBeGreaterThan(0.5);
    }
  }
  expect(sliderCrank(90, { radius: 1, rod: 2.2 }).displacement)
    .toBeGreaterThan(sliderCrank(90, { radius: 1, rod: 5 }).displacement);
  expect(sliderCrank(-90)).toEqual(sliderCrank(270));
  for (const geometry of [
    { radius: 0, rod: 3 }, { radius: -1, rod: 3 }, { radius: 1, rod: 1 },
    { radius: 2, rod: 1 }, { radius: Infinity, rod: 5 }, { radius: 1, rod: NaN },
  ]) expect(() => sliderCrank(90, geometry)).toThrow(RangeError);
  expect(() => sliderCrank(Infinity)).toThrow(RangeError);
});

test('piston derivative matches finite differences and all 720-degree events have coherent boundaries', () => {
  const h = 1e-5;
  for (const study of geometryStudies) {
    for (let angle = 7; angle < 720; angle += 11) {
      const geometry = { radius: 1, rod: study.ratio };
      const numeric = (sliderCrank(angle + h * 180 / Math.PI, geometry).displacement -
        sliderCrank(angle - h * 180 / Math.PI, geometry).displacement) / (2 * h);
      expect(sliderCrank(angle, geometry).travelPerRadian).toBeCloseTo(numeric, 7);
    }
  }
  for (let index = 0; index < strokes.length; index++) {
    const state = stateAt(index * 180 + 90);
    expect(state.stroke).toBe(strokes[index].id);
    expect(Math.sign(state.pose.travelPerRadian)).toBe(index % 2 === 0 ? 1 : -1);
    expect(state.intakeLift).toBe(index === 0 ? 1 : 0);
    expect(state.exhaustLift).toBe(index === 3 ? 1 : 0);
    const boundary = stateAt(index * 180);
    expect(boundary.intakeLift).toBe(0);
    expect(boundary.exhaustLift).toBe(0);
  }
  expect(stateAt(720)).toMatchObject({ stroke: 'exhaust', intakeLift: 0, exhaustLift: 0, complete: true });
  expect(valveLift(0)).toBe(0);
  expect(valveLift(180)).toBe(0);
  expect(valveLift(90)).toBe(1);
  expect(() => valveLift(181)).toThrow(RangeError);
  expect(() => valveLift(NaN)).toThrow(RangeError);
});

test('clock preserves paused endpoints and plots are deterministic at every valid geometry', () => {
  expect(seekAngle(-3)).toBe(0);
  expect(seekAngle(721)).toBe(720);
  expect(() => seekAngle(NaN)).toThrow(RangeError);
  expect(advanceCycle(720, 0)).toBe(720);
  expect(advanceCycle(710, 1)).toBe(50);
  expect(advanceCycle(60, 0.5, 2)).toBe(120);
  expect(() => advanceCycle(0, -1)).toThrow(RangeError);
  expect(() => advanceCycle(0, 1, 0)).toThrow(RangeError);
  for (const study of geometryStudies) {
    const geometry = { radius: 1, rod: study.ratio };
    const first = stateAt(133.5, geometry);
    stateAt(600, geometry);
    stateAt(0, geometry);
    expect(stateAt(133.5, geometry)).toEqual(first);
    const origin = crankCenter(geometry);
    expect(origin.y - (geometry.rod + geometry.radius) * DRAWING_SCALE).toBeCloseTo(154, 12);
    expect(travelPath(geometry)).toContain('L180 106.0000');
    expect(travelPath(geometry)).toContain('L360 20.0000');
    expect(travelPath(geometry)).not.toMatch(/NaN|Infinity/);
  }
});

async function openStudio(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/engine-room/');
  await expect(page.locator('.project-engine-room .er-scene')).toBeVisible();
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  return page.locator('.project-engine-room');
}

async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('cycle and geometry controls move connected SVG parts and reproduce reverse seeks', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  const root = await openStudio(page);
  const scene = root.locator('.er-scene');
  expect((await scene.boundingBox())!.y).toBeLessThan(250);
  await expect(root.locator('output:not([aria-live="off"])')).toHaveCount(0);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('svg [data-construction]')).toHaveAttribute('opacity', '1');
  for (const stroke of strokes) {
    await root.getByRole('button', { name: `Inspect ${stroke.name.toLowerCase()}`, exact: true }).click();
    await expect(root).toHaveAttribute('data-stroke', stroke.id);
    await expect(root.locator('[data-intake-state]')).toHaveText(stroke.id === 'intake' ? 'Open' : 'Closed');
    await expect(root.locator('[data-exhaust-state]')).toHaveText(stroke.id === 'exhaust' ? 'Open' : 'Closed');
  }
  await setRange(page, 'Cycle angle', 133.5);
  const before = await scene.innerHTML();
  const chart = await root.locator('[data-chart-travel]').getAttribute('d');
  await setRange(page, 'Cycle angle', 612);
  await setRange(page, 'Cycle angle', 0);
  await setRange(page, 'Cycle angle', 133.5);
  expect(await scene.innerHTML()).toBe(before);
  await root.getByRole('button', { name: 'Long rod', exact: true }).click();
  await expect(root).toHaveAttribute('data-ratio', '5.00');
  expect(await root.locator('[data-chart-travel]').getAttribute('d')).not.toBe(chart);
  const connection = await scene.evaluate((element) => {
    const get = (selector: string, attribute: string) => Number(element.querySelector(selector)!.getAttribute(attribute));
    const rod = Math.hypot(get('[data-rod]', 'x2') - get('[data-rod]', 'x1'), get('[data-rod]', 'y2') - get('[data-rod]', 'y1'));
    const crank = Math.hypot(get('[data-pin]', 'cx') - get('[data-center]', 'cx'), get('[data-pin]', 'cy') - get('[data-center]', 'cy'));
    return { rod, crank, wristX: get('[data-wrist]', 'cx'), rodX: get('[data-rod]', 'x2') };
  });
  expect(connection.rod).toBeCloseTo(5 * DRAWING_SCALE, 9);
  expect(connection.crank).toBeCloseTo(DRAWING_SCALE, 9);
  expect(connection.wristX).toBe(connection.rodX);
  await setRange(page, 'Rod / crank ratio', 2);
  await expect(root).toHaveAttribute('data-ratio', '2.00');
  await setRange(page, 'Cycle angle', 90);
  await page.getByLabel('Gas-flow cues', { exact: true }).uncheck();
  await expect(root.locator('[data-intake-flow]')).toHaveAttribute('opacity', '0');
  await page.getByLabel('Gas-flow cues', { exact: true }).check();
  await expect(root.locator('[data-intake-flow]')).toHaveAttribute('opacity', '1');
  await page.getByLabel('Construction lines', { exact: true }).uncheck();
  await expect(root.locator('svg [data-construction]')).toHaveAttribute('opacity', '0');
  await root.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '0.000');
  await expect(root).toHaveAttribute('data-ratio', DEFAULT_GEOMETRY.rod.toFixed(2));
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(page.getByLabel('Construction lines', { exact: true })).toBeChecked();
  await expect(root.locator('svg [data-construction]')).toHaveAttribute('opacity', '1');
  await setRange(page, 'Cycle angle', DEFAULT_ANGLE);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('engine-room-desktop.png') });
  expect(errors).toEqual([]);
});

test('native transport, keyboard inspection, and a live reduced-motion change share one clock', async ({ page }) => {
  const root = await openStudio(page, 'no-preference');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const stopped = await root.getAttribute('data-angle');
  await page.waitForTimeout(120);
  expect(await root.getAttribute('data-angle')).toBe(stopped);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Reset', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Cycle angle', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(root).toHaveAttribute('data-angle', '0.500');
  await slider.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Step forward 15 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '15.500');
  const scene = root.locator('.er-scene');
  await scene.focus();
  await scene.press('Shift+ArrowRight');
  await expect(root).toHaveAttribute('data-angle', '30.500');
  await scene.press('Home');
  await expect(root).toHaveAttribute('data-angle', '0.000');
  await scene.press('End');
  await expect(root).toHaveAttribute('data-angle', '720.000');
  await expect(root.locator('[data-direction]')).toContainText('One cycle complete');
  await expect(root.locator('[data-exhaust-state]')).toHaveText('Closed');
  await page.getByLabel('Playback speed', { exact: true }).selectOption('2');
  await scene.focus();
  await scene.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-angle'))).toBeGreaterThan(1);
  await scene.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const snapshot = await scene.innerHTML();
  await page.waitForTimeout(120);
  expect(await scene.innerHTML()).toBe(snapshot);
  await expect(root).toHaveAttribute('data-speed', '2');
});

test('375px engine stays near the top with readable labels and generous working controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openStudio(page);
  const scene = root.locator('.er-scene');
  expect((await scene.boundingBox())!.y).toBeLessThan(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const locator of [
    root.locator('[data-play]'), root.locator('[data-reset]'),
    root.locator('#er-cycle'),
    root.getByRole('button', { name: 'Inspect compression', exact: true }),
  ]) expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await root.getByRole('button', { name: 'Parameters', exact: true }).click();
  for (const locator of [root.locator('#er-ratio'), root.locator('#er-speed')]) {
    expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await root.getByRole('button', { name: 'Close Engine instruments', exact: true }).click();
  const legendFonts = await root.locator('.er-parts, .er-port-legend, .er-cycle-scale, .er-help').evaluateAll((elements) =>
    elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...legendFonts)).toBeGreaterThanOrEqual(12);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.screenshot({ path: testInfo.outputPath('engine-room-mobile.png') });
});

test('engine notebook and readout preserve the current pose and restore keyboard focus', async ({ page }) => {
  const root = await openStudio(page);
  await setRange(page, 'Cycle angle', 450);
  await root.getByRole('button', { name: 'Readout', exact: true }).click();
  await expect(root.locator('[data-stroke-title]')).toHaveText('Power');
  await expect(root.locator('.er-chart')).toBeVisible();
  const notebook = root.getByRole('button', { name: 'Notebook', exact: true });
  await notebook.click();
  await expect(root.getByRole('dialog', { name: 'Engine notebook', exact: true })).toBeVisible();
  await expect(root.locator('.er-equation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(notebook).toBeFocused();
  await expect(root).toHaveAttribute('data-angle', '450.000');
  await root.getByRole('button', { name: 'Parameters', exact: true }).click();
  await root.locator('#er-ratio').focus();
  await root.locator('#er-ratio').press('ArrowRight');
  await expect(root.locator('#er-ratio')).toBeFocused();
});

test('abort cancels the engine loop and makes retained controls inert', async ({ page }) => {
  await openStudio(page);
  await page.waitForTimeout(80);
  const result = await page.evaluate(async () => {
    const source = '/src/projects/engine-room/index.ts';
    const { mount } = await import(source);
    const host = document.createElement('div');
    document.body.append(host);
    const controller = new AbortController();
    const frames = new Set<number>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const frame = request((now) => { frames.delete(frame); callback(now); });
      frames.add(frame);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => { frames.delete(frame); cancel(frame); };
    try {
      const instance = mount({
        container: host, controls: document.createElement('div'),
        signal: controller.signal, reducedMotion: true, report: () => {},
      });
      const root = host.querySelector<HTMLElement>('.project-engine-room')!;
      const heldPlay = root.querySelector<HTMLButtonElement>('[data-play]')!;
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const before = { frames: frames.size, angle: Number(root.dataset.angle) };
      controller.abort();
      instance.destroy();
      instance.destroy();
      const angle = root.dataset.angle;
      heldPlay.click();
      instance.reset();
      instance.setPaused(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((resolve) => window.setTimeout(resolve, 70));
      return { before, frames: frames.size, children: host.childElementCount, unchanged: angle === root.dataset.angle };
    } finally {
      controller.abort();
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      host.remove();
    }
  });
  expect(result.before.frames).toBe(1);
  expect(result.before.angle).toBeGreaterThan(DEFAULT_ANGLE);
  expect(result).toMatchObject({ frames: 0, children: 0, unchanged: true });
});
