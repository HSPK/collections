import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { ProjectContext, ProjectInstance } from '../../src/core/types';
import { PHASES, PRESETS } from '../../src/projects/motor-field-lab/data';
import { advanceElectricalAngle, currentAt, normalizeDegrees, sampleMotor, signedDegrees } from '../../src/projects/motor-field-lab/engine';
import type { MotorInput, PhaseMask } from '../../src/projects/motor-field-lab/engine';

const input = (overrides: Partial<MotorInput> = {}): MotorInput => ({
  electricalAngle: 30, enabled: [true, true, true], commandLag: 35,
  rotorMode: 'follow', rotorAngle: 0, ...overrides,
});
const radians = (angle: number) => angle * Math.PI / 180;

test('balanced phases have zero current sum and an exactly normalized rotating field', () => {
  for (let angle = -360; angle <= 720; angle += 0.75) {
    const frame = sampleMotor(input({ electricalAngle: angle }));
    expect(frame.currentSum).toBeCloseTo(0, 12);
    expect(frame.field.magnitude).toBeCloseTo(1, 12);
    expect(frame.field.x).toBeCloseTo(Math.cos(radians(angle)), 12);
    expect(frame.field.y).toBeCloseTo(Math.sin(radians(angle)), 12);
    expect(frame.field.angle).not.toBeNull();
    expect(Math.abs(signedDegrees(frame.field.angle! - angle))).toBeLessThan(1e-9);
    expect(frame.rotorElectricalAngle).toBe(frame.rotorMechanicalAngle);
    expect(frame.actualLoadAngle).toBeCloseTo(35, 10);
    expect(frame.torque).toBeCloseTo(Math.sin(radians(35)), 12);
    PHASES.forEach((phase, index) => {
      expect(frame.currents[index]).toBeCloseTo(Math.cos(radians(angle - phase.axis)), 12);
    });
  }
  expect(sampleMotor(input({ electricalAngle: 0 })).currents).toEqual([1, expect.closeTo(-0.5, 12), expect.closeTo(-0.5, 12)]);
  expect(currentAt(120, PHASES[1].axis)).toBe(1);
  expect(currentAt(240, PHASES[2].axis)).toBe(1);
  expect(advanceElectricalAngle(350, 1, 1)).toBe(26);
  expect(advanceElectricalAngle(30, 2, 0.25)).toBe(48);
  expect(advanceElectricalAngle(30, 1, 2)).toBe(102);
  expect(normalizeDegrees(-15)).toBe(345);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    expect(() => sampleMotor(input({ electricalAngle: invalid }))).toThrow(RangeError);
  }
});

test('every phase mask uses actual field contributions and the rotor cross product', () => {
  for (let mask = 0; mask < 8; mask++) {
    const enabled: PhaseMask = [Boolean(mask & 1), Boolean(mask & 2), Boolean(mask & 4)];
    for (const angle of [0, 13, 60, 90, 121, 180, 241, 270, 359.9]) {
      for (const rotorAngle of [-80, 0, 37, 90, 270]) {
        const frame = sampleMotor(input({ electricalAngle: angle, enabled, rotorMode: 'hold', rotorAngle }));
        let x = 0;
        let y = 0;
        PHASES.forEach((phase, index) => {
          const current = enabled[index] ? Math.cos(radians(angle - phase.axis)) : 0;
          if (!enabled[index]) expect(frame.currents[index]).toBe(0);
          const contributionX = (2 / 3) * current * Math.cos(radians(phase.axis));
          const contributionY = (2 / 3) * current * Math.sin(radians(phase.axis));
          expect(frame.contributions[index].x).toBeCloseTo(contributionX, 12);
          expect(frame.contributions[index].y).toBeCloseTo(contributionY, 12);
          x += contributionX;
          y += contributionY;
        });
        expect(frame.field.x).toBeCloseTo(x, 12);
        expect(frame.field.y).toBeCloseTo(y, 12);
        expect(frame.field.magnitude).toBeCloseTo(Math.hypot(x, y), 12);
        expect(frame.torque).toBeCloseTo(Math.cos(radians(rotorAngle)) * y - Math.sin(radians(rotorAngle)) * x, 12);
        if (mask === 0) {
          expect(frame.currents).toEqual([0, 0, 0]);
          expect(frame.field).toEqual({ x: 0, y: 0, magnitude: 0, angle: null });
          expect(frame.torque).toBe(0);
          expect(frame.actualLoadAngle).toBeNull();
        }
      }
    }
  }
  const missingB = sampleMotor(input({ electricalAngle: 0, commandLag: 0, enabled: [true, false, true] }));
  expect(missingB.field.x).toBeCloseTo(5 / 6, 12);
  expect(missingB.field.y).toBeCloseTo(Math.sqrt(3) / 6, 12);
  expect(missingB.field.angle).toBeCloseTo(19.10660535, 7);
  expect(missingB.torque).toBeCloseTo(Math.sqrt(3) / 6, 12);
  expect(missingB.torque).not.toBe(Math.sin(0));
  for (const angle of [90, 270]) {
    const crossing = sampleMotor(input({ electricalAngle: angle, enabled: [true, false, false] }));
    expect(crossing.field.angle).toBeNull();
    expect(crossing.actualLoadAngle).toBeNull();
    expect(crossing.field.magnitude).toBe(0);
    expect(crossing.torque).toBe(0);
  }
  const aligned = sampleMotor(input({ electricalAngle: 90, rotorMode: 'hold', rotorAngle: 90 }));
  const opposite = sampleMotor(input({ electricalAngle: 90, rotorMode: 'hold', rotorAngle: 270 }));
  expect(aligned.torque).toBe(0);
  expect(opposite.torque).toBe(0);
  expect(sampleMotor(input({ electricalAngle: 90, rotorMode: 'hold', rotorAngle: 0 })).torque).toBeCloseTo(1, 12);
  expect(sampleMotor(input({ electricalAngle: 90, rotorMode: 'hold', rotorAngle: 180 })).torque).toBeCloseTo(-1, 12);
});

async function openLab(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  // Other project agents may save files while this focused spec is running.
  await page.routeWebSocket('**', (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type"\s*:\s*"(?:update|full-reload)"/.test(message)) return;
      socket.send(message);
    });
  });
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/motor-field-lab/');
  const root = page.locator('.project-motor-field-lab');
  await expect(root.locator('.mfl-motor-svg')).toBeVisible();
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  return root;
}

async function setRange(range: Locator, value: number) {
  await range.evaluate((element: HTMLInputElement, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function nextFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectResultant(root: Locator, settings: MotorInput) {
  const frame = sampleMotor(settings);
  const coordinates = await root.locator('[data-mfl-resultant]').evaluate((element) => ({
    x1: Number(element.getAttribute('x1')),
    y1: Number(element.getAttribute('y1')),
    x2: Number(element.getAttribute('x2')),
    y2: Number(element.getAttribute('y2')),
    scale: Number(element.closest('svg')!.getAttribute('data-vector-scale')),
  }));
  expect(coordinates.x2 - coordinates.x1).toBeCloseTo(frame.field.x * coordinates.scale, 3);
  expect(coordinates.y2 - coordinates.y1).toBeCloseTo(-frame.field.y * coordinates.scale, 3);
  expect(Number(await root.getAttribute('data-torque'))).toBeCloseTo(frame.torque, 5);
  await expect(root.locator('[data-mfl-resultant]')).toHaveAttribute('visibility', frame.field.angle === null ? 'hidden' : 'visible');
}

test('scrubbing, native keyboard, step, and reset reproduce actual SVG geometry', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = await openLab(page);
  const angle = root.getByRole('slider', { name: 'Electrical angle', exact: true });
  await expect(root.getByRole('heading', { name: 'Motor Field Lab', exact: true })).toBeVisible();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-electrical-angle', '30.000000');
  await expectResultant(root, input());
  await setRange(angle, 90);
  await expect(root).toHaveAttribute('data-electrical-angle', '90.000000');
  await expectResultant(root, input({ electricalAngle: 90 }));
  await expect(root.locator('[data-mfl-cursor]')).toHaveAttribute('x1', '210.0000');
  await expect(root.locator('[data-mfl-wave-dot="a"]')).toHaveAttribute('cy', '84.0000');
  const snapshot = await root.locator('[data-mfl-rotor]').getAttribute('transform');
  const vector = await root.locator('[data-mfl-resultant]').getAttribute('y2');
  await setRange(angle, 221);
  expect(await root.locator('[data-mfl-rotor]').getAttribute('transform')).not.toBe(snapshot);
  await setRange(angle, 90);
  await expect(root.locator('[data-mfl-rotor]')).toHaveAttribute('transform', snapshot!);
  await expect(root.locator('[data-mfl-resultant]')).toHaveAttribute('y2', vector!);
  await nextFrames(page);
  await expect(root).toHaveAttribute('data-electrical-angle', '90.000000');

  await angle.focus();
  await angle.press('Home');
  await expect(root).toHaveAttribute('data-electrical-angle', '0.000000');
  await angle.press('ArrowRight');
  await expect(root).toHaveAttribute('data-electrical-angle', '0.100000');
  await angle.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await root.getByRole('button', { name: 'Step forward 15 degrees' }).click();
  await expect(root).toHaveAttribute('data-electrical-angle', '15.100000');
  await setRange(root.getByRole('slider', { name: 'Commanded load angle' }), -40);
  await root.getByRole('button', { name: 'Phase B', exact: true }).click();
  await root.getByRole('combobox', { name: 'Playback speed' }).selectOption('2');
  await root.getByRole('combobox', { name: 'Rotor constraint' }).selectOption('hold');
  await setRange(root.getByRole('slider', { name: 'Mechanical rotor angle' }), 127);
  await root.getByRole('button', { name: 'Reset lab' }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-electrical-angle', '30.000000');
  await expect(root.getByRole('combobox', { name: 'Rotor constraint' })).toHaveValue('follow');
  await expect(root.getByRole('combobox', { name: 'Playback speed' })).toHaveValue('1');
  await expect(root.getByRole('slider', { name: 'Commanded load angle' })).toHaveValue('35');
  await expect(root.locator('[data-mfl-phase][aria-pressed="true"]')).toHaveCount(3);
  await expectResultant(root, input());
  await page.screenshot({ path: testInfo.outputPath('motor-field-lab-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('phase loss, zero field, traces, rotor constraint, and torque sign stay connected', async ({ page }) => {
  const root = await openLab(page);
  await expect(root.locator('[data-mfl-wave="a"]')).toHaveAttribute('d', /^M 0\.0000 20\.0000 /);
  await expect(root.locator('[data-mfl-wave="b"]')).toHaveAttribute('d', /L 280\.0000 20\.0000/);
  await expect(root.locator('[data-mfl-wave="c"]')).toHaveAttribute('d', /L 560\.0000 20\.0000/);
  await root.getByRole('button', { name: 'Experiments', exact: true }).click();
  await root.locator('[data-mfl-preset="missing-phase"]').click();
  await root.getByRole('button', { name: 'Close Bench experiments' }).click();
  await expectResultant(root, input({ electricalAngle: 0, commandLag: 0, enabled: [true, false, true] }));
  await expect(root.locator('[data-mfl-current="b"]')).toHaveText('0.000');
  await expect(root.locator('[data-mfl-wave="b"]')).toHaveAttribute('d', 'M 0 84 L 840 84');
  await expect(root.locator('[data-mfl-wave-dot="b"]')).toHaveAttribute('cy', '84.0000');
  await expect(root.locator('[data-mfl-vector="b"]')).toHaveAttribute('visibility', 'hidden');
  await expect(root.locator('[data-mfl-pole="b-0"]')).toHaveText('—');
  await expect(root.locator('[data-mfl-torque]')).toHaveText('+0.289');
  await expect(root.locator('[data-mfl-direction]')).toHaveText('19.1°');
  await expect(root.locator('[data-mfl-actual-lag]')).toHaveText('+19.1°');
  await expect(root.locator('[data-mfl-pole="a-0"]')).toHaveText('S');
  await expect(root.locator('[data-mfl-pole="a-1"]')).toHaveText('N');
  await root.getByRole('button', { name: 'Phase A', exact: true }).click();
  await root.getByRole('button', { name: 'Phase C', exact: true }).click();
  await expect(root.locator('[data-mfl-current]')).toHaveText(['0.000', '0.000', '0.000']);
  await expect(root.locator('[data-mfl-wave][data-enabled="false"]')).toHaveCount(3);
  await expect(root.locator('[data-mfl-vector][visibility="hidden"]')).toHaveCount(3);
  await expect(root.locator('[data-mfl-magnitude]')).toHaveText('0.000');
  await expect(root.locator('[data-mfl-direction]')).toHaveText('Undefined');
  await expect(root.locator('[data-mfl-actual-lag]')).toHaveText('Undefined');
  await expect(root.locator('[data-mfl-torque]')).toHaveText('0.000');
  await expect(root.locator('[data-mfl-flux]')).toHaveAttribute('visibility', 'hidden');
  await expect(root.locator('[data-mfl-torque-arc]')).toHaveAttribute('visibility', 'hidden');
  await setRange(root.getByRole('slider', { name: 'Electrical angle', exact: true }), 90);
  await expectResultant(root, input({ electricalAngle: 90, commandLag: 0, enabled: [false, false, false] }));
  await expect(root.locator('[data-mfl-observation]')).toContainText('Zero field has no direction');

  for (const preset of PRESETS) {
    await root.getByRole('button', { name: 'Experiments', exact: true }).click();
    await root.locator(`[data-mfl-preset="${preset.id}"]`).click();
    await root.getByRole('button', { name: 'Close Bench experiments' }).click();
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(root.locator(`[data-mfl-preset="${preset.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expectResultant(root, input(preset));
  }
  await root.getByRole('button', { name: 'Experiments', exact: true }).click();
  await root.locator('[data-mfl-preset="balanced"]').click();
  await root.getByRole('button', { name: 'Close Bench experiments' }).click();
  const rotorBeforeMode = await root.getAttribute('data-rotor-angle');
  await root.getByRole('combobox', { name: 'Rotor constraint' }).selectOption('hold');
  await expect(root).toHaveAttribute('data-rotor-angle', rotorBeforeMode!);
  await setRange(root.getByRole('slider', { name: 'Mechanical rotor angle' }), 0);
  await setRange(root.getByRole('slider', { name: 'Electrical angle', exact: true }), 90);
  await expect(root.locator('[data-mfl-torque]')).toHaveText('+1.000');
  await expect(root.locator('[data-mfl-torque-arc]')).toHaveAttribute('data-sign', '1');
  await setRange(root.getByRole('slider', { name: 'Mechanical rotor angle' }), 180);
  await expect(root.locator('[data-mfl-torque]')).toHaveText('−1.000');
  await expect(root.locator('[data-mfl-torque-arc]')).toHaveAttribute('data-sign', '-1');
  await expect(root.locator('[data-mfl-torque-direction]')).toContainText('Clockwise');
  await expectResultant(root, input({ electricalAngle: 90, rotorMode: 'hold', rotorAngle: 180 }));
  await setRange(root.getByRole('slider', { name: 'Electrical angle', exact: true }), 180);
  await expect(root.locator('[data-mfl-pole="a-0"]')).toHaveText('N');
  await expect(root.locator('[data-mfl-pole="a-1"]')).toHaveText('S');
});

test('playback advances, scrubbing pauses, and both live motion-preference changes pause', async ({ page }) => {
  const root = await openLab(page, 'no-preference');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-electrical-angle'))).toBeGreaterThan(30.1);
  await root.getByRole('button', { name: 'Pause playback' }).click();
  const stopped = await root.getAttribute('data-electrical-angle');
  await page.waitForTimeout(140);
  await expect(root).toHaveAttribute('data-electrical-angle', stopped!);
  await root.getByRole('combobox', { name: 'Playback speed' }).selectOption('2');
  await setRange(root.getByRole('slider', { name: 'Electrical angle', exact: true }), 100);
  await root.getByRole('button', { name: 'Play playback' }).click();
  await expect(root.locator('[data-mfl-status]')).toContainText('72 electrical degrees');
  await expect.poll(async () => Number(await root.getAttribute('data-electrical-angle'))).toBeGreaterThan(100.1);
  await setRange(root.getByRole('slider', { name: 'Electrical angle', exact: true }), 120);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await nextFrames(page);
  await expect(root).toHaveAttribute('data-electrical-angle', '120.000000');
  await root.getByRole('button', { name: 'Play playback' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-mfl-reduced]')).toBeVisible();
  await root.getByRole('button', { name: 'Play playback' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const changed = await root.getAttribute('data-electrical-angle');
  await page.waitForTimeout(140);
  await expect(root).toHaveAttribute('data-electrical-angle', changed!);
  await expect(root.locator('[data-mfl-status]')).toContainText('stays paused');
});

test('375px workbench is early, legible, reduced-motion safe, and never overflows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openLab(page);
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const svg = root.locator('.mfl-motor-svg');
  const bounds = (await svg.boundingBox())!;
  expect(bounds.y).toBeLessThan(300);
  expect(bounds.height).toBeGreaterThan(300);
  expect((await root.locator('[data-project-preview]').boundingBox())!.y).toBeLessThan(230);
  const layout = await root.evaluate((element) => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    controls: Array.from(element.querySelectorAll('button, select, input')).map((control) => {
      const rect = control.getBoundingClientRect();
      return { left: rect.left, right: rect.right, height: rect.height, width: rect.width };
    }).filter((rect) => rect.width > 0),
    labelSizes: Array.from(element.querySelectorAll('.mfl-panel-title, .mfl-reading-label, .mfl-small-note, .mfl-range-ends, .mfl-legend'))
      .map((label) => parseFloat(getComputedStyle(label).fontSize)),
    svgLabelSizes: Array.from(element.querySelectorAll<SVGTextElement>('.mfl-motor-svg text')).map((label) => {
      const matrix = label.getScreenCTM()!;
      return parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b);
    }),
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  layout.controls.forEach((control) => {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(layout.viewport + 1);
    expect(control.height).toBeGreaterThanOrEqual(44);
  });
  [...layout.labelSizes, ...layout.svgLabelSizes].forEach((size) => expect(size).toBeGreaterThanOrEqual(12));
  await nextFrames(page);
  await expect(root).toHaveAttribute('data-electrical-angle', '30.000000');
  await page.screenshot({ path: testInfo.outputPath('motor-field-lab-mobile.png'), fullPage: true });
  await root.getByRole('button', { name: 'Step forward 15 degrees' }).click();
  await expectResultant(root, input({ electricalAngle: 45 }));
  await root.getByRole('button', { name: 'Experiments', exact: true }).click();
  await root.locator('[data-mfl-preset="no-field"]').click();
  await root.getByRole('button', { name: 'Close Bench experiments' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`motor workspace keeps simulation, transport and inspectable panels at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const root = await openLab(page);
    await expect(root).toHaveAttribute('data-workspace', 'true');
    const layout = await root.evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      height: element.getBoundingClientRect().height,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      stage: element.querySelector('.mfl-motor-svg')!.getBoundingClientRect().toJSON(),
      transport: element.querySelector('.mfl-drive-controls')!.getBoundingClientRect().toJSON(),
    }));
    expect(layout.top).toBe(0);
    expect(layout.height).toBe(viewport.height);
    expect(layout.documentHeight).toBeLessThanOrEqual(viewport.height);
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.stage.height).toBeGreaterThan(100);
    expect(layout.stage.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.transport.bottom).toBeLessThanOrEqual(viewport.height);
    await root.getByRole('button', { name: 'Parameters', exact: true }).click();
    const phase = root.getByRole('button', { name: 'Phase B', exact: true });
    await phase.click();
    await expect(phase).toBeFocused();
    await expect(phase).toHaveAttribute('aria-pressed', 'false');
    const parameters = root.getByRole('tab', { name: 'Parameters', exact: true });
    await parameters.focus();
    await parameters.press('ArrowRight');
    await expect(root.getByRole('tab', { name: 'Readout', exact: true })).toBeFocused();
    await expect(root.locator('[data-mfl-magnitude]')).toBeVisible();
    await root.getByRole('tab', { name: 'Traces', exact: true }).click();
    await expect(root.getByRole('region', { name: '03 Current traces' })).toBeVisible();
    if (viewport.width <= 700 || viewport.height <= 540) {
      await page.keyboard.press('Escape');
      await expect(root.getByRole('button', { name: 'Parameters', exact: true })).toBeFocused();
    }
    await root.getByRole('button', { name: 'Notebook', exact: true }).click();
    const notebook = root.getByRole('dialog', { name: 'Field notebook & equations' });
    await expect(notebook).toBeVisible();
    await expect(notebook.getByRole('heading', { name: 'Prescribed kinematics' })).toBeVisible();
    expect(await notebook.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(12, 25, 30)');
    await page.keyboard.press('Escape');
    await expect(root.getByRole('button', { name: 'Notebook', exact: true })).toBeFocused();
    await expect(root).toHaveAttribute('data-electrical-angle', '30.000000');
  });
}

test('abort disposes frames and listeners, and stale controls and instance methods are inert', async ({ page }) => {
  await openLab(page);
  await nextFrames(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/motor-field-lab/index.ts';
    const { mount } = await import(/* @vite-ignore */ modulePath) as { mount: (context: ProjectContext) => ProjectInstance };
    const host = document.createElement('div');
    const controls = document.createElement('div');
    host.style.width = '720px';
    document.body.append(host);
    const controller = new AbortController();
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const nativeMedia = window.matchMedia.bind(window);
    const pending = new Set<number>();
    const preferences: MediaQueryList[] = [];
    let frames = 0;
    window.requestAnimationFrame = (callback) => {
      const handle = nativeRequest((time) => {
        pending.delete(handle);
        frames++;
        callback(time);
      });
      pending.add(handle);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      pending.delete(handle);
      nativeCancel(handle);
    };
    window.matchMedia = (query) => {
      const preference = nativeMedia(query);
      preferences.push(preference);
      return preference;
    };
    const nextFrame = () => new Promise<void>((resolve) => nativeRequest(() => resolve()));
    try {
      const instance = mount({ container: host, controls, signal: controller.signal, reducedMotion: false, report: () => {} });
      instance.setPaused?.(false);
      const root = host.querySelector<HTMLElement>('.project-motor-field-lab')!;
      const stalePlay = root.querySelector<HTMLButtonElement>('[data-mfl-play]')!;
      const staleAngle = root.querySelector<HTMLInputElement>('[data-mfl-angle]')!;
      await nextFrame();
      await nextFrame();
      const wasActive = frames > 0 && pending.size > 0 && root.dataset.motion === 'playing';
      controller.abort();
      instance.destroy();
      instance.destroy();
      const stoppedAt = frames;
      const markup = root.innerHTML;
      stalePlay.click();
      staleAngle.value = '211';
      staleAngle.dispatchEvent(new Event('input', { bubbles: true }));
      preferences.forEach((preference) => preference.dispatchEvent(new Event('change')));
      instance.setPaused?.(false);
      instance.reset?.();
      await nextFrame();
      await nextFrame();
      return {
        wasActive,
        remainingFrames: pending.size,
        framesAfterStop: frames - stoppedAt,
        rootRemoved: !root.isConnected && host.childElementCount === 0,
        controlsUntouched: controls.childElementCount === 0,
        staleMarkupUnchanged: root.innerHTML === markup,
      };
    } finally {
      controller.abort();
      host.remove();
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      window.matchMedia = nativeMedia;
    }
  });
  expect(result).toEqual({
    wasActive: true, remainingFrames: 0, framesAfterStop: 0,
    rootRemoved: true, controlsUntouched: true, staleMarkupUnchanged: true,
  });
});
