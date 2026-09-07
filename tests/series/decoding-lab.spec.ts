import { expect, test } from '@playwright/test';
import { CORPORA, PRESETS } from '../../src/projects/decoding-lab/data';
import {
  choose, createSession, decode, MAX_STEPS, nextRandom, resetSession, rewindTo, runBatch, stepSession,
} from '../../src/projects/decoding-lab/engine';
import type { DecoderSettings } from '../../src/projects/decoding-lab/engine';
import { contextFor, END, fitCounts, logitsFor, START, tokenize } from '../../src/projects/decoding-lab/model';

const open: DecoderSettings = { mode: 'sample', temperature: 1, topK: 0, topP: 1 };
const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);

test('decoding counts: fits actual transitions, smoothed log-counts, boundaries, and unseen contexts exactly', () => {
  const sentences = Object.freeze(['a b.', 'a c.', 'a b.']);
  const model = fitCounts(sentences);
  expect(model.vocabulary).toEqual(['.', 'a', 'b', 'c', END]);
  expect(model.tokenCount).toBe(9);
  expect(model.transitionCount).toBe(12);
  expect(model.counts.get(START)).toEqual([0, 3, 0, 0, 0]);
  expect(model.counts.get('a')).toEqual([0, 0, 2, 1, 0]);
  expect(model.counts.get('.')).toEqual([0, 0, 0, 0, 3]);
  expect(model.counts.has(END)).toBe(false);
  expect(tokenize("A small press hums.")).toEqual(['a', 'small', 'press', 'hums', '.']);
  expect(contextFor('a b')).toBe('b');
  expect(contextFor('')).toBe(START);

  const source = logitsFor(model, 'a');
  expect(source.total).toBe(3);
  expect(source.denominator).toBe(4.25);
  expect(source.logits[2]).toBeCloseTo(Math.log(2.25), 14);
  const expected = [1 / 17, 1 / 17, 9 / 17, 5 / 17, 1 / 17];
  const fitted = decode(source.logits, open);
  expected.forEach((probability, index) => {
    expect(source.probabilities[index]).toBeCloseTo(probability, 14);
    expect(fitted.final[index]).toBeCloseTo(probability, 14);
  });
  for (const context of [...model.counts.keys(), 'unseen']) {
    const row = logitsFor(model, context);
    expect(total(row.probabilities)).toBeCloseTo(1, 14);
    expect(row.logits.every(Number.isFinite)).toBe(true);
  }
  const unseen = logitsFor(model, 'unseen');
  expect(unseen.unseen).toBe(true);
  expect(unseen.counts).toEqual([0, 0, 0, 0, 0]);
  expect(unseen.probabilities).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  expect(decode(unseen.logits, open).entropy).toBeCloseTo(Math.log(5), 14);
  for (const lines of [[], ['   '], ['a'.repeat(241)], Array(65).fill('a')]) expect(() => fitCounts(lines)).toThrow(RangeError);
  for (const alpha of [0, -1, NaN, Infinity, 101]) expect(() => fitCounts(['a'], alpha)).toThrow(RangeError);

  const printshop = fitCounts(CORPORA[0].sentences);
  const press = printshop.vocabulary.indexOf('press');
  expect(logitsFor(printshop, 'the').counts[press]).toBe(4);
  expect(logitsFor(printshop, 'the').probabilities[press]).toBeCloseTo(17 / 43, 14);
});

test('decoding engine: exact filter order, stable temperature, zero policy, seeded replay, EOS, and hard bounds', () => {
  const logits = [4, 3, 2, 1].map(Math.log);
  const filtered = decode(logits, { ...open, topK: 3, topP: 0.75 });
  expect(filtered.kept).toEqual([0, 1]);
  expect(filtered.reasons).toEqual(['kept', 'kept', 'top-p', 'top-k']);
  expect(filtered.topKMass).toBeCloseTo(0.9, 14);
  expect(filtered.topPMass).toBeCloseTo(7 / 9, 14);
  expect(filtered.afterTopK[0]).toBeCloseTo(4 / 9, 14);
  expect(filtered.final[0]).toBeCloseTo(4 / 7, 14);
  expect(filtered.final[1]).toBeCloseTo(3 / 7, 14);
  expect(filtered.final.slice(2)).toEqual([0, 0]);
  expect(filtered.entropy).toBeCloseTo(-4 / 7 * Math.log(4 / 7) - 3 / 7 * Math.log(3 / 7), 14);
  expect(choose(filtered, 0).index).toBe(0);
  expect(choose(filtered, filtered.final[0]).index).toBe(1);
  expect(choose(filtered, 1 - Number.EPSILON).index).toBe(1);
  expect(() => choose(filtered, 1)).toThrow(RangeError);
  expect(decode(logits, { ...open, topP: 0 }).kept).toEqual([0]);
  expect(decode([0, 0, 0], { ...open, topK: 2, topP: 0.5 }).final).toEqual([1, 0, 0]);
  const warm = decode([Math.log(4), 0], { ...open, temperature: 2 });
  expect(warm.final[0]).toBeCloseTo(2 / 3, 14);
  expect(warm.final[1]).toBeCloseTo(1 / 3, 14);
  expect(warm.entropy).toBeGreaterThan(decode([Math.log(4), 0], open).entropy);
  expect(decode([1001, 1000], open).final).toEqual(decode([1, 0], open).final);
  expect(decode([1e308, 0, -1e308], { ...open, temperature: Number.MIN_VALUE }).final).toEqual([1, 0, 0]);
  expect(decode([0, -744], open).kept).toEqual([0, 1]);

  for (const options of [{ ...open, temperature: 0 }, { ...open, mode: 'greedy' as const, temperature: 4 }]) {
    const greedy = decode([12, 12, -Infinity], options);
    expect(greedy.final).toEqual([1, 0, 0]);
    expect(greedy.entropy).toBe(0);
    expect(greedy.greedy).toBe(true);
    expect(greedy.base).toEqual([0.5, 0.5, 0]);
  }
  for (const invalid of [[], [NaN], [Infinity], [-Infinity, -Infinity]]) expect(() => decode(invalid, open)).toThrow(RangeError);
  for (const settings of [
    { ...open, temperature: NaN }, { ...open, temperature: -1 }, { ...open, topK: 1.1 }, { ...open, topP: 1.01 },
  ]) expect(() => decode(logits, settings)).toThrow(RangeError);
  expect(nextRandom(42).value).toBe(0.6011037519201636);
  expect(nextRandom(0).value).toBe(0.26642920868471265);

  const loop = fitCounts(['a a a a a a a a a a a a']);
  const initial = createSession(loop, 'a', open, 42);
  const four = runBatch(initial, 4);
  expect(initial.history).toHaveLength(0);
  expect(four.history.map((step) => step.token)).toEqual(['a', 'a', 'a', 'a']);
  const rewound = rewindTo(four, 2);
  expect(rewound.context).toBe('a');
  expect(rewound.rngState).toBe(four.history[2].rngBefore);
  expect(runBatch(rewound, 2)).toEqual(four);
  expect(runBatch(resetSession(four), 4)).toEqual(four);
  const singleCandidate = stepSession(createSession(loop, 'a', { ...open, topK: 1 }, 42));
  expect(singleCandidate.history[0].probability).toBe(1);
  expect(singleCandidate.history[0].uniform).toBe(nextRandom(42).value);
  expect(singleCandidate.rngState).toBe(nextRandom(42).state);
  expect(() => createSession(loop, 'a', open, -1)).toThrow(RangeError);
  expect(() => runBatch(initial, 6)).toThrow(RangeError);

  let bounded = createSession(loop, 'a', { ...open, temperature: 0 }, 0);
  for (let index = 0; index < MAX_STEPS + 3; index += 1) bounded = stepSession(bounded);
  expect(bounded.history).toHaveLength(MAX_STEPS);
  expect(bounded.end).toBe('token-limit');
  expect(bounded.rngState).toBe(0);
  expect(bounded.history.every((step) => step.probability === 1 && step.logProbability === 0 && step.uniform === null)).toBe(true);
  expect(stepSession(bounded)).toBe(bounded);

  const ended = runBatch(createSession(fitCounts(['a b.']), 'a', { ...open, mode: 'greedy' }, 42));
  expect(ended.history.map((step) => step.token)).toEqual(['b', '.', END]);
  expect(ended.end).toBe('end-token');
  expect(stepSession(ended)).toBe(ended);
  expect(rewindTo(ended, 2).context).toBe('.');
  expect(stepSession(rewindTo(ended, 2))).toEqual(ended);
});

test('decoding browser: real distributions and tokens, inspection, replay, reset, honest limits, and 375px keyboard access', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.routeWebSocket('**', () => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('./projects/decoding-lab/');
  const root = page.locator('.project-decoding-lab');
  const panel = (name: string) => root.getByRole('tab', { name, exact: true });
  const step = root.getByRole('button', { name: 'Print 1 token', exact: true });
  const backtrack = root.getByRole('button', { name: 'Backtrack', exact: true });
  const reset = root.getByRole('button', { name: 'Reset run', exact: true });
  await expect(root.getByRole('heading', { name: 'Decoding Lab', exact: true })).toBeVisible();
  await expect(root).toHaveAttribute('data-steps', '0');
  await expect(root.getByText('Not a neural LLM', { exact: true })).toBeVisible();
  await expect(root.locator('.dl-source-section')).toContainText('genuinely fitted local bigram count model');
  await expect(root.locator('.dl-field-notes')).toContainText('There is no conversation');
  await expect(root.locator('.dl-source-section')).toContainText('No neural training, pretrained weights, or ChatGPT behind the page.');
  await expect(root.locator('[data-corpus-lines] li')).toHaveCount(8);
  await expect(root.locator('[data-inventory] code')).toHaveCount(11);
  await expect(root.locator('[data-count-token="press"] td').first()).toHaveText('4');
  const previewBox = (await root.locator('[data-project-preview]').boundingBox())!;
  expect(previewBox.y).toBeGreaterThan(0);
  expect(previewBox.y).toBeLessThan(300);
  const rows = root.locator('[data-distribution] [data-token]');
  const probabilities = await rows.evaluateAll((elements) => elements.map((row) => ({
    token: row.getAttribute('data-token'),
    base: Number(row.getAttribute('data-base')),
    final: Number(row.getAttribute('data-final')),
    reason: row.getAttribute('data-reason'),
  })));
  expect(total(probabilities.map((row) => row.base))).toBeCloseTo(1, 14);
  expect(total(probabilities.map((row) => row.final))).toBeCloseTo(1, 14);
  expect(probabilities.find((row) => row.token === 'press')!.base).toBeCloseTo(17 / 43, 14);
  expect(probabilities.find((row) => row.token === 'ink')!.final).toBeCloseTo(9 / 35, 14);
  expect(probabilities.filter((row) => row.final > 0)).toHaveLength(3);
  expect(probabilities.find((row) => row.token === '.')!.reason).toBe('top-p');
  expect(probabilities.find((row) => row.token === END)!.reason).toBe('top-k');

  await step.focus();
  await step.press('Enter');
  await expect(root).toHaveAttribute('data-context', 'ink');
  await expect(root).toHaveAttribute('data-steps', '1');
  await expect(root.locator('[data-generated-text]')).toHaveText('ink');
  await expect(root.locator('[data-chosen-token]')).toHaveText('ink');
  await expect(root.locator('[data-random-draw]')).toHaveText('0.601104');
  expect(Number(await root.locator('[data-chosen-probability]').getAttribute('data-value'))).toBeCloseTo(9 / 35, 14);
  const firstRng = await root.getAttribute('data-rng-state');
  const firstReceipt = await root.locator('[data-choice-record]').innerHTML();
  await panel('History').click();
  await root.getByRole('button', { name: 'Inspect step 1: ink', exact: true }).press('Enter');
  await expect(root.getByRole('button', { name: 'Inspect step 1: ink', exact: true })).toBeFocused();
  await expect(root).toHaveAttribute('data-preview-context', 'the');
  await expect(root).toHaveAttribute('data-preview-kind', 'recorded');
  await expect(root).toHaveAttribute('data-context', 'ink');
  await expect(root).toHaveAttribute('data-rng-state', firstRng!);
  await expect(root.locator('[data-token="ink"]')).toHaveAttribute('data-chosen', 'true');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('decoding-lab-desktop.png') });
  await backtrack.click();
  await expect(root).toHaveAttribute('data-context', 'the');
  await expect(root).toHaveAttribute('data-rng-state', '42');
  await expect(root).toHaveAttribute('data-steps', '0');
  await step.click();
  expect(await root.locator('[data-choice-record]').innerHTML()).toBe(firstReceipt);
  await expect(root).toHaveAttribute('data-rng-state', firstRng!);
  await root.getByRole('button', { name: 'Pin run for comparison', exact: false }).click();
  await expect(panel('Experiments')).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-proof]')).toBeVisible();
  await panel('Settings').click();
  await root.getByLabel('Random seed', { exact: false }).fill('99');
  await root.getByLabel('Random seed', { exact: false }).press('Tab');
  await expect(root).toHaveAttribute('data-steps', '0');
  await expect(root.locator('[data-proof]')).toContainText('seed 42');
  await expect(root.locator('[data-proof]')).toContainText('the ink');
  await expect(root.locator('[data-generated-text]')).toHaveCount(0);

  await root.locator('.dl-presets [data-preset="narrow"]').click();
  const expected = runBatch(createSession(fitCounts(CORPORA[0].sentences), 'the', PRESETS[1].settings, 42));
  await root.getByRole('button', { name: 'Print up to 5', exact: true }).click();
  await expect(root).toHaveAttribute('data-steps', String(expected.history.length));
  expect(await root.locator('[data-history] code').allTextContents()).toEqual(expected.history.map((record) => record.token === END ? 'END' : record.token));
  await backtrack.click();
  await step.click();
  await expect(root).toHaveAttribute('data-rng-state', String(expected.rngState));
  await expect(root.locator('[data-random-draw]')).toHaveText(expected.history.at(-1)!.uniform!.toFixed(6));
  await reset.click();
  await expect(root).toHaveAttribute('data-steps', '0');
  await expect(root).toHaveAttribute('data-rng-state', '42');
  await expect(backtrack).toBeDisabled();
  await root.locator('.dl-presets [data-preset="greedy"]').click();
  await expect(root.locator('[data-draw-strip]')).toContainText('No random draw.');
  await root.getByRole('button', { name: 'Print up to 5', exact: true }).click();
  expect(await root.locator('[data-history] code').allTextContents()).toEqual(['press', 'hums', '.', 'END']);
  await expect(root).toHaveAttribute('data-end', 'end-token');
  await expect(step).toBeDisabled();
  await expect(root.locator('[data-chosen-probability]')).toHaveText('100.00%');
  await expect(root.locator('[data-random-draw]')).toHaveText('Not used');
  await backtrack.click();
  await expect(root).toHaveAttribute('data-context', '.');
  await step.click();
  await expect(root).toHaveAttribute('data-end', 'end-token');
  await reset.click();

  await page.setViewportSize({ width: 375, height: 812 });
  await root.locator('.dl-presets [data-preset="narrow"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const narrowPreview = (await root.locator('[data-project-preview]').boundingBox())!;
  expect(narrowPreview.y).toBeGreaterThan(0);
  expect(narrowPreview.y).toBeLessThan(300);
  expect((await root.locator('[data-overview-token]').first().boundingBox())!.y).toBeLessThan(755);
  await step.focus();
  await step.press('Space');
  await expect(root).toHaveAttribute('data-context', 'ink');
  const temperature = root.getByRole('slider', { name: /Temperature/ });
  await temperature.focus();
  await temperature.press('ArrowRight');
  await expect(temperature).toBeFocused();
  await expect(temperature).toHaveValue('1.05');
  await expect(root).toHaveAttribute('data-steps', '0');
  await expect(root).toHaveAttribute('data-rng-state', '42');
  await root.getByRole('combobox', { name: 'Training corpus', exact: true }).selectOption('harbor');
  await expect(root.locator('[data-corpus-title]')).toHaveText('The little harbor');
  await expect(root.locator('[data-inventory]')).not.toContainText('press');
  await root.getByRole('combobox', { name: 'Starting context', exact: true }).selectOption('5');
  await expect(root).toHaveAttribute('data-context', 'buoy');
  await expect(root.locator('[data-context-note]')).toContainText('Unseen context');
  for (const probability of await rows.evaluateAll((elements) => elements.map((row) => Number(row.getAttribute('data-base'))))) {
    expect(probability).toBeCloseTo(1 / 11, 14);
  }
  await panel('Model').click();
  await root.getByRole('combobox', { name: 'Inspect fitted context', exact: true }).selectOption('the');
  await expect(root.locator('[data-count-token="bell"] td').first()).toHaveText('3');
  await expect(root).toHaveAttribute('data-context', 'buoy');
  await panel('Settings').click();
  await root.getByRole('combobox', { name: 'Selection policy', exact: true }).selectOption('greedy');
  await expect(temperature).toBeDisabled();
  await expect(root.getByRole('slider', { name: /Top-p/ })).toBeDisabled();
  await expect(root).toHaveAttribute('data-steps', '0');
  await step.press('Enter');
  await expect(root.locator('[data-chosen-token]')).toHaveText('.');
  await expect(root.locator('[data-chosen-probability]')).toHaveText('100.00%');

  await root.locator('.dl-presets [data-preset="narrow"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('decoding-lab-mobile.png') });
  const seedInput = root.getByLabel('Random seed', { exact: false });
  await seedInput.fill('');
  await seedInput.press('Tab');
  await expect(seedInput).toHaveValue('42');
  await expect(root.locator('[data-feedback]')).toContainText('whole-number seed');
  await seedInput.fill('0');
  await seedInput.press('Tab');
  await expect(root).toHaveAttribute('data-rng-state', '0');
  await step.press('Space');
  await backtrack.press('Enter');
  await expect(root).toHaveAttribute('data-rng-state', '0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await root.locator('button:visible, input:visible, select:visible').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const cleanup = await page.evaluate(async () => {
    const modulePath = '/src/projects/decoding-lab/index.ts';
    const { mount } = await import(modulePath);
    const host = document.createElement('div');
    document.body.append(host);
    const controller = new AbortController();
    const reports: string[] = [];
    const instance = mount({
      container: host, controls: document.createElement('div'), signal: controller.signal,
      reducedMotion: true, report: (message: string) => reports.push(message),
    });
    const held = host.querySelector<HTMLButtonElement>('[data-action="step"]')!;
    held.click();
    const mountedRoot = host.querySelector<HTMLElement>('.project-decoding-lab')!;
    const countBefore = mountedRoot.dataset.steps;
    controller.abort();
    const reportCount = reports.length;
    held.click();
    instance.reset();
    instance.destroy();
    instance.destroy();
    const result = { countBefore, countAfter: mountedRoot.dataset.steps, children: host.childElementCount, reportsAfter: reports.length - reportCount };
    host.remove();
    return result;
  });
  expect(cleanup).toEqual({ countBefore: '1', countAfter: '1', children: 0, reportsAfter: 0 });
  expect(errors).toEqual([]);
});
