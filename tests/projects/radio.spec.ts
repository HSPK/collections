import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface RadioProbe {
  states: AudioContextState[];
  starts: number;
  activeSources: number;
  activeNoise: number;
  activeTones: number[];
  peakSources: number;
  cancellations: number;
  resumes: number;
  schedulers: number;
  masterValues: number[];
}

declare global {
  interface Window {
    __radioProbe: RadioProbe;
    __radioContexts: AudioContext[];
    __radioResumeGate: (() => void)[];
  }
}

async function probeAudio(
  page: Page,
  options: { legacy?: boolean; unavailable?: boolean; blockResume?: boolean; gateResume?: boolean } = {},
): Promise<void> {
  await page.addInitScript((settings) => {
    const contexts: AudioContext[] = [];
    window.__radioContexts = contexts;
    const masters = new Map<AudioContext, GainNode>();
    const records: { started: boolean; ended: boolean; disconnected: boolean; noise: boolean; frequency?: number }[] = [];
    const schedulers = new Set<number>();
    let starts = 0;
    let peakSources = 0;
    let cancellations = 0;
    let resumes = 0;
    window.__radioResumeGate = [];
    const active = () => records.filter((record) => record.started && !record.ended && !record.disconnected);
    Object.defineProperty(window, '__radioProbe', {
      get: () => ({
        states: contexts.map((context) => context.state),
        starts,
        activeSources: active().length,
        activeNoise: active().filter((record) => record.noise).length,
        activeTones: active().flatMap((record) => record.frequency === undefined ? [] : [record.frequency]),
        peakSources,
        cancellations,
        resumes,
        schedulers: schedulers.size,
        masterValues: [...masters.values()].map((master) => master.gain.value),
      }),
    });

    const nativeInterval = window.setInterval;
    const nativeClearInterval = window.clearInterval;
    Object.defineProperty(window, 'setInterval', {
      configurable: true,
      value(handler: TimerHandler, timeout?: number, ...args: unknown[]) {
        const id = Reflect.apply(nativeInterval, window, [handler, timeout, ...args]) as number;
        // Ignore development-server heartbeat timers; the receiver's scheduler is 180 ms.
        if (timeout === 180) schedulers.add(id);
        return id;
      },
    });
    Object.defineProperty(window, 'clearInterval', {
      configurable: true,
      value(id?: number) {
        if (id !== undefined) schedulers.delete(id);
        return Reflect.apply(nativeClearInterval, window, [id]);
      },
    });

    if (settings.unavailable) {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
      return;
    }
    if (settings.legacy) {
      Object.defineProperty(AudioParam.prototype, 'cancelAndHoldAtTime', { configurable: true, value: undefined });
    }
    const nativeCancel = AudioParam.prototype.cancelScheduledValues;
    AudioParam.prototype.cancelScheduledValues = function (time: number) {
      cancellations++;
      return nativeCancel.call(this, time);
    };

    function track<T extends OscillatorNode | AudioBufferSourceNode>(source: T): T {
      const record = {
        started: false,
        ended: false,
        disconnected: false,
        noise: source instanceof AudioBufferSourceNode,
        frequency: undefined as number | undefined,
      };
      records.push(record);
      const nativeStart = source.start;
      const nativeDisconnect = source.disconnect;
      Object.defineProperty(source, 'start', {
        value(...args: unknown[]) {
          const result = Reflect.apply(nativeStart, source, args);
          record.started = true;
          if (source instanceof OscillatorNode) record.frequency = source.frequency.value;
          starts++;
          peakSources = Math.max(peakSources, active().length);
          return result;
        },
      });
      Object.defineProperty(source, 'disconnect', {
        value(...args: unknown[]) {
          const result = Reflect.apply(nativeDisconnect, source, args);
          record.disconnected = true;
          return result;
        },
      });
      source.addEventListener('ended', () => { record.ended = true; }, { once: true });
      return source;
    }

    const NativeAudioContext = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class extends NativeAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          contexts.push(this);
        }
        createGain() {
          const gain = super.createGain();
          if (!masters.has(this)) masters.set(this, gain);
          return gain;
        }
        createOscillator() { return track(super.createOscillator()); }
        createBufferSource() { return track(super.createBufferSource()); }
        resume() {
          resumes++;
          if (settings.blockResume) return Promise.reject(new DOMException('The audio output was blocked for this test.', 'NotAllowedError'));
          const resumed = super.resume();
          return settings.gateResume
            ? resumed.then(() => new Promise<void>((resolve) => window.__radioResumeGate.push(resolve)))
            : resumed;
        }
        close() {
          sessionStorage.setItem('radio-test-closes', String(Number(sessionStorage.getItem('radio-test-closes') || '0') + 1));
          return super.close();
        }
      },
    });
  }, options);
}

async function openRadio(page: Page, hash = ''): Promise<void> {
  await page.goto(`./projects/radio/${hash}`);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Radio 404', exact: true })).toBeVisible();
}

test('Radio 404 opens substantial station notebooks and history without creating audio', async ({ page }) => {
  await probeAudio(page);
  await openRadio(page);
  await expect(page.getByRole('navigation', { name: 'Radio 404 navigation' })).toBeVisible();
  await expect(page.getByText('Generated on your device, not a live broadcast.', { exact: false })).toBeVisible();
  await expect(page.locator('[data-radio-station]')).toHaveCount(4);
  const expected = [
    { id: 'laundromat', name: 'Midnight Laundromat', title: 'Leave a little room in the drum.', program: 'The pocket inventory', note: 'A small repair' },
    { id: 'library', name: 'Underwater Library', title: 'Please return the tide table.', program: 'Coastline corrections', note: 'Humidity ledger' },
    { id: 'orbit', name: 'Low Orbit Shipping', title: 'Nothing urgent in the next container.', program: 'The long manifest', note: 'The empty case' },
    { id: 'orchard', name: 'Salt Orchard', title: 'A windbreak made of patient trees.', program: 'Brushwork', note: 'Bell making' },
  ];
  for (const station of expected) {
    await page.locator(`[data-radio-station="${station.id}"]`).click();
    await expect(page.locator('[data-radio-name]')).toHaveText(station.name);
    await expect(page.locator(`[data-radio-station="${station.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-radio-station][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: station.title, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: station.program, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: station.note, exact: true })).toBeVisible();
    await expect(page.locator('.radio-story-prose p')).toHaveCount(3);
    expect(await page.locator('.radio-story-prose').evaluate((element) => (element.textContent || '').split(/\s+/).length)).toBeGreaterThan(190);
    await expect(page.locator('.radio-recipe li')).toHaveCount(4);
    await expect(page.locator('.radio-programs li')).toHaveCount(3);
    await expect(page.locator('.radio-field-notes li')).toHaveCount(3);
    await expect(page.locator('.radio-section-intro')).toContainText('not a live program listing');
    expect((await page.evaluate(() => window.__radioProbe)).states).toEqual([]);
  }
  await page.goBack();
  await expect(page.locator('[data-radio-name]')).toHaveText('Low Orbit Shipping');
  await page.goForward();
  await expect(page.locator('[data-radio-name]')).toHaveText('Salt Orchard');
  await page.getByRole('button', { name: 'Next station', exact: true }).click();
  await expect(page.locator('[data-radio-name]')).toHaveText('Midnight Laundromat');
  await page.getByRole('button', { name: 'Previous station', exact: true }).click();
  await expect(page.locator('[data-radio-name]')).toHaveText('Salt Orchard');
  expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(0);
  await openRadio(page, '#station-library');
  await expect(page.locator('[data-radio-name]')).toHaveText('Underwater Library');
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual([]);
});

for (const legacy of [false, true]) {
  test(`Radio 404 explicitly listens, retunes, mutes, and releases bounded voices${legacy ? ' with legacy gain automation' : ''}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await probeAudio(page, { legacy });
    await openRadio(page);
    expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(0);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
    await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeSources)).toBeGreaterThan(0);
    expect((await page.evaluate(() => window.__radioProbe)).states).toEqual(['running']);

    const volume = page.getByRole('slider', { name: 'Volume', exact: true });
    await volume.focus();
    await page.keyboard.press('Home');
    await expect(volume).toHaveValue('0');
    await expect(page.locator('[data-radio-volume-output]')).toHaveText('Muted');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.masterValues[0])).toBeLessThan(0.002);
    await page.keyboard.press('End');
    await expect(volume).toHaveValue('100');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.masterValues[0])).toBeGreaterThan(0.24);
    expect((await page.evaluate(() => window.__radioProbe)).masterValues[0]).toBeLessThanOrEqual(0.28001);

    await page.locator('[data-radio-station="orbit"]').click();
    await expect(page.locator('[data-radio-status]')).toContainText('Low Orbit Shipping');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeNoise)).toBe(0);
    expect((await page.evaluate(() => window.__radioProbe)).activeTones).toContain(86);
    await page.locator('[data-radio-station="library"]').click();
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeTones.some((frequency) => Math.abs(frequency - 174.6) < 0.01))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeNoise)).toBeGreaterThan(0);
    await page.locator('[data-radio-station="orchard"]').click();
    await expect(page.locator('[data-radio-status]')).toContainText('Salt Orchard');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeNoise)).toBeGreaterThan(0);

    for (let index = 0; index < 12; index++) await page.getByRole('button', { name: 'Next station', exact: true }).click();
    const retuned = await page.evaluate(() => window.__radioProbe);
    expect(retuned.states).toEqual(['running']);
    expect(retuned.schedulers).toBe(1);
    expect(retuned.peakSources).toBeLessThanOrEqual(48);
    if (legacy) expect(retuned.cancellations).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeSources)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__radioProbe.states)).toEqual(['suspended']);
    expect((await page.evaluate(() => window.__radioProbe)).schedulers).toBe(0);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
    expect((await page.evaluate(() => window.__radioProbe)).states).toEqual(['running']);
    await page.goBack();
    await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
    await expect.poll(() => page.evaluate(() => window.__radioProbe.activeSources)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('Radio 404 stops on hiding, closes on exit, and never resumes itself after returning', async ({ page }) => {
  await probeAudio(page);
  await openRadio(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  await expect.poll(() => page.evaluate(() => window.__radioProbe.activeSources)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__radioProbe.states)).toEqual(['suspended']);
  const stopped = await page.evaluate(() => window.__radioProbe);
  expect(stopped.schedulers).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Next station', exact: true }).click();
  expect((await page.evaluate(() => window.__radioProbe)).resumes).toBe(stopped.resumes);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => page.evaluate(() => window.__radioProbe.states)).toEqual(['closed']);
  expect((await page.evaluate(() => window.__radioProbe)).activeSources).toBe(0);
  expect((await page.evaluate(() => window.__radioProbe)).schedulers).toBe(0);
  const exitedStarts = (await page.evaluate(() => window.__radioProbe)).starts;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(exitedStarts);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual(['closed', 'running']);
  await page.getByRole('link', { name: 'Back to index', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover projects', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Number(sessionStorage.getItem('radio-test-closes')))).toBeGreaterThanOrEqual(2);
});

test('Radio 404 keeps its notebook usable when Web Audio is unavailable', async ({ page }) => {
  await probeAudio(page, { unavailable: true });
  await openRadio(page);
  await expect(page.locator('[data-radio-error]')).toContainText('Web Audio is unavailable');
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeDisabled();
  await page.locator('[data-radio-station="orchard"]').click();
  await expect(page.getByRole('heading', { name: 'A windbreak made of patient trees.', exact: true })).toBeVisible();
  await expect(page.locator('.radio-programs li')).toHaveCount(3);
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual([]);
});

test('Radio 404 reports a blocked audio start instead of claiming to play', async ({ page }) => {
  await probeAudio(page, { blockResume: true });
  await openRadio(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('[data-radio-error]')).toContainText('The audio output was blocked for this test.');
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'error');
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeEnabled();
  await page.locator('[data-radio-station="library"]').click();
  await expect(page.getByRole('heading', { name: 'Please return the tide table.', exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(0);
  expect((await page.evaluate(() => window.__radioProbe)).schedulers).toBe(0);
});

test('Radio 404 watches interruptions after replacing a closed audio device', async ({ page }) => {
  await probeAudio(page);
  await openRadio(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  await page.evaluate(() => window.__radioContexts[0].close());
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  await expect.poll(() => page.evaluate(() => window.__radioProbe.activeSources)).toBe(0);

  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual(['closed', 'running']);
  await page.evaluate(() => window.__radioContexts[1].suspend());
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  await expect(page.locator('[data-radio-status]')).toContainText('Audio was interrupted');
  expect((await page.evaluate(() => window.__radioProbe)).activeSources).toBe(0);
  expect((await page.evaluate(() => window.__radioProbe)).schedulers).toBe(0);
  await page.locator('[data-radio-station="library"]').click();
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual(['closed', 'suspended']);
});

test('Radio 404 cancels delayed resumes after Stop and close without releasing late sound', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await probeAudio(page, { gateResume: true, legacy: true });
  await openRadio(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__radioResumeGate.length)).toBe(1);
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'starting');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate(async () => {
    for (const release of window.__radioResumeGate.splice(0)) release();
    await Promise.resolve();
    await Promise.resolve();
  });
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(0);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__radioResumeGate.length)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await expect.poll(() => page.evaluate(() => window.__radioProbe.states)).toEqual(['closed']);
  await page.evaluate(async () => {
    for (const release of window.__radioResumeGate.splice(0)) release();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect((await page.evaluate(() => window.__radioProbe)).starts).toBe(0);
  expect((await page.evaluate(() => window.__radioProbe)).schedulers).toBe(0);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__radioResumeGate.length)).toBe(1);
  await page.locator('[data-radio-station="orbit"]').click();
  await page.evaluate(() => { for (const release of window.__radioResumeGate.splice(0)) release(); });
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  await expect(page.locator('[data-radio-status]')).toContainText('Low Orbit Shipping');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  expect((await page.evaluate(() => window.__radioProbe)).activeSources).toBe(0);
  expect(errors).toEqual([]);
});

test('Radio 404 fits 375px and its sliders and audio controls work from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await probeAudio(page);
  await openRadio(page, '#station-library');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const listenBounds = await page.getByRole('button', { name: 'Listen', exact: true }).boundingBox();
  expect(listenBounds).not.toBeNull();
  expect(listenBounds!.y + listenBounds!.height).toBeLessThanOrEqual(812);
  const tuning = page.locator('[data-radio-tuning]');
  await tuning.focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-radio-name]')).toHaveText('Salt Orchard');
  await expect(tuning).toHaveAttribute('aria-valuetext', /Salt Orchard/);
  await page.keyboard.press('Home');
  await expect(page.locator('[data-radio-name]')).toHaveText('Midnight Laundromat');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-radio-name]')).toHaveText('Underwater Library');
  expect(await tuning.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  expect(await page.locator('[data-radio-needle]').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect((await page.evaluate(() => window.__radioProbe)).states).toEqual([]);
  await page.getByRole('button', { name: 'Listen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.project-radio')).toHaveAttribute('data-radio-mode', 'off');
  expect((await page.evaluate(() => window.__radioProbe)).activeSources).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
