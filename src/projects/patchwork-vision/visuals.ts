import type { CanvasSize } from '../../core/canvas';
import { escapeMarkup } from '../../core/page';
import { BACKGROUND, COLORS, GRID_SIDE, TILE_SIZE } from './data';
import { rasterizePatch } from './engine';
import type { Patch } from './types';

export function drawMosaic(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  patches: readonly Patch[],
): void {
  const dimension = GRID_SIDE * TILE_SIZE;
  const pixels = new Uint8ClampedArray(dimension * dimension * 4);
  patches.forEach((patch, index) => {
    const source = rasterizePatch(patch);
    const column = index % GRID_SIDE;
    const row = Math.floor(index / GRID_SIDE);
    for (let y = 0; y < TILE_SIZE; y++) {
      const target = ((row * TILE_SIZE + y) * dimension + column * TILE_SIZE) * 4;
      pixels.set(source.subarray(y * TILE_SIZE * 4, (y + 1) * TILE_SIZE * 4), target);
    }
  });
  const buffer = document.createElement('canvas');
  buffer.width = dimension;
  buffer.height = dimension;
  const raster = buffer.getContext('2d');
  if (!raster) throw new Error('The pixel preview needs a 2D canvas context.');
  raster.putImageData(new ImageData(pixels, dimension, dimension), 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(buffer, 0, 0, size.width, size.height);
}

export function sceneMarkup(patches: readonly Patch[], label: string): string {
  const paths = patches.map((patch, index) => {
    const pixels = rasterizePatch(patch);
    const originX = (index % GRID_SIDE) * TILE_SIZE;
    const originY = Math.floor(index / GRID_SIDE) * TILE_SIZE;
    const color = COLORS.find((item) => item.id === patch.color);
    if (!color) throw new RangeError('Unknown preview color.');
    const runs: string[] = [];
    for (let y = 0; y < TILE_SIZE; y++) {
      let start = -1;
      for (let x = 0; x <= TILE_SIZE; x++) {
        const offset = (y * TILE_SIZE + x) * 4;
        const foreground = x < TILE_SIZE && pixels[offset] !== BACKGROUND[0];
        if (foreground && start < 0) start = x;
        if (!foreground && start >= 0) {
          runs.push(`M${originX + start} ${originY + y}h${x - start}v1h${start - x}z`);
          start = -1;
        }
      }
    }
    return `<path fill="${color.hex}" d="${runs.join('')}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${GRID_SIDE * TILE_SIZE} ${GRID_SIDE * TILE_SIZE}" role="img" aria-label="${escapeMarkup(label)}" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="rgb(${BACKGROUND.join(',')})"/>${paths}</svg>`;
}

export function number(value: number | null, digits = 3): string {
  if (value === null) return 'n/a';
  return (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits);
}
