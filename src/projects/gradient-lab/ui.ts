import { escapeMarkup, query } from '../../core/page';
import { CHALLENGES, getOptimizer, OPTIMIZERS, SURFACES } from './data';
import type { Surface } from './data';
import { magnitude, MAX_ITERATIONS, MAX_LEARNING_RATE, MIN_LEARNING_RATE } from './engine';
import type { Method, OptimizerRun, Point, RunStatus } from './engine';

export interface ViewModel {
  surface: Surface;
  start: Point;
  runs: readonly OptimizerRun[];
  selected: Method;
  learningRate: number;
  round: number;
  runNumber: number;
  paused: boolean;
  reducedMotion: boolean;
  setupName: string;
  challengeNote: string;
}

export function formatNumber(value: number): string {
  if (value === 0) return '0.0000';
  if (Math.abs(value) < 0.0001 || Math.abs(value) >= 10000) return value.toExponential(4);
  return value.toFixed(4);
}

const vector = (point: Point): string => `(${formatNumber(point.x)}, ${formatNumber(point.y)})`;
const statusNames: Record<RunStatus, string> = {
  active: 'In bounds',
  stationary: 'Stationary',
  'out-of-view': 'Out of view',
  diverged: 'Safety stop',
  limit: 'Limit reached',
};

export function createInterface(root: HTMLElement) {
  root.setAttribute('aria-labelledby', 'gradient-lab-title');
  root.innerHTML = `
    <div class="gl-shell">
      <header class="gl-header">
        <div class="gl-identity">
          <svg class="gl-mark" viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="24" cy="25" rx="21" ry="15"/><ellipse cx="24" cy="25" rx="14" ry="10"/>
            <ellipse cx="24" cy="25" rx="7" ry="5"/><path d="M8 8 22 23m-7-1 7 1-1-7"/>
          </svg>
          <div><p class="gl-eyebrow">Field notes 052 / AI education</p><h1 id="gradient-lab-title">Gradient Lab<span aria-hidden="true">.</span></h1></div>
        </div>
        <p class="gl-deck">One landscape. Three ways downhill.<br><span>See what a learning rate really changes.</span></p>
      </header>

      <section class="gl-workbench" aria-label="Interactive optimizer workbench" data-project-preview>
        <div class="gl-map-panel">
          <div class="gl-panel-heading">
            <div><span class="gl-eyebrow">01 / The loss landscape</span><h2 data-surface-title>Anisotropic bowl</h2></div>
            <span class="gl-compute-stamp"><i aria-hidden="true"></i>Computed here</span>
          </div>
          <div class="gl-landscape" data-landscape></div>
          <div class="gl-map-caption" id="gl-map-help">
            <span><b>∇L</b> arrows point uphill; white = selected. Lengths are normalized.</span>
            <span>Click the map to set a new start, or edit x / y.</span>
          </div>

          <div class="gl-comparison">
            <div class="gl-comparison-heading"><span class="gl-eyebrow">Three live paths</span><span>Select one to inspect ↓</span></div>
            <div class="gl-methods" aria-label="Inspect an optimizer">
              ${OPTIMIZERS.map((optimizer) => `
                <button type="button" class="gl-method gl-method-${optimizer.id}" data-method="${optimizer.id}" aria-pressed="${optimizer.id === 'gd'}" aria-label="Inspect ${escapeMarkup(optimizer.name)}">
                  <span class="gl-method-name"><i class="gl-path-key" aria-hidden="true"></i>${escapeMarkup(optimizer.shortName)}</span>
                  <span class="gl-method-loss" data-card-loss></span>
                  <span class="gl-method-position" data-card-position></span>
                  <span class="gl-method-status" data-card-status>t = 0 · Ready</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="gl-transport">
            <div class="gl-transport-actions">
              <button class="gl-primary" type="button" data-step><span aria-hidden="true">＋</span> Step all</button>
              <button type="button" data-play><span data-play-icon aria-hidden="true">▶</span> <span data-play-label>Play all</span></button>
              <button class="gl-quiet" type="button" data-reset>Reset</button>
            </div>
            <div class="gl-transport-meta">
              <label class="gl-speed" for="gl-speed">Pace
                <select id="gl-speed" aria-label="Playback speed"><option value="1">1 / sec</option><option value="4" selected>4 / sec</option><option value="12">12 / sec</option></select>
              </label>
              <p class="gl-round">Round <output data-round aria-live="off">000</output><span>/ ${MAX_ITERATIONS}</span></p>
            </div>
          </div>
          <div class="gl-feedback-row">
            <p data-feedback role="status">Paused at t = 0. Make a prediction, then take one real step.</p>
            <span data-motion-note>No autoplay · local calculation</span>
          </div>
          <p class="gl-stop-notice" data-stop-notice hidden></p>

          <section class="gl-history" aria-label="Actual loss history">
            <div class="gl-history-heading"><h3>Loss, not a score.</h3><span class="gl-eyebrow">Actual samples</span></div>
            <div class="gl-loss-plot" data-loss-plot></div>
            <p class="gl-help">Signed-log loss axis, auto-fit vertically. Tick labels are raw loss; t counts accepted updates. Negative losses are kept.</p>
            <div class="gl-history-tools">
              <details class="gl-samples">
                <summary>Inspect recent samples</summary>
                <table>
                  <caption data-samples-caption>Gradient descent · last 6 accepted samples, including t = 0 when present</caption>
                  <thead><tr><th scope="col">t</th><th scope="col">x</th><th scope="col">y</th><th scope="col">Loss</th></tr></thead>
                  <tbody data-sample-rows></tbody>
                </table>
                <p class="gl-help">Readouts are rounded. The CSV keeps full numerical precision and every method’s complete history.</p>
              </details>
              <button class="gl-export" type="button" data-export>Export samples ↓</button>
            </div>
          </section>
        </div>

        <aside class="gl-inspector" aria-label="Experiment settings and selected optimizer">
          <div class="gl-settings">
            <p class="gl-eyebrow">02 / Set the experiment</p>
            <div class="gl-field"><label for="gl-surface">Choose a landscape</label>
              <select id="gl-surface">${SURFACES.map((surface) => `<option value="${surface.id}">${escapeMarkup(surface.name)}</option>`).join('')}</select>
            </div>
            <div class="gl-function">
              <p class="gl-formula" data-formula></p>
              <p class="gl-derivative" data-derivative-x></p>
              <p class="gl-derivative" data-derivative-y></p>
            </div>
            <p class="gl-note" data-surface-note></p>

            <div class="gl-rate">
              <div class="gl-field-heading"><label for="gl-rate">Learning rate <span>α</span></label><output data-active-rate aria-live="off"></output></div>
              <div class="gl-rate-controls">
                <input id="gl-rate" type="range" min="-4" max="0" step="0.01" aria-label="Learning rate, logarithmic scale">
                <input id="gl-exact-rate" type="number" min="${MIN_LEARNING_RATE}" max="${MAX_LEARNING_RATE}" step="any" aria-label="Exact learning rate" inputmode="decimal">
              </div>
              <p class="gl-help gl-range-extents"><span>0.0001</span><span>logarithmic slider</span><span>1.0</span></p>
            </div>

            <form class="gl-start-form" data-start-form novalidate>
              <div class="gl-start-heading"><h3>Shared starting point</h3><span>θ₀ = (x, y)</span></div>
              <div class="gl-start-inputs">
                <label class="gl-field" for="gl-start-x">Start x<input id="gl-start-x" type="number" step="any" inputmode="decimal"></label>
                <label class="gl-field" for="gl-start-y">Start y<input id="gl-start-y" type="number" step="any" inputmode="decimal"></label>
                <button type="submit" class="gl-set-start">Set start</button>
              </div>
              <p class="gl-help" data-bounds-note></p>
            </form>
            <label class="gl-toggle"><input type="checkbox" data-gradients checked> Show uphill gradient arrows</label>
            <p class="gl-reset-note">Changing landscape, rate, or start resets all histories and optimizer memory. Reset keeps your setup.</p>
          </div>

          <section class="gl-inspection" aria-label="Selected method details">
            <div class="gl-inspection-heading"><span class="gl-eyebrow">03 / Inside the update</span><span class="gl-status-chip" data-selected-status>Ready</span></div>
            <h2 data-inspect-title>Gradient descent</h2>
            <p class="gl-selected-loss"><span>Current loss L(θₜ)</span><output data-selected-loss aria-live="off"></output></p>
            <dl class="gl-coordinates">
              <div><dt>Current x</dt><dd data-current-x></dd></div>
              <div><dt>Current y</dt><dd data-current-y></dd></div>
            </dl>
            <p class="gl-iteration" data-iteration></p>
            <dl class="gl-vectors">
              <div><dt>Current gradient ∇L(θₜ)</dt><dd data-current-gradient></dd></div>
              <div><dt>Gradient magnitude ‖∇L‖</dt><dd data-gradient-norm></dd></div>
              <div><dt data-last-step-label>Last applied step Δθ</dt><dd data-last-step></dd></div>
              <div><dt>Change in loss from start</dt><dd data-loss-change></dd></div>
              <div data-memory-row hidden><dt data-memory-label></dt><dd data-memory></dd></div>
            </dl>
            <p class="gl-used-gradient" data-used-gradient></p>
            <p class="gl-update-rule" data-update-rule></p>
            <p class="gl-note" data-method-explanation></p>
            <p class="gl-state-reason" data-state-reason></p>
          </section>
        </aside>
      </section>

      <p class="gl-run-record" data-run-record></p>

      <section class="gl-challenges" aria-labelledby="gl-challenges-title">
        <div class="gl-section-heading"><div><p class="gl-eyebrow">Try a different question</p><h2 id="gl-challenges-title">Three field experiments.</h2></div><span>No scores. Look for an explanation.</span></div>
        <div class="gl-challenge-grid">
          ${CHALLENGES.map((challenge, index) => `
            <button type="button" class="gl-challenge" data-challenge="${challenge.id}">
              <span class="gl-challenge-number">0${index + 1} <span aria-hidden="true">↗</span></span>
              <strong>${escapeMarkup(challenge.title)}</strong>
              <span>${escapeMarkup(challenge.question)}</span>
              <span class="gl-challenge-setup">${escapeMarkup(getChallengeSurfaceName(challenge.surfaceId))} · α ${challenge.learningRate}</span>
            </button>
          `).join('')}
        </div>
        <p class="gl-challenge-note" data-challenge-note></p>
      </section>

      <section class="gl-field-guide" aria-labelledby="gl-guide-title">
        <div class="gl-section-heading"><div><p class="gl-eyebrow">Read the map, not just the line</p><h2 id="gl-guide-title">What is actually learning?</h2></div></div>
        <div class="gl-guide-grid">
          <article><span class="gl-guide-symbol" aria-hidden="true">∇L</span><h3>The gradient is a measurement.</h3><p>Each derivative says how loss changes when one weight moves a little. Together they point steepest uphill in parameter space. Contours connect equal losses; closer contours usually mean a steeper slope.</p></article>
          <article><span class="gl-guide-symbol" aria-hidden="true">Δθ</span><h3>The step is a decision.</h3><p>Descent negates the gradient. Momentum adds memory. Adam rescales each coordinate using past gradients. A learning rate sets the scale, but the same α is not an equal-size step—or a fair ranking—across all three.</p></article>
          <article><span class="gl-guide-symbol" aria-hidden="true">θ</span><h3>The coordinates are weights.</h3><p>Imagine x and y as two neural-network weights. Backpropagation computes derivatives; an optimizer updates the weights. Real training has many more dimensions and noisy minibatches. This lab uses exact, deterministic functions, not a trained AI model.</p></article>
        </div>
        <details class="gl-rulebook">
          <summary>The exact rules &amp; numerical boundaries</summary>
          <div class="gl-rulebook-grid">
            <article><h3>Indexing &amp; descent</h3><p>At update t ≥ 1, gₜ = ∇L(θₜ₋₁). The new position is θₜ = θₜ₋₁ + Δθₜ. Descent uses Δθₜ = −αgₜ. The inspector’s <em>current</em> gradient is evaluated again at θₜ; the gradient used for the last step is listed separately.</p></article>
            <article><h3>Heavy-ball momentum</h3><p>v₀ = 0; vₜ = βvₜ₋₁ + gₜ; Δθₜ = −αvₜ, with β = 0.9. Here v is an unnormalized gradient accumulator, not a moving average with a (1 − β) factor. For a constant gradient its scale approaches g / (1 − β).</p></article>
            <article><h3>Adam, with bias correction</h3><p>m₀ = v₀ = 0. mₜ = 0.9mₜ₋₁ + 0.1gₜ; vₜ = 0.999vₜ₋₁ + 0.001gₜ². Then m̂ₜ = mₜ / (1 − 0.9ᵗ), v̂ₜ = vₜ / (1 − 0.999ᵗ), and Δθₜ = −αm̂ₜ / (√v̂ₜ + 10⁻⁸). Operations are coordinate-wise; epsilon is outside the square root. No weight decay.</p></article>
            <article><h3>Honest stopping, honest plots</h3><p>Each method stops at ${MAX_ITERATIONS} accepted updates, on leaving the visible bounds, or when both the gradient and last step have norm ≤ 10⁻⁸. An out-of-view endpoint is kept exactly. Unsafe proposals (non-finite values, |coordinate| &gt; 10⁶, |loss| &gt; 10¹², or |derivative| &gt; 10¹²) are rejected with a reason, retaining the last finite sample. A stationary saddle is not a minimum.</p></article>
          </div>
          <p class="gl-rulebook-foot">Contours are computed by marching squares on a 96 × 80 grid. Axis ranges fit the plot independently. Gradient arrows are normalized in display space; path segments are actual coordinate changes. The loss axis uses sign(L) · log₁₀(1 + |L|), not an accuracy or progress percentage. A comparison round attempts one update for every still-active method.</p>
        </details>
      </section>
      <footer class="gl-footer"><span>Gradient Lab / a small, inspectable training ground</span><span>Three optimizers. No hidden steps.</span></footer>
    </div>
  `;

  const elements = {
    mapHost: query<HTMLElement>(root, '[data-landscape]'),
    lossHost: query<HTMLElement>(root, '[data-loss-plot]'),
    surface: query<HTMLSelectElement>(root, '#gl-surface'),
    rate: query<HTMLInputElement>(root, '#gl-rate'),
    exactRate: query<HTMLInputElement>(root, '#gl-exact-rate'),
    startX: query<HTMLInputElement>(root, '#gl-start-x'),
    startY: query<HTMLInputElement>(root, '#gl-start-y'),
    startForm: query<HTMLFormElement>(root, '[data-start-form]'),
    step: query<HTMLButtonElement>(root, '[data-step]'),
    play: query<HTMLButtonElement>(root, '[data-play]'),
    reset: query<HTMLButtonElement>(root, '[data-reset]'),
    speed: query<HTMLSelectElement>(root, '#gl-speed'),
    gradients: query<HTMLInputElement>(root, '[data-gradients]'),
    export: query<HTMLButtonElement>(root, '[data-export]'),
    feedback: query<HTMLElement>(root, '[data-feedback]'),
    methodButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-method]')],
    challengeButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-challenge]')],
  };
  const cards = elements.methodButtons.map(card => ({
    card,
    loss: query<HTMLElement>(card, '[data-card-loss]'),
    position: query<HTMLElement>(card, '[data-card-position]'),
    status: query<HTMLElement>(card, '[data-card-status]'),
  }));
  const text = (selector: string, value: string) => { query<HTMLElement>(root, selector).textContent = value; };

  function syncSetup(surface: Surface, start: Point, learningRate: number) {
    elements.surface.value = surface.id;
    elements.rate.value = String(Math.log10(learningRate));
    elements.rate.setAttribute('aria-valuetext', `α = ${learningRate}`);
    elements.exactRate.value = String(learningRate);
    elements.startX.value = String(start.x);
    elements.startY.value = String(start.y);
    elements.startX.min = String(surface.bounds.xMin);
    elements.startX.max = String(surface.bounds.xMax);
    elements.startY.min = String(surface.bounds.yMin);
    elements.startY.max = String(surface.bounds.yMax);
    [elements.exactRate, elements.startX, elements.startY].forEach((input) => input.removeAttribute('aria-invalid'));
  }

  function update(model: ViewModel) {
    const run = model.runs.find((item) => item.method === model.selected)!;
    const optimizer = getOptimizer(model.selected);
    root.dataset.surface = model.surface.id;
    root.dataset.motion = model.paused ? 'paused' : 'playing';
    root.dataset.round = String(model.round);
    root.dataset.selected = model.selected;
    root.dataset.rate = String(model.learningRate);
    root.dataset.run = String(model.runNumber);
    root.style.setProperty('--gl-selected', optimizer.color);
    const hasActive = model.runs.some((item) => item.status === 'active');
    elements.step.disabled = !hasActive;
    elements.play.disabled = !hasActive;
    elements.play.setAttribute('aria-pressed', String(!model.paused));
    text('[data-play-label]', model.paused ? 'Play all' : 'Pause all');
    text('[data-play-icon]', model.paused ? '▶' : 'Ⅱ');
    text('[data-round]', String(model.round).padStart(3, '0'));
    text('[data-surface-title]', model.surface.name);
    text('[data-formula]', model.surface.formula);
    text('[data-derivative-x]', model.surface.derivativeX);
    text('[data-derivative-y]', model.surface.derivativeY);
    text('[data-surface-note]', model.surface.note);
    text('[data-active-rate]', String(Number(model.learningRate.toPrecision(5))));
    text('[data-bounds-note]', `Visible bounds: x ${model.surface.bounds.xMin}…${model.surface.bounds.xMax}; y ${model.surface.bounds.yMin}…${model.surface.bounds.yMax}.`);
    text('[data-motion-note]', model.reducedMotion ? 'Reduced motion · manual by default' : 'No autoplay · local calculation');
    text('[data-run-record]', `Run ${model.runNumber} / ${model.setupName} · shared start ${vector(model.start)} · α = ${Number(model.learningRate.toPrecision(6))}. Histories begin at t = 0.`);
    text('[data-challenge-note]', model.challengeNote);

    for (const { card, loss, position, status } of cards) {
      const item = model.runs.find((entry) => entry.method === card.dataset.method)!;
      card.setAttribute('aria-pressed', String(item.method === model.selected));
      card.dataset.status = item.status;
      loss.textContent = `L ${formatNumber(item.loss)}`;
      loss.dataset.lossValue = String(item.loss);
      position.textContent = `(${Number(item.position.x.toPrecision(4))}, ${Number(item.position.y.toPrecision(4))})`;
      status.textContent =
        `t = ${item.iteration} · ${item.status === 'active' && item.iteration === 0 ? 'Ready' : statusNames[item.status]}`;
    }

    text('[data-inspect-title]', optimizer.name);
    text('[data-selected-status]', run.status === 'active' && !run.iteration ? 'Ready' : statusNames[run.status]);
    text('[data-selected-loss]', formatNumber(run.loss));
    query<HTMLElement>(root, '[data-selected-loss]').dataset.lossValue = String(run.loss);
    text('[data-current-x]', formatNumber(run.position.x));
    text('[data-current-y]', formatNumber(run.position.y));
    text('[data-iteration]', `t = ${run.iteration} · ${run.iteration} accepted updates · ${run.attempts} attempts`);
    text('[data-current-gradient]', vector(run.gradient));
    text('[data-gradient-norm]', formatNumber(magnitude(run.gradient)));
    text('[data-last-step-label]', run.lastUpdate ? `Last applied step Δθ at t = ${run.iteration}` : 'Last applied step Δθ');
    text('[data-last-step]', run.lastUpdate ? vector(run.lastUpdate.delta) : 'None yet — t = 0');
    text('[data-loss-change]', formatNumber(run.loss - run.history[0].loss));
    text('[data-used-gradient]', run.lastUpdate
      ? `Last step used g${run.iteration} = ${vector(run.lastUpdate.usedGradient)}, measured at ${vector(run.lastUpdate.from)}.`
      : 'The initial loss is a real sample. No update has been applied.');
    text('[data-update-rule]', optimizer.rule);
    text('[data-method-explanation]', optimizer.explanation);
    text('[data-state-reason]', run.reason);
    const memoryRow = query<HTMLElement>(root, '[data-memory-row]');
    memoryRow.hidden = run.method === 'gd';
    if (run.method === 'momentum') {
      text('[data-memory-label]', 'Gradient accumulator vₜ');
      text('[data-memory]', vector(run.velocity));
    } else if (run.method === 'adam') {
      text('[data-memory-label]', 'Bias-corrected memory for the last step');
      text('[data-memory]', run.lastUpdate
        ? `m̂ ${vector(run.lastUpdate.firstHat!)}; v̂ ${vector(run.lastUpdate.secondHat!)}`
        : 'm₀ = v₀ = (0, 0); correction starts at t = 1.');
    }
    const stopped = model.runs.filter((item) => item.status !== 'active');
    const stopNotice = query<HTMLElement>(root, '[data-stop-notice]');
    stopNotice.hidden = !stopped.length;
    stopNotice.textContent = `${stopped.map((item) => `${getOptimizer(item.method).name}: ${statusNames[item.status].toLowerCase()} at t = ${item.iteration}`).join(' · ')}. Select a path for its exact final values and stopping reason.`;
    text('[data-samples-caption]', `${optimizer.name} · last 6 accepted samples, including t = 0 when present`);
    query<HTMLElement>(root, '[data-sample-rows]').innerHTML = run.history.slice(-6).map((sample) =>
      `<tr><td>${sample.t}</td><td>${escapeMarkup(formatNumber(sample.position.x))}</td><td>${escapeMarkup(formatNumber(sample.position.y))}</td><td>${escapeMarkup(formatNumber(sample.loss))}</td></tr>`,
    ).join('');
  }

  return { ...elements, syncSetup, update };
}

function getChallengeSurfaceName(id: string): string {
  return SURFACES.find((surface) => surface.id === id)!.name;
}
