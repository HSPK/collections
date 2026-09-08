import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAgent } from '../src/core/agents/client';
import type { AgentRequest } from '../src/core/agents/client';
import { DEFAULT_LOCAL_MODEL } from '../src/core/agents/config';
import { isRecord } from '../src/core/agents/schema';

const ids = [
  'ghost-courier', 'custodian', 'mnemosyne', 'accord', 'graft',
  'sigil', 'afterlight', 'mise', 'chorus', 'takes',
  'emberwake', 'borrowed-names', 'verdant-oath', 'iron-choir', 'tidebound-house',
];
const endpoint = process.env.ODD_MODEL_BASE_URL;

interface SmokeCase {
  request: AgentRequest<unknown>;
  verify(plan: unknown): void;
}

function isSmokeCase(value: unknown): value is SmokeCase {
  if (!isRecord(value) || typeof value.verify !== 'function' || !isRecord(value.request)) return false;
  const request = value.request;
  const tool = request.tool;
  return typeof request.system === 'string' && 'observation' in request && typeof request.validate === 'function' &&
    isRecord(tool) && typeof tool.name === 'string' && typeof tool.description === 'string' &&
    typeof tool.parse === 'function' && typeof tool.summarize === 'function' &&
    isRecord(tool.parameters) && tool.parameters.type === 'object' && tool.parameters.additionalProperties === false &&
    isRecord(tool.parameters.properties) && Array.isArray(tool.parameters.required) &&
    tool.parameters.required.every(key => typeof key === 'string');
}

test.describe('Opt-in real model turns', () => {
  test.skip(!endpoint, 'Set ODD_MODEL_BASE_URL explicitly to run billed, serial real-model smoke turns. CI uses deterministic native-tool fixtures instead.');
  for (const id of ids) {
    test(`${id}: the configured model commits a mechanically valid opening decision`, async () => {
      test.setTimeout(75_000);
      const url = pathToFileURL(resolve(`src/projects/${id}/agent.ts`)).href;
      const module: unknown = await import(url);
      if (!isRecord(module) || typeof module.smokeCase !== 'function') throw new Error(`${id} does not expose its pure model smoke scenario.`);
      const scenario: unknown = module.smokeCase();
      if (!isSmokeCase(scenario)) throw new Error(`${id} returned an invalid model smoke scenario.`);
      const controller = new AbortController();
      try {
        const result = await runAgent({
          version: 1, endpoint: endpoint!, model: process.env.ODD_MODEL_ID || DEFAULT_LOCAL_MODEL, apiKey: '',
        }, scenario.request, controller.signal);
        scenario.verify(result.plan);
        expect(result.requests).toBeGreaterThanOrEqual(1);
        expect(result.requests).toBeLessThanOrEqual(2);
        expect(result.summary.trim()).not.toBe('');
        console.info(`${id}: accepted ${result.requests} native-tool request${result.requests === 1 ? '' : 's'}; opening engine transition verified.`);
      } finally {
        controller.abort();
      }
    });
  }
});
