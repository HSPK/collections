export type WordGraph = ReadonlyMap<string, readonly string[]>;

export function changedLetterIndex(from: string, to: string): number | null {
  if (!/^[A-Z]{4}$/.test(from) || !/^[A-Z]{4}$/.test(to)) return null;
  let changed: number | null = null;
  for (let index = 0; index < 4; index += 1) {
    if (from[index] === to[index]) continue;
    if (changed !== null) return null;
    changed = index;
  }
  return changed;
}

export function buildGraph(words: readonly string[]): WordGraph {
  const graph = new Map<string, Set<string>>();
  const buckets = new Map<string, string[]>();
  for (const word of words) {
    if (!/^[A-Z]{4}$/.test(word)) throw new Error(`Dictionary words must be four uppercase English letters: ${word}`);
    if (graph.has(word)) throw new Error(`Duplicate dictionary word: ${word}`);
    graph.set(word, new Set());
    for (let index = 0; index < 4; index += 1) {
      const pattern = `${word.slice(0, index)}_${word.slice(index + 1)}`;
      const bucket = buckets.get(pattern) ?? [];
      bucket.push(word);
      buckets.set(pattern, bucket);
    }
  }
  for (const bucket of buckets.values()) {
    for (const word of bucket) {
      for (const neighbour of bucket) {
        if (word !== neighbour) graph.get(word)!.add(neighbour);
      }
    }
  }
  return new Map([...graph].map(([word, neighbours]) => [word, [...neighbours].sort()]));
}

/** A breadth-first search with deterministic ties; the returned path includes both ends. */
export function findShortestPath(
  graph: WordGraph,
  start: string,
  goal: string,
  blocked: ReadonlySet<string> = new Set(),
): string[] | null {
  if (!graph.has(start) || !graph.has(goal)) return null;
  if (start === goal) return [start];
  if (blocked.has(goal)) return null;

  const queue = [start];
  const previous = new Map<string, string | null>([[start, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const neighbour of graph.get(current) ?? []) {
      if (previous.has(neighbour) || blocked.has(neighbour)) continue;
      previous.set(neighbour, current);
      if (neighbour === goal) {
        const path: string[] = [];
        let word: string | null = goal;
        while (word !== null) {
          path.push(word);
          word = previous.get(word) ?? null;
        }
        return path.reverse();
      }
      queue.push(neighbour);
    }
  }
  return null;
}

export interface GameState {
  readonly puzzleId: string;
  readonly start: string;
  readonly goal: string;
  readonly path: readonly string[];
  readonly hintsUsed: number;
  readonly hintedRoutes: readonly string[];
}

export function createGame(puzzle: { readonly id: string; readonly start: string; readonly goal: string }): GameState {
  return { puzzleId: puzzle.id, start: puzzle.start, goal: puzzle.goal, path: [puzzle.start], hintsUsed: 0, hintedRoutes: [] };
}

export const currentWord = (state: GameState): string => state.path[state.path.length - 1];
export const moveCount = (state: GameState): number => state.path.length - 1;
export const isSolved = (state: GameState): boolean => currentWord(state) === state.goal;

export type MoveErrorCode = 'format' | 'unknown' | 'unchanged' | 'distance' | 'repeated' | 'solved';
export type MoveValidation =
  | { readonly ok: true; readonly word: string; readonly changedIndex: number }
  | { readonly ok: false; readonly code: MoveErrorCode; readonly message: string };

export function validateMove(raw: string, path: readonly string[], graph: WordGraph): MoveValidation {
  const trimmed = raw.trim();
  if (!/^[a-zA-Z]{4}$/.test(trimmed)) {
    return { ok: false, code: 'format', message: 'Use exactly four English letters (A–Z), with no spaces, numbers, or punctuation.' };
  }
  const word = trimmed.toUpperCase();
  const current = path[path.length - 1];
  if (word === current) {
    return { ok: false, code: 'unchanged', message: `${word} is already the current word. Change exactly one of its four letters.` };
  }
  if (!graph.has(word)) {
    return { ok: false, code: 'unknown', message: `${word} is not in this curated dictionary. It may exist elsewhere; browse the allowed words or try another.` };
  }
  if (path.includes(word)) {
    return { ok: false, code: 'repeated', message: `${word} is already on your route. Backtrack to it in the route log, or choose a word you have not used.` };
  }
  const changedIndex = changedLetterIndex(current ?? '', word);
  if (changedIndex === null) {
    return { ok: false, code: 'distance', message: `${current ?? 'Your current word'} → ${word} changes more than one letter. Keep three letters in the same positions.` };
  }
  return { ok: true, word, changedIndex };
}

export function playMove(
  state: GameState,
  raw: string,
  graph: WordGraph,
): { readonly state: GameState; readonly validation: MoveValidation } {
  if (isSolved(state)) {
    return {
      state,
      validation: { ok: false, code: 'solved', message: 'This circuit is connected. Choose the next puzzle, reset, or backtrack to explore another route.' },
    };
  }
  const validation = validateMove(raw, state.path, graph);
  return {
    state: validation.ok ? { ...state, path: [...state.path, validation.word] } : state,
    validation,
  };
}

export function backtrack(state: GameState, toIndex = state.path.length - 2): GameState {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= state.path.length - 1) return state;
  return { ...state, path: state.path.slice(0, toIndex + 1) };
}

export function resetGame(state: GameState): GameState {
  return createGame({ id: state.puzzleId, start: state.start, goal: state.goal });
}

export function legalNextWords(state: GameState, graph: WordGraph): readonly string[] {
  if (isSolved(state)) return [];
  const used = new Set(state.path);
  return (graph.get(currentWord(state)) ?? []).filter((word) => !used.has(word));
}

export function remainingPath(state: GameState, graph: WordGraph): string[] | null {
  return findShortestPath(graph, currentWord(state), state.goal, new Set(state.path.slice(0, -1)));
}

export type HintResult =
  | { readonly status: 'solved'; readonly state: GameState }
  | { readonly status: 'stuck'; readonly state: GameState }
  | {
    readonly status: 'hint';
    readonly state: GameState;
    readonly word: string;
    readonly changedIndex: number;
    readonly remainingMoves: number;
    readonly alreadyRevealed: boolean;
  };

export function requestHint(state: GameState, graph: WordGraph): HintResult {
  if (isSolved(state)) return { status: 'solved', state };
  const path = remainingPath(state, graph);
  if (!path || path.length < 2) return { status: 'stuck', state };
  // Count a revealed next word once per exact route, even after a rewind.
  const routeKey = state.path.join('>');
  const alreadyRevealed = state.hintedRoutes.includes(routeKey);
  return {
    status: 'hint',
    state: alreadyRevealed ? state : {
      ...state,
      hintsUsed: state.hintsUsed + 1,
      hintedRoutes: [...state.hintedRoutes, routeKey],
    },
    word: path[1],
    changedIndex: changedLetterIndex(path[0], path[1])!,
    remainingMoves: path.length - 1,
    alreadyRevealed,
  };
}
