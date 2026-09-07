import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import * as THREE from 'three';
import { installAgentFixture, configureFixtureConnection, nativeToolResponse } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { array, choice, object, text } from '../../src/core/agents/schema';
import { ACTORS, CUES, MARK_IDS, POSES, openingCamera } from '../../src/projects/takes/data';
import type { Plan } from '../../src/projects/takes/data';
import { definition, evaluate, reduce, create } from '../../src/projects/takes/engine';
import { actorPoints, cameraFrame, coverage, project } from '../../src/projects/takes/geometry';
import { smokeCase } from '../../src/projects/takes/agent';

function ensemble(turn: FixtureTurn, mark: 'near' | 'mid' | 'far' = 'mid'): Plan {
  const cue = choice(turn.observation.directorCue, CUES, 'Fixture cue');
  const poses = array(turn.observation.legalPoses, p => choice(p, POSES, 'Pose'), 'Pose catalog', 1, 5);
  const actors = array(turn.observation.actors, value => {
    const actor = object(value, ['id', 'motivation', 'current', 'legalMarks']);
    const id = choice(actor.id, ACTORS, 'Actor');
    const marks = array(actor.legalMarks, value => {
      const m = object(value, ['id', 'x', 'y', 'z']);
      return choice(m.id, MARK_IDS, 'Legal mark');
    }, 'Marks', 3, 3);
    const destination = marks.find(m => m.endsWith(mark))!;
    return { id, mark: destination, pose: poses[0], attention: 'partner' as const, line: `${id === 'mica' ? 'Precisely' : 'Imagine'}: a little ${cue} for the cabinet.` };
  }, 'Ensemble', 2, 2);
  return { intention: 'Keep the ritual clear and welcome the impossible.', actors };
}
function purePlan(cue: typeof CUES[number] = 'discover'): Plan {
  return { intention: 'Give the cabinet space.', actors: ACTORS.map(id => ({
    id, mark: id === 'mica' ? 'mica-mid' : 'pip-mid', pose: cue === 'discover' ? 'listen' : cue === 'offer' ? 'present' : 'cheer',
    attention: 'partner', line: `${id} welcomes the ${cue}.`,
  })) };
}
async function open(page: Page) {
  await page.goto('./projects/takes/');
  await expect(page.locator('.project-takes h1')).toHaveText('Takes.');
}
async function begin(page: Page) {
  await page.getByRole('button', { name: 'Open production brief', exact: true }).click();
  await page.getByRole('button', { name: 'Begin production', exact: true }).click();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'production');
}
async function rehearse(page: Page) {
  await page.locator('[data-rehearse]').click();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-record]')).toBeEnabled();
}
async function frame(page: Page, kind: 'wide' | 'portrait', focus = 'mica') {
  await page.getByLabel('Shot assignment', { exact: true }).selectOption(kind);
  await page.getByLabel('Lens', { exact: true }).selectOption(kind === 'wide' ? '28' : '85');
  await page.getByLabel('Focal target', { exact: true }).selectOption(kind === 'wide' ? 'both' : focus);
}
async function recordKept(page: Page, total: number) {
  await expect(page.locator('.project-takes')).toHaveAttribute('data-coverage', 'ready');
  await page.locator('[data-record]').click();
  await expect(page.locator('[data-cut]')).toHaveText(`${total} / 6 in cut`);
}
async function rig(page: Page, value: string) {
  await page.locator('[data-camera-controls]').click();
  await page.locator('[data-rig]').selectOption(value);
  await page.getByRole('button', { name: 'Close Camera rig & framing', exact: true }).click();
}
async function cabinet(page: Page, x: string) {
  await page.locator('[data-blocking]').click();
  await page.locator('[data-prop-x]').fill(x);
  await page.getByRole('button', { name: 'Move cabinet', exact: true }).click();
  await expect(page.locator('[data-block-notice]')).toContainText('Cabinet moved');
  await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
}
async function downloadedText(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing Takes export stream.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('pure geometry agrees with the real Three projection and detects cabinet and rear-curtain occlusion', () => {
  const s = create(0), camera = openingCamera();
  const f = cameraFrame(camera, s.world);
  const threeCamera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(f.tangent)), 16 / 9, .1, 80);
  threeCamera.position.set(f.position.x, f.position.y, f.position.z);
  threeCamera.lookAt(f.target.x, f.target.y, f.target.z); threeCamera.updateMatrixWorld();
  for (const point of actorPoints(s.world.actors[0], s.world)) {
    const local = project(point, camera, s.world), actual = new THREE.Vector3(point.x, point.y, point.z).project(threeCamera);
    expect(local.x).toBeCloseTo((actual.x + 1) / 2, 9);
    expect(local.y).toBeCloseTo((1 - actual.y) / 2, 9);
  }
  expect(coverage(s.world.actors[0], camera, s.world)).toMatchObject({ inside: true, visible: 9 });
  s.world.prop.x = -1.8;
  expect(coverage(s.world.actors[0], camera, s.world).visible).toBeLessThan(8);
  expect(coverage(s.world.actors[1], { ...camera, rig: 'reverse' }, s.world).visible).toBe(0);
});

test('pure reducer protects atomic budgets, deterministic replay and continuity; smoke applies an opening performance', () => {
  const session = new GameSession(definition, 0);
  expect(() => session.dispatch({ type: 'record', shot: 'wide', camera: openingCamera() })).toThrow(AgentValidationError);
  session.dispatch({ type: 'start', brief: session.state.brief });
  const before = session.serialize(), revision = session.revision;
  const plan = purePlan();
  const illegal = { ...plan, actors: plan.actors.map(a => ({ ...a, mark: 'mica-mid' as const })) };
  expect(() => session.preview({ type: 'rehearse', cue: 'discover', note: '', plan: illegal })).toThrow(/own role/);
  expect(session.serialize()).toBe(before); expect(session.revision).toBe(revision);
  session.dispatch({ type: 'rehearse', cue: 'discover', note: '', plan });
  expect(session.state).toMatchObject({ scene: 0, film: 10, time: 23, rehearsals: 1, ready: true });
  const wrongCue = session.preview({ type: 'rehearse', cue: 'offer', note: '', plan: purePlan('offer') });
  expect(evaluate(wrongCue, 'wide', openingCamera()).reasons.join(' ')).toContain('needs the discover cue');
  session.dispatch({ type: 'record', shot: 'wide', camera: openingCamera() });
  const portrait = { ...openingCamera(), lens: 85, focus: 'mica' as const };
  expect(evaluate(session.state, 'portrait', portrait).kept).toBe(true);
  expect(evaluate(session.state, 'portrait', { ...portrait, rig: 'reverse' }).reasons.join(' ')).toMatch(/Screen direction reversed/);
  session.dispatch({ type: 'mark', mark: 'mica-mid', x: -2, z: 0 });
  expect(evaluate(session.state, 'portrait', portrait).reasons.join(' ')).toMatch(/Continuity changed/);
  const saved = session.serialize(); const clone = new GameSession(definition, 0); clone.restore(saved);
  expect(clone.state).toEqual(session.state);
  const forged: unknown = JSON.parse(saved);
  const parsed = object(forged, ['format', 'version', 'game', 'seed', 'commands']);
  expect(() => clone.restore(JSON.stringify({ ...parsed, commands: [{ type: 'next' }] }))).toThrow();
  expect(clone.serialize()).toBe(saved);
  smokeCase().verify(plan);
});

test('a complete legitimate UI production handles occlusion, screen direction, wrap, saved replay and real storyboard', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const calls = await installAgentFixture(page, ensemble);
  await open(page); expect(calls).toHaveLength(0); await begin(page); await rehearse(page);
  await cabinet(page, '-1.8');
  await page.locator('[data-record]').click();
  await expect(page.locator('[data-cut]')).toHaveText('0 / 6 in cut');
  await expect(page.locator('.project-takes [data-feedback]')).toContainText('sightlines');
  await cabinet(page, '-4'); await recordKept(page, 1);
  await frame(page, 'portrait');
  await page.locator('[data-blocking]').click();
  await page.locator('[data-mark]').selectOption('mica-mid');
  await page.locator('[data-mark-x]').fill('-2');
  await page.getByRole('button', { name: 'Move tape mark', exact: true }).click();
  await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
  await page.locator('[data-shot-notes]').click();
  await expect(page.locator('#takes-diagnostics')).toContainText('Continuity changed since the wide');
  await page.getByRole('button', { name: 'Close The camera report', exact: true }).click();
  await page.locator('[data-blocking]').click();
  await page.locator('[data-mark-x]').fill('-1.8');
  await page.getByRole('button', { name: 'Move tape mark', exact: true }).click();
  await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
  await rig(page, 'reverse');
  await page.locator('[data-shot-notes]').click();
  await expect(page.locator('#takes-diagnostics')).toContainText('Screen direction reversed');
  await page.getByRole('button', { name: 'Close The camera report', exact: true }).click();
  await page.locator('[data-record]').click();
  await rig(page, 'front'); await recordKept(page, 2);
  for (let scene = 1; scene < 3; scene++) {
    await page.locator('[data-next]').click();
    await expect(page.locator('.project-takes')).toHaveAttribute('data-scene', String(scene + 1));
    await expect(page.locator('[data-record]')).toBeDisabled();
    await rehearse(page); await recordKept(page, scene * 2 + 1);
    await frame(page, 'portrait', scene === 1 ? 'pip' : 'mica'); await recordKept(page, scene * 2 + 2);
  }
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'won');
  await expect(page.locator('[data-ending]')).toHaveText('Opening night · B');
  await expect(page.locator('[data-budget]')).toHaveText('2 film / 9 time');
  expect(calls).toHaveLength(3);
  expect(calls.every(c => !('camera' in c.observation))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('takes-wrap.png') });
  await page.locator('[data-wrap-sheet]').click();
  await expect(page.locator('[data-contact-sheet] img')).toHaveCount(8);
  const stills = await page.locator('[data-contact-sheet] img').evaluateAll(images => images.map(image => image.getAttribute('src')));
  expect(stills.every(src => src?.startsWith('data:image/png;base64,') && src.length > 2000)).toBe(true);
  expect(new Set(stills).size).toBeGreaterThan(4);
  const [storyboard] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export storyboard JSON', exact: true }).click()]);
  const exported = JSON.parse(await downloadedText(storyboard));
  expect(exported.format).toBe('takes-storyboard'); expect(exported.takes.filter((t: { result: { kept: boolean } }) => t.result.kept)).toHaveLength(6);
  expect(JSON.stringify(exported)).not.toMatch(/apiKey|endpoint|max_completion/);
  await page.locator('[data-take="2"]').click();
  await expect(page.locator('[data-playback]')).toContainText('TAKE 2');
  await expect(page.locator('[data-record]')).toBeDisabled();
  await page.locator('[data-live]').click();
  await page.locator('[data-notebook]').click();
  const [replay] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export replay', exact: true }).click()]);
  const encoded = await downloadedText(replay);
  const restored = new GameSession(definition); restored.restore(encoded);
  expect(restored.state.phase).toBe('won'); expect(restored.state.film).toBe(2);
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await page.locator('[data-restart]').click();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'setup');
  await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'takes-replay.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'won');
  await page.reload();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'won');
  expect(calls).toHaveLength(3);
});

test('contact-sheet snapshots match the recorded still during normal-motion tweens without changing the live theater', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const calls = await installAgentFixture(page, ensemble);
  await open(page); await begin(page); await rehearse(page); await recordKept(page, 1);
  const studio = page.locator('.project-takes'), canvas = page.locator('.takes-stage canvas');
  const closeSheet = page.getByRole('button', { name: 'Close Contact sheet / the little film', exact: true });
  await page.locator('[data-sheet]').click();
  const reference = await page.locator('[data-contact-sheet] img').getAttribute('src');
  expect(reference?.startsWith('data:image/png;base64,')).toBe(true);
  await closeSheet.click();
  // Keep the live camera aimed at the stationary actor, independently of the recorded camera.
  await page.getByLabel('Lens', { exact: true }).selectOption('50');
  await page.getByLabel('Focal target', { exact: true }).selectOption('pip');
  await page.locator('[data-blocking]').click();
  await page.locator('[data-mark]').selectOption('mica-mid');
  await page.locator('[data-mark-x]').fill('-3.8');
  await page.getByRole('button', { name: 'Move tape mark', exact: true }).click();
  await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
  await expect(studio).toHaveAttribute('data-moving', 'false');
  const clockStart = new Date('2026-09-07T12:00:00Z');
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(clockStart);
  for (const [index, x] of ['-1.8', '-3.8'].entries()) {
    await page.locator('[data-blocking]').click();
    await page.locator('[data-mark]').selectOption('mica-mid');
    await page.locator('[data-mark-x]').fill(x);
    await page.getByRole('button', { name: 'Move tape mark', exact: true }).click();
    await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
    // Advance real animation frames to an interior point, then hold time still across capture.
    await page.clock.runFor(50);
    await expect(studio).toHaveAttribute('data-moving', 'true');
    await expect(page.locator('[data-record]')).toBeDisabled();
    const before = await canvas.screenshot();
    await page.locator('[data-sheet]').click();
    const captured = await page.locator('[data-contact-sheet] img').getAttribute('src');
    expect(captured === reference, `Recorded pixels must match while moving ${index === 0 ? 'back to' : 'away from'} the recorded mark`).toBe(true);
    await expect(studio).toHaveAttribute('data-moving', 'true');
    await closeSheet.click();
    const after = await canvas.screenshot();
    expect(after.equals(before), 'Capturing must preserve the exact live puppet/camera frame').toBe(true);
    await expect(page.getByLabel('Lens', { exact: true })).toHaveValue('50');
    await expect(page.getByLabel('Focal target', { exact: true })).toHaveValue('pip');
    await expect(page.locator('[data-budget]')).toHaveText(`9 film / ${20 - index} time`);
    await page.clock.runFor(100);
    await expect(studio).toHaveAttribute('data-moving', 'true');
    const continuing = await canvas.screenshot();
    expect(continuing.equals(after), 'The same live tween must continue after capture').toBe(false);
    await page.clock.runFor(1000);
    await expect(studio).toHaveAttribute('data-moving', 'false');
    await expect(page.locator('[data-record]')).toBeEnabled();
    await page.locator('[data-blocking]').click();
    await expect(page.locator('[data-mark-x]')).toHaveValue(x);
    await page.getByRole('button', { name: 'Close Tape marks & practical prop', exact: true }).click();
  }
  await page.locator('[data-sheet]').click();
  expect(await page.locator('[data-contact-sheet] img').getAttribute('src') === reference).toBe(true);
  await closeSheet.click();
  await expect(studio).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('[data-cut]')).toHaveText('1 / 6 in cut');
  expect(calls).toHaveLength(1);
});

test('AI-selected marks alter the actual framing, with no film or scene consumed by rehearsal', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => ensemble(turn, turn.index === 0 ? 'near' : 'far'));
  await open(page); await begin(page); await rehearse(page);
  await frame(page, 'portrait');
  await page.locator('[data-shot-notes]').click();
  const first = await page.locator('#takes-diagnostics tbody tr').first().innerText();
  await page.getByRole('button', { name: 'Close The camera report', exact: true }).click();
  await rehearse(page);
  await page.locator('[data-shot-notes]').click();
  const second = await page.locator('#takes-diagnostics tbody tr').first().innerText();
  expect(second).not.toBe(first); expect(first).toContain('-0.9, 1.2'); expect(second).toContain('-3.3, -1.2');
  const size = (s: string) => Number(s.match(/(\d+)%/)?.[1]);
  expect(size(first)).toBeGreaterThan(size(second) + 15);
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 22 time');
  await expect(page.locator('.project-takes')).toHaveAttribute('data-scene', '1');
  expect(calls).toHaveLength(2);
});

test('ten locally recorded misses exhaust the film and require a fresh production', async ({ page }) => {
  const calls = await installAgentFixture(page, ensemble);
  await open(page); await begin(page); await rehearse(page);
  await page.getByLabel('Lens', { exact: true }).selectOption('85');
  for (let i = 0; i < 10; i++) {
    await page.locator('[data-record]').click();
    await expect(page.locator('.project-takes')).toHaveAttribute('data-film', String(9 - i));
  }
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-ending]')).toContainText('Out of film');
  await expect(page.locator('[data-cut]')).toHaveText('0 / 6 in cut');
  await expect(page.locator('[data-record]')).toBeDisabled();
  expect(calls).toHaveLength(1);
  await page.locator('[data-restart]').click();
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 24 time');
  await expect(page.locator('[data-take-count]')).toHaveText('0');
});

test('one illegal-plan correction is bounded and only the accepted plan enters the stage', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => turn.index === 0 ? { ...ensemble(turn), unexpected: true } : ensemble(turn));
  await open(page); await begin(page); await rehearse(page);
  expect(calls).toHaveLength(2);
  expect(calls[1].messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'tool', content: expect.stringContaining('unexpected') })]));
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 23 time');
  await expect(page.locator('[data-agent-status]')).toContainText('Keep the ritual clear');
});

test('two illegal plans and a provider failure are explicit, with no offline actor or resource commit', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = ensemble(turn); return { ...plan, actors: [plan.actors[0], plan.actors[0]] };
  });
  await open(page); await begin(page);
  await page.locator('[data-rehearse]').click();
  await expect(page.locator('.project-takes [data-feedback]')).toContainText('illegal plan twice');
  expect(calls).toHaveLength(2);
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 24 time');
  await expect(page.locator('.project-takes')).toHaveAttribute('data-ready', 'false');
  await page.unroute('**/api/openai/v1/chat/completions');
  let failures = 0;
  await page.route('**/api/openai/v1/chat/completions', async route => { failures++; await route.fulfill({ status: 503, body: '{"error":"fixture unavailable"}' }); });
  await page.locator('[data-rehearse]').click();
  await expect(page.locator('.project-takes [data-feedback]')).toContainText('HTTP 503');
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 24 time');
  await expect(page.locator('[data-supertitles]')).toHaveText('');
  expect(failures).toBe(1);
});

test('camera-only edits survive an in-flight rehearsal; restart rejects a late stale response', async ({ page }) => {
  let release: (() => void) | undefined;
  const calls = await installAgentFixture(page, async turn => {
    await new Promise<void>(resolve => { release = resolve; });
    return ensemble(turn);
  });
  await open(page); await begin(page);
  await page.locator('[data-rehearse]').click();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-agent-busy', 'true');
  await expect.poll(() => calls.length).toBe(1);
  await page.getByLabel('Lens', { exact: true }).selectOption('50');
  await page.getByLabel('Focal target', { exact: true }).selectOption('pip');
  release!();
  await expect(page.locator('[data-record]')).toBeEnabled();
  await expect(page.getByLabel('Lens', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Focal target', { exact: true })).toHaveValue('pip');
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 23 time');
  await page.locator('[data-rehearse]').click();
  await expect.poll(() => calls.length).toBe(2);
  await page.locator('[data-restart]').click();
  release!();
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'setup');
  await expect(page.locator('.project-takes')).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 24 time');
  await expect(page.locator('[data-supertitles]')).toHaveText('');
});

test('custom scripts, dialogue escaping, keyboard controls and modal shortcut guards work through the real UI', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = ensemble(turn);
    plan.actors[0].line = '<img src=x onerror="window.fakeVictory=true"> A very small cloud.';
    return plan;
  });
  await open(page);
  await page.locator('[data-brief]').click();
  await page.locator('[data-scenario]').selectOption('umbrella');
  await page.locator('[data-film-title]').fill('The Cloud’s Thank-you');
  await page.locator('[data-beat="0"]').fill('Find a cloud that insists it is a stamp.');
  await page.locator('[data-start]').click();
  const canvas = page.locator('.takes-stage canvas');
  await canvas.focus(); await page.keyboard.press('Space');
  await expect(page.locator('[data-record]')).toBeEnabled();
  expect(text((calls[0].observation.production as { title: string }).title, 'Title')).toBe('The Cloud’s Thank-you');
  await expect(page.locator('[data-supertitles] img')).toHaveCount(0);
  await expect(page.locator('[data-supertitles]')).toContainText('<img');
  await canvas.focus(); await page.keyboard.press('ArrowRight');
  await page.locator('[data-camera-controls]').click();
  await expect(page.locator('[data-rail]')).toHaveValue('0.25');
  await page.keyboard.press('r'); await expect(page.locator('[data-take-count]')).toHaveText('0');
  await page.keyboard.press('Escape');
  await canvas.focus(); await page.keyboard.press('c');
  await expect(page.locator('.project-takes')).toHaveAttribute('data-view', 'shot');
  await page.keyboard.press('r');
  await expect(page.locator('[data-cut]')).toHaveText('1 / 6 in cut');
  expect(calls).toHaveLength(1);
});

for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }]) {
  test(`theater and primary controls stay in one viewport at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await installAgentFixture(page, ensemble);
    await open(page); await begin(page); await rehearse(page);
    await expect(page.locator('.project-takes h1')).toBeInViewport();
    await expect(page.locator('[data-record]')).toBeInViewport();
    await expect(page.locator('[data-sheet]')).toBeInViewport();
    const sizes = await page.locator('.takes-stage').evaluate(el => ({
      height: el.getBoundingClientRect().height, pageHeight: document.documentElement.scrollHeight,
      pageWidth: document.documentElement.scrollWidth, viewport: innerHeight,
    }));
    expect(sizes.height).toBeGreaterThan(170);
    expect(sizes.pageHeight).toBeLessThanOrEqual(viewport.height + 2); expect(sizes.pageWidth).toBeLessThanOrEqual(viewport.width);
    const menu = await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox();
    const next = await page.locator('[data-next]').boundingBox();
    const sheet = await page.locator('[data-sheet]').boundingBox();
    expect(menu && next && sheet && next.y + next.height <= menu.y && sheet.y + sheet.height <= menu.y).toBeTruthy();
    await page.locator('[data-view="shot"]').click();
    await recordKept(page, 1);
    await frame(page, 'portrait'); await recordKept(page, 2);
    await page.locator('[data-next]').click();
    await expect(page.locator('.project-takes')).toHaveAttribute('data-scene', '2');
    await page.screenshot({ path: testInfo.outputPath(`takes-${viewport.width}.png`) });
    expect(calls).toHaveLength(1);
  });
}

test('invalid native replay import is atomic and opening the page never calls models', async ({ page }) => {
  await configureFixtureConnection(page);
  let count = 0;
  await page.route('**/api/openai/v1/**', async route => { count++; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(nativeToolResponse('block_the_scene', purePlan())) }); });
  await open(page); await page.locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({
    name: 'forged.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'odd-index-game', version: 1, game: 'takes', seed: 0, commands: [{ type: 'record', shot: 'wide', camera: openingCamera() }] })),
  });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator('.project-takes')).toHaveAttribute('data-phase', 'setup');
  await expect(page.locator('[data-budget]')).toHaveText('10 film / 24 time');
  expect(count).toBe(0);
});

test('pure full-production resource rules cannot replay past a terminal loss', () => {
  let state = create(0); state = reduce(state, { type: 'start', brief: state.brief });
  state = reduce(state, { type: 'rehearse', cue: 'discover', note: '', plan: purePlan() });
  for (let i = 0; i < 10; i++) state = reduce(state, { type: 'record', shot: 'wide', camera: { ...openingCamera(), lens: 85 } });
  expect(state.phase).toBe('lost'); expect(state.film).toBe(0);
  expect(() => reduce(state, { type: 'next' })).toThrow(AgentValidationError);
  expect(() => reduce(state, { type: 'rehearse', cue: 'offer', note: '', plan: purePlan('offer') })).toThrow(AgentValidationError);
});
