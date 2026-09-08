import type { Category, ProjectLanguage } from './types';
import { categoryNames } from './manifest';

const en = {
  menu: 'Collection menu', navigation: 'Collection navigation', back: 'Back to index',
  all: 'All projects', search: 'Search projects', about: 'About this project',
  source: 'Source & notes', previous: 'Previous', next: 'Next',
  previousProject: 'Previous project', nextProject: 'Next project', website: 'website',
  opening: 'Opening', dismiss: 'Dismiss message', closeInfo: 'Close project information',
  sourceNotes: 'Source code & extension notes', searchTitle: 'Find a project',
  closeSearch: 'Close search', searchLabel: 'Search all projects',
  searchPlaceholder: 'Tools, stories, games, ideas...', projectUnit: 'projects',
  searchHelp: 'Tab to browse results. Enter to open. Escape to return.',
  searchEmpty: 'No projects by that name. Try a different word or idea.',
  apiBadge: 'API required', unavailable: 'This website could not be opened.',
  unavailableAdvice: 'Try a current browser with hardware acceleration for 3D projects, or explore a Canvas website instead.',
  tryFlow: 'Try Flow State instead', openFailed: 'The project could not be started.',
  unavailableStatus: 'Project unavailable. See the message above.',
  modelRequired: 'Requires your own OpenAI-compatible model connection. Game observations are sent only when you request a turn. The collection does not provide hosted inference; provider charges may apply.',
  localOnly: 'This project runs locally in your browser and does not require a hosted model.',
  metaRequired: ' Requires an OpenAI-compatible model connection.',
};

const zh: Record<keyof typeof en, string> = {
  menu: '项目导航', navigation: '合集导航', back: '返回合集',
  all: '全部项目', search: '搜索项目', about: '关于本项目',
  source: '源码与说明', previous: '上一个', next: '下一个',
  previousProject: '上一个项目', nextProject: '下一个项目', website: '独立网站',
  opening: '正在打开', dismiss: '关闭提示', closeInfo: '关闭项目信息',
  sourceNotes: '源码与扩展说明', searchTitle: '查找项目',
  closeSearch: '关闭搜索', searchLabel: '搜索所有项目',
  searchPlaceholder: '搜索工具、故事、游戏或想法……', projectUnit: '个项目',
  searchHelp: 'Tab 切换结果，Enter 打开，Esc 返回。',
  searchEmpty: '没有找到匹配的项目，请换一个名称或关键词。',
  apiBadge: '需要模型 API', unavailable: '暂时无法打开这个项目。',
  unavailableAdvice: '3D 项目需要支持硬件加速的现代浏览器，也可以先浏览其他二维项目。',
  tryFlow: '打开流场画室', openFailed: '项目未能启动。',
  unavailableStatus: '项目暂不可用，请查看上方提示。',
  modelRequired: '需要你自己的 OpenAI 兼容模型连接。只有你主动请求角色行动时，才会发送游戏场景信息。合集不提供托管推理，模型服务可能收费。',
  localOnly: '本项目在浏览器本地运行，不需要连接托管模型。',
  metaRequired: ' 需要连接 OpenAI 兼容的模型 API。',
};

const zhCategories: Record<Category, string> = {
  create: '工具与创作', play: '游戏与谜题', read: '故事与档案',
  learn: '知识与学习', explore: '世界与探索', art: '艺术与动效',
};

export const projectLabels = (language: ProjectLanguage = 'en') => language === 'zh-CN' ? zh : en;
export const projectCategory = (category: Category, language: ProjectLanguage = 'en') =>
  (language === 'zh-CN' ? zhCategories : categoryNames)[category];
