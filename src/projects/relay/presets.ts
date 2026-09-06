export interface Preset {
  id: string;
  title: string;
  kicker: string;
  description: string;
  source: string;
  goal: string;
  expected: string;
}

export const relayGlyph = [
  0x00, 0x00, 0x3f, 0xe0, 0x30, 0x30, 0x30, 0x18,
  0x30, 0x18, 0x30, 0x30, 0x3f, 0xe0, 0x3f, 0x80,
  0x31, 0x80, 0x30, 0xc0, 0x30, 0x60, 0x30, 0x30,
  0x30, 0x18, 0x30, 0x0c, 0x30, 0x06, 0x00, 0x00,
];

export const presets: Preset[] = [
  {
    id: 'framebuffer',
    title: 'Hello, pixel.',
    kicker: '01 / MEMORY → LIGHT',
    description: 'A letter R is already in video RAM. Call a drawing routine to invert every byte, one real store at a time.',
    goal: 'Follow the source pointer, destination pointer, and 32-byte countdown through a subroutine.',
    expected: 'All 32 framebuffer bytes become the bitwise inverse of the initial R. R0=0x40, R1=0, R2=0; the stack is empty.',
    source: `; RELAY / Hello, pixel.
; Invert a letter, one byte at a time.
.equ PICTURE, 0x20
.equ SCREEN, 0xE0

  CALL draw
  HALT

draw:
  MOV R0, PICTURE
  MOV R1, SCREEN
  MOV R2, 32
pixel:
  LOAD R3, [R0]
  XOR R3, 0xFF
  STORE [R1], R3
  INC R0
  INC R1
  DEC R2
  JNZ pixel
  RET

; Initial picture and video RAM.
; Two bytes per row; bit 7 is leftmost.
.byte PICTURE, 0x00,0x00,0x3F,0xE0,0x30,0x30,0x30,0x18
.byte 0x28, 0x30,0x18,0x30,0x30,0x3F,0xE0,0x3F,0x80
.byte 0x30, 0x31,0x80,0x30,0xC0,0x30,0x60,0x30,0x30
.byte 0x38, 0x30,0x18,0x30,0x0C,0x30,0x06,0x00,0x00
.byte SCREEN, 0x00,0x00,0x3F,0xE0,0x30,0x30,0x30,0x18
.byte 0xE8, 0x30,0x18,0x30,0x30,0x3F,0xE0,0x3F,0x80
.byte 0xF0, 0x31,0x80,0x30,0xC0,0x30,0x60,0x30,0x30
.byte 0xF8, 0x30,0x18,0x30,0x0C,0x30,0x06,0x00,0x00`,
  },
  {
    id: 'fibonacci',
    title: 'A sequence, built.',
    kicker: '02 / ADD → REPEAT',
    description: 'Generate the first twelve Fibonacci numbers and leave each result in a consecutive RAM cell.',
    goal: 'Watch a pair of registers trade roles while the pointer walks from RAM 0x40 to 0x4B.',
    expected: 'RAM 0x40–0x4B: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89. Arithmetic is modulo 256.',
    source: `; RELAY / Fibonacci
; R0 = current, R1 = next, R2 = destination.
  MOV R0, 0
  MOV R1, 1
  MOV R2, 0x40
next:
  STORE [R2], R0
  MOV R3, R0
  ADD R3, R1
  MOV R0, R1
  MOV R1, R3
  INC R2
  CMP R2, 0x4C
  JNZ next
  HALT`,
  },
  {
    id: 'bubble-sort',
    title: 'Put chaos in order.',
    kicker: '03 / COMPARE → SWAP',
    description: 'Sort eight authored bytes in place, using no-borrow carry to decide whether adjacent values need swapping.',
    goal: 'Follow seven bubble-sort passes and inspect each actual RAM write.',
    expected: 'RAM 0x40–0x47: 3, 7, 12, 18, 42, 64, 99, 201. The program halts after seven shrinking passes.',
    source: `; RELAY / Bubble sort
.byte 0x40, 42,7,201,18,3,99,64,12
; R3 is the last address compared in this pass.
  MOV R3, 0x47
pass:
  MOV R0, 0x40
pair:
  LOAD R1, [R0]
  INC R0
  LOAD R2, [R0]
  CMP R2, R1
  JC ordered
  STORE [R0], R1
  DEC R0
  STORE [R0], R2
  INC R0
ordered:
  CMP R0, R3
  JNZ pair
  DEC R3
  CMP R3, 0x40
  JNZ pass
  HALT`,
  },
  {
    id: 'binary-counter',
    title: 'Time is a loop.',
    kicker: '04 / COUNT → GLOW',
    description: 'An endless binary counter draws complementary rows, then spends real instruction cycles in a delay loop.',
    goal: 'Place a breakpoint on count, run a bounded batch, and resume past it. Pause is owned by the workbench, not the CPU.',
    expected: 'Every count writes R0 and its inverse to all sixteen rows. The counter wraps 255→0 and never halts.',
    source: `; RELAY / Binary counter
  MOV R0, 0
count:
  MOV R1, 0xE0
  MOV R3, R0
  NOT R3
row:
  STORE [R1], R0
  INC R1
  STORE [R1], R3
  INC R1
  JNZ row
  MOV R2, 32
delay:
  DEC R2
  JNZ delay
  INC R0
  JMP count`,
  },
  {
    id: 'first-steps',
    title: 'Five small steps.',
    kicker: 'START HERE / A GUIDED TRACE',
    description: 'Load two values, add them, store the result, and stop. A complete computer program in five words.',
    goal: 'Single-step the whole program and reverse the STORE to see memory restored.',
    expected: 'R0=19, R1=7, RAM[0x40]=19, PC=5, cycles=5, halted. Z=N=C=false.',
    source: `; RELAY / Five small steps
  MOV R0, 12
  MOV R1, 7
  ADD R0, R1
  STORE [0x40], R0
  HALT`,
  },
];

export const defaultPreset = presets[0];

export interface GuideStep {
  pc: number;
  title: string;
  description: string;
  expected: string;
}

export const guideSteps: GuideStep[] = [
  { pc: 0, title: 'Load an idea', description: 'MOV copies the immediate byte 12 into register R0.', expected: 'R0=12, PC=1, cycles=1. Flags stay clear.' },
  { pc: 1, title: 'Give it a partner', description: 'MOV copies 7 into R1. R0 retains its value.', expected: 'R0=12, R1=7, PC=2, cycles=2.' },
  { pc: 2, title: 'Meet the ALU', description: 'ADD routes both registers through the arithmetic unit and writes the sum into R0.', expected: 'R0=19, R1=7, Z=N=C=false, PC=3.' },
  { pc: 3, title: 'Leave a memory', description: 'STORE copies R0 into RAM address 0x40 without changing registers or flags.', expected: 'RAM[0x40]=19, PC=4. Reverse restores that RAM byte to 0.' },
  { pc: 4, title: 'Come to rest', description: 'HALT advances the PC once, then stops execution. Reverse makes it ready again.', expected: 'Status=halted, PC=5, cycles=5.' },
];
