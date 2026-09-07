import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installAgentFixture, configureFixtureConnection } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { GameSession } from '../../src/core/games/session';
import { AgentValidationError } from '../../src/core/agents/errors';
import { choice, object } from '../../src/core/agents/schema';
import { smokeCase, witnessTool } from '../../src/projects/mnemosyne/agent';
import { ROLES, SUSPECT_IDS, WITNESSES, caseFile } from '../../src/projects/mnemosyne/data';
import type { ArtifactId, ClaimId, SuspectId, WitnessId } from '../../src/projects/mnemosyne/data';
import {
  CLAIM_CHOICES, ALIBI_CHOICES, RECEPTIONS, corroborated, definition, edgeBetween,
} from '../../src/projects/mnemosyne/engine';
import type { Command, WitnessPlan } from '../../src/projects/mnemosyne/engine';

const URL = './projects/mnemosyne/';
const defaultPlan: WitnessPlan = {
  claimId: 'none', alibiId: 'none', reception: 'none', recipientId: 'none',
  trustAction: 'keep', relayId: 'none', testimony: 'I remember a fragment. I will not pretend that it is the whole night.',
};
function plan(overrides: Partial<WitnessPlan> = {}): WitnessPlan { return { ...defaultPlan, ...overrides }; }
function fixturePlan(turn: FixtureTurn): WitnessPlan {
  const claims = turn.observation.legalClaimIds;
  const alibis = turn.observation.legalAlibiIds;
  const receptions = turn.observation.legalReceptions;
  if (!Array.isArray(claims) || !Array.isArray(alibis) || !Array.isArray(receptions)) throw new Error('Missing witness constraints.');
  return plan({
    claimId: choice(claims.find(id => id !== 'none') ?? 'none', CLAIM_CHOICES, 'Fixture claim'),
    alibiId: choice(alibis.find(id => id !== 'none') ?? 'none', ALIBI_CHOICES, 'Fixture alibi'),
    reception: choice(receptions.includes('accept') ? 'accept' : 'none', RECEPTIONS, 'Fixture reception'),
  });
}
async function begin(page: Page) {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Mnemosyne.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Begin investigation', exact: true }).click();
}
async function interview(page: Page, id: WitnessId, reassure = false) {
  await page.getByLabel('Witness', { exact: true }).selectOption(id);
  await page.locator('[data-action-mode="interview"]').click();
  if (reassure) await page.getByLabel('Approach', { exact: true }).selectOption('reassure');
  await page.getByRole('button', { name: 'Interview witness', exact: true }).click();
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-agent-busy', 'false');
}
async function openNotebook(page: Page, section: 'claims' | 'objects' | 'voices') {
  const opener = page.locator('[data-records]');
  if (await opener.isVisible() && !(await page.locator('#mnemosyne-records').isVisible())) await opener.click();
  await page.locator(`[data-pane="${section}"]`).click();
}
async function inspect(page: Page, id: ArtifactId, pin = true) {
  await openNotebook(page, 'objects');
  await page.locator(`[data-artifact="${id}"]`).click();
  await page.locator(`[data-inspect="${id}"]`).click();
  await expect(page.locator('#mnemosyne-object')).toContainText('Recorded and corroborated');
  if (pin) await page.locator('[data-artifact-pin]').click();
  await page.getByRole('button', { name: 'Close The material record', exact: true }).click();
}
async function closeNotebook(page: Page) {
  if (await page.locator('#mnemosyne-records').isVisible()) {
    await page.getByRole('button', { name: 'Close Field notebook', exact: true }).click();
  }
}
async function publicSolution(page: Page): Promise<{ suspect: SuspectId; route: 'sluice' | 'stair'; time: string }> {
  await openNotebook(page, 'claims');
  const passage = await page.locator('[data-record="passage"]').textContent();
  const minute = await page.locator('[data-record="minute"]').textContent();
  const route = passage?.includes('sluice entrance') ? 'sluice' : 'stair';
  const time = /Corrected time: (21:\d{2})/.exec(minute ?? '')?.[1];
  expect(time).toBeTruthy();
  await closeNotebook(page);
  await page.getByRole('button', { name: 'Casebook', exact: true }).click();
  const roster = page.locator('#mnemosyne-casebook .mn-roster article');
  let suspect: SuspectId | undefined;
  for (const id of SUSPECT_IDS) {
    const text = await roster.filter({ has: page.getByText(WITNESSES[id].name, { exact: true }) }).textContent();
    if (text?.includes('Amber permit') && text.includes(`authorized entrances: ${route}`)) suspect = id;
  }
  expect(suspect).toBeDefined();
  await page.getByRole('button', { name: 'Close The casebook', exact: true }).click();
  return { suspect: suspect!, route, time: time! };
}
async function accuse(page: Page, wrong = false) {
  const solution = await publicSolution(page);
  await openNotebook(page, 'claims');
  await page.getByRole('button', { name: 'File an accusation', exact: true }).click();
  const dialog = page.locator('#mnemosyne-trial');
  await dialog.getByLabel('Accused', { exact: true }).selectOption(wrong ? SUSPECT_IDS.find(id => id !== solution.suspect)! : solution.suspect);
  await dialog.getByLabel('Entry route', { exact: true }).selectOption(solution.route);
  await dialog.getByLabel('Corrected time', { exact: true }).selectOption(solution.time);
  await dialog.getByLabel('Identity / permit evidence', { exact: true }).selectOption('imprint');
  await dialog.getByLabel('Entry / physical route evidence', { exact: true }).selectOption('passage');
  await dialog.getByLabel('Time / corrected chronology', { exact: true }).selectOption('minute');
  await dialog.getByLabel('Your reasoning', { exact: true }).fill(`The amber permit and ${solution.route} authorization intersect on this suspect. The local dial needs ten minutes added, placing the act at ${solution.time}. Each link has an independent source.`);
  await dialog.getByRole('button', { name: 'Submit final accusation', exact: true }).click();
}
function warrantSolve(session: GameSession<ReturnType<typeof definition.create>, Command>) {
  session.dispatch({ type: 'begin' });
  for (const artifactId of ['seal', 'threshold', 'recorder'] as const) session.dispatch({ type: 'inspect', artifactId });
  for (const claimId of ['imprint', 'passage', 'minute'] as const) session.dispatch({ type: 'pin', claimId });
  const file = caseFile(session.seed, session.state.chapter);
  session.dispatch({
    type: 'accuse', suspectId: file.culprit, route: file.route, time: file.time,
    links: ROLES.map((role, index) => ({ role, claimId: (['imprint', 'passage', 'minute'] as const)[index] })),
    reasoning: 'Permit and service access intersect; the stopped dial is corrected by the calibration record.',
  });
}

test('pure rules: every seeded chapter has a guaranteed affordable physical solution and deterministic replay', () => {
  for (let seed = 0; seed < 24; seed++) {
    const session = new GameSession(definition, seed);
    for (let chapter = 0; chapter < 2; chapter++) {
      warrantSolve(session);
      expect(session.state.phase).toBe('won');
      expect(session.state.turns).toBe(5);
      expect(session.state.influence).toBe(2);
      const replay = new GameSession(definition, 123);
      replay.restore(session.serialize());
      expect(replay.state).toEqual(session.state);
      if (chapter === 0) session.dispatch({ type: 'next' });
    }
  }
});

test('pure rules: observations, provenance, route gates and exact parsing cannot manufacture evidence', () => {
  const session = new GameSession(definition, 74);
  session.dispatch({ type: 'begin' });
  const before = session.serialize();
  const interviewIvo = { kind: 'interview', witnessId: 'ivo', approach: 'ask' } as const;
  expect(() => session.preview({ type: 'witness', encounter: interviewIvo, plan: plan({ claimId: 'minute' }) })).toThrow(/personal observation/);
  expect(() => session.dispatch({ type: 'pin', claimId: 'imprint' })).toThrow(/Unknown evidence/);
  expect(() => witnessTool.parse({ ...defaultPlan, culprit: 'ada' })).toThrow(/unexpected fields/);
  expect(() => witnessTool.parse({ ...defaultPlan, testimony: 'x'.repeat(261) })).toThrow(AgentValidationError);
  expect(() => session.preview({ type: 'witness', encounter: interviewIvo, plan: plan({ recipientId: 'ada' }) })).toThrow(/contact/);
  expect(() => session.preview({ type: 'witness', encounter: interviewIvo, plan: plan({ recipientId: 'cyra', relayId: 'imprint' }) })).toThrow(/at least two/);
  expect(session.serialize()).toBe(before);
  const testimony = plan({ claimId: 'imprint', recipientId: 'cyra', trustAction: 'strengthen', relayId: 'imprint' });
  session.dispatch({ type: 'witness', encounter: interviewIvo, plan: testimony });
  expect(session.state.leads).toContain('seal');
  expect(edgeBetween(session.state, 'ivo', 'cyra')?.trust).toBe(2);
  expect(session.state.beliefs).toContainEqual({ witnessId: 'cyra', claimId: 'imprint', origin: 'ivo' });
  expect(corroborated(session.state, 'imprint')).toBe(false);
  session.dispatch({ type: 'witness', encounter: interviewIvo, plan: plan({ claimId: 'imprint' }) });
  expect(corroborated(session.state, 'imprint')).toBe(false);
  const message = { kind: 'message', from: 'ivo', witnessId: 'nell', claimId: 'imprint' } as const;
  session.dispatch({ type: 'witness', encounter: message, plan: plan({ reception: 'accept', recipientId: 'ada', relayId: 'imprint' }) });
  expect(corroborated(session.state, 'imprint')).toBe(false);
  expect(session.state.trust.nell).toBe(2);
  expect(() => session.preview({ type: 'witness', encounter: message, plan: plan({ reception: 'accept' }) })).toThrow(/already been delivered/);
  session.dispatch({ type: 'witness', encounter: { kind: 'interview', witnessId: 'nell', approach: 'ask' }, plan: plan({ claimId: 'imprint' }) });
  expect(corroborated(session.state, 'imprint')).toBe(true);
  const record = session.state.records.find(item => item.claimId === 'imprint');
  expect(record?.sources).toEqual(['witness:ivo', 'witness:nell']);
  session.dispatch({
    type: 'witness', encounter: { kind: 'message', from: 'ivo', witnessId: 'cyra', claimId: 'rumor' },
    plan: plan({ reception: 'reject', recipientId: 'ivo', trustAction: 'cool' }),
  });
  expect(session.state.beliefs.some(item => item.witnessId === 'cyra' && item.claimId === 'rumor')).toBe(false);
  expect(session.state.trust.cyra).toBe(0);
  expect(edgeBetween(session.state, 'ivo', 'cyra')?.trust).toBe(1);
});

test('pure rules: witness-only corroboration wins, bad citations fail, and the last bell preserves a filing', () => {
  const session = new GameSession(definition, 74);
  session.dispatch({ type: 'begin' });
  const pairs: [WitnessId, ClaimId, 'ask' | 'reassure'][] = [
    ['ivo', 'imprint', 'ask'], ['nell', 'imprint', 'reassure'], ['nell', 'minute', 'ask'],
    ['bram', 'passage', 'ask'], ['bram', 'minute', 'reassure'], ['cyra', 'passage', 'reassure'],
  ];
  for (const [witnessId, claimId, approach] of pairs) session.dispatch({ type: 'witness', encounter: { kind: 'interview', witnessId, approach }, plan: plan({ claimId }) });
  expect(session.state.inspected).toEqual([]);
  for (const claimId of ['imprint', 'passage', 'minute'] as const) {
    expect(corroborated(session.state, claimId)).toBe(true);
    session.dispatch({ type: 'pin', claimId });
  }
  const file = caseFile(session.seed, 0);
  const accusation: Command = {
    type: 'accuse', suspectId: file.culprit, route: file.route, time: file.time,
    links: [{ role: 'identity', claimId: 'imprint' }, { role: 'entry', claimId: 'passage' }, { role: 'time', claimId: 'minute' }],
    reasoning: 'Different direct observers support each constraint; the matching permit and route identify this suspect.',
  };
  expect(session.preview(accusation).phase).toBe('won');
  const bad = structuredClone(accusation);
  bad.links[0].claimId = 'rumor';
  expect(() => session.preview(bad)).toThrow(/discovered and pinned/);
  session.dispatch({ type: 'pin', claimId: 'rumor' });
  expect(session.preview(bad).phase).toBe('lost');
  for (const witnessId of ['ada', 'ada', 'ada', 'ivo', 'ivo', 'cyra', 'cyra', 'nell'] as const) {
    session.dispatch({ type: 'witness', encounter: { kind: 'interview', witnessId, approach: 'ask' }, plan: plan() });
  }
  expect(session.state.turns).toBe(0);
  expect(session.state.phase).toBe('last-call');
  expect(() => session.preview({ type: 'inspect', artifactId: 'ribbon' })).toThrow(/No investigation/);
  session.dispatch(accusation);
  expect(session.state.phase).toBe('won');
  expect(() => session.dispatch({ type: 'close' })).toThrow(/not open/);
});

test('pure smokeCase executes its real opening turn for sharing and withholding without truth leakage', () => {
  for (const chosen of [plan(), plan({ claimId: 'imprint', recipientId: 'cyra', trustAction: 'strengthen', relayId: 'imprint' })]) {
    const smoke = smokeCase();
    const request = smoke.request;
    expect(request.tool.name).toBe('give_archive_testimony');
    const encoded = JSON.stringify(request.observation);
    expect(encoded).not.toContain('"culprit"');
    expect(encoded).not.toContain('"true"');
    const parsed = request.tool.parse(chosen);
    expect(parsed).not.toBe(chosen);
    request.validate(parsed);
    smoke.verify(parsed);
  }
});

test('complete two-chapter UI solve: witness choices change the network, evidence links sustain both verdicts', async ({ page }, testInfo) => {
  const calls = await installAgentFixture(page, turn => {
    const result = fixturePlan(turn);
    if (turn.index === 0) return { ...result, recipientId: 'cyra', trustAction: 'strengthen', relayId: 'imprint' };
    const encounter = turn.observation.encounter;
    if (typeof encounter === 'object' && encounter && 'kind' in encounter && encounter.kind === 'message') {
      return { ...result, recipientId: 'ada', trustAction: 'strengthen', relayId: 'passage' };
    }
    return result;
  });
  await page.goto(URL);
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-workspace', 'true');
  await expect(page.locator('.project-mnemosyne [data-project-preview]')).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Begin investigation', exact: true }).click();
  await interview(page, 'ivo');
  await expect(page.locator('[data-person-trust="cyra"]')).toContainText('1 heard');
  await expect(page.locator('.mn-flow')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('mnemosyne-inquiry.png') });
  await inspect(page, 'seal');
  await interview(page, 'nell');
  await inspect(page, 'recorder');
  await interview(page, 'bram');
  await page.locator('[data-action-mode="message"]').click();
  await page.getByLabel('Message recipient', { exact: true }).selectOption('nell');
  await page.getByLabel('Message claim', { exact: true }).selectOption('passage');
  await page.getByRole('button', { name: 'Send / 1t + 1i', exact: true }).click();
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-person-trust="nell"]')).toContainText('Trust 2');
  await expect(page.locator('[data-person-trust="ada"]')).toContainText('1 heard');
  await inspect(page, 'threshold');
  await page.getByRole('button', { name: 'Evidence graph', exact: true }).click();
  await expect(page.locator('[data-graph-pins] button')).toHaveCount(3);
  expect(calls).toHaveLength(4);
  await accuse(page);
  await expect(page.locator('[data-ending="won"]')).toContainText('The record holds.');
  await page.getByRole('button', { name: 'Open chapter II', exact: true }).click();
  await expect(page.locator('[data-chapter]')).toContainText('The Borrowed Flood');
  await expect(page.locator('[data-budget]')).toHaveText('14 turns / 8 influence');
  await page.getByRole('button', { name: 'Begin investigation', exact: true }).click();
  for (const id of ['seal', 'threshold', 'recorder'] as const) await inspect(page, id);
  await accuse(page);
  await expect(page.locator('[data-ending="won"]')).toContainText('The town remembers.');
  expect(calls).toHaveLength(4);
});

test('wrong accusation loses; duplicate and undiscovered evidence cannot slip into a filing', async ({ page }) => {
  await installAgentFixture(page, fixturePlan);
  await begin(page);
  await interview(page, 'ivo');
  for (const id of ['seal', 'threshold', 'recorder'] as const) await inspect(page, id);
  await openNotebook(page, 'claims');
  await page.getByRole('button', { name: 'File an accusation', exact: true }).click();
  const dialog = page.locator('#mnemosyne-trial');
  await expect(dialog.locator('select[name="link-identity"] option[value="ribbon"]')).toHaveCount(0);
  await dialog.getByLabel('Accused', { exact: true }).selectOption('cyra');
  await dialog.getByLabel('Entry route', { exact: true }).selectOption('sluice');
  await dialog.getByLabel('Corrected time', { exact: true }).selectOption('21:10');
  for (const name of ['Identity / permit evidence', 'Entry / physical route evidence', 'Time / corrected chronology']) {
    await dialog.getByLabel(name, { exact: true }).selectOption('imprint');
  }
  await dialog.getByLabel('Your reasoning', { exact: true }).fill('A repeated story cannot be used to fill every gap in this case.');
  await dialog.getByRole('button', { name: 'Submit final accusation', exact: true }).click();
  await expect(dialog.locator('[data-trial-error]')).toContainText('three distinct claims');
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-phase', 'investigation');
  await page.getByRole('button', { name: 'Close The final hearing', exact: true }).click();
  await accuse(page, true);
  await expect(page.locator('[data-ending="lost"]')).toContainText('Accusation failed');
});

test('withholding changes accessible clues and wasting the last leads causes a real resource loss', async ({ page }) => {
  const calls = await installAgentFixture(page, () => plan());
  await begin(page);
  await interview(page, 'ivo');
  await openNotebook(page, 'objects');
  await expect(page.locator('[data-artifact="seal"]')).toContainText('Unlocated');
  await closeNotebook(page);
  for (const id of ['seal', 'threshold', 'ribbon'] as const) await inspect(page, id, false);
  for (const id of ['ivo', 'ivo', 'nell', 'nell'] as const) await interview(page, id);
  await expect(page.locator('[data-budget]')).toHaveText('0 turns / 2 influence');
  await expect(page.locator('[data-ending="lost"]')).toContainText('Ran out of leads');
  expect(calls).toHaveLength(5);
});

test('invalid plans get one correction; repeated invalid responses spend nothing and testimony is escaped', async ({ page }) => {
  let persistInvalid = false;
  const calls = await installAgentFixture(page, turn => {
    if (turn.index === 0 || persistInvalid) return plan({ claimId: 'minute' });
    return plan({ claimId: 'imprint', testimony: '<img src=x onerror="document.title=\'unsafe\'"> I saw amber wax.' });
  });
  await begin(page);
  await interview(page, 'ivo');
  expect(calls).toHaveLength(2);
  expect(calls[1].messages.length).toBe(4);
  await expect(page.locator('[data-budget]')).toHaveText('13 turns / 8 influence');
  await expect(page.locator('.mn-testimony')).toContainText('<img src=x');
  await expect(page.locator('.mn-testimony img')).toHaveCount(0);
  persistInvalid = true;
  await interview(page, 'ivo');
  expect(calls).toHaveLength(4);
  await expect(page.locator('[data-budget]')).toHaveText('13 turns / 8 influence');
  await expect(page.locator('[data-agent-status]')).toContainText(/invalid|illegal|personal observation/i);
});

test('HTTP failure is explicit and never grants evidence or consumes a turn', async ({ page }) => {
  await configureFixtureConnection(page);
  let requests = 0;
  await page.route('**/api/openai/v1/chat/completions', async route => {
    requests++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"fixture unavailable"}}' });
  });
  await begin(page);
  expect(requests).toBe(0);
  await interview(page, 'ivo');
  await expect(page.locator('[data-agent-status]')).toContainText('HTTP 503');
  await expect(page.locator('[data-budget]')).toHaveText('14 turns / 8 influence');
  await expect(page.locator('[data-record="imprint"]')).toHaveCount(0);
  expect(requests).toBe(1);
});

test('restart intent cancels a pending witness; a late response cannot mutate the new inquiry', async ({ page }) => {
  let release: ((value: WitnessPlan) => void) | undefined;
  const calls = await installAgentFixture(page, () => new Promise<WitnessPlan>(resolve => { release = resolve; }));
  await begin(page);
  await page.getByRole('button', { name: 'Interview witness', exact: true }).click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-agent-busy', 'true');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-agent-busy', 'false');
  await page.getByRole('button', { name: 'Restart same case', exact: true }).click();
  release!(plan({ claimId: 'imprint' }));
  await expect(page.locator('.project-mnemosyne')).toHaveAttribute('data-phase', 'briefing');
  await expect(page.locator('[data-budget]')).toHaveText('14 turns / 8 influence');
  await expect(page.locator('[data-record="imprint"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin investigation', exact: true }).click();
  await expect(page.locator('[data-budget]')).toHaveText('14 turns / 8 influence');
});

test('save, reset, import and reload replay accepted moves without a request; tampered replay is atomic', async ({ page }) => {
  const calls = await installAgentFixture(page, fixturePlan);
  await begin(page);
  await interview(page, 'ivo');
  await inspect(page, 'seal');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadReady;
  const encoded = await readFile((await download.path())!, 'utf8');
  const replay = object(JSON.parse(encoded), ['format', 'version', 'game', 'seed', 'commands']);
  expect(encoded).not.toContain('endpoint');
  expect(encoded).not.toContain('apiKey');
  expect(replay.game).toBe('mnemosyne');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Restart same case', exact: true }).click();
  await expect(page.locator('[data-budget]')).toHaveText('14 turns / 8 influence');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'mnemosyne-replay.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await expect(page.locator('[data-budget]')).toHaveText('12 turns / 8 influence');
  await page.reload();
  await expect(page.locator('[data-budget]')).toHaveText('12 turns / 8 influence');
  expect(calls).toHaveLength(1);
  await openNotebook(page, 'objects');
  await page.locator('[data-artifact="seal"]').click();
  await expect(page.locator('#mnemosyne-object')).toContainText('Revisit freely');
  await expect(page.locator('[data-inspect="seal"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close The material record', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const illegal = JSON.stringify({ ...replay, commands: [{ type: 'begin' }, { type: 'pin', claimId: 'minute' }] });
  await page.locator('[data-game-import]').setInputFiles({ name: 'illegal.json', mimeType: 'application/json', buffer: Buffer.from(illegal) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator('[data-budget]')).toHaveText('12 turns / 8 influence');
  expect(calls).toHaveLength(1);
});

test('keyboard and bounded layouts work at 320x640, 768x480 and desktop without eager API', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await installAgentFixture(page, fixturePlan);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 640], [768, 480], [1280, 720], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(URL);
    await expect(page.getByRole('heading', { name: 'Mnemosyne.', exact: true })).toBeInViewport();
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight + 1 }));
    expect(overflow).toEqual({ x: false, y: false });
    if (await page.getByRole('button', { name: 'Begin investigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Begin investigation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Interview witness', exact: true })).toBeInViewport();
    const clippedPortraits = await page.locator('[data-map]').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('[data-witness]')].filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1 || rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
      }).map(node => node.getAttribute('data-witness'));
    });
    expect(clippedPortraits).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`mnemosyne-${width}x${height}.png`), animations: 'disabled' });
    await page.getByLabel('Witness', { exact: true }).selectOption('nell');
    await expect(page.locator('[data-witness="nell"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await page.keyboard.press('1');
    await page.keyboard.press('e');
    await expect(page.locator('[data-witness="nell"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-mode="beliefs"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.locator('[data-mode="evidence"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-mode="evidence"]')).toHaveAttribute('aria-pressed', 'true');
    await openNotebook(page, 'objects');
    await page.locator('[data-artifact="seal"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mnemosyne-object')).toBeVisible();
    await expect(page.getByRole('button', { name: /Commission warrant/ })).toBeEnabled();
    await page.keyboard.press('Escape');
    await closeNotebook(page);
  }
  expect(calls).toHaveLength(0);
  expect(errors).toEqual([]);
});
