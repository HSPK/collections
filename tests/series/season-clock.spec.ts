import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { landscapes, seasonStops } from '../../src/projects/season-clock/data';
import { makeLeaves, sampleLeaf, sampleYear, windAt, yearTime } from '../../src/projects/season-clock/timeline';

const route = './projects/season-clock/';

async function openClock(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  await expect(page.locator('.project-season-clock h1')).toHaveText('Season Clock');
  await expect(page.locator('[data-season-scene]')).toBeVisible();
}

async function scrub(page: Page, value: number) {
  await page.locator('#season-year').evaluate((element, next) => {
    (element as HTMLInputElement).value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function drawing(page: Page) {
  return page.locator('[data-season-scene]').evaluate((element) => new XMLSerializer().serializeToString(element));
}

test('the pure year repeats at its bare winter seam and crossfades coherent seasons', () => {
  expect(yearTime(1)).toBe(0);
  expect(yearTime(-0.25)).toBe(0.75);
  expect(yearTime(5.26)).toBe(0.26);
  expect(() => yearTime(Number.NaN)).toThrow('finite');
  expect(() => yearTime(Number.POSITIVE_INFINITY)).toThrow('finite');
  for (const landscape of landscapes) {
    expect(sampleYear(1, landscape)).toEqual(sampleYear(0, landscape));
    expect(sampleYear(2, landscape)).toEqual(sampleYear(0, landscape));
    expect(sampleYear(1.26, landscape)).toEqual(sampleYear(0.26, landscape));
    const winter = sampleYear(0, landscape);
    const thaw = sampleYear(0.16, landscape);
    const spring = sampleYear(0.26, landscape);
    const summer = sampleYear(0.48, landscape);
    const autumn = sampleYear(0.75, landscape);
    expect([winter.canopy, winter.blossom, winter.snow]).toEqual([0, 0, 1]);
    expect(thaw.snow).toBeGreaterThan(0);
    expect(thaw.snow).toBeLessThan(1);
    expect(spring.canopy).toBeGreaterThan(0.7);
    expect(spring.blossom).toBeGreaterThan(0.9);
    expect(spring.snow).toBe(0);
    expect([summer.canopy, summer.blossom, summer.snow]).toEqual([1, 0, 0]);
    expect(autumn.gold).toBeGreaterThan(0.9);
    expect(autumn.canopy).toBeLessThan(summer.canopy);
    expect(new Set([winter.sky, spring.sky, summer.sky, autumn.sky]).size).toBe(4);
    expect(sampleYear(0.599999, landscape).phase.season).toBe('Summer');
    expect(sampleYear(0.6, landscape).phase.season).toBe('Autumn');
    expect(sampleYear(0.86, landscape).phase.season).toBe('Winter');
    expect(sampleYear(0.1, landscape).phase.season).toBe('Spring');
    expect(sampleYear(0.99999999, landscape).sunX).toBeCloseTo(winter.sunX, 4);
    expect(windAt(1, landscape.wind)).toBe(windAt(0, landscape.wind));
    for (const [index, tree] of landscape.trees.entries()) {
      for (const leaf of makeLeaves(landscape, tree, index)) {
        expect(sampleLeaf(leaf, 0, landscape)).toEqual(sampleLeaf(leaf, 1, landscape));
        expect(sampleLeaf(leaf, 0.97, landscape).opacity).toBe(0);
      }
    }
  }
});

test('authored places retain their geometry and leaves retrace fixed release-to-ground journeys', () => {
  expect(landscapes).toHaveLength(3);
  expect(landscapes.map((place) => place.trees.length)).toEqual([1, 3, 3]);
  expect(new Set(landscapes.map((place) => place.trees[0].trunk)).size).toBe(3);
  expect(new Set(landscapes.map((place) => place.hills.join(''))).size).toBe(3);
  expect(new Set(landscapes.map((place) => place.leafShape)).size).toBe(3);
  for (const landscape of landscapes) {
    const before = JSON.stringify(landscape);
    const leaves = landscape.trees.flatMap((tree, index) => [...makeLeaves(landscape, tree, index)]);
    expect(leaves.length).toBeGreaterThanOrEqual(180);
    expect(leaves.length).toBeLessThanOrEqual(240);
    expect(new Set(leaves.map((leaf) => leaf.id)).size).toBe(leaves.length);
    expect(makeLeaves(landscape, landscape.trees[0], 0)).toEqual(makeLeaves(landscape, landscape.trees[0], 0));
    expect(leaves.some((leaf) => sampleLeaf(leaf, 0.75, landscape).falling)).toBe(true);
    for (const leaf of leaves.slice(0, 12)) {
      const atRelease = sampleLeaf(leaf, leaf.release, landscape);
      const beforeRelease = sampleLeaf(leaf, leaf.release - 0.000001, landscape);
      const halfway = sampleLeaf(leaf, leaf.release + leaf.duration / 2, landscape);
      const landing = sampleLeaf(leaf, leaf.release + leaf.duration, landscape);
      expect(atRelease.falling).toBe(true);
      expect(atRelease.x).toBeCloseTo(beforeRelease.x, 2);
      expect(atRelease.y).toBeCloseTo(beforeRelease.y, 2);
      expect(halfway.y).toBeGreaterThan(atRelease.y);
      expect(halfway.y).toBeLessThan(leaf.ground);
      expect(landing.grounded).toBe(true);
      expect(landing.y).toBe(leaf.ground);
      expect(sampleLeaf(leaf, leaf.release + leaf.duration + 0.02, landscape).x).toBe(landing.x);
      const remembered = sampleLeaf(leaf, 0.74, landscape);
      [0.97, 0.02, 0.81, 0.4, 0.99].forEach((time) => sampleLeaf(leaf, time, landscape));
      expect(sampleLeaf(leaf, 0.74, landscape)).toEqual(remembered);
    }
    expect(JSON.stringify(landscape)).toBe(before);
  }
});

test('landscapes show real seasonal states and produce the exact same scene after reverse scrubs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await openClock(page);
  const root = page.locator('.project-season-clock');
  await expect(root).toHaveAttribute('data-playback', 'paused');
  await expect(root.locator('[data-phase]')).toHaveText('Blossom days');
  const bounds = await root.locator('[data-project-preview]').boundingBox();
  expect(bounds?.y).toBeLessThan(300);
  expect(await root.locator('[data-season-scene] *').count()).toBeLessThan(800);
  await page.screenshot({ path: test.info().outputPath('season-clock-desktop.png'), fullPage: true });
  const spring = await drawing(page);
  const leafNode = await root.locator('[data-leaf]').first().elementHandle();
  await scrub(page, 750);
  await expect(root.locator('[data-season]')).toHaveText('Autumn');
  expect(await drawing(page)).not.toBe(spring);
  expect(await root.locator('[data-leaf-state="falling"]').count()).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('season-clock-autumn.png') });
  await scrub(page, 970);
  await expect(root.locator('[data-canopy]')).toHaveText('0%');
  await expect(root.locator('[data-snow]')).toHaveText('100%');
  await expect(root.locator('[data-leaf]:not([opacity="0"])')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('season-clock-winter.png') });
  await scrub(page, 260);
  expect(await drawing(page)).toBe(spring);
  expect(await leafNode?.evaluate((element) => element.isConnected)).toBe(true);
  await scrub(page, 0);
  const start = await drawing(page);
  await scrub(page, 1000);
  expect(await drawing(page)).toBe(start);
  await expect(root.locator('[data-position]')).toHaveText('100% of the year');

  const placeDrawings = new Set<string>();
  for (const place of landscapes) {
    await page.locator('#season-landscape').selectOption(place.id);
    await scrub(page, 260);
    await expect(root.locator('[data-season-scene]')).toHaveAttribute('data-season-scene', place.id);
    await expect(root.locator('[data-place-note]')).toHaveText(place.note);
    await expect(root.locator('[data-tree]')).toHaveCount(place.trees.length);
    placeDrawings.add(await drawing(page));
    await page.screenshot({ path: test.info().outputPath(`season-clock-${place.id}.png`) });
  }
  expect(placeDrawings.size).toBe(3);
  expect(errors).toEqual([]);
});

test('native controls scrub, change pace, play, pause, and restart without losing the place', async ({ page }) => {
  await openClock(page);
  const root = page.locator('.project-season-clock');
  const slider = page.getByRole('slider', { name: 'Turn the year' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('261');
  await expect(root).toHaveAttribute('data-playback', 'paused');
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('1000');
  await page.getByRole('button', { name: 'Jump to spring' }).click();
  await page.getByLabel('A place to return to').selectOption('hillside-orchard');
  await page.getByLabel('Pace', { exact: true }).selectOption('4');
  await expect(root.locator('[data-status]')).toContainText('18 seconds');
  await page.getByRole('button', { name: 'Play year', exact: true }).click();
  await expect(root).toHaveAttribute('data-playback', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-year-position'))).toBeGreaterThan(0.275);
  await page.getByRole('button', { name: 'Pause year', exact: true }).click();
  const paused = await drawing(page);
  await page.waitForTimeout(180);
  expect(await drawing(page)).toBe(paused);
  await page.getByRole('button', { name: 'Restart year' }).click();
  await expect(slider).toHaveValue('0');
  await expect(root).toHaveAttribute('data-playback', 'paused');
  await expect(page.getByLabel('A place to return to')).toHaveValue('hillside-orchard');
  await expect(page.getByLabel('Pace', { exact: true })).toHaveValue('4');
  for (const season of seasonStops) {
    const button = page.getByRole('button', { name: `Jump to ${season.name.toLowerCase()}` });
    await button.click();
    await expect(slider).toHaveValue(String(season.time * 1000));
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
});

test('SVG download is the self-contained current frame, including the selected place and falling leaves', async ({ page }) => {
  await openClock(page);
  await page.getByLabel('A place to return to').selectOption('highland-birches');
  await scrub(page, 750);
  const frame = await drawing(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save SVG still' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^season-clock-highland-birches-day-\d{3}\.svg$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString('utf8');
  expect(exported).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${frame}`);
  const result = await page.evaluate(async (content) => {
    const xml = new DOMParser().parseFromString(content, 'image/svg+xml');
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
    await image.decode();
    return {
      errors: xml.querySelectorAll('parsererror').length,
      external: xml.querySelectorAll('script, image, foreignObject, style, animate, animateTransform, [href]').length,
      leaves: xml.querySelectorAll('[data-leaf]').length,
      falling: xml.querySelectorAll('[data-leaf-state="falling"]').length,
      gradients: xml.querySelectorAll('linearGradient, radialGradient').length,
      size: [image.naturalWidth, image.naturalHeight],
    };
  }, exported);
  expect(result).toMatchObject({ errors: 0, external: 0, size: [1100, 620] });
  expect(result.leaves).toBe(210);
  expect(result.falling).toBeGreaterThan(0);
  expect(result.gradients).toBe(2);
  await expect(page.locator('[data-status]')).toContainText('nothing was uploaded');
});

test('375px layout and reduced motion keep a legible still, with explicit playback and preference-change pausing', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openClock(page);
  const root = page.locator('.project-season-clock');
  const still = await drawing(page);
  await page.waitForTimeout(180);
  expect(await drawing(page)).toBe(still);
  await expect(root.locator('[data-status]')).toContainText('reduced-motion preference');
  const scene = await root.locator('[data-project-preview]').boundingBox();
  expect(scene?.y).toBeLessThan(300);
  expect(scene?.width).toBeGreaterThan(330);
  await page.screenshot({ path: test.info().outputPath('season-clock-mobile.png'), fullPage: true });
  for (const season of seasonStops) {
    await page.getByRole('button', { name: `Jump to ${season.name.toLowerCase()}` }).click();
    await expect(root.locator('[data-season]')).toHaveText(season.name);
    await expect(root).toHaveAttribute('data-playback', 'paused');
  }
  await page.getByRole('button', { name: 'Jump to spring' }).click();
  for (const place of landscapes) {
    await page.getByLabel('A place to return to').selectOption(place.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect((await page.getByLabel('A place to return to').boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  for (const button of await root.locator('.season-jumps button, .season-transport button').all()) {
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Play year', exact: true }).click();
  await expect(root).toHaveAttribute('data-playback', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-year-position'))).toBeGreaterThan(0.261);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-playback', 'paused');
  await page.getByRole('button', { name: 'Play year', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-playback', 'paused');
});

test('abort and repeated destroy stop the loop and all detached controls', async ({ page }) => {
  await openClock(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(80);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/season-clock/index.ts';
    const { mount } = await import(/* @vite-ignore */ modulePath);
    const container = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(container);
    const controller = new AbortController();
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set<number>();
    let mutations = 0;
    let reports = 0;
    let observer: MutationObserver | undefined;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = originalRequest((time) => { pending.delete(id); callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => { pending.delete(id); originalCancel(id); };
    try {
      const instance = mount({ container, controls, signal: controller.signal, reducedMotion: false, report: () => { reports += 1; } });
      const svg = container.querySelector('[data-season-scene]')!;
      const play = container.querySelector<HTMLButtonElement>('[data-play]')!;
      const status = container.querySelector<HTMLElement>('[data-status]')!;
      observer = new MutationObserver(() => { mutations += 1; });
      observer.observe(svg, { attributes: true, subtree: true });
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const animated = mutations > 0;
      controller.abort();
      instance.destroy();
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      mutations = 0;
      const beforeReports = reports;
      const beforeStatus = status.textContent;
      play.click();
      instance.setPaused(false);
      instance.reset();
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      return {
        animated,
        removed: !svg.isConnected && container.childElementCount === 0,
        pending: pending.size,
        mutations,
        detachedReports: reports - beforeReports,
        statusUnchanged: status.textContent === beforeStatus,
      };
    } finally {
      controller.abort();
      observer?.disconnect();
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
      container.remove();
    }
  });
  expect(result).toEqual({ animated: true, removed: true, pending: 0, mutations: 0, detachedReports: 0, statusUnchanged: true });
});
