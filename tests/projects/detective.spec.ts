import { expect, test } from '@playwright/test';
import { CASES } from '../../src/projects/detective/data';
import {
  assessConclusion,
  hypotheses,
  possibleHypotheses,
  possiblePeople,
  setTimelineNote,
  validateCase,
} from '../../src/projects/detective/engine';

test.describe('detective engine', () => {
  for (const file of CASES) {
    test(`${file.id}: published evidence gives a unique, justified solution`, () => {
      expect(validateCase(file)).toEqual([]);
      expect(file.people).toHaveLength(4);
      expect(file.evidence).toHaveLength(4);
      expect(possiblePeople(file, [])).toHaveLength(4);
      expect(possiblePeople(file)).toEqual([file.solution.personId]);
      expect(new Set(file.evidence.map((evidence) => evidence.letter)).size).toBe(4);
      for (const person of file.people) {
        expect(person.statement.length).toBeGreaterThan(50);
        expect(person.avatar).toBeGreaterThanOrEqual(0);
        expect(person.avatar).toBeLessThan(4);
      }
    });

    test(`${file.id}: all three identifying exhibits are needed, context is not proof`, () => {
      const identifying = file.evidence.filter((evidence) => evidence.rules.length);
      const contextual = file.evidence.filter((evidence) => !evidence.rules.length);
      expect(identifying).toHaveLength(3);
      expect(contextual).toHaveLength(1);
      expect(possiblePeople(file, contextual.map((evidence) => evidence.id))).toHaveLength(4);
      for (const excluded of identifying) {
        const partial = file.evidence.filter((evidence) => evidence.id !== excluded.id).map((evidence) => evidence.id);
        expect(possiblePeople(file, partial).length).toBeGreaterThan(1);
        expect(assessConclusion(file, file.solution.personId, partial).kind).toBe('incomplete');
      }
      const proof = identifying.map((evidence) => evidence.id);
      expect(assessConclusion(file, file.solution.personId, proof).kind).toBe('solved');
      expect(possiblePeople(file, [...proof, ...proof])).toEqual([file.solution.personId]);
    });

    test(`${file.id}: guesses cannot bypass evidence and every wrong answer is contradicted`, () => {
      const all = file.evidence.map((evidence) => evidence.id);
      expect(assessConclusion(file, null, all).kind).toBe('missing-person');
      expect(assessConclusion(file, file.solution.personId, []).kind).toBe('missing-evidence');
      for (const person of file.people.filter((candidate) => candidate.id !== file.solution.personId)) {
        const result = assessConclusion(file, person.id, all);
        expect(result.kind).toBe('contradiction');
        expect(result.message).toContain(person.name);
      }
      expect(() => possiblePeople(file, ['invented-exhibit'])).toThrow(/Unknown evidence/);
      expect(() => assessConclusion(file, 'invented-person', all)).toThrow(/Unknown nominee/);
    });
  }

  test('independent transcription of the written clues agrees with both profile cases', () => {
    const cake = CASES[0];
    const cakeMatches = cake.people.filter((person) => {
      const [hours, minutes] = person.facts.visit.split(':').map(Number);
      const time = hours * 60 + minutes;
      return time > 10 * 60 + 8 && time < 10 * 60 + 12 &&
        person.facts.transport === 'Handcart' && person.facts.exit === 'West passage';
    });
    expect(cakeMatches.map((person) => person.id)).toEqual(['leda']);
    const parcel = CASES[1];
    const parcelMatches = parcel.people.filter((person) =>
      person.facts.paper === 'Striped' && person.facts.tie === 'Cotton cord' && person.facts.tag === 'Round');
    expect(parcelMatches.map((person) => person.id)).toEqual(['sula']);
  });

  test('the museum has exactly 24 initial schedules and one final schedule', () => {
    const museum = CASES[2];
    expect(hypotheses(museum)).toHaveLength(24);
    expect(possibleHypotheses(museum)).toEqual([{
      personId: 'ada',
      order: ['theo', 'miri', 'ada', 'rook'],
    }]);
    const passOnly = possibleHypotheses(museum, ['gallery-pass']);
    expect(passOnly.length).toBeGreaterThan(1);
    for (const hypothesis of passOnly) {
      expect(hypothesis.order.indexOf('rook') - hypothesis.order.indexOf('ada')).toBe(1);
    }
  });

  test('pencil timeline movement is immutable and cannot duplicate a visitor', () => {
    const museum = CASES[2];
    const blank = ['', '', '', ''];
    const initial = setTimelineNote(blank, 0, 'theo', museum);
    expect(blank).toEqual(['', '', '', '']);
    expect(initial).toEqual(['theo', '', '', '']);
    const moved = setTimelineNote(initial, 2, 'theo', museum);
    expect(initial).toEqual(['theo', '', '', '']);
    expect(moved).toEqual(['', '', 'theo', '']);
    expect(setTimelineNote(moved, 2, '', museum)).toEqual(blank);
    expect(() => setTimelineNote(blank, -1, 'theo', museum)).toThrow(/Invalid timeline slot/);
    expect(() => setTimelineNote(blank, 4, 'theo', museum)).toThrow(/Invalid timeline slot/);
    expect(() => setTimelineNote(blank, 1, 'nobody', museum)).toThrow(/Unknown timeline visitor/);
    expect(() => setTimelineNote(blank, 1, 'leda', CASES[0])).toThrow(/Timeline notes do not match/);
  });

  test('authoring validation rejects inconsistent answers and unavailable rule fields', () => {
    const file = CASES[0];
    expect(validateCase({ ...file, solution: { ...file.solution, personId: 'orin' } }))
      .toContain('The full evidence must identify exactly the published answer.');
    expect(validateCase({
      ...file,
      evidence: [{ ...file.evidence[0], rules: [{ kind: 'fact', field: 'unavailable', allowed: ['yes'] }] }, ...file.evidence.slice(1)],
    })).toContain('shelf-log refers to an unavailable profile field.');
    expect(validateCase({
      ...CASES[2],
      logic: { kind: 'order', slots: ['14:00'], affectedSlot: 9 },
    })).toContain('The affected timeline slot must exist.');
    expect(validateCase({
      ...CASES[2],
      logic: { kind: 'order', slots: ['14:00', '14:00', '14:20', '14:30'], affectedSlot: 2 },
    })).toContain('Timeline slots must be distinct.');
  });
});

test('detective: evidence, accusations, pencil notes, case selection, and replay work', async ({ page }) => {
  await page.goto('./projects/detective/');
  const project = page.locator('.project-detective');
  await expect(project.getByRole('heading', { level: 1 })).toContainText('Detective.');
  await expect(project.locator('[data-project-preview]')).toHaveCount(1);
  await expect(project.locator('[data-project-preview] [data-action="evidence"]')).toHaveCount(4);
  const note = 'A cart is not enough. <img src=x onerror=alert(1)> Check the exit.';
  await project.getByLabel('My working theory', { exact: true }).fill(note);
  await project.getByRole('radio', { name: 'Choose Orin', exact: true }).check();
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'A hunch needs a little evidence.' })).toBeVisible();
  for (const evidence of CASES[0].evidence.filter((item) => item.rules.length)) {
    await project.locator(`[data-action="evidence"][data-id="${evidence.id}"]`).click();
    await project.getByLabel(`Pin exhibit ${evidence.letter} to my reasoning`).check();
  }
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'One thread does not fit.' })).toBeVisible();
  await project.getByRole('button', { name: 'Rule out Orin Pipp', exact: true }).click();
  await expect(project.getByRole('radio', { name: 'Choose Orin', exact: true })).toBeDisabled();
  await project.getByRole('button', { name: 'Restore Orin Pipp', exact: true }).click();
  await project.getByRole('radio', { name: 'Choose Leda', exact: true }).check();
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'Case closed. Nicely reasoned.' })).toBeVisible();
  await expect(project.getByText('Leda put the covered cake', { exact: false })).toBeVisible();
  await project.getByRole('button', { name: 'Open the next case' }).click();
  await expect(project.getByRole('heading', { name: 'A parcel out of place', exact: true })).toBeVisible();
  await expect(project.locator('[data-project-preview]')).toHaveCount(1);
  await expect(project.locator('[data-project-preview] [data-pin]')).toHaveCount(4);
  await project.getByLabel('My working theory', { exact: true }).fill('Three details belong to the same box.');
  for (const evidence of CASES[1].evidence.filter((item) => item.rules.length)) {
    await project.locator(`[data-action="evidence"][data-id="${evidence.id}"]`).click();
    await project.getByLabel(`Pin exhibit ${evidence.letter} to my reasoning`).check();
  }
  await project.getByRole('radio', { name: 'Choose Sula', exact: true }).check();
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'Case closed. Nicely reasoned.' })).toBeVisible();
  await project.locator('[data-action="choose-case"][data-id="cake-under-cover"]').click();
  await expect(project.getByLabel('My working theory', { exact: true })).toHaveValue(note);
  await expect(project.locator('.td-notebook img')).toHaveCount(0);
  await expect(project.getByRole('heading', { name: 'Case closed. Nicely reasoned.' })).toBeVisible();
  await project.getByRole('button', { name: 'Restart this case', exact: true }).click();
  await project.getByRole('button', { name: 'Keep investigating', exact: true }).click();
  await expect(project.getByLabel('My working theory', { exact: true })).toHaveValue(note);
  await project.getByRole('button', { name: 'Restart this case', exact: true }).click();
  await project.getByRole('button', { name: 'Yes, restart this case', exact: true }).click();
  await expect(project.getByLabel('My working theory', { exact: true })).toHaveValue('');
  await expect(project.locator('[data-pin]:checked')).toHaveCount(0);
  await expect(project.locator('[data-nominee]:checked')).toHaveCount(0);
  await project.locator('[data-action="choose-case"][data-id="parcel-out-of-place"]').click();
  await expect(project.getByLabel('My working theory', { exact: true })).toHaveValue('Three details belong to the same box.');
  await expect(project.getByRole('heading', { name: 'Case closed. Nicely reasoned.' })).toBeVisible();
});

test('detective: narrow-screen ordering case has a real proof and native keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./projects/detective/');
  const project = page.locator('.project-detective');
  await project.locator('[data-action="choose-case"][data-id="wandering-label"]').click();
  await expect(project.getByRole('heading', { name: 'The wandering museum label', exact: true })).toBeFocused();
  const firstExhibit = project.locator('[data-action="evidence"][data-id="drying-note"]');
  await firstExhibit.focus();
  await page.keyboard.press('Enter');
  await expect(firstExhibit).toHaveAttribute('aria-expanded', 'true');
  const pinA = project.getByLabel('Pin exhibit A to my reasoning');
  await pinA.focus();
  await page.keyboard.press('Space');
  await expect(pinA).toBeChecked();
  await expect(pinA).toBeFocused();
  await project.locator('[data-action="evidence"][data-id="tour-note"]').click();
  await project.getByLabel('Pin exhibit B to my reasoning').check();
  await project.getByRole('radio', { name: 'Choose Ada', exact: true }).check();
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'A good start, not quite a proof.' })).toBeVisible();
  await project.getByLabel('Visitor at 14:00', { exact: true }).selectOption('theo');
  await project.getByLabel('Visitor at 14:10', { exact: true }).selectOption('theo');
  await expect(project.getByLabel('Visitor at 14:00', { exact: true })).toHaveValue('');
  await project.getByLabel('Visitor at 14:00', { exact: true }).selectOption('theo');
  await project.getByLabel('Visitor at 14:10', { exact: true }).selectOption('miri');
  await project.getByLabel('Visitor at 14:20', { exact: true }).selectOption('ada');
  await project.getByLabel('Visitor at 14:30', { exact: true }).selectOption('rook');
  await project.locator('[data-action="evidence"][data-id="gallery-pass"]').click();
  await project.getByLabel('Pin exhibit C to my reasoning').check();
  await project.getByRole('button', { name: 'File my conclusion' }).click();
  await expect(project.getByRole('heading', { name: 'Case closed. Nicely reasoned.' })).toBeVisible();
  await expect(project.locator('.td-resolved-order li')).toHaveText([
    '14:00Theo Fen', '14:10Miri Finch', '14:20Ada Pollen', '14:30Rook Vale',
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
