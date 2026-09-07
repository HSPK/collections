import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installAgentFixture, configureFixtureConnection } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { definition, tasksFor, finalScore } from '../../src/projects/mise/engine';
import type { Plan, State, Task } from '../../src/projects/mise/engine';
import { crewTool, observation, smokeCase } from '../../src/projects/mise/agent';
import { STAFF_IDS, HOBS, INGREDIENTS, RECIPES } from '../../src/projects/mise/data';
import type { StaffId } from '../../src/projects/mise/data';

const URL = './projects/mise/';
const SAVE = 'odd-index:game:mise:v1';

function planFor(state: State, selections: Partial<Record<StaffId, string>>): Plan {
  return {
    assignments: STAFF_IDS.map(staff => ({ staff, taskId: selections[staff] ?? (state.jobs.some(job => job.staff === staff) ? 'continue' : 'wait') })),
    intention: 'Coordinate the kitchen with legal reservations.',
  };
}
function taskId(state: State, staff: StaffId, kind: Task['kind'], target?: string, station?: string) {
  const task = tasksFor(state, staff).find(item => item.kind === kind && (!target || item.target === target) && (!station || item.station === station));
  expect(task, `${staff} needs a legal ${kind} for ${target}`).toBeTruthy();
  return task!.id;
}
function openSession() {
  const session = new GameSession(definition, 79);
  session.dispatch({ type: 'open' });
  return session;
}

// Fixture policy uses only the public, real-client observation and its legal catalogs.
function coordinated(turn: FixtureTurn): Plan {
  const obs = turn.observation as ReturnType<typeof observation>;
  const orderFor = (task: Task) => obs.orders.find(order => task.target === order.id || task.target.startsWith(`${order.id}:`));
  function weight(staff: StaffId, task: Task) {
    if (task.kind === 'wait' || task.kind === 'continue') return 0;
    const order = orderFor(task)!;
    const score = { serve: 180, plate: 150, cook: 65, prep: 35 }[task.kind];
    const early = (40 - order.deadline) * 2;
    const specialty = (task.kind === 'prep' && staff === 'nell') || (task.kind === 'cook' && staff === 'sol') || ((task.kind === 'plate' || task.kind === 'serve') && staff === 'ivo') ? 12 : 0;
    const hot = task.kind === 'plate' && order.parts.some(part => part.hob) ? 50 : 0;
    const pinned = order.id === obs.player.pinnedTicket ? 9 : 0;
    return score + early + specialty + hot + pinned - task.beats * 4;
  }
  let best = -Infinity;
  let selected: Plan['assignments'] = [];
  function visit(index: number, tasks: { staff: StaffId; task: Task }[], score: number) {
    if (index === obs.crew.length) {
      if (score > best) { best = score; selected = tasks.map(item => ({ staff: item.staff, taskId: item.task.id })); }
      return;
    }
    const staff = obs.crew[index];
    const sorted = [...staff.legalTasks].sort((a, b) => weight(staff.id, b) - weight(staff.id, a));
    for (const task of sorted) {
      if (task.kind !== 'wait' && task.kind !== 'continue' && tasks.some(other =>
        other.task.kind !== 'wait' && other.task.kind !== 'continue' &&
        (other.task.station === task.station || other.task.target === task.target))) continue;
      const used = Object.fromEntries(INGREDIENTS.map(id => [id, 0])) as Record<typeof INGREDIENTS[number], number>;
      for (const item of [...tasks, { staff: staff.id, task }]) if (item.task.kind === 'prep') {
        const order = orderFor(item.task)!;
        const recipe = RECIPES[order.recipe].components.find(part => item.task.target === `${order.id}:${part.id}`)!;
        for (const ingredient of INGREDIENTS) used[ingredient] += recipe.stock[ingredient] ?? 0;
      }
      if (INGREDIENTS.some(id => used[id] > obs.budgets.stock[id])) continue;
      visit(index + 1, [...tasks, { staff: staff.id, task }], score + weight(staff.id, task));
    }
  }
  visit(0, [], 0);
  expect(selected).toHaveLength(3);
  return { assignments: selected, intention: 'Nell prepares ahead; Sol balances the pans; Ivo clears the pass.' };
}

test.describe('Mise engine', () => {
  test('distinct coordinated plans advance actual prep and enforce simultaneous dependencies', () => {
    const first = openSession(), second = openSession();
    first.dispatch({ type: 'plan', plan: planFor(first.state, {
      nell: taskId(first.state, 'nell', 'prep', 'S1-1:roast', 'prep-a'),
      ivo: taskId(first.state, 'ivo', 'prep', 'S1-1:ribbon', 'prep-b'),
    }) });
    second.dispatch({ type: 'plan', plan: planFor(second.state, {
      nell: taskId(second.state, 'nell', 'prep', 'S1-2:velvet', 'prep-a'),
      sol: taskId(second.state, 'sol', 'prep', 'S1-2:crumble', 'prep-b'),
    }) });
    expect(first.state.orders[0].parts[0].stage).toBe('prepared');
    expect(second.state.orders[0].parts[0].stage).toBe('raw');
    expect(second.state.orders[1].parts[0].stage).toBe('prepared');
    expect(first.state.stock.root).toBe(second.state.stock.root - 1);
    expect(first.state.jobs[0]).toMatchObject({ staff: 'ivo', kind: 'prep', left: 1 });
    expect(first.state.activity.nell).toMatchObject({ kind: 'prep', station: 'prep-a', target: 'S1-1:roast' });
    expect(first.state.activity.ivo.station).toBe('prep-b');
    expect(tasksFor(first.state, 'ivo').map(task => task.id)).toEqual(['continue']);
    const before = first.serialize();
    expect(() => first.dispatch({ type: 'plan', plan: planFor(first.state, {
      sol: 'plate/S1-1/pass-a',
    }) })).toThrow(AgentValidationError);
    expect(first.serialize()).toBe(before);
  });

  test('station, target, staff, pantry, layout and phase constraints are atomic', () => {
    const session = openSession(), original = session.serialize();
    const sameStation = planFor(session.state, {
      nell: taskId(session.state, 'nell', 'prep', 'S1-1:roast', 'prep-a'),
      sol: taskId(session.state, 'sol', 'prep', 'S1-1:ribbon', 'prep-a'),
    });
    expect(() => session.preview({ type: 'plan', plan: sameStation })).toThrow(/double-booked/);
    const sameTarget = planFor(session.state, {
      nell: taskId(session.state, 'nell', 'prep', 'S1-1:roast', 'prep-a'),
      sol: taskId(session.state, 'sol', 'prep', 'S1-1:roast', 'prep-b'),
    });
    expect(() => session.dispatch({ type: 'plan', plan: sameTarget })).toThrow(/two staff/);
    const duplicateStaff = planFor(session.state, {});
    duplicateStaff.assignments[1].staff = 'nell';
    expect(() => session.preview({ type: 'plan', plan: duplicateStaff })).toThrow(/exactly once/);
    expect(() => session.dispatch({ type: 'layout', value: 'pass' })).toThrow(/before service/);
    expect(() => session.dispatch({ type: 'next' })).toThrow();
    expect(session.serialize()).toBe(original);
    const scarce = structuredClone(session.state);
    scarce.stock.root = 1;
    const scarcePlan = planFor(scarce, {
      nell: taskId(scarce, 'nell', 'prep', 'S1-1:roast', 'prep-a'),
      sol: taskId(scarce, 'sol', 'prep', 'S1-3:roast', 'prep-b'),
    });
    expect(() => definition.reduce(scarce, { type: 'plan', plan: scarcePlan })).toThrow(/stock/);
    expect(scarce.stock.root).toBe(1);
    expect(scarce.tick).toBe(0);
    expect(() => crewTool.parse({ ...sameStation, url: 'https://invalid.example' })).toThrow();
  });

  test('hot dependencies, burns, stock exhaustion and player heat control are real', () => {
    const session = new GameSession(definition);
    session.dispatch({ type: 'prestock', target: 'S1-1:roast' });
    session.dispatch({ type: 'prestock', target: 'S1-1:ribbon' });
    session.dispatch({ type: 'open' });
    session.dispatch({ type: 'plan', plan: planFor(session.state, { sol: taskId(session.state, 'sol', 'cook', 'S1-1:roast') }) });
    expect(session.state.orders[0].parts[0]).toMatchObject({ heat: 2, stage: 'cooking' });
    expect(tasksFor(session.state, 'ivo').some(task => task.kind === 'plate')).toBe(false);
    session.dispatch({ type: 'hold' });
    expect(session.state.orders[0].parts[0].stage).toBe('ready');
    const safe = new GameSession(definition); safe.restore(session.serialize());
    safe.dispatch({ type: 'heat', hob: 'hob-a', value: 0 });
    safe.dispatch({ type: 'hold' }); safe.dispatch({ type: 'hold' });
    expect(safe.state.orders[0].parts[0]).toMatchObject({ stage: 'ready', heat: 4 });
    session.dispatch({ type: 'hold' }); session.dispatch({ type: 'hold' });
    expect(session.state.orders[0].parts[0]).toMatchObject({ stage: 'burnt', hob: null, heat: 8 });
    expect(session.state.waste).toBe(1);
    const exhausted = structuredClone(session.state); exhausted.stock.root = 0;
    expect(tasksFor(exhausted, 'nell').some(task => task.target === 'S1-1:roast')).toBe(false);
    safe.dispatch({ type: 'plan', plan: planFor(safe.state, { ivo: taskId(safe.state, 'ivo', 'plate', 'S1-1') }) });
    expect(safe.state.orders[0]).toMatchObject({ status: 'plated', pass: 'pass-a' });
    expect(safe.state.orders[0].parts.every(part => part.hob === null)).toBe(true);
    expect(tasksFor(safe.state, 'nell').some(task => task.station === 'pass-a' && task.kind === 'plate')).toBe(false);
    safe.dispatch({ type: 'plan', plan: planFor(safe.state, { ivo: taskId(safe.state, 'ivo', 'serve', 'S1-1') }) });
    expect(safe.state.served).toBe(1);
    expect(safe.state.orders[0].quality).toBeGreaterThanOrEqual(85);
  });

  test('tickets expire on their final serving beat and release staff, stations and task catalogs', () => {
    const session = openSession();
    const deadline = session.state.orders[0].deadline;
    while (session.state.tick < deadline - 1) session.dispatch({ type: 'hold' });
    const staleTask = taskId(session.state, 'nell', 'prep', 'S1-1:roast', 'prep-a');
    session.dispatch({ type: 'plan', plan: planFor(session.state, {
      sol: taskId(session.state, 'sol', 'prep', 'S1-1:roast', 'prep-a'),
    }) });
    expect(session.state.tick).toBe(deadline);
    expect(session.state.orders[0]).toMatchObject({ status: 'missed', pass: null, servedAt: null });
    expect(session.state.missed).toBe(1);
    expect(session.state.jobs).toEqual([]);
    expect(session.state.orders[0].parts.every(part => part.hob === null)).toBe(true);
    for (const staff of STAFF_IDS) {
      expect(tasksFor(session.state, staff).every(task => !task.target.startsWith('S1-1'))).toBe(true);
    }
    const before = session.serialize(), stock = structuredClone(session.state.stock);
    expect(() => session.dispatch({ type: 'plan', plan: planFor(session.state, { nell: staleTask }) })).toThrow('not currently legal');
    expect(session.serialize()).toBe(before);
    expect(session.state.stock).toEqual(stock);
  });

  test('serving on the exact deadline succeeds while an unserved plated dish frees its pass immediately', () => {
    const session = new GameSession(definition);
    session.dispatch({ type: 'prestock', target: 'S1-1:roast' });
    session.dispatch({ type: 'prestock', target: 'S1-1:ribbon' });
    session.dispatch({ type: 'open' });
    session.dispatch({ type: 'plan', plan: planFor(session.state, {
      sol: taskId(session.state, 'sol', 'cook', 'S1-1:roast', 'hob-a'),
    }) });
    session.dispatch({ type: 'hold' });
    session.dispatch({ type: 'heat', hob: 'hob-a', value: 0 });
    session.dispatch({ type: 'plan', plan: planFor(session.state, {
      ivo: taskId(session.state, 'ivo', 'plate', 'S1-1', 'pass-a'),
    }) });
    const deadline = session.state.orders[0].deadline;
    while (session.state.tick < deadline - 1) session.dispatch({ type: 'hold' });
    const unserved = new GameSession(definition);
    unserved.restore(session.serialize());
    session.dispatch({ type: 'plan', plan: planFor(session.state, {
      ivo: taskId(session.state, 'ivo', 'serve', 'S1-1', 'pass-a'),
    }) });
    expect(session.state.orders[0]).toMatchObject({ status: 'served', servedAt: deadline, pass: null });
    expect(session.state.missed).toBe(0);
    unserved.dispatch({ type: 'hold' });
    expect(unserved.state.orders[0]).toMatchObject({ status: 'missed', servedAt: null, pass: null });
    expect(unserved.state.missed).toBe(1);
  });

  test('layout, advance-prep budgets and priorities change throughput and quality', () => {
    const wide = new GameSession(definition);
    wide.dispatch({ type: 'layout', value: 'pass' });
    wide.dispatch({ type: 'prestock', target: 'S1-1:roast' });
    wide.dispatch({ type: 'prestock', target: 'S1-1:ribbon' });
    wide.dispatch({ type: 'prestock', target: 'S1-2:velvet' });
    expect(() => wide.dispatch({ type: 'prestock', target: 'S1-2:crumble' })).toThrow(/three components/);
    wide.dispatch({ type: 'open' });
    expect(tasksFor(wide.state, 'nell').some(task => task.station === 'prep-b')).toBe(false);
    const balanced = openSession();
    expect(tasksFor(balanced.state, 'sol').find(task => task.kind === 'prep')?.beats).toBe(2);
    balanced.dispatch({ type: 'mode', value: 'rush' });
    expect(tasksFor(balanced.state, 'sol').find(task => task.kind === 'prep')?.beats).toBe(1);
    balanced.dispatch({ type: 'plan', plan: planFor(balanced.state, { sol: taskId(balanced.state, 'sol', 'prep', 'S1-1:roast') }) });
    expect(balanced.state.orders[0].parts[0]).toMatchObject({ stage: 'prepared', quality: 77 });
    const craft = openSession(); craft.dispatch({ type: 'mode', value: 'craft' });
    craft.dispatch({ type: 'plan', plan: planFor(craft.state, { nell: taskId(craft.state, 'nell', 'prep', 'S1-1:roast') }) });
    expect(craft.state.jobs[0].left).toBe(1);
    craft.dispatch({ type: 'hold' });
    expect(craft.state.orders[0].parts[0].quality).toBe(93);
  });

  test('full reducer campaign is feasible, bounded and smokeCase advances the real engine', () => {
    const session = new GameSession(definition, 79);
    for (let round = 0; round < 3; round++) {
      for (const target of session.state.orders.flatMap(order => order.parts).slice(0, 3).map(part => part.id)) session.dispatch({ type: 'prestock', target });
      session.dispatch({ type: 'open' });
      let limit = 0;
      while (session.state.phase === 'service' && limit++ < 40) {
        for (const hob of HOBS) {
          const part = session.state.orders.flatMap(order => order.parts).find(item => item.hob === hob);
          const heat = part?.stage === 'ready' ? 0 : 2;
          if (session.state.hobs[hob] !== heat) session.dispatch({ type: 'heat', hob, value: heat });
        }
        const plan = coordinated({ index: limit, tool: crewTool.name, model: 'fixture', messages: [], observation: observation(session.state) });
        session.dispatch({ type: 'plan', plan });
      }
      expect(session.state.phase, JSON.stringify(session.state)).toBe(round === 2 ? 'won' : 'intermission');
      if (round < 2) session.dispatch({ type: 'next' });
    }
    expect(session.state.served).toBe(12);
    expect(session.state.waste).toBe(0);
    expect(finalScore(session.state)).toBeGreaterThan(10_000);
    const restored = new GameSession(definition); restored.restore(session.serialize());
    expect(restored.state).toEqual(session.state);
    const smoke = smokeCase();
    const plan = coordinated({ index: 0, tool: crewTool.name, model: 'fixture', messages: [], observation: smoke.request.observation as ReturnType<typeof observation> });
    smoke.request.validate(plan); smoke.verify(plan);
  });

  test('replay is command validated, atomic, deterministic, and reset advances revision', () => {
    const session = openSession();
    session.dispatch({ type: 'hold' });
    const saved = session.serialize(), state = structuredClone(session.state), revision = session.revision;
    const invalid = JSON.parse(saved);
    invalid.commands.push({ type: 'plan', plan: planFor(session.state, { nell: 'serve/S1-1/pass-a' }) });
    expect(() => session.restore(JSON.stringify(invalid))).toThrow();
    expect(session.state).toEqual(state);
    expect(session.revision).toBe(revision);
    session.reset(); expect(session.state.phase).toBe('setup');
    expect(session.revision).toBeGreaterThan(revision);
    session.restore(saved); expect(session.state).toEqual(state);
  });
});

async function setupPrep(page: Page) {
  await page.getByRole('button', { name: 'Kitchen / prep', exact: true }).click();
  const buttons = page.locator('#mise-kitchen-tools [data-prestock]');
  for (let i = 0; i < 3; i++) await buttons.nth(i).click();
  await page.getByRole('button', { name: 'Close Kitchen & advance prep', exact: true }).click();
}
async function adjustHeat(page: Page) {
  for (const hob of HOBS) {
    const ready = await page.locator(`[data-hob-status="${hob}"]`).getAttribute('data-ready') === 'true';
    const select = page.locator(`[data-heat="${hob}"]`);
    const desired = ready ? '0' : '2';
    if (await select.inputValue() !== desired) await select.selectOption(desired);
  }
}
async function callCrew(page: Page) {
  const root = page.locator('.project-mise');
  const previous = Number(await root.getAttribute('data-beat'));
  await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
  await expect(root).toHaveAttribute('data-agent-busy', 'false');
  await expect(root).toHaveAttribute('data-beat', String(previous + 1));
}
async function savedReplay(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as string | null, SAVE);
}

test.describe('Mise browser', () => {
  test.beforeEach(async ({ page }) => {
    // Sibling project edits must not hot-reload a running service campaign.
    // Mise's native model transport uses HTTP, never WebSockets.
    await page.routeWebSocket('**', socket => { socket.onMessage(() => {}); });
  });

  test('complete legitimate three-sitting UI campaign, heat decisions, persistence and replay', async ({ page }) => {
    test.setTimeout(180_000);
    const calls = await installAgentFixture(page, coordinated);
    await page.goto(URL);
    await expect(page.getByRole('heading', { level: 1, name: 'Mise', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('mise-kitchen.png') });
    expect(calls).toHaveLength(0);
    for (let shift = 0; shift < 3; shift++) {
      await setupPrep(page);
      await page.getByRole('button', { name: 'Open service', exact: true }).click();
      let count = 0;
      while (await page.locator('.project-mise').getAttribute('data-phase') === 'service' && count++ < 40) {
        await adjustHeat(page);
        await callCrew(page);
      }
      await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', shift === 2 ? 'won' : 'intermission');
      if (shift < 2) await page.getByRole('button', { name: 'Prepare next sitting', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'A full house', exact: true })).toBeVisible();
    await expect(page.locator('#mise-wrap')).toContainText('12 served / 0 missed / 0 wasted');
    expect(calls.length).toBeGreaterThan(25);
    expect(calls.every(call => call.tool === 'coordinate_mise')).toBe(true);
    expect(calls.some(call => JSON.stringify(call.observation.jobs).includes('"kind":"prep"'))).toBe(true);
    expect(calls.some(call => JSON.stringify(call.observation.orders).includes('"status":"plated"'))).toBe(true);
    const replay = await savedReplay(page);
    expect(replay).toBeTruthy();
    const commands = JSON.parse(replay!).commands as { type: string; value?: number }[];
    expect(commands.some(command => command.type === 'heat' && command.value === 0)).toBe(true);
    const beforeReload = calls.length;
    await page.reload();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'won');
    expect(calls.length).toBe(beforeReload);
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export replay', exact: true }).click();
    expect((await downloadEvent).suggestedFilename()).toBe('mise-replay.json');
    await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'setup');
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('[data-game-import]').setInputFiles({ name: 'mise-replay.json', mimeType: 'application/json', buffer: Buffer.from(replay!) });
    await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'won');
    expect(calls.length).toBe(beforeReload);
    await page.locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"state":{"phase":"won"}}') });
    await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'won');
  });

  test('deliberate missed-service UI loss is finite and does not call a model', async ({ page }) => {
    const calls = await installAgentFixture(page, coordinated);
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    for (let i = 0; i < 17; i++) await page.getByRole('button', { name: 'Hold crew +1', exact: true }).click();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'service');
    await page.getByRole('button', { name: 'Hold crew +1', exact: true }).click();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'lost');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '18');
    await expect(page.getByRole('heading', { name: 'The empty table', exact: true })).toBeVisible();
    await expect(page.locator('#mise-wrap')).toContainText('0 served / 2 missed');
    expect(calls).toHaveLength(0);
    await page.getByRole('button', { name: 'Restart campaign', exact: true }).click();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '0');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'setup');
  });

  test('two distinct real-client crew plans produce different visible jobs and recipe progress', async ({ page }) => {
    let routeToLeek = false;
    const calls = await installAgentFixture(page, turn => {
      const obs = turn.observation as ReturnType<typeof observation>;
      const target = routeToLeek ? 'S1-2:velvet' : 'S1-1:roast';
      return {
        intention: routeToLeek ? 'Nell prepares the leek ticket.' : 'Nell prepares the root ticket.',
        assignments: obs.crew.map(staff => ({
          staff: staff.id,
          taskId: staff.id === 'nell' ? staff.legalTasks.find(task => task.kind === 'prep' && task.target === target)!.id : 'wait',
        })),
      };
    });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    await callCrew(page);
    await expect(page.locator('[data-crew="nell"]')).toContainText('Copper-root');
    await page.locator('[data-ticket="S1-1"]').click();
    await expect(page.locator('[data-part="S1-1:roast"]')).toContainText('prepared');
    await page.getByRole('button', { name: 'Close Ticket & recipe', exact: true }).click();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    routeToLeek = true;
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    await callCrew(page);
    await expect(page.locator('[data-crew="nell"]')).toContainText('Velvet leek');
    await page.locator('[data-ticket="S1-1"]').click();
    await expect(page.locator('[data-part="S1-1:roast"]')).toContainText('raw');
    expect(calls).toHaveLength(2);
  });

  test('invalid plans get one correction without any speculative clock, stock or jobs', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => {
      const obs = turn.observation as ReturnType<typeof observation>;
      return {
        intention: '<img src=x onerror=alert(1)> impossible ready dish',
        assignments: obs.crew.map(staff => ({ staff: staff.id, taskId: staff.id === 'nell' ? 'serve/S1-1/pass-a' : 'wait' })),
      };
    });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    const before = await savedReplay(page);
    await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
    await expect(page.locator('[data-agent-host]')).toHaveAttribute('data-agent-error', 'true');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-agent-busy', 'false');
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.length).toBeGreaterThan(calls[0].messages.length);
    expect(await savedReplay(page)).toBe(before);
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '0');
    await expect(page.locator('.project-mise img')).toHaveCount(0);
    await expect(page.locator('[data-crew="nell"]')).toContainText('Sharpening');
  });

  test('corrected native plan commits once and renders model text only as text', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => turn.index === 0 ? { assignments: [], intention: 'bad' } :
      { ...coordinated(turn), intention: '<img src=x onerror=alert(1)> staff start prep.' });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    await callCrew(page);
    expect(calls).toHaveLength(2);
    await expect(page.locator('[data-agent-status]')).toContainText('<img');
    await expect(page.locator('.project-mise img')).toHaveCount(0);
    expect(JSON.parse((await savedReplay(page))!).commands.filter((command: { type: string }) => command.type === 'plan')).toHaveLength(1);
  });

  test('network errors do not advance, retry works, restart discards an in-flight stale plan', async ({ page }) => {
    let release: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let delay = false;
    const calls = await installAgentFixture(page, async turn => { if (delay) await delayed; return coordinated(turn); });
    await page.route('**/api/openai/v1/chat/completions', route => route.abort('failed'), { times: 1 });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    const before = await savedReplay(page);
    await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
    await expect(page.locator('[data-agent-host]')).toHaveAttribute('data-agent-error', 'true');
    expect(await savedReplay(page)).toBe(before);
    await callCrew(page);
    delay = true;
    await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-agent-busy', 'true');
    await expect.poll(() => calls.length).toBe(2);
    await expect(page.locator('[data-mode]')).toBeDisabled();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    release!();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-agent-busy', 'false');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-phase', 'setup');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '0');
    expect(JSON.parse((await savedReplay(page))!).commands).toEqual([]);
  });

  test('explicit cancel and notebook import invalidate pending requests without resource changes', async ({ page }) => {
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    const calls = await installAgentFixture(page, async turn => { await held; return coordinated(turn); });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Open service', exact: true }).click();
    const initial = await savedReplay(page);
    await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
    await expect.poll(() => calls.length).toBe(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await savedReplay(page)).toBe(initial);
    await page.getByRole('button', { name: 'Call crew / 1 beat', exact: true }).click();
    await expect.poll(() => calls.length).toBe(2);
    await page.getByRole('button', { name: 'Notebook', exact: true }).click();
    await page.locator('[data-game-import]').setInputFiles({ name: 'mise.json', mimeType: 'application/json', buffer: Buffer.from(initial!) });
    await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
    release!();
    await expect(page.locator('.project-mise')).toHaveAttribute('data-agent-busy', 'false');
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '0');
  });

  test('keyboard, modal guard, player layout and mobile viewport remain usable without eager calls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await installAgentFixture(page, coordinated);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(URL);
    const root = page.locator('.project-mise');
    await expect(page.getByRole('heading', { level: 1, name: 'Mise', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Animate', exact: true })).toBeVisible();
    await root.focus(); await page.keyboard.press('k');
    await expect(page.locator('#mise-kitchen-tools')).toBeVisible();
    await page.getByRole('button', { name: 'Wide pass: 1 board / 2 pass', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Wide pass: 1 board / 2 pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(root).toHaveAttribute('data-phase', 'setup');
    await page.keyboard.press('Escape');
    await root.focus(); await page.keyboard.press('Space');
    await expect(root).toHaveAttribute('data-phase', 'service');
    expect(calls).toHaveLength(0);
    await page.locator('[data-ticket="S1-1"]').click();
    await expect(page.locator('#mise-recipe')).toContainText('Serve by 13');
    await page.keyboard.press('Escape');
    await page.locator('[data-mode]').selectOption('rush');
    await page.locator('[data-heat="hob-a"]').selectOption('1');
    await root.focus(); await page.keyboard.press('Space');
    await expect(root).toHaveAttribute('data-beat', '1');
    expect(calls).toHaveLength(1);
    for (const size of [{ width: 320, height: 640 }, { width: 768, height: 480 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await expect.poll(() => page.evaluate(() => ({
        width: document.documentElement.scrollWidth <= innerWidth,
        height: document.documentElement.scrollHeight <= innerHeight,
      }))).toEqual({ width: true, height: true });
      const canvas = await page.locator('[data-project-preview]').boundingBox();
      const pulse = await page.locator('[data-pulse]').boundingBox();
      expect(canvas!.height).toBeGreaterThan(140);
      expect(pulse!.y + pulse!.height).toBeLessThanOrEqual(size.height);
      const menu = await page.locator('.collection-menu-toggle').boundingBox();
      const connect = await page.locator('[data-agent-connect]').boundingBox();
      expect(connect!.x + connect!.width).toBeLessThan(menu!.x);
      await page.screenshot({ path: test.info().outputPath(`mise-${size.width}x${size.height}.png`) });
    }
  });

  test('configuration dialogs and model discovery are never automatically requested', async ({ page }) => {
    await configureFixtureConnection(page);
    let requests = 0;
    await page.route('**/api/openai/v1/**', route => { requests++; return route.abort(); });
    await page.goto(URL);
    await page.getByRole('button', { name: 'Model settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Model connection', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save connection', exact: true }).click();
    await page.getByRole('button', { name: 'Close Model connection', exact: true }).click();
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'The service book', exact: true })).toContainText('burns at target +4');
    expect(requests).toBe(0);
    await expect(page.locator('.project-mise')).toHaveAttribute('data-beat', '0');
  });
});
