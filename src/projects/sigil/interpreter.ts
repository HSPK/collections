import { requireRule } from '../../core/agents/errors';
import { GLYPHS, HUES, SHAPES } from './data';
import type { Beam, Glyph, Hue, Pulse } from './data';

export interface TraceCell {
  tick: number;
  index: number;
  glyph: Glyph;
  input: Beam;
  output: Beam;
  memoryBefore: Beam;
  memoryAfter: Beam;
  branch: Beam;
  branchOpen: boolean;
}
export interface Execution { output: Beam[]; trace: TraceCell[][] }

const next = (value: Hue): Hue => value === 2 ? 0 : value === 0 ? 1 : 2;
function sum(a: Hue, b: Hue): Hue {
  const value = (a + b) % 3;
  return value === 0 ? 0 : value === 1 ? 1 : 2;
}
export function combine(a: Beam, b: Beam): Beam {
  if (!a) return b;
  if (!b) return a;
  return { hue: sum(a.hue, b.hue), shape: sum(a.shape, b.shape), light: 2 };
}
export function equalBeam(a: Beam, b: Beam): boolean {
  return a === null ? b === null : b !== null && a.hue === b.hue && a.shape === b.shape && a.light === b.light;
}
export function describeBeam(beam: Beam): string {
  return beam ? `${beam.light === 1 ? 'dim' : 'bright'} ${HUES[beam.hue]} ${SHAPES[beam.shape]}` : 'dark';
}
export function programCost(program: readonly Glyph[]): number {
  return program.reduce((total, glyph) => total + GLYPHS[glyph].cost, 0);
}
export function syntaxError(program: readonly Glyph[]): string | null {
  let open = false;
  for (const glyph of program) {
    if (glyph === 'fork') {
      if (open) return 'A second Fork cannot open before Weave closes the first.';
      open = true;
    }
    if (glyph === 'weave') {
      if (!open) return 'Weave needs an earlier, still-open Fork.';
      open = false;
    }
  }
  return open ? 'An open Fork must return through Weave before the output.' : null;
}

export function execute(program: readonly Glyph[], input: readonly Beam[], tracing = true): Execution {
  requireRule(program.length <= 6, 'A program may contain at most six glyphs.');
  requireRule(input.length >= 1 && input.length <= 12, 'A specimen must have 1-12 ticks.');
  const error = syntaxError(program);
  requireRule(!error, error ?? 'Invalid grammar.');
  const memory: Beam[] = program.map(() => null);
  const output: Beam[] = [];
  const trace: TraceCell[][] = [];
  for (let tick = 0; tick < input.length; tick++) {
    let current = input[tick], branch: Beam = null, branchOpen = false;
    const row: TraceCell[] = [];
    for (let index = 0; index < program.length; index++) {
      const glyph = program[index], before = current, remembered = memory[index];
      switch (glyph) {
        case 'turn': current = current ? { ...current, hue: next(current.hue) } : null; break;
        case 'mould': current = current ? { ...current, shape: next(current.shape) } : null; break;
        case 'flare': current = current ? { ...current, light: current.light === 1 ? 2 : 1 } : null; break;
        case 'sieve': current = current?.hue === 0 ? current : null; break;
        case 'facet': current = current?.shape === 2 ? { ...current, hue: next(current.hue) } : current; break;
        case 'delay': memory[index] = current; current = remembered; break;
        case 'echo': memory[index] = current; current = current ?? remembered; break;
        case 'fork': branch = current; branchOpen = true; break;
        case 'weave': current = combine(current, branch); branch = null; branchOpen = false; break;
      }
      if (tracing) row.push({ tick, index, glyph, input: before, output: current, memoryBefore: remembered, memoryAfter: memory[index], branch, branchOpen });
    }
    output.push(current);
    if (tracing) trace.push(row);
  }
  return { output, trace };
}

export function pulse(hue: number, shape: number, light = 1): Pulse {
  requireRule(Number.isInteger(hue) && hue >= 0 && hue <= 2 && Number.isInteger(shape) && shape >= 0 && shape <= 2 &&
    (light === 1 || light === 2), 'Invalid light specimen.');
  return { hue: hue === 0 ? 0 : hue === 1 ? 1 : 2, shape: shape === 0 ? 0 : shape === 1 ? 1 : 2, light };
}
