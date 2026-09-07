import { clamp, lerp } from '../../core/math';
import { escapeMarkup } from '../../core/page';
import { weightedContributions } from './attention';
import type { ProjectedAttention } from './attention';
import { TOKENS } from './data';
import type { Preset, StageId } from './data';
import type { Matrix } from './tensor';

export function numberText(value: number, digits = 3): string {
  if (value === -Infinity) return '−∞';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const text = magnitude >= 10_000 || magnitude < 0.001
    ? value.toExponential(digits)
    : String(Number(value.toFixed(digits)));
  return text.replace(/^-/, '−');
}

export function vectorText(values: readonly number[], digits = 3): string {
  return `[ ${values.map((value) => numberText(value, digits)).join(', ')} ]`;
}

export function weightText(weight: number): string {
  return weight > 0 && weight < 0.001 ? '<.001' : weight.toFixed(3);
}

export function heatColors(weight: number): { background: string; foreground: string } {
  const amount = Math.sqrt(clamp(weight, 0, 1));
  const channels = [lerp(245, 87, amount), lerp(239, 48, amount), lerp(253, 153, amount)].map(Math.round);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const foreground = luminance < 0.179 ? '#ffffff' : luminance < 0.26 ? '#000000' : '#241d38';
  return { background: `rgb(${channels.join(', ')})`, foreground };
}

export function matrixMarkup(
  matrix: Matrix,
  caption: string,
  rows: readonly string[],
  columns: readonly string[],
  selectedRow = -1,
): string {
  return `<table class="as-matrix">
    <caption>${escapeMarkup(caption)}</caption>
    <thead><tr><th scope="col"><span class="as-sr-only">Row</span></th>${columns.map((column) => `<th scope="col">${escapeMarkup(column)}</th>`).join('')}</tr></thead>
    <tbody>${matrix.map((row, index) => `<tr data-selected="${index === selectedRow}">
      <th scope="row">${escapeMarkup(rows[index] ?? String(index))}</th>
      ${row.map((value) => `<td title="${escapeMarkup(String(value))}" data-value="${value}">${numberText(value)}</td>`).join('')}
    </tr>`).join('')}</tbody>
  </table>`;
}

export function dotEquation(result: ProjectedAttention, query: number, key: number): string {
  const terms = result.queries[query].map((coordinate, index) => `(${numberText(coordinate)} × ${numberText(result.keys[key][index])})`);
  return `${terms.join(' + ')} ≈ ${numberText(result.dotProducts[query][key], 6)}`;
}

export function contributionEquation(result: ProjectedAttention, query: number, key: number): string {
  const contribution = weightedContributions(result, query)[key];
  return `${numberText(result.weights[query][key], 6)} × ${vectorText(result.values[key])} ≈ ${vectorText(contribution, 6)}`;
}

interface StageContent {
  heading: string;
  explanation: string;
  calculation: string;
}

export function stageContent(
  stage: StageId,
  result: ProjectedAttention,
  preset: Preset,
  query: number,
  key: number,
): StageContent {
  const qName = escapeMarkup(TOKENS[query]);
  const kName = escapeMarkup(TOKENS[key]);
  const score = result.scores[query][key];
  const softmax = result.softmax[query];
  const weight = result.weights[query][key];
  const masked = result.causal && key > query;
  const line = (label: string, value: string) => `<div class="as-equation-line"><span>${label}</span><strong>${value}</strong></div>`;

  switch (stage) {
    case 'embed':
      return {
        heading: 'Start with numbers, not meanings.',
        explanation: 'Each token is one row of X. The three coordinates are invented features, not learned word embeddings. Edits change X; Reset preset restores the original numbers.',
        calculation: line(`x<sub>${qName}</sub> · current`, vectorText(result.embeddings[query], 6))
          + line('Hand-authored starting row', vectorText(preset.embeddings[query]))
          + line('Shape of X', '4 tokens × 3 features'),
      };
    case 'project': {
      const projectionLines = result.queries[query].map((value, column) => {
        const terms = result.embeddings[query].map((coordinate, row) => `(${numberText(coordinate)} × ${numberText(result.projections.q[row][column])})`);
        return line(`q<sub>${qName},${column + 1}</sub>`, `${terms.join(' + ')} ≈ ${numberText(value, 6)}`);
      }).join('');
      return {
        heading: 'One embedding, three different jobs.',
        explanation: 'Rows multiply matrices on the right: Q = XWq, K = XWk, V = XWv. Each 3 × 2 matrix maps three input features to two output coordinates. All three matrices are in the Matrices panel.',
        calculation: projectionLines
          + line(`k<sub>${kName}</sub> = x<sub>${kName}</sub>Wk`, vectorText(result.keys[key], 6))
          + line(`v<sub>${kName}</sub> = x<sub>${kName}</sub>Wv`, vectorText(result.values[key], 6)),
      };
    }
    case 'score':
      return {
        heading: 'A dot product, scaled by √2.',
        explanation: 'Multiply matching query/key coordinates and add. Divide by √dₖ, with dₖ = 2 here—not the token count or embedding size. A negative score is valid; a score is not yet a probability.',
        calculation: line(`q<sub>${qName}</sub> · k<sub>${kName}</sub>`, dotEquation(result, query, key))
          + line(`s<sub>${qName},${kName}</sub>`, `${numberText(result.dotProducts[query][key], 6)} / √2 ≈ ${numberText(score, 6)}`)
          + line(`Entire score row · ${qName}`, vectorText(result.scores[query])),
      };
    case 'mask':
      return {
        heading: result.causal ? 'Future keys are not candidates.' : 'Every position is a candidate.',
        explanation: result.causal
          ? 'A causal query at position i may use positions j ≤ i, including itself. Future scores become −∞ before normalization; their weights are exactly zero. Allowed weights are normalized again.'
          : 'The causal mask is off. This is bidirectional self-attention: earlier and later tokens can contribute. Turn on Causal mask above to compare the same scores with future positions removed.',
        calculation: line('Selected positions · zero-based', `i = ${query}, j = ${key} → ${masked ? 'future key, masked' : 'allowed'}`)
          + line('After applying the mask', vectorText(result.maskedScores[query]))
          + line(`Weight for key ${kName}`, masked ? '0 exactly' : numberText(weight, 6)),
      };
    case 'softmax':
      return {
        heading: 'Subtract the maximum. Then normalize.',
        explanation: 'Use the largest allowed score m: exp(s − m) / Σ exp(s − m). Subtracting m leaves softmax unchanged and avoids exponential overflow. Masked terms are 0; very tiny allowed terms can also underflow to 0 in Float64.',
        calculation: line('m · largest allowed score', numberText(softmax.maximum, 6))
          + line('exp(s − m) · masked terms = 0', vectorText(softmax.exponentials, 6))
          + line('Z · sum of those exponentials', numberText(softmax.denominator, 6))
          + line(`a<sub>${qName},${kName}</sub>`, `${numberText(softmax.exponentials[key], 6)} / ${numberText(softmax.denominator, 6)} ≈ ${numberText(weight, 6)}`)
          + line('Sum of the normalized row', result.weights[query].reduce((sum, value) => sum + value, 0).toFixed(12)),
      };
    case 'mix': {
      const contributions = weightedContributions(result, query);
      return {
        heading: 'Blend values. Do not pick a winner.',
        explanation: 'Each attention weight scales that key’s value vector. Add every contribution to get the query’s two-coordinate output. Queries and keys choose the proportions; values supply the material.',
        calculation: `<table class="as-contributions">
          <caption>Contributions to o<sub>${qName}</sub></caption>
          <thead><tr><th scope="col">Key</th><th scope="col">Weight</th><th scope="col">a × v</th></tr></thead>
          <tbody>${contributions.map((value, index) => `<tr data-selected="${index === key}">
            <th scope="row">${escapeMarkup(TOKENS[index])}</th>
            <td>${numberText(result.weights[query][index], 6)}</td>
            <td>${vectorText(value, 4)}</td>
          </tr>`).join('')}</tbody>
        </table>`,
      };
    }
  }
}
