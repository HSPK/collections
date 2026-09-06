import { escapeMarkup } from '../../core/page';
import { CORPORA, PRESETS } from './data';
import type { Corpus } from './data';
import type { DecoderSettings, GenerationSession, GenerationStep } from './engine';
import { decimal, percent } from './graphics';
import { END, joinTokens, readableToken, tokenize } from './model';

export const arrow = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.5"/></svg>';
const rewind = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 3-5 5 5 5M3 8h8a5 5 0 0 1 0 10" stroke="currentColor" stroke-width="1.5"/></svg>';

export function settingsText(settings: DecoderSettings, seed: number): string {
  const policy = settings.mode === 'greedy' || settings.temperature === 0 ? 'greedy · filters bypassed' : 'seeded sampling';
  return `${policy} · T ${decimal(settings.temperature, 2)} · k ${settings.topK || 'all'} · p ${decimal(settings.topP, 2)} · seed ${seed}`;
}

export function siteMarkup(): string {
  return `
    <div class="dl-shell">
      <header class="dl-masthead">
        <div class="dl-masthead-top">
          <p class="dl-eyebrow"><svg class="dl-brand-mark" viewBox="0 0 31 28" aria-hidden="true"><path d="M1 1h8v26H1zM12 7h8v20h-8zM23 15h7v12h-7z" fill="currentColor"/></svg>A field guide to the next token</p>
          <span class="dl-edition">Lab notes / 054</span>
        </div>
        <div class="dl-title-row">
          <div><h1>Decoding Lab<span aria-hidden="true">.</span></h1><p class="dl-intro">A little press for the next word. Turn logits into probabilities, then print one token at a time.</p></div>
          <div class="dl-model-stamp"><span>Fitted counts</span><strong>Not a neural LLM</strong><span>Local · inspectable · no API</span></div>
        </div>
      </header>

      <section class="dl-workbench" data-project-preview aria-label="Interactive decoding workbench">
        <div class="dl-workbench-top">
          <p class="dl-eyebrow"><span class="dl-live-dot" aria-hidden="true"></span>The decoding press</p>
          <div class="dl-presets" role="group" aria-label="Repeatable presets">
            ${PRESETS.map((preset, index) => `<button type="button" data-preset="${preset.id}" aria-pressed="${preset.id === 'narrow'}"><span>0${index + 1}</span>${escapeMarkup(preset.title)}</button>`).join('')}
          </div>
        </div>
        <div class="dl-transport" role="group" aria-label="Generation controls">
          <button type="button" class="dl-primary" data-action="step">Print 1 token ${arrow}</button>
          <button type="button" class="dl-batch" data-action="batch">Print up to 5</button>
          <button type="button" data-action="backtrack">${rewind}Backtrack</button>
          <button type="button" data-action="reset">Reset run</button>
        </div>
        <div class="dl-machine-grid">
          <section class="dl-settings" aria-labelledby="dl-settings-heading">
            <div class="dl-panel-heading"><span class="dl-section-number">01</span><h2 id="dl-settings-heading">Set the type</h2></div>
            <label class="dl-field" for="dl-corpus"><span>Training corpus</span><select id="dl-corpus">
              ${CORPORA.map((corpus) => `<option value="${corpus.id}">${escapeMarkup(corpus.title)}</option>`).join('')}
            </select></label>
            <label class="dl-field" for="dl-start"><span>Starting context</span><select id="dl-start"></select></label>
            <label class="dl-field" for="dl-policy"><span>Selection policy</span><select id="dl-policy">
              <option value="sample">Seeded sampling</option><option value="greedy">Greedy · argmax</option>
            </select></label>
            <label class="dl-field" for="dl-seed"><span>Random seed <small>32-bit integer</small></span>
              <input id="dl-seed" type="number" min="0" max="4294967295" step="1" value="42" inputmode="numeric" autocomplete="off" aria-describedby="dl-seed-help">
            </label>
            <p class="dl-small dl-seed-help" id="dl-seed-help">Same settings + seed = same run.</p>
            <div class="dl-setting-rule"></div>
            <label class="dl-field dl-slider-field" for="dl-temperature">
              <span>Temperature <output for="dl-temperature" data-temperature-value>1.00</output></span>
              <input id="dl-temperature" type="range" min="0" max="4" step="0.05" value="1" aria-describedby="dl-temperature-help">
            </label>
            <p class="dl-small" id="dl-temperature-help">Lower = sharper. Higher = flatter.<br>0 is an explicit greedy policy.</p>
            <label class="dl-field" for="dl-top-k"><span>Top-k <small>candidate cap</small></span><select id="dl-top-k"></select></label>
            <label class="dl-field dl-slider-field" for="dl-top-p">
              <span>Top-p <output for="dl-top-p" data-top-p-value>0.90</output></span>
              <input id="dl-top-p" type="range" min="0" max="1" step="0.01" value="0.9" aria-describedby="dl-top-p-help">
            </label>
            <p class="dl-small" id="dl-top-p-help">Smallest sorted prefix reaching p, after top-k renormalization.</p>
            <p class="dl-control-note" data-policy-note></p>
            <p class="dl-reset-note">Changing any setting clears the current run and restores the seed. A pinned proof stays.</p>
          </section>

          <section class="dl-distribution" aria-labelledby="dl-distribution-heading">
            <div class="dl-panel-heading"><span class="dl-section-number">02</span><h2 id="dl-distribution-heading">The probability bed</h2></div>
            <div class="dl-distribution-mode"><span data-view-label>Live · next token</span><button type="button" data-action="live" hidden>Return to live ${arrow}</button></div>
            <div class="dl-context-line"><span>Given</span><code data-chart-context>the</code><span class="dl-context-arrow" aria-hidden="true">→</span><strong>?</strong></div>
            <p class="dl-context-note" data-context-note></p>
            <dl class="dl-meters" aria-label="Distribution measurements">
              <div><dt>Base entropy</dt><dd><span data-base-entropy></span><small>nats</small></dd></div>
              <div><dt>Final entropy</dt><dd><span data-final-entropy></span><small>nats</small></dd></div>
              <div><dt>Kept tokens</dt><dd data-kept-count></dd></div>
            </dl>
            <div class="dl-chart-legend"><span><i class="dl-legend-base" aria-hidden="true"></i>Base · T = 1</span><span><i class="dl-legend-final" aria-hidden="true"></i>Final · after policy</span></div>
            <div data-distribution></div>
            <p class="dl-chart-caption">Both bars use the same 0–100% scale. Cut tokens stay visible, with final probability 0. Values are rounded for display.</p>
            <div class="dl-draw-area"><p class="dl-eyebrow">The draw, laid flat</p><div data-draw-strip></div></div>
          </section>

          <section class="dl-paper" aria-labelledby="dl-paper-heading">
            <div class="dl-panel-heading"><span class="dl-section-number">03</span><h2 id="dl-paper-heading">The paper trail</h2></div>
            <div class="dl-paper-topline"><span data-run-state>Ready to print</span><span data-step-count>00 / 24</span></div>
            <div class="dl-output-paper">
              <p class="dl-eyebrow">Context + generated tokens</p>
              <p class="dl-output" data-output></p>
              <p class="dl-output-empty" data-output-empty>No ink yet. Print a token to begin.</p>
              <span class="dl-end-stamp" data-end-label hidden></span>
            </div>
            <p class="dl-small dl-bound-note">No autoplay. Stops at END or 24 generated tokens. Backtrack restores context <em>and</em> RNG state.</p>
            <section class="dl-impression" aria-label="Chosen token measurements">
              <p class="dl-eyebrow" data-record-heading>Last impression</p>
              <div data-choice-record><p class="dl-small">Every chosen token leaves a probability receipt here.</p></div>
            </section>
            <div class="dl-history-heading"><h3>Token history</h3><span>Click to inspect</span></div>
            <ol class="dl-history" data-history aria-label="Chosen token history"></ol>
            <p class="dl-sequence-log" data-sequence-log></p>
            <button type="button" class="dl-pin-button" data-action="pin">Pin run for comparison <span aria-hidden="true">+</span></button>
          </section>
        </div>
        <ol class="dl-pipeline" aria-label="Filter order">
          <li><span>01 / SOURCE</span><strong>ln(count + 0.25)</strong><small>Fitted here, not supplied scores</small></li>
          <li><span>02 / SCALE</span><strong data-pipeline-temperature></strong><small>Stable softmax, or explicit argmax</small></li>
          <li><span>03 / FILTER</span><strong data-pipeline-k></strong><small data-pipeline-k-mass></small></li>
          <li><span>04 / FILTER</span><strong data-pipeline-p></strong><small data-pipeline-p-mass></small></li>
          <li><span>05 / SELECT</span><strong data-pipeline-policy></strong><small>Append token → new context</small></li>
        </ol>
        <p class="dl-preset-note" data-preset-note></p>
        <p class="dl-feedback" data-feedback role="status" aria-live="polite" aria-atomic="true"></p>
      </section>

      <section class="dl-proof" data-proof hidden aria-labelledby="dl-proof-heading">
        <div><p class="dl-eyebrow">Pinned proof · held in this tab only</p><h2 id="dl-proof-heading">One run, kept for comparison.</h2></div>
        <div data-proof-content></div>
        <button type="button" data-action="clear-proof">Clear pinned proof</button>
      </section>

      <section class="dl-source-section" aria-labelledby="dl-source-heading">
        <div class="dl-section-heading">
          <div><p class="dl-eyebrow">Open the type drawer</p><h2 id="dl-source-heading">Nothing hidden in the counts.</h2></div>
          <p>This is a genuinely fitted local <strong>bigram count model</strong>: count which token followed which. No neural training, pretrained weights, or ChatGPT behind the page.</p>
        </div>
        <div class="dl-source-grid">
          <article class="dl-corpus-sheet">
            <div class="dl-source-title"><h3 data-corpus-title></h3><span class="dl-small">Original corpus</span></div>
            <p data-corpus-description></p>
            <ol class="dl-corpus-lines" data-corpus-lines aria-label="Complete training corpus"></ol>
            <p class="dl-small" data-model-facts></p>
            <div class="dl-tokenizer-note"><strong>What counts as a token?</strong><p>Lowercase English words (including internal apostrophes) and <code>. , ! ? ; :</code> are separate tokens. Each line starts at START and gets one END token. Lines never join during fitting.</p></div>
            <h3>The entire output inventory</h3>
            <div class="dl-inventory" data-inventory aria-label="Output token inventory"></div>
            <p class="dl-small">Printed in tie-break order: punctuation, then words in lexical order, then END. START is context-only, never an output. The inventory cannot grow during generation.</p>
          </article>
          <article class="dl-count-sheet">
            <h3>From observations to logits</h3>
            <div class="dl-formula"><code>z(t) = ln(c(previous, t) + 0.25)</code><code>Pbase(t) = (c + 0.25) / (N + 0.25 × V)</code></div>
            <p class="dl-small">Add-0.25 smoothing gives every output token a positive score. N is this context’s total count; V is the inventory size. “ln” and all entropy/log-probability readouts use natural logs.</p>
            <label class="dl-field" for="dl-count-context"><span>Inspect fitted context</span><select id="dl-count-context"></select></label>
            <p class="dl-small">This inspector does not change the run.</p>
            <div data-count-table></div>
            <p class="dl-count-explanation" data-count-explanation></p>
          </article>
        </div>
      </section>

      <section class="dl-comparison-guide" aria-labelledby="dl-comparison-heading">
        <div class="dl-section-heading"><div><p class="dl-eyebrow">A repeatable experiment</p><h2 id="dl-comparison-heading">Same seed. Different impression.</h2></div><p>Each preset returns to the printshop, context “the”, seed 42. Nothing prints automatically.</p></div>
        <div class="dl-experiment-cards">${PRESETS.map((preset, index) => `
          <article><span class="dl-section-number">0${index + 1}</span><h3>${escapeMarkup(preset.title)}</h3><p>${escapeMarkup(preset.note)}</p><button type="button" data-preset="${preset.id}">Load ${escapeMarkup(preset.title)} ${arrow}</button></article>
        `).join('')}</div>
        <p class="dl-challenge"><strong>Try this:</strong> load Open tray, print up to 5, and pin the run. Load Narrow gate and print again. Compare tokens and probabilities. Then backtrack and reprint: the exact draw should return. A shared seed does not guarantee the same word when the distribution changes.</p>
      </section>

      <section class="dl-field-notes" aria-labelledby="dl-notes-heading">
        <div><p class="dl-eyebrow">Beyond this little press</p><h2 id="dl-notes-heading">The mechanism is real.<br>The model is tiny.</h2></div>
        <div class="dl-notes-grid">
          <article><h3>Where this meets LLMs</h3><p>Neural language models also produce a logit for each possible next token. Temperature, top-k, top-p, renormalization, and a categorical draw are common decoding tools after those logits. Here, log-counts replace the neural network so every input score is inspectable. Real systems may use other filters and different orders.</p></article>
          <article><h3>Autoregressive, one token at a time</h3><p>Each chosen token is appended, and the model scores the next step again. This bigram uses <em>only the last token</em>, not the meaning or the full sentence. Neural LLMs can condition on much longer contexts. A full stop is a token; END is the separate signal that actually stops this run.</p></article>
          <article><h3>What a filter really does</h3><p>For T &gt; 0, softmax uses (z − max z) / T. We keep the k highest probabilities, renormalize, keep the smallest descending prefix with mass ≥ p, then renormalize again. k = all and p = 1 disable their filters; p = 0 keeps one. T = 0 or Greedy bypasses both filters and selects the first argmax with probability 1, without using the seed.</p></article>
          <article><h3>No understanding is being claimed</h3><p>There is no conversation, instruction-following, factual knowledge, or neural generalization here. An unseen previous token gets a uniform distribution from smoothing. Familiar words can still form off-corpus, nonsensical lines. Higher temperature is not “more creative intelligence”; entropy measures uncertainty, not quality.</p></article>
        </div>
      </section>
      <footer class="dl-footer"><span>Decoding Lab / a small, open probability press</span><span>Original text · local counts · no saved or uploaded input</span></footer>
    </div>`;
}

export function outputMarkup(session: GenerationSession): string {
  const initial = joinTokens(tokenize(session.start));
  const generated = joinTokens(session.history.map((step) => step.token));
  return `<span class="dl-start-text">${escapeMarkup(initial || 'START')}</span>${generated ? `<span class="dl-generated-text" data-generated-text>${escapeMarkup(generated)}</span>` : ''}`;
}

export function historyMarkup(session: GenerationSession, inspected: number | null): string {
  return session.history.map((step, index) => `<li><button type="button" data-inspect-step="${index}" aria-pressed="${index === inspected}"
    aria-label="Inspect step ${step.number}: ${escapeMarkup(readableToken(step.token))}" title="Final probability ${escapeMarkup(percent(step.probability, 2))}">
    <span>${String(step.number).padStart(2, '0')}</span><code>${escapeMarkup(readableToken(step.token))}</code>
  </button></li>`).join('');
}

export function choiceMarkup(step: GenerationStep | null): string {
  if (!step) return '<p class="dl-small">Every chosen token leaves a probability receipt here.</p>';
  return `
    <div class="dl-chosen-token"><code data-chosen-token>${escapeMarkup(readableToken(step.token))}</code><span>step ${String(step.number).padStart(2, '0')}</span></div>
    <dl class="dl-choice-metrics">
      <div><dt>Base P(token)</dt><dd data-chosen-base>${escapeMarkup(percent(step.baseProbability, 2))}</dd></div>
      <div><dt>Final q(token)</dt><dd data-chosen-probability data-value="${step.probability}">${escapeMarkup(percent(step.probability, 2))}</dd></div>
      <div><dt>ln q(token)</dt><dd data-chosen-logprob>${decimal(step.logProbability, 4)}</dd></div>
      <div><dt>Final entropy</dt><dd>${decimal(step.distribution.entropy)} nats</dd></div>
      <div><dt>Random draw u</dt><dd data-random-draw>${step.uniform === null ? 'Not used' : decimal(step.uniform, 6)}</dd></div>
    </dl>
    <p class="dl-small">Given <code>${escapeMarkup(readableToken(step.source.context))}</code>${step.token === END ? ' · END was selected, so this line stops.' : ` → context becomes ${escapeMarkup(step.token)}.`}</p>`;
}

export function proofMarkup(session: GenerationSession, corpus: Corpus): string {
  const output = joinTokens([...tokenize(session.start), ...session.history.map((step) => step.token)]);
  const logProbability = session.history.reduce((sum, step) => sum + step.logProbability, 0);
  return `
    <p class="dl-proof-settings">${escapeMarkup(corpus.title)} · context “${escapeMarkup(session.start || 'START')}”<br>${escapeMarkup(settingsText(session.settings, session.seed))}</p>
    <p class="dl-proof-output">${escapeMarkup(output)}${session.end === 'end-token' ? ' ⟨END⟩' : ''}</p>
    <p class="dl-small">${session.history.length} generated tokens · Σ ln q = ${decimal(logProbability, 4)}${session.end === 'token-limit' ? ' · 24-token safety limit' : ''}. This proof keeps its own settings when the live run changes.</p>`;
}
