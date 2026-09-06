import { escapeMarkup } from '../../core/page';
import { INPUT_LIMIT, MATRIX_PRESETS, PROJECTION_PRESETS, REFERENCES } from './data';

function numberField(key: string, visibleLabel: string, accessibleLabel: string, tone = ''): string {
  return `<label class="vp-number ${tone}" for="vp-${key}">
    <span>${escapeMarkup(visibleLabel)}</span>
    <input id="vp-${key}" data-vp-number="${key}" type="number" min="${-INPUT_LIMIT}" max="${INPUT_LIMIT}" step="any"
      aria-label="${escapeMarkup(accessibleLabel)}" aria-describedby="vp-number-hint" inputmode="decimal">
  </label>`;
}

export function playgroundMarkup(): string {
  return `
    <div class="vp-site">
      <header class="vp-masthead">
        <div>
          <p class="vp-eyebrow"><span class="vp-brand-mark" aria-hidden="true">↗</span> 051 / A practical math lab</p>
          <h1 id="vp-title">Vector <em>Playground</em></h1>
          <p class="vp-deck">Move the basis. Give the whole plane a new shape.</p>
        </div>
        <div class="vp-header-stamp" aria-hidden="true">
          <svg viewBox="0 0 90 64" width="90" height="64">
            <path d="M8 52H60V12H8Z" fill="none" stroke="#a2aea0" stroke-dasharray="3 4"></path>
            <path d="M8 52H60L82 12H30Z" fill="#d9e7df" stroke="#19746c" stroke-width="1.5"></path>
            <path d="M8 52L30 12M8 52H60" fill="none" stroke="#b94e3b" stroke-width="2.5"></path>
            <circle cx="30" cy="12" r="3" fill="#b94e3b"></circle><circle cx="60" cy="52" r="3" fill="#19746c"></circle>
          </svg>
          <span>Two dimensions.<br>Endless what-ifs.</span>
        </div>
      </header>

      <section class="vp-workbench" aria-labelledby="vp-board-title" data-project-preview>
        <header class="vp-board-toolbar">
          <h2 id="vp-board-title"><span aria-hidden="true">↗</span> Drawing board</h2>
          <div class="vp-mode-picker" role="group" aria-label="Choose a vector lab">
            <button type="button" data-vp-mode="transform" aria-pressed="true">Matrix lab</button>
            <button type="button" data-vp-mode="projection" aria-pressed="false">Dot &amp; projection</button>
          </div>
          <button class="vp-reset" type="button" data-vp-reset aria-label="Reset both labs">Reset <span aria-hidden="true">↺</span></button>
        </header>
        <div class="vp-board-body">
          <div class="vp-visual-column">
            <figure class="vp-figure" aria-label="Interactive vector drawing board">
              <div class="vp-diagram">
                <div class="vp-plot-heading" aria-hidden="true">
                  <span data-vp-plot-kicker>The plane, re-drawn</span>
                  <p data-vp-plot-caption>Same points. New places.</p>
                </div>
                <div class="vp-drawing" data-vp-drawing></div>
                <p class="vp-scale-note">1-unit grid · auto-fit</p>
              </div>
              <figcaption>
                <div class="vp-legend" data-vp-transform-legend>
                  <span><i class="vp-key-original"></i> Original</span>
                  <span><i class="vp-key-pavilion"></i> Pavilion after A</span>
                  <span><i class="vp-key-teal"></i> Ae₁</span>
                  <span><i class="vp-key-coral"></i> Ae₂</span>
                  <span><i class="vp-key-gold"></i> Av</span>
                </div>
                <div class="vp-legend" data-vp-projection-legend hidden>
                  <span><i class="vp-key-coral"></i> Source u</span>
                  <span><i class="vp-key-teal"></i> Direction d</span>
                  <span><i class="vp-key-gold"></i> Projection p</span>
                  <span><i class="vp-key-original"></i> Perpendicular residual</span>
                </div>
                <p class="vp-drag-hint">Drag round tips, or focus one and use arrow keys. All coordinates are editable.</p>
              </figcaption>
            </figure>
            <div class="vp-readings" aria-label="Live mathematical results">
              <div><span data-vp-reading-label="0">Signed area · det A</span><output data-vp-reading="0" aria-live="off"></output><p data-vp-reading-note="0"></p></div>
              <div><span data-vp-reading-label="1">Orientation</span><output data-vp-reading="1" aria-live="off"></output><p data-vp-reading-note="1"></p></div>
              <div><span data-vp-reading-label="2">Output vector · Av</span><output data-vp-reading="2" aria-live="off"></output><p data-vp-reading-note="2"></p></div>
            </div>
            <div class="vp-eigen-note" data-vp-eigen-panel>
              <label class="vp-check"><input type="checkbox" data-vp-eigen checked><span>Show eigen-directions</span><i aria-hidden="true"></i></label>
              <p class="vp-eigen-title" data-vp-eigen-title></p>
              <p data-vp-eigen-description></p>
            </div>
            <div class="vp-projection-note" data-vp-projection-panel hidden>
              <p class="vp-eigen-title">The shadow along a line</p>
              <p data-vp-projection-explanation role="status"></p>
            </div>
          </div>

          <aside class="vp-controls" aria-label="Vector lab controls">
            <section data-vp-matrix-controls aria-labelledby="vp-matrix-heading">
              <div class="vp-control-heading"><span>01</span><h3 id="vp-matrix-heading">Move the basis</h3></div>
              <label class="vp-select-label" for="vp-preset">Transformation</label>
              <select id="vp-preset" data-vp-preset>
                ${MATRIX_PRESETS.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.label)}</option>`).join('')}
                <option value="custom" disabled>Custom matrix</option>
              </select>
              <div class="vp-column-labels"><span>Ae₁</span><span>Ae₂</span></div>
              <div class="vp-matrix">
                <span class="vp-matrix-symbol" aria-hidden="true">A =</span>
                <div class="vp-brackets">
                  ${numberField('a', 'a', 'Matrix a, row 1 column 1', 'vp-column-one')}
                  ${numberField('b', 'b', 'Matrix b, row 1 column 2', 'vp-column-two')}
                  ${numberField('c', 'c', 'Matrix c, row 2 column 1', 'vp-column-one')}
                  ${numberField('d', 'd', 'Matrix d, row 2 column 2', 'vp-column-two')}
                </div>
              </div>
              <p class="vp-control-caption">Columns are the landing spots of e₁ = (1, 0) and e₂ = (0, 1).</p>
              <div class="vp-control-heading vp-second-heading"><span>02</span><h3>Send a vector</h3></div>
              <fieldset>
                <legend>Input vector v</legend>
                <div class="vp-vector-inputs">
                  ${numberField('vector-x', 'x', 'Input vector x')}
                  ${numberField('vector-y', 'y', 'Input vector y')}
                </div>
              </fieldset>
              <div class="vp-combination"><span>Av = x · Ae₁ + y · Ae₂</span><p data-vp-combination></p></div>
              <p class="vp-preset-note" data-vp-preset-note></p>
            </section>

            <section data-vp-dot-controls aria-labelledby="vp-dot-heading" hidden>
              <div class="vp-control-heading"><span>01</span><h3 id="vp-dot-heading">Compare two vectors</h3></div>
              <label class="vp-select-label" for="vp-dot-preset">A starting angle</label>
              <select id="vp-dot-preset" data-vp-dot-preset>
                ${PROJECTION_PRESETS.map((preset) => `<option value="${preset.id}">${escapeMarkup(preset.label)}</option>`).join('')}
                <option value="custom" disabled>Custom vectors</option>
              </select>
              <fieldset class="vp-source-fields">
                <legend>Source vector u <span class="vp-color-dot vp-dot-coral" aria-hidden="true"></span></legend>
                <div class="vp-vector-inputs">
                  ${numberField('source-x', 'x', 'Projection source x', 'vp-column-two')}
                  ${numberField('source-y', 'y', 'Projection source y', 'vp-column-two')}
                </div>
              </fieldset>
              <fieldset>
                <legend>Direction vector d <span class="vp-color-dot vp-dot-teal" aria-hidden="true"></span></legend>
                <div class="vp-vector-inputs">
                  ${numberField('direction-x', 'x', 'Projection direction x', 'vp-column-one')}
                  ${numberField('direction-y', 'y', 'Projection direction y', 'vp-column-one')}
                </div>
              </fieldset>
              <div class="vp-combination">
                <span>p = proj<sub>d</sub> u = (u·d / d·d) d</span>
                <p data-vp-projection-formula></p>
              </div>
              <p class="vp-control-caption">The dot product mixes length and alignment. Cosine divides out the lengths when both vectors are nonzero.</p>
              <button type="button" class="vp-primary" data-vp-use-projection>Make this projection A <span aria-hidden="true">↗</span></button>
              <p class="vp-control-caption">Use the perpendicular projection as a 2×2 matrix, then see what it does to the pavilion.</p>
            </section>
            <p id="vp-number-hint" class="vp-number-hint">Numbers: −4 to 4. Arrow keys: 0.1 steps; Shift + arrows: 0.5. Enter on a tip opens its number control.</p>
            <p class="vp-validation" data-vp-validation role="alert" hidden></p>
          </aside>
        </div>
      </section>

      <section class="vp-field-notes" aria-label="A short field guide">
        <article>
          <p class="vp-eyebrow">Read the drawing / 01</p>
          <h2>Two columns.<br> One whole world.</h2>
          <p>The matrix moves every point, not just the arrows. The tinted square shows where one unit of area goes. The coral pavilion uses the very same rule, vertex by vertex.</p>
          <p class="vp-small-note">Faint grid = before. Teal grid = after, for the input patch −4…4. Dashed purple lines are real eigen-directions, not additional vectors.</p>
        </article>
        <article class="vp-challenge">
          <p class="vp-eyebrow">Your turn / 02</p>
          <h2>Erase a dimension.</h2>
          <p>Can you make the plane land on a single line without sending everything to zero?</p>
          <button type="button" class="vp-challenge-button" data-vp-challenge>Try the rank-one challenge <span aria-hidden="true">↗</span></button>
          <p class="vp-challenge-status" data-vp-challenge-status role="status" hidden></p>
        </article>
        <article class="vp-ai-note">
          <p class="vp-eyebrow">From paper to AI / 03</p>
          <h2>A small window<br> into linear layers.</h2>
          <p>A linear layer applies a matrix to a vector, usually followed by a bias: <strong>y = Wx + b</strong>. This board isolates the linear part; a bias would also shift the origin.</p>
          <p>Real embeddings are learned, usually in many dimensions. These hand-set coordinates are <strong>not learned meanings</strong>. A dot product becomes useful for similarity only in the context of a representation and its training.</p>
        </article>
      </section>
      <footer class="vp-footer">
        <details>
          <summary>Precision &amp; reading notes</summary>
          <p>Values use JavaScript floating-point arithmetic; readouts round to three decimals, with scientific notation for small nonzero values. Computations keep the unrounded values. Numerical rank uses a relative determinant tolerance of 1e−10 after scaling by the largest matrix entry. Near-collapse is labeled separately.</p>
          <p>Eigen-directions solve Av = λv with nonzero v. A negative λ reverses the vector, and λ = 0 sends it to the origin. Repeated eigenvalues can have one eigenline (defective) or every direction (a scalar matrix). A negative discriminant is never replaced with made-up real arrows.</p>
          <p>Extremely close eigenvalues are sensitive to floating-point rounding. The drawing auto-fits outputs; screen length alone is not an absolute measurement across settings. No animation, training, or network computation is running.</p>
        </details>
        <nav aria-label="Further linear algebra reading">
          ${REFERENCES.map((reference) => `<a href="${escapeMarkup(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeMarkup(reference.label)} <span aria-hidden="true">↗</span></a>`).join('')}
        </nav>
      </footer>
    </div>`;
}
