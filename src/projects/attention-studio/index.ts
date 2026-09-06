import './style.css';
import { clamp } from '../../core/math';
import { createProjectPage, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { runAttention } from './attention';
import { EMBEDDING_LIMIT, PRESETS, STAGES, TOKENS } from './data';
import type { Preset } from './data';
import { renderStudio, studioMarkup, syncEmbeddingInputs } from './ui';
import type { StudioState } from './ui';

function presetState(preset: Preset, challenge = false): StudioState {
  const embeddings = preset.embeddings.map((row) => [...row]);
  return {
    preset, embeddings, challenge,
    result: runAttention(embeddings, preset.projections, preset.causal),
    query: preset.query, key: preset.key, stage: preset.causal ? 'mask' : 'score',
  };
}

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'attention-studio');
  const { root, signal } = page;
  let active = true;
  let state = presetState(PRESETS[0]);
  const invalidInputs = new Set<HTMLInputElement>();
  page.onCleanup(() => {
    active = false;
    invalidInputs.clear();
  });
  root.innerHTML = studioMarkup();

  function renderFeedback(): void {
    query(root, '[data-input-feedback]').textContent = invalidInputs.size
      ? 'Use a finite number from −1,000 to 1,000. Invalid fields keep their last valid value. Escape restores it.'
      : '';
  }

  function loadPreset(preset: Preset, challenge = false): void {
    if (!active) return;
    state = presetState(preset, challenge);
    invalidInputs.clear();
    syncEmbeddingInputs(root, state);
    renderStudio(root, state);
  }

  function reset(): void {
    if (!active) return;
    loadPreset(state.preset);
    page.report('Original preset restored. Embeddings, mask, and selection are reset.');
  }

  function selectPair(row: number, key: number): void {
    state.query = clamp(row, 0, TOKENS.length - 1);
    state.key = clamp(key, 0, TOKENS.length - 1);
    renderStudio(root, state);
    const masked = state.result.causal && state.key > state.query;
    page.report(`Query ${TOKENS[state.query]}, key ${TOKENS[state.key]}: ${masked ? 'masked; weight exactly zero' : `${(state.result.weights[state.query][state.key] * 100).toFixed(2)} percent attention`}. The calculation and output below follow this query.`);
  }

  function editEmbedding(input: HTMLInputElement): void {
    const row = Number(input.dataset.embeddingRow);
    const column = Number(input.dataset.embeddingColumn);
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || Math.abs(value) > EMBEDDING_LIMIT) {
      invalidInputs.add(input);
      input.setAttribute('aria-invalid', 'true');
      renderFeedback();
      return;
    }
    const next = state.embeddings.map((vector) => [...vector]);
    next[row][column] = value;
    try {
      const result = runAttention(next, state.preset.projections, state.result.causal);
      state.embeddings = next;
      state.result = result;
      invalidInputs.delete(input);
      input.removeAttribute('aria-invalid');
      renderStudio(root, state);
      renderFeedback();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      invalidInputs.add(input);
      input.setAttribute('aria-invalid', 'true');
      renderFeedback();
      page.report(error.message);
    }
  }

  root.addEventListener('input', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches('[data-embedding-row]')) editEmbedding(input);
  }, { signal });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.matches('[data-preset-select]')) {
      const preset = PRESETS.find((candidate) => candidate.id === target.value);
      if (preset) {
        loadPreset(preset);
        page.report(`${preset.title} loaded. ${preset.description}`);
      }
    } else if (target instanceof HTMLInputElement && target.matches('[data-causal]')) {
      state.result = runAttention(state.embeddings, state.preset.projections, target.checked);
      renderStudio(root, state);
      page.report(target.checked
        ? 'Causal mask on. Future keys have exactly zero weight; allowed keys are normalized again.'
        : 'Causal mask off. All four positions can contribute.');
    } else if (target instanceof HTMLInputElement && invalidInputs.has(target)) {
      page.report('That coordinate is invalid. Enter a finite number from −1,000 to 1,000, or press Escape to restore its last valid value.');
    }
  }, { signal });

  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !root.contains(button)) return;
    if (button.dataset.action === 'reset') {
      reset();
    } else if (button.dataset.action === 'challenge') {
      loadPreset(PRESETS[0], true);
      const input = query<HTMLInputElement>(root, '[data-embedding-row="1"][data-embedding-column="0"]');
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', behavior: 'auto' });
      page.report('Routing challenge loaded. Send at least 80 percent of ink’s attention to moss. Moss’s first coordinate is focused.');
    } else if (button.dataset.step !== undefined) {
      const stage = STAGES.find((candidate) => candidate.id === button.dataset.step);
      if (stage) {
        state.stage = stage.id;
        renderStudio(root, state);
        page.report(`${stage.label}: ${query(root, '[data-stage-heading]').textContent}`);
      }
    } else if (button.dataset.cellRow !== undefined && button.dataset.cellKey !== undefined) {
      selectPair(Number(button.dataset.cellRow), Number(button.dataset.cellKey));
    } else if (button.dataset.queryRow !== undefined) {
      selectPair(Number(button.dataset.queryRow), state.key);
    }
  }, { signal });

  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-embedding-row]') && event.key === 'Escape') {
      event.preventDefault();
      target.value = String(state.embeddings[Number(target.dataset.embeddingRow)][Number(target.dataset.embeddingColumn)]);
      invalidInputs.delete(target);
      target.removeAttribute('aria-invalid');
      renderFeedback();
      page.report('Last valid coordinate restored.');
      return;
    }
    if (!(target instanceof HTMLButtonElement) || !target.matches('[data-cell-row]')) return;
    let row = Number(target.dataset.cellRow);
    let key = Number(target.dataset.cellKey);
    switch (event.key) {
      case 'ArrowLeft': key -= 1; break;
      case 'ArrowRight': key += 1; break;
      case 'ArrowUp': row -= 1; break;
      case 'ArrowDown': row += 1; break;
      case 'Home': key = 0; break;
      case 'End': key = TOKENS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    selectPair(row, key);
    query<HTMLButtonElement>(root, `[data-cell-row="${state.query}"][data-cell-key="${state.key}"]`).focus();
  }, { signal });

  syncEmbeddingInputs(root, state);
  renderStudio(root, state);
  return { destroy: page.destroy, reset };
}
