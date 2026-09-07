import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { configureFixtureConnection, installAgentFixture } from '../helpers/agent-fixtures';
import type { FixtureTurn } from '../helpers/agent-fixtures';
import { isRecord } from '../../src/core/agents/schema';
import { AgentValidationError } from '../../src/core/agents/errors';
import { CHALLENGES, DISCIPLINES, GLYPHS, challengeById } from '../../src/projects/sigil/data';
import type { ChallengeId, Glyph } from '../../src/projects/sigil/data';
import { createSession, parseCommand, parsePlan, reduce } from '../../src/projects/sigil/engine';
import type { Plan } from '../../src/projects/sigil/engine';
import { architectTool, observation, smokeCase } from '../../src/projects/sigil/agent';
import { combine, describeBeam, execute, pulse, syntaxError } from '../../src/projects/sigil/interpreter';
import { assess, legalProgram, limits, solve, specimens, verifyConfiguration } from '../../src/projects/sigil/solver';

const URL = './projects/sigil/';
const intention = 'Choose this verified plate to teach the next operation with room for an experiment.';

function planFor(turn: FixtureTurn, preferLast = false): Plan {
  const choices = turn.observation.legalChoices;
  if (!Array.isArray(choices) || !choices.length || !choices.every(isRecord)) throw new Error('The architect needs explicit legal choices.');
  const candidates = choices.filter(item => item.discipline === 'roomy' && item.hintId !== 'first-glyph');
  const list = candidates.length ? candidates : choices;
  const selected = list[preferLast ? list.length - 1 : 0];
  return parsePlan({
    action: selected.action, challengeId: selected.challengeId, discipline: selected.discipline,
    hintId: selected.hintId, intention,
  });
}
function commission(challengeId: ChallengeId, discipline: Plan['discipline'] = 'roomy'): Plan {
  return { action: 'commission', challengeId, discipline, hintId: 'none', intention };
}
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Sigil', exact: true })).toBeVisible();
}
async function nextCommission(page: Page) {
  await page.locator('[data-architect]').click();
  await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'working');
  await expect(page.locator('.project-sigil')).toHaveAttribute('data-agent-busy', 'false');
}
async function place(page: Page, program: readonly Glyph[]) {
  for (const glyph of program) await page.getByRole('button', { name: `Add ${GLYPHS[glyph].name}`, exact: true }).click();
}
async function fire(page: Page) { await page.locator('[data-compile]').click(); }
async function restart(page: Page, newEdition = false) {
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: newEdition ? 'New edition' : 'Restart same edition', exact: true }).click();
  await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
}
async function viewportFits(page: Page) {
  const report = await page.evaluate(() => {
    const root = document.querySelector('.project-sigil');
    const primary = document.querySelector<HTMLElement>('[data-compile]:not([hidden]), [data-architect]:not([hidden])');
    const heading = document.querySelector('h1');
    const bench = document.querySelector('[data-project-preview]');
    if (!root || !primary || !heading || !bench) throw new Error('Missing workspace surfaces.');
    const box = primary.getBoundingClientRect(), title = heading.getBoundingClientRect(), area = bench.getBoundingClientRect();
    return {
      height: innerHeight, width: innerWidth, documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth, primaryTop: box.top, primaryBottom: box.bottom,
      titleTop: title.top, titleBottom: title.bottom, benchTop: area.top, benchBottom: area.bottom,
      rootHeight: root.getBoundingClientRect().height,
      rows: [...bench.children].map(element => ({
        class: element.className, top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
      })),
      workspace: root.getAttribute('data-workspace'),
      fonts: [...root.querySelectorAll('button, select, p, h1, h2, strong, kbd')].filter(element => element.getClientRects().length)
        .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
    };
  });
  expect(report.workspace).toBe('true');
  expect(report.rootHeight).toBeCloseTo(report.height, 0);
  expect(report.documentHeight).toBeLessThanOrEqual(report.height + 1);
  expect(report.documentWidth).toBeLessThanOrEqual(report.width);
  expect(report.primaryTop).toBeGreaterThan(report.benchTop);
  if (report.primaryBottom > report.benchBottom || report.documentHeight > report.height + 1) {
    await test.info().attach('sigil-workbench-layout', { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(report.primaryBottom, JSON.stringify(report)).toBeLessThanOrEqual(report.benchBottom);
  expect(report.primaryBottom).toBeLessThan(report.height - 36);
  expect(report.titleTop).toBeGreaterThanOrEqual(0);
  expect(report.titleBottom).toBeLessThan(report.height);
  expect(Math.min(...report.fonts)).toBeGreaterThanOrEqual(14);
}

test.describe('Sigil pure executable grammar', () => {
  test('operator order, conditionals, branch addition and per-tile temporal memory are real', () => {
    const input = [pulse(0, 0), pulse(1, 1, 2), pulse(2, 2), null, null, pulse(0, 2)];
    expect(execute(['turn', 'sieve'], input).output).not.toEqual(execute(['sieve', 'turn'], input).output);
    expect(execute(['mould', 'facet'], input).output).not.toEqual(execute(['facet', 'mould'], input).output);
    expect(execute(['delay', 'delay'], input).output).toEqual([null, null, ...input.slice(0, 4)]);
    expect(execute(['echo'], [input[0], null, null]).output).toEqual([input[0], input[0], null]);
    const delayed = execute(['turn', 'delay'], input);
    expect(delayed.trace[0][1].memoryBefore).toBeNull();
    expect(delayed.trace[0][1].memoryAfter).toEqual(pulse(1, 0));
    expect(delayed.output[1]).toEqual(pulse(1, 0));
    expect(execute(['delay'], input).output[0]).toBeNull();
    const branch = execute(['fork', 'turn', 'weave'], input);
    expect(branch.trace[0][1].branch).toEqual(input[0]);
    expect(branch.output[0]).toEqual(pulse(1, 0, 2));
    expect(combine(pulse(2, 2), pulse(2, 2))).toEqual(pulse(1, 1, 2));
    expect(combine(null, pulse(0, 1))).toEqual(pulse(0, 1));
    expect(syntaxError(['weave'])).toContain('earlier');
    expect(syntaxError(['fork', 'fork', 'weave'])).toContain('second Fork');
    expect(() => execute(['fork'], input)).toThrow(AgentValidationError);
    expect(describeBeam(null)).toBe('dark');
  });

  test('all twenty catalog restrictions have meaningful solver certificates and local witnesses', () => {
    for (const challenge of CHALLENGES) for (const discipline of DISCIPLINES) {
      const config = { challengeId: challenge.id, discipline };
      const answer = verifyConfiguration(config, 77);
      expect(answer.length).toBeGreaterThanOrEqual(2);
      expect(answer.length).toBeLessThanOrEqual(limits(config).slots);
      const cases = specimens(challenge.id, 77);
      expect(cases).toHaveLength(45);
      expect(cases.filter(item => item.heldOut)).toHaveLength(42);
      expect(assess(answer, cases).passed).toBe(true);
      expect(assess([], cases).passed).toBe(false);
      expect(assess([], cases).witness).not.toBeNull();
      expect(() => legalProgram([...answer, ...answer], config)).toThrow(AgentValidationError);
    }
    expect(specimens('eclipse', 77)).not.toEqual(specimens('eclipse', 78));
    expect(solve({ challengeId: 'gate-before', discipline: 'precise' }, 77)).toEqual(['sieve', 'turn']);
  });

  test('sealed streams reject sample overfitting, with an inspectable first counterexample', () => {
    const cases = specimens('borrowed-light', 77);
    const overfit: Glyph[] = ['turn', 'sieve', 'echo'];
    expect(assess(overfit, cases.slice(0, 3)).passed).toBe(true);
    const result = assess(overfit, cases);
    expect(result.passed).toBe(false);
    expect(result.witness?.heldOut).toBe(true);
    expect(result.witness?.caseId).toContain('sealed-');
    const witness = result.witness!;
    expect(witness.actual[witness.tick]).not.toEqual(witness.expected[witness.tick]);
    expect(execute(overfit, witness.input).output).toEqual(witness.actual);
  });

  test('strict reducers reject illegal plans, commands and forged replays atomically', () => {
    const session = createSession();
    expect(() => session.dispatch({ type: 'compile' })).toThrow(/active/);
    expect(() => session.dispatch({ type: 'architect', plan: commission('eclipse') })).toThrow(/chapter 1/);
    expect(() => architectTool.parse({ ...commission('gate-after'), score: 999 })).toThrow(/unexpected/);
    expect(() => parsePlan({ ...commission('gate-after'), intention: 'x'.repeat(181) })).toThrow(/180/);
    expect(() => parseCommand({ type: 'remove', at: -1 })).toThrow(/integer/);
    expect(() => parseCommand({ type: 'clear', freeMana: 9 })).toThrow(/unexpected/);
    const preview = session.preview({ type: 'architect', plan: commission('gate-after') });
    expect(preview.phase).toBe('working');
    expect(session.state.phase).toBe('awaiting');
    expect(session.revision).toBe(0);
    session.dispatch({ type: 'architect', plan: commission('gate-after') });
    const before = structuredClone(session.state);
    expect(() => session.dispatch({ type: 'inscribe', glyph: 'fork', at: 0 })).toThrow(/palette/);
    expect(session.state).toEqual(before);
    const next = reduce(session.state, { type: 'inscribe', glyph: 'sieve', at: 0 });
    expect(before).toEqual(session.state);
    expect(next.program).toEqual(['sieve']);
    const saved = session.serialize(), revision = session.revision;
    const invalid: unknown = JSON.parse(saved);
    if (!isRecord(invalid) || !Array.isArray(invalid.commands)) throw new Error('Bad test replay.');
    invalid.commands.push({ type: 'remove', at: 5 });
    expect(() => session.restore(JSON.stringify(invalid))).toThrow(/no glyph/);
    expect(session.serialize()).toBe(saved);
    expect(session.revision).toBe(revision);
    session.reset(); session.restore(saved);
    expect(session.state).toEqual(before);
    expect(session.revision).toBeGreaterThan(revision);
  });

  test('local syntax/mana/firing/hint budgets and all endings are enforced during replay', () => {
    const session = createSession();
    for (let chapter = 0; chapter < 3; chapter++) {
      const challenge = CHALLENGES.find(item => item.chapter === chapter)!;
      session.dispatch({ type: 'architect', plan: commission(challenge.id) });
      for (let miss = 0; miss < 3; miss++) session.dispatch({ type: 'compile' });
      challenge.target.forEach((glyph, at) => session.dispatch({ type: 'inscribe', glyph, at }));
      session.dispatch({ type: 'compile' });
    }
    expect(session.state.mana).toBe(2);
    session.dispatch({ type: 'architect', plan: commission('double-ink') });
    session.dispatch({ type: 'inscribe', glyph: 'fork', at: 0 });
    session.dispatch({ type: 'compile' });
    expect(session.state.result?.syntax).toContain('Weave');
    session.dispatch({ type: 'compile' });
    expect(session.state.phase).toBe('lost');
    expect(session.state.mana).toBe(0);
    expect(() => session.dispatch({ type: 'clear' })).toThrow(/unsolved/);
    const lost = session.serialize();
    session.reset(); session.restore(lost);
    expect(session.state.phase).toBe('lost');
    session.reset();
    session.dispatch({ type: 'architect', plan: commission('gate-before') });
    session.dispatch({ type: 'architect', plan: { ...commission('gate-before'), action: 'hint', hintId: 'principle' } });
    expect(session.state.hints).toBe(2);
    expect(() => session.dispatch({ type: 'architect', plan: { ...commission('gate-before'), action: 'hint', hintId: 'principle' } })).toThrow(/unused/);
    session.dispatch({ type: 'architect', plan: { ...commission('gate-before'), action: 'hint', hintId: 'first-glyph' } });
    session.dispatch({ type: 'compile' });
    session.dispatch({ type: 'architect', plan: { ...commission('gate-before'), action: 'hint', hintId: 'witness' } });
    expect(session.state.hints).toBe(0);
    expect(() => session.dispatch({ type: 'architect', plan: { ...commission('gate-before'), action: 'hint', hintId: 'witness' } })).toThrow(/legal hint/);
    session.dispatch({ type: 'surrender' });
    expect(session.state.phase).toBe('lost');
  });

  test('opening smokeCase exercises actual reducer transitions without network or DOM', () => {
    const smoke = smokeCase();
    const plan = commission('gate-before', 'precise');
    smoke.request.validate(plan);
    smoke.verify(plan);
    const choices = observation(createSession().state, 'commission').legalChoices;
    expect(choices).toHaveLength(4);
    expect(architectTool.parameters.additionalProperties).toBe(false);
  });
});

test.describe('Sigil real-client browser campaigns', () => {
  test('no eager requests; model-selected goals change; invalid plan gets exactly one correction', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => turn.index === 0
      ? { ...commission('eclipse'), intention: 'This illegal chapter must be rejected.' }
      : { ...planFor(turn, turn.index === 1), intention: '<img src=x onerror=alert(1)> is a literal printer annotation.' });
    await open(page);
    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Rulebook' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Rulebook', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    expect(calls).toHaveLength(0);
    await nextCommission(page);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toHaveLength(4);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-challenge-id', 'gate-before');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await expect(page.locator('[data-goal]').first()).toContainText('originally amber');
    await expect(page.locator('.sg-annotation img')).toHaveCount(0);
    await expect(page.locator('.sg-annotation').first()).toContainText('<img src=x onerror=alert(1)>');
    await restart(page);
    await nextCommission(page);
    expect(calls).toHaveLength(3);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-challenge-id', 'gate-after');
    await expect(page.locator('[data-goal]').first()).toContainText('originally vermilion');
    expect(calls[2].observation.phase).toBe('awaiting');
  });

  test('five genuine UI inscriptions win, adapt to mistakes, save, reload and replay without new calls', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => planFor(turn, false));
    await open(page);
    await nextCommission(page);
    await place(page, ['sieve', 'turn']);
    await fire(page);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'working');
    await expect(page.locator('[data-notice]')).toContainText('counterexample');
    await page.getByRole('button', { name: 'Inspect proof and counterexamples' }).click();
    await expect(page.locator('[data-counterexample]')).toContainText('expected');
    await page.getByRole('button', { name: 'Load counterexample on bench' }).click();
    await expect(page.locator('[data-specimen]')).toHaveValue('3');
    await page.getByRole('button', { name: 'Ask hint', exact: true }).click();
    await expect(page.locator('[data-hints]')).toHaveText('2 hints');
    expect(calls).toHaveLength(2);
    expect(calls[1].observation.observedMistakes).toEqual(expect.arrayContaining([expect.objectContaining({ mistake: 'gate', matched: expect.any(Number) })]));
    await page.getByRole('button', { name: 'Socket 2: Turn', exact: true }).click();
    await page.getByRole('button', { name: 'Move selected glyph left', exact: true }).click();
    await fire(page);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    for (let chapter = 1; chapter < 5; chapter++) {
      await nextCommission(page);
      const challenge = CHALLENGES.find(item => item.chapter === chapter)!;
      await expect(page.locator('.project-sigil')).toHaveAttribute('data-challenge-id', challenge.id);
      await place(page, challenge.target);
      await fire(page);
      await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', chapter === 4 ? 'won' : 'awaiting');
    }
    expect(calls).toHaveLength(6);
    await expect(page.locator('[data-proof-count]')).toHaveText('5 / 5');
    await expect(page.locator('[data-mana]')).toHaveText('8 mana');
    await expect(page.getByRole('heading', { name: 'Master of the press', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export replay', exact: true }).click();
    const download = await downloadPromise, file = await download.path();
    expect(download.suggestedFilename()).toBe('sigil-replay.json');
    expect(file).not.toBeNull();
    await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    await page.reload();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'won');
    expect(calls).toHaveLength(6);
    await restart(page, true);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-game-import]').setInputFiles(file!);
    await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported');
    await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'won');
    await expect(page.locator('[data-proof-count]')).toHaveText('5 / 5');
    expect(calls).toHaveLength(6);
  });

  test('the alternative complete campaign wins through different advanced compositions', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => planFor(turn, true));
    await open(page);
    for (let chapter = 0; chapter < 5; chapter++) {
      await nextCommission(page);
      const challenge = CHALLENGES.filter(item => item.chapter === chapter).at(-1)!;
      await place(page, challenge.target);
      await fire(page);
      await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', chapter === 4 ? 'won' : 'awaiting');
    }
    expect(calls).toHaveLength(5);
    await expect(page.locator('[data-mana]')).toHaveText('9 mana');
    await expect(page.locator('[data-proof-count]')).toHaveText('5 / 5');
  });

  test('unsolved firings cause loss; restart resets budgets; explicit surrender is another real loss', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => planFor(turn));
    await open(page); await nextCommission(page);
    for (let attempt = 0; attempt < 5; attempt++) await fire(page);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'lost');
    await expect(page.locator('[data-mana]')).toHaveText('9 mana');
    await expect(page.locator('[data-notice]')).toContainText('all its firings');
    await expect(page.getByRole('button', { name: 'Add Turn', exact: true })).toBeDisabled();
    await restart(page);
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await expect(page.locator('[data-hints]')).toHaveText('3 hints');
    await nextCommission(page);
    await page.getByRole('button', { name: 'Brief', exact: true }).click();
    await page.getByRole('dialog', { name: 'Commission & ledger' }).getByRole('button', { name: 'Leave unfinished' }).click();
    await page.getByRole('button', { name: 'Surrender this plate', exact: true }).click();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'lost');
    await expect(page.locator('[data-notice]')).toContainText('surrendered');
    expect(calls).toHaveLength(2);
  });

  test('shared mana can end an otherwise progressing UI campaign', async ({ page }) => {
    await installAgentFixture(page, turn => planFor(turn));
    await open(page);
    for (let chapter = 0; chapter < 3; chapter++) {
      await nextCommission(page);
      for (let miss = 0; miss < 3; miss++) await fire(page);
      await place(page, CHALLENGES.find(item => item.chapter === chapter)!.target);
      await fire(page);
    }
    await nextCommission(page);
    await place(page, ['fork']);
    await fire(page);
    await expect(page.locator('[data-notice]')).toContainText('Weave');
    await fire(page);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'lost');
    await expect(page.locator('[data-mana]')).toHaveText('0 mana');
    await expect(page.locator('[data-proof-count]')).toHaveText('3 / 5');
  });

  test('two invalid plans and HTTP failure never charge a pending turn', async ({ page }) => {
    const calls = await installAgentFixture(page, () => ({ ...commission('gate-after'), inventedScore: 1 }));
    await open(page);
    await page.locator('[data-architect]').click();
    await expect(page.locator('[data-agent-status]')).toContainText('unexpected');
    expect(calls).toHaveLength(2);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await expect(page.locator('[data-hints]')).toHaveText('3 hints');
    await page.unroute('**/api/openai/v1/chat/completions');
    await page.route('**/api/openai/v1/chat/completions', route => route.fulfill({ status: 503, body: '{"error":"fixture unavailable"}' }));
    await page.locator('[data-architect]').click();
    await expect(page.locator('[data-agent-status]')).toContainText('HTTP 503');
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
  });

  test('restart cancels stale completion; inspection does not cancel a pending paid hint', async ({ page }) => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const calls = await installAgentFixture(page, async turn => { if (turn.index === 0) await gate; return planFor(turn); });
    await open(page);
    await page.locator('[data-architect]').click();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-agent-busy', 'true');
    await restart(page);
    release!();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await nextCommission(page);
    await place(page, ['turn']);
    let hintRelease: (() => void) | undefined;
    const hintGate = new Promise<void>(resolve => { hintRelease = resolve; });
    await page.unroute('**/api/openai/v1/chat/completions');
    const hints = await installAgentFixture(page, async turn => { await hintGate; return planFor(turn); });
    await page.getByRole('button', { name: 'Ask hint', exact: true }).click();
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-agent-busy', 'true');
    await expect(page.locator('[data-hints]')).toHaveText('3 hints');
    await page.getByRole('button', { name: 'Tick 3', exact: true }).click();
    await page.getByRole('button', { name: 'Socket 1: Turn', exact: true }).click();
    await expect(page.locator('[data-compile]')).toBeDisabled();
    hintRelease!();
    await expect(page.locator('[data-hints]')).toHaveText('2 hints');
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-agent-busy', 'false');
    expect(calls).toHaveLength(2);
    expect(hints).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Tick 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('import rejects a forged move without changing the current work', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => planFor(turn));
    await open(page); await nextCommission(page); await place(page, ['turn']);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-game-import]').setInputFiles({
      name: 'invalid-sigil.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'odd-index-game', version: 1, game: 'sigil', seed: 77, commands: [{ type: 'compile' }] })),
    });
    await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
    await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Socket 1: Turn', exact: true })).toBeVisible();
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    expect(calls).toHaveLength(1);
  });

  test('keyboard composition, modal isolation, reduced-motion trace and 320px/short layouts', async ({ page }) => {
    const calls = await installAgentFixture(page, turn => planFor(turn));
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await viewportFits(page);
    await nextCommission(page);
    await page.getByRole('button', { name: 'Add Turn', exact: true }).focus();
    await page.keyboard.press('2');
    await page.keyboard.press('1');
    await page.getByRole('button', { name: 'Socket 2: Turn', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page.getByRole('button', { name: 'Socket 1: Turn', exact: true })).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Rulebook' })).toBeVisible();
    await page.keyboard.press('c');
    await page.keyboard.press('1');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await page.getByRole('button', { name: 'Close Rulebook', exact: true }).click();
    await page.getByRole('button', { name: 'Model settings', exact: true }).click();
    await page.locator('[data-agent-model]').fill('c123');
    await expect(page.locator('[data-mana]')).toHaveText('14 mana');
    await page.getByRole('button', { name: 'Close Model connection', exact: true }).click();
    await page.getByRole('button', { name: 'Replay evaluation trace', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tick 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-tracing', 'false');
    await viewportFits(page);
    await page.getByRole('button', { name: 'Socket 1: Turn', exact: true }).focus();
    await page.keyboard.press('c');
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    await page.setViewportSize({ width: 768, height: 480 });
    await nextCommission(page);
    await place(page, challengeById('facet-after').target);
    await viewportFits(page);
    await fire(page);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    expect(calls).toHaveLength(2);
    await page.setViewportSize({ width: 1440, height: 900 });
    await viewportFits(page);
  });

  test('unconfigured model is honest and does not provide an offline commission', async ({ page }) => {
    await configureFixtureConnection(page);
    await page.addInitScript(() => localStorage.clear());
    let requests = 0;
    await page.route('**/chat/completions', route => { requests++; return route.abort(); });
    await open(page);
    expect(requests).toBe(0);
    await expect(page.locator('.project-sigil')).toHaveAttribute('data-phase', 'awaiting');
    await expect(page.getByRole('button', { name: 'Add Turn', exact: true })).toBeDisabled();
  });
});
