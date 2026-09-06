import { BENCH, ELEMENT_KINDS, MATERIAL_IDS } from './model';
import type { ElementKind, Experiment, OpticalElement } from './model';

export const MAX_ELEMENTS = 24;
export const MAX_EMITTERS = 4;
export const MAX_FILE_BYTES = 200_000;
export const HISTORY_LIMIT = 80;

export class ExperimentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExperimentValidationError';
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExperimentValidationError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) {
    throw new ExperimentValidationError(`${path} must be ${allowEmpty ? 'at most' : '1 to'} ${max} characters.`);
  }
  return value;
}

function number(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ExperimentValidationError(`${path} must be a finite ${integer ? 'whole ' : ''}number from ${min} to ${max}.`);
  }
  return value;
}

function choice<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  const match = choices.find((item) => item === value);
  if (!match) throw new ExperimentValidationError(`${path} must be one of: ${choices.join(', ')}.`);
  return match;
}

function keys(record: Record<string, unknown>, allowed: string[], path: string): void {
  const extra = Object.keys(record).find((key) => !allowed.includes(key));
  if (extra !== undefined) throw new ExperimentValidationError(`${path} has an unknown field: ${JSON.stringify(extra)}.`);
}

export function validateElement(value: unknown, path = 'Element'): OpticalElement {
  const record = object(value, path);
  const kind = choice(record.kind, `${path} type`, ELEMENT_KINDS);
  const id = text(record.id, `${path} ID`, 32);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new ExperimentValidationError(`${path} ID must start with a letter and use lowercase letters, digits or hyphens.`);
  const base = {
    id, label: text(record.label, `${path} label`, 48),
    x: number(record.x, `${path} x`, 20, BENCH.width - 20),
    y: number(record.y, `${path} y`, 20, BENCH.height - 20),
    rotation: number(record.rotation, `${path} angle`, -180, 180),
  };
  const baseKeys = ['id', 'label', 'kind', 'x', 'y', 'rotation'];
  const extraKeys: Record<ElementKind, string[]> = {
    emitter: ['spectrum', 'wavelength', 'rays', 'aperture', 'spread', 'power'],
    prism: ['size', 'material'], lens: ['diameter', 'thickness', 'material'], block: ['width', 'height', 'material'],
    mirror: ['length', 'reflectivity'], detector: ['length'],
  };
  keys(record, [...baseKeys, ...extraKeys[kind]], path);
  const material = () => choice(record.material, `${path} material`, MATERIAL_IDS);
  switch (kind) {
    case 'emitter': return {
      ...base, kind,
      spectrum: choice(record.spectrum, `${path} spectrum`, ['white', 'mono']),
      wavelength: number(record.wavelength, `${path} wavelength (nm)`, 380, 750),
      rays: number(record.rays, `${path} ray samples`, 1, 15, true),
      aperture: number(record.aperture, `${path} aperture (mm)`, 0, 180),
      spread: number(record.spread, `${path} spread (degrees)`, 0, 60),
      power: number(record.power, `${path} power (mW)`, 0.01, 10),
    };
    case 'prism': return { ...base, kind, material: material(), size: number(record.size, `${path} side (mm)`, 40, 360) };
    case 'lens': {
      const diameter = number(record.diameter, `${path} diameter (mm)`, 40, 360);
      return { ...base, kind, material: material(), diameter, thickness: number(record.thickness, `${path} thickness (mm)`, 4, diameter * 0.8) };
    }
    case 'block': return {
      ...base, kind, material: material(), width: number(record.width, `${path} width (mm)`, 15, 300), height: number(record.height, `${path} height (mm)`, 30, 360),
    };
    case 'mirror': return {
      ...base, kind, length: number(record.length, `${path} length (mm)`, 20, 420),
      reflectivity: number(record.reflectivity, `${path} reflectivity`, 0, 1),
    };
    case 'detector': return { ...base, kind, length: number(record.length, `${path} length (mm)`, 10, 480) };
  }
}

export function validateExperiment(value: unknown): Experiment {
  const record = object(value, 'Experiment');
  keys(record, ['version', 'title', 'notes', 'elements'], 'Experiment');
  if (record.version !== 1) throw new ExperimentValidationError('Unsupported experiment version. Lumen reads version 1.');
  if (!Array.isArray(record.elements) || record.elements.length > MAX_ELEMENTS) throw new ExperimentValidationError(`An experiment can contain at most ${MAX_ELEMENTS} elements.`);
  const elements = record.elements.map((element, index) => validateElement(element, `Element ${index + 1}`));
  if (new Set(elements.map((element) => element.id)).size !== elements.length) throw new ExperimentValidationError('Each element needs a unique ID.');
  if (elements.filter((element) => element.kind === 'emitter').length > MAX_EMITTERS) throw new ExperimentValidationError(`Use at most ${MAX_EMITTERS} emitters.`);
  return { version: 1, title: text(record.title, 'Experiment title', 100), notes: text(record.notes, 'Notebook', 8000, true), elements };
}

export type ImportResult = { ok: true; scene: Experiment } | { ok: false; error: string };

export function parseExperiment(input: string): ImportResult {
  if (new TextEncoder().encode(input).length > MAX_FILE_BYTES) return { ok: false, error: 'This file is too large. Use an experiment smaller than 200 kB.' };
  try {
    const value: unknown = JSON.parse(input);
    return { ok: true, scene: validateExperiment(value) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, error: 'This is not valid JSON. Open a Lumen .json experiment file.' };
    if (error instanceof ExperimentValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export function serializeExperiment(scene: Experiment): string {
  return `${JSON.stringify(validateExperiment(scene), null, 2)}\n`;
}

export interface History {
  present: Experiment;
  past: Experiment[];
  future: Experiment[];
  transaction: Experiment | null;
}

export function createHistory(scene: Experiment): History {
  return { present: validateExperiment(scene), past: [], future: [], transaction: null };
}

const equal = (a: Experiment, b: Experiment): boolean => JSON.stringify(a) === JSON.stringify(b);

export function beginEdit(history: History): History {
  return history.transaction ? history : { ...history, transaction: history.present };
}

export function changeScene(history: History, scene: Experiment): History {
  if (equal(history.present, scene)) return history;
  if (history.transaction) return { ...history, present: scene };
  return { present: scene, past: [...history.past, history.present].slice(-HISTORY_LIMIT), future: [], transaction: null };
}

export function finishEdit(history: History): History {
  if (!history.transaction) return history;
  if (equal(history.transaction, history.present)) return { ...history, transaction: null };
  return { ...history, past: [...history.past, history.transaction].slice(-HISTORY_LIMIT), future: [], transaction: null };
}

export function cancelEdit(history: History): History {
  return history.transaction ? { ...history, present: history.transaction, transaction: null } : history;
}

export function undo(history: History): History {
  const settled = finishEdit(history);
  const previous = settled.past.at(-1);
  return previous ? { present: previous, past: settled.past.slice(0, -1), future: [settled.present, ...settled.future], transaction: null } : settled;
}

export function redo(history: History): History {
  const settled = finishEdit(history);
  const next = settled.future[0];
  return next ? { present: next, past: [...settled.past, settled.present].slice(-HISTORY_LIMIT), future: settled.future.slice(1), transaction: null } : settled;
}

export function importIntoHistory(history: History, input: string): { history: History; error: string | null } {
  const parsed = parseExperiment(input);
  return parsed.ok ? { history: changeScene(finishEdit(history), parsed.scene), error: null } : { history, error: parsed.error };
}

export function replaceElement(scene: Experiment, element: OpticalElement): Experiment {
  return { ...scene, elements: scene.elements.map((current) => current.id === element.id ? element : current) };
}

export function nextId(scene: Experiment, kind: ElementKind): string {
  let index = 1;
  while (scene.elements.some((element) => element.id === `${kind}-${index}`)) index += 1;
  return `${kind}-${index}`;
}
