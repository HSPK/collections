export function createLoop(
  render: (elapsed: number, delta: number) => void,
  options: { paused?: boolean } = {},
) {
  let paused = options.paused ?? false;
  let disposed = false;
  let frame = 0;
  let elapsed = 0;
  let previous = 0;

  const requestRender = () => {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(tick);
  };

  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    const delta = paused || !previous ? 0 : Math.min((now - previous) / 1000, 0.05);
    previous = now;
    elapsed += delta;
    render(elapsed, delta);
    if (!paused) requestRender();
  }

  const onVisibility = () => {
    previous = 0;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      requestRender();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  requestRender();

  return {
    requestRender,
    setPaused(value: boolean) {
      paused = value;
      previous = 0;
      requestRender();
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
