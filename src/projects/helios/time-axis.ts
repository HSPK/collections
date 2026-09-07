import { query } from '../../core/page';
import { clamp } from './math';
import { utcInput } from './time';
import { axisLabel, timeAtFraction, timeFraction, timelineWindow, TIME_SPANS } from './timeline';
import type { TimeSpan } from './timeline';

interface AxisOptions {
  host: HTMLElement;
  signal: AbortSignal;
  time: number;
  baseline: number;
  isLive(): boolean;
  onSeek(time: number, phase: 'start' | 'move' | 'finish'): void;
  report(message: string): void;
}
export function createTimeAxis({ host, signal, time: initialTime, baseline, isLive, onSeek, report }: AxisOptions) {
  signal.throwIfAborted();
  const listeners = new AbortController();
  const axis = query<HTMLElement>(host, '[data-h-time-axis]');
  const cursor = query<HTMLElement>(host, '[data-h-time-cursor]');
  const ticks = query<HTMLElement>(host, '[data-h-time-ticks]');
  const startLabel = query<HTMLElement>(host, '[data-h-axis-start]');
  const endLabel = query<HTMLElement>(host, '[data-h-axis-end]');
  const historical = query<HTMLButtonElement>(host, '[data-h-axis-history]');
  const nowMarker = query<HTMLElement>(host, '[data-h-axis-now]');
  let time = initialTime, span: TimeSpan = '6h', window = timelineWindow(time, span);
  let pointer: { id: number; window: typeof window } | null = null;
  let pending: number | null = null, timer = 0, closed = false;
  let tickKey = '', liveMode = isLive();

  function draw() {
    const ratio = clamp(timeFraction(time, window), 0, 1);
    cursor.style.left = `${ratio * 100}%`;
    axis.setAttribute('aria-valuemin', String(window.start)); axis.setAttribute('aria-valuemax', String(window.end));
    axis.setAttribute('aria-valuenow', String(time)); axis.setAttribute('aria-valuetext', `${utcInput(time)} UTC`);
    axis.dataset.start = String(window.start); axis.dataset.end = String(window.end);
    startLabel.textContent = utcInput(window.start).slice(0, 16).replace('T', ' ');
    endLabel.textContent = utcInput(window.end).slice(0, 16).replace('T', ' ');
    startLabel.title = `${utcInput(window.start)} UTC`;
    endLabel.title = `${utcInput(window.end)} UTC`;
    const count = axis.clientWidth < 500 ? 3 : 5;
    const nextTickKey = `${window.start}:${window.end}:${span}:${count}`;
    if (nextTickKey !== tickKey) {
      ticks.replaceChildren();
      for (let i = 0; i <= count; i++) {
        const tick = document.createElement('span');
        tick.style.left = `${i / count * 100}%`;
        tick.textContent = axisLabel(timeAtFraction(i / count, window), span);
        ticks.append(tick);
      }
      tickKey = nextTickKey;
    }
    const historicRatio = timeFraction(baseline, window);
    historical.hidden = historicRatio < 0 || historicRatio > 1;
    const anchorX = clamp(historicRatio, 0, 1) * axis.clientWidth;
    const halfLabel = historical.offsetWidth / 2;
    const labelX = clamp(anchorX, halfLabel + 4, Math.max(halfLabel + 4, axis.clientWidth - halfLabel - 4));
    historical.style.left = `${axis.offsetLeft + axis.clientLeft + labelX}px`;
    historical.style.setProperty('--h-anchor-offset', `${anchorX - labelX}px`);
    const now = Date.now();
    liveMode = isLive();
    const liveRatio = (now - window.start) / (window.end - window.start);
    nowMarker.hidden = !liveMode || !Number.isFinite(liveRatio) || liveRatio < 0 || liveRatio > 1;
    nowMarker.style.left = `${clamp(liveRatio, 0, 1) * 100}%`;
  }
  function position(event: PointerEvent) {
    const rect = axis.getBoundingClientRect();
    if (rect.width <= 0) throw new Error('The UTC timeline has no usable width.');
    return timeAtFraction((event.clientX - rect.left) / rect.width, pointer?.window ?? window);
  }
  function flush() {
    clearTimeout(timer); timer = 0;
    if (pending !== null) { const value = pending; pending = null; onSeek(value, 'move'); }
  }
  function cancelGesture() {
    if (!pointer) return;
    const id = pointer.id; pointer = null;
    flush();
    if (axis.hasPointerCapture(id)) axis.releasePointerCapture(id);
    onSeek(time, 'finish');
  }
  function cancel() {
    clearTimeout(timer); timer = 0; pending = null;
    const id = pointer?.id; pointer = null;
    if (id !== undefined && axis.hasPointerCapture(id)) axis.releasePointerCapture(id);
  }
  axis.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0) return;
    event.preventDefault(); axis.focus({ preventScroll: true });
    pointer = { id: event.pointerId, window: { ...window } };
    axis.setPointerCapture(event.pointerId);
    onSeek(position(event), 'start');
  }, { signal: listeners.signal });
  axis.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    pending = position(event);
    if (!timer) timer = windowSetTimeout(flush, 80);
  }, { signal: listeners.signal });
  axis.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    pending = position(event); flush(); cancelGesture();
  }, { signal: listeners.signal });
  axis.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) cancelGesture(); }, { signal: listeners.signal });
  axis.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) cancelGesture(); }, { signal: listeners.signal });
  axis.addEventListener('keydown', event => {
    const amount = (window.end - window.start) / (event.shiftKey ? 100 : 1000);
    const candidate = event.key === 'ArrowLeft' ? time - amount : event.key === 'ArrowRight' ? time + amount :
      event.key === 'PageUp' ? time + (window.end - window.start) / 10 :
      event.key === 'PageDown' ? time - (window.end - window.start) / 10 :
      event.key === 'Home' ? window.start : event.key === 'End' ? window.end : null;
    if (candidate === null) return;
    event.preventDefault();
    cancel();
    onSeek(clamp(Math.round(candidate), window.start, window.end), 'start');
    onSeek(time, 'finish');
  }, { signal: listeners.signal });
  historical.addEventListener('click', () => { cancel(); onSeek(baseline, 'start'); onSeek(baseline, 'finish'); }, { signal: listeners.signal });
  const resize = new ResizeObserver(() => { if (!closed) { if (pointer) cancelGesture(); draw(); } });
  resize.observe(axis); draw();
  // The interval field is named window; keep the browser timer explicit.
  function windowSetTimeout(callback: () => void, ms: number) { return globalThis.window.setTimeout(callback, ms); }
  function destroy() {
    if (closed) return;
    closed = true; listeners.abort(); cancel(); resize.disconnect();
  }
  signal.addEventListener('abort', destroy, { once: true, signal: listeners.signal });
  return {
    setTime(value: number, center = false) {
      if (value === time && !center && isLive() === liveMode) return;
      time = value;
      if (!pointer && (center || timeFraction(time, window) < 0 || timeFraction(time, window) > 1))
        window = timelineWindow(time, span);
      draw();
    },
    setSpan(value: string) {
      const next = TIME_SPANS.find(item => item.id === value);
      if (!next) throw new Error('Unsupported timeline span.');
      cancelGesture(); span = next.id; window = timelineWindow(time, span); draw();
      report(`UTC timeline spans ${next.label}. Arrow keys move 1/1000 of the interval; Shift moves 1/100.`);
    },
    reset(value: number) { cancelGesture(); span = '6h'; time = value; window = timelineWindow(value, span); draw(); },
    cancel,
    destroy,
  };
}
