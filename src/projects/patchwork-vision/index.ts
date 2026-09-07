import './style.css';
import { canvas2D } from '../../core/canvas';
import { createProjectPage, downloadText, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { COLORS, DEFAULT_DESCRIPTOR, DEFAULT_TEMPERATURE, FEATURE_LABELS, GRID_SIDE, PATCH_COUNT, SCENES, SHAPES } from './data';
import { extractFeatures, matchImage, parseDescriptor, rasterizePatch } from './engine';
import type { MatchResult, Patch, Pooling } from './types';
import { drawMosaic, number, sceneMarkup } from './visuals';
import { pageMarkup } from './view';
import { createVisionWorkspace } from './workspace';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'patchwork-vision');
  const { root, signal } = page;
  root.innerHTML = pageMarkup();
  createVisionWorkspace(page);
  let scene = SCENES[0];
  let patches = scene.patches.map((patch) => ({ ...patch }));
  let selected = 0;
  let pooling: Pooling = 'attention';
  let temperature = DEFAULT_TEMPERATURE;
  let disposed = false;
  let current: MatchResult | null = null;
  const history: { patches: Patch[]; selected: number }[] = [];
  const surface = canvas2D(query<HTMLElement>(root, '[data-image]'), 'Original synthetic pixel image, divided into sixteen editable patches');
  const sceneSelect = query<HTMLSelectElement>(root, '[data-scene]');
  const colorSelect = query<HTMLSelectElement>(root, '[data-color]');
  const shapeSelect = query<HTMLSelectElement>(root, '[data-shape]');
  const descriptorInput = query<HTMLInputElement>(root, '[data-descriptor]');
  const textColor = query<HTMLSelectElement>(root, '[data-text-color]');
  const textShape = query<HTMLSelectElement>(root, '[data-text-shape]');
  const poolingSelect = query<HTMLSelectElement>(root, '[data-pooling]');
  const temperatureInput = query<HTMLInputElement>(root, '[data-temperature]');
  const overlayInput = query<HTMLInputElement>(root, '[data-overlay]');
  const patchButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-patch]')];
  const text = (selector: string, value: string) => { query<HTMLElement>(root, selector).textContent = value; };

  query<HTMLElement>(root, '[data-comparisons]').innerHTML = SCENES.map((candidate) =>
    `<button type="button" class="pw-scene-card" data-gallery-scene="${candidate.id}">
      <span class="pw-scene-thumbnail">${sceneMarkup(candidate.patches, candidate.name)}</span>
      <span class="pw-scene-copy"><strong>${escapeMarkup(candidate.name)}</strong><span>${escapeMarkup(candidate.description)}</span><span class="pw-load-label">Load original scene</span></span>
      <span class="pw-scene-score"><span>Cosine</span><output data-candidate-score="${candidate.id}"></output></span>
    </button>`).join('');

  function announce(message: string): void {
    text('[data-announcement]', message);
  }

  function paint(): void {
    if (!disposed) drawMosaic(surface.context, surface.size, patches);
  }

  function render(): void {
    if (disposed) return;
    const parsed = parseDescriptor(descriptorInput.value);
    current = parsed.ok ? matchImage(patches, parsed.descriptor, temperature, pooling) : null;
    root.dataset.descriptor = parsed.ok ? parsed.descriptor.text : 'unsupported';
    root.dataset.score = current?.cosine === null || !current ? 'unscorable' : current.cosine.toFixed(12);
    root.dataset.pooling = pooling;
    root.dataset.selected = String(selected + 1);
    root.dataset.overlay = String(overlayInput.checked);
    root.dataset.active = String(current?.activeCount ?? patches.filter((patch) => patch.shape !== 'empty').length);
    descriptorInput.setAttribute('aria-invalid', String(!parsed.ok));
    text('[data-query-message]', parsed.ok
      ? 'Fixed dictionary mapping, not language understanding.'
      : parsed.message);
    query<HTMLElement>(root, '[data-query-message]').classList.toggle('is-error', !parsed.ok);
    if (parsed.ok) {
      textColor.value = parsed.descriptor.color ?? '';
      textShape.value = parsed.descriptor.shape ?? '';
    }
    const changed = JSON.stringify(patches) !== JSON.stringify(scene.patches);
    text('[data-scene-state]', changed ? 'Edited pixels' : 'Original pixels');
    query<HTMLButtonElement>(root, '[data-undo]').disabled = history.length === 0;
    query<HTMLButtonElement>(root, '[data-export]').disabled = !parsed.ok;
    colorSelect.value = patches[selected].color;
    colorSelect.disabled = patches[selected].shape === 'empty';
    shapeSelect.value = patches[selected].shape;
    temperatureInput.disabled = pooling === 'mean';
    text('[data-temperature-value]', temperature.toFixed(2));
    text('[data-pooling-note]', pooling === 'attention'
      ? 'Lower temperature concentrates weight on high-cosine patches. This is evidence selection, not calibrated confidence.'
      : 'Equal weight for every nonempty patch. Temperature has no effect in this mode.');
    text('[data-score-label]', pooling === 'attention' ? 'Attention-pooled cosine' : 'Mean-pooled cosine');
    text('[data-score]', number(current?.cosine ?? null));
    text('[data-live-score]', number(current?.cosine ?? null));
    text('[data-mean-score]', number(current?.meanCosine ?? null));
    text('[data-entropy]', current ? `${number(current.entropy, 2)} bits` : 'n/a');
    text('[data-weight-sum]', current ? `${number(current.weights.reduce((sum, value) => sum + value, 0))} / ${current.activeCount}` : 'n/a');
    query<HTMLElement>(root, '[data-score-bar]').style.width = `${(current?.cosine ?? 0) * 100}%`;
    text('[data-score-note]', !parsed.ok
      ? 'No score: this descriptor is outside the supported vocabulary.'
      : !current?.activeCount
        ? 'No occupied patches. Paint a shape to create a visual token.'
        : 'cosine(sum of weighted visual tokens, text). Generic cosine range: -1 to 1; these nonnegative features yield 0 to 1.');

    patchButtons.forEach((button, index) => {
      const weight = current?.weights[index] ?? 0;
      const patch = patches[index];
      button.setAttribute('aria-label', `Patch ${index + 1}: ${patch.shape === 'empty' ? 'empty' : `${patch.color} ${patch.shape}`}, weight ${(weight * 100).toFixed(1)} percent`);
      button.setAttribute('aria-pressed', String(index === selected));
      button.tabIndex = index === selected ? 0 : -1;
      button.style.setProperty('--pw-patch-shade', String(Math.min(weight * 1.6, 0.64)));
      text(`[data-weight="${index}"]`, !current ? '--' : weight === 0 ? '0%' : `${(weight * 100).toFixed(1)}%`);
    });

    const token = current?.tokens[selected] ?? extractFeatures(rasterizePatch(patches[selected]));
    text('[data-selected-title]', `Patch ${String(selected + 1).padStart(2, '0')}`);
    text('[data-coverage]', `${(token.coverage * 100).toFixed(1)}% painted`);
    text('[data-selected-description]', patches[selected].shape === 'empty'
      ? 'Empty pixels produce a zero token. Cosine is undefined, and this patch receives zero weight.'
      : `${patches[selected].color} ${patches[selected].shape} / extracted from the actual 28 x 28 raster, not its label.`);
    FEATURE_LABELS.forEach((_, index) => {
      query<HTMLElement>(root, `[data-feature-bar="${index}"]`).style.width = `${token.features[index] * 100}%`;
      text(`[data-feature-value="${index}"]`, number(token.features[index]));
    });
    text('[data-unit-vector]', `[${token.unit.map((value) => number(value, 2)).join(', ')}]`);
    text('[data-text-vector]', parsed.ok ? `[${parsed.descriptor.unit.map((value) => number(value, 2)).join(', ')}]` : 'No supported descriptor');
    const selectedSimilarity = current?.similarities[selected] ?? null;
    text('[data-patch-cosine]', number(selectedSimilarity));
    text('[data-patch-weight]', current ? number(current.weights[selected], 4) : 'n/a');
    text('[data-patch-contribution]', current && selectedSimilarity !== null
      ? number(current.weights[selected] * selectedSimilarity, 4) : 'n/a');
    query<HTMLElement>(root, '[data-ledger]').innerHTML = patches.map((patch, index) => {
      const similarity = current?.similarities[index] ?? null;
      const weight = current?.weights[index] ?? null;
      return `<tr${index === selected ? ' class="is-selected"' : ''}>
        <th scope="row">${String(index + 1).padStart(2, '0')}${patch.shape === 'empty' ? ' / masked' : ''}</th>
        <td>${number(similarity, 4)}</td><td>${number(weight, 4)}</td>
        <td>${number(similarity !== null && weight !== null ? similarity * weight : null, 4)}</td></tr>`;
    }).join('');
    text('[data-ledger-sum]', current ? number(current.weights.reduce((sum, value) => sum + value, 0), 4) : 'n/a');
    text('[data-ledger-contribution]', number(current?.weightedSimilarity ?? null, 4));

    const candidateScores = SCENES.map((candidate) => parsed.ok
      ? matchImage(candidate.patches, parsed.descriptor, temperature, pooling).cosine
      : null);
    const best = Math.max(...candidateScores.map((value) => value ?? -1));
    SCENES.forEach((candidate, index) => {
      text(`[data-candidate-score="${candidate.id}"]`, number(candidateScores[index]));
      const button = query<HTMLButtonElement>(root, `[data-gallery-scene="${candidate.id}"]`);
      button.classList.toggle('is-best', candidateScores[index] !== null && candidateScores[index] === best);
      button.setAttribute('aria-label', `Load ${candidate.name}, cosine ${number(candidateScores[index])}`);
    });
  }

  function remember(): void {
    history.push({ patches: patches.map((patch) => ({ ...patch })), selected });
    if (history.length > 32) history.shift();
  }

  function updateImage(message: string): void {
    paint();
    render();
    announce(message);
  }

  function chooseScene(id: string): void {
    const next = SCENES.find((candidate) => candidate.id === id);
    if (!next) throw new RangeError('Unknown scene.');
    scene = next;
    sceneSelect.value = next.id;
    patches = next.patches.map((patch) => ({ ...patch }));
    history.length = 0;
    selected = 0;
    updateImage(`Loaded ${next.name}.`);
  }

  function resetImage(): void {
    if (disposed) return;
    if (JSON.stringify(patches) !== JSON.stringify(scene.patches)) remember();
    patches = scene.patches.map((patch) => ({ ...patch }));
    selected = 0;
    updateImage('Original scene restored. The descriptor and pooling controls are unchanged.');
  }

  function selectPatch(index: number, focus = false): void {
    if (!Number.isInteger(index) || index < 0 || index >= PATCH_COUNT) throw new RangeError('Unknown patch.');
    selected = index;
    render();
    if (focus) patchButtons[index].focus();
  }

  surface.canvas.addEventListener('canvasresize', paint, { signal });
  sceneSelect.addEventListener('change', () => chooseScene(sceneSelect.value), { signal });
  colorSelect.addEventListener('change', () => {
    const color = COLORS.find((candidate) => candidate.id === colorSelect.value);
    if (!color) throw new RangeError('Unknown paint color.');
    remember();
    patches[selected] = { ...patches[selected], color: color.id };
    updateImage(`Patch ${selected + 1} color changed to ${color.label}.`);
  }, { signal });
  shapeSelect.addEventListener('change', () => {
    const shape = shapeSelect.value === 'empty' ? 'empty' : SHAPES.find((candidate) => candidate.id === shapeSelect.value)?.id;
    if (!shape) throw new RangeError('Unknown paint shape.');
    remember();
    patches[selected] = { ...patches[selected], shape };
    updateImage(`Patch ${selected + 1} shape changed to ${shape}.`);
  }, { signal });
  query<HTMLElement>(root, '.pw-patch-grid').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-patch]');
    if (button) selectPatch(Number(button.dataset.patch));
  }, { signal });
  query<HTMLElement>(root, '.pw-patch-grid').addEventListener('keydown', (event) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -GRID_SIDE, ArrowDown: GRID_SIDE };
    if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? PATCH_COUNT - 1
      : (selected + offsets[event.key] + PATCH_COUNT) % PATCH_COUNT;
    selectPatch(next, true);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-undo]').addEventListener('click', () => {
    const previous = history.pop();
    if (!previous) {
      page.report('There are no image edits to undo.');
      return;
    }
    patches = previous.patches;
    selected = previous.selected;
    updateImage('Previous image restored.');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-swap]').addEventListener('click', () => {
    remember();
    patches = [...patches].reverse();
    selected = PATCH_COUNT - 1 - selected;
    updateImage('Arrangement flipped. Without positional features, the image score is unchanged.');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-clear]').addEventListener('click', () => {
    remember();
    patches = patches.map((patch) => ({ ...patch, shape: 'empty' }));
    updateImage('Image cleared. Empty pixels cannot be scored; choose a shape to paint a patch.');
  }, { signal });
  query<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', resetImage, { signal });
  descriptorInput.addEventListener('input', render, { signal });
  query<HTMLFormElement>(root, '[data-descriptor-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    render();
    const parsed = parseDescriptor(descriptorInput.value);
    page.report(parsed.ok ? `Using the fixed descriptor "${parsed.descriptor.text}".` : parsed.message);
  }, { signal });
  query<HTMLElement>(root, '.pw-descriptor-chips').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-descriptor-preset]');
    if (button?.dataset.descriptorPreset) {
      descriptorInput.value = button.dataset.descriptorPreset;
      render();
    }
  }, { signal });
  for (const select of [textColor, textShape]) {
    select.addEventListener('change', () => {
      descriptorInput.value = [textColor.value, textShape.value].filter(Boolean).join(' ');
      render();
    }, { signal });
  }
  poolingSelect.addEventListener('change', () => {
    if (poolingSelect.value !== 'attention' && poolingSelect.value !== 'mean') throw new RangeError('Unknown pooling mode.');
    pooling = poolingSelect.value;
    render();
  }, { signal });
  temperatureInput.addEventListener('input', () => {
    const value = Number(temperatureInput.value);
    if (!Number.isFinite(value) || value < 0.05 || value > 1) {
      page.report('Choose an attention temperature between 0.05 and 1.');
      return;
    }
    temperature = value;
    render();
  }, { signal });
  overlayInput.addEventListener('change', render, { signal });
  query<HTMLElement>(root, '[data-comparisons]').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-gallery-scene]');
    if (button?.dataset.galleryScene) chooseScene(button.dataset.galleryScene);
  }, { signal });
  query<HTMLButtonElement>(root, '[data-export]').addEventListener('click', () => {
    const parsed = parseDescriptor(descriptorInput.value);
    if (!parsed.ok) {
      page.report(parsed.message);
      return;
    }
    downloadText('patchwork-vision-snapshot.json', JSON.stringify({
      model: 'Fixed palette counts and template-mask affinities. No learned weights.',
      featureOrder: FEATURE_LABELS,
      shapeAffinity: 'exp(-12 * (1 - intersection / union)); L2-normalize the three shape affinities',
      tileSize: 28,
      descriptor: parsed.descriptor,
      temperature,
      pooling,
      patches,
      result: current,
    }, null, 2), 'application/json');
    page.report('Downloaded the local pixels recipe, features, weights, and scores.');
  }, { signal });
  page.onCleanup(() => {
    disposed = true;
    surface.dispose();
    history.length = 0;
  });
  paint();
  render();
  return {
    destroy: page.destroy,
    reset: () => {
      if (disposed) return;
      descriptorInput.value = DEFAULT_DESCRIPTOR;
      pooling = 'attention';
      poolingSelect.value = pooling;
      temperature = DEFAULT_TEMPERATURE;
      temperatureInput.value = String(temperature);
      overlayInput.checked = true;
      chooseScene(SCENES[0].id);
    },
  };
}
