import { escapeMarkup } from '../../core/markup';
import { isa } from './isa';
import { presets } from './presets';

export function programLibrary(): string {
  return `<section class="relay-library" id="relay-programs" aria-labelledby="relay-programs-title">
    <div class="relay-section-title"><div><p class="relay-eyebrow">02 / PROGRAM LIBRARY</p><h2 id="relay-programs-title">Small programs. Real ideas.</h2></div><p>Not demonstrations on rails.<br>Open the source. Change the outcome.</p></div>
    <div class="relay-program-grid">${presets.slice(0, 4).map((preset, index) => `
      <article class="relay-program">
        <div class="relay-program-mark" aria-hidden="true">${[
          '<span class="relay-mini-pixels">▗▟▙<br>▐▛▜<br>▐ ▜</span>',
          '<span class="relay-number-art">1<span>1</span>2<span>3</span>5</span>',
          '<span class="relay-sort-art"><i></i><i></i><i></i><i></i><i></i><i></i></span>',
          '<span class="relay-counter-art">0<span>1</span><br><span>1</span>0</span>',
        ][index]}</div>
        <p class="relay-eyebrow">${escapeMarkup(preset.kicker)}</p>
        <h3>${escapeMarkup(preset.title)}</h3><p>${escapeMarkup(preset.description)}</p>
        <button type="button" class="relay-text-button" data-relay-load="${preset.id}">Open program <span aria-hidden="true">↗</span></button>
      </article>`).join('')}
    </div>
  </section>`;
}

export function fieldManual(): string {
  return `<section class="relay-manual" id="relay-manual" aria-labelledby="relay-manual-title">
    <div class="relay-section-title"><div><p class="relay-eyebrow">03 / THE FIELD MANUAL</p><h2 id="relay-manual-title">Nothing behind the curtain.</h2></div><p>A small architecture you can hold in your head.<br>A complete instruction set you can put to work.</p></div>
    <div class="relay-manual-intro">
      <article><h3>One honest machine.</h3><p>Four 8-bit registers. 256 bytes of data RAM. A separate program store of up to 256 encoded 16-bit words. Every instruction takes one cycle. The 16-bit program counter (PC) addresses words, not bytes.</p><p>Arithmetic wraps modulo 256. Z means zero; N is bit 7, not signed overflow. C means overflow on addition, <strong>no borrow</strong> on subtraction, or the outgoing bit on shifts.</p></article>
      <article><h3>Memory becomes light.</h3><p>The screen is not another device model: it is RAM. Addresses <code>0xE0–0xFF</code> contain 32 bytes, two per row. Bit 7 is the leftmost pixel of each byte. A <code>STORE</code> changes the screen immediately.</p><p>The 32-word stack is separate from RAM. <code>CALL</code> pushes the next PC; <code>RET</code> pops it. <code>PUSH</code> stores a byte as a word; <code>POP</code> keeps its low byte. Stack overflow and underflow fault atomically.</p></article>
      <article><h3>Write. Assemble. Observe.</h3><p>Write decimal, hex (<code>0xFF</code>), or binary (<code>0b1010</code>) bytes. Use <code>; comments</code>, <code>loop:</code> labels, <code>.equ NAME, value</code> constants, and <code>.byte address, value, …</code> for initial RAM. Symbols are case-insensitive.</p><p>Edits are a draft until assembled. Failed assembly never replaces the loaded machine. Reset restores initial RAM. Save project keeps the loaded source, draft, CPU, and breakpoints; importing starts a fresh undo history.</p></article>
    </div>
    <details class="relay-isa" open>
      <summary><span>Instruction set</span><span>28 operations / RELAY-8 v1</span></summary>
      <p class="relay-manual-note"><code>Rd</code> is the destination, <code>Rs</code> a source, and <code>Ra</code> an address register (R0–R3). A target is an absolute word address or label. A dash means flags are preserved.</p>
      <div class="relay-isa-scroll"><table><thead><tr><th>Instruction</th><th>Flags</th><th>What actually happens</th></tr></thead><tbody>
        ${isa.map((entry) => `<tr><td><code>${escapeMarkup(entry.syntax)}</code></td><td>${escapeMarkup(entry.flags)}</td><td>${escapeMarkup(entry.description)}</td></tr>`).join('')}
      </tbody></table></div>
    </details>
    <details class="relay-isa"><summary><span>Encoding &amp; operating limits</span><span>Under the lid</span></summary>
      <div class="relay-limits">
        <div><h3>A word, taken apart.</h3><div class="relay-encoding"><span>OPCODE<b>5 bits</b></span><span>REG<b>2 bits</b></span><span>MODE<b>1 bit</b></span><span>OPERAND<b>8 bits</b></span></div><p>Bits 15–11 select the operation, 10–9 the register, bit 8 the addressing mode, and 7–0 the operand. Mode 0 is a literal; mode 1 selects R0–R3. STORE uses the register field as its data source. Unused bits must be zero. The CPU decodes these exact words on every fetch.</p></div>
        <div><h3>Safe to get lost.</h3><p>Run executes at most 128 instructions per browser frame. Clock speed is a target rate; slow frames may execute fewer instructions. History retains the last 512 steps; trace retains 128. PC outside loaded ROM, invalid encodings, exhausted stack, or one billion cycles produce a visible fault. HALT advances PC and stops. Reverse can undo either a halt or a fault.</p><p>Source is limited to 32 KiB and 2,048 lines; project JSON to 512 KiB. Imports validate the ISA, version, source, arrays, and ranges before replacing anything. Execution is opt-in, pauses when the page is hidden, and never resumes on its own. No network. No eval. No background clock.</p></div>
      </div>
    </details>
  </section>`;
}
