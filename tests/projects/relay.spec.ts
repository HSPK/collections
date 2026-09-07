import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assemble } from '../../src/projects/relay/assembler';
import type { Program } from '../../src/projects/relay/assembler';
import { cloneCpu, createCpu, framebufferPixels, stepCpu } from '../../src/projects/relay/cpu';
import type { CpuState, Flags } from '../../src/projects/relay/cpu';
import {
  decodeInstruction, encodeInstruction, formatInstruction, hex, instructionMetadata, isa,
  MAX_CYCLES, MAX_SOURCE_BYTES, MAX_SOURCE_LINES, STACK_LIMIT,
} from '../../src/projects/relay/isa';
import type { Opcode } from '../../src/projects/relay/isa';
import {
  createMachine, exportProject, HISTORY_LIMIT, importProject, MAX_PROJECT_BYTES, resetMachine,
  reverseMachine, runBatch, RUN_BATCH_LIMIT, setBreakpoint, stepMachine, toggleBreakpoint, TRACE_LIMIT,
} from '../../src/projects/relay/machine';
import type { DebuggerState } from '../../src/projects/relay/machine';
import { defaultPreset, guideSteps, presets, relayGlyph } from '../../src/projects/relay/presets';
import { parseManifest } from '../../src/core/manifest';
import manifest from '../../src/projects/relay/manifest.json' with { type: 'json' };

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const unparseableStatements = ['\u2028', '\u2029'].map((separator) => `MOV R0, 42${separator}STORE [0xE0], R0\nHALT`);

function program(source: string): Program {
  const result = assemble(source);
  if (!result.ok) throw new Error(result.diagnostics.map((item) => `${item.line}: ${item.message}`).join('\n'));
  return result.program;
}

function complete(source: string, maximum = 4096): DebuggerState {
  let machine = createMachine(program(source));
  for (let count = 0; count < maximum && machine.cpu.status === 'ready'; count += 1) machine = stepMachine(machine);
  expect(machine.cpu.status, machine.cpu.fault ?? 'program should halt within the execution bound').toBe('halted');
  return machine;
}

function expectFaultAtomic(source: string, prepare?: (state: CpuState) => void): void {
  const compiled = program(source);
  const cpu = createCpu(compiled);
  prepare?.(cpu);
  const saved = cloneCpu(cpu);
  const result = stepCpu(compiled, cpu);
  expect(result.state.status).toBe('faulted');
  expect(result.state.fault).toBeTruthy();
  expect({ ...result.state, status: saved.status, fault: saved.fault }).toEqual(saved);
  expect(cpu).toEqual(saved);
  expect(result.event).toMatchObject({ kind: 'fault', transfers: [], memory: [], registerWrites: [], alu: null });
  expect(stepCpu(compiled, result.state)).toEqual({ state: result.state, event: null });
}

test.describe('RELAY pure model: encoding and assembly', () => {
  test('manifest identifies the complete independent Relay page', () => {
    expect(parseManifest(manifest)).toMatchObject({
      id: 'relay', order: 63, title: 'Relay', category: 'learn', format: 'page',
    });
    expect(manifest.tags).toContain('Flagship');
  });
  test('all 28 metadata entries have complete docs and canonical encodings round-trip exhaustively', () => {
    expect(isa).toHaveLength(28);
    expect(new Set(isa.map((entry) => entry.code)).size).toBe(28);
    let accepted = 0;
    for (let word = 0; word <= 0xffff; word += 1) {
      const decoded = decodeInstruction(word);
      if (decoded.ok) {
        accepted += 1;
        assert.equal(encodeInstruction(decoded.instruction), word);
        const reassembled = assemble(formatInstruction(decoded.instruction));
        assert.equal(reassembled.ok, true);
        if (reassembled.ok) assert.equal(reassembled.program.words[0], word);
      }
    }
    expect(accepted).toBe(12479);
    for (const metadata of isa) {
      expect(metadata.syntax).toBeTruthy();
      expect(metadata.flags).toBeTruthy();
      expect(metadata.description.length).toBeGreaterThan(10);
      expect(instructionMetadata(metadata.op.toLowerCase())).toBe(metadata);
    }
    expect(hex(255)).toBe('FF');
    expect(hex(12, 4)).toBe('000C');
    expect(hex(0, Infinity)).toBe('00');
  });

  test('words reject unknown opcodes, noncanonical bits, and noninteger/range operands', () => {
    for (const word of [-1, 65536, 1.5, NaN, Infinity, 28 << 11, (1 << 11) | 1,
      (7 << 11) | 0x100, (17 << 11) | 0x200, (2 << 11) | 0x104]) {
      expect(decodeInstruction(word).ok, String(word)).toBe(false);
    }
    expect(() => encodeInstruction({ op: 'MOV', dst: 4, mode: 0, arg: 0 })).toThrow(RangeError);
    expect(() => encodeInstruction({ op: 'MOV', dst: 0, mode: 0, arg: 256 })).toThrow(RangeError);
    expect(() => encodeInstruction({ op: 'MOV', dst: 0, mode: 1, arg: 4 })).toThrow(RangeError);
    expect(() => encodeInstruction({ op: 'RET', dst: 1, mode: 0, arg: 0 })).toThrow(RangeError);
  });

  test('forward labels/constants, mixed case, comments, data, and source maps resolve correctly', () => {
    const source = `; first line
.equ nextValue, finalValue
start: mOv r0, nextValue ; comment
  JMP done
.byte addr, 0b10000000, 255, nextValue
.equ ADDR, 0xE0
.equ finalValue, 17
done: HALT
.equ POSITION, done`;
    const result = program(source);
    expect(result.words).toHaveLength(3);
    expect(result.instructions.map((item) => [item.pc, item.line, item.op])).toEqual([[0, 3, 'MOV'], [1, 4, 'JMP'], [2, 8, 'HALT']]);
    expect(result.initialRam.slice(224, 227)).toEqual([128, 255, 17]);
    expect(result.initialRam).toHaveLength(256);
    expect(result.symbols).toMatchObject({ START: 0, DONE: 2, POSITION: 2, NEXTVALUE: 17, FINALVALUE: 17, ADDR: 224 });
    expect(result.source).toBe(source);
    expect(assemble('')).toMatchObject({ ok: true, program: { words: [], instructions: [] } });
    expect(program('.equ __proto__, 7\nMOV R0, __proto__').instructions[0].arg).toBe(7);
  });

  const invalidSources: [string, string][] = [
    ['MOV R4, 1', 'REGISTER'],
    ['MOV R0, R4', 'UNDEFINED_SYMBOL'],
    ['MOV R0, -1', 'VALUE'],
    ['MOV R0, 256', 'BYTE_RANGE'],
    ['MOV R0, 0x100', 'BYTE_RANGE'],
    ['MOV R0, 0b102', 'VALUE'],
    ['MOV R0, 1.5', 'VALUE'],
    ['MOV R0, 9007199254740992', 'VALUE_RANGE'],
    ['MOV R0', 'OPERAND_COUNT'],
    ['MOV R0,,1', 'OPERAND_COUNT'],
    ['NOP R0', 'OPERAND_COUNT'],
    ['JMP R0', 'VALUE'],
    ['JMP missing', 'UNDEFINED_SYMBOL'],
    ['JMP 256', 'BYTE_RANGE'],
    ['LOAD R0, 12', 'ADDRESS'],
    ['STORE R0, [12]', 'REGISTER'],
    ['LOAD R0, [R0+1]', 'VALUE'],
    ['.word 1', 'DIRECTIVE'],
    ['MAGIC', 'OPCODE'],
    ['same: NOP\nSAME: HALT', 'DUPLICATE_SYMBOL'],
    ['.equ same, 1\nsame: HALT', 'DUPLICATE_SYMBOL'],
    ['.equ same, 1\n.equ SAME, 2', 'DUPLICATE_SYMBOL'],
    ['.equ R0, 1', 'SYMBOL_NAME'],
    ['.equ VALUE', 'OPERAND_COUNT'],
    ['.equ A, B\n.equ B, A\nHALT', 'CYCLIC_SYMBOL'],
    ['.equ A, missing\nHALT', 'UNDEFINED_SYMBOL'],
    ['.byte 0', 'OPERAND_COUNT'],
    ['.byte 0,', 'OPERAND_COUNT'],
    ['.byte 255, 1, 2', 'DATA_RANGE'],
    ['.byte 256, 1', 'BYTE_RANGE'],
    ['.byte 0, -1', 'VALUE'],
    ['.byte 0, 256', 'BYTE_RANGE'],
    ['.byte 0, 1, 2\n.byte 1, 3', 'DATA_OVERLAP'],
    ['MOV R0, 1 + 2', 'VALUE'],
    ['1bad: HALT', 'OPCODE'],
  ];
  for (const [source, code] of invalidSources) {
    test(`diagnostic ${code}: ${source.replaceAll('\n', ' / ')}`, () => {
      const result = assemble(source);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics.some((item) => item.code === code)).toBe(true);
      for (const item of result.diagnostics) {
        expect(item.line).toBeGreaterThan(0);
        expect(item.column).toBeGreaterThan(0);
        expect(item.message).toBeTruthy();
      }
    });
  }

  test('unsupported separators cannot silently discard nonempty source statements', () => {
    for (const source of unparseableStatements) {
      expect(assemble(source)).toMatchObject({
        ok: false,
        diagnostics: [{ line: 1, column: 1, code: 'SYNTAX' }],
      });
    }
  });

  test('source, line, instruction and resolution depth boundaries are explicit', () => {
    expect(assemble(';'.padEnd(MAX_SOURCE_BYTES, 'x')).ok).toBe(true);
    expect(assemble(';'.padEnd(MAX_SOURCE_BYTES + 1, 'x')).ok).toBe(false);
    expect(assemble(`;${'😀'.repeat(9000)}`).ok).toBe(false);
    expect(assemble('\n'.repeat(MAX_SOURCE_LINES - 1)).ok).toBe(true);
    expect(assemble('\n'.repeat(MAX_SOURCE_LINES)).ok).toBe(false);
    expect(program(Array<string>(256).fill('NOP').join('\n')).words).toHaveLength(256);
    expect(assemble(Array<string>(257).fill('NOP').join('\n')).ok).toBe(false);
    const chain = Array.from({ length: 130 }, (_, index) => `.equ A${index}, A${index + 1}`).join('\n');
    const deep = assemble(`${chain}\n.equ A130, 1\nHALT`);
    expect(deep.ok).toBe(false);
    if (!deep.ok) expect(deep.diagnostics.some((item) => item.code === 'SYMBOL_DEPTH')).toBe(true);
  });
});

test.describe('RELAY pure model: CPU and events', () => {
  for (const op of ['ADD', 'ADC', 'SUB', 'CMP'] as const) {
    test(`${op} exhaustively handles all byte pairs${op === 'ADC' ? ' and both incoming carries' : ''}`, () => {
      const compiled = program(`${op} R0, R1`);
      const initial = createCpu(compiled);
      for (let left = 0; left < 256; left += 1) {
        for (let right = 0; right < 256; right += 1) {
          for (const carry of op === 'ADC' ? [false, true] : [true]) {
            initial.registers = [left, right, 0, 0];
            initial.flags = { z: true, n: true, c: carry };
            const { state, event } = stepCpu(compiled, initial);
            const subtract = op === 'SUB' || op === 'CMP';
            const full = subtract ? left - right : left + right + (op === 'ADC' && carry ? 1 : 0);
            const result = full & 255;
            assert.equal(state.registers[0], op === 'CMP' ? left : result);
            assert.equal(state.flags.z, result === 0);
            assert.equal(state.flags.n, result >= 128);
            assert.equal(state.flags.c, subtract ? left >= right : full > 255);
            assert.equal(state.registers[1], right);
            assert.equal(event?.alu?.result, result);
            assert.equal(event?.registerWrites.length, op === 'CMP' ? 0 : 1);
            assert.equal(initial.registers[0], left);
          }
        }
      }
    });
  }

  test('all byte inputs for unary ALU operations and representative bitwise pairs', () => {
    const unary: Opcode[] = ['INC', 'DEC', 'NOT', 'SHL', 'SHR'];
    for (const op of unary) {
      const compiled = program(`${op} R2`);
      const initial = createCpu(compiled);
      for (let value = 0; value < 256; value += 1) {
        initial.registers[2] = value;
        initial.flags = { z: true, n: true, c: true };
        const result = op === 'INC' ? (value + 1) & 255 : op === 'DEC' ? (value - 1) & 255
          : op === 'NOT' ? value ^ 255 : op === 'SHL' ? (value << 1) & 255 : value >>> 1;
        const carry = op === 'INC' ? value === 255 : op === 'DEC' ? value >= 1
          : op === 'SHL' ? value >= 128 : op === 'SHR' ? value % 2 === 1 : false;
        const { state } = stepCpu(compiled, initial);
        assert.equal(state.registers[2], result);
        assert.deepEqual(state.flags, { z: result === 0, n: result >= 128, c: carry });
      }
    }
    for (const op of ['AND', 'OR', 'XOR'] as const) {
      for (const right of [0, 1, 85, 127, 128, 170, 254, 255]) {
        const compiled = program(`${op} R3, ${right}`);
        for (let left = 0; left < 256; left += 1) {
          const initial = createCpu(compiled);
          initial.registers[3] = left;
          initial.flags.c = true;
          const result = op === 'AND' ? left & right : op === 'OR' ? left | right : left ^ right;
          const { state } = stepCpu(compiled, initial);
          assert.equal(state.registers[3], result);
          assert.deepEqual(state.flags, { z: result === 0, n: result >= 128, c: false });
        }
      }
    }
  });

  test('the CPU decodes ROM words, not cached semantic instructions', () => {
    const compiled = program('MOV R0, 12\nHALT');
    compiled.words[0] = encodeInstruction({ op: 'MOV', dst: 3, mode: 0, arg: 99 });
    const result = stepCpu(compiled, createCpu(compiled));
    expect(result.state.registers).toEqual([0, 0, 0, 99]);
    expect(result.event).toMatchObject({ op: 'MOV', instruction: 'MOV R3, 0x63', line: 1 });
    compiled.words[0] = 0xffff;
    const initial = createCpu(compiled);
    const bad = stepCpu(compiled, initial);
    expect(bad.state).toEqual({ ...initial, status: 'faulted', fault: bad.state.fault });
    expect(bad.state.fault).toContain('Decode fault');
  });

  test('MOV, RAM addressing, NOP, PUSH/POP and HALT preserve all flags and emit factual transfers', () => {
    const compiled = program(`MOV R0, 128
MOV R1, R0
STORE [0x40], R1
MOV R2, 0x40
LOAD R3, [R2]
STORE [R2], R0
LOAD R1, [0x40]
PUSH R1
POP R0
NOP
HALT`);
    let cpu = createCpu(compiled);
    const flags: Flags = { z: true, n: true, c: true };
    cpu.flags = { ...flags };
    for (let index = 0; index < compiled.words.length; index += 1) {
      const saved = cloneCpu(cpu);
      const result = stepCpu(compiled, cpu);
      expect(cpu).toEqual(saved);
      expect(result.state.flags).toEqual(flags);
      expect(result.event?.cycle).toBe(index + 1);
      expect(result.event?.pc).toBe(index);
      expect(result.event?.line).toBe(index + 1);
      expect(result.event?.transfers[0]).toEqual({ from: `ROM[0x${hex(index)}]`, to: 'IR', value: compiled.words[index] });
      if (index === 2) {
        expect(result.event?.memory).toEqual([{ address: 64, kind: 'write', before: 0, value: 128 }]);
        expect(result.event?.transfers).toContainEqual({ from: 'R1', to: 'RAM[0x40]', value: 128 });
      }
      if (index === 4) {
        expect(result.event?.memory).toEqual([{ address: 64, kind: 'read', before: 128, value: 128 }]);
        expect(result.event?.registerWrites).toEqual([{ register: 3, before: 0, value: 128 }]);
      }
      cpu = result.state;
    }
    expect(cpu).toMatchObject({ registers: [128, 128, 64, 128], stack: [], pc: 11, cycles: 11, status: 'halted', fault: null });
    const terminal = stepCpu(compiled, cpu);
    expect(terminal).toEqual({ state: cpu, event: null });
    expect(terminal.state).not.toBe(cpu);
    expect(terminal.state.ram).not.toBe(cpu.ram);
  });

  test('every conditional branch is taken and not taken with flags preserved', () => {
    const branches: [Opcode, keyof Flags, boolean][] = [
      ['JZ', 'z', true], ['JNZ', 'z', false], ['JC', 'c', true],
      ['JNC', 'c', false], ['JN', 'n', true], ['JNN', 'n', false],
    ];
    for (const [op, flag, when] of branches) {
      for (const taken of [false, true]) {
        const compiled = program(`${op} 2\nNOP\nHALT`);
        const initial = createCpu(compiled);
        initial.flags[flag] = taken ? when : !when;
        const result = stepCpu(compiled, initial);
        expect(result.state.pc).toBe(taken ? 2 : 1);
        expect(result.event?.branchTaken).toBe(taken);
        expect(result.state.flags).toEqual(initial.flags);
      }
    }
    expect(complete('JMP end\nMOV R0,99\nend: HALT').cpu.registers[0]).toBe(0);
  });

  test('nested CALL/RET and byte PUSH/POP use the same bounded word stack', () => {
    const machine = complete(`MOV R0, 12
CALL outer
HALT
outer: PUSH R0
MOV R0, 99
CALL inner
POP R0
RET
inner: INC R1
RET`);
    expect(machine.cpu.registers).toEqual([12, 1, 0, 0]);
    expect(machine.cpu.stack).toEqual([]);
    expect(machine.trace.filter((event) => event.op === 'CALL').map((event) => event.transfers.find((item) => item.to === 'STACK')?.value)).toEqual([2, 6]);
    const popProgram = program('POP R2');
    const popCpu = createCpu(popProgram);
    popCpu.stack = [0x1234];
    expect(stepCpu(popProgram, popCpu).state.registers[2]).toBe(0x34);
    const retProgram = program('RET');
    const retCpu = createCpu(retProgram);
    retCpu.stack = [0xffff];
    const returned = stepCpu(retProgram, retCpu).state;
    expect(returned).toMatchObject({ pc: 65535, stack: [], status: 'ready', cycles: 1 });
    expect(stepCpu(retProgram, returned).state.status).toBe('faulted');
    const fullRom = program(`${Array<string>(255).fill('NOP').join('\n')}\nCALL 0`);
    const last = createCpu(fullRom);
    last.pc = 255;
    expect(stepCpu(fullRom, last).state.stack).toEqual([256]);
  });

  test('faults are atomic for stack underflow/overflow, fetch, and cycle budget', () => {
    expectFaultAtomic('POP R0');
    expectFaultAtomic('RET');
    expectFaultAtomic('PUSH R0', (cpu) => { cpu.stack = Array<number>(STACK_LIMIT).fill(99); });
    expectFaultAtomic('CALL 0', (cpu) => { cpu.stack = Array<number>(STACK_LIMIT).fill(255); });
    expectFaultAtomic('', (cpu) => { cpu.ram[0xe0] = 128; });
    expectFaultAtomic('NOP', (cpu) => { cpu.pc = 256; });
    expectFaultAtomic('INC R0', (cpu) => { cpu.cycles = MAX_CYCLES; });
    const callProgram = program('CALL 255');
    const called = stepCpu(callProgram, createCpu(callProgram));
    expect(called.state).toMatchObject({ pc: 255, stack: [1], status: 'ready', cycles: 1 });
    const failed = stepCpu(callProgram, called.state);
    expect(failed.state).toEqual({ ...called.state, status: 'faulted', fault: failed.state.fault });
    const fullRom = program(Array<string>(256).fill('NOP').join('\n'));
    let cpu = createCpu(fullRom);
    for (let index = 0; index < 256; index += 1) cpu = stepCpu(fullRom, cpu).state;
    expect(cpu).toMatchObject({ pc: 256, cycles: 256, status: 'ready' });
    expect(stepCpu(fullRom, cpu).state).toMatchObject({ pc: 256, cycles: 256, status: 'faulted' });
  });

  test('framebuffer is row-major with each byte MSB left, no other RAM affects pixels', () => {
    const ram = Array<number>(256).fill(0);
    ram[0] = 255;
    ram[0xe0] = 0x81;
    ram[0xe1] = 0x80;
    ram[0xe2] = 0x40;
    ram[0xff] = 1;
    const pixels = framebufferPixels(ram);
    expect(pixels).toHaveLength(256);
    expect(pixels.flatMap((value, index) => value ? [index] : [])).toEqual([0, 7, 8, 17, 255]);
    expect(() => framebufferPixels([1])).toThrow(RangeError);
  });
});

test.describe('RELAY pure model: bounded debugger and snapshots', () => {
  test('reverse restores memory, flags, stack, branch, HALT, and trace exactly', () => {
    const compiled = program(`MOV R0, 255
INC R0
STORE [0xE0], R0
CALL work
HALT
work: PUSH R0
MOV R0, 128
STORE [0xE0], R0
POP R1
RET`);
    let machine = createMachine(compiled);
    const snapshots: DebuggerState[] = [machine];
    for (let index = 0; index < 30 && machine.cpu.status === 'ready'; index += 1) {
      machine = stepMachine(machine);
      snapshots.push(machine);
    }
    expect(machine.cpu.status).toBe('halted');
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      machine = reverseMachine(machine);
      expect(machine).toEqual(snapshots[index]);
    }
    expect(reverseMachine(machine)).toBe(machine);
    let faulty = createMachine(program('STORE [0x40], R0\nPOP R0'));
    faulty = stepMachine(faulty);
    const before = faulty;
    faulty = stepMachine(faulty);
    expect(faulty.cpu.status).toBe('faulted');
    expect(reverseMachine(faulty)).toEqual(before);
  });

  test('history and trace caps restore evicted trace and stop at the actual retained boundary', () => {
    let machine = createMachine(program('INC R0\nSTORE [0xE0], R0\nJMP 0'));
    let boundary = machine;
    const total = HISTORY_LIMIT + 88;
    for (let index = 0; index < total; index += 1) {
      machine = stepMachine(machine);
      if (index === 87) boundary = machine;
      expect(machine.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
      expect(machine.trace.length).toBeLessThanOrEqual(TRACE_LIMIT);
    }
    expect(machine.history).toHaveLength(HISTORY_LIMIT);
    expect(machine.trace).toHaveLength(TRACE_LIMIT);
    for (let index = 0; index < HISTORY_LIMIT; index += 1) machine = reverseMachine(machine);
    expect(machine.cpu).toEqual(boundary.cpu);
    expect(machine.trace).toEqual(boundary.trace);
    expect(machine.history).toHaveLength(0);
    expect(reverseMachine(machine)).toBe(machine);
    expect(machine.cpu.cycles).toBe(88);
  });

  test('run limits, invalid budgets, before-instruction breakpoints and explicit resume are bounded', () => {
    const initial = createMachine(program('INC R0\nJMP 0'));
    for (const budget of [-1, 0, NaN, Infinity, -Infinity, 0.9]) {
      expect(runBatch(initial, budget)).toEqual({ machine: initial, executed: 0, reason: 'budget' });
    }
    expect(runBatch(initial, 2.9).executed).toBe(2);
    expect(runBatch(initial, 1e12).executed).toBe(RUN_BATCH_LIMIT);
    let machine = setBreakpoint(initial, 0);
    expect(runBatch(machine, 128)).toEqual({ machine, executed: 0, reason: 'breakpoint' });
    const resumed = runBatch(machine, 128, { skipInitialBreakpoint: true });
    expect(resumed).toMatchObject({ executed: 2, reason: 'breakpoint', machine: { cpu: { pc: 0, cycles: 2 } } });
    expect(stepMachine(machine).cpu.pc).toBe(1);
    machine = toggleBreakpoint(machine, 0);
    expect(machine.breakpoints).toEqual([]);
    machine = setBreakpoint(machine, 1);
    machine = setBreakpoint(machine, 1);
    expect(machine.breakpoints).toEqual([1]);
    expect(runBatch(machine, 128)).toMatchObject({ executed: 1, reason: 'breakpoint' });
    expect(() => setBreakpoint(machine, 2)).toThrow(RangeError);
    expect(() => setBreakpoint(machine, -1)).toThrow(RangeError);
    expect(() => setBreakpoint(machine, 0.5)).toThrow(RangeError);
    const halted = runBatch(createMachine(program('HALT')), 128);
    expect(halted).toMatchObject({ executed: 1, reason: 'halted' });
    expect(runBatch(halted.machine, 10)).toMatchObject({ executed: 0, reason: 'halted' });
    expect(runBatch(createMachine(program('POP R0')), 128)).toMatchObject({ executed: 0, reason: 'faulted' });
  });

  test('reset reinstates authored RAM but keeps breakpoints; pure runs are deterministic', () => {
    const initial = setBreakpoint(createMachine(program('.byte 0x40,7\nINC R0\nSTORE [0x40], R0\nHALT')), 2);
    const saved = exportProject(initial);
    const first = runBatch(initial, 128);
    const second = runBatch(initial, 128);
    expect(first).toEqual(second);
    expect(exportProject(initial)).toBe(saved);
    expect(resetMachine(first.machine)).toEqual(initial);
    const frozen = createCpu(initial.program);
    Object.freeze(frozen.registers);
    Object.freeze(frozen.ram);
    Object.freeze(frozen.stack);
    Object.freeze(frozen.flags);
    Object.freeze(frozen);
    expect(stepCpu(initial.program, frozen).state.registers[0]).toBe(1);
  });

  test('export/import round-trips loaded source, invalid editor draft, state, and breakpoints without undo', () => {
    let machine = complete(presets.find((preset) => preset.id === 'first-steps')?.source ?? '');
    machine = setBreakpoint(machine, 3);
    const draft = 'MOV R99, unfinished ; deliberately not assembled';
    const result = importProject(exportProject(machine, draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draftSource).toBe(draft);
    expect(result.machine.program).toEqual(machine.program);
    expect(result.machine.cpu).toEqual(machine.cpu);
    expect(result.machine.breakpoints).toEqual([3]);
    expect(result.machine.history).toEqual([]);
    expect(result.machine.trace).toEqual([]);
    expect(resetMachine(result.machine).cpu).toEqual(createCpu(machine.program));
    expect(importProject(exportProject(createMachine(program('')))).ok).toBe(true);
    const faulted = stepMachine(createMachine(program('RET')));
    const faultImport = importProject(exportProject(faulted));
    expect(faultImport.ok).toBe(true);
    if (faultImport.ok) expect(faultImport.machine.cpu).toEqual(faulted.cpu);
    const fullRom = createMachine(program(Array<string>(256).fill('NOP').join('\n')));
    fullRom.cpu.pc = 256;
    fullRom.cpu.cycles = 256;
    expect(importProject(exportProject(fullRom)).ok).toBe(true);
    fullRom.cpu.pc = 65535;
    fullRom.cpu.stack = [0, 256, 65535];
    expect(importProject(exportProject(fullRom)).ok).toBe(true);
  });

  test('adversarial imports reject malformed format, source, schema, snapshot values and arrays', () => {
    const machine = createMachine(program('MOV R0, 1\nHALT'));
    const project = {
      format: 'relay-project', version: 1, isa: 'relay-8-v1',
      source: machine.program.source, draftSource: machine.program.source,
      snapshot: machine.cpu, breakpoints: [],
    };
    const invalid: unknown[] = [
      null, [], 'text', {},
      { ...project, format: 'other' }, { ...project, version: 2 }, { ...project, isa: 'relay-9' },
      { ...project, extra: true }, { ...project, instructions: [1] },
      { ...project, source: [] }, { ...project, source: 'BOGUS' },
      ...unparseableStatements.map((source) => ({ ...project, source })),
      { ...project, source: 'x'.repeat(MAX_SOURCE_BYTES + 1) },
      { ...project, source: '\n'.repeat(MAX_SOURCE_LINES) },
      { ...project, draftSource: [] }, { ...project, draftSource: null },
      { ...project, draftSource: 'x'.repeat(MAX_SOURCE_BYTES + 1) },
      { ...project, snapshot: [] }, { ...project, snapshot: null },
      ...[
        { registers: [0, 0, 0] }, { registers: [0, 0, 0, 0, 0] }, { registers: [0, 0, 0, 256] },
        { registers: [0, 0, -1, 0] }, { registers: [0, 0, 0.5, 0] }, { registers: [0, 0, '1', 0] },
        { registers: [0, 0, NaN, 0] }, { ram: [] }, { ram: Array<number>(257).fill(0) },
        { ram: [...Array<number>(255).fill(0), 256] },
        { ram: [...Array<number>(255).fill(0), 0.1] },
        { stack: Array<number>(33).fill(0) }, { stack: [65536] }, { stack: [-1] },
        { stack: [0.5] }, { stack: {} }, { pc: -1 }, { pc: 65536 }, { pc: 0.1 }, { pc: null },
        { cycles: -1 }, { cycles: 0.1 }, { cycles: MAX_CYCLES + 1 }, { cycles: Infinity },
        { status: 'running' }, { status: 'ready', fault: 'bad' },
        { status: 'faulted', fault: null }, { status: 'faulted', fault: '' },
        { status: 'faulted', fault: ' '.repeat(10) }, { status: 'faulted', fault: 'x'.repeat(1025) },
        { status: 'halted', pc: 0 }, { status: 'halted', pc: 2, cycles: 0 },
        { flags: [] }, { flags: { z: 1, n: false, c: false } }, { flags: { z: false, n: false } },
        { flags: { z: false, n: false, c: false, extra: true } }, { extra: true },
      ].map((snapshot) => ({ ...project, snapshot: { ...project.snapshot, ...snapshot } })),
      ...[[2], [-1], [0.5], [0, 0], ['0'], null, {}].map((breakpoints) => ({ ...project, breakpoints })),
    ];
    const before = exportProject(machine);
    for (const corrupted of invalid) {
      const result = importProject(JSON.stringify(corrupted));
      expect(result.ok, JSON.stringify(corrupted).slice(0, 150)).toBe(false);
      if (!result.ok) expect(result.diagnostics[0].message.length).toBeGreaterThan(8);
      expect(exportProject(machine)).toBe(before);
    }
    expect(importProject('{')).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_JSON' }] });
    expect(importProject(' '.repeat(MAX_PROJECT_BYTES + 1))).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_SIZE' }] });
    expect(() => exportProject(machine, '\n'.repeat(MAX_SOURCE_LINES))).toThrow(RangeError);
  });
});

test.describe('RELAY pure model: useful executable presets', () => {
  test('default framebuffer is authored on arrival and actual STORE instructions change every byte', () => {
    expect(defaultPreset.id).toBe('framebuffer');
    const initial = createMachine(program(defaultPreset.source));
    expect(initial.cpu.status).toBe('ready');
    expect(initial.cpu.cycles).toBe(0);
    expect(initial.cpu.ram.slice(0xe0)).toEqual(relayGlyph);
    expect(framebufferPixels(initial.cpu).reduce((sum, value) => sum + value, 0)).toBeGreaterThan(60);
    let machine = initial;
    const writes: number[] = [];
    for (let index = 0; index < 512 && machine.cpu.status === 'ready'; index += 1) {
      machine = stepMachine(machine);
      writes.push(...machine.trace[machine.trace.length - 1].memory.filter((access) => access.kind === 'write').map((access) => access.address));
    }
    expect(machine.cpu.status).toBe('halted');
    expect(machine.cpu.ram.slice(0xe0)).toEqual(relayGlyph.map((byte) => byte ^ 255));
    expect(writes).toEqual(Array.from({ length: 32 }, (_, index) => 0xe0 + index));
    expect(machine.cpu.stack).toEqual([]);
    expect(machine.cpu.registers.slice(0, 3)).toEqual([64, 0, 0]);
    expect(initial.cpu.ram.slice(0xe0)).toEqual(relayGlyph);
  });

  async function editAndLoad(page: Page, source: string): Promise<void> {
    if (await page.locator('.relay-mobile-tabs').isVisible()) await page.locator('[data-relay-pane="source"]').click();
    await page.locator('#relay-source').fill(source);
    await expect(page.locator('[data-relay-sync]')).toHaveText('DRAFT / NOT LOADED');
    await page.locator('[data-relay-action="assemble"]').click();
    await expect(page.locator('[data-relay-sync]')).toHaveText('ASSEMBLED');
    await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
  }

  async function steps(page: Page, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) await page.locator('[data-relay-action="step"]').click();
  }

  async function openInspector(page: Page, pane: 'output' | 'memory' | 'trace' | 'guide'): Promise<void> {
    await page.locator(await page.locator('.relay-mobile-tabs').isVisible()
      ? `[data-relay-pane="${pane}"]` : `[data-relay-inspector-tabs] [data-workspace-tab="${pane}"]`).click();
  }

  async function expectViewport(page: Page): Promise<void> {
    const sizes = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.project-relay')!;
      return {
        width: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight,
        rootWidth: root.scrollWidth, rootHeight: root.scrollHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
        scrollX, scrollY,
      };
    });
    expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.width);
    expect(sizes.documentHeight).toBeLessThanOrEqual(sizes.height);
    expect(sizes.bodyWidth).toBeLessThanOrEqual(sizes.width);
    expect(sizes.bodyHeight).toBeLessThanOrEqual(sizes.height);
    expect(sizes.rootWidth).toBeLessThanOrEqual(sizes.width);
    expect(sizes.rootHeight).toBeLessThanOrEqual(sizes.height);
    expect(sizes.bodyOverflow).not.toMatch(/hidden|clip/);
    expect([sizes.scrollX, sizes.scrollY]).toEqual([0, 0]);
    for (const selector of ['.relay-transport', '[data-relay-cycles]', '.relay-message']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
  }

  test.describe('RELAY browser workbench', () => {
    let errors: string[];
    test.beforeEach(async ({ page }) => {
      errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('./projects/relay/');
      await expect(page.locator('[data-project-preview]')).toBeVisible();
      await expect(page.locator('[data-relay-status]')).toHaveText('Ready');
    });
    test.afterEach(() => {
      expect(errors, 'No uncaught page exceptions').toEqual([]);
    });

    test('arrives as a real stable machine and renders actual CALL, ALU, STORE and reverse', async ({ page }) => {
      await expect(page.locator('#relay-source')).toHaveValue(defaultPreset.source);
      await expect(page.locator('[data-relay-decoded]')).toHaveText('CALL 0x02');
      const litBefore = await page.locator('.relay-pixel-on').count();
      expect(litBefore).toBe(framebufferPixels(program(defaultPreset.source).initialRam).reduce((total, bit) => total + bit, 0));
      await page.waitForTimeout(200);
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await steps(page, 1);
      await expect(page.locator('[data-relay-event-title]')).toHaveText('CALL 0x02');
      await expect(page.locator('[data-relay-pc]')).toHaveText('0002');
      await openInspector(page, 'memory');
      await page.getByRole('tab', { name: 'Stack', exact: true }).click();
      await expect(page.locator('.relay-stack-list')).toContainText('0001');
      await steps(page, 5);
      await expect(page.locator('[data-relay-reg-hex="3"]')).toHaveText('FF');
      await expect(page.locator('[data-relay-flag="n"] output')).toHaveText('1');
      await expect(page.locator('[data-relay-event-title]')).toHaveText('XOR R3, 0xFF');
      await expect(page.locator('.relay-alu')).toHaveClass(/relay-alu-active/);
      await steps(page, 1);
      await expect(page.locator('[data-relay-event-title]')).toHaveText('STORE [R1], R3');
      await expect(page.locator('[data-relay-transfer]')).toContainText('R3 → RAM[0xE0] : FF');
      expect(await page.locator('.relay-pixel-on').count()).toBe(litBefore + 8);
      await page.getByRole('tab', { name: 'Data RAM', exact: true }).click();
      await expect(page.locator('[data-relay-byte="224"]')).toHaveText('FF');
      await expect(page.locator('[data-relay-byte="224"]')).toHaveClass(/relay-byte-write/);
      await page.locator('[data-relay-action="reverse"]').click();
      await expect(page.locator('[data-relay-byte="224"]')).toHaveText('00');
      expect(await page.locator('.relay-pixel-on').count()).toBe(litBefore);
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000006');
    });

    test('editor assembles real user code, reports line diagnostics, keeps draft separate and restores reset', async ({ page }) => {
      await editAndLoad(page, 'MOV R0, 255\nADD R0, 1\nSTORE [0xE0], R0\nHALT');
      await steps(page, 2);
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('00');
      await expect(page.locator('[data-relay-flag="z"] output')).toHaveText('1');
      await expect(page.locator('[data-relay-flag="c"] output')).toHaveText('1');
      for (const source of unparseableStatements) {
        await page.locator('#relay-source').fill(source);
        await page.locator('[data-relay-action="assemble"]').click();
        await expect(page.locator('[data-relay-diagnostics]')).toContainText('Unparseable statement');
        await expect(page.locator('[data-relay-cycles]')).toHaveText('000002');
      }
      await page.locator('#relay-source').fill('MOV R0, 999\nJMP missing\n<img src=x onerror=alert(1)>');
      await page.locator('[data-relay-action="assemble"]').click();
      await expect(page.locator('[data-relay-diagnostics]')).toContainText('Line 1:');
      await expect(page.locator('[data-relay-diagnostics]')).toContainText('Line 2:');
      await expect(page.locator('[data-relay-diagnostics] img')).toHaveCount(0);
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000002');
      await expect(page.locator('[data-relay-sync]')).toHaveText('DRAFT / NOT LOADED');
      await steps(page, 2);
      await expect(page.locator('[data-relay-status]')).toHaveText('Halted');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000004');
      await expect(page.locator('[data-relay-action="run"]')).toBeDisabled();
      await page.locator('[data-relay-action="reverse"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Paused');
      await expect(page.locator('[data-relay-action="run"]')).toBeEnabled();
      await page.locator('[data-relay-action="reset"]').click();
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await expect(page.locator('#relay-source')).toHaveValue('MOV R0, 999\nJMP missing\n<img src=x onerror=alert(1)>');
      await expect(page.locator('[data-relay-flag="c"] output')).toHaveText('0');
      await expect(page.locator('[data-relay-action="reverse"]')).toBeDisabled();
    });

    test('source and ROM breakpoints stop before execution and Run resumes exactly once', async ({ page }) => {
      await editAndLoad(page, 'MOV R0, 1\nloop: INC R0\nJMP loop');
      await page.getByRole('button', { name: 'Set breakpoint at line 2', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Remove breakpoint at line 2', exact: true })).toBeFocused();
      await page.locator('#relay-speed').selectOption('2000');
      await page.locator('[data-relay-action="run"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Breakpoint');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000001');
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('01');
      await page.locator('[data-relay-action="run"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Breakpoint');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000003');
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('02');
      await openInspector(page, 'memory');
      await page.getByRole('tab', { name: 'Program ROM', exact: true }).click();
      const romBreakpoint = page.getByRole('button', { name: 'Remove breakpoint at PC 0001', exact: true });
      await expect(romBreakpoint).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.relay-rom-current')).toContainText('INC R0');
      await romBreakpoint.click();
      await expect(page.getByRole('button', { name: 'Set breakpoint at PC 0001', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await page.locator('[data-relay-action="reset"]').click();
      await page.getByRole('button', { name: 'Set breakpoint at PC 0000', exact: true }).click();
      await page.locator('[data-relay-action="run"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Breakpoint');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await steps(page, 1);
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000001');
    });

    test('runaway programs stay bounded and responsive, pause holds every observable state', async ({ page }) => {
      await editAndLoad(page, 'loop: INC R0\nSTORE [0xE0], R0\nJMP loop');
      await page.locator('#relay-speed').selectOption('2000');
      await page.locator('[data-relay-action="run"]').click();
      await expect.poll(async () => Number(await page.locator('[data-relay-cycles]').textContent())).toBeGreaterThan(650);
      await page.locator('[data-relay-action="run"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Paused');
      await expect(page.locator('[data-relay-history]')).toHaveText('512 / 512 UNDO');
      await expect(page.locator('[data-relay-trace] > li')).toHaveCount(128);
      const cycles = await page.locator('[data-relay-cycles]').textContent();
      const framebuffer = await page.locator('[data-relay-screen]').innerHTML();
      const diagram = await page.locator('[data-relay-schematic]').innerHTML();
      await page.waitForTimeout(250);
      await expect(page.locator('[data-relay-cycles]')).toHaveText(cycles ?? '');
      expect(await page.locator('[data-relay-screen]').innerHTML()).toBe(framebuffer);
      expect(await page.locator('[data-relay-schematic]').innerHTML()).toBe(diagram);
      await page.locator('[data-relay-action="reverse"]').click();
      await expect(page.locator('[data-relay-cycles]')).toHaveText(String(Number(cycles) - 1).padStart(6, '0'));
      await page.locator('[data-relay-action="reset"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Ready');
      await expect(page.locator('[data-relay-history]')).toHaveText('0 / 512 UNDO');
    });

    test('fault states surface atomic stack failure, can reverse, and never auto-run', async ({ page }) => {
      await editAndLoad(page, 'MOV R0, 42\nRET');
      await steps(page, 2);
      await expect(page.locator('[data-relay-status]')).toHaveText('Faulted');
      await expect(page.locator('[data-relay-message]')).toContainText('Stack underflow');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000001');
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('2A');
      await expect(page.locator('[data-relay-pc]')).toHaveText('0001');
      await expect(page.locator('[data-relay-action="step"]')).toBeDisabled();
      await page.locator('[data-relay-action="reverse"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Paused');
      await expect(page.locator('[data-relay-action="step"]')).toBeEnabled();
      await expect(page.locator('[data-relay-pc]')).toHaveText('0001');
    });

    test('guided walkthrough explains all five states and protects unsaved source', async ({ page }) => {
      await page.locator('[data-relay-action="guide"]').click();
      await expect(page.locator('[data-relay-guide]')).toBeVisible();
      await expect(page.locator('[data-relay-guide-title]')).toHaveText('Load an idea');
      await expect(page.locator('[data-relay-guide-expected]')).toContainText('R0=12');
      for (const expected of [12, 12, 19, 19, 19]) {
        await page.locator('[data-relay-action="guide-next"]').click();
        await expect(page.locator('[data-relay-reg-dec="0"]')).toHaveText(`${expected} dec`);
      }
      await expect(page.locator('[data-relay-guide-progress]')).toHaveText('GUIDED TRACE / COMPLETE');
      await expect(page.locator('[data-relay-status]')).toHaveText('Halted');
      await expect(page.locator('[data-relay-byte="64"]')).toHaveText('13');
      await page.locator('[data-relay-action="reverse"]').click();
      await page.locator('[data-relay-action="reverse"]').click();
      await expect(page.locator('[data-relay-byte="64"]')).toHaveText('00');
      await page.locator('#relay-source').fill('; keep this draft\nMOV R0, 99');
      await page.locator('[data-relay-resource="programs"]').click();
      await page.locator('[data-relay-load="fibonacci"]').click();
      await expect(page.locator('.relay-replace-dialog')).toBeVisible();
      await page.locator('[data-relay-action="replace-cancel"]').click();
      await expect(page.locator('#relay-source')).toHaveValue('; keep this draft\nMOV R0, 99');
      await page.locator('[data-relay-resource="programs"]').click();
      await page.locator('[data-relay-load="fibonacci"]').click();
      await page.locator('[data-relay-action="replace-confirm"]').click();
      await expect(page.locator('#relay-source')).toHaveValue(presets[1].source);
      await page.locator('#relay-speed').selectOption('2000');
      await page.locator('[data-relay-action="run"]').click();
      await expect(page.locator('[data-relay-status]')).toHaveText('Halted');
      for (const [offset, expected] of [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].entries()) {
        await expect(page.locator(`[data-relay-byte="${64 + offset}"]`)).toHaveText(hex(expected));
      }
    });

    test('exports real assembly and project files; validates imports without losing the current machine', async ({ page }) => {
      await editAndLoad(page, 'MOV R0, 128\nSTORE [0xE0], R0\nHALT');
      await steps(page, 2);
      await page.getByRole('button', { name: 'Set breakpoint at line 3', exact: true }).click();
      await page.locator('#relay-source').fill('; unsaved draft\nMOV R0, 17\nHALT');
      await page.locator('[data-relay-resource="files"]').click();
      const assemblyDownload = page.waitForEvent('download');
      await page.locator('[data-relay-action="export-asm"]').click();
      const assembly = await assemblyDownload;
      const assemblyPath = await assembly.path();
      expect(assemblyPath).not.toBeNull();
      if (!assemblyPath) throw new Error('Assembly download has no local path.');
      expect(await readFile(assemblyPath, 'utf8')).toBe('; unsaved draft\nMOV R0, 17\nHALT');
      const projectDownload = page.waitForEvent('download');
      await page.locator('.relay-workbench-footer [data-relay-action="save"]').click();
      const project = await projectDownload;
      const path = await project.path();
      if (!path) throw new Error('Project download has no local path.');
      const exported = await readFile(path, 'utf8');
      const imported = importProject(exported);
      expect(imported.ok).toBe(true);
      if (!imported.ok) throw new Error('UI export failed the model import validator.');
      expect(imported.machine.cpu).toMatchObject({ pc: 2, registers: [128, 0, 0, 0], cycles: 2 });
      expect(imported.machine.cpu.ram[224]).toBe(128);
      expect(imported.machine.breakpoints).toEqual([2]);
      expect(imported.draftSource).toBe('; unsaved draft\nMOV R0, 17\nHALT');
      await page.getByRole('button', { name: 'Close Project files', exact: true }).click();
      await page.locator('[data-relay-action="reset"]').click();
      await page.locator('[data-relay-file]').setInputFiles({ name: 'restored.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
      await expect(page.locator('[data-relay-message]')).toContainText('Project imported at cycle 2');
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('80');
      await expect(page.locator('[data-relay-sync]')).toHaveText('DRAFT / NOT LOADED');
      await expect(page.locator('.relay-pixel-on')).toHaveCount(1);
      await expect(page.locator('[data-relay-action="reverse"]')).toBeDisabled();
      await openInspector(page, 'memory');
      await page.getByRole('tab', { name: 'Program ROM', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Remove breakpoint at PC 0002', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.locator('[data-relay-file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(exported.replace('"relay-8-v1"', '"unsupported-isa"')) });
      await expect(page.locator('[data-relay-diagnostics]')).toContainText('Unsupported instruction set');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000002');
      await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('80');
      await expect(page.locator('#relay-source')).toHaveValue('; unsaved draft\nMOV R0, 17\nHALT');
    });

    test('keyboard controls stay scoped, memory tabs follow ARIA keyboard navigation', async ({ page }) => {
      await page.locator('#relay-source').focus();
      await page.keyboard.press('End');
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await page.locator('.relay-machine-pane').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000001');
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await openInspector(page, 'memory');
      await page.getByRole('tab', { name: 'Data RAM', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Program ROM', exact: true })).toBeFocused();
      await expect(page.getByRole('tab', { name: 'Program ROM', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('End');
      await expect(page.getByRole('tab', { name: 'Stack', exact: true })).toBeFocused();
      await expect(page.locator('#relay-inspector')).toContainText('The stack is empty.');
    });

    test('desktop visual review: loaded instrument, genuine bus activity, no page overflow', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('relay-desktop-arrival.png') });
      await steps(page, 7);
      await expect(page.locator('[data-relay-event-title]')).toHaveText('STORE [R1], R3');
      await expect(page.locator('.relay-wire-active')).not.toHaveCount(0);
      await expect(page.locator('.relay-register-written')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectViewport(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('relay-desktop-store.png') });
      await page.locator('[data-relay-resource="programs"]').click();
      await page.screenshot({ path: testInfo.outputPath('relay-program-library.png') });
      await page.getByRole('button', { name: 'Close Program library', exact: true }).click();
      for (const selector of ['#relay-source', '.relay-gutter button', '.relay-transport button', '.relay-byte', '.relay-pane-heading h2', '.relay-register > span:first-child']) {
        expect(await page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), selector).toBeGreaterThanOrEqual(14);
      }
    });

    test('mobile panes, editing, real display, reduced motion and 320px layout', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('.relay-mobile-tabs')).toBeVisible();
      await expect(page.locator('.relay-compact-schematic')).toBeVisible();
      await expect(page.locator('.relay-source-pane')).not.toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('relay-mobile-computer.png') });
      await page.locator('[data-relay-pane="source"]').click();
      await editAndLoad(page, 'MOV R0, 129\nSTORE [0xE0], R0\nHALT');
      await expect(page.locator('#relay-source')).toBeVisible();
      expect(await page.locator('.relay-gutter button').evaluateAll((buttons) => buttons.every((button) => parseFloat(getComputedStyle(button).fontSize) >= 14))).toBe(true);
      await steps(page, 2);
      await page.locator('[data-relay-pane="output"]').click();
      await expect(page.locator('[data-relay-screen]')).toBeVisible();
      await expect(page.locator('.relay-pixel-on')).toHaveCount(2);
      await expect(page.locator('[data-relay-event-description]')).toContainText('Write R0 (129) to RAM[0xE0]');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('relay-mobile-screen.png') });
      await page.waitForTimeout(200);
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000002');
      const hasAnimation = await page.locator('.project-relay').evaluate((root) => root.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'));
      expect(hasAnimation).toBe(false);
      for (const width of [320, 390, 700, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const pane of ['machine', 'source', 'output']) {
          if (width < 1000) await page.locator(`[data-relay-pane="${pane}"]`).click();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px / ${pane}`).toBe(true);
          await expectViewport(page);
        }
      }
    });

    for (const viewport of [
      { width: 1440, height: 900 }, { width: 1280, height: 720 },
      { width: 375, height: 812 }, { width: 320, height: 640 }, { width: 768, height: 480 },
    ]) {
      test(`fixed workspace ${viewport.width}x${viewport.height}: edit, inspect, reverse and resources`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await expect(page.locator('.project-relay')).toHaveAttribute('data-workspace', 'true');
        await expectViewport(page);
        await page.screenshot({ path: testInfo.outputPath(`relay-${viewport.width}x${viewport.height}-arrival.png`) });
        await editAndLoad(page, 'MOV R0, 129\nSTORE [0xE0], R0\nHALT');
        await page.locator('#relay-source').press('End');
        await page.locator('#relay-source').press('Space');
        await page.locator('#relay-source').press('ArrowLeft');
        await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
        await expectViewport(page);
        await page.screenshot({ path: testInfo.outputPath(`relay-${viewport.width}x${viewport.height}-source.png`) });
        await steps(page, 2);
        await openInspector(page, 'output');
        await expect(page.locator('[data-relay-screen]')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.relay-pixel-on')).toHaveCount(2);
        await expectViewport(page);
        await openInspector(page, 'memory');
        await page.getByRole('tab', { name: 'Data RAM', exact: true }).click();
        await page.locator('[data-relay-byte="224"]').click();
        await expect(page.locator('[data-relay-memory-note]')).toContainText('129 decimal = 10000001 binary');
        await expectViewport(page);
        await page.screenshot({ path: testInfo.outputPath(`relay-${viewport.width}x${viewport.height}-memory.png`) });
        await page.locator('[data-relay-action="reverse"]').click();
        await expect(page.locator('[data-relay-byte="224"]')).toHaveText('00');
        await expect(page.locator('[data-relay-cycles]')).toHaveText('000001');
        await openInspector(page, 'trace');
        await expect(page.locator('[data-relay-trace]')).toContainText('MOV R0, 0x81');
        await expect(page.locator('[data-relay-trace] > li')).toHaveCount(1);
        await expectViewport(page);
        await page.locator('[data-relay-action="reverse"]').click();
        await expect(page.locator('[data-relay-reg-hex="0"]')).toHaveText('00');
        await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
        await openInspector(page, 'guide');
        await expect(page.locator('[data-relay-action="guide-start"]')).toBeVisible();
        await expectViewport(page);
        await page.locator('[data-relay-resource="manual"]').click();
        await expect(page.getByRole('dialog', { name: 'Field manual', exact: true })).toBeVisible();
        await page.getByText('Encoding & operating limits', { exact: true }).click();
        await expect(page.getByRole('heading', { name: 'A word, taken apart.' })).toBeVisible();
        await expectViewport(page);
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-relay-resource="manual"]')).toBeFocused();
        await page.locator('[data-relay-resource="files"]').click();
        await expect(page.getByRole('button', { name: /Export .asm/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /Import JSON/ })).toBeVisible();
        await expectViewport(page);
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-relay-resource="files"]')).toBeFocused();
        await page.locator('[data-relay-resource="programs"]').click();
        await expect(page.locator('[data-relay-load="fibonacci"]')).toBeVisible();
        await expectViewport(page);
        await page.keyboard.press('Escape');
        if (viewport.width < 1000) {
          await page.locator('[data-relay-pane="machine"]').click();
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('[data-relay-pane="source"]')).toBeFocused();
          await expect(page.locator('#relay-source')).toBeVisible();
          await expect(page.locator('.relay-machine-pane')).toHaveAttribute('inert', '');
        }
        await expectViewport(page);
      });
    }

    test('navigation destroys running loops and mounts a clean, paused machine on return', async ({ page }) => {
      await editAndLoad(page, 'loop: INC R0\nJMP loop');
      await page.locator('#relay-speed').selectOption('2000');
      await page.locator('[data-relay-action="run"]').click();
      await expect.poll(async () => Number(await page.locator('[data-relay-cycles]').textContent())).toBeGreaterThan(10);
      await page.goto('/');
      await expect(page.locator('.project-relay')).toHaveCount(0);
      await page.goto('./projects/relay/');
      await expect(page.locator('[data-relay-status]')).toHaveText('Ready');
      await expect(page.locator('[data-relay-cycles]')).toHaveText('000000');
      await expect(page.locator('#relay-source')).toHaveValue(defaultPreset.source);
    });

    test('mount contract cancels RAF, holds collection pause, and disposes on abort or repeated destroy', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const entry = '/src/projects/relay/index.ts';
        const relay: typeof import('../../src/projects/relay/index') = await import(entry);
        const host = document.createElement('div');
        document.body.append(host);
        const controller = new AbortController();
        const pending = new Set<number>();
        const originalRaf = window.requestAnimationFrame;
        const originalCancel = window.cancelAnimationFrame;
        window.requestAnimationFrame = (callback) => {
          const id = originalRaf.call(window, (now) => { pending.delete(id); callback(now); });
          pending.add(id);
          return id;
        };
        window.cancelAnimationFrame = (id) => { pending.delete(id); originalCancel.call(window, id); };
        const instance = relay.mount({
          container: host, controls: host, signal: controller.signal, reducedMotion: true, report: () => {},
        });
        const editor = host.querySelector('#relay-source');
        const assembleButton = host.querySelector('[data-relay-action="assemble"]');
        const run = host.querySelector('[data-relay-action="run"]');
        const speed = host.querySelector('#relay-speed');
        const cycleOutput = host.querySelector('[data-relay-cycles]');
        if (!(editor instanceof HTMLTextAreaElement) || !(assembleButton instanceof HTMLButtonElement)
          || !(run instanceof HTMLButtonElement) || !(speed instanceof HTMLSelectElement) || !cycleOutput) {
          throw new Error('The mounted workbench is missing required controls.');
        }
        editor.value = 'loop: INC R0\nJMP loop';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        assembleButton.click();
        speed.value = '2000';
        speed.dispatchEvent(new Event('change', { bubbles: true }));
        run.click();
        await new Promise((resolve) => setTimeout(resolve, 140));
        instance.setPaused?.(true);
        const paused = Number(cycleOutput.textContent);
        instance.setPaused?.(false);
        await new Promise((resolve) => setTimeout(resolve, 80));
        const afterUnpause = Number(cycleOutput.textContent);
        run.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        controller.abort();
        instance.destroy();
        instance.destroy();
        const atDestroy = Number(cycleOutput.textContent);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const final = Number(cycleOutput.textContent);
        const remaining = pending.size;
        const removed = host.childElementCount === 0;
        window.requestAnimationFrame = originalRaf;
        window.cancelAnimationFrame = originalCancel;
        host.remove();
        return { paused, afterUnpause, atDestroy, final, remaining, removed };
      });
      expect(result.paused).toBeGreaterThan(0);
      expect(result.afterUnpause).toBe(result.paused);
      expect(result.atDestroy).toBeGreaterThan(result.paused);
      expect(result.final).toBe(result.atDestroy);
      expect(result.remaining).toBe(0);
      expect(result.removed).toBe(true);
    });
  });

  test('Fibonacci and bubble sort compute exact RAM outputs and walkthrough matches its guide', () => {
    for (const preset of presets) {
      expect(assemble(preset.source).ok, preset.id).toBe(true);
      expect(preset.goal).toBeTruthy();
      expect(preset.expected).toBeTruthy();
      if (preset.id === 'fibonacci') {
        expect(complete(preset.source).cpu.ram.slice(0x40, 0x4c)).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
      }
      if (preset.id === 'bubble-sort') {
        expect(complete(preset.source).cpu.ram.slice(0x40, 0x48)).toEqual([3, 7, 12, 18, 42, 64, 99, 201]);
      }
      if (preset.id === 'first-steps') {
        const machine = complete(preset.source);
        expect(machine.cpu).toMatchObject({ registers: [19, 7, 0, 0], pc: 5, cycles: 5, status: 'halted', flags: { z: false, n: false, c: false } });
        expect(machine.cpu.ram[64]).toBe(19);
        expect(guideSteps.map((step) => step.pc)).toEqual([0, 1, 2, 3, 4]);
      }
    }
  });

  test('binary counter stays bounded and truly wraps after drawing complementary framebuffer rows', () => {
    const counter = presets.find((preset) => preset.id === 'binary-counter');
    if (!counter) throw new Error('Missing binary counter preset.');
    let machine = createMachine(program(counter.source));
    const rowPc = machine.program.symbols.ROW;
    const delayPc = machine.program.symbols.DELAY;
    machine = setBreakpoint(machine, delayPc);
    const firstFrame = runBatch(machine, 128);
    expect(firstFrame.reason).toBe('breakpoint');
    expect(firstFrame.machine.cpu.ram.slice(0xe0)).toEqual(Array.from({ length: 32 }, (_, index) => index % 2 === 0 ? 0 : 255));
    const resumed = runBatch(firstFrame.machine, 128, { skipInitialBreakpoint: true });
    expect(resumed.executed).toBe(2);
    expect(resumed.reason).toBe('breakpoint');
    machine = setBreakpoint(firstFrame.machine, delayPc, false);
    for (let batch = 0; batch < 10; batch += 1) {
      const result = runBatch(machine, 1e9);
      expect(result.executed).toBe(128);
      expect(result.reason).toBe('budget');
      machine = result.machine;
    }
    expect(machine.cpu.registers[0]).toBeGreaterThan(0);
    expect(machine.cpu.status).toBe('ready');
    expect(machine.history).toHaveLength(HISTORY_LIMIT);
    // Start a complete final byte-count frame, then follow wraparound to the next frame.
    machine = createMachine(program(counter.source));
    machine.cpu.pc = rowPc;
    machine.cpu.registers = [255, 224, 0, 0];
    machine = setBreakpoint(machine, delayPc);
    const lastFrame = runBatch(machine, 128);
    expect(lastFrame.machine.cpu.ram.slice(0xe0)).toEqual(Array.from({ length: 32 }, (_, index) => index % 2 === 0 ? 255 : 0));
    machine = setBreakpoint(lastFrame.machine, delayPc, false);
    machine = setBreakpoint(machine, machine.program.symbols.COUNT);
    const wrapped = runBatch(machine, 128);
    expect(wrapped).toMatchObject({ reason: 'breakpoint', machine: { cpu: { registers: [0, 0, 0, 0] } } });
  });
});
