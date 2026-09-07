import { readLocalData, writeLocalData } from '../page';
import { AgentError } from './errors';
import { isRecord } from './schema';

export const CONNECTION_STORAGE_KEY = 'odd-index:agent-connection:v1';
export const DEFAULT_LOCAL_MODEL = 'gpt-4.1-mini_2025-04-14';
export const connectionEvents = new EventTarget();

export interface ConnectionSettings {
  version: 1;
  endpoint: string;
  model: string;
}

export interface AgentConnection extends ConnectionSettings {
  apiKey: string;
}

let memoryKey = '';
let keyEndpoint = '';
let memorySettings: ConnectionSettings | undefined;

export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeEndpoint(value: string, base: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AgentError('configuration', 'Enter an OpenAI-compatible base URL, including its /v1 path.');
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new AgentError('configuration', 'The endpoint is not a valid URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AgentError('configuration', 'Endpoint URLs cannot contain credentials, query parameters, or fragments.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new AgentError('configuration', 'Use HTTPS, or an HTTP server on localhost. Never put a provider key in a URL.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href.replace(/\/$/, '');
}

export function normalizeModel(value: string): string {
  const model = value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new AgentError('configuration', 'Enter a model ID from your server (at most 200 characters).');
  }
  return model;
}

export function defaultConnection(base = window.location.href): ConnectionSettings {
  const url = new URL(base);
  return {
    version: 1,
    endpoint: isLoopback(url.hostname) ? `${url.origin}/api/openai/v1` : '',
    model: isLoopback(url.hostname) ? DEFAULT_LOCAL_MODEL : 'gpt-4.1-mini',
  };
}

function validSettings(value: unknown): value is ConnectionSettings {
  if (!isRecord(value) || value.version !== 1 || typeof value.endpoint !== 'string' || typeof value.model !== 'string' ||
      Object.keys(value).some(key => !['version', 'endpoint', 'model'].includes(key))) return false;
  try {
    return normalizeEndpoint(value.endpoint, window.location.href) === value.endpoint &&
      normalizeModel(value.model) === value.model;
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    return false;
  }
}

export function readConnection(report: (message: string) => void): AgentConnection {
  const settings = memorySettings ?? readLocalData(CONNECTION_STORAGE_KEY, validSettings, report) ?? defaultConnection();
  return { ...settings, apiKey: keyEndpoint === settings.endpoint ? memoryKey : '' };
}

export function refreshConnection(): void {
  memorySettings = undefined;
}

export function saveConnection(
  endpoint: string,
  model: string,
  apiKey: string,
  report: (message: string) => void,
): boolean {
  const settings: ConnectionSettings = {
    version: 1,
    endpoint: normalizeEndpoint(endpoint, window.location.href),
    model: normalizeModel(model),
  };
  const key = apiKey.trim();
  if (key.length > 4096 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new AgentError('configuration', 'The API key contains unsupported characters or is too long.');
  }
  // A key is never carried across an endpoint change, even when the form is left blank.
  if (settings.endpoint !== keyEndpoint || key) memoryKey = key;
  keyEndpoint = settings.endpoint;
  memorySettings = settings;
  const saved = writeLocalData(CONNECTION_STORAGE_KEY, settings, report);
  connectionEvents.dispatchEvent(new Event('change'));
  return saved;
}

export function forgetApiKey(): void {
  memoryKey = '';
  keyEndpoint = '';
  connectionEvents.dispatchEvent(new Event('change'));
}

export function transientConnection(endpoint: string, model: string, apiKey: string): AgentConnection {
  const normalized = normalizeEndpoint(endpoint, window.location.href);
  const key = apiKey.trim() || (normalized === keyEndpoint ? memoryKey : '');
  if (key.length > 4096 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new AgentError('configuration', 'The API key contains unsupported characters or is too long.');
  }
  return { version: 1, endpoint: normalized, model: normalizeModel(model), apiKey: key };
}
