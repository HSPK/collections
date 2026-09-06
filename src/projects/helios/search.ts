import { eventKey } from './eclipse';
import type { EventReply, EventRequest, LocalEvent } from './eclipse';
export class EclipseSearch {
  private cancelPending: (() => void) | null = null;
  private cache = new Map<string, LocalEvent | null>();
  private closed = false;
  cancel(): void { this.cancelPending?.(); this.cancelPending = null; }
  async find(request: EventRequest): Promise<LocalEvent | null> {
    this.cancel();
    if (this.closed) throw new DOMException('The observatory is closed.', 'AbortError');
    const key = eventKey(request.time, request.site);
    if (request.mode === 'current' && this.cache.has(key)) {
      const cached = this.cache.get(key);
      return cached ? structuredClone(cached) : null;
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./eclipse.worker.ts', import.meta.url), { type: 'module' });
      let settled = false;
      const clean = () => {
        settled = true; clearTimeout(timeout); worker.onmessage = null; worker.onerror = null;
        worker.terminate(); this.cancelPending = null;
      };
      const timeout = window.setTimeout(() => {
        clean();
        reject(new Error('The eclipse search exceeded 12 seconds. No state was changed; try another date or location.'));
      }, 12000);
      this.cancelPending = () => { clean(); reject(new DOMException('A newer observation owns this search.', 'AbortError')); };
      worker.onmessage = (message: MessageEvent<EventReply>) => {
        if (settled) return;
        clean();
        if (!message.data.ok) { reject(new Error(message.data.error)); return; }
        if (request.mode === 'current') {
          this.cache.set(key, message.data.event);
          if (this.cache.size > 24) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
          }
        }
        resolve(message.data.event);
      };
      worker.onerror = (event) => {
        if (settled) return;
        clean(); reject(new Error(`Eclipse worker failed: ${event.message}`));
      };
      worker.postMessage(request);
    });
  }
  destroy(): void { this.closed = true; this.cancel(); this.cache.clear(); }
}
