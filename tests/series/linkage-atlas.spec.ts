import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { relative } from 'node:path';
import { presets } from '../../src/projects/linkage-atlas/data';
import {
  TAU, advanceInput, chordDeviation, classifyLinkage, lengthIssue,
  radians, reachableIntervals, sampleTrace, sampleWindow, solveFourBar,
} from '../../src/projects/linkage-atlas/engine';
import type { AssemblyBranch, LinkLengths, Point } from '../../src/projects/linkage-atlas/engine';

const branches: AssemblyBranch[] = ['plus', 'minus'];
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
const projectURL = './projects/linkage-atlas/';

test('every preset closes its actual four bars on both signed branches', () => {
  const original = JSON.stringify(presets);
  for (const preset of presets) {
    for (const branch of branches) {
      const opening = solveFourBar(preset.lengths, radians(preset.angle), branch, preset.coupler);
      expect(opening.status, `${preset.id}: useful initial pose`).toBe('closed');
      let solved = 0;
      let maxError = 0;
      let badNumbers = 0;
      let wrongSide = 0;
      for (let angle = 0; angle < 360; angle += 2) {
        const result = solveFourBar(preset.lengths, radians(angle), branch, preset.coupler);
        if (!result.pose) continue;
        solved++;
        const { A, B, C, D, P } = result.pose;
        const { a, b, c, d } = preset.lengths;
        maxError = Math.max(maxError,
          Math.abs(distance(A, B) - a), Math.abs(distance(B, C) - b),
          Math.abs(distance(C, D) - c), Math.abs(distance(A, D) - d),
          distance(P, {
            x: B.x + preset.coupler.fraction * (C.x - B.x) - preset.coupler.offset * (C.y - B.y) / b,
            y: B.y + preset.coupler.fraction * (C.y - B.y) + preset.coupler.offset * (C.x - B.x) / b,
          }),
        );
        const cross = (D.x - B.x) * (C.y - B.y) - (D.y - B.y) * (C.x - B.x);
        if (branch === 'plus' ? cross < -1e-9 : cross > 1e-9) wrongSide++;
        if (![A, B, C, D, P].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) badNumbers++;
      }
      expect(solved, `${preset.id}/${branch}: reachable samples`).toBeGreaterThan(30);
      expect(maxError, `${preset.id}/${branch}: actual rod lengths and local tracer`).toBeLessThan(1e-8);
      expect(wrongSide, `${preset.id}/${branch}: branch never silently flips`).toBe(0);
      expect(badNumbers).toBe(0);
    }
  }
  expect(JSON.stringify(presets)).toBe(original);
});

test('tangent, unreachable, concentric, coincident, impossible, and collinear limits are explicit', () => {
  const tangent = { a: 1, b: 2, c: 1, d: 2 };
  for (const angle of [0, Math.PI]) {
    const plus = solveFourBar(tangent, angle, 'plus');
    const minus = solveFourBar(tangent, angle, 'minus');
    expect(plus.status).toBe('tangent');
    expect(minus.status).toBe('tangent');
    expect(plus.pose!.C).toEqual(minus.pose!.C);
    expect(plus.pose!.closureError).toBeLessThan(1e-12);
  }
  expect(solveFourBar(tangent, 0).reason).toBe('internal-tangent');
  expect(solveFourBar(tangent, Math.PI).reason).toBe('external-tangent');
  expect(solveFourBar({ a: 1, b: 1, c: 1, d: 2 }, Math.PI)).toMatchObject({
    status: 'unreachable', reason: 'separate-circles', pose: null,
  });
  expect(solveFourBar({ a: 2, b: 3, c: 1, d: 2.5 }, 0)).toMatchObject({
    status: 'unreachable', reason: 'contained-circles', pose: null,
  });
  expect(solveFourBar({ a: 2, b: 3, c: 1, d: 2 }, 0)).toMatchObject({
    status: 'unreachable', reason: 'concentric-circles', pose: null,
  });
  for (const branch of branches) {
    const coincident = solveFourBar({ a: 2, b: 3, c: 3, d: 2 }, 0, branch);
    expect(coincident).toMatchObject({ status: 'coincident', reason: 'coincident-circles', pose: null });
    expect(coincident.message).toContain('Infinitely many');
    expect(solveFourBar({ a: 2, b: 3, c: 3, d: 2 }, 0.001, branch).status).toBe('closed');
  }
  const impossible = { a: 1, b: 1, c: 1, d: 4 };
  for (let angle = 0; angle < TAU; angle += 0.13) {
    expect(solveFourBar(impossible, angle)).toMatchObject({ status: 'impossible', pose: null });
  }
  expect(reachableIntervals(impossible)).toEqual([]);
  expect(classifyLinkage(impossible).kind).toBe('impossible');
  const isolated = { a: 1, b: 1, c: 1, d: 3 };
  expect(classifyLinkage(isolated).kind).toBe('degenerate');
  expect(reachableIntervals(isolated)).toEqual([{ start: 0, end: 0 }]);
  expect(solveFourBar(isolated, 0).status).toBe('tangent');
  expect(solveFourBar(isolated, 0.1).status).toBe('unreachable');
  expect(sampleTrace(isolated, 'plus', { fraction: 0.5, offset: 0 }).segments[0]).toHaveLength(1);
});

test('Grashof classification respects the fixed link, equality, and invalid inputs', () => {
  const inversions: [LinkLengths, string, boolean, boolean][] = [
    [{ a: 1, b: 3, c: 3, d: 4 }, 'crank-rocker', true, false],
    [{ a: 3, b: 4, c: 3, d: 1 }, 'double-crank', true, true],
    [{ a: 3, b: 3, c: 1, d: 4 }, 'rocker-crank', false, true],
    [{ a: 3, b: 1, c: 3, d: 4 }, 'double-rocker', false, false],
  ];
  for (const [lengths, kind, inputFullTurn, outputFullTurn] of inversions) {
    expect(classifyLinkage(lengths)).toMatchObject({ kind, criterion: 'grashof', inputFullTurn, outputFullTurn });
  }
  expect(classifyLinkage(presets[3].lengths)).toMatchObject({
    kind: 'double-rocker', criterion: 'non-grashof', inputFullTurn: false, outputFullTurn: false,
  });
  expect(classifyLinkage({ a: 1, b: 3, c: 1, d: 3 })).toMatchObject({
    kind: 'change-point', criterion: 'equality', inputFullTurn: true, outputFullTurn: true,
  });
  expect(classifyLinkage({ a: 2, b: 1, c: 2, d: 3 })).toMatchObject({
    kind: 'change-point', inputFullTurn: false, outputFullTurn: false,
  });
  for (const key of ['a', 'b', 'c', 'd'] as const) {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
      const lengths = { ...presets[0].lengths, [key]: value };
      expect(lengthIssue(lengths)).not.toBeNull();
      expect(classifyLinkage(lengths)).toMatchObject({ kind: 'invalid', inputFullTurn: false });
      expect(solveFourBar(lengths, 1)).toMatchObject({ status: 'invalid', pose: null });
      expect(sampleTrace(lengths, 'plus', presets[0].coupler).segments).toEqual([]);
    }
  }
  const lengths = presets[0].lengths;
  for (const result of [
    solveFourBar(lengths, NaN),
    solveFourBar(lengths, Infinity),
    solveFourBar(lengths, 1, 'plus', { fraction: NaN, offset: 0 }),
    solveFourBar(lengths, 1, 'minus', { fraction: 0.5, offset: Infinity }),
    solveFourBar(lengths, 1, 'unknown' as AssemblyBranch),
    solveFourBar({ a: 1e300, b: 1, c: 1, d: 1 }, 1),
  ]) {
    expect(result).toMatchObject({ status: 'invalid', pose: null });
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  }
  for (const scale of [1e-6, 1e6]) {
    const scaled = Object.fromEntries(Object.entries(lengths).map(([key, value]) => [key, value * scale])) as unknown as LinkLengths;
    const point = { ...presets[0].coupler, offset: presets[0].coupler.offset * scale };
    const pose = solveFourBar(scaled, 1.17, 'minus', point).pose!;
    const original = solveFourBar(lengths, 1.17, 'minus', presets[0].coupler).pose!;
    expect(pose.C.x / scale).toBeCloseTo(original.C.x, 10);
    expect(pose.C.y / scale).toBeCloseTo(original.C.y, 10);
    expect(pose.P.x / scale).toBeCloseTo(original.P.x, 10);
    expect(pose.P.y / scale).toBeCloseTo(original.P.y, 10);
    expect(classifyLinkage(scaled).kind).toBe(classifyLinkage(lengths).kind);
  }
});

test('traces and reverse seeking are deterministic, with exact reachable endpoints and no gap bridges', () => {
  for (const preset of presets) {
    for (const branch of branches) {
      const trace = sampleTrace(preset.lengths, branch, preset.coupler);
      expect(sampleTrace(preset.lengths, branch, preset.coupler)).toEqual(trace);
      const angles = [0, 0.21, 0.7, 1.4, 2.9, 3.14159, 4.2, 5.9, TAU];
      const forward = angles.map((angle) => solveFourBar(preset.lengths, angle, branch, preset.coupler));
      const reverse = [...angles].reverse().map((angle) => solveFourBar(preset.lengths, angle, branch, preset.coupler)).reverse();
      expect(reverse).toEqual(forward);
      for (const segment of trace.segments) {
        let missingMidpoints = 0;
        let incorrectPoints = 0;
        for (let index = 0; index < segment.length; index++) {
          const sample = segment[index];
          const result = solveFourBar(preset.lengths, sample.angle, branch, preset.coupler);
          if (!result.pose || distance(sample.point, result.pose.P) > 1e-10) incorrectPoints++;
          if (index && !solveFourBar(preset.lengths, (sample.angle + segment[index - 1].angle) / 2, branch).pose) missingMidpoints++;
        }
        expect(incorrectPoints).toBe(0);
        expect(missingMidpoints, 'Adjacent ink samples must not straddle a missing pose').toBe(0);
      }
    }
  }
  const almostFull = { a: 1, b: 1.5, c: 1.4999999, d: 2 };
  const narrowGap = sampleTrace(almostFull, 'plus', { fraction: 0.5, offset: 0 }, 16);
  expect(narrowGap.intervals).toHaveLength(2);
  expect(narrowGap.segments).toHaveLength(2);
  expect(narrowGap.segments[0].at(-1)!.angle).toBe(narrowGap.intervals[0].end);
  expect(narrowGap.segments[1][0].angle).toBe(narrowGap.intervals[1].start);
  expect(narrowGap.intervals[1].start - narrowGap.intervals[0].end).toBeLessThan(TAU / 900);
  expect(solveFourBar(almostFull, Math.PI).status).toBe('unreachable');
  const coincident = sampleTrace({ a: 2, b: 3, c: 3, d: 2 }, 'plus', { fraction: 0.5, offset: 0 });
  expect(coincident.segments).toHaveLength(1);
  expect(coincident.segments[0][0].angle).toBeGreaterThan(0);
  expect(coincident.segments[0].at(-1)!.angle).toBeLessThan(TAU);
  expect(distance(coincident.segments[0][0].point, coincident.segments[0].at(-1)!.point)).toBeGreaterThan(1);
  expect(() => sampleTrace(presets[0].lengths, 'plus', presets[0].coupler, 1)).toThrow(RangeError);
});

test('the Chebyshev segment is genuinely solved and only approximately straight', () => {
  const preset = presets.find((item) => item.id === 'chebyshev')!;
  const segment = sampleWindow(preset.lengths, 'plus', preset.coupler, radians(65), radians(95));
  expect(segment).toHaveLength(121);
  const measurement = chordDeviation(segment)!;
  expect(measurement.span).toBeCloseTo(1.2922330532672, 10);
  expect(measurement.deviation).toBeCloseTo(0.0958928520026, 10);
  expect(measurement.deviation).toBeGreaterThan(0.01);
  expect(measurement.deviation / measurement.span).toBeLessThan(0.08);
  expect(classifyLinkage(preset.lengths)).toMatchObject({
    kind: 'double-rocker', criterion: 'grashof', shortest: ['b'], inputFullTurn: false,
  });
  expect(sampleWindow(preset.lengths, 'plus', preset.coupler, 0, TAU)).toEqual([]);
});

test('edited proportions agree with independent circle-distance checks and local point endpoints', () => {
  let seed = 59059;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let mismatches = 0;
  let maxResidual = 0;
  let checked = 0;
  for (let model = 0; model < 120; model++) {
    const lengths = { a: 0.2 + 8 * random(), b: 0.2 + 8 * random(), c: 0.2 + 8 * random(), d: 0.2 + 8 * random() };
    for (let frame = 0; frame < 36; frame++) {
      const angle = (frame + 0.37) * TAU / 36;
      const B = { x: lengths.a * Math.cos(angle), y: lengths.a * Math.sin(angle) };
      const separation = Math.hypot(lengths.d - B.x, B.y);
      const closes = separation >= Math.abs(lengths.b - lengths.c) && separation <= lengths.b + lengths.c;
      for (const branch of branches) {
        const solution = solveFourBar(lengths, angle, branch, { fraction: -0.4, offset: 1.7 });
        checked++;
        if ((solution.pose !== null) !== closes) mismatches++;
        if (solution.pose) {
          maxResidual = Math.max(maxResidual, solution.pose.closureError);
          const atB = solveFourBar(lengths, angle, branch, { fraction: 0, offset: 0 }).pose!;
          const atC = solveFourBar(lengths, angle, branch, { fraction: 1, offset: 0 }).pose!;
          maxResidual = Math.max(maxResidual, distance(atB.P, atB.B), distance(atC.P, atC.C));
        }
      }
    }
  }
  expect(checked).toBe(8640);
  expect(mismatches).toBe(0);
  expect(maxResidual).toBeLessThan(1e-10);
});

test('playback advancement stops before crossing even a sub-sample unreachable gap', () => {
  const lengths = presets[2].lengths;
  const boundary = reachableIntervals(lengths)[0].end;
  expect(advanceInput(lengths, radians(100), radians(30))).toEqual({ angle: boundary, stopped: true });
  expect(advanceInput(lengths, boundary, radians(1))).toEqual({ angle: boundary, stopped: true });
  expect(advanceInput(lengths, radians(78), radians(1))).toEqual({ angle: radians(79), stopped: false });
  const near = { a: 1, b: 1.5, c: 1.4999999, d: 2 };
  expect(advanceInput(near, Math.PI - 0.01, 0.1)).toEqual({ angle: reachableIntervals(near)[0].end, stopped: true });
  expect(advanceInput(presets[0].lengths, TAU - 0.1, 0.2).angle).toBeCloseTo(0.1, 12);
  expect(advanceInput({ a: 2, b: 3, c: 3, d: 2 }, TAU - 0.001, 0.01)).toEqual({ angle: TAU, stopped: true });
  expect(advanceInput({ a: 2, b: 3, c: 3, d: 2 }, 0, 0.1)).toEqual({ angle: 0, stopped: true });
  expect(() => advanceInput(lengths, 0, Infinity)).toThrow(RangeError);
});

async function openAtlas(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto(projectURL);
  const root = page.locator('.project-linkage-atlas');
  await expect(root.locator('svg.la-scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Linkage Atlas', exact: true })).toBeVisible();
  return root;
}

async function setRange(input: Locator, value: number) {
  await input.evaluate((element: HTMLInputElement, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('desktop controls alter actual rod geometry and traces; seeking, playback, and reset agree', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1360, height: 1000 });
  const root = await openAtlas(page);
  const trace = root.locator('[data-trace]');
  const initialPath = await trace.getAttribute('d');
  await expect(root.getByLabel('Choose a study', { exact: true })).toHaveValue('crank-rocker');
  await expect(root.getByLabel('Assembly branch', { exact: true })).toHaveValue('plus');
  await expect(root.getByLabel('Speed', { exact: true })).toHaveValue('1');
  await expect(root.locator('output:not([aria-live="off"])')).toHaveCount(0);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-angle', '55.000000');
  expect((await root.locator('.la-scene').boundingBox())!.y).toBeLessThan(300);

  for (const [name, value] of [
    ['Input length a', '1.7'], ['Coupler length b', '4.1'], ['Output length c', '3.2'], ['Ground length d', '4.4'],
  ]) {
    const beforePath = await trace.getAttribute('d');
    const beforePose = await root.locator('[data-joint="C"]').getAttribute('transform');
    await page.getByRole('spinbutton', { name, exact: true }).fill(value);
    await expect(root).toHaveAttribute('data-status', 'closed');
    expect(await trace.getAttribute('d'), `${name} changes the solved path`).not.toBe(beforePath);
    expect(await root.locator('[data-joint="C"]').getAttribute('transform'), `${name} changes geometry`).not.toBe(beforePose);
  }
  await expect(root).toHaveAttribute('data-custom', 'true');
  const plusPath = await trace.getAttribute('d');
  const plusC = await root.locator('[data-joint="C"]').getAttribute('transform');
  await page.getByRole('combobox', { name: 'Assembly branch', exact: true }).selectOption('minus');
  expect(await trace.getAttribute('d')).not.toBe(plusPath);
  expect(await root.locator('[data-joint="C"]').getAttribute('transform')).not.toBe(plusC);
  await page.getByRole('combobox', { name: 'Assembly branch', exact: true }).selectOption('plus');
  expect(await trace.getAttribute('d')).toBe(plusPath);
  expect(await root.locator('[data-joint="C"]').getAttribute('transform')).toBe(plusC);

  const fraction = page.getByRole('slider', { name: 'Coupler fraction', exact: true });
  const point = root.locator('[data-joint="P"]');
  const firstPoint = await point.getAttribute('data-x');
  await setRange(fraction, 0.7);
  expect(await point.getAttribute('data-x')).not.toBe(firstPoint);
  expect(await trace.getAttribute('d')).not.toBe(plusPath);
  const fractionPath = await trace.getAttribute('d');
  await setRange(page.getByRole('slider', { name: 'Normal offset', exact: true }), -0.4);
  expect(await trace.getAttribute('d')).not.toBe(fractionPath);
  await fraction.focus();
  await fraction.press('ArrowRight');
  await expect(fraction).toHaveValue('0.71');
  await page.getByRole('checkbox', { name: 'Closure circles', exact: true }).check();
  await expect(root.locator('[data-construction] circle')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Other assembly trace', exact: true }).check();
  expect((await root.locator('[data-other-trace]').getAttribute('d'))!.length).toBeGreaterThan(100);
  await expect(root.locator('[data-other-legend]')).toBeVisible();

  const angle = page.getByRole('slider', { name: 'Input angle', exact: true });
  await setRange(angle, 47);
  const pointAt47 = await point.evaluate((element) => element.outerHTML);
  const pathAt47 = await trace.getAttribute('d');
  await setRange(angle, 203);
  await setRange(angle, 47);
  expect(await point.evaluate((element) => element.outerHTML)).toBe(pointAt47);
  expect(await trace.getAttribute('d')).toBe(pathAt47);
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Play mechanism', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-angle'))).toBeGreaterThan(47.5);
  await page.getByRole('button', { name: 'Pause mechanism', exact: true }).click();
  const stopped = await root.getAttribute('data-angle');
  await page.waitForTimeout(100);
  expect(await root.getAttribute('data-angle')).toBe(stopped);
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '55.000000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-custom', 'false');
  await expect(root).toHaveAttribute('data-speed', '1');
  await expect(page.getByLabel('Input length a', { exact: true })).toHaveValue('1.2');
  await expect(fraction).toHaveValue('0.55');
  await expect(page.getByLabel('Normal offset', { exact: true })).toHaveValue('0.85');
  await expect(page.getByLabel('Other assembly trace', { exact: true })).not.toBeChecked();
  expect(await trace.getAttribute('d')).toBe(initialPath);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('linkage-atlas-desktop.png')) });
  expect(errors).toEqual([]);
});

test('invalid lengths and unreachable or nonunique angles remove the current pose without changing branches', async ({ page }) => {
  const root = await openAtlas(page);
  const input = page.getByRole('spinbutton', { name: 'Input length a', exact: true });
  for (const invalid of ['0', '-1', '']) {
    await input.fill(invalid);
    await expect(root).toHaveAttribute('data-status', 'invalid');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(root.locator('[data-joint="P"], [data-joint="C"], [data-link="b"], [data-link="c"]')).toHaveCount(0);
    await expect(root.locator('[data-point]')).toHaveText('—, —');
    await expect(root.locator('[data-trace]')).toHaveAttribute('d', '');
    await expect(page.getByRole('button', { name: 'Play mechanism', exact: true })).toBeDisabled();
    expect(await root.locator('.la-scene').innerHTML()).not.toMatch(/NaN|Infinity/);
  }
  await input.fill('1.2');
  await expect(root).toHaveAttribute('data-status', 'closed');
  await page.getByLabel('Ground length d', { exact: true }).fill('20');
  await expect(root).toHaveAttribute('data-status', 'impossible');
  await page.getByRole('combobox', { name: 'Assembly branch', exact: true }).selectOption('minus');
  await expect(root).toHaveAttribute('data-status', 'impossible');
  await expect(root).toHaveAttribute('data-branch', 'minus');
  await expect(root.locator('[data-joint="C"], [data-joint="P"]')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Choose a study', exact: true }).selectOption('chebyshev');
  await expect(root.locator('[data-highlight-note]')).toContainText('0.096 units');
  expect((await root.locator('[data-highlight]').getAttribute('d'))!.length).toBeGreaterThan(100);
  const angle = page.getByRole('slider', { name: 'Input angle', exact: true });
  await setRange(angle, 0);
  await expect(root).toHaveAttribute('data-status', 'unreachable');
  await page.getByRole('combobox', { name: 'Assembly branch', exact: true }).selectOption('minus');
  await expect(root).toHaveAttribute('data-status', 'unreachable');
  await expect(root.locator('[data-joint="C"], [data-joint="P"]')).toHaveCount(0);
  await setRange(angle, 78);
  await expect(root).toHaveAttribute('data-status', 'closed');
  await expect(root).toHaveAttribute('data-branch', 'minus');
  await expect(root.locator('[data-highlight]')).toHaveAttribute('d', '');
  const minusPoint = await root.locator('[data-joint="P"]').getAttribute('data-y');
  await setRange(angle, 180);
  await expect(root).toHaveAttribute('data-status', 'unreachable');
  await setRange(angle, 78);
  expect(await root.locator('[data-joint="P"]').getAttribute('data-y')).toBe(minusPoint);

  for (const [name, value] of [
    ['Input length a', '2'], ['Ground length d', '2'], ['Coupler length b', '3'], ['Output length c', '3'],
  ]) await page.getByLabel(name, { exact: true }).fill(value);
  await setRange(angle, 0);
  await expect(root).toHaveAttribute('data-status', 'coincident');
  await expect(root.locator('[data-plot-message]')).toContainText('Infinitely many');
  await expect(root.locator('[data-joint="C"], [data-joint="P"]')).toHaveCount(0);
  await setRange(angle, 0.1);
  await expect(root).toHaveAttribute('data-status', 'closed');
  expect(await root.locator('.la-scene').innerHTML()).not.toMatch(/NaN|Infinity/);

  await page.getByRole('combobox', { name: 'Choose a study', exact: true }).selectOption('change-point');
  await setRange(angle, 0);
  await expect(root).toHaveAttribute('data-status', 'tangent');
  const tangentC = await root.locator('[data-joint="C"]').evaluate((element) =>
    [element.getAttribute('data-x'), element.getAttribute('data-y')]);
  await page.getByRole('combobox', { name: 'Assembly branch', exact: true }).selectOption('minus');
  await expect(root).toHaveAttribute('data-status', 'tangent');
  expect(await root.locator('[data-joint="C"]').evaluate((element) =>
    [element.getAttribute('data-x'), element.getAttribute('data-y')])).toEqual(tangentC);
  await expect(root.locator('[data-classification]')).toHaveText('Change-point linkage');
});

test('all studies work and playing a rocker stops at its exact closure boundary', async ({ page }) => {
  const root = await openAtlas(page);
  const chooser = page.getByRole('combobox', { name: 'Choose a study', exact: true });
  for (const preset of presets) {
    await chooser.selectOption(preset.id);
    await expect(root).toHaveAttribute('data-status', 'closed');
    await expect(root).toHaveAttribute('data-preset', preset.id);
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(root.locator('[data-observation]')).toHaveText(preset.observation);
    await expect(root.locator('[data-joint="P"]')).toHaveCount(1);
  }
  await chooser.selectOption('chebyshev');
  await setRange(page.getByRole('slider', { name: 'Input angle', exact: true }), 100);
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Play mechanism', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '101.536959');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-status', 'tangent');
  await expect(root).toHaveAttribute('data-branch', 'plus');
  await expect(root.locator('[data-playback-note]')).toContainText('Boundary reached');
  await page.getByRole('button', { name: 'Step back 1 degree', exact: true }).click();
  await expect(root).toHaveAttribute('data-status', 'closed');
  expect(Number(await root.getAttribute('data-angle'))).toBeCloseTo(100.536959, 6);
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '78.000000');
  await expect(root).toHaveAttribute('data-preset', 'chebyshev');
});

test('pin B is draggable with pointercancel cleanup and equivalent keyboard angle controls', async ({ page }) => {
  const root = await openAtlas(page);
  const handle = page.getByRole('slider', { name: 'Input angle handle', exact: true });
  const aBox = (await root.locator('[data-joint="A"]').boundingBox())!;
  const bBox = (await handle.boundingBox())!;
  const A = { x: aBox.x + aBox.width / 2, y: aBox.y + aBox.height / 2 };
  const B = { x: bBox.x + bBox.width / 2, y: bBox.y + bBox.height / 2 };
  const radius = distance(A, B);
  await page.mouse.move(B.x, B.y);
  await page.mouse.down();
  await expect(root).toHaveAttribute('data-dragging', 'true');
  await page.mouse.move(A.x + radius * Math.cos(radians(110)), A.y - radius * Math.sin(radians(110)), { steps: 8 });
  expect(Number(await root.getAttribute('data-angle'))).toBeCloseTo(110, 1);
  await handle.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true });
  await expect(root).toHaveAttribute('data-dragging', 'false');
  const afterCancel = await root.getAttribute('data-angle');
  await page.mouse.move(B.x, B.y);
  await page.mouse.up();
  expect(await root.getAttribute('data-angle')).toBe(afterCancel);
  expect(await handle.evaluate((element) => (element as SVGElement).hasPointerCapture(1))).toBe(false);
  await handle.focus();
  await handle.press('Home');
  await expect(root).toHaveAttribute('data-angle', '0.000000');
  await handle.press('ArrowRight');
  await expect(root).toHaveAttribute('data-angle', '1.000000');
  await handle.press('Shift+ArrowUp');
  await expect(root).toHaveAttribute('data-angle', '11.000000');
  await handle.press('End');
  await expect(root).toHaveAttribute('data-angle', '360.000000');
  const input = page.getByRole('slider', { name: 'Input angle', exact: true });
  await input.focus();
  await input.press('ArrowLeft');
  await expect(root).toHaveAttribute('data-angle', '359.900000');
  await input.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
});

test('375px view has immediate legible geometry, generous controls, and live reduced-motion behavior', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openAtlas(page, 'no-preference');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(250);
  expect((await root.locator('.la-scene').boundingBox())!.y).toBeLessThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(root.locator('.la-scene')).toHaveCSS('touch-action', 'pan-y');
  await expect(root.locator('[data-angle-handle]')).toHaveCSS('touch-action', 'none');
  // Query animated labels inside the same evaluation; their nodes are replaced between frames.
  const labelSizes = await root.locator('.la-scene').evaluate((svg: SVGSVGElement) => {
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return [...svg.querySelectorAll('text')].map((element) => parseFloat(getComputedStyle(element).fontSize) * scale);
  });
  expect(labelSizes.length).toBeGreaterThan(0);
  expect(Math.min(...labelSizes)).toBeGreaterThanOrEqual(12);
  for (const control of await root.locator('button, select, input:not([type="checkbox"]), .la-toggles label').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const target = (await root.locator('[data-angle-handle]').boundingBox())!;
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const atRest = await root.getAttribute('data-angle');
  await page.waitForTimeout(100);
  expect(await root.getAttribute('data-angle')).toBe(atRest);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('button', { name: 'Play mechanism', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-motion-note]')).toBeVisible();
  await page.getByRole('button', { name: 'Reset study', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: relative(process.cwd(), testInfo.outputPath('linkage-atlas-mobile.png')) });
});

test('abort and repeated destroy cancel frames, disconnect resize, and leave stale APIs inert', async ({ page }) => {
  await openAtlas(page);
  const result = await page.evaluate(async () => {
    const source = '/src/projects/linkage-atlas/index.ts';
    const { mount } = await import(source);
    const host = document.createElement('div');
    host.style.width = '720px';
    document.body.append(host);
    const controller = new AbortController();
    const pending = new Set<number>();
    const observers = new Set<ResizeObserver>();
    const preferences: MediaQueryList[] = [];
    const reports: string[] = [];
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const NativeObserver = window.ResizeObserver;
    const nativeMedia = window.matchMedia.bind(window);
    let rendered = 0;
    window.requestAnimationFrame = (callback) => {
      const id = nativeRequest((time) => { pending.delete(id); rendered++; callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); nativeCancel(id); };
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    window.matchMedia = (value) => { const media = nativeMedia(value); preferences.push(media); return media; };
    const nextFrame = () => new Promise<void>((resolve) => nativeRequest(() => resolve()));
    try {
      const instance = mount({
        container: host, controls: document.createElement('div'), signal: controller.signal,
        reducedMotion: false, report: (message: string) => reports.push(message),
      });
      const root = host.querySelector<HTMLElement>('.project-linkage-atlas')!;
      const openingMotion = root.dataset.motion;
      const stalePlay = root.querySelector<HTMLButtonElement>('[data-play]')!;
      const staleLength = root.querySelector<HTMLInputElement>('[data-length="a"]')!;
      instance.setPaused(false);
      await nextFrame();
      await nextFrame();
      await nextFrame();
      const before = {
        pending: pending.size, observers: observers.size, rendered,
        angle: Number(root.dataset.angle), motion: root.dataset.motion,
      };
      controller.abort();
      instance.destroy();
      instance.destroy();
      const stoppedFrames = rendered;
      const stoppedReports = reports.length;
      const stoppedAngle = root.dataset.angle;
      stalePlay.click();
      staleLength.value = '0';
      staleLength.dispatchEvent(new Event('input', { bubbles: true }));
      preferences.forEach((preference) => preference.dispatchEvent(new Event('change')));
      instance.setPaused(false);
      instance.reset();
      await nextFrame();
      await nextFrame();
      return {
        openingMotion, before, pending: pending.size, observers: observers.size,
        newFrames: rendered - stoppedFrames, newReports: reports.length - stoppedReports,
        removed: !root.isConnected && host.childElementCount === 0,
        unchanged: root.dataset.angle === stoppedAngle,
      };
    } finally {
      controller.abort();
      host.remove();
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      window.ResizeObserver = NativeObserver;
      window.matchMedia = nativeMedia;
    }
  });
  const { before, ...after } = result;
  expect(before).toMatchObject({ pending: 1, observers: 1, motion: 'playing' });
  expect(before.rendered).toBeGreaterThan(0);
  expect(before.angle).toBeGreaterThan(55);
  expect(after).toEqual({
    openingMotion: 'paused', pending: 0, observers: 0,
    newFrames: 0, newReports: 0, removed: true, unchanged: true,
  });
});
