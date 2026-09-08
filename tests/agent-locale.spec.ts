import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { AgentLocale } from '../src/core/agents/locale';
import { agentLocale } from '../src/core/agents/locale';
import { AgentError } from '../src/core/agents/errors';
import { CONNECTION_STORAGE_KEY } from '../src/core/agents/config';
import { installAgentFixture, nativeToolResponse } from './helpers/agent-fixtures';

const replay = (position = 1) => JSON.stringify({
  format: 'odd-index-game', version: 1, game: 'locale-fixture', seed: 0,
  commands: Array.from({ length: position }, () => ({ step: 1 })),
});
const saveKey = 'odd-index:game:locale-fixture:v1';

async function fixture(page: Page, locale?: AgentLocale, stored?: string) {
  // Mount only source modules, with no index app or live HMR connection.
  await page.routeWebSocket('**', () => {});
  await page.context().route('**/api/openai/v1/**', route => route.abort('blockedbyclient'));
  await page.route('**/agent-locale-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  }));
  await page.goto('./agent-locale-fixture');
  await page.evaluate(async ({ locale, stored, saveKey }) => {
    const agentPath = '/src/core/agents/index.ts';
    const pagePath = '/src/core/page.ts';
    const notebookPath = '/src/core/games/notebook.ts';
    const sessionPath = '/src/core/games/session.ts';
    const agents: typeof import('../src/core/agents/index') = await import(agentPath);
    const { createAgentConsole, defineTool, schema, object, integer, text } = agents;
    const { createProjectPage, query }: typeof import('../src/core/page') = await import(pagePath);
    const { createGameNotebook }: typeof import('../src/core/games/notebook') = await import(notebookPath);
    const { GameSession }: typeof import('../src/core/games/session') = await import(sessionPath);
    if (stored !== undefined) localStorage.setItem(saveKey, JSON.stringify(stored));
    const controller = new AbortController();
    const lifecycle = createProjectPage({
      container: document.body, controls: document.createElement('div'), signal: controller.signal, reducedMotion: true,
      report: message => { lifecycle.root.dataset.lastError = message; },
    }, 'locale-fixture');
    const root = lifecycle.root;
    root.style.cssText = 'position:fixed;inset:0;box-sizing:border-box;background:#f5f1e8;color:#202b31;padding:12px;display:flex;flex-direction:column;gap:12px;font:16px system-ui;overflow:auto';
    root.innerHTML = '<h1 style="font-size:22px;margin:0">语言测试</h1><div data-console></div><button data-turn>请求回合</button><button data-notebook>打开手记</button><output data-position>0</output>';
    const session = new GameSession({
      id: 'locale-fixture',
      create: (seed: number) => ({ position: seed }),
      parseCommand(value: unknown) {
        const item = object(value, ['step']);
        return { step: integer(item.step, 'Step', 1, 3) };
      },
      reduce(state: { position: number }, command: { step: number }) {
        agents.requireRule(command.step === 1, 'Only step one is legal.');
        return { position: state.position + command.step };
      },
    }, 0);
    const agent = createAgentConsole(lifecycle, {
      gameId: 'locale-fixture', host: query(root, '[data-console]'), ...(locale ? { locale } : {}),
      onBusyChange: busy => { root.dataset.busyCallback = String(busy); },
    });
    const tool = defineTool({
      name: 'take_step', description: '走一步。',
      parameters: schema.object({ step: schema.integer(1, 3), intention: schema.string() }),
      parse(value: unknown) {
        const item = object(value, ['step', 'intention']);
        return { step: integer(item.step, 'Step', 1, 3), intention: text(item.intention, 'Intention', 100) };
      },
      summarize: plan => plan.intention,
    });
    function render() {
      query(root, '[data-position]').textContent = String(session.state.position);
      root.dataset.replay = session.serialize();
    }
    lifecycle.onCleanup(session.subscribe(render));
    query(root, '[data-turn]').addEventListener('click', () => {
      void agent.turn({
        label: '守灯人', system: '沿合法路线前进一步。', observation: { position: session.state.position },
        tool, validate: plan => { session.preview({ step: plan.step }); },
        getRevision: () => session.revision,
        commit: plan => { session.dispatch({ step: plan.step }); },
      }).then(result => { root.dataset.turnResult = String(result); });
    }, { signal: lifecycle.signal });
    root.addEventListener('change-world', () => session.reset(session.state.position), { signal: lifecycle.signal });
    root.addEventListener('accept-move', () => session.dispatch({ step: 1 }), { signal: lifecycle.signal });
    root.addEventListener('reset-game', () => { agent.cancel(); session.reset(0); }, { signal: lifecycle.signal });
    root.addEventListener('dispose-fixture', () => lifecycle.destroy(), { signal: lifecycle.signal });
    createGameNotebook(lifecycle, {
      gameId: 'locale-fixture', session, trigger: query(root, '[data-notebook]'), ...(locale ? { locale } : {}),
      beforeRestore: () => { agent.cancel(); }, afterRestore: render,
      onNotice: message => { root.dataset.notice = message; },
    });
    render();
  }, { locale, stored, saveKey });
  return page.locator('.project-locale-fixture');
}

test('locale omission and explicit en preserve English controls, copy, selectors and replay notices', async ({ page }) => {
  for (const locale of [undefined, 'en'] as const) {
    const root = await fixture(page, locale);
    await expect(root.locator('[data-agent-connect]')).toHaveText('Model');
    await expect(root.locator('[data-agent-log]')).toHaveText('Log');
    await expect(root.locator('[data-agent-cancel]')).toHaveText('Cancel');
    await expect(root.locator('[data-agent-status]')).toHaveText('Model required. Ready when you are.');
    await root.getByRole('button', { name: 'Model settings', exact: true }).click();
    const settings = root.getByRole('dialog', { name: 'Model connection', exact: true });
    await expect(settings).toHaveAttribute('id', 'locale-fixture-model-connection');
    await expect(settings.getByLabel('Endpoint', { exact: true })).toBeVisible();
    await expect(settings.getByLabel('Model', { exact: true })).toHaveAttribute('list', 'locale-fixture-available-models');
    await expect(settings.getByLabel('API key', { exact: true })).toHaveAttribute('placeholder', 'Optional; memory only');
    await expect(settings.locator('[data-agent-settings-status]')).toHaveText('Only the endpoint and model preference are saved. Keys are never stored.');
    await expect(settings.getByRole('button', { name: 'Fetch models', exact: true })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Save connection', exact: true })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Forget key', exact: true })).toBeVisible();
    await settings.getByRole('button', { name: 'Close Model connection', exact: true }).click();
    await root.getByRole('button', { name: 'Agent action log', exact: true }).click();
    const log = root.getByRole('dialog', { name: 'Agent action log', exact: true });
    await expect(log).toContainText('No model turns yet.');
    await expect(log).toContainText('Public intentions and accepted game actions only. No private model reasoning is requested or displayed.');
    await page.keyboard.press('Escape');
    await root.dispatchEvent('accept-move');
    await root.locator('[data-notebook]').click();
    const notebook = root.getByRole('dialog', { name: 'Game notebook', exact: true });
    await expect(notebook.locator('[data-game-save-status]')).toHaveText('1 accepted moves saved in this browser.');
    await expect(notebook.getByRole('button', { name: 'Export replay', exact: true })).toBeVisible();
    await expect(notebook.getByLabel('Import a replay', { exact: true })).toBeVisible();
    await notebook.getByRole('button', { name: 'Close Game notebook', exact: true }).click();
    await root.dispatchEvent('dispose-fixture');
    await page.evaluate(() => localStorage.clear());
  }
});

for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 480 }]) {
  test(`locale Chinese settings and notebook fit ${viewport.width}x${viewport.height} with native focus ownership`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const calls = await installAgentFixture(page, () => ({ step: 1, intention: '向灯塔前进。' }));
    const root = await fixture(page, 'zh-CN');
    await expect(root.locator('[data-agent-connect]')).toHaveText('模型');
    await expect(root.locator('[data-agent-log]')).toHaveText('日志');
    await expect(root.locator('[data-agent-cancel]')).toHaveText('取消');
    await expect(root.locator('[data-agent-status]')).toHaveText('需要模型，准备好后即可开始。');
    const trigger = root.getByRole('button', { name: '模型设置', exact: true });
    await trigger.click();
    const settings = root.getByRole('dialog', { name: '模型连接', exact: true });
    await expect(settings).toContainText('只有主动请求回合或获取模型列表时，才会发送请求');
    await expect(settings).toContainText('最多发送两次有界请求');
    await expect(settings).toContainText('刷新后即消失，绝不会写入存储或导出');
    await expect(settings.locator('[data-agent-settings-status]')).toHaveText('仅保存服务地址和模型偏好，绝不存储密钥。');
    await settings.getByRole('button', { name: '关闭 模型连接', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(settings.getByRole('button', { name: '清除密钥', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(settings.getByRole('button', { name: '关闭 模型连接', exact: true })).toBeFocused();
    for (const control of await settings.locator('button, input').all()) {
      await control.scrollIntoViewIfNeeded();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(await control.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    const notebookTrigger = root.locator('[data-notebook]');
    await notebookTrigger.click();
    const notebook = root.getByRole('dialog', { name: '游戏手记', exact: true });
    await expect(notebook).toContainText('游戏进度都会自动保存在此浏览器中');
    await expect(notebook).toContainText('导入会取消进行中的模型计划，且绝不会联系模型');
    await notebook.getByRole('button', { name: '关闭 游戏手记', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(notebook.getByRole('button', { name: '选择回放文件', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(notebook.getByRole('button', { name: '关闭 游戏手记', exact: true })).toBeFocused();
    expect(await notebook.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const button of await notebook.getByRole('button').all()) {
      expect(await button.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    await notebook.getByRole('button', { name: '关闭 游戏手记', exact: true }).click();
    await expect(notebookTrigger).toBeFocused();
    expect(calls).toHaveLength(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('locale Chinese connection validation, discovery, privacy and forget keep connection semantics', async ({ page }) => {
  const calls = await installAgentFixture(page, () => ({ step: 1, intention: '前进。' }));
  let modelLists = 0;
  await page.route('**/api/openai/v1/models', route => {
    modelLists++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: '中文模型' }, { id: 'fixture-tool-model' }, { id: '中文模型' }] }) });
  });
  const root = await fixture(page, 'zh-CN');
  await root.locator('[data-agent-connect]').click();
  const settings = root.getByRole('dialog', { name: '模型连接', exact: true });
  const status = settings.locator('[data-agent-settings-status]');
  const endpoint = settings.getByLabel('服务地址', { exact: true });
  const original = await endpoint.inputValue();
  await endpoint.fill('');
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  expect(await endpoint.evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('请输入模型服务地址。');
  await endpoint.fill('not-a-url');
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  expect(await endpoint.evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('请输入有效的服务地址 URL。');
  await endpoint.fill('https://models.example/v1?key=invalid');
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(status).toHaveText('模型配置无效，请检查连接设置和游戏请求。 技术详情：Endpoint URLs cannot contain credentials, query parameters, or fragments.');
  await endpoint.fill(original);
  const model = settings.getByLabel('模型', { exact: true });
  await model.fill('');
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  expect(await model.evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('请输入模型 ID。');
  await model.fill('fixture-tool-model');
  await settings.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await expect(status).toHaveText('已加载 2 个模型 ID。请选择支持函数工具的文本模型，然后保存。出现在列表中并不代表支持工具调用。');
  await expect(model).toBeFocused();
  await expect(settings.locator('datalist option')).toHaveCount(2);
  await settings.getByLabel('API 密钥', { exact: true }).fill('fixture-memory-only-key');
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(status).toHaveText('连接已保存。请选择游戏行动以请求模型回合。');
  await expect(settings.getByLabel('API 密钥', { exact: true })).toHaveValue('');
  const stores = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(JSON.stringify(stores)).not.toContain('fixture-memory-only-key');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), CONNECTION_STORAGE_KEY)).toEqual({
    version: 1, endpoint: original, model: 'fixture-tool-model',
  });
  await page.keyboard.press('Escape');
  await root.locator('[data-agent-connect]').click();
  await expect(status).toHaveText('当前标签页的内存中已保留此服务地址的密钥。');
  await settings.getByRole('button', { name: '清除密钥', exact: true }).click();
  await expect(status).toHaveText('已清除内存中的密钥，服务器仍可能提供自身的身份验证。');
  await page.keyboard.press('Escape');
  await root.locator('[data-agent-connect]').click();
  await expect(status).toHaveText('仅保存服务地址和模型偏好，绝不存储密钥。');
  expect(modelLists).toBe(1);
  expect(calls).toHaveLength(0);
});

test('locale Chinese corrections and public logs preserve authored text and native request bounds', async ({ page }) => {
  const releases: (() => void)[] = [];
  const intention = '<img src=x onerror=alert(1)> 沿灯火前进。';
  const calls = await installAgentFixture(page, async turn => {
    await new Promise<void>(resolve => releases.push(resolve));
    return { step: turn.index === 0 ? 3 : 1, intention };
  });
  const root = await fixture(page, 'zh-CN');
  await root.locator('[data-agent-log]').click();
  const log = root.getByRole('dialog', { name: '角色行动日志', exact: true });
  await expect(log).toContainText('尚未请求模型回合。');
  await page.keyboard.press('Escape');
  await root.locator('[data-turn]').click();
  await expect.poll(() => releases.length).toBe(1);
  await expect(root.locator('[data-agent-status]')).toHaveText('守灯人：正在请求计划（1/2）。');
  await expect(root.getByRole('button', { name: '取消', exact: true })).toBeVisible();
  await root.locator('[data-turn]').click();
  await expect(root.locator('[data-agent-status]')).toHaveText('模型回合正在进行，请等待完成或选择“取消”。');
  releases[0]();
  await expect.poll(() => releases.length).toBe(2);
  await expect(root.locator('[data-agent-status]')).toHaveText('守灯人：正在纠正违反规则的计划（2/2）。');
  await root.locator('[data-agent-log]').click();
  await expect(log.locator('li')).toHaveCount(0);
  releases[1]();
  await expect(root.locator('[data-position]')).toHaveText('1');
  await expect(log.locator('li[data-outcome=accepted]')).toHaveCount(1);
  await expect(log).toContainText('仅记录公开意图和已接受的游戏行动，不请求或展示模型的私密推理。');
  await expect(log.getByRole('status')).toHaveText(intention);
  await expect(log).toContainText('2 次请求 / 服务商报告 140 个词元');
  await expect(log.locator('li strong')).toHaveText('守灯人');
  await expect(log.locator('li p').first()).toHaveText(intention);
  await expect(log.locator('img')).toHaveCount(0);
  await expect(root).toHaveAttribute('data-busy-callback', 'false');
  expect(calls).toHaveLength(2);
  expect(calls[1].messages).toMatchObject([{ role: 'system', content: expect.stringContaining('沿合法路线前进一步。') }, { role: 'user' }, { role: 'assistant' }, { role: 'tool' }]);
});

for (const failure of ['http', 'network', 'protocol', 'validation', 'timeout'] as const) {
  test(`locale Chinese ${failure} errors remain explicit and never commit a fallback`, async ({ page }) => {
    let requests = 0;
    const bodies: Record<string, unknown>[] = [];
    await installAgentFixture(page, () => ({ step: 1, intention: '未使用。' }));
    await page.route('**/api/openai/v1/chat/completions', async route => {
      requests++;
      bodies.push(route.request().postDataJSON());
      if (failure === 'network') return route.abort('failed');
      if (failure === 'timeout') return;
      return route.fulfill({
        status: failure === 'http' ? 401 : 200, contentType: 'application/json',
        body: JSON.stringify(failure === 'validation' ? nativeToolResponse('take_step', { step: 3, intention: '不合法的捷径。' }) :
          failure === 'http' ? { error: { message: 'private-provider-text' } } : { choices: [] }),
      });
    });
    const root = await fixture(page, 'zh-CN');
    if (failure === 'timeout') await page.clock.install();
    await root.locator('[data-turn]').click();
    await expect.poll(() => requests).toBe(failure === 'validation' ? 2 : 1);
    if (failure === 'timeout') await page.clock.runFor(60_001);
    const summary = {
      http: '模型服务拒绝了请求或暂时不可用',
      network: '无法连接模型服务',
      protocol: '模型服务的响应无效或不符合工具调用要求',
      validation: '模型计划未通过游戏规则校验',
      timeout: '模型请求超时',
    }[failure];
    await expect(root.locator('[data-agent-status]')).toContainText(summary);
    await expect(root.locator('[data-agent-status]')).toContainText('技术详情：');
    await expect(root.locator('[data-console]')).toHaveAttribute('data-agent-error', 'true');
    await expect(root).toHaveAttribute('data-last-error', new RegExp(summary));
    await expect(root).toHaveAttribute('data-turn-result', 'false');
    await expect(root.locator('[data-position]')).toHaveText('0');
    await root.locator('[data-agent-log]').click();
    const log = root.getByRole('dialog', { name: '角色行动日志', exact: true });
    await expect(log.locator('li[data-outcome=error]')).toContainText(summary);
    await expect(log).not.toContainText('private-provider-text');
    for (const body of bodies) expect(body).toMatchObject({ max_completion_tokens: 1536, stream: false, parallel_tool_calls: false });
  });
}

test('locale Chinese cancellation, connection changes and stale plans retain turn ownership', async ({ page }) => {
  const releases: (() => void)[] = [];
  const calls = await installAgentFixture(page, async () => {
    await new Promise<void>(resolve => releases.push(resolve));
    return { step: 1, intention: '迟到的行动。' };
  });
  const root = await fixture(page, 'zh-CN');
  let turn = 0;
  for (const action of ['cancel', 'revision', 'connection'] as const) {
    turn++;
    await root.locator('[data-turn]').click();
    await expect.poll(() => releases.length).toBe(turn);
    const release = releases[releases.length - 1];
    if (action === 'cancel') await root.getByRole('button', { name: '取消', exact: true }).click();
    if (action === 'revision') await root.dispatchEvent('change-world');
    if (action === 'connection') {
      await root.locator('[data-agent-connect]').click();
      await root.getByRole('button', { name: '保存连接', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    release();
    await expect(root).toHaveAttribute('data-busy-callback', 'false');
    await expect(root.locator('[data-position]')).toHaveText('0');
    await root.locator('[data-agent-log]').click();
    const entry = root.locator('li[data-outcome=cancelled]').first();
    await expect(entry).toContainText(action === 'cancel' ? '回合已取消' : action === 'revision' ? '过期计划已丢弃' : '连接已更改，进行中的回合已取消');
    await expect(entry).not.toContainText('技术详情：');
    await page.keyboard.press('Escape');
  }
  expect(calls).toHaveLength(3);
});

for (const change of ['endpoint', 'key', 'model', 'save', 'forget', 'close', 'dispose'] as const) {
  test(`locale Chinese model discovery invalidates after ${change} without late status or focus changes`, async ({ page }) => {
    let release: (() => void) | undefined;
    let sent = false;
    await page.route('**/api/openai/v1/models', async route => {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'stale-model' }] }) });
      sent = true;
    });
    const root = await fixture(page, 'zh-CN');
    await root.locator('[data-agent-connect]').click();
    const settings = root.getByRole('dialog', { name: '模型连接', exact: true });
    await settings.getByRole('button', { name: '获取模型列表', exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(settings.locator('[data-agent-settings-status]')).toHaveText('正在获取可用模型 ID……');
    if (change === 'endpoint') await settings.getByLabel('服务地址', { exact: true }).fill('https://other.example/v1');
    if (change === 'key') await settings.getByLabel('API 密钥', { exact: true }).fill('new-key');
    if (change === 'model') await settings.getByLabel('模型', { exact: true }).fill('new-model');
    if (change === 'save') await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    if (change === 'forget') await settings.getByRole('button', { name: '清除密钥', exact: true }).click();
    if (change === 'close') {
      await page.keyboard.press('Escape');
      await expect(root.locator('[data-agent-connect]')).toBeFocused();
      await root.locator('[data-agent-connect]').click();
    }
    if (change === 'dispose') await root.dispatchEvent('dispose-fixture');
    const before = await page.evaluate(() => ({
      focus: document.activeElement?.outerHTML,
      status: document.querySelector('[data-agent-settings-status]')?.textContent,
    }));
    release!();
    await expect.poll(() => sent).toBe(true);
    expect(await page.evaluate(() => ({
      focus: document.activeElement?.outerHTML,
      status: document.querySelector('[data-agent-settings-status]')?.textContent,
    }))).toEqual(before);
    await expect(page.locator('datalist option')).toHaveCount(0);
    if (change !== 'dispose') await expect(settings.getByRole('button', { name: '获取模型列表', exact: true })).toBeEnabled();
    else await expect(page.locator('dialog, .project-locale-fixture')).toHaveCount(0);
  });
}

test('locale Chinese model discovery failures are labelled and do not replace errors with empty success', async ({ page }) => {
  await page.route('**/api/openai/v1/models', route => route.fulfill({ contentType: 'application/json', body: '{"data":[]}' }));
  const root = await fixture(page, 'zh-CN');
  await root.locator('[data-agent-connect]').click();
  const settings = root.getByRole('dialog', { name: '模型连接', exact: true });
  await settings.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await expect(settings.locator('[data-agent-settings-status]')).toContainText('模型服务的响应无效或不符合工具调用要求');
  await expect(settings.locator('[data-agent-settings-status]')).toContainText('技术详情：The endpoint returned no available models.');
  await expect(settings.locator('datalist option')).toHaveCount(0);
  await expect(settings.getByRole('button', { name: '获取模型列表', exact: true })).toBeEnabled();
});

test('locale Chinese notebook restores, auto-saves, exports private-free replays and imports via keyboard', async ({ page }) => {
  const calls = await installAgentFixture(page, () => ({ step: 1, intention: '前进。' }));
  const root = await fixture(page, 'zh-CN', replay(2));
  await expect(root.locator('[data-position]')).toHaveText('2');
  await root.locator('[data-notebook]').click();
  const notebook = root.getByRole('dialog', { name: '游戏手记', exact: true });
  const status = notebook.locator('[data-game-save-status]');
  await expect(status).toHaveText('已恢复保存的游戏，未发送任何模型请求。');
  await page.keyboard.press('Escape');
  await root.dispatchEvent('accept-move');
  await root.locator('[data-agent-connect]').click();
  await root.getByLabel('API 密钥', { exact: true }).fill('fixture-memory-only-key');
  await root.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.keyboard.press('Escape');
  await root.locator('[data-notebook]').click();
  await expect(status).toHaveText('已在此浏览器中保存 3 次已接受的行动。');
  const downloaded = page.waitForEvent('download');
  await notebook.getByRole('button', { name: '导出回放', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('locale-fixture-replay.json');
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toBe(replay(3));
  expect(exported).not.toMatch(/fixture-memory-only-key|endpoint|apiKey|fixture-tool-model/);
  await expect(status).toHaveText('回放已导出，不含 API 设置或密钥。');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), saveKey)).toBe(exported);
  const choose = notebook.getByRole('button', { name: '选择回放文件', exact: true });
  await choose.focus();
  const choosing = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await choosing).setFiles({ name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(replay()) });
  await expect(status).toHaveText('回放已导入，所有记录的行动均已通过游戏规则校验，未调用模型。');
  await expect(root.locator('[data-position]')).toHaveText('1');
  expect(calls).toHaveLength(0);
  await notebook.locator('[data-game-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('<img src=x>') });
  await expect(status).toHaveText('回放被拒绝，当前游戏未改变。技术详情：The replay file is not valid JSON.');
  await expect(root.locator('[data-position]')).toHaveText('1');
  await notebook.locator('[data-game-import]').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(512 * 1024 + 1) });
  await expect(status).toHaveText('文件超过回放大小限制，当前游戏未改变。');
  await expect(root.locator('[data-position]')).toHaveText('1');
  await expect(notebook.locator('img')).toHaveCount(0);
});

test('locale Chinese notebook rejects invalid saved replays without changing the fresh game', async ({ page }) => {
  const root = await fixture(page, 'zh-CN', '{"invalid":true}');
  await root.locator('[data-notebook]').click();
  await expect(root.locator('[data-game-save-status]')).toContainText('无法恢复已保存的回放，新游戏保持不变。技术详情：');
  await expect(root).toHaveAttribute('data-last-error', /无法恢复已保存的回放/);
  await expect(root.locator('[data-position]')).toHaveText('0');
});

test('locale Chinese replay import cancels a pending model plan and preserves the imported game', async ({ page }) => {
  let release: (() => void) | undefined;
  let responseReady = false;
  const calls = await installAgentFixture(page, async () => {
    await new Promise<void>(resolve => { release = resolve; });
    responseReady = true;
    return { step: 1, intention: '不应执行的迟到计划。' };
  });
  const root = await fixture(page, 'zh-CN');
  await root.locator('[data-turn]').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await root.locator('[data-notebook]').click();
  await root.locator('[data-game-import]').setInputFiles({ name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(replay(2)) });
  await expect(root.locator('[data-game-save-status]')).toHaveText('回放已导入，所有记录的行动均已通过游戏规则校验，未调用模型。');
  await expect(root).toHaveAttribute('data-busy-callback', 'false');
  await expect(root.locator('[data-agent-status]')).toHaveText('回合已取消，尚未完成的模型行动均未执行。');
  release!();
  await expect.poll(() => responseReady).toBe(true);
  await expect(root).toHaveAttribute('data-turn-result', 'false');
  await expect(root.locator('[data-position]')).toHaveText('2');
  await page.keyboard.press('Escape');
  await root.locator('[data-agent-log]').click();
  await expect(root.locator('li[data-outcome=cancelled]')).toContainText('回合已取消');
  await expect(root.locator('li[data-outcome=accepted]')).toHaveCount(0);
  expect(calls).toHaveLength(1);
});

test('locale Chinese browser storage failures stay visible, including after a successful in-memory import', async ({ page }) => {
  const root = await fixture(page, 'zh-CN');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('fixture quota failure', 'QuotaExceededError'); };
  });
  await root.locator('[data-agent-connect]').click();
  await root.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(root.locator('[data-agent-settings-status]')).toHaveText('连接可在当前标签页使用，但浏览器存储失败。请保持标签页打开或导出游戏进度。');
  await expect(root).toHaveAttribute('data-last-error', /浏览器存储失败/);
  await page.keyboard.press('Escape');
  await root.dispatchEvent('accept-move');
  await root.locator('[data-notebook]').click();
  await expect(root.locator('[data-game-save-status]')).toHaveText('浏览器无法保存当前会话，请保持页面打开以保留进度。');
  await root.locator('[data-game-import]').setInputFiles({ name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(replay(2)) });
  await expect(root.locator('[data-position]')).toHaveText('2');
  await expect(root.locator('[data-game-save-status]')).toHaveText('回放已导入，所有记录的行动均已通过游戏规则校验，未调用模型。 浏览器无法保存当前会话，请保持页面打开以保留进度。');
  await expect(root).toHaveAttribute('data-last-error', /浏览器无法保存当前会话/);
});

test('locale Chinese notebook read failures preserve the current game and technical diagnostic', async ({ page }) => {
  const root = await fixture(page, 'zh-CN');
  await page.evaluate(() => {
    File.prototype.text = () => Promise.reject(new DOMException('fixture read failure', 'NotReadableError'));
  });
  await root.locator('[data-notebook]').click();
  await root.locator('[data-game-import]').setInputFiles({ name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(replay()) });
  await expect(root.locator('[data-game-save-status]')).toHaveText('浏览器无法读取此回放，当前游戏未改变。技术详情：NotReadableError');
  await expect(root.locator('[data-position]')).toHaveText('0');
});

for (const change of ['move', 'import', 'dispose'] as const) {
  test(`locale Chinese pending replay imports respect ${change} ownership`, async ({ page }) => {
    const root = await fixture(page, 'zh-CN');
    await page.evaluate(() => {
      const original = File.prototype.text;
      const root = document.querySelector('.project-locale-fixture')!;
      File.prototype.text = function () {
        if (this.name !== 'slow.json') return original.call(this);
        const file = this;
        return new Promise<string>((resolve, reject) => {
          root.addEventListener('release-file', () => { void original.call(file).then(resolve, reject); }, { once: true });
        });
      };
    });
    await root.locator('[data-notebook]').click();
    await root.locator('[data-game-import]').setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(replay(3)) });
    if (change === 'move') await root.dispatchEvent('accept-move');
    if (change === 'import') await root.locator('[data-game-import]').setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(replay()) });
    if (change === 'dispose') {
      const unchanged = await root.evaluate(async element => {
        const status = element.querySelector('[data-game-save-status]')!;
        element.dispatchEvent(new Event('dispose-fixture'));
        const before = status.textContent;
        element.dispatchEvent(new Event('release-file'));
        await new Promise(resolve => setTimeout(resolve, 50));
        return before === status.textContent;
      });
      expect(unchanged).toBe(true);
      await expect(page.locator('dialog, .project-locale-fixture')).toHaveCount(0);
    } else {
      await expect(root.locator('[data-position]')).toHaveText('1');
      await root.dispatchEvent('release-file');
      await expect(root.locator('[data-game-save-status]')).toHaveText('读取回放时游戏已发生变化。如需替换较新的游戏进度，请重新选择文件。');
      await expect(root.locator('[data-position]')).toHaveText('1');
    }
  });
}

test('locale technical details remain text and default English diagnostics stay verbatim', () => {
  const detail = '<img src=x> Step must be an integer.';
  const error = new AgentError('validation', detail);
  expect(agentLocale().console.error(error)).toBe(detail);
  expect(agentLocale('zh-CN').console.error(error)).toBe(`模型计划未通过游戏规则校验，未执行任何模型行动。 技术详情：${detail}`);
  expect(agentLocale('zh-CN').storageNotice('Saved data could not be read. This session still works without it.')).toBe('无法读取已保存的数据，仍可继续使用当前会话。');
  expect(agentLocale('zh-CN').storageNotice('The saved data has an older or invalid format. Starting a fresh session.')).toBe('已保存的数据格式过旧或无效，将开始新的会话。');
});
