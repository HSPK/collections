import './style.css';
import { createLoop } from '../../core/loop';
import { clamp } from '../../core/math';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog, createWorkspaceTabs } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { algorithmOrder, algorithms, countingRules, presets, readingNotes } from './data';
import { buildTrace, itemLabel, validateInput } from './engine';
import type { AlgorithmId, Counters, OperationKind, SortingTrace } from './engine';

const operationNames: Record<OperationKind, string> = {
  start: 'Opening',
  select: 'Selection',
  compare: 'Comparison',
  swap: 'Exchange',
  write: 'Slot write',
  pass: 'Pass boundary',
  done: 'Curtain',
};

function recordAll(values: readonly number[]): ReadonlyMap<AlgorithmId, SortingTrace> {
  return new Map(algorithmOrder.map((id) => [id, buildTrace(id, values)]));
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'algorithms');
  page.root.dataset.workspace = 'true';
  const opening = presets[0];
  let selected: AlgorithmId = 'insertion';
  let appliedValues: readonly number[] = opening.values;
  let appliedText = appliedValues.join(', ');
  let recorded = recordAll(appliedValues);
  let cursor = 0;
  let playing = false;
  let accumulated = 0;
  let secondsPerStep = context.reducedMotion ? 1.5 : 0.9;

  page.root.innerHTML = `
    <div class="at-shell">
      <header class="at-site-header">
        <a class="at-wordmark" href="#algorithms-top" aria-label="Algorithm Theatre, top">
          <span class="at-monogram" aria-hidden="true">A:T</span>
          <span>Algorithm Theatre<small>An interactive field manual</small></span>
        </a>
        <nav aria-label="Algorithm Theatre navigation">
          <button class="at-button at-button-quiet" type="button" data-field-notes>Field notes</button>
          <button class="at-button at-button-quiet" type="button" data-counting-rules>Counting rules</button>
        </nav>
      </header>

      <section class="at-hero" id="algorithms-top" aria-labelledby="algorithms-title">
        <div class="at-hero-copy">
          <p class="at-eyebrow"><span class="at-cue" aria-hidden="true"></span> Vol. 01 / Order, observed</p>
          <h1 id="algorithms-title">Algorithm Theatre<span class="at-period" aria-hidden="true">.</span></h1>
        </div>
        <p class="at-hero-deck">See the next decision. Choose Next.</p>
      </section>

      <section class="at-workbench" id="algorithms-stage" aria-labelledby="algorithms-stage-title">
        <div class="at-section-heading">
          <div><p class="at-eyebrow">01 / The rehearsal room</p><h2 id="algorithms-stage-title">Put an array on stage.</h2></div>
          <p>Choose a method, keep an eye on the key, and advance one honest operation at a time.</p>
        </div>

        <div class="at-live-grid">
          <section class="at-stage" data-stage data-project-preview tabindex="0" aria-label="Sorting stage"
            aria-describedby="algorithms-keyboard-help">
            <header class="at-stage-top">
              <div class="at-stage-status"><span class="at-status-dot" aria-hidden="true"></span><strong data-play-state>Paused</strong></div>
              <span class="at-frame-readout">Step <output data-step-number aria-live="off">00</output> <span aria-hidden="true">/</span> <span data-step-total>00</span></span>
              <div class="at-transport-buttons">
                <button type="button" class="at-button at-button-quiet" data-previous>Previous</button>
                <button type="button" class="at-button at-button-play" data-play aria-pressed="false">Play</button>
                <button type="button" class="at-button at-button-quiet" data-next>Next</button>
              </div>
              <button type="button" class="at-restart" data-restart>Restart</button>
            </header>
            <div class="at-stage-body">
              <div class="at-stage-caption"><span>Array slots / zero-based</span><span>ID letters never change</span></div>
              <ol class="at-slots" data-slots aria-label="Array at the current step"></ol>
              <div class="at-legend" aria-label="Stage legend">
                <span><i class="at-key at-key-active" aria-hidden="true"></i>Active values</span>
                <span><i class="at-key at-key-ordered" aria-hidden="true"></i><span data-region-label>Ordered prefix</span></span>
                <span>Bars share a zero line</span>
              </div>
              <p class="at-region-note" data-region-note></p>
              <p class="at-array-readout"><span>Array now</span><code data-current-array></code></p>
              <div class="at-focus-readout"><span>In focus</span><output data-focus-values aria-live="off"></output></div>
              <div class="at-operation">
                <p class="at-eyebrow"><span data-operation-name>Opening</span><span class="at-operation-rule" aria-hidden="true"></span><span data-operation-line>Line 01</span></p>
                <h3 data-step-title></h3>
                <p data-explanation></p>
              </div>
              <dl class="at-counters" aria-label="Operations through the current step">
                <div><dt>Comparisons</dt><dd><output data-count="comparisons" aria-live="off">0</output><span data-delta="comparisons">No change</span></dd></div>
                <div><dt>Swaps</dt><dd><output data-count="swaps" aria-live="off">0</output><span data-delta="swaps">No change</span></dd></div>
                <div><dt>Slot writes</dt><dd><output data-count="writes" aria-live="off">0</output><span data-delta="writes">No change</span></dd></div>
              </dl>
              <p class="at-counter-note">Cumulative through this step. One swap also counts as two slot writes.</p>
            </div>
            <div class="at-transport">
              <label class="at-scrub-label" for="algorithms-scrub"><span>Trace position</span><span data-trace-caption></span></label>
              <input id="algorithms-scrub" class="at-scrubber" type="range" min="0" max="1" step="1" value="0">
              <div class="at-tempo-row">
                <label for="algorithms-tempo">Playback tempo</label>
                <select id="algorithms-tempo">
                  <option value="0.4">Brisk · 0.4 s / step</option>
                  <option value="0.9" ${!context.reducedMotion ? 'selected' : ''}>Measured · 0.9 s / step</option>
                  <option value="1.5" ${context.reducedMotion ? 'selected' : ''}>Deliberate · 1.5 s / step</option>
                </select>
              </div>
              <p class="at-help" id="algorithms-keyboard-help">Focus the stage: ← / → step, Home / End jump, Space plays or pauses. You can also use the buttons or slider.</p>
              <p class="at-motion-note">${context.reducedMotion
                ? 'Reduced motion is on. No animated transitions; slower playback starts only if you choose Play.'
                : 'Paused until you choose Play. No interpolated moves: each frame is an exact recorded state.'}</p>
            </div>
          </section>

          <aside class="at-setup" aria-label="Method and array controls">
            <fieldset class="at-methods">
              <legend>Choose the method</legend>
              <div class="at-method-grid">
                ${algorithmOrder.map((id) => `
                  <label class="at-method">
                    <input type="radio" name="at-method" value="${id}" aria-label="${escapeMarkup(algorithms[id].name)}" ${id === selected ? 'checked' : ''}>
                    <span class="at-method-content">
                      <span class="at-method-top"><span>${algorithms[id].number}</span><strong class="at-method-name-full">${escapeMarkup(algorithms[id].name)}</strong><strong class="at-method-name-short" aria-hidden="true">${escapeMarkup(algorithms[id].name.replace(' sort', ''))}</strong></span>
                    </span>
                  </label>
                `).join('')}
              </div>
            </fieldset>
            <div class="at-input-grid">
              <form class="at-array-form" data-array-form novalidate>
                <label for="algorithms-array">Write your opening array</label>
                <div class="at-input-row">
                  <input id="algorithms-array" name="array" type="text" value="${escapeMarkup(appliedText)}"
                    maxlength="256" autocomplete="off" spellcheck="false"
                    aria-describedby="algorithms-array-help algorithms-input-note algorithms-input-error">
                  <button type="submit" class="at-button at-button-light" aria-label="Apply array">Apply</button>
                </div>
                <p class="at-help" id="algorithms-array-help">2–12 whole numbers, −99 to 99. Commas or spaces. Duplicates welcome.</p>
                <p class="at-input-note" id="algorithms-input-note" data-input-note></p>
                <p class="at-input-error" id="algorithms-input-error" data-input-error role="alert" hidden></p>
              </form>
              <div class="at-dataset-picker">
                <label for="algorithms-dataset">Or bring in a prepared cast</label>
                <div class="at-input-row">
                  <select id="algorithms-dataset">
                    ${presets.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.name)}</option>`).join('')}
                  </select>
                  <button type="button" class="at-button at-button-quiet" data-use-dataset>Use dataset</button>
                </div>
                <p class="at-help" data-dataset-note>${escapeMarkup(opening.note)}</p>
                <p class="at-help at-muted">Selecting a preset does not replace your array until you choose “Use dataset”.</p>
              </div>
            </div>
          </aside>

          <aside class="at-script" aria-labelledby="algorithms-script-title">
            <header><p class="at-eyebrow">The script / Pseudocode</p><h3 id="algorithms-script-title" data-method-name></h3><p data-method-intro></p></header>
            <div class="at-script-facts"><span data-stability></span><span>O(1) sorting workspace</span></div>
            <ol class="at-code" data-code aria-label="Pseudocode; the highlighted line explains the current step"></ol>
            <p class="at-script-note">The marked line produced this frame. Bookkeeping lines can run between frames; only value tests, exchanges, and slot assignments enter the counters.</p>
            <div class="at-register" data-register>
              <span class="at-eyebrow">Key register / off-array</span>
              <output data-held-value aria-live="off"></output>
              <p>A shifted value may appear twice in the slots while its displaced key waits here.</p>
            </div>
            <div class="at-script-footer"><span aria-hidden="true">↶</span><p>${escapeMarkup(readingNotes.traces)}</p></div>
          </aside>
        </div>
        <p class="at-chart-note">${escapeMarkup(readingNotes.bars)}</p>
        <details class="at-programme-disclosure">
          <summary>Tonight’s programme · one cast, three different scripts</summary>
          <aside class="at-programme" aria-label="The programme">
            <p class="at-eyebrow">FIG. A / Sorting, taken apart</p>
            <h2>One cast. Three different scripts.</h2>
            <p class="at-programme-intro">Every move has a motive. Slow a sorting algorithm down until you can see it think.</p>
            <ol>
              ${algorithmOrder.map((id) => `
                <li><span class="at-programme-number">${algorithms[id].number}</span>
                  <span><strong>${escapeMarkup(algorithms[id].name)}</strong><small>${escapeMarkup(algorithms[id].cue)}
                    · ${algorithms[id].stable ? 'Stable' : 'Not stable'} · Worst ${escapeMarkup(algorithms[id].worst)}</small></span>
                </li>
              `).join('')}
            </ol>
            <p class="at-programme-foot">No autoplay. No disappearing steps.<br>Just values, decisions, and a complete record.</p>
          </aside>
        </details>
      </section>

      <section class="at-scorecard" aria-labelledby="algorithms-scorecard-title">
        <div class="at-section-heading">
          <div><p class="at-eyebrow">02 / The same cast, three scripts</p><h2 id="algorithms-scorecard-title">Compare the whole performance.</h2></div>
          <p>${escapeMarkup(readingNotes.scorecard)}</p>
        </div>
        <p class="at-applied-caption">Applied array <code data-score-array></code></p>
        <div class="at-table-wrap">
          <table>
            <caption class="at-sr-only">Complete-run operation totals for the applied array</caption>
            <thead><tr><th scope="col">Method</th><th scope="col">Value<br>comparisons</th><th scope="col">Swaps</th><th scope="col">Slot<br>writes</th></tr></thead>
            <tbody data-scorecard></tbody>
          </table>
        </div>
        <p class="at-help">These are operation counts, not timings. The selected method is marked “On stage”.</p>
      </section>

      <section class="at-field-notes" id="algorithms-notes" aria-labelledby="algorithms-notes-title">
        <div class="at-section-heading">
          <div><p class="at-eyebrow">03 / Field notes</p><h2 id="algorithms-notes-title">Different work. Different tradeoffs.</h2></div>
          <p>Not all paths to a sorted array have the same cost. Read the method, then test its claims on stage.</p>
        </div>
        <div class="at-note-grid">
          ${algorithmOrder.map((id) => {
            const definition = algorithms[id];
            return `<article class="at-method-note">
              <p class="at-note-number">${definition.number} <span>/ ${definition.stable ? 'Stable' : 'Not stable'}</span></p>
              <h3>${escapeMarkup(definition.name)}</h3>
              <p>${escapeMarkup(definition.mechanism)}</p>
              <dl class="at-complexity">
                <div><dt>Best</dt><dd>${escapeMarkup(definition.best)}</dd></div>
                <div><dt>Average</dt><dd>${escapeMarkup(definition.average)}</dd></div>
                <div><dt>Worst</dt><dd>${escapeMarkup(definition.worst)}</dd></div>
              </dl>
              <h4>Where it earns its keep</h4><p>${escapeMarkup(definition.useCase)}</p>
              <h4>What to watch</h4><p>${escapeMarkup(definition.watchFor)}</p>
            </article>`;
          }).join('')}
        </div>
        <p class="at-complexity-note">${escapeMarkup(readingNotes.complexity)}</p>
      </section>

      <section class="at-stability-lesson" aria-labelledby="algorithms-stability-title">
        <div><p class="at-eyebrow">A three-item proof</p><h2 id="algorithms-stability-title">Equal is not identical.</h2><p>${escapeMarkup(readingNotes.stability)}</p></div>
        <div class="at-witness">
          <div><span>Before selection</span><code><b>2·A</b><b>2·B</b><b>1·C</b></code></div>
          <span class="at-witness-arrow" aria-hidden="true">↓</span>
          <div><span>After one swap</span><code><b>1·C</b><b class="at-tie">2·B</b><b class="at-tie">2·A</b></code></div>
          <p>${escapeMarkup(readingNotes.witness)}</p>
          <button type="button" class="at-button at-button-quiet" data-witness>Try the stability witness</button>
          <p class="at-help">Loads [2, 2, 1] and selection sort, paused at the opening step.</p>
        </div>
      </section>

      <section class="at-counting-room" id="algorithms-counting" aria-labelledby="algorithms-counting-title">
        <div class="at-section-heading">
          <div><p class="at-eyebrow">04 / The counting room</p><h2 id="algorithms-counting-title">An honest bill for every operation.</h2></div>
          <p>The rules below are the contract behind every number on this page. Nothing is estimated from animation frames.</p>
        </div>
        <div class="at-counting-grid">
          ${countingRules.map((rule, index) => `<article>
            <span class="at-counting-number">0${index + 1}</span>
            <h3>${escapeMarkup(rule.term)}</h3>
            <p>${escapeMarkup(rule.rule)}</p>
            <code>${escapeMarkup(rule.example)}</code>
          </article>`).join('')}
        </div>
      </section>

      <footer class="at-footer"><p><strong>Algorithm Theatre</strong><span>Learning by slowing things down.</span></p><a href="#algorithms-stage">Back to the stage ↑</a></footer>
      <p class="at-sr-only" role="status" aria-live="polite" aria-atomic="true" data-announcement></p>
    </div>
  `;

  const root = page.root;
  const notes = query<HTMLElement>(root, '.at-field-notes');
  notes.prepend(query<HTMLElement>(root, '.at-wordmark'));
  query<HTMLElement>(root, '.at-site-header').prepend(query<HTMLElement>(root, '#algorithms-title'));
  notes.prepend(query<HTMLElement>(root, '.at-hero'), query<HTMLElement>(root, '.at-workbench > .at-section-heading'));
  const sidebar = document.createElement('div');
  sidebar.className = 'at-inspector';
  const tabHost = document.createElement('div');
  sidebar.append(tabHost);
  query<HTMLElement>(root, '.at-live-grid').append(sidebar);
  const stepDetails = document.createElement('div');
  stepDetails.className = 'at-step-details';
  stepDetails.append(...[
    '.at-operation', '.at-focus-readout', '.at-region-note', '.at-counter-note',
    '.at-tempo-row', '#algorithms-keyboard-help', '.at-motion-note', '.at-chart-note',
    '.at-stage-caption', '.at-legend',
  ].map(selector => query<HTMLElement>(root, selector)));
  const deltas = document.createElement('dl');
  deltas.className = 'at-step-deltas';
  for (const key of ['comparisons', 'swaps', 'writes']) {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    label.textContent = key === 'writes' ? 'Slot writes' : key[0].toUpperCase() + key.slice(1);
    const value = document.createElement('dd');
    value.append(query<HTMLElement>(root, `[data-delta="${key}"]`));
    row.append(label, value);
    deltas.append(row);
  }
  stepDetails.prepend(deltas);
  const panes = [
    { id: 'array', label: 'Array', content: query<HTMLElement>(root, '.at-setup') },
    { id: 'trace', label: 'Trace', content: stepDetails },
    { id: 'script', label: 'Script', content: query<HTMLElement>(root, '.at-script') },
    { id: 'totals', label: 'Totals', content: query<HTMLElement>(root, '.at-scorecard') },
  ].map(({ id, label, content }) => {
    const panel = document.createElement('div');
    panel.className = 'at-inspector-pane';
    panel.append(content);
    sidebar.append(panel);
    return { id, label, panel };
  });
  const inspectorTabs = createWorkspaceTabs(page, { id: 'algorithms-inspector', label: 'Rehearsal tools', host: tabHost, panes });
  const fieldNotes = createWorkspaceDialog(page, {
    id: 'algorithms-field-notes', title: 'Field notes', triggers: [query(root, '[data-field-notes]')],
    content: [query(root, '.at-programme-disclosure'), notes, query(root, '.at-stability-lesson'), query(root, '.at-footer')],
  });
  createWorkspaceDialog(page, {
    id: 'algorithms-counting-rules', title: 'Counting rules', triggers: [query(root, '[data-counting-rules]')],
    content: [query(root, '.at-counting-room')],
  });
  root.querySelectorAll<HTMLAnchorElement>('a[href="#algorithms-stage"], a[href="#algorithms-top"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      fieldNotes.close();
      query<HTMLElement>(root, '[data-stage]').focus({ preventScroll: true });
    }, { signal: page.signal });
  });

  const elements = {
    form: query<HTMLFormElement>(page.root, '[data-array-form]'),
    input: query<HTMLInputElement>(page.root, '#algorithms-array'),
    inputNote: query<HTMLElement>(page.root, '[data-input-note]'),
    inputError: query<HTMLElement>(page.root, '[data-input-error]'),
    dataset: query<HTMLSelectElement>(page.root, '#algorithms-dataset'),
    datasetNote: query<HTMLElement>(page.root, '[data-dataset-note]'),
    useDataset: query<HTMLButtonElement>(page.root, '[data-use-dataset]'),
    stage: query<HTMLElement>(page.root, '[data-stage]'),
    slots: query<HTMLOListElement>(page.root, '[data-slots]'),
    previous: query<HTMLButtonElement>(page.root, '[data-previous]'),
    play: query<HTMLButtonElement>(page.root, '[data-play]'),
    next: query<HTMLButtonElement>(page.root, '[data-next]'),
    restart: query<HTMLButtonElement>(page.root, '[data-restart]'),
    scrub: query<HTMLInputElement>(page.root, '#algorithms-scrub'),
    tempo: query<HTMLSelectElement>(page.root, '#algorithms-tempo'),
    playState: query<HTMLElement>(page.root, '[data-play-state]'),
    stepNumber: query<HTMLOutputElement>(page.root, '[data-step-number]'),
    stepTotal: query<HTMLElement>(page.root, '[data-step-total]'),
    traceCaption: query<HTMLElement>(page.root, '[data-trace-caption]'),
    stepTitle: query<HTMLElement>(page.root, '[data-step-title]'),
    explanation: query<HTMLElement>(page.root, '[data-explanation]'),
    operation: query<HTMLElement>(page.root, '[data-operation-name]'),
    operationLine: query<HTMLElement>(page.root, '[data-operation-line]'),
    currentArray: query<HTMLElement>(page.root, '[data-current-array]'),
    focus: query<HTMLOutputElement>(page.root, '[data-focus-values]'),
    regionLabel: query<HTMLElement>(page.root, '[data-region-label]'),
    regionNote: query<HTMLElement>(page.root, '[data-region-note]'),
    methodName: query<HTMLElement>(page.root, '[data-method-name]'),
    methodIntro: query<HTMLElement>(page.root, '[data-method-intro]'),
    stability: query<HTMLElement>(page.root, '[data-stability]'),
    code: query<HTMLOListElement>(page.root, '[data-code]'),
    register: query<HTMLElement>(page.root, '[data-register]'),
    held: query<HTMLOutputElement>(page.root, '[data-held-value]'),
    scorecard: query<HTMLElement>(page.root, '[data-scorecard]'),
    scoreArray: query<HTMLElement>(page.root, '[data-score-array]'),
    witness: query<HTMLButtonElement>(page.root, '[data-witness]'),
    announcement: query<HTMLElement>(page.root, '[data-announcement]'),
  };
  const counterKeys: readonly (keyof Counters)[] = ['comparisons', 'swaps', 'writes'];
  const counterElements = counterKeys.map((key) => ({
    key,
    total: query<HTMLOutputElement>(page.root, `[data-count="${key}"]`),
    delta: query<HTMLElement>(page.root, `[data-delta="${key}"]`),
  }));
  const radios = [...page.root.querySelectorAll<HTMLInputElement>('input[name="at-method"]')];
  const events = { signal: page.signal };

  const traceFor = (id: AlgorithmId) => {
    const trace = recorded.get(id);
    if (!trace) throw new Error(`A recording is missing for ${id}.`);
    return trace;
  };
  const currentTrace = () => traceFor(selected);
  const lastStep = () => currentTrace().steps.length - 1;
  const currentStep = () => currentTrace().steps[cursor];
  const announce = (message: string) => { elements.announcement.textContent = message; };
  const describeStep = () => {
    const step = currentStep();
    return `Step ${cursor} of ${lastStep()}. ${step.title} ${step.counters.comparisons} comparisons, ${step.counters.swaps} swaps, ${step.counters.writes} slot writes.`;
  };

  const loop = createLoop((_elapsed, delta) => {
    if (!playing) return;
    accumulated += delta;
    if (accumulated < secondsPerStep) return;
    accumulated -= secondsPerStep;
    cursor = Math.min(cursor + 1, lastStep());
    if (cursor === lastStep()) {
      pausePlayback();
      announce(`Trace complete. ${describeStep()}`);
    }
    renderStep();
  }, { paused: true });
  page.onCleanup(() => {
    playing = false;
    loop.destroy();
  });

  function pausePlayback() {
    playing = false;
    accumulated = 0;
    loop.setPaused(true);
  }

  function renderTransport() {
    elements.play.textContent = playing ? 'Pause' : 'Play';
    elements.play.setAttribute('aria-pressed', String(playing));
    elements.play.disabled = cursor === lastStep();
    elements.previous.disabled = cursor === 0;
    elements.next.disabled = cursor === lastStep();
    elements.restart.disabled = cursor === 0 && !playing;
    elements.playState.textContent = playing ? 'Playing' : cursor === lastStep() ? 'Complete' : 'Paused';
    elements.stage.dataset.playing = String(playing);
    elements.stepNumber.value = String(cursor).padStart(2, '0');
    elements.stepTotal.textContent = String(lastStep()).padStart(2, '0');
    elements.scrub.max = String(lastStep());
    elements.scrub.value = String(cursor);
    elements.scrub.setAttribute('aria-valuetext', `Step ${cursor} of ${lastStep()}: ${currentStep().title}`);
    elements.traceCaption.textContent = cursor === lastStep() ? 'End of trace · rewind to replay' : `${currentTrace().steps.length} recorded frames`;
  }

  function renderStep() {
    const step = currentStep();
    const scale = Math.max(1, ...appliedValues.map(Math.abs));
    elements.slots.style.setProperty('--at-slot-count', String(Math.min(8, step.items.length)));
    elements.slots.style.setProperty('--at-medium-slot-count', String(Math.min(6, step.items.length)));
    elements.slots.style.setProperty('--at-small-slot-count', String(Math.min(4, step.items.length)));
    elements.slots.innerHTML = step.items.map((item, index) => {
      const active = step.focus.includes(index);
      const ordered = step.ordered.includes(index);
      const letter = String.fromCharCode(65 + item.origin);
      const state = active ? 'Active' : ordered ? 'Ordered' : 'Waiting';
      const label = `Slot ${index}: ${item.value}, original ID ${letter}${active ? ', active' : ''}${ordered ? `, ${algorithms[selected].regionLabel.toLowerCase()}` : ''}`;
      return `<li data-slot="${index}" data-value="${item.value}" data-origin="${item.origin}"
        class="at-slot${active ? ' is-active' : ''}${ordered ? ' is-ordered' : ''}" aria-label="${escapeMarkup(label)}">
        <span class="at-slot-index">[${index}]</span>
        <div class="at-slot-rail" aria-hidden="true"><span class="at-zero-line"></span>
          <span class="at-bar${item.value < 0 ? ' is-negative' : ''}${item.value === 0 ? ' is-zero' : ''}"
            style="--at-magnitude:${Math.abs(item.value) / scale * 42}%"></span>
        </div>
        <strong class="at-slot-value">${item.value}</strong>
        <span class="at-origin">ID ${letter}</span>
        <span class="at-slot-state" title="${state}"><span class="at-state-full">${state}</span><span class="at-state-short" aria-hidden="true">${active ? 'Act' : ordered ? 'Ord' : 'Wait'}</span></span>
      </li>`;
    }).join('');
    elements.currentArray.textContent = `[${step.items.map((item) => item.value).join(', ')}]`;
    elements.focus.textContent = step.operands.length
      ? step.operands.map(itemLabel).join('  /  ')
      : 'No selected values at this step.';
    elements.held.value = step.held ? itemLabel(step.held) : 'Empty — key is in the array.';
    elements.register.dataset.occupied = String(step.held !== null);
    elements.stepTitle.textContent = step.title;
    elements.explanation.textContent = step.explanation;
    elements.operation.textContent = operationNames[step.kind];
    const lineIndex = algorithms[selected].pseudocode.findIndex((line) => line.id === step.line);
    elements.operationLine.textContent = `Line ${String(lineIndex + 1).padStart(2, '0')}`;
    for (const line of elements.code.querySelectorAll<HTMLElement>('[data-code-line]')) {
      const active = line.dataset.codeLine === step.line;
      line.classList.toggle('is-current', active);
      if (active) line.setAttribute('aria-current', 'step');
      else line.removeAttribute('aria-current');
    }
    for (const counter of counterElements) {
      counter.total.value = String(step.counters[counter.key]);
      const change = step.delta[counter.key];
      counter.delta.textContent = change ? `+${change} this step` : 'No change';
      counter.delta.dataset.changed = String(change > 0);
    }
    renderTransport();
  }

  function renderDefinition() {
    const definition = algorithms[selected];
    elements.methodName.textContent = definition.name;
    elements.methodIntro.textContent = definition.introduction;
    elements.stability.textContent = definition.stable ? 'Stable on equal values' : 'Not stable on equal values';
    elements.regionLabel.textContent = definition.regionLabel;
    elements.regionNote.textContent = definition.regionNote;
    elements.register.hidden = selected !== 'insertion';
    elements.code.innerHTML = definition.pseudocode.map((line, index) => `
      <li data-code-line="${escapeMarkup(line.id)}"><span class="at-line-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><code>${escapeMarkup(line.text)}</code></li>
    `).join('');
    for (const radio of radios) radio.checked = radio.value === selected;
  }

  function renderScorecard() {
    elements.scoreArray.textContent = `[${appliedValues.join(', ')}]`;
    elements.scorecard.innerHTML = algorithmOrder.map((id) => {
      const trace = traceFor(id);
      const totals = trace.steps[trace.steps.length - 1].counters;
      return `<tr data-score-method="${id}"${id === selected ? ' class="is-selected"' : ''}>
        <th scope="row">${escapeMarkup(algorithms[id].name)}${id === selected ? '<span class="at-on-stage">On stage</span>' : ''}</th>
        <td>${totals.comparisons}</td><td>${totals.swaps}</td><td>${totals.writes}</td>
      </tr>`;
    }).join('');
  }

  function updateInputNote() {
    const dirty = elements.input.value !== appliedText;
    const preset = presets.find((item) =>
      item.values.length === appliedValues.length && item.values.every((value, index) => value === appliedValues[index]));
    elements.inputNote.textContent = dirty
      ? 'Unapplied draft. The stage and scorecard still use the last applied array.'
      : `On stage: ${preset?.name ?? 'Your array'} · ${appliedValues.length} values. Changing methods preserves this array.`;
    elements.inputNote.dataset.dirty = String(dirty);
  }

  function clearError() {
    elements.inputError.hidden = true;
    elements.inputError.textContent = '';
    elements.input.removeAttribute('aria-invalid');
  }

  function seek(position: number) {
    pausePlayback();
    cursor = Math.round(clamp(position, 0, lastStep()));
    renderStep();
    announce(`Paused. ${describeStep()}`);
  }

  function selectAlgorithm(id: AlgorithmId) {
    pausePlayback();
    selected = id;
    cursor = 0;
    renderDefinition();
    renderScorecard();
    renderStep();
    updateInputNote();
    announce(`${algorithms[id].name}, paused at the opening array. Your input is preserved.`);
  }

  function applyValues(values: readonly number[]) {
    pausePlayback();
    appliedValues = Object.freeze([...values]);
    appliedText = elements.input.value;
    recorded = recordAll(appliedValues);
    cursor = 0;
    clearError();
    renderScorecard();
    renderStep();
    updateInputNote();
    announce(`Applied ${values.length} values. ${algorithms[selected].name} is paused at step zero.`);
  }

  function togglePlayback() {
    if (playing) {
      pausePlayback();
      renderTransport();
      announce(`Paused. ${describeStep()}`);
    } else if (cursor < lastStep()) {
      playing = true;
      accumulated = 0;
      loop.setPaused(false);
      renderTransport();
      announce(`Playing ${algorithms[selected].name}. Choose Pause to inspect a step.`);
    }
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      const id = algorithmOrder.find((candidate) => candidate === radio.value);
      if (!id) throw new Error(`Unknown sorting method: ${radio.value}`);
      selectAlgorithm(id);
    }, events);
  }
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateInput(elements.input.value);
    if (!result.valid) {
      pausePlayback();
      renderTransport();
      elements.inputError.textContent = result.error;
      elements.inputError.hidden = false;
      elements.input.setAttribute('aria-invalid', 'true');
      elements.input.focus();
      page.report(result.error);
      return;
    }
    applyValues(result.values);
  }, events);
  elements.input.addEventListener('input', () => {
    pausePlayback();
    renderTransport();
    clearError();
    updateInputNote();
  }, events);
  elements.dataset.addEventListener('change', () => {
    const preset = presets.find((item) => item.id === elements.dataset.value);
    if (!preset) throw new Error(`Unknown sorting dataset: ${elements.dataset.value}`);
    elements.datasetNote.textContent = preset.note;
  }, events);
  elements.useDataset.addEventListener('click', () => {
    const preset = presets.find((item) => item.id === elements.dataset.value);
    if (!preset) throw new Error(`Unknown sorting dataset: ${elements.dataset.value}`);
    elements.input.value = preset.values.join(', ');
    applyValues(preset.values);
  }, events);
  elements.previous.addEventListener('click', () => seek(cursor - 1), events);
  elements.next.addEventListener('click', () => seek(cursor + 1), events);
  elements.restart.addEventListener('click', () => seek(0), events);
  elements.play.addEventListener('click', togglePlayback, events);
  elements.scrub.addEventListener('input', () => seek(Number(elements.scrub.value)), events);
  elements.tempo.addEventListener('change', () => {
    const next = Number(elements.tempo.value);
    if (![0.4, 0.9, 1.5].includes(next)) throw new RangeError('Choose one of the listed playback tempos.');
    pausePlayback();
    secondsPerStep = next;
    renderTransport();
    announce(`Tempo set to ${secondsPerStep} seconds per step. Paused; choose Play to continue.`);
  }, events);
  elements.stage.addEventListener('keydown', (event) => {
    if (event.target !== elements.stage || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(cursor - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(cursor + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seek(lastStep());
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
  }, events);
  elements.witness.addEventListener('click', () => {
    const preset = presets.find((item) => item.id === 'stability');
    if (!preset) return;
    elements.input.value = preset.values.join(', ');
    elements.dataset.value = preset.id;
    elements.datasetNote.textContent = preset.note;
    selectAlgorithm('selection');
    applyValues(preset.values);
    fieldNotes.close();
    inspectorTabs.select('array');
    elements.stage.focus({ preventScroll: true });
  }, events);

  renderDefinition();
  renderScorecard();
  updateInputNote();
  renderStep();
  return { destroy: page.destroy };
}
