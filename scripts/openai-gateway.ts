import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { containsCredential } from '../src/core/agents/credentials.ts';

const DEFAULT_UPSTREAM = 'http://127.0.0.1:8080/v1';
const DEFAULT_REQUEST_LIMIT = 128 * 1024;
const DEFAULT_RESPONSE_LIMIT = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const API_PREFIX = '/api/openai';
const MODELS_PATH = `${API_PREFIX}/v1/models`;
const CHAT_PATH = `${API_PREFIX}/v1/chat/completions`;

export interface GatewayEnvironment {
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
}

export interface OpenAIGatewayOptions {
  environment?: GatewayEnvironment;
  requestLimitBytes?: number;
  responseLimitBytes?: number;
  timeoutMs?: number;
}

export interface RequestPolicyError {
  status: number;
  message: string;
}

export interface OpenAIGateway {
  readonly upstreamBaseUrl: string;
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  close(): void;
}

class GatewayError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized === '[::1]') return true;
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  return Boolean(match && match.slice(1).every(part => Number(part) <= 255));
}

function requestProtocol(request: IncomingMessage): 'http:' | 'https:' {
  const socket = request.socket as typeof request.socket & { encrypted?: boolean };
  return socket.encrypted ? 'https:' : 'http:';
}

function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return undefined;
  return value;
}

export function validateLocalRequest(request: IncomingMessage): RequestPolicyError | undefined {
  const host = singleHeader(request, 'host');
  if (!host) return { status: 400, message: 'A valid loopback Host header is required.' };

  let expectedOrigin: URL;
  try {
    expectedOrigin = new URL(`${requestProtocol(request)}//${host}`);
  } catch {
    return { status: 400, message: 'A valid loopback Host header is required.' };
  }
  if (!isLoopbackHostname(expectedOrigin.hostname) || expectedOrigin.username || expectedOrigin.password ||
      expectedOrigin.pathname !== '/' || expectedOrigin.search || expectedOrigin.hash) {
    return { status: 403, message: 'Only loopback hosts are allowed.' };
  }

  const fetchSite = singleHeader(request, 'sec-fetch-site');
  if (fetchSite?.toLowerCase() === 'cross-site') {
    return { status: 403, message: 'Cross-site requests are not allowed.' };
  }

  const origin = singleHeader(request, 'origin');
  if (origin === undefined) return undefined;
  if (origin === 'null') return { status: 403, message: 'Opaque browser origins are not allowed.' };
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== expectedOrigin.origin || parsedOrigin.username || parsedOrigin.password ||
        parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
      return { status: 403, message: 'Cross-origin requests are not allowed.' };
    }
  } catch {
    return { status: 403, message: 'A valid same-origin browser Origin is required.' };
  }
  return undefined;
}

export function validateUpstreamBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OPENAI_BASE_URL must be a valid absolute URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('OPENAI_BASE_URL must not contain credentials, a query, or a fragment.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHostname(url.hostname))) {
    throw new Error('OPENAI_BASE_URL must use HTTPS, or HTTP on a loopback host.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

interface GatewayTarget {
  pathname: string;
  exactEncoding: boolean;
  hasQuery: boolean;
}

function requestPath(request: IncomingMessage): GatewayTarget | undefined {
  const target = request.url;
  if (!target || !target.startsWith('/') || target.startsWith('//')) return undefined;
  const queryIndex = target.indexOf('?');
  const rawPathname = queryIndex === -1 ? target : target.slice(0, queryIndex);
  try {
    const pathname = decodeURIComponent(rawPathname);
    return { pathname, exactEncoding: pathname === rawPathname, hasQuery: queryIndex !== -1 };
  } catch {
    return undefined;
  }
}

function isGatewayPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

function sendJson(response: ServerResponse, status: number, value: unknown, allow?: string): void {
  if (response.destroyed || response.writableEnded) return;
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (allow) response.setHeader('Allow', allow);
  response.end(body);
}

function sendError(response: ServerResponse, status: number, message: string, allow?: string): void {
  sendJson(response, status, { error: { message } }, allow);
}

function headerContentLength(request: IncomingMessage): number | undefined {
  const raw = singleHeader(request, 'content-length');
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) throw new GatewayError(400, 'Content-Length must be a non-negative integer.');
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new GatewayError(400, 'Content-Length is invalid.');
  return value;
}

async function readRequestBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = headerContentLength(request);
  if (declared !== undefined && declared > limit) {
    request.resume();
    throw new GatewayError(413, 'Request body exceeds the size limit.');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > limit) {
        request.resume();
        throw new GatewayError(413, 'Request body exceeds the size limit.');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(400, 'The request body could not be read.');
  }
  return Buffer.concat(chunks, length);
}

function parseJsonObject(body: Buffer): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch {
    throw new GatewayError(400, 'The request body must contain valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayError(400, 'The request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function forwardedAuthorization(request: IncomingMessage, serverKey: string | undefined): string | undefined {
  if (serverKey !== undefined) {
    if (!serverKey || /[\r\n]/.test(serverKey)) throw new Error('OPENAI_API_KEY must be a non-empty single-line value.');
    return `Bearer ${serverKey}`;
  }
  const authorization = singleHeader(request, 'authorization');
  if (authorization === undefined) return undefined;
  if (authorization.length > 16 * 1024 || !/^Bearer [^\s].*$/.test(authorization) || /[\r\n]/.test(authorization)) {
    throw new GatewayError(400, 'Authorization must be a valid Bearer credential.');
  }
  return authorization;
}

async function readUpstreamBody(response: Response, limit: number): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await response.body?.cancel();
    throw new GatewayError(502, 'The upstream response exceeded the size limit.');
  }
  if (!response.body) throw new GatewayError(502, 'The upstream returned an empty response.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new GatewayError(502, 'The upstream response exceeded the size limit.');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), length);
}

function upstreamStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 502;
}

export function createOpenAIGateway(options: OpenAIGatewayOptions = {}): OpenAIGateway {
  const environment = options.environment ?? process.env;
  const upstream = validateUpstreamBaseUrl(environment.OPENAI_BASE_URL ?? DEFAULT_UPSTREAM);
  const serverKey = environment.OPENAI_API_KEY;
  if (serverKey !== undefined && (!serverKey || /[\r\n]/.test(serverKey))) {
    throw new Error('OPENAI_API_KEY must be a non-empty single-line value.');
  }
  const requestLimit = positiveInteger(options.requestLimitBytes ?? DEFAULT_REQUEST_LIMIT, 'requestLimitBytes');
  const responseLimit = positiveInteger(options.responseLimitBytes ?? DEFAULT_RESPONSE_LIMIT, 'responseLimitBytes');
  const timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const active = new Set<AbortController>();
  let closed = false;

  async function forward(
    request: IncomingMessage,
    response: ServerResponse,
    endpoint: 'models' | 'chat/completions',
    body?: string,
  ): Promise<void> {
    if (closed) throw new GatewayError(503, 'The local model gateway is shutting down.');
    if (response.destroyed || response.writableEnded || (request.destroyed && !request.complete)) return;
    const controller = new AbortController();
    active.add(controller);
    let timedOut = false;
    let disconnected = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAborted = () => {
      disconnected = true;
      controller.abort();
    };
    const onClose = () => {
      if (!response.writableEnded) onAborted();
    };
    request.once('aborted', onAborted);
    response.once('close', onClose);

    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (body) headers.set('Content-Type', 'application/json');
      const authorization = forwardedAuthorization(request, serverKey);
      if (authorization) headers.set('Authorization', authorization);
      const upstreamResponse = await fetch(new URL(endpoint, upstream), {
        method: body ? 'POST' : 'GET',
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
        await upstreamResponse.body?.cancel();
        throw new GatewayError(502, 'Upstream redirects are not allowed.');
      }
      if (!upstreamResponse.ok) {
        await upstreamResponse.body?.cancel();
        throw new GatewayError(
          upstreamStatus(upstreamResponse.status),
          `The upstream request failed with HTTP ${upstreamResponse.status}.`,
        );
      }
      const contentType = upstreamResponse.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('application/json')) {
        await upstreamResponse.body?.cancel();
        throw new GatewayError(502, 'The upstream response was not JSON.');
      }
      const payload = await readUpstreamBody(upstreamResponse, responseLimit);
      let value: unknown;
      try {
        value = JSON.parse(payload.toString('utf8'));
      } catch {
        throw new GatewayError(502, 'The upstream returned invalid JSON.');
      }
      const credential = serverKey ?? authorization?.replace(/^Bearer\s+/i, '') ?? '';
      if (containsCredential(value, credential)) {
        throw new GatewayError(502, 'The upstream response contained a credential and was discarded.');
      }
      if (!disconnected) {
        sendJson(response, upstreamResponse.status, value);
      }
    } catch (error) {
      if (disconnected || response.destroyed) return;
      if (timedOut) throw new GatewayError(504, 'The upstream request timed out.');
      if (error instanceof GatewayError) throw error;
      if (closed) throw new GatewayError(503, 'The local model gateway is shutting down.');
      throw new GatewayError(502, 'The upstream model service is unavailable.');
    } finally {
      clearTimeout(timeout);
      active.delete(controller);
      request.off('aborted', onAborted);
      response.off('close', onClose);
    }
  }

  return {
    upstreamBaseUrl: upstream.href.replace(/\/$/, ''),
    async handle(request, response) {
      const url = requestPath(request);
      const pathname = url?.pathname ?? '';
      if (!isGatewayPath(pathname)) return false;

      try {
        if (!url || !url.exactEncoding || url.hasQuery) throw new GatewayError(404, 'API route not found.');
        const policyError = validateLocalRequest(request);
        if (policyError) throw new GatewayError(policyError.status, policyError.message);

        if (pathname === MODELS_PATH) {
          if (request.method !== 'GET') {
            sendError(response, 405, 'Method not allowed.', 'GET');
            return true;
          }
          await forward(request, response, 'models');
          return true;
        }
        if (pathname === CHAT_PATH) {
          if (request.method !== 'POST') {
            sendError(response, 405, 'Method not allowed.', 'POST');
            return true;
          }
          const contentType = singleHeader(request, 'content-type')?.toLowerCase() ?? '';
          if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
            throw new GatewayError(415, 'Content-Type must be application/json.');
          }
          const parsed = parseJsonObject(await readRequestBody(request, requestLimit));
          await forward(request, response, 'chat/completions', JSON.stringify(parsed));
          return true;
        }
        throw new GatewayError(404, 'API route not found.');
      } catch (error) {
        if (response.destroyed || response.writableEnded) return true;
        if (error instanceof GatewayError) sendError(response, error.status, error.message);
        else sendError(response, 500, 'The local model gateway failed.');
        return true;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}

export function openAIGatewayPlugin(options: OpenAIGatewayOptions = {}): Plugin {
  let gateway: OpenAIGateway | undefined;
  return {
    name: 'local-openai-gateway',
    apply: 'serve',
    configureServer(server) {
      gateway = createOpenAIGateway(options);
      const close = () => gateway?.close();
      server.httpServer?.once('close', close);
      server.middlewares.use((request, response, next) => {
        void gateway?.handle(request, response).then(handled => {
          if (!handled) next();
        }, next);
      });
    },
    closeBundle() {
      gateway?.close();
      gateway = undefined;
    },
  };
}
