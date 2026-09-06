import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectManifests } from '../scripts/project-pages';

const manifests = readProjectManifests(process.cwd());
const groups = [
  { tag: 'AI education', ids: ['vector-playground', 'gradient-lab', 'attention-studio', 'decoding-lab', 'patchwork-vision'] },
  { tag: 'Engineering lab', ids: ['engine-room', 'motor-field-lab', 'gearbox-playground', 'linkage-atlas', 'cam-workshop'] },
];

test('The sixty-site edition includes five AI education and five engineering websites', () => {
  expect(manifests.length).toBeGreaterThanOrEqual(60);
  for (const group of groups) {
    expect(group.ids).toHaveLength(5);
    for (const id of group.ids) {
      const project = manifests.find((manifest) => manifest.id === id);
      expect(project, `${id} must be a real registered website`).toBeDefined();
      expect(project!.category).toBe('learn');
      expect(project!.format).toBe('page');
      expect(project!.tags).toContain(group.tag);
      expect(existsSync(resolve('src/projects', id, 'README.md'))).toBe(true);
      expect(existsSync(resolve('src/projects', id, 'style.css'))).toBe(true);
    }
  }
});
