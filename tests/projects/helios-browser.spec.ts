import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { PLANETS } from '../../src/projects/helios/data';
import { initialState, shareURL } from '../../src/projects/helios/state';

// Decode Chromium's non-interlaced, 8-bit screenshot PNG without another package.
function pixels(png: Buffer) {
  let width = 0, height = 0, channels = 0;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); expect(data[12]).toBe(0);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      expect(channels).toBeGreaterThan(0);
    }
    if (type === 'IDAT') chunks.push(data);
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  const result = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, left = x >= channels ? result[i - channels] : 0;
      const above = y > 0 ? result[i - stride] : 0, diagonal = x >= channels && y > 0 ? result[i - stride - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, diagonal);
      result[i] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  function at(x: number, y: number) {
    const offset = (Math.floor(y) * width + Math.floor(x)) * channels;
    return [result[offset], result[offset + 1], result[offset + 2]];
  }
  let gold = 0, bright = 0, nonBlack = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const [r, g, b] = at(x, y);
    const instrumentField = y > height * .28 && y < height * .7 && Math.abs(x - width / 2) < height * .35;
    if (instrumentField && r > 110 && g > 50 && r > b * 1.4) gold++;
    if (instrumentField && Math.max(r, g, b) > 70) bright++;
    if (r + g + b > 40) nonBlack++;
  }
  return { width, height, at, gold, bright, nonBlack, raw: result };
}
const root = (page: Page) => page.locator('.project-helios');
async function desk(page: Page, panel: 'observer' | 'eclipse' | 'moon' | 'journeys') {
  if (await page.locator(`[data-h-instrument="${panel}"]`).isVisible()) return;
  if (await page.locator('[data-h-dock]').isVisible()) await page.locator(`[data-h-panel="${panel}"]`).click();
  else await page.locator(`.h-instrument-launchers [data-h-open="${panel}"]`).click();
}
async function closeDesk(page: Page) {
  const done = page.locator('[data-h-action=close-dock]');
  if (await done.isVisible()) await done.click();
}
async function timeSettings(page: Page) {
  await closeDesk(page);
  if (!await page.locator('[data-h-time-dialog]').isVisible()) await page.locator('.h-time-readout').click();
}
async function closeTime(page: Page) { await page.getByRole('button', { name: 'Close time settings', exact: true }).click(); }
async function setUTC(page: Page, value: string) {
  await timeSettings(page); await page.locator('#h-utc').fill(value); await page.locator('[data-h-action=set-time]').click();
}
async function resetObservation(page: Page) {
  await timeSettings(page); await page.locator('[data-h-action=reset]').click();
}
async function oneScreen(page: Page) {
  const actual = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth, viewportHeight: innerHeight, x: scrollX, y: scrollY,
    stage: document.querySelector('[data-h-host]')!.getBoundingClientRect().toJSON(),
    transport: document.querySelector('.h-time-dock')!.getBoundingClientRect().toJSON(),
  }));
  expect(actual.width).toBe(actual.viewportWidth);
  expect(actual.height).toBe(actual.viewportHeight);
  expect([actual.x, actual.y]).toEqual([0, 0]);
  expect(actual.stage.width).toBeGreaterThan(150); expect(actual.stage.height).toBeGreaterThan(130);
  expect(actual.stage.top).toBeGreaterThanOrEqual(0);
  expect(actual.transport.bottom).toBeLessThanOrEqual(actual.viewportHeight);
}
async function ready(page: Page) {
  await page.goto('./projects/helios/');
  await expect(root(page)).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-h-event-kind]')).toContainText('Total event');
}
async function painted(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await painted(page);
  await oneScreen(page);
  const buffer = await page.screenshot({ path: info.outputPath(`${name}.png`) });
  await info.attach(name, { body: buffer, contentType: 'image/png' });
}
async function canvasPixels(page: Page) {
  await painted(page);
  return pixels(await page.locator('[data-h-host] canvas').screenshot());
}

test.use({ viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' });
test.describe('HELIOS actual software-WebGL observatory', () => {
  test.setTimeout(90_000);

  test('real totality, same-instant observer contrasts, annular ring, date removal, and a hemisphere-aware Moon', async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    await expect(page.locator('[data-h-contacts] button')).toHaveCount(5);
    const time = await root(page).getAttribute('data-time');
    const total = await canvasPixels(page);
    expect(total.bright).toBeGreaterThan(500);
    expect(total.gold).toBeLessThan(10);
    expect(total.at(total.width / 2, total.height / 2).reduce((a, b) => a + b, 0)).toBeLessThan(12);
    await screenshot(page, info, 'helios-totality-desktop');

    await page.locator('#h-site').selectOption('3');
    await expect(root(page)).toHaveAttribute('data-time', time!);
    await expect(page.locator('[data-h-instant]')).toHaveText('Partial eclipse');
    const partial = await canvasPixels(page);
    expect(partial.gold).toBeGreaterThan(3000);
    await page.locator('#h-site').selectOption('6');
    await expect(root(page)).toHaveAttribute('data-time', time!);
    await expect(page.locator('[data-h-instant]')).toHaveText('Below the horizon');
    await expect(page.locator('[data-h-event-kind]')).toHaveText('No local event returned');
    expect((await canvasPixels(page)).gold).toBe(0);
    await expect(page.locator('[data-h-event-description]')).toContainText('this UTC date');

    await desk(page, 'journeys'); await page.locator('[data-h-study=dallas]').click();
    await expect(page.locator('[data-h-event-kind]')).toHaveText('Total event');
    await expect(page.locator('#h-site option:checked')).toHaveText('Dallas, USA');
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    await desk(page, 'journeys'); await page.locator('[data-h-study=annular]').click();
    await expect(page.locator('[data-h-event-kind]')).toContainText('Annular event');
    await expect(page.locator('[data-h-instant]')).toHaveText('Annular eclipse');
    const ring = await canvasPixels(page);
    expect(ring.gold).toBeGreaterThan(800);
    expect(ring.at(ring.width / 2, ring.height / 2).reduce((a, b) => a + b, 0)).toBeLessThan(12);
    await screenshot(page, info, 'helios-annular-desktop');

    await setUTC(page, '2024-04-17T18:00');
    await expect(root(page)).toHaveAttribute('data-time', String(Date.UTC(2024, 3, 17, 18)));
    await expect(page.locator('[data-h-instant]')).toHaveText('No solar overlap');
    await expect(page.locator('[data-h-event-kind]')).toHaveText('No local event returned');
    await desk(page, 'moon'); await page.locator('[data-h-action=moon-study]').click();
    await expect(page.locator('[data-h-instant]')).toHaveText('Waxing gibbous');
    await expect(page.locator('[data-h-moon-visibility]')).toHaveText('Above horizon');
    const southAngle = await page.locator('[data-h-limb-angle]').innerText();
    const south = await canvasPixels(page);
    expect(south.bright).toBeGreaterThan(1500);
    await screenshot(page, info, 'helios-moon-south');
    await page.locator('#h-site').selectOption('5');
    await expect(page.locator('[data-h-moon-visibility]')).toHaveText('Above horizon');
    expect(await page.locator('[data-h-limb-angle]').innerText()).not.toBe(southAngle);
    const north = await canvasPixels(page);
    expect(north.raw.equals(south.raw)).toBe(false);
    expect(north.bright).toBeGreaterThan(1500);
    await desk(page, 'moon'); await page.locator('#h-phase').selectOption('180');
    await page.locator('[data-h-action=phase-next]').click();
    await expect(page.locator('[data-h-phase-name]')).toHaveText('Full Moon');
    await expect(page.locator('[data-h-phase-fraction]')).toHaveText(/99\.9%|100\.0%/);
    expect(errors).toEqual([]);
  });

  test('all planets have actual moving cameras; system, export, restore, reset, and teardown work', async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await page.locator('[data-h-action=notes]').click();
    const licenseURL = await page.locator('[data-h-license]').getAttribute('href');
    expect(licenseURL).toMatch(/\/third-party\/astronomy-engine-LICENSE\.txt$/);
    const license = await page.request.get(licenseURL!);
    expect(license.ok()).toBe(true);
    expect(await license.text()).toContain('Permission is hereby granted, free of charge');
    await page.getByRole('button', { name: 'Close field notes', exact: true }).click();
    await page.locator('[data-h-view=system]').click();
    await expect(page.locator('[data-h-host] canvas')).toHaveAttribute('data-view', 'system');
    const system = await canvasPixels(page);
    expect(system.bright).toBeGreaterThan(300);
    await screenshot(page, info, 'helios-system-desktop');
    await page.locator('[data-h-view=planet]').click();
    const targets = new Set<string>(), images = new Set<string>();
    for (const name of PLANETS) {
      await page.locator('#h-body').selectOption(name);
      await expect(page.locator('[data-h-title]')).toHaveText(name);
      await expect(page.locator('[data-h-host] canvas')).toHaveAttribute('data-body', name);
      await painted(page);
      targets.add((await page.locator('[data-h-host] canvas').getAttribute('data-target'))!);
      const visual = await canvasPixels(page);
      expect(visual.bright, `${name} has a real shaded body`).toBeGreaterThan(300);
      images.add(visual.raw.subarray(visual.raw.length / 3, visual.raw.length / 2).toString('base64'));
      if (name === 'Saturn') await screenshot(page, info, 'helios-saturn-desktop');
    }
    expect(targets.size).toBe(8); expect(images.size).toBe(8);
    await page.locator('#h-camera-select').selectOption('ride');
    await expect(page.locator('[data-h-host] canvas')).toHaveAttribute('data-frame', /Compressed/);
    const target = await page.locator('[data-h-host] canvas').getAttribute('data-target');
    await timeSettings(page); await page.locator('#h-step').selectOption('86400'); await closeTime(page);
    await page.locator('[data-h-action=step-forward]').click();
    await painted(page);
    expect(await page.locator('[data-h-host] canvas').getAttribute('data-target')).not.toBe(target);
    await page.locator('[data-h-action=keep]').click();
    const json = await page.locator('#h-record').inputValue();
    expect(JSON.parse(json).state.body).toBe('Neptune');
    const link = await page.locator('#h-share').inputValue();
    const download = page.waitForEvent('download');
    await page.locator('[data-h-action=download]').click();
    expect((await download).suggestedFilename()).toMatch(/^helios-.*\.json$/);
    await page.getByRole('button', { name: 'Close observation record', exact: true }).click();
    await resetObservation(page);
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    await page.locator('[data-h-action=keep]').click();
    await page.locator('#h-record').fill(json);
    await page.locator('[data-h-action=restore-text]').click();
    await expect(page.locator('[data-h-title]')).toHaveText('Neptune');
    await expect(root(page)).toHaveAttribute('data-playing', 'false');
    await page.goto(link);
    await expect(root(page)).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('[data-h-title]')).toHaveText('Neptune');
    await resetObservation(page);
    await expect(page.locator('#h-site option:checked')).toHaveText('Nazas, Mexico');
    const heldTime = await root(page).getAttribute('data-time');
    await page.waitForTimeout(250);
    await expect(root(page)).toHaveAttribute('data-time', heldTime!);
    await page.goto('./');
    await expect(page.locator('.project-helios')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('strict UTC, single-pointer map, horizon pointing, atomic invalid import, and stale file ownership', async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 }, timezoneId: 'Pacific/Honolulu' });
    const page = await context.newPage();
    await ready(page);
    await setUTC(page, '2024-04-17T18:00');
    await expect(root(page)).toHaveAttribute('data-time', String(Date.UTC(2024, 3, 17, 18)));
    await desk(page, 'observer');
    const map = page.locator('[data-h-map-canvas]'), box = (await map.boundingBox())!;
    const x = Math.round(box.x + box.width * .75), y = Math.round(box.y + box.height * .25);
    const expectedLat = 90 - (y - box.y) / box.height * 180, expectedLon = (x - box.x) / box.width * 360 - 180;
    await page.mouse.click(x, y);
    expect(Number(await page.locator('#h-latitude').inputValue())).toBeCloseTo(expectedLat, 3);
    expect(Number(await page.locator('#h-longitude').inputValue())).toBeCloseTo(expectedLon, 3);
    await map.focus(); await page.keyboard.press('ArrowLeft');
    expect(Number(await page.locator('#h-longitude').inputValue())).toBeCloseTo(expectedLon - 1, 3);
    await page.locator('.h-optics-fields summary').click();
    await page.locator('#h-track-select').selectOption('horizon');
    await page.locator('#h-azimuth').fill('0'); await page.locator('#h-altitude').fill('0');
    await page.locator('[data-h-action=point]').click();
    const wide = await canvasPixels(page);
    expect(wide.nonBlack).toBeGreaterThan(1000);
    await screenshot(page, info, 'helios-horizon-desktop');
    await page.locator('[data-h-action=keep]').click();
    const before = await root(page).getAttribute('data-time');
    await page.locator('#h-record').fill('{"format":"helios-observation","version":7}');
    await page.locator('[data-h-action=restore-text]').click();
    await expect(page.locator('[data-h-record-status]')).toContainText('version 1');
    await expect(root(page)).toHaveAttribute('data-time', before!);
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        if (this.name === 'slow.json') return new Promise(resolve => setTimeout(() => { void original.call(this).then(resolve); }, 700));
        return original.call(this);
      };
    });
    const slow = { format: 'helios-observation', version: 1, state: { ...initialState(), time: Date.UTC(2025, 0, 1) } };
    const fast = { format: 'helios-observation', version: 1, state: { ...initialState(), time: Date.UTC(2024, 3, 17, 18), track: 'Moon' } };
    await page.locator('#h-file').setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(slow)) });
    await page.locator('#h-file').setInputFiles({ name: 'fast.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fast)) });
    await expect(page.locator('[data-h-keep-dialog]')).not.toBeVisible();
    await page.waitForTimeout(900);
    await expect(root(page)).toHaveAttribute('data-time', String(Date.UTC(2024, 3, 17, 18)));
    await expect(page.locator('#h-track-select')).toHaveValue('Moon');
    await context.close();
  });

  for (const width of [375, 320]) {
    test(`mobile ${width}px controls and rendered sky remain practical`, async ({ browser, baseURL }, info) => {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await ready(page);
      await expect(root(page)).toHaveAttribute('data-playing', 'false');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const visual = await canvasPixels(page);
      expect(visual.bright).toBeGreaterThan(300);
      await screenshot(page, info, `helios-totality-mobile-${width}`);
      await oneScreen(page);
      await expect(page.locator('#h-site')).toBeVisible();
      await page.locator('#h-site').selectOption('6');
      await page.locator('[data-h-view=sky]').click();
      await expect(page.locator('[data-h-instant]')).toHaveText('Below the horizon');
      await page.locator('[data-h-view=planet]').click();
      await page.locator('#h-body').selectOption('Saturn');
      await expect(page.locator('[data-h-title]')).toHaveText('Saturn');
      await screenshot(page, info, `helios-planet-mobile-${width}`);
      await desk(page, 'observer');
      await expect(page.locator('[data-h-body-deck]')).toBeVisible();
      await screenshot(page, info, `helios-observe-mobile-${width}`);
      await resetObservation(page);
      await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
      await page.locator('[data-h-action=keep]').click();
      await expect(page.locator('[data-h-keep-dialog]')).toBeVisible();
      const smallControls = await page.locator('[data-h-keep-dialog] button, [data-h-keep-dialog] input, [data-h-keep-dialog] textarea')
        .evaluateAll(elements => elements.filter(element => element.getClientRects().length && parseFloat(getComputedStyle(element).fontSize) < 14).map(element => element.id || element.tagName));
      expect(smallControls).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-h-keep-dialog]')).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await context.close();
    });
  }

  test('a deep-linked observation renders its own UTC/site rather than relabeling the initial geometry', async ({ page, baseURL }) => {
    const state = { ...initialState(), time: Date.UTC(2024, 3, 17, 18), site: { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241, elevation: 25 }, track: 'Moon' as const };
    const url = shareURL(new URL('./projects/helios/', baseURL).href, state);
    await page.goto(url);
    await expect(root(page)).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#h-site option:checked')).toHaveText('Cape Town');
    await expect(page.locator('[data-h-instant]')).toHaveText('Waxing gibbous');
    await expect(root(page)).toHaveAttribute('data-time', String(state.time));
    expect((await canvasPixels(page)).bright).toBeGreaterThan(1500);
  });

  test('next-eclipse journeys neither repeat nor skip local events across UTC midnight', async ({ page }) => {
    await ready(page);
    for (const example of [
      { site: '6', from: '2013-05-09T12:00', day: '2014-04-29', peak: '2014-04-29T07:15:03Z', kind: 'Below the horizon', geometry: 'partial', visible: false },
      { site: '2', from: '2012-05-20T12:00', day: '2012-05-21', peak: '2012-05-21T01:35:53Z', kind: 'Annular eclipse', geometry: 'annular', visible: true },
    ]) {
      await page.locator('#h-site').selectOption(example.site);
      await setUTC(page, example.from);
      await expect(page.locator('[data-h-event-day]')).toHaveText(example.from.slice(0, 10));
      await expect(page.locator('[data-h-event-kind]')).not.toHaveText('Current-date circumstances');
      await desk(page, 'eclipse'); await page.locator('[data-h-action=next-eclipse]').click();
      await expect(page.locator('[data-h-event-day]')).toHaveText(example.day);
      await expect(page.locator('[data-h-instant]')).toHaveText(example.kind);
      await expect(root(page)).toHaveAttribute('data-eclipse', example.geometry);
      const time = Number(await root(page).getAttribute('data-time'));
      expect(Math.abs(time - Date.parse(example.peak))).toBeLessThan(60000);
      if (example.visible) {
        expect((await canvasPixels(page)).gold).toBeGreaterThan(800);
      } else {
        await expect(root(page)).toHaveAttribute('data-visibility', 'below');
        expect((await canvasPixels(page)).gold).toBe(0);
        await desk(page, 'eclipse'); await page.locator('[data-h-contact=C1]').click();
        await page.locator('[data-h-action=step-forward]').click();
        await expect(page.locator('[data-h-instant]')).toHaveText('Partial eclipse');
        await expect(page.locator('[data-h-sun-altitude]')).toHaveText('+11.17°');
        await expect(page.locator('[data-h-sun-visibility]')).toHaveText('Above horizon');
        expect((await canvasPixels(page)).gold).toBeGreaterThan(800);
        const heldTime = await root(page).getAttribute('data-time');
        await desk(page, 'eclipse'); await page.locator('[data-h-action=next-eclipse]').click();
        await expect(page.locator('[data-h-status]')).toContainText('within the next five years');
        await expect(root(page)).toHaveAttribute('data-time', heldTime!);
        await expect(page.locator('[data-h-event-day]')).toHaveText(example.day);
      }
    }
  });

  test('editing while a next-eclipse search replaces pending contacts restores current-date ownership', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      let active = 0;
      class DelayedWorker extends NativeWorker {
        pending: number | undefined;
        stopped = false;
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          document.documentElement.dataset.hPendingWorkers = String(++active);
        }
        override postMessage(message: unknown) {
          const snapshot = structuredClone(message);
          this.pending = window.setTimeout(() => super.postMessage(snapshot), 400);
        }
        override terminate() {
          clearTimeout(this.pending);
          if (!this.stopped) {
            this.stopped = true;
            document.documentElement.dataset.hPendingWorkers = String(--active);
          }
          super.terminate();
        }
      }
      window.Worker = DelayedWorker;
    });
    const selectedTime = Date.UTC(2023, 9, 14, 18);
    await setUTC(page, '2023-10-14T18:00');
    await expect(page.locator('html')).toHaveAttribute('data-h-pending-workers', '1');
    await desk(page, 'eclipse'); await page.locator('[data-h-action=next-eclipse]').click();
    await page.locator('[data-h-view=system]').click();
    await expect(page.locator('html')).toHaveAttribute('data-h-pending-workers', '0');
    await expect(root(page)).toHaveAttribute('data-time', String(selectedTime));
    await expect(page.locator('[data-h-event-day]')).toHaveText('2023-10-14');
    await expect(page.locator('[data-h-event-kind]')).toContainText('Partial event');
    await expect(page.locator('[data-h-contacts] button')).toHaveCount(3);
  });

  test('real worker cancellation and aborted async mount release resources without late ownership', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      const NativeWorker = window.Worker;
      let active = 0;
      class TrackedWorker extends NativeWorker {
        stopped = false;
        constructor(url: string | URL, options?: WorkerOptions) { super(url, options); active++; }
        override terminate() {
          if (!this.stopped) { this.stopped = true; active--; }
          super.terminate();
        }
      }
      window.Worker = TrackedWorker;
      const searchPath = '/src/projects/helios/search.ts', indexPath = '/src/projects/helios/index.ts';
      const searchModule: typeof import('../../src/projects/helios/search') = await import(searchPath);
      const module: typeof import('../../src/projects/helios/index') = await import(indexPath);
      const search = new searchModule.EclipseSearch();
      const site = { name: 'Nazas', latitude: 25.288, longitude: -104.015, elevation: 1250 };
      const time = Date.UTC(2024, 3, 8, 18);
      const status = (error: unknown) => {
        if (error instanceof DOMException) return error.name;
        throw error;
      };
      try {
        const first = search.find({ mode: 'current', time, site }).then(() => 'unexpected', status);
        const second = search.find({ mode: 'current', time, site: { name: 'Dallas', latitude: 32.7767, longitude: -96.797, elevation: 131 } });
        const event = await second;
        const firstStatus = await first;
        const pending = search.find({ mode: 'current', time, site }).then(() => 'unexpected', status);
        search.destroy();
        const pendingStatus = await pending;
        const container = document.createElement('div'); document.body.append(container);
        const controller = new AbortController();
        const mounting = module.mount({ container, controls: document.createElement('div'), signal: controller.signal, reducedMotion: true, report: () => {} });
        controller.abort();
        const mountStatus = await mounting.then(() => 'unexpected', status);
        const remaining = container.childElementCount; container.remove();
        return { firstStatus, pendingStatus, kind: event?.kind, active, mountStatus, remaining };
      } finally { search.destroy(); window.Worker = NativeWorker; }
    });
    expect(result).toEqual({ firstStatus: 'AbortError', pendingStatus: 'AbortError', kind: 'total', active: 0, mountStatus: 'AbortError', remaining: 0 });
  });

  test('contact buttons, keyboard scrub, optical zoom, running rate, and visibility pause control the physical snapshot', async ({ page }) => {
    await ready(page);
    await page.locator('[data-h-contact=C1]').click();
    await page.locator('[data-h-action=step-forward]').click();
    await expect(page.locator('[data-h-instant]')).toHaveText('Partial eclipse');
    expect((await canvasPixels(page)).gold).toBeGreaterThan(1500);
    const slider = page.locator('#h-event-scrub');
    await slider.focus(); await page.keyboard.press('End');
    await page.locator('[data-h-action=step-forward]').click();
    await expect(page.locator('[data-h-instant]')).toHaveText('No solar overlap');
    await page.locator('[data-h-action=peak]').click();
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    const original = await canvasPixels(page);
    await page.locator('[data-h-action=zoom-in]').click();
    expect(Number(await page.locator('#h-fov').inputValue())).toBeLessThan(1.6);
    expect((await canvasPixels(page)).raw.equals(original.raw)).toBe(false);
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    await page.locator('[data-h-action=center]').click();
    await expect(page.locator('#h-fov')).toHaveValue('1.6');
    const start = Number(await root(page).getAttribute('data-time'));
    await timeSettings(page); await page.locator('#h-rate').selectOption('30'); await closeTime(page);
    await page.getByRole('button', { name: 'Run time', exact: true }).click();
    await expect.poll(async () => Number(await root(page).getAttribute('data-time'))).toBeGreaterThan(start + 1000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Reflect.deleteProperty(document, 'hidden');
    });
    await expect(root(page)).toHaveAttribute('data-playing', 'false');
    const held = await root(page).getAttribute('data-time');
    await page.waitForTimeout(250);
    await expect(root(page)).toHaveAttribute('data-time', held!);
    await resetObservation(page);
    await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
    const initialPeak = Number(await root(page).getAttribute('data-time'));
    await page.locator('[data-h-action=next-eclipse]').click();
    await expect.poll(async () => Number(await root(page).getAttribute('data-time'))).toBeGreaterThan(initialPeak + 86400000);
    await expect(page.locator('[data-h-event-kind]')).toHaveText(/^(Partial|Annular|Total) event/);
    await page.locator('[data-h-action=keep]').click();
    const nextRecord = JSON.parse(await page.locator('#h-record').inputValue());
    expect(nextRecord.localEvent.peak).toBe(nextRecord.state.time);
    expect(nextRecord.computed.time).toBe(nextRecord.state.time);
    expect(nextRecord.localEvent.day).toBe(new Date(nextRecord.state.time).toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Close observation record', exact: true }).click();
  });
});
