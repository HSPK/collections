import type { Page } from '@playwright/test';
import { isRecord } from '../../src/core/agents/schema';
import { CONNECTION_STORAGE_KEY } from '../../src/core/agents/config';

export interface FixtureTurn {
  index: number;
  model: string;
  tool: string;
  observation: Record<string, unknown>;
  messages: unknown[];
}

export function nativeToolResponse(tool: string, plan: unknown, id = 'fixture-call') {
  return {
    id: 'fixture-completion',
    choices: [{
      index: 0, finish_reason: 'tool_calls',
      message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: tool, arguments: JSON.stringify(plan) } }] },
    }],
    usage: { prompt_tokens: 40, completion_tokens: 30 },
  };
}

export async function configureFixtureConnection(page: Page) {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, endpoint: `${location.origin}/api/openai/v1`, model: 'fixture-tool-model' }));
  }, { key: CONNECTION_STORAGE_KEY });
}

export async function installAgentFixture(
  page: Page,
  decide: (turn: FixtureTurn) => unknown | Promise<unknown>,
): Promise<FixtureTurn[]> {
  await configureFixtureConnection(page);
  const calls: FixtureTurn[] = [];
  await page.route('**/api/openai/v1/chat/completions', async route => {
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body) || !Array.isArray(body.messages) || !Array.isArray(body.tools) ||
        body.tools.length !== 1 || typeof body.model !== 'string') throw new Error('Invalid game API fixture request.');
    const tool = body.tools[0];
    const observationMessage = body.messages[1];
    if (!isRecord(tool) || !isRecord(tool.function) || typeof tool.function.name !== 'string' ||
        !isRecord(observationMessage) || typeof observationMessage.content !== 'string') {
      throw new Error('The game did not send a native tool and observation.');
    }
    const observation: unknown = JSON.parse(observationMessage.content);
    if (!isRecord(observation)) throw new Error('The game fixture observation must be an object.');
    const turn: FixtureTurn = { index: calls.length, model: body.model, tool: tool.function.name, observation, messages: body.messages };
    calls.push(turn);
    const plan = await decide(turn);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nativeToolResponse(turn.tool, plan, `fixture-${turn.index}`)) });
  });
  return calls;
}
