import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  realpathSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const categories = ['create', 'play', 'read', 'learn', 'explore', 'art'];
const help = `Create an independent Odd Index project.

Usage:
  npm run new:project -- my-idea --title "My Idea" --category create

Options:
  --id         URL-safe project id (or use the first positional argument)
  --title      Website title; defaults to the id in title case
  --category   create, play, read, learn, explore, or art
  --medium     Short description of the format
  --help       Show this help

Run from the repository root. Existing files are never overwritten.
The next available project order is assigned automatically.
`;

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function markdownTitle(text) {
  return text.replace(/[\\`*_{}[\]<>#|]/g, '\\$&');
}

function assertInside(root, path) {
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const location = relative(root, realpathSync(ancestor));
  if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new Error(`Refusing to write outside this repository: ${path}`);
  }
}

function nextOrder(root, projectsFolder) {
  let highest = 0;
  for (const entry of readdirSync(projectsFolder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(projectsFolder, entry.name, 'manifest.json');
    if (!existsSync(path)) continue;
    assertInside(root, path);
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !Number.isInteger(manifest.order) || manifest.order < 1) {
      throw new Error(`Fix the invalid order in ${path} before adding a project.`);
    }
    highest = Math.max(highest, manifest.order);
  }
  return highest + 1;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      title: { type: 'string' },
      category: { type: 'string', default: 'create' },
      medium: { type: 'string', default: 'Community website' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { console.log(help); return; }
  if (positionals.length > 1 || (values.id && positionals.length)) {
    throw new Error('Provide one project id, either positionally or with --id.');
  }
  const id = values.id || positionals[0];
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error('Use a lowercase id beginning with a letter, with only letters, digits, and hyphens.');
  }
  const title = (values.title || id.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')).trim();
  const medium = values.medium.trim();
  if (!title || title.length > 90 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new Error('Use a single-line title between 1 and 90 characters.');
  }
  if (!medium || medium.length > 80 || /[\u0000-\u001f\u007f]/.test(medium)) {
    throw new Error('Use a single-line medium description between 1 and 80 characters.');
  }
  if (!categories.includes(values.category)) throw new Error(`Choose a category: ${categories.join(', ')}.`);

  const root = realpathSync(process.cwd());
  const projectsFolder = resolve(root, 'src/projects');
  if (!existsSync(resolve(root, 'package.json')) || !existsSync(resolve(root, 'src/core/page.ts')) || !existsSync(projectsFolder)) {
    throw new Error('Run this command from the Odd Index repository root.');
  }
  const folder = resolve(projectsFolder, id);
  if (existsSync(folder)) throw new Error(`Project "${id}" already exists. Nothing was changed.`);
  assertInside(root, projectsFolder);
  const order = nextOrder(root, projectsFolder);
  const preview = `previews/${id}.svg`;
  const manifest = {
    id, order, title,
    subtitle: 'A new idea, ready to become its own website.',
    description: 'An independent community project starter. Replace the example with something worth opening.',
    category: values.category,
    format: 'page',
    medium,
    tags: ['Community', 'Starter'],
    color: '#e5eee0',
    ink: '#253e30',
    instruction: 'Try the interaction, then replace this starter with your own idea.',
    preview,
  };
  const entrypoint = [
    "import './style.css';",
    "import { createProjectPage, escapeMarkup, query } from '../../core/page';",
    "import type { ProjectContext, ProjectInstance } from '../../core/types';",
    "import { ideas, colors } from './data';",
    '',
    `const title = ${JSON.stringify(title)};`,
    '',
    'export function mount(context: ProjectContext): ProjectInstance {',
    `  const page = createProjectPage(context, '${id}');`,
    ...(values.category === 'read' ? [] : ["  page.root.dataset.workspace = 'true';"]),
    '  let position = 0;',
    '  page.root.innerHTML = `',
    '    <div class="starter-shell" data-project-preview>',
    '      <p class="starter-kicker">Community project starter</p>',
    '      <h1>${escapeMarkup(title)}</h1>',
    '      <p class="starter-intro">Your website owns this page. Start small, make it useful or surprising, and give it a point of view.</p>',
    '      <button class="app-button" type="button" data-starter-action>Try the interaction</button>',
    '      <p class="starter-status" role="status" aria-live="polite" data-starter-status>${ideas[0]}</p>',
    '    </div>`;',
    '  query<HTMLButtonElement>(page.root, "[data-starter-action]").addEventListener("click", () => {',
    '    position = (position + 1) % ideas.length;',
    '    page.root.style.setProperty("--starter-accent", colors[position]);',
    '    query<HTMLElement>(page.root, "[data-starter-status]").textContent = ideas[position];',
    '  }, { signal: page.signal });',
    '  return { destroy: page.destroy };',
    '}',
    '',
  ].join('\n');
  const data = `export const ideas = [
  'A place for a new idea.',
  'Make something people can actually explore.',
  'Keep the content ahead of the chrome.',
] as const;

export const colors = ['#315f48', '#79537b', '#b75e32'] as const;
`;
  const style = `.project-${id} {
  --starter-accent: #315f48;
  --app-accent: var(--starter-accent);
  min-height: 100svh;
  background: #f3f5ee;
  color: #253e30;
}
.project-${id} .starter-shell { max-width: 1000px; margin: auto; padding: clamp(28px, 6vw, 84px); }
.project-${id} .starter-kicker { font-size: 13px; color: var(--starter-accent); }
.project-${id} h1 { font-size: clamp(36px, 6vw, 72px); overflow-wrap: anywhere; margin: 20px 0; }
.project-${id} p { max-width: 62ch; font-size: 17px; line-height: 1.7; }
.project-${id} .starter-status { border-left: 3px solid var(--starter-accent); padding: 18px; margin-top: 28px; }
.project-${id}[data-workspace] { height: 100dvh; min-height: 0; }
.project-${id}[data-workspace] .starter-shell { box-sizing: border-box; height: 100%; min-height: 0; display: flex; flex-direction: column; gap: clamp(8px, 2dvh, 20px); padding: clamp(16px, 3dvh, 32px) clamp(20px, 4vw, 60px); }
.project-${id}[data-workspace] .starter-shell > * { flex-shrink: 0; margin: 0; }
.project-${id}[data-workspace] h1 { font-size: clamp(28px, 6vw, 56px); line-height: 1.1; }
.project-${id}[data-workspace] p { font-size: 16px; line-height: 1.5; }
.project-${id}[data-workspace] .starter-intro { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
.project-${id}[data-workspace] .app-button { align-self: flex-start; min-height: 44px; }
.project-${id}[data-workspace] .starter-status { padding: 12px 64px 12px 16px; }
`;
  const notes = `# ${markdownTitle(title)}

Independent URL: \`/projects/${id}/\`.

## Make it your own

- \`index.ts\` owns the page and interactions.
- \`data.ts\` keeps content and presets separate from the UI.
- \`style.css\` is scoped to \`.project-${id}\`.
- \`manifest.json\` registers the site automatically; its order is ${order}.
- \`public/${preview}\` is a local starter cover, not a screenshot of a finished project.

Replace this starter with substantive content and real behavior before opening
a PR. Keep readable controls, mobile support, explicit media consent, and cleanup.
Add pure engine/model files when your idea needs them.
Interaction-led sites use a viewport workspace: keep primary controls and results
together, and put secondary content in bounded panels or dialogs. Reading sites
can use normal document flow. See core/workspace.ts for optional UI primitives.

Run \`npm run build\` and your focused browser spec. For a real screenshot cover,
remove the custom \`preview\` field and run
\`npm run test:update-previews -- --grep "Capture ${id}$"\`.

See the repository CONTRIBUTING.md and src/projects/README.md for the full guide.
`;
  const fontSize = Math.max(18, Math.min(68, Math.floor(1000 / Math.max(1, [...title].length) / 0.58)));
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#e5eee0"/>
<path d="M76 130h1048M76 650h1048" stroke="#a7b89f"/>
<circle cx="1020" cy="260" r="92" fill="none" stroke="#315f48" stroke-width="8"/>
<path d="M1020 220v80m-40-40h80" stroke="#315f48" stroke-width="8"/>
<text x="76" y="95" fill="#4d674e" font-size="24" font-family="Arial,sans-serif">COMMUNITY PROJECT STARTER</text>
<text x="76" y="430" fill="#253e30" font-size="${fontSize}" font-family="Arial,sans-serif">${escapeXml(title)}</text>
<text x="76" y="500" fill="#4d674e" font-size="27" font-family="Arial,sans-serif">Your idea goes here. Make it worth opening.</text>
<text x="76" y="705" fill="#4d674e" font-size="22" font-family="Arial,sans-serif">odd/index / ${escapeXml(id)}</text>
</svg>
`;
  const spec = [
    "import { expect, test } from '@playwright/test';",
    '',
    `test(${JSON.stringify(`${id}: the independent page and starter interaction work`)}, async ({ page }) => {`,
    '  await page.setViewportSize({ width: 375, height: 812 });',
    `  await page.goto('./projects/${id}/');`,
    `  await expect(page.locator('.project-${id}')).toBeVisible();`,
    `  await expect(page.getByRole('heading', { name: ${JSON.stringify(title)}, exact: true })).toBeVisible();`,
    "  await page.getByRole('button', { name: 'Try the interaction', exact: true }).click();",
    "  await expect(page.locator('[data-starter-status]')).toHaveText('Make something people can actually explore.');",
    ...(values.category === 'read' ? [] : [
      `  await expect(page.locator('.project-${id}')).toHaveAttribute('data-workspace', 'true');`,
      '  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(812);',
      '  await page.setViewportSize({ width: 320, height: 640 });',
      '  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(640);',
    ]),
    '});',
    '',
  ].join('\n');

  const files = [
    [resolve(folder, 'data.ts'), data],
    [resolve(folder, 'style.css'), style],
    [resolve(folder, 'index.ts'), entrypoint],
    [resolve(folder, 'README.md'), notes],
    [resolve(root, 'public', preview), artwork],
    [resolve(root, 'tests/projects', `${id}.spec.ts`), spec],
    [resolve(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`],
  ];
  for (const [path] of files) {
    assertInside(root, path);
    if (existsSync(path)) throw new Error(`Refusing to overwrite ${relative(root, path)}.`);
  }

  const created = [];
  mkdirSync(folder);
  try {
    for (const [path, content] of files) {
      mkdirSync(dirname(path), { recursive: true });
      const descriptor = openSync(path, 'wx');
      created.push(path);
      try { writeFileSync(descriptor, content, 'utf8'); } finally { closeSync(descriptor); }
    }
  } catch (error) {
    const failures = [];
    for (const path of created.reverse()) {
      try { unlinkSync(path); } catch (cleanupError) { failures.push(cleanupError); }
    }
    try { rmdirSync(folder); } catch (cleanupError) { failures.push(cleanupError); }
    if (failures.length) throw new AggregateError([error, ...failures], 'Project creation failed and some created files could not be removed.');
    throw error;
  }
  console.log(`Created ${title} in src/projects/${id}/ (order ${order}).`);
  console.log(`Open /projects/${id}/ with npm run dev.`);
  console.log(`Next: replace the starter, update its README, and run npm test -- tests/projects/${id}.spec.ts`);
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
