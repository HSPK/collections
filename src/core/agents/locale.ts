import type { AgentError, AgentErrorCode } from './errors';

export type AgentLocale = 'en' | 'zh-CN';

const english = {
  close: 'Close',
  storageNotice: (message: string) => message,
  console: {
    model: 'Model',
    modelSettings: 'Model settings',
    log: 'Log',
    actionLog: 'Agent action log',
    cancel: 'Cancel',
    connection: 'Model connection',
    introduction: 'This game needs a model that supports OpenAI-compatible Chat Completions and function tools. Nothing is sent until you request a turn or fetch models.',
    endpoint: 'Endpoint',
    endpointRequired: 'Enter the model service endpoint.',
    endpointInvalid: 'Enter a valid endpoint URL.',
    modelRequired: 'Enter a model ID.',
    endpointHelp: "Include the base path, usually /v1. On this repository's local game server, use its /api/openai/v1 endpoint. Public HTTPS pages cannot reach every local server; CORS and local-network permissions still apply.",
    key: 'API key',
    keyPlaceholder: 'Optional; memory only',
    keyHelp: "Prefer your own server-side gateway for keys. A browser key stays in this tab's memory, disappears on reload, and is never saved or exported. Leaving it blank keeps a key only for the same endpoint.",
    fetchModels: 'Fetch models',
    save: 'Save connection',
    forget: 'Forget key',
    boundsHelp: 'Each game decision uses at most two bounded requests: one plan and, only if its rules are invalid, one correction. A provider may charge for both. Cancelling prevents a game commit but cannot undo tokens already processed. Model output is untrusted; the local rules decide what is legal.',
    traceIntroduction: 'Public intentions and accepted game actions only. No private model reasoning is requested or displayed.',
    noTurns: 'No model turns yet.',
    ready: 'Model required. Ready when you are.',
    usage: (requests: number, tokens?: number) => `${requests} request${requests === 1 ? '' : 's'}${tokens ? ` / ${tokens} reported tokens` : ''}`,
    accepted: 'Latest plan accepted by the game rules.',
    cancelled: 'Turn cancelled. No pending model actions were committed.',
    cancelledLabel: 'Cancelled',
    keyHeld: 'A key is currently held in this tab for this endpoint.',
    preferencesOnly: 'Only the endpoint and model preference are saved. Keys are never stored.',
    connectionEdited: 'Connection details changed. Fetch models again for this connection.',
    savedHelp: 'Connection saved. Return to the game and choose your next action; saving does not start a model turn.',
    saved: 'Connection saved. Choose a game action to request a model turn.',
    storageFailed: 'Connection is available for this tab, but browser storage failed. Keep the tab open or export your work.',
    forgotten: 'The in-memory key has been forgotten. Your server may still provide its own authentication.',
    fetching: 'Requesting the available model IDs...',
    modelsLoaded: (count: number) => `${count} model IDs loaded. Choose a text model with function-tool support, then save. A model listing does not prove tool support.`,
    discoveryCancelled: 'Model discovery cancelled.',
    connectionChanged: 'Connection changed. The pending turn was cancelled; choose an action to try again.',
    alreadyRunning: 'A model turn is already running. Wait for it or choose Cancel.',
    configure: 'Set your endpoint and model, save the connection, then retry the game action.',
    requesting: (label: string) => `${label}: requesting a plan (1/2).`,
    correcting: (label: string) => `${label}: correcting an illegal plan (2/2).`,
    stalePlan: 'The game changed before the model finished. Its stale plan was discarded.',
    error: (error: AgentError) => error.message,
  },
  notebook: {
    title: 'Game notebook',
    introduction: 'Your game is saved in this browser after each accepted move. Export a replay to keep it elsewhere. Replays contain fictional game moves, not connection settings or API keys.',
    export: 'Export replay',
    import: 'Import a replay',
    chooseFile: 'Choose replay file',
    importHelp: 'Import replaces the current game only after every recorded move passes the current rules. It cancels any pending agent plan and never contacts a model.',
    restored: 'The saved game was restored. No model request was made.',
    restoreFailed: (detail: string) => `The saved replay could not be restored: ${detail} Your fresh game remains unchanged.`,
    saved: (count: number) => `${count} accepted moves saved in this browser.`,
    exported: 'Replay exported without API settings or keys.',
    tooLarge: 'This file exceeds the replay size limit. The current game was not changed.',
    staleImport: 'The game changed while the replay was being read. Choose the file again to replace the newer game.',
    imported: 'Replay imported. Every recorded move passed the game rules; no model was called.',
    rejected: (detail: string) => `Replay rejected: ${detail} The current game was not changed.`,
    readFailed: (name: string) => `The browser could not read this replay (${name}). The current game was not changed.`,
  },
};

const chinese: typeof english = {
  close: '关闭',
  storageNotice(message) {
    switch (message) {
      case 'The saved data has an older or invalid format. Starting a fresh session.':
        return '已保存的数据格式过旧或无效，将开始新的会话。';
      case 'Saved data could not be read. This session still works without it.':
        return '无法读取已保存的数据，仍可继续使用当前会话。';
      case 'Your browser could not save this session. Keep the page open to retain your work.':
        return '浏览器无法保存当前会话，请保持页面打开以保留进度。';
      default:
        return `浏览器存储操作失败。技术详情：${message}`;
    }
  },
  console: {
    model: '模型',
    modelSettings: '模型设置',
    log: '日志',
    actionLog: '角色行动日志',
    cancel: '取消',
    connection: '模型连接',
    introduction: '本游戏需要支持 OpenAI 兼容 Chat Completions 接口和函数工具的模型。只有主动请求回合或获取模型列表时，才会发送请求。',
    endpoint: '服务地址',
    endpointRequired: '请输入模型服务地址。',
    endpointInvalid: '请输入有效的服务地址 URL。',
    modelRequired: '请输入模型 ID。',
    endpointHelp: '请包含基础路径，通常为 /v1。使用本仓库的本地游戏服务器时，请填写其 /api/openai/v1 地址。公开 HTTPS 页面不一定能访问所有本地服务器，仍受 CORS 跨域限制和本地网络权限约束。',
    key: 'API 密钥',
    keyPlaceholder: '可选；仅保存在内存中',
    keyHelp: '建议通过自己的服务端网关管理密钥。浏览器密钥仅保留在当前标签页的内存中，刷新后即消失，绝不会写入存储或导出。留空仅会保留同一服务地址的现有密钥。',
    fetchModels: '获取模型列表',
    save: '保存连接',
    forget: '清除密钥',
    boundsHelp: '每次游戏决策最多发送两次有界请求：一次生成计划，仅在计划违反规则时再纠正一次。服务商可能对两次请求分别计费。取消可阻止游戏执行计划，但无法撤销已处理的词元费用。模型输出不可信，是否合法由本地游戏规则判定。',
    traceIntroduction: '仅记录公开意图和已接受的游戏行动，不请求或展示模型的私密推理。',
    noTurns: '尚未请求模型回合。',
    ready: '需要模型，准备好后即可开始。',
    usage: (requests, tokens) => `${requests} 次请求${tokens ? ` / 服务商报告 ${tokens} 个词元` : ''}`,
    accepted: '最新计划已通过游戏规则校验。',
    cancelled: '回合已取消，尚未完成的模型行动均未执行。',
    cancelledLabel: '已取消',
    keyHeld: '当前标签页的内存中已保留此服务地址的密钥。',
    preferencesOnly: '仅保存服务地址和模型偏好，绝不存储密钥。',
    connectionEdited: '连接信息已更改，请重新获取此连接的模型列表。',
    savedHelp: '连接已保存。请返回游戏选择下一步行动；保存连接不会启动模型回合。',
    saved: '连接已保存。请选择游戏行动以请求模型回合。',
    storageFailed: '连接可在当前标签页使用，但浏览器存储失败。请保持标签页打开或导出游戏进度。',
    forgotten: '已清除内存中的密钥，服务器仍可能提供自身的身份验证。',
    fetching: '正在获取可用模型 ID……',
    modelsLoaded: count => `已加载 ${count} 个模型 ID。请选择支持函数工具的文本模型，然后保存。出现在列表中并不代表支持工具调用。`,
    discoveryCancelled: '已取消获取模型列表。',
    connectionChanged: '连接已更改，进行中的回合已取消。请选择游戏行动重试。',
    alreadyRunning: '模型回合正在进行，请等待完成或选择“取消”。',
    configure: '请设置服务地址和模型，保存连接后重试游戏行动。',
    requesting: label => `${label}：正在请求计划（1/2）。`,
    correcting: label => `${label}：正在纠正违反规则的计划（2/2）。`,
    stalePlan: '模型完成前游戏已发生变化，过期计划已丢弃。',
    error: chineseAgentError,
  },
  notebook: {
    title: '游戏手记',
    introduction: '每次接受行动后，游戏进度都会自动保存在此浏览器中。可导出回放以在其他位置保留进度。回放仅包含虚构的游戏行动，不含连接设置或 API 密钥。',
    export: '导出回放',
    import: '导入回放',
    chooseFile: '选择回放文件',
    importHelp: '只有所有记录的行动都通过当前规则校验，导入才会替换当前游戏。导入会取消进行中的模型计划，且绝不会联系模型。',
    restored: '已恢复保存的游戏，未发送任何模型请求。',
    restoreFailed: detail => `无法恢复已保存的回放，新游戏保持不变。技术详情：${detail}`,
    saved: count => `已在此浏览器中保存 ${count} 次已接受的行动。`,
    exported: '回放已导出，不含 API 设置或密钥。',
    tooLarge: '文件超过回放大小限制，当前游戏未改变。',
    staleImport: '读取回放时游戏已发生变化。如需替换较新的游戏进度，请重新选择文件。',
    imported: '回放已导入，所有记录的行动均已通过游戏规则校验，未调用模型。',
    rejected: detail => `回放被拒绝，当前游戏未改变。技术详情：${detail}`,
    readFailed: name => `浏览器无法读取此回放，当前游戏未改变。技术详情：${name}`,
  },
};

const errorSummaries: Record<AgentErrorCode, string> = {
  configuration: '模型配置无效，请检查连接设置和游戏请求。',
  network: '无法连接模型服务，请检查网络、跨域限制和浏览器本地网络权限。',
  http: '模型服务拒绝了请求或暂时不可用，请检查身份验证、配额及服务配置。',
  protocol: '模型服务的响应无效或不符合工具调用要求，已拒绝该响应。',
  validation: '模型计划未通过游戏规则校验，未执行任何模型行动。',
  timeout: '模型请求超时，未执行任何模型行动，可以重试。',
  cancelled: '模型请求已取消，未执行尚未完成的模型行动。',
};

function chineseAgentError(error: AgentError): string {
  if (error.code === 'cancelled' && error.message === chinese.console.stalePlan) return error.message;
  if (error.code === 'validation' && error.message.startsWith('This session')) {
    return `游戏回放空间或行动条数不足，请先导出旅程并重新开始。技术详情：${error.message}`;
  }
  return `${errorSummaries[error.code]} 技术详情：${error.message}`;
}

export function agentLocale(locale: AgentLocale = 'en'): typeof english {
  return locale === 'zh-CN' ? chinese : english;
}
