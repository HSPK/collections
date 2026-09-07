import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { observe } from '../../src/projects/helios/astronomy';
import type { Observation } from '../../src/projects/helios/astronomy';
import { BODIES, SITES } from '../../src/projects/helios/data';
import type { StudyState } from '../../src/projects/helios/state';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test.setTimeout(90_000);
const root = (page: Page) => page.locator('.project-helios');
const canvas = (page: Page) => page.locator('[data-h-host] canvas');
const visibility = { above: 'Above horizon', horizon: 'Horizon crossing', below: 'Below horizon' };
const degrees = (value: number) => `${value < 0 ? '' : '+'}${value.toFixed(2)}°`;

async function ready(page: Page) {
  await page.goto('./projects/helios/');
  await expect(root(page)).toHaveAttribute('data-ready', 'true');
}
async function paint(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function record(page: Page): Promise<{ state: StudyState; computed: Observation }> {
  await page.locator('[data-h-action=keep]').click();
  const saved = JSON.parse(await page.locator('#h-record').inputValue());
  await page.getByRole('button', { name: 'Close observation record', exact: true }).click();
  return saved;
}
async function cameraDistance(page: Page) {
  return canvas(page).evaluate(element => {
    const camera = JSON.parse(element.getAttribute('data-camera')!);
    const target = JSON.parse(element.getAttribute('data-target')!);
    return Math.hypot(camera.x - target.x, camera.y - target.y, camera.z - target.z);
  });
}

for (const view of ['system', 'planet', 'sky'] as const) {
  test(`HELIOS ${view}: real mouse-wheel zoom preserves physical observation and held UTC`, async ({ page }) => {
    await ready(page);
    await page.locator(`[data-h-view=${view}]`).click();
    if (view === 'planet') await page.locator('#h-body').selectOption('Saturn');
    await expect(canvas(page)).toHaveAttribute('data-view', view);
    await paint(page);
    const before = await record(page);
    const distance = await cameraDistance(page);
    const image = await canvas(page).screenshot();
    const bounds = (await canvas(page).boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * .62, bounds.y + bounds.height * .46);
    await page.mouse.wheel(0, -120);
    if (view === 'sky') {
      await expect.poll(async () => Number(await page.locator('#h-fov').inputValue())).toBeLessThan(before.state.fov);
    } else {
      await expect.poll(() => cameraDistance(page)).toBeLessThan(distance);
    }
    await paint(page);
    expect((await canvas(page).screenshot()).equals(image)).toBe(false);
    const after = await record(page);
    expect(after.state.time).toBe(before.state.time);
    expect(after.state.site).toEqual(before.state.site);
    expect(after.computed).toEqual(before.computed);
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
    await expect(root(page)).toHaveAttribute('data-clock-mode', 'manual');
  });
}

test('HELIOS wheel units are normalized and browser zoom modifiers remain available', async ({ page }) => {
  await ready(page);
  await page.locator('[data-h-view=system]').click();
  await expect(canvas(page)).toHaveAttribute('data-view', 'system');
  const initial = await cameraDistance(page);
  const linePrevented = await canvas(page).evaluate(element => {
    const event = new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(linePrevented).toBe(true);
  await expect.poll(() => cameraDistance(page)).toBeCloseTo(initial * Math.exp(-48 * .0015), 8);
  const before = await record(page);
  const modifiers = await canvas(page).evaluate(element => [true, false].map(ctrl => {
    const event = new WheelEvent('wheel', { deltaY: -120, ctrlKey: ctrl, metaKey: !ctrl, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(modifiers).toEqual([false, false]);
  expect((await record(page)).state).toEqual(before.state);
});

test('Beijing and Shanghai have distinct live observers and explicit Sun and Moon altitudes', async ({ page }) => {
  const day = Date.UTC(2026, 8, 7, 4);
  await page.clock.setFixedTime(new Date(day));
  await ready(page);
  await page.locator('[data-h-action=live]').click();
  for (const name of ['Beijing, China', 'Shanghai, China']) {
    const site = SITES.find(candidate => candidate.name === name);
    expect(site).toBeDefined();
    if (!site) throw new Error(`Missing observer ${name}`);
    await page.locator('#h-site').selectOption({ label: name });
    await expect(page.locator('[data-h-status]')).toContainText('0 m reference height');
    for (const time of [day, day + 12 * 3600000]) {
      await page.clock.setFixedTime(new Date(time));
      await expect(root(page)).toHaveAttribute('data-time', String(time));
      const expected = observe(time, site);
      for (const body of ['sun', 'moon'] as const) {
        await expect(page.locator(`[data-h-${body}-altitude]`)).toHaveText(degrees(expected[body].altitude));
        await expect(page.locator(`[data-h-${body}-visibility]`)).toHaveText(visibility[expected[body].visibility]);
        await expect(page.locator(`[data-h-${body}-altitude]`)).toBeVisible();
      }
      await page.locator('#h-track-select').selectOption('Moon');
      await expect(page.locator('[data-h-sun-altitude]')).toBeVisible();
      await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
      const saved = await record(page);
      expect(saved.state.site).toEqual(site);
      expect(saved.computed.sun.altitude).toBeCloseTo(expected.sun.altitude, 10);
      expect(saved.computed.moon.altitude).toBeCloseTo(expected.moon.altitude, 10);
    }
  }
});

test('HELIOS distinguishes horizon-crossing disks from fully hidden bodies', async ({ page }) => {
  const time = Date.UTC(2014, 3, 29, 7, 12);
  await page.clock.setFixedTime(new Date(time));
  await ready(page);
  await page.locator('#h-site').selectOption({ label: 'Sydney, Australia' });
  await page.locator('[data-h-action=now]').click();
  const expected = observe(time, SITES[6]);
  expect(expected.sun.visibility).toBe('horizon');
  await expect(page.locator('[data-h-sun-altitude]')).toHaveText(degrees(expected.sun.altitude));
  await expect(page.locator('[data-h-sun-visibility]')).toHaveText('Horizon crossing');
  await page.clock.setFixedTime(new Date(Date.UTC(2014, 3, 29, 7, 15, 3)));
  await page.locator('[data-h-action=now]').click();
  await expect(page.locator('[data-h-sun-visibility]')).toHaveText('Below horizon');
  await expect(page.locator('[data-h-sun-altitude]')).toHaveText(/^-/);
});

test('HELIOS uses one active instrument navigation and truthful view-specific scale labels', async ({ page }, info) => {
  await ready(page);
  expect(BODIES.find(body => body.name === 'Sun')!.displayRadius / BODIES.find(body => body.name === 'Earth')!.displayRadius).toBeLessThan(4);
  expect(BODIES.find(body => body.name === 'Sun')!.radiusKm / BODIES.find(body => body.name === 'Earth')!.radiusKm).toBeGreaterThan(100);
  await expect(page.locator('.h-history-launch, .h-frame-label, [data-h-track], [data-h-camera]')).toHaveCount(0);
  for (const size of [{ width: 1440, height: 900 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.locator('[data-h-view=sky]').click();
    await expect(page.locator('[data-h-kicker]')).toHaveText('True angular sky');
    await expect(page.locator('[data-h-sun-altitude]')).toBeVisible();
    await expect(page.locator('[data-h-moon-altitude]')).toBeVisible();
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]))
      .toEqual([size.width, size.height]);
    if (size.width >= 1000 && size.height >= 600) {
      await expect(page.locator('.h-instrument-launchers')).not.toBeVisible();
      await expect(page.locator('.h-dock-tabs')).toBeVisible();
    } else {
      await expect(page.locator('.h-instrument-launchers')).toBeVisible();
      await page.locator('[data-h-open=moon]').click();
      await expect(page.locator('.h-instrument-launchers')).not.toBeVisible();
      await expect(page.locator('.h-dock-tabs')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.h-instrument-launchers')).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath(`helios-altitudes-${size.width}x${size.height}.png`) });
    await page.locator('[data-h-view=system]').click();
    await expect(page.locator('[data-h-kicker]')).toHaveText('Schematic · not to scale');
    await expect(page.locator('#h-camera-select')).not.toBeVisible();
    await page.locator('[data-h-view=planet]').click();
    await expect(page.locator('#h-camera-select')).toBeVisible();
    await expect(page.locator('[data-h-kicker]')).toHaveText('Body-centered reference');
    await page.locator('#h-camera-select').selectOption('ride');
    await expect(page.locator('[data-h-kicker]')).toHaveText('Schematic · not to scale');
    await page.locator('#h-camera-select').selectOption('orbit');
  }
});

test('HELIOS camera bursts retain timeline nodes and unchanged physical readouts', async ({ page }) => {
  await ready(page);
  await page.locator('[data-h-view=system]').click();
  await expect(canvas(page)).toHaveAttribute('data-view', 'system');
  const before = await record(page);
  const result = await canvas(page).evaluate(element => {
    const ticks = document.querySelector('[data-h-time-ticks]')!;
    const measures = document.querySelector('.h-measure-strip')!;
    const firstTick = ticks.firstChild;
    const tickObserver = new MutationObserver(() => {}), measureObserver = new MutationObserver(() => {});
    tickObserver.observe(ticks, { childList: true, subtree: true, characterData: true });
    measureObserver.observe(measures, { childList: true, subtree: true, characterData: true });
    for (let i = 0; i < 100; i++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    const result = { retained: ticks.firstChild === firstTick, tickMutations: tickObserver.takeRecords().length, measureMutations: measureObserver.takeRecords().length };
    tickObserver.disconnect(); measureObserver.disconnect();
    return result;
  });
  expect(result).toEqual({ retained: true, tickMutations: 0, measureMutations: 0 });
  const after = await record(page);
  expect(after.computed).toEqual(before.computed);
  expect(after.state.orbitYaw).not.toBe(before.state.orbitYaw);
  await page.locator('[data-h-action=step-forward]').click();
  const advanced = await record(page);
  expect(advanced.computed.time).toBe(before.computed.time + 60000);
  expect(advanced.computed.sun.altitude).not.toBe(before.computed.sun.altitude);
});

test('HELIOS Live camera edits do not bypass the bounded device-clock sampler', async ({ page }) => {
  const now = Date.UTC(2026, 8, 7, 4);
  await page.clock.setFixedTime(new Date(now));
  await ready(page);
  await page.locator('[data-h-view=system]').click();
  await page.locator('[data-h-action=live]').click();
  await expect(root(page)).toHaveAttribute('data-time', String(now));
  const reads = await canvas(page).evaluate(element => {
    const original = Date.now;
    let reads = 0;
    Date.now = () => { reads++; return original(); };
    try {
      for (let i = 0; i < 100; i++) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    } finally { Date.now = original; }
    return reads;
  });
  expect(reads).toBe(0);
  await expect(root(page)).toHaveAttribute('data-clock-mode', 'live');
  await page.clock.setFixedTime(new Date(now + 3600000));
  await expect(root(page)).toHaveAttribute('data-time', String(now + 3600000));
});

for (const view of ['system', 'planet'] as const) {
  test(`HELIOS fresh ${view} share links open the matching Details instrument`, async ({ page }) => {
    await ready(page);
    await page.locator(`[data-h-view=${view}]`).click();
    await page.locator('#h-body').selectOption('Mars');
    await page.locator('[data-h-action=keep]').click();
    const link = await page.locator('#h-share').inputValue();
    const fresh = await page.context().newPage();
    try {
      await fresh.goto(link);
      await expect(root(fresh)).toHaveAttribute('data-ready', 'true');
      await expect(canvas(fresh)).toHaveAttribute('data-view', view);
      await expect(fresh.locator('#h-body')).toHaveValue('Mars');
      await expect(root(fresh)).toHaveAttribute('data-instrument', 'observer');
      await expect(fresh.locator('[data-h-instrument=observer]')).toBeVisible();
      await expect(fresh.locator('[data-h-instrument=eclipse]')).not.toBeVisible();
      await expect(fresh.locator('[data-h-panel=observer]')).toHaveAttribute('aria-pressed', 'true');
      await fresh.locator('[data-h-view=sky]').click();
      await expect(root(fresh)).toHaveAttribute('data-instrument', 'eclipse');
      await expect(fresh.locator('[data-h-instrument=eclipse]')).toBeVisible();
      await expect(root(fresh)).toHaveAttribute('data-clock-mode', 'manual');
    } finally { await fresh.close(); }
  });
}

test('HELIOS historical marker stays bounded and aligned before resize callbacks arrive', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (document.documentElement.dataset.holdAxisResize === 'true' &&
              entries.some(entry => entry.target.hasAttribute('data-h-time-axis'))) return;
          callback(entries, observer);
        });
      }
    };
  });
  await ready(page);
  const baseline = Number(await root(page).getAttribute('data-time'));
  for (const offset of [0, 168 * 60000, -168 * 60000]) {
    await page.evaluate(() => { delete document.documentElement.dataset.holdAxisResize; });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('.h-time-readout').click();
    await page.locator('#h-utc').fill(new Date(baseline + offset).toISOString().slice(0, 19));
    await page.locator('[data-h-action=set-time]').click();
    await paint(page);
    await page.evaluate(() => { document.documentElement.dataset.holdAxisResize = 'true'; });
    for (const size of [{ width: 375, height: 812 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const geometry = await page.evaluate(peak => {
        const axis = document.querySelector<HTMLElement>('[data-h-time-axis]')!;
        const label = document.querySelector<HTMLElement>('[data-h-axis-history]')!;
        const track = axis.getBoundingClientRect(), marker = label.getBoundingClientRect();
        const ratio = (peak - Number(axis.dataset.start)) / (Number(axis.dataset.end) - Number(axis.dataset.start));
        const tick = marker.left + parseFloat(getComputedStyle(label, '::before').left);
        return {
          width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          left: marker.left, right: marker.right, minX: track.left, maxX: track.right,
          tick, expectedTick: track.left + axis.clientLeft + axis.clientWidth * ratio,
        };
      }, baseline);
      expect(geometry.width).toBe(size.width);
      expect(geometry.height).toBe(size.height);
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.minX);
      expect(geometry.right).toBeLessThanOrEqual(geometry.maxX);
      expect(Math.abs(geometry.tick - geometry.expectedTick)).toBeLessThan(1);
    }
  }
});
