import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { random } from '../../src/core/math';
import { parseManifest } from '../../src/core/manifest';
import { cameraPoint, essential, fundamental, intrinsicInverse, lookAt, project, projectionJacobian, sampsonDistance, unproject } from '../../src/projects/parallax/camera';
import type { Camera } from '../../src/projects/parallax/camera';
import { clipLine } from '../../src/projects/parallax/images';
import { add, dot, eigenSymmetric, mm, mul, mv, norm, sub, transpose, unit } from '../../src/projects/parallax/math';
import type { M3, V2, V3 } from '../../src/projects/parallax/math';
import manifest from '../../src/projects/parallax/manifest.json' with { type: 'json' };
import { eightPoint, estimateFundamental } from '../../src/projects/parallax/robust';
import { capture, commit, createExperiment, createHistory, exportPly, parseExperiment, reconstruct, redo, serialize, undo, validateExperiment } from '../../src/projects/parallax/state';
import type { Experiment } from '../../src/projects/parallax/state';
import { refine, residuals, triangulate, uncertainty } from '../../src/projects/parallax/triangulation';
import { cameras, STUDIES, visiblePixel, WORLD } from '../../src/projects/parallax/world';

function pixel(camera: Camera, point: V3): V2 {
  const p = project(camera, point);
  if (!p) throw new Error('Fixture behind camera.');
  return p;
}
function syntheticPairs(count = 60) {
  const [a, b] = cameras('signal', { baseline: 3.4, focal: 840, yaw: 2 });
  const rng = random(71);
  const world: V3[] = Array.from({ length: count }, () => [(rng() - 0.5) * 7, rng() * 7, (rng() - 0.5) * 5]);
  return { a, b, world, pairs: world.map((p) => ({ a: pixel(a, p), b: pixel(b, p) })) };
}

test.describe('PARALLAX numerical model', () => {
  test('manifest registers the reserved flagship identity and required discovery tags', () => {
    expect(parseManifest(manifest, 'parallax/manifest.json')).toMatchObject({ id: 'parallax', order: 69, title: 'Parallax', category: 'learn', format: 'page' });
    expect(manifest.tags.slice(0, 3)).toEqual(['Spatial flagship', '3D', 'Computer vision']);
    expect(manifest.tags).toContain('Flagship');
    expect(manifest.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.ink).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('calibrated projection and unprojection recover positive-depth points exactly', () => {
    const { a, b, world } = syntheticPairs();
    for (const p of world) {
      expect(norm(sub(unproject(a, pixel(a, p)), unit(sub(p, a.center))))).toBeLessThan(1e-12);
      const result = triangulate(a, b, pixel(a, p), pixel(b, p));
      expect(result.status).toBe('ok');
      expect(norm(sub(result.point!, p))).toBeLessThan(1e-10);
      expect(residuals(a, b, pixel(a, p), pixel(b, p), result.point!)!.rms).toBeLessThan(1e-9);
    }
    expect(project(a, add(a.center, mul(a.rotation[2], -1)))).toBeNull();
  });

  test('common rigid transforms and uniform scale preserve image geometry and change only gauge', () => {
    const { a, b, world } = syntheticPairs(16);
    const theta = 0.73, q: M3 = [[Math.cos(theta), 0, Math.sin(theta)], [0, 1, 0], [-Math.sin(theta), 0, Math.cos(theta)]];
    const offset: V3 = [16, -4, 9];
    const transform = (p: V3) => add(mv(q, p), offset);
    const transformCamera = (c: Camera): Camera => ({ ...c, center: transform(c.center), rotation: mm(c.rotation, transpose(q)) });
    const [at, bt] = [transformCamera(a), transformCamera(b)];
    for (const p of world) {
      const pa = pixel(a, p), pb = pixel(b, p);
      const pt = transform(p);
      expect(Math.hypot(...pixel(at, pt).map((v, i) => v - pa[i]))).toBeLessThan(1e-10);
      expect(norm(sub(triangulate(at, bt, pa, pb).point!, pt))).toBeLessThan(1e-9);
      const scale = 3.7;
      expect(norm(sub(triangulate({ ...a, center: mul(a.center, scale) }, { ...b, center: mul(b.center, scale) }, pa, pb).point!, mul(p, scale)))).toBeLessThan(1e-9);
    }
  });

  test('known F and E satisfy their respective pixel and normalized epipolar constraints', () => {
    const { a, b, pairs } = syntheticPairs();
    const f = fundamental(a, b), e = essential(a, b);
    for (const pair of pairs) {
      const x: V3 = [...pair.a, 1], y: V3 = [...pair.b, 1];
      expect(Math.abs(dot(y, mv(f, x)))).toBeLessThan(1e-10);
      expect(Math.abs(dot(mv(intrinsicInverse(b), y), mv(e, mv(intrinsicInverse(a), x))))).toBeLessThan(1e-10);
      expect(sampsonDistance(f, pair.a, pair.b)).toBeLessThan(1e-9);
    }
    const eigen = eigenSymmetric(mm(transpose(f), f));
    expect(Math.abs(eigen.values[0])).toBeLessThan(1e-12);
    expect(clipLine([0, 1, -200])).toEqual([[0, 200], [960, 200]]);
    expect(clipLine([0, 0, 0])).toBeNull();
  });

  test('coincident, near-parallel and behind-camera rays fail explicitly without plausible fallback depth', () => {
    const [a, b] = cameras('signal', { baseline: 0, focal: 840, yaw: 0 });
    const p: V3 = [0, 2, 0];
    expect(triangulate(a, b, pixel(a, p), pixel(b, p))).toMatchObject({ status: 'unavailable', point: null });
    const narrow = cameras('signal', { baseline: 0.0001, focal: 840, yaw: 0 });
    expect(triangulate(...narrow, pixel(narrow[0], p), pixel(narrow[1], p))).toMatchObject({ status: 'unstable', point: null });
    const parallelA = lookAt([-1, 0, 0], [-1, 0, 10]), parallelB = lookAt([1, 0, 0], [1, 0, 10]);
    const behindPixel = (c: Camera): V2 => {
      const [x, y, z] = cameraPoint(c, [0, 0, -4]);
      return [c.fx * x / z + c.cx, c.fy * y / z + c.cy];
    };
    expect(triangulate(parallelA, parallelB, behindPixel(parallelA), behindPixel(parallelB))).toMatchObject({ status: 'behind', point: null });
  });

  test('analytic reprojection Jacobian matches finite differences', () => {
    const { a, world } = syntheticPairs(1), p = world[0], jacobian = projectionJacobian(a, p)!;
    for (let axis = 0; axis < 3; axis++) {
      const d: V3 = [0, 0, 0]; d[axis] = 1e-5;
      const plus = pixel(a, add(p, d)), minus = pixel(a, sub(p, d));
      for (let row = 0; row < 2; row++) expect(jacobian[row][axis]).toBeCloseTo((plus[row] - minus[row]) / 2e-5, 6);
    }
  });

  test('noisy midpoint triangulation is accurate and nonlinear refinement actually lowers pixel error', () => {
    const { a, b, world, pairs } = syntheticPairs();
    let rawCost = 0, refinedCost = 0, worldError = 0;
    pairs.forEach((pair, i) => {
      const pb: V2 = [pair.b[0] + Math.sin(i) * 2, pair.b[1] + Math.cos(i) * 5];
      const raw = triangulate(a, b, pair.a, pb);
      expect(raw.point).not.toBeNull();
      const optimized = refine(a, b, pair.a, pb, raw.point!);
      const before = residuals(a, b, pair.a, pb, raw.point!)!, after = residuals(a, b, pair.a, pb, optimized.point)!;
      expect(after.squared).toBeLessThanOrEqual(before.squared + 1e-10);
      rawCost += before.squared; refinedCost += after.squared;
      worldError += norm(sub(optimized.point, world[i]));
    });
    expect(rawCost - refinedCost).toBeGreaterThan(0.1);
    expect(worldError / pairs.length).toBeLessThan(0.3);
  });

  test('noise-derived covariance follows baseline and sigma, including zero modeled sensor variance', () => {
    const p: V3 = [0, 5.8, 1.4];
    const wide = cameras('signal', { baseline: 4, focal: 840, yaw: 0 }), narrow = cameras('signal', { baseline: 0.15, focal: 840, yaw: 0 });
    const uw = uncertainty(...wide, p, 1)!, un = uncertainty(...narrow, p, 1)!;
    expect(un.depthSigma / uw.depthSigma).toBeGreaterThan(20);
    expect(un.condition).toBeGreaterThan(uw.condition * 100);
    expect(uncertainty(...wide, p, 2)!.depthSigma).toBeCloseTo(uw.depthSigma * 2, 12);
    expect(uncertainty(...wide, p, 0)!.depthSigma).toBe(0);
  });

  test('normalized eight-point estimator has rank two and rejects planar, collinear and duplicate designs', () => {
    const { a, b, pairs } = syntheticPairs();
    const fit = eightPoint(pairs)!;
    expect(fit).not.toBeNull();
    expect(Math.max(...pairs.map((p) => sampsonDistance(fit, p.a, p.b)))).toBeLessThan(1e-5);
    const singular = eigenSymmetric(mm(transpose(fit), fit));
    expect(Math.abs(singular.values[0])).toBeLessThan(1e-12);
    const plane = Array.from({ length: 25 }, (_, i): V3 => [(i % 5) - 2, Math.floor(i / 5), 1]);
    expect(eightPoint(plane.map((p) => ({ a: pixel(a, p), b: pixel(b, p) })))).toBeNull();
    expect(eightPoint(Array.from({ length: 20 }, (_, i) => ({ a: [i, 2 * i] as V2, b: [i + 1, 2 * i] as V2 })))).toBeNull();
    expect(eightPoint(Array.from({ length: 20 }, () => pairs[0]))).toBeNull();
  });

  test('bounded seeded RANSAC rejects mismatches and improves on all-pair estimation', () => {
    const { pairs } = syntheticPairs(70);
    const corrupted = pairs.map((p, i) => ({ a: p.a, b: [p.b[0] + Math.sin(i) * 0.2 + (i < 14 ? 100 : 0), p.b[1] + Math.cos(i) * 0.2 + (i < 14 ? 65 : 0)] as V2 }));
    const fit = estimateFundamental(corrupted, 1.5, 11);
    expect(fit.f).not.toBeNull();
    expect(fit.inliers.length).toBeGreaterThanOrEqual(50);
    expect(fit.inliers.filter((i) => i < 14).length).toBeLessThan(3);
    const all = eightPoint(corrupted)!;
    const error = (f: M3) => pairs.slice(14).reduce((s, p) => s + sampsonDistance(f, p.a, p.b), 0) / 56;
    expect(error(fit.f!)).toBeLessThan(0.5);
    expect(error(fit.f!)).toBeLessThan(error(all) / 4);
    expect(estimateFundamental(corrupted, 1.5, 11)).toEqual(fit);
    expect(estimateFundamental(pairs.slice(0, 8)).f).toBeNull();
  });

  test('all three captures have real occlusion and distinct paired observations', () => {
    const signatures: string[] = [];
    for (const study of STUDIES) {
      const observations = capture(study.id, study.rig, 0, 0, 117);
      const paired = observations.filter((p) => p.a && p.b);
      expect(paired.length).toBeGreaterThan(20);
      expect(paired.length).toBeLessThan(WORLD.landmarks.length - 10);
      expect(observations.some((p) => !p.a && !p.b)).toBe(true);
      const result = reconstruct({ ...createExperiment(study.id), sigma: 0, observations });
      for (const r of result.filter((r) => r.point)) expect(norm(sub(r.point!, WORLD.landmarks.find((p) => p.id === r.id)!.position))).toBeLessThan(1e-8);
      signatures.push(JSON.stringify(observations));
    }
    expect(new Set(signatures).size).toBe(3);
    const [a] = cameras('signal', STUDIES[0].rig);
    expect(visiblePixel(a, [-0.45, 3.3, -0.12])).toBeNull();
  });

  test('solver depends on observations/calibration, never landmark identity, and calibrated gating improves cloud error', () => {
    const e = createExperiment();
    const first = e.observations.find((o) => o.a && o.b)!;
    const second = e.observations.filter((o) => o.a && o.b)[1];
    const original = reconstruct(e).find((r) => r.id === first.id)!.point!;
    second.a = [...first.a!]; second.b = [...first.b!];
    expect(reconstruct(e).find((r) => r.id === second.id)!.point).toEqual(original);
    e.observations = capture(e.study, e.exposure, 1, 0.25, 117); e.sigma = 1;
    const raw = reconstruct({ ...e, method: 'raw' }), robust = reconstruct({ ...e, method: 'robust' });
    expect(robust.filter((r) => r.rejected).length).toBeGreaterThan(4);
    const error = (rows: ReturnType<typeof reconstruct>) => {
      const available = rows.filter((r) => r.point);
      return available.reduce((sum, r) => sum + norm(sub(r.point!, WORLD.landmarks.find((p) => p.id === r.id)!.position)), 0) / available.length;
    };
    expect(error(robust)).toBeLessThan(error(raw) / 2);
    const baselineChanged = reconstruct({ ...e, calibration: { ...e.calibration, baseline: 1.5 } });
    expect(baselineChanged.find((r) => r.point)?.point).not.toEqual(robust.find((r) => r.point)?.point);
  });

  test('bounded experiment roundtrip, history and point export preserve identity and valid state', () => {
    const original = createExperiment(), history = createHistory(original);
    const edited = structuredClone(original); edited.calibration.focal = 900; edited.observations[0].enabled = false;
    commit(history, edited);
    expect(parseExperiment(serialize(history.current))).toEqual({ ok: true, value: edited });
    expect(undo(history)).toBe(true); expect(history.current).toEqual(original);
    expect(redo(history)).toBe(true); expect(history.current).toEqual(edited);
    expect(validateExperiment({ ...edited, method: ['raw'] })).toBe(false);
    for (const bad of [
      { ...edited, version: 2 }, { ...edited, hiddenTruth: [1, 2, 3] },
      { ...edited, calibration: { ...edited.calibration, focal: Infinity } },
      { ...edited, calibration: { ...edited.calibration, baseline: -1 } },
      { ...edited, observations: [...edited.observations.slice(1), edited.observations[1]] },
      { ...edited, observations: edited.observations.map((o) => ({ ...o, a: [1000, 10] })) },
      { ...edited, seed: 0.5 }, { ...edited, sigma: 100 },
    ]) expect(parseExperiment(JSON.stringify(bad)).ok).toBe(false);
    expect(parseExperiment('{')).toMatchObject({ ok: false });
    expect(parseExperiment(' '.repeat(250001))).toMatchObject({ ok: false });
    expect(history.current).toEqual(edited);
    const rows = reconstruct(edited), ply = exportPly(rows);
    expect(ply).toContain(`element vertex ${rows.filter((r) => r.point).length}`);
    expect(ply.split('end_header\n')[1].trim().split('\n').length).toBe(rows.filter((r) => r.point).length);
  });
});

async function openStudio(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:4173\/\?token=/, () => {});
  await page.goto('./projects/parallax/');
  await expect(page.locator('.project-parallax')).toBeVisible();
  await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', /^\[/);
  await expect(page.locator('[data-camera-image="a"]')).toHaveAttribute('width', '960');
  return errors;
}
async function xyz(page: Page): Promise<V3> { return JSON.parse((await page.locator('[data-point3d]').getAttribute('data-xyz'))!); }
async function range(page: Page, selector: string, value: number) {
  await page.getByRole('tab', { name: 'Rig', exact: true }).click();
  await page.locator(selector).fill(String(value));
  await page.locator(selector).dispatchEvent('change');
}
async function downloadExperiment(page: Page): Promise<Experiment> {
  const alreadyOpen = await page.locator('#px-notebook').evaluate((element) => (element as HTMLDialogElement).open);
  if (!alreadyOpen) await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.locator('[data-action="export-json"]').click();
  const download = await downloading;
  const path = await download.path();
  expect(path).not.toBeNull();
  const experiment = JSON.parse(await readFile(path!, 'utf8'));
  if (!alreadyOpen) await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
  return experiment;
}

test.describe('PARALLAX linked browser instrument', () => {
  test('editing, refinement, epipolar repair, rejection and calibration move the actual estimate', async ({ page }, testInfo) => {
    test.setTimeout(90_000); // This case performs many actual software-WebGL redraws and exposures.
    await page.setViewportSize({ width: 1440, height: 1080 });
    const errors = await openStudio(page);
    const original = await xyz(page);
    await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
    const originalY = Number(await page.locator('[data-pixel="b-y"]').inputValue());
    await page.locator('[data-pixel="b-y"]').fill(String(originalY + 20));
    await page.locator('[data-pixels] button[type="submit"]').click();
    const edited = await xyz(page);
    expect(norm(sub(edited, original))).toBeGreaterThan(0.05);
    expect(Number(await page.locator('[data-rms]').getAttribute('data-value'))).toBeGreaterThan(3);
    await page.locator('[data-method="raw"]').click();
    const rawRms = Number(await page.locator('[data-rms]').getAttribute('data-value'));
    await page.locator('[data-method="refined"]').click();
    expect(Number(await page.locator('[data-rms]').getAttribute('data-value'))).toBeLessThan(rawRms);
    await page.locator('[data-method="robust"]').click();
    await expect(page.locator('[data-point-status]')).toHaveText('REJECTED');
    await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', '');
    await page.locator('[data-action="epipolar-repair"]').click();
    await expect(page.locator('[data-point-status]')).toHaveText('OK');
    expect(Number(await page.locator('[data-rms]').getAttribute('data-value'))).toBeLessThan(1e-7);
    await page.locator('[data-action="restore-match"]').click();
    expect(norm(sub(await xyz(page), original))).toBeLessThan(1e-9);
    const imageBefore = await page.locator('[data-camera-image="a"]').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
    await range(page, '[data-rig="baseline"]', 1.8);
    expect(norm(sub(await xyz(page), original))).toBeGreaterThan(1);
    expect(await page.locator('[data-camera-image="a"]').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(imageBefore);
    await expect(page.locator('[data-calibration-note]')).toContainText('intentional model mismatch');
    await range(page, '[data-rig="baseline"]', 0);
    await expect(page.locator('[data-point-status]')).toHaveText('UNAVAILABLE');
    await expect(page.locator('[data-reason]')).toContainText('coincide');
    await page.locator('[data-action="undo"]').click();
    await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', /^\[/);
    await page.locator('[data-action="reset"]').click();
    await range(page, '[data-rig="focal"]', 920);
    expect(norm(sub(await xyz(page), original))).toBeGreaterThan(0.2);
    await page.locator('[data-action="undo"]').click();
    await range(page, '[data-rig="yaw"]', 1.2);
    expect(norm(sub(await xyz(page), original))).toBeGreaterThan(0.1);
    await page.locator('[data-action="recapture"]').click();
    await expect(page.locator('[data-calibration-note]')).toContainText('matches the capture rig');
    expect(await page.locator('[data-camera-image="a"]').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(imageBefore);
    const differentViews = await page.locator('[data-camera-image]').evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
    expect(differentViews[0]).not.toBe(differentViews[1]);
    await page.locator('[data-action="reset"]').click();
    await page.getByRole('tab', { name: 'Space', exact: true }).click();
    await page.locator('[data-reveal]').check();
    await expect(page.locator('[data-truth-error]')).toContainText('Euclidean error');
    await page.locator('[data-reveal]').uncheck();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('parallax-desktop.png'), fullPage: true });
    console.log('PARALLAX desktop:', testInfo.outputPath('parallax-desktop.png'));
    expect(errors).toEqual([]);
  });

  test('export/import is exact, rejects corrupt input atomically, and PLY contains only displayed points', async ({ page }) => {
    const errors = await openStudio(page);
    await range(page, '[data-noise="outliers"]', 0.2);
    await page.locator('[data-method="robust"]').click();
    const saved = await downloadExperiment(page);
    await page.locator('[data-action="reset"]').click();
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('.px-import summary').click();
    await page.locator('[data-import-text]').fill(JSON.stringify(saved));
    await page.locator('[data-action="import-json"]').click();
    await expect(page.locator('[data-status]')).toContainText('restored exactly');
    expect(await downloadExperiment(page)).toEqual(saved);
    await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
    await page.locator('[data-action="reset"]').click();
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('[data-import-file]').setInputFiles({ name: 'study.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await expect(page.locator('[data-status]')).toContainText('restored exactly');
    expect(await downloadExperiment(page)).toEqual(saved);
    await page.locator('[data-import-file]').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(250001, 32) });
    await expect(page.locator('[data-status]')).toContainText('250 kB limit');
    expect(await downloadExperiment(page)).toEqual(saved);
    const before = await page.locator('[data-point3d]').getAttribute('data-xyz');
    await page.locator('[data-import-text]').fill('{"version":1,"sigma":-5}');
    await page.locator('[data-action="import-json"]').click();
    await expect(page.locator('[data-status]')).toContainText('current study is unchanged');
    expect(await page.locator('[data-point3d]').getAttribute('data-xyz')).toBe(before);
    expect(await downloadExperiment(page)).toEqual(saved);
    const plyDownload = page.waitForEvent('download');
    await page.locator('[data-action="export-ply"]').click();
    const ply = await readFile((await (await plyDownload).path())!, 'utf8');
    const expected = exportPly(reconstruct(saved));
    expect(ply).toBe(expected);
    expect(errors).toEqual([]);
  });

  test('all captures, seeded F fit and guided baseline experiment produce measurable geometry', async ({ page }) => {
    test.setTimeout(90_000); // Multiple 960x640 stereo captures on software WebGL.
    const errors = await openStudio(page);
    for (const study of ['shore', 'oblique', 'signal']) {
      await page.locator('[data-study]').selectOption(study);
      await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', /^\[/);
      expect(Number(await page.locator('.px-space-canvas').getAttribute('data-points'))).toBeGreaterThan(20);
    }
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('[data-action="fit-f"]').click();
    await expect(page.locator('[data-fit-status]')).toContainText('consensus inliers');
    await expect(page.locator('[data-image-overlay="a"] .px-estimated-line')).toHaveCount(1);
    await page.locator('[data-action="guide-wide"]').click();
    const wide = Number(await page.locator('[data-uncertainty]').getAttribute('data-value'));
    const id = await page.locator('[data-point-id]').textContent();
    await page.locator('[data-action="guide-narrow"]').click();
    await expect(page.locator('[data-point-id]')).toHaveText(id!);
    const narrow = Number(await page.locator('[data-uncertainty]').getAttribute('data-value'));
    expect(narrow / wide).toBeGreaterThan(15);
    await expect(page.locator('[data-guide-reading]')).toContainText('0.15 m baseline');
    expect(errors).toEqual([]);
  });

  test('resizing, pointer capture and keyboard picking preserve calibration and a drag is one undo', async ({ page }) => {
    const errors = await openStudio(page);
    const original = await xyz(page), originalId = await page.locator('[data-point-id]').textContent();
    await page.setViewportSize({ width: 1240, height: 1000 });
    expect(await xyz(page)).toEqual(original);
    await page.locator('[data-image-overlay="a"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-point-id]')).not.toHaveText(originalId!);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-point-id]')).toHaveText(originalId!);
    await page.getByRole('tab', { name: 'View B', exact: true }).click();
    await page.locator('[data-action="edit-mode"]').click();
    const feature = page.locator(`[data-image-overlay="b"] [data-feature="${originalId}"]`);
    const bounds = await feature.locator('.px-feature-dot').boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.locator('.px-space-canvas').dispatchEvent('pointerdown', { pointerId: 999, pointerType: 'touch', button: 0, bubbles: true });
    await page.mouse.move(bounds!.x + bounds!.width / 2 + 12, bounds!.y + bounds!.height / 2 + 8, { steps: 6 });
    await page.mouse.up();
    expect(norm(sub(await xyz(page), original))).toBeGreaterThan(0.01);
    await page.locator('[data-action="undo"]').click();
    expect(await xyz(page)).toEqual(original);
    const restored = await feature.locator('.px-feature-dot').boundingBox();
    await page.mouse.move(restored!.x + restored!.width / 2, restored!.y + restored!.height / 2);
    await page.mouse.down();
    await page.mouse.move(restored!.x + 22, restored!.y + 10, { steps: 3 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await xyz(page)).toEqual(original);
    await page.locator('.px-space-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await page.keyboard.press('Home');
    expect(await xyz(page)).toEqual(original);
    expect(errors).toEqual([]);
  });

  test('prefixed route disposes the live context and loop, then restores a single instrument', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/collections/projects/parallax/');
    await expect(page.locator('.project-parallax')).toBeVisible();
    await expect(page.locator('.px-space-canvas')).toHaveAttribute('data-render-count', /^[1-9]\d*$/);
    const oldCanvas = await page.locator('.px-space-canvas').elementHandle();
    expect(oldCanvas).not.toBeNull();
    const renders = await oldCanvas!.getAttribute('data-render-count');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await expect(page.locator('.project-parallax')).toHaveCount(0);
    await expect.poll(() => oldCanvas!.evaluate((canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')?.isContextLost())).toBe(true);
    await page.setViewportSize({ width: 1040, height: 800 });
    await page.waitForTimeout(150);
    expect(await oldCanvas!.getAttribute('data-render-count')).toBe(renders);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('.project-parallax')).toHaveCount(1);
    await expect(page.locator('.px-space-canvas')).toHaveCount(1);
    await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', /^\[/);
    expect(errors).toEqual([]);
  });

  for (const width of [320, 375]) {
    test(`mobile ${width}px panes, numeric editing, reduced motion and disposal`, async ({ page }, testInfo) => {
      test.setTimeout(90_000); // Two mounts and a real software-WebGL volume at mobile resolution.
      await page.setViewportSize({ width, height: 860 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = await openStudio(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const original = await xyz(page);
      await page.screenshot({ path: testInfo.outputPath(`parallax-mobile-${width}.png`), fullPage: true });
      console.log(`PARALLAX mobile ${width}:`, testInfo.outputPath(`parallax-mobile-${width}.png`));
      await page.locator('[data-tab="b"]').click();
      await expect(page.locator('[data-pane="b"]')).toBeVisible();
      await expect(page.locator('[data-pane="a"]')).toBeHidden();
      await page.locator('[data-tab="inspect"]').click();
      await expect(page.locator('[data-pixel="b-x"]')).toBeVisible();
      const bx = Number(await page.locator('[data-pixel="b-x"]').inputValue());
      await page.locator('[data-pixel="b-x"]').fill(String(bx + 4));
      await page.locator('.px-apply').click();
      expect(norm(sub(await xyz(page), original))).toBeGreaterThan(0.02);
      await page.locator('[data-action="undo"]').click();
      expect(await xyz(page)).toEqual(original);
      await page.locator('[data-tab="space"]').click();
      await expect(page.locator('.px-space-canvas')).toBeVisible();
      await expect(page.locator('.px-space-canvas')).toHaveAttribute('data-render-count', /^[1-9]\d*$/);
      await page.waitForTimeout(200);
      const renders = await page.locator('.px-space-canvas').getAttribute('data-render-count');
      await page.waitForTimeout(400);
      expect(await page.locator('.px-space-canvas').getAttribute('data-render-count')).toBe(renders);
      await page.screenshot({ path: testInfo.outputPath(`parallax-mobile-space-${width}.png`) });
      await page.locator('[data-tab="inspect"]').click();
      await page.screenshot({ path: testInfo.outputPath(`parallax-mobile-inspect-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.goto('./');
      await expect(page.locator('.project-parallax')).toHaveCount(0);
      await page.goto('./projects/parallax/');
      await expect(page.locator('.project-parallax')).toHaveCount(1);
      await expect(page.locator('[data-point3d]')).toHaveAttribute('data-xyz', /^\[/);
      expect(await page.locator('.px-space-canvas').count()).toBe(1);
      expect(errors).toEqual([]);
    });
  }
});
