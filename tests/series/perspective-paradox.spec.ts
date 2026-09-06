import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { cameraFov, canonicalEye, focalPoint } from '../../src/projects/perspective-paradox/data';
import {
  createBeamGeometry, createBeamLayout, physicalGaps, projectionError,
} from '../../src/projects/perspective-paradox/scene';
import { returnToCollection } from '../helpers/navigation';

test('Perspective Paradox: disconnected solid beams honestly coincide in camera projection', () => {
  const beams = createBeamLayout();
  const camera = new THREE.PerspectiveCamera(cameraFov, 1.6, 0.1, 260);
  camera.position.set(...canonicalEye);
  camera.lookAt(new THREE.Vector3(...focalPoint));
  camera.updateMatrixWorld();
  expect(beams).toHaveLength(3);
  expect(physicalGaps(beams).every((gap) => gap > 3)).toBe(true);
  expect(projectionError(beams, camera, 1200, 750)).toBeLessThan(0.000001);
  camera.aspect = 375 / 445;
  camera.updateProjectionMatrix();
  expect(projectionError(beams, camera, 375, 445)).toBeLessThan(0.000001);
  camera.position.set(-16, 10, 15);
  camera.lookAt(new THREE.Vector3(...focalPoint));
  camera.updateMatrixWorld();
  expect(projectionError(beams, camera, 375, 445)).toBeGreaterThan(60);

  for (const beam of beams) {
    const geometry = createBeamGeometry(beam);
    try {
      const vertices = geometry.getAttribute('position');
      expect(vertices.count).toBe(36);
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
      const edges = new Map<string, number>();
      let volume = 0;
      const point = (index: number) => new THREE.Vector3().fromBufferAttribute(vertices, index);
      const key = (index: number) => point(index).toArray().join(',');
      for (let index = 0; index < vertices.count; index += 3) {
        volume += point(index).dot(point(index + 1).cross(point(index + 2))) / 6;
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const edge = [key(index + a), key(index + b)].sort().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
      expect(volume).toBeGreaterThan(2);
    } finally {
      geometry.dispose();
    }
  }
});

test('Perspective Paradox: a paused camera reveals the construction and returns exactly to alignment', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./projects/perspective-paradox/');
  const site = page.locator('.project-perspective-paradox');
  const scene = page.locator('[data-paradox-scene]');
  const canvas = scene.locator('canvas');
  await expect(site).toHaveAttribute('data-ready', 'true');
  await expect(canvas).toBeVisible();
  await expect(site).toHaveAttribute('data-motion', 'paused');
  await expect(scene).toHaveAttribute('data-aligned', 'true');
  expect(Number(await scene.getAttribute('data-projection-error'))).toBeLessThan(0.000001);
  const gaps = (await scene.getAttribute('data-physical-gaps'))!.split(',').map(Number);
  expect(gaps.every((gap) => gap > 3)).toBe(true);
  const alignedCamera = await scene.getAttribute('data-camera');
  const alignedFrame = await canvas.screenshot();
  await page.getByRole('button', { name: 'Side elevation', exact: false }).click();
  await expect(scene).toHaveAttribute('data-aligned', 'false');
  expect(Number(await scene.getAttribute('data-projection-error'))).toBeGreaterThan(60);
  expect((await canvas.screenshot()).equals(alignedFrame)).toBe(false);
  await page.getByRole('button', { name: 'Projection guides', exact: false }).click();
  await expect(scene).toHaveAttribute('data-guides', 'true');
  await expect(scene).toHaveAttribute('data-physical-gaps', gaps.map((gap) => gap.toFixed(6)).join(','));
  await page.getByRole('button', { name: 'Find the viewpoint', exact: false }).click();
  await expect(scene).toHaveAttribute('data-aligned', 'true');
  await expect(scene).toHaveAttribute('data-camera', alignedCamera!);
  await canvas.focus();
  await canvas.press('ArrowRight');
  await expect(scene).toHaveAttribute('data-aligned', 'false');
  const manualCamera = await scene.getAttribute('data-camera');
  await page.getByRole('slider', { name: 'Sun direction', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(scene).toHaveAttribute('data-sun', '160');
  await expect(scene).toHaveAttribute('data-camera', manualCamera!);
  await page.getByRole('slider', { name: 'Inspection orbit angle', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(scene).toHaveAttribute('data-aligned', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(scene).toHaveAttribute('data-phase', '1.000000');
  await expect(scene).toHaveAttribute('data-aligned', 'false');
  await page.getByRole('button', { name: 'Reset model', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', alignedCamera!);
  await expect(scene).toHaveAttribute('data-guides', 'false');
  await expect(scene).toHaveAttribute('data-sun', '38');
  await page.getByRole('button', { name: 'Play inspection orbit', exact: true }).click();
  await expect(site).toHaveAttribute('data-motion', 'playing');
  await expect(scene).not.toHaveAttribute('data-phase', '0.000000');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(site).toHaveAttribute('data-motion', 'paused');
  const heldPhase = await scene.getAttribute('data-phase');
  const heldCamera = await scene.getAttribute('data-camera');
  const heldFrame = await canvas.screenshot();
  await page.waitForTimeout(200);
  await expect(scene).toHaveAttribute('data-phase', heldPhase!);
  await expect(scene).toHaveAttribute('data-camera', heldCamera!);
  expect((await canvas.screenshot()).equals(heldFrame)).toBe(true);
  expect(errors).toEqual([]);
});

test('Perspective Paradox: mobile drawing board stays usable and releases graphics on exit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const remove = HTMLCanvasElement.prototype.remove;
    HTMLCanvasElement.prototype.remove = function () {
      const owned = this.closest('.project-perspective-paradox') !== null;
      remove.call(this);
      if (owned) sessionStorage.setItem('perspective-paradox-canvas-disposal', JSON.stringify({
        connected: this.isConnected,
        contextLost: this.getContext('webgl2')?.isContextLost() === true,
      }));
    };
  });
  await page.goto('./projects/perspective-paradox/');
  const site = page.locator('.project-perspective-paradox');
  const scene = page.locator('[data-paradox-scene]');
  await expect(site).toHaveAttribute('data-ready', 'true');
  await expect(scene).toHaveAttribute('data-aligned', 'true');
  const bounds = (await scene.boundingBox())!;
  expect(bounds.y).toBeLessThan(200);
  expect(bounds.width).toBeLessThanOrEqual(375);
  expect(bounds.height).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const canvas = scene.locator('canvas');
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width / element.clientWidth)).toBeLessThanOrEqual(1.01);
  await page.getByRole('button', { name: 'Above the joints', exact: false }).click();
  await expect(scene).toHaveAttribute('data-aligned', 'false');
  await page.getByRole('button', { name: 'Find the viewpoint', exact: false }).click();
  await expect(scene).toHaveAttribute('data-aligned', 'true');
  await returnToCollection(page);
  await expect(site).toHaveCount(0);
  await expect(canvas).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('perspective-paradox-canvas-disposal') ?? 'null')))
    .toEqual({ connected: false, contextLost: true });
});
