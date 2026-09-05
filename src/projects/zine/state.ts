import { cloneDocument, isZineDocument, validateDocument, type ZineDocument } from './engine';

export const STORAGE_KEY = 'odd-index.zine.draft.v1';
const HISTORY_LIMIT = 60;

export interface DraftHistory {
  past: ZineDocument[];
  present: ZineDocument;
  future: ZineDocument[];
}

export function createHistory(document: ZineDocument): DraftHistory {
  return { past: [], present: cloneDocument(document), future: [] };
}

export function changeDocument(history: DraftHistory, next: ZineDocument, merge = false): void {
  if (JSON.stringify(next) === JSON.stringify(history.present)) return;
  if (!merge) {
    history.past.push(cloneDocument(history.present));
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
  }
  history.present = cloneDocument(next);
  history.future = [];
}

export function undo(history: DraftHistory): boolean {
  const previous = history.past.pop();
  if (!previous) return false;
  history.future.push(cloneDocument(history.present));
  history.present = previous;
  return true;
}

export function redo(history: DraftHistory): boolean {
  const next = history.future.pop();
  if (!next) return false;
  history.past.push(cloneDocument(history.present));
  history.present = next;
  return true;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type StorageAccess = () => DraftStorage;

export type LoadResult =
  | { status: 'restored'; document: ZineDocument }
  | { status: 'empty' | 'invalid' | 'unavailable' };

export function loadDraft(access: StorageAccess): LoadResult {
  let stored: string | null;
  try {
    stored = access().getItem(STORAGE_KEY);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { status: 'unavailable' };
  }
  if (stored === null) return { status: 'empty' };
  if (stored.length > 80000) return { status: 'invalid' };
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: 'invalid' };
  }
  if (!isZineDocument(value)) return { status: 'invalid' };
  return { status: 'restored', document: cloneDocument(value) };
}

export function saveDraft(access: StorageAccess, document: ZineDocument): boolean {
  if (validateDocument(document).length) return false;
  try {
    access().setItem(STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return false;
  }
}
