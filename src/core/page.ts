import type { ProjectContext } from './types';

export { escapeMarkup } from './markup';

export function createProjectPage(context: ProjectContext, id: string) {
  context.signal.throwIfAborted();
  const root = document.createElement('section');
  root.className = `project-app project-${id}`;
  context.container.append(root);
  const events = new AbortController();
  const cleanups: (() => void)[] = [];
  let disposed = false;

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    events.abort();
    for (const cleanup of cleanups.reverse()) cleanup();
    root.remove();
  };
  context.signal.addEventListener('abort', destroy, { once: true, signal: events.signal });
  return {
    root,
    signal: events.signal,
    report: context.report,
    onCleanup(cleanup: () => void) {
      if (disposed) cleanup();
      else cleanups.push(cleanup);
    },
    destroy,
  };
}

export function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The project is missing a required element: ${selector}`);
  return element;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export async function copyText(text: string, report: (message: string) => void): Promise<boolean> {
  if (!navigator.clipboard) {
    report('Clipboard access is unavailable. Select the text and copy it manually.');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    report('Copied to your clipboard.');
    return true;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    report('Your browser blocked copying. Select the text and copy it manually.');
    return false;
  }
}

export function readLocalData<T>(
  key: string,
  validate: (value: unknown) => value is T,
  report: (message: string) => void,
): T | undefined {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return undefined;
    const value: unknown = JSON.parse(stored);
    if (validate(value)) return value;
    report('The saved data has an older or invalid format. Starting a fresh session.');
    return undefined;
  } catch (error) {
    if (!(error instanceof DOMException) && !(error instanceof SyntaxError)) throw error;
    report('Saved data could not be read. This session still works without it.');
    return undefined;
  }
}

export function writeLocalData(key: string, value: unknown, report: (message: string) => void): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    report('Your browser could not save this session. Keep the page open to retain your work.');
    return false;
  }
}
