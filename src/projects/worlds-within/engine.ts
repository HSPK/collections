import { clamp } from '../../core/math';

export interface Point { x: number; y: number }
export interface Viewport { width: number; height: number }
export interface Camera extends Point { zoom: number }
export interface Portal extends Point { width: number; height: number }
export interface Journey { camera: Camera; depth: number }

export const WORLD = { width: 1000, height: 700 };
export const MAX_DEPTH = 24;

export function baseScale(viewport: Viewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) throw new RangeError('The atlas needs a positive viewport.');
  return Math.min(viewport.width / WORLD.width, viewport.height / WORLD.height);
}

export function overview(viewport: Viewport, nested = false): Camera {
  const cover = Math.max(viewport.width / WORLD.width, viewport.height / WORLD.height) / baseScale(viewport);
  return { x: WORLD.width / 2, y: WORLD.height / 2, zoom: nested ? cover * 1.035 : 0.96 };
}

export function worldPoint(camera: Camera, point: Point, viewport: Viewport): Point {
  const scale = baseScale(viewport) * camera.zoom;
  return { x: camera.x + (point.x - viewport.width / 2) / scale, y: camera.y + (point.y - viewport.height / 2) / scale };
}

export function screenPoint(camera: Camera, point: Point, viewport: Viewport): Point {
  const scale = baseScale(viewport) * camera.zoom;
  return { x: (point.x - camera.x) * scale + viewport.width / 2, y: (point.y - camera.y) * scale + viewport.height / 2 };
}

export function zoomAt(camera: Camera, factor: number, anchor: Point, viewport: Viewport, minimum = 0.04): Camera {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('Zoom must be finite and positive.');
  const focus = worldPoint(camera, anchor, viewport);
  const zoom = clamp(camera.zoom * factor, minimum, 64);
  const scale = baseScale(viewport) * zoom;
  return {
    x: focus.x - (anchor.x - viewport.width / 2) / scale,
    y: focus.y - (anchor.y - viewport.height / 2) / scale,
    zoom,
  };
}

export function panBy(camera: Camera, movement: Point, viewport: Viewport): Camera {
  const scale = baseScale(viewport) * camera.zoom;
  return { ...camera, x: camera.x - movement.x / scale, y: camera.y - movement.y / scale };
}

export function enterFrame(camera: Camera, portal: Portal): Camera {
  const scale = portal.width / WORLD.width;
  return { x: (camera.x - portal.x) / scale, y: (camera.y - portal.y) / scale, zoom: camera.zoom * scale };
}

export function leaveFrame(camera: Camera, portal: Portal): Camera {
  const scale = portal.width / WORLD.width;
  return { x: portal.x + camera.x * scale, y: portal.y + camera.y * scale, zoom: camera.zoom / scale };
}

export function containsView(camera: Camera, portal: Portal, viewport: Viewport): boolean {
  const first = worldPoint(camera, { x: 0, y: 0 }, viewport);
  const last = worldPoint(camera, { x: viewport.width, y: viewport.height }, viewport);
  return first.x >= portal.x && first.y >= portal.y
    && last.x <= portal.x + portal.width && last.y <= portal.y + portal.height;
}

export function portalCamera(portal: Portal, viewport: Viewport): Camera {
  const zoom = Math.max(viewport.width / portal.width, viewport.height / portal.height) / baseScale(viewport) * 1.035;
  return { x: portal.x + portal.width / 2, y: portal.y + portal.height / 2, zoom };
}

// Re-express the same view in a nearby coordinate frame before values get large.
export function settleJourney(journey: Journey, portals: readonly Portal[], viewport: Viewport): Journey {
  if (!portals.length) throw new RangeError('The atlas needs a portal cycle.');
  let { camera, depth } = journey;
  while (depth > 0 && !containsView(camera, { x: 0, y: 0, ...WORLD }, viewport)) {
    depth -= 1;
    camera = leaveFrame(camera, portals[depth % portals.length]);
  }
  while (depth < MAX_DEPTH && containsView(camera, portals[depth % portals.length], viewport)) {
    camera = enterFrame(camera, portals[depth % portals.length]);
    depth += 1;
  }
  if (depth === 0) {
    camera = { ...camera, x: clamp(camera.x, -250, 1250), y: clamp(camera.y, -175, 875) };
  }
  return { camera, depth };
}

export function interpolateCamera(from: Camera, to: Camera, fraction: number): Camera {
  const eased = 1 - (1 - clamp(fraction, 0, 1)) ** 3;
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * eased),
  };
}
