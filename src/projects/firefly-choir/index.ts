import './style.css';
import { canvas2D } from '../../core/canvas';
import { createLoop } from '../../core/loop';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import { createWorkspaceDialog } from '../../core/workspace';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { DEFAULT_SETTINGS, GARDEN_NOTES } from './data';
import { ChoirEngine, MAX_FIREFLIES, MIN_FIREFLIES } from './engine';
import { GardenPainter } from './garden';

const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="2.5"/></svg>';
const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 10 7-10 7z" fill="currentColor"/></svg>';
const torchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 14-5 6m5-12 7 7 4-7-4-4-7 4Zm5-6 1-2m5 3 2-1m-2 7 3 1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'firefly-choir');
  page.root.dataset.workspace = 'true';
  page.root.setAttribute('aria-labelledby', 'fc-title');

  try {
    page.root.innerHTML = `
      <header class="fc-header">
        <div>
          <p class="fc-kicker"><span class="fc-number">043</span> Particle study <span aria-hidden="true">/</span> A nocturne</p>
          <h1 id="fc-title">Firefly <em>Choir</em><span class="fc-title-spark" aria-hidden="true">✳</span></h1>
        </div>
        <p class="fc-intro">A small night garden. Many little clocks,<br class="fc-desktop-break"> learning to glow together.</p>
        <button type="button" class="fc-guide-button" data-guide>Field notes ↗</button>
      </header>

      <div class="fc-workbench">
        <div class="fc-garden" data-garden data-project-preview tabindex="0"
          role="group" aria-label="Interactive firefly garden" aria-describedby="fc-garden-help"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight T Space Home">
          <div class="fc-canvas-host" data-canvas-host></div>
          <div class="fc-scene-heading" aria-hidden="true">
            <span><i class="fc-live-dot"></i> The night garden</span>
            <span data-garden-state>Finding a rhythm</span>
          </div>
          <div class="fc-scene-footer" aria-hidden="true">
            <div><p>Every light listens.</p><span>A silent gathering, under the leaves.</span></div>
            <span class="fc-torch-hint" data-torch-hint>Touch the clearing <span>↗</span></span>
          </div>
        </div>

        <aside class="fc-desk" aria-label="Garden controls">
          <div class="fc-desk-heading"><p class="fc-eyebrow">A little conducting</p><h2>Tend the rhythm</h2></div>
          <div class="fc-transport">
            <button type="button" class="fc-play" data-play aria-label="Pause animation">${pauseIcon}<span>Pause</span></button>
            <button type="button" class="fc-scatter" data-scatter aria-label="Scatter phases"><span aria-hidden="true">⤮</span> Scatter</button>
          </div>
          <fieldset class="fc-settings">
            <legend class="fc-sr-only">Gathering behavior</legend>
            <div class="fc-setting">
              <div class="fc-setting-label"><label for="fc-count">Firefly count</label><output for="fc-count" data-count-output aria-live="off">${DEFAULT_SETTINGS.count}</output></div>
              <input id="fc-count" type="range" min="${MIN_FIREFLIES}" max="${MAX_FIREFLIES}" step="20" value="${DEFAULT_SETTINGS.count}">
            </div>
            <div class="fc-setting">
              <div class="fc-setting-label"><label for="fc-coupling">Neighbor coupling</label><output for="fc-coupling" data-coupling-output aria-live="off">${DEFAULT_SETTINGS.coupling}</output></div>
              <input id="fc-coupling" type="range" min="0" max="5" step="0.1" value="${DEFAULT_SETTINGS.coupling}">
              <div class="fc-range-ends" aria-hidden="true"><span>Independent</span><span>In step</span></div>
            </div>
            <div class="fc-setting">
              <div class="fc-setting-label"><label for="fc-breeze">Breeze</label><output for="fc-breeze" data-breeze-output aria-live="off">East · 12%</output></div>
              <input id="fc-breeze" type="range" min="-100" max="100" step="1" value="${DEFAULT_SETTINGS.breeze * 100}">
            </div>
          </fieldset>

          <div class="fc-coherence">
            <svg class="fc-coherence-ring" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="26" class="fc-ring-track"/>
              <circle cx="32" cy="32" r="26" class="fc-ring-value" data-coherence-ring/>
              <path d="M29 32h6m-3-3v6"/>
            </svg>
            <div class="fc-readout"><span>Phase agreement</span><div><output data-coherence aria-label="Phase agreement" aria-live="off">0</output><span>%</span></div></div>
            <span class="fc-readout-note">A shared<br>internal clock.</span>
          </div>

          <button type="button" class="fc-torch" data-torch aria-label="Enable torch" aria-pressed="false">${torchIcon}<span data-torch-label>Bring a torch</span><span class="fc-torch-indicator" aria-hidden="true"></span></button>
          <p class="fc-status" data-status role="status">Tap the garden to lend a little light.</p>
          <p class="fc-keyboard" id="fc-garden-help">Focus the garden: arrow keys move the torch, <kbd>T</kbd> toggles it, <kbd>Space</kbd> pauses. <kbd>Home</kbd> centers the torch.</p>
        </aside>
      </div>

      <section class="fc-notes" aria-labelledby="fc-notes-title">
        <div class="fc-notes-heading"><h2 id="fc-notes-title">Field notes</h2><span>No sound. Just shared light.</span></div>
        <div class="fc-note-grid">${GARDEN_NOTES.map((note) => `
          <article class="fc-note"><span class="fc-note-number">${note.number}</span><div><h3>${escapeMarkup(note.title)}</h3><p>${escapeMarkup(note.text)}</p></div></article>`).join('')}
        </div>
      </section>
      <footer class="fc-colophon">
        <p><strong>An illustrative model.</strong> Simplified flocking + local phase-coupled clocks. Phase agreement is the magnitude of the mean phase vector, calculated from these lights—not a biological measurement.</p>
        <button type="button" data-reset>Begin again <span aria-hidden="true">↺</span></button>
      </footer>`;

    query(page.root, '[data-garden]').append(query(page.root, '.fc-coherence'));
    createWorkspaceDialog(page, {
      id: 'fc-guide',
      title: 'Field notes',
      triggers: [query(page.root, '[data-guide]')],
      content: [
        query(page.root, '.fc-intro'),
        query(page.root, '.fc-desk-heading'),
        query(page.root, '.fc-status'),
        query(page.root, '.fc-keyboard'),
        query(page.root, '.fc-range-ends'),
        query(page.root, '.fc-readout-note'),
        query(page.root, '.fc-notes'),
        query(page.root, '.fc-colophon'),
      ],
    });
    const garden = query<HTMLElement>(page.root, '[data-garden]');
    const canvasHost = query<HTMLElement>(page.root, '[data-canvas-host]');
    const play = query<HTMLButtonElement>(page.root, '[data-play]');
    const scatter = query<HTMLButtonElement>(page.root, '[data-scatter]');
    const torch = query<HTMLButtonElement>(page.root, '[data-torch]');
    const torchLabel = query<HTMLElement>(page.root, '[data-torch-label]');
    const torchHint = query<HTMLElement>(page.root, '[data-torch-hint]');
    const status = query<HTMLElement>(page.root, '[data-status]');
    const gardenState = query<HTMLElement>(page.root, '[data-garden-state]');
    const countInput = query<HTMLInputElement>(page.root, '#fc-count');
    const couplingInput = query<HTMLInputElement>(page.root, '#fc-coupling');
    const breezeInput = query<HTMLInputElement>(page.root, '#fc-breeze');
    const countOutput = query<HTMLOutputElement>(page.root, '[data-count-output]');
    const couplingOutput = query<HTMLOutputElement>(page.root, '[data-coupling-output]');
    const breezeOutput = query<HTMLOutputElement>(page.root, '[data-breeze-output]');
    const coherenceOutput = query<HTMLOutputElement>(page.root, '[data-coherence]');
    const coherenceRing = query<SVGCircleElement>(page.root, '[data-coherence-ring]');

    let engine = new ChoirEngine(DEFAULT_SETTINGS);
    page.onCleanup(() => engine.dispose());
    const surface = canvas2D(canvasHost, 'A moonlit garden framed by ferns, with fireflies flashing to locally shared rhythms.');
    page.onCleanup(surface.dispose);
    const painter = new GardenPainter();
    page.onCleanup(() => painter.dispose());
    painter.resize(surface.size);

    let paused = context.reducedMotion;
    let lastReadout = -1;
    let readoutRequested = true;

    function updateReadout() {
      const coherence = engine.coherence;
      coherenceOutput.value = String(Math.round(coherence * 100));
      coherenceRing.style.strokeDasharray = `${coherence * 163.363} 163.363`;
      lastReadout = engine.time;
      readoutRequested = false;
    }

    function draw(delta: number) {
      engine.step(delta);
      painter.draw(surface.context, engine);
      garden.dataset.simulationTime = engine.time.toFixed(3);
      if (readoutRequested || delta === 0 || engine.time - lastReadout >= 0.25) updateReadout();
    }

    const loop = createLoop((_elapsed, delta) => draw(delta), { paused });
    page.onCleanup(loop.destroy);

    function requestDraw() {
      readoutRequested = true;
      loop.requestRender();
    }

    function updateControls() {
      countInput.value = String(engine.fireflies.length);
      couplingInput.value = String(engine.coupling);
      breezeInput.value = String(Math.round(engine.breeze * 100));
      countOutput.value = countInput.value;
      couplingOutput.value = engine.coupling.toFixed(1);
      const strength = Math.round(Math.abs(engine.breeze) * 100);
      breezeOutput.value = strength ? `${engine.breeze > 0 ? 'East' : 'West'} · ${strength}%` : 'Still';
      breezeInput.setAttribute('aria-valuetext', strength
        ? `${strength} percent ${engine.breeze > 0 ? 'eastward' : 'westward'}` : 'Still air');
      couplingInput.setAttribute('aria-valuetext', `${engine.coupling.toFixed(1)} out of 5${engine.coupling === 0 ? ', independent clocks' : ''}`);
      garden.dataset.particleCount = String(engine.fireflies.length);
      for (const input of [countInput, couplingInput, breezeInput]) {
        const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
        input.style.setProperty('--fc-range-fill', `${fraction * 100}%`);
      }
    }

    function updateTorch() {
      torch.setAttribute('aria-pressed', String(engine.torch.enabled));
      torch.setAttribute('aria-label', engine.torch.enabled ? 'Disable torch' : 'Enable torch');
      torchLabel.textContent = engine.torch.enabled ? 'Put the torch away' : 'Bring a torch';
      torchHint.innerHTML = engine.torch.enabled ? 'Your light, their rhythm <span>↗</span>' : 'Touch the clearing <span>↗</span>';
      garden.dataset.torch = engine.torch.enabled ? 'on' : 'off';
      garden.dataset.torchX = engine.torch.x.toFixed(3);
      garden.dataset.torchY = engine.torch.y.toFixed(3);
    }

    function setPaused(value: boolean) {
      paused = value;
      loop.setPaused(paused);
      play.innerHTML = `${paused ? playIcon : pauseIcon}<span>${paused ? 'Play' : 'Pause'}</span>`;
      play.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
      page.root.dataset.motion = paused ? 'paused' : 'playing';
      gardenState.textContent = paused ? 'A held moment' : 'Finding a rhythm';
      status.textContent = paused ? 'A held moment. The torch and controls still work.' : 'The clocks are running. Give the gathering a little time.';
    }

    function setTorch(enabled: boolean) {
      engine.setTorch(engine.torch.x, engine.torch.y, enabled);
      updateTorch();
      requestDraw();
      status.textContent = enabled
        ? 'Torch lit. Move through the clearing, or use the arrow keys in the garden.'
        : 'Torch away. The lights listen only to one another.';
    }

    function reset() {
      engine.dispose();
      engine = new ChoirEngine(DEFAULT_SETTINGS);
      lastReadout = -1;
      updateControls();
      updateTorch();
      requestDraw();
      status.textContent = `The original gathering is back.${paused ? ' Motion is still paused.' : ''}`;
    }

    play.addEventListener('click', () => setPaused(!paused), { signal: page.signal });
    scatter.addEventListener('click', () => {
      engine.scatterPhases();
      requestDraw();
      status.textContent = `The clocks are scattered.${paused ? ' Play to let them find a rhythm.' : ' Watch nearby lights find one another again.'}`;
    }, { signal: page.signal });
    torch.addEventListener('click', () => {
      setTorch(!engine.torch.enabled);
      if (engine.torch.enabled) garden.focus({ preventScroll: true });
    }, { signal: page.signal });
    query<HTMLButtonElement>(page.root, '[data-reset]').addEventListener('click', reset, { signal: page.signal });

    countInput.addEventListener('input', () => {
      engine.setCount(Number(countInput.value));
      updateControls();
      requestDraw();
    }, { signal: page.signal });
    couplingInput.addEventListener('input', () => {
      engine.setCoupling(Number(couplingInput.value));
      updateControls();
      requestDraw();
    }, { signal: page.signal });
    breezeInput.addEventListener('input', () => {
      engine.setBreeze(Number(breezeInput.value) / 100);
      updateControls();
      requestDraw();
    }, { signal: page.signal });

    function moveTorch(event: PointerEvent) {
      const bounds = garden.getBoundingClientRect();
      engine.setTorch((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, true);
      updateTorch();
      requestDraw();
    }
    garden.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      garden.focus({ preventScroll: true });
      if (!engine.torch.enabled) setTorch(true);
      moveTorch(event);
      garden.setPointerCapture(event.pointerId);
    }, { signal: page.signal });
    garden.addEventListener('pointermove', (event) => {
      if (engine.torch.enabled && (event.pointerType === 'mouse' || event.buttons !== 0)) moveTorch(event);
    }, { signal: page.signal });
    garden.addEventListener('pointerup', (event) => {
      if (garden.hasPointerCapture(event.pointerId)) garden.releasePointerCapture(event.pointerId);
    }, { signal: page.signal });
    garden.addEventListener('keydown', (event) => {
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      if (event.key in moves) {
        event.preventDefault();
        const direction = moves[event.key];
        const distance = event.shiftKey ? 0.08 : 0.035;
        if (!engine.torch.enabled) setTorch(true);
        engine.setTorch(engine.torch.x + direction[0] * distance, engine.torch.y + direction[1] * distance, true);
        updateTorch();
        requestDraw();
      } else if (event.code === 'Space') {
        event.preventDefault();
        setPaused(!paused);
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setTorch(!engine.torch.enabled);
      } else if (event.key === 'Home') {
        event.preventDefault();
        engine.setTorch(0.52, 0.56, true);
        updateTorch();
        requestDraw();
      }
    }, { signal: page.signal });
    surface.canvas.addEventListener('canvasresize', () => {
      painter.resize(surface.size);
      draw(0);
    }, { signal: page.signal });
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', () => setPaused(preference.matches), { signal: page.signal });

    updateControls();
    updateTorch();
    setPaused(paused);
    if (paused) status.textContent = 'Motion is held for your reduced-motion preference. Play whenever you like.';
    else status.textContent = 'Tap the garden to lend a little light.';
    draw(0);

    return { destroy: page.destroy, setPaused, reset };
  } catch (error) {
    page.destroy();
    throw error;
  }
}
