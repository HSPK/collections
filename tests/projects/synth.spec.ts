import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { holdGainAtTime } from '../../src/core/audio';
import {
  clonePattern, MAX_JSON_LENGTH, parsePatternJSON, patternFilename, patternJSON,
  STARTERS, STORAGE_KEY, validatePattern,
} from '../../src/projects/synth/data';
import { MAX_ACTIVE_VOICES, MAX_MASTER_GAIN, SCHEDULE_AHEAD_SECONDS } from '../../src/projects/synth/engine';
import { TRACK_IDS } from '../../src/projects/synth/types';
import { VOICE_FACTORIES } from '../../src/projects/synth/voices';

interface SourceAudit {
  start: number;
  calledAt: number;
  stop: number;
  disconnected: boolean;
}

interface SynthAudit {
  contexts: AudioContext[];
  sources: SourceAudit[];
  nodes: { disconnected: boolean }[];
  lamps: { time: number; step: number }[];
  resumes: number;
  closes: number;
  holds: number;
  cancellations: number;
  peakSources: number;
}

declare global {
  interface Window {
    __pocketSynthAudit: SynthAudit;
    __releasePocketSynthResume?: () => void;
  }
}

const route = './projects/synth/';
const padName = (track: string, step: number) => `${track}, step ${step}, beat ${Math.ceil(step / 4)}`;

async function observeAudio(
  page: Page,
  options: { legacy?: boolean; delayFirstResume?: boolean; rejectFirstResume?: boolean } = {},
): Promise<void> {
  await page.addInitScript((settings) => {
    const audit: SynthAudit = {
      contexts: [], sources: [], nodes: [], lamps: [],
      resumes: 0, closes: 0, holds: 0, cancellations: 0, peakSources: 0,
    };
    window.__pocketSynthAudit = audit;
    const NativeContext = window.AudioContext;
    const cancel = AudioParam.prototype.cancelScheduledValues;
    AudioParam.prototype.cancelScheduledValues = function (time: number) {
      audit.cancellations++;
      return cancel.call(this, time);
    };
    const hold = AudioParam.prototype.cancelAndHoldAtTime;
    Object.defineProperty(AudioParam.prototype, 'cancelAndHoldAtTime', {
      configurable: true,
      value: settings.legacy ? undefined : function (this: AudioParam, time: number) {
        audit.holds++;
        return hold.call(this, time);
      },
    });

    function node<T extends AudioNode>(value: T): T {
      const record = { disconnected: false };
      audit.nodes.push(record);
      const disconnect = value.disconnect.bind(value);
      value.disconnect = (() => {
        record.disconnected = true;
        disconnect();
      }) as T['disconnect'];
      return value;
    }

    function source<T extends AudioScheduledSourceNode>(value: T): T {
      node(value);
      const record: SourceAudit = { start: -1, calledAt: -1, stop: -1, disconnected: false };
      audit.sources.push(record);
      const start = value.start.bind(value);
      const stop = value.stop.bind(value);
      const disconnect = value.disconnect.bind(value);
      value.start = (when = 0) => {
        record.start = when;
        record.calledAt = value.context.currentTime;
        audit.peakSources = Math.max(audit.peakSources, audit.sources.filter((item) => !item.disconnected).length);
        start(when);
      };
      value.stop = (when = 0) => { record.stop = when; stop(when); };
      value.disconnect = (() => { record.disconnected = true; disconnect(); }) as T['disconnect'];
      return value;
    }

    class ObservedContext extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        audit.contexts.push(this);
      }
      override createOscillator(): OscillatorNode { return source(super.createOscillator()); }
      override createBufferSource(): AudioBufferSourceNode { return source(super.createBufferSource()); }
      override createGain(): GainNode { return node(super.createGain()); }
      override createBiquadFilter(): BiquadFilterNode { return node(super.createBiquadFilter()); }
      override createDynamicsCompressor(): DynamicsCompressorNode { return node(super.createDynamicsCompressor()); }
      override resume(): Promise<void> {
        audit.resumes++;
        if (settings.rejectFirstResume && audit.resumes === 1) {
          return Promise.reject(new DOMException('Test sound permission denial', 'NotAllowedError'));
        }
        const resumed = super.resume();
        if (settings.delayFirstResume && audit.resumes === 1) {
          return new Promise<void>((resolve, reject) => {
            window.__releasePocketSynthResume = resolve;
            void resumed.catch(reject);
          });
        }
        return resumed;
      }
      override close(): Promise<void> {
        audit.closes++;
        sessionStorage.setItem('pocket-synth-test-exit', JSON.stringify({
          closes: audit.closes,
          liveSources: audit.sources.filter((item) => !item.disconnected).length,
          liveNodes: audit.nodes.filter((item) => !item.disconnected).length,
        }));
        return super.close();
      }
    }
    window.AudioContext = ObservedContext;
    const observer = new MutationObserver((changes) => {
      const context = audit.contexts.at(-1);
      if (!context) return;
      for (const change of changes) {
        const target = change.target as HTMLElement;
        if (target.matches('.project-synth th[data-column][data-current="true"]') && audit.lamps.length < 200) {
          audit.lamps.push({ time: context.currentTime, step: Number(target.dataset.column) });
        }
      }
    });
    observer.observe(document, { attributes: true, subtree: true, attributeFilter: ['data-current'] });
  }, options);
}

async function expectSilentAndClosed(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Stop pattern', exact: true })).toBeDisabled();
  await expect(page.locator('.project-synth [data-current="true"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.__pocketSynthAudit.contexts.every((context) => context.state === 'closed'))).toBe(true);
  expect(await page.evaluate(() => window.__pocketSynthAudit.sources.every((source) => source.disconnected))).toBe(true);
  expect(await page.evaluate(() => window.__pocketSynthAudit.nodes.every((node) => node.disconnected))).toBe(true);
}

test('Pocket Synth starters are original isolated, schema-valid five-voice patterns', () => {
  expect(STARTERS.length).toBeGreaterThanOrEqual(4);
  expect(new Set(STARTERS.map((starter) => starter.id)).size).toBe(STARTERS.length);
  expect(new Set(STARTERS.map((starter) => JSON.stringify(starter.pattern.tracks))).size).toBe(STARTERS.length);
  expect(Object.keys(VOICE_FACTORIES)).toEqual([...TRACK_IDS]);
  expect(MAX_MASTER_GAIN).toBeLessThanOrEqual(0.35);
  for (const starter of STARTERS) {
    expect(validatePattern(starter.pattern)).toEqual({ ok: true, pattern: starter.pattern });
    expect(parsePatternJSON(patternJSON(starter.pattern))).toEqual({ ok: true, pattern: starter.pattern });
    const copy = clonePattern(starter.pattern);
    copy.tracks[0].steps[0] = !copy.tracks[0].steps[0];
    expect(copy.tracks[0].steps[0]).not.toBe(starter.pattern.tracks[0].steps[0]);
  }
});

test('Pocket Synth rejects malformed, oversized, out-of-range, and prototype-shaped JSON', () => {
  const valid = clonePattern(STARTERS[0].pattern);
  const invalid: unknown[] = [
    null, [], true, 'pattern', 1,
    { ...valid, version: '1' }, { ...valid, version: 2 }, { ...valid, format: 'other' },
    { ...valid, extra: true }, { ...valid, name: '' }, { ...valid, name: ' '.repeat(5) },
    { ...valid, name: ' leading' }, { ...valid, name: 'x'.repeat(49) }, { ...valid, name: 'bad\nname' },
    { ...valid, name: 'bad\u202ename' }, { ...valid, tempo: '112' }, { ...valid, tempo: 49 },
    { ...valid, tempo: 181 }, { ...valid, tempo: 100.5 }, { ...valid, tempo: NaN },
    { ...valid, tempo: Infinity }, { ...valid, bassNote: 35 }, { ...valid, bassNote: 60 },
    { ...valid, bassNote: 36.5 }, { ...valid, volume: -1 }, { ...valid, volume: 101 },
    { ...valid, volume: 50.5 }, { ...valid, tracks: valid.tracks.slice(0, 4) },
    { ...valid, tracks: [...valid.tracks.slice(0, 4), valid.tracks[0]] },
    { ...valid, tracks: [{ ...valid.tracks[0], id: 'other' }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], muted: 'false' }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], steps: Array(16) }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], steps: Array(16).fill(1) }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], steps: Array(15).fill(false) }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], steps: Array(17).fill(false) }, ...valid.tracks.slice(1)] },
    { ...valid, tracks: [{ ...valid.tracks[0], unexpected: 1 }, ...valid.tracks.slice(1)] },
    JSON.parse(`${JSON.stringify(valid).slice(0, -1)},"__proto__":{"polluted":true}}`),
  ];
  for (const value of invalid) expect(validatePattern(value).ok, JSON.stringify(value)).toBe(false);
  const missing = { ...valid } as Partial<typeof valid>;
  delete missing.volume;
  expect(validatePattern(missing).ok).toBe(false);
  expect(parsePatternJSON('{bad}').ok).toBe(false);
  expect(parsePatternJSON(' '.repeat(MAX_JSON_LENGTH + 1)).ok).toBe(false);
  expect(patternFilename(' My / <loop>?! ')).toBe('my-loop.pocket-synth.json');
  expect(patternFilename('☀')).toBe('pattern.pocket-synth.json');
  const reordered = { ...valid, tracks: [...valid.tracks].reverse(), name: '<b>A safe text name</b>' };
  const checked = validatePattern(reordered);
  expect(checked.ok).toBe(true);
  if (checked.ok) expect(checked.pattern.tracks.map((track) => track.id)).toEqual([...TRACK_IDS]);
});

test('Pocket Synth uses compatible modern and legacy gain holding', () => {
  const calls: unknown[][] = [];
  const legacy = {
    value: 0.2,
    cancelScheduledValues: (time: number) => { calls.push(['cancel', time]); },
    setValueAtTime: (value: number, time: number) => { calls.push(['set', value, time]); },
  } as unknown as AudioParam;
  holdGainAtTime(legacy, 12);
  expect(calls).toEqual([['cancel', 12], ['set', 0.2, 12]]);
  calls.length = 0;
  const modern = {
    ...legacy,
    cancelAndHoldAtTime: (time: number) => { calls.push(['hold', time]); },
  } as unknown as AudioParam;
  holdGainAtTime(modern, 9);
  expect(calls).toEqual([['hold', 9]]);
});

test('Pocket Synth edits and switches patterns without ever requesting audio', async ({ page }) => {
  await observeAudio(page);
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'Pocket Synth', exact: true })).toBeVisible();
  await expect(page.locator('.synth-pad')).toHaveCount(80);
  const pad = page.getByRole('button', { name: padName('Kick', 2), exact: true });
  await expect(pad).toHaveAttribute('aria-pressed', 'false');
  await pad.click();
  await expect(pad).toHaveAttribute('aria-pressed', 'true');
  await pad.press('Space');
  await expect(pad).toHaveAttribute('aria-pressed', 'false');
  await pad.press('ArrowDown');
  await expect(page.getByRole('button', { name: padName('Snare', 2), exact: true })).toBeFocused();
  await page.getByLabel('Pattern name', { exact: true }).fill('Space is just text');
  await page.getByLabel('Pattern name', { exact: true }).press('Space');
  await page.locator('#synth-starter').selectOption('soft-circuitry');
  await expect(page.getByLabel('TEMPO / BPM', { exact: true })).toHaveValue('76');
  await expect(page.locator('[data-pattern-name]')).toHaveText('Soft circuitry');
  await page.getByRole('button', { name: 'Mute Hat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mute Hat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__pocketSynthAudit.contexts.length)).toBe(0);
  await expect(page.locator('[data-current="true"]')).toHaveCount(0);
});

test('Pocket Synth saves, loads, exports actual JSON, and safely imports files and text', async ({ page }) => {
  await observeAudio(page);
  await page.goto(route);
  await page.getByLabel('Pattern name', { exact: true }).fill('Late desk');
  await page.getByRole('button', { name: padName('Kick', 2), exact: true }).click();
  await page.getByLabel('TEMPO / BPM', { exact: true }).fill('137');
  await page.getByLabel('TEMPO / BPM', { exact: true }).press('Tab');
  await page.locator('#synth-root').selectOption('45');
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await page.locator('#synth-starter').selectOption('night-bus');
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('[data-pattern-name]')).toHaveText('Late desk');
  await expect(page.locator('#synth-tempo')).toHaveValue('137');
  await expect(page.locator('#synth-root')).toHaveValue('45');
  await expect(page.getByRole('button', { name: padName('Kick', 2), exact: true })).toHaveAttribute('aria-pressed', 'true');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .json', exact: false }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('late-desk.pocket-synth.json');
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = parsePatternJSON(Buffer.concat(chunks).toString('utf8'));
  expect(exported.ok).toBe(true);
  if (exported.ok) {
    expect(exported.pattern.name).toBe('Late desk');
    expect(exported.pattern.tempo).toBe(137);
    expect(exported.pattern.tracks[0].steps[1]).toBe(true);
  }
  await page.locator('.synth-import summary').click();
  await page.getByRole('button', { name: 'Show current JSON', exact: true }).click();
  const imported = clonePattern(STARTERS[1].pattern);
  imported.name = '<b>Little loop</b>';
  await page.getByLabel('Pattern JSON', { exact: true }).fill(patternJSON(imported));
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(page.locator('[data-pattern-name]')).toHaveText('<b>Little loop</b>');
  await expect(page.locator('[data-pattern-name] b')).toHaveCount(0);
  await page.getByLabel('Pattern JSON', { exact: true }).fill(JSON.stringify({ ...imported, version: 2 }));
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Nothing changed');
  await expect(page.locator('[data-pattern-name]')).toHaveText('<b>Little loop</b>');
  await page.getByLabel('Open a Pocket Synth JSON file', { exact: true }).setInputFiles({
    name: 'night-bus.json', mimeType: 'application/json', buffer: Buffer.from(patternJSON(STARTERS[3].pattern)),
  });
  await expect(page.locator('[data-pattern-name]')).toHaveText('Night bus');
  await page.getByLabel('Open a Pocket Synth JSON file', { exact: true }).setInputFiles({
    name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(MAX_JSON_LENGTH + 1, 32),
  });
  await expect(page.locator('[data-notice]')).toContainText('too large');
  await expect(page.locator('[data-pattern-name]')).toHaveText('Night bus');
  await page.evaluate((key) => localStorage.setItem(key, '{"format":"broken"}'), STORAGE_KEY);
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Workspace unchanged');
  await expect(page.locator('[data-pattern-name]')).toHaveText('Night bus');
  expect(await page.evaluate(() => window.__pocketSynthAudit.contexts.length)).toBe(0);
});

for (const legacy of [false, true]) {
  test(`Pocket Synth schedules audible-time lamps and retires every node (${legacy ? 'legacy' : 'modern'} AudioParam)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeAudio(page, { legacy });
    await page.goto(route);
    await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
    await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'playing');
    await expect.poll(() => page.evaluate(() => window.__pocketSynthAudit.lamps.length)).toBeGreaterThan(2);
    const timing = await page.evaluate(() => ({
      sources: window.__pocketSynthAudit.sources.map(({ start, calledAt }) => ({ start, calledAt })),
      firstLamp: window.__pocketSynthAudit.lamps[0],
      retiredWhilePlaying: window.__pocketSynthAudit.sources.some((source) => source.disconnected),
    }));
    const firstLampTime = timing.sources[0].start + timing.firstLamp.step * (60 / STARTERS[0].pattern.tempo / 4);
    expect(timing.firstLamp.time).toBeGreaterThanOrEqual(firstLampTime);
    for (const source of timing.sources) {
      expect(source.start).toBeGreaterThanOrEqual(source.calledAt - 0.004);
      expect(source.start - source.calledAt).toBeLessThanOrEqual(SCHEDULE_AHEAD_SECONDS + 0.01);
    }
    expect(timing.retiredWhilePlaying).toBe(true);
    await page.getByLabel('MASTER VOLUME', { exact: false }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => {
      const audit = window.__pocketSynthAudit;
      const context = audit.contexts.at(-1)!;
      if (!audit.sources.some((source) => !source.disconnected && source.start > context.currentTime)) return false;
      document.querySelector<HTMLButtonElement>('.synth-stop')!.click();
      return true;
    })).toBe(true);
    await expectSilentAndClosed(page);
    expect(await page.evaluate((old) => old ? window.__pocketSynthAudit.cancellations : window.__pocketSynthAudit.holds, legacy)).toBeGreaterThan(0);
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
      await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'playing');
      await page.getByRole('button', { name: 'Stop pattern', exact: true }).click();
      await expectSilentAndClosed(page);
    }
    const audit = await page.evaluate(() => ({
      peak: window.__pocketSynthAudit.peakSources,
      canceledFuture: window.__pocketSynthAudit.sources.some((source) => source.stop <= source.start),
      count: window.__pocketSynthAudit.contexts.length,
    }));
    expect(audit.peak).toBeLessThanOrEqual(MAX_ACTIVE_VOICES * 2);
    expect(audit.canceledFuture).toBe(true);
    expect(audit.count).toBe(3);
    expect(errors).toEqual([]);
  });
}

test('Pocket Synth cannot resurrect an old run when a canceled resume settles late', async ({ page }) => {
  await observeAudio(page, { delayFirstResume: true });
  await page.goto(route);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'starting');
  await expect(page.getByRole('button', { name: 'Stop pattern', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop pattern', exact: true }).click();
  await expectSilentAndClosed(page);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'playing');
  await page.evaluate(() => window.__releasePocketSynthResume?.());
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'playing');
  expect(await page.evaluate(() => window.__pocketSynthAudit.contexts.map((context) => context.state))).toEqual(['closed', 'running']);
  await page.getByRole('button', { name: 'Stop pattern', exact: true }).click();
  await expectSilentAndClosed(page);
});

test('Pocket Synth cancels hidden startup and never automatically resumes on return', async ({ page }) => {
  await observeAudio(page, { delayFirstResume: true });
  await page.goto(route);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'starting');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectSilentAndClosed(page);
  await page.evaluate(() => {
    window.__releasePocketSynthResume?.();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'stopped');
  expect(await page.evaluate(() => window.__pocketSynthAudit.sources.length)).toBe(0);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'playing');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => page.evaluate(() =>
    window.__pocketSynthAudit.contexts.every((context) => context.state === 'closed'))).toBe(true);
  expect(await page.evaluate(() => window.__pocketSynthAudit.sources.every((source) => source.disconnected))).toBe(true);
  expect(await page.evaluate(() => window.__pocketSynthAudit.nodes.every((node) => node.disconnected))).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expectSilentAndClosed(page);
  await expect(page.locator('.synth-machine')).toHaveAttribute('data-transport', 'stopped');
  expect(await page.evaluate(() => window.__pocketSynthAudit.contexts.length)).toBe(2);
});

test('Pocket Synth releases its audio graph on navigation', async ({ page }) => {
  await observeAudio(page);
  await page.goto(route);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__pocketSynthAudit.sources.length)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Back to index', exact: true }).click();
  await expect(page.locator('.project-synth')).toHaveCount(0);
  const exit = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pocket-synth-test-exit') ?? 'null') as { closes: number; liveSources: number; liveNodes: number } | null);
  expect(exit).not.toBeNull();
  expect(exit!.closes).toBeGreaterThan(0);
  expect(exit!.liveSources).toBe(0);
  expect(exit!.liveNodes).toBe(0);
});

test('Pocket Synth keeps controls usable after denied audio and unavailable storage', async ({ page }) => {
  await observeAudio(page, { rejectFirstResume: true });
  await page.goto(route);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('could not start');
  await expectSilentAndClosed(page);
  await page.getByRole('button', { name: padName('Kick', 2), exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Test storage denial', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('could not save');
  await expect(page.getByRole('button', { name: 'Export .json', exact: false })).toBeEnabled();
  await expect(page.getByRole('button', { name: padName('Kick', 2), exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Pocket Synth has an honest unsupported-audio state without disabling its editor', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.goto(route);
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Web Audio is unavailable');
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear pads', exact: false }).click();
  await expect(page.locator('.synth-pad[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-silence]')).toBeVisible();
});

test('Pocket Synth contains its 44px pads on a 375px screen and scrolls keyboard focus into view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const panel = page.getByRole('region', { name: 'Scrollable step sequencer', exact: true });
  expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const first = page.getByRole('button', { name: padName('Kick', 1), exact: true });
  const firstBounds = (await first.boundingBox())!;
  expect(firstBounds.width).toBeGreaterThanOrEqual(44);
  expect(firstBounds.height).toBeGreaterThanOrEqual(44);
  await first.focus();
  await first.press('End');
  const last = page.getByRole('button', { name: padName('Kick', 16), exact: true });
  await expect(last).toBeFocused();
  expect(await panel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const lastBounds = (await last.boundingBox())!;
  const panelBounds = (await panel.boundingBox())!;
  expect(lastBounds.x).toBeGreaterThanOrEqual(panelBounds.x + 138);
  expect(lastBounds.x + lastBounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width + 1);
  await last.press('Control+End');
  await expect(page.getByRole('button', { name: padName('Chime', 16), exact: true })).toBeFocused();
  await page.keyboard.press('Control+Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.locator('.synth-pad:focus').count()).toBe(0);
  await page.locator('.synth-import summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
