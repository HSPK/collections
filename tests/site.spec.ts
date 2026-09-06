import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readProjectManifests } from '../scripts/project-pages';
import { openCollectionMenu, returnToCollection } from './helpers/navigation';

declare global {
  interface Window {
    __oddAudioStates: AudioContextState[];
    __oddToneCount: number;
    __oddAudioCancellations: number;
  }
}

const ids = ['orbital', 'flow', 'soft', 'terrain', 'chroma', 'echo', 'gravity', 'type', 'fold', 'ribbon'];
const manifests = readProjectManifests(process.cwd());
const artCount = manifests.filter((project) => project.category === 'art').length;
const playCount = manifests.filter((project) => project.category === 'play').length;

test('The content-first library filters and remembers its state across websites', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.main-nav > button, .main-nav > a')).toHaveText(['About', 'Source', 'Contribute']);
  await expect(page.locator('.project-card')).toHaveCount(manifests.length);
  await page.locator('[data-filter="play"]').click();
  await expect(page.locator('.project-card')).toHaveCount(playCount);
  await page.locator('[data-filter="art"]').click();
  await expect(page.locator('.project-card')).toHaveCount(artCount);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('[data-project-grid]')).toHaveClass(/project-grid--list/);
  await page.locator('[data-project="flow"]').click();
  await expect(page).toHaveURL(/\/projects\/flow\/$/);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await returnToCollection(page);
  await expect(page.locator('.project-card')).toHaveCount(artCount);
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
});

test('Search, about, invalid routes, and keyboard entry work', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'A collection, not a template.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog', { name: 'Find a project', exact: true });
  await search.getByRole('searchbox').fill('not-a-real-experiment');
  await expect(page.locator('.search-empty')).toBeVisible();
  await search.getByRole('searchbox').fill('Type Playground');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/type\/$/);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await page.goto('./#/experiment/missing');
  await expect(page.getByRole('heading', { name: 'A little too far.' })).toBeVisible();
  await page.getByRole('link', { name: /Find your way back/ }).click();
  await expect(page.locator('.project-card')).toHaveCount(manifests.length);
});

for (const id of ids) {
  test(`${id}: renders, responds to controls, pauses, and tears down cleanly`, async ({ page }, testInfo) => {
    // Software WebGL can spend nearly a second on each real pointer step in CI.
    if (['orbital', 'soft', 'terrain', 'chroma', 'fold'].includes(id)) test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const stage = page.locator('[data-art-stage]');
    await expect(stage.locator('canvas')).toBeVisible();
    await expect(page.locator('[data-controls] button, [data-controls] input, [data-controls] select').first()).toBeVisible();
    const bounds = (await stage.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.64, bounds.y + bounds.height * 0.6, { steps: 9 });
    await page.mouse.up();
    const ranges = page.locator('[data-controls] input[type="range"]');
    for (const range of await ranges.all()) {
      await range.focus();
      await page.keyboard.press('ArrowRight');
    }
    const selects = page.locator('[data-controls] select');
    for (const select of await selects.all()) {
      const options = await select.locator('option').evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
      if (options.length > 1) await select.selectOption(options[1]);
    }
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
    const canvas = stage.locator('canvas');
    const isCanvas2D = await canvas.evaluate((element: HTMLCanvasElement) => Boolean(element.getContext('2d')));
    const captureArtwork = async () => {
      if (!isCanvas2D) return stage.screenshot();
      // An unchanged canvas can acquire one-level color dithering in compositor screenshots.
      const bitmap = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL('image/png'));
      return Buffer.from(bitmap.slice(bitmap.indexOf(',') + 1), 'base64');
    };
    await page.waitForTimeout(150);
    const paused = await captureArtwork();
    await page.waitForTimeout(120);
    const later = await captureArtwork();
    const unchanged = later.equals(paused);
    if (!unchanged) {
      await testInfo.attach('paused-first-frame', { body: paused, contentType: 'image/png' });
      await testInfo.attach('paused-later-frame', { body: later, contentType: 'image/png' });
    }
    expect(unchanged, 'A paused artwork must stay unchanged without further input.').toBe(true);
    await page.getByRole('button', { name: 'Play animation', exact: true }).click();
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    if (await reset.isVisible()) await reset.click();
    await returnToCollection(page);
    await expect(page.locator('.project-card')).toHaveCount(manifests.length);
    expect(errors).toEqual([]);
  });
}

test('Every experiment respects reduced motion at entry', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const id of ids) {
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  }
});

test('The index and all experiments fit a narrow touch viewport', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(manifests.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const id of ids) {
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${id} should not overflow`).toBe(true);
    const stage = (await page.locator('[data-art-stage]').boundingBox())!;
    expect(stage.width).toBeLessThanOrEqual(375);
    expect(stage.height).toBeGreaterThan(300);
  }
});

test('Afterimage exports an actual local PNG', async ({ page }) => {
  await page.goto('./projects/ribbon/');
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep a print', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('odd-index-afterimage.png');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('[data-art-report]')).toContainText('Canvas cleared');
  await page.getByRole('button', { name: 'New gesture', exact: true }).click();
  await expect(page.locator('[data-art-report]')).toContainText('new composition');
});

test('An unsupported WebGL browser gets an honest error and a usable alternative', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(type: string, ...args: unknown[]) {
        if (type.includes('webgl')) return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto('./projects/orbital/');
  await expect(page.getByRole('alert')).toContainText('WebGL');
  await page.getByRole('link', { name: 'Try Flow State instead' }).click();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeEnabled();
});

test('The index uses real, locally served artwork previews', async ({ page }) => {
  await page.goto('./');
  for (const card of await page.locator('.project-card').all()) {
    await card.scrollIntoViewIfNeeded();
    const image = card.locator('img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(500);
    expect(await image.evaluate((element: HTMLImageElement) => new URL(element.currentSrc).origin)).toBe(new URL(page.url()).origin);
  }
});

for (const legacyAutomation of [false, true]) {
  const name = legacyAutomation
    ? 'Echo supports legacy audio automation when muting and retiring notes'
    : 'Echo creates sound only after opt-in and releases audio on exit';
  test(name, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((legacy) => {
      const contexts: AudioContext[] = [];
      let tones = 0;
      let cancellations = 0;
      if (legacy) {
        Object.defineProperty(AudioParam.prototype, 'cancelAndHoldAtTime', { value: undefined, configurable: true });
      }
      const cancel = AudioParam.prototype.cancelScheduledValues;
      AudioParam.prototype.cancelScheduledValues = function (time: number) {
        cancellations++;
        return cancel.call(this, time);
      };
      const NativeAudioContext = window.AudioContext;
      Object.defineProperty(window, '__oddAudioStates', { get: () => contexts.map((context) => context.state) });
      Object.defineProperty(window, '__oddToneCount', { get: () => tones });
      Object.defineProperty(window, '__oddAudioCancellations', { get: () => cancellations });
      Object.defineProperty(window, 'AudioContext', {
        value: class extends NativeAudioContext {
          constructor(options?: AudioContextOptions) {
            super(options);
            contexts.push(this);
          }
          createOscillator() {
            tones++;
            return super.createOscillator();
          }
          close() {
            const calls = Number(sessionStorage.getItem('odd-test-audio-closes') || '0');
            sessionStorage.setItem('odd-test-audio-closes', String(calls + 1));
            return super.close();
          }
        },
      });
    }, legacyAutomation);
    await page.goto('./projects/echo/');
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    if (legacyAutomation) {
      await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
      await page.getByRole('slider', { name: 'Persistence', exact: true }).focus();
      await page.keyboard.press('End');
    }
    const sound = page.getByRole('button', { name: 'Sound', exact: true });
    const ripple = page.getByRole('button', { name: 'Send a ripple', exact: true });
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await ripple.click();
    expect(await page.evaluate(() => window.__oddAudioStates)).toEqual([]);
    expect(await page.evaluate(() => window.__oddToneCount)).toBe(0);
    await sound.click();
    await expect.poll(() => page.evaluate(() => window.__oddAudioStates)).toEqual(['running']);
    for (let note = 0; note < (legacyAutomation ? 9 : 1); note++) {
      await ripple.click();
      if (legacyAutomation) await page.waitForTimeout(100);
    }
    expect(await page.evaluate(() => window.__oddToneCount)).toBeGreaterThan(0);
    if (legacyAutomation) {
      expect(await page.evaluate(() => window.__oddAudioCancellations)).toBeGreaterThan(0);
    }
    await sound.click();
    await expect.poll(() => page.evaluate(() => window.__oddAudioStates)).toEqual(['closed']);
    await sound.click();
    await expect.poll(() => page.evaluate(() => window.__oddAudioStates)).toEqual(['closed', 'running']);
    await openCollectionMenu(page);
    await page.getByRole('link', { name: 'Next project: Gravity Garden', exact: true }).click();
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('odd-test-audio-closes')))).toBe(2);
    expect(await page.evaluate(() => window.__oddAudioStates)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('Custom typography and keyboard scattering work while motion is paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/type/');
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  const canvas = page.locator('[data-stage] canvas');
  const fingerprint = async () => createHash('sha256').update(
    await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
  ).digest('hex');
  const original = await fingerprint();
  const word = page.locator('[data-controls] input[type="text"]');
  await word.fill('CURIOUS');
  await word.press('Enter');
  await expect(word).toHaveValue('CURIOUS');
  await expect.poll(fingerprint).not.toBe(original);
  const composed = await fingerprint();
  await page.getByRole('button', { name: /Scatter/i }).click();
  await expect.poll(fingerprint).not.toBe(composed);
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await canvas.focus();
  await canvas.press('Space');
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await page.locator('.art-website').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
});
