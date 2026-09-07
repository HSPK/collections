import { traceLandPaths } from './geography';
import type { LandGeometry } from './geography';

/**
 * Generalized Natural Earth geography on a mean-radius display sphere, not surveyed
 * terrain or the geodetic ellipsoid used for the physical observer calculation.
 * Canvas north is up: u=(lon+180)/360, canvas y=(90-lat)/180. THREE's CanvasTexture
 * flipY makes shader v=asin(normal.y)/PI+.5 agree with this same picker convention.
 */
export function earthAtlas(land: LandGeometry): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is required for the offline Earth geography.');
  ctx.fillStyle = '#163b51';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const fill = new Path2D(), coast = new Path2D();
  traceLandPaths(land, fill, coast);
  ctx.fillStyle = '#699c89';
  ctx.strokeStyle = '#9dbba0';
  ctx.lineWidth = .65 * 360 / canvas.width;
  for (const offset of [-360, 0, 360]) {
    ctx.setTransform(canvas.width / 360, 0, 0, canvas.height / 180, offset * canvas.width / 360, 0);
    ctx.fill(fill, 'nonzero');
    ctx.stroke(coast);
  }
  ctx.resetTransform();
  return canvas;
}
