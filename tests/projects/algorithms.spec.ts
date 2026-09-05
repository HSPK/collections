import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseManifest } from '../../src/core/manifest';
import { algorithmOrder, algorithms, presets } from '../../src/projects/algorithms/data';
import { buildTrace, validateInput } from '../../src/projects/algorithms/engine';
import type { AlgorithmId, Counters, Item, TraceStep } from '../../src/projects/algorithms/engine';
import manifest from '../../src/projects/algorithms/manifest.json' with { type: 'json' };

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const valuesOf = (items: readonly Item[]) => items.map((item) => item.value);
const ZERO: Counters = { comparisons: 0, swaps: 0, writes: 0 };
const inputs = {
  duplicates: [2, 1, 2, 1],
  sorted: [1, 2, 3],
  reverse: [3, 2, 1],
  negatives: [-2, 3, -2, 0],
  equal: [4, 4, 4, 4],
} as const;

const expectedCounts: Record<AlgorithmId, Record<keyof typeof inputs, Counters>> = {
  insertion: {
    duplicates: { comparisons: 5, swaps: 0, writes: 6 },
    sorted: { comparisons: 2, swaps: 0, writes: 2 },
    reverse: { comparisons: 3, swaps: 0, writes: 5 },
    negatives: { comparisons: 5, swaps: 0, writes: 5 },
    equal: { comparisons: 3, swaps: 0, writes: 3 },
  },
  selection: {
    duplicates: { comparisons: 6, swaps: 2, writes: 4 },
    sorted: { comparisons: 3, swaps: 0, writes: 0 },
    reverse: { comparisons: 3, swaps: 1, writes: 2 },
    negatives: { comparisons: 6, swaps: 2, writes: 4 },
    equal: { comparisons: 6, swaps: 0, writes: 0 },
  },
  bubble: {
    duplicates: { comparisons: 6, swaps: 3, writes: 6 },
    sorted: { comparisons: 2, swaps: 0, writes: 0 },
    reverse: { comparisons: 3, swaps: 3, writes: 6 },
    negatives: { comparisons: 5, swaps: 2, writes: 4 },
    equal: { comparisons: 3, swaps: 0, writes: 0 },
  },
};

function expectFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectFrozen(child);
}

function inversionCount(values: readonly number[]): number {
  let count = 0;
  values.forEach((left, index) => {
    for (let right = index + 1; right < values.length; right += 1) {
      if (left > values[right]) count += 1;
    }
  });
  return count;
}

test.describe('Algorithm Theatre trace engine', () => {
  test('manifest and pseudocode expose a complete independent page', () => {
    expect(parseManifest(manifest)).toMatchObject({
      id: 'algorithms',
      order: 25,
      title: 'Algorithm Theatre',
      category: 'learn',
      format: 'page',
    });
    expect(algorithmOrder).toHaveLength(3);
    for (const id of algorithmOrder) {
      const lineIds = algorithms[id].pseudocode.map((line) => line.id);
      expect(new Set(lineIds).size).toBe(lineIds.length);
      for (const preset of presets) {
        const trace = buildTrace(id, preset.values);
        expect(valuesOf(trace.output)).toEqual([...preset.values].sort((a, b) => a - b));
        for (const step of trace.steps) expect(lineIds).toContain(step.line);
      }
    }
  });

  for (const id of algorithmOrder) {
    test(`${id} sorts duplicate, sorted, reverse, negative, and equal arrays with exact counters`, () => {
      for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
        const source = [...inputs[name]];
        const original = [...source];
        const trace = buildTrace(id, source);
        expect(source, `${id}: caller input is untouched`).toEqual(original);
        expect(valuesOf(trace.output), `${id}: ${name} output`).toEqual([...source].sort((a, b) => a - b));
        expect(trace.steps[0].counters).toEqual(ZERO);
        expect(trace.steps[trace.steps.length - 1].counters, `${id}: ${name} totals`).toEqual(expectedCounts[id][name]);
        expect(trace.steps[trace.steps.length - 1].kind).toBe('done');
        expect(trace.steps[trace.steps.length - 1].ordered).toEqual(source.map((_, index) => index));
      }
    });

    test(`${id} records genuine operations and counters for every immutable prefix`, () => {
      const source = [3, -1, 3, 0, -1];
      const trace = buildTrace(id, source);
      let totals = { ...ZERO };
      trace.steps.forEach((step, index) => {
        expect(step.index).toBe(index);
        totals = {
          comparisons: totals.comparisons + step.delta.comparisons,
          swaps: totals.swaps + step.delta.swaps,
          writes: totals.writes + step.delta.writes,
        };
        expect(step.counters, `prefix ${index}`).toEqual(totals);
        for (const position of [...step.focus, ...step.ordered]) {
          expect(Number.isInteger(position)).toBe(true);
          expect(position).toBeGreaterThanOrEqual(0);
          expect(position).toBeLessThan(source.length);
        }
        expect(new Set(step.ordered).size).toBe(step.ordered.length);
        if (id !== 'insertion') {
          for (const position of step.ordered) {
            expect(step.items[position].value).toBe(trace.output[position].value);
          }
        }
        if (!step.held) {
          expect(step.items.map((item) => item.origin).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
        }
        if (index === 0) return;
        const previous = trace.steps[index - 1];
        const expected = [...previous.items];
        if (step.kind === 'compare') {
          expect(step.delta).toEqual({ comparisons: 1, swaps: 0, writes: 0 });
          expect(step.operands).toHaveLength(2);
          const [left, right] = step.operands;
          const next = trace.steps[index + 1];
          if (id === 'insertion') expect(next.line).toBe(left.value > right.value ? 'shift' : 'place');
          if (id === 'selection' && left.value < right.value) expect(next.line).toBe('remember');
          if (id === 'bubble' && left.value > right.value) expect(next.kind).toBe('swap');
        } else if (step.kind === 'swap') {
          expect(step.delta).toEqual({ comparisons: 0, swaps: 1, writes: 2 });
          expect(step.focus).toHaveLength(2);
          const [left, right] = step.focus;
          expect(left).not.toBe(right);
          [expected[left], expected[right]] = [expected[right], expected[left]];
        } else if (step.kind === 'write') {
          expect(step.delta).toEqual({ comparisons: 0, swaps: 0, writes: 1 });
          if (step.line === 'shift') {
            const [from, to] = step.focus;
            expect(to).toBe(from + 1);
            expected[to] = previous.items[from];
            expect(step.held).toEqual(previous.held);
          } else {
            expect(step.line).toBe('place');
            expect(previous.held).not.toBeNull();
            expected[step.focus[0]] = previous.held as Item;
            expect(step.held).toBeNull();
          }
        } else {
          expect(step.delta).toEqual(ZERO);
        }
        expect(step.items, `operation ${index} has only its documented effects`).toEqual(expected);
      });
      const recording = JSON.stringify(trace);
      source[0] = 99;
      source.push(88);
      expect(trace.input).toEqual([3, -1, 3, 0, -1]);
      expect(buildTrace(id, trace.input)).toEqual(trace);
      expect(JSON.stringify(trace)).toBe(recording);
      expectFrozen(trace);
      expect(() => { (trace.steps as TraceStep[]).pop(); }).toThrow(TypeError);
      expect(() => { (trace.steps[0].items[0] as { value: number }).value = 44; }).toThrow(TypeError);
    });
  }

  test('the stability witness distinguishes equal values from item identity', () => {
    const input = [2, 2, 1];
    expect(buildTrace('insertion', input).output.map((item) => item.origin)).toEqual([2, 0, 1]);
    expect(buildTrace('bubble', input).output.map((item) => item.origin)).toEqual([2, 0, 1]);
    expect(buildTrace('selection', input).output.map((item) => item.origin)).toEqual([2, 1, 0]);
    expect(algorithms.insertion.stable).toBe(true);
    expect(algorithms.bubble.stable).toBe(true);
    expect(algorithms.selection.stable).toBe(false);
  });

  test('all short ternary arrays satisfy inversion-based operation laws', () => {
    for (let length = 2; length <= 4; length += 1) {
      for (let encoded = 0; encoded < 3 ** length; encoded += 1) {
        let remainder = encoded;
        const values = Array.from({ length }, () => {
          const value = remainder % 3 - 1;
          remainder = Math.floor(remainder / 3);
          return value;
        });
        const inversions = inversionCount(values);
        for (const id of algorithmOrder) {
          const trace = buildTrace(id, values);
          const counts = trace.steps[trace.steps.length - 1].counters;
          expect(valuesOf(trace.output)).toEqual([...values].sort((a, b) => a - b));
          if (id === 'insertion') {
            expect(counts.writes).toBe(inversions + length - 1);
            expect(counts.swaps).toBe(0);
          } else if (id === 'bubble') {
            expect(counts.swaps).toBe(inversions);
            expect(counts.writes).toBe(inversions * 2);
          } else {
            expect(counts.comparisons).toBe(length * (length - 1) / 2);
            expect(counts.swaps).toBeLessThanOrEqual(length - 1);
            expect(counts.writes).toBe(counts.swaps * 2);
          }
          if (algorithms[id].stable) {
            for (let i = 1; i < trace.output.length; i += 1) {
              if (trace.output[i].value === trace.output[i - 1].value) {
                expect(trace.output[i].origin).toBeGreaterThan(trace.output[i - 1].origin);
              }
            }
          }
        }
      }
    }
  });

  test('validation accepts signed duplicates and rejects missing, noninteger, and oversized data', () => {
    for (const [text, values] of [
      ['3, -1, 3', [3, -1, 3]],
      [' 0 +2 -2 ', [0, 2, -2]],
      ['99, -99', [99, -99]],
      ['1, 2 3', [1, 2, 3]],
    ] as const) {
      const result = validateInput(text);
      expect(result).toEqual({ valid: true, values });
      if (result.valid) expect(Object.isFrozen(result.values)).toBe(true);
    }
    for (const text of ['', '1', '1,', ',1,2', '1,,2', '1, ,2', '1.5,2', '1e2,2', 'a,2', '1;2', '100,0', '-100,0', '1 '.repeat(13)]) {
      const result = validateInput(text);
      expect(result.valid, text).toBe(false);
      if (!result.valid) expect(result.error.length).toBeGreaterThan(10);
    }
    for (const values of [[], [1], [1, NaN], [0, Infinity], [0, 1.5], [0, 100], Array<number>(2), Array<number>(13).fill(0)]) {
      expect(() => buildTrace('insertion', values)).toThrow(RangeError);
    }
    expect(() => buildTrace('missing' as AlgorithmId, [1, 2])).toThrow(RangeError);
    expect(validateInput(Array<number>(12).fill(-99).join(', ')).valid).toBe(true);
  });
});

interface BrowserHarness {
  controller: AbortController;
  instance: { destroy: () => void };
  frames: Set<number>;
}

async function mountIsolated(page: Page) {
  await page.route('**/projects/algorithms/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Algorithm Theatre isolated test</title><style>body{margin:0}main{display:block}</style></head><body><main id="mount"></main><script type="module">
      import { mount } from '/src/projects/algorithms/index.ts';
      const frames = new Set();
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        const id = request((time) => { frames.delete(id); callback(time); });
        frames.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => { frames.delete(id); cancel(id); };
      const controller = new AbortController();
      const reports = [];
      const instance = mount({
        container: document.querySelector('#mount'),
        controls: document.createElement('div'),
        signal: controller.signal,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        report: (message) => reports.push(message),
      });
      window.__algorithmsHarness = { controller, instance, frames, reports };
    </script></body></html>`,
  }));
  await page.goto('./projects/algorithms/');
  await expect(page.locator('.project-algorithms')).toBeVisible();
}

test.describe('Algorithm Theatre isolated browser', () => {
  test('starts paused, mirrors recorded operations, and scrubs both endpoints', async ({ page }) => {
    await mountIsolated(page);
    const trace = buildTrace('insertion', presets[0].values);
    const counter = (name: keyof Counters) => page.locator(`[data-count="${name}"]`);
    await expect(page.getByRole('heading', { level: 1, name: 'Algorithm Theatre', exact: true })).toBeVisible();
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await page.waitForTimeout(1150);
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(counter('comparisons')).toHaveText('0');
    await expect(page.locator('[data-code-line][aria-current="step"]')).toHaveAttribute('data-code-line', 'lift');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(counter('comparisons')).toHaveText('1');
    await expect(page.locator('[data-explanation]')).toHaveText(trace.steps[2].explanation);
    await expect(page.locator('[data-code-line][aria-current="step"]')).toHaveAttribute('data-code-line', 'compare');
    await expect(page.locator('[data-held-value]')).toHaveText('-3·B');
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(counter('comparisons')).toHaveText('0');
    await expect(page.locator('[data-current-array]')).toHaveText(`[${presets[0].values.join(', ')}]`);

    const slider = page.getByRole('slider', { name: 'Trace position' });
    await slider.focus();
    await slider.press('End');
    const final = trace.steps[trace.steps.length - 1];
    for (const key of ['comparisons', 'swaps', 'writes'] as const) {
      await expect(counter(key)).toHaveText(String(final.counters[key]));
    }
    await expect(page.locator('[data-current-array]')).toHaveText(`[${valuesOf(trace.output).join(', ')}]`);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(page.locator('[data-code-line][aria-current="step"]')).toHaveAttribute('data-code-line', 'done');
    await slider.press('Home');
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(counter('writes')).toHaveText('0');

    const stage = page.getByRole('region', { name: 'Sorting stage', exact: true });
    await stage.focus();
    await stage.press('ArrowRight');
    await expect(page.locator('[data-step-number]')).toHaveText('01');
    await stage.press(' ');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await stage.press(' ');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
  });

  test('validates drafts, preserves input across methods, and loads presets explicitly at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mountIsolated(page);
    const input = page.getByRole('textbox', { name: 'Write your opening array' });
    await expect(page.getByLabel('Playback tempo')).toHaveValue('1.5');
    await expect(page.locator('.at-motion-note')).toContainText('Reduced motion is on');
    await input.fill('3, , -1');
    await input.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-input-error]')).toBeVisible();
    await expect(page.locator('[data-score-array]')).toHaveText(`[${presets[0].values.join(', ')}]`);
    await page.getByRole('radio', { name: /Selection sort/ }).check();
    await expect(input).toHaveValue('3, , -1');
    await expect(page.locator('[data-input-note]')).toContainText('Unapplied draft');
    await input.fill('2, 2, -1');
    await page.getByRole('button', { name: 'Apply array', exact: true }).click();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-current-array]')).toHaveText('[2, 2, -1]');
    await page.getByLabel('Or bring in a prepared cast').selectOption('reverse');
    await expect(input).toHaveValue('2, 2, -1');
    await page.getByRole('button', { name: 'Use dataset', exact: true }).click();
    const reverse = presets.find((preset) => preset.id === 'reverse')!;
    await expect(input).toHaveValue(reverse.values.join(', '));
    await page.getByRole('radio', { name: /Bubble sort/ }).check();
    await expect(input).toHaveValue(reverse.values.join(', '));
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Try the stability witness' }).click();
    await expect(page.getByRole('radio', { name: /Selection sort/ })).toBeChecked();
    await expect(input).toHaveValue('2, 2, 1');
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await page.keyboard.press('End');
    await expect(page.locator('[data-current-array]')).toHaveText('[1, 2, 2]');
    expect(await page.locator('[data-slot]').evaluateAll((slots) => slots.map((slot) => slot.getAttribute('data-origin')))).toEqual(['2', '1', '0']);
    await page.getByRole('radio', { name: /Insertion sort/ }).check();
    await page.getByRole('slider', { name: 'Trace position' }).press('End');
    expect(await page.locator('[data-slot]').evaluateAll((slots) => slots.map((slot) => slot.getAttribute('data-origin')))).toEqual(['2', '0', '1']);
    await input.fill('99, -99, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0');
    await input.press('Enter');
    await expect(page.locator('[data-slot]')).toHaveCount(12);
    await page.getByRole('slider', { name: 'Trace position' }).press('End');
    await expect(page.locator('[data-current-array]')).toHaveText('[-99, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 99]');
  });

  test('cancels playback on inspection, edits, reset, completion, and route cleanup', async ({ page }) => {
    await mountIsolated(page);
    const input = page.getByRole('textbox', { name: 'Write your opening array' });
    await input.fill('3, 2, 1');
    await input.press('Enter');
    await page.getByLabel('Playback tempo').selectOption('0.4');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('[data-step-number]').textContent())).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
    const pausedAt = await page.locator('[data-step-number]').textContent();
    await page.waitForTimeout(550);
    await expect(page.locator('[data-step-number]')).toHaveText(pausedAt!);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('slider', { name: 'Trace position' }).press('Home');
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('radio', { name: /Bubble sort/ }).check();
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await input.fill('2, 1');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');
    await expect(page.locator('[data-input-note]')).toContainText('Unapplied draft');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('[data-step-number]')).toHaveText('00');
    await expect(page.locator('[data-play-state]')).toHaveText('Paused');

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('[data-play-state]')).toHaveText('Complete');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.locator('[data-count="swaps"]')).toHaveText('1');
    await expect(page.locator('[data-count="writes"]')).toHaveText('2');
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __algorithmsHarness: BrowserHarness }).__algorithmsHarness.frames.size)).toBe(0);

    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const cleanup = await page.evaluate(() => {
      const harness = (window as unknown as { __algorithmsHarness: BrowserHarness }).__algorithmsHarness;
      const play = document.querySelector<HTMLButtonElement>('[data-play]')!;
      const hadScheduledFrame = harness.frames.size > 0;
      harness.controller.abort();
      play.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      harness.instance.destroy();
      return {
        hadScheduledFrame,
        pending: harness.frames.size,
        roots: document.querySelectorAll('.project-algorithms').length,
      };
    });
    expect(cleanup).toEqual({ hadScheduledFrame: true, pending: 0, roots: 0 });
  });
});
