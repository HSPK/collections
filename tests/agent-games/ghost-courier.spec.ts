import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { AgentValidationError } from '../../src/core/agents/errors';
import { GameSession } from '../../src/core/games/session';
import { CASES } from '../../src/projects/ghost-courier/data';
import type { NodeId } from '../../src/projects/ghost-courier/data';
import { create, definition, echoAt, exits, forecast, parsePlan, reduce } from '../../src/projects/ghost-courier/engine';
import type { Plan, State } from '../../src/projects/ghost-courier/engine';
import { observation, patrolTool, smokeCase } from '../../src/projects/ghost-courier/agent';

const url = './projects/ghost-courier/';
function planFor(heist = 0, offset = 0): Plan {
  return {
    assignments: [
      { guard: 'needle', circuit: CASES[heist].circuits[0].id, offset },
      { guard: 'rivet', circuit: CASES[heist].circuits[1].id, offset: 0 },
    ],
    bulletin: 'The canal and foundry approaches are under watch.',
  };
}
function fixturePlan(turn: FixtureTurn): Plan { return planFor(Number(turn.observation.heist) - 1); }
function walk(state: State, path: NodeId[]): State { return path.reduce((s, to) => reduce(s, { type: 'move', to }), state); }
async function move(page: Page, names: string[]) {
  for (const name of names) await page.getByRole('button', { name: `Move to ${name}`, exact: true }).click();
}
async function rewind(page: Page) {
  await page.locator('[data-rewind]').click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('strong[data-beat]')).toHaveText(/0 \//);
}
async function start(page: Page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Begin campaign', exact: true }).click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'running');
}

test('pure rules: named legal plans, strict parsing, meaningful smoke and no speculative moves', () => {
  const initial = create(72);
  expect(() => reduce(initial, { type: 'move', to: 'steps' })).toThrow(AgentValidationError);
  const smoke = smokeCase();
  smoke.request.validate(planFor());
  smoke.verify(planFor());
  expect(smoke.request.tool.name).toBe('assign_clockwork_patrol');
  const active = reduce(initial, { type: 'plan', intent: 'start', plan: planFor() });
  expect(active.tick).toBe(0);
  expect(active.loop).toBe(1);
  expect(initial.phase).toBe('ready');
  expect(() => reduce(active, { type: 'plan', intent: 'start', plan: planFor() })).toThrow(AgentValidationError);
  expect(() => reduce(initial, { type: 'plan', intent: 'start', plan: planFor(1) })).toThrow(AgentValidationError);
  expect(() => parsePlan({ ...planFor(), extra: true })).toThrow(AgentValidationError);
  expect(() => parsePlan({ ...planFor(), bulletin: 'x'.repeat(181) })).toThrow(AgentValidationError);
  expect(() => patrolTool.parse({ assignments: [{ guard: 'needle', circuit: 'invented', offset: 0 }], bulletin: 'bad' })).toThrow(AgentValidationError);
  expect(() => reduce(initial, { type: 'plan', intent: 'start', plan: { ...planFor(), assignments: [planFor().assignments[0], planFor().assignments[0]] } })).toThrow(AgentValidationError);
  expect(() => reduce(active, { type: 'setup', cases: CASES.map(c => c.settings) })).toThrow(AgentValidationError);
});

test('pure rules: adjacency, echo departure timing, distraction and immutable resources', () => {
  let s = reduce(create(72), { type: 'plan', intent: 'start', plan: planFor() });
  expect(() => reduce(s, { type: 'plan', intent: 'rewind', plan: planFor() })).toThrow(AgentValidationError);
  expect(() => reduce(s, { type: 'move', to: 'vault' })).toThrow(AgentValidationError);
  expect(() => reduce(s, { type: 'deliver' })).toThrow(AgentValidationError);
  const atBridge = walk(s, ['steps', 'fork', 'bridge']);
  expect(() => reduce(atBridge, { type: 'move', to: 'vault' })).toThrow(/Shutter locked/);
  s = walk(s, ['steps', 'fork', 'relay']);
  const before = JSON.stringify(s);
  const o = observation(s, 'rewind');
  expect(o.recordedRoutes[0].path).toEqual(['dock', 'steps', 'fork', 'relay']);
  let next = reduce(s, { type: 'plan', intent: 'rewind', plan: planFor(0, 1) });
  expect(JSON.stringify(s)).toBe(before);
  expect(next.echoes[0]).toEqual(s.trace);
  expect(echoAt(next.echoes[0], 18)).toBe('relay');
  expect(forecast(next)[0]).toMatchObject({ from: 'alley', to: 'alley', decoy: true });
  next = reduce(next, { type: 'move', to: 'steps' });
  expect(next.guards[0].distracted).toBe(true);
  expect(next.guards[0].index).toBe(1);
  expect(forecast(next)[0].decoy).toBe(false);
  next = walk(next, ['fork', 'bridge']);
  expect(exits(next).find(e => e.to === 'vault')?.open).toBe(true);
  next = reduce(next, { type: 'move', to: 'vault' });
  expect(next.carrying).toBe(true);
});

test('pure rules: collisions, edge swaps and complete loss budgets', () => {
  const swap = walk(reduce(create(72), { type: 'plan', intent: 'start', plan: planFor() }), ['steps', 'alley']);
  expect(swap.suspicion).toBe(2);
  let s = reduce(create(72), { type: 'plan', intent: 'start', plan: planFor(0, 1) });
  s = reduce(s, { type: 'move', to: 'steps' });
  expect(s.suspicion).toBe(2);
  s = reduce(s, { type: 'move', to: 'quay' });
  expect(s.suspicion).toBe(4);
  s = reduce(s, { type: 'move', to: 'alley' });
  expect(s.phase).toBe('caught');
  expect(() => reduce(s, { type: 'wait' })).toThrow(AgentValidationError);
  for (let loop = 2; loop <= 3; loop++) {
    s = reduce(s, { type: 'plan', intent: 'rewind', plan: planFor() });
    for (let i = 0; i < 18; i++) s = reduce(s, { type: 'wait' });
  }
  expect(s.phase).toBe('lost');
  expect(() => reduce(s, { type: 'plan', intent: 'rewind', plan: planFor() })).toThrow(AgentValidationError);
  expect(() => reduce(s, { type: 'wait' })).toThrow(AgentValidationError);
});

test('authored city graphs contain only reachable cyclic circuits and real pressure switches', () => {
  for (const heist of CASES) {
    const reached = new Set<NodeId>(['dock']);
    for (let pass = 0; pass < heist.nodes.length; pass++) {
      for (const edge of heist.edges) {
        if (reached.has(edge.a)) reached.add(edge.b);
        if (reached.has(edge.b)) reached.add(edge.a);
        if (edge.switch) expect(heist.nodes.find(n => n.id === edge.switch)?.kind).toBe('switch');
      }
    }
    expect(reached.size).toBe(heist.nodes.length);
    for (const circuit of heist.circuits) {
      expect(circuit.nodes).not.toContain('dock');
      for (let i = 0; i < circuit.nodes.length; i++) {
        const a = circuit.nodes[i], b = circuit.nodes[(i + 1) % circuit.nodes.length];
        expect(heist.edges.some(e => (e.a === a && e.b === b) || (e.b === a && e.a === b))).toBe(true);
      }
    }
  }
});

test('delivery consumes a beat: alarm takes precedence but a safe final-beat delivery succeeds', () => {
  let initial = reduce(create(72), { type: 'setup', cases: CASES.map(c => ({ ...c.settings, beats: 16, alarm: 4 })) });
  initial = reduce(initial, { type: 'plan', intent: 'start', plan: planFor() });
  const recorded = walk(initial, ['steps', 'fork', 'relay']);
  const roofPlan = planFor();
  roofPlan.assignments[1].circuit = 'roof-line';
  let dangerous = reduce(recorded, { type: 'plan', intent: 'rewind', plan: roofPlan });
  dangerous = walk(dangerous, ['steps']);
  dangerous = reduce(dangerous, { type: 'wait' });
  expect(dangerous.suspicion).toBe(2);
  dangerous = walk(dangerous, ['fork', 'bridge', 'vault', 'gantry', 'drop']);
  expect(dangerous.phase).toBe('running');
  dangerous = reduce(dangerous, { type: 'deliver' });
  expect(dangerous.suspicion).toBe(4);
  expect(dangerous.phase).toBe('caught');
  expect(dangerous.deliveries).toBe(0);
  let safe = reduce(recorded, { type: 'plan', intent: 'rewind', plan: planFor() });
  safe = walk(safe, ['steps', 'fork', 'bridge', 'vault', 'gantry', 'drop']);
  while (safe.tick < 15) safe = reduce(safe, { type: 'wait' });
  safe = reduce(safe, { type: 'deliver' });
  expect(safe.phase).toBe('delivered');
  expect(safe.tick).toBe(16);
});

test('pure replay: full command chain validates atomically; reset revision is monotonic', () => {
  const session = new GameSession(definition, 72);
  session.dispatch({ type: 'plan', intent: 'start', plan: planFor() });
  session.dispatch({ type: 'move', to: 'steps' });
  const encoded = session.serialize();
  const before = JSON.stringify(session.state);
  const tampered = JSON.parse(encoded);
  tampered.commands.push({ type: 'move', to: 'vault' });
  expect(() => session.restore(JSON.stringify(tampered))).toThrow(AgentValidationError);
  expect(JSON.stringify(session.state)).toBe(before);
  const revision = session.revision;
  session.reset();
  expect(session.revision).toBeGreaterThan(revision);
  session.restore(encoded);
  expect(session.state.position).toBe('steps');
  expect(session.serialize()).toBe(encoded);
});

test('survey is honest and idle; all three case files are editable without a request', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Ghost Courier', exact: true })).toBeVisible();
  await expect(page.locator('[data-brief]')).toContainText('Model required');
  await expect(page.getByRole('button', { name: 'Move to Steps', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cases', exact: true }).click();
  await page.getByLabel('Survey district').selectOption('2');
  await expect(page.locator('[data-title]')).toHaveText('An hour for everyone');
  await page.locator('[name="beats-0"]').fill('24');
  await page.locator('[name="alarm-1"]').fill('8');
  await page.locator('[name="loops-2"]').fill('4');
  await page.getByRole('button', { name: 'Apply case budgets' }).click();
  await expect(page.locator('[data-case-status]')).toContainText('updated');
  await page.getByRole('button', { name: 'Close Editable case files' }).click();
  await expect(page.locator('strong[data-beat]')).toHaveText('0 / 24');
  expect(calls).toHaveLength(0);
});

test('model-selected patrol changes mechanics and reads the recorded route, not decorative text', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    if (turn.index === 0) return planFor();
    const plan = planFor(0, 1);
    plan.assignments[1].circuit = 'roof-line';
    plan.bulletin = '<img src=x onerror=alert(1)> The relay recording is noticed.';
    return plan;
  });
  await start(page);
  await expect(page.locator('[data-forecast]')).toContainText('R: Kiln > Market');
  await move(page, ['Steps', 'Fork', 'Relay']);
  expect(calls).toHaveLength(1);
  await rewind(page);
  expect(calls).toHaveLength(2);
  expect(calls[1].observation.recordedRoutes).toEqual([{ loop: 1, path: ['dock', 'steps', 'fork', 'relay'], outcome: 'running' }]);
  await expect(page.locator('[data-forecast]')).toContainText('Alley > Alley (echo pause)');
  await expect(page.locator('[data-forecast]')).toContainText('R: Tower > Gantry');
  await page.getByRole('button', { name: 'Intel', exact: true }).click();
  await expect(page.locator('#ghost-courier-intel')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#ghost-courier-intel img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Warden forecast & echoes' }).click();
  await move(page, ['Steps']);
  await expect(page.locator('strong[data-alarm]')).toHaveText('0 / 6');
});

test('UI campaign wins all three heists with one, then two pressure-holding echoes', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page);
  await move(page, ['Steps', 'Fork', 'Relay']);
  await rewind(page);
  await move(page, ['Steps', 'Fork', 'Bridge', 'Vault', 'Gantry', 'Dead letter']);
  await page.locator('[data-deliver]').click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'delivered');
  await page.getByRole('button', { name: 'Open next heist' }).click();
  await expect(page.locator('[data-heist]')).toHaveText('2 / 3');
  await move(page, ['Steps', 'Landing', 'Relay']);
  await rewind(page);
  await move(page, ['Steps', 'Fork']);
  await page.getByRole('button', { name: 'Move to Bridge; requires relay' }).click();
  await expect(page.locator('[data-status]')).toContainText('Shutter locked');
  await expect(page.locator('strong[data-beat]')).toHaveText('2 / 20');
  await page.locator('[data-wait]').click();
  await move(page, ['Bridge', 'Vault', 'Gantry', 'Dead letter']);
  await page.locator('[data-deliver]').click();
  await page.getByRole('button', { name: 'Open next heist' }).click();
  await expect(page.locator('[data-heist]')).toHaveText('3 / 3');
  await move(page, ['Steps', 'Fork', 'Relay']);
  await rewind(page);
  await move(page, ['Steps', 'Fork', 'Balcony', 'Brake']);
  await rewind(page);
  await move(page, ['Steps', 'Fork', 'Bridge', 'Vault', 'Gantry', 'Dead letter']);
  await page.locator('[data-deliver]').click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'won');
  await expect(page.locator('[data-status]')).toContainText('Tomorrow belongs to everyone');
  expect(calls).toHaveLength(7);
  await page.getByRole('button', { name: 'Restart campaign', exact: true }).click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'ready');
  expect(calls).toHaveLength(7);
});

test('UI campaign loses after exhausting every loop; no extra move or rewind is charged', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page);
  for (let loop = 1; loop <= 3; loop++) {
    for (let beat = 0; beat < 18; beat++) await page.locator('[data-wait]').click();
    await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', loop === 3 ? 'lost' : 'caught');
    if (loop === 1) {
      await page.keyboard.press('r');
      await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'running');
      await expect(page.locator('strong[data-loop]')).toHaveText('2 / 3');
    } else if (loop < 3) await rewind(page);
  }
  await expect(page.locator('[data-status]')).toContainText('No loops remain');
  await expect(page.locator('[data-wait]')).toBeDisabled();
  await expect(page.locator('[data-rewind]')).toBeDisabled();
  expect(calls).toHaveLength(3);
  await page.getByRole('button', { name: 'Restart campaign', exact: true }).click();
  await expect(page.locator('strong[data-loop]')).toHaveText('0 / 3');
});

test('invalid model output repairs once; a twice-invalid rewind is fully atomic', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => turn.index === 1 ? planFor() : planFor(1));
  await start(page);
  expect(calls).toHaveLength(2);
  expect(JSON.stringify(calls[1].messages)).toContain('Correct this plan');
  await move(page, ['Steps', 'Fork', 'Relay']);
  await page.locator('[data-rewind]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('illegal plan twice');
  await expect(page.locator('strong[data-loop]')).toHaveText('1 / 3');
  await expect(page.locator('strong[data-beat]')).toHaveText('3 / 18');
  await expect(page.locator('[data-echoes]')).toContainText('No recordings');
  await expect(page.locator('[data-wait]')).toBeEnabled();
  expect(calls).toHaveLength(4);
});

test('reset cancels a delayed model result without spending a loop', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async turn => { if (turn.index === 0) await gate; return planFor(); });
  await page.goto(url);
  await page.getByRole('button', { name: 'Begin campaign', exact: true }).click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-agent-busy', 'true');
  await expect(page.locator('strong[data-loop]')).toHaveText('0 / 3');
  await expect(page.locator('[data-wait]')).toBeDisabled();
  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  release();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('[data-agent-status]')).toContainText('cancelled');
  await page.getByRole('button', { name: 'Begin campaign', exact: true }).click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'running');
  expect(calls).toHaveLength(2);
});

test('diorama picking and label changes preserve an in-flight model turn', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await installAgentFixture(page, async () => { await gate; return planFor(); });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Begin campaign', exact: true }).click();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-agent-busy', 'true');
  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  const bounds = (await page.locator('canvas').boundingBox())!;
  const points = CASES[0].nodes.map(n => ({ id: n.id, x: (n.x - n.y) * 46, y: (n.x + n.y) * 23 - n.z * 67 }));
  const minX = Math.min(...points.map(p => p.x)) - 90, maxX = Math.max(...points.map(p => p.x)) + 100;
  const minY = Math.min(...points.map(p => p.y)) - 110, maxY = Math.max(...points.map(p => p.y)) + 145;
  const scale = Math.min((bounds.width - 24) / (maxX - minX), (bounds.height - 72) / (maxY - minY));
  const steps = points.find(n => n.id === 'steps')!;
  await page.mouse.click(bounds.x + bounds.width / 2 + (steps.x - (minX + maxX) / 2) * scale,
    bounds.y + bounds.height / 2 + 15 + (steps.y - (minY + maxY) / 2) * scale);
  await expect(page.locator('[data-selection]')).toHaveText('Selected / Steps');
  release();
  await expect(page.locator('.project-ghost-courier')).toHaveAttribute('data-phase', 'running');
  await expect(page.locator('strong[data-loop]')).toHaveText('1 / 3');
  await page.screenshot({ path: testInfo.outputPath('ghost-courier-diorama.png') });
  expect(errors).toEqual([]);
});

test('save, reload and native replay import restore only validated commands without an API', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page);
  await move(page, ['Steps', 'Fork', 'Relay']);
  await rewind(page);
  await move(page, ['Steps', 'Fork', 'Bridge']);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay' }).click();
  const download = await downloadEvent;
  const file = await download.path();
  expect(file).not.toBeNull();
  await page.getByRole('button', { name: 'Close Game notebook' }).click();
  await page.reload();
  await expect(page.locator('[data-position]')).toHaveText('At Bridge');
  expect(calls).toHaveLength(2);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Import a replay').setInputFiles(file!);
  await expect(page.locator('[data-game-save-status]')).toContainText('Every recorded move passed');
  await expect(page.locator('[data-position]')).toHaveText('At Bridge');
  await page.getByLabel('Import a replay').setInputFiles({
    name: 'illegal-ghost-courier.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'odd-index-game', version: 1, game: 'ghost-courier', seed: 72, commands: [{ type: 'move', to: 'vault' }] })),
  });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator('[data-position]')).toHaveText('At Bridge');
  expect(calls).toHaveLength(2);
});

for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }]) {
  test(`keyboard and reachable primary actions at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installAgentFixture(page, fixturePlan);
    await start(page);
    const scene = await page.locator('[data-scene]').boundingBox();
    expect(scene).not.toBeNull();
    expect(scene!.width * scene!.height).toBeGreaterThanOrEqual(viewport.width * viewport.height / 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Ghost Courier', exact: true })).toBeVisible();
    await page.locator('canvas').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-position]')).toHaveText('At Steps');
    await page.keyboard.press('w');
    await expect(page.locator('strong[data-beat]')).toHaveText('2 / 18');
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('w');
    await expect(page.locator('strong[data-beat]')).toHaveText('2 / 18');
    await page.getByRole('button', { name: 'Close Courier field manual' }).click();
    await page.getByRole('button', { name: 'Model settings' }).click();
    await page.locator('[data-agent-model]').fill('w');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('strong[data-beat]')).toHaveText('2 / 18');
    await page.getByRole('button', { name: 'Close Model connection' }).click();
    const menu = await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox();
    for (const selector of ['[data-wait]', '[data-deliver]', '[data-rewind]', '[data-turn]']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.x + box!.width <= menu!.x || box!.y + box!.height <= menu!.y).toBe(true);
    }
    await page.locator('[data-wait]').click();
    await expect(page.locator('strong[data-beat]')).toHaveText('3 / 18');
    if (viewport.width === 320) await expect(page.locator('[data-map-forecast]')).toContainText('Needle: Alley');
    await page.screenshot({ path: testInfo.outputPath(`ghost-courier-${viewport.width}.png`) });
  });
}
