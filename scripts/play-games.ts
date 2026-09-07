import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import {
  createOpenAIGateway,
  validateLocalRequest,
  type OpenAIGateway,
  type OpenAIGatewayOptions,
} from './openai-gateway.ts';

const DEFAULT_PORT = 4174;
const COLLECTION_PREFIX = '/collections';
const SAFE_EXTENSIONS = new Set([
  '.avif', '.css', '.geojson', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json',
  '.m4a', '.mp3', '.mp4', '.ogg', '.otf', '.png', '.svg', '.ttf', '.txt', '.wasm',
  '.wav', '.webm', '.webp', '.woff', '.woff2',
]);
const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface GamesServerOptions {
  distRoot?: string;
  gateway?: OpenAIGateway;
  gatewayOptions?: OpenAIGatewayOptions;
}

export interface GamesServer {
  readonly server: Server;
  readonly distRoot: string;
  readonly gateway: OpenAIGateway;
  close(): Promise<void>;
}

function sendText(response: ServerResponse, status: number, message: string, allow?: string): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = `${message}\n`;
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (allow) response.setHeader('Allow', allow);
  response.end(body);
}

export function parseGamePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) throw new Error('GAME_PORT must be an integer from 1 through 65535.');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('GAME_PORT must be an integer from 1 through 65535.');
  }
  return port;
}

function checkedDistRoot(path: string): string {
  let root: string;
  try {
    root = realpathSync(path);
    if (!statSync(root).isDirectory() || !statSync(resolve(root, 'index.html')).isFile()) throw new Error();
  } catch {
    throw new Error(`Built site not found at ${resolve(path)}. Run "npm run build" first.`);
  }
  return root;
}

function decodedPathname(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) throw new Error('Invalid request target.');
  const rawPath = target.split('?', 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error('Invalid URL encoding.');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) throw new Error('Invalid path.');
  if (decoded.split('/').some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('Invalid path.');
  }
  return decoded;
}

function stripCollectionPrefix(pathname: string): string {
  if (pathname === COLLECTION_PREFIX) return '/';
  if (pathname.startsWith(`${COLLECTION_PREFIX}/`)) return pathname.slice(COLLECTION_PREFIX.length);
  return pathname;
}

function containedPath(root: string, pathname: string): { file: string; directory: boolean } | undefined {
  const relativePath = stripCollectionPrefix(pathname).replace(/^\/+/, '');
  let candidate = resolve(root, relativePath || 'index.html');
  let directory = false;
  try {
    directory = statSync(candidate).isDirectory();
    if (directory) candidate = resolve(candidate, 'index.html');
    candidate = realpathSync(candidate);
  } catch {
    return undefined;
  }
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return undefined;
  const extension = extname(candidate).toLowerCase();
  if (!SAFE_EXTENSIONS.has(extension)) return undefined;
  const basename = candidate.slice(candidate.lastIndexOf(sep) + 1).toLowerCase();
  if (basename === 'package.json' || basename === 'tsconfig.json' || basename.endsWith('.map')) return undefined;
  return statSync(candidate).isFile() ? { file: candidate, directory } : undefined;
}

function cacheControl(path: string): string {
  if (extname(path).toLowerCase() === '.html') return 'no-cache';
  if (path.includes(`${sep}assets${sep}`) && /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(path)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

async function serveStatic(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const policyError = validateLocalRequest(request);
  if (policyError) {
    sendText(response, policyError.status, policyError.message);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed.', 'GET, HEAD');
    return;
  }

  let pathname: string;
  try {
    pathname = decodedPathname(request.url);
  } catch {
    sendText(response, 400, 'Invalid request path.');
    return;
  }
  const target = containedPath(root, pathname);
  if (!target) {
    sendText(response, 404, 'Not found.');
    return;
  }
  if ((target.directory || pathname === COLLECTION_PREFIX) && !pathname.endsWith('/')) {
    const requested = request.url!;
    const query = requested.indexOf('?');
    const path = query < 0 ? requested : requested.slice(0, query);
    const search = query < 0 ? '' : requested.slice(query);
    response.setHeader('Location', `${path}/${search}`);
    sendText(response, 308, 'Use the directory URL so relative assets and links resolve correctly.');
    return;
  }

  const file = target.file;
  const stats = statSync(file);
  const extension = extname(file).toLowerCase();
  response.statusCode = 200;
  response.setHeader('Cache-Control', cacheControl(file));
  response.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
  response.setHeader('Content-Length', stats.size);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  try {
    await pipeline(createReadStream(file), response);
  } catch (error) {
    if (!response.destroyed) throw error;
  }
}

export function createGamesServer(options: GamesServerOptions = {}): GamesServer {
  const root = checkedDistRoot(options.distRoot ?? resolve(process.cwd(), 'dist'));
  const gateway = options.gateway ?? createOpenAIGateway(options.gatewayOptions);
  const server = createServer((request, response) => {
    void gateway.handle(request, response).then(async handled => {
      if (!handled) await serveStatic(root, request, response);
    }).catch(() => {
      sendText(response, 500, 'The local game server failed.');
    });
  });
  server.once('close', () => gateway.close());
  let closing: Promise<void> | undefined;
  return {
    server,
    distRoot: root,
    gateway,
    close() {
      if (closing) return closing;
      gateway.close();
      server.closeAllConnections();
      if (!server.listening) {
        closing = Promise.resolve();
        return closing;
      }
      closing = new Promise<void>((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose());
      });
      return closing;
    },
  };
}

export async function startGamesServer(options: GamesServerOptions & { port?: number } = {}): Promise<GamesServer> {
  const instance = createGamesServer(options);
  const port = options.port ?? parseGamePort(process.env.GAME_PORT);
  try {
    await new Promise<void>((resolveListen, reject) => {
      const onError = (error: Error) => reject(error);
      instance.server.once('error', onError);
      instance.server.listen(port, '127.0.0.1', () => {
        instance.server.off('error', onError);
        resolveListen();
      });
    });
  } catch (error) {
    await instance.close();
    throw error;
  }
  return instance;
}

async function run(): Promise<void> {
  const instance = await startGamesServer();
  const address = instance.server.address();
  if (!address || typeof address === 'string') throw new Error('The local game server did not expose a TCP port.');
  console.log(`Odd Index games: http://127.0.0.1:${address.port}/`);
  const shutdown = () => {
    void instance.close().catch(error => {
      console.error(error instanceof Error ? error.message : 'Failed to stop the local game server.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entrypoint) {
  run().catch(error => {
    console.error(error instanceof Error ? error.message : 'Failed to start the local game server.');
    process.exitCode = 1;
  });
}
