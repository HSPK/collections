export type AlgorithmId = 'insertion' | 'selection' | 'bubble';
export type OperationKind = 'start' | 'select' | 'compare' | 'swap' | 'write' | 'pass' | 'done';

export interface Item {
  readonly value: number;
  readonly origin: number;
}

export interface Counters {
  readonly comparisons: number;
  readonly swaps: number;
  readonly writes: number;
}

export interface TraceStep {
  readonly index: number;
  readonly kind: OperationKind;
  readonly line: string;
  readonly title: string;
  readonly explanation: string;
  readonly items: readonly Item[];
  readonly focus: readonly number[];
  readonly operands: readonly Item[];
  readonly ordered: readonly number[];
  readonly held: Item | null;
  readonly counters: Counters;
  readonly delta: Counters;
}

export interface SortingTrace {
  readonly algorithm: AlgorithmId;
  readonly input: readonly number[];
  readonly steps: readonly TraceStep[];
  readonly output: readonly Item[];
}

export type InputValidation =
  | { readonly valid: true; readonly values: readonly number[] }
  | { readonly valid: false; readonly error: string };

export const INPUT_LIMITS = Object.freeze({ minLength: 2, maxLength: 12, minValue: -99, maxValue: 99 });

const ZERO: Counters = Object.freeze({ comparisons: 0, swaps: 0, writes: 0 });
const COMPARE: Counters = Object.freeze({ comparisons: 1, swaps: 0, writes: 0 });
const SWAP: Counters = Object.freeze({ comparisons: 0, swaps: 1, writes: 2 });
const WRITE: Counters = Object.freeze({ comparisons: 0, swaps: 0, writes: 1 });

function valuesError(values: readonly number[]): string | undefined {
  if (values.length < INPUT_LIMITS.minLength || values.length > INPUT_LIMITS.maxLength) {
    return `Use ${INPUT_LIMITS.minLength}–${INPUT_LIMITS.maxLength} numbers so every slot can stay readable.`;
  }
  if (Array.from(values).some((value) => !Number.isInteger(value) || value < INPUT_LIMITS.minValue || value > INPUT_LIMITS.maxValue)) {
    return `Use whole numbers from ${INPUT_LIMITS.minValue} to ${INPUT_LIMITS.maxValue}. Negatives and duplicates are welcome.`;
  }
  return undefined;
}

export function validateInput(text: string): InputValidation {
  const chunks = text.trim().split(',');
  if (chunks.some((chunk) => !chunk.trim())) {
    return {
      valid: false,
      error: text.trim()
        ? 'A comma is missing a value. Put a whole number between commas, with no trailing comma.'
        : 'Enter 2–12 whole numbers, separated by commas or spaces.',
    };
  }
  const tokens = chunks.flatMap((chunk) => chunk.trim().split(/\s+/));
  if (tokens.some((token) => !/^[+-]?\d+$/.test(token))) {
    return { valid: false, error: 'Use whole numbers separated by commas or spaces, not decimals or other symbols.' };
  }
  const values = tokens.map(Number);
  const error = valuesError(values);
  return error ? { valid: false, error } : { valid: true, values: Object.freeze(values) };
}

export function itemLabel(item: Item): string {
  return `${item.value}·${String.fromCharCode(65 + item.origin)}`;
}

const positions = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);

type Frame = Omit<TraceStep, 'index' | 'items' | 'counters' | 'delta' | 'focus' | 'operands' | 'ordered' | 'held'> & {
  focus?: readonly number[];
  operands?: readonly Item[];
  ordered?: readonly number[];
  held?: Item | null;
};

export function buildTrace(algorithm: AlgorithmId, values: readonly number[]): SortingTrace {
  const error = valuesError(values);
  if (error) throw new RangeError(error);

  const input = Object.freeze([...values]);
  const items: Item[] = input.map((value, origin) => Object.freeze({ value, origin }));
  const steps: TraceStep[] = [];
  let counters: Counters = ZERO;
  const emit = (frame: Frame, delta: Counters = ZERO) => {
    counters = Object.freeze({
      comparisons: counters.comparisons + delta.comparisons,
      swaps: counters.swaps + delta.swaps,
      writes: counters.writes + delta.writes,
    });
    steps.push(Object.freeze({
      ...frame,
      index: steps.length,
      items: Object.freeze([...items]),
      focus: Object.freeze([...(frame.focus ?? [])]),
      operands: Object.freeze([...(frame.operands ?? [])]),
      ordered: Object.freeze([...(frame.ordered ?? [])]),
      held: frame.held ?? null,
      counters,
      delta,
    }));
  };

  emit({
    kind: 'start',
    line: 'start',
    title: 'The cast is ready.',
    explanation: `These ${items.length} values are the untouched opening array. Letter IDs record original positions, not rank. No key comparisons or array-slot writes have run; the input copy is outside our count.`,
    ordered: algorithm === 'insertion' ? [0] : [],
  });

  if (algorithm === 'insertion') {
    for (let i = 1; i < items.length; i += 1) {
      const key = items[i];
      let j = i - 1;
      let shifts = 0;
      emit({
        kind: 'select',
        line: 'lift',
        title: 'Lift a key into the register.',
        explanation: `Hold ${itemLabel(key)} from slot ${i} while finding its place in the ordered prefix. Saving a scalar key is not an array-slot write; its old slot stays visible until overwritten.`,
        focus: [i],
        operands: [key],
        ordered: positions(0, i),
        held: key,
      });
      while (j >= 0) {
        const left = items[j];
        const greater = left.value > key.value;
        emit({
          kind: 'compare',
          line: 'compare',
          title: greater ? 'The key needs more room.' : 'The key has found its boundary.',
          explanation: `${itemLabel(left)} > ${itemLabel(key)} is ${greater ? 'true' : 'false'}. ${
            greater
              ? `The next step will copy slot ${j} one position right.`
              : left.value === key.value
                ? 'Equal values do not shift: the earlier item stays before this key. Stop scanning.'
                : 'This smaller value stays to the left of the key. Stop scanning.'
          } This value-to-value test adds one comparison.`,
          focus: [j],
          operands: [left, key],
          held: key,
        }, COMPARE);
        if (!greater) break;
        items[j + 1] = left;
        shifts += 1;
        emit({
          kind: 'write',
          line: 'shift',
          title: 'Make space with one write.',
          explanation: `Copy ${itemLabel(left)} from slot ${j} into slot ${j + 1}: one array-slot write, not a swap. Its repeated letter ID is temporary; ${itemLabel(key)} is still held outside the array.`,
          focus: [j, j + 1],
          operands: [left],
          held: key,
        }, WRITE);
        j -= 1;
      }
      items[j + 1] = key;
      emit({
        kind: 'write',
        line: 'place',
        title: 'Return the key to the array.',
        explanation: `Write ${itemLabel(key)} into slot ${j + 1}. ${
          shifts === 0
            ? 'Even putting the key back in its original slot executes one array-slot write.'
            : j < 0
              ? 'No earlier slot remains, so the key belongs at the front.'
              : 'The key now follows the last value that was less than or equal to it.'
        } Slots 0–${i} form an ordered prefix, but later keys may still move them.`,
        focus: [j + 1],
        operands: [key],
        ordered: positions(0, i + 1),
      }, WRITE);
    }
  } else if (algorithm === 'selection') {
    for (let start = 0; start < items.length - 1; start += 1) {
      let minimum = start;
      emit({
        kind: 'select',
        line: 'minimum',
        title: 'Nominate the first candidate.',
        explanation: `Start scanning the remaining suffix at slot ${start}. For now, ${itemLabel(items[minimum])} is its minimum. Updating an index is neither a value comparison nor an array write.`,
        focus: [minimum],
        operands: [items[minimum]],
        ordered: positions(0, start),
      });
      for (let candidate = start + 1; candidate < items.length; candidate += 1) {
        const challenger = items[candidate];
        const current = items[minimum];
        const smaller = challenger.value < current.value;
        emit({
          kind: 'compare',
          line: 'compare',
          title: smaller ? 'A smaller candidate enters.' : 'The minimum keeps its place.',
          explanation: `${itemLabel(challenger)} < ${itemLabel(current)} is ${smaller ? 'true' : 'false'}. ${
            smaller
              ? `Remember slot ${candidate} as the new minimum on the next step.`
              : challenger.value === current.value
                ? 'Keep the first minimum on a tie. A later long-distance swap can still reverse equal items.'
                : 'Keep the current minimum and continue scanning.'
          } This test adds one comparison.`,
          focus: [minimum, candidate],
          operands: [challenger, current],
          ordered: positions(0, start),
        }, COMPARE);
        if (smaller) {
          minimum = candidate;
          emit({
            kind: 'select',
            line: 'remember',
            title: 'Remember the new minimum.',
            explanation: `The minimum index now points to ${itemLabel(items[minimum])} in slot ${minimum}. No array values move, so all operation counters stay unchanged.`,
            focus: [minimum],
            operands: [items[minimum]],
            ordered: positions(0, start),
          });
        }
      }
      if (minimum !== start) {
        const displaced = items[start];
        const chosen = items[minimum];
        items[start] = chosen;
        items[minimum] = displaced;
        emit({
          kind: 'swap',
          line: 'swap',
          title: 'Give the minimum its final seat.',
          explanation: `Exchange ${itemLabel(chosen)} in slot ${minimum} with ${itemLabel(displaced)} in slot ${start}. One swap writes two array slots. Slot ${start} is now final; jumping over equal items is why this method is not stable.`,
          focus: [start, minimum],
          operands: [chosen, displaced],
          ordered: positions(0, start + 1),
        }, SWAP);
      } else {
        emit({
          kind: 'pass',
          line: 'swap',
          title: 'No exchange is necessary.',
          explanation: `${itemLabel(items[start])} already occupies slot ${start}, the correct position for this minimum. Skip the self-swap: zero swaps and zero writes. This slot is now final.`,
          focus: [start],
          operands: [items[start]],
          ordered: positions(0, start + 1),
        });
      }
    }
  } else if (algorithm === 'bubble') {
    for (let end = items.length - 1; end > 0; end -= 1) {
      let swapped = false;
      emit({
        kind: 'pass',
        line: 'flag',
        title: 'Open a left-to-right pass.',
        explanation: `Reset the swapped flag, then inspect adjacent pairs from slot 0 through slot ${end}. Any slots to the right are already final. Flag and loop bookkeeping do not enter the counters.`,
        ordered: positions(end + 1, items.length),
      });
      for (let j = 0; j < end; j += 1) {
        const left = items[j];
        const right = items[j + 1];
        const greater = left.value > right.value;
        emit({
          kind: 'compare',
          line: 'compare',
          title: greater ? 'These neighbors are out of order.' : 'These neighbors can stay.',
          explanation: `${itemLabel(left)} > ${itemLabel(right)} is ${greater ? 'true' : 'false'}. ${
            greater
              ? 'Exchange them on the next step so the larger value moves right.'
              : left.value === right.value
                ? 'They are equal: leave their original order intact.'
                : 'They already appear in nondecreasing order; do not swap.'
          } This adjacent value test adds one comparison.`,
          focus: [j, j + 1],
          operands: [left, right],
          ordered: positions(end + 1, items.length),
        }, COMPARE);
        if (greater) {
          items[j] = right;
          items[j + 1] = left;
          swapped = true;
          emit({
            kind: 'swap',
            line: 'swap',
            title: 'Exchange the neighboring values.',
            explanation: `Swap ${itemLabel(left)} and ${itemLabel(right)} across slots ${j} and ${j + 1}, then set swapped to true. Add one swap and two array-slot writes. Only strictly greater values cross, preserving ties.`,
            focus: [j, j + 1],
            operands: [left, right],
            ordered: positions(end + 1, items.length),
          }, SWAP);
        }
      }
      emit({
        kind: 'pass',
        line: 'early-exit',
        title: swapped ? 'Close the pass at the right edge.' : 'A quiet pass proves we can stop.',
        explanation: swapped
          ? `This pass made swaps. The largest value in the scanned prefix, ${itemLabel(items[end])}, is now final in slot ${end}. ${end > 1 ? 'Shrink the next pass by one slot.' : 'Only one unmarked item remains; no further pass is needed.'} The boundary check adds no counted operations.`
          : 'This entire pass made no swaps. Every adjacent pair in the remaining prefix is ordered, and the suffix is already final. Stop early: no more value comparisons or writes are needed.',
        focus: swapped ? [end] : [],
        operands: swapped ? [items[end]] : [],
        ordered: swapped ? positions(end, items.length) : positions(0, items.length),
      });
      if (!swapped) break;
    }
  } else {
    throw new RangeError(`Unknown sorting algorithm: ${String(algorithm)}`);
  }

  emit({
    kind: 'done',
    line: 'done',
    title: 'Order, with every move accounted for.',
    explanation: `The array is now in nondecreasing order. Totals: ${counters.comparisons} comparisons, ${counters.swaps} swaps, ${counters.writes} array-slot writes. Rewind or scrub to inspect the exact prefix that produced any earlier count.`,
    ordered: positions(0, items.length),
  });
  return Object.freeze({
    algorithm,
    input,
    steps: Object.freeze(steps),
    output: steps[steps.length - 1].items,
  });
}
