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
import { agentLocale } from './locale';
import type { AgentLocale } from './locale';

interface AgentPage extends WorkspaceLifecycle {
  report(message: string): void;
}

interface ConsoleOptions {
  gameId: string;
  host: HTMLElement;
  locale?: AgentLocale;
  preflight?(): void;
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
  const locale = agentLocale(options.locale);
  const copy = locale.console;
  const host = options.host;
  host.classList.add('agent-console');
  host.innerHTML = `<button type="button" data-agent-connect aria-label="${copy.modelSettings}">${copy.model}</button>
    <p data-agent-status role="status" aria-live="polite" aria-atomic="true"></p>
    <button type="button" data-agent-log aria-label="${copy.actionLog}">${copy.log}</button>
    <button type="button" data-agent-cancel hidden>${copy.cancel}</button>`;
  const status = query<HTMLElement>(host, '[data-agent-status]');
  const cancelButton = query<HTMLButtonElement>(host, '[data-agent-cancel]');
  const settings = document.createElement('section');
  settings.className = 'agent-settings';
  settings.innerHTML = `
    <p>${copy.introduction}</p>
    <form data-agent-settings-form>
      <label>${copy.endpoint} <input name="endpoint" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://your-gateway.example/v1" required data-agent-endpoint></label>
      <p class="agent-help">${copy.endpointHelp}</p>
      <label>${copy.model} <input name="model" autocomplete="off" spellcheck="false" maxlength="200" required data-agent-model></label>
      <label>${copy.key} <input name="key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" data-agent-key placeholder="${copy.keyPlaceholder}"></label>
      <p class="agent-help">${copy.keyHelp}</p>
      <div class="agent-settings-actions">
        <button type="button" data-agent-models>${copy.fetchModels}</button>
        <button type="submit">${copy.save}</button>
        <button type="button" data-agent-forget>${copy.forget}</button>
      </div>
    </form>
    <p data-agent-settings-status role="status" aria-live="polite"></p>
    <p class="agent-help">${copy.boundsHelp}</p>`;
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
    id: `${options.gameId}-model-connection`, title: copy.connection, content: [settings], className: 'agent-dialog', closeLabel: locale.close,
  });
  const traceContent = document.createElement('section');
  traceContent.className = 'agent-trace';
  const traceIntro = document.createElement('p');
  traceIntro.textContent = copy.traceIntroduction;
  const traceList = document.createElement('ol');
  const traceStatus = document.createElement('p');
  traceStatus.setAttribute('role', 'status');
  traceStatus.textContent = copy.noTurns;
  traceContent.append(traceIntro, traceStatus, traceList);
  const traceDialog = createWorkspaceDialog(page, {
    id: `${options.gameId}-agent-log`, title: copy.actionLog, content: [traceContent], className: 'agent-dialog', closeLabel: locale.close,
    triggers: [query(host, '[data-agent-log]')],
  });
  const traces: Trace[] = [];
  let running: AbortController | undefined;
  let modelRequest: AbortController | undefined;
  let generation = 0;
  let lastStatus = copy.ready;
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
        detail.textContent = copy.usage(trace.requests, trace.tokens);
        item.append(detail);
      }
      return item;
    }));
    traceStatus.textContent = entry.outcome === 'accepted' ? copy.accepted : entry.message;
  }

  function busyChanged() {
    if (disposed || page.signal.aborted) return;
    cancelButton.hidden = !running;
    host.setAttribute('aria-busy', String(Boolean(running)));
    page.root.dataset.agentBusy = String(Boolean(running));
    options.onBusyChange?.(Boolean(running));
  }

  function cancel(message = copy.cancelled) {
    generation++;
    if (running) {
      running.abort();
      running = undefined;
      setStatus(message);
      addTrace({ label: copy.cancelledLabel, message, outcome: 'cancelled' });
      busyChanged();
    }
  }

  function openSettings() {
    const connection = readConnection(message => setStatus(locale.storageNotice(message), true));
    endpointInput.value = connection.endpoint;
    modelInput.value = connection.model;
    keyInput.value = '';
    if (options.locale === 'zh-CN') {
      endpointInput.setCustomValidity('');
      modelInput.setCustomValidity('');
    }
    settingsStatus.textContent = connection.apiKey ? copy.keyHeld : copy.preferencesOnly;
    settingsDialog.open();
  }

  function invalidateModels(message = copy.connectionEdited, clearList = true) {
    const pending = Boolean(modelRequest);
    modelRequest?.abort();
    modelRequest = undefined;
    modelButton.disabled = false;
    if (clearList) datalist.replaceChildren();
    if (pending && settingsDialog.dialog.open) settingsStatus.textContent = message;
  }

  for (const input of [endpointInput, keyInput, modelInput]) {
    input.addEventListener('input', () => {
      if (options.locale === 'zh-CN') input.setCustomValidity('');
      invalidateModels(undefined, input !== modelInput);
    }, { signal: page.signal });
  }
  if (options.locale === 'zh-CN') {
    for (const input of [endpointInput, modelInput]) {
      input.addEventListener('invalid', () => {
        if (input.validity.valueMissing) input.setCustomValidity(input === endpointInput ? copy.endpointRequired : copy.modelRequired);
        else if (input.validity.typeMismatch) input.setCustomValidity(copy.endpointInvalid);
      }, { signal: page.signal });
    }
  }
  query(host, '[data-agent-connect]').addEventListener('click', openSettings, { signal: page.signal });
  cancelButton.addEventListener('click', () => cancel(), { signal: page.signal });
  query(settings, '[data-agent-settings-form]').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const saved = saveConnection(endpointInput.value, modelInput.value, keyInput.value, message => { settingsStatus.textContent = locale.storageNotice(message); });
      if (saved) {
        keyInput.value = '';
        settingsStatus.textContent = copy.savedHelp;
        setStatus(copy.saved);
      } else {
        keyInput.value = '';
        setStatus(copy.storageFailed, true);
      }
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      settingsStatus.textContent = copy.error(error);
    }
  }, { signal: page.signal });
  query(settings, '[data-agent-forget]').addEventListener('click', () => {
    forgetApiKey();
    keyInput.value = '';
    settingsStatus.textContent = copy.forgotten;
  }, { signal: page.signal });
  modelButton.addEventListener('click', async () => {
    invalidateModels();
    const controller = new AbortController();
    modelRequest = controller;
    modelButton.disabled = true;
    settingsStatus.textContent = copy.fetching;
    try {
      const connection = transientConnection(endpointInput.value, modelInput.value || 'model-list', keyInput.value);
      const models = await listModels(connection, controller.signal);
      if (modelRequest !== controller || controller.signal.aborted || disposed || page.signal.aborted) return;
      datalist.replaceChildren(...models.map(id => {
        const option = document.createElement('option');
        option.value = id;
        return option;
      }));
      settingsStatus.textContent = copy.modelsLoaded(models.length);
      modelInput.focus();
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      if (modelRequest === controller && !disposed && !page.signal.aborted) settingsStatus.textContent = copy.error(error);
    } finally {
      if (modelRequest === controller) {
        modelRequest = undefined;
        if (!disposed) modelButton.disabled = false;
      }
    }
  }, { signal: page.signal });
  settingsDialog.dialog.addEventListener('close', () => {
    invalidateModels(copy.discoveryCancelled);
    keyInput.value = '';
  }, { signal: page.signal });
  function connectionChanged() {
    invalidateModels();
    cancel(copy.connectionChanged);
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
      setStatus(copy.alreadyRunning);
      return false;
    }
    const connection = readConnection(message => setStatus(locale.storageNotice(message), true));
    if (!connection.endpoint || !connection.model) {
      openSettings();
      setStatus(copy.configure);
      return false;
    }
    const controller = new AbortController();
    running = controller;
    const ticket = ++generation;
    const revision = request.getRevision();
    busyChanged();
    try {
      options.preflight?.();
      const result = await runAgent(connection, request, controller.signal, progress => {
        if (running !== controller) return;
        setStatus(progress.repairing ? copy.correcting(request.label) : copy.requesting(request.label));
      });
      if (disposed || page.signal.aborted || controller.signal.aborted || generation !== ticket ||
          request.getRevision() !== revision) {
        throw new AgentError('cancelled', copy.stalePlan);
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
        const message = copy.error(error);
        setStatus(message, error.code !== 'cancelled');
        addTrace({ label: request.label, message, outcome: error.code === 'cancelled' ? 'cancelled' : 'error' });
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
