import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { COLONY_IDS, GOAL, distance } from '../../src/projects/graft/data';
import { catalog, create, definition, getTile, mineralBalance, observation, patches, stageEdits, totalSpores } from '../../src/projects/graft/engine';
import type { Edit, Plan, State } from '../../src/projects/graft/engine';
import { smokeCase, tool } from '../../src/projects/graft/agent';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';

type Observation = ReturnType<typeof observation>;
const storageKey = 'odd-index:game:graft:v1';
const app = '.project-graft';

function observed(turn: FixtureTurn): Observation {
  expect(turn.observation.game).toBe('Graft / fictional ecology');
  expect(turn.observation.colonies).toHaveLength(3);
  expect(turn.tool).toBe(tool.name);
  // The fixture receives the project's own JSON observation over the real client.
  return turn.observation as Observation;
}

function tendingPlan(view: Observation): Plan {
  const soil = new Map(view.tiles.map(tile => [tile.id, tile.nutrients]));
  const claimed = new Set<string>();
  return {
    season: view.season,
    colonies: view.priority.map(id => {
      const colony = view.colonies.find(colony => colony.id === id)!;
      const actions: Plan['colonies'][number]['actions'] = [];
      const owned = view.tiles.filter(tile => tile.owner === id);
      const target = colony.patches.length < 2 ? colony.legalActions
        .filter(action => action.kind === 'spread' && !view.tiles.find(tile => tile.id === action.tile)!.owner && !claimed.has(action.tile))
        .sort((a, b) => getTileFromView(view, b.tile).water - getTileFromView(view, a.tile).water)[0] : undefined;
      const threatened = [...owned].sort((a, b) => {
        const vulnerability = (tile: typeof a) => tile.water + view.forecast.rain - Math.max(0, view.forecast.drought - (tile.structure === 'shelter' ? 2 : 0));
        return vulnerability(a) - vulnerability(b);
      })[0];
      const forage = colony.legalActions.filter(action => action.kind === 'forage')
        .sort((a, b) => (soil.get(b.tile) ?? 0) - (soil.get(a.tile) ?? 0))[0];
      if (forage) {
        actions.push({ id: forage.id, effort: 2 });
        soil.set(forage.tile, Math.max(0, (soil.get(forage.tile) ?? 0) - 4));
      }
      if (target) {
        actions.push({ id: target.id, effort: forage ? 1 : 3 });
        claimed.add(target.tile);
      } else {
        actions.push({ id: `${id}.defend.${threatened.id}`, effort: forage ? 1 : 3 });
      }
      return { colony: id, intention: `${id}: forage finite soil, then ${target ? 'establish a viable second patch' : 'protect the driest patch'}.`, actions };
    }),
  };
}
function getTileFromView(view: Observation, id: string) {
  const tile = view.tiles.find(tile => tile.id === id);
  if (!tile) throw new Error(`Missing fixture tile ${id}`);
  return tile;
}
function defendPlan(view: Observation): Plan {
  return { season: view.season, colonies: view.colonies.map(colony => ({
    colony: colony.id, intention: 'Protect the founder, without harvesting fresh food.',
    actions: [{ id: `${colony.id}.defend.${colony.patches[0]}`, effort: 3 }],
  })) };
}
function shelters(state: State): Edit[] {
  return patches(state).filter(tile => tile.structure === 'none').slice(0, 3)
    .map(tile => ({ kind: 'shelter', tile: tile.id, to: '' }));
}
async function open(page: Page) {
  await page.goto('./projects/graft/');
  await expect(page.locator(app)).toHaveAttribute('data-phase', 'active');
  await expect(page.getByRole('heading', { name: 'Graft.', exact: true })).toBeVisible();
}
async function saved(page: Page): Promise<string> {
  const encoded = await page.evaluate(key => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, storageKey);
  expect(typeof encoded).toBe('string');
  return encoded;
}
async function stateOf(page: Page): Promise<State> {
  const session = new GameSession(definition, 76);
  session.restore(await saved(page));
  return session.state;
}
async function stage(page: Page, edit: Edit) {
  await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption(edit.tile);
  await page.getByRole('combobox', { name: 'Intervention', exact: true }).selectOption(edit.kind);
  if (edit.to) await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption(edit.to);
  await page.locator(`${app} [data-stage]`).click();
}
async function commit(page: Page, season: number) {
  await page.locator('[data-commit]').click();
  await expect(page.locator(app)).toHaveAttribute('data-season', String(season));
  await expect(page.locator(app)).toHaveAttribute('data-agent-busy', 'false');
}

test('pure ecology: all four strategies have distinct, conserved, spatial effects', () => {
  const session = new GameSession(definition, 76);
  const initial = structuredClone(session.state);
  const edits = shelters(initial);
  const plan = tendingPlan(observation(initial, edits));
  const grown = session.preview({ type: 'season', edits, plan });
  const defended = session.preview({ type: 'season', edits, plan: defendPlan(observation(initial, edits)) });
  expect(patches(grown)).toHaveLength(6);
  expect(patches(defended)).toHaveLength(3);
  expect(grown.tiles.some((tile, i) => tile.nutrients < initial.tiles[i].nutrients)).toBe(true);
  expect(session.state).toEqual(initial);
  expect(session.revision).toBe(0);
  expect(mineralBalance(grown)).toBe(initial.mineralTotal);
  expect(totalSpores(grown)).toBe(6);
  const central = initial.tiles.find(tile => tile.q === 0 && tile.r === 0)!;
  const first = tendingPlan(observation(initial, []));
  first.colonies[0].actions = [{ id: `moss.forage.${central.id}`, effort: 2 }, { id: `moss.spread.${central.id}`, effort: 1 }];
  session.dispatch({ type: 'season', edits, plan: first });
  const lichen = catalog(session.state, 'lichen').find(action => action.kind === 'share' && getTile(session.state, action.tile).owner === 'moss')!;
  expect(lichen).toBeDefined();
  const nextView = observation(session.state, []);
  const donation = defendPlan(nextView);
  donation.colonies.find(item => item.colony === 'lichen')!.actions = [{ id: lichen.id, effort: 2 }];
  const donated = session.preview({ type: 'season', edits: [], plan: donation });
  const withheld = session.preview({ type: 'season', edits: [], plan: defendPlan(nextView) });
  expect(donated.colonies.find(item => item.id === 'moss')!.reserve).toBe(withheld.colonies.find(item => item.id === 'moss')!.reserve + 2);
  expect(donated.events.some(event => event.kind === 'share' && event.text.includes('shared 2'))).toBe(true);
  expect(mineralBalance(donated)).toBe(initial.mineralTotal);
});

test('pure ecology: common-ground bids use strength, defense, and deterministic priority', () => {
  const session = new GameSession(definition, 76);
  const center = session.state.tiles.find(tile => tile.q === 0 && tile.r === 0)!;
  const plan: Plan = {
    season: 1, colonies: COLONY_IDS.map(id => ({ colony: id, intention: 'Bid for the central wet patch.',
      actions: [{ id: `${id}.spread.${center.id}`, effort: 2 }, { id: `${id}.forage.${patches(session.state, id)[0].id}`, effort: 1 }] })),
  };
  const tied = session.preview({ type: 'season', edits: [], plan });
  expect(getTile(tied, center.id).owner).toBe('moss');
  const stronger = structuredClone(plan);
  stronger.colonies[0].actions[0].effort = 1;
  stronger.colonies[2].actions[0].effort = 1;
  const claimed = session.preview({ type: 'season', edits: [], plan: stronger });
  expect(getTile(claimed, center.id).owner).toBe('lichen');
  session.dispatch({ type: 'season', edits: shelters(session.state), plan });
  const held = defendPlan(observation(session.state, []));
  held.colonies.find(item => item.colony === 'moss')!.actions = [{ id: `moss.defend.${center.id}`, effort: 3 }];
  held.colonies.find(item => item.colony === 'lichen')!.actions = [
    { id: `lichen.forage.${patches(session.state, 'lichen')[0].id}`, effort: 1 },
    { id: `lichen.spread.${center.id}`, effort: 2 },
  ];
  const protectedState = session.preview({ type: 'season', edits: [], plan: held });
  expect(getTile(protectedState, center.id).owner).toBe('moss');
  expect(protectedState.events.some(event => event.text.includes('failed to claim'))).toBe(true);
});

test('pure rules reject illegal tiles, routes, budgets, plans and replay changes atomically', () => {
  const session = new GameSession(definition, 76);
  const state = session.state;
  const rock = state.tiles.find(tile => tile.rock)!;
  const moss = patches(state, 'moss')[0];
  const coral = patches(state, 'coral')[0];
  const water: Edit = { kind: 'water', tile: moss.id, to: '' };
  expect(() => stageEdits(state, [{ ...water, tile: rock.id }])).toThrow('Basalt');
  expect(() => stageEdits(state, Array.from({ length: 4 }, () => water))).toThrow('at most 3');
  expect(() => stageEdits(state, [{ ...water, tile: 't999' }])).toThrow('Unknown');
  expect(() => stageEdits(state, [{ kind: 'shelter', tile: moss.id, to: '' }, { kind: 'seedbank', tile: moss.id, to: '' }])).toThrow('already');
  expect(() => stageEdits(state, [{ kind: 'channel', tile: moss.id, to: coral.id }])).toThrow('out of route range');
  expect(() => stageEdits(state, [{ kind: 'bridge', tile: moss.id, to: 't0' }])).toThrow('different living colonies');
  expect(() => stageEdits(state, [{ ...water, to: coral.id }])).toThrow('Only routes');
  const valid = tendingPlan(observation(state, []));
  const overBudget = structuredClone(valid);
  overBudget.colonies[0].actions[0].effort = 3;
  expect(() => session.preview({ type: 'season', edits: [], plan: overBudget })).toThrow('only 3 effort');
  const duplicate = structuredClone(valid);
  duplicate.colonies[1] = duplicate.colonies[0];
  expect(() => session.preview({ type: 'season', edits: [], plan: duplicate })).toThrow('exactly once');
  const unaffordable = defendPlan(observation(state, []));
  unaffordable.colonies[0].actions = catalog(state, 'moss').filter(action => action.kind === 'spread').slice(0, 3).map(action => ({ id: action.id, effort: 1 }));
  expect(() => session.preview({ type: 'season', edits: [], plan: unaffordable })).toThrow('needs 2 reserve');
  expect(() => session.preview({ type: 'season', edits: [], plan: { ...valid, season: 2 } })).toThrow('different season');
  expect(() => tool.parse({ ...valid, score: 999 })).toThrow('unexpected');
  expect(() => tool.parse({ ...valid, colonies: [{ colony: 'moss' }] })).toThrow(AgentValidationError);
  const before = session.serialize();
  const envelope = JSON.parse(before);
  expect(() => session.restore(JSON.stringify({ ...envelope, commands: [{ type: 'season', edits: [], plan: overBudget }] }))).toThrow('only 3 effort');
  expect(session.serialize()).toBe(before);
  expect(session.revision).toBe(0);
  const thirsty = new GameSession(definition, 76);
  const watering: Edit[] = patches(state).map(tile => ({ kind: 'water', tile: tile.id, to: '' }));
  thirsty.dispatch({ type: 'season', edits: watering, plan: tendingPlan(observation(state, watering)) });
  expect(thirsty.state.stock.water).toBe(3);
  const openSoil = thirsty.state.tiles.filter(tile => !tile.rock && !tile.owner);
  expect(() => stageEdits(thirsty.state, openSoil.slice(0, 2).map(tile => ({ kind: 'water', tile: tile.id, to: '' })))).toThrow('Not enough water');
  const built = new GameSession(definition, 76);
  built.dispatch({ type: 'season', edits: shelters(state), plan: tendingPlan(observation(state, shelters(state))) });
  expect(() => stageEdits(built.state, shelters(built.state))).toThrow('Not enough tools');
});

test('pure infrastructure: channels conserve nutrients, bridges extend sharing, seedbanks delay death', () => {
  const state = create(76);
  const moss = patches(state, 'moss')[0], coral = patches(state, 'coral')[0];
  const center = state.tiles.find(tile => tile.q === 0 && tile.r === 0)!;
  expect(distance(moss, coral)).toBe(2);
  expect(catalog(state, 'moss').some(action => action.kind === 'share' && action.tile === coral.id)).toBe(false);
  const edits: Edit[] = [{ kind: 'bridge', tile: moss.id, to: coral.id }, { kind: 'channel', tile: center.id, to: moss.id }];
  const draft = stageEdits(state, edits);
  expect(catalog(draft, 'moss').some(action => action.kind === 'share' && action.tile === coral.id)).toBe(true);
  const session = new GameSession(definition, 76);
  const routed = session.dispatch({ type: 'season', edits, plan: defendPlan(observation(state, edits)) });
  expect(routed.events.some(event => event.text.includes('routed 2 water and 1 nutrient'))).toBe(true);
  expect(mineralBalance(routed)).toBe(state.mineralTotal);
  const seeded = new GameSession(definition, 76);
  for (let season = 1; season <= 6; season++) {
    const banks: Edit[] = season === 1 ? patches(seeded.state).map(tile => ({ kind: 'seedbank', tile: tile.id, to: '' })) : [];
    seeded.dispatch({ type: 'season', edits: banks, plan: defendPlan(observation(seeded.state, banks)) });
  }
  expect(patches(seeded.state)).toHaveLength(3);
  expect(seeded.state.tiles.some(tile => tile.structure === 'seedbank')).toBe(false);
  expect(seeded.state.events.filter(event => event.text.includes('one-use seedbank'))).toHaveLength(3);
  expect(seeded.state.phase).toBe('lost');
  expect(seeded.state.ending).toContain('archive is incomplete');
  expect(() => seeded.dispatch({ type: 'season', edits: [], plan: defendPlan(observation(state, [])) })).toThrow('ended');
});

test('smokeCase is pure, realistic, and applies an accepted first-season tool plan', () => {
  const smoke = smokeCase();
  const view = smoke.request.observation as Observation;
  expect(view.stagedInterventions).toHaveLength(3);
  expect(view.stockAfterDraft.tools).toBe(4);
  const plan = tool.parse(tendingPlan(view));
  smoke.verify(plan);
});

test('full UI campaign wins through drafted protection, meaningful model strategies and six actual API turns', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => tendingPlan(observed(turn)));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  expect(calls).toHaveLength(0);
  let state = create(76);
  for (let season = 1; season <= 6; season++) {
    const edits: Edit[] = season === 1 ? shelters(state) : season === 2 ?
      patches(state).filter(tile => tile.structure === 'none').map((tile, i) => ({ kind: i < 2 ? 'shelter' : 'water', tile: tile.id, to: '' })) :
      season === 5 ? patches(state).filter(tile => tile.structure === 'none').map(tile => ({ kind: 'water', tile: tile.id, to: '' })) : [];
    for (const edit of edits) await stage(page, edit);
    await expect(page.locator(app)).toHaveAttribute('data-season', String(season - 1));
    await commit(page, season);
    state = await stateOf(page);
    expect(mineralBalance(state)).toBe(state.mineralTotal);
    if (season === 3) {
      await page.reload();
      await expect(page.locator(app)).toHaveAttribute('data-season', '3');
      expect(calls).toHaveLength(3);
    }
  }
  await expect(page.locator(app)).toHaveAttribute('data-phase', 'won');
  await expect(page.getByRole('heading', { name: 'A world worth carrying.' })).toBeVisible();
  expect(state.colonies.every(colony => colony.spores >= GOAL.each)).toBe(true);
  expect(patches(state).length).toBeGreaterThanOrEqual(GOAL.patches);
  expect(totalSpores(state)).toBeGreaterThanOrEqual(GOAL.spores);
  expect(calls).toHaveLength(6);
  expect(calls.map(call => observed(call).forecast.biome)).toEqual(['Dew nursery', 'Dew nursery', 'Glass drought', 'Glass drought', 'Ember bloom', 'Ember bloom']);
  await expect(page.locator('[data-commit]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('full UI ecology-collapse campaign loses legitimately and restart restores the complete initial world', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => defendPlan(observed(turn)));
  await open(page);
  for (let season = 1; season <= 6; season++) await commit(page, season);
  const ended = await stateOf(page);
  expect(ended.phase).toBe('lost');
  expect(patches(ended)).toHaveLength(0);
  await expect(page.locator('[data-ending-copy]')).toContainText('Ecology collapsed');
  expect(calls).toHaveLength(6);
  await page.getByRole('button', { name: 'Grow another world' }).click();
  await expect(page.locator(app)).toHaveAttribute('data-season', '0');
  await expect(page.locator(app)).toHaveAttribute('data-phase', 'active');
  expect(await stateOf(page)).toEqual(create(76));
  expect(calls).toHaveLength(6);
});

test('UI staging enforces tile, capacity, route and per-season budgets without eager requests', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => tendingPlan(observed(turn)));
  await open(page);
  const initial = create(76);
  const rock = initial.tiles.find(tile => tile.rock)!;
  await stage(page, { kind: 'water', tile: rock.id, to: '' });
  await expect(page.locator('[data-status]')).toContainText('Basalt');
  await expect(page.locator('[data-draft]')).toContainText('0/3');
  const soil = patches(initial, 'moss')[0];
  await stage(page, { kind: 'water', tile: soil.id, to: '' });
  await stage(page, { kind: 'water', tile: soil.id, to: '' });
  await stage(page, { kind: 'water', tile: soil.id, to: '' });
  await expect(page.locator('[data-status]')).toContainText('at most 12');
  await expect(page.locator('[data-draft]')).toContainText('2/3');
  await stage(page, { kind: 'shelter', tile: soil.id, to: '' });
  await expect(page.locator(`${app} [data-stage]`)).toBeDisabled();
  await expect(page.locator('[data-water]')).toHaveText('6');
  await expect(page.locator(app)).toHaveAttribute('data-revision', '0');
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  expect(await stateOf(page)).toEqual(initial);
  await stage(page, { kind: 'bridge', tile: soil.id, to: patches(initial, 'coral')[0].id });
  await commit(page, 1);
  expect(observed(calls[0]).links).toHaveLength(1);
  expect(observed(calls[0]).colonies.find(colony => colony.id === 'moss')!.legalActions.some(action => action.kind === 'share')).toBe(true);
});

test('malformed plans get exactly one correction; repeated illegality never spends a draft', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => ({ ...tendingPlan(observed(turn)), score: 999 }));
  await open(page);
  await stage(page, shelters(create(76))[0]);
  await page.locator('[data-commit]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('illegal plan twice');
  expect(calls).toHaveLength(2);
  expect(calls[1].messages).toHaveLength(4);
  await expect(page.locator(app)).toHaveAttribute('data-season', '0');
  await expect(page.locator(app)).toHaveAttribute('data-revision', '0');
  await expect(page.locator('[data-draft]')).toContainText('1/3');
  await expect(page.locator('[data-tools]')).toHaveText('8');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-tools]')).toHaveText('10');
});

test('corrected plans commit only once and model-authored intentions remain inert text', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = tendingPlan(observed(turn));
    if (turn.index === 0) plan.colonies[0].actions[0].id = 'moss.execute.code';
    else plan.colonies[0].intention = '<img src=x onerror="document.body.dataset.injected=1"> Grow toward light.';
    return plan;
  });
  await open(page);
  await commit(page, 1);
  expect(calls).toHaveLength(2);
  await expect(page.locator(app)).toHaveAttribute('data-revision', '1');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  const inspector = page.getByRole('dialog', { name: 'Under the lens' });
  await expect(inspector).toContainText('<img src=x');
  await expect(inspector.locator('img')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('data-injected')).toBeNull();
});

test('HTTP and malformed native responses surface errors without offline substitution or resource loss', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => tendingPlan(observed(turn)));
  let requests = 0;
  await page.route('**/api/openai/v1/chat/completions', async route => {
    requests++;
    await route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: requests === 1 ? '{"error":{"message":"unavailable"}}' : '{"choices":[]}' });
  });
  await open(page);
  await stage(page, shelters(create(76))[0]);
  await page.locator('[data-commit]').click();
  await expect(page.locator('[data-agent-status]')).toContainText('HTTP 503');
  await expect(page.locator(app)).toHaveAttribute('data-season', '0');
  await page.locator('[data-commit]').click();
  await expect(page.locator('[data-agent-host]')).toHaveAttribute('data-agent-error', 'true');
  await expect(page.locator(app)).toHaveAttribute('data-agent-busy', 'false');
  expect(requests).toBe(2);
  expect(calls).toHaveLength(0);
  await expect(page.locator('[data-draft]')).toContainText('1/3');
  await expect(page.locator(app)).toHaveAttribute('data-revision', '0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-tools]')).toHaveText('10');
});

test('pending selection and lens changes preserve revision; reset cancels and discards a stale API plan', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async turn => { await gate; return tendingPlan(observed(turn)); });
  await open(page);
  await stage(page, shelters(create(76))[0]);
  await page.locator('[data-commit]').click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator(`${app} [data-stage]`)).toBeDisabled();
  await page.locator('[data-colony="coral"]').click();
  await page.getByRole('button', { name: 'Lens +', exact: true }).click();
  await expect(page.locator(app)).toHaveAttribute('data-revision', '0');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  release!();
  await expect(page.locator(app)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator(app)).toHaveAttribute('data-revision', '1');
  await expect(page.locator(app)).toHaveAttribute('data-season', '0');
  expect(await stateOf(page)).toEqual(create(76));
  await expect(page.locator('[data-draft]')).toContainText('0/3');
  await expect(page.locator('[data-agent-status]')).toContainText('cancelled');
});

test('notebook exports, reloads, rejects invalid imports, and restores native replays without model calls', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => tendingPlan(observed(turn)));
  await open(page);
  for (const edit of shelters(create(76))) await stage(page, edit);
  await commit(page, 1);
  const before = await stateOf(page);
  const encoded = await saved(page);
  await page.reload();
  await expect(page.locator(app)).toHaveAttribute('data-season', '1');
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('graft-replay.json');
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing native replay download');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(encoded);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await stage(page, { kind: 'water', tile: patches(create(76), 'moss')[0].id, to: '' });
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(encoded), state: { spores: 999 } })) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator(app)).toHaveAttribute('data-season', '0');
  await expect(page.locator('[data-draft]')).toContainText('1/3');
  await page.locator('[data-game-import]').setInputFiles({ name: 'graft.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  await expect(page.locator(app)).toHaveAttribute('data-season', '1');
  await expect(page.locator('[data-draft]')).toContainText('0/3');
  expect(await stateOf(page)).toEqual(before);
  expect(calls).toHaveLength(1);
});

test('keyboard and touch alternatives remain visible without scrolling at desktop, phone and short landscape', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => tendingPlan(observed(turn)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  for (const size of [{ width: 1440, height: 900 }, { width: 320, height: 640 }, { width: 768, height: 480 }]) {
    await page.setViewportSize(size);
    const scene = page.locator('[data-scene]');
    await scene.focus();
    const original = await page.locator('[data-tile]').inputValue();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-tile]')).not.toHaveValue(original);
    await page.keyboard.press('Home');
    await expect(page.locator('[data-tile]')).toHaveValue(patches(create(76), 'moss')[0].id);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      viewWidth: innerWidth, viewHeight: innerHeight,
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewHeight + 1);
    await page.screenshot({ path: test.info().outputPath(`graft-${size.width}x${size.height}.png`) });
    for (const selector of ['h1', '[data-scene]', '[data-commit]', '[data-tile]', '.graft-footer']) {
      const rect = await page.locator(`${app} ${selector}`).boundingBox();
      expect(rect, selector).not.toBeNull();
      expect(rect!.y, selector).toBeGreaterThanOrEqual(0);
      expect(rect!.y + rect!.height, selector).toBeLessThanOrEqual(size.height + 1);
      if (selector === '[data-scene]') expect(rect!.height).toBeGreaterThan(100);
    }
    const menu = await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox();
    const log = await page.getByRole('button', { name: 'Agent action log', exact: true }).boundingBox();
    expect(log!.x + log!.width).toBeLessThanOrEqual(menu!.x);
    await page.getByRole('button', { name: 'Field guide', exact: true }).click();
    const selection = await page.locator('[data-tile]').inputValue();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-tile]')).toHaveValue(selection);
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption(patches(create(76), 'coral')[0].id);
    await page.getByRole('button', { name: 'Lens +', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Whole biome' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Whole biome' }).click();
    expect(await page.locator('.graft-vein').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  }
  expect(calls).toHaveLength(0);
});
