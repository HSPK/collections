import { assemble } from './assembler';
import type { Diagnostic, Program } from './assembler';
import { cloneCpu, createCpu, stepCpu } from './cpu';
import type { CpuState, StepEvent } from './cpu';
import {
  ISA_ID, MAX_CYCLES, MAX_SOURCE_BYTES, MAX_SOURCE_LINES, RAM_SIZE, sourceByteLength, STACK_LIMIT,
} from './isa';

export const HISTORY_LIMIT = 512;
export const TRACE_LIMIT = 128;
export const RUN_BATCH_LIMIT = 128;
export const MAX_PROJECT_BYTES = 512 * 1024;

export interface HistoryEntry {
  cpu: CpuState;
  event: StepEvent;
  /** The complete visible trace before this attempt, including events evicted by it. */
  trace: StepEvent[];
}
export interface DebuggerState {
  program: Program;
  cpu: CpuState;
  history: HistoryEntry[];
  trace: StepEvent[];
  breakpoints: number[];
}
export interface RunOptions {
  skipInitialBreakpoint?: boolean;
}
export interface RunResult {
  machine: DebuggerState;
  /** Successfully executed instructions; a failed fetch/decode/stack check is not a cycle. */
  executed: number;
  reason: 'budget' | 'breakpoint' | 'halted' | 'faulted';
}
export type ImportResult =
  | { ok: true; machine: DebuggerState; draftSource: string }
  | { ok: false; diagnostics: Diagnostic[] };

export function createMachine(program: Program): DebuggerState {
  return { program, cpu: createCpu(program), history: [], trace: [], breakpoints: [] };
}

export function stepMachine(machine: DebuggerState): DebuggerState {
  const result = stepCpu(machine.program, machine.cpu);
  if (!result.event) return { ...machine, cpu: result.state };
  const entry: HistoryEntry = {
    cpu: cloneCpu(machine.cpu),
    event: result.event,
    trace: [...machine.trace],
  };
  return {
    ...machine,
    cpu: result.state,
    history: [...machine.history, entry].slice(-HISTORY_LIMIT),
    trace: [...machine.trace, result.event].slice(-TRACE_LIMIT),
  };
}

export function reverseMachine(machine: DebuggerState): DebuggerState {
  const previous = machine.history[machine.history.length - 1];
  if (!previous) return machine;
  return {
    ...machine,
    cpu: cloneCpu(previous.cpu),
    history: machine.history.slice(0, -1),
    trace: [...previous.trace],
  };
}

export function resetMachine(machine: DebuggerState): DebuggerState {
  return { ...createMachine(machine.program), breakpoints: [...machine.breakpoints] };
}

export function setBreakpoint(machine: DebuggerState, pc: number, enabled = true): DebuggerState {
  if (!Number.isInteger(pc) || pc < 0 || pc >= machine.program.words.length) {
    throw new RangeError('Breakpoints must address a loaded instruction word.');
  }
  const breakpoints = machine.breakpoints.filter((value) => value !== pc);
  if (enabled) breakpoints.push(pc);
  breakpoints.sort((left, right) => left - right);
  return { ...machine, breakpoints };
}

export function toggleBreakpoint(machine: DebuggerState, pc: number): DebuggerState {
  return setBreakpoint(machine, pc, !machine.breakpoints.includes(pc));
}

export function runBatch(initial: DebuggerState, budget: number, options: RunOptions = {}): RunResult {
  const limit = Number.isFinite(budget) ? Math.min(RUN_BATCH_LIMIT, Math.max(0, Math.trunc(budget))) : 0;
  let machine = initial;
  let executed = 0;
  if (machine.cpu.status !== 'ready') return { machine, executed, reason: machine.cpu.status };
  for (let attempt = 0; attempt < limit; attempt += 1) {
    if (machine.breakpoints.includes(machine.cpu.pc) && !(attempt === 0 && options.skipInitialBreakpoint)) {
      return { machine, executed, reason: 'breakpoint' };
    }
    const cycles = machine.cpu.cycles;
    machine = stepMachine(machine);
    executed += machine.cpu.cycles - cycles;
    if (machine.cpu.status !== 'ready') return { machine, executed, reason: machine.cpu.status };
  }
  return { machine, executed, reason: 'budget' };
}

function validSourceSize(source: string): boolean {
  return source.length <= MAX_SOURCE_BYTES
    && sourceByteLength(source) <= MAX_SOURCE_BYTES
    && source.split(/\r\n|\r|\n/).length <= MAX_SOURCE_LINES;
}

export function exportProject(machine: DebuggerState, draftSource = machine.program.source): string {
  if (!validSourceSize(draftSource)) throw new RangeError('Draft exceeds 32 KiB or 2048 lines.');
  return JSON.stringify({
    format: 'relay-project',
    version: 1,
    isa: ISA_ID,
    source: machine.program.source,
    draftSource,
    snapshot: cloneCpu(machine.cpu),
    breakpoints: [...machine.breakpoints],
  }, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function numberArray(value: unknown, length: number, maximum: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((item: unknown) => integer(item, maximum));
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function importProject(text: string): ImportResult {
  const error = (message: string, code = 'PROJECT_SCHEMA'): ImportResult => ({
    ok: false,
    diagnostics: [{ line: 1, column: 1, code, message }],
  });
  if (text.length > MAX_PROJECT_BYTES || sourceByteLength(text) > MAX_PROJECT_BYTES) {
    return error('Project exceeds the 512 KiB import limit.', 'PROJECT_SIZE');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) return error(`Invalid project JSON: ${cause.message}`, 'PROJECT_JSON');
    throw cause;
  }
  if (!isRecord(value) || !onlyKeys(value, ['format', 'version', 'isa', 'source', 'draftSource', 'snapshot', 'breakpoints'])) {
    return error('Project must be an object containing only the documented project fields.');
  }
  if (value.format !== 'relay-project') return error('Unrecognized project format; expected relay-project.');
  if (value.version !== 1) return error('Unsupported project version; expected version 1.');
  if (value.isa !== ISA_ID) return error(`Unsupported instruction set; expected ${ISA_ID}.`);
  if (typeof value.source !== 'string' || !validSourceSize(value.source)) {
    return error('Loaded source must be text within 32 KiB and 2048 lines.');
  }
  if (typeof value.draftSource !== 'string' || !validSourceSize(value.draftSource)) {
    return error('Draft source must be text within 32 KiB and 2048 lines.');
  }
  const assembly = assemble(value.source);
  if (!assembly.ok) return {
    ok: false,
    diagnostics: assembly.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      message: `Loaded source: ${diagnostic.message}`,
    })),
  };
  const snapshot = value.snapshot;
  if (!isRecord(snapshot) || !onlyKeys(snapshot, ['registers', 'ram', 'stack', 'pc', 'flags', 'cycles', 'status', 'fault'])) {
    return error('Snapshot must contain only the documented CPU fields.');
  }
  if (!numberArray(snapshot.registers, 4, 255)) return error('Snapshot registers must contain exactly four bytes.');
  if (!numberArray(snapshot.ram, RAM_SIZE, 255)) return error('Snapshot RAM must contain exactly 256 bytes.');
  if (!Array.isArray(snapshot.stack) || snapshot.stack.length > STACK_LIMIT
    || !numberArray(snapshot.stack, snapshot.stack.length, 0xffff)) {
    return error('Snapshot stack must contain at most 32 unsigned 16-bit words.');
  }
  if (!integer(snapshot.pc, 0xffff)) return error('Snapshot PC must be an unsigned 16-bit integer.');
  if (!integer(snapshot.cycles, MAX_CYCLES)) return error(`Snapshot cycles must be an integer from 0 to ${MAX_CYCLES}.`);
  const flags = snapshot.flags;
  if (!isRecord(flags) || !onlyKeys(flags, ['z', 'n', 'c'])
    || typeof flags.z !== 'boolean' || typeof flags.n !== 'boolean' || typeof flags.c !== 'boolean') {
    return error('Snapshot flags must be exactly boolean z, n, and c.');
  }
  if (snapshot.status !== 'ready' && snapshot.status !== 'halted' && snapshot.status !== 'faulted') {
    return error('Snapshot status must be ready, halted, or faulted.');
  }
  if (snapshot.status === 'faulted') {
    if (typeof snapshot.fault !== 'string' || snapshot.fault.trim().length === 0 || snapshot.fault.length > 1024) {
      return error('A faulted snapshot requires a nonempty fault message of at most 1024 characters.');
    }
  } else if (snapshot.fault !== null) {
    return error('Ready and halted snapshots must have a null fault.');
  }
  if (snapshot.status === 'halted' && (snapshot.cycles === 0
    || assembly.program.instructions[snapshot.pc - 1]?.op !== 'HALT')) {
    return error('A halted snapshot must have executed at least one cycle and point immediately past a HALT.');
  }
  const breakpoints = value.breakpoints;
  if (!Array.isArray(breakpoints) || breakpoints.length > assembly.program.words.length
    || !numberArray(breakpoints, breakpoints.length, assembly.program.words.length - 1)
    || new Set(breakpoints).size !== breakpoints.length) {
    return error('Breakpoints must be unique addresses inside the loaded program.');
  }
  // All values have been narrowed at runtime; build fresh arrays rather than trusting parsed objects.
  const cpu: CpuState = {
    registers: [snapshot.registers[0], snapshot.registers[1], snapshot.registers[2], snapshot.registers[3]],
    ram: [...snapshot.ram],
    stack: [...snapshot.stack],
    pc: snapshot.pc,
    flags: { z: flags.z, n: flags.n, c: flags.c },
    cycles: snapshot.cycles,
    status: snapshot.status,
    fault: typeof snapshot.fault === 'string' ? snapshot.fault : null,
  };
  return {
    ok: true,
    machine: { ...createMachine(assembly.program), cpu, breakpoints: [...breakpoints].sort((left, right) => left - right) },
    draftSource: value.draftSource,
  };
}
