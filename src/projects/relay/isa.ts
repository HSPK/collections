/** RELAY-8 v1: one 16-bit word per instruction, separate program and data memory. */
export const ISA_ID = 'relay-8-v1';
export const RAM_SIZE = 256;
export const PROGRAM_LIMIT = 256;
export const STACK_LIMIT = 32;
export const MAX_SOURCE_BYTES = 32 * 1024;
export const MAX_SOURCE_LINES = 2048;
export const MAX_CYCLES = 1_000_000_000;

export const isa = [
  { op: 'NOP', code: 0, form: 'none', syntax: 'NOP', flags: '—', description: 'Advance without changing data or flags.' },
  { op: 'HALT', code: 1, form: 'none', syntax: 'HALT', flags: '—', description: 'Stop; PC advances past HALT. Reverse or reset to continue.' },
  { op: 'MOV', code: 2, form: 'source', syntax: 'MOV Rd, byte | Rs', flags: '—', description: 'Copy a byte or register into Rd.' },
  { op: 'ADD', code: 3, form: 'source', syntax: 'ADD Rd, byte | Rs', flags: 'Z N C', description: 'Add; carry is unsigned overflow.' },
  { op: 'ADC', code: 4, form: 'source', syntax: 'ADC Rd, byte | Rs', flags: 'Z N C', description: 'Add the source and incoming carry.' },
  { op: 'SUB', code: 5, form: 'source', syntax: 'SUB Rd, byte | Rs', flags: 'Z N C', description: 'Subtract; carry means no unsigned borrow.' },
  { op: 'CMP', code: 6, form: 'source', syntax: 'CMP Rd, byte | Rs', flags: 'Z N C', description: 'Set subtraction flags without writing Rd.' },
  { op: 'INC', code: 7, form: 'unary', syntax: 'INC Rd', flags: 'Z N C', description: 'Add one, including unsigned carry.' },
  { op: 'DEC', code: 8, form: 'unary', syntax: 'DEC Rd', flags: 'Z N C', description: 'Subtract one; carry means no borrow.' },
  { op: 'AND', code: 9, form: 'source', syntax: 'AND Rd, byte | Rs', flags: 'Z N; C=0', description: 'Bitwise AND.' },
  { op: 'OR', code: 10, form: 'source', syntax: 'OR Rd, byte | Rs', flags: 'Z N; C=0', description: 'Bitwise OR.' },
  { op: 'XOR', code: 11, form: 'source', syntax: 'XOR Rd, byte | Rs', flags: 'Z N; C=0', description: 'Bitwise exclusive OR.' },
  { op: 'NOT', code: 12, form: 'unary', syntax: 'NOT Rd', flags: 'Z N; C=0', description: 'Invert all eight bits.' },
  { op: 'SHL', code: 13, form: 'unary', syntax: 'SHL Rd', flags: 'Z N C', description: 'Shift left once; old bit 7 becomes carry.' },
  { op: 'SHR', code: 14, form: 'unary', syntax: 'SHR Rd', flags: 'Z N C', description: 'Logical shift right once; old bit 0 becomes carry.' },
  { op: 'LOAD', code: 15, form: 'load', syntax: 'LOAD Rd, [address] | [Ra]', flags: '—', description: 'Read data RAM, directly or through an address register.' },
  { op: 'STORE', code: 16, form: 'store', syntax: 'STORE [address] | [Ra], Rs', flags: '—', description: 'Write data RAM; the encoded dst field selects the source register.' },
  { op: 'JMP', code: 17, form: 'branch', syntax: 'JMP target', flags: '—', description: 'Jump to an absolute program-word address.' },
  { op: 'JZ', code: 18, form: 'branch', syntax: 'JZ target', flags: '—', description: 'Jump if zero is set.' },
  { op: 'JNZ', code: 19, form: 'branch', syntax: 'JNZ target', flags: '—', description: 'Jump if zero is clear.' },
  { op: 'JC', code: 20, form: 'branch', syntax: 'JC target', flags: '—', description: 'Jump if carry is set (also no-borrow after subtraction).' },
  { op: 'JNC', code: 21, form: 'branch', syntax: 'JNC target', flags: '—', description: 'Jump if carry is clear.' },
  { op: 'JN', code: 22, form: 'branch', syntax: 'JN target', flags: '—', description: 'Jump if the result sign bit is set.' },
  { op: 'JNN', code: 23, form: 'branch', syntax: 'JNN target', flags: '—', description: 'Jump if the result sign bit is clear.' },
  { op: 'CALL', code: 24, form: 'branch', syntax: 'CALL target', flags: '—', description: 'Push the next PC as a word, then jump.' },
  { op: 'RET', code: 25, form: 'none', syntax: 'RET', flags: '—', description: 'Pop a word into PC; target validity is checked at the next fetch.' },
  { op: 'PUSH', code: 26, form: 'unary', syntax: 'PUSH Rs', flags: '—', description: 'Push a zero-extended byte onto the shared word stack.' },
  { op: 'POP', code: 27, form: 'unary', syntax: 'POP Rd', flags: '—', description: 'Pop a word, retaining its low byte in Rd.' },
] as const;

export const instructionSet = isa;
export type InstructionMetadata = (typeof isa)[number];
export type Opcode = InstructionMetadata['op'];
export interface DecodedInstruction {
  op: Opcode;
  dst: number;
  mode: 0 | 1;
  arg: number;
}
export type DecodeResult =
  | { ok: true; instruction: DecodedInstruction }
  | { ok: false; error: string };

export function instructionMetadata(op: string): InstructionMetadata | undefined {
  return isa.find((entry) => entry.op === op.toUpperCase());
}

export function hex(value: number, width = 2): string {
  const boundedWidth = Number.isFinite(width) ? Math.max(1, Math.min(16, Math.trunc(width))) : 2;
  return Math.trunc(value).toString(16).toUpperCase().padStart(boundedWidth, '0');
}

export function decodeInstruction(word: number): DecodeResult {
  if (!Number.isInteger(word) || word < 0 || word > 0xffff) {
    return { ok: false, error: 'Instruction word must be an unsigned 16-bit integer.' };
  }
  const code = word >>> 11;
  const metadata = isa.find((entry) => entry.code === code);
  if (!metadata) return { ok: false, error: `Unknown opcode ${code}.` };
  const dst = (word >>> 9) & 3;
  const mode = (word & 0x100) === 0 ? 0 : 1;
  const arg = word & 0xff;
  if (metadata.form === 'none' && (dst !== 0 || mode !== 0 || arg !== 0)) {
    return { ok: false, error: `${metadata.op} requires all operand bits to be zero.` };
  }
  if (metadata.form === 'unary' && (mode !== 0 || arg !== 0)) {
    return { ok: false, error: `${metadata.op} requires mode and argument bits to be zero.` };
  }
  if (metadata.form === 'branch' && (dst !== 0 || mode !== 0)) {
    return { ok: false, error: `${metadata.op} requires dst and mode bits to be zero.` };
  }
  if (mode === 1 && arg > 3) {
    return { ok: false, error: 'Register-mode argument must be R0–R3 (0–3).' };
  }
  return { ok: true, instruction: { op: metadata.op, dst, mode, arg } };
}

export function encodeInstruction(instruction: DecodedInstruction): number {
  const metadata = instructionMetadata(instruction.op);
  if (!metadata || !Number.isInteger(instruction.dst) || instruction.dst < 0 || instruction.dst > 3
    || (instruction.mode !== 0 && instruction.mode !== 1)
    || !Number.isInteger(instruction.arg) || instruction.arg < 0 || instruction.arg > 255) {
    throw new RangeError('Instruction operands are outside the RELAY-8 encoding.');
  }
  const word = (metadata.code << 11) | (instruction.dst << 9) | (instruction.mode << 8) | instruction.arg;
  const decoded = decodeInstruction(word);
  if (!decoded.ok) throw new RangeError(decoded.error);
  return word;
}

export function formatInstruction(instruction: DecodedInstruction): string {
  const metadata = instructionMetadata(instruction.op);
  const register = `R${instruction.dst}`;
  const argument = instruction.mode === 1 ? `R${instruction.arg}` : `0x${hex(instruction.arg)}`;
  switch (metadata?.form) {
    case 'none': return instruction.op;
    case 'unary': return `${instruction.op} ${register}`;
    case 'branch': return `${instruction.op} 0x${hex(instruction.arg)}`;
    case 'source': return `${instruction.op} ${register}, ${argument}`;
    case 'load': return `LOAD ${register}, [${argument}]`;
    case 'store': return `STORE [${argument}], ${register}`;
    default: return instruction.op;
  }
}

/** UTF-8 byte count without allocating an unbounded encoded copy of source text. */
export function sourceByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
