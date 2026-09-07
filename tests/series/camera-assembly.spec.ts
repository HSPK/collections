import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ProjectContext, ProjectInstance } from '../../src/core/types';
import { CHAPTERS, DURATION, EXPLODED_FRAME, PARTS } from '../../src/projects/camera-assembly/data';
import { assemblyFrame, chapterAt, easeBetween, normaliseProgress, partPose } from '../../src/projects/camera-assembly/timeline';

test('camera timeline has exact separated and assembled endpoints for every component', () => {
  expect(PARTS).toHaveLength(9);
  expect(new Set(PARTS.map((part) => part.id)).size).toBe(9);
  for (const part of PARTS) {
    expect(partPose(part, 0), part.id).toEqual({ position: part.exploded, rotation: part.rotation, settled: 0 });
    expect(partPose(part, part.start), part.id).toEqual(partPose(part, 0));
    expect(partPose(part, 1), part.id).toEqual({ position: part.assembled, rotation: [0, 0, 0], settled: 1 });
    expect(partPose(part, part.end), part.id).toEqual(partPose(part, 1));
    expect(partPose(part, (part.start + part.end) / 2).settled).toBeCloseTo(0.5, 12);
  }
  expect(assemblyFrame(-1)).toEqual(assemblyFrame(0));
  expect(assemblyFrame(10)).toEqual(assemblyFrame(1));
  for (const value of [NaN, Infinity, -Infinity]) expect(() => normaliseProgress(value)).toThrow(RangeError);
  expect(() => easeBetween(0.5, 1, 0)).toThrow(RangeError);
  expect(() => easeBetween(0.5, 0, Infinity)).toThrow(RangeError);
});

test('camera choreography stages overlap deliberately and reverse scrubbing is history-free', () => {
  const original = JSON.stringify(PARTS);
  expect(DURATION).toBe(22);
  for (let i = 1; i < PARTS.length; i++) {
    expect(PARTS[i].start).toBeGreaterThan(PARTS[i - 1].start);
    expect(PARTS[i].end).toBeGreaterThan(PARTS[i - 1].end);
  }
  const skeleton = assemblyFrame(0.22);
  expect(skeleton.parts.frame.settled).toBe(1);
  expect(skeleton.parts.film.settled).toBeGreaterThan(0);
  expect(skeleton.parts.housing.settled).toBe(0);
  const body = assemblyFrame(0.56);
  for (const id of ['frame', 'film', 'housing', 'back', 'face'] as const) expect(body.parts[id].settled).toBe(1);
  expect(body.parts.barrel.settled).toBeGreaterThan(0);
  expect(body.parts.shutter.settled).toBe(0);
  const lens = assemblyFrame(0.86);
  expect(lens.parts.glass.settled).toBe(1);
  expect(lens.parts.controls.settled).toBeLessThan(1);
  expect(lens.print.visible).toBe(false);
  expect(assemblyFrame(0.91).print).toMatchObject({ visible: false, revealed: 0 });
  expect(assemblyFrame(1).print).toMatchObject({ visible: true, revealed: 1, position: [0, -2.03, 1.25] });
  CHAPTERS.forEach((chapter, i) => expect(chapterAt(chapter.start)).toBe(i));
  expect(chapterAt(1)).toBe(CHAPTERS.length - 1);
  const frames = Array.from({ length: 101 }, (_, i) => assemblyFrame(i / 100));
  for (let i = frames.length - 1; i >= 0; i--) expect(assemblyFrame(i / 100)).toEqual(frames[i]);
  expect(JSON.stringify(PARTS)).toBe(original);
});

async function openExhibit(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  // Software WebGL in CI can spend several seconds on each real frame-dependent interaction.
  test.setTimeout(90_000);
  // Concurrent sibling edits must not replace this test's page through Vite HMR.
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\//, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type"\s*:\s*"(?:update|full-reload)"/.test(message)) return;
      socket.send(message);
    });
  });
  await page.emulateMedia({ reducedMotion });
  await page.goto('./projects/camera-assembly/');
  await expect(page.locator('.project-camera-assembly canvas')).toBeVisible();
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  return page.locator('.project-camera-assembly');
}

async function scrub(page: Page, progress: number) {
  await page.getByRole('slider', { name: 'Assembly progress' }).evaluate((element, value) => {
    (element as HTMLInputElement).value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress * 1000);
}

async function renderedFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test('camera browser controls scrub, inspect all groups, and orbit while paused', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const root = await openExhibit(page);
  const canvas = root.locator('canvas');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root).toHaveAttribute('data-progress', EXPLODED_FRAME.toFixed(5));
  await scrub(page, 0.72);
  await expect(root).toHaveAttribute('data-progress', '0.72000');
  await root.getByRole('button', { name: 'Stages & notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jump to lens stage' })).toHaveAttribute('aria-current', 'step');
  await root.getByRole('button', { name: 'Close Stages & notes', exact: true }).click();

  await page.getByRole('button', { name: 'Rear', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-view', 'rear');
  const rear = await canvas.getAttribute('data-camera');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-view', 'custom');
  expect(await canvas.getAttribute('data-camera')).not.toBe(rear);
  const rotated = await canvas.getAttribute('data-camera');
  await page.keyboard.press('+');
  expect(await canvas.getAttribute('data-camera')).not.toBe(rotated);
  await expect(root).toHaveAttribute('data-progress', '0.72000');
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-view', 'top');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-view', 'front');
  await page.getByRole('button', { name: 'Three-quarter', exact: true }).click();

  await root.getByRole('button', { name: 'Inspect parts', exact: true }).click();
  for (const part of PARTS) {
    const button = page.getByRole('button', { name: `Inspect ${part.name.toLowerCase()}`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-selected', part.id);
    await expect(root.locator('[data-ca-part-title]')).toHaveText(`${part.number} / ${part.name}`);
    await expect(root.locator('[data-ca-part-description]')).toHaveText(part.description);
    await expect(root).toHaveAttribute('data-progress', EXPLODED_FRAME.toFixed(5));
  }
  await page.getByRole('button', { name: 'Clear highlight' }).click();
  await expect(canvas).toHaveAttribute('data-selected', '');
  await expect(root.locator('[data-ca-part][aria-pressed="true"]')).toHaveCount(0);
  await root.getByRole('button', { name: 'Close Camera parts inspector', exact: true }).click();

  await scrub(page, 0.72);
  const pose = await canvas.screenshot();
  await scrub(page, 0.24);
  await scrub(page, 0.72);
  await renderedFrames(page);
  const repeatedPose = await canvas.screenshot();
  if (!repeatedPose.equals(pose)) {
    await testInfo.attach('camera-first-pose', { body: pose, contentType: 'image/png' });
    await testInfo.attach('camera-repeated-pose', { body: repeatedPose, contentType: 'image/png' });
  }
  expect(repeatedPose.equals(pose), 'Revisiting a paused timeline position must preserve the exact rendered pose.').toBe(true);
  await root.getByRole('button', { name: 'Stages & notes', exact: true }).click();
  await page.getByRole('button', { name: 'Jump to print stage' }).click();
  await expect(root).toHaveAttribute('data-progress', '1.00000');
  await expect(canvas).toHaveAttribute('data-print', 'visible');
  await expect(root.locator('[data-ca-phase-title]')).toHaveText('Keep a little light.');
  await root.getByRole('button', { name: 'Close Stages & notes', exact: true }).click();
  await renderedFrames(page);
  await page.screenshot({ path: testInfo.outputPath('camera-assembly-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('camera playback, replay, speed, and native keyboard controls are connected', async ({ page }) => {
  const root = await openExhibit(page);
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('2');
  await page.getByRole('button', { name: 'Play assembly' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await expect.poll(async () => Number(await root.getAttribute('data-progress'))).toBeGreaterThan(EXPLODED_FRAME + 0.005);
  await page.getByRole('button', { name: 'Pause assembly' }).click();
  const stopped = await root.getAttribute('data-progress');
  await renderedFrames(page);
  await expect(root).toHaveAttribute('data-progress', stopped!);
  const slider = page.getByRole('slider', { name: 'Assembly progress' });
  await slider.focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.keyboard.press('Home');
  await expect(root).toHaveAttribute('data-progress', '0.00000');
  await root.locator('canvas').focus();
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.keyboard.press('Space');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('0.5');
  await scrub(page, 0.995);
  await page.getByRole('button', { name: 'Play assembly' }).click();
  await expect(root).toHaveAttribute('data-progress', '1.00000');
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-ca-status]')).toContainText('Assembled.');
  await expect(root.locator('canvas')).toHaveAttribute('data-print', 'visible');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  expect(Number(await root.getAttribute('data-progress'))).toBeLessThan(0.1);
  await page.getByRole('button', { name: 'Pause assembly' }).click();
});

test('camera reduced-motion changes pause without locking the view or starting again', async ({ page }) => {
  const root = await openExhibit(page, 'no-preference');
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  const stopped = await root.getAttribute('data-progress');
  await renderedFrames(page);
  await expect(root).toHaveAttribute('data-progress', stopped!);
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(root).toHaveAttribute('data-view', 'front');
  await page.getByRole('button', { name: 'Play assembly' }).click();
  await expect(root).toHaveAttribute('data-motion', 'playing');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root).toHaveAttribute('data-motion', 'paused');
  await expect(root.locator('[data-ca-status]')).toContainText('Press Play');
});

test('camera 375px layout keeps the scene near the top and all controls in bounds', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const root = await openExhibit(page);
  const bounds = await root.locator('canvas').boundingBox();
  expect(bounds!.y).toBeLessThan(240);
  expect(bounds!.height).toBeGreaterThan(390);
  const layout = await root.evaluate((element) => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    outside: Array.from(element.querySelectorAll('button, select, input')).filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > window.innerWidth + 1);
    }).map((control) => control.textContent),
    smallTargets: Array.from(element.querySelectorAll('button, select, input')).filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height < 44;
    }).map((control) => control.textContent),
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(layout.outside).toEqual([]);
  expect(layout.smallTargets).toEqual([]);
  await renderedFrames(page);
  await page.screenshot({ path: testInfo.outputPath('camera-assembly-mobile.png'), fullPage: true });
  await root.getByRole('button', { name: 'Inspect parts', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect housing', exact: true }).click();
  await expect(root.locator('[data-ca-part-title]')).toHaveText('03 / Housing');
  await root.getByRole('button', { name: 'Close Camera parts inspector', exact: true }).click();
  await scrub(page, 0.5);
  await expect(root).toHaveAttribute('data-progress', '0.50000');
});

test('camera isolated mount abort disposes WebGL resources and removes its DOM', async ({ page }) => {
  await openExhibit(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/projects/camera-assembly/index.ts';
    const { mount } = await import(/* @vite-ignore */ modulePath) as {
      mount: (context: ProjectContext) => ProjectInstance;
    };
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;top:0;left:0;width:720px;';
    const controls = document.createElement('div');
    const controller = new AbortController();
    const reports: string[] = [];
    document.body.append(host);
    const instance = mount({
      container: host, controls, signal: controller.signal,
      reducedMotion: true, report: (message) => reports.push(message),
    });
    const canvas = host.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2')!;
    let buffers = 0;
    let textures = 0;
    let programs = 0;
    const deleteBuffer = gl.deleteBuffer.bind(gl);
    const deleteTexture = gl.deleteTexture.bind(gl);
    const deleteProgram = gl.deleteProgram.bind(gl);
    gl.deleteBuffer = (buffer) => { buffers++; deleteBuffer(buffer); };
    gl.deleteTexture = (texture) => { textures++; deleteTexture(texture); };
    gl.deleteProgram = (program) => { programs++; deleteProgram(program); };
    const slider = host.querySelector<HTMLInputElement>('[data-ca-progress]')!;
    slider.value = '1000';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const rendered = canvas.width > 1 && gl.getParameter(gl.CURRENT_PROGRAM) !== null;
    const reported = host.querySelector('[data-ca-status]')!.textContent!.length > 0;
    controller.abort();
    instance.destroy();
    instance.destroy();
    instance.setPaused?.(false);
    instance.reset?.();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const state = {
      rendered, buffers, textures, programs, contextLost: gl.isContextLost(),
      children: host.childElementCount, controls: controls.childElementCount,
      canvasConnected: canvas.isConnected, reported, graphicsMessages: reports,
    };
    host.remove();
    return state;
  });
  expect(result.rendered).toBe(true);
  expect(result.buffers).toBeGreaterThan(20);
  expect(result.textures).toBeGreaterThan(3);
  expect(result.programs).toBeGreaterThan(0);
  expect(result.contextLost).toBe(true);
  expect(result.children).toBe(0);
  expect(result.controls).toBe(0);
  expect(result.canvasConnected).toBe(false);
  expect(result.reported).toBe(true);
  expect(result.graphicsMessages).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
]) {
  test(`camera workspace: ${viewport.width}x${viewport.height} preserves view, transport, and inspection`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const root = await openExhibit(page);
    await expect(root).toHaveAttribute('data-workspace', 'true');
    const canvas = root.locator('canvas');
    const assertFits = async () => {
      expect(await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }))).toEqual({ width: viewport.width, height: viewport.height, x: 0, y: 0 });
    };
    await assertFits();
    expect(await root.evaluate(element => getComputedStyle(element).overflowY)).not.toMatch(/hidden|clip/);
    for (const selector of ['canvas', '[data-ca-play]', '[data-ca-replay]', '[data-ca-speed]', '[data-ca-progress]', '[data-ca-open-parts]', '[data-ca-open-notes]']) {
      const bounds = (await root.locator(selector).boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    for (const button of await root.locator('button:visible, select:visible').all()) {
      expect(await button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return [bounds.left + 4, bounds.left + bounds.width / 2, bounds.right - 4]
          .every(x => element.contains(document.elementFromPoint(x, bounds.y + bounds.height / 2)));
      })).toBe(true);
    }
    const slider = root.getByRole('slider', { name: 'Assembly progress' });
    await slider.focus();
    await slider.press('End');
    await expect(canvas).toHaveAttribute('data-print', 'visible');
    await slider.press('Home');
    await expect(canvas).toHaveAttribute('data-print', 'hidden');
    await root.getByRole('button', { name: 'Rear', exact: true }).click();
    const rear = await canvas.getAttribute('data-camera');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, { steps: 4 });
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-view', 'custom');
    expect(await canvas.getAttribute('data-camera')).not.toBe(rear);
    await root.getByRole('button', { name: 'Inspect parts', exact: true }).click();
    await root.getByRole('button', { name: 'Inspect housing', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-selected', 'housing');
    await expect(root).toHaveAttribute('data-progress', EXPLODED_FRAME.toFixed(5));
    await assertFits();
    await page.screenshot({ path: testInfo.outputPath('camera-workspace-parts.png') });
    await page.keyboard.press('Escape');
    await expect(root.getByRole('button', { name: 'Inspect parts', exact: true })).toBeFocused();
    await root.getByRole('button', { name: 'Stages & notes', exact: true }).click();
    await root.getByRole('button', { name: 'Jump to print stage', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-print', 'visible');
    await expect(root.getByRole('dialog', { name: 'Stages & notes' })).toContainText('Original geometry');
    await assertFits();
    await page.keyboard.press('Escape');
    await root.getByRole('button', { name: 'Three-quarter', exact: true }).click();
    await assertFits();
    await renderedFrames(page);
    await page.screenshot({ path: testInfo.outputPath('camera-workspace.png') });
    const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width, height: element.height,
      displayWidth: element.clientWidth, displayHeight: element.clientHeight,
    }));
    const pixelRatio = size.width / size.displayWidth;
    expect(Math.abs(size.height - size.displayHeight * pixelRatio)).toBeLessThanOrEqual(2);
    if (viewport.width === 375) {
      const camera = await canvas.getAttribute('data-camera');
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeGreaterThan(size.width);
      await expect(canvas).toHaveAttribute('data-selected', 'housing');
      await expect(canvas).toHaveAttribute('data-camera', camera!);
      await expect(canvas).toHaveAttribute('data-progress', '1.00000');
      await page.setViewportSize(viewport);
      await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBe(size.width);
      await assertFits();
    }
  });
}
