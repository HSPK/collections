export const START = '<START>';
export const END = '<END>';
export const SMOOTHING = 0.25;
export const MAX_VOCABULARY = 64;
export const MAX_CORPUS_TOKENS = 2048;

export interface CountModel {
  readonly vocabulary: readonly string[];
  readonly counts: ReadonlyMap<string, readonly number[]>;
  readonly sentences: readonly string[];
  readonly alpha: number;
  readonly tokenCount: number;
  readonly transitionCount: number;
}

export interface LogitSource {
  readonly context: string;
  readonly counts: readonly number[];
  readonly total: number;
  readonly denominator: number;
  readonly logits: readonly number[];
  readonly probabilities: readonly number[];
  readonly unseen: boolean;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[.,!?;:]/g) ?? [];
}

export function fitCounts(sentences: readonly string[], alpha = SMOOTHING): CountModel {
  if (!Number.isFinite(alpha) || alpha < 0.000001 || alpha > 100) {
    throw new RangeError('Smoothing must be finite and between 0.000001 and 100.');
  }
  if (sentences.length === 0 || sentences.length > 64) {
    throw new RangeError('Use between 1 and 64 nonempty corpus lines.');
  }
  const lines = sentences.map((sentence) => {
    if (sentence.length > 240) throw new RangeError('A corpus line may contain at most 240 characters.');
    const tokens = tokenize(sentence);
    if (tokens.length === 0) throw new RangeError('Every corpus line needs at least one token.');
    return tokens;
  });
  const tokenCount = lines.reduce((sum, tokens) => sum + tokens.length, 0);
  if (tokenCount > MAX_CORPUS_TOKENS) throw new RangeError('The corpus is too large for this little model.');

  const words = [...new Set(lines.flat())].sort();
  const vocabulary = [...words, END];
  if (vocabulary.length > MAX_VOCABULARY) throw new RangeError('The inventory may contain at most 64 tokens.');
  const indices = new Map(vocabulary.map((token, index) => [token, index]));
  const counts = new Map<string, number[]>();
  for (const tokens of lines) {
    let previous = START;
    for (const token of [...tokens, END]) {
      let row = counts.get(previous);
      if (!row) {
        row = Array<number>(vocabulary.length).fill(0);
        counts.set(previous, row);
      }
      row[indices.get(token)!] += 1;
      previous = token;
    }
  }
  return {
    vocabulary,
    counts,
    sentences: [...sentences],
    alpha,
    tokenCount,
    transitionCount: tokenCount + lines.length,
  };
}

export function logitsFor(model: CountModel, context: string): LogitSource {
  const counts = [...(model.counts.get(context) ?? Array<number>(model.vocabulary.length).fill(0))];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const denominator = total + model.alpha * model.vocabulary.length;
  return {
    context,
    counts,
    total,
    denominator,
    logits: counts.map((count) => Math.log(count + model.alpha)),
    probabilities: counts.map((count) => (count + model.alpha) / denominator),
    unseen: total === 0,
  };
}

export function contextFor(text: string): string {
  return tokenize(text).at(-1) ?? START;
}

export function readableToken(token: string): string {
  if (token === START) return 'START';
  if (token === END) return 'END';
  return token;
}

export function joinTokens(tokens: readonly string[]): string {
  return tokens.filter((token) => token !== START && token !== END).join(' ').replace(/\s+([.,!?;:])/g, '$1');
}
