import './style.css';
import { createProjectPage, escapeMarkup, query } from '../../core/page';
import type { ProjectContext, ProjectInstance } from '../../core/types';
import { CORPORA, PRESETS, PRESET_SEED } from './data';
import type { Corpus } from './data';
import { createSession, decode, MAX_SEED, MAX_STEPS, resetSession, rewindTo, runBatch } from './engine';
import type { DecoderSettings, GenerationSession } from './engine';
import { countTable, decimal, drawStrip, percent, probabilityOverview, probabilityTable } from './graphics';
import { END, fitCounts, logitsFor, readableToken, START } from './model';
import type { LogitSource } from './model';
import { arrow, choiceMarkup, historyMarkup, outputMarkup, proofMarkup, siteMarkup } from './ui';
import { createDecodingWorkspace } from './workspace';

export function mount(context: ProjectContext): ProjectInstance {
  const page = createProjectPage(context, 'decoding-lab');
  const { root, signal } = page;
  root.innerHTML = siteMarkup();
  const inspector = createDecodingWorkspace(page);

  let corpus = CORPORA[0];
  let model = fitCounts(corpus.sentences);
  let startIndex = 0;
  let settings: DecoderSettings = { ...PRESETS[1].settings };
  let seed = PRESET_SEED;
  let session = createSession(model, corpus.contexts[startIndex].text, settings, seed);
  let presetId: string | null = 'narrow';
  let inspected: number | null = null;
  let proof: { session: GenerationSession; corpus: Corpus } | null = null;
  let disposed = false;
  let chartSource: LogitSource = logitsFor(model, session.context);

  const element = (selector: string) => query<HTMLElement>(root, selector);
  const controls = {
    corpus: query<HTMLSelectElement>(root, '#dl-corpus'),
    start: query<HTMLSelectElement>(root, '#dl-start'),
    policy: query<HTMLSelectElement>(root, '#dl-policy'),
    seed: query<HTMLInputElement>(root, '#dl-seed'),
    temperature: query<HTMLInputElement>(root, '#dl-temperature'),
    topK: query<HTMLSelectElement>(root, '#dl-top-k'),
    topP: query<HTMLInputElement>(root, '#dl-top-p'),
    countContext: query<HTMLSelectElement>(root, '#dl-count-context'),
  };
  const buttons = {
    step: query<HTMLButtonElement>(root, '[data-action="step"]'),
    batch: query<HTMLButtonElement>(root, '[data-action="batch"]'),
    backtrack: query<HTMLButtonElement>(root, '[data-action="backtrack"]'),
    live: query<HTMLButtonElement>(root, '[data-action="live"]'),
    pin: query<HTMLButtonElement>(root, '[data-action="pin"]'),
  };

  function announce(message: string, reportError = false): void {
    if (disposed) return;
    element('[data-feedback]').textContent = message;
    if (reportError) page.report(message);
  }

  function renderControls(): void {
    controls.corpus.value = corpus.id;
    controls.start.innerHTML = corpus.contexts.map((choice, index) =>
      `<option value="${index}">${escapeMarkup(choice.label)}</option>`).join('');
    controls.start.value = String(startIndex);
    controls.policy.value = settings.mode;
    controls.seed.value = String(seed);
    controls.temperature.value = String(settings.temperature);
    controls.temperature.setAttribute('aria-valuetext', settings.temperature === 0 ? '0, explicit greedy policy' : decimal(settings.temperature, 2));
    controls.topK.innerHTML = `<option value="0">All ${model.vocabulary.length} tokens</option>` + model.vocabulary.map((_, index) =>
      `<option value="${index + 1}">${index + 1} ${index === 0 ? 'token' : 'tokens'}</option>`).join('');
    controls.topK.value = String(settings.topK);
    controls.topP.value = String(settings.topP);
    controls.topP.setAttribute('aria-valuetext', `${decimal(settings.topP, 2)} after top-k`);
    const greedy = settings.mode === 'greedy' || settings.temperature === 0;
    controls.seed.disabled = greedy;
    controls.temperature.disabled = settings.mode === 'greedy';
    controls.topK.disabled = greedy;
    controls.topP.disabled = greedy;
    element('[data-temperature-value]').textContent = decimal(settings.temperature, 2);
    element('[data-top-p-value]').textContent = decimal(settings.topP, 2);
    element('[data-policy-note]').textContent = greedy
      ? `${settings.temperature === 0 ? 'T = 0' : 'Greedy'}: first argmax wins with probability 1. Filters are bypassed and no random number is consumed.`
      : 'Draw order: largest final probability first. Equal scores use the inventory order in Model.';
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === presetId));
    }
    const preset = PRESETS.find((entry) => entry.id === presetId);
    element('[data-preset-note]').textContent = preset
      ? `${preset.title} / ${preset.note} Presets always restart at “the”, seed 42.`
      : 'Custom settings / the current run was reset. Pin a run before changing settings to keep a comparison.';
  }

  function renderCorpus(): void {
    element('[data-corpus-title]').textContent = corpus.title;
    element('[data-corpus-description]').textContent = corpus.description;
    element('[data-corpus-lines]').innerHTML = corpus.sentences.map((sentence) =>
      `<li><code>${escapeMarkup(sentence)}</code><span>+ END</span></li>`).join('');
    element('[data-model-facts]').textContent = `${model.sentences.length} lines · ${model.tokenCount} text tokens + ${model.sentences.length} END tokens · ${model.transitionCount} fitted transitions · ${model.vocabulary.length} output tokens.`;
    element('[data-inventory]').innerHTML = model.vocabulary.map((token) => `<code>${escapeMarkup(readableToken(token))}</code>`).join('');
    controls.countContext.innerHTML = '<option value="">Follow probability bed</option>' +
      [START, ...model.vocabulary.filter((token) => token !== END), corpus.unknown].map((token) =>
        `<option value="${escapeMarkup(token)}">${escapeMarkup(readableToken(token))}${token === corpus.unknown ? ' · unseen' : ''}</option>`).join('');
    controls.countContext.value = '';
  }

  function renderCountInspector(): void {
    const source = controls.countContext.value === '' ? chartSource : logitsFor(model, controls.countContext.value);
    element('[data-count-table]').innerHTML = countTable(model, source);
    element('[data-count-explanation]').textContent = source.unseen
      ? `No fitted row for “${readableToken(source.context)}”. All counts are 0, so add-${model.alpha} smoothing makes the base distribution uniform: 1/${model.vocabulary.length}. This is not learned knowledge about the unseen word.`
      : `The normalization denominator is ${source.total} + ${model.alpha} × ${model.vocabulary.length} = ${decimal(source.denominator, 2)}. Subtracting ln(${decimal(source.denominator, 2)}) from every logit would give log-probabilities; softmax is unchanged by that shared offset.`;
  }

  function render(): void {
    const lastStep = session.history.at(-1) ?? null;
    const recorded = inspected === null ? session.end ? lastStep : null : session.history[inspected];
    chartSource = recorded?.source ?? logitsFor(model, session.context);
    const distribution = recorded?.distribution ?? decode(chartSource.logits, settings);

    root.dataset.steps = String(session.history.length);
    root.dataset.context = session.context;
    root.dataset.rngState = String(session.rngState);
    root.dataset.end = session.end ?? '';
    root.dataset.previewContext = chartSource.context;
    root.dataset.previewKind = recorded ? 'recorded' : 'live';
    element('[data-view-label]').textContent = recorded
      ? `${inspected === null ? 'Final impression' : 'Recorded impression'} · step ${String(recorded.number).padStart(2, '0')}`
      : 'Live · next token';
    buttons.live.hidden = inspected === null;
    buttons.live.innerHTML = `${session.end ? 'Latest impression' : 'Return to live'} ${arrow}`;
    element('[data-chart-context]').textContent = readableToken(chartSource.context);
    element('[data-workspace-context]').textContent = readableToken(chartSource.context);
    element('[data-overview-label]').textContent = recorded ? `Recorded step ${recorded.number}` : 'Next-token probabilities';
    const sourceNote = chartSource.unseen
      ? 'Unseen context: all counts are zero. Smoothing gives a uniform base distribution.'
      : `${chartSource.total} observed transitions from this token. The model remembers only this last token.`;
    element('[data-context-note]').textContent = `${sourceNote}${inspected !== null && !session.end ? ` This is a saved draw; the next print still uses “${readableToken(session.context)}”.` : ''}`;
    element('[data-base-entropy]').textContent = decimal(distribution.baseEntropy);
    element('[data-final-entropy]').textContent = decimal(distribution.entropy);
    element('[data-kept-count]').textContent = `${distribution.kept.length} / ${model.vocabulary.length}`;
    element('[data-distribution]').innerHTML = probabilityTable(model, distribution, recorded?.index ?? null);
    const overview = element('[data-probability-overview]');
    overview.innerHTML = probabilityOverview(model, distribution, recorded?.index ?? null);
    overview.style.setProperty('--dl-token-count', String(model.vocabulary.length));
    overview.setAttribute('aria-label', `${recorded ? `Recorded step ${recorded.number}` : 'Next-token'} probabilities given ${readableToken(chartSource.context)}. Gray: base; orange: final, both on a 0–100% scale. ${distribution.order.map(index => `${readableToken(model.vocabulary[index])}: ${percent(distribution.final[index])}`).join(', ')}. Exact values and filter reasons are in Distribution.`);
    element('[data-draw-strip]').innerHTML = drawStrip(model, distribution, recorded);

    element('[data-output]').innerHTML = outputMarkup(session);
    element('[data-output-empty]').hidden = session.history.length > 0;
    element('[data-step-count]').textContent = `${String(session.history.length).padStart(2, '0')} / ${MAX_STEPS}`;
    element('[data-run-state]').textContent = session.end === 'end-token' ? 'END selected'
      : session.end === 'token-limit' ? 'Safety limit reached' : session.history.length ? 'Ready for the next token' : 'Ready to print';
    element('[data-end-label]').hidden = !session.end;
    element('[data-end-label]').textContent = session.end === 'end-token' ? 'END / line complete' : '24-token limit / not an END';
    buttons.step.disabled = Boolean(session.end);
    buttons.batch.disabled = Boolean(session.end);
    buttons.backtrack.disabled = session.history.length === 0;
    buttons.pin.disabled = session.history.length === 0;
    const receipt = inspected === null ? lastStep : recorded;
    element('[data-record-heading]').textContent = inspected === null ? 'Last impression' : `Recorded step ${recorded?.number}`;
    element('[data-choice-record]').innerHTML = choiceMarkup(receipt ?? null);
    element('[data-history]').innerHTML = historyMarkup(session, inspected);
    const logProbability = session.history.reduce((sum, step) => sum + step.logProbability, 0);
    element('[data-sequence-log]').textContent = session.history.length
      ? `Run Σ ln q = ${decimal(logProbability, 4)} nats (generated tokens only). Compare like-length runs, not “quality”.`
      : 'Printed tokens will appear here. Inspection never changes the run or consumes randomness.';

    element('[data-pipeline-temperature]').textContent = distribution.greedy ? 'Argmax → one-hot' : `Temperature ${decimal(settings.temperature, 2)}`;
    element('[data-pipeline-k]').textContent = distribution.greedy ? 'Top-k bypassed' : `Top-k ${settings.topK || 'all'} → renorm`;
    element('[data-pipeline-p]').textContent = distribution.greedy ? 'Top-p bypassed' : `Top-p ${decimal(settings.topP, 2)} → renorm`;
    element('[data-pipeline-k-mass]').textContent = distribution.greedy ? 'No filtering in greedy policy' : `${percent(distribution.topKMass)} of temperature mass kept`;
    element('[data-pipeline-p-mass]').textContent = distribution.greedy ? 'First argmax wins ties' : `${percent(distribution.topPMass)} of post-k mass kept`;
    element('[data-pipeline-policy]').textContent = distribution.greedy ? 'Deterministic choice' : `Seeded draw / ${seed}`;
    renderCountInspector();
  }

  function freshRun(message: string): void {
    session = createSession(model, corpus.contexts[startIndex].text, settings, seed);
    inspected = null;
    renderControls();
    render();
    announce(message);
  }

  function resetRun(): void {
    if (disposed) return;
    session = resetSession(session);
    inspected = null;
    render();
    announce(`Run reset. Context “${readableToken(session.context)}” and seed ${seed} restored; current settings kept.`);
  }

  function applyPreset(id: string): void {
    const preset = PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    corpus = CORPORA[0];
    model = fitCounts(corpus.sentences);
    startIndex = 0;
    settings = { ...preset.settings };
    seed = PRESET_SEED;
    presetId = preset.id;
    renderCorpus();
    freshRun(`${preset.title} loaded. New run: printshop, context “the”, seed 42. Nothing printed yet.`);
  }

  function print(count: number): void {
    if (session.end) return;
    const previousLength = session.history.length;
    session = runBatch(session, count);
    inspected = null;
    render();
    const last = session.history.at(-1)!;
    const ending = session.end === 'end-token' ? ' END selected: generation stopped.'
      : session.end === 'token-limit' ? ' 24-token safety limit reached; this is not an END token.' : '';
    announce(`Printed ${session.history.length - previousLength} ${session.history.length - previousLength === 1 ? 'token' : 'tokens'}. Last choice: ${readableToken(last.token)}, final probability ${percent(last.probability, 2)}.${ending} The history holds its exact draw.`);
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.preset) {
      applyPreset(button.dataset.preset);
      return;
    }
    if (button.dataset.inspectStep !== undefined) {
      const index = Number(button.dataset.inspectStep);
      if (!Number.isInteger(index) || !session.history[index]) return;
      inspected = index;
      render();
      // Rendering replaces the history chips; put keyboard focus back on the inspected chip.
      query<HTMLButtonElement>(root, `[data-inspect-step="${index}"]`).focus({ preventScroll: true });
      announce(`Inspecting recorded step ${index + 1}: ${readableToken(session.history[index].token)}. No tokens or random state changed.`);
      return;
    }
    switch (button.dataset.action) {
      case 'step': print(1); break;
      case 'batch': print(5); break;
      case 'backtrack':
        session = rewindTo(session, Math.max(0, session.history.length - 1));
        inspected = null;
        render();
        if (!session.history.length) buttons.step.focus({ preventScroll: true });
        announce(`Backtracked one token. Context “${readableToken(session.context)}” and exact RNG state restored. Printing again replays the same draw.`);
        break;
      case 'reset': resetRun(); break;
      case 'live':
        inspected = null;
        render();
        (session.end ? buttons.backtrack : buttons.step).focus({ preventScroll: true });
        announce(session.end ? 'Showing the final impression. Backtrack or reset to print again.' : 'Showing the live next-token distribution.');
        break;
      case 'pin':
        proof = { session, corpus };
        element('[data-proof]').hidden = false;
        element('[data-proof-content]').innerHTML = proofMarkup(proof.session, proof.corpus);
        inspector.select('experiments');
        announce('Run pinned with its own corpus, context, settings, and seed. Change a setting to compare a new run.');
        break;
      case 'clear-proof':
        proof = null;
        element('[data-proof]').hidden = true;
        element('[data-proof-content]').textContent = '';
        if (!buttons.pin.disabled) inspector.select('history');
        (buttons.pin.disabled ? buttons.step : buttons.pin).focus({ preventScroll: true });
        announce('Pinned proof cleared. The live run is unchanged.');
        break;
    }
  }, { signal });

  root.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input === controls.temperature) settings = { ...settings, temperature: input.valueAsNumber };
    else if (input === controls.topP) settings = { ...settings, topP: input.valueAsNumber };
    else return;
    presetId = null;
    freshRun('Setting changed. The run is cleared and the seed restored; the probability overview shows the new next step.');
  }, { signal });

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (input === controls.countContext) {
      renderCountInspector();
      return;
    }
    if (input === controls.corpus) {
      const selected = CORPORA.find((entry) => entry.id === controls.corpus.value);
      if (!selected) return;
      corpus = selected;
      model = fitCounts(corpus.sentences);
      startIndex = 0;
      settings = { ...settings, topK: Math.min(settings.topK, model.vocabulary.length) };
      renderCorpus();
    } else if (input === controls.start) {
      const index = Number(controls.start.value);
      if (!corpus.contexts[index]) return;
      startIndex = index;
    } else if (input === controls.policy) {
      settings = { ...settings, mode: controls.policy.value === 'greedy' ? 'greedy' : 'sample' };
    } else if (input === controls.seed) {
      const nextSeed = controls.seed.valueAsNumber;
      if (!Number.isInteger(nextSeed) || nextSeed < 0 || nextSeed > MAX_SEED) {
        controls.seed.value = String(seed);
        announce(`Use a whole-number seed from 0 to ${MAX_SEED}. Seed ${seed} was restored; the run is unchanged.`, true);
        return;
      }
      seed = nextSeed;
    } else if (input === controls.topK) {
      settings = { ...settings, topK: Number(controls.topK.value) };
    } else return;
    presetId = null;
    freshRun('Setting changed. The current run and RNG have been reset. Any pinned proof keeps its original settings.');
  }, { signal });

  page.onCleanup(() => {
    disposed = true;
    proof = null;
    inspected = null;
  });
  renderCorpus();
  renderControls();
  render();
  announce('Ready. These are fitted bigram counts, not a neural LLM. Print a token, or inspect the complete corpus in Model.');
  return { destroy: page.destroy, reset: resetRun };
}
