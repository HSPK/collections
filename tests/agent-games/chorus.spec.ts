import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AgentValidationError } from '../../src/core/agents/errors';
import { array, isRecord } from '../../src/core/agents/schema';
import { GameSession } from '../../src/core/games/session';
import { smokeCase } from '../../src/projects/chorus/agent';
import { answer, decode, encode, MODES, NODE_IDS, SHAPES, transfer } from '../../src/projects/chorus/data';
import type { Plan, Signal } from '../../src/projects/chorus/data';
import { definition, legalPlans, parsePlan, parseSignal } from '../../src/projects/chorus/engine';
import type { TurnInput } from '../../src/projects/chorus/engine';
import { installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';

const url = './projects/chorus/';
const root = '.project-chorus';

function options(turn: FixtureTurn): Plan[] {
  return array(turn.observation.legalPlans, parsePlan, 'Fixture legal plans', 1, 100);
}
function first(turn: FixtureTurn): Plan { return options(turn)[0]; }
async function incoming(page: Page): Promise<Signal> {
  const label = await page.locator('.chorus-field-svg').getAttribute('aria-label');
  const match = /Incoming signal: (\w+), then (\w+); (\d+) pulses; (joined|alternating)/.exec(label ?? '');
  expect(match, 'The visible channel exposes glyphs, length and phase without audio.').not.toBeNull();
  return parseSignal({ glyphs: [match![1], match![2]], duration: Number(match![3]), phase: match![4] === 'joined' ? 'offer' : 'ask' });
}
async function compose(page: Page, signal: Signal) {
  await page.locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: `Add ${signal.glyphs[0]} glyph`, exact: true }).click();
  await page.getByRole('button', { name: `Add ${signal.glyphs[1]} glyph`, exact: true }).click();
  await page.locator(`[data-duration="${signal.duration}"]`).click();
  await page.locator(`button[data-phase="${signal.phase}"]`).click();
}
async function send(page: Page) {
  await page.locator('[data-transmit]').click();
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
}
async function respond(page: Page) {
  const signal = await incoming(page);
  const phase = await page.locator(root).getAttribute('data-phase');
  if (phase !== 'calibration') {
    signal.glyphs.reverse();
    signal.phase = 'offer';
  }
  await compose(page, signal);
  await send(page);
}
async function reachNegotiation(page: Page) {
  await send(page);
  for (let i = 0; i < 4; i++) await respond(page);
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'negotiation');
}
async function complete(page: Page) {
  await reachNegotiation(page);
  for (let i = 0; i < 8 && await page.locator(root).getAttribute('data-phase') !== 'won'; i++) {
    if (await page.locator('[data-transmit]').textContent() === 'Listen again') await send(page);
    else await respond(page);
  }
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'won');
}
async function saved(page: Page): Promise<string> {
  return page.evaluate(() => {
    const value: unknown = JSON.parse(localStorage.getItem('odd-index:game:chorus:v1') ?? 'null');
    if (typeof value !== 'string') throw new Error('No automatic replay was saved.');
    return value;
  });
}

test('grammar: all ordered nouns, quantities and phases round-trip with invariant energy direction', () => {
  for (const from of NODE_IDS) for (const to of NODE_IDS) for (const amount of [1, 2, 3]) for (const mode of MODES) {
    if (from === to) continue;
    const meaning = { from, to, amount, mode };
    expect(decode(encode(meaning))).toEqual(meaning);
    if (mode === 'ask') expect(transfer(answer(meaning))).toEqual(transfer(meaning));
    expect(encode(meaning).glyphs).toEqual(encode({ ...meaning, amount: 3 }).glyphs);
  }
  expect(decode({ glyphs: ['ring', 'ring'], duration: 1, phase: 'offer' })).toBeNull();
  expect(() => parsePlan({ intent: 'witness', from: 'well', to: 'reed', amount: 1, mode: 'offer', win: true })).toThrow(AgentValidationError);
  expect(() => parseSignal({ glyphs: ['ring', 'fork'], duration: 99, phase: 'offer' })).toThrow(AgentValidationError);
  const smoke = smokeCase();
  expect(isRecord(smoke.request.observation)).toBeTruthy();
  const observation = smoke.request.observation;
  if (!isRecord(observation)) throw new Error('Smoke observation missing.');
  smoke.verify(parsePlan(array(observation.legalPlans, parsePlan, 'Plans', 1, 100)[0]));
});

test('engine: pure previews, exact replay parsing and local endings reject illegal model authority', () => {
  const session = new GameSession(definition, 0);
  const before = session.serialize();
  const opening = legalPlans(session.state, { type: 'contact' })[0];
  const staged = session.preview({ type: 'turn', input: { type: 'contact' }, plan: opening });
  expect(staged.bandwidth).toBe(17);
  expect(session.serialize()).toBe(before);
  expect(session.revision).toBe(0);
  expect(() => session.dispatch({ type: 'turn', input: { type: 'contact' }, plan: { ...opening, intent: 'witness' } })).toThrow(AgentValidationError);
  const input: TurnInput = { type: 'contact' };
  session.dispatch({ type: 'turn', input, plan: opening });
  const replay = session.serialize();
  const invalid: unknown = JSON.parse(replay);
  if (!isRecord(invalid) || !Array.isArray(invalid.commands)) throw new Error('Bad test replay.');
  invalid.commands.push({ type: 'turn', input, plan: opening });
  expect(() => session.restore(JSON.stringify(invalid))).toThrow(AgentValidationError);
  expect(session.serialize()).toBe(replay);
  const restored = new GameSession(definition, 2);
  restored.restore(replay);
  expect(restored.state).toEqual(session.state);
});

test('different real counterpart intentions change the kinetic message and teaching path', async ({ page }) => {
  let variation = false;
  const calls = await installAgentFixture(page, turn => {
    const plans = options(turn);
    return variation ? plans.find(plan => plan.from === 'crown' && plan.to === 'reed' && plan.amount === 2)! : plans[0];
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Chorus', exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await send(page);
  const original = await incoming(page);
  await expect(page.locator('[data-field-caption]')).toContainText('Well offers 1 pulse to Reed');
  variation = true;
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await send(page);
  const changed = await incoming(page);
  expect(changed).not.toEqual(original);
  expect(changed).toEqual({ glyphs: ['knot', 'fork'], duration: 2, phase: 'offer' });
  await expect(page.locator('[data-field-caption]')).toContainText('Crown offers 2 pulses to Reed');
  expect(calls).toHaveLength(2);
  expect(calls[0].tool).toBe('shape_contact');
});

test('legitimate UI contact: hypotheses, calibration, translation, repair, export, restart and replay', async ({ page }) => {
  const calls = await installAgentFixture(page, first);
  await page.goto(url);
  await send(page);
  await page.getByRole('button', { name: 'Lexicon', exact: true }).click();
  await page.getByLabel('Meaning of ring', { exact: true }).selectOption('reed');
  await page.locator('[data-test-hypothesis="ring"]').click();
  await expect(page.locator('.chorus-lexicon-entry').first()).toContainText('Contradicted');
  await page.getByLabel('Meaning of ring', { exact: true }).selectOption('well');
  await page.locator('[data-test-hypothesis="ring"]').click();
  await expect(page.locator('.chorus-lexicon-entry').first()).toContainText('Confirmed: Well');
  await page.getByRole('button', { name: 'Close Field lexicon', exact: true }).click();
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 17/18');
  for (let i = 0; i < 4; i++) await respond(page);
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'negotiation');
  for (let i = 0; i < 5 && await page.locator(root).getAttribute('data-phase') !== 'won'; i++) await respond(page);
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'won');
  await expect(page.locator(`${root} [data-feedback]`)).toContainText('A common sky');
  for (const id of NODE_IDS) await expect(page.locator(`[data-stock="${id}"]`)).toContainText('4 / 4');
  expect(calls.length).toBeGreaterThanOrEqual(8);
  const replay = await saved(page);
  expect(replay).not.toContain('fixture-tool-model');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('chorus-replay.json');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 18/18');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'chorus.json', mimeType: 'application/json', buffer: Buffer.from(replay) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'won');
  const total = calls.length;
  await page.reload();
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'won');
  expect(calls).toHaveLength(total);
  await page.getByRole('button', { name: 'New tide', exact: true }).click();
  await expect(page.locator('[data-stock="reed"]')).toContainText('8 / 4');
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'calibration');
});

test('negotiation: model acceptance transfers a counteroffer; a counter changes the next request instead', async ({ page }) => {
  let accept = true;
  const calls = await installAgentFixture(page, turn => {
    const plans = options(turn);
    if (plans.some(plan => plan.intent === 'accept')) return accept
      ? plans.find(plan => plan.intent === 'accept')!
      : plans.find(plan => plan.intent === 'counter' && plan.from === 'crown' && plan.amount === 2)!;
    return plans[0];
  });
  await page.goto(url);
  await reachNegotiation(page);
  await compose(page, encode({ from: 'well', to: 'crown', amount: 2, mode: 'offer' }));
  await send(page);
  await expect(page.locator('[data-stock="well"]')).toContainText('6 / 4');
  await expect(page.locator('[data-stock="crown"]')).toContainText('3 / 4');
  await expect(page.locator('[data-transmit]')).toHaveText('Listen again');
  await send(page);
  expect((await incoming(page)).phase).toBe('ask');
  accept = false;
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await reachNegotiation(page);
  await compose(page, encode({ from: 'well', to: 'crown', amount: 2, mode: 'offer' }));
  await send(page);
  await expect(page.locator(`${root} [data-feedback]`)).toContainText('declines');
  await expect(page.locator('[data-stock="well"]')).toContainText('8 / 4');
  expect(await incoming(page)).toEqual(encode({ from: 'crown', to: 'well', amount: 2, mode: 'ask' }));
  expect(calls.some(turn => options(turn).some(plan => plan.intent === 'accept'))).toBeTruthy();
});

test('trust loss is a real finite UI ending; show-again can exhaust bandwidth without spending trust', async ({ page }) => {
  const calls = await installAgentFixture(page, first);
  await page.goto(url);
  await send(page);
  await compose(page, { glyphs: ['ring', 'ring'], duration: 1, phase: 'offer' });
  for (let i = 0; i < 4; i++) await send(page);
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-trust]')).toHaveText('Trust 0/6');
  await expect(page.locator(`${root} [data-feedback]`)).toContainText('broke trust');
  await expect(page.locator('[data-transmit]')).toBeDisabled();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await send(page);
  for (let i = 0; i < 17; i++) {
    await page.getByRole('button', { name: 'Show again', exact: true }).click();
    await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
  }
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 0/18');
  await expect(page.locator('[data-trust]')).toHaveText('Trust 4/6');
  await expect(page.locator(`${root} [data-feedback]`)).toContainText('Bandwidth is spent');
  expect(calls).toHaveLength(23);
});

test('invalid plans repair once or fail explicitly without pending resource charges', async ({ page }) => {
  let repair = true;
  const calls = await installAgentFixture(page, turn => turn.index === 0 || !repair ? { ...first(turn), win: true } : first(turn));
  await page.goto(url);
  await send(page);
  expect(calls).toHaveLength(2);
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 17/18');
  expect(calls[1].messages.some(message => isRecord(message) && message.role === 'tool')).toBeTruthy();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  repair = false;
  await send(page);
  expect(calls).toHaveLength(4);
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 18/18');
  await expect(page.locator('[data-agent-status]')).toContainText(/invalid|illegal|unexpected|fields/i);
  await expect(page.locator('[data-transmit]')).toHaveText('Open contact');
});

test('pending views and draft edits preserve ownership; reset and import discard stale model turns', async ({ page }) => {
  let release: (() => void) | undefined;
  let hold = false;
  const calls = await installAgentFixture(page, async turn => {
    const plan = first(turn);
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    return plan;
  });
  await page.goto(url);
  await send(page);
  const replay = await saved(page);
  hold = true;
  await page.getByRole('button', { name: 'Show again', exact: true }).click();
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'true');
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 17/18');
  await page.getByRole('button', { name: 'Add fork glyph', exact: true }).click();
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await page.getByRole('button', { name: 'Close A way to mean', exact: true }).click();
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'true');
  await expect.poll(() => Boolean(release)).toBeTruthy();
  release!();
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 16/18');
  release = undefined;
  await page.getByRole('button', { name: 'Show again', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  release!();
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 18/18');
  hold = false;
  await send(page);
  hold = true;
  release = undefined;
  await page.getByRole('button', { name: 'Show again', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'chorus.json', mimeType: 'application/json', buffer: Buffer.from(replay) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
  release!();
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 17/18');
  await expect(page.locator(root)).toHaveAttribute('data-agent-busy', 'false');
  expect(calls).toHaveLength(5);
});

test('HTTP failure is explicit, never an offline agent; malformed imports preserve the game', async ({ page }) => {
  await installAgentFixture(page, first);
  await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '{"error":"fixture outage"}' }));
  await page.goto(url);
  await send(page);
  await expect(page.locator('[data-agent-status]')).toContainText('HTTP 503');
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 18/18');
  await expect(page.locator('[data-transmit]')).toHaveText('Open contact');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"phase":"won"}') });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(page.locator(root)).toHaveAttribute('data-phase', 'calibration');
});

test('keyboard composition, undo, modal isolation and no eager network or audio', async ({ page }) => {
  const calls = await installAgentFixture(page, first);
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    let created = 0;
    Object.defineProperty(window, '__chorusAudioCreated', { get: () => created });
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); created++; }
    };
  });
  await page.goto(url);
  await page.locator('h1').click();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.locator('[data-draft-reading]')).toContainText('ring then fork');
  await page.keyboard.press('x');
  await expect(page.locator('[data-draft-reading]')).toContainText('fork then ring');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('+');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-draft-reading]')).toContainText('2 pulses / alternating');
  const draft = await page.locator('[data-draft-reading]').textContent();
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await page.keyboard.press('3');
  await page.keyboard.press('x');
  await expect(page.locator('[data-draft-reading]')).toHaveText(draft!);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Model settings', exact: true }).click();
  await page.locator('[data-agent-model]').fill('123');
  await expect(page.locator('[data-draft-reading]')).toHaveText(draft!);
  await page.keyboard.press('Escape');
  expect(calls).toHaveLength(0);
  expect(await page.evaluate(() => Reflect.get(window, '__chorusAudioCreated'))).toBe(0);
  await page.locator('h1').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-bandwidth]')).toHaveText('Band 17/18');
  expect(calls).toHaveLength(1);
  expect(await page.evaluate(() => Reflect.get(window, '__chorusAudioCreated'))).toBe(0);
});

for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }, { width: 1440, height: 900 }]) {
  test(`bounded instrument ${viewport.width}x${viewport.height}: full visual contact and primary controls`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await installAgentFixture(page, first);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Chorus', exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      innerWidth, innerHeight,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.innerWidth + 1);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.innerHeight + 1);
    for (const selector of ['[data-field]', '[data-transmit]', '[data-glyph="ring"]', '[data-duration="3"]', 'button[data-phase="ask"]', '[data-undo]', '[data-restart]']) {
      const control = page.locator(selector);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    for (const selector of [`${root} [data-feedback]`, '[data-field-readout]', '[data-trust]', '[data-transmit]']) {
      expect(await page.locator(selector).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    const menu = await page.getByRole('button', { name: 'Collection menu', exact: true }).boundingBox();
    expect(menu).not.toBeNull();
    for (const selector of ['[data-agent-log]', '[data-sound]', '[data-restart]', '[data-encounter]', '[data-study]']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x + box.width <= menu!.x || box.y + box.height <= menu!.y || box.x >= menu!.x + menu!.width || box.y >= menu!.y + menu!.height,
        `${selector} must not intersect the floating collection menu`).toBeTruthy();
    }
    await page.screenshot({ path: testInfo.outputPath('contact-chamber.png') });
    if (viewport.width === 320) await complete(page);
    else { await send(page); await respond(page); }
    await page.screenshot({ path: testInfo.outputPath('contact-in-progress.png') });
    expect(calls.length).toBeGreaterThan(1);
    await expect(page.locator('[data-field-readout]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1);
  });
}

test('all encounter profiles are locally solvable with conserved energy and bounded turns', () => {
  for (let seed = 0; seed < 3; seed++) {
    const session = new GameSession(definition, seed);
    for (let turn = 0; turn < 15 && session.state.phase !== 'won'; turn++) {
      const current = session.state;
      const input: TurnInput = current.active
        ? { type: 'transmit', signal: current.phase === 'calibration' ? encode(current.active) : encode(answer(current.active)) }
        : { type: 'contact' };
      const plans = legalPlans(current, input);
      const plan = plans.find(item => item.amount === 2) ?? plans[0];
      session.dispatch({ type: 'turn', input, plan });
      expect(Object.values(session.state.stock).reduce((a, b) => a + b, 0)).toBe(12);
      expect(session.state.trust).toBeGreaterThan(0);
    }
    expect(session.state.phase).toBe('won');
    expect(session.state.stock).toEqual({ well: 4, reed: 4, crown: 4 });
    expect(session.state.bandwidth).toBeGreaterThan(0);
    expect(SHAPES).toHaveLength(3);
  }
});

test('the last interval can legitimately restore a fragile beacon, and replay preserves that ending', () => {
  const session = new GameSession(definition, 0);
  function apply(input: TurnInput) {
    session.dispatch({ type: 'turn', input, plan: legalPlans(session.state, input)[0] });
  }
  apply({ type: 'contact' });
  for (let turn = 0; turn < 10 && !(session.state.phase === 'negotiation' && session.state.stock.well === 5); turn++) {
    const state = session.state;
    expect(state.active).not.toBeNull();
    apply({ type: 'transmit', signal: encode(state.phase === 'calibration' ? state.active! : answer(state.active!)) });
  }
  expect(session.state.stock).toEqual({ well: 5, reed: 4, crown: 3 });
  for (let i = 0; i < 5; i++) apply({ type: 'transmit', signal: { glyphs: ['ring', 'ring'], duration: 1, phase: 'offer' } });
  expect(session.state.trust).toBe(1);
  while (session.state.bandwidth > 1) apply({ type: 'study' });
  apply({ type: 'transmit', signal: encode(answer(session.state.active!)) });
  expect(session.state.bandwidth).toBe(0);
  expect(session.state.phase).toBe('won');
  expect(session.state.ending).toBe('fragile');
  expect(session.state.trust).toBe(2);
  const replay = new GameSession(definition, 2);
  replay.restore(session.serialize());
  expect(replay.state).toEqual(session.state);
});
