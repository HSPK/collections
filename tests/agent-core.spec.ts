import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AgentError, AgentValidationError, requireRule } from '../src/core/agents/errors';
import { runAgent, listModels } from '../src/core/agents/client';
import { normalizeEndpoint, defaultConnection } from '../src/core/agents/config';
import type { AgentConnection } from '../src/core/agents/config';
import { defineTool, schema, object, integer, text, isRecord } from '../src/core/agents/schema';
import { GameSession } from '../src/core/games/session';
import { installAgentFixture, nativeToolResponse } from './helpers/agent-fixtures';

const tool = defineTool({
  name: 'take_step',
  description: 'Move one legal step in a fictional board game.',
  parameters: schema.object({ step: schema.integer(1, 3), intention: schema.string() }),
  parse(value: unknown) {
    const item = object(value, ['step', 'intention']);
    return { step: integer(item.step, 'Step', 1, 3), intention: text(item.intention, 'Intention', 100) };
  },
  summarize: plan => plan.intention,
});
const request = {
  system: 'Play a small fictional board game. Take one step of size one.',
  observation: { position: 0, remaining: 3, legalSteps: [1] },
  tool,
  validate(plan: ReturnType<typeof tool.parse>) { requireRule(plan.step === 1, 'Only a step of one is legal now.'); },
};

async function apiFixture(
  respond: (body: Record<string, unknown>, index: number) => { status?: number; value?: unknown; raw?: string; delay?: number },
  use: (connection: AgentConnection, bodies: Record<string, unknown>[]) => Promise<void>,
) {
  const bodies: Record<string, unknown>[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!isRecord(value)) throw new Error('Expected an object fixture request.');
    const reply = respond(value, bodies.length);
    bodies.push(value);
    const send = () => {
      if (outgoing.destroyed) return;
      outgoing.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      outgoing.end(reply.raw ?? JSON.stringify(reply.value));
    };
    if (reply.delay) {
      const timer = setTimeout(() => { timers.delete(timer); send(); }, reply.delay);
      timers.add(timer);
    } else send();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const connection: AgentConnection = { version: 1, endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'fixture-tools', apiKey: '' };
  try {
    await use(connection, bodies);
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('agent endpoints require secure transport, reject credentials, and never invent a public local connection', () => {
  expect(normalizeEndpoint(' /api/openai/v1/ ', 'http://localhost:4173/projects/game/')).toBe('http://localhost:4173/api/openai/v1');
  expect(normalizeEndpoint('https://models.example/v1/', 'https://example.org')).toBe('https://models.example/v1');
  for (const value of ['http://models.example/v1', 'https://user:secret@models.example/v1', 'https://models.example/v1?key=x',
    'https://models.example/v1#secret', 'javascript:alert(1)', 'file:///tmp/key']) {
    expect(() => normalizeEndpoint(value, 'https://example.org')).toThrow(AgentError);
  }
  expect(defaultConnection('https://hspk.github.io/collections/projects/game/').endpoint).toBe('');
  expect(defaultConnection('http://127.0.0.1:4174/projects/game/').endpoint).toBe('http://127.0.0.1:4174/api/openai/v1');
});

test('native tool requests are bounded and return only a parsed public plan', async () => {
  await apiFixture(() => ({ value: {
    ...nativeToolResponse('take_step', { step: 1, intention: 'Move toward the lamp.' }),
    reasoning_content: 'Provider-private field must not be surfaced.',
  } }), async (connection, bodies) => {
    const result = await runAgent(connection, request, new AbortController().signal);
    expect(result).toEqual({ plan: { step: 1, intention: 'Move toward the lamp.' }, summary: 'Move toward the lamp.', requests: 1, inputTokens: 40, outputTokens: 30 });
    expect(bodies[0]).toMatchObject({ stream: false, parallel_tool_calls: false, max_completion_tokens: 1536, tool_choice: { type: 'function', function: { name: 'take_step' } } });
    expect(JSON.stringify(result)).not.toContain('Provider-private');
  });
});

test('an illegal agent plan receives one tool-feedback correction with no intermediate acceptance', async () => {
  const progress: number[] = [];
  await apiFixture((_, index) => ({ value: nativeToolResponse('take_step', { step: index === 0 ? 3 : 1, intention: 'Stay on the legal path.' }) }), async (connection, bodies) => {
    const result = await runAgent(connection, request, new AbortController().signal, value => progress.push(value.attempt));
    expect(result.requests).toBe(2);
    expect(result.plan.step).toBe(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages).toMatchObject([
      { role: 'system' }, { role: 'user' },
      { role: 'assistant', tool_calls: [{ function: { name: 'take_step' } }] },
      { role: 'tool', content: expect.stringContaining('Only a step of one is legal now.') },
    ]);
    expect(progress).toEqual([1, 2]);
  });
});

test('two illegal plans fail explicitly without an unbounded repair loop', async () => {
  await apiFixture(() => ({ value: nativeToolResponse('take_step', { step: 3, intention: 'An illegal shortcut.' }) }), async (connection, bodies) => {
    await expect(runAgent(connection, request, new AbortController().signal)).rejects.toThrow('illegal plan twice');
    expect(bodies).toHaveLength(2);
  });
});

test('unknown tools, missing calls, empty responses, refusals, truncation and oversized replies are rejected', async () => {
  const cases = [
    { value: nativeToolResponse('execute_code', { step: 1, intention: 'Not a legal tool.' }) },
    { value: { choices: [{ message: { role: 'assistant', content: 'I moved without a tool.' } }] } },
    { raw: '' },
    { value: { choices: [{ message: { refusal: 'No' } }] } },
    { value: { choices: [{ finish_reason: 'length', message: {} }] } },
    { raw: 'x'.repeat(513 * 1024) },
  ];
  for (const reply of cases) {
    await apiFixture(() => reply, async (connection, bodies) => {
      await expect(runAgent(connection, request, new AbortController().signal)).rejects.toBeInstanceOf(AgentError);
      expect(bodies).toHaveLength(1);
    });
  }
});

test('HTTP failures do not expose provider text or credentials and do not auto-retry', async () => {
  await apiFixture(() => ({ status: 401, value: { error: { message: 'Provider echoed test-secret-token' } } }), async (connection, bodies) => {
    await expect(runAgent(connection, request, new AbortController().signal)).rejects.toThrow('HTTP 401');
    expect(bodies).toHaveLength(1);
    try {
      await runAgent(connection, request, new AbortController().signal);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect(String(error)).not.toContain('test-secret-token');
    }
  });
});

test('successful provider responses cannot smuggle the in-memory key into a saved game plan', async () => {
  const key = 'fixture-memory-only-key';
  await apiFixture(() => ({ value: nativeToolResponse('take_step', { step: 1, intention: `The server echoed ${key}.` }) }), async connection => {
    await expect(runAgent({ ...connection, apiKey: key }, request, new AbortController().signal)).rejects.toThrow('credential');
  });
});

test('deadlines and caller cancellation abort an outstanding response rather than accepting it later', async () => {
  await apiFixture(() => ({ delay: 1000, value: nativeToolResponse('take_step', { step: 1, intention: 'Late step.' }) }), async connection => {
    await expect(runAgent(connection, request, new AbortController().signal, undefined, 30)).rejects.toThrow('time limit');
    const controller = new AbortController();
    const turn = runAgent(connection, request, controller.signal);
    controller.abort();
    await expect(turn).rejects.toMatchObject({ code: 'cancelled' });
  });
});

test('model listing validates and deduplicates IDs without returning server ownership metadata', async () => {
  await apiFixture(() => ({ value: { data: [{ id: 'model-b', owned_by: 'not-public-game-data' }, { id: 'model-a' }, { id: 'model-b' }] } }), async connection => {
    expect(await listModels(connection, new AbortController().signal)).toEqual(['model-a', 'model-b']);
  });
});

const game = {
  id: 'fixture-game',
  create: (seed: number) => ({ position: seed, remaining: 3 }),
  parseCommand(value: unknown) {
    const item = object(value, ['step']);
    return { step: integer(item.step, 'Step', 1, 2) };
  },
  reduce(state: { position: number; remaining: number }, command: { step: number }) {
    requireRule(state.remaining >= command.step, 'Not enough moves remain.');
    return { position: state.position + command.step, remaining: state.remaining - command.step };
  },
};

test('replay sessions keep previews pure, restore atomically, reject forged phases, and advance monotonic revisions', () => {
  const session = new GameSession(game, 10);
  expect(session.preview({ step: 2 })).toEqual({ position: 12, remaining: 1 });
  expect(session.state).toEqual({ position: 10, remaining: 3 });
  session.dispatch({ step: 2 });
  const saved = session.serialize();
  session.reset(2);
  session.restore(saved);
  expect(session.revision).toBe(3);
  expect(session.state).toEqual({ position: 12, remaining: 1 });
  const forged: unknown = JSON.parse(saved);
  if (!isRecord(forged)) throw new Error('Invalid fixture.');
  const before = session.serialize();
  expect(() => session.restore(JSON.stringify({ ...forged, commands: [{ step: 2 }, { step: 2 }] }))).toThrow(AgentValidationError);
  expect(session.serialize()).toBe(before);
  expect(session.revision).toBe(3);
  expect(() => session.restore(JSON.stringify({ ...forged, game: 'other-game' }))).toThrow('different game');
  expect(() => session.restore(JSON.stringify({ ...forged, state: { position: 999 } }))).toThrow('unexpected fields');
  session.dispatch({ step: 1 });
  expect(session.state.remaining).toBe(0);
  expect(() => session.dispatch({ step: 1 })).toThrow('Not enough');
});

async function consoleFixture(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    const agentPath = '/src/core/agents/index.ts';
    const pagePath = '/src/core/page.ts';
    const { createAgentConsole, defineTool, schema, object, integer, text, requireRule }: typeof import('../src/core/agents/index') = await import(agentPath);
    const { createProjectPage, query }: typeof import('../src/core/page') = await import(pagePath);
    const controller = new AbortController();
    const lifecycle = createProjectPage({
      container: document.body, controls: document.createElement('div'), signal: controller.signal, reducedMotion: true,
      report: message => { lifecycle.root.dataset.lastError = message; },
    }, 'agent-fixture');
    lifecycle.root.style.cssText = 'position:fixed;inset:0;z-index:100;background:#f5f1e8;color:#202b31;padding:20px;display:flex;flex-direction:column;gap:20px';
    lifecycle.root.innerHTML = '<h1>Agent fixture</h1><div data-console></div><button data-turn>Request turn</button><button data-world>Change world</button><button data-reset>Reset game</button><button data-dispose>Dispose</button><output data-position>0</output>';
    let position = 0, revision = 0;
    const agent = createAgentConsole(lifecycle, { gameId: 'agent-fixture', host: query(lifecycle.root, '[data-console]') });
    const tool = defineTool({
      name: 'take_step',
      description: 'A legal fictional board-game step.',
      parameters: schema.object({ step: schema.integer(1, 3), intention: schema.string() }),
      parse(value: unknown) {
        const entry = object(value, ['step', 'intention']);
        return { step: integer(entry.step, 'Step', 1, 3), intention: text(entry.intention, 'Intention', 100) };
      },
      summarize: plan => plan.intention,
    });
    query(lifecycle.root, '[data-turn]').addEventListener('click', () => {
      void agent.turn({
        label: 'Clockwork guard', system: 'Play one step of the fictional game.', observation: { position },
        tool, validate: plan => requireRule(plan.step === 1, 'Only step one is legal.'),
        getRevision: () => revision,
        commit(plan) {
          position += plan.step; revision++;
          query(lifecycle.root, '[data-position]').textContent = String(position);
        },
      });
    }, { signal: lifecycle.signal });
    query(lifecycle.root, '[data-world]').addEventListener('click', () => { revision++; }, { signal: lifecycle.signal });
    query(lifecycle.root, '[data-reset]').addEventListener('click', () => {
      agent.cancel(); revision++; position = 0; query(lifecycle.root, '[data-position]').textContent = '0';
    }, { signal: lifecycle.signal });
    query(lifecycle.root, '[data-dispose]').addEventListener('click', () => lifecycle.destroy(), { signal: lifecycle.signal });
  });
}

test('agent console commits real native-tool results, displays escaped public actions, and keeps settings private', async ({ page }) => {
  const calls = await installAgentFixture(page, () => ({ step: 1, intention: '<img src=x onerror=alert(1)> Move to the lamp.' }));
  await consoleFixture(page);
  expect(calls).toHaveLength(0);
  const root = page.locator('.project-agent-fixture');
  await root.getByRole('button', { name: 'Request turn', exact: true }).click();
  await expect(root.locator('[data-position]')).toHaveText('1');
  expect(calls).toHaveLength(1);
  await root.getByRole('button', { name: 'Agent action log', exact: true }).click();
  const log = root.getByRole('dialog', { name: 'Agent action log', exact: true });
  await expect(log).toContainText('<img src=x onerror=alert(1)>');
  await expect(log.locator('img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await root.getByRole('button', { name: 'Model settings', exact: true }).click();
  const dialog = root.getByRole('dialog', { name: 'Model connection', exact: true });
  await dialog.getByLabel('API key', { exact: true }).fill('fixture-memory-only-key');
  await dialog.getByRole('button', { name: 'Save connection', exact: true }).click();
  await expect(dialog.locator('[data-agent-settings-status]')).toContainText('Connection saved');
  const stores = await page.evaluate(() => `${JSON.stringify(localStorage)} ${JSON.stringify(sessionStorage)}`);
  expect(stores).not.toContain('fixture-memory-only-key');
  expect(calls).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Forget key', exact: true }).click();
  await expect(dialog.locator('[data-agent-settings-status]')).toContainText('forgotten');
});

test('revision changes discard otherwise legal late agent plans and resets cancel ownership', async ({ page }) => {
  const releases: (() => void)[] = [];
  await installAgentFixture(page, async () => {
    await new Promise<void>(resolve => { releases.push(resolve); });
    return { step: 1, intention: 'A late move.' };
  });
  await consoleFixture(page);
  const root = page.locator('.project-agent-fixture');
  await root.getByRole('button', { name: 'Request turn', exact: true }).click();
  await expect.poll(() => releases.length).toBe(1);
  await root.getByRole('button', { name: 'Change world', exact: true }).click();
  releases[0]();
  await expect(root.locator('[data-agent-status]')).toContainText('stale plan was discarded');
  await expect(root.locator('[data-position]')).toHaveText('0');
  await root.getByRole('button', { name: 'Request turn', exact: true }).click();
  await expect.poll(() => releases.length).toBe(2);
  await root.getByRole('button', { name: 'Reset game', exact: true }).click();
  releases[1]();
  await expect(root).toHaveAttribute('data-agent-busy', 'false');
  await expect(root.locator('[data-position]')).toHaveText('0');
  await expect(root.locator('[data-agent-status]')).toContainText('cancelled');
});

test('connection errors remain inside the model dialog and keyboard focus does not escape it', async ({ page }) => {
  await installAgentFixture(page, () => ({ step: 1, intention: 'A move.' }));
  await consoleFixture(page);
  const root = page.locator('.project-agent-fixture');
  await root.getByRole('button', { name: 'Model settings', exact: true }).click();
  const dialog = root.getByRole('dialog', { name: 'Model connection', exact: true });
  await dialog.getByLabel('Endpoint', { exact: true }).fill('https://user:key@example.com/v1');
  await dialog.getByRole('button', { name: 'Save connection', exact: true }).click();
  await expect(dialog.locator('[data-agent-settings-status]')).toContainText('cannot contain credentials');
  await dialog.getByRole('button', { name: 'Close Model connection', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Forget key', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(root.getByRole('button', { name: 'Model settings', exact: true })).toBeFocused();
});

for (const change of ['edit endpoint', 'save connection', 'forget key'] as const) {
  test(`pending model lists are invalidated when users ${change}`, async ({ page }) => {
    await installAgentFixture(page, () => ({ step: 1, intention: 'A move.' }));
    const releases: (() => void)[] = [];
    let responseSent = false;
    await page.route('**/api/openai/v1/models', async route => {
      await new Promise<void>(resolve => releases.push(resolve));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'old-endpoint-model' }] }),
      });
      responseSent = true;
    });
    await consoleFixture(page);
    const root = page.locator('.project-agent-fixture');
    await root.getByRole('button', { name: 'Model settings', exact: true }).click();
    const dialog = root.getByRole('dialog', { name: 'Model connection', exact: true });
    await dialog.getByRole('button', { name: 'Fetch models', exact: true }).click();
    await expect.poll(() => releases.length).toBe(1);
    if (change === 'edit endpoint') await dialog.getByLabel('Endpoint', { exact: true }).fill('https://new-endpoint.example/v1');
    if (change === 'save connection') await dialog.getByRole('button', { name: 'Save connection', exact: true }).click();
    if (change === 'forget key') await dialog.getByRole('button', { name: 'Forget key', exact: true }).click();
    releases[0]();
    await expect.poll(() => responseSent).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Fetch models', exact: true })).toBeEnabled();
    await expect(dialog.locator('datalist option')).toHaveCount(0);
    await expect(dialog.locator('[data-agent-settings-status]')).not.toContainText('model IDs loaded');
  });
}
