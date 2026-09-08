import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { parseManifest, validateCollection } from '../src/core/manifest';
import { escapeMarkup } from '../src/core/markup';
import type { ProjectManifest } from '../src/core/types';
import { projectLabels } from '../src/core/project-locale';

export function readProjectManifests(root: string): ProjectManifest[] {
  const directory = resolve(root, 'src/projects');
  if (!existsSync(directory)) return [];
  const projects = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = resolve(directory, entry.name, 'manifest.json');
      if (!existsSync(path)) return [];
      const manifest = parseManifest(JSON.parse(readFileSync(path, 'utf8')), path);
      if (manifest.id !== entry.name) throw new Error(`${path}: id must match its folder.`);
      if (!existsSync(resolve(directory, entry.name, 'index.ts'))) {
        throw new Error(`${manifest.title} is missing its index.ts entrypoint.`);
      }
      return [manifest];
    });
  validateCollection(projects);
  return projects;
}

export function renderProjectDocument(html: string, project: ProjectManifest, built: boolean): string {
  const title = escapeMarkup(`${project.title} - Odd Index`);
  const description = escapeMarkup(project.description + (project.runtime === 'openai-compatible' ?
    projectLabels(project.language).metaRequired : ''));
  const canonical = `https://hspk.github.io/collections/projects/${project.id}/`;
  const preview = `https://hspk.github.io/collections/${project.preview || `previews/${project.id}.jpg`}`;
  let result = html
    .replace(/<html\b([^>]*)\blang="[^"]*"([^>]*)>/i, (_match, before: string, after: string) =>
      `<html${before}lang="${project.language ?? 'en'}"${after}>`)
    .replace(/<body\b([^>]*)>/i, (_match, attributes: string) => `<body${attributes} data-project="${project.id}" data-runtime="${project.runtime ?? 'local'}">`)
    .replace(/<title>.*?<\/title>/, () => `<title>${title}</title>`)
    .replace(/<meta name="odd-index-base"[^>]*>/, '<meta name="odd-index-base" content="../../" />')
    .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title"[^>]*>/, () => `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description"[^>]*>/, () => `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url"[^>]*>/, () => `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:image"[^>]*>/, () => `<meta property="og:image" content="${preview}" />`)
    .replace(/<meta property="og:image:(width|height)"[^>]*>/g, '')
    .replace(/<meta property="og:image:alt"[^>]*>/, () => `<meta property="og:image:alt" content="${title}" />`);
  if (built) result = result.replace(/\b(src|href)="\.\/([^"]*)"/g, '$1="../../$2"');
  else result = result.replace('href="./favicon.svg"', 'href="../../favicon.svg"');
  return result;
}

export function independentProjectPages(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'independent-project-pages',
    enforce: 'post',
    configResolved(resolved) { config = resolved; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        const match = /\/projects\/([a-z][a-z0-9-]*)(?:\/(?:index\.html)?)?$/.exec(pathname);
        if (!match) return next();
        if (!pathname.endsWith('/') && !pathname.endsWith('index.html')) {
          response.statusCode = 302;
          response.setHeader('Location', `${pathname}/`);
          response.end();
          return;
        }
        try {
          const project = readProjectManifests(config.root).find((item) => item.id === match[1]);
          if (!project) {
            response.statusCode = 404;
            response.end('Project not found.');
            return;
          }
          const template = readFileSync(resolve(config.root, 'index.html'), 'utf8');
          const html = await server.transformIndexHtml(pathname, renderProjectDocument(template, project, false));
          response.setHeader('Content-Type', 'text/html;charset=utf-8');
          response.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('The project pages need the built index.html.');
      const html = typeof index.source === 'string' ? index.source : Buffer.from(index.source).toString('utf8');
      for (const project of readProjectManifests(config.root)) {
        this.emitFile({
          type: 'asset',
          fileName: `projects/${project.id}/index.html`,
          source: renderProjectDocument(html, project, true),
        });
      }
    },
  };
}
