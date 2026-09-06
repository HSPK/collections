import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DEFAULT_SETTINGS, LAWS, OPENING_ANGLE, PRESETS } from '../../src/projects/cam-workshop/data';
import type { CamSettings } from '../../src/projects/cam-workshop/data';
import {
  DEG, advanceAngle, assertSettings, boundaryValues, derivativePeaks, motionSegments,
  normalizedLaw, profilePoint, rotateCamPoint, sampleCurves, sampleMotion, sampleProfile, validateTiming,
} from '../../src/projects/cam-workshop/engine';

test('all three analytic laws have exact endpoints, properly signed return derivatives, and explicit one-sided boundaries', () => {
  for (const law of LAWS) {
    expect(normalizedLaw(law.id, 0).f).toBe(0);
    expect(normalizedLaw(law.id, 1).f).toBe(1);
    expect(normalizedLaw(law.id, 0).df).toBe(0);
    expect(normalizedLaw(law.id, 1).df).toBe(0);
    if (law.id !== 'harmonic') {
      expect(normalizedLaw(law.id, 0).ddf).toBe(0);
      expect(normalizedLaw(law.id, 1).ddf).toBe(0);
    }
    for (const preset of PRESETS) {
      const settings: CamSettings = { ...DEFAULT_SETTINGS, ...preset, law: law.id };
      expect(sampleMotion(settings, 0).s).toBe(0);
      expect(sampleMotion(settings, settings.rise).s).toBe(settings.lift);
      expect(sampleMotion(settings, settings.rise + settings.high).s).toBe(settings.lift);
      expect(sampleMotion(settings, settings.rise + settings.high + settings.return).s).toBe(0);
      expect(sampleMotion(settings, 360)).toEqual(sampleMotion(settings, 0));
      expect(sampleMotion(settings, -45)).toEqual(sampleMotion(settings, 315));
      const segments = sampleCurves(settings);
      expect(segments.length).toBe(preset.id === 'no-dwells' ? 2 : 4);
      for (const segment of segments) {
        expect(Math.abs(segment[0].velocity)).toBe(0);
        expect(Math.abs(segment.at(-1)!.velocity)).toBe(0);
        for (const point of segment) {
          expect(point.s).toBeGreaterThanOrEqual(0);
          expect(point.s).toBeLessThanOrEqual(settings.lift);
          if (point.segment === 'rise') expect(point.velocity).toBeGreaterThanOrEqual(0);
          if (point.segment === 'return') expect(point.velocity).toBeLessThanOrEqual(0);
        }
      }
    }
    const settings: CamSettings = { ...DEFAULT_SETTINGS, law: law.id };
    for (const angle of [0, settings.rise, settings.rise + settings.high, 300, 360]) {
      const boundary = boundaryValues(settings, angle)!;
      expect(boundary).toBeDefined();
      expect(boundary.left.s).toBeCloseTo(boundary.right.s, 12);
      expect(boundary.left.velocity).toBeCloseTo(boundary.right.velocity, 12);
      expect(boundary.accelerationJump).toBe(law.id === 'harmonic');
      expect(sampleMotion(settings, angle)).toEqual(boundary.right);
    }
    expect(boundaryValues(settings, 42)).toBeUndefined();
  }
  const noDwells = { ...DEFAULT_SETTINGS, rise: 180, high: 0, return: 180, law: 'harmonic' as const };
  expect(boundaryValues(noDwells, 0)!.accelerationJump).toBe(false);
  expect(boundaryValues(noDwells, 180)!.accelerationJump).toBe(false);
  const harmonicCurves = sampleCurves({ ...DEFAULT_SETTINGS, law: 'harmonic' });
  expect(harmonicCurves[0].at(-1)!.acceleration).toBeLessThan(0);
  expect(harmonicCurves[1][0].acceleration).toBe(0);
  expect(harmonicCurves[0].at(-1)!.angle).toBe(harmonicCurves[1][0].angle);
});

test('finite differences verify every law and h/beta, h/beta² derivative scaling in radians', () => {
  for (const law of LAWS) {
    for (const u of [0.03, 0.15, 0.37, 0.5, 0.71, 0.96]) {
      const epsilon = 1e-5;
      const sample = normalizedLaw(law.id, u);
      const plus = normalizedLaw(law.id, u + epsilon);
      const minus = normalizedLaw(law.id, u - epsilon);
      expect((plus.f - minus.f) / (2 * epsilon)).toBeCloseTo(sample.df, 7);
      expect((plus.df - minus.df) / (2 * epsilon)).toBeCloseTo(sample.ddf, 6);
    }
    for (const preset of PRESETS) {
      const settings: CamSettings = { ...DEFAULT_SETTINGS, ...preset, law: law.id };
      for (const segment of motionSegments(settings).filter((part) => part.id === 'rise' || part.id === 'return')) {
        for (const u of [0.09, 0.31, 0.52, 0.79, 0.93]) {
          const theta = segment.start + segment.duration * u;
          const epsilonRadians = 1e-5;
          const sample = sampleMotion(settings, theta);
          const plus = sampleMotion(settings, theta + epsilonRadians / DEG);
          const minus = sampleMotion(settings, theta - epsilonRadians / DEG);
          expect((plus.s - minus.s) / (2 * epsilonRadians)).toBeCloseTo(sample.velocity, 6);
          expect((plus.velocity - minus.velocity) / (2 * epsilonRadians)).toBeCloseTo(sample.acceleration, 6);
        }
      }
    }
    const longer = { ...DEFAULT_SETTINGS, law: law.id, rise: 100, high: 40, return: 120 };
    const shorter = { ...longer, rise: 50 };
    const a = sampleMotion(longer, 31);
    const b = sampleMotion(shorter, 15.5);
    expect(b.s).toBeCloseTo(a.s, 12);
    expect(b.velocity).toBeCloseTo(a.velocity * 2, 12);
    expect(b.acceleration).toBeCloseTo(a.acceleration * 4, 12);
    const peaks = derivativePeaks(longer);
    expect(peaks.velocity).toBeCloseTo(longer.lift / (100 * DEG) * law.peakFirst, 12);
    expect(peaks.acceleration).toBeCloseTo(longer.lift / (100 * DEG) ** 2 * law.peakSecond, 12);
  }
});

test('timing, geometry, and playback reject invalid ranges without redistributing inputs', () => {
  const valid = [
    { rise: 1, high: 358, return: 1 },
    { rise: 359, high: 0, return: 1 },
    { rise: 1, high: 0, return: 359 },
    { rise: 180, high: 0, return: 180 },
    { rise: 1, high: 0, return: 1 },
  ];
  for (const timing of valid) {
    expect(validateTiming(timing)).toEqual({ ok: true, timing: { ...timing, low: 360 - timing.rise - timing.high - timing.return } });
    expect(() => assertSettings({ ...DEFAULT_SETTINGS, ...timing })).not.toThrow();
  }
  for (const patch of [
    { rise: 0 }, { rise: -1 }, { rise: 1.5 }, { high: -1 }, { high: 359 },
    { return: 0 }, { rise: Infinity }, { return: NaN }, { high: 200 },
  ]) {
    const candidate = { ...DEFAULT_SETTINGS, ...patch };
    const unchanged = { ...candidate };
    expect(validateTiming(candidate).ok).toBe(false);
    expect(() => sampleMotion(candidate, 0)).toThrow(RangeError);
    expect(candidate).toEqual(unchanged);
  }
  for (const patch of [{ base: 0 }, { base: 1.81 }, { lift: 0 }, { lift: 1.21 }, { lift: Infinity }]) {
    expect(() => assertSettings({ ...DEFAULT_SETTINGS, ...patch })).toThrow(RangeError);
  }
  expect(() => normalizedLaw('harmonic', -0.1)).toThrow(RangeError);
  expect(() => normalizedLaw('cycloidal', NaN)).toThrow(RangeError);
  expect(() => sampleMotion(DEFAULT_SETTINGS, Infinity)).toThrow(RangeError);
  expect(() => sampleCurves(DEFAULT_SETTINGS, 1)).toThrow(RangeError);
  expect(advanceAngle(360, 0, 8)).toBe(360);
  expect(advanceAngle(359, 1 / 48, 8)).toBeCloseTo(0, 12);
  expect(advanceAngle(0, 1, 8)).toBeCloseTo(48, 12);
  expect(advanceAngle(0, 1, 20)).toBeCloseTo(120, 12);
  expect(() => advanceAngle(0, -1, 8)).toThrow(RangeError);
  expect(() => advanceAngle(0, 1, 0)).toThrow(RangeError);
});

test('the inverse-rotation profile meets the fixed world-space follower for every law and all boundaries', () => {
  for (const law of LAWS) {
    for (const timing of [...PRESETS, { rise: 1, high: 0, return: 359 }, { rise: 359, high: 0, return: 1 }]) {
      for (const geometry of [{ base: 0.8, lift: 1.2 }, { base: 1.8, lift: 0.2 }]) {
        const settings = { ...DEFAULT_SETTINGS, ...timing, ...geometry, law: law.id };
        const boundaries = motionSegments(settings).flatMap((part) => [part.start - 1e-6, part.start, part.start + 1e-6]);
        for (const angle of [...boundaries, 0, 360, 3.14159, 47.125, 173.18, 289.749, 359.99999]) {
          const bodyPoint = profilePoint(settings, angle);
          const worldPoint = rotateCamPoint(bodyPoint, angle);
          const followerRadius = settings.base + sampleMotion(settings, angle).s;
          expect(worldPoint.x).toBeCloseTo(0, 12);
          expect(worldPoint.y).toBeCloseTo(-followerRadius, 12);
          expect(Math.hypot(bodyPoint.x, bodyPoint.y)).toBeCloseTo(followerRadius, 12);
        }
        const profile = sampleProfile(settings);
        for (const part of motionSegments(settings)) expect(profile.some((point) => point.angle === part.start)).toBe(true);
        expect(profile[0].x).toBe(profile.at(-1)!.x);
        expect(profile[0].y).toBe(profile.at(-1)!.y);
      }
    }
  }
});

async function openWorkshop(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/cam-workshop/');
  const root = page.locator('.project-cam-workshop');
  await expect(root.locator('[data-cw-profile]')).toBeVisible();
  await expect(root.locator('canvas')).toHaveCount(3);
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  return root;
}

async function setRange(page: Page, selector: string, value: number) {
  await page.locator(`.project-cam-workshop ${selector}`).evaluate((node, next) => {
    const input = node as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function chartPixels(root: Locator) {
  return root.locator('canvas').evaluateAll((nodes) => nodes.map((node) => (node as HTMLCanvasElement).toDataURL()));
}

test('law, timing, comparison, and dimensions update real profiles, curves, and exact readouts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  const root = await openWorkshop(page);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await setRange(page, '[data-cw-scrub]', 31);
  const firstPath = await root.locator('[data-cw-profile]').getAttribute('d');
  const firstCurves = await chartPixels(root);
  await root.getByLabel('Motion law', { exact: true }).selectOption('harmonic');
  await expect(root).toHaveAttribute('data-law', 'harmonic');
  expect(await root.locator('[data-cw-profile]').getAttribute('d')).not.toBe(firstPath);
  expect(await chartPixels(root)).not.toEqual(firstCurves);
  expect(Number(await root.getAttribute('data-displacement'))).toBeCloseTo(sampleMotion({ ...DEFAULT_SETTINGS, law: 'harmonic' }, 31).s, 12);
  await root.locator('[data-cw-timing="rise"]').fill('90');
  await root.locator('[data-cw-timing="high"]').fill('70');
  await root.locator('[data-cw-timing="return"]').fill('130');
  await expect(root).toHaveAttribute('data-timing', '90,70,130');
  await expect(root.locator('[data-cw-low]')).toHaveText('70°');
  const timingPath = await root.locator('[data-cw-profile]').getAttribute('d');
  const timingCurves = await chartPixels(root);
  await root.locator('[data-cw-timing="rise"]').fill('300');
  await expect(root).toHaveAttribute('data-timing-valid', 'false');
  await expect(root.locator('[data-cw-error]')).toContainText('last valid timing (90° / 70° / 130°)');
  await expect(root.locator('[data-cw-timing="high"]')).toHaveValue('70');
  await expect(root.locator('[data-cw-timing="return"]')).toHaveValue('130');
  await expect(root).toHaveAttribute('data-timing', '90,70,130');
  await expect(root.getByRole('button', { name: 'Play cam', exact: true })).toBeDisabled();
  expect(await root.locator('[data-cw-profile]').getAttribute('d')).toBe(timingPath);
  expect(await chartPixels(root)).toEqual(timingCurves);
  await root.locator('[data-cw-timing="rise"]').fill('');
  await expect(root.locator('[data-cw-low]')).toHaveText('—');
  await root.locator('[data-cw-timing="rise"]').fill('0');
  await expect(root.locator('[data-cw-timing="rise"]')).toHaveAttribute('aria-invalid', 'true');
  await root.getByRole('button', { name: 'Long top dwell', exact: true }).click();
  await expect(root).toHaveAttribute('data-timing-valid', 'true');
  await expect(root).toHaveAttribute('data-timing', '60,120,120');
  await expect(root).toHaveAttribute('data-law', 'harmonic');
  await expect(root.locator('[data-cw-error]')).toBeHidden();
  await root.getByLabel('Motion law', { exact: true }).selectOption('polynomial');
  await setRange(page, '[data-cw-scrub]', 18);
  const beforeBase = await chartPixels(root);
  const basePath = await root.locator('[data-cw-profile]').getAttribute('d');
  const beforeS = await root.getAttribute('data-displacement');
  await setRange(page, '[data-cw-geometry="base"]', 1.6);
  expect(await root.locator('[data-cw-profile]').getAttribute('d')).not.toBe(basePath);
  expect(await root.getAttribute('data-displacement')).toBe(beforeS);
  expect(await chartPixels(root)).toEqual(beforeBase);
  await setRange(page, '[data-cw-geometry="lift"]', 1);
  const current: CamSettings = { law: 'polynomial', rise: 60, high: 120, return: 120, base: 1.6, lift: 1 };
  expect(Number(await root.getAttribute('data-displacement'))).toBeCloseTo(sampleMotion(current, 18).s, 12);
  expect(Number(await root.getAttribute('data-velocity'))).toBeCloseTo(sampleMotion(current, 18).velocity, 12);
  expect(Number(await root.getAttribute('data-acceleration'))).toBeCloseTo(sampleMotion(current, 18).acceleration, 12);
  for (const law of LAWS) {
    expect(Number(await root.locator(`[data-cw-peak="${law.id}-velocity"]`).textContent())).toBeCloseTo(derivativePeaks(current, law.id).velocity, 3);
  }
  const compared = await chartPixels(root);
  await root.getByLabel('Compare all three laws', { exact: true }).uncheck();
  expect(await chartPixels(root)).not.toEqual(compared);
  await root.getByLabel('Compare all three laws', { exact: true }).check();
  expect(await chartPixels(root)).toEqual(compared);
  await root.getByRole('button', { name: 'Reset workshop', exact: true }).click();
  await setRange(page, '[data-cw-scrub]', OPENING_ANGLE);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('cam-workshop-desktop.png') });
  expect(errors).toEqual([]);
});

test('the actual rendered SVG profile intersects the fixed follower blade at its apex, not a cosmetic roller', async ({ page }) => {
  const root = await openWorkshop(page);
  const guide = await root.locator('[data-cw-fixed-guide]').evaluate((node) => {
    const matrix = (node as unknown as SVGGraphicsElement).getScreenCTM()!;
    return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  });
  for (const law of LAWS) {
    await root.locator('[data-cw-law]').selectOption(law.id);
    for (const preset of ['balanced', 'no-dwells']) {
      await root.locator(`[data-cw-preset="${preset}"]`).click();
      const edges = preset === 'balanced' ? [99.9, 100, 100.1, 160, 299.9, 300] : [179.9, 180, 180.1];
      for (const angle of [0, 31.3, ...edges, 359.9, 360]) {
        await setRange(page, '[data-cw-scrub]', angle);
        const contact = await root.evaluate((node) => {
          const path = node.querySelector<SVGPathElement>('[data-cw-profile]')!;
          const blade = node.querySelector<SVGPathElement>('[data-cw-blade]')!;
          const matrix = path.getScreenCTM()!;
          const apex = new DOMPoint(0, 0).matrixTransform(blade.getScreenCTM()!);
          const center = new DOMPoint(0, 0).matrixTransform(matrix);
          const numbers = path.getAttribute('d')!.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
          const points = Array.from({ length: numbers.length / 2 }, (_, i) =>
            new DOMPoint(numbers[i * 2], numbers[i * 2 + 1]).matrixTransform(matrix));
          const hits: number[] = [];
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            if (Math.abs(a.x - apex.x) < 1e-8) hits.push(a.y);
            if ((a.x - apex.x) * (b.x - apex.x) < 0) {
              const t = (apex.x - a.x) / (b.x - a.x);
              hits.push(a.y + t * (b.y - a.y));
            }
          }
          const upper = hits.filter((y) => y < center.y);
          return {
            xError: Math.abs(apex.x - center.x),
            contactError: Math.abs(Math.min(...upper) - apex.y),
            bladePath: blade.getAttribute('d'),
            rotation: node.querySelector('[data-cw-rotor]')!.getAttribute('transform'),
            guide: (() => {
              const m = node.querySelector<SVGGraphicsElement>('[data-cw-fixed-guide]')!.getScreenCTM()!;
              return [m.a, m.b, m.c, m.d, m.e, m.f];
            })(),
          };
        });
        expect(contact.xError).toBeLessThan(1e-8);
        // SVG transform attributes are parsed at browser float precision, unlike
        // the double-precision analytic contact tests above. Tolerance is in CSS pixels.
        expect(contact.contactError, `${law.id}, ${preset}, ${angle}°`).toBeLessThan(1e-4);
        expect(contact.bladePath).toContain('L0 0');
        expect(contact.rotation).toBe(`rotate(${-angle})`);
        // Scrolling can change screen translation, but the guide's local transform never rotates or scales with the cam.
        expect(contact.guide.slice(0, 4)).toEqual(guide.slice(0, 4));
      }
    }
  }
});

test('play, pause, scrub, step, speed, and reset are deterministic, including the 360° endpoint', async ({ page }) => {
  const root = await openWorkshop(page);
  await expect(root).toHaveAttribute('data-angle', OPENING_ANGLE.toFixed(6));
  await setRange(page, '[data-cw-scrub]', 37.2);
  expect(await root.locator('[data-cw-scrub]').evaluate((node) =>
    Number.parseFloat((node as HTMLElement).style.getPropertyValue('--cw-progress')))).toBeCloseTo(37.2 / 3.6, 10);
  const stillPath = await root.locator('[data-cw-profile]').getAttribute('d');
  const stillCurves = await chartPixels(root);
  const stillFollower = await root.locator('[data-cw-follower]').getAttribute('transform');
  await setRange(page, '[data-cw-scrub]', 360);
  await expect(root).toHaveAttribute('data-angle', '360.000000');
  await setRange(page, '[data-cw-scrub]', 0);
  await setRange(page, '[data-cw-scrub]', 37.2);
  expect(await root.locator('[data-cw-profile]').getAttribute('d')).toBe(stillPath);
  expect(await chartPixels(root)).toEqual(stillCurves);
  expect(await root.locator('[data-cw-follower]').getAttribute('transform')).toBe(stillFollower);
  const slider = root.getByRole('slider', { name: 'Scrub a revolution', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(root).toHaveAttribute('data-angle', '37.300000');
  await slider.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Step forward 5 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '42.300000');
  await root.getByRole('button', { name: 'Step back 5 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '37.300000');
  await root.getByRole('button', { name: 'Reset workshop', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '0.000000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Step back 5 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '355.000000');
  await root.getByRole('button', { name: 'Step forward 5 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '360.000000');
  await root.getByRole('button', { name: 'Step forward 5 degrees', exact: true }).click();
  await expect(root).toHaveAttribute('data-angle', '5.000000');
  await root.getByLabel('Rotation speed', { exact: true }).selectOption('20');
  await expect(root).toHaveAttribute('data-speed', '20');
  await root.getByRole('button', { name: 'Play cam', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-angle'))).toBeGreaterThan(7);
  await root.getByRole('button', { name: 'Pause cam', exact: true }).click();
  const pausedAt = await root.getAttribute('data-angle');
  await page.waitForTimeout(150);
  expect(await root.getAttribute('data-angle')).toBe(pausedAt);
  await root.locator('.cw-workbench').focus();
  await root.locator('.cw-workbench').press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await root.locator('.cw-workbench').press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Reset workshop', exact: true }).click();
  await expect(root).toHaveAttribute('data-speed', '8');
  await expect(root).toHaveAttribute('data-law', 'cycloidal');
  await expect(root).toHaveAttribute('data-timing', '100,60,140');
  await expect(root).toHaveAttribute('data-comparison', 'true');
  await expect(root).toHaveAttribute('data-angle', '0.000000');
});

test('375px workbench is visible early, readable, overflow-free, and responds to live reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openWorkshop(page, 'no-preference');
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(250);
  expect((await root.locator('svg').boundingBox())!.y).toBeLessThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const angle = await root.getAttribute('data-angle');
  await page.waitForTimeout(100);
  expect(await root.getAttribute('data-angle')).toBe(angle);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.waitForTimeout(80);
  expect(await root.getAttribute('data-angle')).toBe(angle);
  for (const selector of ['[data-cw-play]', '[data-cw-reset]', '[data-cw-back]', '[data-cw-forward]', '[data-cw-scrub]', '[data-cw-law]', '[data-cw-speed]', '[data-cw-timing="rise"]', '.cw-compare']) {
    expect((await root.locator(selector).boundingBox())!.height, selector).toBeGreaterThanOrEqual(44);
  }
  const smallestLabel = await root.locator('label, .cw-annotation, .cw-eyebrow, .cw-hint').evaluateAll((nodes) =>
    Math.min(...nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))));
  expect(smallestLabel).toBeGreaterThanOrEqual(12);
  await setRange(page, '[data-cw-scrub]', OPENING_ANGLE);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('cam-workshop-mobile.png') });
});

test('abort/destroy release all loops and size observers; retained reset and playback methods are inert', async ({ page }) => {
  await openWorkshop(page);
  await page.waitForTimeout(80);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/cam-workshop/index.ts';
    const { mount } = await import(modulePath);
    const host = document.createElement('div');
    host.style.width = '740px';
    document.body.append(host);
    const controller = new AbortController();
    const frames = new Set<number>();
    const observers = new Set<ResizeObserver>();
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const OriginalObserver = window.ResizeObserver;
    window.requestAnimationFrame = (callback) => {
      const frame = originalRequest((now) => { frames.delete(frame); callback(now); });
      frames.add(frame);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => { frames.delete(frame); originalCancel(frame); };
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
      const root = host.querySelector<HTMLElement>('.project-cam-workshop')!;
      const startsPaused = root.dataset.motion;
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const button = root.querySelector<HTMLButtonElement>('[data-cw-play]')!;
      const before = { frames: frames.size, observers: observers.size, angle: Number(root.dataset.angle) };
      controller.abort();
      const atDestroy = root.dataset.angle;
      instance.destroy();
      instance.destroy();
      button.click();
      instance.reset();
      instance.setPaused(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      return {
        startsPaused, before, atDestroy, retainedAngle: root.dataset.angle, reports: reports.length,
        after: { frames: frames.size, observers: observers.size, children: host.childElementCount },
      };
    } finally {
      controller.abort();
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      window.ResizeObserver = OriginalObserver;
      host.remove();
    }
  });
  expect(result.startsPaused).toBe('paused');
  expect(result.before.frames).toBe(1);
  expect(result.before.observers).toBe(3);
  expect(result.before.angle).toBeGreaterThan(OPENING_ANGLE);
  expect(result.after).toEqual({ frames: 0, observers: 0, children: 0 });
  expect(result.retainedAngle).toBe(result.atDestroy);
  expect(result.reports).toBe(0);
});

test('a partially failed canvas initialization releases earlier observers and removes the page', async ({ page }) => {
  await openWorkshop(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/cam-workshop/index.ts';
    const { mount } = await import(modulePath);
    const host = document.createElement('div');
    document.body.append(host);
    const controller = new AbortController();
    const originalContext = HTMLCanvasElement.prototype.getContext;
    const OriginalObserver = window.ResizeObserver;
    const observers = new Set<ResizeObserver>();
    const reports: string[] = [];
    let attempts = 0;
    HTMLCanvasElement.prototype.getContext = new Proxy(originalContext, {
      apply(target, receiver, args) {
        attempts++;
        return attempts === 2 ? null : Reflect.apply(target, receiver, args);
      },
    });
    window.ResizeObserver = class extends OriginalObserver {
      constructor(callback: ResizeObserverCallback) { super(callback); observers.add(this); }
      disconnect() { observers.delete(this); super.disconnect(); }
    };
    try {
      let failure = '';
      try {
        mount({
          container: host, controls: document.createElement('div'), signal: controller.signal,
          reducedMotion: true, report: (message: string) => reports.push(message),
        });
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        failure = error.message;
      }
      controller.abort();
      return { attempts, failure, observers: observers.size, children: host.childElementCount, reports };
    } finally {
      controller.abort();
      HTMLCanvasElement.prototype.getContext = originalContext;
      window.ResizeObserver = OriginalObserver;
      host.remove();
    }
  });
  expect(result.attempts).toBe(2);
  expect(result.failure).toContain('2D canvas');
  expect(result.observers).toBe(0);
  expect(result.children).toBe(0);
  expect(result.reports).toEqual(['Cam Workshop could not create its motion-trace canvases.']);
});
