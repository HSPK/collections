import { expect, test } from '@playwright/test';
import { escapeMarkup } from '../../src/core/markup';
import { planMarkup } from '../../src/projects/passage/plan';
import { makeLayout } from '../../src/projects/passage/presets';

test('Passage labels each room once, independently of occupied solids', () => {
  const original = makeLayout();
  const open = structuredClone(original);
  open.world.walls = [];
  open.world.doors = [];
  open.world.obstacles = [];
  open.world.portals = [];
  for (const floor of open.world.floors) floor.voids = [];
  for (const layout of [original, open]) {
    const svg = planMarkup(layout, 'g', null);
    const labels = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)]
      .map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    for (const room of layout.world.rooms.filter((room) => room.floor === 'g')) {
      expect(labels.filter((label) => label === escapeMarkup(room.name)), room.name).toHaveLength(1);
    }
  }
});

test('Passage rewind returns both the walker and its linked plan to the starting floor', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./projects/passage/');
  const root = page.locator('.project-passage');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await expect(root).toHaveAttribute('data-route-status', 'found');
  await page.locator('[data-passage-pane="route"]').click();
  await page.locator('[data-passage-scrub]').focus();
  await page.keyboard.press('End');
  await expect(root).toHaveAttribute('data-walk-kind', 'arrive');
  await expect(page.locator('[data-passage-floor]')).toHaveValue('u');
  await page.locator('[data-passage-rewind]').click();
  await expect(root).toHaveAttribute('data-walk-time', '0.000');
  await expect(root).toHaveAttribute('data-walk-y', '0.000');
  await expect(page.locator('[data-passage-floor]')).toHaveValue('g');
});
