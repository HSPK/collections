import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FixedStepClock } from '../src/core/phaser/clock';

test('fixed simulation steps preserve cadence and bound long-frame work without skipping ticks', () => {
  const clock = new FixedStepClock(20, 5);
  let ticks = 0;
  for (let index = 0; index < 10; index++) clock.advance(10, () => ticks++);
  expect(ticks).toBe(5);
  expect(clock.advance(5000, () => ticks++)).toBe(5);
  expect(ticks).toBe(10);
  clock.advance(15, () => ticks++);
  clock.reset();
  expect(clock.advance(10, () => ticks++)).toBe(0);
  expect(() => clock.advance(NaN, () => ticks++)).toThrow('duration');
  expect(() => new FixedStepClock(0)).toThrow('step');
  expect(() => new FixedStepClock(20, .5)).toThrow('budget');
});

async function fixture(page: Page, renderer: 'auto' | 'canvas' = 'auto', navigate = true) {
  if (navigate) await page.goto('./');
  await page.evaluate(async mode => {
    const stagePath = '/src/core/phaser/stage.ts';
    const pagePath = '/src/core/page.ts';
    const workspacePath = '/src/core/workspace.ts';
    const { createPhaserStage }: typeof import('../src/core/phaser/stage') = await import(stagePath);
    const { createProjectPage, query }: typeof import('../src/core/page') = await import(pagePath);
    const { createWorkspaceDialog }: typeof import('../src/core/workspace') = await import(workspacePath);
    const page = createProjectPage({
      container: document.body, controls: document.createElement('div'), reducedMotion: false,
      signal: new AbortController().signal, report: message => { page.root.dataset.reported = message; },
    }, 'phaser-fixture');
    page.root.style.cssText = 'position:fixed;inset:0;z-index:100;background:#18222b;color:white;display:grid;grid-template-rows:60px minmax(0,1fr) 90px;padding:16px;gap:8px';
    page.root.innerHTML = '<h1>Phaser fixture</h1><div data-phaser-host></div><div><button data-pause>Pause</button><button data-resume>Resume</button><button data-help>Help</button><button data-remove>Remove</button><output data-clicks>0</output></div>';
    const content = document.createElement('p');
    content.textContent = 'The simulation and Phaser tweens should pause while this dialog owns focus.';
    createWorkspaceDialog(page, { id: 'phaser-fixture-help', title: 'Phaser help', content: [content], triggers: [query(page.root, '[data-help]')] });
    const stage = await createPhaserStage(page, {
      host: query(page.root, '[data-phaser-host]'), label: 'Interactive Phaser fixture', renderer: mode,
      width: 640, height: 400,
      create(scene, runtime) {
        const token = scene.add.rectangle(320, 200, 100, 80, 0xdbc466).setInteractive();
        scene.add.text(20, 20, 'PHASER / FIXED WORLD', { fontSize: '20px', color: '#ffffff' });
        let clicks = 0, ticks = 0;
        token.on('pointerdown', () => {
          if (runtime.canInteract()) query(page.root, '[data-clicks]').textContent = String(++clicks);
        });
        scene.tweens.add({ targets: token, alpha: .4, duration: 400, yoyo: true, repeat: -1 });
        return {
          update() { ticks++; page.root.dataset.ticks = String(ticks); },
          motionChanged(reduced) { page.root.dataset.reduced = String(reduced); },
          pauseChanged(paused) { page.root.dataset.paused = String(paused); },
          destroy() { page.root.dataset.cleaned = 'true'; },
        };
      },
    });
    query(page.root, '[data-pause]').addEventListener('click', () => stage.setPaused(true), { signal: page.signal });
    query(page.root, '[data-resume]').addEventListener('click', () => stage.setPaused(false), { signal: page.signal });
    query(page.root, '[data-remove]').addEventListener('click', () => page.destroy(), { signal: page.signal });
    page.root.addEventListener('metrics', () => { page.root.dataset.metrics = JSON.stringify(stage.metrics()); }, { signal: page.signal });
    page.root.addEventListener('add-nested', () => {
      stage.scene.add.container(30, 80, [
        stage.scene.add.circle(0, 0, 8, 0xffffff),
        stage.scene.add.circle(20, 0, 8, 0xdbc466),
      ]);
    }, { signal: page.signal });
    page.root.addEventListener('destroy-stage', () => stage.destroy(), { signal: page.signal });
    page.root.dataset.ready = 'true';
  }, renderer);
  await expect(page.locator('.project-phaser-fixture')).toHaveAttribute('data-ready', 'true');
}

for (const renderer of ['auto', 'canvas'] as const) {
  test(`Phaser ${renderer} renderer builds real objects, maps pointer coordinates after resize, and disposes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await fixture(page, renderer);
    const root = page.locator('.project-phaser-fixture');
    const canvas = root.getByRole('img', { name: 'Interactive Phaser fixture', exact: true });
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 900, height: 700 }]) {
      await page.setViewportSize(size);
      await expect.poll(async () => {
        const box = (await canvas.boundingBox())!;
        return box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height;
      }).toBe(true);
      const before = Number(await root.locator('[data-clicks]').innerText());
      const bounds = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
      await expect(root.locator('[data-clicks]')).toHaveText(String(before + 1));
    }
    await root.dispatchEvent('metrics');
    const metrics = JSON.parse((await root.getAttribute('data-metrics'))!);
    expect(metrics.objects).toBe(2);
    expect(metrics.textures).toBeLessThanOrEqual(5);
    expect(metrics.tweens).toBe(1);
    await root.dispatchEvent('destroy-stage');
    await expect(root.locator('[data-phaser-host]')).toHaveAttribute('data-phaser-destroyed', 'true');
    await expect(canvas).toHaveCount(0);
    await expect(root).toHaveAttribute('data-cleaned', 'true');
    await page.locator('.project-phaser-fixture').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(root).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('Phaser explicit pause, native modal pause and reduced-motion changes retain one simulation owner', async ({ page }) => {
  await fixture(page);
  const root = page.locator('.project-phaser-fixture');
  await expect.poll(async () => Number(await root.getAttribute('data-ticks'))).toBeGreaterThan(2);
  await root.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(root).toHaveAttribute('data-paused', 'true');
  const ticks = await root.getAttribute('data-ticks');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(root).toHaveAttribute('data-ticks', ticks!);
  await root.getByRole('button', { name: 'Help', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Phaser help', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-paused', 'true');
  await root.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-ticks'))).toBeGreaterThan(Number(ticks));
  await root.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(root).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-paused', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root).toHaveAttribute('data-reduced', 'true');
  await root.dispatchEvent('metrics');
  expect(JSON.parse((await root.getAttribute('data-metrics'))!).objects).toBe(2);
});

test('Phaser can be destroyed before its first scene and recreated without losing global plugins', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const stagePath = '/src/core/phaser/stage.ts';
    const pagePath = '/src/core/page.ts';
    const { createPhaserStage }: typeof import('../src/core/phaser/stage') = await import(stagePath);
    const { createProjectPage }: typeof import('../src/core/page') = await import(pagePath);
    const lifecycle = createProjectPage({ container: document.body, controls: document.createElement('div'), signal: new AbortController().signal, reducedMotion: true, report() {} }, 'early-phaser');
    const host = document.createElement('div'); host.style.cssText = 'width:640px;height:400px'; lifecycle.root.append(host);
    const ready = createPhaserStage(lifecycle, { host, label: 'Early fixture', create: () => ({}) });
    lifecycle.destroy();
    let aborted = false;
    try { await ready; } catch (error) { aborted = error instanceof DOMException && error.name === 'AbortError'; }
    if (!aborted) throw new Error('A disposed Phaser mount must reject as cancelled.');
  });
  await fixture(page, 'auto', false);
  await expect(page.locator('[data-phaser-ready="true"] canvas')).toHaveCount(1);
});

test('Phaser hidden-document pause freezes simulation and teardown does not require a visible frame', async ({ page }) => {
  await fixture(page);
  const root = page.locator('.project-phaser-fixture');
  await root.dispatchEvent('add-nested');
  await root.dispatchEvent('metrics');
  expect(JSON.parse((await root.getAttribute('data-metrics'))!).objects).toBe(5);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(root).toHaveAttribute('data-paused', 'true');
  const ticks = await root.getAttribute('data-ticks');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(root).toHaveAttribute('data-ticks', ticks!);
  await root.dispatchEvent('destroy-stage');
  await expect(root.locator('[data-phaser-host]')).toHaveAttribute('data-phaser-destroyed', 'true');
  await expect(root.locator('canvas')).toHaveCount(0);
});

test('lost graphics context always pauses and reports a visible recovery path', async ({ page }) => {
  await fixture(page);
  const root = page.locator('.project-phaser-fixture');
  await root.locator('canvas').dispatchEvent('webglcontextlost', { cancelable: true });
  await expect(root).toHaveAttribute('data-paused', 'true');
  await expect(root).toHaveAttribute('data-reported', /画面连接已中断/);
  await root.dispatchEvent('destroy-stage');
  await expect(root.locator('canvas')).toHaveCount(0);
});
