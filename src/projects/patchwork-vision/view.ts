import { escapeMarkup } from '../../core/page';
import { COLORS, DEFAULT_DESCRIPTOR, DEFAULT_TEMPERATURE, DESCRIPTORS, FEATURE_LABELS, PATCH_COUNT, SCENES, SHAPES } from './data';

export function pageMarkup(): string {
  const colorOptions = COLORS.map((color) => `<option value="${color.id}">${color.label}</option>`).join('');
  const shapeOptions = SHAPES.map((shape) => `<option value="${shape.id}">${shape.label}</option>`).join('');
  return `
    <div class="pw-shell">
      <header class="pw-heading">
        <div>
          <p class="pw-eyebrow">55 / The visible machine</p>
          <h1>Patchwork Vision<span aria-hidden="true">.</span></h1>
          <p class="pw-deck">Change a patch. Watch a picture become a vector.</p>
        </div>
        <p class="pw-model-stamp"><span>Small, local teaching model</span><strong>Fixed features. No learned weights.</strong></p>
      </header>

      <div class="pw-workbench" data-project-preview>
        <div class="pw-toolbar">
          <label for="pw-scene">Original scene
            <select id="pw-scene" data-scene>${SCENES.map((scene) =>
              `<option value="${scene.id}">${escapeMarkup(scene.name)}</option>`).join('')}</select>
          </label>
          <span class="pw-scene-state" data-scene-state>Original pixels</span>
          <button type="button" class="pw-quiet" data-reset>Reset image</button>
        </div>

        <div class="pw-panels">
          <section class="pw-image-panel" aria-labelledby="pw-image-heading">
            <div class="pw-panel-heading"><h2 id="pw-image-heading"><span>01</span> Paint the pixels</h2><span>4 x 4 patches</span></div>
            <div class="pw-image" data-image>
              <div class="pw-patch-grid" aria-label="Select a patch">
                ${Array.from({ length: PATCH_COUNT }, (_, index) => `
                  <button type="button" data-patch="${index}" aria-label="Select patch ${index + 1}" aria-pressed="${index === 0}">
                    <span class="pw-patch-number">${String(index + 1).padStart(2, '0')}</span>
                    <span class="pw-patch-weight" data-weight="${index}"></span>
                  </button>`).join('')}
              </div>
            </div>
            <p class="pw-hint">Select a tile, then change its paint. Arrow keys move selection.</p>
            <div class="pw-paint-controls">
              <label for="pw-color">Patch color<select id="pw-color" data-color>${colorOptions}</select></label>
              <label for="pw-shape">Patch shape<select id="pw-shape" data-shape>${shapeOptions}<option value="empty">Empty</option></select></label>
            </div>
            <div class="pw-image-actions">
              <button type="button" class="pw-quiet" data-undo disabled>Undo edit</button>
              <button type="button" class="pw-quiet" data-swap>Flip arrangement</button>
              <button type="button" class="pw-quiet" data-clear>Clear image</button>
            </div>
            <label class="pw-checkbox"><input type="checkbox" data-overlay checked> Show patch weight overlays</label>
            <p class="pw-hint">Overlays are annotations, not input pixels. Empty patches are masked out.</p>
          </section>

          <section class="pw-token-panel" aria-labelledby="pw-token-heading">
            <div class="pw-panel-heading"><h2 id="pw-token-heading"><span>02</span> Read the token</h2></div>
            <div class="pw-token-title"><strong data-selected-title>Patch 01</strong><span data-coverage></span></div>
            <p class="pw-small" data-selected-description></p>
            <div class="pw-feature-head"><span>Handcrafted feature</span><span>Value</span></div>
            <div class="pw-features">
              ${FEATURE_LABELS.map((label, index) => `
                <div class="pw-feature" data-feature="${index}">
                  <span>${label}</span><span class="pw-feature-track"><i data-feature-bar="${index}"></i></span>
                  <output data-feature-value="${index}">0.000</output>
                </div>`).join('')}
            </div>
            <p class="pw-hint">Color = foreground pixel fractions. Shape = fixed mask affinities, normalized as a group.</p>
            <div class="pw-vector-block">
              <span>Unit visual token v</span>
              <code data-unit-vector></code>
              <span>Unit text descriptor t</span>
              <code data-text-vector></code>
            </div>
            <div class="pw-local-math">
              <p><span>Patch cosine v &middot; t</span><strong data-patch-cosine></strong></p>
              <p><span>Pooling weight a</span><strong data-patch-weight></strong></p>
              <p><span>Contribution a(v &middot; t)</span><strong data-patch-contribution></strong></p>
            </div>
            <p class="pw-hint">A contribution is a term in the weighted mean of patch cosines, not a probability of an object.</p>
          </section>

          <section class="pw-match-panel" aria-labelledby="pw-match-heading">
            <div class="pw-panel-heading"><h2 id="pw-match-heading"><span>03</span> Ask in vectors</h2></div>
            <form data-descriptor-form>
              <label for="pw-descriptor">Text descriptor</label>
              <div class="pw-query-row"><input id="pw-descriptor" data-descriptor value="${DEFAULT_DESCRIPTOR}" maxlength="120" autocomplete="off" spellcheck="false" aria-describedby="pw-query-message">
                <button type="submit" aria-label="Apply descriptor">Apply</button>
              </div>
            </form>
            <div class="pw-descriptor-chips">${DESCRIPTORS.map((descriptor) =>
              `<button type="button" data-descriptor-preset="${escapeMarkup(descriptor.text)}" title="${escapeMarkup(descriptor.note)}">${escapeMarkup(descriptor.text)}</button>`).join('')}</div>
            <details class="pw-vocabulary">
              <summary>Build from the supported vocabulary</summary>
              <div class="pw-paint-controls">
                <label for="pw-text-color">Descriptor color<select id="pw-text-color" data-text-color><option value="">Any color</option>${colorOptions}</select></label>
                <label for="pw-text-shape">Descriptor shape<select id="pw-text-shape" data-text-shape><option value="">Any shape</option>${shapeOptions}</select></label>
              </div>
              <p class="pw-hint">One color, one shape, or both. Articles are ignored. No relations, negation, counting, or open-ended captions.</p>
            </details>
            <p id="pw-query-message" class="pw-query-message" data-query-message role="status"></p>
            <label for="pw-pooling">Pool the visual tokens
              <select id="pw-pooling" data-pooling><option value="attention">Text-guided attention</option><option value="mean">Uniform mean</option></select>
            </label>
            <label class="pw-temperature-label" for="pw-temperature">Attention temperature <output data-temperature-value>${DEFAULT_TEMPERATURE.toFixed(2)}</output></label>
            <input id="pw-temperature" data-temperature type="range" min="0.05" max="1" step="0.01" value="${DEFAULT_TEMPERATURE}">
            <p class="pw-hint" data-pooling-note></p>
            <div class="pw-score-box">
              <span data-score-label>Attention-pooled cosine</span>
              <div class="pw-score-row"><output data-score>0.000</output><span>similarity<br>not confidence</span></div>
              <div class="pw-score-rail"><i data-score-bar></i></div>
              <p data-score-note></p>
            </div>
            <div class="pw-measures">
              <p><span>Uniform-mean cosine</span><output data-mean-score></output></p>
              <p><span>Weight entropy</span><output data-entropy></output></p>
              <p><span>Weight sum / active patches</span><output data-weight-sum></output></p>
            </div>
          </section>
        </div>
        <div class="pw-bench-footer">
          <span>112 x 112 original pixels &rarr; 16 patches &rarr; 7D fixed tokens &rarr; local arithmetic</span>
          <button type="button" class="pw-quiet" data-export>Download numeric snapshot</button>
        </div>
      </div>

      <section class="pw-comparison" aria-labelledby="pw-comparison-heading">
        <div class="pw-section-heading"><div><p class="pw-eyebrow">One descriptor, three original images</p><h2 id="pw-comparison-heading">What else matches?</h2></div><p>Same features, temperature, and pooling.<br>Scores are cosine similarities, not class probabilities.</p></div>
        <div class="pw-scenes" data-comparisons></div>
      </section>

      <section class="pw-under-the-hood">
        <details class="pw-ledger">
          <summary>Open the full patch ledger <span>dot products / weights / contributions</span></summary>
          <p class="pw-small">For nonempty patches: s = v &middot; t. Attention a = softmax(s / temperature). Uniform mean uses a = 1 / nonempty count. Pooled image z = sum(a v); image score = cosine(z, t).</p>
          <div class="pw-table-wrap" tabindex="0" role="region" aria-label="Patch computation table">
            <table><thead><tr><th scope="col">Patch</th><th scope="col">Cosine s</th><th scope="col">Weight a</th><th scope="col">a &times; s</th></tr></thead><tbody data-ledger></tbody><tfoot><tr><th scope="row">Total</th><td>&mdash;</td><td data-ledger-sum></td><td data-ledger-contribution></td></tr></tfoot></table>
          </div>
          <p class="pw-hint">The total contribution is the weighted mean of patch cosines. The headline image score additionally normalizes z, so it need not equal that total.</p>
        </details>
        <div class="pw-notes">
          <article class="pw-challenge"><span class="pw-eyebrow">Try to fool the representation</span><h2>Can it see left and right?</h2><p>Use <strong>Flip arrangement</strong>. Every pixel moves to another patch, yet the score stays the same. Our tokens contain no position. Try typing <strong>red circle on the left</strong>: the descriptor is rejected, not guessed.</p><p>Then switch to <strong>Uniform mean</strong>. A lone matching patch can dominate sharp attention; the mean also remembers the rest of the image.</p></article>
          <article><span class="pw-eyebrow">Where the model ends</span><h2>A stand-in, not a VLM.</h2><p>This teaching pipeline extracts colors by exact palette counts and shapes by comparing actual pixels with three centered binary masks. Shape affinity is exp[-12(1 - intersection/union)]. No feature or text mapping is learned.</p><p>Production vision-language models learn much richer representations from data. This bench cannot understand photographs, objects, emotions, negation, captions, or spatial relations. All images are synthetic and stay in this browser.</p><p class="pw-references">Further reading: <a href="https://arxiv.org/abs/2010.11929" target="_blank" rel="noreferrer">Vision Transformer</a> &middot; <a href="https://arxiv.org/abs/2103.00020" target="_blank" rel="noreferrer">CLIP</a>. These papers describe learned models, not this fixed-feature implementation.</p></article>
        </div>
      </section>
      <p class="pw-live sr-only" data-announcement role="status" aria-live="polite"></p>
    </div>`;
}
