/// <reference lib="webworker" />
import { meshSolid } from './mesh';
import type { MeshResult } from './mesh';
import { sliceSolid } from './slice';
import type { SliceResult } from './slice';
import { validateDocument } from './state';
import type { Document } from './model';

export interface ComputeRequest { revision: number; document: Document; mesh: boolean }
export type ComputeResponse = { revision: number; ok: true; mesh: MeshResult | null; slice: SliceResult }
  | { revision: number; ok: false; error: string };
const worker = self as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { revision } = event.data;
  try {
    const document = validateDocument(event.data.document);
    const mesh = event.data.mesh ? meshSolid(document) : null;
    const slice = sliceSolid(document);
    const response: ComputeResponse = { revision, ok: true, mesh, slice };
    worker.postMessage(response, mesh ? [mesh.positions.buffer, mesh.normals.buffer] : []);
  } catch (error) {
    // The worker boundary reports failures; it never substitutes a successful-looking shape.
    worker.postMessage({ revision, ok: false, error: error instanceof Error ? error.message : 'Geometry calculation failed.' } satisfies ComputeResponse);
  }
};
