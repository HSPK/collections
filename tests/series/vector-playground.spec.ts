import { expect, test } from '@playwright/test';
import { relative } from 'node:path';
import { MATRIX_PRESETS } from '../../src/projects/vector-playground/data';
import {
  analyzeMatrix, determinant, dot, eigenDirections, formatNumber, length, project, projectionMatrix,
  scaleVector, subtract, transform,
} from '../../src/projects/vector-playground/engine';
import type { Mat2, Vec2 } from '../../src/projects/vector-playground/engine';

function expectVector(actual: Vec2, expected: Vec2, precision = 10) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

test('matrix columns, signed area, collapses, and real or complex eigenspaces are genuine', () => {
  const preset = (id: string) => MATRIX_PRESETS.find((item) => item.id === id)!.matrix;
  const rotation = preset('rotation');
  expectVector(transform(rotation, { x: 2, y: 1 }), { x: -1, y: 2 });
  expect(analyzeMatrix(rotation)).toMatchObject({ determinant: 1, area: 1, rank: 2, orientation: 'preserved' });
  expect(analyzeMatrix(preset('reflection'))).toMatchObject({ determinant: -1, area: 1, rank: 2, orientation: 'reversed' });
  expectVector(transform(preset('reflection'), { x: 2, y: 1 }), { x: 2, y: -1 });
  expect(analyzeMatrix(preset('singular'))).toMatchObject({ determinant: 0, rank: 1, nearSingular: false, orientation: 'collapsed' });
  expectVector(transform(preset('singular'), { x: -2, y: 1 }), { x: 0, y: 0 });
  expect(analyzeMatrix(preset('zero'))).toMatchObject({ determinant: 0, rank: 0, orientation: 'collapsed' });
  expect(analyzeMatrix({ a: 1, b: 0, c: 0, d: 1e-12 })).toMatchObject({ rank: 1, nearSingular: true });
  expect(analyzeMatrix({ a: 1e-12, b: 0, c: 0, d: 1e-12 })).toMatchObject({ rank: 2, nearSingular: false });
  expect(eigenDirections(rotation)).toEqual({ kind: 'complex', real: 0, imaginary: 1, directions: [] });
  expect(eigenDirections({ a: 1, b: -1e-8, c: 1e-8, d: 1 })).toMatchObject({ kind: 'complex', directions: [] });
  const tinyRotation = eigenDirections({ a: 1, b: -1e-200, c: 1e-200, d: 1 });
  expect(tinyRotation.kind).toBe('complex');
  if (tinyRotation.kind === 'complex') {
    expect(tinyRotation.imaginary / 1e-200).toBeCloseTo(1, 13);
    expect(tinyRotation.directions).toEqual([]);
  }
  const nearbyReal = eigenDirections({ a: 1, b: 1e-200, c: 1e-200, d: 1 });
  expect(nearbyReal.kind).toBe('distinct');
  if (nearbyReal.kind === 'distinct') {
    expect(dot(nearbyReal.directions[0].direction, nearbyReal.directions[1].direction)).toBeCloseTo(0, 13);
  }
  expect(eigenDirections(preset('shear'))).toMatchObject({ kind: 'defective', value: 1 });
  expect(eigenDirections({ a: 3, b: 1, c: -1, d: 1 })).toMatchObject({ kind: 'defective', value: 2 });
  expect(eigenDirections({ a: 3, b: 2, c: -0.5, d: 1 })).toMatchObject({ kind: 'defective', value: 2 });
  expect(eigenDirections({ a: 0, b: 1, c: 0, d: 0 })).toMatchObject({ kind: 'defective', value: 0 });
  expect(eigenDirections(preset('identity'))).toEqual({ kind: 'all', value: 1, directions: [] });
  expect(eigenDirections(preset('zero'))).toEqual({ kind: 'all', value: 0, directions: [] });
  expect(eigenDirections({ a: -2, b: 0, c: 0, d: -2 })).toEqual({ kind: 'all', value: -2, directions: [] });

  const matrices: Mat2[] = MATRIX_PRESETS.map((item) => item.matrix);
  for (const a of [-2, -1, 0, 1, 2]) {
    for (const b of [-1, 0, 1]) {
      for (const c of [-1, 0, 1]) {
        for (const d of [-2, -1, 0, 1, 2]) matrices.push({ a, b, c, d });
      }
    }
  }
  for (const matrix of matrices) {
    expectVector(transform(matrix, { x: 1, y: 0 }), { x: matrix.a, y: matrix.c });
    expectVector(transform(matrix, { x: 0, y: 1 }), { x: matrix.b, y: matrix.d });
    expect(determinant(matrix)).toBe(matrix.a * matrix.d - matrix.b * matrix.c);
    const eigen = eigenDirections(matrix);
    const discriminant = (matrix.a - matrix.d) ** 2 + 4 * matrix.b * matrix.c;
    expect(eigen.kind === 'complex').toBe(discriminant < 0);
    if (eigen.kind === 'all') {
      expectVector(transform(matrix, { x: 1.2, y: -0.7 }), scaleVector({ x: 1.2, y: -0.7 }, eigen.value));
    }
    for (const line of eigen.directions) {
      expect(length(line.direction)).toBeCloseTo(1, 12);
      expect(length(subtract(transform(matrix, line.direction), scaleVector(line.direction, line.value)))).toBeLessThan(1e-10);
    }
  }
});

test('dot products and projections preserve their invariants and explain zero vectors', () => {
  const source = { x: 2, y: 2 };
  const direction = { x: 2, y: 1 };
  const result = project(source, direction);
  expect(result.dot).toBe(6);
  expectVector(result.projected!, { x: 2.4, y: 1.2 });
  expectVector(result.residual!, { x: -0.4, y: 0.8 });
  expect(result.coefficient).toBeCloseTo(1.2, 12);
  expect(result.cosine).toBeCloseTo(3 / Math.sqrt(10), 12);
  expect(result.angleDegrees).toBeCloseTo(18.4349488229, 9);
  expect(dot(result.residual!, direction)).toBeCloseTo(0, 12);
  for (const amount of [-3, -0.01, 0.01, 2]) {
    const next = project(source, scaleVector(direction, amount));
    expectVector(next.projected!, result.projected!);
    expect(next.dot).toBeCloseTo(6 * amount, 12);
  }
  const perpendicular = project({ x: -1, y: 2 }, direction);
  expectVector(perpendicular.projected!, { x: 0, y: 0 });
  expect(perpendicular.dot).toBe(0);
  expect(perpendicular.angleDegrees).toBe(90);
  const opposite = project({ x: -2, y: -1 }, direction);
  expect(opposite.cosine).toBe(-1);
  expect(opposite.angleDegrees).toBe(180);
  expectVector(opposite.projected!, { x: -2, y: -1 });
  expect(project(source, { x: 0, y: 0 })).toMatchObject({
    dot: 0, projected: null, residual: null, cosine: null, angleDegrees: null, coefficient: null,
  });
  const zeroSource = project({ x: 0, y: 0 }, direction);
  expectVector(zeroSource.projected!, { x: 0, y: 0 });
  expect(zeroSource.cosine).toBeNull();
  expect(zeroSource.angleDegrees).toBeNull();
  expectVector(project(source, { x: 1e-12, y: 0 }).projected!, { x: 2, y: 0 });
  expect(projectionMatrix({ x: 0, y: 0 })).toBeNull();
  for (const d of [direction, { x: -1, y: 3 }, { x: 0, y: 1 }, { x: 1, y: 0 }]) {
    const matrix = projectionMatrix(d)!;
    const projected = transform(matrix, source);
    expect(matrix.b).toBe(matrix.c);
    expect(matrix.a + matrix.d).toBeCloseTo(1, 12);
    expect(analyzeMatrix(matrix).rank).toBe(1);
    expectVector(projected, project(source, d).projected!);
    expectVector(transform(matrix, projected), projected);
    const eigen = eigenDirections(matrix);
    expect(eigen.kind).toBe('distinct');
    expect(eigen.directions[0]?.value).toBeCloseTo(1, 12);
    expect(eigen.directions[1]?.value).toBeCloseTo(0, 12);
  }
  expect(formatNumber(-0)).toBe('0');
  expect(formatNumber(1e-9)).toBe('1e-9');
});

test('vector-playground: nearby endpoints keep distinct pointer targets after resizing', async ({ page }) => {
  await page.goto('./projects/vector-playground/');
  const root = page.locator('.project-vector-playground');
  await expect(root.locator('.vp-svg')).toBeVisible();
  for (const size of [{ width: 1440, height: 900 }, { width: 320, height: 640 }, { width: 768, height: 480 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => root.locator('[data-vp-handle]:visible').evaluateAll(handles => handles.every(handle => {
      const grip = handle.querySelector('.vp-grip')!.getBoundingClientRect();
      return handle.contains(document.elementFromPoint(grip.x + grip.width / 2, grip.y + grip.height / 2));
    }))).toBe(true);
    const tip = root.locator('[data-vp-handle="basis-x"]');
    const grip = (await tip.locator('.vp-grip').boundingBox())!;
    const unit = Number(await root.locator('.vp-svg').getAttribute('data-unit'));
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + unit * 0.5, grip.y + grip.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(root.locator('[data-vp-number="a"]')).toHaveValue('1.5');
    await expect(root.locator('[data-vp-number="b"]')).toHaveValue('0.75');
    await expect(root.locator('[data-vp-number="c"]')).toHaveValue('0');
    await expect(tip).toBeFocused();
    await root.getByRole('button', { name: 'Reset both labs' }).click();
  }
});

test('the workbench really changes, stays honest and keyboard-accessible, and fits 375px', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./projects/vector-playground/');
  const root = page.locator('.project-vector-playground');
  const diagram = root.locator('.vp-svg');
  const reading = (index: number) => root.locator(`[data-vp-reading="${index}"]`);
  const number = (key: string) => root.locator(`[data-vp-number="${key}"]`);
  const preset = root.getByRole('combobox', { name: 'Transformation', exact: true });
  await expect(root.getByRole('heading', { name: 'Vector Playground', exact: true })).toBeVisible();
  await expect(reading(0)).toHaveText('+1');
  await expect(reading(2)).toHaveText('(2.75, 1)');
  await expect(root.locator('[data-vp-eigen-title]')).toContainText('One eigen-direction');
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(300);
  expect((await diagram.boundingBox())!.y).toBeLessThan(300);
  const originalPavilion = await root.locator('[data-vp-pavilion]').getAttribute('d');
  await page.screenshot({ fullPage: true, path: relative(process.cwd(), testInfo.outputPath('vector-playground-desktop.png')) });

  await preset.selectOption('rotation');
  await expect(reading(2)).toHaveText('(-1, 2)');
  await expect(root.locator('[data-vp-eigen-title]')).toHaveText('No real eigen-directions');
  await expect(root.locator('[data-vp-eigen-description]')).toContainText('complex');
  await expect(root.locator('[data-vp-eigen-line]')).toHaveCount(0);
  expect(await root.locator('[data-vp-pavilion]').getAttribute('d')).not.toBe(originalPavilion);
  await preset.selectOption('reflection');
  await expect(reading(0)).toHaveText('-1');
  await expect(reading(1)).toHaveText('Reflected');
  await preset.selectOption('projection');
  await expect(root).toHaveAttribute('data-rank', '1');
  await expect(root.locator('[data-vp-eigen-title]')).toHaveText('Two real eigen-directions');
  await expect(root.locator('[data-vp-eigen-line]')).toHaveCount(2);
  for (const [key, value] of [['a', '1'], ['b', '2'], ['c', '0'], ['d', '0']]) await number(key).fill(value);
  await expect(reading(2)).toHaveText('(4, 0)');
  await expect(root).toHaveAttribute('data-rank', '1');
  await expect(preset).toHaveValue('custom');
  const firstTip = root.locator('[data-vp-handle="basis-x"]');
  await firstTip.focus();
  await firstTip.press('ArrowUp');
  await expect(number('c')).toHaveValue('0.1');
  await expect(firstTip).toBeFocused();
  await expect(reading(0)).toHaveText('-0.2');
  const grip = (await firstTip.locator('.vp-grip').boundingBox())!;
  const unit = Number(await diagram.getAttribute('data-unit'));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + unit * 0.5, grip.y + grip.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(number('a')).toHaveValue('1.5');
  await firstTip.press('Enter');
  await expect(number('a')).toBeFocused();
  await number('a').fill('9');
  await expect(number('a')).toHaveAttribute('aria-invalid', 'true');
  await expect(root.locator('[data-vp-validation]')).toBeVisible();
  await number('a').press('Tab');
  await expect(number('a')).toHaveValue('1.5');
  await number('vector-x').focus();
  await number('vector-x').press('ArrowUp');
  await expect(number('vector-x')).toHaveValue('2.1');

  await root.getByRole('button', { name: 'Dot & projection', exact: true }).click();
  await expect(reading(0)).toHaveText('6');
  await expect(reading(1)).toHaveText('(2.4, 1.2)');
  await page.screenshot({ fullPage: true, path: relative(process.cwd(), testInfo.outputPath('vector-playground-projection.png')) });
  await number('source-x').fill('-1');
  await number('source-y').fill('2');
  await expect(reading(0)).toHaveText('0');
  await expect(reading(1)).toHaveText('(0, 0)');
  await number('direction-x').fill('0');
  await number('direction-y').fill('0');
  await expect(reading(0)).toHaveText('0');
  await expect(reading(1)).toHaveText('Undefined');
  await expect(reading(2)).toHaveText('Undefined');
  await expect(root.locator('[data-vp-projection-explanation]')).toContainText('zero does not define a line');
  await expect(root.locator('.vp-projection-line, [data-vp-residual], .vp-arrow.vp-gold')).toHaveCount(0);
  await expect(root.getByRole('button', { name: 'Make this projection A' })).toBeDisabled();
  await root.getByRole('combobox', { name: 'A starting angle' }).selectOption('opposite');
  await expect(reading(0)).toHaveText('-5');
  await expect(reading(2)).toHaveText('-1');
  await root.getByRole('button', { name: 'Make this projection A' }).click();
  await expect(root).toHaveAttribute('data-mode', 'transform');
  await expect(root).toHaveAttribute('data-rank', '1');
  await expect(reading(2)).toHaveText('(-2, -1)');
  await preset.selectOption('zero');
  await expect(root).toHaveAttribute('data-rank', '0');
  await expect(reading(1)).toHaveText('Collapsed');
  await expect(reading(2)).toHaveText('(0, 0)');
  await expect(root.locator('[data-vp-eigen-title]')).toHaveText('Every direction · λ = 0');
  await expect(root.locator('[data-vp-eigen-line]')).toHaveCount(0);
  await root.getByRole('tab', { name: 'Guide', exact: true }).click();
  await root.getByRole('button', { name: 'Try the rank-one challenge' }).click();
  await expect(number('d')).toBeFocused();
  await number('d').fill('0');
  await expect(root.locator('[data-vp-challenge-status]')).toContainText('Solved: rank 1');
  await root.getByRole('button', { name: 'Reset both labs' }).click();
  await expect(reading(0)).toHaveText('+1');
  await expect(reading(2)).toHaveText('(2.75, 1)');
  await root.getByRole('tab', { name: 'Readout', exact: true }).click();
  await root.getByRole('checkbox', { name: 'Show eigen-directions' }).uncheck();
  await expect(root.locator('[data-vp-eigen-line]')).toHaveCount(0);
  await root.getByRole('checkbox', { name: 'Show eigen-directions' }).check();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./projects/vector-playground/');
  await expect(reading(0)).toHaveText('+1');
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(300);
  expect((await diagram.boundingBox())!.y).toBeLessThan(300);
  expect((await diagram.boundingBox())!.height).toBeGreaterThan(340);
  await page.screenshot({ fullPage: true, path: relative(process.cwd(), testInfo.outputPath('vector-playground-mobile.png')) });
  for (const control of await root.locator('button:visible, select:visible, input[type="number"]:visible, .vp-check:visible, summary:visible, a:visible').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await firstTip.focus();
  await firstTip.press('ArrowRight');
  await expect(number('a')).toHaveValue('1.1');
  await expect(reading(2)).toHaveText('(2.95, 1)');
  await firstTip.press('Shift+ArrowUp');
  await expect(number('c')).toHaveValue('0.5');
  await firstTip.press('Enter');
  await expect(number('a')).toBeFocused();
  await number('a').press('Shift+ArrowDown');
  await expect(number('a')).toHaveValue('0.6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(root.locator('.vp-ai-note')).toContainText('not learned meanings');

  const lifecycle = await page.evaluate(async () => {
    const modulePath = '/src/projects/vector-playground/index.ts';
    const { mount } = await import(modulePath);
    const NativeObserver = window.ResizeObserver;
    let observers = 0;
    class TrackedObserver extends NativeObserver {
      private connected = true;
      constructor(callback: ResizeObserverCallback) { super(callback); observers++; }
      override disconnect() {
        if (this.connected) observers--;
        this.connected = false;
        super.disconnect();
      }
    }
    window.ResizeObserver = TrackedObserver;
    const host = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(host, controls);
    const controller = new AbortController();
    const reports: string[] = [];
    try {
      const instance = mount({
        container: host, controls, signal: controller.signal, reducedMotion: true,
        report: (message: string) => reports.push(message),
      });
      const site = host.querySelector<HTMLElement>('.project-vector-playground')!;
      const tip = site.querySelector<SVGGElement>('[data-vp-handle="basis-x"]')!;
      const select = site.querySelector<HTMLSelectElement>('[data-vp-preset]')!;
      const observedBefore = observers;
      controller.abort();
      instance.destroy();
      instance.destroy();
      instance.reset();
      tip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      select.value = 'rotation';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { observedBefore, observers, removed: host.childElementCount === 0, reports: reports.length };
    } finally {
      controller.abort();
      host.remove();
      controls.remove();
      window.ResizeObserver = NativeObserver;
    }
  });
  expect(lifecycle).toEqual({ observedBefore: 1, observers: 0, removed: true, reports: 0 });
  expect(errors).toEqual([]);
});
