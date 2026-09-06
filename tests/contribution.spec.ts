import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { parseManifest } from '../src/core/manifest';

const generator = resolve('scripts/new-project.mjs');

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'odd-project-starter-'));
  mkdirSync(resolve(directory, 'src/core'), { recursive: true });
  mkdirSync(resolve(directory, 'src/projects/existing'), { recursive: true });
  writeFileSync(resolve(directory, 'package.json'), '{"name":"fixture","type":"module"}');
  writeFileSync(resolve(directory, 'src/core/page.ts'), 'export {};');
  writeFileSync(resolve(directory, 'src/projects/existing/manifest.json'), '{"id":"existing","order":60}');
  return {
    directory,
    run(...args: string[]) {
      return spawnSync(process.execPath, [generator, ...args], { cwd: directory, encoding: 'utf8' });
    },
    dispose() { rmSync(directory, { recursive: true, force: true }); },
  };
}

test('The contributor command creates a complete independently registered starter without editing the index', () => {
  const work = fixture();
  try {
    const result = work.run('small-wonder', '--title', 'Small Wonder', '--category', 'explore');
    expect(result.status, result.stderr).toBe(0);
    const directory = resolve(work.directory, 'src/projects/small-wonder');
    const manifest = parseManifest(JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8')));
    expect(manifest.order).toBe(61);
    expect(manifest.category).toBe('explore');
    expect(manifest.preview).toBe('previews/small-wonder.svg');
    for (const file of ['index.ts', 'data.ts', 'style.css', 'README.md']) {
      expect(existsSync(resolve(directory, file))).toBe(true);
    }
    expect(existsSync(resolve(work.directory, 'public/previews/small-wonder.svg'))).toBe(true);
    expect(existsSync(resolve(work.directory, 'tests/projects/small-wonder.spec.ts'))).toBe(true);
    const transformed = transpileModule(readFileSync(resolve(directory, 'index.ts'), 'utf8'), {
      reportDiagnostics: true,
      compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
    });
    expect(transformed.diagnostics).toEqual([]);
    expect(transformed.outputText).toContain('export function mount');
    expect(result.stdout).toContain('/projects/small-wonder/');
    expect(existsSync(resolve(work.directory, 'src/catalog.ts'))).toBe(false);
  } finally { work.dispose(); }
});

test('The contributor command rejects unsafe ids, categories, and overwrites before changing files', () => {
  const work = fixture();
  try {
    expect(work.run('../escape').status).toBe(1);
    expect(work.run('bad-kind', '--category', 'anything').status).toBe(1);
    expect(work.run('safe-name').status).toBe(0);
    const path = resolve(work.directory, 'src/projects/safe-name/index.ts');
    writeFileSync(path, '// Contributor work must survive.\n');
    const again = work.run('safe-name');
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already exists');
    expect(readFileSync(path, 'utf8')).toBe('// Contributor work must survive.\n');
    mkdirSync(resolve(work.directory, 'public/previews'), { recursive: true });
    writeFileSync(resolve(work.directory, 'public/previews/reserved.svg'), '<svg/>');
    expect(work.run('reserved').status).toBe(1);
    expect(existsSync(resolve(work.directory, 'src/projects/reserved'))).toBe(false);
    expect(existsSync(resolve(work.directory, 'src/projects/bad-kind'))).toBe(false);
  } finally { work.dispose(); }
});

test('Starter metadata and preview text safely preserve quotes and markup characters', () => {
  const work = fixture();
  try {
    const title = 'A "<canvas>" & $ idea';
    const result = work.run('quoted-idea', '--title', title, '--medium', 'A tiny website');
    expect(result.status, result.stderr).toBe(0);
    const manifest = parseManifest(JSON.parse(readFileSync(resolve(work.directory, 'src/projects/quoted-idea/manifest.json'), 'utf8')));
    expect(manifest.title).toBe(title);
    const preview = readFileSync(resolve(work.directory, 'public/previews/quoted-idea.svg'), 'utf8');
    expect(preview).toContain('&quot;&lt;canvas&gt;&quot; &amp; $');
    expect(preview).not.toContain('<canvas>');
    const source = readFileSync(resolve(work.directory, 'src/projects/quoted-idea/index.ts'), 'utf8');
    expect(source).toContain('escapeMarkup(title)');
    expect(transpileModule(source, { reportDiagnostics: true }).diagnostics).toEqual([]);
  } finally { work.dispose(); }
});

test('Starter creation refuses a linked output directory outside the repository', () => {
  const work = fixture();
  const outside = mkdtempSync(resolve(tmpdir(), 'odd-project-outside-'));
  try {
    mkdirSync(resolve(work.directory, 'public'), { recursive: true });
    symlinkSync(outside, resolve(work.directory, 'public/previews'), 'dir');
    const result = work.run('stay-inside');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('outside this repository');
    expect(existsSync(resolve(work.directory, 'src/projects/stay-inside'))).toBe(false);
    expect(existsSync(resolve(outside, 'stay-inside.svg'))).toBe(false);
    unlinkSync(resolve(work.directory, 'public/previews'));
    const externalManifest = resolve(outside, 'manifest.json');
    writeFileSync(externalManifest, '{"id":"outside","order":"do-not-read"}');
    const existingManifest = resolve(work.directory, 'src/projects/existing/manifest.json');
    unlinkSync(existingManifest);
    symlinkSync(externalManifest, existingManifest);
    const linkedMetadata = work.run('read-inside');
    expect(linkedMetadata.status).toBe(1);
    expect(linkedMetadata.stderr).toContain('outside this repository');
    expect(existsSync(resolve(work.directory, 'src/projects/read-inside'))).toBe(false);
  } finally {
    work.dispose();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('Community guidance and pull-request checks welcome contributions without deployment credentials', () => {
  const contribution = readFileSync(resolve('CONTRIBUTING.md'), 'utf8');
  expect(contribution).toContain('AI-generated and AI-assisted websites are welcome');
  expect(contribution).toContain('npm run new:project');
  expect(existsSync(resolve('.github/PULL_REQUEST_TEMPLATE.md'))).toBe(true);
  const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
  expect(workflow).toContain('pull_request:');
  expect(workflow).not.toContain('pull_request_target');
  expect(workflow).toContain('contents: read');
  expect(workflow).toContain('persist-credentials: false');
  expect(workflow).not.toContain('pages: write');
  expect(workflow).not.toContain('id-token: write');
});
