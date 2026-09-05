import type { AlgorithmId } from './engine';

export interface AlgorithmDefinition {
  readonly name: string;
  readonly number: string;
  readonly cue: string;
  readonly introduction: string;
  readonly stable: boolean;
  readonly best: string;
  readonly average: string;
  readonly worst: string;
  readonly regionLabel: string;
  readonly regionNote: string;
  readonly mechanism: string;
  readonly useCase: string;
  readonly watchFor: string;
  readonly pseudocode: readonly { readonly id: string; readonly text: string }[];
}

export const algorithmOrder: readonly AlgorithmId[] = ['insertion', 'selection', 'bubble'];

export const algorithms: Readonly<Record<AlgorithmId, AlgorithmDefinition>> = {
  insertion: {
    name: 'Insertion sort',
    number: '01',
    cue: 'Make room for the next value.',
    introduction: 'Hold one key. Shift its larger neighbors. Grow an ordered prefix, one insertion at a time.',
    stable: true,
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    regionLabel: 'Ordered prefix',
    regionNote: 'Blue marks an ordered prefix, not final seats: a later key can still move these values.',
    mechanism: 'Like arranging a hand of cards, insertion sort takes the next item into a key register and scans left. Each larger neighbor is copied one slot right. The key is then written into the gap.',
    useCase: 'A strong fit for small or nearly sorted arrays. On an already sorted array it performs n − 1 value comparisons and, in this implementation, n − 1 key-placement writes. It needs only constant extra sorting workspace.',
    watchFor: 'Look for a repeated letter ID during a shift. That is a copied slot, not a newly created item: the missing key is safe in the register. Strict “greater than” comparisons keep equal values in their original order.',
    pseudocode: [
      { id: 'start', text: 'a ← copy(input)' },
      { id: 'outer', text: 'for i ← 1 to n − 1' },
      { id: 'lift', text: '  key ← a[i]; j ← i − 1' },
      { id: 'compare', text: '  while j ≥ 0 and a[j].value > key.value' },
      { id: 'shift', text: '    a[j + 1] ← a[j]; j ← j − 1' },
      { id: 'place', text: '  a[j + 1] ← key' },
      { id: 'done', text: 'return a' },
    ],
  },
  selection: {
    name: 'Selection sort',
    number: '02',
    cue: 'Find the minimum. Give it a seat.',
    introduction: 'Scan the entire remaining suffix, remember its minimum, then exchange it with the first unsorted slot.',
    stable: false,
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    regionLabel: 'Final positions',
    regionNote: 'Blue marks final positions. Selection sort settles the left edge, one minimum per pass.',
    mechanism: 'Selection sort separates looking from moving. It remembers the smallest value in the unsorted suffix without rearranging it, then uses at most one swap to place that minimum at the left boundary.',
    useCase: 'Useful for understanding the tradeoff between comparisons and movement. Every input of length n takes n(n − 1)/2 value comparisons, but at most n − 1 swaps. This version skips self-swaps and uses constant extra sorting workspace.',
    watchFor: 'Fewer swaps do not guarantee fewer writes than every other method on every input. Long-distance swaps also make this version unstable: an equal item can jump past another without ever being compared against it.',
    pseudocode: [
      { id: 'start', text: 'a ← copy(input)' },
      { id: 'outer', text: 'for start ← 0 to n − 2' },
      { id: 'minimum', text: '  min ← start' },
      { id: 'scan', text: '  for j ← start + 1 to n − 1' },
      { id: 'compare', text: '    if a[j].value < a[min].value' },
      { id: 'remember', text: '      min ← j' },
      { id: 'swap', text: '  if min ≠ start: swap(a[start], a[min])' },
      { id: 'done', text: 'return a' },
    ],
  },
  bubble: {
    name: 'Bubble sort',
    number: '03',
    cue: 'Let the largest drift right.',
    introduction: 'Compare neighbors. Swap only when the left value is greater. Stop after a pass with no exchanges.',
    stable: true,
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    regionLabel: 'Final positions',
    regionNote: 'Blue marks final positions. Each completed pass settles one more slot at the right edge.',
    mechanism: 'A left-to-right pass carries the largest remaining value to the end using adjacent swaps. The next pass is one slot shorter. If a whole pass makes no swaps, the remaining prefix is already ordered.',
    useCase: 'An approachable way to study local comparisons and early exit, rather than a good general-purpose choice for large arrays. The no-swap check makes an already sorted input linear; average and worst cases remain quadratic.',
    watchFor: 'Each adjacent swap removes exactly one inversion, a pair that was in the wrong relative order. Equal neighbors never swap, so their letter IDs stay in order. The sorting routine uses constant extra workspace.',
    pseudocode: [
      { id: 'start', text: 'a ← copy(input)' },
      { id: 'pass', text: 'for end ← n − 1 down to 1' },
      { id: 'flag', text: '  swapped ← false' },
      { id: 'scan', text: '  for j ← 0 to end − 1' },
      { id: 'compare', text: '    if a[j].value > a[j + 1].value' },
      { id: 'swap', text: '      swap(a[j], a[j + 1]); swapped ← true' },
      { id: 'early-exit', text: '  if not swapped: break' },
      { id: 'done', text: 'return a' },
    ],
  },
};

export const presets = [
  {
    id: 'opening',
    name: 'Opening cast',
    values: [7, -3, 5, 2, 5, 0, 9, 1],
    note: 'Eight values, one negative, and a pair of fives. Follow the letter IDs through the performance.',
  },
  {
    id: 'nearly',
    name: 'Almost in order',
    values: [-4, -1, 0, 3, 2, 5, 8, 9],
    note: 'Only 3 and 2 are inverted. Which method takes advantage of that head start?',
  },
  {
    id: 'sorted',
    name: 'Already sorted',
    values: [-4, -1, 0, 2, 3, 5, 8, 9],
    note: 'Nothing needs rearranging. Notice that comparisons and key-placement writes can still happen.',
  },
  {
    id: 'reverse',
    name: 'Reverse order',
    values: [9, 8, 5, 3, 2, 0, -1, -4],
    note: 'Every distinct pair is inverted. Adjacent-swap and shifting methods have plenty of work.',
  },
  {
    id: 'ties',
    name: 'All equal',
    values: [4, 4, 4, 4, 4, 4],
    note: 'Identical values, different identities. Watch which methods stop looking early.',
  },
  {
    id: 'stability',
    name: 'The stability witness',
    values: [2, 2, 1],
    note: 'Just three items expose an unstable swap. Does 2·A remain before 2·B?',
  },
] as const;

export const countingRules = [
  {
    term: 'Comparisons',
    rule: 'Count one whenever the routine actually tests one item value against another. Loop limits, index checks, and the swapped flag do not count.',
    example: 'a[j].value > key.value → +1 comparison',
  },
  {
    term: 'Swaps',
    rule: 'Count one for an exchange of two different array slots. Selection sort skips an exchange when the minimum is already in place.',
    example: 'swap(a[left], a[right]) → +1 swap',
  },
  {
    term: 'Array-slot writes',
    rule: 'Count each assignment to an array slot. A swap costs two writes. A shift or key placement costs one, even if the written value stays the same.',
    example: 'a[j + 1] ← key → +1 write',
  },
  {
    term: 'What stays off the bill',
    rule: 'Input copying, saved scalar keys, index changes, flags, and the visualizer’s snapshots are excluded. Select, boundary, and finished frames can change no counters.',
    example: 'key ← a[i] → no array-slot write',
  },
] as const;

export const readingNotes = {
  scorecard: 'These are complete-run totals for the applied array, not the live prefix above. A shorter trace is not automatically a faster algorithm: bookkeeping frames and different kinds of operations have different costs.',
  complexity: 'Big-O describes growth as input length increases, not a stopwatch result for eight values. Best / average / worst times above refer to these implementations; average case assumes a typical random ordering. All three sorting routines use O(1) extra workspace. This teaching tool stores additional snapshots so you can rewind.',
  stability: 'Stable means equal values keep their original relative order. The letters are identity tags from the opening array, and only the numbers are compared. A sorted result can be correct but unstable.',
  witness: 'Selection swaps 1·C with 2·A. The result is numerically sorted, but 2·B now precedes 2·A. Insertion and bubble keep A before B because they never shift or swap on equality.',
  traces: 'Every operation is recorded before playback begins. Previous, Next, and the slider select immutable snapshots; they never rerun a partial sort. Counts always describe the trace up to and including the visible step.',
  bars: 'Every slot has the same zero line. A bar above it is positive; below it is negative. Height shows magnitude on one fixed scale for the applied array. Printed numbers, letter IDs, and Active / Ordered labels carry the meaning without color or motion.',
} as const;
