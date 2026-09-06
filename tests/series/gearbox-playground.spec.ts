import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { ProjectContext, ProjectInstance } from '../../src/core/types';
import { DEFAULT_SPEED, DURATION, EXPERIMENTS, GEARSETS } from '../../src/projects/gearbox-playground/data';
import { ADDENDUM, DEDENDUM, frameAt, geometryFor, initialPhases, MEMBERS, meshResiduals, solveGearbox, TAU, validateGearset, willisResidual } from '../../src/projects/gearbox-playground/engine';
import type { Gearset, Member, Solution } from '../../src/projects/gearbox-playground/engine';
import { DRAWING_RING_RADIUS, toothOutline } from '../../src/projects/gearbox-playground/scene';

test('gearbox presets solve reduction, overdrive and reverse with exact signed Willis ratios', () => {
  for (const gearset of GEARSETS) {
    validateGearset(gearset);
    const expectedRatios: Record<string, number> = {
      reduction: gearset.sun / (gearset.sun + gearset.ring),
      overdrive: (gearset.sun + gearset.ring) / gearset.sun,
      reverse: -gearset.sun / gearset.ring,
    };
    for (const experiment of EXPERIMENTS) {
      for (const speed of [0, DEFAULT_SPEED, -0.25, 1]) {
        const solution = solveGearbox({ gearset, ...experiment, speed });
        expect(solution.ratio).toBeCloseTo(expectedRatios[experiment.id], 12);
        expect(solution.speeds[solution.grounded]).toBe(0);
        expect(solution.speeds[solution.driven]).toBe(speed);
        expect(solution.speeds[solution.output]).toBeCloseTo(speed * expectedRatios[experiment.id], 12);
        expect(willisResidual(gearset, solution.speeds)).toBeCloseTo(0, 11);
        expect(solution.planetSpeed).toBeCloseTo(
          solution.speeds.carrier - gearset.sun / gearset.planet * (solution.speeds.sun - solution.speeds.carrier), 12,
        );
        expect(Object.values(solution.speeds).every(Number.isFinite)).toBe(true);
      }
    }
    for (const grounded of MEMBERS) {
      for (const driven of MEMBERS.filter((member) => member !== grounded)) {
        const positive = solveGearbox({ gearset, grounded, driven, speed: 0.4 });
        const negative = solveGearbox({ gearset, grounded, driven, speed: -0.4 });
        expect(willisResidual(gearset, positive.speeds)).toBeCloseTo(0, 11);
        expect(willisResidual(gearset, negative.speeds)).toBeCloseTo(0, 11);
        expect(negative.ratio).toBe(positive.ratio);
        for (const member of MEMBERS) expect(negative.speeds[member]).toBeCloseTo(-positive.speeds[member], 12);
      }
    }
  }
  const reduction = solveGearbox({ gearset: GEARSETS[0], grounded: 'ring', driven: 'sun', speed: 1 });
  expect(reduction.speeds.carrier).toBeCloseTo(2 / 7, 12);
  expect(reduction.planetSpeed).toBeCloseTo(-2 / 3, 12);
});

test('gearbox rejects conflicting members, incompatible teeth and non-finite values without clamping', () => {
  const gearset = GEARSETS[0];
  const invalidSets: Gearset[] = [
    { ...gearset, sun: 0 }, { ...gearset, planet: 18.2 }, { ...gearset, sun: NaN },
    { ...gearset, ring: Infinity }, { ...gearset, ring: 181 },
    { ...gearset, ring: 59 }, { ...gearset, planets: 4 },
    { sun: 20, planet: 15, ring: 50, planets: 3 },
    { sun: 6, planet: 81, ring: 168, planets: 3 },
  ];
  for (const invalid of invalidSets) {
    expect(() => validateGearset(invalid)).toThrow(RangeError);
    expect(() => solveGearbox({ gearset: invalid, grounded: 'ring', driven: 'sun', speed: 0.2 })).toThrow(RangeError);
  }
  expect(() => validateGearset({ sun: 20, planet: 15, ring: 50, planets: 3 })).toThrow(/Equal-spacing/);
  expect(() => validateGearset({ ...gearset, ring: 59 })).toThrow(/Pitch geometry/);
  expect(() => validateGearset({ sun: 6, planet: 81, ring: 168, planets: 3 })).toThrow(/overlap/);
  for (const member of MEMBERS) {
    for (const speed of [0, 1]) {
      expect(() => solveGearbox({ gearset, grounded: member, driven: member, speed })).toThrow(/both grounded and driven/);
    }
  }
  for (const speed of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    expect(() => solveGearbox({ gearset, grounded: 'ring', driven: 'carrier', speed })).toThrow(RangeError);
  }
  expect(() => solveGearbox({ gearset, grounded: 'axle' as Member, driven: 'sun', speed: 1 })).toThrow(RangeError);
  expect(() => solveGearbox({ gearset, grounded: 'ring', driven: '' as Member, speed: 1 })).toThrow(RangeError);
  const solution = solveGearbox({ gearset, grounded: 'ring', driven: 'sun', speed: 1 });
  for (const time of [-0.1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) expect(() => frameAt(solution, time)).toThrow(RangeError);
});

test('gearbox pitch tangency, carrier pins and absolute planet spin preserve both mesh phases over time', () => {
  const original = JSON.stringify(GEARSETS);
  for (const gearset of GEARSETS) {
    const geometry = geometryFor(gearset);
    expect(geometry.ringRadius).toBe(geometry.sunRadius + 2 * geometry.planetRadius);
    expect(geometry.orbitRadius).toBe(geometry.sunRadius + geometry.planetRadius);
    expect(geometry.orbitRadius).toBe(geometry.ringRadius - geometry.planetRadius);
    const phases = initialPhases(gearset);
    for (let index = 1; index < 3; index++) expect(phases.orbits[index] - phases.orbits[index - 1]).toBeCloseTo(TAU / 3, 12);
    for (const grounded of MEMBERS) {
      for (const driven of MEMBERS.filter((member) => member !== grounded)) {
        for (const speed of [-0.37, 0, 0.37]) {
          const solution = solveGearbox({ gearset, grounded, driven, speed });
          const times = [0, 0.001, 0.125, 0.25, 0.625, 1, Math.PI, 11.8, DURATION];
          const frames = times.map((time) => frameAt(solution, time));
          for (const frame of frames) {
            for (const residual of meshResiduals(gearset, frame)) {
              expect(Math.abs(residual.sunPlanet)).toBeLessThan(1e-9);
              expect(Math.abs(residual.ringPlanet)).toBeLessThan(1e-9);
            }
            for (const planet of frame.planets) {
              expect(Math.hypot(planet.x, planet.y)).toBeCloseTo(geometry.orbitRadius, 11);
              expect(planet.x).toBeCloseTo(geometry.orbitRadius * Math.cos(phases.orbits[planet.index] + frame.carrierAngle), 11);
              expect(planet.y).toBeCloseTo(geometry.orbitRadius * Math.sin(phases.orbits[planet.index] + frame.carrierAngle), 11);
              expect(planet.angle).toBeCloseTo(phases.planets[planet.index] + solution.planetSpeed * TAU * frame.time, 11);
              const neighbor = frame.planets[(planet.index + 1) % 3];
              expect(Math.hypot(planet.x - neighbor.x, planet.y - neighbor.y)).toBeGreaterThan(2 * (geometry.planetRadius + ADDENDUM));
            }
          }
          for (let index = times.length - 1; index >= 0; index--) expect(frameAt(solution, times[index])).toEqual(frames[index]);
          const first = frameAt(solution, 1.1);
          const next = frameAt(solution, 1.1001);
          expect((next.planets[0].angle - first.planets[0].angle) / (0.0001 * TAU)).toBeCloseTo(solution.planetSpeed, 8);
          expect((next.carrierAngle - first.carrierAngle) / (0.0001 * TAU)).toBeCloseTo(solution.speeds.carrier, 8);
        }
      }
    }
  }
  const odd = GEARSETS[2];
  const solution = solveGearbox({ gearset: odd, grounded: 'ring', driven: 'sun', speed: 0.2 });
  expect(solution.phases.ring).toBeCloseTo(Math.PI / odd.ring, 12);
  const wronglyZeroed = { ...frameAt(solution, 0), ringAngle: 0 };
  expect(Math.abs(meshResiduals(odd, wronglyZeroed)[0].ringPlanet)).toBeCloseTo(Math.PI, 10);
  expect(JSON.stringify(GEARSETS)).toBe(original);
});

test('gearbox illustrative ring teeth point inward and external teeth point outward with shallow clearance', () => {
  const radius = 30;
  const module = 1;
  for (const internal of [false, true]) {
    const path = toothOutline(60, radius, module, internal);
    const coordinates = [...path.matchAll(/[ML](-?\d+\.\d+) (-?\d+\.\d+)/g)];
    expect(coordinates).toHaveLength(60 * 6);
    const radii = coordinates.map((match) => Math.hypot(Number(match[1]), Number(match[2])));
    expect(Math.min(...radii)).toBeCloseTo(radius - (internal ? ADDENDUM : DEDENDUM), 5);
    expect(Math.max(...radii)).toBeCloseTo(radius + (internal ? DEDENDUM : ADDENDUM), 5);
  }
});

async function openLab(page: Page, motion: 'reduce' | 'no-preference' = 'reduce') {
  // Other studios can register during this focused run; don't accept their HMR reloads.
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type"\s*:\s*"(?:update|full-reload)"/.test(message)) return;
      socket.send(message);
    });
  });
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto('./projects/gearbox-playground/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  const root = page.locator('.project-gearbox-playground');
  await expect(root.getByRole('heading', { name: 'Gearbox Playground', exact: true })).toBeVisible();
  await expect(root.locator('[data-gearbox-scene]')).toBeVisible();
  return root;
}

async function setRange(input: Locator, value: number) {
  await input.evaluate((element: HTMLInputElement, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function scrub(page: Page, time: number) {
  await setRange(page.getByRole('slider', { name: 'Timeline in seconds' }), time);
}

async function expectModel(root: Locator, solution: Solution, time: number) {
  const frame = frameAt(solution, time);
  await expect(root).toHaveAttribute('data-time', time.toFixed(6));
  await expect(root).toHaveAttribute('data-grounded', solution.grounded);
  await expect(root).toHaveAttribute('data-driven', solution.driven);
  await expect(root).toHaveAttribute('data-output', solution.output);
  expect(Number(await root.getAttribute('data-ratio'))).toBeCloseTo(solution.ratio, 12);
  for (const member of MEMBERS) {
    expect(Number(await root.locator(`[data-member-speed="${member}"]`).getAttribute('data-rate'))).toBeCloseTo(solution.speeds[member], 12);
  }
  const actual = await root.locator('[data-gearbox-scene]').evaluate((element) => {
    const svg = element as SVGSVGElement;
    const world = svg.getCTM()!.inverse();
    return [...svg.querySelectorAll<SVGGElement>('[data-member], [data-planet]')].map((group) => {
      const matrix = world.multiply(group.getCTM()!);
      return {
        member: group.dataset.member,
        planet: group.dataset.planet,
        role: group.dataset.role,
        teeth: group.dataset.teeth,
        a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, x: matrix.e, y: matrix.f,
      };
    });
  });
  const angles = { sun: frame.sunAngle, ring: frame.ringAngle, carrier: frame.carrierAngle };
  for (const member of MEMBERS) {
    const matrix = actual.find((item) => item.member === member)!;
    expect(matrix.a).toBeCloseTo(Math.cos(angles[member]), 5);
    expect(matrix.b).toBeCloseTo(-Math.sin(angles[member]), 5);
    expect(matrix.c).toBeCloseTo(Math.sin(angles[member]), 5);
    expect(matrix.d).toBeCloseTo(Math.cos(angles[member]), 5);
    expect(matrix.x).toBeCloseTo(0, 5);
    expect(matrix.y).toBeCloseTo(0, 5);
    expect(matrix.role).toBe(member === solution.grounded ? 'grounded' : member === solution.driven ? 'driven' : 'output');
  }
  const scale = DRAWING_RING_RADIUS / solution.geometry.ringRadius;
  for (const planet of frame.planets) {
    const matrix = actual.find((item) => item.planet === String(planet.index))!;
    expect(matrix.a).toBeCloseTo(Math.cos(planet.angle), 5);
    expect(matrix.b).toBeCloseTo(-Math.sin(planet.angle), 5);
    expect(matrix.x).toBeCloseTo(planet.x * scale, 4);
    expect(matrix.y).toBeCloseTo(-planet.y * scale, 4);
    expect(Number(matrix.teeth)).toBe(solution.gearset.planet);
  }
  const pins = await root.locator('[data-pin]').evaluateAll((elements) => elements.map((element) => {
    const group = element as SVGGElement;
    const world = group.ownerSVGElement!.getCTM()!.inverse();
    const matrix = world.multiply(group.getCTM()!);
    return { x: matrix.e, y: matrix.f };
  }));
  frame.planets.forEach((planet, index) => {
    expect(pins[index].x).toBeCloseTo(planet.x * scale, 4);
    expect(pins[index].y).toBeCloseTo(-planet.y * scale, 4);
  });
}

test('gearbox browser presets and selectors render the same signed model and actual world transforms', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = await openLab(page);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  for (const experiment of EXPERIMENTS) {
    await root.getByRole('button', { name: experiment.name, exact: true }).click();
    await scrub(page, 1.25);
    await expectModel(root, solveGearbox({ gearset: GEARSETS[0], ...experiment, speed: DEFAULT_SPEED }), 1.25);
    await expect(root.getByRole('button', { name: experiment.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  for (const gearset of GEARSETS) {
    await root.getByRole('combobox', { name: 'Tooth family' }).selectOption(gearset.id);
    await root.getByRole('button', { name: 'Overdrive', exact: true }).click();
    await root.getByRole('combobox', { name: 'Input direction' }).selectOption('-1');
    await setRange(root.getByRole('slider', { name: 'Input speed' }), 0.5);
    await scrub(page, 0.63);
    await expectModel(root, solveGearbox({ gearset, grounded: 'ring', driven: 'carrier', speed: -0.5 }), 0.63);
    await expect(root.locator('[data-output-direction]')).toContainText('Clockwise');
    await expect(root.locator('[data-equation]')).toContainText(`${gearset.sun}(ωₛ`);
  }
  await root.getByRole('combobox', { name: 'Grounded member' }).selectOption('sun');
  await scrub(page, 3.75);
  await expectModel(root, solveGearbox({ gearset: GEARSETS[2], grounded: 'sun', driven: 'carrier', speed: -0.5 }), 3.75);
  await root.getByRole('checkbox', { name: 'Show pitch circles & orbit' }).check();
  await expect(root.locator('[data-gearbox-scene]')).toHaveAttribute('data-pitch', 'true');
  await expect(root.locator('[data-pitch-geometry]')).toBeVisible();
  await root.getByRole('checkbox', { name: 'Show pitch circles & orbit' }).uncheck();
  await expect(root.locator('[data-pitch-geometry]')).toBeHidden();
  await root.getByRole('button', { name: 'Reset lab' }).click();
  await scrub(page, 1.75);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('gearbox-playground-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('gearbox conflicting UI selections are explicit and zero speed retains its geometric ratio', async ({ page }) => {
  const root = await openLab(page);
  await scrub(page, 1.25);
  const drawing = root.locator('[data-gearbox-scene]');
  const before = await drawing.innerHTML();
  await root.getByRole('combobox', { name: 'Grounded member' }).selectOption('sun');
  await expect(root).toHaveAttribute('data-valid', 'false');
  await expect(root.getByRole('alert')).toContainText('sun cannot be both grounded and driven');
  await expect(root.locator('[data-model-state]')).toContainText('Last valid setup');
  await expect(root.getByRole('button', { name: 'Play mechanism' })).toBeDisabled();
  await expect(root.getByRole('slider', { name: 'Timeline in seconds' })).toBeDisabled();
  await expect(root.getByRole('combobox', { name: 'Grounded member' })).toHaveValue('sun');
  await expect(root.getByRole('combobox', { name: 'Grounded member' })).toHaveAttribute('aria-invalid', 'true');
  expect(await drawing.innerHTML()).toBe(before);
  await root.getByRole('combobox', { name: 'Driven member' }).selectOption('carrier');
  await expect(root).toHaveAttribute('data-valid', 'true');
  await expect(root.getByRole('alert')).toBeHidden();
  await expect(root).toHaveAttribute('data-time', '0.000000');
  await expect(root.getByRole('combobox', { name: 'Grounded member' })).toHaveAttribute('aria-invalid', 'false');
  const ratio = await root.getAttribute('data-ratio');
  await setRange(root.getByRole('slider', { name: 'Input speed' }), 0);
  await expect(root).toHaveAttribute('data-ratio', ratio!);
  await expect(root.locator('[data-output-direction]')).toContainText('All members stopped');
  for (const member of MEMBERS) {
    await expect(root.locator(`[data-member-speed="${member}"]`)).toHaveText('0.000');
    await expect(root.locator(`[data-member-direction="${member}"]`)).toHaveText('Stopped');
  }
  await scrub(page, 2);
  await expectModel(root, solveGearbox({ gearset: GEARSETS[0], grounded: 'sun', driven: 'carrier', speed: 0 }), 2);
  expect(await root.textContent()).not.toMatch(/NaN|Infinity/);
});

test('gearbox pause, history-free scrub, keyboard steps, end stop and reset operate the real clock', async ({ page }) => {
  const root = await openLab(page, 'no-preference');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-time'))).toBeGreaterThan(0.05);
  await root.getByRole('button', { name: 'Pause mechanism' }).click();
  const frozen = await root.getAttribute('data-time');
  await page.waitForTimeout(150);
  await expect(root).toHaveAttribute('data-time', frozen!);
  await scrub(page, 1.25);
  const first = await root.locator('[data-gearbox-scene]').innerHTML();
  await scrub(page, 0.1);
  await scrub(page, 1.25);
  expect(await root.locator('[data-gearbox-scene]').innerHTML()).toBe(first);
  await root.getByRole('button', { name: 'Step forward 0.1 seconds' }).click();
  await expect(root).toHaveAttribute('data-time', '1.350000');
  await root.getByRole('button', { name: 'Step back 0.1 seconds' }).click();
  await expect(root).toHaveAttribute('data-time', '1.250000');
  const timeline = root.getByRole('slider', { name: 'Timeline in seconds' });
  await timeline.focus();
  await page.keyboard.press('Home');
  await expect(root).toHaveAttribute('data-time', '0.000000');
  await expect(root.getByRole('button', { name: 'Step back 0.1 seconds' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(root).toHaveAttribute('data-time', '0.010000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await scrub(page, DURATION - 0.05);
  await root.getByRole('button', { name: 'Play mechanism' }).click();
  await expect(root).toHaveAttribute('data-time', '20.000000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-status]')).toContainText('20-second study is complete');
  await expect(root.getByRole('button', { name: 'Step forward 0.1 seconds' })).toBeDisabled();
  await root.getByRole('button', { name: 'Play mechanism' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect(Number(await root.getAttribute('data-time'))).toBeLessThan(1);
  await root.getByRole('button', { name: 'Pause mechanism' }).click();
  await root.getByRole('button', { name: 'Reverse', exact: true }).click();
  await root.getByRole('combobox', { name: 'Tooth family' }).selectOption(GEARSETS[2].id);
  await root.getByRole('combobox', { name: 'Input direction' }).selectOption('-1');
  await setRange(root.getByRole('slider', { name: 'Input speed' }), 0.8);
  await root.getByRole('checkbox', { name: 'Show pitch circles & orbit' }).check();
  await scrub(page, 7.5);
  await root.getByRole('button', { name: 'Reset lab' }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.getByRole('slider', { name: 'Input speed' })).toHaveValue(String(DEFAULT_SPEED));
  await expect(root.getByRole('combobox', { name: 'Input direction' })).toHaveValue('1');
  await expect(root.getByRole('combobox', { name: 'Tooth family' })).toHaveValue(GEARSETS[0].id);
  await expect(root.getByRole('checkbox', { name: 'Show pitch circles & orbit' })).not.toBeChecked();
  await expectModel(root, solveGearbox({ gearset: GEARSETS[0], grounded: 'ring', driven: 'sun', speed: DEFAULT_SPEED }), 0);
});

test('gearbox 375px workbench stays near the top with readable controls and reduced-motion support', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openLab(page);
  const scene = await root.locator('[data-gearbox-scene]').boundingBox();
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(260);
  expect(scene!.y).toBeLessThan(300);
  expect(scene!.height).toBeGreaterThan(280);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.waitForTimeout(120);
  await expect(root).toHaveAttribute('data-time', '0.000000');
  const layout = await root.evaluate((element) => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    controls: [...element.querySelectorAll('button, select, input')].map((control) => {
      const target = control.matches('[type="checkbox"]') ? control.closest('label')! : control;
      const rect = target.getBoundingClientRect();
      return { height: rect.height, left: rect.left, right: rect.right, font: Number.parseFloat(getComputedStyle(target).fontSize) };
    }),
    labelFonts: [...element.querySelectorAll('label, .gb-legend span span, .gb-drawing-caption, .gb-small')].map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(layout.controls.every((control) => control.left >= 0 && control.right <= 375 && control.height >= 44 && control.font >= 12)).toBe(true);
  expect(layout.labelFonts.every((size) => size >= 12)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gearbox-playground-mobile.png'), fullPage: true });
  await root.getByRole('button', { name: 'Play mechanism' }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-time'))).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Play mechanism' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const frozen = await root.getAttribute('data-time');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(120);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-time', frozen!);
  await scrub(page, 4.75);
  await expect(root).toHaveAttribute('data-time', '4.750000');
});

test('gearbox abort and destroy cancel RAF, detach listeners, and make returned controls inert', async ({ page }) => {
  await openLab(page);
  const results = await page.evaluate(async () => {
    const modulePath = '/src/projects/gearbox-playground/index.ts';
    const { mount } = await import(/* @vite-ignore */ modulePath) as {
      mount: (context: ProjectContext) => ProjectInstance;
    };
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set<number>();
    window.requestAnimationFrame = (callback) => {
      const id = originalRequest((now) => { pending.delete(id); callback(now); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); originalCancel(id); };
    const outcomes = [];
    try {
      for (const disposal of ['abort', 'destroy']) {
        const controller = new AbortController();
        const host = document.createElement('div');
        const controls = document.createElement('div');
        const reports: string[] = [];
        host.style.cssText = 'position:absolute;left:0;top:0;width:720px;';
        document.body.append(host);
        const instance = mount({ container: host, controls, signal: controller.signal, reducedMotion: true, report: (message) => reports.push(message) });
        const root = host.querySelector<HTMLElement>('.project-gearbox-playground')!;
        const play = root.querySelector<HTMLButtonElement>('[data-play]')!;
        const reset = root.querySelector<HTMLButtonElement>('[data-reset]')!;
        const slider = root.querySelector<HTMLInputElement>('#gb-time')!;
        instance.setPaused?.(false);
        await new Promise<void>((resolve) => originalRequest(() => originalRequest(() => resolve())));
        const wasRunning = Number(root.dataset.time) > 0 && pending.size > 0;
        if (disposal === 'abort') controller.abort();
        else instance.destroy();
        const afterDisposal = root.outerHTML;
        const messages = reports.length;
        play.click();
        reset.click();
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        instance.reset?.();
        instance.setPaused?.(false);
        instance.destroy();
        controller.abort();
        await new Promise<void>((resolve) => originalRequest(() => originalRequest(() => resolve())));
        outcomes.push({
          wasRunning, pending: pending.size, children: host.childElementCount,
          controls: controls.childElementCount, inert: root.outerHTML === afterDisposal,
          newReports: reports.length - messages,
        });
        host.remove();
      }
    } finally {
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
    }
    return outcomes;
  });
  for (const result of results) {
    expect(result).toEqual({ wasRunning: true, pending: 0, children: 0, controls: 0, inert: true, newReports: 0 });
  }
});
