import { query } from '../../core/page';
import { BANDS, LIMITS, MATERIALS, PRESETS, WALLS, WALL_LABELS } from './data';
import type { Room } from './data';
import { estimateRoom, imageSources } from './engine';
import type { ReflectionPath, ReflectionResult, RoomEstimate } from './engine';
import { buildImpulse, energyDecay } from './ir';
import type { Decay, ImpulseResponse } from './ir';

export interface AcousticDesign {
  room: Room;
  result: ReflectionResult;
  estimate: RoomEstimate;
  ir: ImpulseResponse;
  name: string;
}
export function calculateDesign(room: Room, name: string): AcousticDesign {
  const result = imageSources(room);
  return { room, name, result, estimate: estimateRoom(room), ir: buildImpulse(result.paths) };
}
const numberField = (label: string, field: string, min: number, max: number, step = 0.1) =>
  `<label class="roomtone-number"><span>${label}</span><span class="roomtone-input-unit"><input aria-label="${label}" type="number" min="${min}" max="${max}" step="${step}" data-field="${field}" inputmode="decimal"/><span>m</span></span></label>`;
const materialOptions = Object.entries(MATERIALS).map(([id, material]) => `<option value="${id}">${material.name}</option>`).join('');
export function studioMarkup(): string {
  return `<div class="roomtone-shell">
    <header class="roomtone-masthead">
      <div class="roomtone-brand"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M8 42V11h31v31H8Z M15 35V18h17v17H15Z M8 42l12-19 9 13L43 8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="43" cy="8" r="3" fill="#b25935"/></svg>
        <div><h1>Roomtone<span>.</span></h1><p>Architecture you can hear.</p></div>
      </div>
      <div class="roomtone-masthead-right"><span class="roomtone-edition">ACOUSTIC DESIGN STUDIO <span>Study series / 01</span></span><a href="#roomtone-notes">Model notes <span aria-hidden="true">&#8599;</span></a></div>
    </header>
    <main class="roomtone-workbench" data-project-preview>
      <div class="roomtone-toolbar">
        <label class="roomtone-preset-label"><span class="roomtone-eyebrow">Room study</span><select data-preset aria-label="Room preset">${PRESETS.map((preset, index) => `<option value="${preset.id}">0${index + 1} / ${preset.name}</option>`).join('')}</select></label>
        <div class="roomtone-toolbar-actions"><button type="button" data-action="pin"><span aria-hidden="true">+</span> Pin reference</button><button type="button" data-action="reset">Reset</button><button type="button" class="roomtone-export" data-action="export">Export IR <span aria-hidden="true">&#8595;</span></button></div>
      </div>
      <nav class="roomtone-mobile-panes" aria-label="Workbench panes"><button type="button" data-pane="space" aria-pressed="true">Space</button><button type="button" data-pane="edit" aria-pressed="false">Edit room</button><button type="button" data-pane="listen" aria-pressed="false">Listen &amp; measure</button></nav>
      <div class="roomtone-bench-grid">
        <div class="roomtone-main">
          <section class="roomtone-space" aria-labelledby="roomtone-space-title">
            <div class="roomtone-section-top"><div><p class="roomtone-eyebrow">01 / The architecture</p><h2 id="roomtone-space-title" data-room-name>Timber chamber</h2></div><div class="roomtone-segment" aria-label="Model view"><button type="button" data-view="cutaway" aria-pressed="true">3D cutaway</button><button type="button" data-view="plan" aria-pressed="false">Plan</button></div></div>
            <div class="roomtone-model-wrap">
              <div class="roomtone-model-notes"><span data-room-dimensions></span><span>Ceiling + two walls cut away</span></div>
              <div class="roomtone-scene" data-scene></div>
              <div class="roomtone-scene-caption"><span><i class="roomtone-signal-dot"></i>Selected reflection</span><span>1 m floor grid / not to screen scale</span></div>
            </div>
            <div class="roomtone-camera-toolbar"><span>Drag to orbit</span><div><button type="button" data-camera="left" aria-label="Rotate camera left">&#8592;</button><button type="button" data-camera="right" aria-label="Rotate camera right">&#8594;</button><button type="button" data-camera="up" aria-label="Raise camera">&#8593;</button><button type="button" data-camera="closer" aria-label="Zoom in">+</button><button type="button" data-camera="further" aria-label="Zoom out">&#8722;</button><button type="button" data-camera="home" aria-label="Reset camera">Home</button></div></div>
            <div class="roomtone-readouts">
              <div><span>Room volume</span><strong><span data-volume></span><small>m&#179;</small></strong></div>
              <div><span>Direct arrival</span><strong><span data-direct-delay></span><small>ms</small></strong></div>
              <div class="roomtone-rt-readout"><span>Eyring RT60 <em data-rt-band>500 Hz estimate</em></span><strong><span data-rt60></span><small>s</small></strong></div>
            </div>
          </section>
          <div class="roomtone-listen-pane">
            <section class="roomtone-analysis" aria-labelledby="roomtone-analysis-title">
              <div class="roomtone-section-top"><div><p class="roomtone-eyebrow">02 / The response</p><h2 id="roomtone-analysis-title">A room, in milliseconds.</h2></div><label class="roomtone-band-label">Octave band<select data-band aria-label="Analysis octave band">${BANDS.map((band, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${band >= 1000 ? `${band / 1000}k` : band} Hz</option>`).join('')}</select></label></div>
              <div class="roomtone-plots">
                <figure><figcaption><strong>Impulse response</strong><span>Relative pressure</span></figcaption><div data-ir-plot></div></figure>
                <figure><figcaption><strong>Energy remaining</strong><span>Schroeder integral</span></figcaption><div data-decay-plot></div></figure>
              </div>
              <p class="roomtone-measurement-note" data-decay-note></p>
              <div class="roomtone-reflection-inspector">
                <div class="roomtone-reflection-heading"><label for="roomtone-path">Inspect a real path</label><span data-path-count></span></div>
                <div class="roomtone-path-picker"><button type="button" data-action="previous-path" aria-label="Previous reflection">&#8592;</button><select id="roomtone-path" data-path aria-label="Reflection path"></select><button type="button" data-action="next-path" aria-label="Next reflection">&#8594;</button></div>
                <div class="roomtone-path-data"><strong data-path-delay></strong><span data-path-length></span><span data-path-level></span><span data-path-order></span></div>
                <p class="roomtone-path-route" data-path-route></p>
                <p class="roomtone-fineprint">Geometric arrivals use 343 m/s. The spectral IR adds a fixed 5.80 ms filter latency. Faint rays show first-order context.</p>
              </div>
            </section>
            <section class="roomtone-audition" aria-labelledby="roomtone-audio-title">
              <div class="roomtone-section-top"><div><p class="roomtone-eyebrow">03 / The listening room</p><h2 id="roomtone-audio-title">Hear the difference.</h2></div><span class="roomtone-audio-light" data-audio-light>Sound off</span></div>
              <p>One local sound. Your actual impulse response. No microphone.</p>
              <div class="roomtone-audio-selects">
                <label>Sound source<select data-example aria-label="Audition sound"><option value="click">Short click</option><option value="chord">Soft chord</option><option value="percussion">Wood percussion</option></select></label>
                <label>Audition<select data-audition aria-label="Audition design"><option value="current">A / Current room</option><option value="reference" disabled>B / Pinned reference</option><option value="dry">Dry / No room</option></select></label>
              </div>
              <div class="roomtone-audio-mix"><label>Wet mix <output data-wet-output>100%</output><input type="range" min="0" max="100" value="100" data-wet aria-label="Wet mix"/></label><label>Output level <output data-level-output>45%</output><input type="range" min="0" max="100" value="45" data-level aria-label="Output level"/></label></div>
              <div class="roomtone-audio-actions"><button type="button" data-action="play" class="roomtone-play"><span aria-hidden="true">&#9654;</span> Play once</button><button type="button" data-action="stop" disabled>Stop</button><span>All six bands / early reflections only</span></div>
              <p class="roomtone-audio-status" data-audio-status role="status">Sound is off. Play starts one example; nothing loops.</p>
              <p class="roomtone-audio-error" data-audio-error role="alert" hidden></p>
            </section>
            <section class="roomtone-comparison" aria-labelledby="roomtone-compare-title"><div class="roomtone-section-top"><div><p class="roomtone-eyebrow">Design A / Design B</p><h2 id="roomtone-compare-title">Keep a point of reference.</h2></div><button type="button" data-action="clear-reference" hidden>Clear B</button></div><div data-comparison><p>Pin this room, then change its geometry or materials. Compare real impulse energy and estimated reverberation time without losing your starting point.</p></div></section>
          </div>
        </div>
        <aside class="roomtone-inspector" aria-labelledby="roomtone-inspector-title">
          <div class="roomtone-section-top"><div><p class="roomtone-eyebrow">Room specification</p><h2 id="roomtone-inspector-title">Shape the sound.</h2></div><span class="roomtone-draft-cross" aria-hidden="true">+</span></div>
          <div class="roomtone-dimensions">${numberField('Width', 'width', ...LIMITS.width)}${numberField('Depth', 'depth', ...LIMITS.depth)}${numberField('Height', 'height', ...LIMITS.height)}</div>
          <p class="roomtone-input-feedback" data-input-feedback role="alert" hidden></p>
          <div class="roomtone-plan-heading"><h3>Source &amp; listener</h3><span>Drag S / L</span></div>
          <div data-floorplan></div>
          <div class="roomtone-position-row"><span class="roomtone-position-tag">S</span>${numberField('Source X', 'source.x', 0.15, 23.85, 0.01)}${numberField('Source Y', 'source.y', 0.15, 31.85, 0.01)}${numberField('Source height', 'source.z', 0.15, 11.85, 0.01)}</div>
          <div class="roomtone-position-row"><span class="roomtone-position-tag roomtone-listener-tag">L</span>${numberField('Listener X', 'listener.x', 0.15, 23.85, 0.01)}${numberField('Listener Y', 'listener.y', 0.15, 31.85, 0.01)}${numberField('Listener height', 'listener.z', 0.15, 11.85, 0.01)}</div>
          <p class="roomtone-fineprint">Metres from the southwest corner. Tab to a marker and use arrow keys, or enter coordinates above.</p>
          <div class="roomtone-material-heading"><h3>Surface palette</h3><span data-absorption-heading>Absorption / 500 Hz</span></div>
          <div class="roomtone-materials">${WALLS.map((wall) => `<label class="roomtone-material-row"><span class="roomtone-material-label"><i data-swatch="${wall}"></i>${WALL_LABELS[wall]}</span><select data-material="${wall}" aria-label="${WALL_LABELS[wall]} material">${materialOptions}</select><output data-absorption="${wall}"></output></label>`).join('')}</div>
          <p class="roomtone-fineprint">Absorption is the energy lost at each bounce. Higher values give weaker reflections. Presets are illustrative, not product specifications.</p>
          <div class="roomtone-budget"><label>Reflection order<select data-order aria-label="Reflection order">${Array.from({ length: 7 }, (_, i) => `<option value="${i}">${i}${i === 0 ? ' / direct only' : ''}</option>`).join('')}</select></label><p data-budget></p></div>
          <div class="roomtone-estimates"><p class="roomtone-eyebrow">Diffuse-field estimates</p><div><span>Sabine RT60</span><strong data-sabine></strong></div><div><span>Eyring RT60</span><strong data-eyring></strong></div><p>Neither is a measured RT60. Assumes well-mixed sound; early rays do not establish a diffuse field.</p></div>
        </aside>
      </div>
      <div class="roomtone-status" data-status role="status" aria-live="polite">Ready. Change a surface, follow a reflection, then listen.</div>
    </main>
    <section class="roomtone-notes" id="roomtone-notes" aria-labelledby="roomtone-notes-title"><div><p class="roomtone-eyebrow">A note on the model</p><h2 id="roomtone-notes-title">Geometry, not a crystal ball.</h2></div><div><p>Roomtone unfolds a rectangular room into mirrored copies, then folds each source-to-listener ray back through the real walls. Every path has a distance, a travel time, and a frequency-dependent loss.</p><p>This is a bounded, specular early-reflection model, not a wave simulation. No modes, diffraction, scattering, phase-inverting walls, or late diffuse tail are modeled. The decay graph ends with the finite IR; it is not a prediction of the room's full reverberation.</p><details><summary>Equations &amp; export details</summary><p>Delay = distance / 343 m/s. At each surface, pressure reflection = sqrt(1 &#8722; absorption). Path pressure is multiplied by every wall interaction, approximate bandwise air loss, and 1 / max(distance, 1 m). This near-field cap keeps coincident source/listener positions finite.</p><p>Six complementary 513-tap filters turn band pressures into a mono impulse response at 44.1 kHz, with fractional-sample interpolation and 5.80 ms of common filter latency. The 125 Hz band includes lower frequencies; the 4 kHz band extends to Nyquist. Graphs show the selected band; audio and export use all six. Positive band reflection factors and the finite filter bank are not a calibrated phase model.</p><p>RT60 estimates: Sabine = 0.161 V / A; Eyring = 0.161 V / (&#8722;S ln(1 &#8722;A/S)). A is area-weighted absorption. The finite energy curve is a backward sum of squared IR samples, displayed relative to its total energy. No RT60 is extrapolated from that truncated response.</p><p>WAV export is unnormalized, mono 32-bit IEEE float with a fact chunk. Audio uses this same IR in a real ConvolverNode, normalization disabled. A and B share a conservative gain bound and limiter. Start with a low device volume.</p></details></div></section>
    <footer class="roomtone-footer"><span>ROOMTONE / Architecture you can hear.</span><span>Made of space, surfaces &amp; time.</span></footer>
  </div>`;
}
export function syncInputs(root: HTMLElement, room: Room): void {
  for (const field of ['width', 'depth', 'height'] as const) query<HTMLInputElement>(root, `[data-field="${field}"]`).value = String(room[field]);
  for (const name of ['source', 'listener'] as const) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const input = query<HTMLInputElement>(root, `[data-field="${name}.${axis}"]`);
      input.value = String(room[name][axis]);
      input.max = String((axis === 'x' ? room.width : axis === 'y' ? room.depth : room.height) - LIMITS.margin);
    }
  }
  for (const wall of WALLS) query<HTMLSelectElement>(root, `[data-material="${wall}"]`).value = room.materials[wall];
  query<HTMLSelectElement>(root, '[data-order]').value = String(room.order);
}
export function renderReadouts(root: HTMLElement, design: AcousticDesign, band: number): void {
  const { room, estimate, result } = design;
  const text = (selector: string, value: string) => { query(root, selector).textContent = value; };
  text('[data-room-name]', design.name);
  text('[data-room-dimensions]', `${room.width.toFixed(1)} x ${room.depth.toFixed(1)} x ${room.height.toFixed(1)} m`);
  text('[data-volume]', estimate.volume.toFixed(1));
  text('[data-direct-delay]', (result.paths[0].delay * 1000).toFixed(1));
  text('[data-rt60]', estimate.eyring[band].toFixed(2));
  text('[data-rt-band]', `${BANDS[band]} Hz est.`);
  text('[data-sabine]', `${estimate.sabine[band].toFixed(2)} s`);
  text('[data-eyring]', `${estimate.eyring[band].toFixed(2)} s`);
  text('[data-budget]', `${result.paths.length} paths / ${LIMITS.paths} max. ${result.work.toLocaleString()} / 20,000 geometric work units.`);
  text('[data-absorption-heading]', `Absorption / ${BANDS[band]} Hz`);
  for (const wall of WALLS) {
    const material = MATERIALS[room.materials[wall]];
    query<HTMLElement>(root, `[data-swatch="${wall}"]`).style.background = material.color;
    text(`[data-absorption="${wall}"]`, `${Math.round(material.absorption[band] * 100)}%`);
  }
  root.dataset.volume = String(estimate.volume);
  root.dataset.irEnergy = String(design.ir.energy);
}
export function renderPaths(root: HTMLElement, design: AcousticDesign, selected: ReflectionPath, band: number, rebuild: boolean): void {
  const select = query<HTMLSelectElement>(root, '[data-path]');
  if (rebuild) select.innerHTML = design.result.paths.map((path, i) => `<option value="${path.id}">${i === 0 ? 'Direct sound' : `R${String(i).padStart(3, '0')} / ${path.order} bounce${path.order > 1 ? 's' : ''}`} / ${(path.delay * 1000).toFixed(2)} ms</option>`).join('');
  select.value = selected.id;
  query(root, '[data-path-count]').textContent = `${design.result.paths.length} computed paths`;
  query(root, '[data-path-delay]').textContent = `${(selected.delay * 1000).toFixed(2)} ms`;
  query(root, '[data-path-length]').textContent = `${selected.length.toFixed(2)} m travel`;
  query(root, '[data-path-level]').textContent = `${(20 * Math.log10(Math.max(1e-12, selected.amplitudes[band]))).toFixed(1)} dB re 1 m`;
  query(root, '[data-path-order]').textContent = `${selected.order} bounce${selected.order === 1 ? '' : 's'}`;
  query(root, '[data-path-route]').textContent = ['Source', ...selected.bounces.map((bounce) => WALL_LABELS[bounce.wall]), 'Listener'].join(' → ');
  root.dataset.selectedPath = selected.id;
}
function graphFrame(content: string, maxTime: number, yLabels: { value: string; y: number }[], label: string): string {
  return `<svg class="roomtone-plot" viewBox="0 0 500 210" role="img" aria-label="${label}">
    ${yLabels.map(({ value, y }) => `<line x1="100" x2="475" y1="${y}" y2="${y}" stroke="#b8c6b9" stroke-opacity=".55"/><text x="91" y="${y + 5}" text-anchor="end">${value}</text>`).join('')}
    ${[0, 0.25, 0.5, 0.75, 1].map((fraction) => `<text x="${100 + fraction * 375}" y="187" text-anchor="middle">${Math.round(maxTime * fraction * 1000)}</text>`).join('')}
    <text x="287" y="208" text-anchor="middle">Time / ms</text>${content}</svg>`;
}
function impulsePlot(ir: ImpulseResponse, selected: ReflectionPath, reference: ImpulseResponse | null, maxTime: number): string {
  const peak = Math.max(ir.peak, reference?.peak ?? 0, 1e-6);
  function envelope(response: ImpulseResponse, color: string, opacity: number): string {
    const commands: string[] = [];
    for (let bin = 0; bin < 360; bin++) {
      const start = Math.floor(bin / 360 * maxTime * response.sampleRate);
      const end = Math.min(response.samples.length, Math.max(start + 1, Math.floor((bin + 1) / 360 * maxTime * response.sampleRate)));
      let low = 0;
      let high = 0;
      for (let i = start; i < end; i++) { low = Math.min(low, response.samples[i]); high = Math.max(high, response.samples[i]); }
      if (low === 0 && high === 0) continue;
      const x = 100 + bin / 360 * 375;
      commands.push(`M${x.toFixed(1)},${(87 - high / peak * 65).toFixed(1)}V${(87 - low / peak * 65).toFixed(1)}`);
    }
    return `<path d="${commands.join(' ')}" stroke="${color}" stroke-width="1.3" opacity="${opacity}"/>`;
  }
  const x = 100 + (selected.delay + ir.filterLatency) / maxTime * 375;
  return graphFrame(
    `${reference ? envelope(reference, '#647d99', 0.7) : ''}${envelope(ir, '#af5532', 0.95)}<line x1="${x}" x2="${x}" y1="12" y2="159" stroke="#254f44" stroke-dasharray="3 4"/>`,
    maxTime, [{ value: peak.toFixed(3), y: 22 }, { value: '0', y: 87 }, { value: (-peak).toFixed(3), y: 152 }],
    'Computed band-limited impulse response. Copper is current; blue is pinned reference.',
  );
}
function decayPlot(decay: Decay, reference: Decay | null, maxTime: number): string {
  const curve = (value: Decay) => value.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(100 + p.time / maxTime * 375).toFixed(1)},${(20 + Math.min(60, -p.db) / 60 * 135).toFixed(1)}`).join(' ');
  return graphFrame(`${reference ? `<path d="${curve(reference)}" fill="none" stroke="#647d99" stroke-width="2" stroke-dasharray="5 4"/>` : ''}<path d="${curve(decay)}" fill="none" stroke="#af5532" stroke-width="2.4"/>`,
    maxTime, [{ value: '0 dB', y: 20 }, { value: '-20', y: 65 }, { value: '-40', y: 110 }, { value: '-60', y: 155 }], 'Finite impulse response energy decay, not measured room RT60.');
}
export function renderAnalysis(root: HTMLElement, design: AcousticDesign, reference: AcousticDesign | null, selected: ReflectionPath, band: number): void {
  const ir = buildImpulse(design.result.paths, band);
  const refIR = reference ? buildImpulse(reference.result.paths, band) : null;
  const decay = energyDecay(ir);
  const refDecay = refIR ? energyDecay(refIR) : null;
  const time = Math.max(ir.duration, refIR?.duration ?? 0);
  query(root, '[data-ir-plot]').innerHTML = impulsePlot(ir, selected, refIR, time);
  query(root, '[data-decay-plot]').innerHTML = decayPlot(decay, refDecay, time);
  query(root, '[data-decay-note]').textContent =
    `${BANDS[band]} Hz · finite -5 to -25 dB interval: ${decay.interval5to25 === null ? 'unavailable' : `${(decay.interval5to25 * 1000).toFixed(1)} ms`}. Not RT60; response is truncated at order ${design.room.order}.`;
}
export function renderComparison(root: HTMLElement, current: AcousticDesign, reference: AcousticDesign | null, band: number): void {
  const target = query(root, '[data-comparison]');
  query<HTMLButtonElement>(root, '[data-action="clear-reference"]').hidden = !reference;
  query<HTMLOptionElement>(root, '[data-audition] option[value="reference"]').disabled = !reference;
  if (!reference) {
    target.innerHTML = '<p>Pin this room, then change its geometry or materials. Compare real impulse energy and estimated reverberation time without losing your starting point.</p>';
    return;
  }
  const db = 10 * Math.log10(Math.max(1e-15, current.ir.energy) / Math.max(1e-15, reference.ir.energy));
  target.innerHTML = `<div class="roomtone-compare-legend"><span><i class="roomtone-signal-dot"></i>A / Current room</span><span><i class="roomtone-reference-dot"></i>B / ${reference.name}</span></div>
    <table><caption>Current versus pinned reference at ${BANDS[band]} Hz; IR energy is broadband.</caption><thead><tr><th scope="col">Measure</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>
      <tr><th scope="row">Volume / m&#179;</th><td>${current.estimate.volume.toFixed(1)}</td><td>${reference.estimate.volume.toFixed(1)}</td></tr>
      <tr><th scope="row">Eyring estimate / s</th><td>${current.estimate.eyring[band].toFixed(2)}</td><td>${reference.estimate.eyring[band].toFixed(2)}</td></tr>
      <tr><th scope="row">Finite IR energy</th><td>${current.ir.energy.toFixed(5)}</td><td>${reference.ir.energy.toFixed(5)}</td></tr>
    </tbody></table><p data-comparison-delta>Current IR energy: ${db >= 0 ? '+' : ''}${db.toFixed(2)} dB versus B. Plot overlays share axes; neither response is normalized.</p>`;
}
