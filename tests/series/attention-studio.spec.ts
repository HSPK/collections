import { expect, test } from '@playwright/test';
import { relative } from 'node:path';
import { attentionFromQKV, runAttention, weightedContributions } from '../../src/projects/attention-studio/attention';
import { PRESETS } from '../../src/projects/attention-studio/data';
import { dot, multiply, stableSoftmax, transpose } from '../../src/projects/attention-studio/tensor';

test('Attention Studio: row-vector projections, scores and weighted values match hand calculations', () => {
  const embeddings = [[1, 2, 3], [-1, 0, 2]];
  const projections = {
    q: [[1, 0], [0, 1], [1, -1]],
    k: [[1, 1], [2, 0], [0, 1]],
    v: [[1, 0], [0, 1], [1, 1]],
  };
  const original = JSON.stringify({ embeddings, projections });
  const result = runAttention(embeddings, projections);
  expect(transpose(embeddings)).toEqual([[1, -1], [2, 0], [3, 2]]);
  expect(multiply(embeddings, projections.q)).toEqual([[4, -1], [1, -2]]);
  expect(result.queries).toEqual([[4, -1], [1, -2]]);
  expect(result.keys).toEqual([[5, 4], [-1, 1]]);
  expect(result.values).toEqual([[4, 5], [1, 2]]);
  expect(result.modelDimensions).toBe(3);
  expect(result.keyDimensions).toBe(2);
  expect(result.dotProducts).toEqual([[16, -5], [-3, -3]]);
  expect(result.scores[0][0]).toBeCloseTo(16 / Math.sqrt(2), 12);
  expect(result.scores[0][1]).toBeCloseTo(-5 / Math.sqrt(2), 12);
  const firstWeight = 1 / (1 + Math.exp(-21 / Math.sqrt(2)));
  expect(result.weights[0][0]).toBeCloseTo(firstWeight, 14);
  expect(result.outputs[0][0]).toBeCloseTo(4 * firstWeight + 1 - firstWeight, 12);
  expect(result.outputs[0][1]).toBeCloseTo(5 * firstWeight + 2 * (1 - firstWeight), 12);
  expect(result.weights[1]).toEqual([0.5, 0.5]);
  expect(weightedContributions(result, 1)).toEqual([[2, 2.5], [0.5, 1]]);
  expect(result.outputs[1]).toEqual([2.5, 3.5]);
  expect(dot([-2, 3], [4, -1])).toBe(-11);
  expect(JSON.stringify({ embeddings, projections })).toBe(original);
  expect(() => multiply([[1, 2]], [[1, 2]])).toThrow(/inner dimensions/);
  expect(() => multiply([[1], [1, 2]], [[1]])).toThrow(/rectangular/);
  expect(() => attentionFromQKV([[1, 2]], [[1]], [[1]])).toThrow(/same dimension/);
  expect(() => attentionFromQKV([[1], [2]], [[1]], [[1]])).toThrow(/same token count/);
  expect(() => dot([1e308], [1e308])).toThrow(/overflowed/);
});

test('Attention Studio: causal rows normalize, zero queries average, and finite large logits stay stable', () => {
  for (const preset of PRESETS) {
    for (const causal of [false, true]) {
      for (const embeddings of [
        preset.embeddings,
        [[-1000, 1000, 0], [0, -1000, 1000], [1000, 0, -1000], [-1000, -1000, 1000]],
      ]) {
        const result = runAttention(embeddings, preset.projections, causal);
        for (let row = 0; row < result.weights.length; row += 1) {
          expect(result.weights[row].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 14);
          for (let key = 0; key < result.keys.length; key += 1) {
            const weight = result.weights[row][key];
            expect(Number.isFinite(weight)).toBe(true);
            expect(weight).toBeGreaterThanOrEqual(0);
            expect(weight).toBeLessThanOrEqual(1);
            if (causal && key > row) {
              expect(weight).toBe(0);
              expect(result.maskedScores[row][key]).toBe(-Infinity);
              expect(weightedContributions(result, row)[key].every((value) => value === 0)).toBe(true);
            }
          }
          result.outputs[row].forEach((coordinate, column) => {
            const allowed = result.values.filter((_, key) => !causal || key <= row).map((value) => value[column]);
            expect(Number.isFinite(coordinate)).toBe(true);
            expect(coordinate).toBeGreaterThanOrEqual(Math.min(...allowed) - 1e-9);
            expect(coordinate).toBeLessThanOrEqual(Math.max(...allowed) + 1e-9);
            expect(weightedContributions(result, row).reduce((sum, value) => sum + value[column], 0)).toBeCloseTo(coordinate, 12);
          });
        }
      }
    }
  }
  const averages = attentionFromQKV(
    [[0, 0], [0, 0], [0, 0], [0, 0]],
    [[1, 0], [0, 1], [-1, 0], [0, -1]],
    [[2, 4], [4, 8], [6, 12], [8, 16]],
    true,
  );
  expect(averages.weights[0]).toEqual([1, 0, 0, 0]);
  expect(averages.outputs).toEqual([[2, 4], [3, 6], [4, 8], [5, 10]]);
  expect(stableSoftmax([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  expect(stableSoftmax([1e308, 1e308, -1e308])).toEqual([0.5, 0.5, 0]);
  expect(stableSoftmax([-1e300, -1e300])).toEqual([0.5, 0.5]);
  expect(stableSoftmax([-1000, 0, 1000], [true, true, false])).toEqual([0, 1, 0]);
  expect(stableSoftmax([-5, 0, 5], [false, true, false])).toEqual([0, 1, 0]);
  stableSoftmax([10001, 10002, 10003]).forEach((weight, index) => {
    expect(weight).toBeCloseTo(stableSoftmax([1, 2, 3])[index], 14);
  });
  const large = attentionFromQKV(
    [[1e150, 0], [0, -1e150]], [[1e150, 0], [0, -1e150]], [[1, -2], [-3, 4]],
  );
  expect(large.weights).toEqual([[1, 0], [0, 1]]);
  expect(large.outputs).toEqual([[1, -2], [-3, 4]]);
  expect(() => stableSoftmax([0, 1], [false, false])).toThrow(/unmasked/);
  expect(() => stableSoftmax([0, Infinity])).toThrow(/finite/);
  expect(() => stableSoftmax([NaN])).toThrow(/finite/);
  expect(() => stableSoftmax([0, 1], [true])).toThrow(/match/);
});

test('Attention Studio: real edits, numeric stages, challenge and keyboard controls work at desktop and 375px', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/attention-studio/');
  const root = page.locator('.project-attention-studio');
  const panel = (name: string) => root.getByRole('tab', { name, exact: true });
  await expect(root).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attention Studio', exact: true })).toBeVisible();
  await expect(root.locator('.as-model-stamp')).toContainText('Hand-authored toy weights');
  await expect(root.locator('.as-model-stamp')).toContainText('Untrained single head');
  await expect(root.locator('.as-notes')).toContainText('not learned semantic intelligence or a production LLM');
  const heatmapBounds = await root.locator('.as-heatmap').boundingBox();
  expect(heatmapBounds).not.toBeNull();
  expect(heatmapBounds?.y).toBeLessThan(300);
  const cell = (row: number, key: number) => root.locator(`[data-cell-row="${row}"][data-cell-key="${key}"]`);
  expect((await cell(0, 0).boundingBox())?.y).toBeLessThanOrEqual(300);
  const output = root.locator('[data-selected-output]');
  const embedding = page.getByRole('spinbutton', { name: 'Embedding moss e1', exact: true });
  const initialWeight = await cell(0, 1).getAttribute('data-weight');
  const initialColor = await cell(0, 1).getAttribute('style');
  const initialOutput = await output.getAttribute('data-values');
  await embedding.fill('4');
  await expect(embedding).toBeFocused();
  await expect(cell(0, 1)).not.toHaveAttribute('data-weight', initialWeight ?? '');
  await expect(cell(0, 1)).not.toHaveAttribute('style', initialColor ?? '');
  await expect(output).not.toHaveAttribute('data-values', initialOutput ?? '');
  const changed = PRESETS[0].embeddings.map((row) => [...row]);
  changed[1][0] = 4;
  const expected = runAttention(changed, PRESETS[0].projections);
  expect(Number(await cell(0, 1).getAttribute('data-weight'))).toBeCloseTo(expected.weights[0][1], 14);
  await expect(cell(0, 1).locator('[data-cell-weight]')).toHaveText(expected.weights[0][1].toFixed(3));
  await expect(output).toHaveAttribute('data-values', JSON.stringify(expected.outputs[0]));
  await expect(root.locator('[data-dot-equation]')).toContainText('(2 × 4) + (0 × 0.5) ≈ 8');

  const snapshot = await root.locator('[data-cell-weight]').allTextContents();
  const beforeValueEdit = await output.getAttribute('data-values');
  await page.getByRole('spinbutton', { name: 'Embedding moss e3', exact: true }).fill('5');
  expect(await root.locator('[data-cell-weight]').allTextContents()).toEqual(snapshot);
  await expect(output).not.toHaveAttribute('data-values', beforeValueEdit ?? '');
  const beforeInvalid = await output.getAttribute('data-values');
  await embedding.fill('1001');
  await expect(embedding).toHaveAttribute('aria-invalid', 'true');
  await expect(output).toHaveAttribute('data-values', beforeInvalid ?? '');
  await embedding.press('Escape');
  await expect(embedding).toHaveValue('4');
  await expect(embedding).not.toHaveAttribute('aria-invalid');
  await embedding.fill('');
  await expect(embedding).toHaveAttribute('aria-invalid', 'true');
  await embedding.press('Escape');
  await expect(embedding).toHaveValue('4');
  await panel('Calculation').click();
  await root.locator('[data-step="softmax"]').click();
  await expect(root).toHaveAttribute('data-pipeline-stage', 'softmax');
  await expect(root.locator('[data-stage-calculation]')).toContainText('1.000000000000');
  await expect(root.locator('[data-stage-heading]')).toHaveText('Subtract the maximum. Then normalize.');
  await root.locator('[data-step="mask"]').click();
  await page.getByRole('checkbox', { name: 'Causal mask', exact: true }).check();
  await expect(cell(0, 1)).toHaveAttribute('data-weight', '0');
  await expect(cell(0, 0)).toHaveAttribute('data-weight', '1');
  await expect(cell(0, 1)).toHaveAttribute('data-masked', 'true');
  await expect(root.locator('[data-stage-calculation]')).toContainText('−∞');
  await expect(root.locator('[data-contribution-caption]')).toContainText('exactly [0, 0]');
  await expect(output).toHaveAttribute('data-values', '[2.5,-0.5]');
  await cell(0, 1).focus();
  await page.keyboard.press('ArrowDown');
  await expect(cell(1, 1)).toBeFocused();
  await expect(root.locator('[data-pair-name]')).toHaveText('query moss → key moss');
  await page.keyboard.press('Home');
  await expect(cell(1, 0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(cell(1, 3)).toBeFocused();
  await expect(cell(1, 3)).toHaveAttribute('data-masked', 'true');

  const preset = page.getByRole('combobox', { name: 'Experiment preset', exact: true });
  await preset.selectOption('rotation');
  expect(Number(await cell(1, 2).getAttribute('data-weight'))).toBeGreaterThan(0.8);
  await expect(page.getByRole('checkbox', { name: 'Causal mask', exact: true })).not.toBeChecked();
  await root.locator('[data-step="project"]').click();
  await expect(root.locator('[data-stage-calculation]')).toContainText('−2');
  await expect(root.locator('[data-projection-matrix="q"]')).toContainText('read-only');
  await preset.selectOption('prefix');
  await expect(root).toHaveAttribute('data-causal', 'true');
  await expect(cell(2, 3)).toHaveAttribute('data-weight', '0');
  await page.getByRole('checkbox', { name: 'Causal mask', exact: true }).uncheck();
  await expect(cell(0, 3)).toHaveAttribute('data-weight', '0.25');
  await page.getByRole('button', { name: 'Reset preset', exact: true }).click();
  await expect(root).toHaveAttribute('data-causal', 'true');
  await expect(cell(0, 3)).toHaveAttribute('data-weight', '0');

  await panel('Challenge').click();
  await page.getByRole('button', { name: 'Start routing challenge', exact: true }).click();
  await expect(panel('Embeddings')).toHaveAttribute('aria-selected', 'true');
  await expect(embedding).toBeFocused();
  await expect(root).toHaveAttribute('data-challenge', 'true');
  await embedding.fill('4');
  await expect(root).toHaveAttribute('data-challenge-solved', 'true');
  await expect(root.locator('[data-challenge-status]')).toContainText('Route found!');
  await page.getByRole('checkbox', { name: 'Causal mask', exact: true }).check();
  await expect(root).toHaveAttribute('data-challenge-solved', 'false');
  await expect(root.locator('[data-challenge-status]')).toContainText('future key');
  await page.getByRole('button', { name: 'Reset preset', exact: true }).click();
  await panel('Matrices').click();
  await root.locator('.as-ledger > summary').click();
  await expect(root.locator('[data-dot-matrix]')).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dismiss message', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('attention-studio-desktop.png')), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await root.locator('.as-heatmap').boundingBox())?.y).toBeLessThan(300);
  expect((await cell(0, 0).boundingBox())?.y).toBeLessThanOrEqual(300);
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('attention-studio-mobile.png')), fullPage: true });
  const sizes = await root.locator('button, select, input[type="number"], summary, .as-mask-toggle').evaluateAll((elements) =>
    elements.filter((element) => element.getClientRects().length > 0).map((element) => ({
      height: element.getBoundingClientRect().height,
      width: element.getBoundingClientRect().width,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    })));
  expect(sizes.every((size) => size.height >= 44 && size.width >= 44 && size.fontSize >= 12)).toBe(true);
  await panel('Embeddings').click();
  await embedding.focus();
  await embedding.press('ArrowUp');
  await expect(embedding).toHaveValue('2.5');
  await embedding.fill('-1000');
  expect(Number(await cell(0, 1).getAttribute('data-weight'))).toBe(0);
  await expect(output).not.toContainText(/NaN|Infinity/);
  const mask = page.getByRole('checkbox', { name: 'Causal mask', exact: true });
  await mask.focus();
  await page.keyboard.press('Space');
  await expect(mask).toBeChecked();
  await expect(cell(0, 1)).toHaveAttribute('data-weight', '0');
  await panel('Calculation').click();
  await root.locator('[data-step="mix"]').focus();
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-pipeline-stage', 'mix');
  await expect(root.locator('.as-contributions')).toBeVisible();
  await cell(0, 1).focus();
  await page.keyboard.press('ArrowRight');
  await expect(cell(0, 2)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const cleanup = await page.evaluate(async () => {
    const modulePath = '/src/projects/attention-studio/index.ts';
    const { mount } = await import(modulePath);
    const host = document.createElement('div');
    const controls = document.createElement('div');
    const controller = new AbortController();
    const notices: string[] = [];
    document.body.append(host, controls);
    try {
      const instance = mount({
        container: host, controls, signal: controller.signal, reducedMotion: false,
        report: (message: string) => notices.push(message),
      });
      const localRoot = host.querySelector<HTMLElement>('.project-attention-studio');
      const staleInput = host.querySelector<HTMLInputElement>('[data-embedding-row="1"][data-embedding-column="0"]');
      const staleReset = host.querySelector<HTMLButtonElement>('[data-action="reset"]');
      if (!localRoot || !staleInput || !staleReset) throw new Error('Mount did not create its workbench.');
      const before = localRoot.querySelector('[data-selected-output]')?.getAttribute('data-values');
      controller.abort();
      instance.destroy();
      instance.destroy();
      staleInput.value = '9';
      staleInput.dispatchEvent(new Event('input', { bubbles: true }));
      staleReset.click();
      instance.reset();
      return {
        removed: host.childElementCount === 0 && !localRoot.isConnected,
        unchanged: before === localRoot.querySelector('[data-selected-output]')?.getAttribute('data-values'),
        notices: notices.length,
      };
    } finally {
      controller.abort();
      host.remove();
      controls.remove();
    }
  });
  expect(cleanup).toEqual({ removed: true, unchanged: true, notices: 0 });
  await page.getByRole('button', { name: 'Collection menu', exact: true }).click();
  await page.getByRole('link', { name: 'Back to index', exact: true }).click();
  await expect(root).toHaveCount(0);
  expect(errors).toEqual([]);
});
