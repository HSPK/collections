import { createProjectPage, downloadText, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { closestOnLine, epipolarLine, essential, fundamental, sampsonDistance } from './camera';
import { renderImageOverlay } from './images';
import { norm, sub } from './math';
import type { M3, V2 } from './math';
import { estimateFundamental } from './robust';
import type { RobustFit } from './robust';
import { createSpace } from './space';
import { capture, commit, createExperiment, createHistory, exportPly, parseExperiment, reconstruct, redo, serialize, undo } from './state';
import type { Experiment, Method, Reconstruction } from './state';
import { cameras, STUDIES, WORLD } from './world';
import type { StudyId } from './world';

const fixed = (value: number | null | undefined, digits = 2): string => value === null || value === undefined || !Number.isFinite(value) ? 'Unavailable' : value.toFixed(digits);
const frame = (side: 'a' | 'b') => `
  <section class="px-camera-panel" id="px-pane-${side}" data-pane="${side}" aria-label="View ${side.toUpperCase()}">
    <div class="px-panel-heading"><h2><span class="px-view-letter">${side.toUpperCase()}</span> View ${side.toUpperCase()}</h2><span>960 × 640 px</span></div>
    <div class="px-exposure">
      <canvas data-camera-image="${side}" aria-label="Rendered synthetic exposure ${side.toUpperCase()}"></canvas>
      <svg data-image-overlay="${side}" viewBox="0 0 960 640" tabindex="0" role="group" aria-label="View ${side.toUpperCase()} correspondences. Arrow keys select landmarks. Enter selects; edit coordinates in the inspector."></svg>
      <span class="px-exposure-stamp">SYNTHETIC / CALIBRATED</span>
    </div>
    <div class="px-image-caption"><span data-visible="${side}"></span><span>${side === 'a' ? 'Reference exposure' : 'Matching exposure'}</span></div>
  </section>`;

export function mountParallax(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'parallax');
  const { root, signal } = page;
  const history = createHistory();
  let results: Reconstruction[] = [];
  let fit: RobustFit | null = null;
  let fitKey = '';
  let editMode = false;
  let importSequence = 0;
  let inputRevision = 0;
  root.dataset.activePane = 'a';
  root.innerHTML = `
    <header class="px-header">
      <div class="px-brand"><svg viewBox="0 0 56 48" aria-hidden="true"><path d="M2 2h32v32H2zM22 14h32v32H22zM2 2l20 12m12-12 20 12M2 34l20 12m12-12 20 12"/></svg><h1>PARALLAX<span>Calibrated seeing / No. 069</span></h1></div>
      <div class="px-intro"><h2>The depth between two pictures.</h2><p>Find a point in two images. Recover where it lives.</p></div>
      <div class="px-edition"><span>FIELD NOTES</span><strong>01—03</strong><span>A spatial reconstruction studio</span></div>
    </header>
    <div class="px-toolbar">
      <label class="px-study-label">Capture study<select data-study aria-label="Capture study">${STUDIES.map((s) => `<option value="${s.id}">${s.title}</option>`).join('')}</select></label>
      <div class="px-method-group" role="group" aria-label="Reconstruction method"><button data-method="raw">Raw rays</button><button data-method="refined">Refined</button><button data-method="robust">Robust gate</button></div>
      <div class="px-history"><button data-action="undo" aria-label="Undo">↶ Undo</button><button data-action="redo" aria-label="Redo">↷</button><button data-action="reset">Reset study</button></div>
    </div>
    <nav class="px-mobile-tabs" role="tablist" aria-label="Studio panes">${[['a', 'View A'], ['b', 'View B'], ['space', 'Space'], ['inspect', 'Inspect']].map(([id, title]) => `<button role="tab" data-tab="${id}" aria-controls="px-pane-${id}" aria-selected="${id === 'a'}" tabindex="${id === 'a' ? 0 : -1}">${title}</button>`).join('')}</nav>
    <div class="px-studio" data-project-preview>
      <div class="px-pair">${frame('a')}${frame('b')}<div class="px-capture-tools"><button data-action="edit-mode" aria-pressed="false">Move a match</button><span data-capture-mode>Click a dot to inspect it.</span></div></div>
      <section class="px-space-panel" id="px-pane-space" data-pane="space" aria-label="Reconstruction space">
        <div class="px-panel-heading"><h2><span class="px-space-symbol">◇</span> Recovered space</h2><span data-recovered-count></span></div>
        <div class="px-space-host"><div class="px-space-caption"><span>WORLD / METRES</span><strong>Two rays.<br>One possible point.</strong></div><div class="px-space-legend"><span><i></i> Refined points</span><span><i class="px-hollow"></i> Raw midpoint</span><span>Grid: 1 m</span></div></div>
        <div class="px-space-tools"><div role="group" aria-label="Space interaction"><button data-orbit-mode="orbit" aria-pressed="true">Orbit</button><button data-orbit-mode="pick" aria-pressed="false">Pick point</button></div><button data-action="home-view" aria-label="Reset spatial viewpoint">Home view</button><label><input type="checkbox" data-reveal> Reveal truth</label></div>
      </section>
      <section class="px-inspector" id="px-pane-inspect" data-pane="inspect" aria-label="Point inspector">
        <div class="px-panel-heading"><h2>Point inspector</h2><span>XYZ</span></div>
        <div class="px-inspector-body">
          <label class="px-landmark-label">Landmark<select data-landmark aria-label="Selected landmark">${WORLD.landmarks.map((p) => `<option value="${p.id}">${p.id} · ${p.label}</option>`).join('')}</select></label>
          <div class="px-point-heading"><strong data-point-id></strong><span data-point-status></span><div><button data-action="previous" aria-label="Previous paired landmark">←</button><button data-action="next" aria-label="Next paired landmark">→</button></div></div>
          <p data-point-label class="px-point-label"></p>
          <output class="px-position" data-point3d aria-label="Reconstructed world coordinates"></output>
          <p class="px-result-reason" data-reason></p>
          <dl class="px-metrics"><div><dt>Raw RMS</dt><dd data-raw-rms></dd></div><div><dt>Displayed RMS</dt><dd data-rms></dd></div><div><dt>Ray angle</dt><dd data-angle></dd></div><div><dt>Depth σ</dt><dd data-uncertainty></dd></div><div><dt>Epipolar distance</dt><dd data-epipolar></dd></div></dl>
          <p class="px-uncertainty-note">σ from pixel noise + ray geometry, not a confidence score.</p>
          <form class="px-pixel-form" data-pixels>
            <div class="px-pixel-header"><strong>Observed coordinates</strong><span>pixels</span></div>
            ${(['a', 'b'] as const).map((side) => `<div class="px-pixel-row"><span>${side.toUpperCase()}</span>${['x', 'y'].map((axis) => `<label>${axis}<input type="number" data-pixel="${side}-${axis}" aria-label="View ${side.toUpperCase()} ${axis} pixel" min="0" max="${axis === 'x' ? 960 : 640}" step="any" required></label>`).join('')}</div>`).join('')}
            <button class="px-apply" type="submit">Apply pixel coordinates <span>↗</span></button>
          </form>
          <div class="px-repair-tools"><button data-action="epipolar-repair">Project B onto epipolar line</button><button data-action="restore-match">Restore captured match</button></div>
          <label class="px-enable"><input type="checkbox" data-enabled> Include in reconstruction</label>
          <p data-truth-error class="px-truth-reading" hidden></p>
        </div>
      </section>
    </div>
    <div class="px-study-caption"><span data-study-description></span><span>Real 3D rasterization · linked pixel observations · no image recognition</span></div>
    <section class="px-calibration" aria-label="Calibration and capture controls">
      <div class="px-calibration-intro"><span class="px-eyebrow">01 / THE CAMERA MODEL</span><h2>The camera is<br>a hypothesis.</h2><p data-calibration-note></p></div>
      <fieldset class="px-rig"><legend>Assumed calibration <span>Exposures stay fixed</span></legend>
        <label>Baseline <output data-value="baseline"></output><input data-rig="baseline" aria-label="Assumed baseline" type="range" min="0" max="8" step="0.01"></label>
        <label>Focal length <output data-value="focal"></output><input data-rig="focal" aria-label="Assumed focal length" type="range" min="300" max="1600" step="5"></label>
        <label>Camera B yaw <output data-value="yaw"></output><input data-rig="yaw" aria-label="Camera B yaw" type="range" min="-25" max="25" step="0.1"></label>
        <button data-action="recapture" class="px-yellow-button">Capture with this rig <span>↗</span></button>
      </fieldset>
      <fieldset class="px-sensor"><legend>Observation perturbations <span>Seeded, repeatable</span></legend>
        <label>Pixel noise σ <output data-value="sigma"></output><input data-noise="sigma" aria-label="Pixel noise sigma" type="range" min="0" max="8" step="0.1"></label>
        <label>Injected mismatches <output data-value="outliers"></output><input data-noise="outliers" aria-label="Injected mismatches" type="range" min="0" max="0.4" step="0.05"></label>
        <p>Changing these resamples matches from the captured rig. Occluded landmarks stay unobserved.</p><button data-action="new-seed">Next noise seed</button>
      </fieldset>
    </section>
    <div class="px-notebook">
      <section class="px-experiment">
        <span class="px-eyebrow">02 / A GUIDED EXPERIMENT</span><h2>Move closer together.<br>Know less about depth.</h2>
        <p>Hold the scene and 1 px sensor noise constant. Compare a wide stereo pair with a 15 cm baseline. Look at the selected point’s rays and its one-sigma uncertainty ellipsoid.</p>
        <div class="px-guide-buttons"><button data-action="guide-wide">1. Capture at 4 m</button><button data-action="guide-narrow">2. Capture at 0.15 m</button></div>
        <output data-guide-reading>Begin with the wide pair. Then bring the cameras together.</output>
        <p class="px-equation">Depth sensitivity ≈ z² σ / (f B)</p><p>A small reprojection error is not proof of correct depth. Parallel rays constrain a direction, not a distance.</p>
      </section>
      <section class="px-epipolar-study">
        <span class="px-eyebrow">03 / CALIBRATION IS NOT CONSENSUS</span><h2>Does the evidence agree?</h2>
        <p>The robust gate rejects matches beyond <strong data-threshold></strong> of the <em>known-camera</em> epipolar geometry. Refinement minimizes the remaining pixel residuals; it does not repair wrong identities.</p>
        <button data-action="fit-f">Estimate F from matches</button>
        <p data-fit-status>Optional: normalized eight-point fit with 240 seeded RANSAC hypotheses. It estimates image geometry, not camera pose or metric 3D.</p>
        <details><summary>Open the geometry sheet</summary><p>Solid yellow: calibrated F. Dashed ivory: estimated F, when available. The estimator needs spatially distributed, nondegenerate matches.</p><p class="px-equation">xᵦᵀ F xₐ = 0 · E = [t]× R<br>F = Kᵦ⁻ᵀ E Kₐ⁻¹</p><h3>Calibrated F (pixel coordinates)</h3><pre data-f-matrix></pre><h3>Essential E (normalized coordinates)</h3><pre data-e-matrix></pre><p data-f-comparison></p></details>
      </section>
      <section class="px-evidence">
        <span class="px-eyebrow">04 / KEEP THE EVIDENCE</span><h2>A study, not a screenshot.</h2>
        <p>Save the calibration, both sets of observed pixels, noise recipe and edits. Export only the currently available reconstructed points in metres.</p>
        <div class="px-export-buttons"><button data-action="export-json">Experiment JSON ↓</button><button data-action="export-ply">Point cloud PLY ↓</button></div>
        <details class="px-import"><summary>Import an experiment</summary><label>Local experiment file<input type="file" accept=".json,application/json" data-import-file></label><label>Or paste version 1 JSON<textarea data-import-text aria-label="Experiment JSON" rows="5" maxlength="250001" spellcheck="false"></textarea></label><button data-action="import-json">Load experiment</button><p>Strict 250 kB limit. Invalid input never replaces the current valid state.</p></details>
      </section>
    </div>
    <details class="px-model-notes"><summary>Model, coordinate conventions & limits</summary><div>
      <p><strong>World:</strong> metres; +Y up. Camera coordinates: +X right, +Y down, +Z forward. Image origin is the upper-left; x increases right and y down. Pixel calibration is always 960 × 640, independent of pane size or device pixel ratio.</p>
      <p><strong>Projection:</strong> subtract camera centre C, apply world-to-camera rotation R, divide by positive z, then apply K. Unprojection applies K⁻¹ then Rᵀ. Negative depths are never flipped or clamped. Baselines below 1 µm are unavailable; ray angles below 0.1° are unstable.</p>
      <p><strong>Reconstruction:</strong> closest-ray midpoint, optionally followed by at most 24 Gauss–Newton iterations with backtracking. RMS is over four pixel-coordinate residuals recomputed from the displayed point. The wire connections use authored landmark topology; they are not inferred surfaces.</p>
      <p><strong>Uncertainty:</strong> first-order covariance σ²(JᵀJ)⁻¹ with independent, identical Gaussian pixel noise and exact calibration. The ellipsoid shows one standard deviation along each principal axis, not a confidence percentage. It excludes calibration error and wrong feature identity. Zero noise means zero modeled sensor variance, not certain truth.</p>
      <p><strong>Gauge:</strong> calibrated baseline fixes metric scale; the chosen world frame fixes origin and orientation. A common rigid transform changes coordinates but not image measurements. Pixel-estimated F has arbitrary nonzero scale and does not resolve scene scale, pose, or projective gauge.</p>
      <p><strong>Visibility:</strong> both exposures are actual Three.js depth-buffered renders of the same opaque, authored triangle scene. Visibility uses ray–triangle occlusion tests at landmarks; hidden or out-of-frame points have no observation. Only the SVG correspondence and epipolar overlays are vector graphics.</p>
      <p><strong>Limits:</strong> ideal pinhole lenses, no distortion, rolling shutter, recognition, bundle adjustment, uncalibrated SfM, or automatic feature matching. Two-view epipolar tests cannot detect a wrong match along the correct epipolar line. Planar/repeated/collinear samples may defeat the bounded F estimator; a successful consensus is not proof of correct calibration.</p>
    </div></details>
    <footer class="px-footer"><span>PARALLAX / A small observatory for spatial evidence.</span><span>Every coordinate has a provenance.</span></footer>
    <p class="px-status" role="status" aria-live="polite" data-status>Ready. Select a landmark in either image.</p>
  `;
  const q = <T extends Element>(selector: string) => query<T>(root, selector);
  root.addEventListener('input', () => { inputRevision++; }, { signal });
  function announce(message: string) { q<HTMLElement>('[data-status]').textContent = message; }
  const overlays: [SVGSVGElement, SVGSVGElement] = [q('[data-image-overlay="a"]'), q('[data-image-overlay="b"]')];
  const imageSize = new ResizeObserver(() => {
    overlays.forEach((svg) => {
      if (svg.clientWidth > 0) svg.style.setProperty('--px-label-size', `${Math.max(27, 14 * 960 / svg.clientWidth)}px`);
    });
  });
  overlays.forEach((svg) => imageSize.observe(svg));
  page.onCleanup(() => imageSize.disconnect());
  const pointerOwner: { id: number | null } = { id: null };
  const space = createSpace({
    host: q('.px-space-host'), images: [q('[data-camera-image="a"]'), q('[data-camera-image="b"]')], signal, select, report: announce, pointerOwner,
  });
  page.onCleanup(space.destroy);
  function fitSignature(experiment: Experiment) { return JSON.stringify([experiment.observations, experiment.sigma]); }
  function setText(selector: string, text: string) { q<HTMLElement>(selector).textContent = text; }
  const matrixText = (m: M3) => m.map((row) => row.map((v) => v.toExponential(3).padStart(11)).join(' ')).join('\n');
  function render() {
    const e = history.current;
    results = reconstruct(e);
    if (fit && fitKey !== fitSignature(e)) fit = null;
    root.dataset.captureStudy = e.study;
    root.dataset.reconstructionMethod = e.method;
    q<HTMLSelectElement>('[data-study]').value = e.study;
    q<HTMLSelectElement>('[data-landmark]').value = e.selected;
    const result = results.find((r) => r.id === e.selected)!;
    const observation = e.observations.find((o) => o.id === e.selected)!;
    const landmark = WORLD.landmarks.find((p) => p.id === e.selected)!;
    root.querySelectorAll<HTMLButtonElement>('[data-method]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.method === e.method)));
    q<HTMLButtonElement>('[data-action="undo"]').disabled = !history.past.length;
    q<HTMLButtonElement>('[data-action="redo"]').disabled = !history.future.length;
    q<HTMLInputElement>('[data-reveal]').checked = e.reveal;
    q<HTMLInputElement>('[data-enabled]').checked = observation.enabled;
    setText('[data-point-id]', e.selected);
    setText('[data-point-label]', landmark.label);
    setText('[data-point-status]', result.rejected ? 'REJECTED' : result.estimate.status.toUpperCase());
    q<HTMLElement>('[data-point-status]').dataset.state = result.rejected ? 'rejected' : result.estimate.status;
    const coordinates = q<HTMLOutputElement>('[data-point3d]');
    const sigma = result.uncertainty ? Math.max(...result.uncertainty.radii) : 0;
    const digits = sigma >= 1 ? 0 : sigma >= 0.1 ? 1 : sigma >= 0.01 ? 2 : 3;
    coordinates.textContent = result.point ? result.point.map((v, i) => `${['X', 'Y', 'Z'][i]} ${v.toFixed(digits)}`).join('  ') + ' m' : 'No available 3D estimate';
    coordinates.dataset.xyz = result.point ? JSON.stringify(result.point) : '';
    setText('[data-reason]', result.rejected ? 'Calibrated epipolar outlier. Excluded from displayed/exported cloud.' : result.point ? result.refinement : result.estimate.reason);
    setText('[data-raw-rms]', `${fixed(result.rawResidual?.rms, 3)}${result.rawResidual ? ' px' : ''}`);
    setText('[data-rms]', `${fixed(result.residual?.rms, 3)}${result.residual ? ' px' : ''}`);
    q<HTMLElement>('[data-rms]').dataset.value = String(result.residual?.rms ?? '');
    setText('[data-angle]', result.raw ? `${fixed(result.estimate.angle)}°` : result.estimate.status === 'unstable' ? `${fixed(result.estimate.angle, 3)}° / unstable` : 'Unavailable');
    setText('[data-uncertainty]', result.uncertainty ? `${fixed(result.uncertainty.depthSigma, result.uncertainty.depthSigma < 0.01 ? 4 : 3)} m` : 'Unavailable');
    q<HTMLElement>('[data-uncertainty]').dataset.value = String(result.uncertainty?.depthSigma ?? '');
    setText('[data-epipolar]', Number.isFinite(result.epipolar) ? `${fixed(result.epipolar)} px` : 'Unavailable');
    for (const side of ['a', 'b'] as const) for (const [index, axis] of ['x', 'y'].entries()) {
      const input = q<HTMLInputElement>(`[data-pixel="${side}-${axis}"]`);
      input.disabled = !observation[side];
      input.value = observation[side] ? observation[side][index].toFixed(3) : '';
    }
    const paired = !!observation.a && !!observation.b;
    q<HTMLButtonElement>('.px-apply').disabled = !paired;
    q<HTMLButtonElement>('[data-action="epipolar-repair"]').disabled = !paired || e.calibration.baseline < 1e-6;
    setText('[data-recovered-count]', `${results.filter((r) => r.point).length} / ${e.observations.filter((o) => o.a && o.b).length} points`);
    q<HTMLElement>('.px-space-legend span').lastChild!.textContent = e.method === 'raw' ? ' Raw points' : ' Refined points';
    for (const key of ['baseline', 'focal', 'yaw'] as const) {
      q<HTMLInputElement>(`[data-rig="${key}"]`).value = String(e.calibration[key]);
      setText(`[data-value="${key}"]`, `${fixed(e.calibration[key], key === 'focal' ? 0 : 2)} ${key === 'baseline' ? 'm' : key === 'focal' ? 'px' : '°'}`);
    }
    for (const key of ['sigma', 'outliers'] as const) q<HTMLInputElement>(`[data-noise="${key}"]`).value = String(e[key]);
    setText('[data-value="sigma"]', `${fixed(e.sigma, 1)} px`);
    setText('[data-value="outliers"]', `${Math.round(e.outliers * 100)}% injected`);
    setText('[data-calibration-note]', `Captured at ${fixed(e.exposure.baseline)} m / ${e.exposure.focal} px / ${fixed(e.exposure.yaw, 1)}°. ${JSON.stringify(e.calibration) === JSON.stringify(e.exposure) ? 'Calibration matches the capture rig.' : 'Calibration differs from capture. This is an intentional model mismatch.'}`);
    q<HTMLElement>('[data-calibration-note]').dataset.mismatch = String(JSON.stringify(e.calibration) !== JSON.stringify(e.exposure));
    setText('[data-study-description]', STUDIES.find((s) => s.id === e.study)!.subtitle);
    setText('[data-threshold]', `${fixed(Math.max(2, 3 * e.sigma), 1)} px (Sampson distance)`);
    const [a, b] = cameras(e.study, e.calibration), f = fundamental(a, b);
    setText('[data-f-matrix]', matrixText(f));
    setText('[data-e-matrix]', matrixText(essential(a, b)));
    const pairedObservations = e.observations.filter((o) => o.a && o.b && o.enabled);
    if (fit?.f) {
      const distances = pairedObservations.map((o) => sampsonDistance(f, o.a!, o.b!)).sort((x, y) => x - y);
      setText('[data-fit-status]', `${fit.inliers.length} / ${pairedObservations.length} consensus inliers · median ${fixed(fit.median, 3)} px · ${fit.iterations} hypotheses. ${fit.reason}`);
      setText('[data-f-comparison]', `All-pair calibrated median: ${fixed(distances[Math.floor(distances.length / 2)], 3)} px. Estimated inlier median: ${fixed(fit.median, 3)} px. Different subsets: these medians are not an accuracy ranking.`);
    } else {
      setText('[data-fit-status]', fit?.reason ?? 'Optional: normalized eight-point fit with 240 seeded RANSAC hypotheses. It estimates image geometry, not camera pose or metric 3D.');
      setText('[data-f-comparison]', 'No current pixel-estimated F. Calibration remains the source of metric reconstruction.');
    }
    const truthOutput = q<HTMLElement>('[data-truth-error]');
    truthOutput.hidden = !e.reveal;
    truthOutput.textContent = result.point ? `Truth revealed · Euclidean error ${fixed(norm(sub(result.point, landmark.position)), 4)} m. Authored world shown as a faint wireframe.` : 'Truth revealed for comparison only. No estimated point to compare.';
    overlays.forEach((svg, i) => {
      const focused = svg.contains(document.activeElement);
      renderImageOverlay(svg, i === 0 ? 'a' : 'b', e, results, fit?.f ?? null);
      if (focused) svg.focus({ preventScroll: true });
      setText(`[data-visible="${i === 0 ? 'a' : 'b'}"]`, `${e.observations.filter((o) => i === 0 ? o.a : o.b).length} observed landmarks`);
    });
    space.update(e, results);
  }
  function change(mutator: (next: Experiment) => void, message?: string) {
    const next = structuredClone(history.current); mutator(next);
    commit(history, next); render();
    if (message) announce(message);
  }
  function select(id: string) { history.current.selected = id; render(); }
  function cycle(direction: number) {
    const paired = history.current.observations.filter((o) => o.a && o.b);
    if (!paired.length) { announce('No paired observations are available for this capture.'); return; }
    const index = paired.findIndex((o) => o.id === history.current.selected);
    select(paired[(index + direction + paired.length) % paired.length].id);
  }
  function recapture(next: Experiment) {
    next.observations = capture(next.study, next.exposure, next.sigma, next.outliers, next.seed);
    const selected = next.observations.find((o) => o.id === next.selected);
    if (!selected?.a || !selected.b) next.selected = next.observations.find((o) => o.a && o.b)?.id ?? next.observations[0].id;
  }
  function loadText(text: string) {
    const parsed = parseExperiment(text);
    if (!parsed.ok) { announce(parsed.error); return; }
    commit(history, parsed.value); fit = null; render();
    announce('Experiment loaded. Calibration, captured pixels and edits restored exactly.');
  }
  const paneTabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  function activatePane(button: HTMLButtonElement, focus = false) {
    root.dataset.activePane = button.dataset.tab;
    for (const tab of paneTabs) {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    button.parentElement?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (focus) button.focus({ preventScroll: true });
  }
  q<HTMLElement>('.px-mobile-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-tab]');
    const index = button ? paneTabs.indexOf(button) : -1;
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? paneTabs.length - 1 :
      (index + (event.key === 'ArrowRight' ? 1 : paneTabs.length - 1)) % paneTabs.length;
    activatePane(paneTabs[next], true);
  }, { signal });
  q<HTMLSelectElement>('[data-study]').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as StudyId;
    commit(history, createExperiment(value)); fit = null; render(); space.resetView();
    announce('Study loaded. Both exposures and observations were captured from the new rig.');
  }, { signal });
  q<HTMLSelectElement>('[data-landmark]').addEventListener('change', (event) => select((event.target as HTMLSelectElement).value), { signal });
  root.querySelectorAll<HTMLInputElement>('[data-rig]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.rig as 'baseline' | 'focal' | 'yaw';
    change((next) => { next.calibration[key] = Number(input.value); }, 'Assumed calibration changed. Captured images and observed pixels are unchanged.');
  }, { signal }));
  root.querySelectorAll<HTMLInputElement>('[data-noise]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.noise as 'sigma' | 'outliers';
    change((next) => { next[key] = Number(input.value); recapture(next); }, 'Pixel observations resampled with the same seeded capture recipe.');
  }, { signal }));
  q<HTMLInputElement>('[data-reveal]').addEventListener('change', (event) => change((next) => { next.reveal = (event.target as HTMLInputElement).checked; }), { signal });
  q<HTMLInputElement>('[data-enabled]').addEventListener('change', (event) => change((next) => { next.observations.find((o) => o.id === next.selected)!.enabled = (event.target as HTMLInputElement).checked; }), { signal });
  q<HTMLFormElement>('[data-pixels]').addEventListener('submit', (event) => {
    event.preventDefault();
    const a: V2 = [Number(q<HTMLInputElement>('[data-pixel="a-x"]').value), Number(q<HTMLInputElement>('[data-pixel="a-y"]').value)];
    const b: V2 = [Number(q<HTMLInputElement>('[data-pixel="b-x"]').value), Number(q<HTMLInputElement>('[data-pixel="b-y"]').value)];
    if (![a, b].every((p) => p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 960 && p[1] >= 0 && p[1] <= 640)) { announce('Pixels must be finite and inside the 960 × 640 image. The current observation is unchanged.'); return; }
    change((next) => { const o = next.observations.find((o) => o.id === next.selected)!; o.a = a; o.b = b; }, 'Observed pixels updated. The 3D point and its reprojection residuals were recomputed.');
  }, { signal });
  q<HTMLInputElement>('[data-import-file]').addEventListener('change', async (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const sequence = ++importSequence;
    if (file.size > 250_000) { announce('Experiment exceeds the 250 kB limit. The current study is unchanged.'); return; }
    const original = serialize(history.current);
    const revision = inputRevision;
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      if (signal.aborted || sequence !== importSequence) return;
      if (!(error instanceof DOMException)) throw error;
      announce('The file could not be read. The current study is unchanged.');
      return;
    }
    if (signal.aborted || sequence !== importSequence) return;
    if (revision !== inputRevision || original !== serialize(history.current)) {
      announce('Import cancelled because the study or its inputs changed while the file was being read. Your current work is preserved.');
      return;
    }
    loadText(text);
  }, { signal });
  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.method) {
      change((next) => { next.method = button.dataset.method as Method; });
      return;
    }
    if (button.dataset.tab) {
      activatePane(button);
      return;
    }
    if (button.dataset.orbitMode) {
      space.setMode(button.dataset.orbitMode as 'orbit' | 'pick');
      root.querySelectorAll('[data-orbit-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      return;
    }
    const action = button.dataset.action;
    if (action === 'undo') { undo(history); render(); announce('Previous valid experiment restored.'); }
    if (action === 'redo') { redo(history); render(); announce('Edit reapplied.'); }
    if (action === 'reset') { commit(history, createExperiment(history.current.study)); fit = null; render(); space.resetView(); announce('Study reset. Undo is available.'); }
    if (action === 'previous' || action === 'next') cycle(action === 'next' ? 1 : -1);
    if (action === 'home-view') space.resetView();
    if (action === 'edit-mode') {
      editMode = !editMode; button.setAttribute('aria-pressed', String(editMode)); root.dataset.editMode = String(editMode);
      setText('[data-capture-mode]', editMode ? 'Drag a dot. One pointer, one observation.' : 'Click a dot to inspect it.');
    }
    if (action === 'recapture') change((next) => { next.exposure = { ...next.calibration }; recapture(next); }, 'Both exposures recaptured with the assumed rig. Image geometry and calibration now agree.');
    if (action === 'new-seed') change((next) => { next.seed = (next.seed + 1) % 2147483648; recapture(next); }, 'New deterministic noise sample captured.');
    if (action === 'restore-match') change((next) => {
      const original = capture(next.study, next.exposure, next.sigma, next.outliers, next.seed).find((o) => o.id === next.selected)!;
      const index = next.observations.findIndex((o) => o.id === next.selected);
      next.observations[index] = original;
    }, 'Restored this match from the captured noise recipe, not from the reconstructed point.');
    if (action === 'epipolar-repair') {
      const e = history.current, o = e.observations.find((o) => o.id === e.selected)!;
      const repaired = o.a && o.b ? closestOnLine(o.b, epipolarLine(fundamental(...cameras(e.study, e.calibration)), o.a)) : null;
      if (!repaired || repaired[0] < 0 || repaired[0] > 960 || repaired[1] < 0 || repaired[1] > 640) { announce('No in-frame epipolar repair is available. The observation is unchanged.'); return; }
      change((next) => { next.observations.find((o) => o.id === next.selected)!.b = repaired; }, 'B moved perpendicular to the calibrated epipolar line. Along-line identity and depth can still be wrong.');
    }
    if (action === 'guide-wide' || action === 'guide-narrow') {
      const next = createExperiment('signal');
      next.calibration.baseline = action === 'guide-wide' ? 4 : 0.15;
      next.exposure = { ...next.calibration }; next.sigma = 1; next.seed = 117;
      recapture(next);
      const roof = WORLD.landmarks.find((p) => p.label === 'Signal ridge')!;
      if (next.observations.find((o) => o.id === roof.id)?.a && next.observations.find((o) => o.id === roof.id)?.b) next.selected = roof.id;
      commit(history, next); render();
      const selected = results.find((r) => r.id === next.selected)!;
      setText('[data-guide-reading]', `${next.calibration.baseline.toFixed(2)} m baseline · ${next.selected} · ray angle ${fixed(selected.estimate.angle)}° · depth σ ${fixed(selected.uncertainty?.depthSigma, 3)} m. Same 1 px sensor-noise model.`);
      announce('Guided capture ready. Compare the actual ray angle and modeled depth uncertainty.');
    }
    if (action === 'fit-f') {
      const e = history.current;
      const pairs = e.observations.flatMap((o) => o.a && o.b && o.enabled ? [{ a: o.a, b: o.b }] : []);
      fit = estimateFundamental(pairs, Math.max(2, 3 * e.sigma), e.seed);
      fitKey = fitSignature(e); render();
      announce(fit.f ? 'Pixel-estimated F is shown as a dashed line. Metric reconstruction still uses the known calibration.' : fit.reason);
    }
    if (action === 'export-json') { downloadText('parallax-experiment.json', serialize(history.current), 'application/json'); announce('Experiment JSON exported with calibration and observed pixel coordinates.'); }
    if (action === 'export-ply') {
      if (!results.some((r) => r.point)) { announce('No available reconstructed points to export. Repair the camera setup first.'); return; }
      downloadText('parallax-reconstruction.ply', exportPly(results)); announce('PLY exported. Only displayed, available estimates are included; no ground-truth coordinates.');
    }
    if (action === 'import-json') loadText(q<HTMLTextAreaElement>('[data-import-text]').value);
  }, { signal });
  let drag: { pointer: number; side: 'a' | 'b'; svg: SVGSVGElement; original: Experiment; id: string; moved: boolean } | null = null;
  overlays.forEach((svg, i) => {
    const side = i === 0 ? 'a' : 'b';
    svg.addEventListener('pointerdown', (event) => {
      if (drag || pointerOwner.id !== null || event.button !== 0) return;
      const feature = (event.target as Element).closest<SVGElement>('[data-feature]')?.dataset.feature;
      if (!feature) return;
      select(feature);
      svg.focus({ preventScroll: true });
      if (!editMode) return;
      event.preventDefault();
      pointerOwner.id = event.pointerId;
      drag = { pointer: event.pointerId, side, svg, original: structuredClone(history.current), id: feature, moved: false };
      svg.setPointerCapture(event.pointerId);
    }, { signal });
    svg.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointer !== event.pointerId || drag.svg !== svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      if (point.x < 0 || point.y < 0 || point.x > 960 || point.y > 640) return;
      const observation = history.current.observations.find((o) => o.id === drag!.id)!;
      observation[side] = [point.x, point.y]; drag.moved = true;
      render();
    }, { signal });
    const end = (event: PointerEvent, cancelled: boolean) => {
      if (!drag || drag.pointer !== event.pointerId || drag.svg !== svg) return;
      const next = history.current, original = drag.original, moved = drag.moved;
      drag = null; history.current = original;
      pointerOwner.id = null;
      if (moved && !cancelled) commit(history, next);
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      render();
      if (moved) announce(cancelled ? 'Pixel drag cancelled. Previous observation preserved.' : 'Pixel match moved. Reconstruction updated from the edited observation.');
    };
    svg.addEventListener('pointerup', (event) => end(event, false), { signal });
    svg.addEventListener('pointercancel', (event) => end(event, true), { signal });
    svg.addEventListener('lostpointercapture', (event) => end(event, true), { signal });
    svg.addEventListener('keydown', (event) => {
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); cycle(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1); }
      if (event.key === 'Enter' || event.key === ' ') {
        const id = (event.target as Element).closest<SVGElement>('[data-feature]')?.dataset.feature;
        if (id) { event.preventDefault(); select(id); }
      }
      if (event.key === 'Escape' && drag) {
        const previous = drag; drag = null; history.current = previous.original;
        pointerOwner.id = null;
        if (previous.svg.hasPointerCapture(previous.pointer)) previous.svg.releasePointerCapture(previous.pointer);
        render(); announce('Pixel drag cancelled.');
      }
    }, { signal });
  });
  render();
  return { destroy: page.destroy, reset: () => { commit(history, createExperiment()); fit = null; render(); } };
}
