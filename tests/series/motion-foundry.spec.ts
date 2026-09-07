import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { relative } from 'node:path';
import { LESSONS } from '../../src/projects/motion-foundry/data';
import { DEFAULT_PARAMETERS, sampleMotion } from '../../src/projects/motion-foundry/model';

const projectURL = './projects/motion-foundry/';

async function openFoundry(page: Page) {
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\//, socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      if (typeof message === 'string' && /"type"\s*:\s*"(?:update|full-reload)"/.test(message)) return;
      socket.send(message);
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(projectURL);
}

async function setRange(input: Locator, value: number) {
  await input.evaluate((element: HTMLInputElement, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('motion models have exact endpoints and reproduce frames in reverse order', () => {
  for (const lesson of LESSONS) {
    const start = sampleMotion(lesson.id, 0);
    const end = sampleMotion(lesson.id, DEFAULT_PARAMETERS.duration);
    for (const [frame, position] of [[start, 0], [end, 1]] as const) {
      for (const pose of [frame.plain, frame.expressive]) {
        expect(pose.x, `${lesson.id}: endpoint`).toBe(position);
        expect(pose.lift).toBe(0);
        expect(pose.scaleX).toBe(1);
        expect(pose.scaleY).toBe(1);
        expect(pose.followers.every((part) => part.x === position)).toBe(true);
      }
    }
    expect(sampleMotion(lesson.id, -2)).toEqual(start);
    expect(sampleMotion(lesson.id, 20)).toEqual(end);
    const times = [0, 0.13, 0.35, 0.51, 0.67, 0.83, 1].map((t) => t * DEFAULT_PARAMETERS.duration);
    const forward = times.map((seconds) => sampleMotion(lesson.id, seconds));
    const reverse = [...times].reverse().map((seconds) => sampleMotion(lesson.id, seconds)).reverse();
    expect(reverse, `${lesson.id}: history-free reverse scrubbing`).toEqual(forward);
    expect(JSON.stringify(forward)).not.toMatch(/NaN|Infinity|null/);
  }
});

test('each principle changes a substantive property and all model controls matter', () => {
  const duration = DEFAULT_PARAMETERS.duration;
  const at = (id: Parameters<typeof sampleMotion>[0], progress: number) => sampleMotion(id, progress * duration);
  expect(at('timing', 0.3).plain.x).toBeCloseTo(0.3);
  expect(at('timing', 0.3).expressive.x).toBeLessThan(at('timing', 0.3).plain.x);
  const preparation = 0.22 * DEFAULT_PARAMETERS.amplitude;
  expect(at('anticipation', preparation / 2).expressive.x).toBeLessThan(0);
  expect(at('anticipation', preparation / 2).plain.x).toBeGreaterThan(0);
  expect(at('anticipation', preparation + 0.1).expressive.x).toBeGreaterThan(at('anticipation', preparation).expressive.x);
  for (let tick = 0; tick <= 100; tick++) {
    const squash = at('squash-stretch', tick / 100);
    expect(squash.expressive.scaleX * squash.expressive.scaleY).toBeCloseTo(1, 12);
    expect(squash.expressive.lift).toBe(squash.plain.lift);
    expect(squash.expressive.x).toBe(squash.plain.x);
  }
  expect(at('squash-stretch', 0.83).expressive.scaleY).toBeLessThan(0.8);
  expect(at('arcs', 0.5).expressive.lift).toBeGreaterThan(70);
  expect(at('arcs', 0.5).plain.lift).toBe(0);
  expect(at('arcs', 0.5).expressive.x).toBe(at('arcs', 0.5).plain.x);
  expect(at('overshoot', 0.6).expressive.x).toBeGreaterThan(1.1);
  expect(at('overshoot', 0.75).expressive.x).toBeLessThan(1);
  const following = at('follow-through', 0.51);
  expect(following.expressive.x).toBe(1);
  expect(following.expressive.followers[1].x).toBeLessThan(following.expressive.followers[0].x);
  expect(following.expressive.followers[1].x).toBeLessThan(0.8);
  expect(following.plain.followers.every((part) => part.x === 1)).toBe(true);

  for (const lesson of LESSONS) {
    const seconds = lesson.featuredProgress * duration;
    const defaultFrame = sampleMotion(lesson.id, seconds);
    expect(defaultFrame.expressive, `${lesson.id}: useful comparison frame`).not.toEqual(defaultFrame.plain);
    for (const progress of [0.1, 0.3, 0.5, 0.8, 1]) {
      const zero = sampleMotion(lesson.id, progress * duration, { ...DEFAULT_PARAMETERS, amplitude: 0 });
      expect(zero.expressive, `${lesson.id}: zero amplitude`).toEqual(zero.plain);
    }
    const quiet = sampleMotion(lesson.id, seconds, { ...DEFAULT_PARAMETERS, amplitude: 0.2 });
    const strong = sampleMotion(lesson.id, seconds, { ...DEFAULT_PARAMETERS, amplitude: 0.95 });
    expect(strong.expressive, `${lesson.id}: amplitude control`).not.toEqual(quiet.expressive);
    const quick = sampleMotion(lesson.id, 0.7, { ...DEFAULT_PARAMETERS, duration: 1.4 });
    const slow = sampleMotion(lesson.id, 0.7, { ...DEFAULT_PARAMETERS, duration: 4 });
    expect(quick.expressive, `${lesson.id}: duration control`).not.toEqual(slow.expressive);
    const earlySmooth = sampleMotion(lesson.id, duration * 0.3);
    const earlyIn = sampleMotion(lesson.id, duration * 0.3, { ...DEFAULT_PARAMETERS, easing: 'in' });
    expect(earlyIn.expressive, `${lesson.id}: easing control`).not.toEqual(earlySmooth.expressive);
  }
});

test('lessons, parameters, playback, replay, and reverse scrubbing work together', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFoundry(page);
  const root = page.locator('.project-motion-foundry');
  await expect(root).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Motion Foundry', exact: true })).toBeVisible();
  expect((await root.locator('.mf-scene-svg').first().boundingBox())!.y).toBeLessThanOrEqual(300);
  await testInfo.attach('motion-foundry-desktop', {
    body: await page.screenshot({ fullPage: true, path: relative(process.cwd(), testInfo.outputPath('motion-foundry-desktop.png')) }),
    contentType: 'image/png',
  });
  await root.getByRole('button', { name: 'Lessons', exact: true }).click();
  for (const lesson of LESSONS) {
    await root.locator(`[data-mf-lesson="${lesson.id}"]`).click();
    await expect(root).toHaveAttribute('data-lesson', lesson.id);
    await expect(root).toHaveAttribute('data-motion', 'paused');
    await expect(root.locator(`[data-mf-lesson="${lesson.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.locator('[data-mf-headline]')).toHaveText(lesson.headline);
    expect((await root.locator('[data-mf-explanation]').innerText()).length).toBeGreaterThan(200);
    const readings = await root.locator('[data-mf-metric]').allTextContents();
    expect(readings[0]).not.toBe(readings[1]);
  }
  await root.locator('[data-mf-lesson="arcs"]').click();
  await root.getByRole('button', { name: 'Close Choose a motion lesson', exact: true }).click();
  const position = page.getByRole('slider', { name: 'Clip position', exact: true });
  const expressive = root.locator('[data-mf-scene="expressive"] [data-mf-puck]');
  const plain = root.locator('[data-mf-scene="plain"] [data-mf-puck]');
  await setRange(position, 230);
  expect(await position.evaluate((element: HTMLInputElement) => parseFloat(element.style.getPropertyValue('--mf-range-progress')))).toBeCloseTo(23);
  const first = await expressive.getAttribute('transform');
  await setRange(position, 780);
  expect(await expressive.getAttribute('transform')).not.toBe(first);
  await setRange(position, 230);
  expect(await expressive.getAttribute('transform')).toBe(first);
  await setRange(page.getByRole('slider', { name: 'Expression amplitude', exact: true }), 0);
  expect(await expressive.getAttribute('transform')).toBe(await plain.getAttribute('transform'));
  await setRange(page.getByRole('slider', { name: 'Expression amplitude', exact: true }), 100);
  expect(await expressive.getAttribute('transform')).not.toBe(await plain.getAttribute('transform'));
  const beforeEasing = await expressive.getAttribute('transform');
  await page.getByRole('combobox', { name: 'Travel easing', exact: true }).selectOption('out');
  expect(await expressive.getAttribute('transform')).not.toBe(beforeEasing);
  await setRange(page.getByRole('slider', { name: 'Clip duration', exact: true }), 5);
  await expect(position).toHaveValue('230');
  await expect(root.locator('[data-mf-duration-output]')).toHaveText('5.0 s');
  await page.getByRole('combobox', { name: 'Viewing speed', exact: true }).selectOption('0.25');
  await page.getByRole('checkbox', { name: 'Show motion guides', exact: true }).uncheck();
  await expect(root.locator('.mf-guide-layer').first()).toBeHidden();
  await page.getByRole('checkbox', { name: 'Show motion guides', exact: true }).check();
  await expect(root.locator('.mf-guide-layer').first()).toBeVisible();
  await root.getByRole('button', { name: 'Principle & notes', exact: true }).click();
  await root.locator('summary').click();
  await expect(root.locator('[data-mf-model-note]')).toContainText('drawn parabola');
  await root.getByRole('button', { name: 'Close Principle & notes', exact: true }).click();
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(230);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const pausedFrame = await expressive.getAttribute('transform');
  await page.waitForTimeout(180);
  expect(await expressive.getAttribute('transform')).toBe(pausedFrame);
  await setRange(page.getByRole('slider', { name: 'Clip duration', exact: true }), 1.2);
  await page.getByRole('combobox', { name: 'Viewing speed', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect(root).toHaveAttribute('data-progress', '1.000000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(position).toHaveValue('1000');
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(root.locator('[data-mf-duration-output]')).toHaveText('2.8 s');
  await expect(root.locator('[data-mf-amplitude-output]')).toHaveText('75%');
  await expect(root.locator('[data-mf-speed]')).toHaveValue('1');
  await expect(root.locator('[data-mf-easing]')).toHaveValue('smooth');
  await expect(root).toHaveAttribute('data-progress', '0.500000');
  expect(errors).toEqual([]);
});

test('mobile scenes stay legible and both motion-preference changes pause playback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openFoundry(page);
  const root = page.locator('.project-motion-foundry');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-progress', '0.320000');
  await testInfo.attach('motion-foundry-mobile', {
    body: await page.screenshot({ fullPage: true, path: relative(process.cwd(), testInfo.outputPath('motion-foundry-mobile.png')) }),
    contentType: 'image/png',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const workbench = (await root.locator('[data-project-preview]').boundingBox())!;
  expect(workbench.y).toBeLessThan(300);
  expect((await root.locator('.mf-scene-svg:visible').first().boundingBox())!.y).toBeLessThanOrEqual(300);
  const plain = (await root.locator('[data-mf-scene="plain"]').boundingBox())!;
  const expressive = (await root.locator('[data-mf-scene="expressive"]').boundingBox())!;
  expect(plain.width).toBeGreaterThan(300);
  expect(plain.height).toBeGreaterThan(240);
  expect(expressive.y).toBe(plain.y);
  await expect(root.getByRole('tab', { name: 'Expressive', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(root.locator('[data-mf-scene="plain"]')).toBeHidden();
  await root.getByRole('tab', { name: 'Plain', exact: true }).click();
  await expect(root.locator('[data-mf-scene="plain"]')).toBeVisible();
  await root.getByRole('tab', { name: 'Expressive', exact: true }).click();
  for (const control of await root.locator('button:visible, select:visible, input[type="range"]:visible, .mf-guide-toggle:visible').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const frame = await root.locator('[data-mf-scene="expressive"] [data-mf-puck]').getAttribute('transform');
  await page.waitForTimeout(150);
  expect(await root.locator('[data-mf-scene="expressive"] [data-mf-puck]').getAttribute('transform')).toBe(frame);
  const position = page.getByRole('slider', { name: 'Clip position', exact: true });
  await position.focus();
  await position.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await position.press('ArrowLeft');
  await expect(position).toHaveValue('319');
  await root.locator('[data-project-preview]').focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-mf-reduced]')).toBeVisible();
});

test('aborting or destroying a mount cancels its frames and removes its listeners', async ({ page }) => {
  await openFoundry(page);
  await expect(page.locator('.project-motion-foundry')).toHaveAttribute('data-motion', 'paused');
  await page.waitForTimeout(100);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/motion-foundry/index.ts';
    const { mount } = await import(modulePath);
    const host = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(host, controls);
    const controller = new AbortController();
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const nativeMedia = window.matchMedia.bind(window);
    const pending = new Set<number>();
    const notices: string[] = [];
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
    window.matchMedia = (value) => {
      const preference = nativeMedia(value);
      preferences.push(preference);
      return preference;
    };
    const nextFrame = () => new Promise<void>((resolve) => nativeRequest(() => resolve()));
    try {
      const instance = mount({ container: host, controls, signal: controller.signal, reducedMotion: false, report: (message: string) => notices.push(message) });
      instance.setPaused(false);
      const root = host.querySelector<HTMLElement>('.project-motion-foundry')!;
      const stalePlay = root.querySelector<HTMLButtonElement>('[data-mf-play]')!;
      await nextFrame();
      await nextFrame();
      const wasActive = root.dataset.motion === 'playing' && pending.size > 0 && frames > 0;
      controller.abort();
      instance.destroy();
      instance.destroy();
      const stoppedAt = frames;
      const noticesAtStop = notices.length;
      stalePlay.click();
      root.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      preferences.forEach((preference) => preference.dispatchEvent(new Event('change')));
      instance.setPaused(false);
      instance.reset();
      await nextFrame();
      await nextFrame();
      return {
        wasActive,
        remainingFrames: pending.size,
        framesAfterStop: frames - stoppedAt,
        rootRemoved: !root.isConnected && host.childElementCount === 0,
        noticesAfterStop: notices.length - noticesAtStop,
      };
    } finally {
      controller.abort();
      host.remove();
      controls.remove();
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      window.matchMedia = nativeMedia;
    }
  });
  expect(result).toEqual({ wasActive: true, remainingFrames: 0, framesAfterStop: 0, rootRemoved: true, noticesAfterStop: 0 });
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`motion workspace: ${viewport.width}x${viewport.height} keeps live tuning beside the study`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openFoundry(page);
    const root = page.locator('.project-motion-foundry');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    const assertFits = async () => {
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ width: viewport.width, height: viewport.height, x: 0, y: 0 });
    };
    await assertFits();
    expect(await root.evaluate(element => getComputedStyle(element).overflowY)).not.toMatch(/hidden|clip/);
    for (const selector of ['.mf-scene-svg:visible', '[data-mf-play]', '[data-mf-position]', '[data-mf-duration]', '[data-mf-amplitude]', '[data-mf-easing]']) {
      const bounds = (await root.locator(selector).first().boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    for (const button of await root.locator('button:visible, select:visible').all()) {
      expect(await button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
    }
    const expressive = root.locator('[data-mf-scene="expressive"] [data-mf-puck]');
    const plain = root.locator('[data-mf-scene="plain"] [data-mf-puck]');
    const amplitude = root.getByRole('slider', { name: 'Expression amplitude', exact: true });
    await amplitude.focus();
    await amplitude.press('Home');
    expect(await expressive.getAttribute('transform')).toBe(await plain.getAttribute('transform'));
    await amplitude.press('End');
    expect(await expressive.getAttribute('transform')).not.toBe(await plain.getAttribute('transform'));
    const before = await expressive.getAttribute('transform');
    await root.getByRole('combobox', { name: 'Travel easing', exact: true }).selectOption('out');
    expect(await expressive.getAttribute('transform')).not.toBe(before);
    if (viewport.width <= 740) {
      await root.getByRole('tab', { name: 'Expressive', exact: true }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(root.locator('[data-mf-scene="plain"]')).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(root.locator('[data-mf-scene="expressive"]')).toBeVisible();
    }
    await root.getByRole('button', { name: 'Lessons', exact: true }).click();
    await root.locator('[data-mf-lesson="arcs"]').click();
    await expect(root).toHaveAttribute('data-lesson', 'arcs');
    await page.keyboard.press('Escape');
    await expect(root.getByRole('button', { name: 'Lessons', exact: true })).toBeFocused();
    await root.getByRole('button', { name: 'Principle & notes', exact: true }).click();
    await root.locator('summary').click();
    await expect(root.locator('[data-mf-model-note]')).toBeVisible();
    await expect(root.locator('[data-mf-model-note]')).toContainText('drawn parabola');
    await assertFits();
    await page.screenshot({ path: testInfo.outputPath('motion-workspace-notes.png') });
    await page.keyboard.press('Escape');
    await root.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await expect(root.locator('[data-mf-amplitude-output]')).toHaveText('75%');
    await expect(root).toHaveAttribute('data-progress', '0.500000');
    await assertFits();
    await page.screenshot({ path: testInfo.outputPath('motion-workspace.png') });
    if (viewport.width === 768) {
      const pose = await expressive.getAttribute('transform');
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(root.locator('[data-mf-scene="plain"]')).toBeHidden();
      await root.getByRole('tab', { name: 'Plain', exact: true }).click();
      await expect(root.locator('[data-mf-scene="plain"]')).toBeVisible();
      await page.setViewportSize(viewport);
      await expect(root.locator('[data-mf-scene="plain"]')).toBeVisible();
      await expect(root.locator('[data-mf-scene="expressive"]')).toBeVisible();
      await expect(root.locator('[data-mf-scene="plain"]')).toHaveAttribute('aria-hidden', 'false');
      await expect(root.locator('.mf-scene-tabs')).toBeHidden();
      expect(await expressive.getAttribute('transform')).toBe(pose);
      await assertFits();
    }
  });
}
