import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { configureFixtureConnection, installAgentFixture } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { CREW_IDS, DOORS, initialOrders } from '../../src/projects/afterlight/data';
import type { Command, CrewId, LegalAction, Plan, RoomId, State } from '../../src/projects/afterlight/data';
import { catalog, create, definition, forecast, oxygenated, prepare, reduce, route } from '../../src/projects/afterlight/engine';
import { observation, smokeCase } from '../../src/projects/afterlight/agent';

type Observation = ReturnType<typeof observation>;
const URL = './projects/afterlight/';
const ROOT = '.project-afterlight';

function distance(obs: Observation, from: RoomId, to: RoomId): number {
  const queue: { id: RoomId; steps: number }[] = [{ id: from, steps: 0 }];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === to) return current.steps;
    for (const door of obs.graph.filter(door => door.open && (door.a === current.id || door.b === current.id))) {
      const next = door.a === current.id ? door.b : door.a;
      if (!seen.has(next)) { seen.add(next); queue.push({ id: next, steps: current.steps + 1 }); }
    }
  }
  return 99;
}

// The fixture is a deterministic tool consumer, not a production offline agent.
function choosePlan(obs: Observation): Plan {
  let budget = 5;
  const actions = CREW_IDS.map(id => {
    const crew = obs.crew.find(crew => crew.id === id)!;
    const legal = crew.legalActions.filter(action => action.ap <= budget);
    let action: LegalAction | undefined;
    const destination: RoomId = id === 'vale' ? !obs.objectives.repaired.reactor ? 'reactor' : !obs.objectives.repaired.life ? 'life' : 'dock' :
      id === 'iona' ? crew.cargo !== 'none' ? 'dock' : obs.objectives.pods.lark === 'waiting' ? 'medbay' : obs.objectives.pods.wren === 'waiting' ? 'cryo' : 'dock' :
        crew.cargo !== 'none' || obs.objectives.core === 'saved' ? 'dock' : 'archive';
    if (id === 'moth' && !obs.objectives.repaired.reactor && obs.crew.find(crew => crew.id === 'vale')!.inventory.cell === 0) {
      action = legal.find(action => action.id === 'give:vale:cell');
    }
    action ??= legal.find(action => ['repair', 'rescue', 'recover', 'deliver', 'extract'].includes(action.kind));
    if (!action && crew.room !== destination) {
      const targetKnown = obs.rooms.find(room => room.id === destination)!.surveyed;
      if (!targetKnown) action = legal.find(action => action.kind === 'scan');
      action ??= legal.filter(action => action.kind === 'move' &&
        distance(obs, action.path[action.path.length - 1], destination) < distance(obs, crew.room, destination))
        .sort((a, b) => distance(obs, a.path[a.path.length - 1], destination) - distance(obs, b.path[b.path.length - 1], destination))[0];
      if (!action) action = legal.find(action => action.kind === 'scan');
    }
    action ??= legal.find(action => action.id === 'rest')!;
    budget -= action.ap;
    return { crew: id, action: action.id, intention: `${crew.role}: ${action.label}.` };
  });
  return { tick: obs.tick, actions };
}

function hold(tick: number): Plan {
  return { tick, actions: CREW_IDS.map(crew => ({ crew, action: 'rest', intention: 'Hold position and recover energy.' })) };
}

function commanded(state: State, selections: Partial<Record<CrewId, string>>): Command {
  const plan = hold(state.tick);
  for (const action of plan.actions) action.action = selections[action.crew] ?? 'rest';
  return { type: 'turn', conditions: state.conditions, orders: state.orders, plan };
}

function permuteActions(command: Command): Command[] {
  return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map(order => ({
    ...command, plan: { ...command.plan, actions: order.map(index => command.plan.actions[index]) },
  }));
}

function workshopSession(withCell: boolean) {
  const session = new GameSession(definition, 78);
  session.dispatch(commanded(session.state, { moth: 'scan' }));
  session.dispatch(commanded(session.state, {
    vale: 'move:dock>life>workshop', iona: 'move:dock>life>workshop', moth: withCell ? 'give:vale:cell' : 'rest',
  }));
  return session;
}

function rejectInventoryAtomically(session: GameSession<State, Command>, command: Command, message: RegExp) {
  const state = structuredClone(session.state);
  const originalCommand = structuredClone(command);
  const encoded = session.serialize(), revision = session.revision, moves = session.moveCount;
  expect(() => reduce(session.state, command)).toThrow(message);
  expect(() => session.preview(command)).toThrow(message);
  expect(() => session.dispatch(command)).toThrow(message);
  const replay = JSON.parse(encoded);
  replay.commands.push(command);
  expect(() => session.restore(JSON.stringify(replay))).toThrow(message);
  expect(session.state).toEqual(state);
  expect(session.serialize()).toBe(encoded);
  expect(session.revision).toBe(revision);
  expect(session.moveCount).toBe(moves);
  expect(command).toEqual(originalCommand);
}

function acceptInventoryPermutations(session: GameSession<State, Command>, command: Command) {
  const state = structuredClone(session.state);
  const encoded = session.serialize(), revision = session.revision;
  const expected = reduce(session.state, command);
  for (const permutation of permuteActions(command)) {
    const next = session.preview(permutation);
    expect({ ...next, jobs: [], log: [] }).toEqual({ ...expected, jobs: [], log: [] });
    for (const crew of next.crew) {
      const counts = Object.values(crew.inventory);
      expect(counts.every(count => Number.isSafeInteger(count) && count >= 0)).toBe(true);
      expect(counts.reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(6);
    }
    const committed = new GameSession(definition);
    committed.restore(encoded);
    committed.dispatch(permutation);
    expect(committed.state).toEqual(next);
    const restored = new GameSession(definition);
    restored.restore(committed.serialize());
    expect(restored.state).toEqual(next);
    expect(session.state).toEqual(state);
    expect(session.serialize()).toBe(encoded);
    expect(session.revision).toBe(revision);
  }
  return expected;
}

async function enter(page: Page) {
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Afterlight', exact: true })).toBeVisible();
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
}

async function turn(page: Page, tick: number) {
  await page.locator('[data-al-advance]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', String(tick + 1));
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'false');
}

async function power(page: Page, value: 'balanced' | 'rescue' | 'salvage') {
  await page.locator('.al-command-bar [data-al-open-orders]').click();
  await page.getByLabel('Power bus', { exact: true }).selectOption(value);
  await page.getByRole('button', { name: 'Close Captain orders', exact: true }).click();
}

test('@engine complete mission uses real handoffs, survey, repairs, rescue and replay', () => {
  const session = new GameSession(definition, 78);
  const origin = session.serialize();
  let usedHandoff = false, usedSurvey = false, usedRest = false;
  for (let tick = 0; tick < 28 && session.state.status === 'active'; tick++) {
    const orders = { ...session.state.orders, power: session.state.repaired.reactor ? 'balanced' as const : 'salvage' as const };
    const preview = prepare(session.state, orders, session.state.conditions);
    const plan = choosePlan(observation(preview));
    usedHandoff ||= plan.actions.some(action => action.action === 'give:vale:cell');
    usedSurvey ||= plan.actions.some(action => action.action === 'scan');
    usedRest ||= plan.actions.some(action => action.action === 'rest');
    const command: Command = { type: 'turn', conditions: preview.conditions, orders, plan };
    const revision = session.revision, reserve = session.state.oxygen;
    session.preview(command);
    expect(session.state.oxygen).toBe(reserve);
    expect(session.revision).toBe(revision);
    session.dispatch(command);
  }
  expect(session.state.status, session.state.log.join('\n')).toBe('won');
  expect(usedHandoff && usedSurvey && usedRest).toBe(true);
  expect(session.state.repaired).toMatchObject({ life: true, reactor: true });
  expect(session.state.pods).toEqual({ lark: 'saved', wren: 'saved' });
  expect(session.state.core).toBe('saved');
  expect(session.state.crew.every(crew => crew.room === 'dock')).toBe(true);
  expect(session.state.tick).toBeLessThan(28);
  expect(JSON.stringify(observation(create())).length).toBeLessThan(48_000);
  const restored = new GameSession(definition);
  restored.restore(session.serialize());
  expect(restored.state).toEqual(session.state);
  const invalid = JSON.parse(session.serialize());
  invalid.commands[0].plan.actions[0].action = 'set-oxygen:9999';
  expect(() => restored.restore(JSON.stringify(invalid))).toThrow(AgentValidationError);
  expect(restored.state).toEqual(session.state);
  restored.restore(origin);
  expect(restored.state.tick).toBe(0);
  const smoke = smokeCase();
  const opening = choosePlan(smoke.request.observation as Observation);
  smoke.request.validate(opening);
  smoke.verify(opening);
});

test('@engine catalogs enforce doors, resource ownership, AP, pressure, fog and terminal phases', () => {
  const initial = create(78);
  const copy = structuredClone(initial);
  expect(() => reduce(initial, commanded(initial, { vale: 'repair:reactor' }))).toThrow(/catalog/);
  expect(() => reduce(initial, commanded(initial, { moth: 'move:dock>archive' }))).toThrow(/catalog/);
  expect(catalog(initial, initial.crew[0]).some(action => action.path.includes('medbay'))).toBe(false);
  expect(() => definition.parseCommand({ ...commanded(initial, {}), oxygen: 9999 })).toThrow(/unexpected/);
  const allMoving = commanded(initial, { vale: 'move:dock>life>reactor', iona: 'move:dock>life>reactor', moth: 'move:dock>life>reactor' });
  expect(() => reduce(initial, allMoving)).toThrow(/5 action points/);
  const noDoors = { ...initial.orders, doors: initial.orders.doors.map(door => ({ ...door, open: false })) };
  const sealed = prepare(initial, noDoors, initial.conditions);
  expect(route(sealed, 'reactor', 'dock')).toEqual([]);
  expect(catalog(sealed, sealed.crew[0]).some(action => action.kind === 'move')).toBe(false);
  expect(() => reduce(initial, { ...commanded(initial, { vale: 'move:dock>life' }), orders: noDoors })).toThrow(/catalog/);
  const upperOnly = prepare(initial, { ...initial.orders, oxygen: 'upper', doors: initial.orders.doors.map(door => ({
    ...door, open: DOORS.find(entry => entry.id === door.id)!.lift ? false : door.open,
  })) }, initial.conditions);
  expect(oxygenated(upperOnly).has('life')).toBe(false);
  expect(forecast(upperOnly).pressures.find(room => room.id === 'life')!.next).toBe(55);
  const leak = prepare(initial, initialOrders({ ...initial.conditions, layout: 'open' }), initial.conditions);
  expect(forecast(leak).burn).toBe(10);
  expect(forecast(initial).burn).toBe(4);

  const opening = reduce(initial, commanded(initial, { vale: 'move:dock>life>reactor', moth: 'give:vale:cell' }));
  expect(opening.crew[0].room).toBe('reactor');
  expect(opening.crew[0].inventory.cell).toBe(1);
  expect(opening.crew[2].inventory.cell).toBe(1);
  const repaired = reduce(opening, commanded(opening, { vale: 'repair:reactor' }));
  expect(repaired.repaired.reactor).toBe(true);
  expect(repaired.crew[0].inventory.patch).toBe(2);
  expect(repaired.crew[0].inventory.cell).toBe(0);
  expect(() => reduce(repaired, commanded(repaired, { vale: 'repair:reactor' }))).toThrow(/catalog/);
  const opened = { ...repaired.orders, doors: repaired.orders.doors.map(door => door.id === 'b45' ? { ...door, open: true } : door) };
  const safe = prepare(repaired, opened, repaired.conditions);
  expect(catalog(safe, safe.crew[0]).some(action => action.path.at(-1) === 'ballast')).toBe(false);
  const eva = prepare(repaired, { ...opened, risk: 'eva' }, repaired.conditions);
  expect(catalog(eva, eva.crew[0]).some(action => action.id === 'move:reactor>ballast')).toBe(true);
  let stranded = reduce(repaired, { ...commanded(repaired, { vale: 'move:reactor>ballast' }), orders: eva.orders });
  expect(stranded.crew[0].air).toBe(5);
  while (stranded.status === 'active') stranded = reduce(stranded, commanded(stranded, {}));
  expect(stranded.ending).toContain('suit oxygen ran out');
  expect(() => reduce(stranded, commanded(stranded, {}))).toThrow(/ended/);
  expect(initial).toEqual(copy);
  const wrongTick = commanded(initial, {}); wrongTick.plan.tick = 1;
  expect(() => reduce(initial, wrongTick)).toThrow(/different turn/);
});

test('@engine inventory rejects collect plus handoff overflow without consuming the cache or mutating a replay', () => {
  const session = workshopSession(true);
  expect(session.state.crew[0].inventory).toEqual({ patch: 3, medkit: 0, cell: 1 });
  const command = commanded(session.state, { vale: 'collect', iona: 'give:vale:medkit' });
  for (const intent of command.plan.actions) {
    expect(catalog(session.state, session.state.crew.find(crew => crew.id === intent.crew)!).some(action => action.id === intent.action)).toBe(true);
  }
  for (const permutation of permuteActions(command)) rejectInventoryAtomically(session, permutation, /capacity of 6/);
  expect(session.state.supplies).toBe(true);
  expect(session.state.crew[1].inventory.medkit).toBe(2);
});

test('@engine inventory net transfers finish at six slots in every action order, including full recipients', () => {
  for (const startingSlots of [5, 6]) {
    const session = new GameSession(definition, 78);
    session.dispatch(commanded(session.state, { iona: 'give:vale:medkit', moth: 'give:vale:cell' }));
    if (startingSlots === 6) session.dispatch(commanded(session.state, { iona: 'give:vale:medkit' }));
    expect(Object.values(session.state.crew[0].inventory).reduce((sum, count) => sum + count, 0)).toBe(startingSlots);
    const command = commanded(session.state, {
      vale: 'give:moth:patch', iona: startingSlots === 5 ? 'give:vale:medkit' : 'rest', moth: 'give:vale:cell',
    });
    const next = acceptInventoryPermutations(session, command);
    expect(next.crew.map(crew => crew.inventory)).toEqual([
      { patch: 2, medkit: 2, cell: 2 }, { patch: 0, medkit: 0, cell: 0 }, { patch: 1, medkit: 0, cell: 0 },
    ]);
    expect(next.supplies).toBe(true);
    if (startingSlots === 6) {
      for (const permutation of permuteActions(commanded(session.state, { moth: 'give:vale:cell' }))) {
        rejectInventoryAtomically(session, permutation, /capacity of 6/);
      }
    }
  }
});

test('@engine inventory consumption frees slots for simultaneous handoffs without double-spending repair items', () => {
  const session = new GameSession(definition, 78);
  session.dispatch(commanded(session.state, { iona: 'give:vale:medkit', moth: 'give:vale:cell' }));
  session.dispatch(commanded(session.state, {
    vale: 'move:dock>life>reactor', iona: 'move:dock>life>reactor', moth: 'move:dock>life',
  }));
  session.dispatch(commanded(session.state, { moth: 'move:life>reactor' }));
  expect(session.state.crew[0].inventory).toEqual({ patch: 3, medkit: 1, cell: 1 });
  const next = acceptInventoryPermutations(session, commanded(session.state, {
    vale: 'repair:reactor', iona: 'give:vale:medkit', moth: 'give:vale:cell',
  }));
  expect(next.repaired.reactor).toBe(true);
  expect(next.crew.map(crew => crew.inventory)).toEqual([
    { patch: 2, medkit: 2, cell: 1 }, { patch: 0, medkit: 0, cell: 0 }, { patch: 0, medkit: 0, cell: 0 },
  ]);
});

test('@engine inventory accepts collect plus handoff at six slots and consumes the shared cache exactly once', () => {
  const session = workshopSession(false);
  const duplicate = commanded(session.state, { vale: 'collect', iona: 'collect' });
  for (const permutation of permuteActions(duplicate)) rejectInventoryAtomically(session, permutation, /cache can only be collected once/);
  const command = commanded(session.state, { vale: 'collect', iona: 'give:vale:medkit' });
  const next = acceptInventoryPermutations(session, command);
  expect(next.crew[0].inventory).toEqual({ patch: 4, medkit: 1, cell: 1 });
  expect(next.crew[1].inventory).toEqual({ patch: 0, medkit: 1, cell: 0 });
  expect(next.supplies).toBe(false);
  session.dispatch(command);
  expect(catalog(session.state, session.state.crew[1]).some(action => action.id === 'collect')).toBe(false);
  for (const permutation of permuteActions(commanded(session.state, { iona: 'collect' }))) {
    rejectInventoryAtomically(session, permutation, /catalog/);
  }
});

test('@engine inventory received items cannot enable same-tick forwarding or repair in any action order', () => {
  const session = new GameSession(definition, 78);
  for (const permutation of permuteActions(commanded(session.state, { moth: 'give:vale:cell', vale: 'give:iona:cell' }))) {
    rejectInventoryAtomically(session, permutation, /catalog/);
  }
  session.dispatch(commanded(session.state, { vale: 'move:dock>life>reactor', moth: 'move:dock>life>reactor' }));
  for (const permutation of permuteActions(commanded(session.state, { vale: 'repair:reactor', moth: 'give:vale:cell' }))) {
    rejectInventoryAtomically(session, permutation, /catalog/);
  }
  session.dispatch(commanded(session.state, { moth: 'give:vale:cell' }));
  const next = acceptInventoryPermutations(session, commanded(session.state, { vale: 'repair:reactor' }));
  expect(next.repaired.reactor).toBe(true);
  expect(next.crew[0].inventory).toEqual({ patch: 2, medkit: 0, cell: 0 });
});

test('complete UI rescue victory, accepted paths, native export/import and auto-restore', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await installAgentFixture(page, call => choosePlan(call.observation as Observation));
  await enter(page);
  expect(calls).toHaveLength(0);
  await expect(page.locator('[data-project-preview] canvas').first()).toBeVisible();
  let balanced = false;
  for (let tick = 0; tick < 28; tick++) {
    if (!balanced && (await page.locator('[data-al-systems]').textContent())!.includes('Reactor online')) {
      const oxygenBefore = await page.locator('[data-al-oxygen]').textContent();
      await power(page, 'balanced');
      await expect(page.locator(ROOT)).toHaveAttribute('data-pending-orders', 'true');
      await expect(page.locator('[data-al-oxygen]')).toHaveText(oxygenBefore!);
      await expect(page.locator(ROOT)).toHaveAttribute('data-tick', String(tick));
      balanced = true;
    }
    await turn(page, tick);
    if (tick === 0) {
      await page.getByRole('button', { name: 'Inspect Vale', exact: true }).click();
      await expect(page.locator('[data-al-crew-readout]')).toContainText('1 cells');
      await expect(page.locator('[data-al-crew-job]')).toContainText('Dock / 01 > Life support > Reactor');
      await page.getByRole('button', { name: 'Close Crew & evacuation paths', exact: true }).click();
    }
    if (await page.locator(ROOT).getAttribute('data-mission-status') !== 'active') break;
  }
  await expect(page.getByRole('heading', { name: 'Rescue complete', exact: true })).toBeVisible();
  await expect(page.locator('[data-al-pods]')).toContainText('LARK saved / WREN saved');
  await expect(page.locator('[data-al-core]')).toContainText('saved');
  await expect(page.locator('[data-al-recovered]')).toHaveText('3 / 3');
  await expect(page.locator('[data-al-advance]')).toBeDisabled();
  expect(calls.some(call => {
    const obs = call.observation as Observation;
    return obs.crew.find(crew => crew.id === 'iona')?.cargo === 'lark';
  })).toBe(true);
  expect(calls.some(call => {
    const obs = call.observation as Observation;
    return obs.crew.find(crew => crew.id === 'iona')?.cargo === 'wren';
  })).toBe(true);
  const count = calls.length;
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadPromise;
  const encoded = await readFile((await download.path())!, 'utf8');
  expect(encoded).not.toContain('fixture-tool-model');
  expect(encoded).not.toContain('apiKey');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await page.getByRole('button', { name: 'New mission', exact: true }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'afterlight-replay.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  await expect(page.locator(ROOT)).toHaveAttribute('data-mission-status', 'won');
  const illegal = JSON.parse(encoded);
  illegal.commands[0].plan.actions[0].action = 'declare-victory';
  await page.locator('[data-game-import]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(illegal)) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator(ROOT)).toHaveAttribute('data-mission-status', 'won');
  expect(calls).toHaveLength(count);
  await page.reload();
  await expect(page.locator(ROOT)).toHaveAttribute('data-mission-status', 'won');
  expect(calls).toHaveLength(count);
  expect(errors).toEqual([]);
});

test('legitimate UI loss exhausts finite oxygen through opened breach gates', async ({ page }) => {
  const calls = await installAgentFixture(page, call => hold(Number(call.observation.tick)));
  await enter(page);
  await page.getByRole('button', { name: 'Mission', exact: true }).click();
  await page.getByLabel('Oxygen reserve', { exact: true }).selectOption('80');
  await page.getByLabel('Hull damage', { exact: true }).selectOption('3');
  await page.getByLabel('Initial bulkheads', { exact: true }).selectOption('open');
  await expect(page.locator('[data-al-oxygen]')).toHaveText('200');
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Close Mission briefing', exact: true }).click();
  for (let tick = 0; tick < 7; tick++) await turn(page, tick);
  await expect(page.getByRole('heading', { name: 'Mission lost', exact: true })).toBeVisible();
  await expect(page.locator('[data-al-ending-text]')).toContainText('Shared oxygen exhausted');
  await expect(page.locator('[data-al-oxygen]')).toHaveText('0');
  await expect(page.locator('[data-al-hull]')).toHaveText('71%');
  await expect(page.locator('[data-al-recovered]')).toHaveText('0 / 3');
  expect(calls).toHaveLength(7);
  await page.getByRole('button', { name: 'New mission', exact: true }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await expect(page.locator(ROOT)).toHaveAttribute('data-mission-status', 'active');
  expect(calls).toHaveLength(7);
});

test('illegal plans get one correction, commit nothing on failure, and escape public prose', async ({ page }) => {
  const calls = await installAgentFixture(page, call => {
    const plan = choosePlan(call.observation as Observation);
    if (call.index < 2) plan.actions[0].action = 'teleport-to-core';
    else plan.actions[0].intention = '<img src=x onerror="window.afterlightInjected=1">';
    return plan;
  });
  await enter(page);
  await power(page, 'rescue');
  await page.locator('[data-al-advance]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('No game turn');
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await expect(page.locator('[data-al-oxygen]')).toHaveText('200');
  await expect(page.locator(ROOT)).toHaveAttribute('data-pending-orders', 'true');
  expect(calls).toHaveLength(2);
  expect(calls[1].messages.length).toBeGreaterThan(calls[0].messages.length);
  await power(page, 'salvage');
  await turn(page, 0);
  expect(calls).toHaveLength(3);
  await page.getByRole('button', { name: 'Inspect Vale', exact: true }).click();
  await expect(page.locator('[data-al-crew-intention]')).toHaveText('<img src=x onerror="window.afterlightInjected=1">');
  await expect(page.locator('[data-al-crew-intention] img')).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, 'afterlightInjected'))).toBe(false);
});

test('one illegal catalog action is corrected through the native client', async ({ page }) => {
  const calls = await installAgentFixture(page, call => {
    const plan = choosePlan(call.observation as Observation);
    if (call.index === 0) plan.actions[1].action = 'rescue:wren';
    return plan;
  });
  await enter(page);
  await turn(page, 0);
  expect(calls).toHaveLength(2);
  expect(calls[0].observation.tick).toBe(0);
  expect(calls[1].observation.tick).toBe(0);
  await expect(page.locator('[data-al-oxygen]')).toHaveText('196');
});

test('network errors preserve staged orders and never spend a turn', async ({ page }) => {
  await configureFixtureConnection(page);
  let requests = 0;
  await page.route('**/api/openai/v1/chat/completions', async route => { requests++; await route.abort('failed'); });
  await enter(page);
  expect(requests).toBe(0);
  await power(page, 'balanced');
  await page.locator('[data-al-advance]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('could not be reached');
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await expect(page.locator('[data-al-oxygen]')).toHaveText('200');
  await expect(page.locator(ROOT)).toHaveAttribute('data-pending-orders', 'true');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Agent action log', exact: true }).click();
  await expect(page.locator('.agent-trace')).toContainText('could not be reached');
});

test('pending ownership survives camera edits but restart discards the stale response', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async call => {
    if (call.index === 0) await gate;
    return choosePlan(call.observation as Observation);
  });
  await enter(page);
  await page.locator('[data-al-advance]').click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'true');
  await page.getByRole('button', { name: 'Deck B', exact: true }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'true');
  await page.locator('.al-command-bar [data-al-open-orders]').click();
  await expect(page.getByLabel('Power bus', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close Captain orders', exact: true }).click();
  await page.getByRole('button', { name: 'Mission', exact: true }).click();
  await page.getByRole('button', { name: 'Restart mission', exact: true }).click();
  release!();
  await expect(page.locator(ROOT)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '0');
  await expect(page.locator('[data-al-oxygen]')).toHaveText('200');
  await turn(page, 0);
  expect(calls).toHaveLength(2);
  await expect(page.locator('[data-al-oxygen]')).toHaveText('196');
});

test('keyboard, picking alternative, reduced motion and bounded mobile/short-screen layout', async ({ page }, info) => {
  const calls = await installAgentFixture(page, call => choosePlan(call.observation as Observation));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(() => ({
      width: document.documentElement.scrollWidth <= innerWidth + 1,
      height: document.documentElement.scrollHeight <= innerHeight + 1,
    }))).toEqual({ width: true, height: true });
    const scene = await page.locator('[data-al-scene]').boundingBox();
    expect(scene!.height).toBeGreaterThanOrEqual(viewport.height * 0.5);
    await expect(page.locator('[data-al-advance]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Afterlight', exact: true })).toBeVisible();
    expect(await page.locator('[data-al-advance]').evaluate(button => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === button || button.contains(hit);
    })).toBe(true);
    if (viewport.width === 1440) await page.screenshot({ path: info.outputPath('afterlight-ship.png') });
  }
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan: A', exact: true }).click();
  const plan = page.locator('.al-plan canvas');
  await expect(plan).toBeVisible();
  const box = (await plan.boundingBox())!;
  const radius = Math.min(box.width * 0.37, box.height * 0.37);
  await plan.click({ position: { x: box.width / 2 + Math.cos(Math.PI / 6) * radius * .7, y: box.height / 2 + Math.sin(Math.PI / 6) * radius * .7 } });
  await expect(page.locator('[data-al-room-caption]')).toContainText('B1');
  await page.getByRole('button', { name: 'Inspect room', exact: true }).click();
  await page.getByLabel('Selected compartment', { exact: true }).selectOption('ballast');
  await page.getByRole('button', { name: /Open bulkhead b45/ }).click();
  await expect(page.getByRole('button', { name: /Seal bulkhead b45/ })).toHaveText(/staged/);
  await page.keyboard.press('Space');
  expect(calls).toHaveLength(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Isometric', exact: true }).click();
  await page.locator('.al-webgl canvas').focus();
  await page.keyboard.press('2');
  await expect(page.locator('[data-al-crew="iona"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press(']');
  await expect(page.locator('[data-al-room-caption]')).toContainText('B6');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Space');
  await expect(page.locator(ROOT)).toHaveAttribute('data-tick', '1');
  expect(calls).toHaveLength(1);
});
