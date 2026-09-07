import '../agents/style.css';
import { downloadText, query, readLocalData, writeLocalData } from '../page';
import { createWorkspaceDialog } from '../workspace';
import type { WorkspaceLifecycle } from '../workspace';
import { AgentValidationError } from '../agents/errors';
import { MAX_SAVE_CHARACTERS } from './session';
import type { GameSession } from './session';

interface NotebookPage extends WorkspaceLifecycle {
  report(message: string): void;
}

interface NotebookOptions<S, C> {
  gameId: string;
  session: GameSession<S, C>;
  trigger: HTMLElement;
  beforeRestore(): void;
  afterRestore(): void;
  onNotice?(message: string): void;
}

export function createGameNotebook<S, C>(page: NotebookPage, options: NotebookOptions<S, C>) {
  const key = `odd-index:game:${options.gameId}:v1`;
  const content = document.createElement('section');
  content.className = 'game-notebook-content';
  content.innerHTML = `
    <p>Your game is saved in this browser after each accepted move. Export a replay to keep it elsewhere. Replays contain fictional game moves, not connection settings or API keys.</p>
    <div class="game-notebook-actions"><button type="button" data-game-export>Export replay</button></div>
    <hr>
    <label>Import a replay <input type="file" accept=".json,application/json" data-game-import></label>
    <p>Import replaces the current game only after every recorded move passes the current rules. It cancels any pending agent plan and never contacts a model.</p>
    <p data-game-save-status role="status" aria-live="polite"></p>`;
  const status = query<HTMLElement>(content, '[data-game-save-status]');
  const dialog = createWorkspaceDialog(page, {
    id: `${options.gameId}-notebook`, title: 'Game notebook', content: [content], triggers: [options.trigger], className: 'game-notebook',
  });
  let importing = 0;
  function notice(message: string, error = false) {
    if (page.signal.aborted) return;
    status.textContent = message;
    options.onNotice?.(message);
    if (error) page.report(message);
  }
  function restore(encoded: string) {
    options.beforeRestore();
    options.session.restore(encoded);
    options.afterRestore();
  }
  const stored = readLocalData(key, (value): value is string => typeof value === 'string', message => notice(message, true));
  if (stored !== undefined) {
    try {
      restore(stored);
      notice('The saved game was restored. No model request was made.');
    } catch (error) {
      if (!(error instanceof AgentValidationError)) throw error;
      notice(`The saved replay could not be restored: ${error.message} Your fresh game remains unchanged.`, true);
    }
  }
  page.onCleanup(options.session.subscribe(() => {
    importing++;
    const saved = writeLocalData(key, options.session.serialize(), message => notice(message, true));
    if (saved) status.textContent = `${options.session.moveCount} accepted moves saved in this browser.`;
  }));
  query(content, '[data-game-export]').addEventListener('click', () => {
    downloadText(`${options.gameId}-replay.json`, options.session.serialize(), 'application/json');
    notice('Replay exported without API settings or keys.');
  }, { signal: page.signal });
  const input = query<HTMLInputElement>(content, '[data-game-import]');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const ticket = ++importing;
    const revision = options.session.revision;
    input.value = '';
    if (file.size > MAX_SAVE_CHARACTERS) {
      notice('This file exceeds the replay size limit. The current game was not changed.', true);
      return;
    }
    try {
      const encoded = await file.text();
      if (page.signal.aborted) return;
      if (ticket !== importing || revision !== options.session.revision) {
        notice('The game changed while the replay was being read. Choose the file again to replace the newer game.', true);
        return;
      }
      restore(encoded);
      notice('Replay imported. Every recorded move passed the game rules; no model was called.');
    } catch (error) {
      if (error instanceof AgentValidationError) notice(`Replay rejected: ${error.message} The current game was not changed.`, true);
      else if (error instanceof DOMException) notice(`The browser could not read this replay (${error.name}). The current game was not changed.`, true);
      else throw error;
    }
  }, { signal: page.signal });
  page.onCleanup(() => { importing++; });
  return { open: dialog.open, close: dialog.close, notice };
}
