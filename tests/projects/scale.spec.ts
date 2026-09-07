import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseManifest } from '../../src/core/manifest';
import type { ProjectInstance } from '../../src/core/types';
import {
  ASTRONOMICAL_UNIT_METRES, compareLengths, convertLength, formatLength,
  formatNumber, fromMetres, isUnit, JULIAN_YEAR_SECONDS, LIGHT_YEAR_METRES,
  logPosition, magnitudeBounds, metresAtPosition, naturalUnit, nearestReference,
  rescaleLength, scientificNumber, superscript, toMetres, UNITS,
} from '../../src/projects/scale/engine';
import type { Unit } from '../../src/projects/scale/engine';
import {
  catalogue, comparisonPresets, DEFAULT_COMPARISON, DEFAULT_ENTRY, domains, sources,
} from '../../src/projects/scale/data';
import { illustration } from '../../src/projects/scale/illustrations';
import manifest from '../../src/projects/scale/manifest.json' with { type: 'json' };

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Scale atlas — pure unit math', () => {
  test('converts SI lengths without confusing diameter, area or volume', () => {
    expect(toMetres(2, 'nm')).toBe(2e-9);
    expect(toMetres(7.5, 'um')).toBeCloseTo(7.5e-6, 14);
    expect(toMetres(24.26, 'mm')).toBeCloseTo(0.02426, 12);
    expect(convertLength(6.7, 'cm', 'mm')).toBeCloseTo(67, 12);
    expect(convertLength(42.195, 'km', 'm')).toBe(42_195);
    expect(convertLength(1, 'm', 'um')).toBe(1_000_000);
  });

  test('defines astronomical units and Julian light-years explicitly', () => {
    expect(ASTRONOMICAL_UNIT_METRES).toBe(149_597_870_700);
    expect(toMetres(1, 'au')).toBe(ASTRONOMICAL_UNIT_METRES);
    expect(JULIAN_YEAR_SECONDS).toBe(31_557_600);
    expect(LIGHT_YEAR_METRES).toBe(9_460_730_472_580_800);
    expect(toMetres(4.24, 'ly')).toBe(4.24 * LIGHT_YEAR_METRES);
    expect(convertLength(1, 'ly', 'km')).toBe(LIGHT_YEAR_METRES / 1000);
  });

  test('round-trips all supported units across fractional and large values', () => {
    for (const unit of Object.keys(UNITS) as Unit[]) {
      expect(isUnit(unit)).toBe(true);
      for (const value of [0.001, 1, 2.5, 12_756, 100_000]) {
        expect(fromMetres(toMetres(value, unit), unit) / value).toBeCloseTo(1, 12);
      }
      for (const invalid of ['metres', 'constructor', 'toString', '', null, 1]) expect(isUnit(invalid)).toBe(false);
    }
  });

  test('uses legible unit symbols and preserves specified catalogue precision', () => {
    expect(formatLength(2e-9, 'nm', 1)).toBe('2 nm');
    expect(formatLength(toMetres(7.5, 'um'), 'um', 2)).toBe('7.5 µm');
    expect(formatLength(toMetres(24.26, 'mm'), 'mm', 4)).toBe('24.26 mm');
    expect(formatLength(12_756_000, 'km', 5)).toBe('12,756 km');
    expect(formatLength(42_195, 'km', 5)).toBe('42.195 km');
    expect(formatLength(ASTRONOMICAL_UNIT_METRES, 'au')).toBe('1 au');
  });

  test('selects useful natural units rather than applying a fixed metre label', () => {
    expect(naturalUnit(2e-9)).toBe('nm');
    expect(naturalUnit(7.5e-6)).toBe('um');
    expect(naturalUnit(0.005)).toBe('mm');
    expect(naturalUnit(0.067)).toBe('cm');
    expect(naturalUnit(30)).toBe('m');
    expect(naturalUnit(42_195)).toBe('km');
    expect(naturalUnit(ASTRONOMICAL_UNIT_METRES)).toBe('au');
    expect(naturalUnit(LIGHT_YEAR_METRES)).toBe('ly');
    expect(formatLength(1.1)).toBe('1.1 m');
  });

  test('formats powers of ten honestly, including coefficient rollover', () => {
    expect(superscript(-12)).toBe('⁻¹²');
    expect(scientificNumber(2e-9)).toBe('2 × 10⁻⁹');
    expect(scientificNumber(9.999e8)).toBe('1 × 10⁹');
    expect(formatLength(2e-9, 'scientific')).toBe('2 × 10⁻⁹ m');
    expect(formatLength(1e21, 'km')).toBe('1 × 10¹⁸ km');
    expect(formatNumber(1e-9)).toBe('1 × 10⁻⁹');
    expect(() => superscript(1.5)).toThrow(RangeError);
    expect(() => formatNumber(10, 0)).toThrow(RangeError);
    expect(() => scientificNumber(10, 13)).toThrow(RangeError);
  });

  test('rejects zero, negatives and non-finite lengths at public math boundaries', () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => toMetres(value, 'm')).toThrow(RangeError);
      expect(() => fromMetres(value, 'km')).toThrow(RangeError);
      expect(() => naturalUnit(value)).toThrow(RangeError);
      expect(() => formatLength(value)).toThrow(RangeError);
      expect(() => compareLengths(value, 1)).toThrow(RangeError);
      expect(() => compareLengths(1, value)).toThrow(RangeError);
      expect(() => rescaleLength(1, 2, value)).toThrow(RangeError);
    }
  });
});

test.describe('Scale atlas — logarithmic coordinates', () => {
  test('maps equal multiplicative steps to equal positions', () => {
    const bounds = { min: 1e-6, max: 1e6 };
    expect(logPosition(1e-6, bounds)).toBe(0);
    expect(logPosition(1, bounds)).toBe(0.5);
    expect(logPosition(1e6, bounds)).toBe(1);
    expect(logPosition(10, bounds) - logPosition(1, bounds)).toBeCloseTo(1 / 12, 12);
    expect(logPosition(100, bounds) - logPosition(10, bounds)).toBeCloseTo(1 / 12, 12);
    expect(metresAtPosition(0.5, { min: 1, max: 100 })).toBe(10);
  });

  test('round-trips catalogue lengths through the continuous ruler', () => {
    const bounds = magnitudeBounds(catalogue);
    expect(bounds).toEqual({ min: 1e-9, max: 1e21 });
    for (const entry of catalogue) {
      const position = logPosition(entry.metres, bounds);
      expect(metresAtPosition(position, bounds) / entry.metres).toBeCloseTo(1, 12);
    }
  });

  test('clamps positions and rejects degenerate or invalid bounds', () => {
    const bounds = { min: 1, max: 100 };
    expect(metresAtPosition(-3, bounds)).toBe(1);
    expect(metresAtPosition(2, bounds)).toBe(100);
    expect(logPosition(0.01, bounds)).toBe(0);
    expect(logPosition(1000, bounds)).toBe(1);
    expect(() => metresAtPosition(NaN, bounds)).toThrow(RangeError);
    expect(() => logPosition(0, bounds)).toThrow(RangeError);
    for (const invalid of [{ min: 0, max: 10 }, { min: 10, max: 1 }, { min: 1, max: 1 }, { min: 1, max: Infinity }]) {
      expect(() => logPosition(1, invalid)).toThrow(RangeError);
    }
    expect(() => magnitudeBounds([])).toThrow(RangeError);
    expect(magnitudeBounds([{ metres: 1 }])).toEqual({ min: 1, max: 10 });
  });

  test('finds the nearest reference in log space, with smaller midpoint ties', () => {
    const entries = [{ id: 'large', metres: 100 }, { id: 'small', metres: 1 }];
    expect(nearestReference(entries, 20).id).toBe('large');
    expect(nearestReference(entries, 5).id).toBe('small');
    expect(nearestReference(entries, 10).id).toBe('small');
    expect(nearestReference(entries, 100).id).toBe('large');
    expect(() => nearestReference([], 1)).toThrow(RangeError);
    expect(() => nearestReference(entries, 0)).toThrow(RangeError);
  });

  test('keeps every real reference selectable with 0.05-order keyboard steps', () => {
    const bounds = magnitudeBounds(catalogue);
    const steps = (Math.log10(bounds.max) - Math.log10(bounds.min)) * 20;
    for (const entry of catalogue) {
      const thumb = Math.round(logPosition(entry.metres, bounds) * steps);
      const probe = metresAtPosition(thumb / steps, bounds);
      expect(nearestReference(catalogue, probe).id).toBe(entry.id);
    }
  });
});

test.describe('Scale atlas — directed comparisons', () => {
  test('the default whale/tower pair has B/A = 11, not A/B = 11', () => {
    const comparison = compareLengths(30, 330);
    expect(comparison.aOverB).toBeCloseTo(1 / 11, 12);
    expect(comparison.bOverA).toBe(11);
    expect(comparison.larger).toBe('b');
    expect(comparison.largerOverSmaller).toBe(11);
    expect(comparison.signedOrders).toBeLessThan(0);
    expect(comparison.ordersApart).toBeCloseTo(Math.log10(11), 12);
    expect(comparison.aShare).toBeCloseTo(1 / 11, 12);
    expect(comparison.bShare).toBe(1);
  });

  test('swapping exchanges reciprocals and shares but preserves the magnitude gap', () => {
    const forward = compareLengths(30, 330);
    const backward = compareLengths(330, 30);
    expect(backward.aOverB).toBe(forward.bOverA);
    expect(backward.bOverA).toBe(forward.aOverB);
    expect(backward.aShare).toBe(forward.bShare);
    expect(backward.bShare).toBe(forward.aShare);
    expect(backward.larger).toBe('a');
    expect(backward.ordersApart).toBe(forward.ordersApart);
    expect(backward.signedOrders).toBe(-forward.signedOrders);
  });

  test('accepts the same reference twice as a genuine one-to-one comparison', () => {
    expect(compareLengths(0.067, 0.067)).toEqual({
      aOverB: 1, bOverA: 1, larger: 'equal', largerOverSmaller: 1,
      ordersApart: 0, signedOrders: 0, aShare: 1, bShare: 1,
    });
    expect(rescaleLength(30, 30, 0.1)).toBe(0.1);
  });

  test('rescales the selected B relative to A, including after a swap', () => {
    const handSizedWhale = toMetres(10, 'cm');
    expect(rescaleLength(30, 330, handSizedWhale)).toBeCloseTo(1.1, 12);
    expect(rescaleLength(330, 30, handSizedWhale)).toBeCloseTo(0.1 / 11, 12);
    expect(rescaleLength(12_756_000, 384_400_000, 0.1)).toBeCloseTo(3.0134838507369075, 12);
  });

  test('never clamps an extreme length ratio to an invented visible minimum', () => {
    const comparison = compareLengths(catalogue[0].metres, catalogue[catalogue.length - 1].metres);
    expect(comparison.aShare).toBeLessThan(1e-29);
    expect(comparison.aShare).toBeGreaterThan(0);
    expect(comparison.bShare).toBe(1);
    expect(comparison.largerOverSmaller).toBeGreaterThan(1e29);
    expect(comparison.ordersApart).toBeGreaterThan(29);
    expect(comparison.ordersApart).toBeLessThan(30);
  });

  test('all catalogue pairs retain correct direction, shares and reversible model math', () => {
    for (const a of catalogue) {
      for (const b of catalogue) {
        const comparison = compareLengths(a.metres, b.metres);
        expect(comparison.aOverB * comparison.bOverA).toBeCloseTo(1, 12);
        expect((comparison.aShare / comparison.bShare) / comparison.aOverB).toBeCloseTo(1, 12);
        expect(comparison.larger).toBe(a.metres === b.metres ? 'equal' : a.metres > b.metres ? 'a' : 'b');
        const modelB = rescaleLength(a.metres, b.metres, 0.1);
        expect(rescaleLength(b.metres, a.metres, modelB)).toBeCloseTo(0.1, 12);
      }
    }
  });
});

test.describe('Scale atlas — extensible content validity', () => {
  test('contains a real, ordered microscopic-to-cosmic catalogue with unique ids', () => {
    expect(parseManifest(manifest)).toMatchObject({
      id: 'scale', order: 24, title: 'The Scale of Things', category: 'learn', format: 'page',
    });
    expect(catalogue.length).toBeGreaterThanOrEqual(12);
    expect(catalogue.length).toBeLessThanOrEqual(18);
    expect(new Set(catalogue.map((entry) => entry.id)).size).toBe(catalogue.length);
    catalogue.forEach((entry, index) => {
      expect(entry.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(Number.isFinite(entry.metres)).toBe(true);
      expect(entry.metres).toBeGreaterThan(0);
      if (index) expect(entry.metres).toBeGreaterThan(catalogue[index - 1].metres);
      expect(Object.keys(UNITS)).toContain(entry.unit);
      expect(domains.some((domain) => domain.id === entry.domain)).toBe(true);
      expect(entry.digits).toBeGreaterThanOrEqual(1);
      expect(entry.digits).toBeLessThanOrEqual(12);
      for (const field of ['name', 'measure', 'qualification', 'summary', 'context', 'caveat', 'sourceNote'] as const) {
        expect(entry[field].trim().length).toBeGreaterThan(4);
      }
    });

    expect(catalogue[0].metres).toBe(2e-9);
    expect(catalogue[catalogue.length - 1].metres).toBe(100_000 * LIGHT_YEAR_METRES);
  });

  test('distinguishes four distances from the thirteen object dimensions', () => {
    expect(catalogue.filter((entry) => entry.kind === 'distance').map((entry) => entry.id)).toEqual([
      'marathon', 'earth-moon', 'astronomical-unit', 'proxima',
    ]);
    expect(catalogue.find((entry) => entry.id === 'earth')?.measure).toBe('Equatorial diameter');
    expect(catalogue.find((entry) => entry.id === 'earth-moon')?.measure).toBe('Mean centre-to-centre distance');
    expect(catalogue.find((entry) => entry.id === 'moon')?.metres).toBe(3_480_000);
    expect(catalogue.find((entry) => entry.id === 'astronomical-unit')?.approximate).toBe(false);
    expect(catalogue.find((entry) => entry.id === 'astronomical-unit')?.metres).toBe(ASTRONOMICAL_UNIT_METRES);
  });

  test('every entry has a publisher link and every preset/domain resolves to real entries', () => {
    const ids = new Set(catalogue.map((entry) => entry.id));
    for (const entry of catalogue) {
      const source = sources[entry.source];
      expect(source.publisher.length).toBeGreaterThan(3);
      expect(source.title.length).toBeGreaterThan(3);
      expect(new URL(source.url).protocol).toBe('https:');
    }
    for (const domain of domains) {
      expect(catalogue.some((entry) => entry.id === domain.entry && entry.domain === domain.id)).toBe(true);
    }
    for (const preset of comparisonPresets) {
      expect(ids.has(preset.a)).toBe(true);
      expect(ids.has(preset.b)).toBe(true);
      expect(preset.a).not.toBe(preset.b);
    }
    expect(ids.has(DEFAULT_ENTRY)).toBe(true);
    expect(DEFAULT_COMPARISON.a).toBe('whale');
    expect(DEFAULT_COMPARISON.b).toBe('eiffel-tower');
  });

  test('all entries have self-contained decorative SVG plates, not remote assets', () => {
    const drawings = new Set<string>();
    for (const entry of catalogue) {
      const svg = illustration(entry.illustration);
      expect(svg).toContain('viewBox="0 0 560 330"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).not.toMatch(/<image|<script|(?:href|src)=/i);
      expect(svg).not.toContain('undefined');
      drawings.add(svg);
    }
    expect(drawings.size).toBe(catalogue.length);
  });
});

declare global {
  interface Window {
    __scaleHarness?: { controller: AbortController; instance: ProjectInstance };
  }
}

async function mountScale(page: Page) {
  await page.route('**/projects/scale/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Scale atlas isolated mount</title><style>body{margin:0}</style></head>
      <body><main id="scale-host"></main><script type="module">
        import { mount } from '/src/projects/scale/index.ts';
        const controller = new AbortController();
        const instance = mount({
          container: document.querySelector('#scale-host'), controls: document.createElement('div'),
          signal: controller.signal, reducedMotion: true, report: () => {},
        });
        window.__scaleHarness = { controller, instance };
      </script></body></html>`,
  }));
  await page.goto('./projects/scale/');
  await expect(page.locator('.project-scale')).toBeVisible();
}

test.describe('Scale atlas isolated browser', () => {
  test('explorer, log ruler and independent reversible comparisons use the real references', async ({ page }) => {
    await mountScale(page);
    await expect(page.getByRole('heading', { level: 1, name: 'The Scale of Things', exact: true })).toBeVisible();
    await expect(page.locator('#scale-reference')).toHaveValue('whale');
    await expect(page.locator('[data-ratio]')).toHaveText('≈ 11×');
    await expect(page.locator('[data-b-over-a]')).toHaveText('≈ 11');
    await expect(page.locator('[data-model-reading]')).toContainText('1.1 m');
    await page.locator('[data-action="swap"]').click();
    await expect(page.locator('#scale-compare-a')).toHaveValue('eiffel-tower');
    await expect(page.locator('[data-a-over-b]')).toHaveText('≈ 11');
    await expect(page.locator('#scale-reference')).toHaveValue('whale');
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    await page.locator('#scale-log').focus();
    await page.locator('#scale-log').press('Home');
    await expect(page.locator('#scale-reference')).toHaveValue('dna');
    await page.locator('#scale-log').press('End');
    await expect(page.locator('#scale-reference')).toHaveValue('milky-way');
    await expect(page.locator('[data-action="next"]')).toBeDisabled();
    await page.locator('#scale-reference').selectOption('whale');
    await page.getByRole('button', { name: 'Compare as A', exact: true }).click();
    await expect(page.locator('#scale-compare-a')).toHaveValue('whale');
    await expect(page.locator('#scale-compare-b')).toHaveValue('whale');
    await expect(page.locator('[data-ratio]')).toHaveText('1×');
    await expect(page.locator('[data-ratio-sentence]')).toContainText('same reference length');
    await page.locator('#scale-compare-b').selectOption('eiffel-tower');
    await page.getByRole('button', { name: 'Model & comparison notebook', exact: true }).click();
    await page.locator('#scale-units').selectOption('cm');
    await expect(page.locator('[data-value-a]')).toContainText('3,000 cm');
    await expect(page.locator('[data-ratio]')).toHaveText('≈ 11×');
  });

  test('search, domain and measurement filters reveal substantive field notes', async ({ page }) => {
    await mountScale(page);
    await page.getByRole('tab', { name: 'Catalogue', exact: true }).click();
    await expect(page.locator('.scale-catalogue-item')).toHaveCount(17);
    await page.getByRole('searchbox', { name: 'Search field notes' }).fill('no-such-reference-zz');
    await expect(page.locator('[data-result-count]')).toHaveText('0 of 17 references');
    await page.getByRole('button', { name: 'Show all references', exact: true }).click();
    await expect(page.locator('.scale-catalogue-item')).toHaveCount(17);
    await expect(page.getByRole('searchbox', { name: 'Search field notes' })).toBeFocused();
    await page.locator('#scale-domain-filter').selectOption('planetary');
    await page.locator('#scale-kind-filter').selectOption('distance');
    await expect(page.locator('.scale-catalogue-item')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    await page.locator('#scale-reference').selectOption('dna');
    await page.getByRole('button', { name: 'Full field note', exact: true }).click();
    await expect(page.locator('.scale-catalogue-item')).toHaveCount(17);
    await expect(page.locator('#scale-entry-dna details')).toHaveAttribute('open', '');
    await expect(page.locator('#scale-entry-dna')).toContainText('2 nm');
    await expect(page.locator('#scale-entry-dna a[href]')).toHaveAttribute('href', sources.dna.url);
  });

  test('invalid models are explained and sourced downloads reflect the actual comparison', async ({ page }) => {
    await mountScale(page);
    await page.getByRole('button', { name: 'Model & comparison notebook', exact: true }).click();
    await page.locator('#scale-model-length').fill('0');
    await expect(page.locator('#scale-model-length')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#scale-model-error')).toContainText('cannot be zero or negative');
    await expect(page.locator('[data-action="download"]')).toBeDisabled();
    await page.locator('#scale-model-length').fill('10');
    await expect(page.locator('#scale-model-length')).toHaveAttribute('aria-invalid', 'false');
    const pending = page.waitForEvent('download');
    await page.locator('[data-action="download"]').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('scale-whale-and-eiffel-tower.txt');
    const path = await download.path();
    if (!path) throw new Error('Expected a local field-note download.');
    const text = await readFile(path, 'utf8');
    expect(text).toContain('A: Blue whale');
    expect(text).toContain('B: Eiffel Tower');
    expect(text).toContain('B / A ≈ 11');
    expect(text).toContain(sources.whale.url);
    expect(text).toContain(sources.tower.url);
    expect(text).toContain('length only');
  });

  test('narrow atlas stays readable and detaches its controls on route exit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mountScale(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const smallest = await page.locator('button, label, .scale-help, .scale-eyebrow').evaluateAll((elements) =>
      Math.min(...elements.filter((element) => element.getBoundingClientRect().height).map((element) => parseFloat(getComputedStyle(element).fontSize))),
    );
    expect(smallest).toBeGreaterThanOrEqual(14);
    expect(await page.locator('[data-action="swap"]').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const unchanged = await page.evaluate(() => {
      const harness = window.__scaleHarness;
      const swap = document.querySelector<HTMLButtonElement>('[data-action="swap"]');
      const a = document.querySelector<HTMLSelectElement>('#scale-compare-a');
      if (!harness || !swap || !a) throw new Error('Missing scale harness.');
      const before = a.value;
      harness.controller.abort();
      harness.instance.destroy();
      swap.click();
      return a.value === before;
    });
    expect(unchanged).toBe(true);
    await expect(page.locator('.project-scale')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
