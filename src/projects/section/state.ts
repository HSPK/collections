import { clone, KINDS, LIMITS, OPERATIONS } from './model';
import type { Document, Primitive, Vec3 } from './model';

export class ValidationError extends Error {}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function finite(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${label} must be a finite number from ${min} to ${max}.`);
  return value;
}
function vector(value: unknown, min: number, max: number, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new ValidationError(`${label} needs exactly three coordinates.`);
  return [finite(value[0], min, max, label), finite(value[1], min, max, label), finite(value[2], min, max, label)];
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new ValidationError(`${label} needs 1-${max} printable characters.`);
  return value;
}
export function validateDocument(value: unknown): Document {
  if (!record(value) || value.version !== 1 || value.units !== 'mm') throw new ValidationError('Expected SECTION version 1, with units "mm".');
  if (!Array.isArray(value.primitives) || value.primitives.length > LIMITS.primitives) throw new ValidationError(`Use at most ${LIMITS.primitives} primitive operations.`);
  const ids = new Set<string>();
  const primitives: Primitive[] = value.primitives.map((item: unknown) => {
    if (!record(item)) throw new ValidationError('Every operation must be an object.');
    const id = text(item.id, 40, 'Primitive ID');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new ValidationError('Primitive IDs must be unique letters, numbers, dashes or underscores.');
    ids.add(id);
    const kind = KINDS.find((entry) => entry === item.kind);
    const operation = OPERATIONS.find((entry) => entry === item.operation);
    if (!kind || !operation) throw new ValidationError('Unsupported primitive or Boolean operation.');
    const radius = finite(item.radius, 0.4, 80, 'Radius');
    const tube = finite(item.tube, 0.4, 40, 'Tube radius');
    if (kind === 'torus' && radius <= tube) throw new ValidationError('Torus major radius must exceed its tube radius.');
    return {
      id, name: text(item.name, 48, 'Primitive name'), kind, operation,
      position: vector(item.position, -120, 120, 'Translation / mm'),
      rotation: vector(item.rotation, -180, 180, 'Rotation / degrees'),
      size: vector(item.size, 0.4, 160, 'Size / mm'), radius, tube,
    };
  });
  if (!record(value.plane)) throw new ValidationError('A section plane is required.');
  if (value.resolution !== 28 && value.resolution !== 44 && value.resolution !== 64) throw new ValidationError('Resolution must be 28, 44 or 64.');
  return {
    version: 1, units: 'mm', title: text(value.title, 80, 'Study title'), primitives,
    plane: { offset: finite(value.plane.offset, -240, 240, 'Plane offset / mm'), rotation: vector(value.plane.rotation, -180, 180, 'Plane rotation / degrees') },
    resolution: value.resolution,
  };
}
export function parseDocument(source: string): Document {
  if (new TextEncoder().encode(source).length > LIMITS.fileBytes) throw new ValidationError('The file exceeds the 64 KB document limit.');
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ValidationError('This file is not valid JSON. Your current study has not changed.');
  }
  return validateDocument(value);
}
export const serializeDocument = (document: Document): string => JSON.stringify(validateDocument(document), null, 2);

export interface HistoryOrigin {
  readonly baseline: Document;
  readonly studyId: string | null;
}
interface HistorySnapshot {
  document: Document;
  origin: HistoryOrigin;
}
function copySnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return { document: clone(snapshot.document), origin: snapshot.origin };
}
function sameSnapshot(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return a.origin === b.origin && serializeDocument(a.document) === serializeDocument(b.document);
}

export class History {
  private present: HistorySnapshot;
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];
  private baseline: HistorySnapshot | null = null;
  constructor(document: Document, studyId: string | null = null) {
    const next = validateDocument(document);
    this.present = { document: next, origin: { baseline: clone(next), studyId } };
  }
  get current() { return this.present.document; }
  get origin(): HistoryOrigin {
    return { baseline: clone(this.present.origin.baseline), studyId: this.present.origin.studyId };
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  begin() { this.baseline ??= copySnapshot(this.present); }
  private remember(snapshot: HistorySnapshot) {
    this.past.push(snapshot);
    this.past = this.past.slice(-LIMITS.history);
    this.future = [];
  }
  private replace(next: HistorySnapshot) {
    if (sameSnapshot(next, this.present)) return false;
    if (!this.baseline) this.remember(copySnapshot(this.present));
    this.present = next;
    return true;
  }
  change(document: Document) {
    return this.replace({ document: validateDocument(document), origin: this.present.origin });
  }
  load(document: Document, studyId: string | null = null) {
    const next = validateDocument(document);
    this.finish();
    // A load establishes a new origin even when its geometry matches the current edit.
    return this.replace({ document: next, origin: { baseline: clone(next), studyId } });
  }
  finish() {
    if (!this.baseline) return;
    if (!sameSnapshot(this.baseline, this.present)) this.remember(this.baseline);
    this.baseline = null;
  }
  cancel() {
    if (!this.baseline) return false;
    this.present = this.baseline;
    this.baseline = null;
    return true;
  }
  undo() {
    this.finish();
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(copySnapshot(this.present)); this.present = previous; return true;
  }
  redo() {
    this.finish();
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(copySnapshot(this.present)); this.present = next; return true;
  }
}

export class RevisionGate {
  private revision = 0;
  private closed = false;
  next(): number { return ++this.revision; }
  accepts(id: number): boolean { return !this.closed && id === this.revision; }
  close() { this.closed = true; ++this.revision; }
}
