import type { Site } from './data';
import {
  constrainMapView, geographicToScreen, INITIAL_MAP_VIEW, panMapView, screenToGeographic,
  traceLandPaths, validateCoordinates, wrapLongitude, zoomMapView,
} from './geography';
import type { LandGeometry, MapView } from './geography';

interface ObserverMapOptions {
  host: HTMLElement;
  land: LandGeometry;
  signal: AbortSignal;
  onChoose: (latitude: number, longitude: number) => void;
  report: (message: string) => void;
}
export interface ObserverMap {
  setSite(site: Site): void;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  getView(): MapView;
  destroy(): void;
}
const coordinateLabel = (latitude: number, longitude: number) =>
  `${Math.abs(latitude).toFixed(4)}°${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(4)}°${longitude < 0 ? 'W' : 'E'}`;
const gridStep = (span: number, divisions: number) => [1, 2, 5, 10, 15, 30, 60, 90].find(step => step >= span / divisions) ?? 90;

export function createObserverMap({ host, land, signal, onChoose, report }: ObserverMapOptions): ObserverMap {
  signal.throwIfAborted();
  const doc = host.ownerDocument, win = doc.defaultView;
  if (!win) throw new Error('The observer map requires a document window.');
  const canvas = doc.createElement('canvas');
  canvas.dataset.hMapCanvas = '';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', 'interactive world map');
  canvas.textContent = 'Offline world map. Numeric latitude and longitude controls provide an alternative.';
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is required for the offline observer map.');
  let fill: Path2D | null = new Path2D(), coast: Path2D | null = new Path2D();
  traceLandPaths(land, fill, coast);
  const listeners = new AbortController();
  let view: MapView = { ...INITIAL_MAP_VIEW };
  let site = { latitude: 0, longitude: 0 };
  let width = 0, height = 0, dpr = 1, frame = 0, destroyed = false;
  let active: { id: number; x: number; y: number; view: MapView; dragged: boolean } | null = null;

  function describe() {
    canvas.dataset.centerLongitude = String(view.centerLongitude);
    canvas.dataset.centerLatitude = String(view.centerLatitude);
    canvas.dataset.zoom = String(view.zoom);
    canvas.dataset.latitude = String(site.latitude);
    canvas.dataset.longitude = String(site.longitude);
    canvas.setAttribute('aria-label', `World observer map, equirectangular. Observer ${coordinateLabel(site.latitude, site.longitude)}. ` +
      'Tap to choose; drag to pan. Arrow keys move 1 degree; Shift+arrows move 0.1 degree. Plus/minus zoom; 0 resets the view.');
  }

  function schedule() {
    if (!destroyed && width > 0 && height > 0 && !frame) frame = win!.requestAnimationFrame(draw);
  }

  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    if (active && (rect.width !== width || rect.height !== height)) releasePointer();
    width = rect.width; height = rect.height;
    if (width <= 0 || height <= 0) return;
    dpr = Math.max(1, Math.min(2, win!.devicePixelRatio || 1));
    const pixelsX = Math.max(1, Math.round(width * dpr)), pixelsY = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelsX || canvas.height !== pixelsY) {
      canvas.width = pixelsX; canvas.height = pixelsY;
    }
    schedule();
  }

  function updateView(next: MapView) {
    view = constrainMapView(next);
    describe(); schedule();
  }

  function draw() {
    frame = 0;
    if (destroyed || width <= 0 || height <= 0) return;
    const context = ctx!;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#0d171b';
    context.fillRect(0, 0, width, height);
    context.save();
    context.beginPath(); context.rect(0, 0, width, height); context.clip();
    const sx = width * view.zoom / 360, sy = height * view.zoom / 180;
    context.fillStyle = '#293d3e';
    context.strokeStyle = '#708283';
    context.lineWidth = .7 / Math.min(sx, sy);
    for (const offset of [-360, 0, 360]) {
      context.setTransform(dpr * sx, 0, 0, dpr * sy,
        dpr * (width / 2 + (offset - 180 - view.centerLongitude) * sx),
        dpr * (height / 2 - (90 - view.centerLatitude) * sy));
      context.fill(fill!, 'nonzero'); context.stroke(coast!);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGrid(context);
    context.fillStyle = 'rgba(13,23,27,.82)';
    context.fillRect(0, height - 19, width, 19);
    context.font = '9px ui-monospace, monospace';
    context.fillStyle = '#a9b6b4'; context.textAlign = 'left';
    context.fillText(`PLATE CARRÉE · ${Number(view.zoom.toFixed(2))}×`, 7, height - 6);
    context.textAlign = 'right';
    context.fillText('Made with Natural Earth', width - 7, height - 6);
    const marker = geographicToScreen(site.latitude, site.longitude, view, width, height);
    // Both edges represent the same date line; retain a visible marker on each at world scale.
    for (const offset of [-width * view.zoom, 0, width * view.zoom]) {
      const x = marker.x + offset, y = marker.y;
      if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
      context.strokeStyle = '#0d171b'; context.lineWidth = 4;
      context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = '#e6c58d'; context.lineWidth = 1.3;
      context.stroke();
      context.beginPath();
      context.moveTo(x - 13, y); context.lineTo(x - 8, y);
      context.moveTo(x + 8, y); context.lineTo(x + 13, y);
      context.moveTo(x, y - 13); context.lineTo(x, y - 8);
      context.moveTo(x, y + 8); context.lineTo(x, y + 13);
      context.stroke();
      context.fillStyle = '#e6c58d';
      context.beginPath(); context.arc(x, y, 1.8, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }

  function drawGrid(context: CanvasRenderingContext2D) {
    const longitudeSpan = 360 / view.zoom, latitudeSpan = 180 / view.zoom;
    const west = view.centerLongitude - longitudeSpan / 2, north = view.centerLatitude + latitudeSpan / 2;
    const lonStep = gridStep(longitudeSpan, Math.max(3, width / 65));
    const latStep = gridStep(latitudeSpan, Math.max(2, height / 50));
    context.save();
    context.strokeStyle = '#708283'; context.globalAlpha = .35; context.lineWidth = .6;
    context.setLineDash([2, 4]);
    context.font = '9px ui-monospace, monospace';
    context.fillStyle = '#e6c58d';
    for (let longitude = Math.ceil(west / lonStep) * lonStep; longitude <= west + longitudeSpan; longitude += lonStep) {
      const x = (longitude - west) / longitudeSpan * width;
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      if (x > 22 && x < width - 22) {
        const label = wrapLongitude(longitude);
        context.textAlign = 'center'; context.globalAlpha = .8;
        context.fillText(`${Math.abs(label)}°${Math.abs(label) === 180 || label === 0 ? '' : label < 0 ? 'W' : 'E'}`, x, 12);
        context.globalAlpha = .35;
      }
    }
    for (let latitude = Math.ceil((north - latitudeSpan) / latStep) * latStep; latitude <= north; latitude += latStep) {
      const y = (north - latitude) / latitudeSpan * height;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      if (y > 24 && y < height - 25) {
        context.textAlign = 'left'; context.globalAlpha = .8;
        context.fillText(`${Math.abs(latitude)}°${latitude === 0 ? '' : latitude < 0 ? 'S' : 'N'}`, 5, y - 4);
        context.globalAlpha = .35;
      }
    }
    context.restore();
  }

  function ensureVisible() {
    const marker = geographicToScreen(site.latitude, site.longitude, view, 1, 1);
    if (marker.x < 0 || marker.x > 1 || marker.y < 0 || marker.y > 1)
      view = constrainMapView({ ...view, centerLatitude: site.latitude, centerLongitude: site.longitude });
  }

  function choose(latitude: number, longitude: number) {
    validateCoordinates(latitude, longitude);
    site = { latitude, longitude };
    ensureVisible(); describe(); schedule();
    onChoose(latitude, longitude);
    report(`Observer selected: ${coordinateLabel(latitude, longitude)}.`);
  }

  function releasePointer() {
    if (!active) return;
    const id = active.id;
    active = null;
    canvas.style.cursor = 'crosshair';
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function point(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function movePointer(event: PointerEvent) {
    if (!active || event.pointerId !== active.id) return;
    const p = point(event), dx = p.x - active.x, dy = p.y - active.y;
    if (Math.hypot(dx, dy) >= 5) active.dragged = true;
    if (active.dragged) {
      canvas.style.cursor = 'grabbing';
      updateView(panMapView(active.view, dx, dy, width, height));
    }
  }

  function zoom(factor: number, x = width / 2, y = height / 2) {
    if (destroyed) return;
    releasePointer();
    // External zoom controls also work while the tab/dialog is hidden.
    updateView(zoomMapView(view, factor, width > 0 ? x : .5, height > 0 ? y : .5,
      width > 0 ? width : 1, height > 0 ? height : 1));
  }

  canvas.addEventListener('pointerdown', event => {
    if (active || event.button !== 0 || !event.isPrimary) return;
    resize();
    if (width <= 0 || height <= 0) return;
    const p = point(event);
    canvas.focus({ preventScroll: true });
    active = { id: event.pointerId, x: p.x, y: p.y, view: { ...view }, dragged: false };
    try { canvas.setPointerCapture(event.pointerId); }
    catch {
      active = null;
      report('Map pointer capture is unavailable; use the keyboard or numeric coordinates.');
    }
  }, { signal: listeners.signal });
  canvas.addEventListener('pointermove', movePointer, { signal: listeners.signal });
  canvas.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.id) return;
    movePointer(event);
    const dragged = active.dragged, p = point(event);
    releasePointer();
    if (!dragged) {
      try {
        const selected = screenToGeographic(p.x, p.y, view, width, height);
        choose(selected.latitude, selected.longitude);
      } catch (error) { report(error instanceof Error ? error.message : 'Unable to choose map coordinates.'); }
    }
  }, { signal: listeners.signal });
  canvas.addEventListener('pointercancel', event => {
    if (event.pointerId === active?.id) releasePointer();
  }, { signal: listeners.signal });
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === active?.id) releasePointer();
  }, { signal: listeners.signal });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (active || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    resize();
    if (width <= 0 || height <= 0) return;
    const p = point(event);
    zoom(event.deltaY < 0 ? 1.25 : .8, Math.max(0, Math.min(width, p.x)), Math.max(0, Math.min(height, p.y)));
  }, { passive: false, signal: listeners.signal });
  canvas.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? .1 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step],
    };
    if (delta[event.key]) {
      event.preventDefault(); releasePointer();
      choose(Math.max(-90, Math.min(90, site.latitude + delta[event.key][0])), wrapLongitude(site.longitude + delta[event.key][1]));
    } else if (['+', '=', '-', '_', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') reset(); else zoom(event.key === '+' || event.key === '=' ? 2 : .5);
    }
  }, { signal: listeners.signal });

  function reset() {
    if (destroyed) return;
    releasePointer(); updateView({ ...INITIAL_MAP_VIEW });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    listeners.abort(); releasePointer();
    observer.disconnect();
    if (frame) win!.cancelAnimationFrame(frame);
    frame = 0;
    signal.removeEventListener('abort', destroy);
    fill = null; coast = null;
    canvas.width = 1; canvas.height = 1;
    canvas.remove();
  }

  const observer = new ResizeObserver(resize);
  host.append(canvas);
  observer.observe(host);
  observer.observe(canvas);
  win.addEventListener('resize', resize, { signal: listeners.signal });
  signal.addEventListener('abort', destroy, { once: true });
  describe(); resize();
  return {
    setSite(next) {
      if (destroyed) return;
      try { validateCoordinates(next.latitude, next.longitude); }
      catch (error) { report(error instanceof Error ? error.message : 'Invalid observer coordinates.'); return; }
      site = { latitude: next.latitude, longitude: next.longitude };
      ensureVisible(); describe(); schedule();
    },
    zoomIn: () => zoom(2), zoomOut: () => zoom(.5), reset,
    getView: () => ({ ...view }), destroy,
  };
}
