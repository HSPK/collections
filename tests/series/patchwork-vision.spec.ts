import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { BACKGROUND, PATCH_COUNT, SCENES, TILE_SIZE } from '../../src/projects/patchwork-vision/data';
import { cosine, extractFeatures, maskedSoftmax, matchImage, normalize, parseDescriptor, rasterizePatch } from '../../src/projects/patchwork-vision/engine';
import type { Descriptor, Patch } from '../../src/projects/patchwork-vision/types';

function descriptor(text: string): Descriptor {
  const parsed = parseDescriptor(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.descriptor;
}

test('pixel extraction, fixed dictionaries, and exact vector arithmetic are inspectable', () => {
  const redSquare = extractFeatures(rasterizePatch({ color: 'red', shape: 'square' }));
  expect(redSquare.coverage).toBe(400 / (TILE_SIZE * TILE_SIZE));
  expect(redSquare.features.slice(0, 4)).toEqual([1, 0, 0, 0]);
  expect(redSquare.affinities[1]).toBe(1);
  expect(redSquare.features[5]).toBeGreaterThan(0.99);
  expect(Math.hypot(...redSquare.unit)).toBeCloseTo(1, 13);
  const circlePixels = rasterizePatch({ color: 'red', shape: 'circle' });
  const original = extractFeatures(circlePixels);
  expect(original.coverage).toBe(316 / (TILE_SIZE * TILE_SIZE));
  for (let offset = 0; offset < circlePixels.length; offset += 4) {
    if (circlePixels[offset] !== BACKGROUND[0]) circlePixels.set([53, 100, 201], offset);
  }
  const repainted = extractFeatures(circlePixels);
  expect(repainted.features.slice(0, 4)).toEqual([0, 1, 0, 0]);
  expect(repainted.affinities).toEqual(original.affinities);
  const text = descriptor('a red circle');
  expect(text.features).toEqual([1, 0, 0, 0, 1, 0, 0]);
  expect(cosine(original.unit, text.unit)! - cosine(repainted.unit, text.unit)!).toBeCloseTo(0.5, 13);
  expect(cosine([3, 4], [4, -3])).toBeCloseTo(0, 14);
  expect(cosine([1e300, 1e300], [1, 1])).toBeCloseTo(1, 14);
  expect(cosine([1e-300, 1e-300], [1, 1])).toBeCloseTo(1, 14);
  expect(cosine([0, 0], [1, 0])).toBeNull();
  expect(normalize([0, 0])).toEqual([0, 0]);
  expect(() => cosine([1], [1, 2])).toThrow(RangeError);
  expect(() => normalize([Infinity, 1])).toThrow(RangeError);
  for (const phrase of ['cat', 'not red', 'red circle on the left', 'red blue square', 'circle triangle', '']) {
    expect(parseDescriptor(phrase).ok, phrase).toBe(false);
  }
  expect(parseDescriptor('circle').ok).toBe(true);
  expect(parseDescriptor('teal shape').ok).toBe(true);
  circlePixels[0] = 1;
  expect(() => extractFeatures(circlePixels)).toThrow('paint colors');
});

test('masked attention normalizes, rejects invalid inputs, and cannot invent position', () => {
  const stable = maskedSoftmax([10000, 10001, -10000], [true, true, false], 1);
  expect(stable[0]).toBeCloseTo(1 / (1 + Math.E), 14);
  expect(stable[1]).toBeCloseTo(Math.E / (1 + Math.E), 14);
  expect(stable[2]).toBe(0);
  expect(stable.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 14);
  expect(maskedSoftmax([1e308, -1e308], [true, true], Number.MIN_VALUE)).toEqual([1, 0]);
  expect(() => maskedSoftmax([1], [true], 0)).toThrow(RangeError);
  expect(() => maskedSoftmax([1], [], 1)).toThrow(RangeError);
  const empty: Patch[] = Array.from({ length: PATCH_COUNT }, () => ({ color: 'red', shape: 'empty' }));
  const text = descriptor('red circle');
  const noImage = matchImage(empty, text, 0.1);
  expect(noImage.cosine).toBeNull();
  expect(noImage.meanCosine).toBeNull();
  expect(noImage.weights).toEqual(Array(PATCH_COUNT).fill(0));
  expect(noImage.pooled).toEqual(Array(7).fill(0));
  const identical = empty.map((patch, index): Patch =>
    index < 3 ? { color: 'red', shape: 'circle' } : patch);
  const repeated = matchImage(identical, text, 0.05);
  expect(repeated.activeCount).toBe(3);
  expect(repeated.weights.slice(0, 3)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  expect(repeated.weights.slice(3)).toEqual(Array(13).fill(0));
  expect(repeated.entropy).toBeCloseTo(Math.log2(3), 13);
  for (const pooling of ['attention', 'mean'] as const) {
    const original = matchImage(SCENES[0].patches, text, 0.05, pooling);
    const flipped = matchImage([...SCENES[0].patches].reverse(), text, 0.05, pooling);
    expect(flipped.cosine).toBeCloseTo(original.cosine!, 13);
    flipped.weights.forEach((weight, index) => {
      expect(weight).toBeCloseTo(original.weights[PATCH_COUNT - 1 - index], 13);
    });
    expect(original.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 13);
    expect(original.contributions.every((vector) => vector.every(Number.isFinite))).toBe(true);
  }
  const focused = matchImage(SCENES[0].patches, text, 0.05);
  const uniform = matchImage(SCENES[0].patches, text, 0.05, 'mean');
  expect(focused.cosine!).toBeGreaterThan(uniform.cosine!);
  expect(focused.entropy).toBeLessThan(uniform.entropy);
});

test('patchwork-vision: native vocabulary disclosure hides closed controls and applies real edits', async ({ page }, info) => {
  await page.goto('./projects/patchwork-vision/');
  const root = page.locator('.project-patchwork-vision');
  const details = root.locator('.pw-vocabulary');
  const color = root.locator('[data-text-color]');
  const shape = root.locator('[data-text-shape]');
  await expect(color).toHaveCount(1);
  await expect(shape).toHaveCount(1);
  for (const size of [{ width: 1440, height: 900 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    await root.getByRole('button', { name: 'red circle', exact: true }).click();
    await expect(details).not.toHaveAttribute('open');
    await expect(color).toBeHidden();
    await expect(shape).toBeHidden();
    const closed = await color.evaluate(control => ({
      closed: control.closest('details')?.open === false,
      rendered: control.checkVisibility(),
      rect: control.getBoundingClientRect().toJSON(),
    }));
    expect(closed.closed).toBe(true);
    expect(closed.rendered).toBe(false);
    await details.locator('summary').click();
    await expect(color).toBeVisible();
    await expect(color).toHaveAccessibleName('Descriptor color');
    await expect(shape).toHaveAccessibleName('Descriptor shape');
    const pickers: { id: string; hitId: string | null; hitTag: string | null; pointerTarget: string | null; nativeOpen: boolean }[] = [];
    for (const picker of [color, shape]) {
      await picker.scrollIntoViewIfNeeded();
      const hit = await picker.evaluate(control => {
        const box = control.getBoundingClientRect();
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        control.addEventListener('pointerdown', event => {
          if (event.target instanceof Element) control.setAttribute('data-pointer-target', event.target.id);
        }, { once: true });
        return { id: control.id, hitId: target?.id ?? null, hitTag: target?.tagName ?? null };
      });
      expect(hit.hitTag).toBe('SELECT');
      expect(hit.hitId).toBe(hit.id);
      await picker.click();
      await expect(picker).toBeFocused();
      await expect(picker).toHaveAttribute('data-pointer-target', hit.id);
      await expect.poll(() => picker.evaluate(control => control.matches(':open'))).toBe(true);
      pickers.push({ ...hit, pointerTarget: await picker.getAttribute('data-pointer-target'), nativeOpen: true });
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect.poll(() => picker.evaluate(control => control.matches(':open'))).toBe(false);
    }
    await expect(color).toHaveValue('blue');
    await expect(shape).toHaveValue('square');
    await expect(root).toHaveAttribute('data-descriptor', 'blue square');
    await expect(root.locator('[data-query-message]')).toHaveText('Fixed dictionary mapping, not language understanding.');
    await page.screenshot({ path: info.outputPath(`vocabulary-pointer-${size.width}x${size.height}.png`) });
    await writeFile(info.outputPath(`vocabulary-pointer-${size.width}x${size.height}.json`), JSON.stringify({ size, closed, pickers }, null, 2));
    await details.locator('summary').click();
    await expect(color).toBeHidden();
    await expect(shape).toBeHidden();
    await expect(root).toHaveAttribute('data-descriptor', 'blue square');
  }
});

test('the responsive pixel bench changes real scores, refuses unsupported text, and disposes cleanly', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('./projects/patchwork-vision/');
  const root = page.locator('.project-patchwork-vision');
  const panel = (name: string) => root.getByRole('tab', { name, exact: true });
  await expect(root.getByRole('heading', { name: 'Patchwork Vision', exact: true })).toBeVisible();
  await expect(root).toHaveAttribute('data-descriptor', 'red circle');
  await expect(root.locator('.pw-model-stamp')).toContainText('No learned weights');
  expect((await root.locator('[data-image]').boundingBox())!.y).toBeLessThan(300);
  const originalPatchScore = Number(await root.locator('[data-patch-cosine]').textContent());
  await root.getByRole('combobox', { name: 'Patch color', exact: true }).selectOption('blue');
  await expect(root.locator('[data-feature-value="0"]')).toHaveText('0.000');
  await expect(root.locator('[data-feature-value="1"]')).toHaveText('1.000');
  expect(Number(await root.locator('[data-patch-cosine]').textContent())).toBeCloseTo(originalPatchScore - 0.5, 3);
  const editedScore = Number(await root.getAttribute('data-score'));
  const editedPixels = await root.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await panel('Image').click();
  await root.getByRole('button', { name: 'Flip arrangement', exact: true }).click();
  expect(Number(await root.getAttribute('data-score'))).toBeCloseTo(editedScore, 11);
  await expect(root).toHaveAttribute('data-selected', '16');
  await root.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(root).toHaveAttribute('data-selected', '1');
  expect(await root.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(editedPixels);
  await panel('Match').click();
  await root.getByLabel('Text descriptor', { exact: true }).fill('red circle on the left');
  await expect(root.getByLabel('Text descriptor', { exact: true })).toBeFocused();
  await expect(root).toHaveAttribute('data-descriptor', 'unsupported');
  await expect(root.locator('[data-score]')).toHaveText('n/a');
  await expect(root.locator('[data-query-message]')).toContainText('Unsupported words');
  await expect(root.locator('[data-export]')).toBeDisabled();
  await root.getByRole('button', { name: 'gold triangle', exact: true }).click();
  await expect(root).toHaveAttribute('data-descriptor', 'gold triangle');
  await root.getByRole('combobox', { name: 'Pool the visual tokens', exact: true }).selectOption('mean');
  await expect(root.getByRole('slider')).toBeDisabled();
  await expect(root.locator('[data-score-label]')).toHaveText('Mean-pooled cosine');
  await panel('Image').click();
  await root.getByRole('button', { name: 'Clear image', exact: true }).click();
  await expect(root).toHaveAttribute('data-active', '0');
  await expect(root.locator('[data-score-note]')).toContainText('No occupied patches');
  await expect(root.locator('[data-score]')).toHaveText('n/a');
  await root.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(root).toHaveAttribute('data-active', '11');
  await root.getByRole('button', { name: 'Reset image', exact: true }).click();
  await panel('Match').click();
  await root.getByRole('button', { name: 'red circle', exact: true }).click();
  await root.getByRole('combobox', { name: 'Pool the visual tokens', exact: true }).selectOption('attention');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('patchwork-desktop.png') });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => scrollTo(0, 0));
  expect((await root.locator('[data-image]').boundingBox())!.y).toBeLessThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(root.locator('.pw-model-stamp strong')).toBeVisible();
  await root.locator('[data-patch="0"]').focus();
  await root.locator('[data-patch="0"]').press('ArrowRight');
  await expect(root).toHaveAttribute('data-selected', '2');
  await expect(root.locator('[data-patch="1"]')).toBeFocused();
  await root.locator('[data-patch="5"]').click();
  await expect(root).toHaveAttribute('data-selected', '6');
  await panel('Token').click();
  await expect(root.locator('[data-selected-title]')).toHaveText('Patch 06');
  await expect(root.getByRole('region', { name: 'Read the token', exact: false })).toBeVisible();
  await root.locator('[data-patch="1"]').focus();
  await root.locator('[data-patch="1"]').press('End');
  await expect(root).toHaveAttribute('data-selected', '16');
  for (const selector of ['[data-reset]', '[data-color]', '[data-shape]', '[data-patch="0"]']) {
    expect((await root.locator(selector).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('patchwork-mobile.png') });

  const cleanup = await page.evaluate(async () => {
    const source = '/src/projects/patchwork-vision/index.ts';
    const { mount } = await import(source);
    const host = document.createElement('div');
    host.style.width = '700px';
    document.body.append(host);
    const controller = new AbortController();
    const OriginalObserver = window.ResizeObserver;
    const observers = new Set<ResizeObserver>();
    window.ResizeObserver = class extends OriginalObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    const reports: string[] = [];
    try {
      const instance = mount({
        container: host, controls: document.createElement('div'), signal: controller.signal,
        reducedMotion: true, report: (message: string) => reports.push(message),
      });
      const before = observers.size;
      const button = host.querySelector<HTMLButtonElement>('[data-clear]')!;
      controller.abort();
      instance.destroy();
      instance.reset();
      button.click();
      return { before, observers: observers.size, children: host.childElementCount, reports: reports.length };
    } finally {
      controller.abort();
      window.ResizeObserver = OriginalObserver;
      host.remove();
    }
  });
  expect(cleanup).toEqual({ before: 1, observers: 0, children: 0, reports: 0 });
  expect(errors).toEqual([]);
});
