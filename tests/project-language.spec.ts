import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readProjectManifests, renderProjectDocument } from '../scripts/project-pages';
import { parseManifest } from '../src/core/manifest';
import { projectLabels } from '../src/core/project-locale';

test('project language is validated and generated Chinese pages disclose their model requirement in Chinese', () => {
  const original = readProjectManifests(process.cwd()).find(project => project.id === 'nonogram')!;
  const chinese = parseManifest({ ...original, title: '潮汐归客', language: 'zh-CN', runtime: 'openai-compatible' });
  const html = renderProjectDocument(readFileSync('index.html', 'utf8'), chinese, true);
  expect(html).toContain('<html lang="zh-CN">');
  expect(html).toContain('需要连接 OpenAI 兼容的模型 API');
  expect(html).not.toContain('Requires an OpenAI-compatible model connection.');
  expect(html).toContain('<title>潮汐归客 - Odd Index</title>');
  const english = renderProjectDocument(readFileSync('index.html', 'utf8'), original, true);
  expect(english).toContain('<html lang="en">');
  expect(parseManifest(original).language).toBeUndefined();
  for (const language of ['chinese', 'fr', 1, null, []]) {
    expect(() => parseManifest({ ...original, language })).toThrow('language');
  }
  expect(projectLabels().menu).toBe('Collection menu');
  expect(projectLabels('zh-CN').menu).toBe('项目导航');
});
