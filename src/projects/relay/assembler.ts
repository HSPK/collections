import {
  encodeInstruction, instructionMetadata, MAX_SOURCE_BYTES, MAX_SOURCE_LINES,
  PROGRAM_LIMIT, RAM_SIZE, sourceByteLength,
} from './isa';
import type { DecodedInstruction, InstructionMetadata } from './isa';

export interface Diagnostic {
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface ProgramInstruction extends DecodedInstruction {
  pc: number;
  line: number;
  text: string;
  word: number;
}

export interface Program {
  source: string;
  words: number[];
  instructions: ProgramInstruction[];
  initialRam: number[];
  /** Case-normalized names, including both labels and constants. */
  symbols: Record<string, number>;
}

export type AssembleResult =
  | { ok: true; program: Program }
  | { ok: false; diagnostics: Diagnostic[] };

interface Statement {
  line: number;
  column: number;
  text: string;
  operands: string[];
  metadata: InstructionMetadata | null;
  pc: number;
}
interface Definition {
  line: number;
  value: number | string;
}

const SYMBOL = /^[A-Z_][A-Z0-9_]*$/i;
const REGISTER = /^R[0-3]$/i;
const NUMBER = /^(?:[0-9]+|0x[0-9a-f]+|0b[01]+)$/i;

export function assemble(source: string): AssembleResult {
  const diagnostics: Diagnostic[] = [];
  const report = (line: number, column: number, code: string, message: string): void => {
    diagnostics.push({ line, column, code, message });
  };
  if (source.length > MAX_SOURCE_BYTES || sourceByteLength(source) > MAX_SOURCE_BYTES) {
    return { ok: false, diagnostics: [{ line: 1, column: 1, code: 'SOURCE_SIZE', message: 'Source exceeds 32 KiB of UTF-8 text.' }] };
  }
  const lines = source.split(/\r\n|\n|\r/);
  if (lines.length > MAX_SOURCE_LINES) {
    return { ok: false, diagnostics: [{ line: MAX_SOURCE_LINES + 1, column: 1, code: 'SOURCE_LINES', message: 'Source exceeds 2048 lines.' }] };
  }
  const definitions = new Map<string, Definition>();
  const statements: Statement[] = [];
  let pc = 0;
  const define = (name: string, value: number | string, line: number, column: number): void => {
    const key = name.toUpperCase();
    if (!SYMBOL.test(name) || REGISTER.test(name)) {
      report(line, column, 'SYMBOL_NAME', `Invalid symbol name "${name}".`);
    } else if (definitions.has(key)) {
      report(line, column, 'DUPLICATE_SYMBOL', `Symbol "${key}" is already defined.`);
    } else {
      definitions.set(key, { line, value });
    }
  };

  lines.forEach((raw, index) => {
    const line = index + 1;
    let text = raw.split(';')[0].trim();
    const column = Math.max(1, raw.indexOf(text) + 1);
    if (!text) return;
    const label = /^([A-Z_][A-Z0-9_]*)\s*:/i.exec(text);
    if (label) {
      define(label[1], pc, line, column);
      text = text.slice(label[0].length).trim();
      if (!text) return;
    }
    const head = /^(\S+)(?:\s+(.*))?$/.exec(text);
    if (!head) {
      report(line, column, 'SYNTAX', 'Unparseable statement. Put each instruction on its own line using a standard newline.');
      return;
    }
    const name = head[1].toUpperCase();
    const operands = head[2] === undefined ? [] : head[2].split(',').map((value) => value.trim());
    if (name === '.EQU') {
      if (operands.length !== 2 || operands.some((value) => !value)) {
        report(line, column, 'OPERAND_COUNT', '.equ requires a name and one value: .equ NAME, value.');
      } else {
        define(operands[0], operands[1], line, column);
      }
      return;
    }
    if (name === '.BYTE') {
      if (operands.length < 2 || operands.some((value) => !value)) {
        report(line, column, 'OPERAND_COUNT', '.byte requires an address and at least one byte.');
      } else {
        statements.push({ line, column, text, operands, metadata: null, pc });
      }
      return;
    }
    const metadata = instructionMetadata(name);
    if (!metadata) {
      report(line, column, name.startsWith('.') ? 'DIRECTIVE' : 'OPCODE', `Unknown ${name.startsWith('.') ? 'directive' : 'instruction'} "${name}".`);
      return;
    }
    if (pc >= PROGRAM_LIMIT) {
      report(line, column, 'PROGRAM_SIZE', 'Program exceeds 256 instruction words.');
    }
    statements.push({ line, column, text, operands, metadata, pc });
    pc += 1;
  });

  const symbols: Record<string, number> = {};
  const resolving = new Set<string>();
  const failed = new Set<string>();
  const resolve = (token: string, line: number, column: number): number | null => {
    if (NUMBER.test(token)) {
      const number = Number(token);
      if (Number.isSafeInteger(number) && number <= 0xffff) return number;
      report(line, column, 'VALUE_RANGE', `Value "${token}" must be in 0–65535.`);
      return null;
    }
    if (!SYMBOL.test(token) || REGISTER.test(token)) {
      report(line, column, 'VALUE', `Expected an unsigned decimal, hex, binary, or symbol value; received "${token}".`);
      return null;
    }
    const key = token.toUpperCase();
    if (Object.hasOwn(symbols, key)) return symbols[key];
    if (failed.has(key)) return null;
    const definition = definitions.get(key);
    if (!definition) {
      report(line, column, 'UNDEFINED_SYMBOL', `Undefined symbol "${key}".`);
      return null;
    }
    if (resolving.has(key)) {
      report(line, column, 'CYCLIC_SYMBOL', `Cyclic constant definition involving "${key}".`);
      failed.add(key);
      return null;
    }
    if (resolving.size >= 128) {
      report(line, column, 'SYMBOL_DEPTH', 'Constant references exceed the 128-level resolution limit.');
      failed.add(key);
      return null;
    }
    resolving.add(key);
    const value = typeof definition.value === 'number'
      ? definition.value
      : resolve(definition.value, definition.line, 1);
    resolving.delete(key);
    if (value !== null) symbols[key] = value;
    else failed.add(key);
    return value;
  };
  for (const [name, definition] of definitions) resolve(name, definition.line, 1);

  const words: number[] = [];
  const instructions: ProgramInstruction[] = [];
  const initialRam = Array<number>(RAM_SIZE).fill(0);
  const initialized = new Set<number>();
  for (const statement of statements) {
    const { line, column, operands, metadata } = statement;
    const byte = (token: string): number | null => {
      const value = resolve(token, line, column);
      if (value !== null && value > 255) {
        report(line, column, 'BYTE_RANGE', `Value "${token}" must fit in one byte (0–255).`);
        return null;
      }
      return value;
    };
    const register = (token: string): number | null => {
      if (REGISTER.test(token)) return Number(token[1]);
      report(line, column, 'REGISTER', `Expected R0–R3; received "${token}".`);
      return null;
    };
    const address = (token: string): { mode: 0 | 1; arg: number } | null => {
      const match = /^\[\s*([^\[\]]+?)\s*\]$/.exec(token);
      if (!match) {
        report(line, column, 'ADDRESS', `Expected a bracketed RAM address or register; received "${token}".`);
        return null;
      }
      const content = match[1].trim();
      if (REGISTER.test(content)) return { mode: 1, arg: Number(content[1]) };
      const value = byte(content);
      return value === null ? null : { mode: 0, arg: value };
    };
    if (!metadata) {
      const start = byte(operands[0]);
      const values = operands.slice(1).map(byte);
      if (start === null || values.some((value) => value === null)) continue;
      if (start + values.length > RAM_SIZE) {
        report(line, column, 'DATA_RANGE', '.byte data extends beyond RAM address 0xFF.');
        continue;
      }
      values.forEach((value, offset) => {
        const at = start + offset;
        if (initialized.has(at)) {
          report(line, column, 'DATA_OVERLAP', `RAM address 0x${at.toString(16).toUpperCase()} is initialized more than once.`);
        } else if (value !== null) {
          initialized.add(at);
          initialRam[at] = value;
        }
      });
      continue;
    }
    const count = metadata.form === 'none' ? 0 : metadata.form === 'unary' || metadata.form === 'branch' ? 1 : 2;
    if (operands.length !== count || operands.some((value) => !value)) {
      report(line, column, 'OPERAND_COUNT', `${metadata.op} expects ${count} operand${count === 1 ? '' : 's'}: ${metadata.syntax}.`);
      continue;
    }
    let dst = 0;
    let mode: 0 | 1 = 0;
    let arg = 0;
    if (metadata.form === 'unary' || metadata.form === 'source' || metadata.form === 'load' || metadata.form === 'store') {
      const selected = register(operands[metadata.form === 'store' ? 1 : 0]);
      if (selected === null) continue;
      dst = selected;
    }
    if (metadata.form === 'source') {
      if (REGISTER.test(operands[1])) {
        mode = 1;
        arg = Number(operands[1][1]);
      } else {
        const value = byte(operands[1]);
        if (value === null) continue;
        arg = value;
      }
    }
    if (metadata.form === 'load' || metadata.form === 'store') {
      const value = address(operands[metadata.form === 'store' ? 0 : 1]);
      if (!value) continue;
      mode = value.mode;
      arg = value.arg;
    }
    if (metadata.form === 'branch') {
      const value = byte(operands[0]);
      if (value === null) continue;
      arg = value;
    }
    const decoded: DecodedInstruction = { op: metadata.op, dst, mode, arg };
    const word = encodeInstruction(decoded);
    words.push(word);
    instructions.push({ ...decoded, pc: statement.pc, line, text: statement.text, word });
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, program: { source, words, instructions, initialRam, symbols } };
}
