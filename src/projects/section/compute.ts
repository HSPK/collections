import type { Document } from './model';
import type { ComputeRequest, ComputeResponse } from './compute.worker';
import { RevisionGate } from './state';

export class ComputeClient {
  private worker: Worker | null = null;
  private timer = 0;
  private gate = new RevisionGate();
  constructor(private result: (response: ComputeResponse) => void) {}
  request(document: Document, mesh: boolean, immediate = false): number {
    const revision = this.gate.next();
    window.clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (!this.gate.accepts(revision)) return;
      const fail = (error: string) => {
        if (this.gate.accepts(revision)) this.result({ revision, ok: false, error });
      };
      if (typeof Worker !== 'function') {
        fail('Geometry workers are unavailable in this browser. Use a browser that supports module workers.');
        return;
      }
      let worker: Worker;
      try {
        worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        fail(`Geometry worker could not start (${error.name}). Check the browser or document worker policy, then retry the edit.`);
        return;
      }
      this.worker = worker;
      const finish = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };
      worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
        finish();
        if (this.gate.accepts(event.data.revision)) this.result(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish();
        fail(`Geometry worker failed: ${event.message}`);
      };
      try {
        worker.postMessage({ revision, document, mesh } satisfies ComputeRequest);
      } catch (error) {
        finish();
        if (!(error instanceof DOMException)) throw error;
        fail(`Geometry request could not be sent (${error.name}). The construction is still available to save.`);
      }
    }, immediate ? 0 : 100);
    return revision;
  }
  destroy() {
    this.gate.close(); window.clearTimeout(this.timer); this.worker?.terminate(); this.worker = null;
  }
}
