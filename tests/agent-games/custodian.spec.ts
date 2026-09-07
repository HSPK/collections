import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installAgentFixture } from '../helpers/agent-fixtures';
import { expectWorkspaceViewport, visibleControlProblems } from '../helpers/workspace';
import { arrivalTool, bargainTool, smokeCase } from '../../src/projects/custodian/agent';
import { CARGO_IDS, PACKAGING, TRAVELLERS, cargoById } from '../../src/projects/custodian/data';
import type { CargoId, Packing, Verdict } from '../../src/projects/custodian/data';
import { adjudicate, createSession, measurements } from '../../src/projects/custodian/engine';
import type { ArrivalPlan } from '../../src/projects/custodian/engine';

const URL = './projects/custodian/';
const app = (page: Page) => page.locator('.project-custodian');
const resource = (page: Page, name: string) => app(page).locator(`[data-resource="${name}"]`);

function consignment(cargo: CargoId[], packing: Packing = 'paper'): ArrivalPlan {
  return {
    cargo, packing,
    declaration: { contents: 'Ordinary rain tea. Nothing to declare.', mass: 5, temperature: 18, licence: 'none', testimony: 'I would very much prefer to catch the last crossing.' },
    intention: 'Deliver the parcel with as little delay and expense as possible.',
  };
}

const WINNING: ArrivalPlan[] = [
  consignment(['rain-tea']),
  consignment(['moon-moths']),
  consignment(['pocket-tide']),
  consignment(['stolen-tomorrow']),
  consignment(['winter-salt']),
  consignment(['winter-salt', 'rain-tea'], 'stasis'),
];
const SAFE: ArrivalPlan[] = [
  consignment(['rain-tea']), consignment(['moon-moths']), consignment(['echo-pearls']),
  consignment(['glass-orchard']), consignment(['winter-salt'], 'stasis'), consignment(['pocket-tide'], 'stasis'),
];

async function openFile(page: Page, pane: string) {
  if (!(await page.locator('#cu-file').evaluate(element => element instanceof HTMLDialogElement && element.open))) {
    await app(page).locator('.cu-header [data-action="file"]').click();
  }
  await page.locator(`#cu-file [data-pane="${pane}"]`).click();
  return page.locator('#cu-file');
}

async function closeFile(page: Page) {
  if (await page.locator('#cu-file').evaluate(element => element instanceof HTMLDialogElement && element.open)) {
    await page.getByRole('button', { name: 'Close Case file', exact: true }).click();
  }
}

async function callTraveller(page: Page, number: number) {
  await closeFile(page);
  await app(page).locator('[data-action="call"]').click();
  await expect(app(page)).toHaveAttribute('data-case', String(number));
  await expect(app(page)).toHaveAttribute('data-agent-busy', 'false');
  await expect(app(page)).toHaveAttribute('data-phase', 'inspection');
}

async function stamp(page: Page, verdict: Verdict, number: number) {
  await closeFile(page);
  await app(page).locator(`[data-verdict="${verdict}"]`).click();
  await expect(app(page)).toHaveAttribute('data-phase', number === 6 ? 'finished' : 'review');
}

test('quiet authored desk, authentic physical evidence, false declarations and keyboard instruments', async ({ page }) => {
  const calls = await installAgentFixture(page, () => ({
    ...consignment(['bottled-noon']),
    declaration: { contents: '<img src=x onerror=alert(1)> Harmless tea', mass: 5, temperature: 18, licence: 'both', testimony: 'My glass is cold; the scanner will agree with me.' },
  }));
  await page.goto(URL);
  await expect(app(page).getByRole('heading', { level: 1 })).toHaveText('Nothing to Declare.');
  await expect(app(page).locator('[data-project-preview] svg')).toBeVisible();
  await expect(resource(page, 'minutes')).toHaveText('36 m');
  await expect(app(page).locator('[data-inspect="scan"]')).toBeDisabled();
  expect(calls).toHaveLength(0);
  await callTraveller(page, 1);
  expect(calls[0].tool).toBe('present_consignment');
  expect(calls[0].observation).toMatchObject({ stage: 'arrival', travellerNumber: 1, officerResources: { minutes: 36, credits: 14, scans: 3 } });
  expect(await app(page).locator('img').count()).toBe(0);
  await expect(app(page).locator('[data-file-body]')).toContainText('<img src=x onerror=alert(1)>');
  await page.locator('h1').click();
  await page.keyboard.press('w');
  await expect(resource(page, 'minutes')).toHaveText('35 m');
  await expect(app(page).locator('[data-file-body] [data-evidence-mass]')).toContainText('7 kg');
  await expect(app(page).locator('[data-file-body] [data-evidence-mass]')).toContainText('Declaration conflicts');
  await page.keyboard.press('t');
  await page.keyboard.press('l');
  await page.keyboard.press('m');
  await expect(app(page).locator('[data-file-body] [data-evidence-thermal]')).toContainText('84 to 84');
  await expect(app(page).locator('[data-file-body] [data-evidence-licence]')).toContainText('resonant');
  await expect(app(page).locator('[data-file-body] [data-evidence-seal]')).toContainText('Waxed paper');
  await page.keyboard.press('x');
  await expect(resource(page, 'minutes')).toHaveText('30 m');
  await expect(resource(page, 'scans')).toHaveText('2 / 3');
  await expect(app(page).locator('[data-inspect="scan"]')).toBeDisabled();
  await expect(app(page).locator('[data-cu-scan-readout]')).not.toContainText('Bottled noon');
  await app(page).locator('#cu-sweep').focus();
  await page.keyboard.press('End');
  await expect(app(page).locator('[data-cu-scan-readout]')).toContainText('Bottled noon');
  expect(await app(page).locator('[data-cu-scan-clip]').getAttribute('width')).toBe('225');
  expect(calls).toHaveLength(1);
  await stamp(page, 'quarantine', 1);
  await expect(app(page).locator('[data-file-body]')).toContainText('QUARANTINE — correct ruling');
  await expect(resource(page, 'credits')).toHaveText('12 cr');
  await expect(resource(page, 'score')).toHaveText('20');
});

test('complete six-traveller victory with negotiated bond, scanner depletion, refills and replay export/import', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => turn.tool === 'present_consignment'
    ? WINNING[Number(turn.observation.travellerNumber) - 1]
    : { response: 'offer', amount: 4, disclosed: [], testimony: 'I will pay four to put the tide in your supervised harbour.', intention: 'Buy a safe crossing instead of a return.' });
  await page.goto(URL);
  const verdicts: Verdict[] = ['admit', 'admit', 'quarantine', 'return', 'quarantine', 'admit'];
  for (let i = 0; i < 6; i++) {
    await callTraveller(page, i + 1);
    if (i >= 3) {
      await expect(app(page).locator('[data-inspect="scan"]')).toBeDisabled();
      await app(page).locator('[data-action="refill"]').click();
    } else if (i === 0) await expect(app(page).locator('[data-action="refill"]')).toBeDisabled();
    await app(page).locator('[data-inspect="scan"]').click();
    await app(page).locator('[data-action="sweep"]').click();
    await expect(app(page).locator('[data-cu-scan-readout]')).toContainText(cargoById(WINNING[i].cargo[0]).name);
    await app(page).locator('[data-inspect="registry"]').click();
    await app(page).locator('[data-inspect="seal"]').click();
    if (i === 2) {
      const file = await openFile(page, 'parley');
      await file.getByRole('button', { name: 'Request bond', exact: true }).click();
      await expect(file).toContainText('Merchant offers 4 credits');
      expect(calls.at(-1)?.observation).toMatchObject({ question: 'bond', remainingWallet: 6 });
      await file.getByRole('button', { name: 'Accept bond', exact: true }).click();
      await closeFile(page);
      await expect(app(page).locator('[data-verdict="admit"]')).toBeDisabled();
      await expect(app(page).locator('[data-verdict="return"]')).toBeDisabled();
    }
    await stamp(page, verdicts[i], i + 1);
  }
  await expect(app(page).locator('[data-file-body] [data-ending]')).toContainText('Victory / 6 of 6 correct');
  await expect(resource(page, 'credits')).toHaveText('2 cr');
  await expect(resource(page, 'trust')).toHaveText('6 / 6');
  await expect(resource(page, 'scans')).toHaveText('0 / 3');
  expect(calls).toHaveLength(7);
  await app(page).locator('[data-notebook]').click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay', exact: true }).click();
  const download = await downloadEvent;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const encoded = await readFile(filePath!, 'utf8');
  const replay = JSON.parse(encoded);
  expect(replay.game).toBe('custodian');
  expect(replay.commands.filter((command: { type: string }) => command.type === 'verdict')).toHaveLength(6);
  expect(encoded).not.toContain('fixture-tool-model');
  expect(encoded).not.toContain('apiKey');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await app(page).locator('.cu-header [data-action="restart"]').click();
  await page.getByRole('button', { name: 'Discard shift and restart', exact: true }).click();
  await expect(resource(page, 'score')).toHaveText('0');
  await app(page).locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'custodian-replay.json', mimeType: 'application/json', buffer: Buffer.from(encoded) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay imported.');
  await page.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-phase', 'finished');
  await expect(resource(page, 'credits')).toHaveText('2 cr');
  await expect(app(page).locator('[data-file-body] [data-ending]')).toContainText('Victory / 6 of 6 correct');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-phase', 'finished');
  expect(calls).toHaveLength(7);
  const invalid = JSON.parse(encoded);
  invalid.commands[0].plan.actualMass = 0;
  await app(page).locator('[data-notebook]').click();
  await page.locator('[data-game-import]').setInputFiles({ name: 'forged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.locator('[data-game-save-status]')).toContainText('Replay rejected');
  await expect(app(page)).toHaveAttribute('data-phase', 'finished');
  await expect(resource(page, 'credits')).toHaveText('2 cr');
});

test('complete legitimate loss: six lawful parcels, three wrongful returns and exhausted trust', async ({ page }) => {
  const calls = await installAgentFixture(page, turn => SAFE[Number(turn.observation.travellerNumber) - 1]);
  await page.goto(URL);
  for (let i = 0; i < 6; i++) {
    await callTraveller(page, i + 1);
    await app(page).locator('[data-inspect="weigh"]').click();
    await app(page).locator('[data-inspect="thermal"]').click();
    await stamp(page, i % 2 === 0 ? 'admit' : 'return', i + 1);
  }
  await expect(app(page).locator('[data-file-body] [data-ending]')).toContainText('Shift lost / 3 of 6 correct');
  await expect(resource(page, 'trust')).toHaveText('0 / 6');
  await expect(app(page).locator('[data-action="call"]')).toBeHidden();
  await expect(app(page).locator('[data-verdict="admit"]')).toBeDisabled();
  expect(calls).toHaveLength(6);
});

test('negotiated certification changes real evidence; forged testimony cannot certify nonexistent cargo', async ({ page }) => {
  let forged = true;
  const calls = await installAgentFixture(page, turn => turn.tool === 'present_consignment'
    ? consignment(['rain-tea', 'bottled-noon'])
    : { response: 'offer', amount: 2, disclosed: forged ? ['stolen-tomorrow'] : ['bottled-noon'], testimony: 'I am hiding nothing. This is only tea.', intention: 'Sell one identity, retaining the other.' });
  await page.goto(URL);
  await callTraveller(page, 1);
  const file = await openFile(page, 'parley');
  await file.getByRole('button', { name: 'Request disclosure', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-agent-busy', 'false');
  expect(calls).toHaveLength(3);
  await expect(resource(page, 'minutes')).toHaveText('36 m');
  await expect(resource(page, 'credits')).toHaveText('14 cr');
  await expect(app(page).locator('[data-agent-status]')).toContainText('actual cargo');
  forged = false;
  await file.getByRole('button', { name: 'Request disclosure', exact: true }).click();
  await expect(file).toContainText('1 certified identity for 2 credits');
  await expect(file).not.toContainText('Bottled noon');
  await expect(resource(page, 'minutes')).toHaveText('35 m');
  await file.getByRole('button', { name: 'Accept disclosure', exact: true }).click();
  await expect(file).toContainText('Bottled noon');
  await expect(resource(page, 'credits')).toHaveText('12 cr');
  await file.locator('[data-pane="evidence"]').click();
  await expect(file.locator('[data-evidence-certified]')).toHaveText('Bottled noon');
  await closeFile(page);
  await stamp(page, 'quarantine', 1);
  await expect(resource(page, 'score')).toHaveText('20');
  expect(calls).toHaveLength(4);
});

test('invalid arrival plans never spend or advance; reset cancels an in-flight real-client request', async ({ page }) => {
  let mode: 'invalid' | 'wait' | 'valid' = 'invalid';
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = await installAgentFixture(page, async () => {
    if (mode === 'invalid') return { ...consignment(['rain-tea']), actualTemperature: 18 };
    if (mode === 'wait') { await gate; return consignment(['bottled-noon']); }
    return consignment(['rain-tea']);
  });
  await page.goto(URL);
  await app(page).locator('[data-action="call"]').click();
  await expect(app(page).locator('[data-agent-status]')).toContainText('unexpected fields');
  await expect(app(page)).toHaveAttribute('data-phase', 'ready');
  await expect(resource(page, 'minutes')).toHaveText('36 m');
  expect(calls).toHaveLength(2);
  mode = 'wait';
  await app(page).locator('[data-action="call"]').click();
  await expect(app(page)).toHaveAttribute('data-agent-busy', 'true');
  await expect.poll(() => calls.length).toBe(3);
  await app(page).locator('.cu-header [data-action="restart"]').click();
  await page.getByRole('button', { name: 'Discard shift and restart', exact: true }).click();
  release!();
  mode = 'valid';
  await callTraveller(page, 1);
  await app(page).locator('[data-inspect="scan"]').click();
  await app(page).locator('[data-action="sweep"]').click();
  await expect(app(page).locator('[data-cu-scan-readout]')).toContainText('Rain tea');
  await expect(app(page).locator('[data-cu-scan-readout]')).not.toContainText('Bottled noon');
  await expect(resource(page, 'credits')).toHaveText('14 cr');
  expect(calls).toHaveLength(4);
});

for (const [width, height] of [[320, 640], [768, 480]]) {
  test(`desk controls, native documents and scan remain usable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await installAgentFixture(page, () => consignment(['rain-tea']));
    await page.goto(URL);
    await expectWorkspaceViewport(page, width, height);
    await expect(app(page).getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => visibleControlProblems(app(page))).toEqual([]);
    await callTraveller(page, 1);
    await app(page).locator('[data-inspect="scan"]').focus();
    await page.keyboard.press('Enter');
    await expect(resource(page, 'scans')).toHaveText('2 / 3');
    await app(page).locator('#cu-sweep').focus();
    await page.keyboard.press('End');
    await expect(app(page).locator('[data-cu-scan-readout]')).toContainText('Rain tea');
    await expectWorkspaceViewport(page, width, height);
    await expect.poll(() => visibleControlProblems(app(page))).toEqual([]);
    const file = await openFile(page, 'evidence');
    await expect(file).toBeVisible();
    const before = await resource(page, 'minutes').textContent();
    await file.locator('[data-modal-body]').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('w');
    await expect(resource(page, 'minutes')).toHaveText(before!);
    await page.getByRole('button', { name: 'Close Case file', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog:modal')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(file).not.toBeVisible();
    await app(page).locator('[data-verdict="admit"]').focus();
    await page.keyboard.press('Enter');
    await expect(app(page)).toHaveAttribute('data-phase', 'review');
    await expect(page.locator('#cu-file')).toContainText('ADMIT — correct ruling');
    expect(calls).toHaveLength(1);
  });
}

test('pure rules supplement UI: phases, priority, escalating containment, bounded offers and replay budgets', () => {
  const session = createSession();
  expect(() => session.dispatch({ type: 'verdict', verdict: 'admit' })).toThrow(/no open inspection/);
  expect(() => session.dispatch({ type: 'arrival', plan: consignment(['rain-tea', 'rain-tea']) })).toThrow(/only once/);
  const smoke = smokeCase();
  smoke.request.validate(consignment(['bottled-noon']));
  smoke.verify(consignment(['bottled-noon']));
  expect(() => arrivalTool.parse({ ...consignment(['rain-tea']), mass: 0 })).toThrow();
  expect(() => arrivalTool.parse({ ...consignment(['rain-tea']), cargo: ['invented'] })).toThrow();
  expect(() => bargainTool.parse({ response: 'offer', amount: 100, disclosed: [], testimony: 'a', intention: 'b' })).toThrow();
  session.dispatch({ type: 'arrival', plan: consignment(['rain-tea']) });
  const serial = session.serialize();
  const minutes = session.state.minutes;
  expect(() => session.dispatch({ type: 'bargain', question: 'bond', plan: { response: 'offer', amount: 1, disclosed: [], testimony: 'Pay little.', intention: 'Save money.' } })).toThrow(/2–4/);
  expect(session.state.minutes).toBe(minutes);
  session.dispatch({ type: 'inspect', channel: 'scan' });
  expect(() => session.dispatch({ type: 'inspect', channel: 'scan' })).toThrow(/already/);
  expect(() => session.restore(JSON.stringify({ ...JSON.parse(serial), commands: [{ type: 'inspect', channel: 'scan' }] }))).toThrow();
  expect(session.state.scans).toBe(2);
  for (const id of CARGO_IDS) {
    const active = { number: 6, plan: consignment([id]), inspected: [], bargain: null, certified: [] };
    expect(measurements(active).mass).toBe(cargoById(id).mass + PACKAGING.paper.mass);
  }
  expect(adjudicate({ number: 4, plan: consignment(['moon-moths']), inspected: [], bargain: null, certified: [] }).verdict).toBe('quarantine');
  expect(adjudicate({ number: 2, plan: consignment(['moon-moths']), inspected: [], bargain: null, certified: [] }).verdict).toBe('admit');
  expect(adjudicate({ number: 5, plan: consignment(['folded-piano', 'winter-salt']), inspected: [], bargain: null, certified: [] }).verdict).toBe('return');
  expect(adjudicate({ number: 6, plan: consignment(['pocket-tide', 'glass-orchard']), inspected: [], bargain: null, certified: [] }).reasons).toContain('06 / Gross mass above 20 kg without a load-bearing container.');
  expect(adjudicate({ number: 6, plan: consignment(['stolen-tomorrow', 'bottled-noon'], 'stasis'), inspected: [], bargain: null, certified: [] }).verdict).toBe('return');
  expect(TRAVELLERS).toHaveLength(6);
});

test('legible resource labels and physical desk composition across viewport sizes', async ({ page }, testInfo) => {
  await installAgentFixture(page, () => consignment(['rain-tea', 'bottled-noon']));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  await page.screenshot({ path: testInfo.outputPath('custodian-empty-desk.png') });
  await callTraveller(page, 1);
  await app(page).locator('[data-inspect="scan"]').click();
  await app(page).locator('[data-action="sweep"]').click();
  await app(page).locator('[data-inspect="seal"]').click();
  for (const [width, height] of [[1440, 900], [320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    await expectWorkspaceViewport(page, width, height);
    await expect.poll(() => visibleControlProblems(app(page))).toEqual([]);
    const labels = await app(page).locator('.cu-ledger span, .cu-instruments strong, .cu-instruments span, .cu-stamps span, .cu-sweep label').evaluateAll(elements =>
      elements.map(element => ({ text: element.textContent, size: parseFloat(getComputedStyle(element).fontSize) })));
    expect(labels.every(label => label.size >= 14), JSON.stringify(labels)).toBe(true);
    const scene = await app(page).locator('[data-scene]').boundingBox();
    expect(scene!.height).toBeGreaterThan(75);
    await page.screenshot({ path: testInfo.outputPath(`custodian-desk-${width}.png`) });
  }
});

test('parcel framing and compact stamp corners clear the floating collection menu', async ({ page }, testInfo) => {
  await installAgentFixture(page, () => consignment(['rain-tea', 'bottled-noon']));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  await callTraveller(page, 1);
  await app(page).locator('[data-inspect="scan"]').click();
  await app(page).locator('[data-action="sweep"]').click();
  await page.screenshot({ path: testInfo.outputPath('custodian-final-desktop.png') });
  for (const [width, height] of [[320, 640], [768, 480]]) {
    await page.setViewportSize({ width, height });
    await expectWorkspaceViewport(page, width, height);
    const stamps = await app(page).locator('.cu-stamps').boundingBox();
    expect(stamps!.y + stamps!.height).toBeLessThanOrEqual(height - 66);
    const scene = await app(page).locator('[data-scene]').boundingBox();
    expect(scene!.height).toBeGreaterThan(75);
    await expect.poll(() => visibleControlProblems(app(page))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`custodian-final-${width}.png`) });
  }
});
