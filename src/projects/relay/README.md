# RELAY — a computer you can follow

RELAY is an educational eight-bit computer with a real assembler, encoded program
ROM, byte-addressed data RAM, a word stack, deterministic execution, and a
reversible debugger. The model modules are pure TypeScript: no DOM, browser timers,
networking, storage, or automatic execution. The workbench owns rendering, draft
editing, run/pause, speed, file selection, and download.

**Architecture identifier: `relay-8-v1`.** This is an intentionally small
instruction set, not an emulator of a commercial processor.

## The machine

| Component | Size and behavior |
| --- | --- |
| General registers | Four unsigned bytes: `R0`, `R1`, `R2`, `R3` |
| Data RAM | 256 unsigned bytes, addresses `0x00`–`0xFF` |
| Program ROM | A separate array of 0–256 unsigned 16-bit instruction words |
| Program counter | Unsigned 16-bit **word address**, not a data-RAM address |
| Stack | One shared, bounded stack of 32 unsigned 16-bit words |
| Flags | `Z` zero, `N` result bit 7, `C` carry / no-borrow |
| Execution status | `ready`, `halted`, or `faulted` |
| Cycle counter | Integer from 0 through 1,000,000,000; one cycle per completed instruction |
| Framebuffer | RAM `0xE0`–`0xFF`: sixteen rows of sixteen one-bit pixels |

Registers start at zero. All flags start **clear**, even though registers are
zero. RAM starts with the assembled `.byte` image; uninitialized bytes are zero.
PC and cycles start at zero, the stack is empty, and status is `ready`.

Program ROM and data RAM are separate address spaces. `STORE [0], R0` changes
RAM byte zero, never program word zero. All instructions are one word long.
There is no timing difference between instructions and no hidden delay primitive.

### Fetch, HALT, and faults

Each step fetches `program.words[pc]` and decodes that **word**. The assembler's
`instructions` array supplies source locations for the UI, not executable
semantics. Unloaded slots do not implicitly contain `NOP` or `HALT`.

Normally PC advances once. A taken branch replaces it with its target. `HALT`
also advances PC and increments cycles, then sets status to `halted`. This means
PC points **after** the completed HALT. Stepping an already halted or faulted
machine returns a fresh CPU clone and `event: null`; no cycle is spent.

Fetch validates the current PC against the loaded program. A jump or return to
an unloaded address completes normally, and the **next fetch** faults. In a
256-word program, executing its last `NOP` leaves `PC=256`, status `ready`; the
following step faults. `RET` can similarly put any stack word in PC, including
65535, with validation deferred until fetch.

A failed fetch, invalid encoding, stack overflow/underflow, or exhausted cycle
counter is an **atomic fault**: PC, registers, RAM, flags, stack, and cycles remain
exactly as they were before that attempted instruction. Only status and the
human-readable fault message change. The debugger records a reversible fault
event. Faults consume no successful cycle, so a fault event's `cycle` can equal
the previous event's cycle. There is no silent stack fallback.

### The shared word stack

The stack array is ordered bottom to top.

* `PUSH Rs` pushes the byte in `Rs`, zero-extended to a 16-bit word.
* `POP Rd` removes one word and copies **its low byte** to `Rd`.
* `CALL target` pushes the next PC as a full word, then sets PC to `target`.
* `RET` pops a full word into PC.

CALL/RET and PUSH/POP intentionally share the same stack: preserve and restore
registers inside a function in balanced pairs before returning. Popping a return
address is legal but changes control flow. A CALL at word 255 can push return
address 256; it is not truncated to a byte. All four instructions preserve flags.

### Video memory

The framebuffer is monochrome, one means illuminated. Addresses `E0/E1` hold the
top row, `E2/E3` the next row, and `FE/FF` the bottom row. Bit 7 is leftmost
**within each byte**.

```text
pixel(x,y) = (RAM[0xE0 + 2*y + floor(x/8)] >> (7 - (x % 8))) & 1
```

`framebufferPixels(cpuOrRam)` returns 256 numeric zeros or ones in row-major order.
It rejects RAM that is not exactly 256 valid bytes. Writing video memory is an
ordinary `STORE`; there are no synthetic “draw pixel” instructions.

## Instruction encoding

```text
15           11 10     9 8 7                            0
+--------------+--------+-+------------------------------+
| opcode (5)   | dst(2) |m| argument (8)                 |
+--------------+--------+-+------------------------------+
word = (opcode << 11) | (dst << 9) | (mode << 8) | argument
```

The `dst` field selects a register 0–3. For STORE, it is the **source**
register. For PUSH it is also the source register. Canonical encodings:

| Form | `dst` | `mode` | `argument` |
| --- | --- | --- | --- |
| No operands: NOP, HALT, RET | 0 | 0 | 0 |
| Unary register: INC, DEC, NOT, SHL, SHR, PUSH, POP | Register | 0 | 0 |
| MOV, ADD, ADC, SUB, CMP, AND, OR, XOR with immediate | Destination | 0 | Byte 0–255 |
| Same operations with register source | Destination | 1 | Source register 0–3 |
| LOAD direct | Destination | 0 | RAM address 0–255 |
| LOAD indirect | Destination | 1 | RAM-address register 0–3 |
| STORE direct | Source | 0 | RAM address 0–255 |
| STORE indirect | Source | 1 | RAM-address register 0–3 |
| JMP, conditional jumps, CALL | 0 | 0 | Absolute program address 0–255 |

All unused operand bits must be zero. Register-mode argument values above 3 are
invalid; they are not masked into a register. Opcodes 28–31 are reserved and fault.
The decoder rejects negative, noninteger, or wider-than-16-bit words.
There are 12,479 valid canonical words.

`decodeInstruction(word)` returns `{ok:true,instruction}` or `{ok:false,error}`.
`encodeInstruction(decoded)` returns the word, throwing `RangeError` for an
invalid instruction. `formatInstruction(decoded)` produces canonical,
reassemblable source with hexadecimal immediates and uppercase mnemonics.
`hex(value,width=2)` returns uppercase digits **without `0x`**; width is a
minimum, bounded to 1–16, not a truncation.

## Complete ISA

`byte` is an immediate or a constant resolving to 0–255. `Rd`, `Rs`, and `Ra`
mean destination, source, and address register. `target` is a literal or symbol
resolving to an absolute program-word address in 0–255. Branch targets need not
be loaded yet; an unloaded target faults at the subsequent fetch.

`—` means flags preserved. Arithmetic wraps modulo 256. The N flag is simply
bit 7, **not** a signed-overflow flag; RELAY has no V flag. Consequently JN after
CMP is not a general signed less-than test when subtraction can overflow.

| Opcode dec / hex | Mnemonic and syntax | Flags | Effect |
| --- | --- | --- | --- |
| 0 / 00 | `NOP` | — | Advance without changing data |
| 1 / 01 | `HALT` | — | Advance once, then halt |
| 2 / 02 | `MOV Rd, byte` or `MOV Rd, Rs` | — | Copy source |
| 3 / 03 | `ADD Rd, byte` or `ADD Rd, Rs` | Z N C | Add; C if unwrapped sum exceeds 255 |
| 4 / 04 | `ADC Rd, byte` or `ADC Rd, Rs` | Z N C | Add source and incoming C |
| 5 / 05 | `SUB Rd, byte` or `SUB Rd, Rs` | Z N C | Subtract; C if old Rd ≥ source |
| 6 / 06 | `CMP Rd, byte` or `CMP Rd, Rs` | Z N C | SUB flags without writing Rd |
| 7 / 07 | `INC Rd` | Z N C | Add one; C only for 255 → 0 |
| 8 / 08 | `DEC Rd` | Z N C | Subtract one; C unless old Rd was zero |
| 9 / 09 | `AND Rd, byte` or `AND Rd, Rs` | Z N; C=0 | Bitwise AND |
| 10 / 0A | `OR Rd, byte` or `OR Rd, Rs` | Z N; C=0 | Bitwise OR |
| 11 / 0B | `XOR Rd, byte` or `XOR Rd, Rs` | Z N; C=0 | Bitwise exclusive OR |
| 12 / 0C | `NOT Rd` | Z N; C=0 | Invert all eight bits |
| 13 / 0D | `SHL Rd` | Z N C | Shift left one; old bit 7 becomes C |
| 14 / 0E | `SHR Rd` | Z N C | Logical right shift one; old bit 0 becomes C |
| 15 / 0F | `LOAD Rd, [address]` or `LOAD Rd, [Ra]` | — | Read RAM |
| 16 / 10 | `STORE [address], Rs` or `STORE [Ra], Rs` | — | Write RAM |
| 17 / 11 | `JMP target` | — | Jump unconditionally |
| 18 / 12 | `JZ target` | — | Jump if Z=1 |
| 19 / 13 | `JNZ target` | — | Jump if Z=0 |
| 20 / 14 | `JC target` | — | Jump if C=1 |
| 21 / 15 | `JNC target` | — | Jump if C=0 |
| 22 / 16 | `JN target` | — | Jump if N=1 |
| 23 / 17 | `JNN target` | — | Jump if N=0 |
| 24 / 18 | `CALL target` | — | Push next PC, then jump |
| 25 / 19 | `RET` | — | Pop full word into PC |
| 26 / 1A | `PUSH Rs` | — | Push zero-extended register byte |
| 27 / 1B | `POP Rd` | — | Pop word; retain its low byte |

Examples of unsigned flag behavior:

* `255 + 1 = 0`: Z=1, N=0, C=1.
* `127 + 1 = 128`: Z=0, N=1, C=0.
* `0 - 1 = 255`: Z=0, N=1, C=0 (borrow).
* `9 - 9 = 0`: Z=1, N=0, C=1 (no borrow).
* `ADC` with left=255, right=0, incoming C=1 yields zero and outgoing C=1.

The public UI documentation should use `isa` (also exported as
`instructionSet`), the metadata table in `isa.ts`, rather than maintain another
opcode list. Each entry has `op`, `code`, `form`, `syntax`, `flags`, and
`description`. `instructionMetadata(op)` performs case-insensitive lookup.

## Assembly language

Source is limited to **32 KiB of UTF-8** and **2048 lines**, and the output to
**256 instruction words**. Blank source is valid and assembles to empty ROM;
attempting to execute it faults. Newlines can be LF, CRLF, or CR. Semicolons
start comments. Instructions, registers, directives, and symbols are
case-insensitive.

Operands are comma-separated. RAM operands require brackets. There are no
implicit addressing modes, arithmetic expressions, macros, strings, negative
literals, floating point numbers, or `eval`.

```asm
; Decimal, hexadecimal, binary
MOV R0, 12
MOV R1, 0x80
MOV R2, 0b10101010

; Same source operation, two encodings
ADD R0, 7
ADD R0, R1

; Direct and register-indirect RAM addressing
STORE [0x40], R0
MOV R3, 0x40
LOAD R2, [R3]
STORE [R3], R1
```

### Labels and constants

Names follow `[A-Za-z_][A-Za-z0-9_]*`. R0–R3 are reserved register names.
Labels use `name:` at the start of a line and name the **next instruction's word
address**, not a RAM address. A label may share a line with an instruction or
directive. There is one label per line. Labels and constants share one namespace;
duplicate names, including duplicates with different case, are errors.

`.equ NAME, value` defines a constant. Values may be unsigned decimal, `0x`
hexadecimal, `0b` binary, or another symbol. Both labels and constants support
forward references. Cyclic definitions are rejected, as are chains requiring
more than 128 nested resolutions. Constants may hold values up to 65535, but a
byte/address operand still must resolve to 0–255. Unused invalid constants are
errors too.

```asm
.equ START_VALUE, later
start:
  MOV R0, START_VALUE
  JMP done
.equ later, 19
done: HALT
```

### Initial RAM data

`.byte address, value, value, ...` initializes consecutive data-RAM bytes.
It consumes **no program words** and does not execute a STORE or consume cycles.
The address and every value can be a forward-resolved symbol. Data must fit
within RAM and each value must fit in one byte. Overlapping initializations are
errors, even if they would write the same value.

```asm
.equ SCREEN, 0xE0
.byte SCREEN, 0b10000001, 0b10000001
.byte 0x40, 42, 7, 201, 18
LOAD R0, [0x40]
HALT
```

For data copied at runtime, put the source image in low **data RAM**, not in
instruction ROM. The framebuffer preset uses RAM `0x20`–`0x3F` as its authored
source image and inverts it into `0xE0`–`0xFF` through actual STORE instructions.

### Assembly API

```ts
assemble(source):
  | { ok: true; program: Program }
  | { ok: false; diagnostics: Diagnostic[] }
```

Diagnostics contain `{line,column,code,message}` with one-based coordinates.
Columns generally identify the statement start; constant-resolution errors may
use column 1. Assembly returns all collected errors, never a partially usable
program.

`Program` contains:

* `source`: unchanged original text.
* `words: number[]`: encoded program ROM.
* `instructions`: entries with `pc`, one-based `line`, comment-free instruction
  `text`, `word`, and decoded `op`, `dst`, `mode`, `arg`.
* `initialRam: number[]`: exactly 256 bytes.
* `symbols: Record<string,number>`: all resolved labels/constants, uppercase keys.

Program and CPU objects returned by these modules should be treated as immutable
values. The modules never mutate their arguments. They do not freeze every
object; callers supplying hand-built programs or CPU states are responsible for
honoring these typed invariants. Untrusted state must go through `importProject`.

## CPU events and diagram integration

`createCpu(program)` constructs the initial CPU.
`cloneCpu(cpu)` clones every mutable CPU array and flag object.
`stepCpu(program,cpu)` returns `{state,event}`.

```ts
interface CpuState {
  registers: [number, number, number, number];
  ram: number[];       // 256 bytes
  stack: number[];     // 0–32 words, bottom to top
  pc: number;
  flags: { z: boolean; n: boolean; c: boolean };
  cycles: number;
  status: 'ready' | 'halted' | 'faulted';
  fault: string | null;
}
```

A `StepEvent` contains:

| Field | Meaning |
| --- | --- |
| `cycle` | Completed CPU cycle number; unchanged for a fault |
| `pc` | Address of the attempted instruction, before execution |
| `line` | One-based source line, or null without a source instruction |
| `instruction` | Canonical decoded instruction, or `FETCH` before successful decoding |
| `kind` | `instruction`, `halt`, or `fault` |
| `op` | Decoded opcode name, or null before successful decoding |
| `transfers` | `{from,to,value}[]` describing actual datapath activity |
| `memory` | `{address,kind:'read'\|'write',before,value}[]` for data RAM |
| `registerWrites` | `{register,before,value}[]`, including same-value writes |
| `alu` | `{operation,left,right,result}`, or null; unary right is null, INC/DEC right is 1 |
| `branchTaken` | True/false for conditional branches, true for JMP/CALL/RET, otherwise null |
| `description` | Short explanation of this completed instruction or fault |

Transfer endpoint names are `R0`–`R3`, `ROM[0xNN]`, `RAM[0xNN]`, `IR`,
`IMMEDIATE`, `ADDRESS`, `ALU`, `FLAGS`, `C`, `ONE`, `STACK`, `PC`, and
`CONTROL`. `FLAGS` transfer values encode `Z=4`, `N=2`, `C=1`. The ADC event's
additional C → ALU transfer reports the incoming carry; `alu.right` remains the
actual source operand. A read memory event has equal `before` and `value`.
Failed atomic attempts have no data transfers, writes, or ALU result.

## Debugger, history, and run control

```ts
interface DebuggerState {
  program: Program;
  cpu: CpuState;
  history: HistoryEntry[];
  trace: StepEvent[];
  breakpoints: number[];
}
```

* `createMachine(program)` starts with no history, trace, or breakpoints.
* `stepMachine(machine)` executes one attempted instruction, **bypassing**
  breakpoints. It records faults as well as successful instructions; terminal
  non-execution creates no history entry.
* `reverseMachine(machine)` restores the previous CPU and the **entire previous
  visible trace**, including trace events that the latest step evicted. It
  restores RAM, registers, flags, stack, PC, cycles, and status/fault. Current
  breakpoints remain unchanged.
* `resetMachine(machine)` restores initial CPU/RAM and clears trace/history,
  retaining the current breakpoints.
* `setBreakpoint(machine,pc,enabled=true)` and `toggleBreakpoint(machine,pc)`
  return a machine with sorted, unique breakpoint word addresses. Invalid,
  fractional, or unloaded addresses throw `RangeError`.

History retains the last **512 attempted instructions**. Each entry stores the
previous CPU, the resulting event, and the previous visible trace. Visible trace
retains **128 events**. Snapshots share immutable event objects rather than
recursively copying them; history never stores a previous machine/history.

After more than 512 attempts, reverse stops at the oldest retained boundary;
it cannot promise to reach reset. At this boundary history is empty, but CPU
cycles and visible trace can be nonzero. Reversing when history is empty is a
no-op. Stepping after a reverse follows a new timeline; there is no hidden redo.

```ts
runBatch(machine, budget, { skipInitialBreakpoint?: boolean } = {}):
  { machine, executed, reason: 'budget' | 'breakpoint' | 'halted' | 'faulted' }
```

Budgets are finite numbers truncated toward zero and clamped to 0–128.
Negative numbers, NaN, and either infinity give a zero budget. An already
terminal machine reports its terminal reason even with zero budget. `executed`
counts successful instructions, not failed attempts.

Breakpoints are checked **before** executing an instruction. Normal Run stops
immediately when already at a breakpoint. An explicit Resume should pass
`skipInitialBreakpoint:true`: it bypasses the breakpoint only for the first
attempt, not later visits to that PC. This prevents getting stuck at a breakpoint
without disabling future stops. Single-step always bypasses breakpoints.
Exhausting a batch reports `budget`; the UI decides whether to schedule another
batch or stop. Breakpoints are only tested when another instruction is about to
execute, so arriving at one on the final budgeted cycle reports `budget` until
the next batch.

## Project files

`exportProject(machine,draftSource=machine.program.source)` returns formatted
JSON. Loaded source and editor draft are distinct: an invalid, unassembled draft
can safely be preserved without replacing the running program.

```json
{
  "format": "relay-project",
  "version": 1,
  "isa": "relay-8-v1",
  "source": "MOV R0, 12\nHALT",
  "draftSource": "MOV R0, 12\nHALT",
  "snapshot": {
    "registers": [0, 0, 0, 0],
    "ram": ["this example abbreviates the required 256 numeric bytes"],
    "stack": [],
    "pc": 0,
    "flags": { "z": false, "n": false, "c": false },
    "cycles": 0,
    "status": "ready",
    "fault": null
  },
  "breakpoints": []
}
```

The illustrative `ram` above is abbreviated and therefore **not importable**;
real exported files contain exactly 256 numbers.

`importProject(text)` returns either `{ok:true,machine,draftSource}` or
`{ok:false,diagnostics}`. It never changes an existing machine: assign its success
result only after validation. Imports:

1. Limit the file to 512 KiB of UTF-8 and parse JSON. Only JSON `SyntaxError` is
   caught; unrelated programming errors are not hidden.
2. Require the known format, version, ISA, and documented top-level fields;
   unknown fields are rejected.
3. Validate loaded source and draft as strings within 32 KiB / 2048 lines.
   Reassemble **loaded source**; reject all its diagnostics. Draft need not
   assemble. Never trust imported instruction arrays.
4. Require exactly four register bytes, 256 RAM bytes, at most 32 stack words,
   a 16-bit PC, and an integer cycle count in 0–1,000,000,000. Reject floats,
   negative values, stringified numbers, null bytes, and out-of-range values.
5. Require exact boolean flag fields and valid status. Ready/halted fault is
   null; a faulted state needs a nonblank message up to 1024 characters. Halted
   states must have at least one completed cycle and PC immediately after an
   actual HALT. Ready PC may be outside loaded ROM, including 256 or 65535,
   because fetch validation happens on the next step.
6. Require unique, valid breakpoint addresses inside the reassembled ROM.
7. Construct fresh state arrays. **Do not import undo history or trace.**

This validates a structurally valid architectural snapshot, not a proof that its
registers/RAM could be reached by replaying its claimed cycle count. That would
require potentially unbounded execution. Only the loaded source is assembled;
an untrusted draft is never executed during import.

Project files have no run/pause state, speed, editor selection, or hidden
automatic storage. Nothing reads or writes `localStorage`. Loading a project does
not start an execution loop.

## Programs included

`presets` exports `{id,title,kicker,description,source,goal,expected}[]`.
`defaultPreset` is the first entry. `relayGlyph` is the authored 32-byte image.

| ID | Program | Verified result |
| --- | --- | --- |
| `framebuffer` | Hello, pixel. | R visible on arrival; CALL/LOAD/XOR/STORE routine inverts every screen byte, then HALT; empty stack |
| `fibonacci` | A sequence, built. | RAM 40–4B = 0,1,1,2,3,5,8,13,21,34,55,89 |
| `bubble-sort` | Put chaos in order. | Eight bytes sorted in RAM 40–47 = 3,7,12,18,42,64,99,201 |
| `binary-counter` | Time is a loop. | Endless counter writes value/inverse row pairs, delays using DEC/JNZ, wraps 255→0 |
| `first-steps` | Five small steps. | R0=19, R1=7, RAM[40]=19, PC=5, cycles=5, halted |

The default machine must not auto-run: its initial graphic comes from `.byte`.
The counter's “delay” consumes actual instructions; wall-clock speed is a UI
choice. `guideSteps` describes the five single-step transitions of
`first-steps`, with `{pc,title,description,expected}`.

## Validation and extension

The model tests live in `tests/projects/relay.spec.ts` and use Playwright's test
runner without browser fixtures. They cover all canonical 16-bit words,
exhaustive ADD/ADC/SUB/CMP byte pairs, all unary byte inputs, representative
bitwise inputs, source diagnostics, every opcode, factual trace events, atomic
faults, deferred fetch, stack word behavior, deterministic snapshots, reverse
boundaries, framebuffer mapping, run budgets/breakpoints, hostile imports, and
all executable presets.

The same spec also runs the real page against the existing Vite server: native
source editing, assembly failures and injection-shaped input, actual ALU/RAM/video
effects, forward and reverse stepping, halt/fault recovery, breakpoints and resume,
bounded runaway, the guide, file downloads and validated imports, keyboard scope,
mobile panes, reduced motion, and responsive layouts from 320 to 1440 pixels.
Workspace workflows assert document, body, and root scroll dimensions at
1440×900, 1280×720, 375×812, 320×640, and 768×480. They exercise source input,
video RAM, reverse, trace, and all resource dialogs without forced clicks.
Screenshot cases capture both the initial machine and an executed STORE, plus
mobile computer and screen views. Test artifacts belong to the runner's output
directory, not this project.

```sh
SITE_URL=http://127.0.0.1:4173/ npm test -- tests/projects/relay.spec.ts --reporter=dot
```

### Workbench surfaces

| Module | Responsibility |
| --- | --- |
| `isa.ts` | Version, limits, canonical encoding/decoding, public ISA metadata |
| `assembler.ts` | Two-pass source assembly, constants, labels, data, diagnostics |
| `cpu.ts` | Instruction execution, flags, event transfers, video bit mapping |
| `machine.ts` | Bounded history/trace, breakpoints, batches, project validation |
| `presets.ts` | Five complete authored programs and the guided trace |
| `diagram.ts` | Execution-driven SVG wiring and a readable compact mobile schematic |
| `ui.ts` | Accessible workbench structure, native textarea, inspectors, dialogs |
| `content.ts` | Program library and the public architecture/ISA field manual |
| `index.ts` | Mount/destroy, event routing, native editor synchronization, clock, file I/O |
| `style.css` | Namespaced physical-instrument layout and mobile panes |

The machine is paused on arrival. The screen's letter R is initialized by `.byte`,
not by executing hidden setup cycles. On the default program, Step 1 is CALL
(stack top `0001`), Step 6 is XOR (`R3=FF`, `N=1`), and Step 7 is the first STORE:
RAM `E0` changes from `00` to `FF`, lighting the first eight pixels. Back restores
the byte and the screen. The diagram and execution trace describe the **last**
instruction; PC and the decoded footer identify the **next** instruction. They
are deliberately not the same after a branch.

Use `#relay-source` to edit, `[data-relay-action="assemble"]` to load,
`[data-relay-action="step"|"run"|"reverse"|"reset"]` for transport (each value is a
separate selector), `[data-relay-register="0"]` for R0,
`[data-relay-byte="224"]` for screen byte E0 when that bank is visible, and
`[data-relay-screen]` for the actual framebuffer. ROM and source-gutter buttons
have explicit "Set/Remove breakpoint" accessible names. Source-gutter breakpoints
are disabled for a dirty draft; ROM breakpoints still address the loaded program.

The root declares `data-workspace="true"` and occupies one viewport with no
document scrolling or body overflow masking. At widths of 1000 pixels and above,
Source and Computer remain alongside a bounded inspector with Screen, Memory,
Trace, and Guide tabs. Editors, diagnostics, schematics on short screens, and
inspector content own their scrolling; transport, clock, cycles, and the status
console stay visible. Programs, Manual, and Files open native, bounded dialogs.
Selecting a program closes its library before asking to replace unsaved work.
These layout changes do not remount or reset the model.

The bottom guide launch and guided actions leave local right-hand clearance for
the floating menu. Memory and trace inspectors retain bottom scroll clearance;
there is no additional blank footer.

Below 1000 pixels, `[data-relay-pane="machine"|"source"|"output"|"memory"|"trace"|"guide"]`
buttons directly select each pane. Inactive panes are inert, and arrow keys,
Home, and End navigate the pane tabs. The phone Computer pane uses a readable
live compact schematic; short landscape layouts place registers beside the
diagram. The machine pane alone owns ArrowRight (step),
ArrowLeft (back), and Space (run/pause); typing and navigation in form controls
are never intercepted. The memory inspector's tab list supports arrows and
Home/End. Run is optional even with reduced motion; highlights are held states,
not interpolated or pulsing decoration.

The clock uses the collection's `createLoop`, starts paused, and stops when the
document is hidden or `setPaused(true)` is called. It does not automatically
resume. Destroy aborts UI listeners, cancels the RAF loop, closes all dialogs,
and invalidates pending file reads. File-import errors leave the current
CPU and draft intact. If the user edits or advances the machine during a file
read, the import is explicitly cancelled instead of overwriting newer work.

### Extending the architecture

Adding an opcode requires coordinated changes to metadata, operand
validation/encoding, assembler forms if needed, CPU decoding/execution, event
semantics, tests, and this ISA reference. Do not implement a UI-only instruction.
Changing an existing encoding or architectural behavior requires a new ISA
identifier and an explicit project migration/version strategy. Keep pure
computation separate from rendering and scheduling, preserve bounded workloads,
and test import rejection as well as success.
