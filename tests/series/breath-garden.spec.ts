import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ProjectContext, ProjectInstance } from '../../src/core/types';
import { advanceGarden, createGarden, LoudnessEnvelope, paperOpened, rootMeanSquare, unfoldStep } from '../../src/projects/breath-garden/engine';

declare global {
  interface Window {
    __breathMock: {
      requests: number;
      contexts: number;
      closed: number;
      stopped: number;
      amplitude: number;
      mode: 'allow' | 'deny' | 'pending';
      constraints?: MediaStreamConstraints;
      grantPending: () => void;
      endLatest: () => void;
    };
  }
}

async function mockMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockTrack extends EventTarget {
      kind = 'audio';
      readyState: MediaStreamTrackState = 'live';
      stop() {
        if (this.readyState === 'ended') return;
        this.readyState = 'ended';
        window.__breathMock.stopped += 1;
      }
    }
    let latest: MockTrack | undefined;
    const stream = () => {
      const track = new MockTrack();
      latest = track;
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    };
    let pending: ((value: ReturnType<typeof stream>) => void) | undefined;
    window.__breathMock = {
      requests: 0, contexts: 0, closed: 0, stopped: 0, amplitude: 0.003, mode: 'allow',
      grantPending() {
        if (!pending) throw new Error('No mocked permission request is pending.');
        pending(stream());
        pending = undefined;
      },
      endLatest() {
        if (!latest) throw new Error('No mocked track has been created.');
        latest.dispatchEvent(new Event('ended'));
      },
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          window.__breathMock.requests += 1;
          window.__breathMock.constraints = constraints;
          if (window.__breathMock.mode === 'deny') throw new DOMException('Mock denial', 'NotAllowedError');
          if (window.__breathMock.mode === 'pending') return new Promise<ReturnType<typeof stream>>((resolve) => { pending = resolve; });
          return stream();
        },
      },
    });
    class MockAudioContext extends EventTarget {
      state: AudioContextState = 'running';
      constructor() { super(); window.__breathMock.contexts += 1; }
      createAnalyser() {
        return {
          fftSize: 2048,
          getFloatTimeDomainData(samples: Float32Array) {
            for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin(i * Math.PI / 24) * window.__breathMock.amplitude;
          },
        };
      }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
      async close() {
        if (this.state !== 'closed') window.__breathMock.closed += 1;
        this.state = 'closed';
        this.dispatchEvent(new Event('statechange'));
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext });
  });
  await page.routeWebSocket('**', () => {});
}

test('local loudness is calibrated and bounded, and paper unfolding has stable limits', () => {
  expect(rootMeanSquare(new Float32Array([0.25, -0.25, 0.25, -0.25]))).toBe(0.25);
  expect(rootMeanSquare(new Float32Array(2048))).toBe(0);
  expect(() => rootMeanSquare(new Float32Array([NaN]))).toThrow(RangeError);
  const envelope = new LoudnessEnvelope();
  for (let frame = 0; frame < 80; frame += 1) expect(envelope.sample(0.008, 0.02)).toBe(0);
  expect(envelope.calibrating).toBe(false);
  expect(envelope.noiseFloor).toBeCloseTo(0.008);
  expect(envelope.sample(0.012, 0.05)).toBe(0);
  let loud = 0;
  for (let frame = 0; frame < 30; frame += 1) loud = envelope.sample(0.3, 0.05);
  expect(loud).toBeGreaterThan(0.99);
  expect(loud).toBeLessThanOrEqual(1);
  expect(envelope.sample(0, 0.05)).toBeGreaterThan(0.8);
  for (let frame = 0; frame < 120; frame += 1) loud = envelope.sample(0, 0.05);
  expect(loud).toBeLessThan(0.001);
  envelope.reset();
  expect(envelope.calibrating).toBe(true);

  const garden = createGarden();
  const before = paperOpened(garden);
  unfoldStep(garden, 0.7);
  expect(paperOpened(garden)).toBeGreaterThan(before);
  for (let frame = 0; frame < 2000; frame += 1) advanceGarden(garden, 1, 0.016, -1);
  expect(garden.opened.every((opened) => opened === 1)).toBe(true);
  expect(garden.wind).toBeLessThanOrEqual(1);
  expect(Math.abs(garden.wheel)).toBeLessThan(Math.PI * 2);
  expect(garden.phase).toBeLessThan(Math.PI * 2);
  expect(paperOpened(garden)).toBe(100);
});

test('microphone consent, denial, live input, cancellation, visibility, and disposal use mocked media only', async ({ page }) => {
  await mockMicrophone(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./projects/breath-garden/');
  const site = page.locator('.project-breath-garden');
  await expect(site.getByRole('heading', { name: 'Breath Garden', exact: true })).toBeVisible();
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  await site.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(site).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.__breathMock.requests)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('breath-garden-desktop.png'), fullPage: true });

  await page.evaluate(() => { window.__breathMock.mode = 'deny'; });
  await site.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'denied');
  await expect(site.locator('[data-mic-message]')).toContainText('Nothing is listening.');
  const initial = Number(await site.getAttribute('data-opened'));
  await site.getByRole('button', { name: 'Send a breeze', exact: true }).click();
  expect(Number(await site.getAttribute('data-opened'))).toBeGreaterThan(initial);
  expect(await page.evaluate(() => window.__breathMock.contexts)).toBe(0);

  await page.evaluate(() => { window.__breathMock.mode = 'allow'; });
  await site.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'live');
  await expect(site).toHaveAttribute('data-mic-calibrating', 'false');
  expect(await page.evaluate(() => window.__breathMock.constraints)).toEqual({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false,
  });
  const beforeSound = Number(await site.getAttribute('data-opened'));
  await page.evaluate(() => { window.__breathMock.amplitude = 0.3; });
  await expect.poll(async () => Number(await site.getAttribute('data-wind'))).toBeGreaterThan(20);
  await expect.poll(async () => Number(await site.getAttribute('data-opened'))).toBeGreaterThan(beforeSound);
  await expect(site).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() => { window.__breathMock.amplitude = 0.003; });
  await site.getByRole('button', { name: 'Recalibrate room level', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-calibrating', 'true');
  await expect(site).toHaveAttribute('data-mic-calibrating', 'false');
  expect(await page.evaluate(() => window.__breathMock.contexts)).toBe(1);
  await site.getByRole('button', { name: 'Disable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  expect(await page.evaluate(() => [window.__breathMock.stopped, window.__breathMock.closed])).toEqual([1, 1]);

  await site.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'live');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  expect(await page.evaluate(() => [window.__breathMock.stopped, window.__breathMock.closed])).toEqual([2, 2]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  expect(await page.evaluate(() => window.__breathMock.requests)).toBe(3);

  await site.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'live');
  await page.evaluate(() => window.__breathMock.endLatest());
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  expect(await page.evaluate(() => [window.__breathMock.stopped, window.__breathMock.closed])).toEqual([3, 3]);
  await page.evaluate(() => { window.__breathMock.mode = 'pending'; });
  await site.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'requesting');
  await site.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(site).toHaveAttribute('data-mic-state', 'off');
  await page.evaluate(() => window.__breathMock.grantPending());
  await expect.poll(() => page.evaluate(() => window.__breathMock.stopped)).toBe(4);
  expect(await page.evaluate(() => window.__breathMock.contexts)).toBe(3);

  const cleanup = await page.evaluate(async () => {
    window.__breathMock.mode = 'allow';
    const moduleUrl = new URL('../../src/projects/breath-garden/index.ts', location.href).href;
    const project = await import(moduleUrl) as { mount(context: ProjectContext): ProjectInstance };
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;inset:0;width:800px;height:600px;overflow:auto;z-index:1000';
    document.body.append(holder);
    const controller = new AbortController();
    let instance: ProjectInstance | undefined;
    try {
      const before = { requests: window.__breathMock.requests, stopped: window.__breathMock.stopped, closed: window.__breathMock.closed };
      instance = project.mount({ container: holder, controls: holder, signal: controller.signal, reducedMotion: true, report: () => {} });
      const root = holder.querySelector<HTMLElement>('.project-breath-garden')!;
      const button = root.querySelector<HTMLButtonElement>('[data-mic]')!;
      button.click();
      for (let frame = 0; frame < 120 && root.dataset.micState !== 'live'; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      if (root.dataset.micState !== 'live') throw new Error('Mock microphone did not start.');
      controller.abort();
      instance.destroy();
      button.click();
      return {
        remaining: holder.childElementCount,
        requests: window.__breathMock.requests - before.requests,
        stopped: window.__breathMock.stopped - before.stopped,
        closed: window.__breathMock.closed - before.closed,
      };
    } finally {
      instance?.destroy();
      holder.remove();
    }
  });
  expect(cleanup).toEqual({ remaining: 0, requests: 1, stopped: 1, closed: 1 });
  expect(errors).toEqual([]);
});

test('375px touch and Space unfold the paused garden without requesting a microphone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await mockMicrophone(page);
    await page.goto('./projects/breath-garden/');
    const site = page.locator('.project-breath-garden');
    const canvas = site.getByRole('application', { name: 'Paper garden: hold to send wind', exact: true });
    await expect(site).toHaveAttribute('data-paused', 'true');
    const box = (await canvas.boundingBox())!;
    expect(box.y).toBeLessThan(300);
    const original = Number(await site.getAttribute('data-opened'));
    const before = await canvas.screenshot();
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
    expect(Number(await site.getAttribute('data-opened'))).toBeGreaterThan(original);
    await expect(site).toHaveAttribute('data-holding', 'false');
    const after = await canvas.screenshot();
    expect(after.equals(before)).toBe(false);
    await page.waitForTimeout(120);
    expect((await canvas.screenshot()).equals(after)).toBe(true);
    await canvas.focus();
    await page.keyboard.down('Space');
    await expect(site).toHaveAttribute('data-holding', 'true');
    await page.keyboard.up('Space');
    await expect(site).toHaveAttribute('data-holding', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(site).toHaveAttribute('data-direction', '-1');
    await site.getByLabel('Breeze strength', { exact: true }).focus();
    await page.keyboard.press('End');
    await expect(site.locator('[data-strength-value]')).toHaveText('100%');
    const breeze = site.getByRole('button', { name: 'Send a breeze', exact: true });
    await breeze.focus();
    await page.keyboard.down('Space');
    await expect(site).toHaveAttribute('data-holding', 'true');
    await page.keyboard.press('Tab');
    await expect(site).toHaveAttribute('data-holding', 'false');
    await page.keyboard.up('Space');
    await site.getByRole('button', { name: 'Resume motion', exact: true }).click();
    await expect(site).toHaveAttribute('data-paused', 'false');
    await site.getByRole('button', { name: 'Pause motion', exact: true }).click();
    await site.getByRole('button', { name: 'Fold back', exact: true }).click();
    expect(Number(await site.getAttribute('data-opened'))).toBe(original);
    expect(await page.evaluate(() => window.__breathMock.requests)).toBe(0);
    expect(await page.evaluate(() => window.__breathMock.contexts)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const control of await site.locator('button, input').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('breath-garden-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
