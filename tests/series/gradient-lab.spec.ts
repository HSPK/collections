import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { SURFACES } from '../../src/projects/gradient-lab/data';
import { sampleTerrain } from '../../src/projects/gradient-lab/contours';
import {
  ADAM_EPSILON, createComparison, createRun, inverseSignedLog, MAX_ITERATIONS,
  METHODS, signedLog, stepComparison, stepRun,
} from '../../src/projects/gradient-lab/engine';
import type { Objective, Point } from '../../src/projects/gradient-lab/engine';

const projectURL = './projects/gradient-lab/';

async function openLab(page: Page, width = 1280, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
  await page.emulateMedia({ reducedMotion });
  await page.goto(projectURL);
  const root = page.locator('.project-gradient-lab');
  await expect(root).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(root.locator('[data-landscape] canvas')).toBeVisible();
  return root;
}

async function loss(root: Locator): Promise<number> {
  return Number(await root.locator('[data-selected-loss]').getAttribute('data-loss-value'));
}

function expectPoint(actual: Point, expected: Point, precision = 10) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

test('analytic derivatives, real updates, counters, and numerical boundaries are correct', () => {
  const config = ts.readConfigFile(resolve('tsconfig.json'), ts.sys.readFile);
  const compiler = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram({
    rootNames: [resolve('src/projects/gradient-lab/index.ts'), resolve('tests/series/gradient-lab.spec.ts')],
    options: compiler.options,
  });
  const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) =>
    `${diagnostic.file ? relative(process.cwd(), diagnostic.file.fileName) : 'TypeScript'}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
  );
  expect(errors, 'The owned project and focused spec must satisfy existing strict TypeScript options.').toEqual([]);

  const h = 1e-6;
  for (const surface of SURFACES) {
    for (const point of [surface.start, { x: 0.31, y: -0.27 }, { x: 1, y: 1 }]) {
      const numeric = {
        x: (surface.value({ x: point.x + h, y: point.y }) - surface.value({ x: point.x - h, y: point.y })) / (2 * h),
        y: (surface.value({ x: point.x, y: point.y + h }) - surface.value({ x: point.x, y: point.y - h })) / (2 * h),
      };
      expectPoint(surface.gradient(point), numeric, 6);
    }
  }

  const bowl = SURFACES[0];
  const settings = { learningRate: 0.1 };
  const start = { x: 1, y: -1 };
  const initial = createComparison(bowl, start, settings);
  const initialJSON = JSON.stringify(initial);
  const first = stepComparison(bowl, initial, settings);
  const second = stepComparison(bowl, first, settings);
  expectPoint(first[0].position, { x: 0.9, y: -0.6 });
  expectPoint(first[1].position, first[0].position);
  expectPoint(second[1].velocity, { x: 1.8, y: -6 });
  expectPoint(second[1].position, { x: 0.72, y: 0 });
  expectPoint(first[2].lastUpdate!.firstHat!, { x: 1, y: -4 });
  expectPoint(first[2].lastUpdate!.secondHat!, { x: 1, y: 16 });
  expectPoint(first[2].position, {
    x: 1 - 0.1 / (1 + ADAM_EPSILON),
    y: -1 + 0.4 / (4 + ADAM_EPSILON),
  });
  const g2 = first[2].gradient;
  const expectedMHat = { x: (0.09 + 0.1 * g2.x) / (1 - 0.9 ** 2), y: (-0.36 + 0.1 * g2.y) / (1 - 0.9 ** 2) };
  const expectedVHat = { x: (0.000999 + 0.001 * g2.x ** 2) / (1 - 0.999 ** 2), y: (0.015984 + 0.001 * g2.y ** 2) / (1 - 0.999 ** 2) };
  expectPoint(second[2].lastUpdate!.firstHat!, expectedMHat);
  expectPoint(second[2].lastUpdate!.secondHat!, expectedVHat);
  expectPoint(second[2].position, {
    x: first[2].position.x - 0.1 * expectedMHat.x / (Math.sqrt(expectedVHat.x) + ADAM_EPSILON),
    y: first[2].position.y - 0.1 * expectedMHat.y / (Math.sqrt(expectedVHat.y) + ADAM_EPSILON),
  });
  expect(JSON.stringify(initial), 'The pure update must not mutate previous snapshots.').toBe(initialJSON);
  for (const run of second) {
    expect(run.iteration).toBe(2);
    expect(run.attempts).toBe(2);
    expect(run.history.map((sample) => sample.t)).toEqual([0, 1, 2]);
    expect(run.loss).toBe(bowl.value(run.position));
    expect(run.gradient).toEqual(bowl.gradient(run.position));
    expect(run.lastUpdate!.usedGradient).toEqual(run.history[1].gradient);
  }

  const tiny: Objective = {
    id: 'epsilon-check', bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    value: ({ x }) => 1e-12 * x, gradient: () => ({ x: 1e-12, y: 0 }),
  };
  const tinyStep = stepRun(tiny, createRun(tiny, { x: 0, y: 0 }, settings, 'adam'), settings);
  expect(tinyStep.position.x).toBeCloseTo(-0.1 * 1e-12 / (1e-12 + ADAM_EPSILON), 13);
  expect(tinyStep.position.y).toBe(0);

  for (const method of METHODS) {
    const stationary = stepRun(SURFACES[2], createRun(SURFACES[2], { x: 0, y: 0 }, settings, method), settings);
    expect(stationary.status).toBe('stationary');
    expect(stationary.iteration).toBe(1);
    expect(stationary.history).toHaveLength(2);
    expect(stationary.reason).toContain('not necessarily a minimum');
    expectPoint(stationary.position, { x: 0, y: 0 });
  }
  const outside = stepRun(bowl, createRun(bowl, { x: 1, y: 2 }, { learningRate: 1 }, 'gd'), { learningRate: 1 });
  expect(outside.status).toBe('out-of-view');
  expectPoint(outside.position, { x: 0, y: -6 });
  expect(outside.loss).toBe(72);
  expect(outside.history).toHaveLength(2);
  expect(stepRun(bowl, outside, settings)).toBe(outside);

  const invalidEvaluation: Objective = {
    id: 'invalid-evaluation', bounds: tiny.bounds,
    value: ({ x }) => x < 0 ? Infinity : 0,
    gradient: () => ({ x: 1, y: 0 }),
  };
  const rejected = stepRun(invalidEvaluation, createRun(invalidEvaluation, { x: 0, y: 0 }, settings, 'gd'), settings);
  expect(rejected).toMatchObject({ iteration: 0, attempts: 1, status: 'diverged', position: { x: 0, y: 0 }, loss: 0 });
  expect(rejected.reason).toContain('not finite');
  expect(rejected.history).toHaveLength(1);
  const extreme: Objective = { ...tiny, gradient: () => ({ x: 1e12, y: 0 }) };
  const oversized = stepRun(extreme, createRun(extreme, { x: 0, y: 0 }, settings, 'momentum'), settings);
  expect(oversized.status).toBe('diverged');
  expect(oversized.reason).toContain('coordinate exceeds');
  expect(oversized.velocity).toEqual({ x: 0, y: 0 });
  expect(() => createRun(bowl, { x: NaN, y: 0 }, settings, 'gd')).toThrow(RangeError);
  expect(() => createRun(bowl, start, { learningRate: 0 }, 'gd')).toThrow(RangeError);
  expect(() => createRun(bowl, start, { learningRate: Infinity }, 'adam')).toThrow(RangeError);

  const ramp: Objective = {
    id: 'bounded-counter', bounds: { xMin: -100, xMax: 100, yMin: -100, yMax: 100 },
    value: ({ x }) => x, gradient: () => ({ x: 1, y: 0 }),
  };
  const slow = { learningRate: 0.0001 };
  let limited = createComparison(ramp, { x: 0, y: 0 }, slow);
  for (let index = 0; index < MAX_ITERATIONS + 5; index++) limited = stepComparison(ramp, limited, slow);
  for (const run of limited) {
    expect(run.status).toBe('limit');
    expect(run.iteration).toBe(MAX_ITERATIONS);
    expect(run.attempts).toBe(MAX_ITERATIONS);
    expect(run.history).toHaveLength(MAX_ITERATIONS + 1);
    expect(run.history.every((sample) =>
      [sample.position.x, sample.position.y, sample.loss, sample.gradient.x, sample.gradient.y, sample.delta.x, sample.delta.y].every(Number.isFinite),
    )).toBe(true);
  }
  for (const surface of SURFACES) {
    const defaults = { learningRate: surface.learningRate };
    let comparison = createComparison(surface, surface.start, defaults);
    for (let index = 0; index < MAX_ITERATIONS; index++) comparison = stepComparison(surface, comparison, defaults);
    for (const run of comparison) {
      expect(run.status, `${surface.name} / ${run.method}: ${run.reason}`).not.toBe('diverged');
      expect(run.status).not.toBe('active');
      expect(run.iteration).toBeLessThanOrEqual(MAX_ITERATIONS);
      expect(run.history).toHaveLength(run.iteration + 1);
      expect(run.history.every((sample) =>
        [sample.position.x, sample.position.y, sample.loss, sample.gradient.x, sample.gradient.y].every(Number.isFinite),
      )).toBe(true);
      expect(run.loss).toBe(surface.value(run.position));
    }
  }
  for (const value of [-100, -0.003, 0, 1e-12, 1000]) {
    expect(inverseSignedLog(signedLog(value))).toBeCloseTo(value, 9);
  }
  const terrain = sampleTerrain(bowl, [1]);
  expect(terrain.contours[0].segments.length).toBeGreaterThan(40);
  for (const segment of terrain.contours[0].segments) {
    for (const point of segment) expect(bowl.value(point)).toBeCloseTo(1, 2);
  }
});

test('desktop controls change real paths and losses, preserve stopped endpoints, and export actual samples', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = await openLab(page, 1280, 'no-preference');
  await expect(root.getByRole('heading', { name: 'Gradient Lab', exact: true })).toBeVisible();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.waitForTimeout(280);
  await expect(root).toHaveAttribute('data-round', '0');
  const canvas = root.locator('[data-landscape] canvas');
  expect((await canvas.boundingBox())!.y).toBeLessThan(300);
  const initialLoss = await loss(root);
  expect(initialLoss).toBe(SURFACES[0].value(SURFACES[0].start));
  const initialPixels = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await root.getByRole('button', { name: 'Step all', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '1');
  expect(await loss(root)).toBeLessThan(initialLoss);
  const expectedFirst = stepComparison(SURFACES[0], createComparison(SURFACES[0], SURFACES[0].start, { learningRate: 0.08 }), { learningRate: 0.08 });
  expect(await loss(root)).toBeCloseTo(expectedFirst[0].loss, 12);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(initialPixels);
  await root.getByRole('button', { name: 'Inspect Momentum', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '1');
  await expect(root.locator('[data-memory]')).toContainText('-2.4000');
  await root.getByRole('button', { name: 'Step all', exact: true }).click();
  expect(await loss(root)).toBeCloseTo(stepRun(SURFACES[0], expectedFirst[1], { learningRate: 0.08 }).loss, 12);
  await expect(root.locator('[data-used-gradient]')).toContainText('Last step used g2');
  await root.getByRole('button', { name: 'Reset', exact: true }).click();
  await root.getByRole('button', { name: 'Inspect Gradient descent', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '0');
  expect(await loss(root)).toBe(initialLoss);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(initialPixels);

  await root.getByRole('spinbutton', { name: 'Exact learning rate', exact: true }).fill('0.12');
  await root.getByRole('spinbutton', { name: 'Exact learning rate', exact: true }).press('Tab');
  await expect(root).toHaveAttribute('data-rate', '0.12');
  await expect(root.locator('[data-feedback]')).toContainText('histories restart at t = 0');
  await root.getByLabel('Choose a landscape', { exact: true }).selectOption('valley');
  await expect(root).toHaveAttribute('data-rate', '0.025');
  await expect(root.locator('[data-formula]')).toContainText('/ 50');
  const valleyLoss = await loss(root);
  await root.getByRole('button', { name: 'Step all', exact: true }).click();
  expect(await loss(root)).toBeLessThan(valleyLoss);
  await root.getByLabel('Start x', { exact: true }).fill('-1');
  await root.getByLabel('Start y', { exact: true }).fill('1');
  await root.getByRole('button', { name: 'Set start', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '0');
  expect(await loss(root)).toBeCloseTo(0.08, 12);
  const plotSize = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: plotSize.width / 2, y: plotSize.height / 2 } });
  const mapStart = {
    x: Number(await root.getByLabel('Start x', { exact: true }).inputValue()),
    y: Number(await root.getByLabel('Start y', { exact: true }).inputValue()),
  };
  expect(mapStart.x).not.toBe(-1);
  expect(await loss(root)).toBe(SURFACES[1].value(mapStart));
  await root.getByRole('button', { name: 'Step all', exact: true }).click();
  const mapBounds = (await canvas.boundingBox())!;
  await page.mouse.move(mapBounds.x + 80, mapBounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(mapBounds.x + 150, mapBounds.y + 90, { steps: 4 });
  await page.mouse.up();
  await expect(root).toHaveAttribute('data-round', '1');

  await root.locator('[data-challenge="bounce-budget"]').click();
  for (let index = 0; index < 4; index++) await root.getByRole('button', { name: 'Step all', exact: true }).click();
  await expect(root.locator('[data-method="gd"]')).toHaveAttribute('data-status', 'out-of-view');
  await expect(root.locator('[data-current-y]')).toHaveText('2.5920');
  await expect(root.locator('[data-state-reason]')).toContainText('not clamped');
  await expect(root.locator('[data-state-reason]')).toContainText('does not prove mathematical divergence');
  await root.getByLabel('Playback speed', { exact: true }).selectOption('12');
  await root.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-round'))).toBeGreaterThan(5);
  await root.getByRole('button', { name: 'Pause all', exact: true }).click();
  const pausedRound = await root.getAttribute('data-round');
  await page.waitForTimeout(240);
  expect(await root.getAttribute('data-round')).toBe(pausedRound);
  await expect(root.locator('[data-current-y]')).toHaveText('2.5920');
  await root.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-round', '0');
  await expect(root.locator('[data-method="gd"]')).toHaveAttribute('data-status', 'active');

  await root.locator('[data-challenge="false-finish"]').click();
  await root.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '1');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.getByRole('button', { name: 'Play all', exact: true })).toBeDisabled();
  await root.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(root).toHaveAttribute('data-round', '0');

  await root.getByLabel('Choose a landscape', { exact: true }).selectOption('valley');
  await root.getByLabel('Choose a landscape', { exact: true }).selectOption('bowl');
  for (let index = 0; index < 8; index++) await root.getByRole('button', { name: 'Step all', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await root.getByRole('button', { name: 'Export samples', exact: false }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^gradient-lab-bowl-run-\d+\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8').trim().split('\n');
  expect(csv).toHaveLength(28);
  expect(csv[0]).toContain('current_gradient_x');
  expect(Number(csv[9].split(',')[7])).toBe(await loss(root));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('gradient-lab-desktop.png')) });
  expect(await root.textContent()).not.toMatch(/NaN|Infinity/);
  expect(errors).toEqual([]);
});

test('375px keyboard controls, honest saddle labels, reduced motion, and teardown remain usable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = await openLab(page, 375);
  const canvas = root.locator('[data-landscape] canvas');
  expect((await canvas.boundingBox())!.y).toBeLessThan(300);
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(canvas).toHaveCSS('touch-action', 'pan-y');
  await page.waitForTimeout(280);
  await expect(root).toHaveAttribute('data-round', '0');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Step all', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-round', '1');
  const slider = root.getByRole('slider', { name: 'Learning rate, logarithmic scale', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(root).toHaveAttribute('data-round', '0');
  const changedRate = await root.getAttribute('data-rate');
  expect(changedRate).not.toBe('0.08');
  const exactRate = root.getByRole('spinbutton', { name: 'Exact learning rate', exact: true });
  await exactRate.fill('0');
  await exactRate.press('Tab');
  await expect(root.locator('[data-feedback]')).toContainText('Rate not applied');
  expect(await root.getAttribute('data-rate')).toBe(changedRate);
  await exactRate.fill('0.05');
  await exactRate.press('Tab');
  await expect(root).toHaveAttribute('data-rate', '0.05');
  await root.getByLabel('Start x', { exact: true }).fill('0.5');
  await root.getByLabel('Start y', { exact: true }).fill('-0.5');
  await root.getByLabel('Start y', { exact: true }).press('Enter');
  await expect(root.locator('[data-current-x]')).toHaveText('0.5000');
  await expect(root.locator('[data-current-y]')).toHaveText('-0.5000');
  await expect(root.locator('[data-current-gradient]')).toHaveText('(0.5000, -2.0000)');

  await root.locator('[data-challenge="false-finish"]').click();
  await root.getByRole('button', { name: 'Step all', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-round', '1');
  await expect(root.getByRole('button', { name: 'Play all', exact: true })).toBeDisabled();
  await expect(root.locator('[data-state-reason]')).toContainText('not necessarily a minimum');
  await expect(root.locator('[data-surface-note]')).toContainText('no finite minimum');
  await root.getByLabel('Start y', { exact: true }).fill('0.1');
  await root.getByLabel('Start y', { exact: true }).press('Enter');
  const negativeStart = await loss(root);
  expect(negativeStart).toBeLessThan(0);
  await root.getByRole('button', { name: 'Step all', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(await loss(root)).toBeLessThan(negativeStart);
  await expect(root.locator('[data-derivative-y]')).toHaveText('∂L/∂y = −y');
  await root.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-round'))).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Play all', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-motion-note]')).toContainText('Reduced motion');
  const paused = await root.getAttribute('data-round');
  await page.waitForTimeout(180);
  expect(await root.getAttribute('data-round')).toBe(paused);
  await root.getByText('Inspect recent samples', { exact: true }).click();
  await expect(root.locator('[data-sample-rows]')).toContainText('-');
  await root.getByText('The exact rules & numerical boundaries', { exact: true }).click();
  await expect(root.locator('.gl-rulebook')).toContainText('epsilon is outside the square root');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await root.locator('button, select, input[type="range"], input[type="number"], .gl-toggle, summary').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const label of await root.locator('label').all()) {
    expect(await label.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('gradient-lab-mobile.png')) });
  await page.waitForTimeout(120);

  const cleanup = await page.evaluate(async () => {
    const source = '/src/projects/gradient-lab/index.ts';
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
    const NativeObserver = window.ResizeObserver;
    window.requestAnimationFrame = (callback) => {
      const frame = request((now) => { frames.delete(frame); callback(now); });
      frames.add(frame);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => { frames.delete(frame); cancel(frame); };
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    try {
      const instance = mount({
        container: host, controls: document.createElement('div'), signal: controller.signal,
        reducedMotion: false, report: (message: string) => reports.push(message),
      });
      const mounted = host.querySelector<HTMLElement>('.project-gradient-lab')!;
      const initialMotion = mounted.dataset.motion;
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 330));
      const stalePlay = mounted.querySelector<HTMLButtonElement>('[data-play]')!;
      const before = { observers: observers.size, frames: frames.size, round: Number(mounted.dataset.round) };
      controller.abort();
      instance.destroy();
      instance.destroy();
      const reportCount = reports.length;
      stalePlay.click();
      instance.reset();
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 90));
      return {
        initialMotion, before,
        after: { observers: observers.size, frames: frames.size, children: host.childElementCount },
        newReports: reports.length - reportCount,
      };
    } finally {
      controller.abort();
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      window.ResizeObserver = NativeObserver;
      host.remove();
    }
  });
  expect(cleanup.initialMotion).toBe('paused');
  expect(cleanup.before.observers).toBe(2);
  expect(cleanup.before.frames).toBe(1);
  expect(cleanup.before.round).toBeGreaterThan(0);
  expect(cleanup.after).toEqual({ observers: 0, frames: 0, children: 0 });
  expect(cleanup.newReports).toBe(0);
  expect(errors).toEqual([]);
});
