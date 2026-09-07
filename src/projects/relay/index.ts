import './style.css';
import { createLoop } from '../../core/loop';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { assemble } from './assembler';
import type { Diagnostic } from './assembler';
import { decodeInstruction, formatInstruction, hex, MAX_SOURCE_BYTES, MAX_SOURCE_LINES, sourceByteLength } from './isa';
import {
  createMachine, exportProject, HISTORY_LIMIT, importProject, MAX_PROJECT_BYTES,
  resetMachine, reverseMachine, runBatch, RUN_BATCH_LIMIT, stepMachine, toggleBreakpoint,
} from './machine';
import { defaultPreset, guideSteps, presets } from './presets';
import type { Preset } from './presets';
import { pixelGrid, schematic } from './diagram';
import { workbenchMarkup } from './ui';

type MemorySpace = 'ram' | 'rom' | 'stack';
type Pane = 'source' | 'machine' | 'output' | 'memory' | 'trace' | 'guide';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'relay');
  const opening = assemble(defaultPreset.source);
  if (!opening.ok) throw new Error(`RELAY's opening program is invalid: ${opening.diagnostics[0].message}`);
  let machine = createMachine(opening.program);
  let selectedPreset: Preset | undefined = defaultPreset;
  let running = false;
  let speed = 8;
  let accumulated = 0;
  let skipInitialBreakpoint = false;
  let stoppedAtBreakpoint: number | null = null;
  let memorySpace: MemorySpace = 'ram';
  let memoryBank = 192;
  let selectedByte: number | null = null;
  let guided = false;
  let pendingPreset: Preset | undefined;
  let lastRenderedMemoryEvent: object | undefined;
  let importRevision = 0;
  let savedRevision = 0;
  let workRevision = 0;

  page.root.innerHTML = workbenchMarkup();
  const root = page.root;
  root.dataset.workspace = 'true';
  const get = <T extends Element>(selector: string) => query<T>(root, selector);
  const source = get<HTMLTextAreaElement>('#relay-source');
  const gutter = get<HTMLElement>('[data-relay-gutter]');
  const currentLine = get<HTMLElement>('[data-relay-current-line]');
  const runButton = get<HTMLButtonElement>('[data-relay-action="run"]');
  const stepButton = get<HTMLButtonElement>('[data-relay-action="step"]');
  const reverseButton = get<HTMLButtonElement>('[data-relay-action="reverse"]');
  const diagnostics = get<HTMLElement>('[data-relay-diagnostics]');
  const memorySelect = get<HTMLSelectElement>('#relay-memory-page');
  const follow = get<HTMLInputElement>('[data-relay-follow]');
  const fileInput = get<HTMLInputElement>('[data-relay-file]');
  const dialog = get<HTMLDialogElement>('.relay-replace-dialog');
  const message = get<HTMLElement>('[data-relay-message]');
  const text = (selector: string, value: string) => { get<HTMLElement>(selector).textContent = value; };
  const dirty = () => source.value !== machine.program.source;
  const announce = (value: string) => { message.textContent = value; };
  const lastEvent = () => machine.trace[machine.trace.length - 1];
  source.value = defaultPreset.source;

  const inspectorPanes = ['output', 'memory', 'trace', 'guide'] as const;
  const inspectorTabs = createWorkspaceTabs(page, {
    id: 'relay-tools',
    label: 'Machine inspectors',
    host: get<HTMLElement>('[data-relay-inspector-tabs]'),
    panes: inspectorPanes.map(id => ({
      id, label: id === 'output' ? 'Screen' : id[0].toUpperCase() + id.slice(1),
      panel: get<HTMLElement>(`[data-relay-panel="${id}"]`),
    })),
  });
  const resources = {
    programs: createWorkspaceDialog(page, {
      id: 'relay-programs-dialog', title: 'Program library',
      content: [get<HTMLElement>('.relay-library')],
      triggers: [get<HTMLElement>('[data-relay-resource="programs"]')],
    }),
    manual: createWorkspaceDialog(page, {
      id: 'relay-manual-dialog', title: 'Field manual',
      content: [get<HTMLElement>('.relay-manual')],
      triggers: [get<HTMLElement>('[data-relay-resource="manual"]')],
    }),
    files: createWorkspaceDialog(page, {
      id: 'relay-files-dialog', title: 'Project files',
      content: [get<HTMLElement>('.relay-workbench-footer')],
      triggers: [get<HTMLElement>('[data-relay-resource="files"]')],
    }),
  };
  const compact = window.matchMedia('(max-width: 999px)');
  let activePane: Pane = 'machine';
  const paneButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-relay-pane]')];
  for (const button of paneButtons) {
    const pane = button.dataset.relayPane as Pane;
    button.id = `relay-pane-tab-${pane}`;
    button.setAttribute('role', 'tab');
    const panel = pane === 'source' ? get<HTMLElement>('.relay-source-pane') :
      pane === 'machine' ? get<HTMLElement>('.relay-machine-pane') :
        get<HTMLElement>(`[data-relay-panel="${pane}"]`);
    panel.id ||= `relay-pane-${pane}`;
    button.setAttribute('aria-controls', panel.id);
  }

  function setPane(pane: Pane): void {
    const focused = document.activeElement;
    activePane = pane;
    const isTool = pane !== 'source' && pane !== 'machine';
    if (isTool) inspectorTabs.select(pane);
    get<HTMLElement>('.relay-main-grid').dataset.relayActivePane = isTool ? 'output' : pane;
    paneButtons.forEach((button) => {
      const selected = button.dataset.relayPane === pane;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    for (const [selector, active] of [
      ['.relay-source-pane', pane === 'source'],
      ['.relay-machine-pane', pane === 'machine'],
      ['.relay-tools-pane', isTool],
    ] as const) {
      get<HTMLElement>(selector).inert = compact.matches && !active;
    }
    if (compact.matches && focused instanceof HTMLElement && focused.closest('[inert]')) {
      paneButtons.find(button => button.dataset.relayPane === pane)?.focus({ preventScroll: true });
    }
  }
  compact.addEventListener('change', () => { setPane(activePane); syncSourceScroll(); }, { signal: page.signal });
  get<HTMLElement>('.relay-mobile-tabs').addEventListener('keydown', event => {
    const index = paneButtons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? (index + 1) % paneButtons.length :
      event.key === 'ArrowLeft' ? (index + paneButtons.length - 1) % paneButtons.length :
        event.key === 'Home' ? 0 : event.key === 'End' ? paneButtons.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setPane(paneButtons[next].dataset.relayPane as Pane);
    paneButtons[next].focus({ preventScroll: true });
  }, { signal: page.signal });
  setPane(activePane);

  function syncSourceScroll(): void {
    gutter.scrollTop = source.scrollTop;
    const instruction = machine.program.instructions[machine.cpu.pc];
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight);
    const top = instruction ? 16 + (instruction.line - 1) * lineHeight - source.scrollTop : -lineHeight;
    currentLine.style.top = `${top}px`;
    currentLine.style.height = `${lineHeight}px`;
    currentLine.hidden = dirty() || machine.cpu.status !== 'ready' || top < 0 || top > source.clientHeight;
  }

  function renderGutter(): void {
    const sourceLines = source.value.split(/\r\n|\n|\r/);
    const mapped = new Map(machine.program.instructions.map((instruction) => [instruction.line, instruction]));
    const isDirty = dirty();
    gutter.innerHTML = sourceLines.map((_, index) => {
      const line = index + 1;
      const instruction = isDirty ? undefined : mapped.get(line);
      if (!instruction) return `<span>${line}</span>`;
      const enabled = machine.breakpoints.includes(instruction.pc);
      return `<button type="button" data-relay-breakpoint="${instruction.pc}" class="${machine.cpu.pc === instruction.pc && machine.cpu.status === 'ready' ? 'relay-line-current' : ''}${enabled ? ' relay-line-break' : ''}" aria-label="${enabled ? 'Remove' : 'Set'} breakpoint at line ${line}" aria-pressed="${enabled}">${line}</button>`;
    }).join('');
    syncSourceScroll();
  }

  function revealCurrentSource(): void {
    if (dirty() || source.clientHeight === 0) return;
    const instruction = machine.program.instructions[machine.cpu.pc];
    if (!instruction) return;
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight);
    const top = 16 + (instruction.line - 1) * lineHeight;
    if (top < source.scrollTop + lineHeight || top > source.scrollTop + source.clientHeight - lineHeight * 2) {
      source.scrollTop = Math.max(0, top - lineHeight * 4);
    }
    syncSourceScroll();
  }

  function showDiagnostics(items: readonly Diagnostic[], prefix = 'Assembly failed'): void {
    diagnostics.hidden = false;
    diagnostics.innerHTML = `<strong>${escapeMarkup(prefix)}. Loaded machine preserved.</strong>${items.slice(0, 20).map((item) => prefix === 'Assembly failed'
      ? `<button type="button" data-relay-error-line="${item.line}">Line ${item.line}:${item.column} — ${escapeMarkup(item.message)}</button>`
      : `<p>${item.code.startsWith('PROJECT_') ? '' : `Imported source line ${item.line}: `}${escapeMarkup(item.message)}</p>`).join('')}${items.length > 20 ? `<p>${items.length - 20} more diagnostics. Fix these first, then try again.</p>` : ''}`;
    announce(`${prefix}: ${items.length} diagnostic${items.length === 1 ? '' : 's'}. Your loaded machine has not changed.`);
    setPane('source');
  }

  function pause(reason?: string): void {
    running = false;
    accumulated = 0;
    loop.setPaused(true);
    if (reason) announce(reason);
  }

  function renderMemory(): void {
    const inspector = get<HTMLElement>('[data-relay-inspector]');
    const event = lastEvent();
    const access = event?.memory[0];
    if (event !== lastRenderedMemoryEvent && access && follow.checked) {
      memoryBank = Math.floor(access.address / 64) * 64;
      memorySelect.value = String(memoryBank);
    }
    lastRenderedMemoryEvent = event;
    get<HTMLElement>('[data-relay-memory-controls]').hidden = memorySpace !== 'ram';
    inspector.setAttribute('aria-labelledby', `relay-tab-${memorySpace}`);
    root.querySelectorAll<HTMLButtonElement>('[data-relay-memory]').forEach((button) => {
      const selected = button.dataset.relayMemory === memorySpace;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (memorySpace === 'ram') {
      text('[data-relay-memory-size]', '256 BYTES');
      inspector.innerHTML = `<div class="relay-ram-grid"><span class="relay-ram-axis">HEX</span>${Array.from({ length: 8 }, (_, i) => `<span class="relay-ram-axis">+${i}</span>`).join('')}${Array.from({ length: 8 }, (_, row) => {
        const start = memoryBank + row * 8;
        return `<span class="relay-ram-axis">${hex(start)}</span>${Array.from({ length: 8 }, (_, offset) => {
          const address = start + offset;
          const value = machine.cpu.ram[address];
          return `<button type="button" data-relay-byte="${address}" class="relay-byte${address >= 0xe0 ? ' relay-byte-video' : ''}${access?.address === address ? ` relay-byte-${access.kind}` : ''}${selectedByte === address ? ' relay-byte-selected' : ''}" aria-label="RAM ${hex(address)}: ${value}, hex ${hex(value)}${address >= 0xe0 ? ', framebuffer' : ''}" aria-pressed="${selectedByte === address}">${hex(value)}</button>`;
        }).join('')}`;
      }).join('')}</div>`;
      text('[data-relay-memory-note]', selectedByte === null
        ? 'Select a byte for decimal and binary. Vermilion marks the last access.'
        : `RAM[0x${hex(selectedByte)}] = ${machine.cpu.ram[selectedByte]} decimal = ${machine.cpu.ram[selectedByte].toString(2).padStart(8, '0')} binary${selectedByte >= 0xe0 ? ` / Screen row ${Math.floor((selectedByte - 0xe0) / 2)}` : ''}.`);
    } else if (memorySpace === 'rom') {
      text('[data-relay-memory-size]', `${machine.program.words.length} WORDS`);
      inspector.innerHTML = `<table class="relay-rom-table"><thead><tr><th>Break</th><th>PC</th><th>Word</th><th>Decoded / source</th></tr></thead><tbody>${machine.program.instructions.map((instruction) => {
        const enabled = machine.breakpoints.includes(instruction.pc);
        return `<tr class="${instruction.pc === machine.cpu.pc ? 'relay-rom-current' : ''}"><td><button type="button" class="relay-rom-break" data-relay-breakpoint="${instruction.pc}" aria-label="${enabled ? 'Remove' : 'Set'} breakpoint at PC ${hex(instruction.pc, 4)}" aria-pressed="${enabled}">${enabled ? '●' : '○'}</button></td><td>${hex(instruction.pc, 4)}</td><td>${hex(instruction.word, 4)}</td><td><code>${escapeMarkup(formatInstruction(instruction))}</code><span>line ${instruction.line}</span></td></tr>`;
      }).join('')}</tbody></table>`;
      text('[data-relay-memory-note]', 'Actual encoded words, decoded on fetch. Breakpoints stop before execution.');
    } else {
      text('[data-relay-memory-size]', `${machine.cpu.stack.length} / 32 WORDS`);
      inspector.innerHTML = machine.cpu.stack.length
        ? `<ol class="relay-stack-list">${machine.cpu.stack.map((value, index) => `<li><span>${index === machine.cpu.stack.length - 1 ? 'TOP →' : `#${index}`}</span><code>${hex(value, 4)}</code><span>${value} decimal</span></li>`).reverse().join('')}</ol>`
        : '<div class="relay-empty-stack"><span aria-hidden="true">[ &nbsp; ]</span><p>The stack is empty.</p><p>CALL and PUSH put words here.<br>RET and POP take them back.</p></div>';
      text('[data-relay-memory-note]', '32 × 16-bit words, separate from RAM. Top is the next word popped. SP = depth.');
    }
  }

  function renderGuide(): void {
    get<HTMLElement>('[data-relay-guide]').hidden = !guided;
    get<HTMLElement>('[data-relay-guide-intro]').hidden = guided;
    if (!guided) return;
    const index = Math.min(machine.cpu.cycles, 4);
    const entry = guideSteps[index];
    const finished = machine.cpu.status === 'halted';
    text('[data-relay-guide-progress]', finished ? 'GUIDED TRACE / COMPLETE' : `GUIDED TRACE / ${index + 1} OF 5`);
    text('[data-relay-guide-title]', finished ? 'You just ran a computer.' : entry.title);
    text('[data-relay-guide-description]', finished ? 'Two numbers became a sum, then a byte in memory. Use Back to undo the HALT, then again to restore RAM[0x40] to zero.' : entry.description);
    text('[data-relay-guide-expected]', finished ? 'R0 = 19 · R1 = 7 · RAM[0x40] = 19 · 5 cycles' : `After this step: ${entry.expected}`);
    const button = get<HTMLButtonElement>('[data-relay-action="guide-next"]');
    button.textContent = finished ? 'Start again' : 'Execute this step →';
  }

  function render(): void {
    const cpu = machine.cpu;
    const event = lastEvent();
    const isDirty = dirty();
    const status = running ? 'Running' : cpu.status === 'halted' ? 'Halted' : cpu.status === 'faulted' ? 'Faulted' : stoppedAtBreakpoint === cpu.pc && machine.breakpoints.includes(cpu.pc) ? 'Breakpoint' : cpu.cycles ? 'Paused' : 'Ready';
    text('[data-relay-status]', status);
    root.dataset.relayState = status.toLowerCase();
    text('[data-relay-cycles]', String(cpu.cycles).padStart(6, '0'));
    text('[data-relay-sync]', isDirty ? 'DRAFT / NOT LOADED' : 'ASSEMBLED');
    get<HTMLElement>('[data-relay-sync]').classList.toggle('relay-sync-dirty', isDirty);
    text('[data-relay-words]', `${machine.program.words.length} / 256 words`);
    text('[data-relay-history]', `${machine.history.length} / ${HISTORY_LIMIT} UNDO`);
    runButton.innerHTML = running ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Run';
    runButton.setAttribute('aria-pressed', String(running));
    runButton.disabled = cpu.status !== 'ready';
    stepButton.disabled = running || cpu.status !== 'ready';
    reverseButton.disabled = machine.history.length === 0;
    get<HTMLElement>('[data-relay-schematic]').innerHTML = schematic(machine.program, cpu, event);
    const usefulTransfers = event?.transfers.filter((transfer) => transfer.from !== 'CONTROL' && !transfer.from.startsWith('ROM')) ?? [];
    text('[data-relay-transfer]', usefulTransfers.length
      ? usefulTransfers.map((transfer) => `${transfer.from} → ${transfer.to} : ${hex(transfer.value)}`).join('  /  ')
      : event?.description ?? 'No transfer yet. The clock is yours.');
    cpu.registers.forEach((value, index) => {
      text(`[data-relay-reg-hex="${index}"]`, hex(value));
      text(`[data-relay-reg-dec="${index}"]`, `${value} dec`);
      get<HTMLElement>(`[data-relay-register="${index}"]`).classList.toggle('relay-register-written', event?.registerWrites.some((write) => write.register === index) ?? false);
      get<HTMLElement>(`[data-relay-reg-bits="${index}"]`).innerHTML = value.toString(2).padStart(8, '0').split('').map((bit) => `<i class="${bit === '1' ? 'relay-bit-on' : ''}"></i>`).join('');
    });
    for (const key of ['z', 'n', 'c'] as const) {
      const flag = get<HTMLElement>(`[data-relay-flag="${key}"]`);
      flag.classList.toggle('relay-flag-on', cpu.flags[key]);
      flag.setAttribute('aria-label', `${key.toUpperCase()} ${cpu.flags[key] ? 'set' : 'clear'}`);
      query<HTMLOutputElement>(flag, 'output').textContent = cpu.flags[key] ? '1' : '0';
    }
    text('[data-relay-pc]', hex(cpu.pc, 4));
    const word = machine.program.words[cpu.pc];
    const decoded = word === undefined ? undefined : decodeInstruction(word);
    text('[data-relay-decoded]', cpu.status === 'halted' ? 'HALTED' : cpu.status === 'faulted' ? 'FAULT' : decoded?.ok ? formatInstruction(decoded.instruction) : 'FETCH / OUT OF ROM');
    const screen = get<HTMLElement>('[data-relay-screen]');
    screen.innerHTML = pixelGrid(cpu.ram, event?.memory[0]?.address);
    const lit = cpu.ram.slice(0xe0).reduce((count, byte) => count + byte.toString(2).replaceAll('0', '').length, 0);
    screen.setAttribute('aria-label', `16 by 16 memory-mapped display. ${lit} of 256 pixels lit. RAM E0 through FF.`);
    text('[data-relay-event-title]', event?.instruction ?? (cpu.status === 'faulted' ? 'Machine fault' : cpu.status === 'halted' ? 'Machine halted' : cpu.cycles ? 'Snapshot restored' : 'Nothing moves until you say so.'));
    text('[data-relay-event-description]', event?.description ?? (cpu.fault ?? (cpu.cycles
      ? 'This is an imported CPU snapshot. Its earlier trace is not included; new instructions will start a fresh history.'
      : selectedPreset?.id === 'framebuffer'
        ? 'The R is real video memory, initialized by .byte. Press Step to fetch your first instruction.'
        : 'The loaded program is ready at PC 0000. Press Step to fetch its first instruction.')));
    get<HTMLElement>('[data-relay-trace]').innerHTML = machine.trace.length
      ? [...machine.trace].reverse().map((entry, index) => `<li class="${index === 0 ? 'relay-trace-latest' : ''}${entry.kind === 'fault' ? ' relay-trace-fault' : ''}"><span>${String(entry.cycle).padStart(4, '0')}</span><span>${hex(entry.pc, 4)}</span><div><code>${escapeMarkup(entry.instruction)}</code><p>${escapeMarkup(entry.description)}</p></div></li>`).join('')
      : '<li class="relay-trace-empty"><span aria-hidden="true">↳</span><p>A record of every decision.<br>Step or run to leave a trace.</p></li>';
    renderGutter();
    renderMemory();
    renderGuide();
  }

  function afterExecution(): void {
    workRevision += 1;
    if (machine.cpu.status !== 'ready') {
      pause(machine.cpu.status === 'faulted' ? `Machine fault: ${machine.cpu.fault} Reverse or reset to recover.` : `Halted after ${machine.cpu.cycles} cycles. Reverse to undo; reset to start again.`);
    }
    render();
    revealCurrentSource();
  }

  const loop = createLoop((_elapsed, delta) => {
    if (!running || delta === 0) return;
    accumulated = Math.min(RUN_BATCH_LIMIT, accumulated + delta * speed);
    const budget = Math.floor(accumulated);
    if (budget < 1) return;
    accumulated -= budget;
    const result = runBatch(machine, budget, { skipInitialBreakpoint });
    skipInitialBreakpoint = false;
    machine = result.machine;
    if (result.reason === 'breakpoint') {
      stoppedAtBreakpoint = machine.cpu.pc;
      pause(`Breakpoint at PC ${hex(machine.cpu.pc, 4)}, source line ${machine.program.instructions[machine.cpu.pc].line}. Step executes it; Run resumes past it once.`);
    }
    afterExecution();
  }, { paused: true });
  page.onCleanup(() => { importRevision += 1; loop.destroy(); });

  function step(): void {
    pause();
    stoppedAtBreakpoint = null;
    machine = stepMachine(machine);
    if (machine.cpu.status === 'ready') announce(`${lastEvent()?.description ?? 'Ready.'}${dirty() ? ' Executing loaded source; draft changes are not assembled.' : ''}`);
    afterExecution();
  }

  function toggleRun(): void {
    if (running) {
      pause(`Paused at cycle ${machine.cpu.cycles}. All transfers and memory are held.`);
    } else if (machine.cpu.status === 'ready' && !document.hidden) {
      running = true;
      skipInitialBreakpoint = stoppedAtBreakpoint === machine.cpu.pc;
      stoppedAtBreakpoint = null;
      accumulated = 0;
      loop.setPaused(false);
      announce(`Running at ${speed} instructions per second.${dirty() ? ' Loaded source is executing; your draft is not assembled.' : ''}`);
    }
    render();
  }

  function reset(): void {
    pause();
    machine = resetMachine(machine);
    stoppedAtBreakpoint = null;
    workRevision += 1;
    announce('Reset to the loaded program. Initial RAM restored; breakpoints kept. Draft edits are untouched.');
    render();
    revealCurrentSource();
  }

  function loadPreset(preset: Preset): void {
    pause();
    const result = assemble(preset.source);
    if (!result.ok) throw new Error(`Authored program ${preset.id} failed assembly.`);
    machine = createMachine(result.program);
    source.value = preset.source;
    selectedPreset = preset;
    guided = preset.id === 'first-steps';
    stoppedAtBreakpoint = null;
    selectedByte = null;
    diagnostics.hidden = true;
    memoryBank = preset.id === 'fibonacci' || preset.id === 'bubble-sort' || guided ? 64 : 192;
    memorySelect.value = String(memoryBank);
    memorySpace = 'ram';
    source.scrollTop = 0;
    text('[data-relay-filename]', `${preset.id}.asm`);
    workRevision += 1;
    savedRevision = workRevision;
    announce(`“${preset.title}” is loaded. ${preset.goal}`);
    render();
    revealCurrentSource();
    setPane(guided ? 'guide' : 'machine');
  }

  function requestPreset(preset: Preset): void {
    resources.programs.close();
    pause();
    render();
    if (dirty() || workRevision > savedRevision) {
      pendingPreset = preset;
      dialog.showModal();
    } else loadPreset(preset);
  }

  function assembleDraft(): void {
    pause();
    const result = assemble(source.value);
    if (!result.ok) {
      showDiagnostics(result.diagnostics);
      render();
      return;
    }
    machine = createMachine(result.program);
    if (selectedPreset?.source !== source.value) {
      selectedPreset = undefined;
      text('[data-relay-filename]', 'untitled.asm');
    }
    stoppedAtBreakpoint = null;
    guided = selectedPreset?.id === 'first-steps' && source.value === selectedPreset.source;
    diagnostics.hidden = true;
    workRevision += 1;
    announce(`Assembled ${machine.program.words.length} words. CPU reset and initial RAM loaded.${guided ? ' Your five-step guide is ready.' : ''}`);
    render();
    revealCurrentSource();
  }

  function saveProject(): void {
    if (sourceByteLength(source.value) > MAX_SOURCE_BYTES || source.value.split(/\r\n|\r|\n/).length > MAX_SOURCE_LINES) {
      announce('Project not saved: draft exceeds 32 KiB or 2,048 lines. Export .asm to keep the text, or shorten it.');
      return;
    }
    downloadText('relay-project.json', exportProject(machine, source.value), 'application/json');
    savedRevision = workRevision;
    announce('Project exported with loaded source, draft, CPU, and breakpoints. Undo history is not included.');
  }

  async function importFile(file: File): Promise<void> {
    resources.files.close();
    pause();
    render();
    const revision = ++importRevision;
    const originalWork = workRevision;
    if (file.size > MAX_PROJECT_BYTES) {
      announce('Import rejected: project exceeds 512 KiB. Current machine preserved.');
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch (error) {
      if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
      announce(`Import could not read this file: ${error.message}. Current machine preserved.`);
      return;
    }
    if (page.signal.aborted || revision !== importRevision) return;
    if (workRevision !== originalWork) {
      announce('Import cancelled because the machine or draft changed while reading the file. Import again when ready.');
      return;
    }
    const result = importProject(content);
    if (!result.ok) {
      showDiagnostics(result.diagnostics, 'Import rejected');
      return;
    }
    pause();
    machine = result.machine;
    source.value = result.draftSource;
    selectedPreset = undefined;
    guided = false;
    stoppedAtBreakpoint = null;
    diagnostics.hidden = true;
    selectedByte = null;
    source.scrollTop = 0;
    text('[data-relay-filename]', 'imported-project.asm');
    workRevision += 1;
    savedRevision = workRevision;
    announce(`Project imported at cycle ${machine.cpu.cycles}. Source, RAM, registers, stack, and breakpoints restored. Undo history starts here.`);
    render();
    revealCurrentSource();
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const action = button.dataset.relayAction;
    if (action === 'step') step();
    else if (action === 'run') toggleRun();
    else if (action === 'reverse') {
      pause();
      machine = reverseMachine(machine);
      stoppedAtBreakpoint = null;
      workRevision += 1;
      announce(`Reversed to cycle ${machine.cpu.cycles}. Registers, flags, memory, stack, and trace restored.`);
      render();
      revealCurrentSource();
    } else if (action === 'reset') reset();
    else if (action === 'assemble') assembleDraft();
    else if (action === 'export-asm') {
      downloadText('relay-source.asm', source.value);
      announce('Assembly draft exported as relay-source.asm.');
    } else if (action === 'save') saveProject();
    else if (action === 'import') fileInput.click();
    else if (action === 'guide' || action === 'guide-start') {
      const preset = presets.find((entry) => entry.id === 'first-steps');
      if (preset) requestPreset(preset);
    } else if (action === 'guide-next') {
      if (machine.cpu.status === 'halted') reset();
      else step();
    } else if (action === 'guide-close') { guided = false; renderGuide(); }
    else if (action === 'replace-cancel') { pendingPreset = undefined; dialog.close(); }
    else if (action === 'replace-confirm') {
      const preset = pendingPreset;
      pendingPreset = undefined;
      dialog.close();
      if (preset) loadPreset(preset);
    }
    if (button.dataset.relayLoad) {
      const preset = presets.find((entry) => entry.id === button.dataset.relayLoad);
      if (preset) requestPreset(preset);
    }
    const pane = button.dataset.relayPane;
    if (pane === 'source' || pane === 'machine' || pane === 'output' || pane === 'memory' || pane === 'trace' || pane === 'guide') {
      setPane(pane);
      if (pane === 'source') revealCurrentSource();
    }
    const space = button.dataset.relayMemory;
    if (space === 'ram' || space === 'rom' || space === 'stack') {
      memorySpace = space;
      renderMemory();
    }
    if (button.dataset.relayBreakpoint !== undefined) {
      const pc = Number(button.dataset.relayBreakpoint);
      machine = toggleBreakpoint(machine, pc);
      if (!machine.breakpoints.includes(pc) && stoppedAtBreakpoint === pc) {
        stoppedAtBreakpoint = null;
        text('[data-relay-status]', machine.cpu.cycles ? 'Paused' : 'Ready');
        root.dataset.relayState = machine.cpu.cycles ? 'paused' : 'ready';
      }
      workRevision += 1;
      announce(`Breakpoint ${machine.breakpoints.includes(pc) ? 'set' : 'removed'} at PC ${hex(pc, 4)}.`);
      // Keep the activated button mounted so keyboard focus survives toggling.
      const enabled = machine.breakpoints.includes(pc);
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', `${enabled ? 'Remove' : 'Set'} breakpoint at ${button.closest('.relay-gutter') ? `line ${machine.program.instructions[pc].line}` : `PC ${hex(pc, 4)}`}`);
      if (button.closest('.relay-gutter')) button.classList.toggle('relay-line-break', enabled);
      else button.textContent = enabled ? '●' : '○';
      if (button.closest('.relay-gutter') && memorySpace === 'rom') renderMemory();
      if (!button.closest('.relay-gutter')) renderGutter();
    }
    if (button.dataset.relayByte !== undefined) {
      selectedByte = Number(button.dataset.relayByte);
      root.querySelectorAll<HTMLElement>('[data-relay-byte]').forEach((cell) => {
        const selected = Number(cell.dataset.relayByte) === selectedByte;
        cell.classList.toggle('relay-byte-selected', selected);
        cell.setAttribute('aria-pressed', String(selected));
      });
      text('[data-relay-memory-note]', `RAM[0x${hex(selectedByte)}] = ${machine.cpu.ram[selectedByte]} decimal = ${machine.cpu.ram[selectedByte].toString(2).padStart(8, '0')} binary${selectedByte >= 0xe0 ? ` / Screen row ${Math.floor((selectedByte - 0xe0) / 2)}` : ''}.`);
    }
    if (button.dataset.relayErrorLine !== undefined) {
      const lines = source.value.split('\n');
      const index = Math.max(0, Math.min(lines.length - 1, Number(button.dataset.relayErrorLine) - 1));
      const start = lines.slice(0, index).reduce((count, line) => count + line.length + 1, 0);
      source.focus();
      source.setSelectionRange(start, start + lines[index].length);
      source.scrollTop = Math.max(0, index * parseFloat(getComputedStyle(source).lineHeight) - 48);
      syncSourceScroll();
    }
  }, { signal: page.signal });

  source.addEventListener('input', () => {
    workRevision += 1;
    text('[data-relay-sync]', dirty() ? 'DRAFT / NOT LOADED' : 'ASSEMBLED');
    get<HTMLElement>('[data-relay-sync]').classList.toggle('relay-sync-dirty', dirty());
    if (!diagnostics.hidden) {
      diagnostics.hidden = true;
      announce('Draft changed. Assemble again for updated diagnostics.');
    }
    renderGutter();
  }, { signal: page.signal });
  source.addEventListener('scroll', syncSourceScroll, { signal: page.signal });
  get<HTMLSelectElement>('#relay-speed').addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    speed = Number(event.target.value);
    accumulated = 0;
    if (running) announce(`Clock changed to ${speed} instructions per second.`);
  }, { signal: page.signal });
  memorySelect.addEventListener('change', () => {
    memoryBank = Number(memorySelect.value);
    renderMemory();
  }, { signal: page.signal });
  follow.addEventListener('change', () => { lastRenderedMemoryEvent = undefined; renderMemory(); }, { signal: page.signal });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void importFile(file);
    fileInput.value = '';
  }, { signal: page.signal });
  get<HTMLElement>('.relay-inspect-tabs').addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const order: MemorySpace[] = ['ram', 'rom', 'stack'];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (order.indexOf(memorySpace) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    event.preventDefault();
    memorySpace = order[next];
    renderMemory();
    get<HTMLButtonElement>(`[data-relay-memory="${memorySpace}"]`).focus();
  }, { signal: page.signal });
  get<HTMLElement>('.relay-machine-pane').addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(); }
    else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      reverseButton.click();
    } else if (event.key === ' ') { event.preventDefault(); toggleRun(); }
  }, { signal: page.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) {
      pause('Paused because the page is hidden. Press Run when you return.');
      render();
    }
  }, { signal: page.signal });
  window.addEventListener('resize', syncSourceScroll, { signal: page.signal });
  page.onCleanup(() => { if (dialog.open) dialog.close(); });
  render();
  revealCurrentSource();

  return {
    destroy: page.destroy,
    setPaused(paused) {
      if (paused) { pause('Paused by the collection. Press Run to continue.'); render(); }
    },
    reset,
  };
}
