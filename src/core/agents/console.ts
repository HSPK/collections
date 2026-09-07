import './style.css';
import { query } from '../page';
import { createWorkspaceDialog } from '../workspace';
import type { WorkspaceLifecycle } from '../workspace';
import {
  CONNECTION_STORAGE_KEY, connectionEvents, forgetApiKey, readConnection, refreshConnection, saveConnection, transientConnection,
} from './config';
import { listModels, runAgent } from './client';
import type { AgentRequest } from './client';
import { AgentError } from './errors';

interface AgentPage extends WorkspaceLifecycle {
  report(message: string): void;
}

interface ConsoleOptions {
  gameId: string;
  host: HTMLElement;
  onBusyChange?(busy: boolean): void;
}

export interface GameAgentTurn<T> extends AgentRequest<T> {
  label: string;
  getRevision(): number;
  commit(plan: T): void;
}

interface Trace {
  label: string;
  message: string;
  outcome: 'accepted' | 'error' | 'cancelled';
  requests?: number;
  tokens?: number;
}

export function createAgentConsole(page: AgentPage, options: ConsoleOptions) {
  page.signal.throwIfAborted();
  if (!/^[a-z][a-z0-9-]*$/.test(options.gameId)) throw new Error('Agent consoles need a valid game identifier.');
  const host = options.host;
  host.classList.add('agent-console');
  host.innerHTML = `<button type="button" data-agent-connect aria-label="Model settings">Model</button>
    <p data-agent-status role="status" aria-live="polite" aria-atomic="true"></p>
    <button type="button" data-agent-log aria-label="Agent action log">Log</button>
    <button type="button" data-agent-cancel hidden>Cancel</button>`;
  const status = query<HTMLElement>(host, '[data-agent-status]');
  const cancelButton = query<HTMLButtonElement>(host, '[data-agent-cancel]');
  const settings = document.createElement('section');
  settings.className = 'agent-settings';
  settings.innerHTML = `
    <p>This game needs a model that supports OpenAI-compatible Chat Completions and function tools. Nothing is sent until you request a turn or fetch models.</p>
    <form data-agent-settings-form>
      <label>Endpoint <input name="endpoint" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://your-gateway.example/v1" required data-agent-endpoint></label>
      <p class="agent-help">Include the base path, usually /v1. On this repository's local game server, use its /api/openai/v1 endpoint. Public HTTPS pages cannot reach every local server; CORS and local-network permissions still apply.</p>
      <label>Model <input name="model" autocomplete="off" spellcheck="false" maxlength="200" required data-agent-model></label>
      <label>API key <input name="key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" data-agent-key placeholder="Optional; memory only"></label>
      <p class="agent-help">Prefer your own server-side gateway for keys. A browser key stays in this tab's memory, disappears on reload, and is never saved or exported. Leaving it blank keeps a key only for the same endpoint.</p>
      <div class="agent-settings-actions">
        <button type="button" data-agent-models>Fetch models</button>
        <button type="submit">Save connection</button>
        <button type="button" data-agent-forget>Forget key</button>
      </div>
    </form>
    <p data-agent-settings-status role="status" aria-live="polite"></p>
    <p class="agent-help">Each game decision uses at most two bounded requests: one plan and, only if its rules are invalid, one correction. A provider may charge for both. Cancelling prevents a game commit but cannot undo tokens already processed. Model output is untrusted; the local rules decide what is legal.</p>`;
  const settingsStatus = query<HTMLElement>(settings, '[data-agent-settings-status]');
  const endpointInput = query<HTMLInputElement>(settings, '[data-agent-endpoint]');
  const modelInput = query<HTMLInputElement>(settings, '[data-agent-model]');
  const keyInput = query<HTMLInputElement>(settings, '[data-agent-key]');
  const modelButton = query<HTMLButtonElement>(settings, '[data-agent-models]');
  const datalist = document.createElement('datalist');
  datalist.id = `${options.gameId}-available-models`;
  modelInput.setAttribute('list', datalist.id);
  settings.append(datalist);
  const settingsDialog = createWorkspaceDialog(page, {
    id: `${options.gameId}-model-connection`, title: 'Model connection', content: [settings], className: 'agent-dialog',
  });
  const traceContent = document.createElement('section');
  traceContent.className = 'agent-trace';
  const traceIntro = document.createElement('p');
  traceIntro.textContent = 'Public intentions and accepted game actions only. No private model reasoning is requested or displayed.';
  const traceList = document.createElement('ol');
  const traceStatus = document.createElement('p');
  traceStatus.setAttribute('role', 'status');
  traceStatus.textContent = 'No model turns yet.';
  traceContent.append(traceIntro, traceStatus, traceList);
  const traceDialog = createWorkspaceDialog(page, {
    id: `${options.gameId}-agent-log`, title: 'Agent action log', content: [traceContent], className: 'agent-dialog',
    triggers: [query(host, '[data-agent-log]')],
  });
  const traces: Trace[] = [];
  let running: AbortController | undefined;
  let modelRequest: AbortController | undefined;
  let generation = 0;
  let lastStatus = 'Model required. Ready when you are.';
  let disposed = false;

  function setStatus(message: string, error = false) {
    if (disposed || page.signal.aborted) return;
    lastStatus = message;
    status.textContent = message;
    status.title = message;
    host.dataset.agentError = String(error);
    if (settingsDialog.dialog.open) settingsStatus.textContent = message;
    if (traceDialog.dialog.open) traceStatus.textContent = message;
    if (error) page.report(message);
  }

  function addTrace(entry: Trace) {
    if (disposed || page.signal.aborted) return;
    traces.unshift(entry);
    if (traces.length > 24) traces.pop();
    traceList.replaceChildren(...traces.map(trace => {
      const item = document.createElement('li');
      item.dataset.outcome = trace.outcome;
      const title = document.createElement('strong');
      title.textContent = trace.label;
      const message = document.createElement('p');
      message.textContent = trace.message;
      item.append(title, message);
      if (trace.requests !== undefined) {
        const detail = document.createElement('p');
        detail.className = 'agent-help';
        detail.textContent = `${trace.requests} request${trace.requests === 1 ? '' : 's'}${trace.tokens ? ` / ${trace.tokens} reported tokens` : ''}`;
        item.append(detail);
      }
      return item;
    }));
    traceStatus.textContent = entry.outcome === 'accepted' ? 'Latest plan accepted by the game rules.' : entry.message;
  }

  function busyChanged() {
    if (disposed || page.signal.aborted) return;
    cancelButton.hidden = !running;
    host.setAttribute('aria-busy', String(Boolean(running)));
    page.root.dataset.agentBusy = String(Boolean(running));
    options.onBusyChange?.(Boolean(running));
  }

  function cancel(message = 'Turn cancelled. No pending model actions were committed.') {
    generation++;
    if (running) {
      running.abort();
      running = undefined;
      setStatus(message);
      addTrace({ label: 'Cancelled', message, outcome: 'cancelled' });
      busyChanged();
    }
  }

  function openSettings() {
    const connection = readConnection(message => setStatus(message, true));
    endpointInput.value = connection.endpoint;
    modelInput.value = connection.model;
    keyInput.value = '';
    settingsStatus.textContent = connection.apiKey ? 'A key is currently held in this tab for this endpoint.' :
      'Only the endpoint and model preference are saved. Keys are never stored.';
    settingsDialog.open();
  }

  function invalidateModels(message = 'Connection details changed. Fetch models again for this connection.', clearList = true) {
    const pending = Boolean(modelRequest);
    modelRequest?.abort();
    modelRequest = undefined;
    modelButton.disabled = false;
    if (clearList) datalist.replaceChildren();
    if (pending && settingsDialog.dialog.open) settingsStatus.textContent = message;
  }

  for (const input of [endpointInput, keyInput, modelInput]) {
    input.addEventListener('input', () => invalidateModels(undefined, input !== modelInput), { signal: page.signal });
  }
  query(host, '[data-agent-connect]').addEventListener('click', openSettings, { signal: page.signal });
  cancelButton.addEventListener('click', () => cancel(), { signal: page.signal });
  query(settings, '[data-agent-settings-form]').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const saved = saveConnection(endpointInput.value, modelInput.value, keyInput.value, message => { settingsStatus.textContent = message; });
      if (saved) {
        keyInput.value = '';
        settingsStatus.textContent = 'Connection saved. Return to the game and choose your next action; saving does not start a model turn.';
        setStatus('Connection saved. Choose a game action to request a model turn.');
      } else {
        keyInput.value = '';
        setStatus('Connection is available for this tab, but browser storage failed. Keep the tab open or export your work.', true);
      }
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      settingsStatus.textContent = error.message;
    }
  }, { signal: page.signal });
  query(settings, '[data-agent-forget]').addEventListener('click', () => {
    forgetApiKey();
    keyInput.value = '';
    settingsStatus.textContent = 'The in-memory key has been forgotten. Your server may still provide its own authentication.';
  }, { signal: page.signal });
  modelButton.addEventListener('click', async () => {
    invalidateModels();
    const controller = new AbortController();
    modelRequest = controller;
    modelButton.disabled = true;
    settingsStatus.textContent = 'Requesting the available model IDs...';
    try {
      const connection = transientConnection(endpointInput.value, modelInput.value || 'model-list', keyInput.value);
      const models = await listModels(connection, controller.signal);
      if (modelRequest !== controller || controller.signal.aborted || disposed || page.signal.aborted) return;
      datalist.replaceChildren(...models.map(id => {
        const option = document.createElement('option');
        option.value = id;
        return option;
      }));
      settingsStatus.textContent = `${models.length} model IDs loaded. Choose a text model with function-tool support, then save. A model listing does not prove tool support.`;
      modelInput.focus();
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      if (modelRequest === controller && !disposed && !page.signal.aborted) settingsStatus.textContent = error.message;
    } finally {
      if (modelRequest === controller) {
        modelRequest = undefined;
        if (!disposed) modelButton.disabled = false;
      }
    }
  }, { signal: page.signal });
  settingsDialog.dialog.addEventListener('close', () => {
    invalidateModels('Model discovery cancelled.');
    keyInput.value = '';
  }, { signal: page.signal });
  function connectionChanged() {
    invalidateModels();
    cancel('Connection changed. The pending turn was cancelled; choose an action to try again.');
  }
  connectionEvents.addEventListener('change', connectionChanged, { signal: page.signal });
  window.addEventListener('storage', event => {
    if (event.key === CONNECTION_STORAGE_KEY || event.key === null) {
      refreshConnection();
      connectionChanged();
    }
  }, { signal: page.signal });
  page.onCleanup(() => {
    disposed = true;
    generation++;
    running?.abort();
    modelRequest?.abort();
    running = undefined;
    keyInput.value = '';
  });
  setStatus(lastStatus);
  page.root.dataset.agentBusy = 'false';

  async function turn<T>(request: GameAgentTurn<T>): Promise<boolean> {
    if (disposed || page.signal.aborted) return false;
    if (running) {
      setStatus('A model turn is already running. Wait for it or choose Cancel.');
      return false;
    }
    const connection = readConnection(message => setStatus(message, true));
    if (!connection.endpoint || !connection.model) {
      openSettings();
      setStatus('Set your endpoint and model, save the connection, then retry the game action.');
      return false;
    }
    const controller = new AbortController();
    running = controller;
    const ticket = ++generation;
    const revision = request.getRevision();
    busyChanged();
    try {
      const result = await runAgent(connection, request, controller.signal, progress => {
        if (running !== controller) return;
        setStatus(progress.repairing ? `${request.label}: correcting an illegal plan (2/2).` : `${request.label}: requesting a plan (1/2).`);
      });
      if (disposed || page.signal.aborted || controller.signal.aborted || generation !== ticket ||
          request.getRevision() !== revision) {
        throw new AgentError('cancelled', 'The game changed before the model finished. Its stale plan was discarded.');
      }
      request.commit(result.plan);
      addTrace({
        label: request.label, message: result.summary, outcome: 'accepted',
        requests: result.requests, tokens: result.inputTokens + result.outputTokens,
      });
      setStatus(result.summary);
      return true;
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      if (running === controller && !disposed && !page.signal.aborted) {
        setStatus(error.message, error.code !== 'cancelled');
        addTrace({ label: request.label, message: error.message, outcome: error.code === 'cancelled' ? 'cancelled' : 'error' });
      }
      return false;
    } finally {
      if (running === controller) {
        running = undefined;
        busyChanged();
      }
    }
  }

  return {
    turn, cancel, openSettings,
    get busy() { return Boolean(running); },
    get status() { return lastStatus; },
    get element() { return host; },
  };
}
