import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { AgentValidationError } from '../../src/core/agents/errors';
import { isRecord } from '../../src/core/agents/schema';
import { GameSession } from '../../src/core/games/session';
import { councilTool, observation, smokeCase } from '../../src/projects/accord/agent';
import { CONDITIONS, DELEGATE_IDS, FIELDS, SECTORS } from '../../src/projects/accord/data';
import type { Condition, DelegateId, Offer, Plan, Policy, State, Vote } from '../../src/projects/accord/data';
import { create, definition, legalOffers, legalVotes, majority, projectPolicy, reduce } from '../../src/projects/accord/engine';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';

const URL = './projects/accord/';
const SAVE_KEY = 'odd-index:game:accord:v1';
const ESTUARY: Policy[] = [
  { barrier: 3, power: 3, water: 2, food: 4 },
  { barrier: 3, power: 3, water: 2, food: 4 },
  { barrier: 4, power: 3, water: 2, food: 3 },
  { barrier: 4, power: 3, water: 2, food: 3 },
  { barrier: 5, power: 3, water: 1, food: 3 },
  { barrier: 5, power: 3, water: 1, food: 3 },
];
const EXPOSED: Policy[] = [
  { barrier: 3, power: 3, water: 2, food: 4 },
  { barrier: 4, power: 3, water: 2, food: 3 },
  { barrier: 4, power: 3, water: 2, food: 3 },
  { barrier: 5, power: 3, water: 1, food: 3 },
  { barrier: 5, power: 3, water: 1, food: 3 },
  { barrier: 6, power: 3, water: 1, food: 2 },
];

function planFor(state: State, votes: Partial<Record<DelegateId, Vote>> = {}): Plan {
  return {
    decisions: DELEGATE_IDS.map(delegate => ({
      delegate, vote: votes[delegate] ?? (legalVotes(state, delegate).includes('yes') ? 'yes' : 'no'),
      promise: 'none', statement: `The ${delegate} constituency records its public decision.`,
    })),
    offers: [],
  };
}

function fixturePlan(turn: FixtureTurn): Plan {
  const delegates = turn.observation.delegates;
  if (!Array.isArray(delegates)) throw new Error('Missing distinct delegate observations.');
  return {
    decisions: DELEGATE_IDS.map(delegate => {
      const record: unknown = delegates.find(item => isRecord(item) && item.id === delegate);
      if (!isRecord(record) || !Array.isArray(record.legalVotes)) throw new Error('Missing legal vote budget.');
      return {
        delegate, vote: record.legalVotes.includes('yes') ? 'yes' : 'no', promise: 'none',
        statement: delegate === 'vale' ? 'The wall must protect every quay.' :
          delegate === 'reed' ? 'I have counted the pumps and the reserve.' : 'Water and food are a shared obligation.',
      };
    }),
    offers: [],
  };
}

function allocateState(state: State, policy: Policy): State {
  let next = state;
  for (const field of FIELDS) if (policy[field] < next.policy[field]) next = reduce(next, { type: 'allocate', field, value: policy[field] });
  for (const field of FIELDS) if (policy[field] > next.policy[field]) next = reduce(next, { type: 'allocate', field, value: policy[field] });
  return next;
}

async function start(page: Page, condition: Condition = 'estuary') {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Accord', exact: true })).toBeVisible();
  await page.locator('[data-condition]').selectOption(condition);
  await page.getByRole('button', { name: 'Open the council', exact: true }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'draft');
}

async function allocateUI(page: Page, policy: Policy) {
  for (const direction of ['decrease', 'increase']) {
    for (const field of FIELDS) {
      const input = page.getByRole('slider', { name: `${SECTORS[field].name} works` });
      const current = Number(await input.inputValue());
      const delta = policy[field] - current;
      if ((direction === 'decrease' && delta < 0) || (direction === 'increase' && delta > 0)) {
        await input.focus();
        for (let i = 0; i < Math.abs(delta); i++) await input.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
    }
  }
  await expect(page.locator('[data-allocated]')).toHaveText('12 / 12 works');
}

async function hearing(page: Page) {
  await page.getByRole('button', { name: 'Call council', exact: false }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'ballot');
}

async function savedReplay(page: Page): Promise<string> {
  return page.evaluate(key => {
    const encoded = localStorage.getItem(key);
    if (!encoded) throw new Error('No accepted-move replay was saved.');
    const replay: unknown = JSON.parse(encoded);
    if (typeof replay !== 'string') throw new Error('Replay storage format must be text.');
    return replay;
  }, SAVE_KEY);
}

test('authoritative conservation and a complete winnable campaign in all three waters', () => {
  for (const condition of CONDITIONS) {
    let state = reduce(create(1), { type: 'start', condition });
    const policies = condition === 'exposed' ? EXPOSED : ESTUARY;
    for (const [season, policy] of policies.entries()) {
      state = allocateState(state, policy);
      const original = structuredClone(state);
      const prediction = projectPolicy(state);
      const next = reduce(state, { type: 'council', plan: planFor(state) });
      expect(state).toEqual(original);
      expect(next.resources.funds).toBe(state.resources.funds - 2);
      expect(next.resources.water).toBe(state.resources.water);
      expect(next.history).toHaveLength(season);
      state = reduce(next, { type: 'enact' });
      expect(state.resources).toEqual(prediction.after);
      const record = state.history[season];
      expect(record.projection.raw.water).toBe(record.before.water + record.projection.captured - 6 - record.projection.flood);
      expect(record.projection.raw.energy).toBe(record.before.energy + record.projection.generation - record.projection.load - record.projection.flood);
      expect(record.projection.raw.food).toBe(record.before.food + record.projection.harvest - 7 - record.projection.flood * 2);
      expect(state.phase).toBe(season === 5 ? 'won' : 'resolved');
      if (season < 5) state = reduce(state, { type: 'next' });
    }
    expect(state.resources.integrity).toBeGreaterThanOrEqual(40);
    expect(state.resources.cohesion).toBeGreaterThanOrEqual(30);
    expect(() => reduce(state, { type: 'next' })).toThrow(AgentValidationError);
    expect(() => reduce(state, { type: 'council', plan: planFor(state) })).toThrow(AgentValidationError);
  }
});

test('proposal, hearing, amendment, offer, vote and phase budgets are enforced without mutation', () => {
  const session = new GameSession(definition);
  session.dispatch({ type: 'start', condition: 'estuary' });
  const before = session.serialize();
  expect(() => session.dispatch({ type: 'allocate', field: 'food', value: 6 })).toThrow('Only 12 works');
  expect(() => session.dispatch({ type: 'enact' })).toThrow('completed council ballot');
  expect(session.serialize()).toBe(before);
  session.dispatch({ type: 'allocate', field: 'food', value: 3 });
  expect(() => session.dispatch({ type: 'council', plan: planFor(session.state) })).toThrow('exactly 12');
  session.dispatch({ type: 'allocate', field: 'food', value: 4 });
  const duplicate = planFor(session.state);
  duplicate.decisions[1].delegate = 'vale';
  expect(() => session.preview({ type: 'council', plan: duplicate })).toThrow('exactly once');
  const offerPlan = planFor(session.state, { vale: 'yes', reed: 'no', moss: 'abstain' });
  offerPlan.offers = [{ delegate: 'reed', from: 'food', to: 'power', amount: 1 }];
  expect(legalOffers(session.state, 'reed')).toContainEqual(offerPlan.offers[0]);
  const invalidOffer = { ...offerPlan, offers: [{ delegate: 'reed', from: 'food', to: 'food', amount: 1 }] };
  expect(() => session.preview({ type: 'council', plan: councilTool.parse(invalidOffer) })).toThrow('legal offer budget');
  expect(() => councilTool.parse({ ...offerPlan, resources: { food: 100 } })).toThrow('unexpected fields');
  expect(() => councilTool.parse({ ...offerPlan, offers: [...offerPlan.offers, ...offerPlan.offers, ...offerPlan.offers] })).toThrow('0-2');
  session.dispatch({ type: 'council', plan: offerPlan });
  expect(majority(session.state)).toBe(false);
  expect(() => session.dispatch({ type: 'enact' })).toThrow('two actual yes');
  expect(() => session.dispatch({ type: 'allocate', field: 'food', value: 3 })).toThrow('locked');
  session.dispatch({ type: 'take-offer', delegate: 'reed' });
  expect(session.state.policy).toEqual({ barrier: 3, power: 4, water: 2, food: 3 });
  expect(session.state.decisions).toEqual([]);
  expect(session.state.amendments).toBe(1);
  expect(legalOffers(session.state, 'reed')).toEqual([]);
  const repeated = planFor(session.state);
  repeated.offers = [{ delegate: 'reed', from: 'food', to: 'power', amount: 1 }];
  expect(() => session.preview({ type: 'council', plan: repeated })).toThrow('legal offer budget');
  session.dispatch({ type: 'council', plan: planFor(session.state) });
  session.dispatch({ type: 'amend' });
  expect(() => session.dispatch({ type: 'take-offer', delegate: 'reed' })).toThrow('no live counteroffer');
  session.dispatch({ type: 'council', plan: planFor(session.state) });
  expect(session.state.hearings).toBe(3);
  expect(session.state.resources.funds).toBe(10);
  expect(() => session.dispatch({ type: 'amend' })).toThrow('No amendments');
  expect(() => session.dispatch({ type: 'emergency' })).toThrow('only after rejection');
});

test('impossible support and public reciprocal promises have mechanical consequences', () => {
  const initial = reduce(create(1), { type: 'start', condition: 'estuary' });
  const flooded = allocateState(initial, { barrier: 0, power: 4, water: 3, food: 5 });
  expect(legalVotes(flooded, 'vale')).toEqual(['no', 'abstain']);
  const illegal = planFor(flooded, { vale: 'yes' });
  expect(() => reduce(flooded, { type: 'council', plan: illegal })).toThrow('cannot support flooded quays');
  const blackout = allocateState(initial, { barrier: 3, power: 0, water: 3, food: 6 });
  expect(legalVotes(blackout, 'reed')).toEqual(['no', 'abstain']);
  expect(legalVotes(blackout, 'moss')).toContain('yes');
  let pledged = reduce(initial, { type: 'pledge', delegate: 'reed' });
  expect(observation(pledged).delegates.find(item => item.id === 'reed')?.legalPromises).toEqual(['none', 'reciprocate']);
  expect(observation(pledged).delegates.find(item => item.id === 'vale')?.legalPromises).toEqual(['none']);
  const plan = planFor(pledged);
  plan.decisions[1].promise = 'reciprocate';
  expect(() => reduce(initial, { type: 'council', plan })).toThrow('matching player pledge');
  pledged = reduce(reduce(pledged, { type: 'council', plan }), { type: 'enact' });
  expect(pledged.pacts).toEqual([{ delegate: 'reed', field: 'power', minimum: 4, due: 1 }]);
  const due = reduce(pledged, { type: 'next' });
  const broken = reduce(reduce(due, { type: 'council', plan: planFor(due) }), { type: 'enact' });
  expect(broken.trust.reed).toBe(1);
  expect(broken.history.at(-1)?.trustNotes[0]).toContain('Your Reed pact broke');
  expect(legalVotes(reduce(broken, { type: 'next' }), 'reed')).toEqual(['no', 'abstain']);
  const honoredPolicy = allocateState(due, { barrier: 3, power: 4, water: 2, food: 3 });
  const honored = reduce(reduce(honoredPolicy, { type: 'council', plan: planFor(honoredPolicy) }), { type: 'enact' });
  expect(honored.trust.reed).toBe(4);
  const reneged = reduce(reduce(honoredPolicy, { type: 'council', plan: planFor(honoredPolicy, { reed: 'no' }) }), { type: 'enact' });
  expect(reneged.trust.reed).toBe(1);
  expect(reneged.history.at(-1)?.trustNotes[0]).toContain('withheld promised legal support');
  expect(reneged.resources.cohesion).toBe(honored.resources.cohesion - 5);
});

test('late-season and treasury limits never publish unusable counteroffers or future pacts', () => {
  let state = reduce(create(1), { type: 'start', condition: 'sheltered' });
  for (let season = 0; season < 6; season++) {
    if (season === 5) {
      expect(() => reduce(state, { type: 'pledge', delegate: 'moss' })).toThrow('no next season');
      expect(observation(state).delegates.every(item => item.legalPromises.length === 1)).toBe(true);
    }
    state = allocateState(state, ESTUARY[season]);
    for (let round = 0; round < 3; round++) {
      if (round === 2 || state.resources.funds < 4) {
        expect(DELEGATE_IDS.every(id => legalOffers(state, id).length === 0)).toBe(true);
      }
      const plan = planFor(state);
      state = reduce(state, { type: 'council', plan });
      if (round < 2 && state.resources.funds < 2) {
        expect(() => reduce(state, { type: 'amend' })).toThrow('cannot fund another hearing');
        break;
      }
      if (round < 2) state = reduce(state, { type: 'amend' });
    }
    state = reduce(state, { type: 'enact' });
    if (season < 5) state = reduce(state, { type: 'next' });
  }
  expect(state.phase).toBe('won');
  expect(state.resources.funds).toBe(2);
});

test('counteroffers stay supportable after both the current and mandatory follow-up hearing', () => {
  let state = reduce(create(1), { type: 'start', condition: 'estuary' });
  for (let season = 0; season < 3; season++) {
    state = allocateState(state, ESTUARY[season]);
    for (let hearing = 0; hearing < 3; hearing++) {
      state = reduce(state, { type: 'council', plan: planFor(state) });
      if (hearing < 2) state = reduce(state, { type: 'amend' });
    }
    state = reduce(reduce(state, { type: 'enact' }), { type: 'next' });
  }
  state = allocateState(state, ESTUARY[0]);
  expect(state.season).toBe(3);
  expect(state.resources.funds).toBe(4);
  const insolventOffer: Offer = { delegate: 'reed', from: 'food', to: 'power', amount: 1 };
  expect(legalOffers(state, 'reed')).not.toContainEqual(insolventOffer);
  const rejectedPlan = { ...planFor(state), offers: [insolventOffer] };
  const before = structuredClone(state);
  expect(() => reduce(state, { type: 'council', plan: rejectedPlan })).toThrow('legal offer budget');
  expect(state).toEqual(before);
  for (const delegate of DELEGATE_IDS) {
    for (const offer of legalOffers(state, delegate)) {
      const ballot = reduce(state, { type: 'council', plan: { ...planFor(state), offers: [offer] } });
      const amended = reduce(ballot, { type: 'take-offer', delegate });
      expect(amended.resources.funds).toBe(2);
      expect(legalVotes(amended, delegate), JSON.stringify(offer)).toContain('yes');
    }
  }
});

test('replays reconstruct legal transitions atomically and smokeCase uses a real initial hearing', () => {
  const session = new GameSession(definition, 42);
  session.dispatch({ type: 'start', condition: 'sheltered' });
  session.dispatch({ type: 'council', plan: planFor(session.state) });
  session.dispatch({ type: 'enact' });
  const replay = session.serialize();
  const clone = new GameSession(definition);
  clone.restore(replay);
  expect(clone.state).toEqual(session.state);
  const revision = clone.revision;
  const bad: unknown = JSON.parse(replay);
  if (!isRecord(bad) || !Array.isArray(bad.commands)) throw new Error('Invalid test replay.');
  bad.commands.push({ type: 'enact' });
  expect(() => clone.restore(JSON.stringify(bad))).toThrow('completed council ballot');
  expect(clone.serialize()).toBe(replay);
  expect(clone.revision).toBe(revision);
  clone.reset();
  expect(clone.revision).toBeGreaterThan(revision);
  expect(clone.state.phase).toBe('setup');
  const smoke = smokeCase();
  const initial = reduce(create(1), { type: 'start', condition: 'estuary' });
  const plan = planFor(initial, { moss: 'abstain' });
  expect(smoke.request.observation).toEqual(observation(initial));
  smoke.request.validate(plan);
  smoke.verify(plan);
});

test('complete UI campaign wins, exports, restarts and restores without eager model calls', async ({ page }, testInfo) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page);
  expect(calls).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('accord-desktop.png') });
  for (const [season, policy] of ESTUARY.entries()) {
    await allocateUI(page, policy);
    await hearing(page);
    expect(calls).toHaveLength(season + 1);
    await expect(page.locator('[data-vote="vale"]')).toHaveText('yes');
    await page.getByRole('button', { name: 'Enact policy', exact: true }).click();
    await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', season === 5 ? 'won' : 'resolved');
    if (season < 5) await page.getByRole('button', { name: 'Next season', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Accord secured.' })).toBeVisible();
  const replay = await savedReplay(page);
  expect(replay).not.toContain('fixture-tool-model');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('accord-replay.json');
  const path = await download.path();
  if (!path) throw new Error('Export did not produce a native download.');
  expect(await readFile(path, 'utf8')).toBe(replay);
  await page.getByRole('button', { name: 'Close Game notebook' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Restart this campaign', exact: true }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'draft');
  await expect(page.locator('[data-turn-budget]')).toContainText('Hearings 0/3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'accord-replay.json', mimeType: 'application/json', buffer: Buffer.from(replay) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Every recorded move passed');
  await page.getByRole('button', { name: 'Close Game notebook' }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'won');
  await page.reload();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'won');
  expect(calls).toHaveLength(6);
});

test('distinct delegate votes, a bounded counteroffer, escaped statements and a reciprocal pact', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = fixturePlan(turn);
    if (turn.index === 0) {
      plan.decisions[1].vote = 'no';
      plan.decisions[2].vote = 'abstain';
      plan.decisions[1].statement = '<img src=x onerror=alert(1)> Move one garden work into turbines.';
      plan.offers = [{ delegate: 'reed', from: 'food', to: 'power', amount: 1 }];
    } else {
      plan.decisions[1].promise = 'reciprocate';
      plan.decisions[2].vote = 'abstain';
    }
    return plan;
  });
  await start(page);
  await page.locator('[data-pledge]').selectOption('reed');
  await hearing(page);
  await expect(page.locator('[data-vote="vale"]')).toHaveText('yes');
  await expect(page.locator('[data-vote="reed"]')).toHaveText('no');
  await expect(page.locator('[data-vote="moss"]')).toHaveText('abstain');
  await expect(page.getByRole('button', { name: 'Enact policy', exact: true })).toHaveCount(0);
  await page.locator('[data-delegate="reed"]').click();
  await expect(page.locator('#accord-delegate blockquote')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#accord-delegate img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Delegate seat' }).click();
  await page.locator('[data-take-offer="reed"]').click();
  await expect(page.locator('[data-field="power"]')).toHaveValue('4');
  await expect(page.locator('[data-field="food"]')).toHaveValue('3');
  await expect(page.locator('[data-turn-budget]')).toContainText('amendments 1/2');
  await expect(page.locator('[data-vote="vale"]')).toHaveText('Awaiting');
  await hearing(page);
  expect(calls).toHaveLength(2);
  await page.getByRole('button', { name: 'Enact policy', exact: true }).click();
  await expect(page.locator('[data-pact-note]')).toContainText('Next season: Reed pact');
  const restored = new GameSession(definition);
  restored.restore(await savedReplay(page));
  expect(restored.state.resources.funds).toBe(15);
  expect(restored.state.pacts).toHaveLength(1);
  expect(restored.state.history[0].policy.power).toBe(4);
});

test('a legally approved reckless policy causes a complete UI flood loss', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page, 'sheltered');
  for (let season = 0; season < 2; season++) {
    await allocateUI(page, { barrier: 0, power: 3, water: 3, food: 6 });
    await expect(page.locator('[data-flood-tag]')).toContainText('Flood exposure');
    await hearing(page);
    await expect(page.locator('[data-vote="vale"]')).toHaveText('no');
    await expect(page.locator('[data-vote="reed"]')).toHaveText('yes');
    await expect(page.locator('[data-vote="moss"]')).toHaveText('yes');
    await page.getByRole('button', { name: 'Enact policy', exact: true }).click();
    if (season === 0) await page.getByRole('button', { name: 'Next season', exact: true }).click();
  }
  await expect(page.locator('.project-accord')).toHaveAttribute('data-outcome', 'lost');
  await expect(page.locator('[data-finish-summary]')).toContainText('Flood damage exhausted the city fabric');
  expect(calls).toHaveLength(2);
});

test('a real resource shortfall ends the UI campaign even with two legal yes votes', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await start(page);
  await allocateUI(page, { barrier: 3, power: 0, water: 3, food: 6 });
  await expect(page.locator('[data-resource="energy"]')).toHaveAttribute('data-danger', 'true');
  await hearing(page);
  await expect(page.locator('[data-vote="reed"]')).toHaveText('no');
  await page.getByRole('button', { name: 'Enact policy', exact: true }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-outcome', 'lost');
  await expect(page.locator('[data-finish-summary]')).toContainText('The grid failed');
  expect(calls).toHaveLength(1);
});

test('rejection uses only the explicit emergency rule and repeated emergencies lose the mandate', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = fixturePlan(turn);
    for (const decision of plan.decisions) decision.vote = 'no';
    return plan;
  });
  await start(page);
  for (let season = 0; season < 5; season++) {
    await hearing(page);
    await page.getByRole('button', { name: 'Emergency charter', exact: true }).click();
    await expect(page.locator('#accord-emergency')).toContainText('3 extra crowns and 14 cohesion');
    await page.getByRole('button', { name: 'Enact emergency', exact: true }).click();
    if (season < 4) await page.getByRole('button', { name: 'Next season', exact: true }).click();
  }
  await expect(page.locator('.project-accord')).toHaveAttribute('data-outcome', 'lost');
  await expect(page.locator('[data-finish-summary]')).toContainText('The treasury defaulted');
  const replay = new GameSession(definition);
  replay.restore(await savedReplay(page));
  expect(replay.state.resources.cohesion).toBe(0);
  expect(replay.state.resources.funds).toBeLessThan(0);
  expect(replay.state.history.every(item => item.mode === 'emergency' && item.votes.every(vote => vote.vote === 'no'))).toBe(true);
  expect(calls).toHaveLength(5);
});

test('invalid model plans receive one correction, never spend funds or advance on failure', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => {
    const plan = fixturePlan(turn);
    plan.decisions[1].delegate = 'vale';
    return plan;
  });
  await start(page);
  const before = await savedReplay(page);
  await page.getByRole('button', { name: 'Call council', exact: false }).click();
  await expect(page.locator('[data-agent-status]')).toContainText('illegal plan twice');
  expect(calls).toHaveLength(2);
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'draft');
  await expect(page.locator('[data-turn-budget]')).toContainText('Hearings 0/3');
  expect(await savedReplay(page)).toBe(before);
  expect(calls[1].messages).toHaveLength(4);
});

test('HTTP and network errors are explicit; retry commits the original policy only after success', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  const failure = (route: Route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture unavailable"}' });
  await page.route('**/api/openai/v1/chat/completions', failure);
  await start(page);
  const before = await savedReplay(page);
  await page.getByRole('button', { name: 'Call council', exact: false }).click();
  await expect(page.locator('[data-agent-status]')).toContainText('HTTP 503');
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'draft');
  expect(await savedReplay(page)).toBe(before);
  await page.unroute('**/api/openai/v1/chat/completions', failure);
  const disconnected = (route: Route) => route.abort('failed');
  await page.route('**/api/openai/v1/chat/completions', disconnected);
  await page.getByRole('button', { name: 'Call council', exact: false }).click();
  await expect(page.locator('[data-agent-status]')).toContainText('could not be reached');
  expect(await savedReplay(page)).toBe(before);
  await page.unroute('**/api/openai/v1/chat/completions', disconnected);
  await hearing(page);
  expect(calls).toHaveLength(1);
  await expect(page.locator('[data-field="food"]')).toHaveValue('4');
});

test('view-only changes keep a pending turn; restart cancels a late response and replay import is atomic', async ({ page }) => {
  let release: () => void = () => { throw new Error('No delayed turn was started.'); };
  const wait = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async turn => { await wait; return fixturePlan(turn); });
  await start(page);
  const replay = await savedReplay(page);
  await page.getByRole('button', { name: 'Call council', exact: false }).click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('[data-field="barrier"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-agent-busy', 'true');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Restart this campaign', exact: true }).click();
  release();
  await expect(page.locator('.project-accord')).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'draft');
  await expect(page.locator('[data-turn-budget]')).toContainText('Hearings 0/3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(replay.replace('"commands":[', '"commands":[{"type":"enact"},')),
  });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  expect(await savedReplay(page)).toBe(replay);
  await page.getByRole('button', { name: 'Close Game notebook' }).click();
  await hearing(page);
  expect(calls).toHaveLength(2);
});

test('320px and short-landscape workspaces keep scene and primary controls together, with keyboard and modal isolation', async ({ page }, testInfo) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  const wall = page.getByRole('slider', { name: 'Flood wall works' });
  await wall.focus();
  await wall.press('ArrowLeft');
  await expect(page.locator('[data-allocated]')).toHaveText('11 / 12 works');
  await expect(page.getByRole('button', { name: 'Call council', exact: false })).toBeDisabled();
  await wall.press('ArrowRight');
  await expect(page.locator('[data-allocated]')).toHaveText('12 / 12 works');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('n');
  await expect(page.locator('#accord-rules')).toBeVisible();
  await expect(wall).toHaveValue('3');
  await page.keyboard.press('Escape');
  await expect(page.locator('#accord-rules')).not.toBeVisible();
  for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.project-accord')!;
      const box = (selector: string) => {
        const rect = root.querySelector(selector)!.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        height: innerHeight, width: innerWidth, root: box('.accord-workbench'),
        scene: box('.accord-map'), primary: box('[data-primary]'), title: box('h1'),
        motion: getComputedStyle(root.querySelector('.accord-flow')!).animationName,
        font: getComputedStyle(root.querySelector('[data-primary]')!).fontSize,
      };
    });
    await page.screenshot({ path: testInfo.outputPath(`accord-${viewport.width}.png`) });
    expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1);
    expect(metrics.primary.bottom).toBeLessThanOrEqual(viewport.height);
    expect(metrics.primary.top).toBeGreaterThan(metrics.title.bottom);
    expect(metrics.scene.height).toBeGreaterThan(60);
    expect(metrics.scene.left).toBeGreaterThanOrEqual(0);
    expect(metrics.scene.right).toBeLessThanOrEqual(viewport.width);
    expect(metrics.motion).toBe('none');
    expect(parseFloat(metrics.font)).toBeGreaterThanOrEqual(14);
  }
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Call council', exact: false }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.project-accord')).toHaveAttribute('data-phase', 'ballot');
});
