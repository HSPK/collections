import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import {
  ANGLE_TOLERANCE, HOME, JOINTS, POSITION_TOLERANCE, consume, degrees, forward,
  interpolate, inverse, inverseSteps, jacobian, rotationError, validJoints,
} from '../../src/projects/morrow/arm';
import type { Joints } from '../../src/projects/morrow/arm';
import { MARGIN, checkEdge, clearance, partPose, segmentBoxDistance, segmentDistance } from '../../src/projects/morrow/collision';
import { plan, planSteps, sampleTrajectory, timePath } from '../../src/projects/morrow/planner';
import {
  Generation, History, PICK, PLACE, PRESETS, cloneState, createState, deserialize, destination,
  exportProgram, grip, release, serialize, taskComplete, worldFor,
} from '../../src/projects/morrow/state';

test.describe('MORROW mathematical workcell', () => {
  test('FK fixtures use parent translation then local rotation, without renderer approximations', () => {
    const zero = forward([0, 0, 0, 0, 0, 0]);
    expect(zero.tool.position.toArray()).toEqual([1.1600000000000001, .42, 0]);
    expect(zero.tool.orientation.toArray()).toEqual([0, 0, 0, 1]);
    const base = forward(degrees([90, 0, 0, 0, 0, 0]));
    expect(base.tool.position.x).toBeCloseTo(0, 12);
    expect(base.tool.position.z).toBeCloseTo(-1.16, 12);
    const shoulder = forward(degrees([0, 90, 0, 0, 0, 0]));
    expect(shoulder.tool.position.y).toBeCloseTo(1.58, 12);
    expect(shoulder.tool.position.x).toBeCloseTo(0, 12);
  });

});

  async function openMorrow(page: Page) {
    await page.goto('./projects/morrow/');
    const root = page.locator('.project-morrow');
    await expect(root).toHaveAttribute('data-ready', 'true');
    await expect(root.locator('[data-morrow-canvas]')).toHaveAttribute('data-ready', 'true');
    return root;
  }
  async function view(page: Page, name: 'cell' | 'inspector' | 'motion') {
    await page.locator(`[data-morrow-view="${name}"]`).click();
  }
  async function files(page: Page) {
    await page.locator('[data-morrow-files]').click();
    await expect(page.getByRole('dialog', { name: 'Files and model guide' })).toBeVisible();
  }
  async function closeFiles(page: Page) {
    await page.getByRole('button', { name: 'Close Files and model guide', exact: true }).click();
  }
  test.describe('MORROW software WebGL workbench', () => {
    test.setTimeout(90_000);

    test('viewport workspace preserves live preview, real edits and motion across all pane sizes', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const root = await openMorrow(page);
      await expect(root).toHaveAttribute('data-workspace', 'true');
      for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
        await page.setViewportSize({ width, height });
        for (const name of ['cell', 'inspector', 'motion'] as const) {
          await view(page, name);
          await expect.poll(() => page.evaluate(() => ({
            width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scrollY,
          }))).toEqual({ width, height, scrollY: 0 });
          const canvas = root.locator('[data-morrow-canvas]');
          await expect(canvas).toBeInViewport({ ratio: 1 });
          const box = await canvas.boundingBox();
          expect(box!.height).toBeGreaterThan(80);
          await expect.poll(() => canvas.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0 &&
              Math.abs(element.width - bounds.width * Math.min(devicePixelRatio, 1.5)) < 2 &&
              Math.abs(element.height - bounds.height * Math.min(devicePixelRatio, 1.5)) < 2;
          })).toBe(true);
          const fonts = await root.locator('button, input, select').evaluateAll(elements =>
            elements.filter(element => element.getClientRects().length > 0).map(element => parseFloat(getComputedStyle(element).fontSize)));
          expect(Math.min(...fonts)).toBeGreaterThanOrEqual(14);
        }
        await view(page, 'inspector');
        const live = await root.locator('[data-morrow-tool]').textContent();
        await root.locator('[data-morrow-tab="joints"]').click();
        await root.locator('[data-morrow-joint="0"]').fill('5');
        await root.locator('[data-morrow-joint="0"]').press('Tab');
        await expect(root.locator('[data-morrow-ik-state]')).toHaveText('Converged');
        await expect(root.locator('[data-morrow-tool]')).toHaveText(live!);
        await expect(root.locator('[data-morrow-canvas]')).toBeInViewport();
        if (width === 320) await page.screenshot({ path: testInfo.outputPath('morrow-workspace-mobile-edit.png') });
        await files(page);
        await root.locator('[data-morrow-undo]').click();
        await closeFiles(page);
        await root.locator('[data-morrow-tab="pose"]').click();
        await root.locator('[data-morrow-source]').click();
        await root.locator('[data-morrow-plan]').click();
        await expect(root.locator('[data-morrow-plan-state]')).toContainText('certified edges');
        await view(page, 'motion');
        await root.locator('[data-morrow-step]').click();
        await expect(root.locator('[data-morrow-time]')).toContainText('0.10 /');
        await expect(root.locator('[data-morrow-trace] svg')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`morrow-workspace-${width}x${height}.png`) });
        await root.locator('[data-morrow-reset]').click();
        await expect(root.locator('[data-morrow-run]')).toBeDisabled();
        await expect(root.locator('[data-morrow-tool]')).toHaveText(live!);
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
      }
      await files(page);
      await page.getByText('Model, limits & keyboard guide', { exact: true }).click();
      await expect(root.locator('.morrow-guide')).toContainText('No hardware connection');
      const download = page.waitForEvent('download');
      await root.locator('[data-morrow-save]').click();
      expect(serialize(deserialize(await readFile((await (await download).path())!, 'utf8')))).toBe(serialize(createState()));
      await page.keyboard.press('Escape');
      await expect(root.locator('[data-morrow-files]')).toBeFocused();
      expect(errors).toEqual([]);
    });

    test('a real UI pick/place, inspection isolation, timed execution, program export and project reload', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width: 1440, height: 1040 });
      const root = await openMorrow(page);
      await expect(root.locator('[data-project-preview]')).toHaveCount(1);
      await expect(root.locator('[data-morrow-ik-state]')).toHaveText('Converged');
      await page.screenshot({ path: testInfo.outputPath('morrow-desktop.png'), fullPage: false });
      await root.locator('[data-morrow-grip]').click();
      await expect(root.locator('[data-morrow-status]')).toContainText('25 mm');
      await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
      await root.locator('[data-morrow-plan]').click();
      await expect(root.locator('[data-morrow-run]')).toBeEnabled();
      await expect(root.locator('[data-morrow-plan-state]')).toContainText('certified edges');
      const initialTool = await root.locator('[data-morrow-tool]').textContent();
      const scrub = root.locator('[data-morrow-scrub]');
      await view(page, 'motion');
      await scrub.focus();
      await scrub.press('End');
      await expect(root).toHaveAttribute('data-inspection', 'true');
      await expect(root.locator('[data-morrow-grip]')).toBeDisabled();
      await expect(root.locator('[data-morrow-tool]')).not.toHaveText(initialTool!);
      await root.locator('[data-morrow-live]').click();
      await expect(root.locator('[data-morrow-tool]')).toHaveText(initialTool!);
      await root.locator('[data-morrow-run]').click();
      await expect(root).toHaveAttribute('data-executing', 'true');
      await expect(root.locator('[data-morrow-motion-state]')).toHaveText('AT GOAL / PAUSED', { timeout: 25_000 });
      await view(page, 'inspector');
      await root.locator('[data-morrow-grip]').click();
      await expect(root.locator('[data-morrow-payload]')).toContainText('CLOSED');
      await root.locator('[data-morrow-receiver]').click();
      await root.locator('[data-morrow-plan]').click();
      await expect(root.locator('[data-morrow-run]')).toBeEnabled({ timeout: 25_000 });
      await expect(root.locator('[data-morrow-status]')).toContainText('Payload included');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('morrow-carry-plan.png'), fullPage: false });
      await files(page);
      const download = page.waitForEvent('download');
      await root.locator('[data-morrow-export]').click();
      const programFile = await download;
      const programPath = await programFile.path();
      expect(programPath).not.toBeNull();
      const program = JSON.parse(await readFile(programPath!, 'utf8'));
      expect(program.warning).toContain('Not commands for physical hardware');
      expect(program.payload).toBe(true);
      expect(program.nodes.length).toBeGreaterThanOrEqual(2);
      await closeFiles(page);
      await view(page, 'motion');
      await root.locator('[data-morrow-run]').click();
      await expect(root.locator('[data-morrow-motion-state]')).toHaveText('AT GOAL / PAUSED', { timeout: 30_000 });
      await view(page, 'inspector');
      await root.locator('[data-morrow-release]').click();
      await expect(root).toHaveAttribute('data-task-complete', 'true');
      await expect(root.locator('[data-morrow-status]')).toContainText('Transfer complete');
      await expect(root.locator('[data-morrow-payload]')).toContainText('COUPON PLACED');
      await files(page);
      const saved = page.waitForEvent('download');
      await root.locator('[data-morrow-save]').click();
      const savedPath = await (await saved).path();
      expect(savedPath).not.toBeNull();
      await closeFiles(page);
      await view(page, 'motion');
      await root.locator('[data-morrow-reset]').click();
      await expect(root).toHaveAttribute('data-task-complete', 'false');
      await root.locator('[data-morrow-file]').setInputFiles(savedPath!);
      await expect(root).toHaveAttribute('data-task-complete', 'true');
      await expect(root.locator('[data-morrow-run]')).toBeDisabled();
      expect(errors).toEqual([]);
    });

    test('unreachable edits, cancellation, joint preview, waypoints, undo and reverse remain truthful', async ({ page }) => {
      const root = await openMorrow(page);
      const liveTool = await root.locator('[data-morrow-tool]').textContent();
      await root.locator('[data-morrow-pose="x"]').fill('2.8');
      await root.locator('[data-morrow-pose="x"]').press('Tab');
      await root.locator('[data-morrow-solve]').click();
      await expect(root.locator('[data-morrow-ik-state]')).toHaveText('Not converged');
      await expect(root.locator('[data-morrow-pose="x"]')).toHaveValue('2.800');
      await expect(root.locator('[data-morrow-tool]')).toHaveText(liveTool!);
      await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
      await root.locator('[data-morrow-source]').click();
      await root.locator('[data-morrow-tab="program"]').click();
      await root.locator('[data-morrow-queue-add]').click();
      await expect(root.locator('[data-morrow-queue-count]')).toHaveText('1 / 6');
      await files(page);
      await root.locator('[data-morrow-undo]').click();
      await expect(root.locator('[data-morrow-queue-count]')).toHaveText('0 / 6');
      await root.locator('[data-morrow-redo]').click();
      await expect(root.locator('[data-morrow-queue-count]')).toHaveText('1 / 6');
      await closeFiles(page);
      await root.locator('[data-morrow-queue-clear]').click();
      await root.locator('[data-morrow-plan]').click();
      await expect(root.locator('[data-morrow-run]')).toBeEnabled();
      await view(page, 'motion');
      await root.locator('[data-morrow-step]').click();
      await expect(root.locator('[data-morrow-tool]')).not.toHaveText(liveTool!);
      await root.locator('[data-morrow-reverse]').click();
      await expect(root.locator('[data-morrow-status]')).toContainText('Returned along the certified path');
      await expect(root.locator('[data-morrow-tool]')).toHaveText(liveTool!);
      await root.locator('[data-morrow-run]').click();
      await expect(root).toHaveAttribute('data-executing', 'true');
      await view(page, 'inspector');
      await root.locator('[data-morrow-tab="joints"]').click();
      await root.locator('[data-morrow-joint="0"]').fill('5');
      await expect(root).toHaveAttribute('data-executing', 'false');
      await root.locator('[data-morrow-joint="0"]').press('Tab');
      await expect(root.locator('[data-morrow-run]')).toBeDisabled();
      await expect(root.locator('[data-morrow-ik-state]')).toHaveText('Converged');
      const frozen = await root.locator('[data-morrow-tool]').textContent();
      await page.waitForTimeout(120);
      await expect(root.locator('[data-morrow-tool]')).toHaveText(frozen!);
      await root.locator('[data-morrow-preset]').selectOption('detour');
      await root.locator('[data-morrow-plan]').click();
      await root.locator('[data-morrow-preset]').selectOption('inspection');
      await expect(root.locator('[data-morrow-plan-state]')).toHaveText('Not planned');
      await page.waitForTimeout(150);
      await expect(root.locator('[data-morrow-run]')).toBeDisabled();
    });

    test('immediate desktop-to-mobile layout and explicit-plane pointer/keyboard coordinates', async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      const root = await openMorrow(page);
      await expect(root).toHaveAttribute('data-executing', 'false');
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 850 });
        await root.locator('[data-morrow-view="cell"]').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const tooSmall = await root.locator('button, input:not([type="file"]), select, summary').evaluateAll(elements =>
          elements.filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 &&
            parseFloat(getComputedStyle(e).fontSize) < 14).map(e => e.outerHTML.slice(0, 100)));
        expect(tooSmall).toEqual([]);
        await root.locator('[data-morrow-mode]').selectOption('xz');
        const x = root.locator('[data-morrow-pose="x"]'), y = root.locator('[data-morrow-pose="y"]'), z = root.locator('[data-morrow-pose="z"]');
        const before = [Number(await x.inputValue()), Number(await y.inputValue()), Number(await z.inputValue())];
        const canvas = root.locator('[data-morrow-canvas]');
        await canvas.focus(); await canvas.press('ArrowRight');
        expect(Number(await x.inputValue()) - before[0]).toBeCloseTo(.01, 3);
        expect(Number(await y.inputValue())).toBe(before[1]);
        await canvas.press('Shift+ArrowUp');
        expect(Number(await z.inputValue()) - before[2]).toBeCloseTo(.001, 3);
        const bounds = (await canvas.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .55);
        await page.mouse.down();
        const ownerX = await x.inputValue();
        await canvas.dispatchEvent('pointerdown', { pointerId: 99, isPrimary: false, button: 0, clientX: bounds.x + 20, clientY: bounds.y + 20 });
        await canvas.dispatchEvent('pointermove', { pointerId: 99, isPrimary: false, clientX: bounds.x + 90, clientY: bounds.y + 90 });
        expect(await x.inputValue()).toBe(ownerX);
        await page.mouse.move(bounds.x + bounds.width * .58, bounds.y + bounds.height * .6, { steps: 4 });
        await page.mouse.up();
        expect(Number(await y.inputValue())).toBe(before[1]);
        expect(Number(await x.inputValue())).not.toBeCloseTo(before[0], 2);
        await canvas.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`morrow-mobile-${width}.png`), fullPage: false });
        await root.locator('[data-morrow-view="inspector"]').click();
        await root.locator('[data-morrow-tab="joints"]').click();
        await expect(root.locator('[data-morrow-pane="pose"]')).toBeHidden();
        await expect(root.locator('[data-morrow-joint="0"]')).toBeVisible();
        await root.locator('[data-morrow-tab="pose"]').click();
      }
      await root.locator('[data-morrow-source]').click();
      await root.locator('[data-morrow-plan]').click();
      await expect(root.locator('[data-morrow-plan-state]')).toContainText('certified edges');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('morrow-mobile-inspector.png'), fullPage: false });
      await root.locator('[data-morrow-view="motion"]').click();
      await root.locator('[data-morrow-step]').click();
      await expect(root.locator('[data-morrow-time]')).toContainText('0.10 /');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('abort releases WebGL resources, observer, pending solve and animation loops on repeated mounts', async ({ page }) => {
      await page.goto('./');
      const result = await page.evaluate(async () => {
        const modulePath = '/src/projects/morrow/index.ts';
        const { mount } = await import(modulePath);
        const originalRequest = window.requestAnimationFrame;
        const originalCancel = window.cancelAnimationFrame;
        const pending = new Set<number>();
        window.requestAnimationFrame = callback => {
          const id = originalRequest(time => { pending.delete(id); callback(time); });
          pending.add(id); return id;
        };
        window.cancelAnimationFrame = id => { pending.delete(id); originalCancel(id); };
        let removed = 0, lost = 0, idle = 0;
        try {
          for (let i = 0; i < 3; i++) {
            const container = document.createElement('div'); container.style.width = '800px'; document.body.append(container);
            const controller = new AbortController();
            const instance = await mount({ container, controls: document.createElement('div'), signal: controller.signal,
              reducedMotion: true, report() {} });
            const canvas = container.querySelector('canvas');
            if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing workcell canvas');
            const gl = canvas.getContext('webgl2');
            await new Promise(resolve => setTimeout(resolve, 60));
            if (pending.size === 0) idle++;
            container.querySelector<HTMLButtonElement>('[data-morrow-plan]')?.click();
            controller.abort(); instance.destroy();
            if (!container.querySelector('.project-morrow')) removed++;
            if (gl?.isContextLost()) lost++;
            container.remove();
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          return { removed, lost, idle, pending: pending.size };
        } finally {
          window.requestAnimationFrame = originalRequest; window.cancelAnimationFrame = originalCancel;
        }
      });
      expect(result).toEqual({ removed: 3, lost: 3, idle: 3, pending: 0 });
    });
  });

test.describe('MORROW mathematical workcell', () => {
  test('analytic spatial Jacobian agrees with central differences at general, singular and limit poses', () => {
    for (const q of [HOME, [0, 0, 0, 0, 0, 0] as Joints, degrees([164.9, -64.9, 144.9, 174.9, -104.9, 174.9])]) {
      const j = jacobian(q), h = 1e-6;
      for (let axis = 0; axis < 6; axis++) {
        const a: Joints = [...q], b: Joints = [...q];
        a[axis] += h; b[axis] -= h;
        const plus = forward(a).tool, minus = forward(b).tool;
        const linear = plus.position.clone().sub(minus.position).multiplyScalar(1 / (2 * h));
        const angular = rotationError(plus.orientation, minus.orientation).multiplyScalar(1 / (2 * h));
        [...linear.toArray(), ...angular.toArray()].forEach((v, row) => expect(j[row][axis]).toBeCloseTo(v, 6));
      }
    }
  });

  test('quaternion logarithms are finite near identity and pi and invariant to sign', () => {
    const axis = new Vector3(1, -2, 3).normalize();
    for (const angle of [0, 1e-12, .4, Math.PI - 1e-9, Math.PI]) {
      const q = new Quaternion().setFromAxisAngle(axis, angle);
      const error = rotationError(q, new Quaternion());
      expect(error.length()).toBeCloseTo(angle, 9);
      expect(error.toArray().every(Number.isFinite)).toBe(true);
      const negative = new Quaternion(-q.x, -q.y, -q.z, -q.w);
      expect(rotationError(negative, q).length()).toBeLessThan(1e-12);
      expect(rotationError(negative, new Quaternion()).length()).toBeCloseTo(angle, 9);
    }
  });

  test('IK reaches both position and orientation for all tasks and reports honest unreachable residuals', () => {
    for (const preset of PRESETS) {
      const result = inverse(forward(preset.target).tool, preset.start);
      expect(result.converged, `${preset.id}: ${JSON.stringify(result)}`).toBe(true);
      expect(result.positionError).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(result.angleError).toBeLessThanOrEqual(ANGLE_TOLERANCE);
      expect(validJoints(result.joints)).toBe(true);
    }
    const target = { position: new Vector3(3, 2, 0), orientation: new Quaternion() };
    const failed = inverse(target, HOME);
    expect(failed.converged).toBe(false);
    expect(failed.positionError).toBeGreaterThan(1);
    expect(target.position.toArray()).toEqual([3, 2, 0]);
    expect(failed.iterations).toBeLessThanOrEqual(640);
    expect(validJoints(failed.joints)).toBe(true);
    const singular = inverse(forward([0, 0, 0, 0, 0, 0]).tool, HOME);
    expect(singular.converged).toBe(true);
  });

  test('limits and nonfinite interpolation reject rather than silently wrapping joints', () => {
    expect(() => forward(degrees([166, 0, 0, 0, 0, 0]))).toThrow(/limits/);
    expect(() => interpolate(HOME, PICK, 1.001)).toThrow();
    expect(() => interpolate(HOME, PICK, Number.NaN)).toThrow();
    for (let i = 0; i <= 100; i++) expect(validJoints(interpolate(HOME, PICK, i / 100))).toBe(true);
    const nearLimits = inverse(forward(degrees([164.9, 100, -120, 174, 85, -174])).tool,
      degrees([164, 99, -119, 173, 84, -173]));
    expect(nearLimits.converged).toBe(true);
  });

  test('segment distances cover interiors, parallel and degenerate cases with exact box clearance', () => {
    const a = new Vector3(-1, 0, 0), b = new Vector3(1, 0, 0);
    expect(segmentDistance(a, b, new Vector3(0, -1, 0), new Vector3(0, 1, 0))).toBe(0);
    expect(segmentDistance(a, b, new Vector3(-1, 1, 0), new Vector3(1, 1, 0))).toBe(1);
    expect(segmentDistance(a, a, b, b)).toBe(2);
    const box = { id: 'box', center: new Vector3(), half: new Vector3(.1, .1, .1) };
    expect(segmentBoxDistance(a, b, box)).toBe(0);
    expect(segmentBoxDistance(new Vector3(-1, .3, 0), new Vector3(1, .3, 0), box)).toBeCloseTo(.2, 12);
    expect(segmentBoxDistance(new Vector3(.2, .2, .2), new Vector3(.2, .2, .2), box)).toBeCloseTo(Math.sqrt(.03), 12);
  });

  test('preset starts and goals are clear and self/obstacle/margin/payload collisions are meaningful', () => {
    for (const preset of PRESETS) {
      const state = createState(preset.id), world = worldFor(state);
      expect(clearance(preset.start, world).safe, `${preset.id} start: ${JSON.stringify(clearance(preset.start, world))}`).toBe(true);
      expect(clearance(preset.target, world).safe, `${preset.id} goal: ${JSON.stringify(clearance(preset.target, world))}`).toBe(true);
    }
    const world = worldFor(createState());
    const folded = degrees([0, 100, 145, 0, 80, 0]);
    expect(clearance(folded, world).safe).toBe(false);
    expect(clearance(folded, world).pair).toMatch(/Link \d \/ (Link|pedestal)/);
    const atTool = forward(HOME).tool.position;
    const obstructed = { ...world, obstacles: [{ id: 'Tool block', center: atTool, half: new Vector3(.02, .02, .02) }] };
    expect(clearance(HOME, obstructed).safe).toBe(false);
    const near = { ...world, obstacles: [{ id: 'Margin', center: atTool.clone().add(new Vector3(0, .049, 0)), half: new Vector3(.001, .001, .001) }] };
    expect(clearance(HOME, near).safe).toBe(false);
    expect(MARGIN).toBe(.012);
    const picked = grip({ ...createState(), joints: PICK });
    const payload = partPose(PICK, worldFor(picked));
    expect(payload.position.distanceTo(picked.part.pose.position)).toBeLessThan(1e-12);
    const blockedPayload = { ...worldFor(picked), obstacles: [{ id: 'Payload block', center: payload.position.clone().add(new Vector3(0, .057, 0)), half: new Vector3(.002, .002, .002) }] };
    expect(clearance(PICK, blockedPayload).safe).toBe(false);
    expect(clearance(PICK, blockedPayload).pair).toMatch(/^Payload/);
    expect(clearance(PICK, { ...blockedPayload, attachment: null }).safe).toBe(false);
    expect(clearance(PICK, { ...blockedPayload, attachment: null }).pair).toBe('Part / Payload block');
    const emptyGripper = { ...blockedPayload, attachment: null, part: { radius: picked.part.radius,
      pose: { position: new Vector3(-.9, .3, .9), orientation: new Quaternion() } } };
    expect(clearance(PICK, emptyGripper).safe).toBe(true);
  });

  test('seeded planning is deterministic and every timed trajectory edge is swept-certified', () => {
    const state = createState('detour'), world = worldFor(state);
    expect(checkEdge(PICK, PLACE, world).certified).toBe(false);
    const result = plan(PICK, PLACE, world);
    expect(result.found, JSON.stringify(result)).toBe(true);
    expect(result.path).toEqual(plan(PICK, PLACE, world).path);
    expect(result.nodes).toBeLessThanOrEqual(1800);
    expect(result.iterations).toBeLessThanOrEqual(900);
    for (let i = 1; i < result.path.length; i++) expect(checkEdge(result.path[i - 1], result.path[i], world).certified).toBe(true);
    const trajectory = timePath(result.path);
    for (let t = 0; t < trajectory.duration; t += .025) {
      const a = sampleTrajectory(trajectory, t), b = sampleTrajectory(trajectory, t + .001);
      expect(clearance(a, world).safe).toBe(true);
      a.forEach((v, j) => expect(Math.abs(b[j] - v) / .001).toBeLessThanOrEqual(JOINTS[j].speed + 1e-5));
    }
    expect(sampleTrajectory(trajectory, 0)).toEqual(PICK);
    expect(sampleTrajectory(trajectory, trajectory.duration)).toEqual(PLACE);
    const budget = plan(PICK, PLACE, world, { iterations: 1, nodes: 2 });
    expect(budget.found).toBe(false);
    expect(budget.path).toEqual([]);
    expect(budget.reason).toMatch(/not proof/);
  });

  test('grasp is local, payload follows tool exactly and a complete pick/place is validated', () => {
    const initial = createState();
    expect(() => grip(initial)).toThrow(/25 mm/);
    const approach = plan(initial.joints, PICK, worldFor(initial));
    expect(approach.found).toBe(true);
    const picked = grip({ ...initial, joints: PICK });
    expect(() => release(picked)).toThrow(/receiver/);
    const carry = plan(PICK, PLACE, worldFor(picked));
    expect(carry.found).toBe(true);
    for (let i = 1; i < carry.path.length; i++) expect(checkEdge(carry.path[i - 1], carry.path[i], worldFor(picked)).certified).toBe(true);
    const placed = release({ ...picked, joints: PLACE });
    expect(taskComplete(placed)).toBe(true);
    expect(placed.part.pose.position.distanceTo(destination.position)).toBeLessThan(1e-12);
  });

  test('history, bounded versioned imports and exported inspection programs preserve semantics', () => {
    const state = createState(), history = new History();
    history.remember(state);
    const edited = cloneState(state); edited.target.position.x += .1;
    expect(history.undo(edited).target.position.toArray()).toEqual(state.target.position.toArray());
    expect(history.redo(state).target.position.toArray()).toEqual(edited.target.position.toArray());
    expect(serialize(deserialize(serialize(state)))).toBe(serialize(state));
    const picked = grip({ ...state, joints: PICK });
    expect(deserialize(serialize(picked)).attachment?.position.length()).toBe(0);
    expect(() => deserialize('x'.repeat(32001))).toThrow(/32 KB/);
    expect(() => deserialize('{')).toThrow(/valid JSON/);
    expect(() => deserialize(serialize(state).replace('"version": 1', '"version": 2'))).toThrow(/version 1/);
    const invalid = JSON.parse(serialize(state)); invalid.joints[0] = 999;
    expect(() => deserialize(JSON.stringify(invalid))).toThrow(/six limited/);
    invalid.joints = HOME; invalid.target.orientation = [0, 0, 0, 0];
    expect(() => deserialize(JSON.stringify(invalid))).toThrow(/unit quaternions/);
    const remoteAttachment = JSON.parse(serialize(picked));
    remoteAttachment.attachment.position = [.1, 0, 0];
    expect(() => deserialize(JSON.stringify(remoteAttachment))).toThrow(/contact envelope/);
    const tooMany = JSON.parse(serialize(state));
    tooMany.waypoints = Array.from({ length: 7 }, () => tooMany.target);
    expect(() => deserialize(JSON.stringify(tooMany))).toThrow(/six waypoints/);
    for (let i = 0; i < 30; i++) history.remember(state);
    for (let i = 0; i < 24; i++) history.undo(state);
    expect(history.canUndo).toBe(false);
    const program = JSON.parse(exportProgram(timePath([HOME, PICK]), state));
    expect(program.warning).toContain('Not commands for physical hardware');
    expect(program.nodes[0].joints).toEqual(HOME);
    expect(program.units.joints).toBe('radians');
  });

  test('loose-part receiver penetration and margin violations reject without moving the imported coupon', () => {
    const initial = createState(), original = serialize(initial);
    for (const offset of [-.04, -.02]) {
      const imported = JSON.parse(original);
      imported.part.position = destination.position.clone().add(new Vector3(0, offset, 0)).toArray();
      imported.part.orientation = destination.orientation.toArray();
      const document = JSON.stringify(imported), originalDocument = structuredClone(imported);
      const state = cloneState(initial);
      state.part.pose.position.fromArray(imported.part.position);
      state.part.pose.orientation.copy(destination.orientation);
      const before = serialize(state), world = worldFor(state);
      const fixture = world.obstacles.find(obstacle => obstacle.id === 'Receiver fixture')!;
      const gap = segmentBoxDistance(state.part.pose.position, state.part.pose.position, fixture) - state.part.radius;
      expect(gap).toBeCloseTo(offset === -.04 ? -.014 : .006, 12);
      const result = clearance(state.joints, world);
      expect(result.clearance).toBeCloseTo(gap - MARGIN, 12);
      expect(result.safe).toBe(false);
      expect(result.pair).toBe('Part / Receiver fixture');
      expect(taskComplete(state)).toBe(false);
      expect(() => deserialize(document)).toThrow(/Part \/ Receiver fixture/);
      const edge = checkEdge(HOME, PICK, world);
      expect(edge.certified).toBe(false);
      expect(edge.samples).toBe(0);
      const planned = plan(HOME, PICK, world);
      expect(planned.found).toBe(false);
      expect(planned.path).toEqual([]);
      expect(planned.reason).toContain('Part / Receiver fixture');
      expect(serialize(state)).toBe(before);
      expect(imported).toEqual(originalDocument);
      expect(serialize(initial)).toBe(original);
    }
  });

  test('loose-part source, resting and clear receiver placements preserve their exact poses on import', () => {
    for (const preset of PRESETS) {
      const state = createState(preset.id), document = serialize(state);
      expect(serialize(deserialize(document))).toBe(document);
      expect(taskComplete(state)).toBe(false);
    }
    for (const placement of [
      { position: new Vector3(-.9, .046 + MARGIN + .000001, .9), complete: false },
      { position: destination.position.clone(), complete: true },
      { position: destination.position.clone().add(new Vector3(0, -.01, 0)), complete: true },
      { position: destination.position.clone().add(new Vector3(0, -.01399, 0)), complete: true },
    ]) {
      const state = createState();
      state.part.pose.position.copy(placement.position);
      state.part.pose.orientation.copy(destination.orientation);
      const document = serialize(state), restored = deserialize(document);
      expect(clearance(restored.joints, worldFor(restored)).safe).toBe(true);
      expect(taskComplete(restored)).toBe(placement.complete);
      expect(restored.part.pose.position.toArray()).toEqual(placement.position.toArray());
      expect(serialize(restored)).toBe(document);
    }
  });

  test('loose-part surface, pedestal and obstacle collisions invalidate the world', () => {
    for (const fixture of [
      { position: new Vector3(-.9, .03, .9), pair: 'Part / work surface' },
      { position: new Vector3(0, .14, 0), pair: 'Part / pedestal' },
      { position: new Vector3(.73, .18, 0), pair: 'Part / Central baffle' },
    ]) {
      const state = createState();
      state.part.pose.position.copy(fixture.position);
      const before = serialize(state);
      const result = clearance(state.joints, worldFor(state));
      expect(result.safe).toBe(false);
      expect(result.pair).toBe(fixture.pair);
      expect(() => deserialize(before)).toThrow(fixture.pair);
      expect(() => grip(state)).toThrow(/colliding state/);
      expect(taskComplete(state)).toBe(false);
      expect(serialize(state)).toBe(before);
    }
  });

  test('loose-part stationary clearance does not consume the moving-edge subdivision budget', () => {
    const lifted = createState();
    lifted.part.pose.position.set(-.9, .3, .9);
    const reference = checkEdge(HOME, PICK, worldFor(lifted));
    expect(reference.certified).toBe(true);
    const resting = cloneState(lifted);
    resting.part.pose.position.y = resting.part.radius + MARGIN + .000001;
    const world = worldFor(resting);
    expect(clearance(HOME, world).clearance).toBeCloseTo(.000001, 12);
    const edge = checkEdge(HOME, PICK, world, reference.samples);
    expect(edge.certified).toBe(true);
    expect(edge.samples).toBe(reference.samples);
    expect(edge.clearance).toBeCloseTo(.000001, 12);
    expect(plan(HOME, PICK, world).path).toEqual([HOME, PICK]);
  });

  test('release rejects a coupon inside the receiver but penetrating its fixture, without detaching it', () => {
    const held = grip({ ...createState(), joints: PICK });
    const target = { position: destination.position.clone().add(new Vector3(0, -.04, 0)),
      orientation: destination.orientation.clone() };
    const solution = inverse(target, PLACE);
    expect(solution.converged).toBe(true);
    held.joints = solution.joints;
    const before = serialize(held);
    const pose = partPose(held.joints, worldFor(held));
    expect(pose.position.distanceTo(destination.position)).toBeLessThan(.045);
    expect(() => release(held)).toThrow(/Part \/ Receiver fixture/);
    expect(held.attachment).not.toBeNull();
    expect(serialize(held)).toBe(before);
    expect(taskComplete(held)).toBe(false);
  });

  test('IK residual offsets survive grasp, every carried sample, and release without snapping the part', () => {
    const state = createState();
    const solvedPick = inverse(state.target, state.joints);
    expect(solvedPick.converged).toBe(true);
    const picked = grip({ ...state, joints: solvedPick.joints });
    expect(picked.attachment!.position.length()).toBeGreaterThan(1e-8);
    expect(partPose(picked.joints, worldFor(picked)).position.distanceTo(state.part.pose.position)).toBeLessThan(1e-12);
    const solvedPlace = inverse(destination, picked.joints);
    expect(solvedPlace.converged).toBe(true);
    const world = worldFor(picked), route = plan(picked.joints, solvedPlace.joints, world);
    expect(route.found).toBe(true);
    const trajectory = timePath(route.path);
    for (let i = 1; i < route.path.length; i++) expect(checkEdge(route.path[i - 1], route.path[i], world).certified).toBe(true);
    for (let t = 0; t <= trajectory.duration; t += .005) expect(clearance(sampleTrajectory(trajectory, t), world).safe).toBe(true);
    expect(taskComplete(release({ ...picked, joints: solvedPlace.joints }))).toBe(true);
  });

  test('chunked IK and planning abort and generation tokens discard obsolete work', async () => {
    const generation = new Generation(), old = generation.next();
    const work = consume(inverseSteps({ position: new Vector3(3, 1, 0), orientation: new Quaternion() }, HOME), old.signal, 1);
    const next = generation.next();
    await expect(work).rejects.toMatchObject({ name: 'AbortError' });
    expect(generation.current(old.id)).toBe(false);
    expect(generation.current(next.id)).toBe(true);
    const state = createState('detour');
    const search = consume(planSteps(PICK, PLACE, worldFor(state)), next.signal, 1);
    generation.stop();
    await expect(search).rejects.toMatchObject({ name: 'AbortError' });
  });
});
