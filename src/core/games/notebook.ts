import '../agents/style.css';
import { downloadText, query, readLocalData, writeLocalData } from '../page';
import { createWorkspaceDialog } from '../workspace';
import type { WorkspaceLifecycle } from '../workspace';
import { AgentValidationError } from '../agents/errors';
import { agentLocale } from '../agents/locale';
import type { AgentLocale } from '../agents/locale';
import { MAX_SAVE_CHARACTERS } from './session';
import type { GameSession } from './session';

interface NotebookPage extends WorkspaceLifecycle {
  report(message: string): void;
}

interface NotebookOptions<S, C> {
  gameId: string;
  session: GameSession<S, C>;
  trigger: HTMLElement;
  locale?: AgentLocale;
  beforeRestore(): void;
  afterRestore(): void;
  onNotice?(message: string): void;
}

export function createGameNotebook<S, C>(page: NotebookPage, options: NotebookOptions<S, C>) {
  const locale = agentLocale(options.locale);
  const copy = locale.notebook;
  const key = `odd-index:game:${options.gameId}:v1`;
  const content = document.createElement('section');
  content.className = 'game-notebook-content';
  content.innerHTML = `
    <p>${copy.introduction}</p>
    <div class="game-notebook-actions"><button type="button" data-game-export>${copy.export}</button></div>
    <hr>
    <label>${copy.import} <input type="file" accept=".json,application/json" data-game-import></label>
    <p>${copy.importHelp}</p>
    <p data-game-save-status role="status" aria-live="polite"></p>`;
  const status = query<HTMLElement>(content, '[data-game-save-status]');
  const dialog = createWorkspaceDialog(page, {
    id: `${options.gameId}-notebook`, title: copy.title, content: [content], triggers: [options.trigger], className: 'game-notebook', closeLabel: locale.close,
  });
  let importing = 0;
  let saveFailure = '';
  function notice(message: string, error = false) {
    if (page.signal.aborted) return;
    status.textContent = message;
    options.onNotice?.(message);
    if (error) page.report(message);
  }
  function restore(encoded: string) {
    saveFailure = '';
    options.beforeRestore();
    options.session.restore(encoded);
    options.afterRestore();
  }
  const stored = readLocalData(key, (value): value is string => typeof value === 'string', message => notice(locale.storageNotice(message), true));
  if (stored !== undefined) {
    try {
      restore(stored);
      notice(copy.restored);
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(copy.restoreFailed(error.message), true);
    }
  }
  page.onCleanup(options.session.subscribe(() => {
    importing++;
    saveFailure = '';
    const saved = writeLocalData(key, options.session.serialize(), message => {
      saveFailure = locale.storageNotice(message);
      notice(saveFailure, true);
    });
    if (saved) status.textContent = copy.saved(options.session.moveCount);
  }));
  query(content, '[data-game-export]').addEventListener('click', () => {
    downloadText(`${options.gameId}-replay.json`, options.session.serialize(), 'application/json');
    notice(copy.exported);
  }, { signal: page.signal });
  const input = query<HTMLInputElement>(content, '[data-game-import]');
  if (options.locale === 'zh-CN') {
    // Native file-input chrome follows the browser language, not the game's locale.
    input.hidden = true;
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.textContent = copy.chooseFile;
    choose.addEventListener('click', () => input.click(), { signal: page.signal });
    query(content, 'label').after(choose);
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const ticket = ++importing;
    const revision = options.session.revision;
    input.value = '';
    if (file.size > MAX_SAVE_CHARACTERS) {
      notice(copy.tooLarge, true);
      return;
    }
    try {
      const encoded = await file.text();
      if (page.signal.aborted) return;
      if (ticket !== importing || revision !== options.session.revision) {
        notice(copy.staleImport, true);
        return;
      }
      restore(encoded);
      notice(options.locale === 'zh-CN' && saveFailure ? `${copy.imported} ${saveFailure}` : copy.imported);
    } catch (error) {
      if (error instanceof AgentValidationError) notice(copy.rejected(error.message), true);
      else if (error instanceof DOMException) notice(copy.readFailed(error.name), true);
      else throw error;
    }
  }, { signal: page.signal });
  page.onCleanup(() => { importing++; });
  return { open: dialog.open, close: dialog.close, notice };
}
