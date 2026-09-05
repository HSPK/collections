export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function observeSize(
  element: HTMLElement,
  callback: (size: CanvasSize) => void,
): () => void {
  const measure = () => {
    const { width, height } = element.getBoundingClientRect();
    if (width > 0 && height > 0) {
      callback({ width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    }
  };
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  measure();
  return () => observer.disconnect();
}

export function canvas2D(container: HTMLElement, label: string, alpha = false) {
  const canvas = document.createElement('canvas');
  canvas.className = 'experiment-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  container.append(canvas);
  const context = canvas.getContext('2d', { alpha });
  if (!context) {
    canvas.remove();
    throw new Error('Your browser could not create a 2D canvas.');
  }
  const size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  const disposeSize = observeSize(container, (next) => {
    Object.assign(size, next);
    canvas.width = Math.round(next.width * next.dpr);
    canvas.height = Math.round(next.height * next.dpr);
    context.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
    canvas.dispatchEvent(new Event('canvasresize'));
  });
  return {
    canvas,
    context,
    size,
    dispose() {
      disposeSize();
      canvas.remove();
    },
  };
}

export function pointerPosition(event: PointerEvent, canvas: HTMLElement) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}
