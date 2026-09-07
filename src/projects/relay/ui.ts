import { programLibrary, fieldManual } from './content';

const arrow = '<span aria-hidden="true">↗</span>';
export function workbenchMarkup(): string {
  return `<div class="relay-shell">
    <header class="relay-header">
      <h1 class="relay-brand" id="relay-title">RELAY<span class="relay-brand-edition">8-BIT / OPEN COMPUTER</span></h1>
      <nav aria-label="Relay resources"><button type="button" data-relay-resource="programs">Programs</button><button type="button" data-relay-resource="manual">Manual</button><button type="button" data-relay-resource="files">Files</button></nav>
    </header>
    <section class="relay-workbench" id="relay-workbench" data-project-preview aria-label="Relay computer workbench">
      <header class="relay-toolbar">
        <div class="relay-state"><i aria-hidden="true"></i><strong data-relay-status>Ready</strong><span>RELAY–8</span></div>
        <div class="relay-transport" aria-label="Execution controls">
          <button type="button" data-relay-action="reverse" title="Reverse one instruction"><span aria-hidden="true">↶</span> Back</button>
          <button type="button" data-relay-action="step"><span aria-hidden="true">→|</span> Step</button>
          <button type="button" class="relay-run" data-relay-action="run" aria-pressed="false"><span aria-hidden="true">▶</span> Run</button>
          <button type="button" data-relay-action="reset" title="Restore the loaded program and initial RAM"><span aria-hidden="true">↺</span> Reset</button>
        </div>
        <div class="relay-speed"><label for="relay-speed">Clock</label><select id="relay-speed"><option value="2">2 Hz</option><option value="8" selected>8 Hz</option><option value="60">60 Hz</option><option value="2000">2 kHz</option></select></div>
        <div class="relay-cycles"><output data-relay-cycles>000000</output><span>CYCLES</span></div>
      </header>
      <nav class="relay-mobile-tabs" aria-label="Workbench panes" role="tablist">
        <button type="button" data-relay-pane="machine" aria-pressed="true">Computer</button>
        <button type="button" data-relay-pane="source" aria-pressed="false">Source</button>
        <button type="button" data-relay-pane="output" aria-pressed="false">Screen</button>
        <button type="button" data-relay-pane="memory" aria-pressed="false">Memory</button>
        <button type="button" data-relay-pane="trace" aria-pressed="false">Trace</button>
        <button type="button" data-relay-pane="guide" aria-pressed="false">Guide</button>
      </nav>
      <div class="relay-main-grid" data-relay-active-pane="machine">
        <section class="relay-source-pane" aria-labelledby="relay-source-label">
          <header class="relay-pane-heading"><h2 id="relay-source-label"><span>01</span> Source</h2><span class="relay-sync" data-relay-sync>ASSEMBLED</span></header>
          <div class="relay-filebar"><span class="relay-file-dot" aria-hidden="true"></span><span data-relay-filename>hello-pixel.asm</span><span>RELAY ASM</span></div>
          <div class="relay-editor-wrap"><div class="relay-editor-current" data-relay-current-line aria-hidden="true"></div><div class="relay-gutter" data-relay-gutter aria-label="Source line breakpoints"></div><textarea id="relay-source" aria-label="Assembly source" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" maxlength="32768" aria-describedby="relay-source-help"></textarea></div>
          <div class="relay-editor-footer"><button type="button" class="relay-assemble" data-relay-action="assemble">Assemble &amp; load <span aria-hidden="true">↗</span></button><span data-relay-words>0 words</span></div>
          <p class="relay-source-help" id="relay-source-help">Edit freely. Assemble to load your changes.<br>Click an instruction’s line number to break before it.</p>
          <div class="relay-diagnostics" data-relay-diagnostics role="alert" hidden></div>
        </section>
        <section class="relay-machine-pane" tabindex="0" aria-label="Computer data path. Right arrow steps, left arrow reverses, Space runs or pauses.">
          <header class="relay-pane-heading"><h2><span>02</span> Inside the machine</h2><span class="relay-live-label">LIVE DATA PATH</span></header>
          <div data-relay-schematic></div>
          <div class="relay-bus-readout"><span class="relay-bus-key" aria-hidden="true"></span><span data-relay-transfer>No transfer yet. The clock is yours.</span></div>
          <div class="relay-registers" aria-label="CPU registers">${[0, 1, 2, 3].map((i) => `<div class="relay-register" data-relay-register="${i}"><span>R${i}</span><output data-relay-reg-hex="${i}">00</output><span data-relay-reg-dec="${i}">0 dec</span><div class="relay-register-bits" data-relay-reg-bits="${i}" aria-hidden="true"></div></div>`).join('')}</div>
          <div class="relay-decode">
            <div class="relay-current"><span>NEXT INSTRUCTION <b data-relay-pc>0000</b></span><output data-relay-decoded>CALL 0x02</output></div>
            <div class="relay-flags" aria-label="CPU flags">${[['z', 'Zero'], ['n', 'Negative'], ['c', 'Carry']].map(([key, label]) => `<div title="${label}" data-relay-flag="${key}"><span>${key.toUpperCase()}</span><output>0</output></div>`).join('')}</div>
          </div>
        </section>
        <aside class="relay-tools-pane" aria-label="Machine inspectors">
          <nav data-relay-inspector-tabs></nav>
          <div class="relay-tool-panels">
        <div data-relay-panel="output"><section class="relay-output-pane" aria-labelledby="relay-output-label">
          <header class="relay-pane-heading"><h2 id="relay-output-label"><span>03</span> Output</h2><span>16 × 16</span></header>
          <div class="relay-display-housing">
            <div class="relay-display-top"><span>MEMORY → LIGHT</span><span class="relay-screen-led" aria-hidden="true"></span></div>
            <div class="relay-screen" data-relay-screen role="img" aria-label="16 by 16 memory-mapped display"></div>
            <div class="relay-display-bottom"><span>1 BIT / PIXEL</span><span>32 BYTES</span></div>
          </div>
          <div class="relay-screen-address"><span>FRAMEBUFFER</span><code>E0 — FF</code></div>
          <div class="relay-observation"><p class="relay-eyebrow">THE LAST INSTRUCTION</p><h3 data-relay-event-title>Nothing moves<br>until you say so.</h3><p data-relay-event-description>The R is real video memory, initialized by .byte. Press Step to fetch your first instruction.</p></div>
          <button type="button" class="relay-guide-launch" data-relay-action="guide">New to assembly? <span>Take five small steps ${arrow}</span></button>
        </section></div>
        <div data-relay-panel="guide">
          <div class="relay-guide-intro" data-relay-guide-intro><h2>Five small steps</h2><p>Load two numbers, add them, write a byte, and halt. Then reverse every instruction.</p><button type="button" class="relay-assemble" data-relay-action="guide-start">Start guided program</button></div>
      <section class="relay-guide" data-relay-guide hidden aria-label="Guided walkthrough">
        <div><p class="relay-eyebrow" data-relay-guide-progress>GUIDED TRACE / 1 OF 5</p><h3 data-relay-guide-title></h3><p data-relay-guide-description></p><p class="relay-guide-expected" data-relay-guide-expected></p></div>
        <div class="relay-guide-controls"><button type="button" class="relay-assemble" data-relay-action="guide-next">Execute this step →</button><button type="button" data-relay-action="guide-close">Close guide</button></div>
      </section>
        </div>
        <div data-relay-panel="memory">
        <section class="relay-memory-pane" aria-label="Memory inspector">
          <header class="relay-inspect-heading"><div class="relay-inspect-tabs" role="tablist" aria-label="Memory space"><button type="button" id="relay-tab-ram" role="tab" aria-controls="relay-inspector" aria-selected="true" data-relay-memory="ram">Data RAM</button><button type="button" id="relay-tab-rom" role="tab" tabindex="-1" aria-controls="relay-inspector" aria-selected="false" data-relay-memory="rom">Program ROM</button><button type="button" id="relay-tab-stack" role="tab" tabindex="-1" aria-controls="relay-inspector" aria-selected="false" data-relay-memory="stack">Stack</button></div><span data-relay-memory-size>256 BYTES</span></header>
          <div class="relay-memory-controls" data-relay-memory-controls><label for="relay-memory-page">Address bank</label><select id="relay-memory-page"><option value="0">00–3F</option><option value="64">40–7F</option><option value="128">80–BF</option><option value="192" selected>C0–FF / SCREEN</option></select><label class="relay-follow"><input type="checkbox" data-relay-follow checked> Follow access</label></div>
          <div id="relay-inspector" class="relay-inspector" role="tabpanel" tabindex="0" aria-labelledby="relay-tab-ram" data-relay-inspector></div>
          <p class="relay-memory-note" data-relay-memory-note>Select a byte for decimal and binary. Vermilion marks the last access.</p>
        </section>
        </div>
        <div data-relay-panel="trace">
        <section class="relay-trace-pane" aria-label="Execution trace">
          <header class="relay-inspect-heading"><h2>Execution trace</h2><span data-relay-history>0 / 512 UNDO</span></header>
          <div class="relay-trace-head"><span>CYCLE</span><span>PC</span><span>INSTRUCTION / EFFECT</span></div>
          <ol class="relay-trace" data-relay-trace><li class="relay-trace-empty"><span aria-hidden="true">↳</span><p>A record of every decision.<br>Step or run to leave a trace.</p></li></ol>
        </section>
        </div>
          </div>
        </aside>
      </div>
      <div class="relay-message" data-relay-message role="status">Ready. “Hello, pixel.” is loaded. Step to see a subroutine turn memory into light.</div>
    </section>
    <footer class="relay-workbench-footer"><span><i aria-hidden="true"></i> LOCAL MACHINE · NO NETWORK · RUN IS OPT-IN</span><p>Save loaded source, draft, CPU, RAM, and breakpoints. Undo history is not included.</p><div><button type="button" data-relay-action="export-asm">Export .asm ${arrow}</button><button type="button" data-relay-action="save">Save project ${arrow}</button><button type="button" data-relay-action="import">Import JSON ${arrow}</button><input type="file" accept=".json,application/json" aria-label="Import Relay project file" data-relay-file hidden></div></footer>
    ${programLibrary()}
    ${fieldManual()}
    <dialog class="relay-replace-dialog" aria-labelledby="relay-replace-title"><h2 id="relay-replace-title">Keep your work?</h2><p>Opening another program replaces this draft and the current machine. Save a project first if you want to return to it.</p><div><button type="button" data-relay-action="replace-cancel">Keep working</button><button type="button" data-relay-action="save">Save project</button><button type="button" class="relay-assemble" data-relay-action="replace-confirm">Replace program</button></div></dialog>
  </div>`;
}
