import { escapeMarkup } from '../../core/markup';
import type { CpuState, StepEvent } from './cpu';
import type { Program } from './assembler';
import { hex } from './isa';

export function schematic(program: Program, cpu: CpuState, event: StepEvent | undefined): string {
  const transfers = event?.transfers ?? [];
  const active = (part: string) => transfers.some((transfer) => transfer.from.startsWith(part) || transfer.to.startsWith(part));
  const registerActive = transfers.some((transfer) => /^R[0-3]$/.test(transfer.from) || /^R[0-3]$/.test(transfer.to));
  const stackControl = transfers.some((transfer) => (transfer.from === 'PC' && transfer.to === 'STACK') || (transfer.from === 'STACK' && transfer.to === 'PC'));
  const stackData = transfers.some((transfer) => (transfer.from === 'STACK' && /^R[0-3]$/.test(transfer.to)) || (transfer.to === 'STACK' && /^R[0-3]$/.test(transfer.from)));
  const wire = (path: string, lit: boolean) => `<path d="${path}" class="relay-wire${lit ? ' relay-wire-active' : ''}"/>`;
  const node = (name: string, label: string, value: string, x: number, y: number, lit: boolean, detail: string) => `
    <g class="relay-node${lit ? ' relay-node-active' : ''}">
      <rect x="${x}" y="${y}" width="144" height="78" rx="2"/>
      <text x="${x + 13}" y="${y + 23}" class="relay-svg-label">${label}</text>
      <text x="${x + 13}" y="${y + 52}" class="relay-svg-value">${escapeMarkup(value)}</text>
      <text x="${x + 13}" y="${y + 70}" class="relay-svg-detail">${detail}</text>
      <title>${name}</title>
    </g>`;
  const word = program.words[event?.pc ?? cpu.pc];
  const access = event?.memory[0];
  const alu = event?.alu;
  const description = event
    ? event.transfers.map((transfer) => `${transfer.from} to ${transfer.to}: ${transfer.value}`).join('; ') || event.description
    : 'The computer is ready. Step to fetch the first instruction from program ROM.';
  return `<svg class="relay-schematic" viewBox="0 0 600 332" role="img" aria-label="Computer data path. ${escapeMarkup(description)}">
    <defs>
      <pattern id="relay-dot-grid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#c7c5bc"/></pattern>
    </defs>
    <rect width="600" height="332" fill="url(#relay-dot-grid)"/>
    <g fill="none">
      ${wire('M300 94 V119 H100 V40 H156', active('PC'))}
      ${wire('M428 56 H372', stackControl)}
      ${wire('M572 56 H585 V291 H500', stackData)}
      ${wire('M100 94 V170', active('ROM'))}
      ${wire('M100 248 V291 H500 V248', active('RAM') || registerActive)}
      ${wire('M300 253 V291', active('ALU'))}
      ${wire('M500 170 V137 H199 V209 H172', active('ADDRESS'))}
      ${wire('M172 209 H229', !!event?.alu && event.alu.right !== null)}
      ${wire('M300 291 V320', registerActive)}
      ${wire('M347 234 V270 H380', active('FLAGS'))}
    </g>
    <g class="relay-junctions">
      <circle cx="100" cy="119" r="3"/><circle cx="300" cy="137" r="3"/>
      <circle cx="300" cy="291" r="4"/><circle cx="500" cy="291" r="3"/><circle cx="100" cy="291" r="3"/>
    </g>
    <text x="142" y="135" class="relay-svg-detail">16-BIT ADDRESS</text>
    <text x="340" y="312" class="relay-svg-detail">8-BIT DATA BUS</text>
    ${node('Program memory', 'PROGRAM ROM', word === undefined ? '----' : hex(word, 4), 28, 16, active('ROM'), `${program.words.length} / 256 WORDS`)}
    ${node('Program counter', 'PC / NEXT WORD', hex(cpu.pc, 4), 228, 16, active('PC'), '16-BIT POINTER')}
    ${node('Shared word stack', 'STACK / SP', `${String(cpu.stack.length).padStart(2, '0')} / 32`, 428, 16, active('STACK'), cpu.stack.length ? `TOP ${hex(cpu.stack[cpu.stack.length - 1], 4)}` : 'EMPTY')}
    ${node('Instruction register; last fetched word', 'IR / DECODE', event?.op ?? 'READY', 28, 170, active('IR'), event ? `FROM ${hex(event.pc, 4)}` : 'AWAITING FETCH')}
    ${node('Data memory; most recent accessed byte', access ? `RAM / ${access.kind.toUpperCase()}` : 'DATA RAM', access ? `${hex(access.address)} : ${hex(access.value)}` : '256 B', 428, 170, active('RAM'), access ? `BYTE ${access.value} / DECIMAL` : '256 × 8 BITS')}
    <g class="relay-alu${alu ? ' relay-alu-active' : ''}">
      <path d="M224 170 H277 L300 193 L323 170 H376 L347 253 H253 Z"/>
      <text x="300" y="217" text-anchor="middle" class="relay-svg-label">${alu?.operation ?? 'ALU'}</text>
      <text x="300" y="241" text-anchor="middle" class="relay-svg-value">${alu ? hex(alu.result) : '—'}</text>
    </g>
    <text x="299" y="162" text-anchor="middle" class="relay-svg-detail">${alu ? `${alu.left}${alu.right === null ? '' : ` / ${alu.right}`} →` : 'ARITHMETIC + LOGIC'}</text>
    <text x="386" y="274" class="relay-svg-label">Z${Number(cpu.flags.z)} N${Number(cpu.flags.n)} C${Number(cpu.flags.c)}</text>
    <text x="280" y="327" text-anchor="end" class="relay-svg-detail">REGISTER FILE</text>
  </svg>
  <div class="relay-compact-schematic" role="img" aria-label="Computer data path. ${escapeMarkup(description)}">
    <div class="relay-compact-node${active('PC') ? ' relay-compact-active' : ''}"><span>PC / next word</span><b>${hex(cpu.pc, 4)}</b></div>
    <div class="relay-compact-node${active('ROM') ? ' relay-compact-active' : ''}"><span>Program ROM</span><b>${word === undefined ? '----' : hex(word, 4)}</b></div>
    <div class="relay-compact-bus"><span>↓ FETCH / DECODE ↓</span></div>
    <div class="relay-compact-node${active('STACK') ? ' relay-compact-active' : ''}"><span>Stack / SP</span><b>${cpu.stack.length} <small>/ 32</small></b></div>
    <div class="relay-compact-node${active('RAM') ? ' relay-compact-active' : ''}"><span>${access ? `RAM / ${access.kind}` : 'Data RAM'}</span><b>${access ? `${hex(access.address)} : ${hex(access.value)}` : '256 B'}</b></div>
    <div class="relay-compact-alu${alu ? ' relay-compact-active' : ''}"><span>${alu ? `${alu.operation} / ${alu.left}${alu.right === null ? '' : `, ${alu.right}`}` : 'ARITHMETIC + LOGIC'}</span><b>${alu ? `${hex(alu.result)} / ${alu.result} dec` : 'ALU'}</b></div>
    <div class="relay-compact-bus"><span>↓ 8-BIT REGISTER BUS ↓</span></div>
  </div>`;
}

export function pixelGrid(ram: readonly number[], accessedAddress: number | undefined): string {
  return Array.from({ length: 256 }, (_, index) => {
    const address = 0xe0 + (index >>> 3);
    const on = (ram[address] >>> (7 - (index & 7))) & 1;
    return `<i class="relay-pixel${on ? ' relay-pixel-on' : ''}${address === accessedAddress ? ' relay-pixel-access' : ''}" aria-hidden="true"></i>`;
  }).join('');
}
