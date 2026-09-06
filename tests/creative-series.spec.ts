import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectManifests } from '../scripts/project-pages';

const groups = [
  { tag: 'New interaction', ids: ['shadow-play', 'glyph-garden', 'worlds-within', 'time-brush', 'breath-garden'] },
  { tag: '3D scene', ids: ['tidal-observatory', 'neon-rain', 'paper-planet', 'crystal-cavern', 'perspective-paradox'] },
  { tag: 'Particle study', ids: ['star-nursery', 'ink-water', 'firefly-choir', 'sand-script', 'magnetic-loom'] },
  { tag: 'Animation demo', ids: ['epicycle-studio', 'chain-reaction', 'motion-foundry', 'camera-assembly', 'season-clock'] },
];
const manifests = readProjectManifests(process.cwd());

test('The new edition contains five complete projects in each of four creative series', () => {
  expect(manifests.length).toBeGreaterThanOrEqual(50);
  const ids = groups.flatMap((group) => group.ids);
  expect(new Set(ids).size).toBe(20);
  for (const group of groups) {
    expect(group.ids).toHaveLength(5);
    for (const id of group.ids) {
      const manifest = manifests.find((project) => project.id === id);
      expect(manifest, `${id} must be registered`).toBeDefined();
      expect(manifest!.format).toBe('page');
      expect(manifest!.tags).toContain(group.tag);
      const folder = resolve('src/projects', id);
      for (const file of ['index.ts', 'manifest.json', 'style.css', 'README.md']) {
        expect(existsSync(resolve(folder, file)), `${id}/${file}`).toBe(true);
      }
      expect(readdirSync(folder).filter((file) => file.endsWith('.ts') && file !== 'index.ts').length,
        `${id} needs separately extendable data, engine, or scene modules`).toBeGreaterThan(0);
    }
  }
});

test('The optional breath interaction never requests a microphone just by opening', async ({ page }) => {
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(window, '__seriesMediaRequests', { get: () => requests });
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        requests++;
        throw new DOMException('Microphone blocked by this permission regression.', 'NotAllowedError');
      };
    }
  });
  await page.goto('./projects/breath-garden/');
  await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => Reflect.get(window, '__seriesMediaRequests'))).toBe(0);
  await expect(page.locator('.project-breath-garden')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collection menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
});
