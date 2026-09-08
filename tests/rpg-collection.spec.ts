import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readProjectManifests } from '../scripts/project-pages';

const ids = ['emberwake', 'borrowed-names', 'verdant-oath', 'iron-choir', 'tidebound-house'];
const projects = readProjectManifests(process.cwd());
const rpgs = projects.filter(project => project.tags.includes('Agent RPG'));
const han = /\p{Script=Han}/u;

test('five original Chinese RPGs have explicit language, model requirements and substantial authored story', () => {
  expect(rpgs.map(project => project.id).sort()).toEqual([...ids].sort());
  expect(rpgs.map(project => project.order).sort((a, b) => a - b)).toEqual([82, 83, 84, 85, 86]);
  for (const project of rpgs) {
    expect(project.language).toBe('zh-CN');
    expect(project.runtime).toBe('openai-compatible');
    expect(project.category).toBe('play');
    expect(project.tags).toContain('Agent games');
    expect(han.test(project.title) && han.test(project.description)).toBe(true);
    const folder = resolve('src/projects', project.id);
    const narrative = readdirSync(folder).filter(file => /^(data|story|stories|content).*\.ts$/.test(file))
      .map(file => readFileSync(resolve(folder, file), 'utf8')).join('\n');
    expect((narrative.match(/\p{Script=Han}/gu) ?? []).length, `${project.id} needs substantial authored Chinese narrative`).toBeGreaterThanOrEqual(2500);
  }
  expect(projects.filter(project => project.order <= 81).every(project => project.language !== 'zh-CN')).toBe(true);
});

for (const id of ids) {
  test(`${id}: Chinese shell, model settings and collection navigation stay coherent without eager calls`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => {
      if (/\/(?:chat\/completions|models)(?:\?|$)/.test(request.url())) requests.push(request.url());
    });
    await page.goto(`./projects/${id}/`);
    await expect(page.locator('#main-content > [data-stage]')).toHaveAttribute('data-ready', 'true');
    const root = page.locator(`.project-${id}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(root).toHaveAttribute('data-workspace', 'true');
    await expect(root.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await root.getByRole('heading', { level: 1 }).first().innerText()).toMatch(han);
    expect(requests).toEqual([]);
    const connect = root.locator('[data-agent-connect]');
    expect(await connect.innerText()).toMatch(han);
    await connect.click();
    const dialog = root.locator('dialog:modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.getByRole('heading', { level: 2 }).innerText()).toMatch(han);
    await expect(dialog.locator('[data-agent-endpoint]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(connect).toBeFocused();
    const menu = page.getByRole('button', { name: '项目导航', exact: true });
    await menu.click();
    await expect(page.getByRole('link', { name: '返回合集', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关于本项目', exact: true }).click();
    await expect(page.locator('[data-info-runtime]')).toContainText('需要你自己的');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: '查找项目', exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: '搜索所有项目', exact: true }).fill('潮汐归客');
    await expect(page.locator('.search-results a[href$="/projects/tidebound-house/"]')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(requests).toEqual([]);
  });
}
