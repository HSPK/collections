import { decodeInstruction, formatInstruction, hex, MAX_CYCLES, RAM_SIZE, STACK_LIMIT } from './isa';
import type { Opcode } from './isa';
import type { Program } from './assembler';

export interface Flags {
  z: boolean;
  n: boolean;
  c: boolean;
}
export interface CpuState {
  registers: [number, number, number, number];
  ram: number[];
  /** Bottom to top; CALL return words and zero-extended PUSH bytes share this stack. */
  stack: number[];
  pc: number;
  flags: Flags;
  cycles: number;
  status: 'ready' | 'halted' | 'faulted';
  fault: string | null;
}
export interface Transfer {
  from: string;
  to: string;
  value: number;
}
export interface MemoryAccess {
  address: number;
  kind: 'read' | 'write';
  before: number;
  value: number;
}
export interface RegisterWrite {
  register: number;
  before: number;
  value: number;
}
export interface StepEvent {
  cycle: number;
  pc: number;
  /** One-based source line; null when the attempted PC has no source instruction. */
  line: number | null;
  instruction: string;
  kind: 'instruction' | 'halt' | 'fault';
  op: Opcode | null;
  transfers: Transfer[];
  memory: MemoryAccess[];
  registerWrites: RegisterWrite[];
  alu: { operation: string; left: number; right: number | null; result: number } | null;
  branchTaken: boolean | null;
  description: string;
}
export interface StepResult {
  state: CpuState;
  /** null for an already halted/faulted CPU: no new attempted instruction. */
  event: StepEvent | null;
}

export function cloneCpu(state: CpuState): CpuState {
  return {
    ...state,
    registers: [...state.registers],
    ram: [...state.ram],
    stack: [...state.stack],
    flags: { ...state.flags },
  };
}

export function createCpu(program: Program): CpuState {
  return {
    registers: [0, 0, 0, 0],
    ram: [...program.initialRam],
    stack: [],
    pc: 0,
    flags: { z: false, n: false, c: false },
    cycles: 0,
    status: 'ready',
    fault: null,
  };
}

export function stepCpu(program: Program, previous: CpuState): StepResult {
  const state = cloneCpu(previous);
  if (state.status !== 'ready') return { state, event: null };
  const pc = state.pc;
  const event: StepEvent = {
    cycle: state.cycles,
    pc,
    line: program.instructions[pc]?.line ?? null,
    instruction: 'FETCH',
    kind: 'instruction',
    op: null,
    transfers: [],
    memory: [],
    registerWrites: [],
    alu: null,
    branchTaken: null,
    description: '',
  };
  const fault = (message: string): StepResult => {
    state.status = 'faulted';
    state.fault = message;
    event.kind = 'fault';
    event.description = message;
    return { state, event };
  };
  if (!Number.isInteger(pc) || pc < 0 || pc >= program.words.length || pc > 255) {
    return fault(`Fetch fault: PC 0x${hex(pc, 4)} is outside the loaded program (${program.words.length} words).`);
  }
  const word = program.words[pc];
  const decoded = decodeInstruction(word);
  if (!decoded.ok) return fault(`Decode fault at 0x${hex(pc)}: ${decoded.error}`);
  const { op, dst, mode, arg } = decoded.instruction;
  event.instruction = formatInstruction(decoded.instruction);
  event.op = op;
  if (state.cycles >= MAX_CYCLES) return fault(`Cycle limit of ${MAX_CYCLES} reached.`);
  if ((op === 'PUSH' || op === 'CALL') && state.stack.length >= STACK_LIMIT) {
    return fault(`Stack overflow: ${STACK_LIMIT} words is the maximum.`);
  }
  if ((op === 'POP' || op === 'RET') && state.stack.length === 0) {
    return fault(`Stack underflow: ${op} needs a stack word.`);
  }

  event.transfers.push({ from: `ROM[0x${hex(pc)}]`, to: 'IR', value: word });
  state.pc += 1;
  state.cycles += 1;
  event.cycle = state.cycles;
  const left = state.registers[dst];
  const right = mode === 1 ? state.registers[arg] : arg;
  const sourceName = mode === 1 ? `R${arg}` : 'IMMEDIATE';
  const transfer = (from: string, to: string, value: number): void => {
    event.transfers.push({ from, to, value });
  };
  const write = (register: number, value: number, from: string): void => {
    const byte = value & 0xff;
    event.registerWrites.push({ register, before: state.registers[register], value: byte });
    state.registers[register] = byte;
    transfer(from, `R${register}`, byte);
  };
  const calculate = (result: number, carry: boolean, operand: number | null, writeBack = true): void => {
    const byte = result & 0xff;
    event.alu = { operation: op, left, right: operand, result: byte };
    transfer(`R${dst}`, 'ALU', left);
    if (operand !== null) transfer(op === 'INC' || op === 'DEC' ? 'ONE' : sourceName, 'ALU', operand);
    if (op === 'ADC') transfer('C', 'ALU', previous.flags.c ? 1 : 0);
    state.flags = { z: byte === 0, n: (byte & 0x80) !== 0, c: carry };
    transfer('ALU', 'FLAGS', (state.flags.z ? 4 : 0) | (state.flags.n ? 2 : 0) | (carry ? 1 : 0));
    if (writeBack) write(dst, byte, 'ALU');
    event.description = op === 'CMP'
      ? `Compare R${dst} (${left}) with ${operand}; registers are unchanged.`
      : `${op}: R${dst} becomes ${byte} (0x${hex(byte)}).`;
  };
  const jump = (taken: boolean): void => {
    event.branchTaken = taken;
    if (taken) {
      state.pc = arg;
      transfer('IMMEDIATE', 'PC', arg);
    }
    event.description = taken ? `${op} taken → 0x${hex(arg)}.` : `${op} not taken.`;
  };
  switch (op) {
    case 'NOP':
      event.description = 'No data or flags changed.';
      break;
    case 'HALT':
      state.status = 'halted';
      event.kind = 'halt';
      event.description = `Halted after ${state.cycles} cycles; PC points past HALT.`;
      break;
    case 'MOV':
      write(dst, right, sourceName);
      event.description = `Copy ${right} into R${dst}; flags preserved.`;
      break;
    case 'ADD': calculate(left + right, left + right > 255, right); break;
    case 'ADC': {
      const total = left + right + (state.flags.c ? 1 : 0);
      calculate(total, total > 255, right);
      break;
    }
    case 'SUB': calculate(left - right, left >= right, right); break;
    case 'CMP': calculate(left - right, left >= right, right, false); break;
    case 'INC': calculate(left + 1, left === 255, 1); break;
    case 'DEC': calculate(left - 1, left >= 1, 1); break;
    case 'AND': calculate(left & right, false, right); break;
    case 'OR': calculate(left | right, false, right); break;
    case 'XOR': calculate(left ^ right, false, right); break;
    case 'NOT': calculate(~left, false, null); break;
    case 'SHL': calculate(left << 1, (left & 0x80) !== 0, null); break;
    case 'SHR': calculate(left >>> 1, (left & 1) !== 0, null); break;
    case 'LOAD': {
      const address = right;
      const value = state.ram[address];
      event.memory.push({ address, kind: 'read', before: value, value });
      transfer(sourceName, 'ADDRESS', address);
      write(dst, value, `RAM[0x${hex(address)}]`);
      event.description = `Read RAM[0x${hex(address)}] (${value}) into R${dst}.`;
      break;
    }
    case 'STORE': {
      const address = right;
      event.memory.push({ address, kind: 'write', before: state.ram[address], value: left });
      transfer(sourceName, 'ADDRESS', address);
      transfer(`R${dst}`, `RAM[0x${hex(address)}]`, left);
      state.ram[address] = left;
      event.description = `Write R${dst} (${left}) to RAM[0x${hex(address)}].`;
      break;
    }
    case 'JMP': jump(true); break;
    case 'JZ': jump(state.flags.z); break;
    case 'JNZ': jump(!state.flags.z); break;
    case 'JC': jump(state.flags.c); break;
    case 'JNC': jump(!state.flags.c); break;
    case 'JN': jump(state.flags.n); break;
    case 'JNN': jump(!state.flags.n); break;
    case 'CALL':
      state.stack.push(state.pc);
      transfer('PC', 'STACK', state.pc);
      jump(true);
      event.description = `Push return PC 0x${hex(pc + 1, 4)}; call 0x${hex(arg)}.`;
      break;
    case 'RET': {
      const target = state.stack[state.stack.length - 1];
      state.stack.pop();
      state.pc = target;
      event.branchTaken = true;
      transfer('STACK', 'PC', target);
      event.description = `Return to 0x${hex(target, 4)}.`;
      break;
    }
    case 'PUSH':
      state.stack.push(left);
      transfer(`R${dst}`, 'STACK', left);
      event.description = `Push R${dst} (${left}); stack depth ${state.stack.length}.`;
      break;
    case 'POP': {
      const value = state.stack[state.stack.length - 1];
      state.stack.pop();
      write(dst, value, 'STACK');
      event.description = `Pop word 0x${hex(value, 4)} into R${dst}; retain its low byte.`;
      break;
    }
  }
  transfer('CONTROL', 'PC', state.pc);
  return { state, event };
}

/** Row-major pixels. RAM E0/E1 are the top row; bit 7 is leftmost in each byte. */
export function framebufferPixels(input: CpuState | readonly number[]): number[] {
  const ram = 'ram' in input ? input.ram : input;
  if (ram.length !== RAM_SIZE || ram.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError('Framebuffer requires exactly 256 RAM bytes.');
  }
  return Array.from({ length: 256 }, (_, pixel) => (ram[0xe0 + (pixel >>> 3)] >>> (7 - (pixel & 7))) & 1);
}
