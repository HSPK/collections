import type { ExperimentContext } from '../core/types';

export function interactionScope(context: ExperimentContext) {
  context.signal.throwIfAborted();
  const events = new AbortController();
  const disposers: (() => void)[] = [];
  let destroyed = false;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    events.abort();
    context.signal.removeEventListener('abort', destroy);
    for (let index = disposers.length - 1; index >= 0; index--) disposers[index]();
    disposers.length = 0;
  }

  context.signal.addEventListener('abort', destroy, { once: true });

  return {
    signal: events.signal,
    destroy,
    disposeWith(dispose: () => void) {
      disposers.push(dispose);
    },
    ownControl<T extends HTMLElement>(element: T): T {
      const node = element.closest('.control') ?? element;
      disposers.push(() => node.remove());
      return element;
    },
  };
}

export function setRangeValue(input: HTMLInputElement, value: number) {
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
}
