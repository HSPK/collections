import { parseManifest, validateCollection } from './core/manifest';
import type { Project, ProjectModule } from './core/types';

export { categories, categoryNames, isCategory } from './core/manifest';

const manifests = import.meta.glob<{ default: unknown }>('./projects/*/manifest.json', { eager: true });
const entrypoints = import.meta.glob<ProjectModule>('./projects/*/index.ts');

export const projects: Project[] = Object.entries(manifests).map(([path, module]) => {
  const manifest = parseManifest(module.default, path);
  const folder = path.split('/')[2];
  if (manifest.id !== folder) throw new Error(`${path}: id must match its project folder.`);
  const entrypoint = path.replace('/manifest.json', '/index.ts');
  const load = entrypoints[entrypoint];
  if (!load) throw new Error(`${manifest.title} needs an index.ts entrypoint.`);
  return {
    ...manifest,
    number: String(manifest.order).padStart(2, '0'),
    sourcePath: `src/projects/${manifest.id}`,
    load,
  };
}).sort((a, b) => a.order - b.order);

validateCollection(projects);
