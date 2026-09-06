import { escapeMarkup, query } from '../../core/page';
import type { ProjectedAttention } from './attention';
import { EMBEDDING_LIMIT, PRESETS, STAGES, TOKENS } from './data';
import type { Preset, StageId } from './data';
import {
  contributionEquation, dotEquation, heatColors, matrixMarkup, numberText,
  stageContent, vectorText, weightText,
} from './visuals';

export interface StudioState {
  preset: Preset;
  embeddings: number[][];
  result: ProjectedAttention;
  query: number;
  key: number;
  stage: StageId;
  challenge: boolean;
}

export function studioMarkup(): string {
  return `<div class="as-shell">
    <header class="as-masthead">
      <div>
        <div class="as-wordmark">
          <span class="as-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div><p class="as-eyebrow">An open notebook / No. 53</p><h1>Attention Studio</h1></div>
        </div>
        <p class="as-intro">A small head. Every number in view.</p>
      </div>
      <aside class="as-model-stamp" aria-label="Model scope">
        <strong>Hand-authored toy weights</strong><span>Untrained single head</span>
        <span class="as-stamp-dimensions">4 tokens · 3 features · 2D queries, keys &amp; values</span>
      </aside>
    </header>

    <div class="as-workbench" data-project-preview>
      <div class="as-toolbar">
        <label class="as-preset-field"><span>Experiment</span>
          <select data-preset-select aria-label="Experiment preset">
            ${PRESETS.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.title)}</option>`).join('')}
          </select>
        </label>
        <label class="as-mask-toggle"><input type="checkbox" data-causal aria-label="Causal mask"><span>Causal mask</span></label>
        <button class="as-reset" type="button" data-action="reset" aria-label="Reset preset" title="Reset the current preset">
          <span aria-hidden="true">↺</span><span class="as-reset-label">Reset</span>
        </button>
      </div>

      <div class="as-bench-grid">
        <section class="as-map-panel" aria-labelledby="as-map-title">
          <div class="as-panel-title"><h2 id="as-map-title">Who looks where?</h2><span class="as-math-tag">A <small>4 × 4</small></span></div>
          <div class="as-map-axis"><span>Queries ↓ &nbsp; Keys →</span><span>Normalized weights</span></div>
          <table class="as-heatmap" aria-label="Attention weights; select a query and key">
            <caption class="as-sr-only">Each query row distributes one unit of attention across key columns. Use the arrow keys inside the map.</caption>
            <thead><tr><th scope="col"><span class="as-sr-only">Query</span></th>
              ${TOKENS.map((token, index) => `<th scope="col"><span>${escapeMarkup(token)}</span><small>${index}</small></th>`).join('')}
            </tr></thead>
            <tbody>${TOKENS.map((token, row) => `<tr data-map-row="${row}">
              <th scope="row"><button type="button" class="as-row-select" data-query-row="${row}" aria-label="Select query ${escapeMarkup(token)}">${escapeMarkup(token)}<small>${row}</small></button></th>
              ${TOKENS.map((_, column) => `<td><button type="button" class="as-cell" data-cell-row="${row}" data-cell-key="${column}" tabindex="-1"><span data-cell-weight></span><small data-cell-mask hidden>masked</small></button></td>`).join('')}
            </tr>`).join('')}</tbody>
          </table>
          <div class="as-map-footer"><span class="as-color-key"><span>0</span><i aria-hidden="true"></i><span>1</span></span><span data-row-check></span></div>
          <p class="as-map-help">Select a square. Arrow keys explore the map.<br>Darker violet = a larger share, not more “understanding.”</p>
          <p class="as-route-goal" data-route-goal hidden></p>
        </section>

        <section class="as-input-panel" aria-labelledby="as-input-title">
          <div class="as-panel-title"><h2 id="as-input-title">Token embeddings</h2><span class="as-math-tag">X <small>4 × 3</small></span></div>
          <p class="as-editor-intro">Edit a coordinate. Follow the consequences.</p>
          <table class="as-input-table">
            <caption class="as-sr-only">Editable token embeddings X. Token order is ink, moss, sun, echo.</caption>
            <thead><tr><th scope="col">Token</th><th scope="col">e₁</th><th scope="col">e₂</th><th scope="col">e₃</th></tr></thead>
            <tbody>${TOKENS.map((token, row) => `<tr data-embedding-token="${row}"><th scope="row">${escapeMarkup(token)}</th>
              ${[0, 1, 2].map((column) => `<td><input type="number" step="any" min="-${EMBEDDING_LIMIT}" max="${EMBEDDING_LIMIT}" inputmode="decimal" autocomplete="off" data-embedding-row="${row}" data-embedding-column="${column}" aria-label="Embedding ${escapeMarkup(token)} e${column + 1}" aria-describedby="as-input-help"></td>`).join('')}
            </tr>`).join('')}</tbody>
          </table>
          <p id="as-input-help" class="as-input-help">Finite coordinates from −1,000 to 1,000. Words are labels, not learned meanings.</p>
          <p class="as-input-feedback" data-input-feedback role="status" aria-live="polite"></p>
          <p class="as-preset-note" data-preset-description></p>
        </section>
      </div>

      <div class="as-selection-bar"><span>Following <strong data-pair-name></strong></span><span class="as-selection-weight" data-pair-weight></span></div>
      <nav class="as-pipeline" aria-label="Attention pipeline stages">
        <ol>${STAGES.map((stage, index) => `<li><button type="button" data-step="${stage.id}" aria-pressed="false"><span class="as-step-number">${String(index + 1).padStart(2, '0')}</span><span class="as-step-name">${stage.label}</span><span class="as-step-symbol" aria-hidden="true">${stage.symbol}</span></button></li>`).join('')}</ol>
      </nav>

      <div class="as-trace-grid">
        <section class="as-stage-note" aria-labelledby="as-stage-heading">
          <p class="as-eyebrow" data-stage-label></p>
          <h2 id="as-stage-heading" data-stage-heading></h2>
          <p class="as-stage-explanation" data-stage-explanation></p>
          <div class="as-stage-calculation" data-stage-calculation></div>
        </section>
        <section class="as-output-card" aria-labelledby="as-output-title">
          <div class="as-output-top"><span class="as-eyebrow">The result / O = AV</span><span class="as-output-icon" aria-hidden="true">Σ</span></div>
          <h2 id="as-output-title" data-output-title></h2>
          <p class="as-output-dimensions">One row · two coordinates</p>
          <output class="as-output-vector" data-selected-output></output>
          <div class="as-mixture" aria-hidden="true">${TOKENS.map((_, key) => `<i data-mixture-key="${key}"></i>`).join('')}</div>
          <ul class="as-mixture-key">${TOKENS.map((token, key) => `<li><i data-token-color="${key}" aria-hidden="true"></i>${escapeMarkup(token)}</li>`).join('')}</ul>
          <p>The weighted sum of <em>all</em> allowed value vectors. Not a next-word prediction.</p>
        </section>
      </div>

      <div class="as-pair-grid">
        <section><h3>The selected dot product</h3><p class="as-equation" data-dot-equation></p><p class="as-detail-caption" data-dot-caption></p></section>
        <section><h3>This key’s contribution</h3><p class="as-equation" data-contribution-equation></p><p class="as-detail-caption" data-contribution-caption></p></section>
      </div>
      <p class="as-rounding-note">Values shown are rounded; calculations use Float64. Hover a matrix number for full precision. The map always shows A, whichever stage you inspect.</p>
    </div>

    <section class="as-projections" aria-labelledby="as-projections-title">
      <div class="as-section-heading"><div><p class="as-eyebrow">Open the notebook</p><h2 id="as-projections-title">Nothing behind the curtain.</h2></div><p>Row vectors, right-multiplied.<br><span class="as-inline-math">(4 × 3)(3 × 2) → 4 × 2</span></p></div>
      <p class="as-observation" data-preset-observation></p>
      <div class="as-projection-grid">
        ${[
          { id: 'q', letter: 'Q', name: 'Queries', role: 'What this row looks for.' },
          { id: 'k', letter: 'K', name: 'Keys', role: 'What each position offers to match.' },
          { id: 'v', letter: 'V', name: 'Values', role: 'What actually enters the mixture.' },
        ].map((item) => `<article class="as-projection-card" data-projection="${item.id}">
          <header><h3><span>${item.letter}</span>${item.name}</h3><p>${item.role}</p></header>
          <div data-projection-matrix="${item.id}"></div>
          <p class="as-projection-rule">${item.letter} = XW${item.id}<span>↓</span></p>
          <div data-projected-matrix="${item.id}"></div>
        </article>`).join('')}
      </div>
      <details class="as-ledger">
        <summary>All scores &amp; output rows <span>Inspect the full ledger</span></summary>
        <div class="as-ledger-grid"><div data-dot-matrix></div><div data-score-matrix></div><div data-output-matrix></div></div>
        <p>S = QKᵀ / √2. The mask, when on, replaces future S entries with −∞. Each output is a vector in value space; there is no output projection Wₒ in this notebook.</p>
      </details>
    </section>

    <section class="as-challenge" aria-labelledby="as-challenge-title">
      <div><p class="as-eyebrow">A small challenge / change one number</p><h2 id="as-challenge-title">Let moss steal the spotlight.</h2>
        <p>Starting from Similarity pairs, send at least <strong>80%</strong> of ink’s attention to moss. Change an embedding, not a weight matrix. Keep the causal mask off.</p>
        <details class="as-hint"><summary>A nudge, not the answer</summary><p>Keep ink at [2, 0, 1]. Increase moss’s e₁ toward 4. Its key gets longer along ink’s query direction, so their dot product grows. Why can e₃ change the output but not help this goal?</p></details>
      </div>
      <div class="as-challenge-control"><span class="as-challenge-target">ink → moss</span><strong data-challenge-percent>—</strong>
        <progress data-challenge-progress max="1" value="0" aria-label="Ink attention to moss"></progress>
        <p data-challenge-status role="status" aria-live="polite">Load the starting values and make a prediction.</p>
        <button type="button" class="as-primary" data-action="challenge">Start routing challenge</button>
      </div>
    </section>

    <footer class="as-notes">
      <section><h2>A head, not an oracle.</h2><p>This is an <strong>untrained single head with hand-authored toy weights</strong>, not learned semantic intelligence or a production LLM. There is no tokenizer, training, multi-head stack, residual block, or text generation. Everything runs locally; edits are not saved.</p></section>
      <section><h2>The actual equation.</h2><p class="as-reference-equation">Attention(Q, K, V) = softmax(QKᵀ / √dₖ + mask)V</p><p>Adapted from the scaled dot-product attention in <a href="https://arxiv.org/abs/1706.03762" target="_blank" rel="noopener noreferrer">Vaswani et al., <cite>Attention Is All You Need</cite> (2017), §3.2.1 ↗</a>. Toy vectors, presets, and exercises are original to this notebook.</p></section>
      <details class="as-limits"><summary>Numerical limits &amp; conventions</summary><p>Embeddings are bounded to ±1,000 in the editor; preset projection weights have magnitude at most 2. The pure engine accepts finite Float64 inputs and rejects malformed dimensions or arithmetic overflow. Softmax subtracts the largest allowed score, so even very large finite logits are supported. Extremely small exponentials may underflow to exactly zero. All-masked rows are rejected; a causal row always retains its own position. No vector normalization, biases, dropout, or output projection is applied. Printed decimals are approximations, not additional rounding inside the calculation.</p></details>
    </footer>
  </div>`;
}

export function syncEmbeddingInputs(root: HTMLElement, state: StudioState): void {
  root.querySelectorAll<HTMLInputElement>('[data-embedding-row]').forEach((input) => {
    const row = Number(input.dataset.embeddingRow);
    const column = Number(input.dataset.embeddingColumn);
    input.value = String(state.embeddings[row][column]);
    input.title = `Original ${state.preset.title}: ${state.preset.embeddings[row][column]}`;
    input.removeAttribute('aria-invalid');
  });
  query(root, '[data-input-feedback]').textContent = '';
}

export function renderStudio(root: HTMLElement, state: StudioState): void {
  const { result, query: selectedQuery, key: selectedKey, preset } = state;
  root.dataset.pipelineStage = state.stage;
  root.dataset.preset = preset.id;
  root.dataset.causal = String(result.causal);
  root.dataset.challenge = String(state.challenge);
  query<HTMLSelectElement>(root, '[data-preset-select]').value = preset.id;
  query<HTMLInputElement>(root, '[data-causal]').checked = result.causal;
  query(root, '[data-preset-description]').textContent = preset.description;
  query(root, '[data-preset-observation]').textContent = preset.observation;
  root.querySelectorAll<HTMLElement>('[data-map-row]').forEach((row) => {
    row.dataset.selected = String(Number(row.dataset.mapRow) === selectedQuery);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-query-row]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.queryRow) === selectedQuery));
  });
  root.querySelectorAll<HTMLElement>('[data-embedding-token]').forEach((row) => {
    row.dataset.selected = String(Number(row.dataset.embeddingToken) === selectedQuery);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-cell-row]').forEach((button) => {
    const row = Number(button.dataset.cellRow);
    const key = Number(button.dataset.cellKey);
    const weight = result.weights[row][key];
    const masked = result.causal && key > row;
    const selected = row === selectedQuery && key === selectedKey;
    const colors = heatColors(weight);
    button.style.setProperty('--as-cell-bg', colors.background);
    button.style.setProperty('--as-cell-ink', colors.foreground);
    button.dataset.weight = String(weight);
    button.dataset.masked = String(masked);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Query ${TOKENS[row]}, key ${TOKENS[key]}: ${masked ? 'masked, ' : ''}weight ${weight}`);
    button.title = `Q·K = ${result.dotProducts[row][key]}; /√2 = ${result.scores[row][key]}; weight = ${weight}${masked ? ' (future key)' : ''}`;
    button.tabIndex = selected ? 0 : -1;
    query(button, '[data-cell-weight]').textContent = weightText(weight);
    query<HTMLElement>(button, '[data-cell-mask]').hidden = !masked;
  });
  const sums = result.weights.map((row) => row.reduce((sum, value) => sum + value, 0));
  const rowCheck = query<HTMLElement>(root, '[data-row-check]');
  rowCheck.textContent = `Each row sums to ${sums[selectedQuery].toFixed(6)}`;
  rowCheck.title = TOKENS.map((token, index) => `${token}: ${sums[index]}`).join(' · ');
  rowCheck.dataset.sums = JSON.stringify(sums);
  query(root, '[data-pair-name]').textContent = `query ${TOKENS[selectedQuery]} → key ${TOKENS[selectedKey]}`;
  query(root, '[data-pair-weight]').textContent = `${(result.weights[selectedQuery][selectedKey] * 100).toFixed(2)}% of this row`;
  root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.step === state.stage));
  });
  const stageIndex = STAGES.findIndex((stage) => stage.id === state.stage);
  const content = stageContent(state.stage, result, preset, selectedQuery, selectedKey);
  query(root, '[data-stage-label]').textContent = `Step ${String(stageIndex + 1).padStart(2, '0')} / ${STAGES[stageIndex].label}`;
  query(root, '[data-stage-heading]').textContent = content.heading;
  query(root, '[data-stage-explanation]').textContent = content.explanation;
  query(root, '[data-stage-calculation]').innerHTML = content.calculation;
  query(root, '[data-output-title]').textContent = `Output for ${TOKENS[selectedQuery]}`;
  const output = query<HTMLOutputElement>(root, '[data-selected-output]');
  output.textContent = vectorText(result.outputs[selectedQuery]);
  output.setAttribute('aria-label', `Output vector for query ${TOKENS[selectedQuery]}`);
  output.dataset.values = JSON.stringify(result.outputs[selectedQuery]);
  root.querySelectorAll<HTMLElement>('[data-mixture-key]').forEach((segment) => {
    segment.style.width = `${result.weights[selectedQuery][Number(segment.dataset.mixtureKey)] * 100}%`;
  });
  query(root, '[data-dot-equation]').textContent = dotEquation(result, selectedQuery, selectedKey);
  query(root, '[data-dot-caption]').textContent = `Divide by √2 → scaled score ≈ ${numberText(result.scores[selectedQuery][selectedKey], 6)}.`;
  query(root, '[data-contribution-equation]').textContent = contributionEquation(result, selectedQuery, selectedKey);
  query(root, '[data-contribution-caption]').textContent = result.causal && selectedKey > selectedQuery
    ? 'This future key contributes exactly [0, 0]. Its value vector still exists.'
    : `Weight × v_${TOKENS[selectedKey]}. Add the other keys’ contributions to complete the output.`;

  for (const projection of ['q', 'k', 'v']) {
    const weights = projection === 'q' ? result.projections.q : projection === 'k' ? result.projections.k : result.projections.v;
    const projected = projection === 'q' ? result.queries : projection === 'k' ? result.keys : result.values;
    const columns = [`${projection}₁`, `${projection}₂`];
    query(root, `[data-projection-matrix="${projection}"]`).innerHTML = matrixMarkup(weights, `W${projection} · 3 × 2 · read-only`, ['e₁', 'e₂', 'e₃'], columns);
    query(root, `[data-projected-matrix="${projection}"]`).innerHTML = matrixMarkup(projected, `${projection.toUpperCase()} · 4 × 2`, TOKENS, columns, projection === 'q' ? selectedQuery : selectedKey);
  }
  query(root, '[data-dot-matrix]').innerHTML = matrixMarkup(result.dotProducts, 'QKᵀ · dot products · 4 × 4', TOKENS, TOKENS, selectedQuery);
  query(root, '[data-score-matrix]').innerHTML = matrixMarkup(result.maskedScores, `S + mask · mask ${result.causal ? 'on' : 'off'} · 4 × 4`, TOKENS, TOKENS, selectedQuery);
  query(root, '[data-output-matrix]').innerHTML = matrixMarkup(result.outputs, 'O = AV · all output rows · 4 × 2', TOKENS, ['o₁', 'o₂'], selectedQuery);

  const challengeWeight = result.weights[0][1];
  const solved = state.challenge && !result.causal && challengeWeight >= 0.8;
  const challengeMessage = !state.challenge ? 'Load the starting values and make a prediction.'
    : result.causal ? 'Moss is a future key for ink. Turn the causal mask off to route attention there.'
      : solved ? 'Route found! At least 80% reaches moss. Now try e₃: does the map change?'
        : 'Aim for 80%. Try changing moss’s first coordinate; watch ink’s row.';
  query(root, '[data-challenge-percent]').textContent = state.challenge ? `${(challengeWeight * 100).toFixed(1)}%` : '—';
  query<HTMLProgressElement>(root, '[data-challenge-progress]').value = state.challenge ? challengeWeight : 0;
  const challengeStatus = query<HTMLElement>(root, '[data-challenge-status]');
  if (challengeStatus.textContent !== challengeMessage) challengeStatus.textContent = challengeMessage;
  root.dataset.challengeSolved = String(solved);
  query(root, '[data-action="challenge"]').textContent = state.challenge ? 'Restart routing challenge' : 'Start routing challenge';
  const routeGoal = query<HTMLElement>(root, '[data-route-goal]');
  routeGoal.hidden = !state.challenge;
  routeGoal.textContent = `Challenge: ink → moss ${(challengeWeight * 100).toFixed(1)}% / goal 80%${solved ? ' · route found ✓' : ''}`;
}
