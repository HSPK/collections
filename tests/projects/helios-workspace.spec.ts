import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { initialState, shareURL } from '../../src/projects/helios/state';
import { observe } from '../../src/projects/helios/astronomy';
import { SITES } from '../../src/projects/helios/data';

test.use({ trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);
const root = (page: Page) => page.locator('.project-helios');
const deviceTime = Date.UTC(2026, 8, 6, 12, 0, 0);
async function ready(page: Page) {
  await page.goto('./projects/helios/');
  await expect(root(page)).toHaveAttribute('data-ready', 'true');
  await expect(root(page)).toHaveAttribute('data-workspace', 'true');
}
async function desk(page: Page, panel: 'observer' | 'eclipse' | 'moon' | 'journeys') {
  if (await page.locator(`[data-h-instrument="${panel}"]`).isVisible()) return;
  if (await page.locator('[data-h-dock]').isVisible()) await page.locator(`[data-h-panel="${panel}"]`).click();
  else await page.locator(`.h-instrument-launchers [data-h-open="${panel}"]`).click();
}
async function closeDesk(page: Page) {
  if (await page.locator('[data-h-action=close-dock]').isVisible()) await page.locator('[data-h-action=close-dock]').click();
}
async function timeSettings(page: Page) { await closeDesk(page); await page.locator('.h-time-readout').click(); }
async function singleScreen(page: Page) {
  const dimensions = await page.evaluate(() => {
    const stage = document.querySelector('[data-h-host]');
    const canvas = stage?.querySelector('canvas');
    const controls = document.querySelector('.h-time-dock');
    if (!stage || !(canvas instanceof HTMLCanvasElement) || !controls) throw new Error('Missing actual observatory.');
    return { w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      sx: scrollX, sy: scrollY, stage: stage.getBoundingClientRect().toJSON(), controls: controls.getBoundingClientRect().toJSON(),
      canvasWidth: canvas.width, canvasHeight: canvas.height };
  });
  expect([dimensions.sw, dimensions.sh, dimensions.sx, dimensions.sy]).toEqual([dimensions.w, dimensions.h, 0, 0]);
  expect(dimensions.stage.width).toBeGreaterThan(200);
  expect(dimensions.stage.height).toBeGreaterThan(140);
  expect(dimensions.canvasWidth).toBeGreaterThan(100);
  expect(dimensions.canvasHeight).toBeGreaterThan(100);
  expect(dimensions.controls.top).toBeGreaterThanOrEqual(dimensions.stage.bottom - 1);
  expect(dimensions.controls.bottom).toBeLessThanOrEqual(dimensions.h);
  const tooSmall = await root(page).locator('button,input,select,textarea').evaluateAll(elements =>
    elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' &&
      parseFloat(getComputedStyle(element).fontSize) < 14).map(element => element.id || element.textContent));
  expect(tooSmall).toEqual([]);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await singleScreen(page);
  const body = await page.screenshot({ path: info.outputPath(`${name}.png`) });
  await info.attach(name, { body, contentType: 'image/png' });
}
async function noInstrumentScroll(page: Page) {
  const overflow = await page.locator('.h-dock-content').evaluate(element => element.scrollHeight - element.clientHeight);
  expect(overflow, 'Short eclipse/phase/history instruments must fit without internal scrolling').toBeLessThanOrEqual(2);
}
async function reachablePrimaryControls(page: Page) {
  const blocked = await page.locator('.h-time-dock button, .h-time-dock select, .h-view-tools button, .h-command-bar button, .h-command-bar select')
    .evaluateAll(elements => elements.flatMap(element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return [];
      const r = element.getBoundingClientRect();
      const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.right - 4, r.bottom - 4], [r.x + 4, r.y + 4]];
      return points.flatMap(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === element || element.contains(hit) ? [] : [{ label: element.getAttribute('aria-label') || element.textContent, x, y, coveredBy: hit?.tagName }];
      });
    }));
  expect(blocked, 'Primary control hit targets must not sit behind the collection menu').toEqual([]);
  const axis = page.locator('[data-h-time-axis]'), rect = (await axis.boundingBox())!;
  const menu = (await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox())!;
  expect(rect.x + rect.width).toBeLessThan(menu.x - 4);
  for (const y of [rect.y + 4, rect.y + rect.height - 4]) {
    const hit = await page.evaluate(({ x, y }) => {
      const target = document.querySelector('[data-h-time-axis]')!;
      return target.contains(document.elementFromPoint(x, y));
    }, { x: rect.x + rect.width - 4, y });
    expect(hit, 'Both right-hand timeline corners must remain draggable').toBe(true);
  }
}

test.describe('HELIOS single-screen observing workflows', () => {
  for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480], [844, 390]]) {
    test(`${width}x${height}: sky, contacts, phases, history, and planet controls stay in one screen`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await ready(page);
      await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
      await singleScreen(page);
      await reachablePrimaryControls(page);
      await expect(root(page)).toHaveCSS('transition-property', 'none');
      await capture(page, info, `helios-one-screen-${width}x${height}`);
      const axis = page.locator('[data-h-time-axis]'), axisRect = (await axis.boundingBox())!;
      const start = Number(await axis.getAttribute('data-start')), end = Number(await axis.getAttribute('data-end'));
      const x = Math.floor(axisRect.x + axisRect.width - 4), y = Math.floor(axisRect.y + axisRect.height - 4);
      await page.mouse.click(x, y);
      await expect(root(page)).toHaveAttribute('data-time', String(Math.round(start + (x - axisRect.x) / axisRect.width * (end - start))));
      await desk(page, 'eclipse'); await noInstrumentScroll(page);
      await page.locator('[data-h-contact=C1]').click();
      await closeDesk(page);
      await page.locator('[data-h-action=step-forward]').click();
      await expect(page.locator('[data-h-instant]')).toHaveText('Partial eclipse');
      await singleScreen(page);
      await desk(page, 'eclipse'); await page.locator('[data-h-action=peak]').click(); await closeDesk(page);
      await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
      await page.locator('#h-site').selectOption('6');
      await expect(page.locator('[data-h-instant]')).toHaveText('Below the horizon');
      await singleScreen(page);
      await desk(page, 'moon'); await noInstrumentScroll(page);
      await page.locator('[data-h-action=moon-study]').click(); await closeDesk(page);
      await expect(page.locator('[data-h-instant]')).toHaveText('Waxing gibbous');
      await singleScreen(page);
      await desk(page, 'journeys'); await noInstrumentScroll(page);
      await page.locator('[data-h-study=annular]').click(); await closeDesk(page);
      await expect(page.locator('[data-h-instant]')).toHaveText('Annular eclipse');
      await page.locator('[data-h-view=planet]').click();
      await page.locator('#h-body').selectOption('Saturn');
      await expect(page.locator('[data-h-host] canvas')).toHaveAttribute('data-body', 'Saturn');
      await page.locator('#h-camera-select').selectOption('ride');
      await singleScreen(page);
      await page.locator('[data-h-view=sky]').click();
      await timeSettings(page);
      await page.locator('[data-h-action=reset]').click();
      await expect(page.locator('[data-h-instant]')).toHaveText('Total eclipse');
      await singleScreen(page);
    });
  }

  test('Live samples Date.now across clock jumps, view/site edits, and hidden-tab suspension', async ({ page }, info) => {
    await page.clock.setFixedTime(new Date(deviceTime));
    await ready(page);
    const baseline = await root(page).getAttribute('data-time');
    await page.locator('[data-h-action=now]').click();
    await expect(root(page)).toHaveAttribute('data-time', String(deviceTime));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await page.locator('[data-h-action=live]').click();
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    await page.locator('#h-site').selectOption('6');
    await page.locator('[data-h-view=planet]').click();
    await page.locator('#h-body').selectOption('Neptune');
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    const changed = deviceTime + 2 * 3600000;
    await page.clock.setFixedTime(new Date(changed));
    await expect(root(page)).toHaveAttribute('data-time', String(changed));
    await page.locator('[data-h-view=sky]').click();
    await page.locator('#h-track-select').selectOption('Moon');
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const renders = await page.locator('[data-h-host] canvas').getAttribute('data-render-count');
    const returnedTime = changed + 3 * 86400000;
    await page.clock.setFixedTime(new Date(returnedTime));
    await page.waitForTimeout(700);
    await expect(root(page)).toHaveAttribute('data-time', String(changed));
    await expect(page.locator('[data-h-host] canvas')).toHaveAttribute('data-render-count', renders!);
    await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(root(page)).toHaveAttribute('data-time', String(returnedTime));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    await capture(page, info, 'helios-live-device-clock');
    await page.locator('[data-h-action=keep]').click();
    const savedText = await page.locator('#h-record').inputValue();
    const saved = JSON.parse(savedText);
    expect(saved.clock).toMatchObject({ capturedMode: 'live', restoreMode: 'manual' });
    expect(saved.state.time).toBe(returnedTime); expect(saved.computed.time).toBe(returnedTime);
    const physical = observe(returnedTime, SITES[6]);
    expect(saved.computed.sun.altitude).toBeCloseTo(physical.sun.altitude, 9);
    await page.clock.setFixedTime(new Date(returnedTime + 3600000));
    await expect(root(page)).toHaveAttribute('data-time', String(returnedTime + 3600000));
    await expect(page.locator('#h-record')).toHaveValue(savedText);
    const link = await page.locator('#h-share').inputValue();
    await page.goto(link);
    await expect(root(page)).toHaveAttribute('data-ready', 'true');
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await expect(root(page)).toHaveAttribute('data-time', String(returnedTime));
    await timeSettings(page); await page.locator('[data-h-action=reset]').click();
    await expect(root(page)).toHaveAttribute('data-time', baseline!);
  });

  for (const source of ['playback', 'debounced seek'] as const) {
    test(`held contacts recover after ${source} visibility suspension`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(deviceTime));
      await ready(page);
      if (source === 'playback') {
        await timeSettings(page);
        await page.locator('#h-utc').fill('2024-04-07T18:17:31');
        await page.locator('[data-h-action=set-time]').click();
        await expect(page.locator('[data-h-event-kind]')).toHaveText('No local event returned');
        await page.locator('[data-h-action=play]').click();
        await page.clock.setFixedTime(new Date(deviceTime + 86400000));
        await expect(root(page)).toHaveAttribute('data-time', String(Date.UTC(2024, 3, 8, 18, 17, 31)));
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      } else {
        const axis = page.locator('[data-h-time-axis]');
        await axis.evaluate(element => {
          element.addEventListener('keydown', () => {
            // Hide in the same input task, before the contact debounce can run.
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
          }, { once: true });
        });
        await axis.focus();
        await page.keyboard.press('End');
      }
      await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
      const held = await root(page).getAttribute('data-time');
      await page.clock.setFixedTime(new Date(deviceTime + 5 * 86400000));
      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(root(page)).toHaveAttribute('data-time', held!);
      await expect(page.locator('[data-h-event-day]')).toHaveText('2024-04-08');
      await expect(page.locator('[data-h-event-kind]')).toContainText('Total event');
      await expect(page.locator('[data-h-contact]')).toHaveCount(5);
      await expect(page.locator('[data-h-action=peak]')).toBeEnabled();
      await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    });
  }

  for (const source of ['keyboard', 'historical anchor'] as const) {
    test(`${source} seeks discard older timeline drags and their delayed pointer release`, async ({ page }) => {
      await ready(page);
      const axis = page.locator('[data-h-time-axis]');
      const rect = (await axis.boundingBox())!;
      const baseline = await root(page).getAttribute('data-time');
      const start = await axis.getAttribute('data-start');
      await page.mouse.move(rect.x + rect.width / 2, rect.y + 4);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * .9, rect.y + 4);
      if (source === 'keyboard') {
        await page.keyboard.press('Home');
      } else {
        await page.locator('[data-h-axis-history]').focus();
        await page.keyboard.press('Enter');
      }
      const selected = source === 'keyboard' ? start! : baseline!;
      await expect(root(page)).toHaveAttribute('data-time', selected);
      await page.mouse.up();
      await expect(root(page)).toHaveAttribute('data-time', selected);
      await page.waitForTimeout(200);
      await expect(root(page)).toHaveAttribute('data-time', selected);
      await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
      await singleScreen(page);
    });
  }

  test('immediate desktop/phone/landscape resizing keeps the live canvas and angular ruler dimensioned', async ({ page }) => {
    await page.clock.setFixedTime(new Date(deviceTime)); await ready(page);
    await page.locator('[data-h-action=live]').click();
    for (const [width, height] of [[1440, 900], [320, 640], [844, 390], [375, 812], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
      await expect.poll(async () => page.locator('[data-h-host] canvas').evaluate(canvas => {
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing renderer canvas.');
        return Math.abs(canvas.width / Math.min(devicePixelRatio, 1.5) - canvas.getBoundingClientRect().width);
      })).toBeLessThan(2);
      await expect.poll(async () => page.locator('.h-scale').evaluate(element => {
        if (!(element instanceof HTMLElement)) throw new Error('Missing angular scale.');
        const stage = document.querySelector('[data-h-host]')!;
        const expected = stage.getBoundingClientRect().height * Math.tan((1 / 6) * Math.PI / 360) / Math.tan(1.6 * Math.PI / 360);
        return Math.abs(parseFloat(element.style.getPropertyValue('--scale-height')) - expected);
      })).toBeLessThan(.1);
      await singleScreen(page);
      await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
      await expect(root(page)).toHaveAttribute('data-time', String(deviceTime));
    }
  });

  test('general time dragging and keyboard spans exit Live and navigate actual historical anchors', async ({ page }, info) => {
    await page.clock.setFixedTime(new Date(deviceTime));
    await page.setViewportSize({ width: 1280, height: 720 }); await ready(page);
    await page.locator('#h-timespan').selectOption('30d');
    await page.locator('[data-h-action=live]').click();
    const axis = page.locator('[data-h-time-axis]');
    const start = Number(await axis.getAttribute('data-start')), end = Number(await axis.getAttribute('data-end'));
    const rect = (await axis.boundingBox())!;
    const x = Math.round(rect.x + rect.width * .72), y = Math.round(rect.y + 5);
    const expectedTime = Math.round(start + (x - rect.x) / rect.width * (end - start));
    await page.mouse.move(rect.x + rect.width / 2, y); await page.mouse.down();
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(100);
    const ownedTime = await root(page).getAttribute('data-time');
    await axis.dispatchEvent('pointerdown', { pointerId: 99, clientX: rect.x, clientY: y, button: 0 });
    await axis.dispatchEvent('pointermove', { pointerId: 99, clientX: rect.x, clientY: y });
    await axis.dispatchEvent('pointerup', { pointerId: 99, clientX: rect.x, clientY: y });
    await expect(root(page)).toHaveAttribute('data-time', ownedTime!);
    await page.mouse.up();
    await expect(root(page)).toHaveAttribute('data-time', String(expectedTime));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await singleScreen(page);
    await axis.focus(); await page.keyboard.press('Home');
    await expect(root(page)).toHaveAttribute('data-time', String(start));
    await page.keyboard.press('End'); await expect(root(page)).toHaveAttribute('data-time', String(end));
    await page.locator('#h-timespan').selectOption('1y');
    await desk(page, 'journeys');
    await page.locator('[data-h-study=annular]').click();
    await expect(page.locator('[data-h-instant]')).toHaveText('Annular eclipse');
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await expect(page.locator('[data-h-event-day]')).toHaveText('2023-10-14');
    await capture(page, info, 'helios-general-utc-history');
    await page.locator('[data-h-action=live]').click();
    await desk(page, 'moon'); await page.locator('#h-phase').selectOption('90');
    await page.locator('[data-h-action=phase-next]').click();
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await expect(page.locator('#h-track-select')).toHaveValue('Moon');
  });

  test('refined map stays geographic after pan/zoom; choosing a location preserves Live', async ({ page }, info) => {
    await page.clock.setFixedTime(new Date(deviceTime));
    await page.setViewportSize({ width: 375, height: 812 }); await ready(page);
    await page.locator('[data-h-action=live]').click();
    await desk(page, 'observer');
    const map = page.locator('[data-h-map-canvas]');
    await expect(map).toBeVisible();
    await page.locator('[data-h-action=map-in]').click(); await page.locator('[data-h-action=map-in]').click();
    const oldLatitude = await map.getAttribute('data-latitude'), oldLongitude = await map.getAttribute('data-longitude');
    const bounds = (await map.boundingBox())!;
    for (let pan = 0; pan < 3; pan++) {
      await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .6);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .4, { steps: 7 }); await page.mouse.up();
    }
    expect(await map.getAttribute('data-latitude')).toBe(oldLatitude);
    expect(await map.getAttribute('data-longitude')).toBe(oldLongitude);
    const centerLat = Number(await map.getAttribute('data-center-latitude'));
    const centerLon = Number(await map.getAttribute('data-center-longitude'));
    const zoom = Number(await map.getAttribute('data-zoom'));
    expect(zoom).toBeGreaterThan(1);
    const x = Math.round(bounds.x + bounds.width * .83), y = Math.round(bounds.y + bounds.height * .35);
    const expectedLat = centerLat + (.5 - (y - bounds.y) / bounds.height) * 180 / zoom;
    const rawLon = centerLon + ((x - bounds.x) / bounds.width - .5) * 360 / zoom;
    const expectedLon = ((rawLon + 180) % 360 + 360) % 360 - 180;
    expect(rawLon).toBeGreaterThan(180); expect(expectedLon).toBeLessThan(0);
    await page.mouse.click(x, y);
    expect(Number(await page.locator('#h-latitude').inputValue())).toBeCloseTo(expectedLat, 3);
    expect(Number(await page.locator('#h-longitude').inputValue())).toBeCloseTo(expectedLon, 3);
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    await capture(page, info, 'helios-natural-earth-map-mobile');
    await page.locator('[data-h-location-form] button[type=submit]').click();
    await expect(page.locator('[data-h-dock]')).not.toBeVisible();
    await singleScreen(page);
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
    await page.locator('[data-h-action=keep]').click();
    const record = JSON.parse(await page.locator('#h-record').inputValue());
    const physical = observe(deviceTime, record.state.site);
    expect(record.state.site.elevation).toBe(0);
    expect(record.computed.sun.altitude).toBeCloseTo(physical.sun.altitude, 10);
  });

  test('a slow import owns its source across Live ticks, and its restore cancels the old clock', async ({ page }) => {
    await page.clock.setFixedTime(new Date(deviceTime)); await ready(page);
    await page.locator('[data-h-action=live]').click();
    await page.locator('[data-h-action=keep]').click();
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () { return new Promise(resolve => setTimeout(() => { void original.call(this).then(resolve); }, 700)); };
    });
    const importedTime = Date.UTC(2024, 3, 17, 18);
    const file = { format: 'helios-observation', version: 1, state: { ...initialState(), time: importedTime, track: 'Moon' }, clock: { restoreMode: 'live' } };
    await page.locator('#h-file').setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.clock.setFixedTime(new Date(deviceTime + 86400000));
    await expect(root(page)).toHaveAttribute('data-time', String(deviceTime + 86400000));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await expect(root(page)).toHaveAttribute('data-time', String(importedTime));
    await page.clock.setFixedTime(new Date(deviceTime + 2 * 86400000));
    await page.waitForTimeout(600);
    await expect(root(page)).toHaveAttribute('data-time', String(importedTime));
    await expect(page.locator('#h-track-select')).toHaveValue('Moon');
  });

  test('same-document share navigation takes ownership from Live and an unfinished time drag', async ({ page, baseURL }) => {
    await page.clock.setFixedTime(new Date(deviceTime)); await ready(page);
    await page.locator('[data-h-action=live]').click();
    const state = { ...initialState(), time: Date.UTC(2024, 3, 17, 18), track: 'Moon' as const };
    const url = shareURL(new URL('./projects/helios/', baseURL).href, state);
    await page.evaluate(value => { location.hash = new URL(value).hash; }, url);
    await expect(root(page)).toHaveAttribute('data-time', String(state.time));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await page.locator('[data-h-action=live]').click();
    const axis = page.locator('[data-h-time-axis]'), rect = (await axis.boundingBox())!;
    await page.mouse.move(rect.x + rect.width * .5, rect.y + 4); await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .8, rect.y + 4);
    const other = { ...state, time: Date.UTC(2024, 3, 18, 18) };
    const otherURL = shareURL(new URL('./projects/helios/', baseURL).href, other);
    await page.evaluate(value => { location.hash = new URL(value).hash; }, otherURL);
    await expect(root(page)).toHaveAttribute('data-time', String(other.time));
    await page.mouse.up(); await page.waitForTimeout(400);
    await expect(root(page)).toHaveAttribute('data-time', String(other.time));
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
    await page.evaluate(() => { location.hash = 'helios=%7Bbad-json'; });
    await expect(root(page)).toHaveAttribute('data-error', 'true');
    await expect(root(page)).toHaveAttribute('data-time', String(other.time));
  });
});
