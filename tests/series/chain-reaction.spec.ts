import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DOMINO, DURATION, LAYOUTS, LEVER, MARBLE_RADIUS, STAGES, TIMING, WHEEL } from '../../src/projects/chain-reaction/data';
import {
  DOMINO_CONTACT_ANGLE, DOMINO_REST_ANGLE, LEVER_CONTACT_ANGLE, STAGE_CUES,
  dominoStart, dominoTip, leverPose, marblePose, stateAt,
} from '../../src/projects/chain-reaction/timeline';

async function openMachine(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/chain-reaction/');
  await expect(page.locator('.project-chain-reaction')).toBeVisible();
  await expect(page.locator('.project-chain-reaction .cr-scene')).toHaveCount(1);
}

async function seek(page: Page, time: number) {
  await page.getByRole('slider', { name: 'Timeline position' }).evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, time);
}

test('chain timeline: meaningful endpoints, contact order, and mechanically connected poses', () => {
  const initial = stateAt(0);
  expect(initial).toMatchObject({ time: 0, stage: 'roll', complete: false, marble: 0, flower: 0 });
  expect(initial.dominoes).toEqual(Array(DOMINO.count).fill(0));
  expect(initial.lever.lift).toBe(0);
  expect(initial.wheel.angle).toBe(0);
  expect(stateAt(-10)).toEqual(initial);
  expect(stateAt(DURATION + 10)).toEqual(stateAt(DURATION));
  expect(() => stateAt(Number.NaN)).toThrow(RangeError);
  expect(() => stateAt(Infinity)).toThrow(RangeError);

  const epsilon = 0.00001;
  expect(stateAt(TIMING.firstContact - epsilon).dominoes[0]).toBe(0);
  expect(stateAt(TIMING.firstContact).marble).toBe(1);
  for (let index = 1; index < DOMINO.count; index++) {
    const contact = dominoStart(index);
    expect(stateAt(contact - epsilon).dominoes[index]).toBe(0);
    expect(stateAt(contact).dominoes[index - 1]).toBeCloseTo(DOMINO_CONTACT_ANGLE, 8);
    expect(stateAt(contact + epsilon).dominoes[index]).toBeGreaterThan(0);
  }
  expect(stateAt(STAGE_CUES.release - epsilon).lever.lift).toBe(0);
  expect(stateAt(STAGE_CUES.release).dominoes.at(-1)).toBeCloseTo(LEVER_CONTACT_ANGLE, 8);
  expect(stateAt(TIMING.wheelStart - epsilon).wheel.angle).toBe(0);
  expect(stateAt(TIMING.wheelStart).lever.lift).toBeGreaterThan(WHEEL.pinClearance);
  expect(stateAt(STAGE_CUES.bloom - epsilon).flower).toBe(0);
  expect(stateAt(STAGE_CUES.bloom + epsilon).flower).toBeGreaterThan(0);

  for (const layout of Object.values(LAYOUTS)) {
    const ball = marblePose(layout, stateAt(TIMING.firstContact).marble);
    expect(ball.x + MARBLE_RADIUS).toBeCloseTo(layout.firstDominoX - DOMINO.width / 2, 10);
    expect(ball.y + MARBLE_RADIUS).toBe(layout.railY);
    const contactState = stateAt(5.83);
    const lever = leverPose(layout, contactState);
    const tip = dominoTip(contactState.dominoes.at(-1)!);
    const lastX = layout.firstDominoX + (DOMINO.count - 1) * DOMINO.gap;
    expect(lever.left.y - LEVER.paddleHalfHeight).toBeCloseTo(layout.railY + tip.y, 8);
    expect(lastX + tip.x).toBeGreaterThan(lever.left.x - LEVER.paddleHalfWidth);
    expect(lastX + tip.x).toBeLessThan(lever.left.x + LEVER.paddleHalfWidth);
    expect(lever.pivotY - lever.right.y).toBeCloseTo(contactState.lever.lift, 8);
  }
  for (const time of [6.15, 7.3, 8.7, 9.8, 10.8]) {
    const state = stateAt(time);
    expect(Math.hypot(state.wheel.camX, state.wheel.camY - state.wheel.followerY))
      .toBeCloseTo(WHEEL.camRadius + WHEEL.rollerRadius, 9);
    expect(state.wheel.weightDrop).toBeCloseTo(state.wheel.angle / 180 * Math.PI * WHEEL.drumRadius, 9);
    if (state.flower > 0) expect(state.wheel.lift).toBeGreaterThan(WHEEL.bloomThreshold);
  }
  for (const stage of STAGES) expect(stateAt(stage.seek).stage).toBe(stage.id);
  const final = stateAt(DURATION);
  expect(final).toMatchObject({ complete: true, stage: 'bloom', marble: 1, flower: 1 });
  expect(final.dominoes).toEqual(Array(DOMINO.count).fill(DOMINO_REST_ANGLE));
  expect(final.wheel.angle).toBe(180);
  expect(final.wheel.lift).toBe(52);
  expect(stateAt(TIMING.wheelStop).wheel).toEqual(final.wheel);
});

test('chain timeline: arbitrary reverse seeks reconstruct exactly the same state', () => {
  const times = [0, 0.45, 1.7, 2.8, 3.21, 4.25, STAGE_CUES.release, 5.83, 6.15, 8.25, STAGE_CUES.bloom, 10.8, 12];
  const snapshots = times.map((time) => structuredClone(stateAt(time)));
  for (const time of [11.2, 0.1, 8.8, 3.8, 12, 0]) stateAt(time);
  for (let index = times.length - 1; index >= 0; index--) {
    expect(stateAt(times[index])).toEqual(snapshots[index]);
  }
  const one = stateAt(4.25);
  const another = stateAt(4.25);
  expect(one).not.toBe(another);
  expect(one.dominoes).not.toBe(another.dominoes);
  expect(one.dominoes).toEqual(another.dominoes);
});

test('chain browser: stage inspection, reverse scrubbing, transport, speed, and native keyboard controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openMachine(page);
  const root = page.locator('.project-chain-reaction');
  const svg = root.locator('.cr-scene');
  const slider = root.getByRole('slider', { name: 'Timeline position' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-time', '0.0000');
  expect((await svg.boundingBox())!.y).toBeLessThan(250);

  await root.getByRole('button', { name: 'Inspect stage 3: Release', exact: true }).click();
  await expect(root).toHaveAttribute('data-stage', 'release');
  await expect(root).toHaveAttribute('data-time', '5.8300');
  await expect(root.locator('[data-detail-title]')).toHaveText('A change of direction.');
  await expect(root.locator('[data-explanation]')).toContainText('pin out of the wheel');
  await expect(root.getByRole('button', { name: 'Inspect stage 3: Release', exact: true })).toHaveAttribute('aria-current', 'step');

  await seek(page, 8.25);
  await expect(slider).toHaveCSS('--cr-progress', '68.75%');
  const firstPose = await svg.innerHTML();
  await seek(page, 11.4);
  await seek(page, 2.6);
  await seek(page, 8.25);
  expect(await svg.innerHTML()).toBe(firstPose);
  await page.waitForTimeout(160);
  expect(await svg.innerHTML()).toBe(firstPose);
  await slider.press('ArrowLeft');
  await expect(root).toHaveAttribute('data-time', '8.2400');
  await slider.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');

  await root.getByLabel('Playback speed', { exact: true }).selectOption('2');
  await expect(root.locator('[data-feedback]')).toContainText('2×');
  const play = root.getByRole('button', { name: 'Play animation', exact: true });
  await play.focus();
  await play.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-time'))).toBeGreaterThan(8.3);
  await root.getByRole('button', { name: 'Pause animation', exact: true }).press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const pausedPose = await svg.innerHTML();
  await page.waitForTimeout(160);
  expect(await svg.innerHTML()).toBe(pausedPose);

  await root.focus();
  await root.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await root.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await slider.press('End');
  await expect(root).toHaveAttribute('data-time', '12.0000');
  await expect(slider).toHaveCSS('--cr-progress', '100%');
  await expect(root.locator('[data-flower]')).toHaveAttribute('data-open', '1.0000');
  await expect(root.locator('[data-machine-status]')).toHaveText('The chain is complete');
  await root.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect(Number(await root.getAttribute('data-time'))).toBeLessThan(1);
  await seek(page, 11.92);
  await root.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-time', '12.0000');
  await expect(root.locator('[data-feedback]')).toContainText('Chain complete');
  await root.getByRole('button', { name: 'Replay from the beginning', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect(Number(await root.getAttribute('data-time'))).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('chain browser: preference changes freeze every part and never restart implicitly', async ({ page }) => {
  await openMachine(page, 'no-preference');
  const root = page.locator('.project-chain-reaction');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-time'))).toBeGreaterThan(0.05);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-motion-note]')).toBeVisible();
  const clock = await root.getAttribute('data-time');
  const snapshot = await root.locator('.cr-scene').innerHTML();
  await page.waitForTimeout(180);
  expect(await root.getAttribute('data-time')).toBe(clock);
  expect(await root.locator('.cr-scene').innerHTML()).toBe(snapshot);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-reduced-motion', 'false');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-motion-note]')).toBeHidden();
  await root.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-time'))).toBeGreaterThan(Number(clock));
});

test('chain browser: 375px framing keeps the full machine, readable controls, and no horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openMachine(page);
  const root = page.locator('.project-chain-reaction');
  const preview = root.locator('[data-project-preview]');
  await expect(preview).toHaveCount(1);
  await expect(root.locator('[data-scene-host]')).toHaveAttribute('data-layout', 'narrow');
  const sceneBox = await root.locator('.cr-scene').boundingBox();
  expect(sceneBox!.y).toBeLessThan(300);
  expect(sceneBox!.width).toBeLessThan(375);
  expect(sceneBox!.height).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await root.locator('[data-seek-stage], [data-play], [data-replay]').all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await root.getByRole('button', { name: 'Inspect stage 5: Bloom', exact: true }).click();
  await expect(root.locator('[data-flower]')).toHaveAttribute('data-open', '1.0000');
  await expect(root.locator('[data-detail-title]')).toContainText('delight');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('chain-reaction-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(root.locator('[data-scene-host]')).toHaveAttribute('data-layout', 'wide');
  await expect(root).toHaveAttribute('data-time', '10.8000');
  await expect(root.locator('[data-flower]')).toHaveAttribute('data-open', '1.0000');
  await expect(root.locator('.cr-scene')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('chain-reaction-desktop.png') });
});

test('chain browser: external abort cancels frames, removes visibility listeners, and leaves inert controls', async ({ page }) => {
  await openMachine(page);
  await page.waitForTimeout(100);
  const result = await page.evaluate(async () => {
    const source = '/src/projects/chain-reaction/index.ts';
    const { mount } = await import(source);
    const host = document.createElement('div');
    document.body.append(host);
    const controller = new AbortController();
    const frames = new Set<number>();
    const visibilityListeners = new Set<unknown>();
    const reports: string[] = [];
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    window.requestAnimationFrame = (callback) => {
      const frame = request((now) => { frames.delete(frame); callback(now); });
      frames.add(frame);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => { frames.delete(frame); cancel(frame); };
    document.addEventListener = ((...args: Parameters<Document['addEventListener']>) => {
      if (args[0] === 'visibilitychange') visibilityListeners.add(args[1]);
      add(...args);
    }) as Document['addEventListener'];
    document.removeEventListener = ((...args: Parameters<Document['removeEventListener']>) => {
      if (args[0] === 'visibilitychange') visibilityListeners.delete(args[1]);
      remove(...args);
    }) as Document['removeEventListener'];
    try {
      const instance = mount({
        container: host,
        controls: document.createElement('div'),
        signal: controller.signal,
        reducedMotion: true,
        report: (message: string) => reports.push(message),
      });
      instance.setPaused(false);
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const activeRoot = host.querySelector<HTMLElement>('.project-chain-reaction')!;
      const movingTime = Number(activeRoot.dataset.time);
      const heldPlay = activeRoot.querySelector<HTMLButtonElement>('[data-play]')!;
      const pendingBefore = frames.size;
      const listenersBefore = visibilityListeners.size;
      controller.abort();
      instance.destroy();
      instance.destroy();
      const reportCount = reports.length;
      heldPlay.click();
      instance.reset();
      instance.setPaused(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((resolve) => window.setTimeout(resolve, 90));
      return {
        movingTime, pendingBefore, listenersBefore,
        pendingAfter: frames.size,
        listenersAfter: visibilityListeners.size,
        children: host.childElementCount,
        newReports: reports.length - reportCount,
      };
    } finally {
      controller.abort();
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      document.addEventListener = add;
      document.removeEventListener = remove;
      host.remove();
    }
  });
  expect(result.movingTime).toBeGreaterThan(0);
  expect(result.pendingBefore).toBe(1);
  expect(result.listenersBefore).toBe(1);
  expect(result).toMatchObject({ pendingAfter: 0, listenersAfter: 0, children: 0, newReports: 0 });
});
