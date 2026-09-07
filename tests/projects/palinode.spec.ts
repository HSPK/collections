import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  artifactText, branchDiff, choose, commit, current, deserialize, evaluate, hintFor, HISTORY_LIMIT,
  initialChoices, isSave, locationStates, newHistory, reachableEndings, serialize, travel, unmet, validateWorld,
} from '../../src/projects/palinode/engine';
import type { Save } from '../../src/projects/palinode/engine';
import { ARTIFACTS, DECISIONS, ENDINGS, RULES } from '../../src/projects/palinode/world';
import type { Choices } from '../../src/projects/palinode/world';

const returnCity: Choices = { shore: 'steps', charter: 'commons', crossing: 'bridge', letter: 'copies', room: 'rehearsal', practice: 'listen', invitation: 'neighbors', performance: 'return' };
const processionCity: Choices = { ...returnCity, shore: 'wall', crossing: 'tram', performance: 'procession' };
const readingCity: Choices = { shore: 'wall', charter: 'register', crossing: 'tram', letter: 'sealed', room: 'reading', practice: 'collate', invitation: 'public', performance: 'reading' };
const record = (id: string) => ARTIFACTS.find((artifact) => artifact.id === id)!;

test.describe('Palinode authored causal model', () => {
  test('four eras contain 28 real artifacts with valid, acyclic dependencies', () => {
    expect(ARTIFACTS).toHaveLength(28);
    for (const era of [0, 1, 2, 3]) expect(ARTIFACTS.filter((artifact) => artifact.era === era)).toHaveLength(7);
    expect(DECISIONS).toHaveLength(8);
    expect(validateWorld()).toEqual([]);
    expect(ARTIFACTS.filter((artifact) => artifact.variants.length > 1).length).toBeGreaterThanOrEqual(15);
    for (const artifact of ARTIFACTS) {
      for (const variant of artifact.variants) {
        expect(variant.text.join(' ').length).toBeGreaterThan(180);
        expect(variant.annotation.length).toBeGreaterThan(35);
      }
    }
  });

  test('authoring validation catches cycles, future dependencies and dangling event references', () => {
    expect(validateWorld([{ ...RULES[0], all: ['old-circuit'] }, ...RULES.slice(1)]).join(' ')).toMatch(/Cycle/);
    expect(validateWorld([{ ...RULES[0], all: ['public'] }, ...RULES.slice(1)]).join(' ')).toMatch(/future/);
    expect(validateWorld(RULES, [{ ...ARTIFACTS[0], visible: 'invented-fact' }]).join(' ')).toMatch(/dangling event dependency/);
    expect(validateWorld([{ ...RULES[0], all: ['invented-parent'] }, ...RULES.slice(1)]).join(' ')).toMatch(/dangling dependency/);
  });

  test('causal propagation is deterministic and never leaks a later institution into an earlier era', () => {
    const original = { ...returnCity };
    expect(evaluate(returnCity)).toEqual(evaluate(returnCity));
    expect(returnCity).toEqual(original);
    const early = evaluate(returnCity, 0);
    expect(early.facts.steps).toBe(true);
    expect(early.facts.footbridge).toBe(false);
    expect(early.facts['living-score']).toBe(false);
    expect(locationStates(early, 0).hall).toBe('Laundry common trust');
    expect(locationStates(early, 0).bridge).toBe('Ilex ferry');
    expect(evaluate(returnCity, 1).facts['old-circuit']).toBe(true);
    expect(evaluate(returnCity, 1).facts['living-score']).toBe(false);
    expect(evaluate(returnCity, 2).facts['living-score']).toBe(true);
    expect(evaluate(returnCity, 2).ending).toBeUndefined();
    expect(evaluate(returnCity).ending?.id).toBe('return');
  });

  test('prerequisites reject illegal edits and choices are actually exclusive', () => {
    const initial = initialChoices();
    expect(() => choose(initial, 'crossing', 'bridge')).toThrow(/prerequisites unmet/i);
    expect(() => choose(initial, 'letter', 'copies')).toThrow(/copying rights/);
    expect(() => choose(initial, 'practice', 'listen')).toThrow(/households remember/);
    expect(() => choose(initial, 'performance', 'return')).toThrow(/prerequisites unmet/i);
    expect(() => choose(initial, 'shore', 'invented')).toThrow(/Unknown option/);
    expect(() => choose(initial, 'shore', null)).toThrow(/retain an intention/);
    const changed = choose(returnCity, 'crossing', 'tram');
    expect(evaluate(changed).facts.tram).toBe(true);
    expect(evaluate(changed).facts.footbridge).toBe(false);
    expect(evaluate(changed).facts['old-circuit']).toBe(false);
    expect(changed.crossing).toBe('tram');
    expect(returnCity.crossing).toBe('bridge');
    expect(evaluate(choose(readingCity, 'room', 'rehearsal')).facts['reading-room']).toBe(false);
  });

  test('invalidated intentions suspend explicitly, their evidence disappears, and restoration is reversible', () => {
    const changed = choose(returnCity, 'charter', 'register');
    const result = evaluate(changed);
    expect(result.suspended).toEqual(['letter', 'practice', 'performance']);
    expect(changed.letter).toBe('copies');
    expect(result.active.letter).toBeNull();
    expect(result.facts.copies).toBe(false);
    expect(result.facts.sealed).toBe(false);
    expect(result.facts['letter-understood']).toBe(false);
    expect(artifactText(record('kitchen'), result)).toBeUndefined();
    expect(artifactText(record('binding'), result)).toBeUndefined();
    expect(artifactText(record('sera-letter'), result)?.text.join(' ')).toContain('have not been sent');
    expect(artifactText(record('friends'), result)?.text.join(' ')).toContain('still in the drawer');
    expect(evaluate(choose(changed, 'charter', 'commons'))).toEqual(evaluate(returnCity));
  });

  test('changing one historical cause coherently changes city, future records and ending', () => {
    const changed = choose(returnCity, 'shore', 'wall');
    const future = evaluate(changed);
    expect(future.suspended).toContain('crossing');
    expect(future.suspended).toContain('performance');
    expect(future.ending).toBeUndefined();
    expect(locationStates(future, 3).bridge).toBe('Provisional ferry');
    expect(artifactText(record('future-quay'), future)?.text.join(' ')).toContain('no bridge and no tram');
    expect(artifactText(record('future-quay'), evaluate(returnCity))?.text.join(' ')).toContain('Seven steps');
    const tramCity = choose(changed, 'crossing', 'tram');
    expect(locationStates(evaluate(tramCity), 3).bridge).toBe('Tram · quay stop');
    expect(artifactText(record('eli'), evaluate(tramCity))?.text.join(' ')).toContain('18:10');
    expect(artifactText(record('eli'), evaluate(returnCity))?.text.join(' ')).toContain('repair bicycles');
  });

  test('Jo distinguishes a recovered transcription from an edition with a reading-room grant', () => {
    const collated = choose(initialChoices(), 'practice', 'collate');
    for (const room of [null, 'rehearsal', 'reading']) {
      const result = evaluate(choose(collated, 'room', room));
      const note = artifactText(record('jo-mina'), result)?.text.join(' ') ?? '';
      expect(result.facts['annotated-edition']).toBe(room === 'reading');
      expect(Boolean(artifactText(record('edition'), result))).toBe(room === 'reading');
      if (room === 'reading') expect(note).toContain('Your edition is careful');
      else {
        expect(note).toContain('Your transcription is careful');
        expect(note).not.toContain('Your edition is careful');
      }
    }
  });

  test('all three intended endings are reachable by compatible choices and the search respects its bound', () => {
    const result = reachableEndings();
    expect(result.complete).toBe(true);
    expect(result.visited).toBeLessThan(10_000);
    expect([...result.paths.keys()].sort()).toEqual(['procession', 'reading', 'return']);
    for (const ending of ENDINGS) {
      const city = result.paths.get(ending.id)!;
      let replay = initialChoices();
      for (const decision of DECISIONS) replay = choose(replay, decision.id, city[decision.id]);
      expect(evaluate(replay).ending?.id).toBe(ending.id);
      expect(evaluate(replay).suspended).toEqual([]);
      expect(ENDINGS.filter((candidate) => evaluate(replay).facts[candidate.rule])).toHaveLength(1);
    }
    expect(evaluate(returnCity).ending?.id).toBe('return');
    expect(evaluate(processionCity).ending?.id).toBe('procession');
    expect(evaluate(readingCity).ending?.id).toBe('reading');
    expect(reachableEndings(3)).toMatchObject({ visited: 3, complete: false });
  });

  test('all fully specified cities have consistent exclusivity and no simultaneously visible incompatible sources', () => {
    let checked = 0;
    function enumerate(index: number, choices: Choices): void {
      if (index < DECISIONS.length) {
        const decision = DECISIONS[index];
        for (const option of decision.options) enumerate(index + 1, { ...choices, [decision.id]: option.id });
        return;
      }
      checked++;
      const result = evaluate(choices);
      expect(!(result.facts.steps && result.facts.wall)).toBe(true);
      expect(!(result.facts.footbridge && result.facts.tram)).toBe(true);
      expect(!(result.facts.copies && result.facts.sealed)).toBe(true);
      expect(!(result.facts['oral-work'] && result.facts.collation)).toBe(true);
      expect(!(result.facts.rehearsal && result.facts['reading-room'])).toBe(true);
      expect(ENDINGS.filter((ending) => result.facts[ending.rule]).length).toBeLessThanOrEqual(1);
      for (const artifact of ARTIFACTS) {
        const text = artifactText(artifact, result);
        expect(!!text).toBe(!artifact.visible || result.facts[artifact.visible]);
      }
    }
    enumerate(0, initialChoices());
    expect(checked).toBe(384);
  });

  test('history is immutable, undo/redo are exact, and edits after undo branch cleanly', () => {
    const start = newHistory();
    const first = commit(start, returnCity, 'Return city');
    const second = commit(first, processionCity, 'Procession city');
    expect(current(start)).toEqual(initialChoices());
    expect(current(travel(second, -1))).toEqual(returnCity);
    expect(travel(travel(second, -1), 1)).toEqual(second);
    const branch = commit(travel(second, -1), readingCity, 'Reading city');
    expect(branch.entries).toHaveLength(3);
    expect(branch.labels).toEqual(['The inherited city', 'Return city', 'Reading city']);
    expect(current(travel(branch, 1))).toEqual(readingCity);
    expect(second.entries[2]).toEqual(processionCity);
    expect(branchDiff(returnCity, returnCity)).toEqual([]);
    const diff = branchDiff(returnCity, processionCity);
    expect(diff.some((change) => change.kind === 'fact' && change.id === 'old-circuit' && change.after === 'Not true')).toBe(true);
    expect(diff.some((change) => change.kind === 'place' && change.id === 'bridge')).toBe(true);
    expect(diff.some((change) => change.kind === 'document' && change.id === 'eli')).toBe(true);
  });

  test('full history rejects an extra revision without losing a saveable branch', () => {
    const history = {
      entries: Array.from({ length: HISTORY_LIMIT }, initialChoices),
      labels: Array.from({ length: HISTORY_LIMIT }, (_, index) => `Revision ${index}`),
      cursor: HISTORY_LIMIT - 1,
    };
    const save: Save = { version: 1, history, pinned: null, era: 3, document: 'commission' };
    const original = serialize(save);
    expect(deserialize(original)).toEqual(save);
    const changed = choose(current(history), 'shore', 'steps');
    expect(() => commit(history, changed, 'One revision too many')).toThrow(/history is full/i);
    expect(serialize(save)).toBe(original);
    expect(commit(history, current(history), 'No change')).toBe(history);
    const branch = commit(travel(history, -1), changed, 'Branch from the preceding revision');
    expect(branch.entries).toHaveLength(HISTORY_LIMIT);
    expect(current(branch)).toEqual(changed);
    expect(deserialize(serialize({ ...save, history: branch })).history).toEqual(branch);
  });

  test('versioned saves roundtrip exactly, preserve suspended intentions, and reject malformed data', () => {
    const state: Save = {
      version: 1, history: commit(newHistory(), { ...returnCity, shore: 'wall' }, 'Suspended bridge'),
      pinned: { ...returnCity }, era: 1, document: 'transit',
    };
    expect(deserialize(serialize(state))).toEqual(state);
    expect(isSave(state)).toBe(true);
    for (const value of [
      null, [], {}, { ...state, version: 2 }, { ...state, era: 4 },
      { ...state, era: 0, document: 'transit' },
      { ...state, pinned: { ...returnCity, shore: 'invented' } },
      { ...state, pinned: { ...returnCity, shore: null } },
      { ...state, history: { ...state.history, cursor: 100 } },
      { ...state, history: { ...state.history, labels: [] } },
      { ...state, history: { ...state.history, entries: [{ ...returnCity, surprise: 'x' }] } },
      { ...state, document: '<img src=x onerror=alert(1)>' },
    ]) {
      expect(isSave(value)).toBe(false);
      expect(() => deserialize(JSON.stringify(value))).toThrow(/invalid|unsupported/i);
    }
    expect(() => deserialize('{broken')).toThrow(/not a readable JSON/);
    expect(() => deserialize(' '.repeat(4_000_001))).toThrow(/4 MB/);
  });

  test('hints follow unmet dependency chains without changing decisions or prescribing a whole solution', () => {
    const city = initialChoices();
    const before = { ...city };
    const hint = hintFor(city, 'return');
    expect(hint.rule).toBe('steps');
    expect(hint.text).toContain('1891');
    expect(hint.text).toContain('one unmet cause');
    expect(city).toEqual(before);
    expect(hintFor({ ...returnCity, performance: null }, 'return').text).toContain('2026');
    expect(unmet('ending-return', evaluate(returnCity))).toEqual([]);
  });
});

async function open(page: Page) {
  await page.goto('./projects/palinode/');
  await expect(page.locator('.project-palinode').getByRole('heading', { level: 1, name: 'Palinode', exact: true })).toBeVisible();
}

async function pane(page: Page, name: 'Read' | 'Decide' | 'Compare' | 'Ending') {
  await page.getByRole('tab', { name, exact: true }).click();
}

async function desk(page: Page) {
  await page.getByRole('button', { name: 'Folio desk', exact: true }).click();
}

async function closeDesk(page: Page) {
  await page.getByRole('button', { name: 'Close Folio desk', exact: true }).click();
}

async function playReturn(page: Page) {
  await pane(page, 'Decide');
  await page.locator('[data-era="0"]').click();
  await page.locator('[data-choice="shore:steps"]').click();
  await page.locator('[data-choice="charter:commons"]').click();
  await page.locator('[data-era="1"]').click();
  await page.locator('[data-choice="crossing:bridge"]').click();
  await page.locator('[data-choice="letter:copies"]').click();
  await page.locator('[data-era="2"]').click();
  await page.locator('[data-choice="room:rehearsal"]').click();
  await page.locator('[data-choice="practice:listen"]').click();
  await page.locator('[data-era="3"]').click();
  await page.locator('[data-choice="invitation:neighbors"]').click();
  await page.locator('[data-choice="performance:return"]').click();
}

test('Palinode browser: genuine return playthrough, past edit, pinned future, and a second honest ending', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open(page);
  await expect(page.locator('[data-project-preview]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('palinode-desktop.png') });
  await page.locator('[data-project-preview]').screenshot({ path: testInfo.outputPath('palinode-folio.png') });
  await playReturn(page);
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'return');
  await expect(page.locator('#palinode-ending-title')).toHaveText('A place left open');
  await expect(page.locator('#palinode-ending-title')).toBeFocused();
  await expect(page.locator('[data-ending-text]')).toContainText('At low water, Eli sets five chairs');
  await expect(page.locator('[data-main-map] [data-scene="ending-return"]')).toBeVisible();
  await expect(page.locator('[data-main-map] [data-scene="ending-procession"]')).toBeHidden();
  await page.locator('[data-action="pin-ending"]').click();
  await page.locator('#palinode-future-document').selectOption('future-quay');
  await expect(page.locator('[data-pinned-text]')).toContainText('Seven steps');
  await page.locator('[data-era="0"]').click();
  await pane(page, 'Decide');
  await page.locator('[data-choice="shore:wall"]').click();
  await expect(page.locator('[data-main-map]')).toHaveAttribute('data-era', '1891');
  await expect(page.locator('[data-main-map]')).toHaveAttribute('data-shore', 'wall');
  await expect(page.locator('[data-pinned-map]')).toHaveAttribute('data-crossing', 'footbridge');
  await expect(page.locator('[data-revised-map]')).toHaveAttribute('data-crossing', 'ferry');
  await expect(page.locator('[data-pinned-text]')).toContainText('Seven steps');
  await expect(page.locator('[data-revised-text]')).toContainText('no bridge and no tram');
  await expect(page.locator('[data-suspended]')).toContainText('Reroute the crossing');
  await expect(page.locator('[data-ending-panel]')).toBeHidden();
  await expect(page.locator('[data-choice="shore:wall"]')).toBeFocused();
  await desk(page);
  await page.locator('.palinode-ledger > summary').click();
  await expect(page.locator('[data-ledger-rule="old-circuit"] [data-rule-truth]')).toHaveText('NOT ENACTED');
  await expect(page.locator('[data-ledger-rule="footbridge"] [data-rule-deps]')).toContainText('tidal steps survive');
  await closeDesk(page);
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'return');
  await page.locator('[data-action="redo"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', '');
  await page.locator('[data-era="1"]').click();
  await page.locator('[data-choice="crossing:tram"]').click();
  await pane(page, 'Compare');
  await page.locator('#palinode-future-document').selectOption('eli');
  await expect(page.locator('[data-pinned-text]')).toContainText('repair bicycles');
  await expect(page.locator('[data-revised-text]')).toContainText('18:10');
  await page.locator('[data-era="3"]').click();
  await pane(page, 'Decide');
  await page.locator('[data-choice="performance:procession"]').click();
  await expect(page.locator('#palinode-ending-title')).toHaveText('The city carries it');
  await expect(page.locator('[data-main-map] [data-scene="ending-procession"]')).toBeVisible();
  await expect(page.locator('[data-main-map] [data-scene="ending-return"]')).toBeHidden();
  await expect(page.locator('[data-ending-text]')).toContainText('uneven beat of rail joints');
  await page.locator('.palinode-editor-layout').screenshot({ path: testInfo.outputPath('palinode-comparison.png') });
  await page.reload();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'procession');
  await expect(page.locator('[data-pinned-map]')).toHaveAttribute('data-crossing', 'footbridge');
  expect(errors).toEqual([]);
});

test('Palinode browser: documentary ending, validated import/export, and undoable confirmed reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await open(page);
  await pane(page, 'Decide');
  await page.locator('[data-era="2"]').click();
  await page.locator('[data-choice="room:reading"]').click();
  await page.locator('[data-choice="practice:collate"]').click();
  await page.locator('[data-era="3"]').click();
  await page.locator('[data-choice="invitation:public"]').click();
  await page.locator('[data-choice="performance:reading"]').click();
  await expect(page.locator('#palinode-ending-title')).toHaveText('A faithful incompleteness');
  await expect(page.locator('[data-main-map] [data-scene="ending-reading"]')).toBeVisible();
  await expect(page.locator('[data-ending-text]')).toContainText('The kitchen refrain is gone');
  await desk(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('palinode-folio-v1.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks);
  expect(deserialize(exported.toString()).history.entries.at(-1)?.performance).toBe('reading');
  await page.locator('[data-action="reset"]').click();
  await page.locator('[data-action="dialog-cancel"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'reading');
  await page.locator('[data-action="reset"]').click();
  await page.locator('[data-action="dialog-confirm"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', '');
  await closeDesk(page);
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'reading');
  await desk(page);
  const input = page.locator('[data-import-file]');
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2}') });
  await expect(page.locator('[data-status]')).toContainText('Unsupported or invalid');
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'reading');
  await input.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: exported });
  await expect(page.locator('[data-dialog]')).toBeVisible();
  await page.locator('[data-action="dialog-confirm"]').click();
  await expect(page.locator('.project-palinode')).toHaveAttribute('data-ending', 'reading');
  expect(errors).toEqual([]);
});

test('Palinode browser: protected corrupt save never silently overwrites the original', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('palinode.folio.v1', '{"version":99,"important":"original bytes"}'); });
  await open(page);
  await expect(page.locator('[data-storage-warning]')).toBeVisible();
  await page.locator('[data-era="0"]').click();
  await pane(page, 'Decide');
  await page.locator('[data-choice="shore:steps"]').click();
  expect(await page.evaluate(() => localStorage.getItem('palinode.folio.v1'))).toBe('{"version":99,"important":"original bytes"}');
  await page.locator('[data-action="replace-save"]').click();
  await page.locator('[data-action="dialog-confirm"]').click();
  await expect(page.locator('[data-storage-warning]')).toBeHidden();
  const saved = await page.evaluate(() => localStorage.getItem('palinode.folio.v1'));
  expect(deserialize(saved!).history.entries.at(-1)?.shore).toBe('steps');
});

test('Palinode browser: mobile reading, keyboard selection, comparison panels and reduced motion', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.screenshot({ path: testInfo.outputPath('palinode-mobile.png') });
  await page.locator('.palinode-folio').screenshot({ path: testInfo.outputPath('palinode-mobile-reading.png') });
  expect(await page.locator('[data-doc-text]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  const era = page.locator('[data-era="0"]');
  await era.focus();
  await page.keyboard.press('Enter');
  await expect(era).toBeFocused();
  await pane(page, 'Decide');
  const choice = page.locator('[data-choice="shore:steps"]');
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(choice).toBeFocused();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  const place = page.locator('[data-main-map] [data-place="quay"]');
  await place.focus();
  await page.keyboard.press('Enter');
  await expect(place).toBeFocused();
  await expect(page.locator('#palinode-document-title')).toHaveText('Two inches above the tide');
  await page.locator('.palinode-toolbar [data-action="pin"]').click();
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(choice).toBeFocused();
  await page.locator('[data-choice="shore:wall"]').click();
  await pane(page, 'Compare');
  await expect(page.locator('[data-pinned-text]')).toBeHidden();
  await expect(page.locator('[data-revised-text]')).toBeVisible();
  await page.locator('[data-compare-side="pinned"]').click();
  await expect(page.locator('[data-pinned-text]')).toBeVisible();
  await expect(page.locator('[data-revised-text]')).toBeHidden();
  await expect(page.locator('[data-compare-side="pinned"]')).toBeFocused();
  await pane(page, 'Read');
  const doc = page.locator('#palinode-document-select');
  await doc.selectOption('bench');
  await doc.focus();
  await expect(doc).toBeFocused();
  await expect(page.locator('[data-doc-text]')).toContainText('sensible bench');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('[data-main-map] .palinode-map-number').first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await pane(page, 'Compare');
  await page.locator('.palinode-comparison').screenshot({ path: testInfo.outputPath('palinode-mobile-comparison.png') });
  expect(errors).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 375, height: 812 }, { width: 320, height: 640 },
  { width: 768, height: 480 },
]) {
  test(`Palinode workspace: ${viewport.width}x${viewport.height} bounded reading, decisions and folio desk`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await open(page);
    const root = page.locator('.project-palinode');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    const fits = async () => {
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        body: document.body.scrollHeight,
        x: window.scrollX, y: window.scrollY,
        bodyOverflow: getComputedStyle(document.body).overflow,
        documentOverflow: getComputedStyle(document.documentElement).overflow,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.height).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.body).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.x).toBe(0);
      expect(dimensions.y).toBe(0);
      expect(dimensions.bodyOverflow).not.toMatch(/hidden|clip/);
      expect(dimensions.documentOverflow).not.toMatch(/hidden|clip/);
      for (const selector of ['.palinode-toolbar', '.palinode-era-rail', '.palinode-main-map', '.workspace-tabs']) {
        const bounds = await root.locator(selector).boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeGreaterThan(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      }
    };
    await fits();
    await page.screenshot({ path: testInfo.outputPath(`palinode-workspace-${viewport.width}x${viewport.height}.png`) });
    const reading = root.locator('.palinode-document');
    await expect(root.locator('[data-doc-text]')).toContainText('measure');
    await reading.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(root.locator('.palinode-marginalia')).toBeInViewport();
    await fits();
    await page.locator('[data-action="pin"]').first().click();
    await pane(page, 'Decide');
    await page.locator('[data-era="0"]').click();
    await page.locator('[data-choice="shore:steps"]').click();
    await expect(page.locator('[data-main-map]')).toHaveAttribute('data-shore', 'steps');
    await fits();
    await page.screenshot({ path: testInfo.outputPath(`palinode-decide-${viewport.width}x${viewport.height}.png`) });
    await pane(page, 'Compare');
    await expect(page.locator('[data-revised-text]')).toContainText('The tidal steps remain');
    await expect(page.locator('[data-pinned-text]')).toContainText('The tram doors open');
    await page.locator('[data-action="undo"]').click();
    await expect(page.locator('[data-main-map]')).toHaveAttribute('data-shore', 'wall');
    await page.locator('[data-action="redo"]').click();
    await expect(page.locator('[data-main-map]')).toHaveAttribute('data-shore', 'steps');
    await fits();
    await desk(page);
    await page.locator('.palinode-ledger-area details').nth(1).locator('summary').click();
    await page.locator('#palinode-history').selectOption('0');
    await expect(root).toHaveAttribute('data-ending', '');
    await closeDesk(page);
    await expect(page.getByRole('button', { name: 'Folio desk', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Goals', exact: true }).click();
    await page.locator('[data-action="hint"]').click();
    await expect(page.locator('[data-hint]')).toContainText('1891');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Full map', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Aven city map' })).toBeVisible();
    await page.locator('[data-full-map] [data-place="quay"]').click();
    await page.keyboard.press('Escape');
    await pane(page, 'Read');
    await expect(page.locator('#palinode-document-title')).toHaveText('Two inches above the tide');
    expect(await reading.evaluate(element => element.scrollTop)).toBe(0);
    const readTab = page.getByRole('tab', { name: 'Read', exact: true });
    await readTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Decide', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Decide', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(readTab).toBeFocused();
    await fits();
    const sizes = await root.locator('button:visible, select:visible, .palinode-select-label:visible').evaluateAll(elements =>
      elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    expect(errors).toEqual([]);
  });
}
