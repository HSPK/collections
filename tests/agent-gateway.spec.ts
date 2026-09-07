import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenAIGateway, openAIGatewayPlugin, validateUpstreamBaseUrl } from '../scripts/openai-gateway';
import { createGamesServer, parseGamePort, startGamesServer } from '../scripts/play-games';

interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function rawRequest(
  origin: string,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResult> {
  const url = new URL(origin);
  return new Promise<HttpResult>((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.once('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function gatewayFixture(
  upstreamHandler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (origin: string, gateway: ReturnType<typeof createOpenAIGateway>) => Promise<void>,
  options: { key?: string; timeoutMs?: number; requestLimitBytes?: number; responseLimitBytes?: number } = {},
): Promise<void> {
  const upstream = createServer(upstreamHandler);
  const upstreamOrigin = await listen(upstream);
  const gateway = createOpenAIGateway({
    environment: {
      OPENAI_BASE_URL: `${upstreamOrigin}/v1`,
      OPENAI_API_KEY: options.key,
    },
    timeoutMs: options.timeoutMs,
    requestLimitBytes: options.requestLimitBytes,
    responseLimitBytes: options.responseLimitBytes,
  });
  const server = createServer((request, response) => {
    void gateway.handle(request, response).then(handled => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  const origin = await listen(server);
  try {
    await run(origin, gateway);
  } finally {
    gateway.close();
    await closeServer(server);
    await closeServer(upstream);
  }
}

function json(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(value));
}

test('fixed model and chat routes forward JSON while stripping browser-only headers', async () => {
  const requests: Array<{ url: string; method: string; headers: IncomingHttpHeaders; body: string }> = [];
  await gatewayFixture(async (request, response) => {
    requests.push({
      url: request.url ?? '',
      method: request.method ?? '',
      headers: request.headers,
      body: await readBody(request),
    });
    if (request.url === '/v1/models') json(response, 200, { data: [{ id: 'fixture-model' }] });
    else json(response, 200, { choices: [{ message: { tool_calls: [] } }] });
  }, async origin => {
    const models = await rawRequest(origin, '/api/openai/v1/models', {
      headers: {
        Origin: origin,
        Authorization: 'Bearer browser-credential',
        Cookie: 'private=cookie',
        'X-Untrusted': 'discard-me',
      },
    });
    expect(models.status).toBe(200);
    expect(JSON.parse(models.body)).toEqual({ data: [{ id: 'fixture-model' }] });

    const body = JSON.stringify({
      model: 'fixture-model',
      stream: false,
      tools: [{ type: 'function', function: { name: 'move', strict: true, parameters: { type: 'object' } } }],
      tool_choice: { type: 'function', function: { name: 'move' } },
      parallel_tool_calls: false,
    });
    const chat = await rawRequest(origin, '/api/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
    expect(chat.status).toBe(200);
    expect(chat.headers['cache-control']).toBe('no-store');
    expect(requests.map(item => [item.method, item.url])).toEqual([
      ['GET', '/v1/models'],
      ['POST', '/v1/chat/completions'],
    ]);
    expect(JSON.parse(requests[1].body)).toEqual(JSON.parse(body));
    for (const item of requests) {
      expect(item.headers.origin).toBeUndefined();
      expect(item.headers.cookie).toBeUndefined();
      expect(item.headers['x-untrusted']).toBeUndefined();
      expect(item.headers.authorization === 'Bearer server-credential').toBe(true);
    }
  }, { key: 'server-credential' });
});

test('browser bearer auth is forwarded only when the process key is absent', async () => {
  let authorizationMatches = false;
  await gatewayFixture((request, response) => {
    authorizationMatches = request.headers.authorization === 'Bearer browser-only-credential';
    json(response, 200, { data: [] });
  }, async origin => {
    const result = await rawRequest(origin, '/api/openai/v1/models', {
      headers: { Authorization: 'Bearer browser-only-credential' },
    });
    expect(result.status).toBe(200);
    expect(authorizationMatches).toBe(true);
  });
});

test('successful upstream responses cannot expose either server-side or browser credentials', async () => {
  const key = 'gateway-fixture-key-do-not-use';
  for (const serverKey of [true, false]) {
    await gatewayFixture((_request, response) => {
      json(response, 200, { choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ intention: key }) } }] } }] });
    }, async origin => {
      const result = await rawRequest(origin, '/api/openai/v1/models', {
        headers: serverKey ? {} : { Authorization: `Bearer ${key}` },
      });
      expect(result.status).toBe(502);
      expect(result.body).toContain('contained a credential');
      expect(result.body).not.toContain(key);
    }, { key: serverKey ? key : undefined });
  }
});

test('route, method, media type, host, origin, and request size policies fail explicitly', async () => {
  let upstreamRequests = 0;
  await gatewayFixture((_request, response) => {
    upstreamRequests += 1;
    json(response, 200, {});
  }, async origin => {
    const cases = [
      await rawRequest(origin, '/api/openai/v1/unknown'),
      await rawRequest(origin, '/api/openai/v1/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      await rawRequest(origin, '/api/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }),
      await rawRequest(origin, '/api/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }),
      await rawRequest(origin, '/api/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"x":"' + 'a'.repeat(100) + '"}' }),
      await rawRequest(origin, '/api/openai/v1/models', { headers: { Host: 'models.example' } }),
      await rawRequest(origin, '/api/openai/v1/models', { headers: { Origin: 'null' } }),
      await rawRequest(origin, '/api/openai/v1/models', { headers: { Origin: 'https://attacker.example' } }),
      await rawRequest(origin, '/api/openai/v1/models', { headers: { Origin: `${origin}/not-an-origin` } }),
      await rawRequest(origin, '/api/openai/v1/models', { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
      await rawRequest(origin, '/api/openai/v1/%6dodels'),
      await rawRequest(origin, '/api/openai/v1/models?redirect=https://attacker.example'),
    ];
    expect(cases.map(item => item.status)).toEqual([404, 405, 415, 400, 413, 403, 403, 403, 403, 403, 404, 404]);
    expect(cases[1].headers.allow).toBe('GET');
    expect(cases.every(item => item.headers['access-control-allow-origin'] === undefined)).toBe(true);
    expect(upstreamRequests).toBe(0);
  }, { requestLimitBytes: 64 });
});

test('upstream errors, redirects, oversized responses, and timeouts are bounded and redacted', async () => {
  const responses = [
    (response: ServerResponse) => json(response, 401, { error: { message: 'credential dump must stay upstream' } }),
    (response: ServerResponse) => {
      response.writeHead(302, { Location: 'https://elsewhere.example/v1/models' });
      response.end();
    },
    (response: ServerResponse) => json(response, 200, { data: 'x'.repeat(1024) }),
    (response: ServerResponse) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('not JSON');
    },
    (response: ServerResponse) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{');
    },
    (response: ServerResponse) => setTimeout(() => json(response, 200, { data: [] }), 250),
  ];
  let index = 0;
  await gatewayFixture((_request, response) => responses[index++](response), async origin => {
    const unauthorized = await rawRequest(origin, '/api/openai/v1/models');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).not.toContain('credential dump');

    const redirect = await rawRequest(origin, '/api/openai/v1/models');
    expect(redirect.status).toBe(502);
    expect(redirect.body).toContain('redirects are not allowed');

    const oversized = await rawRequest(origin, '/api/openai/v1/models');
    expect(oversized.status).toBe(502);
    expect(oversized.body).toContain('size limit');

    const wrongMediaType = await rawRequest(origin, '/api/openai/v1/models');
    expect(wrongMediaType.status).toBe(502);
    expect(wrongMediaType.body).toContain('not JSON');

    const invalidJson = await rawRequest(origin, '/api/openai/v1/models');
    expect(invalidJson.status).toBe(502);
    expect(invalidJson.body).toContain('invalid JSON');

    const timeout = await rawRequest(origin, '/api/openai/v1/models');
    expect(timeout.status).toBe(504);
    expect(timeout.body).toContain('timed out');
  }, { timeoutMs: 50, responseLimitBytes: 256 });
});

test('caller disconnect aborts the corresponding upstream request', async () => {
  let upstreamStarted!: () => void;
  const started = new Promise<void>(resolve => { upstreamStarted = resolve; });
  let upstreamClosed!: () => void;
  const closed = new Promise<void>(resolve => { upstreamClosed = resolve; });
  await gatewayFixture((request, response) => {
    upstreamStarted();
    request.once('aborted', upstreamClosed);
    response.once('close', upstreamClosed);
  }, async origin => {
    const url = new URL('/api/openai/v1/models', origin);
    const request = httpRequest(url);
    request.on('error', () => undefined);
    request.end();
    await started;
    request.destroy();
    await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Upstream request was not aborted.')), 1000)),
    ]);
  });
});

test('Vite configureServer wiring uses the shared fixed-route handler', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'odd-index-vite-gateway-'));
  await writeFile(join(fixture, 'index.html'), '<h1>Vite fixture</h1>');
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls += 1;
    json(response, 200, { data: [{ id: 'vite-model' }] });
  });
  const upstreamOrigin = await listen(upstream);
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: false,
    envFile: false,
    root: fixture,
    logLevel: 'silent',
    plugins: [openAIGatewayPlugin({
      environment: { OPENAI_BASE_URL: `${upstreamOrigin}/v1` },
    })],
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  try {
    await vite.listen();
    const address = vite.httpServer?.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const result = await rawRequest(origin, '/api/openai/v1/models', { headers: { Origin: origin } });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: [{ id: 'vite-model' }] });
    expect(upstreamCalls).toBe(1);
  } finally {
    await vite.close();
    await closeServer(upstream);
    await rm(fixture, { recursive: true, force: true });
  }
});

test('upstream and port configuration reject unsafe or ambiguous values', () => {
  expect(validateUpstreamBaseUrl('http://127.0.0.1:8080/v1').href).toBe('http://127.0.0.1:8080/v1/');
  expect(validateUpstreamBaseUrl('https://models.example/v1').href).toBe('https://models.example/v1/');
  for (const value of [
    'http://models.example/v1',
    'ftp://127.0.0.1/v1',
    'https://user:secret@models.example/v1',
    'https://models.example/v1?key=secret',
    'https://models.example/v1#fragment',
  ]) {
    expect(() => validateUpstreamBaseUrl(value)).toThrow();
  }
  expect(parseGamePort(undefined)).toBe(4174);
  expect(parseGamePort('65535')).toBe(65535);
  for (const value of ['0', '65536', '-1', '1.5', 'port']) expect(() => parseGamePort(value)).toThrow();
});

test('standalone server serves root and collection-prefixed deep files without fallback or traversal', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'odd-index-gateway-'));
  const dist = join(fixture, 'dist');
  const outside = join(fixture, 'outside.txt');
  await mkdir(join(dist, 'projects', 'fixture'), { recursive: true });
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<h1>Root</h1>');
  await writeFile(join(dist, 'projects', 'fixture', 'index.html'), '<h1>Fixture</h1>');
  await writeFile(join(dist, 'assets', 'app-12345678.js'), 'console.log("fixture");');
  await writeFile(join(dist, 'package.json'), '{"private":true}');
  await writeFile(outside, 'outside');
  await symlink(outside, join(dist, 'escape.txt'));

  const gateway = createOpenAIGateway({ environment: { OPENAI_BASE_URL: 'http://127.0.0.1:9/v1' } });
  const games = await startGamesServer({ distRoot: dist, gateway, port: 0 });
  const address = games.server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    expect(address.address).toBe('127.0.0.1');
    const root = await rawRequest(origin, '/');
    const collection = await rawRequest(origin, '/collections/');
    const project = await rawRequest(origin, '/collections/projects/fixture/');
    const unprefixedProject = await rawRequest(origin, '/projects/fixture/');
    const asset = await rawRequest(origin, '/collections/assets/app-12345678.js', { method: 'HEAD' });
    expect([root.body, collection.body]).toEqual(['<h1>Root</h1>', '<h1>Root</h1>']);
    expect([project.body, unprefixedProject.body]).toEqual(['<h1>Fixture</h1>', '<h1>Fixture</h1>']);
    expect(asset.status).toBe(200);
    expect(asset.body).toBe('');
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const [path, location] of [
      ['/collections', '/collections/'],
      ['/projects/fixture', '/projects/fixture/'],
      ['/collections/projects/fixture', '/collections/projects/fixture/'],
      ['/collections/projects/fixture?scene=1', '/collections/projects/fixture/?scene=1'],
    ]) {
      const redirect = await rawRequest(origin, path);
      expect(redirect.status).toBe(308);
      expect(redirect.headers.location).toBe(location);
      expect((await rawRequest(origin, location)).status).toBe(200);
    }

    const blocked = [
      await rawRequest(origin, '/missing/path'),
      await rawRequest(origin, '/%2e%2e/outside.txt'),
      await rawRequest(origin, '/escape.txt'),
      await rawRequest(origin, '/package.json'),
    ];
    expect(blocked.map(item => item.status)).toEqual([404, 400, 404, 404]);
    expect(await rawRequest(origin, '/', { method: 'POST' })).toMatchObject({ status: 405 });
    expect(await rawRequest(origin, '/', { headers: { Host: 'attacker.example' } })).toMatchObject({ status: 403 });
    expect(await rawRequest(origin, '/', { headers: { Origin: 'https://attacker.example' } })).toMatchObject({ status: 403 });
  } finally {
    await games.close();
    await rm(fixture, { recursive: true, force: true });
  }
  expect(games.server.listening).toBe(false);
});

test('standalone construction gives a build-first error when dist is absent', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'odd-index-missing-dist-'));
  try {
    expect(() => createGamesServer({ distRoot: join(fixture, 'dist') })).toThrow('Run "npm run build" first.');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
