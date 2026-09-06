import { escapeMarkup } from '../../core/page';
import type { Distribution, FilterReason, GenerationStep } from './engine';
import { readableToken } from './model';
import type { CountModel, LogitSource } from './model';

export const percent = (value: number, digits = 1): string =>
  value > 0 && value < 0.0001 ? '<0.01%' : `${(value * 100).toFixed(digits)}%`;
export const decimal = (value: number, digits = 3): string => value.toFixed(digits);

const reasonLabels: Record<FilterReason, string> = {
  kept: 'kept',
  'top-k': 'cut by k',
  'top-p': 'cut by p',
  greedy: 'not argmax',
  zero: 'zero weight',
};

export function probabilityTable(model: CountModel, distribution: Distribution, chosen: number | null): string {
  return `
    <table class="dl-probability-table" aria-label="${chosen === null ? 'Next-token' : 'Recorded token'} probability distribution">
      <thead><tr>
        <th scope="col">Token</th>
        <th scope="col" class="dl-scale-heading"><span>0</span><span>100%</span></th>
        <th scope="col">Base</th><th scope="col">Final</th>
      </tr></thead>
      <tbody>${distribution.order.map((index) => {
        const token = model.vocabulary[index];
        const isChosen = index === chosen;
        const pruned = distribution.final[index] === 0;
        return `<tr data-token="${escapeMarkup(token)}" data-base="${distribution.base[index]}" data-final="${distribution.final[index]}"
          data-reason="${distribution.reasons[index]}" data-chosen="${isChosen}"
          class="${pruned ? 'is-pruned' : 'is-kept'}${isChosen ? ' is-chosen' : ''}">
          <th scope="row"><code>${escapeMarkup(readableToken(token))}</code><span class="dl-token-status">${isChosen ? '✓ chosen' : reasonLabels[distribution.reasons[index]]}</span></th>
          <td class="dl-bar-cell" aria-hidden="true">
            <div class="dl-bar-pair">
              <div class="dl-base-track"><i style="width:${distribution.base[index] * 100}%"></i></div>
              <div class="dl-final-track"><i style="width:${distribution.final[index] * 100}%"></i></div>
            </div>
          </td>
          <td class="dl-base-value">${escapeMarkup(percent(distribution.base[index]))}</td>
          <td class="dl-final-value">${escapeMarkup(percent(distribution.final[index]))}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

export function countTable(model: CountModel, source: LogitSource): string {
  return `
    <table class="dl-count-table" aria-label="Fitted context counts">
      <caption>After <code>${escapeMarkup(readableToken(source.context))}</code>: N = ${source.total} observations</caption>
      <thead><tr><th scope="col">Token</th><th scope="col">Count</th><th scope="col">+ ${model.alpha}</th><th scope="col">Logit z</th><th scope="col">Base P</th></tr></thead>
      <tbody>${model.vocabulary.map((token, index) => `
        <tr data-count-token="${escapeMarkup(token)}">
          <th scope="row"><code>${escapeMarkup(readableToken(token))}</code></th>
          <td>${source.counts[index]}</td><td>${decimal(source.counts[index] + model.alpha, 2)}</td>
          <td>${decimal(source.logits[index])}</td><td>${escapeMarkup(percent(source.probabilities[index]))}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td>${source.total}</td><td>${decimal(source.denominator, 2)}</td><td>—</td><td>100%</td></tr></tfoot>
    </table>`;
}

export function drawStrip(model: CountModel, distribution: Distribution, step: GenerationStep | null): string {
  const description = distribution.kept.map((index) =>
    `${readableToken(model.vocabulary[index])} ${percent(distribution.final[index])}`).join(', ');
  return `
    <figure class="dl-draw-figure">
      <div class="dl-draw-strip" role="img" aria-label="Cumulative draw intervals, highest probability first: ${escapeMarkup(description)}">
        ${distribution.kept.map((index, position) => `<span class="dl-draw-segment dl-segment-${position % 3}" style="width:${distribution.final[index] * 100}%">
          ${distribution.final[index] >= 0.18 ? `<span aria-hidden="true">${escapeMarkup(readableToken(model.vocabulary[index]))}</span>` : ''}
        </span>`).join('')}
        ${step?.uniform !== null && step?.uniform !== undefined ? `<i class="dl-draw-needle" style="left:${step.uniform * 100}%" aria-hidden="true"></i>` : ''}
      </div>
      <div class="dl-draw-axis" aria-hidden="true"><span>0</span><span>½</span><span>1</span></div>
      <figcaption>${step
        ? step.uniform === null
          ? 'No random draw. Argmax has selection probability 1.'
          : `u = ${decimal(step.uniform, 6)} falls in [${decimal(step.interval[0], 6)}, ${decimal(step.interval[1], 6)}).`
        : distribution.greedy
          ? 'No random draw. Argmax will select the first largest logit with probability 1.'
          : 'A seeded draw lands in one of these intervals. Nothing is drawn until you print.'}</figcaption>
    </figure>`;
}
