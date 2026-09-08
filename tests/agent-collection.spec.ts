import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readProjectManifests, renderProjectDocument } from '../scripts/project-pages';
import { parseManifest } from '../src/core/manifest';
import { openCollectionMenu } from './helpers/navigation';
import { expectWorkspaceViewport, visibleControlProblems } from './helpers/workspace';

const gameIds = [
  'ghost-courier', 'custodian', 'mnemosyne', 'accord', 'graft',
  'sigil', 'afterlight', 'mise', 'chorus', 'takes',
];
const projects = readProjectManifests(process.cwd());
const games = projects.filter(project => project.runtime === 'openai-compatible');
const firstEdition = games.filter(project => project.order >= 72 && project.order <= 81);

test('model runtime metadata is explicit, validated, backwards compatible, and carried into static documents', () => {
  const original = projects.find(project => project.id === 'nonogram')!;
  const required = parseManifest({ ...original, runtime: 'openai-compatible' });
  expect(required.runtime).toBe('openai-compatible');
  expect(parseManifest({ ...original, runtime: 'local' }).runtime).toBe('local');
  expect(parseManifest({ ...original, runtime: undefined }).runtime).toBeUndefined();
  for (const runtime of ['remote', 'OpenAI', true, [], {}, null]) {
    expect(() => parseManifest({ ...original, runtime })).toThrow('runtime');
  }
  const document = renderProjectDocument(readFileSync('index.html', 'utf8'), required, true);
  expect(document).toContain('data-runtime="openai-compatible"');
  expect(document).toContain('Requires an OpenAI-compatible model connection.');
  const local = renderProjectDocument(readFileSync('index.html', 'utf8'), original, true);
  expect(local).toContain('data-runtime="local"');
  expect(local).not.toContain('Requires an OpenAI-compatible model connection.');
});

test('the ten agent games are distinct independently registered projects after the original local collection', () => {
  expect(firstEdition.map(project => project.id).sort()).toEqual([...gameIds].sort());
  expect(firstEdition.map(project => project.order).sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, index) => index + 72));
  expect(projects.filter(project => project.order <= 71).every(project => project.runtime !== 'openai-compatible')).toBe(true);
  for (const game of games) {
    expect(game.tags).toContain('Agent games');
    expect(game.category).toBe('play');
  }
});

test('library cards disclose required models without loading game engines or contacting an API', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  await expect(page.locator('.project-card')).toHaveCount(projects.length);
  await expect(page.locator('.project-card[data-runtime="openai-compatible"]')).toHaveCount(games.length);
  await expect(page.locator('.card-requirement')).toHaveCount(games.length);
  expect(requests.filter(url => /\/(?:chat\/completions|models)(?:\?|$)|\/core\/agents\/|\/projects\/[^/]+\/(?:index|agent|engine)\.ts/.test(url))).toEqual([]);
  for (const layout of ['List view', 'Grid view']) {
    await page.getByRole('button', { name: layout, exact: true }).click();
    const game = page.locator('[data-project="ghost-courier"]');
    await expect(game).toHaveAccessibleDescription('API required');
    const badge = page.locator('#requirement-ghost-courier');
    expect(await badge.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test('model requirements are searchable and About describes explicit endpoint use rather than promising no uploads', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-library-search]').fill('model required');
  await expect(page.locator('.project-card')).toHaveCount(games.length);
  await expect(page.locator('.project-card[data-runtime="local"]')).toHaveCount(0);
  await page.locator('[data-library-search]').fill('openai-compatible');
  await expect(page.locator('.project-card')).toHaveCount(games.length);
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const about = page.getByRole('dialog', { name: 'A collection, not a template.', exact: true });
  await expect(about).toContainText('API required');
  await expect(about).toContainText('model endpoint you configure');
  await expect(about).not.toContainText('nothing is uploaded');
  await expect(about).not.toContainText('No hosted AI calls');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Find a project', exact: true });
  await search.getByRole('searchbox').fill('openai');
  for (const game of games) {
    await expect(search.locator(`a[href$="/projects/${game.id}/"]`)).toContainText('API required');
  }
  expect(await search.locator('.search-result small').first().evaluate(element =>
    parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
});

test('the floating project information distinguishes model-required games from local sites', async ({ page }) => {
  for (const id of ['ghost-courier', 'nonogram']) {
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
    await openCollectionMenu(page);
    await page.locator('[data-project-info]').click();
    const information = page.locator('.project-info-dialog');
    await expect(information).toBeVisible();
    await expect(information.locator('[data-info-runtime]')).toContainText(id === 'ghost-courier' ?
      'Requires your own OpenAI-compatible model connection' : 'does not require a hosted model');
    await page.keyboard.press('Escape');
  }
});

test('Takes keeps mobile orbit controls, the production brief, and model status reachable together', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/takes/');
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-ready', 'true');
  const root = page.locator('.project-takes');
  for (const size of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 768, height: 480 }]) {
    await page.setViewportSize(size);
    await expectWorkspaceViewport(page, size.width, size.height);
    expect(await visibleControlProblems(root)).toEqual([]);
    await expect(root.locator('[data-agent-status]')).toBeVisible();
    await root.getByRole('button', { name: 'Orbit left', exact: true }).click();
    await root.getByRole('button', { name: 'Orbit right', exact: true }).click();
    await root.getByRole('button', { name: 'Open production brief', exact: true }).click();
    await expect(root.locator('dialog:modal')).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
